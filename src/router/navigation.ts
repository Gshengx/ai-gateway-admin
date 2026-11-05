import type { PermissionsResult } from '@/api/modules/auth'
import { routeRegistry } from './routes'

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const title = (value: unknown) =>
  text(value) &&
  value.trim() === value &&
  [...value].length <= 128 &&
  !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)

/** 接口边界校验。未知入口绝不退回静态菜单或接受服务端 URL。 */
export function validatePermissions(value: unknown): asserts value is PermissionsResult {
  const fail = () => {
    throw Object.assign(new Error('NAVIGATION_CONTRACT_INCOMPATIBLE'), {
      code: 'NAVIGATION_CONTRACT_INCOMPATIBLE',
    })
  }
  if (!record(value)) return fail()
  const nav = value.navigation
  if (
    !record(nav) ||
    nav.schema_version !== 3 ||
    !text(nav.catalog_version) ||
    !/^sha256:[a-f0-9]{64}$/.test(nav.catalog_version) ||
    !text(nav.locale) ||
    !Array.isArray(nav.groups) ||
    nav.groups.length > 4 ||
    !Array.isArray(nav.items) ||
    nav.items.length > 20 ||
    !text(value.permissions_version) ||
    !/^\d+$/.test(value.permissions_version) ||
    !text(value.configuration_version) ||
    !/^\d+$/.test(value.configuration_version) ||
    !text(value.department_scope_root_id) ||
    !Array.isArray(value.capabilities)
  )
    return fail()
  const resources = new Set<string>()
  for (const cap of value.capabilities) {
    if (
      !record(cap) ||
      !text(cap.resource_code) ||
      resources.has(cap.resource_code) ||
      typeof cap.can_read !== 'boolean' ||
      typeof cap.can_write !== 'boolean' ||
      (cap.data_scope !== undefined &&
        (cap.resource_code !== 'identity.groups' ||
          !['GLOBAL', 'DEPARTMENT_SUBTREE'].includes(String(cap.data_scope))))
    )
      return fail()
    resources.add(cap.resource_code)
  }
  const groups = new Map<string, Record<string, unknown>>()
  const common = (node: Record<string, unknown>) =>
    title(node.title) &&
    text(node.title_locale) &&
    Number.isInteger(node.sort_order) &&
    (node.parent_group_code === undefined || text(node.parent_group_code))
  for (const group of nav.groups) {
    if (!record(group) || !common(group) || !text(group.group_code) || groups.has(group.group_code))
      return fail()
    groups.set(group.group_code, group)
  }
  for (const group of groups.values()) {
    const visited = new Set<string>([String(group.group_code)])
    let parent = group.parent_group_code
    while (parent !== undefined) {
      if (!text(parent) || !groups.has(parent) || visited.has(parent)) return fail()
      visited.add(parent)
      parent = groups.get(parent)!.parent_group_code
    }
  }
  const routes = new Set<string>()
  for (const item of nav.items) {
    if (
      !record(item) ||
      !common(item) ||
      !text(item.route_id) ||
      typeof item.sidebar_hidden !== 'boolean' ||
      !Object.prototype.hasOwnProperty.call(routeRegistry, item.route_id) ||
      item.menu_code !== item.route_id ||
      routes.has(item.route_id) ||
      (item.parent_group_code !== undefined && !groups.has(String(item.parent_group_code)))
    )
      return fail()
    routes.add(item.route_id)
  }
}
