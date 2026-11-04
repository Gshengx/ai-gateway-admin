import request from '@/api/request'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'
import type { ProviderModelType } from './providers'

export type ModelStatus =
  'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
export type ModelType = ProviderModelType
export interface DeclaredCapabilities {
  context_window: string | null
  max_output_tokens: string | null
  supports_streaming: boolean | null
  supports_tool_calling: boolean | null
  supports_json_mode: boolean | null
  supports_vision: boolean | null
}
export interface ModelMount {
  display_name: string
  logical_model_id: string
  logical_name: string
  priority: number
}
export interface CapabilitySource {
  capability: keyof DeclaredCapabilities
  observed_at: string | null
  source: string
}
export interface InvocationConfig {
  deployment?: string | null
}
export interface LogicalBinding {
  mode: 'NONE' | 'EXISTING' | 'CREATE'
  logical_model_id?: string
  logical_name?: string
  display_name?: string
  description?: string
  translations?: Record<string, unknown>
  priority?: number
  confirm_existing_grant_impact?: boolean
}
export interface PhysicalModelItem {
  admission_generation: string
  admission_valid: boolean
  allowed_commands: string[]
  capability_sources: CapabilitySource[]
  declared_capabilities: DeclaredCapabilities
  description: string
  id: string
  invalid_reason: string | null
  invocation_api: string
  invocation_config: InvocationConfig
  model_id_at_provider: string
  model_type: ModelType
  mounts: ModelMount[]
  operation_profile: string
  provider_id: string
  state_reason: string | null
  status: ModelStatus
  verified_capabilities: unknown
  /** 后端 OpenAPI 未声明该字段；页面有则展示，无则使用占位符。 */
  created_at?: string
}
export type PhysicalModelDetail = PhysicalModelItem
export interface PhysicalModelListQuery extends OffsetPageQuery {
  search?: string
  locale?: string
  provider_id?: string
  logical_model_id?: string
  status?: ModelStatus
  unmounted?: boolean
}
type CapabilityInput = Omit<DeclaredCapabilities, 'context_window' | 'max_output_tokens'> & {
  context_window: string | number | null
  max_output_tokens: string | number | null
}
export interface CreatePhysicalModelPayload {
  declared_capabilities: CapabilityInput
  description: string
  invocation_api: string
  invocation_config: InvocationConfig
  logical_binding: LogicalBinding
  model_id_at_provider: string
  model_type: ModelType
  operation_profile: string
  provider_id: string
  reason: string
}
export type UpdatePhysicalModelPayload = Pick<
  CreatePhysicalModelPayload,
  | 'declared_capabilities'
  | 'description'
  | 'invocation_api'
  | 'invocation_config'
  | 'model_type'
  | 'operation_profile'
  | 'reason'
>
export interface DeletePhysicalModelPayload {
  reason: string
}
export type ModelCommand = 'PAUSE' | 'RESUME' | 'RETIRE' | 'REACTIVATE'
export interface ModelPricing {
  cached_input_price: string | null
  coverage_status: string
  currency: string
  input_price: string
  output_price: string
  pricing_profile_version: string
  revision: string
  uncovered_components: string[]
  unit: string
}
export interface ModelPricingBody {
  cached_input_price: string | null
  currency: 'CNY' | 'USD' | 'EUR'
  input_price: string
  output_price: string
  reason: string
  unit: 'PER_MILLION_TOKENS'
}
export interface ModelPricingStatus {
  cost_status: string
  pricing_status: string
  price: ModelPricing | null
}
export interface LogicalModelItem {
  candidate_count: number
  description: string
  display_name: string
  id: string
  localized_description: string
  localized_name: string
  logical_name: string
  mounts: unknown[]
  ready: boolean
  status: 'ACTIVE' | 'DISABLED'
  translations: unknown
  workload_kind: string | null
}
export interface MountPhysicalModelPayload {
  physical_model_id: string
  confirm_existing_grant_impact: boolean
  reason: string
  priority?: number
}
export const MODEL_REASON = {
  create: '管理端创建物理模型',
  update: '管理端更新物理模型',
  remove: '管理端删除物理模型',
  pause: '管理端暂停物理模型',
  resume: '管理端恢复物理模型',
  retire: '管理端下架物理模型',
  reactivate: '管理端重新上架物理模型',
  pricing: '管理端调整模型定价',
} as const

function normalizeCapability(value: string | number | null): string | null {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return String(value)
}
function normalizePayload<T extends { declared_capabilities: CapabilityInput }>(data: T) {
  return {
    ...data,
    declared_capabilities: {
      ...data.declared_capabilities,
      context_window: normalizeCapability(data.declared_capabilities.context_window),
      max_output_tokens: normalizeCapability(data.declared_capabilities.max_output_tokens),
    },
  }
}
export function getModelsApi(params: PhysicalModelListQuery, signal?: AbortSignal) {
  return request.get<OffsetPageResult<PhysicalModelItem>>('/models', { params, signal })
}
export function getModelApi(modelId: string) {
  return request.get<PhysicalModelDetail>(`/models/${encodeURIComponent(modelId)}`, {
    skipLocale: true,
  })
}
export function createModelApi(data: CreatePhysicalModelPayload) {
  return request.post<unknown>('/models', normalizePayload(data))
}
export function updateModelApi(modelId: string, data: UpdatePhysicalModelPayload) {
  return request.put<unknown>(`/models/${encodeURIComponent(modelId)}`, normalizePayload(data))
}
export function deleteModelApi(modelId: string, data: DeletePhysicalModelPayload) {
  return request.delete<unknown>(`/models/${encodeURIComponent(modelId)}`, {
    data,
    handledErrorCodes: ['REAUTH_REQUIRED'],
  })
}
export function sendModelCommandApi(
  modelId: string,
  data: { command: ModelCommand; reason: string },
) {
  return request.post<unknown>(`/models/${encodeURIComponent(modelId)}/commands`, data)
}
export function updateModelPricingApi(modelId: string, data: ModelPricingBody) {
  return request.post<unknown>(`/models/${encodeURIComponent(modelId)}/pricing`, data)
}
export function getModelPricingApi(modelId: string) {
  return request.get<ModelPricingStatus>(`/models/${encodeURIComponent(modelId)}/pricing/current`, {
    skipLocale: true,
  })
}
export function getLogicalModelsApi(params: OffsetPageQuery & { search?: string }) {
  return request.get<OffsetPageResult<LogicalModelItem>>('/logical-models', { params })
}
export function mountLogicalModelApi(logicalModelId: string, data: MountPhysicalModelPayload) {
  return request.post<unknown>(`/logical-models/${encodeURIComponent(logicalModelId)}/mount`, data)
}

export interface AdmissionMetric {
  p50_ms: string | null
  p95_ms: string | null
}
export interface AdmissionCheck {
  check_key: string
  duration_ms: string | null
  safe_error_code: string | null
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR'
  reliability_metrics?: {
    success_rate_percent: string
    ttft: { observed: AdmissionMetric }
    successful_latency: AdmissionMetric
  } | null
}
export interface AdmissionRun {
  run_id: string
  status: AdmissionCheck['status']
  admission_valid: boolean
  checks: AdmissionCheck[]
  sealed_at: string | null
  invalid_reason: string | null
}
export interface LatestAdmission {
  admission_valid: boolean
  invalid_reason: string | null
  latest_run: AdmissionRun | null
}
export function getLatestAdmissionApi(modelId: string) {
  return request.get<LatestAdmission>(
    `/models/${encodeURIComponent(modelId)}/admission-tests/latest`,
    { skipLocale: true },
  )
}
export function reviewModelApi(
  modelId: string,
  data: { decision: 'PUBLISH' | 'REJECT'; reason: string; run_id: string },
) {
  return request.post<unknown>(`/models/${encodeURIComponent(modelId)}/review`, data)
}
export function startModelAdmissionApi(
  modelId: string,
  data: {
    budget_authorization_ref: string
    reason: string
    selected_checks: string[]
    test_profile_version: string
  },
) {
  return request.post<{
    accepted: boolean
    job_id: string
    budget_batch_id: string
    replayed: boolean
  }>(`/models/${encodeURIComponent(modelId)}/admission-tests`, data)
}
export function getModelAdmissionJobApi(jobId: string) {
  return request.get<{
    job_id: string
    run_id: string | null
    safe_error_code: string | null
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ERROR' | 'CANCELLED'
  }>(`/model-admission-jobs/${encodeURIComponent(jobId)}`, { skipLocale: true })
}

export interface ModelPriceHistory extends ModelPricing {
  created_at: string
  created_by: string
}
export function getModelPriceHistoryApi(id: string, params: OffsetPageQuery) {
  return request.get<OffsetPageResult<ModelPriceHistory>>(
    `/models/${encodeURIComponent(id)}/pricing`,
    { params },
  )
}
export function getModelAdmissionHistoryApi(id: string, params: OffsetPageQuery) {
  return request.get<OffsetPageResult<AdmissionRun>>(
    `/models/${encodeURIComponent(id)}/admission-tests`,
    { params },
  )
}
