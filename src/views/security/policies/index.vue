<template>
  <div class="security-page">
    <t-alert
      v-if="domain === 'SECURITY_DETECTION' && items.some((p) => !policyConfigured(p, rules))"
      theme="warning"
      :message="label('capabilityHelp')"
      ><template #operation
        ><t-link @click="showCapability = true">{{ label('configure') }}</t-link></template
      ></t-alert
    >
    <div class="security-workspace">
      <FilterBar class="security-filter-bar"
        ><template #content
          ><div class="security-filters">
            <t-input v-model="query.name" clearable :placeholder="label('name')" @change="search" />
            <t-input
              v-model="query.description"
              clearable
              :placeholder="label('description')"
              @change="search"
            />
            <t-input
              v-if="domain === 'AUDIT'"
              v-model="query.user"
              clearable
              :placeholder="label('userScope')"
              @change="search"
            />
            <t-input
              v-model="query.model"
              clearable
              :placeholder="label('model')"
              @change="search"
            />
            <t-input
              v-if="domain === 'AUDIT'"
              v-model="query.fields"
              clearable
              :placeholder="label('auditFields')"
              @change="search"
            />
            <t-select v-model="query.enabled" :options="statusOptions" @change="search" />
            <t-button theme="default" @click="reset">{{ label('reset') }}</t-button>
          </div></template
        ></FilterBar
      >
      <div class="security-toolbar">
        <t-button
          v-permission.write="permission"
          @click="((editing = undefined), (formVisible = true))"
          >{{ label(domain === 'AUDIT' ? 'createAudit' : 'createPolicy') }}</t-button
        >
        <t-button
          v-permission.write="permission"
          theme="default"
          :disabled="
            !selected.length ||
            loading ||
            selected.some(
              (id) =>
                !policyConfigured(
                  items.find((p) => p.id === id)!,
                  rules,
                ),
            )
          "
          @click="askStatus(true)"
          >{{ label('enable') }}</t-button
        >
        <t-button
          v-permission.write="permission"
          theme="default"
          :disabled="!selected.length"
          @click="askStatus(false)"
          >{{ label('disable') }}</t-button
        >
      </div>
      <t-alert v-if="errorMessage" theme="error" :message="errorMessage"
        ><template #operation
          ><t-link @click="load">{{ label('retry') }}</t-link></template
        ></t-alert
      >
      <t-table
        row-key="id"
        :data="items"
        :columns="columns"
        :loading="loading"
        :selected-row-keys="selected"
        :pagination="pagination"
        :empty="label(domain === 'ACCESS_CONTROL' ? 'emptyAccess' : 'empty')"
        table-layout="fixed"
        hover
        @select-change="select"
        @page-change="pageChange"
      >
        <template #priority="{ row }"
          ><span
            :draggable="canWrite && !(domain === 'AUDIT' && row.built_in)"
            class="security-drag"
            @dragstart="dragId = row.id"
            @dragover.prevent
            @drop.prevent="drop(row.id)"
            ><span v-if="canWrite && !(domain === 'AUDIT' && row.built_in)">⠿</span
            ><strong>{{ row.priority }}</strong></span
          ></template
        >
        <template #name="{ row }"
          ><t-link theme="primary" @click="view(row)">{{ name(row) }}</t-link></template
        >
        <template #description="{ row }">{{ description(row) || '—' }}</template>
        <template #enabled="{ row }"
          ><t-switch
            v-if="canWrite"
            :value="row.enabled"
            :disabled="loading || (!row.enabled && !policyConfigured(row, rules))"
            :title="!policyConfigured(row, rules) ? label('capabilityHelp') : undefined"
            :aria-label="`${label(row.enabled ? 'disable' : 'enable')} ${name(row)}`"
            @change="askStatus(!row.enabled, [row.id])"
          /><t-tag v-else :theme="row.enabled ? 'success' : 'default'">{{
            label(row.enabled ? 'enabled' : 'disabled')
          }}</t-tag></template
        >
        <template #user="{ row }">{{ scopeSummary(row.user_condition, true) }}</template>
        <template #environment="{ row }">{{
          environmentSummary(row.environment_condition)
        }}</template>
        <template #model="{ row }">{{ scopeSummary(row.target_model_condition) }}</template>
        <template #response="{ row }">{{
          label(row.response_detection_enabled ? 'on' : 'off')
        }}</template>
        <template #observation="{ row }">{{ label(row.observation_mode ? 'on' : 'off') }}</template>
        <template #configured="{ row }"
          ><t-tag :theme="policyConfigured(row, rules) ? 'success' : 'warning'">{{
            label(policyConfigured(row, rules) ? 'configured' : 'unconfigured')
          }}</t-tag></template
        >
        <template #actions="{ row }">{{
          row.detection_actions.map((a: DetectionAction) => actionSummary(a, rules)).join('；') ||
          '—'
        }}</template>
        <template #auditLevel="{ row }">{{ label(row.audit_level) }}</template>
        <template #auditFields="{ row }">{{
          [
            label('metadata'),
            ...(row.audit_level === 'FULL'
              ? auditFields.map(label)
              : row.audit_level === 'CUSTOM'
                ? row.audit_fields.map(label)
                : []),
          ].join('、')
        }}</template>
        <template #operations="{ row }"
          ><t-space
            ><t-link
              v-permission.write="permission"
              theme="primary"
              @click="((editing = row), (formVisible = true))"
              >{{ label('edit') }}</t-link
            ><t-link
              v-if="!row.built_in"
              v-permission.write="permission"
              theme="danger"
              @click="askDelete(row)"
              >{{ label('delete') }}</t-link
            ></t-space
          ></template
        >
      </t-table>
      <p v-if="selected.length" class="security-help">
        {{ t('security.selectedCount', { n: selected.length }) }}
      </p>
    </div>
    <PolicyForm
      v-if="formVisible"
      :domain="domain"
      :value="editing"
      :read-only="!canWrite"
      @close="formVisible = false"
      @saved="((formVisible = false), load())"
    />
    <ConfirmAction
      v-if="pending"
      :action="label(pending.kind === 'delete' ? 'delete' : pending.enabled ? 'enable' : 'disable')"
      :message="
        pending.kind === 'delete'
          ? label('deletePolicyHelp')
          : t('security.batchHelp', { n: pending.ids.length })
      "
      :busy="busy"
      :danger="pending.kind === 'delete'"
      @close="pending = undefined"
      @confirm="commit"
    />
    <CapabilityDialog v-if="showCapability" @close="showCapability = false" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessagePlugin, type TableProps, type PageInfo } from 'tdesign-vue-next'
import {
  deletePolicy,
  listPolicies,
  getAllRules,
  reorderPolicies,
  setPolicyStatus,
  type DetectionAction,
  type DetectionRule,
  type PolicyDomain,
  type SecurityPolicy,
  type SecurityQuery,
} from '@/api/modules/security'
import { policyConfigured } from '@/api/mock/security'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import FilterBar from '@/components/FilterBar.vue'
import PolicyForm from '../components/PolicyForm.vue'
import ConfirmAction from '../components/ConfirmAction.vue'
import CapabilityDialog from '../components/CapabilityDialog.vue'
import { auditFields, useSecurity } from '../useSecurity'
const props = defineProps<{ domain: PolicyDomain }>()
const {
  t,
  label,
  name,
  description,
  scopeSummary,
  environmentSummary,
  actionSummary,
  loadOptions,
  resolveDepartments,
  error,
  errorMessage,
  clearErrors,
} = useSecurity()
const permission = computed(
  () =>
    ({
      ACCESS_CONTROL: 'security.accessControl',
      DATA_CONTROL: 'security.dataControl',
      SECURITY_DETECTION: 'security.detection',
      AUDIT: 'security.audit',
    })[props.domain],
)
const canWrite = computed(() => canWriteResource(useUserStore().permissions, permission.value))
const items = ref<SecurityPolicy[]>([]),
  rules = ref<DetectionRule[]>([]),
  selected = ref<string[]>([]),
  loading = ref(false),
  busy = ref(false),
  formVisible = ref(false),
  showCapability = ref(false),
  editing = ref<SecurityPolicy>(),
  dragId = ref('')
const pending = ref<{ kind: 'status' | 'delete'; ids: string[]; enabled?: boolean }>()
const query = ref<SecurityQuery>({
  page: 1,
  page_size: 20,
  name: '',
  description: '',
  model: '',
  enabled: '',
})
const total = ref(0)
const pagination = computed(() => ({
  current: query.value.page,
  pageSize: query.value.page_size,
  total: total.value,
  showJumper: true,
  pageSizeOptions: [10, 20, 50, 100],
}))
const statusOptions = computed(() => [
  { value: '', label: label('allStatus') },
  { value: 'true', label: label('enabled') },
  { value: 'false', label: label('disabled') },
])
const columns = computed<TableProps['columns']>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  { colKey: 'priority', title: label('priority'), width: 85 },
  { colKey: 'name', title: label('name'), width: 210 },
  { colKey: 'enabled', title: label('status'), width: 85 },
  { colKey: 'description', title: label('description'), width: 220, ellipsis: true },
  ...(props.domain !== 'SECURITY_DETECTION'
    ? [{ colKey: 'user', title: label('userScope'), width: 160, ellipsis: true }]
    : []),
  ...(['ACCESS_CONTROL', 'DATA_CONTROL'].includes(props.domain)
    ? [{ colKey: 'environment', title: label('environment'), width: 180, ellipsis: true }]
    : []),
  { colKey: 'model', title: label('model'), width: 160, ellipsis: true },
  ...(props.domain === 'DATA_CONTROL'
    ? [{ colKey: 'response', title: label('responseDetection'), width: 130 }]
    : []),
  ...(props.domain === 'SECURITY_DETECTION'
    ? [{ colKey: 'configured', title: label('configStatus'), width: 160 }]
    : []),
  ...(['DATA_CONTROL', 'SECURITY_DETECTION'].includes(props.domain)
    ? [{ colKey: 'actions', title: label('actions'), width: 280, ellipsis: true }]
    : []),
  ...(props.domain !== 'AUDIT'
    ? [{ colKey: 'observation', title: label('observation'), width: 100 }]
    : [
        { colKey: 'auditLevel', title: label('auditLevel'), width: 120 },
        { colKey: 'auditFields', title: label('auditFields'), width: 300, ellipsis: true },
      ]),
  {
    colKey: 'operations',
    title: label('operations'),
    width: items.value.some((item) => !item.built_in) ? 140 : 80,
    fixed: 'right',
  },
])
let version = 0
async function load() {
  const token = ++version
  loading.value = true
  clearErrors()
  try {
    await loadOptions()
    const [list, ruleList] = await Promise.all([
      listPolicies(props.domain, query.value),
      getAllRules(),
    ])
    if (token !== version) return
    items.value = list.items
    await resolveDepartments(
      list.items.flatMap((p) =>
        p.user_condition.type === 'DEPARTMENTS' ? p.user_condition.values : [],
      ),
    )
    total.value = list.total
    rules.value = ruleList
    if (!items.value.length && total.value && query.value.page > 1) {
      query.value.page--
      return await load()
    }
  } catch (e) {
    if (token === version) error(e)
  } finally {
    if (token === version) loading.value = false
  }
}
function select(keys: (string | number)[]) {
  selected.value = keys.map(String)
}
function search() {
  query.value.page = 1
  selected.value = []
  void load()
}
function reset() {
  query.value = { page: 1, page_size: 20, name: '', description: '', model: '', enabled: '' }
  selected.value = []
  void load()
}
function pageChange(info: PageInfo) {
  query.value.page = info.current
  query.value.page_size = info.pageSize
  selected.value = []
  void load()
}
function askStatus(enabled: boolean, ids = selected.value) {
  pending.value = { kind: 'status', ids: [...ids], enabled }
}
function askDelete(p: SecurityPolicy) {
  pending.value = { kind: 'delete', ids: [p.id] }
}
function view(p: SecurityPolicy) {
  editing.value = p
  formVisible.value = true
}
async function commit(reason: string) {
  if (!pending.value) return
  busy.value = true
  try {
    if (pending.value.kind === 'delete')
      await deletePolicy(props.domain, pending.value.ids[0]!, reason)
    else await setPolicyStatus(props.domain, pending.value.ids, !!pending.value.enabled, reason)
    void MessagePlugin.success(label(pending.value.kind === 'delete' ? 'deleted' : 'changed'))
    pending.value = undefined
    selected.value = []
    await load()
  } catch (e) {
    error(e)
  } finally {
    busy.value = false
  }
}
async function drop(target: string) {
  if (!canWrite.value || !dragId.value || target === dragId.value) return
  const list = items.value.filter((p) => !(props.domain === 'AUDIT' && p.built_in))
  const from = list.findIndex((p) => p.id === dragId.value),
    to = list.findIndex((p) => p.id === target)
  dragId.value = ''
  if (from < 0 || to < 0) return
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved!)
  try {
    await reorderPolicies(
      props.domain,
      list.map((p) => p.id),
    )
    void MessagePlugin.success(label('reordered'))
    await load()
  } catch (e) {
    error(e)
  }
}
watch(
  () => props.domain,
  () => {
    selected.value = []
    query.value = { page: 1, page_size: 20, name: '', description: '', model: '', enabled: '' }
    formVisible.value = false
    void load()
  },
  { immediate: true },
)
</script>
<style scoped>
@import '@/styles/security.css';
</style>
