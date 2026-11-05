<template>
  <div class="page-container">
    <t-card :bordered="false">
      <t-result theme="default" :title="t('placeholder.title', { title: pageTitle })">
        <template #default>
          {{ t('placeholder.desc') }}
        </template>
      </t-result>
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
    permissionStore.routes.find((item) => item.meta?.routeId === route.meta.routeId)?.meta?.title ||
    t('placeholder.fallback'),
)
</script>
