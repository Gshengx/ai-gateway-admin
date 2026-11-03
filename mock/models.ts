import {
  checkCsrf,
  checkToken,
  fail,
  mockId,
  success,
  unauthorized,
  type MockMethod,
  type MockRequest,
} from './_utils'
import type {
  PhysicalModelItem,
  ModelStatus,
  ModelPricingBody,
  AdmissionRun,
  AdmissionCheck,
} from '../src/api/modules/models'
import type { ProviderItem, ProviderTemplate } from '../src/api/modules/providers'
import type { RespThisType } from 'vite-plugin-mock'
import { logicalState } from './_logical'
import type {
  LogicalModel,
  LogicalModelPermission,
  SubjectType,
} from '../src/api/modules/logicalModels'

// 仅由 dev:mock 加载。字段与已核实的模型、检测及审核接口一致。
const providerId = mockId('model-provider-openai')
const capabilities = {
  context_window: '128000',
  max_output_tokens: '16384',
  supports_streaming: true,
  supports_tool_calling: false,
  supports_json_mode: false,
  supports_vision: false,
}
let sequence = 0
const models: PhysicalModelItem[] = (
  ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'RETIRED', 'SUSPENDED'] as ModelStatus[]
).map((status, index) => ({
  id: mockId(`physical-model-${index}`),
  provider_id: providerId,
  model_id_at_provider: ['gpt-4o-mini', 'qwen-max', 'gpt-4o', 'retired-model', 'suspended-model'][
    index
  ],
  model_type: 'LLM',
  invocation_api: 'CHAT_COMPLETIONS',
  operation_profile: 'chat_completions',
  invocation_config: {},
  status,
  declared_capabilities: { ...capabilities },
  verified_capabilities:
    status === 'DRAFT'
      ? {
          context_window: null,
          max_output_tokens: null,
          supports_streaming: null,
          supports_tool_calling: null,
          supports_json_mode: null,
          supports_vision: null,
        }
      : { ...capabilities },
  capability_sources: [],
  admission_generation: '1',
  admission_valid: ['ACTIVE', 'PENDING_REVIEW', 'SUSPENDED'].includes(status),
  invalid_reason: null,
  state_reason: null,
  allowed_commands: [],
  description: '',
  mounts:
    index < 3
      ? [
          {
            logical_model_id: mockId(`logical-${index}`),
            logical_name: ['gpt-4o-mini', 'qwen-max', 'gpt-4o'][index],
            display_name: ['gpt-4o-mini', 'qwen-max', 'gpt-4o'][index],
            priority: 1,
          },
        ]
      : [],
}))
const logical: LogicalModel[] = models.flatMap((m) =>
  m.mounts.map((x) => ({
    id: x.logical_model_id,
    logical_name: x.logical_name,
    display_name: x.display_name,
    localized_name: x.display_name,
    description: '',
    localized_description: '',
    status: 'ACTIVE',
    workload_kind: 'TEXT_GENERATION',
    translations: [],
    ready: false,
    mounts: [] as { physical_model_id: string; priority: number }[],
    candidate_count: 0,
    created_at: '2026-08-12T03:00:00Z',
  })),
)
logicalState.models = models
logicalState.logical = logical
const grants = logicalState.grants
// mock 热重载重建种子模型时同步重置授权，避免旧 ID 的授权落入新建模型。
grants.length = 0
function logicalRecord(id: string) {
  const l = logical.find((x) => x.id === id)
  if (!l) return undefined
  const mounted = models.filter((m) => m.mounts.some((x) => x.logical_model_id === id))
  return {
    ...l,
    ready: mounted.some((m) => m.status === 'ACTIVE'),
    candidate_count: mounted.length,
    mounts: mounted
      .map((m) => ({
        physical_model_id: m.id,
        priority: m.mounts.find((x) => x.logical_model_id === id)!.priority,
      }))
      .sort((a, b) => a.priority - b.priority),
  }
}
function addRelations(id: string, relations: { subject_id: string; subject_type: SubjectType }[]) {
  for (const r of relations) {
    if (
      !grants.some(
        (g) =>
          g.logical_model_id === id &&
          g.subject_type === r.subject_type &&
          g.subject_id === r.subject_id,
      )
    )
      grants.push({
        ...r,
        logical_model_id: id,
        grant_id: mockId(`grant-${id}-${r.subject_type}-${r.subject_id}`),
      })
  }
}
function logicalId(req: MockRequest) {
  return (req.url || '').split('?')[0].split('/')[4]
}
const prices = new Map<string, ModelPricingBody>()
const priceHistory = new Map<string, Record<string, unknown>[]>()
const runs = new Map<string, AdmissionRun>()
const runHistory = new Map<string, AdmissionRun[]>()
const jobs = new Map<
  string,
  {
    modelId: string
    run: AdmissionRun
    started: number
    fail: boolean
    checks: string[]
    budgetBatchId: string
  }
>()
const template: ProviderTemplate = {
  template_key: 'openai',
  display_name: 'OpenAI',
  version: 'v1.0',
  default_base_url: 'https://api.openai.com/v1',
  discovery_supported: true,
  contract_state: 'planned_local_protocol',
  fields: [],
  variants: [
    {
      endpoint_profile: 'openai_v1',
      auth_mode: 'API_KEY',
      label_zh: 'API 密钥',
      label_en: 'API key',
      fields: [],
    },
  ],
  combinations: [
    {
      auth_mode: 'API_KEY',
      endpoint_profile: 'openai_v1',
      invocation_api: 'CHAT_COMPLETIONS',
      operation_profile: 'chat_completions',
      adapter_version: 'm2-base-v1.0.0',
      support_stage: 'BASE',
      support_status: 'LOCAL_PROTOCOL_VALIDATED',
    },
  ],
}
function page<T>(items: T[], req: MockRequest) {
  const current = Math.max(1, Number(req.query?.page) || 1)
  const size = Math.min(100, Math.max(1, Number(req.query?.page_size) || 20))
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    page_size: size,
    total: items.length,
    total_pages: Math.ceil(items.length / size),
  }
}
function modelId(req: MockRequest) {
  return (req.url || '').split('?')[0].split('/')[4]
}
function record(req: MockRequest) {
  return models.find((m) => m.id === modelId(req))
}
function receipt(id: string) {
  return success({ applied: true, replayed: false, resource_id: id })
}
function commands(model: PhysicalModelItem) {
  model.allowed_commands =
    model.status === 'ACTIVE'
      ? ['PAUSE', 'RETIRE']
      : model.status === 'SUSPENDED'
        ? ['RESUME', 'RETIRE']
        : model.status === 'RETIRED'
          ? ['REACTIVATE']
          : []
  return model
}
function finishedRun(model: PhysicalModelItem): AdmissionRun {
  return {
    run_id: mockId(`seed-run-${model.id}`),
    status: 'PASSED',
    admission_valid: true,
    checks: [
      { check_key: 'BASE_REQUEST', status: 'PASSED', duration_ms: '120', safe_error_code: null },
    ],
    sealed_at: '2026-11-03T06:00:00Z',
    invalid_reason: null,
  }
}
for (const model of models) {
  commands(model)
  if (model.admission_valid) {
    const run = finishedRun(model)
    runs.set(model.id, run)
    runHistory.set(model.id, [run])
  }
}
function runData(run: AdmissionRun, id: string) {
  const model = models.find((m) => m.id === id)!
  return {
    ...run,
    checks: run.checks.map((check) => ({
      sent_count: check.status === 'PENDING' ? 0 : 1,
      not_executed_count: 0,
      unknown_count: 0,
      ...check,
    })),
    adapter_version: 'm2-base-v1.0.0',
    manifest_digest: 'mock-manifest',
    model_generation: model.admission_generation,
    physical_model_id: id,
    provider_generation: '1',
    selected_checks: run.checks.map((check) => check.check_key),
    test_profile_version: 'm2-admission-v2',
    validator_version: 'v1',
    verified_capabilities: capabilities,
  }
}
function advance(job: typeof jobs extends Map<string, infer T> ? T : never) {
  if (job.run.sealed_at) return true
  const elapsed = Date.now() - job.started
  let failed = false
  job.run.checks = job.checks.map((key, index) => {
    const complete = elapsed >= (index + 1) * 1500
    const status: AdmissionCheck['status'] = complete
      ? job.fail && index === 0
        ? 'FAILED'
        : 'PASSED'
      : elapsed >= index * 1500
        ? 'RUNNING'
        : 'PENDING'
    failed ||= status === 'FAILED'
    return {
      check_key: key,
      status,
      duration_ms: complete ? String(120 + index * 37) : null,
      safe_error_code: status === 'FAILED' ? 'UPSTREAM_REQUEST_FAILED' : null,
      ...(key === 'RELIABILITY' && complete
        ? {
            reliability_metrics: {
              version: 'v1',
              assessment_status: 'PASSED',
              request_count: '10',
              required_successes: '10',
              succeeded: '10',
              failed: '0',
              not_sent: '0',
              unknown: '0',
              success_rate_percent: '100',
              completed_latency: { count: '10', mean_ms: '1500', p50_ms: '1200', p95_ms: '2600' },
              successful_latency: { count: '10', mean_ms: '1500', p50_ms: '1200', p95_ms: '2600' },
              ttft: {
                status: 'MEASURED',
                missing_successful_count: '0',
                not_applicable_reason: '',
                successful_requests: '10',
                observed: { count: '10', mean_ms: '500', p50_ms: '420', p95_ms: '920' },
              },
            },
          }
        : {}),
      sent_count: complete ? 1 : 0,
      not_executed_count: 0,
      unknown_count: 0,
    }
  })
  const complete = elapsed >= job.checks.length * 1500
  job.run.status = complete ? (failed ? 'FAILED' : 'PASSED') : 'RUNNING'
  job.run.admission_valid = complete && !failed
  job.run.sealed_at = complete
    ? new Date(job.started + job.checks.length * 1500).toISOString()
    : null
  const model = models.find((x) => x.id === job.modelId)!
  model.status = complete ? (failed ? 'DRAFT' : 'PENDING_REVIEW') : 'TESTING'
  model.admission_valid = job.run.admission_valid
  commands(model)
  runs.set(model.id, job.run)
  return complete
}
const routes: MockMethod[] = [
  {
    url: '/api/v1/logical-model-permission-batches',
    method: 'post',
    response: (req: MockRequest) => {
      const ids = req.body?.logical_model_ids as string[]
      const subjects = req.body?.subjects as { subject_id: string; subject_type: SubjectType }[]
      if (!Array.isArray(ids) || !ids.length || !Array.isArray(subjects) || !subjects.length)
        return fail('VALIDATION_FAILED', '')
      if (ids.some((id) => !logicalRecord(id))) return fail('NOT_FOUND', '')
      ids.forEach((id) => addRelations(id, subjects))
      return receipt(ids[0])
    },
  },
  {
    url: '/api/v1/logical-models',
    method: 'post',
    response: (req: MockRequest) => {
      const b = req.body || {}
      if (
        typeof b.logical_name !== 'string' ||
        !b.logical_name.trim() ||
        b.logical_name.length > 128
      )
        return fail('VALIDATION_FAILED', '')
      if (logical.some((l) => l.logical_name === b.logical_name)) return fail('NAME_CONFLICT', '')
      const id = mockId(`logical-created-${++sequence}`)
      logical.unshift({
        id,
        logical_name: b.logical_name,
        display_name: String(b.display_name),
        localized_name: String(b.display_name),
        description: String(b.description || ''),
        localized_description: String(b.description || ''),
        translations: [],
        status: 'ACTIVE',
        workload_kind: null,
        ready: false,
        candidate_count: 0,
        mounts: [],
        created_at: new Date().toISOString(),
      })
      return receipt(id)
    },
  },
  ...(['get', 'put', 'delete'] as const).map((method): MockMethod => ({
    url: '/api/v1/logical-models/:id',
    method,
    response: (req: MockRequest) => {
      const id = logicalId(req)
      const l = logical.find((x) => x.id === id)
      if (!l) return fail('NOT_FOUND', '')
      if (method === 'get') return success(logicalRecord(id))
      if (method === 'delete') {
        logical.splice(logical.indexOf(l), 1)
        models.forEach((m) => {
          m.mounts = m.mounts.filter((x) => x.logical_model_id !== id)
        })
        for (let i = grants.length - 1; i >= 0; i--)
          if (grants[i].logical_model_id === id) grants.splice(i, 1)
      } else {
        const b = req.body || {}
        if (b.logical_name !== undefined) {
          if (
            typeof b.logical_name !== 'string' ||
            !b.logical_name.trim() ||
            b.logical_name.length > 128
          )
            return fail('VALIDATION_FAILED', '')
          if (logical.some((x) => x.id !== id && x.logical_name === b.logical_name))
            return fail('NAME_CONFLICT', '')
          l.logical_name = b.logical_name
          models.forEach((m) =>
            m.mounts.forEach((x) => {
              if (x.logical_model_id === id) {
                x.logical_name = l.logical_name
                x.display_name = l.logical_name
              }
            }),
          )
        }
        if (typeof b.display_name === 'string') l.display_name = l.localized_name = b.display_name
        if (typeof b.description === 'string')
          l.description = l.localized_description = b.description
      }
      return receipt(id)
    },
  })),
  {
    url: '/api/v1/logical-models/:id/mount-order',
    method: 'post',
    response: (req: MockRequest) => {
      const id = logicalId(req)
      const l = logicalRecord(id)
      const b = req.body || {}
      if (!l) return fail('NOT_FOUND', '')
      const target = l.mounts.find((x) => x.physical_model_id === b.physical_model_id)
      if (!target) return fail('NOT_FOUND', '')
      const order = l.mounts.filter((x) => x !== target)
      let position = b.placement === 'FIRST' ? 0 : order.length
      if (b.placement === 'BEFORE' || b.placement === 'AFTER') {
        position = order.findIndex((x) => x.physical_model_id === b.anchor_id)
        if (position < 0) return fail('VALIDATION_FAILED', '')
        if (b.placement === 'AFTER') position++
      }
      order.splice(position, 0, target)
      order.forEach((x, i) => {
        models
          .find((m) => m.id === x.physical_model_id)!
          .mounts.find((r) => r.logical_model_id === id)!.priority = i + 1
      })
      return receipt(id)
    },
  },
  ...(['get', 'post', 'delete'] as const).map((method): MockMethod => ({
    url: '/api/v1/logical-models/:id/permissions',
    method,
    response: (req: MockRequest) => {
      const id = logicalId(req)
      if (!logicalRecord(id)) return fail('NOT_FOUND', '')
      if (method === 'get')
        return success(
          page(
            grants.filter((g) => g.logical_model_id === id),
            req,
          ),
        )
      const relations = req.body?.relations as LogicalModelPermission[]
      if (!Array.isArray(relations) || !relations.length) return fail('VALIDATION_FAILED', '')
      if (method === 'post') addRelations(id, relations)
      else
        for (let i = grants.length - 1; i >= 0; i--)
          if (
            grants[i].logical_model_id === id &&
            relations.some((x) => x.grant_id === grants[i].grant_id)
          )
            grants.splice(i, 1)
      return receipt(id)
    },
  })),
  {
    url: '/api/v1/models/:id/pricing',
    method: 'get',
    response: (req: MockRequest) => success(page(priceHistory.get(modelId(req)) || [], req)),
  },
  {
    url: '/api/v1/models/:id/admission-tests',
    method: 'get',
    response: (req: MockRequest) =>
      success(
        page(
          (runHistory.get(modelId(req)) || []).map((run) => runData(run, modelId(req))),
          req,
        ),
      ),
  },
  {
    url: '/api/v1/provider-templates',
    method: 'get',
    response: (req: MockRequest) => success(page([template], req)),
  },
  {
    url: '/api/v1/providers',
    method: 'get',
    response: (req: MockRequest) => {
      const provider: ProviderItem = {
        id: providerId,
        name: 'OpenAI-主站',
        template_key: 'openai',
        template_version: 'v1.0',
        base_url: 'https://api.openai.com/v1',
        endpoint_profile: 'openai_v1',
        auth_mode: 'API_KEY',
        security_level: 'INTERNET',
        notes: '',
        model_count: String(models.length),
        invocation_generation: '1',
        public_config: {},
        configured_secret_fields: [],
      }
      return success(page([provider], req))
    },
  },
  {
    url: '/api/v1/logical-models',
    method: 'get',
    response: (req: MockRequest) =>
      success(
        page(
          logical
            .filter(
              (l) =>
                !req.query?.search ||
                l.logical_name.toLowerCase().includes(String(req.query.search).toLowerCase()),
            )
            .map((l) => logicalRecord(l.id)!),
          req,
        ),
      ),
  },
  {
    url: '/api/v1/models',
    method: 'get',
    response: (req: MockRequest) => {
      for (const job of jobs.values()) advance(job)
      const q = req.query || {}
      return success(
        page(
          models
            .filter(
              (m) =>
                (!q.status || m.status === q.status) &&
                (!q.provider_id || m.provider_id === q.provider_id) &&
                (!q.logical_model_id ||
                  m.mounts.some((x) => x.logical_model_id === q.logical_model_id)) &&
                (q.unmounted == null || (m.mounts.length === 0) === (q.unmounted === 'true')) &&
                (!q.search ||
                  `${m.model_id_at_provider} OpenAI-主站 https://api.openai.com/v1`
                    .toLowerCase()
                    .includes(String(q.search).toLowerCase())),
            )
            .map(commands),
          req,
        ),
      )
    },
  },
  {
    url: '/api/v1/models',
    method: 'post',
    response: (req: MockRequest) => {
      const b = req.body || {}
      if (!b.provider_id || !b.model_id_at_provider || !b.invocation_api)
        return fail('VALIDATION_FAILED', '')
      if (
        models.some(
          (m) =>
            m.provider_id === b.provider_id && m.model_id_at_provider === b.model_id_at_provider,
        )
      )
        return fail('MODEL_STATE_CONFLICT', '')
      const id = mockId(`created-model-${++sequence}`)
      const binding = b.logical_binding as {
        mode: string
        logical_model_id?: string
        logical_name?: string
        display_name?: string
      }
      let mount = logical.find((x) => x.id === binding.logical_model_id)
      if (binding.mode === 'CREATE') {
        mount = {
          ...logical[0],
          id: mockId(`created-logical-${sequence}`),
          logical_name: binding.logical_name!,
          display_name: binding.display_name!,
          localized_name: binding.display_name!,
          mounts: [],
        }
        logical.push(mount)
      }
      const { reason: _reason, logical_binding: _binding, ...modelFields } = b
      void _reason
      void _binding
      models.unshift(
        commands({
          ...models[0],
          ...modelFields,
          id,
          status: 'DRAFT',
          admission_valid: false,
          mounts: mount
            ? [
                {
                  logical_model_id: mount.id,
                  logical_name: mount.logical_name,
                  display_name: mount.display_name,
                  priority: 1,
                },
              ]
            : [],
        } as PhysicalModelItem),
      )
      return receipt(id)
    },
  },
  {
    url: '/api/v1/models/:id',
    method: 'get',
    response: (req: MockRequest) => {
      const m = record(req)
      return m ? success(commands(m)) : fail('NOT_FOUND', '')
    },
  },
  {
    url: '/api/v1/models/:id',
    method: 'put',
    response: (req: MockRequest) => {
      const m = record(req)
      if (!m) return fail('NOT_FOUND', '')
      if (['TESTING', 'PENDING_REVIEW'].includes(m.status)) return fail('MODEL_STATE_CONFLICT', '')
      if (
        ['provider_id', 'model_id_at_provider', 'logical_binding'].some(
          (key) => key in (req.body || {}),
        )
      )
        return fail('VALIDATION_FAILED', '')
      const { reason: _reason, ...changes } = req.body || {}
      void _reason
      Object.assign(m, changes)
      return receipt(m.id)
    },
  },
  {
    url: '/api/v1/models/:id',
    method: 'delete',
    response: (req: MockRequest) => {
      const m = record(req)
      if (!m) return fail('NOT_FOUND', '')
      if (m.status === 'ACTIVE' || !req.body?.reason) return fail('MODEL_STATE_CONFLICT', '')
      models.splice(models.indexOf(m), 1)
      return receipt(m.id)
    },
  },
  {
    url: '/api/v1/models/:id/commands',
    method: 'post',
    response: (req: MockRequest) => {
      const m = record(req)
      if (!m) return fail('NOT_FOUND', '')
      const command = String(req.body?.command)
      if (!commands(m).allowed_commands.includes(command) || !req.body?.reason)
        return fail('MODEL_STATE_CONFLICT', '')
      m.status = (
        { PAUSE: 'SUSPENDED', RESUME: 'ACTIVE', RETIRE: 'RETIRED', REACTIVATE: 'DRAFT' } as Record<
          string,
          ModelStatus
        >
      )[command]
      if (m.status === 'DRAFT') m.admission_valid = false
      commands(m)
      return receipt(m.id)
    },
  },
  {
    url: '/api/v1/models/:id/admission-tests',
    method: 'post',
    response: (req: MockRequest) => {
      const m = record(req)
      if (!m) return fail('NOT_FOUND', '')
      if (m.status !== 'DRAFT') return fail('MODEL_STATE_CONFLICT', '')
      if (
        !req.body?.budget_authorization_ref ||
        req.body.test_profile_version !== 'm2-admission-v2'
      )
        return fail('VALIDATION_FAILED', '')
      const checks = req.body.selected_checks as string[]
      if (!Array.isArray(checks) || !checks.includes('BASE_REQUEST'))
        return fail('VALIDATION_FAILED', '')
      const jobId = mockId(`admission-job-${++sequence}`)
      const run: AdmissionRun = {
        run_id: mockId(`admission-run-${sequence}`),
        status: 'RUNNING',
        admission_valid: false,
        checks: [],
        sealed_at: null,
        invalid_reason: null,
      }
      jobs.set(jobId, {
        modelId: m.id,
        run,
        started: Date.now(),
        budgetBatchId: mockId(`budget-${sequence}`),
        fail: m.model_id_at_provider.includes('fail'),
        checks,
      })
      runHistory.set(m.id, [run, ...(runHistory.get(m.id) || [])])
      m.status = 'TESTING'
      m.admission_valid = false
      return success({
        accepted: true,
        job_id: jobId,
        budget_batch_id: mockId(`budget-${sequence}`),
        replayed: false,
      })
    },
  },
  {
    url: '/api/v1/model-admission-jobs/:id',
    method: 'get',
    response: (req: MockRequest) => {
      const id = (req.url || '').split('?')[0].split('/').pop()!
      const job = jobs.get(id)
      if (!job) return fail('NOT_FOUND', '')
      const complete = advance(job)
      return success({
        job_id: id,
        budget_batch_id: job.budgetBatchId,
        physical_model_id: job.modelId,
        run_id: job.run.run_id,
        status: complete ? (job.run.status === 'PASSED' ? 'SUCCEEDED' : 'FAILED') : 'RUNNING',
        cancel_requested: false,
        safe_error_code: null,
        remote: { cleanup_required: false, pending_count: 0, unknown_count: 0 },
      })
    },
  },
  {
    url: '/api/v1/models/:id/admission-tests/latest',
    method: 'get',
    response: (req: MockRequest) => {
      const m = record(req)
      if (!m) return fail('NOT_FOUND', '')
      for (const job of jobs.values()) if (job.modelId === m.id) advance(job)
      const latest = runs.get(m.id)
      return success({
        admission_valid: m.admission_valid,
        invalid_reason: null,
        latest_run: latest
          ? {
              ...latest,
              adapter_version: 'm2-base-v1.0.0',
              manifest_digest: 'mock-manifest',
              model_generation: m.admission_generation,
              physical_model_id: m.id,
              provider_generation: '1',
              selected_checks: latest.checks.map((x) => x.check_key),
              test_profile_version: 'm2-admission-v2',
              validator_version: 'v1',
              verified_capabilities: capabilities,
            }
          : null,
      })
    },
  },
  {
    url: '/api/v1/models/:id/review',
    method: 'post',
    response: (req: MockRequest) => {
      const m = record(req)
      if (!m) return fail('NOT_FOUND', '')
      const run = runs.get(m.id)
      if (
        m.status !== 'PENDING_REVIEW' ||
        !run ||
        req.body?.run_id !== run.run_id ||
        !req.body.reason
      )
        return fail('MODEL_STATE_CONFLICT', '')
      if (!['PUBLISH', 'REJECT'].includes(String(req.body.decision)))
        return fail('VALIDATION_FAILED', '')
      m.status = req.body.decision === 'PUBLISH' ? 'ACTIVE' : 'DRAFT'
      m.admission_valid = m.status === 'ACTIVE'
      commands(m)
      return receipt(m.id)
    },
  },
  {
    url: '/api/v1/models/:id/pricing/current',
    method: 'get',
    response: (req: MockRequest) => {
      const price = prices.get(modelId(req))
      return success({
        cost_status: price ? 'PRICED' : 'UNPRICED',
        pricing_status: price ? 'PRICED' : 'UNPRICED',
        price: price
          ? {
              input_price: price.input_price,
              output_price: price.output_price,
              cached_input_price: price.cached_input_price,
              currency: price.currency,
              unit: price.unit,
              coverage_status: 'COMPLETE_FOR_OPERATION',
              pricing_profile_version: 'v1',
              revision: '1',
              uncovered_components: [],
            }
          : null,
      })
    },
  },
  {
    url: '/api/v1/models/:id/pricing',
    method: 'post',
    response: (req: MockRequest) => {
      if (!record(req)) return fail('NOT_FOUND', '')
      prices.set(modelId(req), req.body as unknown as ModelPricingBody)
      const body = req.body as unknown as ModelPricingBody
      const history = priceHistory.get(modelId(req)) || []
      const m = record(req)!
      history.unshift({
        input_price: body.input_price,
        output_price: body.output_price,
        cached_input_price: body.cached_input_price,
        currency: body.currency,
        unit: body.unit,
        created_at: new Date().toISOString(),
        created_by: mockId('mock-model-admin'),
        revision: String(history.length + 1),
        coverage_status: 'COMPLETE_FOR_OPERATION',
        pricing_profile_version: 'v1',
        uncovered_components: [],
        identity: {
          model_id_at_provider: m.model_id_at_provider,
          physical_model_id: m.id,
          provider_id: m.provider_id,
          provider_name: 'OpenAI-主站',
        },
      })
      priceHistory.set(m.id, history)
      return receipt(modelId(req))
    },
  },
  ...(['post', 'delete'] as const).map((method): MockMethod => ({
    url:
      method === 'post'
        ? '/api/v1/logical-models/:logicalId/mount'
        : '/api/v1/logical-models/:logicalId/mount/:modelId',
    method,
    response: (req: MockRequest) => {
      const parts = (req.url || '').split('?')[0].split('/')
      const l = logical.find((x) => x.id === parts[4])
      const m = models.find(
        (x) => x.id === (method === 'post' ? req.body?.physical_model_id : parts[6]),
      )
      if (!m || !l) return fail('NOT_FOUND', '')
      m.mounts = m.mounts.filter((x) => x.logical_model_id !== l.id)
      if (method === 'post')
        m.mounts.push({
          logical_model_id: l.id,
          logical_name: l.logical_name,
          display_name: l.display_name,
          priority: Number(req.body?.priority || (logicalRecord(l.id)?.mounts.length || 0) + 1),
        })
      return receipt(m.id)
    },
  })),
]
export default routes.map((route) => {
  const handler = route.response
  return {
    ...route,
    response: function (this: RespThisType, req: MockRequest) {
      const result = !checkToken(req)
        ? unauthorized()
        : route.method !== 'get' && !checkCsrf(req)
          ? fail('CSRF_INVALID', '')
          : handler(req)
      this.res.statusCode =
        result.code === 'OK'
          ? 200
          : (
              {
                UNAUTHENTICATED: 401,
                NOT_FOUND: 404,
                MODEL_STATE_CONFLICT: 409,
                NAME_CONFLICT: 409,
                VALIDATION_FAILED: 422,
                CSRF_INVALID: 403,
              } as Record<string, number>
            )[result.code] || 400
      return result
    },
  }
}) as MockMethod[]
