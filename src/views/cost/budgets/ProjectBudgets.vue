<template>
  <div class="project-budgets">
    <FilterBar
      ><template #content
        ><div class="toolbar list-toolbar">
          <t-input
            class="list-search"
            v-model="search"
            :placeholder="t('budgetPlan.projectName')"
            clearable
            @enter="firstPage"
            @clear="firstPage"
          /><DepartmentTreeSelect v-model="department" @change="firstPage" /><t-select
            class="list-filter"
            v-model="status"
            :options="statuses"
            :placeholder="t('cost.allStatus')"
            clearable
            @change="firstPage"
          /><t-button theme="default" @click="reset">{{ t('budgetFlow.reset') }}</t-button
          ><t-button v-permission.write="'cost.budgets'" class="create" @click="edit(null)">{{
            t('budgetPlan.createProject')
          }}</t-button>
        </div></template
      ></FilterBar
    >
    <t-table
      row-key="id"
      :data="rows"
      :columns="columns"
      :loading="loading"
      :pagination="{ current: page, pageSize, total, showJumper: true }"
      @page-change="pageChange"
    >
      <template #name="{ row }"
        ><t-link theme="primary" @click="openDetail(row)">{{ row.project.name }}</t-link></template
      ><template #department="{ row }">{{ row.project.department }}</template
      ><template #projectStatus="{ row }"
        ><t-tag variant="light">{{ t(`projects.${row.project.status}`) }}</t-tag></template
      ><template #range="{ row }">{{
        row.config ? `${formatDate(row.config.start)} 至 ${formatDate(row.config.end)}` : '—'
      }}</template>
      <template v-for="key in ['total', 'consumed', 'remaining']" :key="key" #[key]="{ row }"
        ><span :class="{ negative: key === 'remaining' && row.remaining < 0 }">{{
          row.config ? money(row[key], row.config.currency) : '—'
        }}</span></template
      >
      <template #usage="{ row }"
        ><div v-if="row.config" class="usage">
          <t-progress :percentage="Math.min(100, row.usage)" :label="false" /><span
            >{{ row.usage.toFixed(1) }}%</span
          >
        </div>
        <span v-else>—</span></template
      >
      <template #status="{ row }"
        ><t-tag :theme="statusTheme(row.status)" variant="light">{{
          t(`cost.${row.status === 'DISABLED' ? 'UNCONFIGURED' : row.status}`)
        }}</t-tag></template
      ><template #period="{ row }"
        >{{
          row.config
            ? t(
                row.config.period_type === 'YEARLY'
                  ? 'budgetPlan.yearly'
                  : `cost.${row.config.period_type}`,
              )
            : '—'
        }}
        <p v-if="row.current" class="hint">
          {{ formatDate(row.current.start) }} — {{ formatDate(row.current.end) }}
        </p></template
      ><template #current="{ row }"
        ><template v-if="row.current && row.status !== 'DISABLED'"
          ><div>{{ money(row.current.consumed) }} / {{ money(row.current.amount) }}</div>
          <t-tag size="small" :theme="statusTheme(currentStatus(row))" variant="light">{{
            t(`cost.${currentStatus(row)}`)
          }}</t-tag></template
        ><span v-else>—</span></template
      ><template #policy="{ row }">{{
        row.config
          ? t(
              `cost.${row.config.over_action === 'BLOCK_PROJECT' ? 'BLOCK_DEPARTMENT' : 'ALERT_ONLY'}`,
            )
          : '—'
      }}</template
      ><template #actions="{ row }"
        ><t-space
          ><t-link theme="primary" @click="openDetail(row)">{{ t('budgetPlan.view') }}</t-link
          ><t-link
            v-if="row.project.status === 'ACTIVE'"
            v-permission.write="'cost.budgets'"
            theme="primary"
            @click="edit(row)"
            >{{ t('budgetPlan.configure') }}</t-link
          ><t-link
            v-if="row.config && row.project.status === 'ACTIVE'"
            v-permission.write="'cost.budgets'"
            theme="danger"
            @click="removing = row"
            >{{ t('cost.removeBudget') }}</t-link
          ></t-space
        ></template
      >
    </t-table>
    <ProjectBudgetForm
      :visible="formVisible"
      :record="editing"
      @close="formVisible = false"
      @saved="load"
    />
    <t-dialog
      :visible="Boolean(removing)"
      :header="t('budgetPlan.removeProjectTitle')"
      :confirm-btn="{ content: t('cost.confirm'), theme: 'danger', loading: saving }"
      :cancel-btn="t('cost.cancel')"
      @close="removing = null"
      @confirm="remove"
      ><p>
        {{
          t('budgetPlan.removeProjectText', {
            name: removing?.project.name,
            department: removing?.project.department.split('/').pop(),
          })
        }}
        {{ t('budgetPlan.removeProjectSpent', { amount: money(removing?.consumed ?? 0) }) }}
      </p></t-dialog
    >
    <t-drawer
      :visible="Boolean(detail)"
      :header="t('cost.detailTitle', { name: detail?.project.name })"
      size="var(--cost-drawer-width)"
      :footer="false"
      @close="closeDetail"
      ><div v-if="detail" class="detail">
        <t-space
          ><t-tag :theme="statusTheme(detail.status)">{{
            t(`cost.${detail.status === 'DISABLED' ? 'UNCONFIGURED' : detail.status}`)
          }}</t-tag
          ><span>{{ detail.project.department }}</span
          ><span v-if="detail.config"
            >{{ formatDate(detail.config.start) }} — {{ formatDate(detail.config.end) }}</span
          ></t-space
        ><t-alert
          v-if="detail.status === 'DISABLED'"
          theme="warning"
          :message="t('budgetPlan.disabled')"
        />
        <div class="metrics">
          <div v-for="key in ['total', 'consumed', 'remaining', 'usage']" :key="key">
            <span>{{ t(key === 'total' ? 'budgetPlan.total' : `cost.${key}`) }}</span
            ><strong>{{
              key === 'usage'
                ? `${detail.usage.toFixed(1)}%`
                : money(detail[key as 'total' | 'consumed' | 'remaining'])
            }}</strong>
          </div>
        </div>
        <t-progress :percentage="Math.min(100, detail.usage)" /><t-tabs v-model="detailTab"
          ><t-tab-panel
            v-for="key in ['overview', 'periods', 'analytics', 'history']"
            :key="key"
            :value="key"
            :label="t(`budgetPlan.${key}`)" /></t-tabs
        ><template v-if="detailTab === 'overview'"
          ><PeriodOverview
            :periods="detail.periods"
            :currency="detail.config?.currency"
          /><t-descriptions :column="2" layout="vertical"
            ><t-descriptions-item :label="t('budgetPlan.currentBudget')">{{
              detail.current ? money(detail.current.amount) : '—'
            }}</t-descriptions-item
            ><t-descriptions-item :label="t('budgetPlan.currentRemaining')">{{
              detail.current ? money(detail.current.remaining) : '—'
            }}</t-descriptions-item
            ><t-descriptions-item :label="t('budgetPlan.memberLimit')">{{
              detail.current?.limit == null ? t('budgetPlan.NONE') : money(detail.current.limit)
            }}</t-descriptions-item
            ><t-descriptions-item :label="t('cost.action')">{{
              detail.config
                ? t(
                    `cost.${detail.config.over_action === 'BLOCK_PROJECT' ? 'BLOCK_DEPARTMENT' : 'ALERT_ONLY'}`,
                  )
                : '—'
            }}</t-descriptions-item
            ><t-descriptions-item :label="t('cost.warningThreshold')"
              >{{ detail.config?.warning_threshold }}%</t-descriptions-item
            ><t-descriptions-item :label="t('cost.criticalThreshold')"
              >{{ detail.config?.critical_threshold }}%</t-descriptions-item
            ><t-descriptions-item
              v-for="level in levels"
              :key="level"
              :label="t(`cost.notify${level}`)"
              >{{
                detail.config?.recipients[level]
                  .map((id) => users.find((u) => u.id === id)?.name ?? id)
                  .join(', ') || t('cost.noNotify')
              }}
              ·
              {{
                detail.config?.channels[level].map((c) => t(`cost.${c}`)).join(', ') ||
                t('cost.noNotify')
              }}</t-descriptions-item
            ></t-descriptions
          ></template
        ><t-table
          v-else-if="detailTab === 'periods'"
          row-key="index"
          :data="detail.periods"
          :columns="periodColumns"
          ><template #range="{ row }"
            >{{ formatDate(row.start) }} — {{ formatDate(row.end) }}</template
          ><template #state="{ row }">{{ t(`budgetPlan.${row.state}`) }}</template
          ><template
            v-for="key in ['base', 'temporary', 'amount', 'consumed', 'remaining']"
            :key="key"
            #[key]="{ row }"
            >{{ money(row[key]) }}</template
          ></t-table
        ><template v-else-if="detailTab === 'history'"
          ><t-timeline
            ><t-timeline-item v-for="h in detail.history" :key="h.id"
              ><strong
                >{{ t(`cost.history${h.action === 'CONFIGURED' ? 'UPDATED' : h.action}`) }} ·
                {{ money(h.amount) }}</strong
              >
              <p>{{ formatDateTime(h.at) }} · {{ h.actor }}</p>
              <p v-if="h.work_order_id">{{ h.work_order_id }}</p></t-timeline-item
            ></t-timeline
          ></template
        ><template v-else
          ><ChartCard
            v-if="analytics"
            :title="t('cost.trend')"
            :option="chartOption"
            height="var(--cost-trend-height)"
          />
          <h3>{{ t('cost.userRanking') }}</h3>
          <t-table row-key="id" :data="analytics?.users ?? []" :columns="memberColumns"
            ><template #cost="{ row }">{{ money(row.cost) }}</template></t-table
          >
          <h3>{{ t('cost.modelRanking') }}</h3>
          <t-table row-key="name" :data="analytics?.models ?? []" :columns="modelColumns"
            ><template #cost="{ row }">{{ money(row.cost) }}</template></t-table
          ></template
        >
      </div></t-drawer
    >
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PageInfo, PrimaryTableCol, TableRowData } from 'tdesign-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  getProjectBudgets,
  getProjectBudget,
  getProjectBudgetAnalytics,
  removeProjectBudget,
  type ProjectBudgetRecord,
  type BudgetLevel,
} from '@/api/modules/projectBudgets'
import type { BudgetAnalytics } from '@/api/modules/cost'
import ChartCard, { type ChartOption } from '@/components/ChartCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import ProjectBudgetForm from './ProjectBudgetForm.vue'
import PeriodOverview from './PeriodOverview.vue'
import { useCost } from '../useCost'
import { formatDate, formatDateTime } from '@/utils/datetime'
import '@/styles/projects.css'
const { t, locale, money, statusTheme, error, init, users } = useCost()
const route = useRoute(),
  router = useRouter()
const search = ref(''),
  department = ref(''),
  status = ref(''),
  page = ref(1),
  pageSize = ref(20),
  total = ref(0),
  loading = ref(false),
  saving = ref(false),
  formVisible = ref(false),
  detailTab = ref('overview')
const rows = ref<(ProjectBudgetRecord & { id: string })[]>([]),
  editing = ref<ProjectBudgetRecord | null>(null),
  removing = ref<ProjectBudgetRecord | null>(null),
  detail = ref<ProjectBudgetRecord | null>(null),
  analytics = ref<BudgetAnalytics | null>(null)
const levels: BudgetLevel[] = ['WARNING', 'CRITICAL', 'EXCEEDED']
const statuses = computed(() =>
  ['NORMAL', 'WARNING', 'CRITICAL', 'EXCEEDED', 'UNCONFIGURED'].map((value) => ({
    value,
    label: t(`cost.${value}`),
  })),
)
const column = (key: string, title: string, width = 130): PrimaryTableCol<TableRowData> => ({
  colKey: key,
  title: t(title),
  minWidth: width,
})
const columns = computed<PrimaryTableCol<TableRowData>[]>(() => [
  {
    colKey: 'group-basic',
    title: t('budgetPlan.basic'),
    children: [
      column('name', 'budgetPlan.projectName', 180),
      column('department', 'budgetPlan.responsible', 180),
      column('projectStatus', 'budgetPlan.projectStatus'),
      column('range', 'budgetPlan.dates', 200),
    ],
  },
  {
    colKey: 'group-overall',
    title: t('budgetPlan.overall'),
    children: [
      column('total', 'budgetPlan.total'),
      column('consumed', 'cost.consumed'),
      column('remaining', 'cost.remaining'),
      column('usage', 'cost.usage', 150),
      column('status', 'cost.status'),
    ],
  },
  {
    colKey: 'group-current',
    title: t('budgetPlan.current'),
    children: [
      column('period', 'cost.budgetPeriod', 170),
      column('current', 'budgetPlan.currentBudget', 180),
    ],
  },
  {
    colKey: 'group-other',
    title: t('budgetPlan.other'),
    children: [
      column('policy', 'cost.action'),
      { ...column('actions', 'cost.actions', 220), fixed: 'right' },
    ],
  },
])
const periodColumns = computed(() =>
  [
    ['index', 'budgetFlow.period'],
    ['range', 'budgetPlan.dates'],
    ['state', 'cost.status'],
    ['base', 'cost.baseAmount'],
    ['temporary', 'cost.temporary'],
    ['amount', 'budgetPlan.currentBudget'],
    ['consumed', 'cost.consumed'],
    ['remaining', 'cost.remaining'],
  ].map(([key, label]) => column(key!, label!)),
)
const chartOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: analytics.value?.trend.map((r) => r.date) ?? [] },
  yAxis: { type: 'value' },
  series: [{ type: 'line', data: analytics.value?.trend.map((r) => r.cost) ?? [] }],
}))
const memberColumns = computed(() => [
  column('name', 'cost.name'),
  column('cost', 'cost.consumed'),
  column('requests', 'cost.requests'),
  column('tokens', 'cost.tokens'),
])
const modelColumns = computed(() => memberColumns.value.filter((c) => c.colKey !== 'tokens'))
function currentStatus(r: ProjectBudgetRecord) {
  const p = r.current
  const usage = p?.amount ? (p.consumed / p.amount) * 100 : 0
  return usage >= 100
    ? 'EXCEEDED'
    : usage >= (r.config?.critical_threshold ?? 95)
      ? 'CRITICAL'
      : usage >= (r.config?.warning_threshold ?? 80)
        ? 'WARNING'
        : 'NORMAL'
}
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  try {
    const result = await getProjectBudgets({
      page: page.value,
      page_size: pageSize.value,
      search: search.value,
      department_id: department.value,
      status: status.value,
    })
    if (current !== generation) return
    rows.value = result.items.map((r) => ({ ...r, id: r.project.id }))
    total.value = result.total
  } catch (e) {
    error(e)
  } finally {
    if (current === generation) loading.value = false
  }
}
function firstPage() {
  page.value = 1
  void load()
}
function reset() {
  search.value = ''
  department.value = ''
  status.value = ''
  firstPage()
}
function pageChange(p: PageInfo) {
  page.value = p.current
  pageSize.value = p.pageSize
  void load()
}
function edit(row: ProjectBudgetRecord | null) {
  editing.value = row
  formVisible.value = true
}
async function openDetail(row: ProjectBudgetRecord) {
  try {
    detail.value = await getProjectBudget(row.project.id)
    detailTab.value = 'overview'
    await router.replace({ query: { ...route.query, projectId: row.project.id } })
    analytics.value = await getProjectBudgetAnalytics(row.project.id)
  } catch (e) {
    error(e)
  }
}
function closeDetail() {
  detail.value = null
  void router.replace({ query: { tab: 'project' } })
}
async function remove() {
  if (!removing.value) return
  saving.value = true
  try {
    await removeProjectBudget(removing.value.project.id, removing.value.version)
    removing.value = null
    void MessagePlugin.success(t('cost.removed'))
    await load()
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
watch(locale, load)
onMounted(async () => {
  await init()
  await load()
  if (route.query.projectId) {
    try {
      const record = await getProjectBudget(String(route.query.projectId))
      await openDetail(record)
      if (route.query.action === 'configure') edit(record)
    } catch (e) {
      error(e)
    }
  }
})
</script>
<style scoped>
.project-budgets,
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.toolbar,
.usage {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  flex-wrap: wrap;
}
.toolbar > :deep(.t-input__wrap) {
  width: var(--cost-search-width);
}
.toolbar > :deep(.t-select__wrap),
.toolbar > :deep(.department-tree-select) {
  width: var(--cost-filter-width);
}
.create {
  margin-inline-start: auto;
}
.usage :deep(.t-progress) {
  flex: 1;
}
.usage span {
  white-space: nowrap;
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.negative {
  color: var(--td-error-color);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--td-comp-margin-l);
}
.metrics strong {
  display: block;
  font-size: var(--td-font-size-title-large);
}
p {
  margin: 0;
}
</style>
