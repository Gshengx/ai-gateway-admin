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
  revokeAllTokens,
  success,
  unauthorized,
  type MockRequest,
} from './_utils'
const CAPABILITIES = [
  { resource_code: 'identity.users', can_read: true, can_write: true },
  { resource_code: 'identity.groups', can_read: true, can_write: true },
  { resource_code: 'identity.roles', can_read: true, can_write: true },
  { resource_code: 'identity.keys', can_read: true, can_write: true },
  { resource_code: 'identity.permission_resources', can_read: true, can_write: true },
  { resource_code: 'audit.annotations', can_read: true, can_write: true },
  { resource_code: 'audit.management', can_read: true, can_write: true },
  { resource_code: 'audit.terms_acceptances', can_read: true, can_write: true },
  { resource_code: 'system.settings', can_read: true, can_write: true },
  { resource_code: 'personal.profile', can_read: true, can_write: true },
  { resource_code: 'personal.keys', can_read: true, can_write: true },
  { resource_code: 'demo.control_plane', can_read: false, can_write: false },
  { resource_code: 'model.admission', can_read: true, can_write: true },
  { resource_code: 'model.logical', can_read: true, can_write: true },
  { resource_code: 'model.models', can_read: true, can_write: true },
  { resource_code: 'model.permissions', can_read: true, can_write: true },
  { resource_code: 'model.pricing', can_read: true, can_write: true },
  { resource_code: 'model.providers', can_read: true, can_write: true },
  { resource_code: 'model.review', can_read: true, can_write: true },
]

// Mock credentials are supplied locally at runtime, never embedded in source.
const username = process.env.AIS_MOCK_USERNAME ?? ''
let password = process.env.AIS_MOCK_PASSWORD ?? ''
let needsPassword = process.env.AIS_MOCK_NEEDS_PASSWORD === 'true'
setMockPasswordRequired(needsPassword)
function session(req?: MockRequest): SessionInfo {
  const gate = needsPassword
    ? 'NEEDS_PASSWORD'
    : !req || !isTermsConfirmed(req)
      ? 'NEEDS_TERMS'
      : 'READY'
  return {
    user_id: mockId(username),
    username,
    display_name: username,
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
    time_zone: 'Asia/Shanghai',
    preferred_locale: 'zh-CN',
  }
}
export default authMock([
  {
    url: '/api/v1/auth/login',
    method: 'post',
    response(this: RespThisType, req: MockRequest) {
      if (!req.body?.username || !req.body?.password) return fail('MALFORMED_REQUEST', '')
      if (
        !username ||
        !password ||
        req.body.username !== username ||
        req.body.password !== password
      )
        return fail('AUTHENTICATION_FAILED', '')
      revokeAllTokens()
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
      password = next
      needsPassword = false
      setMockPasswordRequired(false)
      revokeAllTokens()
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
        capabilities: CAPABILITIES,
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
      revokeAllTokens()
      mockCookie(this.res)
      return success({ applied: true, replayed: false })
    },
  },
])
