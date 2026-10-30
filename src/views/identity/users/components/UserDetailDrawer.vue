<template>
  <t-drawer
    :visible="visible"
    :header="t('users.detail.title')"
    size="760px"
    destroy-on-close
    :footer="false"
    @close="onClose"
  >
    <t-skeleton v-if="loading" :rows="8" animation="gradient" />
    <template v-else-if="detail">
      <div class="profile-heading">
        <t-avatar size="56px">{{ avatarText }}</t-avatar>
        <div>
          <h2>{{ detail.display_name }}</h2>
          <p>
            {{ detail.username }}
            <span class="dot-separator">·</span>
            {{ detail.department?.display_name ?? '—' }}
          </p>
        </div>
        <t-tag :theme="detail.status === 'ACTIVE' ? 'success' : 'default'" variant="light">
          {{ detail.status === 'ACTIVE' ? t('users.statusEnabled') : t('users.statusDisabled') }}
        </t-tag>
      </div>

      <t-tabs v-model="activeTab">
        <t-tab-panel value="basic" :label="t('users.detail.tabs.basic')">
          <dl class="detail-grid">
            <dt>{{ t('users.detail.username') }}</dt>
            <dd>{{ detail.username }}</dd>

            <dt>{{ t('users.detail.email') }}</dt>
            <dd>
              <span :class="{ 'detail-empty-value': !detail.email }">{{
                detail.email || '—'
              }}</span>
            </dd>

            <dt>{{ t('users.detail.phone') }}</dt>
            <dd>
              <span :class="{ 'detail-empty-value': !detail.phone }">{{
                detail.phone || '—'
              }}</span>
            </dd>

            <dt>{{ t('users.detail.department') }}</dt>
            <dd>
              <span :class="{ 'detail-empty-value': !detail.department }">
                {{ detail.department?.display_name ?? '—' }}
              </span>
            </dd>

            <dt>{{ t('users.detail.role') }}</dt>
            <dd>
              <span :class="{ 'detail-empty-value': !detail.role }">
                {{ detail.role?.display_name ?? '—' }}
              </span>
            </dd>

            <dt>{{ t('users.detail.groups') }}</dt>
            <dd>{{ groupNames || t('users.detail.noGroups') }}</dd>

            <dt>{{ t('users.detail.createdAt') }}</dt>
            <dd>{{ formatDateTime(detail.created_at) || '—' }}</dd>

            <dt>{{ t('users.detail.lastLogin') }}</dt>
            <dd>
              <span :class="{ 'detail-empty-value': !detail.last_login_at }">
                {{ formatDateTime(detail.last_login_at) || t('users.detail.neverLogin') }}
              </span>
            </dd>

            <dt>{{ t('users.detail.passwordStatus') }}</dt>
            <dd>
              {{
                detail.must_change_password
                  ? t('users.detail.passwordMustChange')
                  : t('users.detail.passwordNormal')
              }}
            </dd>

            <dt>{{ t('users.detail.terms') }}</dt>
            <template v-if="termsState === 'accepted'">
              <dd class="terms-banner">
                <t-alert theme="success" :message="t('users.detail.termsBannerAccepted')" />
              </dd>
              <template v-if="currentAcceptance">
                <dt>{{ t('terms.records.columns.acceptedAt') }}</dt>
                <dd>{{ formatDateTime(currentAcceptance.accepted_at) }}</dd>
                <template v-if="termsVersionIp">
                  <dt>{{ t('users.detail.termsVersionIp') }}</dt>
                  <dd>{{ termsVersionIp }}</dd>
                </template>
              </template>
            </template>
            <dd v-else-if="termsState === 'notNone'" class="terms-banner">
              <t-alert theme="warning" :message="t('users.detail.termsBannerNotAccepted')" />
              <div v-if="lastAcceptance" class="detail-empty-value">
                {{
                  t('users.detail.termsLastAccepted', {
                    version: lastAcceptance.terms_version,
                    time: formatDateTime(lastAcceptance.accepted_at),
                  })
                }}
              </div>
            </dd>
            <dd v-else-if="termsState === 'notApplicable'" class="terms-banner">
              <t-alert theme="info" :message="t('users.detail.termsBannerNotApplicable')" />
            </dd>
            <dd v-else>
              <span class="detail-empty-value">
                {{ termsState === 'unavailable' ? t('users.detail.termsUnavailable') : '—' }}
              </span>
            </dd>
          </dl>
        </t-tab-panel>

        <t-tab-panel value="models" :label="t('users.detail.tabs.models', { n: modelRows.length })">
          <div v-if="canWriteUsers" class="model-toolbar">
            <t-select
              v-model="selectedModelIds"
              multiple
              filterable
              :input-props="{ name: 'user-model-filter', autocomplete: 'off' }"
              clearable
              class="model-select"
              :disabled="grantDialog.loading"
              :placeholder="t('users.detail.models.selectPlaceholder')"
              :options="modelSelectOptions"
            />
            <t-button
              v-if="canWriteUsers"
              theme="primary"
              variant="outline"
              :disabled="!grantsReady || !selectedModelIds.length || grantDialog.loading"
              @click="openAddGrant"
            >
              {{ t('users.detail.models.addDirect') }}
            </t-button>
          </div>
          <t-table
            row-key="id"
            :data="modelRows"
            :columns="modelColumns"
            hover
            table-layout="fixed"
            :max-height="460"
            :empty="t('users.detail.models.empty')"
          >
            <template #name="{ row }">
              <t-tooltip :content="row.name">
                <span class="cell-ellipsis">{{ row.name }}</span>
              </t-tooltip>
            </template>
            <template #provider>—</template>
            <template #sources="{ row }">
              <t-tooltip :content="row.sources">
                <span class="cell-ellipsis">{{ row.sources }}</span>
              </t-tooltip>
            </template>
            <template #actions="{ row }">
              <t-link
                v-if="directModelIds.has(row.id)"
                theme="danger"
                hover="color"
                @click="openRemoveGrant(row)"
              >
                {{ t('users.detail.models.removeDirect') }}
              </t-link>
              <span v-else class="detail-empty-value">—</span>
            </template>
          </t-table>
        </t-tab-panel>

        <t-tab-panel
          v-if="canViewKeys"
          value="keys"
          :label="t('users.detail.tabs.keys', { n: keyTotal })"
        >
          <t-alert
            v-if="detail.status !== 'ACTIVE'"
            class="key-disabled-alert"
            theme="warning"
            :message="t('users.detail.keys.userDisabled')"
          />
          <div class="key-toolbar">
            <div v-if="canWriteKeys" class="key-actions">
              <span>{{ t('common.selected', { n: selectedKeyIds.length }) }}</span>
              <t-button
                v-if="selectedKeyIds.length"
                variant="text"
                size="small"
                @click="clearSelection"
              >
                {{ t('common.clearSelection') }}
              </t-button>
              <t-button
                variant="outline"
                :disabled="
                  keysLoading ||
                  loading ||
                  keyBusy ||
                  !selectedKeyItems.some((item) => item.status !== 'ACTIVE')
                "
                @click="openKeyOperation('enable')"
                >{{ t('managedKeys.enable') }}</t-button
              >
              <t-button
                variant="outline"
                :disabled="
                  keysLoading ||
                  loading ||
                  keyBusy ||
                  !selectedKeyItems.some((item) => item.status === 'ACTIVE')
                "
                @click="openKeyOperation('disable')"
                >{{ t('managedKeys.disable') }}</t-button
              >
              <t-button
                variant="outline"
                theme="danger"
                :disabled="keysLoading || loading || keyBusy || !selectedKeyIds.length"
                @click="openKeyOperation('delete')"
                >{{ t('managedKeys.delete') }}</t-button
              >
            </div>
            <t-input
              v-model="keySearch"
              name="user-key-filter"
              class="key-search"
              autocomplete="off"
              clearable
              :placeholder="t('users.detail.keys.searchPlaceholder')"
            />
          </div>
          <t-table
            row-key="id"
            :data="keys"
            :disable-data-page="true"
            :pagination="{
              current: keyPage,
              pageSize: keyPageSize,
              total: keyTotal,
              pageSizeOptions: [10, 20, 50, 100],
            }"
            @page-change="changeKeyPage"
            :columns="keyColumns"
            :loading="keysLoading"
            :selected-row-keys="selectedKeyIds"
            @select-change="selectKeyRows"
            hover
            table-layout="fixed"
            :max-height="460"
            :empty="t('users.detail.keys.empty')"
          >
            <template #name="{ row }"
              ><span class="key-name">{{ row.name }}</span></template
            >
            <template #id="{ row }"
              ><code>{{ row.id }}</code></template
            >
            <template #masked_value="{ row }">
              <t-tooltip :content="t('users.detail.keys.maskedHint')">
                <code class="api-key-hint">{{ row.masked_value }}</code>
              </t-tooltip>
            </template>
            <template #status="{ row }">
              <t-tag
                size="small"
                variant="light"
                :theme="row.status === 'ACTIVE' ? 'success' : 'default'"
              >
                {{
                  row.status === 'ACTIVE'
                    ? t('users.detail.keys.statusActive')
                    : t('users.detail.keys.statusDisabled')
                }}
              </t-tag>
            </template>
            <template #created_at="{ row }">
              {{ formatDateTime(row.created_at) || '—' }}
            </template>
            <template #last_used_at="{ row }">
              <span :class="{ 'detail-empty-value': !row.last_used_at }">
                {{ formatDateTime(row.last_used_at) || '—' }}
              </span>
            </template>
          </t-table>
        </t-tab-panel>
      </t-tabs>
    </template>
    <p v-else class="detail-empty-value">{{ t('users.detail.empty') }}</p>

    <t-dialog
      :visible="grantDialog.visible"
      :header="
        grantDialog.mode === 'add'
          ? t('users.detail.models.addTitle')
          : t('users.detail.models.removeTitle')
      "
      width="480px"
      :close-on-overlay-click="false"
      :confirm-btn="{
        content: t('common.confirm'),
        loading: grantDialog.loading,
        disabled: !canConfirmGrant,
      }"
      :cancel-btn="{ content: t('common.cancel') }"
      @confirm="submitGrant"
      @close="onGrantClose"
    >
      <p v-if="grantDialog.mode === 'remove'" class="confirm-content">
        {{ t('users.detail.models.removeHint', { name: grantDialog.target?.name ?? '' }) }}
      </p>
      <t-form label-width="90px" :data="grantDialog">
        <t-form-item
          v-if="grantDialog.mode === 'add'"
          :label="t('users.detail.models.selectedList')"
        >
          <ul class="selected-models">
            <li v-for="id in grantDialog.modelIds" :key="id">
              {{ modelSelectOptions.find((item) => item.value === id)?.label || id }}
            </li>
          </ul>
        </t-form-item>
      </t-form>
    </t-dialog>
    <t-dialog
      :visible="keyConfirmVisible"
      :header="keyDialogTitle"
      :close-on-overlay-click="false"
      :close-on-esc-keydown="!keyBusy"
      :close-btn="!keyBusy"
      :confirm-btn="{ content: t('myKeys.confirm'), theme: 'danger', loading: keyBusy }"
      :cancel-btn="{ content: t('common.cancel'), disabled: keyBusy }"
      @confirm="submitKeyOperation()"
      @close="closeKeyConfirm"
    >
      <p class="confirm-content">{{ keyDialogContent }}</p>
    </t-dialog>
  </t-drawer>
</template>

<script setup lang="ts">
import { usePageSelection } from '@/utils/usePageSelection'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import type { PageInfo, PrimaryTableCol } from 'tdesign-vue-next'

import {
  getLogicalModelOptionsApi,
  getUserApiKeysApi,
  getUserDetailApi,
  getUserModelGrantSourcesApi,
  getUserModelGrantsApi,
  setUserModelGrantsApi,
  type LogicalModelOption,
  type UserApiKeyItem,
  type UserItem,
  type UserModelGrant,
  type UserModelGrantSource,
  type UserTermsInfo,
} from '@/api/modules/identity'
import { canWriteResource, hasPermission, useUserStore } from '@/stores/modules/user'
import {
  batchEnableManagedKeysApi,
  batchDisableManagedKeysApi,
  batchDeleteManagedKeysApi,
} from '@/api/modules/apiKeys'
import type { OffsetPageQuery, OffsetPageResult } from '@/api/types'
import type { NotifiedError } from '@/api/request'
import { formatDateTime } from '@/utils/datetime'

const props = defineProps<{
  visible: boolean
  /** 列表行数据：打开时先展示，再用详情接口刷新的数据覆盖 */
  user: UserItem | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const { t } = useI18n()
const userStore = useUserStore()

const loading = ref(false)
const detail = ref<UserItem | null>(null)
const activeTab = ref('basic')
const modelSources = ref<UserModelGrantSource[]>([])
/** 用户级直接授权（F-USER-09：取消授权只能作用于直接授权） */
const directGrants = ref<UserModelGrant[]>([])
const grantsReady = ref(false)
const modelOptions = ref<LogicalModelOption[]>([])
const keys = ref<UserApiKeyItem[]>([])
const keySearch = ref('')
const selectedModelIds = ref<string[]>([])
const termsLoading = ref(true)
const termsInfo = ref<UserTermsInfo | null>(null)
const termsState = computed(() => {
  if (termsLoading.value) return 'loading'
  if (!termsInfo.value) return 'unavailable'
  if (termsInfo.value.visibility !== 'VISIBLE') return 'notApplicable'
  if (termsInfo.value.status === 'ACCEPTED') return 'accepted'
  if (termsInfo.value.status === 'NOT_ACCEPTED') return 'notNone'
  return 'unavailable'
})
const currentAcceptance = computed(() =>
  termsInfo.value?.visibility === 'VISIBLE' ? termsInfo.value.current_acceptance : null,
)
const termsVersionIp = computed(() =>
  [currentAcceptance.value?.terms_version, currentAcceptance.value?.client_ip]
    .filter((value) => !!value)
    .join(' / '),
)
const lastAcceptance = computed(() =>
  termsInfo.value?.visibility === 'VISIBLE' ? termsInfo.value.last_acceptance : null,
)

const canViewKeys = computed(() => hasPermission(userStore.permissions, 'identity.keys'))
const canWriteKeys = computed(() => canWriteResource(userStore.permissions, 'identity.keys'))
const canWriteUsers = computed(() => canWriteResource(userStore.permissions, 'identity.users'))

const directModelIds = computed(() => new Set(directGrants.value.map((item) => item.model.id)))

/** 模型选择列表展示系统中所有已上架模型 */
const activeModelOptions = computed(() =>
  modelOptions.value.filter((item) => item.status === 'ACTIVE'),
)

const modelSelectOptions = computed(() =>
  activeModelOptions.value.map((item) => ({
    label: item.localized_name || item.display_name,
    value: item.id,
  })),
)

const grantDialog = reactive({
  visible: false,
  mode: 'add' as 'add' | 'remove',
  target: null as ModelRow | null,
  modelIds: [] as string[],
  loading: false,
})

const canConfirmGrant = computed(
  () => grantDialog.mode === 'remove' || grantDialog.modelIds.length > 0,
)

const avatarText = computed(() => detail.value?.display_name.slice(-2) ?? '')

const groupNames = computed(() =>
  (detail.value?.groups ?? [])
    .map((group) => group.display_name)
    .join(t('users.detail.listSeparator')),
)

interface ModelRow {
  id: string
  name: string
  sources: string
  grantType: string
}

/** 按模型聚合授权来源：用户直接授权 + 部门/用户组继承 */
const modelRows = computed<ModelRow[]>(() => {
  const directLabel = t('users.detail.models.directSource')
  const grouped = new Map<
    string,
    { id: string; name: string; sources: string[]; direct: boolean; inherited: boolean }
  >()

  modelSources.value.forEach((item) => {
    let row = grouped.get(item.model.id)
    if (!row) {
      row = {
        id: item.model.id,
        name: item.model.localized_name || item.model.display_name,
        sources: [],
        direct: directModelIds.value.has(item.model.id),
        inherited: false,
      }
      grouped.set(item.model.id, row)
    }

    const direct = item.source_type === 'USER'
    if (direct) row.direct = true
    else row.inherited = true

    const label = direct
      ? directLabel
      : !item.source_display_name
        ? t('users.detail.models.sourceOutOfScope')
        : item.source_type === 'DEPARTMENT'
          ? t('users.detail.models.sourceDepartment', { name: item.source_display_name })
          : item.source_type === 'USER_GROUP'
            ? t('users.detail.models.sourceGroup', { name: item.source_display_name })
            : item.source_display_name
    if (!row.sources.includes(label)) row.sources.push(label)
  })

  return [...grouped.values()].map((row) => ({
    id: row.id,
    name: row.name,
    sources: row.sources.join(t('users.detail.listSeparator')),
    grantType:
      row.direct && row.inherited
        ? t('users.detail.models.grant.both')
        : row.direct
          ? t('users.detail.models.grant.direct')
          : t('users.detail.models.grant.inherited'),
  }))
})

const modelColumns = computed<PrimaryTableCol<ModelRow>[]>(() => {
  const columns: PrimaryTableCol<ModelRow>[] = [
    { colKey: 'name', title: t('users.detail.models.columns.model'), width: 135, ellipsis: true },
    { colKey: 'provider', title: t('users.detail.models.columns.provider'), width: 110 },
    { colKey: 'sources', title: t('users.detail.models.columns.sources'), ellipsis: true },
    {
      colKey: 'grantType',
      title: t('users.detail.models.columns.grantType'),
      width: 130,
    },
  ]
  // 无用户管理写权限时不展示授权操作列（读权限只能查看）
  if (canWriteUsers.value) {
    columns.push({
      colKey: 'actions',
      title: t('users.detail.models.columns.actions'),
      width: 120,
    })
  }
  return columns
})

const keyPage = ref(1)
const keyPageSize = ref(20)
const keyTotal = ref(0)
function changeKeyPage(info: PageInfo) {
  if (keysLoading.value || keyBusy.value || !props.user) return
  const nextPageSize = Math.min(100, Math.max(1, info.pageSize))
  keyPage.value = nextPageSize !== keyPageSize.value ? 1 : info.current
  keyPageSize.value = nextPageSize
  void loadKeys(props.user.id).catch(() => {})
}

const keyColumns = computed<PrimaryTableCol<UserApiKeyItem>[]>(() => [
  ...(canWriteKeys.value ? [{ colKey: 'row-select', type: 'multiple' as const, width: 48 }] : []),
  { colKey: 'name', title: t('users.detail.keys.columns.name'), width: 110 },
  {
    colKey: 'masked_value',
    title: t('users.detail.keys.columns.maskedKey'),
    width: 190,
  },
  { colKey: 'id', title: t('users.detail.keys.columns.keyId'), width: 125, ellipsis: true },
  { colKey: 'status', title: t('users.detail.keys.columns.status'), width: 86 },
  { colKey: 'created_at', title: t('users.detail.keys.columns.createdAt'), width: 145 },
  { colKey: 'last_used_at', title: t('users.detail.keys.columns.lastUsed'), width: 145 },
])

type KeyOperation = 'enable' | 'disable' | 'delete'
const {
  selectedKeys: selectedKeyIds,
  selectedItems: selectedKeyItems,
  selectRows: updateKeySelection,
  clearSelection,
} = usePageSelection(keys)
const keysLoading = ref(false)
const keyBusy = ref(false)
const keyConfirmVisible = ref(false)
const keyOperation = ref<KeyOperation>('disable')
const keyTargets = ref<UserApiKeyItem[]>([])
let keyGeneration = 0
let keyListRequest = 0
let drawerGeneration = 0
const keyDialogTitle = computed(() => t(`managedKeys.${keyOperation.value}Title`))
const keyDialogContent = computed(() =>
  t(
    keyOperation.value === 'delete' ? 'managedKeys.batchDeleteContent' : 'managedKeys.batchContent',
    { action: t(`managedKeys.${keyOperation.value}`), n: keyTargets.value.length },
  ),
)
watch(keySearch, () => {
  resetKeyOperation()
  keyPage.value = 1
  if (props.visible && props.user && canViewKeys.value) void loadKeys(props.user.id).catch(() => {})
})
watch(
  canWriteKeys,
  (allowed) => {
    if (!allowed) resetKeyOperation()
  },
  { flush: 'sync' },
)
function selectKeyRows(ids: Array<string | number>) {
  if (!canWriteKeys.value || keyBusy.value || keysLoading.value) return
  updateKeySelection(ids)
}
/** Collect complete data for model aggregation and grant replacement; stop when stale. */
async function collectPages<T>(
  fetchPage: (query: OffsetPageQuery) => Promise<OffsetPageResult<T>>,
  isCurrent: () => boolean,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page += 1) {
    if (!isCurrent()) return []
    const result = await fetchPage({ page, page_size: 100 })
    if (!isCurrent()) return []
    items.push(...result.items)
    if (page >= result.total_pages) return items
    if (result.page !== page || !result.items.length || items.length >= 10000)
      throw new Error(t('authErrors.fallback'))
  }
}
async function loadKeys(userId: string) {
  const request = ++keyListRequest
  keysLoading.value = true
  try {
    const result = await getUserApiKeysApi({
      user_id: userId,
      search: keySearch.value.trim() || undefined,
      page: keyPage.value,
      page_size: keyPageSize.value,
    })
    if (request !== keyListRequest || !props.visible || props.user?.id !== userId) return
    keyTotal.value = result.total
    keyPageSize.value = result.page_size
    const lastPage = Math.max(1, result.total_pages)
    if (result.page > lastPage) {
      keyPage.value = lastPage
      await loadKeys(userId)
      return
    }
    keyPage.value = result.page
    keys.value = result.items
  } finally {
    if (request === keyListRequest) keysLoading.value = false
  }
}
function resetKeyOperation() {
  ++keyGeneration
  ++keyListRequest
  keyConfirmVisible.value = false
  keyBusy.value = false
  keysLoading.value = false
  clearSelection()
  keyTargets.value = []
}
function openKeyOperation(action: KeyOperation) {
  if (!canWriteKeys.value || loading.value || keysLoading.value || keyBusy.value) return
  keyTargets.value = selectedKeyItems.value.filter(
    (item) =>
      action === 'delete' ||
      (action === 'enable' ? item.status !== 'ACTIVE' : item.status === 'ACTIVE'),
  )
  if (keyTargets.value.length > 100) {
    MessagePlugin.warning(t('common.selectionLimit', { n: 100 }))
    return
  }
  if (!keyTargets.value.length) return
  keyOperation.value = action
  keyConfirmVisible.value = true
}
function closeKeyConfirm() {
  if (!keyBusy.value) keyConfirmVisible.value = false
}
async function submitKeyOperation() {
  if (!canWriteKeys.value || keyBusy.value || !props.visible || !keyTargets.value.length) return
  const generation = keyGeneration
  const userId = props.user?.id
  if (!userId) return
  const action = keyOperation.value
  const body = { key_ids: keyTargets.value.map((item) => item.id) }
  const idempotencyKey = globalThis.crypto.randomUUID()
  keyBusy.value = true
  try {
    const api =
      action === 'enable'
        ? batchEnableManagedKeysApi
        : action === 'disable'
          ? batchDisableManagedKeysApi
          : batchDeleteManagedKeysApi
    await api(body, idempotencyKey)
    if (generation !== keyGeneration) return
    MessagePlugin.success(t('managedKeys.success'))
    keyConfirmVisible.value = false
    clearSelection()
    await loadKeys(userId)
  } catch (error) {
    if (generation === keyGeneration && !(error as NotifiedError).notified)
      MessagePlugin.error((error as Error).message || t('authErrors.fallback'))
  } finally {
    if (generation === keyGeneration) keyBusy.value = false
  }
}
onBeforeUnmount(() => {
  ++drawerGeneration
  resetKeyOperation()
})

watch(
  () => [props.visible, props.user?.id] as const,
  async ([visible], _previous, onCleanup) => {
    let stale = false
    onCleanup(() => {
      stale = true
    })
    const generation = ++drawerGeneration
    resetKeyOperation()
    grantDialog.loading = false
    selectedModelIds.value = []
    grantDialog.visible = false
    if (!visible) return
    activeTab.value = 'basic'
    keyPage.value = 1
    keyTotal.value = 0
    keySearch.value = ''
    modelSources.value = []
    directGrants.value = []
    grantsReady.value = false
    modelOptions.value = []
    keys.value = []
    termsLoading.value = true
    termsInfo.value = null
    grantDialog.visible = false
    detail.value = props.user
    if (!props.user) return

    const userId = props.user.id
    loading.value = true
    const tasks: Array<Promise<unknown>> = [
      getUserDetailApi(userId)
        .then((result) => {
          if (stale) return
          detail.value = result.user
          termsInfo.value = result.terms ?? null
        })
        .catch(() => {
          if (!stale) termsInfo.value = null
        })
        .finally(() => {
          if (!stale) termsLoading.value = false
        }),
      collectPages(
        (query) => getUserModelGrantSourcesApi(userId, query),
        () => !stale,
      ).then((result) => {
        if (stale) return
        modelSources.value = result
      }),
      loadModelGrants(userId, generation),
      collectPages(getLogicalModelOptionsApi, () => !stale).then((result) => {
        if (stale) return
        modelOptions.value = result
      }),
    ]
    if (canViewKeys.value) {
      tasks.push(loadKeys(userId))
    }
    // 任一子接口失败不影响其余区块展示（错误提示由请求拦截器统一处理）
    await Promise.allSettled(tasks)
    if (!stale) loading.value = false
  },
)

async function loadModelGrants(userId: string, generation = drawerGeneration) {
  const current = () =>
    generation === drawerGeneration && props.visible && props.user?.id === userId
  const result = await collectPages((query) => getUserModelGrantsApi(userId, query), current)
  if (current()) {
    directGrants.value = result
    grantsReady.value = true
  }
}

function openAddGrant() {
  if (
    !canWriteUsers.value ||
    !grantsReady.value ||
    !selectedModelIds.value.length ||
    grantDialog.loading
  )
    return
  grantDialog.mode = 'add'
  grantDialog.target = null
  grantDialog.modelIds = [...selectedModelIds.value]
  grantDialog.visible = true
}

function openRemoveGrant(row: ModelRow) {
  if (
    !canWriteUsers.value ||
    !grantsReady.value ||
    grantDialog.loading ||
    !directModelIds.value.has(row.id)
  )
    return
  grantDialog.mode = 'remove'
  grantDialog.target = row
  grantDialog.modelIds = []
  grantDialog.visible = true
}

function onGrantClose() {
  if (grantDialog.loading) return
  grantDialog.visible = false
}

/** 后端按全量覆盖用户直接授权集合：新增取并集，取消取差集，继承权限不受影响 */
async function submitGrant() {
  const userId = detail.value?.id
  if (
    !userId ||
    !canWriteUsers.value ||
    !grantsReady.value ||
    grantDialog.loading ||
    !props.visible ||
    !canConfirmGrant.value
  )
    return
  const generation = drawerGeneration
  const current = () =>
    generation === drawerGeneration && props.visible && props.user?.id === userId
  const currentIds = [...directModelIds.value]
  const modelIds =
    grantDialog.mode === 'add'
      ? [...new Set([...currentIds, ...grantDialog.modelIds])]
      : currentIds.filter((id) => id !== grantDialog.target?.id)

  grantDialog.loading = true
  try {
    const result = await setUserModelGrantsApi(userId, { model_ids: modelIds })
    if (!current()) return
    MessagePlugin.success(
      result.changed
        ? t('users.detail.models.grantSuccess')
        : t('users.detail.models.grantUnchanged'),
    )
    grantDialog.visible = false
    selectedModelIds.value = []
    // 直接授权变化会同时改变「授权来源」列，两个数据源一起刷新
    await Promise.allSettled([
      loadModelGrants(userId),
      collectPages((query) => getUserModelGrantSourcesApi(userId, query), current).then((items) => {
        if (current()) modelSources.value = items
      }),
    ])
  } catch {
    /* 错误提示由请求拦截器统一处理 */
  } finally {
    if (current()) grantDialog.loading = false
  }
}

function onClose() {
  ++drawerGeneration
  selectedModelIds.value = []
  resetKeyOperation()
  grantDialog.visible = false
  emit('update:visible', false)
}
</script>

<style scoped>
.profile-heading {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-l);
  margin-bottom: var(--td-comp-margin-l);
}

.profile-heading :deep(.t-avatar) {
  flex: none;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.profile-heading h2 {
  margin: 0 0 var(--td-comp-margin-xs);
  font: var(--td-font-title-large);
  color: var(--td-text-color-primary);
}

.profile-heading p {
  margin: 0;
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-placeholder);
}

.profile-heading > :deep(.t-tag) {
  margin-left: auto;
}

.dot-separator {
  margin: 0 var(--td-comp-margin-xs);
}

.detail-grid {
  display: grid;
  grid-template-columns: calc(var(--td-comp-size-xxxl) * 2) 1fr;
  gap: var(--td-comp-margin-l);
  margin: var(--td-comp-margin-l) 0;
  font-size: var(--td-font-size-body-medium);
}

.detail-grid dt {
  color: var(--td-text-color-secondary);
}

.detail-grid dd {
  margin: 0;
  line-height: 1.7;
  color: var(--td-text-color-primary);
  word-break: break-word;
}

.t-alert:not(:first-child) {
  margin-bottom: var(--td-comp-margin-l);
}

.key-disabled-alert {
  margin-bottom: var(--td-comp-margin-l);
}

.key-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--td-comp-margin-s);
  margin-bottom: var(--td-comp-margin-l);
}

.model-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--td-comp-margin-s);
  margin-bottom: var(--td-comp-margin-l);
}

.terms-banner {
  grid-column: 1 / -1;
  display: grid;
  gap: var(--td-comp-margin-s);
}

.confirm-content {
  margin: 0 0 var(--td-comp-margin-l);
  line-height: 1.7;
  color: var(--td-text-color-primary);
}

.key-actions {
  display: flex;
  gap: var(--td-comp-margin-s);
}
.key-search {
  flex: 1;
  min-width: 0;
  margin-left: auto;
}
.model-select {
  flex: 1;
  min-width: 0;
}
.key-name {
  white-space: normal;
  overflow-wrap: anywhere;
}
.selected-models {
  margin: 0;
  padding-left: var(--td-comp-margin-l);
}

.cell-ellipsis {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.api-key-hint {
  font-family: ui-monospace, Menlo, monospace;
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
  white-space: nowrap;
}

.detail-empty-value {
  color: var(--td-text-color-placeholder);
}

:deep(.t-tabs__content) {
  padding-top: var(--td-comp-margin-l);
}
</style>
