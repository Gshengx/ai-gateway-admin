import { onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'

/** Fill the space below a page's filters without moving its footer outside the viewport. */
export function useTableViewport({
  panel = false,
  minimumOnly = false,
}: { panel?: boolean; minimumOnly?: boolean } = {}) {
  const tableRoot = ref<HTMLElement>()
  const tableHeight = ref<string>()
  let observer: ResizeObserver | undefined
  let frame = 0

  const pixels = (value: string) => Number.parseFloat(value) || 0

  function measure() {
    frame = 0
    const table = tableRoot.value
    const main = table?.closest('main')
    if (!table || !main || !table.getClientRects().length) return
    const mainStyle = getComputedStyle(main)
    if (panel) {
      let topPadding = 0
      let bottomPadding = 0
      for (
        let parent = table.parentElement;
        parent && parent !== main;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent)
        topPadding += pixels(style.paddingTop)
        bottomPadding += pixels(style.paddingBottom)
      }
      const available = Math.max(
        0,
        main.clientHeight -
          pixels(mainStyle.paddingTop) -
          pixels(mainStyle.paddingBottom) -
          topPadding -
          bottomPadding,
      )
      const preface = Math.max(
        0,
        table.getBoundingClientRect().top -
          main.getBoundingClientRect().top +
          main.scrollTop -
          pixels(mainStyle.paddingTop) -
          topPadding,
      )
      // Large business summaries may scroll away; list controls stay in this panel.
      const height = `${Math.floor(preface > available / 4 ? available : Math.max(0, available - preface))}px`
      if (height !== tableHeight.value) tableHeight.value = height
      return
    }
    const content = table.querySelector<HTMLElement>(':scope > .t-table__content')
    if (!content) return
    const list = table.closest<HTMLElement>('.page-table-list')
    if (list) {
      const dataRows = [...table.querySelectorAll<HTMLTableRowElement>('tbody > tr')].filter(
        (row) => row.querySelector('td:not([colspan])'),
      )
      const heights = dataRows.slice(0, 6).map((row) => row.getBoundingClientRect().height)
      const average = heights.length
        ? heights.reduce((sum, height) => sum + height, 0) / heights.length
        : pixels(mainStyle.getPropertyValue('--td-comp-size-xl'))
      const header = table.querySelector('thead')?.getBoundingClientRect().height ?? average
      const footer =
        table
          .querySelector<HTMLElement>(':scope > .t-table__pagination-wrap')
          ?.getBoundingClientRect().height ?? 0
      const minimum = `${Math.ceil(header + average * 6 + footer + content.offsetHeight - content.clientHeight)}px`
      if (list.style.getPropertyValue('--page-table-requested-min-height') !== minimum)
        list.style.setProperty('--page-table-requested-min-height', minimum)
      const region = table.closest<HTMLElement>('[data-list-region]')
      const layout = list.closest<HTMLElement>('.page-table-layout')
      if (region && layout) {
        const style = getComputedStyle(layout)
        const siblings = [...layout.children].filter((child): child is HTMLElement => {
          if (!(child instanceof HTMLElement) || child === list || !child.getClientRects().length)
            return false
          const position = getComputedStyle(child).position
          return position !== 'absolute' && position !== 'fixed'
        })
        let required = pixels(minimum) + pixels(style.rowGap) * siblings.length
        for (const sibling of siblings) {
          const siblingStyle = getComputedStyle(sibling)
          required +=
            sibling.getBoundingClientRect().height +
            pixels(siblingStyle.marginTop) +
            pixels(siblingStyle.marginBottom)
        }
        for (let node: HTMLElement | null = layout; node; node = node.parentElement) {
          const nodeStyle = getComputedStyle(node)
          required +=
            pixels(nodeStyle.paddingTop) +
            pixels(nodeStyle.paddingBottom) +
            pixels(nodeStyle.borderTopWidth) +
            pixels(nodeStyle.borderBottomWidth)
          if (node === region) break
        }
        const regionMinimum = `${Math.ceil(required)}px`
        if (region.style.getPropertyValue('--page-table-layout-min-height') !== regionMinimum)
          region.style.setProperty('--page-table-layout-min-height', regionMinimum)
      }
    }
    if (minimumOnly) return
    const region = table.closest<HTMLElement>('[data-list-region]') ?? main
    let bottom =
      region.getBoundingClientRect().top +
      region.clientTop +
      region.clientHeight -
      pixels(getComputedStyle(region).paddingBottom)
    for (let node: HTMLElement = table; node.parentElement && node.parentElement !== region;) {
      const parent = node.parentElement
      const style = getComputedStyle(parent)
      bottom -= pixels(style.paddingBottom)
      const siblings = [...parent.children]
        .slice([...parent.children].indexOf(node) + 1)
        .filter((sibling): sibling is HTMLElement => {
          if (!(sibling instanceof HTMLElement) || !sibling.getClientRects().length) return false
          const position = getComputedStyle(sibling).position
          return position !== 'absolute' && position !== 'fixed'
        })
      for (const sibling of siblings) {
        const siblingStyle = getComputedStyle(sibling)
        bottom -=
          sibling.getBoundingClientRect().height +
          pixels(siblingStyle.marginTop) +
          pixels(siblingStyle.marginBottom)
      }
      // A horizontal layout's other column must not be deducted from vertical space.
      if (style.display.includes('flex') && style.flexDirection.startsWith('row')) {
        for (const sibling of siblings) {
          const siblingStyle = getComputedStyle(sibling)
          bottom +=
            sibling.getBoundingClientRect().height +
            pixels(siblingStyle.marginTop) +
            pixels(siblingStyle.marginBottom)
        }
      } else bottom -= pixels(style.rowGap) * siblings.length
      node = parent
    }
    const footer = table.querySelector<HTMLElement>(':scope > .t-table__pagination-wrap')
    bottom -= footer?.getBoundingClientRect().height ?? 0
    const height = `${Math.max(0, Math.floor(bottom - content.getBoundingClientRect().top))}px`
    if (height !== tableHeight.value) tableHeight.value = height
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure)
  }

  function observe() {
    observer?.disconnect()
    const table = tableRoot.value
    if (table) {
      const main = table.closest('main')
      const body = table.querySelector('tbody')
      if (body) observer?.observe(body)
      const controls = table.closest('[data-list-region]')?.querySelector('.page-table-controls')
      if (controls) observer?.observe(controls)
      if (main) {
        observer?.observe(main)
      }
      for (
        let parent = table.parentElement;
        parent && parent !== main;
        parent = parent.parentElement
      )
        observer?.observe(parent)
    }
    schedule()
  }

  function setTableRoot(instance: Element | ComponentPublicInstance | null) {
    const element =
      instance instanceof HTMLElement
        ? instance
        : instance && '$el' in instance
          ? instance.$el
          : undefined
    tableRoot.value = element instanceof HTMLElement ? element : undefined
  }

  onMounted(() => {
    observer = new ResizeObserver(schedule)
    observe()
    window.addEventListener('resize', schedule)
  })
  watch(tableRoot, observe, { flush: 'post' })
  onBeforeUnmount(() => {
    observer?.disconnect()
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', schedule)
  })
  return { tableHeight, setTableRoot }
}
