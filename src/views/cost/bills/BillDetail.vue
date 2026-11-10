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
        ><span>{{ bill.period_start }} ~ {{ bill.period_end }}</span
        ><t-tag>{{ t(`cost.${bill.period_type}`) }}</t-tag
        ><span>{{
          t('cost.scope', { name: t('cost.range', { name: deptName(bill.department_id) }) })
        }}</span></t-space
      >
      <div class="metrics">
        <div v-for="item in metrics" :key="item.label">
          <span>{{ item.label }}</span
          ><strong>{{ item.value }}</strong>
        </div>
      </div>
      <t-tabs
        ref="tabsRef"
        class="drawer-tabs drawer-tabs--standalone"
        v-model="dimension"
        @change="reset"
        ><t-tab-panel
          v-for="value in dimensions"
          :key="value"
          :value="value"
          :label="t(`cost.${value}`)"
      /></t-tabs>
      <div class="toolbar">
        <DepartmentSelect
          v-if="dimension === 'DEPARTMENT'"
          v-model="departmentId"
          :root-id="bill.department_id"
          @change="reset"
        />
        <t-select v-model="sortBy" :options="sortOptions" @change="reset" />
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
        :expand-icon="dimension !== 'DEPARTMENT'"
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
        <template #tokens="{ row }">{{ tokens(row.input_tokens + row.output_tokens) }}</template>
        <template #request_count="{ row }">{{ number(row.request_count) }}</template>
        <template #cost_ratio="{ row }">{{ row.cost_ratio.toFixed(1) }}%</template>
        <template #service_type="{ row }">{{ t(`cost.${row.service_type}`) }}</template>
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
import DepartmentSelect from '../DepartmentSelect.vue'
import { downloadBlob } from './download'
const props = defineProps<{ bill: Bill | null }>()
const emit = defineEmits<{ close: [] }>()
const { t, money, tokens, number, deptName, error, locale } = useCost()
const dimension = ref<Dimension>('PROVIDER'),
  departmentId = ref(''),
  sortBy = ref('cost'),
  direction = ref('desc')
const tabsRef = useDrawerTabs(dimension)
const dimensions: Dimension[] = ['PROVIDER', 'DEPARTMENT', 'USER', 'MODEL']
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
  ['cost', 'tokens', 'requests'].map((value) => ({
    value,
    label: t(
      `cost.${value === 'cost' ? 'sortCost' : value === 'tokens' ? 'sortTokens' : 'sortRequests'}`,
    ),
  })),
)
const metrics = computed(() =>
  props.bill
    ? [
        { label: t('cost.totalCost'), value: money(props.bill.total_cost, props.bill.currency) },
        {
          label: t('cost.tokens'),
          value: tokens(props.bill.total_input_tokens + props.bill.total_output_tokens),
        },
        { label: t('cost.totalRequests'), value: number(props.bill.total_requests) },
        {
          label: t('cost.average'),
          value: money(
            props.bill.total_requests ? props.bill.total_cost / props.bill.total_requests : 0,
            props.bill.currency,
          ),
        },
      ]
    : [],
)
const columns = computed<PrimaryTableCol<TableRowData>[]>(() => [
  { colKey: 'dimension_name', title: t(`cost.${dimension.value}`), minWidth: 180 },
  ...(dimension.value === 'PROVIDER'
    ? [{ colKey: 'service_type', title: t('cost.serviceType'), width: 110 }]
    : []),
  ...(dimension.value === 'USER'
    ? [
        { colKey: 'name', title: t('cost.name'), width: 100 },
        { colKey: 'department_path', title: t('cost.department'), minWidth: 160 },
      ]
    : []),
  { colKey: 'cost', title: t('cost.cost'), minWidth: 120 },
  { colKey: 'tokens', title: t('cost.tokenAmount'), minWidth: 100 },
  { colKey: 'request_count', title: t('cost.requests'), minWidth: 100 },
  { colKey: 'cost_ratio', title: t('cost.ratio'), minWidth: 100 },
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
async function reset() {
  branches.value = {}
  expanded.value = []
  if (!props.bill) return
  const current = ++version
  loading.value = true
  try {
    const result = await getBillItems(props.bill.id, {
      dimension: dimension.value,
      department_id: departmentId.value || undefined,
      ...(dimension.value === 'DEPARTMENT' ? { parent_id: '' } : {}),
      sort_by: sortBy.value,
      direction: direction.value,
    })
    if (current === version) items.value = result
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
      department_id: departmentId.value || undefined,
      parent_id: row.dimension_id,
      sort_by: sortBy.value,
      direction: direction.value,
    })
    if (version === current) branches.value[row.id] = children
  } catch (err) {
    error(err)
  }
}
async function download() {
  exporting.value = true
  try {
    downloadBlob(
      await exportBill(props.bill!.id, dimension.value, departmentId.value || undefined),
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
    dimension.value = 'PROVIDER'
    departmentId.value = ''
    void reset()
  },
)
watch(locale, reset)
</script>
<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
