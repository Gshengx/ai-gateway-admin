import type { MockMethod, RespThisType } from 'vite-plugin-mock'
import { randomBytes, createHash } from 'node:crypto'
import {
  directory,
  operationLogs,
  nextSequence,
  existingState,
  apiKeys,
  hybridRequests,
} from './_runtime'

export type { MockMethod }

/** 与真实后端一致的响应壳：code 为字符串枚举，'OK' 表示成功 */
export const SUCCESS_CODE = 'OK'

export function mockId(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function requestId(): string {
  return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function success<T>(data: T, message = '') {
  void message
  return { code: SUCCESS_CODE, data, params: {}, request_id: requestId() }
}

export function fail(code: string, message: string, params: Record<string, unknown> = {}) {
  void message
  return { code, data: null, params, request_id: requestId() }
}

/** 登录失效：前端拦截器据此清理会话并跳登录 */
export function unauthorized() {
  return fail('UNAUTHENTICATED', '未登录或会话已失效，请重新登录')
}

/**
 * Mock 模式下签发的有效 token 集合。
 * vite-plugin-mock 会把每个 mock 文件单独打包，模块级变量不共享，
 * 故挂到 globalThis 上，保证 auth.ts 签发的 token 在 identity.ts 中同样有效。
 */
const tokenStore = globalThis as typeof globalThis & {
  __aisMockTokens?: Set<string>
  __aisMockUsernames?: Map<string, string>
}
const validTokens = (tokenStore.__aisMockTokens ??= new Set<string>())

const tokenUsernames = (tokenStore.__aisMockUsernames ??= new Map<string, string>())

export function issueToken(username: string): string {
  const token = randomBytes(32).toString('base64url')
  validTokens.add(token)
  tokenUsernames.set(token, username)
  return token
}

export function revokeUserTokens(username: string): void {
  for (const [token, owner] of tokenUsernames) {
    if (owner !== username) continue
    validTokens.delete(token)
    tokenUsernames.delete(token)
    csrfTokens.delete(token)
    fullSessions.delete(token)
  }
}

/** vite-plugin-mock 传入的请求对象（仅声明本文件用到的字段） */
export interface MockRequest {
  url?: string
  headers?: Record<string, unknown>
  query?: Record<string, string | string[] | undefined>
  body?: Record<string, unknown>
}

function sessionToken(req: MockRequest): string {
  const cookie = String(req.headers?.cookie ?? '')
  return (
    cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('ais_session_dev='))
      ?.slice('ais_session_dev='.length) ?? ''
  )
}
export function checkToken(req: MockRequest): boolean {
  if (hybridRequests.has(req)) return true
  const username = usernameFromToken(req)
  const user = username ? directory.get(username) : undefined
  return validTokens.has(sessionToken(req)) && (!user || user.status === 'ACTIVE')
}
const csrfStore = globalThis as typeof globalThis & { __aisMockCsrf?: Map<string, string> }
const csrfTokens = (csrfStore.__aisMockCsrf ??= new Map<string, string>())
export function mockCsrf(req: MockRequest): string {
  const token = sessionToken(req)
  if (!csrfTokens.has(token)) csrfTokens.set(token, randomBytes(32).toString('base64url'))
  return csrfTokens.get(token)!
}
export function checkCsrf(req: MockRequest): boolean {
  const hybrid = hybridRequests.get(req)
  if (hybrid) return hybrid.csrfValid
  return checkToken(req) && req.headers?.['x-csrf-token'] === mockCsrf(req)
}
export function mockCookie(res: RespThisType['res'], username?: string): string {
  const token = username ? issueToken(username) : ''
  res.setHeader(
    'Set-Cookie',
    username
      ? `ais_session_dev=${token}; Path=/; HttpOnly; SameSite=Lax`
      : 'ais_session_dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  )
  return token
}
const gateStore = globalThis as typeof globalThis & {
  __aisMockPasswordUsers?: Set<string>
  __aisMockFullSessions?: Set<string>
}
const fullSessions = (gateStore.__aisMockFullSessions ??= new Set<string>())
const passwordUsers = (gateStore.__aisMockPasswordUsers ??= new Set<string>())
export function setMockPasswordRequired(username: string, value: boolean) {
  if (value) passwordUsers.add(username)
  else passwordUsers.delete(username)
}
export function mockPasswordRequired(req: MockRequest) {
  return passwordUsers.has(usernameFromToken(req) ?? '')
}
export function upgradeMockSession(req: MockRequest, res: RespThisType['res']): MockRequest {
  if (fullSessions.has(sessionToken(req))) return req
  const username = usernameFromToken(req)
  if (!username) return req
  validTokens.delete(sessionToken(req))
  tokenUsernames.delete(sessionToken(req))
  csrfTokens.delete(sessionToken(req))
  const token = mockCookie(res, username)
  fullSessions.add(token)
  return { ...req, headers: { ...req.headers, cookie: `ais_session_dev=${token}` } }
}
/** Preserve real HTTP errors for the authentication contract. */
export function authMock(methods: MockMethod[]): MockMethod[] {
  return auditedMock(methods).map((method) => {
    const handler = method.response
    return {
      ...method,
      response: function (this: RespThisType, req: MockRequest) {
        const result = handler.call(this, req)
        const code = result.code
        this.res.statusCode =
          code === 'OK'
            ? 200
            : ['UNAUTHENTICATED', 'AUTHENTICATION_FAILED'].includes(code)
              ? 401
              : code === 'MALFORMED_REQUEST'
                ? 400
                : ['VALIDATION_FAILED', 'PASSWORD_REUSED'].includes(code)
                  ? 422
                  : code.endsWith('_CHANGED')
                    ? 409
                    : code === 'RATE_LIMITED'
                      ? 429
                      : code === 'AUTHENTICATION_BUSY'
                        ? 503
                        : 403
        return result
      },
    }
  })
}

interface AuditEntity {
  id: string
  name?: string
  display_name?: string
  model_id_at_gateway?: string
  status?: string
}
function auditEntity(group: string, id: string): AuditEntity | undefined {
  if (group === 'users') return [...directory.values()].find((user) => user.id === id)
  if (group === 'api-keys' || group === 'keys') return apiKeys.find((key) => key.id === id)
  if (group === 'models' || group === 'providers')
    return existingState<Record<string, AuditEntity[]>>('modelAccessV14')?.[group]?.find(
      (item) => item.id === id,
    )
  if (group === 'groups' || group === 'departments')
    return existingState<AuditEntity[]>(group)?.find((item) => item.id === id)
  return undefined
}
/** Shared audit for successful mutations; never copy request credentials into logs. */
export function auditedMock(methods: MockMethod[]): MockMethod[] {
  return methods.map((method) => {
    if (!method.response || method.method === 'get') return method
    const handler = method.response
    return {
      ...method,
      response(this: RespThisType, req: MockRequest) {
        const username = usernameFromToken(req) ?? String(req.body?.username ?? 'system')
        const resourcePath = String(req.url ?? method.url)
          .split('?')[0]
          .replace('/api/v1/', '')
          .split('/')
        const routeGroup = resourcePath[0] === 'me' ? resourcePath[1] : resourcePath[0]
        const parentId = resourcePath[resourcePath[0] === 'me' ? 2 : 1]
        const entity = auditEntity(routeGroup, parentId)
        const before = entity ? { ...entity } : undefined
        const beforeStatus = before?.status
        const result = handler.call(this, req)
        const path = String(req.url ?? method.url).split('?')[0]
        if (
          result.code !== 'OK' ||
          result.data?.replayed ||
          result.data?.changed === false ||
          /preview|options|balance-query/.test(path)
        )
          return result
        const parts = path.replace('/api/v1/', '').split('/')
        const group = parts[0] === 'me' ? parts[1] : parts[0]
        const resource =
          (
            {
              users: 'user',
              groups: 'group',
              departments: 'department',
              models: 'model',
              providers: 'provider',
              keys: 'api_key',
              'api-keys': 'api_key',
              auth: 'session',
              settings: 'password_policy',
              terms: 'terms',
            } as Record<string, string>
          )[group] ?? group
        const module = ['models', 'providers'].includes(group)
          ? 'model'
          : ['settings', 'prototype'].includes(group)
            ? 'system'
            : 'identity'
        const last = parts[parts.length - 1]
        const operation = ['login', 'logout', 'enable', 'disable', 'import', 'export'].includes(
          last,
        )
          ? last
          : method.method === 'delete' || last === 'delete'
            ? 'delete'
            : ['admission-tests', 'health-checks'].includes(last)
              ? 'execute'
              : ['settings', 'prototype'].includes(group)
                ? 'configure'
                : method.method === 'post' && parts.length === (parts[0] === 'me' ? 2 : 1)
                  ? 'create'
                  : 'update'
        const data = result.data ?? {}
        const target = data.user ?? data.key ?? data
        const resourceId =
          before?.id ??
          target.physical_model_id ??
          target.id ??
          data.user_id ??
          data.group_id ??
          data.key_id ??
          parentId ??
          null
        const owner = directory.get(username)
        const live = auditEntity(group, resourceId)
        const name = String(
          live?.model_id_at_gateway ??
            live?.name ??
            live?.display_name ??
            before?.model_id_at_gateway ??
            before?.name ??
            before?.display_name ??
            target.model_id_at_gateway ??
            target.name ??
            target.display_name ??
            req.body?.name ??
            resourceId ??
            resource,
        )
        if (
          group === 'terms' &&
          last === 'accept' &&
          operationLogs.some((log) => log.resource_id === target.id)
        )
          return result
        const time = new Date().toISOString()
        operationLogs.unshift({
          event_id: mockId(`operation-${nextSequence('operation')}`),
          occurred_at: time,
          action: `${module}.${resource}.${operation}`,
          actor_user_id: owner?.id ?? mockId(username),
          actor_username_snapshot: username,
          actor_display_name_snapshot: owner?.display_name ?? username,
          resource_id: resourceId,
          resource_type: resource,
          target_display_name_snapshot: name,
          outcome: 'SUCCEEDED',
          reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
          request_id: result.request_id,
          changes:
            beforeStatus !== undefined &&
            target.status !== undefined &&
            beforeStatus !== target.status
              ? [{ field: 'status', before: beforeStatus, after: target.status }]
              : [],
          prototype: {
            role:
              owner?.role_id === 'role-super-admin'
                ? 'super'
                : owner?.role_id === 'role-auditor'
                  ? 'auditor'
                  : 'admin',
            module,
            operation,
            resource_name: name,
            description: `${operation} ${name}`,
            client_ip: '127.0.0.1',
            user_agent: String(req.headers?.['user-agent'] ?? ''),
            parameters: {},
            error: null,
          },
        })
        return result
      },
    }
  })
}

/** 取 restful 路径末段 id（mock 未注入 params，统一从 url 解析） */
export function pathId(req: MockRequest): string {
  const path = (req.url ?? '').split('?')[0]
  return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
}

/** 根据 Bearer token 查找当前模拟会话用户名。 */
export function usernameFromToken(req: MockRequest): string | null {
  const hybrid = hybridRequests.get(req)
  if (hybrid) return hybrid.username
  return tokenUsernames.get(sessionToken(req)) ?? null
}
