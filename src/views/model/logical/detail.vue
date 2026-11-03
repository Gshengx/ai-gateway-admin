<template>
  <t-loading :loading="loading" :class="{ 'logical-initial-loading': loading && !model }">
    <section v-if="model" class="panel">
      <div class="row heading">
        <div>
          <t-button
            class="logical-back"
            theme="default"
            variant="text"
            @click="router.push('/model/logical')"
          >
            <template #icon><t-icon name="chevron-left" class="logical-back__icon" /></template>
            {{ t('logicalModels.back') }}
          </t-button>
          <h1>{{ model.logical_name }}</h1>
          <p>
            {{ model.description || '—' }} ·
            {{ t('logicalModels.apiHint', { name: model.logical_name }) }}
          </p>
        </div>
        <t-space class="logical-summary" align="center"
          ><t-tag variant="light" :theme="ready ? 'success' : 'default'">{{
            t(ready ? 'logicalModels.statusActive' : 'logicalModels.unavailable')
          }}</t-tag
          ><span class="logical-summary__text">{{
            t('logicalModels.mountSummary', { ready, total: model.mounts.length })
          }}</span>
          <t-button
            v-permission.write="'model.logical'"
            theme="default"
            variant="outline"
            @click="editVisible = true"
            >{{ t('logicalModels.edit') }}</t-button
          >
          <t-button
            v-permission.write="'model.logical'"
            theme="danger"
            variant="text"
            @click="openDelete"
            >{{ t('logicalModels.delete') }}</t-button
          >
        </t-space>
      </div>
      <t-tabs v-model="activeTab">
        <t-tab-panel value="basic" :label="t('logicalModels.tabBasic')">
          <dl class="logical-basic-grid">
            <dt>{{ t('logicalModels.name') }}</dt>
            <dd>{{ model.logical_name }}</dd>
            <dt>{{ t('logicalModels.description') }}</dt>
            <dd>{{ model.description || '—' }}</dd>
            <dt>{{ t('logicalModels.basicCreated') }}</dt>
            <dd>{{ model.created_at ? formatDateTime(model.created_at) : '—' }}</dd>
            <dt>{{ t('logicalModels.basicMounts') }}</dt>
            <dd>
              {{ t('logicalModels.basicMountsValue', { ready, total: model.mounts.length }) }}
            </dd>
          </dl>
        </t-tab-panel>
        <t-tab-panel
          value="mounts"
          :label="t('logicalModels.tabMounts', { n: model.mounts.length })"
        >
          <div class="tab-content">
            <div class="row block">
              <h3>{{ t('logicalModels.mountedTitle', { n: model.mounts.length }) }}</h3>
              <t-button v-permission.write="'model.logical'" @click="mountVisible = true">{{
                t('logicalModels.mountModel')
              }}</t-button>
            </div>
            <t-table
              row-key="physical_model_id"
              :data="mountRows"
              :columns="mountColumns"
              :pagination="mountPagination"
              :disable-data-page="true"
              @page-change="changeMountPage"
            >
              <template #priority="{ row }"
                ><t-input-number
                  :value="priorities[row.physical_model_id] ?? row.priority"
                  @change="(value: number | undefined) => setPriority(row.physical_model_id, value)"
                  :min="1"
                  :max="model.mounts.length"
                  :decimal-places="0"
                  :disabled="busy || unmountBusy || !canWriteModel"
                  @blur="changePriority(row.physical_model_id, row.priority)"
              /></template>
              <template #status="{ row }">{{
                row.model ? t(`logicalModels.physicalStatuses.${row.model.status}`) : '—'
              }}</template>
              <template #action="{ row }"
                ><t-link
                  v-permission.write="'model.logical'"
                  theme="danger"
                  :disabled="busy || unmountBusy"
                  @click="unmountId = row.physical_model_id"
                  >{{ t('logicalModels.unmount') }}</t-link
                ></template
              >
            </t-table>
          </div>
        </t-tab-panel>
        <t-tab-panel
          v-if="canReadGrants"
          value="permissions"
          :label="t('logicalModels.tabPermissions', { n: grants.length })"
        >
          <div class="tab-content">
            <t-alert
              class="permission-hint block"
              theme="info"
              :message="t('logicalModels.permissionHint')"
            />
            <div v-permission.write="'model.permissions'" class="grant-toolbar block">
              <t-select
                v-model="subjectType"
                :options="subjectTypes"
                @change="selectedSubjects = []"
              />
              <SubjectPicker
                v-if="subjectType === 'DEPARTMENT'"
                class="grant-subject"
                v-model="selectedSubjects"
                :type="subjectType"
                @names="mergeNames"
              />
              <t-select-input
                v-else
                :popup-visible="pickerVisible"
                @popup-visible-change="pickerVisible = $event"
                class="grant-subject"
                :value="selectedSubjects.map((id) => subjectLabels[id] || id)"
                :placeholder="t('logicalModels.subjectPlaceholder')"
                :popup-props="{
                  placement: 'bottom-left',
                  overlayInnerClassName: 'logical-subject-popup',
                }"
                :tag-props="{ closable: true }"
                :min-collapsed-num="0"
                multiple
                clearable
                @tag-change="changeSubjectTags"
                @clear="selectedSubjects = []"
              >
                <template #suffixIcon><t-icon name="chevron-down" /></template>
                <template #panel>
                  <SubjectPicker
                    v-model="selectedSubjects"
                    :type="subjectType"
                    @names="mergeNames"
                  />
                </template>
              </t-select-input>
              <t-button :disabled="!selectedSubjects.length || busy" @click="addGrants">{{
                t('logicalModels.addGrant')
              }}</t-button>
              <t-button
                theme="danger"
                variant="outline"
                :disabled="!selectedGrants.length || busy"
                @click="removeTargets = grants.filter((g) => selectedGrants.includes(g.grant_id))"
                >{{ t('logicalModels.batchRemove', { n: selectedGrants.length }) }}</t-button
              >
            </div>
            <div v-for="type in types" :key="type" class="group">
              <div class="row">
                <h3>{{ groupTitle(type) }}</h3>
                <t-link v-permission.write="'model.permissions'" @click="toggleGroup(type)">{{
                  t('logicalModels.selectGroup')
                }}</t-link>
              </div>
              <div
                v-for="grant in grants.filter((g) => g.subject_type === type)"
                :key="grant.grant_id"
                class="row grant-row"
              >
                <t-checkbox
                  :checked="selectedGrants.includes(grant.grant_id)"
                  :disabled="!canWriteGrants"
                  @change="toggleGrant(grant.grant_id)"
                  >{{ names[grant.subject_id] || grant.subject_id }}</t-checkbox
                >
                <t-link
                  v-permission.write="'model.permissions'"
                  theme="danger"
                  @click="removeTargets = [grant]"
                  >{{ t('logicalModels.remove') }}</t-link
                >
              </div>
              <p v-if="!grants.some((g) => g.subject_type === type)">
                {{ t('logicalModels.empty') }}
              </p>
            </div>
          </div>
        </t-tab-panel>
      </t-tabs>
      <LogicalModelForm v-model:visible="editVisible" :model="model" @saved="loadDetail" />
      <MountPicker
        v-model:visible="mountVisible"
        :id="logicalModelId"
        :mounted="model.mounts.map((x) => x.physical_model_id)"
        @saved="refreshMounts"
      />
      <t-dialog
        v-model:visible="deleteVisible"
        :header="t('logicalModels.deleteTitle')"
        :confirm-btn="{
          content: t('logicalModels.delete'),
          theme: 'danger',
          loading: busy,
          disabled: !reason.trim(),
        }"
        :cancel-btn="t('logicalModels.cancel')"
        @confirm="deleteModel"
      >
        <p>{{ t('logicalModels.deleteConfirm', { name: model.logical_name }) }}</p>
        <t-textarea
          v-model="reason"
          :maxlength="512"
          :placeholder="t('logicalModels.reasonPlaceholder')"
        />
      </t-dialog>
      <t-dialog
        :visible="!!unmountId"
        :header="t('logicalModels.unmount')"
        :confirm-btn="{ content: t('logicalModels.confirm'), loading: unmountBusy }"
        :cancel-btn="{ content: t('logicalModels.cancel'), disabled: unmountBusy }"
        :close-btn="!unmountBusy"
        :close-on-overlay-click="!unmountBusy"
        :close-on-esc-keydown="!unmountBusy"
        @close="closeUnmount"
        @confirm="unmount"
        >{{ t('logicalModels.unmountConfirm') }}</t-dialog
      >
      <t-dialog
        :visible="!!removeTargets.length"
        :header="t('logicalModels.remove')"
        :confirm-btn="{ content: t('logicalModels.confirm'), loading: busy }"
        :cancel-btn="t('logicalModels.cancel')"
        @close="removeTargets = []"
        @confirm="removeGrants"
        >{{ t('logicalModels.removeConfirm') }}</t-dialog
      >
    </section>
    <t-alert v-else-if="!loading" theme="error" :message="t('logicalModels.loadFailed')">
      <template #operation>
        <t-link @click="initialize">{{ t('logicalModels.retry') }}</t-link>
      </template>
    </t-alert>
  </t-loading>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { PageInfo, PrimaryTableCol, SelectInputProps } from 'tdesign-vue-next'
import {
  getLogicalModelApi,
  deleteLogicalModelApi,
  updateLogicalModelMountOrderApi,
  unmountLogicalModelApi,
  getLogicalModelPermissionsApi,
  addLogicalModelPermissionsApi,
  deleteLogicalModelPermissionsApi,
  type LogicalModel,
  type LogicalModelPermission,
  type SubjectType,
} from '@/api/modules/logicalModels'
import { getModelsApi, type PhysicalModelItem } from '@/api/modules/models'
import { getProvidersApi, type ProviderItem } from '@/api/modules/providers'
import { getDepartmentDetailApi, getGroupApi, getUserDetailApi } from '@/api/modules/identity'
import { canReadResource, canWriteResource, useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
import LogicalModelForm from './LogicalModelForm.vue'
import MountPicker from './MountPicker.vue'
import SubjectPicker from './SubjectPicker.vue'
import '@/styles/logical-models.css'
const { t, locale } = useI18n()
const route = useRoute(),
  router = useRouter(),
  user = useUserStore()
const logicalModelId = computed(() => String(route.params.logical_model_id || ''))
const canReadGrants = computed(() => canReadResource(user.permissions, 'model.permissions'))
const canWriteGrants = computed(() => canWriteResource(user.permissions, 'model.permissions'))
const canWriteModel = computed(() => canWriteResource(user.permissions, 'model.logical'))
const model = ref<LogicalModel | null>(null)
const physical = ref<PhysicalModelItem[]>([])
const providers = ref<ProviderItem[]>([])
const ready = ref(0)
const loading = ref(false),
  busy = ref(false)
const activeTab = ref('basic')
const editVisible = ref(false),
  mountVisible = ref(false),
  deleteVisible = ref(false),
  pickerVisible = ref(false)
const unmountId = ref(''),
  reason = ref('')
const unmountBusy = ref(false)
const grants = ref<LogicalModelPermission[]>([])
const selectedGrants = ref<string[]>([]),
  selectedSubjects = ref<string[]>([])
const removeTargets = ref<LogicalModelPermission[]>([])
const priorities = ref<Record<string, number>>({})
const names = ref<Record<string, string>>({})
const subjectLabels = ref<Record<string, string>>({})
const types: SubjectType[] = ['DEPARTMENT', 'GROUP', 'USER']
const subjectType = ref<SubjectType>('DEPARTMENT')
const subjectTypes = computed(() =>
  types.map((value) => ({ value, label: t(`logicalModels.${value.toLowerCase()}`) })),
)
const mountPagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  pageSizeOptions: [20, 50, 100],
})
const mountRows = computed(() =>
  physical.value
    .map((m) => {
      const provider = providers.value.find((p) => p.id === m.provider_id)
      return {
        physical_model_id: m.id,
        priority: model.value?.mounts.find((x) => x.physical_model_id === m.id)?.priority || 1,
        model: m,
        identifier: m.model_id_at_provider,
        modelType: m.model_type,
        provider: provider?.name || '—',
        api: provider?.base_url || m.invocation_api,
        security: provider ? t(`logicalModels.securityLevels.${provider.security_level}`) : '—',
      }
    })
    .sort((a, b) => a.priority - b.priority),
)
const mountColumns = computed<PrimaryTableCol[]>(() =>
  ['priority', 'identifier', 'modelType', 'provider', 'api', 'security', 'status', 'action'].map(
    (colKey, i) => ({
      colKey,
      title: t(
        `logicalModels.${['colPriority', 'colIdentifier', 'colModelType', 'colProvider', 'colApi', 'colSecurity', 'physicalStatus', 'colAction'][i]}`,
      ),
    }),
  ),
)
let version = 0
async function loadDetail() {
  const id = logicalModelId.value
  const result = await getLogicalModelApi(id)
  if (id !== logicalModelId.value) return
  model.value = result
  priorities.value = Object.fromEntries(result.mounts.map((x) => [x.physical_model_id, x.priority]))
  const active = await getModelsApi({
    page: 1,
    page_size: 100,
    logical_model_id: id,
    status: 'ACTIVE',
  })
  if (id === logicalModelId.value) ready.value = active.total
}
async function loadMounts() {
  const id = logicalModelId.value
  const result = await getModelsApi({
    page: mountPagination.current,
    page_size: mountPagination.pageSize,
    logical_model_id: id,
  })
  if (id !== logicalModelId.value) return
  physical.value = result.items
  mountPagination.total = result.total
  if (!result.items.length && mountPagination.current > 1) {
    mountPagination.current--
    await loadMounts()
  }
}
async function refreshMounts() {
  try {
    await loadDetail()
    await loadMounts()
  } catch {
    /* 已提示 */
  }
}
function changeMountPage(p: PageInfo) {
  mountPagination.current = p.current
  mountPagination.pageSize = p.pageSize
  void loadMounts().catch(() => {})
}
function mergeNames(value: Record<string, string>) {
  Object.assign(subjectLabels.value, value)
}
const changeSubjectTags: NonNullable<SelectInputProps['onTagChange']> = (_value, context) => {
  if (context.trigger === 'clear') selectedSubjects.value = []
  else if (
    (context.trigger === 'tag-remove' || context.trigger === 'backspace') &&
    typeof context.index === 'number'
  ) {
    selectedSubjects.value = selectedSubjects.value.filter((_id, index) => index !== context.index)
  }
}
async function loadGrants() {
  if (!canReadGrants.value) return
  const id = logicalModelId.value
  const all: LogicalModelPermission[] = []
  let page = 1,
    total = 1
  while (page <= total) {
    const r = await getLogicalModelPermissionsApi(id, { page, page_size: 100 })
    all.push(...r.items)
    total = r.total_pages
    page++
  }
  if (id !== logicalModelId.value) return
  grants.value = all
  selectedGrants.value = []
  await Promise.all(
    all.map(async (g) => {
      if (names.value[g.subject_id]) return
      try {
        if (g.subject_type === 'DEPARTMENT') {
          const r = await getDepartmentDetailApi(g.subject_id)
          names.value[g.subject_id] = r.name
        } else if (g.subject_type === 'GROUP') {
          const r = await getGroupApi(g.subject_id)
          names.value[g.subject_id] = r.group.display_name || r.group.name
        } else {
          const r = await getUserDetailApi(g.subject_id)
          names.value[g.subject_id] = r.user.display_name || r.user.username
        }
      } catch {
        /* 保留 ID，不猜测不可见对象名称。 */
      }
    }),
  )
}
async function initialize() {
  const v = ++version
  model.value = null
  loading.value = true
  try {
    providers.value = []
    let page = 1,
      total = 1
    while (page <= total) {
      const r = await getProvidersApi({ page, page_size: 100 })
      if (v !== version) return
      providers.value.push(...r.items)
      total = r.total_pages
      page++
    }
    await Promise.all([loadDetail(), loadMounts(), loadGrants()])
  } catch {
    /* 已提示 */
  } finally {
    if (v === version) loading.value = false
  }
}
function setPriority(id: string, value: number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) priorities.value[id] = value
}
async function changePriority(id: string, old: number) {
  const value = priorities.value[id]
  if (busy.value || !value || value === old) return
  busy.value = true
  try {
    const order = (model.value?.mounts || [])
      .filter((x) => x.physical_model_id !== id)
      .sort((a, b) => a.priority - b.priority)
    const anchor = order[value - 2]
    await updateLogicalModelMountOrderApi(logicalModelId.value, {
      physical_model_id: id,
      placement: value === 1 ? 'FIRST' : anchor ? 'AFTER' : 'LAST',
      ...(anchor && value !== 1 ? { anchor_id: anchor.physical_model_id } : {}),
      reason: 'admin-console',
    })
    await refreshMounts()
  } catch {
    priorities.value[id] = old
  } finally {
    busy.value = false
  }
}
function openDelete() {
  reason.value = ''
  deleteVisible.value = true
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } catch {
    /* 拦截器已提示 */
  } finally {
    busy.value = false
  }
}
function deleteModel() {
  if (!reason.value.trim()) return
  void run(async () => {
    await deleteLogicalModelApi(logicalModelId.value, { reason: reason.value.trim() })
    await router.push('/model/logical')
  })
}
function closeUnmount() {
  if (!unmountBusy.value) unmountId.value = ''
}
async function unmount() {
  if (unmountBusy.value || !unmountId.value || busy.value) return
  const id = logicalModelId.value
  const target = unmountId.value
  unmountBusy.value = true
  try {
    await unmountLogicalModelApi(id, target, { reason: 'admin-console' })
    if (id !== logicalModelId.value) return
    await refreshMounts()
    unmountId.value = ''
  } catch {
    /* 拦截器已提示，保留当前对象供重试。 */
  } finally {
    unmountBusy.value = false
  }
}
function groupTitle(type: SubjectType) {
  return t(
    `logicalModels.${type === 'DEPARTMENT' ? 'departmentGrants' : type === 'GROUP' ? 'groupGrants' : 'userGrants'}`,
    { n: grants.value.filter((g) => g.subject_type === type).length },
  )
}
function toggleGrant(id: string) {
  selectedGrants.value = selectedGrants.value.includes(id)
    ? selectedGrants.value.filter((x) => x !== id)
    : [...selectedGrants.value, id]
}
function toggleGroup(type: SubjectType) {
  const ids = grants.value.filter((g) => g.subject_type === type).map((g) => g.grant_id)
  const all = ids.every((x) => selectedGrants.value.includes(x))
  selectedGrants.value = [
    ...selectedGrants.value.filter((x) => !ids.includes(x)),
    ...(all ? [] : ids),
  ]
}
function addGrants() {
  if (!selectedSubjects.value.length) return
  void run(async () => {
    await addLogicalModelPermissionsApi(logicalModelId.value, {
      reason: 'admin-console',
      relations: selectedSubjects.value.map((subject_id) => ({
        subject_id,
        subject_type: subjectType.value,
      })),
    })
    selectedSubjects.value = []
    await loadGrants()
  })
}
function removeGrants() {
  void run(async () => {
    await deleteLogicalModelPermissionsApi(logicalModelId.value, {
      reason: 'admin-console',
      relations: removeTargets.value,
    })
    removeTargets.value = []
    await loadGrants()
  })
}
watch(
  [logicalModelId, locale],
  () => {
    mountPagination.current = 1
    activeTab.value = 'basic'
    names.value = {}
    subjectLabels.value = {}
    grants.value = []
    void initialize()
  },
  { immediate: true },
)
</script>
<style scoped>
.logical-initial-loading {
  min-height: calc(100dvh - var(--layout-header-height) - 2 * var(--td-comp-paddingTB-l));
}
.panel {
  background: transparent;
}
.panel :deep(.t-tabs) {
  background: var(--td-bg-color-container);
  padding: var(--td-comp-paddingLR-l);
  border-radius: var(--td-radius-medium);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--td-comp-margin-l);
}
.heading {
  margin: 0 0 var(--td-comp-margin-l);
  flex-wrap: wrap;
}
.logical-back {
  margin-bottom: var(--td-comp-margin-s);
  padding: 0 var(--td-comp-paddingLR-s);
  font: var(--td-font-body-medium);
}
.logical-back__icon {
  font-size: var(--td-font-size-body-large);
}
.logical-summary :deep(.t-space-item) {
  display: flex;
  align-items: center;
}
.logical-summary__text {
  color: var(--td-text-color-secondary);
  font: var(--td-font-body-medium);
}
.logical-basic-grid {
  display: grid;
  grid-template-columns: minmax(0, var(--logical-basic-label-width)) minmax(0, 1fr);
  max-width: var(--logical-basic-width);
  gap: var(--td-comp-margin-l);
  margin: var(--td-comp-margin-l) 0;
}
.logical-basic-grid dt {
  color: var(--td-text-color-secondary);
}
.logical-basic-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}
h1,
h3 {
  margin: 0;
}
h1 {
  font: var(--td-font-title-large);
}
h3 {
  font: var(--td-font-title-medium);
}
p {
  color: var(--td-text-color-secondary);
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
}
.tab-content {
  padding-top: var(--td-comp-margin-l);
}
.block,
.group {
  margin-bottom: var(--td-comp-margin-l);
}
.grant-toolbar {
  display: flex;
  gap: var(--td-comp-margin-s);
  align-items: center;
  flex-wrap: wrap;
}
.grant-toolbar > :deep(.t-select__wrap) {
  width: var(--logical-subject-type-width);
  flex: 0 0 auto;
}
.grant-subject {
  width: var(--logical-subject-field-width);
  max-width: 100%;
  flex: 0 1 var(--logical-subject-field-width);
}
.grant-subject :deep(.t-tag) {
  font-size: var(--td-font-size-body-medium);
}
.grant-row {
  margin-top: var(--td-comp-margin-s);
}
</style>
