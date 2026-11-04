import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'

import type { ApiResult } from './types'
import { i18n, getCurrentLocale } from '@/locales'
import { clearSession, clearCsrf, getCsrfToken, getCsrfHeader, setCsrfToken } from '@/utils/auth'

/** 业务请求配置：在 Axios 配置上扩展自定义开关 */
export interface RequestConfig extends AxiosRequestConfig {
  /** 调用方传入时复用，用于同一命令重试 */
  idempotencyKey?: string
  /** 关闭 GET 请求自动注入的 locale 查询参数（文件下载等接口使用） */
  skipLocale?: boolean
  /** 关闭非 GET 请求自动注入的 Idempotency-Key（后端未声明该头的接口使用） */
  skipIdempotency?: boolean
  /** 跳过全局错误提示与登录失效处理，由调用方自行处理 */
  skipErrorHandler?: boolean
  /** 页面自行提示并恢复的业务码 */
  handledErrorCodes?: string[]
}

/** 后端成功码（响应壳 code 为字符串枚举，非 0/200） */
const SUCCESS_CODE = 'OK'
/** 视为登录失效的业务码，统一走会话重置 */
const UNAUTHORIZED_CODES = ['UNAUTHENTICATED']
/** 交由调用方自行处理的业务码：不弹提示、也不按登录失效处理（如删除用户组需二次验证） */
const DEFERRED_CODES = ['EXTERNAL_REFERENCE_BLOCKED']

/** 带 notified 标记的错误：拦截器已弹过提示，调用方无需重复提示 */
export interface NotifiedError extends Error {
  notified?: boolean
  code?: string
  status?: number
  params?: Record<string, unknown>
  request_id?: string
  retryAfter?: number
}

function businessMessage(code?: string, config?: RequestConfig): string {
  if (code === 'VALIDATION_FAILED' && config?.url !== '/auth/change-password')
    return i18n.global.t('requestErrors.VALIDATION_FAILED')
  for (const group of ['authErrors', 'roleErrors']) {
    const key = `${group}.${code}`
    if (code && i18n.global.te(key)) return i18n.global.t(key)
  }
  return i18n.global.t('authErrors.fallback')
}
const retryUntil = new Map<string, number>()
async function rejectResponse(response?: AxiosResponse, config?: RequestConfig): Promise<never> {
  const body =
    response?.data && typeof response.data === 'object'
      ? (response.data as Partial<ApiResult>)
      : undefined
  const code = body?.code
  const status = response?.status
  const error: NotifiedError = new Error(businessMessage(code, config))
  Object.assign(error, { code, status, params: body?.params, request_id: body?.request_id })
  const retry = response?.headers['retry-after']
  if (status === 429 || status === 503) {
    const seconds = retry
      ? /^\d+$/.test(String(retry))
        ? Number(retry)
        : Math.max(0, (Date.parse(String(retry)) - Date.now()) / 1000)
      : 0
    error.retryAfter = seconds
    if (seconds > 0) retryUntil.set(config?.url ?? '', Date.now() + seconds * 1000)
  }
  if (config?.skipErrorHandler || (code && config?.handledErrorCodes?.includes(code))) throw error
  if (status === 401 && UNAUTHORIZED_CODES.includes(code ?? '')) {
    await handleUnauthorized()
    error.notified = true
    throw error
  }
  if (
    status === 403 &&
    ['CSRF_INVALID', 'PASSWORD_CHANGE_REQUIRED', 'TERMS_ACCEPTANCE_REQUIRED'].includes(code ?? '')
  ) {
    clearCsrf()
    const { useUserStore } = await import('@/stores/modules/user')
    const user = useUserStore()
    try {
      await user.loadContext()
    } catch (refreshError) {
      if ((refreshError as NotifiedError).code === 'UNAUTHENTICATED') await handleUnauthorized()
    }
  }
  if (status === 403 && code === 'FORBIDDEN') {
    const { useUserStore } = await import('@/stores/modules/user')
    const user = useUserStore()
    user.loaded = false
    try {
      await user.fetchUserInfo()
      const { usePermissionStore } = await import('@/stores/modules/permission')
      usePermissionStore().reset()
    } catch {
      /* Preserve the original forbidden response. */
    }
  }
  if (code && (DEFERRED_CODES.includes(code) || config?.handledErrorCodes?.includes(code)))
    throw error
  MessagePlugin.error(error.message)
  error.notified = true
  throw error
}

/** 登录失效：清理本地会话并跳登录页，reload 以卸载已动态注册的路由 */
let redirecting = false
async function handleUnauthorized(): Promise<void> {
  if (redirecting) return
  redirecting = true
  clearSession()
  const { useUserStore } = await import('@/stores/modules/user')
  useUserStore().reset()

  const { pathname, search, hash } = window.location
  // hash 路由：当前业务路径在 hash 内，取其作为 redirect 便于登录后回跳
  const current = hash.replace(/^#/, '') || '/'
  const target = `${pathname}${search}#/login?redirect=${encodeURIComponent(current)}`
  window.location.href = target
  window.location.reload()
}

const instance: AxiosInstance = axios.create({
  baseURL: `${import.meta.env.VITE_API_PREFIX}/v1`,
  timeout: 20000,
  // 真实后端为 HttpOnly Cookie 会话，跨源代理场景也必须携带 Cookie
  withCredentials: true,
})

/** 幂等键：变更类请求重复提交时后端据此去重（同一次提交重试应复用，当前无自动重试） */
export function createIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return (
    uuid ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const n = Math.floor(Math.random() * 16)
      return (c === 'x' ? n : (n & 3) | 8).toString(16)
    })
  )
}

instance.interceptors.request.use(async (config) => {
  const until = retryUntil.get(config.url ?? '') ?? 0
  if (until > Date.now()) {
    const error: NotifiedError = new Error(businessMessage('RATE_LIMITED'))
    error.status = 429
    error.code = 'RATE_LIMITED'
    MessagePlugin.error(error.message)
    error.notified = true
    throw error
  }
  const method = (config.method ?? 'get').toUpperCase()
  const locale = getCurrentLocale()

  // 国际化：后端按 Accept-Language 解析 display_name 等本地化字段
  config.headers['Accept-Language'] = locale
  // 国际化入参：读接口统一追加 locale（调用方可传 skipLocale 关闭）
  if (method === 'GET' && !(config as RequestConfig).skipLocale) {
    const params =
      config.params &&
      typeof config.params === 'object' &&
      !(config.params instanceof URLSearchParams)
        ? config.params
        : {}
    config.params = { locale, ...params }
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const login = config.url === '/auth/login'
    if (!login && !getCsrfToken()) {
      const { getAuthContextApi } = await import('./modules/auth')
      try {
        const context = await getAuthContextApi()
        setCsrfToken(context.csrf_token, context.csrf_header)
      } catch (error) {
        if ((error as NotifiedError).code === 'UNAUTHENTICATED') await handleUnauthorized()
        throw error
      }
    }
    if (!login) config.headers[getCsrfHeader()] = getCsrfToken()
    const onboarding = config.url?.startsWith('/auth/') || config.url === '/terms/accept'
    const termsPreview = method === 'POST' && config.url === '/terms/preview'
    const key = (config as RequestConfig).idempotencyKey
    if (key) config.headers.set('Idempotency-Key', key)
    else if (
      !onboarding &&
      !termsPreview &&
      !(config as RequestConfig).skipIdempotency &&
      !config.headers.get('Idempotency-Key')
    ) {
      config.headers.set('Idempotency-Key', createIdempotencyKey())
    }
  }
  return config
})

async function parseBinaryJson(response?: AxiosResponse): Promise<void> {
  if (
    !response ||
    !/\b(?:application\/json|application\/[\w.+-]+\+json)\b/i.test(
      String(response.headers['content-type'] ?? ''),
    )
  )
    return
  const data = response.data
  if (!(data instanceof Blob) && !(data instanceof ArrayBuffer)) return
  try {
    response.data = JSON.parse(
      data instanceof Blob ? await data.text() : new TextDecoder().decode(data),
    )
  } catch {
    // Preserve malformed binary responses for the normal error path.
  }
}

instance.interceptors.response.use(
  async (response: AxiosResponse) => {
    await parseBinaryJson(response)
    // 文件下载等二进制响应没有响应壳，直接放行
    const data = response.data
    if (data instanceof Blob || data instanceof ArrayBuffer) {
      return response
    }

    const result = data as ApiResult | null
    if (
      result &&
      typeof result === 'object' &&
      typeof result.code === 'string' &&
      'data' in result &&
      result.params &&
      typeof result.params === 'object' &&
      !Array.isArray(result.params) &&
      typeof result.request_id === 'string' &&
      result.code === SUCCESS_CODE
    ) {
      response.data = result.data
      return response
    }
    return rejectResponse(response, response.config as RequestConfig)
  },
  async (error) => {
    if (axios.isCancel(error)) return Promise.reject(error)
    await parseBinaryJson(error.response)
    if (error.notified || (error.code && !error.isAxiosError)) return Promise.reject(error)
    return rejectResponse(error.response, error.config)
  },
)

/**
 * 业务请求封装：泛型 T 为拆壳后的 data 类型。
 * 拦截器已把 response.data 替换为 data 字段，这里再取出返回。
 */
async function unwrap<T>(promise: Promise<AxiosResponse>): Promise<T> {
  const response = await promise
  return response.data as T
}

export const request = {
  get<T>(url: string, config?: RequestConfig): Promise<T> {
    return unwrap<T>(instance.get(url, config))
  },
  post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return unwrap<T>(instance.post(url, data, config))
  },
  put<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return unwrap<T>(instance.put(url, data, config))
  },
  patch<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return unwrap<T>(instance.patch(url, data, config))
  },
  delete<T>(url: string, config?: RequestConfig): Promise<T> {
    return unwrap<T>(instance.delete(url, config))
  },
}

/** 需要拿到原始 AxiosResponse 的场景（文件下载读取响应头） */
export const rawRequest = instance

export default request
