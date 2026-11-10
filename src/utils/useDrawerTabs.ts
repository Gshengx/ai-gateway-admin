import { nextTick, ref, watch, type Ref } from 'vue'

/** 抽屉页签切换后重置内容滚动，不影响页面级页签。 */
export function useDrawerTabs(value: Ref<string>) {
  const tabsRef = ref<{ $el: HTMLElement }>()
  watch(value, async () => {
    await nextTick()
    tabsRef.value?.$el.closest('.t-drawer__body')?.scrollTo({ top: 0 })
  })
  return tabsRef
}
