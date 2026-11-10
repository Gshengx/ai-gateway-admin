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
      <template #grants="{ row }">
        <AuthorizationSummary
          :summary="row.authorization_summary"
          :readable="canReadResource(user.permissions, 'model.permissions')"
          @select="(type) => openPermissions(row.id, type)"
        />
      </template>
      <template #mounts="{ row }"
        >{{ activeCounts[row.id] ?? '—' }} / {{ row.related_mounts?.total ?? row.mounts.length }}
        {{ t('logicalModels.available') }}</template
      >
      <template #status="{ row }"
        ><t-tag :theme="row.ready ? 'success' : 'default'">{{
          t(row.ready ? 'logicalModels.statusActive' : 'logicalModels.unavailable')
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
    <LogicalModelForm v-model:visible="formVisible" :model="editing" @saved="handleSaved" />
    <t-dialog
      v-model:visible="deleteVisible"
      :header="t('logicalModels.deleteTitle')"
      :confirm-btn="{
        content: t('logicalModels.delete'),
        theme: 'danger',
        loading: saving,
        disabled: !reason.trim() || impactBlocked,
      }"
      :cancel-btn="t('logicalModels.cancel')"
      @confirm="remove"
    >
      <ModelImpactNotice
        v-if="deleteVisible && current"
        resource="logical-models"
        :id="current.id"
        @blocked="impactBlocked = $event"
      />
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
import ModelImpactNotice from '../ModelImpactNotice.vue'
import AuthorizationSummary from '../AuthorizationSummary.vue'
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { MessagePlugin, type PageInfo, type PrimaryTableCol } from 'tdesign-vue-next'
import {
  getLogicalModelsApi,
  deleteLogicalModelApi,
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
const impactBlocked = ref(true)
const { t, locale } = useI18n()
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
const activeCounts = ref<Record<string, number>>({})
interface StatsCacheEntry<T> {
  signature: string
  expiresAt: number
  value?: T
  pending?: Promise<T>
}
const activeCache = new Map<string, StatsCacheEntry<number>>()
const statsController = new AbortController()
const statsCacheTtl = 30_000
const statsConcurrency = 3
let statsWorkers = 0
let statsQueue: { version: number; run: () => Promise<void> }[] = []

function cachedStats<T>(
  cache: Map<string, StatsCacheEntry<T>>,
  id: string,
  signature: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(id)
  if (cached?.signature === signature) {
    if (cached.pending) return cached.pending
    if (cached.expiresAt > Date.now() && cached.value !== undefined)
      return Promise.resolve(cached.value)
  }
  const entry: StatsCacheEntry<T> = { signature, expiresAt: 0 }
  entry.pending = fetcher()
    .then((value) => {
      entry.value = value
      entry.expiresAt = Date.now() + statsCacheTtl
      entry.pending = undefined
      return value
    })
    .catch((error: unknown) => {
      if (cache.get(id) === entry) cache.delete(id)
      throw error
    })
  cache.set(id, entry)
  return entry.pending
}
function drainStats() {
  while (statsWorkers < statsConcurrency && statsQueue.length) {
    const task = statsQueue.shift()!
    if (task.version !== version) continue
    statsWorkers++
    void task
      .run()
      .catch(() => {
        /* 请求层统一提示；单项统计失败保留占位符，不阻塞其他行。 */
      })
      .finally(() => {
        statsWorkers--
        drainStats()
      })
  }
}
function loadStats(rows: LogicalModel[], currentVersion: number) {
  for (const row of rows) {
    if (row.active_model_count !== undefined) activeCounts.value[row.id] = row.active_model_count
    else if (!row.mounts.length) activeCounts.value[row.id] = 0
    else if (canReadResource(user.permissions, 'model.models'))
      statsQueue.push({
        version: currentVersion,
        run: async () => {
          const signature = JSON.stringify([
            row.ready,
            row.mounts.map((m) => m.physical_model_id).sort(),
          ])
          const count = await cachedStats(activeCache, row.id, signature, async () => {
            const result = await getModelsApi(
              { page: 1, page_size: 1, logical_model_id: row.id, status: 'ACTIVE' },
              statsController.signal,
            )
            return result.total
          })
          if (currentVersion === version) activeCounts.value[row.id] = count
        },
      })
  }
  drainStats()
}
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
  statsQueue = []
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
    activeCounts.value = {}
    loadStats(result.items, currentVersion)
  } catch {
    /* 拦截器统一提示。 */
  } finally {
    if (currentVersion === version) loading.value = false
  }
}
function handleSaved() {
  if (editing.value) {
    activeCache.delete(editing.value.id)
  }
  void load()
}
function query() {
  clearTimeout(timer)
  pagination.current = 1
  void load()
}
watch(locale, () => {
  activeCache.clear()
  query()
})
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
function openPermissions(id: string, type: SubjectType) {
  if (!canReadResource(user.permissions, 'model.permissions')) return
  void router.push({
    path: `/model/logical/${id}`,
    query: { tab: 'permissions', subject_type: type },
  })
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
  if (!current.value || !reason.value.trim() || saving.value || impactBlocked.value) return
  saving.value = true
  try {
    await deleteLogicalModelApi(current.value.id, { reason: reason.value.trim() })
    MessagePlugin.success(t('ma.success'))
    activeCache.delete(current.value.id)
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
    MessagePlugin.success(t('ma.success'))
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
  statsQueue = []
  statsController.abort()
  activeCache.clear()
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
