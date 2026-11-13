<template>
  <div class="ma-stack test-matrix">
    <t-table
      row-key="id"
      :data="rows"
      :columns="columns"
      table-layout="fixed"
      table-content-width="100%"
    >
      <template #name="{ row }">{{ row.name }}</template>
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
    id: check.upstream_path ? `path:${check.upstream_path}` : `api:${check.invocation_api ?? ''}`,
    name:
      check.upstream_path || (check.invocation_api ? invocationLabel(check.invocation_api) : '—'),
  })),
)
const keys = computed(() => [...new Set(props.checks.map((check) => check.key))])
const rows = computed(() => {
  const groups = new Map<
    string,
    { id: string; name: string; cells: Record<string, typeof entries.value> }
  >()
  for (const entry of entries.value) {
    let row = groups.get(entry.id)
    if (!row) {
      row = { id: entry.id, name: entry.name, cells: {} }
      groups.set(entry.id, row)
    }
    ;(row.cells[entry.check.key] ??= []).push(entry)
  }
  return [...groups.values()]
})
function checkLabel(key: string) {
  return key === 'PROTOCOL' ? t('ma.apiCheck') : t('ma.' + key)
}
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'name', title: t('ma.invocation'), width: '28%' },
  ...keys.value.map((key) => ({
    colKey: key,
    title: checkLabel(key),
    align: 'center' as const,
    width: `${72 / keys.value.length}%`,
  })),
])
</script>
<style scoped src="./access.css"></style>
