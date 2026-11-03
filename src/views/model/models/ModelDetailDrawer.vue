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
const props = defineProps<{ model: PhysicalModelItem; provider?: ProviderItem }>()
const emit = defineEmits<{
  close: []
  edit: [id: string]
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
function priceText(p: ModelPricing) {
  return (
    tr('input') +
    ' ' +
    p.input_price +
    ' · ' +
    tr('cached') +
    ' ' +
    (p.cached_input_price ?? '—') +
    ' · ' +
    tr('output') +
    ' ' +
    p.output_price +
    ' ' +
    p.currency +
    ' / ' +
    tr('millionTokens')
  )
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
  })
  runs.value = result.items
  runTotal.value = result.total
}
watch(
  () => props.model.id,
  async () => {
    busy.value = true
    error.value = false
    pricePage.value = runPage.value = 1
    try {
      const [m, p] = await Promise.all([
        getModelApi(props.model.id),
        getModelPricingApi(props.model.id),
        loadPrices(),
        loadRuns(),
      ])
      detail.value = m
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
          :theme="
            detail.status === 'ACTIVE'
              ? 'success'
              : detail.status === 'SUSPENDED'
                ? 'danger'
                : 'default'
          "
          >{{ t(`models.${detail.status}`) }}</t-tag
        ><t-button
          v-if="!['TESTING', 'PENDING_REVIEW'].includes(detail.status)"
          v-permission.write="'model.models'"
          theme="default"
          @click="emit('edit', detail.id)"
          >{{ t('models.edit') }}</t-button
        >
      </div>
      <dl class="fields">
        <dt>{{ t('models.provider') }}</dt>
        <dd>{{ provider?.name || '—' }}</dd>
        <dt>{{ t('models.api') }}</dt>
        <dd>
          <code>{{ provider?.base_url || '—' }}</code>
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
        </dd>
        <dt>{{ t('models.type') }}</dt>
        <dd>{{ t(`models.types.${detail.model_type}`) }}</dd>
        <dt>{{ t('model.modelsForm.invocationApi') }}</dt>
        <dd>{{ t(`model.modelsForm.INVOCATION_${detail.invocation_api}`) }}</dd>
        <dt>{{ t('model.modelsForm.contextWindow') }}</dt>
        <dd>{{ detail.declared_capabilities.context_window ?? '—' }}</dd>
        <dt>{{ t('model.modelsForm.maxOutputTokens') }}</dt>
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
      <section>
        <h3>{{ tr('priceHistory') }}</h3>
        <p v-if="!prices.length">{{ tr('noPriceHistory') }}</p>
        <div v-for="(p, index) in prices" :key="p.revision" class="history">
          <div class="history-heading">
            <strong>{{ index === 0 && pricePage === 1 ? tr('currentPrice') : tr('price') }}</strong
            ><span>{{ formatDateTime(p.created_at) }} · {{ p.created_by }}</span>
          </div>
          <p>{{ priceText(p) }}</p>
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
      <section>
        <h3>{{ tr('admissionHistory') }}</h3>
        <p v-if="!runs.length">{{ tr('noAdmissionHistory') }}</p>
        <div v-for="run in runs" :key="run.run_id" class="history">
          <div class="history-heading">
            <span>{{ formatDateTime(run.sealed_at) || '—' }}</span
            ><t-link theme="primary" @click="emit('result', detail, run)">{{
              t(`models.admission.statuses.${run.status}`)
            }}</t-link>
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
    </t-loading>
  </t-drawer>
</template>
<style scoped>
.actions,
.history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-s);
}
.fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--td-comp-margin-s) var(--td-comp-margin-l);
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
}
h3 {
  font: var(--td-font-title-medium);
  margin: 0 0 var(--td-comp-margin-l);
}
.history {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-default);
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  margin-bottom: var(--td-comp-margin-l);
}
.history-heading span {
  color: var(--td-text-color-secondary);
}
</style>
