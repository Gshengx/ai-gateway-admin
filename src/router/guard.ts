import type { Router } from 'vue-router'

import { LAYOUT_ROUTE_NAME } from './index'
import { pinia } from '@/stores'
import { useUserStore, hasPermission } from '@/stores/modules/user'
import { usePermissionStore } from '@/stores/modules/permission'
import type { NotifiedError } from '@/api/request'
import { MessagePlugin } from 'tdesign-vue-next'
import { i18n } from '@/locales'
import { setDocumentTitle, translateRouteTitle } from '@/locales'

const LOGIN_PATH = '/login'
const HOME_PATH = '/dashboard'

/**
 * 全局前置守卫：
 * 1. 未登录访问业务页 → 跳登录（带 redirect）
 * 2. 已登录无用户信息 → 拉取用户信息（含权限码）
 * 3. 业务路由未注册 → 按权限生成并注册到布局路由下，随后重放本次导航
 * 4. 已注册 → 校验页面级权限，无权限跳 403
 */
export function setupRouterGuard(router: Router): void {
  router.afterEach((to, _from, failure) => {
    // 导航成功后按最终解析的路由更新标签页标题，不处理动态路由注册前的临时 NotFound
    if (!failure) setDocumentTitle(translateRouteTitle(to.meta.title))
  })

  router.beforeEach(async (to) => {
    const userStore = useUserStore(pinia)
    const permissionStore = usePermissionStore(pinia)
    if (!userStore.contextLoaded) {
      try {
        await userStore.loadContext()
      } catch (error) {
        if ((error as NotifiedError).code === 'UNAUTHENTICATED') {
          userStore.reset()
          return to.path === LOGIN_PATH
            ? true
            : { path: LOGIN_PATH, query: { redirect: to.fullPath } }
        }
        MessagePlugin.error(i18n.global.t('authErrors.contextUnavailable'))
        return false
      }
    }
    const session = userStore.context.session
    if (session?.gate === 'NEEDS_PASSWORD' || session?.gate === 'NEEDS_TERMS') {
      return to.path === LOGIN_PATH
        ? true
        : { path: LOGIN_PATH, query: { redirect: to.query.redirect ?? to.fullPath } }
    }
    if (session?.scope !== 'FULL' || session.gate !== 'READY') return false
    if (to.path === LOGIN_PATH) return HOME_PATH
    try {
      if (!userStore.loaded) {
        await userStore.fetchUserInfo()
        permissionStore.reset()
      }
    } catch {
      return false
    }

    if (!permissionStore.loaded) {
      permissionStore.generateRoutes()

      // 业务路由以静态布局路由为父级嵌套注册（父路由已存在，无需重复注册 403/404）
      permissionStore.routes.forEach((route) => router.addRoute(LAYOUT_ROUTE_NAME, route))

      // 重放导航，让新注册的路由生效。
      // 不能用 { ...to } 展开：深链直达未注册的动态路由时，to 已被解析为通配 NotFound，
      // 按 name 重放会再次落回 404；必须仅按 path/query/hash 重放
      return { path: to.path, query: to.query, hash: to.hash, replace: true }
    }

    if (to.meta.permission && !hasPermission(userStore.permissions, to.meta.permission)) {
      return '/403'
    }

    return true
  })
}
