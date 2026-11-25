import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
export function useCost() {
  const { t, locale } = useI18n()
  const money = (value: number, currency = 'CNY') =>
    new Intl.NumberFormat(locale.value, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
  const error = (err: unknown) => {
    if (!(err as { notified?: boolean })?.notified) void MessagePlugin.error(t('common.loadFailed'))
  }
  return { t, locale, money, number, error }
}
