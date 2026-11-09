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
  providers: {
    path: '/model/providers',
    name: 'ModelProviders',
    component: () => import('@/views/model/providers/index.vue'),
    meta: { permission: 'model.providers', icon: 'app' },
  },
  physical_models: {
    path: '/model/models',
    name: 'ModelModels',
    component: () => import('@/views/model/models/index.vue'),
    meta: { permission: 'model.models', icon: 'app' },
  },
  logical_models: {
    path: '/model/logical-models',
    alias: '/model/logical',
    name: 'ModelLogical',
    component: () => import('@/views/model/logical/index.vue'),
    meta: { permission: 'model.logical', icon: 'app' },
  },
  model_admission: {
    path: '/model/admission',
    name: 'ModelAdmission',
    component: placeholder,
    meta: { permission: 'model.admission' },
  },
  model_permissions: {
    path: '/model/permissions',
    name: 'ModelPermissions',
    component: placeholder,
    meta: { permission: 'model.permissions' },
  },
  model_pricing: {
    path: '/model/pricing',
    name: 'ModelPricing',
    component: placeholder,
    meta: { permission: 'model.pricing' },
  },
  model_review: {
    path: '/model/review',
    name: 'ModelReview',
    component: placeholder,
    meta: { permission: 'model.review' },
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
  { code: 'model_access', path: '/model', titleKey: 'route.model.label', icon: 'app' },
  { code: 'system', path: '/system', titleKey: 'route.system.label', icon: 'setting' },
  { code: 'personal', path: '/account', titleKey: 'route.personal.label', icon: 'user' },
] as const

/** 仅辅助角色授权表单分组，不能用于生成导航或授予能力。 */
export const businessRoutes: RouteRecordRaw[] = [
  ['model', 'route.model.label'],
  ['identity', 'route.identity.label'],
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
  return !resource || permissions.includes(resource) || permissions.includes(`${resource}:write`)
}
