import type { Bill, DimensionRow } from '../src/api/modules/bills'
import type { ExpenseRecord } from '../src/api/modules/expenses'
import { expenseDirectory, expenseSubtree } from './_expenseDirectory'
import { aggregate } from './_costState'
export function billDepartmentNodes(bill: Bill, rows: ExpenseRecord[]) {
  const source = expenseDirectory().departments
  const ids = new Set<string>()
  const root = bill.scopeType === 'DEPARTMENT' ? bill.scopeId : null
  for (const row of rows) {
    let node = source.find((d) => d.id === row.cost_department_id)
    while (node) {
      ids.add(node.id)
      if (node.id === root) break
      node = source.find((d) => d.id === node!.parent_id)
    }
  }
  if (root) ids.add(root)
  return source
    .filter((d) => ids.has(d.id))
    .map((d) => ({
      ...d,
      parent_id: d.id === root || !ids.has(d.parent_id ?? '') ? null : d.parent_id,
    }))
}
export function departmentLevel(bill: Bill, rows: ExpenseRecord[], parent: string, filter: string) {
  const nodes = billDepartmentNodes(bill, rows)
  const filteredIds = filter ? new Set(expenseSubtree(filter)) : null
  if (
    (parent && !nodes.some((d) => d.id === parent)) ||
    (parent && filteredIds && !filteredIds.has(parent))
  )
    return null
  const total = rows.reduce((n, r) => n + r.total_cost, 0)
  const candidates = nodes.filter((d) =>
    parent ? d.parent_id === parent : filter ? d.id === filter : !d.parent_id,
  )
  const result: DimensionRow[] = []
  const summarize = (
    id: string,
    records: ExpenseRecord[],
    name: string,
    direct = false,
  ): DimensionRow => {
    const sum = aggregate(records, 'DEPARTMENT', total).reduce(
      (s, r) => ({
        cost: s.cost + r.cost,
        directCost: s.directCost + r.directCost,
        projectCost: s.projectCost + r.projectCost,
        uncontrolledCost: s.uncontrolledCost + r.uncontrolledCost,
        inputTokens: s.inputTokens + r.inputTokens,
        outputTokens: s.outputTokens + r.outputTokens,
        cachedTokens: s.cachedTokens + r.cachedTokens,
        requests: s.requests + r.requests,
      }),
      {
        cost: 0,
        directCost: 0,
        projectCost: 0,
        uncontrolledCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        requests: 0,
      },
    )
    return {
      id: direct ? `direct:${id}` : id,
      departmentId: id,
      path: nodes.find((n) => n.id === id)?.path,
      name,
      subjectType: null,
      costCenterName: null,
      ...sum,
      percentage: total ? (sum.cost / total) * 100 : 0,
      hasChildren: !direct && nodes.some((n) => n.parent_id === id),
      isDirect: direct,
    }
  }
  if (parent) {
    const direct = rows.filter((r) => r.cost_department_id === parent)
    if (direct.length)
      result.push(summarize(parent, direct, nodes.find((n) => n.id === parent)!.name, true))
  }
  for (const node of candidates) {
    const ids = new Set(expenseSubtree(node.id))
    result.push(
      summarize(
        node.id,
        rows.filter((r) => ids.has(r.cost_department_id)),
        node.name,
      ),
    )
  }
  return { items: result }
}
