<template>
  <t-card :bordered="false">
    <div class="table-toolbar">
      <t-button v-permission="'identity.roles:write'" @click="open('create')">{{
        t('roles.create')
      }}</t-button>
      <t-input
        v-model="search"
        autocomplete="off"
        name="role-list-filter"
        class="toolbar-search"
        :maxlength="128"
        :placeholder="t('roles.search')"
        clearable
      />
    </div>
    <t-table row-key="id" :data="items" :columns="columns" :loading="loading" hover>
      <template #name="{ row }">{{ row.display_name || row.name }}</template>
      <template #type="{ row }"
        ><t-tag :theme="row.is_builtin ? 'primary' : 'default'">{{
          t(row.is_builtin ? 'roles.builtin' : 'roles.custom')
        }}</t-tag></template
      >
      <template #description="{ row }">{{
        row.display_description || row.description || '—'
      }}</template>
      <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
      <template #action="{ row }">
        <t-space>
          <t-link theme="primary" @click="open(row.is_builtin ? 'view' : 'edit', row)">{{
            t(row.is_builtin ? 'roles.view' : 'roles.edit')
          }}</t-link>
          <t-link
            v-permission.write="'identity.roles'"
            theme="primary"
            @click="open('copy', row)"
            >{{ t('roles.copy') }}</t-link
          >
          <t-link
            v-if="!row.is_builtin"
            v-permission="'identity.roles:write'"
            theme="danger"
            @click="prepareDelete(row)"
            >{{ t('roles.delete') }}</t-link
          >
        </t-space>
      </template>
    </t-table>
    <t-pagination
      class="role-pagination"
      :current="page"
      :page-size="pageSize"
      :total="paginationTotal"
      :page-size-options="[10, 20, 50]"
      :show-jumper="false"
      :show-page-number="true"
      :show-total="false"
      :disabled="loading"
      @change="changePage"
    />
  </t-card>

  <t-drawer
    class="permission-drawer"
    :visible="visible"
    :header="title"
    size="large"
    :close-on-overlay-click="false"
    :close-btn="!saving"
    @close="close"
  >
    <t-loading class="permission-loading" :loading="formLoading">
      <t-form
        class="permission-form"
        :data="form"
        label-align="top"
        :disabled="readonly || saving || formLoading"
      >
        <t-form-item :label="t('roles.name')" required>
          <t-input v-model="form.name" :maxlength="30" :placeholder="t('roles.namePlaceholder')" />
        </t-form-item>
        <t-form-item class="permission-form__description" :label="t('roles.description')">
          <t-textarea
            v-model="form.description"
            class="permission-description"
            :maxlength="200"
            :autosize="{ minRows: 3, maxRows: 6 }"
          />
        </t-form-item>
        <section class="permission-panel">
          <header class="permission-panel__head">
            <span class="permission-panel__title">{{ t('roles.permissions') }}</span>
            <span class="permission-panel__hint">{{ t('roles.hint') }}</span>
          </header>
          <div class="permission-table">
            <div class="permission-row permission-row--head">
              <span>{{ t('roles.resource') }}</span>
              <span class="permission-cell">{{ t('roles.read') }}</span>
              <span class="permission-cell">{{ t('roles.write') }}</span>
            </div>
            <div class="permission-table__body">
              <template v-for="group in menuGroups" :key="group.title">
                <div class="permission-group">
                  <span class="permission-group__title">{{ t(group.title) }}</span>
                  <t-checkbox
                    :checked="allChecked(group.entries)"
                    :indeterminate="someChecked(group.entries) && !allChecked(group.entries)"
                    :disabled="
                      readonly || saving || formLoading || !editableEntries(group.entries).length
                    "
                    @change="(value: boolean) => selectGroup(group.entries, Boolean(value))"
                    >{{ t('roles.all') }}</t-checkbox
                  >
                </div>
                <div v-for="entry in group.entries" :key="entry.code" class="permission-row">
                  <div class="permission-resource">
                    <span class="permission-name">{{ entry.name }}</span>
                    <span v-if="entry.description" class="permission-resource__description">{{
                      entry.description
                    }}</span>
                  </div>
                  <t-checkbox
                    class="permission-cell"
                    :checked="grants[entry.code]?.can_read || false"
                    :disabled="
                      readonly || saving || formLoading || !entry.assignable || !entry.read
                    "
                    @change="(value: boolean) => setGrant(entry.code, 'can_read', Boolean(value))"
                  />
                  <t-checkbox
                    class="permission-cell"
                    :checked="grants[entry.code]?.can_write || false"
                    :disabled="
                      readonly || saving || formLoading || !entry.assignable || !entry.write
                    "
                    @change="(value: boolean) => setGrant(entry.code, 'can_write', Boolean(value))"
                  />
                </div>
              </template>
            </div>
          </div>
          <t-empty v-if="!menuGroups.length && !formLoading" :description="t('roles.empty')" />
        </section>
      </t-form>
    </t-loading>
    <template #footer>
      <div class="permission-actions">
        <t-button
          v-if="!readonly"
          v-permission="'identity.roles:write'"
          :loading="saving"
          :disabled="formLoading || !resourcesLoaded"
          @click="save"
          >{{ t('roles.save') }}</t-button
        >
        <t-button theme="default" :disabled="saving" @click="close">{{
          t(readonly ? 'roles.close' : 'common.cancel')
        }}</t-button>
      </div>
    </template>
  </t-drawer>

  <t-dialog
    :visible="deleteVisible"
    :header="t('roles.delete')"
    :confirm-btn="{
      content: t('common.confirm'),
      loading: deleting,
    }"
    :close-on-overlay-click="false"
    @confirm="remove()"
    @close="!deleting && (deleteVisible = false)"
  >
    <p>{{ t('roles.deleteConfirm', { name: selected?.display_name || selected?.name }) }}</p>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PageInfo, type PrimaryTableCol } from 'tdesign-vue-next'
import { businessRoutes } from '@/router/routes'
import { mergeRoleGrants } from './permissions'
import { useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
import { createIdempotencyKey, type NotifiedError } from '@/api/request'
import {
  getRolesApi,
  getRoleApi,
  getPermissionResourcesApi,
  createRoleApi,
  updateRoleApi,
  copyRoleApi,
  saveRolePermissionsApi,
  deleteRoleApi,
  type RoleItem,
  type PermissionResource,
  type RoleGrant,
  type RolePermission,
} from '@/api/modules/identity'

const { t, locale } = useI18n()
const userStore = useUserStore()
const items = ref<RoleItem[]>([])
const search = ref('')
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const paginationTotal = ref(0)
let listRequest = 0
const columns = computed<PrimaryTableCol<RoleItem>[]>(() => [
  { colKey: 'name', title: t('roles.name') },
  { colKey: 'type', title: t('roles.type') },
  { colKey: 'description', title: t('roles.description'), ellipsis: true },
  { colKey: 'user_count', title: t('roles.users') },
  { colKey: 'created_at', title: t('roles.created') },
  { colKey: 'action', title: t('roles.action') },
])
function resetPage() {
  page.value = 1
}
async function fetchList(): Promise<void> {
  const requestId = ++listRequest
  loading.value = true
  try {
    const result = await getRolesApi({
      search: search.value.trim() || undefined,
      page: page.value,
      page_size: pageSize.value,
    })
    if (requestId !== listRequest) return
    paginationTotal.value = result.total
    pageSize.value = Math.min(100, Math.max(1, result.page_size))
    const lastPage = Math.max(1, result.total_pages)
    if (result.page > lastPage) {
      page.value = lastPage
      await fetchList()
      return
    }
    page.value = result.page
    items.value = result.items
  } catch {
    if (requestId !== listRequest) return
    items.value = []
    paginationTotal.value = 0
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

const resources = ref<PermissionResource[]>([])
const resourcesLoaded = ref(false)
const details = ref<RolePermission[]>([])
const grants = reactive<Record<string, RoleGrant>>({})
type Entry = {
  code: string
  name: string
  description?: string
  assignable: boolean
  read: boolean
  write: boolean
}
const menuGroups = computed(() => {
  const groups = businessRoutes.map((group) => ({
    title: group.meta?.title || '',
    routes: group.children || [],
    entries: [] as Entry[],
  }))
  const other = { title: 'roles.otherResources', routes: [], entries: [] as Entry[] }
  const unique = new Map(resources.value.map((resource) => [resource.resource_code, resource]))
  const sorted = [...unique.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.resource_code.localeCompare(b.resource_code),
  )
  for (const resource of sorted) {
    const code = resource.resource_code
    const permission = details.value.find((item) => item.resource_code === code)
    const group =
      groups.find((item) => item.routes.some((route) => route.meta?.permission === code)) ||
      groups.find((item) =>
        item.routes.some((route) => route.meta?.permission?.split('.')[0] === code.split('.')[0]),
      ) ||
      other
    const actions = resource.actions.filter(
      (action) => !permission || permission.actions.includes(action),
    )
    group.entries.push({
      code,
      name: resource.localized_name || resource.display_name || code,
      description: resource.localized_description ?? resource.description,
      assignable:
        resource.status === 'ACTIVE' &&
        !resource.is_protected &&
        resource.management_policy !== 'SUPER_ADMIN_ONLY' &&
        (!permission ||
          (permission.is_assignable &&
            !permission.is_protected &&
            permission.status === 'ACTIVE' &&
            permission.management_policy !== 'SUPER_ADMIN_ONLY')),
      read: actions.includes('READ'),
      write: actions.includes('READ') && actions.includes('WRITE'),
    })
  }
  return [...groups, other].filter((group) => group.entries.length)
})
function setGrant(code: string, action: 'can_read' | 'can_write', value: boolean) {
  const entry = menuGroups.value
    .flatMap((group) => group.entries)
    .find((item) => item.code === code)
  if (!entry?.assignable || !(action === 'can_read' ? entry.read : entry.write)) return
  const grant = (grants[code] ||= { resource_code: code, can_read: false, can_write: false })
  grant[action] = value
  if (action === 'can_write' && value) grant.can_read = true
  if (action === 'can_read' && !value) grant.can_write = false
}
const editableEntries = (entries: Entry[]) =>
  entries.filter((entry) => entry.assignable && (entry.read || entry.write))
const allChecked = (entries: Entry[]) => {
  const assignable = editableEntries(entries)
  return (
    assignable.length > 0 &&
    assignable.every(
      (entry) =>
        (!entry.read || grants[entry.code]?.can_read) &&
        (!entry.write || grants[entry.code]?.can_write),
    )
  )
}
const someChecked = (entries: Entry[]) =>
  editableEntries(entries).some(
    (entry) =>
      (entry.read && grants[entry.code]?.can_read) ||
      (entry.write && grants[entry.code]?.can_write),
  )
function selectGroup(entries: Entry[], value: boolean) {
  for (const entry of editableEntries(entries)) {
    if (entry.read) setGrant(entry.code, 'can_read', value)
    if (entry.write) setGrant(entry.code, 'can_write', value)
  }
}
const visible = ref(false)
const mode = ref<'create' | 'edit' | 'copy' | 'view'>('create')
const readonly = computed(() => mode.value === 'view')
const title = computed(() =>
  t(
    mode.value === 'view'
      ? 'roles.detailTitle'
      : mode.value === 'edit'
        ? 'roles.editTitle'
        : mode.value === 'copy'
          ? 'roles.copyTitle'
          : 'roles.createTitle',
  ),
)
const selected = ref<RoleItem | null>(null)
const form = reactive({ name: '', description: '' })
const saving = ref(false)
const formLoading = ref(false)
let formRequest = 0
function close() {
  if (!saving.value) {
    visible.value = false
    ++formRequest
  }
}
async function open(nextMode: typeof mode.value, row?: RoleItem) {
  if (saving.value) return
  if (nextMode === 'edit' && row?.is_builtin) return
  const requestId = ++formRequest
  mode.value = nextMode
  selected.value = row || null
  Object.assign(form, { name: '', description: '' })
  for (const key of Object.keys(grants)) delete grants[key]
  details.value = []
  resourcesLoaded.value = false
  visible.value = true
  formLoading.value = true
  try {
    const all: PermissionResource[] = []
    let resourcePage = 1
    let totalPages = 1
    do {
      const result = await getPermissionResourcesApi({ page: resourcePage, page_size: 100 })
      if (requestId !== formRequest) return
      all.push(...result.items)
      totalPages = result.total_pages
      resourcePage += 1
    } while (resourcePage <= totalPages)
    const detail = row ? await getRoleApi(row.id) : null
    if (requestId !== formRequest) return
    resources.value = all
    details.value = detail?.permissions || []
    if (detail) {
      form.name = detail.role.name + (nextMode === 'copy' ? t('roles.suffix') : '')
      form.description = detail.role.description
      selected.value = detail.role
      if (nextMode === 'edit' && detail.role.is_builtin) mode.value = 'view'
      for (const grant of detail.permissions)
        grants[grant.resource_code] = {
          resource_code: grant.resource_code,
          can_read: grant.can_read,
          can_write: grant.can_write,
        }
    }
    resourcesLoaded.value = true
  } catch (error) {
    if (requestId === formRequest) {
      visible.value = false
      if (!(error as NotifiedError).notified) MessagePlugin.error(t('roles.failed'))
    }
  } finally {
    if (requestId === formRequest) formLoading.value = false
  }
}
function save() {
  if (readonly.value || saving.value || formLoading.value || !resourcesLoaded.value) return
  if (!form.name.trim() || form.name.length > 30 || form.description.length > 200) {
    MessagePlugin.warning(t('roles.nameRequired'))
    return
  }
  const permissions = menuGroups.value.flatMap((group) =>
    group.entries
      .filter((entry) => entry.assignable && (entry.read || entry.write))
      .map(
        (entry) =>
          grants[entry.code] || { resource_code: entry.code, can_read: false, can_write: false },
      ),
  )
  const changed =
    (mode.value === 'edit' || mode.value === 'copy') &&
    permissions.some((grant) => {
      const previous = details.value.find((item) => item.resource_code === grant.resource_code)
      return (
        grant.can_read !== (previous?.can_read ?? false) ||
        grant.can_write !== (previous?.can_write ?? false)
      )
    })
  const needsPermissions = mode.value === 'create' || changed
  const payload = { name: form.name.trim(), description: form.description.trim() }
  const currentMode = mode.value
  const role = selected.value
  const action = async () => {
    saving.value = true
    let metadataSaved = false
    let permissionsSaved = false
    try {
      const idempotencyKey = createIdempotencyKey()
      let id = role?.id || ''
      if (currentMode === 'copy' && role) {
        const result = await copyRoleApi(role.id, payload)
        id = result.role_id
        metadataSaved = true
      } else if (currentMode === 'create') {
        const result = await createRoleApi(payload)
        id = result.role_id
        metadataSaved = true
      } else if (role && (payload.name !== role.name || payload.description !== role.description)) {
        await updateRoleApi(role.id, payload)
        metadataSaved = true
        selected.value = { ...role, ...payload }
      }
      if (needsPermissions) {
        const roleId = id
        const permissionPayload = {
          permissions: mergeRoleGrants(
            currentMode === 'copy'
              ? (await getRoleApi(roleId)).permissions
              : currentMode === 'edit'
                ? details.value
                : [],
            permissions,
          ),
        }
        await saveRolePermissionsApi(roleId, permissionPayload, idempotencyKey)
        permissionsSaved = true
      }
      visible.value = false
      MessagePlugin.success(t('roles.saved'))
      if (permissionsSaved) {
        try {
          await userStore.fetchUserInfo()
        } catch {
          MessagePlugin.warning(t('roles.refreshFailed'))
        }
      }
    } catch (error) {
      if (metadataSaved && needsPermissions && !permissionsSaved) {
        MessagePlugin.warning(t(currentMode === 'edit' ? 'roles.partialEdit' : 'roles.partial'))
        if (currentMode === 'create' || currentMode === 'copy') visible.value = false
      }
      throw error
    } finally {
      saving.value = false
      if (metadataSaved || permissionsSaved) {
        resetPage()
        await fetchList()
      }
    }
  }
  void action().catch(showError)
}
function showError(error: unknown) {
  if (!(error as NotifiedError).notified)
    MessagePlugin.error((error as Error).message || t('roles.failed'))
}
const deleteVisible = ref(false)
const deleting = ref(false)
async function prepareDelete(row: RoleItem) {
  if (row.is_builtin) return
  if (row.user_count > 0) {
    MessagePlugin.warning(t('roleErrors.ROLE_IN_USE'))
    return
  }
  try {
    const { role } = await getRoleApi(row.id)
    if (role.is_builtin) return
    if (role.user_count) {
      MessagePlugin.warning(t('roleErrors.ROLE_IN_USE'))
      return
    }
    selected.value = role
    deleteVisible.value = true
  } catch {
    /* 请求拦截器统一提示 */
  }
}
async function remove() {
  if (!selected.value || selected.value.is_builtin || deleting.value) return
  deleting.value = true
  try {
    await deleteRoleApi(selected.value.id)
    deleteVisible.value = false
    MessagePlugin.success(t('roles.deleted'))
    resetPage()
    await fetchList()
  } catch (error) {
    showError(error)
  } finally {
    deleting.value = false
  }
}
onMounted(() => {
  void fetchList()
})
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
.role-pagination {
  margin-top: var(--td-comp-margin-m);
}
:global(.permission-drawer .t-drawer__header) {
  font: var(--td-font-title-medium);
}
:global(.permission-drawer .t-drawer__body) {
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: var(--td-comp-margin-xxl);
  padding-bottom: var(--td-comp-margin-xxl);
}
:global(.permission-drawer .t-drawer__footer) {
  text-align: left;
}
.permission-loading,
.permission-form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.permission-form > :not(.permission-panel) {
  flex-shrink: 0;
}
.permission-form :deep(.t-form__item) {
  margin-bottom: var(--td-comp-margin-xxl);
}
.permission-form :deep(.permission-form__description) {
  margin-bottom: var(--td-comp-margin-m);
}
.permission-description :deep(.t-textarea__limit) {
  font: var(--td-font-body-small);
  color: var(--td-text-color-placeholder);
  pointer-events: none;
}
.permission-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding-top: var(--td-comp-margin-m);
  border-top: 1px solid var(--td-component-stroke);
}
.permission-actions {
  display: flex;
  justify-content: flex-start;
  gap: var(--td-comp-margin-s);
}
.permission-drawer .permission-actions :deep(.t-button) {
  margin-left: 0;
}
.permission-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--td-comp-margin-m);
  margin-bottom: var(--td-comp-margin-m);
}
.permission-panel__title {
  font: var(--td-font-body-medium);
  font-weight: 600;
  color: var(--td-text-color-primary);
}
.permission-panel__hint {
  flex: 1;
  text-align: right;
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-placeholder);
}
.permission-table {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  overflow: hidden;
}
.permission-table__body {
  overflow-y: auto;
  min-height: 0;
}
.permission-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--td-comp-size-xxxxl) var(--td-comp-size-xxxxl);
  align-items: center;
  column-gap: var(--td-comp-margin-s);
  min-height: var(--td-comp-size-xl);
  box-sizing: border-box;
  padding: calc(var(--td-size-5) - var(--td-size-1)) var(--td-comp-paddingLR-l);
  border-top: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
  font-size: var(--td-font-size-body-medium);
  color: var(--td-text-color-primary);
}
.permission-row--head {
  flex-shrink: 0;
  border-top: none;
  background: var(--td-bg-color-secondarycontainer);
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}
.permission-row:not(.permission-row--head):hover {
  background: var(--td-bg-color-container-hover);
}
.permission-resource {
  display: flex;
  align-items: baseline;
  gap: var(--td-comp-margin-s);
  min-width: 0;
}
.permission-name,
.permission-resource__description {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.permission-name {
  flex: 0 1 auto;
}
.permission-resource__description {
  flex: 0 1 auto;
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-placeholder);
}
.permission-cell {
  justify-self: center;
}
.permission-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--td-comp-margin-m);
  padding: calc(var(--td-size-5) - var(--td-size-1)) var(--td-comp-paddingLR-l);
  border-top: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container-hover);
}
.permission-group__title {
  font: var(--td-font-body-medium);
  font-weight: 600;
  color: var(--td-text-color-primary);
}
</style>
