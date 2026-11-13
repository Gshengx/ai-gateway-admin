import { runtimeState, directory, existingState } from './_runtime'
import { seedCostState, seedBudget, costUserFor, costDirectory } from '../src/api/mock/cost'
export const sharedCostState = runtimeState('sharedCostBudgetState', seedCostState)
runtimeState('costBillFailureFixtureV14', () => {
  if (!sharedCostState.bills.some((b) => b.id === 'bill-failed-june'))
    sharedCostState.bills.push(seedCostState().bills.find((b) => b.id === 'bill-failed-june')!)
  return true
})
export function syncCostUsers() {
  const map: Record<string, string> = {
    'd-root': 'hq',
    'd-tech': 'tech',
    'd-algo': 'algorithm',
    'd-platform': 'platform',
    'd-ops': 'operations',
    'd-hr': 'hr',
  }
  const id = (value: string) => map[value] ?? value.replace(/^d-/, '')
  const source =
    existingState<
      {
        id: string
        parent_id: string | null
        name: string
        translations?: Record<string, { name: string }>
      }[]
    >('departments') ?? []
  if (source.length) {
    const nodes = source.map((d) => ({
      id: id(d.id),
      parent_id: d.parent_id ? id(d.parent_id) : null,
      name: d.name,
      name_en: d.translations?.['en-US']?.name ?? d.name,
      path: '',
      path_en: '',
      has_children: source.some((r) => r.parent_id === d.id),
    }))
    const path = (node: (typeof nodes)[number], english: boolean): string => {
      const parent = nodes.find((d) => d.id === node.parent_id)
      return (parent ? `${path(parent, english)} / ` : '') + (english ? node.name_en : node.name)
    }
    nodes.forEach((d) => {
      d.path = path(d, false)
      d.path_en = path(d, true)
    })
    costDirectory().departments.splice(0, costDirectory().departments.length, ...nodes)
  }
  for (const b of [...sharedCostState.departmentBudgets, ...sharedCostState.userBudgets]) {
    if (!b.effective_start) {
      const seed = seedBudget(b.id, b.department_id, b.budget_amount, b.consumed_amount, b.user_id)
      b.effective_start = seed.effective_start
      b.effective_end = seed.effective_end
      b.allocation = 'EVEN'
      b.period_amounts = []
      b.member_limit_mode = 'NONE'
      b.member_limit = 0
      b.member_limits = []
      if (b.id === 'hq') b.period_type = 'YEARLY'
    }
  }
  const collection = costDirectory().users
  const original = collection.map((u) => ({ ...u }))
  const actual = [...directory.values()].map(costUserFor)
  if (!actual.length) return
  const links = runtimeState('costDirectoryLinks', () => {
    const links = new Map<string, string>()
    original.slice(0, 48).forEach((u, i) => {
      const target = actual.find((r) => r.username === u.username) ?? actual[i % actual.length]
      if (target) links.set(u.id, target.id)
    })
    for (const b of sharedCostState.userBudgets) {
      const id = links.get(b.user_id ?? '')
      const user = actual.find((u) => u.id === id)
      if (user) {
        b.id = user.id
        b.user_id = user.id
        b.department_id = user.department_id
        b.adjustments.forEach((a) => {
          a.user_id = user.id
        })
      }
    }
    for (const b of [...sharedCostState.userBudgets, ...sharedCostState.departmentBudgets])
      for (const level of ['WARNING', 'CRITICAL', 'EXCEEDED'] as const)
        b.notification_recipients[level] = b.notification_recipients[level].map(
          (id) => links.get(id) ?? id,
        )
    return links
  })
  void links
  collection.splice(0, collection.length, ...actual)
  const fixtures = runtimeState('costCompleteFixturesV14', () => ({ ready: false }))
  if (fixtures.ready) return
  const root = actual.find((u) => u.username === 'mock_admin')
  const admin = actual.find((u) => u.username === 'admin')
  if (!root || !admin) return
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const year = today.slice(0, 4),
    month = today.slice(0, 7)
  if (!sharedCostState.userBudgets.some((b) => b.user_id === root.id)) {
    const budget = seedBudget(root.id, root.department_id, 12000, 0, root.id)
    budget.allocation = 'CUSTOM'
    budget.period_amounts = [800, 800, 800, 900, 900, 900, 1000, 1000, 1000, 1200, 1300, 1400]
    budget.adjustments = [
      {
        id: 'personal-extra-active',
        user_id: root.id,
        additional_amount: 500,
        valid_from: `${month}-01T02:00:00Z`,
        valid_until: `${today}T15:59:59Z`,
        source_work_order_id: 'WO-2026-0120',
        status: 'ACTIVE',
      },
      {
        id: 'personal-extra-expired',
        user_id: root.id,
        additional_amount: 300,
        valid_from: `${year}-10-01T02:00:00Z`,
        valid_until: `${year}-10-31T15:59:59Z`,
        source_work_order_id: 'WO-2026-0121',
        status: 'EXPIRED',
      },
    ]
    budget.history[0]!.at = `${year}-01-01T01:00:00Z`
    budget.history[0]!.actor = admin.id
    budget.history[0]!.configuration = {
      effective_start: budget.effective_start,
      effective_end: budget.effective_end,
      allocation: budget.allocation,
      period_amounts: [...budget.period_amounts],
      member_limit_mode: budget.member_limit_mode,
      member_limit: budget.member_limit,
      member_limits: [...(budget.member_limits ?? [])],
      budget_amount: budget.budget_amount,
      currency: budget.currency,
      period_type: budget.period_type,
      budget_mode: budget.budget_mode,
      warning_threshold: budget.warning_threshold,
      critical_threshold: budget.critical_threshold,
      over_budget_action: budget.over_budget_action,
      notification_recipients: structuredClone(budget.notification_recipients),
      notification_channels: structuredClone(budget.notification_channels),
    }
    budget.history.unshift(
      ...budget.adjustments.map((a) => ({
        action: 'TEMPORARY',
        amount: a.additional_amount,
        at: a.valid_from,
        actor: admin.id,
        reason: `预算申请 ${a.source_work_order_id} 审批通过`,
      })),
    )
    budget.history.sort((a, b) => b.at.localeCompare(a.at))
    sharedCostState.userBudgets.push(budget)
  }
  const end = new Date(Date.UTC(Number(year), Number(today.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10)
  if (!sharedCostState.bills.some((b) => b.id === 'bill-current-projects'))
    sharedCostState.bills.push({
      ...sharedCostState.bills[0]!,
      id: 'bill-current-projects',
      period_type: 'MONTHLY',
      period_start: `${month}-01`,
      period_end: end,
      department_id: 'hq',
      department_ids: ['hq'],
      created_by: root.id,
      task_id: 'task-seed-monthly',
      generated_at: `${today}T02:00:00Z`,
    })
  const nextMonth = new Date(Date.UTC(Number(year), Number(today.slice(5, 7)), 1, 2)).toISOString()
  for (const [id, creator, type, enabled] of [
    ['task-seed-monthly', root.id, 'MONTHLY', true],
    ['task-seed-weekly', root.id, 'WEEKLY', false],
    ['task-seed-other-creator', admin.id, 'MONTHLY', true],
  ] as const) {
    if (!sharedCostState.tasks.some((t) => t.id === id))
      sharedCostState.tasks.push({
        id,
        created_by: creator,
        period_type: type,
        department_id: 'hq',
        department_ids: ['hq'],
        email_enabled: enabled,
        email_recipients: enabled ? ['budget@example.com'] : [],
        status: enabled ? 'ACTIVE' : 'DISABLED',
        next_run_at: enabled ? nextMonth : null,
        last_run_at: id === 'task-seed-monthly' ? `${today}T02:00:00Z` : null,
        last_bill_id: id === 'task-seed-monthly' ? 'bill-current-projects' : null,
        created_at: `${year}-01-01T02:00:00Z`,
      })
  }
  fixtures.ready = true
}
