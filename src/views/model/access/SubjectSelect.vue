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
      <div v-show="popupVisible" class="subject-picker" @click.stop>
        <DepartmentTreeSelect
          v-if="type === 'USER'"
          v-model="department"
          :resolve-descendants="false"
          :placeholder="t('ma.departmentFilter')"
          @change="departmentChanged"
        />
        <t-input v-model="keyword" :placeholder="t('ma.subjectSearch')" clearable />
        <t-loading
          ref="resultsRegion"
          :loading="loading"
          :inert="loading"
          :style="
            loading && pendingResultsHeight
              ? { '--subject-picker-loading-height': `${pendingResultsHeight}px` }
              : undefined
          "
        >
          <t-tree
            v-if="type === 'DEPARTMENT'"
            :value="checkedIds"
            :data="departmentOptions"
            :icon="branches.icon"
            :expanded="departmentExpanded"
            :transition="false"
            checkable
            check-strictly
            value-mode="all"
            @change="treeChanged"
            @expand="onDepartmentExpand"
          />
          <div v-else class="subject-picker__options searchable-option-list">
            <t-checkbox
              v-for="option in options"
              :key="option.value"
              :title="option.label"
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
import { useDepartmentCache } from '@/utils/useDepartmentCache'
import { revealDepartmentSelection } from '@/utils/revealDepartmentSelection'
const props = defineProps<{
  purpose?: 'balance'
  useCase?: 'MODEL_DETAIL'
  providerId?: string
  type: Subject
  labels?: Record<string, string>
  activeOnly?: boolean
  lockedIds?: string[]
  unresolvedLabel?: string
  reuseDepartmentDirectory?: boolean
}>()
const selection = defineModel<string[]>({ required: true })
const emit = defineEmits<{
  names: [names: Record<string, string>]
  records: [records: { id: string; name: string; email: string | null }[]]
}>()
const { t, locale } = useI18n()
const resultsRegion = ref<{ $el: HTMLElement }>()
const pendingResultsHeight = ref(0)
const departmentCache = useDepartmentCache(() => {
  requests.invalidate()
  branches.invalidate()
  departments.value = []
  departmentParents.clear()
  names.value = {}
  departmentExpanded.value = []
  options.value = []
  if (popupVisible.value && props.type === 'DEPARTMENT') void load()
})
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
  checkable?: boolean
  children?: true | Node[]
}
const departments = ref<Node[]>([])
const departmentParents = new Map<string, string | null>()
const departmentExpanded = ref<Array<string | number>>([])
const locked = computed(() => new Set(props.lockedIds ?? []))
const checkedIds = computed(() => [...new Set([...selection.value, ...locked.value])])
const requests = useLatestRequest()
const branches = useTreeBranches(departments, async (id, signal) =>
  nodes((await getDepartmentListApi({ parent_id: id }, signal)).items),
)
const onDepartmentExpand: NonNullable<TreeProps['onExpand']> = (values, context) => {
  departmentExpanded.value = values
  branches.onExpand(values, context)
}
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
const pageSize = computed(() =>
  props.type === 'USER_GROUP' && props.useCase === 'MODEL_DETAIL' ? 20 : 5,
)
async function getDepartmentListApi(
  params: { parent_id?: string; search?: string } = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  if (params.search?.trim() || !props.reuseDepartmentDirectory) return requestDepartments(params)
  return departmentCache.load(JSON.stringify(params), () => requestDepartments(params))
}

async function requestDepartments(params: { parent_id?: string; search?: string }) {
  const rows = []
  for (let page = 1; ; page++) {
    const result = await modelAccessApi.A12({
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
  const items = new Map<
    string,
    {
      id: string
      name: string
      parent_id: string | null
      has_children: boolean
      checkable: boolean
    }
  >()
  for (const row of rows) {
    for (const [index, ancestor] of (row.ancestors ?? []).entries()) {
      if (!items.has(ancestor.department_id))
        items.set(ancestor.department_id, {
          id: ancestor.department_id,
          name: ancestor.name,
          parent_id: row.ancestors[index - 1]?.department_id ?? null,
          has_children: true,
          checkable: false,
        })
    }
  }
  for (const s of rows)
    items.set(s.subject_id, {
      id: s.subject_id,
      name: s.name,
      parent_id: s.parent_id,
      has_children: s.has_children ?? false,
      checkable: true,
    })
  return { items: [...items.values()] }
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
    checkable?: boolean
  }[],
): Node[] {
  items.forEach((item) => departmentParents.set(item.id, item.parent_id))
  remember(items.map((x) => ({ id: x.id, name: x.display_name || x.name })))
  const result = new Map(
    items.map((x) => [
      x.id,
      {
        value: x.id,
        label: x.display_name || x.name,
        checkable: x.checkable,
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
function startLoading() {
  if (!loading.value)
    pendingResultsHeight.value = resultsRegion.value?.$el.getBoundingClientRect().height ?? 0
  loading.value = true
}
async function load() {
  const request = requests.begin()
  startLoading()
  try {
    if (props.type === 'DEPARTMENT') {
      const result = await getDepartmentListApi(
        keyword.value ? { search: keyword.value } : {},
        request.signal,
      )
      if (request.isCurrent()) {
        departments.value = nodes(result.items)
        if (keyword.value) departmentExpanded.value = searchExpanded.value
        else {
          const ancestors = await revealDepartmentSelection(
            selection.value,
            (id) => departmentParents.get(id),
            branches.load,
            () => request.isCurrent() && !keyword.value,
          )
          if (request.isCurrent())
            departmentExpanded.value = [...new Set([...departmentExpanded.value, ...ancestors])]
        }
      }
    } else {
      const params = {
        page: page.value,
        page_size: pageSize.value,
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
                ...(props.type === 'USER_GROUP' && props.useCase === 'MODEL_DETAIL'
                  ? { use_case: props.useCase }
                  : {}),
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
  startLoading()
  if (!keyword.value) query()
  else requests.schedule(query, 250)
})
watch(popupVisible, (visible) => {
  if (!visible) {
    requests.invalidate()
    branches.invalidate()
    if (!props.reuseDepartmentDirectory || props.type !== 'DEPARTMENT') departmentCache.clear()
    departments.value = []
    options.value = []
    departmentExpanded.value = []
    keyword.value = ''
    loading.value = false
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
watch(() => [props.type, props.purpose, props.providerId, props.useCase], departmentCache.clear)
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
