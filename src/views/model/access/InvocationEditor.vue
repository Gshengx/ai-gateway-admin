<template>
  <div class="invocation-editor ma-stack">
    <div v-for="row in rows" :key="row.key" class="invocation-editor__row">
      <t-form-item :label="t('ma.protocol')">
        <t-select
          :value="row.protocol"
          :disabled="disabled"
          :placeholder="t('ma.chooseProtocol')"
          :status="protocolError(row) ? 'error' : undefined"
          :tips="protocolError(row)"
          @change="(value: unknown) => selectProtocol(row, String(value))"
        >
          <t-option
            v-for="option in options"
            class="invocation-editor__protocol-option"
            :key="option.value"
            :value="option.value"
            :label="option.label"
            :disabled="optionDisabled(option.value, row)"
          >
            <span class="invocation-editor__option">
              <span>{{ option.label }}</span>
              <t-tag
                v-if="adaptedProtocols.has(option.value)"
                theme="success"
                variant="light"
                size="small"
                >{{ t('ma.adapted') }}</t-tag
              >
            </span>
          </t-option>
        </t-select>
      </t-form-item>
      <t-form-item :label="t('ma.protocolPath')">
        <t-input
          v-model="row.path"
          :disabled="disabled"
          :placeholder="t('ma.choosePath')"
          :status="pathError(row) ? 'error' : undefined"
          :tips="pathError(row)"
          @change="syncEditedConfiguration"
        />
      </t-form-item>
      <t-button
        variant="text"
        theme="danger"
        :disabled="disabled || rows.length <= 1"
        :aria-label="t('ma.removeProtocol')"
        @click="removeRow(row.key)"
        ><template #icon><minus-circle-icon /></template
      ></t-button>
    </div>
    <p v-if="validateRequired && validationError === 'required'" class="ma-error" role="alert">
      {{ t('ma.invocationRequired') }}
    </p>
    <div class="invocation-editor__actions">
      <span v-if="rows.length >= maximumRows" class="ma-muted">{{ t('ma.protocolLimit') }}</span>
      <t-button variant="text" :disabled="disabled || rows.length >= maximumRows" @click="addRow()">
        <template #icon><add-icon /></template>{{ t('ma.addProtocol') }}
      </t-button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AddIcon, MinusCircleIcon } from 'tdesign-icons-vue-next'
import { accessApi, invocationApis, type Model } from '@/api/modules/modelAccess'
import { resolveInvocationApiIds, validInvocationPath } from '@/utils/modelInvocation'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { invocationFieldErrorMessage, invocationLabel } from './helpers'

const props = defineProps<{
  configuration: Model
  fieldErrors?: Record<string, string>
  standardRoute?: string
  disabled?: boolean
  hideHelp?: boolean
  validateRequired?: boolean
  providerId?: string
  upstreamId?: string
  initializeFromOptions?: boolean
  initializeIfEmpty?: boolean
  providedCustomPassthroughSupported?: boolean | null
  providedOptions?: Array<{ protocol: string; default_path: string | null }>
}>()
const emit = defineEmits<{ 'update:configuration': [value: Model] }>()
const { t, locale } = useI18n()
const maximumRows = 32
const protocolOptions = ref<Array<{ protocol: string; default_path: string | null }>>([])
const adaptedProtocols = computed(
  () => new Set(protocolOptions.value.map((option) => option.protocol)),
)
const customSupported = ref<boolean | null>(null)
const optionsRequest = useLatestRequest()
const edited = ref(false)
let initializedProvider = ''
let loadedProvider = ''
// Display defaults from the confirmed reference, independent of provider capabilities.
const defaultPaths: Record<string, string> = {
  CHAT_COMPLETIONS: '/chat/completions',
  RESPONSES: '/responses',
  MESSAGES: '/messages',
  GENERATE_CONTENT: '/models/{model}:generateContent',
  CONVERSE: '/model/{modelId}/converse',
  EMBEDDINGS: '/embeddings',
  IMAGE_GENERATIONS: '/images/generations',
  AUDIO: '/audio/speech',
  VIDEO: '/videos',
}
const options = computed(() => {
  const protocols = new Set([
    ...invocationApis,
    ...rows.value.map((row) => row.protocol).filter((value) => value && value !== 'CUSTOM'),
  ])
  return [
    ...[...protocols].map((value) => ({ value, label: invocationLabel(value) })),
    { value: 'CUSTOM', label: t('ma.customProtocol') },
  ]
})
interface InvocationRow {
  id?: string
  key: number
  protocol: string
  path: string
}
let nextKey = 0
const rows = ref<InvocationRow[]>([])
let originalApis: Model['custom_invocation_apis'] = []
function makeRow(protocol = '', path = '', id?: string): InvocationRow {
  return { ...(id ? { id } : {}), key: nextKey++, protocol, path }
}
let synchronizedConfiguration = ''
function configurationSignature(configuration: Model) {
  return JSON.stringify([
    configuration.id,
    props.providerId,
    configuration.supported_invocation_apis,
    configuration.custom_invocation_apis,
  ])
}
function syncConfiguration() {
  const custom = resolveInvocationApiIds(
    rows.value.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      invocation_api: row.protocol === 'CUSTOM' ? 'CUSTOM_PASSTHROUGH' : row.protocol,
      path: row.path,
    })),
    originalApis,
  )
  const configuration = {
    ...props.configuration,
    supported_invocation_apis: custom.map((row) => row.invocation_api).filter(Boolean),
    custom_invocation_apis: custom,
  }
  synchronizedConfiguration = configurationSignature(configuration)
  emit('update:configuration', configuration)
}
function syncEditedConfiguration() {
  edited.value = true
  syncConfiguration()
}
// Server configurations hydrate the editor; its own updates keep row keys and focus stable.
watch(
  () => configurationSignature(props.configuration),
  (signature) => {
    if (signature === synchronizedConfiguration) return
    edited.value = false
    initializedProvider = ''
    const configuration = props.configuration
    originalApis = configuration.custom_invocation_apis.map((api) => ({ ...api }))
    const configuredProtocols = new Set(
      configuration.custom_invocation_apis.map((api) => api.invocation_api),
    )
    rows.value = [
      ...configuration.supported_invocation_apis
        .filter((protocol) => !configuredProtocols.has(protocol))
        .map((protocol) => makeRow(protocol, defaultPaths[protocol] ?? '')),
      ...configuration.custom_invocation_apis.map((api) =>
        makeRow(
          api.invocation_api === 'CUSTOM_PASSTHROUGH' || !api.invocation_api
            ? 'CUSTOM'
            : api.invocation_api,
          api.path,
          api.id,
        ),
      ),
    ]
    if (!rows.value.length) rows.value.push(makeRow())
    initializeRows()
  },
  { immediate: true },
)
function initializeRows() {
  const provider = props.providerId ?? ''
  if (
    !provider ||
    loadedProvider !== provider ||
    initializedProvider === provider ||
    edited.value ||
    !protocolOptions.value.length ||
    (!props.initializeFromOptions && !props.initializeIfEmpty)
  )
    return
  initializedProvider = provider
  if (rows.value.some((row) => row.protocol || row.path)) return
  rows.value = protocolOptions.value
    .slice(0, maximumRows)
    .map((item) => makeRow(item.protocol, item.default_path ?? defaultPaths[item.protocol] ?? ''))
  syncConfiguration()
}
watch(
  () =>
    [
      props.providerId,
      props.upstreamId,
      props.providedOptions,
      props.providedCustomPassthroughSupported,
      locale.value,
    ] as const,
  async ([provider, upstream, providedOptions, providedCustomSupported]) => {
    const request = optionsRequest.begin()
    protocolOptions.value = []
    loadedProvider = ''
    customSupported.value = null
    if (!provider) return
    try {
      const response = providedOptions?.length
        ? undefined
        : await accessApi.protocolOptions(provider, upstream?.trim() ?? '', {
            signal: request.signal,
          })
      if (!request.isCurrent()) return
      loadedProvider = provider
      protocolOptions.value = providedOptions?.length
        ? providedOptions
        : (response?.protocol_options ?? [])
      customSupported.value = providedOptions?.length
        ? (providedCustomSupported ?? null)
        : (response?.custom_passthrough_supported ?? null)
      initializeRows()
    } catch {
      if (request.isCurrent()) protocolOptions.value = []
    }
  },
  { immediate: true },
)
function addRow() {
  if (rows.value.length >= maximumRows) return
  edited.value = true
  rows.value.push(makeRow())
  syncConfiguration()
}
function removeRow(key: number) {
  if (rows.value.length <= 1) return
  edited.value = true
  rows.value = rows.value.filter((row) => row.key !== key)
  syncConfiguration()
}
function selectProtocol(row: InvocationRow, protocol: string) {
  if (optionDisabled(protocol, row)) return
  edited.value = true
  row.protocol = protocol
  row.path =
    protocol === 'CUSTOM'
      ? ''
      : (protocolOptions.value.find((item) => item.protocol === protocol)?.default_path ??
        defaultPaths[protocol] ??
        '')
  syncConfiguration()
}
function optionDisabled(protocol: string, row: InvocationRow) {
  if (protocol === 'CUSTOM') return customSupported.value === false && row.protocol !== 'CUSTOM'
  return rows.value.some((other) => other.key !== row.key && other.protocol === protocol)
}
function protocolError(row: InvocationRow) {
  if (
    row.protocol &&
    row.protocol !== 'CUSTOM' &&
    rows.value.some((other) => other.key !== row.key && other.protocol === row.protocol)
  )
    return t('ma.protocolDuplicate')
  if (props.validateRequired && !row.protocol) return t('ma.chooseProtocol')
  return ''
}
function pathError(row: InvocationRow) {
  const index = rows.value.findIndex((item) => item.key === row.key)
  const serverError =
    props.fieldErrors?.[`invocation_apis[${index}].path`] ??
    props.fieldErrors?.[`base.invocation_apis[${index}].path`]
  if (serverError) return invocationFieldErrorMessage(serverError, props.standardRoute)
  if (
    row.protocol === 'CUSTOM' &&
    row.path &&
    rows.value.some(
      (other) => other.key !== row.key && other.protocol === 'CUSTOM' && other.path === row.path,
    )
  )
    return t('ma.passthroughPathDuplicate')
  if (props.validateRequired && !validInvocationPath(row.path))
    return row.path ? t('ma.protocolIncomplete') : t('ma.choosePath')
  return ''
}
// Both parent flows validate the same ordered configuration they submit.
const validationError = computed<'required' | 'duplicate' | 'incomplete' | null>(() => {
  if (!rows.value.some((row) => row.protocol)) return 'required'
  if (rows.value.some((row) => protocolError(row) === t('ma.protocolDuplicate'))) return 'duplicate'
  if (
    rows.value.length > maximumRows ||
    rows.value.some((row) => !row.protocol || !validInvocationPath(row.path) || pathError(row))
  )
    return 'incomplete'
  return null
})
function validate() {
  return validationError.value
}
defineExpose({ validate, validationError })
</script>
<style scoped src="./access.css"></style>
