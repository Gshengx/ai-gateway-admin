import type { BudgetPeriodType, ProjectBudgetConfig } from '@/api/modules/projectBudgets'

export function budgetDates(start: string, end: string, type: BudgetPeriodType) {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }
  if (!validDate(start) || !validDate(end) || start > end) return []
  const result: { start: string; end: string }[] = []
  let cursor = start
  while (cursor <= end) {
    const date = new Date(`${cursor}T00:00:00Z`)
    const month = date.getUTCMonth()
    const next = new Date(date)
    next.setUTCMonth(
      type === 'YEARLY' ? 12 : type === 'QUARTERLY' ? Math.floor(month / 3) * 3 + 3 : month + 1,
      1,
    )
    const boundary =
      next.getUTCFullYear() > 9999
        ? end
        : new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
    result.push({ start: cursor, end: boundary < end ? boundary : end })
    if (boundary >= end) break
    cursor = next.toISOString().slice(0, 10)
  }
  return result
}
export function allocateBudget(total: number, count: number) {
  const cents = Math.round(total * 100)
  if (!count || !Number.isFinite(cents)) return []
  const base = Math.floor(cents / count)
  return Array.from(
    { length: count },
    (_, i) => (base + (i === count - 1 ? cents - base * count : 0)) / 100,
  )
}
export function defaultProjectBudgetConfig(): ProjectBudgetConfig {
  const year = new Date().getUTCFullYear()
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    total: 10000,
    currency: 'CNY',
    period_type: 'YEARLY',
    allocation: 'EVEN',
    amounts: [],
    member_limit_mode: 'NONE',
    member_limit: 0,
    member_limits: [],
    warning_threshold: 80,
    critical_threshold: 95,
    over_action: 'ALERT_ONLY',
    recipients: { WARNING: [], CRITICAL: [], EXCEEDED: [] },
    channels: { WARNING: ['IN_APP'], CRITICAL: ['IN_APP'], EXCEEDED: ['IN_APP'] },
  }
}
