<template>
  <section ref="actionTableRoot" class="panel identity-list-panel model-list-panel ma-stack">
    <LoadingState
      height="var(--td-comp-size-xxxl)"
      :loading="tabsLoading"
      :failed="tabsFailed"
      retryable
      @retry="loadAll"
    >
      <ProviderTabs
        v-model="providerId"
        :providers="providers"
        :total="modelTotal"
        @change="selectProvider"
      />
    </LoadingState>
    <FilterBar class="ma-filter"
      ><template #content
        ><div class="ma-row">
          <t-input
            v-model="search"
            class="ma-search"
            :placeholder="t('ma.search')"
            clearable
          /><t-select
            v-model="status"
            class="ma-filter-select"
            :options="[
              { value: '', label: t('ma.allStatus') },
              ...statuses.map((v) => ({ value: v, label: t('ma.' + v) })),
            ]"
          />
          <t-button theme="default" @click="reset">{{ t('ma.reset') }}</t-button>
        </div></template
      ></FilterBar
    >
    <div class="ma-row">
      <t-button
        theme="primary"
        v-permission.write="'model.models'"
        :disabled="tabsLoading || tabsFailed"
        @click="
          () => {
            editingId = ''
            formVisible = true
          }
        "
        ><template #icon><t-icon name="add" /></template>{{ t('ma.create') }}</t-button
      ><t-button
        v-permission.write="'model.permissions'"
        theme="default"
        :disabled="!canBatchAuthorize"
        @click="
          authorization = {
            models: items.filter((model) => selected.includes(model.id)),
            batch: true,
          }
        "
        >{{ t('ma.batchGrant') }}</t-button
      ><span v-if="selectedHasPendingReview" class="ma-muted">{{
        t('ma.batchGrantPendingReview')
      }}</span>
    </div>
    <t-table
      height="var(--stable-table-height)"
      class="ma-table"
      table-layout="fixed"
      table-content-width="max(100%, var(--model-access-table-width))"
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :selected-row-keys="selected"
      :pagination="pagination"
      :class="{ 'stable-table--pending-footer': (loading || listFailed) && !items.length }"
      :disable-data-page="true"
      @select-change="(v: (string | number)[]) => (selected = v.map(String))"
      @page-change="changePage"
    >
      <template v-if="listFailed" #empty>{{ t('common.loadFailed') }}</template>
      <template #model_id_at_gateway="{ row }"
        ><t-link class="ma-name" theme="primary" @click="detailId = row.id">{{
          row.model_id_at_gateway || '—'
        }}</t-link></template
      >
      <template #provider_id="{ row }"
        ><div class="ma-row">
          <t-avatar size="small">{{ row.provider_name.charAt(0) }}</t-avatar
          >{{ row.provider_name }}
        </div></template
      >
      <template #modalities="{ row }"
        >{{ row.input_modalities?.join('+') || '—' }} →
        {{ row.output_modalities?.join('+') || '—' }}</template
      >
      <template #status="{ row }"
        ><t-tag variant="light" :theme="statusTheme(row.status)">{{
          t('ma.' + row.status)
        }}</t-tag></template
      >
      <template #health_status="{ row }"
        ><t-tooltip
          v-if="row.health_status"
          :content="t('ma.lastCheck', { time: formatDateTime(row.health_checked_at) || '—' })"
          ><t-tag variant="light" :theme="statusTheme(row.health_status)">{{
            t('ma.' + row.health_status)
          }}</t-tag></t-tooltip
        ><span v-else>—</span></template
      >
      <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
      <template #action="{ row }"><RowActions :actions="rowActions(row)" /></template>
    </t-table>
    <ModelForm
      v-if="formVisible"
      :model-id="editingId || undefined"
      :provider-id="providerId"
      @close="formVisible = false"
      @saved="refreshAfterSave"
    />
    <ModelDetail
      v-if="detailId"
      :key="detailId"
      ref="detailRef"
      :id="detailId"
      @close="detailId = ''"
      @edit="edit"
      @grants="(model) => (authorization = { models: [model], batch: false })"
      @test="test"
    />
    <TestDialog
      v-if="testModel"
      :model="testModel"
      :purpose="testPurpose"
      :history-run="historyRun"
      :refresh-model-before-review="!!status"
      @close="testModel = undefined"
      @changed="refreshAfterTest"
    />
    <t-dialog
      dialog-class-name="model-access-dialog"
      :close-btn="!mutating"
      :visible="!!pending"
      :close-on-esc-keydown="!mutating"
      :close-on-overlay-click="false"
      :header="pending ? t('ma.' + pending.label) : ''"
      :confirm-btn="{ content: t('ma.confirm'), loading: mutating }"
      :cancel-btn="{ content: t('ma.cancel'), disabled: mutating }"
      @close="!mutating && (pending = undefined)"
      @confirm="confirmAction"
      ><div class="ma-stack">
        <p>{{ confirmationMessage }}</p>
        <t-textarea
          v-if="pending?.target !== 'DELETE'"
          v-model="reason"
          :disabled="mutating"
          :placeholder="t('ma.reason')"
        /></div
    ></t-dialog>
    <AuthorizationDrawer
      v-if="authorization && !authorization.batch"
      :model="authorization.models[0]!"
      @close="authorization = undefined"
    />
    <BatchAuthorizationDialog
      v-if="authorization?.batch"
      :models="authorization.models"
      @saved="selected = []"
      @close="authorization = undefined"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import { MessagePlugin, type PrimaryTableCol, type PageInfo } from 'tdesign-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import {
  accessApi,
  statuses,
  type Model,
  type Status,
  type TestRun,
} from '@/api/modules/modelAccess'
import type { ModelListItem, Summary } from '@/api/modules/modelAccessContract'
import { formatDateTime } from '@/utils/datetime'
import { statusTheme } from '../access/helpers'
import RowActions, { type RowAction } from '../access/RowActions.vue'
import ProviderTabs from '../access/ProviderTabs.vue'
import ModelForm from '../access/ModelForm.vue'
import ModelDetail from '../access/ModelDetail.vue'
import TestDialog from '../access/TestDialog.vue'
import AuthorizationDrawer from '../access/AuthorizationDrawer.vue'
import BatchAuthorizationDialog from '../access/BatchAuthorizationDialog.vue'
import { useActionColumnWidth } from '../access/useActionColumnWidth'
const { t } = useI18n()
const { actionTableRoot, actionColumnWidth } = useActionColumnWidth()
const detailRef = ref<InstanceType<typeof ModelDetail>>()
const providers = ref<Summary['providers']>([]),
  items = ref<ModelListItem[]>([]),
  selected = ref<string[]>([])
const search = ref(''),
  status = ref(''),
  providerId = ref(''),
  loading = ref(true),
  modelTotal = ref(0)
const listFailed = ref(false),
  tabsLoading = ref(true),
  tabsFailed = ref(false)
const pagination = reactive({ current: 1, pageSize: 20, total: 0, pageSizeOptions: [20, 50, 100] })
const formVisible = ref(false),
  editingId = ref(''),
  detailId = ref('')
const testModel = ref<Model>(),
  testPurpose = ref<'ADMISSION' | 'HEALTH'>('ADMISSION'),
  historyRun = ref<TestRun>()
const authorization = ref<{
  models: Pick<ModelListItem, 'id' | 'model_id_at_gateway'>[]
  batch: boolean
}>()
const selectedHasPendingReview = computed(() =>
  items.value.some(
    (model) => selected.value.includes(model.id) && model.status === 'PENDING_REVIEW',
  ),
)
const canBatchAuthorize = computed(
  () => selected.value.length > 0 && !selectedHasPendingReview.value,
)
const pending = ref<{
    model: Pick<Model, 'id' | 'status' | 'model_id_at_gateway'>
    target: Status | 'DELETE'
    label: string
  }>(),
  reason = ref(''),
  mutating = ref(false)
const confirmationMessage = computed(() => {
  if (!pending.value) return ''
  const p = pending.value
  if (p.target === 'DELETE') return t('ma.modelDeleteText', { name: p.model.model_id_at_gateway })
  return t('ma.confirm' + p.label[0]!.toUpperCase() + p.label.slice(1), {
    name: p.model.model_id_at_gateway,
  })
})
// 横向溢出时显式保留弹性列，防止组件补齐默认列宽后将操作列按比例拉伸。
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 40 },
  { colKey: 'model_id_at_gateway', width: 'auto', title: t('ma.name') },
  { colKey: 'model_id_at_provider', width: 'auto', title: t('ma.upstream') },
  { colKey: 'provider_id', width: 'auto', title: t('ma.provider') },
  { colKey: 'modalities', width: 'auto', title: t('ma.modalities') },
  { colKey: 'status', title: t('ma.status'), width: 100 },
  { colKey: 'health_status', title: t('ma.health'), width: 100 },
  { colKey: 'created_at', title: t('ma.created'), width: 175 },
  {
    colKey: 'action',
    title: t('ma.actions'),
    width: actionColumnWidth.value,
    className: 'ma-action-cell',
  },
])
function rowActions(model: ModelListItem): RowAction[] {
  const actions: RowAction[] = []
  const add = (label: string, permission: string | undefined, run: () => unknown, danger = false) =>
    actions.push({ label: t('ma.' + label), permission, run, danger })
  if (model.status !== 'PENDING_REVIEW') add('edit', 'model.models', () => edit(model.id))
  if (model.status !== 'PENDING_REVIEW')
    add('grants', 'model.permissions', () => {
      authorization.value = { models: [model], batch: false }
    })
  if (['ACTIVE', 'SUSPENDED'].includes(model.status))
    add('healthTitle', 'model.models', () => test(model, 'HEALTH'))
  if (model.status === 'DRAFT')
    add('startAdmission', 'model.admission', () => test(model, 'ADMISSION'))
  if (model.status === 'PENDING_REVIEW') {
    add('approve', 'model.review', () => action(model, 'ACTIVE', 'publish'))
    add('reject', 'model.review', () => action(model, 'DRAFT', 'reject'))
  }
  if (model.status === 'ACTIVE')
    add('pause', 'model.models', () => action(model, 'SUSPENDED', 'pause'))
  if (model.status === 'SUSPENDED')
    add('resume', 'model.models', () => action(model, 'ACTIVE', 'resume'))
  if (['ACTIVE', 'SUSPENDED'].includes(model.status))
    add('retire', 'model.models', () => action(model, 'RETIRED', 'retire'))
  if (model.status === 'RETIRED')
    add('reactivate', 'model.models', () => action(model, 'DRAFT', 'reactivate'))
  add('detail', undefined, () => (detailId.value = model.id))
  if (['DRAFT', 'RETIRED'].includes(model.status))
    add('remove', 'model.models', () => action(model, 'DELETE', 'remove'), true)
  return actions
}
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
let listController: AbortController | undefined
let summaryController: AbortController | undefined
async function load() {
  const g = ++generation
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  loading.value = true
  listFailed.value = false
  try {
    const result = await accessApi.models(
      {
        page: pagination.current,
        page_size: pagination.pageSize,
        search: search.value,
        status: status.value,
        provider_id: providerId.value,
      },
      { signal: controller.signal },
    )
    if (g !== generation) return
    if (pagination.current > Math.max(1, result.total_pages)) {
      pagination.current = Math.max(1, result.total_pages)
      await load()
      return
    }
    items.value = result.items
    pagination.total = result.total
    selected.value = []
  } catch {
    if (g === generation) listFailed.value = true
  } finally {
    if (g === generation) loading.value = false
  }
}
let tabsGeneration = 0
async function loadProviders(current: number) {
  summaryController?.abort()
  const controller = new AbortController()
  summaryController = controller
  const summary = await accessApi.summary({}, { signal: controller.signal })
  if (current !== tabsGeneration) return
  modelTotal.value = summary.total
  providers.value = summary.providers
}
async function loadAll() {
  const current = ++tabsGeneration
  tabsLoading.value = true
  tabsFailed.value = false
  await Promise.allSettled([
    loadProviders(current)
      .catch(() => {
        if (current === tabsGeneration) tabsFailed.value = true
      })
      .finally(() => {
        if (current === tabsGeneration) tabsLoading.value = false
      }),
    load(),
  ])
}
async function refreshAfterSave(model: Model, previous: Model | undefined) {
  // Tabs count all visible models; only creation or provider regrouping changes these totals.
  if (!previous || model.provider_id !== previous.provider_id) await loadAll()
  else await load()
}
let testRefresh: Promise<void> | undefined
let refreshAgain = false
let latestTestResult: TestRun | undefined
async function refreshAfterTest(run?: TestRun) {
  latestTestResult = run
  if (testRefresh) {
    refreshAgain = true
    return testRefresh
  }
  const pending = (async () => {
    do {
      refreshAgain = false
      await Promise.allSettled([
        load(),
        detailRef.value?.refreshTest(testPurpose.value, latestTestResult),
      ])
    } while (refreshAgain)
  })()
  testRefresh = pending
  try {
    await pending
  } finally {
    if (testRefresh === pending) testRefresh = undefined
  }
}
function selectProvider(id: string) {
  providerId.value = id
  pagination.current = 1
  void load()
}
function reset() {
  const changed = !!search.value || !!status.value
  search.value = ''
  status.value = ''
  pagination.current = 1
  if (!changed) void load()
}
function changePage(p: PageInfo) {
  pagination.current = p.current
  pagination.pageSize = p.pageSize
  void load()
}
function edit(id: string) {
  detailId.value = ''
  editingId.value = id
  formVisible.value = true
}
async function test(model: Model | ModelListItem, purpose: 'ADMISSION' | 'HEALTH', run?: TestRun) {
  testModel.value = await accessApi.model(model.id, false)
  testPurpose.value = purpose
  historyRun.value = run
}
function action(
  model: Pick<Model, 'id' | 'status' | 'model_id_at_gateway'>,
  target: Status | 'DELETE',
  label: string,
) {
  pending.value = { model, target, label }
  reason.value = ''
}
async function confirmAction() {
  if (mutating.value) return
  if (!pending.value) return
  if (['SUSPENDED', 'DRAFT'].includes(pending.value.target) && !reason.value.trim()) {
    MessagePlugin.warning(t('ma.reasonRequired'))
    return
  }
  mutating.value = true
  try {
    const p = pending.value
    if (p.target === 'DELETE') await accessApi.removeModel(p.model.id, reason.value)
    else await accessApi.status(p.model.id, p.target, reason.value)
    MessagePlugin.success(t('ma.success'))
    if (p.target === 'DELETE' && detailId.value === p.model.id) detailId.value = ''
    pending.value = undefined
    if (p.target === 'DELETE') await loadAll()
    else await load()
    await detailRef.value?.refresh()
  } finally {
    mutating.value = false
  }
}
watch([search, status], () => {
  ++generation
  listController?.abort()
  loading.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.current = 1
    void load()
  }, 250)
})
onMounted(loadAll)
onBeforeUnmount(() => {
  generation++
  tabsGeneration++
  listController?.abort()
  summaryController?.abort()
  clearTimeout(timer)
})
</script>
<style scoped src="../access/access.css"></style>
