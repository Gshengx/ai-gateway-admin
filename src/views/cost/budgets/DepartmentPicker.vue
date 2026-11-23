<template>
  <t-tree-select
    clearable
    ref="selector"
    v-model="value"
    :data="nodes"
    multiple
    :tree-props="treeProps"
    :placeholder="t('cost.selectDepartmentLabel')"
    :popup-props="popupProps"
    @popup-visible-change="open"
  />
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TreeProps } from 'tdesign-vue-next'
import {
  getCostContext as requestCostContext,
  getCostDepartment as requestCostDepartment,
  type CostDepartment,
} from '@/api/modules/cost'
import { useDepartmentScope } from '@/utils/useDepartmentScope'
import { useCost } from '../useCost'
import { useTreeBranches } from '@/utils/useTreeBranches'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { useDepartmentPopup } from '@/utils/useDepartmentPopup'
const selector = ref<{ $el: HTMLElement }>()
const root = computed(() => selector.value?.$el)
const { popupProps, setVisible } = useDepartmentPopup(root)
const props = defineProps<{ modelValue: string[]; unrestricted?: boolean; rootId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const { t, english, departments, ensureDepartments, error } = useCost()
interface Node {
  value: string
  label: string
  disabled: boolean
  children?: boolean | Node[]
}
const nodes = ref<Node[]>([])
const visible = ref(false)
const selectedRequests = useLatestRequest()
const expanded = ref<Array<string | number>>([])
useDepartmentScope(resetDirectory)
const getCostContext = requestCostContext
const getCostDepartment = requestCostDepartment
const value = computed({
  get: () => props.modelValue,
  set: (value: unknown) => emit('update:modelValue', Array.isArray(value) ? value.map(String) : []),
})
function convert(items: CostDepartment[]): Node[] {
  const parent = departments.get(props.modelValue[0] ?? '')?.parent_id
  return items.map((d) => {
    departments.set(d.id, d)
    return {
      value: d.id,
      label: english.value ? d.name_en : d.name,
      disabled: Boolean(!props.unrestricted && props.modelValue.length && d.parent_id !== parent),
      children: d.has_children ? true : undefined,
    }
  })
}
const requests = useLatestRequest()
const branches = useTreeBranches(nodes, async (id, signal) => {
  const result = await getCostContext(id)
  return signal.aborted ? [] : convert(result.departments)
})
const treeProps = computed<TreeProps>(() => ({
  lazy: true,
  checkStrictly: true,
  expanded: expanded.value,
  onExpand: (values, context) => {
    expanded.value = values
    branches.onExpand(values, context)
  },
  icon: branches.icon,
}))
async function open(isVisible: boolean) {
  selectedRequests.invalidate()
  visible.value = isVisible
  setVisible(isVisible)
  requests.invalidate()
  branches.invalidate()
  if (!isVisible) {
    nodes.value = []
    expanded.value = []
    return
  }
  const current = requests.begin()
  try {
    const items = props.rootId
      ? [await getCostDepartment(props.rootId)]
      : (await getCostContext()).departments
    if (current.isCurrent()) {
      nodes.value = convert(items)
    }
  } catch (e) {
    if (current.isCurrent()) error(e)
  }
}
watch(
  () => props.modelValue,
  () => {
    const parent = departments.get(props.modelValue[0] ?? '')?.parent_id
    const visit = (items: Node[]) =>
      items.forEach((n) => {
        n.disabled = Boolean(
          !props.unrestricted &&
          props.modelValue.length &&
          departments.get(n.value)?.parent_id !== parent,
        )
        if (Array.isArray(n.children)) visit(n.children)
      })
    visit(nodes.value)
  },
  { deep: true },
)
watch(
  () => props.modelValue,
  async (ids) => {
    const current = selectedRequests.begin()
    if (!ids.length || nodes.value.length) return
    try {
      await ensureDepartments(ids)
      if (!current.isCurrent()) return
      const selected = ids.map((id) => departments.get(id)!)
      nodes.value = convert(selected)
    } catch (e) {
      if (current.isCurrent()) error(e)
    }
  },
  { immediate: true, deep: true },
)
function resetDirectory() {
  selectedRequests.invalidate()
  requests.invalidate()
  branches.invalidate()
  nodes.value = []
  expanded.value = []
  if (visible.value) void open(true)
}
watch(() => [english.value, props.rootId], resetDirectory)
</script>
