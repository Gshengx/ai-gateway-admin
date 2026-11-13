import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RespThisType } from 'vite-plugin-mock'
import type { AuthContext, PermissionsResult } from '../src/api/modules/auth'
import type { ApiResult } from '../src/api/types'
import identityRoutes from './identity'
import authRoutes from './auth'
import termsRoutes from './terms'
import projectRoutes from './projects'
import budgetRoutes from './projectBudgets'
import expenseRoutes from './expenses'
import costRoutes from './costShared'
import { mockAccounts, mockRoles } from './_accounts'
import { directory, runtimeState, hybridRequests } from './_runtime'
import { checkToken, fail, mockId, success, type MockMethod, type MockRequest } from './_utils'
import { mockNavigation } from './navigation'
import { projects, userProjects } from './_projects'

const allowedResources = new Set([
  'identity.projects',
  'personal.projects',
  'personal.work_orders',
  'cost.bills',
  'cost.budgets',
  'cost.expenses',
])
const localRoutes = [...projectRoutes, ...budgetRoutes, ...expenseRoutes, ...costRoutes]
const localActors = ['local_approver_1', 'local_approver_2']

function initialize() {
  runtimeState('hybridMode', () => true)
  const password = mockAccounts.get('mock_admin')?.password
  if (!password) throw new Error('Local account configuration is unavailable')
  mockRoles.set('hybrid_approver', [
    { resource_code: 'personal.work_orders', can_read: true, can_write: true },
  ])
  for (const [index, username] of localActors.entries()) {
    if (!mockAccounts.has(username)) {
      mockAccounts.set(username, {
        username,
        password,
        role: 'hybrid_approver',
        needs_password: false,
      })
      directory.set(username, {
        id: mockId(username),
        username,
        display_name: `本地模拟审批人 ${index + 1}`,
        department_id: 'd-root',
        role_id: 'role-hybrid-approver',
        status: 'ACTIVE',
        last_login_at: null,
      })
    }
  }
}

function match(route: MockMethod, pathname: string, method: string) {
  if (String(route.method ?? 'get').toLowerCase() !== method.toLowerCase()) return false
  if (typeof route.url !== 'string') return false
  const pattern = route.url
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${pattern}$`).test(pathname)
}

async function bodyOf(incoming: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of incoming) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 1024 * 1024) throw new Error('MALFORMED_REQUEST')
    chunks.push(buffer)
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString() || '{}')
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('MALFORMED_REQUEST')
  return body as Record<string, unknown>
}

function send(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-AIS-Local-Mock', 'true')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function realGet<T>(
  target: string,
  path: string,
  incoming: IncomingMessage,
): Promise<ApiResult<T>> {
  const response = await fetch(new URL(path, target), {
    headers: {
      Cookie: incoming.headers.cookie ?? '',
      'Accept-Language': String(incoming.headers['accept-language'] ?? 'zh-CN'),
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  return (await response.json()) as ApiResult<T>
}

function addWorkOrders(snapshot: PermissionsResult, locale: string): PermissionsResult {
  const capabilities = snapshot.capabilities.filter(
    (cap) => cap.resource_code !== 'personal.work_orders',
  )
  capabilities.push({ resource_code: 'personal.work_orders', can_read: true, can_write: true })
  const local = mockNavigation(locale, capabilities, false)
  const navigation = structuredClone(snapshot.navigation)
  const item = local.items.find((item) => item.route_id === 'personal_work_orders')
  if (item && !navigation.items.some((item) => item.route_id === 'personal_work_orders')) {
    navigation.items.push(item)
    for (const group of local.groups)
      if (!navigation.groups.some((existing) => existing.group_code === group.group_code))
        navigation.groups.push(group)
  }
  return { ...snapshot, capabilities, navigation }
}

function translateDepartment(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) return value.map((item) => translateDepartment(item, from, to))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'department_id' && item === from ? to : translateDepartment(item, from, to),
    ]),
  )
}

export async function handleHybridRequest(
  incoming: IncomingMessage,
  res: ServerResponse,
  target: string,
): Promise<boolean> {
  const url = new URL(incoming.url ?? '/', 'http://localhost')
  const pathname = url.pathname
  const method = incoming.method ?? 'GET'
  const request: MockRequest = {
    url: incoming.url,
    headers: incoming.headers,
    query: Object.fromEntries(url.searchParams),
  }
  const localLogin = pathname === '/api/v1/auth/local-mock-login'
  const localSession = checkToken(request)
  const route = localRoutes.find((route) => match(route, pathname, method))
  const permissions = pathname === '/api/v1/me/permissions' && method === 'GET'
  const users = pathname === '/api/v1/users' && method === 'GET'
  if (!route && !permissions && !users && !localLogin && !localSession) return false
  initialize()
  res.setHeader('X-AIS-Local-Mock', 'true')
  res.setHeader('Cache-Control', 'no-store')

  if (localLogin || localSession) {
    const routePath = localLogin ? '/api/v1/auth/login' : pathname
    const available = [
      ...authRoutes,
      ...termsRoutes,
      ...identityRoutes.filter((route) =>
        ['/api/v1/locales/options', '/api/v1/me/preferences'].includes(String(route.url)),
      ),
      ...localRoutes,
    ]
    const handler = available.find((route) => match(route, routePath, method))
    if (!handler || (localLogin && method !== 'POST')) {
      send(res, fail('FORBIDDEN', ''), 403)
      return true
    }
    if (localLogin) {
      request.body = await bodyOf(incoming)
      if (!localActors.includes(String(request.body.username ?? ''))) {
        send(res, fail('AUTHENTICATION_FAILED', ''), 401)
        return true
      }
    } else if (method !== 'GET' && !handler.rawResponse) request.body = await bodyOf(incoming)
    if (handler.rawResponse)
      await handler.rawResponse.call({ req: incoming, res } as RespThisType, incoming, res)
    else if (handler.response) {
      let result = await handler.response.call({ req: incoming, res } as RespThisType, request)
      if (permissions && result.code === 'OK') {
        const snapshot = result.data as PermissionsResult
        const capabilities = snapshot.capabilities.filter((cap) =>
          allowedResources.has(cap.resource_code),
        )
        result = success({
          ...snapshot,
          capabilities,
          navigation: mockNavigation(String(request.query?.locale ?? 'zh-CN'), capabilities, false),
        })
      }
      send(res, result, res.statusCode)
    }
    return true
  }

  const context = await realGet<AuthContext>(target, '/api/v1/auth/context', incoming)
  if (context.code !== 'OK') {
    send(res, context, 401)
    return true
  }
  if (context.data.session.scope !== 'FULL' || context.data.session.gate !== 'READY') {
    send(res, fail('FORBIDDEN', ''), 403)
    return true
  }
  const original = await realGet<PermissionsResult>(target, '/api/v1/me/permissions', incoming)
  if (original.code !== 'OK') {
    send(res, original, 403)
    return true
  }
  const snapshot = addWorkOrders(
    original.data,
    String(request.query?.locale ?? incoming.headers['accept-language'] ?? 'zh-CN'),
  )
  if (permissions) {
    send(res, success(snapshot))
    return true
  }
  const session = context.data.session
  directory.set(session.username, {
    id: session.user_id,
    username: session.username,
    display_name: session.display_name,
    // The mock realm has its own organization; never mutate real identity data.
    department_id: 'd-root',
    role_id: null,
    status: 'ACTIVE',
    last_login_at: null,
  })
  const identity = {
    username: session.username,
    capabilities: snapshot.capabilities,
    csrfValid: incoming.headers[context.data.csrf_header.toLowerCase()] === context.data.csrf_token,
  }
  hybridRequests.set(request, identity)
  hybridRequests.set(incoming, identity)
  if (users) {
    const response = await realGet<{ items: { id: string }[] }>(target, incoming.url!, incoming)
    if (response.code === 'OK')
      response.data.items = response.data.items.map((user) => ({
        ...user,
        projects: userProjects(user.id),
      }))
    send(res, response, response.code === 'OK' ? 200 : 403)
    return true
  }
  if (route?.rawResponse)
    await route.rawResponse.call({ req: incoming, res } as RespThisType, incoming, res)
  else if (route?.response) {
    if (method !== 'GET') request.body = await bodyOf(incoming)
    const root = original.data.department_scope_root_id
    request.body = translateDepartment(request.body, root, 'd-root') as MockRequest['body']
    request.query = translateDepartment(request.query, root, 'd-root') as MockRequest['query']
    // Add the real actor to an existing fixture once, without replacing complex samples.
    const marker = runtimeState('hybridProjectActors', () => new Set<string>())
    if (!marker.has(session.user_id)) {
      const project = projects().find((project) => project.id === 'project-10')
      if (project && !project.admin_ids.includes(session.user_id)) {
        project.admin_ids.push(session.user_id)
        project.joined[session.user_id] = new Date().toISOString()
      }
      marker.add(session.user_id)
    }
    const result = await route.response.call({ req: incoming, res } as RespThisType, request)
    send(res, translateDepartment(result, 'd-root', root))
  }
  return true
}
