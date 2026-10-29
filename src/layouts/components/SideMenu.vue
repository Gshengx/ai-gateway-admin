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
      <template v-for="menu in menus" :key="menu.path">
        <t-submenu
          v-if="menu.children?.length"
          :value="menu.path"
          :title="translateRouteTitle(menu.title)"
        >
          <template #icon>
            <t-icon :name="menu.icon" />
          </template>
          <t-menu-item v-for="child in menu.children" :key="child.path" :value="child.path">
            {{ translateRouteTitle(child.title) }}
          </t-menu-item>
        </t-submenu>

        <t-menu-item v-else :value="menu.path">
          <template #icon>
            <t-icon :name="menu.icon" />
          </template>
          {{ translateRouteTitle(menu.title) }}
        </t-menu-item>
      </template>
    </t-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { translateRouteTitle } from '@/locales'
import { usePermissionStore } from '@/stores/modules/permission'

defineProps<{ collapsed: boolean }>()

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const permissionStore = usePermissionStore()

const menus = computed(() => permissionStore.menus)
const activePath = computed(() => route.path)

/** 展开的父级菜单：默认展开当前路由所属分组 */
const expandedKeys = ref<string[]>([])
watch(
  () => route.path,
  (path) => {
    const parent = menus.value.find((m) => m.children?.some((c) => c.path === path))
    if (parent && !expandedKeys.value.includes(parent.path)) {
      expandedKeys.value = [...expandedKeys.value, parent.path]
    }
  },
  { immediate: true },
)

function onExpand(values: string[]) {
  expandedKeys.value = values
}

function onMenuChange(value: string) {
  if (value !== route.path) {
    router.push(value)
  }
}

function goHome() {
  router.push('/')
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
