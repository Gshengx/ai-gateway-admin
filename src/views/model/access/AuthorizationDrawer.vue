<template>
  <t-drawer
    class="model-authorization-drawer"
    :visible="true"
    :header="t('ma.grants')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!busy"
    size="large"
    @close="!busy && emit('close')"
  >
    <div class="ma-stack">
      <div>{{ model.model_id_at_gateway }}</div>
      <PermissionsEditor :model-id="model.id" @busy-change="busy = $event" />
    </div>
    <template #footer>
      <div class="ma-footer">
        <t-button theme="default" :disabled="busy" @click="!busy && emit('close')">
          {{ t('ma.close') }}
        </t-button>
      </div>
    </template>
  </t-drawer>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModelListItem } from '@/api/modules/modelAccessContract'
import PermissionsEditor from './PermissionsEditor.vue'

defineProps<{ model: Pick<ModelListItem, 'id' | 'model_id_at_gateway'> }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const busy = ref(false)
</script>
<style scoped src="./access.css"></style>
