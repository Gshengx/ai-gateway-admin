<template>
  <t-card
    data-list-region
    :bordered="false"
    class="expenses"
    :class="{ 'expenses-loading': loading }"
    body-class-name="expense-list-content page-table-layout"
  >
    <div class="page-table-controls">
      <div class="heading">
        <div>
          <h3>{{ t('expenses.title') }}</h3>
          <p class="hint">{{ t('expenses.intro') }}</p>
        </div>
        <t-space>
          <t-popup
            v-model:visible="columnsVisible"
            trigger="click"
            placement="bottom-right"
            @visible-change="columnPopupChanged"
          >
            <t-button theme="default">{{ t('expenses.columns') }}</t-button>
            <template #content
              ><div class="column-settings">
                <div class="column-settings-head">
                  <strong>{{ t('expenses.columns') }}</strong
                  ><t-link theme="primary" @click="restoreColumns">{{
                    t('expenses.restore')
                  }}</t-link>
                </div>
                <t-checkbox-group
                  v-model="selectedFields"
                  class="column-settings-grid"
                  @change="saveColumns"
                  ><t-checkbox
                    v-for="value in allFields"
                    :key="value"
                    :value="value"
                    :disabled="selectedFields.length === 1 && selectedFields.includes(value)"
                    >{{ t(`expenses.${value}`) }}</t-checkbox
                  ></t-checkbox-group
                >
                <small>{{ t('expenses.columnsHint') }}</small>
              </div></template
            >
          </t-popup>
          <t-button theme="primary" @click="exportVisible = true">{{
            t('expenses.export')
          }}</t-button>
        </t-space>
      </div>
      <FilterBar
        ><template #content
          ><div class="filters list-toolbar">
            <t-input
              class="list-search"
              v-model="query.search"
              :placeholder="t('expenses.search')"
              clearable
              @enter="firstPage"
              @clear="firstPage"
            /><DepartmentSelect
              class="list-department"
              v-model="department"
              :load-departments="loadDepartments"
              :resolve-descendants="false"
              :selected-label="
                options?.departments.find((item) => item.value === department)?.label
              "
              :placeholder="t('expenses.user_department')"
              @change="firstPage"
            /><t-select
              class="list-filter expense-wide-filter"
              v-model="query.user_id"
              :options="options?.users"
              :placeholder="t('expenses.user_name')"
              filterable
              clearable
              @change="firstPage"
            /><t-select
              class="list-filter expense-wide-filter"
              v-model="query.model_id"
              :options="options?.models"
              :placeholder="t('expenses.model_name')"
              filterable
              clearable
              @change="firstPage"
            /><t-select
              class="list-filter expense-wide-filter"
              v-model="query.provider_id"
              :options="options?.providers"
              :placeholder="t('expenses.provider_name')"
              clearable
              @change="firstPage"
            /><t-select
              class="list-filter expense-wide-filter"
              v-model="query.fee_subject_id"
              :options="options?.feeSubjects"
              :placeholder="t('expenses.fee_subject_name')"
              filterable
              clearable
              @change="firstPage"
            /><t-select
              class="list-filter expense-wide-filter"
              v-model="query.cost_center_id"
              :options="options?.costCenters"
              :placeholder="t('expenses.cost_center_name')"
              filterable
              clearable
              @change="firstPage"
            /><t-button v-if="!more" theme="default" @click="more = !more">{{
              t(more ? 'expenses.collapse' : 'expenses.more')
            }}</t-button
            ><t-button v-if="!more" theme="default" @click="reset">{{
              t('expenses.reset')
            }}</t-button>
          </div>
          <div v-if="more" class="filters more list-toolbar">
            <t-select
              class="list-filter"
              v-model="query.control_status"
              :options="enumOptions(['CONTROLLED', 'UNCONTROLLED', 'UNASSIGNED'])"
              :placeholder="t('expenses.control_status')"
              clearable
              @change="firstPage"
            />
            <t-select
              class="list-filter"
              v-model="query.cost_owner_type"
              :options="enumOptions(['DEPARTMENT', 'PROJECT', 'UNCONTROLLED', 'UNASSIGNED'])"
              :placeholder="t('expenses.cost_owner_type')"
              clearable
              @change="firstPage"
            />
            <t-date-range-picker
              v-model="dates"
              :placeholder="[t('expenses.date'), t('expenses.date')]"
              @change="dateChanged"
            /><t-input-number
              v-for="key in numberFilters"
              :key="key"
              v-nonnegative-number
              v-model="query[key]"
              :min="0"
              :placeholder="t(`expenses.${numberLabels[key]}`)"
              theme="normal"
              @change="firstPage"
            /><t-select
              class="list-filter"
              v-model="query.status"
              :options="enumOptions(['SUCCESS', 'FAILED', 'PARTIAL'])"
              :placeholder="t('expenses.status')"
              clearable
              @change="firstPage"
            /><t-button theme="default" @click="more = false">{{ t('expenses.collapse') }}</t-button
            ><t-button theme="default" @click="reset">{{ t('expenses.reset') }}</t-button>
          </div></template
        ></FilterBar
      >
      <div class="summary">
        <strong>{{ t('expenses.summary', { count: total }) }}</strong
        ><span>{{ t('expenses.amount') }}：{{ money(summary.cost) }}</span
        ><span>{{ t('expenses.average') }}：{{ money(summary.average) }}</span>
      </div>
      <p class="hint">{{ t('expenses.disclaimer') }}</p>
    </div>
    <t-table
      :ref="setMinimumTableRoot"
      table-layout="auto"
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :sort="sort"
      :pagination="{ current: query.page, pageSize: query.page_size, total, showJumper: true }"
      @sort-change="sortChanged"
      @page-change="pageChanged"
      @row-click="rowClick"
      class="page-table-list"
      ><template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template
      ><template #cost_owner_type="{ row }"
        ><t-tag variant="light">{{ t(`expenses.${row.cost_owner_type}`) }}</t-tag></template
      ><template #user_name="{ row }">{{ row.user_name }}（{{ row.username }}）</template
      ><template #fee_subject_name="{ row }">{{ attribution(row, 'fee_subject_name') }}</template
      ><template #cost_center_name="{ row }">{{ attribution(row, 'cost_center_name') }}</template
      ><template
        v-for="key in ['input_tokens', 'output_tokens', 'total_tokens']"
        :key="key"
        #[key]="{ row }"
        >{{ row[key] === null ? t('expenses.unknown') : number(row[key]) }}</template
      >
      <template #total_cost="{ row }">{{ money(row.total_cost, row.currency) }}</template
      ><template #status="{ row }"
        ><t-tag
          :theme="
            row.status === 'FAILED' ? 'danger' : row.status === 'PARTIAL' ? 'warning' : 'success'
          "
          variant="light"
          >{{ t(`expenses.${row.status}`) }}</t-tag
        ></template
      ></t-table
    >
  </t-card>
  <t-dialog
    :visible="exportVisible"
    :header="t('expenses.export')"
    :confirm-btn="{ content: t('expenses.confirmExport'), loading: exporting }"
    :cancel-btn="t('expenses.cancel')"
    @close="exportVisible = false"
    @confirm="download"
    ><t-form label-align="top"
      ><t-form-item :label="t('expenses.exportRange')"
        ><t-radio-group
          v-model="exportRange"
          :options="enumOptions(['FILTERED', 'ALL'])" /></t-form-item
      ><t-form-item :label="t('expenses.exportFields')"
        ><t-radio-group v-model="exportFields" :options="enumOptions(['CURRENT', 'ALL_FIELDS'])"
      /></t-form-item>
      <p>
        {{ t('expenses.exportSummary', { count: exportRange === 'FILTERED' ? total : allTotal }) }}
      </p></t-form
    ></t-dialog
  >
  <t-drawer
    :visible="Boolean(detail)"
    :header="t('expenses.detail')"
    size="var(--cost-drawer-width)"
    :footer="false"
    @close="detail = null"
    ><div v-if="detail" class="detail">
      <section class="detail-section">
        <h3>{{ t('expenses.basic') }}</h3>
        <div class="detail-grid">
          <div v-for="key in basicFields" :key="key">
            <label>{{ t(`expenses.${key}`) }}</label>
            <t-tag
              v-if="key === 'status'"
              :theme="
                detail.status === 'FAILED'
                  ? 'danger'
                  : detail.status === 'PARTIAL'
                    ? 'warning'
                    : 'success'
              "
              variant="light"
              >{{ t(`expenses.${detail.status}`) }}</t-tag
            >
            <span v-else-if="key === 'created_at'">{{ formatDateTime(detail.created_at) }}</span>
            <span v-else-if="key === 'usage_modality' || key === 'cost_owner_type'">{{
              t(`expenses.${detail[key]}`)
            }}</span>
            <span v-else-if="key === 'fee_subject_name' || key === 'cost_center_name'">{{
              attribution(detail, key)
            }}</span>
            <span v-else-if="key === 'user_name'"
              >{{ detail.user_name }}（{{ detail.username }}）</span
            >
            <span
              v-else
              :class="{ 'detail-mono': ['request_id', 'api_key_masked', 'model_id'].includes(key) }"
              >{{ detail[key] ?? '—' }}</span
            >
          </div>
        </div>
      </section>
      <section class="detail-section">
        <div class="section-heading">
          <h3>{{ t('expenses.billing') }}</h3>
          <t-tag
            variant="light"
            :theme="
              billingState === 'charged'
                ? 'success'
                : billingState === 'notCalculated'
                  ? 'warning'
                  : 'default'
            "
            size="small"
            >{{ t(`expenses.${billingState}`) }}</t-tag
          >
        </div>
        <t-table
          table-layout="auto"
          v-if="detail.billing_items.length"
          row-key="name"
          size="small"
          :data="detail.billing_items"
          :columns="billingColumns"
        >
          <template #name="{ row }">{{ t(`expenses.${row.name}`) }}</template>
          <template #usage="{ row }">{{ number(row.usage) }}</template>
          <template #unit="{ row }">{{ row.unit === 'TOKEN' ? 'Token' : row.unit }}</template>
          <template #price="{ row }">{{ money(row.price, detail.currency) }}</template>
          <template #subtotal="{ row }">{{ money(row.subtotal, detail.currency) }}</template>
        </t-table>
        <div v-else class="detail-empty">
          <strong>{{ t(detail.raw_usage ? 'expenses.noCost' : 'expenses.noUsageCost') }}</strong
          ><span>{{
            t(detail.raw_usage ? 'expenses.noCostDetail' : 'expenses.noUsageDetail')
          }}</span>
        </div>
        <div class="detail-total">
          <span>{{ t('expenses.total') }}</span
          ><strong>{{ money(detail.total_cost, detail.currency) }}</strong>
        </div>
        <p v-if="detail.billing_items.length" class="hint">{{ t('expenses.tokenPrice') }}</p>
        <p class="hint">
          {{ t('expenses.snapshotHint', { version: detail.price_snapshot_version }) }}
        </p>
      </section>
      <section class="detail-section">
        <h3>{{ t('expenses.rawSection') }}</h3>
        <div class="detail-source">
          <label>{{ t('expenses.usageSource') }}</label
          ><t-tag size="small" variant="light" :theme="detail.raw_usage ? 'success' : 'default'">{{
            t(detail.raw_usage ? `expenses.${detail.usage_source}` : 'expenses.unavailable')
          }}</t-tag>
        </div>
        <details v-if="detail.raw_usage" class="raw-usage">
          <summary>{{ t('expenses.viewRaw') }}</summary>
          <pre>{{ JSON.stringify(detail.raw_usage, null, 2) }}</pre>
        </details>
        <div v-else class="detail-empty">
          <strong>{{ t('expenses.noUsage') }}</strong
          ><span>{{ t('expenses.noUsageRecorded') }}</span>
        </div>
      </section>
      <section v-if="detail.error_code || detail.error_message" class="detail-section">
        <h3>{{ t('expenses.error') }}</h3>
        <t-alert
          theme="error"
          :title="detail.error_code ?? ''"
          :message="detail.error_message ?? ''"
        />
      </section></div
  ></t-drawer>
</template>
<script setup lang="ts">
import { useTableViewport } from '@/utils/useTableViewport'
import { h, computed, reactive, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Tooltip } from 'tdesign-vue-next'
import { HelpCircleIcon } from 'tdesign-icons-vue-next'
import type { PageInfo, TableSort, PrimaryTableCol, TableRowData } from 'tdesign-vue-next'
import {
  getExpenses,
  getExpenseDepartments,
  getExpense,
  getExpenseOptions,
  exportExpenses,
  type ExpenseQuery,
  type ExpenseRecord,
  type ExpenseSummary,
} from '@/api/modules/expenses'
import { useUserStore } from '@/stores/modules/user'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentSelect from '@/components/DepartmentTreeSelect.vue'
import { useCost } from '../useCost'
import type { DepartmentQuery } from '@/api/modules/identity'
import { formatDateTime, getDateRangeInTimeZone, getTimeZone } from '@/utils/datetime'
import { downloadBlob } from '@/utils/download'
import '@/styles/cost.css'
const { setTableRoot: setMinimumTableRoot } = useTableViewport({ minimumOnly: true })

const { t, locale, money, number, error } = useCost(),
  route = useRoute()
const query = reactive<ExpenseQuery>({
  page: 1,
  page_size: 20,
  sort_by: 'created_at',
  direction: 'desc',
  ...Object.fromEntries(
    [
      'bill_id',
      'department_direct',
      'fee_subject_id',
      'cost_center_id',
      'control_status',
      'user_id',
      'model_id',
      'provider_id',
    ]
      .filter((k) => route.query[k])
      .map((k) => [k, String(route.query[k])]),
  ),
})
const department = ref(String(route.query.department_id ?? '')),
  dates = ref<string[]>(
    route.query.period_start && route.query.period_end
      ? [String(route.query.period_start), String(route.query.period_end)]
      : [],
  ),
  more = ref(!!(route.query.control_status || route.query.period_start)),
  loading = ref(false),
  items = ref<ExpenseRecord[]>([]),
  total = ref(0),
  allTotal = ref(0),
  detail = ref<ExpenseRecord | null>(null),
  columnsVisible = ref(false),
  exportVisible = ref(false),
  exporting = ref(false),
  exportRange = ref<'FILTERED' | 'ALL'>('FILTERED'),
  exportFields = ref('CURRENT'),
  sort = ref<TableSort>({ sortBy: 'created_at', descending: true })
const billDatesActive = ref(
  !!(route.query.bill_id && route.query.period_start && route.query.period_end),
)
function dateChanged() {
  billDatesActive.value = false
  firstPage()
}
const options = ref<Awaited<ReturnType<typeof getExpenseOptions>>>()
const summary = ref<ExpenseSummary>({
  cost: 0,
  input_tokens: 0,
  output_tokens: 0,
  cached_tokens: 0,
  tokens: 0,
  requests: 0,
  average: 0,
})
const defaultFields = [
  'created_at',
  'cost_owner_type',
  'fee_subject_name',
  'cost_center_name',
  'user_name',
  'user_department',
  'model_name',
  'provider_name',
  'total_cost',
  'status',
]
const allFields = [
  'created_at',
  'cost_owner_type',
  'fee_subject_name',
  'cost_center_name',
  'user_name',
  'user_department',
  'api_key_name',
  'model_name',
  'model_id',
  'provider_name',
  'total_cost',
  'currency',
  'status',
  'request_id',
]
const selectedFields = ref([...defaultFields]),
  visibleFields = ref([...defaultFields])
const basicFields = [
  'created_at',
  'request_id',
  'status',
  'usage_modality',
  'cost_owner_type',
  'fee_subject_name',
  'cost_center_name',
  'user_name',
  'user_department',
  'api_key_masked',
  'model_name',
  'model_id',
  'provider_name',
  'currency',
] as const
const numberFilters = ['min_cost', 'max_cost'] as const
const numberLabels = {
  min_cost: 'minCost',
  max_cost: 'maxCost',
  min_tokens: 'minTokens',
  max_tokens: 'maxTokens',
}
const storageKey = computed(() => `ais-expense-columns-${useUserStore().userInfo?.id ?? 'current'}`)
const enumOptions = (values: string[]) =>
  values.map((value) => ({ value, label: t(`expenses.${value}`) }))
const columns = computed<PrimaryTableCol<TableRowData>[]>(() =>
  visibleFields.value.map((colKey) => ({
    colKey,
    title: () =>
      h('span', { class: 'column-title' }, [
        t(`expenses.${colKey}`),
        ...([
          'created_at',
          'cost_owner_type',
          'fee_subject_name',
          'cost_center_name',
          'model_name',
          'total_cost',
        ].includes(colKey)
          ? [
              h(
                Tooltip,
                { content: t(`expenses.help${colKey}`) },
                {
                  default: () =>
                    h(HelpCircleIcon, {
                      class: 'column-help',
                      onClick: ({ e }: { e: MouseEvent }) => e.stopPropagation(),
                      'aria-label': t(`expenses.help${colKey}`),
                    }),
                },
              ),
            ]
          : []),
      ]),
    minWidth: colKey === 'created_at' || colKey.includes('department') ? 200 : 140,
    sorter: ['created_at', 'total_cost', 'input_tokens', 'output_tokens', 'total_tokens'].includes(
      colKey,
    ),
  })),
)
const billingState = computed(() =>
  !detail.value?.raw_usage && !detail.value?.normalized_usage
    ? 'notCalculated'
    : detail.value.total_cost > 0
      ? 'charged'
      : 'noCharge',
)
const billingColumns = computed(() =>
  ['name', 'usage', 'unit', 'price', 'subtotal'].map((colKey) => ({
    colKey,
    title: t(`expenses.${colKey === 'name' ? 'item' : colKey}`),
    align: ['usage', 'price', 'subtotal'].includes(colKey) ? ('right' as const) : ('left' as const),
  })),
)
let generation = 0
function attribution(row: ExpenseRecord, key: 'fee_subject_name' | 'cost_center_name') {
  return row.control_status === 'UNCONTROLLED'
    ? t('expenses.UNCONTROLLED')
    : (row[key] ?? t('expenses.UNASSIGNED'))
}
async function loadDepartments(params: DepartmentQuery) {
  return getExpenseDepartments(params)
}

function params() {
  const range =
    !billDatesActive.value && dates.value.length === 2
      ? getDateRangeInTimeZone(dates.value[0]!, dates.value[1]!)
      : null
  return {
    ...query,
    department_id: department.value || undefined,
    start: range?.from || query.start,
    end: range?.to || query.end,
  }
}
function hasFilters() {
  return Object.entries(params()).some(
    ([key, value]) =>
      !['page', 'page_size', 'sort_by', 'direction'].includes(key) &&
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0),
  )
}

async function load() {
  const current = ++generation
  loading.value = true
  try {
    const result = await getExpenses(params())
    if (current !== generation) return
    items.value = result.items
    total.value = result.total
    if (!hasFilters()) allTotal.value = result.total
    summary.value = result.summary
  } catch (e) {
    error(e)
  } finally {
    if (current === generation) loading.value = false
  }
}
function firstPage() {
  query.page = 1
  void load()
}
function pageChanged(p: PageInfo) {
  query.page = p.current
  query.page_size = p.pageSize
  void load()
}
function reset() {
  Object.keys(query).forEach((key) => delete (query as unknown as Record<string, unknown>)[key])
  Object.assign(query, { page: 1, page_size: 20, sort_by: 'created_at', direction: 'desc' })
  department.value = ''
  dates.value = []
  billDatesActive.value = false
  void load()
}
function sortChanged(value: TableSort) {
  sort.value = value
  const s = Array.isArray(value) ? value[0] : value
  query.sort_by = s?.sortBy ?? 'created_at'
  query.direction = s?.descending ? 'desc' : 'asc'
  firstPage()
}
function rowClick(context: { row: TableRowData }) {
  void openDetail(String(context.row.id))
}
async function openDetail(id: string) {
  try {
    detail.value = await getExpense(id)
  } catch (e) {
    error(e)
  }
}
function columnPopupChanged(visible: boolean) {
  if (visible) selectedFields.value = [...visibleFields.value]
}
function saveColumns() {
  const retained = allFields.filter((k) => selectedFields.value.includes(k))
  if (!retained.length) {
    selectedFields.value = [...visibleFields.value]
    return
  }
  visibleFields.value = retained
  localStorage.setItem(storageKey.value, JSON.stringify(visibleFields.value))
}
function restoreColumns() {
  selectedFields.value = [...defaultFields]
  saveColumns()
}
async function download() {
  exporting.value = true
  try {
    const result = await exportExpenses({
      ...params(),
      fields: exportFields.value === 'CURRENT' ? visibleFields.value : allFields,
      range: exportRange.value,
    })
    downloadBlob(
      new Blob([result.content], { type: 'text/csv;charset=utf-8' }),
      'expense-details.csv',
    )
    exportVisible.value = false
  } catch (e) {
    error(e)
  } finally {
    exporting.value = false
  }
}
watch([locale, () => getTimeZone()], async () => {
  options.value = await getExpenseOptions()
  await load()
})
onMounted(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey.value) ?? 'null') as string[] | null
    if (saved?.length) {
      const retained = allFields.filter((k) => saved.includes(k))
      visibleFields.value = retained.length ? retained : [...defaultFields]
      selectedFields.value = [...visibleFields.value]
    }
    options.value = await getExpenseOptions()
    await load()
    if (hasFilters()) allTotal.value = (await getExpenses({ page: 1, page_size: 1 })).total
  } catch (e) {
    error(e)
  }
})
</script>
<style scoped>
.expenses {
  overflow: hidden;
}
.expenses :deep(> .t-loading__parent),
.expenses :deep(.expense-list-content) {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}
.expenses :deep(.expense-list-content > :not(.t-table):not(.page-table-controls)) {
  flex-shrink: 0;
}
.expenses :deep(.expense-list-content > .t-table) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: var(--page-table-min-height);
}
.expenses :deep(.t-table__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.expenses :deep(.t-table__pagination-wrap) {
  flex-shrink: 0;
}
.expenses.expenses-loading :deep(.t-table__content) {
  overflow: hidden;
}
.expenses :deep(.t-table .t-loading--full) {
  z-index: var(--td-z-index-popup, 2);
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
}
.expenses :deep(.t-table thead) {
  position: sticky;
  top: 0;
  z-index: var(--td-z-index-affix, 1);
}
.expenses :deep(.t-table th),
.expenses :deep(.t-table td) {
  white-space: nowrap;
}
.expenses :deep(.t-table__content) {
  overflow-x: auto;
}

.column-settings {
  width: var(--cost-column-popup-width);
  max-width: calc(100vw - var(--td-comp-margin-l) * 2);
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-m);
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
}
.column-settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-s);
}
.column-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--td-comp-margin-m);
}
.column-settings small {
  color: var(--td-text-color-placeholder);
}
.expenses :deep(.column-title) {
  display: inline-flex;
  align-items: center;
  gap: var(--td-comp-margin-xs);
}
.expenses :deep(.column-help) {
  color: var(--td-text-color-placeholder);
  cursor: help;
  flex-shrink: 0;
}
.expenses :deep(.t-card__body),
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-m);
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--td-comp-margin-m) var(--td-comp-margin-l);
}
.detail-grid > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--td-comp-margin-xs);
  overflow-wrap: anywhere;
}
.detail-grid label,
.detail-source label {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.detail-grid label {
  color: var(--td-text-color-placeholder);
}
.section-heading,
.detail-total,
.detail-source {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.section-heading,
.detail-total {
  justify-content: space-between;
}
.detail-total {
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  background: var(--td-bg-color-page);
  border-radius: var(--td-radius-medium);
}
.detail-total strong {
  font-size: var(--td-font-size-title-large);
}
.detail-empty {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  background: var(--td-bg-color-page);
  border-radius: var(--td-radius-medium);
}
.detail-empty span {
  color: var(--td-text-color-secondary);
}
.detail-mono,
.raw-usage pre {
  font-family: monospace;
}
.raw-usage {
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  background: var(--td-bg-color-page);
  border-radius: var(--td-radius-medium);
}
.raw-usage summary {
  cursor: pointer;
  color: var(--td-text-color-secondary);
}
.heading,
.filters,
.summary {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  flex-wrap: wrap;
}
.heading {
  justify-content: space-between;
  align-items: center;
}
.heading h3 {
  font: var(--td-font-headline-small);
}
.filters > :deep(.t-input__wrap) {
  width: var(--cost-search-width);
}
.filters > :deep(.t-select__wrap),
.filters > :deep(.cost-department-select),
.filters > :deep(.t-input-number) {
  width: var(--cost-filter-width);
}
.expenses :deep(.filter-bar .t-card__body) {
  gap: 0;
}
.more {
  margin-top: var(--td-comp-margin-s);
}
.summary {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-page);
  gap: var(--td-comp-margin-l);
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
h3,
p {
  margin: 0;
}
h3 {
  font-size: var(--td-font-size-title-small);
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
:deep(.t-table__body tr) {
  cursor: pointer;
}
</style>
