<template>
  <t-dialog
    :visible="visible"
    :header="t('cost.editBudget')"
    width="var(--cost-budget-dialog-width)"
    :confirm-btn="{ content: t('cost.save'), loading: saving || optionsLoading }"
    :cancel-btn="t('cost.cancel')"
    @close="emit('close')"
    @confirm="submit"
  >
    <t-form class="budget-form" label-align="top" required-mark-position="right">
      <t-form-item
        v-if="kind === 'departments'"
        :label="t('cost.selectDepartmentLabel')"
        required-mark
        ><t-input :value="deptName(departmentId)" readonly
      /></t-form-item>
      <t-form-item v-else :label="t('cost.selectUsers')" required-mark
        ><UserPicker
          v-model="userIds"
          :disabled="Boolean(budget)"
          :options="userOptions"
          :loading="optionsLoading"
          :placeholder="t('cost.selectUsers')"
      /></t-form-item>
      <template v-if="kind === 'departments'"
        ><t-form-item :label="t('cost.mode')" required-mark
          ><t-radio-group v-model="form.budget_mode" :options="modeOptions" /></t-form-item
        ><t-alert
          :theme="form.budget_mode === 'INDEPENDENT' ? 'warning' : 'info'"
          :message="
            t(form.budget_mode === 'INDEPENDENT' ? 'cost.independentHint' : 'cost.sharedHint')
          "
      /></template>
      <div class="form-row">
        <t-form-item
          :label="t(kind === 'users' ? 'cost.baseInput' : 'cost.amountInput')"
          required-mark
          ><t-input-number
            v-nonnegative-number
            v-model="form.budget_amount"
            :min="0"
            :decimal-places="2"
            theme="normal"
        /></t-form-item>
        <t-form-item :label="t('cost.currency')" required-mark
          ><t-select v-model="form.currency" :options="currencyOptions" :disabled="!isHq"
        /></t-form-item>
      </div>
      <t-alert
        v-if="isHq && form.currency !== budget?.currency"
        theme="warning"
        :message="t('cost.currencyHint')"
      />
      <div class="field-group">
        <t-form-item :label="t('cost.budgetPeriod')" required-mark
          ><t-select v-model="form.period_type" :options="periodOptions" :disabled="!isHq"
        /></t-form-item>
        <p v-if="!isHq" class="hint">{{ t('cost.followHq') }}</p>
      </div>
      <div class="form-row">
        <t-form-item :label="t('cost.warningThreshold')" required-mark
          ><t-input-number
            v-nonnegative-number
            v-model="form.warning_threshold"
            :min="1"
            :max="98"
            :decimal-places="0"
            theme="normal"
        /></t-form-item>
        <t-form-item :label="t('cost.criticalThreshold')" required-mark
          ><t-input-number
            v-nonnegative-number
            v-model="form.critical_threshold"
            :min="2"
            :max="99"
            :decimal-places="0"
            theme="normal"
        /></t-form-item>
      </div>
      <div class="field-group">
        <t-form-item :label="t('cost.overAction')" required-mark
          ><t-select v-model="form.over_budget_action" :options="actionOptions"
        /></t-form-item>
        <p class="hint">
          {{ t(form.over_budget_action === 'ALERT_ONLY' ? 'cost.alertHint' : 'cost.blockHint') }}
        </p>
      </div>
      <div class="notification">
        <h4>{{ t('cost.notificationSettings') }}</h4>
        <p class="hint">
          {{ t(kind === 'users' ? 'cost.userNotifyHint' : 'cost.departmentNotifyHint') }}
        </p>
        <div v-for="level in levels" :key="level" class="notification-level">
          <div class="notification-heading">
            <label>{{ t(`cost.notify${level}`) }}</label>
            <t-checkbox-group
              v-model="form.notification_channels[level]"
              :options="channelOptions"
            />
          </div>
          <UserPicker
            v-model="form.notification_recipients[level]"
            :options="recipientOptions(level)"
            :loading="optionsLoading"
            :placeholder="t('cost.selectRecipients')"
          />
        </div>
      </div>
      <t-alert
        v-for="(warning, index) in warnings"
        :key="index"
        theme="warning"
        :message="
          t(warning.kind === 'departments' ? 'cost.departmentOver' : 'cost.userOver', {
            sum: money(warning.sum, form.currency),
            limit: money(warning.limit, form.currency),
          })
        "
      />
      <t-alert v-if="formError" theme="error" :message="formError" />
    </t-form>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  saveBudget,
  getBudgetWarnings,
  type Budget,
  type BudgetConfig,
  type Level,
} from '@/api/modules/cost'
import { useCost } from '../useCost'
import UserPicker from '../UserPicker.vue'
const props = defineProps<{
  visible: boolean
  kind: 'departments' | 'users'
  budget: Budget | null
  headquarters: Budget
  departmentId: string
  selectedUsers: string[]
}>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, users, deptName, init, ensureDepartments, money, error } = useCost()
const optionsLoading = ref(false)
const levels: Level[] = ['WARNING', 'CRITICAL', 'EXCEEDED']
const emptyForm = (): BudgetConfig => ({
  budget_amount: 5000,
  currency: 'CNY',
  period_type: 'MONTHLY',
  budget_mode: 'SHARED',
  warning_threshold: 80,
  critical_threshold: 95,
  over_budget_action: 'ALERT_ONLY',
  notification_recipients: { WARNING: [], CRITICAL: [], EXCEEDED: [] },
  notification_channels: { WARNING: ['IN_APP'], CRITICAL: ['IN_APP'], EXCEEDED: ['IN_APP'] },
})
const form = reactive<BudgetConfig>(emptyForm()),
  userIds = ref<string[]>([]),
  saving = ref(false),
  formError = ref('')
const warnings = ref<{ sum: number; limit: number; kind: string }[]>([])
const isHq = computed(() => props.kind === 'departments' && props.departmentId === 'hq')
const userOptions = computed(() =>
  users.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.username}) · ${deptName(u.department_id, true)}`,
  })),
)
const recipientOptions = (level: Level) =>
  userOptions.value
    .filter(
      (option) =>
        (users.find((u) => u.id === option.value)?.active ||
          form.notification_recipients[level].includes(option.value)) &&
        !(
          props.kind === 'users' &&
          userIds.value.length === 1 &&
          userIds.value[0] === option.value
        ),
    )
    .map((option) => ({
      ...option,
      label: users.find((u) => u.id === option.value)?.active
        ? option.label
        : `${option.label} · ${t('cost.DISABLED')}`,
      disabled: !users.find((u) => u.id === option.value)?.active,
    }))
const modeOptions = computed(() =>
  ['SHARED', 'INDEPENDENT'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
const currencyOptions = computed(() =>
  ['CNY', 'USD'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
const periodOptions = computed(() =>
  ['MONTHLY', 'QUARTERLY'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
const actionOptions = computed(() =>
  ['ALERT_ONLY', props.kind === 'users' ? 'BLOCK_USER' : 'BLOCK_DEPARTMENT'].map((value) => ({
    value,
    label: t(`cost.${value}`),
  })),
)
const channelOptions = computed(() =>
  ['IN_APP', 'EMAIL'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    formError.value = ''
    warnings.value = []
    const source = props.budget?.configured ? props.budget : null
    // Budget configuration is JSON data; serialization also unwraps nested Vue proxies.
    const sourceConfig = source ? (JSON.parse(JSON.stringify(source)) as BudgetConfig) : null
    const configuration = source
      ? Object.fromEntries(
          Object.keys(emptyForm()).map((key) => [key, sourceConfig![key as keyof BudgetConfig]]),
        )
      : {}
    Object.assign(form, emptyForm(), configuration, {
      currency: props.headquarters.currency,
      period_type: props.headquarters.period_type,
      over_budget_action:
        source?.over_budget_action ??
        (props.kind === 'departments' ? 'BLOCK_DEPARTMENT' : 'ALERT_ONLY'),
    })
    userIds.value = props.budget?.user_id ? [props.budget.user_id] : [...props.selectedUsers]
    optionsLoading.value = true
    try {
      await init()
      await ensureDepartments([props.departmentId, ...users.map((u) => u.department_id)])
    } catch (err) {
      error(err)
    } finally {
      optionsLoading.value = false
    }
  },
)
let timer: ReturnType<typeof setTimeout> | undefined,
  version = 0
watch(
  [() => form.budget_amount, userIds, () => props.visible],
  () => {
    clearTimeout(timer)
    const current = ++version
    if (!props.visible || !(form.budget_amount > 0)) return
    timer = setTimeout(async () => {
      try {
        const result = await getBudgetWarnings(props.kind, {
          budget_amount: form.budget_amount,
          department_id: props.departmentId,
          user_ids: userIds.value,
        })
        if (current === version) warnings.value = result
      } catch (err) {
        error(err)
      }
    }, 250)
  },
  { deep: true },
)
async function submit() {
  if (optionsLoading.value) return
  formError.value = ''
  if (!(form.budget_amount > 0) || !Number.isFinite(form.budget_amount)) {
    formError.value = t('cost.amountPositive')
    return
  }
  if (
    form.warning_threshold <= 0 ||
    form.critical_threshold <= form.warning_threshold ||
    form.critical_threshold >= 100
  ) {
    formError.value = t('cost.thresholdsInvalid')
    return
  }
  if (props.kind === 'users' && !userIds.value.length) {
    formError.value = t('cost.validation')
    return
  }
  for (const level of levels) {
    const channels = form.notification_channels[level],
      recipients = form.notification_recipients[level]
    if (props.kind === 'departments' && channels.length && !recipients.length) {
      formError.value = t('cost.recipientRequired')
      return
    }
    if (
      channels.includes('EMAIL') &&
      [...recipients, ...(props.kind === 'users' ? userIds.value : [])].some((id) => {
        const u = users.find((u) => u.id === id)
        return !u?.active || !u.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)
      })
    ) {
      formError.value = t('cost.emailInvalid')
      return
    }
  }
  saving.value = true
  try {
    const data = JSON.parse(JSON.stringify(form)) as BudgetConfig
    await saveBudget(
      props.kind,
      { ...data, department_id: props.departmentId, user_ids: userIds.value },
      props.budget?.configured ? props.budget.id : undefined,
    )
    void MessagePlugin.success(t('cost.saved'))
    emit('saved')
    emit('close')
  } catch (err) {
    error(err)
  } finally {
    saving.value = false
  }
}
onBeforeUnmount(() => {
  version++
  clearTimeout(timer)
})
</script>
<style scoped>
.budget-form {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
  max-height: var(--cost-budget-form-max-height);
  overflow-y: auto;
  padding-inline-end: var(--td-comp-paddingLR-s);
}
.budget-form :deep(.t-form__item) {
  margin: 0;
}
.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--td-comp-margin-l);
  row-gap: var(--td-comp-margin-xs);
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-xs);
}
.form-row :deep(.t-form__item),
.form-row :deep(.t-form__controls) {
  min-width: 0;
}
.budget-form :deep(.t-input-number),
.budget-form :deep(.t-select__wrap) {
  width: 100%;
}
.hint {
  color: var(--td-text-color-secondary);
  margin: 0;
  font-size: var(--td-font-size-body-small);
}
.notification {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.notification h4 {
  margin: 0;
  font-size: var(--td-font-size-title-small);
}
.notification-level {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
.notification-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--td-comp-margin-s);
}
</style>
