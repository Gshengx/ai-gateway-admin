<template>
  <t-dialog
    :visible="true"
    :header="label(readOnly ? 'detail' : value?.id ? 'edit' : 'createRule')"
    width="var(--security-dialog-width)"
    :confirm-btn="
      readOnly ? null : { content: label(value?.id ? 'save' : 'createRule'), loading: saving }
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
        <t-alert v-if="form.built_in" theme="info" :message="label('builtInHelp')" />
        <t-form-item
          :label="label('ruleName')"
          required
          :status="fieldErrors.includes('name') ? 'error' : undefined"
          :tips="fieldErrors.includes('name') ? errorMessage : ''"
          ><t-input v-model="form.name" :maxlength="200" @change="form.seed_key = undefined"
        /></t-form-item>
        <div class="security-grid">
          <t-form-item :label="label('ruleDomain')"
            ><t-input :value="label(form.rule_domain)" readonly /></t-form-item
          ><t-form-item v-if="!security" :label="label('ruleType')"
            ><t-input :value="label('fieldRules')" readonly
          /></t-form-item>
        </div>
        <div class="security-grid">
          <t-form-item :label="label('category')" required
            ><t-select
              v-if="security"
              v-model="form.engine_type"
              :disabled="readOnly || form.built_in"
              :options="choices(engines)"
              @change="engineChanged" /><t-select
              v-else
              v-model="form.category"
              creatable
              filterable
              :disabled="readOnly || form.built_in"
              :options="choices(categories)"
          /></t-form-item>
          <t-form-item :label="label('subCategory')"
            ><t-input v-model="form.sub_category" :disabled="readOnly || form.built_in"
          /></t-form-item>
          <t-form-item :label="label(security ? 'risk' : 'sensitivity')" required
            ><t-select
              v-if="security"
              v-model="form.risk_level"
              :options="choices(risks)" /><t-select
              v-else
              v-model="form.sensitivity_level"
              :options="choices(sensitivities)"
          /></t-form-item>
          <t-form-item :label="label('direction')" required
            ><t-radio-group
              v-model="form.direction"
              :options="choices(['INPUT', 'OUTPUT', 'BOTH'])"
          /></t-form-item>
        </div>
        <p v-if="!security" class="security-help">{{ label('dataHelp') }}</p>
        <template v-if="form.engine_type === 'MALICIOUS_IOC'">
          <t-form-item :label="label('method')"
            ><t-input :value="label('THREAT_INTELLIGENCE')" readonly
          /></t-form-item>
          <t-form-item :label="label('checkCondition')" required
            ><t-checkbox-group
              v-model="form.config.ioc_types"
              :disabled="readOnly || form.built_in"
              :options="['IP', 'DOMAIN', 'URL']"
          /></t-form-item>
        </template>
        <template v-else>
          <t-form-item :label="label('method')" required
            ><t-checkbox-group
              v-if="form.built_in"
              :value="form.config.detection_method"
              :options="choices(['KEYWORD', 'REGEX', 'CLASSIFIER', 'LLM_JUDGE'])"
              disabled /><t-radio-group
              v-else
              :value="method"
              :options="
                choices(
                  security
                    ? ['KEYWORD', 'REGEX', 'LLM_JUDGE']
                    : ['KEYWORD', 'REGEX', 'CLASSIFIER', 'LLM_JUDGE'],
                )
              "
              @change="changeMethod"
          /></t-form-item>
          <t-form-item
            v-if="form.config.detection_method.includes('KEYWORD')"
            :label="label('keywords')"
            required
            ><t-textarea
              :value="form.config.keywords.join('\n')"
              :disabled="readOnly || form.built_in"
              :placeholder="label('eachLine')"
              @change="form.config.keywords = lines($event)"
          /></t-form-item>
          <t-form-item
            v-if="form.config.detection_method.includes('REGEX')"
            :label="label('patterns')"
            required
            ><t-textarea
              :value="form.config.patterns.join('\n')"
              :disabled="readOnly || form.built_in"
              :placeholder="label('eachLine')"
              @change="form.config.patterns = lines($event)"
          /></t-form-item>
          <t-form-item
            v-if="form.config.detection_method.includes('CLASSIFIER')"
            :label="label('entity')"
            required
            ><t-select
              v-model="form.config.entity_type"
              :disabled="readOnly || form.built_in"
              :options="choices(['PERSON', 'ORGANIZATION'])"
          /></t-form-item>
          <t-form-item
            v-if="form.config.detection_method.includes('LLM_JUDGE')"
            :label="label(security ? 'detectionGuide' : 'fieldDescription')"
            required
            ><div class="security-stack">
              <t-textarea
                v-if="security"
                v-model="form.config.detection_guide"
                :disabled="readOnly || form.built_in"
              /><t-textarea
                v-else
                v-model="form.config.field_description"
                :disabled="readOnly || form.built_in"
              />
              <p class="security-help">{{ label('fieldExample') }}</p>
            </div></t-form-item
          >
          <t-form-item
            v-if="method === 'KEYWORD' || method === 'REGEX'"
            :label="label('matchThreshold')"
            ><t-input-number
              v-nonnegative-number
              v-model="form.config.match_threshold"
              :min="1"
              :decimal-places="0"
              :disabled="readOnly || form.built_in"
          /></t-form-item>
          <t-form-item v-else :label="label('threshold')"
            ><t-input-number
              v-nonnegative-number
              v-model="form.config.threshold"
              :min="0"
              :max="1"
              :step="0.01"
              :disabled="readOnly || form.built_in"
          /></t-form-item>
        </template>
        <t-alert v-if="missingAbility" theme="warning" :message="label('capabilityHelp')"
          ><template #operation
            ><t-link @click="showCapability = true">{{ label('configure') }}</t-link></template
          ></t-alert
        >
        <template v-if="!security">
          <t-form-item :label="label('maskMode')" required
            ><t-select
              v-model="form.config.mask_config.mode"
              :options="choices(['FULL_MASK', 'PARTIAL_MASK', 'REPLACE_TEXT'])"
          /></t-form-item>
          <t-form-item
            v-if="form.config.mask_config.mode === 'REPLACE_TEXT'"
            :label="label('replaceText')"
            required
            ><t-input v-model="form.config.mask_config.replace_text"
          /></t-form-item>
          <template v-else
            ><t-form-item :label="label('maskChar')" required
              ><t-input v-model="form.config.mask_config.mask_char" :maxlength="4"
            /></t-form-item>
            <div v-if="form.config.mask_config.mode === 'PARTIAL_MASK'" class="security-grid">
              <t-form-item :label="label('keepPrefix')"
                ><t-input-number
                  v-nonnegative-number
                  v-model="form.config.mask_config.keep_prefix"
                  :min="0"
                  :decimal-places="0" /></t-form-item
              ><t-form-item :label="label('keepSuffix')"
                ><t-input-number
                  v-nonnegative-number
                  v-model="form.config.mask_config.keep_suffix"
                  :min="0"
                  :decimal-places="0"
              /></t-form-item></div
          ></template>
          <p class="security-help">{{ label('maskHelp') }}</p>
        </template>
        <t-form-item :label="label('testText')"
          ><div class="security-stack">
            <t-textarea v-model="testText" :maxlength="100000" /><t-radio-group
              v-model="testDirection"
              :options="choices(['INPUT', 'OUTPUT'])"
            /><t-button
              theme="primary"
              variant="outline"
              :loading="testing"
              :disabled="readOnly || !testText.trim()"
              @click="runTest"
              >{{ label('test') }}</t-button
            >
          </div></t-form-item
        >
        <div v-if="testResult" class="security-group">
          <h3 class="security-heading">
            {{ label('testResult') }}: {{ label(testResult.status) }}
          </h3>
          <p v-if="testResult.reason">{{ label(testResult.reason) }}</p>
          <template v-if="testResult.findings.length"
            ><strong>{{ label('evidence') }}</strong>
            <div v-for="(finding, i) in testResult.findings" :key="i">
              <p class="security-help">
                {{ t('security.position', { start: finding.start, end: finding.end }) }}
              </p>
              <pre class="security-evidence">{{ finding.text }}</pre>
            </div></template
          ><template v-if="testResult.masked_text !== null"
            ><strong>{{ label('maskedText') }}</strong>
            <pre class="security-evidence">{{ testResult.masked_text }}</pre>
          </template>
        </div>
        <t-form-item :label="label('ruleDescription')"
          ><t-textarea v-model="form.description" :maxlength="200"
        /></t-form-item>
        <t-form-item v-if="value?.id" :label="label('status')"
          ><t-switch
            v-model="form.enabled"
            :disabled="readOnly"
            :label="[label('enabled'), label('disabled')]"
        /></t-form-item>
        <t-alert v-if="references.length" theme="warning" :message="label('referenceHelp')"
          ><div class="security-stack">
            <strong>{{ label('references') }}</strong
            ><span v-for="p in references" :key="p.id">{{ name(p) }}</span>
          </div></t-alert
        >
      </t-form>
    </div>
    <CapabilityDialog v-if="showCapability" @close="showCapability = false" />
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  emptyRule,
  ruleReferences,
  saveRule,
  testRule,
  type DetectionRule,
  type Direction,
  type Method,
  type RuleTestResult,
  type SecurityPolicy,
} from '@/api/modules/security'
import { categories, engines, risks, sensitivities, useSecurity } from '../useSecurity'
import CapabilityDialog from './CapabilityDialog.vue'
const props = defineProps<{ security?: boolean; value?: DetectionRule; readOnly?: boolean }>()
const emit = defineEmits<{ close: []; saved: [rule: DetectionRule] }>()
const {
  t,
  label,
  name,
  choices,
  options,
  loadOptions,
  error,
  errorMessage,
  fieldErrors,
  clearErrors,
} = useSecurity()
const form = ref<DetectionRule>(
  props.value ? JSON.parse(JSON.stringify(props.value)) : emptyRule(props.security),
)
if (props.value) form.value.name = name(props.value)
const method = computed(() => form.value.config.detection_method[0]!)
const saving = ref(false),
  testing = ref(false),
  showCapability = ref(false),
  testText = ref(''),
  testDirection = ref<Direction>('INPUT'),
  testResult = ref<RuleTestResult>(),
  references = ref<SecurityPolicy[]>([])
const missingAbility = computed(() =>
  form.value.config.detection_method.some((m) => options.value && !options.value.abilities[m]),
)
const lines = (value: string) =>
  value
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
function changeMethod(value: string | number | boolean) {
  form.value.config.detection_method = [value as Method]
  testResult.value = undefined
}
function engineChanged() {
  form.value.category = form.value.engine_type
  form.value.config.detection_method = [
    form.value.engine_type === 'MALICIOUS_IOC' ? 'THREAT_INTELLIGENCE' : 'KEYWORD',
  ]
}
function payload() {
  const value = JSON.parse(JSON.stringify(form.value)) as DetectionRule
  if (props.value?.seed_key && value.seed_key) value.name = props.value.name
  return value
}
async function save() {
  if (props.readOnly || saving.value) return
  saving.value = true
  clearErrors()
  try {
    const saved = await saveRule(payload())
    void MessagePlugin.success(label('saved'))
    emit('saved', saved)
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
async function runTest() {
  testing.value = true
  testResult.value = undefined
  clearErrors()
  try {
    testResult.value = await testRule(payload(), testText.value, testDirection.value)
  } catch (e) {
    error(e)
  } finally {
    testing.value = false
  }
}
watch(
  () => form.value.name,
  (value, previous) => {
    if (
      !props.value &&
      (!form.value.config.mask_config.replace_text ||
        form.value.config.mask_config.replace_text ===
          t('security.defaultReplacement', { name: previous }))
    )
      form.value.config.mask_config.replace_text = t('security.defaultReplacement', { name: value })
  },
)
watch(
  () => JSON.stringify([form.value.config, form.value.direction]),
  () => {
    testResult.value = undefined
  },
)
onMounted(async () => {
  try {
    await loadOptions()
    if (props.value?.id) references.value = await ruleReferences(props.value.id)
  } catch (e) {
    error(e)
  }
})
</script>
<style scoped>
@import '@/styles/security.css';
</style>
