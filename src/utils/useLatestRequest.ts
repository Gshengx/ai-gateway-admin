import { onBeforeUnmount } from 'vue'

/** Invalidate immediately, including during debounce, so old responses cannot repaint a list. */
export function useLatestRequest() {
  let version = 0
  let disposed = false
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function invalidate() {
    ++version
    controller?.abort()
    clearTimeout(timer)
  }

  function begin() {
    invalidate()
    controller = new AbortController()
    const current = version
    return {
      signal: controller.signal,
      isCurrent: () => !disposed && current === version,
    }
  }

  function schedule(callback: () => void, delay = 250) {
    invalidate()
    timer = setTimeout(() => {
      if (!disposed) callback()
    }, delay)
  }

  onBeforeUnmount(() => {
    disposed = true
    invalidate()
  })

  return { begin, invalidate, schedule }
}
