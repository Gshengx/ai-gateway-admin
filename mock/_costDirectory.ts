import { runtimeState, existingState, hybridRequests } from './_runtime'
import { expenseDirectory, expenseSubtree } from './_expenseDirectory'
import { actor } from './_expenseRoute'
import { mockAccounts } from './_accounts'
import type { MockRequest } from './_utils'
import type { ScopeOption, ScopeType } from '../src/api/modules/bills'
export function costDirectory() {
  return runtimeState('costDirectoryV15', () => {
    const { users } = expenseDirectory()
    const owners = users.filter((u) => !['admin'].includes(u.username))
    const centers: ScopeOption[] = [
      '大模型研发成本中心',
      '数据分析成本中心',
      '停用归档成本中心',
    ].map((label, i) => ({
      value: `cc-${i + 1}`,
      label,
      type: 'COST_CENTER',
      ownerId: owners[i]?.id,
      subjectCount: i === 0 ? 2 : 1,
    }))
    const subjects: ScopeOption[] = [
      '默认-大模型研发成本中心',
      '智能客服知识库',
      '默认-数据分析成本中心',
      '历史归档项目',
    ].map((label, i) => ({
      value: `fs-${i + 1}`,
      label,
      type: 'FEE_SUBJECT',
      costCenterId: centers[i < 2 ? 0 : i - 1]!.value,
      costCenterName: centers[i < 2 ? 0 : i - 1]!.label,
      subjectType: i % 2 ? 'PROJECT' : 'DEPARTMENT',
      ownerId: owners[i + 2]?.id,
    }))
    return {
      centers,
      subjects,
      controlEvents: [
        { at: '2026-04-01T00:00:00Z', enabled: true },
        { at: '2026-07-01T00:00:00Z', enabled: false },
        { at: '2026-09-01T00:00:00Z', enabled: true },
      ],
    }
  })
}
export function isGlobal(req: MockRequest, user = actor(req)) {
  const hybrid = hybridRequests.get(req)
  if (hybrid && user?.id === actor(req)?.id) {
    const resource = String(req.url).includes('/cost/bill') ? 'cost.bills' : 'cost.expenses'
    return hybrid.capabilities.some(
      (cap) => cap.resource_code === resource && cap.can_read && cap.data_scope === 'GLOBAL',
    )
  }
  const roles = existingState<{ id: string; code: string }[]>('roles') ?? []
  const code =
    roles.find((r) => r.id === user?.role_id)?.code ??
    user?.role_id?.replace(/^role-/, '').replace(/-/g, '_') ??
    mockAccounts.get(user?.username ?? '')?.role
  return code === 'super_admin' || code === 'sys_admin'
}
export function availableScopes(req: MockRequest, user = actor(req)): ScopeOption[] {
  const { centers, subjects } = costDirectory()
  const roles = existingState<{ id: string; code: string }[]>('roles') ?? []
  const code =
    roles.find((r) => r.id === user?.role_id)?.code ??
    user?.role_id?.replace(/^role-/, '').replace(/-/g, '_') ??
    mockAccounts.get(user?.username ?? '')?.role
  const all = isGlobal(req, user)
  const hybrid = hybridRequests.get(req)
  const resource = String(req.url).includes('/cost/bill') ? 'cost.bills' : 'cost.expenses'
  const subtree =
    hybrid && user?.id === actor(req)?.id
      ? hybrid.capabilities.some(
          (cap) =>
            cap.resource_code === resource &&
            cap.can_read &&
            cap.data_scope === 'DEPARTMENT_SUBTREE',
        )
      : code === 'dept_admin'
  const departments = all
    ? expenseDirectory().departments
    : subtree && user?.department_id
      ? expenseDirectory().departments.filter((d) =>
          expenseSubtree(user.department_id!).includes(d.id),
        )
      : []
  const owned = centers.filter((c) => all || c.ownerId === user?.id)
  return [
    ...departments.map((d) => ({ value: d.id, label: d.path, type: 'DEPARTMENT' as const })),
    ...owned,
    ...subjects.filter(
      (s) => all || s.ownerId === user?.id || owned.some((c) => c.value === s.costCenterId),
    ),
  ]
}
export const canScope = (req: MockRequest, type: ScopeType, id: string) =>
  availableScopes(req).some((s) => s.type === type && s.value === id)
