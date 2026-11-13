<template>
  <div class="department-tree-select">
    <div ref="controls" class="department-tree-select__controls">
      <t-tree-select
        class="department-tree-select__input"
        :key="treeVersion"
        :value="modelValue"
        :data="departmentTree"
        :tree-props="departmentTreeProps"
        :filter="() => true"
        :value-display="() => selectedDepartmentName"
        :loading="departmentLoading"
        :loading-text="t('common.departmentTree.loading')"
        :empty="t('common.departmentTree.empty')"
        :placeholder="placeholder"
        :clearable="clearable"
        :disabled="disabled || resolving"
        :popup-props="departmentPopupProps"
        :filterable="searchable"
        :input-props="{ name: 'department-tree-filter', autocomplete: 'off' }"
        @change="onChange"
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, MessagePlugin, type TreeProps, type TreeSelectProps } from 'tdesign-vue-next'
import { RefreshIcon } from 'tdesign-icons-vue-next'
import { getDepartmentListApi, type DepartmentItem } from '@/api/modules/identity'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    clearable?: boolean
    disabled?: boolean
    resolveDescendants?: boolean
    searchable?: boolean
  }>(),
  { clearable: true, resolveDescendants: true, searchable: true },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [payload: { id: string; departmentIds: string[] }]
}>()
const { t, locale } = useI18n()
const controls = ref<HTMLElement>()
const popupVisible = ref(false)
interface PopupGeometry {
  width: number
  placement: 'bottom-left' | 'bottom-right'
  boundary?: HTMLElement
  margin: number
  signature: string
}
const popupGeometry = ref<PopupGeometry>()
let geometryFrame = 0
const popupClass = `department-tree-popup-${useId().replace(/:/g, '-')}`

function resetPopupGeometry() {
  if (popupGeometry.value) {
    // matchWidthFunc reads offsetWidth, so remove our previous explicit width first.
    document.querySelector<HTMLElement>(`.${popupClass}`)?.style.removeProperty('width')
    popupGeometry.value = undefined
  }
}
// An absent width lets SelectInput's useOverlayInnerStyle use matchWidthFunc.
// In particular, '0px' is truthy and would bypass that default entirely.
const departmentPopupProps = computed<NonNullable<TreeSelectProps['popupProps']>>(() => {
  const geometry = popupGeometry.value
  return {
    overlayInnerClassName: ['department-tree-popup', popupClass],
    ...(geometry && {
      overlayInnerStyle: { width: `${geometry.width}px` },
      placement: geometry.placement,
      popperOptions: {
        modifiers: [
          {
            name: 'preventOverflow',
            options: {
              boundary: geometry.boundary ?? 'clippingParents',
              rootBoundary: 'viewport',
              padding: geometry.margin,
              tether: false,
            },
          },
          // Keep the requested horizontal alignment if vertical flipping is needed.
          {
            name: 'flip',
            options: {
              boundary: geometry.boundary ?? 'clippingParents',
              padding: geometry.margin,
              fallbackPlacements: [geometry.placement === 'bottom-right' ? 'top-end' : 'top-start'],
            },
          },
        ],
      },
    }),
  }
})

function updatePopupGeometry() {
  if (!popupVisible.value) return
  const trigger = controls.value?.querySelector<HTMLElement>('.t-select-input')
  const reset = resetPopupGeometry
  if (!trigger?.isConnected || !trigger.getClientRects().length) return reset()
  const rect = trigger.getBoundingClientRect()
  const style = getComputedStyle(trigger)
  if (style.visibility !== 'visible') return reset()
  const maximum = Number.parseFloat(style.getPropertyValue('--department-tree-popup-max-width'))
  const measure = document.createElement('span')
  measure.style.width = 'var(--td-comp-margin-l)'
  measure.style.position = 'absolute'
  measure.style.visibility = 'hidden'
  trigger.appendChild(measure)
  const margin = Number.parseFloat(getComputedStyle(measure).width)
  measure.remove()
  const container = trigger.closest<HTMLElement>('.t-dialog__body, .t-drawer__body')
  let left = margin
  let right = document.documentElement.clientWidth - margin
  if (container) {
    const bounds = container.getBoundingClientRect()
    if (
      !container.getClientRects().length ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      getComputedStyle(container).visibility !== 'visible'
    ) {
      return reset()
    }
    // Use body boundaries, rather than subtracting its padding and another margin.
    left = Math.max(left, bounds.left)
    right = Math.min(right, bounds.right)
  }
  if (
    ![rect.left, rect.right, rect.width, rect.height, maximum, margin, left, right].every(
      Number.isFinite,
    ) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    // Dialog scale animation reports visual widths smaller than the laid out input.
    Math.abs(rect.width - trigger.offsetWidth) > 1 ||
    maximum <= 0 ||
    margin < 0 ||
    right - left < rect.width ||
    rect.left < left ||
    rect.right > right
  ) {
    return reset()
  }
  const target = Math.max(rect.width, Math.min(maximum, right - left))
  const alignRight = Boolean(container) && rect.left + target > right
  const placement = alignRight ? 'bottom-right' : 'bottom-left'
  const available = alignRight ? rect.right - left : right - rect.left
  const width = Math.max(rect.width, Math.min(target, available))
  const signature = [rect.left, rect.right, rect.top, rect.bottom, left, right, width, margin].join(
    ',',
  )
  if (popupGeometry.value?.signature !== signature) {
    // Popup watches overlayInnerStyle and updates Popper; placement changes recreate it.
    popupGeometry.value = { width, placement, boundary: container ?? undefined, margin, signature }
  }
}

function trackPopupGeometry() {
  updatePopupGeometry()
  // ResizeObserver cannot detect drawer translation or dialog scale animation.
  // Recheck while open, but only publish geometry when coordinates actually change.
  if (popupVisible.value) geometryFrame = requestAnimationFrame(trackPopupGeometry)
}

interface DepartmentNode {
  value: string
  label: string
  children?: true | DepartmentNode[]
}

const lazyDepartments = ref<DepartmentNode[]>([])
const searchDepartments = ref<DepartmentNode[]>([])
const departmentKeyword = ref('')
const searchLoading = ref(false)
const rootLoading = ref(false)
const resolving = ref(false)
const failure = ref('')
let resolvedId: string | undefined
let retrySelection: string | undefined
const departmentLoading = computed(
  () => searchLoading.value || rootLoading.value || resolving.value,
)
const departmentItems = new Map<string, DepartmentItem>()
const treeVersion = ref(0)
const nodeVersions = new Map<string, number>()
const refreshingNodes = reactive(new Set<string>())
const inFlight = new Map<string, Promise<DepartmentItem[]>>()
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

function departmentNodes(items: DepartmentItem[]): DepartmentNode[] {
  return items.map((item) => {
    departmentItems.set(item.id, item)
    const label = item.display_name || item.name
    departmentNames.set(item.id, label)
    return { value: item.id, label, children: item.has_children ? true : undefined }
  })
}

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
    if (!keyword) return text
    const index = text.toLowerCase().indexOf(keyword.toLowerCase())
    if (index < 0) return text
    const end = index + keyword.length
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
  load: async (node) => {
    if (departmentKeyword.value) return []
    const parent = findNode(lazyDepartments.value, String(node.value))
    if (!parent) return []
    if (Array.isArray(parent.children)) return parent.children
    const session = departmentSession
    const id = String(node.value)
    const version = nodeVersions.get(id) ?? 0
    try {
      const items = await requestChildren(id)
      if (session !== departmentSession) return []
      if (version !== (nodeVersions.get(id) ?? 0)) {
        await inFlight.get(id)?.catch(() => undefined)
        const current = findNode(lazyDepartments.value, id)
        return Array.isArray(current?.children) ? current.children : []
      }
      if (session !== departmentSession || findNode(lazyDepartments.value, id) !== parent) return []
      const children = departmentNodes(items)
      parent.children = children
      return children
    } catch {
      if (session !== departmentSession) return []
      if (version !== (nodeVersions.get(id) ?? 0)) {
        await inFlight.get(id)?.catch(() => undefined)
        const current = findNode(lazyDepartments.value, id)
        return Array.isArray(current?.children) ? current.children : []
      }
      // Keep children=true and rebuild after TDesign finishes loading, allowing retries.
      setTimeout(() => {
        if (session === departmentSession) treeVersion.value++
      }, 0)
      return []
    }
  },
  expandAll: Boolean(departmentKeyword.value),
}))

function onDepartmentSearch(value: string) {
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
      const result = await getDepartmentListApi({ search: keyword })
      if (version !== searchVersion || session !== departmentSession) return
      const nodes = departmentNodes(result.items)
      const byId = new Map(nodes.map((node) => [node.value, node]))
      const roots: DepartmentNode[] = []
      nodes.forEach((node) => {
        node.children = undefined
      })
      result.items.forEach((item, index) => {
        const node = nodes[index]!
        const parent = item.parent_id ? byId.get(item.parent_id) : undefined
        if (parent) {
          if (!Array.isArray(parent.children)) parent.children = []
          parent.children.push(node)
        } else roots.push(node)
      })
      searchDepartments.value = roots
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

function requestChildren(id: string): Promise<DepartmentItem[]> {
  const pending = inFlight.get(id)
  if (pending) return pending
  const session = departmentSession
  const request = getDepartmentListApi({ parent_id: id })
    .then((result) => result.items)
    .finally(() => {
      if (session === departmentSession && inFlight.get(id) === request) inFlight.delete(id)
    })
  inFlight.set(id, request)
  return request
}

async function collectDescendants(
  id: string,
  items: Map<string, DepartmentItem>,
  request: (id: string) => Promise<DepartmentItem[]>,
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
    treeVersion.value++
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
  (id) => {
    if (id !== resolvedId) void resolveSelection(id)
  },
  { immediate: true },
)

async function loadRoots() {
  if (rootLoading.value || rootLoaded) return
  const session = departmentSession
  rootLoading.value = true
  try {
    const result = await getDepartmentListApi()
    if (session !== departmentSession) return
    lazyDepartments.value = departmentNodes(result.items)
    rootLoaded = true
  } catch {
    // Opening the dropdown retries failed root requests.
  } finally {
    if (session === departmentSession) rootLoading.value = false
  }
}

function onPopupVisibleChange(visible: boolean) {
  popupVisible.value = visible
  if (visible) {
    cancelAnimationFrame(geometryFrame)
    trackPopupGeometry()
    void loadRoots()
  } else {
    cancelAnimationFrame(geometryFrame)
    resetPopupGeometry()
    onDepartmentSearch('')
  }
}

function clearState() {
  failure.value = ''
  retrySelection = undefined
  departmentSession++
  searchVersion++
  selectionVersion++
  clearTimeout(searchTimer)
  inFlight.clear()
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
}

function reset() {
  clearState()
  treeVersion.value++
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
  inFlight.delete(id)
  const isCurrent = () => session === departmentSession && nodeVersions.get(id) === version
  try {
    const items = await requestChildren(id)
    if (!isCurrent() || findNode(lazyDepartments.value, id) !== parent) return
    const previous = new Map(
      (Array.isArray(parent.children) ? parent.children : []).map((child) => [child.value, child]),
    )
    // Resolve the selected descendant's direct branch before updating cached parent links.
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
    const cachedParent = departmentItems.get(id)
    if (cachedParent) departmentItems.set(id, { ...cachedParent, has_children: items.length > 0 })
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
  treeVersion.value++
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
      // Supports externally supplied values whose ancestor path is not cached yet.
      const result = await getDepartmentListApi({ search: selected?.name || id })
      if (session !== departmentSession) return
      departmentNodes(result.items)
    }
  } catch {
    // Request errors are reported by the request interceptor.
  }
})

onMounted(() => {
  void loadRoots()
  window.addEventListener('resize', updatePopupGeometry)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(geometryFrame)
  window.removeEventListener('resize', updatePopupGeometry)
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
