<template>
  <t-drawer
    :visible="Boolean(budget)"
    :header="t('cost.detailTitle', { name: title })"
    size="var(--cost-budget-drawer-width)"
    :footer="false"
    @close="emit('close')"
  >
    <div v-if="budget" class="detail">
      <div class="summary">
        <div class="heading">
          <span>{{ t('cost.effectiveFull') }}</span
          ><t-tag :theme="statusTheme(budget.status)" variant="light">{{
            statusText(budget.status)
          }}</t-tag>
        </div>
        <strong>{{ money(budget.effective_amount, budget.currency) }}</strong>
        <div class="metrics">
          <span
            >{{ t('cost.consumed')
            }}<b>{{ money(budget.consumed_amount, budget.currency) }}</b></span
          ><span
            >{{ t('cost.remaining')
            }}<b>{{ money(budget.remaining_amount, budget.currency) }}</b></span
          >
        </div>
        <div>{{ periodText }}</div>
        <t-progress
          :percentage="Math.min(100, budget.usage)"
          :label="`${budget.usage.toFixed(1)}%`"
          :color="statusColor"
        />
      </div>
      <t-tabs v-model="tab"
        ><t-tab-panel
          v-for="key in ['overview', 'periods', 'analytics', 'history']"
          :key="key"
          :value="key"
          :label="t(`budgetPlan.${key}`)"
      /></t-tabs>
      <t-table
        v-if="tab === 'periods'"
        row-key="index"
        :data="budget.periods ?? []"
        :columns="periodColumns"
        ><template #range="{ row }"
          >{{ formatDate(row.start) }} — {{ formatDate(row.end) }}</template
        ><template #state="{ row }">{{ t(`budgetPlan.${row.state}`) }}</template
        ><template
          v-for="key in ['base', 'temporary', 'amount', 'consumed', 'remaining']"
          :key="key"
          #[key]="{ row }"
          >{{ money(row[key], budget.currency) }}</template
        ></t-table
      >
      <ChartCard
        v-if="analytics && tab === 'analytics'"
        :title="t('cost.trend')"
        :option="chartOption"
        height="var(--cost-trend-height)"
        ><template #actions
          >{{ budget.current_period_start }} —
          {{ analytics.trend[analytics.trend.length - 1]?.date }}</template
        ></ChartCard
      >
      <section v-if="tab === 'overview'">
        <PeriodOverview :periods="budget.periods ?? []" :currency="budget.currency" />
        <div class="heading">
          <h3>{{ t('cost.budgetConfig') }}</h3>
        </div>
        <t-descriptions :column="2" layout="vertical" bordered>
          <t-descriptions-item :label="t('cost.department')">{{
            deptName(budget.department_id, true)
          }}</t-descriptions-item>
          <t-descriptions-item v-if="kind === 'departments'" :label="t('cost.mode')">{{
            t(`cost.${budget.budget_mode}`)
          }}</t-descriptions-item>
          <t-descriptions-item
            :label="t(kind === 'users' ? 'cost.baseAmount' : 'cost.budgetAmount')"
            >{{ money(budget.budget_amount, budget.currency) }}</t-descriptions-item
          >
          <t-descriptions-item v-if="kind === 'users'" :label="t('cost.validTemporary')">{{
            money(budget.temporary_amount, budget.currency)
          }}</t-descriptions-item>
          <t-descriptions-item v-if="kind === 'users'" :label="t('cost.effectiveFull')">{{
            money(budget.effective_amount, budget.currency)
          }}</t-descriptions-item>
          <t-descriptions-item :label="t('cost.currency')">{{
            budget.currency
          }}</t-descriptions-item>
          <t-descriptions-item :label="t('cost.budgetPeriod')">{{
            t(`cost.${budget.period_type}`)
          }}</t-descriptions-item>
          <t-descriptions-item :label="t('cost.warningThreshold')"
            >{{ budget.warning_threshold }}%</t-descriptions-item
          >
          <t-descriptions-item :label="t('cost.criticalThreshold')"
            >{{ budget.critical_threshold }}%</t-descriptions-item
          >
          <t-descriptions-item :label="t('cost.action')">{{
            t(`cost.${budget.over_budget_action}`)
          }}</t-descriptions-item>
          <t-descriptions-item
            v-for="level in levels"
            :key="level"
            :label="t(`cost.notify${level}`)"
            >{{ notification(level) }}</t-descriptions-item
          >
        </t-descriptions>
      </section>
      <section v-if="kind === 'users' && tab === 'overview'">
        <h3>{{ t('cost.temporaryList') }}</h3>
        <div v-if="!budget.adjustments.length" class="hint">{{ t('cost.empty') }}</div>
        <div v-for="item in budget.adjustments" :key="item.id" class="adjustment">
          <div class="heading">
            <strong>{{ money(item.additional_amount, budget.currency) }}</strong
            ><t-tag :theme="item.status === 'ACTIVE' ? 'success' : 'default'" variant="light">{{
              t(`cost.${item.status}`)
            }}</t-tag>
          </div>
          <p>
            {{ t('cost.validity') }}：{{ formatDate(item.valid_from) }} —
            {{ formatDate(item.valid_until) }}
          </p>
          <span class="hint">{{ t('cost.sourceOrder') }} {{ item.source_work_order_id }}</span>
        </div>
      </section>
      <div v-if="analytics && tab === 'analytics'" class="rankings">
        <section v-if="kind === 'departments'">
          <h3>{{ t('cost.userRanking') }}</h3>
          <div v-for="item in analytics.users" :key="item.name" class="rank">
            <span>{{ item.name }}</span
            ><strong>{{ money(item.cost, budget.currency) }}</strong>
          </div>
        </section>
        <section>
          <h3>{{ t('cost.modelRanking') }}</h3>
          <div v-for="item in analytics.models" :key="item.name" class="rank">
            <div>
              {{ item.name }}
              <p class="hint">{{ t('cost.calls', { count: item.requests }) }}</p>
            </div>
            <strong>{{ money(item.cost, budget.currency) }}</strong>
          </div>
        </section>
      </div>
      <section v-if="analytics && tab === 'analytics' && kind === 'departments'">
        <h3>{{ t('expenses.cost_owner_type') }}</h3>
        <t-space
          >{{ t('expenses.directSpend') }}
          {{ money(analytics.direct_cost ?? 0, budget.currency) }} ·
          {{ t('expenses.projectSpend') }}
          {{ money(analytics.project_cost ?? 0, budget.currency) }}</t-space
        >
        <h3>{{ t('budgetPlan.projectRanking') }}</h3>
        <div v-for="item in analytics.projects ?? []" :key="item.id" class="rank">
          <span>{{ item.name }}</span
          ><strong>{{ money(item.cost, budget.currency) }}</strong>
        </div>
      </section>
      <section v-if="tab === 'history'">
        <h3>{{ t('cost.history') }}</h3>
        <t-timeline
          v-if="budget.history.length || budget.adjustments.some((a) => a.status === 'EXPIRED')"
          ><t-timeline-item v-for="item in budget.history" :key="item.at"
            ><div>
              {{ t(`cost.history${item.action}`) }} · {{ money(item.amount, budget.currency) }}
            </div>
            <span class="hint"
              >{{ formatDateTime(item.at) }} ·
              {{ users.find((u) => u.id === item.actor)?.name ?? item.actor }}</span
            >
            <p v-if="item.reason">{{ item.reason }}</p>
            <p v-if="item.configuration" class="hint">
              {{ item.configuration.warning_threshold }}% /
              {{ item.configuration.critical_threshold }}% ·
              {{ t(`cost.${item.configuration.over_budget_action}`)
              }}<span v-for="level in levels" :key="level"
                ><br />{{ t(`cost.notify${level}`) }}：{{
                  item.configuration.notification_recipients[level]
                    .map((id) => userName(id))
                    .join(', ') || (kind === 'users' ? t('cost.ownerDefault') : t('cost.noNotify'))
                }}
                ·
                {{
                  item.configuration.notification_channels[level]
                    .map((channel) => t(`cost.${channel}`))
                    .join(', ') || t('cost.noNotify')
                }}</span
              >
            </p></t-timeline-item
          ><t-timeline-item
            v-for="item in budget.adjustments.filter((a) => a.status === 'EXPIRED')"
            :key="item.id"
            >{{ t('cost.historyEXPIRED') }} · {{ money(item.additional_amount, budget.currency) }}
            <p class="hint">
              {{ formatDateTime(item.valid_until) }} · {{ item.source_work_order_id }}
            </p></t-timeline-item
          ></t-timeline
        >
        <p v-else class="hint">{{ t('cost.empty') }}</p>
      </section>
    </div>
  </t-drawer>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  getBudgetAnalytics,
  type Budget,
  type BudgetAnalytics,
  type Level,
} from '@/api/modules/cost'
import PeriodOverview from './PeriodOverview.vue'
import ChartCard, { type ChartOption } from '@/components/ChartCard.vue'
import { formatDate, formatDateTime } from '@/utils/datetime'
import { useCost } from '../useCost'
const tab = ref('overview')
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
  ].map(([colKey, label]) => ({ colKey, title: t(label!) })),
)
const props = defineProps<{ budget: Budget | null; kind: 'departments' | 'users' }>()
const emit = defineEmits<{ close: []; edit: [budget: Budget] }>()
const { t, users, deptName, money, statusText, statusTheme, userName, error } = useCost()
const analytics = ref<BudgetAnalytics | null>(null)
const levels: Level[] = ['WARNING', 'CRITICAL', 'EXCEEDED']
const title = computed(() =>
  props.kind === 'users'
    ? users.find((u) => u.id === props.budget?.user_id)?.name
    : deptName(props.budget?.department_id),
)
const periodText = computed(() =>
  props.budget
    ? t('cost.periodRange', {
        start: props.budget.current_period_start,
        end: props.budget.current_period_end,
        type: t(`cost.${props.budget.period_type}`),
      })
    : '',
)
const statusColor = computed(() =>
  props.budget?.status === 'EXCEEDED'
    ? 'var(--td-error-color)'
    : props.budget?.status === 'CRITICAL'
      ? 'var(--td-warning-color-active)'
      : props.budget?.status === 'WARNING'
        ? 'var(--td-warning-color)'
        : 'var(--td-brand-color)',
)
const chartOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: '12%', right: '4%', top: '10%', bottom: '15%' },
  xAxis: { type: 'category', data: analytics.value?.trend.map((p) => p.date) ?? [] },
  yAxis: { type: 'value' },
  series: [{ type: 'line', smooth: true, data: analytics.value?.trend.map((p) => p.cost) ?? [] }],
}))
function notification(level: Level) {
  const budget = props.budget!
  const channels = budget.notification_channels[level]
  if (!channels.length) return t('cost.noNotify')
  const names = budget.notification_recipients[level].map(
    (id) => users.find((u) => u.id === id)?.name || userName(id),
  )
  if (props.kind === 'users') names.unshift(t('cost.ownerDefault'))
  return `${names.join(', ') || t('cost.noNotify')} · ${channels.map((channel) => t(`cost.${channel}`)).join(', ')}`
}
let version = 0
watch(
  () => props.budget,
  async (budget) => {
    const current = ++version
    analytics.value = null
    if (!budget) return
    try {
      const result = await getBudgetAnalytics(props.kind, budget.id)
      if (current === version) analytics.value = result
    } catch (err) {
      error(err)
    }
  },
)
</script>
<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.summary,
.adjustment {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
}
.summary {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.summary > strong {
  font-size: var(--td-font-size-title-large);
}
.heading,
.rank {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--td-comp-margin-l);
}
.metrics b {
  display: block;
  margin-top: var(--td-comp-margin-s);
}
h3 {
  margin: 0 0 var(--td-comp-margin-l);
  font-size: var(--td-font-size-title-small);
  font-weight: var(--td-font-weight-600);
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.adjustment + .adjustment {
  margin-top: var(--td-comp-margin-s);
}
.rank {
  margin-bottom: var(--td-comp-margin-l);
}
.rank p {
  margin: var(--td-comp-margin-xs) 0 0;
}
.rankings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(40%, 1fr));
  gap: var(--td-comp-margin-l);
}
</style>
