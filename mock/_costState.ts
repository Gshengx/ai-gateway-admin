import { directory, runtimeState, nextSequence } from './_runtime'
import { expenseRecords, summarize } from './_expenseRecords'
import { availableScopes, costDirectory } from './_costDirectory'
import { expenseDirectory, expenseSubtree, expenseToday } from './_expenseDirectory'
import { actor, userCapable } from './_expenseRoute'
import type { MockRequest } from './_utils'
import type {
  Bill,
  BillInput,
  BillTask,
  Dimension,
  DimensionRow,
  ScopeType,
} from '../src/api/modules/bills'
import type { ExpenseRecord } from '../src/api/modules/expenses'
export const round = (v: number) => Math.round(v * 1e6) / 1e6
export function cutoff() {
  const d = new Date(`${expenseToday()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
export function period(type: string, date: string) {
  const d = new Date(`${date.length === 7 ? date + '-01' : date}T00:00:00Z`)
  if (!Number.isFinite(d.getTime())) return null
  const start = new Date(d),
    end = new Date(d)
  if (type === 'MONTHLY') {
    start.setUTCDate(1)
    end.setUTCMonth(end.getUTCMonth() + 1, 0)
  } else {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    end.setTime(start.getTime())
    end.setUTCDate(end.getUTCDate() + 6)
  }
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  }
}
export function matches(r: ExpenseRecord, type: ScopeType, id: string) {
  return type === 'DEPARTMENT'
    ? expenseSubtree(id).includes(r.cost_department_id)
    : type === 'COST_CENTER'
      ? r.cost_center_id === id
      : r.fee_subject_id === id
}
export function visibleExpenses(req: MockRequest) {
  const scopes = availableScopes(req)
  return expenseRecords.filter((r) => scopes.some((s) => matches(r, s.type, s.value)))
}
export function billRecords(b: Bill, records: ExpenseRecord[] = expenseRecords) {
  return records.filter(
    (r) =>
      matches(r, b.scopeType, b.scopeId) &&
      r.created_at.slice(0, 10) >= b.periodStart &&
      r.created_at.slice(0, 10) <= b.periodEnd &&
      r.created_at.slice(0, 10) <= cutoff(),
  )
}
export function calculate(b: Bill) {
  const rows = billRecords(b),
    s = summarize(rows)
  Object.assign(b, {
    totalCost: s.cost,
    totalTokens: s.tokens,
    totalRequests: s.requests,
    inputTokens: s.input_tokens,
    outputTokens: s.output_tokens,
    cachedTokens: s.cached_tokens,
    directCost: round(
      rows.filter((r) => r.purpose === 'PERSONAL').reduce((n, r) => n + r.total_cost, 0),
    ),
    projectCost: round(
      rows.filter((r) => r.purpose === 'PROJECT').reduce((n, r) => n + r.total_cost, 0),
    ),
    uncontrolledCost: round(
      rows.filter((r) => r.control_status === 'UNCONTROLLED').reduce((n, r) => n + r.total_cost, 0),
    ),
  })
  return b
}
export function makeBill(input: BillInput, userId: string): Bill {
  const bounds = period(input.periodType, input.date)!
  const { departments } = expenseDirectory(),
    { centers, subjects } = costDirectory()
  const s = (
    input.scopeType === 'DEPARTMENT'
      ? departments.map((d) => ({ value: d.id, label: d.path }))
      : input.scopeType === 'COST_CENTER'
        ? centers
        : subjects
  ).find((s) => s.value === input.scopeId)!
  const subject = subjects.find(
    (s) => input.scopeType === 'FEE_SUBJECT' && s.value === input.scopeId,
  )
  return calculate({
    id: `bill-${nextSequence('costBill')}`,
    ...bounds,
    periodType: input.periodType,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    scopeName: s.label,
    costCenterId:
      subject?.costCenterId ?? (input.scopeType === 'COST_CENTER' ? input.scopeId : null),
    costCenterName: subject?.costCenterName ?? (input.scopeType === 'COST_CENTER' ? s.label : null),
    feeSubjectId: subject?.value ?? null,
    feeSubjectName: subject?.label ?? null,
    createdByUserId: userId,
    status: 'COMPLETED',
    generatedAt: new Date().toISOString(),
    generatedBy: 'MANUAL',
    totalCost: 0,
    totalTokens: 0,
    totalRequests: 0,
    directCost: 0,
    projectCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    uncontrolledCost: 0,
  })
}
export function costState() {
  return runtimeState('costBillsV15', () => {
    const root = expenseDirectory().departments[0]!,
      scopes = [
        { value: root.id, type: 'DEPARTMENT' as const },
        ...costDirectory().centers,
        ...costDirectory().subjects,
      ]
    const user = expenseDirectory().users[0]!.id,
      year = expenseToday().slice(0, 4)
    const bills: Bill[] = []
    scopes.forEach((s, i) => {
      for (let m = 1; m <= Number(expenseToday().slice(5, 7)); m++) {
        const b = makeBill(
          {
            periodType: m % 3 === 0 && i === 0 ? 'WEEKLY' : 'MONTHLY',
            date: `${year}-${String(m).padStart(2, '0')}-08`,
            scopeType: s.type,
            scopeId: s.value,
          },
          user,
        )
        b.generatedAt = `${year}-${String(m).padStart(2, '0')}-09T02:00:00Z`
        if (i === 0 && m === 2) {
          b.status = 'FAILED'
          b.failureReason = 'MOCK_AGGREGATION_TIMEOUT'
        }
        if (i === 0 && m === Number(expenseToday().slice(5, 7))) b.status = 'GENERATING'
        bills.push(b)
      }
    })
    const tasks: BillTask[] = scopes.slice(0, 4).map((s, i) => ({
      id: `task-${nextSequence('costTask')}`,
      periodType: i % 2 ? 'WEEKLY' : 'MONTHLY',
      scopeType: s.type,
      scopeId: s.value,
      scopeName: bills.find((b) => b.scopeId === s.value)!.scopeName,
      emailEnabled: i % 2 === 0,
      emailRecipients: i % 2 === 0 ? ['finance@example.com'] : [],
      createdByUserId: user,
      createdAt: `${year}-01-01T01:00:00Z`,
      nextRunAt: i === 2 ? null : nextRun(i % 2 ? 'WEEKLY' : 'MONTHLY'),
      status: i === 2 ? 'DISABLED' : 'ACTIVE',
    }))
    tasks.forEach((t) => {
      const b = bills.find((b) => b.scopeId === t.scopeId && b.status === 'COMPLETED')
      if (b) {
        b.generatedBy = 'AUTO'
        b.taskId = t.id
        t.lastRunAt = b.generatedAt
        t.lastBillId = b.id
      }
    })
    return { bills, tasks }
  })
}
// Billing schedules use the business calendar in Asia/Shanghai, independently of display preferences.
export function nextRun(type: string, after = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(after)
  const day = new Date(today + 'T00:00:00Z')
  if (type === 'MONTHLY') day.setUTCDate(1)
  else day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  const scheduled = () => new Date(day.toISOString().slice(0, 10) + 'T02:00:00+08:00')
  if (scheduled().getTime() <= after.getTime()) {
    if (type === 'MONTHLY') day.setUTCMonth(day.getUTCMonth() + 1, 1)
    else day.setUTCDate(day.getUTCDate() + 7)
  }
  return scheduled().toISOString()
}
export function aggregate(
  rows: ExpenseRecord[],
  dimension: Dimension,
  total: number,
): DimensionRow[] {
  const groups = new Map<string, ExpenseRecord[]>()
  const id = (r: ExpenseRecord) =>
    dimension === 'FEE_SUBJECT'
      ? r.fee_subject_id
      : dimension === 'COST_CENTER'
        ? r.cost_center_id
        : dimension === 'DEPARTMENT'
          ? r.cost_department_id
          : dimension === 'USER'
            ? r.user_id
            : dimension === 'MODEL'
              ? r.model_id
              : r.provider_id
  rows.forEach((r) => {
    const key = id(r) ?? 'UNASSIGNED'
    groups.set(key, [...(groups.get(key) ?? []), r])
  })
  return [...groups].map(([key, records]) => {
    const r = records[0]!,
      s = summarize(records)
    return {
      id: key,
      name:
        dimension === 'FEE_SUBJECT'
          ? (r.fee_subject_name ?? '')
          : dimension === 'COST_CENTER'
            ? (r.cost_center_name ?? '')
            : dimension === 'DEPARTMENT'
              ? (expenseDirectory().departments.find((d) => d.id === r.cost_department_id)?.path ??
                '')
              : dimension === 'USER'
                ? `${r.user_name} (${r.username})`
                : dimension === 'MODEL'
                  ? r.model_name
                  : r.provider_name,
      subjectType:
        costDirectory().subjects.find((s) => s.value === r.fee_subject_id)?.subjectType ?? null,
      costCenterName: r.cost_center_name,
      cost: s.cost,
      directCost: round(
        records.filter((r) => r.purpose === 'PERSONAL').reduce((n, r) => n + r.total_cost, 0),
      ),
      projectCost: round(
        records.filter((r) => r.purpose === 'PROJECT').reduce((n, r) => n + r.total_cost, 0),
      ),
      uncontrolledCost: round(
        records
          .filter((r) => r.control_status === 'UNCONTROLLED')
          .reduce((n, r) => n + r.total_cost, 0),
      ),
      inputTokens: s.input_tokens,
      outputTokens: s.output_tokens,
      cachedTokens: s.cached_tokens,
      requests: s.requests,
      percentage: total ? (s.cost / total) * 100 : 0,
    }
  })
}
export function csv<T extends object>(rows: T[], fields = Object.keys(rows[0] ?? {})) {
  const escape = (v: unknown) =>
    '"' +
    String(v ?? '')
      .replace(/"/g, '""')
      .replace(/^[=+@-]/, "'$&") +
    '"'
  return (
    '\uFEFF' +
    [fields, ...rows.map((r) => fields.map((k) => (r as Record<string, unknown>)[k]))]
      .map((r) => r.map(escape).join(','))
      .join('\r\n')
  )
}
export const currentActorId = (req: MockRequest) => actor(req)?.id ?? ''

// Simulate scheduler ticks on authenticated cost reads. No external messages are sent.
export function runDueTasks(req: MockRequest, now = new Date()) {
  const state = costState()
  const deliveries = runtimeState<
    { taskId: string; billId: string; recipients: string[]; at: string }[]
  >('costMailOutbox', () => [])
  for (const task of state.tasks) {
    if (task.status !== 'ACTIVE' || !task.nextRunAt || new Date(task.nextRunAt) > now) continue
    const creator = [...directory.values()].find((u) => u.id === task.createdByUserId)
    if (
      !creator ||
      creator.status !== 'ACTIVE' ||
      !userCapable(creator, 'cost.bills', true) ||
      !availableScopes(req, creator).some(
        (s) => s.type === task.scopeType && s.value === task.scopeId,
      )
    )
      continue
    const runAt = new Date(task.nextRunAt)
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
      runAt,
    )
    const previous = new Date(businessDate + 'T00:00:00Z')
    previous.setUTCDate(previous.getUTCDate() - 1)
    const input: BillInput = {
      periodType: task.periodType,
      date: previous.toISOString().slice(0, 10),
      scopeType: task.scopeType,
      scopeId: task.scopeId,
    }
    const bounds = period(input.periodType, input.date)!
    let bill = state.bills.find(
      (b) =>
        b.periodType === input.periodType &&
        b.periodStart === bounds.periodStart &&
        b.scopeType === input.scopeType &&
        b.scopeId === input.scopeId,
    )
    if (!bill) {
      bill = makeBill(input, task.createdByUserId)
      state.bills.push(bill)
    }
    calculate(bill)
    Object.assign(bill, {
      status: 'COMPLETED',
      generatedBy: 'AUTO',
      taskId: task.id,
      generatedAt: now.toISOString(),
    })
    if (task.emailEnabled && !deliveries.some((d) => d.taskId === task.id && d.billId === bill.id))
      deliveries.push({
        taskId: task.id,
        billId: bill.id,
        recipients: [...task.emailRecipients],
        at: now.toISOString(),
      })
    task.lastRunAt = now.toISOString()
    task.lastBillId = bill.id
    task.nextRunAt = nextRun(task.periodType, now)
  }
}
