<template>
  <t-card :bordered="false" class="orders">
    <t-tabs v-model="tab" @change="firstPage"
      ><t-tab-panel
        v-for="value in tabs"
        :key="value"
        :value="value"
        :label="
          t(`budgetFlow.${value}`) + (value === 'pending' && pendingCount ? ` ${pendingCount}` : '')
        "
    /></t-tabs>
    <FilterBar
      ><template #content
        ><div class="toolbar list-toolbar">
          <t-input
            class="list-search"
            v-model="search"
            :placeholder="t('budgetFlow.search')"
            clearable
            @enter="firstPage"
            @clear="firstPage"
          /><t-select
            class="list-filter"
            v-model="status"
            :options="statuses"
            :placeholder="t('budgetFlow.allStatus')"
            clearable
            @change="firstPage"
          /><t-button theme="default" @click="reset">{{ t('budgetFlow.reset') }}</t-button
          ><t-button
            v-permission.write="'personal.work_orders'"
            v-if="tab === 'mine'"
            class="create"
            @click="openCreate"
            >{{ t('budgetFlow.create') }}</t-button
          >
        </div></template
      ></FilterBar
    >
    <t-table
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="{ current: page, pageSize, total, showJumper: true }"
      @page-change="pageChange"
    >
      <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
      <template #updated_at="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      <template #content="{ row }"
        ><div>{{ t(`budgetFlow.${row.target}`) }} · {{ row.project_name }}</div>
        <span class="hint"
          >{{ t(`budgetFlow.${row.mode}`) }} {{ money(row.requested_amount) }}</span
        ></template
      >
      <template #applicant="{ row }"
        ><div>{{ row.applicant_name }}</div>
        <span class="hint">{{ row.department }}</span></template
      ><template #level="{ row }">{{ t('budgetFlow.levelValue', { level: row.level }) }}</template>
      <template #flow>{{ t('budgetFlow.flowName') }}</template>
      <template #handler="{ row }">{{
        row.status === 'PENDING' ? row.steps[row.level - 1]?.approver_name : '—'
      }}</template>
      <template #status="{ row }"
        ><t-tag :theme="theme(row.status)" variant="light">{{
          t(`budgetFlow.${row.status}`)
        }}</t-tag></template
      >
      <template #actions="{ row }"
        ><t-space
          ><t-link theme="primary" @click="showDetail(row.id)">{{ t('budgetFlow.detail') }}</t-link
          ><t-link
            v-if="row.can_withdraw"
            v-permission.write="'personal.work_orders'"
            theme="primary"
            @click="withdrawing = row"
            >{{ t('budgetFlow.withdraw') }}</t-link
          ></t-space
        ></template
      >
    </t-table>
  </t-card>
  <t-dialog
    :visible="creating"
    :header="t('budgetFlow.create')"
    width="var(--cost-order-form-width)"
    :confirm-btn="{ content: t('budgetFlow.submit'), loading: saving }"
    :cancel-btn="t('budgetFlow.cancel')"
    @close="closeCreate"
    @confirm="submit"
  >
    <t-form class="order-form" label-align="top" required-mark-position="right">
      <t-form-item :label="t('budgetFlow.flow')"
        ><t-space
          >{{ t('budgetFlow.flowName')
          }}<t-tag variant="light">{{ t('budgetFlow.twoLevels') }}</t-tag></t-space
        ></t-form-item
      >
      <t-form-item :label="t('budgetFlow.content')"
        ><t-tag theme="primary" variant="light">{{
          t('budgetFlow.budgetRequest')
        }}</t-tag></t-form-item
      >
      <t-form-item :label="t('budgetFlow.owner')" required-mark
        ><t-radio-group v-model="form.target"
          ><t-radio value="PERSONAL"
            >{{ t('budgetFlow.PERSONAL') }}
            <p class="hint">{{ t('budgetFlow.personalHint') }}</p></t-radio
          ><t-radio value="PROJECT"
            >{{ t('budgetFlow.PROJECT') }}
            <p class="hint">{{ t('budgetFlow.projectHint') }}</p></t-radio
          ></t-radio-group
        ></t-form-item
      >
      <t-form-item v-if="form.target === 'PROJECT'" :label="t('budgetFlow.project')" required-mark
        ><t-select
          class="list-filter"
          v-model="form.project_id"
          :options="projectOptions"
          :placeholder="t('budgetFlow.project')" /><t-alert
          v-if="!projectOptions.length"
          theme="warning"
          :message="t('budgetFlow.noProjects')"
      /></t-form-item>
      <div class="budget-context">
        <span>{{ t(`budgetFlow.${form.target}`) }} · {{ t('budgetFlow.current') }}</span
        ><strong>{{ money(available) }}</strong>
      </div>
      <t-form-item :label="t('budgetFlow.perPeriod')" required-mark
        ><t-input-number
          v-nonnegative-number
          v-model="form.per_period_amount"
          :min="0.01"
          :decimal-places="2"
          theme="normal"
        />
        <p class="hint">
          {{ t('budgetFlow.totalHint', { count: periodCount, amount: money(requested) }) }}
        </p></t-form-item
      >
      <t-form-item :label="t('budgetFlow.mode')" required-mark
        ><t-radio-group v-model="form.mode"
          ><t-radio value="PERMANENT"
            >{{ t('budgetFlow.PERMANENT') }}
            <p class="hint">{{ t('budgetFlow.permanentHint') }}</p></t-radio
          ><t-radio value="TEMPORARY"
            >{{ t('budgetFlow.TEMPORARY') }}
            <p class="hint">{{ t('budgetFlow.temporaryHint') }}</p></t-radio
          ></t-radio-group
        ></t-form-item
      >
      <t-form-item v-if="form.mode === 'TEMPORARY'" :label="t('budgetFlow.until')" required-mark
        ><t-date-picker v-model="form.valid_until" :disable-date="invalidDate"
      /></t-form-item>
      <section>
        <h4>{{ t('budgetFlow.preview') }}</h4>
        <t-table
          row-key="period"
          size="small"
          :data="preview"
          :columns="previewColumns"
          :bordered="false"
        />
        <p v-if="form.mode === 'PERMANENT'" class="hint">
          {{ t('budgetFlow.previewHint', { count: periodCount, amount: money(requested) }) }}
        </p>
      </section>
      <t-form-item :label="t('budgetFlow.reason')" required-mark
        ><t-textarea v-model="form.reason" :maxlength="500" :autosize="{ minRows: 3, maxRows: 5 }"
      /></t-form-item>
      <section>
        <h4>{{ t('budgetFlow.approvers') }}</h4>
        <div class="approvers">
          <t-form-item :label="t('budgetFlow.first')" required-mark
            ><t-select
              class="list-filter"
              v-model="form.first_approver_id"
              :options="options?.approvers.map((u) => ({ value: u.id, label: u.display_name }))"
              filterable /></t-form-item
          ><t-form-item :label="t('budgetFlow.second')"
            ><t-input :value="options?.second_approver?.name ?? '—'" readonly
          /></t-form-item>
        </div>
      </section>
      <t-alert v-if="formError" theme="error" :message="formError" />
    </t-form>
  </t-dialog>
  <t-drawer
    :visible="Boolean(detail)"
    :header="detail?.number"
    size="var(--cost-order-detail-width)"
    :footer="false"
    @close="detail = null"
  >
    <div v-if="detail" class="order-form">
      <t-space
        ><t-tag :theme="theme(detail.status)">{{ t(`budgetFlow.${detail.status}`) }}</t-tag
        ><t-tag>{{ t(`budgetFlow.${detail.execution}`) }}</t-tag></t-space
      ><t-descriptions :column="2" layout="vertical"
        ><t-descriptions-item :label="t('budgetFlow.applicant')">{{
          detail.applicant_name
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('budgetFlow.created')">{{
          formatDateTime(detail.created_at)
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('budgetFlow.owner')"
          >{{ t(`budgetFlow.${detail.target}`) }} · {{ detail.project_name }}</t-descriptions-item
        ><t-descriptions-item :label="t('budgetFlow.mode')">{{
          t(`budgetFlow.${detail.mode}`)
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('budgetFlow.requested')">{{
          money(detail.requested_amount)
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('budgetFlow.approvedAmount')">{{
          money(detail.approved_amount)
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('budgetFlow.until')">{{
          detail.approved_until ? formatDate(detail.approved_until) : '—'
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('budgetFlow.reason')">{{
          detail.reason
        }}</t-descriptions-item></t-descriptions
      >
      <h4>{{ t('budgetFlow.flow') }}</h4>
      <t-timeline
        ><t-timeline-item v-for="(step, index) in detail.steps" :key="step.approver_id"
          ><strong
            >{{ t(index ? 'budgetFlow.second' : 'budgetFlow.first') }} ·
            {{ step.approver_name }}</strong
          >
          <p>
            {{ t(`budgetFlow.${step.status}`)
            }}<span v-if="step.at"> · {{ formatDateTime(step.at) }}</span>
          </p>
          <p v-if="step.amount">{{ t('budgetFlow.approvedAmount') }}：{{ money(step.amount) }}</p>
          <p v-if="step.comment">{{ step.comment }}</p>
          <p v-if="step.adjustment_reason">{{ step.adjustment_reason }}</p></t-timeline-item
        ></t-timeline
      ><t-alert
        v-if="detail.execution_error"
        theme="error"
        :message="detail.execution_error"
      /><t-space v-permission.write="'personal.work_orders'"
        ><t-button v-if="detail.can_approve" @click="openApproval('approve')">{{
          t('budgetFlow.approve')
        }}</t-button
        ><t-button
          v-if="detail.can_approve"
          theme="danger"
          variant="outline"
          @click="openApproval('reject')"
          >{{ t('budgetFlow.reject') }}</t-button
        ><t-button v-if="detail.can_withdraw" theme="default" @click="withdrawing = detail">{{
          t('budgetFlow.withdraw')
        }}</t-button></t-space
      >
    </div>
  </t-drawer>
  <t-dialog
    :visible="Boolean(withdrawing)"
    :header="t('budgetFlow.withdrawTitle')"
    width="var(--cost-order-withdraw-width)"
    :confirm-btn="{ content: t('budgetFlow.confirm'), loading: saving }"
    :cancel-btn="t('budgetFlow.keep')"
    @close="withdrawing = null"
    @confirm="withdraw"
    ><p>{{ t('budgetFlow.withdrawHint', { number: withdrawing?.number }) }}</p></t-dialog
  >
  <t-dialog
    :visible="Boolean(approvalAction)"
    width="var(--cost-order-approval-width)"
    :header="t(approvalAction === 'approve' ? 'budgetFlow.approveTitle' : 'budgetFlow.rejectTitle')"
    :confirm-btn="{
      content: t(
        approvalAction === 'approve' ? 'budgetFlow.approveConfirm' : 'budgetFlow.rejectConfirm',
      ),
      loading: saving,
      theme: approvalAction === 'reject' ? 'danger' : 'primary',
    }"
    :cancel-btn="t('budgetFlow.cancel')"
    @close="approvalAction = ''"
    @confirm="approve"
  >
    <t-form class="order-form" label-align="top"
      ><p>
        {{ t(approvalAction === 'approve' ? 'budgetFlow.approveHint' : 'budgetFlow.rejectHint') }}
      </p>
      <section v-if="approvalAction === 'approve' && detail">
        <h4>{{ t('budgetFlow.quotaContext') }}</h4>
        <t-descriptions :column="2" layout="vertical"
          ><t-descriptions-item :label="t('budgetFlow.owner')"
            >{{ t(`budgetFlow.${detail.target}`) }} · {{ detail.project_name }}</t-descriptions-item
          ><t-descriptions-item :label="t('budgetFlow.requested')">{{
            money(detail.requested_amount)
          }}</t-descriptions-item
          ><t-descriptions-item :label="t('budgetFlow.current')">{{
            money(detail.budget_context.remaining)
          }}</t-descriptions-item></t-descriptions
        >
        <h4>{{ t('budgetFlow.adjustContent') }}</h4>
      </section>
      <template v-if="approvalAction === 'approve'"
        ><t-form-item :label="t('budgetFlow.approvedAmount')" required-mark
          ><t-input-number
            v-nonnegative-number
            v-model="approval.amount"
            :min="0.01"
            :max="detail?.approved_amount"
            :decimal-places="2"
            theme="normal"
          />
          <p class="hint">{{ t('budgetFlow.amountHint') }}</p></t-form-item
        ><t-form-item v-if="detail?.mode === 'TEMPORARY'" :label="t('budgetFlow.approvedUntil')"
          ><t-date-picker v-model="approval.valid_until" /></t-form-item
        ><t-form-item :label="t('budgetFlow.adjustmentReason')" :required-mark="adjusted"
          ><t-textarea
            v-model="approval.adjustment_reason"
            :maxlength="200" /></t-form-item></template
      ><t-form-item
        :label="t(approvalAction === 'reject' ? 'budgetFlow.rejectReason' : 'budgetFlow.comment')"
        :required-mark="approvalAction === 'reject'"
        ><t-textarea v-model="approval.comment" :maxlength="300" /></t-form-item
      ><t-alert v-if="formError" theme="error" :message="formError"
    /></t-form>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MessagePlugin,
  type PageInfo,
  type PrimaryTableCol,
  type TableRowData,
} from 'tdesign-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import {
  getBudgetWorkOrders,
  getBudgetWorkOrder,
  getBudgetApplicationOptions,
  createBudgetWorkOrder,
  approveBudgetWorkOrder,
  rejectBudgetWorkOrder,
  withdrawBudgetWorkOrder,
  type BudgetWorkOrder,
  type BudgetApplication,
  type BudgetApproval,
} from '@/api/modules/projectBudgets'
import { useCost } from '@/views/cost/useCost'
import { formatDate, formatDateTime } from '@/utils/datetime'
import '@/styles/cost.css'
import '@/styles/projects.css'
const { t, locale, money, error } = useCost()
const route = useRoute(),
  router = useRouter()
const tabs = ['mine', 'pending', 'processed']
const tab = ref('mine'),
  search = ref(''),
  status = ref(''),
  page = ref(1),
  pageSize = ref(20),
  total = ref(0),
  pendingCount = ref(0),
  loading = ref(false),
  saving = ref(false)
const items = ref<BudgetWorkOrder[]>([]),
  detail = ref<BudgetWorkOrder | null>(null),
  withdrawing = ref<BudgetWorkOrder | null>(null),
  creating = ref(false),
  formError = ref(''),
  approvalAction = ref('')
const options = ref<Awaited<ReturnType<typeof getBudgetApplicationOptions>>>()
const form = reactive<BudgetApplication>({
  target: 'PERSONAL',
  project_id: '',
  mode: 'PERMANENT',
  per_period_amount: 1000,
  valid_until: null,
  reason: '',
  first_approver_id: '',
})
const approval = reactive<BudgetApproval>({
  amount: 0,
  valid_until: null,
  adjustment_reason: '',
  comment: '',
  version: 0,
})
const selectedProject = computed(() =>
  options.value?.projects.find((p) => p.project.id === form.project_id),
)
const projectOptions = computed(
  () => options.value?.projects.map((p) => ({ value: p.project.id, label: p.project.name })) ?? [],
)
const periodCount = computed(() =>
  Math.max(
    1,
    (form.target === 'PROJECT'
      ? selectedProject.value?.periods
      : options.value?.personal_budget.periods
    )?.filter((p) => p.state !== 'ENDED').length ?? 1,
  ),
)
const available = computed(() =>
  form.target === 'PROJECT'
    ? (selectedProject.value?.current?.remaining ?? 0)
    : (options.value?.personal_budget.current?.remaining ??
      options.value?.personal_budget.remaining_amount ??
      0),
)
const base = computed(() =>
  form.target === 'PROJECT'
    ? (selectedProject.value?.current?.amount ?? 0)
    : (options.value?.personal_budget.current?.amount ??
      options.value?.personal_budget.effective_amount ??
      0),
)
const requested = computed(
  () =>
    Math.round(form.per_period_amount * (form.mode === 'PERMANENT' ? periodCount.value : 1) * 100) /
    100,
)
const preview = computed(() =>
  ['thisPeriod', 'nextPeriod', 'later'].map((key, index) => ({
    period: t(`budgetFlow.${key}`),
    before: money(base.value),
    after: money(
      base.value + (form.mode === 'PERMANENT' || index === 0 ? form.per_period_amount : 0),
    ),
  })),
)
const previewColumns = computed(() =>
  ['period', 'before', 'after'].map((colKey) => ({ colKey, title: t(`budgetFlow.${colKey}`) })),
)
const statuses = computed(() =>
  ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'].map((value) => ({
    value,
    label: t(`budgetFlow.${value}`),
  })),
)
const columns = computed<PrimaryTableCol<TableRowData>[]>(() =>
  (tab.value === 'pending'
    ? [
        ['number', 'number', 160],
        ['applicant', 'applicant', 180],
        ['content', 'content', 220],
        ['level', 'level', 110],
        ['created_at', 'created', 180],
        ['actions', 'actions', 150],
      ]
    : [
        ['number', 'number', 160],
        ['created_at', 'created', 180],
        ['content', 'content', 220],
        ['flow', 'flow', 160],
        ['handler', 'handler', 120],
        ['status', 'status', 110],
        ['updated_at', 'updated', 180],
        ['actions', 'actions', 130],
      ]
  ).map(([key, label, width]) => ({
    colKey: String(key),
    title: t(`budgetFlow.${label}`),
    minWidth: Number(width),
    ...(key === 'actions' ? { fixed: 'right' as const } : {}),
  })),
)
const adjusted = computed(
  () =>
    approval.amount !== detail.value?.approved_amount ||
    approval.valid_until !== detail.value?.approved_until,
)
const theme = (s: string) =>
  s === 'APPROVED'
    ? ('success' as const)
    : s === 'REJECTED'
      ? ('danger' as const)
      : s === 'PENDING'
        ? ('primary' as const)
        : ('default' as const)
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  try {
    const result = await getBudgetWorkOrders({
      page: page.value,
      page_size: pageSize.value,
      tab: tab.value,
      search: search.value,
      status: status.value,
    })
    if (current !== generation) return
    items.value = result.items
    total.value = result.total
    pendingCount.value = result.pending_count
  } catch (e) {
    error(e)
  } finally {
    if (current === generation) loading.value = false
  }
}
function firstPage() {
  page.value = 1
  void load()
}
function pageChange(p: PageInfo) {
  page.value = p.current
  pageSize.value = p.pageSize
  void load()
}
function reset() {
  search.value = ''
  status.value = ''
  firstPage()
}
async function openCreate() {
  try {
    options.value = await getBudgetApplicationOptions()
    Object.assign(form, {
      target: route.query.create === 'project-budget' ? 'PROJECT' : 'PERSONAL',
      project_id: String(route.query.projectId ?? ''),
      mode: 'PERMANENT',
      per_period_amount: 1000,
      valid_until: null,
      reason: '',
      first_approver_id: '',
    })
    formError.value = ''
    creating.value = true
  } catch (e) {
    error(e)
  }
}
function closeCreate() {
  creating.value = false
  if (route.query.create) void router.replace({ query: {} })
}
function invalidDate(date: Date) {
  const day = formatDate(date.toISOString())
  const end =
    form.target === 'PROJECT'
      ? selectedProject.value?.config?.end
      : options.value?.personal_budget.effective_end
  return day < formatDate(new Date().toISOString()) || Boolean(end && day > end)
}
async function submit() {
  if (
    !(form.per_period_amount > 0) ||
    !Number.isFinite(form.per_period_amount) ||
    !form.reason.trim() ||
    !form.first_approver_id ||
    (form.target === 'PROJECT' && !selectedProject.value) ||
    (form.mode === 'TEMPORARY' && (!form.valid_until || invalidDate(new Date(form.valid_until))))
  ) {
    formError.value = t('budgetFlow.validation')
    return
  }
  saving.value = true
  try {
    await createBudgetWorkOrder({
      ...form,
      valid_until: form.mode === 'TEMPORARY' ? form.valid_until : null,
    })
    closeCreate()
    void MessagePlugin.success(t('budgetFlow.submitted'))
    firstPage()
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
async function showDetail(id: string) {
  try {
    detail.value = await getBudgetWorkOrder(id)
  } catch (e) {
    error(e)
  }
}
async function withdraw() {
  if (!withdrawing.value) return
  saving.value = true
  try {
    const result = await withdrawBudgetWorkOrder(withdrawing.value.id, withdrawing.value.version)
    if (detail.value?.id === result.id) detail.value = result
    withdrawing.value = null
    void MessagePlugin.success(t('budgetFlow.withdrawn'))
    await load()
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
function openApproval(action: string) {
  if (!detail.value) return
  Object.assign(approval, {
    amount: detail.value.approved_amount,
    valid_until: detail.value.approved_until,
    adjustment_reason: '',
    comment: '',
    version: detail.value.version,
  })
  formError.value = ''
  approvalAction.value = action
}
async function approve() {
  if (!detail.value) return
  if (approvalAction.value === 'reject' && !approval.comment.trim()) {
    formError.value = t('budgetFlow.rejectRequired')
    return
  }
  if (approvalAction.value === 'approve' && adjusted.value && !approval.adjustment_reason.trim()) {
    formError.value = t('budgetFlow.adjustmentRequired')
    return
  }
  saving.value = true
  try {
    detail.value =
      approvalAction.value === 'approve'
        ? await approveBudgetWorkOrder(detail.value.id, { ...approval })
        : await rejectBudgetWorkOrder(detail.value.id, approval.comment, detail.value.version)
    void MessagePlugin.success(
      t(approvalAction.value === 'approve' ? 'budgetFlow.approved' : 'budgetFlow.rejected'),
    )
    approvalAction.value = ''
    await load()
  } catch (e) {
    error(e)
  } finally {
    saving.value = false
  }
}
watch(locale, load)
onMounted(async () => {
  await load()
  if (route.query.create) await openCreate()
})
</script>
<style scoped>
.orders :deep(.t-card__body),
.order-form {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.toolbar,
.approvers {
  display: flex;
  gap: var(--td-comp-margin-s);
  align-items: center;
  flex-wrap: wrap;
}
.toolbar > :deep(.t-input__wrap) {
  width: var(--cost-search-width);
}
.toolbar > :deep(.t-select__wrap) {
  width: var(--cost-filter-width);
}
.create {
  margin-inline-start: auto;
}
.order-form :deep(.t-form__item) {
  margin: 0;
}
.order-form :deep(.t-form__controls) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.order-form :deep(.t-radio-group) {
  display: flex;
  gap: var(--td-comp-margin-l);
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.budget-context {
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
}
.budget-context strong {
  display: block;
  font-size: var(--td-font-size-title-large);
  margin-top: var(--td-comp-margin-s);
}
h4,
p {
  margin: 0;
}
section {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
.approvers > * {
  flex: 1;
}
</style>
