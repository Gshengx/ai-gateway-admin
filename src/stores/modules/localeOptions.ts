import { defineStore } from 'pinia'
import { getLocaleOptionsApi } from '@/api/modules/identity'
import { normalizeLocale, SUPPORTED_LOCALES, toApiLocale, type AppLocale } from '@/locales'

export const useLocaleOptionsStore = defineStore('localeOptions', {
  state: () => ({
    attempted: false,
    defaultLocale: 'zh-CN',
    options: [] as Array<{ label: string; value: string; uiLocale: AppLocale }>,
  }),
  actions: {
    async load() {
      this.attempted = true
      this.options = []
      const result = await getLocaleOptionsApi()
      this.defaultLocale = result.default_locale
      const options: Array<{ label: string; value: string; uiLocale: AppLocale }> = []
      result.items
        .filter((item) => item.status === 'ACTIVE')
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((item) => {
          // 仅展示已启用且已提供 UI 语言包的语言，选项值保留后端原值。
          if (!SUPPORTED_LOCALES.some((entry) => toApiLocale(entry.value) === item.locale_code))
            return
          if (options.some((option) => option.value === item.locale_code)) return
          options.push({
            label: item.native_name,
            value: item.locale_code,
            uiLocale: normalizeLocale(item.locale_code),
          })
        })
      this.options = options
    },
  },
})
