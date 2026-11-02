export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall back to the synchronous copy command.
    }
  }

  if (typeof document.execCommand !== 'function' || !document.body) return false

  const activeElement = document.activeElement
  const input =
    activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement
      : null
  const inputStart = input?.selectionStart
  const inputEnd = input?.selectionEnd
  const inputDirection = input?.selectionDirection
  const selection = window.getSelection()
  const ranges: Range[] = []
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i++) {
      ranges.push(selection.getRangeAt(i).cloneRange())
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  try {
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    if (activeElement instanceof HTMLElement) activeElement.focus({ preventScroll: true })
    if (input && inputStart != null && inputEnd != null) {
      input.setSelectionRange(inputStart, inputEnd, inputDirection ?? undefined)
    }
    if (selection) {
      selection.removeAllRanges()
      ranges.forEach((range) => selection.addRange(range))
    }
  }
}
