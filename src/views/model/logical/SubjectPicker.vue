<template>
  <div class="picker">
    <t-tree-select
      v-if="type === 'DEPARTMENT'"
      :value="modelValue"
      :data="departments"
      :tree-props="{ load: loadChildren, checkStrictly: true }"
      :placeholder="t('logicalModels.subjectPlaceholder')"
      multiple
      clearable
      @change="changeDepartments"
    />
    <template v-else>
      <DepartmentTreeSelect
        v-if="type === 'USER'"
        v-model="department"
        :placeholder="t('logicalModels.departmentFilter')"
        @change="query"
      />
      <t-input
        v-model="search"
        :placeholder="t('logicalModels.subjectSearch')"
        clearable
        @enter="query"
        @clear="query"
      />
      <t-table
        size="small"
        :show-header="false"
        max-height="var(--logical-subject-list-height)"
        :selected-row-keys="modelValue"
        row-key="id"
        :data="items"
        :columns="columns"
        :loading="loading"
        :pagination="{
          ...pagination,
          theme: 'simple',
          size: 'small',
          showPageSize: false,
          showJumper: false,
          totalContent: false,
        }"
        :disable-data-page="true"
        @select-change="selectRows"
        @page-change="changePage"
      />
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PageInfo, PrimaryTableCol, TreeProps, TreeSelectProps } from 'tdesign-vue-next'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import { getDepartmentListApi, getUserGroupListApi, getUserListApi } from '@/api/modules/identity'
import type { SubjectType } from '@/api/modules/logicalModels'

const props = defineProps<{ type: SubjectType; modelValue: string[] }>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  names: [value: Record<string, string>]
}>()
const { t, locale } = useI18n()
interface Node {
  value: string
  label: string
  children?: true | Node[]
}
const departments = ref<Node[]>([])
const items = ref<{ id: string; name: string }[]>([])
const search = ref('')
const department = ref('')
const loading = ref(false)
const pagination = reactive({ current: 1, pageSize: 20, total: 0, pageSizeOptions: [20, 50, 100] })
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 40 },
  { colKey: 'name', title: t('logicalModels.subject') },
])
let version = 0
function nodes(items: Awaited<ReturnType<typeof getDepartmentListApi>>['items']): Node[] {
  emit('names', Object.fromEntries(items.map((x) => [x.id, x.display_name || x.name])))
  return items.map((x) => ({
    value: x.id,
    label: x.display_name || x.name,
    children: x.has_children ? true : undefined,
  }))
}
const loadChildren: NonNullable<TreeProps['load']> = async (node) => {
  return nodes((await getDepartmentListApi({ parent_id: String(node.value) })).items)
}
const changeDepartments: NonNullable<TreeSelectProps['onChange']> = (value) => {
  emit('update:modelValue', Array.isArray(value) ? value.map(String) : [])
}
function selectRows(keys: (string | number)[]) {
  const pageIds = items.value.map((x) => x.id)
  emit('update:modelValue', [
    ...new Set([...props.modelValue.filter((x) => !pageIds.includes(x)), ...keys.map(String)]),
  ])
}
async function load() {
  const current = ++version
  loading.value = true
  try {
    if (props.type === 'DEPARTMENT') {
      const result = await getDepartmentListApi()
      if (version === current) departments.value = nodes(result.items)
    } else {
      const params = {
        page: pagination.current,
        page_size: pagination.pageSize,
        search: search.value || undefined,
      }
      const result =
        props.type === 'GROUP'
          ? await getUserGroupListApi(params)
          : await getUserListApi({ ...params, department_id: department.value || undefined })
      if (version !== current) return
      items.value = result.items.map((x) => ({
        id: x.id,
        name:
          'username' in x
            ? x.display_name && x.display_name !== x.username
              ? `${x.display_name} (${x.username})`
              : x.username
            : x.display_name || x.name,
      }))
      pagination.total = result.total
      emit('names', Object.fromEntries(items.value.map((x) => [x.id, x.name])))
    }
  } catch {
    // 拦截器已提示，保留选择以便重试。
  } finally {
    if (version === current) loading.value = false
  }
}
function query() {
  pagination.current = 1
  void load()
}
function changePage(page: PageInfo) {
  pagination.current = page.current
  pagination.pageSize = page.pageSize
  void load()
}
watch(
  [() => props.type, locale],
  () => {
    search.value = ''
    department.value = ''
    items.value = []
    query()
  },
  { immediate: true },
)
</script>
<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  min-width: 0;
}
.picker :deep(.t-table__pagination) {
  padding: var(--td-comp-paddingTB-s) 0 0;
}
.picker :deep(.t-table td) {
  font-size: var(--td-font-size-body-medium);
}
</style>
