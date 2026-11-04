<template>
  <t-dialog
    :visible="true"
    :header="t('security.confirmChange', { action })"
    width="var(--security-confirm-width)"
    :confirm-btn="{
      content: label('confirm'),
      loading: busy,
      theme: danger ? 'danger' : 'primary',
    }"
    :cancel-btn="label('cancel')"
    :close-on-overlay-click="false"
    @close="emit('close')"
    @confirm="confirm"
  >
    <div class="security-stack">
      <p>{{ message }}</p>
      <t-form-item :label="label('reason')" required :status="invalid ? 'error' : undefined"
        ><t-textarea v-model="reason" :maxlength="200"
      /></t-form-item>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useSecurity } from '../useSecurity'
defineProps<{ action: string; message: string; busy: boolean; danger?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()
const { label, t } = useSecurity()
const reason = ref(''),
  invalid = ref(false)
function confirm() {
  invalid.value = !reason.value.trim()
  if (!invalid.value) emit('confirm', reason.value.trim())
}
</script>
<style scoped>
@import '@/styles/security.css';
</style>
