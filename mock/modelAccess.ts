import { providerFixtures, modelFixtures } from './_modelAccessFixtures'
import { modelCatalog } from './_modelAccessCatalog'
import { normalizeHistoryTimes, seedModelHistories } from './_modelAccessHistory'
import { modelAccessState } from './_modelAccessState'
import { localizeModelAccessResponse } from './_modelAccessLocale'
import { mockAccounts, mockRoles } from './_accounts'
import { templates as templateFixtures } from './_modelAccessTemplates'
import { CAPABILITIES } from './_capabilities'
import type { RespThisType } from 'vite-plugin-mock'
import type * as D from '../src/api/modules/modelAccessContract'
import { normalizeModelId, validModelId, isDecimal } from '../src/utils/modelContract'
import { mockObject as make, validBody, project } from './_modelAccessFactory'
import { directory, existingState, nextSequence, operationLogs } from './_runtime'
import {
  checkToken,
  checkCsrf,
  usernameFromToken,
  mockId,
  success,
  fail,
  type MockRequest,
  type MockMethod,
} from './_utils'

// Simulated control-plane facts only. No supplier requests or real charging.
const departments = {
  values: () =>
    (
      existingState<{ id: string; name: string; parent_id: string | null }[]>('departments') ?? []
    ).values(),
  get: (id: string) =>
    (existingState<{ id: string; name: string }[]>('departments') ?? []).find((d) => d.id === id),
}
const groups = {
  values: () => (existingState<{ id: string; name: string }[]>('groups') ?? []).values(),
  get: (id: string) =>
    (existingState<{ id: string; name: string }[]>('groups') ?? []).find((g) => g.id === id),
}
const timestamp = () => new Date().toISOString()
const uuid = (key: string) => mockId(`ma-v14-${key}`)
const release = uuid('catalog')
const revision = 'mock-2026-11-10'
let identity = make<D.IdentitySnapshot>('IdentitySnapshot', {
  user_id: uuid('operator'),
  username: 'mock_operator',
  display_name: 'Mock operator',
})
const store = modelAccessState
store.jobSnapshots ??= new Map()

const templates: D.Template[] = templateFixtures.map((fixture) =>
  make<D.Template>('Template', {
    key: fixture.template_key,
    name: fixture.name,
    revision,
    enabled: true,
    default_base_url: fixture.base_url || null,
    template_version_id: uuid(`template-${fixture.template_key}`),
    catalog_release_id: release,
    icon_key: fixture.template_key,
    auth_modes: [{ value: 'API_KEY', label: 'API Key' }],
    suggested_invocation_apis: [
      fixture.template_key === 'anthropic' ? 'MESSAGES' : 'CHAT_COMPLETIONS',
    ],
    notification_delivery_supported: false,
    balance_template_supported: fixture.template_key === 'openrouter',
    fields: fixture.fields.map((f) =>
      make<D.DynamicField>('DynamicField', {
        key: f.key,
        label: f.label,
        value_type: f.secret ? 'SECRET' : 'STRING',
        required: f.required,
        default: f.default_value ?? null,
        control: f.key === 'service_account_json' ? 'JSON_EDITOR' : f.secret ? 'PASSWORD' : 'TEXT',
        validation_schema: { type: 'string' },
      }),
    ),
  }),
)
function templateFor(p: D.Provider) {
  return templates.find((t) => t.template_version_id === p.template_version_id)!
}
function catalog(p: D.Provider): D.CatalogBinding {
  return {
    catalog_release_id: p.catalog_release_id,
    catalog_revision: revision,
    template_version_id: p.template_version_id,
    catalog_model_version_id: null,
    catalog_price_version_id: null,
  }
}
const unknownBinding = () =>
  make<D.OfficialModelBinding>('OfficialModelBinding', {
    state: 'UNKNOWN',
    reason_code: 'UNVERIFIED',
  })
function invocation(
  model: Pick<D.Model, 'id' | 'supported_invocation_apis' | 'custom_invocation_apis'>,
): D.InvocationAPI[] {
  return [
    ...model.supported_invocation_apis.map((api_key) =>
      make<D.InvocationAPI>('InvocationAPI', {
        id: uuid(`${model.id}-${api_key}`),
        api_key,
        kind: 'STANDARD',
        adapter_key: api_key,
        adapter_revision: revision,
        streaming_applicable: true,
      }),
    ),
    ...model.custom_invocation_apis.map((api) =>
      make<D.InvocationAPI>('InvocationAPI', {
        id: api.id,
        api_key: api.id,
        kind: 'CUSTOM',
        path: api.path,
        adapter_key: 'CHAT_COMPLETIONS',
        adapter_revision: revision,
        streaming_applicable: true,
      }),
    ),
  ]
}
function specs(apis: string[]): D.MetricSpec[] {
  if (apis.includes('EMBEDDINGS')) return [metric('input_tokens', 'Input tokens')]
  if (
    !apis.some((api) =>
      ['CHAT_COMPLETIONS', 'RESPONSES', 'MESSAGES', 'GENERATE_CONTENT'].includes(api),
    )
  )
    return []
  return [metric('input_tokens', 'Input tokens'), metric('output_tokens', 'Output tokens')]
}
function metric(key: string, label: string): D.MetricSpec {
  return make<D.MetricSpec>('MetricSpec', {
    metric_key: key,
    unit: 'PER_MILLION_TOKENS',
    unit_divisor: 1000000,
    display_name: label,
    unit_label: '1M Token',
    description: label,
  })
}
function preparation(p: D.Provider, upstream: string, apis: string[]): D.PricingPreparation {
  const metrics = specs(apis)
  const defaults = enterpriseDefault(p, upstream, metrics)
  return {
    provider_id: p.id,
    provider_version: p.version,
    model_id_at_provider: upstream,
    catalog_binding: catalog(p),
    metric_specs: metrics,
    billing_currency: 'CNY',
    currency_source: 'DEFAULT_CNY',
    billing_time_zone: 'Asia/Shanghai',
    time_zone_source: 'DEFAULT_ASIA_SHANGHAI',
    reference_state: metrics.length ? 'NO_PUBLIC_PRICE' : 'NOT_APPLICABLE',
    official_reference: null,
    default_reference: defaults,
    prefill_origin: defaults
      ? 'ENTERPRISE_DEFAULT'
      : metrics.length
        ? 'ENTERPRISE_DEFAULT_ZERO'
        : 'NONE',
    internal_pricing_prefill: defaults
      ? {
          expected_price_version: 0,
          currency: 'CNY',
          pricing_mode: defaults.pricing_mode,
          catalog_price_version_id: null,
          catalog_default_price_version_id: defaults.catalog_default_price_version_id,
          periods: structuredClone(defaults.periods),
        }
      : metrics.length
        ? {
            expected_price_version: 0,
            currency: 'CNY',
            pricing_mode: 'FIXED',
            catalog_price_version_id: null,
            periods: [
              {
                name: 'Default',
                is_fallback: true,
                conditions: [],
                metric_rates: metrics.map((m) => ({
                  metric_key: m.metric_key,
                  unit: m.unit,
                  unit_price: '0',
                })),
              },
            ],
          }
        : null,
  }
}
function enterpriseDefault(
  p: D.Provider,
  upstream: string,
  metrics: D.MetricSpec[],
): D.EnterpriseDefaultPricingTemplate | null {
  const sample = modelFixtures.find(
    (item) => item.template_key === p.template_key && item.model_id_at_provider === upstream,
  )
  if (!sample || !metrics.length) return null
  return {
    catalog_default_price_version_id: uuid(
      `enterprise-default-${p.template_version_id}-${upstream}`,
    ),
    catalog_model_version_id: uuid(`fixture-model-${p.template_key}-${upstream}`),
    catalog_release_id: p.catalog_release_id,
    catalog_revision: revision,
    adapter_revision: revision,
    currency_mode: 'SYSTEM_BILLING_CURRENCY',
    pricing_mode: 'FIXED',
    time_zone: 'Asia/Shanghai',
    periods: [
      {
        name: '默认时段',
        is_fallback: true,
        conditions: [],
        metric_rates: metrics.map((metric) => ({
          metric_key: metric.metric_key,
          unit: metric.unit,
          unit_price:
            metric.metric_key === 'output_tokens' ? sample.output_price : sample.input_price,
        })),
      },
    ],
    rounding: 'HALF_EVEN',
    amount_scale: 18,
  }
}
function balanceRecipient(id: string): D.BalanceRecipientDisplay {
  const user = [...directory.values()].find((item) => item.id === id)
  const details = existingState<{ id: string; email: string | null }[]>('users')?.find(
    (item) => item.id === id,
  )
  const email = details?.email ?? null
  const department = user?.department_id ? departments.get(user.department_id) : undefined
  const path: string[] = []
  let ancestor = user?.department_id
  const visited = new Set<string>()
  while (ancestor && !visited.has(ancestor)) {
    visited.add(ancestor)
    const current = [...departments.values()].find((item) => item.id === ancestor)
    if (!current) break
    path.unshift(current.name)
    ancestor = current.parent_id ?? undefined
  }
  return make<D.BalanceRecipientDisplay>('BalanceRecipientDisplay', {
    user_id: id,
    username: user?.username ?? null,
    display_name: user?.display_name ?? null,
    email,
    department_name: department?.name ?? null,
    department_path: path.length ? path.join(' / ') : null,
    email_valid: email ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : false,
    selectable: user?.status === 'ACTIVE' && user.username !== 'system',
    unavailable_reason: user ? null : 'UNAVAILABLE',
  })
}
function balanceConfig(id: string): D.BalanceConfig {
  const saved = store.configs.get(id)
  if (saved) return { ...saved, recipient_users: saved.recipient_user_ids.map(balanceRecipient) }
  const openrouter = store.providers.find((item) => item.id === id)?.template_key === 'openrouter'
  const recipients = openrouter
    ? [...directory.values()]
        .map((u) => balanceRecipient(u.id))
        .filter((u) => u.selectable && u.email_valid)
        .slice(0, 2)
    : []
  return make<D.BalanceConfig>('BalanceConfig', {
    provider_id: id,
    version: 0,
    mode: openrouter ? 'CUSTOM' : 'NONE',
    currency_or_unit: openrouter ? 'USD' : null,
    query_config: openrouter
      ? {
          method: 'GET',
          url: 'https://openrouter.ai/api/v1/credits',
          auth_type: 'BEARER',
          calculation_mode: 'SUBTRACT',
          total_path: 'data.total_credits',
          used_path: 'data.total_usage',
        }
      : {},
    configured_secret_fields: openrouter ? ['token'] : [],
    alert_enabled: openrouter && recipients.length > 0,
    threshold: openrouter ? '50.00' : null,
    recipient_user_ids: recipients.map((u) => u.user_id),
    recipient_users: recipients,
    channels: openrouter ? ['IN_APP', 'EMAIL'] : ['IN_APP'],
    notification_delivery_supported: false,
  })
}
function balanceState(id: string): D.BalanceState {
  return (
    store.balances.get(id) ??
    make<D.BalanceState>('BalanceState', {
      provider_id: id,
      query_status: 'NEVER_QUERIED',
      alert_state: 'UNKNOWN',
      notification_delivery_supported: false,
    })
  )
}
function providerView(p: D.Provider): D.Provider {
  const config = balanceConfig(p.id),
    b = balanceState(p.id)
  return {
    ...p,
    model_count: store.models.filter((m) => m.provider_id === p.id).length,
    balance_summary: {
      ...b,
      mode: config.mode,
      alert_enabled: config.alert_enabled,
      threshold: config.threshold,
    },
  }
}
function currentModel(m: D.Model): D.Model {
  const p = store.providers.find((p) => p.id === m.provider_id)
  return p
    ? {
        ...m,
        provider_name: p.name,
        provider_base_url: p.base_url,
        provider_template_key: p.template_key,
        provider_template_name: p.template_name,
        provider_template_icon_key: p.template_icon_key,
        security_level: p.security_level,
      }
    : m
}
function modelSummary(m: D.Model): D.ModelAuthorizationSummary {
  m = currentModel(m)
  return {
    id: m.id,
    model_id_at_gateway: m.model_id_at_gateway,
    model_id_at_provider: m.model_id_at_provider,
    provider_id: m.provider_id,
    provider_name: m.provider_name,
    provider_template_key: m.provider_template_key,
    provider_template_name: m.provider_template_name,
    provider_template_icon_key: m.provider_template_icon_key,
    input_modalities: m.input_modalities,
    output_modalities: m.output_modalities,
    status: m.status,
    health_status: m.health_status,
  }
}
function page<T>(items: T[], req: MockRequest) {
  const paginate = req.query?.paginate
  if (
    paginate !== undefined &&
    !['true', 'false', true, false].includes(paginate as boolean | string)
  )
    throw issue('MALFORMED_REQUEST', 400)
  if (String(paginate) === 'false') {
    if (req.query?.page !== undefined || req.query?.page_size !== undefined)
      throw issue('VALIDATION_FAILED', 422)
    return { items, page: null, page_size: null, total: items.length }
  }
  const page = Number(req.query?.page ?? 1),
    page_size = Number(req.query?.page_size ?? 20)
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(page_size) ||
    page_size < 1 ||
    page_size > 100
  )
    throw issue('VALIDATION_FAILED', 422)
  return {
    items: items.slice((page - 1) * page_size, page * page_size),
    page,
    page_size,
    total: items.length,
    total_pages: Math.ceil(items.length / page_size),
  }
}
function issue(code: string, status = 409, params: Record<string, unknown> = {}) {
  return Object.assign(new Error(code), { code, status, params })
}
function version(expected: unknown, current: number) {
  if (expected !== current) throw issue('VERSION_CONFLICT', 409, { current_version: current })
}
function event(
  m: D.Model,
  action: D.LifecycleEvent['action'],
  old: D.Model['status'] | null,
  reason: string | null = null,
) {
  const list = store.events.get(m.id) ?? []
  list.unshift({
    id: uuid(`event-${nextSequence('ma-event')}`),
    occurred_at: timestamp(),
    action,
    from_status: old,
    to_status: m.status,
    actor: structuredClone(identity),
    reason,
  })
  store.events.set(m.id, list)
}
function changeStatus(m: D.Model, input: D.StatusCommand) {
  version(input.expected_state_version, m.versions.state)
  const transitions: Record<
    D.StatusCommand['action'],
    [string[], D.Model['status'], D.LifecycleEvent['action']]
  > = {
    APPROVE: [['PENDING_REVIEW'], 'ACTIVE', 'APPROVED'],
    REJECT: [['PENDING_REVIEW'], 'DRAFT', 'REJECTED'],
    SUSPEND: [['ACTIVE'], 'SUSPENDED', 'SUSPENDED'],
    RESUME: [['SUSPENDED'], 'ACTIVE', 'RESUMED'],
    RETIRE: [['ACTIVE', 'SUSPENDED'], 'RETIRED', 'RETIRED'],
    REACTIVATE: [['RETIRED'], 'DRAFT', 'REACTIVATED'],
  }
  const [from, to, action] = transitions[input.action]
  if (!from.includes(m.status)) throw issue('STATE_CONFLICT')
  if (['REJECT', 'SUSPEND'].includes(input.action) && !input.reason?.trim())
    throw issue('VALIDATION_FAILED', 422)
  if (input.action === 'APPROVE' && specs(m.supported_invocation_apis).length) {
    const price = store.prices.get(m.id)?.[0]
    if (!price) throw issue('PRICE_RULE_INVALID', 422)
    checkPrice(savedPriceInput(price), m)
  }
  const old = m.status
  m.status = to
  m.versions.state++
  m.updated_at = timestamp()
  m.suspend_reason = input.action === 'SUSPEND' ? input.reason! : null
  event(m, action, old, input.reason ?? null)
  return m
}
function savedPriceInput(price: D.PricingVersion): D.PricingInput {
  return {
    expected_price_version: price.version,
    currency: price.currency,
    pricing_mode: price.pricing_mode,
    catalog_default_price_version_id: price.catalog_default_price_version_id,
    catalog_price_version_id: price.catalog_price_version_id,
    periods: price.periods.map((p) => ({
      name: p.name,
      is_fallback: p.is_fallback,
      conditions: p.conditions,
      metric_rates: p.metric_rates.map(({ metric_key, unit, unit_price }) => ({
        metric_key,
        unit,
        unit_price,
      })),
    })),
  }
}
function checkPrice(
  input: D.PricingInput | null,
  m: Pick<D.Model, 'id' | 'provider_id' | 'model_id_at_provider' | 'supported_invocation_apis'>,
) {
  const metrics = specs(m.supported_invocation_apis),
    history = store.prices.get(m.id) ?? []
  if (input === null) {
    if (metrics.length) throw issue('PRICE_RULE_INVALID', 422)
    return
  }
  if (!validBody('PricingInput', input)) throw issue('VALIDATION_FAILED', 422)
  version(input.expected_price_version, history[0]?.version ?? 0)
  if (input.currency !== 'CNY') throw issue('BILLING_CURRENCY_CHANGED')
  if (input.catalog_price_version_id) throw issue('CATALOG_INCOMPATIBLE', 422)
  if (input.catalog_default_price_version_id) {
    const provider = store.providers.find((provider) => provider.id === m.provider_id)!
    if (
      enterpriseDefault(provider, m.model_id_at_provider, metrics)
        ?.catalog_default_price_version_id !== input.catalog_default_price_version_id
    )
      throw issue('CATALOG_INCOMPATIBLE', 422)
  }
  const fallback = input.periods.filter((p) => p.is_fallback)
  if (
    fallback.length !== 1 ||
    fallback[0]!.conditions.length ||
    !metrics.length ||
    (input.pricing_mode === 'FIXED' && input.periods.length !== 1)
  )
    throw issue('PRICE_RULE_INVALID', 422)
  const windows: D.ConditionRow[] = []
  const names = new Set<string>()
  for (const period of input.periods) {
    if (
      !period.name.trim() ||
      names.has(period.name) ||
      (!period.is_fallback && !period.conditions.length)
    )
      throw issue('PRICE_RULE_INVALID', 422)
    names.add(period.name)
    if (
      period.metric_rates.length !== metrics.length ||
      new Set(period.metric_rates.map((r) => r.metric_key)).size !== metrics.length ||
      period.metric_rates.some(
        (r) =>
          !isDecimal(r.unit_price) ||
          !metrics.some((s) => s.metric_key === r.metric_key && s.unit === r.unit),
      )
    )
      throw issue('METRIC_UNSUPPORTED', 422)
    for (const w of period.conditions) {
      if (
        !w.weekdays.length ||
        w.weekdays.some(
          (day, index) =>
            !Number.isInteger(day) ||
            day < 1 ||
            day > 7 ||
            (index > 0 && day <= w.weekdays[index - 1]!),
        ) ||
        w.start_minute < 0 ||
        w.end_minute > 1440 ||
        w.start_minute >= w.end_minute ||
        windows.some(
          (s) =>
            s.weekdays.some((day) => w.weekdays.includes(day)) &&
            s.start_minute < w.end_minute &&
            w.start_minute < s.end_minute,
        )
      )
        throw issue('PRICE_RULE_INVALID', 422)
      windows.push(w)
    }
  }
}
function savePrice(input: D.PricingInput, m: D.Model) {
  const history = store.prices.get(m.id) ?? [],
    metrics = specs(m.supported_invocation_apis)
  const provider = store.providers.find((provider) => provider.id === m.provider_id)!
  const defaultId =
    input.catalog_default_price_version_id === undefined
      ? (history[0]?.catalog_default_price_version_id ?? null)
      : input.catalog_default_price_version_id
  const defaultReference = defaultId
    ? enterpriseDefault(provider, m.model_id_at_provider, metrics)
    : null
  const zero =
    !history.length &&
    input.periods.every((p) => p.metric_rates.every((r) => /^0(\.0+)?$/.test(r.unit_price)))
  const p = make<D.PricingVersion>('PricingVersion', {
    id: uuid(`price-${nextSequence('ma-price')}`),
    physical_model_id: m.id,
    version: (history[0]?.version ?? 0) + 1,
    source: zero ? 'BUILT_IN' : 'ENTERPRISE_CUSTOM',
    currency: input.currency,
    time_zone: 'Asia/Shanghai',
    pricing_mode: input.pricing_mode,
    periods: input.periods.map((p) => ({
      ...p,
      metric_rates: p.metric_rates.map((r) => ({
        ...r,
        display_name: metrics.find((s) => s.metric_key === r.metric_key)!.display_name,
        unit_label: metrics.find((s) => s.metric_key === r.metric_key)!.unit_label,
      })),
    })),
    adapter_revision: revision,
    rounding: 'HALF_EVEN',
    amount_scale: 18,
    created_at: timestamp(),
    created_by: identity.user_id!,
    created_by_display: structuredClone(identity),
    pricing_basis: {
      schema_version: 3,
      kind:
        !history.length && defaultReference
          ? 'ENTERPRISE_DEFAULT_CONFIRMED'
          : zero
            ? 'ENTERPRISE_DEFAULT_ZERO'
            : 'ENTERPRISE_CONFIGURED',
      default_zero_reason: zero ? 'NO_PUBLIC_PRICE' : null,
      official_reference: null,
      default_reference: defaultReference,
    },
  })
  p.catalog_default_price_version_id = defaultId
  history.unshift(p)
  store.prices.set(m.id, history)
  m.versions.price = p.version
  return p
}
function subjectName(subject: D.Subject): string {
  if (subject.subject_type === 'USER')
    return (
      [...directory.values()].find((u) => u.id === subject.subject_id)?.display_name ??
      'Unavailable'
    )
  if (subject.subject_type === 'DEPARTMENT')
    return departments.get(subject.subject_id)?.name ?? 'Unavailable'
  return groups.get(subject.subject_id)?.name ?? 'Unavailable'
}
function grantView(grant: D.Grant): D.Grant {
  const user =
    grant.subject_type === 'USER'
      ? [...directory.values()].find((user) => user.id === grant.subject_id)
      : undefined
  return {
    ...grant,
    subject_name: subjectName(grant),
    subject_username: user?.username ?? null,
  }
}
function validateGrants(m: D.Model, input: D.GrantDelta) {
  version(input.expected_grant_version, m.versions.grants)
  const current = store.grants.get(m.id) ?? []
  if (input.remove_grant_ids.some((id) => !current.some((g) => g.id === id)))
    throw issue('NOT_FOUND', 404)
  for (const s of input.add) if (!subjectExists(s)) throw issue('NOT_FOUND', 404)
}
function subjectExists(s: D.Subject) {
  return s.subject_type === 'USER'
    ? [...directory.values()].some((u) => u.id === s.subject_id)
    : s.subject_type === 'DEPARTMENT'
      ? !!departments.get(s.subject_id)
      : !!groups.get(s.subject_id)
}
function grantDelta(m: D.Model, input: D.GrantDelta) {
  validateGrants(m, input)
  const current = store.grants.get(m.id) ?? []
  const remaining = current.filter((g) => !input.remove_grant_ids.includes(g.id)),
    added: D.Grant[] = []
  let unchanged_count = 0
  for (const s of input.add) {
    if (remaining.some((g) => g.subject_type === s.subject_type && g.subject_id === s.subject_id)) {
      unchanged_count++
      continue
    }
    const g = make<D.Grant>('Grant', {
      ...s,
      id: uuid(`grant-${nextSequence('ma-grant')}`),
      physical_model_id: m.id,
      subject_name: subjectName(s),
      subject_username:
        s.subject_type === 'USER'
          ? ([...directory.values()].find((user) => user.id === s.subject_id)?.username ?? null)
          : null,
      scope_mode: s.subject_type === 'DEPARTMENT' ? 'SUBTREE' : null,
      manageable: true,
      created_at: timestamp(),
      created_by: identity.user_id!,
    })
    remaining.push(g)
    added.push(g)
  }
  if (added.length || input.remove_grant_ids.length) {
    m.versions.grants++
    store.authorizationVersion++
  }
  store.grants.set(m.id, remaining)
  return {
    grant_version: m.versions.grants,
    added,
    removed_grant_ids: input.remove_grant_ids,
    unchanged_count,
  }
}
function createModel(input: D.ModelCreate, p: D.Provider, importedDraft = false): D.Model {
  version(input.expected_provider_version, p.version)
  const name = normalizeModelId(input.model_id_at_gateway)
  if (
    !validModelId(name) ||
    !input.model_id_at_provider.trim() ||
    (!importedDraft &&
      !input.supported_invocation_apis.length &&
      !input.custom_invocation_apis?.length)
  )
    throw issue('VALIDATION_FAILED', 422)
  if (store.models.some((m) => m.model_id_at_gateway === name)) throw issue('NAME_CONFLICT')
  if (
    store.models.some(
      (m) => m.provider_id === p.id && m.model_id_at_provider === input.model_id_at_provider.trim(),
    )
  )
    throw issue('PROVIDER_MODEL_CONFLICT')
  const m = make<D.Model>('Model', {
    ...input,
    id: uuid(`model-${nextSequence('ma-model')}`),
    provider_id: p.id,
    model_id_at_gateway: name,
    model_id_at_provider: input.model_id_at_provider.trim(),
    description: input.description ?? null,
    custom_invocation_apis: (input.custom_invocation_apis ?? []).map((a) => ({
      id: uuid(`custom-${nextSequence('ma-custom')}`),
      path: a.path,
    })),
    input_modalities: input.input_modalities ?? [],
    output_modalities: input.output_modalities ?? [],
    tags: input.tags ?? [],
    context_window: input.context_window ?? null,
    max_output_tokens: input.max_output_tokens ?? null,
    status: 'DRAFT',
    health_status: 'UNKNOWN',
    health: input.health ?? { auto_health_check: false, health_check_interval_minutes: 360 },
    versions: { base: 1, metadata: 1, state: 1, grants: 1, price: 0, health: 1 },
    official_model_binding: unknownBinding(),
    provider_name: p.name,
    provider_base_url: p.base_url,
    provider_template_key: p.template_key,
    provider_template_name: p.template_name,
    provider_template_icon_key: p.template_icon_key,
    security_level: p.security_level,
    created_at: timestamp(),
    updated_at: timestamp(),
    created_by: identity.user_id!,
  })
  // Do not spread write-only fields into the read projection.
  delete (m as unknown as Record<string, unknown>).pricing
  delete (m as unknown as Record<string, unknown>).expected_provider_version
  delete (m as unknown as Record<string, unknown>).initial_grants
  m.invocation_apis = invocation(m)
  if (!importedDraft) checkPrice(input.pricing, m)
  if (input.initial_grants?.some((s) => !subjectExists(s))) throw issue('NOT_FOUND', 404)
  store.models.push(m)
  event(m, 'CREATED', null)
  if (input.pricing) savePrice(input.pricing, m)
  if (input.initial_grants?.length)
    grantDelta(m, { expected_grant_version: 1, add: input.initial_grants, remove_grant_ids: [] })
  return m
}
function removeModel(m: D.Model) {
  if (!['DRAFT', 'RETIRED'].includes(m.status))
    throw issue(m.status === 'TESTING' ? 'CHECK_IN_PROGRESS' : 'STATE_CONFLICT')
  if (
    [...store.jobs.values()].some(
      (j) => j.physical_model_id === m.id && ['QUEUED', 'RUNNING'].includes(j.status),
    )
  )
    throw issue('CHECK_IN_PROGRESS')
  store.models.splice(store.models.indexOf(m), 1)
  store.prices.delete(m.id)
  store.grants.delete(m.id)
  store.events.delete(m.id)
  for (const [id, job] of store.jobs)
    if (job.physical_model_id === m.id) {
      store.jobs.delete(id)
      store.jobSnapshots.delete(id)
    }
}
function startJob(
  m: D.Model,
  purpose: D.CheckJob['purpose'],
  expected: number,
  reuseId?: string,
): D.CheckJob {
  version(expected, m.versions.base)
  if (purpose === 'ADMISSION' ? m.status !== 'DRAFT' : !['ACTIVE', 'SUSPENDED'].includes(m.status))
    throw issue('STATE_CONFLICT')
  if (
    [...store.jobs.values()].some(
      (j) => j.physical_model_id === m.id && ['QUEUED', 'RUNNING'].includes(j.status),
    )
  )
    throw issue('CHECK_IN_PROGRESS')
  const p = store.providers.find((p) => p.id === m.provider_id)!,
    created_at = timestamp(),
    id = uuid(`job-${nextSequence('ma-job')}`)
  const source = reuseId ? store.jobs.get(reuseId) : undefined
  const frozen = source ? store.jobSnapshots.get(source.id) : undefined
  if (
    source &&
    (!frozen ||
      source.items.some(
        (item) =>
          item.check_type === 'STREAMING' &&
          (item.status !== 'NOT_APPLICABLE') !== m.tags.includes('STREAMING'),
      ))
  )
    throw issue('STATE_CONFLICT')
  if (
    reuseId &&
    (!source ||
      source.physical_model_id !== m.id ||
      source.purpose !== 'ADMISSION' ||
      source.result !== 'PASS' ||
      source.base_version !== m.versions.base ||
      source.provider_version !== p.version)
  )
    throw issue('ADMISSION_STALE')
  if (purpose === 'ADMISSION') {
    if (!m.invocation_apis.length) throw issue('VALIDATION_FAILED', 422)
    const price = store.prices.get(m.id)?.[0]
    if (price) {
      // Preserve a valid saved price; a changed profile requires an explicit price edit.
      checkPrice(savedPriceInput(price), m)
    } else {
      const initial = preparation(
        p,
        m.model_id_at_provider,
        m.supported_invocation_apis,
      ).internal_pricing_prefill
      if (initial) {
        checkPrice(initial, m)
        savePrice(initial, m)
      }
    }
  }
  const display = m.invocation_apis.map((a) => ({
    id: a.id,
    api_key: a.api_key,
    kind: a.kind,
    path: a.path,
    display_name: a.path ?? a.api_key,
  }))
  const types = ['MODEL_REQUEST', 'PROTOCOL', 'STREAMING'] as const
  const j = make<D.CheckJob>('CheckJob', {
    id,
    physical_model_id: m.id,
    purpose,
    trigger_type: 'MANUAL',
    triggered_by: identity.user_id,
    triggered_by_display: structuredClone(identity),
    status: 'QUEUED',
    base_version: m.versions.base,
    metadata_version: m.versions.metadata,
    provider_version: p.version,
    admission_epoch: uuid(`${id}-epoch`),
    created_at,
    deadline_at: new Date(Date.now() + 300000).toISOString(),
    planned_model_calls: display.length,
    pricing_details_visible: true,
    model_display: make<D.ModelDisplaySnapshot>('ModelDisplaySnapshot', {
      physical_model_id: m.id,
      model_id_at_gateway: m.model_id_at_gateway,
      model_id_at_provider: m.model_id_at_provider,
      provider_id: p.id,
      provider_name: p.name,
      template_key: p.template_key,
      template_name: p.template_name,
      template_icon_key: p.template_icon_key,
      template_catalog_binding: catalog(p),
    }),
    check_types: [...types],
    invocation_apis: display,
    items: display.flatMap((a) =>
      types.map((type) =>
        make<D.CheckItem>('CheckItem', {
          id: uuid(`${id}-${a.id}-${type}`),
          api_key: a.api_key,
          check_type: type,
          status:
            type === 'STREAMING' && !m.tags.includes('STREAMING') ? 'NOT_APPLICABLE' : 'WAITING',
          dispatch_state: 'READY',
          invocation_api: a,
        }),
      ),
    ),
  })
  if (source && frozen)
    for (const item of j.items) {
      const original = source.items.find(
        (old) =>
          old.invocation_api.id === item.invocation_api.id &&
          old.check_type === item.check_type &&
          ['PASS', 'REUSED'].includes(old.status),
      )
      if (!original?.result_detail || item.status === 'NOT_APPLICABLE') continue
      item.status = 'REUSED'
      item.dispatch_state = 'NOT_SENT'
      item.reused_item_id = original.id
      item.result_detail = structuredClone(original.result_detail)
      item.reuse_source = {
        source_job_id: source.id,
        source_item_id: original.id,
        source_base_version: source.base_version,
        source_metadata_version: source.metadata_version,
        source_admission_epoch: source.admission_epoch,
        source_provider_version: source.provider_version,
        source_completed_at: source.completed_at!,
        source_model_provider_snapshot: make<D.ModelProviderSnapshot>('ModelProviderSnapshot', {
          schema_version: 1,
          physical_model_id: m.id,
          model_id_at_gateway: frozen.model.model_id_at_gateway,
          model_id_at_provider: frozen.model.model_id_at_provider,
          provider_id: frozen.provider.id,
          provider_name: frozen.provider.name,
          template_key: frozen.provider.template_key,
          template_revision: frozen.provider.template_revision,
          base_url: frozen.provider.base_url,
          public_config: structuredClone(frozen.provider.public_config),
          official_model_binding: structuredClone(frozen.model.official_model_binding),
          base_version: source.base_version,
          metadata_version: source.metadata_version,
          provider_version: source.provider_version,
          connection_revision: frozen.provider.connection_revision,
          invocation_api: frozen.model.invocation_apis.find(
            (a) => a.id === item.invocation_api.id,
          )!,
          tags: frozen.model.tags,
          template_catalog_binding: catalog(frozen.provider),
        }),
        source_result: structuredClone(original.result_detail),
      }
    }
  j.planned_model_calls = j.items.filter((item) => item.status === 'WAITING').length
  store.jobs.set(id, j)
  store.jobSnapshots.set(id, { model: structuredClone(m), provider: structuredClone(p) })
  if (purpose === 'ADMISSION') {
    const old = m.status
    m.status = 'TESTING'
    m.versions.state++
    event(m, 'ADMISSION_STARTED', old)
  } else m.health_status = 'CHECKING'
  return j
}
function progress(j: D.CheckJob): D.CheckJob {
  const elapsed = Date.now() - Date.parse(j.created_at),
    m = store.models.find((m) => m.id === j.physical_model_id)
  if (!m || j.status === 'COMPLETED' || elapsed < 500) return j
  j.status = elapsed < 1200 ? 'RUNNING' : 'COMPLETED'
  j.started_at ??= timestamp()
  if (j.status !== 'COMPLETED') return j
  j.result = 'PASS'
  j.completed_at = timestamp()
  j.actual_model_calls = j.planned_model_calls
  for (const item of j.items) {
    if (item.status === 'NOT_APPLICABLE' || item.status === 'REUSED') continue
    item.status = 'PASS'
    item.dispatch_state = 'FINISHED'
    item.dispatch_count = 1
    item.request_started_at = j.started_at
    item.completed_at = j.completed_at
    item.result_detail = make<D.CheckResultDetail>('CheckResultDetail', {
      protocol: item.invocation_api.api_key,
      http_status: 200,
      latency_ms: 120,
      detail_text: 'Mock control-plane result',
      assertions: [],
      stream_terminated: item.check_type === 'STREAMING' ? true : null,
    })
  }
  j.summary = {
    passed_items: j.items.filter((i) => i.status === 'PASS').length,
    failed_items: 0,
    error_items: 0,
    not_applicable_items: j.items.filter((i) => i.status === 'NOT_APPLICABLE').length,
    reused_items: j.items.filter((i) => i.status === 'REUSED').length,
    waiting_items: 0,
    running_items: 0,
    cost_status: j.planned_model_calls ? 'UNKNOWN' : 'NOT_SENT',
    currency: 'CNY',
    known_amount: j.planned_model_calls ? null : '0',
    total_amount: j.planned_model_calls ? null : '0',
  }
  if (j.purpose === 'ADMISSION') {
    const old = m.status
    m.status = 'PENDING_REVIEW'
    m.versions.state++
    event(m, 'ADMISSION_PASSED', old)
  } else {
    m.health_status = 'HEALTHY'
    m.health_checked_at = timestamp()
  }
  return j
}
function initialize() {
  if (store.initialized) return
  for (const fixture of providerFixtures) {
    const t = templates.find((item) => item.key === fixture.template_key)!
    const p = make<D.Provider>('Provider', {
      ...fixture,
      id: uuid(`provider-${fixture.template_key}`),
      template_name: t.name,
      template_icon_key: t.icon_key,
      template_revision: t.revision,
      template_version_id: t.template_version_id,
      catalog_release_id: release,
      connection_revision: 1,
      public_config: Object.fromEntries(
        t.fields
          .filter((f) => f.value_type !== 'SECRET' && f.default !== null)
          .map((f) => [f.key, f.default]),
      ),
      configured_secret_fields: t.fields.filter((f) => f.value_type === 'SECRET').map((f) => f.key),
      version: 1,
      updated_at: fixture.created_at,
      created_by: identity.user_id!,
    })
    store.providers.push(p)
    for (const sample of modelFixtures.filter(
      (item) => item.template_key === fixture.template_key,
    )) {
      const prep = preparation(p, sample.model_id_at_provider, sample.supported_invocation_apis)
      const pricing = prep.internal_pricing_prefill
      if (pricing)
        for (const period of pricing.periods)
          for (const rate of period.metric_rates) {
            rate.unit_price = rate.metric_key.includes('output')
              ? sample.output_price
              : sample.input_price
          }
      const m = createModel(
        {
          provider_id: p.id,
          model_id_at_gateway: sample.model_id_at_gateway,
          model_id_at_provider: sample.model_id_at_provider,
          supported_invocation_apis: sample.supported_invocation_apis,
          expected_provider_version: 1,
          pricing,
          input_modalities: sample.input_modalities,
          output_modalities: sample.output_modalities,
          tags: sample.tags,
          context_window: sample.context_window,
          max_output_tokens: sample.max_output_tokens,
          description: sample.description,
          health: sample.health,
        },
        p,
      )
      if (sample.status !== 'DRAFT') {
        const job = startJob(m, 'ADMISSION', m.versions.base)
        job.created_at = sample.created_at
        progress(job)
        if (sample.status !== 'PENDING_REVIEW') {
          changeStatus(m, { action: 'APPROVE', expected_state_version: m.versions.state })
          if (sample.status === 'SUSPENDED' || sample.status === 'RETIRED')
            changeStatus(m, {
              action: sample.status === 'SUSPENDED' ? 'SUSPEND' : 'RETIRE',
              reason: sample.status === 'SUSPENDED' ? '内部知识库维护，暂停服务' : undefined,
              expected_state_version: m.versions.state,
            })
        }
      }
      m.health_status = sample.health_status
      m.health_checked_at = sample.health_status === 'UNKNOWN' ? null : '2026-11-10T01:00:00Z'
      m.created_at = sample.created_at
      m.updated_at = sample.created_at
      for (const e of store.events.get(m.id) ?? []) e.occurred_at = sample.created_at
      for (const price of store.prices.get(m.id) ?? []) price.created_at = sample.created_at
    }
  }
  store.initialized = true
}
initialize()
seedModelHistories({
  createJob: startJob,
  finishJob: progress,
  setStatus: changeStatus,
  addPrice: (input, model) => {
    checkPrice(input, model)
    return savePrice(input, model)
  },
})

function queryList(req: MockRequest, key: string): string[] {
  const value = req.query?.[key]
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}
function modelsFiltered(req: MockRequest) {
  const q = String(req.query?.q ?? '').toLowerCase()
  return store.models.filter(
    (m) =>
      (!req.query?.provider_id || m.provider_id === req.query.provider_id) &&
      (!req.query?.status || m.status === req.query.status) &&
      (!req.query?.health_status || m.health_status === req.query.health_status) &&
      (!q ||
        [m.model_id_at_gateway, m.model_id_at_provider, m.description ?? '', m.provider_name].some(
          (v) => v.toLowerCase().includes(q),
        )) &&
      ['input_modalities', 'output_modalities', 'tags'].every(
        (key) =>
          !queryList(req, key).length ||
          queryList(req, key).some((value) => m[key as 'tags'].includes(value)),
      ),
  )
}
function seedLinkedGrants() {
  const model = store.models.find((item) => item.model_id_at_gateway === 'gpt-4o')
  const user = [...directory.values()].find(
    (item) => ['admin', 'mock_admin'].includes(item.username) && item.status === 'ACTIVE',
  )
  const department = [...departments.values()].find((item) => !item.parent_id)
  const group = [...groups.values()][0]
  if (!model || !user || !department || !group) return
  const actor = { user_id: user.id, username: user.username, display_name: user.display_name }
  for (const price of store.prices.get(model.id) ?? [])
    if (price.created_by_display?.username === 'mock_operator') {
      price.created_by = user.id
      Object.assign(price.created_by_display, actor)
    }
  for (const job of store.jobs.values())
    if (job.triggered_by_display?.username === 'mock_operator') {
      const automatic = job.trigger_type === 'AUTO'
      job.triggered_by = automatic ? null : user.id
      Object.assign(
        job.triggered_by_display,
        automatic ? { user_id: null, username: null, display_name: '系统调度' } : actor,
      )
    }
  const order = [
    'CREATED',
    'ADMISSION_STARTED',
    'ADMISSION_PASSED',
    'ADMISSION_FAILED',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
    'RESUMED',
    'RETIRED',
    'REACTIVATED',
  ]
  for (const events of store.events.values()) {
    const groups = new Map<string, D.LifecycleEvent[]>()
    for (const event of events)
      if (event.actor.username === 'mock_operator')
        groups.set(event.occurred_at, [...(groups.get(event.occurred_at) ?? []), event])
    for (const [time, group] of groups)
      group
        .sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action))
        .forEach((event, index) => {
          event.occurred_at = new Date(Date.parse(time) + index * 1000).toISOString()
          Object.assign(event.actor, actor)
        })
    events.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
  }
  if (store.grantFixtureVersion >= 1) return
  const add: D.Subject[] = [
    { subject_type: 'USER', subject_id: user.id },
    { subject_type: 'DEPARTMENT', subject_id: department.id },
    { subject_type: 'USER_GROUP', subject_id: group.id },
  ]
  const existing = store.grants.get(model.id) ?? []
  grantDelta(model, {
    expected_grant_version: model.versions.grants,
    add: add.filter(
      (item) =>
        !existing.some(
          (grant) =>
            grant.subject_type === item.subject_type && grant.subject_id === item.subject_id,
        ),
    ),
    remove_grant_ids: [],
  })
  store.grantFixtureVersion = 1
}
function execute(op: string, req: MockRequest, ids: Record<string, string>): unknown {
  normalizeHistoryTimes()
  seedLinkedGrants()
  const body = req.body ?? {},
    query = req.query ?? {}
  const p = store.providers.find((p) => p.id === ids.provider_id),
    m = store.models.find((m) => m.id === ids.model_id)
  if ((ids.provider_id && !p) || (ids.model_id && !m)) throw issue('NOT_FOUND', 404)
  if (op === 'P01')
    return {
      items: query.provider_id
        ? templates.filter(
            (t) =>
              t.template_version_id ===
              store.providers.find((p) => p.id === query.provider_id)?.template_version_id,
          )
        : templates,
      catalog_release_id: release,
      catalog_revision: revision,
    }
  if (op === 'P02')
    return page(
      store.providers
        .filter((p) =>
          [p.name, p.base_url, p.notes ?? ''].some((v) =>
            v.toLowerCase().includes(String(query.q ?? '').toLowerCase()),
          ),
        )
        .map(providerView),
      req,
    )
  if (op === 'P04') return providerView(p!)
  if (op === 'P03' || op === 'P05') {
    const b = body as unknown as D.ProviderCreate & D.ProviderUpdate
    if (p) version(b.expected_version, p.version)
    const t = templates.find(
      (t) => t.key === b.template_key && t.template_version_id === b.template_version_id,
    )
    if (!t || (!t.enabled && t.template_version_id !== p?.template_version_id))
      throw issue('TEMPLATE_UNAVAILABLE')
    if (!b.name.trim() || !/^https?:\/\//.test(b.base_url)) throw issue('VALIDATION_FAILED', 422)
    if (store.providers.some((x) => x.id !== p?.id && x.name === b.name))
      throw issue('NAME_CONFLICT')
    const configured =
      p?.template_version_id === t.template_version_id ? [...p.configured_secret_fields] : []
    if (b.clear_secret_fields?.some((key) => b.secrets?.[key]))
      throw issue('VALIDATION_FAILED', 422)
    for (const key of b.clear_secret_fields ?? []) {
      const i = configured.indexOf(key)
      if (i >= 0) configured.splice(i, 1)
    }
    for (const [key, value] of Object.entries(b.secrets ?? {})) {
      if (!t.fields.some((f) => f.key === key && f.value_type === 'SECRET'))
        throw issue('VALIDATION_FAILED', 422)
      if (value && !configured.includes(key)) configured.push(key)
    }
    if (
      t.fields.some(
        (f) =>
          f.required &&
          (f.value_type === 'SECRET' ? !configured.includes(f.key) : !b.public_config[f.key]),
      )
    )
      throw issue('VALIDATION_FAILED', 422)
    if (b.balance_config) {
      version(b.balance_config.expected_version ?? 0, p ? balanceConfig(p.id).version : 0)
      validateBalance(p?.id ?? '', b.balance_config, t)
    }
    const changed =
      !p ||
      p.base_url !== b.base_url ||
      p.template_version_id !== b.template_version_id ||
      JSON.stringify(p.public_config) !== JSON.stringify(b.public_config) ||
      Object.values(b.secrets ?? {}).some(Boolean) ||
      !!b.clear_secret_fields?.length
    const saved = make<D.Provider>('Provider', {
      id: p?.id ?? uuid(`provider-${nextSequence('ma-provider')}`),
      name: b.name,
      base_url: b.base_url,
      public_config: b.public_config,
      notes: b.notes ?? null,
      security_level: b.security_level,
      template_key: t.key,
      template_name: t.name,
      template_icon_key: t.icon_key,
      template_revision: t.revision,
      template_version_id: t.template_version_id,
      catalog_release_id: t.catalog_release_id,
      configured_secret_fields: configured,
      connection_revision: (p?.connection_revision ?? 0) + (changed ? 1 : 0),
      version: (p?.version ?? 0) + 1,
      created_at: p?.created_at ?? timestamp(),
      updated_at: timestamp(),
      created_by: p?.created_by ?? identity.user_id!,
    })
    if (p) Object.assign(p, saved)
    else store.providers.push(saved)
    if (b.balance_config)
      saveBalance(saved.id, {
        ...b.balance_config,
        expected_version: b.balance_config.expected_version ?? 0,
      })
    return providerView(saved)
  }
  if (op === 'P06') {
    version(Number(query.expected_version), p!.version)
    const linked = store.models.filter((m) => m.provider_id === p!.id)
    if (linked.some((m) => !['DRAFT', 'RETIRED'].includes(m.status))) throw issue('STATE_CONFLICT')
    if (
      linked.some((m) =>
        [...store.jobs.values()].some(
          (j) => j.physical_model_id === m.id && ['QUEUED', 'RUNNING'].includes(j.status),
        ),
      )
    )
      throw issue('CHECK_IN_PROGRESS')
    linked.forEach(removeModel)
    store.providers.splice(store.providers.indexOf(p!), 1)
    store.configs.delete(p!.id)
    return { deleted: true }
  }
  if (op === 'M01') {
    const models = modelsFiltered(req).sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id),
    )
    return page(models.map(currentModel), req)
  }
  if (op === 'M02') {
    const items = modelsFiltered({ ...req, query: { ...query, provider_id: undefined } })
    return {
      total: items.length,
      providers: store.providers.map((p) => ({
        provider_id: p.id,
        provider_name: p.name,
        model_count: items.filter((m) => m.provider_id === p.id).length,
        template_name: p.template_name,
        template_icon_key: p.template_icon_key,
      })),
    }
  }
  if (op === 'M03') {
    const input = body as unknown as D.ModelCreate,
      provider = store.providers.find((p) => p.id === input.provider_id)
    if (!provider) throw issue('NOT_FOUND', 404)
    return createModel(input, provider)
  }
  if (op === 'M04') return currentModel(m!)
  if (op === 'M05') {
    const input = body as D.ModelUpdate
    if (!input.base && !input.metadata && !input.grants && !input.pricing && !input.health)
      throw issue('VALIDATION_FAILED', 422)
    if (input.base) {
      version(input.expected_base_version, m!.versions.base)
      if (m!.status !== 'DRAFT') throw issue('STATE_CONFLICT')
      if (
        !validModelId(input.base.model_id_at_gateway) ||
        store.models.some(
          (x) =>
            x.id !== m!.id &&
            x.model_id_at_gateway === normalizeModelId(input.base!.model_id_at_gateway),
        )
      )
        throw issue('NAME_CONFLICT')
      if (
        !input.base.supported_invocation_apis.length &&
        !input.base.custom_invocation_apis?.length
      )
        throw issue('VALIDATION_FAILED', 422)
    }
    if (input.metadata) {
      version(input.expected_metadata_version, m!.versions.metadata)
      for (const value of [input.metadata.context_window, input.metadata.max_output_tokens])
        if (value !== null && (!Number.isSafeInteger(value) || value <= 0))
          throw issue('VALIDATION_FAILED', 422)
    }
    if (input.grants) validateGrants(m!, input.grants)
    if (input.health) version(input.expected_health_config_version, m!.versions.health)
    if (input.pricing) checkPrice(input.pricing, { ...m!, ...input.base })
    // All domain checks precede mutation, preserving M05 atomicity.
    if (input.base) {
      const { custom_invocation_apis, ...base } = input.base
      Object.assign(m!, base, {
        model_id_at_gateway: normalizeModelId(base.model_id_at_gateway),
        custom_invocation_apis: (custom_invocation_apis ?? []).map((a) => ({
          id: a.id ?? uuid(`custom-${nextSequence('ma-custom')}`),
          path: a.path,
        })),
      })
      m!.versions.base++
      m!.invocation_apis = invocation(m!)
    }
    if (
      input.metadata &&
      Object.entries(input.metadata).some(
        ([key, value]) => JSON.stringify(value) !== JSON.stringify(m![key as keyof D.Model]),
      )
    ) {
      Object.assign(m!, input.metadata)
      m!.versions.metadata++
    }
    if (input.grants) grantDelta(m!, input.grants)
    if (input.pricing) savePrice(input.pricing, m!)
    if (input.health) {
      m!.health = input.health
      m!.versions.health++
    }
    m!.updated_at = timestamp()
    return currentModel(m!)
  }
  if (op === 'M06') {
    version(Number(query.expected_base_version), m!.versions.base)
    version(Number(query.expected_state_version), m!.versions.state)
    removeModel(m!)
    return { deleted: true }
  }
  if (op === 'M07') return currentModel(changeStatus(m!, body as unknown as D.StatusCommand))
  if (op === 'M08') {
    const provider = query.provider_id
      ? store.providers.find((item) => item.id === query.provider_id)
      : undefined
    if (query.provider_id && !provider) throw issue('NOT_FOUND', 404)
    const samples = modelCatalog.filter(
      (item) =>
        (!query.template_key || item.template_key === query.template_key) &&
        (!provider || item.template_key === provider.template_key) &&
        (!query.model_id_at_provider || item.model_id_at_provider === query.model_id_at_provider),
    )
    samples.sort(
      (a, b) =>
        a.template_key.localeCompare(b.template_key, 'en') ||
        a.model_id_at_provider.localeCompare(b.model_id_at_provider, 'en'),
    )
    const items = samples.map((sample) => {
      const template = templates.find((item) => item.key === sample.template_key)!
      const metrics = specs(sample.supported_invocation_apis)
      return make<D.ModelTemplate>('ModelTemplate', {
        template_key: template.key,
        model_id_at_provider: sample.model_id_at_provider,
        metadata: make<D.ModelMetadata>('ModelMetadata', {
          input_modalities: sample.input_modalities,
          output_modalities: sample.output_modalities,
          context_window: sample.context_window,
          max_output_tokens: sample.max_output_tokens,
          tags: sample.tags,
          description: sample.description,
          official_model_binding: unknownBinding(),
        }),
        suggested_invocation_apis: sample.supported_invocation_apis,
        metric_specs: metrics,
        builtin_pricing: null,
        pricing_state: 'NEEDS_CONFIGURATION',
        pricing_details_visible: true,
        catalog_model_version_id: uuid(
          `fixture-model-${sample.template_key}-${sample.model_id_at_provider}`,
        ),
        template_version_id: template.template_version_id,
        catalog_release_id: release,
        catalog_revision: revision,
      })
    })
    return { ...page(items, req), catalog_release_id: release, catalog_revision: revision }
  }
  if (op === 'M09')
    return page(
      store.providers
        .filter(
          (provider) =>
            !query.q ||
            [provider.name, provider.template_name].some((value) =>
              value.toLowerCase().includes(String(query.q).toLowerCase()),
            ),
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          template_key: p.template_key,
          template_name: p.template_name,
          template_icon_key: p.template_icon_key,
          base_url: p.base_url,
          security_level: p.security_level,
        })),
      req,
    )
  if (op === 'M10')
    return page(
      [...new Set(store.models.flatMap((m) => m.tags))]
        .filter((tag) => !query.q || tag.toLowerCase().includes(String(query.q).toLowerCase()))
        .map((value) => ({
          value,
          label: value,
          kind: 'CUSTOM',
        })),
      req,
    )
  if (op === 'M11') return page(store.events.get(m!.id) ?? [], req)
  if (op === 'M12') {
    const name = normalizeModelId(String(query.model_id_at_gateway ?? ''))
    if (query.exclude_model_id) {
      const excluded = store.models.find((m) => m.id === query.exclude_model_id)
      if (!excluded) throw issue('NOT_FOUND', 404)
      if (excluded.status !== 'DRAFT') throw issue('STATE_CONFLICT')
    }
    if (!validModelId(name)) throw issue('VALIDATION_FAILED', 422)
    return {
      normalized_model_id_at_gateway: name,
      available: !store.models.some(
        (m) => m.id !== query.exclude_model_id && m.model_id_at_gateway === name,
      ),
    }
  }
  if (op === 'M13' || op === 'M14') {
    const model =
      op === 'M14' && query.model_id
        ? store.models.find((item) => item.id === query.model_id)
        : undefined
    if (query.model_id && (!model || Object.keys(query).some((key) => key !== 'model_id')))
      throw issue(model ? 'MALFORMED_REQUEST' : 'NOT_FOUND', model ? 400 : 404)
    const provider = store.providers.find((p) => p.id === (model?.provider_id ?? query.provider_id))
    if (!provider) throw issue('NOT_FOUND', 404)
    const apis = model?.supported_invocation_apis ?? queryList(req, 'supported_invocation_apis')
    if (!model && !String(query.model_id_at_provider ?? '').trim())
      throw issue('VALIDATION_FAILED', 422)
    if (
      !apis.length &&
      !(model?.custom_invocation_apis.length ?? queryList(req, 'custom_api_paths').length)
    )
      throw issue('VALIDATION_FAILED', 422)
    const prepared = preparation(
      provider,
      model?.model_id_at_provider ?? String(query.model_id_at_provider),
      apis,
    )
    if (op === 'M13') return prepared
    const prefill = prepared.default_reference ? prepared.internal_pricing_prefill : null
    if (prefill && model) {
      prefill.expected_price_version = model.versions.price
      delete prefill.catalog_price_version_id
    }
    return {
      ...prepared,
      model_id: model?.id ?? null,
      state: !prepared.metric_specs.length
        ? 'NOT_APPLICABLE'
        : prepared.default_reference
          ? 'AVAILABLE'
          : 'NOT_CONFIGURED',
      internal_pricing_prefill: prefill,
    }
  }
  if (op === 'C01' || op === 'H01')
    return startJob(
      m!,
      op === 'C01' ? 'ADMISSION' : 'HEALTH',
      Number(body.expected_base_version),
      typeof body.reuse_job_id === 'string' ? body.reuse_job_id : undefined,
    )
  if (['C02', 'H02', 'C03', 'H05', 'C04', 'H03'].includes(op)) {
    const purpose = op.startsWith('C') ? 'ADMISSION' : 'HEALTH'
    const jobs = [...store.jobs.values()]
      .filter((j) => j.physical_model_id === m!.id && j.purpose === purpose)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, purpose === 'ADMISSION' ? 50 : 5)
      .map(progress)
    if (op === 'C02' || op === 'H02')
      return page(
        jobs.map((j) => ({ ...j, counts: j.summary })),
        req,
      )
    if (op === 'C04' || op === 'H03') return jobs[0] ?? null
    const job = jobs.find((j) => j.id === ids.test_id)
    if (!job) throw issue('NOT_FOUND', 404)
    return job
  }
  if (op === 'H04') {
    version(body.expected_health_config_version, m!.versions.health)
    m!.health = {
      auto_health_check: Boolean(body.auto_health_check),
      health_check_interval_minutes: Number(
        body.health_check_interval_minutes,
      ) as D.HealthInput['health_check_interval_minutes'],
    }
    m!.versions.health++
    return m
  }
  if (op === 'A01') {
    if (
      String(query.paginate) === 'false' &&
      (query.q !== undefined || query.subject_type !== undefined)
    )
      throw issue('VALIDATION_FAILED', 422)
    const items = (store.grants.get(m!.id) ?? [])
      .map(grantView)
      .filter((g) => !query.subject_type || g.subject_type === query.subject_type)
    return {
      ...page(items, req),
      grant_version: m!.versions.grants,
      authorization_version: store.authorizationVersion,
    }
  }
  if (op === 'A02') return grantDelta(m!, body as unknown as D.GrantDelta)
  if (op === 'A03') {
    const b = body as unknown as D.BatchGrantInput
    const models = b.models.map((row) => {
      const model = store.models.find((m) => m.id === row.physical_model_id)
      if (!model) throw issue('NOT_FOUND', 404)
      validateGrants(model, {
        expected_grant_version: row.expected_grant_version,
        add: b.add,
        remove_grant_ids: [],
      })
      return model
    })
    return {
      models: models.map((m) => ({
        physical_model_id: m.id,
        result: grantDelta(m, {
          expected_grant_version: m.versions.grants,
          add: b.add,
          remove_grant_ids: [],
          reason: b.reason,
        }),
      })),
    }
  }
  if (['A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A04', 'A11'].includes(op))
    return subjectOperation(op, req, ids)
  if (op === 'A12') {
    const type = String(query.subject_type ?? 'USER'),
      q = String(query.q ?? '').toLowerCase()
    const rows: D.SubjectView[] =
      type === 'USER'
        ? [...directory.values()].map((u) =>
            make<D.SubjectView>('SubjectView', {
              subject_type: 'USER',
              subject_id: u.id,
              name: u.display_name || u.username,
              username: u.username,
              manageable: true,
            }),
          )
        : type === 'DEPARTMENT'
          ? [...departments.values()]
              .filter((d) =>
                query.q ? true : query.parent_id ? d.parent_id === query.parent_id : !d.parent_id,
              )
              .map((d) =>
                make<D.SubjectView>('SubjectView', {
                  subject_type: 'DEPARTMENT',
                  subject_id: d.id,
                  name: d.name,
                  parent_id: d.parent_id,
                  manageable: true,
                  has_children: [...departments.values()].some((c) => c.parent_id === d.id),
                }),
              )
          : [...groups.values()].map((g) =>
              make<D.SubjectView>('SubjectView', {
                subject_type: 'USER_GROUP',
                subject_id: g.id,
                name: g.name,
                manageable: true,
              }),
            )
    return {
      ...page(
        rows.filter((s) => `${s.name} ${s.username ?? ''}`.toLowerCase().includes(q)),
        req,
      ),
      view_mode: type === 'DEPARTMENT' ? 'TREE_CHILDREN' : 'LIST',
    }
  }
  if (op === 'A13') {
    const subject = { subject_type: query.subject_type, subject_id: query.subject_id } as D.Subject
    if (!subjectExists(subject)) throw issue('NOT_FOUND', 404)
    return page(
      modelsFiltered(req)
        .filter(
          (m) =>
            m.status === 'ACTIVE' &&
            !(store.grants.get(m.id) ?? []).some(
              (g) => g.subject_type === subject.subject_type && g.subject_id === subject.subject_id,
            ),
        )
        .map(modelSummary),
      req,
    )
  }
  if (op === 'R01') return page(store.prices.get(m!.id) ?? [], req)
  if (op === 'R02') {
    const input = body as unknown as D.PricingInput
    checkPrice(input, m!)
    return savePrice(input, m!)
  }
  if (op === 'R03') {
    const price = store.prices.get(m!.id)?.[0] ?? null
    return {
      state: price ? 'PRICED' : 'UNPRICED',
      price,
      price_version: price?.version ?? 0,
      metric_specs: specs(m!.supported_invocation_apis),
      billing_currency: 'CNY',
      billing_time_zone: 'Asia/Shanghai',
      currency_source: 'DEFAULT_CNY',
      time_zone_source: 'DEFAULT_ASIA_SHANGHAI',
      unpriced_reason: price
        ? null
        : !m!.invocation_apis.length
          ? 'INTERFACES_NOT_CONFIGURED'
          : !specs(m!.supported_invocation_apis).length
            ? 'METRIC_SPEC_UNAVAILABLE'
            : 'PRICE_UNAVAILABLE',
    }
  }
  if (op === 'B01') return balanceConfig(p!.id)
  if (op === 'B02') {
    const input = body as unknown as D.BalanceConfigUpdate
    version(input.expected_version, balanceConfig(p!.id).version)
    validateBalance(p!.id, input, templateFor(p!))
    return saveBalance(p!.id, input)
  }
  if (op === 'B04') return balanceState(p!.id)
  if (op === 'B03') {
    const c = balanceConfig(p!.id)
    if (c.mode === 'NONE') throw issue('STATE_CONFLICT')
    const active = [...store.balanceRuns.values()].find(
      (r) => r.provider_id === p!.id && r.status === 'RUNNING',
    )
    if (active) return { run_id: active.id, status: 'RUNNING', deduplicated: true }
    const run = make<D.BalanceRun>('BalanceRun', {
      id: uuid(`balance-${nextSequence('ma-balance')}`),
      provider_id: p!.id,
      status: 'RUNNING',
      trigger_type: 'MANUAL',
      expected_currency_or_unit: c.currency_or_unit ?? '',
      started_at: timestamp(),
    })
    store.balanceRuns.set(run.id, run)
    store.balances.set(p!.id, {
      ...balanceState(p!.id),
      active_run_id: run.id,
      last_attempt_at: run.started_at,
    })
    return { run_id: run.id, status: 'RUNNING', deduplicated: false }
  }
  if (op === 'B05') {
    const run = store.balanceRuns.get(ids.run_id!)
    if (!run || run.provider_id !== p!.id) throw issue('NOT_FOUND', 404)
    if (run.status === 'RUNNING' && Date.now() - Date.parse(run.started_at) > 700) {
      const config = balanceConfig(p!.id)
      const failed =
        config.query_config.url?.includes('fail') || config.query_config.url?.includes('mismatch')
      run.status = failed ? 'FAILED' : 'SUCCESS'
      run.error_code = failed
        ? config.query_config.url?.includes('mismatch')
          ? 'BALANCE_CURRENCY_MISMATCH'
          : 'UPSTREAM_UNAVAILABLE'
        : null
      run.completed_at = timestamp()
      run.currency_or_unit = failed ? null : (config.currency_or_unit ?? null)
      run.balance_value = failed ? null : '36.58'
      store.balances.set(p!.id, {
        ...balanceState(p!.id),
        active_run_id: null,
        query_status: failed ? 'FAILED' : 'SUCCESS',
        error_code: run.error_code,
        ...(failed
          ? {}
          : {
              last_balance_value: run.balance_value,
              last_balance_unit: run.currency_or_unit,
              last_success_at: run.completed_at,
              alert_state:
                config.alert_enabled &&
                config.threshold &&
                decimalLessOrEqual(run.balance_value!, config.threshold)
                  ? 'LOW'
                  : 'NORMAL',
            }),
      })
    }
    return run
  }
  if (op === 'B06') {
    const keyword = String(query.q ?? '').toLowerCase()
    const departmentList = [...departments.values()]
    if (query.department_id && !departments.get(String(query.department_id)))
      throw issue('NOT_FOUND', 404)
    const within = (id: string | null | undefined, root: string): boolean => {
      const visited = new Set<string>()
      while (id && !visited.has(id)) {
        if (id === root) return true
        visited.add(id)
        id = departmentList.find((department) => department.id === id)?.parent_id
      }
      return false
    }
    const matchingDepartments = departmentList.filter(
      (department) => keyword && department.name.toLowerCase().includes(keyword),
    )
    const recipients = [...directory.values()]
      .map((u) => balanceRecipient(u.id))
      .filter(
        (u) =>
          u.selectable &&
          (!query.department_id ||
            within(
              [...directory.values()].find((user) => user.id === u.user_id)?.department_id,
              String(query.department_id),
            )) &&
          (!keyword ||
            matchingDepartments.some((department) =>
              within(
                [...directory.values()].find((user) => user.id === u.user_id)?.department_id,
                department.id,
              ),
            ) ||
            [u.display_name, u.username, u.email].some((value) =>
              value?.toLowerCase().includes(keyword),
            )),
      )
      .sort((a, b) =>
        `${a.display_name}:${a.username}:${a.user_id}`.localeCompare(
          `${b.display_name}:${b.username}:${b.user_id}`,
        ),
      )
    const provider = query.provider_id
      ? store.providers.find((item) => item.id === query.provider_id)
      : undefined
    if (query.provider_id && !provider) throw issue('NOT_FOUND', 404)
    return {
      ...page(recipients, req),
      selected_items: provider ? balanceConfig(provider.id).recipient_users : [],
    }
  }
  if (op.startsWith('D')) return discoveryOperation(op, req, p!, ids)
  throw issue('NOT_FOUND', 404)
}
function decimalLessOrEqual(a: string, b: string) {
  const scale = Math.max(a.split('.')[1]?.length ?? 0, b.split('.')[1]?.length ?? 0)
  const scaled = (v: string) => {
    const [whole, fraction = ''] = v.split('.')
    return BigInt(whole! + fraction.padEnd(scale, '0'))
  }
  return scaled(a) <= scaled(b)
}
function validateBalance(id: string, input: D.BalanceConfigInput, template: D.Template) {
  if (input.clear_secret_fields?.some((key) => input.secrets?.[key]))
    throw issue('VALIDATION_FAILED', 422)
  if (input.mode === 'TEMPLATE' && !template.balance_template_supported)
    throw issue('VALIDATION_FAILED', 422)
  if (input.mode === 'NONE' && input.alert_enabled) throw issue('VALIDATION_FAILED', 422)
  if (input.mode === 'CUSTOM') {
    const q = input.query_config
    if (
      !q ||
      !/^https?:\/\//.test(q.url ?? '') ||
      !input.currency_or_unit ||
      (q.calculation_mode === 'SUBTRACT' ? !q.total_path || !q.used_path : !q.value_path)
    )
      throw issue('VALIDATION_FAILED', 422)
    if (q.auth_type === 'HEADER' && !q.auth_header_name) throw issue('VALIDATION_FAILED', 422)
    if (
      q.auth_type !== 'NONE' &&
      !Object.values(input.secrets ?? {}).some(Boolean) &&
      !balanceConfig(id).configured_secret_fields.length
    )
      throw issue('VALIDATION_FAILED', 422)
  }
  if (input.alert_enabled) {
    if (
      !isDecimal(input.threshold) ||
      /^0(\.0+)?$/.test(input.threshold) ||
      !input.recipient_user_ids?.length ||
      !input.channels?.length
    )
      throw issue('VALIDATION_FAILED', 422)
    for (const id of input.recipient_user_ids) {
      const user = [...directory.values()].find((u) => u.id === id && u.status === 'ACTIVE')
      const email = existingState<{ id: string; email: string | null }[]>('users')?.find(
        (u) => u.id === id,
      )?.email
      if (!user || (input.channels.includes('EMAIL') && !email))
        throw issue('VALIDATION_FAILED', 422)
    }
  }
}
function saveBalance(id: string, input: D.BalanceConfigUpdate): D.BalanceConfig {
  const old = balanceConfig(id)
  const config: D.BalanceConfig = {
    provider_id: id,
    version: old.version + 1,
    mode: input.mode,
    currency_or_unit: input.currency_or_unit ?? null,
    query_config: input.query_config ?? old.query_config,
    configured_secret_fields: [
      ...new Set([
        ...old.configured_secret_fields.filter((k) => !input.clear_secret_fields?.includes(k)),
        ...Object.entries(input.secrets ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k),
      ]),
    ],
    alert_enabled: input.alert_enabled,
    threshold: input.threshold ?? null,
    recipient_user_ids: input.recipient_user_ids ?? [],
    channels: input.channels ?? [],
    notification_delivery_supported: false,
    recipient_users: [],
  }
  config.recipient_users = config.recipient_user_ids.map(balanceRecipient)
  store.configs.set(id, config)
  return config
}
function effectiveGrants(modelId: string, userId: string): D.Grant[] {
  const user = [...directory.values()].find((u) => u.id === userId)
  const ancestors = new Set<string>()
  let department = user?.department_id
  while (department && !ancestors.has(department)) {
    ancestors.add(department)
    department = (
      existingState<{ id: string; parent_id: string | null }[]>('departments') ?? []
    ).find((d) => d.id === department)?.parent_id
  }
  const memberships = (existingState<{ id: string; member_ids: string[] }[]>('groups') ?? [])
    .filter((g) => g.member_ids.includes(userId))
    .map((g) => g.id)
  return (store.grants.get(modelId) ?? []).filter(
    (g) =>
      subjectExists(g) &&
      (g.subject_type === 'USER'
        ? g.subject_id === userId
        : g.subject_type === 'DEPARTMENT'
          ? ancestors.has(g.subject_id)
          : memberships.includes(g.subject_id)),
  )
}
function subjectOperation(op: string, req: MockRequest, ids: Record<string, string>) {
  const subject: D.Subject = {
    subject_type: ids.user_id ? 'USER' : ids.department_id ? 'DEPARTMENT' : 'USER_GROUP',
    subject_id: ids.user_id ?? ids.department_id ?? ids.group_id!,
  }
  if (!subjectExists(subject)) throw issue('NOT_FOUND', 404)
  const current = store.authorizationVersion
  const granted = store.models.filter((m) =>
    op === 'A04' || op === 'A11'
      ? effectiveGrants(m.id, subject.subject_id).length > 0
      : (store.grants.get(m.id) ?? []).some(
          (g) => g.subject_type === subject.subject_type && g.subject_id === subject.subject_id,
        ),
  )
  if (['A06', 'A08', 'A10'].includes(op)) {
    const b = req.body as unknown as D.SubjectGrantReplace
    version(b.expected_authorization_version, current)
    if (b.physical_model_ids.some((id) => !store.models.some((m) => m.id === id)))
      throw issue('NOT_FOUND', 404)
    const changed_model_versions = []
    for (const m of store.models) {
      const existing = (store.grants.get(m.id) ?? []).filter(
        (g) => g.subject_type === subject.subject_type && g.subject_id === subject.subject_id,
      )
      const selected = b.physical_model_ids.includes(m.id)
      if (selected === !!existing.length) continue
      grantDelta(m, {
        expected_grant_version: m.versions.grants,
        add: selected ? [subject] : [],
        remove_grant_ids: selected ? [] : existing.map((g) => g.id),
      })
      changed_model_versions.push({ physical_model_id: m.id, grant_version: m.versions.grants })
    }
    return {
      authorization_version: store.authorizationVersion,
      physical_model_ids: b.physical_model_ids,
      changed_model_versions,
    }
  }
  if (op === 'A04' || op === 'A11')
    return page(
      granted.map((m) => ({
        model: modelSummary(m),
        sources: effectiveGrants(m.id, subject.subject_id).map((g) => ({
          grant_id: g.id,
          subject_type: g.subject_type,
          subject_id: g.subject_id,
          subject_name: subjectName(g),
          inherited: g.subject_type !== 'USER',
          subject_username: grantView(g).subject_username,
          subject_department_path: g.subject_department_path,
        })),
        available: m.status === 'ACTIVE',
        unavailable_reason: m.status === 'ACTIVE' ? null : 'MODEL_NOT_ACTIVE',
      })),
      req,
    )
  return { ...page(granted.map(modelSummary), req), authorization_version: current }
}
function discoveryMembership(data: D.Discovery, p: D.Provider): D.Discovery {
  data.items = data.items.map((item) => {
    const model = store.models.find(
      (m) => m.provider_id === p.id && m.model_id_at_provider === item.model_id_at_provider,
    )
    const conflict =
      !model && store.models.some((m) => m.model_id_at_gateway === item.suggested_gateway_name)
    return {
      ...item,
      already_added: !!model,
      existing_physical_model_id: model?.id ?? null,
      existing_model_id_at_gateway: model?.model_id_at_gateway ?? null,
      suggested_gateway_name_conflict: conflict,
      name_conflict_reason: conflict ? 'NAME_CONFLICT' : null,
    }
  })
  const added = data.items.filter((item) => item.already_added).length
  data.stats = {
    scope: 'LOADED',
    loaded: data.items.length,
    added,
    addable: data.items.length - added,
    name_conflicts: data.items.filter((item) => item.suggested_gateway_name_conflict).length,
  }
  return data
}
function discoveryOperation(
  op: string,
  req: MockRequest,
  p: D.Provider,
  ids: Record<string, string>,
): unknown {
  if (op === 'D01') {
    if (req.body?.resume_discovery_id) {
      const d = store.discoveries.get(String(req.body.resume_discovery_id))
      if (!d) throw issue('DISCOVERY_EXPIRED', 410)
      if (d.connection !== p.connection_revision) throw issue('DISCOVERY_STALE')
      return d.data
    }
    const samples = modelCatalog.filter((m) => m.template_key === p.template_key)
    const upstreams = new Map(
      samples.map((sample) => [
        sample.model_id_at_provider,
        {
          input_modalities: sample.input_modalities,
          output_modalities: sample.output_modalities,
          tags: sample.tags,
          context_window: sample.context_window,
          max_output_tokens: sample.max_output_tokens,
          description: sample.description,
        },
      ]),
    )
    for (const m of store.models.filter((m) => m.provider_id === p.id))
      upstreams.set(m.model_id_at_provider, {
        input_modalities: m.input_modalities,
        output_modalities: m.output_modalities,
        tags: m.tags,
        context_window: m.context_window,
        max_output_tokens: m.max_output_tokens,
        description: m.description ?? '',
      })
    const candidates = [...upstreams].map(([name, metadata]) =>
      make<D.DiscoveryItem>('DiscoveryItem', {
        model_id_at_provider: name,
        suggested_gateway_name: name,
        provider_model_name: name,
        catalog_model_version_id: samples.some((sample) => sample.model_id_at_provider === name)
          ? uuid(`fixture-model-${p.template_key}-${name}`)
          : null,
        metadata: make<D.ModelMetadata>('ModelMetadata', {
          ...metadata,
          official_model_binding: unknownBinding(),
        }),
      }),
    )
    const data = make<D.Discovery>('Discovery', {
      id: uuid(`discovery-${nextSequence('ma-discovery')}`),
      provider_id: p.id,
      status: 'SUCCESS',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      manual_entry_allowed: true,
      page: 1,
      page_size: 20,
      total: candidates.length,
      total_loaded: candidates.length,
      truncated: false,
      template_version_id: p.template_version_id,
      catalog_release_id: release,
      catalog_revision: revision,
      items: candidates,
    })
    discoveryMembership(data, p)
    store.discoveries.set(data.id, { data, connection: p.connection_revision })
    return data
  }
  if (op === 'D05') {
    const d = store.discoveries.get(ids.discovery_id!)
    if (!d || d.data.provider_id !== p.id) throw issue('NOT_FOUND', 404)
    discoveryMembership(d.data, p)
    return { ...d.data, ...page(d.data.items, req) }
  }
  if (op === 'D02') {
    const b = req.body as unknown as D.ImportInput
    version(b.expected_provider_version, p.version)
    if (b.discovery_id) {
      const d = store.discoveries.get(b.discovery_id)
      if (!d || Date.parse(d.data.expires_at) < Date.now()) throw issue('DISCOVERY_EXPIRED', 410)
      if (d.connection !== p.connection_revision) throw issue('DISCOVERY_STALE')
    }
    const items = b.models.map((input, input_index): D.ImportBatchItem => {
      const existing = store.models.find(
        (m) => m.provider_id === p.id && m.model_id_at_provider === input.model_id_at_provider,
      )
      if (existing)
        return {
          input_index,
          physical_model_id: existing.id,
          status: 'SKIPPED_EXISTING',
          code: 'OK',
          params: {},
          model: { ...existing, physical_model_id: existing.id },
        }
      try {
        if (input.pricing != null) throw issue('VALIDATION_FAILED', 422)
        if (
          b.models.filter(
            (x) =>
              normalizeModelId(x.model_id_at_gateway) ===
              normalizeModelId(input.model_id_at_gateway),
          ).length > 1
        )
          throw issue('NAME_CONFLICT')
        const metadata = b.discovery_id
          ? store.discoveries
              .get(b.discovery_id)
              ?.data.items.find(
                (candidate) => candidate.model_id_at_provider === input.model_id_at_provider,
              )?.metadata
          : undefined
        const model = createModel(
          {
            ...input,
            ...(metadata
              ? {
                  input_modalities: metadata.input_modalities,
                  output_modalities: metadata.output_modalities,
                  tags: metadata.tags,
                  context_window: metadata.context_window,
                  max_output_tokens: metadata.max_output_tokens,
                  description: metadata.description,
                }
              : {}),
            provider_id: p.id,
            pricing: null,
            expected_provider_version: b.expected_provider_version,
            supported_invocation_apis:
              input.supported_invocation_apis ?? templateFor(p).suggested_invocation_apis,
          },
          p,
          true,
        )
        return {
          input_index,
          physical_model_id: model.id,
          status: 'CREATED',
          code: 'OK',
          params: {},
          model: { ...model, physical_model_id: model.id },
        }
      } catch (e) {
        return {
          input_index,
          physical_model_id: null,
          status: 'REJECTED',
          code: (e as Error).message,
          params: {},
          model: null,
        }
      }
    })
    return {
      items,
      succeeded_count: items.filter((i) => i.status === 'CREATED').length,
      skipped_count: items.filter((i) => i.status === 'SKIPPED_EXISTING').length,
      failed_count: items.filter((i) => i.status === 'REJECTED').length,
    }
  }
  const input = req.body as unknown as D.ProviderAdmissionInput & D.PublishInput
  const items = input.models.map((row, input_index): D.BatchItem => {
    const m = store.models.find((m) => m.id === row.physical_model_id && m.provider_id === p.id)
    const original = m ? structuredClone(m) : undefined
    const prices = m ? structuredClone(store.prices.get(m.id)) : undefined
    try {
      if (!m) throw issue('NOT_FOUND', 404)
      let job: D.CheckJob | undefined
      if (op === 'D04')
        changeStatus(m, {
          action: 'APPROVE',
          expected_state_version: (row as unknown as D.ModelVersionRef).expected_state_version,
        })
      else {
        version(row.expected_base_version, m.versions.base)
        if (m.status !== 'DRAFT') throw issue('STATE_CONFLICT')
        if (
          [...store.jobs.values()].some(
            (j) => j.physical_model_id === m.id && ['QUEUED', 'RUNNING'].includes(j.status),
          )
        )
          throw issue('CHECK_IN_PROGRESS')
        const custom = row.custom_invocation_apis ?? []
        if (!row.supported_invocation_apis.length && !custom.length)
          throw issue('VALIDATION_FAILED', 422)
        const changed =
          JSON.stringify(row.supported_invocation_apis) !==
            JSON.stringify(m.supported_invocation_apis) ||
          JSON.stringify(custom.map((a) => a.path)) !==
            JSON.stringify(m.custom_invocation_apis.map((a) => a.path))
        if (changed) {
          m.supported_invocation_apis = row.supported_invocation_apis
          m.custom_invocation_apis = custom.map((a) => ({
            id: a.id ?? uuid(`custom-${nextSequence('ma-custom')}`),
            path: a.path,
          }))
          m.invocation_apis = invocation(m)
          m.versions.base++
        }
        job = startJob(m, 'ADMISSION', m.versions.base)
      }
      return {
        input_index,
        physical_model_id: m.id,
        status: job ? 'ACCEPTED' : 'UPDATED',
        code: 'OK',
        params: {},
        job_id: job?.id ?? null,
        model: { ...m, physical_model_id: m.id },
      }
    } catch (e) {
      if (m && original) {
        Object.assign(m, original)
        if (prices) store.prices.set(m.id, prices)
        else store.prices.delete(m.id)
      }
      return {
        input_index,
        physical_model_id: m?.id ?? null,
        status: 'REJECTED',
        code: (e as Error).message,
        params: {},
        job_id: null,
        model: null,
      }
    }
  })
  return {
    items,
    succeeded_count: items.filter((i) => i.status !== 'REJECTED').length,
    failed_count: items.filter((i) => i.status === 'REJECTED').length,
  }
}

// The operation registry is generated from the 55-row index in 04B.
const operations: {
  id: string
  method: 'get' | 'post' | 'put' | 'delete'
  path: string
  body: string | null
  output: string
}[] = [
  {
    id: 'P01',
    method: 'get',
    path: '/provider-templates',
    body: null,
    output: 'TemplateList',
  },
  {
    id: 'P02',
    method: 'get',
    path: '/providers',
    body: null,
    output: 'ProviderPage',
  },
  {
    id: 'P03',
    method: 'post',
    path: '/providers',
    body: 'ProviderCreate',
    output: 'Provider',
  },
  {
    id: 'P04',
    method: 'get',
    path: '/providers/{provider_id}',
    body: null,
    output: 'Provider',
  },
  {
    id: 'P05',
    method: 'put',
    path: '/providers/{provider_id}',
    body: 'ProviderUpdate',
    output: 'Provider',
  },
  {
    id: 'P06',
    method: 'delete',
    path: '/providers/{provider_id}',
    body: null,
    output: 'Deleted',
  },
  {
    id: 'D01',
    method: 'post',
    path: '/providers/{provider_id}/models/discover',
    body: 'DiscoveryInput',
    output: 'Discovery',
  },
  {
    id: 'D02',
    method: 'post',
    path: '/providers/{provider_id}/models/import',
    body: 'ImportInput',
    output: 'ImportBatchResult',
  },
  {
    id: 'D03',
    method: 'post',
    path: '/providers/{provider_id}/models/admission-tests',
    body: 'ProviderAdmissionInput',
    output: 'BatchResult',
  },
  {
    id: 'D04',
    method: 'post',
    path: '/providers/{provider_id}/models/publish',
    body: 'PublishInput',
    output: 'BatchResult',
  },
  {
    id: 'D05',
    method: 'get',
    path: '/providers/{provider_id}/model-discoveries/{discovery_id}',
    body: null,
    output: 'Discovery',
  },
  {
    id: 'M01',
    method: 'get',
    path: '/models',
    body: null,
    output: 'ModelPage',
  },
  {
    id: 'M02',
    method: 'get',
    path: '/models/summary',
    body: null,
    output: 'Summary',
  },
  {
    id: 'M03',
    method: 'post',
    path: '/models',
    body: 'ModelCreate',
    output: 'Model',
  },
  {
    id: 'M04',
    method: 'get',
    path: '/models/{model_id}',
    body: null,
    output: 'Model',
  },
  {
    id: 'M05',
    method: 'put',
    path: '/models/{model_id}',
    body: 'ModelUpdate',
    output: 'Model',
  },
  {
    id: 'M06',
    method: 'delete',
    path: '/models/{model_id}',
    body: null,
    output: 'Deleted',
  },
  {
    id: 'M07',
    method: 'put',
    path: '/models/{model_id}/status',
    body: 'StatusCommand',
    output: 'Model',
  },
  {
    id: 'M08',
    method: 'get',
    path: '/models/templates',
    body: null,
    output: 'ModelTemplatePage',
  },
  {
    id: 'M09',
    method: 'get',
    path: '/model-options/providers',
    body: null,
    output: 'ProviderOptionPage',
  },
  {
    id: 'M10',
    method: 'get',
    path: '/model-options/tags',
    body: null,
    output: 'TagOptionPage',
  },
  {
    id: 'M11',
    method: 'get',
    path: '/models/{model_id}/lifecycle-events',
    body: null,
    output: 'LifecycleEventPage',
  },
  {
    id: 'M12',
    method: 'get',
    path: '/model-options/model-id-availability',
    body: null,
    output: 'ModelIdAvailability',
  },
  {
    id: 'M13',
    method: 'get',
    path: '/model-options/pricing-preparation',
    body: null,
    output: 'PricingPreparation',
  },
  {
    id: 'M14',
    method: 'get',
    path: '/model-options/default-pricing',
    body: null,
    output: 'DefaultPricingPreparation',
  },
  {
    id: 'C01',
    method: 'post',
    path: '/models/{model_id}/admission-tests',
    body: 'CheckInput',
    output: 'CheckJob',
  },
  {
    id: 'C02',
    method: 'get',
    path: '/models/{model_id}/admission-tests',
    body: null,
    output: 'CheckJobPage',
  },
  {
    id: 'C03',
    method: 'get',
    path: '/models/{model_id}/admission-tests/{test_id}',
    body: null,
    output: 'CheckJob',
  },
  {
    id: 'C04',
    method: 'get',
    path: '/models/{model_id}/admission-tests/latest',
    body: null,
    output: 'CheckJob',
  },
  {
    id: 'H01',
    method: 'post',
    path: '/models/{model_id}/health-checks',
    body: 'HealthCheckInput',
    output: 'CheckJob',
  },
  {
    id: 'H02',
    method: 'get',
    path: '/models/{model_id}/health-checks',
    body: null,
    output: 'CheckJobPage',
  },
  {
    id: 'H03',
    method: 'get',
    path: '/models/{model_id}/health-checks/latest',
    body: null,
    output: 'CheckJob',
  },
  {
    id: 'H04',
    method: 'put',
    path: '/models/{model_id}/health-config',
    body: 'HealthConfigUpdate',
    output: 'Model',
  },
  {
    id: 'H05',
    method: 'get',
    path: '/models/{model_id}/health-checks/{test_id}',
    body: null,
    output: 'CheckJob',
  },
  {
    id: 'A01',
    method: 'get',
    path: '/models/{model_id}/permissions',
    body: null,
    output: 'GrantPage',
  },
  {
    id: 'A02',
    method: 'put',
    path: '/models/{model_id}/permissions',
    body: 'GrantDelta',
    output: 'GrantResult',
  },
  {
    id: 'A03',
    method: 'post',
    path: '/models/permissions/batch',
    body: 'BatchGrantInput',
    output: 'BatchGrantResult',
  },
  {
    id: 'A04',
    method: 'get',
    path: '/users/{user_id}/accessible-models',
    body: null,
    output: 'AccessibleModelPage',
  },
  {
    id: 'A05',
    method: 'get',
    path: '/users/{user_id}/model-grants',
    body: null,
    output: 'SubjectGrantPage',
  },
  {
    id: 'A06',
    method: 'put',
    path: '/users/{user_id}/model-grants',
    body: 'SubjectGrantReplace',
    output: 'SubjectGrantResult',
  },
  {
    id: 'A07',
    method: 'get',
    path: '/departments/{department_id}/model-grants',
    body: null,
    output: 'SubjectGrantPage',
  },
  {
    id: 'A08',
    method: 'put',
    path: '/departments/{department_id}/model-grants',
    body: 'SubjectGrantReplace',
    output: 'SubjectGrantResult',
  },
  {
    id: 'A09',
    method: 'get',
    path: '/groups/{group_id}/model-grants',
    body: null,
    output: 'SubjectGrantPage',
  },
  {
    id: 'A10',
    method: 'put',
    path: '/groups/{group_id}/model-grants',
    body: 'SubjectGrantReplace',
    output: 'SubjectGrantResult',
  },
  {
    id: 'A11',
    method: 'get',
    path: '/users/{user_id}/model-grant-sources',
    body: null,
    output: 'AccessibleModelPage',
  },
  {
    id: 'A12',
    method: 'get',
    path: '/model-permission-subjects',
    body: null,
    output: 'SubjectViewPage',
  },
  {
    id: 'A13',
    method: 'get',
    path: '/model-permission-models',
    body: null,
    output: 'ModelAuthorizationSummaryPage',
  },
  {
    id: 'R01',
    method: 'get',
    path: '/models/{model_id}/pricing',
    body: null,
    output: 'PricingVersionPage',
  },
  {
    id: 'R02',
    method: 'post',
    path: '/models/{model_id}/pricing',
    body: 'PricingInput',
    output: 'PricingVersion',
  },
  {
    id: 'R03',
    method: 'get',
    path: '/models/{model_id}/pricing/current',
    body: null,
    output: 'CurrentPricing',
  },
  {
    id: 'B01',
    method: 'get',
    path: '/providers/{provider_id}/balance-config',
    body: null,
    output: 'BalanceConfig',
  },
  {
    id: 'B02',
    method: 'put',
    path: '/providers/{provider_id}/balance-config',
    body: 'BalanceConfigUpdate',
    output: 'BalanceConfig',
  },
  {
    id: 'B03',
    method: 'post',
    path: '/providers/{provider_id}/balance-query',
    body: null,
    output: 'BalanceQueryReceipt',
  },
  {
    id: 'B04',
    method: 'get',
    path: '/providers/{provider_id}/balance',
    body: null,
    output: 'BalanceState',
  },
  {
    id: 'B05',
    method: 'get',
    path: '/providers/{provider_id}/balance-queries/{run_id}',
    body: null,
    output: 'BalanceRun',
  },
  {
    id: 'B06',
    method: 'get',
    path: '/balance-recipient-options',
    body: null,
    output: 'BalanceRecipientOptionPage',
  },
]
const retiredHandlers: MockMethod[] = [
  'models',
  'providers',
  'provider-templates',
  'model-metadata',
  'pricing-catalog',
  'logical-models',
].flatMap((resource) =>
  (['get', 'post', 'put', 'delete'] as const).flatMap((method) =>
    ['', '/:rest*'].map((suffix): MockMethod => ({
      url: `/api/v1/${resource}${suffix}`,
      method,
      response(this: RespThisType) {
        this.res.statusCode = 404
        return {
          ...fail('NOT_FOUND', ''),
          request_id: uuid(`request-${nextSequence('ma-request')}`),
        }
      },
    })),
  ),
)
export default operations
  .sort((a, b) => (a.path.match(/\{/g)?.length ?? 0) - (b.path.match(/\{/g)?.length ?? 0))
  .map((op): MockMethod => {
    const names = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)
    const pattern = new RegExp(`^/api/v1/model-access${op.path.replace(/\{[^}]+\}/g, '([^/]+)')}$`)
    return {
      url: `/api/v1/model-access${op.path.replace(/\{([^}]+)\}/g, ':$1')}`,
      method: op.method,
      response(this: RespThisType, req: MockRequest) {
        this.res.setHeader('Cache-Control', 'no-store')
        this.res.setHeader('Cache-Control', 'no-store')
        // vite-plugin-mock uses path params as query for writes. Parse the actual
        // URL so DELETE's documented version query is preserved as well.
        const url = new URL(req.url ?? '', 'http://mock.invalid')
        const query: MockRequest['query'] = { ...req.query }
        for (const key of new Set(url.searchParams.keys())) {
          const values = url.searchParams.getAll(key)
          query[key] = values.length > 1 ? values : values[0]
        }
        req = { ...req, query }
        try {
          if (!checkToken(req)) throw issue('UNAUTHENTICATED', 401)
          const account = mockAccounts.get(usernameFromToken(req) ?? '')
          const capabilities =
            account?.role === 'super_admin'
              ? CAPABILITIES
              : (mockRoles.get(account?.role ?? '') ?? [])
          const resource =
            op.id.startsWith('P') || op.id.startsWith('B') || ['D01', 'D02', 'D05'].includes(op.id)
              ? 'model.providers'
              : op.id.startsWith('R') || (op.id === 'M14' && req.query?.model_id)
                ? 'model.pricing'
                : op.id.startsWith('C') || ['H01', 'H02', 'H03', 'H05'].includes(op.id)
                  ? 'model.admission'
                  : op.id.startsWith('A')
                    ? 'model.permissions'
                    : op.id === 'D04' ||
                        (op.id === 'M07' &&
                          ['APPROVE', 'REJECT'].includes(String(req.body?.action)))
                      ? 'model.review'
                      : 'model.models'
          const allowed = (code: string, write = op.method !== 'get') =>
            capabilities.some((c) => c.resource_code === code && (write ? c.can_write : c.can_read))
          if (op.id !== 'M05' && !allowed(resource)) throw issue('FORBIDDEN', 403)
          if (
            op.id === 'M05' &&
            (((req.body?.base || req.body?.metadata || req.body?.health) &&
              !allowed('model.models')) ||
              (req.body?.grants && !allowed('model.permissions')) ||
              (req.body?.pricing && !allowed('model.pricing')))
          )
            throw issue('FORBIDDEN', 403)
          if (
            ['A04', 'A05', 'A06', 'A07', 'A08', 'A11'].includes(op.id) &&
            !allowed('identity.users')
          )
            throw issue('FORBIDDEN', 403)
          if (['A09', 'A10'].includes(op.id) && !allowed('identity.groups'))
            throw issue('FORBIDDEN', 403)
          if (
            (op.id === 'D02' && !allowed('model.models')) ||
            (op.id === 'D03' && !allowed('model.admission'))
          )
            throw issue('FORBIDDEN', 403)
          const actor = directory.get(usernameFromToken(req) ?? '')
          identity = make<D.IdentitySnapshot>('IdentitySnapshot', {
            kind: 'USER',
            user_id: actor?.id ?? null,
            username: actor?.username ?? null,
            display_name: actor?.display_name ?? null,
          })
          if (
            (op.id === 'M03' || op.id === 'M05' || op.id === 'D02') &&
            (req.body?.pricing ||
              (req.body?.models as { pricing?: unknown }[] | undefined)?.some((m) => m.pricing)) &&
            !allowed('model.pricing', true)
          )
            throw issue('FORBIDDEN', 403)
          if (op.id === 'M13' || (op.id === 'M14' && !req.query?.model_id)) {
            if (!allowed('model.models', true)) throw issue('FORBIDDEN', 403)
            const metrics = specs(queryList(req, 'supported_invocation_apis'))
            if (metrics.length && !allowed('model.pricing', false)) throw issue('FORBIDDEN', 403)
          }
          if (op.method !== 'get' && !checkCsrf(req)) throw issue('CSRF_INVALID', 403)
          if (op.body && !validBody(op.body, req.body)) throw issue('VALIDATION_FAILED', 422)
          const match = pattern.exec((req.url ?? '').split('?')[0]!)
          if (!match) throw issue('NOT_FOUND', 404)
          const ids = Object.fromEntries(
            names.map((key, i) => [key, decodeURIComponent(match[i + 1]!)]),
          )
          const key = String(req.headers?.['idempotency-key'] ?? '')
          const signature = JSON.stringify([op.id, ids, req.body, req.query])
          const commandKey = `${usernameFromToken(req)}:${key}`
          if (op.method !== 'get') {
            if (!key) throw issue('MALFORMED_REQUEST', 400)
            const previous = store.commands.get(commandKey)
            if (previous) {
              if (previous.signature !== signature) throw issue('IDEMPOTENCY_CONFLICT')
              this.res.statusCode = previous.status
              return success(
                localizeModelAccessResponse(
                  structuredClone(previous.data),
                  req.headers?.['accept-language'],
                ),
              )
            }
          }
          // Task progress depends on elapsed time, not the number of GETs.
          for (const job of store.jobs.values()) progress(job)
          const data = structuredClone(project(op.output, execute(op.id, req, ids)))
          if (op.output === 'CheckJob' && data && !allowed('model.pricing', false)) {
            const job = data as D.CheckJob
            job.pricing_details_visible = false
            job.items.forEach((item) => {
              item.cost = null
            })
            delete job.summary.cost_status
            delete job.summary.currency
            delete job.summary.known_amount
            delete job.summary.total_amount
          }
          const status = ['P03', 'M03', 'R02'].includes(op.id)
            ? 201
            : ['C01', 'H01', 'D03', 'B03'].includes(op.id)
              ? 202
              : 200
          this.res.statusCode = status
          if (op.method !== 'get') {
            store.commands.set(commandKey, { signature, data, status })
            const target = data as {
              id?: string
              name?: string
              model_id_at_gateway?: string
            } | null
            operationLogs.unshift({
              event_id: uuid(`audit-${nextSequence('ma-audit')}`),
              occurred_at: timestamp(),
              action: `model.${op.id}`,
              actor_user_id: identity.user_id,
              actor_username_snapshot: identity.username,
              actor_display_name_snapshot: identity.display_name,
              resource_id: target?.id ?? ids.model_id ?? ids.provider_id ?? null,
              resource_type: ids.provider_id || op.id.startsWith('P') ? 'provider' : 'model',
              target_display_name_snapshot: target?.model_id_at_gateway ?? target?.name ?? null,
              outcome: 'SUCCEEDED',
              reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
              request_id: uuid(`request-${nextSequence('ma-request')}`),
              changes: [],
            })
          }
          return {
            ...success(
              localizeModelAccessResponse(structuredClone(data), req.headers?.['accept-language']),
            ),
            request_id: uuid(`request-${nextSequence('ma-request')}`),
          }
        } catch (e) {
          const err = e as Error & { status?: number; params?: Record<string, unknown> }
          this.res.statusCode = err.status ?? 500
          return {
            ...fail(err.status ? err.message : 'INTERNAL_ERROR', '', err.params ?? {}),
            request_id: uuid(`request-${nextSequence('ma-request')}`),
          }
        }
      },
    }
  })
  .concat(retiredHandlers)
