<template>
  <t-dialog
    :visible="
      userStore.context.session?.gate !== 'NEEDS_PASSWORD' &&
      (termsStore.requireConfirmation || termsStore.visible)
    "
    width="640px"
    :header="title"
    :close-btn="!termsStore.requireConfirmation"
    @close="termsStore.skip()"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    :confirm-btn="{
      content: t('terms.gate.confirm'),
      theme: 'primary',
      disabled: !checked || termsStore.accepting || !termsStore.loaded,
      loading: termsStore.accepting,
    }"
    :cancel-btn="termsStore.requireConfirmation ? null : { content: t('terms.gate.skip') }"
    @confirm="onConfirm"
    @cancel="termsStore.skip()"
  >
    <div class="terms-content" v-html="content" />
    <t-checkbox v-model="checked" class="terms-check">{{ t('terms.gate.checkbox') }}</t-checkbox>
  </t-dialog>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { useUserStore } from '@/stores/modules/user'
import { useTermsStore } from '@/stores/modules/terms'
const { t, locale } = useI18n()
const termsStore = useTermsStore()
const userStore = useUserStore()
const checked = ref(false)
watch(
  () => userStore.context.session?.gate,
  async (gate) => {
    if (gate !== 'NEEDS_TERMS') return
    checked.value = false
    try {
      await termsStore.loadStatus()
    } catch {
      /* Keep the mandatory dialog open; the request layer reports the failure. */
    }
  },
  { immediate: true },
)
const router = useRouter()
const title = computed(() => termsStore.status?.title)
const content = computed(() => termsStore.status?.body)
watch(locale, async () => {
  checked.value = false
  // 强制确认时弹窗由 gate 驱动，visible 可能尚未置位，仍需按新语言重新拉取条款正文
  if (termsStore.visible || termsStore.requireConfirmation) {
    try {
      await termsStore.loadStatus()
    } catch {
      /* Request layer reports the failure. */
    }
  }
})
watch(
  () => [
    termsStore.visible,
    termsStore.status?.terms_id,
    termsStore.status?.resolved_locale,
    termsStore.status?.content_digest,
  ],
  () => {
    checked.value = false
  },
)
async function onConfirm() {
  if (!checked.value || termsStore.accepting) return
  try {
    await termsStore.accept()
    const session = userStore.context.session
    if (
      !termsStore.visible &&
      session?.gate === 'READY' &&
      session.scope === 'FULL' &&
      router.currentRoute.value.path === '/login'
    ) {
      const target = router.currentRoute.value.query.redirect
      await router.replace(
        typeof target === 'string' &&
          target.startsWith('/') &&
          !target.startsWith('//') &&
          !['/login', '/change-password', '/onboarding/'].some((path) => target.startsWith(path))
          ? target
          : '/',
      )
    }
    MessagePlugin.success(t('terms.gate.accepted'))
  } catch (error) {
    const err = error as { code?: string; notified?: boolean }
    if (err.code === 'UNAUTHENTICATED') await router.replace('/login')
    if (!err.notified) MessagePlugin.error(t('authErrors.contextUnavailable'))
  }
}
</script>
<style scoped>
.terms-content {
  max-height: 40vh;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: var(--td-font-size-body-medium);
  line-height: var(--td-line-height-body-medium);
}
.terms-check {
  margin-top: var(--td-comp-margin-l);
}
</style>
