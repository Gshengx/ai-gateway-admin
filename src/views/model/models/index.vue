<template>
  <div class="layout">
    <CollapsibleSidebar class="panel sidebar">
      <t-radio-group v-model="view" class="view-tabs" variant="default-filled" @change="switchView">
        <t-radio-button value="provider">{{ t('models.providerView') }}</t-radio-button>
        <t-radio-button value="logical">{{ t('models.logicalView') }}</t-radio-button>
      </t-radio-group>
      <div :class="['item', { selected: !selected }]" @click="selectItem('')">
        <span>{{ t(view === 'provider' ? 'models.allModels' : 'models.allPhysicalModels') }}</span>
        <span class="count">{{ total }}</span>
      </div>
      <div
        v-for="item in sidebarItems"
        :key="item.id"
        :class="['item', { selected: selected === item.id }]"
        @click="selectItem(item.id)"
      >
        <t-avatar v-if="view === 'provider'" shape="round" size="small">{{
          item.name.charAt(0)
        }}</t-avatar>
        <span class="item-name">{{ item.name }}</span>
        <span class="count">{{ item.count }}</span>
      </div>
      <div v-if="view === 'logical'" class="group-label">{{ t('models.unmounted') }}</div>
      <div
        v-if="view === 'logical'"
        :class="['item', { selected: selected === 'unmounted' }]"
        @click="selectItem('unmounted')"
      >
        <span>{{ t('models.unassociated') }}</span>
        <span class="count">{{ unmountedTotal }}</span>
      </div>
    </CollapsibleSidebar>
    <section class="panel content">
      <FilterBar class="model-filter"
        ><template #content>
          <div class="filters">
            <t-input
              class="search-input"
              v-model="search"
              :placeholder="t('models.search')"
              clearable
              @change="filterChanged"
              ><template #prefix-icon><t-icon name="search" /></template
            ></t-input>
            <t-select v-model="status" :options="statusOptions" @change="filterChanged" />
            <t-select v-model="mount" :options="mountOptions" @change="mountChanged" />
            <t-button theme="default" @click="reset">{{ t('models.reset') }}</t-button>
          </div>
        </template></FilterBar
      >
      <div class="toolbar">
        <t-button v-permission.write="'model.models'" @click="openForm()"
          ><template #icon><t-icon name="add" /></template>{{ t('models.create') }}</t-button
        >
      </div>
      <t-table
        table-layout="fixed"
        row-key="id"
        :data="items"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        :disable-data-page="true"
        @page-change="changePage"
      >
        <template #model_id_at_provider="{ row }">
          <t-link theme="primary" @click="detail = row">{{ row.model_id_at_provider }}</t-link>
        </template>
        <template #provider="{ row }"
          ><div class="provider-name">
            <t-avatar shape="round" size="small">{{
              providerName(row.provider_id).charAt(0)
            }}</t-avatar>
            <span>{{ row.provider_name || providerName(row.provider_id) }}</span>
          </div></template
        >
        <template #model_type="{ row }">{{ t(`models.types.${row.model_type}`) }}</template>
        <template #base_url="{ row }">{{
          row.provider_base_url || providers.find((p) => p.id === row.provider_id)?.base_url || '—'
        }}</template>
        <template #mounts="{ row }">{{
          row.mounts?.map((m: ModelMount) => m.display_name).join('、') || '—'
        }}</template>
        <template #status="{ row }"
          ><t-tag :theme="statusTheme(row.status)">{{ t(`models.${row.status}`) }}</t-tag></template
        >
        <template #created_at="{ row }">{{ formatDateTime(row.created_at) || '—' }}</template>
        <template #action="{ row }">
          <t-space>
            <t-dropdown trigger="hover">
              <t-link theme="primary"
                >{{ t('models.actions') }}<t-icon name="chevron-down"
              /></t-link>
              <t-dropdown-menu>
                <t-dropdown-item
                  v-if="row.status === 'DRAFT'"
                  v-permission.write="'model.admission'"
                  @click="openAdmission(row)"
                  >{{ t('models.admission.startTitle') }}</t-dropdown-item
                >
                <t-dropdown-item
                  v-if="row.status === 'PENDING_REVIEW'"
                  v-permission.write="'model.review'"
                  @click="openReview(row.id, 'PUBLISH')"
                  >{{ t('models.publish') }}</t-dropdown-item
                >
                <t-dropdown-item
                  v-if="row.status === 'PENDING_REVIEW'"
                  v-permission.write="'model.review'"
                  @click="openReview(row.id, 'REJECT')"
                  >{{ t('models.admission.reject') }}</t-dropdown-item
                >
                <t-dropdown-item
                  v-for="action in commands.filter((action) => commandAllowed(row, action.command))"
                  :key="action.command"
                  v-permission.write="'model.models'"
                  @click="openAction(row.id, action.command)"
                  >{{ t(`models.${action.label}`) }}</t-dropdown-item
                >
                <t-dropdown-item
                  v-if="['DRAFT', 'ACTIVE', 'RETIRED', 'SUSPENDED'].includes(row.status)"
                  v-permission.write="'model.models'"
                  @click="openForm(row.id)"
                  >{{ t('models.edit') }}</t-dropdown-item
                >
                <t-dropdown-item @click="detail = row">{{ t('models.detail') }}</t-dropdown-item>
              </t-dropdown-menu>
            </t-dropdown>
            <t-link
              v-if="row.status !== 'ACTIVE'"
              v-permission.write="'model.models'"
              theme="danger"
              @click="openAction(row.id, 'DELETE')"
              >{{ t('models.delete') }}</t-link
            >
          </t-space>
        </template>
      </t-table>
    </section>
    <ModelDetailDrawer
      v-if="detail"
      :model="detail"
      :provider="providers.find((p) => p.id === detail?.provider_id)"
      @close="detail = undefined"
      @edit="openForm"
      @review="(id) => openReview(id, 'PUBLISH')"
      @result="(model, run) => openAdmission(model, true, run)"
    />
    <ModelFormDialog v-model:visible="dialogVisible" :model-id="editingId" @success="handleSaved" />
    <AdmissionDialog
      v-if="admissionModel"
      :model="admissionModel"
      :result-only="admissionResultOnly"
      :history-run="admissionHistoryRun"
      @close="admissionModel = undefined"
      @changed="handleSaved"
      @review="(decision) => openReview(admissionModel!.id, decision)"
    />
    <t-dialog
      v-model:visible="rejectVisible"
      :header="t('models.admission.reject')"
      :confirm-btn="{ content: t('model.modelsForm.confirm'), loading: actionLoading }"
      :close-on-overlay-click="false"
      @confirm="confirmReject"
    >
      <t-form label-align="top" :colon="false" required-mark-position="right"
        ><t-form-item :label="t('models.rejectReason')" :required-mark="true"
          ><t-textarea v-model="actionReason" :maxlength="300" /></t-form-item
      ></t-form>
    </t-dialog>
    <t-dialog
      v-model:visible="actionVisible"
      :header="t(`models.commandTitles.${pendingAction}`)"
      :confirm-btn="{
        content: t('models.confirmOperation'),
        loading: actionLoading,
        disabled: pendingAction === 'DELETE' && impactBlocked,
      }"
      :close-on-overlay-click="false"
      @confirm="confirmAction"
    >
      <ModelImpactNotice
        v-if="actionVisible && pendingAction === 'DELETE'"
        resource="models"
        :id="actionId"
        @blocked="impactBlocked = $event"
      />
      <p>{{ t(`models.commandMessages.${pendingAction}`, { name: actionModelName }) }}</p>
      <t-form v-if="reasonRequired" label-align="top" :colon="false" required-mark-position="right"
        ><t-form-item :label="t('models.operationReason')" :required-mark="true"
          ><t-textarea
            v-model="actionReason"
            :maxlength="200"
            :placeholder="t('models.reasonPlaceholder')" /></t-form-item
      ></t-form>
    </t-dialog>
  </div>
</template>
<script setup lang="ts">
import ModelImpactNotice from '../ModelImpactNotice.vue'
import CollapsibleSidebar from '@/components/CollapsibleSidebar.vue'
import { canReadResource, useUserStore } from '@/stores/modules/user'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MessagePlugin,
  type PageInfo,
  type PaginationProps,
  type PrimaryTableCol,
} from 'tdesign-vue-next'
import {
  deleteModelApi,
  getLogicalModelsApi,
  getModelsApi,
  sendModelCommandApi,
  getLatestAdmissionApi,
  reviewModelApi,
  type LogicalModelItem,
  type AdmissionRun,
  type ModelMount,
  type ModelCommand,
  type ModelStatus,
  type PhysicalModelItem,
} from '@/api/modules/models'
import { getProvidersApi, type ProviderItem } from '@/api/modules/providers'
import ModelFormDialog from './ModelFormDialog.vue'
import AdmissionDialog from './AdmissionDialog.vue'
import ModelDetailDrawer from './ModelDetailDrawer.vue'
import FilterBar from '@/components/FilterBar.vue'
import { formatDateTime } from '@/utils/datetime'

const impactBlocked = ref(true)
const { t, locale } = useI18n()
const user = useUserStore()
const detail = ref<PhysicalModelItem>()
function providerName(id: string) {
  return providers.value.find((p) => p.id === id)?.name || '—'
}
const dialogVisible = ref(false)
const editingId = ref<string | undefined>()
const actionVisible = ref(false)
const actionLoading = ref(false)
const actionReason = ref('')
const actionId = ref('')
const pendingAction = ref<ModelCommand | 'DELETE'>('DELETE')
const reasonRequired = computed(() => ['PAUSE', 'DELETE'].includes(pendingAction.value))
const actionModelName = computed(
  () => items.value.find((x) => x.id === actionId.value)?.model_id_at_provider || '',
)
const admissionModel = ref<PhysicalModelItem>()
const admissionResultOnly = ref(false)
const admissionHistoryRun = ref<AdmissionRun>()
const rejectVisible = ref(false)
const reviewRunId = ref('')
function openAdmission(model: PhysicalModelItem, resultOnly = false, run?: AdmissionRun) {
  admissionHistoryRun.value = run
  admissionResultOnly.value = resultOnly
  admissionModel.value = model
}
function commandAllowed(row: PhysicalModelItem, command: ModelCommand) {
  const states: Record<ModelCommand, ModelStatus[]> = {
    PAUSE: ['ACTIVE'],
    RESUME: ['SUSPENDED'],
    RETIRE: ['ACTIVE', 'SUSPENDED'],
    REACTIVATE: ['RETIRED'],
  }
  return states[command].includes(row.status) && row.allowed_commands?.includes(command)
}
async function openReview(id: string, decision: 'PUBLISH' | 'REJECT') {
  if (actionLoading.value) return
  actionLoading.value = true
  try {
    const latest = await getLatestAdmissionApi(id)
    if (!latest.latest_run) {
      MessagePlugin.warning(t('models.admission.noResult'))
      return
    }
    actionId.value = id
    reviewRunId.value = latest.latest_run.run_id
    if (decision === 'REJECT') {
      actionReason.value = ''
      rejectVisible.value = true
    } else {
      await reviewModelApi(id, { decision, run_id: reviewRunId.value, reason: t('models.publish') })
      admissionModel.value = undefined
      detail.value = undefined
      await handleSaved()
    }
  } catch {
    /* 统一请求层已提示错误。 */
  } finally {
    actionLoading.value = false
  }
}
async function confirmReject() {
  if (actionLoading.value) return
  if (!actionReason.value.trim()) {
    MessagePlugin.warning(t('models.rejectReason'))
    return
  }
  actionLoading.value = true
  try {
    await reviewModelApi(actionId.value, {
      decision: 'REJECT',
      run_id: reviewRunId.value,
      reason: actionReason.value.trim(),
    })
    rejectVisible.value = false
    admissionModel.value = undefined
    await handleSaved()
  } catch {
    /* 统一请求层已提示错误，保留弹窗供重试。 */
  } finally {
    actionLoading.value = false
  }
}
const commands = [
  { command: 'PAUSE', label: 'pause' },
  { command: 'RESUME', label: 'resume' },
  { command: 'RETIRE', label: 'retire' },
  { command: 'REACTIVATE', label: 'reactivate' },
] as const
function openForm(id?: string) {
  editingId.value = id
  dialogVisible.value = true
}
async function handleSaved() {
  sidebarVersion++
  sidebarController.abort()
  sidebarController = new AbortController()
  logicalSidebarTask = undefined
  logicalStatsExpiresAt = 0
  completeModelPage = undefined
  logicalCounts.value = {}
  await Promise.all([fetchList(), fetchProviders()])
}
function openAction(id: string, action: ModelCommand | 'DELETE') {
  actionId.value = id
  pendingAction.value = action
  actionReason.value = ''
  actionVisible.value = true
}
async function confirmAction() {
  if (actionLoading.value || (pendingAction.value === 'DELETE' && impactBlocked.value)) return
  if (reasonRequired.value && !actionReason.value.trim()) {
    MessagePlugin.warning(t('providers.reasonRequired'))
    return
  }
  actionLoading.value = true
  try {
    if (pendingAction.value === 'DELETE')
      await deleteModelApi(actionId.value, { reason: actionReason.value.trim() })
    else
      await sendModelCommandApi(actionId.value, {
        command: pendingAction.value,
        reason: actionReason.value.trim() || t(`models.commandTitles.${pendingAction.value}`),
      })
    actionVisible.value = false
    await handleSaved()
  } catch {
    /* 请求层统一提示；模型操作不要求密码二次验证。 */
  } finally {
    actionLoading.value = false
  }
}
const view = ref('provider')
const selected = ref('')
const search = ref('')
const status = ref<ModelStatus | ''>('')
const mount = ref('all')
const items = ref<PhysicalModelItem[]>([])
const providers = ref<ProviderItem[]>([])
const logicalModels = ref<LogicalModelItem[]>([])
const total = ref(0)
const unmountedTotal = ref(0)
const logicalCounts = ref<Record<string, string>>({})
const loading = ref(false)
const sidebarCacheTtl = 30_000
let listVersion = 0
let sidebarVersion = 0
let sidebarController = new AbortController()
let logicalStatsExpiresAt = 0
let logicalSidebarTask: Promise<void> | undefined
let completeModelPage: { items: PhysicalModelItem[]; expiresAt: number } | undefined
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [10, 20, 50, 100],
})
const sidebarItems = computed(() =>
  view.value === 'provider'
    ? providers.value.map((p) => ({ id: p.id, name: p.name, count: p.model_count }))
    : logicalModels.value.map((m) => ({
        id: m.id,
        name: m.display_name,
        count: logicalCounts.value[m.id] ?? '—',
      })),
)
const statusOptions = computed(() => [
  { label: t('models.allStatuses'), value: '' },
  ...(['ACTIVE', 'DRAFT', 'PENDING_REVIEW', 'SUSPENDED', 'TESTING', 'RETIRED'] as const).map(
    (s) => ({ label: t(`models.${s}`), value: s }),
  ),
])
const mountOptions = computed(() =>
  ['all', 'mounted', 'unmounted'].map((s) => ({
    label: t(s === 'all' ? 'models.allMountStatuses' : `models.${s}`),
    value: s,
  })),
)
const columns = computed<PrimaryTableCol<PhysicalModelItem>[]>(() => [
  { colKey: 'model_id_at_provider', title: t('models.identifier'), width: 180, ellipsis: true },
  { colKey: 'provider', title: t('models.provider'), width: 160, ellipsis: true },
  { colKey: 'base_url', title: t('models.api'), width: 200, ellipsis: true },
  { colKey: 'model_type', title: t('models.type'), width: 100 },
  { colKey: 'mounts', title: t('models.logical'), width: 120, ellipsis: true },
  { colKey: 'status', title: t('models.status'), width: 100 },
  { colKey: 'created_at', title: t('models.created'), width: 180 },
  { colKey: 'action', title: t('models.actions'), fixed: 'right', width: 140 },
])
async function fetchList() {
  const currentVersion = ++listVersion
  const unfiltered = !selected.value && !search.value && !status.value && mount.value === 'all'
  loading.value = true
  try {
    const result = await getModelsApi({
      page: pagination.current || 1,
      page_size: pagination.pageSize ?? 20,
      search: search.value || undefined,
      status: status.value || undefined,
      unmounted: mount.value === 'all' ? undefined : mount.value === 'unmounted',
      provider_id: view.value === 'provider' ? selected.value || undefined : undefined,
      logical_model_id:
        view.value === 'logical' && selected.value !== 'unmounted'
          ? selected.value || undefined
          : undefined,
    })
    if (currentVersion !== listVersion) return
    items.value = result.items
    pagination.total = result.total
    if (unfiltered) {
      total.value = result.total
      completeModelPage =
        result.items.length === result.total
          ? { items: result.items, expiresAt: Date.now() + sidebarCacheTtl }
          : undefined
    }
    if (view.value === 'logical') void fetchLogicalSidebar().catch(() => {})
  } finally {
    if (currentVersion === listVersion) loading.value = false
  }
}
function filterChanged() {
  pagination.current = 1
  void fetchList()
}
function selectItem(id: string) {
  selected.value = id
  if (view.value === 'logical') mount.value = id === 'unmounted' ? 'unmounted' : 'all'
  filterChanged()
}
function mountChanged() {
  if (view.value === 'logical') {
    if (mount.value === 'unmounted') selected.value = 'unmounted'
    else if (selected.value === 'unmounted') selected.value = ''
  }
  filterChanged()
}
function switchView(value: string | number | boolean) {
  view.value = String(value)
  selected.value = ''
  search.value = ''
  status.value = ''
  mount.value = 'all'
  pagination.current = 1
  void fetchList()
}
function reset() {
  search.value = ''
  status.value = ''
  mount.value = 'all'
  mountChanged()
}
function changePage(page: PageInfo) {
  pagination.current = page.pageSize !== pagination.pageSize ? 1 : page.current
  pagination.pageSize = page.pageSize
  void fetchList()
}
function statusTheme(s: ModelStatus) {
  return s === 'ACTIVE'
    ? 'success'
    : s === 'PENDING_REVIEW'
      ? 'warning'
      : s === 'SUSPENDED'
        ? 'danger'
        : 'default'
}
async function fetchProviders() {
  if (!canReadResource(user.permissions, 'model.providers')) return
  const p = await getProvidersApi({ page: 1, page_size: 100 })
  providers.value = p.items
  for (let page = 2; page <= p.total_pages; page++)
    providers.value.push(...(await getProvidersApi({ page, page_size: 100 })).items)
  // 当前列表有筛选时，不能用筛选后的 total 覆盖侧栏的全部模型数量。
  if (selected.value || search.value || status.value || mount.value !== 'all') {
    const all = await getModelsApi({ page: 1, page_size: 1 })
    total.value = all.total
  }
}
function fetchLogicalSidebar(): Promise<void> {
  if (!canReadResource(user.permissions, 'model.logical')) return Promise.resolve()
  if (view.value !== 'logical' || logicalStatsExpiresAt > Date.now()) return Promise.resolve()
  if (logicalSidebarTask) return logicalSidebarTask
  const currentVersion = sidebarVersion
  const signal = sidebarController.signal
  const current = () => currentVersion === sidebarVersion && !signal.aborted
  const load = async () => {
    const l = await getLogicalModelsApi({ page: 1, page_size: 100 })
    if (!current()) return
    logicalModels.value = l.items
    for (let page = 2; page <= l.total_pages; page++) {
      const result = await getLogicalModelsApi({ page, page_size: 100 })
      if (!current()) return
      logicalModels.value.push(...result.items)
    }
    const complete =
      completeModelPage && completeModelPage.expiresAt > Date.now() ? completeModelPage : undefined
    if (complete) {
      logicalCounts.value = Object.fromEntries(
        logicalModels.value.map((model) => {
          const mounted = complete.items.filter((m) =>
            m.mounts.some((binding) => binding.logical_model_id === model.id),
          )
          return [
            model.id,
            `${mounted.filter((m) => m.status === 'ACTIVE').length}/${mounted.length}`,
          ]
        }),
      )
      unmountedTotal.value = complete.items.filter((m) => !m.mounts.length).length
      logicalStatsExpiresAt = complete.expiresAt
      return
    }
    const tasks: (() => Promise<void>)[] = [
      async () => {
        const result = await getModelsApi({ page: 1, page_size: 1, unmounted: true }, signal)
        if (current()) unmountedTotal.value = result.total
      },
    ]
    for (const model of logicalModels.value) {
      if (!model.mounts.length) {
        logicalCounts.value[model.id] = '0/0'
        continue
      }
      tasks.push(async () => {
        const all = await getModelsApi(
          { page: 1, page_size: 100, logical_model_id: model.id },
          signal,
        )
        const active =
          all.items.length === all.total
            ? all.items.filter((m) => m.status === 'ACTIVE').length
            : (
                await getModelsApi(
                  { page: 1, page_size: 1, logical_model_id: model.id, status: 'ACTIVE' },
                  signal,
                )
              ).total
        if (current()) logicalCounts.value[model.id] = `${active}/${all.total}`
      })
    }
    let next = 0
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (current() && view.value === 'logical' && next < tasks.length) await tasks[next++]()
      }),
    )
    if (current() && view.value === 'logical') logicalStatsExpiresAt = Date.now() + sidebarCacheTtl
  }
  const task = load().finally(() => {
    if (logicalSidebarTask === task) logicalSidebarTask = undefined
  })
  logicalSidebarTask = task
  return task
}
watch(locale, () => {
  pagination.current = 1
  void handleSaved()
})
onMounted(() => {
  void handleSaved()
})
onBeforeUnmount(() => {
  listVersion++
  sidebarVersion++
  sidebarController.abort()
})
</script>
<style scoped>
.layout {
  display: flex;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
  overflow: hidden;
}
.panel {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
}
.sidebar {
  flex: 0 0 var(--model-sidebar-width);
  min-width: 0;
  border-right: thin solid var(--td-component-stroke);
}
.view-tabs {
  display: flex;
  width: 100%;
  flex-wrap: nowrap;
  margin-bottom: var(--td-comp-margin-l);
}
.view-tabs :deep(.t-radio-button) {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
  padding-inline: var(--td-comp-paddingLR-xs);
  text-align: center;
  white-space: nowrap;
}
.content {
  flex: 1;
  min-width: 0;
}
.detail-admission {
  margin-top: var(--td-comp-margin-l);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
  cursor: pointer;
  border-radius: var(--td-radius-default);
}
.item:hover {
  background: var(--td-bg-color-container-hover);
}
.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  margin-left: auto;
  color: var(--td-text-color-placeholder);
}
.group-label {
  margin-top: var(--td-comp-margin-l);
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
  color: var(--td-text-color-placeholder);
  font-size: var(--td-font-size-body-small);
}
.provider-name {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.provider-name :deep(.t-avatar),
.item :deep(.t-avatar) {
  flex-shrink: 0;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}
.selected {
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}
.toolbar,
.filters {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.toolbar {
  flex-wrap: wrap;
  margin-bottom: var(--td-comp-margin-l);
}
.model-filter {
  margin-bottom: var(--td-comp-margin-l);
}
.model-filter :deep(.t-card__body) {
  padding: 0;
}
.filters {
  flex-wrap: wrap;
  min-width: 0;
}
.filters > .search-input {
  flex: 0 0 var(--model-search-width);
  width: var(--model-search-width);
}
.filters > :deep(.t-select__wrap) {
  flex: 0 0 var(--model-filter-width);
  width: var(--model-filter-width);
}
.content :deep(.t-table__pagination) {
  margin-top: var(--td-comp-margin-l);
}
.filters :deep(.t-button) {
  flex-shrink: 0;
}
</style>
