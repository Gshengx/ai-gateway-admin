import type { RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: string
    permission?: string
    hideInMenu?: boolean
    routeId?: string
    serverTitle?: boolean
  }
}

const placeholder = () => import('@/views/common/placeholder.vue')

/** 固定组件映射；入口集合和名称由 navigation 决定，本地仅辅助分组。 */
export const routeRegistry: Record<string, RouteRecordRaw> = {
  overview: {
    path: '/',
    alias: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: { icon: 'dashboard' },
  },
  model_providers: {
    path: '/model/providers',
    name: 'ModelProviders',
    component: () => import('@/views/model/providers/index.vue'),
    meta: { permission: 'model.providers', icon: 'app' },
  },
  model_models: {
    path: '/model/models',
    name: 'ModelModels',
    component: () => import('@/views/model/models/index.vue'),
    meta: { permission: 'model.models', icon: 'app' },
  },
  identity_projects: {
    path: '/identity/projects',
    name: 'IdentityProjects',
    component: placeholder,
    meta: { permission: 'identity.projects', icon: 'folder' },
  },
  cost_bills: {
    path: '/cost/bills',
    name: 'CostBills',
    component: () => import('@/views/cost/bills/index.vue'),
    meta: { permission: 'cost.bills', icon: 'file' },
  },
  cost_expenses: {
    path: '/cost/expenses',
    name: 'CostExpenses',
    component: placeholder,
    meta: { permission: 'cost.expenses', icon: 'file' },
  },
  cost_budgets: {
    path: '/cost/budgets',
    name: 'CostBudgets',
    component: () => import('@/views/cost/budgets/index.vue'),
    meta: { permission: 'cost.budgets', icon: 'wallet' },
  },
  groups: {
    path: '/identity/groups',
    name: 'IdentityGroups',
    component: () => import('@/views/identity/groups/index.vue'),
    meta: { permission: 'identity.groups', icon: 'usergroup' },
  },
  roles: {
    path: '/identity/roles',
    name: 'IdentityRoles',
    component: () => import('@/views/identity/roles/index.vue'),
    meta: { permission: 'identity.roles', icon: 'usergroup' },
  },
  permission_resources: {
    path: '/identity/permission-resources',
    name: 'PermissionResources',
    component: placeholder,
    meta: { permission: 'identity.permission_resources', icon: 'secured' },
  },
  users: {
    path: '/identity/users',
    name: 'IdentityUsers',
    component: () => import('@/views/identity/users/index.vue'),
    meta: { permission: 'identity.users', icon: 'usergroup' },
  },
  settings: {
    path: '/system/settings',
    name: 'SystemSettings',
    component: () => import('@/views/system/settings/index.vue'),
    meta: { permission: 'system.settings', icon: 'setting' },
  },
  management_audit: {
    path: '/system/logs',
    name: 'SystemLogs',
    component: () => import('@/views/system/logs/index.vue'),
    meta: { permission: 'audit.management', icon: 'file-search' },
  },
  terms_acceptances: {
    path: '/system/terms-acceptances',
    name: 'TermsAcceptances',
    component: placeholder,
    meta: { permission: 'audit.terms_acceptances', icon: 'file-search' },
  },
  managed_keys: {
    path: '/identity/keys',
    name: 'IdentityKeys',
    component: () => import('@/views/identity/keys/index.vue'),
    meta: { permission: 'identity.keys', icon: 'key' },
  },
  personal_keys: {
    path: '/account/keys',
    alias: '/personal/keys',
    name: 'PersonalKeys',
    component: () => import('@/views/personal/keys/index.vue'),
    meta: { permission: 'personal.keys', icon: 'key' },
  },
  profile: {
    path: '/account',
    alias: '/personal/overview',
    name: 'PersonalOverview',
    component: placeholder,
    meta: { permission: 'personal.profile', icon: 'user' },
  },
  change_password: {
    path: '/account/password',
    name: 'AccountPassword',
    component: placeholder,
    meta: { icon: 'lock-on' },
  },
  terms: {
    path: '/terms',
    name: 'Terms',
    component: placeholder,
    meta: { icon: 'file' },
  },
}

/** 非路由、非权限资源的展示容器，仅归类接口实际返回的入口。 */
export const menuRouteGroups = [
  { code: 'identity', path: '/identity', titleKey: 'route.identity.label', icon: 'usergroup' },
  { code: 'model', path: '/model', titleKey: 'route.model.label', icon: 'app' },
  { code: 'cost', path: '/cost', titleKey: 'route.cost.label', icon: 'wallet' },
  { code: 'system', path: '/system', titleKey: 'route.system.label', icon: 'setting' },
  { code: 'personal', path: '/account', titleKey: 'route.personal.label', icon: 'user' },
] as const

/** 仅辅助角色授权表单分组，不能用于生成导航或授予能力。 */
export const businessRoutes: RouteRecordRaw[] = [
  ['model', 'route.model.label'],
  ['identity', 'route.identity.label'],
  ['cost', 'route.cost.label'],
  ['system', 'route.system.label'],
  ['audit', 'route.audit.label'],
  ['personal', 'route.personal.label'],
].map(([prefix, title]) => ({
  path: prefix!,
  meta: { title },
  children: Object.values(routeRegistry).filter((route) =>
    route.meta?.permission?.startsWith(`${prefix}.`),
  ),
}))

export function canEnterRoute(routeId: string, permissions: string[]): boolean {
  const route = Object.prototype.hasOwnProperty.call(routeRegistry, routeId)
    ? routeRegistry[routeId]
    : undefined
  if (!route) return false
  const resource = route.meta?.permission
  return !resource || permissions.includes(resource)
}
