<template>
  <AccessState code="403" :title="t('route.forbidden')" :description="t('error.forbidden')">
    <t-button
      theme="primary"
      size="large"
      :loading="navigating"
      :disabled="userStore.permissionsLoading"
      @click="returnToApp"
      >{{ actionLabel }}</t-button
    >
  </AccessState>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermissionStore, type MenuItem } from '@/stores/modules/permission'
import { useUserStore } from '@/stores/modules/user'
import { canEnterRoute } from '@/router/routes'
import AccessState from '@/components/AccessState.vue'

const router = useRouter()
const { t } = useI18n()
const permissionStore = usePermissionStore()
const userStore = useUserStore()
const navigating = ref(false)
const destination = computed(() => {
  if (!userStore.permissionsReady) return undefined
  const allowed = permissionStore.routes.filter(
    (route) => route.meta?.routeId && canEnterRoute(route.meta.routeId, userStore.permissions),
  )
  if (allowed.some((route) => route.path === '/')) return '/'
  const paths = new Set(allowed.map((route) => route.path))
  const firstAccessibleMenu = (menus: MenuItem[]): string | undefined => {
    for (const menu of menus) {
      if (menu.routeId && paths.has(menu.path)) return menu.path
      const child = firstAccessibleMenu(menu.children ?? [])
      if (child) return child
    }
    return undefined
  }
  return firstAccessibleMenu(permissionStore.menus) ?? allowed[0]?.path
})
const actionLabel = computed(() =>
  t(
    destination.value === '/'
      ? 'common.backHome'
      : destination.value
        ? 'error.goAvailable'
        : 'error.backLogin',
  ),
)
async function returnToApp() {
  if (navigating.value) return
  navigating.value = true
  try {
    if (destination.value) await router.replace(destination.value)
    else {
      await userStore.logout()
      await router.replace('/login')
    }
  } catch {
    // Shared request and router handlers report failures; keep this page available for retry.
  } finally {
    navigating.value = false
  }
}
</script>
