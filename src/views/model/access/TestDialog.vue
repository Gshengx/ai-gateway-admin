<template>
  <t-dialog
    dialog-class-name="model-access-dialog"
    :close-btn="true"
    :visible="!rejecting"
    :header="
      t(
        run
          ? purpose === 'HEALTH'
            ? 'ma.healthResult'
            : 'ma.admissionResult'
          : purpose === 'HEALTH'
            ? 'ma.healthTitle'
            : 'ma.startAdmission',
      )
    "
    :width="
      !run && purpose === 'ADMISSION'
        ? 'var(--admission-start-dialog-width)'
        : 'var(--physical-model-dialog-width)'
    "
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <div class="ma-stack">
      <p v-if="!run" class="ma-muted">
        {{
          t(purpose === 'HEALTH' ? 'ma.healthHint' : 'ma.detectionHint', {
            api: invocationTargets(model)
              .map((api) => api.path || invocationLabel(api.invocation_api))
              .join('、'),
          })
        }}
      </p>
      <t-checkbox-group
        v-if="!run"
        v-model="selected"
        class="ma-checks"
        :options="
          available.map((key) => ({
            value: key,
            label: t('ma.' + key),
            disabled: ['CONNECTIVITY', 'PROTOCOL'].includes(key),
          }))
        "
      />
      <template v-else>
        <t-progress
          v-if="run.status === 'RUNNING'"
          :percentage="
            Math.round(
              (run.checks.filter((c) => ['PASSED', 'FAILED', 'ERROR'].includes(c.status)).length /
                run.checks.length) *
                100,
            )
          "
        />
        <t-alert
          :theme="run.status === 'FAILED' ? 'error' : run.status === 'PASSED' ? 'success' : 'info'"
          :message="
            t(
              purpose === 'ADMISSION' && run.status === 'PASSED'
                ? 'ma.admissionFinished'
                : 'ma.detectionFinished',
              {
                n: run.checks.filter((c) => c.status === 'PASSED').length,
                total: run.checks.length,
              },
            )
          "
        />
        <t-table row-key="row_key" :data="checkRows" :columns="columns"
          ><template #key="{ row }">{{
            row.key === 'PROTOCOL' ? t('ma.apiCheck') : t('ma.' + row.key)
          }}</template
          ><template #invocation_api="{ row }">{{
            row.upstream_path || invocationLabel(row.invocation_api)
          }}</template
          ><template #status="{ row }"
            ><t-tag variant="light" :theme="statusTheme(row.status)">{{
              t('ma.' + row.status)
            }}</t-tag></template
          ><template #duration_ms="{ row }">{{ row.duration_ms }} ms</template
          ><template #detail="{ row }"
            ><div>{{ row.detail ? t('ma.' + row.detail) : '—' }}</div>
          </template></t-table
        >
        <p class="ma-muted">{{ t('ma.billingOwner') }}：{{ t('ma.systemCost') }}</p>
        <t-alert v-if="run.status === 'FAILED'" theme="error" :message="t('ma.testFailed')" />
      </template>
    </div>
    <template #footer
      ><div class="ma-footer">
        <t-button theme="default" @click="emit('close')">{{
          t(run ? 'ma.close' : 'ma.cancel')
        }}</t-button>
        <t-button
          v-if="!run"
          theme="primary"
          :disabled="!selected.length"
          :loading="busy"
          v-permission.write="purpose === 'HEALTH' ? 'model.models' : 'model.admission'"
          @click="start"
          >{{ t('ma.startTest') }}</t-button
        >
        <t-button
          v-if="purpose === 'ADMISSION' && run?.status === 'PASSED' && !historyRun"
          theme="danger"
          variant="outline"
          v-permission.write="'model.review'"
          @click="rejecting = true"
          >{{ t('ma.reject') }}</t-button
        >
        <t-button
          v-if="purpose === 'ADMISSION' && run?.status === 'PASSED' && !historyRun"
          theme="primary"
          v-permission.write="'model.review'"
          @click="publish"
          >{{ t('ma.publish') }}</t-button
        >
      </div></template
    >
  </t-dialog>
  <t-dialog
    v-if="rejecting"
    :visible="true"
    :header="t('ma.reject')"
    :close-on-overlay-click="false"
    :confirm-btn="{ theme: 'primary', content: t('ma.confirm'), loading: busy }"
    :cancel-btn="t('ma.cancel')"
    @close="rejecting = false"
    @confirm="reject"
  >
    <p class="ma-muted">{{ t('ma.confirmReject', { name: model.model_id_at_gateway }) }}</p>
    <t-form label-align="top"
      ><t-form-item :label="t('ma.rejectReason')" required-mark>
        <t-textarea
          v-model="rejectionReason"
          :maxlength="300"
          indicator
          :status="rejectionError ? 'error' : undefined"
          :tips="rejectionError ? t('ma.reasonRequired') : ''"
        /> </t-form-item
    ></t-form>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PrimaryTableCol } from 'tdesign-vue-next'
import { accessApi, type Model, type TestRun } from '@/api/modules/modelAccess'
import { invocationTargets } from '@/utils/modelInvocation'
import { invocationLabel, statusTheme } from './helpers'
const props = defineProps<{ model: Model; purpose: 'ADMISSION' | 'HEALTH'; historyRun?: TestRun }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { t } = useI18n()
const available = computed(() => [
  'CONNECTIVITY',
  'PROTOCOL',
  ...(props.model.tags.includes('STREAMING') ? ['STREAMING'] : []),
])
const selected = ref([...available.value]),
  run = ref<TestRun>(),
  busy = ref(false),
  rejecting = ref(false),
  rejectionReason = ref(''),
  rejectionError = ref(false)
const checkRows = computed(
  () => run.value?.checks.map((check, index) => ({ ...check, row_key: String(index) })) ?? [],
)
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'invocation_api', title: t('ma.invocation') },
  { colKey: 'key', title: t('ma.checks') },
  { colKey: 'status', title: t('ma.status'), width: 90 },
  { colKey: 'duration_ms', title: t('ma.duration'), width: 100 },
  { colKey: 'detail', title: t('ma.result') },
])
let timer: ReturnType<typeof setTimeout> | undefined,
  closed = false
async function poll() {
  if (!run.value || closed) return
  try {
    run.value = await accessApi.test(props.model.id, props.purpose, run.value.id)
    if (run.value.status === 'RUNNING') timer = setTimeout(poll, 500)
    else emit('changed')
  } catch {
    busy.value = false
  }
}
async function start() {
  busy.value = true
  try {
    run.value = await accessApi.startTest(props.model.id, props.purpose, selected.value)
    emit('changed')
    await poll()
  } finally {
    busy.value = false
  }
}
async function reject() {
  rejectionError.value = !rejectionReason.value.trim()
  if (rejectionError.value) return
  busy.value = true
  try {
    await accessApi.status(props.model.id, 'DRAFT', rejectionReason.value.trim())
    emit('changed')
    emit('close')
  } finally {
    busy.value = false
  }
}
async function publish() {
  await accessApi.status(props.model.id, 'ACTIVE', t('ma.publish'))
  emit('changed')
  emit('close')
}
onMounted(() => {
  if (props.historyRun) {
    run.value = props.historyRun
    if (run.value.status === 'RUNNING') void poll()
  }
})
onBeforeUnmount(() => {
  closed = true
  clearTimeout(timer)
})
</script>
<style scoped src="./access.css"></style>
