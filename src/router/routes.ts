import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由 Meta 约定：
 * - title：菜单/面包屑标题的 i18n key（语言包见 src/locales/route.*，父级分组用 label 子键）
 * - icon：菜单图标（tdesign-icons 组件名，字符串映射）
 * - permission：访问该路由所需权限码（can_read 级，取后端 resource_code 点分格式如 identity.users）；不填则登录即可访问
 * - hideInMenu：不在菜单中展示（如详情页）
 */
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: string
    permission?: string
    hideInMenu?: boolean
  }
}

/**
 * 业务路由（需登录，按权限过滤后动态注册到布局路由下）。
 * 目录与菜单结构一一对应，新增页面时在此追加，并在语言包补充 route.* 文案。
 */
export const businessRoutes: RouteRecordRaw[] = [
  {
    path: 'dashboard',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: { title: 'route.dashboard', icon: 'dashboard' },
  },

  // ========== 身份管理 ==========
  {
    path: 'identity',
    name: 'Identity',
    redirect: '/identity/users',
    meta: { title: 'route.identity.label', icon: 'usergroup' },
    children: [
      {
        path: 'users',
        name: 'IdentityUsers',
        component: () => import('@/views/identity/users/index.vue'),
        meta: { title: 'route.identity.users', permission: 'identity.users' },
      },
      {
        path: 'groups',
        name: 'IdentityGroups',
        component: () => import('@/views/identity/groups/index.vue'),
        meta: { title: 'route.identity.groups', permission: 'identity.groups' },
      },
      {
        path: 'roles',
        name: 'IdentityRoles',
        component: () => import('@/views/identity/roles/index.vue'),
        meta: { title: 'route.identity.roles', permission: 'identity.roles' },
      },
      {
        path: 'keys',
        name: 'IdentityKeys',
        component: () => import('@/views/identity/keys/index.vue'),
        meta: { title: 'route.identity.keys', permission: 'identity.keys' },
      },
    ],
  },

  // ========== 模型接入 ==========
  {
    path: 'model',
    name: 'Model',
    redirect: '/model/providers',
    meta: { title: 'route.model.label', icon: 'app' },
    children: [
      {
        path: 'providers',
        name: 'ModelProviders',
        component: () => import('@/views/model/providers/index.vue'),
        meta: { title: 'route.model.providers', permission: 'model.providers' },
      },
      {
        path: 'models',
        name: 'ModelModels',
        component: () => import('@/views/model/models/index.vue'),
        meta: { title: 'route.model.models', permission: 'model.models' },
      },
      {
        path: 'logical',
        name: 'ModelLogical',
        component: () => import('@/views/model/logical/index.vue'),
        meta: { title: 'route.model.logical', permission: 'model.logical' },
      },
      {
        path: 'logical/:logical_model_id',
        name: 'ModelLogicalDetail',
        component: () => import('@/views/model/logical/detail.vue'),
        meta: { title: 'route.model.logicalDetail', permission: 'model.logical', hideInMenu: true },
      },
    ],
  },

  // ========== 成本与预算 ==========
  {
    path: 'cost',
    name: 'Cost',
    redirect: '/cost/bills',
    meta: { title: 'route.cost.label', icon: 'wallet' },
    children: [
      {
        path: 'bills',
        name: 'CostBills',
        component: () => import('@/views/cost/bills/index.vue'),
        meta: { title: 'route.cost.bills', permission: 'cost.bills' },
      },
      {
        path: 'budgets',
        name: 'CostBudgets',
        component: () => import('@/views/cost/budgets/index.vue'),
        meta: { title: 'route.cost.budgets', permission: 'cost.budgets' },
      },
    ],
  },

  // ========== AI 安全治理 ==========
  {
    path: 'security',
    name: 'Security',
    redirect: '/security/access-control',
    meta: { title: 'route.security.label', icon: 'secured' },
    children: [
      {
        path: 'access-control',
        name: 'SecurityAccessControl',
        component: () => import('@/views/security/policies/index.vue'),
        props: { domain: 'ACCESS_CONTROL' },
        meta: { title: 'route.security.accessControl', permission: 'security.accessControl' },
      },
      {
        path: 'data-control',
        name: 'SecurityDataControl',
        component: () => import('@/views/security/data-control/index.vue'),
        meta: { title: 'route.security.dataControl', permission: 'security.dataControl' },
      },
      {
        path: 'detection',
        name: 'SecurityDetection',
        component: () => import('@/views/security/detection/index.vue'),
        meta: { title: 'route.security.detection', permission: 'security.detection' },
      },
      {
        path: 'audit',
        name: 'SecurityAudit',
        component: () => import('@/views/security/policies/index.vue'),
        props: { domain: 'AUDIT' },
        meta: { title: 'route.security.audit', permission: 'security.audit' },
      },
      {
        path: 'allowlist',
        name: 'SecurityAllowlist',
        component: () => import('@/views/security/allowlist/index.vue'),
        meta: { title: 'route.security.allowlist', permission: 'security.allowlists' },
      },
      {
        path: 'content/rules',
        redirect: '/security/data-control?tab=rules',
        meta: { hideInMenu: true, permission: 'security.dataControl' },
      },
    ],
  },

  // ========== 审计中心 ==========
  {
    path: 'audit',
    name: 'Audit',
    redirect: '/audit/access/records',
    meta: { title: 'route.audit.label', icon: 'file-search' },
    children: [
      {
        path: 'access/records',
        name: 'AuditAccessRecords',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.audit.accessRecords', permission: 'audit.records' },
      },
      {
        path: 'events/list',
        name: 'AuditEvents',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.audit.events', permission: 'audit.events' },
      },
      {
        path: 'reports',
        name: 'AuditReports',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.audit.reports', permission: 'audit.reports' },
      },
    ],
  },

  // ========== 系统管理 ==========
  {
    path: 'system',
    name: 'System',
    redirect: '/system/settings',
    meta: { title: 'route.system.label', icon: 'setting' },
    children: [
      {
        path: 'settings',
        name: 'SystemSettings',
        component: () => import('@/views/system/settings/index.vue'),
        meta: { title: 'route.system.settings', permission: 'system.settings' },
      },
      {
        path: 'cluster',
        name: 'SystemCluster',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.system.cluster', permission: 'system.clusters' },
      },
      {
        path: 'license',
        name: 'SystemLicense',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.system.license', permission: 'system.licenses' },
      },
      {
        path: 'logs',
        name: 'SystemLogs',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.system.logs', permission: 'system.logs' },
      },
    ],
  },

  // ========== 个人中心（登录即可访问，无权限码） ==========
  {
    path: 'personal',
    name: 'Personal',
    redirect: '/personal/overview',
    meta: { title: 'route.personal.label', icon: 'user' },
    children: [
      {
        path: 'overview',
        name: 'PersonalOverview',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.personal.overview', permission: 'personal.profile' },
      },
      {
        path: 'keys',
        name: 'PersonalKeys',
        component: () => import('@/views/personal/keys/index.vue'),
        meta: { title: 'route.personal.keys', permission: 'personal.keys' },
      },
    ],
  },

  // ========== 智能路由 / 工单与流程 ==========
  {
    path: 'routing',
    name: 'Routing',
    redirect: '/routing/policies/config',
    meta: { title: 'route.routing.label', icon: 'swap' },
    children: [
      {
        path: 'policies/config',
        name: 'RoutingPolicies',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.routing.policies', permission: 'routing.policies' },
      },
      {
        path: 'matrix',
        name: 'RoutingMatrix',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.routing.matrix', permission: 'routing.matrix' },
      },
    ],
  },
  {
    path: 'workflow',
    name: 'Workflow',
    redirect: '/workflow/flows',
    meta: { title: 'route.workflow.label', icon: 'history' },
    children: [
      {
        path: 'flows',
        name: 'WorkflowFlows',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.workflow.flows', permission: 'workflow.flows' },
      },
      {
        path: 'approvals',
        name: 'WorkflowApprovals',
        component: () => import('@/views/common/placeholder.vue'),
        meta: { title: 'route.workflow.approvals', permission: 'workflow.approvals' },
      },
    ],
  },
]
