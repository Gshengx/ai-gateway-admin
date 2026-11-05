/** Isolated governance mock until its APIs exist. All calls still use request.ts interceptors. */
import { documentRule, testDocument } from './securityDocument'
import { handleDiscovery } from './securityDiscovery'
import type { AxiosAdapter } from 'axios'
import { securityZh, securityEn } from '@/locales/security'
import {
  emptyAction,
  emptyPolicy,
  emptyRule,
  type Allowlist,
  type DetectionAction,
  type DetectionRule,
  type Environment,
  type ImportRow,
  type PolicyDomain,
  type RuleImportValidation,
  type RuleTestResult,
  type Scope,
  type SecurityOptions,
  type SecurityPolicy,
} from '@/api/securityTypes'
import {
  dataPolicyNames,
  detectionPolicyNames,
  fieldSeeds,
  securityRuleSeeds,
  seedMessages,
} from './securitySeeds'

export const securityMockCapabilities = [
  'security.accessControl',
  'security.dataControl',
  'security.detection',
  'security.audit',
  'security.allowlists',
].map((resource_code) => ({ resource_code, can_read: true, can_write: true }))
let actor = ''
export function setSecurityMockActor(id: string) {
  actor = id
}
interface State {
  version: 1
  sequence: number
  policies: SecurityPolicy[]
  rules: DetectionRule[]
  allowlists: Allowlist[]
  operations: { actor: string; at: string; path: string; reason: string }[]
}
export const securityMockAbilities: SecurityOptions['abilities'] = {
  KEYWORD: true,
  REGEX: true,
  CLASSIFIER: false,
  LLM_JUDGE: true,
  THREAT_INTELLIGENCE: false,
  TERMINAL: false,
  FILE_SAMPLES: true,
}
const abilities = securityMockAbilities
const departments = [
  { id: 'hq', name: '总部', name_en: 'Headquarters', parent_id: null, has_children: true },
  {
    id: 'tech',
    name: '技术中心',
    name_en: 'Technology Center',
    parent_id: 'hq',
    has_children: true,
  },
  {
    id: 'platform',
    name: '平台研发部',
    name_en: 'Platform Engineering',
    parent_id: 'tech',
    has_children: false,
  },
  {
    id: 'algorithm',
    name: '算法研究部',
    name_en: 'Algorithm Research',
    parent_id: 'tech',
    has_children: false,
  },
  { id: 'finance', name: '财务管理部', name_en: 'Finance', parent_id: 'hq', has_children: false },
  {
    id: 'security',
    name: '安全合规部',
    name_en: 'Security & Compliance',
    parent_id: 'hq',
    has_children: false,
  },
]
const options: SecurityOptions = {
  departments: [],
  users: [
    { id: 'mock-user-1', name: '演示研发用户', name_en: 'Demo engineering user' },
    { id: 'mock-user-2', name: '演示财务用户', name_en: 'Demo finance user' },
  ],
  groups: [
    { id: 'duty', name: '生产/运维值班组', name_en: 'Production/operations duty group' },
    { id: 'engineering', name: '研发骨干', name_en: 'Engineering group' },
  ],
  logical_models: [
    { id: 'logical-general', name: '通用对话模型', name_en: 'General chat model' },
    { id: 'logical-code', name: '代码助手', name_en: 'Code assistant' },
  ],
  physical_models: [
    { id: 'physical-private', name: '私有 DeepSeek', name_en: 'Private DeepSeek' },
    { id: 'physical-cloud', name: '可信云 Qwen', name_en: 'Trusted cloud Qwen' },
    { id: 'physical-internet', name: '互联网 GPT', name_en: 'Internet GPT' },
  ],
  abilities,
}
const now = () => new Date().toISOString()
const key = () => `ais-security-p0-v1:${actor}`
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function fail(code: string, field?: string): never {
  const validation = [
    'NAME_REQUIRED',
    'INVALID_SCOPE',
    'INVALID_ENVIRONMENT',
    'INVALID_ACTION',
    'INVALID_SIZE',
    'INVALID_RULE',
    'INVALID_AUDIT',
    'INVALID_REGEX',
    'INVALID_IMPORT',
  ].includes(code)
  throw Object.assign(new Error(code), {
    code: validation ? 'VALIDATION_FAILED' : code,
    params: { violations: field || validation ? [{ field: field ?? '', code }] : [] },
  })
}
function init(): State {
  const s: State = {
    version: 1,
    sequence: 100,
    policies: [],
    rules: [],
    allowlists: [],
    operations: [],
  }
  const baseTime = '2026-10-01T00:00:00Z'
  const stamp = { created_by: 'system', created_at: baseTime, updated_at: baseTime, built_in: true }
  for (const [i, seed] of [...fieldSeeds, ...securityRuleSeeds].entries()) {
    const security = i >= fieldSeeds.length
    const index = security ? i - fieldSeeds.length : i
    const rule = emptyRule(security)
    Object.assign(rule, stamp, {
      id: `rule-${security ? 's' : 'f'}-${index + 1}`,
      name: seed.names[0],
      seed_key: `${security ? 'securityRule' : 'field'}${index}`,
      category: seed.category,
      sub_category: seed.sub,
      engine_type: seed.engine ?? 'SENSITIVE_DATA',
      direction: seed.direction ?? 'BOTH',
      sensitivity_level:
        seed.sub === 'CREDENTIAL'
          ? 'CORE'
          : seed.category === 'PRODUCT' || seed.sub === 'INTERNAL'
            ? 'GENERAL'
            : 'IMPORTANT',
    })
    rule.config.detection_method = seed.method
    rule.config.patterns = seed.pattern ? [seed.pattern] : []
    rule.config.keywords = seed.names[0].includes('私钥')
      ? ['-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----']
      : seed.names[0].includes('表结构')
        ? ['CREATE TABLE']
        : seed.names[0].includes('配置')
          ? ['database:', 'server:']
          : security && seed.method.includes('KEYWORD')
            ? ['ignore previous instructions', '忽略之前的指令', 'reveal system prompt']
            : []
    rule.config.entity_type = 'PERSON'
    rule.config.mask_config.replace_text = `安全网关检测到敏感数据[${rule.name}]`
    if (seed.engine === 'MALICIOUS_IOC') rule.config.ioc_types = [seed.sub]
    s.rules.push(rule)
  }
  const action = (
    selector: DetectionAction['selector'],
    values: string[],
    mode: DetectionAction['action'] = 'BLOCK',
  ): DetectionAction => ({ ...emptyAction(), selector, values, action: mode })
  const credential = () => ({
    ...action('ATTRIBUTES', []),
    attributes: [{ field: 'sub_category', operator: 'EQ' as const, value: 'CREDENTIAL' }],
  })
  const personal = () => ({
    ...action('ATTRIBUTES', [], 'MASK'),
    attributes: [{ field: 'sub_category', operator: 'EQ' as const, value: 'PII' }],
  })
  const file = (
    checks: string[] = ['FILE_UPLOAD'],
    mode: DetectionAction['action'] = 'BLOCK',
  ): DetectionAction => ({ ...emptyAction('FILE'), file_checks: checks, action: mode })
  dataPolicyNames.forEach((names, i) => {
    const p = emptyPolicy('DATA_CONTROL')
    Object.assign(p, stamp, {
      id: `data-${i + 1}`,
      name: names[0],
      description: seedMessages[`data${i}Description`]![0],
      seed_key: `data${i}`,
      priority: i + 1,
      enabled: i >= 4,
      observation_mode: true,
    })
    if (i > 0)
      p.target_model_condition = {
        type: 'LEVEL',
        values: [i === 5 ? 'TRUSTED_CLOUD' : i === 6 ? 'PRIVATE' : 'INTERNET'],
        attributes: [],
      }
    if (i === 0) p.environment_condition.terminal_type = 'UNMANAGED'
    if (i === 1) {
      p.user_condition = { type: 'GROUPS', values: ['duty'], attributes: [] }
      p.environment_condition.time_start = '00:00'
      p.environment_condition.time_end = '06:00'
      p.detection_actions = [
        credential(),
        action('ATTRIBUTES', []),
        action('LEVELS', ['IMPORTANT', 'CORE']),
        personal(),
        action('LEVELS', ['GENERAL'], 'ALERT'),
      ]
      p.detection_actions[1]!.attributes = [
        { field: 'sub_category', operator: 'EQ', value: 'PRODUCTION_DATA' },
      ]
    } else if (i === 5)
      p.detection_actions = [
        credential(),
        action('LEVELS', ['CORE']),
        action('LEVELS', ['IMPORTANT'], 'MASK'),
        personal(),
        action('LEVELS', ['GENERAL'], 'ALERT'),
        { ...file(['FILE_FORMAT'], 'ALERT'), formats: ['PDF', 'XLSX', 'DOCX'] },
      ]
    else if (i === 6)
      p.detection_actions = [
        credential(),
        action('LEVELS', ['GENERAL', 'IMPORTANT', 'CORE'], 'ALERT'),
        file(['FILE_UPLOAD'], 'ALERT'),
      ]
    else
      p.detection_actions = [
        ...(i < 4 ? [file()] : []),
        credential(),
        action('LEVELS', i === 0 ? ['GENERAL', 'IMPORTANT', 'CORE'] : ['IMPORTANT', 'CORE']),
        ...(i > 0 ? [personal()] : []),
      ]
    if (i === 2 || i === 3) {
      p.detection_actions.splice(2, 0, {
        ...action('ATTRIBUTES', []),
        attributes: [{ field: 'category', operator: 'EQ', value: 'PRODUCT' }],
      })
    }
    if (i === 4)
      p.detection_actions.push({
        ...file(['FILE_FORMAT', 'FILE_SIZE'], 'ALERT'),
        formats: ['PDF', 'XLSX', 'DOCX'],
        min_size_mb: 20,
      })
    s.policies.push(p)
  })
  detectionPolicyNames.forEach((names, i) => {
    const p = emptyPolicy('SECURITY_DETECTION')
    Object.assign(p, stamp, {
      id: `detection-${i + 1}`,
      name: names[0],
      seed_key: `detection${i}`,
      description: seedMessages[`detection${i}Description`]![0],
      priority: i + 1,
      enabled: false,
    })
    p.target_model_condition = {
      type: 'LEVEL',
      values: [['PRIVATE', 'TRUSTED_CLOUD', 'INTERNET'][i]!],
      attributes: [],
    }
    p.detection_actions =
      i === 0
        ? [
            action('LEVELS', ['HIGH']),
            action('LEVELS', ['MEDIUM'], 'ALERT'),
            action('LEVELS', ['LOW'], 'ALERT'),
          ]
        : [action('TYPES', ['PROMPT_INJECTION', 'MALICIOUS_IOC'], 'ALERT')]
    s.policies.push(p)
  })
  s.policies.push({
    ...emptyPolicy('AUDIT'),
    ...stamp,
    id: 'audit-default',
    name: seedMessages.auditDefault![0],
    description: seedMessages.auditDefaultDescription![0],
    seed_key: 'auditDefault',
    priority: 1,
  })
  return s
}
function state(): State {
  try {
    const s = JSON.parse(localStorage.getItem(key()) ?? 'null') as State | null
    if (s?.version === 1) {
      for (let i = 0; i < 6; i++) {
        const id = `rule-doc-${i}`
        if (!s.rules.some((r) => r.id === id))
          s.rules.push({
            ...documentRule(i),
            id,
            built_in: true,
            seed_key: documentRule(i).sub_category,
            created_by: 'system',
            created_at: '2026-10-01T00:00:00Z',
            updated_at: '2026-10-01T00:00:00Z',
          })
      }
      return s
    }
  } catch {
    /* Reset corrupt mock state only. */
  }
  const s = init()
  for (let i = 0; i < 6; i++)
    s.rules.push({
      ...documentRule(i),
      id: `rule-doc-${i}`,
      built_in: true,
      seed_key: documentRule(i).sub_category,
    })
  return s
}
function persist(s: State) {
  localStorage.setItem(key(), JSON.stringify(s))
}
export function isValidIpCidr(value: string): boolean {
  const parts = value.split('/')
  if (parts.length > 2) return false
  const ip = parts[0] ?? ''
  const ipv4 =
    ip.split('.').length === 4 &&
    ip.split('.').every((v) => /^\d{1,3}$/.test(v) && Number(v) <= 255)
  let ipv6 = false
  try {
    ipv6 = ip.includes(':') && new URL(`http://[${ip}]/`).hostname.startsWith('[')
  } catch {
    /* Invalid IPv6. */
  }
  return (
    (ipv4 || ipv6) &&
    (parts[1] === undefined ||
      (/^\d{1,3}$/.test(parts[1]) && Number(parts[1]) <= (ipv4 ? 32 : 128)))
  )
}
function validateEnvironment(e: Environment) {
  if (e.terminal_type === 'SPECIFIED' && !e.terminal_ids.length)
    fail('INVALID_ENVIRONMENT', 'environment_condition.terminal_ids')
  if (
    (e.time_start || e.time_end) &&
    (!/^\d{2}:\d{2}$/.test(e.time_start) ||
      !/^\d{2}:\d{2}$/.test(e.time_end) ||
      ![e.time_start, e.time_end].every(
        (t) => Number(t.slice(0, 2)) < 24 && Number(t.slice(3)) < 60,
      ) ||
      !e.days.length)
  )
    fail('INVALID_ENVIRONMENT', 'environment_condition')
  if (!e.source_ips.every(isValidIpCidr))
    fail('INVALID_ENVIRONMENT', 'environment_condition.source_ips')
  try {
    new Intl.DateTimeFormat('en', { timeZone: e.time_zone })
  } catch {
    fail('INVALID_ENVIRONMENT', 'environment_condition.time_zone')
  }
}
function validateScope(scope: Scope, user: boolean) {
  if (
    ![
      'ALL',
      ...(user
        ? ['DEPARTMENTS', 'GROUPS', 'USERS', 'ATTRIBUTES']
        : ['LOGICAL', 'PHYSICAL', 'LEVEL']),
    ].includes(scope.type)
  )
    fail('INVALID_SCOPE')
  if (
    scope.type === 'ATTRIBUTES'
      ? !scope.attributes.length || scope.attributes.some((a) => !a.field.trim() || !a.value.trim())
      : scope.type !== 'ALL' && !scope.values.length
  )
    fail('INVALID_SCOPE', user ? 'user_condition' : 'target_model_condition')
}
export function ruleSelected(r: DetectionRule, a: DetectionAction): boolean {
  return (
    a.kind === 'RULE' &&
    (a.selector === 'ALL' ||
      (a.selector === 'IDS' && a.values.includes(r.id)) ||
      (a.selector === 'TYPES' && a.values.includes(r.engine_type)) ||
      (a.selector === 'LEVELS' &&
        a.values.includes(r.rule_domain === 'DATA_LEAKAGE' ? r.sensitivity_level : r.risk_level)) ||
      (a.selector === 'ATTRIBUTES' &&
        a.attributes.every((attr) => {
          const actual = String(r[attr.field as keyof DetectionRule] ?? '')
          return attr.operator === 'CONTAINS'
            ? actual.includes(attr.value)
            : attr.operator === 'IN'
              ? attr.value
                  .split(',')
                  .map((v) => v.trim())
                  .includes(actual)
              : actual === attr.value
        })))
  )
}
export function ruleCanEnable(rule: DetectionRule): boolean {
  return rule.rule_type !== 'DOCUMENT_PATTERN' || !!rule.config.basic_test_passed
}
export function policyConfigured(p: SecurityPolicy, rules: DetectionRule[]): boolean {
  if (p.built_in && p.id === 'data-3' && !p.environment_condition.source_ips.length) return false
  if (p.built_in && p.id === 'data-4' && !p.environment_condition.clients.length) return false
  if (
    ['ACCESS_CONTROL', 'DATA_CONTROL'].includes(p.domain) &&
    p.environment_condition.terminal_type !== 'ALL' &&
    !abilities.TERMINAL
  )
    return false
  if (p.domain === 'ACCESS_CONTROL' || p.domain === 'AUDIT') return true
  return p.detection_actions.every((a) =>
    a.kind === 'FILE'
      ? !a.file_checks.some((c) => ['FILE_NAME', 'FILE_SIGNATURE', 'FILE_HASH'].includes(c))
      : rules
          .filter(
            (r) =>
              r.enabled &&
              r.rule_domain ===
                (p.domain === 'DATA_CONTROL' ? 'DATA_LEAKAGE' : 'SECURITY_DETECTION') &&
              ruleSelected(r, a),
          )
          .every((r) => r.config.detection_method.every((m) => abilities[m])),
  )
}
function validatePolicy(p: SecurityPolicy, s: State) {
  if (!p.name.trim() || p.name.length > 200) fail('NAME_REQUIRED', 'name')
  if (
    s.policies.some(
      (x) => x.id !== p.id && x.domain === p.domain && x.name.trim() === p.name.trim(),
    )
  )
    fail('DUPLICATE_NAME', 'name')
  validateScope(p.target_model_condition, false)
  if (p.domain !== 'SECURITY_DETECTION') validateScope(p.user_condition, true)
  if (p.domain === 'ACCESS_CONTROL' || p.domain === 'DATA_CONTROL')
    validateEnvironment(p.environment_condition)
  if (p.domain === 'AUDIT' && p.audit_level === 'CUSTOM' && !p.audit_fields.length)
    fail('INVALID_AUDIT', 'audit_fields')
  for (const a of p.detection_actions) {
    if (
      p.domain === 'ACCESS_CONTROL' ||
      p.domain === 'AUDIT' ||
      !['BLOCK', 'ALERT', ...(p.domain === 'DATA_CONTROL' ? ['MASK'] : [])].includes(a.action)
    )
      fail('INVALID_ACTION', 'detection_actions')
    if (a.kind === 'FILE') {
      if (p.domain !== 'DATA_CONTROL' || !a.file_checks.length || a.action === 'MASK')
        fail('INVALID_ACTION', 'detection_actions')
      if (a.file_checks.includes('FILE_FORMAT') && !a.formats.length)
        fail('INVALID_ACTION', 'detection_actions')
      if (
        a.file_checks.includes('FILE_SIZE') &&
        ((a.min_size_mb === null && a.max_size_mb === null) ||
          (a.min_size_mb !== null && a.min_size_mb < 0) ||
          (a.max_size_mb !== null && a.max_size_mb < 0) ||
          (a.min_size_mb !== null && a.max_size_mb !== null && a.min_size_mb > a.max_size_mb))
      )
        fail('INVALID_SIZE', 'detection_actions')
    } else if (
      a.selector === 'ATTRIBUTES'
        ? !a.attributes.length || a.attributes.some((v) => !v.field || !v.value.trim())
        : a.selector !== 'ALL' && !a.values.length
    )
      fail('INVALID_ACTION', 'detection_actions')
    if (
      a.selector === 'IDS' &&
      a.values.some(
        (id) =>
          !s.rules.some(
            (r) =>
              r.id === id &&
              r.enabled &&
              r.rule_domain ===
                (p.domain === 'DATA_CONTROL' ? 'DATA_LEAKAGE' : 'SECURITY_DETECTION'),
          ),
      )
    )
      fail('INVALID_ACTION', 'detection_actions')
  }
  if (p.enabled && !policyConfigured(p, s.rules)) fail('ABILITY_UNCONFIGURED', 'enabled')
}
export function regexIsSafe(pattern: string): boolean {
  if (
    !pattern ||
    pattern.length > 500 ||
    /\\[1-9]|\(\?[=!<]|\([^)]*[+*][^)]*\)[+*{]|(?:\.\*|\.\+){2}/.test(pattern)
  )
    return false
  try {
    new RegExp(pattern, 'gu')
    return true
  } catch {
    return false
  }
}
function validateRule(r: DetectionRule, s: State) {
  if (!r.name.trim() || r.name.length > 200) fail('NAME_REQUIRED', 'name')
  if (
    s.rules.some(
      (x) => x.id !== r.id && x.rule_domain === r.rule_domain && x.name.trim() === r.name.trim(),
    )
  )
    fail('DUPLICATE_NAME', 'name')
  if (
    !['FIELD', 'DOCUMENT_PATTERN'].includes(r.rule_type) ||
    !['INPUT', 'OUTPUT', 'BOTH'].includes(r.direction) ||
    !r.config.detection_method.length
  )
    fail('INVALID_RULE')
  if (r.rule_type === 'DOCUMENT_PATTERN') {
    const guide = r.config.identification_guide
    if (
      r.rule_domain !== 'DATA_LEAKAGE' ||
      r.config.detection_method.join() !== 'LLM_JUDGE' ||
      !guide?.summary.trim() ||
      guide.key_indicators.filter((v) => v.trim()).length < 2 ||
      !guide.decision_guidance.trim() ||
      !Number.isFinite(r.config.threshold) ||
      r.config.threshold < 0 ||
      r.config.threshold > 1
    )
      fail('INVALID_RULE')
    if (r.enabled && !r.config.basic_test_passed) fail('INVALID_RULE')
    for (const field of r.config.sensitive_fields ?? []) {
      if (
        !field.field_name.trim() ||
        !field.description.trim() ||
        (field.mask_config.mode === 'REPLACE_TEXT'
          ? !field.mask_config.replace_text.trim()
          : !field.mask_config.mask_char ||
            field.mask_config.mask_char.length > 4 ||
            !Number.isInteger(field.mask_config.keep_prefix) ||
            !Number.isInteger(field.mask_config.keep_suffix) ||
            field.mask_config.keep_prefix < 0 ||
            field.mask_config.keep_suffix < 0)
      )
        fail('INVALID_RULE')
    }
    return
  }
  const c = r.config,
    m = c.detection_method[0]
  if (!r.built_in && c.detection_method.length !== 1) fail('INVALID_RULE')
  if (
    !r.built_in &&
    ((m === 'KEYWORD' && !c.keywords.filter((x) => x.trim()).length) ||
      (m === 'REGEX' && !c.patterns.length) ||
      (m === 'CLASSIFIER' && !c.entity_type) ||
      (m === 'LLM_JUDGE' &&
        !(r.rule_domain === 'DATA_LEAKAGE' ? c.field_description : c.detection_guide).trim()))
  )
    fail('INVALID_RULE', 'config')
  if (m === 'REGEX' && c.patterns.some((p) => !regexIsSafe(p)))
    fail('INVALID_REGEX', 'config.patterns')
  if (
    !Number.isInteger(c.match_threshold) ||
    c.match_threshold < 1 ||
    !Number.isFinite(c.threshold) ||
    c.threshold < 0 ||
    c.threshold > 1
  )
    fail('INVALID_RULE', 'config')
  if (r.engine_type === 'MALICIOUS_IOC' && !c.ioc_types.length)
    fail('INVALID_RULE', 'config.ioc_types')
  if (r.rule_domain === 'DATA_LEAKAGE') {
    const mask = c.mask_config
    if (!['FULL_MASK', 'PARTIAL_MASK', 'REPLACE_TEXT'].includes(mask.mode))
      fail('INVALID_RULE', 'config.mask_config')
    if (
      mask.mode === 'REPLACE_TEXT'
        ? !mask.replace_text.trim()
        : !mask.mask_char ||
          mask.mask_char.length > 4 ||
          !Number.isInteger(mask.keep_prefix) ||
          !Number.isInteger(mask.keep_suffix) ||
          mask.keep_prefix < 0 ||
          mask.keep_suffix < 0
    )
      fail('INVALID_RULE', 'config.mask_config')
  }
}
async function test(r: DetectionRule, text: string, direction: string): Promise<RuleTestResult> {
  const result: RuleTestResult = {
    status: 'NOT_MATCHED',
    findings: [],
    masked_text: null,
    reason: '',
  }
  if (r.direction !== 'BOTH' && r.direction !== direction)
    return { ...result, status: 'NOT_APPLICABLE' }
  if (!r.config.detection_method.every((m) => abilities[m]))
    return { ...result, status: 'UNCONFIGURED', reason: 'UNCONFIGURED' }
  if (text.length > 100000) return { ...result, status: 'UNSUPPORTED', reason: 'UNSUPPORTED' }
  if (r.rule_type === 'DOCUMENT_PATTERN') return testDocument(r, text, direction)
  if (r.config.detection_method.includes('LLM_JUDGE'))
    return { ...result, status: 'UNSUPPORTED', reason: 'mockUnsupported' }
  const patterns = r.config.patterns
  if (patterns.some((p) => !regexIsSafe(p)))
    return { ...result, status: 'FAILED', reason: 'safeRegex' }
  // Even validated expressions execute in a disposable worker with a hard time bound.
  const source = `onmessage=({data})=>{try{const out=[];for(const p of data.patterns){const re=new RegExp(p,'gu');for(const m of data.text.matchAll(re)){if(m[0])out.push({text:m[0],start:m.index,end:m.index+m[0].length});if(out.length>=1000)break}}postMessage(out)}catch{postMessage(null)}}`
  let regexFindings: RuleTestResult['findings'] = []
  if (r.config.detection_method.includes('REGEX')) {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })),
      worker = new Worker(url)
    try {
      regexFindings = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 400)
        worker.onmessage = ({ data }) => {
          clearTimeout(timer)
          if (data) resolve(data)
          else reject(new Error('safeRegex'))
        }
        worker.onerror = () => {
          clearTimeout(timer)
          reject(new Error('safeRegex'))
        }
        worker.postMessage({ text, patterns })
      })
    } catch (e) {
      return { ...result, status: 'FAILED', reason: (e as Error).message }
    } finally {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
  }
  const found = [...regexFindings]
  if (r.config.detection_method.includes('KEYWORD'))
    for (const keyword of r.config.keywords) {
      let at = 0
      while (keyword && (at = text.indexOf(keyword, at)) >= 0 && found.length < 1000) {
        found.push({ text: keyword, start: at, end: at + keyword.length })
        at += keyword.length
      }
    }
  const unique = found
    .filter((f, i, a) => a.findIndex((x) => x.start === f.start && x.end === f.end) === i)
    .sort((a, b) => a.start - b.start || b.end - a.end)
  if (unique.length < r.config.match_threshold) return result
  result.status = 'MATCHED'
  result.findings = unique
  if (r.rule_domain === 'DATA_LEAKAGE') {
    const mask = r.config.mask_config
    let previousEnd = 0,
      masked = ''
    for (const f of unique) {
      if (f.start < previousEnd) continue
      const textValue = f.text
      const keepStart =
        mask.mode === 'PARTIAL_MASK' ? Math.min(mask.keep_prefix, textValue.length) : 0
      const keepEnd =
        mask.mode === 'PARTIAL_MASK' ? Math.min(mask.keep_suffix, textValue.length - keepStart) : 0
      const replacement =
        mask.mode === 'REPLACE_TEXT'
          ? mask.replace_text
          : textValue.slice(0, keepStart) +
            mask.mask_char.repeat(textValue.length - keepStart - keepEnd) +
            (keepEnd ? textValue.slice(-keepEnd) : '')
      masked += text.slice(previousEnd, f.start) + replacement
      previousEnd = f.end
    }
    result.masked_text = masked + text.slice(previousEnd)
  }
  return result
}
const paths: Record<string, PolicyDomain> = {
  'access-control-policies': 'ACCESS_CONTROL',
  'data-control-policies': 'DATA_CONTROL',
  'security-detection-policies': 'SECURITY_DETECTION',
  'audit-policies': 'AUDIT',
}
const resource = (domain: PolicyDomain) =>
  ({
    ACCESS_CONTROL: 'security.accessControl',
    DATA_CONTROL: 'security.dataControl',
    SECURITY_DETECTION: 'security.detection',
    AUDIT: 'security.audit',
  })[domain]
const imports = new Map<string, RuleImportValidation>()
function filterRules(s: State, q: Record<string, string>) {
  return s.rules.filter(
    (r) =>
      (!q.rule_domain || r.rule_domain === q.rule_domain) &&
      (!q.engine_type || r.engine_type === q.engine_type) &&
      (!q.category || r.category === q.category) &&
      (!q.rule_type || r.rule_type === q.rule_type) &&
      (!q.sub_category || r.sub_category === q.sub_category) &&
      (!q.direction || r.direction === q.direction) &&
      (!q.enabled || String(r.enabled) === q.enabled) &&
      (!q.built_in || String(r.built_in) === q.built_in) &&
      (!q.name ||
        r.name.toLowerCase().includes(q.name.toLowerCase()) ||
        (seedMessages[r.seed_key ?? '']?.[1] ?? '').toLowerCase().includes(q.name.toLowerCase())),
  )
}
function page<T>(items: T[], q: Record<string, string>) {
  const page = Math.max(1, Number(q.page) || 1),
    size = Math.max(1, Math.min(100, Number(q.page_size) || 20))
  return {
    items: items.slice((page - 1) * size, page * size),
    page,
    page_size: size,
    total: items.length,
    total_pages: Math.ceil(items.length / size),
  }
}
function scopeText(scope: Scope): string {
  return [
    displayTerms(scope.type),
    ...(scope.type === 'ALL' ? [displayTerms('ALL_USERS'), displayTerms('ALL_MODELS')] : []),
    ...scope.attributes.map((a) => `${a.field} ${a.value}`),
    ...scope.values.flatMap((id) => {
      const item = [
        ...departments,
        ...options.users,
        ...options.groups,
        ...options.logical_models,
        ...options.physical_models,
      ].find((v) => v.id === id)
      return [displayTerms(id), item?.name ?? '', item?.name_en ?? '']
    }),
  ].join(' ')
}
function displayTerms(value: string): string {
  return [value, securityZh[value] ?? '', securityEn[value] ?? ''].join(' ')
}
function auditFieldText(policy: SecurityPolicy): string {
  const fields =
    policy.audit_level === 'FULL'
      ? ['SYSTEM_PROMPT', 'USER_PROMPT', 'REQUEST_TOOLS', 'RESPONSE_CONTENT', 'RESPONSE_TOOL_CALLS']
      : policy.audit_level === 'CUSTOM'
        ? policy.audit_fields
        : []
  return ['metadata', ...fields].map(displayTerms).join(' ')
}
async function handle(
  s: State,
  path: string,
  method: string,
  q: Record<string, string>,
  body: Record<string, unknown>,
) {
  const parts = path.split('/').filter(Boolean),
    base = parts[0] ?? '',
    domain = paths[base]
  const write = method !== 'get'
  if (path === '/security/mock-options') {
    if (!actor || !securityMockCapabilities.some((c) => c.can_read)) fail('FORBIDDEN')
    return {
      ...options,
      departments: departments.filter((d) =>
        q.resolve_ids
          ? q.resolve_ids.split(',').includes(d.id)
          : d.parent_id === (q.parent_id || null),
      ),
    }
  }
  const targetRules = path.includes('/detection-rules')
    ? s.rules.filter(
        (r) => r.id === parts[2] || (Array.isArray(body.ids) && body.ids.includes(r.id)),
      )
    : []
  const ruleDomain =
    (body.rule as DetectionRule | undefined)?.rule_domain ?? body.rule_domain ?? q.rule_domain
  const required = domain
    ? resource(domain)
    : path.includes('allowlists')
      ? 'security.allowlists'
      : ruleDomain === 'SECURITY_DETECTION' ||
          targetRules.some((r) => r.rule_domain === 'SECURITY_DETECTION')
        ? 'security.detection'
        : 'security.dataControl'
  const cap = securityMockCapabilities.find((c) => c.resource_code === required)
  if (!actor || !cap?.can_read || (write && !cap.can_write)) fail('FORBIDDEN')
  if (path.startsWith('/security/sample-analyses') || path === '/security/discovery-records') {
    if (method === 'post' && !abilities.LLM_JUDGE) fail('ABILITY_UNCONFIGURED')
    return handleDiscovery(actor, path, method, q, body)
  }
  if (domain) {
    const list = s.policies
      .filter((p) => p.domain === domain)
      .sort(
        (a, b) =>
          Number(a.domain === 'AUDIT' && a.built_in) - Number(b.domain === 'AUDIT' && b.built_in) ||
          a.priority - b.priority,
      )
    if (method === 'get')
      return page(
        list.filter(
          (p) =>
            (!q.name ||
              [p.name, seedMessages[p.seed_key ?? '']?.[1] ?? '']
                .join(' ')
                .toLowerCase()
                .includes(q.name.toLowerCase())) &&
            (!q.description ||
              [p.description, seedMessages[`${p.seed_key}Description`]?.[1] ?? '']
                .join(' ')
                .toLowerCase()
                .includes(q.description.toLowerCase())) &&
            (!q.enabled || String(p.enabled) === q.enabled) &&
            (!q.user || scopeText(p.user_condition).toLowerCase().includes(q.user.toLowerCase())) &&
            (!q.model ||
              scopeText(p.target_model_condition).toLowerCase().includes(q.model.toLowerCase())) &&
            (!q.fields || auditFieldText(p).toLowerCase().includes(q.fields.toLowerCase())),
        ),
        q,
      )
    if (parts[1] === 'priority') {
      const ids = body.ids as string[]
      const selected = list.filter((p) => ids.includes(p.id))
      if (
        ids.length !== selected.length ||
        new Set(ids).size !== ids.length ||
        (domain === 'AUDIT' && ids.includes('audit-default'))
      )
        fail('VALIDATION_FAILED')
      const slots = selected.map((p) => p.priority).sort((a, b) => a - b)
      ids.forEach((id, i) => {
        const p = list.find((p) => p.id === id)!
        p.priority = slots[i]!
        p.updated_at = now()
      })
      return null
    }
    if (parts[1] === 'status') {
      const items = (body.ids as string[]).map(
        (id) => list.find((p) => p.id === id) ?? fail('NOT_FOUND'),
      )
      if (!String(body.reason ?? '').trim()) fail('VALIDATION_FAILED')
      if (body.enabled && items.some((p) => !policyConfigured(p, s.rules)))
        fail('ABILITY_UNCONFIGURED')
      items.forEach((p) => {
        p.enabled = Boolean(body.enabled)
        p.updated_at = now()
      })
      return null
    }
    const existing = list.find((p) => p.id === parts[1])
    if (method === 'delete') {
      if (!String(body.reason ?? '').trim()) fail('VALIDATION_FAILED')
      if (!existing) fail('NOT_FOUND')
      if (existing.built_in) fail('BUILT_IN_PROTECTED')
      s.policies = s.policies.filter((p) => p.id !== existing.id)
      return null
    }
    const value = clone(body) as unknown as SecurityPolicy
    if (method === 'put' && !existing) fail('NOT_FOUND')
    value.domain = domain
    value.built_in = existing?.built_in ?? false
    if (existing?.id === 'audit-default') {
      value.name = existing.name
      value.seed_key = existing.seed_key
      value.user_condition = existing.user_condition
      value.target_model_condition = existing.target_model_condition
    }
    validatePolicy(value, s)
    if (existing)
      Object.assign(existing, value, {
        id: existing.id,
        priority: existing.priority,
        built_in: existing.built_in,
        created_at: existing.created_at,
        created_by: existing.created_by,
        updated_at: now(),
      })
    else {
      list.forEach((p) => p.priority++)
      Object.assign(value, {
        id: `policy-${++s.sequence}`,
        priority: 1,
        created_by: actor,
        created_at: now(),
        updated_at: now(),
      })
      s.policies.push(value)
    }
    return existing ?? value
  }
  if (path.startsWith('/security/detection-rules')) {
    if (parts[2] === 'test') {
      const r = body.rule as DetectionRule
      validateRule(r, { ...s, rules: s.rules.filter((x) => x.id !== r.id) })
      return test(r, String(body.text ?? ''), String(body.direction ?? 'INPUT'))
    }
    if (parts[2] === 'export')
      return filterRules(s, q).filter(
        (r) => r.rule_type === 'FIELD' && (!q.ids || q.ids.split(',').includes(r.id)),
      )
    if (parts[2] === 'import' && parts[3] === 'validate') {
      const rows = body.rows as Record<string, string>[]
      if (!rows.length || rows.length > 1000) fail('INVALID_IMPORT')
      const names = new Map<string, number>()
      rows.forEach((row) => names.set(row.name ?? '', (names.get(row.name ?? '') ?? 0) + 1))
      const results: ImportRow[] = rows.map((row, i) => {
        const r = emptyRule(),
          errors: string[] = []
        try {
          if (
            (row.rule_type && row.rule_type !== 'FIELD') ||
            row.built_in === 'true' ||
            !['KEYWORD', 'REGEX', 'CLASSIFIER', 'LLM_JUDGE'].includes(row.detection_method ?? '')
          )
            fail('INVALID_IMPORT')
          Object.assign(r, {
            name: row.name ?? '',
            sub_category: row.sub_category ?? '',
            category: row.category || 'EMPLOYEE',
            direction: row.direction,
            sensitivity_level: row.sensitivity_level,
            enabled: row.enabled !== 'false',
            description: row.description ?? '',
          })
          r.config.detection_method = [
            row.detection_method as DetectionRule['config']['detection_method'][number],
          ]
          r.config.keywords = (row.keywords ?? '').split('|').filter(Boolean)
          r.config.patterns = (row.patterns ?? '').split('\n').filter(Boolean)
          r.config.field_description = row.field_description ?? ''
          r.config.entity_type = row.entity_type ?? ''
          r.config.match_threshold = Number(row.match_threshold || 1)
          r.config.threshold = Number(row.threshold || 0.85)
          if (row.mask_config) r.config.mask_config = JSON.parse(row.mask_config)
          else r.config.mask_config.replace_text = `安全网关检测到敏感数据[${r.name}]`
          if (
            !['PUBLIC', 'GENERAL', 'IMPORTANT', 'CORE'].includes(r.sensitivity_level) ||
            (row.enabled && !['true', 'false'].includes(row.enabled))
          )
            fail('INVALID_IMPORT')
          validateRule(r, s)
          if ((names.get(r.name) ?? 0) > 1) fail('DUPLICATE_NAME')
        } catch (e) {
          errors.push((e as Error).message)
        }
        return { row: i + 2, rule: errors.length ? null : r, errors }
      })
      const result = {
        id: `${actor}:import-${++s.sequence}`,
        rows: results,
        valid: results.filter((r) => !r.errors.length).length,
        invalid: results.filter((r) => r.errors.length).length,
      }
      imports.set(result.id, clone(result))
      return result
    }
    if (parts[2] === 'import') {
      const result = imports.get(String(body.id))
      if (!result || !result.id.startsWith(actor + ':')) fail('STALE_IMPORT')
      const valid = result.rows.flatMap((x) => (x.rule ? [clone(x.rule)] : []))
      // Recheck all rows before committing; changes since validation never overwrite an existing rule.
      const simulated = { ...s, rules: [...s.rules] }
      for (const r of valid) {
        validateRule(r, simulated)
        simulated.rules.push(r)
      }
      valid.forEach((r) => {
        Object.assign(r, {
          id: `rule-${++s.sequence}`,
          created_at: now(),
          updated_at: now(),
          created_by: actor,
        })
        s.rules.push(r)
      })
      imports.delete(result.id)
      return { imported: valid.length }
    }
    if (parts[3] === 'references') {
      const rule = s.rules.find((r) => r.id === parts[2])
      if (!rule) fail('NOT_FOUND')
      return s.policies.filter(
        (p) =>
          p.enabled &&
          p.domain ===
            (rule.rule_domain === 'DATA_LEAKAGE' ? 'DATA_CONTROL' : 'SECURITY_DETECTION') &&
          p.detection_actions.some((a) => ruleSelected(rule, a)),
      )
    }
    if (parts[2] === 'status') {
      if (!String(body.reason ?? '').trim()) fail('VALIDATION_FAILED')
      const selected = (body.ids as string[]).map(
        (id) => s.rules.find((r) => r.id === id) ?? fail('NOT_FOUND'),
      )
      selected.forEach((r) => {
        if (body.enabled && !ruleCanEnable(r)) fail('INVALID_RULE')
        r.enabled = Boolean(body.enabled)
        r.updated_at = now()
      })
      return null
    }
    if (method === 'get') return page(filterRules(s, q), q)
    const existing = s.rules.find((r) => r.id === parts[2])
    if (method === 'delete') {
      if (!String(body.reason ?? '').trim()) fail('VALIDATION_FAILED')
      if (!existing) fail('NOT_FOUND')
      if (existing.built_in) fail('BUILT_IN_PROTECTED')
      if (
        s.policies.some((p) =>
          p.detection_actions.some((a) => a.selector === 'IDS' && a.values.includes(existing.id)),
        )
      )
        fail('IN_USE')
      s.rules = s.rules.filter((r) => r.id !== existing.id)
      return null
    }
    const value = clone(body) as unknown as DetectionRule
    value.built_in = existing?.built_in ?? false
    if (existing?.built_in && existing.rule_type === 'FIELD') {
      const original = { ...existing.config, mask_config: null },
        incoming = { ...value.config, mask_config: null }
      if (
        JSON.stringify(original) !== JSON.stringify(incoming) ||
        existing.engine_type !== value.engine_type ||
        existing.rule_type !== value.rule_type
      )
        fail('BUILT_IN_PROTECTED')
    }
    validateRule(value, s)
    if (existing)
      Object.assign(existing, value, {
        id: existing.id,
        created_at: existing.created_at,
        created_by: existing.created_by,
        updated_at: now(),
      })
    else {
      Object.assign(value, {
        id: `rule-${++s.sequence}`,
        created_by: actor,
        created_at: now(),
        updated_at: now(),
      })
      s.rules.unshift(value)
    }
    return existing ?? value
  }
  if (path.startsWith('/security/allowlists')) {
    if (method === 'get')
      return page(
        s.allowlists.filter(
          (a) =>
            (!q.type || a.type === q.type) &&
            (!q.name || a.name.toLowerCase().includes(q.name.toLowerCase())) &&
            (!q.enabled || String(a.enabled) === q.enabled),
        ),
        q,
      )
    if (parts[2] === 'status') {
      if (!String(body.reason ?? '').trim()) fail('VALIDATION_FAILED')
      const selected = (body.ids as string[]).map(
        (id) => s.allowlists.find((a) => a.id === id) ?? fail('NOT_FOUND'),
      )
      selected.forEach((a) => {
        a.enabled = Boolean(body.enabled)
        a.updated_at = now()
      })
      return null
    }
    const existing = s.allowlists.find((a) => a.id === parts[2])
    if (method === 'delete') {
      if (!String(body.reason ?? '').trim()) fail('VALIDATION_FAILED')
      if (!existing) fail('NOT_FOUND')
      s.allowlists = s.allowlists.filter((a) => a.id !== existing.id)
      return null
    }
    const value = clone(body) as unknown as Allowlist
    if (!value.name.trim() || value.name.length > 200) fail('NAME_REQUIRED', 'name')
    if (
      s.allowlists.some((a) => a.id !== value.id && a.type === value.type && a.name === value.name)
    )
      fail('DUPLICATE_NAME', 'name')
    validateEnvironment(value.environment_condition)
    if (value.type === 'SECURITY_DETECTION') value.user_ids = []
    if (!['ACCESS_CONTROL', 'DATA_CONTROL'].includes(value.type))
      value.environment_condition = emptyPolicy('ACCESS_CONTROL').environment_condition
    if (!['DATA_CONTROL', 'SECURITY_DETECTION'].includes(value.type)) value.rule_ids = []
    if (existing)
      Object.assign(existing, value, {
        id: existing.id,
        created_at: existing.created_at,
        created_by: existing.created_by,
        updated_at: now(),
      })
    else {
      Object.assign(value, {
        id: `allowlist-${++s.sequence}`,
        created_by: actor,
        created_at: now(),
        updated_at: now(),
        built_in: false,
      })
      s.allowlists.unshift(value)
    }
    return existing ?? value
  }
  fail('NOT_FOUND')
}
export const securityMockAdapter: AxiosAdapter = async (config) => {
  await new Promise((resolve) => setTimeout(resolve, 80))
  const s = state(),
    path = config.url ?? '',
    method = config.method ?? 'get'
  const body = (
    typeof config.data === 'string' ? JSON.parse(config.data) : (config.data ?? {})
  ) as Record<string, unknown>
  const q = Object.fromEntries(
    Object.entries(config.params ?? {})
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  )
  let data: unknown
  try {
    const result = await handle(s, path, method, q, body)
    if (method !== 'get' && !path.endsWith('/test') && !path.includes('/validate'))
      s.operations.unshift({
        actor,
        at: now(),
        path,
        reason: String(body.reason ?? 'CONFIGURATION_CHANGE'),
      })
    s.operations = s.operations.slice(0, 200)
    // Tests are read-only. A worker finishing later must not overwrite a concurrent save.
    if (!path.endsWith('/test')) persist(s)
    data = {
      code: 'OK',
      data: clone(result),
      params: {},
      request_id: `security-mock-${s.sequence}`,
    }
  } catch (error) {
    const e = error as Error & { code?: string; params?: unknown }
    data = {
      code: e.code ?? 'VALIDATION_FAILED',
      data: null,
      params: e.params ?? {},
      request_id: `security-mock-${s.sequence}`,
    }
  }
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config,
  }
}
