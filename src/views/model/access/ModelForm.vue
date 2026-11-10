<template>
  <t-drawer
    class="model-form-drawer"
    :close-btn="!saving && !permissionsBusy"
    :visible="true"
    :header="t(modelId ? 'ma.editTitle' : 'ma.createTitle')"
    size="min(100vw, var(--physical-model-form-width))"
    :close-on-overlay-click="false"
    :confirm-btn="{
      theme: 'primary',
      content: t(modelId || model.id ? 'ma.save' : 'ma.create'),
      loading: saving,
      disabled: loading || loadFailed || permissionsBusy || saving,
    }"
    :cancel-btn="{ content: t('ma.cancel'), disabled: saving || permissionsBusy }"
    :close-on-esc-keydown="!saving && !permissionsBusy"
    @close="close"
    @confirm="save"
  >
    <div v-if="error" ref="errorNotice" class="model-form-error">
      <t-alert theme="error" :message="error" />
    </div>
    <LoadingState :loading="loading" :failed="loadFailed" retryable @retry="loadModel"
      ><t-tabs ref="tabsRef" v-model="tab" class="drawer-tabs">
        <t-tab-panel :disabled="saving || permissionsBusy" value="basic" :label="t('ma.basic')"
          ><t-form
            class="ma-form ma-section"
            :disabled="saving"
            label-align="top"
            required-mark-position="right"
          >
            <div class="ma-grid">
              <t-form-item :label="t('ma.provider')" required-mark
                ><t-select
                  v-model="model.provider_id"
                  :disabled="basicLocked || saving"
                  :placeholder="t('ma.chooseProvider')"
                  :options="providers.map((p) => ({ label: p.name, value: p.id }))" /></t-form-item
              ><t-form-item :label="t('ma.upstream')" required-mark
                ><t-input
                  v-model="model.model_id_at_provider"
                  :disabled="basicLocked || saving"
                  :placeholder="t('ma.upstreamHint')"
                  @change="prefill"
                  @blur="loadMetadata"
              /></t-form-item>
            </div>
            <t-form-item :label="t('ma.name')" required-mark
              ><div class="ma-stack">
                <t-input
                  v-model="model.model_id_at_gateway"
                  :disabled="basicLocked || saving"
                  :placeholder="t('ma.nameHint')"
                  :status="nameError ? 'error' : undefined"
                  @change="nameChanged"
                  @blur="validateName"
                /><span v-if="nameError" class="ma-error" role="alert">{{ nameError }}</span>
                <span class="ma-muted">{{ t('ma.nameHelp') }}</span
                ><t-alert
                  v-if="model.id && !basicLocked"
                  theme="warning"
                  :message="t('ma.renameHelp')"
                /></div
            ></t-form-item>
            <InvocationEditor
              v-model:standard="model.supported_invocation_apis"
              v-model:custom="model.custom_invocation_apis"
              :disabled="basicLocked || saving"
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
                <t-checkbox v-model="model.auto_health_check" :disabled="saving">{{
                  t('ma.autoHealth')
                }}</t-checkbox>
                <div class="ma-row model-health-fields__interval">
                  <span>{{ t('ma.interval') }}</span
                  ><t-select
                    v-model="model.health_check_interval_minutes"
                    :disabled="saving || !model.auto_health_check"
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
        <t-tab-panel
          :disabled="saving || permissionsBusy"
          value="permissions"
          :label="t('ma.grants')"
          ><PermissionsEditor
            :inert="saving"
            @busy-change="permissionsBusy = $event"
            v-if="tab === 'permissions'"
            v-model="grants"
            :model-id="model.id || undefined"
            class="ma-section"
        /></t-tab-panel>
        <t-tab-panel :disabled="saving || permissionsBusy" value="price" :label="t('ma.pricing')"
          ><PricingEditor :inert="saving" ref="priceEditor" v-model="price" class="ma-section"
        /></t-tab-panel> </t-tabs
    ></LoadingState>
    <template #footer
      ><div class="ma-footer">
        <t-button theme="default" @click="emit('close')">{{ t('ma.cancel') }}</t-button>
        <t-button
          theme="primary"
          :loading="saving"
          :disabled="loading || loadFailed"
          @click="save"
          >{{ t(modelId || model.id ? 'ma.save' : 'ma.create') }}</t-button
        >
      </div></template
    >
  </t-drawer>
</template>
<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLatestRequest } from '@/utils/useLatestRequest'
import LoadingState from '@/components/LoadingState.vue'
import {
  accessApi,
  isModelNameAvailable,
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
import { useDrawerTabs } from '@/utils/useDrawerTabs'
import type { NotifiedError } from '@/api/request'
import request from '@/api/request'
import { getDepartmentBudgets, type Budget } from '@/api/modules/cost'
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
  loading = ref(true),
  saving = ref(false),
  error = ref('')
const loadFailed = ref(false)
const permissionsBusy = ref(false)
const nameError = ref('')
const nameRequest = useLatestRequest()
watch(
  () => model.value.model_id_at_gateway,
  () => {
    nameRequest.invalidate()
    nameError.value = ''
  },
  { flush: 'sync' },
)
async function validateName(): Promise<boolean> {
  const name = model.value.model_id_at_gateway.trim()
  if (!name || basicLocked.value) return true
  const current = nameRequest.begin()
  try {
    const available = await isModelNameAvailable(name, model.value.id || props.modelId)
    if (!current.isCurrent()) return false
    nameError.value = available ? '' : t('ma.nameConflict')
    return available
  } catch {
    if (current.isCurrent()) nameError.value = t('ma.nameCheckUnavailable')
    return false
  }
}
function close() {
  if (!saving.value && !permissionsBusy.value) emit('close')
}
const tabsRef = useDrawerTabs(tab)
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
let billingCurrency = 'CNY'
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
    nameRequest.schedule(() => void validateName())
  }
}
const metadataRequest = useLatestRequest()
async function loadMetadata() {
  if (model.value.id) return
  const current = metadataRequest.begin()
  const name = model.value.model_id_at_provider.trim()
  if (!model.value.provider_id || !name) return
  const result = await Promise.all([
    accessApi.metadata(model.value.provider_id, name),
    accessApi.catalog(name),
  ]).catch(() => undefined)
  if (!result) return
  const [metadata, pricing] = result
  if (!current.isCurrent() || model.value.model_id_at_provider.trim() !== name) return
  Object.assign(model.value, metadata)
  pricing.currency = billingCurrency
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
  if (loading.value || loadFailed.value || saving.value || permissionsBusy.value) return
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
    if (!(await validateName())) {
      tab.value = 'basic'
      return
    }
    m.model_id_at_gateway = m.model_id_at_gateway.trim()
    const result = await accessApi.saveModel(m)
    model.value.id = result.id
    if (!props.modelId && grants.value.length) {
      await accessApi.grant(result.id, grants.value)
      grants.value = []
    }
    if (
      JSON.stringify(price.value) !== originalPrice &&
      price.value.metric_rates.length > 0 &&
      (price.value.pricing_mode === 'TIME_BASED' ||
        price.value.metric_rates.some((r) => r.unit_price !== null))
    )
      await accessApi.savePrice(result.id, price.value)
    MessagePlugin.success(t('ma.success'))
    emit('saved')
    emit('close')
  } catch (e) {
    const detail = (e as NotifiedError).params?.fields as Record<string, string> | undefined
    if (detail?.model_access === 'NAME_CONFLICT' || (e as NotifiedError).code === 'NAME_CONFLICT') {
      nameError.value = t('ma.nameConflict')
      tab.value = 'basic'
      return
    }
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
const loadRequest = useLatestRequest()
async function loadModel() {
  const current = loadRequest.begin()
  loading.value = true
  loadFailed.value = false
  try {
    try {
      const budgets =
        import.meta.env.VITE_USE_MOCK === 'true'
          ? await getDepartmentBudgets({ page: 1, page_size: 1 })
          : await request.get<{ headquarters?: Budget }>('/budgets/departments', {
              params: { page: 1, page_size: 1 },
              skipErrorHandler: true,
            })
      billingCurrency = budgets.headquarters?.currency || 'CNY'
    } catch {
      // 总部预算尚未提供时，内部计费默认人民币。
    }
    if (!current.isCurrent()) return
    price.value.currency = billingCurrency
    defaultPrice.value.currency = billingCurrency
    if (props.modelId) {
      const [loadedModel, loadedPrice] = await Promise.all([
        accessApi.model(props.modelId),
        accessApi.pricing(props.modelId),
      ])
      if (!current.isCurrent()) return
      const catalog = await accessApi.catalog(loadedModel.model_id_at_provider)
      if (!current.isCurrent()) return
      model.value = loadedModel
      price.value = loadedPrice
      price.value.currency = billingCurrency
      originalPrice = JSON.stringify(price.value)
      defaultPrice.value = catalog
      defaultPrice.value.currency = billingCurrency
      const metricRates = price.value.metric_rates
      price.value.metric_rates = defaultPrice.value.metric_rates.map((rate) => {
        const existing = metricRates.find((item) => item.metric_key === rate.metric_key)
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
    }
  } catch {
    if (current.isCurrent()) loadFailed.value = true
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
onMounted(loadModel)
</script>
<style scoped src="./access.css"></style>
