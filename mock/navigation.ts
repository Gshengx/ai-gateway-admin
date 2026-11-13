import type { Capability, Navigation } from '../src/api/modules/auth'

/** Mock catalog mirrors the current navigation contract, independently of page components. */
const catalog: {
  groups: string[]
  groupTitles: [string, string][]
  items: { id: string; title: [string, string]; resource: string | null; group?: string }[]
} = {
  groups: ['identity', 'model', 'cost', 'system', 'personal'],
  groupTitles: [
    ['身份管理', 'Identity management'],
    ['模型接入', 'Model access'],
    ['成本与预算', 'Cost and budget'],
    ['系统管理', 'System management'],
    ['个人中心', 'Personal center'],
  ],
  items: [
    {
      id: 'users',
      title: ['用户管理', 'User management'],
      resource: 'identity.users',
      group: 'identity',
    },
    {
      id: 'groups',
      title: ['用户组管理', 'User group management'],
      resource: 'identity.groups',
      group: 'identity',
    },
    {
      id: 'identity_projects',
      title: ['项目管理', 'Project management'],
      resource: 'identity.projects',
      group: 'identity',
    },
    {
      id: 'roles',
      title: ['角色管理', 'Role management'],
      resource: 'identity.roles',
      group: 'identity',
    },
    {
      id: 'managed_keys',
      title: ['API Key管理', 'API key management'],
      resource: 'identity.keys',
      group: 'identity',
    },
    {
      id: 'model_providers',
      title: ['供应商', 'Providers'],
      resource: 'model.providers',
      group: 'model',
    },
    {
      id: 'model_models',
      title: ['模型管理', 'Model management'],
      resource: 'model.models',
      group: 'model',
    },
    {
      id: 'cost_bills',
      title: ['消费账单', 'Consumption bills'],
      resource: 'cost.bills',
      group: 'cost',
    },
    {
      id: 'cost_expenses',
      title: ['费用明细', 'Expense details'],
      resource: 'cost.expenses',
      group: 'cost',
    },
    {
      id: 'cost_budgets',
      title: ['预算管理', 'Budget management'],
      resource: 'cost.budgets',
      group: 'cost',
    },
    {
      id: 'settings',
      title: ['通用配置', 'General settings'],
      resource: 'system.settings',
      group: 'system',
    },
    {
      id: 'management_audit',
      title: ['系统日志', 'System logs'],
      resource: 'audit.management',
      group: 'system',
    },
    {
      id: 'personal_keys',
      title: ['API Keys', 'API Keys'],
      resource: 'personal.keys',
      group: 'personal',
    },
    {
      id: 'overview',
      title: ['工作台', 'Overview'],
      resource: null,
    },
    {
      id: 'permission_resources',
      title: ['权限资源', 'Permission resources'],
      resource: 'identity.permission_resources',
    },
    {
      id: 'terms_acceptances',
      title: ['条款确认记录', 'Terms acceptances'],
      resource: 'audit.terms_acceptances',
    },
    {
      id: 'profile',
      title: ['个人资料', 'Personal profile'],
      resource: 'personal.profile',
    },
    {
      id: 'change_password',
      title: ['修改密码', 'Change password'],
      resource: null,
    },
    {
      id: 'terms',
      title: ['用户须知', 'Terms of use'],
      resource: null,
    },
  ],
}

export function mockNavigation(
  locale: string,
  capabilities: Capability[],
  trustedSuperAdmin: boolean,
): Navigation {
  const english = ['en', 'en-us', 'en-gb'].includes(locale.toLowerCase())
  const language = english ? 'en' : 'zh-CN'
  const titleIndex = english ? 1 : 0
  const items = catalog.items.flatMap((item, index) => {
    if (
      item.resource &&
      !capabilities.some((cap) => cap.resource_code === item.resource && cap.can_read)
    )
      return []
    if (['roles', 'permission_resources'].includes(item.id) && !trustedSuperAdmin) return []
    return [
      {
        menu_code: item.id,
        route_id: item.id,
        ...(item.group ? { parent_group_code: item.group } : {}),
        title: item.title[titleIndex],
        title_locale: language,
        sort_order: (index + 1) * 10,
        sidebar_hidden: index >= 13,
      },
    ]
  })
  return {
    schema_version: 3,
    catalog_version: 'sha256:753009296de15f838edb5f483c0fd3f0fe29a53acf1f30e60932aab3730c5a5c',
    locale: language,
    groups: catalog.groups.flatMap((code, index) =>
      items.some((item) => !item.sidebar_hidden && item.parent_group_code === code)
        ? [
            {
              group_code: code,
              title: catalog.groupTitles[index]![titleIndex],
              title_locale: language,
              sort_order: (index + 1) * 10,
            },
          ]
        : [],
    ),
    items,
  }
}
