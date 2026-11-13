import { watch } from 'vue'
import type { Router, RouteLocationNormalized } from 'vue-router'
import { LAYOUT_ROUTE_NAME } from './index'
import { canEnterRoute, routeRegistry } from './routes'
import { pinia } from '@/stores'
import { useUserStore } from '@/stores/modules/user'
import { usePermissionStore } from '@/stores/modules/permission'
import { useNavigationStore } from '@/stores/modules/navigation'
import type { NotifiedError } from '@/api/request'
import { MessagePlugin } from 'tdesign-vue-next'
import { i18n, setDocumentTitle, translateRouteTitle } from '@/locales'

export function setupRouterGuard(router: Router): void {
  const user = useUserStore(pinia)
  const permission = usePermissionStore(pinia)
  const navigation = useNavigationStore(pinia)
  let pendingNavigation: RouteLocationNormalized | undefined
  function finishNavigation(to: RouteLocationNormalized) {
    if (pendingNavigation !== to) return
    pendingNavigation = undefined
    navigation.loading = false
  }
  let removeRoutes: Array<() => void> = []
  watch(
    () => permission.routes,
    (routes) => {
      removeRoutes.forEach((remove) => remove())
      removeRoutes = routes.map((route) => router.addRoute(LAYOUT_ROUTE_NAME, route))
    },
    { flush: 'sync' },
  )

  router.afterEach((to, _from, failure) => {
    finishNavigation(to)
    if (!failure)
      setDocumentTitle(
        to.meta.serverTitle
          ? permission.routes.find((route) => route.meta?.routeId === to.meta.routeId)?.meta?.title
          : translateRouteTitle(to.meta.title),
      )
  })
  router.onError((error, to) => {
    finishNavigation(to)
    if (!(error as NotifiedError).notified) MessagePlugin.error(i18n.global.t('common.loadFailed'))
  })
  watch(
    () => permission.menus,
    () => {
      const current = router.currentRoute.value
      if (current.meta.routeId) {
        const active = permission.routes.find(
          (route) => route.meta?.routeId === current.meta.routeId,
        )
        setDocumentTitle(active?.meta?.title)
        if (user.permissionsReady && !active) void router.replace('/403')
      }
    },
    { flush: 'post' },
  )

  router.beforeEach(async (to) => {
    pendingNavigation = to
    navigation.loading = true
    if (to.path === '/login' && user.loggedOut) return true
    if (!user.contextLoaded) {
      try {
        await user.loadContext()
      } catch (error) {
        if ((error as NotifiedError).code === 'UNAUTHENTICATED') {
          user.reset()
          return to.path === '/login' ? true : { path: '/login', query: { redirect: to.fullPath } }
        }
        MessagePlugin.error(i18n.global.t('authErrors.contextUnavailable'))
        user.permissionError = i18n.global.t('authErrors.contextUnavailable')
        return false
      }
    }
    const session = user.context.session
    if (session?.scope !== 'FULL' || session.gate !== 'READY') {
      return to.path === '/login' ? true : { path: '/login', query: { redirect: to.fullPath } }
    }
    if (to.path === '/login') return '/'
    if (!user.loaded || !permission.loaded) {
      try {
        await user.fetchUserInfo()
      } catch {
        return false
      }
      if (!permission.loaded) return false
      return { path: to.path, query: to.query, hash: to.hash, replace: true }
    }
    if (
      to.meta.routeId &&
      (!permission.routes.some((route) => route.meta?.routeId === to.meta.routeId) ||
        !canEnterRoute(to.meta.routeId, user.permissions))
    )
      return '/403'
    // 已知页面未出现在本次导航中时，深链也不能绕过菜单授权。
    if (
      to.name === 'NotFound' &&
      Object.values(routeRegistry).some(
        (route) =>
          route.path === to.path ||
          (Array.isArray(route.alias) ? route.alias : [route.alias]).includes(to.path),
      )
    )
      return '/403'
    return true
  })
}
