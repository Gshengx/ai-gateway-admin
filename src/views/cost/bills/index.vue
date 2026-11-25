<template>
  <BillDetail v-if="selectedId" :id="selectedId" @back="back" />
  <t-card
    data-list-region
    v-else
    :bordered="false"
    class="bills"
    :ref="setActionRoot"
    :class="{ 'bills-loading': loading }"
    body-class-name="bill-list-content page-table-layout"
  >
    <div class="page-table-controls">
      <t-tabs v-model="tab" @change="reset"
        ><t-tab-panel value="bills" :label="t('bills.title')" /><t-tab-panel
          value="tasks"
          :label="t('bills.tasks')"
      /></t-tabs>
      <div class="bill-toolbar">
        <FilterBar class="bill-filters"
          ><template #content
            ><div class="list-toolbar">
              <t-select
                v-if="tab === 'bills'"
                class="list-filter"
                v-model="query.periodType"
                :options="enumOptions(['MONTHLY', 'WEEKLY'])"
                :placeholder="t('bills.periodType')"
                clearable
                @change="firstPage"
              />
              <t-select
                class="list-filter"
                v-model="query.scopeType"
                :options="scopeTypes"
                :placeholder="t('bills.scopeType')"
                clearable
                @change="scopeChanged"
              />
              <t-select
                class="list-filter bill-scope-filter"
                v-model="query.scopeId"
                :title="filterScopes.find((s) => s.value === query.scopeId)?.label"
                :options="filterScopes"
                :placeholder="t('bills.scopeName')"
                filterable
                clearable
                @change="firstPage"
              />
              <t-select
                v-if="tab === 'bills'"
                class="list-filter"
                v-model="query.month"
                :options="options.months.map((value) => ({ value, label: value }))"
                :placeholder="t('bills.month')"
                clearable
                @change="firstPage"
              />
              <t-select
                v-else
                class="list-filter"
                v-model="query.status"
                :options="enumOptions(['ACTIVE', 'DISABLED'])"
                :placeholder="t('bills.status')"
                clearable
                @change="firstPage"
              />
              <t-button theme="default" @click="reset">{{ t('bills.reset') }}</t-button>
            </div></template
          ></FilterBar
        >
        <div class="bill-actions">
          <t-button v-permission.write="'cost.bills'" @click="openCreate">{{
            t(tab === 'bills' ? 'bills.generate' : 'bills.newTask')
          }}</t-button>
        </div>
      </div>
    </div>
    <t-table
      :ref="setMinimumTableRoot"
      size="small"
      table-layout="auto"
      row-key="id"
      :data="rows"
      :columns="columns"
      :loading="loading"
      :pagination="{
        current: query.page,
        pageSize: query.page_size,
        total,
        showJumper: true,
        size: 'medium',
      }"
      :sort="sort"
      @page-change="pageChanged"
      @sort-change="sortChanged"
      class="page-table-list"
    >
      <template #periodStart="{ row }"
        ><t-link theme="primary" @click="openBill(row.id)"
          >{{ row.periodStart }} ~ {{ row.periodEnd }}</t-link
        ></template
      >
      <template #periodType="{ row }">{{ t(`bills.${row.periodType}`) }}</template>
      <template #schedule="{ row }">{{
        t(row.periodType === 'MONTHLY' ? 'bills.monthlySchedule' : 'bills.weeklySchedule')
      }}</template>
      <template #scopeType="{ row }"
        ><t-tag variant="light" :theme="scopeTheme(row.scopeType)">{{
          t(`bills.${row.scopeType}`)
        }}</t-tag></template
      >
      <template #scopeName="{ row }"
        ><div>{{ row.scopeName }}</div>
        <small v-if="row.costCenterName && row.scopeType === 'FEE_SUBJECT'"
          >{{ t('bills.COST_CENTER') }}：{{ row.costCenterName }}</small
        ><small v-if="row.scopeType === 'COST_CENTER'">{{
          t('bills.subjectCount', {
            count: options.scopes.find((s) => s.value === row.scopeId)?.subjectCount ?? 0,
          })
        }}</small></template
      >
      <template #totalCost="{ row }"
        ><strong>{{ money(row.totalCost) }}</strong></template
      >
      <template #totalTokens="{ row }">{{ number(row.totalTokens) }}</template>
      <template #status="{ row }"
        ><t-tag
          :theme="
            row.status === 'FAILED'
              ? 'danger'
              : row.status === 'COMPLETED' || row.status === 'ACTIVE'
                ? 'success'
                : 'warning'
          "
          variant="light"
          >{{ t(`bills.${row.status}`) }}</t-tag
        ></template
      >
      <template #generatedAt="{ row }">{{ formatDateTime(row.generatedAt) }}</template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      <template #nextRunAt="{ row }">{{
        row.nextRunAt ? formatDateTime(row.nextRunAt) : '—'
      }}</template>
      <template #emailEnabled="{ row }"
        >{{ t(row.emailEnabled ? 'bills.emailOn' : 'bills.emailOff')
        }}<small v-if="row.emailEnabled">{{ row.emailRecipients.join('、') }}</small></template
      >
      <template #actions="{ row }"
        ><t-space size="small" v-if="tab === 'bills'" class="table-row-actions"
          ><t-link
            hover="color"
            v-permission.write="'cost.bills'"
            :disabled="busy || row.status === 'GENERATING'"
            theme="primary"
            @click="regenerate(row.id)"
            >{{ t('bills.regenerate') }}</t-link
          ><t-link
            hover="color"
            :disabled="row.status !== 'COMPLETED' || busy"
            theme="primary"
            @click="download(row.id)"
            >{{ t('bills.export') }}</t-link
          ></t-space
        ><t-space size="small" v-else class="table-row-actions" v-permission.write="'cost.bills'"
          ><t-link hover="color" theme="primary" @click="editTask(row)">{{
            t('bills.edit')
          }}</t-link
          ><t-link hover="color" theme="primary" :disabled="busy" @click="toggle(row)">{{
            t(row.status === 'ACTIVE' ? 'bills.disable' : 'bills.enable')
          }}</t-link
          ><t-link hover="color" theme="danger" @click="deleting = row">{{
            t('bills.delete')
          }}</t-link></t-space
        ></template
      >
    </t-table>
  </t-card>
  <t-dialog
    :visible="generateVisible"
    :close-on-overlay-click="false"
    :header="t('bills.generateTitle')"
    :confirm-btn="{ content: t('bills.generateNow'), loading: busy }"
    :cancel-btn="t('bills.cancel')"
    @close="generateVisible = false"
    @confirm="generate"
  >
    <t-form class="bill-editor-form" label-align="top" :disabled="busy">
      <p class="bill-generation-notice">{{ t('bills.generateHelp') }}</p>
      <t-form-item :label="t('bills.periodStart')" required
        ><t-radio-group
          v-model="form.periodType"
          :options="enumOptions(['MONTHLY', 'WEEKLY'])"
          @change="form.date = ''"
      /></t-form-item>
      <t-form-item
        :label="t(form.periodType === 'MONTHLY' ? 'bills.selectMonth' : 'bills.selectWeek')"
        required
        ><div class="bill-field-stack">
          <t-date-picker
            v-model="form.date"
            :mode="form.periodType === 'MONTHLY' ? 'month' : 'week'"
            :format="form.periodType === 'MONTHLY' ? 'YYYY-MM' : 'YYYY-MM-DD'"
            :value-type="form.periodType === 'MONTHLY' ? 'YYYY-MM' : 'YYYY-MM-DD'"
            :disable-date="disableFuture"
            :first-day-of-week="1"
            :value-display="form.periodType === 'WEEKLY' && selectedWeek ? weekLabel : undefined"
          />
          <p v-if="form.periodType === 'WEEKLY' && selectedWeek" class="bill-field-hint">
            {{ t('bills.weekRange', selectedWeek) }}
          </p>
        </div></t-form-item
      >
      <t-alert
        v-if="isCurrent"
        theme="info"
        :message="t('bills.cutoff', { date: options.cutoff })"
      />
      <ScopeFields
        v-if="generateVisible"
        v-model:scope-type="form.scopeType"
        v-model:scope-id="form.scopeId"
        :scopes="options.scopes"
      />
      <t-alert v-if="validation" theme="error" :message="validation" />
    </t-form>
  </t-dialog>
  <TaskEditor
    :visible="taskVisible"
    :task="editing"
    :scopes="options.scopes"
    @close="taskVisible = false"
    @saved="load"
  />
  <t-dialog
    :visible="Boolean(deleting)"
    :header="t('bills.delete')"
    :body="t('bills.deleteConfirm', { name: deleting?.scopeName ?? '' })"
    :confirm-btn="{ content: t('bills.delete'), theme: 'danger', loading: busy }"
    :cancel-btn="t('bills.cancel')"
    @close="deleting = null"
    @confirm="remove"
  />
</template>
<script setup lang="ts">
import { useTableViewport } from '@/utils/useTableViewport'
import { computed, onMounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import { useActionColumnWidth } from '@/utils/useActionColumnWidth'
import { useRoute, useRouter } from 'vue-router'
import type { PrimaryTableCol, TableRowData, PageInfo, TableSort } from 'tdesign-vue-next'
import {
  getBillOptions,
  getBills,
  getBillTasks,
  createBill,
  regenerateBill,
  exportBill,
  setBillTaskStatus,
  deleteBillTask,
  type BillQuery,
  type BillInput,
  type BillTask,
} from '@/api/modules/bills'
import { formatDateTime } from '@/utils/datetime'
import { downloadBlob } from '@/utils/download'
import FilterBar from '@/components/FilterBar.vue'
import ScopeFields from './ScopeFields.vue'
import TaskEditor from './TaskEditor.vue'
import BillDetail from './detail.vue'
import '@/styles/cost.css'
import { getBillWeek } from './period'
import { useCost } from '../useCost'
const { setTableRoot: setMinimumTableRoot } = useTableViewport({ minimumOnly: true })

const { t, locale, money, number, error } = useCost(),
  route = useRoute(),
  router = useRouter()
const selectedId = computed(() => String(route.query.bill ?? ''))
const { actionTableRoot, actionColumnWidth } = useActionColumnWidth({
  cellSelector: '.bill-action-cell',
  actionsSelector: '.table-row-actions',
})
function setActionRoot(instance: Element | ComponentPublicInstance | null) {
  const element =
    instance instanceof HTMLElement
      ? instance
      : instance && '$el' in instance
        ? instance.$el
        : undefined
  actionTableRoot.value = element instanceof HTMLElement ? element : undefined
}
const tab = ref('bills'),
  query = reactive<BillQuery>({ page: 1, page_size: 20 }),
  rows = ref<TableRowData[]>([]),
  total = ref(0),
  loading = ref(true),
  busy = ref(false),
  sort = ref<TableSort>()
const options = ref<Awaited<ReturnType<typeof getBillOptions>>>({
  scopes: [],
  billScopes: [],
  taskScopes: [],
  cutoff: '',
  months: [],
})
const generateVisible = ref(false),
  taskVisible = ref(false),
  editing = ref<BillTask | null>(null),
  deleting = ref<BillTask | null>(null),
  validation = ref('')
const form = reactive<BillInput>({
  periodType: 'MONTHLY',
  date: '',
  scopeType: 'DEPARTMENT',
  scopeId: '',
})
function scopeTheme(type: unknown) {
  return type === 'DEPARTMENT' ? 'primary' : type === 'COST_CENTER' ? 'warning' : 'success'
}
const enumOptions = (values: string[]) =>
  values.map((value) => ({ value, label: t(`bills.${value}`) }))
const listScopes = computed(() =>
  tab.value === 'bills' ? options.value.billScopes : options.value.scopes,
)
const scopeTypes = computed(() => enumOptions([...new Set(listScopes.value.map((s) => s.type))]))
const filterScopes = computed(() =>
  listScopes.value.filter((s) => !query.scopeType || s.type === query.scopeType),
)
const columns = computed<PrimaryTableCol<TableRowData>[]>(() =>
  (tab.value === 'bills'
    ? [
        'periodStart',
        'periodType',
        'scopeType',
        'scopeName',
        'totalCost',
        'totalRequests',
        'status',
        'generatedAt',
        'actions',
      ]
    : [
        'schedule',
        'scopeType',
        'scopeName',
        'emailEnabled',
        'status',
        'nextRunAt',
        'createdAt',
        'actions',
      ]
  ).map((colKey) => ({
    colKey,
    title: t(`bills.${colKey}`),
    ...(colKey === 'actions'
      ? { width: actionColumnWidth.value, className: 'bill-action-cell', fixed: 'right' as const }
      : { minWidth: colKey === 'scopeName' || colKey === 'periodStart' ? 200 : 140 }),
    sorter:
      tab.value === 'bills' &&
      ['periodStart', 'totalCost', 'totalTokens', 'totalRequests', 'status'].includes(colKey),
  })),
)
const selectedWeek = computed(() => getBillWeek(form.date))
const weekLabel = computed(() =>
  selectedWeek.value ? t('bills.monthWeek', selectedWeek.value) : '',
)
const isCurrent = computed(() => {
  if (!form.date) return false
  const now = new Date(options.value.cutoff + 'T00:00:00Z')
  now.setUTCDate(now.getUTCDate() + 1)
  const d = new Date(
    form.date.length === 7 ? form.date + '-01T00:00:00Z' : form.date + 'T00:00:00Z',
  )
  if (!Number.isFinite(d.getTime()) || !Number.isFinite(now.getTime())) return false
  return form.periodType === 'MONTHLY'
    ? d.toISOString().slice(0, 7) === now.toISOString().slice(0, 7)
    : Math.floor((d.getTime() + 3 * 864e5) / 6048e5) ===
        Math.floor((now.getTime() + 3 * 864e5) / 6048e5)
})
const disableFuture = (date: Date) =>
  date.getTime() > new Date(options.value.cutoff + 'T23:59:59Z').getTime() + 864e5
let sequence = 0
async function load() {
  const n = ++sequence
  loading.value = true
  try {
    const r = tab.value === 'bills' ? await getBills(query) : await getBillTasks(query)
    if (n === sequence) {
      rows.value = r.items
      total.value = r.total
    }
  } catch (e) {
    error(e)
  } finally {
    if (n === sequence) loading.value = false
  }
}
function scopeChanged() {
  query.scopeId = undefined
  firstPage()
}
function editTask(row: BillTask) {
  editing.value = row
  taskVisible.value = true
}
function firstPage() {
  query.page = 1
  void load()
}
function reset() {
  Object.keys(query).forEach((k) => delete (query as unknown as Record<string, unknown>)[k])
  Object.assign(query, { page: 1, page_size: 20 })
  sort.value = undefined
  void load()
}
function pageChanged(p: PageInfo) {
  query.page = p.current
  query.page_size = p.pageSize
  void load()
}
function sortChanged(s: TableSort) {
  sort.value = s
  const v = Array.isArray(s) ? s[0] : s
  query.sort_by = v?.sortBy
  query.direction = v?.descending ? 'desc' : 'asc'
  firstPage()
}
function openBill(id: string) {
  void router.push({ query: { ...route.query, bill: id } })
}
function back() {
  void router.push({ query: {} })
  void load()
}
function openCreate() {
  if (tab.value === 'tasks') {
    editing.value = null
    taskVisible.value = true
  } else {
    Object.assign(form, {
      periodType: 'MONTHLY',
      date: '',
      scopeType: options.value.scopes[0]?.type ?? 'DEPARTMENT',
      scopeId: '',
    })
    validation.value = ''
    generateVisible.value = true
  }
}
async function generate() {
  if (!form.date || !form.scopeId) {
    validation.value = t('bills.required')
    return
  }
  busy.value = true
  try {
    await createBill(form)
    generateVisible.value = false
    options.value = await getBillOptions()
    await load()
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
async function regenerate(id: string) {
  busy.value = true
  try {
    await regenerateBill(id)
    await load()
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
async function download(id: string) {
  busy.value = true
  try {
    const r = await exportBill(id, { all: true })
    downloadBlob(new Blob([r.content], { type: 'text/csv;charset=utf-8' }), `bill-${id}.csv`)
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
async function toggle(task: BillTask) {
  busy.value = true
  try {
    await setBillTaskStatus(task.id, task.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')
    await load()
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
async function remove() {
  if (!deleting.value) return
  busy.value = true
  try {
    await deleteBillTask(deleting.value.id)
    deleting.value = null
    await load()
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
watch(locale, async () => {
  options.value = await getBillOptions()
  await load()
})
onMounted(async () => {
  try {
    options.value = await getBillOptions()
    await load()
  } catch (e) {
    loading.value = false
    error(e)
  }
})
</script>
<style scoped>
.bills :deep(.t-tabs__nav-item-text-wrapper) {
  font-size: var(--td-font-size-title-medium);
}
.bills {
  overflow: hidden;
}
.bills :deep(> .t-loading__parent),
.bills :deep(.bill-list-content) {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}
.bills :deep(.bill-list-content > .t-tabs),
.bill-toolbar {
  flex-shrink: 0;
}
.bills :deep(.bill-list-content > .t-table) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: var(--page-table-min-height);
}
.bills :deep(.t-table__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.bills :deep(.t-table__pagination-wrap) {
  flex-shrink: 0;
}
.bills.bills-loading :deep(.t-table__content) {
  overflow: hidden;
}
.bills :deep(.t-table .t-loading--full) {
  z-index: var(--td-z-index-popup, 2);
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
}
.bills :deep(.t-table thead) {
  position: sticky;
  top: 0;
  z-index: var(--td-z-index-affix, 1);
}
.bills :deep(.t-table td) {
  padding-top: var(--td-comp-paddingTB-xs);
  padding-bottom: var(--td-comp-paddingTB-xs);
}
.bill-generation-notice {
  margin: 0 0 var(--td-comp-margin-l);
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  background: var(--td-warning-color-light);
  color: var(--td-warning-color);
  border-radius: var(--td-radius-medium);
}

.bill-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--td-comp-margin-l);
}
.bill-filters {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}
.bill-scope-filter {
  width: var(--list-department-width);
  flex-basis: var(--list-department-width);
}
.bill-actions {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.bills :deep(.t-table th),
.bills :deep(.t-table td) {
  white-space: nowrap;
}
.bills :deep(.t-table__content) {
  overflow-x: auto;
}

.bills :deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
small {
  display: block;
  color: var(--td-text-color-secondary);
  margin-top: var(--td-comp-margin-xs);
}
</style>
