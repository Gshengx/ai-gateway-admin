import { runtimeState } from './_runtime'
import { projects, departmentPath, projectIds } from './_projects'
import { budgetToday } from './_projectBudgets'
import { modelAccessState } from './_modelAccessState'
import { costDirectory } from '../src/api/mock/cost'
import { syncCostUsers } from './_costState'
import type { ExpenseRecord, ExpenseSummary } from '../src/api/modules/expenses'
const micro = (n: number) => Math.round(n * 1e6) / 1e6
const recordsState = () =>
  runtimeState<ExpenseRecord[]>('expenseRecordsV14Linked2', () => {
    syncCostUsers()
    const records: ExpenseRecord[] = []
    const { users, departments } = costDirectory()
    const year = budgetToday().slice(0, 4)
    const make = (
      user: (typeof users)[number],
      project: ReturnType<typeof projects>[number] | null,
      amount: number,
      month: number,
      index: number,
    ) => {
      const unknown = index % 37 === 0,
        zeroPrice = index % 31 === 0
      const input = unknown ? null : 800 + ((index * 17) % 3200),
        output = unknown ? null : 100 + ((index * 13) % 800),
        cached = unknown ? null : index % 3 ? 0 : 120
      const cost = unknown || zeroPrice ? 0 : micro(amount)
      const modelIndex = index % 4
      const candidates = modelAccessState.models.filter((m) =>
        project ? project.model_ids.includes(m.id) : m.status === 'ACTIVE',
      )
      const physical = candidates[modelIndex % candidates.length]
      if (!physical) return
      const model = physical.model_id_at_gateway
      const n = records.length + 1
      const cacheCost = cached ? micro(cost * 0.05) : 0
      const inputCost = micro(cost * (cached ? 0.6 : 0.65)),
        outputCost = micro(cost - inputCost - cacheCost)
      const dept = departments.find((d) => d.id === user.department_id)
      records.push({
        id: `expense-${n}`,
        request_id: `req-${year}-${String(n).padStart(8, '0')}`,
        created_at: `${year}-${String(month).padStart(2, '0')}-${String(1 + (index % (month === Number(budgetToday().slice(5, 7)) ? Math.max(1, Number(budgetToday().slice(8, 10)) - 1) : 28))).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:15:00Z`,
        cost_owner_type: project ? 'PROJECT' : 'USER_DEPARTMENT',
        project_id: project?.id ?? null,
        project_name: project?.name ?? null,
        project_department_id: project?.department_id ?? null,
        project_department: project ? departmentPath(project.department_id) : null,
        user_id: user.id,
        username: user.username,
        user_name: user.name,
        user_department_id: user.department_id,
        user_department: dept?.path ?? '',
        api_key_id: `key-cost-${user.id}`,
        api_key_name: `${user.username}-default`,
        model_id: physical.id,
        model_name: model,
        provider_id: physical.provider_id,
        provider_name: physical.provider_name,
        input_tokens: input,
        output_tokens: output,
        cached_tokens: cached,
        total_tokens: input === null ? null : input + output! + cached!,
        total_cost: cost,
        currency: 'CNY',
        status: index % 29 === 0 && cost > 0 ? 'FAILED' : index % 43 === 0 ? 'PARTIAL' : 'SUCCESS',
        usage_source: unknown ? 'GATEWAY' : 'PROVIDER',
        raw_usage: unknown
          ? null
          : { prompt_tokens: input!, completion_tokens: output!, cached_tokens: cached! },
        normalized_usage: unknown
          ? null
          : { input_tokens: input!, output_tokens: output!, cached_tokens: cached! },
        price_snapshot_version: `price-${model}-v1`,
        billing_items: unknown
          ? []
          : [
              {
                name: 'INPUT_TOKENS',
                usage: input!,
                unit: 'TOKEN',
                price: input ? (inputCost / input) * 1e6 : 0,
                subtotal: inputCost,
              },
              {
                name: 'OUTPUT_TOKENS',
                usage: output!,
                unit: 'TOKEN',
                price: output ? (outputCost / output) * 1e6 : 0,
                subtotal: outputCost,
              },
              ...(cached
                ? [
                    {
                      name: 'CACHED_TOKENS',
                      usage: cached,
                      unit: 'TOKEN',
                      price: (cacheCost / cached) * 1e6,
                      subtotal: cacheCost,
                    },
                  ]
                : []),
            ],
        error_code: index % 29 === 0 && cost > 0 ? 'UPSTREAM_DISCONNECTED' : null,
        error_message:
          index % 29 === 0 && cost > 0
            ? 'Upstream connection closed after partial consumption'
            : null,
      })
    }
    for (let month = 1; month <= Number(budgetToday().slice(5, 7)); month++) {
      users
        .filter((u) => departments.some((d) => d.id === u.department_id))
        .forEach((u, i) => {
          for (let n = 0; n < 5; n++) make(u, null, 1 + ((i * 13 + n * 7) % 85), month, i * 5 + n)
        })
    }
    projects().forEach((p) => {
      const matching = users.filter((u) => projectIds(p).includes(u.id))
      matching.forEach((user, i) => {
        const amount = p.usage[user.id]?.amount ?? 0
        const start = records.length
        for (let n = 0; amount > 0 && n < 6; n++)
          make(user, p, amount / 6, Number(budgetToday().slice(5, 7)), i * 6 + n + 1)
        const rows = records.slice(start)
        const last = [...rows].reverse().find((r) => r.billing_items.length && r.total_cost > 0)
        if (last) {
          const extra = micro(amount - rows.reduce((sum, r) => sum + r.total_cost, 0))
          last.total_cost = micro(last.total_cost + extra)
          last.billing_items[1]!.subtotal = micro(last.billing_items[1]!.subtotal + extra)
          last.billing_items[1]!.price =
            (last.billing_items[1]!.subtotal / last.billing_items[1]!.usage) * 1e6
        }
        p.usage[user.id] = {
          amount: micro(rows.reduce((sum, r) => sum + r.total_cost, 0)),
          requests: rows.length,
          tokens: rows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
        }
        const models = new Map<string, typeof rows>()
        rows.forEach((r) => models.set(r.model_id, [...(models.get(r.model_id) ?? []), r]))
        p.ranking[user.id] = [...models.entries()].map(([id, rs]) => ({
          id,
          name: rs[0]!.model_name,
          provider: rs[0]!.provider_name,
          amount: micro(rs.reduce((sum, r) => sum + r.total_cost, 0)),
          requests: rs.length,
          tokens: rs.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
          input_tokens: rs.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0),
          output_tokens: rs.reduce((sum, r) => sum + (r.output_tokens ?? 0), 0),
          cache_tokens: rs.reduce((sum, r) => sum + (r.cached_tokens ?? 0), 0),
        }))
      })
    })
    return records
  })
// Mock route files load before identity initialization. Delay fixtures until the
// first authenticated request so project membership and model IDs are available.
export const expenseRecords: ExpenseRecord[] = new Proxy([] as ExpenseRecord[], {
  get(_target, key) {
    const source = recordsState()
    const value = Reflect.get(source, key, source)
    return typeof value === 'function' ? value.bind(source) : value
  },
})
export function summarize(records: ExpenseRecord[]): ExpenseSummary {
  const sum = (
    key: 'total_cost' | 'input_tokens' | 'output_tokens' | 'cached_tokens' | 'total_tokens',
  ) => micro(records.reduce((n, r) => n + (r[key] ?? 0), 0))
  return {
    cost: sum('total_cost'),
    input_tokens: sum('input_tokens'),
    output_tokens: sum('output_tokens'),
    cached_tokens: sum('cached_tokens'),
    tokens: sum('total_tokens'),
    requests: records.length,
    average: records.length ? micro(sum('total_cost') / records.length) : 0,
  }
}
export function filterExpenses(query: Record<string, unknown>, records = expenseRecords) {
  const text = (k: string) => String(query[k] ?? '')
  const keyword = text('search').toLowerCase()
  const department = text('department_id')
  const departmentPathValue = costDirectory().departments.find((d) => d.id === department)?.path
  return records.filter(
    (r) =>
      (!keyword ||
        `${r.request_id} ${r.user_name} ${r.username} ${r.model_name} ${r.project_name ?? ''}`
          .toLowerCase()
          .includes(keyword)) &&
      (!text('cost_owner_type') || r.cost_owner_type === text('cost_owner_type')) &&
      (!text('project_id') || r.project_id === text('project_id')) &&
      (!department ||
        r.user_department_id === department ||
        Boolean(departmentPathValue && r.user_department.startsWith(`${departmentPathValue} /`))) &&
      (!text('project_department_id') ||
        r.project_department_id === text('project_department_id') ||
        ((
          { 'd-root': 'hq', 'd-algo': 'algorithm', 'd-ops': 'operations' } as Record<string, string>
        )[r.project_department_id ?? ''] ?? r.project_department_id?.replace(/^d-/, '')) ===
          text('project_department_id')) &&
      (!text('user_id') || r.user_id === text('user_id')) &&
      (!text('model_id') || r.model_id === text('model_id')) &&
      (!text('provider_id') || r.provider_id === text('provider_id')) &&
      (!text('status') || r.status === text('status')) &&
      (!text('start') || r.created_at.slice(0, 10) >= text('start')) &&
      (!text('end') || r.created_at.slice(0, 10) <= text('end')) &&
      (!text('min_cost') || r.total_cost >= Number(query.min_cost)) &&
      (!text('max_cost') || r.total_cost <= Number(query.max_cost)) &&
      (!text('min_tokens') || (r.total_tokens ?? 0) >= Number(query.min_tokens)) &&
      (!text('max_tokens') || (r.total_tokens ?? 0) <= Number(query.max_tokens)) &&
      (!text('has_project') || Boolean(r.project_id) === (text('has_project') === 'YES')),
  )
}
