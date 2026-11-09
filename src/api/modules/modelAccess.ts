import request from '@/api/request'
import type { OffsetPageResult } from '@/api/types'

// V1.4 的临时契约。真实接口上线后在本模块集中替换，组件不直接操作 mock。
export type Status = 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
export type Health = 'UNKNOWN' | 'CHECKING' | 'HEALTHY' | 'UNHEALTHY'
export type Subject = 'DEPARTMENT' | 'USER_GROUP' | 'USER'
export interface AuthField {
  key: string
  label: string
  secret: boolean
  required: boolean
  default_value?: string
}
export interface Template {
  template_key: string
  name: string
  base_url: string
  fields: AuthField[]
}
export interface BalanceConfig {
  method: 'GET' | 'POST'
  url: string
  auth: 'NONE' | 'BEARER' | 'HEADER'
  secret: string
  header: string
  unit: string
  mapping: 'AVAILABLE' | 'SUBTRACT'
  available_path: string
  total_path: string
  used_path: string
  body: string
}
export interface Provider {
  id: string
  name: string
  template_key: string
  base_url: string
  provider_config: Record<string, string>
  configured_secret_fields: string[]
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  notes: string
  model_count: number
  balance_query_mode: 'NONE' | 'TEMPLATE' | 'CUSTOM'
  balance_query_config: BalanceConfig
  balance_alert_enabled: boolean
  balance_alert_threshold: number
  balance_alert_unit: string
  balance_alert_recipients: string[]
  balance_alert_channels: string[]
  last_balance_value: number | null
  last_balance_attempt_at: string | null
  last_balance_success_at: string | null
  balance_query_status: 'NEVER_QUERIED' | 'SUCCESS' | 'FAILED'
  balance_query_error_code: string | null
  created_at: string
}
export interface Permission {
  id: string
  physical_model_id: string
  subject_type: Subject
  subject_id: string
  subject_name: string
  created_at: string
}
export interface Period {
  id: string
  name: string
  is_fallback: boolean
  conditions: { weekdays: number[]; start: string; end: string }[]
}
export interface Rate {
  metric_key: string
  unit: string
  unit_price: number | null
  period_prices: Record<string, number | null>
}
export interface Pricing {
  exclusive_usage_confirmed?: boolean
  id: string
  version: number
  source_type: 'BUILT_IN' | 'ENTERPRISE_CUSTOM'
  sync_mode: 'MANUAL' | 'AUTO'
  platform_catalog_version: string | null
  last_synced_at: string | null
  currency: string
  pricing_mode: 'FIXED' | 'TIME_BASED'
  metric_rates: Rate[]
  time_periods: Period[]
  created_at: string
  created_by: string
}
export interface Model {
  lifecycle_events?: {
    action: 'CREATE' | 'UPDATE' | 'STATUS'
    status: Status
    created_at: string
    actor: string
    reason: string
  }[]
  id: string
  provider_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  supported_invocation_apis: string[]
  custom_invocation_apis: CustomInvocationApi[]
  input_modalities: string[]
  output_modalities: string[]
  tags: string[]
  context_window: number | null
  max_output_tokens: number | null
  description: string
  status: Status
  health_status: Health
  auto_health_check: boolean
  health_check_interval_minutes: number
  health_checked_at: string | null
  created_at: string
  suspend_reason: string | null
  admission_valid: boolean
}
export interface CustomInvocationApi {
  invocation_api: string
  path: string
}
export interface Check {
  invocation_api?: string
  upstream_path?: string
  key: string
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR'
  duration_ms: number
  detail: string
}
export interface TestRun {
  id: string
  model_id: string
  purpose: 'ADMISSION' | 'HEALTH'
  trigger_type: 'MANUAL' | 'AUTO'
  invocation_api: string
  status: Check['status']
  checks: Check[]
  billing_user: string
  billing_department: string
  invocation_apis: string[]
  started_at: string
  completed_at: string | null
  triggered_by: string
}
export interface Candidate {
  context_window?: number | null
  max_output_tokens?: number | null
  model_id_at_provider: string
  model_id_at_gateway: string
  display_name: string
  input_modalities: string[]
  output_modalities: string[]
  tags: string[]
  supported_invocation_apis: string[]
  custom_invocation_apis: CustomInvocationApi[]
  already_added: boolean
}
export { invocationApis } from '@/utils/modelInvocation'
export const inputModalities = ['text', 'image', 'audio', 'video', 'file']
export const outputModalities = ['text', 'image', 'audio', 'video', 'embeddings']
export const statuses: Status[] = [
  'DRAFT',
  'TESTING',
  'PENDING_REVIEW',
  'ACTIVE',
  'SUSPENDED',
  'RETIRED',
]
export const metricKeys = [
  'input_tokens',
  'output_tokens',
  'cached_input_tokens',
  'cache_write_tokens',
  'reasoning_tokens',
  ...['image', 'audio', 'video'].flatMap((m) =>
    ['input', 'output'].flatMap((d) => [
      `${m}_${d}_tokens`,
      `${m}_${d}_count`,
      ...(m !== 'image' ? [`${m}_${d}_seconds`] : []),
      ...(m === 'video' ? [`${m}_${d}_frame_count`] : []),
    ]),
  ),
  'tool_call_count',
  'search_count',
  'request_count',
]
export function blankPricing(): Pricing {
  return {
    id: '',
    version: 0,
    source_type: 'BUILT_IN',
    sync_mode: 'MANUAL',
    platform_catalog_version: null,
    last_synced_at: null,
    currency: 'CNY',
    pricing_mode: 'FIXED',
    metric_rates: ([] as string[]).map((metric_key) => ({
      metric_key,
      unit: 'PER_MILLION_TOKENS',
      unit_price: null,
      period_prices: {},
    })),
    time_periods: [{ id: 'fallback', name: '', is_fallback: true, conditions: [] }],
    created_at: '',
    created_by: '',
  }
}
export function blankProvider(): Provider {
  return {
    id: '',
    name: '',
    template_key: 'openai',
    base_url: 'https://api.openai.com/v1',
    provider_config: {},
    configured_secret_fields: [],
    security_level: 'INTERNET',
    notes: '',
    model_count: 0,
    balance_query_mode: 'NONE',
    balance_query_config: {
      method: 'GET',
      url: '',
      auth: 'NONE',
      secret: '',
      header: '',
      unit: 'CNY',
      mapping: 'AVAILABLE',
      available_path: '',
      total_path: '',
      used_path: '',
      body: '',
    },
    balance_alert_enabled: false,
    balance_alert_threshold: 0,
    balance_alert_unit: 'CNY',
    balance_alert_recipients: [],
    balance_alert_channels: ['IN_APP'],
    last_balance_value: null,
    last_balance_attempt_at: null,
    last_balance_success_at: null,
    balance_query_status: 'NEVER_QUERIED',
    balance_query_error_code: null,
    created_at: '',
  }
}
export function blankModel(): Model {
  return {
    id: '',
    provider_id: '',
    model_id_at_gateway: '',
    model_id_at_provider: '',
    supported_invocation_apis: ['CHAT_COMPLETIONS'],
    custom_invocation_apis: [],
    input_modalities: [],
    output_modalities: [],
    tags: [],
    context_window: null,
    max_output_tokens: null,
    description: '',
    status: 'DRAFT',
    health_status: 'UNKNOWN',
    auto_health_check: false,
    health_check_interval_minutes: 360,
    health_checked_at: null,
    created_at: '',
    suspend_reason: null,
    admission_valid: false,
  }
}
type TemplateResponse = Partial<Omit<Template, 'fields'>> & {
  template_key: string
  display_name?: string
  default_base_url?: string
  fields?: (Partial<AuthField> & {
    key: string
    label_zh?: string
    label_en?: string
    value_type?: string
  })[]
}

function normalizeProvider(
  data: Partial<Provider> & {
    public_config?: Record<string, string>
  },
): Provider {
  // 未开发的余额字段保持空状态，不将缺失余额解释为零。
  const empty = blankProvider()
  return {
    ...empty,
    ...data,
    provider_config: data.provider_config ?? data.public_config ?? {},
    configured_secret_fields: data.configured_secret_fields ?? [],
    balance_query_config: { ...empty.balance_query_config, ...data.balance_query_config },
    balance_alert_recipients: data.balance_alert_recipients ?? [],
    balance_alert_channels: data.balance_alert_channels ?? [],
    last_balance_value: data.last_balance_value ?? null,
  }
}

export const accessApi = {
  metadata: (provider_id: string, model_id_at_provider: string) =>
    request.get<
      Pick<
        Model,
        | 'supported_invocation_apis'
        | 'input_modalities'
        | 'output_modalities'
        | 'tags'
        | 'context_window'
        | 'max_output_tokens'
      >
    >('/model-metadata', { params: { provider_id, model_id_at_provider } }),
  catalog: (model_id_at_provider: string) =>
    request.get<Pricing>('/pricing-catalog', { params: { model_id_at_provider } }),
  templates: async (): Promise<Template[]> => {
    const data = await request.get<TemplateResponse[] | { items: TemplateResponse[] }>(
      '/provider-templates',
      { params: { page: 1, page_size: 100 } },
    )
    return (Array.isArray(data) ? data : (data.items ?? [])).map((item) => ({
      template_key: item.template_key,
      name: item.name ?? item.display_name ?? '',
      base_url: item.base_url ?? item.default_base_url ?? '',
      fields: (item.fields ?? []).map((field) => ({
        key: field.key,
        label: field.label ?? field.label_zh ?? field.label_en ?? '',
        secret: field.secret ?? field.value_type === 'SECRET',
        required: field.required ?? false,
        default_value: field.default_value,
      })),
    }))
  },
  providers: async (params: Record<string, unknown>) => {
    const data = await request.get<OffsetPageResult<Provider>>('/providers', { params })
    return { ...data, items: (data.items ?? []).map(normalizeProvider) }
  },
  provider: async (id: string) =>
    normalizeProvider(await request.get<Provider>(`/providers/${id}`)),
  saveProvider: (data: Provider) =>
    data.id
      ? request.put<Provider>(`/providers/${data.id}`, data)
      : request.post<Provider>('/providers', data),
  removeProvider: (id: string, reason: string) =>
    request.delete(`/providers/${id}`, { data: { reason } }),
  balance: (id: string) => request.post<Provider>(`/providers/${id}/balance-query`, {}),
  discover: (id: string) =>
    request.post<{ discovery_id: string; items: Candidate[]; error_code: string | null }>(
      `/providers/${id}/models/discover`,
      {},
    ),
  import: (id: string, discovery_id: string, items: Candidate[]) =>
    request.post<{ items: Model[]; errors: string[] }>(`/providers/${id}/models/import`, {
      discovery_id,
      items,
    }),
  models: (params: Record<string, unknown>) =>
    request.get<OffsetPageResult<Model>>('/models', { params }),
  model: (id: string) => request.get<Model>(`/models/${id}`),
  saveModel: (data: Model) =>
    data.id ? request.put<Model>(`/models/${data.id}`, data) : request.post<Model>('/models', data),
  removeModel: (id: string, reason: string) =>
    request.delete(`/models/${id}`, { data: { reason } }),
  status: (id: string, status: Status, reason: string) =>
    request.put<Model>(`/models/${id}/status`, { status, reason }),
  startTest: (id: string, purpose: 'ADMISSION' | 'HEALTH', selected_checks: string[]) =>
    request.post<TestRun>(
      `/models/${id}/${purpose === 'HEALTH' ? 'health-checks' : 'admission-tests'}`,
      { selected_checks },
    ),
  test: (id: string, purpose: 'ADMISSION' | 'HEALTH', run: string) =>
    request.get<TestRun>(
      `/models/${id}/${purpose === 'HEALTH' ? 'health-checks' : 'admission-tests'}/${run}`,
    ),
  history: (id: string, purpose: 'ADMISSION' | 'HEALTH', page = 1) =>
    request.get<OffsetPageResult<TestRun>>(
      `/models/${id}/${purpose === 'HEALTH' ? 'health-checks' : 'admission-tests'}`,
      { params: { page, page_size: 20 } },
    ),
  permissions: (id: string, page = 1, subject_type?: Subject) =>
    request.get<OffsetPageResult<Permission>>(`/models/${id}/permissions`, {
      params: { page, page_size: 20, subject_type },
    }),
  grant: (id: string, items: Omit<Permission, 'id' | 'physical_model_id' | 'created_at'>[]) =>
    request.post(`/models/${id}/permissions`, { items }),
  revoke: (id: string, ids: string[], reason: string) =>
    request.delete(`/models/${id}/permissions`, { data: { ids, reason } }),
  pricing: (id: string) => request.get<Pricing>(`/models/${id}/pricing/current`),
  prices: (id: string, page = 1) =>
    request.get<OffsetPageResult<Pricing>>(`/models/${id}/pricing`, {
      params: { page, page_size: 20 },
    }),
  savePrice: (id: string, data: Pricing) => request.post<Pricing>(`/models/${id}/pricing`, data),
  syncPrice: (id: string) => request.post<Pricing>(`/models/${id}/pricing/sync`, {}),
}
