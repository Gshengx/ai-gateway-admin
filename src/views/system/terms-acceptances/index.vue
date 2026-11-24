<template>
  <t-card :bordered="false">
    <FilterBar @search="search" @reset="reset">
      <template #content>
        <div class="list-toolbar">
          <t-input
            v-model="draft.search"
            class="list-search"
            :maxlength="128"
            :placeholder="t('termsAudit.searchPlaceholder')"
            :aria-label="t('termsAudit.searchPlaceholder')"
            clearable
            @enter="search"
          />
          <t-input
            v-model="draft.user_id"
            class="list-search"
            :maxlength="36"
            :placeholder="t('termsAudit.userId')"
            :aria-label="t('termsAudit.userId')"
            clearable
            @enter="search"
          />
          <t-input
            v-model="draft.terms_id"
            class="list-search"
            :maxlength="36"
            :placeholder="t('termsAudit.termsId')"
            :aria-label="t('termsAudit.termsId')"
            clearable
            @enter="search"
          />
          <t-date-range-picker
            v-model="dates"
            enable-time-picker
            format="YYYY-MM-DD HH:mm:ss"
            :placeholder="[t('termsAudit.from'), t('termsAudit.to')]"
            clearable
          />
          <t-button @click="search">{{ t('common.search') }}</t-button>
          <t-button theme="default" variant="base" @click="reset">{{ t('common.reset') }}</t-button>
        </div>
      </template>
    </FilterBar>
    <t-alert v-if="filterError" theme="warning" :message="filterError" class="audit-feedback" />
    <t-alert v-if="failed" theme="error" :message="t('common.loadFailed')" class="audit-feedback">
      <template #operation
        ><t-link @click="load">{{ t('common.retry') }}</t-link></template
      >
    </t-alert>
    <t-table
      row-key="id"
      :data="rows"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :empty="failed ? t('common.loadFailed') : t('termsAudit.empty')"
      height="var(--stable-table-height)"
      hover
      @page-change="changePage"
    >
      <template #accepted_at="{ row }">{{ formatDateTime(row.accepted_at) }}</template>
      <template #department="{ row }">{{ departmentPath(row) }}</template>
      <template #action="{ row }"
        ><t-link theme="primary" @click="selectedId = row.id">{{
          t('termsAudit.view')
        }}</t-link></template
      >
    </t-table>
    <EvidenceDrawer v-if="selectedId" :id="selectedId" @close="selectedId = ''" />
  </t-card>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PrimaryTableCol } from 'tdesign-vue-next'
import FilterBar from '@/components/FilterBar.vue'
import EvidenceDrawer from './EvidenceDrawer.vue'
import {
  getTermsAcceptancesApi,
  type TermsAcceptance,
  type TermsAcceptanceQuery,
} from '@/api/modules/terms'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { formatDateTime, parseDateTimeInTimeZone } from '@/utils/datetime'
const { t, locale } = useI18n()
const draft = reactive({ search: '', user_id: '', terms_id: '' })
const dates = ref<string[]>([])
const query = ref<Omit<TermsAcceptanceQuery, 'page' | 'page_size'>>({})
const filterError = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref<TermsAcceptance[]>([])
const loading = ref(true)
const failed = ref(false)
const selectedId = ref('')
const request = useLatestRequest()
const columns = computed<PrimaryTableCol<TermsAcceptance>[]>(() => [
  { colKey: 'username_snapshot', title: t('termsAudit.username'), width: 160, ellipsis: true },
  {
    colKey: 'display_name_snapshot',
    title: t('termsAudit.displayName'),
    width: 160,
    ellipsis: true,
  },
  { colKey: 'department', title: t('termsAudit.department'), width: 200, ellipsis: true },
  { colKey: 'terms_id', title: t('termsAudit.termsId'), width: 300, ellipsis: true },
  { colKey: 'locale_code', title: t('termsAudit.language'), width: 130 },
  { colKey: 'accepted_at', title: t('termsAudit.acceptedAt'), width: 200 },
  { colKey: 'action', title: t('termsAudit.action'), width: 100, fixed: 'right' },
])
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  pageSizeOptions: [10, 20, 50, 100],
  showJumper: true,
  disabled: loading.value,
}))
function departmentPath(row: TermsAcceptance) {
  return (
    row.department_snapshot.path.map((node) => node.name).join(' / ') ||
    row.department_snapshot.name ||
    '—'
  )
}
async function load() {
  const current = request.begin()
  loading.value = true
  failed.value = false
  try {
    const result = await getTermsAcceptancesApi(
      { ...query.value, page: page.value, page_size: pageSize.value },
      { signal: current.signal },
    )
    if (!current.isCurrent()) return
    rows.value = result.items
    total.value = result.total
    page.value = result.page
    pageSize.value = result.page_size
    if (result.total_pages > 0 && result.page > result.total_pages) {
      page.value = result.total_pages
      await load()
    }
  } catch {
    if (current.isCurrent()) {
      failed.value = true
      rows.value = []
      total.value = 0
    }
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
function search() {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if ([draft.user_id, draft.terms_id].some((value) => value.trim() && !uuid.test(value.trim()))) {
    filterError.value = t('termsAudit.invalidId')
    return
  }
  const range = dates.value.map(parseDateTimeInTimeZone)
  if (
    range.length &&
    (range.length !== 2 || range.some((value) => !value) || range[0]! > range[1]!)
  ) {
    filterError.value = t('termsAudit.invalidRange')
    return
  }
  filterError.value = ''
  query.value = {
    search: draft.search.trim() || undefined,
    user_id: draft.user_id.trim() || undefined,
    terms_id: draft.terms_id.trim() || undefined,
    from: range[0]?.toISOString(),
    to: range[1]?.toISOString(),
  }
  page.value = 1
  void load()
}
function reset() {
  Object.assign(draft, { search: '', user_id: '', terms_id: '' })
  dates.value = []
  search()
}
function changePage(value: { current: number; pageSize: number }) {
  page.value = value.pageSize !== pageSize.value ? 1 : value.current
  pageSize.value = value.pageSize
  void load()
}
watch(locale, () => {
  filterError.value = ''
  void load()
})
onMounted(load)
</script>
<style scoped>
.audit-feedback {
  margin-bottom: var(--td-comp-margin-l);
}
</style>
