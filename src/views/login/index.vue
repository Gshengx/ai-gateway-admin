<template>
  <div class="login-page">
    <locale-select class="login-page__locale" />
    <div class="login-page__panel">
      <div class="login-page__brand">
        <img src="/favicon.svg" alt="logo" />
        <div>
          <h1>{{ t('app.title') }}</h1>
          <p>{{ t('app.subtitle') }}</p>
        </div>
      </div>

      <t-form
        ref="formRef"
        :data="formData"
        :rules="formRules"
        label-width="0"
        prevent-submit-default
        @submit="onSubmit"
      >
        <t-form-item name="username">
          <t-input
            v-model="formData.username"
            :maxlength="128"
            size="large"
            :placeholder="t('login.usernamePlaceholder')"
            clearable
          >
            <template #prefix-icon>
              <t-icon name="user" />
            </template>
          </t-input>
        </t-form-item>
        <t-form-item name="password">
          <t-input
            v-model="formData.password"
            :maxlength="1024"
            type="password"
            size="large"
            :placeholder="t('login.passwordPlaceholder')"
            clearable
          >
            <template #prefix-icon>
              <t-icon name="lock-on" />
            </template>
          </t-input>
        </t-form-item>
        <t-form-item>
          <t-button
            theme="primary"
            size="large"
            block
            :loading="loading"
            :disabled="loading"
            type="submit"
          >
            {{ t('login.submit') }}
          </t-button>
        </t-form-item>
      </t-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type FormInstanceFunctions, type FormRule } from 'tdesign-vue-next'

import LocaleSelect from '@/components/LocaleSelect.vue'
import { useTermsStore } from '@/stores/modules/terms'
import { useUserStore } from '@/stores/modules/user'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const userStore = useUserStore()
const termsStore = useTermsStore()
function completeLogin() {
  if (router.currentRoute.value.path !== '/login') return
  MessagePlugin.success(t('login.success'))
  const target = route.query.redirect
  const redirect =
    typeof target === 'string' &&
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !['/login', '/change-password', '/onboarding/'].some((path) => target.startsWith(path))
      ? target
      : '/'
  router.replace(redirect)
}
watch(
  () => termsStore.visible,
  (visible, previous) => {
    const session = userStore.context.session
    if (
      previous &&
      !visible &&
      !termsStore.accepting &&
      !loading.value &&
      session?.gate === 'READY' &&
      session.scope === 'FULL'
    )
      completeLogin()
  },
)
const formRef = ref<FormInstanceFunctions>()
const loading = ref(false)
const formData = reactive({
  username: '',
  password: '',
})

const formRules = computed<Record<string, FormRule[]>>(() => ({
  username: [
    { required: true, message: t('login.usernameRequired'), type: 'error' },
    {
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/,
      message: t('login.usernameFormat'),
      type: 'error',
    },
  ],
  password: [
    { required: true, message: t('login.passwordRequired'), type: 'error' },
    { max: 1024, message: t('login.passwordMaxLength'), type: 'error' },
  ],
}))

/** t-form @submit 回调自带校验结果（回车/按钮提交均走此处），无需手动二次 validate */
async function onSubmit(ctx: { validateResult: boolean | Record<string, unknown> }) {
  if (ctx.validateResult !== true || loading.value) return

  loading.value = true
  try {
    await userStore.login(formData)
    const session = userStore.context.session
    if (session?.gate !== 'READY' || session.scope !== 'FULL') return
    try {
      await termsStore.loadStatus()
    } catch {
      if (termsStore.blocking) throw new Error(t('authErrors.contextUnavailable'))
    }
    if (
      userStore.context.session?.gate === 'READY' &&
      userStore.context.session.scope === 'FULL' &&
      !termsStore.visible
    )
      completeLogin()
  } catch (error) {
    // 网络/业务错误已由 Axios 拦截器统一提示（带 notified 标记）；此处提示登录门禁类错误
    const err = error as Error & { notified?: boolean }
    if (!err.notified) MessagePlugin.warning(t('authErrors.fallback'))
  } finally {
    formData.password = ''
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(
    135deg,
    var(--td-brand-color-active) 0%,
    var(--td-brand-color-hover) 100%
  );
}

.login-page__locale {
  position: absolute;
  top: var(--td-comp-margin-l);
  right: var(--td-comp-margin-l);
}

.login-page__panel {
  width: 400px;
  padding: var(--td-comp-paddingTB-xxl) var(--td-comp-paddingLR-xxl);
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-3);
}

.login-page__brand {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-m);
  margin-bottom: var(--td-comp-margin-xl);
}

.login-page__brand img {
  width: 40px;
  height: 40px;
}

.login-page__brand h1 {
  margin: 0;
  font-size: var(--td-font-size-title-medium);
}

.login-page__brand p {
  margin: var(--td-comp-margin-xs) 0 0;
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}
</style>
