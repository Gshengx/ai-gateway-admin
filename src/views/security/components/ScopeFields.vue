<template>
  <div class="security-stack">
    <t-radio-group v-model="model.type" :disabled="disabled" :options="types" @change="reset" />
    <t-tree-select
      clearable
      v-if="model.type === 'DEPARTMENTS'"
      v-model="model.values"
      multiple
      :disabled="disabled"
      :data="nodes"
      :tree-props="treeProps"
      :value-display="() => selectedDepartments"
      :placeholder="label('choose')"
      :popup-props="{ attach: 'body' }"
      @popup-visible-change="openDepartments"
    />
    <AttributeConditions
      v-else-if="model.type === 'ATTRIBUTES'"
      v-model="model.attributes"
      :fields="['department', 'title', 'employee_type', 'security_level']"
    />
    <t-select
      clearable
      v-else-if="model.type !== 'ALL'"
      v-model="model.values"
      multiple
      :disabled="disabled"
      filterable
      :options="selectOptions"
      :placeholder="label('choose')"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { TreeProps } from 'tdesign-vue-next'
import {
  getSecurityOptions,
  type Scope,
  type SecurityOptions,
  type SecurityOption,
} from '@/api/modules/security'
import { useSecurity } from '../useSecurity'
import AttributeConditions from './AttributeConditions.vue'
import { useDepartmentScope } from '@/utils/useDepartmentScope'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { useTreeBranches } from '@/utils/useTreeBranches'
const props = defineProps<{ user?: boolean; options?: SecurityOptions; disabled?: boolean }>()
const model = defineModel<Scope>({ required: true })
const { label, choices, optionChoices, optionLabel, locale, error } = useSecurity()
interface Node {
  value: string
  label: string
  children?: true | Node[]
}
const nodes = ref<Node[]>([])
const resolvedDepartments = ref<SecurityOption[]>([])
const departmentVisible = ref(false)
const requests = useLatestRequest()
const selectedRequests = useLatestRequest()
const expanded = ref<Array<string | number>>([])
useDepartmentScope(resetDepartments)
const selectedDepartments = computed(() =>
  model.value.values
    .map((id) => {
      const department = resolvedDepartments.value.find((d) => d.id === id)
      return department ? optionLabel(department) : id
    })
    .join(', '),
)
const toNodes = (items: SecurityOption[]): Node[] =>
  items.map((d) => ({
    value: d.id,
    label: optionLabel(d),
    children: d.has_children ? true : undefined,
  }))
const branches = useTreeBranches(nodes, async (id, signal) => {
  const result = await getSecurityOptions(id)
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
const types = computed(() => [
  { value: 'ALL', label: label(props.user ? 'ALL_USERS' : 'ALL_MODELS') },
  ...choices(
    props.user
      ? ['DEPARTMENTS', 'GROUPS', 'USERS', 'ATTRIBUTES']
      : ['LOGICAL', 'PHYSICAL', 'LEVEL'],
  ),
])
const selectOptions = computed(() =>
  model.value.type === 'LEVEL'
    ? choices(['INTERNET', 'TRUSTED_CLOUD', 'PRIVATE'])
    : optionChoices(
        props.options?.[
          (
            {
              GROUPS: 'groups',
              USERS: 'users',
              LOGICAL: 'logical_models',
              PHYSICAL: 'physical_models',
            } as const
          )[model.value.type as 'GROUPS']
        ],
      ),
)
function reset() {
  model.value.values = []
  model.value.attributes = []
}
async function load() {
  const current = requests.begin()
  try {
    const result = await getSecurityOptions()
    if (current.isCurrent()) nodes.value = toNodes(result.departments)
  } catch (e) {
    if (current.isCurrent()) error(e)
  }
}
function openDepartments(visible: boolean) {
  departmentVisible.value = visible
  requests.invalidate()
  branches.invalidate()
  nodes.value = []
  expanded.value = []
  if (visible) void load()
}
async function resolveSelectedDepartments() {
  const current = selectedRequests.begin()
  resolvedDepartments.value = []
  if (model.value.type !== 'DEPARTMENTS' || !model.value.values.length) return
  try {
    const result = await getSecurityOptions(undefined, model.value.values)
    if (current.isCurrent()) resolvedDepartments.value = result.departments
  } catch (e) {
    if (current.isCurrent()) error(e)
  }
}
function resetDepartments() {
  openDepartments(departmentVisible.value)
  void resolveSelectedDepartments()
}
onMounted(() => {
  if (props.user) void load()
})
watch(locale, resetDepartments)
watch(() => [model.value.type, model.value.values.join(',')], resolveSelectedDepartments, {
  immediate: true,
})
</script>
<style scoped>
@import '@/styles/security.css';
</style>
