import { defineStore } from 'pinia'
import type { RouteRecordRaw } from 'vue-router'
import type { PermissionsResult } from '@/api/modules/auth'
import { routeRegistry, canEnterRoute, menuRouteGroups } from '@/router/routes'

export interface MenuItem {
  path: string
  title: string
  titleKey?: string
  icon?: string
  routeId?: string
  sidebarHidden?: boolean
  sortOrder: number
  children?: MenuItem[]
}

export function menuTrail(menus: MenuItem[], routeId?: string): MenuItem[] {
  for (const menu of menus) {
    if (menu.routeId === routeId && routeId) return [menu]
    const child = menuTrail(menu.children ?? [], routeId)
    if (child.length) return [menu, ...child]
  }
  return []
}

export const usePermissionStore = defineStore('permission', {
  state: () => ({
    routes: [] as RouteRecordRaw[],
    menus: [] as MenuItem[],
    /** 全部获准入口，含侧栏隐藏项，供面包屑与非侧栏导航使用。 */
    navigationMenus: [] as MenuItem[],
    loaded: false,
    generation: 0,
  }),
  actions: {
    generateRoutes(result: PermissionsResult, permissions: string[]) {
      const navigation = result.navigation
      const groups = new Map<string, MenuItem>()
      const menus: MenuItem[] = []
      const routes: RouteRecordRaw[] = []
      for (const group of navigation.groups)
        groups.set(group.group_code, {
          path: `group:${group.group_code}`,
          title: group.title,
          icon: menuRouteGroups.find((local) => local.code === group.group_code)?.icon,
          sortOrder: group.sort_order,
          children: [],
        })
      for (const group of navigation.groups) {
        const node = groups.get(group.group_code)!
        if (group.parent_group_code) groups.get(group.parent_group_code)!.children!.push(node)
        else menus.push(node)
      }
      for (const item of navigation.items) {
        if (!canEnterRoute(item.route_id, permissions)) continue
        const local = routeRegistry[item.route_id]!
        const meta = {
          ...local.meta,
          routeId: item.route_id,
          title: item.title,
          serverTitle: true,
          hideInMenu: item.sidebar_hidden,
        }
        routes.push({ ...local, meta } as RouteRecordRaw)
        const menu: MenuItem = {
          path: local.path,
          title: item.title,
          icon: meta.icon,
          routeId: item.route_id,
          sidebarHidden: item.sidebar_hidden,
          sortOrder: item.sort_order,
        }
        if (item.parent_group_code) groups.get(item.parent_group_code)!.children!.push(menu)
        else menus.push(menu)
        if (item.route_id === 'logical_models')
          routes.push({
            path: '/model/logical-models/:logical_model_id',
            alias: '/model/logical/:logical_model_id',
            name: 'ModelLogicalDetail',
            component: () => import('@/views/model/logical/detail.vue'),
            meta: { ...meta, hideInMenu: true },
          })
      }
      const sort = (items: MenuItem[]): MenuItem[] =>
        items
          .map((item) => (item.children ? { ...item, children: sort(item.children) } : item))
          .filter((item) => !item.children || item.children.length > 0)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.path.localeCompare(b.path))
      // Translated titles do not change route matching. Keep registered records and page instances.
      const sameRoutes =
        this.routes.length === routes.length &&
        routes.every((route, index) => this.routes[index]?.name === route.name)
      if (sameRoutes) {
        routes.forEach((route, index) => Object.assign(this.routes[index]!.meta!, route.meta))
      } else {
        this.routes = routes
      }
      this.navigationMenus = sort(menus)
      const sidebar = (items: MenuItem[]): MenuItem[] =>
        items
          .filter((item) => !item.sidebarHidden)
          .map((item) => (item.children ? { ...item, children: sidebar(item.children) } : item))
          .filter((item) => !item.children || item.children.length > 0)
      this.menus = sidebar(this.navigationMenus)
      this.loaded = true
    },
    reset() {
      this.routes = []
      this.menus = []
      this.navigationMenus = []
      this.loaded = false
      this.generation++
    },
  },
})
