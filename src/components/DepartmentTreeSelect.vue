<template>
  <div class="department-tree-select">
    <div ref="controls" class="department-tree-select__controls">
      <t-tree-select
        class="department-tree-select__input"
        :value="modelValue"
        :data="departmentTree"
        :tree-props="departmentTreeProps"
        :filter="() => true"
        :value-display="() => selectedDepartmentName"
        :title="selectedDepartmentName"
        :loading="departmentLoading"
        :loading-text="t('common.departmentTree.loading')"
        :empty="t('common.departmentTree.empty')"
        :placeholder="placeholder"
        :clearable="clearable"
        :input-value="popupVisible ? departmentKeyword : ''"
        :disabled="disabled || resolving"
        :popup-props="departmentPopupProps"
        :filterable="searchable"
        :input-props="{ name: 'department-tree-filter', autocomplete: 'off' }"
        @change="onChange"
        @clear="clearDepartment"
        @input-change="onDepartmentSearch"
        @search="onDepartmentSearch"
        @popup-visible-change="onPopupVisibleChange"
      />
    </div>
    <t-alert v-if="failure" theme="warning" :message="t(failure)">
      <template #operation>
        <t-link :disabled="disabled || resolving" @click="retry">
          {{ t('common.departmentTree.retry') }}
        </t-link>
      </template>
    </t-alert>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, MessagePlugin, type TreeProps, type TreeSelectProps } from 'tdesign-vue-next'
import { RefreshIcon } from 'tdesign-icons-vue-next'
import {
  getDepartmentListApi,
  type DepartmentItem,
  type DepartmentQuery,
} from '@/api/modules/identity'
import { useDepartmentPopup } from '@/utils/useDepartmentPopup'
import { useTreeBranches } from '@/utils/useTreeBranches'
import { useDepartmentScope } from '@/utils/useDepartmentScope'
import { revealDepartmentSelection } from '@/utils/revealDepartmentSelection'

type DepartmentOption = Pick<
  DepartmentItem,
  'id' | 'name' | 'display_name' | 'parent_id' | 'has_children'
> & { matched?: boolean }

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    clearable?: boolean
    disabled?: boolean
    resolveDescendants?: boolean
    searchable?: boolean
    loadDepartments?: (params: DepartmentQuery) => Promise<{ items: DepartmentOption[] }>
  }>(),
  { clearable: true, resolveDescendants: true, searchable: true },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [payload: { id: string; departmentIds: string[] }]
}>()
const { t, locale } = useI18n()
const controls = ref<HTMLElement>()
const { popupProps: departmentPopupProps, setVisible: setPopupVisible } =
  useDepartmentPopup(controls)

interface DepartmentNode {
  value: string
  label: string
  children?: true | DepartmentNode[]
  matched?: boolean
}

const lazyDepartments = ref<DepartmentNode[]>([])
const searchDepartments = ref<DepartmentNode[]>([])
const searchExpanded = ref<Array<string | number>>([])
const browseExpanded = ref<Array<string | number>>([])
const departmentKeyword = ref('')
const popupVisible = ref(false)
let panelCleanupPending = false
const searchLoading = ref(false)
const rootLoading = ref(false)
const resolving = ref(false)
const failure = ref('')
let resolvedId: string | undefined
let retrySelection: string | undefined
const departmentLoading = computed(
  () => searchLoading.value || rootLoading.value || resolving.value,
)
const departmentItems = new Map<string, DepartmentOption>()
const nodeVersions = new Map<string, number>()
const refreshingNodes = reactive(new Set<string>())
let rootLoaded = false
let selectionVersion = 0
const departmentNames = reactive(new Map<string, string>())
let departmentSession = 0
let searchVersion = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
const departmentTree = computed(() =>
  departmentKeyword.value ? searchDepartments.value : lazyDepartments.value,
)
const selectedDepartmentName = computed(() => departmentNames.get(props.modelValue) ?? '')
useDepartmentScope(reset)

function fetchDepartments(params: DepartmentQuery = {}) {
  const query = params.search?.trim()
    ? { search: params.search.trim() }
    : params.parent_id
      ? { parent_id: params.parent_id }
      : {}
  return props.loadDepartments ? props.loadDepartments(query) : getDepartmentListApi(query)
}

function departmentNodes(items: DepartmentOption[]): DepartmentNode[] {
  return items.map((item) => {
    departmentItems.set(item.id, item)
    const label = item.display_name || item.name
    departmentNames.set(item.id, label)
    return {
      value: item.id,
      label,
      children: item.has_children ? true : undefined,
      matched: item.matched,
    }
  })
}

const branches = useTreeBranches(lazyDepartments, async (id, signal) => {
  const items = await requestChildren(id)
  return signal.aborted ? [] : departmentNodes(items)
})
const searchBranches = useTreeBranches(searchDepartments, async (id, signal) => {
  const items = await requestChildren(id)
  return signal.aborted ? [] : departmentNodes(items)
})

const departmentTreeProps = computed<TreeProps>(() => ({
  lazy: true,
  operations: (h, model) => {
    const id = String(model.value)
    const node = findNode(lazyDepartments.value, id)
    if (
      departmentKeyword.value ||
      !node ||
      !(node.children === true || (Array.isArray(node.children) && node.children.length))
    )
      return null
    return h(
      Button,
      {
        class: 'department-tree-node-refresh',
        variant: 'text',
        theme: 'default',
        size: 'small',
        type: 'button',
        'aria-label': t('common.departmentTree.refreshNode', { name: node.label }),
        loading: refreshingNodes.has(id),
        disabled: props.disabled || refreshingNodes.has(id),
        onMousedown: (event: MouseEvent) => event.stopPropagation(),
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          void refreshNode(id)
        },
      },
      { icon: () => h(RefreshIcon) },
    )
  },
  label: (h, nodeModel) => {
    const text = String(nodeModel.data.label ?? nodeModel.label ?? '')
    const keyword = departmentKeyword.value
    if (!keyword || nodeModel.data.matched === false) return text
    const matchIndex = text.toLowerCase().indexOf(keyword.toLowerCase())
    if (matchIndex < 0 && nodeModel.data.matched !== true) return text
    // A raw-name match may have a translated display name without the keyword.
    const index = Math.max(0, matchIndex)
    const end = matchIndex < 0 ? text.length : index + keyword.length
    return h('span', [
      text.slice(0, index),
      h(
        'mark',
        {
          class: 'user-dept-hit',
          // 下拉弹层 teleport 到 body，scoped CSS 无法作用于此处，因此使用内联样式。
          style: {
            color: 'var(--td-brand-color)',
            background: 'var(--td-brand-color-light)',
            borderRadius: 'var(--td-radius-small)',
            paddingInline: 'var(--td-comp-margin-xxs)',
          },
        },
        text.slice(index, end),
      ),
      text.slice(end),
    ])
  },
  expanded: departmentKeyword.value ? searchExpanded.value : browseExpanded.value,
  onExpand: (values, context) => {
    if (departmentKeyword.value) {
      searchExpanded.value = values
      searchBranches.onExpand(values, context)
    } else {
      browseExpanded.value = values
      branches.onExpand(values, context)
    }
  },
  icon: departmentKeyword.value ? searchBranches.icon : branches.icon,
}))

function onDepartmentSearch(value: string) {
  if (value.trim() === departmentKeyword.value) return
  searchBranches.invalidate()
  clearTimeout(searchTimer)
  const version = ++searchVersion
  const session = departmentSession
  const keyword = value.trim()
  departmentKeyword.value = keyword
  searchDepartments.value = []
  searchLoading.value = Boolean(keyword)
  if (!keyword) return
  searchTimer = setTimeout(async () => {
    try {
      const result = await fetchDepartments({ search: keyword })
      if (version !== searchVersion || session !== departmentSession) return
      const nodes = departmentNodes(result.items)
      const byId = new Map(nodes.map((node) => [node.value, node]))
      const roots: DepartmentNode[] = []
      result.items.forEach((item, index) => {
        const node = nodes[index]!
        const parent = item.parent_id ? byId.get(item.parent_id) : undefined
        if (parent) {
          if (!Array.isArray(parent.children)) parent.children = []
          parent.children.push(node)
        } else roots.push(node)
      })
      searchDepartments.value = roots
      searchExpanded.value = nodes
        .filter((node) => Array.isArray(node.children))
        .map((node) => node.value)
    } catch {
      // Request errors are reported by the request interceptor.
    } finally {
      if (version === searchVersion && session === departmentSession) searchLoading.value = false
    }
  }, 300)
}

function findNode(nodes: DepartmentNode[], id: string): DepartmentNode | undefined {
  for (const node of nodes) {
    if (node.value === id) return node
    const child = Array.isArray(node.children) ? findNode(node.children, id) : undefined
    if (child) return child
  }
}

function requestChildren(id: string): Promise<DepartmentOption[]> {
  return fetchDepartments({ parent_id: id }).then((result) => result.items)
}

async function collectDescendants(
  id: string,
  items: Map<string, DepartmentOption>,
  request: (id: string) => Promise<DepartmentOption[]>,
  isCurrent: () => boolean,
) {
  const visited = new Set([id])
  let current = items.get(id)?.has_children === false ? [] : [id]
  // The selected department plus at most nine further levels.
  for (let level = 1; current.length && level < 10; level += 1) {
    if (!isCurrent()) throw new Error('Stale department resolution')
    const groups = await Promise.all(current.map(request))
    if (!isCurrent()) throw new Error('Stale department resolution')
    current = []
    for (const item of groups.flat()) {
      if (visited.has(item.id)) continue
      visited.add(item.id)
      items.set(item.id, item)
      if (item.has_children) current.push(item.id)
    }
  }
  // Never commit a partial range if the server tree exceeds the supported depth.
  if (current.length) throw new Error('Department depth exceeds resolution limit')
  return [...visited]
}

async function resolveSelection(id: string, updateModel = false) {
  const version = ++selectionVersion
  const session = departmentSession
  resolving.value = Boolean(id) && props.resolveDescendants
  const items = new Map(departmentItems)
  try {
    const departmentIds =
      id && props.resolveDescendants
        ? await collectDescendants(
            id,
            items,
            requestChildren,
            () => session === departmentSession && version === selectionVersion,
          )
        : []
    if (session !== departmentSession || version !== selectionVersion) return
    items.forEach((item, key) => {
      departmentItems.set(key, item)
      departmentNames.set(key, item.display_name || item.name)
    })
    resolvedId = id
    failure.value = ''
    retrySelection = undefined
    if (updateModel) emit('update:modelValue', id)
    emit('change', { id, departmentIds })
  } catch {
    if (session !== departmentSession || version !== selectionVersion) return
    failure.value = 'common.departmentTree.resolveFailed'
    retrySelection = id
    // Keep the last committed filter range and selection when traversal fails.
    if (!updateModel && resolvedId !== undefined) emit('update:modelValue', resolvedId)
  } finally {
    if (session === departmentSession && version === selectionVersion) resolving.value = false
  }
}

const onChange: NonNullable<TreeSelectProps['onChange']> = (value) => {
  const id = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  void resolveSelection(id, true)
}

watch(
  () => props.modelValue,
  (id, previous) => {
    if (previous === undefined && !id) {
      resolvedId = ''
      return
    }
    if (id !== resolvedId) void resolveSelection(id)
  },
  { immediate: true },
)

async function loadRoots() {
  if (rootLoading.value || rootLoaded) return
  const session = departmentSession
  rootLoading.value = true
  try {
    const result = await fetchDepartments()
    if (session !== departmentSession) return
    lazyDepartments.value = departmentNodes(result.items)
    rootLoaded = true
  } catch {
    // Opening the dropdown retries failed root requests.
  } finally {
    if (session === departmentSession) rootLoading.value = false
  }
}

async function onPopupVisibleChange(visible: boolean) {
  popupVisible.value = visible
  setPopupVisible(visible)
  if (visible) {
    panelCleanupPending = false
    await nextTick()
    if (!popupVisible.value) return
    if (props.searchable && props.modelValue && selectedDepartmentName.value) {
      onDepartmentSearch(selectedDepartmentName.value)
      return
    }
    const session = departmentSession
    const selected = props.modelValue
    await loadRoots()
    if (!rootLoaded && session === departmentSession) {
      try {
        const result = await fetchDepartments()
        if (session !== departmentSession) return
        lazyDepartments.value = departmentNodes(result.items)
        rootLoaded = true
      } catch {
        return
      }
    }
    const isCurrent = () =>
      session === departmentSession && selected === props.modelValue && !departmentKeyword.value
    const ancestors = await revealDepartmentSelection(
      [selected],
      (id) => departmentItems.get(id)?.parent_id,
      branches.load,
      isCurrent,
    )
    if (isCurrent()) browseExpanded.value = [...new Set([...browseExpanded.value, ...ancestors])]
  } else {
    onDepartmentSearch('')
    panelCleanupPending = true
    await nextTick()
    if (!popupVisible.value && !resolving.value) clearState(true)
  }
}

watch(resolving, async (busy) => {
  if (!busy && panelCleanupPending && !popupVisible.value) {
    await nextTick()
    if (!popupVisible.value) clearState(true)
  }
})

function clearDepartment() {
  if (props.disabled || resolving.value) return
  onDepartmentSearch('')
  if (popupVisible.value) void loadRoots()
}

function clearState(keepSelection = false) {
  const selected = props.modelValue
  const name = keepSelection ? departmentNames.get(selected) : undefined
  const item = keepSelection ? departmentItems.get(selected) : undefined
  panelCleanupPending = false
  failure.value = ''
  retrySelection = undefined
  departmentSession++
  searchVersion++
  selectionVersion++
  clearTimeout(searchTimer)
  branches.invalidate()
  searchBranches.invalidate()
  searchExpanded.value = []
  browseExpanded.value = []
  nodeVersions.clear()
  refreshingNodes.clear()
  lazyDepartments.value = []
  searchDepartments.value = []
  departmentKeyword.value = ''
  departmentNames.clear()
  departmentItems.clear()
  rootLoaded = false
  searchLoading.value = false
  rootLoading.value = false
  resolving.value = false
  if (name) departmentNames.set(selected, name)
  if (item) departmentItems.set(selected, item)
}

function reset() {
  clearState()
  void loadRoots()
}
/** Refresh only direct children; retain loaded subtrees and the committed filter range. */
async function refreshNode(id: string) {
  if (departmentKeyword.value || refreshingNodes.has(id) || props.disabled) return
  const parent = findNode(lazyDepartments.value, id)
  if (!parent) return
  const session = departmentSession
  const version = (nodeVersions.get(id) ?? 0) + 1
  nodeVersions.set(id, version)
  refreshingNodes.add(id)
  branches.invalidate(id)
  const isCurrent = () => session === departmentSession && nodeVersions.get(id) === version
  try {
    const items = await requestChildren(id)
    if (!isCurrent() || findNode(lazyDepartments.value, id) !== parent) return
    const previous = new Map(
      (Array.isArray(parent.children) ? parent.children : []).map((child) => [child.value, child]),
    )
    // Resolve the selected descendant's direct branch before updating the displayed parent links.
    let branch = props.modelValue
    const visited = new Set<string>()
    while (branch && !visited.has(branch)) {
      visited.add(branch)
      const parentId = departmentItems.get(branch)?.parent_id
      if (parentId === id) break
      branch = parentId ?? ''
    }
    const missingSelection =
      branch &&
      branch !== id &&
      departmentItems.get(branch)?.parent_id === id &&
      !items.some((item) => item.id === branch)
    parent.children = departmentNodes(items).map((child) => {
      const old = previous.get(child.value)
      if (old && Array.isArray(old.children)) child.children = old.children
      return child
    })
    // Notify TDesign's shallow data watcher. TreeSelect retains its controlled
    // expanded/actived values; the selector instance and treeVersion stay unchanged.
    lazyDepartments.value = [...lazyDepartments.value]
    const parentItem = departmentItems.get(id)
    if (parentItem) departmentItems.set(id, { ...parentItem, has_children: items.length > 0 })
    if (missingSelection) void MessagePlugin.warning(t('common.departmentTree.selectionMissing'))
    // 刷新的是当前筛选部门本身时，其后代范围可能已变化，需要重算并通知调用方。
    if (props.resolveDescendants && props.modelValue === id) void resolveSelection(id)
  } catch (error) {
    if (isCurrent() && !(error as { notified?: boolean })?.notified) {
      void MessagePlugin.error(t('common.departmentTree.nodeRefreshFailed'))
    }
  } finally {
    if (isCurrent()) refreshingNodes.delete(id)
  }
}

function retry() {
  if (retrySelection !== undefined) void resolveSelection(retrySelection, true)
}

defineExpose({ reset })

watch(() => props.loadDepartments, reset, { flush: 'sync' })

watch(locale, async () => {
  const id = props.modelValue
  const selected = departmentItems.get(id)
  const resumeResolution = resolving.value
  const ancestors: string[] = []
  const visited = new Set<string>([id])
  let parentId = selected?.parent_id
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    ancestors.unshift(parentId)
    parentId = departmentItems.get(parentId)?.parent_id
  }
  clearState()
  const session = departmentSession
  await loadRoots()
  if (session !== departmentSession) return
  // A locale switch must not drop an unfinished group selection event.
  if (resumeResolution && props.modelValue === id) void resolveSelection(id)
  if (session !== departmentSession || !id || departmentNames.has(id)) return
  try {
    // Refresh only the known ancestor path, without resolving the selected subtree.
    for (const ancestor of ancestors) {
      const items = await requestChildren(ancestor)
      if (session !== departmentSession) return
      const children = departmentNodes(items)
      const parent = findNode(lazyDepartments.value, ancestor)
      if (parent) parent.children = children
    }
    if (!departmentNames.has(id)) {
      // Supports externally supplied values whose ancestor path is not loaded yet.
      const result = await fetchDepartments({ search: selected?.name || id })
      if (session !== departmentSession) return
      departmentNodes(result.items)
    }
  } catch {
    // Request errors are reported by the request interceptor.
  }
})

onMounted(() => {
  void loadRoots()
})
onBeforeUnmount(() => {
  clearState()
})
</script>

<style scoped>
.department-tree-select {
  min-width: 0;
  max-width: 100%;
}
.department-tree-select__controls {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-xs);
}
.department-tree-select__input {
  flex: 1;
  width: 100%;
  min-width: 0;
}
.department-tree-select :deep(.t-alert) {
  margin-top: var(--td-comp-margin-xs);
}
/* 节点刷新按钮平时隐藏，悬停该行或键盘聚焦时显示。
 * 下拉弹层 teleport 到 body，scoped 选择器无法命中，故使用 :global。 */
:global(.t-tree__item .department-tree-node-refresh) {
  opacity: 0;
  pointer-events: none;
}
:global(.t-tree__item:hover .department-tree-node-refresh),
:global(.t-tree__item:focus-within .department-tree-node-refresh) {
  opacity: 1;
  pointer-events: auto;
}
@media (hover: none) {
  :global(.t-tree__item .department-tree-node-refresh) {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
