<template>
  <div class="security-page">
    <t-tabs :value="type" @change="changeTab"
      ><t-tab-panel v-for="domain in domains" :key="domain" :value="domain" :label="label(domain)"
    /></t-tabs>
    <t-alert theme="info" :message="label(`allow_${type}`)" />
    <div class="security-workspace">
      <FilterBar class="security-filter-bar"
        ><template #content
          ><div class="security-filters">
            <t-input
              v-model="query.name"
              clearable
              :placeholder="label('allowlistName')"
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
        <t-button
          v-permission.write="permission"
          @click="((editing = undefined), (formVisible = true))"
          >{{ label('createAllowlist') }}</t-button
        ><t-button
          v-permission.write="permission"
          theme="default"
          :disabled="!selected.length"
          @click="askStatus(true)"
          >{{ label('enable') }}</t-button
        ><t-button
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
        :empty="label('emptyAllowlist')"
        table-layout="fixed"
        hover
        @select-change="select"
        @page-change="pageChange"
      >
        <template #name="{ row }"
          ><t-link theme="primary" @click="openForm(row)">{{ row.name }}</t-link></template
        ><template #type="{ row }">{{ label(row.type) }}</template
        ><template #conditions="{ row }">{{ allowSummary(row, rules) }}</template
        ><template #updatedAt="{ row }">{{ formatDateTime(row.updated_at) }}</template
        ><template #enabled="{ row }"
          ><t-switch
            v-if="canWrite"
            :value="row.enabled"
            :aria-label="`${label(row.enabled ? 'disable' : 'enable')} ${row.name}`"
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
              v-permission.write="permission"
              theme="danger"
              @click="pending = { kind: 'delete', ids: [row.id] }"
              >{{ label('delete') }}</t-link
            ></t-space
          ></template
        >
      </t-table>
    </div>
    <AllowlistForm
      v-if="formVisible"
      :type="type"
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
          ? label('deleteAllowHelp')
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
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin, type TableProps, type PageInfo } from 'tdesign-vue-next'
import {
  deleteAllowlist,
  listAllowlists,
  getAllRules,
  setAllowlistStatus,
  type Allowlist,
  type DetectionRule,
  type PolicyDomain,
  type SecurityQuery,
} from '@/api/modules/security'
import { canWriteResource, useUserStore } from '@/stores/modules/user'
import { formatDateTime } from '@/utils/datetime'
import FilterBar from '@/components/FilterBar.vue'
import AllowlistForm from '../components/AllowlistForm.vue'
import ConfirmAction from '../components/ConfirmAction.vue'
import { domains, useSecurity } from '../useSecurity'
const route = useRoute(),
  router = useRouter()
const { t, label, error, errorMessage, clearErrors, allowSummary, loadOptions } = useSecurity()
const permission = 'security.allowlists'
const canWrite = computed(() => canWriteResource(useUserStore().permissions, permission))
const type = computed<PolicyDomain>(() =>
  domains.includes(route.query.type as PolicyDomain)
    ? (route.query.type as PolicyDomain)
    : 'ACCESS_CONTROL',
)
const query = ref<SecurityQuery>({ page: 1, page_size: 20, name: '', enabled: '' }),
  total = ref(0),
  items = ref<Allowlist[]>([]),
  rules = ref<DetectionRule[]>([]),
  selected = ref<string[]>([]),
  loading = ref(false),
  busy = ref(false),
  formVisible = ref(false),
  editing = ref<Allowlist>()
const pending = ref<{ kind: 'delete' | 'status'; ids: string[]; enabled?: boolean }>()
const pagination = computed(() => ({
  current: query.value.page,
  pageSize: query.value.page_size,
  total: total.value,
  showJumper: true,
  pageSizeOptions: [10, 20, 50, 100],
}))
const columns = computed<TableProps['columns']>(() => [
  { colKey: 'row-select', type: 'multiple', width: 48 },
  { colKey: 'name', title: label('allowlistName'), width: 200 },
  { colKey: 'type', title: label('whitelistType'), width: 130 },
  { colKey: 'conditions', title: label('conditions'), width: 400, ellipsis: true },
  { colKey: 'updatedAt', title: label('updatedAt'), width: 180 },
  { colKey: 'enabled', title: label('status'), width: 85 },
  { colKey: 'operations', title: label('operations'), width: 140, fixed: 'right' },
])
let version = 0
async function load() {
  const token = ++version
  loading.value = true
  clearErrors()
  try {
    await loadOptions()
    const [list, ruleList] = await Promise.all([
      listAllowlists({ ...query.value, type: type.value }),
      getAllRules(),
    ])
    if (token !== version) return
    items.value = list.items
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
function search() {
  query.value.page = 1
  selected.value = []
  void load()
}
function reset() {
  query.value = { page: 1, page_size: 20, name: '', enabled: '' }
  selected.value = []
  void load()
}
function changeTab(value: string | number) {
  void router.replace({ query: value === 'ACCESS_CONTROL' ? {} : { type: value } })
}
function openForm(value: Allowlist) {
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
    if (pending.value.kind === 'delete') await deleteAllowlist(pending.value.ids[0]!, reason)
    else await setAllowlistStatus(pending.value.ids, !!pending.value.enabled, reason)
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
watch(
  type,
  () => {
    selected.value = []
    formVisible.value = false
    query.value = { page: 1, page_size: 20, name: '', enabled: '' }
    void load()
  },
  { immediate: true },
)
</script>
<style scoped>
@import '@/styles/security.css';
</style>
