<template>
  <t-layout class="basic-layout">
    <t-aside :width="collapsed ? '64px' : '232px'" class="basic-layout__aside">
      <side-menu :collapsed="collapsed" />
    </t-aside>

    <t-layout class="basic-layout__main">
      <t-header class="basic-layout__header">
        <header-bar :collapsed="collapsed" @toggle="collapsed = !collapsed" />
      </t-header>
      <t-content class="basic-layout__content">
        <router-view v-if="pageAllowed" :key="permissionStore.generation" />
      </t-content>
    </t-layout>
  </t-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { usePermissionStore } from '@/stores/modules/permission'

import SideMenu from './components/SideMenu.vue'
import HeaderBar from './components/HeaderBar.vue'

const collapsed = ref(false)
const route = useRoute()
const permissionStore = usePermissionStore()
const pageAllowed = computed(() =>
  permissionStore.routes.some((item) => item.meta?.routeId === route.meta.routeId),
)
</script>

<style scoped>
.basic-layout {
  height: 100%;
}

.basic-layout__aside {
  /* 防止宽内容把侧栏挤压消失（t-aside 默认 flex:0 1 auto，shrink=1 会被压缩） */
  flex-shrink: 0;
  transition: width 0.2s;
  overflow: hidden;
  border-right: 1px solid var(--td-component-border);
}

.basic-layout__main {
  /* 允许主区域收缩到内容以下，配合 aside 的 flex-shrink:0 避免互相挤压 */
  min-width: 0;
}

.basic-layout__header {
  /* flex:none 防止高度被内容区挤压（t-header 默认可收缩） */
  flex: none;
  height: var(--layout-header-height);
  border-bottom: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
}

.basic-layout__content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--td-comp-paddingTB-l) var(--td-comp-paddingLR-l);
  overflow-y: auto;
  background: var(--td-bg-color-page);
}
</style>
