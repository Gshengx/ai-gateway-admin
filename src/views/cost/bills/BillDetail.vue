<template>
  <t-drawer
    :visible="Boolean(bill)"
    :header="t('cost.billDetail', { period: bill?.period_start.slice(0, 7) })"
    size="var(--cost-drawer-width)"
    :footer="false"
    @close="emit('close')"
  >
    <div v-if="bill" class="detail">
      <t-space break-line
        ><span>{{ formatDate(bill.period_start) }} ~ {{ formatDate(bill.period_end) }}</span
        ><t-tag>{{ t(`cost.${bill.period_type}`) }}</t-tag
        ><span>{{
          t('cost.scope', { name: t('cost.range', { name: deptName(bill.department_id) }) })
        }}</span></t-space
      >
      <div class="metrics">
        <div v-for="item in metrics" :key="item.label">
          <t-tooltip
            :content="
              item.label === t('cost.tokens')
                ? t('expenses.tokenHelp')
                : item.label === t('cost.totalRequests')
                  ? t('expenses.requestsHelp')
                  : item.label === t('cost.average')
                    ? t('expenses.averageHelp')
                    : t('expenses.costHelp')
            "
            ><span
              >{{ item.label }} <span class="metric-help" tabindex="0">?</span></span
            ></t-tooltip
          ><strong>{{ item.value }}</strong>
        </div>
      </div>
      <t-tabs
        ref="tabsRef"
        class="drawer-tabs drawer-tabs--standalone"
        v-model="dimension"
        @change="changeDimension"
        ><t-tab-panel
          v-for="value in dimensions"
          :key="value"
          :value="value"
          :label="t(`expenses.dim${value}`)"
      /></t-tabs>
      <div class="toolbar list-toolbar">
        <DepartmentPicker
          class="list-department"
          v-if="dimension === 'DEPARTMENT' || dimension === 'USER' || dimension === 'PROJECT'"
          v-model="departmentIds"
          unrestricted
          :root-id="bill.department_id"
          @update:model-value="reset"
        />
        <t-select
          class="list-filter"
          v-if="dimension !== 'DEPARTMENT'"
          v-model="dimensionId"
          :options="dimensionOptions"
          :placeholder="
            dimension === 'PROJECT' ? t('budgetPlan.projectName') : t(`cost.${dimension}`)
          "
          clearable
          @change="reset"
        />
        <t-select
          class="list-filter"
          v-if="dimension === 'PROJECT'"
          v-model="projectStatus"
          :options="
            ['ACTIVE', 'DISABLED', 'ARCHIVED'].map((value) => ({
              value,
              label: t(`projects.${value}`),
            }))
          "
          :placeholder="t('budgetPlan.projectStatus')"
          clearable
          @change="reset"
        />
        <t-select
          class="list-filter"
          v-if="dimension === 'USER'"
          v-model="ownerType"
          :options="
            ['USER_DEPARTMENT', 'PROJECT'].map((value) => ({
              value,
              label: t(`expenses.${value}`),
            }))
          "
          :placeholder="t('expenses.cost_owner_type')"
          clearable
          @change="reset"
        />
        <t-select class="list-filter" v-model="sortBy" :options="sortOptions" @change="reset" />
        <t-button theme="default" @click="toggleDirection">{{ t(`cost.${direction}`) }}</t-button>
        <t-button theme="primary" variant="outline" :loading="exporting" @click="download">{{
          t('cost.exportCsv')
        }}</t-button>
      </div>
      <t-table
        :data="displayRows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :expanded-row-keys="expanded"
        :expand-icon="dimension === 'USER' || dimension === 'PROVIDER'"
        @expand-change="onExpand"
      >
        <template #dimension_name="{ row }">
          <div
            class="name-cell"
            :style="{ paddingInlineStart: `calc(var(--td-comp-margin-l) * ${row.depth || 0})` }"
          >
            <t-button
              v-if="dimension === 'DEPARTMENT' && row.has_children"
              variant="text"
              size="small"
              :aria-label="t('cost.expandDepartment', { name: row.dimension_name })"
              @click="toggleBranch(row)"
              >{{ branches[row.id] ? '⌄' : '›' }}</t-button
            >
            <t-link
              theme="primary"
              @click="
                expanded = expanded.includes(row.id)
                  ? expanded.filter((id) => id !== row.id)
                  : [...expanded, row.id]
              "
              >{{ row.dimension_name }}</t-link
            >
            <t-tag
              v-if="dimension === 'DEPARTMENT' && row.has_children"
              size="small"
              variant="light"
              >{{ t('cost.includesChildren') }}</t-tag
            >
          </div>
        </template>
        <template #cost="{ row }">{{ money(row.cost, bill.currency) }}</template>
        <template #direct_cost="{ row }">{{ money(row.direct_cost ?? 0, bill.currency) }}</template
        ><template #project_cost="{ row }">{{
          money(row.project_cost ?? 0, bill.currency)
        }}</template>
        <template #tokens="{ row }">{{
          tokens(row.input_tokens + row.output_tokens + (row.cached_tokens ?? 0))
        }}</template>
        <template #request_count="{ row }">{{ number(row.request_count) }}</template>
        <template #cost_ratio="{ row }">{{ row.cost_ratio.toFixed(1) }}%</template>
        <template #service_type="{ row }">{{ t(`cost.${row.service_type}`) }}</template>
        <template #actions="{ row }"
          ><t-link theme="primary" @click="goExpenses(row)">{{
            t('expenses.title')
          }}</t-link></template
        >
        <template #expandedRow="{ row }">
          <t-table
            size="small"
            :data="row.details"
            row-key="name"
            :columns="detailColumns"
            :bordered="false"
          >
            <template #cost="{ row: item }">{{ money(item.cost, bill.currency) }}</template>
            <template #tokens="{ row: item }">{{ tokens(item.tokens) }}</template>
          </t-table>
        </template>
      </t-table>
    </div>
  </t-drawer>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { formatDate } from '@/utils/datetime'
import { useDrawerTabs } from '@/utils/useDrawerTabs'
import type { PrimaryTableCol, TableRowData } from 'tdesign-vue-next'
import {
  getBillItems,
  exportBill,
  type Bill,
  type BillItem,
  type Dimension,
} from '@/api/modules/cost'
import { useCost } from '../useCost'
import DepartmentPicker from '../budgets/DepartmentPicker.vue'
import { downloadBlob } from './download'
const router = useRouter()
const props = defineProps<{ bill: Bill | null }>()
const emit = defineEmits<{ close: [] }>()
const { t, money, tokens, number, deptName, error, locale } = useCost()
const dimension = ref<Dimension>('PROJECT'),
  departmentIds = ref<string[]>([]),
  dimensionId = ref(''),
  projectStatus = ref(''),
  ownerType = ref(''),
  sortBy = ref('cost'),
  direction = ref('desc')
const dimensionChoices = ref<BillItem[]>([])
const dimensionOptions = computed(() =>
  dimensionChoices.value.map((r) => ({ value: r.dimension_id, label: r.dimension_name })),
)
const tabsRef = useDrawerTabs(dimension)
const dimensions: Dimension[] = ['PROJECT', 'DEPARTMENT', 'USER', 'MODEL', 'PROVIDER']
const items = ref<BillItem[]>([]),
  loading = ref(false),
  exporting = ref(false),
  expanded = ref<(string | number)[]>([])
const branches = ref<Record<string, BillItem[]>>({})
function onExpand(keys: (string | number)[]) {
  expanded.value = keys
}
function toggleDirection() {
  direction.value = direction.value === 'desc' ? 'asc' : 'desc'
  void reset()
}
let version = 0
const sortOptions = computed(() =>
  ['cost', 'tokens', 'requests', 'ratio'].map((value) => ({
    value,
    label: t(
      `cost.${value === 'cost' ? 'sortCost' : value === 'tokens' ? 'sortTokens' : value === 'ratio' ? 'ratio' : 'sortRequests'}`,
    ),
  })),
)
const metrics = computed(() =>
  props.bill
    ? [
        { label: t('cost.totalCost'), value: money(props.bill.total_cost, props.bill.currency) },
        {
          label: t('expenses.directSpend'),
          value: money(props.bill.direct_cost ?? 0, props.bill.currency),
        },
        {
          label: t('expenses.projectSpend'),
          value: money(props.bill.project_cost ?? 0, props.bill.currency),
        },
        {
          label: t('cost.tokens'),
          value: tokens(
            props.bill.total_input_tokens +
              props.bill.total_output_tokens +
              (props.bill.total_cached_tokens ?? 0),
          ),
        },
        { label: t('cost.totalRequests'), value: number(props.bill.total_requests) },
        {
          label: t('cost.average'),
          value: new Intl.NumberFormat(locale.value, {
            style: 'currency',
            currency: props.bill.currency,
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(
            props.bill.total_requests ? props.bill.total_cost / props.bill.total_requests : 0,
          ),
        },
      ]
    : [],
)
const columns = computed<PrimaryTableCol<TableRowData>[]>(() => [
  {
    colKey: 'dimension_name',
    title:
      dimension.value === 'PROJECT' ? t('budgetPlan.projectName') : t(`cost.${dimension.value}`),
    minWidth: 180,
  },
  ...(dimension.value === 'PROVIDER'
    ? [{ colKey: 'service_type', title: t('cost.serviceType'), width: 110 }]
    : []),
  ...(dimension.value === 'PROJECT'
    ? [{ colKey: 'department_path', title: t('budgetPlan.responsible'), minWidth: 180 }]
    : []),
  ...(dimension.value === 'USER'
    ? [
        { colKey: 'name', title: t('cost.name'), width: 100 },
        { colKey: 'department_path', title: t('cost.department'), minWidth: 160 },
      ]
    : []),
  { colKey: 'cost', title: t('cost.cost'), minWidth: 120 },
  ...(['USER', 'DEPARTMENT'].includes(dimension.value)
    ? [
        { colKey: 'direct_cost', title: t('expenses.directSpend'), minWidth: 120 },
        { colKey: 'project_cost', title: t('expenses.projectSpend'), minWidth: 120 },
      ]
    : []),
  { colKey: 'tokens', title: t('cost.tokenAmount'), minWidth: 100 },
  { colKey: 'request_count', title: t('cost.requests'), minWidth: 100 },
  { colKey: 'cost_ratio', title: t('cost.ratio'), minWidth: 100 },
  { colKey: 'actions', title: t('cost.actions'), minWidth: 110 },
])
const detailColumns = computed(() => [
  {
    colKey: 'name',
    title: t(
      `cost.${['PROVIDER', 'MODEL'].includes(dimension.value) ? 'physicalModel' : 'logicalModel'}`,
    ),
  },
  { colKey: 'cost', title: t('cost.cost') },
  { colKey: 'tokens', title: t('cost.tokenAmount') },
  { colKey: 'request_count', title: t('cost.requests') },
])
const displayRows = computed(() => {
  const result: (BillItem & { depth: number })[] = []
  const visit = (rows: BillItem[], depth: number) =>
    rows.forEach((r) => {
      result.push({ ...r, depth })
      if (branches.value[r.id]) visit(branches.value[r.id]!, depth + 1)
    })
  visit(items.value, 0)
  return result
})
function filters() {
  const key =
    dimension.value === 'PROJECT'
      ? 'project_id'
      : dimension.value === 'USER'
        ? 'user_id'
        : dimension.value === 'MODEL'
          ? 'model_id'
          : 'provider_id'
  return {
    [key]: dimensionId.value || undefined,
    ...(dimension.value === 'PROJECT'
      ? {
          project_department_ids: departmentIds.value.join(',') || undefined,
          project_status: projectStatus.value || undefined,
        }
      : { department_ids: departmentIds.value.join(',') || undefined }),
    cost_owner_type: ownerType.value || undefined,
  }
}
function changeDimension() {
  dimensionId.value = ''
  departmentIds.value = []
  projectStatus.value = ''
  ownerType.value = ''
  void reset()
}
async function reset() {
  branches.value = {}
  expanded.value = []
  if (!props.bill) return
  const current = ++version
  loading.value = true
  try {
    const result = await getBillItems(props.bill.id, {
      dimension: dimension.value,
      ...filters(),
      ...(dimension.value === 'DEPARTMENT' ? { parent_id: '' } : {}),
      sort_by: sortBy.value,
      direction: direction.value,
    })
    if (current === version) {
      items.value = result
      if (!dimensionId.value) dimensionChoices.value = result
      if (dimension.value === 'DEPARTMENT')
        for (const row of result.filter((r) => r.has_children)) await toggleBranch(row)
    }
  } catch (err) {
    error(err)
  } finally {
    if (current === version) loading.value = false
  }
}
async function toggleBranch(row: BillItem) {
  if (branches.value[row.id]) {
    delete branches.value[row.id]
    return
  }
  const current = version
  try {
    const children = await getBillItems(props.bill!.id, {
      dimension: 'DEPARTMENT',
      ...filters(),
      parent_id: row.dimension_id,
      sort_by: sortBy.value,
      direction: direction.value,
    })
    if (version === current) branches.value[row.id] = children
  } catch (err) {
    error(err)
  }
}
function goExpenses(row: BillItem) {
  const key =
    dimension.value === 'PROJECT'
      ? 'project_id'
      : dimension.value === 'USER'
        ? 'user_id'
        : dimension.value === 'MODEL'
          ? 'model_id'
          : dimension.value === 'PROVIDER'
            ? 'provider_id'
            : 'department_id'
  void router.push({
    path: '/cost/expenses',
    query: {
      billId: props.bill!.id,
      start: props.bill!.period_start,
      end: props.bill!.period_end,
      [key]: row.dimension_id,
    },
  })
}
async function download() {
  exporting.value = true
  try {
    downloadBlob(
      await exportBill(props.bill!.id, dimension.value, undefined, filters()),
      `${props.bill!.period_start}-${dimension.value}.csv`,
    )
  } catch (err) {
    error(err)
  } finally {
    exporting.value = false
  }
}
watch(
  () => props.bill,
  () => {
    dimension.value = 'PROJECT'
    departmentIds.value = []
    dimensionId.value = ''
    projectStatus.value = ''
    ownerType.value = ''
    void reset()
  },
)
watch(locale, reset)
</script>
<style scoped>
.metric-help {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-circle);
  width: var(--td-comp-size-xxxs);
  height: var(--td-comp-size-xxxs);
  font-size: var(--td-font-size-body-small);
}
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--td-comp-margin-l);
  background: var(--td-bg-color-secondarycontainer);
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  border-radius: var(--td-radius-medium);
}
.metrics span {
  color: var(--td-text-color-secondary);
}
.metrics strong {
  display: block;
  margin-top: var(--td-comp-margin-s);
  font-size: var(--td-font-size-title-large);
  font-weight: var(--td-font-weight-600);
}
.toolbar,
.name-cell {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  flex-wrap: wrap;
}
.toolbar :deep(.t-select__wrap),
.toolbar > :deep(.t-tree-select) {
  width: var(--cost-filter-width);
}
.toolbar > :deep(.cost-department-select) {
  width: var(--cost-search-width);
}
</style>
