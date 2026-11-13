<template>
  <section ref="actionTableRoot" class="panel identity-list-panel model-list-panel ma-stack">
    <FilterBar class="ma-filter"
      ><template #content
        ><div class="ma-row">
          <t-input
            v-model="search"
            class="ma-search"
            :placeholder="t('ma.providerSearch')"
            clearable
          /><t-button theme="default" @click="search = ''">{{ t('ma.reset') }}</t-button>
        </div></template
      ></FilterBar
    >
    <div>
      <t-button
        theme="primary"
        v-permission.write="'model.providers'"
        :disabled="templatesLoading"
        :loading="templatesLoading"
        @click="create"
        ><template #icon><t-icon name="add" /></template>{{ t('ma.createProvider') }}</t-button
      >
    </div>
    <t-table
      height="var(--stable-table-height)"
      class="ma-table"
      table-layout="fixed"
      table-content-width="max(100%, var(--model-access-table-width))"
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :class="{ 'stable-table--pending-footer': (loading || listFailed) && !items.length }"
      :disable-data-page="true"
      @page-change="changePage"
    >
      <template v-if="listFailed" #empty>{{ t('common.loadFailed') }}</template>
      <template #name="{ row }"
        ><div class="ma-row">
          <t-avatar size="small">{{ templateName(row).charAt(0) }}</t-avatar
          ><t-link theme="primary" @click="openDetail(row)">{{ row.name }}</t-link>
        </div></template
      >
      <template #template_key="{ row }">{{ templateName(row) }}</template>
      <template #security_level="{ row }">{{ t('ma.' + row.security_level) }}</template>
      <template #balance="{ row }"
        ><div v-if="row.last_balance_value !== null" class="ma-balance">
          <span
            :class="{
              'ma-low-balance': row.balance_alert_enabled && row.alert_state === 'LOW',
            }"
            >{{ formatDecimal(row.last_balance_value) }} {{ row.balance_alert_unit }}</span
          ><t-tag
            variant="light"
            v-if="row.balance_alert_enabled"
            :theme="row.alert_state === 'LOW' ? 'warning' : 'success'"
            >{{ t(row.alert_state === 'LOW' ? 'ma.lowBalance' : 'ma.balanceNormal') }}</t-tag
          ><span class="ma-muted">{{ formatDateTime(row.last_balance_success_at) }}</span>
        </div>
        <span v-else>—</span
        ><t-tooltip v-if="row.balance_query_status === 'FAILED'" :content="t('ma.balanceFailure')"
          ><t-tag variant="light" theme="danger">{{ t('ma.FAILED') }}</t-tag></t-tooltip
        ></template
      >
      <template #action="{ row }"><RowActions :actions="rowActions(row)" /></template>
    </t-table>
    <t-loading v-if="editingLoading" fullscreen :text="t('common.loading')" />
    <ProviderForm
      v-if="formVisible"
      :initial="editing"
      :templates="templates"
      @close="formVisible = false"
      @saved="saved"
    />
    <OnboardingGuide
      v-if="guide"
      :provider="guide"
      @close="
        () => {
          guide = undefined
          refreshGuideData()
        }
      "
    />
    <t-drawer
      :close-btn="true"
      :visible="detailVisible"
      :header="detail?.name || detailTitle"
      :footer="false"
      size="large"
      @close="closeDetail"
      ><LoadingState :loading="detailLoading" :failed="detailFailed">
        <div v-if="detail" class="ma-stack provider-detail">
          <div class="ma-row">
            <t-tag variant="light">{{ t('ma.' + detail.security_level) }}</t-tag
            ><t-button
              theme="default"
              v-permission.write="'model.providers'"
              @click="guide = detail"
              >{{ t('ma.getModels') }}</t-button
            ><t-button
              theme="primary"
              v-permission.write="'model.providers'"
              @click="edit(detail)"
              >{{ t('ma.edit') }}</t-button
            >
          </div>
          <section class="ma-stack">
            <h3>{{ t('ma.basicInfo') }}</h3>
            <dl class="ma-definitions">
              <dt>{{ t('ma.template') }}</dt>
              <dd>{{ templateName(detail) }}</dd>
              <dt>{{ t('ma.baseUrl') }}</dt>
              <dd>
                <code>{{ detail.base_url }}</code>
              </dd>
              <dt>{{ t('ma.security') }}</dt>
              <dd>{{ t('ma.' + detail.security_level) }}</dd>
              <dt>{{ t('ma.notes') }}</dt>
              <dd>{{ detail.notes || '—' }}</dd>
              <dt>{{ t('ma.created') }}</dt>
              <dd>{{ formatDateTime(detail.created_at) }}</dd>
            </dl>
          </section>
          <t-divider />
          <section class="ma-stack">
            <h3>{{ t('ma.auth') }}</h3>
            <dl class="ma-definitions">
              <template
                v-for="field in templates.find(
                  (x) => x.template_version_id === detail?.template_version_id,
                )?.fields ?? []"
                :key="field.key"
                ><dt>{{ authFieldLabel(field) }}</dt>
                <dd>
                  {{
                    field.secret
                      ? t(
                          detail.configured_secret_fields.includes(field.key)
                            ? 'ma.configured'
                            : 'ma.unconfigured',
                        )
                      : detail.provider_config[field.key] || '—'
                  }}
                </dd></template
              >
            </dl>
          </section>
          <t-divider />
          <section class="ma-stack">
            <div class="ma-row ma-between">
              <h3>{{ t('ma.accountBalance') }}</h3>
              <t-button
                v-if="detail.balance_query_mode !== 'NONE'"
                v-permission.write="'model.providers'"
                theme="primary"
                variant="outline"
                :loading="querying"
                @click="balance(detail)"
                >{{ t('ma.queryBalance') }}</t-button
              >
            </div>
            <p v-if="detail.balance_query_mode === 'NONE'" class="ma-muted">
              {{ t('ma.balanceNotConfigured') }}
            </p>
            <template v-else>
              <div class="ma-row">
                <strong
                  :class="[
                    'ma-balance-amount',
                    {
                      'ma-low-balance':
                        detail.balance_alert_enabled &&
                        detail.last_balance_value !== null &&
                        detail.alert_state === 'LOW',
                    },
                  ]"
                  >{{
                    detail.last_balance_value === null
                      ? '—'
                      : formatDecimal(detail.last_balance_value) +
                        ' ' +
                        (detail.last_balance_unit ?? t('ma.UNKNOWN'))
                  }}</strong
                ><t-tag
                  v-if="detail.balance_alert_enabled && detail.last_balance_value !== null"
                  variant="light"
                  :theme="detail.alert_state === 'LOW' ? 'warning' : 'success'"
                  >{{
                    t(detail.alert_state === 'LOW' ? 'ma.lowBalance' : 'ma.balanceNormal')
                  }}</t-tag
                >
              </div>
              <div class="ma-muted">
                {{ t('ma.queryMode') }}：{{
                  t(
                    detail.balance_query_mode === 'CUSTOM'
                      ? 'ma.CUSTOM_QUERY'
                      : detail.balance_query_mode === 'TEMPLATE'
                        ? 'ma.TEMPLATE'
                        : 'ma.NONE',
                  )
                }}<template v-if="detail.balance_query_mode === 'CUSTOM'">
                  · {{ detail.balance_query_config.method }} ·
                  {{ detail.balance_query_config.url }}</template
                >
              </div>
              <div v-if="detail.balance_alert_enabled" class="ma-muted">
                {{ t('ma.threshold') }}：{{ detail.balance_alert_threshold }}
                {{ detail.balance_alert_unit }}
              </div>
              <div v-if="detail.balance_alert_enabled" class="ma-muted">
                {{ t('ma.recipients') }}：{{
                  detail.balance_alert_recipients
                    .map((id) => recipientNames[id] || t('ma.unavailable'))
                    .join('、')
                }}
              </div>
              <div v-if="detail.balance_alert_enabled" class="ma-muted">
                {{ t('ma.channels') }}：{{
                  detail.balance_alert_channels.map((v) => t('ma.' + v)).join('、')
                }}
              </div>
              <div class="ma-muted">
                {{ t('ma.balanceQueryTime') }}：{{
                  formatDateTime(detail.last_balance_attempt_at) || '—'
                }}
                ·
                {{
                  t(
                    detail.balance_query_status === 'SUCCESS'
                      ? 'ma.PASSED'
                      : detail.balance_query_status === 'FAILED'
                        ? 'ma.FAILED'
                        : 'ma.UNKNOWN',
                  )
                }}
              </div>
              <div class="ma-muted">
                {{ t('ma.balanceSuccessTime') }}：{{
                  formatDateTime(detail.last_balance_success_at) || '—'
                }}
              </div>
              <t-alert
                v-if="detail.balance_query_status === 'FAILED'"
                theme="error"
                :message="t('ma.balanceFailure')"
              />
            </template>
          </section>
          <t-divider />
          <section class="ma-stack">
            <h3>{{ t('ma.relatedModels') }}</h3>
            <t-table
              :height="relatedLoading ? 'var(--stable-detail-table-height)' : undefined"
              max-height="var(--stable-detail-table-height)"
              row-key="id"
              :data="related"
              :class="{
                'stable-table--pending-footer':
                  (relatedLoading || relatedFailed) && !related.length,
              }"
              :loading="relatedLoading"
              :columns="relatedColumns"
              :pagination="{
                current: relatedPage,
                pageSize: relatedPageSize,
                total: relatedTotal,
                showPageSize: false,
              }"
              :disable-data-page="true"
              @page-change="
                (p: PageInfo) => {
                  relatedPage = p.current
                  loadRelated()
                }
              "
              ><template v-if="relatedFailed" #empty>{{ t('common.loadFailed') }}</template
              ><template #status="{ row }"
                ><t-tag variant="light" :theme="statusTheme(row.status)">{{
                  t('ma.' + row.status)
                }}</t-tag></template
              ></t-table
            >
          </section>
        </div></LoadingState
      ></t-drawer
    >
    <t-dialog
      dialog-class-name="model-access-dialog"
      :close-btn="!mutating"
      :visible="!!removing"
      :close-on-esc-keydown="!mutating"
      :close-on-overlay-click="false"
      :header="t('ma.remove')"
      :confirm-btn="{ content: t('ma.confirm'), loading: mutating }"
      :cancel-btn="{ content: t('ma.cancel'), disabled: mutating }"
      @close="!mutating && (removing = undefined)"
      @confirm="remove"
      ><div class="ma-stack">
        <div>{{ t('ma.providerDeleteConfirm', { name: removing?.name }) }}</div>
        <div class="ma-muted">{{ t('ma.providerDelete') }}</div>
      </div></t-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { useLatestRequest } from '@/utils/useLatestRequest'
import { computed, onMounted, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import { MessagePlugin, type PrimaryTableCol, type PageInfo } from 'tdesign-vue-next'
import { useUserStore } from '@/stores/modules/user'
import FilterBar from '@/components/FilterBar.vue'
import { accessApi, type Provider, type Template } from '@/api/modules/modelAccess'
import type { ModelListItem } from '@/api/modules/modelAccessContract'
import { formatDecimal } from '@/utils/modelContract'
import { formatDateTime } from '@/utils/datetime'
import { authFieldLabel, statusTheme } from '../access/helpers'
import RowActions, { type RowAction } from '../access/RowActions.vue'
import ProviderForm from '../access/ProviderForm.vue'
import OnboardingGuide from '../access/OnboardingGuide.vue'
import { useActionColumnWidth } from '../access/useActionColumnWidth'
const { t, locale } = useI18n()
const { actionTableRoot, actionColumnWidth } = useActionColumnWidth()
const recipientNames = ref<Record<string, string>>({})
const items = ref<Provider[]>([]),
  templates = shallowRef<Template[]>([]),
  related = ref<ModelListItem[]>([])
const search = ref(''),
  loading = ref(true),
  formVisible = ref(false),
  editing = ref<Provider>(),
  detail = ref<Provider>(),
  guide = ref<Provider>(),
  removing = ref<Provider>(),
  reason = ref(''),
  mutating = ref(false),
  querying = ref(false)
const detailTitle = ref('')
const detailVisible = ref(false),
  detailLoading = ref(false),
  detailFailed = ref(false)
const listFailed = ref(false),
  editingLoading = ref(false),
  templatesLoading = ref(false)
const relatedLoading = ref(false),
  relatedFailed = ref(false)
let detailVersion = 0,
  relatedVersion = 0
let detailController: AbortController | undefined
let relatedController: AbortController | undefined
function closeDetail() {
  ++detailVersion
  ++relatedVersion
  detailController?.abort()
  relatedController?.abort()
  detailVisible.value = false
  detail.value = undefined
}
const relatedPageSize = 5
const relatedPage = ref(1),
  relatedTotal = ref(0)
const pagination = reactive({ current: 1, pageSize: 20, total: 0, pageSizeOptions: [20, 50, 100] })
// 横向溢出时显式保留弹性列，防止组件补齐默认列宽后将操作列按比例拉伸。
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'name', width: 'auto', title: t('ma.providerName') },
  { colKey: 'template_key', title: t('ma.template'), width: 140 },
  { colKey: 'base_url', width: 'auto', title: t('ma.baseUrl'), ellipsis: true },
  { colKey: 'security_level', title: t('ma.security'), width: 100 },
  { colKey: 'model_count', title: t('ma.count'), width: 90 },
  { colKey: 'balance', title: t('ma.balance'), width: 180 },
  { colKey: 'notes', width: 'auto', title: t('ma.notes'), ellipsis: true },
  {
    colKey: 'action',
    title: t('ma.actions'),
    width: actionColumnWidth.value,
    className: 'ma-action-cell',
  },
])
const relatedColumns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'model_id_at_gateway', title: t('ma.name') },
  { colKey: 'model_id_at_provider', title: t('ma.upstream') },
  {
    colKey: 'modalities',
    title: t('ma.modalities'),
    cell: (_h, { row }) =>
      `${row.input_modalities.join('+') || '—'} → ${row.output_modalities.join('+') || '—'}`,
  },
  { colKey: 'status', title: t('ma.status') },
])
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
let listController: AbortController | undefined
const balanceController = new AbortController()
function rowActions(row: Provider): RowAction[] {
  const actions: RowAction[] = [
    { label: t('ma.getModels'), permission: 'model.providers', run: () => (guide.value = row) },
    { label: t('ma.edit'), permission: 'model.providers', run: () => edit(row) },
    {
      label: t('ma.remove'),
      permission: 'model.providers',
      danger: true,
      run: () => {
        removing.value = row
        reason.value = ''
      },
    },
  ]
  if (row.balance_query_mode !== 'NONE')
    actions.push({
      label: t('ma.queryBalance'),
      permission: 'model.providers',
      run: () => balance(row),
    })
  return actions
}
function templateName(provider: Provider) {
  return provider.template_name || provider.template_key
}
async function create() {
  if (templatesLoading.value || editingLoading.value) return
  try {
    await loadTemplates()
    editing.value = undefined
    formVisible.value = true
  } catch {
    // Keep the list available; the request layer reports template loading failures.
  }
}
async function load() {
  const g = ++generation
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  loading.value = true
  listFailed.value = false
  try {
    const data = await accessApi.providers(
      {
        page: pagination.current,
        page_size: pagination.pageSize,
        search: search.value,
      },
      { signal: controller.signal },
    )
    if (g !== generation) return
    if (pagination.current > Math.max(1, data.total_pages)) {
      pagination.current = Math.max(1, data.total_pages)
      await load()
      return
    }
    items.value = data.items
    pagination.total = data.total
  } catch {
    if (g === generation) listFailed.value = true
  } finally {
    if (g === generation) loading.value = false
  }
}
const editRequest = useLatestRequest()
async function edit(row: Provider) {
  if (editingLoading.value) return
  const current = editRequest.begin()
  editingLoading.value = true
  try {
    const provider = await accessApi.provider(row.id, { signal: current.signal })
    if (!current.isCurrent()) return
    await loadTemplates(provider.id, provider.template_version_id)
    if (!current.isCurrent()) return
    editing.value = provider
    closeDetail()
    formVisible.value = true
  } catch {
    // The request layer reports failures; keep the existing page.
  } finally {
    if (current.isCurrent()) editingLoading.value = false
  }
}
async function saved(provider: Provider, created: boolean) {
  MessagePlugin.success(t('providers.saved'))
  if (created) guide.value = provider
  else await load()
}
async function openDetail(row: Provider) {
  const version = ++detailVersion
  detailController?.abort()
  relatedController?.abort()
  const controller = new AbortController()
  detailController = controller
  detailTitle.value = row.name
  detailVisible.value = true
  detailLoading.value = true
  detailFailed.value = false
  detail.value = undefined
  related.value = []
  relatedTotal.value = 0
  try {
    const provider = await accessApi.provider(row.id, { signal: controller.signal })
    if (version !== detailVersion) return
    detail.value = provider
    await loadTemplates(provider.id, provider.template_version_id)
    if (version !== detailVersion) return
    const session = useUserStore().context.session
    if (session) recipientNames.value[session.user_id] = session.display_name || session.username
    for (const recipient of provider.recipient_users ?? [])
      recipientNames.value[recipient.user_id] = recipient.display_name ?? t('ma.unavailable')
    if (version !== detailVersion) return
    relatedPage.value = 1
    await loadRelated()
  } catch {
    if (version === detailVersion) detailFailed.value = true
  } finally {
    if (version === detailVersion) detailLoading.value = false
  }
}
async function refreshGuideData() {
  await load()
  const providerId = detail.value?.id
  if (!providerId || !detailVisible.value) return
  const provider = await accessApi.provider(providerId)
  if (detail.value?.id !== providerId || !detailVisible.value) return
  detail.value = provider
  await loadRelated()
}
async function loadRelated() {
  if (!detail.value) return
  const version = ++relatedVersion
  relatedController?.abort()
  const controller = new AbortController()
  relatedController = controller
  const providerId = detail.value.id
  relatedLoading.value = true
  relatedFailed.value = false
  try {
    const data = await accessApi.models(
      {
        provider_id: providerId,
        page: relatedPage.value,
        page_size: relatedPageSize,
      },
      { signal: controller.signal },
    )
    if (version !== relatedVersion || detail.value?.id !== providerId) return
    related.value = data.items
    relatedTotal.value = data.total
  } catch {
    if (version === relatedVersion) relatedFailed.value = true
  } finally {
    if (version === relatedVersion) relatedLoading.value = false
  }
}
async function balance(row: Provider) {
  if (querying.value) return
  querying.value = true
  try {
    const data = await accessApi.balance(row.id, balanceController.signal)
    if (detail.value?.id === row.id) detail.value = data
    await load()
  } catch (error) {
    if (!balanceController.signal.aborted) throw error
  } finally {
    querying.value = false
  }
}
async function remove() {
  if (mutating.value) return
  if (!removing.value) return
  mutating.value = true
  try {
    const active = await accessApi.models({
      page: 1,
      page_size: 1,
      provider_id: removing.value.id,
      status: 'ACTIVE',
    })
    if (active.total > 0) {
      MessagePlugin.warning(t('ma.providerDeleteBlocked'))
      return
    }
    await accessApi.removeProvider(removing.value.id, reason.value)
    MessagePlugin.success(t('ma.success'))
    if (detail.value?.id === removing.value.id) detail.value = undefined
    removing.value = undefined
    await load()
  } finally {
    mutating.value = false
  }
}
function changePage(p: PageInfo) {
  pagination.current = p.current
  pagination.pageSize = p.pageSize
  void load()
}
watch(search, () => {
  ++generation
  listController?.abort()
  loading.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.current = 1
    void load()
  }, 250)
})
let templateGeneration = 0
const templateController = new AbortController()
const templateRequests = new Map<string, Promise<void>>()
function loadTemplates(providerId?: string, templateVersion?: string): Promise<void> {
  const key = JSON.stringify([locale.value, providerId, templateVersion])
  const pending = templateRequests.get(key)
  if (pending) return pending
  const current = ++templateGeneration
  templatesLoading.value = true
  const request = accessApi
    .templates(providerId, { signal: templateController.signal })
    .then((result) => {
      if (current === templateGeneration) templates.value = result
    })
    .finally(() => {
      templateRequests.delete(key)
      templatesLoading.value = templateRequests.size > 0
    })
  templateRequests.set(key, request)
  return request
}
watch(locale, () => {
  void load()
  const provider = formVisible.value
    ? editing.value
    : detailVisible.value
      ? detail.value
      : undefined
  if (formVisible.value || (detailVisible.value && provider))
    void loadTemplates(provider?.id, provider?.template_version_id).catch(() => {})
})
onMounted(() => {
  void load().catch(() => {})
})
onBeforeUnmount(() => {
  templateGeneration++
  templateController.abort()
  closeDetail()
  generation++
  listController?.abort()
  balanceController.abort()
  clearTimeout(timer)
})
</script>
<style scoped src="../access/access.css"></style>
