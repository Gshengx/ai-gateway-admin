<template>
  <div class="group-reference-content">
    <p>{{ t('groups.delete.referenced') }}</p>
    <div v-if="models.length" class="group-reference-models">
      <p>{{ t('groups.delete.modelsLabel') }}</p>
      <ul>
        <li v-for="model in models" :key="model.id">{{ model.model_id_at_gateway }}</li>
      </ul>
    </div>
    <p v-if="hasMore">{{ t('groups.delete.referencedMore') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ModelGrantSourceModel } from '@/api/modules/identity'

defineProps<{ models: ModelGrantSourceModel[]; hasMore: boolean }>()

const { t } = useI18n()
</script>

<style scoped>
.group-reference-content,
.group-reference-models {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  overflow-wrap: anywhere;
}

.group-reference-models {
  gap: var(--td-comp-margin-xs);
}

.group-reference-content p,
.group-reference-content ul {
  margin: 0;
}

.group-reference-content ul {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-xs);
  padding-inline-start: var(--td-comp-paddingLR-l);
}
</style>
