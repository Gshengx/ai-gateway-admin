import type { Pricing, Period } from '@/api/modules/modelAccess'

/** 创建与编辑、mock 服务端共用 V1.4 价格规则校验。 */
export function pricingError(price: Pricing): 'invalidPrice' | 'invalidPeriods' | '' {
  if (price.source_type === 'BUILT_IN') return ''
  if (
    !['FIXED', 'TIME_BASED'].includes(price.pricing_mode) ||
    !price.currency ||
    !price.metric_rates.length
  )
    return 'invalidPrice'
  if (price.pricing_mode === 'TIME_BASED' && periodsError(price.time_periods))
    return 'invalidPeriods'
  const metrics = new Set<string>(),
    directions = new Set<string>()
  let ordinary = false,
    multimodalCount = false
  for (const rate of price.metric_rates) {
    if (metrics.has(rate.metric_key)) return 'invalidPrice'
    metrics.add(rate.metric_key)
    ordinary ||= ['input_tokens', 'output_tokens'].includes(rate.metric_key)
    const match = rate.metric_key.match(/^(image|audio|video)_(input|output)_/)
    if (match) {
      const direction = `${match[1]}_${match[2]}`
      if (directions.has(direction)) return 'invalidPrice'
      directions.add(direction)
      multimodalCount ||= !rate.metric_key.endsWith('_tokens')
    }
    const values =
      price.pricing_mode === 'FIXED'
        ? [rate.unit_price]
        : price.time_periods.map((p) => rate.period_prices[p.id])
    if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0))
      return 'invalidPrice'
  }
  if (ordinary && multimodalCount && !price.exclusive_usage_confirmed) return 'invalidPrice'
  if (price.pricing_mode !== 'TIME_BASED') return ''
  return periodsError(price.time_periods)
}

export interface PeriodValidation {
  configuration: string[]
  periods: Record<string, { name: string[]; conditions: Record<number, string[]>; empty: boolean }>
}
/** 编辑器实时定位错误；mock 服务端复用相同互斥规则。 */
export function validatePeriods(periods: Period[]): PeriodValidation {
  const result: PeriodValidation = { configuration: [], periods: {} }
  const fallback = periods.filter((p) => p.is_fallback)
  if (fallback.length !== 1 || fallback[0]?.conditions.length)
    result.configuration.push('periodFallbackInvalid')
  const named = periods.filter((p) => !p.is_fallback)
  if (!named.length) result.configuration.push('periodRequired')
  const names = new Map<string, string>()
  const slots: { id: string; index: number; days: number[]; start: string; end: string }[] = []
  for (const p of named) {
    result.periods[p.id] = { name: [], conditions: {}, empty: !p.conditions.length }
    const name = p.name.trim()
    if (!name || ['兜底时段', 'Fallback period'].includes(name))
      result.periods[p.id]!.name.push('periodNameRequired')
    if (names.has(name)) {
      result.periods[p.id]!.name.push('periodNameDuplicate')
      const previous = result.periods[names.get(name)!]!.name
      if (!previous.includes('periodNameDuplicate')) previous.push('periodNameDuplicate')
    }
    names.set(name, p.id)
    p.conditions.forEach((c, index) => {
      const errors: string[] = []
      result.periods[p.id]!.conditions[index] = errors
      if (
        !c.weekdays.length ||
        c.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
      )
        errors.push('periodWeekdayRequired')
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.end) ||
        c.start >= c.end
      )
        errors.push('periodTimeInvalid')
      if (!errors.length)
        slots.push({ id: p.id, index, days: c.weekdays, start: c.start, end: c.end })
    })
  }
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i]!
    for (const b of slots.slice(i + 1)) {
      if (a.days.some((day) => b.days.includes(day)) && a.start < b.end && a.end > b.start) {
        for (const slot of [a, b]) {
          const errors = result.periods[slot.id]!.conditions[slot.index]!
          if (!errors.includes('periodOverlap')) errors.push('periodOverlap')
        }
      }
    }
  }
  return result
}
export function periodsError(periods: Period[]): 'invalidPeriods' | '' {
  const result = validatePeriods(periods)
  return new Set(periods.map((p) => p.id)).size !== periods.length ||
    result.configuration.length ||
    Object.values(result.periods).some(
      (p) => p.empty || p.name.length || Object.values(p.conditions).some((c) => c.length),
    )
    ? 'invalidPeriods'
    : ''
}
