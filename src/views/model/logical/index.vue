<template>
  <section class="panel">
    <div class="toolbar">
      <div class="actions">
        <t-button @click="openCreate">{{ t('logicalModels.create') }}</t-button>
        <t-button theme="default" :disabled="!selected.length" @click="openGrant">
          {{ t('logicalModels.batchGrant') }}（{{ selected.length }}）
        </t-button>
      </div>
      <div class="actions">
        <t-input
          v-model="search"
          :placeholder="t('logicalModels.searchPlaceholder')"
          clearable
          @enter="query"
        />
        <t-button theme="default" @click="query">{{ t('logicalModels.search') }}</t-button>
      </div>
    </div>
    <t-table
      v-model:selected-row-keys="selected"
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :disable-data-page="true"
      @page-change="changePage"
    >
      <template #name="{ row }">{{ row.display_name || row.localized_name }}</template>
      <template #grants>
        <t-space size="8px"
          ><t-tag>{{ t('logicalModels.department') }} 1</t-tag
          ><t-tag>{{ t('logicalModels.group') }} 1</t-tag
          ><t-tag>{{ t('logicalModels.user') }} 0</t-tag></t-space
        >
      </template>
      <template #mounts="{ row }"
        >{{ row.ready ? row.mounts.length : 0 }} / {{ row.mounts.length }}
        {{ t('logicalModels.available') }}</template
      >
      <template #status="{ row }">{{
        t(row.status === 'ACTIVE' ? 'logicalModels.statusActive' : 'logicalModels.statusDisabled')
      }}</template>
      <template #created>—</template>
      <template #action="{ row }">
        <t-space
          ><t-link theme="primary" @click="router.push(`/model/logical/${row.id}`)">{{
            t('logicalModels.detail')
          }}</t-link>
          <t-link theme="primary" @click="openEdit(row)">{{ t('logicalModels.edit') }}</t-link>
          <t-link theme="danger" @click="openDelete(row)">{{
            t('logicalModels.delete')
          }}</t-link></t-space
        >
      </template>
    </t-table>
    <t-dialog
      v-model:visible="formVisible"
      :header="t(editing ? 'logicalModels.edit' : 'logicalModels.create')"
      :confirm-btn="t('logicalModels.save')"
      :cancel-btn="t('logicalModels.cancel')"
      :confirm-loading="saving"
      @confirm="save"
    >
      <t-form label-align="top">
        <t-form-item :label="t('logicalModels.name')" required>
          <t-input
            v-model="name"
            :maxlength="128"
            :placeholder="t('logicalModels.namePlaceholder')"
          />
        </t-form-item>
        <p>{{ t('logicalModels.nameHint') }}</p>
        <t-form-item :label="t('logicalModels.description')">
          <t-textarea
            v-model="description"
            :maxlength="240"
            :placeholder="t('logicalModels.descriptionPlaceholder')"
            indicator
          />
        </t-form-item>
        <template v-if="!editing">
          <t-form-item :label="t('logicalModels.initialMounts')">
            <t-checkbox-group v-model="mountIds" class="mount-list">
              <t-checkbox v-for="model in physicalModels" :key="model.id" :value="model.id">
                {{
                  [model.model_id_at_provider, model.status, model.provider_id]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </t-checkbox>
            </t-checkbox-group>
          </t-form-item>
          <p>
            {{ t('logicalModels.initialMountsHint') }}
          </p>
        </template>
      </t-form>
    </t-dialog>
    <t-dialog
      v-model:visible="deleteVisible"
      :header="t('logicalModels.delete')"
      :confirm-btn="{ content: t('logicalModels.delete'), theme: 'danger' }"
      :cancel-btn="t('logicalModels.cancel')"
      :confirm-loading="saving"
      @confirm="remove"
    >
      {{
        t('logicalModels.deleteConfirm', {
          name: current?.display_name || current?.localized_name || '',
        })
      }}
    </t-dialog>
    <t-dialog
      v-model:visible="grantVisible"
      :header="t('logicalModels.grantTitle')"
      :confirm-btn="t('logicalModels.confirmGrant')"
      :cancel-btn="t('logicalModels.cancel')"
      :confirm-loading="saving"
      @confirm="grant"
    >
      <p>
        {{ t('logicalModels.grantHint', { n: selected.length }) }}
      </p>
      <t-form label-align="top">
        <t-form-item :label="t('logicalModels.subjectType')" required>
          <t-select v-model="subjectType" :options="subjectTypes" @change="loadSubjects" />
        </t-form-item>
        <t-form-item :label="t('logicalModels.subject')" required>
          <t-select v-model="subjectId" :options="subjects" filterable />
        </t-form-item>
      </t-form>
    </t-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  MessagePlugin,
  type PageInfo,
  type PaginationProps,
  type PrimaryTableCol,
} from 'tdesign-vue-next'
import {
  getLogicalModelsApi as getLogicalListApi,
  createLogicalModelApi,
  updateLogicalModelApi,
  deleteLogicalModelApi,
  mountLogicalModelApi,
  addLogicalModelPermissionsApi,
  type LogicalModel,
  type SubjectType,
} from '@/api/modules/logicalModels'
import { getModelsApi, type PhysicalModelItem } from '@/api/modules/models'
import { getDepartmentListApi, getUserGroupListApi, getUserListApi } from '@/api/modules/identity'

const { t } = useI18n()
const router = useRouter()
const items = ref<LogicalModel[]>([])
const selected = ref<(string | number)[]>([])
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [20, 50, 100],
})
// TODO: replace placeholder counts when model authorization counts are available.
const columns = computed<PrimaryTableCol<LogicalModel>[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  { colKey: 'name', title: t('logicalModels.colName'), minWidth: 160 },
  { colKey: 'description', title: t('logicalModels.colDescription'), minWidth: 200 },
  { colKey: 'grants', title: t('logicalModels.colGrants'), width: 220 },
  { colKey: 'mounts', title: t('logicalModels.colMounts'), width: 140 },
  { colKey: 'status', title: t('logicalModels.colStatus'), width: 110 },
  { colKey: 'created', title: t('logicalModels.colCreated'), width: 140 },
  { colKey: 'action', title: t('logicalModels.colAction'), width: 160 },
])
async function load() {
  loading.value = true
  try {
    const result = await getLogicalListApi({
      page: pagination.current || 1,
      page_size: pagination.pageSize || 20,
      search: search.value || undefined,
    })
    items.value = result.items
    pagination.total = result.total
  } finally {
    loading.value = false
  }
}
function query() {
  pagination.current = 1
  void load()
}
function changePage(page: PageInfo) {
  pagination.current = page.current
  pagination.pageSize = page.pageSize
  void load()
}
const formVisible = ref(false)
const deleteVisible = ref(false)
const grantVisible = ref(false)
const editing = ref(false)
const current = ref<LogicalModel | null>(null)
const name = ref('')
const description = ref('')
const mountIds = ref<string[]>([])
const physicalModels = ref<PhysicalModelItem[]>([])
async function openCreate() {
  editing.value = false
  current.value = null
  name.value = ''
  description.value = ''
  mountIds.value = []
  formVisible.value = true
  physicalModels.value = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const result = await getModelsApi({ page, page_size: 100 })
    physicalModels.value.push(...result.items)
    totalPages = result.total_pages
    page++
  }
}
function openEdit(row: LogicalModel) {
  current.value = row
  editing.value = true
  name.value = row.display_name || row.localized_name
  description.value = row.description
  formVisible.value = true
}
function openDelete(row: LogicalModel) {
  current.value = row
  deleteVisible.value = true
}
async function save() {
  if (!name.value.trim() || saving.value) return
  saving.value = true
  try {
    if (editing.value && current.value) {
      const changed = name.value !== (current.value.display_name || current.value.localized_name)
      await updateLogicalModelApi(current.value.id, {
        display_name: name.value,
        description: description.value,
        reason: 'ui-confirm',
      })
      // TODO: support changing the API model name when the backend supports it.
      if (changed) MessagePlugin.warning(t('logicalModels.notSupported'))
    } else {
      const result = await createLogicalModelApi({
        logical_name: name.value,
        display_name: name.value,
        description: description.value,
        reason: 'ui-confirm',
        translations: [],
      })
      let failures = 0
      for (const [index, id] of mountIds.value.entries()) {
        try {
          await mountLogicalModelApi(result.resource_id, {
            physical_model_id: id,
            confirm_existing_grant_impact: false,
            reason: 'ui-confirm',
            priority: index + 1,
          })
        } catch {
          failures++
        }
      }
      if (failures)
        MessagePlugin.warning(
          `${t('logicalModels.createdToast')}，${t('logicalModels.mountFailedToast', { n: failures })}`,
        )
    }
    formVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}
async function remove() {
  if (!current.value || saving.value) return
  saving.value = true
  try {
    await deleteLogicalModelApi(current.value.id, { reason: 'ui-confirm' })
    deleteVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}
const subjectType = ref<SubjectType>('DEPARTMENT')
const subjectId = ref('')
const subjects = ref<{ label: string; value: string }[]>([])
const subjectTypes = computed(() => [
  { label: t('logicalModels.department'), value: 'DEPARTMENT' },
  { label: t('logicalModels.group'), value: 'GROUP' },
  { label: t('logicalModels.user'), value: 'USER' },
])
async function loadSubjects() {
  subjectId.value = ''
  subjects.value = []
  if (subjectType.value === 'DEPARTMENT') {
    const result = await getDepartmentListApi({})
    subjects.value = result.items.map((item) => ({
      label: item.display_name || item.name,
      value: item.id,
    }))
  } else {
    let page = 1
    let totalPages = 1
    while (page <= totalPages) {
      if (subjectType.value === 'GROUP') {
        const result = await getUserGroupListApi({ page, page_size: 100 })
        subjects.value.push(
          ...result.items.map((item) => ({
            label: item.display_name || item.name,
            value: item.id,
          })),
        )
        totalPages = result.total_pages
      } else {
        const result = await getUserListApi({ page, page_size: 100 })
        subjects.value.push(
          ...result.items.map((item) => ({
            label: item.display_name || item.username,
            value: item.id,
          })),
        )
        totalPages = result.total_pages
      }
      page++
    }
  }
}
function openGrant() {
  grantVisible.value = true
  subjectType.value = 'DEPARTMENT'
  void loadSubjects()
}
async function grant() {
  if (!subjectId.value || saving.value) return
  saving.value = true
  try {
    for (const id of selected.value)
      await addLogicalModelPermissionsApi(String(id), {
        reason: 'ui-confirm',
        relations: [{ subject_id: subjectId.value, subject_type: subjectType.value }],
      })
    selected.value = []
    grantVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}
onMounted(load)
</script>
<style scoped>
.panel {
  background: var(--td-bg-color-container);
  padding: var(--td-comp-paddingLR-l);
}
.toolbar {
  display: flex;
  justify-content: space-between;
  gap: var(--td-comp-margin-l);
  margin-bottom: var(--td-comp-margin-l);
}
.actions {
  display: flex;
  gap: var(--td-comp-margin-s);
}
.mount-list {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
p {
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
  color: var(--td-text-color-secondary);
}
</style>
