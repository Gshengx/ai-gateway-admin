<template>
  <t-drawer
    class="model-form-drawer"
    :close-btn="true"
    :visible="true"
    :header="t(model.id ? 'ma.editTitle' : 'ma.createTitle')"
    size="min(100vw, var(--physical-model-form-width))"
    :close-on-overlay-click="false"
    :confirm-btn="{
      theme: 'primary',
      content: t(model.id ? 'ma.save' : 'ma.create'),
      loading: saving,
    }"
    :cancel-btn="t('ma.cancel')"
    @close="emit('close')"
    @confirm="save"
  >
    <div v-if="error" ref="errorNotice" class="model-form-error">
      <t-alert theme="error" :message="error" />
    </div>
    <t-loading :loading="loading"
      ><t-tabs v-model="tab">
        <t-tab-panel value="basic" :label="t('ma.basic')"
          ><t-form
            class="ma-form ma-section"
            :disabled="basicLocked"
            label-align="top"
            required-mark-position="right"
          >
            <div class="ma-grid">
              <t-form-item :label="t('ma.provider')" required-mark
                ><t-select
                  v-model="model.provider_id"
                  :disabled="basicLocked"
                  :placeholder="t('ma.chooseProvider')"
                  :options="providers.map((p) => ({ label: p.name, value: p.id }))" /></t-form-item
              ><t-form-item :label="t('ma.upstream')" required-mark
                ><t-input
                  v-model="model.model_id_at_provider"
                  :disabled="basicLocked"
                  :placeholder="t('ma.upstreamHint')"
                  @change="prefill"
                  @blur="loadMetadata"
              /></t-form-item>
            </div>
            <t-form-item :label="t('ma.name')" required-mark
              ><div class="ma-stack">
                <t-input
                  v-model="model.model_id_at_gateway"
                  :disabled="basicLocked"
                  :placeholder="t('ma.nameHint')"
                  @change="nameChanged"
                /><span class="ma-muted">{{ t('ma.nameHelp') }}</span
                ><t-alert
                  v-if="model.id && !basicLocked"
                  theme="warning"
                  :message="t('ma.renameHelp')"
                /></div
            ></t-form-item>
            <InvocationEditor
              v-model:standard="model.supported_invocation_apis"
              v-model:custom="model.custom_invocation_apis"
              :disabled="basicLocked"
            />
            <div class="ma-grid">
              <t-form-item :label="t('ma.input')"
                ><t-select
                  v-model="model.input_modalities"
                  multiple
                  filterable
                  creatable
                  :options="
                    [...new Set([...inputModalities, ...model.input_modalities])].map((v) => ({
                      value: v,
                      label: v,
                    }))
                  "
                  @create="
                    (v: string | number | boolean | bigint) =>
                      addModality('input_modalities', String(v))
                  " /></t-form-item
              ><t-form-item :label="t('ma.output')"
                ><t-select
                  v-model="model.output_modalities"
                  multiple
                  filterable
                  creatable
                  :options="
                    [...new Set([...outputModalities, ...model.output_modalities])].map((v) => ({
                      value: v,
                      label: v,
                    }))
                  "
                  @create="
                    (v: string | number | boolean | bigint) =>
                      addModality('output_modalities', String(v))
                  "
              /></t-form-item>
            </div>
            <t-form-item :label="t('ma.tags')"
              ><t-select
                v-model="model.tags"
                multiple
                filterable
                creatable
                :options="
                  [
                    'TEXT_GENERATION',
                    'EMBEDDING',
                    'REASONING',
                    'STREAMING',
                    'TOOL_CALLING',
                    'JSON_MODE',
                    'VISION',
                  ].map((v) => ({
                    value: v,
                    label: tagLabel(v),
                  }))
                "
            /></t-form-item>
            <p class="ma-muted">{{ t('ma.metadataHelp') }}</p>
            <div class="ma-grid">
              <t-form-item :label="t('ma.context')"
                ><t-input-number
                  v-model="contextK"
                  :min="0"
                  :decimal-places="3"
                  :placeholder="t('ma.noMetadata')"
                  suffix="K Token" /></t-form-item
              ><t-form-item :label="t('ma.maxOutput')"
                ><t-input-number
                  v-model="outputK"
                  :min="0"
                  :decimal-places="3"
                  :placeholder="t('ma.noMetadata')"
                  suffix="K Token"
              /></t-form-item>
            </div>
            <t-form-item :label="t('ma.description')"
              ><t-textarea v-model="model.description" :placeholder="t('ma.optional')"
            /></t-form-item>
            <div class="ma-box ma-stack model-health-card">
              <div class="ma-row ma-between">
                <h3>{{ t('ma.healthTitle') }}</h3>
                <t-tag variant="light" :theme="statusTheme(model.health_status)">{{
                  t('ma.' + model.health_status)
                }}</t-tag>
              </div>
              <p class="ma-muted">{{ t('ma.healthHelp') }}</p>
              <div class="model-health-fields">
                <t-checkbox v-model="model.auto_health_check" :disabled="basicLocked">{{
                  t('ma.autoHealth')
                }}</t-checkbox>
                <div class="ma-row model-health-fields__interval">
                  <span>{{ t('ma.interval') }}</span
                  ><t-select
                    v-model="model.health_check_interval_minutes"
                    :disabled="basicLocked || !model.auto_health_check"
                    :options="
                      [60, 360, 720, 1440].map((v) => ({
                        value: v,
                        label: t('ma.hours', { n: v / 60 }),
                      }))
                    "
                  />
                </div>
              </div>
              <p class="ma-muted">{{ t('ma.autoHealthHelp') }}</p>
            </div>
          </t-form></t-tab-panel
        >
        <t-tab-panel value="permissions" :label="t('ma.grants')"
          ><PermissionsEditor
            v-if="tab === 'permissions'"
            v-model="grants"
            :model-id="model.id || undefined"
            class="ma-section"
        /></t-tab-panel>
        <t-tab-panel value="price" :label="t('ma.pricing')"
          ><PricingEditor
            ref="priceEditor"
            v-model="price"
            :defaults="defaultPrice"
            class="ma-section"
        /></t-tab-panel> </t-tabs
    ></t-loading>
    <template #footer
      ><div class="ma-footer">
        <t-button theme="default" @click="emit('close')">{{ t('ma.cancel') }}</t-button>
        <t-button theme="primary" :loading="saving" @click="save">{{
          t(model.id ? 'ma.save' : 'ma.create')
        }}</t-button>
      </div></template
    >
  </t-drawer>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  accessApi,
  blankModel,
  blankPricing,
  inputModalities,
  outputModalities,
  type Provider,
  type Permission,
} from '@/api/modules/modelAccess'
import { statusTheme, tagLabel } from './helpers'
import PricingEditor from './PricingEditor.vue'
import InvocationEditor from './InvocationEditor.vue'
import { validInvocationPath } from '@/utils/modelInvocation'
import PermissionsEditor from './PermissionsEditor.vue'
import type { NotifiedError } from '@/api/request'
const props = defineProps<{ modelId?: string; providerId?: string; providers: Provider[] }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t } = useI18n()
const model = ref({ ...blankModel(), provider_id: props.providerId ?? '' }),
  price = ref(blankPricing()),
  defaultPrice = ref(blankPricing()),
  grants = ref<Permission[]>([])
const priceEditor = ref<InstanceType<typeof PricingEditor>>()
const errorNotice = ref<HTMLElement>()
const tab = ref('basic'),
  loading = ref(false),
  saving = ref(false),
  error = ref('')
watch(
  error,
  async (message) => {
    if (!message) return
    await nextTick()
    requestAnimationFrame(() => {
      errorNotice.value?.closest('.t-drawer__body')?.scrollTo({ top: 0 })
    })
  },
  { flush: 'sync' },
)
let originalPrice = JSON.stringify(price.value)
const basicLocked = computed(() => !!model.value.id && model.value.status !== 'DRAFT')
const contextK = computed({
  get: () => (model.value.context_window === null ? undefined : model.value.context_window / 1000),
  set: (value: number | undefined) => {
    model.value.context_window = value == null ? null : Math.round(value * 1000)
  },
})
const outputK = computed({
  get: () =>
    model.value.max_output_tokens === null ? undefined : model.value.max_output_tokens / 1000,
  set: (value: number | undefined) => {
    model.value.max_output_tokens = value == null ? null : Math.round(value * 1000)
  },
})
let lastAutomaticName = ''
let manualName = false
function prefill(value: string) {
  if (
    !model.value.id &&
    !manualName &&
    (!model.value.model_id_at_gateway || model.value.model_id_at_gateway === lastAutomaticName)
  ) {
    model.value.model_id_at_gateway = value
    lastAutomaticName = value
  }
}
let metadataRequest = 0
async function loadMetadata() {
  if (model.value.id) return
  const request = ++metadataRequest
  const name = model.value.model_id_at_provider.trim()
  if (!model.value.provider_id || !name) return
  const [metadata, pricing] = await Promise.all([
    accessApi.metadata(model.value.provider_id, name),
    accessApi.catalog(name),
  ])
  if (request !== metadataRequest || model.value.model_id_at_provider.trim() !== name) return
  Object.assign(model.value, metadata)
  defaultPrice.value = JSON.parse(JSON.stringify(pricing))
  price.value = pricing
  originalPrice = JSON.stringify(pricing)
}
watch(
  () => model.value.provider_id,
  () => {
    void loadMetadata()
  },
)
function nameChanged(value: string) {
  manualName = !!value && value !== lastAutomaticName
}
function addModality(key: 'input_modalities' | 'output_modalities', value: string) {
  const tag = value.trim()
  if (tag) model.value[key] = [...new Set([...model.value[key], tag])]
}
async function save() {
  error.value = ''
  const m = model.value
  if (
    !basicLocked.value &&
    (!m.provider_id ||
      !m.model_id_at_gateway.trim() ||
      !m.model_id_at_provider.trim() ||
      !m.supported_invocation_apis.length)
  ) {
    tab.value = 'basic'
    error.value = t('ma.required')
    return
  }
  if (
    !basicLocked.value &&
    m.custom_invocation_apis.some((api) => !validInvocationPath(api.path))
  ) {
    tab.value = 'basic'
    error.value = t('ma.invalidApiPath')
    return
  }
  if (priceEditor.value && !priceEditor.value.validate()) {
    tab.value = 'price'
    return
  }
  saving.value = true
  try {
    const result = basicLocked.value ? m : await accessApi.saveModel(m)
    if (!m.id && grants.value.length) await accessApi.grant(result.id, grants.value)
    model.value.id = result.id
    if (
      JSON.stringify(price.value) !== originalPrice &&
      price.value.metric_rates.length > 0 &&
      (price.value.pricing_mode === 'TIME_BASED' ||
        price.value.metric_rates.some((r) => r.unit_price !== null))
    )
      await accessApi.savePrice(result.id, price.value)
    emit('saved')
    emit('close')
  } catch (e) {
    const detail = (e as NotifiedError).params?.fields as Record<string, string> | undefined
    error.value = t(
      detail?.model_access === 'NAME_CONFLICT'
        ? 'ma.nameConflict'
        : detail?.model_access === 'INVALID_API_PATH'
          ? 'ma.invalidApiPath'
          : 'ma.required',
    )
  } finally {
    saving.value = false
  }
}
onMounted(async () => {
  if (props.modelId) {
    loading.value = true
    try {
      ;[model.value, price.value] = await Promise.all([
        accessApi.model(props.modelId),
        accessApi.pricing(props.modelId),
      ])
      originalPrice = JSON.stringify(price.value)
      defaultPrice.value = await accessApi.catalog(model.value.model_id_at_provider)
      const current = price.value.metric_rates
      price.value.metric_rates = defaultPrice.value.metric_rates.map((rate) => {
        const existing = current.find((item) => item.metric_key === rate.metric_key)
        if (existing) return existing
        const added = JSON.parse(JSON.stringify(rate)) as typeof rate
        if (price.value.pricing_mode === 'TIME_BASED') {
          added.period_prices = Object.fromEntries(
            price.value.time_periods.map((period) => [
              period.id,
              period.is_fallback ? (added.unit_price ?? 0) : 0,
            ]),
          )
        }
        return added
      })
    } finally {
      loading.value = false
    }
  }
})
</script>
<style scoped src="./access.css"></style>
