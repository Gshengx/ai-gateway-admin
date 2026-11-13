import type { ObjectDirective } from 'vue'

type CleanupElement = HTMLElement & { nonnegativeCleanup?: () => void }

/** Guard text input as well as the InputNumber value; min alone permits negative drafts. */
export const nonnegativeNumberDirective: ObjectDirective<CleanupElement> = {
  mounted(element) {
    const previous = new WeakMap<HTMLInputElement, string>()
    const inputFrom = (event: Event) =>
      event.target instanceof HTMLInputElement ? event.target : null
    const remember = (event: Event) => {
      const input = inputFrom(event)
      if (input && !input.value.trimStart().startsWith('-')) previous.set(input, input.value)
    }
    const beforeInput = (event: Event) => {
      remember(event)
      if ((event as InputEvent).data?.includes('-')) event.preventDefault()
    }
    const paste = (event: Event) => {
      remember(event)
      if ((event as ClipboardEvent).clipboardData?.getData('text').trimStart().startsWith('-'))
        event.preventDefault()
    }
    const onInput = (event: Event) => {
      const input = inputFrom(event)
      if (!input) return
      if (input.value.trimStart().startsWith('-')) {
        input.value = previous.get(input) ?? ''
        event.stopImmediatePropagation()
      } else previous.set(input, input.value)
    }
    const listeners: [string, EventListener][] = [
      ['focusin', remember],
      ['beforeinput', beforeInput],
      ['paste', paste],
      ['input', onInput],
    ]
    listeners.forEach(([type, listener]) => element.addEventListener(type, listener, true))
    element.nonnegativeCleanup = () =>
      listeners.forEach(([type, listener]) => element.removeEventListener(type, listener, true))
  },
  beforeUnmount(element) {
    element.nonnegativeCleanup?.()
    delete element.nonnegativeCleanup
  },
}
