<template>
  <div class="budget-page">
    <t-card v-if="headquarters" :bordered="false" class="hq-card">
      <div class="heading">
        <div class="hq-title">
          <t-avatar>{{ t('cost.enterprise').slice(0, 1) }}</t-avatar>
          <div>
            <h3>{{ t('cost.hq') }}</h3>
            <t-space
              ><span class="hint">{{ t('cost.enterprise') }}</span
              ><t-tag variant="light">{{
                t('cost.modeValue', { mode: t(`cost.${headquarters.budget_mode}`) })
              }}</t-tag></t-space
            >
          </div>
        </div>
        <t-button
          v-if="scope.headquarters"
          v-permission.write="'cost.budgets'"
          theme="default"
          @click="editBudget(headquarters)"
          >{{ t('cost.config') }}</t-button
        >
      </div>
      <div class="hq-metrics">
        <div>
          <span>{{ t('cost.budgetAmount') }}</span
          ><strong>{{ money(headquarters.budget_amount, headquarters.currency) }}</strong>
        </div>
        <div>
          <span>{{ t('cost.consumed') }}</span
          ><strong>{{ money(headquarters.consumed_amount, headquarters.currency) }}</strong>
        </div>
        <div>
          <span>{{ t('cost.remaining') }}</span
          ><strong>{{ money(headquarters.remaining_amount, headquarters.currency) }}</strong>
        </div>
        <div>
          <span>{{ t('cost.budgetPeriod') }}</span
          ><b>{{ periodText }}</b>
        </div>
      </div>
      <div class="hq-progress">
        <t-progress
          :percentage="Math.min(100, headquarters.usage)"
          :label="`${headquarters.usage.toFixed(1)}%`"
          :color="progressColor(headquarters)"
        /><t-tag :theme="statusTheme(headquarters.status)" variant="light">{{
          statusText(headquarters.status)
        }}</t-tag
        ><span class="hint">{{
          t('cost.actionLabel', { action: t(`cost.${headquarters.over_budget_action}`) })
        }}</span>
      </div>
    </t-card>
    <t-card :bordered="false" class="list-card">
      <t-tabs v-model="tab" @change="changeTab"
        ><t-tab-panel value="departments" :label="t('cost.departments')" /><t-tab-panel
          value="users"
          :label="t('cost.users')"
      /></t-tabs>
      <FilterBar class="filters"
        ><template #content
          ><div class="toolbar">
            <t-input
              v-model="search"
              :placeholder="t(tab === 'users' ? 'cost.userSearch' : 'cost.departmentSearch')"
              clearable
              @change="searchChanged"
            />
            <DepartmentSelect v-if="tab === 'users'" v-model="departmentId" @change="loadFirst" />
            <t-select
              v-model="status"
              :placeholder="t('cost.allStatus')"
              :options="statusOptions"
              clearable
              @change="loadFirst"
            />
            <t-button theme="default" variant="text" @click="reset">{{ t('cost.reset') }}</t-button>
            <t-button
              v-if="tab === 'users'"
              v-permission.write="'cost.budgets'"
              class="primary-action"
              @click="allocate"
              >{{ t(selected.length ? 'cost.batchAllocate' : 'cost.allocate') }}</t-button
            >
          </div></template
        ></FilterBar
      >
      <t-table
        row-key="id"
        :data="displayRows"
        :columns="columns"
        :loading="loading"
        :selected-row-keys="selected"
        @select-change="selectChange"
      >
        <template #department_id="{ row }"
          ><div
            class="department-cell"
            :style="{ paddingInlineStart: `calc(var(--td-comp-margin-l) * ${row.depth || 0})` }"
          >
            <t-button
              v-if="departments.get(row.department_id)?.has_children && !search && !status"
              size="small"
              variant="text"
              :aria-label="t('cost.expandDepartment', { name: deptName(row.department_id) })"
              @click="toggleBranch(row)"
              >{{ branches[row.id] ? '⌄' : '›' }}</t-button
            ><t-link theme="primary" @click="showDetail(row)">{{
              deptName(row.department_id)
            }}</t-link
            ><t-tag
              v-if="departments.get(row.department_id)?.has_children"
              size="small"
              variant="light"
              >{{ t('cost.includesChildren') }}</t-tag
            >
          </div></template
        >
        <template #username="{ row }"
          ><t-link theme="primary" @click="showDetail(row)">{{
            userName(row.user_id)
          }}</t-link></template
        >
        <template #name="{ row }">{{ users.find((u) => u.id === row.user_id)?.name }}</template>
        <template #userDepartment="{ row }">{{ deptName(row.department_id, true) }}</template>
        <template #budget_mode="{ row }">{{
          row.configured ? t(`cost.${row.budget_mode}`) : '—'
        }}</template>
        <template #budget_amount="{ row }">{{
          row.configured
            ? money(row.budget_amount, row.currency)
            : tab === 'departments'
              ? statusText(row.status)
              : '—'
        }}</template>
        <template #temporary_amount="{ row }">{{
          row.configured && row.temporary_amount ? money(row.temporary_amount, row.currency) : '—'
        }}</template>
        <template #effective_amount="{ row }">{{
          row.configured ? money(row.effective_amount, row.currency) : statusText(row.status)
        }}</template>
        <template #consumed_amount="{ row }">{{
          row.configured ? money(row.consumed_amount, row.currency) : '—'
        }}</template>
        <template #remaining_amount="{ row }">{{
          row.configured ? money(row.remaining_amount, row.currency) : '—'
        }}</template>
        <template #usage="{ row }"
          ><div v-if="row.configured" class="usage">
            <t-progress
              :percentage="Math.min(100, row.usage)"
              :label="false"
              :color="progressColor(row)"
            /><span>{{ row.usage.toFixed(1) }}%</span>
          </div>
          <span v-else class="hint">{{ deptName(row.source_department_id) }}</span></template
        >
        <template #status="{ row }"
          ><t-tag
            :theme="statusTheme(row.status)"
            :class="{ critical: row.status === 'CRITICAL' }"
            variant="light"
            >{{ statusText(row.status) }}</t-tag
          >
          <div v-if="row.status === 'INHERITED'" class="hint inherited">
            {{ t('cost.inheritedFrom', { name: deptName(row.source_department_id) }) }}
          </div></template
        >
        <template #over_budget_action="{ row }">{{
          row.status === 'UNCONFIGURED' ? '—' : t(`cost.${row.over_budget_action}`)
        }}</template>
        <template #actions="{ row }"
          ><t-space v-permission.write="'cost.budgets'"
            ><t-link theme="primary" @click="editBudget(row)">{{ t('cost.edit') }}</t-link
            ><t-link v-if="row.configured" theme="danger" @click="openRemove(row)">{{
              t('cost.removeBudget')
            }}</t-link></t-space
          ></template
        >
      </t-table>
      <div class="pagination-row">
        <span v-if="selected.length && tab === 'users'" class="selected">{{
          t('cost.selected', { count: selected.length })
        }}</span
        ><t-pagination
          :current="page"
          :page-size="pageSize"
          :total="total"
          :page-size-options="[10, 20, 50, 100]"
          show-jumper
          @change="pageChange"
        />
      </div>
    </t-card>
    <BudgetForm
      v-if="headquarters"
      :visible="formVisible"
      :kind="formKind"
      :budget="editing"
      :headquarters="headquarters"
      :department-id="editing?.department_id || ''"
      :selected-users="selected.map(String)"
      @close="formVisible = false"
      @saved="saved"
    />
    <BudgetDetail :budget="detail" :kind="tab" @close="detail = null" @edit="editFromDetail" />
    <t-dialog
      :visible="Boolean(removing)"
      :header="t('cost.removeBudget')"
      :confirm-btn="{ content: t('cost.confirm'), theme: 'danger', loading: saving }"
      :cancel-btn="t('cost.cancel')"
      @close="removing = null"
      @confirm="remove"
    >
      <div class="remove-form">
        <p>
          {{
            t(
              tab === 'departments'
                ? 'cost.removeDepartmentHint'
                : removing?.budget_mode === 'SHARED'
                  ? 'cost.removeUserShared'
                  : 'cost.removeUserIndependent',
            )
          }}
        </p>
        <template v-if="tab === 'users' && activeAdjustments.length"
          ><p>{{ t('cost.removeTemporary') }}</p>
          <div v-for="item in activeAdjustments" :key="item.id">
            {{ money(item.additional_amount, removing?.currency) }} ·
            {{ item.source_work_order_id }} · {{ formatDate(item.valid_until) }}
          </div></template
        ><t-checkbox v-if="tab === 'departments'" v-model="cascade">{{
          t('cost.cascade')
        }}</t-checkbox
        ><t-textarea v-model="reason" :placeholder="t('cost.reason')" /><t-alert
          v-if="removeError"
          theme="error"
          :message="removeError"
        />
      </div>
    </t-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MessagePlugin,
  type PageInfo,
  type PrimaryTableCol,
  type TableRowData,
} from 'tdesign-vue-next'
import {
  getDepartmentBudgets,
  getUserBudgets,
  getBudget,
  removeBudget,
  type Budget,
} from '@/api/modules/cost'
import { formatDate } from '@/utils/datetime'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentSelect from '../DepartmentSelect.vue'
import BudgetForm from './BudgetForm.vue'
import BudgetDetail from './BudgetDetail.vue'
import { useCost } from '../useCost'
import '@/styles/cost.css'
const {
  t,
  locale,
  init,
  users,
  scope,
  departments,
  ensureDepartments,
  deptName,
  money,
  userName,
  statusText,
  statusTheme,
  error,
} = useCost()
const route = useRoute(),
  router = useRouter()
const tab = ref<'departments' | 'users'>(route.query.tab === 'user' ? 'users' : 'departments')
const search = ref(''),
  departmentId = ref(''),
  status = ref(''),
  page = ref(1),
  pageSize = ref(20),
  total = ref(0),
  loading = ref(false)
const rows = ref<Budget[]>([]),
  headquarters = ref<Budget | null>(null),
  selected = ref<(string | number)[]>([]),
  branches = ref<Record<string, Budget[]>>({})
const formVisible = ref(false),
  editing = ref<Budget | null>(null),
  detail = ref<Budget | null>(null),
  removing = ref<Budget | null>(null),
  saving = ref(false),
  cascade = ref(false),
  reason = ref(''),
  removeError = ref('')
const formKind = ref<'departments' | 'users'>('departments')
const periodText = computed(() =>
  headquarters.value
    ? t('cost.periodRange', {
        start: headquarters.value.current_period_start,
        end: headquarters.value.current_period_end,
        type: t(`cost.${headquarters.value.period_type}`),
      })
    : '',
)
const statusOptions = computed(() =>
  (tab.value === 'users'
    ? ['SHARED', 'UNCONFIGURED', 'NORMAL', 'WARNING', 'CRITICAL', 'EXCEEDED']
    : ['INHERITED', 'NORMAL', 'WARNING', 'CRITICAL', 'EXCEEDED']
  ).map((value) => ({
    value,
    label: value === 'SHARED' ? t('cost.sharedBudget') : t(`cost.${value}`),
  })),
)
const columns = computed<PrimaryTableCol<TableRowData>[]>(() => {
  const fields =
    tab.value === 'departments'
      ? [
          ['department_id', 'departmentName', 220],
          ['budget_mode', 'mode', 110],
          ['budget_amount', 'budgetAmount', 130],
        ]
      : [
          ['username', 'username', 130],
          ['name', 'name', 100],
          ['userDepartment', 'department', 220],
          ['budget_amount', 'baseAmount', 120],
          ['temporary_amount', 'temporary', 120],
          ['effective_amount', 'effective', 150],
        ]
  return [
    ...(tab.value === 'users'
      ? [{ colKey: 'row-select', type: 'multiple' as const, width: 48, fixed: 'left' as const }]
      : []),
    ...[
      ...fields,
      ['consumed_amount', 'consumed', 120],
      ['remaining_amount', 'remaining', 120],
      ['usage', 'usage', 150],
      ['status', 'budgetStatus', 130],
      ['over_budget_action', 'action', 110],
      ['actions', 'actions', 160],
    ].map(([colKey, title, minWidth]) => ({
      colKey: String(colKey),
      title: t(`cost.${title}`),
      minWidth: Number(minWidth),
      ...(colKey === 'actions' ? { fixed: 'right' as const } : {}),
    })),
  ]
})
const displayRows = computed(() => {
  const output: (Budget & { depth: number })[] = []
  const visit = (items: Budget[], depth: number) =>
    items.forEach((item) => {
      output.push({ ...item, depth })
      if (branches.value[item.id]) visit(branches.value[item.id]!, depth + 1)
    })
  visit(rows.value, 0)
  return output
})
const activeAdjustments = computed(
  () => removing.value?.adjustments.filter((a) => a.status === 'ACTIVE') ?? [],
)
function progressColor(b: Budget) {
  return b.status === 'EXCEEDED'
    ? 'var(--td-error-color)'
    : b.status === 'CRITICAL'
      ? 'var(--td-warning-color-active)'
      : b.status === 'WARNING'
        ? 'var(--td-warning-color)'
        : 'var(--td-brand-color)'
}
let version = 0,
  searchTimer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const current = ++version
  loading.value = true
  branches.value = {}
  try {
    const query = {
      page: page.value,
      page_size: pageSize.value,
      search: search.value.trim(),
      status: status.value,
      department_id: departmentId.value,
    }
    const result =
      tab.value === 'departments' ? await getDepartmentBudgets(query) : await getUserBudgets(query)
    if (current !== version) return
    await ensureDepartments(
      result.items.flatMap((r) => [r.department_id, r.source_department_id ?? '']),
    )
    if (current !== version) return
    rows.value = result.items
    total.value = result.total
    if ('headquarters' in result) headquarters.value = result.headquarters as Budget
    if (page.value > 1 && !result.items.length) {
      page.value--
      void load()
    }
  } catch (err) {
    error(err)
  } finally {
    if (current === version) loading.value = false
  }
}
function loadFirst() {
  page.value = 1
  void load()
}
function searchChanged() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadFirst, 250)
}
function reset() {
  clearTimeout(searchTimer)
  search.value = ''
  status.value = ''
  departmentId.value = ''
  selected.value = []
  loadFirst()
}
function changeTab() {
  void router.replace({ query: tab.value === 'users' ? { tab: 'user' } : {} })
  detail.value = null
  reset()
}
function selectChange(keys: (string | number)[]) {
  selected.value = keys
}
function pageChange(info: PageInfo) {
  page.value = info.current
  pageSize.value = info.pageSize
  void load()
}
async function toggleBranch(row: Budget) {
  if (branches.value[row.id]) {
    delete branches.value[row.id]
    return
  }
  const current = version
  try {
    const result = await getDepartmentBudgets({
      page: 1,
      page_size: 100,
      parent_id: row.department_id,
    })
    await ensureDepartments(result.items.map((r) => r.department_id))
    if (current === version) branches.value[row.id] = result.items
  } catch (err) {
    error(err)
  }
}
function editBudget(budget: Budget) {
  formKind.value = budget.user_id ? 'users' : 'departments'
  editing.value = budget
  formVisible.value = true
}
function editFromDetail(budget: Budget) {
  detail.value = null
  editBudget(budget)
}
function allocate() {
  formKind.value = 'users'
  editing.value = null
  formVisible.value = true
}
async function showDetail(budget: Budget) {
  try {
    detail.value = await getBudget(tab.value, budget.id)
  } catch (err) {
    error(err)
  }
}
async function saved() {
  selected.value = []
  headquarters.value = (await getDepartmentBudgets({ page: 1, page_size: 20 })).headquarters
  await load()
  if (detail.value) detail.value = await getBudget(tab.value, detail.value.id)
}
function openRemove(budget: Budget) {
  removing.value = budget
  cascade.value = false
  reason.value = ''
  removeError.value = ''
}
async function remove() {
  if (!reason.value.trim()) {
    removeError.value = t('cost.reasonRequired')
    return
  }
  saving.value = true
  try {
    await removeBudget(tab.value, removing.value!.id, reason.value, cascade.value)
    removing.value = null
    void MessagePlugin.success(t('cost.removed'))
    await load()
  } catch (err) {
    error(err)
  } finally {
    saving.value = false
  }
}
watch(locale, load)
onMounted(async () => {
  try {
    await init()
    const result = await getDepartmentBudgets({ page: 1, page_size: 20 })
    headquarters.value = result.headquarters
    await load()
  } catch (err) {
    error(err)
  }
})
onBeforeUnmount(() => {
  version++
  clearTimeout(searchTimer)
})
</script>
<style scoped>
.budget-page,
.list-card :deep(.t-card__body),
.hq-card :deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.heading,
.hq-title,
.hq-progress,
.toolbar,
.department-cell,
.pagination-row {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.heading {
  justify-content: space-between;
}
.hq-title {
  gap: var(--td-comp-margin-l);
}
h3 {
  font-size: var(--td-font-size-title-small);
  margin: 0 0 var(--td-comp-margin-xs);
}
.hq-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr) 2fr;
  gap: var(--td-comp-margin-l);
}
.hq-metrics span {
  display: block;
  color: var(--td-text-color-secondary);
  margin-bottom: var(--td-comp-margin-s);
}
.hq-metrics strong {
  font-size: var(--td-font-size-title-large);
  font-weight: var(--td-font-weight-600);
}
.hq-progress :deep(.t-progress) {
  flex: 1;
}
.hq-progress {
  flex-wrap: wrap;
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.inherited {
  font-style: italic;
}
.filters {
  margin: 0;
}
.filters :deep(.t-card__body) {
  padding: 0;
}
.toolbar {
  flex-wrap: wrap;
}
.toolbar > :deep(.t-input__wrap) {
  width: var(--cost-search-width);
}
.toolbar > :deep(.t-select__wrap),
.toolbar > :deep(.t-tree-select) {
  width: var(--cost-filter-width);
}
.primary-action {
  margin-inline-start: auto;
}
.toolbar > :deep(.cost-department-select) {
  width: var(--cost-search-width);
}
.usage {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.usage :deep(.t-progress) {
  flex: 1;
}
.usage span {
  white-space: nowrap;
}
.critical {
  color: var(--td-warning-color-active);
  background: var(--td-warning-color-light);
}
.pagination-row {
  flex-wrap: wrap;
  justify-content: space-between;
}
.pagination-row :deep(.t-pagination) {
  flex: 1;
}
.selected {
  white-space: nowrap;
}
.remove-form {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.remove-form p {
  margin: 0;
}
</style>
