<template>
  <div class="pricing-summary">
    <strong>{{ t('ma.' + price.pricing_mode) }}：</strong>
    <div v-for="rate in price.metric_rates" :key="rate.metric_key" class="pricing-summary__row">
      <span
        >{{ metricLabel(rate.metric_key) }}（{{ price.currency }}/{{
          t('ma.' + unitLabel(rate.unit))
        }}）：</span
      >
      <div v-if="price.pricing_mode === 'TIME_BASED'" class="pricing-summary__values">
        <t-tooltip v-for="period in price.time_periods" :key="period.id" placement="top">
          <template #content>
            <div>{{ period.is_fallback ? t('ma.fallbackHelp') : t('ma.timezone') }}</div>
            <div v-for="(condition, index) in period.conditions" :key="index">
              {{ condition.weekdays.map(weekday).join('、') }} {{ condition.start }}–{{
                condition.end
              }}
            </div>
          </template>
          <t-tag variant="light">
            {{ period.is_fallback ? t('ma.fallback') : period.name }}–{{
              rate.period_prices[period.id] ?? '—'
            }}
          </t-tag>
        </t-tooltip>
      </div>
      <span v-else>{{ rate.unit_price ?? '—' }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Pricing } from '@/api/modules/modelAccess'
import { metricLabel, unitLabel } from './helpers'

defineProps<{ price: Pricing }>()
const { t, locale } = useI18n()
const weekday = (day: number) =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 10, 1 + day)),
  )
</script>
<style scoped>
.pricing-summary {
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  min-width: 0;
}
.pricing-summary__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--td-comp-margin-s);
  padding-block: var(--td-comp-paddingTB-s);
  overflow-wrap: anywhere;
}
.pricing-summary__row + .pricing-summary__row {
  border-top: 1px solid var(--td-component-stroke);
}
.pricing-summary__values {
  display: flex;
  flex-wrap: wrap;
  gap: var(--td-comp-margin-s);
  min-width: 0;
}
.pricing-summary__values :deep(.t-tag) {
  background: var(--td-bg-color-component);
  color: var(--td-text-color-primary);
  height: auto;
  white-space: normal;
  overflow-wrap: anywhere;
  max-width: 100%;
}
</style>
