<template>
  <t-dialog
    :visible="true"
    :header="t('providerModels.title', { name: provider.name })"
    width="var(--provider-model-dialog-width)"
    :close-on-overlay-click="false"
    @close="close"
  >
    <div class="content">
      <t-steps :current="1" :readonly="true">
        <t-step-item :value="1" :title="t('providerModels.step1')" />
        <t-step-item
          v-for="step in [2, 3, 4]"
          :key="step"
          :value="step"
          :title="t('providerModels.step' + step)"
          status="default"
          disabled
        />
      </t-steps>
      <t-alert v-if="templateError" theme="warning" :message="t('providerModels.templateError')" />
      <t-alert v-if="notice" theme="warning" :message="notice" />
      <template v-if="!resultOnly">
        <div v-if="!discovering && !candidates.length">
          <t-alert theme="info" :message="t('providerModels.emptyHint')" />
          <p v-if="safeError" class="secondary">
            {{ t('providerModels.errorCode', { code: safeError }) }}
          </p>
        </div>
        <div>{{ t('providerModels.count', { n: candidateTotal, m: eligible.length }) }}</div>
        <t-checkbox
          :checked="eligible.length > 0 && selected.length === eligible.length"
          :indeterminate="selected.length > 0 && selected.length < eligible.length"
          :disabled="!eligible.length || busy"
          @change="selectAll"
        >
          {{ t('providerModels.selectAll') }}
        </t-checkbox>
        <t-table
          row-key="candidate_id"
          :data="candidates"
          :columns="columns"
          :loading="discovering"
          :empty="t('providerModels.noData')"
        >
          <template #selection="{ row }">
            <t-checkbox
              :checked="selected.includes(row.candidate_id)"
              :disabled="busy || !canSelect(row)"
              :aria-label="row.model_id_at_provider"
              @change="toggle(row)"
            />
          </template>
          <template #model_id_at_provider="{ row }">
            <div>{{ row.model_id_at_provider }}</div>
            <div v-if="row.manual_confirmation_reason" class="secondary">
              {{ row.manual_confirmation_reason }}
            </div>
            <div v-if="!combination(row.model_type)" class="secondary">
              {{ t('providerModels.unsupportedType') }}
            </div>
          </template>
          <template #model_type="{ row }">{{ row.model_type || '—' }}</template>
          <template #logical_suggestions="{ row }">
            {{ row.logical_suggestions.map(suggestionName).join('、') || '—' }}
          </template>
        </t-table>
        <t-collapse>
          <t-collapse-panel :header="t('providerModels.manualTitle')" value="manual">
            <div class="manual-content">
              <div v-if="!candidates.length">{{ t('providerModels.manualHint') }}</div>
              <div v-for="row in manual" :key="row.key" class="manual-row">
                <t-input
                  v-model="row.model_id_at_provider"
                  :disabled="busy"
                  :maxlength="512"
                  :placeholder="t('providerModels.modelId') + '*'"
                  :aria-label="t('providerModels.modelId') + '*'"
                />
                <t-select
                  v-model="row.model_type"
                  :disabled="busy"
                  :options="typeOptions"
                  :aria-label="t('providerModels.type')"
                />
                <t-button
                  theme="default"
                  variant="text"
                  :disabled="busy"
                  @click="removeManual(row.key)"
                  >{{ t('providerModels.remove') }}</t-button
                >
              </div>
              <t-button theme="default" :disabled="busy" @click="addManual">{{
                t('providerModels.addRow')
              }}</t-button>
            </div>
          </t-collapse-panel>
        </t-collapse>
        <div class="secondary">{{ t('providerModels.footerHint') }}</div>
      </template>
      <t-table
        v-else
        row-key="index"
        :data="result?.items ?? []"
        :columns="resultColumns"
        :empty="t('providerModels.noData')"
      >
        <template #model_id_at_provider="{ row }">{{
          row.model_id_at_provider || submittedIds[row.index] || '—'
        }}</template>
        <template #status="{ row }">{{ t('providerModels.statuses.' + row.status) }}</template>
        <template #safe_error_code="{ row }">{{ row.safe_error_code || '—' }}</template>
      </t-table>
    </div>
    <template #footer>
      <t-button v-if="resultOnly" theme="default" @click="close">{{
        t('providerModels.close')
      }}</t-button>
      <t-space v-else>
        <t-button theme="default" @click="close">{{ t('providerModels.later') }}</t-button>
        <t-button :loading="submitting" :disabled="busy || templateError || !count" @click="submit">
          {{ t('providerModels.continue', { n: count }) }}
        </t-button>
      </t-space>
    </template>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PrimaryTableCol } from 'tdesign-vue-next'
import {
  discoverProviderModelsApi,
  getModelDiscoveryApi,
  getModelDiscoveryItemsApi,
  importProviderModelsApi,
  getModelImportBatchApi,
  type ProviderItem,
  type ProviderTemplate,
  type ProviderModelType,
  type DiscoveryItem,
  type ModelImportItem,
  type ModelImportBatch,
} from '@/api/modules/providers'

const props = defineProps<{ provider: ProviderItem; templates: ProviderTemplate[] }>()
const emit = defineEmits<{ close: []; imported: [] }>()
const { t } = useI18n()
const candidates = ref<DiscoveryItem[]>([])
const candidateTotal = ref(0)
const selected = ref<string[]>([])
let manualKey = 0
const manual = ref<{ key: number; model_id_at_provider: string; model_type: ProviderModelType }[]>(
  [],
)
const discovering = ref(true)
const submitting = ref(false)
const busy = computed(() => discovering.value || submitting.value)
const discoveryId = ref<string>()
const safeError = ref('')
const notice = ref('')
const result = ref<ModelImportBatch>()
const resultOnly = ref(false)
let lastBatch: ModelImportBatch | undefined
const submittedIds = ref<string[]>([])
const controller = new AbortController()
let stopped = false
let timer: ReturnType<typeof setTimeout> | undefined
let resumeWait: (() => void) | undefined
const available = computed(() => {
  const all =
    props.templates
      .find((item) => item.template_key === props.provider.template_key)
      ?.combinations.filter((item) => item.support_status !== 'UNAVAILABLE') ?? []
  const matching = all.filter(
    (item) =>
      item.auth_mode === props.provider.auth_mode &&
      item.endpoint_profile === props.provider.endpoint_profile,
  )
  return matching.length ? matching : all
})
const templateError = computed(() => !available.value.length)
function combination(type: ProviderModelType | null) {
  const apis: string[] =
    type === 'EMBEDDING'
      ? ['EMBEDDINGS']
      : type === 'IMAGE'
        ? ['IMAGE_GENERATIONS']
        : type === 'AUDIO'
          ? ['AUDIO']
          : type === 'VIDEO'
            ? ['VIDEO']
            : ['CHAT_COMPLETIONS', 'RESPONSES', 'MESSAGES', 'GENERATE_CONTENT', 'CONVERSE']
  for (const api of apis) {
    const match = available.value.find((item) => item.invocation_api === api)
    if (match) return match
  }
}
function suggestionName(item: { display_name: string }) {
  return item.display_name
}
function canSelect(row: DiscoveryItem) {
  return row.auto_create_allowed && !!combination(row.model_type)
}
const eligible = computed(() => candidates.value.filter(canSelect))
const count = computed(() => selected.value.length + manual.value.length)
const typeOptions = (['LLM', 'EMBEDDING', 'IMAGE', 'AUDIO', 'VIDEO', 'MULTIMODAL'] as const).map(
  (value) => ({ label: value, value }),
)
const columns = computed<PrimaryTableCol<DiscoveryItem>[]>(() => [
  { colKey: 'selection', title: '', width: 48 },
  { colKey: 'model_id_at_provider', title: t('providerModels.modelId') },
  { colKey: 'display_name', title: t('providerModels.displayName') },
  { colKey: 'model_type', title: t('providerModels.type') },
  { colKey: 'logical_suggestions', title: t('providerModels.suggestions') },
])
const resultColumns = computed<PrimaryTableCol<ModelImportBatch['items'][number]>[]>(() => [
  { colKey: 'model_id_at_provider', title: t('providerModels.modelId') },
  { colKey: 'status', title: t('providerModels.status') },
  { colKey: 'safe_error_code', title: t('providerModels.errorCodeLabel') },
])
function addManual() {
  manual.value.push({ key: ++manualKey, model_id_at_provider: '', model_type: 'LLM' })
}
addManual()
function removeManual(key: number) {
  manual.value = manual.value.filter((row) => row.key !== key)
}
function toggle(row: DiscoveryItem) {
  if (busy.value || !canSelect(row)) return
  selected.value = selected.value.includes(row.candidate_id)
    ? selected.value.filter((id) => id !== row.candidate_id)
    : [...selected.value, row.candidate_id]
}
function selectAll() {
  selected.value =
    selected.value.length === eligible.value.length
      ? []
      : eligible.value.map((row) => row.candidate_id)
}
function stop() {
  stopped = true
  controller.abort()
  clearTimeout(timer)
  resumeWait?.()
}
function close() {
  stop()
  emit('close')
}
onBeforeUnmount(stop)
async function wait(deadline: number) {
  await new Promise<void>((resolve) => {
    resumeWait = resolve
    timer = setTimeout(resolve, Math.min(1500, Math.max(0, deadline - Date.now())))
  })
}
async function discover() {
  try {
    const created = await discoverProviderModelsApi(props.provider.id, controller.signal)
    if (stopped) return
    const deadline = Date.now() + 60000
    while (!stopped && Date.now() < deadline) {
      const data = await getModelDiscoveryApi(
        created.discovery_id,
        controller.signal,
        Math.max(1, Math.min(20000, deadline - Date.now())),
      )
      if (stopped) return
      if (data.status === 'SUCCEEDED' || data.status === 'FAILED') {
        discoveryId.value = data.discovery_id
        safeError.value = data.safe_error_code ?? ''
        if (data.status === 'FAILED' || !data.item_count) return
        for (let page = 1; !stopped; page++) {
          const list = await getModelDiscoveryItemsApi(data.discovery_id, page, controller.signal)
          if (stopped) return
          candidates.value.push(...list.items)
          candidateTotal.value = list.total
          if (page >= list.total_pages) break
        }
        return
      }
      await wait(deadline)
    }
    if (!stopped) notice.value = t('providerModels.discoveryTimeout')
  } catch {
    // HTTP and business errors are displayed by the shared request layer.
    if (!stopped) notice.value = t('providerModels.discoveryFailed')
  } finally {
    if (!stopped) discovering.value = false
  }
}
async function submit() {
  if (busy.value || templateError.value || !count.value) return
  notice.value = ''
  if (manual.value.some((row) => !row.model_id_at_provider.trim())) {
    notice.value = t('providerModels.requiredId')
    return
  }
  const chosen = candidates.value.filter((row) => selected.value.includes(row.candidate_id))
  const rows = [
    ...chosen.map((row) => ({
      source: 'DISCOVERY' as const,
      candidate_id: row.candidate_id,
      model_type: row.model_type ?? undefined,
      id: row.model_id_at_provider,
    })),
    ...manual.value.map((row) => ({
      source: 'MANUAL' as const,
      model_id_at_provider: row.model_id_at_provider.trim(),
      model_type: row.model_type,
      id: row.model_id_at_provider.trim(),
    })),
  ]
  if (rows.length > 100) {
    notice.value = t('providerModels.limit')
    return
  }
  const items: ModelImportItem[] = []
  for (const row of rows) {
    const match = combination(row.model_type ?? null)
    if (!match) {
      notice.value = t('providerModels.unsupportedType')
      return
    }
    const payload =
      row.source === 'DISCOVERY'
        ? { source: row.source, candidate_id: row.candidate_id, model_type: row.model_type }
        : {
            source: row.source,
            model_id_at_provider: row.model_id_at_provider,
            model_type: row.model_type,
          }
    items.push({
      ...payload,
      invocation_api: match.invocation_api,
      operation_profile: match.operation_profile,
      invocation_config: {},
      logical_binding: { mode: 'NONE' },
    })
  }
  submittedIds.value = rows.map((row) => row.id)
  submitting.value = true
  let batchId: string | undefined
  try {
    const accepted = await importProviderModelsApi(
      props.provider.id,
      {
        ...(discoveryId.value ? { discovery_id: discoveryId.value } : {}),
        items,
      },
      controller.signal,
    )
    if (stopped) return
    batchId = accepted.batch_id
    const deadline = Date.now() + 120000
    while (!stopped && Date.now() < deadline) {
      const batch = await getModelImportBatchApi(
        batchId,
        controller.signal,
        Math.max(1, Math.min(20000, deadline - Date.now())),
      )
      if (stopped) return
      lastBatch = batch
      if (
        batch.status === 'SUCCEEDED' ||
        (batch.items.length > 0 && batch.items.every((item) => item.status === 'SUCCEEDED'))
      ) {
        MessagePlugin.success(t('providerModels.imported'))
        emit('imported')
        close()
        return
      }
      if (['PARTIAL', 'FAILED', 'CANCELLED'].includes(batch.status)) {
        result.value = batch
        resultOnly.value = true
        return
      }
      result.value = undefined
      await wait(deadline)
    }
    if (!stopped) {
      notice.value = t('providerModels.importTimeout')
      result.value = lastBatch
      resultOnly.value = true
    }
  } catch {
    if (!stopped) {
      notice.value = t('providerModels.importFailed')
      result.value = lastBatch
      resultOnly.value = true
    }
  } finally {
    if (!stopped) submitting.value = false
  }
}
onMounted(() => {
  void discover()
})
</script>

<style scoped>
.content,
.manual-content {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.manual-row {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.manual-row > :first-child {
  flex: 2;
}
.manual-row :deep(.t-select__wrap) {
  flex: 1;
}
.secondary {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
  margin-top: var(--td-comp-margin-xs);
}
</style>
