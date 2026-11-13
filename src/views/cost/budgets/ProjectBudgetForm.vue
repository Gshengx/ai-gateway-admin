<template>
  <t-dialog
    :visible="visible"
    :header="t('budgetPlan.createProject')"
    width="var(--cost-budget-dialog-width)"
    :confirm-btn="{ content: t('cost.save'), loading: saving }"
    :cancel-btn="t('cost.cancel')"
    @close="emit('close')"
    @confirm="submit"
  >
    <div class="budget-layout">
      <t-form class="form" label-align="top" required-mark-position="right"
        ><h3>1 {{ t('budgetPlan.objects') }}</h3>
        <t-form-item :label="t('budgetPlan.selectProject')" required-mark
          ><t-select v-model="ids" multiple :disabled="Boolean(record)" :options="projectOptions" />
          <p class="hint">{{ t('budgetPlan.activeOnly') }}</p></t-form-item
        ><PlanFields :form="form" kind="projects" :source-period="source?.period_type" />
        <h3>5 {{ t('budgetPlan.notifications') }}</h3>
        <p class="hint">{{ t('cost.departmentNotifyHint') }}</p>
        <div v-for="level in levels" :key="level" class="notification">
          <label>{{ t(`cost.notify${level}`) }}</label
          ><UserPicker
            v-model="form.notification_recipients[level]"
            :options="recipients"
            :placeholder="t('cost.selectRecipients')"
          /><t-checkbox-group v-model="form.notification_channels[level]" :options="channels" />
        </div>
        <t-alert v-if="formError" theme="error" :message="formError"
      /></t-form>
      <aside>
        <h3>{{ t('budgetPlan.source') }}</h3>
        <template v-if="source"
          ><p>{{ selected?.project.department }}</p>
          <p>{{ t('cost.budgetAmount') }} {{ money(source.budget_amount, source.currency) }}</p>
          <p>{{ t('cost.consumed') }} {{ money(source.consumed_amount, source.currency) }}</p>
          <p>
            {{ t('budgetPlan.sourceBalance') }}
            {{ money(source.remaining_amount, source.currency) }}
          </p>
          <t-divider />
          <p>
            {{ t('budgetPlan.impact') }}
            <strong :class="{ negative: balance < 0 }">{{
              money(balance, source.currency)
            }}</strong>
          </p></template
        >
        <p v-else>{{ t('budgetPlan.sourceSelect') }}</p>
      </aside>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  getProjectBudgets,
  saveProjectBudget,
  type ProjectBudgetRecord,
  type BudgetLevel,
} from '@/api/modules/projectBudgets'
import { getBudget, type Budget, type BudgetConfig } from '@/api/modules/cost'
import { defaultProjectBudgetConfig, budgetDates, allocateBudget } from '@/utils/projectBudget'
import { useCost } from '../useCost'
import UserPicker from '../UserPicker.vue'
import PlanFields from './PlanFields.vue'
const props = defineProps<{ visible: boolean; record: ProjectBudgetRecord | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, users, init, money, error } = useCost()
const rows = ref<ProjectBudgetRecord[]>([]),
  ids = ref<string[]>([]),
  source = ref<Budget | null>(null),
  saving = ref(false),
  formError = ref('')
const levels: BudgetLevel[] = ['WARNING', 'CRITICAL', 'EXCEEDED']
const form = reactive<BudgetConfig>({
  budget_amount: 10000,
  currency: 'CNY',
  period_type: 'YEARLY',
  budget_mode: 'SHARED',
  warning_threshold: 80,
  critical_threshold: 95,
  over_budget_action: 'ALERT_ONLY',
  notification_recipients: { WARNING: [], CRITICAL: [], EXCEEDED: [] },
  notification_channels: { WARNING: ['IN_APP'], CRITICAL: ['IN_APP'], EXCEEDED: ['IN_APP'] },
})
const selected = computed(
  () => props.record ?? rows.value.find((r) => ids.value.includes(r.project.id)),
)
const projectOptions = computed(() =>
  rows.value
    .filter(
      (r) =>
        r.project.status === 'ACTIVE' && (!r.config || r.project.id === props.record?.project.id),
    )
    .map((r) => ({
      value: r.project.id,
      label: r.project.name,
      disabled: Boolean(
        selected.value && r.project.department_id !== selected.value.project.department_id,
      ),
    })),
)
const recipients = computed(() =>
  users.filter((u) => u.active).map((u) => ({ value: u.id, label: `${u.name} (${u.username})` })),
)
const channels = computed(() =>
  ['IN_APP', 'EMAIL'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
const balance = computed(
  () =>
    (source.value?.available_amount ?? source.value?.remaining_amount ?? 0) -
    form.budget_amount * ids.value.length,
)
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    formError.value = ''
    try {
      await init()
      rows.value = (await getProjectBudgets({ page: 1, page_size: 100 })).items
      const c = props.record?.config ?? defaultProjectBudgetConfig()
      ids.value = props.record ? [props.record.project.id] : []
      Object.assign(form, {
        effective_start: c.start,
        effective_end: c.end,
        budget_amount: c.total,
        currency: c.currency,
        period_type: c.period_type,
        allocation: c.allocation,
        period_amounts: [...c.amounts],
        member_limit_mode: c.member_limit_mode,
        member_limit: c.member_limit,
        member_limits: [...c.member_limits],
        warning_threshold: c.warning_threshold,
        critical_threshold: c.critical_threshold,
        over_budget_action: c.over_action,
        notification_recipients: JSON.parse(JSON.stringify(c.recipients)),
        notification_channels: JSON.parse(JSON.stringify(c.channels)),
      })
    } catch (e) {
      error(e)
    }
  },
)
let version = 0
watch(
  () => selected.value?.project.department_id,
  async (id) => {
    const current = ++version
    source.value = null
    if (!id) return
    const map: Record<string, string> = {
      'd-root': 'hq',
      'd-tech': 'tech',
      'd-algo': 'algorithm',
      'd-platform': 'platform',
      'd-ops': 'operations',
      'd-hr': 'hr',
    }
    try {
      const result = await getBudget('departments', map[id] ?? id.replace(/^d-/, ''))
      if (current !== version) return
      source.value = result
      form.currency = result.currency
      if (!props.record) {
        form.effective_start = result.effective_start
        form.effective_end = result.effective_end
        form.period_type = result.period_type
      }
    } catch (e) {
      error(e)
    }
  },
)
async function submit() {
  const dates = budgetDates(form.effective_start ?? '', form.effective_end ?? '', form.period_type)
  const amounts =
    form.allocation === 'CUSTOM'
      ? (form.period_amounts ?? [])
      : allocateBudget(form.budget_amount, dates.length)
  if (
    !ids.value.length ||
    !dates.length ||
    !(form.budget_amount > 0) ||
    form.warning_threshold > form.critical_threshold ||
    form.critical_threshold > 100 ||
    amounts.some((n) => n < 0) ||
    Math.abs(amounts.reduce((a, b) => a + b, 0) - form.budget_amount) > 0.000001 ||
    balance.value < 0 ||
    (props.record && form.budget_amount < props.record.consumed) ||
    (source.value &&
      (form.effective_start! < source.value.effective_start! ||
        form.effective_end! > source.value.effective_end!))
  ) {
    formError.value = t('budgetPlan.invalid')
    return
  }
  for (const level of levels) {
    if (form.notification_channels[level].length && !form.notification_recipients[level].length) {
      formError.value = t('cost.recipientRequired')
      return
    }
    if (
      form.notification_channels[level].includes('EMAIL') &&
      form.notification_recipients[level].some((id) => !users.find((u) => u.id === id)?.email)
    ) {
      formError.value = t('cost.emailInvalid')
      return
    }
  }
  saving.value = true
  try {
    await saveProjectBudget(
      ids.value,
      {
        start: form.effective_start!,
        end: form.effective_end!,
        total: form.budget_amount,
        currency: form.currency,
        period_type: form.period_type,
        allocation: form.allocation ?? 'EVEN',
        amounts,
        member_limit_mode: form.member_limit_mode ?? 'NONE',
        member_limit: form.member_limit ?? 0,
        member_limits: form.member_limits ?? [],
        warning_threshold: form.warning_threshold,
        critical_threshold: form.critical_threshold,
        over_action: form.over_budget_action === 'BLOCK_PROJECT' ? 'BLOCK_PROJECT' : 'ALERT_ONLY',
        recipients: JSON.parse(JSON.stringify(form.notification_recipients)),
        channels: JSON.parse(JSON.stringify(form.notification_channels)),
      },
      Object.fromEntries(
        rows.value
          .filter((r) => ids.value.includes(r.project.id))
          .map((r) => [r.project.id, r.version]),
      ),
    )
    void MessagePlugin.success(t('cost.saved'))
    emit('saved')
    emit('close')
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
</script>
<style scoped>
.budget-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--td-comp-margin-l);
}
.form,
.notification {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.form :deep(.t-form__item) {
  margin: 0;
}
aside {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
}
h3,
p {
  margin: 0;
}
h3 {
  font-size: var(--td-font-size-title-small);
}
aside p {
  margin-top: var(--td-comp-margin-l);
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.negative {
  color: var(--td-error-color);
}
</style>
