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
      <t-alert v-if="notice" theme="warning" :message="notice" />
      <template v-if="step === 1">
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
          <div v-for="model in imported" :key="model.id" class="ma-box onboarding-model-card">
            <strong class="onboarding-model-card__name">{{ model.model_id_at_gateway }}</strong
            ><span class="ma-muted onboarding-model-card__metadata"
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
            <span class="ma-muted onboarding-model-card__metadata"
              >{{ t('ma.input') }} {{ model.input_modalities?.join('、') || t('ma.noMetadata') }} ·
              {{ t('ma.output') }} {{ model.output_modalities?.join('、') || t('ma.noMetadata') }} ·
              {{ t('ma.tags') }}
              {{ model.tags?.map(tagLabel).join('、') || t('ma.noMetadata') }}</span
            >
            <span class="ma-muted onboarding-model-card__status">{{
              t(results[model.id] ? 'ma.' + results[model.id]!.status : 'ma.awaitingTest')
            }}</span>
            <t-form
              class="ma-form onboarding-model-card__form"
              label-align="top"
              required-mark-position="right"
            >
              <InvocationEditor
                :validate-required="testAttempted"
                hide-help
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
import { type PrimaryTableCol } from 'tdesign-vue-next'
import {
  accessApi,
  type Provider,
  type Model,
  type Candidate,
  type TestRun,
} from '@/api/modules/modelAccess'
import { normalizeModelId } from '@/utils/modelContract'
import { createIdempotencyKey } from '@/api/request'
import InvocationEditor from './InvocationEditor.vue'
import { invocationTargets, invocationConfigurationError } from '@/utils/modelInvocation'
import { invocationLabel, statusTheme, tagLabel } from './helpers'
const props = defineProps<{ provider: Provider }>()
const emit = defineEmits<{ close: [] }>()
const { t, te } = useI18n(),
  router = useRouter()
const step = ref(1),
  loading = ref(true),
  busy = ref(false),
  notice = ref(''),
  discoveryId = ref('')
const candidates = ref<Candidate[]>([]),
  selected = ref<string[]>([]),
  imported = ref<Model[]>([]),
  results = ref<Record<string, TestRun>>({})
const empty = (): Candidate => ({
  model_id_at_provider: '',
  model_id_at_gateway: '',
  display_name: '',
  input_modalities: [],
  output_modalities: [],
  tags: [],
  supported_invocation_apis: [],
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
      selectedCandidates.value.some(
        (x) =>
          x !== c &&
          normalizeModelId(x.model_id_at_gateway) === normalizeModelId(c.model_id_at_gateway),
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
      props.provider.version,
    )
    imported.value = result.items
    notice.value = failureNotice(
      'import',
      result.result.items
        .filter((item) => item.status === 'REJECTED')
        .map((item) => ({
          name: selectedCandidates.value[item.input_index]?.model_id_at_gateway ?? '',
          code: item.code,
        })),
    )
    if (notice.value && imported.value.length) notice.value += t('ma.importContinueNotice')
    if (imported.value.length) {
      step.value = 2
    }
  } catch {
    if (!closed) notice.value = t('common.loadFailed')
  } finally {
    busy.value = false
  }
}
function failureNotice(
  stage: 'import' | 'test' | 'publish',
  failures: { name: string; code: string }[],
) {
  if (!failures.length) return ''
  const groups = new Map<string, Set<string>>()
  for (const failure of failures) {
    const names = groups.get(failure.code) ?? new Set<string>()
    names.add(failure.name)
    groups.set(failure.code, names)
  }
  const details = [...groups].map(([code, names]) => {
    const key =
      stage === 'import' && code === 'NAME_CONFLICT'
        ? 'ma.importNameConflict'
        : te(`ma.error_${code}`)
          ? `ma.error_${code}`
          : 'ma.error_fallback'
    return t('ma.onboardingFailureGroup', { models: [...names].join(' / '), reason: t(key) })
  })
  return t(`ma.${stage}FailureNotice`, { details: details.join('；') })
}
const testKeys = new Map<string, { key: string; signature: string }>()
function testKey(model: Model) {
  const signature = JSON.stringify([model.supported_invocation_apis, model.custom_invocation_apis])
  const previous = testKeys.get(model.id)
  if (previous?.signature === signature) return previous.key
  const key = createIdempotencyKey()
  testKeys.set(model.id, { key, signature })
  return key
}
const testAttempted = ref(false)
async function testAll() {
  if (busy.value) return
  testAttempted.value = true
  const invalid = imported.value.filter((m) => invocationConfigurationError(m))
  if (invalid.length) {
    notice.value = t('ma.invocationModelsInvalid', {
      models: invalid.map((m) => m.model_id_at_gateway).join('、'),
    })
    return
  }
  busy.value = true
  notice.value = ''
  const failures: { name: string; code: string }[] = []
  try {
    for (const m of imported.value) {
      if (closed) break
      if (['PENDING_REVIEW', 'ACTIVE'].includes(m.status)) continue
      let run = results.value[m.id]
      if (!run || run.status !== 'RUNNING') {
        const batch = await accessApi.onboardingTests(props.provider.id, [m], testKey(m))
        testKeys.delete(m.id)
        const item = batch.items[0]
        if (!item?.job_id) {
          failures.push({ name: m.model_id_at_gateway, code: item?.code ?? '' })
          notice.value = failureNotice('test', failures)
          continue
        }
        // Save the accepted job ID before the first GET. A failed GET resumes
        // this job instead of submitting another paid check.
        results.value[m.id] = {
          id: item.job_id,
          model_id: m.id,
          purpose: 'ADMISSION',
          trigger_type: 'MANUAL',
          status: 'RUNNING',
          invocation_api: '',
          invocation_apis: [],
          checks: [],
          billing_user: '',
          billing_department: '',
          started_at: '',
          completed_at: null,
          triggered_by: '',
        }
        m.status = 'TESTING'
        run = await accessApi.test(m.id, 'ADMISSION', item.job_id)
      }
      results.value[m.id] = run
      const pollStarted = Date.now()
      const deadline = pollStarted + 5 * 60 * 1000
      m.status = 'TESTING'
      while (run.status === 'RUNNING' && !closed) {
        if (Date.now() >= deadline) throw new Error(t('common.loadFailed'))
        const elapsed = Date.now() - pollStarted
        await new Promise((resolve) =>
          setTimeout(resolve, document.hidden ? 3000 : elapsed > 10000 ? 1200 : 800),
        )
        if (closed) break
        run = await accessApi.test(m.id, 'ADMISSION', run.id)
        results.value[m.id] = run
      }
      if (!closed) Object.assign(m, await accessApi.model(m.id, false))
    }
    if (!closed) {
      step.value = 3
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
    const result = await accessApi.publishBatch(props.provider.id, publishable.value)
    notice.value = failureNotice(
      'publish',
      result.items
        .filter((i) => i.status === 'REJECTED')
        .map((i) => ({
          name: publishable.value[i.input_index]?.model_id_at_gateway ?? '',
          code: i.code,
        })),
    )
    for (const item of result.items) {
      const model = imported.value.find((m) => m.id === item.physical_model_id)
      if (model && item.model) Object.assign(model, item.model)
    }
    if (!result.failed_count) step.value = 4
  } catch {
    if (!closed) notice.value = t('common.loadFailed')
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  try {
    const result = await accessApi.discover(props.provider.id)
    discoveryId.value = result.discovery_id
    candidates.value = result.items
    selected.value = eligible.value.map((c) => c.model_id_at_provider)
    if (result.error_code) {
      const key = `ma.error_${result.error_code}`
      notice.value = t(te(key) ? key : 'ma.discoveryFailed')
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
