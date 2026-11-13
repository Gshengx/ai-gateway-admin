<template>
  <t-tree-select
    v-model="value"
    :data="nodes"
    multiple
    :tree-props="treeProps"
    :placeholder="t('cost.selectDepartmentLabel')"
    :popup-props="{ overlayClassName: 'cost-user-popup' }"
    @popup-visible-change="open"
  />
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TreeProps } from 'tdesign-vue-next'
import { getCostContext, getCostDepartment, type CostDepartment } from '@/api/modules/cost'
import { useCost } from '../useCost'
const props = defineProps<{ modelValue: string[]; unrestricted?: boolean; rootId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const { t, english, departments, error } = useCost()
interface Node {
  value: string
  label: string
  disabled: boolean
  children?: boolean | Node[]
}
const nodes = ref<Node[]>([])
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
const treeProps = computed<TreeProps>(() => ({
  lazy: true,
  checkStrictly: true,
  load: async (node) => {
    try {
      return convert((await getCostContext(String(node.value))).departments)
    } catch (e) {
      error(e)
      return []
    }
  },
}))
async function open(visible: boolean) {
  if (!visible) return
  try {
    nodes.value = convert(
      props.rootId ? [await getCostDepartment(props.rootId)] : (await getCostContext()).departments,
    )
  } catch (e) {
    error(e)
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
    if (!ids.length || nodes.value.length) return
    try {
      const selected = await Promise.all(
        ids.map((id) => departments.get(id) ?? getCostDepartment(id)),
      )
      nodes.value = convert(selected)
    } catch (e) {
      error(e)
    }
  },
  { immediate: true, deep: true },
)
</script>
