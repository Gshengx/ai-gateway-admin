<template>
  <t-form-item :label="t('bills.scopeType')" required>
    <div class="bill-field-stack">
      <t-radio-group :value="scopeType" :options="types" @change="changeType" />
      <p class="bill-field-hint">{{ t('bills.scopeHelp') }}</p>
    </div>
  </t-form-item>
  <t-form-item
    :label="scopeType === 'DEPARTMENT' ? t('bills.departmentScope') : t(`bills.${scopeType}`)"
    required
  >
    <div class="bill-field-stack scope-control">
      <DepartmentTreeSelect
        v-if="scopeType === 'DEPARTMENT'"
        :model-value="scopeId"
        :load-departments="loadDepartments"
        @update:model-value="emit('update:scopeId', $event)"
      />
      <t-select
        v-else
        :value="scopeId"
        :options="objects"
        filterable
        @change="emit('update:scopeId', String($event ?? ''))"
      />
      <p v-if="scopeType === 'DEPARTMENT'" class="bill-field-hint">
        {{ t(task ? 'bills.taskDepartmentHint' : 'bills.manualDepartmentHint') }}
      </p>
    </div>
  </t-form-item>
</template>
<script setup lang="ts">
import { getBillDepartments } from '@/api/modules/bills'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DepartmentQuery } from '@/api/modules/identity'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import type { ScopeOption, ScopeType } from '@/api/modules/bills'
const props = defineProps<{
  scopeType: ScopeType
  scopeId: string
  scopes: ScopeOption[]
  task?: boolean
}>()
const emit = defineEmits<{ 'update:scopeType': [ScopeType]; 'update:scopeId': [string] }>()
const { t } = useI18n()
const types = computed(() =>
  [...new Set(props.scopes.map((s) => s.type))].map((value) => ({
    value,
    label: t(`bills.${value}`),
  })),
)
const objects = computed(() => props.scopes.filter((s) => s.type === props.scopeType))
async function loadDepartments(params: DepartmentQuery) {
  return getBillDepartments(params)
}

function changeType(value: unknown) {
  emit('update:scopeType', String(value) as ScopeType)
  emit('update:scopeId', '')
}
</script>
<style scoped>
.scope-control,
.scope-control :deep(.department-tree-select) {
  width: 100%;
}
</style>
