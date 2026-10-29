<template>
  <t-card :bordered="false" class="settings-panel">
    <div class="notice-header">
      <h2>{{ t('terms.notice.title') }}</h2>
      <t-tag :theme="tag.theme">{{ tag.text }}</t-tag>
    </div>
    <p class="description">{{ t('terms.notice.desc') }}</p>
    <section class="notice-display">
      <div class="switch-block">
        <t-checkbox
          v-model="form.login_popup_enabled"
          :disabled="!canWrite || form.mandatory_confirmation"
          >{{ t('terms.notice.showLoginDialog') }}</t-checkbox
        >
        <p class="hint">{{ t('terms.notice.showLoginDialogHint') }}</p>
      </div>
      <div class="switch-block">
        <t-checkbox v-model="form.mandatory_confirmation" :disabled="!canWrite">{{
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
          :disabled="!canWrite"
          :maxlength="10000"
          :autosize="{ minRows: 6, maxRows: 12 }"
        />
        <t-input v-else v-model="form[field.key]" :disabled="!canWrite" :maxlength="100" />
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
        <t-button variant="outline" @click="previewVisible = true">{{
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
  </t-card>
  <t-dialog
    v-model:visible="reasonVisible"
    :header="t('terms.notice.reason')"
    :close-on-overlay-click="false"
    :close-btn="!submitting"
    :confirm-btn="{ content: t('common.confirm'), loading: submitting, disabled: !reason.trim() }"
    :cancel-btn="{ content: t('common.cancel'), disabled: submitting }"
    @confirm="confirmSave"
  >
    <t-form :data="{ reason }" label-align="top">
      <t-form-item :label="t('terms.notice.reason')" required>
        <t-textarea
          v-model="reason"
          :maxlength="512"
          :placeholder="t('terms.notice.reasonRequired')"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
  <t-dialog
    lazy
    destroy-on-close
    v-model:visible="reauth.visible"
    :header="t('terms.notice.reauth.title')"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('common.confirm'), disabled: !reauth.password }"
    :cancel-btn="{ content: t('common.cancel') }"
    @confirm="onReauthConfirm"
    @close="onReauthClose"
  >
    <p class="description">{{ t('terms.notice.reauth.content') }}</p>
    <t-input
      v-model="reauth.password"
      type="password"
      autocomplete="current-password"
      name="notice-reauth"
      :placeholder="t('terms.notice.reauth.password')"
    />
  </t-dialog>
  <terms-preview-dialog v-model:visible="previewVisible" :translations="translations" />
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
import { useTermsStore } from '@/stores/modules/terms'
import { reauthApi, type ReauthIntent } from '@/api/modules/auth'
import TermsPreviewDialog from './TermsPreviewDialog.vue'
import { formatDateTime } from '@/utils/datetime'
const { t } = useI18n()
const userStore = useUserStore()
const termsStore = useTermsStore()
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
const reasonVisible = ref(false)
const reason = ref('')
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
  reason.value = ''
  reasonVisible.value = true
}
/** 敏感操作执行前输入密码，换取一次性证明。 */
const reauth = reactive({ visible: false, password: '' })
let settleReauthPassword: ((password: string | null) => void) | null = null
function askReauthPassword(): Promise<string | null> {
  reauth.password = ''
  reauth.visible = true
  return new Promise((resolve) => {
    settleReauthPassword = resolve
  })
}
function finishReauth(password: string | null) {
  reauth.visible = false
  reauth.password = ''
  settleReauthPassword?.(password)
  settleReauthPassword = null
}
function onReauthConfirm() {
  if (!reauth.password) return
  finishReauth(reauth.password)
}
function onReauthClose() {
  finishReauth(null)
}
async function confirmSave() {
  if (submitting.value || !reason.value.trim() || reason.value.length > 512) return
  submitting.value = true
  try {
    const changeReason = reason.value.trim()
    const steps: Array<{
      intent: ReauthIntent
      idempotencyKey: string
      run: (proof: string, idempotencyKey: string) => Promise<unknown>
    }> = []
    if (textChanged.value) {
      const body = {
        reason: changeReason,
        translations: translations.value.map((item) => ({ ...item })),
      }
      steps.push({
        intent: {
          operation_id: 'publishTermsVersion',
          path: {},
          body,
        },
        idempotencyKey: crypto.randomUUID(),
        run: (proof, key) => publishTermsVersionApi(body, proof, key),
      })
    }
    if (Object.keys(switchChanges.value).length) {
      const body = { ...switchChanges.value, reason: changeReason }
      steps.push({
        intent: { operation_id: 'updateTermsConfig', path: {}, body },
        idempotencyKey: crypto.randomUUID(),
        run: (proof, key) => updateTermsConfigApi(body, proof, key),
      })
    }
    const passwords: string[] = []
    for (let index = 0; index < steps.length; index += 1) {
      const password = await askReauthPassword()
      if (password === null || !canWrite.value) return
      passwords.push(password)
    }
    for (const [index, step] of steps.entries()) {
      const password = passwords[index]!
      const { proof_token } = await reauthApi({ password, intent: step.intent })
      if (!canWrite.value) return
      await step.run(proof_token, step.idempotencyKey)
    }
    apply(await getTermsConfigApi())
    reasonVisible.value = false
    MessagePlugin.success(t('terms.notice.saveSuccess'))
    try {
      await termsStore.loadStatus()
    } catch {
      /* 错误已统一处理，不阻断当前流程 */
    }
  } catch {
    /* 错误已统一处理，不阻断当前流程 */
  } finally {
    submitting.value = false
  }
}
onMounted(async () => {
  try {
    apply(await getTermsConfigApi())
  } catch {
    /* 错误已统一处理，不阻断当前流程 */
  }
})
</script>
<style scoped src="@/styles/settings-panels.css"></style>
