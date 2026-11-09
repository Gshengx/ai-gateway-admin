<template>
  <t-drawer
    :close-btn="true"
    :visible="true"
    :header="model?.model_id_at_gateway"
    :footer="false"
    size="large"
    @close="emit('close')"
  >
    <t-loading :loading="loading"
      ><div v-if="model" class="ma-stack">
        <div class="ma-row">
          <t-tag variant="light" :theme="statusTheme(model.status)">{{
            t('ma.' + model.status)
          }}</t-tag
          ><t-tag variant="light" :theme="statusTheme(model.health_status)">{{
            t('ma.health') + '：' + t('ma.' + model.health_status)
          }}</t-tag
          ><t-button
            v-if="['ACTIVE', 'SUSPENDED'].includes(model.status)"
            v-permission.write="'model.models'"
            theme="default"
            @click="emit('test', model, 'HEALTH')"
            >{{ t('ma.healthTitle') }}</t-button
          ><t-button
            v-permission.write="'model.models'"
            theme="primary"
            @click="emit('edit', model.id)"
            >{{ t('ma.edit') }}</t-button
          >
        </div>
        <t-alert theme="info" :message="t('ma.priceDisclaimer')" />
        <dl class="ma-definitions">
          <template v-for="row in info" :key="row[0]"
            ><dt>{{ row[0] }}</dt>
            <dd>{{ row[1] }}</dd></template
          >
        </dl>
        <div class="ma-stack">
          <h3>{{ t('ma.priceHistory') }}</h3>
          <div
            v-for="(price, i) in priceHistory"
            :key="price.id"
            :class="['ma-box', { 'ma-current': pricePage === 1 && i === 0 }]"
          >
            <strong>{{
              pricePage === 1 && i === 0
                ? t('ma.currentPrice')
                : t('ma.version') + ' ' + price.version
            }}</strong>
            <p class="ma-muted">
              {{ formatDateTime(price.created_at) }} · {{ price.created_by }} ·
              {{ t('ma.' + price.source_type) }} · {{ t('ma.' + price.pricing_mode) }}
            </p>
            <div v-for="rate in price.metric_rates" :key="rate.metric_key">
              {{ metricLabel(rate.metric_key) }}:
              {{
                price.pricing_mode === 'FIXED'
                  ? rate.unit_price
                  : price.time_periods
                      .map(
                        (p) =>
                          `${p.is_fallback ? t('ma.fallback') : p.name}: ${rate.period_prices[p.id]}`,
                      )
                      .join(' / ')
              }}
              {{ price.currency }} / {{ t('ma.' + unitLabel(rate.unit)) }}
            </div>
          </div>
          <t-pagination
            v-if="priceTotal > 20"
            :current="pricePage"
            :total="priceTotal"
            :page-size="20"
            :show-page-size="false"
            @current-change="
              (v: number) => {
                pricePage = v
                loadPrices()
              }
            "
          />
        </div>
        <div v-for="purpose in ['ADMISSION', 'HEALTH'] as const" :key="purpose" class="ma-stack">
          <h3>{{ t(purpose === 'HEALTH' ? 'ma.healthHistory' : 'ma.admissionHistory') }}</h3>
          <p v-if="!histories[purpose].length" class="ma-muted">{{ t('ma.noHistory') }}</p>
          <t-table
            v-else
            row-key="id"
            :data="histories[purpose]"
            :columns="historyColumns"
            :pagination="{
              current: historyPages[purpose],
              pageSize: 20,
              total: historyTotals[purpose],
              showPageSize: false,
            }"
            :disable-data-page="true"
            @page-change="
              (page: PageInfo) => {
                historyPages[purpose] = page.current
                loadHistory(purpose)
              }
            "
            ><template #started_at="{ row }"
              ><t-link theme="primary" @click="emit('test', model, purpose, row)">{{
                formatDateTime(row.started_at)
              }}</t-link></template
            ><template #invocation_api="{ row }">{{ runApiLabels(row) }}</template
            ><template #status="{ row }"
              ><t-tag variant="light" :theme="statusTheme(row.status)">{{
                t('ma.' + row.status)
              }}</t-tag></template
            ><template #trigger_type="{ row }">{{ t('ma.' + row.trigger_type) }}</template></t-table
          >
        </div>
        <div class="ma-stack">
          <h3>{{ t('ma.timeline') }}</h3>
          <t-timeline
            ><t-timeline-item v-for="(event, index) in lifecycleEvents" :key="index"
              ><p class="ma-muted">{{ event.actor }} · {{ formatDateTime(event.created_at) }}</p>
              <strong
                ><template v-if="event.action !== 'STATUS'"
                  >{{ t('ma.' + event.action) }} ·
                </template>
                <template v-if="event.action === 'STATUS'"
                  >{{ event.fromStatus ? t('ma.' + event.fromStatus) : '—' }} → </template
                >{{ t('ma.' + event.status) }}</strong
              >
              <p v-if="event.reason?.trim()" class="ma-muted">
                {{ event.reason }}
              </p></t-timeline-item
            ></t-timeline
          >
        </div>
      </div></t-loading
    >
  </t-drawer>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PrimaryTableCol, PageInfo } from 'tdesign-vue-next'
import {
  accessApi,
  type Model,
  type Provider,
  type Pricing,
  type TestRun,
} from '@/api/modules/modelAccess'
import { formatDateTime } from '@/utils/datetime'
import { invocationLabel, metricLabel, statusTheme, tagLabel, unitLabel } from './helpers'
const props = defineProps<{ id: string; providers: Provider[] }>()
const emit = defineEmits<{
  close: []
  edit: [id: string]
  test: [model: Model, purpose: 'HEALTH' | 'ADMISSION', run?: TestRun]
}>()
const { t } = useI18n()
const model = ref<Model>(),
  loading = ref(true),
  priceHistory = ref<Pricing[]>([]),
  pricePage = ref(1),
  priceTotal = ref(0)
const histories = ref<Record<'ADMISSION' | 'HEALTH', TestRun[]>>({ ADMISSION: [], HEALTH: [] })
const historyPages = ref({ ADMISSION: 1, HEALTH: 1 }),
  historyTotals = ref({ ADMISSION: 0, HEALTH: 0 })
async function loadHistory(purpose: 'ADMISSION' | 'HEALTH') {
  const data = await accessApi.history(props.id, purpose, historyPages.value[purpose])
  histories.value[purpose] = data.items
  historyTotals.value[purpose] = data.total
}
const lifecycleEvents = computed(() => {
  const chronological = [...(model.value?.lifecycle_events ?? [])].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  )
  return chronological
    .map((event, index) => ({ ...event, fromStatus: chronological[index - 1]?.status }))
    .reverse()
})
function runApiLabels(run: TestRun) {
  return run.invocation_apis
    .map(
      (api) =>
        run.checks.find((c) => c.invocation_api === api)?.upstream_path || invocationLabel(api),
    )
    .join('、')
}
const historyColumns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'started_at', title: t('ma.checkTime') },
  { colKey: 'invocation_api', title: t('ma.invocation') },
  { colKey: 'status', title: t('ma.status') },
  { colKey: 'trigger_type', title: t('ma.trigger') },
  { colKey: 'triggered_by', title: t('ma.actor') },
])
const info = computed(() => {
  if (!model.value) return []
  const m = model.value,
    p = props.providers.find((p) => p.id === m.provider_id)
  return [
    [t('ma.name'), m.model_id_at_gateway],
    [t('ma.provider'), p?.name || '—'],
    [t('ma.upstream'), m.model_id_at_provider],
    [t('ma.baseUrl'), p?.base_url || '—'],
    [t('ma.security'), p ? t('ma.' + p.security_level) : '—'],
    [t('ma.supportedApis'), m.supported_invocation_apis.map(invocationLabel).join('、')],
    [t('ma.customPath'), m.custom_invocation_apis.map((a) => a.path).join('、') || '—'],
    [t('ma.input'), m.input_modalities.join('、') || t('ma.noMetadata')],
    [t('ma.output'), m.output_modalities.join('、') || t('ma.noMetadata')],
    [
      t('ma.context'),
      m.context_window
        ? (m.context_window / 1000).toLocaleString() + ' K Token'
        : t('ma.noMetadata'),
    ],
    [
      t('ma.maxOutput'),
      m.max_output_tokens
        ? (m.max_output_tokens / 1000).toLocaleString() + ' K Token'
        : t('ma.noMetadata'),
    ],
    [t('ma.tags'), m.tags.map(tagLabel).join('、') || t('ma.noMetadata')],
    [t('ma.health'), t('ma.' + m.health_status)],
    [
      t('ma.autoHealth'),
      m.auto_health_check
        ? t('ma.hours', { n: m.health_check_interval_minutes / 60 })
        : t('ma.disabled'),
    ],
    [t('ma.lastCheck', { time: '' }), formatDateTime(m.health_checked_at) || '—'],
    [t('ma.source'), t('ma.' + (priceHistory.value[0]?.source_type || 'ENTERPRISE_CUSTOM'))],
    [
      t('ma.priceSummary'),
      priceHistory.value[0]?.metric_rates
        .map(
          (r) =>
            `${metricLabel(r.metric_key)}: ${priceHistory.value[0]?.pricing_mode === 'TIME_BASED' ? priceHistory.value[0].time_periods.map((p) => `${p.is_fallback ? t('ma.fallback') : p.name}: ${r.period_prices[p.id] ?? '—'}`).join(' / ') : (r.unit_price ?? '—')} CNY / ${t('ma.' + unitLabel(r.unit))}`,
        )
        .join('；') || '—',
    ],
    [
      t('ma.admissionAt'),
      formatDateTime(histories.value.ADMISSION.find((x) => x.status === 'PASSED')?.completed_at) ||
        '—',
    ],
    [t('ma.description'), m.description || '—'],
    [t('ma.created'), formatDateTime(m.created_at)],
  ]
})
async function loadPrices() {
  const p = await accessApi.prices(props.id, pricePage.value)
  priceHistory.value = p.items
  priceTotal.value = p.total
}
async function refresh() {
  const updated = await accessApi.model(props.id)
  await Promise.all([loadPrices(), ...(['ADMISSION', 'HEALTH'] as const).map(loadHistory)])
  model.value = updated
}
defineExpose({ refresh })
onMounted(async () => {
  try {
    await refresh()
  } finally {
    loading.value = false
  }
})
</script>
<style scoped src="./access.css"></style>
