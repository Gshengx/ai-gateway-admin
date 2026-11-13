import { request } from '../request'
import type { OffsetPageQuery, OffsetPageResult } from '../types'
import type { ProjectItem, ProjectRef } from './projects'
import type { Budget, BudgetAnalytics } from './cost'

/** Prototype-only contract authorized with the project mock workflow. */
export type BudgetPeriodType = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type BudgetLevel = 'WARNING' | 'CRITICAL' | 'EXCEEDED'
export interface ProjectBudgetConfig {
  start: string
  end: string
  total: number
  currency: 'CNY' | 'USD'
  period_type: BudgetPeriodType
  allocation: 'EVEN' | 'CUSTOM'
  amounts: number[]
  member_limit_mode: 'NONE' | 'FIXED' | 'CUSTOM'
  member_limit: number
  member_limits: number[]
  warning_threshold: number
  critical_threshold: number
  over_action: 'ALERT_ONLY' | 'BLOCK_PROJECT'
  recipients: Record<BudgetLevel, string[]>
  channels: Record<BudgetLevel, ('IN_APP' | 'EMAIL')[]>
}
export interface ProjectBudgetPeriod {
  index: number
  start: string
  end: string
  base: number
  temporary: number
  amount: number
  consumed: number
  remaining: number
  limit: number | null
  state: 'ENDED' | 'CURRENT' | 'UPCOMING'
}
export interface ProjectBudgetAdjustment {
  invalidated_at?: string
  id: string
  work_order_id: string
  mode: 'PERMANENT' | 'TEMPORARY'
  amount: number
  start: string
  end: string | null
  actor: string
  created_at: string
}
export interface ProjectBudgetHistory {
  id: string
  action: 'CONFIGURED' | 'REMOVED' | 'PERMANENT' | 'TEMPORARY'
  at: string
  actor: string
  amount: number
  work_order_id: string | null
  configuration: ProjectBudgetConfig | null
}
export interface ProjectBudgetRecord {
  project: ProjectItem
  config: ProjectBudgetConfig | null
  version: number
  periods: ProjectBudgetPeriod[]
  adjustments: ProjectBudgetAdjustment[]
  history: ProjectBudgetHistory[]
  total: number
  consumed: number
  remaining: number
  usage: number
  status: 'UNCONFIGURED' | 'DISABLED' | 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EXCEEDED'
  current: ProjectBudgetPeriod | null
}
export interface BudgetApplication {
  target: 'PROJECT' | 'PERSONAL'
  project_id: string
  mode: 'PERMANENT' | 'TEMPORARY'
  per_period_amount: number
  valid_until: string | null
  reason: string
  first_approver_id: string
}
export interface BudgetApproval {
  amount: number
  valid_until: string | null
  adjustment_reason: string
  comment: string
  version: number
}
export interface BudgetWorkOrder extends BudgetApplication {
  id: string
  number: string
  project_name: string
  department: string
  applicant_id: string
  applicant_name: string
  applicant_username: string
  requested_amount: number
  approved_amount: number
  approved_until: string | null
  period_count: number
  budget_version: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  execution: 'NOT_EXECUTED' | 'APPLIED' | 'FAILED'
  execution_error: string | null
  created_at: string
  updated_at: string
  level: number
  version: number
  can_approve: boolean
  can_withdraw: boolean
  steps: {
    approver_id: string
    approver_name: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    at: string | null
    comment: string
    adjustment_reason: string
    amount: number | null
  }[]
  budget_context: { amount: number; consumed: number; remaining: number; currency?: 'CNY' | 'USD' }
}
export const getProjectBudgets = (
  params: OffsetPageQuery & { search?: string; status?: string; department_id?: string },
) => request.get<OffsetPageResult<ProjectBudgetRecord>>('/project-budgets', { params })
export const getProjectBudget = (id: string) =>
  request.get<ProjectBudgetRecord>(`/project-budgets/${id}`)
export const getProjectBudgetAnalytics = (id: string) =>
  request.get<BudgetAnalytics>(`/project-budgets/${id}/analytics`)
export const saveProjectBudget = (
  project_ids: string[],
  configuration: ProjectBudgetConfig,
  versions: Record<string, number>,
) => request.post('/project-budgets/configure', { project_ids, configuration, versions })
export const removeProjectBudget = (id: string, version: number) =>
  request.post(`/project-budgets/${id}/remove`, { version })
export const getBudgetWorkOrders = (
  params: OffsetPageQuery & { tab: string; search?: string; status?: string; mode?: string },
) =>
  request.get<OffsetPageResult<BudgetWorkOrder> & { pending_count: number }>(
    '/me/project-budget-orders',
    { params },
  )
export const getBudgetWorkOrder = (id: string) =>
  request.get<BudgetWorkOrder>(`/me/project-budget-orders/${id}`)
export const createBudgetWorkOrder = (data: BudgetApplication) =>
  request.post<BudgetWorkOrder>('/me/project-budget-orders', data)
export const approveBudgetWorkOrder = (id: string, data: BudgetApproval) =>
  request.post<BudgetWorkOrder>(`/me/project-budget-orders/${id}/approve`, data)
export const rejectBudgetWorkOrder = (id: string, comment: string, version: number) =>
  request.post<BudgetWorkOrder>(`/me/project-budget-orders/${id}/reject`, { comment, version })
export const withdrawBudgetWorkOrder = (id: string, version: number) =>
  request.post<BudgetWorkOrder>(`/me/project-budget-orders/${id}/withdraw`, { version })
export const getBudgetApplicationOptions = () =>
  request.get<{
    projects: ProjectBudgetRecord[]
    personal_budget: Budget
    approvers: ProjectRef[]
    second_approver: ProjectRef | null
  }>('/me/project-budget-order-options')
