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
        :disabled="!templates.length"
        @click="
          () => {
            editing = undefined
            formVisible = true
          }
        "
        ><template #icon><t-icon name="add" /></template>{{ t('ma.createProvider') }}</t-button
      >
    </div>
    <t-table
      class="ma-table"
      table-layout="fixed"
      table-content-width="max(100%, var(--model-access-table-width))"
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :disable-data-page="true"
      @page-change="changePage"
    >
      <template #name="{ row }"
        ><div class="ma-row">
          <t-avatar size="small">{{ templateName(row.template_key).charAt(0) }}</t-avatar
          ><t-link theme="primary" @click="openDetail(row)">{{ row.name }}</t-link>
        </div></template
      >
      <template #template_key="{ row }">{{ templateName(row.template_key) }}</template>
      <template #security_level="{ row }">{{ t('ma.' + row.security_level) }}</template>
      <template #balance="{ row }"
        ><div v-if="row.last_balance_value !== null" class="ma-balance">
          <span
            :class="{
              'ma-low-balance':
                row.balance_alert_enabled && row.last_balance_value <= row.balance_alert_threshold,
            }"
            >{{ row.last_balance_value.toFixed(2) }} {{ row.balance_alert_unit }}</span
          ><t-tag
            variant="light"
            v-if="row.balance_alert_enabled"
            :theme="row.last_balance_value <= row.balance_alert_threshold ? 'warning' : 'success'"
            >{{
              t(
                row.last_balance_value <= row.balance_alert_threshold
                  ? 'ma.lowBalance'
                  : 'ma.balanceNormal',
              )
            }}</t-tag
          ><span class="ma-muted">{{ formatDateTime(row.last_balance_success_at) }}</span>
        </div>
        <span v-else>—</span
        ><t-tooltip v-if="row.balance_query_status === 'FAILED'" :content="t('ma.balanceFailure')"
          ><t-tag variant="light" theme="danger">{{ t('ma.FAILED') }}</t-tag></t-tooltip
        ></template
      >
      <template #action="{ row }"><RowActions :actions="rowActions(row)" /></template>
    </t-table>
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
          load()
        }
      "
      @changed="load"
    />
    <t-drawer
      :close-btn="true"
      :visible="!!detail"
      :header="detail?.name"
      :footer="false"
      size="large"
      @close="detail = undefined"
      ><div v-if="detail" class="ma-stack provider-detail">
        <div class="ma-row">
          <t-tag variant="light">{{ t('ma.' + detail.security_level) }}</t-tag
          ><t-button
            theme="default"
            v-permission.write="'model.providers'"
            @click="guide = detail"
            >{{ t('ma.getModels') }}</t-button
          ><t-button theme="primary" v-permission.write="'model.providers'" @click="edit(detail)">{{
            t('ma.edit')
          }}</t-button>
        </div>
        <section class="ma-stack">
          <h3>{{ t('ma.basicInfo') }}</h3>
          <dl class="ma-definitions">
            <dt>{{ t('ma.template') }}</dt>
            <dd>{{ templateName(detail.template_key) }}</dd>
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
              v-for="field in templates.find((x) => x.template_key === detail?.template_key)
                ?.fields ?? []"
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
                      detail.last_balance_value <= detail.balance_alert_threshold,
                  },
                ]"
                >{{
                  detail.last_balance_value === null
                    ? '—'
                    : detail.last_balance_value.toFixed(2) + ' ' + detail.balance_alert_unit
                }}</strong
              ><t-tag
                v-if="detail.balance_alert_enabled && detail.last_balance_value !== null"
                variant="light"
                :theme="
                  detail.last_balance_value <= detail.balance_alert_threshold
                    ? 'warning'
                    : 'success'
                "
                >{{
                  t(
                    detail.last_balance_value <= detail.balance_alert_threshold
                      ? 'ma.lowBalance'
                      : 'ma.balanceNormal',
                  )
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
                detail.balance_alert_recipients.map((id) => recipientNames[id] || id).join('、')
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
            row-key="id"
            :data="related"
            :columns="relatedColumns"
            :pagination="{
              current: relatedPage,
              pageSize: 20,
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
            ><template #status="{ row }"
              ><t-tag variant="light" :theme="statusTheme(row.status)">{{
                t('ma.' + row.status)
              }}</t-tag></template
            ></t-table
          >
        </section>
      </div></t-drawer
    >
    <t-dialog
      dialog-class-name="model-access-dialog"
      :close-btn="true"
      :visible="!!removing"
      :header="t('ma.remove')"
      :confirm-btn="{ content: t('ma.confirm'), loading: mutating }"
      :cancel-btn="t('ma.cancel')"
      @close="removing = undefined"
      @confirm="remove"
      ><div class="ma-stack">
        <t-alert theme="warning" :message="t('ma.providerDelete')" />
        <div>{{ removing?.name }}</div>
        <t-textarea v-model="reason" :placeholder="t('ma.reason')" /></div
    ></t-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PrimaryTableCol, type PageInfo } from 'tdesign-vue-next'
import { getUserDetailApi } from '@/api/modules/identity'
import { useUserStore } from '@/stores/modules/user'
import FilterBar from '@/components/FilterBar.vue'
import { accessApi, type Provider, type Template, type Model } from '@/api/modules/modelAccess'
import { formatDateTime } from '@/utils/datetime'
import { authFieldLabel, statusTheme } from '../access/helpers'
import RowActions, { type RowAction } from '../access/RowActions.vue'
import ProviderForm from '../access/ProviderForm.vue'
import OnboardingGuide from '../access/OnboardingGuide.vue'
import { useActionColumnWidth } from '../access/useActionColumnWidth'
const { t } = useI18n()
const { actionTableRoot, actionColumnWidth } = useActionColumnWidth()
const recipientNames = ref<Record<string, string>>({})
const items = ref<Provider[]>([]),
  templates = ref<Template[]>([]),
  related = ref<Model[]>([])
const search = ref(''),
  loading = ref(false),
  formVisible = ref(false),
  editing = ref<Provider>(),
  detail = ref<Provider>(),
  guide = ref<Provider>(),
  removing = ref<Provider>(),
  reason = ref(''),
  mutating = ref(false),
  querying = ref(false)
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
    colKey: 'supported_invocation_apis',
    title: t('ma.supportedApis'),
    cell: (_h, { row }) => row.supported_invocation_apis.join(' / '),
  },
  { colKey: 'status', title: t('ma.status') },
])
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
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
function templateName(key: string) {
  return templates.value.find((x) => x.template_key === key)?.name ?? key
}
async function load() {
  const g = ++generation
  loading.value = true
  try {
    const data = await accessApi.providers({
      page: pagination.current,
      page_size: pagination.pageSize,
      search: search.value,
    })
    if (g !== generation) return
    if (pagination.current > Math.max(1, data.total_pages)) {
      pagination.current = Math.max(1, data.total_pages)
      await load()
      return
    }
    items.value = data.items
    pagination.total = data.total
  } finally {
    if (g === generation) loading.value = false
  }
}
async function edit(row: Provider) {
  editing.value = await accessApi.provider(row.id)
  detail.value = undefined
  formVisible.value = true
}
async function saved(provider: Provider, created: boolean) {
  await load()
  if (created) guide.value = provider
}
async function openDetail(row: Provider) {
  detail.value = await accessApi.provider(row.id)
  const session = useUserStore().context.session
  if (session) recipientNames.value[session.user_id] = session.display_name || session.username
  await Promise.all(
    (detail.value.balance_alert_enabled && detail.value.balance_query_mode !== 'NONE'
      ? detail.value.balance_alert_recipients
      : []
    )
      .filter((id) => !recipientNames.value[id])
      .map(async (id) => {
        try {
          const user = (
            await getUserDetailApi(id, {
              handledErrorCodes: ['NOT_FOUND', 'OUT_OF_SCOPE', 'FORBIDDEN'],
            })
          ).user
          recipientNames.value[id] = user.display_name || user.username
        } catch {
          /* Keep the configured identifier when out of scope. */
        }
      }),
  )
  relatedPage.value = 1
  await loadRelated()
}
async function loadRelated() {
  if (!detail.value) return
  const data = await accessApi.models({
    provider_id: detail.value.id,
    page: relatedPage.value,
    page_size: 20,
  })
  related.value = data.items
  relatedTotal.value = data.total
}
async function balance(row: Provider) {
  querying.value = true
  try {
    const data = await accessApi.balance(row.id)
    if (detail.value?.id === row.id) detail.value = data
    await load()
  } finally {
    querying.value = false
  }
}
async function remove() {
  if (!removing.value) return
  if (!reason.value.trim()) {
    MessagePlugin.warning(t('ma.reasonRequired'))
    return
  }
  mutating.value = true
  try {
    await accessApi.removeProvider(removing.value.id, reason.value)
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
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.current = 1
    void load()
  }, 250)
})
onMounted(async () => {
  templates.value = await accessApi.templates()
  await load()
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
</script>
<style scoped src="../access/access.css"></style>
