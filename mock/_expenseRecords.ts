import { runtimeState } from './_runtime'
import { expenseDirectory, expenseToday } from './_expenseDirectory'
import { modelAccessState } from './_modelAccessState'
import './modelAccess'
import type { ExpenseRecord, ExpenseSummary } from '../src/api/modules/expenses'
const micro = (n: number) => Math.round(n * 1e6) / 1e6
const recordsState = () =>
  runtimeState<ExpenseRecord[]>('expenseRecordsWithoutAssignments', () => {
    const records: ExpenseRecord[] = []
    const { users, departments } = expenseDirectory()
    const year = expenseToday().slice(0, 4)
    const make = (user: (typeof users)[number], amount: number, month: number, index: number) => {
      const unknown = index % 37 === 0,
        zeroPrice = index % 31 === 0
      const input = unknown ? null : 800 + ((index * 17) % 3200),
        output = unknown ? null : 100 + ((index * 13) % 800),
        cached = unknown ? null : index % 3 ? 0 : 120
      const cost = unknown || zeroPrice ? 0 : micro(amount)
      const modelIndex = index % 4
      const candidates = modelAccessState.models.filter((m) => m.status === 'ACTIVE')
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
        created_at: `${year}-${String(month).padStart(2, '0')}-${String(1 + (index % (month === Number(expenseToday().slice(5, 7)) ? Math.max(1, Number(expenseToday().slice(8, 10)) - 1) : 28))).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:15:00Z`,
        cost_owner_type: 'USER_DEPARTMENT',
        user_id: user.id,
        username: user.username,
        user_name: user.name,
        user_department_id: user.department_id ?? '',
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
    for (let month = 1; month <= Number(expenseToday().slice(5, 7)); month++) {
      users
        .filter((u) => departments.some((d) => d.id === u.department_id))
        .forEach((u, i) => {
          for (let n = 0; n < 5; n++) make(u, 1 + ((i * 13 + n * 7) % 85), month, i * 5 + n)
        })
    }
    return records
  })
// Mock route files load before identity initialization. Delay fixtures until the
// first authenticated request so identity and model IDs are available.
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
  const departmentPathValue = expenseDirectory().departments.find((d) => d.id === department)?.path
  return records.filter(
    (r) =>
      (!keyword ||
        `${r.request_id} ${r.user_name} ${r.username} ${r.model_name}`
          .toLowerCase()
          .includes(keyword)) &&
      (!text('cost_owner_type') || r.cost_owner_type === text('cost_owner_type')) &&
      (!department ||
        r.user_department_id === department ||
        Boolean(departmentPathValue && r.user_department.startsWith(`${departmentPathValue} /`))) &&
      (!text('user_id') || r.user_id === text('user_id')) &&
      (!text('model_id') || r.model_id === text('model_id')) &&
      (!text('provider_id') || r.provider_id === text('provider_id')) &&
      (!text('status') || r.status === text('status')) &&
      (!text('start') || r.created_at.slice(0, 10) >= text('start')) &&
      (!text('end') || r.created_at.slice(0, 10) <= text('end')) &&
      (!text('min_cost') || r.total_cost >= Number(query.min_cost)) &&
      (!text('max_cost') || r.total_cost <= Number(query.max_cost)) &&
      (!text('min_tokens') || (r.total_tokens ?? 0) >= Number(query.min_tokens)) &&
      (!text('max_tokens') || (r.total_tokens ?? 0) <= Number(query.max_tokens)),
  )
}
