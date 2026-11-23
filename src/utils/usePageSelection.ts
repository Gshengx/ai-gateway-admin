import { computed, ref, shallowRef, watch, type Ref } from 'vue'

/** A table event only replaces the selection on its current page. */
export function mergePageSelection(
  selected: string[],
  rows: ReadonlyArray<{ id: string }>,
  keys: Array<string | number>,
): string[] {
  const pageIds = new Set(rows.map((row) => row.id))
  return [
    ...new Set([
      ...selected.filter((id) => !pageIds.has(id)),
      ...keys.map(String).filter((id) => pageIds.has(id)),
    ]),
  ]
}

/** Keep IDs across remote pages; cache selected records for status-based batch actions. */
export function usePageSelection<T extends { id: string }>(rows: Ref<T[]>) {
  const selectedKeys = ref<string[]>([])
  const records = shallowRef(new Map<string, T>())
  watch(
    [rows, selectedKeys],
    () => {
      const selected = new Set(selectedKeys.value)
      const next = new Map([...records.value].filter(([id]) => selected.has(id)))
      for (const row of rows.value) {
        if (selected.has(row.id)) next.set(row.id, row)
      }
      records.value = next
    },
    { flush: 'sync' },
  )
  const selectedItems = computed(() => [...records.value.values()])
  function selectRows(keys: Array<string | number>) {
    selectedKeys.value = mergePageSelection(selectedKeys.value, rows.value, keys)
  }
  function clearSelection() {
    selectedKeys.value = []
    records.value = new Map<string, T>()
  }
  return { selectedKeys, selectedItems, selectRows, clearSelection }
}
