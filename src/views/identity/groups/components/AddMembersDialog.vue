<template>
  <t-dialog
    attach="body"
    :visible="visible"
    :header="t('groups.addMembers.title')"
    width="760px"
    placement="center"
    :close-on-overlay-click="true"
    :confirm-btn="{
      content: t('groups.addMembers.submit', { n: selectedKeys.length }),
      loading: submitting,
      disabled: !selectedKeys.length || loading || !reason.trim(),
    }"
    :cancel-btn="{ content: t('common.cancel') }"
    @confirm="handleSubmit"
    @close="onClose"
  >
    <div class="add-filter">
      <t-input
        v-model="search"
        autocomplete="off"
        name="group-add-member-filter"
        class="add-filter__input"
        :placeholder="t('groups.addMembers.searchPlaceholder')"
        clearable
      >
        <template #prefix-icon><t-icon name="search" /></template>
      </t-input>
      <department-tree-select
        v-model="departmentId"
        class="add-filter__select"
        :placeholder="t('groups.addMembers.allDepartments')"
        @change="onDepartmentChange"
      />
      <span>{{ t('common.selected', { n: selectedKeys.length }) }}</span>
      <t-button v-if="selectedKeys.length" variant="text" size="small" @click="clearSelection">
        {{ t('common.clearSelection') }}
      </t-button>
    </div>

    <t-table
      row-key="id"
      :data="candidates"
      :columns="columns"
      :loading="loading"
      :selected-row-keys="selectedKeys"
      :max-height="330"
      hover
      @select-change="onSelectChange"
    >
      <template #department="{ row }">
        <span :class="{ 'cell-empty': !row.department }">
          {{ row.department?.display_name ?? '—' }}
        </span>
      </template>
    </t-table>

    <div class="add-pagination">
      <t-pagination
        :current="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        :page-size-options="[10, 20, 50]"
        size="small"
        @current-change="onPageChange"
        @page-size-change="onPageSizeChange"
      />
    </div>

    <t-form class="add-reason" label-width="80px" :data="{ reason }">
      <t-form-item :label="t('groups.addMembers.reason')">
        <t-textarea
          v-model="reason"
          :placeholder="t('groups.addMembers.reasonPlaceholder')"
          :maxlength="512"
          :autosize="{ minRows: 2, maxRows: 3 }"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
import { usePageSelection } from '@/utils/usePageSelection'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import { MessagePlugin, type PaginationProps, type PrimaryTableCol } from 'tdesign-vue-next'

import {
  addUserGroupMembersApi,
  getUserGroupMemberOptionsApi,
  type UserGroupMember,
} from '@/api/modules/identity'

const props = defineProps<{
  visible: boolean
  groupId: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  added: []
}>()

const { t } = useI18n()

const loading = ref(false)
const submitting = ref(false)
const candidates = ref<UserGroupMember[]>([])
const search = ref('')
const reason = ref('')
const departmentId = ref('')
const { selectedKeys, selectRows, clearSelection } = usePageSelection(candidates)
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 10,
  total: 0,
  pageSizeOptions: [10, 20, 50],
})

const columns = computed<PrimaryTableCol<UserGroupMember>[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  { colKey: 'username', title: t('groups.addMembers.columns.username'), width: 160 },
  { colKey: 'display_name', title: t('groups.addMembers.columns.displayName'), width: 120 },
  { colKey: 'department', title: t('groups.addMembers.columns.department'), width: 200 },
])

let requestSequence = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
let resetting = false

function clearSearchTimer() {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer)
    searchTimer = undefined
  }
}

function invalidateRequests() {
  clearSearchTimer()
  requestSequence++
  loading.value = false
}

async function fetchCandidates() {
  clearSearchTimer()
  if (!props.visible || !props.groupId) return
  const sequence = ++requestSequence
  loading.value = true
  try {
    const res = await getUserGroupMemberOptionsApi(props.groupId, {
      page: pagination.current ?? 1,
      page_size: pagination.pageSize ?? 10,
      search: search.value || undefined,
      department_id: departmentId.value || undefined,
    })
    if (sequence !== requestSequence) return
    candidates.value = res.items
    pagination.total = res.total
  } catch {
    // Keep the displayed page; the interceptor reports errors.
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(
  search,
  (value) => {
    if (resetting || !props.visible) return
    invalidateRequests()
    clearSelection()
    pagination.current = 1
    if (!value) {
      void fetchCandidates()
    } else {
      searchTimer = setTimeout(() => {
        searchTimer = undefined
        void fetchCandidates()
      }, 300)
    }
  },
  { flush: 'sync' },
)

watch(
  departmentId,
  () => {
    clearSelection()
  },
  { flush: 'sync' },
)

function onDepartmentChange() {
  if (resetting || !props.visible) return
  // The options endpoint includes descendants; refresh must query even when the ID is unchanged.
  pagination.current = 1
  void fetchCandidates()
}

watch(
  () => props.visible,
  (visible) => {
    invalidateRequests()
    if (!visible) return
    resetting = true
    search.value = ''
    departmentId.value = ''
    reason.value = ''
    clearSelection()
    candidates.value = []
    pagination.current = 1
    pagination.pageSize = 10
    pagination.total = 0
    resetting = false
    void fetchCandidates()
  },
  { immediate: true, flush: 'sync' },
)

onBeforeUnmount(invalidateRequests)

function onSelectChange(keys: Array<string | number>) {
  selectRows(keys)
}

function onPageChange(current: number) {
  if (pagination.current === current) return
  pagination.current = current
  void fetchCandidates()
}

function onPageSizeChange(pageSize: number) {
  if (pagination.pageSize === pageSize) return
  pagination.pageSize = pageSize
  pagination.current = 1
  void fetchCandidates()
}

function onClose() {
  if (submitting.value) return
  invalidateRequests()
  emit('update:visible', false)
}

async function handleSubmit() {
  const userIds = [...selectedKeys.value]
  const value = reason.value.trim()
  if (!userIds.length || !value) return
  if (userIds.length > 100) {
    MessagePlugin.warning(t('common.selectionLimit', { n: 100 }))
    return
  }
  submitting.value = true
  try {
    await addUserGroupMembersApi(props.groupId, { reason: value, user_ids: userIds })
    MessagePlugin.success(t('groups.addMembers.success'))
    emit('added')
    emit('update:visible', false)
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.add-filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--td-comp-margin-s);
  margin-bottom: var(--td-comp-margin-l, 16px);
}

.add-filter__input {
  flex: 1 1 var(--department-filter-field-basis);
  min-width: 0;
  max-width: 100%;
}

.add-filter__select {
  flex: 2 1 var(--department-filter-field-basis);
  min-width: 0;
  max-width: 100%;
}

.add-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--td-comp-margin-s, 12px);
}

.add-reason {
  margin-top: var(--td-comp-margin-l, 16px);
}

.add-reason :deep(.t-form__item) {
  margin-bottom: var(--td-comp-margin-l, 16px);
}

.cell-empty {
  color: var(--td-text-color-placeholder);
}
</style>
