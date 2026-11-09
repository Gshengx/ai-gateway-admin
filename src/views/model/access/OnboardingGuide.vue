<template>
  <t-dialog
    dialog-class-name="model-access-dialog"
    :close-btn="true"
    :visible="true"
    :header="
      t('ma.guideTitle', {
        step: step === 4 ? t('ma.onboardingComplete') : t('ma.step' + step),
        name: provider.name,
      })
    "
    width="var(--provider-model-dialog-width)"
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <div class="ma-stack">
      <t-steps :current="step" :readonly="true"
        ><t-step-item v-for="n in [1, 2, 3, 4]" :key="n" :value="n" :title="t('ma.step' + n)"
      /></t-steps>
      <template v-if="step === 1">
        <t-alert v-if="notice" theme="warning" :message="notice" />
        <div class="ma-row ma-between">
          <span>{{ t('ma.discoverCount', { n: candidates.length, m: eligible.length }) }}</span
          ><t-checkbox
            :checked="eligible.length > 0 && selected.length === eligible.length"
            :disabled="!eligible.length"
            @change="
              (v: boolean) => (selected = v ? eligible.map((c) => c.model_id_at_provider) : [])
            "
            >{{ t('ma.selectAll') }}</t-checkbox
          >
        </div>
        <t-table
          row-key="model_id_at_provider"
          :data="candidates"
          :columns="candidateColumns"
          :loading="loading"
          ><template #selection="{ row }"
            ><t-checkbox
              :checked="selected.includes(row.model_id_at_provider)"
              :disabled="row.already_added"
              :aria-label="row.model_id_at_provider"
              @change="(v: boolean) => toggle(row, v)" /></template
          ><template #display_name="{ row }"
            ><div>{{ row.display_name }}</div>
            <div class="ma-muted">{{ row.model_id_at_provider }}</div></template
          ><template #tags="{ row }"
            ><t-space break-line
              ><t-tag variant="light" v-for="tag in row.tags" :key="tag">{{ tagLabel(tag) }}</t-tag
              ><span v-if="!row.tags.length">—</span></t-space
            ></template
          ><template #model_id_at_gateway="{ row }"
            ><t-input
              v-model="row.model_id_at_gateway"
              :disabled="row.already_added"
              :status="conflict(row) ? 'error' : undefined"
            /><span v-if="conflict(row)" class="ma-error">{{
              t('ma.nameConflict')
            }}</span></template
          ><template #status="{ row }">{{
            t(row.already_added ? 'ma.added' : 'ma.available')
          }}</template></t-table
        >
        <t-link theme="primary" @click="manualVisible = !manualVisible">{{
          t('ma.manual')
        }}</t-link>
        <div v-if="manualVisible" class="ma-box ma-stack">
          <div class="ma-grid">
            <t-input
              v-model="manual.model_id_at_provider"
              :placeholder="t('ma.upstream')"
              @change="manualPrefill"
            /><t-input v-model="manual.model_id_at_gateway" :placeholder="t('ma.name')" />
          </div>
          <div class="ma-footer">
            <t-button theme="primary" @click="addManual">{{ t('ma.addManual') }}</t-button>
          </div>
        </div>
        <p class="ma-muted">{{ t('ma.manualHint') }}</p>
      </template>
      <template v-else-if="step === 2">
        <t-loading :loading="busy"
          ><div class="ma-stack">
            <div v-for="model in imported" :key="model.id" class="ma-box ma-stack">
              <strong>{{ model.model_id_at_gateway }}</strong
              ><span class="ma-muted">{{ t('ma.upstream') }} {{ model.model_id_at_provider }}</span>
              <t-form class="ma-form" label-align="top" required-mark-position="right">
                <InvocationEditor
                  v-model:standard="model.supported_invocation_apis"
                  v-model:custom="model.custom_invocation_apis"
                  :disabled="busy || ['PENDING_REVIEW', 'ACTIVE'].includes(model.status)"
                />
              </t-form>
            </div></div
        ></t-loading>
      </template>
      <template v-else-if="step === 3">
        <t-alert
          :theme="passed.length ? 'success' : 'warning'"
          :message="t('ma.readyToPublish', { n: passed.length })"
        />
        <div v-for="model in imported" :key="model.id" class="ma-box ma-row ma-between">
          <div class="ma-stack">
            <strong>{{ model.model_id_at_gateway }}</strong>
            <div class="ma-muted">{{ t('ma.upstream') }} {{ model.model_id_at_provider }}</div>
            <div class="ma-muted">
              {{ t('ma.invocation') }}
              {{
                invocationTargets(model)
                  .map((api) => api.path || invocationLabel(api.invocation_api))
                  .join('、')
              }}
            </div>
          </div>
          <t-tag variant="light" :theme="statusTheme(results[model.id]?.status ?? 'FAILED')">{{
            t('ma.' + (results[model.id]?.status ?? 'FAILED'))
          }}</t-tag>
        </div>
        <p class="ma-muted">{{ t('ma.failedRemainDraft') }}</p>
        <t-link theme="primary" @click="goModels">{{ t('ma.continueInModels') }}</t-link>
      </template>
      <template v-else
        ><t-alert theme="success" :message="t('ma.publishedSummary', { n: passed.length })" />
        <div v-for="model in passed" :key="model.id" class="ma-box ma-row ma-between">
          <div class="ma-stack">
            <strong>{{ model.model_id_at_gateway }}</strong
            ><span class="ma-muted">{{ t('ma.upstream') }} {{ model.model_id_at_provider }}</span>
          </div>
          <t-tag variant="light" theme="success">{{ t('ma.ACTIVE') }}</t-tag>
        </div>
        <t-link theme="primary" @click="goModels">{{ t('ma.viewInModels') }}</t-link></template
      >
    </div>
    <template #footer
      ><div class="ma-footer">
        <t-button v-if="step !== 4" theme="default" :disabled="busy" @click="emit('close')">{{
          t(step === 4 ? 'ma.close' : 'ma.later')
        }}</t-button>
        <t-button
          v-if="step === 1"
          v-permission.write="'model.models'"
          theme="primary"
          :disabled="!selected.length || selectedCandidates.some(conflict)"
          :loading="busy"
          @click="add"
          >{{ t('ma.continue', { n: selected.length }) }}</t-button
        >
        <t-button
          v-else-if="step === 2"
          v-permission.write="'model.admission'"
          theme="primary"
          :loading="busy"
          @click="testAll"
          >{{ t('ma.modelTestStart') }}</t-button
        >
        <t-button
          v-else-if="step === 3"
          v-permission.write="'model.review'"
          theme="primary"
          :disabled="!passed.length"
          :loading="busy"
          @click="publish"
          >{{ t('ma.publishPassed', { n: passed.length }) }}</t-button
        >
        <t-button v-else theme="primary" @click="emit('close')">{{ t('ma.step4') }}</t-button>
      </div></template
    >
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { MessagePlugin, type PrimaryTableCol } from 'tdesign-vue-next'
import {
  accessApi,
  type Provider,
  type Model,
  type Candidate,
  type TestRun,
} from '@/api/modules/modelAccess'
import InvocationEditor from './InvocationEditor.vue'
import { invocationTargets, validInvocationPath } from '@/utils/modelInvocation'
import { invocationLabel, statusTheme, tagLabel } from './helpers'
const props = defineProps<{ provider: Provider }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { t } = useI18n(),
  router = useRouter()
const step = ref(1),
  loading = ref(true),
  busy = ref(false),
  notice = ref(''),
  discoveryId = ref(''),
  manualVisible = ref(false)
const candidates = ref<Candidate[]>([]),
  selected = ref<string[]>([]),
  imported = ref<Model[]>([]),
  results = ref<Record<string, TestRun>>({}),
  existingNames = ref<string[]>([])
const empty = (): Candidate => ({
  model_id_at_provider: '',
  model_id_at_gateway: '',
  display_name: '',
  input_modalities: [],
  output_modalities: [],
  tags: [],
  supported_invocation_apis: ['CHAT_COMPLETIONS'],
  custom_invocation_apis: [],
  already_added: false,
})
const manual = ref(empty())
const eligible = computed(() => candidates.value.filter((c) => !c.already_added))
const selectedCandidates = computed(() =>
  candidates.value.filter((c) => selected.value.includes(c.model_id_at_provider)),
)
const candidateColumns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'selection', title: '', width: 45 },
  { colKey: 'display_name', title: t('ma.candidate') },
  { colKey: 'tags', title: t('ma.capability') },
  { colKey: 'model_id_at_gateway', title: t('ma.name') },
  { colKey: 'status', title: t('ma.status'), width: 80 },
])
let closed = false
function conflict(c: Candidate) {
  return (
    !c.already_added &&
    (!c.model_id_at_gateway.trim() ||
      existingNames.value.includes(c.model_id_at_gateway) ||
      selectedCandidates.value.some(
        (x) => x !== c && x.model_id_at_gateway === c.model_id_at_gateway,
      ))
  )
}
function toggle(c: Candidate, v: boolean) {
  selected.value = v
    ? [...selected.value, c.model_id_at_provider]
    : selected.value.filter((x) => x !== c.model_id_at_provider)
}
let lastManualName = ''
function manualPrefill(value: string) {
  if (!manual.value.model_id_at_gateway || manual.value.model_id_at_gateway === lastManualName) {
    manual.value.model_id_at_gateway = value
    lastManualName = value
  }
}
function addManual() {
  const m = manual.value
  if (
    !m.model_id_at_provider.trim() ||
    !m.model_id_at_gateway.trim() ||
    candidates.value.some((c) => c.model_id_at_provider === m.model_id_at_provider)
  ) {
    MessagePlugin.warning(t('ma.required'))
    return
  }
  m.display_name = m.model_id_at_provider
  candidates.value.push(JSON.parse(JSON.stringify(m)) as Candidate)
  selected.value.push(m.model_id_at_provider)
  manual.value = empty()
  lastManualName = ''
}
async function add() {
  busy.value = true
  try {
    const result = await accessApi.import(
      props.provider.id,
      discoveryId.value,
      selectedCandidates.value,
    )
    imported.value = result.items
    notice.value = result.errors.join('、')
    if (imported.value.length) {
      step.value = 2
      emit('changed')
    }
  } finally {
    busy.value = false
  }
}
async function testAll() {
  if (
    imported.value.some(
      (m) =>
        !m.supported_invocation_apis.length ||
        m.custom_invocation_apis.some((a) => !validInvocationPath(a.path)),
    )
  ) {
    MessagePlugin.warning(t('ma.required'))
    return
  }
  busy.value = true
  notice.value = ''
  try {
    for (const m of imported.value) {
      if (closed) break
      if (['PENDING_REVIEW', 'ACTIVE'].includes(m.status)) continue
      await accessApi.saveModel(m)
      let run = await accessApi.startTest(m.id, 'ADMISSION', [
        'CONNECTIVITY',
        'PROTOCOL',
        ...(m.tags.includes('STREAMING') ? ['STREAMING'] : []),
      ])
      m.status = 'TESTING'
      while (run.status === 'RUNNING' && !closed) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        run = await accessApi.test(m.id, 'ADMISSION', run.id)
        results.value[m.id] = run
      }
      if (!closed) Object.assign(m, await accessApi.model(m.id))
    }
    if (!closed) {
      step.value = 3
      emit('changed')
    }
  } finally {
    busy.value = false
  }
}
function goModels() {
  void router.push('/model/models')
  emit('close')
}
const passed = computed(() =>
  imported.value.filter((m) => ['PENDING_REVIEW', 'ACTIVE'].includes(m.status)),
)
async function publish() {
  busy.value = true
  try {
    for (const m of imported.value.filter((m) => m.status === 'PENDING_REVIEW'))
      Object.assign(m, await accessApi.status(m.id, 'ACTIVE', t('ma.publishSelected')))
    step.value = 4
    emit('changed')
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  try {
    const first = await accessApi.models({ page: 1, page_size: 100 })
    const all = [...first.items]
    for (let page = 2; page <= first.total_pages; page++)
      all.push(...(await accessApi.models({ page, page_size: 100 })).items)
    existingNames.value = all.map((m) => m.model_id_at_gateway)
    const result = await accessApi.discover(props.provider.id)
    discoveryId.value = result.discovery_id
    candidates.value = result.items
    selected.value = eligible.value.map((c) => c.model_id_at_provider)
    if (result.error_code) {
      notice.value = t('ma.' + result.error_code)
      manualVisible.value = true
    }
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(() => {
  closed = true
})
</script>
<style scoped src="./access.css"></style>
