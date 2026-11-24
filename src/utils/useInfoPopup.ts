import { ref } from 'vue'
import type { PopupVisibleChangeContext } from 'tdesign-vue-next'

/** 悬浮临时阅读，点击固定展开；关闭仍交由 TDesign 处理外部点击。 */
export function useInfoPopup() {
  const visible = ref(false)
  let pinned = false

  function updateVisibility(next: boolean, context: PopupVisibleChangeContext) {
    if (!next && pinned && context.trigger === 'trigger-element-hover') return
    visible.value = next
    if (!next) pinned = false
  }

  function togglePinned() {
    pinned = !pinned
    visible.value = pinned
  }

  function close() {
    pinned = false
    visible.value = false
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (!visible.value) return
    event.stopPropagation()
    close()
  }

  return { visible, updateVisibility, togglePinned, closeOnEscape }
}
