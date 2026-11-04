<template>
  <div class="security-stack">
    <t-radio-group v-model="model.type" :disabled="disabled" :options="types" @change="reset" />
    <t-tree-select
      v-if="model.type === 'DEPARTMENTS'"
      v-model="model.values"
      multiple
      :disabled="disabled"
      :data="nodes"
      :tree-props="treeProps"
      :value-display="() => selectedDepartments"
      :placeholder="label('choose')"
      :popup-props="{ attach: 'body' }"
    />
    <AttributeConditions
      v-else-if="model.type === 'ATTRIBUTES'"
      v-model="model.attributes"
      :fields="['department', 'title', 'employee_type', 'security_level']"
    />
    <t-select
      v-else-if="model.type !== 'ALL'"
      v-model="model.values"
      multiple
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
const treeProps = computed<TreeProps>(() => ({
  lazy: true,
  load: async (node) => toNodes((await getSecurityOptions(String(node.value))).departments),
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
  try {
    nodes.value = toNodes((await getSecurityOptions()).departments)
  } catch (e) {
    error(e)
  }
}
onMounted(() => {
  if (props.user) void load()
})
watch(locale, () => {
  if (props.user) void load()
})
watch(
  () => [model.value.type, model.value.values.join(',')],
  async () => {
    if (model.value.type !== 'DEPARTMENTS' || !model.value.values.length) return
    try {
      resolvedDepartments.value = (
        await getSecurityOptions(undefined, model.value.values)
      ).departments
    } catch (e) {
      error(e)
    }
  },
  { immediate: true },
)
</script>
<style scoped>
@import '@/styles/security.css';
</style>
