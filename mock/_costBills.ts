import { expenseRecords, summarize } from './_costRecords'
import { costDirectory, effectiveDepartment } from '../src/api/mock/cost'
import { projects } from './_projects'
import { budgetLedger } from './_projectBudgets'
import type { Bill, BillItem, Dimension } from '../src/api/modules/cost'
import type { ExpenseRecord } from '../src/api/modules/expenses'
import type { State } from '../src/api/mock/cost'
import { budgetDates, allocateBudget } from '../src/utils/projectBudget'
const { departments } = costDirectory()
const departmentAliases: Record<string, string> = {
  'd-root': 'hq',
  'd-tech': 'tech',
  'd-algo': 'algorithm',
  'd-platform': 'platform',
  'd-ops': 'operations',
  'd-hr': 'hr',
}
export const costDepartmentId = (id: string) => departmentAliases[id] ?? id.replace(/^d-/, '')
export function costSubtree(id: string): string[] {
  return [id, ...departments.filter((d) => d.parent_id === id).flatMap((d) => costSubtree(d.id))]
}
export function billRecords(bill: Bill) {
  const scope = [...new Set((bill.department_ids ?? [bill.department_id]).flatMap(costSubtree))]
  return expenseRecords.filter(
    (r) =>
      r.created_at.slice(0, 10) >= bill.period_start &&
      r.created_at.slice(0, 10) <= bill.period_end &&
      scope.includes(
        r.project_department_id ? costDepartmentId(r.project_department_id) : r.user_department_id,
      ),
  )
}
export function updateBill(bill: Bill) {
  if (bill.status === 'FAILED') return bill
  const rows = billRecords(bill),
    summary = summarize(rows)
  Object.assign(bill, {
    total_cost: summary.cost,
    total_input_tokens: summary.input_tokens,
    total_output_tokens: summary.output_tokens,
    total_cached_tokens: summary.cached_tokens,
    total_requests: summary.requests,
    direct_cost: summarize(rows.filter((r) => !r.project_id)).cost,
    project_cost: summarize(rows.filter((r) => r.project_id)).cost,
  })
  return bill
}
export function refreshCostConsumption(state: State) {
  state.allocations = {}
  const add = (id: string, amount: number) => {
    state.allocations![id] = (state.allocations![id] ?? 0) + amount
  }
  for (const budget of state.departmentBudgets.filter((b) => b.id !== 'hq')) {
    const parent = departments.find((d) => d.id === budget.department_id)?.parent_id
    const source = parent ? effectiveDepartment(state, parent) : undefined
    if (source) add(source.id, budget.budget_amount)
  }
  for (const project of projects().filter(
    (p) => p.status === 'ACTIVE' && p.budget && p.budget.status !== 'DISABLED',
  )) {
    const source = effectiveDepartment(state, costDepartmentId(project.department_id))
    if (source) add(source.id, budgetLedger(project).config?.total ?? 0)
  }
  state.user_costs = {}
  for (const record of expenseRecords.filter((r) => !r.project_id))
    (state.user_costs[record.user_id] ??= []).push({
      date: record.created_at.slice(0, 10),
      amount: record.total_cost,
    })
  for (const budget of [...state.departmentBudgets, ...state.userBudgets]) {
    const scope = costSubtree(budget.department_id)
    const rows = expenseRecords.filter(
      (r) =>
        (!budget.effective_start || r.created_at.slice(0, 10) >= budget.effective_start) &&
        (!budget.effective_end || r.created_at.slice(0, 10) <= budget.effective_end) &&
        (budget.user_id
          ? r.user_id === budget.user_id && !r.project_id
          : scope.includes(
              r.project_department_id
                ? costDepartmentId(r.project_department_id)
                : r.user_department_id,
            )),
    )
    budget.consumed_amount = summarize(rows).cost
    const dates = budgetDates(
      budget.effective_start ?? '',
      budget.effective_end ?? '',
      budget.period_type,
    )
    const amounts =
      budget.allocation === 'CUSTOM'
        ? (budget.period_amounts ?? [])
        : allocateBudget(budget.budget_amount, dates.length)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    budget.periods = dates.map((p, i) => {
      const consumed = summarize(
        rows.filter(
          (r) => r.created_at.slice(0, 10) >= p.start && r.created_at.slice(0, 10) <= p.end,
        ),
      ).cost
      const amount = amounts[i] ?? 0
      return {
        ...p,
        index: i + 1,
        base: amount,
        amount,
        temporary: 0,
        consumed,
        remaining: amount - consumed,
        limit: null,
        state: p.end < today ? 'ENDED' : p.start > today ? 'UPCOMING' : 'CURRENT',
      }
    })
  }
}
export function recordBillItems(
  bill: Bill,
  dimension: Dimension,
  q: Record<string, string>,
  english: boolean,
): BillItem[] {
  const all = billRecords(bill)
  const selected = all.filter(
    (r) =>
      (!q.project_id || r.project_id === q.project_id) &&
      (!q.user_id || r.user_id === q.user_id) &&
      (!q.model_id || r.model_id === q.model_id) &&
      (!q.provider_id || r.provider_id === q.provider_id) &&
      (!q.project_department_ids ||
        q.project_department_ids
          .split(',')
          .some((id) =>
            costSubtree(id).includes(costDepartmentId(r.project_department_id ?? '')),
          )) &&
      (!q.project_department_id ||
        costSubtree(q.project_department_id).includes(
          costDepartmentId(r.project_department_id ?? ''),
        )) &&
      (!q.project_status ||
        projects().find((p) => p.id === r.project_id)?.status === q.project_status) &&
      (!q.department_ids ||
        q.department_ids.split(',').some((id) => costSubtree(id).includes(r.user_department_id))) &&
      (!q.department_id || costSubtree(q.department_id).includes(r.user_department_id)) &&
      (!q.cost_owner_type || r.cost_owner_type === q.cost_owner_type),
  )
  const total = summarize(selected).cost
  const groups = new Map<string, ExpenseRecord[]>()
  if (dimension === 'DEPARTMENT') {
    const scope = costSubtree(q.department_id || bill.department_id)
    const root = q.department_id || bill.department_id
    const targets =
      q.parent_id === ''
        ? departments.filter((d) => d.id === root)
        : q.parent_id !== undefined
          ? departments.filter((d) => d.parent_id === q.parent_id)
          : departments.filter((d) => scope.includes(d.id))
    const ownTargets = q.parent_id
      ? departments.filter((d) => d.id === q.parent_id)
      : q.parent_id === undefined
        ? targets.filter((d) => d.has_children)
        : []
    ownTargets.forEach((d) => {
      const own = selected.filter((r) => r.user_department_id === d.id)
      if (own.length) groups.set(`${d.id}::own`, own)
    })
    targets.forEach((d) =>
      groups.set(
        d.id,
        selected.filter((r) => costSubtree(d.id).includes(r.user_department_id)),
      ),
    )
  } else
    selected.forEach((r) => {
      const id =
        dimension === 'PROJECT'
          ? r.project_id
          : dimension === 'USER'
            ? r.user_id
            : dimension === 'MODEL'
              ? r.model_id
              : r.provider_id
      if (id) groups.set(id, [...(groups.get(id) ?? []), r])
    })
  return [...groups.entries()]
    .filter(([, rows]) => rows.length)
    .map(([id, rows]): BillItem => {
      const r = rows[0]!,
        s = summarize(rows),
        d = departments.find((d) => d.id === id.replace(/::own$/, ''))
      const own = id.endsWith('::own')
      const modelGroups = new Map<string, ExpenseRecord[]>()
      rows.forEach((r) =>
        modelGroups.set(r.model_name, [...(modelGroups.get(r.model_name) ?? []), r]),
      )
      return {
        id,
        dimension,
        dimension_id: own ? id.replace(/::own$/, '') : id,
        dimension_name: own
          ? english
            ? 'This department'
            : '本部门'
          : dimension === 'PROJECT'
            ? r.project_name!
            : dimension === 'USER'
              ? r.username
              : dimension === 'MODEL'
                ? r.model_name
                : dimension === 'PROVIDER'
                  ? r.provider_name
                  : english
                    ? (d?.name_en ?? id)
                    : (d?.name ?? id),
        department_id:
          dimension === 'PROJECT'
            ? costDepartmentId(r.project_department_id!)
            : dimension === 'DEPARTMENT'
              ? id.replace(/::own$/, '')
              : r.user_department_id,
        parent_id: own ? (d?.id ?? null) : (d?.parent_id ?? null),
        has_children: !own && (d?.has_children ?? false),
        own,
        name: dimension === 'USER' ? r.user_name : '',
        department_path:
          dimension === 'PROJECT'
            ? (r.project_department ?? '')
            : dimension === 'USER'
              ? r.user_department
              : english
                ? (d?.path_en ?? '') + (own ? ' / This department' : '')
                : (d?.path ?? '') + (own ? ' / 本部门' : ''),
        service_type: r.provider_id === 'private' ? 'PRIVATE' : 'COMMERCIAL',
        cost: s.cost,
        direct_cost: summarize(rows.filter((r) => !r.project_id)).cost,
        project_cost: summarize(rows.filter((r) => r.project_id)).cost,
        input_tokens: s.input_tokens,
        output_tokens: s.output_tokens,
        cached_tokens: s.cached_tokens,
        request_count: s.requests,
        cost_ratio: total ? (s.cost / total) * 100 : 0,
        details: [...modelGroups.entries()].map(([name, rs]) => {
          const s = summarize(rs)
          return { name, cost: s.cost, tokens: s.tokens, request_count: s.requests }
        }),
      }
    })
    .sort((a, b) => {
      const metric = (r: BillItem) =>
        q.sort_by === 'tokens'
          ? r.input_tokens + r.output_tokens + (r.cached_tokens ?? 0)
          : q.sort_by === 'requests'
            ? r.request_count
            : q.sort_by === 'ratio'
              ? r.cost_ratio
              : r.cost
      return (metric(a) - metric(b)) * (q.direction === 'asc' ? 1 : -1)
    })
}
export function recordBillCsv(items: BillItem[], dimension: Dimension, english: boolean) {
  const columns: { label: string; value: (row: BillItem) => unknown }[] = []
  const add = (zh: string, en: string, value: (row: BillItem) => unknown) =>
    columns.push({ label: english ? en : zh, value })
  add(
    dimension === 'PROJECT' ? '项目名称' : dimension === 'USER' ? '用户名' : '名称',
    dimension === 'PROJECT' ? 'Project' : dimension === 'USER' ? 'Username' : 'Name',
    (r) => (dimension === 'DEPARTMENT' ? r.department_path : r.dimension_name),
  )
  if (dimension === 'USER') add('姓名', 'Name', (r) => r.name)
  if (dimension === 'USER' || dimension === 'PROJECT')
    add(
      dimension === 'PROJECT' ? '项目责任部门' : '使用人部门',
      'Department path',
      (r) => r.department_path,
    )
  if (dimension === 'DEPARTMENT')
    add('统计口径', 'Scope', (r) =>
      r.has_children
        ? english
          ? 'Includes descendants'
          : '含下级'
        : english
          ? 'Direct'
          : '本部门',
    )
  add('消费金额', 'Cost', (r) => r.cost.toFixed(6))
  if (dimension === 'USER' || dimension === 'DEPARTMENT') {
    add('非项目消费', 'Non-project cost', (r) => (r.direct_cost ?? 0).toFixed(6))
    add('项目内消费', 'Project cost', (r) => (r.project_cost ?? 0).toFixed(6))
  }
  add('输入 Token', 'Input Token', (r) => r.input_tokens)
  add('输出 Token', 'Output Token', (r) => r.output_tokens)
  add('缓存 Token', 'Cached Token', (r) => r.cached_tokens ?? 0)
  add('总 Token', 'Total Token', (r) => r.input_tokens + r.output_tokens + (r.cached_tokens ?? 0))
  add('请求次数', 'Requests', (r) => r.request_count)
  add('费用占比（%）', 'Cost ratio (%)', (r) => r.cost_ratio.toFixed(2))
  const escape = (value: unknown) =>
    `"${String(value ?? '')
      .replace(/"/g, '""')
      .replace(/^[=+@-]/, "'$&")}"`
  return (
    '\uFEFF' +
    [columns.map((c) => c.label), ...items.map((r) => columns.map((c) => c.value(r)))]
      .map((row) => row.map(escape).join(','))
      .join('\r\n')
  )
}
