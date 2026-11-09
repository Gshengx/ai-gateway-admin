<template>
  <div class="ma-stack">
    <div class="ma-row pricing-heading">
      <h3>{{ t('ma.modelPrice') }}</h3>
      <span class="ma-muted">{{ t('ma.modelPriceHelp') }}</span>
    </div>
    <t-alert theme="info" :message="t('ma.priceConfigNotice')" />
    <t-form class="ma-form pricing-form" label-align="top" required-mark-position="right">
      <t-form-item :label="t('ma.source')" required-mark>
        <t-radio-group v-model="value.source_type" variant="outline" @change="sourceChanged">
          <t-radio-button value="BUILT_IN">{{ t('ma.BUILT_IN') }}</t-radio-button>
          <t-radio-button value="ENTERPRISE_CUSTOM">{{ t('ma.ENTERPRISE_CUSTOM') }}</t-radio-button>
        </t-radio-group>
      </t-form-item>
      <p class="ma-muted">
        {{ t(value.source_type === 'BUILT_IN' ? 'ma.builtInPriceHelp' : 'ma.priceSourceHelp') }}
      </p>
      <t-alert
        v-if="value.source_type === 'BUILT_IN' && missingBuiltInPrice"
        theme="warning"
        :message="t('ma.missingBuiltInPrice')"
      />
      <t-form-item :label="t('ma.mode')" required-mark
        ><t-radio-group v-model="value.pricing_mode" variant="outline" @change="modeChanged"
          ><t-radio-button value="FIXED">{{ t('ma.FIXED') }}</t-radio-button
          ><t-radio-button value="TIME_BASED">{{
            t('ma.TIME_BASED')
          }}</t-radio-button></t-radio-group
        ></t-form-item
      >
      <section
        v-if="value.pricing_mode === 'TIME_BASED' && value.metric_rates.length"
        class="pricing-periods ma-box ma-stack"
      >
        <div class="ma-row ma-between">
          <h3>{{ t('ma.periods') }}</h3>
          <t-button theme="primary" variant="outline" @click="addPeriod">{{
            t('ma.addPeriod')
          }}</t-button>
        </div>
        <p class="ma-muted">{{ t('ma.timezone') }}</p>
        <div v-for="period in namedPeriods" :key="period.id" class="ma-box ma-stack pricing-period">
          <div class="pricing-period__heading">
            <t-input v-model="period.name" @change="markCustom" :placeholder="t('ma.periodName')" />
            <t-button theme="default" variant="outline" @click="addCondition(period)">{{
              t('ma.addCondition')
            }}</t-button>
            <t-link theme="danger" @click="removePeriod(period.id)">{{
              t('ma.removePricePeriod')
            }}</t-link>
          </div>
          <p
            v-for="message in periodValidation.periods[period.id]?.name ?? []"
            :key="message"
            class="pricing-validation"
          >
            {{ t('ma.' + message) }}
          </p>
          <p
            v-if="!period.conditions.length"
            :class="['pricing-condition', validationAttempted ? 'pricing-validation' : 'ma-muted']"
          >
            {{ t('ma.emptyConditions') }}
          </p>
          <div
            v-for="(condition, index) in period.conditions"
            :key="index"
            class="pricing-condition ma-stack"
          >
            <div class="pricing-condition__fields">
              <div class="pricing-condition__weekdays">
                <span>{{ t('ma.weekdays') }}</span
                ><t-checkbox-group
                  v-model="condition.weekdays"
                  @change="markCustom"
                  :options="dayOptions"
                />
              </div>
              <div class="pricing-condition__clock">
                <span>{{ t('ma.start') }}</span>
                <t-time-picker
                  v-model="condition.start"
                  @change="markCustom"
                  format="HH:mm"
                  :placeholder="t('ma.start')"
                />
              </div>
              <div class="pricing-condition__clock">
                <span>{{ t('ma.end') }}</span
                ><t-time-picker
                  v-model="condition.end"
                  @change="markCustom"
                  format="HH:mm"
                  :placeholder="t('ma.end')"
                />
              </div>
              <t-link theme="danger" @click="removeCondition(period, index)">{{
                t('ma.removePriceCondition')
              }}</t-link>
            </div>
            <p
              v-for="message in conditionMessages(period, index)"
              :key="message"
              class="pricing-validation"
            >
              {{ t('ma.' + message) }}
            </p>
          </div>
        </div>
        <div class="pricing-fallback">
          <div class="ma-stack">
            <strong>{{ t('ma.fallback') }}</strong>
            <p class="ma-muted">{{ t('ma.fallbackShortHelp') }}</p>
          </div>
          <t-tag class="pricing-fallback__badge" theme="primary" variant="light">{{
            t('ma.fallbackMarker')
          }}</t-tag>
        </div>
        <p
          v-for="message in periodValidation.configuration"
          :key="message"
          class="pricing-validation"
        >
          {{ t('ma.' + message) }}
        </p>
      </section>
      <p class="ma-muted">{{ t('ma.metricHelp') }}</p>
      <p v-if="!value.metric_rates.length" class="ma-muted">{{ t('ma.noAdaptedMetrics') }}</p>
      <t-checkbox v-if="needsExclusiveUsage" v-model="value.exclusive_usage_confirmed">{{
        t('ma.exclusiveUsage')
      }}</t-checkbox>
      <p v-if="needsExclusiveUsage" class="ma-muted">{{ t('ma.exclusiveHelp') }}</p>
      <section
        v-for="rate in value.metric_rates"
        :key="rate.metric_key"
        class="ma-box pricing-rate"
      >
        <div class="ma-row">
          <strong>{{ metricLabel(rate.metric_key) }}</strong
          ><span class="ma-muted"
            >{{ t('ma.price') }}（{{ value.currency }} /
            {{ t('ma.' + unitLabel(rate.unit)) }}）</span
          >
          <t-tag class="ma-push-right" size="small" variant="light">{{ t('ma.adapted') }}</t-tag>
        </div>
        <t-form-item
          v-if="value.pricing_mode === 'FIXED'"
          class="pricing-fixed"
          :label="t('ma.price')"
          required-mark
        >
          <t-input-number
            v-model="rate.unit_price"
            @change="markCustom"
            :min="0"
            :decimal-places="2"
          />
        </t-form-item>
        <div v-else class="pricing-rate__grid">
          <div v-for="period in orderedPeriods" :key="period.id" class="pricing-cell">
            <span>{{
              period.is_fallback ? t('ma.fallback') : period.name || t('ma.periodName')
            }}</span
            ><t-input-number
              v-model="rate.period_prices[period.id]"
              @change="markCustom"
              :min="0"
              :decimal-places="2"
            />
          </div>
        </div>
      </section>
    </t-form>
    <t-alert v-if="error" theme="error" :message="error" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Pricing, type Period } from '@/api/modules/modelAccess'
import { pricingError, periodsError, validatePeriods } from '@/utils/modelPricing'
import { metricLabel, unitLabel } from './helpers'
const value = defineModel<Pricing>({ required: true })
const props = defineProps<{ defaults: Pricing }>()
const { t, locale } = useI18n(),
  error = ref('')
const validationAttempted = ref(false)
const missingBuiltInPrice = computed(
  () =>
    !props.defaults.metric_rates.length ||
    props.defaults.metric_rates.some((rate) => rate.unit_price === null),
)
let sequence = 0
const dayOptions = computed(() =>
  Array.from({ length: 7 }, (_, i) => ({
    value: i + 1,
    label: locale.value.startsWith('zh')
      ? '一二三四五六日'[i]
      : new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(Date.UTC(2026, 10, 2 + i)),
        ),
  })),
)
const needsExclusiveUsage = computed(
  () =>
    value.value.metric_rates.some((r) =>
      ['input_tokens', 'output_tokens'].includes(r.metric_key),
    ) &&
    value.value.metric_rates.some(
      (r) => /^(image|audio|video)_/.test(r.metric_key) && !r.metric_key.endsWith('_tokens'),
    ),
)
const periodValidation = computed(() => validatePeriods(value.value.time_periods))
const namedPeriods = computed(() => value.value.time_periods.filter((p) => !p.is_fallback))
const orderedPeriods = computed(() => [
  ...namedPeriods.value,
  ...value.value.time_periods.filter((p) => p.is_fallback),
])
function addPeriod() {
  markCustom()
  error.value = ''
  let n = namedPeriods.value.length + 1
  while (namedPeriods.value.some((p) => p.name === t('ma.periodDefault', { n }))) n++
  value.value.time_periods.splice(
    Math.max(
      0,
      value.value.time_periods.findIndex((p) => p.is_fallback),
    ),
    0,
    {
      id: `period-${Date.now()}-${sequence++}`,
      name: t('ma.periodDefault', { n }),
      is_fallback: false,
      conditions: [],
    },
  )
  initializePeriodPrices()
}
function initializePeriodPrices() {
  for (const rate of value.value.metric_rates) {
    for (const period of value.value.time_periods) {
      rate.period_prices[period.id] ??= period.is_fallback ? (rate.unit_price ?? 0) : 0
    }
  }
}
function modeChanged() {
  markCustom()
  if (value.value.pricing_mode === 'TIME_BASED') {
    if (!namedPeriods.value.length) addPeriod()
    initializePeriodPrices()
  } else {
    const fallback = value.value.time_periods.find((period) => period.is_fallback)
    for (const rate of value.value.metric_rates)
      rate.unit_price = fallback
        ? (rate.period_prices[fallback.id] ?? rate.unit_price ?? 0)
        : (rate.unit_price ?? 0)
  }
}
function addCondition(period: Period) {
  markCustom()
  period.conditions.push({ weekdays: [], start: '', end: '' })
}
function removeCondition(period: Period, index: number) {
  markCustom()
  period.conditions.splice(index, 1)
}
function conditionMessages(period: Period, index: number) {
  const condition = period.conditions[index]
  if (
    !validationAttempted.value &&
    condition &&
    !condition.weekdays.length &&
    !condition.start &&
    !condition.end
  )
    return []
  return periodValidation.value.periods[period.id]?.conditions[index] ?? []
}
function sourceChanged() {
  if (value.value.source_type === 'BUILT_IN') {
    value.value = JSON.parse(JSON.stringify(props.defaults)) as Pricing
  }
  validationAttempted.value = false
  error.value = ''
}
function removePeriod(id: string) {
  markCustom()
  value.value.time_periods = value.value.time_periods.filter((p) => p.id !== id)
  for (const rate of value.value.metric_rates) delete rate.period_prices[id]
}
function validate() {
  validationAttempted.value = true
  if (!value.value.metric_rates.length) return true
  const problem =
    (value.value.pricing_mode === 'TIME_BASED' && periodsError(value.value.time_periods)) ||
    pricingError(value.value)
  error.value = problem && problem !== 'invalidPeriods' ? t('ma.' + problem) : ''
  return !problem
}
function markCustom() {
  value.value.source_type = 'ENTERPRISE_CUSTOM'
  value.value.currency = 'CNY'
}

defineExpose({ validate })
</script>
<style scoped src="./access.css"></style>
