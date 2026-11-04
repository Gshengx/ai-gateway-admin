import { formatDateTime } from '@/utils/datetime'
import {
  emptyRule,
  type DiscoveryTask,
  type DiscoveryRecord,
  type DiscoveryFile,
  type DiscoverySuggestion,
  type DetectionRule,
} from '@/api/securityTypes'
import { documentRule } from './securityDocument'
const records: DiscoveryRecord[] = Array.from({ length: 13 }, (_, i) => ({
  id: `request-${i + 1}`,
  requested_at: `2026-11-03T${String(2 + Math.floor(i / 6)).padStart(2, '0')}:${String(i * 4).padStart(2, '0')}:00Z`,
  user: [
    '陈知远',
    '林予安',
    '张明',
    '李思雨',
    '周景行',
    '赵一鸣',
    '吴清越',
    '孙若溪',
    '郑子涵',
    '刘亦帆',
    '黄悦',
    '陈知远',
    '郑子涵',
  ][i]!,
  department: ['平台研发部', '算法研究部', '财务管理部', '市场部', '安全合规部'][i % 5]!,
  model: ['gpt-4o', 'qwen-plus', 'doubao-pro', 'deepseek-v3'][i % 4]!,
  event: i % 3 !== 1,
}))
const bodies = [
  '请整理客户回访记录，联系电话 139****5678。',
  '分析配置中的 api_key = "sk-********************"，判断是否需要轮换。',
  '合同中的联系人与接口人姓名需要遮蔽。',
]
function suggestions(
  task: DiscoveryTask,
  texts: { text: string; location: string }[],
  english: boolean,
): DiscoverySuggestion[] {
  const joined = texts.map((v) => v.text).join('\n')
  const result: DiscoverySuggestion[] = []
  const phone = emptyRule()
  phone.name = english ? 'Contact phone' : '联系电话'
  phone.sub_category = 'PII'
  phone.enabled = false
  phone.config.detection_method = ['REGEX']
  phone.config.patterns = ['1[3-9][0-9]{9}']
  phone.config.mask_config.replace_text = '[PHONE]'
  const secret = emptyRule()
  secret.name = english ? 'Access credentials and keys' : '访问凭证与密钥'
  secret.sub_category = 'CREDENTIAL'
  secret.sensitivity_level = 'CORE'
  secret.enabled = false
  secret.config.detection_method = ['REGEX']
  secret.config.patterns = ['(?:api_key|token|password)\\s*[:=]\\s*[^\\s,;]+']
  secret.config.mask_config.replace_text = '[CREDENTIAL]'
  const contact = emptyRule()
  contact.name = english ? 'Contact person name' : '联系人姓名'
  contact.sub_category = 'CONTRACT'
  contact.enabled = false
  contact.config.detection_method = ['LLM_JUDGE']
  contact.config.field_description = english
    ? 'Identify the person explicitly designated as the business contact.'
    : '识别被明确标注为业务联系人或接口人的自然人姓名。'
  contact.config.mask_config.replace_text = '[CONTACT]'
  const candidates: { rule: DetectionRule; hit: boolean; evidence?: string }[] = [
    { rule: phone, hit: /电话|手机|phone|1[3-9][0-9]{9}/iu.test(joined) },
    { rule: secret, hit: /api_key|token|password|密钥/iu.test(joined) },
    { rule: contact, hit: /联系人|接口人|contact person/iu.test(joined) },
    ...(task.source === 'UPLOAD'
      ? [{ rule: documentRule(2, english), hit: /甲方/iu.test(joined) && /乙方/iu.test(joined) }]
      : []),
  ]
  for (const candidate of candidates) {
    const source = texts.find((v) =>
      candidate.rule.rule_type === 'DOCUMENT_PATTERN'
        ? /合同|甲方|contract/iu.test(v.text)
        : candidate.rule.sub_category === 'PII'
          ? /电话|手机|phone|1[3-9][0-9]{9}/iu.test(v.text)
          : candidate.rule.sub_category === 'CONTRACT'
            ? /联系人|接口人|contact person/iu.test(v.text)
            : /api_key|token|password|密钥/iu.test(v.text),
    )
    if (joined && !candidate.hit) continue
    result.push({
      id: `${task.id}-suggestion-${result.length + 1}`,
      rule: {
        ...candidate.rule,
        description:
          candidate.rule.config.field_description ||
          (english
            ? 'Review the suggested business scope before creating a rule.'
            : '创建规则前请复核建议的业务识别范围。'),
      },
      confidence: candidate.hit ? 0.91 : 0,
      evidence: source ? source.text.slice(0, 160) : '',
      location: source?.location ?? '',
      status: 'PENDING',
    })
  }
  return result
}
export function handleDiscovery(
  actor: string,
  path: string,
  method: string,
  q: Record<string, string>,
  body: Record<string, unknown>,
) {
  const storageKey = `ais-security-discovery-v1:${actor}`
  let tasks: DiscoveryTask[] = []
  try {
    tasks = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as DiscoveryTask[]
  } catch {
    /* Recover isolated mock history. */
  }
  const english = q.locale === 'en-US' || body.locale === 'en-US'
  if (path === '/security/discovery-records') {
    const filtered = records.filter(
      (r) =>
        (!q.user || r.user === q.user) &&
        (!q.model || r.model === q.model) &&
        (!q.since || new Date(r.requested_at).getTime() >= Date.parse(q.since)),
    )
    return {
      items: filtered,
      excluded: 250,
      total: filtered.length,
      total_pages: filtered.length ? 1 : 0,
      page: 1,
      page_size: 100,
    }
  }
  const id = path.split('/')[3]
  const task = tasks.find((v) => v.id === id)
  if (method === 'get' && !id)
    return {
      items: tasks,
      page: 1,
      page_size: 100,
      total: tasks.length,
      total_pages: tasks.length ? 1 : 0,
    }
  if (method === 'post' && !id) {
    const files = (body.files ?? []) as DiscoveryFile[]
    const ids = (body.record_ids ?? []) as string[]
    const source = body.source === 'AUDIT' ? 'AUDIT' : 'UPLOAD'
    if (
      source === 'UPLOAD'
        ? !files.length ||
          files.length > 5 ||
          files.some(
            (f) => f.size > 20 * 1024 * 1024 || !f.sha256 || (f.text?.length ?? 0) > 1024 * 1024,
          )
        : !ids.length || ids.some((v) => !records.some((r) => r.id === v))
    )
      throw new Error('INVALID_RULE')
    const created: DiscoveryTask = {
      id: `analysis-${Date.now()}`,
      source,
      files: files.map((f) => ({
        name: f.name,
        size: f.size,
        sha256: f.sha256,
        actual_format: f.actual_format,
      })),
      record_ids: ids,
      status: 'READING',
      created_at: new Date().toISOString(),
      suggestions: [],
    }
    const texts =
      source === 'UPLOAD'
        ? files.filter((f) => f.text).map((f) => ({ text: f.text!, location: f.name }))
        : ids.map((recordId, i) => ({
            text: bodies[i % bodies.length]!,
            location: `${formatDateTime(records.find((r) => r.id === recordId)!.requested_at)} · ${records.find((r) => r.id === recordId)!.user}`,
          }))
    created.suggestions = suggestions(created, texts, english)
    tasks.unshift(created)
    localStorage.setItem(storageKey, JSON.stringify(tasks.slice(0, 50)))
    return created
  }
  if (!task) throw new Error('NOT_FOUND')
  if (method === 'get') {
    if (task.status === 'READING') task.status = 'RECOGNIZING'
    else if (task.status === 'RECOGNIZING') task.status = 'COMPLETED'
  } else if (method === 'delete') {
    tasks = tasks.filter((v) => v.id !== id)
    task.status = 'CANCELLED'
    task.suggestions = []
    task.files = []
  } else if (method === 'put') {
    const suggestion = task.suggestions.find((v) => v.id === body.suggestion_id)
    if (suggestion && ['PENDING', 'CONFIRMED', 'IGNORED', 'CREATED'].includes(String(body.status)))
      suggestion.status = body.status as DiscoverySuggestion['status']
    else if (body.retry) task.status = 'READING'
    else throw new Error('INVALID_RULE')
  }
  localStorage.setItem(storageKey, JSON.stringify(tasks))
  return task
}
