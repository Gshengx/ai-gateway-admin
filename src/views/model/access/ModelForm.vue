<template>
  <t-drawer
    class="model-form-drawer"
    :close-btn="!saving"
    :visible="true"
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
        <t-tab-panel v-if="canReadPrice" :disabled="saving" value="price" :label="t('ma.pricing')">
          <PricingEditor
            :inert="saving || !canWritePrice"
            :default-price="defaultPrice"
            :load-default="() => accessApi.defaultPricing(model)"
            ref="priceEditor"
            v-model="price"
            class="ma-section"
        /></t-tab-panel> </t-tabs
    ></LoadingState>
    <template #footer
      ><div class="ma-footer">
        <t-button theme="default" @click="emit('close')">{{ t('ma.cancel') }}</t-button>
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
import InvocationEditor from './InvocationEditor.vue'
import { invocationConfigurationError } from '@/utils/modelInvocation'
import { useDrawerTabs } from '@/utils/useDrawerTabs'
import type { NotifiedError } from '@/api/request'
import { useUserStore } from '@/stores/modules/user'
import { normalizeModelId } from '@/utils/modelContract'
const props = defineProps<{ modelId?: string; providerId?: string }>()
const emit = defineEmits<{ close: []; saved: [model: Model, previous: Model | undefined] }>()
const { t, locale } = useI18n()
const user = useUserStore()
const canReadPrice = computed(() => user.permissions.includes('model.pricing'))
const canWritePrice = computed(() => user.permissions.includes('model.pricing:write'))
const model = ref({ ...blankModel(), provider_id: props.providerId ?? '' }),
  price = ref(blankPricing()),
  // Reserved for the forthcoming enterprise-default pricing endpoint.
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
  if (!saving.value) emit('close')
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
    await accessApi.prepare(model.value, config)
    if (!current.isCurrent()) return
    const pricing = await accessApi.catalog(name, model.value.provider_id)
    price.value = pricing
    defaultPrice.value = pricing.catalog_default_price_version_id
      ? structuredClone(pricing)
      : undefined
    originalPrice = JSON.stringify(pricing)
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
    metadataRequest.schedule(() => void loadMetadata(), 800)
  },
  { flush: 'sync' },
)

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
    preparationFailed.value
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
  if (priceEditor.value && !priceEditor.value.validate()) {
    tab.value = 'price'
    return
  }
  nameRequest.invalidate()
  saving.value = true
  try {
    m.model_id_at_gateway = normalizeModelId(m.model_id_at_gateway)
    if (
      !m.id &&
      (preparationFailed.value || preparedSignature.value !== configurationSignature.value)
    ) {
      error.value = t('common.loadFailed')
      return
    }
    const changedPrice = JSON.stringify(price.value) !== originalPrice
    const result = await accessApi.saveModel(m, {
      ...(!m.id || changedPrice ? { price: price.value } : {}),
    })
    model.value = result
    MessagePlugin.success(t('ma.success'))
    emit('saved', result, originalModel)
    emit('close')
  } catch (e) {
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
      if (canReadPrice.value) {
        try {
          const defaults = await accessApi.defaultPricing(loadedModel)
          if (current.isCurrent()) defaultPrice.value = defaults
        } catch {
          // Keep the current price and draft; a failed default read is not an empty default.
        }
      }
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
