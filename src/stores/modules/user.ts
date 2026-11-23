import { defineStore } from 'pinia'
import { MessagePlugin } from 'tdesign-vue-next'
import type { NotifiedError } from '@/api/request'
import { useTermsStore } from './terms'
import { useLocaleOptionsStore } from './localeOptions'

import {
  getAuthContextApi,
  getPermissionsApi,
  loginApi,
  logoutApi,
  type AuthContext,
  type Capability,
  type LoginParams,
  type PermissionsResult,
} from '@/api/modules/auth'
import { validatePermissions } from '@/router/navigation'
import { getCurrentLocale, i18n, normalizeLocale, setLocale, setApiLocale } from '@/locales'
import { usePermissionStore } from './permission'
import { clearSession, clearCsrf, setCsrfToken } from '@/utils/auth'
import { setCostMockActor } from '@/api/mock/cost'
import { setSecurityMockActor } from '@/api/mock/security'

export interface UserInfo {
  id: string
  username: string
  name: string
  avatar?: string
  roles: string[]
  /** 由后端 capabilities 推导的资源读写权限码 */
  permissions: string[]
}

interface UserState {
  context: Partial<Omit<AuthContext, 'csrf_token'>>
  contextLoaded: boolean
  userInfo: UserInfo | null
  /** 用户信息是否已拉取（路由守卫据此决定是否重新拉取） */
  loaded: boolean
  permissionSnapshot: PermissionsResult | null
  permissionsReady: boolean
  permissionsLoading: boolean
  permissionEpoch: number
  permissionError: string
  loggedOut: boolean
}

/**
 * 由后端 capabilities 推导前端权限码：
 * - can_read  → resource_code（页面/菜单级）
 * - can_write → resource_code:write（按钮/操作级）
 */
function derivePermissions(capabilities: Capability[]): string[] {
  const codes: string[] = []
  for (const capability of capabilities) {
    if (capability.can_read) codes.push(capability.resource_code)
    if (capability.can_write) codes.push(`${capability.resource_code}:write`)
  }
  return codes
}
let permissionRequest: { key: string; promise: Promise<void> } | undefined
let contextRequest: Promise<void> | undefined
let contextEpoch = 0

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    context: {},
    contextLoaded: false,
    userInfo: null,
    loaded: false,
    permissionSnapshot: null,
    permissionsReady: false,
    permissionsLoading: false,
    permissionEpoch: 0,
    permissionError: '',
    loggedOut: false,
  }),
  getters: {
    mustChangePassword: (state) => state.context.session?.gate === 'NEEDS_PASSWORD',
    termsConfirmationRequired: (state): boolean | undefined =>
      state.context.terms_confirmation_required,
    permissions: (state) => (state.permissionsReady ? (state.userInfo?.permissions ?? []) : []),
  },
  actions: {
    async login(params: LoginParams) {
      this.reset()
      this.loggedOut = false
      try {
        await loginApi(params)
      } catch (error) {
        if ((error as { status?: number }).status) throw error
        await this.loadContext()
        return
      }
      await this.loadContext()
    },
    async loadContext() {
      if (contextRequest) return contextRequest
      const pending = this.fetchContext()
      contextRequest = pending
      try {
        await pending
      } finally {
        if (contextRequest === pending) contextRequest = undefined
      }
    },
    async fetchContext() {
      const epoch = ++contextEpoch
      this.invalidatePermissions()
      this.contextLoaded = false
      clearCsrf()
      try {
        let context = await getAuthContextApi()
        if (context.session.scope === 'ONBOARDING' && context.session.gate === 'READY') {
          context = await getAuthContextApi()
        }
        if (epoch !== contextEpoch) return
        const { csrf_token, ...configuration } = context
        if (
          this.context.session?.user_id &&
          this.context.session.user_id !== context.session.user_id
        )
          this.reset()
        setCsrfToken(csrf_token, context.csrf_header)
        this.context = configuration
        const locales = useLocaleOptionsStore()
        try {
          if (!locales.attempted) await locales.load()
        } catch {
          // Keep the current language if the public directory is temporarily unavailable.
        }
        if (epoch !== contextEpoch) return
        if (locales.options.length) {
          const preferred = context.session.preferred_locale
          const code =
            locales.options.find((item) => item.value === preferred)?.value ?? locales.defaultLocale
          setLocale(normalizeLocale(code))
          setApiLocale(code)
        }
        this.contextLoaded = true
        this.loaded = false
      } catch (error) {
        if (epoch !== contextEpoch) return
        if ((error as { code?: string }).code === 'UNAUTHENTICATED') this.reset()
        throw error
      }
    },
    /** Read current global password rules without clearing permissions or mounted drafts. */
    async refreshPasswordRules() {
      const userId = this.context.session?.user_id
      const context = await getAuthContextApi()
      if (!userId || this.context.session?.user_id !== userId || context.session.user_id !== userId)
        throw new Error('Session changed while loading password rules')
      this.context.password_rules = context.password_rules
      setCsrfToken(context.csrf_token, context.csrf_header)
    },
    async refreshContext() {
      clearCsrf()
      return this.loadContext()
    },
    async fetchUserInfo() {
      const key = `${this.context.session?.user_id}:${this.context.session?.expires_at}:${getCurrentLocale()}`
      if (permissionRequest?.key === key) return permissionRequest.promise
      const pending = this.fetchPermissionSnapshot().then(() => undefined)
      permissionRequest = { key, promise: pending }
      try {
        await pending
      } finally {
        if (permissionRequest?.promise === pending) permissionRequest = undefined
      }
    },
    async fetchPermissionSnapshot(language?: { code: string; commit: () => void }) {
      const session = this.context.session
      if (!session || session.scope !== 'FULL' || session.gate !== 'READY') {
        throw new Error('Session gate is not ready')
      }
      const epoch = ++this.permissionEpoch
      const locale = getCurrentLocale()
      if (!language) this.permissionsReady = false
      this.permissionsLoading = true
      this.permissionError = ''
      try {
        let permissions: PermissionsResult
        try {
          permissions = await getPermissionsApi(language?.code)
        } catch (error) {
          const busy = error as { code?: string; retryAfter?: number }
          if (busy.code !== 'AUTHENTICATION_BUSY' || (busy.retryAfter ?? 1) > 5) throw error
          await new Promise((resolve) => setTimeout(resolve, (busy.retryAfter ?? 1) * 1000))
          if (epoch !== this.permissionEpoch) return
          permissions = await getPermissionsApi(language?.code)
        }
        if (
          epoch !== this.permissionEpoch ||
          locale !== getCurrentLocale() ||
          session.user_id !== this.context.session?.user_id ||
          session.expires_at !== this.context.session?.expires_at
        )
          return
        validatePermissions(permissions)
        language?.commit()
        setCostMockActor(session.user_id)
        setSecurityMockActor(session.user_id)
        this.userInfo = {
          id: session.user_id,
          username: session.username,
          name: session.display_name || session.username,
          roles: [],
          permissions: derivePermissions(permissions.capabilities),
        }
        this.permissionSnapshot = permissions
        this.permissionsReady = true
        usePermissionStore().generateRoutes(permissions, this.permissions)
        this.loaded = true
        return true
      } catch (error) {
        if (epoch !== this.permissionEpoch) return
        const err = error as { code?: string; status?: number; request_id?: string }
        if (err.code === 'NAVIGATION_CONTRACT_INCOMPATIBLE' || err.status === 403) {
          this.permissionSnapshot = null
          this.userInfo = null
          usePermissionStore().reset()
        }
        this.permissionError =
          i18n.global.t(
            err.code === 'NAVIGATION_CONTRACT_INCOMPATIBLE'
              ? 'navigationErrors.incompatible'
              : 'navigationErrors.unavailable',
          ) + (err.request_id ? ` (${err.request_id})` : '')
        throw error
      } finally {
        if (epoch === this.permissionEpoch) this.permissionsLoading = false
      }
    },
    async recoverPermissions() {
      // Keep drafts while refreshing; the layout clears pages whose access was revoked.
      this.permissionsReady = false
      await this.fetchUserInfo()
    },
    invalidatePermissions() {
      permissionRequest = undefined
      this.permissionEpoch++
      this.permissionsReady = false
      this.permissionsLoading = false
      this.loaded = false
      this.permissionSnapshot = null
      usePermissionStore().reset()
    },
    async logout(sessionInvalidated = false) {
      try {
        try {
          await logoutApi(sessionInvalidated)
        } catch (error) {
          if ((error as { code?: string }).code !== 'CSRF_INVALID') throw error
          // 只更新退出所需令牌，不提前重置当前页面的权限状态。
          const context = await getAuthContextApi()
          setCsrfToken(context.csrf_token, context.csrf_header)
          await logoutApi(sessionInvalidated)
        }
      } catch (error) {
        const err = error as NotifiedError
        if (err.status !== 401 && !['UNAUTHENTICATED', 'UNAUTHORIZED'].includes(err.code ?? '')) {
          if (!err.notified) {
            MessagePlugin.error(err.message || i18n.global.t('authErrors.fallback'))
            err.notified = true
          }
          throw error
        }
      }
      this.reset()
      this.loggedOut = true
    },
    /** 本地登出（401 等场景，不调接口） */
    reset() {
      ++contextEpoch
      contextRequest = undefined
      this.invalidatePermissions()
      this.permissionError = ''
      setCostMockActor('')
      setSecurityMockActor('')
      useTermsStore().reset()
      usePermissionStore().reset()
      this.context = {}
      this.contextLoaded = false
      this.userInfo = null
      this.loaded = false
      clearSession()
    },
  },
})

/** 权限校验：不传入权限码视为无权限要求 */
export function hasPermission(permissions: string[], required?: string | string[]): boolean {
  if (!required || (Array.isArray(required) && required.length === 0)) return true
  const requiredList = Array.isArray(required) ? required : [required]
  return requiredList.some((code) => permissions.includes(code))
}

/** 是否拥有资源查看权限 */
export function canReadResource(permissions: string[], code: string): boolean {
  return permissions.includes(code)
}

/** 是否拥有资源配置或操作权限 */
export function canWriteResource(permissions: string[], code: string): boolean {
  return permissions.includes(`${code}:write`)
}
