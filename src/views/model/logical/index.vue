<template>
  <section class="panel">
    <FilterBar>
      <template #content>
        <div class="toolbar">
          <t-space>
            <t-button v-permission.write="'model.logical'" @click="openCreate">{{
              t('logicalModels.create')
            }}</t-button>
            <t-button
              v-permission.write="'model.permissions'"
              theme="default"
              :disabled="!selected.length"
              @click="openGrant"
              >{{ t('logicalModels.batchGrant') }}（{{ selected.length }}）</t-button
            >
          </t-space>
          <t-input
            v-model="search"
            :placeholder="t('logicalModels.searchPlaceholder')"
            clearable
            @enter="query"
            @clear="query"
            @change="queueSearch"
          />
        </div>
      </template>
    </FilterBar>
    <t-table
      v-model:selected-row-keys="selected"
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :disable-data-page="true"
      @page-change="changePage"
    >
      <template #name="{ row }"
        ><t-link theme="primary" @click="router.push(`/model/logical/${row.id}`)">{{
          row.logical_name
        }}</t-link></template
      >
      <template #grants="{ row }"
        ><t-space
          ><t-tag v-for="type in types" :key="type"
            >{{ t(`logicalModels.${type.toLowerCase()}`) }}
            {{ grantCounts[row.id]?.[type] ?? '—' }}</t-tag
          ></t-space
        ></template
      >
      <template #mounts="{ row }"
        >{{ activeCounts[row.id] ?? '—' }} / {{ row.mounts.length }}
        {{ t('logicalModels.available') }}</template
      >
      <template #status="{ row }"
        ><t-tag :theme="activeCounts[row.id] ? 'success' : 'default'">{{
          t(activeCounts[row.id] ? 'logicalModels.statusActive' : 'logicalModels.unavailable')
        }}</t-tag></template
      >
      <template #created="{ row }">{{
        row.created_at ? formatDateTime(row.created_at) : '—'
      }}</template>
      <template #action="{ row }"
        ><t-space>
          <t-link theme="primary" @click="router.push(`/model/logical/${row.id}`)">{{
            t('logicalModels.detail')
          }}</t-link>
          <t-link v-permission.write="'model.logical'" theme="primary" @click="openEdit(row)">{{
            t('logicalModels.edit')
          }}</t-link>
          <t-link v-permission.write="'model.logical'" theme="danger" @click="openDelete(row)">{{
            t('logicalModels.delete')
          }}</t-link>
        </t-space></template
      >
    </t-table>
    <LogicalModelForm v-model:visible="formVisible" :model="editing" @saved="load" />
    <t-dialog
      v-model:visible="deleteVisible"
      :header="t('logicalModels.deleteTitle')"
      :confirm-btn="{
        content: t('logicalModels.delete'),
        theme: 'danger',
        loading: saving,
        disabled: !reason.trim(),
      }"
      :cancel-btn="t('logicalModels.cancel')"
      @confirm="remove"
    >
      <p>{{ t('logicalModels.deleteConfirm', { name: current?.logical_name }) }}</p>
      <t-textarea
        v-model="reason"
        :maxlength="512"
        :placeholder="t('logicalModels.reasonPlaceholder')"
      />
    </t-dialog>
    <t-dialog
      v-model:visible="grantVisible"
      :header="t('logicalModels.grantTitle')"
      :confirm-btn="{
        content: t('logicalModels.confirmGrant'),
        loading: saving,
        disabled: !subjectIds.length,
      }"
      :cancel-btn="t('logicalModels.cancel')"
      @confirm="grant"
    >
      <div class="grant-form">
        <p>{{ t('logicalModels.grantHint', { n: selected.length }) }}</p>
        <t-select v-model="subjectType" :options="subjectTypes" @change="subjectIds = []" />
        <SubjectPicker v-if="grantVisible" v-model="subjectIds" :type="subjectType" />
      </div>
    </t-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { PageInfo, PrimaryTableCol } from 'tdesign-vue-next'
import {
  getLogicalModelsApi,
  deleteLogicalModelApi,
  getLogicalModelPermissionsApi,
  batchGrantLogicalModelsApi,
  type LogicalModel,
  type SubjectType,
} from '@/api/modules/logicalModels'
import { getModelsApi } from '@/api/modules/models'
import { canReadResource, useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
import FilterBar from '@/components/FilterBar.vue'
import LogicalModelForm from './LogicalModelForm.vue'
import SubjectPicker from './SubjectPicker.vue'
import '@/styles/logical-models.css'
const { t } = useI18n()
const router = useRouter()
const user = useUserStore()
const items = ref<LogicalModel[]>([])
const selected = ref<(string | number)[]>([])
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const formVisible = ref(false)
const editing = ref<LogicalModel | null>(null)
const current = ref<LogicalModel | null>(null)
const deleteVisible = ref(false)
const reason = ref('')
const grantVisible = ref(false)
const types: SubjectType[] = ['DEPARTMENT', 'GROUP', 'USER']
const subjectType = ref<SubjectType>('DEPARTMENT')
const subjectIds = ref<string[]>([])
const subjectTypes = computed(() =>
  types.map((value) => ({ value, label: t(`logicalModels.${value.toLowerCase()}`) })),
)
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [20, 50, 100],
})
const grantCounts = ref<Record<string, Record<SubjectType, number>>>({})
const activeCounts = ref<Record<string, number>>({})
const columns = computed<PrimaryTableCol<LogicalModel>[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  { colKey: 'name', title: t('logicalModels.colName'), minWidth: 160 },
  { colKey: 'description', title: t('logicalModels.colDescription'), minWidth: 180 },
  { colKey: 'grants', title: t('logicalModels.colGrants'), minWidth: 220 },
  { colKey: 'mounts', title: t('logicalModels.colMounts'), width: 140 },
  { colKey: 'status', title: t('logicalModels.colStatus'), width: 110 },
  { colKey: 'created', title: t('logicalModels.colCreated'), minWidth: 180 },
  { colKey: 'action', title: t('logicalModels.colAction'), width: 160 },
])
let version = 0
async function load() {
  const currentVersion = ++version
  loading.value = true
  try {
    const result = await getLogicalModelsApi({
      page: pagination.current,
      page_size: pagination.pageSize,
      search: search.value || undefined,
    })
    if (currentVersion !== version) return
    if (!result.items.length && pagination.current > 1) {
      pagination.current--
      return void load()
    }
    items.value = result.items
    pagination.total = result.total
    selected.value = selected.value.filter((id) => items.value.some((x) => x.id === id))
    grantCounts.value = {}
    activeCounts.value = {}
    await Promise.all(
      result.items.map(async (row) => {
        const physical = await getModelsApi({
          page: 1,
          page_size: 100,
          logical_model_id: row.id,
          status: 'ACTIVE',
        })
        if (currentVersion === version) activeCounts.value[row.id] = physical.total
        if (!canReadResource(user.permissions, 'model.permissions')) return
        const counts: Record<SubjectType, number> = { DEPARTMENT: 0, GROUP: 0, USER: 0 }
        let page = 1,
          total = 1
        while (page <= total) {
          const grants = await getLogicalModelPermissionsApi(row.id, { page, page_size: 100 })
          grants.items.forEach((g) => counts[g.subject_type]++)
          total = grants.total_pages
          page++
        }
        if (currentVersion === version) grantCounts.value[row.id] = counts
      }),
    )
  } catch {
    /* 拦截器统一提示。 */
  } finally {
    if (currentVersion === version) loading.value = false
  }
}
function query() {
  clearTimeout(timer)
  pagination.current = 1
  void load()
}
let timer: ReturnType<typeof setTimeout> | undefined
function queueSearch() {
  clearTimeout(timer)
  timer = setTimeout(query, 300)
}
function changePage(page: PageInfo) {
  pagination.current = page.current
  pagination.pageSize = page.pageSize
  void load()
}
function openCreate() {
  editing.value = null
  formVisible.value = true
}
function openEdit(row: LogicalModel) {
  editing.value = row
  formVisible.value = true
}
function openDelete(row: LogicalModel) {
  current.value = row
  reason.value = ''
  deleteVisible.value = true
}
async function remove() {
  if (!current.value || !reason.value.trim() || saving.value) return
  saving.value = true
  try {
    await deleteLogicalModelApi(current.value.id, { reason: reason.value.trim() })
    deleteVisible.value = false
    await load()
  } catch {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}
function openGrant() {
  subjectType.value = 'DEPARTMENT'
  subjectIds.value = []
  grantVisible.value = true
}
async function grant() {
  if (!subjectIds.value.length || saving.value) return
  saving.value = true
  try {
    await batchGrantLogicalModelsApi({
      logical_model_ids: selected.value.map(String),
      subjects: subjectIds.value.map((subject_id) => ({
        subject_id,
        subject_type: subjectType.value,
      })),
      reason: 'admin-console',
    })
    grantVisible.value = false
    selected.value = []
    await load()
  } catch {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => {
  clearTimeout(timer)
  version++
})
</script>
<style scoped>
.panel {
  background: var(--td-bg-color-container);
  padding: var(--td-comp-paddingLR-l);
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--td-comp-margin-l);
}
.toolbar :deep(.t-input__wrap) {
  max-width: var(--logical-search-width);
}
.grant-form {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.panel :deep(.filter-bar) {
  margin-bottom: var(--td-comp-margin-l);
}
p {
  margin: 0 0 var(--td-comp-margin-l);
  color: var(--td-text-color-secondary);
}
</style>
