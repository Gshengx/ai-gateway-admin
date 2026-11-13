<template>
  <t-collapse v-model="expandedGroups" class="test-result-groups" borderless>
    <t-collapse-panel
      v-for="group in checkGroups"
      :key="group.id"
      :value="group.id"
      :header="group.name"
      :header-right-content="t('ma.passedCount', { n: group.passed, total: group.rows.length })"
    >
      <t-table
        row-key="row_key"
        :data="group.rows"
        :columns="columns"
        table-layout="fixed"
        table-content-width="100%"
      >
        <template #key="{ row }">{{
          row.key === 'PROTOCOL' ? t('ma.apiCheck') : t('ma.' + row.key)
        }}</template>
        <template #status="{ row }">
          <t-tag variant="light" :theme="statusTheme(row.status)">{{
            t('ma.' + row.status)
          }}</t-tag>
        </template>
        <template #duration_ms="{ row }">{{
          row.duration_ms === null ? '—' : row.duration_ms + ' ms'
        }}</template>
        <template #detail="{ row }">
          <div v-if="['FAILED', 'ERROR'].includes(row.status)" class="test-check-feedback">
            <div>
              {{ t('ma.failureReason') }}：{{
                row.detail ? checkDetail(row) : t('ma.failureReasonUnavailable')
              }}
            </div>
            <div class="ma-muted">
              {{ t('ma.troubleshooting') }}：{{ t('ma.testTroubleshooting') }}
            </div>
          </div>
          <span v-else-if="row.status === 'PASSED'">{{ t('ma.checkPassed') }}</span>
          <span v-else>——</span>
        </template>
      </t-table>
    </t-collapse-panel>
  </t-collapse>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PrimaryTableCol } from 'tdesign-vue-next'
import type { Check } from '@/api/modules/modelAccess'
import { invocationLabel, statusTheme } from './helpers'
const props = defineProps<{ checks: Check[] }>()
const { t, te } = useI18n()
const checkRows = computed(() =>
  props.checks.map((check, index) => ({ ...check, row_key: String(index) })),
)
const checkGroups = computed(() => {
  const groups = new Map<
    string,
    { id: string; name: string; passed: number; rows: typeof checkRows.value }
  >()
  for (const row of checkRows.value) {
    const id = row.upstream_path ? `path:${row.upstream_path}` : `api:${row.invocation_api ?? ''}`
    let group = groups.get(id)
    if (!group) {
      group = {
        id,
        name:
          row.upstream_path ||
          (row.invocation_api ? invocationLabel(row.invocation_api) : row.display_name || '—'),
        passed: 0,
        rows: [],
      }
      groups.set(id, group)
    }
    group.rows.push(row)
    if (row.status === 'PASSED') group.passed++
  }
  return [...groups.values()]
})
const expandedGroups = ref<Array<string | number>>([])
watch(
  () => checkGroups.value.map((group) => group.id),
  (ids, previous = []) => {
    expandedGroups.value = [
      ...expandedGroups.value.filter((id) => ids.includes(String(id))),
      ...ids.filter((id) => !previous.includes(id)),
    ]
  },
  { immediate: true },
)
function checkDetail(check: Check) {
  if (!check.detail) return '—'
  const key = `ma.${check.detail}`
  return te(key) ? t(key) : check.detail
}
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'key', title: t('ma.checks'), width: '24%' },
  { colKey: 'status', title: t('ma.status'), width: '17%' },
  { colKey: 'duration_ms', title: t('ma.duration'), width: '19%' },
  { colKey: 'detail', title: t('ma.result'), width: '40%' },
])
</script>
<style scoped src="./access.css"></style>
