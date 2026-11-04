<template>
  <t-dialog
    :visible="true"
    :header="label(value?.id ? 'edit' : 'createRule')"
    width="var(--security-dialog-width)"
    :confirm-btn="
      readOnly ? null : { content: label(value?.id ? 'save' : 'createRule'), loading: saving }
    "
    :cancel-btn="label(readOnly ? 'confirm' : 'cancel')"
    :close-on-overlay-click="false"
    @close="emit('close')"
    @confirm="save"
  >
    <div class="security-dialog-body">
      <t-form class="security-form" label-align="top" :disabled="readOnly" @submit="save">
        <t-alert v-if="errorMessage" theme="error" :message="errorMessage" />
        <t-form-item :label="label('ruleName')" required
          ><t-input v-model="form.name" :maxlength="200" @change="form.seed_key = undefined"
        /></t-form-item>
        <div class="security-grid">
          <t-form-item :label="label('ruleType')"
            ><t-input :value="label('documentRules')" readonly /></t-form-item
          ><t-form-item :label="label('subCategory')"
            ><t-select
              v-model="form.sub_category"
              creatable
              filterable
              :options="choices(documentKinds)" /></t-form-item
          ><t-form-item :label="label('sensitivity')"
            ><t-select
              v-model="form.sensitivity_level"
              :options="choices(sensitivities)" /></t-form-item
          ><t-form-item :label="label('direction')"
            ><t-radio-group
              v-model="form.direction"
              :options="choices(['INPUT', 'OUTPUT', 'BOTH'])"
          /></t-form-item>
        </div>
        <p class="security-help">{{ label('dataHelp') }}</p>
        <t-form-item :label="label('documentSummary')" required
          ><t-textarea v-model="guide.summary" :autosize="{ minRows: 2, maxRows: 5 }"
        /></t-form-item>
        <t-form-item :label="label('keyIndicators')" required
          ><div class="security-stack">
            <t-textarea
              :value="guide.key_indicators.join('\n')"
              @change="guide.key_indicators = lines($event)"
            />
            <p class="security-help">{{ label('documentEvidenceHelp') }}</p>
          </div></t-form-item
        >
        <t-form-item :label="label('supportingIndicators')"
          ><t-textarea
            :value="guide.supporting_indicators.join('\n')"
            @change="guide.supporting_indicators = lines($event)"
        /></t-form-item>
        <t-form-item :label="label('structuralHints')"
          ><t-textarea
            :value="guide.structural_hints.join('\n')"
            @change="guide.structural_hints = lines($event)"
        /></t-form-item>
        <t-form-item :label="label('decisionGuidance')" required
          ><t-textarea v-model="guide.decision_guidance"
        /></t-form-item>
        <t-form-item :label="label('negativeGuide')"
          ><t-textarea v-model="form.config.negative_guide"
        /></t-form-item>
        <section class="security-stack">
          <h3 class="security-heading">{{ label('sensitiveFields') }}</h3>
          <div
            v-for="(field, index) in form.config.sensitive_fields"
            :key="index"
            class="security-group"
          >
            <div class="security-grid">
              <t-form-item :label="label('fieldName')"
                ><t-input v-model="field.field_name" /></t-form-item
              ><t-form-item :label="label('description')"
                ><t-input v-model="field.description" /></t-form-item
              ><t-form-item :label="label('maskMode')"
                ><t-select
                  v-model="field.mask_config.mode"
                  :options="choices(['FULL_MASK', 'PARTIAL_MASK', 'REPLACE_TEXT'])" /></t-form-item
              ><t-form-item
                v-if="field.mask_config.mode === 'REPLACE_TEXT'"
                :label="label('replaceText')"
                ><t-input v-model="field.mask_config.replace_text" /></t-form-item
              ><t-form-item v-else :label="label('maskChar')"
                ><t-input v-model="field.mask_config.mask_char" :maxlength="4"
              /></t-form-item>
            </div>
            <div v-if="field.mask_config.mode === 'PARTIAL_MASK'" class="security-grid">
              <t-form-item :label="label('keepPrefix')"
                ><t-input-number
                  v-model="field.mask_config.keep_prefix"
                  :min="0"
                  :max="100" /></t-form-item
              ><t-form-item :label="label('keepSuffix')"
                ><t-input-number v-model="field.mask_config.keep_suffix" :min="0" :max="100"
              /></t-form-item>
            </div>
            <t-button
              v-if="!readOnly"
              theme="default"
              @click="form.config.sensitive_fields?.splice(index, 1)"
              >{{ label('remove') }}</t-button
            >
          </div>
          <t-button v-if="!readOnly" theme="default" @click="addField">{{
            label('addField')
          }}</t-button>
        </section>
        <t-form-item :label="label('documentThreshold')"
          ><t-input-number v-model="form.config.threshold" :min="0" :max="1" :step="0.05"
        /></t-form-item>
        <t-alert theme="info" :message="label('mockEvaluation')" />
        <t-form-item :label="label('testText')"
          ><t-textarea v-model="positive" :autosize="{ minRows: 4, maxRows: 10 }"
        /></t-form-item>
        <div class="security-inline">
          <input
            ref="testFile"
            class="security-hidden-input"
            type="file"
            @change="readTestFile"
          /><t-button theme="default" @click="testFile?.click()">{{
            label('selectTestFile')
          }}</t-button>
        </div>
        <t-form-item :label="label('negativeTest')"><t-textarea v-model="negative" /></t-form-item>
        <div class="security-inline">
          <t-button :loading="testing" theme="default" @click="runTest">{{
            label('testDocument')
          }}</t-button
          ><span>{{ passed ? label('basicTestPassed') : label('basicTestRequired') }}</span>
        </div>
        <div v-if="results.length" class="security-stack">
          <div v-for="(result, index) in results" :key="index" class="security-group">
            <strong
              >{{ label(index ? 'negativeTest' : 'testText') }} · {{ label(result.status) }}</strong
            ><span
              >{{ label('confidence') }} {{ Math.round((result.confidence ?? 0) * 100) }}%</span
            >
            <p>{{ result.evidence?.join('、') }}</p>
            <t-alert
              v-if="result.reason === 'maskFailed'"
              theme="error"
              :message="label('maskFailed')"
            />
            <pre v-if="result.masked_text !== null" class="security-evidence">{{
              result.masked_text
            }}</pre>
          </div>
        </div>
        <t-form-item :label="label('ruleDescription')"
          ><t-textarea v-model="form.description"
        /></t-form-item>
      </t-form>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { saveRule, testRule, type DetectionRule, type RuleTestResult } from '@/api/modules/security'
import { documentKinds, documentRule } from '@/api/mock/securityDocument'
import { sensitivities, useSecurity } from '../useSecurity'
const props = defineProps<{ value?: DetectionRule; readOnly?: boolean }>()
const emit = defineEmits<{ close: []; saved: [rule: DetectionRule] }>()
const { label, name, choices, error, errorMessage, locale } = useSecurity()
const form = ref<DetectionRule>(
  props.value ? JSON.parse(JSON.stringify(props.value)) : documentRule(2, locale.value === 'en-US'),
)
if (props.value) form.value.name = name(props.value)
const guide = computed(() => form.value.config.identification_guide!)
const positive = ref(''),
  negative = ref(label('negativeCandidate')),
  results = ref<RuleTestResult[]>([])
const testFile = ref<HTMLInputElement>()
const saving = ref(false),
  testing = ref(false),
  passed = ref(!!form.value.config.basic_test_passed)
const lines = (value: string) =>
  value
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
watch(
  () =>
    JSON.stringify([
      form.value.config.identification_guide,
      form.value.config.negative_guide,
      form.value.config.sensitive_fields,
      form.value.config.threshold,
      form.value.direction,
      positive.value,
      negative.value,
    ]),
  () => {
    passed.value = false
    results.value = []
  },
)
function addField() {
  form.value.config.sensitive_fields ??= []
  form.value.config.sensitive_fields.push({
    field_name: '',
    description: '',
    mask_config: {
      mode: 'REPLACE_TEXT',
      mask_char: '*',
      keep_prefix: 0,
      keep_suffix: 0,
      replace_text: '[REDACTED]',
    },
  })
}
function payload() {
  const value = JSON.parse(JSON.stringify(form.value)) as DetectionRule
  if (props.value?.seed_key && value.seed_key) value.name = props.value.name
  value.config.basic_test_passed = passed.value
  return value
}
async function readTestFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 1024 * 1024 || !/\.(txt|csv)$/iu.test(file.name)) {
    void MessagePlugin.warning(label('testFileUnsupported'))
    return
  }
  try {
    positive.value = await file.text()
  } catch (e) {
    error(e)
  }
}
async function runTest() {
  if (!positive.value.trim() || !negative.value.trim()) {
    void MessagePlugin.warning(label('testRequired'))
    return
  }
  testing.value = true
  try {
    const rule = payload()
    rule.enabled = false
    const values = await Promise.all([
      testRule(rule, positive.value, form.value.direction === 'OUTPUT' ? 'OUTPUT' : 'INPUT'),
      testRule(rule, negative.value, form.value.direction === 'OUTPUT' ? 'OUTPUT' : 'INPUT'),
    ])
    results.value = values
    passed.value =
      values[0]!.status === 'MATCHED' &&
      values[0]!.reason !== 'maskFailed' &&
      values[1]!.status === 'NOT_MATCHED'
  } catch (e) {
    error(e)
  } finally {
    testing.value = false
  }
}
async function save() {
  if (props.readOnly || saving.value) return
  saving.value = true
  try {
    const rule = payload()
    if (!passed.value) rule.enabled = false
    const saved = await saveRule(rule)
    void MessagePlugin.success(label('saved'))
    emit('saved', saved)
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
</script>
<style scoped>
@import '@/styles/security.css';
</style>
