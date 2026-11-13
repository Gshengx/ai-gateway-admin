<template>
  <div class="page-container">
    <t-card :bordered="false" :title="t('placeholder.title', { title: pageTitle })">
      <t-empty :description="t('placeholder.desc')" />
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { usePermissionStore } from '@/stores/modules/permission'

const route = useRoute()
const { t } = useI18n()

const permissionStore = usePermissionStore()
const pageTitle = computed(
  () =>
    (route.meta.serverTitle === false && route.meta.title ? t(route.meta.title) : '') ||
    permissionStore.routes.find((item) => item.meta?.routeId === route.meta.routeId)?.meta?.title ||
    t('placeholder.fallback'),
)
</script>
