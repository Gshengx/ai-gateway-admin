import { computed, onBeforeUnmount, onMounted, ref, useId, type Ref } from 'vue'
import type { TreeSelectProps } from 'tdesign-vue-next'

/** Track layout changes and ancestor animations without polling a stationary popup. */
export function useDepartmentPopup(root: Ref<HTMLElement | undefined>) {
  const geometry = ref<{
    width: number
    placement: 'bottom-left' | 'bottom-right'
    boundary?: HTMLElement
    margin: number
  }>()
  const popupClass = `department-popup-${useId().replace(/:/g, '-')}`
  let visible = false
  let frame = 0
  let observer: ResizeObserver | undefined
  let measure: HTMLElement | undefined

  function reset() {
    document.querySelector<HTMLElement>(`.${popupClass}`)?.style.removeProperty('width')
    geometry.value = undefined
  }
  function update() {
    if (!visible) return
    const trigger = root.value?.querySelector<HTMLElement>('.t-select-input')
    if (!trigger?.getClientRects().length || !measure) return reset()
    const rect = trigger.getBoundingClientRect()
    const style = getComputedStyle(trigger)
    const maximum = Number.parseFloat(style.getPropertyValue('--department-tree-popup-max-width'))
    const margin = measure.getBoundingClientRect().width
    const boundary = trigger.closest<HTMLElement>('.t-dialog__body, .t-drawer__body') ?? undefined
    const bounds = boundary?.getBoundingClientRect()
    const left = Math.max(margin, bounds?.left ?? margin)
    const right = Math.min(document.documentElement.clientWidth - margin, bounds?.right ?? Infinity)
    if (
      style.visibility !== 'visible' ||
      (boundary && (!bounds?.width || !bounds.height)) ||
      ![rect.left, rect.right, rect.width, maximum, margin, left, right].every(Number.isFinite) ||
      rect.width <= 0 ||
      Math.abs(rect.width - trigger.offsetWidth) > 1 ||
      maximum <= 0 ||
      right - left < rect.width ||
      rect.left < left ||
      rect.right > right
    )
      return reset()
    const target = Math.max(rect.width, Math.min(maximum, right - left))
    const alignRight = Boolean(boundary) && rect.left + target > right
    geometry.value = {
      width: Math.max(
        rect.width,
        Math.min(target, alignRight ? rect.right - left : right - rect.left),
      ),
      placement: alignRight ? 'bottom-right' : 'bottom-left',
      boundary,
      margin,
    }
  }
  function animated() {
    for (let element = root.value; element; element = element.parentElement ?? undefined)
      if (element.getAnimations().some((animation) => animation.playState === 'running'))
        return true
    return false
  }
  function trackAnimation() {
    cancelAnimationFrame(frame)
    update()
    if (visible && animated()) frame = requestAnimationFrame(trackAnimation)
  }
  function motionStarted(event: Event) {
    if (event.target instanceof HTMLElement && event.target.contains(root.value ?? null))
      trackAnimation()
  }
  function setVisible(value: boolean) {
    visible = value
    if (value) trackAnimation()
    else {
      cancelAnimationFrame(frame)
      reset()
    }
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
  onMounted(() => {
    if (root.value) {
      measure = document.createElement('span')
      measure.style.cssText = 'position:absolute;visibility:hidden;width:var(--td-comp-margin-l)'
      root.value.append(measure)
      observer = new ResizeObserver(update)
      observer.observe(root.value)
      const boundary = root.value.closest('.t-dialog__body, .t-drawer__body')
      if (boundary) observer.observe(boundary)
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    document.addEventListener('transitionrun', motionStarted, true)
    document.addEventListener('animationstart', motionStarted, true)
  })
  onBeforeUnmount(() => {
    visible = false
    cancelAnimationFrame(frame)
    observer?.disconnect()
    measure?.remove()
    window.removeEventListener('resize', update)
    window.removeEventListener('scroll', update, true)
    document.removeEventListener('transitionrun', motionStarted, true)
    document.removeEventListener('animationstart', motionStarted, true)
  })
  return { popupProps, setVisible }
}
