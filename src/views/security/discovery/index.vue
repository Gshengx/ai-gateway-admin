<template>
  <div class="security-workspace security-page">
    <div class="security-grid" role="tablist" :aria-label="label('analysisSource')">
      <div
        v-for="option in ['UPLOAD', 'AUDIT'] as const"
        :key="option"
        class="security-discovery-card"
        :class="{ 'is-selected': source === option }"
      >
        <t-button
          role="tab"
          :aria-selected="source === option"
          variant="text"
          theme="default"
          @click="changeSource(option)"
          >{{ label(option === 'UPLOAD' ? 'uploadAnalysis' : 'auditAnalysis') }}</t-button
        >
        <p class="security-help">
          {{ label(option === 'UPLOAD' ? 'uploadAnalysisHelp' : 'auditAnalysisHelp') }}
        </p>
      </div>
    </div>
    <t-alert v-if="errorMessage" theme="error" :message="errorMessage" />
    <t-alert v-if="!modelReady" theme="warning" :message="label('discoveryModelMissing')" />
    <template v-if="active">
      <div class="security-inline">
        <h3 class="security-heading">
          {{ label(active.source === 'UPLOAD' ? 'uploadAnalysis' : 'auditRecords') }}
        </h3>
        <span>{{ formatDateTime(active.created_at) }}</span
        ><span class="security-spacer" /><t-button theme="default" @click="back">{{
          label('backAnalysis')
        }}</t-button>
      </div>
      <div v-if="active.files.length" class="security-stack">
        <div
          v-for="file in active.files"
          :key="file.sha256"
          class="security-group security-file-name"
        >
          <strong>{{ file.name }}</strong
          ><span>{{ file.actual_format }} · {{ file.size }} B</span
          ><span>SHA-256: {{ file.sha256 }}</span>
        </div>
      </div>
      <p v-if="active.source === 'AUDIT'" class="security-help">
        {{ t('security.auditAnalysisSummary', { n: active.record_ids.length }) }}
      </p>
      <template v-if="active.status === 'READING' || active.status === 'RECOGNIZING'"
        ><t-loading :loading="true" />
        <p>{{ label(active.status) }}</p>
        <t-button theme="default" @click="cancelTask(active.id)">{{
          label('cancel')
        }}</t-button></template
      >
      <template v-else-if="active.status === 'FAILED'"
        ><t-alert theme="error" :message="label('analysisFailed')" /><t-button @click="retry">{{
          label('reanalyze')
        }}</t-button></template
      >
      <template v-else-if="active.status === 'COMPLETED'">
        <h3 class="security-heading">{{ label('ruleSuggestions') }}</h3>
        <p class="security-help">{{ label('mockEvaluation') }}</p>
        <div class="security-inline">
          <t-tag v-for="status in ['PENDING', 'CONFIRMED', 'CREATED']" :key="status"
            >{{ label(status) }}
            {{ active.suggestions.filter((s) => s.status === status).length }}</t-tag
          >
        </div>
        <section v-for="type in ['FIELD', 'DOCUMENT_PATTERN']" :key="type" class="security-stack">
          <h3
            v-if="active.suggestions.some((s) => s.rule.rule_type === type)"
            class="security-heading"
          >
            {{ label(type === 'FIELD' ? 'fieldSuggestions' : 'documentSuggestions') }}
          </h3>
          <div
            v-for="suggestion in active.suggestions.filter((s) => s.rule.rule_type === type)"
            :key="suggestion.id"
            class="security-group"
          >
            <div class="security-inline">
              <strong>{{ name(suggestion.rule) }}</strong
              ><t-tag>{{ label(suggestion.rule.sub_category) }}</t-tag
              ><t-tag>{{ label(suggestion.rule.sensitivity_level) }}</t-tag
              ><span>{{ label('confidence') }} {{ Math.round(suggestion.confidence * 100) }}%</span
              ><t-tag>{{ label(suggestion.status) }}</t-tag>
            </div>
            <p>{{ suggestion.rule.description }}</p>
            <strong>{{ label('recognitionEvidence') }}</strong>
            <pre class="security-evidence">{{
              suggestion.evidence || label('genericCandidate')
            }}</pre>
            <p v-if="suggestion.location">
              {{ label('evidenceLocation') }}: {{ suggestion.location }}
            </p>
            <div v-if="canWrite" class="security-inline">
              <template v-if="suggestion.status === 'PENDING'"
                ><t-button theme="default" @click="setStatus(suggestion, 'CONFIRMED')">{{
                  label('confirmSuggestion')
                }}</t-button
                ><t-button theme="default" @click="setStatus(suggestion, 'IGNORED')">{{
                  label('ignore')
                }}</t-button></template
              ><template v-else-if="suggestion.status === 'CONFIRMED'"
                ><t-button @click="editing = suggestion">{{ label('editCreateRule') }}</t-button
                ><t-button theme="default" @click="setStatus(suggestion, 'PENDING')">{{
                  label('unconfirm')
                }}</t-button></template
              ><t-button
                v-else-if="suggestion.status === 'IGNORED'"
                theme="default"
                @click="setStatus(suggestion, 'PENDING')"
                >{{ label('restoreSuggestion') }}</t-button
              ><t-button
                v-else-if="suggestion.status === 'CREATED'"
                theme="default"
                @click="router.push({ query: { tab: 'rules' } })"
                >{{ label('viewRules') }}</t-button
              >
            </div>
          </div>
        </section>
        <t-alert v-if="!active.suggestions.length" theme="info" :message="label('noSuggestions')" />
      </template>
    </template>
    <template v-else>
      <section v-if="source === 'UPLOAD'" class="security-group">
        <h3 class="security-heading">{{ label('uploadSamples') }}</h3>
        <p class="security-help">{{ label('sampleLimit') }}</p>
        <label v-if="canWrite" class="security-inline"
          ><input
            ref="fileInput"
            class="security-hidden-input"
            type="file"
            multiple
            @change="readFiles"
          /><t-button theme="default" @click.prevent="fileInput?.click()">{{
            label('selectFiles')
          }}</t-button
          ><span>{{ label('anyFormat') }}</span></label
        ><t-loading v-if="reading" :loading="true" />
        <p v-if="!files.length">{{ label('selectBeforeAnalysis') }}</p>
        <div
          v-for="(file, index) in files"
          :key="file.sha256 + index"
          class="security-group security-file-name"
        >
          <strong>{{ file.name }}</strong
          ><span>{{ file.actual_format }} · {{ file.size }} B</span
          ><span>SHA-256: {{ file.sha256 }}</span
          ><t-button v-if="canWrite" theme="default" @click="files.splice(index, 1)">{{
            label('remove')
          }}</t-button>
        </div>
        <t-button
          v-permission.write="'security.dataControl'"
          :disabled="!files.length || reading || !modelReady"
          :loading="starting"
          @click="start"
          >{{ label('startAnalysis') }}</t-button
        >
      </section>
      <section v-else class="security-group">
        <h3 class="security-heading">{{ label('auditRange') }}</h3>
        <p class="security-help">{{ label('auditRangeHelp') }}</p>
        <div class="security-filters">
          <t-select
            v-model="range"
            :options="[
              { value: 90, label: label('last90') },
              { value: 7, label: label('last7') },
              { value: 1, label: label('last1') },
            ]"
            @change="loadRecords"
          /><t-select
            v-model="user"
            :options="[
              { value: '', label: label('ALL_USERS') },
              ...recordOptions.map((r) => ({ value: r.user, label: r.user })),
            ]"
            @change="loadRecords"
          /><t-select
            v-model="model"
            :options="[
              { value: '', label: label('ALL_MODELS') },
              ...['gpt-4o', 'qwen-plus', 'doubao-pro', 'deepseek-v3'].map((value) => ({
                value,
                label: value,
              })),
            ]"
            @change="loadRecords"
          /><t-button theme="default" @click="resetRecords">{{ label('reset') }}</t-button>
        </div>
        <p>
          {{
            t('security.auditCounts', {
              total: records.length,
              selected: selected.length,
              excluded,
            })
          }}
        </p>
        <t-table
          row-key="id"
          :data="records"
          :columns="recordColumns"
          :selected-row-keys="selected"
          :loading="loadingRecords"
          @select-change="selected = $event.map(String)"
          ><template #requested_at="{ row }">{{ formatDateTime(row.requested_at) }}</template
          ><template #user="{ row }"
            >{{ row.user }}
            <p class="security-help">{{ row.department }}</p></template
          ><template #retained>{{ label('requestBody') }}</template
          ><template #event="{ row }">{{
            label(row.event ? 'hasEvent' : 'noEvent')
          }}</template></t-table
        ><t-button
          v-permission.write="'security.dataControl'"
          :disabled="!selected.length || !modelReady"
          :loading="starting"
          @click="start"
          >{{ label('startAnalysis') }} {{ selected.length }} {{ label('recordsUnit') }}</t-button
        >
      </section>
      <section class="security-stack">
        <h3 class="security-heading">{{ label('analysisTasks') }}</h3>
        <t-table row-key="id" :data="tasks" :columns="taskColumns" :empty="label('noTasks')"
          ><template #source="{ row }">{{
            label(row.source === 'UPLOAD' ? 'uploadAnalysis' : 'auditAnalysis')
          }}</template
          ><template #scope="{ row }">{{
            row.source === 'UPLOAD'
              ? row.files.map((f: DiscoveryFile) => f.name).join('、')
              : `${row.record_ids.length} ${label('recordsUnit')}`
          }}</template
          ><template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template
          ><template #status="{ row }">{{ label(row.status) }}</template
          ><template #count="{ row }">{{ row.suggestions.length }}</template
          ><template #operations="{ row }"
            ><t-space
              ><t-link theme="primary" @click="openTask(row)">{{ label('view') }}</t-link
              ><t-link
                v-permission.write="'security.dataControl'"
                theme="danger"
                @click="pendingDelete = row.id"
                >{{ label('delete') }}</t-link
              ></t-space
            ></template
          ></t-table
        >
      </section>
    </template>
    <DocumentRuleForm
      v-if="editing?.rule.rule_type === 'DOCUMENT_PATTERN'"
      :value="editing.rule"
      @close="editing = undefined"
      @saved="created"
    />
    <RuleForm
      v-else-if="editing"
      :value="editing.rule"
      @close="editing = undefined"
      @saved="created"
    />
    <RuleSaved v-if="savedRule" :rule="savedRule" @close="savedRule = undefined" />
    <ConfirmAction
      v-if="pendingDelete"
      :busy="deleting"
      danger
      :action="label('delete')"
      :message="label('cleanupSamples')"
      @close="pendingDelete = ''"
      @confirm="cancelTask(pendingDelete)"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin, type TableProps } from 'tdesign-vue-next'
import {
  getSecurityOptions,
  createDiscoveryTask,
  listDiscoveryTasks,
  getDiscoveryTask,
  deleteDiscoveryTask,
  listDiscoveryRecords,
  updateDiscoverySuggestion,
  retryDiscoveryTask,
  type DetectionRule,
  type DiscoveryTask,
  type DiscoveryFile,
  type DiscoveryRecord,
  type DiscoverySuggestion,
} from '@/api/modules/security'
import { formatDateTime } from '@/utils/datetime'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import RuleForm from '../components/RuleForm.vue'
import RuleSaved from '../components/RuleSaved.vue'
import DocumentRuleForm from '../components/DocumentRuleForm.vue'
import ConfirmAction from '../components/ConfirmAction.vue'
import { useSecurity } from '../useSecurity'
const { t, label, locale, name, error, errorMessage, clearErrors } = useSecurity()
const router = useRouter()
const fileInput = ref<HTMLInputElement>()
const modelReady = ref(true)
const canWrite = computed(() =>
  canWriteResource(useUserStore().permissions, 'security.dataControl'),
)
const source = ref<'UPLOAD' | 'AUDIT'>('UPLOAD'),
  files = ref<DiscoveryFile[]>([]),
  reading = ref(false),
  starting = ref(false),
  tasks = ref<DiscoveryTask[]>([]),
  active = ref<DiscoveryTask>(),
  editing = ref<DiscoverySuggestion>(),
  pendingDelete = ref('')
const savedRule = ref<DetectionRule>()
const deleting = ref(false)
const range = ref(90),
  user = ref(''),
  model = ref(''),
  records = ref<DiscoveryRecord[]>([]),
  recordOptions = ref<DiscoveryRecord[]>([]),
  selected = ref<string[]>([]),
  excluded = ref(0),
  loadingRecords = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false,
  generation = 0
const recordColumns = computed<TableProps['columns']>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  ...['requested_at', 'user', 'model', 'retained', 'event'].map((colKey) => ({
    colKey,
    title: label(colKey),
  })),
])
const taskColumns = computed<TableProps['columns']>(() =>
  ['source', 'scope', 'created_at', 'status', 'count', 'operations'].map((colKey) => ({
    colKey,
    title: label(colKey),
  })),
)
async function refresh() {
  try {
    tasks.value = (await listDiscoveryTasks()).items
  } catch (e) {
    error(e)
  }
}
async function changeSource(value: 'UPLOAD' | 'AUDIT') {
  back()
  source.value = value
  if (value === 'AUDIT') await loadRecords()
}
async function readFiles(event: Event) {
  clearErrors()
  const input = event.target as HTMLInputElement,
    picked = Array.from(input.files ?? [])
  files.value = []
  input.value = ''
  if (!picked.length) return
  if (picked.length > 5 || picked.some((f) => f.size > 20 * 1024 * 1024)) {
    void MessagePlugin.warning(label('sampleLimit'))
    return
  }
  reading.value = true
  try {
    const loaded: DiscoveryFile[] = []
    for (const file of picked) {
      const data = await file.arrayBuffer(),
        bytes = new Uint8Array(data)
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
      const header = new TextDecoder().decode(bytes.slice(0, 8))
      const plain = !bytes.slice(0, 4096).some((v) => v === 0)
      const actual_format = header.startsWith('%PDF-')
        ? 'PDF'
        : bytes[0] === 0x50 && bytes[1] === 0x4b
          ? 'ZIP_CONTAINER'
          : plain && /\.csv$/iu.test(file.name)
            ? 'CSV'
            : plain && /\.txt$/iu.test(file.name)
              ? 'TXT'
              : 'BINARY'
      const text =
        file.size <= 1024 * 1024 && ['TXT', 'CSV'].includes(actual_format)
          ? new TextDecoder().decode(data)
          : undefined
      loaded.push({ name: file.name, size: file.size, sha256, actual_format, text })
    }
    files.value = loaded
  } catch (e) {
    error(e)
  } finally {
    reading.value = false
  }
}
async function loadRecords() {
  const token = ++generation
  loadingRecords.value = true
  try {
    const result = await listDiscoveryRecords({
      user: user.value,
      model: model.value,
      since: new Date(Date.now() - range.value * 86400000).toISOString(),
    })
    if (token !== generation || disposed) return
    records.value = result.items
    if (!recordOptions.value.length)
      recordOptions.value = result.items.filter(
        (r, i, a) => a.findIndex((v) => v.user === r.user) === i,
      )
    excluded.value = result.excluded
    selected.value = result.items.map((r) => r.id)
  } catch (e) {
    error(e)
  } finally {
    if (token === generation) loadingRecords.value = false
  }
}
async function resetRecords() {
  range.value = 90
  user.value = ''
  model.value = ''
  await loadRecords()
}
async function start() {
  if (!canWrite.value || starting.value) return
  starting.value = true
  clearErrors()
  try {
    active.value = await createDiscoveryTask(
      source.value,
      source.value === 'UPLOAD' ? files.value : [],
      source.value === 'AUDIT' ? selected.value : [],
      locale.value,
    )
    files.value = []
    poll()
    await refresh()
  } catch (e) {
    error(e)
  } finally {
    starting.value = false
  }
}
function poll() {
  clearTimeout(timer)
  const id = active.value?.id
  if (!id) return
  timer = setTimeout(async () => {
    try {
      const task = await getDiscoveryTask(id)
      if (disposed || active.value?.id !== id) return
      active.value = task
      if (['READING', 'RECOGNIZING'].includes(task.status)) poll()
      else await refresh()
    } catch (e) {
      error(e)
      if (active.value?.id === id) active.value.status = 'FAILED'
    }
  }, 700)
}
function back() {
  clearTimeout(timer)
  active.value = undefined
  editing.value = undefined
  void refresh()
}
function openTask(task: DiscoveryTask) {
  source.value = task.source
  active.value = task
  if (['READING', 'RECOGNIZING'].includes(task.status)) poll()
}
async function setStatus(suggestion: DiscoverySuggestion, status: DiscoverySuggestion['status']) {
  if (!active.value) return
  try {
    active.value = await updateDiscoverySuggestion(active.value.id, suggestion.id, status)
    await refresh()
  } catch (e) {
    error(e)
  }
}
async function created(rule: DetectionRule) {
  if (rule.rule_type === 'DOCUMENT_PATTERN') savedRule.value = rule
  if (!editing.value) return
  await setStatus(editing.value, 'CREATED')
  editing.value = undefined
}
async function retry() {
  if (!active.value) return
  try {
    active.value = await retryDiscoveryTask(active.value.id)
    poll()
  } catch (e) {
    error(e)
  }
}
async function cancelTask(id: string) {
  deleting.value = true
  try {
    await deleteDiscoveryTask(id)
    pendingDelete.value = ''
    if (active.value?.id === id) back()
    await refresh()
  } catch (e) {
    error(e)
  } finally {
    deleting.value = false
  }
}
onMounted(async () => {
  await refresh()
  try {
    modelReady.value = (await getSecurityOptions()).abilities.LLM_JUDGE
  } catch (e) {
    error(e)
  }
})
onUnmounted(() => {
  disposed = true
  generation++
  clearTimeout(timer)
  files.value = []
})
</script>
<style scoped>
@import '@/styles/security.css';
</style>
