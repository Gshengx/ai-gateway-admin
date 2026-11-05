<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getModelApi,
  getModelPricingApi,
  getModelPriceHistoryApi,
  getModelAdmissionHistoryApi,
  type PhysicalModelItem,
  type ModelPricing,
  type ModelPriceHistory,
  type AdmissionRun,
} from '@/api/modules/models'
import type { ProviderItem } from '@/api/modules/providers'
import { formatDateTime } from '@/utils/datetime'
import { mockModelLifecycle } from './mockLifecycle'
import { canReadResource, useUserStore } from '@/stores/modules/user'
const props = defineProps<{ model: PhysicalModelItem; provider?: ProviderItem }>()
const emit = defineEmits<{
  close: []
  edit: [id: string]
  review: [id: string]
  result: [model: PhysicalModelItem, run: AdmissionRun]
}>()
const { t } = useI18n()
const tr = (key: string) => t(`models.detailView.${key}`)
const detail = ref(props.model)
const price = ref<ModelPricing | null>(null)
const prices = ref<ModelPriceHistory[]>([])
const runs = ref<AdmissionRun[]>([])
const pricePage = ref(1)
const runPage = ref(1)
const priceTotal = ref(0)
const runTotal = ref(0)
const busy = ref(false)
const error = ref(false)
const lifecycle = computed(() =>
  import.meta.env.VITE_USE_MOCK === 'true' ? mockModelLifecycle(detail.value.status) : [],
)
const user = useUserStore()
const canReadPricing = computed(() => canReadResource(user.permissions, 'model.pricing'))
const canReadAdmission = computed(() => canReadResource(user.permissions, 'model.admission'))
const runSnapshot = ref<string>()
const mountPage = ref(1)
const mountTotal = ref(0)
async function loadMounts() {
  const result = await getModelApi(props.model.id, mountPage.value, 20)
  detail.value = { ...result, mounts: result.related_mounts?.items ?? result.mounts }
  mountTotal.value = result.related_mounts?.total ?? result.mounts.length
}
function priceText(p: ModelPricing) {
  return (
    tr('input') +
    ' ' +
    displayPrice(p.input_price) +
    ' · ' +
    tr('cached') +
    ' ' +
    displayPrice(p.cached_input_price) +
    ' · ' +
    tr('output') +
    ' ' +
    displayPrice(p.output_price) +
    ' ' +
    p.currency +
    ' / ' +
    tr('millionTokens')
  )
}
function displayPrice(value: string | null) {
  return value === null ? '—' : value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
}
function checkText(run: AdmissionRun) {
  return run.checks
    .flatMap((check) =>
      check.check_key === 'BASE_REQUEST'
        ? [
            t('models.admission.checks.BASE_REQUEST'),
            `${t(`model.modelsForm.INVOCATION_${detail.value.invocation_api}`)} ${tr('interface')}`,
          ]
        : [t(`models.admission.checks.${check.check_key}`)],
    )
    .join('、')
}
const capabilityText = computed(
  () =>
    (
      [
        'supports_streaming',
        'supports_tool_calling',
        'supports_json_mode',
        'supports_vision',
      ] as const
    )
      .filter((key) => detail.value.declared_capabilities[key] === true)
      .map((key) =>
        t(
          `model.modelsForm.${{ supports_streaming: 'streaming', supports_tool_calling: 'toolCalling', supports_json_mode: 'jsonMode', supports_vision: 'vision' }[key]}`,
        ),
      )
      .join('、') || '—',
)
async function loadPrices() {
  const result = await getModelPriceHistoryApi(props.model.id, {
    page: pricePage.value,
    page_size: 20,
  })
  prices.value = result.items
  priceTotal.value = result.total
}
async function loadRuns() {
  const result = await getModelAdmissionHistoryApi(props.model.id, {
    page: runPage.value,
    page_size: 20,
    ...(runPage.value > 1 && runSnapshot.value ? { page_snapshot: runSnapshot.value } : {}),
  })
  runs.value = result.items
  runTotal.value = result.total
  runSnapshot.value = result.page_snapshot
}
watch(
  () => props.model.id,
  async () => {
    busy.value = true
    error.value = false
    pricePage.value = runPage.value = 1
    mountPage.value = 1
    runSnapshot.value = undefined
    try {
      const [m, p] = await Promise.all([
        getModelApi(props.model.id, 1, 20),
        canReadPricing.value
          ? getModelPricingApi(props.model.id)
          : Promise.resolve({ price: null }),
        canReadPricing.value ? loadPrices() : Promise.resolve(),
        canReadAdmission.value ? loadRuns() : Promise.resolve(),
      ])
      detail.value = { ...m, mounts: m.related_mounts?.items ?? m.mounts }
      mountTotal.value = m.related_mounts?.total ?? m.mounts.length
      price.value = p.price
    } catch {
      error.value = true
    } finally {
      busy.value = false
    }
  },
  { immediate: true },
)
</script>
<template>
  <t-drawer
    :visible="true"
    :close-btn="true"
    :header="detail.model_id_at_provider"
    :footer="false"
    size="large"
    @close="emit('close')"
  >
    <t-loading :loading="busy" show-overlay>
      <t-alert v-if="error" theme="error" :message="tr('loadFailed')" />
      <div class="actions">
        <t-tag
          variant="light"
          :theme="
            detail.status === 'ACTIVE'
              ? 'success'
              : detail.status === 'SUSPENDED'
                ? 'danger'
                : detail.status === 'PENDING_REVIEW'
                  ? 'warning'
                  : 'default'
          "
          >{{ t(`models.${detail.status}`) }}</t-tag
        >
        <t-button
          v-if="detail.status === 'PENDING_REVIEW'"
          v-permission.write="'model.review'"
          theme="primary"
          @click="emit('review', detail.id)"
          >{{ t('models.admission.approve') }}</t-button
        >
        <t-button
          v-if="!['TESTING', 'PENDING_REVIEW'].includes(detail.status)"
          v-permission.write="'model.models'"
          theme="default"
          @click="emit('edit', detail.id)"
          >{{ t('models.edit') }}</t-button
        >
      </div>
      <dl class="fields">
        <dt>{{ t('models.provider') }}</dt>
        <dd>{{ detail.provider_name || provider?.name || '—' }}</dd>
        <dt>{{ t('models.api') }}</dt>
        <dd>
          <code>{{ detail.provider_base_url || provider?.base_url || '—' }}</code>
        </dd>
        <dt>{{ t('providers.securityLevel') }}</dt>
        <dd>{{ provider ? t(`providers.security.${provider.security_level}`) : '—' }}</dd>
        <dt>{{ t('models.logical') }}</dt>
        <dd>
          {{
            detail.mounts
              .map((m) => `${m.display_name}（${tr('priority')} ${m.priority}）`)
              .join('、') || '—'
          }}
          <t-pagination
            v-if="mountTotal > 20"
            v-model="mountPage"
            :total="mountTotal"
            :page-size="20"
            :show-page-size="false"
            @current-change="loadMounts"
          />
        </dd>
        <dt>{{ t('model.modelsForm.modelType') }}</dt>
        <dd>{{ t(`models.types.${detail.model_type}`) }}</dd>
        <dt>{{ t('model.modelsForm.invocationApi') }}</dt>
        <dd>{{ t(`model.modelsForm.INVOCATION_${detail.invocation_api}`) }}</dd>
        <dt>{{ tr('contextWindow') }}</dt>
        <dd>{{ detail.declared_capabilities.context_window ?? '—' }}</dd>
        <dt>{{ tr('maxOutput') }}</dt>
        <dd>{{ detail.declared_capabilities.max_output_tokens ?? '—' }}</dd>
        <dt>{{ t('model.modelsForm.capabilities') }}</dt>
        <dd>{{ capabilityText }}</dd>
        <dt>{{ tr('price') }}</dt>
        <dd>{{ price ? priceText(price) : '—' }}</dd>
        <dt>{{ tr('admission') }}</dt>
        <dd>{{ formatDateTime(runs[0]?.sealed_at) || '—' }}</dd>
        <dt>{{ t('model.modelsForm.description') }}</dt>
        <dd>{{ detail.description || '—' }}</dd>
        <dt>{{ t('models.created') }}</dt>
        <dd>{{ formatDateTime(detail.created_at) || '—' }}</dd>
      </dl>
      <section v-if="canReadPricing">
        <h3>{{ tr('priceHistory') }}</h3>
        <p v-if="!prices.length">{{ tr('noPriceHistory') }}</p>
        <div v-for="(p, index) in prices" :key="p.revision" class="history price-history">
          <div class="history-heading">
            <strong>{{ index === 0 && pricePage === 1 ? tr('currentPrice') : tr('price') }}</strong
            ><span>{{ formatDateTime(p.created_at) }} · {{ p.created_by_name || '—' }}</span>
          </div>
          <span class="history-price">{{ priceText(p) }}</span>
        </div>
        <t-pagination
          v-if="priceTotal > 20"
          v-model="pricePage"
          :total="priceTotal"
          :page-size="20"
          :show-page-size="false"
          @current-change="loadPrices"
        />
      </section>
      <section v-if="canReadAdmission">
        <h3>{{ tr('admissionHistory') }}</h3>
        <p v-if="!runs.length">{{ tr('noAdmissionHistory') }}</p>
        <div v-for="run in runs" :key="run.run_id" class="history admission-history">
          <div class="history-heading">
            <t-tag
              variant="light"
              :theme="
                run.status === 'PASSED'
                  ? 'success'
                  : ['FAILED', 'ERROR'].includes(run.status)
                    ? 'danger'
                    : 'warning'
              "
              >{{ t(`models.admission.statuses.${run.status}`) }}</t-tag
            >
            <span>{{ formatDateTime(run.sealed_at) || '—' }}</span>
          </div>
          <div class="history-result">
            <span>{{ checkText(run) }}</span>
            <t-link theme="primary" @click="emit('result', detail, run)">
              {{ tr('viewResult') }}
            </t-link>
          </div>
        </div>
        <t-pagination
          v-if="runTotal > 20"
          v-model="runPage"
          :total="runTotal"
          :page-size="20"
          :show-page-size="false"
          @current-change="loadRuns"
        />
      </section>
      <section>
        <h3>{{ tr('lifecycle') }}</h3>
        <p v-if="!lifecycle.length">{{ tr('lifecycleUnavailable') }}</p>
        <t-timeline v-else mode="same" theme="dot">
          <t-timeline-item
            v-for="(event, index) in lifecycle"
            :key="event.occurredAt"
            :dot-color="index === 0 ? 'primary' : 'default'"
          >
            <strong>{{
              event.previous
                ? `${t(`models.${event.previous}`)} → ${t(`models.${event.state}`)}`
                : `${tr('created')} · ${t(`models.${event.state}`)}`
            }}</strong>
            <p class="timeline-meta">
              {{ formatDateTime(event.occurredAt) }} · {{ tr('mockActor') }}
            </p>
          </t-timeline-item>
        </t-timeline>
      </section>
    </t-loading>
  </t-drawer>
</template>
<style scoped>
.actions,
.history-heading {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  flex-wrap: wrap;
}
.fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--td-comp-margin-l) var(--td-comp-margin-xxl);
  margin: var(--td-comp-margin-l) 0;
}
dt {
  color: var(--td-text-color-secondary);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
section {
  margin-top: var(--td-comp-margin-l);
  border-top: 1px solid var(--td-component-stroke);
  padding-top: var(--td-comp-paddingTB-l);
}
h3 {
  font: var(--td-font-title-medium);
  margin: 0 0 var(--td-comp-margin-l);
}
.history {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--td-comp-margin-s) var(--td-comp-margin-l);
  border-bottom: 1px solid var(--td-component-stroke);
  padding: var(--td-comp-paddingTB-l) 0;
}
.price-history {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}
.price-history .history-heading,
.history-price {
  overflow-wrap: anywhere;
}
.history-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--td-comp-margin-xs);
  overflow-wrap: anywhere;
}
section :deep(.t-pagination) {
  margin-top: var(--td-comp-margin-l);
}
.history:last-of-type {
  margin-bottom: var(--td-comp-margin-l);
}
.history-heading span {
  color: var(--td-text-color-secondary);
}
.timeline-meta {
  color: var(--td-text-color-placeholder);
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
}
</style>
