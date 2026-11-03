<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PrimaryTableCol } from 'tdesign-vue-next'
import {
  getLatestAdmissionApi,
  getModelAdmissionJobApi,
  startModelAdmissionApi,
  type AdmissionCheck,
  type AdmissionRun,
  type PhysicalModelItem,
} from '@/api/modules/models'

const props = defineProps<{
  model: PhysicalModelItem
  resultOnly?: boolean
  historyRun?: AdmissionRun
}>()
const emit = defineEmits<{ close: []; changed: []; review: [decision: 'PUBLISH' | 'REJECT'] }>()
const { t, te } = useI18n()
const tr = (key: string, args = {}) => t(`models.admission.${key}`, args)
const resultVisible = ref(false)
const busy = ref(false)
const streaming = ref(true)
const reliability = ref(true)
const budget = ref('')
const run = ref<AdmissionRun | null>(null)
const jobError = ref('')
let jobId = ''
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
const running = ref(false)
const metrics = computed(
  () => run.value?.checks.find((x) => x.reliability_metrics)?.reliability_metrics,
)
const passed = computed(() => run.value?.checks.filter((x) => x.status === 'PASSED').length ?? 0)
const invocation = computed(() => t(`model.modelsForm.INVOCATION_${props.model.invocation_api}`))
const columns = computed<PrimaryTableCol<AdmissionCheck>[]>(() => [
  { colKey: 'check_key', title: tr('check'), width: 150 },
  { colKey: 'status', title: tr('status'), width: 100 },
  { colKey: 'duration_ms', title: tr('duration'), width: 100 },
  { colKey: 'details', title: tr('details') },
])
function checkName(key: string) {
  return te(`models.admission.checks.${key}`) ? tr(`checks.${key}`) : key
}
function checkDetails(check: AdmissionCheck) {
  if (check.safe_error_code) return check.safe_error_code
  if (check.status === 'PASSED' && te(`models.admission.passedDetails.${check.check_key}`))
    return tr(`passedDetails.${check.check_key}`, {
      name: props.model.model_id_at_provider,
      api: invocation.value,
    })
  return tr(`statuses.${check.status}`)
}
function notify(error: unknown) {
  if (!(error as { notified?: boolean }).notified)
    MessagePlugin.error((error as Error).message || tr('loadFailed'))
}
async function poll(token: number) {
  try {
    const [latest, job] = await Promise.all([
      getLatestAdmissionApi(props.model.id),
      jobId ? getModelAdmissionJobApi(jobId) : Promise.resolve(null),
    ])
    if (token !== generation) return
    // 新任务尚未生成结果时，不能将上一轮检测当作本轮结果。
    run.value =
      !job || (job.run_id && latest.latest_run?.run_id === job.run_id) ? latest.latest_run : null
    jobError.value = job?.safe_error_code || ''
    running.value = job
      ? ['PENDING', 'RUNNING'].includes(job.status)
      : !!run.value && ['PENDING', 'RUNNING'].includes(run.value.status)
    if (running.value) timer = setTimeout(() => void poll(token), 1500)
    else emit('changed')
  } catch (error) {
    if (token !== generation) return
    running.value = false
    jobError.value = tr('loadFailed')
    notify(error)
  }
}
async function start() {
  if (!budget.value.trim()) {
    MessagePlugin.warning(tr('budgetRequired'))
    return
  }
  busy.value = true
  try {
    const result = await startModelAdmissionApi(props.model.id, {
      budget_authorization_ref: budget.value.trim(),
      test_profile_version: 'm2-admission-v2',
      selected_checks: [
        'BASE_REQUEST',
        ...(streaming.value ? ['STREAMING'] : []),
        ...(reliability.value ? ['RELIABILITY'] : []),
      ],
      reason: tr('startReason'),
    })
    jobId = result.job_id
    resultVisible.value = true
    running.value = true
    emit('changed')
    await poll(++generation)
  } catch (error) {
    notify(error)
  } finally {
    busy.value = false
  }
}
watch(
  () => props.model.id,
  () => {
    generation++
    clearTimeout(timer)
    jobId = ''
    run.value = null
    jobError.value = ''
    resultVisible.value = !!props.resultOnly
    if (props.historyRun) run.value = props.historyRun
    else if (props.resultOnly) void poll(generation)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
</script>

<template>
  <t-dialog
    :visible="true"
    :header="tr(resultVisible ? 'resultTitle' : 'startTitle')"
    :width="
      resultVisible ? 'var(--physical-model-dialog-width)' : 'var(--admission-start-dialog-width)'
    "
    :footer="false"
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <template v-if="!resultVisible">
      <p class="intro">{{ tr('intro', { api: invocation }) }}</p>
      <div class="checks">
        <t-checkbox :checked="true" disabled>{{ tr('checks.BASE_REQUEST') }}</t-checkbox>
        <t-checkbox :checked="true" disabled>{{ tr('compatibility') }}</t-checkbox>
        <t-checkbox v-model="streaming">{{ tr('checks.STREAMING') }}</t-checkbox>
        <t-checkbox v-model="reliability">{{ tr('checks.RELIABILITY') }}</t-checkbox>
      </div>
      <t-form label-align="top" class="budget-form" :colon="false" required-mark-position="right">
        <t-form-item :label="tr('budget')" :required-mark="true"
          ><t-input v-model="budget" :maxlength="128" :placeholder="tr('budgetRequired')"
        /></t-form-item>
      </t-form>
      <div class="footer">
        <t-button theme="default" @click="emit('close')">{{ t('common.cancel') }}</t-button
        ><t-button :loading="busy" @click="start">{{ tr('start') }}</t-button>
      </div>
    </template>
    <template v-else>
      <t-alert
        :theme="running ? 'info' : run?.status === 'PASSED' ? 'success' : 'warning'"
        :message="
          running
            ? tr('running', { name: model.model_id_at_provider })
            : jobError ||
              (run
                ? tr(run.status === 'PASSED' ? 'completed' : 'failed', {
                    passed,
                    total: run.checks.length,
                  })
                : tr('noResult'))
        "
      />
      <t-table
        class="results"
        row-key="check_key"
        :data="run?.checks || []"
        :columns="columns"
        :loading="running && !run"
        table-layout="fixed"
      >
        <template #check_key="{ row }">{{ checkName(row.check_key) }}</template>
        <template #status="{ row }"
          ><t-tag
            :theme="
              row.status === 'PASSED'
                ? 'success'
                : ['FAILED', 'ERROR'].includes(row.status)
                  ? 'danger'
                  : 'warning'
            "
            >{{ tr(`statuses.${row.status}`) }}</t-tag
          ></template
        >
        <template #duration_ms="{ row }">{{
          row.duration_ms == null ? '—' : `${row.duration_ms} ms`
        }}</template>
        <template #details="{ row }">{{ checkDetails(row) }}</template>
      </t-table>
      <div v-if="metrics" class="metrics">
        <strong>{{ tr('checks.RELIABILITY') }}</strong
        ><span>{{ tr('successRate') }} {{ metrics.success_rate_percent }}%</span
        ><span
          >TTFT P50/P95 {{ metrics.ttft.observed.p50_ms ?? '—' }}/{{
            metrics.ttft.observed.p95_ms ?? '—'
          }}
          ms</span
        ><span
          >{{ tr('latency') }} P50/P95 {{ metrics.successful_latency.p50_ms ?? '—' }}/{{
            metrics.successful_latency.p95_ms ?? '—'
          }}
          ms</span
        >
      </div>
      <div class="footer">
        <t-button theme="default" @click="emit('close')">{{ tr('close') }}</t-button>
        <template v-if="!historyRun && !running && run?.status === 'PASSED' && run.admission_valid">
          <t-button
            v-permission.write="'model.models'"
            theme="danger"
            variant="outline"
            @click="emit('review', 'REJECT')"
            >{{ tr('reject') }}</t-button
          >
          <t-button v-permission.write="'model.models'" @click="emit('review', 'PUBLISH')">{{
            tr('approve')
          }}</t-button>
        </template>
      </div>
    </template>
  </t-dialog>
</template>

<style scoped>
.intro {
  color: var(--td-text-color-secondary);
  margin: 0 0 var(--td-comp-margin-l);
}
.checks,
.footer,
.metrics {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  flex-wrap: wrap;
}
.budget-form,
.results,
.metrics,
.footer {
  margin-top: var(--td-comp-margin-l);
}
.footer {
  justify-content: flex-end;
}
.metrics {
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-default);
  color: var(--td-text-color-secondary);
}
</style>
