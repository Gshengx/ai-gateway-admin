<template>
  <div class="page-container">
    <div class="users-layout">
      <t-card :bordered="false" class="users-dept">
        <div class="dept-header">
          <span class="dept-header__title">{{ t('users.departments.title') }}</span>
          <t-button
            variant="text"
            shape="square"
            size="small"
            :loading="departmentRefreshing"
            :title="t('users.departments.refresh')"
            :aria-label="t('users.departments.refresh')"
            @click="onRefreshDepartments"
          >
            <template #icon><t-icon name="refresh" /></template>
          </t-button>
        </div>
        <t-input
          v-model="departmentKeyword"
          name="department-filter"
          autocomplete="off"
          :placeholder="t('users.departments.searchPlaceholder')"
          clearable
        >
          <template #prefix-icon><t-icon name="search" /></template>
        </t-input>

        <t-tree
          v-if="treeData.length"
          class="dept-tree"
          :data="treeData"
          lazy
          :load="loadDepartmentChildren"
          :keys="{ value: 'id', label: 'label' }"
          :label="true"
          activable
          :actived="activedKeys"
          :expanded="treeExpandedKeys"
          :draggable="canWriteUsers"
          :allow-drop="allowDrop"
          hover
          value-mode="all"
          @active="onTreeActive"
          @expand="onTreeExpand"
          @drop="onTreeDrop"
        >
          <template #label="{ node }">
            <span class="dept-node">
              <span
                class="dept-node__name"
                :title="node.data?.path"
                v-html="highlightName(node.data?.name ?? '')"
              ></span>
              <span class="dept-count">{{ node.data?.user_count }}</span>
              <span v-if="canWriteUsers" class="dept-node__more-wrap" @click.stop>
                <t-dropdown
                  trigger="click"
                  placement="bottom-right"
                  :options="departmentMenuOptions(node.data)"
                  @click="onDepartmentMenu($event, node.data)"
                >
                  <t-button
                    class="dept-node__more"
                    variant="text"
                    shape="square"
                    size="small"
                    :aria-label="t('users.departments.actions')"
                  >
                    <t-icon name="ellipsis" />
                  </t-button>
                </t-dropdown>
              </span>
            </span>
          </template>
        </t-tree>
        <p v-else class="dept-empty">
          {{
            departmentKeyword ? t('users.departments.searchEmpty') : t('users.departments.empty')
          }}
        </p>
      </t-card>

      <div class="users-main">
        <filter-bar @search="onSearch" @reset="onReset">
          <t-col :span="5">
            <t-input
              v-model="query.search"
              name="user-list-filter"
              autocomplete="off"
              :placeholder="t('users.searchPlaceholder')"
              clearable
            />
          </t-col>
          <t-col :span="2">
            <t-select
              v-model="query.status"
              :options="statusOptions"
              :placeholder="t('users.allStatus')"
              clearable
            />
          </t-col>
          <t-col :span="2">
            <t-select
              v-model="query.role_id"
              :options="roleSelectOptions"
              :placeholder="t('users.allRoles')"
              clearable
            />
          </t-col>
        </filter-bar>

        <t-card :bordered="false">
          <div class="table-toolbar">
            <t-space>
              <t-button v-permission.write="'identity.users'" theme="primary" @click="onCreate">
                <template #icon><t-icon name="add" /></template>
                {{ t('users.create') }}
              </t-button>
              <t-button
                v-permission.write="'identity.users'"
                variant="outline"
                @click="importVisible = true"
              >
                {{ t('users.import') }}
              </t-button>
            </t-space>
            <t-space align="center">
              <span v-if="selectedKeys.length" class="table-toolbar__selected">
                {{ t('common.selected', { n: selectedKeys.length }) }}
              </span>
              <t-button
                v-if="selectedKeys.length"
                variant="text"
                size="small"
                @click="clearSelection"
              >
                {{ t('common.clearSelection') }}
              </t-button>
              <t-button
                v-permission.write="'identity.users'"
                size="small"
                :disabled="!selectedKeys.length"
                @click="onBatchStatus('ACTIVE')"
              >
                {{ t('users.enable') }}
              </t-button>
              <t-button
                v-permission.write="'identity.users'"
                size="small"
                :disabled="!selectedKeys.length"
                @click="onBatchStatus('DISABLED')"
              >
                {{ t('users.disable') }}
              </t-button>
              <t-button
                v-permission.write="'identity.users'"
                size="small"
                theme="danger"
                variant="outline"
                :disabled="!selectedKeys.length"
                @click="onBatchDelete"
              >
                {{ t('users.delete') }}
              </t-button>
            </t-space>
          </div>

          <t-table
            row-key="id"
            :data="tableData"
            :columns="columns"
            :loading="loading"
            :selected-row-keys="selectedKeys"
            :pagination="pagination"
            :scroll="{ x: 1408 }"
            hover
            @select-change="onSelectChange"
            @page-change="onPageChange"
          >
            <template #username="{ row }">
              <t-link theme="primary" hover="color" @click="onView(row)">
                {{ row.username }}
              </t-link>
            </template>
            <template #email="{ row }">
              <span :class="{ 'cell-empty': !row.email }">{{ row.email ?? '—' }}</span>
            </template>
            <template #department="{ row }">
              <span :class="{ 'cell-empty': !row.department }">
                {{ row.department?.display_name ?? '—' }}
              </span>
            </template>
            <template #groups="{ row }">
              <t-space v-if="row.groups.length" :size="4">
                <t-tag size="small" variant="light">{{ row.groups[0].display_name }}</t-tag>
                <t-tag v-if="row.groups.length > 1" size="small" variant="outline">
                  +{{ row.groups.length - 1 }}
                </t-tag>
              </t-space>
              <span v-else class="cell-empty">—</span>
            </template>
            <template #role="{ row }">
              <span :class="{ 'cell-empty': !row.role }">
                {{ row.role?.display_name ?? '—' }}
              </span>
            </template>
            <template #status="{ row }">
              <span class="status-cell">
                <span class="status-dot" :class="`status-dot--${row.status}`"></span>
                {{ row.status === 'ACTIVE' ? t('users.statusEnabled') : t('users.statusDisabled') }}
              </span>
            </template>
            <template #last_login_at="{ row }">
              <span :class="{ 'cell-empty': !row.last_login_at }">
                {{ formatDateTime(row.last_login_at) || '—' }}
              </span>
            </template>
            <template #action="{ row }">
              <t-space :size="12">
                <t-link
                  v-permission.write="'identity.users'"
                  theme="primary"
                  hover="color"
                  @click="onEdit(row)"
                >
                  {{ t('users.edit') }}
                </t-link>
                <t-link
                  v-permission.write="'identity.users'"
                  theme="primary"
                  hover="color"
                  @click="onResetPassword(row)"
                >
                  {{ t('users.resetPassword') }}
                </t-link>
              </t-space>
            </template>
          </t-table>
        </t-card>
      </div>
    </div>

    <user-form-drawer
      v-model:visible="drawerVisible"
      :mode="drawerMode"
      :user="editingUser"
      :role-options="formRoleOptions"
      :default-department-id="selectedDepartmentId"
      :submitting="submitting"
      @submit="onDrawerSubmit"
    />

    <user-detail-drawer v-model:visible="detailVisible" :user="detailUser" />

    <user-import-dialog v-model:visible="importVisible" @imported="refreshAll" />

    <department-form-dialog
      v-model:visible="deptDialog.visible"
      :mode="deptDialog.mode"
      :department="deptDialog.department"
      :parent="deptDialog.parent"
      :parent-label="deptParentLabel"
      :siblings="deptSiblings"
      :parent-level="deptParentLevel"
      :total-count="departments.length"
      :submitting="deptSubmitting"
      @submit="onDepartmentSubmit"
    />

    <t-dialog
      :visible="reasonDialog.visible"
      :header="reasonDialog.title"
      width="480px"
      :close-on-overlay-click="false"
      :confirm-btn="{
        content: t('common.confirm'),
        loading: reasonDialog.loading,
        disabled: !canConfirmReason,
      }"
      :cancel-btn="{ content: t('common.cancel') }"
      @confirm="onReasonConfirm"
      @close="onReasonClose"
    >
      <p class="confirm-content">{{ reasonDialog.content }}</p>
      <t-form label-width="80px" :data="reasonDialog">
        <t-form-item :label="t('users.confirm.reason')">
          <t-textarea
            v-model="reasonDialog.reason"
            :placeholder="t('users.confirm.reasonPlaceholder')"
            :maxlength="512"
            :autosize="{ minRows: 3, maxRows: 4 }"
          />
        </t-form-item>
      </t-form>
    </t-dialog>

    <t-dialog
      :visible="passwordDialog.visible"
      :header="t('users.reset.title')"
      width="440px"
      :confirm-btn="{ content: t('users.reset.copy') }"
      :cancel-btn="{ content: t('common.close') }"
      @confirm="copyPassword"
      @close="passwordDialog.visible = false"
    >
      <p class="confirm-content">
        {{ t('users.reset.tip', { name: passwordDialog.username }) }}
      </p>
      <div class="reset-password">{{ passwordDialog.password }}</div>
    </t-dialog>

    <t-dialog
      lazy
      destroy-on-close
      :visible="reauthDialog.visible"
      :header="t('users.reauth.title')"
      width="440px"
      :close-on-overlay-click="false"
      :confirm-btn="{ content: t('common.confirm'), disabled: !canConfirmReauth }"
      :cancel-btn="{ content: t('common.cancel') }"
      @confirm="onReauthConfirm"
      @close="onReauthClose"
    >
      <p class="confirm-content">{{ t('users.reauth.content') }}</p>
      <t-input
        v-model="reauthDialog.password"
        type="password"
        autocomplete="current-password"
        name="user-list-reauth"
        :placeholder="t('users.reauth.password')"
      />
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { usePageSelection } from '@/utils/usePageSelection'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MessagePlugin,
  type DropdownProps,
  type PageInfo,
  type PaginationProps,
  type PrimaryTableCol,
  type TreeNodeModel,
  type TreeOptionData,
} from 'tdesign-vue-next'

import FilterBar from '@/components/FilterBar.vue'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import { reauthApi, type ReauthIntent } from '@/api/modules/auth'
import type { NotifiedError } from '@/api/request'
import { formatDateTime } from '@/utils/datetime'
import DepartmentFormDialog from './components/DepartmentFormDialog.vue'
import UserDetailDrawer from './components/UserDetailDrawer.vue'
import UserFormDrawer from './components/UserFormDrawer.vue'
import UserImportDialog from './components/UserImportDialog.vue'
import {
  batchDisableUsersApi,
  batchEnableUsersApi,
  createDepartmentApi,
  createUserApi,
  deleteDepartmentApi,
  deleteUserApi,
  getDepartmentDeletePreviewApi,
  getDepartmentListApi,
  getRoleOptionsApi,
  getUserRoleOptionsApi,
  getUserListApi,
  placeDepartmentApi,
  resetUserPasswordApi,
  updateDepartmentApi,
  updateUserApi,
  type CreateDepartmentPayload,
  type CreateUserPayload,
  type DepartmentItem,
  type DepartmentPlacement,
  type RoleOption,
  type UpdateDepartmentPayload,
  type UpdateUserPayload,
  type UserItem,
  type UserStatus,
} from '@/api/modules/identity'

interface TreeDataNode extends TreeOptionData {
  id: string
  name: string
  path: string
  parent_id: string | null
  depth: number
  user_count: number
  has_children: boolean
  label: string
  children?: TreeDataNode[] | true
}

const { t } = useI18n()
const userStore = useUserStore()
const canWriteUsers = computed(() => canWriteResource(userStore.permissions, 'identity.users'))

const query = reactive({
  search: '',
  status: '' as '' | UserStatus,
  role_id: '',
})

const selectedDepartmentId = ref('')
const departmentKeyword = ref('')
const departments = ref<DepartmentItem[]>([])
const departmentRefreshing = ref(false)
const roleOptions = ref<RoleOption[]>([])
const formRoleOptions = ref<RoleOption[]>([])

const statusOptions = computed(() => [
  { label: t('users.statusEnabled'), value: 'ACTIVE' },
  { label: t('users.statusDisabled'), value: 'DISABLED' },
])

const roleSelectOptions = computed(() =>
  roleOptions.value.map((role) => ({ label: role.display_name, value: role.id })),
)

const departmentMap = computed(() => new Map(departments.value.map((item) => [item.id, item])))

/** 部门全路径（按展示名称拼接，用于下拉选项与只读展示） */
function departmentPath(id: string): string {
  const names: string[] = []
  let department = departmentMap.value.get(id)
  while (department) {
    names.unshift(department.display_name)
    department = department.parent_id ? departmentMap.value.get(department.parent_id) : undefined
  }
  return names.join('/')
}

/** 后端返回扁平部门列表，这里按 parent_id 组装成树并计算路径 */
function buildTree(items: DepartmentItem[]): TreeDataNode[] {
  const nodes = new Map<string, TreeDataNode>()
  items.forEach((item) => {
    nodes.set(item.id, {
      id: item.id,
      name: item.display_name,
      path: '',
      parent_id: item.parent_id ?? null,
      depth: item.depth,
      user_count: item.user_count,
      has_children: item.has_children,
      label: item.display_name,
      children: [],
    })
  })

  const roots: TreeDataNode[] = []
  const ordered = [...items].sort(
    (a, b) => a.depth - b.depth || a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
  ordered.forEach((item) => {
    const node = nodes.get(item.id)
    if (!node) return
    const parent = item.parent_id ? nodes.get(item.parent_id) : undefined
    if (parent && Array.isArray(parent.children)) parent.children.push(node)
    else roots.push(node)
  })

  const fillPath = (list: TreeDataNode[], prefix: string) => {
    list.forEach((node) => {
      node.path = prefix ? `${prefix}/${node.name}` : node.name
      if (Array.isArray(node.children) && node.children.length) {
        fillPath(node.children, node.path)
      } else {
        delete node.children
      }
    })
  }
  fillPath(roots, '')
  return roots
}

const lazyTree = ref<TreeDataNode[]>([])
const searchTree = ref<TreeDataNode[]>([])
const departmentChildrenInFlight = new Map<string, Promise<TreeDataNode[]>>()
let departmentSession = 0
let searchVersion = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
const isDepartmentSearching = computed(() => Boolean(departmentKeyword.value.trim()))
const treeData = computed(() => (isDepartmentSearching.value ? searchTree.value : lazyTree.value))

function mergeDepartments(items: DepartmentItem[]) {
  const byId = new Map(departments.value.map((item) => [item.id, item]))
  items.forEach((item) => byId.set(item.id, item))
  departments.value = [...byId.values()]
}

function departmentNodes(items: DepartmentItem[], parentPath = ''): TreeDataNode[] {
  return items.map((item) => ({
    id: item.id,
    name: item.display_name,
    path: parentPath ? `${parentPath}/${item.display_name}` : item.display_name,
    parent_id: item.parent_id,
    depth: item.depth,
    user_count: item.user_count,
    has_children: item.has_children,
    label: item.display_name,
    children: item.has_children ? true : undefined,
  }))
}

function loadDepartmentChildren(node: Pick<TreeNodeModel, 'value'>): Promise<TreeDataNode[]> {
  if (isDepartmentSearching.value) return Promise.resolve([])
  const session = departmentSession
  const parent = findTreeNode(lazyTree.value, String(node.value))
  if (!parent) return Promise.resolve([])
  const inFlight = departmentChildrenInFlight.get(parent.id)
  if (inFlight) return inFlight
  if (Array.isArray(parent.children)) return Promise.resolve(parent.children)
  const request = (async () => {
    try {
      const result = await getDepartmentListApi({ parent_id: parent.id })
      if (session !== departmentSession) return []
      const children = departmentNodes(result.items, parent.path)
      const attach = (nodes: TreeDataNode[]): boolean => {
        for (const item of nodes) {
          if (item.id === parent.id) {
            item.children = children
            return true
          }
          if (Array.isArray(item.children) && attach(item.children)) return true
        }
        return false
      }
      attach(lazyTree.value)
      mergeDepartments(result.items)
      return children
    } catch {
      // Request errors are reported by the interceptor.
      return []
    }
  })().finally(() => {
    if (departmentChildrenInFlight.get(parent.id) === request) {
      departmentChildrenInFlight.delete(parent.id)
    }
  })
  departmentChildrenInFlight.set(parent.id, request)
  return request
}

function searchDepartments() {
  clearTimeout(searchTimer)
  const version = ++searchVersion
  const session = departmentSession
  const keyword = departmentKeyword.value.trim()
  searchTree.value = []
  if (!keyword) return
  searchTimer = setTimeout(async () => {
    try {
      const result = await getDepartmentListApi({ search: keyword })
      if (version !== searchVersion || session !== departmentSession) return
      mergeDepartments(result.items)
      searchTree.value = buildTree(result.items)
    } catch {
      // Request errors are reported by the interceptor.
    }
  }, 300)
}

watch(departmentKeyword, searchDepartments, { flush: 'sync' })
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  departmentSession += 1
  searchVersion += 1
})

const expandedKeys = ref<Array<string | number>>([])
const treeExpandedKeys = computed<Array<string | number>>(() => {
  if (!isDepartmentSearching.value) {
    // Expanding placeholder nodes with children === true triggers lazy loading.
    return expandedKeys.value
  }
  const keys: string[] = []
  const collect = (nodes: TreeDataNode[]) => {
    nodes.forEach((node) => {
      if (Array.isArray(node.children) && node.children.length) {
        keys.push(node.id)
        collect(node.children)
      }
    })
  }
  collect(searchTree.value)
  return keys
})

function onTreeExpand(value: Array<string | number>) {
  if (!isDepartmentSearching.value) expandedKeys.value = [...value]
}

function resetExpandedKeys() {
  expandedKeys.value = lazyTree.value.filter((node) => node.has_children).map((node) => node.id)
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char] ?? char)
}

/** 部门名称高亮：先转义再包裹命中片段，避免 XSS */
function highlightName(name: string): string {
  const keyword = departmentKeyword.value.trim()
  if (!keyword) return escapeHtml(name)
  const index = name.toLowerCase().indexOf(keyword.toLowerCase())
  if (index < 0) return escapeHtml(name)
  const end = index + keyword.length
  return `${escapeHtml(name.slice(0, index))}<mark class="dept-hit">${escapeHtml(
    name.slice(index, end),
  )}</mark>${escapeHtml(name.slice(end))}`
}

/** 部门层级上限（含根节点） */
const MAX_DEPARTMENT_LEVEL = 10

/** 根节点层级归一化为 1（后端 depth 可能从 0 或 1 开始） */
const rootDepth = computed(() => {
  if (!departments.value.length) return 0
  return departments.value.reduce(
    (min, item) => Math.min(min, item.depth),
    departments.value[0].depth,
  )
})

function departmentLevel(item: Pick<DepartmentItem, 'depth'>): number {
  return item.depth - rootDepth.value + 1
}

const activedKeys = computed(() => (selectedDepartmentId.value ? [selectedDepartmentId.value] : []))

const columns = computed<PrimaryTableCol<UserItem>[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48, fixed: 'left' },
  { colKey: 'username', title: t('users.columns.username'), width: 140 },
  { colKey: 'display_name', title: t('users.columns.displayName'), width: 100 },
  { colKey: 'email', title: t('users.columns.email'), width: 200, ellipsis: true },
  { colKey: 'department', title: t('users.columns.department'), width: 160, ellipsis: true },
  { colKey: 'groups', title: t('users.columns.groups'), width: 130 },
  { colKey: 'role', title: t('users.columns.role'), width: 120 },
  { colKey: 'status', title: t('users.columns.status'), width: 100 },
  { colKey: 'last_login_at', title: t('users.columns.lastLogin'), width: 170 },
  { colKey: 'action', title: t('users.columns.action'), width: 140, fixed: 'right' },
])

/**
 * 用户列表使用后端页码分页（page / page_size），
 * total / total_pages 均由后端返回，前端不再本地截取。
 */
const BATCH_LIMIT = 100

const loading = ref(false)
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [10, 20, 50],
})

const tableData = ref<UserItem[]>([])
const { selectedKeys, selectRows, clearSelection } = usePageSelection(tableData)
watch(
  [query, selectedDepartmentId],
  () => {
    clearSelection()
  },
  { flush: 'sync' },
)

const defaultDepartmentId = ref('')

async function fetchDepartments() {
  const session = ++departmentSession
  departmentChildrenInFlight.clear()
  clearTimeout(searchTimer)
  searchVersion += 1
  searchTree.value = []
  lazyTree.value = []
  departments.value = []
  expandedKeys.value = []
  try {
    const result = await getDepartmentListApi()
    if (session !== departmentSession) return
    departments.value = result.items
    lazyTree.value = departmentNodes(result.items)
    defaultDepartmentId.value = result.scope_root_id ?? ''
    if (!departments.value.some((item) => item.id === selectedDepartmentId.value)) {
      selectedDepartmentId.value = defaultDepartmentId.value
    }
    resetExpandedKeys()
    await Promise.all(
      lazyTree.value
        .filter((node) => expandedKeys.value.includes(node.id) && !Array.isArray(node.children))
        .map((node) => loadDepartmentChildren({ value: node.id })),
    )
  } catch {
    // Request errors are reported by the interceptor.
  } finally {
    if (session === departmentSession && isDepartmentSearching.value) searchDepartments()
  }
}

async function onRefreshDepartments() {
  if (departmentRefreshing.value) return
  departmentRefreshing.value = true
  try {
    await fetchDepartments()
    if (
      selectedDepartmentId.value &&
      !departments.value.some((department) => department.id === selectedDepartmentId.value)
    ) {
      selectedDepartmentId.value = defaultDepartmentId.value
    }
  } finally {
    departmentRefreshing.value = false
  }
}

async function fetchRoles() {
  try {
    const res = await getUserRoleOptionsApi()
    roleOptions.value = res.items ?? []
  } catch {
    roleOptions.value = []
  }
}

async function fetchFormRoles() {
  try {
    formRoleOptions.value = (await getRoleOptionsApi()).items
  } catch {
    formRoleOptions.value = []
  }
}

async function fetchUsers(options: { resetPage?: boolean } = {}) {
  if (options.resetPage) pagination.current = 1
  loading.value = true
  try {
    const page = pagination.current ?? 1
    const res = await getUserListApi({
      page,
      page_size: Math.min(100, Math.max(1, pagination.pageSize ?? 20)),
      search: query.search.trim() || undefined,
      status: query.status || undefined,
      department_id: selectedDepartmentId.value || undefined,
      role_id: query.role_id || undefined,
    })
    tableData.value = res.items ?? []
    pagination.total = res.total ?? 0
    // 当前页超出总页数（例如删除末页数据后）时回退到最后一页
    const totalPages = Math.max(1, res.total_pages ?? 0)
    if (page > totalPages) {
      pagination.current = totalPages
      await fetchUsers()
    }
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

async function refreshAll() {
  await Promise.all([fetchUsers(), fetchDepartments()])
}

function onSearch() {
  fetchUsers({ resetPage: true })
}

function onReset() {
  query.search = ''
  query.status = ''
  query.role_id = ''
  // 重置后回到默认范围：操作者本部门
  selectedDepartmentId.value = defaultDepartmentId.value
  fetchUsers({ resetPage: true })
}

function onTreeActive(value: Array<string | number>) {
  selectedDepartmentId.value = value.length ? String(value[value.length - 1]) : ''
  fetchUsers({ resetPage: true })
}

function onPageChange(pageInfo: PageInfo) {
  const pageSize = Math.min(100, Math.max(1, pageInfo.pageSize))
  pagination.current = pageSize !== pagination.pageSize ? 1 : pageInfo.current
  pagination.pageSize = pageSize
  fetchUsers()
}

function onSelectChange(keys: Array<string | number>) {
  selectRows(keys)
}

/* ------------------------------- 部门维护 ------------------------------- */

const deptDialog = reactive({
  visible: false,
  mode: 'create' as 'create' | 'edit',
  department: null as DepartmentItem | null,
  parent: null as DepartmentItem | null,
})
const deptSubmitting = ref(false)

const deptParentLabel = computed(() => {
  const parentId =
    deptDialog.mode === 'edit' ? deptDialog.department?.parent_id : deptDialog.parent?.id
  return parentId ? departmentPath(parentId) : t('users.departments.form.parentRoot')
})

/** 同级部门（编辑时排除自身），用于同级重名校验 */
const deptSiblings = ref<DepartmentItem[]>([])
let siblingsVersion = 0

async function fetchDeptSiblings(parentId: string | null | undefined, selfId = '') {
  const version = ++siblingsVersion
  deptSiblings.value = []
  if (!parentId) return
  try {
    const result = await getDepartmentListApi({ parent_id: parentId })
    if (version !== siblingsVersion) return
    deptSiblings.value = result.items.filter((item) => item.id !== selfId)
  } catch {
    // Fall back to server validation.
  }
}

/** 新建部门时父级所在层级（根节点为 1 级），用于 10 级层级校验 */
const deptParentLevel = computed(() => {
  const parentId =
    deptDialog.mode === 'edit' ? deptDialog.department?.parent_id : deptDialog.parent?.id
  const parent = parentId ? departmentMap.value.get(parentId) : null
  return parent ? departmentLevel(parent) : 0
})

/* ------------------------------- 拖拽移动 ------------------------------- */

interface TreeDropContext {
  dragNode: TreeNodeModel
  dropNode: TreeNodeModel
  dropPosition: number
}

function findTreeNode(nodes: TreeDataNode[], id: string): TreeDataNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (Array.isArray(node.children) && node.children.length) {
      const found = findTreeNode(node.children, id)
      if (found) return found
    }
  }
  return undefined
}

function subtreeHeight(node: TreeDataNode): number {
  if (!Array.isArray(node.children) || !node.children.length) return 1
  return 1 + Math.max(...node.children.map(subtreeHeight))
}

/** id 是否为 ancestorId 的子孙节点（用于阻止移动到自身子树内） */
function isDescendantOf(id: string, ancestorId: string): boolean {
  let department = departmentMap.value.get(id)
  while (department?.parent_id) {
    if (department.parent_id === ancestorId) return true
    department = departmentMap.value.get(department.parent_id)
  }
  return false
}

function allowDrop(context: TreeDropContext): boolean {
  if (!canWriteUsers.value) return false
  const drag = context.dragNode.data as TreeDataNode
  const drop = context.dropNode.data as TreeDataNode
  // 根节点代表整个组织，不参与移动
  if (!drag.parent_id) return false
  if (drop.id === drag.id || isDescendantOf(drop.id, drag.id)) return false
  // 根节点只能作为「放入下级」的落点，不能放到其前后成为并列根节点
  if (!drop.parent_id && context.dropPosition !== 0) return false
  // 移动后最深层级不能超过上限
  const height = subtreeHeight(findTreeNode(treeData.value, drag.id) ?? drag)
  const baseLevel = context.dropPosition === 0 ? departmentLevel(drop) : departmentLevel(drop) - 1
  if (baseLevel + height > MAX_DEPARTMENT_LEVEL) {
    MessagePlugin.warning(t('users.departments.levelLimitMove', { max: MAX_DEPARTMENT_LEVEL }))
    return false
  }
  return true
}

async function onTreeDrop(context: TreeDropContext) {
  if (!canWriteUsers.value) return
  const drag = context.dragNode.data as TreeDataNode
  const drop = context.dropNode.data as TreeDataNode
  const placement: DepartmentPlacement =
    context.dropPosition === 0 ? 'inside' : context.dropPosition < 0 ? 'before' : 'after'
  const parentId = placement === 'inside' ? drop.id : drop.parent_id
  // 组件内部会先行移动节点，这里按后端数据重建树恢复，确认后再提交
  await fetchDepartments()
  if (!parentId) return
  const content =
    placement === 'inside'
      ? t('users.departments.moveInside', { name: drag.name, target: drop.name })
      : placement === 'before'
        ? t('users.departments.moveBefore', { name: drag.name, target: drop.name })
        : t('users.departments.moveAfter', { name: drag.name, target: drop.name })
  openReasonDialog({
    title: t('users.departments.moveTitle'),
    content,
    action: async (reason) => {
      const payload = {
        parent_id: parentId,
        placement,
        anchor_id: placement === 'inside' ? undefined : drop.id,
        reason,
      }
      const departmentId = drag.id
      const result = await withReauth(
        { operation_id: 'placeDepartment', path: { department_id: departmentId }, body: payload },
        (proof, key) => placeDepartmentApi(departmentId, payload, proof, key),
      )
      if (result === null) return
      MessagePlugin.success(t('users.departments.moveSuccess'))
      await refreshAll()
    },
  })
}

function departmentMenuOptions(data: unknown): DropdownProps['options'] {
  const node = data as TreeDataNode
  return [
    { content: t('users.departments.create'), value: 'create' },
    { content: t('users.departments.edit'), value: 'edit' },
    {
      content: t('users.departments.delete'),
      value: 'delete',
      // 根节点代表整个组织，禁止删除
      disabled: !node.parent_id,
    },
  ]
}

async function onDepartmentMenu(ctx: { value?: string | number }, data: unknown) {
  const node = data as TreeDataNode
  const action = String(ctx.value ?? '')
  if (action === 'create') {
    deptDialog.mode = 'create'
    deptDialog.department = null
    deptDialog.parent = departmentMap.value.get(node.id) ?? null
    await fetchDeptSiblings(node.id)
    if (deptDialog.mode !== 'create' || deptDialog.parent?.id !== node.id) return
    deptDialog.visible = true
    return
  }
  if (action === 'edit') {
    deptDialog.mode = 'edit'
    deptDialog.department = departmentMap.value.get(node.id) ?? null
    deptDialog.parent = null
    await fetchDeptSiblings(deptDialog.department?.parent_id, node.id)
    if (deptDialog.mode !== 'edit' || deptDialog.department?.id !== node.id) return
    deptDialog.visible = true
    return
  }
  if (action === 'delete') {
    onDeleteDepartment(node)
  }
}

async function onDeleteDepartment(node: TreeDataNode) {
  let preview
  try {
    preview = await getDepartmentDeletePreviewApi(node.id)
  } catch {
    return
  }
  if (!preview.allowed) {
    const blockedMessage =
      preview.block_reason === 'DELETE_TOO_LARGE'
        ? t('users.departments.deleteTooLarge', { max: preview.max_departments })
        : t('users.departments.deleteBlocked')
    MessagePlugin.warning(blockedMessage)
    return
  }

  // department_count 含被删除部门自身，文案中展示的是子部门数量
  const childDepartmentCount = Math.max(preview.department_count - 1, 0)
  openReasonDialog({
    title: t('users.departments.deleteTitle'),
    content: t('users.departments.deleteContent', {
      name: node.name,
      departments: childDepartmentCount,
      users: preview.user_count,
    }),
    action: async (reason) => {
      const departmentId = node.id
      const payload = { reason }
      const result = await withReauth(
        { operation_id: 'deleteDepartment', path: { department_id: departmentId }, body: payload },
        (proof, key) => deleteDepartmentApi(departmentId, payload, proof, key),
      )
      if (result === null) return
      MessagePlugin.success(t('users.departments.deleteSuccess'))
      const selected = selectedDepartmentId.value
      if (selected && (selected === node.id || isDescendantOf(selected, node.id))) {
        selectedDepartmentId.value = ''
      }
      await refreshAll()
    },
  })
}

async function onDepartmentSubmit(payload: CreateDepartmentPayload | UpdateDepartmentPayload) {
  deptSubmitting.value = true
  try {
    if (deptDialog.mode === 'create') {
      await createDepartmentApi(payload as CreateDepartmentPayload)
      MessagePlugin.success(t('users.departments.createSuccess'))
    } else if (deptDialog.department) {
      await updateDepartmentApi(deptDialog.department.id, payload as UpdateDepartmentPayload)
      MessagePlugin.success(t('users.departments.updateSuccess'))
    }
    deptDialog.visible = false
    await refreshAll()
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    deptSubmitting.value = false
  }
}

/* ------------------------------- 用户维护 ------------------------------- */

const drawerVisible = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const editingUser = ref<UserItem | null>(null)
const submitting = ref(false)

function onCreate() {
  drawerMode.value = 'create'
  editingUser.value = null
  drawerVisible.value = true
}

function onEdit(row: UserItem) {
  drawerMode.value = 'edit'
  editingUser.value = row
  drawerVisible.value = true
}

const detailVisible = ref(false)
const detailUser = ref<UserItem | null>(null)

/** 用户名点击：打开只读详情，与编辑区分 */
function onView(row: UserItem) {
  detailUser.value = row
  detailVisible.value = true
}

async function onDrawerSubmit(payload: CreateUserPayload | UpdateUserPayload) {
  submitting.value = true
  try {
    if (drawerMode.value === 'create') {
      await createUserApi(payload as CreateUserPayload)
      MessagePlugin.success(t('users.createSuccess'))
    } else if (editingUser.value) {
      await updateUserApi(editingUser.value.id, payload as UpdateUserPayload)
      MessagePlugin.success(t('users.updateSuccess'))
    }
    drawerVisible.value = false
    await refreshAll()
  } catch (error) {
    // REAUTH_REQUIRED 由拦截器交给调用方提示，其余错误已统一提示
    if ((error as NotifiedError).code === 'REAUTH_REQUIRED') {
      MessagePlugin.error(t('roleErrors.REAUTH_REQUIRED'))
    }
  } finally {
    submitting.value = false
  }
}

const importVisible = ref(false)

type ReasonAction = (reason: string) => Promise<void>

const reasonDialog = reactive({
  visible: false,
  title: '',
  content: '',
  reason: '',
  loading: false,
})

let pendingAction: ReasonAction | null = null

const canConfirmReason = computed(() => reasonDialog.reason.trim().length > 0)

function openReasonDialog(options: { title: string; content: string; action: ReasonAction }) {
  reasonDialog.title = options.title
  reasonDialog.content = options.content
  reasonDialog.reason = ''
  reasonDialog.visible = true
  pendingAction = options.action
}

async function onReasonConfirm() {
  const reason = reasonDialog.reason.trim()
  if (!reason || !pendingAction) return
  reasonDialog.loading = true
  try {
    await pendingAction(reason)
    reasonDialog.visible = false
    pendingAction = null
  } catch {
    // 错误已由请求拦截器统一提示
  } finally {
    reasonDialog.loading = false
  }
}

function onReasonClose() {
  if (reasonDialog.loading) return
  reasonDialog.visible = false
  pendingAction = null
}

/** Obtain a one-time proof before executing a sensitive command. */
const reauthDialog = reactive({ visible: false, password: '' })
let settleReauthPassword: ((password: string | null) => void) | null = null

const canConfirmReauth = computed(() => reauthDialog.password.length > 0)

function askReauthPassword(): Promise<string | null> {
  reauthDialog.password = ''
  reauthDialog.visible = true
  return new Promise((resolve) => {
    settleReauthPassword = resolve
  })
}

function finishReauth(password: string | null) {
  reauthDialog.visible = false
  reauthDialog.password = ''
  settleReauthPassword?.(password)
  settleReauthPassword = null
}

function onReauthConfirm() {
  if (!canConfirmReauth.value) return
  finishReauth(reauthDialog.password)
}

function onReauthClose() {
  finishReauth(null)
}

/** Verify before executing the fixed command once. Null means cancellation. */
async function withReauth<T>(
  intent: ReauthIntent,
  action: (proof: string, idempotencyKey: string) => Promise<T>,
): Promise<T | null> {
  const idempotencyKey = crypto.randomUUID()
  const password = await askReauthPassword()
  if (password === null) return null
  const { proof_token } = await reauthApi({ password, intent })
  return action(proof_token, idempotencyKey)
}

/** Ask once, then obtain a separate proof and execute each fixed command in order. */
async function withReauthBatch<T>(
  tasks: Array<{
    intent: ReauthIntent
    run: (proof: string, idempotencyKey: string) => Promise<T>
  }>,
): Promise<Array<PromiseSettledResult<T>> | null> {
  const commands = tasks.map((task) => ({ ...task, idempotencyKey: crypto.randomUUID() }))
  const password = await askReauthPassword()
  if (password === null) return null
  const results: Array<PromiseSettledResult<T>> = []
  for (const command of commands) {
    try {
      const { proof_token } = await reauthApi({ password, intent: command.intent })
      const value = await command.run(proof_token, command.idempotencyKey)
      results.push({ status: 'fulfilled', value })
    } catch (reason) {
      // Request errors are reported by the request layer and summarized by the caller.
      results.push({ status: 'rejected', reason })
    }
  }
  return results
}

/** 后端批量接口单次上限 100，超出则分片提交 */
function chunk<T>(list: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < list.length; index += size) {
    result.push(list.slice(index, index + size))
  }
  return result
}

function onBatchStatus(status: UserStatus) {
  const ids = [...selectedKeys.value]
  if (!ids.length) return
  openReasonDialog({
    title: status === 'ACTIVE' ? t('users.confirm.enableTitle') : t('users.confirm.disableTitle'),
    content:
      status === 'ACTIVE'
        ? t('users.confirm.enableBatch', { n: ids.length })
        : t('users.confirm.disableBatch', { n: ids.length }),
    action: async (reason) => {
      const groups = chunk(ids, BATCH_LIMIT)
      const results =
        status === 'ACTIVE'
          ? await Promise.allSettled(
              groups.map((userIds) => batchEnableUsersApi({ reason, user_ids: userIds })),
            )
          : await withReauthBatch(
              groups.map((userIds) => {
                const payload = { reason, user_ids: userIds }
                return {
                  intent: { operation_id: 'batchDisableUsers', path: {}, body: payload },
                  run: (proof: string, key: string) => batchDisableUsersApi(payload, proof, key),
                }
              }),
            )
      if (results === null) return
      const succeeded = new Set(
        groups.flatMap((group, index) => (results[index]?.status === 'fulfilled' ? group : [])),
      )
      selectedKeys.value = selectedKeys.value.filter((id) => !succeeded.has(id))
      const failed = results.filter((item) => item.status === 'rejected').length
      if (failed) {
        MessagePlugin.warning(t('users.partialFailed', { n: failed }))
      } else {
        MessagePlugin.success(
          status === 'ACTIVE' ? t('users.enableSuccess') : t('users.disableSuccess'),
        )
      }
      await refreshAll()
    },
  })
}

function onBatchDelete() {
  const ids = [...selectedKeys.value]
  if (!ids.length) return
  openReasonDialog({
    title: t('users.confirm.deleteTitle'),
    content: t('users.confirm.deleteBatch', { n: ids.length }),
    action: async (reason) => {
      const results = await withReauthBatch(
        ids.map((id) => {
          const payload = { reason }
          return {
            intent: { operation_id: 'deleteUser', path: { user_id: id }, body: payload },
            run: (proof: string, key: string) => deleteUserApi(id, payload, proof, key),
          }
        }),
      )
      if (results === null) return
      const succeeded = new Set(ids.filter((_id, index) => results[index]?.status === 'fulfilled'))
      selectedKeys.value = selectedKeys.value.filter((id) => !succeeded.has(id))
      const failed = results.filter((item) => item.status === 'rejected').length
      if (failed) {
        MessagePlugin.warning(t('users.partialFailed', { n: failed }))
      } else {
        MessagePlugin.success(t('common.deleteSuccess'))
      }
      await refreshAll()
    },
  })
}

const passwordDialog = reactive({
  visible: false,
  username: '',
  password: '',
})

function onResetPassword(row: UserItem) {
  openReasonDialog({
    title: t('users.confirm.resetTitle'),
    content: t('users.confirm.resetContent', { name: row.display_name }),
    action: async (reason) => {
      const userId = row.id
      const username = row.username
      const payload = { reason }
      const res = await withReauth(
        { operation_id: 'resetUserPassword', path: { user_id: userId }, body: payload },
        (proof, key) => resetUserPasswordApi(userId, payload, proof, key),
      )
      if (res === null) return
      if (!res.temporary_password) {
        // 后端可能不再回显明文密码（secret_available=false）
        MessagePlugin.warning(t('users.reset.secretUnavailable'))
        return
      }
      passwordDialog.username = username
      passwordDialog.password = res.temporary_password
      passwordDialog.visible = true
      MessagePlugin.success(t('users.resetSuccess'))
      await fetchUsers()
    },
  })
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(passwordDialog.password)
    MessagePlugin.success(t('users.reset.copySuccess'))
  } catch {
    MessagePlugin.warning(t('users.reset.copyFailed'))
  }
}

onMounted(async () => {
  await Promise.all([fetchDepartments(), fetchRoles(), fetchFormRoles()])
  await fetchUsers({ resetPage: true })
})
</script>

<style scoped>
.users-layout {
  display: flex;
  align-items: flex-start;
  gap: var(--td-comp-margin-l, 16px);
}

.users-dept {
  flex: none;
  width: 260px;
}

.users-main {
  flex: 1;
  min-width: 0;
}

.dept-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-s);
  margin-bottom: var(--td-comp-margin-s);
}

.dept-header__title {
  font-size: var(--td-font-size-body-medium, 14px);
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.dept-all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--td-comp-margin-xs, 8px);
  padding: var(--td-comp-paddingTB-xs, 6px) var(--td-comp-paddingLR-s, 8px);
  border-radius: var(--td-radius-default);
  font-size: var(--td-font-size-body-medium, 14px);
  color: var(--td-text-color-primary);
  cursor: pointer;
  transition: background-color 0.2s;
}

.dept-all:hover {
  background-color: var(--td-bg-color-container-hover);
}

.dept-all--active {
  color: var(--td-brand-color);
  background-color: var(--td-brand-color-light);
  font-weight: 500;
}

.dept-tree {
  margin-top: var(--td-comp-margin-xs, 4px);
}

.dept-tree :deep(.t-tree__label) {
  flex: 1;
  min-width: 0;
}

.dept-node {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-xxs, 4px);
  width: 100%;
}

.dept-node__name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 搜索结果高亮，颜色遵循 TDesign CSS Variables */
.dept-hit {
  padding: 0 1px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
  border-radius: var(--td-radius-small);
}

.dept-count {
  flex: none;
  font-size: var(--td-font-size-body-small, 12px);
  color: var(--td-text-color-placeholder);
}

/* 悬浮操作入口：默认隐藏，hover 部门节点时出现（与原型一致） */
.dept-node__more-wrap {
  display: inline-flex;
  flex: none;
}

.dept-node__more {
  flex: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.dept-node:hover .dept-node__more,
.dept-node:focus-within .dept-node__more,
.dept-node__more:focus-visible {
  opacity: 1;
}

.dept-empty {
  margin: var(--td-comp-margin-xxl, 24px) 0;
  font-size: var(--td-font-size-body-small, 13px);
  text-align: center;
  color: var(--td-text-color-placeholder);
}

.table-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-xs, 8px);
  margin-bottom: var(--td-comp-margin-l, 16px);
}

.table-toolbar__selected {
  font-size: var(--td-font-size-body-small, 13px);
  color: var(--td-text-color-secondary);
}

.cell-empty {
  color: var(--td-text-color-placeholder);
}

.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--td-gray-color-6);
}

.status-dot--ACTIVE {
  background-color: var(--td-success-color);
}

.status-dot--DISABLED {
  background-color: var(--td-gray-color-6);
}

.confirm-content {
  margin: 0 0 var(--td-comp-margin-l, 16px);
  font-size: var(--td-font-size-body-medium, 14px);
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.reset-password {
  padding: var(--td-comp-paddingTB-s, 12px) var(--td-comp-paddingLR-l, 16px);
  border-radius: var(--td-radius-default);
  font-family: var(--td-font-family-mono, monospace);
  font-size: var(--td-font-size-title-large, 16px);
  letter-spacing: 1px;
  text-align: center;
  color: var(--td-text-color-primary);
  background-color: var(--td-bg-color-container-hover);
}

/* 窄屏下部门树改为顶部横向面板，避免表格被挤压到无法阅读 */
@media (max-width: 1200px) {
  .users-layout {
    flex-direction: column;
  }

  .users-dept {
    width: 100%;
  }

  .users-main {
    width: 100%;
  }

  .dept-tree {
    max-height: 260px;
    overflow-y: auto;
  }
}
</style>
