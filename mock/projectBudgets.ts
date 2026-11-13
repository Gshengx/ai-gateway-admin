import { sharedCostState, syncCostUsers } from './_costState'
import { costUserFor, viewCostBudget, seedBudget, costDirectory } from '../src/api/mock/cost'
import { directory, runtimeState, nextSequence, existingState } from './_runtime'
import { projects, projectRole, departmentPath } from './_projects'
import {
  budgetLedger,
  budgetState,
  budgetToday,
  configureBudget,
  validBudgetConfig,
  roundMoney,
} from './_projectBudgets'
import { actor, route, value, page, view, userCapable, capable } from './projects'
import { success, fail, auditedMock, type MockRequest, type MockMethod } from './_utils'
import { allocateBudget, budgetDates } from '../src/utils/projectBudget'
import { costDepartmentId, costSubtree, refreshCostConsumption } from './_costBills'
import type { BudgetWorkOrder, ProjectBudgetConfig } from '../src/api/modules/projectBudgets'
import { costAnalytics } from './_costAnalytics'
import { expenseRecords } from './_costRecords'

const orders = runtimeState<BudgetWorkOrder[]>('projectBudgetOrders', () => [])
function ensureOrderFixtures() {
  const marker = runtimeState('budgetOrderFixturesV14Complete2', () => ({ ready: false }))
  if (marker.ready) return
  syncCostUsers()
  const root = [...directory.values()].find((u) => u.username === 'mock_admin')
  const first = [...directory.values()].find(
    (u) =>
      u.status === 'ACTIVE' &&
      u.role_id === 'role-user' &&
      userCapable(u, 'personal.work_orders', true) &&
      u.id !== root?.id,
  )
  if (!root || !first) return
  const insert = (order: BudgetWorkOrder) => {
    if (!orders.some((existing) => existing.id === order.id)) orders.push(order)
  }
  const step = (status: 'APPROVED' | 'REJECTED' | 'PENDING', at: string, applicantId = root.id) =>
    [
      first,
      applicantId === root.id
        ? ([...directory.values()].find((u) => u.username === 'admin') ?? root)
        : root,
    ].map((u) => ({
      approver_id: u.id,
      approver_name: u.display_name,
      status,
      at,
      comment: '',
      adjustment_reason: '',
      amount: null,
    }))
  const make = (id: string, number: string, applicant: typeof root): BudgetWorkOrder => ({
    id,
    number,
    target: 'PERSONAL',
    project_id: '',
    project_name: applicant.display_name,
    department: departmentPath(applicant.department_id),
    applicant_id: applicant.id,
    applicant_name: applicant.display_name,
    applicant_username: applicant.username,
    mode: 'PERMANENT',
    per_period_amount: 1000,
    valid_until: null,
    reason: '季度 AI 使用预算申请',
    first_approver_id: first.id,
    requested_amount: 1000,
    approved_amount: 1000,
    approved_until: null,
    period_count: 1,
    budget_version: 0,
    status: 'REJECTED',
    execution: 'NOT_EXECUTED',
    execution_error: null,
    created_at: '2026-09-08T01:00:00Z',
    updated_at: '2026-09-08T03:00:00Z',
    level: 1,
    version: 2,
    can_approve: false,
    can_withdraw: false,
    steps: step('REJECTED', '2026-09-08T03:00:00Z', applicant.id),
    budget_context: { amount: 0, consumed: 0, remaining: 0 },
  })
  const rejected = make('order-seed-rejected', 'WO-2026-0097', root)
  rejected.steps[0]!.comment = '申请用途已调整，请重新确认预算需求。'
  rejected.steps[1]!.status = 'PENDING'
  rejected.steps[1]!.at = null
  const withdrawn = make('order-seed-withdrawn', 'WO-2026-0098', root)
  withdrawn.status = 'WITHDRAWN'
  withdrawn.steps.forEach((s) => {
    s.status = 'PENDING'
    s.at = null
  })
  insert(rejected)
  insert(withdrawn)
  for (const budget of sharedCostState.userBudgets)
    for (const adjustment of budget.adjustments) {
      const applicant = [...directory.values()].find((u) => u.id === budget.user_id)
      if (!applicant) continue
      const order = make(`order-seed-${adjustment.id}`, adjustment.source_work_order_id, applicant)
      Object.assign(order, {
        mode: 'TEMPORARY',
        per_period_amount: adjustment.additional_amount,
        requested_amount: adjustment.additional_amount,
        approved_amount: adjustment.additional_amount,
        valid_until: adjustment.valid_until.slice(0, 10),
        approved_until: adjustment.valid_until.slice(0, 10),
        status: 'APPROVED',
        execution: 'APPLIED',
        created_at: adjustment.valid_from,
        updated_at: adjustment.valid_from,
        level: 2,
        steps: step('APPROVED', adjustment.valid_from, applicant.id),
      })
      order.steps.forEach((s) => {
        s.amount = adjustment.additional_amount
      })
      insert(order)
    }
  for (const project of projects()) {
    const state = budgetState(project)
    const applicant = [...directory.values()].find((u) => u.id === project.admin_ids[0])
    if (!applicant) continue
    for (const adjustment of state.adjustments) {
      const order = make(`order-seed-${adjustment.id}`, adjustment.work_order_id, applicant)
      Object.assign(order, {
        target: 'PROJECT',
        project_id: project.id,
        project_name: project.name,
        department: departmentPath(project.department_id),
        mode: adjustment.mode,
        per_period_amount: adjustment.amount,
        requested_amount: adjustment.amount,
        approved_amount: adjustment.amount,
        valid_until: adjustment.end,
        approved_until: adjustment.end,
        budget_version: state.version,
        status: 'APPROVED',
        execution: 'APPLIED',
        level: 2,
        created_at: adjustment.created_at,
        updated_at: adjustment.created_at,
        steps: step('APPROVED', adjustment.created_at, applicant.id),
        budget_context: {
          currency: state.config?.currency ?? 'CNY',
          amount: state.current?.base ?? 0,
          consumed: state.current?.consumed ?? 0,
          remaining: state.current?.remaining ?? 0,
        },
      })
      order.steps.forEach((s) => {
        s.amount = adjustment.amount
      })
      insert(order)
    }
  }
  // Pending fixtures use the same live budget snapshots and approval actors as
  // submitted applications; they can be approved, rejected or withdrawn normally.
  const admin = [...directory.values()].find((u) => u.username === 'admin')
  const project = projects().find((p) => p.id === 'project-10')
  if (!admin || !project || !budgetState(project).current) return
  refreshCostConsumption(sharedCostState)
  for (const target of ['PROJECT', 'PERSONAL'] as const) {
    for (const level of [1, 2]) {
      const applicant = level === 1 ? root : admin
      const state = budgetState(project)
      const personal = viewCostBudget(sharedCostState, costUserFor(applicant).id, 'users')
      const order = make(
        `order-seed-${target.toLowerCase()}-${level}`,
        `WO-2026-${target === 'PROJECT' ? '010' : '011'}${level}`,
        applicant,
      )
      const permanent = level === 1
      const periods = target === 'PROJECT' ? state.periods : (personal.periods ?? [])
      const count = periods.filter((p) => p.state !== 'ENDED').length || 1
      const current = target === 'PROJECT' ? state.current! : personal.current
      Object.assign(order, {
        target,
        project_id: target === 'PROJECT' ? project.id : '',
        project_name: target === 'PROJECT' ? project.name : applicant.display_name,
        mode: permanent ? 'PERMANENT' : 'TEMPORARY',
        per_period_amount: 100,
        requested_amount: permanent ? 100 * count : 100,
        approved_amount: permanent ? 100 * count : 100,
        period_count: count,
        valid_until: permanent ? null : budgetToday(),
        approved_until: permanent ? null : budgetToday(),
        budget_version: target === 'PROJECT' ? state.version : personal.history.length,
        status: 'PENDING',
        level,
        version: level,
        reason:
          target === 'PROJECT'
            ? '项目知识库评测增加调用量，申请补充预算。'
            : '本月研发验证任务增加，申请补充本人预算。',
        created_at: `${budgetToday()}T01:00:00Z`,
        updated_at: `${budgetToday()}T02:00:00Z`,
        steps: step('PENDING', '', applicant.id),
        budget_context: {
          currency: target === 'PROJECT' ? state.config!.currency : personal.currency,
          amount: current?.amount ?? 0,
          consumed: current?.consumed ?? 0,
          remaining: current?.remaining ?? 0,
        },
      })
      order.steps.forEach((s, index) => {
        s.at = null
        if (level === 2 && index === 0) {
          s.status = 'APPROVED'
          s.amount = order.approved_amount
          s.at = `${budgetToday()}T02:00:00Z`
          s.comment = '已核实申请用途，提交二级审批。'
        }
      })
      insert(order)
    }
  }
  orders.sort((a, b) => b.created_at.localeCompare(a.created_at))
  nextSequence('projectBudgetOrders', 130)
  marker.ready = true
}
const inScope = (p: ReturnType<typeof projects>[number], req: MockRequest) =>
  costSubtree(costDepartmentId(actor(req)?.department_id ?? '')).includes(
    costDepartmentId(p.department_id),
  )
const projectId = (req: MockRequest) =>
  String(req.url ?? '')
    .split('?')[0]!
    .split('/project-budgets/')[1]
    ?.split('/')[0]
const findProject = (req: MockRequest) => projects().find((p) => p.id === projectId(req))
const orderId = (req: MockRequest) =>
  String(req.url ?? '')
    .split('?')[0]!
    .split('/')
    .find((part) => part.startsWith('order-'))
const findOrder = (req: MockRequest) => orders.find((o) => o.id === orderId(req))
function projectRecord(p: ReturnType<typeof projects>[number], req: MockRequest) {
  const state = budgetState(p)
  return {
    project: view(p, req),
    ...state,
    ...(state.status === 'DISABLED' ? { config: null, current: null, periods: [] } : {}),
  }
}
function flow(req: MockRequest) {
  const me = actor(req)?.id
  const users = [...directory.values()].filter(
    (u) =>
      u.status === 'ACTIVE' &&
      u.id !== me &&
      (!existingState('hybridMode') || u.username.startsWith('local_approver_')) &&
      userCapable(u, 'personal.work_orders', true),
  )
  const second =
    users.find((u) => u.username === 'mock_admin') ??
    users.find((u) => u.role_id === 'role-super-admin') ??
    users[0]
  return { second, first: users.filter((u) => u.id !== second?.id) }
}
function visible(o: BudgetWorkOrder, req: MockRequest) {
  const id = actor(req)?.id
  return o.applicant_id === id || o.steps.some((s) => s.approver_id === id)
}
function orderView(o: BudgetWorkOrder, req: MockRequest) {
  const id = actor(req)?.id
  return {
    ...o,
    can_approve:
      o.status === 'PENDING' &&
      o.steps[o.level - 1]?.approver_id === id &&
      capable(req, 'personal.work_orders', true),
    can_withdraw:
      o.status === 'PENDING' && o.applicant_id === id && capable(req, 'personal.work_orders', true),
  }
}
const budgetRoute = (path: string, method: 'get' | 'post', handler: Parameters<typeof route>[2]) =>
  route(path, method, handler, 'cost.budgets')
const orderRoute = (path: string, method: 'get' | 'post', handler: Parameters<typeof route>[2]) =>
  route(
    path,
    method,
    (req) => {
      ensureOrderFixtures()
      return handler(req)
    },
    'personal.work_orders',
  )
export default auditedMock([
  budgetRoute('/project-budgets', 'get', (req) => {
    let items = projects()
      .filter((p) => inScope(p, req))
      .filter(
        (p) =>
          !value(req, 'search') ||
          p.name.toLowerCase().includes(value(req, 'search').toLowerCase()),
      )
    const department = value(req, 'department_id')
    if (department) {
      const path = departmentPath(department)
      items = items.filter(
        (p) =>
          p.department_id === department || departmentPath(p.department_id).startsWith(`${path}/`),
      )
    }
    const records = items
      .map((p) => projectRecord(p, req))
      .filter((p) => !value(req, 'status') || p.status === value(req, 'status'))
    return success(page(records, req))
  }),
  budgetRoute('/project-budgets/configure', 'post', (req) => {
    const ids = Array.isArray(req.body?.project_ids)
      ? [...new Set(req.body.project_ids.map(String))]
      : []
    const config = req.body?.configuration as ProjectBudgetConfig
    const versions = req.body?.versions as Record<string, number> | undefined
    const selected = ids.map((id) => projects().find((p) => p.id === id))
    if (
      !ids.length ||
      selected.some((p) => !p || !inScope(p, req)) ||
      !validBudgetConfig(config) ||
      new Set(selected.map((p) => p!.department_id)).size !== 1
    )
      return fail('VALIDATION_FAILED', '')
    if (
      selected.some((p) => p!.status !== 'ACTIVE' || versions?.[p!.id] !== budgetLedger(p!).version)
    )
      return fail('STATE_CONFLICT', '')
    refreshCostConsumption(sharedCostState)
    const source = viewCostBudget(
      sharedCostState,
      costDepartmentId(selected[0]!.department_id),
      'departments',
    )
    const total = config.total * selected.length
    if (
      (!source.configured && source.status !== 'INHERITED') ||
      config.currency !== source.currency ||
      ['MONTHLY', 'QUARTERLY', 'YEARLY'].indexOf(config.period_type) >
        ['MONTHLY', 'QUARTERLY', 'YEARLY'].indexOf(source.period_type) ||
      config.start < source.effective_start! ||
      config.end > source.effective_end! ||
      total > source.budget_amount - source.consumed_amount ||
      selected.some((p) => config.total < budgetState(p!).consumed)
    )
      return fail('VALIDATION_FAILED', '')
    const allowedUsers = costDirectory().users.filter(
      (u) =>
        u.active &&
        costSubtree(costDepartmentId(actor(req)?.department_id ?? '')).includes(u.department_id),
    )
    for (const level of ['WARNING', 'CRITICAL', 'EXCEEDED'] as const) {
      if (
        (config.channels[level].length && !config.recipients[level].length) ||
        config.recipients[level].some((id) => !allowedUsers.some((u) => u.id === id)) ||
        (config.channels[level].includes('EMAIL') &&
          config.recipients[level].some(
            (id) =>
              !allowedUsers.find((u) => u.id === id)?.email ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedUsers.find((u) => u.id === id)!.email!),
          ))
      )
        return fail('VALIDATION_FAILED', '')
    }
    const periods =
      config.allocation === 'CUSTOM'
        ? config.amounts
        : allocateBudget(
            config.total,
            budgetDates(config.start, config.end, config.period_type).length,
          )
    if (
      periods.some((amount, i) =>
        config.member_limit_mode === 'FIXED'
          ? config.member_limit > amount
          : config.member_limit_mode === 'CUSTOM'
            ? (config.member_limits[i] ?? 0) > amount
            : false,
      )
    )
      return fail('VALIDATION_FAILED', '')
    for (const p of selected) configureBudget(p!, config, actor(req)!.display_name)
    return success({ applied: true, project_ids: ids })
  }),
  budgetRoute('/project-budgets/:id', 'get', (req) => {
    const p = findProject(req)
    return p && inScope(p, req) ? success(projectRecord(p, req)) : fail('OUT_OF_SCOPE', '')
  }),
  budgetRoute('/project-budgets/:id/analytics', 'get', (req) => {
    const project = findProject(req)
    if (!project || !inScope(project, req)) return fail('OUT_OF_SCOPE', '')
    const config = budgetLedger(project).config
    return success(
      costAnalytics(
        expenseRecords.filter(
          (r) =>
            r.project_id === project.id &&
            (!config ||
              (r.created_at.slice(0, 10) >= config.start &&
                r.created_at.slice(0, 10) <= config.end)),
        ),
      ),
    )
  }),
  budgetRoute('/project-budgets/:id/remove', 'post', (req) => {
    const p = findProject(req)
    if (!p) return fail('NOT_FOUND', '')
    if (!inScope(p, req)) return fail('OUT_OF_SCOPE', '')
    const ledger = budgetLedger(p)
    if (p.status !== 'ACTIVE' || !p.budget || ledger.version !== req.body?.version)
      return fail('STATE_CONFLICT', '')
    ledger.history.unshift({
      id: `budget-history-${nextSequence('projectBudgetHistory')}`,
      action: 'REMOVED',
      at: new Date().toISOString(),
      actor: actor(req)!.display_name,
      amount: 0,
      work_order_id: null,
      configuration: ledger.config ? structuredClone(ledger.config) : null,
    })
    ledger.version++
    ledger.adjustments.forEach((adjustment) => {
      adjustment.invalidated_at = new Date().toISOString()
    })
    p.budget = null
    return success({ applied: true, id: p.id })
  }),
  orderRoute('/me/project-budget-order-options', 'get', (req) => {
    const f = flow(req)
    syncCostUsers()
    const personal = viewCostBudget(sharedCostState, costUserFor(actor(req)!).id, 'users')
    return success({
      personal_budget: personal,
      projects: projects()
        .filter(
          (p) =>
            p.status === 'ACTIVE' &&
            projectRole(p, actor(req)!.id) === 'ADMIN' &&
            p.budget &&
            budgetState(p).status !== 'DISABLED' &&
            budgetState(p).current,
        )
        .map((p) => projectRecord(p, req)),
      approvers: f.first.map((u) => ({
        id: u.id,
        name: u.display_name,
        display_name: `${u.display_name}（${u.username}）`,
      })),
      second_approver: f.second
        ? { id: f.second.id, name: f.second.display_name, display_name: f.second.display_name }
        : null,
    })
  }),
  orderRoute('/me/project-budget-orders', 'get', (req) => {
    const id = actor(req)!.id,
      tab = value(req, 'tab')
    const pending = (o: BudgetWorkOrder) =>
      o.status === 'PENDING' && o.steps[o.level - 1]?.approver_id === id
    const items = orders
      .filter((o) =>
        tab === 'pending'
          ? pending(o)
          : tab === 'processed'
            ? o.steps.some((s) => s.approver_id === id && s.status !== 'PENDING')
            : o.applicant_id === id,
      )
      .filter(
        (o) =>
          (!value(req, 'search') ||
            `${o.number} ${o.project_name} ${o.reason}`
              .toLowerCase()
              .includes(value(req, 'search').toLowerCase())) &&
          (!value(req, 'status') || o.status === value(req, 'status')) &&
          (!value(req, 'mode') || o.mode === value(req, 'mode')),
      )
    return success({
      ...page(
        items.map((o) => orderView(o, req)),
        req,
      ),
      pending_count: orders.filter(pending).length,
    })
  }),
  orderRoute('/me/project-budget-orders', 'post', (req) => {
    const body = req.body ?? {},
      p = projects().find((p) => p.id === body.project_id),
      me = actor(req)!
    const personal = body.target === 'PERSONAL'
    syncCostUsers()
    const userBudget = viewCostBudget(sharedCostState, costUserFor(me).id, 'users')
    if (
      !personal &&
      (!p || p.status !== 'ACTIVE' || projectRole(p, me.id) !== 'ADMIN' || !p.budget)
    )
      return fail('OUT_OF_SCOPE', '')
    const state = personal
        ? {
            status: userBudget.status,
            current: {
              amount: userBudget.current?.amount ?? 0,
              consumed: userBudget.current?.consumed ?? 0,
              remaining: userBudget.current?.remaining ?? 0,
            },
            periods: userBudget.periods ?? [{ state: 'CURRENT' }],
            config: { end: userBudget.effective_end ?? '9999-12-31' },
            version: userBudget.history.length,
          }
        : budgetState(p!),
      f = flow(req)
    const amount = Number(body.per_period_amount),
      reason = String(body.reason ?? '').trim(),
      until = body.valid_until ? String(body.valid_until) : null
    if (
      state.status === 'DISABLED' ||
      !state.current ||
      !['PERMANENT', 'TEMPORARY'].includes(String(body.mode)) ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      roundMoney(amount) !== amount ||
      !reason ||
      reason.length > 500 ||
      !f.first.some((u) => u.id === body.first_approver_id) ||
      !f.second ||
      (body.mode === 'TEMPORARY' && (!until || until < budgetToday() || until > state.config!.end))
    )
      return fail('VALIDATION_FAILED', '')
    const count = state.periods.filter((period) => period.state !== 'ENDED').length
    const now = new Date().toISOString(),
      sequence = nextSequence('projectBudgetOrders', 100)
    const requested = body.mode === 'PERMANENT' ? roundMoney(amount * count) : amount
    const first = f.first.find((u) => u.id === body.first_approver_id)!
    const step = (u: typeof me) => ({
      approver_id: u.id,
      approver_name: u.display_name,
      status: 'PENDING' as const,
      at: null,
      comment: '',
      adjustment_reason: '',
      amount: null,
    })
    const order: BudgetWorkOrder = {
      id: `order-${sequence}`,
      number: `WO-${now.slice(0, 4)}-${String(sequence).padStart(4, '0')}`,
      target: personal ? 'PERSONAL' : 'PROJECT',
      project_id: personal ? '' : p!.id,
      project_name: personal ? me.display_name : p!.name,
      department: departmentPath(me.department_id),
      applicant_id: me.id,
      applicant_name: me.display_name,
      applicant_username: me.username,
      mode: body.mode as 'PERMANENT' | 'TEMPORARY',
      per_period_amount: amount,
      valid_until: until,
      reason,
      first_approver_id: first.id,
      requested_amount: requested,
      approved_amount: requested,
      approved_until: until,
      period_count: count,
      budget_version: state.version,
      status: 'PENDING',
      execution: 'NOT_EXECUTED',
      execution_error: null,
      created_at: now,
      updated_at: now,
      level: 1,
      version: 1,
      can_approve: false,
      can_withdraw: true,
      steps: [step(first), step(f.second)],
      budget_context: {
        currency: personal ? userBudget.currency : budgetState(p!).config!.currency,
        amount: state.current.amount,
        consumed: state.current.consumed,
        remaining: state.current.remaining,
      },
    }
    orders.unshift(order)
    return success(orderView(order, req))
  }),
  orderRoute('/me/project-budget-orders/:id', 'get', (req) => {
    const o = findOrder(req)
    return !o
      ? fail('NOT_FOUND', '')
      : !visible(o, req)
        ? fail('OUT_OF_SCOPE', '')
        : success(orderView(o, req))
  }),
  ...(['approve', 'reject', 'withdraw'] as const).map((action) =>
    orderRoute(`/me/project-budget-orders/:id/${action}`, 'post', (req) => {
      const o = findOrder(req)
      if (!o) return fail('NOT_FOUND', '')
      const me = actor(req)!,
        step = o.steps[o.level - 1]
      if (
        !visible(o, req) ||
        (action === 'withdraw' ? o.applicant_id !== me.id : step?.approver_id !== me.id)
      )
        return fail('FORBIDDEN', '')
      if (o.status !== 'PENDING' || o.version !== req.body?.version)
        return fail('STATE_CONFLICT', '')
      const comment = String(req.body?.comment ?? '').trim()
      if (comment.length > 300 || (action === 'reject' && !comment))
        return fail('VALIDATION_FAILED', '')
      if (action === 'withdraw') o.status = 'WITHDRAWN'
      else if (action === 'reject') {
        o.status = 'REJECTED'
        step!.status = 'REJECTED'
        step!.comment = comment
        step!.at = new Date().toISOString()
      } else {
        const amount = Number(req.body?.amount),
          until = req.body?.valid_until ? String(req.body.valid_until) : null,
          reason = String(req.body?.adjustment_reason ?? '').trim()
        const changed = amount !== o.approved_amount || until !== o.approved_until
        if (
          !Number.isFinite(amount) ||
          amount <= 0 ||
          roundMoney(amount) !== amount ||
          amount > o.approved_amount ||
          reason.length > 200 ||
          (changed && !reason) ||
          (o.mode === 'TEMPORARY' && (!until || until < budgetToday() || until > o.approved_until!))
        )
          return fail('VALIDATION_FAILED', '')
        const p = projects().find((p) => p.id === o.project_id)
        const personal = o.target === 'PERSONAL'
        const applicant = directory.get(o.applicant_username)
        if (!applicant || applicant.status !== 'ACTIVE') return fail('STATE_CONFLICT', '')
        const personalView = viewCostBudget(sharedCostState, costUserFor(applicant).id, 'users')
        if (
          personal &&
          o.budget_context.currency &&
          o.budget_context.currency !== personalView.currency
        )
          return fail('STATE_CONFLICT', '')
        if (personal && personalView.history.length !== o.budget_version)
          return fail('STATE_CONFLICT', '')
        if (
          !personal &&
          (!p ||
            p.status !== 'ACTIVE' ||
            !p.budget ||
            projectRole(p, o.applicant_id) !== 'ADMIN' ||
            budgetState(p).status === 'DISABLED' ||
            budgetLedger(p).version !== o.budget_version ||
            !budgetState(p).current)
        )
          return fail('STATE_CONFLICT', '')
        if (o.level === o.steps.length) {
          refreshCostConsumption(sharedCostState)
          const source = viewCostBudget(
            sharedCostState,
            personal ? costUserFor(applicant).department_id : costDepartmentId(p!.department_id),
            'departments',
          )
          const updated = personal
            ? personalView.budget_amount + amount
            : budgetState(p!).total + amount
          if (
            source.status === 'UNCONFIGURED' ||
            !source.current ||
            updated > source.remaining_amount
          )
            return fail('STATE_CONFLICT', '')
        }
        o.approved_amount = amount
        o.approved_until = until
        step!.status = 'APPROVED'
        step!.amount = amount
        step!.comment = comment
        step!.adjustment_reason = reason
        step!.at = new Date().toISOString()
        if (o.level < o.steps.length) o.level++
        else if (personal) {
          const user = costUserFor(applicant)
          let budget = sharedCostState.userBudgets.find((b) => b.id === user.id)
          if (!budget) {
            budget = seedBudget(user.id, user.department_id, 0, 0, user.id)
            budget.history = []
            budget.currency = personalView.currency
            budget.period_type = personalView.period_type
            sharedCostState.userBudgets.push(budget)
          }
          if (o.mode === 'PERMANENT') {
            const periods = personalView.periods ?? []
            const remaining = periods.filter((p) => p.state !== 'ENDED')
            const additions = allocateBudget(amount, remaining.length || 1)
            budget.allocation = 'CUSTOM'
            budget.period_amounts = periods.map((p) =>
              roundMoney(
                p.base +
                  (p.state === 'ENDED'
                    ? 0
                    : (additions[remaining.findIndex((r) => r.index === p.index)] ?? 0)),
              ),
            )
            budget.budget_amount = roundMoney(budget.budget_amount + amount)
          } else
            budget.adjustments.unshift({
              id: `work-order-adjustment-${o.id}`,
              user_id: user.id,
              additional_amount: amount,
              valid_from: new Date().toISOString(),
              valid_until: `${until}T23:59:59+08:00`,
              source_work_order_id: o.number,
              status: 'ACTIVE',
            })
          budget.history.unshift({
            action: o.mode,
            amount,
            at: new Date().toISOString(),
            actor: me.display_name,
            reason: o.number,
          })
          o.status = 'APPROVED'
          o.execution = 'APPLIED'
        } else {
          const ledger = budgetLedger(p!),
            state = budgetState(p!),
            now = new Date().toISOString()
          const adjustment = {
            id: `budget-adjustment-${nextSequence('projectBudgetAdjustments')}`,
            work_order_id: o.number,
            mode: o.mode,
            amount:
              o.mode === 'TEMPORARY'
                ? amount
                : roundMoney(
                    amount / state.periods.filter((period) => period.state !== 'ENDED').length,
                  ),
            start: budgetToday(),
            end: o.mode === 'TEMPORARY' ? until : null,
            actor: me.display_name,
            created_at: now,
          }
          if (o.mode === 'PERMANENT') {
            const remaining = state.periods.filter((period) => period.state !== 'ENDED'),
              additions = allocateBudget(amount, remaining.length)
            const updated = state.periods.map((period) =>
              roundMoney(
                period.base +
                  (period.state === 'ENDED'
                    ? 0
                    : additions[remaining.findIndex((r) => r.index === period.index)]!),
              ),
            )
            ledger.config!.allocation = 'CUSTOM'
            ledger.config!.amounts = updated
            ledger.config!.total = roundMoney(updated.reduce((a, b) => a + b, 0))
          }
          ledger.adjustments.unshift(adjustment)
          ledger.version++
          ledger.history.unshift({
            id: `budget-history-${nextSequence('projectBudgetHistory')}`,
            action: o.mode,
            at: now,
            actor: me.display_name,
            amount,
            work_order_id: o.number,
            configuration: structuredClone(ledger.config),
          })
          o.status = 'APPROVED'
          o.execution = 'APPLIED'
        }
      }
      o.updated_at = new Date().toISOString()
      o.version++
      return success(orderView(o, req))
    }),
  ),
] as MockMethod[])
