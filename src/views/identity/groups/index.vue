<template>
  <t-card :bordered="false">
    <div class="table-toolbar">
      <t-space>
        <t-button v-permission="'identity.groups:write'" theme="primary" @click="onCreate">
          <template #icon><t-icon name="add" /></template>
          {{ t('groups.create') }}
        </t-button>
      </t-space>
      <t-input
        v-model="keyword"
        name="group-list-filter"
        autocomplete="off"
        class="toolbar-search"
        :placeholder="t('groups.searchPlaceholder')"
        clearable
      >
        <template #prefix-icon><t-icon name="search" /></template>
      </t-input>
    </div>

    <t-table
      height="var(--stable-table-height)"
      row-key="id"
      :data="tableData"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :class="{ 'stable-table--pending-footer': (loading || listFailed) && !tableData.length }"
      :scroll="{ x: 1030 }"
      hover
      @page-change="onPageChange"
    >
      <template v-if="listFailed" #empty>{{ t('common.loadFailed') }}</template>
      <template #name="{ row }">
        <t-link theme="primary" hover="color" @click="onOpenMembers(row)">
          {{ row.display_name || row.name }}
        </t-link>
      </template>
      <template #description="{ row }">
        <t-tooltip
          v-if="row.display_description || row.description"
          :content="row.display_description || row.description"
          :show-arrow="false"
        >
          <span class="cell-ellipsis">{{ row.display_description || row.description }}</span>
        </t-tooltip>
        <span v-else class="cell-empty">—</span>
      </template>
      <template #visible_member_count="{ row }">
        {{ row.total_member_count ?? row.visible_member_count }}
      </template>
      <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
      <template #created_by="{ row }">
        <span :class="{ 'cell-empty': !row.created_by }">
          {{ row.created_by?.display_name ?? '—' }}
        </span>
      </template>
      <template #action="{ row }">
        <t-space :size="12">
          <t-link theme="primary" hover="color" @click="onOpenMembers(row)">
            {{ t('groups.members') }}
          </t-link>
          <t-link
            v-permission="'identity.groups:write'"
            theme="primary"
            hover="color"
            :disabled="!row.can_manage"
            @click="onEdit(row)"
          >
            {{ t('groups.edit') }}
          </t-link>
          <t-link
            v-permission="'identity.groups:write'"
            theme="danger"
            hover="color"
            :disabled="!row.can_manage"
            @click="onDelete(row)"
          >
            {{ t('groups.deleteAction') }}
          </t-link>
        </t-space>
      </template>
    </t-table>
  </t-card>

  <group-form-dialog
    v-model:visible="formDialog.visible"
    :mode="formDialog.mode"
    :group="formDialog.group"
    :submitting="submitting"
    @submit="onFormSubmit"
  />

  <group-members-drawer
    v-model:visible="membersVisible"
    :group="membersGroup"
    @updated="fetchGroups"
  />

  <t-dialog
    :visible="confirmDialog.visible"
    :header="confirmDialog.title"
    width="480px"
    :close-on-overlay-click="false"
    :confirm-btn="{
      content: t('common.confirm'),
      theme: 'danger',
      loading: confirmDialog.loading || checkingReferences,
      disabled: !canConfirmDelete,
    }"
    :cancel-btn="{ content: t('common.cancel'), disabled: confirmDialog.loading }"
    :close-btn="!confirmDialog.loading"
    :close-on-esc-keydown="!confirmDialog.loading"
    @confirm="onConfirmDelete"
    @close="onConfirmClose"
  >
    <p class="confirm-content">{{ confirmDialog.content }}</p>
    <p v-if="checkingReferences">{{ t('groups.delete.checkingReferences') }}</p>
    <t-alert v-if="referencedModels.length" theme="warning">
      <group-reference-content :models="referencedModels" :has-more="referencesHasMore" />
    </t-alert>
  </t-dialog>
</template>

<script setup lang="ts">
import { h, computed, onMounted, reactive, ref, watch } from 'vue'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { useI18n } from 'vue-i18n'
import {
  DialogPlugin,
  MessagePlugin,
  type PageInfo,
  type PaginationProps,
  type PrimaryTableCol,
} from 'tdesign-vue-next'

import { formatDateTime } from '@/utils/datetime'
import GroupFormDialog from './components/GroupFormDialog.vue'
import GroupMembersDrawer from './components/GroupMembersDrawer.vue'
import GroupReferenceContent from './components/GroupReferenceContent.vue'
import type { NotifiedError } from '@/api/request'
import {
  createUserGroupApi,
  deleteUserGroupApi,
  getUserGroupListApi,
  getUserGroupModelGrantsApi,
  updateUserGroupApi,
  type CreateUserGroupPayload,
  type UpdateUserGroupPayload,
  type UserGroupItem,
  type ModelGrantSourceModel,
} from '@/api/modules/identity'

const { t } = useI18n()

const keyword = ref('')
const loading = ref(true)
const listFailed = ref(false)

const tableData = ref<UserGroupItem[]>([])
const listRequest = useLatestRequest()
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [10, 20, 50],
})

const columns = computed<PrimaryTableCol<UserGroupItem>[]>(() => [
  { colKey: 'name', title: t('groups.columns.name'), width: 200 },
  { colKey: 'description', title: t('groups.columns.description'), width: 260, ellipsis: true },
  { colKey: 'visible_member_count', title: t('groups.columns.members'), width: 100 },
  { colKey: 'created_at', title: t('groups.columns.createdAt'), width: 180 },
  { colKey: 'created_by', title: t('groups.columns.createdBy'), width: 140 },
  { colKey: 'action', title: t('groups.columns.action'), width: 170, fixed: 'right' },
])

watch(keyword, () => {
  pagination.current = 1
  loading.value = true
  listRequest.schedule(() => void fetchGroups())
})

async function fetchGroups(): Promise<void> {
  const current = listRequest.begin()
  loading.value = true
  listFailed.value = false
  try {
    const result = await getUserGroupListApi(
      {
        page: pagination.current ?? 1,
        page_size: pagination.pageSize ?? 20,
        search: keyword.value.trim() || undefined,
      },
      { signal: current.signal },
    )
    if (!current.isCurrent()) return
    pagination.total = result.total
    pagination.pageSize = Math.min(100, Math.max(1, result.page_size))
    const lastPage = Math.max(1, result.total_pages)
    if (result.page > lastPage) {
      pagination.current = lastPage
      await fetchGroups()
      return
    }
    pagination.current = result.page
    tableData.value = result.items
  } catch {
    if (!current.isCurrent()) return
    listFailed.value = true
    tableData.value = []
    pagination.total = 0
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}

function onPageChange(pageInfo: PageInfo) {
  if (loading.value) return
  const pageSize = Math.min(100, Math.max(1, pageInfo.pageSize))
  pagination.current = pageSize !== pagination.pageSize ? 1 : pageInfo.current
  pagination.pageSize = pageSize
  void fetchGroups()
}

const formDialog = reactive({
  visible: false,
  mode: 'create' as 'create' | 'edit',
  group: null as UserGroupItem | null,
})
const submitting = ref(false)

function onCreate() {
  formDialog.mode = 'create'
  formDialog.group = null
  formDialog.visible = true
}

function onEdit(row: UserGroupItem) {
  formDialog.mode = 'edit'
  formDialog.group = row
  formDialog.visible = true
}

async function onFormSubmit(payload: CreateUserGroupPayload | UpdateUserGroupPayload) {
  if (submitting.value) return
  submitting.value = true
  try {
    if (formDialog.mode === 'create') {
      await createUserGroupApi(payload as CreateUserGroupPayload)
      MessagePlugin.success(t('groups.createSuccess'))
    } else if (formDialog.group) {
      await updateUserGroupApi(formDialog.group.id, payload as UpdateUserGroupPayload)
      MessagePlugin.success(t('groups.updateSuccess'))
    }
    formDialog.visible = false
    await fetchGroups()
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    submitting.value = false
  }
}

/* ------------------------------- 成员管理 ------------------------------- */

const membersVisible = ref(false)
const membersGroup = ref<UserGroupItem | null>(null)

function onOpenMembers(row: UserGroupItem) {
  membersGroup.value = row
  membersVisible.value = true
}

/* ------------------------------- 删除确认 ------------------------------- */

type ConfirmAction = () => Promise<void>

const confirmDialog = reactive({
  visible: false,
  title: '',
  content: '',
  loading: false,
})

let pendingAction: ConfirmAction | null = null

const checkingReferences = ref(false)
const referencedModels = ref<ModelGrantSourceModel[]>([])
const referencesHasMore = ref(false)
let referenceRequestId = 0

const canConfirmDelete = computed(() => !checkingReferences.value)

async function checkReferences(id: string) {
  const requestId = ++referenceRequestId
  checkingReferences.value = true
  referencedModels.value = []
  referencesHasMore.value = false
  try {
    const result = await getUserGroupModelGrantsApi(
      id,
      { page: 1, page_size: 100 },
      { skipErrorHandler: true },
    )
    if (requestId !== referenceRequestId || !confirmDialog.visible) return
    referencedModels.value = [...new Map(result.items.map((model) => [model.id, model])).values()]
    referencesHasMore.value = result.page < result.total_pages
  } catch {
    // 预检失败不阻断删除。
  } finally {
    if (requestId === referenceRequestId) checkingReferences.value = false
  }
}

function showReferenceBlocked() {
  confirmDialog.visible = false
  ++referenceRequestId
  checkingReferences.value = false
  const models = [...referencedModels.value]
  const hasMore = referencesHasMore.value
  const dialog = DialogPlugin.alert({
    placement: 'center',
    header: t('groups.delete.blockedTitle'),
    body: () => h(GroupReferenceContent, { models, hasMore }),
    onConfirm: () => dialog.destroy(),
    onClose: () => dialog.destroy(),
  })
}

function openConfirmDialog(options: { title: string; content: string; action: ConfirmAction }) {
  confirmDialog.title = options.title
  confirmDialog.content = options.content
  confirmDialog.visible = true
  pendingAction = options.action
}

async function onConfirmDelete() {
  if (confirmDialog.loading || !canConfirmDelete.value || !pendingAction) return
  confirmDialog.loading = true
  try {
    await pendingAction()
    confirmDialog.visible = false
    ++referenceRequestId
    pendingAction = null
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    confirmDialog.loading = false
  }
}

function onConfirmClose() {
  if (confirmDialog.loading) return
  confirmDialog.visible = false
  ++referenceRequestId
  checkingReferences.value = false
  pendingAction = null
}

function onDelete(row: UserGroupItem) {
  openConfirmDialog({
    title: t('groups.delete.title'),
    content: t('groups.delete.content', { name: row.display_name || row.name }),
    action: async () => {
      try {
        await deleteUserGroupApi(row.id)
        MessagePlugin.success(t('groups.deleteSuccess'))
        await fetchGroups()
      } catch (error) {
        if ((error as NotifiedError).code === 'EXTERNAL_REFERENCE_BLOCKED') {
          showReferenceBlocked()
          return
        }
        throw error
      }
    },
  })
  void checkReferences(row.id)
}

onMounted(fetchGroups)
</script>

<style scoped>
.table-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-xs, 8px);
  margin-bottom: var(--td-comp-margin-l, 16px);
}

.toolbar-search {
  width: 280px;
}

.cell-empty {
  color: var(--td-text-color-placeholder);
}

.cell-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.confirm-content {
  margin: 0 0 var(--td-comp-margin-l, 16px);
  font-size: var(--td-font-size-body-medium, 14px);
  line-height: 22px;
  color: var(--td-text-color-primary);
}
</style>
