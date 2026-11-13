import {
  updateBill,
  recordBillItems,
  recordBillCsv,
  refreshCostConsumption,
  costDepartmentId,
  costSubtree,
} from './_costBills'
import type { Dimension } from '../src/api/modules/cost'
import { sharedCostState, syncCostUsers } from './_costState'
import {
  handleCost,
  setCostMockActor,
  setCostMockScope,
  costDirectory,
  viewCostBudget,
} from '../src/api/mock/cost'
import { expenseRecords } from './_costRecords'
import { costAnalytics } from './_costAnalytics'
import {
  checkToken,
  checkCsrf,
  fail,
  success,
  unauthorized,
  type MockRequest,
  type MockMethod,
} from './_utils'
import { actor, capable } from './projects'
import { runtimeState, hybridRequests } from './_runtime'
import { projects } from './_projects'
import { budgetLedger } from './_projectBudgets'
export default [
  {
    url: '/api/v1/cost/shared',
    method: 'post',
    rawResponse: async (incoming, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      } catch {
        /* handled as invalid route */
      }
      const req: MockRequest = { headers: incoming.headers, body, url: incoming.url }
      const hybrid = hybridRequests.get(incoming)
      if (hybrid) hybridRequests.set(req, hybrid)
      const handle = async () => {
        if (!checkToken(req)) return unauthorized()
        const method = String(req.body?.method ?? 'get'),
          path = String(req.body?.path ?? '')
        const supported =
          (path === '/bills/generate' && method === 'post') ||
          (/^\/bills(?:\/[^/]+(?:\/(?:items|export))?)?$/.test(path) &&
            !path.endsWith('/generate') &&
            method === 'get') ||
          (path === '/bill-tasks' && ['get', 'post'].includes(method)) ||
          (/^\/bill-tasks\/[^/]+$/.test(path) && ['put', 'delete'].includes(method)) ||
          (/^\/bill-tasks\/[^/]+\/status$/.test(path) && method === 'patch') ||
          (path === '/cost/mock-budget-validation' && method === 'post') ||
          (/^\/cost\/mock-(?:context|users|departments\/[^/]+)$/.test(path) && method === 'get') ||
          (/^\/budgets\/(?:departments|users)$/.test(path) && ['get', 'post'].includes(method)) ||
          (/^\/budgets\/(?:departments|users)\/[^/]+$/.test(path) &&
            ['get', 'put', 'delete'].includes(method)) ||
          (/^\/budgets\/(?:departments|users)\/[^/]+\/analytics$/.test(path) && method === 'get')
        if (!supported) return fail('NOT_FOUND', '')
        const read = method === 'get' || path === '/cost/mock-budget-validation'
        if (!read && !checkCsrf(req)) return fail('FORBIDDEN', '')
        const metadata = path.startsWith('/cost/mock-') && path !== '/cost/mock-budget-validation'
        if (
          !(metadata
            ? ['cost.bills', 'cost.budgets', 'cost.expenses'].some((resource) =>
                capable(req, resource),
              )
            : capable(req, path.startsWith('/bill') ? 'cost.bills' : 'cost.budgets', !read))
        )
          return fail('FORBIDDEN', '')
        syncCostUsers()
        const currentActor = actor(req)!
        if (!currentActor.department_id) return fail('OUT_OF_SCOPE', '')
        const scope = costDepartmentId(currentActor.department_id ?? '')
        const allowed = costSubtree(scope)
        setCostMockScope(scope)
        setCostMockActor(currentActor.id)
        const signature = JSON.stringify(req.body)
        const key = `${currentActor.id}:${String(req.headers?.['idempotency-key'] ?? '')}`
        const commands = runtimeState(
          'costSharedCommands',
          () => new Map<string, { signature: string; result: unknown }>(),
        )
        const previous = commands.get(key)
        if (!read && previous)
          return previous.signature === signature
            ? previous.result
            : fail('IDEMPOTENCY_CONFLICT', '')
        const query = Object.fromEntries(
          Object.entries((req.body?.query as Record<string, unknown>) ?? {})
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)]),
        )
        const payload = (req.body?.body as Record<string, unknown>) ?? {}
        const identifiers = [
          payload.department_id,
          query.department_id,
          query.parent_id,
          query.scope_id,
        ]
          .filter(Boolean)
          .map(String)
        const targetId = path.match(/^\/budgets\/(departments|users)\/([^/]+)/)
        if (targetId)
          identifiers.push(
            targetId[1] === 'departments'
              ? targetId[2]!
              : (costDirectory().users.find((u) => u.id === targetId[2])?.department_id ?? ''),
          )
        if (Array.isArray(payload.department_ids))
          identifiers.push(...payload.department_ids.map(String))
        if (Array.isArray(payload.user_ids))
          for (const id of payload.user_ids)
            identifiers.push(costDirectory().users.find((u) => u.id === id)?.department_id ?? '')
        if (identifiers.some((id) => !allowed.includes(id))) return fail('OUT_OF_SCOPE', '')
        const billId = path.match(/^\/bills\/([^/]+)/)?.[1]
        if (
          billId &&
          billId !== 'generate' &&
          !allowed.includes(sharedCostState.bills.find((b) => b.id === billId)?.department_id ?? '')
        )
          return fail('OUT_OF_SCOPE', '')
        try {
          sharedCostState.bills.forEach((b) => {
            if (b.status === 'GENERATING' && Date.now() - Date.parse(b.generated_at) > 600)
              b.status = 'COMPLETED'
          })
          refreshCostConsumption(sharedCostState)
          sharedCostState.bills.forEach(updateBill)
          const analytics = path.match(/^\/budgets\/(departments|users)\/([^/]+)\/analytics$/)
          if (analytics) {
            const budget = viewCostBudget(sharedCostState, analytics[2]!, analytics[1]!)
            const range = costSubtree(budget.department_id)
            return success(
              costAnalytics(
                expenseRecords.filter(
                  (r) =>
                    (!budget.effective_start ||
                      r.created_at.slice(0, 10) >= budget.effective_start) &&
                    (!budget.effective_end || r.created_at.slice(0, 10) <= budget.effective_end) &&
                    (analytics[1] === 'users'
                      ? r.user_id === budget.user_id && !r.project_id
                      : range.includes(
                          r.project_department_id
                            ? costDepartmentId(r.project_department_id)
                            : r.user_department_id,
                        )),
                ),
              ),
            )
          }
          const itemMatch = path.match(/^\/bills\/([^/]+)\/(items|export)$/)
          if (itemMatch) {
            const bill = sharedCostState.bills.find((b) => b.id === itemMatch[1])
            if (!bill) return fail('NOT_FOUND', '')
            const items = recordBillItems(
              bill,
              query.dimension as Dimension,
              query,
              String(req.headers?.['accept-language']).startsWith('en'),
            )
            if (itemMatch[2] === 'export')
              return success({
                download: recordBillCsv(
                  items,
                  query.dimension as Dimension,
                  String(req.headers?.['accept-language']).startsWith('en'),
                ),
              })
            return success(items)
          }
          if (
            method === 'delete' &&
            targetId?.[1] === 'departments' &&
            !payload.cascade_subtree &&
            projects().some(
              (p) =>
                p.budget && costSubtree(targetId[2]!).includes(costDepartmentId(p.department_id)),
            )
          )
            return fail('STATE_CONFLICT', '')
          const result = handleCost(
            sharedCostState,
            path,
            method,
            query,
            (req.body?.body as Record<string, unknown>) ?? {},
            String(req.headers?.['accept-language']).startsWith('en'),
          )
          if (
            method === 'put' &&
            path === '/budgets/departments/hq' &&
            ['CNY', 'USD'].includes(String(payload.currency))
          )
            for (const project of projects()) {
              const ledger = budgetLedger(project),
                config = ledger.config
              if (config && config.currency !== payload.currency) {
                config.currency = payload.currency as 'CNY' | 'USD'
                ledger.version++
                ledger.history.unshift({
                  id: `currency-${project.id}-${ledger.version}`,
                  action: 'CONFIGURED',
                  at: new Date().toISOString(),
                  actor: currentActor.display_name,
                  amount: config.total,
                  work_order_id: null,
                  configuration: structuredClone(config),
                })
              }
            }
          const describe = (budget: unknown) => {
            if (
              !budget ||
              typeof budget !== 'object' ||
              !('department_id' in budget) ||
              !('user_id' in budget)
            )
              return
            const b = budget as {
              department_id: string
              user_id: string | null
              has_dependents?: boolean
              configured?: boolean
              source_department_id?: string | null
              budget_amount?: number
              consumed_amount?: number
              allocated_amount?: number
              available_amount?: number
            }
            if (b.user_id) return
            const source = b.configured
              ? b.department_id
              : (b.source_department_id ?? b.department_id)
            b.allocated_amount = sharedCostState.allocations?.[source] ?? 0
            b.available_amount =
              Math.round(((b.budget_amount ?? 0) - (b.consumed_amount ?? 0)) * 100) / 100
            const ids = costSubtree(b.department_id)
            b.has_dependents =
              sharedCostState.departmentBudgets.some(
                (r) => r.department_id !== b.department_id && ids.includes(r.department_id),
              ) ||
              sharedCostState.userBudgets.some((r) => ids.includes(r.department_id)) ||
              projects().some((p) => p.budget && ids.includes(costDepartmentId(p.department_id)))
          }
          if (result && typeof result === 'object' && 'items' in result) {
            ;(result.items as unknown[]).forEach(describe)
            if ('headquarters' in result) describe(result.headquarters)
          } else describe(result)
          if (method === 'delete' && targetId?.[1] === 'departments' && payload.cascade_subtree) {
            const scope = costSubtree(targetId[2]!)
            for (const project of projects().filter(
              (p) => scope.includes(costDepartmentId(p.department_id)) && p.budget,
            )) {
              const ledger = budgetLedger(project)
              ledger.history.unshift({
                id: `cascade-${project.id}-${ledger.version}`,
                action: 'REMOVED',
                at: new Date().toISOString(),
                actor: currentActor.display_name,
                amount: 0,
                work_order_id: null,
                configuration: ledger.config ? structuredClone(ledger.config) : null,
              })
              ledger.adjustments.forEach((a) => {
                a.invalidated_at = new Date().toISOString()
              })
              ledger.version++
              project.budget = null
            }
          }
          const response = success(
            result instanceof Blob ? { download: await result.text() } : result,
          )
          if (!read) commands.set(key, { signature, result: response })
          return response
        } catch (error) {
          return fail((error as Error).message, '')
        }
      }
      const result = await handle()
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(result))
    },
  },
] as MockMethod[]
