<template>
  <t-card :bordered="false" class="managed-key-panel">
    <FilterBar>
      <template #content>
        <div class="key-filters">
          <t-input
            v-model="filters.search"
            autocomplete="off"
            name="managed-key-filter"
            class="managed-key-search"
            clearable
            :maxlength="128"
            :placeholder="t('managedKeys.search')"
            :disabled="busy"
          />
          <t-select
            v-model="filters.status"
            class="managed-key-status"
            :options="statusOptions"
            :disabled="busy"
          />
          <t-select
            v-model="filters.control"
            class="managed-key-access"
            :options="accessOptions"
            :disabled="busy"
          />
          <DepartmentTreeSelect
            v-model="filters.department"
            ref="departmentFilter"
            :placeholder="t('managedKeys.allDepartments')"
            :resolve-descendants="false"
            class="managed-key-department"
            :disabled="busy"
          />
          <t-button variant="base" theme="default" :disabled="busy" @click="resetFilters">{{
            t('managedKeys.reset')
          }}</t-button>
        </div>
      </template>
    </FilterBar>
    <t-space class="key-toolbar" align="center">
      <t-button
        v-permission.write="'identity.keys'"
        variant="outline"
        :disabled="loading || busy || !selectedItems.some((row) => row.status !== 'ACTIVE')"
        @click="openOperation('enable')"
        >{{ t('managedKeys.enable') }}</t-button
      >
      <t-button
        v-permission.write="'identity.keys'"
        variant="outline"
        :disabled="loading || busy || !selectedItems.some((row) => row.status === 'ACTIVE')"
        @click="openOperation('disable')"
        >{{ t('managedKeys.disable') }}</t-button
      >
      <t-button
        v-permission.write="'identity.keys'"
        variant="outline"
        theme="danger"
        :disabled="loading || busy || !selectedKeys.length"
        @click="openOperation('delete')"
        >{{ t('myKeys.delete') }}</t-button
      >
      <span>{{ t('common.selected', { n: selectedKeys.length }) }}</span>
      <t-button v-if="selectedKeys.length" variant="text" size="small" @click="clearSelection">
        {{ t('common.clearSelection') }}
      </t-button>
    </t-space>
    <t-table
      height="var(--stable-table-height)"
      row-key="id"
      table-layout="fixed"
      table-content-width="max(100%, var(--managed-key-table-width))"
      :data="items"
      :columns="columns"
      :loading="loading"
      :selected-row-keys="selectedKeys"
      :disable-data-page="true"
      :empty="listFailed ? t('common.loadFailed') : t('managedKeys.empty')"
      @select-change="selectRows"
    >
      <template #id="{ row }"
        ><code>{{ row.id }}</code></template
      >
      <template #masked_value="{ row }"
        ><t-tooltip :content="t('myKeys.maskedHint')"
          ><code>{{ row.masked_value }}</code></t-tooltip
        ></template
      >
      <template #name="{ row }"
        ><t-tooltip :content="row.name"
          ><span class="key-ellipsis">{{ row.name }}</span></t-tooltip
        ></template
      >
      <template #user="{ row }">
        <t-link
          v-if="canReadUsers"
          theme="primary"
          :href="router.resolve({ path: '/identity/users', query: { user: row.user_id } }).href"
          >{{ row.user_display_name || row.username }}</t-link
        >
        <span v-else>{{ row.user_display_name || row.username }}</span>
      </template>
      <template #department="{ row }">{{
        row.department_display_name || row.department_name || '—'
      }}</template>
      <template #status="{ row }"
        ><t-tag variant="light" :theme="row.status === 'ACTIVE' ? 'success' : 'default'">{{
          t(row.status === 'ACTIVE' ? 'myKeys.active' : 'myKeys.disabled')
        }}</t-tag></template
      >
      <template #access="{ row }">
        <component
          :is="accessState(row).reasons.length ? Tooltip : 'div'"
          v-bind="
            accessState(row).reasons.length
              ? {
                  content: accessState(row)
                    .reasons.map((reason) => reason.text)
                    .join(' · '),
                }
              : {}
          "
        >
          <div class="key-access-cell">
            <span :class="['key-access', accessState(row).tone]">{{ accessState(row).text }}</span>
            <div v-if="accessState(row).reasons.length" class="key-access-reasons">
              <t-tag
                v-for="reason in accessState(row).reasons"
                :key="reason.code"
                variant="light"
                :theme="reason.theme"
                >{{ reason.text }}</t-tag
              >
            </div>
          </div>
        </component>
      </template>
      <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
      <template #last_used_at="{ row }">{{
        row.last_used_at ? formatDateTime(row.last_used_at) : '—'
      }}</template>
      <template #last_used_ip="{ row }">{{ row.last_used_ip || '—' }}</template>
      <template #action="{ row }"
        ><t-space>
          <t-link
            v-permission.write="'identity.keys'"
            theme="primary"
            :disabled="busy || loading"
            @click="openOperation(row.status === 'ACTIVE' ? 'disable' : 'enable', row)"
            >{{ t(row.status === 'ACTIVE' ? 'managedKeys.disable' : 'managedKeys.enable') }}</t-link
          >
          <t-link
            v-permission.write="'identity.keys'"
            theme="danger"
            :disabled="busy || loading"
            @click="openOperation('delete', row)"
            >{{ t('myKeys.delete') }}</t-link
          >
        </t-space></template
      >
    </t-table>
    <div class="key-pagination">
      <t-pagination
        :class="{ 'stable-pagination--pending': (loading || listFailed) && !items.length }"
        :current="page"
        :page-size="pageSize"
        :total="paginationTotal"
        :page-size-options="[10, 20, 50]"
        show-jumper
        :show-total="false"
        :disabled="loading || busy"
        @change="changePage"
      />
    </div>
  </t-card>
  <t-dialog
    :visible="confirmVisible"
    :header="dialogTitle"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!busy"
    :close-btn="!busy"
    :confirm-btn="{ content: t('myKeys.confirm'), theme: 'danger', loading: busy }"
    :cancel-btn="{ content: t('common.cancel'), disabled: busy }"
    @confirm="submitOperation()"
    @close="closeConfirm"
  >
    <p>{{ dialogContent }}</p>
  </t-dialog>
</template>

<script setup lang="ts">
import { usePageSelection } from '@/utils/usePageSelection'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  MessagePlugin,
  Tooltip,
  type PageInfo,
  type PrimaryTableCol,
  type TagProps,
} from 'tdesign-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import {
  getManagedKeysApi,
  enableManagedKeyApi,
  disableManagedKeyApi,
  deleteManagedKeyApi,
  batchDeleteManagedKeysApi,
  batchDisableManagedKeysApi,
  batchEnableManagedKeysApi,
  type ManagedKeyItem,
  type KeyControlCondition,
} from '@/api/modules/apiKeys'
import { getTermsConfigApi } from '@/api/modules/terms'
import { createIdempotencyKey, type NotifiedError } from '@/api/request'
import { useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'

const { t, locale } = useI18n()
const router = useRouter()
const userStore = useUserStore()
const canReadUsers = computed(() => userStore.permissions.includes('identity.users'))
const filters = reactive({ search: '', status: '', control: '', department: '' })
const items = ref<ManagedKeyItem[]>([])
const {
  selectedKeys,
  selectedItems,
  selectRows: updateSelection,
  clearSelection,
} = usePageSelection(items)
const loading = ref(true)
const listFailed = ref(false)
const page = ref(1)
const pageSize = ref(20)
const paginationTotal = ref(0)
let listRequest = 0
let optionRequest = 0
let disposed = false
const departmentFilter = ref<InstanceType<typeof DepartmentTreeSelect>>()
const requireAcceptance = ref(false)
const statusOptions = computed(() => [
  { label: t('managedKeys.allStatuses'), value: '' },
  { label: t('myKeys.active'), value: 'ACTIVE' },
  { label: t('myKeys.disabled'), value: 'DISABLED' },
])
const accessOptions = computed(() => [
  { label: t('managedKeys.allAccess'), value: '' },
  { label: t('managedKeys.allowed'), value: 'BASIC_CONDITIONS_MET' },
  { label: t('managedKeys.userDisabled'), value: 'USER_DISABLED' },
  ...(requireAcceptance.value
    ? [{ label: t('managedKeys.termsRequired'), value: 'TERMS_REQUIRED' }]
    : []),
  { label: t('managedKeys.keyDisabled'), value: 'KEY_DISABLED' },
])
const columns = computed<PrimaryTableCol<ManagedKeyItem>[]>(() => [
  {
    colKey: 'row-select',
    type: 'multiple',
    width: 48,
    fixed: 'left',
    disabled: () => busy.value || loading.value,
  },
  { colKey: 'id', title: t('myKeys.id'), width: 150 },
  { colKey: 'masked_value', title: t('myKeys.masked'), width: 160 },
  { colKey: 'name', title: t('managedKeys.name'), width: 'auto' },
  { colKey: 'user', title: t('managedKeys.user'), width: 150 },
  { colKey: 'department', title: t('managedKeys.department'), width: 140 },
  { colKey: 'status', title: t('managedKeys.status'), width: 110 },
  { colKey: 'access', title: t('managedKeys.access'), width: 200 },
  { colKey: 'created_at', title: t('myKeys.createdAt'), width: 180 },
  { colKey: 'last_used_at', title: t('myKeys.lastUsed'), width: 180 },
  { colKey: 'last_used_ip', title: t('managedKeys.lastIp'), width: 140 },
  { colKey: 'action', title: t('myKeys.action'), width: 110, fixed: 'right' },
])
function accessState(row: ManagedKeyItem) {
  const allowed = row.control_condition === 'BASIC_CONDITIONS_MET' && !row.control_reasons.length
  const codes = new Set(row.control_reasons.filter(Boolean))
  const labels = new Map([
    ['USER_DISABLED', t('managedKeys.userDisabled')],
    ['TERMS_REQUIRED', t('managedKeys.termsRequired')],
    ['KEY_DISABLED', t('managedKeys.keyDisabled')],
  ])
  const themes = new Map<string, TagProps['theme']>([
    ['USER_DISABLED', 'danger'],
    ['TERMS_REQUIRED', 'warning'],
    ['KEY_DISABLED', 'default'],
  ])
  const reasons = Array.from(codes, (code) => ({
    code,
    text: labels.get(code) ?? code,
    theme: themes.get(code) ?? 'primary',
  }))
  return {
    text: t(allowed ? 'managedKeys.allowed' : 'managedKeys.forbidden'),
    tone: allowed ? 'success' : 'error',
    reasons,
  }
}
function showError(error: unknown) {
  if (!(error as NotifiedError).notified)
    MessagePlugin.error((error as Error).message || t('authErrors.fallback'))
}
function resetPage() {
  page.value = 1
}
function selectRows(keys: Array<string | number>) {
  updateSelection(keys)
}
async function fetchList(): Promise<void> {
  if (disposed) return
  const current = latestList.begin()
  const requestId = ++listRequest
  loading.value = true
  listFailed.value = false
  try {
    const result = await getManagedKeysApi(
      {
        search: filters.search.trim() || undefined,
        status: (filters.status || undefined) as 'ACTIVE' | 'DISABLED' | undefined,
        control_condition: (filters.control || undefined) as KeyControlCondition | undefined,
        department_id: filters.department || undefined,
        page: page.value,
        page_size: pageSize.value,
      },
      { signal: current.signal },
    )
    if (!current.isCurrent() || disposed || requestId !== listRequest) return
    paginationTotal.value = result.total
    pageSize.value = result.page_size
    const lastPage = Math.max(1, result.total_pages)
    if (result.page > lastPage) {
      page.value = lastPage
      await fetchList()
      return
    }
    page.value = result.page
    items.value = result.items
  } catch (error) {
    if (!current.isCurrent() || disposed || requestId !== listRequest) return
    listFailed.value = true
    items.value = []
    paginationTotal.value = 0
    showError(error)
  } finally {
    if (current.isCurrent() && requestId === listRequest) loading.value = false
  }
}
function changePage(info: PageInfo) {
  if (loading.value || busy.value) return
  const nextPageSize = Math.min(100, Math.max(1, info.pageSize))
  if (nextPageSize !== pageSize.value) {
    pageSize.value = nextPageSize
    resetPage()
  } else {
    page.value = info.current
  }
  void fetchList()
}
function resetFilters() {
  departmentFilter.value?.reset()
  Object.assign(filters, { search: '', status: '', control: '', department: '' })
}
const latestList = useLatestRequest()
watch(
  () => filters.search,
  () => {
    clearSelection()
    resetPage()
    loading.value = true
    latestList.schedule(() => void fetchList())
  },
)
watch([() => filters.status, () => filters.control, () => filters.department, locale], () => {
  clearSelection()
  resetPage()
  // Coalesce a reset that changes both text and select filters.
  latestList.schedule(() => void fetchList(), 0)
})
async function loadOptions() {
  const requestId = ++optionRequest
  try {
    const result = await getTermsConfigApi()
    if (disposed || requestId !== optionRequest) return
    requireAcceptance.value = result.mandatory_confirmation
  } catch (error) {
    if (disposed || requestId !== optionRequest) return
    requireAcceptance.value = false
    showError(error)
  }
}
watch(locale, () => void loadOptions())

type Operation = 'enable' | 'disable' | 'delete'
interface Attempt {
  key: string
  id?: string
  operation: Operation
  body: { key_ids?: string[] }
}
const operation = ref<Operation>('disable')
const targets = ref<ManagedKeyItem[]>([])
const batch = ref(false)
const confirmVisible = ref(false)
const busy = ref(false)
const dialogTitle = computed(() => t(`managedKeys.${operation.value}Title`))
const dialogContent = computed(() =>
  batch.value
    ? t(
        operation.value === 'delete'
          ? 'managedKeys.batchDeleteContent'
          : 'managedKeys.batchContent',
        { action: t(`managedKeys.${operation.value}`), n: targets.value.length },
      )
    : t(`managedKeys.${operation.value}Content`, {
        name: targets.value[0]?.name,
        id: targets.value[0]?.id,
      }),
)
let pendingAttempt: Attempt | null = null
function openOperation(action: Operation, row?: ManagedKeyItem) {
  if (busy.value || loading.value || !userStore.permissions.includes('identity.keys:write')) return
  operation.value = action
  batch.value = !row
  targets.value = row
    ? [row]
    : selectedItems.value.filter(
        (item) =>
          action === 'delete' ||
          (action === 'enable' ? item.status !== 'ACTIVE' : item.status === 'ACTIVE'),
      )
  if (targets.value.length > 100) {
    MessagePlugin.warning(t('common.selectionLimit', { n: 100 }))
    return
  }
  if (!targets.value.length) return
  pendingAttempt = null
  confirmVisible.value = true
}
function closeConfirm() {
  if (!busy.value) {
    confirmVisible.value = false
  }
}
function prepareAttempt(): Attempt | null {
  if (!targets.value.length) return null
  const action = operation.value
  const atomicBatch = batch.value
  const keyIds = targets.value.map((row) => row.id)
  const id = atomicBatch ? undefined : keyIds[0]!
  const body = { ...(atomicBatch ? { key_ids: keyIds } : {}) }
  if (!pendingAttempt) pendingAttempt = { id, operation: action, body, key: createIdempotencyKey() }
  return pendingAttempt
}
function callAttempt(attempt: Attempt) {
  if (attempt.id === undefined) {
    const body = { key_ids: attempt.body.key_ids! }
    return attempt.operation === 'delete'
      ? batchDeleteManagedKeysApi(body, attempt.key)
      : attempt.operation === 'enable'
        ? batchEnableManagedKeysApi(body, attempt.key)
        : batchDisableManagedKeysApi(body, attempt.key)
  }
  const api =
    attempt.operation === 'enable'
      ? enableManagedKeyApi
      : attempt.operation === 'disable'
        ? disableManagedKeyApi
        : deleteManagedKeyApi
  return api(attempt.id, attempt.body, attempt.key)
}
async function finishOperation() {
  pendingAttempt = null
  confirmVisible.value = false
  clearSelection()
  MessagePlugin.success(t('managedKeys.success'))
  await fetchList()
}
async function submitOperation() {
  if (busy.value || disposed || !userStore.permissions.includes('identity.keys:write')) return
  const attempt = prepareAttempt()
  if (!attempt) return
  busy.value = true
  try {
    await callAttempt(attempt)
    if (!disposed) await finishOperation()
  } catch (error) {
    if (!disposed) showError(error)
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void fetchList()
  void loadOptions()
})
onBeforeUnmount(() => {
  disposed = true
  ++listRequest
  ++optionRequest
})
</script>

<style scoped>
:deep(.filter-bar) {
  margin-bottom: var(--td-comp-margin-m);
}
:deep(.filter-bar .t-card__body) {
  padding: 0;
}
.key-filters {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.key-filters > * {
  max-width: 100%;
}
.key-toolbar {
  margin-bottom: var(--td-comp-margin-m);
}
.key-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--td-comp-margin-m);
}
.key-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
code {
  white-space: nowrap;
  font-size: var(--td-font-size-body-medium);
}
.key-access.error {
  color: var(--td-error-color);
}
.key-access.success {
  color: var(--td-success-color);
}
.key-access-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: var(--td-comp-margin-xs);
  white-space: normal;
}
.key-access-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--td-comp-margin-xs);
}
.key-access-reasons :deep(.t-tag) {
  max-width: 100%;
  height: auto;
  white-space: normal;
  overflow-wrap: anywhere;
}
.key-access-reasons :deep(.t-tag__text) {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
