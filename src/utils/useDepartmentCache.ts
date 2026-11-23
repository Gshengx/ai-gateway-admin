import { onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDepartmentScope } from './useDepartmentScope'

/** Component-operation cache. Never share a directory across authorization scopes. */
export function useDepartmentCache(onScopeChange?: () => void) {
  const { locale } = useI18n()
  const entries = new Map<string, Promise<unknown>>()
  let generation = 0
  function clear() {
    generation++
    entries.clear()
  }
  async function load<T>(key: string, fetch: () => Promise<T>, refresh = false): Promise<T> {
    if (refresh) clear()
    const existing = entries.get(key)
    if (existing) return existing as Promise<T>
    const current = generation
    const request = fetch().then((result) => {
      if (current !== generation) throw new Error('Stale department operation')
      return result
    })
    entries.set(key, request)
    try {
      return await request
    } catch (error) {
      if (entries.get(key) === request) entries.delete(key)
      throw error
    }
  }
  watch(locale, clear, { flush: 'sync' })
  useDepartmentScope(() => {
    clear()
    onScopeChange?.()
  })
  onBeforeUnmount(clear)
  return { load, clear }
}
