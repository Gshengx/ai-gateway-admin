<template>
  <t-dialog
    :visible="true"
    :header="label(readOnly ? 'detail' : value ? 'edit' : 'createAllowlist')"
    width="var(--security-dialog-width)"
    :confirm-btn="
      readOnly ? null : { content: label(value ? 'save' : 'createAllowlist'), loading: saving }
    "
    :cancel-btn="label(readOnly ? 'confirm' : 'cancel')"
    :close-on-overlay-click="false"
    @close="emit('close')"
    @confirm="save"
  >
    <div class="security-dialog-body">
      <t-form class="security-form" label-align="top" :disabled="readOnly">
        <t-alert v-if="errorMessage" theme="error" :message="errorMessage" />
        <t-form-item
          :label="label('allowlistName')"
          required
          :status="fieldErrors.includes('name') ? 'error' : undefined"
          :tips="fieldErrors.includes('name') ? errorMessage : ''"
          ><t-input v-model="form.name" :maxlength="200"
        /></t-form-item>
        <t-form-item :label="label('whitelistType')"
          ><span>{{ label(type) }}</span></t-form-item
        >
        <t-form-item v-if="type !== 'SECURITY_DETECTION'" :label="label('USERS')"
          ><t-select
            v-model="form.user_ids"
            multiple
            filterable
            clearable
            :options="optionChoices(options?.users)"
        /></t-form-item>
        <t-form-item :label="label('PHYSICAL')"
          ><t-select
            v-model="form.model_ids"
            multiple
            filterable
            clearable
            :options="optionChoices(options?.physical_models)"
        /></t-form-item>
        <template v-if="type === 'ACCESS_CONTROL' || type === 'DATA_CONTROL'"
          ><h3 class="security-heading">{{ label('environment') }}</h3>
          <EnvironmentFields v-model="form.environment_condition" allowlist
        /></template>
        <t-form-item
          v-if="type === 'DATA_CONTROL' || type === 'SECURITY_DETECTION'"
          :label="label('detectionRules')"
          ><t-select v-model="form.rule_ids" multiple filterable clearable :options="ruleOptions"
        /></t-form-item>
        <t-alert theme="warning" :message="label(`allow_${type}`)" />
        <p class="security-help">{{ label('allowHelp') }}</p>
        <t-alert theme="info" :message="`${label('conditions')}: ${allowSummary(form, rules)}`" />
      </t-form>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  emptyAllowlist,
  getAllRules,
  saveAllowlist,
  type Allowlist,
  type DetectionRule,
  type PolicyDomain,
} from '@/api/modules/security'
import { useSecurity } from '../useSecurity'
import EnvironmentFields from './EnvironmentFields.vue'
const props = defineProps<{ type: PolicyDomain; value?: Allowlist; readOnly?: boolean }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const {
  label,
  name,
  choices,
  optionChoices,
  options,
  loadOptions,
  error,
  errorMessage,
  fieldErrors,
  allowSummary,
} = useSecurity()
const form = ref<Allowlist>(
    props.value ? JSON.parse(JSON.stringify(props.value)) : emptyAllowlist(props.type),
  ),
  saving = ref(false),
  rules = ref<DetectionRule[]>([])
const ruleOptions = computed(() => [
  ...rules.value.map((r) => ({ value: r.id, label: name(r), disabled: !r.enabled })),
  ...(props.type === 'DATA_CONTROL' ? choices(['FILE_UPLOAD', 'FILE_FORMAT', 'FILE_SIZE']) : []),
])
async function save() {
  if (props.readOnly || saving.value) return
  saving.value = true
  try {
    await saveAllowlist(form.value)
    void MessagePlugin.success(label('saved'))
    emit('saved')
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
onMounted(async () => {
  try {
    await loadOptions()
    if (['DATA_CONTROL', 'SECURITY_DETECTION'].includes(props.type))
      rules.value = await getAllRules({
        rule_domain: props.type === 'DATA_CONTROL' ? 'DATA_LEAKAGE' : 'SECURITY_DETECTION',
      })
  } catch (e) {
    error(e)
  }
})
</script>
<style scoped>
@import '@/styles/security.css';
</style>
