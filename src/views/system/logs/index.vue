<template>
  <section class="system-logs">
    <div class="logs-heading">
      <t-tabs v-model="tab" :theme="'normal'" :list="tabs" />
      <t-button
        v-permission.write="'system.settings'"
        theme="default"
        variant="outline"
        @click="openConfig"
      >
        <template #icon><setting-icon /></template>{{ t('logs.config') }}
      </t-button>
    </div>
    <filter-bar class="logs-filter">
      <template #content>
        <div class="logs-filter-row">
          <t-select v-model="filters.range" :options="ranges" :aria-label="t('logs.timeRange')" />
          <template v-if="filters.range === 'custom'">
            <t-date-picker
              v-model="filters.start"
              :placeholder="t('logs.start')"
              :aria-label="t('logs.start')"
              allow-input
              clearable
            />
            <span>{{ t('logs.to') }}</span>
            <t-date-picker
              v-model="filters.end"
              :placeholder="t('logs.end')"
              :aria-label="t('logs.end')"
              allow-input
              clearable
            />
          </template>
          <template v-if="tab === 'operation'">
            <t-input
              v-model="filters.actor"
              class="logs-search"
              :placeholder="t('logs.actorSearch')"
              clearable
            />
            <t-select
              v-model="filters.module"
              clearable
              :options="moduleOptions"
              :placeholder="t('logs.allModules')"
              :aria-label="t('logs.module')"
            />
            <t-select
              v-model="filters.action"
              clearable
              :options="operationOptions"
              :placeholder="t('logs.allOperations')"
              :aria-label="t('logs.operation')"
            />
            <t-select
              v-model="filters.resource_type"
              clearable
              :options="resourceOptions"
              :placeholder="t('logs.allResources')"
              :aria-label="t('logs.resourceType')"
            />
            <t-select
              v-model="filters.outcome"
              :options="outcomeOptions"
              :aria-label="t('logs.outcome')"
            />
          </template>
          <template v-else>
            <t-select
              v-model="filters.level"
              clearable
              :options="levelOptions"
              :placeholder="t('logs.allLevels')"
              :aria-label="t('logs.level')"
            />
            <t-select
              v-model="filters.source"
              clearable
              :options="sourceOptions"
              :placeholder="t('logs.allSources')"
              :aria-label="t('logs.logSource')"
            />
            <t-select
              v-model="filters.node_id"
              :options="nodeOptions"
              :aria-label="t('logs.node')"
            />
            <t-input
              v-model="filters.keyword"
              class="logs-search"
              :placeholder="t('logs.messageSearch')"
              clearable
            />
          </template>
          <t-button theme="default" variant="base" @click="reset">{{ t('logs.reset') }}</t-button>
          <t-button
            v-if="tab === 'operation'"
            v-permission.write="'audit.management'"
            class="logs-export"
            theme="default"
            variant="outline"
            :loading="exporting"
            :disabled="!!dateError"
            @click="exportLogs"
          >
            <template #icon><download-icon /></template>{{ t('logs.export') }}
          </t-button>
        </div>
      </template>
    </filter-bar>
    <t-alert v-if="dateError" theme="warning" :message="dateError" />
    <t-alert v-if="failed" theme="error" :message="t('logs.loadFailed')">
      <template #operation
        ><t-link @click="load">{{ t('logs.retry') }}</t-link></template
      >
    </t-alert>
    <t-table
      height="var(--stable-table-height)"
      :key="tab"
      :data="rows"
      :columns="columns"
      :row-key="tab === 'operation' ? 'event_id' : 'id'"
      :loading="loading"
      :pagination="pagination"
      :class="{ 'stable-table--pending-footer': (loading || failed) && !rows.length }"
      :hover="true"
      :empty="
        failed
          ? t('logs.loadFailed')
          : t(tab === 'operation' ? 'logs.emptyOperation' : 'logs.emptyRuntime')
      "
      @page-change="changePage"
      @row-click="onRowClick"
    >
      <template #occurred_at="{ row }">{{ timestamp(row.occurred_at) }}</template>
      <template #actor="{ row }">{{ actor(row) }}</template>
      <template #role="{ row }">{{
        row.prototype ? t(`logs.roles.${row.prototype.role}`) : '—'
      }}</template>
      <template #operation="{ row }"
        ><span class="operation-mark" :class="operationClass(row)"
          ><span class="operation-symbol">{{ operationSymbol(row) }}</span
          >{{ operationName(row) }}</span
        ></template
      >
      <template #module="{ row }">{{
        row.prototype ? t(`logs.modules.${row.prototype.module}`) : '—'
      }}</template>
      <template #object="{ row }">{{
        row.prototype?.resource_name || row.target_display_name_snapshot || row.resource_id || '—'
      }}</template>
      <template #description="{ row }">{{
        row.prototype?.description || row.reason || row.action
      }}</template>
      <template #outcome="{ row }"
        ><span class="log-outcome" :class="outcomeStatus(row.outcome)"
          ><span aria-hidden="true">●</span>{{ t(`logs.outcomes.${row.outcome}`) }}</span
        ></template
      >
      <template #level="{ row }"
        ><t-tag :theme="levelTheme(row.level)" variant="light" size="small">{{
          row.level
        }}</t-tag></template
      >
      <template #source="{ row }">{{ t(`logs.sources.${row.source}`) }}</template>
    </t-table>

    <t-drawer
      v-model:visible="detailVisible"
      :header="t(tab === 'operation' ? 'logs.operationDetail' : 'logs.runtimeDetail')"
      :size="'var(--system-log-drawer-width)'"
      :footer="false"
      :close-on-esc-keydown="true"
    >
      <t-loading :loading="detailLoading" class="logs-detail-loading">
        <template v-if="operationDetail && tab === 'operation'">
          <div class="logs-detail-summary">
            <span class="operation-mark" :class="operationClass(operationDetail)"
              ><span class="operation-symbol">{{ operationSymbol(operationDetail) }}</span
              >{{ operationName(operationDetail) }}</span
            >
            <span class="log-outcome" :class="outcomeStatus(operationDetail.outcome)"
              ><span aria-hidden="true">●</span
              >{{ t(`logs.outcomes.${operationDetail.outcome}`) }}</span
            >
          </div>
          <section class="logs-detail-section">
            <h3>{{ t('logs.basic') }}</h3>
            <dl>
              <template v-for="item in operationBasic" :key="item[0]"
                ><dt>{{ item[0] }}</dt>
                <dd>{{ item[1] }}</dd></template
              >
            </dl>
          </section>
          <section class="logs-detail-section">
            <h3>{{ t('logs.operationInfo') }}</h3>
            <dl>
              <template v-for="item in operationInfo" :key="item[0]"
                ><dt>{{ item[0] }}</dt>
                <dd>{{ item[1] }}</dd></template
              >
            </dl>
          </section>
          <section v-if="operationDetail.prototype?.error" class="logs-detail-section">
            <h3>{{ t('logs.error') }}</h3>
            <t-alert theme="error" :message="operationDetail.prototype.error" />
          </section>
          <section class="logs-detail-section">
            <h3>{{ t('logs.details') }}</h3>
            <p>{{ t('logs.parameters') }}</p>
            <pre>{{ json(operationDetail.prototype?.parameters ?? {}) }}</pre>
          </section>
          <section v-if="operationDetail.changes.length" class="logs-detail-section">
            <h3>{{ t('logs.changes') }}</h3>
            <t-table row-key="field" :data="operationDetail.changes" :columns="changeColumns"
              ><template #before="{ row }">
                <pre>{{ json(row.before) }}</pre></template
              ><template #after="{ row }">
                <pre>{{ json(row.after) }}</pre>
              </template></t-table
            >
          </section>
        </template>
        <template v-if="runtimeDetail && tab === 'runtime'">
          <div class="logs-detail-summary">
            <t-tag :theme="levelTheme(runtimeDetail.level)" variant="light">{{
              runtimeDetail.level
            }}</t-tag
            ><span>{{ t(`logs.sources.${runtimeDetail.source}`) }}</span
            ><time>{{ timestamp(runtimeDetail.occurred_at) }}</time>
          </div>
          <section class="logs-detail-section">
            <h3>{{ t('logs.basic') }}</h3>
            <dl>
              <template v-for="item in runtimeBasic" :key="item[0]"
                ><dt>{{ item[0] }}</dt>
                <dd>{{ item[1] }}</dd></template
              >
            </dl>
          </section>
          <section class="logs-detail-section">
            <h3>{{ t('logs.message') }}</h3>
            <p>{{ runtimeDetail.message }}</p>
          </section>
          <section class="logs-detail-section">
            <div class="logs-context-heading">
              <h3>{{ t('logs.context') }}</h3>
              <t-button theme="default" variant="outline" size="small" @click="copyContext">{{
                t('logs.copy')
              }}</t-button>
            </div>
            <pre>{{ json(runtimeDetail.context) }}</pre>
          </section>
        </template>
      </t-loading>
    </t-drawer>
    <t-dialog
      :visible="configVisible"
      @close="!saving && (configVisible = false)"
      :close-btn="!saving"
      :close-on-overlay-click="!saving"
      :header="t('logs.configTitle')"
      :width="'var(--system-log-config-width)'"
      :confirm-btn="{
        content: t('logs.save'),
        loading: saving,
        disabled: configLoading || configFailed || !retentionValid,
      }"
      :cancel-btn="{ content: t('logs.cancel'), disabled: saving }"
      :close-on-esc-keydown="!saving"
      @confirm="saveConfig"
    >
      <LoadingState
        :loading="configLoading"
        preserve-content
        :failed="configFailed"
        retryable
        @retry="openConfig"
      >
        <t-form :disabled="saving" label-align="top">
          <t-form-item :label="t('logs.operationDays')" :help="t('logs.operationRange')"
            ><t-space
              ><t-input-number
                v-model="draft.operation_days"
                :min="180"
                :max="730"
                :decimal-places="0"
                :aria-label="t('logs.operationDays')"
              /><span>{{ t('logs.days') }}</span></t-space
            ></t-form-item
          >
          <t-form-item :label="t('logs.runtimeDays')" :help="t('logs.runtimeRange')"
            ><t-space
              ><t-input-number
                v-model="draft.runtime_days"
                :min="30"
                :max="365"
                :decimal-places="0"
                :aria-label="t('logs.runtimeDays')"
              /><span>{{ t('logs.days') }}</span></t-space
            ></t-form-item
          >
        </t-form>
      </LoadingState>
    </t-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import { MessagePlugin, type TableProps, type PageInfo } from 'tdesign-vue-next'
import { DownloadIcon, SettingIcon } from 'tdesign-icons-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import { formatDateTime } from '@/utils/datetime'
import { copyText } from '@/utils/clipboard'
import {
  getManagementLogs,
  getManagementLog,
  getRuntimeLogs,
  getRuntimeLog,
  getLogOptions,
  getLogRetention,
  saveLogRetention,
  exportManagementLogs,
  type ManagementLog,
  type RuntimeLog,
  type LogQuery,
  type LogOptions,
} from '@/api/modules/systemLogs'
import type { NotifiedError } from '@/api/request'

const { t } = useI18n()
const tab = ref('operation')
const tabs = computed(() => [
  { value: 'operation', label: t('logs.operationTab') },
  { value: 'runtime', label: t('logs.runtimeTab') },
])
const defaults = () => ({
  range: 'day',
  start: '',
  end: '',
  actor: '',
  module: '',
  action: '',
  resource_type: '',
  outcome: '',
  level: '',
  source: '',
  node_id: '',
  keyword: '',
})
const filters = reactive(defaults())
const options = ref<LogOptions>({
  modules: [],
  operations: [],
  resource_types: [],
  levels: [],
  sources: [],
  nodes: [],
})
const translated = (values: string[], group: string) =>
  values.map((value) => ({ value, label: t(`logs.${group}.${value}`) }))
const ranges = computed(() =>
  ['hour', 'day', 'week', 'custom'].map((value) => ({ value, label: t(`logs.${value}`) })),
)
const moduleOptions = computed(() => translated(options.value.modules, 'modules'))
const operationOptions = computed(() => translated(options.value.operations, 'operations'))
const resourceOptions = computed(() =>
  options.value.resource_types.map((value) => ({ value, label: value })),
)
const outcomeOptions = computed(() => [
  { value: '', label: t('logs.allOutcomes') },
  ...translated(['SUCCEEDED', 'FAILED', 'REJECTED'], 'outcomes'),
])
const levelOptions = computed(() => options.value.levels.map((value) => ({ value, label: value })))
const sourceOptions = computed(() => translated(options.value.sources, 'sources'))
const nodeOptions = computed(() => [
  { value: '', label: t('logs.allNodes') },
  ...options.value.nodes,
])
const dateError = computed(() =>
  filters.range !== 'custom'
    ? ''
    : !filters.start || !filters.end
      ? t('logs.selectDates')
      : filters.start > filters.end
        ? t('logs.invalidDates')
        : '',
)
const rows = ref<Array<ManagementLog | RuntimeLog>>([])
const loading = ref(true),
  failed = ref(false)
const page = ref(1),
  pageSize = ref(50),
  total = ref(0)
const windowBounds = ref({ from: '', to: '' })
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  pageSizeOptions: [20, 50, 100],
  showJumper: true,
}))
const columns = computed<TableProps['columns']>(() =>
  tab.value === 'operation'
    ? [
        { colKey: 'occurred_at', title: t('logs.time'), width: 210 },
        { colKey: 'actor', title: t('logs.actor'), width: 150 },
        { colKey: 'role', title: t('logs.role'), width: 135 },
        { colKey: 'operation', title: t('logs.operation'), width: 125 },
        { colKey: 'module', title: t('logs.module'), width: 145 },
        { colKey: 'object', title: t('logs.object'), width: 190, ellipsis: true },
        { colKey: 'description', title: t('logs.description'), ellipsis: true },
        { colKey: 'outcome', title: t('logs.outcome'), width: 110 },
      ]
    : [
        { colKey: 'occurred_at', title: t('logs.runtimeTime'), width: 230 },
        { colKey: 'level', title: t('logs.level'), width: 120 },
        { colKey: 'source', title: t('logs.source'), width: 150 },
        { colKey: 'node_name', title: t('logs.node'), width: 220 },
        { colKey: 'message', title: t('logs.message'), ellipsis: true },
      ],
)
const changeColumns = computed(() =>
  ['field', 'before', 'after'].map((colKey) => ({ colKey, title: t(`logs.${colKey}`) })),
)
function timestamp(value: string) {
  const base = formatDateTime(value)
  return tab.value === 'runtime'
    ? `${base}.${String(new Date(value).getMilliseconds()).padStart(3, '0')}`
    : base
}
function actor(row: ManagementLog) {
  const name = row.actor_display_name_snapshot
  const username = row.actor_username_snapshot
  return name && username ? `${name} (${username})` : name || username || '—'
}
const operationName = (row: ManagementLog) =>
  row.prototype ? t(`logs.operations.${row.prototype.operation}`) : row.action
const operationClass = (row: ManagementLog) => ({
  'is-create': row.prototype?.operation === 'create',
  'is-update': row.prototype?.operation === 'update',
  'is-delete': row.prototype?.operation === 'delete',
})
const operationSymbol = (row: ManagementLog) =>
  ({ create: '+', update: '↻', delete: '−', login: '↗', logout: '↙', disable: '×' })[
    row.prototype?.operation ?? ''
  ] ?? '•'
const outcomeStatus = (value: string) =>
  value === 'SUCCEEDED' ? 'success' : value === 'FAILED' ? 'error' : 'warning'
const levelTheme = (value: string) =>
  value === 'ERROR' || value === 'CRITICAL'
    ? 'danger'
    : value === 'WARNING'
      ? 'warning'
      : value === 'INFO'
        ? 'primary'
        : 'default'
const json = (value: unknown) => JSON.stringify(value, null, 2)
function notify(error: unknown) {
  if (!(error as NotifiedError).notified) MessagePlugin.error(t('logs.loadFailed'))
}
function setWindow() {
  if (filters.range === 'custom') {
    if (dateError.value) return
    const end = new Date(`${filters.end}T00:00:00`)
    end.setDate(end.getDate() + 1)
    windowBounds.value = {
      from: new Date(`${filters.start}T00:00:00`).toISOString(),
      to: end.toISOString(),
    }
  } else {
    const end = new Date()
    const hours = filters.range === 'hour' ? 1 : filters.range === 'week' ? 168 : 24
    windowBounds.value = {
      from: new Date(end.getTime() - hours * 3600000).toISOString(),
      to: end.toISOString(),
    }
  }
}
function query(): LogQuery {
  const common = { ...windowBounds.value, page: page.value, page_size: pageSize.value }
  const fields =
    tab.value === 'operation'
      ? (['actor', 'module', 'action', 'resource_type', 'outcome'] as const)
      : (['level', 'source', 'node_id', 'keyword'] as const)
  return Object.assign(
    common,
    Object.fromEntries(
      fields.filter((key) => filters[key]).map((key) => [key, filters[key].trim()]),
    ),
  )
}
let listVersion = 0
async function load() {
  const version = ++listVersion
  failed.value = false
  if (dateError.value) {
    rows.value = []
    total.value = 0
    loading.value = false
    return
  }
  loading.value = true
  try {
    const result =
      tab.value === 'operation' ? await getManagementLogs(query()) : await getRuntimeLogs(query())
    if (version !== listVersion) return
    rows.value = result.items
    total.value = result.total
    if ('window_from' in result)
      windowBounds.value = { from: result.window_from, to: result.window_to }
  } catch (error) {
    if (version === listVersion) {
      rows.value = []
      total.value = 0
      failed.value = true
      notify(error)
    }
  } finally {
    if (version === listVersion) loading.value = false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(filters, () => {
  loading.value = true
  failed.value = false
  clearTimeout(timer)
  ++listVersion
  page.value = 1
  setWindow()
  timer = setTimeout(load, 200)
})
watch(tab, () => {
  detailVisible.value = false
  reset()
})
function reset() {
  clearTimeout(timer)
  Object.assign(filters, defaults())
  page.value = 1
  setWindow()
  timer = setTimeout(load, 0)
}
function changePage(info: PageInfo) {
  clearTimeout(timer)
  page.value = info.pageSize !== pageSize.value ? 1 : info.current
  pageSize.value = info.pageSize
  load()
}
const detailVisible = ref(false),
  detailLoading = ref(false)
const operationDetail = ref<ManagementLog | null>(null),
  runtimeDetail = ref<RuntimeLog | null>(null)
let detailVersion = 0
const onRowClick: NonNullable<TableProps['onRowClick']> = ({ row }) => {
  openDetail(row as ManagementLog | RuntimeLog)
}
watch(detailVisible, (visible) => {
  if (!visible) {
    ++detailVersion
    detailLoading.value = false
  }
})
async function openDetail(row: ManagementLog | RuntimeLog) {
  const version = ++detailVersion
  operationDetail.value = null
  runtimeDetail.value = null
  detailVisible.value = true
  detailLoading.value = true
  try {
    if ('event_id' in row) {
      const result = await getManagementLog(row.event_id)
      if (version === detailVersion) operationDetail.value = result
    } else {
      const result = await getRuntimeLog(row.id)
      if (version === detailVersion) runtimeDetail.value = result
    }
  } catch (error) {
    if (version === detailVersion) {
      detailVisible.value = false
      notify(error)
    }
  } finally {
    if (version === detailVersion) detailLoading.value = false
  }
}
const operationBasic = computed(() => {
  const r = operationDetail.value
  return r
    ? [
        [t('logs.time'), timestamp(r.occurred_at)],
        [t('logs.actor'), actor(r)],
        [t('logs.role'), r.prototype ? t(`logs.roles.${r.prototype.role}`) : '—'],
        [t('logs.clientIp'), r.prototype?.client_ip || '—'],
        [t('logs.userAgent'), r.prototype?.user_agent || '—'],
      ]
    : []
})
const operationInfo = computed(() => {
  const r = operationDetail.value
  return r
    ? [
        [t('logs.operation'), operationName(r)],
        [t('logs.module'), r.prototype ? t(`logs.modules.${r.prototype.module}`) : '—'],
        [t('logs.resourceType'), r.resource_type],
        [t('logs.resourceId'), r.resource_id || '—'],
        [t('logs.resourceName'), r.prototype?.resource_name || '—'],
        [t('logs.description'), r.prototype?.description || r.reason || r.action],
        [t('logs.outcome'), t(`logs.outcomes.${r.outcome}`)],
      ]
    : []
})
const runtimeBasic = computed(() => {
  const r = runtimeDetail.value
  return r
    ? [
        [t('logs.runtimeTime'), timestamp(r.occurred_at)],
        [t('logs.level'), r.level],
        [t('logs.source'), t(`logs.sources.${r.source}`)],
        [t('logs.nodeId'), r.node_id],
        [t('logs.nodeName'), r.node_name],
        [t('logs.component'), r.component],
      ]
    : []
})
async function copyContext() {
  if (runtimeDetail.value) {
    const ok = await copyText(json(runtimeDetail.value.context))
    MessagePlugin[ok ? 'success' : 'error'](t(ok ? 'logs.copySuccess' : 'logs.copyFailed'))
  }
}
const configVisible = ref(false),
  saving = ref(false)
const configLoading = ref(false),
  configFailed = ref(false)
let configVersion = 0
const draft = reactive({ operation_days: 365, runtime_days: 90 })
const retentionValid = computed(
  () =>
    Number.isInteger(draft.operation_days) &&
    draft.operation_days >= 180 &&
    draft.operation_days <= 730 &&
    Number.isInteger(draft.runtime_days) &&
    draft.runtime_days >= 30 &&
    draft.runtime_days <= 365,
)
watch(configVisible, (visible) => {
  if (!visible) {
    ++configVersion
    configLoading.value = false
  }
})
async function openConfig() {
  const version = ++configVersion
  configVisible.value = true
  configLoading.value = true
  configFailed.value = false
  try {
    const result = await getLogRetention()
    if (version !== configVersion || !configVisible.value) return
    Object.assign(draft, result)
    configVisible.value = true
  } catch (error) {
    if (version !== configVersion || !configVisible.value) return
    configFailed.value = true
    notify(error)
  } finally {
    if (version === configVersion) configLoading.value = false
  }
}
async function saveConfig() {
  if (configLoading.value || configFailed.value || !retentionValid.value || saving.value) return
  saving.value = true
  try {
    await saveLogRetention({ ...draft })
    configVisible.value = false
    MessagePlugin.success(t('logs.saved'))
  } catch (error) {
    notify(error)
  } finally {
    saving.value = false
  }
}
const exporting = ref(false)
async function exportLogs() {
  if (dateError.value || exporting.value) return
  exporting.value = true
  try {
    const { page: _page, page_size: _size, ...params } = query()
    void _page
    void _size
    const items = await exportManagementLogs(params)
    const csvCell = (value: string) =>
      `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`
    const header = [
      'time',
      'actor',
      'role',
      'operation',
      'module',
      'object',
      'description',
      'outcome',
    ].map((key) => t(`logs.${key}`))
    const lines = items.map((r) => [
      timestamp(r.occurred_at),
      actor(r),
      r.prototype ? t(`logs.roles.${r.prototype.role}`) : '—',
      operationName(r),
      r.prototype ? t(`logs.modules.${r.prototype.module}`) : '—',
      r.prototype?.resource_name || r.resource_id || '—',
      r.prototype?.description || r.action,
      t(`logs.outcomes.${r.outcome}`),
    ])
    const url = URL.createObjectURL(
      new Blob(
        ['\uFEFF' + [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n')],
        { type: 'text/csv;charset=utf-8' },
      ),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'operation-logs.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    MessagePlugin.success(t('logs.exported'))
  } catch (error) {
    notify(error)
  } finally {
    exporting.value = false
  }
}
onMounted(async () => {
  setWindow()
  load()
  try {
    options.value = await getLogOptions()
  } catch (error) {
    notify(error)
  }
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  ++listVersion
  ++detailVersion
  ++configVersion
})
</script>

<style scoped>
.system-logs {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  max-width: var(--system-log-page-width);
  margin: 0 auto;
  min-width: 0;
}
.logs-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--td-component-border);
  margin-bottom: var(--td-comp-margin-l);
  gap: var(--td-comp-margin-l);
}
.logs-heading :deep(.t-tabs) {
  flex: 1;
  min-width: 0;
}
.logs-filter {
  margin-bottom: var(--td-comp-margin-l);
}
.logs-filter :deep(.t-card__body) {
  padding: 0;
}
.logs-filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--td-comp-margin-s);
}
.logs-filter-row :deep(.t-select__wrap),
.logs-filter-row :deep(.t-date-picker) {
  width: var(--system-log-filter-width);
}
.logs-filter-row .logs-search {
  width: var(--system-log-search-width);
}
.logs-export {
  margin-left: auto;
}
.system-logs > :deep(.t-alert) {
  margin-bottom: var(--td-comp-margin-l);
}
.system-logs :deep(.t-table__content) {
  overflow-x: auto;
}
.system-logs :deep(.t-table) {
  min-width: var(--system-log-table-width);
}
.system-logs :deep(.t-table tbody tr) {
  cursor: pointer;
}
.system-logs :deep(.t-pagination) {
  margin-top: var(--td-comp-margin-l);
}
.log-outcome {
  display: inline-flex;
  align-items: center;
  gap: var(--td-comp-margin-xs);
}
.log-outcome.success {
  color: var(--td-success-color);
}
.log-outcome.error {
  color: var(--td-error-color);
}
.log-outcome.warning {
  color: var(--td-warning-color);
}
.log-outcome > span {
  font-size: var(--td-font-size-body-small);
}
.system-logs :deep(.t-table th) {
  background: var(--td-bg-color-secondarycontainer);
}
.operation-mark {
  display: inline-flex;
  align-items: center;
  gap: var(--td-comp-margin-xs);
  color: var(--td-text-color-secondary);
}
.operation-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--td-comp-size-xxxs);
  height: var(--td-comp-size-xxxs);
  border-radius: var(--td-radius-circle);
  background: var(--td-bg-color-secondarycontainer);
  font-size: var(--td-font-size-body-small);
}
.is-create {
  color: var(--td-success-color);
}
.is-create .operation-symbol {
  background: var(--td-success-color-light);
}
.is-update {
  color: var(--td-brand-color);
}
.is-update .operation-symbol {
  background: var(--td-brand-color-light);
}
.is-delete {
  color: var(--td-error-color);
}
.is-delete .operation-symbol {
  background: var(--td-error-color-light);
}
.logs-detail-loading {
  width: 100%;
  min-height: var(--td-comp-size-xxxl);
}
.logs-detail-summary {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-l);
  margin-bottom: var(--td-comp-margin-l);
}
.logs-detail-summary time {
  margin-left: auto;
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.logs-detail-section {
  margin-bottom: var(--td-comp-margin-l);
}
.logs-detail-section h3 {
  font-size: var(--td-font-size-title-small);
  font-weight: var(--td-font-weight-600);
  margin: 0 0 var(--td-comp-margin-m);
}
.logs-detail-section dl {
  display: grid;
  grid-template-columns: var(--system-log-label-width) minmax(0, 1fr);
  gap: var(--td-comp-margin-m);
  margin: 0;
}
.logs-detail-section dt {
  color: var(--td-text-color-secondary);
}
.logs-detail-section dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.logs-detail-section p {
  margin: 0 0 var(--td-comp-margin-s);
  overflow-wrap: anywhere;
}
.logs-detail-section pre {
  margin: 0;
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
  font-size: var(--td-font-size-body-small);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.logs-context-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--td-comp-margin-s);
}
</style>
