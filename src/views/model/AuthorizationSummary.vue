<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AuthorizationSummary, SubjectType } from '@/api/modules/logicalModels'

defineProps<{ summary?: AuthorizationSummary; readable: boolean }>()
const emit = defineEmits<{ select: [type: SubjectType] }>()
const { t } = useI18n()
const entries = [
  { type: 'DEPARTMENT', key: 'department_count', label: 'department' },
  { type: 'GROUP', key: 'user_group_count', label: 'group' },
  { type: 'USER', key: 'user_count', label: 'user' },
] as const
</script>

<template>
  <span v-if="!readable">{{ t('logicalModels.summaryForbidden') }}</span>
  <span v-else-if="!summary">{{ t('logicalModels.summaryUnavailable') }}</span>
  <t-space v-else>
    <t-link
      v-for="entry in entries"
      :key="entry.type"
      theme="primary"
      @click="emit('select', entry.type)"
    >
      {{ t(`logicalModels.${entry.label}`) }} {{ summary[entry.key] }}
    </t-link>
  </t-space>
</template>
