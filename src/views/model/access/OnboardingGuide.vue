<template>
  <t-dialog
    :dialog-class-name="
      [
        'model-access-dialog',
        'onboarding-guide',
        busy && step === 2 ? 'onboarding-guide--testing' : '',
      ].join(' ')
    "
    :close-btn="!busy"
    placement="center"
    :visible="true"
    :header="
      t('ma.guideTitle', {
        step: step === 4 ? t('ma.onboardingComplete') : t('ma.step' + step),
        name: provider.name,
      })
    "
    width="var(--provider-model-dialog-width)"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!busy"
    @close="!busy && emit('close')"
  >
    <div class="ma-stack" :inert="busy">
      <t-steps class="onboarding-steps" :current="step" :readonly="true"
        ><t-step-item v-for="n in [1, 2, 3, 4]" :key="n" :value="n" :title="t('ma.step' + n)"
      /></t-steps>
      <template v-if="step === 1">
        <t-alert v-if="notice" theme="warning" :message="notice" />
        <div class="ma-row ma-between onboarding-summary">
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
          class="onboarding-candidates"
          table-content-width="100%"
          table-layout="fixed"
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
              ><t-tag variant="light" v-for="tag in row.tags || []" :key="tag">{{
                tagLabel(tag)
              }}</t-tag></t-space
            >
            <div class="ma-muted">
              {{ t('ma.input') }}：{{ row.input_modalities?.join('、') || t('ma.noMetadata') }} ·
              {{ t('ma.output') }}：{{ row.output_modalities?.join('、') || t('ma.noMetadata') }}
            </div> </template
          ><template #limits="{ row }">
            <div>
              {{ t('ma.contextSummary') }}
              {{
                row.context_window == null
                  ? t('ma.noMetadata')
                  : `${row.context_window / 1000} K Token`
              }}
            </div>
            <div>
              {{ t('ma.maxOutputSummary') }}
              {{
                row.max_output_tokens == null
                  ? t('ma.noMetadata')
                  : `${row.max_output_tokens / 1000} K Token`
              }}
            </div> </template
          ><template #model_id_at_gateway="{ row }"
            ><t-input v-model="row.model_id_at_gateway" :disabled="row.already_added" /></template
          ><template #status="{ row }"
            ><span :class="{ 'ma-error': conflict(row) }">{{
              conflict(row)
                ? t(row.model_id_at_gateway.trim() ? 'ma.duplicateName' : 'ma.manualNameRequired')
                : t(row.already_added ? 'ma.added' : 'ma.available')
            }}</span></template
          ></t-table
        >
        <t-link
          theme="primary"
          :aria-expanded="manualVisible"
          aria-controls="onboarding-manual-form"
          @click="manualVisible = true"
          >{{ t('ma.manual') }}</t-link
        >
        <div
          v-if="manualVisible"
          id="onboarding-manual-form"
          class="ma-box ma-stack onboarding-manual"
        >
          <span>{{ t('ma.manualModel') }}</span>
          <div class="ma-row">
            <t-input
              v-model="manual.model_id_at_provider"
              :placeholder="t('ma.upstream')"
              :status="manualAttempted && manualErrors.upstream ? 'error' : undefined"
              :tips="manualAttempted ? manualErrors.upstream : ''"
              @change="manualPrefill"
            />
            <t-button theme="default" @click="addManual">{{ t('ma.joinList') }}</t-button>
          </div>
        </div>
        <p class="ma-muted onboarding-metadata-help">{{ t('ma.discoveryMetadataHelp') }}</p>
      </template>
      <template v-else-if="step === 2">
        <p class="ma-muted">{{ t('ma.onboardingTestHelp') }}</p>
        <div class="ma-stack">
          <div v-for="model in imported" :key="model.id" class="ma-box ma-stack">
            <strong>{{ model.model_id_at_gateway }}</strong
            ><span class="ma-muted"
              >{{ t('ma.upstream') }} {{ model.model_id_at_provider }} ·
              {{ t('ma.contextSummary') }}
              {{
                model.context_window == null
                  ? t('ma.noMetadata')
                  : `${model.context_window / 1000} K Token`
              }}
              · {{ t('ma.maxOutputSummary') }}
              {{
                model.max_output_tokens == null
                  ? t('ma.noMetadata')
                  : `${model.max_output_tokens / 1000} K Token`
              }}</span
            >
            <span class="ma-muted"
              >{{ t('ma.input') }} {{ model.input_modalities?.join('、') || t('ma.noMetadata') }} ·
              {{ t('ma.output') }} {{ model.output_modalities?.join('、') || t('ma.noMetadata') }} ·
              {{ t('ma.tags') }}
              {{ model.tags?.map(tagLabel).join('、') || t('ma.noMetadata') }}</span
            >
            <span class="ma-muted">{{
              t(results[model.id] ? 'ma.' + results[model.id]!.status : 'ma.awaitingTest')
            }}</span>
            <t-form class="ma-form" label-align="top" required-mark-position="right">
              <InvocationEditor
                v-model:standard="model.supported_invocation_apis"
                v-model:custom="model.custom_invocation_apis"
                :disabled="busy || model.status !== 'DRAFT'"
              />
            </t-form>
          </div>
        </div>
      </template>
      <template v-else-if="step === 3">
        <t-alert
          :theme="publishable.length ? 'success' : 'warning'"
          :message="t('ma.readyToPublish', { n: publishable.length })"
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
    <div
      v-if="busy && step === 2"
      class="onboarding-submit-overlay"
      role="status"
      :aria-label="t('common.loading')"
      @wheel.prevent.stop
      @touchmove.prevent.stop
    >
      <t-loading :text="t('common.loading')" />
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
          :disabled="busy || !publishable.length"
          :loading="busy"
          @click="publish"
          >{{ t('ma.publishPassed', { n: publishable.length }) }}</t-button
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
  discoveryId = ref('')
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
const manualVisible = ref(false)
const manualAttempted = ref(false)
const manualErrors = computed(() => ({
  upstream: !manual.value.model_id_at_provider.trim()
    ? t('ma.manualUpstreamRequired')
    : candidates.value.some((c) => c.model_id_at_provider === manual.value.model_id_at_provider)
      ? t('ma.manualUpstreamDuplicate')
      : '',
  name: !manual.value.model_id_at_gateway.trim() ? t('ma.manualNameRequired') : '',
}))
const eligible = computed(() => candidates.value.filter((c) => !c.already_added))
const selectedCandidates = computed(() =>
  candidates.value.filter((c) => selected.value.includes(c.model_id_at_provider)),
)
const candidateColumns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'selection', title: '', width: '5%' },
  { colKey: 'display_name', title: t('ma.candidate'), width: '22%' },
  { colKey: 'tags', title: t('ma.capabilityModalities'), width: '24%' },
  { colKey: 'limits', title: t('ma.contextOutput'), width: '21%' },
  { colKey: 'model_id_at_gateway', title: t('ma.name'), width: '18%' },
  { colKey: 'status', title: t('ma.status'), width: '10%' },
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
  m.model_id_at_provider = m.model_id_at_provider.trim()
  m.model_id_at_gateway = m.model_id_at_provider
  manualAttempted.value = true
  if (manualErrors.value.upstream || manualErrors.value.name) return
  m.display_name = m.model_id_at_provider
  candidates.value.push(JSON.parse(JSON.stringify(m)) as Candidate)
  selected.value.push(m.model_id_at_provider)
  manual.value = empty()
  manualAttempted.value = false
  lastManualName = ''
}
async function add() {
  if (busy.value) return
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
  } catch {
    if (!closed) notice.value = t('common.loadFailed')
  } finally {
    busy.value = false
  }
}
async function testAll() {
  if (busy.value) return
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
      let run = results.value[m.id]
      if (!run || run.status !== 'RUNNING') {
        await accessApi.saveModel(m)
        run = await accessApi.startTest(m.id, 'ADMISSION', [
          'CONNECTIVITY',
          'PROTOCOL',
          ...(m.tags.includes('STREAMING') ? ['STREAMING'] : []),
        ])
      }
      results.value[m.id] = run
      const deadline = Date.now() + 5 * 60 * 1000
      m.status = 'TESTING'
      while (run.status === 'RUNNING' && !closed) {
        if (Date.now() >= deadline) throw new Error(t('common.loadFailed'))
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
  } catch {
    if (!closed) notice.value = t('common.loadFailed')
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
const publishable = computed(() =>
  imported.value.filter(
    (model) =>
      model.status === 'PENDING_REVIEW' &&
      model.admission_valid &&
      results.value[model.id]?.status === 'PASSED',
  ),
)
async function publish() {
  if (busy.value || !publishable.value.length) return
  busy.value = true
  try {
    for (const m of publishable.value)
      Object.assign(m, await accessApi.status(m.id, 'ACTIVE', t('ma.publishSelected')))
    step.value = 4
    emit('changed')
  } catch {
    if (!closed) notice.value = t('common.loadFailed')
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
