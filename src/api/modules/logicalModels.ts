import request from './modelRequest'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'

export type LogicalModelStatus = 'ACTIVE' | 'DISABLED'
export type WorkloadKind = 'TEXT_GENERATION' | 'EMBEDDING' | 'IMAGE_GENERATION' | 'AUDIO' | 'VIDEO'
export type SubjectType = 'DEPARTMENT' | 'GROUP' | 'USER'

export interface LogicalModelTranslation {
  locale_code: string
  name: string
  description: string
}

export interface AuthorizationSummary {
  department_count: number
  user_group_count: number
  user_count: number
}

export interface LogicalModel {
  authorization_summary?: AuthorizationSummary
  /** 历史响应可能省略创建时间。 */
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
  active_model_count?: number
  mounts: { physical_model_id: string; priority: number }[]
  translations: LogicalModelTranslation[]
  related_mounts?: OffsetPageResult<LogicalMount>
}

export interface LogicalMount {
  physical_model_id: string
  priority: number
  model_id_at_provider?: string | null
  provider_id?: string | null
  provider_name?: string | null
  provider_base_url?: string | null
  provider_security_level?: string | null
  status?: string | null
}

export interface LogicalModelPermission {
  grant_id: string
  logical_model_id: string
  subject_id: string
  subject_type: SubjectType
  subject_name?: string
  logical_model_name?: string
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
  logical_name?: string
  previous_logical_name?: string
  confirm_name_change?: boolean
}

export const supportsLogicalRename = true

export function renameLogicalModelApi(
  id: string,
  name: string,
  description: string,
  previousName: string,
) {
  return request.put<unknown>(`/logical-models/${encodeURIComponent(id)}`, {
    logical_name: name,
    previous_logical_name: previousName,
    confirm_name_change: true,
    description,
    reason: 'admin-console',
  })
}

export function batchGrantLogicalModelsApi(data: {
  logical_model_ids: string[]
  subjects: { subject_id: string; subject_type: SubjectType }[]
  reason: string
}) {
  return request.post<unknown>('/logical-model-permission-batches', {
    ...data,
    subjects: data.subjects.map((subject) => ({
      ...subject,
      subject_type: subject.subject_type === 'GROUP' ? 'USER_GROUP' : subject.subject_type,
    })),
  })
}

export interface MountLogicalModelPayload {
  physical_model_id: string
  confirm_existing_grant_impact: boolean
  reason: string
  priority?: number
}

export interface MountOrderPayload {
  physical_model_id: string
  placement: 'BEFORE' | 'AFTER' | 'FIRST' | 'LAST' | 'PRIORITY'
  priority?: number
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

export function getLogicalModelApi(id: string, mounts_page = 1, mounts_page_size = 20) {
  return request.get<LogicalModel>(`/logical-models/${encodeURIComponent(id)}`, {
    params: { mounts_page, mounts_page_size },
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

export async function getLogicalModelPermissionsApi(
  id: string,
  params: LogicalModelPermissionQuery,
  signal?: AbortSignal,
) {
  const result = await request.get<
    OffsetPageResult<
      Omit<LogicalModelPermission, 'subject_type'> & { subject_type: SubjectType | 'USER_GROUP' }
    >
  >(`/logical-models/${encodeURIComponent(id)}/permissions`, {
    params: { ...params, subject_type_version: 'v2' },
    signal,
  })
  return {
    ...result,
    items: result.items.map((item): LogicalModelPermission => ({
      ...item,
      subject_type: item.subject_type === 'USER_GROUP' ? 'GROUP' : item.subject_type,
    })),
  }
}

export function addLogicalModelPermissionsApi(id: string, data: AddLogicalModelPermissionsPayload) {
  return request.post<unknown>(`/logical-models/${encodeURIComponent(id)}/permissions`, {
    ...data,
    relations: data.relations.map((relation) => ({
      ...relation,
      subject_type: relation.subject_type === 'GROUP' ? 'USER_GROUP' : relation.subject_type,
    })),
  })
}

export function deleteLogicalModelPermissionsApi(
  id: string,
  data: DeleteLogicalModelPermissionsPayload,
) {
  return request.delete<unknown>(`/logical-models/${encodeURIComponent(id)}/permissions`, {
    data: {
      ...data,
      relations: data.relations.map(({ grant_id, logical_model_id, subject_id, subject_type }) => ({
        grant_id,
        logical_model_id,
        subject_id,
        subject_type: subject_type === 'GROUP' ? 'USER_GROUP' : subject_type,
      })),
    },
  })
}
