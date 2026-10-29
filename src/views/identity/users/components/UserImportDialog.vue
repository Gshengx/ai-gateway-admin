<template>
  <t-drawer
    :visible="visible"
    :header="t('users.importDialog.title')"
    size="760px"
    :close-on-overlay-click="false"
    destroy-on-close
    @close="onClose"
  >
    <t-steps :current="stepIndex" class="import-steps">
      <t-step-item :title="t('users.importDialog.steps.upload')" />
      <t-step-item :title="t('users.importDialog.steps.preview')" />
      <t-step-item :title="t('users.importDialog.steps.result')" />
    </t-steps>
    <template v-if="stage === 'upload'">
      <section class="import-upload" :aria-label="t('users.importDialog.uploadTitle')">
        <h3 class="import-upload__title">{{ t('users.importDialog.uploadTitle') }}</h3>
        <p class="import-upload__tip">{{ t('users.importDialog.tip') }}</p>
        <div class="import-upload__actions">
          <t-button variant="outline" :loading="downloadingTemplate" @click="downloadTemplate">
            {{ t('users.importDialog.downloadTemplate', { format: fileFormat.toUpperCase() }) }}
          </t-button>
          <t-upload
            v-model="files"
            accept=".csv,.xlsx"
            theme="custom"
            :auto-upload="false"
            :max="1"
            @change="onFileChange"
          >
            <template #trigger>
              <t-button theme="primary">{{ t('users.importDialog.selectFile') }}</t-button>
            </template>
          </t-upload>
        </div>
        <p class="import-upload__file" :class="{ 'import-upload__file--selected': fileRef }">
          {{ fileRef?.name || t('users.importDialog.noFile') }}
        </p>
        <div class="import-mode">
          <span class="import-mode__label">{{ t('users.importDialog.mode') }}</span>
          <t-radio-group v-model="mode" variant="default-filled">
            <t-radio-button value="SKIP">{{ t('users.importDialog.modeSkip') }}</t-radio-button>
            <t-radio-button value="OVERWRITE">{{
              t('users.importDialog.modeOverwrite')
            }}</t-radio-button>
          </t-radio-group>
        </div>
      </section>
      <t-alert v-if="error" theme="error" :message="error" />
    </template>

    <template v-else-if="stage === 'preview'">
      <t-space :size="20" class="import-summary">
        <span>{{ t('users.importDialog.countsCreate') }}：{{ counts.create }}</span>
        <span class="import-summary__overwrite">
          {{ t('users.importDialog.countsOverwrite') }}：{{ counts.overwrite }}
        </span>
        <span class="import-summary__skip">
          {{ t('users.importDialog.countsSkip') }}：{{ counts.skip }}
        </span>
        <span class="import-summary__invalid">
          {{ t('users.importDialog.countsInvalid') }}：{{ counts.invalid }}
        </span>
      </t-space>
      <p class="import-result__message">
        {{ t('users.importDialog.previewTip', { n: selectedRows.length }) }}
      </p>
      <t-table
        row-key="row_number"
        size="small"
        :data="previewRows"
        :columns="previewColumns"
        :selected-row-keys="selectedRows"
        :row-selectable="isRowSelectable"
        max-height="320"
        @select-change="onSelectChange"
      />
    </template>

    <template v-else>
      <t-space :size="24" class="import-result">
        <span>{{ t('users.importDialog.resultTotal') }}：{{ resultTask?.total_rows ?? 0 }}</span>
        <span class="import-result__created">
          {{ t('users.importDialog.resultCreated') }}：{{ resultTask?.created_count ?? 0 }}
        </span>
        <span class="import-result__overwrite">
          {{ t('users.importDialog.resultOverwritten') }}：{{ resultTask?.overwritten_count ?? 0 }}
        </span>
        <span class="import-result__skip">
          {{ t('users.importDialog.resultSkipped') }}：{{ resultTask?.skipped_count ?? 0 }}
        </span>
        <span class="import-result__failed">
          {{ t('users.importDialog.resultFailed') }}：{{ resultTask?.failed_count ?? 0 }}
        </span>
      </t-space>
      <p class="import-result__message">{{ resultMessage }}</p>
      <t-button
        v-if="resultTask?.state === 'SUCCEEDED' || resultTask?.state === 'PARTIAL'"
        variant="outline"
        :loading="downloadingResult"
        @click="downloadResult"
      >
        {{ t('users.importDialog.downloadResult') }}
      </t-button>
    </template>

    <template #footer>
      <t-space>
        <t-button variant="outline" @click="onClose">
          {{ stage === 'result' ? t('common.close') : t('common.cancel') }}
        </t-button>
        <t-button
          v-if="stage === 'upload'"
          theme="primary"
          :disabled="!fileRef"
          :loading="previewing"
          @click="handlePreview"
        >
          {{ t('users.importDialog.preview') }}
        </t-button>
        <t-button
          v-else-if="stage === 'preview'"
          theme="primary"
          :disabled="!selectedRows.length"
          :loading="confirming"
          @click="handleConfirm"
        >
          {{ t('users.importDialog.confirm') }}
        </t-button>
        <t-button v-else theme="primary" @click="onClose">
          {{ t('users.importDialog.done') }}
        </t-button>
      </t-space>
    </template>
  </t-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PrimaryTableCol, type UploadFile } from 'tdesign-vue-next'
import type { NotifiedError } from '@/api/request'

import {
  confirmUserImportApi,
  downloadUserImportResultApi,
  downloadUserImportTemplateApi,
  getUserImportRowsApi,
  getUserImportTaskApi,
  previewUserImportApi,
  type ImportDuplicateMode,
  type ImportFileFormat,
  type ImportPreviewRow,
  type ImportRowDisposition,
  type ImportTask,
  type ImportTaskState,
  type MockImportRow,
} from '@/api/modules/identity'

interface PreviewRow {
  row_number: number
  username: string
  display_name: string
  department_path: string
  role_name: string
  disposition: ImportRowDisposition
  dispositionLabel: string
  errorText: string
}

type Stage = 'upload' | 'preview' | 'result'

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  imported: []
}>()

const { t, te } = useI18n()
const importErrorText = (code: string) =>
  te('roleErrors.' + code) ? t('roleErrors.' + code) : code

const IS_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
let session = 0
const TERMINAL_STATES: ImportTaskState[] = [
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]

/** CSV 表头别名：兼容中英文模板 */
const HEADER_ALIASES = {
  username: ['username', '用户名'],
  display_name: ['display_name', 'name', '姓名'],
  email: ['email', '邮箱'],
  phone: ['phone', '手机号', '手机'],
  department: ['department', '部门', '所属部门'],
  role: ['role', '角色'],
  password: ['password', '密码'],
}

type ColumnKey = keyof typeof HEADER_ALIASES

const REQUIRED_COLUMNS: ColumnKey[] = ['username', 'display_name', 'department', 'role', 'password']

const stage = ref<Stage>('upload')
const stepIndex = computed(() => ({ upload: 0, preview: 1, result: 2 })[stage.value])
const files = ref<UploadFile[]>([])
const fileRef = ref<File | null>(null)
const fileFormat = ref<ImportFileFormat>('csv')
const mode = ref<ImportDuplicateMode>('SKIP')
const error = ref('')
const previewing = ref(false)
const confirming = ref(false)
const downloadingTemplate = ref(false)
const downloadingResult = ref(false)
const taskId = ref('')
const previewRows = ref<PreviewRow[]>([])
const selectedRows = ref<number[]>([])
const counts = ref({ create: 0, invalid: 0, overwrite: 0, skip: 0 })
const resultTask = ref<ImportTask | null>(null)

const DISPOSITION_KEYS: Record<ImportRowDisposition, string> = {
  CREATE: 'users.importDialog.dispositionCreate',
  OVERWRITE: 'users.importDialog.dispositionOverwrite',
  SKIP: 'users.importDialog.dispositionSkip',
  INVALID: 'users.importDialog.dispositionInvalid',
}

const previewColumns = computed<PrimaryTableCol<PreviewRow>[]>(() => [
  { colKey: 'row_number', title: t('users.importDialog.colRowNumber'), width: 90 },
  { colKey: 'username', title: t('users.importDialog.colUsername'), width: 150 },
  { colKey: 'display_name', title: t('users.importDialog.colDisplayName'), width: 120 },
  {
    colKey: 'department_path',
    title: t('users.importDialog.colDepartment'),
    ellipsis: true,
    width: 180,
  },
  { colKey: 'role_name', title: t('users.importDialog.colRole'), width: 120 },
  { colKey: 'dispositionLabel', title: t('users.importDialog.colDisposition'), width: 110 },
  { colKey: 'errorText', title: t('users.importDialog.colErrors'), ellipsis: true },
])

const resultMessage = computed(() => {
  const task = resultTask.value
  if (!task || !TERMINAL_STATES.includes(task.state)) return t('users.importDialog.stillRunning')
  if (task.state === 'FAILED' && task.last_error_code) {
    return t('users.importDialog.resultFailedWith', { code: importErrorText(task.last_error_code) })
  }
  if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(task.state)) {
    return t('users.importDialog.previewFailed')
  }
  const failed = task.failed_count
  if (failed > 0) {
    return t('users.importDialog.partial', {
      created: resultTask.value?.created_count ?? 0,
      failed,
    })
  }
  return t('users.importDialog.allSuccess')
})

/** 逐字符解析 CSV，支持引号包裹、转义引号与 CRLF */
function parseCsv(text: string): string[][] {
  const table: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r') {
      // 忽略 CR，由 LF 结束行
    } else if (char === '\n') {
      row.push(field)
      table.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    table.push(row)
  }
  return table.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

function parseRows(text: string): { rows: MockImportRow[]; missing: ColumnKey[] } {
  const table = parseCsv(text)
  if (!table.length) return { rows: [], missing: [] }

  const header = table[0].map((cell) => cell.trim().toLowerCase())
  const positions = {} as Record<ColumnKey, number>
  ;(Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach((key) => {
    positions[key] = header.findIndex((cell) => HEADER_ALIASES[key].includes(cell))
  })

  const missing = REQUIRED_COLUMNS.filter((key) => positions[key] < 0)
  if (missing.length) return { rows: [], missing }

  const pick = (cells: string[], key: ColumnKey) => {
    const position = positions[key]
    return position >= 0 ? (cells[position] ?? '').trim() : ''
  }

  const parsed = table.slice(1).map((cells, index) => ({
    line: index + 2,
    username: pick(cells, 'username'),
    display_name: pick(cells, 'display_name'),
    email: pick(cells, 'email') || undefined,
    phone: pick(cells, 'phone') || undefined,
    department: pick(cells, 'department'),
    role: pick(cells, 'role'),
    password: pick(cells, 'password'),
  }))

  return { rows: parsed, missing: [] }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** 轮询任务直到进入期望状态或终态，避免预览/导入尚未完成就读取结果 */
async function pollTask(
  task: ImportTask,
  done: ImportTaskState[],
  interval: number,
  maxAttempts: number,
  currentSession: number,
): Promise<ImportTask | null> {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (currentSession !== session) return null
    if (done.includes(task.state) || TERMINAL_STATES.includes(task.state)) return task
    await delay(interval)
    if (currentSession !== session) return null
    task = await getUserImportTaskApi(task.id)
    if (currentSession !== session) return null
  }
  return task
}

function resetPreview() {
  stage.value = 'upload'
  taskId.value = ''
  previewRows.value = []
  selectedRows.value = []
  counts.value = { create: 0, invalid: 0, overwrite: 0, skip: 0 }
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // 部分浏览器要求 a 标签在文档中才会触发下载；延后释放 URL，避免下载被取消
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function onFileChange(value: UploadFile[]) {
  error.value = ''
  fileRef.value = null
  const file = value[value.length - 1]
  const raw = file?.raw
  if (!raw) return
  if (raw.size > 5 * 1024 * 1024) {
    error.value = t('users.importDialog.fileTooLarge')
    files.value = []
    return
  }
  const extension = raw.name.toLowerCase().split('.').pop()
  if (extension !== 'csv' && extension !== 'xlsx') {
    error.value = t('users.importDialog.formatError')
    files.value = []
    return
  }
  fileRef.value = raw
  fileFormat.value = extension
}

async function downloadTemplate() {
  downloadingTemplate.value = true
  try {
    const blob = await downloadUserImportTemplateApi(fileFormat.value)
    saveBlob(blob, `${t('users.importDialog.templateName')}.${fileFormat.value}`)
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    downloadingTemplate.value = false
  }
}

async function handlePreview() {
  const file = fileRef.value
  if (!file) return
  const currentSession = session
  error.value = ''
  previewing.value = true
  try {
    let mockRows: MockImportRow[] = []
    if (IS_MOCK) {
      if (fileFormat.value !== 'csv') {
        error.value = t('users.importDialog.mockCsvOnly')
        return
      }
      const parsed = parseRows(await file.text())
      if (currentSession !== session) return
      if (parsed.missing.length) {
        error.value = t('users.importDialog.missingColumns', {
          columns: parsed.missing.join(', '),
        })
        return
      }
      if (!parsed.rows.length) {
        error.value = t('users.importDialog.parseEmpty')
        return
      }
      mockRows = parsed.rows
    }

    const initialTask = await previewUserImportApi(file, {
      format: fileFormat.value,
      mode: mode.value,
      mockRows,
    })
    if (currentSession !== session) return
    const task = await pollTask(initialTask, ['PREVIEW_READY'], 800, 30, currentSession)
    if (!task || currentSession !== session) return
    if (task.state !== 'PREVIEW_READY') {
      error.value = task.last_error_code
        ? t('users.importDialog.previewFailedWith', { code: importErrorText(task.last_error_code) })
        : t('users.importDialog.previewFailed')
      return
    }

    const rowsResult = await getUserImportRowsApi(task.id)
    if (currentSession !== session) return
    taskId.value = task.id
    counts.value = rowsResult.preview_counts
    previewRows.value = rowsResult.rows.map((row: ImportPreviewRow) => ({
      row_number: row.row_number,
      username: row.username,
      display_name: row.fields.display_name,
      department_path: row.fields.department_path,
      role_name: row.fields.role_name,
      disposition: row.disposition,
      dispositionLabel: t(DISPOSITION_KEYS[row.disposition]),
      errorText: row.error_codes.map(importErrorText).join(', '),
    }))
    selectedRows.value = rowsResult.rows
      .filter((row) => row.disposition !== 'INVALID')
      .map((row) => row.row_number)
    stage.value = 'preview'
  } catch (error) {
    if (currentSession !== session) return
    const err = error as NotifiedError
    if (err.code === 'IMPORT_PREVIEW_CHANGED') {
      resetPreview()
      if (!err.notified) MessagePlugin.error(t('users.importDialog.previewExpired'))
      return
    }
    // REAUTH_REQUIRED 由拦截器交给调用方提示，其余错误已统一提示
    if ((error as NotifiedError).code === 'REAUTH_REQUIRED') {
      MessagePlugin.error(t('roleErrors.REAUTH_REQUIRED'))
    }
  } finally {
    if (currentSession === session) previewing.value = false
  }
}

function isRowSelectable(row: PreviewRow) {
  return row.disposition !== 'INVALID'
}

function onSelectChange(keys: Array<string | number>) {
  selectedRows.value = keys.map(Number)
}

async function handleConfirm() {
  if (!taskId.value || !selectedRows.value.length) return
  const currentSession = session
  confirming.value = true
  try {
    const initialTask = await confirmUserImportApi(taskId.value, selectedRows.value)
    if (currentSession !== session) return
    const task = await pollTask(initialTask, TERMINAL_STATES, 1500, 120, currentSession)
    if (!task || currentSession !== session) return
    resultTask.value = task
    stage.value = 'result'
    if (task.created_count + task.overwritten_count > 0) emit('imported')
  } catch (error) {
    if (currentSession !== session) return
    const err = error as NotifiedError
    if (err.code === 'IMPORT_PREVIEW_CHANGED') {
      resetPreview()
      if (!err.notified) MessagePlugin.error(t('users.importDialog.previewExpired'))
      return
    }
    if (err.code === 'VALIDATION_FAILED') {
      resetPreview()
      if (!err.notified) MessagePlugin.error(t('users.importDialog.confirmInvalid'))
      return
    }
    // REAUTH_REQUIRED 由拦截器交给调用方提示，其余错误已统一提示
    if ((error as NotifiedError).code === 'REAUTH_REQUIRED') {
      MessagePlugin.error(t('roleErrors.REAUTH_REQUIRED'))
    }
  } finally {
    if (currentSession === session) confirming.value = false
  }
}

async function downloadResult() {
  if (!taskId.value) return
  downloadingResult.value = true
  try {
    const blob = await downloadUserImportResultApi(taskId.value, fileFormat.value)
    saveBlob(blob, `${t('users.importDialog.resultFileName')}.${fileFormat.value}`)
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    downloadingResult.value = false
  }
}

function onClose() {
  session += 1
  previewing.value = false
  confirming.value = false
  emit('update:visible', false)
}

watch(
  () => props.visible,
  (visible) => {
    session += 1
    previewing.value = false
    confirming.value = false
    if (!visible) return
    stage.value = 'upload'
    files.value = []
    fileRef.value = null
    fileFormat.value = 'csv'
    mode.value = 'SKIP'
    error.value = ''
    taskId.value = ''
    previewRows.value = []
    selectedRows.value = []
    counts.value = { create: 0, invalid: 0, overwrite: 0, skip: 0 }
    resultTask.value = null
  },
  { flush: 'sync' },
)
</script>

<style scoped>
.import-steps {
  margin-bottom: var(--td-comp-margin-xl);
}

.import-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--td-comp-paddingTB-xxl) var(--td-comp-paddingLR-xl);
  margin-bottom: var(--td-comp-margin-l);
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-container-hover);
  text-align: center;
}

.import-upload__title {
  margin: 0;
  font: var(--td-font-title-medium);
  font-size: var(--td-font-size-body-large);
  color: var(--td-text-color-primary);
}

.import-upload__tip {
  max-width: 78%;
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}

.import-upload__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--td-comp-margin-s);
}

.import-upload__file {
  max-width: 100%;
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
  overflow-wrap: anywhere;
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-placeholder);
}

.import-upload__file--selected {
  color: var(--td-text-color-secondary);
}

.import-mode {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--td-comp-margin-s);
}

.import-mode__label {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}

.import-summary {
  font-size: var(--td-font-size-body-medium);
  color: var(--td-text-color-primary);
}

.import-summary__overwrite {
  color: var(--td-brand-color);
}

.import-summary__skip {
  color: var(--td-text-color-secondary);
}

.import-summary__invalid {
  color: var(--td-error-color);
}

.import-result {
  font-size: var(--td-font-size-body-medium);
  color: var(--td-text-color-primary);
}

.import-result__created {
  color: var(--td-success-color);
}

.import-result__overwrite {
  color: var(--td-brand-color);
}

.import-result__skip {
  color: var(--td-text-color-secondary);
}

.import-result__failed {
  color: var(--td-error-color);
}

.import-result__message {
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}
</style>
