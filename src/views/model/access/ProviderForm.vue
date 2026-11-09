<template>
  <t-dialog
    dialog-class-name="model-access-dialog"
    :close-btn="true"
    :visible="true"
    :header="t(provider.id ? 'ma.editProvider' : 'ma.createProvider')"
    width="var(--provider-model-dialog-width)"
    :close-on-overlay-click="false"
    :confirm-btn="{ theme: 'primary', content: t('ma.confirm'), loading: saving }"
    :cancel-btn="t('ma.cancel')"
    @close="emit('close')"
    @confirm="save"
  >
    <t-form class="ma-form provider-form-grid" label-align="top" required-mark-position="right">
      <t-form-item :label="t('ma.providerName')" required-mark
        ><t-input v-model="provider.name"
      /></t-form-item>
      <t-form-item :label="t('ma.template')" required-mark
        ><t-select
          v-model="provider.template_key"
          filterable
          :options="templates.map((x) => ({ value: x.template_key, label: x.name }))"
          @change="templateChanged"
      /></t-form-item>
      <t-alert
        v-if="changedTemplate && provider.id"
        class="ma-section"
        theme="warning"
        :message="t('ma.templateChange')"
      />
      <t-form-item :label="t('ma.baseUrl')" required-mark
        ><t-input v-model="provider.base_url"
      /></t-form-item>
      <div class="ma-stack provider-auth">
        <h3>{{ t('ma.auth') }}</h3>
        <p class="ma-muted">{{ t('ma.authHelp') }}</p>
        <t-form-item
          v-if="provider.template_key === 'bedrock'"
          :label="t('ma.authMode')"
          required-mark
          ><t-radio-group
            v-model="provider.provider_config.auth_mode"
            @change="provider.provider_config.api_key = ''"
            ><t-radio value="API_KEY">Bedrock API Key</t-radio
            ><t-radio value="IAM">IAM (SigV4)</t-radio></t-radio-group
          ></t-form-item
        >
        <t-form-item
          v-for="field in fields"
          :key="field.key"
          :label="authFieldLabel(field)"
          :required-mark="field.required"
          ><t-textarea
            v-if="field.key === 'service_account_json'"
            v-model="provider.provider_config[field.key]"
            :placeholder="configured(field.key) ? t('ma.keepSecret') : ''" /><t-input
            v-else
            v-model="provider.provider_config[field.key]"
            :type="field.secret ? 'password' : 'text'"
            :placeholder="configured(field.key) ? t('ma.keepSecret') : ''"
            autocomplete="off"
        /></t-form-item>
      </div>
      <div class="ma-stack provider-balance">
        <h3>{{ t('ma.balanceTitle') }}</h3>
        <p class="ma-muted">{{ t('ma.balanceHelp') }}</p>
        <t-radio-group v-model="provider.balance_query_mode"
          ><t-radio value="NONE">{{ t('ma.NONE') }}</t-radio
          ><t-radio v-if="provider.template_key === 'openrouter'" value="TEMPLATE">{{
            t('ma.TEMPLATE')
          }}</t-radio
          ><t-radio value="CUSTOM">{{ t('ma.CUSTOM_QUERY') }}</t-radio></t-radio-group
        >
        <template v-if="provider.balance_query_mode === 'CUSTOM'">
          <t-form-item :label="t('ma.method')" required-mark
            ><t-select
              v-model="provider.balance_query_config.method"
              :options="['GET', 'POST'].map((v) => ({ value: v, label: v }))"
          /></t-form-item>
          <t-form-item :label="t('ma.balanceUrl')" required-mark
            ><t-input v-model="provider.balance_query_config.url"
          /></t-form-item>
          <t-form-item :label="t('ma.authMode')" required-mark
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
            :label="t('ma.header')"
            required-mark
            ><t-input v-model="provider.balance_query_config.header"
          /></t-form-item>
          <t-form-item
            v-if="provider.balance_query_config.auth !== 'NONE'"
            :label="t('ma.secret')"
            required-mark
            ><t-input
              v-model="provider.balance_query_config.secret"
              type="password"
              :placeholder="configured('balance_query_secret') ? t('ma.keepSecret') : ''"
          /></t-form-item>
          <t-form-item :label="t('ma.unit')" required-mark
            ><t-input v-model="provider.balance_query_config.unit"
          /></t-form-item>
          <t-form-item :label="t('ma.mapping')" required-mark
            ><t-select
              v-model="provider.balance_query_config.mapping"
              :options="['AVAILABLE', 'SUBTRACT'].map((v) => ({ value: v, label: t('ma.' + v) }))"
          /></t-form-item>
          <t-form-item
            v-if="provider.balance_query_config.mapping === 'AVAILABLE'"
            :label="t('ma.availablePath')"
            required-mark
            ><t-input v-model="provider.balance_query_config.available_path"
          /></t-form-item>
          <template v-else
            ><t-form-item :label="t('ma.totalPath')" required-mark
              ><t-input v-model="provider.balance_query_config.total_path" /></t-form-item
            ><t-form-item :label="t('ma.usedPath')" required-mark
              ><t-input v-model="provider.balance_query_config.used_path" /></t-form-item
          ></template>
          <t-form-item v-if="provider.balance_query_config.method === 'POST'" :label="t('ma.body')"
            ><t-textarea v-model="provider.balance_query_config.body"
          /></t-form-item>
          <p class="ma-muted">{{ t('ma.pathHelp') }}</p>
        </template>
        <template v-if="provider.balance_query_mode !== 'NONE'">
          <t-checkbox v-model="provider.balance_alert_enabled">{{
            t('ma.balanceAlert')
          }}</t-checkbox>
          <template v-if="provider.balance_alert_enabled">
            <t-form-item
              class="provider-alert-threshold"
              :label="
                t('ma.threshold') +
                ' (' +
                (provider.balance_query_mode === 'TEMPLATE'
                  ? 'USD'
                  : provider.balance_query_config.unit) +
                ')'
              "
              required-mark
              ><t-input-number v-model="provider.balance_alert_threshold" :min="0"
            /></t-form-item>
            <div class="provider-alert-notifications">
              <t-checkbox-group
                class="provider-alert-channels"
                v-model="provider.balance_alert_channels"
                :aria-label="t('ma.channels')"
                :options="['IN_APP', 'EMAIL'].map((v) => ({ value: v, label: t('ma.' + v) }))"
                @change="channelError = false"
              />
              <t-form-item :label="t('ma.recipients')" required-mark
                ><SubjectSelect
                  v-model="provider.balance_alert_recipients"
                  type="USER"
                  active-only
                  :labels="Object.fromEntries(users.map((u) => [u.id, u.name]))"
                  :unresolved-label="
                    t(resolvingRecipients ? 'ma.loadingRecipient' : 'ma.recipientUnavailable')
                  "
                  @records="cacheUsers"
              /></t-form-item>
              <p v-if="channelError" class="provider-alert-channel-error ma-error">
                {{ t('ma.channelsRequired') }}
              </p>
            </div>
          </template>
          <p class="ma-muted">{{ t('ma.balanceSchedule') }}</p>
        </template>
      </div>
      <t-form-item :label="t('ma.security')" required-mark
        ><t-select
          v-model="provider.security_level"
          :options="
            ['INTERNET', 'TRUSTED_CLOUD', 'PRIVATE'].map((v) => ({ value: v, label: t('ma.' + v) }))
          "
      /></t-form-item>
      <t-form-item :label="t('ma.notes')"><t-textarea v-model="provider.notes" /></t-form-item>
    </t-form>
    <t-alert v-if="error" theme="error" :message="error" />
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { accessApi, blankProvider, type Provider, type Template } from '@/api/modules/modelAccess'
import { getUserDetailApi } from '@/api/modules/identity'
import SubjectSelect from './SubjectSelect.vue'
import { authFieldLabel } from './helpers'
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
const channelError = ref(false)
const fields = computed(() => {
  const list =
    props.templates.find((x) => x.template_key === provider.value.template_key)?.fields ?? []
  return list.filter(
    (f) =>
      !(
        provider.value.template_key === 'bedrock' &&
        provider.value.provider_config.auth_mode === 'IAM' &&
        f.key === 'api_key'
      ),
  )
})
function configured(key: string) {
  return !changedTemplate.value && provider.value.configured_secret_fields.includes(key)
}
function templateChanged() {
  changedTemplate.value = true
  const template = props.templates.find((x) => x.template_key === provider.value.template_key)
  provider.value.base_url = template?.base_url ?? ''
  provider.value.provider_config = Object.fromEntries(
    (template?.fields ?? []).filter((f) => f.default_value).map((f) => [f.key, f.default_value!]),
  )
  if (provider.value.template_key === 'bedrock')
    provider.value.provider_config.auth_mode = 'API_KEY'
  provider.value.configured_secret_fields = []
  provider.value.balance_query_mode = 'NONE'
}
function validUrl(v: string) {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}
async function save() {
  error.value = ''
  const p = provider.value,
    b = p.balance_query_config
  channelError.value =
    p.balance_query_mode !== 'NONE' && p.balance_alert_enabled && !p.balance_alert_channels.length
  if (channelError.value) return
  let valid =
    !!p.name.trim() &&
    validUrl(p.base_url) &&
    fields.value.every(
      (f) => !f.required || p.provider_config[f.key]?.trim() || (f.secret && configured(f.key)),
    )
  if (p.provider_config.service_account_json) {
    try {
      JSON.parse(p.provider_config.service_account_json)
    } catch {
      valid = false
    }
  }
  if (p.balance_query_mode === 'CUSTOM') {
    const paths = b.mapping === 'AVAILABLE' ? [b.available_path] : [b.total_path, b.used_path]
    valid =
      valid &&
      validUrl(b.url) &&
      !!b.unit.trim() &&
      paths.every((s) => /^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(s)) &&
      (b.auth === 'NONE' || !!b.secret || configured('balance_query_secret')) &&
      (b.auth !== 'HEADER' || !!b.header)
    if (b.method === 'POST' && b.body) {
      try {
        JSON.parse(b.body)
      } catch {
        valid = false
      }
    }
  }
  if (p.balance_query_mode !== 'NONE' && p.balance_alert_enabled) {
    valid =
      valid &&
      p.balance_alert_threshold > 0 &&
      p.balance_alert_recipients.length > 0 &&
      p.balance_alert_channels.length > 0
    if (p.balance_alert_channels.includes('EMAIL')) {
      for (const id of p.balance_alert_recipients)
        if (!users.value.find((u) => u.id === id)?.email) {
          try {
            const result = await getUserDetailApi(id)
            cacheUsers([
              {
                id,
                name: result.user.display_name || result.user.username,
                email: result.user.email,
              },
            ])
          } catch {
            valid = false
          }
        }
    }
    if (p.balance_alert_channels.includes('EMAIL'))
      valid =
        valid &&
        p.balance_alert_recipients.every((id) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(users.value.find((u) => u.id === id)?.email ?? ''),
        )
  }
  if (!valid) {
    error.value = t('ma.required')
    return
  }
  p.balance_alert_unit = p.balance_query_mode === 'TEMPLATE' ? 'USD' : b.unit
  saving.value = true
  try {
    const result = await accessApi.saveProvider(p)
    emit('saved', result, !p.id)
    emit('close')
  } catch {
    error.value = t('ma.required')
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
  const session = user.context.session
  if (session) {
    cacheUsers([
      { id: session.user_id, name: session.display_name || session.username, email: null },
    ])
    if (!props.initial) provider.value.balance_alert_recipients = [session.user_id]
  }
  await Promise.allSettled(
    provider.value.balance_alert_recipients
      .filter((id) => id !== session?.user_id)
      .map(async (id) => {
        const { user: recipient } = await getUserDetailApi(id, {
          handledErrorCodes: ['NOT_FOUND', 'OUT_OF_SCOPE', 'FORBIDDEN'],
        })
        cacheUsers([
          { id, name: recipient.display_name || recipient.username, email: recipient.email },
        ])
      }),
  )
  resolvingRecipients.value = false
})
</script>
<style scoped src="./access.css"></style>
