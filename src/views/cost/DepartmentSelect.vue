<template>
  <div ref="root" class="cost-department-select">
    <t-tree-select
      :value="modelValue"
      :data="nodes"
      :tree-props="treeProps"
      :placeholder="placeholder || t('cost.allDepartments')"
      :value-display="() => (deptName(modelValue) === '—' ? '' : deptName(modelValue))"
      :filterable="searchable"
      :clearable="clearable"
      :filter="() => true"
      :loading="loading"
      :popup-props="popupProps"
      @change="change"
      @search="search"
      @popup-visible-change="open"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TreeProps, TreeSelectProps } from 'tdesign-vue-next'
import { getCostContext, type CostDepartment } from '@/api/modules/cost'
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
const requests = useLatestRequest()
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
  onExpand: branches.onExpand,
  icon: branches.icon,
}))
async function loadOptions() {
  const current = requests.begin()
  branches.invalidate()
  loading.value = true
  try {
    let items: CostDepartment[]
    if (keyword.value) {
      items = (await getCostContext(undefined, keyword.value, props.rootId)).departments
    } else if (props.rootId) {
      await ensureDepartments([props.rootId])
      items = [departments.get(props.rootId)!]
    } else items = (await getCostContext()).departments
    if (current.isCurrent())
      nodes.value = toNodes(items).map((node) =>
        keyword.value ? { ...node, children: undefined } : node,
      )
  } catch (err) {
    if (current.isCurrent()) error(err)
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
function open(value: boolean) {
  visible.value = value
  setVisible(value)
  keyword.value = ''
  requests.invalidate()
  branches.invalidate()
  if (value) void loadOptions()
  else loading.value = false
}
function search(value: string) {
  keyword.value = value
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
</script>
<style scoped>
.cost-department-select {
  min-width: 0;
  max-width: 100%;
}
</style>
