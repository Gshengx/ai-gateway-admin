<template>
  <t-dialog
    :visible="visible"
    :header="t('logicalModels.mountDialogTitle')"
    width="80%"
    :confirm-btn="{
      content: t('logicalModels.confirmMount'),
      loading: busy,
      disabled: !selection.length || loading,
    }"
    :cancel-btn="{ content: t('logicalModels.cancel'), disabled: busy }"
    :close-btn="!busy"
    :close-on-overlay-click="!busy"
    :close-on-esc-keydown="!busy"
    @close="close"
    @confirm="submit"
  >
    <p>{{ t('logicalModels.mountDialogHint') }}</p>
    <FilterBar
      ><template #content
        ><div class="filters">
          <t-input
            :disabled="busy"
            v-model="search"
            :placeholder="t('logicalModels.modelSearch')"
            clearable
            @enter="query"
            @clear="query"
          />
          <t-select
            :disabled="busy"
            v-model="status"
            :options="statusOptions"
            :placeholder="t('logicalModels.allStatuses')"
            clearable
            @change="query"
          />
          <t-select
            :disabled="busy"
            v-model="provider"
            :options="providers.map((x) => ({ label: x.name, value: x.id }))"
            :placeholder="t('logicalModels.allProviders')"
            clearable
            @change="query"
          />
          <t-button theme="default" :disabled="busy" @click="reset">{{
            t('logicalModels.reset')
          }}</t-button>
        </div></template
      ></FilterBar
    >
    <t-table
      :selected-row-keys="selection"
      row-key="id"
      :data="rows"
      :columns="columns"
      :loading="loading"
      :pagination="{ ...pagination, disabled: busy }"
      :disable-data-page="true"
      @page-change="changePage"
      @select-change="selectRows"
    >
      <template #status="{ row }">{{ t(`logicalModels.physicalStatuses.${row.status}`) }}</template>
    </t-table>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin, type PageInfo, type PrimaryTableCol } from 'tdesign-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import { canReadResource, useUserStore } from '@/stores/modules/user'
import { getModelsApi, type PhysicalModelItem, type ModelStatus } from '@/api/modules/models'
import { getProvidersApi, type ProviderItem } from '@/api/modules/providers'
import { mountLogicalModelApi } from '@/api/modules/logicalModels'
const props = defineProps<{ visible: boolean; id: string; mounted: string[] }>()
const emit = defineEmits<{ 'update:visible': [boolean]; saved: [] }>()
const { t } = useI18n()
const user = useUserStore()
const search = ref(''),
  status = ref<ModelStatus | ''>(''),
  provider = ref('')
const selection = ref<string[]>([])
const items = ref<PhysicalModelItem[]>([])
const providers = ref<ProviderItem[]>([])
const loading = ref(false),
  busy = ref(false)
const pagination = reactive({ current: 1, pageSize: 20, total: 0, pageSizeOptions: [20, 50, 100] })
const statusOptions = computed(() =>
  ['DRAFT', 'TESTING', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'RETIRED'].map((value) => ({
    value,
    label: t(`logicalModels.physicalStatuses.${value}`),
  })),
)
const rows = computed(() =>
  items.value.map((m) => ({
    ...m,
    provider: providers.value.find((p) => p.id === m.provider_id)?.name || m.provider_id,
    api: providers.value.find((p) => p.id === m.provider_id)?.base_url || m.invocation_api,
  })),
)
const columns = computed<PrimaryTableCol[]>(() => [
  {
    colKey: 'row-select',
    type: 'multiple',
    disabled: ({ row }) => busy.value || props.mounted.includes(row.id),
  },
  ...['model_id_at_provider', 'status', 'provider', 'api'].map((colKey, i) => ({
    colKey,
    title: t(`logicalModels.${['colIdentifier', 'physicalStatus', 'colProvider', 'colApi'][i]}`),
  })),
])
let version = 0
async function load() {
  if (!canReadResource(user.permissions, 'model.models')) return
  const v = ++version
  loading.value = true
  try {
    const r = await getModelsApi({
      page: pagination.current,
      page_size: pagination.pageSize,
      search: search.value || undefined,
      status: status.value || undefined,
      provider_id: provider.value || undefined,
    })
    if (v === version) {
      items.value = r.items
      pagination.total = r.total
    }
  } catch {
    /* 已提示 */
  } finally {
    if (v === version) loading.value = false
  }
}
function query() {
  pagination.current = 1
  void load()
}
function reset() {
  search.value = ''
  status.value = ''
  provider.value = ''
  query()
}
function changePage(p: PageInfo) {
  pagination.current = p.current
  pagination.pageSize = p.pageSize
  void load()
}
function selectRows(keys: (string | number)[]) {
  if (busy.value) return
  const ids = items.value.map((x) => x.id)
  selection.value = [
    ...new Set([...selection.value.filter((x) => !ids.includes(x)), ...keys.map(String)]),
  ].filter((x) => !props.mounted.includes(x))
}
function close() {
  if (!busy.value) emit('update:visible', false)
}
async function submit() {
  if (busy.value || loading.value || !selection.value.length) return
  const completed: string[] = []
  busy.value = true
  try {
    for (const id of [...selection.value]) {
      await mountLogicalModelApi(props.id, {
        physical_model_id: id,
        confirm_existing_grant_impact: true,
        reason: 'admin-console',
      })
      completed.push(id)
    }
    MessagePlugin.success(t('ma.success'))
    emit('update:visible', false)
  } catch {
    /* 保留失败项供重试 */
  } finally {
    selection.value = selection.value.filter((id) => !completed.includes(id))
    if (completed.length) emit('saved')
    busy.value = false
  }
}
watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    selection.value = []
    reset()
    providers.value = []
    try {
      let page = 1,
        total = 1
      while (page <= total && canReadResource(user.permissions, 'model.providers')) {
        const r = await getProvidersApi({ page, page_size: 100 })
        providers.value.push(...r.items)
        total = r.total_pages
        page++
      }
    } catch {
      /* 已提示 */
    }
  },
)
</script>
<style scoped>
p {
  color: var(--td-text-color-secondary);
  margin: 0 0 var(--td-comp-margin-l);
}
.filters {
  display: flex;
  gap: var(--td-comp-margin-s);
}
:deep(.filter-bar) {
  margin-bottom: var(--td-comp-margin-l);
}
</style>
