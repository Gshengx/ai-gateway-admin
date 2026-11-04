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
} from '@/api/modules/auth'
import { usePermissionStore } from './permission'
import { clearSession, clearCsrf, setCsrfToken } from '@/utils/auth'
import { costMockCapabilities, setCostMockActor } from '@/api/mock/cost'
import { securityMockCapabilities, setSecurityMockActor } from '@/api/mock/security'

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

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    context: {},
    contextLoaded: false,
    userInfo: null,
    loaded: false,
  }),
  getters: {
    mustChangePassword: (state) => state.context.session?.gate === 'NEEDS_PASSWORD',
    termsConfirmationRequired: (state): boolean | undefined =>
      state.context.terms_confirmation_required,
    permissions: (state) => state.userInfo?.permissions ?? [],
  },
  actions: {
    async login(params: LoginParams) {
      this.reset()
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
      this.contextLoaded = false
      clearCsrf()
      try {
        let context = await getAuthContextApi()
        if (context.session.scope === 'ONBOARDING' && context.session.gate === 'READY') {
          context = await getAuthContextApi()
        }
        const { csrf_token, ...configuration } = context
        setCsrfToken(csrf_token, context.csrf_header)
        this.context = configuration
        this.contextLoaded = true
        this.loaded = false
        return this.context
      } catch (error) {
        if ((error as { code?: string }).code === 'UNAUTHENTICATED') this.reset()
        throw error
      }
    },
    async refreshContext() {
      clearCsrf()
      return this.loadContext()
    },
    async fetchUserInfo() {
      const session = this.context.session
      if (!session || session.scope !== 'FULL' || session.gate !== 'READY') {
        throw new Error('Session gate is not ready')
      }
      const permissions = await getPermissionsApi()
      // Cost P0 menus and capabilities are explicitly mocked until its backend is available.
      setCostMockActor(session.user_id)
      setSecurityMockActor(session.user_id)
      this.userInfo = {
        id: session.user_id,
        username: session.username,
        name: session.display_name || session.username,
        roles: [],
        permissions: derivePermissions([
          ...permissions.capabilities.filter(
            (item) =>
              !item.resource_code.startsWith('cost.') &&
              !item.resource_code.startsWith('security.'),
          ),
          ...costMockCapabilities,
          ...securityMockCapabilities,
        ]),
      }
      this.loaded = true
    },
    async logout(sessionInvalidated = false) {
      await logoutApi(sessionInvalidated)
      this.reset()
    },
    /** 本地登出（401 等场景，不调接口） */
    reset() {
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
