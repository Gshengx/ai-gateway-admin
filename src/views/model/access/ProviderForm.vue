<template>
  <t-dialog
    dialog-class-name="model-access-dialog"
    :close-btn="!saving"
    :visible="true"
    :header="t(provider.id ? 'ma.editProvider' : 'ma.createProvider')"
    width="var(--provider-model-dialog-width)"
    :close-on-overlay-click="false"
    :confirm-btn="{ theme: 'primary', content: t('ma.confirm'), loading: saving }"
    :cancel-btn="{ content: t('ma.cancel'), disabled: saving }"
    :close-on-esc-keydown="!saving"
    @close="!saving && emit('close')"
    @confirm="save"
  >
    <t-form
      ref="formRef"
      autocomplete="off"
      :disabled="saving"
      class="ma-form provider-form-grid"
      label-align="top"
      required-mark-position="right"
    >
      <t-form-item v-bind="fieldState('name')" :label="t('ma.providerName')" required-mark
        ><t-input v-model="provider.name" :placeholder="t('providers.namePlaceholder')"
      /></t-form-item>
      <t-form-item
        v-bind="fieldState('template')"
        :label="t('ma.template')"
        :help="t('ma.providerTemplateHelp')"
        required-mark
        ><t-select
          v-model="provider.template_version_id"
          filterable
          :options="
            templates.map((x) => ({
              value: x.template_version_id ?? x.template_key,
              label: x.name,
              disabled:
                x.enabled === false && x.template_version_id !== initial?.template_version_id,
            }))
          "
          @change="templateChanged"
      /></t-form-item>
      <t-alert
        v-if="changedTemplate && provider.id"
        class="ma-section"
        theme="warning"
        :message="t('ma.templateChange')"
      />
      <t-form-item
        v-bind="fieldState('base_url')"
        :label="t('ma.baseUrl')"
        :help="baseUrlHelp"
        required-mark
        ><t-input v-model="provider.base_url" placeholder="https://api.example.com/v1"
      /></t-form-item>
      <div class="ma-stack provider-auth">
        <h3>{{ t('ma.auth') }}</h3>
        <p class="ma-muted">{{ t('ma.authHelp') }}</p>
        <t-form-item
          v-for="field in fields"
          :key="field.key"
          v-bind="fieldState(`config.${field.key}`)"
          :label="providerAuthFieldLabel(field)"
          :required-mark="field.required"
          ><t-switch
            v-if="field.dto?.control === 'SWITCH'"
            :value="provider.provider_config[field.key] === 'true'"
            @change="
              (value: boolean | string | number) =>
                (provider.provider_config[field.key] = String(value))
            "
          /><t-input-number
            v-else-if="field.dto?.control === 'NUMBER'"
            v-nonnegative-number
            :min="0"
            :value="Number(provider.provider_config[field.key] || 0)"
            @change="
              (value: number | undefined) =>
                (provider.provider_config[field.key] = String(value ?? ''))
            "
          /><t-select
            v-else-if="field.dto?.control === 'SELECT' || field.dto?.control === 'RADIO'"
            v-model="provider.provider_config[field.key]"
            :options="field.dto.options.map((o) => ({ value: String(o.value), label: o.label }))"
          />
          <t-textarea
            v-else-if="['TEXTAREA', 'JSON_EDITOR'].includes(field.dto?.control ?? '')"
            v-model="provider.provider_config[field.key]"
            :name="`provider-config-${provider.template_version_id}-${field.key}`"
            autocomplete="off"
            :placeholder="configured(field.key) ? t('ma.keepSecret') : ''"
          />
          <t-input
            v-else
            v-model="provider.provider_config[field.key]"
            :type="field.secret ? 'password' : 'text'"
            :name="`provider-config-${provider.template_version_id}-${field.key}`"
            :placeholder="configured(field.key) ? t('ma.keepSecret') : ''"
            :autocomplete="field.secret ? 'new-password' : 'off'"
          />
        </t-form-item>
      </div>
      <div class="ma-stack provider-balance">
        <div class="provider-balance-heading">
          <h3>{{ t('ma.balanceTitle') }}</h3>
          <p class="ma-muted">{{ t('ma.balanceHelp') }}</p>
        </div>
        <t-radio-group v-model="provider.balance_query_mode" variant="outline">
          <t-radio-button value="NONE">{{ t('ma.NONE') }}</t-radio-button>
          <t-radio-button v-if="selectedTemplate?.balance_template_supported" value="TEMPLATE">{{
            t('ma.TEMPLATE')
          }}</t-radio-button>
          <t-radio-button value="CUSTOM">{{ t('ma.CUSTOM_QUERY') }}</t-radio-button>
        </t-radio-group>
        <p v-if="provider.balance_query_mode === 'TEMPLATE'" class="ma-muted">
          {{ t('ma.templateBalanceHelp', { name: selectedTemplate?.name ?? '' }) }}
        </p>
        <div v-if="provider.balance_query_mode === 'CUSTOM'" class="provider-balance-fields">
          <t-form-item v-bind="fieldState('balance.method')" :label="t('ma.method')" required-mark
            ><t-select
              v-model="provider.balance_query_config.method"
              :options="['GET', 'POST'].map((v) => ({ value: v, label: v }))"
          /></t-form-item>
          <t-form-item v-bind="fieldState('balance.url')" :label="t('ma.balanceUrl')" required-mark
            ><t-input v-model="provider.balance_query_config.url"
          /></t-form-item>
          <t-form-item v-bind="fieldState('balance.auth')" :label="t('ma.authMode')" required-mark
            ><t-select
              v-model="provider.balance_query_config.auth"
              :options="[
                { value: 'NONE', label: t('ma.noAuthentication') },
                { value: 'BEARER', label: 'Bearer Token' },
                { value: 'HEADER', label: t('ma.header') },
              ]"
          /></t-form-item>
          <t-form-item
            v-if="provider.balance_query_config.auth === 'HEADER'"
            v-bind="fieldState('balance.header')"
            :label="t('ma.header')"
            required-mark
            ><t-input
              v-model="provider.balance_query_config.header"
              :placeholder="t('ma.balanceHeaderPlaceholder')"
          /></t-form-item>
          <t-form-item
            v-if="provider.balance_query_config.auth !== 'NONE'"
            v-bind="fieldState('balance.secret')"
            :label="t('ma.secret')"
            required-mark
            ><t-input
              v-model="provider.balance_query_config.secret"
              type="password"
              name="provider-balance-query-secret"
              autocomplete="new-password"
              :placeholder="
                !!provider.configured_balance_secret_fields?.length ? t('ma.keepSecret') : ''
              "
          /></t-form-item>
          <t-form-item v-bind="fieldState('balance.unit')" :label="t('ma.unit')" required-mark
            ><t-input
              v-model="provider.balance_query_config.unit"
              :placeholder="t('ma.balanceUnitPlaceholder')"
          /></t-form-item>
          <t-form-item v-bind="fieldState('balance.mapping')" :label="t('ma.mapping')" required-mark
            ><t-select
              v-model="provider.balance_query_config.mapping"
              :options="['AVAILABLE', 'SUBTRACT'].map((v) => ({ value: v, label: t('ma.' + v) }))"
          /></t-form-item>
          <t-form-item
            v-if="provider.balance_query_config.mapping === 'AVAILABLE'"
            v-bind="fieldState('balance.available_path')"
            :label="t('ma.availablePath')"
            required-mark
            ><t-input
              v-model="provider.balance_query_config.available_path"
              :placeholder="t('ma.balanceAvailablePathPlaceholder')"
          /></t-form-item>
          <template v-else
            ><t-form-item
              v-bind="fieldState('balance.total_path')"
              :label="t('ma.totalPath')"
              required-mark
              ><t-input
                v-model="provider.balance_query_config.total_path"
                :placeholder="t('ma.balanceTotalPathPlaceholder')" /></t-form-item
            ><t-form-item
              v-bind="fieldState('balance.used_path')"
              :label="t('ma.usedPath')"
              required-mark
              ><t-input
                v-model="provider.balance_query_config.used_path"
                :placeholder="t('ma.balanceUsedPathPlaceholder')" /></t-form-item
          ></template>
          <t-form-item
            v-if="provider.balance_query_config.method === 'POST'"
            v-bind="fieldState('balance.body')"
            :label="t('ma.body')"
            ><t-textarea
              v-model="provider.balance_query_config.body"
              :placeholder="
                t('ma.balanceBodyPlaceholder', {
                  example: '{ &quot;account_id&quot;: &quot;xxx&quot; }',
                })
              "
          /></t-form-item>
          <p class="ma-muted">{{ t('ma.pathHelp') }}</p>
        </div>
        <template v-if="provider.balance_query_mode !== 'NONE'">
          <t-checkbox v-model="provider.balance_alert_enabled">{{
            t('ma.balanceAlert')
          }}</t-checkbox>
          <template v-if="provider.balance_alert_enabled">
            <div class="provider-alert-notifications">
              <t-form-item
                v-bind="fieldState('balance.recipients')"
                :label="t('ma.recipients')"
                :help="t('ma.balanceRecipientsHelp')"
                required-mark
                ><SubjectSelect
                  purpose="balance"
                  :provider-id="provider.id || undefined"
                  v-model="provider.balance_alert_recipients"
                  type="USER"
                  active-only
                  :labels="
                    Object.fromEntries(
                      users.map((u) => [u.id, u.name + (u.email ? ' · ' + u.email : '')]),
                    )
                  "
                  :unresolved-label="
                    t(resolvingRecipients ? 'ma.loadingRecipient' : 'ma.recipientUnavailable')
                  "
                  @records="cacheUsers"
              /></t-form-item>
              <t-checkbox-group
                class="provider-alert-channels"
                data-provider-field="balance.channels"
                v-model="provider.balance_alert_channels"
                :aria-label="t('ma.channels')"
                :options="['IN_APP', 'EMAIL'].map((v) => ({ value: v, label: t('ma.' + v) }))"
              />
              <p class="ma-muted">{{ t('ma.balanceEmailHelp') }}</p>
              <p v-if="fieldErrors['balance.channels']" class="ma-error">
                {{ fieldErrors['balance.channels'] }}
              </p>
            </div>
            <t-form-item
              class="provider-alert-threshold"
              v-bind="fieldState('balance.threshold')"
              :label="
                t('ma.threshold') +
                ' (' +
                (provider.balance_query_mode === 'TEMPLATE'
                  ? 'USD'
                  : provider.balance_query_config.unit) +
                ')'
              "
              required-mark
              ><t-input-number
                v-nonnegative-number
                large-number
                :step="1"
                theme="row"
                :min="'0'"
                :value="String(provider.balance_alert_threshold)"
                inputmode="decimal"
                @change="
                  (value: string | number) => (provider.balance_alert_threshold = String(value))
                "
            /></t-form-item>
            <p class="ma-muted">{{ t('ma.notificationUnavailable') }}</p>
          </template>
          <p class="ma-muted">{{ t('ma.balanceSchedule') }}</p>
        </template>
      </div>
      <t-form-item v-bind="fieldState('security')" :label="t('ma.security')" required-mark
        ><t-select
          v-model="provider.security_level"
          :options="
            ['INTERNET', 'TRUSTED_CLOUD', 'PRIVATE'].map((v) => ({ value: v, label: t('ma.' + v) }))
          "
      /></t-form-item>
      <t-form-item :label="t('ma.notes')"
        ><t-textarea v-model="provider.notes" :placeholder="t('providers.notesPlaceholder')"
      /></t-form-item>
    </t-form>
    <t-alert
      v-if="error || validationSummary"
      class="provider-validation-summary"
      theme="error"
      :message="error || validationSummary"
    />
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { accessApi, blankProvider, type Provider, type Template } from '@/api/modules/modelAccess'
import SubjectSelect from './SubjectSelect.vue'
import { matchesConditions } from '@/utils/modelTemplate'
import { useUserStore } from '@/stores/modules/user'
const props = defineProps<{ initial?: Provider; templates: Template[] }>()
const emit = defineEmits<{ close: []; saved: [provider: Provider, created: boolean] }>()
const { t } = useI18n(),
  user = useUserStore()
const provider = ref(
  props.initial ? (JSON.parse(JSON.stringify(props.initial)) as Provider) : blankProvider(),
)
const saving = ref(false),
  error = ref(''),
  changedTemplate = ref(false)
const users = ref<{ id: string; name: string; email: string | null }[]>([])
const resolvingRecipients = ref(true)
const formRef = ref<{ $el: HTMLElement }>()
const validationAttempted = ref(false)
const fieldErrors = computed(() => (validationAttempted.value ? validateProvider() : {}))
const validationSummary = computed(() => {
  const messages = Object.values(fieldErrors.value)
  return messages.length ? t('ma.providerValidationSummary', { fields: messages.join('；') }) : ''
})
function fieldState(key: string) {
  return {
    status: fieldErrors.value[key] ? ('error' as const) : undefined,
    tips: fieldErrors.value[key] ?? '',
    'data-provider-field': key,
  }
}
const selectedTemplate = computed(() =>
  props.templates.find(
    (template) => template.template_version_id === provider.value.template_version_id,
  ),
)
const baseUrlHelp = computed(() => {
  const { template_key, base_url } = provider.value
  if (template_key === 'bailian') return t('ma.bailianBaseUrlHelp')
  if (template_key === 'bedrock') return t('ma.bedrockBaseUrlHelp')
  if (template_key === 'qianwen')
    return t(
      base_url.includes('aliyuncs.com') ? 'ma.qianwenMigrationHelp' : 'ma.qianwenBaseUrlHelp',
    )
  return ''
})
function providerAuthFieldLabel(field: Template['fields'][number]) {
  return field.label
}
const fields = computed(() =>
  (selectedTemplate.value?.fields ?? [])
    .filter((field) => matchesConditions(field.conditions?.visible, provider.value.provider_config))
    .map((field) => ({
      ...field,
      required:
        field.required ||
        (!!field.conditions?.required?.length &&
          matchesConditions(field.conditions.required, provider.value.provider_config)),
    })),
)
function configured(key: string) {
  return !changedTemplate.value && provider.value.configured_secret_fields.includes(key)
}
function templateChanged() {
  changedTemplate.value = true
  const template = props.templates.find(
    (x) => x.template_version_id === provider.value.template_version_id,
  )
  provider.value.template_key = template?.template_key ?? ''
  provider.value.base_url = template?.base_url ?? ''
  provider.value.provider_config = Object.fromEntries(
    (template?.fields ?? []).filter((f) => f.default_value).map((f) => [f.key, f.default_value!]),
  )
  provider.value.configured_secret_fields = []
  provider.value.balance_query_mode = 'NONE'
  provider.value.clear_secret_fields = []
}
function validUrl(v: string) {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}
function validateProvider() {
  const issues: Record<string, string> = {}
  const p = provider.value
  const b = p.balance_query_config
  const issue = (key: string, label: string, reason = 'providerFieldRequired') => {
    issues[key] = t(`ma.${reason}`, { field: label })
  }
  if (!p.name.trim()) issue('name', t('ma.providerName'))
  if (!selectedTemplate.value) issue('template', t('ma.template'))
  if (!validUrl(p.base_url)) issue('base_url', t('ma.baseUrl'), 'providerFieldUrl')
  for (const field of fields.value) {
    const key = `config.${field.key}`
    const value = p.provider_config[field.key]?.trim()
    const clearing = p.clear_secret_fields?.includes(field.key)
    if (clearing && value) issue(key, field.label, 'providerSecretConflict')
    else if (field.required && !value && !(field.secret && configured(field.key) && !clearing))
      issue(key, field.label)
    else if (field.dto?.control === 'NUMBER') {
      const minimum = field.dto.validation_schema.minimum
      if (typeof minimum === 'number' && minimum < 0) issues[key] = t('ma.numberTemplateConflict')
      else if (value && (!Number.isFinite(Number(value)) || Number(value) < 0))
        issue(key, field.label, 'providerFieldNumber')
    }
    if (field.key === 'service_account_json' && value) {
      try {
        JSON.parse(value)
      } catch {
        issue(key, field.label, 'providerFieldJson')
      }
    }
  }
  if (p.balance_query_mode === 'CUSTOM') {
    if (!validUrl(b.url)) issue('balance.url', t('ma.balanceUrl'), 'providerFieldUrl')
    if (!b.unit.trim()) issue('balance.unit', t('ma.unit'))
    const paths =
      b.mapping === 'AVAILABLE'
        ? (['available_path'] as const)
        : (['total_path', 'used_path'] as const)
    const labels = {
      available_path: 'availablePath',
      total_path: 'totalPath',
      used_path: 'usedPath',
    }
    for (const key of paths)
      if (!/^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(b[key]))
        issue(`balance.${key}`, t(`ma.${labels[key]}`), 'providerFieldPath')
    if (b.auth !== 'NONE' && !b.secret && !p.configured_balance_secret_fields?.length)
      issue('balance.secret', t('ma.secret'))
    if (b.auth === 'HEADER' && !b.header) issue('balance.header', t('ma.header'))
    if (b.method === 'POST' && b.body) {
      try {
        JSON.parse(b.body)
      } catch {
        issue('balance.body', t('ma.body'), 'providerFieldJson')
      }
    }
  }
  if (p.balance_query_mode !== 'NONE' && p.balance_alert_enabled) {
    if (!p.balance_alert_channels.length) issues['balance.channels'] = t('ma.channelsRequired')
    if (
      !/^(0|[1-9]\d*)(\.\d+)?$/.test(String(p.balance_alert_threshold)) ||
      /^0(\.0+)?$/.test(String(p.balance_alert_threshold))
    )
      issue('balance.threshold', t('ma.threshold'), 'providerFieldThreshold')
    if (!p.balance_alert_recipients.length) issue('balance.recipients', t('ma.recipients'))
    else if (
      p.balance_alert_channels.includes('EMAIL') &&
      p.balance_alert_recipients.some(
        (id) =>
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(users.value.find((u) => u.id === id)?.email ?? ''),
      )
    )
      issues['balance.recipients'] = t('ma.providerRecipientEmail')
  }
  return issues
}
async function save() {
  if (saving.value) return
  error.value = ''
  validationAttempted.value = true
  if (Object.keys(fieldErrors.value).length) {
    await nextTick()
    const firstKey = Object.keys(fieldErrors.value)[0]
    const element = Array.from(
      formRef.value?.$el.querySelectorAll<HTMLElement>('[data-provider-field]') ?? [],
    ).find((element) => element.dataset.providerField === firstKey)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  saving.value = true
  try {
    const p = provider.value
    p.balance_alert_unit = p.balance_query_mode === 'TEMPLATE' ? 'USD' : p.balance_query_config.unit
    const result = await accessApi.saveProvider(p)
    emit('saved', result, !p.id)
    emit('close')
  } catch (cause) {
    error.value =
      cause instanceof Error && cause.message ? cause.message : t('ma.providerSaveFailed')
  } finally {
    saving.value = false
  }
}
function cacheUsers(records: { id: string; name: string; email: string | null }[]) {
  const map = new Map(users.value.map((u) => [u.id, u]))
  records.forEach((u) => map.set(u.id, u))
  users.value = [...map.values()]
}
onMounted(async () => {
  provider.value.template_version_id ??= props.templates.find(
    (t) => t.template_key === provider.value.template_key,
  )?.template_version_id

  const session = user.context.session
  if (session) {
    cacheUsers([
      { id: session.user_id, name: session.display_name || session.username, email: null },
    ])
    if (!props.initial) provider.value.balance_alert_recipients = [session.user_id]
  }
  cacheUsers(
    (provider.value.recipient_users ?? []).map((u) => ({
      id: u.user_id,
      name: u.username
        ? `${u.display_name ?? t('ma.unavailable')} (${u.username})`
        : (u.display_name ?? t('ma.unavailable')),
      email: u.email,
    })),
  )
  resolvingRecipients.value = false
})
onBeforeUnmount(() => {
  for (const field of selectedTemplate.value?.fields ?? [])
    if (field.secret) delete provider.value.provider_config[field.key]
  provider.value.balance_query_config.secret = ''
})
</script>
<style scoped src="./access.css"></style>
