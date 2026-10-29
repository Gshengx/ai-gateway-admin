import { defineStore } from 'pinia'
import type { RouteRecordRaw } from 'vue-router'

import { businessRoutes } from '@/router/routes'
import { hasPermission, useUserStore } from '@/stores/modules/user'

export interface MenuItem {
  path: string
  title: string
  icon?: string
  children?: MenuItem[]
}

/** 递归按资源权限码过滤 */
function filterRoutes(routes: RouteRecordRaw[], permissions: string[]): RouteRecordRaw[] {
  const result: RouteRecordRaw[] = []
  for (const route of routes) {
    if (!hasPermission(permissions, route.meta?.permission)) continue

    const children = route.children ? filterRoutes(route.children, permissions) : undefined
    // 父级菜单的所有子项都被过滤掉时，父级一并隐藏
    if (route.children?.length && !children?.length) continue

    result.push({ ...route, ...(children ? { children } : {}) } as RouteRecordRaw)
  }
  return result
}

/** 由路由树生成菜单树（过滤隐藏项） */
function buildMenus(routes: RouteRecordRaw[], basePath = '/'): MenuItem[] {
  return routes
    .filter((route) => !route.meta?.hideInMenu)
    .map((route) => {
      const path = route.path.startsWith('/')
        ? route.path
        : `${basePath.replace(/\/$/, '')}/${route.path}`
      const item: MenuItem = {
        path,
        title: route.meta?.title ?? '',
        icon: route.meta?.icon,
      }
      if (route.children?.length) {
        item.children = buildMenus(route.children, path)
      }
      return item
    })
}

interface PermissionState {
  /** 按当前用户权限过滤后的业务路由 */
  routes: RouteRecordRaw[]
  /** 侧边菜单树 */
  menus: MenuItem[]
  /** 是否已生成并注册路由 */
  loaded: boolean
}

export const usePermissionStore = defineStore('permission', {
  state: (): PermissionState => ({
    routes: [],
    menus: [],
    loaded: false,
  }),
  actions: {
    /** 登录后/刷新时调用：按权限生成路由与菜单 */
    generateRoutes() {
      const userStore = useUserStore()
      this.routes = filterRoutes(businessRoutes, userStore.permissions)
      this.menus = buildMenus(this.routes)
      this.loaded = true
    },
    reset() {
      this.routes = []
      this.menus = []
      this.loaded = false
    },
  },
})
