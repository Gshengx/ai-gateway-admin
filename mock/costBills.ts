import { costDepartmentNodes, costFilterOptions } from './_costFilterOptions'
import { matchesControlStatus } from './_expenseRecords'
import { departmentLevel } from './_billDepartments'
import { expenseDirectory, expenseSubtree } from './_expenseDirectory'
import { route, page, value } from './_expenseRoute'
import { availableScopes, canScope } from './_costDirectory'
import {
  costState,
  makeBill,
  calculate,
  period,
  cutoff,
  billRecords,
  aggregate,
  csv,
  nextRun,
  currentActorId,
  runDueTasks,
} from './_costState'
import { nextSequence } from './_runtime'
import { success, fail, auditedMock, type MockRequest } from './_utils'
import type { BillInput, TaskInput, Dimension, ScopeType } from '../src/api/modules/bills'
const endpoint = (
  path: string,
  method: 'get' | 'post' | 'put' | 'delete',
  handler: Parameters<typeof route>[2],
) =>
  route(
    path,
    method,
    (req) => {
      runDueTasks(req)
      return handler(req)
    },
    'cost.bills',
  )
const id = (req: MockRequest) => String(req.url).split('?')[0]!.split('/').filter(Boolean)
const billFor = (req: MockRequest) => costState().bills.find((b) => id(req).includes(b.id))
const taskFor = (req: MockRequest) => costState().tasks.find((t) => id(req).includes(t.id))
function filtered<T extends { scopeType: ScopeType; scopeId: string; status: string }>(
  rows: T[],
  req: MockRequest,
) {
  return rows.filter(
    (b) =>
      canScope(req, b.scopeType, b.scopeId) &&
      (!value(req, 'scopeType') || b.scopeType === value(req, 'scopeType')) &&
      (!value(req, 'scopeId') || b.scopeId === value(req, 'scopeId')) &&
      (!value(req, 'status') || b.status === value(req, 'status')),
  )
}
function analysis(req: MockRequest) {
  const b = billFor(req)!
  const dims: Dimension[] = [
    'FEE_SUBJECT',
    'COST_CENTER',
    'DEPARTMENT',
    'USER',
    'MODEL',
    'PROVIDER',
  ]
  const dimension = dims.includes(value(req, 'dimension') as Dimension)
    ? (value(req, 'dimension') as Dimension)
    : 'FEE_SUBJECT'
  const rows = billRecords(b).filter((r) => matchesControlStatus(r, value(req, 'controlStatus')))
  const all = aggregate(
    rows,
    dimension,
    rows.reduce((n, r) => n + r.total_cost, 0),
  )
  const optionGroups = costFilterOptions(req)
  const options =
    dimension === 'FEE_SUBJECT'
      ? optionGroups.feeSubjects
      : dimension === 'COST_CENTER'
        ? optionGroups.costCenters
        : dimension === 'DEPARTMENT'
          ? optionGroups.departments
          : dimension === 'USER'
            ? optionGroups.users
            : dimension === 'MODEL'
              ? optionGroups.models
              : optionGroups.providers
  const invalidFilter =
    !!value(req, 'filter') && !options.some((o) => o.value === value(req, 'filter'))
  const level =
    dimension === 'DEPARTMENT'
      ? departmentLevel(b, rows, value(req, 'department_parent_id'), value(req, 'filter'))
      : undefined
  const items =
    dimension === 'DEPARTMENT'
      ? (level?.items ?? [])
      : all.filter((r) => !value(req, 'filter') || r.id === value(req, 'filter'))
  const key = [
    'cost',
    'uncontrolledCost',
    'inputTokens',
    'outputTokens',
    'cachedTokens',
    'requests',
    'percentage',
  ].includes(value(req, 'sort_by'))
    ? value(req, 'sort_by')
    : 'cost'
  items.sort(
    (a, b) =>
      (Number(a[key as keyof typeof a]) - Number(b[key as keyof typeof b])) *
        (value(req, 'direction') === 'asc' ? 1 : -1) || a.id.localeCompare(b.id),
  )
  return {
    items,
    options,
    invalidParent: invalidFilter || (dimension === 'DEPARTMENT' && !level),
  }
}
export default auditedMock([
  endpoint('/cost/bill-departments', 'get', (req) => {
    const ids = new Set(
      availableScopes(req)
        .filter((s) => s.type === 'DEPARTMENT')
        .map((s) => s.value),
    )
    const departments = expenseDirectory().departments.filter((d) => ids.has(d.id))
    const parent = value(req, 'parent_id')
    return success({
      items: departments
        .filter((d) => (parent ? d.parent_id === parent : !d.parent_id || !ids.has(d.parent_id)))
        .map((d) => ({
          ...d,
          parent_id: d.parent_id && ids.has(d.parent_id) ? d.parent_id : null,
          has_children: departments.some((c) => c.parent_id === d.id),
        })),
    })
  }),
  endpoint('/cost/bill-options', 'get', (req) => {
    const bills = filtered(costState().bills, req)
    return success({
      scopes: availableScopes(req),
      billScopes: availableScopes(req).filter((s) =>
        bills.some((b) => b.scopeType === s.type && b.scopeId === s.value),
      ),
      taskScopes: availableScopes(req).filter((s) =>
        costState().tasks.some((t) => t.scopeType === s.type && t.scopeId === s.value),
      ),
      cutoff: cutoff(),
      months: [...new Set(bills.map((b) => b.periodStart.slice(0, 7)))].sort().reverse(),
    })
  }),
  endpoint('/cost/bills', 'get', (req) => {
    const rows = filtered(costState().bills, req).filter(
      (b) =>
        (!value(req, 'periodType') || b.periodType === value(req, 'periodType')) &&
        (!value(req, 'month') || b.periodStart.startsWith(value(req, 'month'))),
    )
    const key = ['totalCost', 'totalTokens', 'totalRequests', 'periodStart', 'status'].includes(
      value(req, 'sort_by'),
    )
      ? value(req, 'sort_by')
      : 'generatedAt'
    rows.sort((a, b) => {
      const x = a[key as keyof typeof a]!,
        y = b[key as keyof typeof b]!
      return (
        (typeof x === 'number' ? x - Number(y) : String(x).localeCompare(String(y))) *
          (value(req, 'direction') === 'asc' ? 1 : -1) || a.id.localeCompare(b.id)
      )
    })
    return success(page(rows, req))
  }),
  endpoint('/cost/bills', 'post', (req) => {
    const input = req.body as unknown as BillInput
    if (!canScope(req, input.scopeType, input.scopeId)) return fail('FORBIDDEN', '')
    const bounds = period(input.periodType, String(input.date ?? ''))
    if (
      !['MONTHLY', 'WEEKLY'].includes(input.periodType) ||
      !bounds ||
      bounds.periodStart > cutoff()
    )
      return fail('VALIDATION_FAILED', '')
    const state = costState()
    let b = state.bills.find(
      (b) =>
        b.periodType === input.periodType &&
        b.periodStart === bounds.periodStart &&
        b.scopeType === input.scopeType &&
        b.scopeId === input.scopeId,
    )
    if (b) {
      calculate(b)
      Object.assign(b, {
        status: 'COMPLETED',
        failureReason: undefined,
        generatedAt: new Date().toISOString(),
      })
    } else {
      b = makeBill(input, currentActorId(req))
      state.bills.push(b)
    }
    return success(b)
  }),
  endpoint('/cost/bills/:id/departments', 'get', (req) => {
    const b = billFor(req)
    if (!b || !canScope(req, b.scopeType, b.scopeId)) return fail('FORBIDDEN', '')
    const nodes = costDepartmentNodes(req),
      parent = value(req, 'parent_id'),
      search = value(req, 'search').toLowerCase()
    let result = nodes
    if (search) {
      const ids = new Set<string>()
      for (const node of nodes.filter((n) => n.name.toLowerCase().includes(search))) {
        let n: typeof node | undefined = node
        while (n) {
          ids.add(n.id)
          n = nodes.find((p) => p.id === n!.parent_id)
        }
      }
      result = nodes.filter((n) => ids.has(n.id))
    } else result = nodes.filter((n) => (parent ? n.parent_id === parent : !n.parent_id))
    return success({
      items: result.map((n) => ({
        ...n,
        display_name: n.name,
        matched: !!search && n.name.toLowerCase().includes(search),
        has_children: nodes.some((c) => c.parent_id === n.id),
      })),
    })
  }),
  endpoint('/cost/bills/:id/regenerate', 'post', (req) => {
    const b = billFor(req)
    if (!b || !canScope(req, b.scopeType, b.scopeId)) return fail('FORBIDDEN', '')
    calculate(b)
    Object.assign(b, {
      status: 'COMPLETED',
      failureReason: undefined,
      generatedAt: new Date().toISOString(),
    })
    return success(b)
  }),
  endpoint('/cost/bills/:id/export', 'get', (req) => {
    const b = billFor(req)
    if (!b || !canScope(req, b.scopeType, b.scopeId)) return fail('FORBIDDEN', '')
    if (b.status !== 'COMPLETED') return fail('STATE_CONFLICT', '')
    if (value(req, 'all') !== 'true' && analysis(req).invalidParent) return fail('OUT_OF_SCOPE', '')
    const rows =
      value(req, 'all') === 'true'
        ? (
            ['FEE_SUBJECT', 'COST_CENTER', 'DEPARTMENT', 'USER', 'MODEL', 'PROVIDER'] as Dimension[]
          ).flatMap((d) =>
            aggregate(billRecords(b), d, b.totalCost).map((r) => ({ dimension: d, ...r })),
          )
        : value(req, 'dimension') === 'DEPARTMENT'
          ? (() => {
              const source = billRecords(b).filter((r) =>
                matchesControlStatus(r, value(req, 'controlStatus')),
              )
              const ids = value(req, 'filter')
                ? new Set(expenseSubtree(value(req, 'filter')))
                : null
              return aggregate(
                source.filter((r) => !ids || ids.has(r.cost_department_id)),
                'DEPARTMENT',
                source.reduce((n, r) => n + r.total_cost, 0),
              ).sort((a, b) => {
                const key = [
                  'cost',
                  'uncontrolledCost',
                  'inputTokens',
                  'outputTokens',
                  'cachedTokens',
                  'requests',
                  'percentage',
                ].includes(value(req, 'sort_by'))
                  ? value(req, 'sort_by')
                  : 'cost'
                return (
                  (Number(a[key as keyof typeof a]) - Number(b[key as keyof typeof b])) *
                    (value(req, 'direction') === 'asc' ? 1 : -1) || a.id.localeCompare(b.id)
                )
              })
            })()
          : analysis(req).items
    return success({ content: csv(rows), count: rows.length })
  }),
  endpoint('/cost/bills/:id', 'get', (req) => {
    const b = billFor(req)
    if (!b || !canScope(req, b.scopeType, b.scopeId)) return fail('FORBIDDEN', '')
    const a = analysis(req)
    if (a.invalidParent) return fail('OUT_OF_SCOPE', '')
    return success({
      bill: b,
      analysis: page(a.items, req),
      options: a.options,
    })
  }),
  endpoint('/cost/bill-tasks', 'get', (req) =>
    success(
      page(
        filtered(costState().tasks, req).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        req,
      ),
    ),
  ),
  ...(['post', 'put'] as const).map((method) =>
    endpoint(method === 'post' ? '/cost/bill-tasks' : '/cost/bill-tasks/:id', method, (req) => {
      const input = req.body as unknown as TaskInput
      const old = method === 'put' ? taskFor(req) : undefined
      if (method === 'put' && (!old || !canScope(req, old.scopeType, old.scopeId)))
        return fail('FORBIDDEN', '')
      if (!canScope(req, input.scopeType, input.scopeId)) return fail('FORBIDDEN', '')
      const emails = input.emailEnabled ? [...new Set(input.emailRecipients ?? [])] : []
      if (
        !['MONTHLY', 'WEEKLY'].includes(input.periodType) ||
        (input.emailEnabled &&
          (!emails.length || emails.some((e) => !/^\S+@[^@\s]+\.[^@\s]+$/.test(e))))
      )
        return fail('VALIDATION_FAILED', '')
      const data = {
        periodType: input.periodType,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        scopeName: availableScopes(req).find(
          (s) => s.type === input.scopeType && s.value === input.scopeId,
        )!.label,
        emailEnabled: !!input.emailEnabled,
        emailRecipients: emails,
      }
      const t = old ?? {
        ...data,
        id: `task-${nextSequence('costTask')}`,
        createdByUserId: currentActorId(req),
        createdAt: new Date().toISOString(),
        status: 'ACTIVE' as const,
        nextRunAt: null,
      }
      Object.assign(t, data, {
        nextRunAt: t.status === 'ACTIVE' ? nextRun(input.periodType) : null,
      })
      if (!old) costState().tasks.push(t)
      return success(t)
    }),
  ),
  endpoint('/cost/bill-tasks/:id/status', 'post', (req) => {
    const t = taskFor(req)
    if (!t || !canScope(req, t.scopeType, t.scopeId)) return fail('FORBIDDEN', '')
    const status = req.body?.status
    if (status !== 'ACTIVE' && status !== 'DISABLED') return fail('VALIDATION_FAILED', '')
    t.status = status
    t.nextRunAt = status === 'ACTIVE' ? nextRun(t.periodType) : null
    return success(t)
  }),
  endpoint('/cost/bill-tasks/:id', 'delete', (req) => {
    const state = costState(),
      t = taskFor(req)
    if (!t || !canScope(req, t.scopeType, t.scopeId)) return fail('FORBIDDEN', '')
    state.tasks.splice(state.tasks.indexOf(t), 1)
    return success({ deleted: true })
  }),
])
