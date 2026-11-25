import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** 固定布局表格仍需明确列宽；以当前可见按钮的固有宽度测量，避免分摊剩余空间。 */
export function useActionColumnWidth({
  cellSelector = '.ma-table .ma-action-cell',
  actionsSelector = '.ma-actions',
}: { cellSelector?: string; actionsSelector?: string } = {}) {
  const actionTableRoot = ref<HTMLElement>()
  const actionColumnWidth = ref(1)
  let frame = 0
  let mutations: MutationObserver | undefined
  let sizes: ResizeObserver | undefined

  function measure() {
    frame = 0
    const root = actionTableRoot.value
    if (!root) return
    let width = 0
    for (const cell of root.querySelectorAll<HTMLElement>(cellSelector)) {
      const style = getComputedStyle(cell)
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const actions = cell.querySelector<HTMLElement>(actionsSelector)
      if (actions) {
        width = Math.max(width, actions.getBoundingClientRect().width + padding)
      } else if (cell.tagName === 'TH') {
        // 逐个测量文本节点，不能使用已被表格拉伸的表头容器宽度。
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
        const range = document.createRange()
        let textWidth = 0
        while (walker.nextNode()) {
          range.selectNodeContents(walker.currentNode)
          textWidth += range.getBoundingClientRect().width
        }
        width = Math.max(width, textWidth + padding)
      }
    }
    if (width) actionColumnWidth.value = Math.ceil(width)
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure)
  }

  function observeActions() {
    sizes?.disconnect()
    const root = actionTableRoot.value
    if (root) {
      sizes?.observe(root)
      root.querySelectorAll(actionsSelector).forEach((actions) => sizes?.observe(actions))
    }
    schedule()
  }

  onMounted(() => {
    sizes = new ResizeObserver(schedule)
    mutations = new MutationObserver(observeActions)
    if (actionTableRoot.value) {
      mutations.observe(actionTableRoot.value, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    }
    observeActions()
  })
  watch(
    actionTableRoot,
    (root) => {
      mutations?.disconnect()
      if (root) mutations?.observe(root, { childList: true, subtree: true, characterData: true })
      observeActions()
    },
    { flush: 'post' },
  )
  onBeforeUnmount(() => {
    mutations?.disconnect()
    sizes?.disconnect()
    cancelAnimationFrame(frame)
  })

  return { actionTableRoot, actionColumnWidth }
}
