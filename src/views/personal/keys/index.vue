<template>
  <t-card :bordered="false" class="personal-key-panel">
    <div class="key-toolbar">
      <t-space align="center">
        <t-button
          v-permission.write="'personal.keys'"
          :disabled="loading || !statsReady || atLimit"
          @click="openName()"
          >{{ t('myKeys.create') }}</t-button
        >
        <span v-if="atLimit">{{ t('myKeys.limit', { n: activeLimit }) }}</span>
      </t-space>
      <t-input
        v-model="search"
        name="personal-key-filter"
        autocomplete="off"
        class="key-search"
        clearable
        :placeholder="t('myKeys.search')"
      />
    </div>
    <t-table
      row-key="id"
      table-layout="fixed"
      :max-height="560"
      :data="items"
      :columns="columns"
      :loading="loading"
      :empty="t('myKeys.empty')"
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
      <template #status="{ row }"
        ><t-tag variant="light" :theme="row.status === 'ACTIVE' ? 'success' : 'default'">{{
          t(row.status === 'ACTIVE' ? 'myKeys.active' : 'myKeys.disabled')
        }}</t-tag></template
      >
      <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
      <template #last_used_at="{ row }">{{
        row.last_used_at ? formatDateTime(row.last_used_at) : '—'
      }}</template>
      <template #action="{ row }"
        ><t-space>
          <t-link v-permission.write="'personal.keys'" theme="primary" @click="openName(row)">{{
            t('myKeys.edit')
          }}</t-link>
          <t-link v-permission.write="'personal.keys'" theme="danger" @click="openDelete(row)">{{
            t('myKeys.delete')
          }}</t-link>
        </t-space></template
      >
    </t-table>
    <div class="key-pagination">
      <t-pagination
        :current="page"
        :page-size="pageSize"
        :total="paginationTotal"
        :page-size-options="[10, 20, 50]"
        show-jumper
        :show-total="false"
        :disabled="loading"
        @change="changePage"
      />
    </div>
  </t-card>
  <t-dialog
    :visible="nameVisible"
    :header="t(editing ? 'myKeys.editTitle' : 'myKeys.create')"
    :footer="false"
    :close-on-overlay-click="false"
    :close-btn="!saving"
    :close-on-esc-keydown="!saving"
    @close="closeName"
  >
    <t-form :data="nameForm" label-align="top" @submit="saveName">
      <t-alert v-if="nameError" theme="error" :message="nameError" />
      <t-form-item :label="t('myKeys.name')" required
        ><t-input
          v-if="nameVisible"
          v-model="nameForm.name"
          autofocus
          :maxlength="60"
          :disabled="saving"
          :placeholder="t(editing ? 'myKeys.nameRequired' : 'myKeys.nameExample')"
      /></t-form-item>
      <div class="key-dialog-actions">
        <t-button variant="outline" theme="default" :disabled="saving" @click="closeName">{{
          t('common.cancel')
        }}</t-button
        ><t-button type="submit" :loading="saving">{{
          t(editing ? 'myKeys.save' : 'myKeys.createAction')
        }}</t-button>
      </div>
    </t-form>
  </t-dialog>
  <t-dialog
    :visible="secretVisible"
    :header="t('myKeys.created')"
    :close-on-overlay-click="false"
    :confirm-btn="t('myKeys.done')"
    :cancel-btn="null"
    @confirm="closeSecret"
    @close="closeSecret"
  >
    <t-alert
      theme="warning"
      :message="t(plaintext ? 'myKeys.secretWarning' : 'myKeys.secretUnavailable')"
    />
    <div v-if="plaintext" class="key-secret">
      <t-input :value="plaintext" readonly /><t-button variant="outline" @click="copySecret">{{
        t('myKeys.copy')
      }}</t-button>
    </div>
  </t-dialog>
  <t-dialog
    :visible="deleteVisible"
    :header="t('myKeys.deleteTitle')"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!deleting"
    :close-btn="!deleting"
    :confirm-btn="{ content: t('myKeys.confirm'), theme: 'danger', loading: deleting }"
    :cancel-btn="{ content: t('common.cancel'), disabled: deleting }"
    @confirm="remove()"
    @close="closeDelete"
  >
    <p>{{ t('myKeys.deleteContent', { name: selected?.name, id: selected?.id }) }}</p>
    <t-form :data="deleteForm" label-align="top"
      ><t-form-item
        :label="t('myKeys.reason')"
        required
        :help="reasonError"
        :status="reasonError ? 'error' : undefined"
        ><t-textarea
          v-model="deleteForm.reason"
          :maxlength="200"
          :disabled="deleting"
          :placeholder="t('myKeys.reasonPlaceholder')" /></t-form-item
    ></t-form>
  </t-dialog>
  <t-dialog
    lazy
    destroy-on-close
    :visible="reauthVisible"
    :header="t('users.reauth.title')"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!deleting"
    :close-btn="!deleting"
    :confirm-btn="{
      content: t('common.confirm'),
      disabled: !password || deleting,
      loading: deleting,
    }"
    :cancel-btn="{ content: t('common.cancel'), disabled: deleting }"
    @confirm="confirmReauth"
    @close="closeReauth"
  >
    <p>{{ t('users.reauth.content') }}</p>
    <t-input
      v-model="password"
      type="password"
      autocomplete="current-password"
      name="personal-key-reauth"
      :placeholder="t('users.reauth.password')"
      :disabled="deleting"
    />
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PageInfo, type PrimaryTableCol } from 'tdesign-vue-next'
import {
  getMyKeysApi,
  createMyKeyApi,
  updateMyKeyApi,
  deleteMyKeyApi,
  type ApiKeyItem,
} from '@/api/modules/apiKeys'
import { reauthApi, type ReauthIntent } from '@/api/modules/auth'
import type { NotifiedError } from '@/api/request'
import { formatDateTime } from '@/utils/datetime'

const { t, locale } = useI18n()
const items = ref<ApiKeyItem[]>([])
const search = ref('')
const loading = ref(false)
const statsReady = ref(false)
const activeCount = ref(0)
const activeLimit = ref(0)
const atLimit = computed(() => statsReady.value && activeCount.value >= activeLimit.value)
const page = ref(1)
const pageSize = ref(20)
const paginationTotal = ref(0)
let listRequest = 0
let disposed = false
function idempotencyKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}
const columns = computed<PrimaryTableCol<ApiKeyItem>[]>(() => [
  { colKey: 'id', title: t('myKeys.id'), width: 260 },
  { colKey: 'masked_value', title: t('myKeys.masked'), width: 240 },
  { colKey: 'name', title: t('myKeys.name'), width: 220 },
  { colKey: 'status', title: t('myKeys.status'), width: 110 },
  { colKey: 'created_at', title: t('myKeys.createdAt'), width: 190 },
  { colKey: 'last_used_at', title: t('myKeys.lastUsed'), width: 190 },
  { colKey: 'action', title: t('myKeys.action'), width: 120, fixed: 'right' },
])
function showError(error: unknown) {
  if (!(error as NotifiedError).notified)
    MessagePlugin.error((error as Error).message || t('authErrors.fallback'))
}
function resetPage() {
  page.value = 1
}
async function fetchList(): Promise<void> {
  if (disposed) return
  const requestId = ++listRequest
  loading.value = true
  try {
    const result = await getMyKeysApi({
      search: search.value.trim() || undefined,
      page: page.value,
      page_size: pageSize.value,
    })
    if (disposed || requestId !== listRequest) return
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
    activeCount.value = result.active_count
    activeLimit.value = result.active_limit
    statsReady.value = true
  } catch (error) {
    if (disposed || requestId !== listRequest) return
    items.value = []
    paginationTotal.value = 0
    showError(error)
  } finally {
    if (requestId === listRequest) loading.value = false
  }
}
function changePage(info: PageInfo) {
  if (loading.value) return
  const nextPageSize = Math.min(100, Math.max(1, info.pageSize))
  if (nextPageSize !== pageSize.value) {
    pageSize.value = nextPageSize
    resetPage()
  } else {
    page.value = info.current
  }
  void fetchList()
}
watch([search, locale], () => {
  resetPage()
  void fetchList()
})
const nameVisible = ref(false)
const editing = ref<ApiKeyItem | null>(null)
const nameForm = reactive({ name: '' })
const nameError = ref('')
const saving = ref(false)
let nameAttempt: { name: string; key: string } | null = null
function openName(row?: ApiKeyItem) {
  editing.value = row || null
  nameForm.name = row?.name || ''
  nameError.value = ''
  nameAttempt = null
  nameVisible.value = true
}
function closeName() {
  if (!saving.value) nameVisible.value = false
}
const secretVisible = ref(false)
const plaintext = ref('')
function closeSecret() {
  secretVisible.value = false
  plaintext.value = ''
}
async function copySecret() {
  try {
    await navigator.clipboard.writeText(plaintext.value)
    MessagePlugin.success(t('myKeys.copied'))
  } catch {
    MessagePlugin.error(t('myKeys.copyFailed'))
  }
}
async function saveName() {
  if (saving.value) return
  const name = nameForm.name.trim()
  if (!name) {
    nameError.value = t('myKeys.nameRequired')
    return
  }
  if (name.length > 60) return
  if (!nameAttempt || nameAttempt.name !== name) nameAttempt = { name, key: idempotencyKey() }
  saving.value = true
  nameError.value = ''
  try {
    if (editing.value) {
      await updateMyKeyApi(editing.value.id, { name }, nameAttempt.key)
      MessagePlugin.success(t('myKeys.updated'))
    } else {
      const result = await createMyKeyApi({ name }, nameAttempt.key)
      if (disposed) return
      plaintext.value = result.secret_available && result.plaintext ? result.plaintext : ''
      secretVisible.value = true
      MessagePlugin.success(t('myKeys.created'))
    }
    nameVisible.value = false
    nameAttempt = null
    await fetchList()
  } catch (error) {
    nameError.value = (error as Error).message
    // 请求层负责接口错误 toast，弹窗保留错误以供修正。
    if (!(error as NotifiedError).notified) showError(error)
    if ((error as NotifiedError).status) nameAttempt = null
    if ((error as NotifiedError).code === 'KEY_LIMIT_EXCEEDED') await fetchList()
  } finally {
    saving.value = false
  }
}
const selected = ref<ApiKeyItem | null>(null)
const deleteVisible = ref(false)
const deleteForm = reactive({ reason: '' })
const reasonError = ref('')
const deleting = ref(false)
const reauthVisible = ref(false)
const password = ref('')
let settleReauthPassword: ((password: string | null) => void) | null = null
function openDelete(row: ApiKeyItem) {
  if (disposed || deleting.value || settleReauthPassword) return
  selected.value = row
  deleteForm.reason = ''
  reasonError.value = ''
  deleteVisible.value = true
}
function closeDelete() {
  if (!deleting.value) {
    deleteVisible.value = false
  }
}
function askReauthPassword(): Promise<string | null> {
  password.value = ''
  deleteVisible.value = false
  reauthVisible.value = true
  return new Promise((resolve) => {
    settleReauthPassword = resolve
  })
}
function finishReauth(value: string | null) {
  reauthVisible.value = false
  password.value = ''
  settleReauthPassword?.(value)
  settleReauthPassword = null
}
function confirmReauth() {
  if (password.value && !deleting.value) finishReauth(password.value)
}
function closeReauth() {
  if (!deleting.value) {
    finishReauth(null)
    deleteVisible.value = true
  }
}
async function remove() {
  if (disposed || deleting.value || settleReauthPassword || !selected.value) return
  const reason = deleteForm.reason.trim()
  if (!reason) {
    reasonError.value = t('myKeys.reasonRequired')
    return
  }
  if (reason.length > 200) return
  const id = selected.value.id
  const body = { reason }
  const attempt = {
    id,
    body,
    key: idempotencyKey(),
    intent: { operation_id: 'deleteMyKey', path: { key_id: id }, body } satisfies ReauthIntent,
  }
  const currentPassword = await askReauthPassword()
  if (currentPassword === null || disposed) return
  deleting.value = true
  try {
    const { proof_token } = await reauthApi({ password: currentPassword, intent: attempt.intent })
    if (disposed) return
    await deleteMyKeyApi(attempt.id, attempt.body, attempt.key, proof_token)
    if (disposed) return
    deleteVisible.value = false
    MessagePlugin.success(t('myKeys.deleted'))
    await fetchList()
  } catch (error) {
    if (!disposed) showError(error)
  } finally {
    deleting.value = false
  }
}
onMounted(() => void fetchList())
onBeforeUnmount(() => {
  disposed = true
  ++listRequest
  closeSecret()
  finishReauth(null)
})
</script>

<style scoped>
.key-toolbar,
.key-pagination,
.key-secret,
.key-dialog-actions {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-m);
}
.key-toolbar {
  justify-content: space-between;
}
.key-pagination {
  justify-content: flex-end;
}
.key-toolbar {
  margin-bottom: var(--td-comp-margin-m);
}
.key-pagination,
.key-secret,
.key-dialog-actions {
  margin-top: var(--td-comp-margin-m);
}
.key-dialog-actions {
  justify-content: flex-end;
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
.key-secret :deep(.t-input__wrap) {
  flex: 1;
  min-width: 0;
}
</style>
