import type { DepartmentQuery, DepartmentItem } from './identity'
import request from '@/api/request'
import type { OffsetPageQuery, OffsetPageResult } from '../types'
export type ScopeType = 'DEPARTMENT' | 'COST_CENTER' | 'FEE_SUBJECT'
export type PeriodType = 'MONTHLY' | 'WEEKLY'
export type Dimension = 'FEE_SUBJECT' | 'COST_CENTER' | 'DEPARTMENT' | 'USER' | 'MODEL' | 'PROVIDER'
export interface ScopeOption {
  value: string
  label: string
  type: ScopeType
  costCenterId?: string
  costCenterName?: string
  subjectType?: 'DEPARTMENT' | 'PROJECT'
  ownerId?: string
  subjectCount?: number
}
export interface BillInput {
  periodType: PeriodType
  date: string
  scopeType: ScopeType
  scopeId: string
}
export interface Bill {
  id: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
  scopeType: ScopeType
  scopeId: string
  scopeName: string
  costCenterId: string | null
  costCenterName: string | null
  feeSubjectId: string | null
  feeSubjectName: string | null
  createdByUserId: string
  taskId?: string
  totalCost: number
  totalTokens: number
  totalRequests: number
  directCost: number
  projectCost: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  uncontrolledCost: number
  status: 'GENERATING' | 'COMPLETED' | 'FAILED'
  generatedAt: string
  generatedBy: 'MANUAL' | 'AUTO'
  failureReason?: string
}
export interface BillTask {
  id: string
  periodType: PeriodType
  scopeType: ScopeType
  scopeId: string
  scopeName: string
  emailEnabled: boolean
  emailRecipients: string[]
  createdByUserId: string
  createdAt: string
  nextRunAt: string | null
  status: 'ACTIVE' | 'DISABLED'
  lastRunAt?: string
  lastBillId?: string
}
export type TaskInput = Pick<
  BillTask,
  'periodType' | 'scopeType' | 'scopeId' | 'emailEnabled' | 'emailRecipients'
>
export interface BillQuery extends OffsetPageQuery {
  periodType?: string
  scopeType?: string
  scopeId?: string
  month?: string
  status?: string
  sort_by?: string
  direction?: string
}
export interface DimensionRow {
  id: string
  name: string
  subjectType: string | null
  costCenterName: string | null
  cost: number
  directCost: number
  projectCost: number
  uncontrolledCost: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  requests: number
  percentage: number
  path?: string
  departmentId?: string
  hasChildren?: boolean
  isDirect?: boolean
}
export interface AnalysisQuery extends OffsetPageQuery {
  dimension: Dimension
  department_parent_id?: string
  controlStatus?: string
  filter?: string
  sort_by?: string
  direction?: string
}
export interface BillDetail {
  bill: Bill
  analysis: OffsetPageResult<DimensionRow>
  options: { value: string; label: string }[]
}
export const getBillOptions = () =>
  request.get<{
    scopes: ScopeOption[]
    billScopes: ScopeOption[]
    taskScopes: ScopeOption[]
    cutoff: string
    months: string[]
  }>('/cost/bill-options')
export const getBills = (params: BillQuery) =>
  request.get<OffsetPageResult<Bill>>('/cost/bills', { params })
export const createBill = (data: BillInput) => request.post<Bill>('/cost/bills', data)
export const getBill = (id: string, params: AnalysisQuery) =>
  request.get<BillDetail>(`/cost/bills/${id}`, { params })
export const regenerateBill = (id: string) => request.post<Bill>(`/cost/bills/${id}/regenerate`)
export const exportBill = (id: string, params: Partial<AnalysisQuery> & { all?: boolean }) =>
  request.get<{ content: string; count: number }>(`/cost/bills/${id}/export`, { params })
export const getBillTasks = (params: BillQuery) =>
  request.get<OffsetPageResult<BillTask>>('/cost/bill-tasks', { params })
export const saveBillTask = (data: TaskInput, id?: string) =>
  id
    ? request.put<BillTask>(`/cost/bill-tasks/${id}`, data)
    : request.post<BillTask>('/cost/bill-tasks', data)
export const setBillTaskStatus = (id: string, status: BillTask['status']) =>
  request.post<BillTask>(`/cost/bill-tasks/${id}/status`, { status })
export const deleteBillTask = (id: string) => request.delete(`/cost/bill-tasks/${id}`)

export const getBillDepartments = (params: DepartmentQuery) =>
  request.get<{
    items: Pick<DepartmentItem, 'id' | 'name' | 'display_name' | 'parent_id' | 'has_children'>[]
  }>('/cost/bill-departments', { params })

export const getBillDepartmentTree = (
  id: string,
  params: DepartmentQuery & { controlStatus?: string },
) =>
  request.get<{
    items: Pick<DepartmentItem, 'id' | 'name' | 'display_name' | 'parent_id' | 'has_children'>[]
  }>(`/cost/bills/${id}/departments`, { params })
