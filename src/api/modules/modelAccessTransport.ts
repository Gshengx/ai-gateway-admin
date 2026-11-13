import { markRaw } from 'vue'
import { createIdempotencyKey, type RequestConfig } from '@/api/request'
import { matchesConditions } from '@/utils/modelTemplate'
import { modelAccessApi as api } from './modelAccessApi'
import type * as D from './modelAccessContract'
import {
  blankModel,
  blankProvider,
  blankPricing,
  type Model,
  type Provider,
  type Pricing,
  type Permission,
  type TestRun,
  type Candidate,
  type Subject,
  type Status,
  type Template,
} from './modelAccess'
import { normalizeModelId } from '@/utils/modelContract'

// View models describe the existing controls; only explicit new-contract DTOs cross HTTP.
const balanceAttempts = new Map<string, string>()
const modelVersions = new Map<string, D.ModelVersions>()
const modelFacts = new Map<string, D.Model>()
const providerFacts = new Map<string, D.Provider>()
const grantVersions = new Map<string, number>()
const grantLoads = new Map<string, Promise<D.GrantPage>>()
const balanceVersions = new Map<string, number>()
const balanceDrafts = new Map<string, string>()
const priceFacts = new Map<string, D.CurrentPricing>()
const templateFacts = new Map<string, D.Template>()
const preparations = new Map<string, D.PricingPreparation>()
const preparedKey = (provider: string, upstream: string) => `${provider}:${upstream}`
function balanceSignature(provider: Provider) {
  return JSON.stringify({
    mode: provider.balance_query_mode,
    query: { ...provider.balance_query_config, secret: '' },
    enabled: provider.balance_alert_enabled,
    threshold: String(provider.balance_alert_threshold),
    unit: provider.balance_alert_unit,
    recipients: provider.balance_alert_recipients,
    channels: provider.balance_alert_channels,
  })
}
const paged = <T extends { total: number; page_size: number | null; page?: number | null }>(
  data: T,
) => ({
  ...data,
  page: data.page ?? 1,
  page_size: data.page_size ?? Math.max(data.total, 1),
  total_pages: data.page_size === null ? 1 : Math.ceil(data.total / data.page_size),
})
function query(params: Record<string, unknown>) {
  const { search, ...rest } = params
  const values = { ...rest, ...(search ? { q: search } : {}) }
  const result = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    for (const item of Array.isArray(value) ? value : [value]) result.append(key, String(item))
  }
  return result
}
export function modelView(m: D.Model): Model {
  modelVersions.set(m.id, m.versions)
  if ('health' in m) modelFacts.set(m.id, m)
  return {
    ...blankModel(),
    ...m,
    description: 'description' in m ? (m.description ?? '') : '',
    custom_invocation_apis: ('custom_invocation_apis' in m ? m.custom_invocation_apis : []).map(
      (a) => ({ invocation_api: a.id, path: a.path }),
    ),
    ...('health' in m ? m.health : {}),
    admission_valid: m.status === 'PENDING_REVIEW',
    provider_name: m.provider_name,
  }
}
function providerView(p: D.Provider | D.ProviderListItem): Provider {
  if ('public_config' in p) providerFacts.set(p.id, p)
  const b = p.balance_summary
  return {
    ...blankProvider(),
    ...p,
    notes: p.notes ?? '',
    provider_config:
      'public_config' in p
        ? Object.fromEntries(
            Object.entries(p.public_config).map(([key, value]) => [
              key,
              typeof value === 'object' ? JSON.stringify(value) : String(value),
            ]),
          )
        : {},
    configured_secret_fields: 'configured_secret_fields' in p ? p.configured_secret_fields : [],
    balance_query_mode: b.mode,
    balance_alert_enabled: b.alert_enabled,
    balance_alert_threshold: b.threshold ?? '0',
    last_balance_value: b.last_balance_value,
    last_balance_unit: b.last_balance_unit,
    balance_alert_unit: b.last_balance_unit ?? '',
    last_balance_attempt_at: b.last_attempt_at,
    last_balance_success_at: b.last_success_at,
    balance_query_status: b.query_status,
    balance_query_error_code: b.error_code,
    alert_state: b.alert_state,
  }
}
const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
export function pricingView(
  price: D.PricingVersion | D.PricingInput | null,
  metrics: D.MetricSpec[] = [],
  currency = 'CNY',
): Pricing {
  const view = blankPricing()
  view.currency = price?.currency ?? currency
  if (!price) {
    view.metric_rates = metrics.map((m) => ({
      metric_key: m.metric_key,
      unit: m.unit,
      unit_price: null,
      period_prices: {},
      display_name: m.display_name,
      unit_label: m.unit_label,
    }))
    return view
  }
  view.version = 'version' in price ? price.version : price.expected_price_version
  view.source_type = 'source' in price ? price.source : 'ENTERPRISE_CUSTOM'
  view.pricing_mode = price.pricing_mode
  view.time_periods = price.periods.map((p, i) => ({
    id: String(i),
    name: p.name,
    is_fallback: p.is_fallback,
    conditions: p.conditions.map((c) => ({
      weekdays: [...c.weekdays],
      start: clock(c.start_minute),
      end: clock(c.end_minute),
    })),
  }))
  view.metric_rates = (price.periods[0]?.metric_rates ?? []).map((rate) => ({
    metric_key: rate.metric_key,
    unit: rate.unit,
    unit_price: rate.unit_price,
    period_prices: Object.fromEntries(
      price.periods.map((p, i) => [
        String(i),
        p.metric_rates.find((r) => r.metric_key === rate.metric_key)?.unit_price ?? null,
      ]),
    ),
    display_name:
      'display_name' in rate
        ? rate.display_name
        : metrics.find((m) => m.metric_key === rate.metric_key)?.display_name,
    unit_label:
      'unit_label' in rate
        ? rate.unit_label
        : metrics.find((m) => m.metric_key === rate.metric_key && m.unit === rate.unit)?.unit_label,
  }))
  if ('created_at' in price) {
    view.created_at = price.created_at
    view.created_by = price.created_by_display.display_name ?? ''
    view.id = price.id
  }
  view.catalog_price_version_id = price.catalog_price_version_id
  view.catalog_default_price_version_id = price.catalog_default_price_version_id
  return view
}
export function pricingInput(view: Pricing): D.PricingInput {
  return {
    expected_price_version: view.version,
    currency: view.currency,
    pricing_mode: view.pricing_mode,
    ...(view.catalog_default_price_version_id !== undefined
      ? { catalog_default_price_version_id: view.catalog_default_price_version_id }
      : {}),
    ...(view.catalog_price_version_id !== undefined
      ? { catalog_price_version_id: view.catalog_price_version_id }
      : {}),
    periods: (view.pricing_mode === 'FIXED'
      ? [view.time_periods.find((p) => p.is_fallback)!]
      : view.time_periods
    ).map((p) => ({
      name: p.name || 'Default',
      is_fallback: p.is_fallback,
      conditions:
        view.pricing_mode === 'FIXED'
          ? []
          : p.conditions.map((c) => ({
              weekdays: [...c.weekdays].sort((a, b) => a - b),
              start_minute: minute(c.start),
              end_minute: minute(c.end),
            })),
      metric_rates: view.metric_rates.map((r) => ({
        metric_key: r.metric_key,
        unit: r.unit,
        unit_price: String(
          view.pricing_mode === 'FIXED' ? (r.unit_price ?? '') : (r.period_prices[p.id] ?? ''),
        ),
      })),
    })),
  }
}
function baseInput(m: Model): D.ModelIdentityInput & D.ModelMetadataInput {
  return {
    provider_id: m.provider_id,
    model_id_at_gateway: normalizeModelId(m.model_id_at_gateway),
    model_id_at_provider: m.model_id_at_provider,
    supported_invocation_apis: m.supported_invocation_apis,
    custom_invocation_apis: m.custom_invocation_apis.map((a) => ({
      ...(a.invocation_api ? { id: a.invocation_api } : {}),
      path: a.path,
    })),
    input_modalities: m.input_modalities,
    output_modalities: m.output_modalities,
    context_window: m.context_window,
    max_output_tokens: m.max_output_tokens,
    tags: m.tags,
    description: m.description,
  }
}
export function testView(j: D.CheckJob | D.CheckJobSummary): TestRun {
  const status: TestRun['status'] =
    j.status === 'QUEUED' || j.status === 'RUNNING'
      ? 'RUNNING'
      : j.result === 'PASS'
        ? 'PASSED'
        : j.result === 'FAIL'
          ? 'FAILED'
          : 'ERROR'
  const counts = 'counts' in j ? j.counts : j.summary
  return {
    id: j.id,
    model_id: j.physical_model_id,
    purpose: j.purpose,
    trigger_type: j.trigger_type,
    invocation_api: j.invocation_apis[0]?.api_key ?? '',
    invocation_apis: j.invocation_apis.map((a) => a.api_key),
    status,
    counts: {
      passed_items: counts.passed_items,
      failed_items: counts.failed_items,
      error_items: counts.error_items,
      not_applicable_items: counts.not_applicable_items,
      reused_items: counts.reused_items,
      waiting_items: counts.waiting_items,
      running_items: counts.running_items,
    },
    checks:
      'items' in j
        ? j.items.map((i) => ({
            invocation_api: i.invocation_api.api_key,
            upstream_path: i.invocation_api.path ?? undefined,
            key: i.check_type === 'MODEL_REQUEST' ? 'CONNECTIVITY' : i.check_type,
            status: (
              {
                WAITING: 'PENDING',
                RUNNING: 'RUNNING',
                PASS: 'PASSED',
                FAIL: 'FAILED',
                ERROR: 'ERROR',
                NOT_APPLICABLE: 'NOT_APPLICABLE',
                REUSED: 'REUSED',
              } as const
            )[i.status],
            duration_ms: i.result_detail?.latency_ms ?? null,
            detail: i.result_detail?.detail_text ?? i.error_code ?? '',
            display_name: i.invocation_api.display_name,
          }))
        : [],
    billing_user: '',
    billing_department: '',
    started_at: j.started_at ?? j.created_at,
    completed_at: j.completed_at,
    triggered_by: j.triggered_by_display.display_name ?? '',
    dto: 'items' in j ? markRaw(j) : undefined,
  }
}
async function facts(id: string): Promise<D.Model> {
  const cached = modelFacts.get(id)
  if (cached) return cached
  const m = await api.M04(id)
  modelFacts.set(id, m)
  return m
}
export const transport = {
  tags: (q = '', config?: RequestConfig) => api.M10({ params: { q, paginate: false }, ...config }),
  metadata: async (provider_id: string, model_id_at_provider: string, config?: RequestConfig) => {
    const result = await api.M08({
      params: { provider_id, model_id_at_provider, paginate: false },
      ...config,
    })
    const found = result.items.find((m) => m.model_id_at_provider === model_id_at_provider)
    return {
      ...(found ? { ...found.metadata, description: found.metadata.description ?? '' } : {}),
      supported_invocation_apis: [...(found?.suggested_invocation_apis ?? [])],
    }
  },
  prepare: async (m: Model, config?: RequestConfig) => {
    const key = preparedKey(m.provider_id, m.model_id_at_provider)
    const params = new URLSearchParams({
      provider_id: m.provider_id,
      model_id_at_provider: m.model_id_at_provider,
    })
    m.supported_invocation_apis.forEach((a) => params.append('supported_invocation_apis', a))
    m.custom_invocation_apis.forEach((a) => params.append('custom_api_paths', a.path))
    const result = await api.M13({ params, ...config })
    preparations.set(key, result)
    return result
  },
  catalog: async (upstream: string, provider_id?: string) => {
    const prep = provider_id
      ? preparations.get(preparedKey(provider_id, upstream))
      : [...preparations.values()].find((p) => p.model_id_at_provider === upstream)
    if (!prep) return blankPricing()
    const view = pricingView(
      prep.internal_pricing_prefill,
      prep.metric_specs,
      prep.billing_currency,
    )
    view.catalog_price_version_id = prep.official_reference?.catalog_price_version_id ?? null
    view.catalog_default_price_version_id =
      prep.default_reference?.catalog_default_price_version_id ?? null
    return view
  },
  defaultPricing: async (model: Model) => {
    const params = new URLSearchParams()
    if (model.id) params.set('model_id', model.id)
    else {
      params.set('provider_id', model.provider_id)
      params.set('model_id_at_provider', model.model_id_at_provider)
      model.supported_invocation_apis.forEach((api) =>
        params.append('supported_invocation_apis', api),
      )
      model.custom_invocation_apis.forEach((api) => params.append('custom_api_paths', api.path))
    }
    const result = await api.M14({ params })
    return result.state === 'AVAILABLE' && result.internal_pricing_prefill
      ? pricingView(result.internal_pricing_prefill, result.metric_specs, result.billing_currency)
      : undefined
  },
  templates: async (provider_id?: string, config?: RequestConfig): Promise<Template[]> => {
    const data = await api.P01({ ...config, params: provider_id ? { provider_id } : undefined })
    data.items.forEach((t) => templateFacts.set(t.template_version_id, t))
    return data.items.map((t) => ({
      ...t,
      template_key: t.key,
      base_url: t.default_base_url ?? '',
      fields: t.fields.map((f) => ({
        ...f,
        conditions: { visible: f.visible_when, required: f.required_when },
        dto: {
          control: f.control,
          options: f.options,
          value_type: f.value_type,
          validation_schema: f.validation_schema,
        },
        secret: f.value_type === 'SECRET',
        default_value:
          f.default === null
            ? undefined
            : typeof f.default === 'object'
              ? JSON.stringify(f.default)
              : String(f.default),
      })),
    }))
  },
  providers: async (params: Record<string, unknown>, config?: RequestConfig) => {
    const data = await api.P02({ ...config, params: query(params) })
    return { ...paged(data), items: data.items.map(providerView) }
  },
  providerOptions: async (params: Record<string, unknown>, config?: RequestConfig) => {
    const filters = { ...params }
    delete filters.page
    delete filters.page_size
    const data = await api.M09({ ...config, params: { ...filters, paginate: false } })
    return { ...paged(data), items: data.items.map((p) => ({ ...blankProvider(), ...p })) }
  },
  summary: (params: Record<string, unknown>, config?: RequestConfig) =>
    api.M02({ ...config, params: query(params) }),
  provider: async (id: string, config?: RequestConfig) => {
    const [p, b] = await Promise.all([api.P04(id, config), api.B01(id, config)])
    const view = providerView(p)
    balanceVersions.set(id, b.version)
    Object.assign(view, {
      balance_query_mode: b.mode,
      balance_alert_enabled: b.alert_enabled,
      balance_alert_threshold: b.threshold ?? '0',
      balance_alert_unit: b.currency_or_unit ?? '',
      balance_alert_recipients: b.recipient_user_ids,
      balance_alert_channels: b.channels,
      recipient_users: b.recipient_users,
      configured_balance_secret_fields: b.configured_secret_fields,
    })
    if (b.query_config)
      view.balance_query_config = {
        method: b.query_config.method ?? 'GET',
        url: b.query_config.url ?? '',
        auth:
          b.query_config.auth_type === 'TEMPLATE' ? 'NONE' : (b.query_config.auth_type ?? 'NONE'),
        header: b.query_config.auth_header_name ?? '',
        secret: '',
        unit: b.currency_or_unit ?? '',
        mapping: b.query_config.calculation_mode === 'SUBTRACT' ? 'SUBTRACT' : 'AVAILABLE',
        available_path: b.query_config.value_path ?? '',
        total_path: b.query_config.total_path ?? '',
        used_path: b.query_config.used_path ?? '',
        body: b.query_config.body ? JSON.stringify(b.query_config.body) : '',
      }
    balanceDrafts.set(id, balanceSignature(view))
    return view
  },
  saveProvider: async (p: Provider) => {
    const t =
      [...templateFacts.values()].find((t) => t.template_version_id === p.template_version_id) ??
      [...templateFacts.values()].find((t) => t.key === p.template_key)
    if (!t) throw new Error('TEMPLATE_UNAVAILABLE')
    const secrets: Record<string, string> = {},
      public_config: D.ProviderPublicConfig = {}
    for (const f of t.fields) {
      if (!matchesConditions(f.visible_when, p.provider_config)) continue
      const value = p.provider_config[f.key]
      if (value !== undefined) {
        if (f.value_type === 'SECRET') {
          if (value) secrets[f.key] = value
        } else {
          const original = providerFacts.get(p.id)?.public_config[f.key]
          const originalInput =
            typeof original === 'object' ? JSON.stringify(original) : String(original)
          public_config[f.key] =
            original !== undefined &&
            originalInput === value &&
            providerFacts.get(p.id)?.template_version_id === t.template_version_id
              ? original
              : f.value_type === 'INTEGER'
                ? Number(value)
                : f.value_type === 'BOOLEAN'
                  ? value === 'true'
                  : f.value_type === 'JSON'
                    ? JSON.parse(value)
                    : value
        }
      }
    }
    const b = p.balance_query_config
    const alertEnabled = p.balance_query_mode !== 'NONE' && p.balance_alert_enabled
    const balance: D.BalanceConfigInput = {
      ...(p.id ? { expected_version: balanceVersions.get(p.id) ?? 0 } : {}),
      mode: p.balance_query_mode,
      ...(p.balance_query_mode !== 'NONE'
        ? { currency_or_unit: p.balance_alert_unit || b.unit || null }
        : {}),
      alert_enabled: alertEnabled,
      threshold: alertEnabled ? String(p.balance_alert_threshold) : null,
      recipient_user_ids: p.balance_alert_recipients,
      channels: p.balance_alert_channels,
    }
    if (balance.mode === 'CUSTOM')
      balance.query_config = {
        method: b.method,
        url: b.url,
        auth_type: b.auth,
        auth_header_name: b.header || null,
        value_path: b.available_path || null,
        currency_path: null,
        calculation_mode: b.mapping === 'AVAILABLE' ? 'DIRECT' : 'SUBTRACT',
        total_path: b.total_path || null,
        used_path: b.used_path || null,
        body: b.body ? JSON.parse(b.body) : null,
        template_parameters: {},
      }
    if (b.secret)
      balance.secrets = b.auth === 'HEADER' ? { header_value: b.secret } : { token: b.secret }
    const input: D.ProviderCreate = {
      name: p.name,
      template_key: t.key,
      template_version_id: t.template_version_id,
      base_url: p.base_url,
      security_level: p.security_level,
      public_config,
      ...(Object.keys(secrets).length ? { secrets } : {}),
      notes: p.notes,
      clear_secret_fields: p.clear_secret_fields ?? [],
      ...(!p.id || b.secret || balanceDrafts.get(p.id) !== balanceSignature(p)
        ? { balance_config: balance }
        : {}),
    }
    const result = p.id
      ? await api.P05(p.id, { ...input, expected_version: providerFacts.get(p.id)!.version })
      : await api.P03(input)
    return providerView(result)
  },
  removeProvider: async (id: string, reason: string) => {
    void reason
    const p = providerFacts.get(id) ?? (await api.P04(id))
    return api.P06(id, { params: { expected_version: p.version } })
  },
  balance: async (id: string, signal?: AbortSignal) => {
    const state = await api.B04(id)
    const key = balanceAttempts.get(id) ?? createIdempotencyKey()
    balanceAttempts.set(id, key)
    const receipt = state.active_run_id
      ? { run_id: state.active_run_id }
      : await api.B03(id, {}, { idempotencyKey: key })
    let result = await api.B05(id, receipt.run_id, { signal })
    const deadline = Date.now() + 300000
    while (result.status === 'RUNNING') {
      await new Promise((resolve) => setTimeout(resolve, 800))
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (Date.now() > deadline) throw new Error('OPERATION_RESULT_UNKNOWN')
      result = await api.B05(id, receipt.run_id, { signal })
    }
    balanceAttempts.delete(id)
    return transport.provider(id)
  },
  discover: async (id: string, resume_discovery_id?: string) => {
    const result = await api.D01(id, resume_discovery_id ? { resume_discovery_id } : {})
    return {
      ...result,
      discovery_id: result.id,
      items: result.items.map((c): Candidate => ({
        ...c.metadata,
        model_id_at_provider: c.model_id_at_provider,
        model_id_at_gateway: c.suggested_gateway_name,
        display_name: c.provider_model_name ?? c.model_id_at_provider,
        supported_invocation_apis: [],
        custom_invocation_apis: [],
        already_added: c.already_added,
      })),
    }
  },
  import: async (
    id: string,
    discovery_id: string,
    items: Candidate[],
    providerVersion: number | undefined,
  ) => {
    if (!providerVersion) throw new Error('VERSION_CONFLICT')
    const result = await api.D02(id, {
      discovery_id: discovery_id || null,
      expected_provider_version: providerVersion,
      models: items.map((c) => ({
        model_id_at_provider: c.model_id_at_provider,
        model_id_at_gateway: normalizeModelId(c.model_id_at_gateway),
        supported_invocation_apis: c.supported_invocation_apis,
        custom_invocation_apis: c.custom_invocation_apis.map((a) => ({ path: a.path })),
      })),
    })
    result.items.forEach((item) => {
      if (item.model) modelVersions.set(item.model.physical_model_id, item.model.versions)
    })
    const models = result.items.flatMap((item) => {
      if (!item.model) return []
      const summary = item.model
      const candidate = items[item.input_index]
      const model: Model = {
        ...blankModel(),
        ...candidate,
        ...summary,
        id: summary.physical_model_id,
        admission_valid: summary.status === 'PENDING_REVIEW',
        custom_invocation_apis: summary.custom_invocation_apis.map((a) => ({
          invocation_api: a.id,
          path: a.path,
        })),
      }
      return [model]
    })
    return {
      items: models,
      result,
    }
  },
  onboardingTests: async (provider: string, models: Model[], idempotencyKey?: string) =>
    api.D03(
      provider,
      {
        models: await Promise.all(
          models.map(async (m) => ({
            physical_model_id: m.id,
            expected_base_version:
              modelVersions.get(m.id)?.base ?? (await facts(m.id)).versions.base,
            supported_invocation_apis: m.supported_invocation_apis,
            custom_invocation_apis: m.custom_invocation_apis.map((a) => ({
              id: a.invocation_api || undefined,
              path: a.path,
            })),
          })),
        ),
      },
      { idempotencyKey },
    ),
  publishBatch: async (provider: string, models: Model[]) =>
    api.D04(provider, {
      models: await Promise.all(
        models.map(async (m) => ({
          physical_model_id: m.id,
          expected_state_version:
            modelVersions.get(m.id)?.state ?? (await facts(m.id)).versions.state,
        })),
      ),
    }),
  models: async (params: Record<string, unknown>, config?: RequestConfig) => {
    const result = await api.M01({ ...config, params: query(params) })
    result.items.forEach((model) => modelVersions.set(model.id, model.versions))
    return { ...paged(result), items: result.items }
  },
  model: async (id: string, includeLifecycle = true, config?: RequestConfig) => {
    const [m, events] = await Promise.all([
      api.M04(id, config),
      includeLifecycle
        ? api.M11(id, { ...config, params: { page: 1, page_size: 100 } })
        : undefined,
    ])
    const view = modelView(m)
    view.lifecycle_events = events?.items.map((e) => ({
      action: e.action === 'CREATED' ? 'CREATE' : 'STATUS',
      fromStatus: e.from_status,
      status: e.to_status,
      created_at: e.occurred_at,
      actor: e.actor.display_name ?? e.actor.username ?? '',
      reason: e.reason ?? '',
    }))
    return view
  },
  saveModel: async (
    m: Model,
    options: {
      price?: Pricing
      grants?: Permission[]
      original?: Model
      removeGrantIds?: string[]
    } = {},
  ) => {
    const health = {
      auto_health_check: m.auto_health_check,
      health_check_interval_minutes:
        m.health_check_interval_minutes as D.HealthInput['health_check_interval_minutes'],
    }
    if (!m.id) {
      const prep =
        preparations.get(preparedKey(m.provider_id, m.model_id_at_provider)) ??
        (await transport.prepare(m))
      const pricing = options.price?.metric_rates.length
        ? pricingInput(options.price)
        : prep.metric_specs.length
          ? prep.internal_pricing_prefill
          : null
      return modelView(
        await api.M03({
          ...baseInput(m),
          catalog_model_version_id: undefined,
          pricing,
          health,
          expected_provider_version: prep.provider_version,
          initial_grants: (options.grants ?? []).map((g) => ({
            subject_type: g.subject_type,
            subject_id: g.subject_id,
          })),
        }),
      )
    }
    const original = await facts(m.id),
      input: D.ModelUpdate = {}
    const {
      input_modalities,
      output_modalities,
      context_window,
      max_output_tokens,
      tags,
      description,
      ...base
    } = baseInput(m)
    const metadata = {
      input_modalities,
      output_modalities,
      context_window,
      max_output_tokens,
      tags,
      description,
    }
    const originalBase = baseInput(modelView(original))
    if (
      Object.entries(base).some(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(originalBase[key as keyof D.ModelBase]),
      )
    ) {
      input.base = { ...base, custom_invocation_apis: base.custom_invocation_apis ?? [] }
      input.expected_base_version = original.versions.base
    }
    if (
      Object.entries(metadata).some(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(originalBase[key as keyof D.ModelBase]),
      )
    ) {
      input.metadata = metadata
      input.expected_metadata_version = original.versions.metadata
    }
    if (JSON.stringify(health) !== JSON.stringify(original.health)) {
      input.health = health
      input.expected_health_config_version = original.versions.health
    }
    if (options.price) input.pricing = pricingInput(options.price)
    if (options.grants || options.removeGrantIds?.length)
      input.grants = {
        expected_grant_version: grantVersions.get(m.id) ?? original.versions.grants,
        add: (options.grants ?? [])
          .filter((g) => !g.created_at)
          .map((g) => ({ subject_type: g.subject_type, subject_id: g.subject_id })),
        remove_grant_ids: options.removeGrantIds ?? [],
      }
    if (!Object.keys(input).length) return modelView(original)
    return modelView(await api.M05(m.id, input))
  },
  removeModel: async (id: string, reason: string) => {
    void reason
    const m = await facts(id)
    return api.M06(id, {
      params: {
        expected_base_version: modelVersions.get(id)?.base ?? m.versions.base,
        expected_state_version: modelVersions.get(id)?.state ?? m.versions.state,
      },
    })
  },
  status: async (id: string, status: Status, reason: string) => {
    const m = await facts(id)
    const action: D.StatusCommand['action'] =
      status === 'ACTIVE'
        ? m.status === 'SUSPENDED'
          ? 'RESUME'
          : 'APPROVE'
        : status === 'SUSPENDED'
          ? 'SUSPEND'
          : status === 'RETIRED'
            ? 'RETIRE'
            : m.status === 'RETIRED'
              ? 'REACTIVATE'
              : 'REJECT'
    return modelView(
      await api.M07(id, {
        action,
        expected_state_version: modelVersions.get(id)?.state ?? m.versions.state,
        ...(reason ? { reason } : {}),
      }),
    )
  },
  startTest: async (
    id: string,
    purpose: 'ADMISSION' | 'HEALTH',
    _checks: string[],
    idempotencyKey?: string,
  ) => {
    const m = await facts(id)
    return testView(
      await (purpose === 'HEALTH' ? api.H01 : api.C01)(
        id,
        { expected_base_version: modelVersions.get(id)?.base ?? m.versions.base },
        { idempotencyKey },
      ),
    )
  },
  test: async (id: string, purpose: 'ADMISSION' | 'HEALTH', run: string, signal?: AbortSignal) => {
    const job = await (purpose === 'HEALTH' ? api.H05 : api.C03)(id, run, { signal })
    return testView(job)
  },
  latest: async (id: string, purpose: 'ADMISSION' | 'HEALTH') => {
    const job = await (purpose === 'ADMISSION' ? api.C04 : api.H03)(id)
    return job ? testView(job) : null
  },
  history: async (
    id: string,
    purpose: 'ADMISSION' | 'HEALTH',
    page = 1,
    page_size = 20,
    config?: RequestConfig,
  ) => {
    const result = await (purpose === 'HEALTH' ? api.H02 : api.C02)(id, {
      ...config,
      params: { page, page_size },
    })
    return { ...paged(result), items: result.items.map(testView) }
  },
  permissions: async (id: string, page = 1, subject_type?: Subject, page_size = 20) => {
    const result = await api.A01(id, { params: { page, page_size, subject_type } })
    grantVersions.set(id, result.grant_version)
    return paged(result)
  },
  permissionSet: async (id: string, subject_type: Subject, config?: RequestConfig) => {
    // All subject partitions share one complete, version-consistent baseline per load.
    let pending = grantLoads.get(id)
    if (!pending) {
      pending = api
        .A01(id, { ...config, signal: undefined, params: { paginate: false } })
        .finally(() => grantLoads.delete(id))
      grantLoads.set(id, pending)
    }
    const result = await pending
    if (config?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (result.items.length !== result.total) throw new Error('Incomplete authorization collection')
    grantVersions.set(id, result.grant_version)
    return { ...result, items: result.items.filter((grant) => grant.subject_type === subject_type) }
  },
  grant: async (id: string, items: Pick<Permission, 'subject_type' | 'subject_id'>[]) => {
    const result = await api.A02(id, {
      expected_grant_version: grantVersions.get(id) ?? (await facts(id)).versions.grants,
      add: items.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
      remove_grant_ids: [],
    })
    grantVersions.set(id, result.grant_version)
    return result
  },
  batchGrant: async (ids: string[], items: Pick<Permission, 'subject_type' | 'subject_id'>[]) => {
    const result = await api.A03({
      models: await Promise.all(
        ids.map(async (id) => ({
          physical_model_id: id,
          expected_grant_version:
            grantVersions.get(id) ??
            modelVersions.get(id)?.grants ??
            (await facts(id)).versions.grants,
        })),
      ),
      add: items.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
    })
    result.models.forEach(({ physical_model_id, result }) =>
      grantVersions.set(physical_model_id, result.grant_version),
    )
    return result
  },
  revoke: async (id: string, ids: string[], reason: string) => {
    const result = await api.A02(id, {
      expected_grant_version: grantVersions.get(id) ?? (await facts(id)).versions.grants,
      add: [],
      remove_grant_ids: ids,
      reason,
    })
    grantVersions.set(id, result.grant_version)
    return result
  },
  pricing: async (id: string, config?: RequestConfig) => {
    const p = await api.R03(id, config)
    priceFacts.set(id, p)
    return pricingView(p.price, p.metric_specs, p.billing_currency)
  },
  prices: async (id: string, page = 1, page_size = 20, config?: RequestConfig) => {
    const p = await api.R01(id, { ...config, params: { page, page_size } })
    return { ...paged(p), items: p.items.map((p) => pricingView(p)) }
  },
  savePrice: async (id: string, price: Pricing) =>
    pricingView(await api.R02(id, pricingInput(price))),
  syncPrice: async (id: string) => transport.pricing(id),
}
