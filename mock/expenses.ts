import { expenseRecords, filterExpenses, summarize } from './_expenseRecords'
import { route, page, value, actor } from './_expenseRoute'
import { expenseSubtree } from './_expenseDirectory'
import { success, fail, auditedMock, type MockRequest } from './_utils'
const expenseRoute = (path: string, method: 'get' | 'post', handler: Parameters<typeof route>[2]) =>
  route(path, method, handler, 'cost.expenses', path === '/cost/records-export' ? false : undefined)
function scoped(req: MockRequest) {
  if (!actor(req)?.department_id) return []
  const ids = expenseSubtree(actor(req)!.department_id!)
  return expenseRecords.filter((r) => ids.includes(r.user_department_id))
}
const options = (key: 'user' | 'model' | 'provider', source = expenseRecords) =>
  [
    ...new Map(
      source.map((r) =>
        key === 'user'
          ? [r.user_id, `${r.user_name} (${r.username})`]
          : key === 'model'
            ? [r.model_id, r.model_name]
            : [r.provider_id, r.provider_name],
      ),
    ).entries(),
  ].map(([value, label]) => ({ value, label }))
function sorted(req: MockRequest) {
  const items = filterExpenses(req.query ?? {}, scoped(req))
  const key = value(req, 'sort_by') as
    'created_at' | 'input_tokens' | 'output_tokens' | 'total_tokens' | 'total_cost'
  const field = [
    'created_at',
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'total_cost',
  ].includes(key)
    ? key
    : 'created_at'
  const direction = value(req, 'direction') === 'asc' ? 1 : -1
  return items.sort(
    (a, b) =>
      (typeof a[field] === 'string'
        ? String(a[field]).localeCompare(String(b[field]))
        : Number(a[field] ?? -1) - Number(b[field] ?? -1)) * direction || a.id.localeCompare(b.id),
  )
}
export default auditedMock([
  expenseRoute('/cost/record-options', 'get', (req) =>
    success({
      users: options('user', scoped(req)),
      models: options('model', scoped(req)),
      providers: options('provider', scoped(req)),
    }),
  ),
  expenseRoute('/cost/records', 'get', (req) => {
    const records = sorted(req)
    return success({ ...page(records, req), summary: summarize(records) })
  }),
  expenseRoute('/cost/records/:id', 'get', (req) => {
    const id = String(req.url).split('?')[0]!.split('/').pop()
    const record = scoped(req).find((r) => r.id === id)
    return record ? success(record) : fail('NOT_FOUND', '')
  }),
  expenseRoute('/cost/records-export', 'post', (req) => {
    const body = req.body ?? {}
    const records = body.range === 'ALL' ? scoped(req) : filterExpenses(body, scoped(req))
    const fields = Array.isArray(body.fields)
      ? body.fields
          .filter((key) => Object.keys(expenseRecords[0]!).includes(String(key)))
          .map(String)
      : []
    if (!fields.length) return fail('VALIDATION_FAILED', '')
    const escape = (v: unknown) =>
      `"${String(v ?? '')
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&")}"`
    const content =
      '\uFEFF' +
      [
        fields,
        ...records.map((r) => fields.map((key) => (r as unknown as Record<string, unknown>)[key])),
      ]
        .map((row) => row.map(escape).join(','))
        .join('\r\n')
    return success({ content, count: records.length })
  }),
])
