<template>
  <aside class="collapsible-sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="sidebar-toggle">
      <t-button
        variant="text"
        shape="square"
        size="small"
        :title="t(collapsed ? 'common.expandSidebar' : 'common.collapseSidebar')"
        :aria-label="t(collapsed ? 'common.expandSidebar' : 'common.collapseSidebar')"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <template #icon><t-icon :name="collapsed ? 'chevron-right' : 'chevron-left'" /></template>
      </t-button>
    </div>
    <div v-show="!collapsed" class="sidebar-content"><slot /></div>
  </aside>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const collapsed = defineModel<boolean>({ default: false })
const { t } = useI18n()
</script>

<style scoped>
.collapsible-sidebar {
  position: relative;
  min-width: 0;
}
.sidebar-content {
  display: flex;
  flex-direction: column;
  gap: inherit;
}
.sidebar-toggle {
  position: absolute;
  top: var(--td-comp-margin-l);
  right: calc(var(--td-comp-size-xs) / -2);
  z-index: 1;
  display: flex;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
}
.collapsible-sidebar.is-collapsed {
  flex: 0 0 var(--td-comp-size-xl);
  width: var(--td-comp-size-xl);
  padding: var(--td-comp-paddingTB-s) 0;
}
.is-collapsed .sidebar-toggle {
  right: var(--td-comp-margin-xs);
}
</style>
