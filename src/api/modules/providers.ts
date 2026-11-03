import request from '@/api/request'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'

const DEFAULT_DISCOVERY_REASON = '由管理端发起供应商模型发现'

export const publicConfigKeys = [
  'api_version',
  'client_id',
  'project_id',
  'region',
  'tenant_id',
] as const
export const secretKeys = [
  'api_key',
  'client_secret',
  'secret_id',
  'secret_key',
  'service_account_json',
] as const
export type PublicConfigKey = (typeof publicConfigKeys)[number]
export type SecretKey = (typeof secretKeys)[number]
export type SecurityLevel = 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'

export interface TemplateField {
  key: string
  label_en: string
  label_zh: string
  max_length: number
  required: boolean
  value_type: 'STRING' | 'SECRET'
}
export interface TemplateVariant {
  auth_mode: string
  endpoint_profile: string
  label_en: string
  label_zh: string
  fields: TemplateField[]
}
export interface TemplateCombination {
  auth_mode: string
  endpoint_profile: string
  invocation_api: string
  operation_profile: string
  adapter_version: string | null
  support_stage: string
  support_status: string
}
export interface ProviderTemplate {
  template_key: string
  display_name: string
  version: string
  default_base_url: string | null
  discovery_supported: boolean
  contract_state: string
  fields: TemplateField[]
  variants: TemplateVariant[]
  combinations: TemplateCombination[]
}
export interface ProviderItem {
  id: string
  name: string
  template_key: string
  template_version: string
  base_url: string
  auth_mode: string
  endpoint_profile: string
  security_level: SecurityLevel
  notes: string
  model_count: string
  invocation_generation: string
  configured_secret_fields: string[]
  public_config: Partial<Record<PublicConfigKey, string>>
}
export interface ProviderPayload {
  template_key: string
  name: string
  base_url: string
  auth_mode: string
  endpoint_profile: string
  security_level: SecurityLevel
  notes: string
  public_config: Partial<Record<PublicConfigKey, string>>
  reason?: string
  secret_actions: Partial<
    Record<SecretKey, { operation: 'KEEP' | 'REPLACE' | 'CLEAR'; value?: string }>
  >
}
export interface ProviderMutationResult {
  applied: boolean
  replayed: boolean
  resource_id: string
}
export function getProviderTemplatesApi() {
  return request.get<OffsetPageResult<ProviderTemplate>>('/provider-templates', {
    params: { page: 1, page_size: 100 },
  })
}
export function getProvidersApi(params: OffsetPageQuery & { search?: string }) {
  return request.get<OffsetPageResult<ProviderItem>>('/providers', { params })
}
export function getProviderApi(id: string) {
  return request.get<ProviderItem>(`/providers/${encodeURIComponent(id)}`, { skipLocale: true })
}
export function createProviderApi(data: ProviderPayload) {
  return request.post<ProviderMutationResult>('/providers', data)
}
export function updateProviderApi(id: string, data: ProviderPayload) {
  return request.put<ProviderMutationResult>(`/providers/${encodeURIComponent(id)}`, data)
}

export function deleteProviderApi(id: string, reason: string) {
  return request.delete<ProviderMutationResult>(`/providers/${encodeURIComponent(id)}`, {
    data: { reason },
  })
}
export interface ProviderModel {
  id: string
  model_id_at_provider: string
  model_type: ProviderModelType
  status: 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  mounts: {
    display_name: string
    logical_name: string
    logical_model_id: string
    priority: number
  }[]
}
export function getProviderModelsApi(provider_id: string, page: number, page_size: number) {
  return request.get<OffsetPageResult<ProviderModel>>('/models', {
    params: { provider_id, page, page_size },
  })
}

export type ProviderModelType = 'LLM' | 'EMBEDDING' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'MULTIMODAL'
export interface DiscoveryItem {
  candidate_id: string
  model_id_at_provider: string
  display_name: string
  model_type: ProviderModelType | null
  auto_create_allowed: boolean
  manual_confirmation_reason: string | null
  declared_capabilities: {
    context_window: string | null
    max_output_tokens: string | null
    supports_json_mode: boolean | null
    supports_streaming: boolean | null
    supports_tool_calling: boolean | null
    supports_vision: boolean | null
  }
  logical_suggestions: {
    id: string
    display_name: string
    localized_name: string
    logical_name: string
    status: 'ACTIVE' | 'DISABLED'
    workload_kind: string | null
  }[]
}
export interface ModelDiscovery {
  discovery_id: string
  status: 'SUCCEEDED' | 'FAILED'
  item_count: number
  safe_error_code: string | null
}
export interface ModelImportItem {
  source: 'DISCOVERY' | 'MANUAL'
  candidate_id?: string
  model_id_at_provider?: string
  model_type?: ProviderModelType
  invocation_api: string
  operation_profile: string
  invocation_config: Record<string, never>
  logical_binding: { mode: 'NONE' }
}
export interface ModelImportBatch {
  batch_id: string
  cancel_requested: boolean
  kind: 'IMPORT' | 'ADMISSION' | 'PUBLISH'
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED'
  next_index: number
  stop_reason: string | null
  remote: { cleanup_required: boolean; pending_count: number; unknown_count: number }
  items: {
    index: number
    job_id: string | null
    physical_model_id: string | null
    model_id_at_provider?: string
    safe_error_code: string | null
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'NEEDS_CONFIRMATION' | 'NOT_EXECUTED'
  }[]
}
export function discoverProviderModelsApi(id: string, signal: AbortSignal) {
  return request.post<{ discovery_id: string; replayed: boolean }>(
    `/providers/${encodeURIComponent(id)}/models/discover`,
    { reason: DEFAULT_DISCOVERY_REASON },
    { signal },
  )
}
export function getModelDiscoveryApi(id: string, signal: AbortSignal, timeout: number) {
  return request.get<ModelDiscovery>(`/model-discoveries/${encodeURIComponent(id)}`, {
    signal,
    timeout,
    skipLocale: true,
  })
}
export function getModelDiscoveryItemsApi(id: string, page: number, signal: AbortSignal) {
  return request.get<OffsetPageResult<DiscoveryItem>>(
    `/model-discoveries/${encodeURIComponent(id)}/items`,
    { params: { page, page_size: 100 }, signal },
  )
}
export function importProviderModelsApi(
  id: string,
  data: { discovery_id?: string; items: ModelImportItem[]; reason: string },
  signal: AbortSignal,
) {
  return request.post<{ accepted: boolean; batch_id: string; replayed: boolean }>(
    `/providers/${encodeURIComponent(id)}/models/import`,
    data,
    { signal },
  )
}
export function getModelImportBatchApi(id: string, signal: AbortSignal, timeout: number) {
  return request.get<ModelImportBatch>(`/model-admission-batches/${encodeURIComponent(id)}`, {
    signal,
    timeout,
    skipLocale: true,
  })
}
