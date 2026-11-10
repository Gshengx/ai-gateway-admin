import { nextSequence, runtimeState, subjectName } from './_runtime'
import { mockAccounts } from './_accounts'
import {
  invocationApis,
  invocationTargets,
  validInvocationPath,
} from '../src/utils/modelInvocation'
import { modelAccessState } from './_modelAccessState'
import { pricingError } from '../src/utils/modelPricing'
import {
  checkCsrf,
  auditedMock,
  usernameFromToken,
  checkToken,
  fail,
  mockId,
  success,
  unauthorized,
  type MockMethod,
  type MockRequest,
} from './_utils'
import type {
  Provider,
  Template,
  Model,
  Pricing,
  Permission,
  TestRun,
  Candidate,
  Status,
} from '../src/api/modules/modelAccess'

// V1.4 暂定 mock 契约；不访问上游，不保存或返回凭证明文。
const now = () => new Date().toISOString()
const id = () => mockId(`model-access-${nextSequence('model', 100)}`)
const field = (key: string, label = key, secret = true, required = true) => ({
  key,
  label,
  secret,
  required,
})
const apiKey = [field('api_key', 'API Key')]
const templates: Template[] = [
  ['openai', 'OpenAI', 'https://api.openai.com/v1'],
  ['anthropic', 'Anthropic', 'https://api.anthropic.com/v1'],
  ['google', 'Google AI', 'https://generativelanguage.googleapis.com/v1beta'],
  ['qianwen', '通义千问', 'https://maas.qianwenaiapi.com/compatible-mode/v1'],
  ['minimax', 'MiniMax', 'https://api.minimax.io/v1'],
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1'],
  ['zhipu', '智谱 AI', 'https://open.bigmodel.cn/api/paas/v4'],
  ['moonshot', '月之暗面 Kimi', 'https://api.moonshot.cn/v1'],
  ['mistral', 'Mistral AI', 'https://api.mistral.ai/v1'],
  ['azure', 'Azure AI', ''],
  ['bedrock', 'AWS Bedrock', ''],
  ['vertex', 'Google Vertex AI', 'https://aiplatform.googleapis.com'],
  ['bailian', '阿里云百炼', ''],
  ['qianfan', '百度智能云千帆', 'https://qianfan.baidubce.com/v2'],
  ['volcengine', '火山引擎方舟', 'https://ark.cn-beijing.volces.com/api/v3'],
  ['hunyuan', '腾讯混元', ''],
  ['wangsu', '网宿 AI', ''],
  ['siliconflow', '硅基流动', 'https://api.siliconflow.cn/v1'],
  ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1'],
  ['compatible', 'OpenAI兼容', ''],
  ['ollama', 'Ollama', ''],
].map(([template_key, name, base_url]) => ({
  template_key: template_key!,
  name: name!,
  base_url: base_url!,
  fields: apiKey.map((x) => ({ ...x })),
}))
for (const t of templates) {
  if (t.template_key === 'anthropic')
    t.fields.push({ ...field('api_version', 'API Version', false), default_value: '2023-06-01' })
  if (t.template_key === 'azure')
    t.fields = [
      field('tenant_id', 'Tenant ID', false),
      field('client_id', 'Client ID', false),
      field('client_secret', 'Client Secret'),
      field('deployment', 'Deployment', false),
      field('api_version', 'API Version', false),
    ]
  if (t.template_key === 'vertex')
    t.fields = [
      field('project_id', 'Project ID', false),
      field('region', 'Region', false),
      field('service_account_json', 'Service Account JSON'),
    ]
  if (t.template_key === 'qianfan') t.fields.push(field('secret_key', 'Secret Key'))
  if (t.template_key === 'hunyuan')
    t.fields = [
      field('secret_id', 'Secret ID'),
      field('secret_key', 'Secret Key'),
      field('region', 'Region', false),
    ]
  if (t.template_key === 'volcengine') t.fields.push(field('region', 'Region', false, false))
  if (t.template_key === 'openrouter')
    t.fields.push(field('management_api_key', 'Management API Key', true, false))
  if (['ollama', 'compatible'].includes(t.template_key)) t.fields[0]!.required = false
}
const emptyBalance = () => ({
  method: 'GET' as const,
  url: '',
  auth: 'NONE' as const,
  secret: '',
  header: '',
  unit: 'CNY',
  mapping: 'AVAILABLE' as const,
  available_path: '',
  total_path: '',
  used_path: '',
  body: '',
})
const initialRecipient = process.env.AIS_MOCK_USERNAME ?? mockAccounts.keys().next().value
const initialRecipientId = initialRecipient ? mockId(initialRecipient) : undefined
const seedProviders: Provider[] = [
  ['OpenAI-主站', 'openai', 'https://api.openai.com/v1', 'INTERNET', '默认生产接入'],
  [
    '百炼-北京',
    'bailian',
    'https://llm-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    'TRUSTED_CLOUD',
    '北京地域接入示例',
  ],
  [
    '方舟-北京',
    'volcengine',
    'https://ark.cn-beijing.volces.com/api/v3',
    'TRUSTED_CLOUD',
    '北京区域业务接入',
  ],
  [
    '内网推理集群',
    'compatible',
    'https://llm.internal.example.com/v1',
    'PRIVATE',
    '仅供内部应用调用',
  ],
  ['OpenRouter-国际', 'openrouter', 'https://openrouter.ai/api/v1', 'INTERNET', '国际模型聚合接入'],
].map(([name, template_key, base_url, security_level, notes], i) => ({
  id: mockId(`provider-v13-${i}`),
  name: name!,
  template_key: template_key!,
  base_url: base_url!,
  security_level: security_level as Provider['security_level'],
  notes: notes!,
  provider_config: {},
  configured_secret_fields: i === 4 ? ['api_key', 'management_api_key'] : ['api_key'],
  model_count: 0,
  balance_query_mode: i === 4 ? 'TEMPLATE' : 'NONE',
  balance_query_config: emptyBalance(),
  balance_alert_enabled: i === 4 && !!initialRecipientId,
  balance_alert_threshold: 50,
  balance_alert_unit: i === 4 ? 'USD' : 'CNY',
  balance_alert_recipients: i === 4 && initialRecipientId ? [initialRecipientId] : [],
  balance_alert_channels: ['IN_APP'],
  last_balance_value: i === 4 ? 36.58 : null,
  last_balance_attempt_at: i === 4 ? '2026-11-05T02:00:00Z' : null,
  last_balance_success_at: i === 4 ? '2026-11-05T02:00:00Z' : null,
  balance_query_status: i === 4 ? 'SUCCESS' : 'NEVER_QUERIED',
  balance_query_error_code: null,
  created_at: '2026-08-12T03:00:00Z',
}))
if (!modelAccessState.initialized) modelAccessState.providers.push(...seedProviders)
const providers = modelAccessState.providers
// 迁移旧版样例中不存在的占位接收人，不改写管理员配置的其他对象。
function repairLegacyRecipients(provider: Provider) {
  if (mockAccounts.has('model-admin')) return
  const legacyRecipientId = mockId('model-admin')
  provider.balance_alert_recipients = [
    ...new Set(
      provider.balance_alert_recipients.flatMap((id) =>
        id === legacyRecipientId
          ? provider.balance_query_mode !== 'NONE' && initialRecipientId
            ? [initialRecipientId]
            : []
          : [id],
      ),
    ),
  ]
}
providers.forEach(repairLegacyRecipients)
const seedModels: Model[] = [
  'o3-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'text-embedding-3-large',
  'qwen-plus',
  'qwen-max',
  'doubao-pro-32k',
  'deepseek-v3',
  'company-knowledge-32k',
].map((name, i) => ({
  id: mockId(`model-v13-${i}`),
  provider_id: providers[i < 4 ? 0 : i < 6 ? 1 : i < 8 ? 2 : 3]!.id,
  model_id_at_gateway: name,
  model_id_at_provider: name,
  supported_invocation_apis:
    i === 3 ? ['EMBEDDINGS'] : i === 1 ? ['CHAT_COMPLETIONS', 'RESPONSES'] : ['CHAT_COMPLETIONS'],
  custom_invocation_apis: [],
  input_modalities: i === 1 || i === 2 ? ['text', 'image'] : ['text'],
  output_modalities: [i === 3 ? 'embeddings' : 'text'],
  tags: i === 3 ? [] : ['STREAMING', 'TOOL_CALLING', 'JSON_MODE'],
  context_window: 128000,
  max_output_tokens: 16384,
  description: '',
  status:
    i === 0 || i === 3 ? 'DRAFT' : i === 5 ? 'PENDING_REVIEW' : i === 8 ? 'SUSPENDED' : 'ACTIVE',
  health_status: 'UNKNOWN',
  auto_health_check: false,
  health_check_interval_minutes: 360,
  health_checked_at: null,
  suspend_reason: null,
  admission_valid: ![0, 3].includes(i),
  created_at: '2026-08-12T03:10:00Z',
}))
if (!modelAccessState.initialized) modelAccessState.models.push(...seedModels)
const { models, prices, permissions, runs, discoveries, polls } = modelAccessState
// 模拟上游目录与本地接入关系分离：删除本地模型后，上游仍可再次发现。
const upstreamModels = runtimeState(
  'modelAccess:upstreamModels',
  () => new Map<string, Map<string, Model>>(),
)
function rememberUpstream(model: Model) {
  if (!model.provider_id) return
  let directory = upstreamModels.get(model.provider_id)
  if (!directory) {
    directory = new Map()
    upstreamModels.set(model.provider_id, directory)
  }
  directory.set(model.model_id_at_provider, structuredClone(model))
}
models.forEach(rememberUpstream)
const adaptedModels = new Map(seedModels.map((m) => [m.model_id_at_provider, structuredClone(m)]))
function adaptedModel(name: string) {
  return adaptedModels.get(name) ?? adaptedModels.get(name.split('/').pop() ?? '')
}
// 初始样例完整经历创建、准入检测、审核上架与暂停，时间为确定的 UTC 值。
if (!modelAccessState.initialized)
  for (const [index, model] of models.entries()) {
    const at = (minutes: number) =>
      new Date(Date.UTC(2026, 7, 12 + index, 3, 10 + minutes)).toISOString()
    model.created_at = at(0)
    const events: NonNullable<Model['lifecycle_events']> = [
      {
        action: 'CREATE',
        status: 'DRAFT',
        created_at: at(0),
        actor: 'Mock Administrator',
        reason: '',
      },
    ]
    if (model.status !== 'DRAFT') {
      events.push(
        {
          action: 'STATUS',
          status: 'TESTING',
          created_at: at(5),
          actor: 'Mock Administrator',
          reason: '',
        },
        {
          action: 'STATUS',
          status: 'PENDING_REVIEW',
          created_at: at(6),
          actor: 'Mock Administrator',
          reason: '',
        },
      )
      runs.set(model.id, [
        {
          id: mockId(`seed-admission-${index}`),
          model_id: model.id,
          purpose: 'ADMISSION',
          trigger_type: 'MANUAL',
          invocation_api: model.supported_invocation_apis[0]!,
          invocation_apis: invocationTargets(model).map((a) => a.invocation_api),
          billing_user: 'system',
          billing_department: 'HEADQUARTERS',
          status: 'PASSED',
          checks: [
            'CONNECTIVITY',
            'PROTOCOL',
            ...(model.tags.includes('STREAMING') ? ['STREAMING'] : []),
          ].map((key, i) => ({
            key,
            status: 'PASSED',
            duration_ms: 240 + i * 100,
            detail: 'VALID_RESPONSE',
          })),
          started_at: at(5),
          completed_at: at(6),
          triggered_by: 'Mock Administrator',
        },
      ])
      if (model.status === 'ACTIVE' || model.status === 'SUSPENDED')
        events.push({
          action: 'STATUS',
          status: 'ACTIVE',
          created_at: at(10),
          actor: 'Mock Administrator',
          reason: '',
        })
      if (model.status === 'SUSPENDED') {
        model.suspend_reason = '计划维护 / Scheduled maintenance'
        events.push({
          action: 'STATUS',
          status: 'SUSPENDED',
          created_at: at(60),
          actor: 'Mock Administrator',
          reason: model.suspend_reason,
        })
      }
    }
    const record = (purpose: 'ADMISSION' | 'HEALTH', minute: number, passed: boolean): TestRun => ({
      id: mockId(`seed-${index}-${purpose}-${minute}`),
      model_id: model.id,
      purpose,
      trigger_type: 'MANUAL',
      invocation_api: model.supported_invocation_apis[0]!,
      invocation_apis: invocationTargets(model).map((a) => a.invocation_api),
      billing_user: 'system',
      billing_department: 'HEADQUARTERS',
      status: passed ? 'PASSED' : 'FAILED',
      checks: [
        'CONNECTIVITY',
        'PROTOCOL',
        ...(model.tags.includes('STREAMING') ? ['STREAMING'] : []),
      ].map((key, i) => ({
        key,
        status: passed ? 'PASSED' : 'FAILED',
        duration_ms: 240 + i * 100,
        detail: passed ? 'VALID_RESPONSE' : 'MODEL_UNAVAILABLE',
      })),
      started_at: at(minute),
      completed_at: at(minute + 1),
      triggered_by: 'Mock Administrator',
    })
    const history = runs.get(model.id) ?? []
    for (const minute of [1, 3]) {
      history.push(record('ADMISSION', minute, false))
      events.push(
        {
          action: 'STATUS',
          status: 'TESTING',
          created_at: at(minute),
          actor: 'Mock Administrator',
          reason: '',
        },
        {
          action: 'STATUS',
          status: 'DRAFT',
          created_at: at(minute + 1),
          actor: 'Mock Administrator',
          reason: '',
        },
      )
    }
    if (['ACTIVE', 'SUSPENDED'].includes(model.status)) {
      history.push(
        record('HEALTH', 20, true),
        record('HEALTH', 30, false),
        record('HEALTH', 40, true),
      )
      model.health_status = 'HEALTHY'
      model.health_checked_at = at(41)
    }
    runs.set(
      model.id,
      history.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)),
    )
    events.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    model.lifecycle_events = events.reverse()
  }
if (!modelAccessState.initialized)
  for (const model of models) {
    for (const run of runs.get(model.id) ?? []) {
      run.checks = invocationTargets(model).flatMap((api) =>
        run.checks.map((check) => ({
          ...check,
          invocation_api: api.invocation_api,
          upstream_path: api.path,
        })),
      )
    }
  }
function lifecycle(
  model: Model,
  action: 'CREATE' | 'UPDATE' | 'STATUS',
  reason = '',
  actor = 'system',
) {
  ;(model.lifecycle_events ??= []).unshift({
    action,
    status: model.status,
    created_at: now(),
    actor,
    reason,
  })
}
function advance(run: TestRun, count: number) {
  if (run.status !== 'RUNNING') return
  const m = models.find((m) => m.id === run.model_id)
  if (!m) return
  const failed =
    m.model_id_at_provider.includes('fail') ||
    run.checks.some((c) => c.upstream_path?.includes('fail'))
  run.checks.forEach((c, i) => {
    c.status =
      i < count
        ? (m.model_id_at_provider.includes('fail') && c.key === 'CONNECTIVITY') ||
          c.upstream_path?.includes('fail')
          ? 'FAILED'
          : 'PASSED'
        : i === count
          ? 'RUNNING'
          : 'PENDING'
    c.duration_ms = i < count ? 240 + i * 100 : 0
    c.detail =
      c.status === 'FAILED' ? 'MODEL_UNAVAILABLE' : c.status === 'PASSED' ? 'VALID_RESPONSE' : ''
  })
  if (count < run.checks.length) return
  run.status = failed ? 'FAILED' : 'PASSED'
  run.completed_at = now()
  if (run.purpose === 'HEALTH') {
    m.health_status = failed ? 'UNHEALTHY' : 'HEALTHY'
    m.health_checked_at = run.completed_at
  } else {
    m.admission_valid = !failed
    m.status = failed ? 'DRAFT' : 'PENDING_REVIEW'
    lifecycle(m, 'STATUS', '', run.triggered_by)
  }
}
// 服务端时间驱动，关闭弹窗不会取消已启动任务；每个模型仅保留规定数量的记录。
function scheduledWork() {
  for (const m of models) {
    const list = runs.get(m.id) ?? []
    for (const r of list)
      if (r.status === 'RUNNING')
        advance(r, Math.floor((Date.now() - Date.parse(r.started_at)) / 500))
    if (
      m.status === 'ACTIVE' &&
      m.auto_health_check &&
      !list.some((r) => r.status === 'RUNNING') &&
      Date.now() - Date.parse(m.health_checked_at ?? m.created_at) >=
        m.health_check_interval_minutes * 60000
    ) {
      const run: TestRun = {
        id: id(),
        model_id: m.id,
        purpose: 'HEALTH',
        trigger_type: 'AUTO',
        invocation_api: m.supported_invocation_apis[0]!,
        invocation_apis: invocationTargets(m).map((a) => a.invocation_api),
        billing_user: 'system',
        billing_department: 'HEADQUARTERS',
        status: 'RUNNING',
        checks: invocationTargets(m).flatMap((api) =>
          ['CONNECTIVITY', 'PROTOCOL', ...(m.tags.includes('STREAMING') ? ['STREAMING'] : [])].map(
            (key) => ({
              key,
              invocation_api: api.invocation_api,
              upstream_path: api.path,
              status: 'PENDING' as const,
              duration_ms: 0,
              detail: '',
            }),
          ),
        ),
        started_at: now(),
        completed_at: null,
        triggered_by: 'Mock Scheduler',
      }
      list.unshift(run)
      m.health_status = 'CHECKING'
    }
    let admissions = 0,
      health = 0
    runs.set(
      m.id,
      list.filter((r) => (r.purpose === 'HEALTH' ? ++health <= 5 : ++admissions <= 50)),
    )
  }
}
const runtime = globalThis as typeof globalThis & {
  __modelAccessTimer?: ReturnType<typeof setInterval>
}
if (runtime.__modelAccessTimer) clearInterval(runtime.__modelAccessTimer)
runtime.__modelAccessTimer = setInterval(scheduledWork, 500)
function page<T>(items: T[], req: MockRequest) {
  const p = Math.max(1, Number(req.query?.page) || 1)
  const size = Math.min(100, Math.max(1, Number(req.query?.page_size) || 20))
  return {
    items: items.slice((p - 1) * size, p * size),
    page: p,
    page_size: size,
    total: items.length,
    total_pages: Math.ceil(items.length / size),
  }
}
function blankPrice(): Pricing {
  return {
    id: '',
    version: 0,
    source_type: 'BUILT_IN',
    sync_mode: 'MANUAL',
    currency: 'CNY',
    pricing_mode: 'FIXED',
    metric_rates: ([] as string[]).map((metric_key) => ({
      metric_key,
      unit: 'PER_MILLION_TOKENS',
      unit_price: null,
      period_prices: {},
    })),
    time_periods: [{ id: 'fallback', name: '', is_fallback: true, conditions: [] }],
    platform_catalog_version: null,
    last_synced_at: null,
    created_at: '',
    created_by: '',
  }
}
function platformPrice(m: Model): Pricing {
  return {
    ...blankPrice(),
    platform_catalog_version: '2026.11',
    last_synced_at: now(),
    metric_rates: (adaptedModel(m.model_id_at_provider)
      ? m.output_modalities.includes('embeddings')
        ? ['input_tokens']
        : ['input_tokens', 'cached_input_tokens', 'output_tokens']
      : []
    ).map((metric_key, i) => ({
      metric_key,
      unit: 'PER_MILLION_TOKENS',
      unit_price:
        m.model_id_at_provider.split('/').pop() === 'gpt-4o'
          ? [17.5, 8.75, 70][i]!
          : [1, 0.5, 2][i]!,
      period_prices: {},
    })),
  }
}
if (!modelAccessState.initialized)
  for (const m of models) {
    prices.set(
      m.id,
      [3, 2, 1].map((version) => ({
        ...platformPrice(m),
        id: mockId(`seed-price-${m.id}-${version}`),
        version,
        metric_rates: platformPrice(m).metric_rates.map((rate) => ({
          ...rate,
          unit_price: Number(((rate.unit_price ?? 0) * (1 + (3 - version) * 0.1)).toFixed(2)),
        })),
        created_at: new Date(Date.parse(m.created_at) + (version - 1) * 86400000).toISOString(),
        created_by: 'Mock Administrator',
      })),
    )
  }
modelAccessState.initialized = true
// 可直接从页面验证的价格样例；仅迁移未编辑过的旧种子，不覆盖管理员保存的数据。
for (const [name, count] of [
  ['o3-mini', 23],
  ['gpt-4o-mini', 1],
] as const) {
  const model = models.find((item) => item.model_id_at_gateway === name)
  if (!model) continue
  const existing = prices.get(model.id)
  if (
    existing?.length !== 3 ||
    !existing.every(
      (price) =>
        price.id === mockId(`seed-price-${model.id}-${price.version}`) &&
        price.source_type === 'BUILT_IN' &&
        price.pricing_mode === 'FIXED',
    )
  )
    continue
  prices.set(
    model.id,
    Array.from({ length: count }, (_, index): Pricing => {
      const version = count - index
      const fixed = count > 1 && index % 3 === 2
      const base = platformPrice(model)
      return {
        ...base,
        id: mockId(`seed-time-price-${model.id}-${version}`),
        version,
        source_type: 'ENTERPRISE_CUSTOM',
        platform_catalog_version: null,
        last_synced_at: null,
        pricing_mode: fixed ? 'FIXED' : 'TIME_BASED',
        time_periods: fixed
          ? base.time_periods
          : [
              {
                id: 'weekday-peak',
                name: '工作日高峰',
                is_fallback: false,
                conditions: [
                  { weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
                  { weekdays: [1, 2, 3, 4, 5], start: '14:00', end: '18:00' },
                ],
              },
              {
                id: 'weekend',
                name: '周末日间',
                is_fallback: false,
                conditions: [
                  { weekdays: [6, 7], start: '09:00', end: '12:00' },
                  { weekdays: [6, 7], start: '14:00', end: '18:00' },
                ],
              },
              { id: 'fallback', name: '', is_fallback: true, conditions: [] },
            ],
        metric_rates: base.metric_rates.map((rate): Pricing['metric_rates'][number] => {
          const unitPrice = Number(((rate.unit_price ?? 0) * (1 + index * 0.05)).toFixed(4))
          return {
            ...rate,
            unit_price: fixed ? unitPrice : null,
            period_prices: fixed
              ? {}
              : {
                  'weekday-peak': Number((unitPrice * 2).toFixed(4)),
                  weekend: Number((unitPrice * 1.5).toFixed(4)),
                  fallback: unitPrice,
                },
          }
        }),
        created_at: new Date(Date.parse(model.created_at) + (version - 1) * 86400000).toISOString(),
        created_by: 'Mock Administrator',
      }
    }),
  )
}
function savePrice(modelId: string, body: Pricing, actor = 'system') {
  const list = prices.get(modelId) ?? []
  const result = {
    ...structuredClone(body),
    id: id(),
    version: list.length + 1,
    created_at: now(),
    created_by: actor,
  }
  if (result.source_type === 'ENTERPRISE_CUSTOM') {
    result.sync_mode = 'MANUAL'
    result.platform_catalog_version = null
    result.last_synced_at = null
  }
  list.unshift(result)
  prices.set(modelId, list)
  return result
}
function sanitizedProvider(p: Provider) {
  repairLegacyRecipients(p)
  return { ...p, model_count: models.filter((m) => m.provider_id === p.id).length }
}
function error(message: string) {
  return fail('VALIDATION_FAILED', '', { fields: { model_access: message } })
}
function modelError(body: Model, existing?: Model) {
  if (
    !providers.some((p) => p.id === body.provider_id) ||
    !body.model_id_at_gateway.trim() ||
    !body.model_id_at_provider.trim() ||
    !Array.isArray(body.supported_invocation_apis) ||
    !body.supported_invocation_apis.length
  )
    return 'REQUIRED'
  if (
    body.supported_invocation_apis.some((api) => !invocationApis.includes(api)) ||
    new Set(body.supported_invocation_apis).size !== body.supported_invocation_apis.length
  )
    return 'REQUIRED'
  if (
    !Array.isArray(body.custom_invocation_apis) ||
    body.custom_invocation_apis.some((a) => !validInvocationPath(a.path)) ||
    new Set(body.custom_invocation_apis.map((a) => a.path)).size !==
      body.custom_invocation_apis.length
  )
    return 'INVALID_API_PATH'
  body.custom_invocation_apis = body.custom_invocation_apis.map((a) => ({
    path: a.path,
    invocation_api:
      existing?.custom_invocation_apis.find((old) => old.path === a.path)?.invocation_api ??
      `CUSTOM_${mockId(a.path)}`,
  }))
  if (
    models.some((m) => m.id !== existing?.id && m.model_id_at_gateway === body.model_id_at_gateway)
  )
    return 'NAME_CONFLICT'
  if (
    models.some(
      (m) =>
        m.id !== existing?.id &&
        m.provider_id === body.provider_id &&
        m.model_id_at_provider === body.model_id_at_provider,
    )
  )
    return 'PROVIDER_MODEL_CONFLICT'
  if (
    existing &&
    existing.status !== 'DRAFT' &&
    (
      [
        'provider_id',
        'model_id_at_provider',
        'model_id_at_gateway',
        'supported_invocation_apis',
        'custom_invocation_apis',
      ] as const
    ).some((key) => JSON.stringify(body[key]) !== JSON.stringify(existing[key]))
  )
    return 'EDIT_LOCKED'
  return ''
}
const transitions: Record<Status, Status[]> = {
  DRAFT: ['TESTING'],
  TESTING: [],
  PENDING_REVIEW: ['ACTIVE', 'DRAFT'],
  ACTIVE: ['SUSPENDED', 'RETIRED'],
  SUSPENDED: ['ACTIVE', 'RETIRED'],
  RETIRED: ['DRAFT'],
}
function route(
  url: string,
  method: 'get' | 'post' | 'put' | 'delete',
  handler: (req: MockRequest) => unknown,
): MockMethod {
  return {
    url: `/api/v1${url}`,
    method,
    response(req: MockRequest) {
      if (!checkToken(req)) return unauthorized()
      if (method !== 'get' && !checkCsrf(req)) return fail('CSRF_INVALID', '')
      return handler(req)
    },
  }
}
function pathId(req: MockRequest, section: string) {
  return (
    req.url?.split('?')[0]?.split('/')[section === 'providers' || section === 'models' ? 4 : 4] ??
    ''
  )
}
const routes: MockMethod[] = [
  route('/model-metadata', 'get', (req) => {
    const model = adaptedModel(String(req.query?.model_id_at_provider ?? ''))
    const provider = providers.find((p) => p.id === req.query?.provider_id)
    return success({
      supported_invocation_apis:
        model?.supported_invocation_apis ??
        (provider?.template_key === 'anthropic' ? ['MESSAGES'] : ['CHAT_COMPLETIONS']),
      input_modalities: model?.input_modalities ?? [],
      output_modalities: model?.output_modalities ?? [],
      tags: model?.tags ?? [],
      context_window: model?.context_window ?? null,
      max_output_tokens: model?.max_output_tokens ?? null,
    })
  }),
  route('/pricing-catalog', 'get', (req) => {
    const model = adaptedModel(String(req.query?.model_id_at_provider ?? ''))
    return success(model ? platformPrice(model) : blankPrice())
  }),
  route('/provider-templates', 'get', () => success(templates)),
  route('/providers', 'get', (req) => {
    const search = String(req.query?.search ?? '').toLowerCase()
    return success(
      page(
        providers
          .filter((p) =>
            [p.name, p.base_url, p.notes].some((s) => s.toLowerCase().includes(search)),
          )
          .map(sanitizedProvider),
        req,
      ),
    )
  }),
  ...(['post', 'put'] as const).map((method) =>
    route(method === 'post' ? '/providers' : '/providers/:id', method, (req) => {
      const b = structuredClone(req.body) as unknown as Provider
      const old = providers.find((p) => p.id === pathId(req, 'providers'))
      if (
        !b.name.trim() ||
        !/^https?:\/\//.test(b.base_url) ||
        providers.some((p) => p.id !== old?.id && p.name === b.name)
      )
        return error('PROVIDER_INVALID')
      const template = templates.find((t) => t.template_key === b.template_key)
      if (!template) return error('REQUIRED')
      const same = old?.template_key === b.template_key
      const configured = same ? [...old.configured_secret_fields] : []
      if (b.template_key === 'bedrock' && b.provider_config.auth_mode === 'IAM') {
        const index = configured.indexOf('api_key')
        if (index >= 0) configured.splice(index, 1)
      }
      if (b.balance_query_config.secret && !configured.includes('balance_query_secret'))
        configured.push('balance_query_secret')
      if (
        b.balance_query_mode === 'CUSTOM' &&
        b.balance_query_config.auth !== 'NONE' &&
        !configured.includes('balance_query_secret')
      )
        return error('BALANCE_INVALID')
      for (const f of template.fields) {
        if (
          b.template_key === 'bedrock' &&
          b.provider_config.auth_mode === 'IAM' &&
          f.key === 'api_key'
        )
          continue
        const value = b.provider_config[f.key]
        if (f.required && !value && !(f.secret && configured.includes(f.key)))
          return error('REQUIRED')
        if (f.secret) {
          if (value && !configured.includes(f.key)) configured.push(f.key)
          delete b.provider_config[f.key]
        }
      }
      if (b.balance_query_mode === 'NONE') b.balance_alert_enabled = false
      if (
        b.balance_alert_enabled &&
        (!(b.balance_alert_threshold > 0) ||
          !b.balance_alert_recipients.length ||
          !b.balance_alert_channels.length)
      )
        return error('BALANCE_INVALID')
      b.balance_query_config.secret = ''
      b.configured_secret_fields = configured
      b.id = old?.id ?? id()
      b.created_at = old?.created_at ?? now()
      if (old) Object.assign(old, b)
      else providers.push(b)
      return success(sanitizedProvider(b))
    }),
  ),
  route('/providers/:id', 'get', (req) => {
    const p = providers.find((p) => p.id === pathId(req, 'providers'))
    return p ? success(sanitizedProvider(p)) : fail('NOT_FOUND', '')
  }),
  route('/providers/:id', 'delete', (req) => {
    if (!req.body?.reason) return error('REASON_REQUIRED')
    const key = pathId(req, 'providers')
    const i = providers.findIndex((p) => p.id === key)
    if (i < 0) return fail('NOT_FOUND', '')
    if (models.some((m) => m.provider_id === key && m.status === 'ACTIVE'))
      return error('DELETE_BLOCKED')
    providers.splice(i, 1)
    upstreamModels.delete(key)
    for (const [discoveryId, snapshot] of discoveries)
      if (snapshot.provider === key) discoveries.delete(discoveryId)
    for (const m of models.filter((m) => m.provider_id === key)) {
      m.provider_id = ''
      m.status = 'DRAFT'
      lifecycle(m, 'STATUS', String(req.body.reason), usernameFromToken(req)!)
      m.admission_valid = false
    }
    return success({ applied: true })
  }),
  route('/providers/:id/balance-query', 'post', (req) => {
    const p = providers.find((p) => p.id === pathId(req, 'providers'))
    if (!p || p.balance_query_mode === 'NONE') return error('BALANCE_DISABLED')
    p.last_balance_attempt_at = now()
    if (p.base_url.includes('fail')) {
      p.balance_query_status = 'FAILED'
      p.balance_query_error_code = 'AUTH_FAILED'
    } else {
      p.last_balance_value = 36.58
      p.last_balance_success_at = now()
      p.balance_query_status = 'SUCCESS'
      p.balance_query_error_code = null
    }
    return success(sanitizedProvider(p))
  }),
  route('/providers/:id/models/discover', 'post', (req) => {
    const p = providers.find((p) => p.id === pathId(req, 'providers'))
    if (!p) return fail('NOT_FOUND', '')
    const catalogNames = p.base_url.includes('fail')
      ? []
      : p.template_key === 'openai'
        ? ['gpt-4o', 'gpt-4o-mini', 'text-embedding-3-large', 'o3-mini']
        : p.template_key === 'deepseek'
          ? ['deepseek-chat', 'deepseek-reasoner']
          : p.template_key === 'bailian'
            ? ['qwen-plus', 'qwen-max']
            : p.template_key === 'openrouter'
              ? ['openai/gpt-4o', 'anthropic/claude-sonnet-4']
              : []
    const connected = new Map(
      models
        .filter((model) => model.provider_id === p.id)
        .map((model) => [model.model_id_at_provider, model]),
    )
    const upstream = upstreamModels.get(p.id)
    const names = catalogNames.length
      ? [...new Set([...catalogNames, ...(upstream?.keys() ?? []), ...connected.keys()])]
      : []
    const items = names.map((name) => ({
      model_id_at_provider: name,
      model_id_at_gateway: connected.get(name)?.model_id_at_gateway ?? name,
      display_name: name,
      input_modalities:
        adaptedModel(name)?.input_modalities ??
        connected.get(name)?.input_modalities ??
        upstream?.get(name)?.input_modalities ??
        [],
      output_modalities:
        adaptedModel(name)?.output_modalities ??
        connected.get(name)?.output_modalities ??
        upstream?.get(name)?.output_modalities ??
        [],
      tags:
        adaptedModel(name)?.tags ?? connected.get(name)?.tags ?? upstream?.get(name)?.tags ?? [],
      context_window:
        adaptedModel(name)?.context_window ??
        connected.get(name)?.context_window ??
        upstream?.get(name)?.context_window ??
        null,
      max_output_tokens:
        adaptedModel(name)?.max_output_tokens ??
        connected.get(name)?.max_output_tokens ??
        upstream?.get(name)?.max_output_tokens ??
        null,
      supported_invocation_apis:
        connected.get(name)?.supported_invocation_apis ??
        upstream?.get(name)?.supported_invocation_apis ??
        (name === 'text-embedding-3-large'
          ? ['EMBEDDINGS']
          : name.includes('gpt-4o')
            ? ['CHAT_COMPLETIONS', 'RESPONSES']
            : ['CHAT_COMPLETIONS']),
      custom_invocation_apis:
        connected.get(name)?.custom_invocation_apis ??
        upstream?.get(name)?.custom_invocation_apis ??
        [],
      already_added: connected.has(name),
    }))
    const key = id()
    discoveries.set(key, { provider: p.id, items })
    return success({
      discovery_id: key,
      items,
      error_code: p.base_url.includes('fail')
        ? 'AUTH_FAILED'
        : names.length
          ? null
          : 'LIST_UNAVAILABLE',
    })
  }),
  route('/providers/:id/models/import', 'post', (req) => {
    const key = pathId(req, 'providers')
    const snapshot = discoveries.get(String(req.body?.discovery_id))
    if (!snapshot || snapshot.provider !== key) return error('DISCOVERY_EXPIRED')
    const imported: Model[] = []
    const errors: string[] = []
    for (const item of req.body?.items as Candidate[]) {
      if (
        models.some(
          (m) => m.provider_id === key && m.model_id_at_provider === item.model_id_at_provider,
        )
      )
        continue
      const trusted = snapshot.items.find(
        (x) => x.model_id_at_provider === item.model_id_at_provider,
      )
      const adapted = adaptedModel(item.model_id_at_provider)
      const m: Model = {
        id: id(),
        provider_id: key,
        model_id_at_gateway: item.model_id_at_gateway,
        model_id_at_provider: item.model_id_at_provider,
        supported_invocation_apis:
          adapted?.supported_invocation_apis ??
          trusted?.supported_invocation_apis ??
          item.supported_invocation_apis,
        custom_invocation_apis: [],
        input_modalities:
          adapted?.input_modalities ?? trusted?.input_modalities ?? item.input_modalities,
        output_modalities:
          adapted?.output_modalities ?? trusted?.output_modalities ?? item.output_modalities,
        tags: adapted?.tags ?? trusted?.tags ?? item.tags,
        context_window: adapted?.context_window ?? trusted?.context_window ?? null,
        max_output_tokens: adapted?.max_output_tokens ?? trusted?.max_output_tokens ?? null,
        description: '',
        status: 'DRAFT',
        health_status: 'UNKNOWN',
        auto_health_check: false,
        health_check_interval_minutes: 360,
        health_checked_at: null,
        created_at: now(),
        suspend_reason: null,
        admission_valid: false,
      }
      const e = modelError(m)
      if (e) {
        errors.push(`${m.model_id_at_gateway}: ${e}`)
        continue
      }
      models.unshift(m)
      rememberUpstream(m)
      lifecycle(m, 'CREATE', '', usernameFromToken(req)!)
      if (platformPrice(m).metric_rates.length) {
        prices.set(m.id, [
          { ...platformPrice(m), id: id(), version: 1, created_at: now(), created_by: 'system' },
        ])
      }
      imported.push(m)
    }
    return success({ items: imported, errors })
  }),
  route('/models', 'get', (req) => {
    const q = req.query ?? {}
    const search = String(q.search ?? '').toLowerCase()
    return success(
      page(
        models.filter(
          (m) =>
            (!q.provider_id || m.provider_id === q.provider_id) &&
            (!q.status || m.status === q.status) &&
            (!q.input_modality || m.input_modalities.includes(String(q.input_modality))) &&
            (!q.output_modality || m.output_modalities.includes(String(q.output_modality))) &&
            [
              m.model_id_at_gateway,
              m.model_id_at_provider,
              providers.find((p) => p.id === m.provider_id)?.name ?? '',
            ].some((s) => s.toLowerCase().includes(search)),
        ),
        req,
      ),
    )
  }),
  ...(['post', 'put'] as const).map((method) =>
    route(method === 'post' ? '/models' : '/models/:id', method, (req) => {
      const b = structuredClone(req.body) as unknown as Model
      const old = models.find((m) => m.id === pathId(req, 'models'))
      const e = modelError(b, old)
      if (e) return error(e)
      if (old) {
        const changed =
          JSON.stringify(old.supported_invocation_apis) !==
            JSON.stringify(b.supported_invocation_apis) ||
          JSON.stringify(old.custom_invocation_apis) !== JSON.stringify(b.custom_invocation_apis) ||
          old.provider_id !== b.provider_id ||
          old.model_id_at_provider !== b.model_id_at_provider
        b.status = old.status
        b.health_status = old.health_status
        b.health_checked_at = old.health_checked_at
        b.created_at = old.created_at
        b.admission_valid = old.admission_valid && !changed
        b.lifecycle_events = old.lifecycle_events
        Object.assign(old, b)
        lifecycle(old, 'UPDATE', '', usernameFromToken(req)!)
      } else {
        b.id = id()
        b.status = 'DRAFT'
        b.health_status = 'UNKNOWN'
        b.admission_valid = false
        b.created_at = now()
        models.unshift(b)
        lifecycle(b, 'CREATE', '', usernameFromToken(req)!)
      }
      if (!old && platformPrice(b).metric_rates.length) {
        const builtIn = platformPrice(b)
        prices.set(b.id, [
          { ...builtIn, id: id(), version: 1, created_at: now(), created_by: 'system' },
        ])
      }
      rememberUpstream(b)
      return success(b)
    }),
  ),
  route('/models/:id', 'get', (req) => {
    const m = models.find((m) => m.id === pathId(req, 'models'))
    return m ? success(m) : fail('NOT_FOUND', '')
  }),
  route('/models/:id', 'delete', (req) => {
    const key = pathId(req, 'models')
    const m = models.find((m) => m.id === key)
    if (!m || m.status === 'ACTIVE' || !req.body?.reason) return error('DELETE_BLOCKED')
    rememberUpstream(m)
    models.splice(models.indexOf(m), 1)
    prices.delete(key)
    permissions.delete(key)
    runs.delete(key)
    return success({ applied: true })
  }),
  route('/models/:id/status', 'put', (req) => {
    const m = models.find((m) => m.id === pathId(req, 'models'))
    const status = req.body?.status as Status
    if (!m || !transitions[m.status].includes(status) || !req.body?.reason)
      return error('STATUS_BLOCKED')
    if (m.status === 'PENDING_REVIEW' && status === 'ACTIVE' && !m.admission_valid)
      return error('TEST_REQUIRED')
    m.status = status
    lifecycle(m, 'STATUS', String(req.body.reason), usernameFromToken(req)!)
    m.suspend_reason = String(req.body.reason)
    if (status === 'DRAFT') m.admission_valid = false
    return success(m)
  }),
]
for (const purpose of ['ADMISSION', 'HEALTH'] as const) {
  const segment = purpose === 'HEALTH' ? 'health-checks' : 'admission-tests'
  routes.push(
    route(`/models/:id/${segment}`, 'post', (req) => {
      const m = models.find((m) => m.id === pathId(req, 'models'))
      if (!m || !m.provider_id || !m.supported_invocation_apis.length) return error('REQUIRED')
      const list = runs.get(m.id) ?? []
      if (list.some((r) => r.status === 'RUNNING')) return error('TEST_BUSY')
      if (purpose === 'HEALTH' ? !['ACTIVE', 'SUSPENDED'].includes(m.status) : m.status !== 'DRAFT')
        return error('STATUS_BLOCKED')
      const keys = [
        'CONNECTIVITY',
        'PROTOCOL',
        ...(m.tags.includes('STREAMING') ? ['STREAMING'] : []),
      ].filter(
        (k) =>
          ['CONNECTIVITY', 'PROTOCOL'].includes(k) ||
          (req.body?.selected_checks as string[]).includes(k),
      )
      const run: TestRun = {
        id: id(),
        model_id: m.id,
        purpose,
        trigger_type: 'MANUAL',
        invocation_api: m.supported_invocation_apis[0]!,
        invocation_apis: invocationTargets(m).map((a) => a.invocation_api),
        billing_user: 'system',
        billing_department: 'HEADQUARTERS',
        status: 'RUNNING',
        checks: invocationTargets(m).flatMap((api) =>
          keys.map((key) => ({
            key,
            invocation_api: api.invocation_api,
            upstream_path: api.path,
            status: 'PENDING' as const,
            duration_ms: 0,
            detail: '',
          })),
        ),
        started_at: now(),
        completed_at: null,
        triggered_by: usernameFromToken(req)!,
      }
      list.unshift(run)
      runs.set(m.id, list)
      polls.set(run.id, 0)
      if (purpose === 'HEALTH') m.health_status = 'CHECKING'
      else {
        m.status = 'TESTING'
        lifecycle(m, 'STATUS', '', usernameFromToken(req)!)
      }
      return success(run)
    }),
    route(`/models/:id/${segment}`, 'get', (req) =>
      success(
        page(
          (runs.get(pathId(req, 'models')) ?? [])
            .filter((r) => r.purpose === purpose)
            .slice(0, purpose === 'HEALTH' ? 5 : 50),
          req,
        ),
      ),
    ),
    route(`/models/:id/${segment}/:run`, 'get', (req) => {
      const key = pathId(req, 'models')
      const run = (runs.get(key) ?? []).find((r) => r.id === req.url?.split('?')[0]?.split('/')[6])
      if (!run) return fail('NOT_FOUND', '')
      if (run.status === 'RUNNING') {
        const count = (polls.get(run.id) ?? 0) + 1
        polls.set(run.id, count)
        advance(run, count)
      }
      return success(run)
    }),
  )
}
routes.push(
  route('/models/:id/permissions', 'get', (req) =>
    success(
      page(
        (permissions.get(pathId(req, 'models')) ?? [])
          .map((grant) => ({
            ...grant,
            subject_name: subjectName(grant.subject_type, grant.subject_id, grant.subject_name),
          }))
          .filter((p) => !req.query?.subject_type || p.subject_type === req.query.subject_type),
        req,
      ),
    ),
  ),
  route('/models/:id/permissions', 'post', (req) => {
    const key = pathId(req, 'models')
    const list = permissions.get(key) ?? []
    for (const item of req.body?.items as Permission[])
      if (
        !list.some((x) => x.subject_type === item.subject_type && x.subject_id === item.subject_id)
      )
        list.push({ ...item, id: id(), physical_model_id: key, created_at: now() })
    permissions.set(key, list)
    return success({ applied: true })
  }),
  route('/models/:id/permissions', 'delete', (req) => {
    if (!req.body?.reason) return error('REASON_REQUIRED')
    const key = pathId(req, 'models')
    permissions.set(
      key,
      (permissions.get(key) ?? []).filter((p) => !(req.body?.ids as string[]).includes(p.id)),
    )
    return success({ applied: true })
  }),
  route('/models/:id/pricing/current', 'get', (req) =>
    success(
      prices.get(pathId(req, 'models'))?.[0] ??
        platformPrice(models.find((m) => m.id === pathId(req, 'models'))!),
    ),
  ),
  route('/models/:id/pricing', 'get', (req) =>
    success(page(prices.get(pathId(req, 'models')) ?? [], req)),
  ),
  route('/models/:id/pricing', 'post', (req) => {
    const body = req.body as unknown as Pricing
    const model = models.find((m) => m.id === pathId(req, 'models'))
    if (!model) return fail('NOT_FOUND', '')
    const allowed = platformPrice(model)
      .metric_rates.map((r) => r.metric_key)
      .sort()
    if (
      JSON.stringify(body.metric_rates.map((r) => r.metric_key).sort()) !== JSON.stringify(allowed)
    )
      return error('invalidPrice')
    if (body.source_type === 'BUILT_IN') {
      return success(
        savePrice(
          model.id,
          { ...platformPrice(model), currency: body.currency || 'CNY' },
          usernameFromToken(req)!,
        ),
      )
    }
    body.source_type = 'ENTERPRISE_CUSTOM'
    const problem = pricingError(body)
    return problem
      ? error(problem)
      : success(savePrice(pathId(req, 'models'), body, usernameFromToken(req)!))
  }),
  route('/models/:id/pricing/sync', 'post', (req) => {
    const key = pathId(req, 'models')
    const m = models.find((m) => m.id === key)
    if (!m) return fail('NOT_FOUND', '')
    if (
      !['gpt-4o', 'gpt-4o-mini', 'qwen-plus', 'qwen-max', 'o3-mini'].includes(
        m.model_id_at_provider,
      )
    )
      return error('NO_PLATFORM_PRICE')
    return success(
      savePrice(
        key,
        {
          ...platformPrice(m),
          sync_mode: prices.get(key)?.[0]?.sync_mode ?? 'MANUAL',
        },
        usernameFromToken(req)!,
      ),
    )
  }),
)
export default auditedMock(routes)
