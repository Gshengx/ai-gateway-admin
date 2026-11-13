import type { Raw } from 'vue'
import type { RequestConfig } from '@/api/request'
import type { TemplateCondition } from '@/utils/modelTemplate'
import type {
  DynamicField,
  BalanceRecipientDisplay,
  CheckJob,
  CheckCounts,
  OfficialModelBinding,
} from './modelAccessContract'

// Form/view models. HTTP read/write DTOs live in modelAccessContract.ts.
export type Status = 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
export type Health = 'UNKNOWN' | 'CHECKING' | 'HEALTHY' | 'UNHEALTHY'
export type Subject = 'DEPARTMENT' | 'USER_GROUP' | 'USER'
export interface AuthField {
  conditions?: { visible: TemplateCondition[] | null; required: TemplateCondition[] | null }
  dto?: Pick<DynamicField, 'control' | 'options' | 'value_type' | 'validation_schema'>
  key: string
  label: string
  secret: boolean
  required: boolean
  default_value?: string
}
export interface Template {
  auth_modes?: { value: string; label: string }[]
  template_version_id?: string
  enabled?: boolean
  balance_template_supported?: boolean
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
  version?: number
  clear_secret_fields?: string[]
  configured_balance_secret_fields?: string[]
  template_version_id?: string
  recipient_users?: BalanceRecipientDisplay[]
  alert_state?: string
  id: string
  name: string
  template_key: string
  template_name?: string
  base_url: string
  provider_config: Record<string, string>
  configured_secret_fields: string[]
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  notes: string
  model_count: number
  balance_query_mode: 'NONE' | 'TEMPLATE' | 'CUSTOM'
  balance_query_config: BalanceConfig
  balance_alert_enabled: boolean
  balance_alert_threshold: number | string
  balance_alert_unit: string
  balance_alert_recipients: string[]
  balance_alert_channels: string[]
  last_balance_unit: string | null
  last_balance_value: string | null
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
  subject_username?: string | null
  created_at: string
}
export interface Period {
  id: string
  name: string
  is_fallback: boolean
  conditions: { weekdays: number[]; start: string; end: string }[]
}
export interface Rate {
  display_name?: string
  unit_label?: string
  metric_key: string
  unit: string
  unit_price: string | null
  period_prices: Record<string, string | null>
}
export interface Pricing {
  state?: 'PRICED' | 'UNPRICED' | 'CURRENCY_MISMATCH'
  catalog_default_price_version_id?: string | null
  catalog_price_version_id?: string | null
  id: string
  version: number
  source_type: 'BUILT_IN' | 'ENTERPRISE_CUSTOM'
  currency: string
  pricing_mode: 'FIXED' | 'TIME_BASED'
  metric_rates: Rate[]
  time_periods: Period[]
  created_at: string
  created_by: string
}
export interface Model {
  official_model_binding?: OfficialModelBinding
  provider_base_url?: string
  security_level?: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  provider_name?: string
  lifecycle_events?: {
    fromStatus?: string | null
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
  display_name?: string
  invocation_api?: string
  upstream_path?: string
  key: string
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR' | 'NOT_APPLICABLE' | 'REUSED'
  duration_ms: number | null
  detail: string
}
export interface TestRun {
  counts?: CheckCounts
  dto?: Raw<CheckJob>
  id: string
  model_id: string
  purpose: 'ADMISSION' | 'HEALTH'
  trigger_type: 'MANUAL' | 'AUTO'
  invocation_api: string
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR'
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
    last_balance_unit: null,
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
    supported_invocation_apis: [],
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
export { transport as accessApi } from './modelAccessTransport'

export async function isModelNameAvailable(
  name: string,
  excludeId?: string,
  config?: RequestConfig,
): Promise<boolean> {
  const { modelAccessApi } = await import('./modelAccessApi')
  const result = await modelAccessApi.M12({
    ...config,
    params: { model_id_at_gateway: name, exclude_model_id: excludeId },
  })
  return result.available
}
