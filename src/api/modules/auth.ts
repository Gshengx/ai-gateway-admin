import { request } from '../request'

/** 登录请求参数 */
export interface LoginParams {
  username: string
  password: string
}

/**
 * 登录结果。
 * next_action 为 ENTER_APPLICATION 时才允许进入系统；
 * CHANGE_PASSWORD / ACCEPT_TERMS 属于登录门禁，需先完成对应流程。
 */
export interface SessionInfo {
  user_id: string
  username: string
  display_name: string
  scope: 'ONBOARDING' | 'FULL'
  gate: 'NEEDS_PASSWORD' | 'NEEDS_TERMS' | 'READY'
  next_action: 'CHANGE_PASSWORD' | 'ACCEPT_TERMS' | 'ENTER_APPLICATION'
  expires_at: string
  idle_expires_at: string
  time_zone: string
  preferred_locale: string
}
export type LoginResult = SessionInfo
export interface PasswordRules {
  min_length: number
  max_length: number
  complexity_categories: number
  history_count: number
}
export interface AuthContext {
  session: SessionInfo
  password_rules: PasswordRules
  terms_confirmation_required: boolean
  current_terms_id: string
  csrf_token: string
  csrf_header: string
}

export interface Capability {
  resource_code: string
  can_read: boolean
  can_write: boolean
}

/** GET /me/permissions */
export interface PermissionsResult {
  permissions_version: string
  configuration_version: string
  department_scope_root_id: string
  capabilities: Capability[]
}

/**
 * 二次验证意图：需与即将执行的敏感操作完全一致（操作标识、路径参数、请求体），
 * 后端据此校验证明与操作是否匹配。
 */
export interface ReauthIntent {
  operation_id: string
  path?: Record<string, string>
  body: Record<string, unknown>
}

/** POST /auth/reauth 结果：proof_token 放入 X-Reauth-Proof 头重试原操作 */
export interface ReauthResult {
  proof_token: string
  expires_at: string
  operation_id: string
  action_digest: string
}

export function loginApi(data: LoginParams) {
  return request.post<LoginResult>('/auth/login', data)
}

export async function getAuthContextApi() {
  const context = await request.get<AuthContext>('/auth/context', {
    skipLocale: true,
    skipErrorHandler: true,
  })
  if (
    !context?.session ||
    !['NEEDS_PASSWORD', 'NEEDS_TERMS', 'READY'].includes(context.session.gate) ||
    !['ONBOARDING', 'FULL'].includes(context.session.scope) ||
    !context.csrf_token ||
    !context.csrf_header ||
    !context.password_rules
  ) {
    throw new Error('Invalid authentication context')
  }
  return context
}

export function changePasswordApi(payload: { current_password: string; new_password: string }) {
  return request.post<SessionInfo>('/auth/change-password', payload, {
    handledErrorCodes: ['UNAUTHENTICATED'],
  })
}

export function getSessionApi() {
  return request.get<SessionInfo>('/auth/me', { skipLocale: true })
}

export function getPermissionsApi() {
  return request.get<PermissionsResult>('/me/permissions', { skipLocale: true })
}

/** 敏感操作二次验证：校验当前密码并获取一次性操作证明 */
export function reauthApi(data: { password: string; intent: ReauthIntent }) {
  return request.post<ReauthResult>('/auth/reauth', data)
}

export function logoutApi(sessionInvalidated = false) {
  return request.post<{ applied: boolean; replayed: boolean }>(
    '/auth/logout',
    {},
    { skipErrorHandler: sessionInvalidated },
  )
}
