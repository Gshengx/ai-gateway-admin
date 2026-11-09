<template>
  <div class="ma-actions">
    <t-link
      v-for="item in inline"
      :key="item.label"
      :theme="item.danger ? 'danger' : 'primary'"
      @click="item.run"
      >{{ item.label }}</t-link
    >
    <t-dropdown v-if="overflow.length" trigger="click"
      ><t-link theme="primary">{{ t('ma.more') }}<t-icon name="chevron-down" /></t-link
      ><t-dropdown-menu
        ><t-dropdown-item
          v-for="item in overflow"
          :key="item.label"
          :theme="item.danger ? 'error' : 'default'"
          @click="item.run"
          >{{ item.label }}</t-dropdown-item
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
  danger?: boolean
  run: () => unknown
}
const props = defineProps<{ actions: RowAction[] }>()
const user = useUserStore(),
  { t } = useI18n()
const available = computed(() =>
  props.actions.filter((a) => !a.permission || canWriteResource(user.permissions, a.permission)),
)
const inline = computed(() =>
  available.value.length > 2 ? available.value.slice(0, 1) : available.value,
)
const overflow = computed(() => (available.value.length > 2 ? available.value.slice(1) : []))
</script>
<style scoped>
.ma-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--td-comp-margin-s);
  white-space: nowrap;
}
</style>
