import type { OffsetPageQuery } from '@/api/types'

export type PolicyDomain = 'ACCESS_CONTROL' | 'DATA_CONTROL' | 'SECURITY_DETECTION' | 'AUDIT'
export type Direction = 'INPUT' | 'OUTPUT' | 'BOTH'
export type Engine =
  'SENSITIVE_DATA' | 'PROMPT_INJECTION' | 'JAILBREAK' | 'CONTENT_COMPLIANCE' | 'MALICIOUS_IOC'
export type Method = 'KEYWORD' | 'REGEX' | 'CLASSIFIER' | 'LLM_JUDGE' | 'THREAT_INTELLIGENCE'
export type Sensitivity = 'PUBLIC' | 'GENERAL' | 'IMPORTANT' | 'CORE'
export type Risk = 'HIGH' | 'MEDIUM' | 'LOW'
export interface Scope {
  type: string
  values: string[]
  attributes: { field: string; operator: 'EQ' | 'IN' | 'CONTAINS'; value: string }[]
}
export interface Environment {
  time_start: string
  time_end: string
  days: number[]
  time_zone: string
  source_ips: string[]
  exclude_ips: boolean
  clients: string[]
  terminal_type: string
  terminal_ids: string[]
}
export interface DetectionAction {
  kind: 'FILE' | 'RULE'
  selector: 'ALL' | 'IDS' | 'LEVELS' | 'ATTRIBUTES' | 'TYPES'
  values: string[]
  attributes: { field: string; operator: 'EQ' | 'IN' | 'CONTAINS'; value: string }[]
  action: 'BLOCK' | 'MASK' | 'ALERT'
  restore_response: boolean
  file_checks: string[]
  formats: string[]
  min_size_mb: number | null
  max_size_mb: number | null
}
export interface SecurityPolicy {
  id: string
  domain: PolicyDomain
  name: string
  description: string
  enabled: boolean
  priority: number
  user_condition: Scope
  target_model_condition: Scope
  environment_condition: Environment
  response_detection_enabled: boolean
  observation_mode: boolean
  detection_actions: DetectionAction[]
  audit_level: 'FULL' | 'METADATA_ONLY' | 'CUSTOM'
  audit_fields: string[]
  built_in: boolean
  created_by: string
  created_at: string
  updated_at: string
  seed_key?: string
}
export interface MaskConfig {
  mode: 'FULL_MASK' | 'PARTIAL_MASK' | 'REPLACE_TEXT'
  mask_char: string
  keep_prefix: number
  keep_suffix: number
  replace_text: string
}
export interface DetectionRule {
  id: string
  name: string
  description: string
  rule_domain: 'DATA_LEAKAGE' | 'SECURITY_DETECTION'
  rule_type: 'FIELD' | 'DOCUMENT_PATTERN'
  engine_type: Engine
  category: string
  sub_category: string
  sensitivity_level: Sensitivity
  risk_level: Risk
  direction: Direction
  enabled: boolean
  built_in: boolean
  config: {
    detection_method: Method[]
    keywords: string[]
    patterns: string[]
    field_description: string
    detection_guide: string
    entity_type: string
    threshold: number
    match_threshold: number
    mask_config: MaskConfig
    ioc_types: string[]
    identification_guide?: {
      summary: string
      key_indicators: string[]
      supporting_indicators: string[]
      structural_hints: string[]
      decision_guidance: string
    }
    negative_guide?: string
    sensitive_fields?: { field_name: string; description: string; mask_config: MaskConfig }[]
    basic_test_passed?: boolean
  }
  created_by: string
  created_at: string
  updated_at: string
  seed_key?: string
}
export interface Allowlist {
  id: string
  name: string
  type: PolicyDomain
  enabled: boolean
  user_ids: string[]
  model_ids: string[]
  rule_ids: string[]
  environment_condition: Environment
  built_in: false
  created_by: string
  created_at: string
  updated_at: string
}
export interface SecurityOption {
  id: string
  name: string
  name_en: string
  parent_id?: string | null
  has_children?: boolean
}
export interface SecurityOptions {
  users: SecurityOption[]
  groups: SecurityOption[]
  logical_models: SecurityOption[]
  physical_models: SecurityOption[]
  departments: SecurityOption[]
  abilities: Record<Method | 'TERMINAL' | 'FILE_SAMPLES', boolean>
}
export interface SecurityQuery extends OffsetPageQuery {
  name?: string
  description?: string
  model?: string
  user?: string
  fields?: string
  enabled?: string
  domain?: PolicyDomain
  rule_domain?: string
  category?: string
  rule_type?: string
  sub_category?: string
  engine_type?: string
  direction?: string
  built_in?: string
  type?: PolicyDomain
}
export interface RuleTestResult {
  status: 'MATCHED' | 'NOT_MATCHED' | 'FAILED' | 'UNSUPPORTED' | 'UNCONFIGURED' | 'NOT_APPLICABLE'
  findings: { text: string; start: number; end: number }[]
  masked_text: string | null
  reason: string
  confidence?: number
  evidence?: string[]
  exclusion_evidence?: string[]
}
export interface DiscoveryFile {
  name: string
  size: number
  sha256: string
  actual_format: string
  text?: string
}
export interface DiscoverySuggestion {
  id: string
  rule: DetectionRule
  confidence: number
  evidence: string
  location: string
  status: 'PENDING' | 'CONFIRMED' | 'IGNORED' | 'CREATED'
}
export interface DiscoveryTask {
  id: string
  source: 'UPLOAD' | 'AUDIT'
  files: DiscoveryFile[]
  record_ids: string[]
  status: 'READING' | 'RECOGNIZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  created_at: string
  suggestions: DiscoverySuggestion[]
}
export interface DiscoveryRecord {
  id: string
  requested_at: string
  user: string
  department: string
  model: string
  event: boolean
}
export interface ImportRow {
  row: number
  rule: DetectionRule | null
  errors: string[]
}
export interface RuleImportValidation {
  id: string
  rows: ImportRow[]
  valid: number
  invalid: number
}
export const emptyScope = (): Scope => ({ type: 'ALL', values: [], attributes: [] })
export const emptyEnvironment = (): Environment => ({
  time_start: '',
  time_end: '',
  days: [1, 2, 3, 4, 5, 6, 7],
  time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  source_ips: [],
  exclude_ips: false,
  clients: [],
  terminal_type: 'ALL',
  terminal_ids: [],
})
export const emptyAction = (kind: 'FILE' | 'RULE' = 'RULE'): DetectionAction => ({
  kind,
  selector: 'LEVELS',
  values: [],
  attributes: [],
  action: 'BLOCK',
  restore_response: false,
  file_checks: ['FILE_UPLOAD'],
  formats: [],
  min_size_mb: null,
  max_size_mb: null,
})
export const emptyPolicy = (domain: PolicyDomain): SecurityPolicy => ({
  id: '',
  domain,
  name: '',
  description: '',
  enabled: true,
  priority: 0,
  user_condition: emptyScope(),
  target_model_condition: emptyScope(),
  environment_condition: emptyEnvironment(),
  response_detection_enabled: false,
  observation_mode: false,
  detection_actions: [],
  audit_level: 'CUSTOM',
  audit_fields: ['SYSTEM_PROMPT', 'USER_PROMPT', 'REQUEST_TOOLS', 'RESPONSE_TOOL_CALLS'],
  built_in: false,
  created_by: '',
  created_at: '',
  updated_at: '',
})
export const emptyRule = (security = false): DetectionRule => ({
  id: '',
  name: '',
  description: '',
  rule_domain: security ? 'SECURITY_DETECTION' : 'DATA_LEAKAGE',
  rule_type: 'FIELD',
  engine_type: security ? 'PROMPT_INJECTION' : 'SENSITIVE_DATA',
  category: security ? 'PROMPT_INJECTION' : 'EMPLOYEE',
  sub_category: '',
  sensitivity_level: 'IMPORTANT',
  risk_level: 'HIGH',
  direction: 'BOTH',
  enabled: true,
  built_in: false,
  config: {
    detection_method: ['KEYWORD'],
    keywords: [],
    patterns: [],
    field_description: '',
    detection_guide: '',
    entity_type: '',
    threshold: 0.85,
    match_threshold: 1,
    mask_config: {
      mode: 'REPLACE_TEXT',
      mask_char: '*',
      keep_prefix: 3,
      keep_suffix: 4,
      replace_text: '',
    },
    ioc_types: ['IP', 'DOMAIN', 'URL'],
  },
  created_by: '',
  created_at: '',
  updated_at: '',
})
export const emptyAllowlist = (type: PolicyDomain): Allowlist => ({
  id: '',
  name: '',
  type,
  enabled: true,
  user_ids: [],
  model_ids: [],
  rule_ids: [],
  environment_condition: emptyEnvironment(),
  built_in: false,
  created_by: '',
  created_at: '',
  updated_at: '',
})
