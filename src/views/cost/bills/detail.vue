<template>
  <t-card :bordered="false" class="bill-detail" :loading="loading && !detail">
    <t-link class="bill-back" theme="primary" @click="emit('back')">← {{ t('bills.back') }}</t-link>
    <template v-if="detail">
      <div class="heading">
        <div>
          <div class="bill-title">
            <h3>
              {{ t('bills.title') }} · {{ detail.bill.periodStart }} ~ {{ detail.bill.periodEnd }}
            </h3>
            <t-tag
              variant="light"
              :theme="
                detail.bill.status === 'COMPLETED'
                  ? 'success'
                  : detail.bill.status === 'FAILED'
                    ? 'danger'
                    : 'primary'
              "
              >{{ t(`bills.${detail.bill.status}`) }}</t-tag
            >
          </div>
          <p>
            {{ t(`bills.${detail.bill.periodType}`) }} · {{ t(`bills.${detail.bill.scopeType}`) }} ·
            {{ detail.bill.scopeName }}
          </p>
          <p>{{ t('bills.generatedAt') }}：{{ formatDateTime(detail.bill.generatedAt) }}</p>
        </div>
        <t-space align="center"
          ><t-button
            v-permission.write="'cost.bills'"
            theme="default"
            :disabled="busy || detail.bill.status === 'GENERATING'"
            @click="regenerate"
            >{{ t('bills.regenerate') }}</t-button
          ><t-button
            :disabled="detail.bill.status !== 'COMPLETED' || busy"
            @click="download(true)"
            >{{ t('bills.exportAll') }}</t-button
          ></t-space
        >
      </div>
      <t-alert
        v-if="detail.bill.status === 'FAILED'"
        theme="error"
        :message="t('bills.failedReason', { reason: detail.bill.failureReason })"
      />
      <t-alert
        v-if="detail.bill.status === 'GENERATING'"
        theme="info"
        :message="t('bills.generatingHint')"
      />
      <div class="metrics">
        <div v-for="key in metrics" :key="key" :class="{ 'total-metric': key === 'totalCost' }">
          <p>{{ t(`bills.${key}`) }}</p>
          <strong>{{
            ['totalTokens', 'totalRequests'].includes(key)
              ? number(detail.bill[key])
              : money(detail.bill[key])
          }}</strong
          ><small v-if="key === 'totalCost'"
            >{{ t('bills.uncontrolledCost') }} {{ money(detail.bill.uncontrolledCost) }}</small
          ><small v-if="key === 'totalTokens'"
            >{{ t('bills.inputTokens') }} {{ number(detail.bill.inputTokens) }} /
            {{ t('bills.outputTokens') }} {{ number(detail.bill.outputTokens) }}</small
          >
        </div>
        <div>
          <p>{{ t('bills.average') }}</p>
          <strong>{{
            money(detail.bill.totalRequests ? detail.bill.totalCost / detail.bill.totalRequests : 0)
          }}</strong>
        </div>
      </div>
      <section
        data-list-region
        :ref="setAnalysisRoot"
        :style="{ height: analysisHeight, '--page-table-region-height': analysisHeight }"
        class="bill-analysis page-table-layout"
        :class="{ 'bill-analysis-loading': loading }"
      >
        <div class="page-table-controls">
          <t-tabs v-model="query.dimension" @change="dimensionChanged"
            ><t-tab-panel
              v-for="dimension in dimensions"
              :key="dimension"
              :value="dimension"
              :label="t(`bills.${dimension}`)"
          /></t-tabs>
          <p class="hint">{{ t(`bills.dimensionHints.${query.dimension}`) }}</p>
          <div class="analysis-toolbar">
            <FilterBar class="analysis-filters"
              ><template #content
                ><div class="list-toolbar">
                  <t-select
                    class="list-filter bill-detail-filter"
                    v-model="query.controlStatus"
                    :options="
                      ['CONTROLLED', 'UNCONTROLLED', 'UNASSIGNED'].map((value) => ({
                        value,
                        label: t(`bills.${value}`),
                      }))
                    "
                    :placeholder="t('bills.controlStatus')"
                    clearable
                    @change="dimensionChanged"
                  /><DepartmentTreeSelect
                    v-if="query.dimension === 'DEPARTMENT'"
                    :key="`${props.id}:${query.controlStatus ?? ''}`"
                    class="list-department bill-detail-filter"
                    v-model="departmentFilter"
                    :load-departments="loadDepartmentOptions"
                    :resolve-descendants="false"
                    :placeholder="t('bills.DEPARTMENT')"
                    @change="departmentFilterChanged"
                  /><t-select
                    v-else
                    class="list-filter bill-detail-filter"
                    v-model="query.filter"
                    :options="detail.options"
                    :placeholder="t(`bills.${query.dimension}`)"
                    clearable
                    filterable
                    @change="firstPage"
                  /></div></template
            ></FilterBar>
            <t-button
              class="list-action-soft"
              theme="primary"
              variant="base"
              :disabled="detail.bill.status !== 'COMPLETED' || busy"
              @click="download(false)"
              >{{ t('bills.exportDimension') }}</t-button
            >
          </div>
        </div>
        <t-enhanced-table
          :key="tableVersion"
          :ref="setAnalysisTable"
          :loading="loading"
          :row-class-name="departmentRowClass"
          :tree="
            query.dimension === 'DEPARTMENT'
              ? {
                  childrenKey: 'departmentChildren',
                  treeNodeColumnIndex: 0,
                  expandTreeNodeOnClick: false,
                }
              : undefined
          "
          @tree-expand-change="loadDepartmentChildren"
          size="small"
          table-layout="auto"
          row-key="id"
          :data="query.dimension === 'DEPARTMENT' ? departmentRows : detail.analysis.items"
          :columns="columns"
          :sort="sort"
          :pagination="{
            size: 'medium',
            current: query.page,
            pageSize: query.page_size,
            total: detail.analysis.total,
            showJumper: true,
          }"
          @page-change="pageChanged"
          @sort-change="sortChanged"
          class="page-table-list"
        >
          <template #treeExpandAndFoldIcon="{ type, row }"
            ><span @click="stopPendingClick($event, String(row.id))"
              ><t-loading
                v-if="pendingDepartments.has(String(row.id))"
                size="small" /><ChevronDownIcon v-else-if="type === 'fold'" /><ChevronRightIcon
                v-else /></span
          ></template>
          <template #name="{ row }"
            ><div
              v-if="query.dimension === 'DEPARTMENT'"
              class="department-cell"
              :class="{ 'leaf-department': !row.hasChildren }"
            >
              <div class="department-name-line">
                <t-link
                  theme="primary"
                  :title="row.path || row.name"
                  @click.stop="viewExpenses(row)"
                  >{{
                    row.isDirect
                      ? t('bills.departmentDirect', { name: row.name })
                      : row.name || t('bills.UNASSIGNED')
                  }}</t-link
                ><t-tag v-if="row.hasChildren" variant="outline" size="small">{{
                  t('bills.includesChildren')
                }}</t-tag>
              </div>
            </div>
            <t-link v-else theme="primary" @click="viewExpenses(row)">{{
              row.name || t('bills.UNASSIGNED')
            }}</t-link></template
          >
          <template #subjectType="{ row }">{{
            row.subjectType
              ? t(row.subjectType === 'DEPARTMENT' ? 'expenses.DEPARTMENT' : 'bills.PROJECT')
              : t('bills.UNASSIGNED')
          }}</template>
          <template #costCenterName="{ row }">{{
            row.costCenterName || t('bills.UNASSIGNED')
          }}</template>
          <template #projectCost="{ row }">{{ money(row.projectCost) }}</template
          ><template #directCost="{ row }">{{ money(row.directCost) }}</template
          ><template #cost="{ row }">{{ money(row.cost) }}</template
          ><template #uncontrolledCost="{ row }">{{ money(row.uncontrolledCost) }}</template
          ><template #percentage="{ row }">{{ row.percentage.toFixed(1) }}%</template>
        </t-enhanced-table>
      </section>
    </template>
  </t-card>
</template>
<script setup lang="ts">
import { useTableViewport } from '@/utils/useTableViewport'
import { h, computed, ref, reactive, watch, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import type {
  EnhancedTableInstanceFunctions,
  TableTreeExpandChangeContext,
  PrimaryTableCol,
  TableRowData,
  TableSort,
  PageInfo,
} from 'tdesign-vue-next'
import {
  getBill,
  getBillDepartmentTree,
  exportBill,
  regenerateBill,
  type AnalysisQuery,
  type BillDetail,
  type Dimension,
} from '@/api/modules/bills'
import { formatDateTime } from '@/utils/datetime'
import { downloadBlob } from '@/utils/download'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import type { DepartmentQuery } from '@/api/modules/identity'
import { Tooltip } from 'tdesign-vue-next'
import { HelpCircleIcon, ChevronDownIcon, ChevronRightIcon } from 'tdesign-icons-vue-next'
import { useCost } from '../useCost'
const { tableHeight: analysisHeight, setTableRoot: setAnalysisRoot } = useTableViewport({
  panel: true,
})

const { setTableRoot: setMinimumTableRoot } = useTableViewport({ minimumOnly: true })

const props = defineProps<{ id: string }>(),
  emit = defineEmits<{ back: [] }>()
const { t, locale, money, number, error } = useCost(),
  router = useRouter()
const detail = ref<BillDetail | null>(null),
  loading = ref(false),
  busy = ref(false),
  sort = ref<TableSort>({ sortBy: 'cost', descending: true })
const query = reactive<AnalysisQuery>({
  page: 1,
  page_size: 20,
  dimension: 'FEE_SUBJECT',
  sort_by: 'cost',
  direction: 'desc',
})
const dimensions: Dimension[] = [
  'FEE_SUBJECT',
  'COST_CENTER',
  'DEPARTMENT',
  'USER',
  'MODEL',
  'PROVIDER',
]
const metrics = ['totalCost', 'directCost', 'projectCost', 'totalTokens', 'totalRequests'] as const
const columns = computed<PrimaryTableCol<TableRowData>[]>(() =>
  [
    'name',
    ...(query.dimension === 'FEE_SUBJECT' ? ['subjectType', 'costCenterName'] : []),
    'cost',
    'uncontrolledCost',
    ...(query.dimension !== 'FEE_SUBJECT' ? ['projectCost', 'directCost'] : []),
    'requests',
    'percentage',
  ].map((colKey) => ({
    colKey,
    title: () => {
      const title = colKey === 'name' ? t(`bills.${query.dimension}`) : t(`bills.${colKey}`)
      const helpKey = ['cost', 'requests', 'percentage', 'projectCost', 'directCost'].includes(
        colKey,
      )
        ? `bills.headerHelp.${colKey}.${query.dimension}`
        : ['uncontrolledCost', 'costCenterName'].includes(colKey)
          ? `bills.headerHelp.${colKey}`
          : ''
      return helpKey
        ? h('span', { class: 'bill-column-title' }, [
            title,
            h(
              Tooltip,
              { content: t(helpKey) },
              {
                default: () =>
                  h(HelpCircleIcon, {
                    class: 'bill-column-help',
                    onClick: ({ e }: { e: MouseEvent }) => e.stopPropagation(),
                  }),
              },
            ),
          ])
        : title
    },
    minWidth: colKey === 'name' ? 200 : 140,
    sorter: [
      'cost',
      'uncontrolledCost',
      'inputTokens',
      'outputTokens',
      'cachedTokens',
      'requests',
      'percentage',
    ].includes(colKey),
  })),
)
const analysisTable = ref<EnhancedTableInstanceFunctions<TableRowData>>()
function setAnalysisTable(instance: Element | ComponentPublicInstance | null) {
  analysisTable.value = instance
    ? (instance as unknown as EnhancedTableInstanceFunctions<TableRowData>)
    : undefined
  setMinimumTableRoot(instance)
}

const departmentRows = ref<TableRowData[]>([]),
  tableVersion = ref(0),
  pendingDepartments = ref(new Set<string>())
const toTreeRow = (row: BillDetail['analysis']['items'][number], depth = 0): TableRowData => ({
  departmentDepth: depth,
  ...row,
  departmentChildren: row.hasChildren ? true : undefined,
})
function departmentRowClass({ row }: { row: TableRowData }) {
  return query.dimension === 'DEPARTMENT' && row.departmentDepth > 0 ? 'department-child-row' : ''
}
function stopPendingClick(event: MouseEvent, id: string) {
  if (pendingDepartments.value.has(id)) event.stopPropagation()
}
async function loadDepartmentChildren(context: TableTreeExpandChangeContext<TableRowData>) {
  const row = context.row,
    id = String(row.id),
    version = tableVersion.value,
    current = sequence
  if (
    query.dimension !== 'DEPARTMENT' ||
    row.departmentChildren !== true ||
    pendingDepartments.value.has(id) ||
    loading.value
  )
    return
  pendingDepartments.value.add(id)
  try {
    const params = {
      ...query,
      department_parent_id: String(row.departmentId),
      page: 1,
      page_size: 100,
    }
    const result = await getBill(props.id, params)
    const children = [...result.analysis.items]
    for (let page = 2; page <= result.analysis.total_pages; page++)
      children.push(...(await getBill(props.id, { ...params, page })).analysis.items)
    if (version !== tableVersion.value || current !== sequence || query.dimension !== 'DEPARTMENT')
      return
    for (const child of children)
      analysisTable.value?.appendTo(id, toTreeRow(child, Number(row.departmentDepth ?? 0) + 1))
    if (!children.length)
      analysisTable.value?.setData(id, {
        ...row,
        departmentChildren: undefined,
        hasChildren: false,
      })
  } catch (e) {
    if (version === tableVersion.value && current === sequence) error(e)
  } finally {
    if (version === tableVersion.value) pendingDepartments.value.delete(id)
  }
}
const departmentFilter = computed({
  get: () => query.filter ?? '',
  set: (value: string) => {
    query.filter = value || undefined
  },
})
function loadDepartmentOptions(params: DepartmentQuery) {
  return getBillDepartmentTree(props.id, { ...params, controlStatus: query.controlStatus })
}
function departmentFilterChanged() {
  query.department_parent_id = undefined
  firstPage()
}
let sequence = 0
async function load() {
  const n = ++sequence
  loading.value = true
  try {
    const r = await getBill(props.id, query)
    if (n === sequence) {
      detail.value = r
      departmentRows.value = r.analysis.items.map((row) => toTreeRow(row))
      tableVersion.value++
      pendingDepartments.value = new Set()
    }
  } catch (e) {
    if (n === sequence) {
      detail.value = null
      error(e)
    }
  } finally {
    if (n === sequence) loading.value = false
  }
}
function dimensionChanged() {
  query.department_parent_id = undefined
  query.filter = undefined
  firstPage()
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
function sortChanged(s: TableSort) {
  sort.value = s
  const v = Array.isArray(s) ? s[0] : s
  query.sort_by = v?.sortBy ?? 'cost'
  query.direction = v?.descending ? 'desc' : 'asc'
  firstPage()
}
async function regenerate() {
  busy.value = true
  try {
    await regenerateBill(props.id)
    await load()
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
async function download(all: boolean) {
  busy.value = true
  try {
    const r = await exportBill(props.id, { ...query, all })
    downloadBlob(
      new Blob([r.content], { type: 'text/csv;charset=utf-8' }),
      `bill-${props.id}-${all ? 'all' : query.dimension}.csv`,
    )
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
function viewExpenses(row: TableRowData) {
  const field =
    query.dimension === 'FEE_SUBJECT'
      ? 'fee_subject_id'
      : query.dimension === 'COST_CENTER'
        ? 'cost_center_id'
        : query.dimension === 'DEPARTMENT'
          ? 'department_id'
          : query.dimension.toLowerCase() + '_id'
  void router.push({
    path: '/cost/expenses',
    query: {
      ...(detail.value?.bill.scopeType === 'COST_CENTER'
        ? { cost_center_id: detail.value.bill.scopeId }
        : detail.value?.bill.scopeType === 'FEE_SUBJECT'
          ? { fee_subject_id: detail.value.bill.scopeId }
          : { department_id: detail.value?.bill.scopeId }),
      bill_id: props.id,
      period_start: detail.value?.bill.periodStart,
      period_end: detail.value?.bill.periodEnd,
      control_status: row.id === 'UNASSIGNED' ? 'UNASSIGNED' : query.controlStatus,
      [field]: String(row.departmentId ?? row.id),
      ...(row.isDirect ? { department_direct: 'true' } : {}),
    },
  })
}

watch(
  () => props.id,
  () => {
    detail.value = null
    query.page = 1
    query.department_parent_id = undefined
    query.filter = undefined
    void load()
  },
  { immediate: true },
)
watch(locale, load)
</script>
<style scoped>
.bill-analysis {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: var(--page-table-layout-min-height, 0px);
  gap: var(--td-comp-margin-l);
}
.bill-analysis > :not(.t-table):not(.page-table-controls) {
  flex-shrink: 0;
}
.bill-analysis > .t-table {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: var(--page-table-min-height);
}
.bill-analysis :deep(.t-table__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.bill-analysis :deep(.t-table__pagination-wrap) {
  flex-shrink: 0;
}
.bill-analysis :deep(.t-table thead) {
  position: sticky;
  top: 0;
  z-index: var(--td-z-index-affix, 1);
}
.bill-analysis :deep(.t-table .t-loading--full) {
  z-index: var(--td-z-index-popup, 2);
}
.bill-analysis.bill-analysis-loading :deep(.t-table__content) {
  overflow: hidden;
}

.analysis-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--td-comp-margin-l);
}
.analysis-filters {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}
.bill-detail-filter {
  width: var(--list-department-width);
  flex-basis: var(--list-department-width);
}
.analysis-toolbar > .t-button {
  flex-shrink: 0;
}

.bill-back {
  align-self: flex-start;
}
.metrics > .total-metric {
  background: var(--td-brand-color-light);
}
.total-metric > p,
.total-metric > strong {
  color: var(--td-brand-color);
}
.bill-title {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.heading > .t-space {
  align-self: flex-start;
}
.bill-detail :deep(.bill-column-title) {
  display: inline-flex;
  align-items: center;
  gap: var(--td-comp-margin-xs);
}
.bill-detail :deep(.bill-column-help) {
  color: var(--td-text-color-placeholder);
  cursor: help;
}
.department-name-line {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.leaf-department {
  padding-left: var(--td-comp-margin-l);
}
.bill-detail :deep(.t-table__tree-leaf-node) {
  display: flex;
  align-items: center;
}
.bill-detail :deep(.department-child-row:not(:hover) td) {
  background: var(--td-bg-color-page);
}
.department-name {
  color: var(--td-brand-color);
}

.bill-detail :deep(.t-table th),
.bill-detail :deep(.t-table td) {
  white-space: nowrap;
}
.bill-detail :deep(.t-table__content) {
  overflow-x: auto;
}

.bill-detail :deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.heading,
.metrics {
  display: flex;
  justify-content: space-between;
  gap: var(--td-comp-margin-l);
  flex-wrap: wrap;
}
.metrics > div {
  flex: 1;
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-page);
  border-radius: var(--td-radius-medium);
}
.metrics strong {
  font-size: var(--td-font-size-title-large);
}
small,
.hint {
  display: block;
  color: var(--td-text-color-secondary);
}
h3,
p {
  margin: 0;
}
.heading p,
small {
  margin-top: var(--td-comp-margin-s);
}
</style>
