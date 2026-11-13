<template>
  <div class="projects-page">
    <div class="project-heading">
      <div>
        <h1>{{ t('projects.title') }}</h1>
        <p>{{ t('projects.intro') }}</p>
      </div>
      <t-button v-permission.write="'identity.projects'" @click="edit(null)">{{
        t('projects.create')
      }}</t-button>
    </div>
    <t-card :bordered="false">
      <FilterBar class="project-filters"
        ><template #content>
          <div class="project-toolbar list-toolbar">
            <t-input
              class="list-search"
              v-model="query.search"
              clearable
              :placeholder="t('projects.search')"
              @change="first"
            />
            <t-select
              class="list-filter"
              v-model="query.status"
              :options="statuses"
              @change="first"
            />
            <DepartmentTreeSelect
              class="list-department"
              v-model="query.department_id"
              :placeholder="t('projects.departmentFilter')"
              @change="first"
            />
            <t-checkbox v-model="query.mine" @change="first">{{
              t('projects.onlyMine')
            }}</t-checkbox>
            <t-button theme="default" variant="base" @click="reset">{{
              t('common.reset')
            }}</t-button>
          </div>
        </template></FilterBar
      >
      <t-table
        row-key="id"
        :data="items"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        @page-change="changePage"
      >
        <template #status="{ row }"
          ><t-tag :theme="row.status === 'ACTIVE' ? 'success' : 'default'" variant="light">{{
            t(`projects.${row.status}`)
          }}</t-tag></template
        >
        <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
        <template #actions="{ row }"
          ><t-space v-permission.write="'identity.projects'">
            <t-link key="edit" v-if="row.status === 'ACTIVE'" theme="primary" @click="edit(row)">{{
              t('projects.editAction')
            }}</t-link>
            <t-link
              key="status"
              theme="primary"
              @click="confirm(row, row.status === 'ACTIVE' ? 'disable' : 'enable')"
              >{{ t(row.status === 'ACTIVE' ? 'projects.disable' : 'projects.enable') }}</t-link
            >
            <t-link
              key="archive"
              v-if="row.status !== 'ARCHIVED'"
              theme="primary"
              @click="confirm(row, 'archive')"
              >{{ t('projects.archive') }}</t-link
            >
            <t-link
              key="delete"
              v-if="row.status !== 'ACTIVE'"
              theme="danger"
              @click="confirm(row, 'delete')"
              >{{ t('projects.delete') }}</t-link
            >
          </t-space></template
        >
      </t-table>
    </t-card>
    <ProjectForm
      v-if="formVisible"
      :visible="formVisible"
      :project="editing"
      @close="formVisible = false"
      @saved="first"
    />
    <t-dialog
      :visible="!!target"
      :header="t(`projects.${action}Title`)"
      placement="top"
      :confirm-btn="{
        content: t(`projects.confirm${action[0]!.toUpperCase()}${action.slice(1)}`),
        theme: action === 'delete' ? 'danger' : 'primary',
        loading: saving,
        disabled: action === 'delete' && deleteName !== target?.name,
      }"
      :cancel-btn="t('projects.cancel')"
      :close-on-overlay-click="false"
      @close="target = null"
      @confirm="mutate"
    >
      <div class="project-confirm">
        <p v-for="(paragraph, index) in confirmation" :key="index">{{ paragraph }}</p>
        <div v-if="action === 'delete'" class="delete-confirm">
          <t-input v-model="deleteName" :placeholder="t('projects.deletePlaceholder')" />
          <p>{{ t('projects.deleteHint', { name: target?.name }) }}</p>
        </div>
      </div>
    </t-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PrimaryTableCol, type PageInfo } from 'tdesign-vue-next'
import { getProjects, projectAction, type ProjectItem } from '@/api/modules/projects'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import { formatDateTime } from '@/utils/datetime'
import ProjectForm from './ProjectForm.vue'
import '@/styles/projects.css'
const { t, locale } = useI18n()
const items = ref<ProjectItem[]>([])
const query = reactive({
  search: '',
  status: '',
  department_id: '',
  mine: false,
})
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showJumper: true })
const loading = ref(false),
  formVisible = ref(false),
  saving = ref(false)
const editing = ref<ProjectItem | null>(null),
  target = ref<ProjectItem | null>(null)
const action = ref('disable')
const deleteName = ref('')
let version = 0
const statuses = computed(() => [
  { value: '', label: t('projects.allStatus') },
  ...['ACTIVE', 'DISABLED', 'ARCHIVED'].map((value) => ({ value, label: t(`projects.${value}`) })),
])
const columns = computed<PrimaryTableCol<ProjectItem>[]>(() => [
  { colKey: 'name', title: t('projects.name'), minWidth: 180, ellipsis: true },
  { colKey: 'department', title: t('projects.department'), minWidth: 220, ellipsis: true },
  { colKey: 'member_count', title: t('projects.memberCount'), width: 120 },
  { colKey: 'status', title: t('projects.status'), width: 110 },
  { colKey: 'created_at', title: t('projects.created'), width: 190 },
  { colKey: 'actions', title: t('projects.actions'), width: 200, fixed: 'right' },
])
const confirmation = computed(() => {
  const p = target.value
  if (!p) return []
  if (action.value === 'delete') return [t('projects.deleteBody', { name: p.name })]
  const text: string[] = []
  if (action.value !== 'enable' && p.key_count)
    text.push(
      t('projects.keyImpact', { count: p.key_count, action: t(`projects.${action.value}`) }),
    )
  if (action.value !== 'enable' && p.budget && p.budget.status !== 'DISABLED')
    text.push(t(`projects.${action.value}Budget`))
  text.push(t(`projects.${action.value}Body`))
  if (action.value === 'enable' && (!p.budget || p.budget.status === 'DISABLED'))
    text.push(t('projects.enableBudget'))
  return text
})
async function load() {
  const request = ++version
  loading.value = true
  try {
    const result = await getProjects({
      ...query,
      page: pagination.current,
      page_size: pagination.pageSize,
    })
    if (request === version) {
      items.value = result.items
      pagination.total = result.total
    }
  } catch {
    /* interceptor */
  } finally {
    if (request === version) loading.value = false
  }
}
function first() {
  pagination.current = 1
  void load()
}
function changePage(info: PageInfo) {
  pagination.current = info.current
  pagination.pageSize = info.pageSize
  void load()
}
function reset() {
  Object.assign(query, { search: '', status: '', department_id: '', mine: false })
  first()
}
function edit(project: ProjectItem | null) {
  editing.value = project
  formVisible.value = true
}
function confirm(project: ProjectItem, nextAction: string) {
  target.value = project
  action.value = nextAction
  deleteName.value = ''
}
async function mutate() {
  if (
    !target.value ||
    saving.value ||
    (action.value === 'delete' && deleteName.value !== target.value.name)
  )
    return
  saving.value = true
  try {
    await projectAction(target.value.id, action.value)
    target.value = null
    MessagePlugin.success(t('projects.success'))
    if (items.value.length === 1 && pagination.current > 1) pagination.current--
    await load()
  } catch {
    /* interceptor */
  } finally {
    saving.value = false
  }
}
onMounted(load)
watch(locale, load)
</script>
