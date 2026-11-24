<template>
  <t-drawer
    class="profile-drawer"
    size="var(--profile-drawer-width)"
    :visible="visible"
    :header="t('profile.title')"
    :close-on-overlay-click="false"
    :close-btn="!saving"
    :close-on-esc-keydown="!saving"
    @close="onClose"
  >
    <DrawerSaving :loading="saving" />
    <t-loading :loading="loading">
      <t-alert v-if="failed" theme="error" :message="t('profile.loadFailed')">
        <template #operation
          ><t-button variant="text" @click="load">{{ t('common.retry') }}</t-button></template
        >
      </t-alert>
      <template v-else-if="profile">
        <t-descriptions class="profile-details" :column="1">
          <t-descriptions-item v-for="item in details" :key="item.label" :label="item.label">{{
            item.value || '—'
          }}</t-descriptions-item>
        </t-descriptions>
        <t-form ref="formRef" :data="draft" :rules="rules" label-align="top" @submit="submit">
          <t-form-item
            v-for="field in fields"
            :key="field"
            :name="field"
            :label="t(`profile.${field}`)"
            :help="field === 'time_zone' ? t('profile.timeZoneHelp') : undefined"
          >
            <t-input
              clearable
              v-model="draft[field]"
              :name="`profile-${field}`"
              :disabled="!writable"
              @change="formRef?.clearValidate([field])"
            />
          </t-form-item>
        </t-form>
      </template>
    </t-loading>
    <template #footer>
      <t-button variant="outline" :disabled="saving" @click="onClose">{{
        t('common.cancel')
      }}</t-button>
      <t-button
        v-permission.write="'personal.profile'"
        :loading="saving"
        :disabled="loading || !profile || saving || failed"
        @click="submit"
        >{{ t('common.save') }}</t-button
      >
    </template>
  </t-drawer>
</template>

<script setup lang="ts">
import DrawerSaving from '@/components/DrawerSaving.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type FormInstanceFunctions, type FormRule } from 'tdesign-vue-next'
import { getMyProfileApi, updateMyProfileApi, type MyProfile } from '@/api/modules/identity'
import { createIdempotencyKey, type NotifiedError } from '@/api/request'
import { useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
import { useDrawerClose } from '@/utils/useDrawerClose'
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const user = useUserStore()
const { visible, close } = useDrawerClose('.profile-drawer', () => emit('close'))
const profile = ref<MyProfile>()
const loading = ref(true)
const saving = ref(false)
const failed = ref(false)
const formRef = ref<FormInstanceFunctions>()
const fields = ['display_name', 'email', 'phone', 'time_zone'] as const
const draft = reactive({ display_name: '', email: '', phone: '', time_zone: '' })
const writable = computed(() => user.permissions.includes('personal.profile:write'))
const details = computed(() =>
  profile.value
    ? [
        { label: t('profile.username'), value: profile.value.username },
        { label: t('profile.department'), value: profile.value.department.display_name },
        { label: t('profile.role'), value: profile.value.role_name },
        {
          label: t('profile.language'),
          value: profile.value.preferred_locale || profile.value.resolved_locale,
        },
        { label: t('profile.createdAt'), value: formatDateTime(profile.value.created_at) },
        { label: t('profile.updatedAt'), value: formatDateTime(profile.value.updated_at) },
      ]
    : [],
)
const rules = computed<Record<string, FormRule[]>>(() => ({
  display_name: [
    { validator: (value) => !!String(value).trim(), message: t('profile.required'), type: 'error' },
  ],
  email: [{ email: true, message: t('profile.invalidEmail'), type: 'error' }],
  time_zone: [
    {
      validator: (value) => {
        try {
          if (!value) return false
          new Intl.DateTimeFormat('en', { timeZone: String(value) })
          return true
        } catch {
          return false
        }
      },
      message: t('profile.invalidTimeZone'),
      type: 'error',
    },
  ],
}))
function apply(value: MyProfile) {
  profile.value = value
  Object.assign(draft, {
    display_name: value.display_name,
    email: value.email ?? '',
    phone: value.phone ?? '',
    time_zone: value.time_zone,
  })
  if (user.context.session?.user_id === value.id) {
    user.context.session.display_name = value.display_name
    user.context.session.time_zone = value.time_zone
    if (user.userInfo) user.userInfo.name = value.display_name || value.username
  }
}
async function load() {
  loading.value = true
  failed.value = false
  try {
    apply(await getMyProfileApi())
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
let attempt: { body: string; key: string } | undefined
async function submit() {
  if (!writable.value || saving.value || loading.value || failed.value) return
  if ((await formRef.value?.validate()) === true) await save()
}
async function save() {
  if (!writable.value || saving.value) return
  const payload = {
    display_name: draft.display_name.trim(),
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
    time_zone: draft.time_zone.trim(),
  }
  const body = JSON.stringify(payload)
  if (attempt?.body !== body) attempt = { body, key: createIdempotencyKey() }
  saving.value = true
  try {
    apply(await updateMyProfileApi(payload, { idempotencyKey: attempt.key }))
    attempt = undefined
    MessagePlugin.success(t('profile.saved'))
  } catch (error) {
    const err = error as NotifiedError
    if (!err.notified) MessagePlugin.error(t('profile.saveFailed'))
  } finally {
    saving.value = false
  }
}
function onClose() {
  if (!saving.value) void close()
}
onMounted(load)
</script>

<style scoped>
.profile-details {
  margin-bottom: var(--td-comp-margin-l);
}
</style>
