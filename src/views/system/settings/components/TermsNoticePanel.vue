<template>
  <t-card :bordered="false" class="settings-panel">
    <LoadingState :loading="loading" preserve-content :failed="loadFailed" retryable @retry="load">
      <div class="notice-header">
        <h2>{{ t('terms.notice.title') }}</h2>
        <t-tag :theme="tag.theme">{{ tag.text }}</t-tag>
      </div>
      <p class="description">{{ t('terms.notice.desc') }}</p>
      <section class="notice-display">
        <div class="switch-block">
          <t-checkbox
            v-model="form.login_popup_enabled"
            :disabled="!canWrite || submitting || form.mandatory_confirmation"
            >{{ t('terms.notice.showLoginDialog') }}</t-checkbox
          >
          <p class="hint">{{ t('terms.notice.showLoginDialogHint') }}</p>
        </div>
        <div class="switch-block">
          <t-checkbox v-model="form.mandatory_confirmation" :disabled="!canWrite || submitting">{{
            t('terms.notice.requireConfirmation')
          }}</t-checkbox>
          <p class="hint">{{ t('terms.notice.requireConfirmationHint') }}</p>
        </div>
      </section>
      <t-form ref="formRef" :data="form" :rules="rules" label-align="top" class="notice-form">
        <t-form-item
          class="notice-group"
          v-for="field in fields"
          :key="field.key"
          :name="field.key"
          :label="t(field.label)"
        >
          <t-textarea
            v-if="field.body"
            v-model="form[field.key]"
            :disabled="!canWrite || submitting"
            :maxlength="10000"
            :autosize="{ minRows: 6, maxRows: 12 }"
          />
          <t-input
            v-else
            v-model="form[field.key]"
            :disabled="!canWrite || submitting"
            :maxlength="100"
          />
        </t-form-item>
      </t-form>
      <div class="notice-actions">
        <span class="hint">{{
          t('terms.notice.version', {
            version: saved?.version || '—',
            time: formatDateTime(saved?.config_updated_at) || '—',
          })
        }}</span>
        <t-space>
          <t-button variant="outline" :disabled="submitting" @click="previewVisible = true">{{
            t('terms.notice.preview')
          }}</t-button>
          <t-button v-permission="'system.settings:write'" :disabled="submitting" @click="reset">{{
            t('terms.notice.reset')
          }}</t-button>
          <t-button
            v-permission="'system.settings:write'"
            theme="primary"
            :loading="submitting"
            @click="save"
            >{{ t('terms.notice.save') }}</t-button
          >
        </t-space>
      </div>
    </LoadingState>
  </t-card>
  <terms-preview-dialog v-model:visible="previewVisible" :translations="translations" />
</template>
<script setup lang="ts">
import { useLatestRequest } from '@/utils/useLatestRequest'
import { createIdempotencyKey } from '@/api/request'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import {
  MessagePlugin,
  type FormInstanceFunctions,
  type FormRule,
  type TagProps,
} from 'tdesign-vue-next'
import {
  getTermsConfigApi,
  publishTermsVersionApi,
  updateTermsConfigApi,
  type TermsConfig,
  type TermsTranslation,
} from '@/api/modules/terms'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import TermsPreviewDialog from './TermsPreviewDialog.vue'
import { formatDateTime } from '@/utils/datetime'
const { t } = useI18n()
const userStore = useUserStore()
const canWrite = computed(() => canWriteResource(userStore.permissions, 'system.settings'))
const form = reactive({
  login_popup_enabled: false,
  mandatory_confirmation: false,
  title_zh: '',
  content_zh: '',
  title_en: '',
  content_en: '',
})
const saved = ref<TermsConfig | null>(null)
const formRef = ref<FormInstanceFunctions>()
const submitting = ref(false)
const previewVisible = ref(false)
const fields = [
  { key: 'title_zh', label: 'terms.notice.titleZh', body: false },
  { key: 'content_zh', label: 'terms.notice.contentZh', body: true },
  { key: 'title_en', label: 'terms.notice.titleEn', body: false },
  { key: 'content_en', label: 'terms.notice.contentEn', body: true },
] as const
const rules = computed<Record<string, FormRule[]>>(() =>
  Object.fromEntries(
    fields.map((field) => [
      field.key,
      [
        {
          required: true,
          validator: (value: string) => !!value?.trim(),
          message: t('terms.notice.required', { field: t(field.label) }),
          type: 'error',
        },
      ],
    ]),
  ),
)
const tag = computed<{ theme: TagProps['theme']; text: string }>(() =>
  form.mandatory_confirmation
    ? { theme: 'success', text: t('terms.notice.tag.both') }
    : form.login_popup_enabled
      ? { theme: 'warning', text: t('terms.notice.tag.dialogOnly') }
      : { theme: 'default', text: t('terms.notice.tag.off') },
)
watch(
  () => form.mandatory_confirmation,
  (value) => {
    if (value) form.login_popup_enabled = true
  },
)
function apply(config: TermsConfig) {
  saved.value = { ...config }
  const zh = config.translations.find((item) => item.locale_code.startsWith('zh'))
  const en = config.translations.find((item) => item.locale_code.startsWith('en'))
  form.title_zh = zh?.title ?? ''
  form.content_zh = zh?.body ?? ''
  form.title_en = en?.title ?? ''
  form.content_en = en?.body ?? ''
  form.login_popup_enabled = config.login_popup_enabled
  form.mandatory_confirmation = config.mandatory_confirmation
}
function reset() {
  if (saved.value) apply(saved.value)
  formRef.value?.clearValidate()
  MessagePlugin.success(t('terms.notice.resetDone'))
}
const translations = computed<TermsTranslation[]>(() => {
  const items =
    saved.value?.translations.map(({ locale_code, title, body }) => ({
      locale_code,
      title,
      body,
    })) ?? []
  for (const [prefix, locale, title, body] of [
    ['zh', 'zh-CN', form.title_zh, form.content_zh],
    ['en', 'en', form.title_en, form.content_en],
  ]) {
    const item = items.find((entry) => entry.locale_code.startsWith(prefix))
    if (item) Object.assign(item, { title, body })
    else items.push({ locale_code: locale, title, body })
  }
  return items
})
const textChanged = computed(
  () =>
    JSON.stringify(translations.value) !==
    JSON.stringify(
      saved.value?.translations.map(({ locale_code, title, body }) => ({
        locale_code,
        title,
        body,
      })),
    ),
)
const switchChanges = computed(() => {
  const changes: { login_popup_enabled?: boolean; mandatory_confirmation?: boolean } = {}
  if (!saved.value) return changes
  for (const key of ['login_popup_enabled', 'mandatory_confirmation'] as const) {
    if (form[key] !== saved.value[key]) changes[key] = form[key]
  }
  return changes
})
async function save() {
  if (
    !canWrite.value ||
    !saved.value ||
    submitting.value ||
    (await formRef.value?.validate()) !== true
  )
    return
  if (!textChanged.value && !Object.keys(switchChanges.value).length) return
  const text = textChanged.value ? translations.value.map((item) => ({ ...item })) : null
  const switches = { ...switchChanges.value }
  submitting.value = true
  let changed = false
  try {
    if (text) {
      await publishTermsVersionApi({ translations: text }, createIdempotencyKey())
      changed = true
    }
    if (Object.keys(switches).length) {
      await updateTermsConfigApi(switches, createIdempotencyKey())
      changed = true
    }
    apply(await getTermsConfigApi())
    MessagePlugin.success(t('terms.notice.saveSuccess'))
  } catch {
    // Preserve unsaved edits while updating the saved baseline after a partial success.
    if (changed && saved.value) {
      try {
        const config = await getTermsConfigApi()
        saved.value = { ...config }
      } catch {
        // The request layer reports failures.
      }
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
    const result = await getTermsConfigApi()
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
