<template>
  <t-submenu
    v-if="item.children?.length"
    :value="item.path"
    :title="item.titleKey ? t(item.titleKey) : item.title"
  >
    <template v-if="item.icon" #icon><t-icon :name="item.icon" /></template>
    <menu-node v-for="child in item.children" :key="child.path" :item="child" />
  </t-submenu>
  <t-menu-item v-else :value="item.path">
    <template v-if="item.icon" #icon><t-icon :name="item.icon" /></template>
    {{ item.title }}
  </t-menu-item>
</template>

<script setup lang="ts">
import type { MenuItem } from '@/stores/modules/permission'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
defineProps<{ item: MenuItem }>()
</script>
