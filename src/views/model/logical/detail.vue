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
            t('logicalModels.mountSummary', { ready, total: mountPagination.total })
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
            <dt>{{ t('logicalModels.colGrants') }}</dt>
            <dd>
              <AuthorizationSummary
                :summary="model.authorization_summary"
                :readable="canReadGrants"
                @select="openPermissions"
              />
            </dd>
            <dt>{{ t('logicalModels.basicMounts') }}</dt>
            <dd>
              {{ t('logicalModels.basicMountsValue', { ready, total: mountPagination.total }) }}
            </dd>
          </dl>
        </t-tab-panel>
        <t-tab-panel
          value="mounts"
          :label="t('logicalModels.tabMounts', { n: mountPagination.total })"
        >
          <div class="tab-content">
            <div class="row block">
              <h3>{{ t('logicalModels.mountedTitle', { n: mountPagination.total }) }}</h3>
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
                  :max="Math.max(999, row.priority)"
                  :decimal-places="0"
                  :disabled="busy || unmountBusy || !canWriteModel"
                  @blur="
                    (value: number | string) => {
                      setPriority(row.physical_model_id, Number(value))
                      void changePriority(row.physical_model_id, row.priority)
                    }
                  "
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
            <div
              v-if="activeTab === 'permissions'"
              v-permission.write="'model.permissions'"
              class="grant-toolbar block"
            >
              <t-select
                v-model="subjectType"
                :options="subjectTypes"
                @change="
                  () => {
                    selectedSubjects = []
                    pickerVisible = false
                  }
                "
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
                    v-if="pickerVisible"
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
                  >{{ grant.subject_name || names[grant.subject_id] || '—' }}</t-checkbox
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
          disabled: !reason.trim() || impactBlocked,
        }"
        :cancel-btn="t('logicalModels.cancel')"
        @confirm="deleteModel"
      >
        <ModelImpactNotice
          v-if="deleteVisible"
          resource="logical-models"
          :id="logicalModelId"
          @blocked="impactBlocked = $event"
        />
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
import ModelImpactNotice from '../ModelImpactNotice.vue'
import AuthorizationSummary from '../AuthorizationSummary.vue'
import { getModelApi, type PhysicalModelItem } from '@/api/modules/models'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  MessagePlugin,
  type PageInfo,
  type PrimaryTableCol,
  type SelectInputProps,
} from 'tdesign-vue-next'
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
  type LogicalMount,
} from '@/api/modules/logicalModels'
import { canReadResource, canWriteResource, useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
import LogicalModelForm from './LogicalModelForm.vue'
import MountPicker from './MountPicker.vue'
import SubjectPicker from './SubjectPicker.vue'
import '@/styles/logical-models.css'
const impactBlocked = ref(true)
const { t, locale } = useI18n()
const route = useRoute(),
  router = useRouter(),
  user = useUserStore()
const logicalModelId = computed(() => String(route.params.logical_model_id || ''))
const canReadGrants = computed(() => canReadResource(user.permissions, 'model.permissions'))
const canWriteGrants = computed(() => canWriteResource(user.permissions, 'model.permissions'))
const canWriteModel = computed(() => canWriteResource(user.permissions, 'model.logical'))
const model = ref<LogicalModel | null>(null)
const mountedRows = ref<LogicalMount[]>([])
const mountedDetails = ref<Record<string, PhysicalModelItem>>({})
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
  mountedRows.value.map((m) => ({
    physical_model_id: m.physical_model_id,
    priority: m.priority,
    model: m.status ? { status: m.status } : null,
    identifier: m.model_id_at_provider || '—',
    modelType: mountedDetails.value[m.physical_model_id]?.model_type || '—',
    provider: m.provider_name || '—',
    api: m.provider_base_url || '—',
    security: m.provider_security_level
      ? t(`logicalModels.securityLevels.${m.provider_security_level}`)
      : '—',
  })),
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
  if (!id) return
  const result = await getLogicalModelApi(id, mountPagination.current, mountPagination.pageSize)
  if (id !== logicalModelId.value) return
  model.value = result
  mountedRows.value = result.related_mounts?.items ?? result.mounts
  mountPagination.total = result.related_mounts?.total ?? result.mounts.length
  priorities.value = Object.fromEntries(
    mountedRows.value.map((x) => [x.physical_model_id, x.priority]),
  )
  ready.value = result.active_model_count ?? (result.ready ? result.candidate_count : 0)
  mountedDetails.value = {}
  if (canReadResource(user.permissions, 'model.models')) {
    const details = await Promise.allSettled(
      mountedRows.value.map((mount) => getModelApi(mount.physical_model_id)),
    )
    if (id !== logicalModelId.value) return
    mountedDetails.value = Object.fromEntries(
      details.flatMap((entry) =>
        entry.status === 'fulfilled' ? [[entry.value.id, entry.value]] : [],
      ),
    )
  }
}
async function loadMounts() {
  await loadDetail()
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
function openPermissions(type: SubjectType) {
  if (!canReadGrants.value) return
  subjectType.value = type
  selectedSubjects.value = []
  pickerVisible.value = false
  activeTab.value = 'permissions'
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
  if (!id) return
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
  if (activeTab.value === 'permissions') await loadGrantNames()
}
async function loadGrantNames() {
  for (const grant of grants.value)
    if (grant.subject_name) names.value[grant.subject_id] = grant.subject_name
}
watch(activeTab, (tab) => {
  pickerVisible.value = false
  if (tab === 'permissions' && !loading.value) void loadGrants()
})
async function initialize() {
  if (!logicalModelId.value) return
  const v = ++version
  model.value = null
  loading.value = true
  try {
    await loadDetail()
    if (activeTab.value === 'permissions') await loadGrants()
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
    await updateLogicalModelMountOrderApi(logicalModelId.value, {
      physical_model_id: id,
      placement: 'PRIORITY',
      priority: value,
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
  if (!reason.value.trim() || impactBlocked.value) return
  void run(async () => {
    await deleteLogicalModelApi(logicalModelId.value, { reason: reason.value.trim() })
    MessagePlugin.success(t('ma.success'))
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
    MessagePlugin.success(t('ma.success'))
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
    MessagePlugin.success(t('ma.success'))
    await Promise.all([loadGrants(), loadDetail()])
  })
}
function removeGrants() {
  void run(async () => {
    await deleteLogicalModelPermissionsApi(logicalModelId.value, {
      reason: 'admin-console',
      relations: removeTargets.value,
    })
    removeTargets.value = []
    MessagePlugin.success(t('ma.success'))
    await Promise.all([loadGrants(), loadDetail()])
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
watch(
  [() => route.query.tab, () => route.query.subject_type, canReadGrants],
  ([tab, type]) => {
    if (tab === 'permissions' && canReadGrants.value)
      openPermissions(
        type === 'USER'
          ? 'USER'
          : type === 'GROUP' || type === 'USER_GROUP'
            ? 'GROUP'
            : 'DEPARTMENT',
      )
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
