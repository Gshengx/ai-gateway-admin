<template>
  <div class="invocation-editor ma-stack">
    <div class="invocation-editor__header">
      <span class="invocation-editor__required">{{ t('ma.protocol') }}</span>
      <span class="invocation-editor__required">{{ t('ma.protocolPath') }}</span>
      <span></span>
    </div>
    <div v-for="(row, index) in rows" :key="index" class="invocation-editor__row">
      <t-select
        :value="row.invocation_api"
        :disabled="disabled"
        :status="protocolError(row) ? 'error' : undefined"
        :tips="protocolError(row)"
        :aria-label="t('ma.protocol')"
        :placeholder="t('ma.chooseProtocol')"
        @change="(value: unknown) => selectProtocol(index, String(value))"
      >
        <t-option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :label="option.label"
        />
      </t-select>
      <t-input
        :value="row.path"
        @change="(value: string) => updatePath(index, value)"
        :disabled="disabled"
        :status="pathError(row) ? 'error' : undefined"
        :tips="pathError(row)"
        :aria-label="t('ma.protocolPath')"
        :placeholder="t('ma.choosePath')"
      />
      <t-button
        variant="text"
        theme="danger"
        :disabled="disabled || rows.length <= 1"
        :aria-label="t('ma.removeProtocol')"
        @click="removeRow(index)"
        ><template #icon><minus-circle-icon /></template
      ></t-button>
    </div>
    <p
      v-if="props.validateRequired && !props.allowEmpty && !hasProtocol"
      class="ma-error"
      role="alert"
    >
      {{ t('ma.invocationRequired') }}
    </p>
    <p class="invocation-editor__help">{{ t('ma.protocolHelp') }}</p>
    <div class="invocation-editor__actions">
      <t-button variant="text" :disabled="disabled" @click="addRow">
        <template #icon><add-icon /></template>{{ t('ma.addProtocol') }}
      </t-button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AddIcon, MinusCircleIcon } from 'tdesign-icons-vue-next'
import { accessApi, type Model, type CustomInvocationApi } from '@/api/modules/modelAccess'
import { invocationApis } from '@/utils/modelInvocation'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { invocationLabel } from './helpers'

const props = defineProps<{
  disabled?: boolean
  hideHelp?: boolean
  validateRequired?: boolean
  allowEmpty?: boolean
  providerId?: string
  upstreamId?: string
  initializeFromOptions?: boolean
  initializeIfEmpty?: boolean
  providedOptions?: Array<{ protocol: string; default_path: string | null }>
}>()
const configuration = defineModel<
  Pick<Model, 'supported_invocation_apis' | 'custom_invocation_apis'>
>('configuration', { required: true })
const { t, locale } = useI18n()
const protocolOptions = ref<Array<{ protocol: string; default_path: string | null }>>([])
const optionsRequest = useLatestRequest()
let initializedProvider = ''
watch(
  () => [props.providerId, props.upstreamId, props.providedOptions, locale.value] as const,
  async ([provider, upstream, providedOptions]) => {
    const request = optionsRequest.begin()
    protocolOptions.value = []
    if (!provider) return
    try {
      const result =
        providedOptions ??
        (await accessApi.protocolOptions(provider, upstream?.trim() ?? '', {
          signal: request.signal,
        }))
      if (request.isCurrent()) {
        protocolOptions.value = result
        if (
          result.length > 0 &&
          (props.initializeFromOptions || props.initializeIfEmpty) &&
          initializedProvider !== provider
        ) {
          initializedProvider = provider
          if (
            !props.initializeIfEmpty ||
            (configuration.value.supported_invocation_apis.length === 0 &&
              configuration.value.custom_invocation_apis.length === 0)
          ) {
            configuration.value.custom_invocation_apis = result.map((item) => ({
              invocation_api: item.protocol,
              path: item.default_path ?? '',
            }))
            syncProtocols()
          }
        }
      }
    } catch {
      if (request.isCurrent()) protocolOptions.value = []
    }
  },
  { immediate: true },
)
const options = computed(() => {
  const values = [
    ...new Set([
      ...invocationApis,
      'CUSTOM_PASSTHROUGH',
      ...protocolOptions.value.map((item) => item.protocol),
      ...configuration.value.supported_invocation_apis,
    ]),
  ]
  return values.map((value) => ({
    value,
    label: value === 'CUSTOM_PASSTHROUGH' ? t('ma.customProtocol') : invocationLabel(value),
  }))
})
const emptyRow: CustomInvocationApi = { invocation_api: '', path: '' }
const rows = computed(() =>
  configuration.value.custom_invocation_apis.length
    ? configuration.value.custom_invocation_apis
    : [emptyRow],
)
function syncProtocols() {
  configuration.value.supported_invocation_apis = configuration.value.custom_invocation_apis
    .map((row) => row.invocation_api)
    .filter(Boolean)
}
function ensureRow() {
  if (!configuration.value.custom_invocation_apis.length)
    configuration.value.custom_invocation_apis.push({ invocation_api: '', path: '' })
}
function addRow() {
  ensureRow()
  configuration.value.custom_invocation_apis.push({ invocation_api: '', path: '' })
}
function removeRow(index: number) {
  if (rows.value.length <= 1) return
  configuration.value.custom_invocation_apis.splice(index, 1)
  syncProtocols()
}
function selectProtocol(index: number, protocol: string) {
  ensureRow()
  const row = configuration.value.custom_invocation_apis[index]!
  row.invocation_api = protocol
  row.path = protocolOptions.value.find((item) => item.protocol === protocol)?.default_path ?? ''
  syncProtocols()
}
function updatePath(index: number, path: string) {
  ensureRow()
  configuration.value.custom_invocation_apis[index]!.path = path
}
const hasProtocol = computed(() => rows.value.some((row) => !!row.invocation_api))
const duplicateProtocols = computed(() => {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const row of rows.value) {
    if (!row.invocation_api) continue
    if (seen.has(row.invocation_api)) duplicated.add(row.invocation_api)
    seen.add(row.invocation_api)
  }
  return duplicated
})
const validationError = computed(() => {
  if (!hasProtocol.value && !props.allowEmpty) return 'required' as const
  if (duplicateProtocols.value.size) return 'duplicate' as const
  if (
    rows.value.some(
      (row) =>
        (row.invocation_api && !/^\/(?!\/)[^\s?#\\]*$/.test(row.path)) ||
        (!row.invocation_api && (!!row.path.trim() || rows.value.length > 1)),
    )
  )
    return 'incomplete' as const
  return null
})
function protocolError(row: CustomInvocationApi) {
  if (row.invocation_api && duplicateProtocols.value.has(row.invocation_api))
    return t('ma.protocolDuplicate')
  if (props.validateRequired && !row.invocation_api && !!row.path.trim())
    return t('ma.chooseProtocol')
  return ''
}
function pathError(row: CustomInvocationApi) {
  if (props.validateRequired && row.invocation_api && !row.path.trim()) return t('ma.choosePath')
  return ''
}
function validate() {
  return validationError.value
}
defineExpose({ validate, validationError })
</script>
<style scoped src="./access.css"></style>
