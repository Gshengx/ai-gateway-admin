import type { RoleGrant, RolePermission } from '@/api/modules/identity'

/** 全量替换以原授权为底稿，未展示或不可编辑的有效授权必须保留。 */
export function mergeRoleGrants(previous: RolePermission[], editable: RoleGrant[]): RoleGrant[] {
  const result = new Map<string, RoleGrant>()
  for (const { resource_code, can_read, can_write } of previous) {
    if (can_read || can_write) result.set(resource_code, { resource_code, can_read, can_write })
  }
  for (const grant of editable) result.set(grant.resource_code, { ...grant })
  return [...result.values()]
}
