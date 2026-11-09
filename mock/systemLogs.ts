import { operationLogs, runtimeState } from './_runtime'
import {
  authMock,
  checkToken,
  checkCsrf,
  success,
  fail,
  unauthorized,
  mockId,
  pathId,
  type MockRequest,
  type MockMethod,
} from './_utils'
import type { ManagementLog, RuntimeLog, LogRetention } from '../src/api/modules/systemLogs'

// 固定数据顺序和时间间隔；基准在服务启动时冻结，避免翻页期间记录漂移。
const anchor = Date.now()
const at = (minutes: number) => new Date(anchor - minutes * 60000).toISOString()
const seeds = [
  [3, '林晓', 'super', 'update', 'security', 'policy', '全局阻断策略', '修改安全策略阈值'],
  [11, '张三', 'admin', 'create', 'identity', 'user', '王五', '创建用户王五'],
  [24, '林晓', 'super', 'delete', 'model', 'provider', 'OpenAI-测试', '删除供应商'],
  [45, '李思', 'auditor', 'export', 'audit', 'access_log', '—', '导出访问记录'],
  [75, '张三', 'admin', 'login', 'identity', 'session', '管理端会话', '管理员登录'],
  [
    130,
    '林晓',
    'super',
    'configure',
    'system',
    'log_retention',
    '日志保留策略',
    '修改操作日志保留天数',
  ],
  [180, '陈思远', 'admin', 'import', 'model', 'model', '模型清单', '导入模型配置'],
  [250, '李思', 'auditor', 'review', 'audit', 'security_event', '异常访问事件', '审核安全事件'],
  [780, '周宁', 'admin', 'disable', 'identity', 'api_key', '生产环境 Key', '禁用 API Key'],
  [1600, '周宁', 'admin', 'enable', 'identity', 'user', '王五', '启用用户王五'],
  [4200, '林晓', 'super', 'execute', 'system', 'task', '数据清理任务', '执行数据清理任务'],
] as const
const seedManagement: ManagementLog[] = seeds.map((s, i) => ({
  event_id: mockId(`system-log-${i}`),
  occurred_at: at(s[0]),
  action: `${s[4]}.${s[5]}.${s[3]}`,
  actor_user_id: mockId(s[1]),
  actor_display_name_snapshot: s[1],
  actor_username_snapshot: null,
  resource_id: mockId(s[6]),
  resource_type: s[5],
  target_display_name_snapshot: s[6],
  outcome: i === 2 ? 'FAILED' : 'SUCCEEDED',
  reason: null,
  request_id: mockId(`request-${i}`),
  actor_department_snapshot: null,
  target_department_snapshot: null,
  target_user_id: null,
  target_username_snapshot: null,
  annotation: null,
  changes:
    i === 0
      ? [{ field: 'threshold', before: 80, after: 90 }]
      : i === 5
        ? [{ field: 'operation_days', before: 180, after: 365 }]
        : [],
  prototype: {
    role: s[2],
    module: s[4],
    operation: s[3],
    resource_name: s[6],
    description: s[7],
    client_ip: i === 4 ? null : `192.168.1.${20 + i}`,
    user_agent: i === 4 ? null : 'Mozilla/5.0 Chrome/130.0.0.0',
    parameters: i === 1 ? { username: 'wangwu', display_name: '王五' } : {},
    error: i === 2 ? '该供应商仍有关联模型，无法删除' : null,
  },
}))
const management = operationLogs
runtimeState('operationLogSeed', () => {
  management.push(...seedManagement)
  return true
})
const runtimeSeeds = [
  [
    1,
    'INFO',
    'data_plane',
    'node-01',
    'gateway-worker-01',
    'request-proxy',
    '请求处理完成，耗时 128 ms',
    { request_id: 'req-a81c20', status: 200, duration_ms: 128 },
  ],
  [
    4,
    'WARNING',
    'database',
    'node-01',
    'gateway-worker-01',
    'query-monitor',
    '慢查询检测，查询耗时 1.84 秒',
    { query_duration_ms: 1840 },
  ],
  [
    9,
    'ERROR',
    'plugin',
    'node-02',
    'gateway-worker-02',
    'dlp-plugin',
    'DLP 插件连接超时，已重试 3 次并切换备用通道',
    { retries: 3, fallback: true },
  ],
  [
    15,
    'INFO',
    'scheduler',
    'node-01',
    'gateway-worker-01',
    'cleanup-task',
    '数据清理任务执行完成，清理 2,418 条过期记录',
    { deleted_count: 2418 },
  ],
  [
    24,
    'CRITICAL',
    'data_plane',
    'node-02',
    'gateway-worker-02',
    'request-proxy',
    '请求处理线程池接近耗尽，拒绝新请求',
    { active_threads: 200 },
  ],
  [
    38,
    'INFO',
    'control_plane',
    'node-control-01',
    'gateway-control-01',
    'config-loader',
    '配置热加载完成，当前版本 v2.8.14',
    { version: 'v2.8.14' },
  ],
  [
    70,
    'WARNING',
    'system',
    'node-03',
    'gateway-worker-03',
    'disk-monitor',
    '磁盘使用率达到 82%，高于预警阈值 80%',
    { usage: 82, threshold: 80 },
  ],
  [
    180,
    'INFO',
    'plugin',
    'node-02',
    'gateway-worker-02',
    'sensitive-detector',
    '敏感信息检测插件启动完成',
    {},
  ],
  [
    780,
    'ERROR',
    'database',
    'node-control-01',
    'gateway-control-01',
    'connection-pool',
    '数据库连接池短暂中断后自动恢复',
    {},
  ],
] as const
const runtime = runtimeState<RuntimeLog[]>('runtimeLogs', () =>
  runtimeSeeds.map((s, i) => ({
    id: mockId(`runtime-${i}`),
    occurred_at: at(s[0]),
    level: s[1],
    source: s[2],
    node_id: s[3],
    node_name: s[4],
    component: s[5],
    message: s[6],
    context: s[7],
  })),
)
const shared = globalThis as typeof globalThis & { __aisLogRetention?: LogRetention }
const retention = (shared.__aisLogRetention ??= { operation_days: 365, runtime_days: 90 })
const options = {
  modules: ['identity', 'model', 'cost', 'security', 'audit', 'system'],
  operations: [
    'create',
    'update',
    'delete',
    'enable',
    'disable',
    'import',
    'export',
    'login',
    'logout',
    'view_sensitive',
    'review',
    'resolve',
    'execute',
    'configure',
  ],
  resource_types: [
    'user',
    'group',
    'role',
    'api_key',
    'provider',
    'model',
    'policy',
    'access_log',
    'security_event',
    'session',
    'log_retention',
    'task',
  ],
  levels: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
  sources: ['control_plane', 'data_plane', 'plugin', 'database', 'scheduler', 'system'],
  nodes: [
    { value: 'node-01', label: 'gateway-worker-01' },
    { value: 'node-02', label: 'gateway-worker-02' },
    { value: 'node-03', label: 'gateway-worker-03' },
    { value: 'node-control-01', label: 'gateway-control-01' },
  ],
}
function windowFor(req: MockRequest) {
  const q = req.query ?? {}
  return {
    window_from: String(q.from || new Date(Date.now() - 86400000).toISOString()),
    window_to: String(q.to || new Date().toISOString()),
  }
}
function filtered(req: MockRequest, kind: 'management' | 'runtime') {
  const q = req.query ?? {}
  const { window_from: from, window_to: to } = windowFor(req)
  if (
    !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) ||
    Date.parse(from) >= Date.parse(to)
  )
    return []
  const inWindow = (time: string) =>
    Date.parse(time) >= Date.parse(from) && Date.parse(time) < Date.parse(to)
  if (kind === 'management')
    return [...management]
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .filter(
        (x) =>
          inWindow(x.occurred_at) &&
          (!q.actor ||
            `${x.actor_display_name_snapshot} ${x.actor_username_snapshot ?? ''}`
              .toLowerCase()
              .includes(String(q.actor).toLowerCase())) &&
          (!q.module || x.prototype?.module === q.module) &&
          (!q.action || x.prototype?.operation === q.action || x.action === q.action) &&
          (!q.outcome || x.outcome === q.outcome) &&
          (!q.resource_type || x.resource_type === q.resource_type),
      )
  return runtime.filter(
    (x) =>
      inWindow(x.occurred_at) &&
      (!q.level || x.level === q.level) &&
      (!q.source || x.source === q.source) &&
      (!q.node_id || x.node_id === q.node_id) &&
      (!q.keyword || x.message.toLowerCase().includes(String(q.keyword).toLowerCase())),
  )
}
function list(req: MockRequest, kind: 'management' | 'runtime') {
  const page = Number(req.query?.page ?? 1),
    page_size = Number(req.query?.page_size ?? 20)
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(page_size) ||
    page_size < 1 ||
    page_size > 100
  )
    return fail('VALIDATION_FAILED', '')
  const rows = filtered(req, kind)
  return success({
    items: rows.slice((page - 1) * page_size, page * page_size),
    page,
    page_size,
    total: rows.length,
    total_pages: Math.ceil(rows.length / page_size),
    ...(kind === 'management' ? windowFor(req) : {}),
  })
}
export default authMock([
  {
    url: '/api/v1/audit/management',
    method: 'get',
    response: (req: MockRequest) => (checkToken(req) ? list(req, 'management') : unauthorized()),
  },
  {
    url: '/api/v1/audit/management/:id',
    method: 'get',
    response: (req: MockRequest) =>
      !checkToken(req)
        ? unauthorized()
        : management.find((x) => x.event_id === pathId(req))
          ? success(management.find((x) => x.event_id === pathId(req)))
          : fail('NOT_FOUND', ''),
  },
  {
    url: '/api/v1/prototype/system-logs/runtime',
    method: 'get',
    response: (req: MockRequest) => (checkToken(req) ? list(req, 'runtime') : unauthorized()),
  },
  {
    url: '/api/v1/prototype/system-logs/runtime/:id',
    method: 'get',
    response: (req: MockRequest) =>
      !checkToken(req)
        ? unauthorized()
        : runtime.find((x) => x.id === pathId(req))
          ? success(runtime.find((x) => x.id === pathId(req)))
          : fail('NOT_FOUND', ''),
  },
  {
    url: '/api/v1/prototype/system-logs/options',
    method: 'get',
    response: (req: MockRequest) => (checkToken(req) ? success(options) : unauthorized()),
  },
  {
    url: '/api/v1/prototype/system-logs/export',
    method: 'get',
    response: (req: MockRequest) =>
      checkToken(req) ? success(filtered(req, 'management')) : unauthorized(),
  },
  {
    url: '/api/v1/prototype/system-logs/retention',
    method: 'get',
    response: (req: MockRequest) => (checkToken(req) ? success({ ...retention }) : unauthorized()),
  },
  {
    url: '/api/v1/prototype/system-logs/retention',
    method: 'put',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      if (!checkCsrf(req)) return fail('CSRF_INVALID', '')
      const { operation_days: op, runtime_days: run } = req.body ?? {}
      if (
        typeof op !== 'number' ||
        !Number.isInteger(op) ||
        op < 180 ||
        op > 730 ||
        typeof run !== 'number' ||
        !Number.isInteger(run) ||
        run < 30 ||
        run > 365
      )
        return fail('VALIDATION_FAILED', '')
      Object.assign(retention, { operation_days: op, runtime_days: run })
      return success({ ...retention })
    },
  },
] as MockMethod[])
