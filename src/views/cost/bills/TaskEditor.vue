<template>
  <t-dialog
    :visible="visible"
    :close-on-overlay-click="false"
    :header="t(task ? 'bills.editTask' : 'bills.newTask')"
    :confirm-btn="{ content: t('bills.save'), loading: busy }"
    :cancel-btn="t('bills.cancel')"
    @close="emit('close')"
    @confirm="save"
  >
    <t-form class="bill-editor-form task-editor-form" label-align="top" :disabled="busy">
      <section class="task-section">
        <t-form-item :label="t('bills.schedule')" required
          ><div class="bill-field-stack">
            <t-radio-group v-model="form.periodType" :options="periods" />
            <p class="bill-field-hint">
              {{
                t(form.periodType === 'MONTHLY' ? 'bills.monthlyTaskHint' : 'bills.weeklyTaskHint')
              }}
            </p>
          </div></t-form-item
        >
      </section>
      <section class="task-section">
        <ScopeFields
          v-if="visible"
          v-model:scope-type="form.scopeType"
          v-model:scope-id="form.scopeId"
          :scopes="scopes"
          task
        />
      </section>
      <section class="task-section">
        <t-form-item
          class="email-toggle"
          :label="t('bills.emailEnabled')"
          label-align="left"
          label-width="auto"
          ><t-switch v-model="form.emailEnabled" @change="clearEmails"
        /></t-form-item>
        <t-form-item v-if="form.emailEnabled" :label="t('bills.emailRecipients')" required>
          <div class="bill-field-stack">
            <div ref="emailEditor" class="email-editor" @scroll.capture="syncEmailOverlay">
              <t-textarea
                v-model="emails"
                name="bill-task-recipients"
                :status="emailError ? 'error' : 'default'"
                :placeholder="t('bills.emailsHint')"
              />
              <div
                ref="emailMirror"
                class="email-highlights"
                :style="mirrorStyle"
                aria-hidden="true"
              >
                <span
                  v-for="(part, index) in emailParts"
                  :key="index"
                  :class="{ 'invalid-email': part.invalid }"
                  >{{ part.text }}</span
                >{{ '\u200b' }}
              </div>
            </div>
            <p v-if="emailError" class="email-error" role="alert">{{ emailError }}</p>
          </div>
        </t-form-item>
      </section>
      <t-alert v-if="validation" theme="error" :message="validation" />
    </t-form>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { saveBillTask, type BillTask, type ScopeOption, type TaskInput } from '@/api/modules/bills'
import ScopeFields from './ScopeFields.vue'
import { useCost } from '../useCost'
import '@/styles/cost.css'
const props = defineProps<{ visible: boolean; task: BillTask | null; scopes: ScopeOption[] }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, error } = useCost()
const form = reactive<TaskInput>({
  periodType: 'MONTHLY',
  scopeType: 'DEPARTMENT',
  scopeId: '',
  emailEnabled: false,
  emailRecipients: [],
})
const emails = ref(''),
  busy = ref(false),
  validation = ref(''),
  submitted = ref(false)
const emailEditor = ref<HTMLElement>(),
  emailMirror = ref<HTMLElement>(),
  mirrorStyle = ref<Record<string, string>>({})
let resizeObserver: ResizeObserver | undefined
const periods = computed(() =>
  ['MONTHLY', 'WEEKLY'].map((value) => ({ value, label: t(`bills.${value}`) })),
)
function validEmail(value: string) {
  if (value.length > 254) return false
  const parts = value.split('@')
  if (parts.length !== 2) return false
  const [local = '', domain = ''] = parts
  if (
    !local ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
  )
    return false
  const labels = domain.split('.')
  return (
    labels.length > 1 &&
    labels.every(
      (label) => label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
    ) &&
    /^[A-Za-z]{2,}$/.test(labels[labels.length - 1] ?? '')
  )
}
const emailParts = computed(() =>
  emails.value.split(/([,，;；、\s]+)/).map((text) => ({
    text,
    invalid: !!text && !/^[,，;；、\s]+$/.test(text) && !validEmail(text),
  })),
)
const recipients = computed(() => [...new Set(emails.value.split(/[,，;；、\s]+/).filter(Boolean))])
const emailError = computed(() => {
  if (!form.emailEnabled) return ''
  const invalid = [...new Set(emailParts.value.filter((p) => p.invalid).map((p) => p.text))]
  if (invalid.length) return t('bills.invalidEmails', { emails: invalid.join('、') })
  return submitted.value && !recipients.value.length ? t('bills.invalidEmail') : ''
})
function clearEmails() {
  emails.value = ''
  submitted.value = false
}
function syncEmailOverlay() {
  const textarea = emailEditor.value?.querySelector('textarea'),
    mirror = emailMirror.value
  if (!textarea || !mirror) return
  const style = getComputedStyle(textarea)
  mirrorStyle.value = {
    font: style.font,
    letterSpacing: style.letterSpacing,
    padding: style.padding,
    borderWidth: style.borderWidth,
    borderStyle: 'solid',
    borderColor: 'transparent',
    width: `${textarea.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`,
    height: `${textarea.offsetHeight}px`,
    wordBreak: style.wordBreak,
    overflowWrap: style.overflowWrap,
  }
  mirror.scrollTop = textarea.scrollTop
  mirror.scrollLeft = textarea.scrollLeft
}
watch(
  () => [props.visible, form.emailEnabled],
  async () => {
    resizeObserver?.disconnect()
    await nextTick()
    const textarea = emailEditor.value?.querySelector('textarea')
    if (props.visible && form.emailEnabled && textarea) {
      resizeObserver = new ResizeObserver(syncEmailOverlay)
      resizeObserver.observe(textarea)
      syncEmailOverlay()
    }
  },
  { flush: 'post' },
)
watch(emails, async () => {
  await nextTick()
  syncEmailOverlay()
})
onBeforeUnmount(() => resizeObserver?.disconnect())
watch(
  () => props.visible,
  (v) => {
    if (v) {
      Object.assign(
        form,
        props.task ?? {
          periodType: 'MONTHLY',
          scopeType: props.scopes[0]?.type ?? 'DEPARTMENT',
          scopeId: '',
          emailEnabled: false,
          emailRecipients: [],
        },
      )
      emails.value = props.task?.emailRecipients.join('; ') ?? ''
      validation.value = ''
      submitted.value = false
    }
  },
)
async function save() {
  submitted.value = true
  validation.value = ''
  if (!form.scopeId) {
    validation.value = t('bills.required')
    return
  }
  if (emailError.value) return
  busy.value = true
  try {
    await saveBillTask(
      { ...form, emailRecipients: form.emailEnabled ? recipients.value : [] },
      props.task?.id,
    )
    emit('saved')
    emit('close')
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.task-editor-form {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-xl);
}
.task-section {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-m);
}
.task-section :deep(.t-form__item) {
  margin-bottom: 0;
}

.email-toggle {
  display: flex;
  align-items: center;
}
.email-toggle :deep(.t-form__controls) {
  flex: 1;
  min-height: 0;
  margin-left: 0;
  line-height: var(--td-line-height-body-medium);
}
.email-toggle :deep(.t-form__label) {
  height: auto;
  line-height: var(--td-line-height-body-medium);
}
.email-toggle :deep(.t-form__controls-content) {
  min-height: 0;
}
.email-editor {
  position: relative;
  width: 100%;
}
.email-highlights {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  color: transparent;
}
.invalid-email {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--td-error-color);
  text-decoration-skip-ink: none;
}
.email-error {
  margin: 0;
  color: var(--td-error-color);
  font: var(--td-font-body-small);
  overflow-wrap: anywhere;
}
</style>
