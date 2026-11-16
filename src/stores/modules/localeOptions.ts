import { defineStore } from 'pinia'
import { getLocaleOptionsApi } from '@/api/modules/identity'
import { normalizeLocale, type AppLocale } from '@/locales'

export const useLocaleOptionsStore = defineStore('localeOptions', {
  state: () => ({
    attempted: false,
    options: [] as Array<{ label: string; value: AppLocale; code: string }>,
  }),
  actions: {
    async load() {
      this.attempted = true
      this.options = []
      const result = await getLocaleOptionsApi()
      const options: Array<{ label: string; value: AppLocale; code: string }> = []
      result.items
        .filter((item) => item.status === 'ACTIVE')
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((item) => {
          // 后端可能注册 en / zh 等简写，统一归一化为前端语言包代码
          const value = normalizeLocale(item.locale_code)
          if (options.some((option) => option.value === value)) return
          options.push({ label: item.native_name, value, code: item.locale_code })
        })
      this.options = options
    },
  },
})
