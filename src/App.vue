<template>
  <t-config-provider :global-config="tdesignLocale">
    <t-loading
      v-if="userStore.permissionsLoading && !termsStore.accepting && !isLoginPage"
      :text="t('navigationErrors.loading')"
      fullscreen
      :delay="200"
    />
    <div v-if="userStore.permissionError" class="permission-error" role="alert">
      <AccessState :title="t('navigationErrors.title')" :description="userStore.permissionError">
        <t-button
          theme="primary"
          size="large"
          :loading="userStore.permissionsLoading"
          @click="retryPermissions"
          >{{ t('navigationErrors.retry') }}</t-button
        >
      </AccessState>
    </div>
    <router-view />
    <change-password-dialog />
    <terms-accept-dialog />
  </t-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/modules/user'
import { useTermsStore } from '@/stores/modules/terms'
import { useI18n } from 'vue-i18n'
import enUS from 'tdesign-vue-next/es/locale/en_US'
import zhCN from 'tdesign-vue-next/es/locale/zh_CN'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import TermsAcceptDialog from '@/components/TermsAcceptDialog.vue'
import AccessState from '@/components/AccessState.vue'

// 组件库内置文案（分页/弹窗/日期等）跟随应用语言切换
const { locale, t } = useI18n()
const userStore = useUserStore()
const termsStore = useTermsStore()
const router = useRouter()
const isLoginPage = computed(() => router.currentRoute.value.path === '/login')
async function retryPermissions() {
  try {
    if (!userStore.contextLoaded) await userStore.loadContext()
    await userStore.fetchUserInfo()
    const target = window.location.hash.slice(1) || '/'
    await router.replace(target.startsWith('/login') ? '/' : target)
  } catch {
    /* Error and retry remain visible. */
  }
}
const tdesignLocale = computed(() => {
  const messages = locale.value === 'en-US' ? enUS : zhCN
  return {
    ...messages,
    dialog: { ...messages.dialog, placement: 'center' as const },
  }
})
</script>
<style scoped>
.permission-error {
  position: fixed;
  inset: 0;
  background: var(--td-bg-color-page);
  overflow-y: auto;
  z-index: var(--td-z-index-dialog);
}
</style>
