import { nextTick, onBeforeUnmount, ref } from 'vue'

/** Keep the owner mounted until TDesign's own CSS exit transition finishes. */
export function useDrawerClose(selector: string, onClosed: () => void) {
  const visible = ref(true)
  let disposed = false
  onBeforeUnmount(() => {
    disposed = true
  })
  async function close(afterClose?: () => void) {
    if (!visible.value) return
    visible.value = false
    await nextTick()
    const root = document.querySelector(selector)
    while (!disposed && root?.isConnected && root.classList.contains('t-drawer--open')) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    if (disposed) return
    const panel = root?.querySelector('.t-drawer__content-wrapper')
    await Promise.allSettled((panel?.getAnimations() ?? []).map((animation) => animation.finished))
    if (disposed) return
    onClosed()
    afterClose?.()
  }
  return { visible, close }
}
