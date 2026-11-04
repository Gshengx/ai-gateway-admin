<template>
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
    @change="change"
    @search="search"
    @popup-visible-change="open"
  />
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TreeProps, TreeSelectProps } from 'tdesign-vue-next'
import { getCostContext, type CostDepartment } from '@/api/modules/cost'
import { useCost } from './useCost'
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
let version = 0
const toNodes = (items: CostDepartment[]): Node[] =>
  items.map((d) => {
    departments.set(d.id, d)
    return {
      value: d.id,
      label: english.value ? d.name_en : d.name,
      children: d.has_children ? true : undefined,
    }
  })
const treeProps = computed<TreeProps>(() => ({
  lazy: true,
  load: async (node) => {
    try {
      return toNodes((await getCostContext(String(node.value))).departments)
    } catch (err) {
      error(err)
      return []
    }
  },
}))
async function open(visible: boolean) {
  if (!visible) return
  loading.value = true
  try {
    nodes.value = props.rootId
      ? toNodes([
          await (async () => {
            await ensureDepartments([props.rootId!])
            return departments.get(props.rootId!)!
          })(),
        ])
      : toNodes((await getCostContext()).departments)
  } catch (err) {
    error(err)
  } finally {
    loading.value = false
  }
}
async function search(keyword: string) {
  const current = ++version
  if (!keyword) {
    await open(true)
    return
  }
  loading.value = true
  try {
    const result = await getCostContext(undefined, keyword, props.rootId)
    if (current === version)
      nodes.value = toNodes(result.departments).map((n) => ({ ...n, children: undefined }))
  } catch (err) {
    error(err)
  } finally {
    if (current === version) loading.value = false
  }
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
  nodes.value = []
})
</script>
