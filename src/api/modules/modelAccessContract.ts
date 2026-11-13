// Source: docs/04B-API接口与字段字典.md and 04-openapi-review.json (V1.4 ADJ). Read and write DTOs are separate.

export type Decimal = string

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface Subject {
  subject_type: 'DEPARTMENT' | 'USER_GROUP' | 'USER'
  subject_id: string
}

export interface SubjectView {
  subject_type: 'DEPARTMENT' | 'USER_GROUP' | 'USER'
  subject_id: string
  name: string
  department_path: string | null
  manageable: boolean
  username: string | null
  parent_id: string | null
  has_children: boolean
  ancestors: Array<{ department_id: string; name: string }>
}

export interface CustomAPIInput {
  id?: string | null
  path: string
}

export interface InvocationAPI {
  id: string
  api_key: string
  kind: 'STANDARD' | 'CUSTOM'
  path: string | null
  adapter_key: string
  adapter_revision: string
  streaming_applicable: boolean
  applicability_reason?: string | null
}

export interface HealthInput {
  auto_health_check: boolean
  health_check_interval_minutes: 60 | 360 | 720 | 1440
}

export type SecretInput = Record<string, string>

export interface DynamicField {
  key: string
  label: string
  value_type: 'STRING' | 'INTEGER' | 'BOOLEAN' | 'SECRET' | 'JSON'
  required: boolean
  required_when: Array<FieldCondition> | null
  default: JsonValue
  options: Array<DisplayOption>
  description: string
  validation_schema: FieldValidationSchema
  visible_when: Array<FieldCondition> | null
  control:
    'TEXT' | 'PASSWORD' | 'TEXTAREA' | 'SELECT' | 'RADIO' | 'NUMBER' | 'SWITCH' | 'JSON_EDITOR'
}

export interface Template {
  key: string
  name: string
  revision: string
  enabled: boolean
  unavailable_reason?: string | null
  default_base_url?: string | null
  auth_modes: Array<DisplayOption>
  fields: Array<DynamicField>
  suggested_invocation_apis: Array<string>
  balance_template_supported: boolean
  balance_fields: Array<DynamicField>
  notification_delivery_supported: boolean
  icon_key: string
  balance_template_spec: BalanceTemplateSpec | null
  template_version_id: string
  catalog_release_id: string
}

export interface ConditionRow {
  weekdays: Array<number>
  start_minute: number
  end_minute: number
}

export interface PricePeriodInput {
  name: string
  is_fallback: boolean
  conditions: Array<ConditionRow>
  metric_rates: Array<MetricRateInput>
}

export interface PricingInput {
  expected_price_version: number
  currency: string
  pricing_mode: 'FIXED' | 'TIME_BASED'
  periods: Array<PricePeriodInput>
  reason?: string
  catalog_price_version_id?: string | null
  catalog_default_price_version_id?: string | null
}

export interface PricingVersion {
  id: string
  physical_model_id: string
  version: number
  source: 'BUILT_IN' | 'ENTERPRISE_CUSTOM'
  currency: string
  time_zone: string
  pricing_mode: 'FIXED' | 'TIME_BASED'
  periods: Array<PricePeriodDisplay>
  adapter_revision: string
  catalog_revision?: string | null
  rounding: 'HALF_EVEN'
  amount_scale: 18
  created_at: string
  created_by: string
  created_by_display: IdentitySnapshot
  catalog_price_version_id: string | null
  catalog_binding: CatalogBinding | null
  pricing_basis: PricingBasis
  catalog_default_price_version_id: string | null
}

export interface MetricSpec {
  metric_key: string
  unit: string
  unit_divisor: number
  description: string
  usage_mapping: Array<string>
  exclusive_group?: string | null
  included_in?: string | null
  display_name: string
  unit_label: string
}

export interface CurrentPricing {
  state: 'PRICED' | 'UNPRICED' | 'CURRENCY_MISMATCH'
  price: PricingVersion | null
  price_version: number
  metric_specs: Array<MetricSpec>
  billing_currency: string
  billing_time_zone: string
  currency_source: 'HEADQUARTERS' | 'DEFAULT_CNY'
  time_zone_source: 'DEFAULT_ASIA_SHANGHAI'
  unpriced_reason?: string | null
}

export interface BalanceQueryConfig {
  method?: 'GET' | 'POST'
  url?: string
  auth_type?: 'NONE' | 'BEARER' | 'HEADER' | 'TEMPLATE'
  value_path?: string | null
  currency_path?: string | null
  body?: Record<string, unknown> | null
  template_parameters?: BalanceTemplateParameters
  auth_header_name?: string | null
  calculation_mode?: 'DIRECT' | 'SUBTRACT'
  total_path?: string | null
  used_path?: string | null
}

export interface BalanceConfigInput {
  expected_version?: number
  mode: 'NONE' | 'TEMPLATE' | 'CUSTOM'
  currency_or_unit?: string | null
  query_config?: BalanceQueryConfig
  secrets?: SecretInput
  clear_secret_fields?: Array<string>
  alert_enabled: boolean
  threshold?: Decimal | null
  recipient_user_ids?: Array<string>
  channels?: Array<string>
}

export interface BalanceConfig {
  provider_id: string
  version: number
  mode: 'NONE' | 'TEMPLATE' | 'CUSTOM'
  currency_or_unit?: string | null
  query_config: BalanceQueryConfig
  configured_secret_fields: Array<string>
  alert_enabled: boolean
  threshold: Decimal | null
  recipient_user_ids: Array<string>
  channels: Array<string>
  notification_delivery_supported: boolean
  recipient_users: Array<BalanceRecipientDisplay>
}

export interface Provider {
  id: string
  name: string
  template_key: string
  template_revision: string
  connection_revision: number
  base_url: string
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  public_config: ProviderPublicConfig
  configured_secret_fields: Array<string>
  notes: string | null
  model_count: number
  version: number
  created_at: string
  updated_at: string
  created_by: string
  template_name: string
  template_icon_key: string
  balance_summary: ProviderBalanceSummary
  template_version_id: string
  catalog_release_id: string
}

export interface OfficialModelBinding {
  state: 'VERIFIED' | 'UNKNOWN' | 'STALE'
  canonical_model_id: string | null
  model_version: string | null
  deployment_name: string | null
  bound_connection_revision: number | null
  source_uri: string | null
  observed_at: string | null
  reason_code: string | null
}

export interface ModelBase {
  provider_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  supported_invocation_apis: Array<string>
  custom_invocation_apis?: Array<CustomAPIInput>
  input_modalities?: Array<string>
  output_modalities?: Array<string>
  context_window?: number | null
  max_output_tokens?: number | null
  tags?: Array<string>
  description?: string | null
  catalog_model_version_id?: string | null
}

export interface GrantDelta {
  expected_grant_version: number
  add: Array<Subject>
  remove_grant_ids: Array<string>
  reason?: string
}

export interface ModelCreate {
  provider_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  supported_invocation_apis: Array<string>
  custom_invocation_apis?: Array<CustomAPIInput>
  input_modalities?: Array<string>
  output_modalities?: Array<string>
  context_window?: number | null
  max_output_tokens?: number | null
  tags?: Array<string>
  description?: string | null
  initial_grants?: Array<Subject>
  health?: HealthInput
  pricing: PricingInput | null
  catalog_model_version_id?: string
  expected_provider_version: number
}

export interface ModelVersions {
  base: number
  state: number
  grants: number
  health: number
  price: number
  metadata: number
}

export interface Model {
  provider_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  supported_invocation_apis: Array<string>
  custom_invocation_apis: Array<CustomAPIView>
  input_modalities: Array<string>
  output_modalities: Array<string>
  context_window: number | null
  max_output_tokens: number | null
  tags: Array<string>
  description: string | null
  id: string
  status: 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  health_status: 'UNKNOWN' | 'HEALTHY' | 'UNHEALTHY' | 'CHECKING'
  health_checked_at: string | null
  health: HealthInput
  versions: ModelVersions
  official_model_binding: OfficialModelBinding
  provider_name: string
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  suspend_reason: string | null
  invocation_apis: Array<InvocationAPI>
  created_at: string
  updated_at: string
  created_by: string
  provider_template_key: string
  provider_template_name: string
  provider_template_icon_key: string
  provider_base_url: string
  catalog_model_version_id: string | null
}

export interface ModelUpdate {
  expected_base_version?: number
  base?: ModelIdentityInput
  grants?: GrantDelta
  pricing?: PricingInput
  health?: HealthInput
  expected_health_config_version?: number
  metadata?: ModelMetadataInput
  expected_metadata_version?: number
}

export interface StatusCommand {
  action: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'RESUME' | 'RETIRE' | 'REACTIVATE'
  expected_state_version: number
  reason?: string
}

export interface ModelTemplate {
  template_key: string
  model_id_at_provider: string
  metadata: ModelMetadata
  suggested_invocation_apis: Array<string>
  metric_specs: Array<MetricSpec>
  builtin_pricing: BuiltinPricingTemplate | null
  pricing_state: 'AVAILABLE' | 'NEEDS_CONFIGURATION' | 'UNSUPPORTED_RULE' | 'HIDDEN'
  pricing_details_visible: boolean
  catalog_model_version_id: string
  template_version_id: string
  catalog_release_id: string
  catalog_revision: string
}

export interface DiscoveryInput {
  resume_discovery_id?: string
}

export interface DiscoveryItem {
  model_id_at_provider: string
  suggested_gateway_name: string
  metadata: ModelMetadata
  already_added: boolean
  existing_physical_model_id: string | null
  provider_model_name: string | null
  existing_model_id_at_gateway: string | null
  suggested_gateway_name_conflict: boolean
  name_conflict_reason: string | null
  catalog_model_version_id: string | null
}

export interface Discovery {
  id: string
  provider_id: string
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED'
  items: Array<DiscoveryItem>
  total_loaded: number
  truncated: boolean
  expires_at: string
  error_code: string | null
  error_params: ErrorParams
  manual_entry_allowed: boolean
  page: number
  page_size: number
  total: number
  stats: { scope: 'LOADED'; loaded: number; added: number; addable: number; name_conflicts: number }
  template_version_id: string
  catalog_release_id: string
  catalog_revision: string
}

export interface ImportItem {
  model_id_at_provider: string
  model_id_at_gateway: string
  supported_invocation_apis?: Array<string>
  custom_invocation_apis?: Array<CustomAPIInput>
  catalog_model_version_id?: string
  pricing?: null
}

export interface ImportInput {
  discovery_id?: string | null
  models: Array<ImportItem>
  expected_provider_version: number
}

export interface BatchItem {
  input_index: number
  physical_model_id: string | null
  status: 'CREATED' | 'UPDATED' | 'ACCEPTED' | 'SKIPPED_EXISTING' | 'REJECTED'
  code: string
  params: ErrorParams
  job_id: string | null
  model: BatchModelContext | null
}

export interface BatchResult {
  items: Array<BatchItem>
  succeeded_count: number
  failed_count: number
}

export interface CheckInput {
  expected_base_version: number
  reuse_job_id?: string
}

export interface HealthCheckInput {
  expected_base_version: number
}

export interface AdmissionModelInput {
  physical_model_id: string
  expected_base_version: number
  supported_invocation_apis: Array<string>
  custom_invocation_apis?: Array<CustomAPIInput>
  reuse_job_id?: string
}

export interface ProviderAdmissionInput {
  models: Array<AdmissionModelInput>
}

export interface ModelVersionRef {
  physical_model_id: string
  expected_state_version: number
}

export interface PublishInput {
  models: Array<ModelVersionRef>
}

export interface CostLine {
  metric_key: string
  unit: string
  quantity: Decimal | null
  unit_divisor: number | null
  unit_price: Decimal | null
  amount: Decimal | null
  status: 'KNOWN' | 'UNKNOWN_USAGE' | 'UNPRICED' | 'CALCULATION_ERROR'
  rule_snapshot: CostRuleSnapshot
  unknown_reason: string | null
  display_name: string
  unit_label: string
}

export interface CostRecord {
  id: string
  job_id: string
  item_id: string
  physical_model_id: string
  provider_id: string
  purpose: 'ADMISSION' | 'HEALTH'
  api_key: string
  check_type: 'MODEL_REQUEST' | 'PROTOCOL' | 'STREAMING'
  model_provider_snapshot: ModelProviderSnapshot
  billing_identity_snapshot: BillingIdentitySnapshot
  department_snapshot: DepartmentSnapshot
  triggered_by_snapshot: IdentitySnapshot
  request_started_at: string | null
  currency: string
  time_zone: string
  price_snapshot: PriceSnapshot
  raw_usage: RawUsage | null
  normalized_usage: NormalizedUsage
  cost_status: 'COMPLETE' | 'PARTIAL' | 'UNPRICED' | 'UNKNOWN' | 'NOT_SENT'
  known_amount: Decimal | null
  total_amount: Decimal | null
  lines: Array<CostLine>
  error_code?: string | null
  created_at: string
}

export interface HttpExchange {
  ordinal: number
  purpose: 'MODEL' | 'AUTH' | 'UPLOAD' | 'POLL' | 'FETCH'
  http_method: string
  sanitized_target: string
  http_status: number | null
  error_code: string | null
  started_at: string
  completed_at: string | null
  request_attempted: boolean | null
}

export interface CheckItem {
  id: string
  api_key: string
  check_type: 'MODEL_REQUEST' | 'PROTOCOL' | 'STREAMING'
  status: 'WAITING' | 'RUNNING' | 'PASS' | 'FAIL' | 'ERROR' | 'NOT_APPLICABLE' | 'REUSED'
  dispatch_state: 'READY' | 'DISPATCHED' | 'FINISHED' | 'NOT_SENT'
  dispatch_count: number
  reused_item_id?: string | null
  request_started_at: string | null
  completed_at: string | null
  error_code: string | null
  result_detail: CheckResultDetail | null
  http_exchanges: Array<HttpExchange>
  cost: CostRecord | null
  reuse_source: ReuseSourceSnapshot | null
  invocation_api: InvocationAPIDisplay
}

export interface CheckJob {
  id: string
  physical_model_id: string
  purpose: 'ADMISSION' | 'HEALTH'
  trigger_type: 'MANUAL' | 'AUTO'
  triggered_by: string | null
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
  result: string | null
  base_version: number
  admission_epoch: string
  provider_version: number
  planned_model_calls: number
  actual_model_calls: number
  unknown_model_calls: number
  auxiliary_http_calls: number
  created_at: string
  started_at: string | null
  deadline_at: string
  completed_at: string | null
  items: Array<CheckItem>
  pricing_details_visible: boolean
  summary: CheckSummary
  triggered_by_display: IdentitySnapshot
  model_display: ModelDisplaySnapshot
  check_types: Array<string>
  invocation_apis: Array<InvocationAPIDisplay>
  metadata_version: number
}

export interface Grant {
  id: string
  physical_model_id: string
  subject_type: 'DEPARTMENT' | 'USER_GROUP' | 'USER'
  subject_id: string
  subject_name: string
  scope_mode: string | null
  created_at: string
  created_by: string
  manageable: boolean
  subject_username: string | null
  subject_department_path: string | null
}

export interface GrantResult {
  grant_version: number
  added: Array<Grant>
  removed_grant_ids: Array<string>
  unchanged_count: number
}

export interface BatchGrantInput {
  models: Array<{ physical_model_id: string; expected_grant_version: number }>
  add: Array<Subject>
  reason?: string
}

export interface BatchGrantResult {
  models: Array<{ physical_model_id: string; result: GrantResult }>
}

export interface AccessSource {
  grant_id: string
  subject_type: 'DEPARTMENT' | 'USER_GROUP' | 'USER'
  subject_id: string
  subject_name: string
  inherited: boolean
  subject_username: string | null
  subject_department_path: string | null
}

export interface AccessibleModel {
  model: ModelAuthorizationSummary
  sources: Array<AccessSource>
  available: boolean
  unavailable_reason: string | null
}

export interface SubjectGrantReplace {
  physical_model_ids: Array<string>
  expected_authorization_version: number
  reason?: string
}

export interface BalanceState {
  provider_id: string
  last_balance_value: Decimal | null
  last_balance_unit: string | null
  last_attempt_at: string | null
  last_success_at: string | null
  query_status: 'NEVER_QUERIED' | 'SUCCESS' | 'FAILED'
  error_code: string | null
  error_params: ErrorParams
  alert_state: 'UNKNOWN' | 'NORMAL' | 'LOW'
  active_run_id: string | null
  next_query_at: string | null
  notification_delivery_supported: boolean
}

export interface BalanceQueryReceipt {
  run_id: string
  status: 'RUNNING'
}

export interface BalanceRun {
  id: string
  provider_id: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  trigger_type: 'MANUAL' | 'AUTO'
  expected_currency_or_unit: string
  currency_or_unit: string | null
  balance_value: Decimal | null
  error_code: string | null
  safe_detail: {
    reason_code: string | null
    http_status: number | null
    value_path: string | null
    currency_path: string | null
    configured_currency: string
    observed_currency: string | null
    calculation_mode: string | null
    total_path: string | null
    used_path: string | null
  }
  started_at: string
  completed_at: string | null
}

export interface HealthConfigUpdate {
  auto_health_check: boolean
  health_check_interval_minutes: 60 | 360 | 720 | 1440
  expected_health_config_version: number
}

export interface Summary {
  total: number
  providers: Array<{
    provider_id: string
    provider_name: string
    model_count: number
    template_name: string
    template_icon_key: string
  }>
}

export interface Deleted {
  deleted: boolean
  resource_id: string
}

export interface ErrorParams {
  fields?: Record<string, unknown>
  current_version?: number
  version_domain?:
    | 'PROVIDER'
    | 'BASE'
    | 'STATE'
    | 'GRANTS'
    | 'HEALTH'
    | 'PRICE'
    | 'BALANCE'
    | 'AUTHORIZATION'
    | 'METADATA'
  allowed_actions?: Array<string>
  job_id?: string
  reason_code?: string
  retryable_by_user?: boolean
  details?: Array<SafeErrorDetail>
}

export interface Error {
  code: string
  data: null
  params: ErrorParams
  request_id: string
}

export interface ProviderPage {
  items: Array<ProviderListItem>
  page: number
  page_size: number
  total: number
}

export interface ModelPage {
  items: Array<ModelListItem>
  page: number
  page_size: number
  total: number
}

export interface ModelTemplatePage {
  items: Array<ModelTemplate>
  page: number | null
  page_size: number | null
  total: number
  catalog_release_id: string
  catalog_revision: string
}

export interface PricingVersionPage {
  items: Array<PricingVersion>
  page: number
  page_size: number
  total: number
}

export interface CheckJobPage {
  items: Array<CheckJobSummary>
  page: number
  page_size: number
  total: number
}

export interface AccessibleModelPage {
  items: Array<AccessibleModel>
  page: number
  page_size: number
  total: number
}

export interface SubjectViewPage {
  items: Array<SubjectView>
  page: number
  page_size: number
  total: number
  view_mode: 'TREE_CHILDREN' | 'SEARCH' | 'LIST'
}

export interface GrantPage {
  items: Array<Grant>
  page: number | null
  page_size: number | null
  total: number
  grant_version: number
  authorization_version: number
}

export interface SubjectGrantPage {
  items: Array<ModelAuthorizationSummary>
  authorization_version: number
  page: number
  page_size: number
  total: number
}

export interface SubjectGrantResult {
  authorization_version: number
  physical_model_ids: Array<string>
  changed_model_versions: Array<{ physical_model_id: string; grant_version: number }>
}

export interface TemplateList {
  items: Array<Template>
  catalog_release_id: string
  catalog_revision: string
}

export interface FieldCondition {
  field: string
  operator: 'EQ' | 'IN' | 'PRESENT'
  values: Array<JsonValue>
}

export type ProviderPublicConfig = Record<string, JsonValue>

export type BalanceTemplateParameters = Record<string, JsonValue>

export interface FieldSource {
  field: string
  source: 'MANUAL' | 'UPSTREAM' | 'BUILTIN' | 'UNKNOWN'
  source_uri: string | null
  observed_at: string | null
  catalog_revision: string | null
}

export interface ModelMetadata {
  input_modalities: Array<string>
  output_modalities: Array<string>
  context_window: number | null
  max_output_tokens: number | null
  tags: Array<string>
  description: string | null
  field_sources: Array<FieldSource>
  official_model_binding: OfficialModelBinding
}

export interface BuiltinPricingTemplate {
  currency: string
  time_zone: string
  pricing_mode: 'FIXED' | 'TIME_BASED'
  periods: Array<PricePeriodInput>
  catalog_revision: string
  adapter_revision: string
  source_uris: Array<string>
  rounding: 'HALF_EVEN'
  amount_scale: 18
  catalog_price_version_id: string
}

export interface SafeErrorDetail {
  reason_code: string
  field: string | null
  http_status: number | null
  upstream_error_code: string | null
  suggestion_code: string | null
}

export interface IdentitySnapshot {
  user_id: string | null
  username: string | null
  display_name: string | null
  kind: 'USER' | 'SYSTEM' | 'AUTO'
}

export interface DepartmentSnapshot {
  department_id: string
  name: string
  path: Array<{ id: string; name: string }>
}

export interface BillingIdentitySnapshot {
  service_code: 'SYSTEM_CHECK'
  billing_user_id: string
  username: string
  display_name: string
  department_id: string
  currency_source: 'HEADQUARTERS' | 'DEFAULT_CNY'
  time_zone_source: 'DEFAULT_ASIA_SHANGHAI'
}

export interface ModelProviderSnapshot {
  schema_version: 1
  physical_model_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  provider_id: string
  provider_name: string
  template_key: string
  template_revision: string
  base_url: string
  public_config: ProviderPublicConfig
  official_model_binding: OfficialModelBinding
  base_version: number
  provider_version: number
  connection_revision: number
  invocation_api: InvocationAPI
  tags: Array<string>
  template_name: string
  template_icon_key: string
  template_catalog_binding: CatalogBinding
  model_catalog_binding: CatalogBinding | null
  metadata_version: number
}

export interface MatchedPricePeriod {
  name: string
  is_fallback: boolean
  conditions: Array<ConditionRow>
  matched_at: string
}

export interface PriceSnapshot {
  schema_version: 2
  state: 'PRICED' | 'UNPRICED' | 'CURRENCY_MISMATCH'
  reason_code: string | null
  billing_currency: string
  billing_time_zone: string
  price: PricingVersion | null
  metric_specs: Array<MetricSpec>
  matched_period: MatchedPricePeriod | null
  rounding: 'HALF_EVEN'
  amount_scale: 18
  display_snapshot: PriceDisplaySnapshot | null
  catalog_binding: CatalogBinding | null
}

export interface UsageValue {
  value: Decimal | null
  state: 'KNOWN' | 'UNKNOWN'
  source_kind: string | null
  upstream_paths: Array<string>
  success_evidence: string | null
  exclusion_basis: string | null
  unknown_reason: string | null
}

export type NormalizedUsage = Record<string, UsageValue>

export type RawUsage = Record<string, JsonValue>

export type RawUsageValue = JsonValue

export interface CostRuleSnapshot {
  metric_key: string
  unit: string
  unit_divisor: number | null
  unit_price: Decimal | null
  period: MatchedPricePeriod | null
  rounding: 'HALF_EVEN'
  amount_scale: 18
  quantity_source: UsageValue
  unknown_reason: string | null
}

export interface CheckResultDetail {
  reason_code: string | null
  http_status: number | null
  latency_ms: number | null
  protocol: string
  assertions: Array<{ key: string; passed: boolean; reason_code: string | null }>
  stream_terminated: boolean | null
  upstream_request_id: string | null
  not_applicable_reason: string | null
  detail_text: string
  suggestion_text: string | null
}

export interface CheckSummary {
  passed_items: number
  failed_items: number
  error_items: number
  not_applicable_items: number
  reused_items: number
  waiting_items: number
  running_items: number
  cost_status?: 'COMPLETE' | 'PARTIAL' | 'UNPRICED' | 'UNKNOWN' | 'NOT_SENT'
  currency?: string
  known_amount?: Decimal | null
  total_amount?: Decimal | null
}

export interface ProviderCreate {
  name: string
  template_key: string
  base_url: string
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  public_config: ProviderPublicConfig
  secrets?: SecretInput
  clear_secret_fields?: Array<string>
  notes?: string | null
  balance_config?: BalanceConfigInput
  template_version_id: string
}

export interface ProviderUpdate {
  expected_version: number
  name: string
  template_key: string
  base_url: string
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  public_config: ProviderPublicConfig
  secrets?: SecretInput
  clear_secret_fields?: Array<string>
  notes?: string | null
  balance_config?: BalanceConfigInput
  template_version_id: string
}

export interface BalanceConfigUpdate {
  expected_version: number
  mode: 'NONE' | 'TEMPLATE' | 'CUSTOM'
  currency_or_unit?: string | null
  query_config?: BalanceQueryConfig
  secrets?: SecretInput
  clear_secret_fields?: Array<string>
  alert_enabled: boolean
  threshold?: Decimal | null
  recipient_user_ids?: Array<string>
  channels?: Array<string>
}

export interface FieldValidationSchema {
  type?: string | string[]
  enum?: Array<JsonValue>
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  properties?: Record<string, unknown>
  items?: FieldValidationSchema
  required?: Array<string>
  additionalProperties?: boolean
}

export interface ReuseSourceSnapshot {
  source_job_id: string
  source_item_id: string
  source_base_version: number
  source_admission_epoch: string
  source_provider_version: number
  source_completed_at: string
  source_model_provider_snapshot: ModelProviderSnapshot
  source_result: CheckResultDetail
  source_metadata_version: number
}

export interface DisplayOption {
  value: string
  label: string
}

export type LocaleLabelMap = Record<string, string>

export interface BalanceTemplateSpec {
  http_method: 'GET' | 'POST'
  path: string
  auth_field_keys: Array<string>
  calculation_mode: 'DIRECT' | 'SUBTRACT'
  currency_mode: 'FIXED' | 'CHOICE'
  fixed_currency_or_unit: string | null
  currency_options: Array<DisplayOption>
  value_path: string | null
  total_path: string | null
  used_path: string | null
  description: string
}

export interface ProviderBalanceSummary {
  last_balance_value: Decimal | null
  last_balance_unit: string | null
  last_attempt_at: string | null
  last_success_at: string | null
  query_status: 'NEVER_QUERIED' | 'SUCCESS' | 'FAILED'
  error_code: string | null
  alert_state: 'UNKNOWN' | 'NORMAL' | 'LOW'
  active_run_id: string | null
  mode: 'NONE' | 'TEMPLATE' | 'CUSTOM'
  alert_enabled: boolean
  threshold: Decimal | null
  notification_delivery_supported: boolean
  error_params: ErrorParams
}

export interface ProviderListItem {
  id: string
  name: string
  template_key: string
  template_name: string
  template_icon_key: string
  base_url: string
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
  notes: string | null
  model_count: number
  version: number
  created_at: string
  updated_at: string
  balance_summary: ProviderBalanceSummary
}

export interface ModelListItem {
  id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  provider_id: string
  provider_name: string
  provider_template_key: string
  provider_template_name: string
  provider_template_icon_key: string
  input_modalities: Array<string>
  output_modalities: Array<string>
  tags: Array<string>
  status: 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  health_status: 'UNKNOWN' | 'HEALTHY' | 'UNHEALTHY' | 'CHECKING'
  health_checked_at: string | null
  versions: ModelVersions
  created_at: string
  updated_at: string
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
}

export interface ProviderOption {
  id: string
  name: string
  template_key: string
  template_name: string
  template_icon_key: string
  base_url: string
  security_level: 'INTERNET' | 'TRUSTED_CLOUD' | 'PRIVATE'
}

export interface ProviderOptionPage {
  items: Array<ProviderOption>
  page: number | null
  page_size: number | null
  total: number
}

export interface TagOption {
  value: string
  label: string
  kind: 'BUILT_IN' | 'CUSTOM'
}

export interface TagOptionPage {
  items: Array<TagOption>
  page: number | null
  page_size: number | null
  total: number
}

export interface LifecycleEvent {
  id: string
  occurred_at: string
  action:
    | 'CREATED'
    | 'ADMISSION_STARTED'
    | 'ADMISSION_PASSED'
    | 'ADMISSION_FAILED'
    | 'APPROVED'
    | 'REJECTED'
    | 'SUSPENDED'
    | 'RESUMED'
    | 'RETIRED'
    | 'REACTIVATED'
  from_status: string | null
  to_status: 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  actor: IdentitySnapshot
  reason: string | null
}

export interface LifecycleEventPage {
  items: Array<LifecycleEvent>
  page: number
  page_size: number
  total: number
}

export interface InvocationAPIDisplay {
  id: string
  api_key: string
  kind: 'STANDARD' | 'CUSTOM'
  path: string | null
  display_name: string
}

export interface ModelDisplaySnapshot {
  physical_model_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  provider_id: string
  provider_name: string
  template_key: string
  template_name: string
  template_icon_key: string
  template_catalog_binding: CatalogBinding
  model_catalog_binding: CatalogBinding | null
}

export interface CheckCounts {
  passed_items: number
  failed_items: number
  error_items: number
  not_applicable_items: number
  reused_items: number
  waiting_items: number
  running_items: number
}

export interface CheckJobSummary {
  id: string
  physical_model_id: string
  purpose: 'ADMISSION' | 'HEALTH'
  trigger_type: 'MANUAL' | 'AUTO'
  triggered_by: string | null
  triggered_by_display: IdentitySnapshot
  model_display: ModelDisplaySnapshot
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
  result: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  counts: CheckCounts
  check_types: Array<string>
  invocation_apis: Array<InvocationAPIDisplay>
}

export interface MetricRateInput {
  metric_key: string
  unit: string
  unit_price: Decimal
}

export interface MetricRateDisplay {
  metric_key: string
  unit: string
  unit_price: Decimal
  display_name: string
  unit_label: string
}

export interface PricePeriodDisplay {
  name: string
  is_fallback: boolean
  conditions: Array<ConditionRow>
  metric_rates: Array<MetricRateDisplay>
}

export interface PriceDisplayMetric {
  metric_key: string
  unit: string
  display_names: LocaleLabelMap
  unit_labels: LocaleLabelMap
}

export interface PriceDisplaySnapshot {
  schema_version: 1
  fallback_locale: string
  created_by: IdentitySnapshot
  metrics: Array<PriceDisplayMetric>
}

export interface ImportedModelView {
  physical_model_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  provider_id: string
  provider_name: string
  status: 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  versions: ModelVersions
  supported_invocation_apis: Array<string>
  custom_invocation_apis: Array<CustomAPIView>
  invocation_apis: Array<InvocationAPI>
  catalog_model_version_id: string | null
}

export interface ImportBatchItem {
  input_index: number
  physical_model_id: string | null
  status: 'CREATED' | 'SKIPPED_EXISTING' | 'REJECTED'
  code: string
  params: ErrorParams
  model: ImportedModelView | null
}

export interface ImportBatchResult {
  items: Array<ImportBatchItem>
  succeeded_count: number
  skipped_count: number
  failed_count: number
}

export interface BatchModelContext {
  physical_model_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  provider_id: string
  provider_name: string
  status: 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  versions: ModelVersions
  supported_invocation_apis: Array<string>
  custom_invocation_apis: Array<CustomAPIView>
  invocation_apis: Array<InvocationAPI>
  catalog_model_version_id: string | null
}

export interface BalanceRecipientDisplay {
  user_id: string
  username: string | null
  display_name: string | null
  department_id: string | null
  department_name: string | null
  department_path: string | null
  email: string | null
  email_valid: boolean | null
  selectable: boolean
  unavailable_reason: string | null
}

export interface BalanceRecipientOptionPage {
  items: Array<BalanceRecipientDisplay>
  page: number
  page_size: number
  total: number
  selected_items: Array<BalanceRecipientDisplay>
}

export interface ModelAuthorizationSummary {
  id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  provider_id: string
  provider_name: string
  provider_template_key: string
  provider_template_name: string
  provider_template_icon_key: string
  input_modalities: Array<string>
  output_modalities: Array<string>
  status: 'DRAFT' | 'TESTING' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  health_status: 'UNKNOWN' | 'HEALTHY' | 'UNHEALTHY' | 'CHECKING'
}

export interface ModelAuthorizationSummaryPage {
  items: Array<ModelAuthorizationSummary>
  page: number
  page_size: number
  total: number
}

export interface CustomAPIView {
  id: string
  path: string
}

export interface CatalogBinding {
  catalog_release_id: string
  catalog_revision: string
  template_version_id: string
  catalog_model_version_id: string | null
  catalog_price_version_id: string | null
}

export interface ModelIdAvailability {
  normalized_model_id_at_gateway: string
  available: boolean
}

export interface PricingBasis {
  schema_version: 3
  kind:
    | 'OFFICIAL_PREFILL_CONFIRMED'
    | 'ENTERPRISE_CONFIGURED'
    | 'ENTERPRISE_DEFAULT_ZERO'
    | 'ENTERPRISE_DEFAULT_CONFIRMED'
  default_zero_reason: string | null
  official_reference: BuiltinPricingTemplate | null
  default_reference: EnterpriseDefaultPricingTemplate | null
}

export interface PricingPreparation {
  provider_id: string
  provider_version: number
  model_id_at_provider: string
  catalog_binding: CatalogBinding
  metric_specs: Array<MetricSpec>
  billing_currency: string
  currency_source: 'HEADQUARTERS' | 'DEFAULT_CNY'
  billing_time_zone: 'Asia/Shanghai'
  time_zone_source: 'DEFAULT_ASIA_SHANGHAI'
  reference_state:
    'AVAILABLE' | 'PRICE_UNAVAILABLE' | 'NO_PUBLIC_PRICE' | 'UNSUPPORTED_RULE' | 'NOT_APPLICABLE'
  official_reference: BuiltinPricingTemplate | null
  prefill_origin:
    'ENTERPRISE_DEFAULT' | 'OFFICIAL_NUMERIC_REFERENCE' | 'ENTERPRISE_DEFAULT_ZERO' | 'NONE'
  internal_pricing_prefill: PricingInput | null
  default_reference: EnterpriseDefaultPricingTemplate | null
}

export interface ModelIdentityInput {
  provider_id: string
  model_id_at_gateway: string
  model_id_at_provider: string
  supported_invocation_apis: Array<string>
  custom_invocation_apis: Array<CustomAPIInput>
  catalog_model_version_id?: string | null
}

export interface ModelMetadataInput {
  input_modalities: Array<string>
  output_modalities: Array<string>
  context_window: number | null
  max_output_tokens: number | null
  tags: Array<string>
  description: string | null
}

export interface EnterpriseDefaultPricingTemplate {
  catalog_default_price_version_id: string
  catalog_model_version_id: string
  catalog_release_id: string
  catalog_revision: string
  adapter_revision: string
  currency_mode: 'SYSTEM_BILLING_CURRENCY'
  pricing_mode: 'FIXED' | 'TIME_BASED'
  time_zone: 'Asia/Shanghai'
  periods: Array<PricePeriodInput>
  rounding: 'HALF_EVEN'
  amount_scale: 18
}

export interface DefaultPricingPreparation {
  provider_id: string
  provider_version: number
  model_id_at_provider: string
  catalog_binding: CatalogBinding
  metric_specs: Array<MetricSpec>
  billing_currency: string
  currency_source: 'HEADQUARTERS' | 'DEFAULT_CNY'
  billing_time_zone: 'Asia/Shanghai'
  time_zone_source: 'DEFAULT_ASIA_SHANGHAI'
  state: 'AVAILABLE' | 'NOT_CONFIGURED' | 'NOT_APPLICABLE'
  default_reference: EnterpriseDefaultPricingTemplate | null
  internal_pricing_prefill: PricingInput | null
  model_id: string | null
}
