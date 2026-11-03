<template>
  <section class="panel identity-list-panel model-list-panel">
    <FilterBar class="provider-filter">
      <template #content>
        <div class="filters">
          <t-input v-model="search" :placeholder="t('providers.search')" clearable>
            <template #prefix-icon><t-icon name="search" /></template>
          </t-input>
          <t-button theme="default" @click="search = ''">{{ t('providers.reset') }}</t-button>
        </div>
      </template>
    </FilterBar>
    <div class="toolbar">
      <t-button
        v-permission.write="'model.providers'"
        :disabled="!templates.length || detailLoading"
        @click="openCreate"
      >
        <template #icon><t-icon name="add" /></template>
        {{ t('providers.create') }}
      </t-button>
    </div>
    <t-table
      row-key="id"
      table-layout="fixed"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :disable-data-page="true"
      @page-change="changePage"
    >
      <template #name="{ row }">
        <div class="provider-name">
          <t-avatar size="small">{{ badge(row.template_key) }}</t-avatar>
          <t-link theme="primary" @click="openDetail(row.id)">{{ row.name }}</t-link>
        </div>
      </template>
      <template #template_key="{ row }">{{ templateName(row.template_key) }}</template>
      <template #security_level="{ row }">{{
        t(`providers.security.${row.security_level}`)
      }}</template>
      <template #action="{ row }">
        <div class="actions">
          <t-link
            v-permission.write="'model.providers'"
            theme="primary"
            @click="modelProvider = row"
            >{{ t('providers.getModels') }}</t-link
          >
          <t-link v-permission.write="'model.providers'" theme="primary" @click="openEdit(row.id)">
            {{ t('providers.edit') }}
          </t-link>
          <t-link v-permission.write="'model.providers'" theme="danger" @click="openDelete(row)">
            {{ t('providers.delete') }}
          </t-link>
        </div>
      </template>
    </t-table>
  </section>
  <t-drawer v-model:visible="detailVisible" :header="false" :footer="false" size="large">
    <t-loading :loading="detailLoading" show-overlay>
      <t-alert v-if="detailError" theme="error" :message="t('providers.detailError')" />
      <template v-if="detail">
        <div class="detail-header">
          <div class="detail-title">
            <strong>{{ detail.name }}</strong>
            <t-tag>{{ t(`providers.security.${detail.security_level}`) }}</t-tag>
          </div>
          <div class="actions">
            <t-button
              v-permission.write="'model.providers'"
              theme="default"
              @click="modelProvider = detail"
              >{{ t('providers.getModels') }}</t-button
            >
            <t-button
              v-permission.write="'model.providers'"
              theme="default"
              @click="openEdit(detail.id)"
              >{{ t('providers.edit') }}</t-button
            >
            <t-button
              v-permission.write="'model.providers'"
              theme="danger"
              variant="outline"
              @click="openDelete(detail)"
              >{{ t('providers.delete') }}</t-button
            >
          </div>
        </div>
        <t-descriptions :column="1" bordered class="detail-section">
          <t-descriptions-item :label="t('providers.template')">{{
            templateName(detail.template_key)
          }}</t-descriptions-item>
          <t-descriptions-item :label="t('providers.api')">{{
            detail.base_url
          }}</t-descriptions-item>
          <t-descriptions-item :label="t('providers.securityLevel')">{{
            t(`providers.security.${detail.security_level}`)
          }}</t-descriptions-item>
          <t-descriptions-item :label="t('providers.notes')">{{
            detail.notes || '—'
          }}</t-descriptions-item>
          <t-descriptions-item :label="t('providers.createdAt')">—</t-descriptions-item>
          <t-descriptions-item :label="t('providers.auth')">{{
            detail.configured_secret_fields.length
              ? detail.configured_secret_fields.join(', ') + ' — ' + t('providers.secretConfigured')
              : '—'
          }}</t-descriptions-item>
        </t-descriptions>
        <div class="detail-section">
          <h3>{{ t('providers.relatedModels', { n: modelPagination.total }) }}</h3>
          <t-table
            row-key="id"
            :data="models"
            :columns="modelColumns"
            :loading="modelsLoading"
            :pagination="modelPagination"
            :disable-data-page="true"
            @page-change="changeModelPage"
          >
            <template #mounts="{ row }">{{
              row.mounts
                .map(
                  (mount: ProviderModel['mounts'][number]) =>
                    mount.display_name || mount.logical_name,
                )
                .join(', ') || '—'
            }}</template>
            <template #status="{ row }">{{
              t(`providers.modelStatus.${row.mounts.length ? row.status : 'UNMOUNTED'}`)
            }}</template>
          </t-table>
        </div>
      </template>
    </t-loading>
  </t-drawer>
  <t-dialog
    v-model:visible="deleteVisible"
    :header="t('providers.deleteTitle')"
    :confirm-btn="{ content: t('providers.delete'), theme: 'danger', loading: deleting }"
    :cancel-btn="{ content: t('common.cancel'), disabled: deleting }"
    :close-on-overlay-click="false"
    @confirm="deleteProvider"
  >
    <p>
      {{
        t('providers.deleteConfirm', {
          name: deletingProvider?.name,
          n: deletingProvider?.model_count,
        })
      }}
    </p>
    <t-input v-model="deleteReason" :placeholder="t('providers.reasonRequired')" :maxlength="512" />
  </t-dialog>
  <GetModelsDialog
    v-if="modelProvider"
    :provider="modelProvider"
    :templates="templates"
    @close="modelProvider = null"
    @imported="fetchList"
  />
  <t-dialog
    destroy-on-close
    :visible="visible"
    :header="t(editing ? 'providers.editTitle' : 'providers.create')"
    width="var(--provider-dialog-width)"
    :close-on-overlay-click="false"
    :confirm-btn="{
      content: t('common.confirm'),
      loading: saving,
      disabled: !selectedTemplate || !selectedCombination,
    }"
    :cancel-btn="{ content: t('common.cancel'), disabled: saving }"
    @confirm="submit"
    @close="close"
  >
    <t-form
      ref="formRef"
      :data="form"
      :rules="rules"
      label-align="top"
      :disabled="saving"
      class="provider-form"
    >
      <div class="provider-form-row">
        <t-form-item name="name" :label="t('providers.name')">
          <t-input
            v-model="form.name"
            :maxlength="128"
            :placeholder="t('providers.namePlaceholder')"
          />
        </t-form-item>
        <t-form-item name="template_key" :label="t('providers.template')">
          <t-select
            v-model="form.template_key"
            :options="templateOptions"
            :disabled="!!editing || saving"
            @change="changeTemplate"
          />
        </t-form-item>
      </div>
      <t-form-item name="base_url" :label="t('providers.baseUrl')">
        <t-input
          v-model="form.base_url"
          :maxlength="2048"
          :placeholder="t('providers.urlPlaceholder')"
        />
      </t-form-item>
      <div class="auth-heading">
        <div>{{ t('providers.auth') }}</div>
        <p>{{ t('providers.authHint') }}</p>
      </div>
      <t-form-item v-if="variantOptions.length > 1" :label="t('providers.authMode')">
        <t-select v-model="form.auth_mode" :options="variantOptions" @change="changeAuthMode" />
      </t-form-item>
      <t-form-item
        v-for="field in selectedFields"
        :key="`${form.template_key}-${field.key}`"
        :name="`values.${field.key}`"
        :label="fieldLabel(field)"
        :required-mark="field.required"
      >
        <t-input
          v-if="supportedField(field)"
          v-model="form.values[field.key]"
          :type="field.value_type === 'SECRET' ? 'password' : 'text'"
          autocomplete="off"
          :maxlength="field.max_length"
          :placeholder="fieldPlaceholder(field)"
        />
        <span v-else class="unsupported">{{ t('providers.unsupportedField') }}</span>
      </t-form-item>
      <t-form-item name="security_level" :label="t('providers.securityLevel')">
        <t-select v-model="form.security_level" :options="securityOptions" />
      </t-form-item>
      <t-form-item v-if="editing" name="reason" :label="t('providers.reason')">
        <t-input v-model="form.reason" :maxlength="512" />
      </t-form-item>
      <t-form-item name="notes" :label="t('providers.notes')">
        <t-textarea
          v-model="form.notes"
          :maxlength="2000"
          :placeholder="t('providers.notesPlaceholder')"
          :autosize="{ minRows: 3, maxRows: 5 }"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MessagePlugin,
  type FormInstanceFunctions,
  type FormRules,
  type PageInfo,
  type PaginationProps,
  type PrimaryTableCol,
} from 'tdesign-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import GetModelsDialog from './GetModelsDialog.vue'
import {
  createProviderApi,
  deleteProviderApi,
  getProviderModelsApi,
  getProviderApi,
  getProvidersApi,
  getProviderTemplatesApi,
  updateProviderApi,
  publicConfigKeys,
  secretKeys,
  type ProviderItem,
  type ProviderModel,
  type ProviderPayload,
  type ProviderTemplate,
  type PublicConfigKey,
  type SecretKey,
  type SecurityLevel,
  type TemplateField,
} from '@/api/modules/providers'

const { t, locale } = useI18n()
const detailVisible = ref(false)
const detail = ref<ProviderItem | null>(null)
const detailError = ref(false)
const models = ref<ProviderModel[]>([])
const modelsLoading = ref(false)
const deleteVisible = ref(false)
const deletingProvider = ref<ProviderItem | null>(null)
const deleteReason = ref('')
const deleting = ref(false)
const modelPagination = reactive<PaginationProps>({ current: 1, pageSize: 20, total: 0 })
const modelColumns = computed<PrimaryTableCol<ProviderModel>[]>(() => [
  { colKey: 'model_id_at_provider', title: t('providers.providerModelId') },
  { colKey: 'mounts', title: t('providers.logicalModel') },
  { colKey: 'model_type', title: t('providerModels.type') },
  { colKey: 'status', title: t('providerModels.status') },
])
let detailRequest = 0
let modelRequest = 0
async function openDetail(id: string) {
  const requestId = ++detailRequest
  detailVisible.value = true
  detail.value = null
  detailError.value = false
  detailLoading.value = true
  ++modelRequest
  models.value = []
  modelPagination.current = 1
  modelPagination.total = 0
  try {
    const result = await getProviderApi(id)
    if (requestId !== detailRequest) return
    detail.value = result
    void fetchModels(id)
  } catch {
    if (requestId === detailRequest) detailError.value = true
  } finally {
    if (requestId === detailRequest) detailLoading.value = false
  }
}
async function fetchModels(id: string) {
  const requestId = ++modelRequest
  modelsLoading.value = true
  try {
    const result = await getProviderModelsApi(
      id,
      modelPagination.current ?? 1,
      modelPagination.pageSize ?? 20,
    )
    if (requestId !== modelRequest) return
    models.value = result.items
    modelPagination.total = result.total
  } catch {
    if (requestId === modelRequest) models.value = []
  } finally {
    if (requestId === modelRequest) modelsLoading.value = false
  }
}
function changeModelPage(info: PageInfo) {
  modelPagination.current = info.pageSize !== modelPagination.pageSize ? 1 : info.current
  modelPagination.pageSize = info.pageSize
  if (detail.value) void fetchModels(detail.value.id)
}
async function deleteProvider() {
  if (!deletingProvider.value || deleting.value) return
  if (!deleteReason.value.trim()) {
    MessagePlugin.warning(t('providers.reasonRequired'))
    return
  }
  deleting.value = true
  try {
    await deleteProviderApi(deletingProvider.value.id, deleteReason.value.trim())
    MessagePlugin.success(t('providers.deleted'))
    deleteVisible.value = false
    detailVisible.value = false
    deleteReason.value = ''
    await fetchList()
  } catch {
    /* Errors are handled by the request interceptor. */
  } finally {
    deleting.value = false
  }
}
function openDelete(provider: ProviderItem) {
  deletingProvider.value = provider
  deleteReason.value = ''
  deleteVisible.value = true
}
const modelProvider = ref<ProviderItem | null>(null)
const search = ref('')
const items = ref<ProviderItem[]>([])
const templates = ref<ProviderTemplate[]>([])
const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const visible = ref(false)
const editing = ref<ProviderItem | null>(null)
const formRef = ref<FormInstanceFunctions>()
const form = reactive({
  name: '',
  template_key: '',
  auth_mode: '',
  base_url: '',
  security_level: 'INTERNET' as SecurityLevel,
  notes: '',
  reason: '',
  values: {} as Record<string, string>,
})
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [10, 20, 50, 100],
})
const selectedTemplate = computed(() =>
  templates.value.find((item) => item.template_key === form.template_key),
)
const selectedCombination = computed(
  () =>
    selectedTemplate.value?.combinations.find(
      (item) => item.auth_mode === form.auth_mode && item.support_status !== 'UNAVAILABLE',
    ) ?? selectedTemplate.value?.variants.find((item) => item.auth_mode === form.auth_mode),
)
const selectedVariant = computed(() =>
  selectedTemplate.value?.variants.find((item) => item.auth_mode === form.auth_mode),
)
const selectedFields = computed(
  () => selectedVariant.value?.fields ?? selectedTemplate.value?.fields ?? [],
)
const variantOptions = computed(() =>
  (selectedTemplate.value?.variants ?? []).map((item) => ({
    value: item.auth_mode,
    label: locale.value === 'en-US' ? item.label_en : item.label_zh,
  })),
)
const templateOptions = computed(() => {
  const options = templates.value.map((item) => ({
    label: item.display_name,
    value: item.template_key,
  }))
  if (editing.value && !options.some((item) => item.value === editing.value?.template_key)) {
    options.push({ label: editing.value.template_key, value: editing.value.template_key })
  }
  return options
})
const securityOptions = computed(() =>
  (['INTERNET', 'TRUSTED_CLOUD', 'PRIVATE'] as const).map((value) => ({
    value,
    label: t(`providers.security.${value}`),
  })),
)
const columns = computed<PrimaryTableCol<ProviderItem>[]>(() => [
  { colKey: 'name', title: t('providers.name'), width: 150 },
  { colKey: 'template_key', title: t('providers.template'), width: 140 },
  { colKey: 'base_url', title: t('providers.api'), width: 200, ellipsis: true },
  { colKey: 'security_level', title: t('providers.securityLevel'), width: 95 },
  { colKey: 'model_count', title: t('providers.modelCount'), width: 90 },
  { colKey: 'notes', title: t('providers.notes'), width: 140, ellipsis: true },
  { colKey: 'action', title: t('providers.action'), width: 210, fixed: 'right' },
])
function supportedField(field: TemplateField) {
  return field.value_type === 'SECRET'
    ? secretKeys.includes(field.key as SecretKey)
    : publicConfigKeys.includes(field.key as PublicConfigKey)
}
function fieldLabel(field: TemplateField) {
  return locale.value === 'en-US' ? field.label_en : field.label_zh
}
function fieldPlaceholder(field: TemplateField) {
  return field.value_type === 'SECRET' &&
    editing.value?.auth_mode === form.auth_mode &&
    editing.value?.configured_secret_fields.includes(field.key)
    ? t('providers.configured')
    : t('providers.enterField', { label: fieldLabel(field) })
}
const rules = computed<FormRules>(() => {
  const required = (label: string) => [
    { required: true, whitespace: true, message: t('providers.required', { label }) },
  ]
  const result: FormRules = {
    name: required(t('providers.name')),
    template_key: required(t('providers.template')),
    base_url: [
      ...required(t('providers.baseUrl')),
      {
        validator: (value: string) => {
          try {
            const url = new URL(value.trim())
            return url.protocol === 'http:' || url.protocol === 'https:'
          } catch {
            return false
          }
        },
        message: t('providers.invalidUrl'),
      },
    ],
    security_level: required(t('providers.securityLevel')),
    ...(editing.value ? { reason: required(t('providers.reason')) } : {}),
  }
  for (const field of selectedFields.value) {
    if (!supportedField(field)) continue
    const configured =
      field.value_type === 'SECRET' &&
      editing.value?.auth_mode === form.auth_mode &&
      editing.value?.configured_secret_fields.includes(field.key)
    if (field.required && !configured) result[`values.${field.key}`] = required(fieldLabel(field))
  }
  return result
})
function templateName(key: string) {
  return templates.value.find((item) => item.template_key === key)?.display_name ?? key
}
function badge(key: string) {
  if (key === 'openai_compatible' && locale.value !== 'en-US') return '兼'
  return Array.from(templateName(key))[0]
}
let listRequest = 0
async function fetchList() {
  const requestId = ++listRequest
  loading.value = true
  try {
    const result = await getProvidersApi({
      page: pagination.current ?? 1,
      page_size: pagination.pageSize ?? 20,
      search: search.value.trim() || undefined,
    })
    if (requestId !== listRequest) return
    pagination.total = result.total
    pagination.pageSize = result.page_size
    pagination.current = Math.min(result.page, Math.max(1, result.total_pages))
    if (result.page !== pagination.current) {
      await fetchList()
      return
    }
    items.value = result.items
  } catch {
    if (requestId === listRequest) {
      items.value = []
      pagination.total = 0
    }
  } finally {
    if (requestId === listRequest) loading.value = false
  }
}
watch(search, () => {
  pagination.current = 1
  void fetchList()
})
function changePage(info: PageInfo) {
  pagination.current = info.pageSize !== pagination.pageSize ? 1 : info.current
  pagination.pageSize = info.pageSize
  void fetchList()
}
function changeTemplate() {
  form.auth_mode = selectedTemplate.value?.variants[0]?.auth_mode ?? ''
  changeAuthMode()
  form.base_url = selectedTemplate.value?.default_base_url ?? ''
}
function changeAuthMode() {
  form.values = {}
  for (const field of selectedFields.value) form.values[field.key] = ''
  if (form.template_key === 'anthropic' && 'api_version' in form.values) {
    form.values.api_version = '2023-06-01'
  }
  void nextTick(() => formRef.value?.clearValidate())
}
function openCreate() {
  editing.value = null
  Object.assign(form, {
    name: '',
    template_key:
      templates.value.find((item) => item.template_key === 'openai')?.template_key ??
      templates.value[0]?.template_key ??
      '',
    security_level: 'INTERNET',
    notes: '',
  })
  changeTemplate()
  visible.value = true
}
async function openEdit(id: string) {
  if (detailLoading.value) return
  detailLoading.value = true
  try {
    const detail = await getProviderApi(id)
    editing.value = detail
    Object.assign(form, {
      name: detail.name,
      template_key: detail.template_key,
      auth_mode: detail.auth_mode,
      base_url: detail.base_url,
      security_level: detail.security_level,
      notes: detail.notes,
      reason: '',
      values: {},
    })
    for (const field of selectedFields.value) {
      form.values[field.key] =
        field.value_type === 'STRING'
          ? (detail.public_config[field.key as PublicConfigKey] ?? '')
          : ''
    }
    visible.value = true
    void nextTick(() => formRef.value?.clearValidate())
  } catch {
    /* 请求层统一提示 */
  } finally {
    detailLoading.value = false
  }
}
function close() {
  if (saving.value) return
  visible.value = false
  form.values = {}
  editing.value = null
}
async function submit() {
  if (saving.value || !selectedTemplate.value || !selectedCombination.value) return
  if ((await formRef.value?.validate()) !== true) return
  const publicConfig: ProviderPayload['public_config'] = { ...(editing.value?.public_config ?? {}) }
  // 仅提交当前认证方式对应的密钥字段，后端会拒绝模板之外的密钥键。
  // 切换认证方式时旧密钥由后端自动清理，无需显式 CLEAR。
  const secretActions: ProviderPayload['secret_actions'] = {}
  for (const field of selectedFields.value) {
    if (!supportedField(field)) continue
    const value = form.values[field.key] ?? ''
    if (field.value_type === 'STRING') publicConfig[field.key as PublicConfigKey] = value
    else if (value) secretActions[field.key as SecretKey] = { operation: 'REPLACE', value }
    else if (
      editing.value?.auth_mode === form.auth_mode &&
      editing.value.configured_secret_fields.includes(field.key)
    )
      secretActions[field.key as SecretKey] = { operation: 'KEEP' }
  }
  // 白名单过滤：模板字段或详情中的额外键均不得进入请求。
  const payload: ProviderPayload = {
    template_key: form.template_key,
    name: form.name.trim(),
    base_url: form.base_url.trim(),
    auth_mode: selectedCombination.value.auth_mode,
    endpoint_profile: selectedCombination.value.endpoint_profile,
    security_level: form.security_level,
    notes: form.notes,
    public_config: Object.fromEntries(
      Object.entries(publicConfig).filter(([key]) =>
        publicConfigKeys.includes(key as PublicConfigKey),
      ),
    ),
    secret_actions: secretActions,
    reason: editing.value ? form.reason.trim() : t('providers.create'),
  }
  saving.value = true
  try {
    const isCreating = !editing.value
    const result = editing.value
      ? await updateProviderApi(editing.value.id, payload)
      : await createProviderApi(payload)
    MessagePlugin.success(t('providers.saved'))
    saving.value = false
    close()
    await fetchList()
    if (isCreating) modelProvider.value = await getProviderApi(result.resource_id)
  } catch {
    /* 请求层统一提示 */
  } finally {
    saving.value = false
  }
}
onMounted(() => {
  void fetchList()
  void getProviderTemplatesApi()
    .then((result) => {
      templates.value = result.items
    })
    .catch(() => {
      /* 请求层统一提示 */
    })
})
</script>

<style scoped>
.detail-header,
.detail-title {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.detail-header {
  justify-content: space-between;
}
.detail-section {
  margin-top: var(--td-comp-margin-l);
}
.detail-section h3 {
  margin: 0 0 var(--td-comp-margin-l);
}

.model-list-panel {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
}
.provider-filter {
  margin-bottom: var(--td-comp-margin-l);
}
.provider-filter :deep(.t-card__body) {
  padding: 0;
}
.filters {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.filters :deep(.t-input__wrap) {
  width: 280px;
}
.toolbar {
  display: flex;
  justify-content: flex-start;
  margin-bottom: var(--td-comp-margin-l);
}
.actions,
.provider-name {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.provider-name :deep(.t-avatar) {
  flex-shrink: 0;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}
.provider-name :deep(.t-link) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.provider-form :deep(.t-form__item) {
  margin-bottom: var(--td-comp-margin-m);
}
.provider-form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--td-comp-margin-l);
}
.auth-heading {
  margin: var(--td-comp-margin-l) 0;
}
.auth-heading p {
  margin: var(--td-comp-margin-xs) 0 0;
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.unsupported {
  color: var(--td-text-color-placeholder);
}
</style>
