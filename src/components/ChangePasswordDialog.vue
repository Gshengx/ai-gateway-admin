<template>
  <t-dialog
    lazy
    destroy-on-close
    :visible="visible"
    :header="t('changePassword.title')"
    :close-btn="false"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    :footer="false"
  >
    <p>
      {{ t('changePassword.description') }}
      {{
        userStore.context.password_rules
          ? t('changePassword.policy', userStore.context.password_rules)
          : ''
      }}
    </p>
    <t-form
      ref="formRef"
      :data="formData"
      :rules="rules"
      label-align="top"
      prevent-submit-default
      @submit="submit"
    >
      <t-form-item
        v-for="field in fields"
        :key="field"
        :name="field"
        :label="t(`changePassword.${field}`)"
      >
        <t-input
          v-model="formData[field]"
          type="password"
          :autocomplete="field === 'current_password' ? 'current-password' : 'new-password'"
        />
      </t-form-item>
      <t-form-item>
        <t-button type="submit" block :loading="loading" :disabled="loading">{{
          t('changePassword.submit')
        }}</t-button>
      </t-form-item>
      <t-button variant="text" block :disabled="loading" @click="exit()">{{
        t('changePassword.logout')
      }}</t-button>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type FormRule, type FormInstanceFunctions } from 'tdesign-vue-next'
import type { NotifiedError } from '@/api/request'
import { changePasswordApi } from '@/api/modules/auth'
import { useUserStore } from '@/stores/modules/user'

const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()
const visible = computed(() => userStore.context.session?.gate === 'NEEDS_PASSWORD')
watch(visible, () => {
  for (const field of fields) formData[field] = ''
  formRef.value?.clearValidate()
})
async function continueAfterPassword() {
  const session = userStore.context.session
  if (session?.gate !== 'READY' || session.scope !== 'FULL') return
  const route = router.currentRoute.value
  if (route.path !== '/login') return
  const target = route.query.redirect
  await router.replace(
    typeof target === 'string' &&
      target.startsWith('/') &&
      !target.startsWith('//') &&
      !['/login', '/change-password', '/onboarding/'].some((path) => target.startsWith(path))
      ? target
      : '/',
  )
}
const loading = ref(false)
const formRef = ref<FormInstanceFunctions>()
const fields = ['current_password', 'new_password', 'confirmation'] as const
const formData = reactive({ current_password: '', new_password: '', confirmation: '' })
const rules = computed<Record<string, FormRule[]>>(() => {
  const policy = userStore.context.password_rules
  const newRules: FormRule[] = [
    { required: true, message: t('changePassword.required'), type: 'error' },
    {
      validator: (value) => value !== formData.current_password,
      message: t('changePassword.different'),
      type: 'error',
    },
  ]
  if (policy?.min_length !== undefined)
    newRules.push({
      validator: (value) => String(value).length >= policy.min_length!,
      message: t('changePassword.minLength', { count: policy.min_length }),
      type: 'error',
    })
  if (policy?.max_length !== undefined)
    newRules.push({
      validator: (value) => String(value).length <= policy.max_length!,
      message: t('changePassword.maxLength', { count: policy.max_length }),
      type: 'error',
    })
  if (policy)
    newRules.push({
      validator: (value) =>
        [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9\s]/].filter((pattern) =>
          pattern.test(String(value)),
        ).length >= policy.complexity_categories,
      message: t('changePassword.complexity', { count: policy.complexity_categories }),
      type: 'error',
    })
  return {
    current_password: [{ required: true, message: t('changePassword.required'), type: 'error' }],
    new_password: newRules,
    confirmation: [
      { required: true, message: t('changePassword.required'), type: 'error' },
      {
        validator: (value) => value === formData.new_password,
        message: t('changePassword.mismatch'),
        type: 'error',
      },
    ],
  }
})
async function exit(sessionInvalidated = false) {
  try {
    await userStore.logout(sessionInvalidated)
  } catch {
    // 请求失败时保留会话，供用户重试退出。
  } finally {
    if (!userStore.contextLoaded) await router.replace('/login')
  }
}
async function submit(ctx: { validateResult: boolean | Record<string, unknown> }) {
  if (ctx.validateResult !== true || loading.value) return
  loading.value = true
  const validation: Record<string, Array<{ type: 'error'; message: string }>> = {}
  try {
    await changePasswordApi({
      current_password: formData.current_password,
      new_password: formData.new_password,
    })
    MessagePlugin.success(t('changePassword.success'))
    await userStore.refreshContext()
    await continueAfterPassword()
  } catch (error) {
    const err = error as NotifiedError
    if (err.code === 'UNAUTHENTICATED') {
      userStore.reset()
      MessagePlugin.warning(t('authErrors.passwordRelogin'))
      await router.replace('/login')
    }
    if (err.code === 'PASSWORD_POLICY_CHANGED') {
      try {
        await userStore.refreshContext()
      } catch {
        MessagePlugin.error(t('authErrors.contextUnavailable'))
      }
    }
    if (err.code === 'VALIDATION_FAILED' || err.code === 'PASSWORD_REUSED') {
      const policy = err.params?.password_policy
      if (policy && userStore.context.password_rules)
        Object.assign(userStore.context.password_rules, policy)
      const fields = err.params?.fields as Record<string, string> | undefined
      for (const [field, rule] of Object.entries(fields ?? {})) {
        const key = `authErrors.${rule}`
        if (field === 'current_password' || field === 'new_password')
          validation[field] = [
            { type: 'error', message: t(key) === key ? t('authErrors.VALIDATION_FAILED') : t(key) },
          ]
      }
    }
    if (!err.status) {
      try {
        await userStore.refreshContext()
        await continueAfterPassword()
      } catch {
        MessagePlugin.warning(t('authErrors.passwordUncertain'))
        if (!userStore.contextLoaded && !userStore.context.session) await router.replace('/login')
      }
    }
  } finally {
    for (const field of fields) formData[field] = ''
    await nextTick()
    formRef.value?.setValidateMessage(validation)
    loading.value = false
  }
}
</script>

<style scoped>
p {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-medium);
  margin: 0 0 var(--td-comp-margin-xl);
}
</style>
