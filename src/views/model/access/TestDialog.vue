<template>
  <t-dialog
    dialog-class-name="model-access-dialog"
    :close-btn="!locked"
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
    :close-on-esc-keydown="!locked"
    @close="close"
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
      <p v-if="!run" class="test-cost-note">{{ t('ma.testCostNotice') }}</p>
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
        <t-alert v-if="pollFailed" theme="error" :message="t('common.loadFailed')" />
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
        <p class="test-cost-note">{{ t('ma.testCostNotice') }}</p>
        <TestResultGroups :checks="run.checks" />
        <t-alert v-if="run.status === 'FAILED'" theme="error" :message="t('ma.testFailed')" />
      </template>
    </div>
    <template #footer
      ><div class="ma-footer">
        <t-button theme="default" :disabled="locked" @click="close">{{
          t(run ? 'ma.close' : 'ma.cancel')
        }}</t-button>
        <t-button
          v-if="!run"
          theme="primary"
          :disabled="locked || !selected.length"
          :loading="busy"
          v-permission.write="purpose === 'HEALTH' ? 'model.models' : 'model.admission'"
          @click="start"
          >{{ t('ma.startTest') }}</t-button
        >
        <t-button v-if="pollFailed" theme="primary" :disabled="locked" @click="retryPoll">{{
          t('common.retry')
        }}</t-button>
        <t-button
          v-if="purpose === 'ADMISSION' && run?.status === 'PASSED' && !historyRun"
          theme="danger"
          variant="outline"
          v-permission.write="'model.review'"
          :disabled="locked"
          @click="rejecting = true"
          >{{ t('ma.reject') }}</t-button
        >
        <t-button
          v-if="purpose === 'ADMISSION' && run?.status === 'PASSED' && !historyRun"
          theme="primary"
          v-permission.write="'model.review'"
          :loading="busy"
          :disabled="locked"
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
    :cancel-btn="{ content: t('ma.cancel'), disabled: busy }"
    :close-btn="!busy"
    :close-on-esc-keydown="!busy"
    @close="!busy && (rejecting = false)"
    @confirm="reject"
  >
    <p class="ma-muted">{{ t('ma.confirmReject', { name: model.model_id_at_gateway }) }}</p>
    <t-form label-align="top"
      ><t-form-item :label="t('ma.rejectReason')" required-mark>
        <t-textarea
          v-model="rejectionReason"
          :disabled="busy"
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
import TestResultGroups from './TestResultGroups.vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { createIdempotencyKey } from '@/api/request'
import { accessApi, type Model, type TestRun } from '@/api/modules/modelAccess'
import { invocationTargets } from '@/utils/modelInvocation'
import { invocationLabel } from './helpers'
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
const polling = ref(false)
const pollFailed = ref(false)
const locked = computed(() => busy.value || polling.value)
function close() {
  if (!locked.value) emit('close')
}
let timer: ReturnType<typeof setTimeout> | undefined,
  closed = false
let startAttempt: { signature: string; key: string } | undefined
let pollVersion = 0
let pollStarted = 0
let pollController: AbortController | undefined
async function poll() {
  if (!run.value || closed) return
  const version = pollVersion
  polling.value = true
  pollFailed.value = false
  pollController = new AbortController()
  try {
    const result = await accessApi.test(
      props.model.id,
      props.purpose,
      run.value.id,
      pollController.signal,
    )
    if (closed || version !== pollVersion) return
    run.value = result
    if (result.status === 'RUNNING') {
      const elapsed = Date.now() - pollStarted
      if (elapsed >= 5 * 60 * 1000) {
        polling.value = false
        pollFailed.value = true
      } else timer = setTimeout(poll, document.hidden ? 3000 : elapsed > 10000 ? 1000 : 500)
    } else {
      polling.value = false
      emit('changed')
    }
  } catch {
    if (!closed && version === pollVersion) {
      polling.value = false
      pollFailed.value = true
    }
  }
}
async function retryPoll() {
  if (locked.value || !run.value || run.value.status !== 'RUNNING') return
  pollStarted = Date.now()
  await poll()
}
async function start() {
  if (locked.value || !selected.value.length) return
  const version = ++pollVersion
  pollController?.abort()
  clearTimeout(timer)
  busy.value = true
  pollFailed.value = false
  const signature = JSON.stringify(selected.value)
  if (startAttempt?.signature !== signature)
    startAttempt = { signature, key: createIdempotencyKey() }
  try {
    const result = await accessApi.startTest(
      props.model.id,
      props.purpose,
      selected.value,
      startAttempt.key,
    )
    startAttempt = undefined
    if (closed || version !== pollVersion) return
    run.value = result
    pollStarted = Date.now()
    emit('changed')
    if (result.status === 'RUNNING') await poll()
  } catch {
    // Preserve the current selection; the request layer reports the error.
  } finally {
    if (!closed && version === pollVersion) busy.value = false
  }
}
async function reject() {
  if (locked.value) return
  rejectionError.value = !rejectionReason.value.trim()
  if (rejectionError.value) return
  busy.value = true
  try {
    await accessApi.status(props.model.id, 'DRAFT', rejectionReason.value.trim())
    MessagePlugin.success(t('ma.success'))
    emit('changed')
    emit('close')
  } catch {
    // Keep the reason and confirmation available for retry.
  } finally {
    busy.value = false
  }
}
async function publish() {
  if (locked.value) return
  busy.value = true
  try {
    await accessApi.status(props.model.id, 'ACTIVE', t('ma.publish'))
    MessagePlugin.success(t('ma.success'))
    emit('changed')
    emit('close')
  } catch {
    // Keep the successful test visible for retrying publication.
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  if (props.historyRun) {
    run.value = props.historyRun
    pollStarted = Date.now()
    if (run.value.status === 'RUNNING') void poll()
  }
})
onBeforeUnmount(() => {
  closed = true
  ++pollVersion
  pollController?.abort()
  clearTimeout(timer)
})
</script>
<style scoped src="./access.css"></style>
