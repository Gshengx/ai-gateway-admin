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
          @change="departmentChanged"
        />
        <t-input v-model="keyword" :placeholder="t('ma.subjectSearch')" clearable />
        <t-loading :loading="loading" :inert="loading">
          <t-tree
            v-if="type === 'DEPARTMENT'"
            :value="checkedIds"
            :data="departmentOptions"
            :icon="branches.icon"
            :default-expanded="searchExpanded"
            checkable
            check-strictly
            value-mode="all"
            @change="treeChanged"
            @expand="branches.onExpand"
          />
          <div v-else class="subject-picker__options">
            <t-checkbox
              v-for="option in options"
              :key="option.value"
              :checked="checkedIds.includes(option.value)"
              :disabled="loading || locked.has(option.value)"
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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TreeProps, SelectInputProps } from 'tdesign-vue-next'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import { modelAccessApi } from '@/api/modules/modelAccessApi'
import type { Subject } from '@/api/modules/modelAccess'
import { useTreeBranches } from '@/utils/useTreeBranches'
import { useLatestRequest } from '@/utils/useLatestRequest'
const props = defineProps<{
  purpose?: 'balance'
  providerId?: string
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
  popupVisible = ref(false)
interface Node {
  value: string
  label: string
  children?: true | Node[]
}
const departments = ref<Node[]>([])
const locked = computed(() => new Set(props.lockedIds ?? []))
const checkedIds = computed(() => [...new Set([...selection.value, ...locked.value])])
const requests = useLatestRequest()
const branches = useTreeBranches(departments, async (id, signal) =>
  nodes((await getDepartmentListApi({ parent_id: id }, signal)).items),
)
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
  selection.value.map(
    (id) => names.value[id] ?? props.labels?.[id] ?? props.unresolvedLabel ?? t('ma.unavailable'),
  ),
)
const pageSize = 5
async function getDepartmentListApi(
  params: { parent_id?: string; search?: string } = {},
  signal?: AbortSignal,
) {
  const rows = []
  for (let page = 1; ; page++) {
    const result = await modelAccessApi.A12({
      signal,
      params: {
        subject_type: 'DEPARTMENT',
        parent_id: params.parent_id,
        q: params.search,
        page,
        page_size: 100,
      },
    })
    rows.push(...result.items)
    if (page * result.page_size >= result.total) break
  }
  return {
    items: rows.map((s) => ({
      id: s.subject_id,
      name: s.name,
      parent_id: s.parent_id,
      has_children: s.has_children ?? false,
    })),
  }
}

function remember(rows: { id: string; name: string }[]) {
  const map = Object.fromEntries(rows.map((r) => [r.id, r.name]))
  Object.assign(names.value, map)
  emit('names', map)
}
function nodes(
  items: {
    id: string
    name: string
    display_name?: string
    has_children: boolean
    parent_id: string | null
  }[],
): Node[] {
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
let queriedDepartment = ''
async function load() {
  const request = requests.begin()
  loading.value = true
  try {
    if (props.type === 'DEPARTMENT') {
      const result = await getDepartmentListApi(
        keyword.value ? { search: keyword.value } : {},
        request.signal,
      )
      if (request.isCurrent()) {
        departments.value = nodes(result.items)
      }
    } else {
      const params = {
        page: page.value,
        page_size: pageSize,
        search: keyword.value || undefined,
        ...(props.type === 'USER' ? { department_id: department.value || undefined } : {}),
      }
      const result =
        props.purpose === 'balance'
          ? await modelAccessApi.B06({
              signal: request.signal,
              params: {
                page: params.page,
                page_size: params.page_size,
                q: params.search,
                provider_id: props.providerId,
                department_id: department.value || undefined,
              },
            })
          : await modelAccessApi.A12({
              signal: request.signal,
              params: {
                page: params.page,
                page_size: params.page_size,
                q: params.search,
                department_id: 'department_id' in params ? params.department_id : undefined,
                subject_type: props.type,
              },
            })
      if (!request.isCurrent()) return
      const rows = [
        ...result.items,
        ...('selected_items' in result ? result.selected_items : []),
      ].map((x) => {
        if ('user_id' in x)
          return {
            id: x.user_id,
            name: `${x.display_name ?? t('ma.unavailable')} (${x.username ?? ''})`,
            email: x.email,
          }
        return {
          id: x.subject_id,
          name: x.username ? `${x.name}(${x.username})` : (x.department_path ?? x.name),
          email: null,
        }
      })
      remember(
        rows.map((r) => ({
          id: r.id,
          name: r.name + (props.purpose === 'balance' && r.email ? ' · ' + r.email : ''),
        })),
      )
      options.value = result.items.map((x) => {
        const id = 'user_id' in x ? x.user_id : x.subject_id
        return { value: id, label: names.value[id]! }
      })
      total.value = result.total
      emit('records', rows)
    }
  } catch {
    if (request.isCurrent()) {
      options.value = []
      departments.value = []
    }
  } finally {
    if (request.isCurrent()) loading.value = false
  }
}
function query() {
  if (!popupVisible.value) return
  branches.invalidate()
  page.value = 1
  void load()
}
function departmentChanged({ id }: { id: string }) {
  // The department selector emits its initial value when mounted, too.
  if (!popupVisible.value || id === queriedDepartment) return
  queriedDepartment = id
  query()
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
  if (context.trigger === 'setItem') return
  const id = String(context.node.value)
  toggle(id, keys.map(String).includes(id))
}
const changeTags: NonNullable<SelectInputProps['onTagChange']> = (_value, context) => {
  if (context.trigger === 'clear') selection.value = []
  else if (typeof context.index === 'number')
    selection.value = selection.value.filter((_id, index) => index !== context.index)
}
watch(keyword, () => {
  requests.invalidate()
  branches.invalidate()
  if (!popupVisible.value) return
  if (!keyword.value) query()
  else requests.schedule(query, 250)
})
watch(popupVisible, (visible) => {
  if (!visible) {
    requests.invalidate()
    branches.invalidate()
    return
  }
  department.value = ''
  queriedDepartment = ''
  // Clearing a previous search already triggers query through the keyword watcher.
  if (keyword.value) keyword.value = ''
  else query()
})
watch(locale, () => {
  if (popupVisible.value) query()
})
watch(locked, () => {
  selection.value = selection.value.filter((id) => !locked.value.has(id))
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
.subject-picker > :deep(.t-loading__parent) {
  scrollbar-gutter: auto;
  padding-bottom: var(--td-comp-paddingTB-s);
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
