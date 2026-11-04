<template>
  <PolicyForm
    v-if="draft"
    domain="DATA_CONTROL"
    :value="draft"
    @close="emit('close')"
    @saved="emit('close')"
  />
  <t-dialog
    v-else
    :visible="true"
    :header="label('saved')"
    :body="label('ruleSavedPolicyHelp')"
    :confirm-btn="{ content: label('createPolicyFromRule'), disabled: !rule.enabled }"
    :cancel-btn="label('confirm')"
    @close="emit('close')"
    @confirm="createPolicy"
  />
</template>
<script setup lang="ts">
import { ref } from 'vue'
import {
  emptyPolicy,
  emptyAction,
  type DetectionRule,
  type SecurityPolicy,
} from '@/api/modules/security'
import PolicyForm from './PolicyForm.vue'
import { useSecurity } from '../useSecurity'
const props = defineProps<{ rule: DetectionRule }>()
const emit = defineEmits<{ close: [] }>()
const { label } = useSecurity()
const draft = ref<SecurityPolicy>()
function createPolicy() {
  const p = emptyPolicy('DATA_CONTROL')
  p.enabled = false
  p.detection_actions = [{ ...emptyAction(), selector: 'IDS', values: [props.rule.id] }]
  draft.value = p
}
</script>
