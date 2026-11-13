import type { ApiKeyItem } from '../src/api/modules/apiKeys'
import type { ManagementLog } from '../src/api/modules/systemLogs'
import type { Capability } from '../src/api/modules/auth'

export interface HybridIdentity {
  username: string
  csrfValid: boolean
  capabilities: Capability[]
}
// Only the development middleware can associate a verified identity with a request.
export const hybridRequests = new WeakMap<object, HybridIdentity>()

// vite-plugin-mock bundles each route file separately. Keep mutable data in the
// Node process so imports and file reloads cannot create a second database.
const processState = globalThis as typeof globalThis & {
  __aisRuntime?: Map<string, unknown>
}
const stores = (processState.__aisRuntime ??= new Map<string, unknown>())
export function runtimeState<T>(key: string, create: () => T): T {
  if (!stores.has(key)) stores.set(key, create())
  return stores.get(key) as T
}
export function existingState<T>(key: string): T | undefined {
  return stores.get(key) as T | undefined
}
export function subjectName(type: string, id: string, fallback = ''): string {
  if (type === 'USER')
    return [...directory.values()].find((user) => user.id === id)?.display_name ?? fallback
  const items = existingState<{ id: string; name: string }[]>(
    type === 'USER_GROUP' ? 'groups' : 'departments',
  )
  return items?.find((item) => item.id === id)?.name ?? fallback
}
export function nextSequence(key: string, initial = 0): number {
  const counter = runtimeState(`sequence:${key}`, () => ({ value: initial }))
  return ++counter.value
}
export interface RuntimeUser {
  email?: string | null
  id: string
  username: string
  display_name: string
  department_id: string | null
  role_id: string | null
  status: 'ACTIVE' | 'DISABLED'
  last_login_at: string | null
}
export const directory = runtimeState('directory', () => new Map<string, RuntimeUser>())
export const apiKeys = runtimeState<ApiKeyItem[]>('apiKeys', () => [])
export const operationLogs = runtimeState<ManagementLog[]>('operationLogs', () => [])
export const preferences = runtimeState(
  'preferences',
  () => new Map<string, { preferred_locale: string | null; time_zone: string }>(),
)
export function preferencesFor(username: string) {
  if (!preferences.has(username))
    preferences.set(username, { preferred_locale: null, time_zone: 'Asia/Shanghai' })
  return preferences.get(username)!
}
