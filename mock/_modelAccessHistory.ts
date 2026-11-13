import type * as D from '../src/api/modules/modelAccessContract'
import { modelAccessState as state } from './_modelAccessState'
import { directory } from './_runtime'
import { modelFixtures } from './_modelAccessFixtures'

interface HistoryActions {
  createJob: (model: D.Model, purpose: D.CheckJob['purpose'], version: number) => D.CheckJob
  finishJob: (job: D.CheckJob) => D.CheckJob
  setStatus: (model: D.Model, command: D.StatusCommand) => D.Model
  addPrice: (input: D.PricingInput, model: D.Model) => D.PricingVersion
}
const iso = (time: number) => new Date(time).toISOString()

/** Add linked scenarios once per mock process; never replace user-created models or histories. */
export function seedModelHistories(actions: HistoryActions) {
  if (state.historyFixtureVersion >= 1) return
  for (const model of state.models.filter(
    (m) =>
      m.status === 'ACTIVE' &&
      modelFixtures.some(
        (sample) =>
          sample.template_key === m.provider_template_key &&
          sample.model_id_at_provider === m.model_id_at_provider,
      ),
  )) {
    const rich = model.model_id_at_gateway === 'gpt-4o'
    const prices = state.prices.get(model.id) ?? []
    const current = prices[0]
    if (current) {
      const original = JSON.parse(JSON.stringify(current)) as D.PricingVersion
      const count = rich ? 7 : 2
      const from = Date.parse(current.created_at)
      const until = Math.max(from + count, Date.now())
      for (let i = 1; i <= count; i++) {
        const rates = (factor: 'standard' | 'peak' | 'offpeak') =>
          original.periods[0]!.metric_rates.map((rate) => ({
            metric_key: rate.metric_key,
            unit: rate.unit,
            unit_price:
              factor === 'peak'
                ? rate.metric_key.includes('output')
                  ? '78.00'
                  : '19.50'
                : factor === 'offpeak'
                  ? rate.metric_key.includes('output')
                    ? '56.00'
                    : '14.00'
                  : rate.unit_price,
          }))
        const periods: D.PricePeriodInput[] = [
          { name: '标准兜底', is_fallback: true, conditions: [], metric_rates: rates('standard') },
          {
            name: '工作日业务高峰',
            is_fallback: false,
            conditions: [
              { weekdays: [1, 2, 3, 4, 5], start_minute: 540, end_minute: 720 },
              ...[1, 2, 3, 4, 5].map((weekday) => ({
                weekdays: [weekday],
                start_minute: 840,
                end_minute: 1080,
              })),
            ],
            metric_rates: rates('peak'),
          },
          {
            name: '周末低峰',
            is_fallback: false,
            conditions: [{ weekdays: [6, 7], start_minute: 0, end_minute: 1440 }],
            metric_rates: rates('offpeak'),
          },
        ]
        // End with the previous effective values so enriching fixtures does not change user pricing.
        const final = i === count
        const price = actions.addPrice(
          {
            expected_price_version: model.versions.price,
            currency: original.currency,
            pricing_mode: final ? original.pricing_mode : 'TIME_BASED',
            periods: final
              ? original.periods.map((period) => ({
                  name: period.name,
                  is_fallback: period.is_fallback,
                  conditions: period.conditions,
                  metric_rates: period.metric_rates.map((rate) => ({
                    metric_key: rate.metric_key,
                    unit: rate.unit,
                    unit_price: rate.unit_price,
                  })),
                }))
              : periods,
          },
          model,
        )
        price.created_at = iso(from + Math.round(((until - from) * i) / count))
      }
    }

    const previousHealth = model.health_status
    let clock = Date.parse(model.created_at) + 86400000
    const stampEvents = (ids: Set<string>, time: number) => {
      for (const event of state.events.get(model.id) ?? [])
        if (!ids.has(event.id))
          event.occurred_at = iso(
            time +
              (event.action === 'ADMISSION_PASSED' || event.action === 'ADMISSION_FAILED'
                ? 4000
                : 0),
          )
    }
    const transition = (action: D.StatusCommand['action'], reason?: string) => {
      const ids = new Set((state.events.get(model.id) ?? []).map((event) => event.id))
      actions.setStatus(model, { action, reason, expected_state_version: model.versions.state })
      stampEvents(ids, clock)
      clock += 86400000
    }
    const check = (purpose: D.CheckJob['purpose'], result: 'PASS' | 'FAIL' | 'ERROR') => {
      const ids = new Set((state.events.get(model.id) ?? []).map((event) => event.id))
      const job = actions.createJob(model, purpose, model.versions.base)
      job.created_at = iso(clock)
      actions.finishJob(job)
      stampEvents(ids, clock)
      job.started_at = iso(clock + 1000)
      job.completed_at = iso(clock + 4000)
      job.deadline_at = iso(clock + 300000)
      job.result = result
      job.trigger_type = purpose === 'HEALTH' && result !== 'ERROR' ? 'AUTO' : 'MANUAL'
      job.triggered_by = job.trigger_type === 'AUTO' ? null : job.triggered_by
      job.items.forEach((item, index) => {
        if (item.status === 'NOT_APPLICABLE') return
        item.request_started_at = job.started_at
        item.completed_at = job.completed_at
        const failed = result !== 'PASS' && index === 0
        item.status = failed ? result : 'PASS'
        item.error_code = failed
          ? result === 'ERROR'
            ? 'UPSTREAM_TIMEOUT'
            : 'PROTOCOL_MISMATCH'
          : null
        if (item.result_detail)
          Object.assign(item.result_detail, {
            http_status: failed && result === 'ERROR' ? null : failed ? 502 : 200,
            latency_ms: failed ? 3000 : 180 + index * 70,
            reason_code: item.error_code,
            upstream_request_id: `fixture-${job.id}-${index}`,
            assertions: [{ key: item.check_type, passed: !failed, reason_code: item.error_code }],
            detail_text: failed
              ? `${model.model_id_at_gateway} 上游响应${result === 'ERROR' ? '超时' : '未满足协议断言'}；已保留本次快照。`
              : `${model.model_id_at_gateway} 的 ${item.invocation_api.display_name} 检测通过。`,
            suggestion_text: failed ? '检查供应商连接与模型协议配置后重新检测。' : null,
          })
      })
      job.summary.passed_items = job.items.filter((item) => item.status === 'PASS').length
      job.summary.failed_items = job.items.filter((item) => item.status === 'FAIL').length
      job.summary.error_items = job.items.filter((item) => item.status === 'ERROR').length
      if (purpose === 'ADMISSION' && result !== 'PASS') {
        // finishJob builds the completed snapshot; replace its simulated pass event with the failure fact.
        model.status = 'DRAFT'
        for (const event of state.events.get(model.id) ?? [])
          if (!ids.has(event.id) && event.action === 'ADMISSION_PASSED') {
            event.action = 'ADMISSION_FAILED'
            event.to_status = 'DRAFT'
            event.reason = '上游协议检测失败'
          }
      }
      clock += 86400000
      return job
    }
    if (rich) {
      transition('SUSPEND', '生产密钥轮换，暂停对外服务')
      transition('RESUME', '连接验证完成，恢复服务')
      transition('RETIRE', '切换模型配置，重新进行准入')
      transition('REACTIVATE', '恢复草稿并核对新配置')
      for (let i = 0; i < 5; i++) {
        check('ADMISSION', i === 0 ? 'FAIL' : 'PASS')
        if (i > 0)
          transition(
            i === 4 ? 'APPROVE' : 'REJECT',
            i === 4 ? '准入及业务核对完成' : '补充核对协议和业务配置',
          )
      }
    }
    for (const result of [
      'PASS',
      'FAIL',
      'PASS',
      'ERROR',
      previousHealth === 'UNHEALTHY' ? 'FAIL' : 'PASS',
    ] as const)
      check('HEALTH', result)
    const latestHealth = [...state.jobs.values()]
      .filter(
        (job) =>
          job.physical_model_id === model.id &&
          job.purpose === 'HEALTH' &&
          job.status === 'COMPLETED',
      )
      .sort(
        (a, b) =>
          Date.parse(b.completed_at ?? b.created_at) - Date.parse(a.completed_at ?? a.created_at),
      )[0]
    model.health_status = latestHealth?.result === 'PASS' ? 'HEALTHY' : 'UNHEALTHY'
    model.health_checked_at = latestHealth?.completed_at ?? null
    const operator = [...directory.values()].find(
      (user) => user.username === 'admin' && user.status === 'ACTIVE',
    )
    if (operator) {
      for (const price of state.prices.get(model.id) ?? []) {
        price.created_by = operator.id
        Object.assign(price.created_by_display, {
          user_id: operator.id,
          username: operator.username,
          display_name: operator.display_name,
        })
      }
      for (const job of state.jobs.values())
        if (job.physical_model_id === model.id) {
          job.triggered_by = job.trigger_type === 'AUTO' ? null : operator.id
          Object.assign(job.triggered_by_display, {
            user_id: operator.id,
            username: operator.username,
            display_name: operator.display_name,
          })
        }
    }
    const events = state.events.get(model.id) ?? []
    events.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    model.updated_at = iso(Date.now())
  }
  state.historyFixtureVersion = 1
}

/** Normalize only synthetic snapshots added by fixture migrations, never live browser jobs. */
export function normalizeHistoryTimes() {
  for (const model of state.models) {
    const jobs = [...state.jobs.values()].filter((job) => job.physical_model_id === model.id)
    for (const job of jobs)
      if (
        job.status === 'COMPLETED' &&
        job.started_at &&
        Date.parse(job.started_at) - Date.parse(job.created_at) > 300000
      ) {
        job.started_at = iso(Date.parse(job.created_at) + 1000)
        job.completed_at = iso(Date.parse(job.created_at) + 4000)
        job.deadline_at = iso(Date.parse(job.created_at) + 300000)
        for (const item of job.items)
          if (item.dispatch_state === 'FINISHED') {
            item.request_started_at = job.started_at
            item.completed_at = job.completed_at
          }
      }
    const synthetic = jobs
      .filter((job) =>
        job.items.some((item) => item.result_detail?.upstream_request_id?.startsWith('fixture-')),
      )
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    const first = synthetic[0]
    if (first && Date.parse(first.created_at) < Date.parse(model.created_at)) {
      const shift = Date.parse(model.created_at) + 86400000 - Date.parse(first.created_at)
      for (const job of synthetic) {
        job.created_at = iso(Date.parse(job.created_at) + shift)
        if (job.started_at) job.started_at = iso(Date.parse(job.started_at) + shift)
        if (job.completed_at) job.completed_at = iso(Date.parse(job.completed_at) + shift)
        job.deadline_at = iso(Date.parse(job.deadline_at) + shift)
        for (const item of job.items) {
          if (item.request_started_at)
            item.request_started_at = iso(Date.parse(item.request_started_at) + shift)
          if (item.completed_at) item.completed_at = iso(Date.parse(item.completed_at) + shift)
        }
      }
    }
    const health = jobs.filter((job) => job.purpose === 'HEALTH')
    if (!health.some((job) => job.status === 'QUEUED' || job.status === 'RUNNING')) {
      const latest = health
        .filter((job) => job.status === 'COMPLETED')
        .sort(
          (a, b) =>
            Date.parse(b.completed_at ?? b.created_at) - Date.parse(a.completed_at ?? a.created_at),
        )[0]
      if (latest) {
        model.health_status = latest.result === 'PASS' ? 'HEALTHY' : 'UNHEALTHY'
        model.health_checked_at = latest.completed_at
      }
    }
  }
}
