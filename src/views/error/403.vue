<template>
  <t-result theme="403" title="403" :description="t('error.forbidden')">
    <template #default>
      <t-button theme="primary" @click="goHome">{{ t('common.backHome') }}</t-button>
    </template>
  </t-result>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()
const goHome = () => router.replace('/')
</script>
