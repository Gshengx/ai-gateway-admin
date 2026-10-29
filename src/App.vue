<template>
  <t-config-provider :global-config="tdesignLocale">
    <router-view />
    <change-password-dialog />
    <terms-accept-dialog />
  </t-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import enUS from 'tdesign-vue-next/es/locale/en_US'
import zhCN from 'tdesign-vue-next/es/locale/zh_CN'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import TermsAcceptDialog from '@/components/TermsAcceptDialog.vue'

// 组件库内置文案（分页/弹窗/日期等）跟随应用语言切换
const { locale } = useI18n()
const tdesignLocale = computed(() => (locale.value === 'en-US' ? enUS : zhCN))
</script>
