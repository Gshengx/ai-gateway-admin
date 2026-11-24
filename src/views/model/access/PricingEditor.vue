<template>
  <div class="ma-stack">
    <div class="ma-row pricing-heading">
      <h3>{{ t('ma.modelPrice') }}</h3>
      <t-button
        v-if="defaultPrice || loadDefault"
        class="ma-push-right"
        theme="primary"
        variant="outline"
        :loading="restoring"
        @click="restoreDefault"
        >{{ t('ma.restoreDefaults') }}</t-button
      >
    </div>
    <t-alert theme="info" :message="t('ma.priceConfigNotice')" />
    <t-form class="ma-form pricing-form" label-align="top" required-mark-position="right">
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
          <h3 class="pricing-required">{{ t('ma.periods') }}</h3>
          <t-button theme="primary" variant="outline" @click="addPeriod">{{
            t('ma.addPeriod')
          }}</t-button>
        </div>
        <div class="ma-row pricing-timezone">
          <strong>{{ t('ma.timezone') }}</strong>
          <t-popup trigger="click" placement="bottom-left" show-arrow>
            <t-button
              variant="text"
              theme="default"
              shape="square"
              size="small"
              :aria-label="t('ma.timezoneHelp')"
            >
              <t-icon name="info-circle" />
            </t-button>
            <template #content>
              <div class="pricing-timezone-help">
                <p>{{ t('ma.periodMatchHelp') }}</p>
                <p>{{ t('ma.timezoneDisplayHelp') }}</p>
                <p class="ma-muted">{{ t('ma.timezoneSource') }}</p>
              </div>
            </template>
          </t-popup>
        </div>
        <p class="ma-muted">{{ t('ma.periodRulesHelp') }}</p>
        <p v-if="!namedPeriods.length" class="ma-muted">{{ t('ma.emptyNamedPeriodsHelp') }}</p>
        <div v-for="period in namedPeriods" :key="period.id" class="ma-box ma-stack pricing-period">
          <div class="pricing-period__heading">
            <t-input
              clearable
              aria-required="true"
              :aria-label="t('ma.periodName')"
              v-model="period.name"
              @change="markCustom"
              :placeholder="t('ma.periodName')"
            />
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
                <span class="pricing-required">{{ t('ma.weekdays') }}</span
                ><t-checkbox-group
                  v-model="condition.weekdays"
                  aria-required="true"
                  :aria-label="t('ma.weekdays')"
                  @change="markCustom"
                  :options="dayOptions"
                />
              </div>
              <div class="pricing-condition__clock">
                <span class="pricing-required">{{ t('ma.start') }}</span>
                <t-time-picker
                  v-model="condition.start"
                  aria-required="true"
                  @change="markCustom"
                  format="HH:mm"
                  :placeholder="t('ma.start')"
                />
              </div>
              <div class="pricing-condition__clock">
                <span class="pricing-required">{{ t('ma.end') }}</span
                ><t-time-picker
                  v-model="condition.end"
                  aria-required="true"
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
      <t-alert
        v-if="!value.metric_rates.length"
        theme="warning"
        :message="t('pricingFlow.noMetrics')"
      />
      <template v-if="needsExclusiveUsage">
        <t-checkbox v-model="exclusiveUsageConfirmed">{{ t('ma.exclusiveUsage') }}</t-checkbox>
        <p class="ma-muted">{{ t('ma.exclusiveHelp') }}</p>
        <p v-if="validationAttempted && !exclusiveUsageConfirmed" class="ma-error">
          {{ t('ma.exclusiveUsageRequired') }}
        </p>
      </template>
      <section
        v-for="rate in value.metric_rates"
        :key="rate.metric_key"
        class="ma-box pricing-rate"
      >
        <div class="ma-row">
          <strong :class="{ 'pricing-required': value.pricing_mode === 'TIME_BASED' }">{{
            rate.display_name || metricLabel(rate.metric_key)
          }}</strong
          ><span class="ma-muted"
            >{{ t('ma.price') }}（{{ value.currency }} /
            {{ rate.unit_label || t('ma.' + unitLabel(rate.unit)) }}）</span
          >
        </div>
        <t-form-item
          v-if="value.pricing_mode === 'FIXED'"
          class="pricing-fixed"
          :label="t('ma.price')"
          :status="priceInvalid(rate.unit_price) ? 'error' : undefined"
          :tips="priceInvalid(rate.unit_price) ? t('ma.priceDecimalFormat') : undefined"
          required-mark
        >
          <t-input-number
            v-nonnegative-number
            large-number
            theme="row"
            :min="'0'"
            :value="rate.unit_price ?? undefined"
            :status="priceInvalid(rate.unit_price) ? 'error' : undefined"
            inputmode="decimal"
            @change="
              (value: string | number | undefined) => {
                rate.unit_price = value == null || value === '' ? null : String(value)
                markCustom()
              }
            "
          />
        </t-form-item>
        <template v-else>
          <p v-if="!namedPeriods.length" class="ma-muted">{{ t('ma.emptyPeriodPricesHelp') }}</p>
          <div class="pricing-rate__grid">
            <div v-for="period in orderedPeriods" :key="period.id" class="pricing-cell">
              <span>{{
                period.is_fallback ? t('ma.fallback') : period.name || t('ma.periodName')
              }}</span
              ><t-input-number
                v-nonnegative-number
                large-number
                theme="row"
                :min="'0'"
                :value="rate.period_prices[period.id] ?? undefined"
                aria-required="true"
                :aria-label="
                  period.is_fallback ? t('ma.fallback') : period.name || t('ma.periodName')
                "
                :status="priceInvalid(rate.period_prices[period.id]) ? 'error' : undefined"
                inputmode="decimal"
                @change="
                  (value: string | number | undefined) => {
                    rate.period_prices[period.id] =
                      value == null || value === '' ? null : String(value)
                    markCustom()
                  }
                "
              />
            </div>
          </div>
          <p v-if="periodPriceError(rate)" class="ma-error" role="alert">
            {{ periodPriceError(rate) }}
          </p>
        </template>
      </section>
    </t-form>
    <t-alert v-if="error" theme="error" :message="error" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { type Pricing, type Period } from '@/api/modules/modelAccess'
import { pricingError, periodsError, validatePeriods } from '@/utils/modelPricing'
import { isDecimal } from '@/utils/modelContract'
import { metricLabel, unitLabel } from './helpers'
const props = defineProps<{
  defaultPrice?: Pricing
  loadDefault?: () => Promise<Pricing | undefined | null>
}>()
const restoring = ref(false)
const value = defineModel<Pricing>({ required: true })
function priceInvalid(price: string | number | null | undefined) {
  if (price === null || price === undefined || price === '') return validationAttempted.value
  return !isDecimal(String(price))
}
function periodPriceError(rate: Pricing['metric_rates'][number]) {
  const periods = orderedPeriods.value.filter((period) =>
    priceInvalid(rate.period_prices[period.id]),
  )
  return periods.length
    ? t('ma.periodPriceErrors', {
        periods: periods
          .map((period) =>
            period.is_fallback ? t('ma.fallback') : period.name || t('ma.periodName'),
          )
          .join(locale.value.startsWith('zh') ? '、' : ', '),
        message: t('ma.priceDecimalFormat'),
      })
    : ''
}
// Local confirmation only; the write DTO has no such field.
const exclusiveUsageConfirmed = ref(false)
const needsExclusiveUsage = computed(
  () =>
    value.value.metric_rates.some((r) =>
      ['input_tokens', 'output_tokens'].includes(r.metric_key),
    ) &&
    value.value.metric_rates.some(
      (r) => /^(image|audio|video)_/.test(r.metric_key) && !r.metric_key.endsWith('_tokens'),
    ),
)
const { t, locale } = useI18n(),
  error = ref('')
const validationAttempted = ref(false)
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
      if (!(period.id in rate.period_prices)) {
        rate.period_prices[period.id] = null
      }
    }
  }
}
function modeChanged() {
  markCustom()
  if (value.value.pricing_mode === 'TIME_BASED') {
    if (!namedPeriods.value.length) addPeriod()
    initializePeriodPrices()
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
function removePeriod(id: string) {
  markCustom()
  value.value.time_periods = value.value.time_periods.filter((p) => p.id !== id)
  for (const rate of value.value.metric_rates) delete rate.period_prices[id]
}
function validate() {
  validationAttempted.value = true
  if (!value.value.metric_rates.length) {
    error.value = ''
    return true
  }
  const problem =
    (value.value.pricing_mode === 'TIME_BASED' && periodsError(value.value.time_periods)) ||
    pricingError(value.value) ||
    (needsExclusiveUsage.value && !exclusiveUsageConfirmed.value ? 'invalidPrice' : '')
  error.value =
    needsExclusiveUsage.value && !exclusiveUsageConfirmed.value
      ? t('ma.exclusiveUsageRequired')
      : problem === 'invalidPrice' &&
          value.value.pricing_mode === 'TIME_BASED' &&
          value.value.metric_rates.some((rate) => periodPriceError(rate))
        ? ''
        : problem && problem !== 'invalidPeriods'
          ? t('ma.' + problem)
          : ''
  return !problem
}
watch(
  [value, exclusiveUsageConfirmed],
  () => {
    if (validationAttempted.value) validate()
  },
  { deep: true },
)
async function restoreDefault() {
  if ((!props.defaultPrice && !props.loadDefault) || restoring.value) return
  restoring.value = true
  try {
    const defaults = props.loadDefault ? await props.loadDefault() : props.defaultPrice
    if (defaults === null) return
    if (!defaults) {
      MessagePlugin.info(t('ma.defaultPricingUnavailable'))
      return
    }
    value.value = {
      ...(JSON.parse(JSON.stringify(defaults)) as Pricing),
      source_type: 'ENTERPRISE_CUSTOM',
    }
    MessagePlugin.success(t('ma.priceDefaultsRestored'))
  } catch {
    // The shared request layer reports failures; retain the current draft.
  } finally {
    restoring.value = false
  }
}
function markCustom() {
  value.value.source_type = 'ENTERPRISE_CUSTOM'
}

defineExpose({ validate })
</script>
<style scoped src="./access.css"></style>
