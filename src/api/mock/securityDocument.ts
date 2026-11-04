import { emptyRule, type DetectionRule, type RuleTestResult } from '@/api/securityTypes'

export const documentKinds = [
  'FINANCIAL_REPORT',
  'CUSTOMER_LIST',
  'CONTRACT',
  'PAYROLL',
  'SOURCE_CONFIG',
  'IT_INVENTORY',
]
export const documentMessages: Record<string, [string, string]> = {
  FINANCIAL_REPORT: ['财务报表', 'Financial reports'],
  CUSTOMER_LIST: ['客户信息列表', 'Customer information lists'],
  CONTRACT: ['商业合同', 'Business contracts'],
  PAYROLL: ['薪资与人事信息', 'Payroll and personnel information'],
  SOURCE_CONFIG: ['源代码与配置文件', 'Source code and configuration files'],
  IT_INVENTORY: ['IT 资产清单', 'IT asset inventory'],
  PII: ['个人信息', 'Personal information'],
  FINANCE: ['金融信息', 'Financial information'],
  INTERNAL: ['内部数据', 'Internal data'],
  CREDENTIAL: ['凭证与密钥', 'Credentials and keys'],
  SOURCE_CODE: ['源代码', 'Source code'],
}
const indicators = [
  ['资产负债', '利润', '现金流'],
  ['客户', '联系人', '地址'],
  ['甲方', '乙方', '履约'],
  ['员工', '薪资', '岗位'],
  ['function', 'import', 'config'],
  ['资产编号', '设备', '责任人'],
]
const englishIndicators = [
  ['balance sheet', 'profit', 'cash flow'],
  ['customer', 'contact', 'address'],
  ['party a', 'party b', 'obligation'],
  ['employee', 'salary', 'position'],
  ['function', 'import', 'config'],
  ['asset id', 'device', 'owner'],
]
export function documentRule(index = 2, english = false): DetectionRule {
  const r = emptyRule()
  const kind = documentKinds[index] ?? 'CONTRACT'
  r.rule_type = 'DOCUMENT_PATTERN'
  r.name = documentMessages[kind]![english ? 1 : 0]
  r.sub_category = kind
  r.enabled = false
  r.config.detection_method = ['LLM_JUDGE']
  r.config.identification_guide = {
    summary: r.name,
    key_indicators: [...(english ? englishIndicators[index]! : indicators[index]!)],
    supporting_indicators: english
      ? ['Business document title', 'Business record or document identifier']
      : ['业务文档标题', '业务记录或文档编号'],
    structural_hints: english
      ? ['Related fields in paragraphs or table rows']
      : ['段落或表格中存在相互关联的业务字段'],
    decision_guidance: english
      ? 'Require multiple related business elements and a coherent document structure; a single name, phone number or amount is insufficient.'
      : '需多个相关业务要素与完整文档结构共同构成依据；单个姓名、电话或金额不足以命中。',
  }
  r.config.negative_guide = english
    ? 'Exclude casual discussion, isolated field values and unrelated email.'
    : '排除日常讨论、零散字段值及无关邮件。'
  r.config.sensitive_fields = []
  r.config.mask_config.replace_text = '[REDACTED]'
  r.sensitivity_level = [0, 3].includes(index) ? 'CORE' : 'IMPORTANT'
  return r
}
/** Deterministic mock evaluation only; never represents a real model decision. */
export function testDocument(rule: DetectionRule, text: string, direction: string): RuleTestResult {
  const result: RuleTestResult = {
    status: 'NOT_MATCHED',
    findings: [],
    masked_text: null,
    reason: 'mockEvaluation',
    confidence: 0,
    evidence: [],
  }
  if (rule.direction !== 'BOTH' && rule.direction !== direction)
    return { ...result, status: 'NOT_APPLICABLE' }
  if (!text.trim() || text.length > 100000) return { ...result, status: 'UNSUPPORTED' }
  const guide = rule.config.identification_guide
  const matches =
    guide?.key_indicators.filter((v) => text.toLowerCase().includes(v.toLowerCase())) ?? []
  result.evidence = matches
  result.confidence = matches.length >= 2 && text.length >= 40 ? 0.93 : 0.2
  if (matches.length < 2 || text.length < 40 || result.confidence < rule.config.threshold)
    return result
  result.status = 'MATCHED'
  const fields = rule.config.sensitive_fields ?? []
  if (!fields.length) return result
  const fieldByRange = new Map<number, (typeof fields)[number]>()
  let missingField = false
  for (const field of fields) {
    let offset = 0,
      count = 0
    for (const line of text.split('\n')) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith(field.field_name)) {
        const at = line.length - trimmed.length
        const tail = trimmed.slice(field.field_name.length)
        const match = /^\s*[:：]\s*([^，,；;\n]+)/u.exec(tail)
        if (match?.[1]?.trim()) {
          const value = match[1].trim()
          const start = offset + at + field.field_name.length + tail.indexOf(value)
          result.findings.push({ text: value, start, end: start + value.length })
          fieldByRange.set(start, field)
          count++
        }
      }
      offset += line.length + 1
    }
    if (!count) missingField = true
  }
  const findings = result.findings.sort((a, b) => a.start - b.start)
  if (
    missingField ||
    findings.length < fields.length ||
    findings.some((f, i) => i > 0 && f.start < findings[i - 1]!.end)
  )
    return { ...result, reason: 'maskFailed' }
  let output = text
  for (const f of [...findings].reverse()) {
    const field = fieldByRange.get(f.start)
    if (!field) return { ...result, reason: 'maskFailed' }
    const m = field.mask_config
    const prefix = m.mode === 'PARTIAL_MASK' ? Math.min(m.keep_prefix, f.text.length) : 0
    const suffix = m.mode === 'PARTIAL_MASK' ? Math.min(m.keep_suffix, f.text.length - prefix) : 0
    const replacement =
      m.mode === 'REPLACE_TEXT'
        ? m.replace_text
        : f.text.slice(0, prefix) +
          m.mask_char.repeat(f.text.length - prefix - suffix) +
          (suffix ? f.text.slice(-suffix) : '')
    if (!replacement || replacement === f.text) return { ...result, reason: 'maskFailed' }
    output = output.slice(0, f.start) + replacement + output.slice(f.end)
  }
  result.masked_text = output
  return result
}
