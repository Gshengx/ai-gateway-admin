<template>
  <t-drawer
    :visible="visible"
    :header="t('users.detail.title')"
    size="var(--user-detail-drawer-width)"
    destroy-on-close
    :footer="false"
    @close="onClose"
  >
    <LoadingState v-if="loading" :loading="true" height="var(--stable-detail-section-height)" />
    <t-alert v-else-if="detailFailed" theme="error" :message="t('common.loadFailed')">
      <template #operation>
        <t-button variant="text" @click="detailReload += 1">{{ t('common.retry') }}</t-button>
      </template>
    </t-alert>
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

      <t-tabs
        :title="
          authorizedModelTotal === null || apiKeyCount === null ? t('route.forbidden') : undefined
        "
        ref="tabsRef"
        v-model="activeTab"
        class="drawer-tabs"
      >
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

        <t-tab-panel
          value="models"
          lazy
          :label="t('users.detail.tabs.models', { n: authorizedModelTotal ?? '—' })"
        >
          <t-alert v-if="modelsFailed" theme="error" :message="t('common.loadFailed')">
            <template #operation>
              <t-button variant="text" @click="detail && loadModels(detail.id)">
                {{ t('common.retry') }}
              </t-button>
            </template>
          </t-alert>
          <div v-if="canWriteUsers" class="model-toolbar">
            <ModelGrantSelect
              :key="detail.id"
              :subject-id="detail.id"
              :labels="modelNames"
              v-model="selectedModelIds"
              :locked-ids="directModelIdList"
              :disabled="grantDialog.loading"
              @names="Object.assign(modelNames, $event)"
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
            :height="modelsLoading ? 'var(--stable-detail-table-height)' : undefined"
            row-key="id"
            :data="modelRows"
            :columns="modelColumns"
            :disable-data-page="true"
            :pagination="{
              current: modelPage,
              pageSize: modelPageSize,
              total: authorizedModelTotal ?? 0,
              pageSizeOptions: [10, 20, 50, 100],
            }"
            @page-change="changeModelPage"
            :loading="modelsLoading"
            hover
            table-layout="fixed"
            :max-height="460"
            :empty="modelsFailed ? t('common.loadFailed') : t('users.detail.models.empty')"
          >
            <template #name="{ row }">
              <t-tooltip :content="row.name">
                <span class="cell-ellipsis">{{ row.name }}</span>
              </t-tooltip>
            </template>
            <template #sources="{ row }">
              <t-tooltip :content="row.sources">
                <span class="cell-ellipsis">{{ row.sources }}</span>
              </t-tooltip>
            </template>
            <template #status="{ row }">
              <t-tag variant="light" :theme="statusTheme(row.status)">
                {{ t(`ma.${row.status}`) }}
              </t-tag>
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
          lazy
          :label="t('users.detail.tabs.keys', { n: apiKeyCount ?? '—' })"
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
            :height="keysLoading ? 'var(--stable-detail-table-height)' : undefined"
            row-key="id"
            :data="keys"
            :class="{ 'stable-table--pending-footer': (keysLoading || keysFailed) && !keys.length }"
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
            :empty="keysFailed ? t('common.loadFailed') : t('users.detail.keys.empty')"
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
      attach="body"
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
        disabled: !canWriteUsers || !canConfirmGrant,
      }"
      :cancel-btn="{ content: t('common.cancel'), disabled: grantDialog.loading }"
      :close-btn="!grantDialog.loading"
      :close-on-esc-keydown="!grantDialog.loading"
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
              {{ modelNames[id] || id }}
            </li>
          </ul>
        </t-form-item>
      </t-form>
    </t-dialog>
    <t-dialog
      attach="body"
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
import { useDrawerTabs } from '@/utils/useDrawerTabs'
import LoadingState from '@/components/LoadingState.vue'
import { statusTheme } from '@/views/model/access/helpers'
import ModelGrantSelect from './ModelGrantSelect.vue'
import type { UserGrantDelta } from '@/api/modules/modelAccessContract'
import { usePageSelection } from '@/utils/usePageSelection'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import type { PageInfo, PrimaryTableCol } from 'tdesign-vue-next'

import {
  getUserApiKeysApi,
  getUserDetailApi,
  getUserModelGrantSourcesApi,
  addUserModelGrantsApi,
  removeUserModelGrantsApi,
  type UserApiKeyItem,
  type UserItem,
  type UserModelGrantSource,
  type UserTermsInfo,
} from '@/api/modules/identity'
import { canWriteResource, hasPermission, useUserStore } from '@/stores/modules/user'
import {
  batchEnableManagedKeysApi,
  batchDisableManagedKeysApi,
  batchDeleteManagedKeysApi,
} from '@/api/modules/apiKeys'
import { createIdempotencyKey, type NotifiedError } from '@/api/request'
import { formatDateTime } from '@/utils/datetime'

const props = defineProps<{
  visible: boolean
  /** 列表行数据用于标识目标用户，详情数据准备好后再展示。 */
  user: UserItem | null
  initialDetail?: Awaited<ReturnType<typeof getUserDetailApi>>
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const { t } = useI18n()
const userStore = useUserStore()

const loading = ref(false)
const detailFailed = ref(false)
const detailReload = ref(0)
const modelsFailed = ref(false)
const keysFailed = ref(false)
const detail = ref<UserItem | null>(null)
const activeTab = ref('basic')
const tabsRef = useDrawerTabs(activeTab)
const modelsLoading = ref(false)
const modelsLoaded = ref(false)
const keysLoaded = ref(false)
const keyRequest = useLatestRequest()
const modelSources = ref<UserModelGrantSource[]>([])
const authorizedModelTotal = ref<number | null>(null)
const apiKeyCount = ref<number | null>(null)
/** 用户级直接授权（F-USER-09：取消授权只能作用于直接授权） */
const modelPage = ref(1)
const modelPageSize = ref(20)
function changeModelPage(info: PageInfo) {
  if (modelsLoading.value || grantDialog.loading || !props.user) return
  const pageSize = Math.min(100, Math.max(1, info.pageSize))
  modelPage.value = pageSize !== modelPageSize.value ? 1 : info.current
  modelPageSize.value = pageSize
  void loadModels(props.user.id)
}
const authorizationVersion = ref<number | null>(null)
let grantController: AbortController | undefined
let pendingGrant: {
  userId: string
  mode: 'add' | 'remove'
  body: UserGrantDelta
  key: string
} | null = null
const grantsReady = ref(false)
const modelNames = ref<Record<string, string>>({})
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
const grantPermitted = computed(() =>
  ['identity.users', 'model.permissions'].every((resource) =>
    userStore.permissionSnapshot?.capabilities.some(
      (capability) => capability.resource_code === resource && capability.can_write,
    ),
  ),
)
const canWriteUsers = computed(() => userStore.permissionsReady && grantPermitted.value)

const directModelIds = computed(
  () =>
    new Set(
      modelSources.value
        .filter((entry) =>
          entry.sources.some(
            (source) =>
              source.subject_type === 'USER' &&
              source.subject_id === props.user?.id &&
              !source.inherited,
          ),
        )
        .map((entry) => entry.model.id),
    ),
)
const directModelIdList = computed(() => [...directModelIds.value])

const grantDialog = reactive({
  visible: false,
  mode: 'add' as 'add' | 'remove',
  target: null as ModelRow | null,
  modelIds: [] as string[],
  loading: false,
})

function resetGrantOperation() {
  grantController?.abort()
  grantController = undefined
  pendingGrant = null
  selectedModelIds.value = []
  grantDialog.visible = false
  grantDialog.loading = false
  grantDialog.target = null
  grantDialog.modelIds = []
}
watch(
  grantPermitted,
  (allowed) => {
    if (!allowed) resetGrantOperation()
  },
  { flush: 'sync' },
)

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
  status: UserModelGrantSource['model']['status']
  provider: string
  available: boolean
  unavailableReason: string | null
  id: string
  name: string
  sources: string
  grantType: string
}

/** 按模型聚合授权来源：用户直接授权 + 部门/用户组继承 */
const modelRows = computed<ModelRow[]>(() =>
  modelSources.value.map((entry) => {
    const direct = entry.sources.some(
      (source) => source.subject_type === 'USER' && !source.inherited,
    )
    const inherited = entry.sources.some((source) => source.inherited)
    const sources = entry.sources.map((source) =>
      source.subject_type === 'USER' && !source.inherited
        ? t('users.detail.models.directSource')
        : source.subject_type === 'DEPARTMENT'
          ? t('users.detail.models.sourceDepartment', {
              name: source.subject_department_path ?? source.subject_name,
            })
          : t('users.detail.models.sourceGroup', { name: source.subject_name }),
    )
    return {
      id: entry.model.id,
      name: entry.model.model_id_at_gateway,
      provider: entry.model.provider_name,
      status: entry.model.status,
      available: entry.available,
      unavailableReason: entry.unavailable_reason,
      sources: sources.join(t('users.detail.listSeparator')),
      grantType:
        direct && inherited
          ? t('users.detail.models.grant.both')
          : direct
            ? t('users.detail.models.grant.direct')
            : t('users.detail.models.grant.inherited'),
    }
  }),
)

const modelColumns = computed<PrimaryTableCol<ModelRow>[]>(() => {
  const columns: PrimaryTableCol<ModelRow>[] = [
    { colKey: 'name', title: t('users.detail.models.columns.model'), width: 180, ellipsis: true },
    { colKey: 'provider', title: t('users.detail.models.columns.provider'), width: 180 },
    { colKey: 'status', title: t('users.detail.models.columns.status'), width: 90 },
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
      fixed: 'right',
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
  if (props.visible && props.user && canViewKeys.value && activeTab.value === 'keys')
    keyRequest.schedule(() => void loadKeys(props.user!.id).catch(() => {}))
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
async function loadKeys(userId: string) {
  keysFailed.value = false
  const current = keyRequest.begin()
  keysLoading.value = true
  try {
    const result = await getUserApiKeysApi(
      {
        user_id: userId,
        search: keySearch.value.trim() || undefined,
        page: keyPage.value,
        page_size: keyPageSize.value,
      },
      { signal: current.signal },
    )
    if (!current.isCurrent()) return
    keyTotal.value = result.total
    apiKeyCount.value = result.total
    keyPageSize.value = result.page_size
    const lastPage = Math.max(1, result.total_pages)
    if (result.page > lastPage) {
      keyPage.value = lastPage
      await loadKeys(userId)
      return
    }
    keyPage.value = result.page
    keys.value = result.items
    keysLoaded.value = true
  } catch (error) {
    if (current.isCurrent()) keysFailed.value = true
    throw error
  } finally {
    if (current.isCurrent()) keysLoading.value = false
  }
}
function resetKeyOperation() {
  keyRequest.invalidate()
  ++keyGeneration
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
  const idempotencyKey = createIdempotencyKey()
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
  resetGrantOperation()
})

let consumedInitialDetail: typeof props.initialDetail
watch(
  () => [props.visible, props.user?.id, detailReload.value] as const,
  async ([visible], _previous, onCleanup) => {
    let stale = false
    onCleanup(() => {
      stale = true
    })
    ++drawerGeneration
    resetKeyOperation()
    resetGrantOperation()
    if (!visible) return
    modelsLoaded.value = false
    detailFailed.value = false
    modelsFailed.value = false
    keysFailed.value = false
    modelsLoading.value = false
    keysLoaded.value = false
    activeTab.value = 'basic'
    keyPage.value = 1
    keyTotal.value = 0
    apiKeyCount.value = null
    keySearch.value = ''
    modelSources.value = []
    authorizedModelTotal.value = null
    modelPage.value = 1
    modelPageSize.value = 20
    authorizationVersion.value = null
    grantsReady.value = false
    modelNames.value = {}
    keys.value = []
    termsLoading.value = true
    termsInfo.value = null
    detail.value = props.user
    if (!props.user) return

    const userId = props.user.id
    loading.value = true
    const initial =
      props.initialDetail?.user.id === userId && props.initialDetail !== consumedInitialDetail
        ? props.initialDetail
        : undefined
    if (initial) consumedInitialDetail = initial
    const results = await Promise.allSettled([
      (initial ? Promise.resolve(initial) : getUserDetailApi(userId))
        .then((result) => {
          if (stale) return
          detail.value = result.user
          authorizedModelTotal.value = result.authorized_model_count ?? null
          apiKeyCount.value = result.api_key_count
          termsInfo.value = result.terms ?? null
        })
        .catch((error) => {
          if (!stale) {
            detailFailed.value = true
            termsInfo.value = null
          }
          throw error
        })
        .finally(() => {
          if (!stale) termsLoading.value = false
        }),
    ])
    if (!stale) {
      detailFailed.value = results.some((result) => result.status === 'rejected')
      loading.value = false
    }
  },
)

watch(activeTab, async (tab) => {
  if (!props.visible || !props.user) return
  const userId = props.user.id
  const generation = drawerGeneration
  if (tab === 'keys' && canViewKeys.value && !keysLoaded.value && !keysLoading.value) {
    await loadKeys(userId).catch(() => {})
  }
  if (tab === 'models' && !modelsLoaded.value && !modelsLoading.value) {
    await loadModels(userId, generation)
  }
})

async function loadModels(userId: string, generation = drawerGeneration) {
  const current = () =>
    generation === drawerGeneration && props.visible && props.user?.id === userId
  modelsLoading.value = true
  modelsFailed.value = false
  modelsLoaded.value = false
  grantsReady.value = false
  try {
    const sources = await getUserModelGrantSourcesApi(userId, {
      page: modelPage.value,
      page_size: modelPageSize.value,
    })
    if (current() && modelPage.value > Math.max(1, sources.total_pages)) {
      modelPage.value = Math.max(1, sources.total_pages)
      await loadModels(userId, generation)
      return
    }
    if (current()) {
      modelPage.value = sources.page
      modelPageSize.value = sources.page_size
      modelSources.value = sources.items
      authorizedModelTotal.value = sources.total
      authorizationVersion.value = sources.authorization_version
      grantsReady.value = true
      modelsLoaded.value = true
    }
  } catch {
    if (current()) modelsFailed.value = true
    // Request errors are reported by the interceptor; returning to the tab retries.
  } finally {
    if (current()) modelsLoading.value = false
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
  void submitGrant()
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

/** 增量修改当前用户直授；不提交其他直授及继承关系。 */
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
  const signal = (grantController ??= new AbortController()).signal
  const current = () =>
    !signal.aborted && generation === drawerGeneration && props.visible && props.user?.id === userId
  const modelIds =
    grantDialog.mode === 'add'
      ? [...new Set(grantDialog.modelIds)].sort()
      : grantDialog.target
        ? [grantDialog.target.id]
        : []
  if (!modelIds.length || modelIds.length > 100 || authorizationVersion.value === null) return
  const mode = grantDialog.mode
  const samePending =
    pendingGrant?.userId === userId &&
    pendingGrant.mode === mode &&
    JSON.stringify(pendingGrant.body.physical_model_ids) === JSON.stringify(modelIds)
  const command =
    samePending && pendingGrant
      ? pendingGrant
      : {
          userId,
          mode,
          body: {
            physical_model_ids: modelIds,
            expected_authorization_version: authorizationVersion.value,
          },
          key: createIdempotencyKey(),
        }
  pendingGrant = command
  grantDialog.loading = true
  let saved = false
  try {
    const api = mode === 'add' ? addUserModelGrantsApi : removeUserModelGrantsApi
    const result = await api(userId, command.body, { idempotencyKey: command.key, signal })
    if (!current()) return
    pendingGrant = null
    saved = true
    MessagePlugin.success(
      t(
        result.changed_count > 0
          ? 'users.detail.models.grantSuccess'
          : 'users.detail.models.grantUnchanged',
      ),
    )
    grantDialog.visible = false
    selectedModelIds.value = []
    await loadModels(userId, generation)
  } catch (error) {
    if (!current()) return
    if (saved) return
    const failure = error as NotifiedError
    if (failure.code === 'VERSION_CONFLICT') {
      pendingGrant = null
      await loadModels(userId, generation)
      if (!current()) return
      MessagePlugin.warning(t('users.detail.models.versionConflict'))
      grantDialog.visible = true
    } else {
      const uncertain =
        !failure.status ||
        ['OPERATION_RESULT_UNKNOWN', 'IDEMPOTENCY_IN_PROGRESS'].includes(failure.code ?? '')
      if (!uncertain) pendingGrant = null
      if (uncertain) {
        grantDialog.visible = true
        MessagePlugin.warning(t('users.detail.models.retrySameCommand'))
      }
    }
  } finally {
    if (current()) grantDialog.loading = false
  }
}

function onClose() {
  if (grantDialog.loading || keyBusy.value) return
  ++drawerGeneration
  resetKeyOperation()
  resetGrantOperation()
  emit('update:visible', false)
}
</script>

<style scoped>
.profile-heading {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-l);
  padding-top: var(--td-comp-paddingTB-l);
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
