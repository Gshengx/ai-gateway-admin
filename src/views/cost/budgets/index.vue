<template>
  <div class="budget-page">
    <t-card v-if="headquarters" :bordered="false" class="hq-card">
      <div class="heading">
        <div class="hq-title">
          <t-avatar>{{ t('cost.enterprise').slice(0, 1) }}</t-avatar>
          <div>
            <h3>
              {{
                scope.headquarters
                  ? t('cost.hq')
                  : t('budgetPlan.departmentCard', { name: deptName(scope.root) })
              }}
            </h3>
            <t-space
              ><span class="hint">{{
                scope.headquarters ? t('cost.enterprise') : deptName(scope.root, true)
              }}</span
              ><t-tag variant="light">{{
                t('cost.modeValue', { mode: t(`cost.${headquarters.budget_mode}`) })
              }}</t-tag
              ><span class="hint">{{
                t('cost.actionLabel', { action: t(`cost.${headquarters.over_budget_action}`) })
              }}</span></t-space
            >
          </div>
        </div>
        <t-space
          ><t-button theme="default" @click="showDetail(headquarters)">{{
            t('budgetPlan.view')
          }}</t-button
          ><t-button
            v-permission.write="'cost.budgets'"
            theme="default"
            @click="editBudget(headquarters)"
            >{{ t('cost.config') }}</t-button
          ></t-space
        >
      </div>
      <div class="budget-summary" :class="{ divided: (headquarters.periods?.length ?? 0) > 1 }">
        <section>
          <div class="heading">
            <strong>{{ t('budgetPlan.overall') }}</strong
            ><t-tag variant="light">{{
              t('budgetPlan.count', { count: headquarters.periods?.length ?? 0 })
            }}</t-tag>
          </div>
          <p class="hint">
            {{ formatDate(headquarters.effective_start ?? '') }} —
            {{ formatDate(headquarters.effective_end ?? '') }} ·
            {{
              t(
                headquarters.period_type === 'YEARLY'
                  ? 'budgetPlan.yearly'
                  : `cost.${headquarters.period_type}`,
              )
            }}
          </p>
          <div class="hq-metrics">
            <div class="overall-balance">
              <span>{{ t('cost.remaining') }}</span
              ><strong :class="{ negative: headquarters.remaining_amount < 0 }">{{
                money(headquarters.remaining_amount, headquarters.currency)
              }}</strong>
            </div>
            <div>
              <span>{{ t('cost.budgetAmount') }}</span
              ><strong>{{ money(headquarters.budget_amount, headquarters.currency) }}</strong>
            </div>
            <div>
              <span>{{ t('cost.consumed') }}</span
              ><strong>{{ money(headquarters.consumed_amount, headquarters.currency) }}</strong>
            </div>
          </div>
          <div class="hq-progress">
            <span>{{ t('cost.usage') }}</span
            ><t-progress
              :percentage="Math.min(100, headquarters.usage)"
              :label="`${headquarters.usage.toFixed(1)}%`"
              :color="progressColor(headquarters)"
            /><t-tag :theme="statusTheme(headquarters.status)" variant="light">{{
              statusText(headquarters.status)
            }}</t-tag>
          </div>
          <div class="time-progress">
            <span>{{ t('budgetPlan.timeProgress') }}</span
            ><t-progress :percentage="timeProgress" />
          </div>
        </section>
        <section v-if="(headquarters.periods?.length ?? 0) > 1">
          <strong>{{ t('budgetPlan.current') }}</strong
          ><template v-if="headquarters.current"
            ><p class="hint">{{ periodText }}</p>
            <div class="hq-metrics">
              <div>
                <span>{{ t('budgetPlan.currentBudget') }}</span
                ><strong>{{ money(headquarters.current.amount, headquarters.currency) }}</strong>
              </div>
              <div>
                <span>{{ t('budgetPlan.currentConsumed') }}</span
                ><strong>{{ money(headquarters.current.consumed, headquarters.currency) }}</strong>
              </div>
              <div>
                <span>{{ t('budgetPlan.currentRemaining') }}</span
                ><strong :class="{ negative: headquarters.current.remaining < 0 }">{{
                  money(headquarters.current.remaining, headquarters.currency)
                }}</strong>
              </div>
            </div>
            <t-tag :theme="statusTheme(periodStatus(headquarters))" variant="light">{{
              statusText(periodStatus(headquarters))
            }}</t-tag></template
          >
          <p v-else class="hint">{{ t('budgetPlan.noCurrent') }}</p>
        </section>
      </div>
    </t-card>
    <t-card :bordered="false" class="list-card">
      <t-tabs v-model="tab" @change="changeTab"
        ><t-tab-panel value="departments" :label="t('cost.departments')" /><t-tab-panel
          value="projects"
          :label="t('budgetPlan.projects')" /><t-tab-panel value="users" :label="t('cost.users')"
      /></t-tabs>
      <ProjectBudgets v-if="tab === 'projects'" />
      <div v-else class="budget-list-content">
        <FilterBar class="filters"
          ><template #content
            ><div class="toolbar list-toolbar">
              <t-input
                class="list-search"
                v-model="search"
                :placeholder="t(tab === 'users' ? 'cost.userSearch' : 'cost.departmentSearch')"
                clearable
                @change="searchChanged"
              />
              <DepartmentSelect
                class="list-department"
                v-if="tab === 'users'"
                v-model="departmentId"
                @change="loadFirst"
              />
              <t-select
                class="list-filter"
                v-model="status"
                :placeholder="t('cost.allStatus')"
                :options="statusOptions"
                clearable
                @change="loadFirst"
              />
              <t-button theme="default" variant="base" @click="reset">{{
                t('cost.reset')
              }}</t-button>
              <t-button
                v-permission.write="'cost.budgets'"
                class="primary-action"
                @click="allocate"
                >{{
                  t(
                    tab === 'departments'
                      ? 'budgetPlan.createDepartment'
                      : selected.length
                        ? 'cost.batchAllocate'
                        : 'cost.allocate',
                  )
                }}</t-button
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
          <template #range="{ row }">{{
            row.configured
              ? `${formatDate(row.effective_start)} — ${formatDate(row.effective_end)}`
              : '—'
          }}</template>
          <template #period="{ row }"
            >{{
              row.configured
                ? t(row.period_type === 'YEARLY' ? 'budgetPlan.yearly' : `cost.${row.period_type}`)
                : '—'
            }}
            <p v-if="row.current" class="hint">
              {{ formatDate(row.current.start) }} — {{ formatDate(row.current.end) }}
            </p></template
          >
          <template #current="{ row }"
            ><template v-if="row.configured && row.current"
              ><div>
                {{ money(row.current.consumed, row.currency) }} /
                {{ money(row.current.amount, row.currency) }}
              </div>
              <t-tag size="small" :theme="statusTheme(periodStatus(row))" variant="light">{{
                t(`cost.${periodStatus(row)}`)
              }}</t-tag></template
            ><span v-else>—</span></template
          >
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
          <t-pagination
            :current="page"
            :page-size="pageSize"
            :total="total"
            :page-size-options="[10, 20, 50, 100]"
            show-jumper
            @change="pageChange"
          />
        </div>
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
    <BudgetDetail
      :budget="detail"
      :kind="detail?.user_id ? 'users' : 'departments'"
      @close="detail = null"
      @edit="editFromDetail"
    />
    <t-dialog
      :visible="Boolean(removing)"
      :header="t('cost.removeBudget')"
      :confirm-btn="{
        content: t('cost.confirm'),
        theme: 'danger',
        loading: saving,
        disabled: Boolean(removing?.has_dependents && !cascade),
      }"
      :cancel-btn="t('cost.cancel')"
      @close="removing = null"
      @confirm="remove"
    >
      <div class="remove-form">
        <p>
          {{
            t(
              tab === 'departments'
                ? removing?.has_dependents
                  ? 'budgetPlan.removeDepartmentDependencies'
                  : 'cost.removeDepartmentHint'
                : removing?.budget_mode === 'SHARED'
                  ? 'cost.removeUserShared'
                  : 'cost.removeUserIndependent',
              {
                name: deptName(removing?.department_id),
                user: users.find((u) => u.id === removing?.user_id)
                  ? `${userName(removing?.user_id ?? null)}（${users.find((u) => u.id === removing?.user_id)?.name}）`
                  : '',
              },
            )
          }}
        </p>
        <template v-if="tab === 'users' && activeAdjustments.length"
          ><p>{{ t('cost.removeTemporary') }}</p>
          <div v-for="item in activeAdjustments" :key="item.id">
            {{ money(item.additional_amount, removing?.currency) }} ·
            {{ item.source_work_order_id }} · {{ formatDate(item.valid_until) }}
          </div></template
        ><t-checkbox v-if="tab === 'departments' && removing?.has_dependents" v-model="cascade">{{
          t('budgetPlan.cascade')
        }}</t-checkbox
        ><t-alert v-if="removeError" theme="error" :message="removeError" />
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
import ProjectBudgets from './ProjectBudgets.vue'
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
const tab = ref<'departments' | 'users' | 'projects'>(
  ['projects', 'project'].includes(String(route.query.tab))
    ? 'projects'
    : route.query.tab === 'user'
      ? 'users'
      : 'departments',
)
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
const timeProgress = computed(() => {
  const b = headquarters.value
  if (!b?.effective_start || !b.effective_end) return 0
  const start = Date.parse(b.effective_start),
    end = Date.parse(b.effective_end) + 86400000
  return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (end - start)) * 100)))
})
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
          ['range', 'validity', 200],
          ['budget_amount', 'budgetAmount', 130],
        ]
      : [
          ['username', 'username', 130],
          ['name', 'name', 100],
          ['userDepartment', 'department', 220],
          ['range', 'validity', 200],
          ['budget_amount', 'baseAmount', 120],
          ['temporary_amount', 'temporary', 120],
          ['effective_amount', 'effective', 150],
        ]
  const flat: PrimaryTableCol<TableRowData>[] = [
    ...(tab.value === 'users'
      ? [{ colKey: 'row-select', type: 'multiple' as const, width: 48, fixed: 'left' as const }]
      : []),
    ...[
      ...fields,
      ['consumed_amount', 'consumed', 120],
      ['remaining_amount', 'remaining', 120],
      ['usage', 'usage', 150],
      ['status', 'budgetStatus', 130],
      ['period', 'budgetPeriod', 180],
      ['current', 'budgetAmount', 180],
      ['over_budget_action', 'action', 110],
      ['actions', 'actions', 160],
    ].map(([colKey, title, minWidth]) => ({
      colKey: String(colKey),
      title: t(`cost.${title}`),
      minWidth: Number(minWidth),
      ...(colKey === 'actions' ? { fixed: 'right' as const } : {}),
    })),
  ]
  const basic = flat.filter((c) =>
    [
      'row-select',
      'department_id',
      'budget_mode',
      'username',
      'name',
      'userDepartment',
      'range',
    ].includes(c.colKey ?? ''),
  )
  const overall = flat.filter((c) =>
    [
      'budget_amount',
      'temporary_amount',
      'effective_amount',
      'consumed_amount',
      'remaining_amount',
      'usage',
      'status',
    ].includes(c.colKey ?? ''),
  )
  const current = flat.filter((c) => ['period', 'current'].includes(c.colKey ?? ''))
  const other = flat.filter((c) => ['over_budget_action', 'actions'].includes(c.colKey ?? ''))
  return [
    { colKey: 'basic', title: t('budgetPlan.basic'), children: basic },
    { colKey: 'overall', title: t('budgetPlan.overall'), children: overall },
    { colKey: 'current', title: t('budgetPlan.current'), children: current },
    { colKey: 'other', title: t('budgetPlan.other'), children: other },
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
function periodStatus(b: Budget) {
  const usage = b.current?.amount ? (b.current.consumed / b.current.amount) * 100 : 0
  return usage >= 100
    ? 'EXCEEDED'
    : usage >= b.critical_threshold
      ? 'CRITICAL'
      : usage >= b.warning_threshold
        ? 'WARNING'
        : 'NORMAL'
}
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
  if (tab.value === 'projects') return
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
  void router.replace({
    query:
      tab.value === 'projects' ? { tab: 'project' } : tab.value === 'users' ? { tab: 'user' } : {},
  })
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
  formKind.value = tab.value === 'users' ? 'users' : 'departments'
  editing.value = null
  formVisible.value = true
}
async function showDetail(budget: Budget) {
  try {
    detail.value = await getBudget(budget.user_id ? 'users' : 'departments', budget.id)
  } catch (err) {
    error(err)
  }
}
async function saved() {
  selected.value = []
  headquarters.value = (await getDepartmentBudgets({ page: 1, page_size: 20 })).headquarters
  await load()
  if (detail.value)
    detail.value = await getBudget(tab.value === 'users' ? 'users' : 'departments', detail.value.id)
}
function openRemove(budget: Budget) {
  removing.value = budget
  cascade.value = false
  reason.value = ''
  removeError.value = ''
}
async function remove() {
  saving.value = true
  try {
    await removeBudget(
      tab.value === 'users' ? 'users' : 'departments',
      removing.value!.id,
      reason.value,
      cascade.value,
    )
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
.budget-summary {
  display: grid;
  gap: var(--td-comp-margin-l);
}
.budget-summary.divided {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.budget-summary section {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.budget-summary p {
  margin: 0;
}
.budget-summary.divided section + section {
  border-inline-start: 1px solid var(--td-component-stroke);
  padding-inline-start: var(--td-comp-paddingLR-l);
}

.overall-balance {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
.overall-balance strong {
  font-size: var(--td-font-size-headline-large);
}
.negative {
  color: var(--td-error-color);
}
.time-progress {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-l);
}
.time-progress :deep(.t-progress) {
  flex: 1;
}

.budget-list-content {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
