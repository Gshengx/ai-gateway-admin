import type { DepartmentQuery, DepartmentItem } from './identity'
import request from '@/api/request'
import type { OffsetPageQuery, OffsetPageResult } from '../types'
export interface ExpenseRecord {
  id: string
  request_id: string
  created_at: string
  cost_owner_type: 'USER_DEPARTMENT' | 'DEPARTMENT' | 'PROJECT' | 'UNCONTROLLED' | 'UNASSIGNED'
  control_status: 'CONTROLLED' | 'UNCONTROLLED'
  fee_subject_id: string | null
  fee_subject_name: string | null
  cost_center_id: string | null
  cost_center_name: string | null
  purpose: 'PERSONAL' | 'PROJECT'
  cost_department_id: string
  user_id: string
  username: string
  user_name: string
  user_department_id: string
  user_department: string
  api_key_id: string
  api_key_name: string
  api_key_masked: string
  usage_modality: 'TEXT_TOKENS'
  model_id: string
  model_name: string
  provider_id: string
  provider_name: string
  input_tokens: number | null
  output_tokens: number | null
  cached_tokens: number | null
  total_tokens: number | null
  total_cost: number
  currency: 'CNY' | 'USD'
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL'
  usage_source: 'PROVIDER' | 'GATEWAY'
  raw_usage: Record<string, number> | null
  normalized_usage: Record<string, number> | null
  price_snapshot_version: string
  billing_items: { name: string; usage: number; unit: string; price: number; subtotal: number }[]
  error_code: string | null
  error_message: string | null
}
export interface ExpenseQuery extends OffsetPageQuery {
  fee_subject_id?: string
  cost_center_id?: string
  control_status?: string
  bill_id?: string
  search?: string
  cost_owner_type?: string
  department_id?: string
  department_direct?: string
  user_id?: string
  model_id?: string
  provider_id?: string
  status?: string
  start?: string
  end?: string
  min_cost?: number
  max_cost?: number
  min_tokens?: number
  max_tokens?: number
  sort_by?: string
  direction?: string
}
export interface ExpenseSummary {
  cost: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  tokens: number
  requests: number
  average: number
}
export const getExpenses = (params: ExpenseQuery) =>
  request.get<OffsetPageResult<ExpenseRecord> & { summary: ExpenseSummary }>('/cost/records', {
    params,
  })
export const getExpense = (id: string) => request.get<ExpenseRecord>(`/cost/records/${id}`)
export const getExpenseOptions = () =>
  request.get<{
    users: { value: string; label: string }[]
    models: { value: string; label: string }[]
    providers: { value: string; label: string }[]
    feeSubjects: { value: string; label: string }[]
    costCenters: { value: string; label: string }[]
    departments: { value: string; label: string }[]
  }>('/cost/record-options')
export const exportExpenses = (
  data: ExpenseQuery & { fields: string[]; range: 'FILTERED' | 'ALL' },
) => request.post<{ content: string; count: number }>('/cost/records-export', data)

export const getExpenseDepartments = (params: DepartmentQuery) =>
  request.get<{
    items: Pick<DepartmentItem, 'id' | 'name' | 'display_name' | 'parent_id' | 'has_children'>[]
  }>('/cost/expense-departments', { params })
