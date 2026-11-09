<template>
  <t-config-provider :global-config="tdesignLocale">
    <t-loading
      v-if="userStore.permissionsLoading && !isLoginPage"
      :text="t('navigationErrors.loading')"
      fullscreen
      :delay="200"
    />
    <div v-if="userStore.permissionError" class="permission-error">
      <t-alert theme="error" :message="userStore.permissionError">
        <template #operation
          ><t-button variant="text" @click="retryPermissions">{{
            t('navigationErrors.retry')
          }}</t-button></template
        >
      </t-alert>
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
  display: grid;
  place-items: center;
  padding: var(--td-comp-paddingLR-xl);
  background: var(--td-bg-color-page);
  z-index: var(--td-z-index-dialog);
}
</style>
