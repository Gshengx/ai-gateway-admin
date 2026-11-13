<template>
  <AccessState
    code="404"
    icon="search"
    :title="t('route.notFound')"
    :description="t('error.notFound')"
  >
    <t-button theme="primary" size="large" @click="goHome">{{ t('common.backHome') }}</t-button>
  </AccessState>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccessState from '@/components/AccessState.vue'

const router = useRouter()
const { t } = useI18n()
const goHome = () => router.replace('/')
</script>
