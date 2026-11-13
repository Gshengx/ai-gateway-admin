<template>
  <main class="forbidden-page">
    <section class="forbidden-content" aria-labelledby="forbidden-title">
      <t-icon name="lock-on" size="var(--td-comp-size-xxxxl)" class="forbidden-icon" />
      <p class="forbidden-code" aria-hidden="true">403</p>
      <h1 id="forbidden-title">{{ t('route.forbidden') }}</h1>
      <p class="forbidden-description">{{ t('error.forbidden') }}</p>
      <t-button
        theme="primary"
        size="large"
        :loading="navigating"
        :disabled="userStore.permissionsLoading"
        @click="returnToApp"
        >{{ actionLabel }}</t-button
      >
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermissionStore, type MenuItem } from '@/stores/modules/permission'
import { useUserStore } from '@/stores/modules/user'
import { canEnterRoute } from '@/router/routes'

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

<style scoped>
.forbidden-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--td-comp-paddingTB-xxl) var(--td-comp-paddingLR-xl);
  background: var(--td-bg-color-page);
}
.forbidden-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--td-comp-margin-l);
  text-align: center;
}
.forbidden-icon {
  color: var(--td-brand-color);
}
.forbidden-code {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font-size: var(--td-font-size-headline-large);
  font-weight: var(--td-font-weight-600);
}
.forbidden-content h1 {
  margin: 0;
  color: var(--td-text-color-primary);
  font-size: var(--td-font-size-title-large);
}
.forbidden-description {
  margin: 0;
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-medium);
}
</style>
