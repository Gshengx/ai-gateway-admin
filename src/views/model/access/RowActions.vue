<template>
  <div class="ma-actions">
    <template v-for="item in inline" :key="item.label">
      <t-link
        :theme="item.danger ? 'danger' : 'primary'"
        :disabled="item.disabled || item.loading"
        :aria-busy="item.loading || undefined"
        @click="runAction(item)"
      >
        <template v-if="item.loading" #prefix-icon><t-loading size="small" /></template>
        {{ item.label }}
      </t-link>
    </template>
    <t-dropdown v-if="overflow.length" trigger="click"
      ><t-link theme="primary">{{ t('ma.more') }}<t-icon name="chevron-down" /></t-link
      ><t-dropdown-menu
        ><t-dropdown-item
          v-for="item in overflow"
          :key="item.label"
          :theme="item.danger ? 'error' : 'default'"
          :disabled="item.disabled || item.loading"
          @click="runAction(item)"
          ><t-loading v-if="item.loading" size="small" />{{ item.label }}</t-dropdown-item
        ></t-dropdown-menu
      ></t-dropdown
    >
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserStore, canWriteResource } from '@/stores/modules/user'
export interface RowAction {
  label: string
  permission?: string
  overflow?: boolean
  danger?: boolean
  loading?: boolean
  disabled?: boolean
  run: () => unknown
}
const props = defineProps<{ actions: RowAction[]; expanded?: boolean; grouped?: boolean }>()
function runAction(item: RowAction) {
  if (!item.disabled && !item.loading) return item.run()
}
const user = useUserStore(),
  { t } = useI18n()
const available = computed(() =>
  props.actions.filter((a) => !a.permission || canWriteResource(user.permissions, a.permission)),
)
const groupedOverflow = computed(() => available.value.filter((item) => item.overflow))
const inline = computed(() =>
  props.grouped
    ? groupedOverflow.value.length > 1
      ? available.value.filter((item) => !item.overflow)
      : available.value
    : !props.expanded && available.value.length > 2
      ? available.value.slice(0, 1)
      : available.value,
)
const overflow = computed(() =>
  props.grouped
    ? groupedOverflow.value.length > 1
      ? groupedOverflow.value
      : []
    : !props.expanded && available.value.length > 2
      ? available.value.slice(1)
      : [],
)
</script>
<style scoped>
.ma-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  white-space: nowrap;
}
</style>
