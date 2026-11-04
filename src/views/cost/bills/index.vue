<template>
  <t-card :bordered="false" class="bill-page">
    <t-tabs v-model="tab" @change="reset"
      ><t-tab-panel value="bills" :label="t('cost.bills')" /><t-tab-panel
        value="tasks"
        :label="t('cost.tasks')"
    /></t-tabs>
    <FilterBar class="filters"
      ><template #content
        ><div class="toolbar">
          <template v-if="tab === 'bills'">
            <t-select
              v-model="periodType"
              :options="periodOptions"
              :placeholder="t('cost.allPeriods')"
              clearable
              @change="loadFirst"
            />
            <t-select
              v-model="periodValue"
              :options="monthOptions"
              :placeholder="t('cost.allTime')"
              clearable
              @change="loadFirst"
            />
          </template>
          <DepartmentSelect v-model="departmentId" @change="loadFirst" />
          <t-select
            v-if="tab === 'tasks'"
            v-model="status"
            :placeholder="t('cost.allStatus')"
            :options="taskStatusOptions"
            clearable
            @change="loadFirst"
          />
          <t-button theme="default" variant="text" @click="reset">{{ t('cost.reset') }}</t-button>
          <t-button v-permission.write="'cost.bills'" class="primary-action" @click="openForm()">{{
            t(tab === 'bills' ? 'cost.generate' : 'cost.newTask')
          }}</t-button>
        </div></template
      ></FilterBar
    >
    <t-table
      v-if="tab === 'bills'"
      row-key="id"
      :data="bills"
      :columns="billColumns"
      :loading="loading"
      :pagination="pagination"
      @page-change="pageChange"
    >
      <template #period="{ row }"
        ><t-link theme="primary" :disabled="row.status === 'GENERATING'" @click="detail = row"
          >{{ row.period_start }} ~ {{ row.period_end }}</t-link
        ></template
      >
      <template #period_type="{ row }"
        ><t-tag variant="light">{{ t(`cost.${row.period_type}`) }}</t-tag></template
      >
      <template #department_id="{ row }">{{
        t('cost.range', { name: deptName(row.department_id) })
      }}</template>
      <template #total_cost="{ row }"
        ><strong>{{ money(row.total_cost, row.currency) }}</strong></template
      >
      <template #tokens="{ row }">{{
        tokens(row.total_input_tokens + row.total_output_tokens)
      }}</template>
      <template #total_requests="{ row }">{{ number(row.total_requests) }}</template>
      <template #status="{ row }"
        ><t-tag :theme="statusTheme(row.status)" variant="light">{{
          t(`cost.${row.status}`)
        }}</t-tag></template
      >
      <template #generated_at="{ row }">{{ formatDateTime(row.generated_at) }}</template>
      <template #actions="{ row }"
        ><t-space
          ><t-link
            v-permission.write="'cost.bills'"
            theme="primary"
            :disabled="row.status === 'GENERATING'"
            @click="regenerate(row)"
            >{{ t('cost.regenerate') }}</t-link
          ><t-link
            theme="primary"
            :disabled="row.status !== 'COMPLETED' || exporting === row.id"
            @click="exportAll(row)"
            >{{ t('cost.exportBill') }}</t-link
          ></t-space
        ></template
      >
    </t-table>
    <t-table
      v-else
      row-key="id"
      :data="tasks"
      :columns="taskColumns"
      :loading="loading"
      :pagination="pagination"
      @page-change="pageChange"
    >
      <template #period_type="{ row }">{{ t(`cost.${row.period_type}`) }}</template>
      <template #department_id="{ row }">{{
        t('cost.range', { name: deptName(row.department_id) })
      }}</template>
      <template #email_enabled="{ row }">{{
        row.email_enabled ? row.email_recipients.join(', ') : '—'
      }}</template>
      <template #status="{ row }"
        ><t-tag :theme="statusTheme(row.status)" variant="light">{{
          t(`cost.${row.status}`)
        }}</t-tag></template
      >
      <template #next_run_at="{ row }">{{
        row.next_run_at ? formatDateTime(row.next_run_at) : '—'
      }}</template>
      <template #created_at="{ row }">{{ formatDateTime(row.created_at) }}</template>
      <template #actions="{ row }"
        ><t-space v-permission.write="'cost.bills'"
          ><t-link theme="primary" @click="openForm(row)">{{ t('cost.edit') }}</t-link
          ><t-link theme="primary" @click="toggleTask(row)">{{
            t(row.status === 'ACTIVE' ? 'cost.disable' : 'cost.enable')
          }}</t-link
          ><t-link theme="danger" @click="openDelete(row)">{{ t('cost.delete') }}</t-link></t-space
        ></template
      >
    </t-table>
    <t-dialog
      v-model:visible="formVisible"
      :header="t(tab === 'bills' ? 'cost.manual' : editing ? 'cost.editTask' : 'cost.newTask')"
      width="var(--cost-dialog-width)"
      :confirm-btn="{
        content: t(tab === 'bills' ? 'cost.generateNow' : 'cost.saveTask'),
        loading: saving,
      }"
      :cancel-btn="t('cost.cancel')"
      @confirm="submit"
    >
      <t-form label-align="top" class="form">
        <t-form-item :label="t(tab === 'bills' ? 'cost.period' : 'cost.schedule')" required
          ><t-radio-group v-model="form.period_type" :options="periodOptions"
        /></t-form-item>
        <template v-if="tab === 'bills'"
          ><t-form-item
            :label="t(form.period_type === 'MONTHLY' ? 'cost.month' : 'cost.date')"
            required
            ><t-date-picker
              v-model="form.period_value"
              :mode="form.period_type === 'MONTHLY' ? 'month' : 'date'"
              :format="form.period_type === 'MONTHLY' ? 'YYYY-MM' : 'YYYY-MM-DD'"
              :value-type="
                form.period_type === 'MONTHLY' ? 'YYYY-MM' : 'YYYY-MM-DD'
              " /></t-form-item
        ></template>
        <p v-else class="hint">{{ t('cost.scheduleHint') }}</p>
        <t-form-item :label="t('cost.departmentScope')" required
          ><DepartmentSelect
            v-model="form.department_id"
            :searchable="false"
            :clearable="false"
            :placeholder="t('cost.selectDepartment')"
        /></t-form-item>
        <p class="hint">{{ t('cost.scopeHint') }}</p>
        <p v-if="tab === 'bills'" class="hint">{{ t('cost.manualHint') }}</p>
        <template v-else
          ><t-form-item :label="t('cost.emailEnabled')"
            ><t-checkbox v-model="form.email_enabled">{{
              t('cost.emailSend')
            }}</t-checkbox></t-form-item
          ><t-form-item v-if="form.email_enabled" :label="t('cost.recipients')" required
            ><t-textarea v-model="form.emails" :placeholder="t('cost.emailHint')" /></t-form-item
        ></template>
        <t-alert v-if="formError" theme="error" :message="formError" />
      </t-form>
    </t-dialog>
    <t-dialog
      :visible="Boolean(deleting)"
      :header="t('cost.delete')"
      :confirm-btn="{ content: t('cost.confirm'), theme: 'danger', loading: saving }"
      :cancel-btn="t('cost.cancel')"
      @close="deleting = null"
      @confirm="removeTask"
    >
      <div class="form">
        <p>{{ t('cost.taskDelete') }}</p>
        <t-textarea v-model="reason" :placeholder="t('cost.reason')" /><t-alert
          v-if="formError"
          theme="error"
          :message="formError"
        />
      </div>
    </t-dialog>
    <BillDetail :bill="detail" @close="detail = null" />
  </t-card>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  MessagePlugin,
  type PageInfo,
  type PrimaryTableCol,
  type TableRowData,
} from 'tdesign-vue-next'
import {
  getBills,
  generateBill,
  getBillTasks,
  saveBillTask,
  setBillTaskStatus,
  deleteBillTask,
  exportBill,
  type Bill,
  type BillTask,
  type PeriodType,
  type Dimension,
} from '@/api/modules/cost'
import { formatDateTime } from '@/utils/datetime'
import FilterBar from '@/components/FilterBar.vue'
import DepartmentSelect from '../DepartmentSelect.vue'
import { useCost } from '../useCost'
import BillDetail from './BillDetail.vue'
import { downloadBlob } from './download'
import '@/styles/cost.css'
const {
  t,
  locale,
  init,
  scope,
  ensureDepartments,
  deptName,
  money,
  tokens,
  number,
  statusTheme,
  error,
} = useCost()
const tab = ref('bills'),
  periodType = ref(''),
  periodValue = ref(''),
  departmentId = ref(''),
  status = ref('')
const bills = ref<Bill[]>([]),
  tasks = ref<BillTask[]>([]),
  loading = ref(false),
  detail = ref<Bill | null>(null)
const page = ref(1),
  pageSize = ref(20),
  total = ref(0),
  exporting = ref('')
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showJumper: true,
  pageSizeOptions: [10, 20, 50, 100],
}))
const periodOptions = computed(() =>
  ['MONTHLY', 'WEEKLY'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
const taskStatusOptions = computed(() =>
  ['ACTIVE', 'DISABLED'].map((value) => ({ value, label: t(`cost.${value}`) })),
)
const monthOptions = computed(() =>
  Array.from({ length: 18 }, (_, i) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - i)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { value, label: value }
  }),
)
const billColumns = computed<PrimaryTableCol<TableRowData>[]>(() =>
  [
    ['period', 'period', 220],
    ['period_type', 'periodType', 100],
    ['department_id', 'departmentScope', 160],
    ['total_cost', 'amount', 140],
    ['tokens', 'tokens', 110],
    ['total_requests', 'requests', 100],
    ['status', 'status', 100],
    ['generated_at', 'generated', 180],
    ['actions', 'actions', 180],
  ].map(([colKey, label, minWidth]) => ({
    colKey: String(colKey),
    title: t(`cost.${label}`),
    minWidth: Number(minWidth),
    ...(colKey === 'actions' ? { fixed: 'right' as const } : {}),
  })),
)
const taskColumns = computed<PrimaryTableCol<TableRowData>[]>(() =>
  [
    ['period_type', 'schedule', 140],
    ['department_id', 'departmentScope', 160],
    ['email_enabled', 'emailEnabled', 180],
    ['status', 'status', 100],
    ['next_run_at', 'nextRun', 180],
    ['created_at', 'createdAt', 180],
    ['actions', 'actions', 180],
  ].map(([colKey, label, minWidth]) => ({
    colKey: String(colKey),
    title: t(`cost.${label}`),
    minWidth: Number(minWidth),
  })),
)
let version = 0,
  poll: ReturnType<typeof setTimeout> | undefined
async function load() {
  const current = ++version
  clearTimeout(poll)
  loading.value = true
  try {
    const params = {
      page: page.value,
      page_size: pageSize.value,
      period_type: periodType.value,
      period_value: periodValue.value,
      department_id: departmentId.value,
      status: status.value,
    }
    const result = tab.value === 'bills' ? await getBills(params) : await getBillTasks(params)
    if (current !== version) return
    total.value = result.total
    await ensureDepartments(result.items.map((r) => r.department_id))
    if (current !== version) return
    if (tab.value === 'bills') {
      bills.value = result.items as Bill[]
      if (bills.value.some((b) => b.status === 'GENERATING')) poll = setTimeout(load, 800)
    } else tasks.value = result.items as BillTask[]
    if (page.value > 1 && !result.items.length) {
      page.value--
      void load()
    }
  } catch (err) {
    error(err)
  } finally {
    if (current === version) loading.value = false
  }
}
function loadFirst() {
  page.value = 1
  void load()
}
function reset() {
  periodType.value = ''
  periodValue.value = ''
  departmentId.value = ''
  status.value = ''
  loadFirst()
}
function pageChange(info: PageInfo) {
  page.value = info.current
  pageSize.value = info.pageSize
  void load()
}
const formVisible = ref(false),
  editing = ref<BillTask | null>(null),
  saving = ref(false),
  formError = ref(''),
  deleting = ref<BillTask | null>(null),
  reason = ref('')
const form = reactive({
  period_type: 'MONTHLY' as PeriodType,
  period_value: '',
  department_id: '',
  email_enabled: false,
  emails: '',
})
function openDelete(task: BillTask) {
  deleting.value = task
  reason.value = ''
}
function openForm(task?: BillTask) {
  editing.value = task ?? null
  formError.value = ''
  Object.assign(form, {
    period_type: task?.period_type ?? 'MONTHLY',
    period_value: monthOptions.value[0]?.value ?? '',
    department_id: task?.department_id ?? scope.root,
    email_enabled: task?.email_enabled ?? false,
    emails: task?.email_recipients.join(', ') ?? '',
  })
  formVisible.value = true
}
watch(
  () => form.period_type,
  (value) => {
    form.period_value =
      value === 'MONTHLY'
        ? (form.period_value || '').slice(0, 7)
        : `${(form.period_value || '').slice(0, 7)}-01`
  },
)
async function submit() {
  const emails = form.emails
    .split(/[,，;；\n]/)
    .map((e) => e.trim())
    .filter(Boolean)
  if (
    !form.department_id ||
    (tab.value === 'bills' && !form.period_value) ||
    (tab.value === 'tasks' &&
      form.email_enabled &&
      (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
  ) {
    formError.value = t('cost.validation')
    return
  }
  saving.value = true
  try {
    if (tab.value === 'bills')
      await generateBill({
        period_type: form.period_type,
        period_value: form.period_value,
        department_id: form.department_id,
      })
    else
      await saveBillTask(
        {
          period_type: form.period_type,
          department_id: form.department_id,
          email_enabled: form.email_enabled,
          email_recipients: [...new Set(emails)],
        },
        editing.value?.id,
      )
    formVisible.value = false
    void MessagePlugin.success(t(tab.value === 'bills' ? 'cost.generatedHint' : 'cost.saved'))
    loadFirst()
  } catch (err) {
    error(err)
  } finally {
    saving.value = false
  }
}
async function regenerate(bill: Bill) {
  try {
    await generateBill({
      period_type: bill.period_type,
      period_value: bill.period_start,
      department_id: bill.department_id,
    })
    await load()
  } catch (err) {
    error(err)
  }
}
async function toggleTask(task: BillTask) {
  try {
    await setBillTaskStatus(task.id, task.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')
    await load()
  } catch (err) {
    error(err)
  }
}
async function removeTask() {
  if (!reason.value.trim()) {
    formError.value = t('cost.reasonRequired')
    return
  }
  saving.value = true
  try {
    await deleteBillTask(deleting.value!.id, reason.value)
    deleting.value = null
    await load()
  } catch (err) {
    error(err)
  } finally {
    saving.value = false
  }
}
async function exportAll(bill: Bill) {
  exporting.value = bill.id
  try {
    for (const dimension of ['PROVIDER', 'DEPARTMENT', 'USER', 'MODEL'] as Dimension[])
      downloadBlob(await exportBill(bill.id, dimension), `${bill.period_start}-${dimension}.csv`)
  } catch (err) {
    error(err)
  } finally {
    exporting.value = ''
  }
}
watch(locale, load)
watch(deleting, () => {
  formError.value = ''
})
onMounted(async () => {
  try {
    await init()
    await load()
  } catch (err) {
    error(err)
  }
})
onBeforeUnmount(() => {
  version++
  clearTimeout(poll)
})
</script>
<style scoped>
.bill-page :deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.filters {
  margin: 0;
}
.filters :deep(.t-card__body) {
  padding: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--td-comp-margin-s);
}
.toolbar > :deep(.t-select__wrap),
.toolbar > :deep(.t-tree-select) {
  width: var(--cost-filter-width);
}
.primary-action {
  margin-inline-start: auto;
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-l);
}
.form :deep(.t-form__item) {
  margin: 0;
}
.hint {
  color: var(--td-text-color-secondary);
  margin: 0;
  font-size: var(--td-font-size-body-small);
}
.form :deep(.t-tree-select) {
  width: 100%;
}
</style>
