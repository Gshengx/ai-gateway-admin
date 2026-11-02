<template>
  <div class="layout">
    <aside class="panel sidebar">
      <t-radio-group v-model="view" variant="default-filled" @change="switchView">
        <t-radio-button value="provider">{{ t('models.providerView') }}</t-radio-button>
        <t-radio-button value="logical">{{ t('models.logicalView') }}</t-radio-button>
      </t-radio-group>
      <div :class="['item', { selected: !selected }]" @click="selectItem('')">
        {{ t('models.allModels') }} {{ total }}
      </div>
      <div
        v-for="item in sidebarItems"
        :key="item.id"
        :class="['item', { selected: selected === item.id }]"
        @click="selectItem(item.id)"
      >
        <t-avatar size="small">{{ item.name.charAt(0) }}</t-avatar>
        <span>{{ item.name }}</span
        ><span>{{ item.count }}</span>
      </div>
    </aside>
    <section class="panel content">
      <div class="toolbar">
        <div class="filters">
          <t-input
            v-model="search"
            :placeholder="t('models.search')"
            clearable
            @change="filterChanged"
          />
          <t-select v-model="status" :options="statusOptions" @change="filterChanged" />
          <t-select v-model="mount" :options="mountOptions" @change="filterChanged" />
          <t-button theme="default" @click="reset">{{ t('models.reset') }}</t-button>
        </div>
        <t-button @click="openForm()"
          ><template #icon><t-icon name="add" /></template>{{ t('models.create') }}</t-button
        >
      </div>
      <t-table
        row-key="id"
        :data="items"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        :disable-data-page="true"
        @page-change="changePage"
      >
        <template #provider="{ row }">{{
          providers.find((p) => p.id === row.provider_id)?.name || '—'
        }}</template>
        <template #mounts="{ row }">{{
          row.mounts?.map((m: ModelMount) => m.display_name).join('、') || '—'
        }}</template>
        <template #status="{ row }"
          ><t-tag :theme="statusTheme(row.status)">{{ t(`models.${row.status}`) }}</t-tag></template
        >
        <template #created_at="{ row }">{{ formatDate(row.created_at) }}</template>
        <template #action="{ row }">
          <t-space>
            <t-link @click="openForm(row.id)">{{ t('models.edit') }}</t-link>
            <template v-for="action in commands" :key="action.command">
              <t-link
                v-if="row.allowed_commands?.includes(action.command)"
                @click="runCommand(row.id, action.command)"
                >{{ t(`models.${action.label}`) }}</t-link
              >
            </template>
            <t-link theme="danger" @click="remove(row.id)">{{ t('models.delete') }}</t-link>
          </t-space>
        </template>
      </t-table>
    </section>
    <ModelFormDialog v-model:visible="dialogVisible" :model-id="editingId" @success="handleSaved" />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogPlugin,
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
  MODEL_REASON,
  type LogicalModelItem,
  type ModelMount,
  type ModelCommand,
  type ModelStatus,
  type PhysicalModelItem,
} from '@/api/modules/models'
import { getProvidersApi, type ProviderItem } from '@/api/modules/providers'
import ModelFormDialog from './ModelFormDialog.vue'

const { t } = useI18n()
const dialogVisible = ref(false)
const editingId = ref<string | undefined>()
const commands = [
  { command: 'PAUSE', label: 'pause', reason: MODEL_REASON.pause },
  { command: 'RESUME', label: 'resume', reason: MODEL_REASON.resume },
  { command: 'RETIRE', label: 'retire', reason: MODEL_REASON.retire },
  { command: 'REACTIVATE', label: 'reactivate', reason: MODEL_REASON.reactivate },
] as const
function openForm(id?: string) {
  editingId.value = id
  dialogVisible.value = true
}
async function handleSaved() {
  await Promise.all([fetchList(), fetchSidebar()])
}
function runCommand(id: string, command: ModelCommand) {
  const execute = async () => {
    try {
      await sendModelCommandApi(id, {
        command,
        reason: commands.find((item) => item.command === command)!.reason,
      })
      await handleSaved()
    } catch (error) {
      const e = error as {
        code?: string
        message?: string
        notified?: boolean
        response?: { data?: { code?: string; message?: string } }
      }
      if (!e.notified)
        MessagePlugin.error(
          [e.response?.data?.code ?? e.code, e.response?.data?.message ?? e.message]
            .filter(Boolean)
            .join(': '),
        )
    }
  }
  if (command === 'RETIRE') {
    const dialog = DialogPlugin.confirm({
      header: t('models.retire'),
      body: t('models.confirmRetire'),
      onConfirm: async () => {
        dialog.destroy()
        await execute()
      },
    })
  } else void execute()
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
const loading = ref(false)
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [20],
})
const sidebarItems = computed(() =>
  view.value === 'provider'
    ? providers.value.map((p) => ({ id: p.id, name: p.name, count: p.model_count }))
    : logicalModels.value.map((m) => ({
        id: m.id,
        name: m.display_name,
        count: m.candidate_count,
      })),
)
const statusOptions = computed(() => [
  { label: t('models.allStatuses'), value: '' },
  ...(['ACTIVE', 'DRAFT', 'PENDING_REVIEW', 'SUSPENDED', 'TESTING', 'RETIRED'] as const).map(
    (s) => ({ label: t(`models.${s}`), value: s }),
  ),
])
const mountOptions = computed(() =>
  ['all', 'mounted', 'unmounted'].map((s) => ({ label: t(`models.${s}`), value: s })),
)
const columns = computed<PrimaryTableCol<PhysicalModelItem>[]>(() => [
  { colKey: 'model_id_at_provider', title: t('models.identifier') },
  { colKey: 'provider', title: t('models.provider') },
  { colKey: 'invocation_api', title: t('models.api') },
  { colKey: 'model_type', title: t('models.type') },
  { colKey: 'mounts', title: t('models.logical') },
  { colKey: 'status', title: t('models.status') },
  { colKey: 'created_at', title: t('models.created') },
  { colKey: 'action', title: t('models.actions'), fixed: 'right' },
])
async function fetchList() {
  loading.value = true
  try {
    const result = await getModelsApi({
      page: pagination.current || 1,
      page_size: 20,
      search: search.value || undefined,
      status: status.value || undefined,
      unmounted: mount.value === 'all' ? undefined : mount.value === 'unmounted',
      provider_id: view.value === 'provider' ? selected.value || undefined : undefined,
      logical_model_id: view.value === 'logical' ? selected.value || undefined : undefined,
    })
    items.value = result.items
    pagination.total = result.total
  } finally {
    loading.value = false
  }
}
function filterChanged() {
  pagination.current = 1
  void fetchList()
}
function selectItem(id: string) {
  selected.value = id
  filterChanged()
}
function switchView(value: string | number | boolean) {
  view.value = String(value)
  selected.value = ''
  search.value = ''
  status.value = ''
  mount.value = 'all'
  filterChanged()
}
function reset() {
  search.value = ''
  status.value = ''
  mount.value = 'all'
  filterChanged()
}
function changePage(page: PageInfo) {
  pagination.current = page.current
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
function formatDate(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function remove(id: string) {
  const dialog = DialogPlugin.confirm({
    header: t('models.delete'),
    body: t('models.confirmDelete'),
    onConfirm: async () => {
      try {
        await deleteModelApi(id, { reason: MODEL_REASON.remove })
        dialog.destroy()
        await handleSaved()
      } catch (error) {
        if ((error as { code?: string }).code === 'REAUTH_REQUIRED')
          MessagePlugin.error(t('model.modelsForm.reauthRequired'))
      }
    },
  })
}
async function fetchSidebar() {
  const [p, l, all] = await Promise.all([
    getProvidersApi({ page: 1, page_size: 100 }),
    getLogicalModelsApi({ page: 1, page_size: 100 }),
    getModelsApi({ page: 1, page_size: 20 }),
  ])
  providers.value = p.items
  logicalModels.value = l.items
  total.value = all.total
}
onMounted(() => {
  void handleSaved()
})
</script>
<style scoped>
.layout {
  display: flex;
  gap: var(--td-comp-margin-l);
}
.panel {
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
}
.sidebar {
  flex: 0 0 20%;
}
.content {
  flex: 1;
  min-width: 0;
}
.item {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
  cursor: pointer;
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
  justify-content: space-between;
  margin-bottom: var(--td-comp-margin-l);
}
</style>
