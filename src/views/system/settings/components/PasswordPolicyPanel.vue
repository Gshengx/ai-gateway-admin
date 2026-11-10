<template>
  <t-card :bordered="false" class="settings-panel">
    <LoadingState :loading="loading" preserve-content :failed="loadFailed" retryable @retry="load">
      <div class="policy-header">
        <h2>{{ t('passwordPolicy.title') }}</h2>
        <t-tag theme="primary" variant="light">{{ t('passwordPolicy.global') }}</t-tag>
      </div>
      <p class="description">{{ t('passwordPolicy.desc') }}</p>
      <t-form ref="formRef" :data="form" :rules="rules" class="policy-form">
        <div class="policy-grid">
          <section class="policy-group">
            <h3>{{ t('passwordPolicy.lengthRange') }}</h3>
            <div class="policy-row">
              <t-form-item name="min_length" :label-width="0" class="policy-item">
                <span class="policy-text policy-text--muted">{{
                  t('passwordPolicy.prefix.min_length')
                }}</span>
                <t-input-number
                  v-model="form.min_length"
                  theme="row"
                  :min="limits.min_length.min"
                  :max="limits.min_length.max"
                  :disabled="locked"
                />
                <span class="policy-text">{{ t('passwordPolicy.units.chars') }}</span>
              </t-form-item>
              <span class="policy-text policy-text--muted">{{ t('passwordPolicy.to') }}</span>
              <t-form-item name="max_length" :label-width="0" class="policy-item">
                <span class="policy-text policy-text--muted">{{
                  t('passwordPolicy.prefix.max_length')
                }}</span>
                <t-input-number
                  v-model="form.max_length"
                  theme="row"
                  :min="limits.max_length.min"
                  :max="limits.max_length.max"
                  :disabled="locked"
                />
                <span class="policy-text">{{ t('passwordPolicy.units.chars') }}</span>
              </t-form-item>
            </div>
            <p class="hint">{{ t('passwordPolicy.hints.lengthRange') }}</p>
          </section>
          <section class="policy-group">
            <h3>{{ t('passwordPolicy.fields.complexity_categories') }}</h3>
            <div class="policy-row">
              <t-form-item name="complexity_categories" :label-width="0" class="policy-item">
                <t-input-number
                  v-model="form.complexity_categories"
                  theme="row"
                  :min="limits.complexity_categories.min"
                  :max="limits.complexity_categories.max"
                  :disabled="locked"
                />
                <span class="policy-text">{{
                  t('passwordPolicy.units.complexity_categories')
                }}</span>
              </t-form-item>
            </div>
            <p class="hint">{{ t('passwordPolicy.hints.complexity_categories') }}</p>
          </section>
          <section class="policy-group">
            <h3>{{ t('passwordPolicy.fields.history_count') }}</h3>
            <div class="policy-row">
              <t-form-item name="history_count" :label-width="0" class="policy-item">
                <t-input-number
                  v-model="form.history_count"
                  theme="row"
                  :min="limits.history_count.min"
                  :max="limits.history_count.max"
                  :disabled="locked"
                />
                <span class="policy-text">{{ t('passwordPolicy.units.history_count') }}</span>
              </t-form-item>
            </div>
            <p class="hint">{{ t('passwordPolicy.hints.history_count') }}</p>
          </section>
          <section class="policy-group">
            <h3>{{ t('passwordPolicy.fields.failure_threshold') }}</h3>
            <div class="policy-row">
              <t-form-item name="failure_threshold" :label-width="0" class="policy-item">
                <t-input-number
                  v-model="form.failure_threshold"
                  theme="row"
                  :min="limits.failure_threshold.min"
                  :max="limits.failure_threshold.max"
                  :disabled="locked"
                />
                <span class="policy-text">{{ t('passwordPolicy.units.failure_threshold') }}</span>
              </t-form-item>
            </div>
            <p class="hint">{{ t('passwordPolicy.hints.failure_threshold') }}</p>
          </section>
          <section class="policy-group">
            <h3>{{ t('passwordPolicy.fields.lock_duration_minutes') }}</h3>
            <div class="policy-row">
              <t-form-item name="lock_duration_minutes" :label-width="0" class="policy-item">
                <t-input-number
                  v-model="form.lock_duration_minutes"
                  theme="row"
                  :min="limits.lock_duration_minutes.min"
                  :max="limits.lock_duration_minutes.max"
                  :disabled="locked"
                />
                <span class="policy-text">{{
                  t('passwordPolicy.units.lock_duration_minutes')
                }}</span>
              </t-form-item>
            </div>
            <p class="hint">{{ t('passwordPolicy.hints.lock_duration_minutes') }}</p>
          </section>
        </div>
      </t-form>
      <div class="policy-actions">
        <span class="policy-updated-at">{{
          t('passwordPolicy.updatedAt', { time: formatDateTime(saved?.version_updated_at) || '—' })
        }}</span>
        <t-space>
          <t-button :disabled="locked || !dirty" @click="reset">{{
            t('passwordPolicy.reset')
          }}</t-button>
          <t-button
            theme="primary"
            :disabled="!canWrite || !saved || !dirty"
            :loading="submitting"
            @click="save"
            >{{ t('passwordPolicy.save') }}</t-button
          >
        </t-space>
      </div>
    </LoadingState>
  </t-card>
</template>
<script setup lang="ts">
import { useLatestRequest } from '@/utils/useLatestRequest'
import { createIdempotencyKey } from '@/api/request'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import { MessagePlugin, type FormInstanceFunctions, type FormRule } from 'tdesign-vue-next'
import {
  getPasswordPolicyApi,
  updatePasswordPolicyApi,
  type PasswordPolicy,
  type PasswordPolicyPayload,
} from '@/api/modules/settings'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
const { t } = useI18n()
const userStore = useUserStore()
const canWrite = computed(() => canWriteResource(userStore.permissions, 'system.settings'))
const limits = {
  min_length: { min: 8, max: 64 },
  max_length: { min: 8, max: 64 },
  complexity_categories: { min: 1, max: 4 },
  history_count: { min: 0, max: 10 },
  failure_threshold: { min: 3, max: 10 },
  lock_duration_minutes: { min: 5, max: 1440 },
} as const
type Field = keyof typeof limits
const fields = (Object.keys(limits) as Field[]).map((key) => ({ key, ...limits[key] }))
const form = reactive<Record<Field, number | undefined>>({
  min_length: undefined,
  max_length: undefined,
  complexity_categories: undefined,
  history_count: undefined,
  failure_threshold: undefined,
  lock_duration_minutes: undefined,
})
const saved = ref<PasswordPolicy | null>(null)
const dirty = computed(() => fields.some(({ key }) => form[key] !== saved.value?.[key]))
const formRef = ref<FormInstanceFunctions>()
const submitting = ref(false)
const locked = computed(() => !canWrite.value || !saved.value || submitting.value)
const rules = computed<Record<string, FormRule[]>>(() =>
  Object.fromEntries(
    fields.map((field) => [
      field.key,
      [
        { required: true, message: t('passwordPolicy.required'), type: 'error' },
        {
          validator: (value: number) =>
            Number.isInteger(value) && value >= field.min && value <= field.max,
          message: t('passwordPolicy.range', { min: field.min, max: field.max }),
          type: 'error',
        },
        ...(field.key === 'min_length'
          ? [
              {
                validator: () =>
                  form.min_length !== undefined &&
                  form.max_length !== undefined &&
                  form.min_length <= form.max_length,
                message: t('passwordPolicy.lengthOrder'),
                type: 'error' as const,
              },
            ]
          : []),
      ],
    ]),
  ),
)
function apply(policy: PasswordPolicy) {
  saved.value = { ...policy }
  for (const { key } of fields) form[key] = policy[key]
}
function reset() {
  if (locked.value || !saved.value) return
  apply(saved.value)
  formRef.value?.clearValidate()
  MessagePlugin.success(t('passwordPolicy.resetDone'))
}
async function save() {
  if (locked.value) return
  submitting.value = true
  try {
    if ((await formRef.value?.validate()) !== true) return
    if (!fields.some(({ key }) => form[key] !== saved.value?.[key])) {
      MessagePlugin.info(t('passwordPolicy.unchanged'))
      return
    }
    if (!saved.value) return
    const payload = {} as PasswordPolicyPayload
    for (const { key } of fields) payload[key] = form[key]!
    if (!fields.some(({ key }) => payload[key] !== saved.value?.[key])) {
      return
    }
    const idempotencyKey = createIdempotencyKey()
    try {
      const result = await updatePasswordPolicyApi(payload, idempotencyKey)
      apply(result.policy)
      MessagePlugin.success(t('passwordPolicy.saveSuccess'))
    } catch {
      // The request layer reports failures.
    }
  } finally {
    submitting.value = false
  }
}
const loading = ref(true)
const loadFailed = ref(false)
const loadRequest = useLatestRequest()
async function load() {
  const current = loadRequest.begin()
  loading.value = true
  loadFailed.value = false
  try {
    const result = await getPasswordPolicyApi()
    if (current.isCurrent()) apply(result)
  } catch {
    if (current.isCurrent()) loadFailed.value = true
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
onMounted(load)
</script>
<style scoped src="@/styles/settings-panels.css"></style>
