import { defineStore } from 'pinia'
import { useTermsStore } from './terms'

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
import { getCurrentLocale, i18n } from '@/locales'
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
        this.contextLoaded = true
        this.loaded = false
      } catch (error) {
        if (epoch !== contextEpoch) return
        if ((error as { code?: string }).code === 'UNAUTHENTICATED') this.reset()
        throw error
      }
    },
    async refreshContext() {
      clearCsrf()
      return this.loadContext()
    },
    async fetchUserInfo() {
      const key = `${this.context.session?.user_id}:${this.context.session?.expires_at}:${getCurrentLocale()}`
      if (permissionRequest?.key === key) return permissionRequest.promise
      const pending = this.fetchPermissionSnapshot()
      permissionRequest = { key, promise: pending }
      try {
        await pending
      } finally {
        if (permissionRequest?.promise === pending) permissionRequest = undefined
      }
    },
    async fetchPermissionSnapshot() {
      const session = this.context.session
      if (!session || session.scope !== 'FULL' || session.gate !== 'READY') {
        throw new Error('Session gate is not ready')
      }
      const epoch = ++this.permissionEpoch
      const locale = getCurrentLocale()
      this.permissionsReady = false
      this.permissionsLoading = true
      this.permissionError = ''
      try {
        let permissions: PermissionsResult
        try {
          permissions = await getPermissionsApi()
        } catch (error) {
          const busy = error as { code?: string; retryAfter?: number }
          if (busy.code !== 'AUTHENTICATION_BUSY' || (busy.retryAfter ?? 1) > 5) throw error
          await new Promise((resolve) => setTimeout(resolve, (busy.retryAfter ?? 1) * 1000))
          if (epoch !== this.permissionEpoch) return
          permissions = await getPermissionsApi()
        }
        if (
          epoch !== this.permissionEpoch ||
          locale !== getCurrentLocale() ||
          session.user_id !== this.context.session?.user_id ||
          session.expires_at !== this.context.session?.expires_at
        )
          return
        validatePermissions(permissions)
        setCostMockActor(session.user_id)
        setSecurityMockActor(session.user_id)
        this.userInfo = {
          id: session.user_id,
          username: session.username,
          name: session.display_name || session.username,
          roles: [],
          permissions: derivePermissions(permissions.capabilities),
        }
        const previous = this.permissionSnapshot
        if (
          previous &&
          (previous.department_scope_root_id !== permissions.department_scope_root_id ||
            previous.permissions_version !== permissions.permissions_version ||
            previous.configuration_version !== permissions.configuration_version ||
            JSON.stringify(previous.capabilities) !== JSON.stringify(permissions.capabilities) ||
            JSON.stringify(previous.navigation.items.map((item) => item.route_id).sort()) !==
              JSON.stringify(permissions.navigation.items.map((item) => item.route_id).sort()))
        ) {
          usePermissionStore().generation++
        }
        this.permissionSnapshot = permissions
        this.permissionsReady = true
        usePermissionStore().generateRoutes(permissions, this.permissions)
        this.loaded = true
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
      // Keep route instances until the new snapshot proves a structural change.
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
      await logoutApi(sessionInvalidated)
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
