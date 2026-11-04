import request from '@/api/request'
import { costMockAdapter } from '@/api/mock/cost'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'

export type PeriodType = 'MONTHLY' | 'WEEKLY'
export type Dimension = 'PROVIDER' | 'DEPARTMENT' | 'USER' | 'MODEL'
export type BudgetStatus =
  'NORMAL' | 'WARNING' | 'CRITICAL' | 'EXCEEDED' | 'INHERITED' | 'SHARED' | 'UNCONFIGURED'
export type Level = 'WARNING' | 'CRITICAL' | 'EXCEEDED'
export interface CostDepartment {
  id: string
  parent_id: string | null
  name: string
  name_en: string
  path: string
  path_en: string
  has_children: boolean
}
export interface CostUser {
  id: string
  username: string
  name: string
  department_id: string
  email: string | null
  active: boolean
}
export interface Bill {
  id: string
  period_type: PeriodType
  period_start: string
  period_end: string
  department_id: string
  created_by: string
  task_id: string | null
  total_cost: number
  total_input_tokens: number
  total_output_tokens: number
  total_requests: number
  currency: string
  status: 'GENERATING' | 'COMPLETED'
  generated_at: string
}
export interface BillTask {
  id: string
  created_by: string
  period_type: PeriodType
  department_id: string
  email_enabled: boolean
  email_recipients: string[]
  status: 'ACTIVE' | 'DISABLED'
  next_run_at: string | null
  last_run_at: string | null
  last_bill_id: string | null
  created_at: string
}
export interface BillItem {
  id: string
  dimension: Dimension
  dimension_id: string
  dimension_name: string
  department_id: string
  parent_id: string | null
  has_children: boolean
  own: boolean
  name: string
  department_path: string
  service_type: 'COMMERCIAL' | 'PRIVATE'
  cost: number
  input_tokens: number
  output_tokens: number
  request_count: number
  cost_ratio: number
  details: { name: string; cost: number; tokens: number; request_count: number }[]
}
export interface Adjustment {
  id: string
  user_id: string
  additional_amount: number
  valid_from: string
  valid_until: string
  source_work_order_id: string
  status: 'ACTIVE' | 'EXPIRED'
}
export interface BudgetConfig {
  budget_amount: number
  currency: 'CNY' | 'USD'
  period_type: 'MONTHLY' | 'QUARTERLY'
  budget_mode: 'SHARED' | 'INDEPENDENT'
  warning_threshold: number
  critical_threshold: number
  over_budget_action: 'ALERT_ONLY' | 'BLOCK_DEPARTMENT' | 'BLOCK_USER'
  notification_recipients: Record<Level, string[]>
  notification_channels: Record<Level, ('IN_APP' | 'EMAIL')[]>
}
export interface Budget extends BudgetConfig {
  id: string
  department_id: string
  user_id: string | null
  configured: boolean
  source_department_id: string | null
  consumed_amount: number
  temporary_amount: number
  effective_amount: number
  remaining_amount: number
  usage: number
  status: BudgetStatus
  current_period_start: string
  current_period_end: string
  adjustments: Adjustment[]
  history: {
    action: string
    amount: number
    at: string
    actor: string
    configuration?: BudgetConfig
    reason?: string
  }[]
}
export interface BudgetAnalytics {
  trend: { date: string; cost: number }[]
  models: { name: string; cost: number; requests: number }[]
  users: { name: string; cost: number }[]
}
export interface CostQuery extends OffsetPageQuery {
  search?: string
  status?: string
  department_id?: string
  parent_id?: string
  period_type?: string
  period_value?: string
}
export interface CostContext {
  departments: CostDepartment[]
  users: CostUser[]
  scope_root_id: string
  is_headquarters: boolean
}
const mock = { adapter: costMockAdapter }
export const getCostContext = (parent_id?: string, search?: string, scope_id?: string) =>
  request.get<CostContext>('/cost/mock-context', {
    ...mock,
    params: { parent_id, search, scope_id },
  })
export const getCostDepartment = (id: string) =>
  request.get<CostDepartment>(`/cost/mock-departments/${id}`, mock)
export const getBills = (params: CostQuery) =>
  request.get<OffsetPageResult<Bill>>('/bills', { ...mock, params })
export const generateBill = (data: {
  period_type: PeriodType
  period_value: string
  department_id: string
}) => request.post<Bill>('/bills/generate', data, mock)
export const getBill = (id: string) => request.get<Bill>(`/bills/${id}`, mock)
export const getBillItems = (
  id: string,
  params: {
    dimension: Dimension
    department_id?: string
    parent_id?: string
    sort_by: string
    direction: string
  },
) => request.get<BillItem[]>(`/bills/${id}/items`, { ...mock, params })
export const getBillTasks = (params: CostQuery) =>
  request.get<OffsetPageResult<BillTask>>('/bill-tasks', { ...mock, params })
export const saveBillTask = (
  data: Pick<BillTask, 'period_type' | 'department_id' | 'email_enabled' | 'email_recipients'>,
  id?: string,
) =>
  id
    ? request.put<BillTask>(`/bill-tasks/${id}`, data, mock)
    : request.post<BillTask>('/bill-tasks', data, mock)
export const setBillTaskStatus = (id: string, status: BillTask['status']) =>
  request.patch<BillTask>(`/bill-tasks/${id}/status`, { status }, mock)
export const deleteBillTask = (id: string, reason: string) =>
  request.delete(`/bill-tasks/${id}`, { ...mock, data: { reason } })
export const getDepartmentBudgets = (params: CostQuery) =>
  request.get<OffsetPageResult<Budget> & { headquarters: Budget }>('/budgets/departments', {
    ...mock,
    params,
  })
export const getUserBudgets = (params: CostQuery) =>
  request.get<OffsetPageResult<Budget>>('/budgets/users', { ...mock, params })
export const getBudget = (kind: 'departments' | 'users', id: string) =>
  request.get<Budget>(`/budgets/${kind}/${id}`, mock)
export const getBudgetAnalytics = (kind: 'departments' | 'users', id: string) =>
  request.get<BudgetAnalytics>(`/budgets/${kind}/${id}/analytics`, mock)
export const saveBudget = (
  kind: 'departments' | 'users',
  data: BudgetConfig & { department_id?: string; user_ids?: string[] },
  id?: string,
) =>
  id
    ? request.put<Budget>(`/budgets/${kind}/${id}`, data, mock)
    : request.post<Budget>(`/budgets/${kind}`, data, mock)
export const removeBudget = (
  kind: 'departments' | 'users',
  id: string,
  reason: string,
  cascade_subtree = false,
) => request.delete(`/budgets/${kind}/${id}`, { ...mock, data: { reason, cascade_subtree } })
export const getBudgetWarnings = (
  kind: 'departments' | 'users',
  data: { budget_amount: number; department_id?: string; user_ids?: string[] },
) =>
  request.post<{ sum: number; limit: number; kind: string }[]>(
    '/cost/mock-budget-validation',
    { ...data, kind },
    mock,
  )
export async function exportBill(id: string, dimension: Dimension, department_id?: string) {
  return request.get<Blob>(`/bills/${id}/export`, {
    ...mock,
    params: { dimension, department_id },
    responseType: 'blob',
    skipLocale: false,
  })
}
