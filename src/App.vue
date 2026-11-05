<template>
  <t-config-provider :global-config="tdesignLocale">
    <t-loading
      v-if="userStore.permissionsLoading && !isLoginPage"
      :text="t('navigationErrors.loading')"
    />
    <t-alert v-if="userStore.permissionError" theme="error" :message="userStore.permissionError">
      <template #operation
        ><t-button variant="text" @click="retryPermissions">{{
          t('navigationErrors.retry')
        }}</t-button></template
      >
    </t-alert>
    <router-view />
    <change-password-dialog />
    <terms-accept-dialog />
  </t-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/modules/user'
import { useI18n } from 'vue-i18n'
import enUS from 'tdesign-vue-next/es/locale/en_US'
import zhCN from 'tdesign-vue-next/es/locale/zh_CN'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import TermsAcceptDialog from '@/components/TermsAcceptDialog.vue'

// 组件库内置文案（分页/弹窗/日期等）跟随应用语言切换
const { locale, t } = useI18n()
const userStore = useUserStore()
const router = useRouter()
const isLoginPage = computed(() => router.currentRoute.value.path === '/login')
async function retryPermissions() {
  try {
    await userStore.fetchUserInfo()
    const route = router.currentRoute.value
    await router.replace(route.path === '/login' ? '/' : route.fullPath)
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
