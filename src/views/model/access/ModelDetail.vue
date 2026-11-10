<template>
  <t-drawer
    :close-btn="true"
    :visible="true"
    :header="model?.model_id_at_gateway || ' '"
    :footer="false"
    size="large"
    @close="emit('close')"
  >
    <LoadingState :loading="loading" :failed="failed" retryable @retry="loadDetail"
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
            v-if="model.status !== 'PENDING_REVIEW'"
            @click="emit('edit', model.id)"
            >{{ t('ma.edit') }}</t-button
          >
        </div>
        <t-alert theme="info" :message="t('ma.priceDisclaimer')" />
        <dl class="ma-definitions">
          <template v-for="row in info" :key="row[0]"
            ><dt>{{ row[0] }}</dt>
            <dd>
              <PricingSummary
                v-if="row[0] === t('ma.priceSummary') && currentPrice && !pricesFailed"
                :price="currentPrice"
              />
              <template v-else>{{ row[1] }}</template>
            </dd></template
          >
        </dl>
        <div class="ma-stack">
          <h3>{{ t('ma.priceHistory') }}</h3>
          <LoadingState
            height="var(--stable-detail-section-height)"
            :loading="pricesLoading"
            :failed="pricesFailed"
            retryable
            @retry="loadPrices"
          >
            <div v-for="(price, i) in priceHistory" :key="price.id" class="price-history-entry">
              <strong>{{
                pricePage === 1 && i === 0 ? t('ma.currentPrice') : t('ma.historicalPrice')
              }}</strong>
              <p class="ma-muted">
                {{ formatDateTime(price.created_at) }} · {{ price.created_by }}
              </p>
              <PricingSummary :price="price" />
            </div>
            <t-pagination
              v-if="priceTotal > pricePageSize"
              :current="pricePage"
              :total="priceTotal"
              :page-size="pricePageSize"
              :show-page-size="false"
              @current-change="
                (v: number) => {
                  pricePage = v
                  loadPrices()
                }
              "
            />
          </LoadingState>
        </div>
        <div v-for="purpose in ['ADMISSION', 'HEALTH'] as const" :key="purpose" class="ma-stack">
          <h3>{{ t(purpose === 'HEALTH' ? 'ma.healthHistory' : 'ma.admissionHistory') }}</h3>
          <LoadingState
            height="var(--stable-detail-section-height)"
            :loading="historyLoading[purpose]"
            :failed="historyFailed[purpose]"
            retryable
            @retry="loadHistory(purpose)"
          >
            <p v-if="!histories[purpose].length" class="ma-muted">{{ t('ma.noHistory') }}</p>
            <template v-else>
              <t-collapse v-model="expandedHistory[purpose]" class="test-history-list" borderless>
                <t-collapse-panel
                  v-for="record in histories[purpose]"
                  :key="record.id"
                  :value="record.id"
                >
                  <template #header>
                    <div class="test-history-summary">
                      <t-link theme="primary" @click.stop="emit('test', model, purpose, record)">{{
                        formatDateTime(record.started_at)
                      }}</t-link>
                      <t-tag variant="light" :theme="statusTheme(record.status)">{{
                        t('ma.' + record.status)
                      }}</t-tag>
                      <span class="test-history-meta">
                        {{ t('ma.' + record.trigger_type) }} · {{ record.triggered_by || '—' }}
                      </span>
                    </div>
                  </template>
                  <template #headerRightContent>
                    <span class="test-history-meta">{{
                      t('ma.passedCount', {
                        n: record.checks.filter((check) => check.status === 'PASSED').length,
                        total: record.checks.length,
                      })
                    }}</span>
                  </template>
                  <TestResultMatrix :checks="record.checks" />
                </t-collapse-panel>
              </t-collapse>
              <t-pagination
                :current="historyPages[purpose]"
                :page-size="historyPageSize"
                :total="historyTotals[purpose]"
                :show-page-size="false"
                @current-change="
                  (page: number) => {
                    historyPages[purpose] = page
                    loadHistory(purpose)
                  }
                "
              />
            </template>
          </LoadingState>
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
      </div></LoadingState
    >
  </t-drawer>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLatestRequest } from '@/utils/useLatestRequest'
import LoadingState from '@/components/LoadingState.vue'
import PricingSummary from './PricingSummary.vue'
import TestResultMatrix from './TestResultMatrix.vue'
import { useI18n } from 'vue-i18n'
import {
  accessApi,
  type Model,
  type Provider,
  type Pricing,
  type TestRun,
} from '@/api/modules/modelAccess'
import { formatDateTime } from '@/utils/datetime'
import { invocationLabel, statusTheme, tagLabel } from './helpers'
const props = defineProps<{ id: string; providers: Provider[] }>()
const emit = defineEmits<{
  close: []
  edit: [id: string]
  test: [model: Model, purpose: 'HEALTH' | 'ADMISSION', run?: TestRun]
}>()
const { t } = useI18n()
const pricePageSize = 5
const historyPageSize = 5
const model = ref<Model>(),
  currentPrice = ref<Pricing>(),
  loading = ref(true),
  failed = ref(false),
  priceHistory = ref<Pricing[]>([]),
  pricePage = ref(1),
  priceTotal = ref(0)
const histories = ref<Record<'ADMISSION' | 'HEALTH', TestRun[]>>({ ADMISSION: [], HEALTH: [] })
const expandedHistory = ref<Record<'ADMISSION' | 'HEALTH', Array<string | number>>>({
  ADMISSION: [],
  HEALTH: [],
})
const historyPages = ref({ ADMISSION: 1, HEALTH: 1 }),
  historyTotals = ref({ ADMISSION: 0, HEALTH: 0 })
const pricesLoading = ref(false),
  pricesFailed = ref(false)
const historyLoading = ref({ ADMISSION: false, HEALTH: false })
const historyFailed = ref({ ADMISSION: false, HEALTH: false })
const pricesRequest = useLatestRequest()
const historyRequests = { ADMISSION: useLatestRequest(), HEALTH: useLatestRequest() }
const modelRequest = useLatestRequest()
const loadRequest = useLatestRequest()
async function loadHistory(purpose: 'ADMISSION' | 'HEALTH') {
  const current = historyRequests[purpose].begin()
  historyLoading.value[purpose] = true
  historyFailed.value[purpose] = false
  try {
    const data = await accessApi.history(
      props.id,
      purpose,
      historyPages.value[purpose],
      historyPageSize,
    )
    if (!current.isCurrent()) return
    const previousIds = new Set(histories.value[purpose].map((record) => record.id))
    const retained = expandedHistory.value[purpose].filter((id) =>
      data.items.some((record) => record.id === id),
    )
    const pageChanged = !data.items.some((record) => previousIds.has(record.id))
    expandedHistory.value[purpose] = pageChanged && data.items[0] ? [data.items[0].id] : retained
    histories.value[purpose] = data.items
    historyTotals.value[purpose] = data.total
  } catch {
    if (current.isCurrent()) historyFailed.value[purpose] = true
  } finally {
    if (current.isCurrent()) historyLoading.value[purpose] = false
  }
}
const lifecycleEvents = computed(() => {
  const chronological = [...(model.value?.lifecycle_events ?? [])].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  )
  return chronological
    .map((event, index) => ({ ...event, fromStatus: chronological[index - 1]?.status }))
    .reverse()
})
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
    [t('ma.lastCheckLabel'), formatDateTime(m.health_checked_at) || '—'],
    [t('ma.priceSummary'), pricesFailed.value ? t('common.loadFailed') : '—'],
    [
      t('ma.admissionAt'),
      historyFailed.value.ADMISSION
        ? t('common.loadFailed')
        : formatDateTime(
            histories.value.ADMISSION.find((x) => x.status === 'PASSED')?.completed_at,
          ) || '—',
    ],
    [t('ma.description'), m.description || '—'],
    [t('ma.created'), formatDateTime(m.created_at)],
  ]
})
async function loadPrices() {
  const current = pricesRequest.begin()
  pricesLoading.value = true
  pricesFailed.value = false
  try {
    const p = await accessApi.prices(props.id, pricePage.value, pricePageSize)
    if (!current.isCurrent()) return
    priceHistory.value = p.items
    if (pricePage.value === 1) currentPrice.value = p.items[0]
    priceTotal.value = p.total
  } catch {
    if (current.isCurrent()) pricesFailed.value = true
  } finally {
    if (current.isCurrent()) pricesLoading.value = false
  }
}
async function refresh() {
  const current = modelRequest.begin()
  const [updated] = await Promise.all([
    accessApi.model(props.id),
    loadPrices(),
    ...(['ADMISSION', 'HEALTH'] as const).map(loadHistory),
  ])
  if (current.isCurrent()) model.value = updated
}
async function refreshTest(purpose: 'ADMISSION' | 'HEALTH') {
  const current = modelRequest.begin()
  const [updated] = await Promise.all([accessApi.model(props.id), loadHistory(purpose)])
  if (current.isCurrent()) model.value = updated
}
defineExpose({ refresh, refreshTest })
async function loadDetail() {
  const current = loadRequest.begin()
  loading.value = true
  failed.value = false
  try {
    await refresh()
  } catch {
    if (current.isCurrent()) failed.value = true
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
onMounted(loadDetail)
</script>
<style scoped src="./access.css"></style>
