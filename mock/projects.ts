import { expenseRecords } from './_costRecords'
import {
  directory,
  existingState,
  nextSequence,
  runtimeState,
  apiKeys,
  hybridRequests,
} from './_runtime'
import { mockAccounts, mockRoles } from './_accounts'
import { CAPABILITIES } from './_capabilities'
import { modelAccessState } from './_modelAccessState'
import { projectBudgetProjection, archiveProjectBudget } from './_projectBudgets'
import {
  projects,
  projectIds,
  projectRole,
  departmentPath,
  memberView,
  type StoredProject,
} from './_projects'
import {
  auditedMock,
  checkToken,
  checkCsrf,
  fail,
  success,
  unauthorized,
  usernameFromToken,
  type MockMethod,
  type MockRequest,
} from './_utils'
import type { ProjectPayload } from '../src/api/modules/projects'

export const value = (req: MockRequest, key: string) => String(req.query?.[key] ?? '')
export const english = (req: MockRequest) => value(req, 'locale').startsWith('en')
export const actor = (req: MockRequest) => directory.get(usernameFromToken(req) ?? '')
export function userCapable(user: ReturnType<typeof actor>, resource: string, write = false) {
  const roles = existingState<{ id: string; code: string }[]>('roles') ?? []
  const role =
    roles.find((item) => item.id === user?.role_id)?.code ??
    user?.role_id?.replace(/^role-/, '').replace(/-/g, '_') ??
    mockAccounts.get(user?.username ?? '')?.role
  const caps = role === 'super_admin' ? CAPABILITIES : (mockRoles.get(role ?? '') ?? [])
  return caps.some(
    (cap) => cap.resource_code === resource && cap.can_read && (!write || cap.can_write),
  )
}
export function capable(req: MockRequest, resource: string, write = false) {
  const hybrid = hybridRequests.get(req)
  if (hybrid)
    return hybrid.capabilities.some(
      (cap) => cap.resource_code === resource && cap.can_read && (!write || cap.can_write),
    )
  return userCapable(actor(req), resource, write)
}
export function page<T>(items: T[], req: MockRequest) {
  const current = Math.max(1, Number(value(req, 'page')) || 1)
  const size = Math.min(100, Math.max(1, Number(value(req, 'page_size')) || 20))
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    page_size: size,
    total: items.length,
    total_pages: Math.ceil(items.length / size),
  }
}
export function view(project: StoredProject, req: MockRequest) {
  const userId = actor(req)?.id ?? ''
  return {
    ...project,
    joined: undefined,
    ranking: undefined,
    budget: projectBudgetProjection(project),
    usage: project.usage[userId] ?? null,
    department: departmentPath(project.department_id, english(req)),
    member_count: projectIds(project).length,
    role: projectRole(project, userId),
    key_count: apiKeys.filter(
      (key) => (key as unknown as { project_id?: string }).project_id === project.id,
    ).length,
  }
}
function payload(req: MockRequest): ProjectPayload | null {
  const body = req.body ?? {}
  const admins = Array.isArray(body.admin_ids) ? [...new Set(body.admin_ids.map(String))] : []
  const members = Array.isArray(body.member_ids)
    ? [...new Set(body.member_ids.map(String))].filter((id) => !admins.includes(id))
    : []
  const models = Array.isArray(body.model_ids) ? [...new Set(body.model_ids.map(String))] : []
  const dept = existingState<{ id: string }[]>('departments') ?? []
  if (
    !String(body.name ?? '').trim() ||
    String(body.name).length > 100 ||
    String(body.description ?? '').length > 500 ||
    !dept.some((d) => d.id === body.department_id) ||
    !admins.length ||
    [...admins, ...members].some(
      (id) => ![...directory.values()].some((u) => u.id === id && u.status === 'ACTIVE'),
    ) ||
    models.some((id) => !modelAccessState.models.some((m) => m.id === id && m.status === 'ACTIVE'))
  )
    return null
  return {
    name: String(body.name).trim(),
    description: String(body.description ?? ''),
    department_id: String(body.department_id),
    admin_ids: admins,
    member_ids: members,
    model_ids: models,
  }
}
export function route(
  url: string,
  method: 'get' | 'post' | 'patch',
  handler: (req: MockRequest) => ReturnType<typeof success> | ReturnType<typeof fail>,
  resource?: string,
  writeOverride?: boolean,
): MockMethod {
  return {
    url: `/api/v1${url}`,
    method,
    response(req: MockRequest) {
      if (!checkToken(req)) return unauthorized()
      if (method !== 'get' && !checkCsrf(req)) return fail('FORBIDDEN', '')
      const personal = url.startsWith('/me/')
      const options = url.endsWith('user-options')
      if (
        !capable(
          req,
          resource ?? (personal ? 'personal.projects' : 'identity.projects'),
          writeOverride ?? method !== 'get',
        ) &&
        !(options && capable(req, 'personal.projects', true))
      )
        return fail('FORBIDDEN', '')
      void expenseRecords.length
      const tokenKey = String(req.headers?.['idempotency-key'] ?? '')
      const key = tokenKey ? `${actor(req)?.id}:${tokenKey}` : ''
      const cache = runtimeState(
        'projectCommands',
        () =>
          new Map<
            string,
            { signature: string; result: ReturnType<typeof success> | ReturnType<typeof fail> }
          >(),
      )
      const signature = JSON.stringify([req.url, req.body])
      const cached = key ? cache.get(key) : undefined
      if (method !== 'get' && cached)
        return cached.signature === signature
          ? success({ ...(cached.result.data as object), replayed: true })
          : fail('STATE_CONFLICT', '')
      const result = handler(req)
      if (key && method !== 'get' && result.code === 'OK')
        cache.set(key, { signature, result: structuredClone(result) })
      return result
    },
  }
}
const list = (req: MockRequest, personal: boolean) => {
  const userId = actor(req)?.id ?? ''
  let items = projects().filter(
    (p) =>
      ((!personal && value(req, 'mine') !== 'true') || projectRole(p, userId)) &&
      (!value(req, 'search') ||
        p.name.toLowerCase().includes(value(req, 'search').toLowerCase())) &&
      (!value(req, 'status') || p.status === value(req, 'status')) &&
      (!value(req, 'role') || projectRole(p, userId) === value(req, 'role')),
  )
  const department = value(req, 'department_id')
  if (department) {
    const path = departmentPath(department)
    items = items.filter(
      (p) =>
        p.department_id === department || departmentPath(p.department_id).startsWith(`${path}/`),
    )
  }
  items = items.filter(
    (p) =>
      (!value(req, 'created_start') || p.created_at >= value(req, 'created_start')) &&
      (!value(req, 'created_end') || p.created_at.slice(0, 10) <= value(req, 'created_end')) &&
      (!value(req, 'min_members') || projectIds(p).length >= Number(value(req, 'min_members'))) &&
      (!value(req, 'max_members') || projectIds(p).length <= Number(value(req, 'max_members'))),
  )
  const sort = value(req, 'sort')
  if (sort)
    items.sort(
      (a, b) =>
        (sort.startsWith('members')
          ? projectIds(a).length - projectIds(b).length
          : a.created_at.localeCompare(b.created_at)) * (sort.endsWith('desc') ? -1 : 1) ||
        a.id.localeCompare(b.id),
    )
  return success(
    page(
      items.map((p) => view(p, req)),
      req,
    ),
  )
}
const find = (req: MockRequest) =>
  projects().find(
    (p) =>
      p.id ===
      String(req.url ?? '')
        .split('?')[0]!
        .split('/')
        .find((part) => part.startsWith('project-')),
  )
const manageable = (p: StoredProject, req: MockRequest) =>
  p.status === 'ACTIVE' && projectRole(p, actor(req)?.id ?? '') === 'ADMIN'
export default auditedMock([
  route('/projects/user-options', 'get', (req) => {
    const search = value(req, 'search').toLowerCase()
    const groups = existingState<{ name: string; member_ids: string[] }[]>('groups') ?? []
    return success(
      page(
        [...directory.values()]
          .filter((u) => u.status === 'ACTIVE')
          .map((u) => memberView(u, undefined, english(req)))
          .filter(
            (u) =>
              !search ||
              `${u.display_name} ${u.username} ${u.department} ${groups
                .filter((g) => g.member_ids.includes(u.id))
                .map((g) => g.name)
                .join(' ')}`
                .toLowerCase()
                .includes(search),
          ),
        req,
      ),
    )
  }),
  route('/projects/model-options', 'get', (req) =>
    success(
      page(
        modelAccessState.models
          .filter(
            (m) =>
              m.status === 'ACTIVE' &&
              `${m.model_id_at_gateway} ${m.provider_name}`
                .toLowerCase()
                .includes(value(req, 'search').toLowerCase()),
          )
          .map((m) => ({
            id: m.id,
            name: m.model_id_at_gateway,
            display_name: `${m.model_id_at_gateway} · ${m.provider_name}`,
          })),
        req,
      ),
    ),
  ),
  route('/projects', 'get', (req) => list(req, false)),
  route('/me/projects', 'get', (req) => list(req, true)),
  route('/projects', 'post', (req) => {
    const data = payload(req)
    if (!data) return fail('VALIDATION_FAILED', '')
    if (projects().some((p) => p.name === data.name)) return fail('ALREADY_EXISTS', '')
    const now = new Date().toISOString()
    const project: StoredProject = {
      ...data,
      id: `project-${nextSequence('projects', 23)}`,
      status: 'ACTIVE',
      created_at: now,
      joined: Object.fromEntries([...data.admin_ids, ...data.member_ids].map((id) => [id, now])),
      usage: {},
      ranking: {},
      budget: null,
    }
    projects().unshift(project)
    return success(view(project, req))
  }),
  route('/projects/:id', 'patch', (req) => {
    const p = find(req)
    if (!p) return fail('NOT_FOUND', '')
    if (p.status !== 'ACTIVE') return fail('STATE_CONFLICT', '')
    const data = payload(req)
    if (!data) return fail('VALIDATION_FAILED', '')
    if (projects().some((item) => item.id !== p.id && item.name === data.name))
      return fail('ALREADY_EXISTS', '')
    Object.assign(p, data)
    for (const id of projectIds(p)) p.joined[id] ??= new Date().toISOString()
    return success(view(p, req))
  }),
  ...(['enable', 'disable', 'archive', 'delete'] as const).map((action) =>
    route(`/projects/:id/${action}`, 'post', (req) => {
      const p = find(req)
      if (!p) return fail('NOT_FOUND', '')
      if (action === 'delete') {
        if (p.status === 'ACTIVE') return fail('STATE_CONFLICT', '')
        projects().splice(projects().indexOf(p), 1)
      } else {
        if (
          (action === 'disable' && p.status !== 'ACTIVE') ||
          (action === 'enable' && p.status === 'ACTIVE') ||
          (action === 'archive' && p.status === 'ARCHIVED')
        )
          return fail('STATE_CONFLICT', '')
        p.status = action === 'enable' ? 'ACTIVE' : action === 'disable' ? 'DISABLED' : 'ARCHIVED'
        if (action === 'archive') archiveProjectBudget(p, actor(req)!.display_name)
      }
      return success({ id: p.id, name: p.name, status: p.status })
    }),
  ),
  route('/me/projects/:id', 'get', (req) => {
    const p = find(req)
    if (!p) return fail('NOT_FOUND', '')
    if (!projectRole(p, actor(req)?.id ?? '')) return fail('OUT_OF_SCOPE', '')
    return success({
      ...view(p, req),
      admins: p.admin_ids
        .map((id) => [...directory.values()].find((u) => u.id === id)?.display_name)
        .filter(Boolean),
      models: modelAccessState.models
        .filter((m) => p.model_ids.includes(m.id) && m.status === 'ACTIVE' && p.status === 'ACTIVE')
        .map((m) => ({ id: m.id, name: m.model_id_at_gateway, display_name: m.provider_name })),
      ranking: p.ranking?.[actor(req)?.id ?? ''] ?? [],
      can_manage: manageable(p, req) && capable(req, 'personal.projects', true),
    })
  }),
  route('/me/projects/:id/members', 'get', (req) => {
    const p = find(req)
    if (!p) return fail('NOT_FOUND', '')
    if (!projectRole(p, actor(req)?.id ?? '')) return fail('OUT_OF_SCOPE', '')
    return success(
      page(
        projectIds(p).map((id) =>
          memberView(
            [...directory.values()].find((u) => u.id === id)!,
            p,
            english(req),
          ),
        ),
        req,
      ),
    )
  }),
  route('/me/projects/:id/members', 'post', (req) => {
    const p = find(req)
    if (!p) return fail('NOT_FOUND', '')
    if (!manageable(p, req)) return fail('FORBIDDEN', '')
    const ids = Array.isArray(req.body?.user_ids) ? [...new Set(req.body.user_ids.map(String))] : []
    if (
      !ids.length ||
      !['ADMIN', 'MEMBER'].includes(String(req.body?.role)) ||
      ids.some((id) => ![...directory.values()].some((u) => u.id === id && u.status === 'ACTIVE'))
    )
      return fail('VALIDATION_FAILED', '')
    const target = req.body?.role === 'ADMIN' ? p.admin_ids : p.member_ids
    for (const id of ids)
      if (!projectIds(p).includes(id)) {
        target.push(id)
        p.joined[id] = new Date().toISOString()
      }
    return success(view(p, req))
  }),
  ...(['remove', 'promote'] as const).map((action) =>
    route(`/me/projects/:id/members/${action}`, 'post', (req) => {
      const p = find(req)
      if (!p) return fail('NOT_FOUND', '')
      if (!manageable(p, req)) return fail('FORBIDDEN', '')
      const ids = Array.isArray(req.body?.user_ids)
        ? [...new Set(req.body.user_ids.map(String))]
        : []
      if (!ids.length || ids.some((id) => !projectIds(p).includes(id)))
        return fail('VALIDATION_FAILED', '')
      if (action === 'remove' && p.admin_ids.every((id) => ids.includes(id)))
        return fail('STATE_CONFLICT', '')
      p.member_ids = p.member_ids.filter((id) => !ids.includes(id))
      p.admin_ids =
        action === 'remove'
          ? p.admin_ids.filter((id) => !ids.includes(id))
          : [...new Set([...p.admin_ids, ...ids])]
      return success(view(p, req))
    }),
  ),
] as MockMethod[])
