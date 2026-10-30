import type { RespThisType } from 'vite-plugin-mock'
import { managedKeyOwners, managedKeyDepartmentIds } from './identity'
import type {
  ApiKeyItem,
  CreateMyKeyResult,
  UpdateMyKeyResult,
  DeleteMyKeyResult,
  ManagedKeyItem,
  ManagedKeyMutationResult,
  ManagedKeysBatchResult,
} from '../src/api/modules/apiKeys'
import {
  checkToken,
  checkCsrf,
  usernameFromToken,
  mockId,
  pathId,
  success,
  fail,
  unauthorized,
  type MockMethod,
  type MockRequest,
} from './_utils'

// 与现有 mock 一致：仅模拟服务端签发的 Key，不在页面生成 Key。
const stores = new Map<string, ApiKeyItem[]>()
const replays = new Map<string, CreateMyKeyResult | UpdateMyKeyResult | DeleteMyKeyResult>()
let sequence = 0
const activeLimit = 10
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
function keysFor(user: string) {
  if (!stores.has(user)) {
    stores.set(
      user,
      Array.from({ length: 24 }, (_, i): ApiKeyItem => ({
        id: mockId(`${user}-key-${i}`),
        user_id: user,
        name: `Client ${i + 1}`,
        masked_value: `sk-mock-****${String(i + 1).padStart(4, '0')}`,
        status: i < 3 ? 'ACTIVE' : 'DISABLED',
        created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
        updated_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
        usage_source: 'NOT_CONNECTED',
        last_used_at: null,
        last_used_ip: null,
      })),
    )
  }
  return stores.get(user)!
}
function replayId(req: MockRequest, user: string) {
  const key = req.headers?.['idempotency-key']
  return key ? `${user}:${String(key)}:${req.url?.split('?')[0]}` : ''
}
function validName(req: MockRequest): string | null {
  const name = req.body?.name
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 128
    ? name.trim()
    : null
}

// 管理端与用户详情的 Key 列表共用这一个数据源，不重复注册 GET /api-keys。
const managedKeys: ApiKeyItem[] = managedKeyOwners('zh-CN').flatMap((user, index) =>
  Array.from({ length: index === 0 ? 3 : index % 4 }, (_, i) => ({
    id: mockId(`managed-key-${user.id}-${i}`),
    user_id: user.id,
    name: ['生产环境集成', '数据分析脚本', '本地开发调试'][i]!,
    masked_value: `sk-ais-****${String(index * 10 + i + 1).padStart(4, '0')}`,
    status: (index !== 0 && (index + i) % 7 === 0 ? 'DISABLED' : 'ACTIVE') as ApiKeyItem['status'],
    created_at: new Date(Date.UTC(2026, 2, 12, index, i)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 2, 12, index, i)).toISOString(),
    usage_source: 'NOT_CONNECTED',
    last_used_at:
      (index + i) % 5 === 0 ? null : new Date(Date.UTC(2026, 9, 1, index, i)).toISOString(),
    last_used_ip: (index + i) % 5 === 0 ? null : `10.21.${index % 20}.${i + 1}`,
  })),
)
const managedReplays = new Map<
  string,
  { body: string; result: ManagedKeyMutationResult | ManagedKeysBatchResult }
>()
function managedItems(locale: string): ManagedKeyItem[] {
  const owners = managedKeyOwners(locale)
  const mandatory =
    (
      globalThis as typeof globalThis & {
        __aisMockTerms?: { config: { mandatory_confirmation: boolean } }
      }
    ).__aisMockTerms?.config.mandatory_confirmation ?? true
  return managedKeys.flatMap((key) => {
    const owner = owners.find((user) => user.id === key.user_id)
    if (!owner) return []
    const reasons = [
      ...(owner.status === 'DISABLED' ? ['USER_DISABLED'] : []),
      // 确定性覆盖条款未确认及 Key 禁用返回 BLOCKED + KEY_DISABLED 的分支。
      ...(mandatory && owners.indexOf(owner) % 11 === 4 ? ['TERMS_REQUIRED'] : []),
      ...(key.status === 'DISABLED' ? ['KEY_DISABLED'] : []),
    ]
    return [
      {
        ...key,
        username: owner.username,
        user_display_name: owner.display_name,
        user_status: owner.status,
        user_ai_status: 'ACTIVE',
        department_id: owner.department_id,
        department_name: owner.department_name,
        department_display_name: owner.department_display_name,
        control_condition: reasons.length ? 'BLOCKED' : 'BASIC_CONDITIONS_MET',
        control_reasons: reasons,
        condition_basis: 'USER_KEY_TERMS_ONLY',
      },
    ]
  })
}

function managedMutation(
  req: MockRequest,
  action: 'enable' | 'disable' | 'delete',
  batch: boolean,
) {
  const user = usernameFromToken(req)!
  const path = req.url?.split('?')[0] || ''
  const id = decodeURIComponent(batch ? '' : path.split('/')[4] || '')
  const ids: unknown = batch ? req.body?.key_ids : [id]
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.some((value) => typeof value !== 'string') ||
    new Set(ids).size !== ids.length
  )
    return fail('VALIDATION_FAILED', '')
  if (ids.length > 100) return fail('BATCH_TOO_LARGE', '')
  if (
    batch &&
    (ids.some((value) => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) ||
      Object.keys(req.body ?? {}).some((field) => !['key_ids'].includes(field)))
  )
    return fail('VALIDATION_FAILED', '')
  const replay = replayId(req, user)
  const fingerprint = JSON.stringify({ action, ids })
  const previous = managedReplays.get(replay)
  if (previous) {
    if (previous.body !== fingerprint) return fail('IDEMPOTENCY_CONFLICT', '')
    return success({ ...previous.result, replayed: true })
  }
  const visible = new Set(managedItems('zh-CN').map((key) => key.id))
  // 先检查完整目标集合，失败时绝不修改任何一个 Key。
  if (ids.some((keyId) => !visible.has(keyId)))
    return fail(batch ? 'OUT_OF_SCOPE' : 'NOT_FOUND', '')
  if (batch && action === 'enable') {
    const owners = new Set(
      managedKeys.filter((key) => ids.includes(key.id)).map((key) => key.user_id),
    )
    for (const owner of owners) {
      const activeCount = managedKeys.filter(
        (key) => key.user_id === owner && (key.status === 'ACTIVE' || ids.includes(key.id)),
      ).length
      if (activeCount > activeLimit) return fail('KEY_LIMIT_EXCEEDED', '')
    }
  }
  let changed = false
  for (const keyId of ids) {
    const index = managedKeys.findIndex((key) => key.id === keyId)
    const key = managedKeys[index]!
    if (action === 'delete') {
      managedKeys.splice(index, 1)
      changed = true
    } else {
      const status = action === 'enable' ? 'ACTIVE' : 'DISABLED'
      changed ||= key.status !== status
      key.status = status
      key.updated_at = new Date().toISOString()
    }
  }
  const result: ManagedKeyMutationResult | ManagedKeysBatchResult = batch
    ? { requested_count: ids.length, applied: true, changed, replayed: false }
    : {
        key_id: id,
        status: action === 'delete' ? null : action === 'enable' ? 'ACTIVE' : 'DISABLED',
        applied: true,
        changed,
        replayed: false,
      }
  if (replay) managedReplays.set(replay, { body: fingerprint, result })
  return success(result)
}
const methods: MockMethod[] = [
  {
    url: '/api/v1/api-keys',
    method: 'get',
    response: (req: MockRequest) => {
      const search = first(req.query?.search) || ''
      const status = first(req.query?.status) || ''
      const control = first(req.query?.control_condition) || ''
      const department = first(req.query?.department_id) || ''
      const user = first(req.query?.user_id) || ''
      const locale = first(req.query?.locale) || 'zh-CN'
      const page = Number(first(req.query?.page) ?? 1)
      const pageSize = Number(first(req.query?.page_size) ?? 20)
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100 ||
        search.length > 128 ||
        (status && !['ACTIVE', 'DISABLED'].includes(status)) ||
        (control &&
          ![
            'BASIC_CONDITIONS_MET',
            'BLOCKED',
            'USER_DISABLED',
            'KEY_DISABLED',
            'AI_FROZEN',
            'TERMS_REQUIRED',
          ].includes(control))
      )
        return fail('VALIDATION_FAILED', '')
      const departmentIds = department ? managedKeyDepartmentIds(department) : []
      const filtered = managedItems(locale).filter(
        (key) =>
          (!status || key.status === status) &&
          (!control ||
            key.control_condition === control ||
            key.control_reasons.includes(control)) &&
          (!department || departmentIds.includes(key.department_id)) &&
          (!user || key.user_id === user) &&
          [key.id, key.name, key.masked_value, key.username, key.user_display_name].some((value) =>
            value.toLowerCase().includes(search.toLowerCase()),
          ),
      )
      return success({
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        page,
        page_size: pageSize,
        total: filtered.length,
        total_pages: Math.ceil(filtered.length / pageSize),
      })
    },
  },
  ...(['delete', 'disable', 'enable'] as const).map((action): MockMethod => ({
    url: `/api/v1/api-keys/batch/${action}`,
    method: 'post',
    response: (req: MockRequest) => managedMutation(req, action, true),
  })),
  ...(['enable', 'disable', 'delete'] as const).map((action): MockMethod => ({
    url: `/api/v1/api-keys/:key_id${action === 'delete' ? '' : `/${action}`}`,
    method: action === 'delete' ? 'delete' : 'post',
    response: (req: MockRequest) => managedMutation(req, action, false),
  })),
  {
    url: '/api/v1/me/keys',
    method: 'get',
    response: (req: MockRequest) => {
      const user = mockId(usernameFromToken(req)!)
      const all = keysFor(user)
      const search = first(req.query?.search) || ''
      const status = first(req.query?.status) || ''
      const page = Number(first(req.query?.page) ?? 1)
      const pageSize = Number(first(req.query?.page_size) ?? 20)
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100 ||
        (status && !['ACTIVE', 'DISABLED'].includes(status))
      )
        return fail('MALFORMED_REQUEST', '')
      const filtered = all.filter(
        (key) =>
          (!status || key.status === status) &&
          [key.id, key.name, key.masked_value].some((value) =>
            value.toLowerCase().includes(search.toLowerCase()),
          ),
      )
      return success({
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        page,
        page_size: pageSize,
        total: filtered.length,
        total_pages: Math.ceil(filtered.length / pageSize),
        active_count: all.filter((key) => key.status === 'ACTIVE').length,
        total_count: all.length,
        active_limit: activeLimit,
      })
    },
  },
  {
    url: '/api/v1/me/keys',
    method: 'post',
    response: (req: MockRequest) => {
      const user = mockId(usernameFromToken(req)!)
      const replay = replayId(req, user)
      const previous = replays.get(replay) as CreateMyKeyResult | undefined
      if (previous)
        return success({ ...previous, plaintext: null, secret_available: false, replayed: true })
      const name = validName(req)
      if (!name) return fail('VALIDATION_FAILED', '')
      const keys = keysFor(user)
      if (keys.filter((key) => key.status === 'ACTIVE').length >= activeLimit)
        return fail('KEY_LIMIT_EXCEEDED', '')
      sequence += 1
      const id = mockId(`${user}:created:${sequence}`)
      const plaintext = `sk-mock-${mockId(`${id}:secret`)}`
      const now = new Date().toISOString()
      const key: ApiKeyItem = {
        id,
        user_id: user,
        name,
        masked_value: `sk-mock-****${plaintext.slice(-4)}`,
        status: 'ACTIVE',
        created_at: now,
        updated_at: now,
        usage_source: 'NOT_CONNECTED',
        last_used_at: null,
        last_used_ip: null,
      }
      keys.unshift(key)
      const result: CreateMyKeyResult = {
        key: { ...key },
        plaintext,
        secret_available: true,
        replayed: false,
      }
      // 明文不进入幂等缓存，重放永远不可再次取得。
      if (replay) replays.set(replay, { ...result, plaintext: null, secret_available: false })
      return success(result)
    },
  },
  {
    url: '/api/v1/me/keys/:key_id',
    method: 'patch',
    response: (req: MockRequest) => {
      const user = mockId(usernameFromToken(req)!)
      const replay = replayId(req, user)
      const previous = replays.get(replay) as UpdateMyKeyResult | undefined
      if (previous) return success({ ...previous, replayed: true })
      const name = validName(req)
      if (!name) return fail('VALIDATION_FAILED', '')
      const key = keysFor(user).find((item) => item.id === pathId(req))
      if (!key) return fail('NOT_FOUND', '')
      key.name = name
      key.updated_at = new Date().toISOString()
      const result: UpdateMyKeyResult = { key: { ...key }, replayed: false }
      if (replay) replays.set(replay, result)
      return success(result)
    },
  },
  {
    url: '/api/v1/me/keys/:key_id',
    method: 'delete',
    response: (req: MockRequest) => {
      const user = mockId(usernameFromToken(req)!)
      const id = pathId(req)
      const replay = replayId(req, user)
      const previous = replays.get(replay) as DeleteMyKeyResult | undefined
      if (previous) return success({ ...previous, replayed: true })
      const keys = keysFor(user)
      const index = keys.findIndex((key) => key.id === id)
      if (index < 0) return fail('NOT_FOUND', '')
      keys.splice(index, 1)
      const result: DeleteMyKeyResult = { key_id: id, applied: true, replayed: false }
      if (replay) replays.set(replay, result)
      return success(result)
    },
  },
]
export default methods.map((method) => {
  const handler = method.response
  return {
    ...method,
    response(this: RespThisType, req: MockRequest) {
      const result = !checkToken(req)
        ? unauthorized()
        : method.method !== 'get' && !checkCsrf(req)
          ? fail('CSRF_INVALID', '')
          : handler.call(this, req)
      const statuses: Record<string, number> = {
        OK: 200,
        UNAUTHENTICATED: 401,
        CSRF_INVALID: 403,
        VALIDATION_FAILED: 422,
        CURSOR_INVALID: 400,
        MALFORMED_REQUEST: 400,
        CURSOR_STALE: 409,
        KEY_LIMIT_EXCEEDED: 409,
        NOT_FOUND: 404,
        OUT_OF_SCOPE: 403,
        BATCH_TOO_LARGE: 422,
        DELETE_TOO_LARGE: 409,
        IDEMPOTENCY_CONFLICT: 409,
      }
      this.res.statusCode = statuses[result.code] ?? 400
      if (
        result.code === 'OK' &&
        method.method === 'post' &&
        method.url === '/api/v1/me/keys' &&
        !result.data.replayed
      )
        this.res.statusCode = 201
      return result
    },
  }
}) as MockMethod[]
