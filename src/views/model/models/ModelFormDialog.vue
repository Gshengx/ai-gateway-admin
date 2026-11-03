<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  createModelApi,
  getLogicalModelsApi,
  getModelApi,
  getModelPricingApi,
  mountLogicalModelApi,
  updateModelApi,
  updateModelPricingApi,
  MODEL_REASON,
} from '@/api/modules/models'
import { getProvidersApi, getProviderTemplatesApi } from '@/api/modules/providers'
import type { ProviderItem, ProviderTemplate } from '@/api/modules/providers'
import type { ModelStatus } from '@/api/modules/models'
import { unmountLogicalModelApi } from '@/api/modules/logicalModels'

const props = defineProps<{ visible: boolean; modelId?: string }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; success: [] }>()
const { t } = useI18n()
const tr = (key: string) => t(`model.modelsForm.${key}`)
const providers = ref<ProviderItem[]>([])
const templates = ref<ProviderTemplate[]>([])
const logical = ref<{ id: string; display_name: string; logical_name: string }[]>([])
const saving = ref(false)
const loading = ref(false)
const savedId = ref<string>()
const initialLogicalIds = ref<string[]>([])
const invocationConfig = ref<{ deployment?: string | null }>({})
const initialPrice = ref('')
const modelStatus = ref<ModelStatus>()
const identityLocked = computed(() => !!props.modelId || !!savedId.value)
const invocationLocked = computed(
  () => !!modelStatus.value && !['DRAFT', 'RETIRED'].includes(modelStatus.value),
)
const defaults = () => ({
  provider_id: '',
  model_id_at_provider: '',
  model_type: 'LLM' as 'LLM' | 'EMBEDDING' | 'MULTIMODAL' | 'IMAGE' | 'AUDIO' | 'VIDEO',
  logical_ids: [] as string[],
  auto: true,
  combination: undefined as number | undefined,
  supports_streaming: true as boolean | null,
  supports_tool_calling: false as boolean | null,
  supports_json_mode: false as boolean | null,
  supports_vision: false as boolean | null,
  context_window: 0 as number | null,
  max_output_tokens: 0 as number | null,
  input_price: 0 as number | undefined,
  cached_input_price: undefined as number | undefined,
  output_price: 0 as number | undefined,
  currency: 'CNY' as 'CNY' | 'USD',
  description: '',
})
const form = reactive(defaults())
const combinations = computed(
  () =>
    templates.value
      .find(
        (x) =>
          x.template_key === providers.value.find((p) => p.id === form.provider_id)?.template_key,
      )
      ?.combinations.filter((combination) => {
        const provider = providers.value.find((p) => p.id === form.provider_id)
        return (
          combination.auth_mode === provider?.auth_mode &&
          combination.endpoint_profile === provider?.endpoint_profile
        )
      }) ?? [],
)
const invocationOptions = computed(() =>
  combinations.value.map((x, i) => ({
    value: i,
    label: [
      'CHAT_COMPLETIONS',
      'RESPONSES',
      'MESSAGES',
      'GENERATE_CONTENT',
      'CONVERSE',
      'EMBEDDINGS',
      'IMAGE_GENERATIONS',
      'AUDIO',
      'VIDEO',
      'TEMPLATE_NATIVE',
    ].includes(x.invocation_api)
      ? tr(`INVOCATION_${x.invocation_api}`)
      : x.invocation_api,
  })),
)
function error(e: unknown) {
  if ((e as { notified?: boolean }).notified) return
  const x = e as {
    code?: string
    message?: string
    response?: { data?: { code?: string; message?: string } }
  }
  const data = x?.response?.data
  MessagePlugin.error(
    [data?.code ?? x?.code, data?.message ?? x?.message].filter(Boolean).join(': ') || tr('error'),
  )
}
const priceKey = () =>
  JSON.stringify([form.input_price, form.cached_input_price, form.output_price, form.currency])
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    loading.value = true
    savedId.value = undefined
    initialLogicalIds.value = []
    invocationConfig.value = {}
    Object.assign(form, defaults())
    modelStatus.value = undefined
    providers.value = []
    logical.value = []
    templates.value = []
    try {
      const [p, firstLogicalPage, ts] = await Promise.all([
        getProvidersApi({ page: 1, page_size: 100 }),
        getLogicalModelsApi({ page: 1, page_size: 100 }),
        getProviderTemplatesApi(),
      ])
      providers.value = p.items
      logical.value = firstLogicalPage.items
      for (let page = 2; page <= firstLogicalPage.total_pages; page++) {
        const result = await getLogicalModelsApi({ page, page_size: 100 })
        logical.value.push(...result.items)
      }
      templates.value = ts.items
      if (props.modelId) {
        const [m, pricing] = await Promise.all([
          getModelApi(props.modelId),
          getModelPricingApi(props.modelId),
        ])
        modelStatus.value = m.status
        invocationConfig.value = m.invocation_config
        initialLogicalIds.value = m.mounts.map((x) => x.logical_model_id)
        Object.assign(form, {
          provider_id: m.provider_id,
          model_id_at_provider: m.model_id_at_provider,
          model_type: m.model_type,
          auto: false,
          description: m.description,
          logical_ids: [...initialLogicalIds.value],
          ...m.declared_capabilities,
          context_window:
            m.declared_capabilities.context_window === null
              ? null
              : Number(m.declared_capabilities.context_window),
          max_output_tokens:
            m.declared_capabilities.max_output_tokens === null
              ? null
              : Number(m.declared_capabilities.max_output_tokens),
        })
        form.combination = combinations.value.findIndex(
          (x) =>
            x.invocation_api === m.invocation_api && x.operation_profile === m.operation_profile,
        )
        if (form.combination < 0) form.combination = undefined
        const price = pricing.price
        if (price)
          Object.assign(form, {
            input_price: Number(price.input_price),
            cached_input_price:
              price.cached_input_price == null ? undefined : Number(price.cached_input_price),
            output_price: Number(price.output_price),
            currency: price.currency,
          })
      }
      initialPrice.value = priceKey()
    } catch (e) {
      error(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
function selectDefaultCombination() {
  const available = combinations.value
  const provider = providers.value.find((item) => item.id === form.provider_id)
  const suggestedApi =
    form.model_type === 'EMBEDDING'
      ? 'EMBEDDINGS'
      : form.model_type === 'IMAGE'
        ? 'IMAGE_GENERATIONS'
        : form.model_type === 'AUDIO'
          ? 'AUDIO'
          : form.model_type === 'VIDEO'
            ? 'VIDEO'
            : provider?.template_key === 'anthropic'
              ? 'MESSAGES'
              : ['google_ai', 'vertex'].includes(provider?.template_key ?? '')
                ? 'GENERATE_CONTENT'
                : provider?.template_key === 'hunyuan'
                  ? 'TEMPLATE_NATIVE'
                  : 'CHAT_COMPLETIONS'
  let index = available.findIndex(
    (item) => item.invocation_api === suggestedApi && item.support_status !== 'UNAVAILABLE',
  )
  if (index < 0) index = available.findIndex((item) => item.support_status !== 'UNAVAILABLE')
  form.combination = index >= 0 ? index : available.length ? 0 : undefined
}
watch([combinations, () => form.model_type], selectDefaultCombination, { flush: 'sync' })
function matchingLogicalModels() {
  const normalize = (value: string) => value.trim().toLowerCase()
  const identifier = normalize(form.model_id_at_provider)
  const exact = logical.value.filter((item) => normalize(item.logical_name) === identifier)
  if (exact.length) return exact
  const base = identifier.replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, '')
  return base === identifier
    ? []
    : logical.value.filter((item) => normalize(item.logical_name) === base)
}
async function submit() {
  if (loading.value || saving.value) return
  const combination =
    form.combination === undefined ? undefined : combinations.value[form.combination]
  if (!combination) {
    MessagePlugin.warning(tr('invocationRequired'))
    return
  }
  if (
    !form.provider_id ||
    !form.model_id_at_provider.trim() ||
    !form.model_type ||
    [form.input_price, form.cached_input_price, form.output_price].some(
      (x) => x != null && x < 0,
    ) ||
    form.input_price == null ||
    form.output_price == null
  ) {
    MessagePlugin.warning(tr('validationError'))
    return
  }
  saving.value = true
  try {
    const matches =
      form.auto && !form.logical_ids.length && !props.modelId ? matchingLogicalModels() : []
    if (matches.length > 1) {
      MessagePlugin.warning(tr('ambiguousLogical'))
      return
    }
    const binding = form.logical_ids.length
      ? { mode: 'EXISTING' as const, logical_model_id: form.logical_ids[0] }
      : matches.length === 1
        ? { mode: 'EXISTING' as const, logical_model_id: matches[0].id }
        : form.auto
          ? {
              mode: 'CREATE' as const,
              logical_name: form.model_id_at_provider.trim(),
              display_name: form.model_id_at_provider,
            }
          : { mode: 'NONE' as const }
    const payload = {
      provider_id: form.provider_id,
      model_id_at_provider: form.model_id_at_provider,
      model_type: form.model_type,
      invocation_api: combination.invocation_api,
      operation_profile: combination.operation_profile,
      invocation_config: invocationConfig.value,
      logical_binding: binding,
      declared_capabilities: {
        supports_streaming: form.supports_streaming,
        supports_tool_calling: form.supports_tool_calling,
        supports_json_mode: form.supports_json_mode,
        supports_vision: form.supports_vision,
        context_window:
          form.context_window == null ||
          String(form.context_window) === '' ||
          Number(form.context_window) === 0
            ? null
            : String(form.context_window),
        max_output_tokens:
          form.max_output_tokens == null ||
          String(form.max_output_tokens) === '' ||
          Number(form.max_output_tokens) === 0
            ? null
            : String(form.max_output_tokens),
      },
      description: form.description,
      reason: props.modelId ? MODEL_REASON.update : MODEL_REASON.create,
    }
    let id = props.modelId || savedId.value
    if (id) {
      await updateModelApi(id, {
        model_type: payload.model_type,
        invocation_api: payload.invocation_api,
        operation_profile: payload.operation_profile,
        invocation_config: payload.invocation_config,
        declared_capabilities: payload.declared_capabilities,
        description: payload.description,
        reason: MODEL_REASON.update,
      })
      for (const logicalId of form.logical_ids.filter(
        (x) => !initialLogicalIds.value.includes(x),
      )) {
        await mountLogicalModelApi(logicalId, {
          physical_model_id: id,
          confirm_existing_grant_impact: false,
          reason: MODEL_REASON.update,
        })
        initialLogicalIds.value.push(logicalId)
      }
      for (const logicalId of initialLogicalIds.value.filter(
        (x) => !form.logical_ids.includes(x),
      )) {
        await unmountLogicalModelApi(logicalId, id, { reason: MODEL_REASON.update })
        initialLogicalIds.value = initialLogicalIds.value.filter((x) => x !== logicalId)
      }
    } else {
      const result = (await createModelApi(payload)) as {
        id?: unknown
        model_id?: unknown
        resource_id?: unknown
      }
      id = [result?.id, result?.model_id, result?.resource_id].find(
        (x): x is string => typeof x === 'string' && !!x,
      )
      if (!id) throw new Error(tr('createdMissingId'))
      savedId.value = id
      initialLogicalIds.value =
        binding.mode === 'EXISTING' && binding.logical_model_id ? [binding.logical_model_id] : []
      if (id)
        for (const logicalId of form.logical_ids.slice(1)) {
          await mountLogicalModelApi(logicalId, {
            physical_model_id: id,
            confirm_existing_grant_impact: false,
            reason: MODEL_REASON.update,
          })
          initialLogicalIds.value.push(logicalId)
        }
      if (id && !form.logical_ids.length && binding.mode !== 'NONE') {
        const created = await getModelApi(id)
        form.logical_ids = created.mounts.map((item) => item.logical_model_id)
        initialLogicalIds.value = [...form.logical_ids]
      }
    }
    if (id && (!props.modelId || priceKey() !== initialPrice.value)) {
      try {
        await updateModelPricingApi(id, {
          input_price: Number(form.input_price ?? 0).toFixed(4),
          cached_input_price:
            form.cached_input_price == null ? null : String(form.cached_input_price),
          output_price: Number(form.output_price ?? 0).toFixed(4),
          currency: form.currency,
          unit: 'PER_MILLION_TOKENS',
          reason: MODEL_REASON.pricing,
        })
      } catch (e) {
        MessagePlugin.error(tr('pricingFailed'))
        throw e
      }
    }
    emit('success')
    emit('update:visible', false)
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <t-dialog
    destroy-on-close
    width="var(--physical-model-dialog-width)"
    :visible="visible"
    :header="tr(modelId ? 'edit' : 'create')"
    :cancel-btn="tr('cancel')"
    :confirm-loading="saving"
    :confirm-btn="{ content: tr('confirm'), disabled: loading }"
    @confirm="submit"
    @close="emit('update:visible', false)"
  >
    <t-loading :loading="loading" show-overlay>
      <t-form
        :disabled="loading"
        :data="form"
        label-align="top"
        class="model-form"
        :colon="false"
        required-mark-position="right"
      >
        <t-form-item :label="tr('provider')" :required-mark="true"
          ><t-select
            v-model="form.provider_id"
            :disabled="identityLocked"
            :placeholder="tr('providerPlaceholder')"
            :options="providers.map((p) => ({ label: p.name, value: p.id }))"
        /></t-form-item>
        <t-form-item :label="tr('modelIdAtProvider')" :required-mark="true"
          ><t-input
            v-model="form.model_id_at_provider"
            :disabled="identityLocked"
            :placeholder="tr('modelIdPlaceholder')"
        /></t-form-item>
        <t-form-item :label="tr('modelType')" :required-mark="true"
          ><t-select
            v-model="form.model_type"
            :disabled="modelStatus === 'ACTIVE'"
            :options="
              ['LLM', 'EMBEDDING', 'MULTIMODAL', 'IMAGE', 'AUDIO', 'VIDEO'].map((value) => ({
                label: value,
                value,
              }))
            "
        /></t-form-item>
        <t-form-item :label="tr('logicalModels')"
          ><div class="logical-binding">
            <t-select
              v-model="form.logical_ids"
              multiple
              clearable
              :placeholder="tr('logicalPlaceholder')"
              :options="logical.map((x) => ({ label: x.display_name, value: x.id }))"
            /><t-checkbox v-model="form.auto">{{ tr('autoMatch') }}</t-checkbox>
          </div></t-form-item
        >
        <t-form-item class="full-row" :label="tr('invocationApi')" :required-mark="true"
          ><t-select
            v-model="form.combination"
            :options="invocationOptions"
            :disabled="invocationLocked"
        /></t-form-item>
        <t-form-item class="full-row capability-row"
          ><t-checkbox
            :checked="form.supports_streaming === true"
            :indeterminate="form.supports_streaming === null"
            @change="(value: boolean) => (form.supports_streaming = value)"
            >{{ tr('streaming') }}</t-checkbox
          ><t-checkbox
            :checked="form.supports_tool_calling === true"
            :indeterminate="form.supports_tool_calling === null"
            @change="(value: boolean) => (form.supports_tool_calling = value)"
            >{{ tr('toolCalling') }}</t-checkbox
          ><t-checkbox
            :checked="form.supports_json_mode === true"
            :indeterminate="form.supports_json_mode === null"
            @change="(value: boolean) => (form.supports_json_mode = value)"
            >{{ tr('jsonMode') }}</t-checkbox
          ><t-checkbox
            :checked="form.supports_vision === true"
            :indeterminate="form.supports_vision === null"
            @change="(value: boolean) => (form.supports_vision = value)"
            >{{ tr('vision') }}</t-checkbox
          ></t-form-item
        >
        <t-form-item :label="tr('contextWindow')"
          ><t-input-number v-model="form.context_window" :min="0"
        /></t-form-item>
        <t-form-item :label="tr('maxOutputTokens')"
          ><t-input-number v-model="form.max_output_tokens" :min="0"
        /></t-form-item>
        <t-form-item :label="tr('inputPrice')" :required-mark="true"
          ><t-input-number v-model="form.input_price" :min="0" :decimal-places="4"
        /></t-form-item>
        <t-form-item :label="tr('cachedInputPrice')"
          ><t-input-number v-model="form.cached_input_price" :min="0" :decimal-places="4"
        /></t-form-item>
        <t-form-item :label="tr('outputPrice')" :required-mark="true"
          ><t-input-number v-model="form.output_price" :min="0" :decimal-places="4"
        /></t-form-item>
        <t-form-item :label="tr('currency')" :required-mark="true"
          ><t-select
            v-model="form.currency"
            :options="[
              { label: tr('currencyCny'), value: 'CNY' },
              { label: tr('currencyUsd'), value: 'USD' },
            ]"
        /></t-form-item>
        <t-form-item class="full-row" :label="tr('description')"
          ><t-input v-model="form.description" :placeholder="tr('optional')"
        /></t-form-item>
      </t-form>
    </t-loading>
  </t-dialog>
</template>

<style scoped>
.model-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--td-comp-margin-l);
  row-gap: var(--td-comp-margin-l);
}
.model-form :deep(.t-form__item) {
  margin-bottom: 0;
  min-width: 0;
}
.model-form :deep(.t-form__label) {
  color: var(--td-text-color-secondary);
}
.model-form :deep(.t-form__controls),
.logical-binding,
.model-form :deep(.t-input-number) {
  width: 100%;
}
.full-row {
  grid-column: 1 / -1;
}
.capability-row :deep(.t-form__controls-content) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--td-comp-margin-l);
}
.logical-binding :deep(.t-checkbox) {
  margin-top: var(--td-comp-margin-xs);
}
</style>
