import type { MockMethod, RespThisType } from 'vite-plugin-mock'
import { randomBytes, createHash } from 'node:crypto'

export type { MockMethod }

/** 与真实后端一致的响应壳：code 为字符串枚举，'OK' 表示成功 */
export const SUCCESS_CODE = 'OK'

export function mockId(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function requestId(): string {
  return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function success<T>(data: T, message = '') {
  void message
  return { code: SUCCESS_CODE, data, params: {}, request_id: requestId() }
}

export function fail(code: string, message: string, params: Record<string, unknown> = {}) {
  void message
  return { code, data: null, params, request_id: requestId() }
}

/** 登录失效：前端拦截器据此清理会话并跳登录 */
export function unauthorized() {
  return fail('UNAUTHENTICATED', '未登录或会话已失效，请重新登录')
}

/**
 * Mock 模式下签发的有效 token 集合。
 * vite-plugin-mock 会把每个 mock 文件单独打包，模块级变量不共享，
 * 故挂到 globalThis 上，保证 auth.ts 签发的 token 在 identity.ts 中同样有效。
 */
const tokenStore = globalThis as typeof globalThis & {
  __aisMockTokens?: Set<string>
  __aisMockUsernames?: Map<string, string>
}
const validTokens = (tokenStore.__aisMockTokens ??= new Set<string>())

const tokenUsernames = (tokenStore.__aisMockUsernames ??= new Map<string, string>())

export function issueToken(username: string): string {
  const token = randomBytes(32).toString('base64url')
  validTokens.add(token)
  tokenUsernames.set(token, username)
  return token
}

export function revokeAllTokens(): void {
  validTokens.clear()
  tokenUsernames.clear()
  csrfTokens.clear()
}

/** vite-plugin-mock 传入的请求对象（仅声明本文件用到的字段） */
export interface MockRequest {
  url?: string
  headers?: Record<string, unknown>
  query?: Record<string, string | string[] | undefined>
  body?: Record<string, unknown>
}

function sessionToken(req: MockRequest): string {
  const cookie = String(req.headers?.cookie ?? '')
  return (
    cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('ais_session_dev='))
      ?.slice('ais_session_dev='.length) ?? ''
  )
}
export function checkToken(req: MockRequest): boolean {
  return validTokens.has(sessionToken(req))
}
const csrfStore = globalThis as typeof globalThis & { __aisMockCsrf?: Map<string, string> }
const csrfTokens = (csrfStore.__aisMockCsrf ??= new Map<string, string>())
export function mockCsrf(req: MockRequest): string {
  const token = sessionToken(req)
  if (!csrfTokens.has(token)) csrfTokens.set(token, randomBytes(32).toString('base64url'))
  return csrfTokens.get(token)!
}
export function checkCsrf(req: MockRequest): boolean {
  return checkToken(req) && req.headers?.['x-csrf-token'] === mockCsrf(req)
}
export function mockCookie(res: RespThisType['res'], username?: string): string {
  const token = username ? issueToken(username) : ''
  res.setHeader(
    'Set-Cookie',
    username
      ? `ais_session_dev=${token}; Path=/; HttpOnly; SameSite=Lax`
      : 'ais_session_dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  )
  return token
}
const gateStore = globalThis as typeof globalThis & {
  __aisMockNeedsPassword?: boolean
  __aisMockFullSessions?: Set<string>
}
const fullSessions = (gateStore.__aisMockFullSessions ??= new Set<string>())
export function setMockPasswordRequired(value: boolean) {
  gateStore.__aisMockNeedsPassword = value
}
export function mockPasswordRequired() {
  return gateStore.__aisMockNeedsPassword === true
}
export function upgradeMockSession(req: MockRequest, res: RespThisType['res']): MockRequest {
  if (fullSessions.has(sessionToken(req))) return req
  const username = usernameFromToken(req)
  if (!username) return req
  validTokens.delete(sessionToken(req))
  tokenUsernames.delete(sessionToken(req))
  csrfTokens.delete(sessionToken(req))
  const token = mockCookie(res, username)
  fullSessions.add(token)
  return { ...req, headers: { ...req.headers, cookie: `ais_session_dev=${token}` } }
}
/** Preserve real HTTP errors for the authentication contract. */
export function authMock(methods: MockMethod[]): MockMethod[] {
  return methods.map((method) => {
    const handler = method.response
    return {
      ...method,
      response: function (this: RespThisType, req: MockRequest) {
        const result = handler.call(this, req)
        const code = result.code
        this.res.statusCode =
          code === 'OK'
            ? 200
            : ['UNAUTHENTICATED', 'AUTHENTICATION_FAILED'].includes(code)
              ? 401
              : code === 'MALFORMED_REQUEST'
                ? 400
                : ['VALIDATION_FAILED', 'PASSWORD_REUSED'].includes(code)
                  ? 422
                  : code.endsWith('_CHANGED')
                    ? 409
                    : code === 'RATE_LIMITED'
                      ? 429
                      : code === 'AUTHENTICATION_BUSY'
                        ? 503
                        : 403
        return result
      },
    }
  })
}

/** 取 restful 路径末段 id（mock 未注入 params，统一从 url 解析） */
export function pathId(req: MockRequest): string {
  const path = (req.url ?? '').split('?')[0]
  return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
}

/** 根据 Bearer token 查找当前模拟会话用户名。 */
export function usernameFromToken(req: MockRequest): string | null {
  return tokenUsernames.get(sessionToken(req)) ?? null
}
