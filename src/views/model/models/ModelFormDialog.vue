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

const props = defineProps<{ visible: boolean; modelId?: string }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; success: [] }>()
const { t } = useI18n()
const tr = (key: string) => t(`model.modelsForm.${key}`)
const providers = ref<ProviderItem[]>([])
const templates = ref<ProviderTemplate[]>([])
const logical = ref<{ id: string; display_name: string }[]>([])
const saving = ref(false)
const initialPrice = ref('')
const defaults = () => ({
  provider_id: '',
  model_id_at_provider: '',
  model_type: 'LLM' as 'LLM' | 'EMBEDDING' | 'MULTIMODAL' | 'IMAGE' | 'AUDIO' | 'VIDEO',
  logical_ids: [] as string[],
  auto: false,
  combination: undefined as number | undefined,
  supports_streaming: true,
  supports_tool_calling: false,
  supports_json_mode: false,
  supports_vision: false,
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
    templates.value.find(
      (x) =>
        x.template_key === providers.value.find((p) => p.id === form.provider_id)?.template_key,
    )?.combinations ?? [],
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
    Object.assign(form, defaults())
    providers.value = []
    logical.value = []
    templates.value = []
    try {
      const [p, l, ts] = await Promise.all([
        getProvidersApi({ page: 1, page_size: 100 }),
        getLogicalModelsApi({ page: 1, page_size: 100 }),
        getProviderTemplatesApi(),
      ])
      providers.value = p.items
      logical.value = l.items
      templates.value = ts.items
      if (props.modelId) {
        const [m, pricing] = await Promise.all([
          getModelApi(props.modelId),
          getModelPricingApi(props.modelId),
        ])
        Object.assign(form, {
          provider_id: m.provider_id,
          model_id_at_provider: m.model_id_at_provider,
          model_type: m.model_type,
          description: m.description,
          logical_ids: m.mounts.slice(0, 1).map((x) => x.logical_model_id),
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
            cached_input_price: Number(price.cached_input_price),
            output_price: Number(price.output_price),
            currency: price.currency,
          })
      }
      initialPrice.value = priceKey()
    } catch (e) {
      error(e)
    }
  },
  { immediate: true },
)
function selectDefaultCombination() {
  const available = combinations.value
  let index = available.findIndex(
    (item) => item.invocation_api === 'CHAT_COMPLETIONS' && item.support_status !== 'UNAVAILABLE',
  )
  if (index < 0) index = available.findIndex((item) => item.support_status !== 'UNAVAILABLE')
  form.combination = index >= 0 ? index : available.length ? 0 : undefined
}
watch(combinations, selectDefaultCombination, { flush: 'sync' })
async function submit() {
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
    const binding = form.logical_ids.length
      ? { mode: 'EXISTING' as const, logical_model_id: form.logical_ids[0] }
      : form.auto
        ? {
            mode: 'CREATE' as const,
            display_name: form.model_id_at_provider,
            confirm_existing_grant_impact: false,
          }
        : { mode: 'NONE' as const }
    const payload = {
      provider_id: form.provider_id,
      model_id_at_provider: form.model_id_at_provider,
      model_type: form.model_type,
      invocation_api: combination.invocation_api,
      operation_profile: combination.operation_profile,
      invocation_config: {},
      logical_binding: binding,
      declared_capabilities: {
        supports_streaming: !!form.supports_streaming,
        supports_tool_calling: !!form.supports_tool_calling,
        supports_json_mode: !!form.supports_json_mode,
        supports_vision: !!form.supports_vision,
        context_window:
          form.context_window == null || String(form.context_window) === ''
            ? null
            : String(form.context_window),
        max_output_tokens:
          form.max_output_tokens == null || String(form.max_output_tokens) === ''
            ? null
            : String(form.max_output_tokens),
      },
      description: form.description,
      reason: props.modelId ? MODEL_REASON.update : MODEL_REASON.create,
    }
    let id = props.modelId
    if (id) await updateModelApi(id, payload)
    else {
      const result = (await createModelApi(payload)) as {
        id?: unknown
        model_id?: unknown
        resource_id?: unknown
      }
      id = [result?.id, result?.model_id, result?.resource_id].find(
        (x): x is string => typeof x === 'string' && !!x,
      )
      if (!id) MessagePlugin.error(tr('createdMissingId'))
      if (id)
        for (const logicalId of form.logical_ids.slice(1)) {
          try {
            await mountLogicalModelApi(logicalId, {
              physical_model_id: id,
              confirm_existing_grant_impact: false,
              reason: MODEL_REASON.update,
            })
          } catch (e) {
            error(e)
          }
        }
    }
    if (id && (!props.modelId || priceKey() !== initialPrice.value)) {
      try {
        await updateModelPricingApi(id, {
          input_price: Number(form.input_price ?? 0).toFixed(4),
          cached_input_price:
            form.cached_input_price == null ? '0' : String(form.cached_input_price),
          output_price: Number(form.output_price ?? 0).toFixed(4),
          currency: form.currency,
          unit: 'PER_MILLION_TOKENS',
          reason: MODEL_REASON.pricing,
        })
      } catch (e) {
        MessagePlugin.error(tr('pricingFailed'))
        error(e)
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
    :visible="visible"
    :header="tr(modelId ? 'edit' : 'create')"
    :confirm-btn="tr('confirm')"
    :cancel-btn="tr('cancel')"
    :confirm-loading="saving"
    @confirm="submit"
    @close="emit('update:visible', false)"
  >
    <t-form :data="form" label-align="top">
      <t-form-item :label="tr('provider')" required
        ><t-select
          v-model="form.provider_id"
          :disabled="!!modelId"
          :options="providers.map((p) => ({ label: `${p.name} · ${p.base_url}`, value: p.id }))"
      /></t-form-item>
      <t-form-item :label="tr('modelIdAtProvider')" required
        ><t-input
          v-model="form.model_id_at_provider"
          :disabled="!!modelId"
          :placeholder="tr('modelIdPlaceholder')"
      /></t-form-item>
      <t-form-item :label="tr('modelType')" required
        ><t-select
          v-model="form.model_type"
          :options="
            ['LLM', 'EMBEDDING', 'MULTIMODAL', 'IMAGE', 'AUDIO', 'VIDEO'].map((value) => ({
              label: value,
              value,
            }))
          "
      /></t-form-item>
      <t-form-item :label="tr('logicalModels')"
        ><div>
          <t-select
            v-model="form.logical_ids"
            multiple
            clearable
            :placeholder="tr('logicalPlaceholder')"
            :options="logical.map((x) => ({ label: x.display_name, value: x.id }))"
          /><t-checkbox v-model="form.auto">{{ tr('autoMatch') }}</t-checkbox>
        </div></t-form-item
      >
      <t-form-item :label="tr('invocationApi')" required
        ><t-select v-model="form.combination" :options="invocationOptions"
      /></t-form-item>
      <t-form-item :label="tr('capabilities')"
        ><t-checkbox v-model="form.supports_streaming">{{ tr('streaming') }}</t-checkbox
        ><t-checkbox v-model="form.supports_tool_calling">{{ tr('toolCalling') }}</t-checkbox
        ><t-checkbox v-model="form.supports_json_mode">{{ tr('jsonMode') }}</t-checkbox
        ><t-checkbox v-model="form.supports_vision">{{ tr('vision') }}</t-checkbox></t-form-item
      >
      <t-form-item :label="tr('contextWindow')"
        ><t-input-number v-model="form.context_window" :min="0"
      /></t-form-item>
      <t-form-item :label="tr('maxOutputTokens')"
        ><t-input-number v-model="form.max_output_tokens" :min="0"
      /></t-form-item>
      <t-form-item :label="tr('inputPrice')" required
        ><t-input-number v-model="form.input_price" :min="0" :decimal-places="4"
      /></t-form-item>
      <t-form-item :label="tr('cachedInputPrice')"
        ><t-input-number v-model="form.cached_input_price" :min="0" :decimal-places="4"
      /></t-form-item>
      <t-form-item :label="tr('outputPrice')" required
        ><t-input-number v-model="form.output_price" :min="0" :decimal-places="4"
      /></t-form-item>
      <t-form-item :label="tr('currency')" required
        ><t-radio-group v-model="form.currency"
          ><t-radio value="CNY">CNY</t-radio><t-radio value="USD">USD</t-radio></t-radio-group
        ></t-form-item
      >
      <t-form-item :label="tr('description')"
        ><t-textarea v-model="form.description" :placeholder="tr('optional')"
      /></t-form-item>
    </t-form>
  </t-dialog>
</template>
