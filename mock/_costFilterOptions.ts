import { availableScopes, isGlobal, costDirectory } from './_costDirectory'
import { expenseDirectory } from './_expenseDirectory'
import { visibleExpenses } from './_costState'
import { modelAccessState } from './_modelAccessState'
import type { MockRequest } from './_utils'
export function costDepartmentNodes(req: MockRequest) {
  const source = expenseDirectory().departments
  if (isGlobal(req)) return source
  const ids = new Set([
    ...availableScopes(req)
      .filter((s) => s.type === 'DEPARTMENT')
      .map((s) => s.value),
    ...visibleExpenses(req).map((r) => r.cost_department_id),
  ])
  for (const id of [...ids]) {
    let node = source.find((d) => d.id === id)
    while (node?.parent_id) {
      ids.add(node.parent_id)
      node = source.find((d) => d.id === node!.parent_id)
    }
  }
  return source
    .filter((d) => ids.has(d.id))
    .map((d) => ({ ...d, parent_id: d.parent_id && ids.has(d.parent_id) ? d.parent_id : null }))
}
export function costFilterOptions(req: MockRequest) {
  const rows = visibleExpenses(req),
    scopes = availableScopes(req),
    all = isGlobal(req),
    directory = expenseDirectory(),
    cost = costDirectory()
  const subjects = cost.subjects.filter((s) =>
    scopes.some((o) => o.type === 'FEE_SUBJECT' && o.value === s.value),
  )
  const centers = cost.centers.filter(
    (c) =>
      scopes.some((o) => o.type === 'COST_CENTER' && o.value === c.value) ||
      subjects.some((s) => s.costCenterId === c.value),
  )
  const unassigned = {
    value: 'UNASSIGNED',
    label: String(req.headers?.['accept-language'] ?? req.query?.locale ?? '').startsWith('en')
      ? 'Unassigned'
      : '未关联',
  }
  return {
    users: directory.users
      .filter((u) => all || rows.some((r) => r.user_id === u.id))
      .map((u) => ({ value: u.id, label: `${u.name} (${u.username})` })),
    models: modelAccessState.models
      .filter((m) => all || rows.some((r) => r.model_id === m.id))
      .map((m) => ({ value: m.id, label: m.model_id_at_gateway })),
    providers: modelAccessState.providers
      .filter((p) => all || rows.some((r) => r.provider_id === p.id))
      .map((p) => ({ value: p.id, label: p.name })),
    feeSubjects: [...subjects.map((s) => ({ value: s.value, label: s.label })), unassigned],
    costCenters: [...centers.map((c) => ({ value: c.value, label: c.label })), unassigned],
    departments: costDepartmentNodes(req).map((d) => ({ value: d.id, label: d.path })),
  }
}
