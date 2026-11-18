import { onBeforeUnmount, reactive, type Ref } from 'vue'
import { Loading, type TreeProps } from 'tdesign-vue-next'
import { CaretDownSmallIcon, CaretRightSmallIcon } from 'tdesign-icons-vue-next'

export interface TreeBranch<T> {
  value?: string | number
  children?: boolean | T[]
}

/** Own asynchronous branches so a rejected load never becomes an empty leaf or a stuck spinner. */
export function useTreeBranches<T extends TreeBranch<T>>(
  data: Ref<T[]>,
  fetchChildren: (id: string, signal: AbortSignal) => Promise<T[]>,
  getId: (node: T) => string = (node) => String(node.value),
) {
  const loading = reactive(new Set<string>())
  const requests = new Map<string, AbortController>()
  function find(items: T[], id: string): T | undefined {
    for (const item of items) {
      if (getId(item) === id) return item
      const child = Array.isArray(item.children) ? find(item.children, id) : undefined
      if (child) return child
    }
  }
  async function load(id: string) {
    const node = find(data.value, id)
    if (!node || node.children !== true || requests.has(id)) return
    const controller = new AbortController()
    requests.set(id, controller)
    loading.add(id)
    try {
      const children = await fetchChildren(id, controller.signal)
      if (controller.signal.aborted || find(data.value, id) !== node) return
      node.children = children
      data.value = [...data.value]
    } catch {
      // The request layer reports failures. Retain children=true so expansion can retry.
    } finally {
      if (requests.get(id) === controller) {
        requests.delete(id)
        loading.delete(id)
      }
    }
  }
  const onExpand: NonNullable<TreeProps['onExpand']> = (values, context) => {
    if (context.trigger !== 'setItem' && values.includes(context.node.value!))
      void load(String(context.node.value))
  }
  const icon: NonNullable<Exclude<TreeProps['icon'], boolean>> = (h, node) => {
    if (node.isLeaf()) return null
    if (loading.has(String(node.value))) return h(Loading, { size: 'small' })
    return h(node.expanded ? CaretDownSmallIcon : CaretRightSmallIcon)
  }
  function invalidate(id?: string) {
    if (id !== undefined) {
      requests.get(id)?.abort()
      requests.delete(id)
      loading.delete(id)
    } else {
      requests.forEach((controller) => controller.abort())
      requests.clear()
      loading.clear()
    }
  }
  onBeforeUnmount(() => invalidate())
  return { onExpand, icon, invalidate, load }
}
