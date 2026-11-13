import { runtimeState, nextSequence, existingState, directory } from './_runtime'
import type { ExpenseRecord } from '../src/api/modules/expenses'
import type { StoredProject } from './_projects'
import type {
  ProjectBudgetConfig,
  ProjectBudgetHistory,
  ProjectBudgetAdjustment,
  ProjectBudgetPeriod,
} from '../src/api/modules/projectBudgets'
import { allocateBudget, budgetDates, defaultProjectBudgetConfig } from '../src/utils/projectBudget'

interface Ledger {
  version: number
  config: ProjectBudgetConfig | null
  consumed: Record<string, number>
  adjustments: ProjectBudgetAdjustment[]
  history: ProjectBudgetHistory[]
}
const ledgers = runtimeState('projectBudgetLedgers', () => new Map<string, Ledger>())
export const budgetToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export function budgetLedger(p: StoredProject): Ledger {
  if (!ledgers.has(p.id)) {
    const old = p.budget
    const config: ProjectBudgetConfig | null = old
      ? {
          ...defaultProjectBudgetConfig(),
          start: old.start,
          end: old.end,
          total: old.amount,
          period_type: 'MONTHLY',
          member_limit_mode: old.member_limit ? 'FIXED' : 'NONE',
          member_limit: old.member_limit,
        }
      : null
    if (config && p.id === 'project-10') {
      config.start = `${budgetToday().slice(0, 4)}-10-01`
      config.end = `${budgetToday().slice(0, 4)}-12-31`
      config.total = 70000
      config.allocation = 'CUSTOM'
      config.amounts = [20000, 30000, 20000]
      config.member_limit_mode = 'CUSTOM'
      config.member_limits = [8000, 10000, 12000]
    } else if (config && ['project-11', 'project-16'].includes(p.id)) {
      config.start = `${budgetToday().slice(0, 4)}-01-01`
      config.end = `${budgetToday().slice(0, 4)}-12-31`
      config.period_type = p.id === 'project-11' ? 'QUARTERLY' : 'YEARLY'
      config.total = p.id === 'project-11' ? 40000 : 30000
    }
    if (config) {
      if (p.id === 'project-2') config.total = Math.ceil(old!.consumed / 0.97)
      const perPeriod = allocateBudget(
        config.total,
        budgetDates(config.start, config.end, config.period_type).length,
      )
      if (config.member_limit_mode === 'FIXED')
        config.member_limit = Math.min(config.member_limit, ...perPeriod)
      const recipient = [...directory.values()].find(
        (u) => u.status === 'ACTIVE' && u.department_id === p.department_id,
      )
      for (const level of ['WARNING', 'CRITICAL', 'EXCEEDED'] as const) {
        config.recipients[level] = recipient ? [recipient.id] : []
        config.channels[level] = recipient ? ['IN_APP'] : []
      }
    }
    const adjustments: ProjectBudgetAdjustment[] =
      config && p.id === 'project-10'
        ? [
            {
              id: 'project-extra-active',
              work_order_id: 'WO-2026-0122',
              mode: 'TEMPORARY',
              amount: 250,
              start: `${budgetToday().slice(0, 7)}-01`,
              end: budgetToday(),
              actor: 'mock_admin',
              created_at: `${budgetToday().slice(0, 7)}-01T02:00:00Z`,
            },
            {
              id: 'project-extra-expired',
              work_order_id: 'WO-2026-0123',
              mode: 'TEMPORARY',
              amount: 150,
              start: `${budgetToday().slice(0, 4)}-10-01`,
              end: `${budgetToday().slice(0, 4)}-10-31`,
              actor: 'mock_admin',
              created_at: `${budgetToday().slice(0, 4)}-10-01T02:00:00Z`,
            },
          ]
        : []
    ledgers.set(p.id, {
      config,
      version: 1,
      consumed: old ? { [old.start]: old.consumed } : {},
      adjustments,
      history: config
        ? [
            {
              id: `budget-seed-${p.id}`,
              action: 'CONFIGURED',
              at: `${config.start}T01:00:00Z`,
              actor: '陈知远',
              amount: config.total,
              work_order_id: null,
              configuration: structuredClone(config),
            },
          ]
        : [],
    })
    const ledger = ledgers.get(p.id)!
    ledger.history.unshift(
      ...adjustments.map((a): ProjectBudgetHistory => ({
        id: `history-${a.id}`,
        action: 'TEMPORARY',
        at: a.created_at,
        actor: a.actor,
        amount: a.amount,
        work_order_id: a.work_order_id,
        configuration: structuredClone(config),
      })),
    )
    ledger.history.sort((a, b) => b.at.localeCompare(a.at))
  }
  return ledgers.get(p.id)!
}
export function budgetPeriods(p: StoredProject): ProjectBudgetPeriod[] {
  const ledger = budgetLedger(p),
    config = ledger.config
  if (!config || !p.budget) return []
  const dates = budgetDates(config.start, config.end, config.period_type)
  const bases =
    config.allocation === 'CUSTOM' ? config.amounts : allocateBudget(config.total, dates.length)
  const today = budgetToday()
  return dates.map((period, index) => {
    const temporary = roundMoney(
      ledger.adjustments
        .filter(
          (a) =>
            !a.invalidated_at &&
            a.mode === 'TEMPORARY' &&
            a.start <= period.end &&
            (a.end ?? '') >= period.start &&
            (period.end < today || (a.end ?? '') >= today),
        )
        .reduce((sum, a) => sum + a.amount, 0),
    )
    const base = bases[index] ?? 0
    const records = existingState<ExpenseRecord[]>('expenseRecordsV14Linked2')
    const consumed = records
      ? records
          .filter(
            (r) =>
              r.project_id === p.id &&
              r.created_at.slice(0, 10) >= period.start &&
              r.created_at.slice(0, 10) <= period.end,
          )
          .reduce((sum, r) => sum + r.total_cost, 0)
      : Object.entries(ledger.consumed)
          .filter(([date]) => date >= period.start && date <= period.end)
          .reduce((sum, [, amount]) => sum + amount, 0)
    const amount = roundMoney(base + temporary)
    return {
      ...period,
      index: index + 1,
      base,
      temporary,
      amount,
      consumed,
      remaining: roundMoney(amount - consumed),
      limit:
        config.member_limit_mode === 'NONE'
          ? null
          : config.member_limit_mode === 'CUSTOM'
            ? (config.member_limits[index] ?? 0)
            : config.member_limit,
      state: period.end < today ? 'ENDED' : period.start > today ? 'UPCOMING' : 'CURRENT',
    }
  })
}
export function budgetState(p: StoredProject) {
  const ledger = budgetLedger(p)
  const periods = budgetPeriods(p)
  const current = periods.find((period) => period.state === 'CURRENT') ?? null
  const total = roundMoney(periods.reduce((sum, period) => sum + period.amount, 0))
  const consumed = roundMoney(Object.values(ledger.consumed).reduce((sum, value) => sum + value, 0))
  const usage = total ? (consumed / total) * 100 : 0
  const status =
    !ledger.config || !p.budget
      ? 'UNCONFIGURED'
      : p.status !== 'ACTIVE' || p.budget.status === 'DISABLED'
        ? 'DISABLED'
        : usage >= 100
          ? 'EXCEEDED'
          : usage >= ledger.config.critical_threshold
            ? 'CRITICAL'
            : usage >= ledger.config.warning_threshold
              ? 'WARNING'
              : 'NORMAL'
  return {
    config: p.budget ? ledger.config : null,
    version: ledger.version,
    periods,
    current,
    total,
    consumed,
    remaining: roundMoney(total - consumed),
    usage,
    status,
    adjustments: ledger.adjustments,
    history: ledger.history,
  }
}
export function projectBudgetProjection(p: StoredProject) {
  const state = budgetState(p)
  if (!state.config) return null
  return {
    currency: state.config.currency,
    status:
      state.status === 'DISABLED'
        ? ('DISABLED' as const)
        : state.status === 'EXCEEDED'
          ? ('EXHAUSTED' as const)
          : state.status === 'CRITICAL'
            ? ('CRITICAL' as const)
            : state.status === 'WARNING'
              ? ('WARNING' as const)
              : ('NORMAL' as const),
    amount: state.current?.amount ?? 0,
    consumed: state.current?.consumed ?? 0,
    member_limit: state.current?.limit ?? 0,
    start: state.current?.start ?? state.config.start,
    end: state.current?.end ?? state.config.end,
    period_type: state.config.period_type,
    warning_threshold: state.config.warning_threshold,
    critical_threshold: state.config.critical_threshold,
  }
}
export function validBudgetConfig(config: ProjectBudgetConfig) {
  if (
    !config ||
    !['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(config.period_type) ||
    !['EVEN', 'CUSTOM'].includes(config.allocation) ||
    !['NONE', 'FIXED', 'CUSTOM'].includes(config.member_limit_mode) ||
    !['ALERT_ONLY', 'BLOCK_PROJECT'].includes(config.over_action) ||
    !['CNY', 'USD'].includes(config.currency)
  )
    return false
  const dates = budgetDates(config.start, config.end, config.period_type)
  const positive = (n: unknown) =>
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= 0 &&
    Math.abs(Math.round(n * 100) - n * 100) < 0.000001
  if (
    !dates.length ||
    !positive(config.total) ||
    config.total <= 0 ||
    !positive(config.member_limit) ||
    !(
      config.warning_threshold > 0 &&
      config.warning_threshold <= config.critical_threshold &&
      config.critical_threshold <= 100
    )
  )
    return false
  if (
    config.allocation === 'CUSTOM' &&
    (!Array.isArray(config.amounts) ||
      config.amounts.length !== dates.length ||
      config.amounts.some((n) => !positive(n)) ||
      roundMoney(config.amounts.reduce((a, b) => a + b, 0)) !== config.total)
  )
    return false
  if (
    config.member_limit_mode === 'CUSTOM' &&
    (!Array.isArray(config.member_limits) ||
      config.member_limits.length !== dates.length ||
      config.member_limits.some((n) => !positive(n)))
  )
    return false
  return ['WARNING', 'CRITICAL', 'EXCEEDED'].every((key) => {
    const level = key as 'WARNING' | 'CRITICAL' | 'EXCEEDED'
    return (
      Array.isArray(config.recipients?.[level]) &&
      Array.isArray(config.channels?.[level]) &&
      config.channels[level].every((c) => ['IN_APP', 'EMAIL'].includes(c))
    )
  })
}
export function configureBudget(p: StoredProject, config: ProjectBudgetConfig, actor: string) {
  const ledger = budgetLedger(p)
  ledger.config = structuredClone(config)
  ledger.version++
  p.budget = {
    status: 'NORMAL',
    amount: config.total,
    consumed: 0,
    member_limit: config.member_limit,
    start: config.start,
    end: config.end,
  }
  ledger.history.unshift({
    id: `budget-history-${nextSequence('projectBudgetHistory')}`,
    action: 'CONFIGURED',
    at: new Date().toISOString(),
    actor,
    amount: config.total,
    work_order_id: null,
    configuration: structuredClone(config),
  })
}

export function archiveProjectBudget(p: StoredProject, actor: string) {
  if (!p.budget) return
  const ledger = budgetLedger(p)
  const at = new Date().toISOString()
  ledger.version++
  ledger.adjustments.forEach((adjustment) => {
    adjustment.invalidated_at ??= at
  })
  ledger.history.unshift({
    id: `budget-history-${nextSequence('projectBudgetHistory')}`,
    action: 'REMOVED',
    at,
    actor,
    amount: ledger.config?.total ?? 0,
    work_order_id: null,
    configuration: structuredClone(ledger.config),
  })
  p.budget.status = 'DISABLED'
}
