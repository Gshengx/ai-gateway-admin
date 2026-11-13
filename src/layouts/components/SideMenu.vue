<template>
  <div class="side-menu">
    <div class="side-menu__logo" @click="goHome">
      <img src="/favicon.svg" alt="logo" />
      <div class="side-menu__logo-text">
        <div class="side-menu__logo-title" v-show="!collapsed">{{ t('app.title') }}</div>
        <div class="side-menu__logo-subtitle" v-show="!collapsed">{{ t('app.shortTitle') }}</div>
      </div>
    </div>

    <t-menu
      :value="activePath"
      :collapsed="collapsed"
      :expanded="expandedKeys"
      theme="light"
      @change="onMenuChange"
      @expand="onExpand"
    >
      <menu-node v-for="menu in menus" :key="menu.path" :item="menu" />
    </t-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import MenuNode from './MenuNode.vue'
import { menuTrail } from '@/stores/modules/permission'
import { usePermissionStore } from '@/stores/modules/permission'

defineProps<{ collapsed: boolean }>()

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const permissionStore = usePermissionStore()

const menus = computed(() => permissionStore.menus)
const trail = computed(() => menuTrail(menus.value, route.meta.routeId))
const activePath = computed(() => trail.value[trail.value.length - 1]?.path ?? route.path)

/** 展开的父级菜单：默认展开当前路由所属分组 */
const expandedKeys = ref<string[]>([])
watch(
  () => trail.value,
  (items) => {
    expandedKeys.value = [
      ...new Set([
        ...expandedKeys.value,
        ...items.filter((item) => item.children).map((item) => item.path),
      ]),
    ]
  },
  { immediate: true },
)

function onExpand(values: string[]) {
  expandedKeys.value = values
}

function onMenuChange(value: string) {
  if (value !== route.path) {
    void router.push(value).catch(() => {
      // The router error handler reports failed page downloads.
    })
  }
}

function goHome() {
  void router.push('/').catch(() => {
    // The router error handler reports failed page downloads.
  })
}
</script>

<style scoped>
.side-menu {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--td-bg-color-container);
}

.side-menu__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--layout-header-height);
  padding: 0 16px;
  margin-top: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.side-menu__logo-text {
  flex: 1;
}

.side-menu__logo-title {
  font-size: var(--td-font-size-body-large);
}

.side-menu__logo-subtitle {
  font-size: var(--td-font-size-mark-small);
  color: var(--td-font-gray-4);
}

.side-menu__logo img {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
}

.side-menu :deep(.t-menu) {
  flex: 1;
  overflow-y: auto;
}
</style>
