import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RespThisType } from 'vite-plugin-mock'
import type { AuthContext, PermissionsResult } from '../src/api/modules/auth'
import type { ApiResult } from '../src/api/types'
import expenseRoutes from './expenses'
import billRoutes from './costBills'
import { directory, hybridRequests } from './_runtime'
import { fail, type MockMethod, type MockRequest } from './_utils'

const localRoutes = [...expenseRoutes, ...billRoutes]
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

export async function handleHybridRequest(
  incoming: IncomingMessage,
  res: ServerResponse,
  target: string,
): Promise<boolean> {
  const url = new URL(incoming.url ?? '/', 'http://localhost')
  const pathname = url.pathname
  if (!pathname.startsWith('/api/v1/cost/')) return false
  const method = incoming.method ?? 'GET'
  const request: MockRequest = {
    url: incoming.url,
    headers: incoming.headers,
    query: Object.fromEntries(url.searchParams),
  }
  // Only modules without published backend APIs are handled locally.
  const route = localRoutes.find((candidate) => match(candidate, pathname, method))
  if (!route) return false

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
  const session = context.data.session
  directory.set(session.username, {
    id: session.user_id,
    username: session.username,
    display_name: session.display_name,
    department_id: original.data.department_scope_root_id,
    role_id: null,
    status: 'ACTIVE',
    last_login_at: null,
  })
  const identity = {
    username: session.username,
    capabilities: original.data.capabilities,
    csrfValid: incoming.headers[context.data.csrf_header.toLowerCase()] === context.data.csrf_token,
  }
  hybridRequests.set(request, identity)
  hybridRequests.set(incoming, identity)
  if (route?.rawResponse)
    await route.rawResponse.call({ req: incoming, res } as RespThisType, incoming, res)
  else if (route?.response) {
    if (method !== 'GET') request.body = await bodyOf(incoming)
    const result = await route.response.call({ req: incoming, res } as RespThisType, request)
    send(res, result)
  }
  return true
}
