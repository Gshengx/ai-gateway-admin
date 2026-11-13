import { runtimeState, nextSequence, directory, apiKeys, preferencesFor } from './_runtime'
import { userProjects } from './_projects'
import { mockAccounts, mockRoles } from './_accounts'
import { CAPABILITIES, CAPABILITY_NAMES } from './_capabilities'
import { getPasswordRules } from './settings'
import { termsAcceptances, userTermsInfo } from './terms'
import { removeModelSubject } from './_modelAccessState'
import { createHash } from 'node:crypto'
import {
  checkToken,
  auditedMock,
  revokeUserTokens,
  setMockPasswordRequired,
  mockId,
  fail,
  pathId,
  success,
  unauthorized,
  usernameFromToken,
  type MockMethod,
  type MockRequest,
} from './_utils'

function groupOffsetPage<T>(items: T[], req: MockRequest) {
  const page = Math.max(1, Number(firstOf(req.query?.page)) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(firstOf(req.query?.page_size)) || 20))
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total: items.length,
    total_pages: Math.ceil(items.length / pageSize),
  }
}

/** 部门（后端扁平列表，前端按 parent_id 组树） */
interface MockDepartment {
  id: string
  name: string
  description: string
  parent_id: string | null
  sort_order: number
  translations: Record<string, { name: string; description: string }>
}

interface MockRole {
  id: string
  name: string
  code: string
  description: string
  is_builtin: boolean
  translations: Record<string, { name: string; description: string }>
}

interface MockUser {
  id: string
  username: string
  display_name: string
  email: string | null
  phone: string | null
  department_id: string | null
  role_id: string | null
  status: 'ACTIVE' | 'DISABLED'
  last_login_at: string | null
  created_at: string
  updated_at: string
}

/** 用户组：成员以 user id 关联，用户列表中的 groups 由成员关系反查 */
interface MockGroup {
  id: string
  name: string
  description: string
  member_ids: string[]
  created_at: string
  updated_at: string
  created_by: string
  created_by_user_id: string
  created_by_username: string
}

const DEPARTMENTS = runtimeState<MockDepartment[]>('departments', () => [
  {
    id: 'd-root',
    name: '总部',
    description: '集团总部',
    parent_id: null,
    sort_order: 1,
    translations: { 'en-US': { name: 'Headquarters', description: 'Group headquarters' } },
  },
  {
    id: 'd-tech',
    name: '技术中心',
    description: '研发与技术中台',
    parent_id: 'd-root',
    sort_order: 1,
    translations: {
      'en-US': { name: 'Technology Center', description: 'R&D and technology platform' },
    },
  },
  {
    id: 'd-platform',
    name: '平台研发部',
    description: '网关与平台研发',
    parent_id: 'd-tech',
    sort_order: 1,
    translations: {
      'en-US': { name: 'Platform R&D', description: 'Gateway and platform development' },
    },
  },
  {
    id: 'd-algo',
    name: '算法研究部',
    description: '模型与算法研究',
    parent_id: 'd-tech',
    sort_order: 2,
    translations: {
      'en-US': { name: 'Algorithm Research', description: 'Model and algorithm research' },
    },
  },
  {
    id: 'd-product',
    name: '产品设计部',
    description: '产品与体验设计',
    parent_id: 'd-root',
    sort_order: 2,
    translations: {
      'en-US': { name: 'Product Design', description: 'Product and experience design' },
    },
  },
  {
    id: 'd-marketing',
    name: '市场营销部',
    description: '市场与品牌',
    parent_id: 'd-root',
    sort_order: 3,
    translations: { 'en-US': { name: 'Marketing', description: 'Market and brand' } },
  },
  {
    id: 'd-security',
    name: '安全合规部',
    description: '安全与合规治理',
    parent_id: 'd-root',
    sort_order: 4,
    translations: {
      'en-US': { name: 'Security & Compliance', description: 'Security and compliance' },
    },
  },
  {
    id: 'd-finance',
    name: '财务管理部',
    description: '预算与财务',
    parent_id: 'd-root',
    sort_order: 5,
    translations: { 'en-US': { name: 'Finance', description: 'Budget and finance' } },
  },
  {
    id: 'd-data',
    name: '数据分析部',
    description: '数据治理与分析',
    parent_id: 'd-root',
    sort_order: 6,
    translations: {
      'en-US': { name: 'Data Analytics', description: 'Data governance and analytics' },
    },
  },
  {
    id: 'd-ops',
    name: '运营管理部',
    description: '平台运营',
    parent_id: 'd-root',
    sort_order: 7,
    translations: { 'en-US': { name: 'Operations', description: 'Platform operations' } },
  },
  {
    id: 'd-support',
    name: '客户支持部',
    description: '客户服务与支持',
    parent_id: 'd-root',
    sort_order: 8,
    translations: {
      'en-US': { name: 'Customer Support', description: 'Customer service and support' },
    },
  },
  {
    id: 'd-hr',
    name: '人力资源部',
    description: '人力与组织发展',
    parent_id: 'd-root',
    sort_order: 9,
    translations: { 'en-US': { name: 'Human Resources', description: 'People and organization' } },
  },
])
const ROLES: MockRole[] = [
  {
    id: 'role-super-admin',
    name: '超级管理员',
    code: 'super_admin',
    description: '拥有全部权限',
    is_builtin: true,
    translations: { 'en-US': { name: 'Super Admin', description: 'All permissions' } },
  },
  {
    id: 'role-sys-admin',
    name: '系统管理员',
    code: 'sys_admin',
    description: '系统配置与运维',
    is_builtin: true,
    translations: { 'en-US': { name: 'System Admin', description: 'System configuration' } },
  },
  {
    id: 'role-security-admin',
    name: '安全管理员',
    code: 'security_admin',
    description: '安全策略与审计',
    is_builtin: true,
    translations: {
      'en-US': { name: 'Security Admin', description: 'Security policies and audit' },
    },
  },
  {
    id: 'role-auditor',
    name: '审计员',
    code: 'auditor',
    description: '只读审计',
    is_builtin: true,
    translations: { 'en-US': { name: 'Auditor', description: 'Read-only audit' } },
  },
  {
    id: 'role-user',
    name: '普通用户',
    code: 'user',
    description: '默认角色',
    is_builtin: true,
    translations: { 'en-US': { name: 'Standard User', description: 'Default role' } },
  },
  {
    id: 'role-dev-lead',
    name: '研发负责人',
    code: 'dev_lead',
    description: '研发团队负责人',
    is_builtin: false,
    translations: { 'en-US': { name: 'R&D Lead', description: 'R&D team lead' } },
  },
  {
    id: 'role-dept-admin',
    name: '部门管理员',
    code: 'dept_admin',
    description: '部门成员管理',
    is_builtin: false,
    translations: {
      'en-US': { name: 'Department Admin', description: 'Department member management' },
    },
  },
]

/** 各部门人数分布，合计 57，覆盖「含子部门人数」的展示 */
const DEPT_PLAN: Array<[string, number]> = [
  ['d-root', 4],
  ['d-tech', 2],
  ['d-platform', 12],
  ['d-algo', 10],
  ['d-product', 8],
  ['d-marketing', 8],
  ['d-security', 8],
  ['d-finance', 5],
]

const DEPT_IDS = DEPT_PLAN.flatMap(([id, count]) => Array.from({ length: count }, () => id))

const GROUP_PLAN: Array<{ name: string; description: string; count: number }> = [
  { name: '研发骨干', description: '负责网关核心链路研发与值班的骨干成员', count: 16 },
  { name: 'AI 创新实验组', description: '探索大模型接入与智能体能力的试点成员', count: 12 },
  { name: '数据安全工作组', description: '负责数据分级、脱敏与审计合规的跨部门小组', count: 10 },
  { name: '产品体验共创组', description: '产品、设计与一线研发共同打磨控制台体验', count: 8 },
  { name: '新员工培训组', description: '入职三个月内的新同学，统一接收培训通知', count: 7 },
]

const SURNAMES = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙']
const GIVEN_NAMES = [
  '伟',
  '芳',
  '娜',
  '敏',
  '静',
  '磊',
  '强',
  '洋',
  '艳',
  '勇',
  '军',
  '杰',
  '娟',
  '涛',
  '明',
  '超',
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^1[3-9]\d{9}$/
/** 与真实后端一致：username 最长 128 */
const USERNAME_RE = /^[A-Za-z0-9._-]{2,128}$/
const DISPLAY_NAME_MAX = 128
const DEPARTMENT_NAME_MAX = 128
const DEPARTMENT_DESCRIPTION_MAX = 2048
/** 与真实后端一致：用户组名称最长 128、描述最长 2048 */
const GROUP_NAME_MAX = 128
const GROUP_DESCRIPTION_MAX = 2048

const TOTAL = 57

const SUPPORTED_LOCALES = [
  { locale_code: 'zh-CN', native_name: '简体中文', sort_order: 1, status: 'ACTIVE' as const },
  { locale_code: 'en-US', native_name: 'English', sort_order: 2, status: 'ACTIVE' as const },
]

const LOCALE_CODES = SUPPORTED_LOCALES.map((item) => item.locale_code)
const DEFAULT_LOCALE = 'zh-CN'

function toIso(date: Date): string {
  return date.toISOString()
}

function roleIdOf(index: number): string {
  if (index === 0) return 'role-super-admin'
  const slot = index % 7
  if (slot === 1) return 'role-sys-admin'
  if (slot === 2) return 'role-security-admin'
  if (slot === 3) return 'role-auditor'
  if (slot === 4) return 'role-dev-lead'
  if (slot === 5) return 'role-dept-admin'
  return 'role-user'
}

/** 生成稳定的 mock 用户集（不依赖随机数，刷新后数据一致，便于调试分页与筛选） */
function buildUsers(): MockUser[] {
  const createdBase = Date.UTC(2026, 0, 5, 2, 0, 0)
  const loginBase = Date.UTC(2026, 9, 27, 3, 31, 43)
  return Array.from({ length: TOTAL }, (_, index) => {
    const isAdmin = index === 0
    const nameIndex = Math.max(index - 1, 0)
    const surname = SURNAMES[nameIndex % SURNAMES.length]
    const given = GIVEN_NAMES[Math.floor(nameIndex / SURNAMES.length) % GIVEN_NAMES.length]
    const username = isAdmin ? 'admin' : `user_${String(index).padStart(3, '0')}`
    const createdAt = toIso(new Date(createdBase + index * 36 * 3600 * 1000))
    return {
      id: `u-${String(index + 1).padStart(4, '0')}`,
      username,
      display_name: isAdmin ? '陈知远' : `${surname}${given}`,
      // 每 9 条留一个空邮箱，覆盖 email 为 null 的展示分支
      email: isAdmin
        ? 'chenzhiyuan@ais-demo.com'
        : index % 9 === 0
          ? null
          : `${username}@ais-demo.com`,
      phone: index % 11 === 0 ? null : `138${String(10000000 + index * 137).slice(-8)}`,
      department_id: DEPT_IDS[index] ?? null,
      role_id: roleIdOf(index),
      status: !isAdmin && index % 7 === 0 ? 'DISABLED' : 'ACTIVE',
      last_login_at: isAdmin
        ? toIso(new Date(loginBase))
        : index % 13 === 0
          ? null
          : toIso(new Date(loginBase - index * 5.5 * 3600 * 1000)),
      created_at: createdAt,
      updated_at: createdAt,
    }
  })
}

const users = runtimeState('users', buildUsers)
const GROUPS = runtimeState('groups', buildGroups)
const org = runtimeState('orgVersion', () => ({ value: 1 }))

runtimeState('configuredUsers', () => {
  for (const account of mockAccounts.values()) {
    if (!users.some((user) => user.username === account.username))
      users.push({
        id: mockId(account.username),
        username: account.username,
        display_name: account.username,
        email: null,
        phone: null,
        department_id: 'd-root',
        role_id: ROLES.find((role) => role.code === account.role)?.id ?? null,
        status: 'ACTIVE',
        last_login_at: null,
        created_at: toIso(new Date()),
        updated_at: toIso(new Date()),
      })
  }
  return true
})
for (const user of users) directory.set(user.username, user)
function cleanUser(user: MockUser) {
  directory.delete(user.username)
  mockAccounts.delete(user.username)
  revokeUserTokens(user.username)
  for (const group of GROUPS) group.member_ids = group.member_ids.filter((id) => id !== user.id)
  for (let i = apiKeys.length - 1; i >= 0; i--)
    if (apiKeys[i].user_id === user.id) apiKeys.splice(i, 1)
  removeModelSubject('USER', user.id)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function apiRole(role: MockRole, locale: string) {
  return {
    id: role.id,
    name: role.name,
    display_name: localized(role.translations, role.name, locale),
    description: role.description,
    display_description: role.translations[locale]?.description ?? role.description,
    builtin_code: role.is_builtin ? role.code : null,
    is_builtin: role.is_builtin,
    permissions_version: '1',
    user_count: users.filter((user) => user.role_id === role.id).length,
    created_at: toIso(new Date(Date.UTC(2026, 0, 1))),
    updated_at: toIso(new Date(Date.UTC(2026, 0, 1))),
    requested_locale: locale,
    resolved_locale: locale,
  }
}
function resourceRestriction(code: string, locale: string) {
  const descriptions: Record<string, [string, string]> = {
    'identity.permission_resources': ['受保护资源，仅供查看', 'Protected resource; view only'],
    'demo.control_plane': ['资源已禁用，仅供查看', 'Disabled resource; view only'],
    'audit.annotations': ['该资源不可分配，仅供查看', 'Resource is not assignable; view only'],
  }
  return descriptions[code]?.[locale.startsWith('en') ? 1 : 0] ?? ''
}
function roleResources(locale: string) {
  return CAPABILITIES.map((capability, index) => ({
    id: mockId(`permission-${capability.resource_code}`),
    resource_code: capability.resource_code,
    display_name: CAPABILITY_NAMES[capability.resource_code]?.[0] ?? capability.resource_code,
    description: resourceRestriction(capability.resource_code, 'zh-CN'),
    localized_name:
      CAPABILITY_NAMES[capability.resource_code]?.[locale.startsWith('en') ? 1 : 0] ??
      capability.resource_code,
    localized_description: resourceRestriction(capability.resource_code, 'zh-CN'),
    requested_locale: locale,
    resolved_locale: locale,
    status: capability.resource_code === 'demo.control_plane' ? 'DISABLED' : 'ACTIVE',
    management_policy:
      capability.resource_code === 'audit.annotations' ? 'SUPER_ADMIN_ONLY' : 'STANDARD',
    is_builtin: true,
    is_protected: capability.resource_code === 'identity.permission_resources',
    registered_in_code: true,
    sort_order: index,
    grant_count: ROLES.filter((role) => {
      const grant =
        role.code === 'super_admin'
          ? capability
          : mockRoles
              .get(role.code)
              ?.find((item) => item.resource_code === capability.resource_code)
      return grant?.can_read || grant?.can_write
    }).length,
    actions: ['READ', 'WRITE'],
  }))
}

function firstOf(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** 请求语言：优先 query.locale，其次 Accept-Language，最后默认中文 */
function requestLocale(req: MockRequest): string {
  const fromQuery = firstOf(req.query?.locale)
  if (fromQuery && LOCALE_CODES.includes(fromQuery)) return fromQuery
  const header = req.headers?.['accept-language'] ?? req.headers?.['Accept-Language']
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value === 'string') {
    const code = value.split(',')[0]?.trim()
    if (code && LOCALE_CODES.includes(code)) return code
  }
  return DEFAULT_LOCALE
}

function localized(
  translations: Record<string, { name: string; description: string }>,
  fallback: string,
  locale: string,
): string {
  return translations[locale]?.name || fallback
}

function departmentOf(id: string | null): MockDepartment | undefined {
  return id ? DEPARTMENTS.find((d) => d.id === id) : undefined
}

function roleOf(id: string | null): MockRole | undefined {
  return id ? ROLES.find((r) => r.id === id) : undefined
}

function departmentPath(id: string): string {
  const names: string[] = []
  let cursor = DEPARTMENTS.find((d) => d.id === id)
  while (cursor) {
    names.unshift(cursor.name)
    cursor = cursor.parent_id ? DEPARTMENTS.find((d) => d.id === cursor?.parent_id) : undefined
  }
  return names.join('/')
}

function descendantDepartmentIds(id: string): string[] {
  const result = [id]
  const walk = (parentId: string) => {
    DEPARTMENTS.filter((d) => d.parent_id === parentId).forEach((child) => {
      result.push(child.id)
      walk(child.id)
    })
  }
  walk(id)
  return result
}

/** 含子部门人数（与原型展示口径一致） */
function aggregateUserCount(id: string): number {
  const scope = descendantDepartmentIds(id)
  return users.filter((u) => u.department_id && scope.includes(u.department_id)).length
}

function depthOf(id: string): number {
  let depth = 0
  let cursor = DEPARTMENTS.find((d) => d.id === id)
  while (cursor?.parent_id) {
    depth += 1
    cursor = DEPARTMENTS.find((d) => d.id === cursor?.parent_id)
  }
  return depth
}

/** 生成稳定的初始用户组：成员按用户顺序切分 */
function buildGroups(): MockGroup[] {
  let offset = 0
  return GROUP_PLAN.map((plan, index) => {
    const memberIds = users.slice(offset, offset + plan.count).map((user) => user.id)
    offset += plan.count
    const creator = users[index] ?? users[0]
    const createdAt = toIso(new Date(Date.UTC(2026, 8, 1 + index, 2, 0, 0)))
    return {
      id: `g-${index + 1}`,
      name: plan.name,
      description: plan.description,
      member_ids: memberIds,
      created_at: createdAt,
      updated_at: createdAt,
      created_by: creator?.display_name ?? '超级管理员',
      created_by_user_id: creator?.id ?? '',
      created_by_username: creator?.username ?? 'admin',
    }
  })
}

function groupsOfUser(userId: string): MockGroup[] {
  return GROUPS.filter((group) => group.member_ids.includes(userId))
}

function nextGroupId(): string {
  const id = `g-${nextSequence('group', GROUP_PLAN.length)}`
  return id
}

function toApiGroup(group: MockGroup, locale: string) {
  const creator = group.created_by_user_id
    ? {
        user_id: group.created_by_user_id,
        username: group.created_by_username,
        display_name: group.created_by,
      }
    : null
  return {
    id: group.id,
    name: group.name,
    display_name: group.name,
    description: group.description,
    display_description: group.description,
    created_at: group.created_at,
    updated_at: group.updated_at,
    created_by: creator,
    can_manage: true,
    has_out_of_scope_members: false,
    membership_version: 1,
    requested_locale: locale,
    resolved_locale: locale,
    total_member_count: group.member_ids.length,
    visible_member_count: group.member_ids.length,
    write_blocking_code: null,
  }
}

function toApiGroupMember(user: MockUser, locale: string) {
  const department = departmentOf(user.department_id)
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    status: user.status,
    department: department
      ? {
          id: department.id,
          name: department.name,
          display_name: localized(department.translations, department.name, locale),
          requested_locale: locale,
          resolved_locale: locale,
        }
      : null,
  }
}

function validateGroup(name: string, description: string, excludeId?: string): string | null {
  if (!name) return '请输入用户组名称'
  if (name.length > GROUP_NAME_MAX) return `用户组名称长度不能超过 ${GROUP_NAME_MAX} 个字符`
  if (description.length > GROUP_DESCRIPTION_MAX) {
    return `描述长度不能超过 ${GROUP_DESCRIPTION_MAX} 个字符`
  }
  if (GROUPS.some((group) => group.name === name && group.id !== excludeId)) {
    return '用户组名称已存在'
  }
  return null
}

function toApiUser(user: MockUser, locale: string) {
  const department = departmentOf(user.department_id)
  const role = roleOf(user.role_id)
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    phone: user.phone,
    department: department
      ? {
          id: department.id,
          name: department.name,
          display_name: localized(department.translations, department.name, locale),
          requested_locale: locale,
          resolved_locale: locale,
        }
      : null,
    groups: groupsOfUser(user.id).map((group) => ({
      id: group.id,
      name: group.name,
      display_name: group.name,
      requested_locale: locale,
      resolved_locale: locale,
    })),
    projects: userProjects(user.id),
    role: role
      ? {
          id: role.id,
          name: role.name,
          display_name: localized(role.translations, role.name, locale),
          requested_locale: locale,
          resolved_locale: locale,
        }
      : null,
    status: user.status,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
    must_change_password: mockAccounts.get(user.username)?.needs_password ?? false,
    ai_access_status: 'ACTIVE',
  }
}

function toApiDepartment(department: MockDepartment, locale: string, matched = false) {
  return {
    id: department.id,
    name: department.name,
    display_name: localized(department.translations, department.name, locale),
    parent_id: department.parent_id,
    depth: depthOf(department.id),
    sort_order: department.sort_order,
    description: department.translations[locale]?.description || department.description,
    has_children: DEPARTMENTS.some((d) => d.parent_id === department.id),
    matched,
    user_count: aggregateUserCount(department.id),
    requested_locale: locale,
    resolved_locale: locale,
  }
}

function validateProfile(payload: {
  display_name: string
  email: string
  phone: string
  department_id: string
  role_id: string
}): string | null {
  if (!payload.display_name) return '请输入姓名'
  if (payload.display_name.length > DISPLAY_NAME_MAX) {
    return `姓名长度不能超过 ${DISPLAY_NAME_MAX} 个字符`
  }
  if (payload.email && !EMAIL_RE.test(payload.email)) return '邮箱格式不正确'
  if (payload.phone && !PHONE_RE.test(payload.phone)) return '手机号格式不正确'
  if (!DEPARTMENTS.some((d) => d.id === payload.department_id)) return '所属部门不存在'
  if (!ROLES.some((r) => r.id === payload.role_id)) return '角色不存在'
  return null
}

function passwordError(password: string): string | null {
  const rules = getPasswordRules()
  if (password.length < rules.min_length || password.length > rules.max_length)
    return '密码长度不符合密码策略'
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  if (classes < rules.complexity_categories)
    return '密码需包含大写字母、小写字母、数字、特殊字符中的至少三种'
  return null
}

function resolveRole(value: string): MockRole | undefined {
  const target = value.trim()
  if (!target) return undefined
  return ROLES.find(
    (r) =>
      r.name === target ||
      r.code === target ||
      r.id === target ||
      r.translations['en-US']?.name === target,
  )
}

/** restful 路径中后缀前一段的 id，如 /users/u-0001/enable → u-0001 */
function segmentBefore(url: string | undefined, suffix: string): string {
  const parts = (url ?? '').split('?')[0].split('/').filter(Boolean)
  const index = parts.lastIndexOf(suffix)
  return index > 0 ? decodeURIComponent(parts[index - 1]) : ''
}

function pathSegmentBefore(req: MockRequest, suffix: string): string {
  return segmentBefore(req.url, suffix)
}

function nextUserId(): string {
  const id = `u-${String(nextSequence('user', TOTAL)).padStart(4, '0')}`
  return id
}

function createUser(fields: {
  initial_password?: string
  username: string
  display_name: string
  email: string
  phone: string
  department_id: string
  role_id: string
}): MockUser {
  const now = toIso(new Date())
  const user: MockUser = {
    id: nextUserId(),
    username: fields.username,
    display_name: fields.display_name,
    email: fields.email || null,
    phone: fields.phone || null,
    department_id: fields.department_id,
    role_id: fields.role_id,
    status: 'ACTIVE',
    last_login_at: null,
    created_at: now,
    updated_at: now,
  }
  // 就地插入，保持 users 数组引用不变（各 mock 路由共享同一实例）
  users.unshift(user)
  directory.set(user.username, user)
  if (fields.initial_password)
    mockAccounts.set(user.username, {
      username: user.username,
      password: fields.initial_password,
      role: roleOf(user.role_id)?.code ?? 'user',
      needs_password: false,
    })
  return user
}

interface MockImportPreviewRow {
  row_number: number
  username: string
  disposition: 'CREATE' | 'OVERWRITE' | 'SKIP' | 'INVALID'
  error_codes: string[]
  fields: {
    display_name: string
    email: string | null
    phone: string | null
    department_path: string
    role_name: string
  }
  /** 仅 mock 内部使用，不返回给前端 */
  password: string
  department_id: string
  role_id: string
  execution_state: 'APPLIED' | 'SKIPPED' | 'FAILED'
}

interface MockImportTask {
  id: string
  state:
    | 'DRAFT'
    | 'PREVIEWING'
    | 'PREVIEW_READY'
    | 'QUEUED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'PARTIAL'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
  total_rows: number
  created_count: number
  failed_count: number
  skipped_count: number
  overwritten_count: number
  duplicate_mode: 'SKIP' | 'OVERWRITE'
  expires_at: string | null
  completed_at: string | null
  last_error_code: string | null
  rows: MockImportPreviewRow[]
}

const importTasks = runtimeState('importTasks', () => new Map<string, MockImportTask>())

function buildImportPreview(inputRows: unknown[], mode: 'SKIP' | 'OVERWRITE'): MockImportTask {
  const usernameCounts = new Map<string, number>()
  inputRows.forEach((raw) => {
    const key = str((raw as Record<string, unknown> | null)?.username).toLowerCase()
    usernameCounts.set(key, (usernameCounts.get(key) ?? 0) + 1)
  })
  const rows: MockImportPreviewRow[] = inputRows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>
    const rowNumber = index + 1
    const username = str(row.username)
    const displayName = str(row.display_name)
    const email = str(row.email)
    const phone = str(row.phone)
    const password = str(row.initial_password)
    const department = DEPARTMENTS.find((d) => departmentPath(d.id) === str(row.department_path))
    const role = resolveRole(str(row.role_name))
    const errors: string[] = []

    const key = username.toLowerCase()
    const exists = users.some((u) => u.username.toLowerCase() === key)
    if (!username || !displayName || !str(row.department_path) || !str(row.role_name)) {
      errors.push('VALIDATION_FAILED')
    }
    if (!department || !role) errors.push('IMPORT_TARGET_NOT_FOUND')
    if (username && (usernameCounts.get(key) ?? 0) > 1) {
      errors.push('IMPORT_DUPLICATE_USERNAME')
    }
    if (!exists) {
      if (!password) errors.push('VALIDATION_FAILED')
      else if (passwordError(password)) errors.push('PASSWORD_POLICY_VIOLATION')
    }

    let disposition: MockImportPreviewRow['disposition'] = 'CREATE'
    if (errors.length) disposition = 'INVALID'
    else if (exists) disposition = mode === 'OVERWRITE' ? 'OVERWRITE' : 'SKIP'

    return {
      row_number: rowNumber,
      username,
      disposition,
      error_codes: errors,
      fields: {
        display_name: displayName,
        email: email || null,
        phone: phone || null,
        department_path: department ? departmentPath(department.id) : str(row.department_path),
        role_name: role ? role.name : str(row.role_name),
      },
      password,
      department_id: department?.id ?? '',
      role_id: role?.id ?? '',
      execution_state: disposition === 'INVALID' ? 'FAILED' : 'SKIPPED',
    }
  })

  const task: MockImportTask = {
    id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const n = Math.floor(Math.random() * 16)
      return (c === 'x' ? n : (n & 3) | 8).toString(16)
    }),
    state: inputRows.length ? 'DRAFT' : 'PREVIEW_READY',
    total_rows: rows.length,
    created_count: 0,
    failed_count: 0,
    skipped_count: 0,
    overwritten_count: 0,
    duplicate_mode: mode,
    expires_at: toIso(new Date(Date.now() + 30 * 24 * 3600 * 1000)),
    completed_at: null,
    last_error_code: null,
    rows,
  }
  importTasks.set(task.id, task)
  return task
}

const pendingImportRows = runtimeState('pendingImportRows', () => new Map<string, number[]>())

function executeImport(task: MockImportTask, selected: number[]) {
  let created = 0
  let overwritten = 0
  task.rows.forEach((row) => {
    if (!selected.includes(row.row_number)) return
    if (row.disposition === 'CREATE') {
      createUser({
        username: row.username,
        initial_password: row.password,
        display_name: row.fields.display_name,
        email: row.fields.email ?? '',
        phone: row.fields.phone ?? '',
        department_id: row.department_id,
        role_id: row.role_id,
      })
      row.execution_state = 'APPLIED'
      created += 1
    } else if (row.disposition === 'OVERWRITE') {
      const existing = users.find((u) => u.username.toLowerCase() === row.username.toLowerCase())
      if (existing) {
        existing.display_name = row.fields.display_name
        existing.email = row.fields.email
        existing.phone = row.fields.phone
        existing.department_id = row.department_id
        existing.role_id = row.role_id
        existing.updated_at = toIso(new Date())
        if (row.password) {
          mockAccounts.set(existing.username, {
            username: existing.username,
            password: row.password,
            role: roleOf(existing.role_id)?.code ?? 'user',
            needs_password: false,
          })
          revokeUserTokens(existing.username)
        }
        row.execution_state = 'APPLIED'
        overwritten += 1
      }
    }
  })

  task.created_count = created
  task.overwritten_count = overwritten
  task.skipped_count = task.rows.filter((row) => row.execution_state === 'SKIPPED').length
  task.failed_count = task.rows.filter((row) => row.disposition === 'INVALID').length
  task.state = task.failed_count ? 'PARTIAL' : 'SUCCEEDED'
  task.completed_at = toIso(new Date())
  pendingImportRows.delete(task.id)
}

function importTaskPayload(task: MockImportTask) {
  const { rows: _rows, ...payload } = task
  void _rows
  return payload
}

function importRowsPayload(task: MockImportTask) {
  return {
    task_id: task.id,
    state: task.state,
    duplicate_mode: task.duplicate_mode,
    preview_counts: {
      create: task.rows.filter((row) => row.disposition === 'CREATE').length,
      invalid: task.rows.filter((row) => row.disposition === 'INVALID').length,
      overwrite: task.rows.filter((row) => row.disposition === 'OVERWRITE').length,
      skip: task.rows.filter((row) => row.disposition === 'SKIP').length,
    },
    rows: task.rows
      .filter((row) => row.disposition === 'INVALID')
      .map((row) => ({
        row_number: row.row_number,
        username: row.username,
        disposition: row.disposition,
        error_codes: row.error_codes,
        fields: row.fields,
      })),
  }
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function importResultCsv(task: MockImportTask): string {
  const header =
    'row_number,username,display_name,department_path,role_name,email,phone,decision,execution_state,error_codes,task_state,task_error_code'
  const lines = task.rows.map((row) =>
    [
      String(row.row_number),
      row.username,
      row.fields.display_name,
      row.fields.department_path,
      row.fields.role_name,
      row.fields.email ?? '',
      row.fields.phone ?? '',
      row.disposition,
      row.execution_state,
      row.error_codes.join(';'),
      task.state,
      task.last_error_code ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  return `\uFEFF${[header, ...lines].join('\n')}\n`
}

/* ---------------------- 用户详情：可访问模型与 API Key ---------------------- */

/** API Key mock 用户数据 */
export function managedKeyOwners(locale: string) {
  return users.map((user) => {
    const department = departmentOf(user.department_id)
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      status: user.status,
      department_id: user.department_id || '',
      department_name: department?.name || '',
      department_display_name: department
        ? localized(department.translations, department.name, locale)
        : '',
    }
  })
}
export function managedKeyDepartmentIds(id: string) {
  return descendantDepartmentIds(id)
}
function batchDeleteDigest(
  deletable: { user_id: string; username: string; display_name: string; reason: string }[],
  excluded: { user_id: string; username: string; display_name: string; reason: string }[],
) {
  const ordered = (rows: typeof deletable) =>
    [...rows].sort((a, b) => a.user_id.localeCompare(b.user_id))
  return createHash('sha256')
    .update(JSON.stringify({ deletable: ordered(deletable), excluded: ordered(excluded) }))
    .digest('hex')
}

export default auditedMock([
  {
    url: '/api/v1/audit/terms-acceptances',
    method: 'get',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const userId = firstOf(req.query?.user_id)
      const items = termsAcceptances().filter((record) => !userId || record.user_id === userId)
      return success(groupOffsetPage(items, req))
    },
  },

  {
    url: '/api/v1/users/:user_id',
    method: 'get',
    timeout: 150,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const locale = requestLocale(req)
      const user = users.find((u) => u.id === pathId(req))
      if (!user) return fail('NOT_FOUND', '用户不存在')
      return success({ user: toApiUser(user, locale), terms: userTermsInfo(user.username) })
    },
  },
  {
    url: '/api/v1/locales/options',
    method: 'get',
    timeout: 80,
    response: () => success({ default_locale: DEFAULT_LOCALE, items: SUPPORTED_LOCALES }),
  },
  {
    url: '/api/v1/me/preferences',
    method: 'patch',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const PREFERENCES = preferencesFor(usernameFromToken(req)!)
      const body = req.body ?? {}
      if ('preferred_locale' in body) {
        const locale = body.preferred_locale
        if (locale !== null && (typeof locale !== 'string' || !LOCALE_CODES.includes(locale))) {
          return fail('INVALID_ARGUMENT', '语言取值不合法')
        }
        PREFERENCES.preferred_locale = (locale as string | null) ?? null
      }
      if (typeof body.time_zone === 'string' && body.time_zone) {
        PREFERENCES.time_zone = body.time_zone
      }
      const requested = requestLocale(req)
      const resolved = PREFERENCES.preferred_locale ?? requested
      return success({
        user_id: directory.get(usernameFromToken(req)!)?.id ?? mockId(usernameFromToken(req)!),
        preferred_locale: PREFERENCES.preferred_locale,
        requested_locale: requested,
        resolved_locale: resolved,
        time_zone: PREFERENCES.time_zone,
      })
    },
  },
  {
    url: '/api/v1/departments',
    method: 'get',
    timeout: 150,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const locale = requestLocale(req)
      const parentId = str(firstOf(req.query?.parent_id))
      const search = str(firstOf(req.query?.search)).toLowerCase()
      if (search.length > 128) return fail('INVALID_ARGUMENT', '搜索关键词不能超过 128 个字符')

      const byId = new Map(DEPARTMENTS.map((department) => [department.id, department]))
      const inScope = new Set<string>()
      const visit = (id: string) => {
        if (inScope.has(id) || !byId.has(id)) return
        inScope.add(id)
        DEPARTMENTS.filter((department) => department.parent_id === id).forEach((department) =>
          visit(department.id),
        )
      }
      visit('d-root')
      if (parentId && !inScope.has(parentId)) return fail('OUT_OF_SCOPE', '部门不在当前授权范围内')

      const matched = new Set<string>()
      const included = new Set<string>()
      if (search) {
        // A valid parent_id is checked above, but does not restrict search results.
        DEPARTMENTS.forEach((department) => {
          if (!inScope.has(department.id)) return
          const translation = department.translations[locale]
          const fields = [
            department.name,
            department.description,
            translation?.name ?? '',
            translation?.description ?? '',
          ]
          if (!fields.some((value) => value.toLowerCase().includes(search))) return
          matched.add(department.id)
          let ancestor: MockDepartment | undefined = department
          while (ancestor && inScope.has(ancestor.id) && !included.has(ancestor.id)) {
            included.add(ancestor.id)
            ancestor = ancestor.parent_id ? byId.get(ancestor.parent_id) : undefined
          }
        })
      }
      const items = DEPARTMENTS.filter((department) =>
        search
          ? included.has(department.id)
          : inScope.has(department.id) &&
            (parentId ? department.parent_id === parentId : department.id === 'd-root'),
      )
      return success({
        items: items.map((department) =>
          toApiDepartment(department, locale, matched.has(department.id)),
        ),
        org_version: String(org.value),
        scope_root_id: 'd-root',
      })
    },
  },
  {
    url: '/api/v1/departments',
    method: 'post',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const body = req.body ?? {}
      const name = str(body.name)
      const description = str(body.description)
      const parentId = str(body.parent_id)

      if (!name) return fail('INVALID_ARGUMENT', '请输入部门名称')
      if (name.length > DEPARTMENT_NAME_MAX) {
        return fail('INVALID_ARGUMENT', `部门名称不能超过 ${DEPARTMENT_NAME_MAX} 个字符`)
      }
      if (description.length > DEPARTMENT_DESCRIPTION_MAX) {
        return fail('INVALID_ARGUMENT', `部门描述不能超过 ${DEPARTMENT_DESCRIPTION_MAX} 个字符`)
      }
      if (!DEPARTMENTS.some((d) => d.id === parentId)) {
        return fail('INVALID_ARGUMENT', '上级部门不存在')
      }
      if (DEPARTMENTS.some((d) => d.parent_id === parentId && d.name === name)) {
        return fail('CONFLICT', '同级部门名称已存在')
      }

      const translations =
        typeof body.translations === 'object' && body.translations
          ? (body.translations as Record<string, { name: string; description: string }>)
          : {}
      const department: MockDepartment = {
        id: `d-new-${nextSequence('department')}`,
        name,
        description,
        parent_id: parentId,
        sort_order: Number(body.sort_order) || 0,
        translations,
      }
      DEPARTMENTS.push(department)
      org.value += 1
      return success({ id: department.id, org_version: String(org.value), replayed: false })
    },
  },
  {
    url: '/api/v1/departments/:id/delete-preview',
    method: 'get',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const id = pathSegmentBefore(req, 'delete-preview')
      const department = DEPARTMENTS.find((d) => d.id === id)
      if (!department) return fail('NOT_FOUND', '部门不存在')

      const childCount = DEPARTMENTS.filter((d) => d.parent_id === id).length
      const userCount = users.filter(
        (u) => u.department_id && descendantDepartmentIds(id).includes(u.department_id),
      ).length
      const allowed = childCount === 0 && userCount === 0
      return success({
        allowed,
        block_reason: allowed
          ? ''
          : childCount
            ? '该部门存在子部门，请先删除子部门'
            : '该部门下存在用户，请先转移用户',
        department_count: childCount,
        dependency_count: 0,
        max_departments: 100,
        max_dependencies: 1000,
        max_users: 1000,
        user_count: userCount,
        org_version: String(org.value),
      })
    },
  },
  {
    url: '/api/v1/departments/:id',
    method: 'get',
    timeout: 100,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const department = DEPARTMENTS.find((d) => d.id === pathId(req))
      if (!department) return fail('NOT_FOUND', '部门不存在')
      return success({
        id: department.id,
        name: department.name,
        description: department.description,
        parent_id: department.parent_id,
        sort_order: department.sort_order,
        locales: SUPPORTED_LOCALES.map((item) => ({
          code: item.locale_code,
          native_name: item.native_name,
        })),
        translations: department.translations,
      })
    },
  },
  {
    url: '/api/v1/departments/:id',
    method: 'put',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const department = DEPARTMENTS.find((d) => d.id === pathId(req))
      if (!department) return fail('NOT_FOUND', '部门不存在')

      const body = req.body ?? {}
      const name = str(body.name)
      const description = str(body.description)
      if (!name) return fail('INVALID_ARGUMENT', '请输入部门名称')
      if (name.length > DEPARTMENT_NAME_MAX) {
        return fail('INVALID_ARGUMENT', `部门名称不能超过 ${DEPARTMENT_NAME_MAX} 个字符`)
      }
      if (description.length > DEPARTMENT_DESCRIPTION_MAX) {
        return fail('INVALID_ARGUMENT', `部门描述不能超过 ${DEPARTMENT_DESCRIPTION_MAX} 个字符`)
      }
      if (
        DEPARTMENTS.some(
          (d) => d.id !== department.id && d.parent_id === department.parent_id && d.name === name,
        )
      ) {
        return fail('CONFLICT', '同级部门名称已存在')
      }

      department.name = name
      department.description = description
      department.sort_order = Number(body.sort_order) || department.sort_order
      if (typeof body.translations === 'object' && body.translations) {
        department.translations = body.translations as Record<
          string,
          { name: string; description: string }
        >
      }
      org.value += 1
      return success({ id: department.id, org_version: String(org.value), replayed: false })
    },
  },
  {
    url: '/api/v1/departments/:id',
    method: 'delete',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const department = DEPARTMENTS.find((d) => d.id === pathId(req))
      if (!department) return fail('NOT_FOUND', '部门不存在')
      if (DEPARTMENTS.some((d) => d.parent_id === department.id)) {
        return fail('CONFLICT', '该部门存在子部门，无法删除')
      }
      if (users.some((u) => u.department_id === department.id)) {
        return fail('CONFLICT', '该部门下存在用户，无法删除')
      }

      // 就地删除，保持 DEPARTMENTS 引用不变
      removeModelSubject('DEPARTMENT', department.id)
      DEPARTMENTS.splice(
        DEPARTMENTS.findIndex((d) => d.id === department.id),
        1,
      )
      org.value += 1
      return success({ applied: true, id: department.id, replayed: false })
    },
  },
  {
    url: '/api/v1/user-role-options',
    method: 'get',
    timeout: 100,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const locale = requestLocale(req)
      return success({
        items: ROLES.map((role) => ({
          id: role.id,
          name: role.name,
          display_name: localized(role.translations, role.name, locale),
          is_builtin: role.is_builtin,
          requested_locale: locale,
          resolved_locale: locale,
        })),
      })
    },
  },
  {
    url: '/api/v1/assignable-roles',
    method: 'get',
    timeout: 100,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const locale = requestLocale(req)
      return success({
        items: ROLES.map((role) => ({
          id: role.id,
          name: role.name,
          display_name: localized(role.translations, role.name, locale),
          is_builtin: role.is_builtin,
          requested_locale: locale,
          resolved_locale: locale,
        })),
      })
    },
  },
  {
    url: '/api/v1/roles',
    method: 'get',
    timeout: 100,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const locale = requestLocale(req)
      const search = firstOf(req.query?.search).trim().toLowerCase()
      const builtin = firstOf(req.query?.builtin)
      const items = ROLES.map((role) => apiRole(role, locale)).filter(
        (role) =>
          (!search ||
            [role.name, role.display_name].some((name) => name.toLowerCase().includes(search))) &&
          (!builtin || role.is_builtin === (builtin === 'true')),
      )
      const page = Math.max(1, Number(firstOf(req.query?.page)) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(firstOf(req.query?.page_size)) || 20))
      return success({
        items: items.slice((page - 1) * pageSize, page * pageSize),
        page,
        page_size: pageSize,
        total: items.length,
        total_pages: Math.ceil(items.length / pageSize),
      })
    },
  },
  {
    url: '/api/v1/permission-resources',
    method: 'get',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const search = firstOf(req.query?.search).trim().toLowerCase()
      const status = firstOf(req.query?.status)
      const items = roleResources(requestLocale(req)).filter(
        (item) =>
          (!search ||
            item.resource_code.toLowerCase().includes(search) ||
            item.localized_name.toLowerCase().includes(search)) &&
          (!status || item.status === status),
      )
      return success(groupOffsetPage(items, req))
    },
  },
  {
    url: '/api/v1/roles/:id',
    method: 'get',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const role = ROLES.find((item) => item.id === pathId(req))
      if (!role) return fail('NOT_FOUND', '')
      const locale = requestLocale(req)
      const capabilities =
        role.code === 'super_admin' ? CAPABILITIES : (mockRoles.get(role.code) ?? [])
      return success({
        role: apiRole(role, locale),
        translations: role.translations,
        permissions: roleResources(locale).map((resource) => {
          const grant = capabilities.find((item) => item.resource_code === resource.resource_code)
          return {
            resource_id: resource.id,
            resource_code: resource.resource_code,
            name: resource.localized_name,
            status: resource.status,
            management_policy: resource.management_policy,
            actions: resource.actions,
            can_read: grant?.can_read ?? false,
            can_write: grant?.can_write ?? false,
            is_assignable:
              resource.status === 'ACTIVE' &&
              !resource.is_protected &&
              resource.management_policy !== 'SUPER_ADMIN_ONLY',
            is_protected: resource.is_protected,
          }
        }),
      })
    },
  },
  {
    url: '/api/v1/groups',
    method: 'get',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const locale = requestLocale(req)
      const search = firstOf(req.query?.search).trim().toLowerCase()
      const departmentId = firstOf(req.query?.department_id)
      const departmentScope = departmentId ? descendantDepartmentIds(departmentId) : []
      const items = [...GROUPS]
        .filter(
          (group) =>
            !departmentId ||
            group.member_ids.some((id) => {
              const user = users.find((u) => u.id === id)
              return !!user?.department_id && departmentScope.includes(user.department_id)
            }),
        )
        .filter(
          (group) =>
            !search ||
            group.name.toLowerCase().includes(search) ||
            group.description.toLowerCase().includes(search),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((group) => toApiGroup(group, locale))
      return success(groupOffsetPage(items, req))
    },
  },
  {
    url: '/api/v1/groups/initial-member-options',
    method: 'get',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const locale = requestLocale(req)
      const search = firstOf(req.query?.search).trim().toLowerCase()
      const departmentId = firstOf(req.query?.department_id)
      const departmentIds = departmentId ? descendantDepartmentIds(departmentId) : []
      const items = users
        .filter(
          (user) =>
            !search ||
            user.display_name.toLowerCase().includes(search) ||
            user.username.toLowerCase().includes(search),
        )
        .filter(
          (user) =>
            departmentIds.length === 0 ||
            (user.department_id ? departmentIds.includes(user.department_id) : false),
        )
        .map((user) => ({
          ...toApiGroupMember(user, locale),
          added_at: null,
          membership_id: null,
        }))
      return success({
        ...groupOffsetPage(items, req),
        total_member_count: items.length,
        visible_member_count: items.length,
      })
    },
  },
  {
    url: '/api/v1/groups',
    method: 'post',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const body = req.body ?? {}
      const name = str(body.name)
      const description = str(body.description)
      const error = validateGroup(name, description)
      if (error) return fail('INVALID_ARGUMENT', error)
      const memberIds = Array.isArray(body.initial_member_ids)
        ? body.initial_member_ids.map(String)
        : []
      const now = toIso(new Date())
      const creator = users.find((user) => user.username === usernameFromToken(req))
      const group: MockGroup = {
        id: nextGroupId(),
        name,
        description,
        member_ids: [...new Set(memberIds.filter((id) => users.some((u) => u.id === id)))],
        created_at: now,
        updated_at: now,
        created_by: creator?.display_name ?? '超级管理员',
        created_by_user_id: creator?.id ?? '',
        created_by_username: creator?.username ?? 'admin',
      }
      GROUPS.unshift(group)
      return success({ applied: true, group_id: group.id, replayed: false })
    },
  },
  {
    url: '/api/v1/groups/:group_id',
    method: 'get',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const group = GROUPS.find((item) => item.id === pathId(req))
      if (!group) return fail('NOT_FOUND', '')
      return success({
        group: toApiGroup(group, requestLocale(req)),
        translations: [],
      })
    },
  },
  {
    url: '/api/v1/groups/:group_id',
    method: 'patch',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const group = GROUPS.find((item) => item.id === pathId(req))
      if (!group) return fail('NOT_FOUND', '用户组不存在')
      const body = req.body ?? {}
      const name = str(body.name)
      const description = str(body.description)
      const error = validateGroup(name, description, group.id)
      if (error) return fail('INVALID_ARGUMENT', error)
      group.name = name
      group.description = description
      group.updated_at = toIso(new Date())
      return success({ applied: true, group_id: group.id, replayed: false })
    },
  },
  {
    url: '/api/v1/groups/:group_id',
    method: 'delete',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const index = GROUPS.findIndex((item) => item.id === pathId(req))
      if (index < 0) return fail('NOT_FOUND', '用户组不存在')
      // 就地删除，保持 GROUPS 引用不变
      const [removed] = GROUPS.splice(index, 1)
      removeModelSubject('USER_GROUP', removed.id)
      return success({ applied: true, group_id: removed.id, replayed: false })
    },
  },
  {
    url: '/api/v1/groups/:group_id/members',
    method: 'get',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const group = GROUPS.find((item) => item.id === pathSegmentBefore(req, 'members'))
      if (!group) return fail('NOT_FOUND', '用户组不存在')
      const locale = requestLocale(req)
      const search = firstOf(req.query?.search).trim().toLowerCase()
      const departmentId = firstOf(req.query?.department_id)
      const departmentIds = departmentId ? descendantDepartmentIds(departmentId) : []
      const items = users
        .filter((user) => group.member_ids.includes(user.id))
        .filter(
          (user) =>
            !search ||
            user.display_name.toLowerCase().includes(search) ||
            user.username.toLowerCase().includes(search),
        )
        .filter(
          (user) =>
            departmentIds.length === 0 ||
            (user.department_id ? departmentIds.includes(user.department_id) : false),
        )
        .map((user) => ({
          ...toApiGroupMember(user, locale),
          added_at: group.created_at,
          membership_id: `${group.id}:${user.id}`,
        }))
      return success({
        ...groupOffsetPage(items, req),
        total_member_count: group.member_ids.length,
        visible_member_count: group.member_ids.length,
      })
    },
  },
  {
    url: '/api/v1/groups/:group_id/member-options',
    method: 'get',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const group = GROUPS.find((item) => item.id === pathSegmentBefore(req, 'member-options'))
      if (!group) return fail('NOT_FOUND', '用户组不存在')
      const locale = requestLocale(req)
      const search = firstOf(req.query?.search).trim().toLowerCase()
      const departmentId = firstOf(req.query?.department_id)
      const departmentIds = departmentId ? descendantDepartmentIds(departmentId) : []
      const items = users
        .filter((user) => !group.member_ids.includes(user.id))
        .filter(
          (user) =>
            !search ||
            user.display_name.toLowerCase().includes(search) ||
            user.username.toLowerCase().includes(search),
        )
        .filter(
          (user) =>
            departmentIds.length === 0 ||
            (user.department_id ? departmentIds.includes(user.department_id) : false),
        )
        .map((user) => ({
          ...toApiGroupMember(user, locale),
          added_at: null,
          membership_id: null,
        }))
      const page = Math.max(1, Number(firstOf(req.query?.page)) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(firstOf(req.query?.page_size)) || 20))
      return success({
        items: items.slice((page - 1) * pageSize, page * pageSize),
        page,
        page_size: pageSize,
        total: items.length,
        total_pages: Math.ceil(items.length / pageSize),
      })
    },
  },
  {
    url: '/api/v1/groups/:group_id/members/add',
    method: 'post',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const group = GROUPS.find((item) => item.id === pathSegmentBefore(req, 'members'))
      if (!group) return fail('NOT_FOUND', '用户组不存在')
      const body = req.body ?? {}
      const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : []
      if (userIds.length === 0 || userIds.length > 100) {
        return fail('INVALID_ARGUMENT', 'user_ids 数量需为 1-100')
      }
      if (userIds.some((id) => !users.some((user) => user.id === id))) {
        return fail('INVALID_ARGUMENT', '存在无效的用户')
      }
      const added = userIds.filter((id) => !group.member_ids.includes(id))
      group.member_ids = [...new Set([...group.member_ids, ...userIds])]
      group.updated_at = toIso(new Date())
      return success({
        applied: true,
        changed: added.length > 0,
        group_id: group.id,
        replayed: false,
      })
    },
  },
  {
    url: '/api/v1/groups/:group_id/members/remove',
    method: 'post',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const group = GROUPS.find((item) => item.id === pathSegmentBefore(req, 'members'))
      if (!group) return fail('NOT_FOUND', '用户组不存在')
      const body = req.body ?? {}
      const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : []
      if (userIds.length === 0 || userIds.length > 100) {
        return fail('INVALID_ARGUMENT', 'user_ids 数量需为 1-100')
      }
      const removed = group.member_ids.filter((id) => userIds.includes(id)).length
      group.member_ids = group.member_ids.filter((id) => !userIds.includes(id))
      group.updated_at = toIso(new Date())
      return success({
        applied: true,
        changed: removed > 0,
        group_id: group.id,
        replayed: false,
      })
    },
  },
  {
    url: '/api/v1/users',
    method: 'get',
    timeout: 200,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()

      const locale = requestLocale(req)
      const search = firstOf(req.query?.search).trim().toLowerCase()
      const status = firstOf(req.query?.status)
      const departmentId = firstOf(req.query?.department_id)
      const roleId = firstOf(req.query?.role_id)
      const sort = firstOf(req.query?.sort)

      let list = users
      if (search) {
        list = list.filter(
          (u) =>
            u.username.toLowerCase().includes(search) ||
            u.display_name.toLowerCase().includes(search) ||
            (u.email ?? '').toLowerCase().includes(search) ||
            (u.phone ?? '').includes(search),
        )
      }
      if (status === 'ACTIVE' || status === 'DISABLED') {
        list = list.filter((u) => u.status === status)
      }
      if (departmentId) {
        const scope = descendantDepartmentIds(departmentId)
        list = list.filter((u) => u.department_id && scope.includes(u.department_id))
      }
      if (roleId) {
        list = list.filter((u) => u.role_id === roleId)
      }
      if (sort === 'username_asc') {
        list = [...list].sort((a, b) => a.username.localeCompare(b.username))
      } else {
        list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
      }

      return success(
        groupOffsetPage(
          list.map((user) => toApiUser(user, locale)),
          req,
        ),
      )
    },
  },
  {
    url: '/api/v1/users',
    method: 'post',
    timeout: 300,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()

      const locale = requestLocale(req)
      const body = req.body ?? {}
      const username = str(body.username)
      const password = str(body.initial_password)
      const payload = {
        display_name: str(body.display_name),
        email: str(body.email),
        phone: str(body.phone),
        department_id: str(body.department_id),
        role_id: str(body.role_id),
      }

      if (!USERNAME_RE.test(username)) {
        return fail('INVALID_ARGUMENT', '用户名需为 2-128 位字母、数字、点、下划线或短横线')
      }
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        return fail('CONFLICT', '用户名已存在')
      }
      const profileError = validateProfile(payload)
      if (profileError) return fail('INVALID_ARGUMENT', profileError)
      const pwdError = passwordError(password)
      if (pwdError) return fail('INVALID_ARGUMENT', pwdError)

      const user = createUser({ username, initial_password: password, ...payload })
      return success({ replayed: false, user: toApiUser(user, locale) })
    },
  },
  {
    url: '/api/v1/users/batch/enable',
    method: 'post',
    timeout: 250,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const body = req.body ?? {}
      const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : []
      if (!userIds.length || userIds.length > 100) {
        return fail('INVALID_ARGUMENT', 'user_ids 数量需为 1-100')
      }
      let changed = 0
      userIds.forEach((id) => {
        const user = users.find((u) => u.id === id)
        if (user && user.status !== 'ACTIVE') {
          user.status = 'ACTIVE'
          user.updated_at = toIso(new Date())
          changed += 1
        }
      })
      return success({
        applied: true,
        changed,
        replayed: false,
        requested_count: userIds.length,
      })
    },
  },
  {
    url: '/api/v1/users/batch/disable',
    method: 'post',
    timeout: 250,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const body = req.body ?? {}
      const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : []
      if (!userIds.length || userIds.length > 100) {
        return fail('INVALID_ARGUMENT', 'user_ids 数量需为 1-100')
      }
      let changed = 0
      userIds.forEach((id) => {
        const user = users.find((u) => u.id === id)
        if (user && user.username === 'admin') return
        if (user && user.status !== 'DISABLED') {
          user.status = 'DISABLED'
          revokeUserTokens(user.username)
          user.updated_at = toIso(new Date())
          changed += 1
        }
      })
      return success({
        applied: true,
        changed,
        replayed: false,
        requested_count: userIds.length,
      })
    },
  },
  {
    url: '/api/v1/users/batch/delete-preview',
    method: 'post',
    timeout: 150,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const body = req.body ?? {}
      const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : []
      if (!userIds.length || userIds.length > 100) {
        return fail('VALIDATION_FAILED', 'user_ids 数量需为 1-100')
      }
      const requested = users.filter((u) => userIds.includes(u.id))
      if (requested.length !== new Set(userIds).size) return fail('NOT_FOUND', '用户不存在')
      const currentUsername = usernameFromToken(req)
      const excluded = requested
        .filter((u) => u.username === currentUsername || u.role_id === 'role-super-admin')
        .map((u) => ({
          display_name: u.display_name,
          reason: u.username === currentUsername ? 'SELF_PROTECTED' : 'SUPER_ADMIN_PROTECTED',
          user_id: u.id,
          username: u.username,
        }))
      const deletable = requested
        .filter((u) => !excluded.some((item) => item.user_id === u.id))
        .map((u) => ({
          display_name: u.display_name,
          reason: '',
          user_id: u.id,
          username: u.username,
        }))
      return success({
        allowed: deletable.length > 0,
        api_key_count: apiKeys.filter((key) =>
          deletable.some((user) => user.user_id === key.user_id),
        ).length,
        block_reason: '',
        deletable,
        dependency_count: 0,
        excluded,
        preview_digest: batchDeleteDigest(deletable, excluded),
        requested_count: userIds.length,
      })
    },
  },
  {
    url: '/api/v1/users/batch/delete',
    method: 'post',
    timeout: 250,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const body = req.body ?? {}
      const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : []
      const digest = str(body.preview_digest)
      if (digest.length !== 64) return fail('VALIDATION_FAILED', '预览摘要无效')
      if (!userIds.length || userIds.length > 100) {
        return fail('BATCH_TOO_LARGE', 'user_ids 数量需为 1-100')
      }
      const currentUsername = usernameFromToken(req)
      const requested = users.filter((u) => userIds.includes(u.id))
      if (requested.length !== new Set(userIds).size) return fail('NOT_FOUND', '用户不存在')
      const excludedUsers = requested.filter(
        (u) => u.username === currentUsername || u.role_id === 'role-super-admin',
      )
      const deletableUsers = requested.filter((u) => !excludedUsers.includes(u))
      if (!deletableUsers.length) return fail('ACTION_CHANGED', '没有可删除的用户')
      const deletable = deletableUsers.map((u) => ({
        display_name: u.display_name,
        reason: '',
        user_id: u.id,
        username: u.username,
      }))
      const excluded = excludedUsers.map((u) => ({
        display_name: u.display_name,
        reason: u.username === currentUsername ? 'SELF_PROTECTED' : 'SUPER_ADMIN_PROTECTED',
        user_id: u.id,
        username: u.username,
      }))
      // 预览后集合变化（如新增/移除用户）时摘要不一致，整批拒绝
      if (batchDeleteDigest(deletable, excluded) !== digest) {
        return fail('TARGET_SET_CHANGED', '目标集合已变化，请重新预览')
      }
      const removedKeyCount = apiKeys.filter((key) =>
        deletableUsers.some((u) => u.id === key.user_id),
      ).length
      deletableUsers.forEach((user) => {
        cleanUser(user)
        users.splice(
          users.findIndex((u) => u.id === user.id),
          1,
        )
      })
      return success({
        api_key_count: removedKeyCount,
        applied: true,
        deleted_count: deletable.length,
        excluded_count: excluded.length,
        replayed: false,
        requested_count: userIds.length,
      })
    },
  },
  {
    url: '/api/v1/users/imports/template',
    method: 'get',
    rawResponse: (req, res) => {
      if (!checkToken({ headers: req.headers })) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(unauthorized()))
        return
      }
      const format = new URL(req.url ?? '', 'http://localhost').searchParams.get('format')
      if (format === 'xlsx') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(fail('MOCK_XLSX_UNSUPPORTED', 'Mock 模式不支持 XLSX 下载')))
        return
      }
      const csv = 'username,display_name,department_path,role_name,email,phone,initial_password'
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="users-import-template.csv"')
      res.end(`\uFEFF${csv}\n`)
    },
  },
  {
    url: '/api/v1/users/imports/preview',
    method: 'post',
    timeout: 300,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const body = req.body ?? {}
      const rows = Array.isArray(body.rows) ? body.rows : []
      if (rows.length > 1000) return fail('IMPORT_LIMIT_EXCEEDED', '单次最多导入 1000 行')
      const mode = body.mode === 'OVERWRITE' ? 'OVERWRITE' : 'SKIP'
      return success(importTaskPayload(buildImportPreview(rows, mode)))
    },
  },
  {
    url: '/api/v1/users/imports/:task_id',
    method: 'get',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const task = importTasks.get(pathId(req))
      if (!task) return fail('NOT_FOUND', '导入任务不存在')
      if (task.state === 'DRAFT') task.state = 'PREVIEWING'
      else if (task.state === 'PREVIEWING') task.state = 'PREVIEW_READY'
      else if (task.state === 'QUEUED') task.state = 'RUNNING'
      else if (task.state === 'RUNNING') executeImport(task, pendingImportRows.get(task.id) ?? [])
      return success(importTaskPayload(task))
    },
  },
  {
    url: '/api/v1/users/imports/:task_id/rows',
    method: 'get',
    timeout: 120,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const task = importTasks.get(pathSegmentBefore(req, 'rows'))
      if (!task) return fail('NOT_FOUND', '导入任务不存在')
      if (task.state !== 'PREVIEW_READY')
        return fail('IMPORT_PREVIEW_CHANGED', 'Import preview expired')
      return success(importRowsPayload(task))
    },
  },
  {
    url: '/api/v1/users/imports/:task_id/confirm',
    method: 'post',
    timeout: 300,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const task = importTasks.get(pathSegmentBefore(req, 'confirm'))
      if (!task) return fail('NOT_FOUND', '导入任务不存在')
      if (task.state !== 'PREVIEW_READY') return fail('IMPORT_PREVIEW_CHANGED', '导入预览已失效')

      pendingImportRows.set(
        task.id,
        task.rows.filter((row) => row.disposition !== 'INVALID').map((row) => row.row_number),
      )
      task.state = 'QUEUED'
      return success(importTaskPayload(task))
    },
  },
  {
    url: '/api/v1/users/imports/:task_id/errors',
    method: 'get',
    rawResponse: (req, res) => {
      if (!checkToken({ headers: req.headers })) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(unauthorized()))
        return
      }
      const format = new URL(req.url ?? '', 'http://localhost').searchParams.get('format') ?? 'csv'
      if (format === 'xlsx') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(fail('MOCK_XLSX_UNSUPPORTED', 'XLSX unsupported')))
        return
      }
      const task = importTasks.get(segmentBefore(req.url, 'errors'))
      if (!task || task.state !== 'PREVIEW_READY') {
        res.statusCode = task ? 400 : 404
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify(
            fail(task ? 'IMPORT_PREVIEW_CHANGED' : 'NOT_FOUND', 'Import task unavailable'),
          ),
        )
        return
      }
      const rows = task.rows
        .filter((row) => row.disposition === 'INVALID')
        .map((row) =>
          [
            row.username,
            row.fields.display_name,
            row.fields.email ?? '',
            row.fields.phone ?? '',
            row.password,
            row.fields.department_path,
            row.fields.role_name,
            row.error_codes.join(';'),
          ]
            .map(csvEscape)
            .join(','),
        )
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="user-import-errors-v2.csv"')
      res.end(
        '\uFEFF' +
          ['用户名,姓名,邮箱,手机号,初始密码,部门路径,角色名称,错误原因', ...rows].join('\r\n') +
          '\r\n',
      )
    },
  },
  {
    url: '/api/v1/users/imports/:task_id/result',
    method: 'get',
    rawResponse: (req, res) => {
      if (!checkToken({ headers: req.headers })) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(unauthorized()))
        return
      }
      if (new URL(req.url ?? '', 'http://mock').searchParams.get('format') === 'xlsx') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(fail('MOCK_XLSX_UNSUPPORTED', 'XLSX unsupported')))
        return
      }
      const task = importTasks.get(segmentBefore(req.url, 'result'))
      if (!task) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(fail('NOT_FOUND', '导入任务不存在')))
        return
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="users-import-result.csv"')
      res.end(importResultCsv(task))
    },
  },
  {
    url: '/api/v1/users/:user_id/reset-password',
    method: 'post',
    timeout: 300,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()

      const user = users.find((u) => u.id === pathSegmentBefore(req, 'reset-password'))
      if (!user) return fail('NOT_FOUND', '用户不存在')

      const temporary = `Tmp@${Math.random().toString(36).slice(2, 8)}${Math.floor(
        Math.random() * 90 + 10,
      )}`
      mockAccounts.set(user.username, {
        username: user.username,
        password: temporary,
        role: roleOf(user.role_id)?.code ?? 'user',
        needs_password: true,
      })
      setMockPasswordRequired(user.username, true)
      revokeUserTokens(user.username)
      return success({
        replayed: false,
        secret_available: true,
        temporary_password: temporary,
        user_id: user.id,
      })
    },
  },
  {
    url: '/api/v1/users/:user_id/enable',
    method: 'post',
    timeout: 250,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const user = users.find((u) => u.id === pathSegmentBefore(req, 'enable'))
      if (!user) return fail('NOT_FOUND', '用户不存在')

      const changed = user.status !== 'ACTIVE'
      user.status = 'ACTIVE'
      user.updated_at = toIso(new Date())
      return success({
        applied: true,
        changed,
        replayed: false,
        status: user.status,
        user_id: user.id,
      })
    },
  },
  {
    url: '/api/v1/users/:user_id/disable',
    method: 'post',
    timeout: 250,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const user = users.find((u) => u.id === pathSegmentBefore(req, 'disable'))
      if (!user) return fail('NOT_FOUND', '用户不存在')
      if (user.username === 'admin') return fail('FORBIDDEN', '内置管理员不允许停用')

      const changed = user.status !== 'DISABLED'
      user.status = 'DISABLED'
      revokeUserTokens(user.username)
      user.updated_at = toIso(new Date())
      return success({
        applied: true,
        changed,
        replayed: false,
        status: user.status,
        user_id: user.id,
      })
    },
  },
  {
    url: '/api/v1/users/:user_id/delete-preview',
    method: 'post',
    timeout: 150,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      const user = users.find((u) => u.id === pathSegmentBefore(req, 'delete-preview'))
      if (!user) return fail('NOT_FOUND', '用户不存在')
      const allowed =
        user.username !== 'admin' &&
        user.username !== usernameFromToken(req) &&
        user.role_id !== 'role-super-admin'
      return success({
        allowed,
        block_reason: allowed ? '' : '内置管理员不允许删除',
        dependency_count:
          apiKeys.filter((key) => key.user_id === user.id).length +
          GROUPS.filter((group) => group.member_ids.includes(user.id)).length,
        max_dependencies: 1000,
        org_version: String(org.value),
        user_id: user.id,
      })
    },
  },
  {
    url: '/api/v1/users/:user_id',
    method: 'patch',
    timeout: 250,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()

      const locale = requestLocale(req)
      const user = users.find((u) => u.id === pathId(req))
      if (!user) return fail('NOT_FOUND', '用户不存在')

      const body = req.body ?? {}
      const payload = {
        display_name: 'display_name' in body ? str(body.display_name) : user.display_name,
        email: 'email' in body ? str(body.email) : (user.email ?? ''),
        phone: 'phone' in body ? str(body.phone) : (user.phone ?? ''),
        department_id:
          'department_id' in body ? str(body.department_id) : (user.department_id ?? ''),
        role_id: 'role_id' in body ? str(body.role_id) : (user.role_id ?? ''),
      }
      const profileError = validateProfile(payload)
      if (profileError) return fail('INVALID_ARGUMENT', profileError)

      user.display_name = payload.display_name
      user.email = payload.email || null
      user.phone = payload.phone || null
      user.department_id = payload.department_id
      user.role_id = payload.role_id
      user.updated_at = toIso(new Date())
      return success({ replayed: false, user: toApiUser(user, locale) })
    },
  },
  {
    url: '/api/v1/users/:user_id',
    method: 'delete',
    timeout: 250,
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()

      const user = users.find((u) => u.id === pathId(req))
      if (!user) return fail('NOT_FOUND', '用户不存在')
      if (
        user.username === 'admin' ||
        user.username === usernameFromToken(req) ||
        user.role_id === 'role-super-admin'
      )
        return fail('FORBIDDEN', '管理员不允许删除')

      cleanUser(user)
      // 就地删除，保持 users 数组引用不变（各 mock 路由共享同一实例）
      users.splice(
        users.findIndex((u) => u.id === user.id),
        1,
      )
      return success({
        applied: true,
        changed: true,
        replayed: false,
        status: user.status,
        user_id: user.id,
      })
    },
  },
] as MockMethod[])
