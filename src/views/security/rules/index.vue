<template>
  <div class="security-rule-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <CollapsibleSidebar
      v-model="sidebarCollapsed"
      class="security-categories"
      :aria-label="label('category')"
    >
      <t-button
        class="security-category"
        :class="{ 'is-selected': category === '' }"
        variant="text"
        theme="default"
        @click="setCategory('')"
        ><span>{{ label('allRules') }}</span
        ><span class="security-category-count">{{ all.length }}</span></t-button
      >
      <template v-for="group in treeGroups" :key="group.value">
        <div class="security-category-row">
          <t-button
            variant="text"
            theme="default"
            :aria-label="
              label(expanded.includes(group.value) ? 'collapse' : 'expand') + ' ' + group.label
            "
            :aria-expanded="expanded.includes(group.value)"
            @click="toggleGroup(group.value)"
            >{{ expanded.includes(group.value) ? '▾' : '▸' }}</t-button
          >
          <t-button
            class="security-category"
            :class="{ 'is-selected': category === group.value }"
            variant="text"
            theme="default"
            @click="setCategory(group.value)"
            ><span>{{ group.label }}</span
            ><span class="security-category-count">{{ group.count }}</span></t-button
          >
        </div>
        <template v-if="expanded.includes(group.value)">
          <t-button
            v-for="child in group.children"
            :key="child.value"
            class="security-category security-category-child"
            :class="{ 'is-selected': category === child.value }"
            variant="text"
            theme="default"
            @click="setCategory(child.value)"
            ><span>{{ child.label }}</span
            ><span class="security-category-count">{{ child.count }}</span></t-button
          >
        </template>
      </template>
    </CollapsibleSidebar>
    <div class="security-workspace">
      <t-select
        class="security-categories--mobile"
        :value="category"
        :options="groupOptions"
        @change="setCategory(String($event))"
      />
      <FilterBar class="security-filter-bar"
        ><template #content
          ><div class="security-filters">
            <t-input
              v-model="query.name"
              clearable
              :placeholder="label('ruleName')"
              @change="search"
            /><t-select
              v-model="query.direction"
              :options="[
                { value: '', label: label('allDirections') },
                ...choices(['INPUT', 'OUTPUT', 'BOTH']),
              ]"
              @change="search"
            /><t-select
              v-model="query.built_in"
              :options="[
                { value: '', label: label('allSources') },
                { value: 'true', label: label('builtIn') },
                { value: 'false', label: label('custom') },
              ]"
              @change="search"
            /><t-select
              v-model="query.enabled"
              :options="[
                { value: '', label: label('allStatus') },
                { value: 'true', label: label('enabled') },
                { value: 'false', label: label('disabled') },
              ]"
              @change="search"
            /><t-button theme="default" @click="reset">{{ label('reset') }}</t-button>
          </div></template
        ></FilterBar
      >
      <div class="security-toolbar">
        <t-button v-permission.write="permission" @click="createRule">{{
          label('createRule')
        }}</t-button
        ><t-button
          v-permission.write="permission"
          theme="default"
          :disabled="
            !selected.length ||
            loading ||
            selected.some((id) => !ruleCanEnable(items.find((r) => r.id === id)!))
          "
          @click="askStatus(true)"
          >{{ label('enable') }}</t-button
        ><t-button
          v-permission.write="permission"
          theme="default"
          :disabled="!selected.length"
          @click="askStatus(false)"
          >{{ label('disable') }}</t-button
        ><span class="security-spacer" /><template v-if="!security"
          ><t-button
            v-permission.write="permission"
            theme="default"
            @click="router.push({ query: { tab: 'discovery', source: 'upload' } })"
            >{{ label('sampleAnalysis') }}</t-button
          ><t-button v-permission.write="permission" theme="default" @click="showImport = true">{{
            label('import')
          }}</t-button
          ><t-button theme="default" :loading="exporting" @click="exportCsv">{{
            label('export')
          }}</t-button></template
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
        :empty="label('empty')"
        table-layout="fixed"
        hover
        @select-change="select"
        @page-change="pageChange"
      >
        <template #name="{ row }"
          ><t-link theme="primary" @click="openForm(row)">{{ name(row) }}</t-link></template
        ><template #category="{ row }">{{ label(row.engine_type) }}</template
        ><template #subCategory="{ row }">{{
          security
            ? row.built_in
              ? name(row)
              : row.sub_category || '—'
            : label(row.sub_category || row.category)
        }}</template
        ><template #direction="{ row }">{{ label(row.direction) }}</template
        ><template #method="{ row }">{{
          row.config.detection_method.map(label).join('、')
        }}</template
        ><template #level="{ row }"
          ><t-tag
            :theme="
              (security ? row.risk_level === 'HIGH' : row.sensitivity_level === 'CORE')
                ? 'danger'
                : 'warning'
            "
            variant="light"
            >{{ label(security ? row.risk_level : row.sensitivity_level) }}</t-tag
          ></template
        ><template #source="{ row }">{{ label(row.built_in ? 'builtIn' : 'custom') }}</template
        ><template #enabled="{ row }"
          ><t-switch
            v-if="canWrite"
            :value="row.enabled"
            :disabled="loading || (!row.enabled && !ruleCanEnable(row))"
            :title="!ruleCanEnable(row) ? label('basicTestRequired') : undefined"
            :aria-label="`${label(row.enabled ? 'disable' : 'enable')} ${name(row)}`"
            @change="askStatus(!row.enabled, [row.id])"
          /><span v-else>{{ label(row.enabled ? 'enabled' : 'disabled') }}</span></template
        ><template #operations="{ row }"
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
              @click="pending = { kind: 'delete', ids: [row.id] }"
              >{{ label('delete') }}</t-link
            ></t-space
          ></template
        >
      </t-table>
    </div>
    <DocumentRuleForm
      v-if="formVisible && editing?.rule_type === 'DOCUMENT_PATTERN'"
      :value="editing"
      :read-only="!canWrite"
      @close="formVisible = false"
      @saved="documentSaved"
    />
    <t-dialog
      v-if="chooseType"
      :visible="true"
      :header="label('createRule')"
      :confirm-btn="null"
      :cancel-btn="label('cancel')"
      @close="chooseType = false"
      ><div class="security-stack">
        <t-button theme="default" @click="newRule(false)">{{ label('fieldRules') }}</t-button
        ><t-button theme="default" @click="newRule(true)">{{ label('documentRules') }}</t-button>
      </div></t-dialog
    >
    <RuleForm
      v-if="formVisible && editing?.rule_type !== 'DOCUMENT_PATTERN'"
      :security="security"
      :value="editing"
      :read-only="!canWrite"
      @close="formVisible = false"
      @saved="((formVisible = false), (selected = []), load())"
    />
    <RuleSaved v-if="savedRule" :rule="savedRule" @close="savedRule = undefined" />
    <RuleImport
      v-if="showImport"
      @close="showImport = false"
      @saved="((showImport = false), load())"
    />
    <ConfirmAction
      v-if="pending"
      :action="label(pending.kind === 'delete' ? 'delete' : pending.enabled ? 'enable' : 'disable')"
      :message="
        pending.kind === 'delete'
          ? label('deleteRuleHelp')
          : t('security.batchHelp', { n: pending.ids.length })
      "
      :busy="busy"
      :danger="pending.kind === 'delete'"
      @close="pending = undefined"
      @confirm="commit"
    />
  </div>
</template>
<script setup lang="ts">
import CollapsibleSidebar from '@/components/CollapsibleSidebar.vue'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ruleCanEnable } from '@/api/mock/security'
import { documentKinds, documentRule } from '@/api/mock/securityDocument'
import DocumentRuleForm from '../components/DocumentRuleForm.vue'
import RuleSaved from '../components/RuleSaved.vue'
const sidebarCollapsed = ref(false)
const savedRule = ref<DetectionRule>()
import { MessagePlugin, type TableProps, type PageInfo } from 'tdesign-vue-next'
import {
  deleteRule,
  exportRules,
  listRules,
  getAllRules,
  setRuleStatus,
  type DetectionRule,
  type SecurityQuery,
} from '@/api/modules/security'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import FilterBar from '@/components/FilterBar.vue'
import RuleForm from '../components/RuleForm.vue'
import RuleImport from '../components/RuleImport.vue'
import ConfirmAction from '../components/ConfirmAction.vue'
import { engines, useSecurity } from '../useSecurity'
import { downloadCsv, ruleHeaders } from './files'
const router = useRouter()
const chooseType = ref(false)
const expanded = ref<string[]>(['FIELD', 'DOCUMENT_PATTERN'])
const props = defineProps<{ security?: boolean }>()
const { t, label, choices, name, error, errorMessage, clearErrors, loadOptions } = useSecurity()
const permission = computed(() => (props.security ? 'security.detection' : 'security.dataControl'))
const canWrite = computed(() => canWriteResource(useUserStore().permissions, permission.value))
const category = ref(''),
  items = ref<DetectionRule[]>([]),
  all = ref<DetectionRule[]>([]),
  selected = ref<string[]>([]),
  total = ref(0),
  loading = ref(false),
  busy = ref(false),
  formVisible = ref(false),
  showImport = ref(false),
  exporting = ref(false),
  editing = ref<DetectionRule>()
const query = ref<SecurityQuery>({
  page: 1,
  page_size: 20,
  name: '',
  direction: '',
  enabled: '',
  built_in: '',
})
const pending = ref<{ kind: 'delete' | 'status'; ids: string[]; enabled?: boolean }>()
const params = computed(() => ({
  ...query.value,
  rule_domain: props.security ? 'SECURITY_DETECTION' : 'DATA_LEAKAGE',
  ...(props.security
    ? { engine_type: category.value.split(':')[0], sub_category: category.value.split(':')[1] }
    : { rule_type: category.value.split(':')[0], sub_category: category.value.split(':')[1] }),
}))
const treeGroups = computed(() =>
  (props.security ? engines : ['FIELD', 'DOCUMENT_PATTERN']).map((value) => {
    const rules = all.value.filter((r) => (props.security ? r.engine_type : r.rule_type) === value)
    const keys = props.security
      ? [...new Set(rules.map((r) => r.sub_category))]
      : value === 'FIELD'
        ? [
            ...new Set([
              'PII',
              'FINANCE',
              'INTERNAL',
              'CREDENTIAL',
              'SOURCE_CODE',
              ...rules.map((r) => r.sub_category).filter(Boolean),
            ]),
          ]
        : [...new Set([...documentKinds, ...rules.map((r) => r.sub_category).filter(Boolean)])]
    return {
      value,
      label: label(
        value === 'FIELD' ? 'fieldRules' : value === 'DOCUMENT_PATTERN' ? 'documentRules' : value,
      ),
      count: rules.length,
      children: keys.map((sub) => ({
        value: `${value}:${sub}`,
        label: props.security ? name(rules.find((r) => r.sub_category === sub)!) : label(sub),
        count: rules.filter((r) => r.sub_category === sub).length,
      })),
    }
  }),
)
const groupOptions = computed(() => [
  { value: '', label: label('allRules') },
  ...treeGroups.value.flatMap((g) => [{ value: g.value, label: g.label }, ...g.children]),
])
function toggleGroup(value: string) {
  expanded.value = expanded.value.includes(value)
    ? expanded.value.filter((v) => v !== value)
    : [...expanded.value, value]
}
function documentSaved(rule: DetectionRule) {
  formVisible.value = false
  savedRule.value = rule
  void load()
}
function createRule() {
  if (props.security) {
    editing.value = undefined
    formVisible.value = true
  } else chooseType.value = true
}
function newRule(document: boolean) {
  chooseType.value = false
  editing.value = document ? documentRule(2) : undefined
  if (editing.value) {
    editing.value.name = ''
    editing.value.config.identification_guide = {
      summary: '',
      key_indicators: [],
      supporting_indicators: [],
      structural_hints: [],
      decision_guidance: '',
    }
    editing.value.config.negative_guide = ''
  }
  formVisible.value = true
}
const pagination = computed(() => ({
  current: query.value.page,
  pageSize: query.value.page_size,
  total: total.value,
  showJumper: true,
  pageSizeOptions: [10, 20, 50, 100],
}))
const columns = computed<TableProps['columns']>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  { colKey: 'name', title: label('ruleName'), width: 220 },
  ...(props.security ? [{ colKey: 'category', title: label('category'), width: 130 }] : []),
  { colKey: 'subCategory', title: label('subCategory'), width: 170 },
  { colKey: 'direction', title: label('direction'), width: 95 },
  { colKey: 'method', title: label('method'), width: 160 },
  { colKey: 'level', title: label(props.security ? 'risk' : 'sensitivity'), width: 100 },
  { colKey: 'source', title: label('source'), width: 110 },
  { colKey: 'enabled', title: label('status'), width: 85 },
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
    const [list, full] = await Promise.all([
      listRules(params.value),
      getAllRules({ rule_domain: params.value.rule_domain }),
    ])
    if (token !== version) return
    items.value = list.items
    total.value = list.total
    all.value = full
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
function search() {
  query.value.page = 1
  selected.value = []
  void load()
}
function setCategory(value: string) {
  category.value = value
  search()
}
function reset() {
  category.value = ''
  query.value = { page: 1, page_size: 20, name: '', direction: '', enabled: '', built_in: '' }
  selected.value = []
  void load()
}
function openForm(value: DetectionRule) {
  editing.value = value
  formVisible.value = true
}
function select(keys: (string | number)[]) {
  selected.value = keys.map(String)
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
async function commit(reason: string) {
  if (!pending.value) return
  busy.value = true
  try {
    if (pending.value.kind === 'delete') await deleteRule(pending.value.ids[0]!, reason)
    else await setRuleStatus(pending.value.ids, !!pending.value.enabled, reason)
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
async function exportCsv() {
  exporting.value = true
  try {
    const rows = await exportRules(params.value, selected.value)
    if (!rows.length) {
      void MessagePlugin.warning(label('csvFieldsOnly'))
      return
    }
    downloadCsv(
      'sensitive-field-rules.csv',
      ruleHeaders,
      rows.map((r) => [
        name(r),
        r.rule_type,
        r.category,
        r.sub_category,
        r.direction,
        r.config.detection_method[0],
        r.config.patterns.join('\n'),
        r.config.keywords.join('|'),
        r.config.entity_type,
        r.config.field_description,
        r.config.threshold,
        r.config.match_threshold,
        JSON.stringify(r.config.mask_config),
        r.sensitivity_level,
        String(r.enabled),
        r.description,
      ]),
    )
  } catch (e) {
    error(e)
  } finally {
    exporting.value = false
  }
}
watch(
  () => props.security,
  () => {
    selected.value = []
    category.value = ''
    void load()
  },
  { immediate: true },
)
</script>
<style scoped>
@import '@/styles/security.css';
</style>
