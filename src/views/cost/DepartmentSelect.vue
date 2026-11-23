<template>
  <div ref="root" class="cost-department-select department-select-controls">
    <t-tree-select
      :value="modelValue"
      :data="nodes"
      :tree-props="treeProps"
      :placeholder="placeholder || t('cost.allDepartments')"
      :value-display="() => (deptName(modelValue) === '—' ? '' : deptName(modelValue))"
      :title="deptName(modelValue) === '—' ? '' : deptName(modelValue)"
      :filterable="searchable"
      :clearable="clearable"
      :input-value="visible ? keyword : ''"
      :filter="() => true"
      :loading="loading"
      :popup-props="popupProps"
      @change="change"
      @clear="clearDepartment"
      @search="search"
      @input-change="search"
      @popup-visible-change="open"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TreeProps, TreeSelectProps } from 'tdesign-vue-next'
import {
  getCostContext as requestCostContext,
  getCostDepartment,
  type CostDepartment,
} from '@/api/modules/cost'
import { useDepartmentScope } from '@/utils/useDepartmentScope'
import { useCost } from './useCost'
import { useDepartmentPopup } from '@/utils/useDepartmentPopup'
import { useTreeBranches } from '@/utils/useTreeBranches'
import { useLatestRequest } from '@/utils/useLatestRequest'
const root = ref<HTMLElement>()
const { popupProps, setVisible } = useDepartmentPopup(root)
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    searchable?: boolean
    clearable?: boolean
    rootId?: string
  }>(),
  { searchable: true, clearable: true },
)
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [] }>()
const { t, deptName, ensureDepartments, departments, english, error } = useCost()
interface Node {
  value: string
  label: string
  children?: boolean | Node[]
}
const nodes = ref<Node[]>([]),
  loading = ref(false)
const expanded = ref<Array<string | number>>([])
const requests = useLatestRequest()
useDepartmentScope(() => {
  requests.invalidate()
  branches.invalidate()
  nodes.value = []
  keyword.value = ''
  expanded.value = []
  if (visible.value) void loadOptions()
})
const getCostContext = requestCostContext
const visible = ref(false)
const keyword = ref('')
const toNodes = (items: CostDepartment[]): Node[] =>
  items.map((d) => {
    departments.set(d.id, d)
    return {
      value: d.id,
      label: english.value ? d.name_en : d.name,
      children: d.has_children ? true : undefined,
    }
  })
const branches = useTreeBranches(nodes, async (id, signal) => {
  const result = await getCostContext(id)
  return signal.aborted ? [] : toNodes(result.departments)
})
const treeProps = computed<TreeProps>(() => ({
  lazy: true,
  expanded: expanded.value,
  onExpand: (values, context) => {
    expanded.value = values
    branches.onExpand(values, context)
  },
  icon: branches.icon,
}))
async function loadOptions() {
  requests.invalidate()
  const current = requests.begin()
  branches.invalidate()
  loading.value = true
  try {
    let items: CostDepartment[]
    if (keyword.value) {
      items = (await getCostContext(undefined, keyword.value, props.rootId)).departments
    } else if (props.rootId) {
      items = [await getCostDepartment(props.rootId)]
    } else items = (await getCostContext()).departments
    if (current.isCurrent()) {
      nodes.value = toNodes(items)
    }
  } catch (err) {
    if (current.isCurrent()) error(err)
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
async function open(value: boolean) {
  visible.value = value
  setVisible(value)
  keyword.value = ''
  requests.invalidate()
  branches.invalidate()
  if (!value) {
    nodes.value = []
    expanded.value = []
    loading.value = false
    return
  }
  const selected = props.modelValue
  if (props.searchable && selected) {
    try {
      await ensureDepartments([selected])
      if (!visible.value || selected !== props.modelValue || keyword.value) return
      keyword.value = deptName(selected) === '—' ? '' : deptName(selected)
    } catch (err) {
      error(err)
      return
    }
  }
  await loadOptions()
}
function clearDepartment() {
  keyword.value = ''
  requests.invalidate()
  branches.invalidate()
  if (visible.value) void loadOptions()
}
function search(value: string) {
  if (keyword.value === value.trim()) return
  keyword.value = value.trim()
  void loadOptions()
}
const change: NonNullable<TreeSelectProps['onChange']> = (value) => {
  emit('update:modelValue', value ? String(value) : '')
  emit('change')
}
watch(
  () => props.modelValue,
  (id) => {
    if (id) void ensureDepartments([id]).catch(error)
  },
  { immediate: true },
)
watch(english, () => {
  if (visible.value) void loadOptions()
  else nodes.value = []
})
watch(
  () => props.rootId,
  () => {
    nodes.value = []
    if (visible.value) void loadOptions()
  },
)
</script>
<style scoped>
.cost-department-select {
  min-width: 0;
  max-width: 100%;
}
</style>
