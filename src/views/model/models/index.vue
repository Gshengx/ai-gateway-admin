<template>
  <section ref="actionTableRoot" class="panel identity-list-panel model-list-panel ma-stack">
    <ProviderTabs
      v-model="providerId"
      :providers="providers"
      :total="modelTotal"
      @change="selectProvider"
    />
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
        @click="
          () => {
            editingId = ''
            formVisible = true
          }
        "
        ><template #icon><t-icon name="add" /></template>{{ t('ma.create') }}</t-button
      ><t-button
        v-if="selected.length"
        v-permission.write="'model.permissions'"
        theme="default"
        @click="batchVisible = true"
        >{{ t('ma.batchGrant') }}</t-button
      >
    </div>
    <t-table
      class="ma-table"
      table-layout="fixed"
      table-content-width="max(100%, var(--model-access-table-width))"
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :selected-row-keys="selected"
      :pagination="pagination"
      :disable-data-page="true"
      @select-change="(v: (string | number)[]) => (selected = v.map(String))"
      @page-change="changePage"
    >
      <template #model_id_at_gateway="{ row }"
        ><t-link class="ma-name" theme="primary" @click="detailId = row.id">{{
          row.model_id_at_gateway || '—'
        }}</t-link></template
      >
      <template #provider_id="{ row }"
        ><div class="ma-row">
          <t-avatar size="small">{{ providerName(row.provider_id).charAt(0) }}</t-avatar
          >{{ providerName(row.provider_id) }}
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
      :providers="providers"
      :provider-id="providerId"
      @close="formVisible = false"
      @saved="loadAll"
    />
    <ModelDetail
      v-if="detailId"
      :key="detailId"
      ref="detailRef"
      :id="detailId"
      :providers="providers"
      @close="detailId = ''"
      @edit="edit"
      @test="test"
    />
    <TestDialog
      v-if="testModel"
      :model="testModel"
      :purpose="testPurpose"
      :history-run="historyRun"
      @close="testModel = undefined"
      @changed="refreshAfterTest"
    />
    <t-dialog
      dialog-class-name="model-access-dialog"
      :close-btn="true"
      :visible="!!pending"
      :header="pending ? t('ma.' + pending.label) : ''"
      :confirm-btn="{ content: t('ma.confirm'), loading: mutating }"
      :cancel-btn="t('ma.cancel')"
      @close="pending = undefined"
      @confirm="confirmAction"
      ><div class="ma-stack">
        <p>{{ confirmationMessage }}</p>
        <t-alert
          v-if="pending?.target === 'DELETE'"
          theme="warning"
          :message="t('ma.deleteConfirm')"
        /><t-textarea v-model="reason" :placeholder="t('ma.reason')" /></div
    ></t-dialog>
    <t-dialog
      dialog-class-name="model-access-dialog"
      :close-btn="true"
      v-model:visible="batchVisible"
      :header="t('ma.batchGrant')"
      :footer="false"
      width="var(--physical-model-dialog-width)"
      ><div class="ma-stack">
        <strong>{{ t('ma.selectedModels') }}</strong>
        <div>
          {{
            items
              .filter((m) => selected.includes(m.id))
              .map((m) => m.model_id_at_gateway)
              .join('、')
          }}
        </div>
        <PermissionsEditor v-if="batchVisible" :model-ids="selected" /></div
    ></t-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PrimaryTableCol, type PageInfo } from 'tdesign-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import {
  accessApi,
  statuses,
  type Provider,
  type Model,
  type Status,
  type TestRun,
} from '@/api/modules/modelAccess'
import { formatDateTime } from '@/utils/datetime'
import { statusTheme } from '../access/helpers'
import RowActions, { type RowAction } from '../access/RowActions.vue'
import ProviderTabs from '../access/ProviderTabs.vue'
import ModelForm from '../access/ModelForm.vue'
import ModelDetail from '../access/ModelDetail.vue'
import TestDialog from '../access/TestDialog.vue'
import PermissionsEditor from '../access/PermissionsEditor.vue'
import { useActionColumnWidth } from '../access/useActionColumnWidth'
const { t } = useI18n()
const { actionTableRoot, actionColumnWidth } = useActionColumnWidth()
const detailRef = ref<InstanceType<typeof ModelDetail>>()
const providers = ref<Provider[]>([]),
  items = ref<Model[]>([]),
  selected = ref<string[]>([])
const search = ref(''),
  status = ref(''),
  providerId = ref(''),
  loading = ref(false),
  modelTotal = ref(0)
const pagination = reactive({ current: 1, pageSize: 20, total: 0, pageSizeOptions: [20, 50, 100] })
const formVisible = ref(false),
  editingId = ref(''),
  detailId = ref(''),
  batchVisible = ref(false)
const testModel = ref<Model>(),
  testPurpose = ref<'ADMISSION' | 'HEALTH'>('ADMISSION'),
  historyRun = ref<TestRun>()
const pending = ref<{ model: Model; target: Status | 'DELETE'; label: string }>(),
  reason = ref(''),
  mutating = ref(false)
const confirmationMessage = computed(() => {
  if (!pending.value) return ''
  const p = pending.value
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
function rowActions(model: Model): RowAction[] {
  const actions: RowAction[] = []
  const add = (label: string, permission: string | undefined, run: () => unknown, danger = false) =>
    actions.push({ label: t('ma.' + label), permission, run, danger })
  add('edit', 'model.models', () => edit(model.id))
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
  if (model.status !== 'ACTIVE')
    add('remove', 'model.models', () => action(model, 'DELETE', 'remove'), true)
  return actions
}
function providerName(id: string) {
  return providers.value.find((p) => p.id === id)?.name || '—'
}
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const g = ++generation
  loading.value = true
  try {
    const result = await accessApi.models({
      page: pagination.current,
      page_size: pagination.pageSize,
      search: search.value,
      status: status.value,
      provider_id: providerId.value,
    })
    if (g !== generation) return
    if (pagination.current > Math.max(1, result.total_pages)) {
      pagination.current = Math.max(1, result.total_pages)
      await load()
      return
    }
    items.value = result.items
    pagination.total = result.total
    selected.value = []
  } finally {
    if (g === generation) loading.value = false
  }
}
async function loadAll() {
  const first = await accessApi.providers({ page: 1, page_size: 100 })
  const all = [...first.items]
  for (let page = 2; page <= first.total_pages; page++)
    all.push(...(await accessApi.providers({ page, page_size: 100 })).items)
  providers.value = all
  modelTotal.value = (await accessApi.models({ page: 1, page_size: 1 })).total
  await load()
}
async function refreshAfterTest() {
  await loadAll()
  await detailRef.value?.refresh()
}
function selectProvider(id: string) {
  providerId.value = id
  pagination.current = 1
  void load()
}
function reset() {
  search.value = ''
  status.value = ''
  pagination.current = 1
  void load()
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
function test(model: Model, purpose: 'ADMISSION' | 'HEALTH', run?: TestRun) {
  testModel.value = model
  testPurpose.value = purpose
  historyRun.value = run
}
function action(model: Model, target: Status | 'DELETE', label: string) {
  pending.value = { model, target, label }
  reason.value = ''
}
async function confirmAction() {
  if (!pending.value) return
  if (!reason.value.trim()) {
    MessagePlugin.warning(t('ma.reasonRequired'))
    return
  }
  mutating.value = true
  try {
    const p = pending.value
    if (p.target === 'DELETE') await accessApi.removeModel(p.model.id, reason.value)
    else await accessApi.status(p.model.id, p.target, reason.value)
    if (p.target === 'DELETE' && detailId.value === p.model.id) detailId.value = ''
    pending.value = undefined
    await loadAll()
    await detailRef.value?.refresh()
  } finally {
    mutating.value = false
  }
}
watch([search, status], () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.current = 1
    void load()
  }, 250)
})
onMounted(loadAll)
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
</script>
<style scoped src="../access/access.css"></style>
