import { request } from '@/api/request'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'

export type LogOutcome = 'SUCCEEDED' | 'REJECTED' | 'FAILED'
export interface ManagementLog {
  event_id: string
  occurred_at: string
  action: string
  actor_user_id: string | null
  actor_display_name_snapshot: string | null
  actor_username_snapshot: string | null
  resource_id: string | null
  resource_type: string
  target_display_name_snapshot: string | null
  outcome: LogOutcome
  reason: string | null
  request_id: string | null
  changes: { field: string; before: unknown; after: unknown }[]
  /** 原型展示扩展，后端管理审计契约尚未提供这些字段。 */
  prototype?: {
    role: string
    module: string
    operation: string
    resource_name: string
    description: string
    client_ip: string | null
    user_agent: string | null
    parameters: Record<string, unknown>
    error: string | null
  }
}
export interface LogQuery extends OffsetPageQuery {
  from?: string
  to?: string
  outcome?: string
  action?: string
  actor_user_id?: string
  /** 仅 Mock 支持的原型筛选条件。 */
  actor?: string
  module?: string
  resource_type?: string
  level?: string
  source?: string
  node_id?: string
  keyword?: string
}
export interface ManagementLogPage extends OffsetPageResult<ManagementLog> {
  window_from: string
  window_to: string
}
/** 以下运行日志和保留配置为原型 Mock 契约，待真实接口提供后对齐。 */
export interface RuntimeLog {
  id: string
  occurred_at: string
  level: string
  source: string
  node_id: string
  node_name: string
  component: string
  message: string
  context: Record<string, unknown>
}
export interface LogRetention {
  operation_days: number
  runtime_days: number
}
export interface LogOptions {
  modules: string[]
  operations: string[]
  resource_types: string[]
  levels: string[]
  sources: string[]
  nodes: { value: string; label: string }[]
}
export const getManagementLogs = (params: LogQuery) =>
  request.get<ManagementLogPage>('/audit/management', { params })
export const getManagementLog = (id: string) =>
  request.get<ManagementLog>(`/audit/management/${encodeURIComponent(id)}`)
export const getRuntimeLogs = (params: LogQuery) =>
  request.get<OffsetPageResult<RuntimeLog>>('/prototype/system-logs/runtime', { params })
export const getRuntimeLog = (id: string) =>
  request.get<RuntimeLog>(`/prototype/system-logs/runtime/${encodeURIComponent(id)}`)
export const getLogOptions = () => request.get<LogOptions>('/prototype/system-logs/options')
export const getLogRetention = () => request.get<LogRetention>('/prototype/system-logs/retention')
export const saveLogRetention = (data: LogRetention) =>
  request.put<LogRetention>('/prototype/system-logs/retention', data)
export const exportManagementLogs = (params: Omit<LogQuery, 'page' | 'page_size'>) =>
  request.get<ManagementLog[]>('/prototype/system-logs/export', { params })
