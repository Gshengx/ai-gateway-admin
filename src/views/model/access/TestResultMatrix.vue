<template>
  <div class="ma-stack test-matrix">
    <t-table
      row-key="id"
      :data="rows"
      :columns="columns"
      table-layout="fixed"
      table-content-width="100%"
    >
      <template #name="{ row }">
        <div class="test-invocation-name">
          <span v-if="row.protocol">{{ row.protocol }}</span>
          <span v-if="row.path">{{ row.path }}</span>
          <span v-if="!row.protocol && !row.path">—</span>
        </div>
      </template>
      <template v-for="key in keys" :key="key" #[key]="{ row }">
        <div v-if="row.cells[key]?.length" class="test-matrix-cell">
          <div v-for="entry in row.cells[key]" :key="entry.index" class="test-matrix-value">
            <t-tag variant="light" :theme="statusTheme(entry.check.status)">{{
              t('ma.' + entry.check.status)
            }}</t-tag>
            <span class="test-history-meta">{{
              entry.check.duration_ms === null ? '—' : entry.check.duration_ms + ' ms'
            }}</span>
          </div>
        </div>
        <span v-else>—</span>
      </template>
    </t-table>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PrimaryTableCol } from 'tdesign-vue-next'
import type { Check } from '@/api/modules/modelAccess'
import { invocationLabel, statusTheme } from './helpers'

const props = defineProps<{ checks: Check[] }>()
const { t } = useI18n()
const entries = computed(() =>
  props.checks.map((check, index) => ({
    check,
    index,
    id:
      check.invocation_api_id ??
      `api:${check.invocation_api ?? ''}:path:${check.upstream_path ?? ''}`,
    protocol: check.invocation_api ? invocationLabel(check.invocation_api) : '',
    path: check.upstream_path ?? '',
  })),
)
const keys = computed(() => [...new Set(props.checks.map((check) => check.key))])
const rows = computed(() => {
  const groups = new Map<
    string,
    { id: string; protocol: string; path: string; cells: Record<string, typeof entries.value> }
  >()
  for (const entry of entries.value) {
    let row = groups.get(entry.id)
    if (!row) {
      row = { id: entry.id, protocol: entry.protocol, path: entry.path, cells: {} }
      groups.set(entry.id, row)
    }
    ;(row.cells[entry.check.key] ??= []).push(entry)
  }
  return [...groups.values()]
})
function checkLabel(key: string) {
  return key === 'PROTOCOL' ? t('ma.apiCheck') : t('ma.' + key)
}
const columns = computed<PrimaryTableCol[]>(() => {
  const invocationWidth = keys.value.length === 1 ? 70 : 28
  return [
    { colKey: 'name', title: t('ma.invocation'), width: `${invocationWidth}%` },
    ...keys.value.map((key) => ({
      colKey: key,
      title: checkLabel(key),
      align: 'center' as const,
      width: `${(100 - invocationWidth) / keys.value.length}%`,
    })),
  ]
})
</script>
<style scoped src="./access.css"></style>
