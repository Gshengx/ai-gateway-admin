<template>
  <t-dialog
    :visible="true"
    :header="label('configure')"
    width="var(--security-confirm-width)"
    :cancel-btn="null"
    :confirm-btn="label('confirm')"
    @close="emit('close')"
    @confirm="emit('close')"
  >
    <div class="security-stack">
      <t-alert theme="warning" :message="label('capabilityHelp')" />
      <div
        v-for="method in ['KEYWORD', 'REGEX', 'CLASSIFIER', 'LLM_JUDGE', 'THREAT_INTELLIGENCE']"
        :key="method"
        class="security-inline"
      >
        <span>{{ label(method) }}</span
        ><span class="security-spacer" /><t-tag
          :theme="options?.abilities[method as Method] ? 'success' : 'warning'"
          >{{ label(options?.abilities[method as Method] ? 'configured' : 'unconfigured') }}</t-tag
        >
      </div>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import type { Method } from '@/api/modules/security'
import { useSecurity } from '../useSecurity'
const emit = defineEmits<{ close: [] }>()
const { label, options, loadOptions, error } = useSecurity()
onMounted(() => void loadOptions().catch(error))
</script>
<style scoped>
@import '@/styles/security.css';
</style>
