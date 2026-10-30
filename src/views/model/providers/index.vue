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
          <t-link theme="primary">{{ row.name }}</t-link>
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
          <t-link
            v-permission.write="'model.providers'"
            theme="primary"
            :disabled="detailLoading"
            @click="openEdit(row.id)"
            >{{ t('providers.edit') }}</t-link
          >
        </div>
      </template>
    </t-table>
  </section>
  <GetModelsDialog
    v-if="modelProvider"
    :provider="modelProvider"
    :templates="templates"
    @close="modelProvider = null"
    @imported="fetchList"
  />
  <t-dialog
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
      <t-form-item
        v-for="field in selectedTemplate?.fields ?? []"
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
  getProviderApi,
  getProvidersApi,
  getProviderTemplatesApi,
  updateProviderApi,
  publicConfigKeys,
  secretKeys,
  type ProviderItem,
  type ProviderPayload,
  type ProviderTemplate,
  type PublicConfigKey,
  type SecretKey,
  type SecurityLevel,
  type TemplateField,
} from '@/api/modules/providers'

const { t, locale } = useI18n()
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
  base_url: '',
  security_level: 'INTERNET' as SecurityLevel,
  notes: '',
  values: {} as Record<string, string>,
})
const pagination = reactive<PaginationProps>({
  current: 1,
  pageSize: 20,
  total: 0,
  showJumper: true,
  pageSizeOptions: [10, 20, 50, 100],
  totalContent: (): string => t('providers.total', { n: pagination.total ?? 0 }),
})
const selectedTemplate = computed(() =>
  templates.value.find((item) => item.template_key === form.template_key),
)
const selectedCombination = computed(
  () =>
    selectedTemplate.value?.combinations.find((item) => item.support_status !== 'UNAVAILABLE') ??
    selectedTemplate.value?.variants[0],
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
    base_url: required(t('providers.baseUrl')),
    security_level: required(t('providers.securityLevel')),
  }
  for (const field of selectedTemplate.value?.fields ?? []) {
    if (!supportedField(field)) continue
    const configured =
      field.value_type === 'SECRET' && editing.value?.configured_secret_fields.includes(field.key)
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
  form.values = {}
  for (const field of selectedTemplate.value?.fields ?? []) form.values[field.key] = ''
  form.base_url = selectedTemplate.value?.default_base_url ?? ''
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
      base_url: detail.base_url,
      security_level: detail.security_level,
      notes: detail.notes,
      values: {},
    })
    for (const field of selectedTemplate.value?.fields ?? []) {
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
  const secretActions: ProviderPayload['secret_actions'] = {}
  for (const field of selectedTemplate.value.fields) {
    if (!supportedField(field)) continue
    const value = form.values[field.key] ?? ''
    if (field.value_type === 'STRING') publicConfig[field.key as PublicConfigKey] = value
    else if (value) secretActions[field.key as SecretKey] = { operation: 'REPLACE', value }
    else if (editing.value) secretActions[field.key as SecretKey] = { operation: 'KEEP' }
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
  }
  saving.value = true
  try {
    if (editing.value) await updateProviderApi(editing.value.id, payload)
    else await createProviderApi(payload)
    MessagePlugin.success(t('providers.saved'))
    saving.value = false
    close()
    await fetchList()
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
:deep(.t-table__pagination) {
  margin-top: var(--td-comp-margin-l);
}
.provider-form :deep(.t-form__item) {
  margin-bottom: var(--td-comp-margin-m);
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
