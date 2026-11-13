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
        <t-alert v-if="canReadPrice" theme="info" :message="t('ma.priceDisclaimer')" />
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
          <h3 v-if="canReadPrice">{{ t('ma.priceHistory') }}</h3>
          <LoadingState
            height="var(--stable-detail-section-height)"
            v-if="canReadPrice"
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
                  loadPriceHistory()
                }
              "
            />
          </LoadingState>
        </div>
        <div
          v-for="purpose in canReadChecks ? (['ADMISSION', 'HEALTH'] as const) : []"
          :key="purpose"
          class="ma-stack"
        >
          <h3>{{ t(purpose === 'HEALTH' ? 'ma.healthHistory' : 'ma.admissionHistory') }}</h3>
          <p class="test-history-meta">{{ t('ma.matrixHelp') }}</p>
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
                        n:
                          record.counts?.passed_items ??
                          record.checks.filter((check) => check.status === 'PASSED').length,
                        total: record.counts
                          ? Object.values(record.counts).reduce((sum, count) => sum + count, 0)
                          : record.checks.length,
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLatestRequest } from '@/utils/useLatestRequest'
import LoadingState from '@/components/LoadingState.vue'
import PricingSummary from './PricingSummary.vue'
import TestResultMatrix from './TestResultMatrix.vue'
import { useI18n } from 'vue-i18n'
import { accessApi, type Model, type Pricing, type TestRun } from '@/api/modules/modelAccess'
import { useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
import { invocationLabel, statusTheme, tagLabel } from './helpers'
const props = defineProps<{ id: string }>()
const emit = defineEmits<{
  close: []
  edit: [id: string]
  test: [model: Model, purpose: 'HEALTH' | 'ADMISSION', run?: TestRun]
}>()
const { t } = useI18n()
const user = useUserStore()
const canReadPrice = computed(() => user.permissions.includes('model.pricing'))
const canReadChecks = computed(() => user.permissions.includes('model.admission'))
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
async function loadHistory(purpose: 'ADMISSION' | 'HEALTH', completedRun?: TestRun) {
  if (!canReadChecks.value) return
  const current = historyRequests[purpose].begin()
  historyLoading.value[purpose] = true
  historyFailed.value[purpose] = false
  try {
    const data = await accessApi.history(
      props.id,
      purpose,
      historyPages.value[purpose],
      historyPageSize,
      { signal: current.signal },
    )
    if (!current.isCurrent()) return
    const previousIds = new Set(histories.value[purpose].map((record) => record.id))
    const retained = expandedHistory.value[purpose].filter((id) =>
      data.items.some((record) => record.id === id),
    )
    const pageChanged = !data.items.some((record) => previousIds.has(record.id))
    expandedHistory.value[purpose] = pageChanged && data.items[0] ? [data.items[0].id] : retained
    const previousDetails = new Map(histories.value[purpose].map((record) => [record.id, record]))
    histories.value[purpose] = data.items.map((record) => {
      const known = completedRun?.id === record.id ? completedRun : previousDetails.get(record.id)
      return known?.model_id === props.id &&
        known.dto &&
        known.status !== 'RUNNING' &&
        known.status === record.status
        ? known
        : record
    })
    historyTotals.value[purpose] = data.total
  } catch {
    if (current.isCurrent()) historyFailed.value[purpose] = true
  } finally {
    if (current.isCurrent()) historyLoading.value[purpose] = false
  }
}
const lifecycleEvents = computed(() => model.value?.lifecycle_events ?? [])
const info = computed(() => {
  if (!model.value) return []
  const m = model.value
  return [
    [t('ma.name'), m.model_id_at_gateway],
    [t('ma.provider'), m.provider_name || '—'],
    [t('ma.upstream'), m.model_id_at_provider],
    [t('ma.baseUrl'), m.provider_base_url || '—'],
    [t('ma.security'), m.security_level ? t('ma.' + m.security_level) : '—'],
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
    ...(canReadPrice.value
      ? [[t('ma.priceSummary'), pricesFailed.value ? t('common.loadFailed') : '—']]
      : []),
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
function loadPrices() {
  return loadPriceHistory(true)
}
async function loadPriceHistory(refreshCurrent = false) {
  if (!canReadPrice.value) return
  const current = pricesRequest.begin()
  pricesLoading.value = true
  pricesFailed.value = false
  try {
    const [p, price] = await Promise.all([
      accessApi.prices(props.id, pricePage.value, pricePageSize, { signal: current.signal }),
      refreshCurrent ? accessApi.pricing(props.id, { signal: current.signal }) : undefined,
    ])
    if (!current.isCurrent()) return
    priceHistory.value = p.items
    if (price) currentPrice.value = price
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
    accessApi.model(props.id, true, { signal: current.signal }),
    loadPrices(),
    ...(['ADMISSION', 'HEALTH'] as const).map((purpose) => loadHistory(purpose)),
  ])
  if (current.isCurrent()) model.value = updated
}
async function refreshTest(purpose: 'ADMISSION' | 'HEALTH', completedRun?: TestRun) {
  const current = modelRequest.begin()
  const [updated] = await Promise.all([
    accessApi.model(props.id, true, { signal: current.signal }),
    loadHistory(purpose, completedRun),
  ])
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
const pendingHistoryDetails = new Set<string>()
const historyDetailsController = new AbortController()
onBeforeUnmount(() => historyDetailsController.abort())
watch(
  expandedHistory,
  async (values) => {
    for (const purpose of ['ADMISSION', 'HEALTH'] as const)
      for (const id of values[purpose]) {
        const record = histories.value[purpose].find((r) => r.id === id)
        const key = `${purpose}:${id}`
        if (record && !record.dto && !pendingHistoryDetails.has(key)) {
          pendingHistoryDetails.add(key)
          try {
            const detail = await accessApi.test(
              props.id,
              purpose,
              record.id,
              historyDetailsController.signal,
            )
            const index = histories.value[purpose].findIndex((r) => r.id === id)
            if (index >= 0) histories.value[purpose][index] = detail
          } catch {
            /* The request layer reports the error. */
          } finally {
            pendingHistoryDetails.delete(key)
          }
        }
      }
  },
  { deep: true },
)
onMounted(loadDetail)
</script>
<style scoped src="./access.css"></style>
