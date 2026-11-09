<template>
  <t-select-input
    class="subject-select"
    :value="display"
    :popup-visible="popupVisible"
    @popup-visible-change="popupVisible = $event"
    multiple
    clearable
    :tag-props="{ closable: true }"
    :min-collapsed-num="0"
    :placeholder="
      t(
        type === 'DEPARTMENT'
          ? 'ma.selectDepartment'
          : type === 'USER_GROUP'
            ? 'ma.selectGroup'
            : 'ma.selectUser',
      )
    "
    :popup-props="{ placement: 'bottom-left', overlayInnerClassName: 'model-subject-popup' }"
    @tag-change="changeTags"
    @clear="selection = []"
  >
    <template #suffixIcon><t-icon name="chevron-down" /></template>
    <template #panel>
      <div v-if="popupVisible" class="subject-picker" @click.stop>
        <DepartmentTreeSelect
          v-if="type === 'USER'"
          v-model="department"
          :resolve-descendants="false"
          :placeholder="t('ma.departmentFilter')"
          @change="query"
        />
        <t-input v-model="keyword" :placeholder="t('ma.subjectSearch')" clearable />
        <t-loading :loading="loading">
          <t-tree
            v-if="type === 'DEPARTMENT'"
            :key="treeVersion"
            :value="checkedIds"
            :data="departmentOptions"
            :load="loadChildren"
            :default-expanded="searchExpanded"
            checkable
            check-strictly
            value-mode="all"
            @change="treeChanged"
          />
          <div v-else class="subject-picker__options">
            <t-checkbox
              v-for="option in options"
              :key="option.value"
              :checked="checkedIds.includes(option.value)"
              :disabled="locked.has(option.value)"
              @change="(checked: boolean) => toggle(option.value, checked)"
              >{{ option.label }}</t-checkbox
            >
            <p v-if="!options.length && !loading" class="subject-picker__empty">
              {{ t('ma.noHistory') }}
            </p>
          </div>
        </t-loading>
        <t-pagination
          v-if="type !== 'DEPARTMENT'"
          size="small"
          theme="simple"
          :current="page"
          :page-size="pageSize"
          :total="total"
          :show-page-size="false"
          :show-jumper="false"
          :total-content="false"
          @current-change="changePage"
        />
      </div>
    </template>
  </t-select-input>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TreeProps, SelectInputProps } from 'tdesign-vue-next'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import {
  getDepartmentListApi,
  getUserListApi,
  getUserGroupListApi,
  type DepartmentItem,
} from '@/api/modules/identity'
import type { Subject } from '@/api/modules/modelAccess'
const props = defineProps<{
  type: Subject
  labels?: Record<string, string>
  activeOnly?: boolean
  lockedIds?: string[]
  unresolvedLabel?: string
}>()
const selection = defineModel<string[]>({ required: true })
const emit = defineEmits<{
  names: [names: Record<string, string>]
  records: [records: { id: string; name: string; email: string | null }[]]
}>()
const { t, locale } = useI18n()
const names = ref<Record<string, string>>({}),
  options = ref<{ value: string; label: string }[]>([]),
  department = ref(''),
  keyword = ref(''),
  page = ref(1),
  total = ref(0),
  loading = ref(false),
  popupVisible = ref(false),
  treeVersion = ref(0)
interface Node {
  value: string
  label: string
  children?: true | Node[]
}
const departments = ref<Node[]>([])
const locked = computed(() => new Set(props.lockedIds ?? []))
const checkedIds = computed(() => [...new Set([...selection.value, ...locked.value])])
const departmentOptions = computed(() => {
  function decorate(items: Node[]): (Node & { disabled: boolean })[] {
    return items.map((item) => ({
      ...item,
      disabled: locked.value.has(item.value),
      children: Array.isArray(item.children) ? decorate(item.children) : item.children,
    }))
  }
  return decorate(departments.value)
})
const searchExpanded = computed(() => {
  const ids: string[] = []
  function visit(nodes: Node[]) {
    for (const node of nodes)
      if (Array.isArray(node.children)) {
        ids.push(node.value)
        visit(node.children)
      }
  }
  if (keyword.value) visit(departments.value)
  return ids
})
const display = computed(() =>
  selection.value.map((id) => names.value[id] ?? props.labels?.[id] ?? props.unresolvedLabel ?? id),
)
const pageSize = 5

function remember(rows: { id: string; name: string }[]) {
  const map = Object.fromEntries(rows.map((r) => [r.id, r.name]))
  Object.assign(names.value, map)
  emit('names', map)
}
function nodes(items: DepartmentItem[]): Node[] {
  remember(items.map((x) => ({ id: x.id, name: x.display_name || x.name })))
  const result = new Map(
    items.map((x) => [
      x.id,
      {
        value: x.id,
        label: x.display_name || x.name,
        children: x.has_children ? true : undefined,
      } as Node,
    ]),
  )
  const roots: Node[] = []
  for (const item of items) {
    const node = result.get(item.id)!
    const parent = item.parent_id ? result.get(item.parent_id) : undefined
    if (parent) {
      if (!Array.isArray(parent.children)) parent.children = []
      parent.children.push(node)
    } else roots.push(node)
  }
  return roots
}
const loadChildren: NonNullable<TreeProps['load']> = async (node) => {
  const children = nodes((await getDepartmentListApi({ parent_id: String(node.value) })).items)
  function attach(items: Node[]): boolean {
    for (const item of items) {
      if (item.value === String(node.value)) {
        item.children = children
        return true
      }
      if (Array.isArray(item.children) && attach(item.children)) return true
    }
    return false
  }
  attach(departments.value)
  return children.map((item) => ({ ...item, disabled: locked.value.has(item.value) }))
}
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const current = ++generation
  loading.value = true
  try {
    if (props.type === 'DEPARTMENT') {
      const result = await getDepartmentListApi(keyword.value ? { search: keyword.value } : {})
      if (current === generation) {
        departments.value = nodes(result.items)
        treeVersion.value++
      }
    } else {
      const params = {
        page: page.value,
        page_size: pageSize,
        search: keyword.value || undefined,
        ...(props.type === 'USER' ? { department_id: department.value || undefined } : {}),
      }
      const result =
        props.type === 'USER_GROUP'
          ? await getUserGroupListApi(params)
          : await getUserListApi({
              ...params,
              ...(props.activeOnly ? { status: 'ACTIVE' as const } : {}),
            })
      if (current !== generation) return
      const rows = result.items.map((x) => ({
        id: x.id,
        name:
          'username' in x
            ? x.display_name
              ? `${x.display_name} (${x.username})`
              : x.username
            : x.display_name || x.name,
        email: 'email' in x ? x.email : null,
      }))
      remember(rows)
      options.value = rows.map((r) => ({ value: r.id, label: r.name }))
      total.value = result.total
      emit('records', rows)
    }
  } catch {
    if (current === generation) {
      options.value = []
      departments.value = []
    }
  } finally {
    if (current === generation) loading.value = false
  }
}
function query() {
  page.value = 1
  void load()
}
function changePage(value: number) {
  page.value = value
  void load()
}
function toggle(id: string, checked: boolean) {
  if (locked.value.has(id)) return
  selection.value = checked
    ? [...new Set([...selection.value, id])]
    : selection.value.filter((x) => x !== id)
}
const treeChanged: NonNullable<TreeProps['onChange']> = (keys, context) => {
  const id = String(context.node.value)
  toggle(id, keys.map(String).includes(id))
}
const changeTags: NonNullable<SelectInputProps['onTagChange']> = (_value, context) => {
  if (context.trigger === 'clear') selection.value = []
  else if (typeof context.index === 'number')
    selection.value = selection.value.filter((_id, index) => index !== context.index)
}
watch(keyword, () => {
  clearTimeout(timer)
  generation++
  if (!keyword.value) query()
  else timer = setTimeout(query, 250)
})
watch(popupVisible, (visible) => {
  if (!visible) return
  keyword.value = ''
  department.value = ''
  query()
})
watch(locale, query)
watch(locked, () => {
  selection.value = selection.value.filter((id) => !locked.value.has(id))
})
onMounted(load)
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
</script>
<style scoped>
.subject-select {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.subject-picker {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
}
.subject-picker__options {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
.subject-picker__options :deep(.t-checkbox) {
  margin: 0;
}
.subject-picker__empty {
  color: var(--td-text-color-placeholder);
  margin: 0;
}
</style>
