import {
  authMock,
  checkToken,
  checkCsrf,
  success,
  fail,
  unauthorized,
  type MockMethod,
  type MockRequest,
} from './_utils'
import type { PasswordPolicy } from '../src/api/modules/settings'

const shared = globalThis as typeof globalThis & { __aisMockPasswordPolicy?: PasswordPolicy }
// The four authentication defaults match the original auth mock rules.
// Lock settings use deterministic mock defaults within the API ranges.
export const passwordPolicy = (shared.__aisMockPasswordPolicy ??= {
  min_length: 8,
  max_length: 64,
  complexity_categories: 3,
  history_count: 5,
  failure_threshold: 5,
  lock_duration_minutes: 30,
  policy_version: '1.0',
  version_updated_at: '2026-09-01T00:00:00.000Z',
})
export function getPasswordRules() {
  const { min_length, max_length, complexity_categories, history_count } = passwordPolicy
  return { min_length, max_length, complexity_categories, history_count }
}
const ranges = {
  min_length: [8, 64],
  max_length: [8, 64],
  complexity_categories: [1, 4],
  history_count: [0, 10],
  failure_threshold: [3, 10],
  lock_duration_minutes: [5, 1440],
} as const
export default authMock([
  {
    url: '/api/v1/settings/password-policy',
    method: 'get',
    response: (req: MockRequest) =>
      checkToken(req) ? success({ ...passwordPolicy }) : unauthorized(),
  },
  {
    url: '/api/v1/settings/password-policy',
    method: 'put',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      if (!checkCsrf(req)) return fail('CSRF_INVALID', '')
      const body = req.body ?? {}
      if (
        typeof body.reason !== 'string' ||
        !body.reason.trim() ||
        body.reason.length > 512 ||
        Object.keys(body).some(
          (key) => key !== 'reason' && !Object.prototype.hasOwnProperty.call(ranges, key),
        )
      )
        return fail('VALIDATION_FAILED', '')
      const keys = Object.keys(ranges) as Array<keyof typeof ranges>
      if (
        keys.some((key) => {
          const value = body[key]
          const [min, max] = ranges[key]
          return typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max
        }) ||
        Number(body.min_length) > Number(body.max_length)
      )
        return fail('VALIDATION_FAILED', '')
      if (!req.headers?.['x-reauth-proof'] && !req.headers?.['X-Reauth-Proof'])
        return fail('REAUTH_REQUIRED', '')
      const changed = keys.some((key) => body[key] !== passwordPolicy[key])
      if (changed) {
        passwordPolicy.version_updated_at = new Date().toISOString()
        for (const key of keys) passwordPolicy[key] = body[key] as number
        passwordPolicy.policy_version = `1.${Number(passwordPolicy.policy_version.split('.')[1]) + 1}`
      }
      return success({ changed, policy: { ...passwordPolicy }, replayed: false })
    },
  },
] as MockMethod[])
