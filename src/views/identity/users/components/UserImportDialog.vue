<template>
  <t-drawer
    :visible="visible"
    :header="t('users.importDialog.title')"
    size="1080px"
    :close-on-overlay-click="false"
    destroy-on-close
    @close="onClose"
  >
    <t-steps :current="stepIndex" class="import-steps">
      <t-step-item :title="t('users.importDialog.steps.upload')" />
      <t-step-item :title="t('users.importDialog.steps.preview')" />
      <t-step-item
        :title="t('users.importDialog.steps.result')"
        :status="stage === 'result' ? 'finish' : undefined"
      />
    </t-steps>
    <template v-if="stage === 'upload' || previewNeedsUpload">
      <section class="import-upload">
        <h3>{{ t('users.importDialog.uploadTitle') }}</h3>
        <p class="import-upload__tip">{{ t('users.importDialog.tip') }}</p>
        <div class="import-upload__actions">
          <t-dropdown trigger="click" :disabled="downloadingTemplate">
            <t-button variant="outline" :loading="downloadingTemplate"
              >{{ t('users.importDialog.downloadTemplate')
              }}<template #suffix><t-icon name="chevron-down" /></template
            ></t-button>
            <t-dropdown-menu>
              <t-dropdown-item @click="downloadTemplate('csv')">{{
                t('users.importDialog.templateCsv')
              }}</t-dropdown-item>
              <t-dropdown-item @click="downloadTemplate('xlsx')">{{
                t('users.importDialog.templateXlsx')
              }}</t-dropdown-item>
            </t-dropdown-menu>
          </t-dropdown>
          <t-upload
            v-model="files"
            accept=".csv,.xlsx"
            theme="custom"
            :auto-upload="false"
            :max="1"
            :disabled="previewing"
            @change="onFileChange"
          >
            <template #trigger
              ><t-button theme="primary">{{
                t('users.importDialog.selectFile')
              }}</t-button></template
            >
          </t-upload>
        </div>
        <p class="import-upload__file">
          {{ fileRef?.name || t('users.importDialog.noFileSelected') }}
        </p>
      </section>
      <div v-if="stage === 'upload'" class="import-mode">
        <span>{{ t('users.importDialog.modeHint') }}</span>
        <t-radio-group v-model="mode" variant="default-filled" :disabled="previewing">
          <t-radio-button value="SKIP">{{ t('users.importDialog.modeSkip') }}</t-radio-button>
          <t-radio-button value="OVERWRITE">{{
            t('users.importDialog.modeOverwrite')
          }}</t-radio-button>
        </t-radio-group>
      </div>
      <p v-if="stage === 'upload' && mode === 'OVERWRITE'" class="import-tip">
        {{ t('users.importDialog.overwriteHelp') }}
      </p>
      <t-alert v-if="error" theme="error" :message="error" class="import-block" />
    </template>
    <section
      v-if="(stage === 'preview' && !previewNeedsUpload) || stage === 'result'"
      class="import-block import-content"
    >
      <h3>
        {{
          t(
            stage === 'preview'
              ? counts.invalid > 0
                ? 'users.importDialog.validationFailedTitle'
                : 'users.importDialog.validationTitle'
              : 'users.importDialog.resultTitle',
          )
        }}
      </h3>
      <div class="import-summary">
        <span
          >{{ t('users.importDialog.countsCreate') }}
          {{ t('users.importDialog.countUnit', { n: displayCounts.create }) }}</span
        >
        <span
          >{{ t('users.importDialog.countsOverwrite') }}
          {{ t('users.importDialog.countUnit', { n: displayCounts.overwrite }) }}</span
        >
        <span
          >{{ t('users.importDialog.countsSkip') }}
          {{ t('users.importDialog.countUnit', { n: displayCounts.skip }) }}</span
        >
        <span
          >{{ t('users.importDialog.countsInvalid') }}
          {{ t('users.importDialog.countUnit', { n: displayCounts.invalid }) }}</span
        >
        <t-button
          v-if="stage === 'preview' && canDownloadErrors"
          class="import-summary__download"
          variant="outline"
          size="small"
          :loading="downloadingFailures"
          @click="downloadFailures"
          >{{ t('users.importDialog.downloadFailedRecords') }}</t-button
        >
      </div>
      <t-table
        v-if="stage === 'preview' && counts.invalid > 0"
        row-key="row_number"
        :data="previewRows"
        :columns="previewColumns"
        :pagination="previewPagination"
        @page-change="onPreviewPageChange"
      >
        <template #errorText="{ row }"
          ><span class="import-validation__error">{{ row.errorText }}</span></template
        >
      </t-table>
      <t-alert
        v-else
        :theme="stage === 'preview' ? 'success' : resultAlert.theme"
        :message="
          stage === 'preview' ? t('users.importDialog.noValidationError') : resultAlert.message
        "
      />
      <p class="import-tip">{{ t('users.importDialog.previewFooterTip') }}</p>
    </section>
    <section v-if="stage === 'running'" class="import-running">
      <t-loading />
      <h3>{{ t('users.importDialog.runningTitle') }}</h3>
      <p>{{ t('users.importDialog.runningSubtitle') }}</p>
      <div class="import-progress"><div /></div>
      <p>{{ t('users.importDialog.runningHint') }}</p>
      <t-alert v-if="queryError" theme="warning" :message="queryError" />
      <t-button v-if="queryError && taskId" variant="outline" @click="refreshTask">{{
        t('users.importDialog.continueQuery')
      }}</t-button>
    </section>
    <t-alert v-if="queryError && stage !== 'running'" theme="warning" :message="queryError" />
    <template #footer>
      <t-space v-if="stage !== 'running'">
        <t-button v-if="queryError && taskId" variant="outline" @click="refreshTask">{{
          t('users.importDialog.continueQuery')
        }}</t-button>
        <t-button
          v-if="stage !== 'result'"
          variant="outline"
          :disabled="confirming"
          @click="onClose"
          >{{
            stage === 'preview' ? t('users.importDialog.cancelLater') : t('common.cancel')
          }}</t-button
        >
        <t-button
          v-if="stage === 'upload' || previewNeedsUpload"
          theme="primary"
          :disabled="!fileRef"
          :loading="previewing"
          @click="handlePreview"
          >{{ t('users.importDialog.preview') }}</t-button
        >
        <t-button
          v-else-if="stage === 'preview'"
          theme="primary"
          :disabled="accepted || !canConfirm"
          :loading="confirming"
          @click="handleConfirm"
          >{{ t('users.importDialog.confirmImport') }}</t-button
        >
        <t-button v-else theme="primary" @click="onClose">{{
          t('users.importDialog.done')
        }}</t-button>
      </t-space>
    </template>
  </t-drawer>
  <t-dialog
    v-model:visible="leaveVisible"
    theme="warning"
    :header="t('users.importDialog.leaveTitle')"
    :body="t('users.importDialog.leaveBody')"
    :confirm-btn="t('users.importDialog.leave')"
    :cancel-btn="t('users.importDialog.keepWaiting')"
    @confirm="closeDrawer"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { createIdempotencyKey } from '@/api/request'
import { useI18n } from 'vue-i18n'
import {
  MessagePlugin,
  type PageInfo,
  type PrimaryTableCol,
  type UploadFile,
} from 'tdesign-vue-next'
import type { NotifiedError } from '@/api/request'

import {
  confirmUserImportApi,
  downloadUserImportFailuresApi,
  downloadUserImportTemplateApi,
  getUserImportRowsApi,
  getUserImportTaskApi,
  previewUserImportApi,
  type ImportDuplicateMode,
  type ImportFileFormat,
  type ImportPreviewRow,
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
  errorText: string
}
type Stage = 'upload' | 'preview' | 'running' | 'result'

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  imported: []
}>()

const { t, te } = useI18n()
const importErrorText = (code: string) =>
  te('roleErrors.' + code)
    ? t('roleErrors.' + code)
    : `${t('users.importDialog.unknownError')} (${code})`

const IS_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
let session = 0
const TERMINAL_STATES: ImportTaskState[] = [
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]

/** CSV 模板字段 */
const HEADER_ALIASES = {
  username: ['username'],
  display_name: ['display_name'],
  department_path: ['department_path'],
  role_name: ['role_name'],
  email: ['email'],
  phone: ['phone'],
  initial_password: ['initial_password'],
}

type ColumnKey = keyof typeof HEADER_ALIASES

const REQUIRED_COLUMNS: ColumnKey[] = [
  'username',
  'display_name',
  'department_path',
  'role_name',
  'initial_password',
]

const stage = ref<Stage>('upload')
const stepIndex = computed(() => ({ upload: 0, preview: 1, running: 2, result: 2 })[stage.value])
const files = ref<UploadFile[]>([])
const fileRef = ref<File | null>(null)
const fileFormat = ref<ImportFileFormat>('csv')
const mode = ref<ImportDuplicateMode>('SKIP')
const error = ref('')
const previewing = ref(false)
const confirming = ref(false)
const downloadingTemplate = ref(false)
const downloadingFailures = ref(false)
const leaveVisible = ref(false)
const taskId = ref('')
const taskState = ref<ImportTaskState | null>(null)
const accepted = ref(false)
const queryError = ref('')
let controller = new AbortController()
let uploadCommand: { signature: string; key: string } | null = null
let confirmCommand: { signature: string; key: string } | null = null
const previewRows = ref<PreviewRow[]>([])
const previewCapabilities = ref<{ can_confirm?: boolean; can_download_errors?: boolean }>({})
const previewNeedsUpload = computed(() => stage.value === 'preview' && !taskId.value)
const previewCurrent = ref(1)
const previewPageSize = ref(20)
const previewPagination = computed(() => ({
  current: previewCurrent.value,
  pageSize: previewPageSize.value,
  total: previewRows.value.length,
  showJumper: true,
  pageSizeOptions: [10, 20, 50],
}))
const counts = ref({ create: 0, invalid: 0, overwrite: 0, skip: 0 })
const resultTask = ref<ImportTask | null>(null)
const displayCounts = computed(() =>
  stage.value === 'result'
    ? {
        create: resultTask.value?.created_count ?? 0,
        overwrite: resultTask.value?.overwritten_count ?? 0,
        skip: resultTask.value?.skipped_count ?? 0,
        invalid: resultTask.value?.failed_count ?? 0,
      }
    : counts.value,
)
/** 仅有失败记录时不可导入 */
const importable = computed(
  () => counts.value.create + counts.value.overwrite + counts.value.skip > 0,
)
const canConfirm = computed(() => previewCapabilities.value.can_confirm ?? importable.value)
const canDownloadErrors = computed(
  () => previewCapabilities.value.can_download_errors ?? counts.value.invalid > 0,
)
const resultAlert = computed(() => {
  if (taskState.value === 'FAILED') {
    const code = resultTask.value?.last_error_code
    return {
      theme: 'error' as const,
      message: code
        ? t('users.importDialog.previewFailedWith', { code: importErrorText(code) })
        : t('users.importDialog.previewFailed'),
    }
  }
  if (taskState.value === 'CANCELLED' || taskState.value === 'EXPIRED') {
    return {
      theme: 'warning' as const,
      message: t(
        taskState.value === 'CANCELLED'
          ? 'users.importDialog.cancelled'
          : 'users.importDialog.expired',
      ),
    }
  }
  return displayCounts.value.invalid > 0
    ? {
        theme: 'warning' as const,
        message: t('users.importDialog.resultHasFailure', { failed: displayCounts.value.invalid }),
      }
    : { theme: 'success' as const, message: t('users.importDialog.resultNoFailure') }
})
const previewColumns = computed<PrimaryTableCol<PreviewRow>[]>(() => [
  { colKey: 'row_number', title: t('users.importDialog.colRowNumber') },
  { colKey: 'username', title: t('users.importDialog.colUsername') },
  { colKey: 'display_name', title: t('users.importDialog.colDisplayName') },
  { colKey: 'department_path', title: t('users.importDialog.colDepartment') },
  { colKey: 'role_name', title: t('users.importDialog.colRole') },
  { colKey: 'errorText', title: t('users.importDialog.colValidationResult'), cell: 'errorText' },
])

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
    department_path: pick(cells, 'department_path'),
    role_name: pick(cells, 'role_name'),
    initial_password: pick(cells, 'initial_password'),
  }))

  return { rows: parsed, missing: [] }
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'))
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

async function pollTask(
  task: ImportTask,
  done: ImportTaskState[],
  maxAttempts: number,
  currentSession: number,
): Promise<ImportTask | null> {
  const signal = controller.signal
  for (let i = 0; i < maxAttempts; i += 1) {
    if (currentSession !== session || signal.aborted) return null
    taskState.value = task.state
    resultTask.value = task
    if (done.includes(task.state) || TERMINAL_STATES.includes(task.state)) return task
    await delay(2000, signal)
    try {
      task = await getUserImportTaskApi(task.id, signal)
    } catch (e) {
      if ((e as NotifiedError).code === 'AUTHENTICATION_BUSY') continue
      throw e
    }
  }
  if (!signal.aborted && currentSession === session)
    queryError.value = t('users.importDialog.queryTimeout')
  return null
}

async function showTask(task: ImportTask, currentSession: number) {
  if (currentSession !== session || controller.signal.aborted) return
  taskId.value = task.id
  taskState.value = task.state
  resultTask.value = task
  if (TERMINAL_STATES.includes(task.state)) {
    if (!accepted.value && ['FAILED', 'CANCELLED', 'EXPIRED'].includes(task.state)) {
      resetPreview()
      stage.value = 'preview'
      error.value =
        task.state === 'FAILED'
          ? task.last_error_code
            ? t('users.importDialog.previewFailedWith', {
                code: importErrorText(task.last_error_code),
              })
            : t('users.importDialog.previewFailed')
          : t(`users.importDialog.${task.state === 'CANCELLED' ? 'cancelled' : 'expired'}`)
      return
    }
    stage.value = 'result'
    if (task.created_count + task.overwritten_count > 0) emit('imported')
    return
  }
  if (task.state !== 'PREVIEW_READY') return
  const rowsResult = await getUserImportRowsApi(task.id, controller.signal)
  if (currentSession !== session || controller.signal.aborted) return
  if (task.total_rows === 0) {
    resetPreview()
    stage.value = 'preview'
    error.value = t('users.importDialog.previewNoData')
    return
  }
  counts.value = rowsResult.preview_counts
  previewCapabilities.value = {
    can_confirm: rowsResult.can_confirm,
    can_download_errors: rowsResult.can_download_errors,
  }
  previewRows.value = rowsResult.rows.map((row: ImportPreviewRow) => ({
    row_number: row.row_number,
    username: row.username,
    display_name: row.fields.display_name,
    department_path: row.fields.department_path,
    role_name: row.fields.role_name,
    errorText: row.errors?.length
      ? row.errors.map((item) => item.message).join(', ')
      : row.error_codes.map(importErrorText).join(', '),
  }))
  previewCurrent.value = 1
  stage.value = 'preview'
}

async function refreshTask() {
  if (!taskId.value || previewing.value || confirming.value) return
  const currentSession = session
  queryError.value = ''
  previewing.value = true
  try {
    const task = await getUserImportTaskApi(taskId.value, controller.signal)
    const ready = await pollTask(task, ['PREVIEW_READY'], 120, currentSession)
    if (ready) await showTask(ready, currentSession)
  } catch (e) {
    if (currentSession === session && !controller.signal.aborted)
      handleTaskError(e as NotifiedError)
  } finally {
    if (currentSession === session) previewing.value = false
  }
}

function handleTaskError(err: NotifiedError) {
  if (stage.value === 'running') {
    queryError.value = t('users.importDialog.queryFailed')
    return
  }
  if (
    ['FORBIDDEN', 'OUT_OF_SCOPE', 'RESOURCE_DISABLED', 'NOT_FOUND'].includes(err.code ?? '') ||
    err.status === 404
  ) {
    resetPreview()
    error.value = importErrorText(err.code ?? 'NOT_FOUND')
  } else {
    queryError.value = t('users.importDialog.queryFailed')
  }
}

function resetPreview() {
  stage.value = 'upload'
  taskId.value = ''
  taskState.value = null
  accepted.value = false
  queryError.value = ''
  previewRows.value = []
  previewCapabilities.value = {}
  previewCurrent.value = 1
  counts.value = { create: 0, invalid: 0, overwrite: 0, skip: 0 }
  resultTask.value = null
  error.value = ''
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
  if (stage.value === 'preview') {
    resetPreview()
    mode.value = 'SKIP'
  }
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

async function downloadTemplate(format: ImportFileFormat) {
  if (downloadingTemplate.value) return
  downloadingTemplate.value = true
  try {
    if (IS_MOCK && format === 'xlsx') {
      MessagePlugin.error(t('users.importDialog.mockXlsxUnsupported'))
      return
    }
    const currentSession = session
    const blob = await downloadUserImportTemplateApi(format)
    if (currentSession !== session || !props.visible) return
    saveBlob(blob, `${t('users.importDialog.templateName')}.${format}`)
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
        resetPreview()
        stage.value = 'preview'
        error.value = t('users.importDialog.previewNoData')
        return
      }
      mockRows = parsed.rows
    }

    const signature = JSON.stringify([
      file.name,
      file.size,
      file.lastModified,
      fileFormat.value,
      mode.value,
    ])
    if (!uploadCommand || uploadCommand.signature !== signature)
      uploadCommand = { signature, key: createIdempotencyKey() }
    const initialTask = await previewUserImportApi(
      file,
      {
        format: fileFormat.value,
        mode: mode.value,
        mockRows,
      },
      uploadCommand.key,
    )
    if (currentSession !== session) return
    taskId.value = initialTask.id
    taskState.value = initialTask.state
    resultTask.value = initialTask
    const task = await pollTask(initialTask, ['PREVIEW_READY'], 30, currentSession)
    if (task) await showTask(task, currentSession)
  } catch (error) {
    if (currentSession !== session) return
    const err = error as NotifiedError
    if (taskId.value) {
      handleTaskError(err)
      return
    }
  } finally {
    if (currentSession === session) previewing.value = false
  }
}

function onPreviewPageChange(pageInfo: PageInfo) {
  previewCurrent.value = pageInfo.pageSize !== previewPageSize.value ? 1 : pageInfo.current
  previewPageSize.value = pageInfo.pageSize
}

async function handleConfirm() {
  if (confirming.value || accepted.value || !taskId.value || !canConfirm.value) return
  const signature = taskId.value
  if (!confirmCommand || confirmCommand.signature !== signature)
    confirmCommand = { signature, key: createIdempotencyKey() }
  const currentSession = session
  confirming.value = true
  try {
    const initialTask = await confirmUserImportApi(taskId.value, confirmCommand.key)
    if (currentSession !== session || controller.signal.aborted) return
    accepted.value = true
    stage.value = 'running'
    taskState.value = initialTask.state
    resultTask.value = initialTask
    const task = await pollTask(initialTask, TERMINAL_STATES, 120, currentSession)
    if (task) await showTask(task, currentSession)
  } catch (e) {
    if (currentSession !== session || controller.signal.aborted) return
    const err = e as NotifiedError
    if (err.code === 'IMPORT_PREVIEW_CHANGED') {
      accepted.value = true
      try {
        const task = await getUserImportTaskApi(taskId.value, controller.signal)
        if (currentSession !== session || controller.signal.aborted) return
        taskState.value = task.state
        resultTask.value = task
        if (task.state === 'PREVIEW_READY')
          MessagePlugin.error(t('users.importDialog.previewExpired'))
        else if (TERMINAL_STATES.includes(task.state)) await showTask(task, currentSession)
        else {
          queryError.value = t('users.importDialog.queryFailed')
        }
      } catch (queryErr) {
        if (currentSession === session && !controller.signal.aborted) {
          resetPreview()
          error.value = importErrorText((queryErr as NotifiedError).code ?? 'NOT_FOUND')
        }
      }
    } else if (err.code === 'PASSWORD_POLICY_CHANGED') {
      resetPreview()
      error.value = t('users.importDialog.policyChanged')
    } else if (
      ['FORBIDDEN', 'OUT_OF_SCOPE', 'RESOURCE_DISABLED', 'NOT_FOUND'].includes(err.code ?? '') ||
      err.status === 404
    ) {
      handleTaskError(err)
    } else if (accepted.value) {
      handleTaskError(err)
    } else if (!err.notified) MessagePlugin.error(importErrorText(err.code ?? 'VALIDATION_FAILED'))
  } finally {
    if (currentSession === session) confirming.value = false
  }
}

async function downloadFailures() {
  if (!taskId.value) return
  const currentSession = session
  downloadingFailures.value = true
  try {
    const blob = await downloadUserImportFailuresApi(taskId.value)
    if (currentSession === session && props.visible)
      saveBlob(blob, `${t('users.importDialog.failedRowsFileName')}.csv`)
  } catch {
    // Request errors are handled by the interceptor.
  } finally {
    downloadingFailures.value = false
  }
}

function onClose() {
  if (confirming.value && stage.value !== 'running') return
  if (stage.value === 'running') {
    leaveVisible.value = true
    return
  }
  closeDrawer()
}

function closeDrawer() {
  leaveVisible.value = false
  controller.abort()
  session += 1
  previewing.value = false
  confirming.value = false
  emit('update:visible', false)
}

watch(
  () => props.visible,
  (visible) => {
    controller.abort()
    controller = new AbortController()
    session += 1
    previewing.value = false
    confirming.value = false
    previewCapabilities.value = {}
    if (!visible) return
    stage.value = 'upload'
    files.value = []
    fileRef.value = null
    fileFormat.value = 'csv'
    mode.value = 'SKIP'
    error.value = ''
    taskId.value = ''
    taskState.value = null
    accepted.value = false
    queryError.value = ''
    uploadCommand = null
    confirmCommand = null
    previewRows.value = []
    previewCurrent.value = 1
    previewPageSize.value = 20
    counts.value = { create: 0, invalid: 0, overwrite: 0, skip: 0 }
    resultTask.value = null
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  controller.abort()
  session += 1
})
</script>

<style scoped>
.import-steps,
.import-block {
  margin-bottom: var(--td-comp-margin-l);
}
.import-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container-hover);
  text-align: center;
  margin-bottom: var(--td-comp-margin-l);
}
.import-upload h3,
.import-content h3,
.import-running h3 {
  margin: 0;
}
.import-upload__tip {
  max-width: 78%;
  color: var(--td-text-color-secondary);
}
.import-upload__actions,
.import-mode,
.import-summary {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-l);
}
.import-upload__file,
.import-tip,
.import-running p {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.import-mode {
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-container-hover);
  margin-bottom: var(--td-comp-margin-l);
}
.import-content {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.import-summary__download {
  margin-left: auto;
}
.import-validation__error {
  color: var(--td-error-color);
  overflow-wrap: anywhere;
}
.import-tip {
  margin: 0;
}
.import-running {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--td-comp-margin-l);
  min-height: 50vh;
}
.import-running p {
  margin: 0;
}
.import-progress {
  width: 50%;
  overflow: hidden;
  background: var(--td-bg-color-container-hover);
  border-radius: var(--td-radius-medium);
}
.import-progress div {
  width: 30%;
  height: var(--td-comp-margin-xs);
  background: var(--td-brand-color);
  animation: progress 2s linear infinite;
}
@keyframes progress {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(340%);
  }
}
</style>
