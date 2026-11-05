<template>
  <t-dialog
    :visible="true"
    :header="title"
    width="var(--security-dialog-width)"
    :confirm-btn="
      readOnly
        ? null
        : {
            content: label(
              value?.id ? 'save' : domain === 'AUDIT' ? 'createAudit' : 'createPolicy',
            ),
            loading: saving,
            disabled: !ready,
          }
    "
    :cancel-btn="label(readOnly ? 'confirm' : 'cancel')"
    :close-on-overlay-click="false"
    destroy-on-close
    @close="emit('close')"
    @confirm="save"
  >
    <div class="security-dialog-body">
      <t-form class="security-form" label-align="top" :disabled="readOnly" @submit="save">
        <t-alert v-if="errorMessage" theme="error" :message="errorMessage" />
        <t-form-item
          :label="label('name')"
          required
          :status="fieldErrors.includes('name') ? 'error' : undefined"
          :tips="fieldErrors.includes('name') ? errorMessage : ''"
          ><t-input
            v-model="form.name"
            :disabled="readOnly || (domain === 'AUDIT' && form.built_in)"
            :maxlength="200"
            :placeholder="label('enterName')"
            @change="form.seed_key = undefined"
        /></t-form-item>
        <t-form-item :label="label('description')"
          ><t-textarea
            v-model="form.description"
            :disabled="readOnly || (domain === 'AUDIT' && form.built_in)"
            :maxlength="200"
            @change="form.seed_key = undefined"
        /></t-form-item>
        <template v-if="domain !== 'SECURITY_DETECTION'">
          <h3 class="security-heading">{{ label(domain === 'AUDIT' ? 'userScope' : 'user') }}</h3>
          <t-form-item
            :label="label(domain === 'AUDIT' ? 'applicableUsers' : 'userScope')"
            required
            :status="fieldErrors.includes('user_condition') ? 'error' : undefined"
            ><ScopeFields
              v-model="form.user_condition"
              user
              :options="options"
              :disabled="readOnly || (domain === 'AUDIT' && form.built_in)"
          /></t-form-item>
        </template>
        <template v-if="domain === 'ACCESS_CONTROL' || domain === 'DATA_CONTROL'">
          <h3 class="security-heading">{{ label('environment') }}</h3>
          <EnvironmentFields v-model="form.environment_condition" />
        </template>
        <h3 class="security-heading">{{ label('model') }}</h3>
        <t-form-item
          :label="label('modelScope')"
          required
          :status="fieldErrors.includes('target_model_condition') ? 'error' : undefined"
          ><ScopeFields
            v-model="form.target_model_condition"
            :options="options"
            :disabled="readOnly || (domain === 'AUDIT' && form.built_in)"
        /></t-form-item>
        <template v-if="domain === 'DATA_CONTROL'">
          <h3 class="security-heading">{{ label('fileChecks') }}</h3>
          <ActionGroups
            v-model="form.detection_actions"
            file
            :rules="rules"
            :read-only="readOnly"
          />
          <h3 class="security-heading">{{ label('rulesTitle') }}</h3>
          <ActionGroups v-model="form.detection_actions" :rules="rules" :read-only="readOnly" />
          <t-form-item :label="label('responseDetection')"
            ><t-space
              ><t-switch v-model="form.response_detection_enabled" /><span>{{
                label(form.response_detection_enabled ? 'on' : 'off')
              }}</span></t-space
            ></t-form-item
          >
        </template>
        <template v-if="domain === 'SECURITY_DETECTION'"
          ><h3 class="security-heading">{{ label('ruleActions') }}</h3>
          <ActionGroups
            v-model="form.detection_actions"
            security
            :rules="rules"
            :read-only="readOnly"
        /></template>
        <t-form-item v-if="domain !== 'AUDIT'" :label="label('observation')"
          ><div class="security-stack">
            <t-space
              ><t-switch v-model="form.observation_mode" /><span>{{
                label(form.observation_mode ? 'on' : 'off')
              }}</span></t-space
            >
            <p class="security-help">
              {{
                label(
                  domain === 'ACCESS_CONTROL'
                    ? 'accessObserveHelp'
                    : domain === 'DATA_CONTROL'
                      ? 'dataObserveHelp'
                      : 'detectionObserveHelp',
                )
              }}
            </p>
          </div></t-form-item
        >
        <template v-else>
          <h3 class="security-heading">{{ label('auditLevel') }}</h3>
          <t-form-item :label="label('retentionScope')" required
            ><t-radio-group
              v-model="form.audit_level"
              :options="choices(['FULL', 'METADATA_ONLY', 'CUSTOM'])"
          /></t-form-item>
          <t-form-item
            v-if="form.audit_level === 'CUSTOM'"
            :label="label('auditFields')"
            required
            :status="fieldErrors.includes('audit_fields') ? 'error' : undefined"
            ><div class="security-stack">
              <t-checkbox :checked="true" disabled>{{ label('metadata') }}</t-checkbox
              ><t-checkbox-group v-model="form.audit_fields" :options="choices(auditFields)" /></div
          ></t-form-item>
          <t-alert
            v-if="form.audit_level === 'FULL'"
            theme="warning"
            :message="label('fullAuditHelp')"
          />
          <t-alert
            v-else-if="
              form.audit_level === 'CUSTOM' &&
              form.audit_fields.some((f) => f.includes('TOOLS') || f.includes('TOOL_CALLS'))
            "
            theme="warning"
            :message="label('toolsHelp')"
          />
          <p class="security-help">{{ label('auditFallback') }}</p>
        </template>
        <t-alert v-if="!configured" theme="warning" :message="label('capabilityHelp')"
          ><template #operation
            ><t-link @click="showCapability = true">{{ label('configure') }}</t-link></template
          ></t-alert
        >
        <t-form-item v-if="value?.id || !configured || !form.enabled" :label="label('status')"
          ><t-switch
            v-model="form.enabled"
            :disabled="readOnly || !ready || (!form.enabled && !configured)"
            :label="[label('enabled'), label('disabled')]"
        /></t-form-item>
        <t-alert theme="info" :message="summary" />
      </t-form>
    </div>
    <CapabilityDialog v-if="showCapability" @close="showCapability = false" />
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  emptyPolicy,
  getAllRules,
  savePolicy,
  type DetectionRule,
  type PolicyDomain,
  type SecurityPolicy,
} from '@/api/modules/security'
import { policyConfigured } from '@/api/mock/security'
import { auditFields, useSecurity } from '../useSecurity'
import ActionGroups from './ActionGroups.vue'
import EnvironmentFields from './EnvironmentFields.vue'
import ScopeFields from './ScopeFields.vue'
import CapabilityDialog from './CapabilityDialog.vue'
const props = defineProps<{ domain: PolicyDomain; value?: SecurityPolicy; readOnly?: boolean }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const {
  label,
  name,
  description,
  choices,
  options,
  loadOptions,
  error,
  errorMessage,
  fieldErrors,
  clearErrors,
  scopeSummary,
} = useSecurity()
const form = ref<SecurityPolicy>(
  props.value ? JSON.parse(JSON.stringify(props.value)) : emptyPolicy(props.domain),
)
if (props.value) {
  form.value.name = name(props.value)
  form.value.description = description(props.value)
}
const saving = ref(false),
  showCapability = ref(false),
  rules = ref<DetectionRule[]>([])
const title = computed(
  () =>
    `${label(props.readOnly ? 'detail' : props.value?.id ? 'edit' : props.domain === 'AUDIT' ? 'createAudit' : 'createPolicy')} · ${label({ ACCESS_CONTROL: 'accessTitle', DATA_CONTROL: 'dataTitle', SECURITY_DETECTION: 'detectionTitle', AUDIT: 'auditTitle' }[props.domain])}`,
)
const ready = ref(false)
const configured = computed(() => ready.value && policyConfigured(form.value, rules.value))
const summary = computed(() =>
  [
    form.value.name,
    ...(props.domain === 'SECURITY_DETECTION'
      ? []
      : [scopeSummary(form.value.user_condition, true)]),
    scopeSummary(form.value.target_model_condition),
  ]
    .filter(Boolean)
    .join(' · '),
)
async function save() {
  if (props.readOnly || saving.value || !ready.value) return
  clearErrors()
  saving.value = true
  try {
    const value = JSON.parse(JSON.stringify(form.value)) as SecurityPolicy
    if (props.value?.seed_key && value.seed_key) {
      value.name = props.value.name
      value.description = props.value.description
    }
    await savePolicy(props.domain, value)
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
    const domain = props.domain === 'SECURITY_DETECTION' ? 'SECURITY_DETECTION' : 'DATA_LEAKAGE'
    rules.value = await getAllRules({ rule_domain: domain })
    ready.value = true
    if (!props.value?.id && !configured.value) form.value.enabled = false
  } catch (e) {
    error(e)
  }
})
</script>
<style scoped>
@import '@/styles/security.css';
</style>
