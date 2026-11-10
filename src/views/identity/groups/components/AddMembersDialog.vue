<template>
  <t-dialog
    dialog-class-name="stable-async-dialog"
    attach="body"
    :visible="visible"
    :header="t('groups.addMembers.title')"
    width="760px"
    placement="center"
    :close-on-overlay-click="!submitting"
    :confirm-btn="{
      content: t('groups.addMembers.submit', { n: selectedKeys.length }),
      loading: submitting,
      disabled: !selectedKeys.length || loading || !optionsReady || failed,
    }"
    :cancel-btn="{ content: t('common.cancel'), disabled: submitting }"
    :close-btn="!submitting"
    :close-on-esc-keydown="!submitting"
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

    <t-alert v-if="failed && candidates.length" theme="error" :message="t('common.loadFailed')" />
    <t-table
      height="var(--stable-detail-table-height)"
      row-key="id"
      :data="candidates"
      :columns="columns"
      :loading="loading || !optionsReady"
      :selected-row-keys="selectedKeys"
      :max-height="330"
      hover
      @select-change="onSelectChange"
    >
      <template v-if="failed" #empty>{{ t('common.loadFailed') }}</template>
      <template #department="{ row }">
        <span :class="{ 'cell-empty': !row.department }">
          {{ row.department?.display_name ?? '—' }}
        </span>
      </template>
    </t-table>

    <div
      :class="{ 'stable-pagination--pending': !optionsReady || loading || failed }"
      class="add-pagination"
    >
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
const failed = ref(false)
const optionsReady = ref(false)
const submitting = ref(false)
const candidates = ref<UserGroupMember[]>([])
const search = ref('')
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
  optionsReady.value = false
  clearSearchTimer()
  requestSequence++
  loading.value = false
}

async function fetchCandidates() {
  clearSearchTimer()
  if (!props.visible || !props.groupId) return
  const sequence = ++requestSequence
  loading.value = true
  optionsReady.value = false
  failed.value = false
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
    if (sequence === requestSequence) failed.value = true
  } finally {
    if (sequence === requestSequence) {
      loading.value = false
      optionsReady.value = true
    }
  }
}

watch(
  search,
  (value) => {
    if (resetting || !props.visible) return
    invalidateRequests()
    loading.value = true
    failed.value = false
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
  if (submitting.value || loading.value || !optionsReady.value || failed.value) return
  const userIds = [...selectedKeys.value]
  if (!userIds.length) return
  if (userIds.length > 100) {
    MessagePlugin.warning(t('common.selectionLimit', { n: 100 }))
    return
  }
  submitting.value = true
  try {
    await addUserGroupMembersApi(props.groupId, { user_ids: userIds })
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

.cell-empty {
  color: var(--td-text-color-placeholder);
}
</style>
