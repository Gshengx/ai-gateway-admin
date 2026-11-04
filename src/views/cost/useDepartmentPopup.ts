import { computed, onBeforeUnmount, onMounted, ref, useId, type Ref } from 'vue'
import type { TreeSelectProps } from 'tdesign-vue-next'

/** Match DepartmentTreeSelect: wider tree, constrained to the current dialog/drawer or viewport. */
export function useDepartmentPopup(root: Ref<HTMLElement | undefined>) {
  const visible = ref(false)
  const geometry = ref<{
    width: number
    placement: 'bottom-left' | 'bottom-right'
    boundary?: HTMLElement
    margin: number
    signature: string
  }>()
  const popupClass = `cost-department-popup-${useId().replace(/:/g, '-')}`
  let frame = 0
  function reset() {
    if (geometry.value)
      document.querySelector<HTMLElement>(`.${popupClass}`)?.style.removeProperty('width')
    geometry.value = undefined
  }
  function update() {
    if (!visible.value) return
    const trigger = root.value?.querySelector<HTMLElement>('.t-select-input')
    if (!trigger?.isConnected || !trigger.getClientRects().length) return reset()
    const rect = trigger.getBoundingClientRect(),
      style = getComputedStyle(trigger)
    if (style.visibility !== 'visible') return reset()
    const maximum = Number.parseFloat(style.getPropertyValue('--department-tree-popup-max-width'))
    const measure = document.createElement('span')
    measure.style.cssText = 'position:absolute;visibility:hidden;width:var(--td-comp-margin-l)'
    trigger.appendChild(measure)
    const margin = Number.parseFloat(getComputedStyle(measure).width)
    measure.remove()
    const boundary = trigger.closest<HTMLElement>('.t-dialog__body, .t-drawer__body') ?? undefined
    const bounds = boundary?.getBoundingClientRect()
    if (
      boundary &&
      (!boundary.getClientRects().length ||
        !bounds?.width ||
        !bounds.height ||
        getComputedStyle(boundary).visibility !== 'visible')
    )
      return reset()
    const left = Math.max(margin, bounds?.left ?? margin)
    const right = Math.min(
      document.documentElement.clientWidth - margin,
      bounds?.right ?? document.documentElement.clientWidth - margin,
    )
    if (
      ![rect.left, rect.right, rect.width, maximum, margin, left, right].every(Number.isFinite) ||
      rect.width <= 0 ||
      Math.abs(rect.width - trigger.offsetWidth) > 1 ||
      maximum <= 0 ||
      margin < 0 ||
      right - left < rect.width ||
      rect.left < left ||
      rect.right > right
    )
      return reset()
    const target = Math.max(rect.width, Math.min(maximum, right - left))
    const alignRight = Boolean(boundary) && rect.left + target > right
    const placement = alignRight ? 'bottom-right' : 'bottom-left'
    const width = Math.max(
      rect.width,
      Math.min(target, alignRight ? rect.right - left : right - rect.left),
    )
    const signature = [
      rect.left,
      rect.right,
      rect.top,
      rect.bottom,
      left,
      right,
      width,
      margin,
    ].join(',')
    if (geometry.value?.signature !== signature)
      geometry.value = { width, placement, boundary, margin, signature }
  }
  function track() {
    update()
    if (visible.value) frame = requestAnimationFrame(track)
  }
  function setVisible(value: boolean) {
    visible.value = value
    cancelAnimationFrame(frame)
    if (value) track()
    else reset()
  }
  const popupProps = computed<NonNullable<TreeSelectProps['popupProps']>>(() => {
    const current = geometry.value
    return {
      overlayInnerClassName: ['department-tree-popup', popupClass],
      ...(current && {
        overlayInnerStyle: { width: `${current.width}px` },
        placement: current.placement,
        popperOptions: {
          modifiers: [
            {
              name: 'preventOverflow',
              options: {
                boundary: current.boundary ?? 'clippingParents',
                rootBoundary: 'viewport',
                padding: current.margin,
                tether: false,
              },
            },
            {
              name: 'flip',
              options: {
                boundary: current.boundary ?? 'clippingParents',
                padding: current.margin,
                fallbackPlacements: [
                  current.placement === 'bottom-right' ? 'top-end' : 'top-start',
                ],
              },
            },
          ],
        },
      }),
    }
  })
  onMounted(() => window.addEventListener('resize', update))
  onBeforeUnmount(() => {
    visible.value = false
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', update)
  })
  return { popupProps, setVisible }
}
