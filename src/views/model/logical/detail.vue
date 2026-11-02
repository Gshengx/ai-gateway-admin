<template>
  <section v-if="model" class="panel">
    <t-button variant="text" @click="router.push('/model/logical')"
      >‹ {{ t('logicalModels.back') }}</t-button
    >
    <div class="row">
      <div>
        <h1>{{ model.display_name || model.localized_name }}</h1>
        <p>
          {{ model.description || model.localized_description }} ·
          {{ t('logicalModels.apiHint', { name: model.logical_name }) }}
        </p>
      </div>
      <t-space
        ><t-tag :theme="model.status === 'ACTIVE' ? 'success' : 'default'">{{
          t(
            model.status === 'ACTIVE'
              ? 'logicalModels.statusActive'
              : 'logicalModels.statusDisabled',
          )
        }}</t-tag
        ><span>{{ t('logicalModels.mountSummary', { ready, total: model.mounts.length }) }}</span
        ><t-button @click="openEdit">{{ t('logicalModels.edit') }}</t-button
        ><t-button theme="danger" @click="deleteVisible = true">{{
          t('logicalModels.delete')
        }}</t-button></t-space
      >
    </div>
    <t-tabs default-value="basic">
      <t-tab-panel value="basic" :label="t('logicalModels.tabBasic')">
        <t-descriptions :column="1"
          ><t-descriptions-item :label="t('logicalModels.name')">{{
            model.display_name || model.localized_name
          }}</t-descriptions-item
          ><t-descriptions-item :label="t('logicalModels.description')">{{
            model.description || model.localized_description
          }}</t-descriptions-item
          ><t-descriptions-item :label="t('logicalModels.basicCreated')">-</t-descriptions-item
          ><t-descriptions-item :label="t('logicalModels.basicMounts')">{{
            t('logicalModels.basicMountsValue', { ready, total: model.mounts.length })
          }}</t-descriptions-item></t-descriptions
        >
      </t-tab-panel>
      <t-tab-panel value="mounts" :label="t('logicalModels.tabMounts', { n: model.mounts.length })">
        <div class="row">
          <h3>{{ t('logicalModels.mountedTitle', { n: model.mounts.length }) }}</h3>
          <t-button @click="mountVisible = true">{{ t('logicalModels.mountModel') }}</t-button>
        </div>
        <t-table
          row-key="physical_model_id"
          :data="mountRows"
          :columns="mountColumns"
          :empty="t('logicalModels.empty')"
        >
          <template #priority="{ row }"
            ><t-input-number
              v-model="priorities[row.physical_model_id]"
              class="priority"
              :min="1"
              @blur="changePriority(row.physical_model_id, row.priority)"
          /></template>
          <template #status="{ row }">{{ statusLabel(row.model?.status) }}</template>
          <template #action="{ row }"
            ><t-link theme="danger" @click="unmountId = row.physical_model_id">{{
              t('logicalModels.unmount')
            }}</t-link></template
          >
        </t-table>
      </t-tab-panel>
      <t-tab-panel
        value="permissions"
        :label="t('logicalModels.tabPermissions', { n: grants.length })"
      >
        <p>{{ t('logicalModels.permissionHint') }}</p>
        <t-space
          ><t-select
            v-model="subjectType"
            :options="subjectTypes"
            @change="selectedSubjects = []"
          /><t-select
            v-model="selectedSubjects"
            :options="subjectOptions[subjectType]"
            :placeholder="t('logicalModels.subjectPlaceholder')"
            multiple
            filterable
          /><t-button :disabled="!selectedSubjects.length" @click="addGrants">{{
            t('logicalModels.addGrant')
          }}</t-button
          ><t-button
            :disabled="!selectedGrants.length"
            @click="removeTargets = grants.filter((g) => selectedGrants.includes(g.grant_id))"
            >{{ t('logicalModels.batchRemove', { n: selectedGrants.length }) }}</t-button
          ></t-space
        >
        <div v-for="type in types" :key="type" class="group">
          <div class="row">
            <h3>{{ groupTitle(type) }}</h3>
            <t-link @click="toggleGroup(type)">{{ t('logicalModels.selectGroup') }}</t-link>
          </div>
          <div
            v-for="grant in grants.filter((g) => g.subject_type === type)"
            :key="grant.grant_id"
            class="row"
          >
            <t-checkbox
              :checked="selectedGrants.includes(grant.grant_id)"
              @change="toggleGrant(grant.grant_id)"
              >{{ subjectName(grant) }}</t-checkbox
            ><t-link @click="removeTargets = [grant]">{{ t('logicalModels.remove') }}</t-link>
          </div>
          <p v-if="type === 'GROUP' && !grants.some((g) => g.subject_type === type)">
            {{ t('logicalModels.emptyUserGrants') }}
          </p>
        </div>
      </t-tab-panel>
    </t-tabs>
    <t-dialog
      v-model:visible="editVisible"
      :header="t('logicalModels.edit')"
      :confirm-btn="t('logicalModels.save')"
      :cancel-btn="t('logicalModels.cancel')"
      @confirm="save"
      ><t-form label-align="top"
        ><t-form-item :label="t('logicalModels.name')"
          ><t-input v-model="displayName" disabled
        /></t-form-item>
        <p>{{ t('logicalModels.nameHint') }} {{ t('logicalModels.notSupported') }}</p>
        <t-form-item :label="t('logicalModels.description')"
          ><t-textarea v-model="description" :maxlength="4000" indicator /></t-form-item></t-form
    ></t-dialog>
    <t-dialog
      v-model:visible="deleteVisible"
      :header="t('logicalModels.delete')"
      :confirm-btn="t('logicalModels.delete')"
      :cancel-btn="t('logicalModels.cancel')"
      @confirm="deleteModel"
      >{{
        t('logicalModels.deleteConfirm', { name: model.display_name || model.localized_name })
      }}</t-dialog
    >
    <t-dialog
      :visible="!!unmountId"
      :header="t('logicalModels.unmount')"
      :confirm-btn="t('logicalModels.confirm')"
      :cancel-btn="t('logicalModels.cancel')"
      @close="unmountId = ''"
      @confirm="unmount"
      >{{ t('logicalModels.unmountConfirm') }}</t-dialog
    >
    <t-dialog
      :visible="!!removeTargets.length"
      :header="t('logicalModels.remove')"
      :confirm-btn="t('logicalModels.confirm')"
      :cancel-btn="t('logicalModels.cancel')"
      @close="removeTargets = []"
      @confirm="removeGrants"
      >{{ t('logicalModels.removeConfirm') }}</t-dialog
    >
    <t-dialog
      v-model:visible="mountVisible"
      :header="t('logicalModels.mountDialogTitle')"
      :confirm-btn="{ content: t('logicalModels.confirmMount'), disabled: !mountSelection.length }"
      :cancel-btn="t('logicalModels.cancel')"
      @confirm="mount"
      ><p>{{ t('logicalModels.mountDialogHint') }}</p>
      <t-button theme="default" @click="mountSelection = []">{{
        t('logicalModels.reset')
      }}</t-button
      ><t-table
        v-model:selected-row-keys="mountSelection"
        row-key="id"
        :data="availableModels"
        :columns="availableColumns"
        :empty="t('logicalModels.empty')"
        ><template #status="{ row }">{{ statusLabel(row.status) }}</template></t-table
      ></t-dialog
    >
  </section>
  <div v-else-if="!logicalModelId">{{ t('logicalModels.empty') }}</div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin, type PrimaryTableCol } from 'tdesign-vue-next'
import {
  getLogicalModelApi,
  updateLogicalModelApi,
  deleteLogicalModelApi,
  mountLogicalModelApi,
  updateLogicalModelMountOrderApi,
  unmountLogicalModelApi,
  getLogicalModelPermissionsApi,
  addLogicalModelPermissionsApi,
  deleteLogicalModelPermissionsApi,
  type LogicalModel,
  type LogicalModelPermission,
  type SubjectType,
} from '@/api/modules/logicalModels'
import { getModelsApi, type PhysicalModelItem, type ModelStatus } from '@/api/modules/models'
import { getProvidersApi, type ProviderItem } from '@/api/modules/providers'
import { getDepartmentListApi, getUserGroupListApi, getUserListApi } from '@/api/modules/identity'

const DEFAULT_REASON = 'admin-console'
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const logicalModelId = computed(() => String(route.params.logical_model_id ?? ''))
const model = ref<LogicalModel | null>(null)
const models = ref<PhysicalModelItem[]>([])
const providers = ref<ProviderItem[]>([])
const grants = ref<LogicalModelPermission[]>([])
const priorities = ref<Record<string, number>>({})
const types: SubjectType[] = ['DEPARTMENT', 'GROUP', 'USER']
const subjectType = ref<SubjectType>('DEPARTMENT')
const subjectOptions = ref<Record<SubjectType, { label: string; value: string }[]>>({
  DEPARTMENT: [],
  GROUP: [],
  USER: [],
})
const selectedSubjects = ref<string[]>([])
const selectedGrants = ref<string[]>([])
const removeTargets = ref<LogicalModelPermission[]>([])
const mountSelection = ref<(string | number)[]>([])
const editVisible = ref(false)
const deleteVisible = ref(false)
const mountVisible = ref(false)
const unmountId = ref('')
const displayName = ref('')
const description = ref('')
const subjectTypes = computed(() =>
  types.map((value) => ({ value, label: t(`logicalModels.${value.toLowerCase()}`) })),
)
const mountRows = computed(() =>
  (model.value?.mounts || [])
    .map((item) => {
      const physical = models.value.find((m) => m.id === item.physical_model_id)
      const provider = providers.value.find((p) => p.id === physical?.provider_id)
      return {
        ...item,
        model: physical,
        identifier: physical?.model_id_at_provider || '-',
        modelType: physical?.model_type || '-',
        provider: provider?.name || '-',
        api: physical?.invocation_api || provider?.base_url || '-',
        security: provider?.security_level || '-',
      }
    })
    .sort((a, b) => a.priority - b.priority),
)
const ready = computed(() => mountRows.value.filter((row) => row.model?.status === 'ACTIVE').length)
const availableModels = computed(() =>
  models.value
    .filter((m) => !model.value?.mounts.some((mount) => mount.physical_model_id === m.id))
    .map((m) => {
      const provider = providers.value.find((p) => p.id === m.provider_id)
      return {
        ...m,
        provider: provider?.name || '-',
        api: m.invocation_api || provider?.base_url || '-',
      }
    }),
)
const mountColumns = computed<PrimaryTableCol[]>(() =>
  ['priority', 'identifier', 'modelType', 'provider', 'api', 'security', 'status', 'action'].map(
    (colKey, i) => ({
      colKey,
      title: t(
        `logicalModels.${['colPriority', 'colIdentifier', 'colModelType', 'colProvider', 'colApi', 'colSecurity', 'colStatus', 'colAction'][i]}`,
      ),
    }),
  ),
)
const availableColumns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'row-select', type: 'single' },
  ...['model_id_at_provider', 'status', 'provider', 'api'].map((colKey, i) => ({
    colKey,
    title: t(`logicalModels.${['colIdentifier', 'colStatus', 'colProvider', 'colApi'][i]}`),
  })),
])
function statusLabel(status?: ModelStatus) {
  const keys: Record<ModelStatus, string> = {
    ACTIVE: 'Active',
    DRAFT: 'Draft',
    PENDING_REVIEW: 'PendingReview',
    TESTING: 'Testing',
    SUSPENDED: 'Suspended',
    RETIRED: 'Retired',
  }
  return status ? t(`logicalModels.modelStatus${keys[status]}`) : '-'
}
async function loadDetail() {
  if (!logicalModelId.value) return
  model.value = await getLogicalModelApi(logicalModelId.value)
  priorities.value = Object.fromEntries(
    model.value.mounts.map((m) => [m.physical_model_id, m.priority]),
  )
}
async function loadGrants() {
  if (!logicalModelId.value) return
  grants.value = (
    await getLogicalModelPermissionsApi(logicalModelId.value, { page: 1, page_size: 100 })
  ).items
  selectedGrants.value = []
}
async function loadResources() {
  let page = 1,
    total = 1
  while (page <= total) {
    const result = await getModelsApi({ page, page_size: 100 })
    models.value.push(...result.items)
    total = result.total_pages
    page++
  }
  page = 1
  total = 1
  while (page <= total) {
    const result = await getProvidersApi({ page, page_size: 100 })
    providers.value.push(...result.items)
    total = result.total_pages
    page++
  }
  const departments = await getDepartmentListApi({})
  subjectOptions.value.DEPARTMENT = departments.items.map((x) => ({
    value: x.id,
    label: x.display_name || x.name,
  }))
  for (const type of ['GROUP', 'USER'] as const) {
    page = 1
    total = 1
    while (page <= total) {
      if (type === 'GROUP') {
        const result = await getUserGroupListApi({ page, page_size: 100 })
        subjectOptions.value.GROUP.push(
          ...result.items.map((x) => ({ value: x.id, label: x.display_name || x.name })),
        )
        total = result.total_pages
      } else {
        const result = await getUserListApi({ page, page_size: 100 })
        subjectOptions.value.USER.push(
          ...result.items.map((x) => ({ value: x.id, label: x.display_name || x.username })),
        )
        total = result.total_pages
      }
      page++
    }
  }
}
async function changePriority(physicalId: string, old: number) {
  if (!logicalModelId.value) return
  const value = priorities.value[physicalId]
  if (!value || value === old) return
  const anchor = mountRows.value.filter((m) => m.physical_model_id !== physicalId)[value - 2]
  try {
    await updateLogicalModelMountOrderApi(logicalModelId.value, {
      physical_model_id: physicalId,
      placement: value === 1 ? 'FIRST' : anchor ? 'AFTER' : 'LAST',
      ...(value !== 1 && anchor ? { anchor_id: anchor.physical_model_id } : {}),
      reason: DEFAULT_REASON,
    })
    await loadDetail()
  } catch {
    priorities.value[physicalId] = old
  }
}
function openEdit() {
  displayName.value = model.value?.display_name || ''
  description.value = model.value?.description || ''
  editVisible.value = true
}
async function save() {
  if (!logicalModelId.value) return
  await updateLogicalModelApi(logicalModelId.value, {
    reason: DEFAULT_REASON,
    display_name: displayName.value,
    description: description.value,
  })
  editVisible.value = false
  await loadDetail()
  MessagePlugin.success(t('logicalModels.save'))
}
async function deleteModel() {
  if (!logicalModelId.value) return
  await deleteLogicalModelApi(logicalModelId.value, { reason: DEFAULT_REASON })
  await router.push('/model/logical')
}
async function mount() {
  if (!logicalModelId.value || !mountSelection.value.length) return
  await mountLogicalModelApi(logicalModelId.value, {
    physical_model_id: String(mountSelection.value[0]),
    confirm_existing_grant_impact: true,
    reason: DEFAULT_REASON,
  })
  mountVisible.value = false
  mountSelection.value = []
  await loadDetail()
}
async function unmount() {
  if (!logicalModelId.value) return
  await unmountLogicalModelApi(logicalModelId.value, unmountId.value, { reason: DEFAULT_REASON })
  unmountId.value = ''
  await loadDetail()
}
function groupTitle(type: SubjectType) {
  return t(
    `logicalModels.${type === 'DEPARTMENT' ? 'departmentGrants' : type === 'GROUP' ? 'groupGrants' : 'userGrants'}`,
    { n: grants.value.filter((g) => g.subject_type === type).length },
  )
}
function subjectName(grant: LogicalModelPermission) {
  return (
    subjectOptions.value[grant.subject_type].find((x) => x.value === grant.subject_id)?.label ||
    grant.subject_id
  )
}
function toggleGrant(id: string) {
  selectedGrants.value = selectedGrants.value.includes(id)
    ? selectedGrants.value.filter((x) => x !== id)
    : [...selectedGrants.value, id]
}
function toggleGroup(type: SubjectType) {
  const ids = grants.value.filter((g) => g.subject_type === type).map((g) => g.grant_id)
  const all = ids.every((id) => selectedGrants.value.includes(id))
  selectedGrants.value = [
    ...selectedGrants.value.filter((id) => !ids.includes(id)),
    ...(all ? [] : ids),
  ]
}
async function addGrants() {
  if (!logicalModelId.value) return
  await addLogicalModelPermissionsApi(logicalModelId.value, {
    reason: DEFAULT_REASON,
    relations: selectedSubjects.value.map((subject_id) => ({
      subject_id,
      subject_type: subjectType.value,
    })),
  })
  selectedSubjects.value = []
  await Promise.all([loadGrants(), loadDetail()])
}
async function removeGrants() {
  if (!logicalModelId.value) return
  await deleteLogicalModelPermissionsApi(logicalModelId.value, {
    reason: DEFAULT_REASON,
    relations: removeTargets.value,
  })
  removeTargets.value = []
  await Promise.all([loadGrants(), loadDetail()])
}
onMounted(() => {
  if (!logicalModelId.value) return
  void Promise.all([loadDetail(), loadGrants(), loadResources()])
})
</script>
<style scoped>
.panel {
  background: var(--td-bg-color-container);
  padding: var(--td-comp-paddingLR-l);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--td-comp-margin-l);
}
.group {
  margin-top: var(--td-comp-margin-l);
}
.priority {
  width: var(--td-size-20);
}
p {
  color: var(--td-text-color-secondary);
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
}
</style>
