<template>
  <t-drawer
    class="model-form-drawer"
    :close-btn="!saving"
    :visible="drawerVisible"
    :show-overlay="showOverlay"
    :header="t(modelId ? 'ma.editTitle' : 'ma.createTitle')"
    size="min(100vw, var(--physical-model-form-width))"
    :close-on-overlay-click="false"
    :confirm-btn="{
      theme: 'primary',
      content: t(modelId || model.id ? 'ma.save' : 'ma.create'),
      loading: saving,
      disabled: loading || loadFailed || saving || preparing || preparationFailed,
    }"
    :cancel-btn="{ content: t('ma.cancel'), disabled: saving }"
    :close-on-esc-keydown="!saving"
    @close="close"
    @confirm="save"
  >
    <div v-if="error || preparationError" ref="errorNotice" class="model-form-error">
      <t-alert theme="error" :message="preparationError || error" />
    </div>
    <LoadingState :loading="loading" :failed="loadFailed" retryable @retry="loadModel"
      ><t-tabs ref="tabsRef" v-model="tab" class="drawer-tabs">
        <t-tab-panel :disabled="saving" value="basic" :label="t('ma.basic')"
          ><t-form
            class="ma-form ma-section"
            :disabled="saving"
            label-align="top"
            required-mark-position="right"
          >
            <div class="ma-grid">
              <t-form-item
                v-bind="basicFieldState('provider')"
                :label="t('ma.provider')"
                required-mark
                ><t-select
                  v-model="model.provider_id"
                  :disabled="basicLocked || saving"
                  :placeholder="t('ma.chooseProvider')"
                  :options="providerChoices"
                  :loading="providerOptionsLoading"
                  @popup-visible-change="
                    (visible: boolean) => visible && loadProviderOptions()
                  " /></t-form-item
              ><t-form-item
                v-bind="basicFieldState('upstream')"
                :label="t('ma.upstream')"
                required-mark
                ><t-input
                  v-model="model.model_id_at_provider"
                  :disabled="basicLocked || saving"
                  :placeholder="t('ma.upstreamHint')"
                  @change="prefill"
                  @blur="loadMetadata"
              /></t-form-item>
            </div>
            <t-form-item v-bind="basicFieldState('name')" :label="t('ma.name')" required-mark
              ><div class="ma-stack">
                <t-input
                  v-model="model.model_id_at_gateway"
                  :disabled="basicLocked || saving"
                  :placeholder="t('ma.nameHint')"
                  :status="nameError ? 'error' : undefined"
                  @change="nameChanged"
                  @blur="validateName()"
                /><span v-if="nameError" class="ma-error" role="alert">{{ nameError }}</span>
                <span class="ma-muted">{{ t('ma.nameHelp') }}</span
                ><t-alert
                  v-if="model.id && !basicLocked"
                  theme="warning"
                  :message="t('ma.renameHelp')"
                /></div
            ></t-form-item>
            <InvocationEditor
              :validate-required="basicValidationAttempted && !basicLocked"
              v-model:standard="model.supported_invocation_apis"
              v-model:custom="model.custom_invocation_apis"
              :disabled="basicLocked || saving"
            />
            <div class="ma-grid">
              <t-form-item :label="t('ma.input')"
                ><t-select
                  v-model="model.input_modalities"
                  :disabled="metadataLocked || saving"
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
                  :disabled="metadataLocked || saving"
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
                :disabled="metadataLocked || saving"
                multiple
                filterable
                creatable
                :options="tagChoices"
                @search="searchTags"
            /></t-form-item>
            <p class="ma-muted">{{ t('ma.metadataHelp') }}</p>
            <div class="ma-grid">
              <t-form-item v-bind="basicFieldState('context')" :label="t('ma.context')"
                ><t-input-number
                  v-nonnegative-number
                  v-model="contextK"
                  :disabled="metadataLocked || saving"
                  :min="0"
                  :decimal-places="3"
                  :placeholder="t('ma.noMetadata')"
                  suffix="K Token" /></t-form-item
              ><t-form-item v-bind="basicFieldState('output')" :label="t('ma.maxOutput')"
                ><t-input-number
                  v-nonnegative-number
                  v-model="outputK"
                  :disabled="metadataLocked || saving"
                  :min="0"
                  :decimal-places="3"
                  :placeholder="t('ma.noMetadata')"
                  suffix="K Token"
              /></t-form-item>
            </div>
            <t-form-item :label="t('ma.description')"
              ><t-textarea
                v-model="model.description"
                :disabled="metadataLocked || saving"
                :placeholder="t('ma.optional')"
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
          v-if="canReadPrice"
          :disabled="saving"
          :destroy-on-hide="false"
          value="price"
          :label="t('ma.pricing')"
        >
          <div v-if="!modelId" class="ma-stack ma-section">
            <t-checkbox v-model="configurePricing" :disabled="saving || !canWritePrice">{{
              t('pricingFlow.configure')
            }}</t-checkbox>
            <p class="ma-muted">{{ t('pricingFlow.optional') }}</p>
          </div>
          <PricingEditor
            v-if="modelId || configurePricing"
            :inert="saving || !canWritePrice"
            :default-price="defaultPrice"
            :load-default="model.id || price.metric_rates.length ? loadDefaultPricing : undefined"
            ref="priceEditor"
            v-model="price"
            class="ma-section"
          />
          <div v-if="!modelId && configurePricing && officialPrice" class="ma-stack ma-section">
            <h3>{{ t('pricingFlow.official') }}</h3>
            <p class="ma-muted">{{ t('pricingFlow.officialHint') }}</p>
            <PricingSummary :price="officialPrice" />
          </div>
        </t-tab-panel> </t-tabs
    ></LoadingState>
    <template #footer
      ><div class="ma-footer">
        <t-button theme="default" :disabled="saving" @click="close">{{ t('ma.cancel') }}</t-button>
        <t-button
          theme="primary"
          :loading="saving"
          :disabled="loading || loadFailed || preparing || preparationFailed"
          @click="save"
          >{{ t(modelId || model.id ? 'ma.save' : 'ma.create') }}</t-button
        >
      </div></template
    >
  </t-drawer>
  <t-dialog
    v-if="priceComparison"
    dialog-class-name="model-access-dialog"
    width="var(--physical-model-dialog-width)"
    :visible="true"
    :header="t('pricingFlow.comparison')"
    :close-on-overlay-click="false"
    :footer="false"
    @close="priceComparison = undefined"
  >
    <div class="ma-stack">
      <p>{{ t('pricingFlow.comparisonHint') }}</p>
      <h3>{{ t('pricingFlow.saved', { version: priceComparison.current.version }) }}</h3>
      <PricingSummary
        v-if="priceComparison.current.metric_rates.some((rate) => rate.unit_price !== null)"
        :price="priceComparison.current"
      />
      <p v-else>{{ t('pricingFlow.unpriced') }}</p>
      <h3>{{ t('pricingFlow.draft') }}</h3>
      <PricingSummary :price="priceComparison.draft" />
      <div class="ma-footer">
        <t-button theme="default" @click="priceComparison = undefined">{{
          t('pricingFlow.keep')
        }}</t-button>
        <t-button theme="default" @click="acceptPriceComparison(false)">{{
          t('pricingFlow.useCurrent')
        }}</t-button>
        <t-button theme="primary" @click="acceptPriceComparison(true)">{{
          t('pricingFlow.useDraft')
        }}</t-button>
      </div>
    </div>
  </t-dialog>
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
  type Pricing,
  type Model,
} from '@/api/modules/modelAccess'
import { statusTheme, tagLabel } from './helpers'
import PricingEditor from './PricingEditor.vue'
import PricingSummary from './PricingSummary.vue'
import InvocationEditor from './InvocationEditor.vue'
import { invocationConfigurationError } from '@/utils/modelInvocation'
import { useDrawerTabs } from '@/utils/useDrawerTabs'
import { useDrawerClose } from '@/utils/useDrawerClose'
import type { NotifiedError } from '@/api/request'
import { useUserStore } from '@/stores/modules/user'
import { normalizeModelId } from '@/utils/modelContract'
const props = withDefaults(
  defineProps<{ modelId?: string; providerId?: string; showOverlay?: boolean }>(),
  { showOverlay: true },
)
const emit = defineEmits<{ close: []; saved: [model: Model, previous: Model | undefined] }>()
const { visible: drawerVisible, close: closeDrawer } = useDrawerClose('.model-form-drawer', () =>
  emit('close'),
)
const { t, locale } = useI18n()
const user = useUserStore()
const canReadPrice = computed(() => user.permissions.includes('model.pricing'))
const canWritePrice = computed(() => user.permissions.includes('model.pricing:write'))
const configurePricing = ref(canReadPrice.value && canWritePrice.value)
const officialPrice = ref<Pricing>()
const priceComparison = ref<{ current: Pricing; draft: Pricing }>()
const model = ref({ ...blankModel(), provider_id: props.providerId ?? '' }),
  price = ref(blankPricing()),
  defaultPrice = ref<Pricing>()
const providerOptions = ref<Provider[]>([])
const providerOptionsLoading = ref(false)
const providerOptionsRequest = useLatestRequest()
let providersLoaded = false
let pendingProviderOptions: Promise<void> | undefined
const providerChoices = computed(() => {
  const options = providerOptions.value.map((provider) => ({
    label: provider.name,
    value: provider.id,
  }))
  if (
    model.value.provider_id &&
    model.value.provider_name &&
    !options.some((option) => option.value === model.value.provider_id)
  )
    options.push({ label: model.value.provider_name, value: model.value.provider_id })
  return options
})
function loadProviderOptions(): Promise<void> {
  if (pendingProviderOptions) return pendingProviderOptions
  if (providersLoaded) return Promise.resolve()
  const current = providerOptionsRequest.begin()
  providerOptionsLoading.value = true
  const pending = accessApi
    .providerOptions({}, { signal: current.signal })
    .then((result) => {
      if (!current.isCurrent()) return
      providerOptions.value = result.items
      providersLoaded = true
    })
    .catch(() => {
      // Keep the selected provider; reopening the dropdown retries the options request.
    })
    .finally(() => {
      if (pendingProviderOptions === pending) pendingProviderOptions = undefined
      if (current.isCurrent()) providerOptionsLoading.value = false
    })
  pendingProviderOptions = pending
  return pending
}
const priceEditor = ref<InstanceType<typeof PricingEditor>>()
let originalModel: Model | undefined
const errorNotice = ref<HTMLElement>()

const tab = ref('basic'),
  loading = ref(true),
  saving = ref(false),
  error = ref('')
const preparationError = ref('')
const loadFailed = ref(false)
const nameError = ref('')
const nameRequest = useLatestRequest()
let nameValidation: { key: string; available: boolean } | undefined
let pendingNameValidation: { key: string; promise: Promise<boolean> } | undefined
watch(
  () => model.value.model_id_at_gateway,
  () => {
    nameValidation = undefined
    pendingNameValidation = undefined
    nameRequest.invalidate()
    nameError.value = ''
  },
  { flush: 'sync' },
)
async function validateName(): Promise<boolean> {
  const name = normalizeModelId(model.value.model_id_at_gateway)
  if (!name || basicLocked.value || saving.value) return true
  const excludeId = model.value.id || props.modelId
  const key = JSON.stringify([name, excludeId])
  if (pendingNameValidation?.key === key) return pendingNameValidation.promise
  if (nameValidation?.key === key) {
    nameError.value = nameValidation.available ? '' : t('ma.nameConflict')
    return nameValidation.available
  }
  const current = nameRequest.begin()
  const promise = (async () => {
    try {
      const available = await isModelNameAvailable(name, excludeId, { signal: current.signal })
      if (!current.isCurrent()) return false
      nameValidation = { key, available }
      nameError.value = available ? '' : t('ma.nameConflict')
      return available
    } catch {
      if (current.isCurrent()) nameError.value = t('ma.nameCheckUnavailable')
      return false
    }
  })()
  pendingNameValidation = { key, promise }
  try {
    return await promise
  } finally {
    if (pendingNameValidation?.promise === promise) pendingNameValidation = undefined
  }
}
function close() {
  if (!saving.value) void closeDrawer()
}
const tabsRef = useDrawerTabs(tab)
watch(
  [error, preparationError],
  async (messages) => {
    if (!messages.some(Boolean)) return
    await nextTick()
    requestAnimationFrame(() => {
      errorNotice.value?.closest('.t-drawer__body')?.scrollTo({ top: 0 })
    })
  },
  { flush: 'sync' },
)
let originalPrice = JSON.stringify(price.value)
const tagOptions = ref<{ value: string; label: string }[]>([])
const tagLabels = ref(new Map<string, string>())
const tagChoices = computed(() => {
  const options = new Map(tagOptions.value.map((option) => [option.value, option]))
  for (const value of model.value.tags) {
    if (!options.has(value))
      options.set(value, { value, label: tagLabels.value.get(value) ?? tagLabel(value) })
  }
  return [...options.values()]
})
const tagRequest = useLatestRequest()
async function loadTags(q = '', resetLabels = false) {
  const current = tagRequest.begin()
  try {
    const result = await accessApi.tags(q, { signal: current.signal })
    if (current.isCurrent()) {
      tagOptions.value = result.items
      tagLabels.value = new Map([
        ...(resetLabels ? [] : tagLabels.value),
        ...result.items.map((option) => [option.value, option.label] as const),
      ])
    }
  } catch {
    // The request layer reports failures; cancelled searches need no feedback.
  }
}
function searchTags(q: string) {
  tagRequest.schedule(() => void loadTags(q))
}
watch(locale, () => void loadTags('', true))
const preparationFailed = ref(false)
const preparing = ref(false)
const preparedSignature = ref('')
const configurationSignature = computed(() =>
  JSON.stringify([
    model.value.provider_id,
    model.value.model_id_at_provider,
    model.value.supported_invocation_apis,
    model.value.custom_invocation_apis.map((a) => a.path),
  ]),
)
const metadataLocked = computed(() => !user.permissions.includes('model.models:write'))
const basicLocked = computed(
  () =>
    !user.permissions.includes('model.models:write') ||
    (!!model.value.id && model.value.status !== 'DRAFT'),
)
const contextK = computed({
  get: () => (model.value.context_window === null ? undefined : model.value.context_window / 1000),
  set: (value: number | undefined) => {
    model.value.context_window = value == null ? null : value * 1000
  },
})
const outputK = computed({
  get: () =>
    model.value.max_output_tokens === null ? undefined : model.value.max_output_tokens / 1000,
  set: (value: number | undefined) => {
    model.value.max_output_tokens = value == null ? null : value * 1000
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
    nameRequest.schedule(() => void validateName(), 800)
  }
}
const metadataRequest = useLatestRequest()
let loadedMetadataKey = ''
let applyingMetadata = false
let pendingMetadata: { signature: string; promise: Promise<void> } | undefined
async function loadMetadata() {
  const signature = configurationSignature.value
  if (pendingMetadata?.signature === signature) return pendingMetadata.promise
  const promise = fetchMetadata()
  pendingMetadata = { signature, promise }
  try {
    await promise
  } finally {
    if (pendingMetadata?.promise === promise) pendingMetadata = undefined
  }
}
async function fetchMetadata() {
  if (
    model.value.id ||
    (preparedSignature.value === configurationSignature.value && !preparationFailed.value)
  )
    return
  const current = metadataRequest.begin()
  const name = model.value.model_id_at_provider.trim()
  if (!model.value.provider_id || !name) {
    preparing.value = false
    return
  }
  preparing.value = true
  preparationFailed.value = false
  preparationError.value = ''
  try {
    const config = {
      signal: current.signal,
      handledErrorCodes: [
        'VALIDATION_FAILED',
        'CATALOG_UNAVAILABLE',
        'CATALOG_CHANGED',
        'CATALOG_INCOMPATIBLE',
        'BILLING_CURRENCY_CHANGED',
        'METRIC_UNSUPPORTED',
        'PRICE_RULE_INVALID',
      ],
    }
    const key = JSON.stringify([model.value.provider_id, name])
    if (loadedMetadataKey !== key) {
      const metadata = await accessApi.metadata(model.value.provider_id, name, config)
      if (!current.isCurrent()) return
      applyingMetadata = true
      try {
        Object.assign(model.value, metadata)
        loadedMetadataKey = key
      } finally {
        applyingMetadata = false
      }
    }
    const signature = configurationSignature.value
    if (invocationConfigurationError(model.value)) return
    if (!configurePricing.value) {
      preparedSignature.value = signature
      return
    }
    await accessApi.prepare(model.value, config)
    if (!current.isCurrent()) return
    const pricing = await accessApi.catalog(name, model.value.provider_id)
    if (!current.isCurrent()) return
    const prefill = pricing
    officialPrice.value = accessApi.officialPricing(model.value.provider_id, name)
    price.value = prefill
    defaultPrice.value = prefill.catalog_default_price_version_id
      ? structuredClone(prefill)
      : undefined
    originalPrice = JSON.stringify(prefill)
    preparedSignature.value = signature
  } catch (e) {
    if (current.isCurrent()) {
      preparationFailed.value = true
      preparationError.value = (e as Error).message || t('common.loadFailed')
    }
  } finally {
    if (current.isCurrent()) preparing.value = false
  }
}
watch(
  configurationSignature,
  () => {
    if (model.value.id || applyingMetadata) return
    metadataRequest.invalidate()
    pendingMetadata = undefined
    preparedSignature.value = ''
    preparationFailed.value = false
    preparationError.value = ''
    if (error.value === t('ma.required')) error.value = ''
    preparing.value = true
    price.value = blankPricing()
    defaultPrice.value = undefined
    officialPrice.value = undefined
    metadataRequest.schedule(() => void loadMetadata(), 800)
  },
  { flush: 'sync' },
)
watch(configurePricing, (enabled) => {
  metadataRequest.invalidate()
  pendingMetadata = undefined
  preparing.value = false
  preparationFailed.value = false
  preparationError.value = ''
  preparedSignature.value = ''
  if (enabled) void loadMetadata()
})

async function loadDefaultPricing() {
  const result = await accessApi.defaultPricing(model.value)
  if (result.state === 'NOT_APPLICABLE') {
    MessagePlugin.info(t('pricingFlow.noMetrics'))
    return null
  }
  const defaults = result.price
  if (defaults && !model.value.id)
    return { ...defaults, catalog_price_version_id: price.value.catalog_price_version_id }
  if (defaults && defaults.version !== price.value.version) {
    const current = await accessApi.pricing(model.value.id)
    priceComparison.value = { current, draft: defaults }
    return null
  }
  return defaults
}
function acceptPriceComparison(useDraft: boolean) {
  if (!priceComparison.value) return
  const { current, draft } = priceComparison.value
  price.value = useDraft ? { ...draft, version: current.version } : current
  originalPrice = JSON.stringify(current)
  priceComparison.value = undefined
}

function nameChanged(value: string) {
  manualName = !!value && value !== lastAutomaticName
}
function addModality(key: 'input_modalities' | 'output_modalities', value: string) {
  const tag = value.trim()
  if (tag) model.value[key] = [...new Set([...model.value[key], tag])]
}
const basicValidationAttempted = ref(false)
const basicValidationFailed = ref(false)
const basicFieldErrors = computed(() => {
  const issues: Record<string, string> = {}
  if (!basicValidationAttempted.value) return issues
  const m = model.value
  if (!basicLocked.value) {
    if (!m.provider_id) issues.provider = t('ma.providerFieldRequired', { field: t('ma.provider') })
    if (!m.model_id_at_provider.trim())
      issues.upstream = t('ma.providerFieldRequired', { field: t('ma.upstream') })
    if (!m.model_id_at_gateway.trim())
      issues.name = t('ma.providerFieldRequired', { field: t('ma.name') })
    const invocationError = invocationConfigurationError(m)
    if (invocationError)
      issues.invocation = t(
        invocationError === 'required' ? 'ma.invocationRequired' : 'ma.invalidApiPath',
      )
  }
  for (const [key, value, label] of [
    ['context', m.context_window, 'context'],
    ['output', m.max_output_tokens, 'maxOutput'],
  ] as const)
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0))
      issues[key] = `${t('ma.' + label)}：${t('ma.invalidTokenLimit')}`
  return issues
})
function basicFieldState(key: string) {
  return {
    status: basicFieldErrors.value[key] ? ('error' as const) : undefined,
    tips: basicFieldErrors.value[key] ?? '',
  }
}
watch(basicFieldErrors, (issues) => {
  if (basicValidationFailed.value)
    error.value = Object.keys(issues).length
      ? t('ma.providerValidationSummary', { fields: Object.values(issues).join('；') })
      : ''
})
async function save() {
  if (
    loading.value ||
    loadFailed.value ||
    saving.value ||
    preparing.value ||
    preparationFailed.value ||
    priceComparison.value
  )
    return
  error.value = ''
  basicValidationFailed.value = false
  const m = model.value
  basicValidationAttempted.value = true
  if (Object.keys(basicFieldErrors.value).length) {
    basicValidationFailed.value = true
    tab.value = 'basic'
    error.value = t('ma.providerValidationSummary', {
      fields: Object.values(basicFieldErrors.value).join('；'),
    })
    return
  }
  if (
    [m.context_window, m.max_output_tokens].some(
      (value) => value !== null && (!Number.isSafeInteger(value) || value <= 0),
    )
  ) {
    tab.value = 'basic'
    error.value = t('ma.invalidTokenLimit')
    return
  }
  if ((m.id || configurePricing.value) && priceEditor.value && !priceEditor.value.validate()) {
    tab.value = 'price'
    return
  }
  nameRequest.invalidate()
  saving.value = true
  try {
    m.model_id_at_gateway = normalizeModelId(m.model_id_at_gateway)
    if (
      !m.id &&
      configurePricing.value &&
      (preparationFailed.value || preparedSignature.value !== configurationSignature.value)
    ) {
      error.value = t('common.loadFailed')
      return
    }
    const changedPrice = JSON.stringify(price.value) !== originalPrice
    const result = await accessApi.saveModel(m, {
      ...((!m.id && configurePricing.value) || (m.id && changedPrice)
        ? { price: price.value }
        : {}),
    })
    model.value = result
    if (canReadPrice.value && (changedPrice || (!originalModel && configurePricing.value))) {
      const reads = await Promise.allSettled([
        accessApi.pricing(result.id),
        accessApi.prices(result.id, 1, 5),
      ])
      if (reads.some((read) => read.status === 'rejected'))
        MessagePlugin.warning(t('pricingFlow.refreshFailed'))
    }
    MessagePlugin.success(t('ma.success'))
    emit('saved', result, originalModel)
    void closeDrawer()
  } catch (e) {
    const failure = e as NotifiedError
    if (
      model.value.id &&
      failure.code === 'VERSION_CONFLICT' &&
      String(failure.params?.version_domain).toUpperCase() === 'PRICE'
    ) {
      try {
        const current = await accessApi.pricing(model.value.id)
        priceComparison.value = {
          current,
          draft: JSON.parse(JSON.stringify(price.value)) as Pricing,
        }
      } catch {
        error.value = t('common.loadFailed')
      }
      return
    }
    const detail = (e as NotifiedError).params?.fields as Record<string, string> | undefined
    if (detail?.model_access === 'NAME_CONFLICT' || (e as NotifiedError).code === 'NAME_CONFLICT') {
      nameError.value = t('ma.nameConflict')
      tab.value = 'basic'
      return
    }
    error.value =
      (e as Error).message ||
      t(
        detail?.model_access === 'NAME_CONFLICT'
          ? 'ma.nameConflict'
          : detail?.model_access === 'INVALID_API_PATH'
            ? 'ma.invalidApiPath'
            : 'ma.modelSaveFailed',
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
    if (props.modelId) {
      const [loadedModel, loadedPrice] = await Promise.all([
        accessApi.model(props.modelId, false, { signal: current.signal }),
        canReadPrice.value
          ? accessApi.pricing(props.modelId, { signal: current.signal })
          : Promise.resolve(blankPricing()),
      ])
      if (!current.isCurrent()) return
      model.value = loadedModel
      originalModel = JSON.parse(JSON.stringify(loadedModel)) as Model
      price.value = loadedPrice
      originalPrice = JSON.stringify(price.value)
    }
  } catch {
    if (current.isCurrent()) loadFailed.value = true
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
onMounted(() => {
  void loadModel()
  if (!props.modelId) void loadProviderOptions()
  void loadTags()
})
</script>
<style scoped src="./access.css"></style>
