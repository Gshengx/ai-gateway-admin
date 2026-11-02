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
  // Login snapshot compatibility field; false for old sessions. Use session.gate for access.
  terms_confirmation_required: boolean
  // Login snapshot compatibility field; empty for old sessions. Use session.gate for access.
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

export function logoutApi(sessionInvalidated = false) {
  return request.post<{ applied: boolean; replayed: boolean }>(
    '/auth/logout',
    {},
    { skipErrorHandler: sessionInvalidated },
  )
}
