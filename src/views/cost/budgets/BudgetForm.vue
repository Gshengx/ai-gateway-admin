<template>
  <t-dialog
    :visible="visible"
    :header="t('cost.editBudget')"
    width="var(--cost-budget-dialog-width)"
    :confirm-btn="{
      content: t('cost.save'),
      loading: saving || optionsLoading,
      disabled: Boolean(blocking),
    }"
    :cancel-btn="t('cost.cancel')"
    @close="emit('close')"
    @confirm="submit"
  >
    <div class="budget-layout">
      <t-form class="budget-form" label-align="top" required-mark-position="right"
        ><h3>1 {{ t('budgetPlan.objects') }}</h3>
        <t-form-item
          v-if="kind === 'departments'"
          :label="t('cost.selectDepartmentLabel')"
          required-mark
          ><DepartmentPicker v-if="!budget" v-model="departmentIds" /><t-input
            v-else
            :value="deptName(departmentId)"
            readonly
        /></t-form-item>
        <t-form-item v-else :label="t('cost.selectUsers')" required-mark
          ><UserPicker
            v-model="userIds"
            :disabled="Boolean(budget)"
            :options="userOptions"
            :loading="optionsLoading"
            :placeholder="t('cost.selectUsers')"
        /></t-form-item>
        <PlanFields
          :form="form"
          :kind="kind"
          :headquarters="isHq"
          :source-period="isHq ? undefined : sourceBudget?.period_type"
        >
          <template #mode
            ><t-form-item v-if="kind === 'departments'" :label="t('cost.mode')" required-mark
              ><t-radio-group v-model="form.budget_mode" :options="modeOptions" /></t-form-item
          ></template>
        </PlanFields>
        <div class="notification">
          <h4>5 {{ t('budgetPlan.notifications') }}</h4>
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
      <aside class="source-panel">
        <h3>{{ t(isHq ? 'budgetPlan.lowerReference' : 'budgetPlan.source') }}</h3>
        <template v-if="isHq"
          ><p>
            {{ t('budgetPlan.lowerAllocated') }}
            {{ money(headquarters.allocated_amount ?? 0, form.currency) }}
          </p>
          <p>
            {{ t('budgetPlan.lowerConsumed') }}
            {{ money(headquarters.consumed_amount, form.currency) }}
          </p></template
        >
        <p>{{ deptName(sourceBudget?.department_id) }}</p>
        <p>
          {{ t('cost.budgetAmount') }} {{ money(sourceBudget?.budget_amount ?? 0, form.currency) }}
        </p>
        <p>
          {{ t('cost.consumed') }} {{ money(sourceBudget?.consumed_amount ?? 0, form.currency) }}
        </p>
        <p>
          {{ t('budgetPlan.sourceBalance') }}
          {{
            money(
              sourceBudget?.available_amount ?? sourceBudget?.remaining_amount ?? 0,
              form.currency,
            )
          }}
        </p>
        <t-progress
          :percentage="Math.min(100, sourceBudget?.usage ?? 0)"
          :label="`${(sourceBudget?.usage ?? 0).toFixed(1)}%`"
        /><t-alert v-if="blocking" theme="error" :message="blocking" />
      </aside>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  saveBudget,
  getBudget,
  getCostDepartment,
  getBudgetWarnings,
  type Budget,
  type BudgetConfig,
  type Level,
} from '@/api/modules/cost'
import { useCost } from '../useCost'
import UserPicker from '../UserPicker.vue'
import PlanFields from './PlanFields.vue'
import DepartmentPicker from './DepartmentPicker.vue'
import { budgetDates, allocateBudget } from '@/utils/projectBudget'
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
const departmentIds = ref<string[]>([])
const targetDepartment = computed(() => departmentIds.value[0] ?? props.departmentId)
const sourceBudget = ref<Budget | null>(null)
const optionsLoading = ref(false)
const levels: Level[] = ['WARNING', 'CRITICAL', 'EXCEEDED']
const emptyForm = (): BudgetConfig => ({
  effective_start: `${new Date().getFullYear()}-01-01`,
  effective_end: `${new Date().getFullYear()}-12-31`,
  allocation: 'EVEN',
  period_amounts: [],
  member_limit_mode: 'NONE',
  member_limit: 0,
  member_limits: [],
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
const isHq = computed(
  () => props.kind === 'departments' && (targetDepartment.value || props.departmentId) === 'hq',
)
const userSignature = (id: string) => {
  const u = users.find((r) => r.id === id)
  return JSON.stringify([
    u?.budget_source_id,
    u?.budget_mode,
    u?.period_type,
    u?.effective_start,
    u?.effective_end,
  ])
}
const userOptions = computed(() =>
  users.map((u) => {
    const disabled =
      props.kind === 'users' &&
      userIds.value.length > 0 &&
      userSignature(u.id) !== userSignature(userIds.value[0]!)
    return {
      value: u.id,
      label: `${u.name} (${u.username}) · ${deptName(u.department_id, true)}${disabled ? ` · ${t('budgetPlan.incompatible')}` : ''}`,
      disabled,
    }
  }),
)
const blocking = computed(() => {
  if (props.kind === 'users' ? !userIds.value.length : !departmentIds.value.length)
    return t('cost.validation')
  const dates = budgetDates(form.effective_start ?? '', form.effective_end ?? '', form.period_type)
  if (
    !dates.length ||
    (sourceBudget.value &&
      !isHq.value &&
      (form.effective_start! < sourceBudget.value.effective_start! ||
        form.effective_end! > sourceBudget.value.effective_end!))
  )
    return t('budgetPlan.dateHint')
  if (!Number.isFinite(form.budget_amount) || form.budget_amount <= 0)
    return t('cost.amountPositive')
  if (props.budget?.configured && form.budget_amount < props.budget.consumed_amount)
    return t('budgetPlan.belowConsumed')
  const amounts =
    form.allocation === 'CUSTOM'
      ? (form.period_amounts ?? [])
      : allocateBudget(form.budget_amount, dates.length)
  if (
    amounts.length !== dates.length ||
    amounts.some((n) => n < 0) ||
    Math.abs(amounts.reduce((a, b) => a + b, 0) - form.budget_amount) > 0.000001
  )
    return t('budgetPlan.allocationInvalid')
  if (
    form.member_limit_mode !== 'NONE' &&
    amounts.some(
      (amount, i) =>
        (form.member_limit_mode === 'CUSTOM'
          ? (form.member_limits?.[i] ?? 0)
          : (form.member_limit ?? 0)) > amount,
    )
  )
    return t('budgetPlan.limitInvalid')
  if (
    isHq.value &&
    form.budget_amount <
      Math.max(props.headquarters.allocated_amount ?? 0, props.headquarters.consumed_amount)
  )
    return t('budgetPlan.lowerInvalid')
  if (
    !isHq.value &&
    sourceBudget.value &&
    form.budget_amount * (props.kind === 'users' ? 1 : departmentIds.value.length) >
      sourceBudget.value.remaining_amount
  )
    return t('budgetPlan.negative')
  if (
    form.warning_threshold < 1 ||
    form.critical_threshold < form.warning_threshold ||
    form.critical_threshold > 100
  )
    return t('cost.thresholdsInvalid')
  return ''
})
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
const channelOptions = computed(() =>
  ['IN_APP', 'EMAIL'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    formError.value = ''
    departmentIds.value = props.departmentId ? [props.departmentId] : []
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
      period_type: source?.period_type ?? props.headquarters.period_type,
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
watch(
  [targetDepartment, userIds, () => props.visible],
  async () => {
    if (!props.visible) return
    const id =
      props.kind === 'users'
        ? users.find((u) => u.id === userIds.value[0])?.department_id
        : targetDepartment.value || props.departmentId
    if (!id) {
      sourceBudget.value = null
      return
    }
    try {
      const parent = props.kind === 'users' ? id : (await getCostDepartment(id)).parent_id
      sourceBudget.value = parent ? await getBudget('departments', parent) : props.headquarters
      if (!props.budget?.configured && sourceBudget.value) {
        form.effective_start = sourceBudget.value.effective_start
        form.effective_end = sourceBudget.value.effective_end
        form.period_type = sourceBudget.value.period_type
        form.currency = sourceBudget.value.currency
      }
    } catch (e) {
      error(e)
    }
  },
  { deep: true },
)
async function submit() {
  if (optionsLoading.value || blocking.value) return
  formError.value = ''
  if (!(form.budget_amount > 0) || !Number.isFinite(form.budget_amount)) {
    formError.value = t('cost.amountPositive')
    return
  }
  if (
    form.warning_threshold <= 0 ||
    form.critical_threshold < form.warning_threshold ||
    form.critical_threshold > 100
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
      {
        ...data,
        department_id: targetDepartment.value || props.departmentId,
        department_ids: props.kind === 'departments' ? departmentIds.value : undefined,
        user_ids: userIds.value,
      },
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
.budget-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--td-comp-margin-l);
}
.source-panel {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
}

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
