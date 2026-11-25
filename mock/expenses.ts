import { costDepartmentNodes, costFilterOptions } from './_costFilterOptions'
import { expenseRecords, filterExpenses, summarize } from './_expenseRecords'
import { route, page, value } from './_expenseRoute'
import { visibleExpenses, costState, billRecords } from './_costState'
import { canScope } from './_costDirectory'
import { success, fail, auditedMock, type MockRequest } from './_utils'
const expenseRoute = (path: string, method: 'get' | 'post', handler: Parameters<typeof route>[2]) =>
  route(path, method, handler, 'cost.expenses', path === '/cost/records-export' ? false : undefined)
function scoped(req: MockRequest) {
  const source = visibleExpenses(req)
  const billId = String(req.query?.bill_id ?? req.body?.bill_id ?? '')
  if (!billId) return source
  const bill = costState().bills.find((b) => b.id === billId)
  return bill && canScope(req, bill.scopeType, bill.scopeId) ? billRecords(bill, source) : []
}
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
  expenseRoute('/cost/expense-departments', 'get', (req) => {
    const departments = costDepartmentNodes(req)
    const ids = new Set(departments.map((d) => d.id))
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
  expenseRoute('/cost/record-options', 'get', (req) => success(costFilterOptions(req))),
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
    const records = body.range === 'ALL' ? visibleExpenses(req) : filterExpenses(body, scoped(req))
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
        ...records.map((r) =>
          fields.map((key) =>
            ['fee_subject_name', 'cost_center_name'].includes(key) &&
            r.control_status === 'UNCONTROLLED'
              ? value(req, 'locale').startsWith('en')
                ? 'Uncontrolled'
                : '未管控'
              : (r as unknown as Record<string, unknown>)[key],
          ),
        ),
      ]
        .map((row) => row.map(escape).join(','))
        .join('\r\n')
    return success({ content, count: records.length })
  }),
])
