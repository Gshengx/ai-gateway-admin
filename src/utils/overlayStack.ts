import '@/styles/overlays.css'

/** TDesign retains its own hit targets, focus handling and panel animations. */
export function installOverlayStack() {
  const mask = document.createElement('div')
  mask.className = 'app-overlay-mask'
  mask.setAttribute('aria-hidden', 'true')
  document.body.append(mask)
  document.body.classList.add('app-overlay-managed')
  const layers = new Map<HTMLElement, { base: number; order: number }>()
  let sequence = 0

  function synchronize() {
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.t-drawer--open, .t-dialog__ctx:not(.t-dialog__ctx--modeless)',
      ),
    ).filter((root) => {
      const style = getComputedStyle(root)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })
    for (const [root] of layers) {
      if (roots.includes(root)) continue
      root.removeAttribute('data-app-overlay-layer')
      root.style.removeProperty('--app-overlay-z-index')
      layers.delete(root)
    }
    for (const root of roots) {
      if (!layers.has(root))
        layers.set(root, {
          base: Number.parseInt(getComputedStyle(root).zIndex, 10) || 0,
          order: ++sequence,
        })
    }
    roots.sort((a, b) => {
      const left = layers.get(a)!
      const right = layers.get(b)!
      return left.base - right.base || left.order - right.order
    })
    let topZIndex = 0
    for (const root of roots) {
      const layer = layers.get(root)!
      topZIndex = Math.max(layer.base, topZIndex + 2)
      const next = String(topZIndex)
      root.setAttribute('data-app-overlay-layer', '')
      if (root.style.getPropertyValue('--app-overlay-z-index') !== next)
        root.style.setProperty('--app-overlay-z-index', next)
    }
    const masked = roots.some((root) =>
      root.matches('.t-drawer')
        ? !!root.querySelector(':scope > .t-drawer__mask')
        : !!root.querySelector('.t-dialog__mask:not(.t-is-hidden)'),
    )
    const nextZIndex = String(Math.max(0, topZIndex - 1))
    if (roots.length && mask.style.zIndex !== nextZIndex) mask.style.zIndex = nextZIndex
    if (mask.classList.contains('app-overlay-mask--visible') !== masked)
      mask.classList.toggle('app-overlay-mask--visible', masked)
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.target !== mask)) synchronize()
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  })
  synchronize()

  return () => {
    observer.disconnect()
    for (const [root] of layers) {
      root.removeAttribute('data-app-overlay-layer')
      root.style.removeProperty('--app-overlay-z-index')
    }
    mask.remove()
    document.body.classList.remove('app-overlay-managed')
  }
}
