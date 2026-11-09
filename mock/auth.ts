import { CAPABILITIES } from './_capabilities'
import { directory, preferencesFor } from './_runtime'
import { mockAccounts, mockRoles } from './_accounts'
import { getPasswordRules } from './settings'
import { mockNavigation } from './navigation'
import type { RespThisType } from 'vite-plugin-mock'
import type { SessionInfo } from '../src/api/modules/auth'
import { currentTerms, isTermsConfirmed } from './terms'
import {
  authMock,
  setMockPasswordRequired,
  upgradeMockSession,
  checkToken,
  checkCsrf,
  mockCsrf,
  mockCookie,
  mockId,
  fail,
  revokeUserTokens,
  usernameFromToken,
  success,
  unauthorized,
  type MockRequest,
} from './_utils'

for (const account of mockAccounts.values()) {
  setMockPasswordRequired(account.username, account.needs_password)
}
function accountFor(req: MockRequest) {
  return mockAccounts.get(usernameFromToken(req) ?? '')!
}
function roleFor(req: MockRequest) {
  const account = accountFor(req)
  return (
    directory
      .get(account.username)
      ?.role_id?.replace(/^role-/, '')
      .replace(/-/g, '_') ?? account.role
  )
}
function session(req: MockRequest): SessionInfo {
  const { username, needs_password: needsPassword } = accountFor(req)
  const gate = needsPassword ? 'NEEDS_PASSWORD' : !isTermsConfirmed(req) ? 'NEEDS_TERMS' : 'READY'
  return {
    user_id: directory.get(username)?.id ?? mockId(username),
    username,
    display_name: directory.get(username)?.display_name ?? username,
    scope: gate === 'READY' ? 'FULL' : 'ONBOARDING',
    gate,
    next_action:
      gate === 'NEEDS_PASSWORD'
        ? 'CHANGE_PASSWORD'
        : gate === 'NEEDS_TERMS'
          ? 'ACCEPT_TERMS'
          : 'ENTER_APPLICATION',
    expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
    idle_expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
    time_zone: preferencesFor(username).time_zone,
    preferred_locale: preferencesFor(username).preferred_locale ?? 'zh-CN',
  }
}
export default authMock([
  {
    url: '/api/v1/auth/login',
    method: 'post',
    response(this: RespThisType, req: MockRequest) {
      if (!req.body?.username || !req.body?.password) return fail('MALFORMED_REQUEST', '')
      const account = mockAccounts.get(String(req.body.username))
      if (
        !account ||
        req.body.password !== account.password ||
        directory.get(account.username)?.status === 'DISABLED'
      )
        return fail('AUTHENTICATION_FAILED', '')
      const { username } = account
      const profile = directory.get(username)
      if (profile) profile.last_login_at = new Date().toISOString()
      revokeUserTokens(username)
      const token = mockCookie(this.res, username)
      return success(session({ ...req, headers: { cookie: `ais_session_dev=${token}` } }))
    },
  },
  {
    url: '/api/v1/auth/context',
    method: 'get',
    response(this: RespThisType, req: MockRequest) {
      if (!checkToken(req)) return unauthorized()
      if (session(req).gate === 'READY') req = upgradeMockSession(req, this.res)
      return success({
        session: session(req),
        csrf_token: mockCsrf(req),
        csrf_header: 'X-CSRF-Token',
        password_rules: getPasswordRules(),
        current_terms_id: currentTerms(req).terms_id,
        terms_confirmation_required: currentTerms(req).mandatory_confirmation,
      })
    },
  },
  {
    url: '/api/v1/auth/me',
    method: 'get',
    response(this: RespThisType, req: MockRequest) {
      return checkToken(req) ? success(session(req)) : unauthorized()
    },
  },
  {
    url: '/api/v1/auth/change-password',
    method: 'post',
    response(this: RespThisType, req: MockRequest) {
      if (!checkToken(req)) return unauthorized()
      if (!checkCsrf(req)) return fail('CSRF_INVALID', '')
      const account = accountFor(req)
      const { username, password } = account
      const next = req.body?.new_password
      const current = req.body?.current_password
      if (typeof next !== 'string' || typeof current !== 'string')
        return fail('MALFORMED_REQUEST', '')
      const rules = getPasswordRules()
      const fields: Record<string, string> = {}
      if (current !== password) fields.current_password = 'CURRENT_PASSWORD_INVALID'
      if (next.length < rules.min_length || next.length > rules.max_length)
        fields.new_password = 'PASSWORD_LENGTH'
      if (
        [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9\s]/].filter((pattern) => pattern.test(next))
          .length < rules.complexity_categories
      )
        fields.new_password = 'PASSWORD_COMPLEXITY'
      if (Object.keys(fields).length)
        return fail('VALIDATION_FAILED', '', { fields, password_policy: rules })
      if (next === password)
        return fail('PASSWORD_REUSED', '', { fields: { new_password: 'PASSWORD_REUSED' } })
      account.password = next
      account.needs_password = false
      setMockPasswordRequired(username, false)
      revokeUserTokens(username)
      const token = mockCookie(this.res, username)
      return success(session({ ...req, headers: { cookie: `ais_session_dev=${token}` } }))
    },
  },
  {
    url: '/api/v1/me/permissions',
    method: 'get',
    response(this: RespThisType, req: MockRequest) {
      if (!checkToken(req)) return unauthorized()
      const view = session(req)
      if (view.gate !== 'READY')
        return fail(
          view.gate === 'NEEDS_PASSWORD' ? 'PASSWORD_CHANGE_REQUIRED' : 'TERMS_ACCEPTANCE_REQUIRED',
          '',
        )
      return success({
        capabilities:
          roleFor(req) === 'super_admin' ? CAPABILITIES : (mockRoles.get(roleFor(req)) ?? []),
        navigation: mockNavigation(
          String(req.query?.locale ?? req.headers?.['accept-language'] ?? 'zh-CN'),
        ),
        permissions_version: '1',
        configuration_version: '1',
        department_scope_root_id: 'd-root',
      })
    },
  },
  {
    url: '/api/v1/auth/logout',
    method: 'post',
    response(this: RespThisType, req: MockRequest) {
      if (!checkToken(req)) return unauthorized()
      if (!checkCsrf(req)) return fail('CSRF_INVALID', '')
      if (!req.body || Object.keys(req.body).length) return fail('MALFORMED_REQUEST', '')
      revokeUserTokens(usernameFromToken(req)!)
      mockCookie(this.res)
      return success({ applied: true, replayed: false })
    },
  },
])
