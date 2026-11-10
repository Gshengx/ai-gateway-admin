import request from '@/api/request'
import type { RequestConfig } from '@/api/request'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'

export interface ApiKeyItem {
  id: string
  user_id: string
  name: string
  masked_value: string
  status: 'ACTIVE' | 'DISABLED'
  created_at: string
  updated_at: string
  usage_source: string
  last_used_at: string | null
  last_used_ip: string | null
}

export type KeyControlCondition =
  | 'BASIC_CONDITIONS_MET'
  | 'BLOCKED'
  | 'USER_DISABLED'
  | 'KEY_DISABLED'
  | 'AI_FROZEN'
  | 'TERMS_REQUIRED'

export interface ManagedKeyItem extends ApiKeyItem {
  username: string
  user_display_name: string
  user_status: string
  user_ai_status: string
  department_id: string
  department_name: string
  department_display_name: string
  control_condition: string
  control_reasons: string[]
  condition_basis: string
}

export interface ManagedKeysQuery extends MyKeysQuery {
  locale?: string
  control_condition?: KeyControlCondition
  user_id?: string
  department_id?: string
}

export interface ManagedKeyMutationResult {
  key_id: string
  status: string | null
  applied: boolean
  changed: boolean
  replayed: boolean
}

export interface ManagedKeysBatchResult {
  requested_count: number
  applied: boolean
  changed: boolean
  replayed: boolean
}

export function getManagedKeysApi(params: ManagedKeysQuery, config?: RequestConfig) {
  return request.get<OffsetPageResult<ManagedKeyItem>>('/api-keys', {
    ...config,
    params,
  })
}

function managedHeaders(idempotencyKey: string) {
  return {
    'Idempotency-Key': idempotencyKey,
  }
}

export function enableManagedKeyApi(
  id: string,
  data: { key_ids?: string[] },
  idempotencyKey: string,
) {
  return request.post<ManagedKeyMutationResult>(
    `/api-keys/${encodeURIComponent(id)}/enable`,
    data,
    { headers: managedHeaders(idempotencyKey) },
  )
}

export function disableManagedKeyApi(
  id: string,
  data: { key_ids?: string[] },
  idempotencyKey: string,
) {
  return request.post<ManagedKeyMutationResult>(
    `/api-keys/${encodeURIComponent(id)}/disable`,
    data,
    { headers: managedHeaders(idempotencyKey) },
  )
}

export function deleteManagedKeyApi(
  id: string,
  data: { key_ids?: string[] },
  idempotencyKey: string,
) {
  return request.delete<ManagedKeyMutationResult>(`/api-keys/${encodeURIComponent(id)}`, {
    data,
    headers: managedHeaders(idempotencyKey),
  })
}

export function batchEnableManagedKeysApi(data: { key_ids: string[] }, idempotencyKey: string) {
  return request.post<ManagedKeysBatchResult>('/api-keys/batch/enable', data, {
    headers: managedHeaders(idempotencyKey),
  })
}

export function batchDisableManagedKeysApi(data: { key_ids: string[] }, idempotencyKey: string) {
  return request.post<ManagedKeysBatchResult>('/api-keys/batch/disable', data, {
    headers: managedHeaders(idempotencyKey),
  })
}

export function batchDeleteManagedKeysApi(data: { key_ids: string[] }, idempotencyKey: string) {
  return request.post<ManagedKeysBatchResult>('/api-keys/batch/delete', data, {
    headers: managedHeaders(idempotencyKey),
  })
}

export interface MyKeysQuery extends OffsetPageQuery {
  search?: string
  status?: ApiKeyItem['status']
}
export interface MyKeysResult extends OffsetPageResult<ApiKeyItem> {
  active_count: number
  total_count: number
  active_limit: number
}
export interface CreateMyKeyResult {
  key: ApiKeyItem
  plaintext: string | null
  secret_available: boolean
  replayed: boolean
}
export interface UpdateMyKeyResult {
  key: ApiKeyItem
  replayed: boolean
}
export interface DeleteMyKeyResult {
  key_id: string
  applied: boolean
  replayed: boolean
}
export function getMyKeysApi(params: MyKeysQuery) {
  return request.get<MyKeysResult>('/me/keys', {
    params,
    skipLocale: true,
  })
}
export function createMyKeyApi(data: { name: string }, idempotencyKey: string) {
  return request.post<CreateMyKeyResult>('/me/keys', data, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
export function updateMyKeyApi(id: string, data: { name: string }, idempotencyKey: string) {
  return request.patch<UpdateMyKeyResult>(`/me/keys/${encodeURIComponent(id)}`, data, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
export function deleteMyKeyApi(id: string, data: { key_ids?: string[] }, idempotencyKey: string) {
  return request.delete<DeleteMyKeyResult>(`/me/keys/${encodeURIComponent(id)}`, {
    data,
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  })
}
