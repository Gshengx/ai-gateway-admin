import { directory, existingState, runtimeState, hybridRequests } from './_runtime'
import { mockAccounts, mockRoles } from './_accounts'
import { CAPABILITIES } from './_capabilities'
import {
  checkToken,
  checkCsrf,
  fail,
  success,
  unauthorized,
  usernameFromToken,
  type MockMethod,
  type MockRequest,
} from './_utils'
export const value = (req: MockRequest, key: string) => String(req.query?.[key] ?? '')
export const english = (req: MockRequest) => value(req, 'locale').startsWith('en')
export const actor = (req: MockRequest) => directory.get(usernameFromToken(req) ?? '')
export function userCapable(user: ReturnType<typeof actor>, resource: string, write = false) {
  const roles = existingState<{ id: string; code: string }[]>('roles') ?? []
  const role =
    roles.find((item) => item.id === user?.role_id)?.code ??
    user?.role_id?.replace(/^role-/, '').replace(/-/g, '_') ??
    mockAccounts.get(user?.username ?? '')?.role
  const caps = role === 'super_admin' ? CAPABILITIES : (mockRoles.get(role ?? '') ?? [])
  return caps.some(
    (cap) => cap.resource_code === resource && cap.can_read && (!write || cap.can_write),
  )
}
export function capable(req: MockRequest, resource: string, write = false) {
  const hybrid = hybridRequests.get(req)
  if (hybrid)
    return hybrid.capabilities.some(
      (cap) => cap.resource_code === resource && cap.can_read && (!write || cap.can_write),
    )
  return userCapable(actor(req), resource, write)
}
export function page<T>(items: T[], req: MockRequest) {
  const current = Math.max(1, Number(value(req, 'page')) || 1)
  const size = Math.min(100, Math.max(1, Number(value(req, 'page_size')) || 20))
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    page_size: size,
    total: items.length,
    total_pages: Math.ceil(items.length / size),
  }
}
export function route(
  url: string,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  handler: (req: MockRequest) => ReturnType<typeof success> | ReturnType<typeof fail>,
  resource: string,
  writeOverride?: boolean,
): MockMethod {
  return {
    url: `/api/v1${url}`,
    method,
    response(req: MockRequest) {
      if (!checkToken(req)) return unauthorized()
      if (method !== 'get' && !checkCsrf(req)) return fail('FORBIDDEN', '')
      if (!capable(req, resource, writeOverride ?? method !== 'get')) return fail('FORBIDDEN', '')
      const tokenKey = String(req.headers?.['idempotency-key'] ?? '')
      const key = tokenKey ? `${actor(req)?.id}:${tokenKey}` : ''
      const cache = runtimeState(
        'expenseCommands',
        () =>
          new Map<
            string,
            { signature: string; result: ReturnType<typeof success> | ReturnType<typeof fail> }
          >(),
      )
      const signature = JSON.stringify([req.url, req.body])
      const cached = key ? cache.get(key) : undefined
      if (method !== 'get' && cached)
        return cached.signature === signature
          ? success({ ...(cached.result.data as object), replayed: true })
          : fail('STATE_CONFLICT', '')
      const result = handler(req)
      if (key && method !== 'get' && result.code === 'OK')
        cache.set(key, { signature, result: structuredClone(result) })
      return result
    },
  }
}
