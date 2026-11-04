<template>
  <t-dialog
    :visible="true"
    :header="label('importTitle')"
    width="var(--security-dialog-width)"
    :confirm-btn="{ content: label('importConfirm'), loading: busy, disabled: !validation?.valid }"
    :cancel-btn="label('cancel')"
    :close-on-overlay-click="false"
    @close="emit('close')"
    @confirm="confirm"
  >
    <div class="security-stack">
      <t-alert theme="info" :message="label('importHelp')" /><t-alert
        v-if="failure"
        theme="error"
        :message="failure"
      />
      <div class="security-toolbar">
        <input
          ref="input"
          type="file"
          accept=".csv,.xlsx"
          class="security-hidden-input"
          @change="fileChanged"
        /><t-button :loading="reading" @click="input?.click()">{{ label('selectFile') }}</t-button
        ><span>{{ filename }}</span
        ><t-button theme="default" @click="template">{{ label('downloadTemplate') }}</t-button
        ><t-button v-if="validation?.invalid" theme="default" @click="failedRows">{{
          label('failedRows')
        }}</t-button>
      </div>
      <template v-if="validation"
        ><strong>{{
          t('security.importSummary', { valid: validation.valid, invalid: validation.invalid })
        }}</strong
        ><t-table
          :data="validation.rows"
          :columns="columns"
          row-key="row"
          :max-height="'var(--security-import-height)'"
          ><template #name="{ row }">{{ sourceRows[row.row - 2]?.name }}</template
          ><template #errors="{ row }">{{
            row.errors.map((code: string) => label(code)).join('; ') || label('configured')
          }}</template></t-table
        ></template
      >
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessagePlugin, type TableProps } from 'tdesign-vue-next'
import { importRules, validateRuleImport, type RuleImportValidation } from '@/api/modules/security'
import { downloadCsv, readRuleFile, ruleHeaders } from '../rules/files'
import { useSecurity } from '../useSecurity'
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, label, error, errorMessage } = useSecurity()
const input = ref<HTMLInputElement>(),
  reading = ref(false),
  busy = ref(false),
  filename = ref(''),
  failure = ref(''),
  validation = ref<RuleImportValidation>(),
  sourceRows = ref<Record<string, string>[]>([])
const columns = computed<TableProps['columns']>(() => [
  { colKey: 'row', title: label('row'), width: 80 },
  { colKey: 'name', title: label('ruleName') },
  { colKey: 'errors', title: label('errors') },
])
async function fileChanged(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  reading.value = true
  failure.value = ''
  validation.value = undefined
  filename.value = file.name
  try {
    sourceRows.value = await readRuleFile(file)
    validation.value = await validateRuleImport(sourceRows.value)
  } catch (e) {
    const code = (e as Error).message
    failure.value = t(`security.${code}`) !== `security.${code}` ? label(code) : label('fileLimit')
  } finally {
    reading.value = false
    ;(event.target as HTMLInputElement).value = ''
  }
}
async function confirm() {
  if (!validation.value || busy.value) return
  busy.value = true
  try {
    const result = await importRules(validation.value.id)
    void MessagePlugin.success(t('security.imported', { n: result.imported }))
    emit('saved')
  } catch (e) {
    error(e)
    failure.value = errorMessage.value
    validation.value = undefined
  } finally {
    busy.value = false
  }
}
function template() {
  downloadCsv('sensitive-field-rules-template.csv', ruleHeaders, [
    [
      'Example project code',
      'FIELD',
      'PRODUCT',
      'PROJECT_CODE',
      'BOTH',
      'KEYWORD',
      '',
      'DEMO-PROJECT',
      '',
      '',
      0.85,
      1,
      JSON.stringify({
        mode: 'REPLACE_TEXT',
        replace_text: '[PROJECT CODE]',
        mask_char: '*',
        keep_prefix: 0,
        keep_suffix: 0,
      }),
      'IMPORTANT',
      'true',
      'Example only',
    ],
  ])
}
function failedRows() {
  if (!validation.value) return
  const failed = validation.value.rows.filter((r) => r.errors.length)
  const headers = Object.keys(sourceRows.value[0] ?? {})
  downloadCsv(
    'rule-import-errors.csv',
    [...headers, 'error'],
    failed.map((r) => [
      ...headers.map((h) => sourceRows.value[r.row - 2]?.[h] ?? ''),
      r.errors.map(label).join('; '),
    ]),
  )
}
</script>
<style scoped>
@import '@/styles/security.css';
</style>
