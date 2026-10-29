<template>
  <t-drawer
    :visible="visible"
    :header="group?.display_name || group?.name || t('groups.membersDrawer.title')"
    size="850px"
    :footer="false"
    :close-on-overlay-click="!addVisible && !removeDialog.visible"
    :close-btn="true"
    @close="onClose"
  >
    <div v-if="group" class="members">
      <p v-if="group.display_description || group.description" class="members__desc">
        {{ group.display_description || group.description }}
      </p>
      <p v-if="!canWrite" class="members__hint">{{ t('groups.writeBlocked') }}</p>

      <div class="members__head">
        <h3 class="members__title">{{ t('groups.membersDrawer.sectionTitle') }}</h3>
        <t-space :size="8">
          <span>{{ t('common.selected', { n: selectedKeys.length }) }}</span>
          <t-button v-if="selectedKeys.length" variant="text" size="small" @click="clearSelection">
            {{ t('common.clearSelection') }}
          </t-button>
          <t-button
            v-permission.write="'identity.groups'"
            theme="danger"
            variant="outline"
            :disabled="!canWrite || !selectedKeys.length"
            @click="openRemove([...selectedKeys])"
          >
            {{ t('groups.membersDrawer.remove') }}
          </t-button>
          <t-button
            v-permission.write="'identity.groups'"
            theme="primary"
            :disabled="!canWrite"
            @click="addVisible = true"
          >
            <template #icon><t-icon name="add" /></template>
            {{ t('groups.membersDrawer.add') }}
          </t-button>
        </t-space>
      </div>

      <div class="members__filter">
        <t-input
          v-model="search"
          autocomplete="off"
          name="group-member-filter"
          class="members__search"
          :placeholder="t('groups.membersDrawer.searchPlaceholder')"
          clearable
        >
          <template #prefix-icon><t-icon name="search" /></template>
        </t-input>
        <department-tree-select
          v-model="departmentId"
          class="members__select"
          :placeholder="t('groups.membersDrawer.allDepartments')"
          @change="onDepartmentChange"
        />
      </div>

      <t-table
        row-key="id"
        :data="members"
        :columns="columns"
        :loading="loading"
        :selected-row-keys="selectedKeys"
        hover
        @select-change="onSelectChange"
      >
        <template #department="{ row }">
          <span :class="{ 'cell-empty': !row.department }">
            {{ row.department?.display_name ?? '—' }}
          </span>
        </template>
        <template #action="{ row }">
          <t-link
            v-permission.write="'identity.groups'"
            theme="danger"
            hover="color"
            :disabled="!canWrite"
            @click="openRemove([row.id])"
          >
            {{ t('groups.membersDrawer.removeAction') }}
          </t-link>
        </template>
      </t-table>

      <div class="members__footer">
        <t-pagination
          class="members__pagination"
          :current="pagination.current"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          :page-size-options="[10, 20, 50]"
          size="small"
          @current-change="onPageChange"
          @page-size-change="onPageSizeChange"
        />
      </div>
    </div>

    <t-dialog
      attach="body"
      :visible="removeDialog.visible"
      :header="t('groups.membersDrawer.removeTitle')"
      width="480px"
      :close-on-overlay-click="false"
      :confirm-btn="{
        content: t('common.confirm'),
        theme: 'danger',
        loading: removeDialog.loading,
        disabled: !canWrite || !removeDialog.reason.trim(),
      }"
      :cancel-btn="{ content: t('common.cancel') }"
      @confirm="confirmRemove"
      @close="removeDialog.visible = false"
    >
      <p class="confirm-content">{{ removeContent }}</p>
      <t-form label-width="80px" :data="removeDialog">
        <t-form-item :label="t('groups.membersDrawer.removeReason')">
          <t-textarea
            v-model="removeDialog.reason"
            :placeholder="t('groups.membersDrawer.removeReasonPlaceholder')"
            :maxlength="512"
            :autosize="{ minRows: 3, maxRows: 4 }"
          />
        </t-form-item>
      </t-form>
    </t-dialog>

    <add-members-dialog
      v-if="group"
      v-model:visible="addVisible"
      :group-id="group.id"
      @added="onMembersAdded"
    />
  </t-drawer>
</template>

<script setup lang="ts">
import { usePageSelection } from '@/utils/usePageSelection'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import { MessagePlugin, type PaginationProps, type PrimaryTableCol } from 'tdesign-vue-next'

import AddMembersDialog from './AddMembersDialog.vue'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import {
  getUserGroupMembersApi,
  removeUserGroupMembersApi,
  type UserGroupItem,
  type UserGroupMember,
} from '@/api/modules/identity'

const props = defineProps<{
  visible: boolean
  group: UserGroupItem | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 成员变更后通知列表刷新成员数 */
  updated: []
}>()

const { t } = useI18n()
const userStore = useUserStore()

let memberRequest = 0

const loading = ref(false)
const members = ref<UserGroupMember[]>([])
const search = ref('')
const departmentId = ref('')
const { selectedKeys, selectRows, clearSelection } = usePageSelection(members)
const addVisible = ref(false)
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 10,
  total: 0,
  pageSizeOptions: [10, 20, 50],
})

const columns = computed<PrimaryTableCol<UserGroupMember>[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  { colKey: 'username', title: t('groups.membersDrawer.columns.username'), width: 180 },
  { colKey: 'display_name', title: t('groups.membersDrawer.columns.displayName'), width: 140 },
  { colKey: 'department', title: t('groups.membersDrawer.columns.department'), width: 220 },
  { colKey: 'action', title: t('groups.membersDrawer.columns.action'), width: 90 },
])

/** 是否可写：无管理权限或存在写入阻断码时只读 */
const canWrite = computed(
  () =>
    canWriteResource(userStore.permissions, 'identity.groups') &&
    !!props.group?.can_manage &&
    !props.group?.write_blocking_code,
)

watch(
  departmentId,
  () => {
    clearSelection()
  },
  { flush: 'sync' },
)

function onDepartmentChange() {
  pagination.current = 1
  if (props.visible) void fetchMembers()
}

watch(search, () => {
  clearSelection()
  pagination.current = 1
  if (props.visible) void fetchMembers()
})

async function fetchMembers(): Promise<void> {
  if (!props.group) return
  const requestId = ++memberRequest
  loading.value = true
  try {
    const result = await getUserGroupMembersApi(props.group.id, {
      page: pagination.current ?? 1,
      page_size: pagination.pageSize ?? 10,
      search: search.value.trim() || undefined,
      department_id: departmentId.value || undefined,
    })
    if (requestId !== memberRequest) return
    pagination.total = result.total
    pagination.pageSize = Math.min(100, Math.max(1, result.page_size))
    const lastPage = Math.max(1, result.total_pages)
    if (result.page > lastPage) {
      pagination.current = lastPage
      await fetchMembers()
      return
    }
    pagination.current = result.page
    members.value = result.items
  } catch {
    if (requestId !== memberRequest) return
    members.value = []
    pagination.total = 0
  } finally {
    if (requestId === memberRequest) loading.value = false
  }
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      ++memberRequest
      loading.value = false
      return
    }
    search.value = ''
    departmentId.value = ''
    clearSelection()
    pagination.current = 1
    await fetchMembers()
  },
)

function onSelectChange(keys: Array<string | number>) {
  selectRows(keys)
}

function onPageChange(current: number) {
  if (loading.value) return
  pagination.current = current
  void fetchMembers()
}

function onPageSizeChange(pageSize: number) {
  if (loading.value) return
  pagination.pageSize = Math.min(100, Math.max(1, pageSize))
  pagination.current = 1
  void fetchMembers()
}

function onClose() {
  emit('update:visible', false)
}

/* ------------------------------- 移除成员 ------------------------------- */

const removeDialog = reactive({ visible: false, loading: false, reason: '' })
const removeTargets = ref<string[]>([])

const removeContent = computed(() =>
  t('groups.membersDrawer.removeContent', {
    name: props.group?.display_name || props.group?.name || '',
    n: removeTargets.value.length,
  }),
)

function openRemove(ids: string[]) {
  if (!canWrite.value || !ids.length) return
  if (ids.length > 100) {
    MessagePlugin.warning(t('common.selectionLimit', { n: 100 }))
    return
  }
  removeTargets.value = ids
  removeDialog.reason = ''
  removeDialog.visible = true
}

async function confirmRemove() {
  if (!canWrite.value || !props.group || !removeTargets.value.length) return
  const reason = removeDialog.reason.trim()
  if (!reason) return
  removeDialog.loading = true
  try {
    await removeUserGroupMembersApi(props.group.id, {
      reason,
      user_ids: removeTargets.value,
    })
    MessagePlugin.success(t('groups.membersDrawer.removeSuccess'))
    removeDialog.visible = false
    clearSelection()
    await fetchMembers()
    emit('updated')
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    removeDialog.loading = false
  }
}

async function onMembersAdded() {
  await fetchMembers()
  emit('updated')
}
</script>

<style scoped>
.members {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l, 16px);
}

.members__desc {
  margin: 0;
  padding: var(--td-comp-paddingTB-s, 12px) var(--td-comp-paddingLR-l, 16px);
  border-radius: var(--td-radius-medium, 6px);
  background: var(--td-bg-color-container-hover, #f3f3f3);
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small, 13px);
  line-height: 20px;
}

.members__hint {
  margin: 0;
  padding: var(--td-comp-paddingTB-s, 12px) var(--td-comp-paddingLR-l, 16px);
  border-radius: var(--td-radius-medium, 6px);
  background: var(--td-warning-color-light, #fff1e9);
  color: var(--td-warning-color, #e37318);
  font-size: var(--td-font-size-body-small, 13px);
  line-height: 20px;
}

.members__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-s, 12px);
}

.members__title {
  margin: 0;
  font-size: var(--td-font-size-title-medium, 16px);
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.members__filter {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--td-comp-margin-s, 12px);
}

.members__search {
  flex: 1 1 var(--department-filter-field-basis);
  min-width: 0;
  max-width: 100%;
}

.members__select {
  flex: 2 1 var(--department-filter-field-basis);
  min-width: 0;
  max-width: 100%;
}

/* .members__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-s, 12px);
  row-gap: var(--td-comp-margin-s);
} */

.members__pagination {
  width: auto;
  margin-left: auto;
}

.confirm-content {
  margin: 0;
  font-size: var(--td-font-size-body-medium, 14px);
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.cell-empty {
  color: var(--td-text-color-placeholder);
}
</style>
