<template>
  <div class="plan-fields">
    <h3>2 {{ t('budgetPlan.timing') }}</h3>
    <t-form-item :label="t('budgetPlan.dates')" required-mark
      ><t-date-range-picker v-model="dates" />
      <p class="hint">{{ t('budgetPlan.dateHint') }}</p></t-form-item
    >
    <div class="form-row">
      <t-form-item :label="t('cost.amountInput')" required-mark
        ><t-input-number
          v-nonnegative-number
          v-model="form.budget_amount"
          :min="0.01"
          :decimal-places="2"
          theme="normal" /></t-form-item
      ><t-form-item :label="t('cost.currency')" required-mark
        ><t-select
          v-model="form.currency"
          :disabled="!headquarters"
          :options="['CNY', 'USD'].map((value) => ({ value, label: t(`cost.${value}`) }))"
      /></t-form-item>
    </div>
    <h3>3 {{ t('budgetPlan.plan') }}</h3>
    <slot name="mode" />
    <t-form-item :label="t('cost.budgetPeriod')" required-mark
      ><t-select v-model="form.period_type" :options="periodOptions"
    /></t-form-item>
    <t-form-item :label="t('budgetPlan.allocation')" required-mark
      ><t-radio-group v-model="form.allocation" :options="allocationOptions"
    /></t-form-item>
    <p class="hint">{{ t('budgetPlan.evenHint') }}</p>
    <div class="period-summary">
      <span>{{ t('budgetPlan.count', { count: periods.length }) }}</span
      ><span>{{ t('budgetPlan.total') }} {{ money(form.budget_amount, form.currency) }}</span
      ><span
        >{{ t('budgetPlan.sum') }}
        {{
          money(
            amounts.reduce((a, b) => a + b, 0),
            form.currency,
          )
        }}</span
      >
    </div>
    <div v-if="form.allocation === 'CUSTOM'" class="period-grid">
      <div v-for="(p, i) in periods" :key="p.start">
        <span>{{ formatDate(p.start) }} — {{ formatDate(p.end) }}</span
        ><t-input-number
          v-nonnegative-number
          :value="amounts[i]"
          :min="0"
          :decimal-places="2"
          :disabled="i === periods.length - 1"
          theme="normal"
          @change="(value: string | number) => setAmount(i, Number(value))"
        />
      </div>
    </div>
    <t-form-item
      v-if="kind !== 'users'"
      :label="t(kind === 'projects' ? 'budgetPlan.memberLimit' : 'budgetPlan.limit')"
      ><t-radio-group v-model="form.member_limit_mode" :options="limitOptions"
    /></t-form-item>
    <t-input-number
      v-if="kind !== 'users' && form.member_limit_mode === 'FIXED'"
      v-nonnegative-number
      v-model="form.member_limit"
      :min="0"
      :decimal-places="2"
      theme="normal"
    />
    <div v-if="kind !== 'users' && form.member_limit_mode === 'CUSTOM'" class="period-grid">
      <div v-for="(p, i) in periods" :key="p.start">
        <span>{{ formatDate(p.start) }} — {{ formatDate(p.end) }}</span
        ><t-input-number
          v-nonnegative-number
          :value="form.member_limits?.[i] ?? 0"
          :min="0"
          :decimal-places="2"
          theme="normal"
          @change="(value: string | number) => setLimit(i, Number(value))"
        />
      </div>
    </div>
    <p v-if="form.member_limit_mode === 'NONE' && kind !== 'users'" class="hint">
      {{ t('budgetPlan.limitHint') }}
    </p>
    <h3>4 {{ t('budgetPlan.policy') }}</h3>
    <div class="form-row">
      <t-form-item :label="t('cost.warningThreshold')" required-mark
        ><t-input-number
          v-nonnegative-number
          v-model="form.warning_threshold"
          :min="1"
          :max="100"
          :decimal-places="0" /></t-form-item
      ><t-form-item :label="t('cost.criticalThreshold')" required-mark
        ><t-input-number
          v-nonnegative-number
          v-model="form.critical_threshold"
          :min="form.warning_threshold"
          :max="100"
          :decimal-places="0"
      /></t-form-item>
    </div>
    <t-form-item :label="t('cost.overAction')" required-mark
      ><t-select v-model="form.over_budget_action" :options="actionOptions"
    /></t-form-item>
    <p class="hint">
      {{ t(form.over_budget_action === 'ALERT_ONLY' ? 'cost.alertHint' : 'cost.blockHint') }}
    </p>
  </div>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue'
import type { BudgetConfig } from '@/api/modules/cost'
import { budgetDates, allocateBudget } from '@/utils/projectBudget'
import { formatDate } from '@/utils/datetime'
import { useCost } from '../useCost'
const form = defineModel<BudgetConfig>('form', { required: true })
const props = defineProps<{
  kind: 'departments' | 'users' | 'projects'
  headquarters?: boolean
  sourcePeriod?: string
}>()
const { t, money } = useCost()
const dates = computed({
  get: () => [form.value.effective_start ?? '', form.value.effective_end ?? ''],
  set: (value: string[]) => {
    form.value.effective_start = value[0]
    form.value.effective_end = value[1]
  },
})
const periods = computed(() =>
  budgetDates(
    form.value.effective_start ?? '',
    form.value.effective_end ?? '',
    form.value.period_type,
  ),
)
const amounts = computed(() =>
  form.value.allocation === 'CUSTOM'
    ? (form.value.period_amounts ?? [])
    : allocateBudget(form.value.budget_amount, periods.value.length),
)
const periodOptions = computed(() =>
  ['YEARLY', 'QUARTERLY', 'MONTHLY']
    .filter((_value, index, all) => !props.sourcePeriod || index >= all.indexOf(props.sourcePeriod))
    .map((value) => ({
      value,
      label: value === 'YEARLY' ? t('budgetPlan.yearly') : t(`cost.${value}`),
    })),
)
const allocationOptions = computed(() =>
  ['EVEN', 'CUSTOM'].map((value) => ({ value, label: t(`budgetPlan.${value}`) })),
)
const limitOptions = computed(() =>
  ['NONE', 'FIXED', 'CUSTOM'].map((value) => ({ value, label: t(`budgetPlan.${value}`) })),
)
const actionOptions = computed(() =>
  [
    'ALERT_ONLY',
    props.kind === 'users'
      ? 'BLOCK_USER'
      : props.kind === 'projects'
        ? 'BLOCK_PROJECT'
        : 'BLOCK_DEPARTMENT',
  ].map((value) => ({
    value,
    label: t(`cost.${value === 'BLOCK_PROJECT' ? 'BLOCK_DEPARTMENT' : value}`),
  })),
)
function setAmount(index: number, value: number) {
  const list = [...amounts.value]
  list[index] = value
  list[list.length - 1] =
    Math.round((form.value.budget_amount - list.slice(0, -1).reduce((a, b) => a + b, 0)) * 100) /
    100
  form.value.period_amounts = list
}
function setLimit(index: number, value: number) {
  const list = [...(form.value.member_limits ?? [])]
  list[index] = value
  form.value.member_limits = list
}
watch(
  [() => periods.value.length, () => form.value.allocation, () => form.value.budget_amount],
  () => {
    if (form.value.allocation === 'CUSTOM') {
      if (form.value.period_amounts?.length !== periods.value.length)
        form.value.period_amounts = allocateBudget(form.value.budget_amount, periods.value.length)
      else if (periods.value.length) setAmount(0, form.value.period_amounts[0] ?? 0)
    }
  },
)
watch(periods, (next, old) => {
  const limits = form.value.member_limits ?? []
  const values = new Map(old?.map((p, i) => [p.start, limits[i] ?? form.value.member_limit ?? 0]))
  const last = limits[limits.length - 1] ?? form.value.member_limit ?? 0
  form.value.member_limits = next.map((p) => values.get(p.start) ?? last)
})
</script>
<style scoped>
.plan-fields {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
h3,
p {
  margin: 0;
}
h3 {
  font-size: var(--td-font-size-title-small);
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.form-row,
.period-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--td-comp-margin-l);
}
.period-grid > div {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
.period-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--td-comp-margin-l);
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
  background: var(--td-bg-color-secondarycontainer);
}
:deep(.t-input-number),
:deep(.t-select__wrap) {
  width: 100%;
}
</style>
