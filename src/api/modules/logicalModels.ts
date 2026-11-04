import request from '@/api/request'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'

export type LogicalModelStatus = 'ACTIVE' | 'DISABLED'
export type WorkloadKind = 'TEXT_GENERATION' | 'EMBEDDING' | 'IMAGE_GENERATION' | 'AUDIO' | 'VIDEO'
export type SubjectType = 'DEPARTMENT' | 'GROUP' | 'USER'

export interface LogicalModelTranslation {
  locale_code: string
  name: string
  description: string
}

export interface LogicalModel {
  /** Mock 扩展：当前后端未返回创建时间。 */
  created_at?: string
  id: string
  logical_name: string
  display_name: string
  localized_name: string
  description: string
  localized_description: string
  status: LogicalModelStatus
  workload_kind: WorkloadKind | null
  ready: boolean
  candidate_count: number
  mounts: { physical_model_id: string; priority: number }[]
  translations: LogicalModelTranslation[]
}

export interface LogicalModelPermission {
  grant_id: string
  logical_model_id: string
  subject_id: string
  subject_type: SubjectType
}

export interface LogicalModelListQuery extends OffsetPageQuery {
  search?: string
  locale?: string
  status?: LogicalModelStatus
}

export interface CreateLogicalModelPayload {
  logical_name: string
  display_name: string
  description: string
  reason: string
  translations: LogicalModelTranslation[]
  workload_kind?: WorkloadKind | null
}

export interface UpdateLogicalModelPayload {
  reason: string
  description?: string
  display_name?: string
  status?: LogicalModelStatus
  translations?: LogicalModelTranslation[]
  workload_confirmation?: unknown
}

export const supportsLogicalRename = import.meta.env.VITE_USE_MOCK === 'true'

/** 仅 mock 支持 API 名称修改，不向真实接口发送未声明字段。 */
export function renameLogicalModelApi(id: string, name: string, description: string) {
  if (!supportsLogicalRename) return Promise.reject(new Error('Logical rename unavailable'))
  return request.put<unknown>(`/logical-models/${encodeURIComponent(id)}`, {
    logical_name: name,
    display_name: name,
    description,
    reason: 'admin-console',
  })
}

export function batchGrantLogicalModelsApi(data: {
  logical_model_ids: string[]
  subjects: { subject_id: string; subject_type: SubjectType }[]
  reason: string
}) {
  return request.post<unknown>('/logical-model-permission-batches', data)
}

export interface MountLogicalModelPayload {
  physical_model_id: string
  confirm_existing_grant_impact: boolean
  reason: string
  priority?: number
}

export interface MountOrderPayload {
  physical_model_id: string
  placement: 'BEFORE' | 'AFTER' | 'FIRST' | 'LAST'
  anchor_id?: string
  reason: string
}

export interface LogicalModelPermissionQuery extends OffsetPageQuery {
  search?: string
}

export interface AddLogicalModelPermissionsPayload {
  reason: string
  relations: { subject_id: string; subject_type: SubjectType }[]
}

export interface DeleteLogicalModelPermissionsPayload {
  reason: string
  relations: LogicalModelPermission[]
}

export function getLogicalModelsApi(params: LogicalModelListQuery) {
  return request.get<OffsetPageResult<LogicalModel>>('/logical-models', { params })
}

export function getLogicalModelApi(id: string) {
  return request.get<LogicalModel>(`/logical-models/${encodeURIComponent(id)}`, {
    skipLocale: true,
  })
}

export function createLogicalModelApi(data: CreateLogicalModelPayload) {
  return request.post<{ applied: boolean; replayed: boolean; resource_id: string }>(
    '/logical-models',
    data,
  )
}

export function updateLogicalModelApi(id: string, data: UpdateLogicalModelPayload) {
  return request.put<unknown>(`/logical-models/${encodeURIComponent(id)}`, data)
}

export function deleteLogicalModelApi(id: string, data: { reason: string }) {
  return request.delete<unknown>(`/logical-models/${encodeURIComponent(id)}`, { data })
}

export function mountLogicalModelApi(id: string, data: MountLogicalModelPayload) {
  return request.post<unknown>(`/logical-models/${encodeURIComponent(id)}/mount`, data)
}

export function updateLogicalModelMountOrderApi(id: string, data: MountOrderPayload) {
  return request.post<unknown>(`/logical-models/${encodeURIComponent(id)}/mount-order`, data)
}

export function unmountLogicalModelApi(id: string, modelId: string, data: { reason: string }) {
  return request.delete<unknown>(
    `/logical-models/${encodeURIComponent(id)}/mount/${encodeURIComponent(modelId)}`,
    { data },
  )
}

export function getLogicalModelPermissionsApi(
  id: string,
  params: LogicalModelPermissionQuery,
  signal?: AbortSignal,
) {
  return request.get<OffsetPageResult<LogicalModelPermission>>(
    `/logical-models/${encodeURIComponent(id)}/permissions`,
    { params, signal },
  )
}

export function addLogicalModelPermissionsApi(id: string, data: AddLogicalModelPermissionsPayload) {
  return request.post<unknown>(`/logical-models/${encodeURIComponent(id)}/permissions`, data)
}

export function deleteLogicalModelPermissionsApi(
  id: string,
  data: DeleteLogicalModelPermissionsPayload,
) {
  return request.delete<unknown>(`/logical-models/${encodeURIComponent(id)}/permissions`, { data })
}
