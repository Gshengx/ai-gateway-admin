<template>
  <div class="period-overview">
    <p v-if="!periods.length" class="hint">{{ t('cost.empty') }}</p>
    <template v-else
      ><div class="period-cards">
        <section v-for="period in cards" :key="period.index">
          <div class="heading">
            <strong>{{ formatDate(period.start) }} — {{ formatDate(period.end) }}</strong
            ><t-tag :theme="period.state === 'CURRENT' ? 'primary' : 'default'" variant="light">{{
              t(`budgetPlan.${period.state}`)
            }}</t-tag>
          </div>
          <div class="metrics">
            <div>
              <span>{{ t('budgetPlan.currentBudget') }}</span
              ><strong>{{ money(period.amount, currency) }}</strong>
            </div>
            <div>
              <span>{{ t('budgetPlan.currentConsumed') }}</span
              ><strong>{{ money(period.consumed, currency) }}</strong>
            </div>
            <div>
              <span>{{ t('budgetPlan.currentRemaining') }}</span
              ><strong :class="{ negative: period.remaining < 0 }">{{
                money(period.remaining, currency)
              }}</strong>
            </div>
          </div>
          <t-progress
            :percentage="
              Math.min(
                100,
                period.amount ? Math.round((period.consumed / period.amount) * 1000) / 10 : 0,
              )
            "
          />
        </section>
      </div>
      <p v-if="!current && periods.length > 2" class="hint">{{ t('budgetPlan.noCurrent') }}</p>
      <ChartCard
        v-if="periods.length > 2"
        :title="t('budgetPlan.periods')"
        :option="option"
        height="var(--cost-trend-height)"
    /></template>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectBudgetPeriod } from '@/api/modules/projectBudgets'
import ChartCard, { type ChartOption } from '@/components/ChartCard.vue'
import { useCost } from '../useCost'
import { formatDate } from '@/utils/datetime'
const props = defineProps<{ periods: ProjectBudgetPeriod[]; currency?: string }>()
const { t, money } = useCost()
const current = computed(() => props.periods.find((p) => p.state === 'CURRENT'))
const cards = computed(() =>
  props.periods.length <= 2 ? props.periods : current.value ? [current.value] : [],
)
const option = computed<ChartOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: [t('budgetPlan.currentBudget'), t('cost.consumed')] },
  grid: { containLabel: true },
  xAxis: { type: 'category', data: props.periods.map((p) => formatDate(p.start)) },
  yAxis: { type: 'value' },
  series: [
    { name: t('budgetPlan.currentBudget'), type: 'bar', data: props.periods.map((p) => p.amount) },
    { name: t('cost.consumed'), type: 'bar', data: props.periods.map((p) => p.consumed) },
  ],
}))
</script>
<style scoped>
.period-overview,
.period-cards,
section {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
section {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
}
.heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--td-comp-margin-l);
}
.metrics strong {
  display: block;
  margin-top: var(--td-comp-margin-s);
  font-size: var(--td-font-size-title-medium);
}
.hint,
.metrics span {
  color: var(--td-text-color-secondary);
}
.negative {
  color: var(--td-error-color);
}
p {
  margin: 0;
}
</style>
