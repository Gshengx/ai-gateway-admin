<template>
  <t-card :bordered="false" class="expenses"
    ><t-link
      v-if="route.query.billId"
      theme="primary"
      @click="router.push({ path: '/cost/bills', query: { billId: route.query.billId } })"
      >{{ t('expenses.returnBill') }}</t-link
    >
    <div class="heading">
      <div>
        <h3>{{ t('expenses.title') }}</h3>
        <p class="hint">{{ t('expenses.intro') }}</p>
      </div>
      <t-space
        ><t-button theme="default" @click="openColumnSettings">{{ t('expenses.columns') }}</t-button
        ><t-button theme="default" @click="exportVisible = true">{{
          t('expenses.export')
        }}</t-button></t-space
      >
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
          /><t-select
            class="list-filter"
            v-model="query.cost_owner_type"
            :options="enumOptions(['USER_DEPARTMENT', 'PROJECT'])"
            :placeholder="t('expenses.cost_owner_type')"
            clearable
            @change="firstPage"
          /><t-select
            class="list-filter"
            v-model="query.project_id"
            :options="options?.projects"
            :placeholder="t('expenses.project_name')"
            filterable
            clearable
            @change="firstPage"
          /><DepartmentSelect
            class="list-department"
            v-model="department"
            :placeholder="t('expenses.user_department')"
            @change="firstPage"
          /><t-select
            class="list-filter"
            v-model="query.user_id"
            :options="options?.users"
            :placeholder="t('expenses.user_name')"
            filterable
            clearable
            @change="firstPage"
          /><t-select
            class="list-filter"
            v-model="query.model_id"
            :options="options?.models"
            :placeholder="t('expenses.model_name')"
            filterable
            clearable
            @change="firstPage"
          /><t-select
            class="list-filter"
            v-model="query.provider_id"
            :options="options?.providers"
            :placeholder="t('expenses.provider_name')"
            clearable
            @change="firstPage"
          /><t-button theme="default" @click="more = !more">{{ t('expenses.more') }}</t-button
          ><t-button theme="default" @click="reset">{{ t('expenses.reset') }}</t-button>
        </div>
        <div v-if="more" class="filters more list-toolbar">
          <t-date-range-picker
            v-model="dates"
            :placeholder="[t('expenses.date'), t('expenses.date')]"
            @change="firstPage"
          /><t-input-number
            v-for="key in numberFilters"
            :key="key"
            v-nonnegative-number
            v-model="query[key]"
            :min="0"
            :placeholder="t(`expenses.${numberLabels[key]}`)"
            theme="normal"
            @change="firstPage"
          /><DepartmentSelect
            class="list-department"
            v-model="projectDepartment"
            :placeholder="t('expenses.project_department')"
            @change="firstPage"
          /><t-select
            class="list-filter"
            v-model="query.status"
            :options="enumOptions(['SUCCESS', 'FAILED', 'PARTIAL'])"
            :placeholder="t('expenses.status')"
            clearable
            @change="firstPage"
          /><t-select
            class="list-filter"
            v-model="query.has_project"
            :options="enumOptions(['YES', 'NO'])"
            :placeholder="t('expenses.hasProject')"
            clearable
            @change="firstPage"
          /></div></template
    ></FilterBar>
    <div class="summary">
      <strong>{{ t('expenses.summary', { count: total }) }}</strong
      ><span>{{ t('expenses.amount') }}：{{ money(summary.cost) }}</span
      ><span>{{ t('expenses.input_tokens') }}：{{ number(summary.input_tokens) }}</span
      ><span>{{ t('expenses.output_tokens') }}：{{ number(summary.output_tokens) }}</span
      ><span>{{ t('expenses.total_tokens') }}：{{ number(summary.tokens) }}</span
      ><span>{{ t('expenses.average') }}：{{ money(summary.average) }}</span>
    </div>
    <p class="hint">{{ t('expenses.sortHint') }}</p>
    <t-table
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :sort="sort"
      :pagination="{ current: query.page, pageSize: query.page_size, total, showJumper: true }"
      @sort-change="sortChanged"
      @page-change="pageChanged"
      @row-click="rowClick"
      ><template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template
      ><template #cost_owner_type="{ row }"
        ><t-tag variant="light">{{ t(`expenses.${row.cost_owner_type}`) }}</t-tag></template
      ><template #project_name="{ row }">{{ row.project_name ?? '—' }}</template
      ><template #user_name="{ row }">{{ row.user_name }}（{{ row.username }}）</template
      ><template v-for="key in tokenFields" :key="key" #[key]="{ row }"
        ><span :class="{ hint: row[key] === null }">{{
          row[key] === null ? t('expenses.unknown') : number(row[key])
        }}</span></template
      ><template #total_cost="{ row }">{{ money(row.total_cost, row.currency) }}</template
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
    <p class="hint">{{ t('expenses.disclaimer') }}</p>
  </t-card>
  <t-dialog
    :visible="columnsVisible"
    :header="t('expenses.columns')"
    :confirm-btn="t('expenses.save')"
    :cancel-btn="t('expenses.cancel')"
    @close="columnsVisible = false"
    @confirm="saveColumns"
    ><t-checkbox-group
      v-model="selectedFields"
      :options="allFields.map((value) => ({ value, label: t(`expenses.${value}`) }))"
    /><t-button theme="default" variant="text" @click="selectedFields = [...defaultFields]">{{
      t('expenses.restore')
    }}</t-button></t-dialog
  >
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
      <h3>{{ t('expenses.basic') }}</h3>
      <t-descriptions :column="2" layout="vertical"
        ><t-descriptions-item v-for="key in basicFields" :key="key" :label="t(`expenses.${key}`)">{{
          key === 'created_at'
            ? formatDateTime(detail.created_at)
            : ['status', 'cost_owner_type'].includes(key)
              ? t(`expenses.${detail[key]}`)
              : (detail[key] ?? '—')
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('expenses.source')">{{
          t(`expenses.${detail.usage_source}`)
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('expenses.snapshot')">{{
          detail.price_snapshot_version
        }}</t-descriptions-item></t-descriptions
      >
      <h3>{{ t('expenses.billing') }}</h3>
      <t-table
        v-if="detail.billing_items.length"
        row-key="name"
        :data="detail.billing_items"
        :columns="billingColumns"
        ><template #name="{ row }">{{ t(`expenses.${row.name}`) }}</template
        ><template #price="{ row }"
          >{{ money(row.price, detail.currency) }} {{ t('expenses.perMillion') }}</template
        ><template #subtotal="{ row }">{{ row.subtotal.toFixed(6) }}</template></t-table
      >
      <p v-else>{{ t(detail.raw_usage ? 'expenses.noCost' : 'expenses.noUsageCost') }}</p>
      <p class="hint">{{ t('expenses.tokenPrice') }}</p>
      <strong>{{ t('expenses.total') }}：{{ money(detail.total_cost, detail.currency) }}</strong
      ><t-collapse
        ><t-collapse-panel value="raw" :header="t('expenses.raw')">
          <pre v-if="detail.raw_usage">{{ JSON.stringify(detail.raw_usage, null, 2) }}</pre>
          <p v-else>{{ t('expenses.noUsage') }}</p></t-collapse-panel
        ></t-collapse
      ><template v-if="detail.status === 'FAILED'"
        ><h3>{{ t('expenses.error') }}</h3>
        <p>{{ detail.error_code }}</p>
        <p>{{ detail.error_message }}</p></template
      >
    </div></t-drawer
  >
</template>
<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PageInfo, TableSort, PrimaryTableCol, TableRowData } from 'tdesign-vue-next'
import {
  getExpenses,
  getExpense,
  getExpenseOptions,
  exportExpenses,
  type ExpenseQuery,
  type ExpenseRecord,
  type ExpenseSummary,
} from '@/api/modules/expenses'
import { useUserStore } from '@/stores/modules/user'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentSelect from '../DepartmentSelect.vue'
import { useCost } from '../useCost'
import { formatDateTime } from '@/utils/datetime'
import { downloadBlob } from '../bills/download'
import '@/styles/cost.css'
const { t, locale, money, number, error } = useCost(),
  route = useRoute(),
  router = useRouter()
const query = reactive<ExpenseQuery>({
  page: 1,
  page_size: 20,
  sort_by: 'created_at',
  direction: 'desc',
  bill_id: route.query.billId ? String(route.query.billId) : undefined,
  ...Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'billId')),
})
const projectDepartment = ref('')
const department = ref(String(route.query.department_id ?? '')),
  dates = ref<string[]>([]),
  more = ref(false),
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
  'project_name',
  'user_name',
  'user_department',
  'model_name',
  'provider_name',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'total_cost',
  'status',
]
const allFields = [
  ...defaultFields,
  'request_id',
  'project_department',
  'api_key_name',
  'cached_tokens',
]
const selectedFields = ref([...defaultFields]),
  visibleFields = ref([...defaultFields])
const basicFields: (keyof Pick<
  ExpenseRecord,
  | 'created_at'
  | 'request_id'
  | 'status'
  | 'cost_owner_type'
  | 'project_name'
  | 'project_department'
  | 'user_name'
  | 'user_department'
  | 'api_key_name'
  | 'model_name'
  | 'provider_name'
>)[] = [
  'created_at',
  'request_id',
  'status',
  'cost_owner_type',
  'project_name',
  'project_department',
  'user_name',
  'user_department',
  'api_key_name',
  'model_name',
  'provider_name',
]
const tokenFields = ['input_tokens', 'output_tokens', 'cached_tokens', 'total_tokens']
const numberFilters = ['min_cost', 'max_cost', 'min_tokens', 'max_tokens'] as const
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
    title: t(`expenses.${colKey}`),
    minWidth: colKey === 'created_at' || colKey.includes('department') ? 200 : 140,
    sorter: ['created_at', 'input_tokens', 'output_tokens', 'total_tokens', 'total_cost'].includes(
      colKey,
    ),
  })),
)
const billingColumns = computed(() =>
  ['name', 'usage', 'unit', 'price', 'subtotal'].map((colKey) => ({
    colKey,
    title: t(`expenses.${colKey === 'name' ? 'item' : colKey}`),
  })),
)
let generation = 0
function params() {
  return {
    ...query,
    department_id: department.value || undefined,
    project_department_id: projectDepartment.value || undefined,
    start: dates.value[0] || query.start,
    end: dates.value[1] || query.end,
  }
}
async function load() {
  const current = ++generation
  loading.value = true
  try {
    const result = await getExpenses(params())
    if (current !== generation) return
    items.value = result.items
    total.value = result.total
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
  projectDepartment.value = ''
  dates.value = []
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
function openColumnSettings() {
  selectedFields.value = [...visibleFields.value]
  columnsVisible.value = true
}
function saveColumns() {
  visibleFields.value = allFields.filter((k) => selectedFields.value.includes(k))
  localStorage.setItem(storageKey.value, JSON.stringify(visibleFields.value))
  columnsVisible.value = false
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
watch(locale, load)
onMounted(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey.value) ?? 'null') as string[] | null
    if (saved?.length) {
      visibleFields.value = allFields.filter((k) => saved.includes(k))
      selectedFields.value = [...visibleFields.value]
    }
    options.value = await getExpenseOptions()
    allTotal.value = (await getExpenses({ page: 1, page_size: 1 })).total
    await load()
  } catch (e) {
    error(e)
  }
})
</script>
<style scoped>
.expenses :deep(.t-card__body),
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
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
}
.filters > :deep(.t-input__wrap) {
  width: var(--cost-search-width);
}
.filters > :deep(.t-select__wrap),
.filters > :deep(.cost-department-select),
.filters > :deep(.t-input-number) {
  width: var(--cost-filter-width);
}
.more {
  margin-top: var(--td-comp-margin-l);
}
.summary {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-secondarycontainer);
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
