/** Cost P0 has no backend contract yet. Isolated browser mock, through the shared request pipeline. */
import type { AxiosAdapter } from 'axios'
import type {
  Bill,
  BillItem,
  BillTask,
  Budget,
  BudgetConfig,
  CostDepartment,
  CostUser,
  Dimension,
  Level,
} from '@/api/modules/cost'

export const costMockCapabilities = ['cost.bills', 'cost.budgets'].map((resource_code) => ({
  resource_code,
  can_read: true,
  can_write: true,
}))
let actor = 'cost-demo'
export function setCostMockActor(id: string) {
  actor = id
}
const departmentNames = [
  ['hq', '', '总部', 'Headquarters'],
  ['tech', 'hq', '技术中心', 'Technology Center'],
  ['platform', 'tech', '平台研发部', 'Platform Engineering'],
  ['algorithm', 'tech', '算法研究部', 'Algorithm Research'],
  ['product', 'hq', '产品设计部', 'Product Design'],
  ['marketing', 'hq', '市场营销部', 'Marketing'],
  ['security', 'hq', '安全合规部', 'Security & Compliance'],
  ['finance', 'hq', '财务管理部', 'Finance'],
  ['data', 'hq', '数据分析部', 'Data Analytics'],
  ['operations', 'hq', '运营管理部', 'Operations'],
  ['support', 'hq', '客户支持部', 'Customer Support'],
  ['hr', 'hq', '人力资源部', 'Human Resources'],
]
const departments: CostDepartment[] = departmentNames.map(([id, parent, name, name_en]) => ({
  id: id!,
  parent_id: parent || null,
  name: name!,
  name_en: name_en!,
  path: '',
  path_en: '',
  has_children: departmentNames.some((row) => row[1] === id),
}))
for (const item of departments) {
  const parent = departments.find((d) => d.id === item.parent_id)
  item.path = parent ? `${parent.path} / ${item.name}` : item.name
  item.path_en = parent ? `${parent.path_en} / ${item.name_en}` : item.name_en
}
const userSeeds = [
  ['admin', '陈知远', 'hq'],
  ['lin.ya', '林予安', 'algorithm'],
  ['wang.xc', '王晓晨', 'product'],
  ['zhang.m', '张明', 'marketing'],
  ['li.sy', '李思雨', 'security'],
  ['zhou.jx', '周景行', 'finance'],
  ['zhao.ym', '赵一鸣', 'platform'],
  ['wu.qy', '吴清越', 'algorithm'],
  ['xu.jn', '徐嘉宁', 'product'],
  ['sun.rx', '孙若溪', 'marketing'],
  ['zheng.zh', '郑子涵', 'security'],
  ['liu.yf', '刘亦帆', 'finance'],
  ['huang.y', '黄悦', 'platform'],
  ['shen.sy', '沈书言', 'algorithm'],
  ['he.zm', '何子墨', 'product'],
  ['fang.kx', '方可欣', 'marketing'],
  ['liang.xc', '梁星辰', 'security'],
  ['xu.zh', '许之恒', 'finance'],
  ['song.yt', '宋雨桐', 'platform'],
  ['lu.qh', '陆清和', 'algorithm'],
  ['jiang.y', '江屿', 'product'],
  ['chen.x', '陈曦', 'marketing'],
  ['wang.y', '王瑜', 'security'],
  ['li.q', '李青', 'finance'],
]
const users: CostUser[] = Array.from({ length: 48 }, (_, index) => {
  const seed = userSeeds[index % userSeeds.length]!
  const username = `${seed[0]}${index >= userSeeds.length ? '.2' : ''}`
  return {
    id: `u-${index + 1}`,
    username,
    name: seed[1]!,
    department_id: seed[2]!,
    email: index === 22 ? null : `${username}@example.com`,
    active: index !== 9 && index !== 18,
  }
})
const levels: Level[] = ['WARNING', 'CRITICAL', 'EXCEEDED']
const defaults = (): BudgetConfig => ({
  budget_amount: 5000,
  currency: 'CNY',
  period_type: 'MONTHLY',
  budget_mode: 'SHARED',
  warning_threshold: 80,
  critical_threshold: 95,
  over_budget_action: 'ALERT_ONLY',
  notification_recipients: { WARNING: [], CRITICAL: [], EXCEEDED: [] },
  notification_channels: { WARNING: ['IN_APP'], CRITICAL: ['IN_APP'], EXCEEDED: ['IN_APP'] },
})
function period(type: BudgetConfig['period_type']) {
  const now = new Date()
  const year = now.getFullYear(),
    month = now.getMonth()
  const startMonth = type === 'QUARTERLY' ? Math.floor(month / 3) * 3 : month
  const date = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    current_period_start: date(new Date(year, startMonth, 1)),
    current_period_end: date(new Date(year, startMonth + (type === 'QUARTERLY' ? 3 : 1), 0)),
  }
}
function seedBudget(
  id: string,
  department_id: string,
  amount: number,
  consumed: number,
  user_id: string | null = null,
): Budget {
  return {
    ...defaults(),
    ...period('MONTHLY'),
    id,
    department_id,
    user_id,
    configured: true,
    budget_amount: amount,
    consumed_amount: consumed,
    temporary_amount: 0,
    effective_amount: amount,
    remaining_amount: amount - consumed,
    usage: (consumed / amount) * 100,
    status: 'NORMAL',
    source_department_id: department_id,
    adjustments: [],
    history: [{ action: 'CREATED', amount, at: '2026-09-06T02:20:00Z', actor: 'cost-demo' }],
  }
}
interface State {
  departmentBudgets: Budget[]
  userBudgets: Budget[]
  bills: Bill[]
  tasks: BillTask[]
  sequence: number
  archives?: Budget[]
}
function seed(): State {
  const departmentBudgets = [
    seedBudget('hq', 'hq', 200000, 128450),
    seedBudget('tech', 'tech', 80000, 52300),
    seedBudget('algorithm', 'algorithm', 40000, 35200),
    seedBudget('product', 'product', 30000, 28100),
    seedBudget('marketing', 'marketing', 20000, 12300),
  ]
  departmentBudgets[1]!.over_budget_action = 'BLOCK_DEPARTMENT'
  departmentBudgets[2]!.budget_mode = 'INDEPENDENT'
  departmentBudgets[2]!.over_budget_action = 'BLOCK_DEPARTMENT'
  departmentBudgets[3]!.budget_mode = 'INDEPENDENT'
  departmentBudgets.forEach((b) =>
    levels.forEach((level) => {
      b.notification_recipients[level] = ['u-1']
    }),
  )
  const userBudgets = users
    .filter((u) => ['algorithm', 'product'].includes(u.department_id) || u.id === 'u-5')
    .map((u, i) => {
      const amount = u.id === 'u-2' ? 8000 : u.id === 'u-5' ? 3000 : 5000
      const consumed =
        u.id === 'u-2'
          ? 7200
          : u.id === 'u-3'
            ? 4800
            : u.id === 'u-15'
              ? 6100
              : u.id === 'u-5'
                ? 1400
                : 1000 + i * 130
      const b = seedBudget(u.id, u.department_id, amount, consumed, u.id)
      b.over_budget_action = u.department_id === 'algorithm' ? 'BLOCK_USER' : 'ALERT_ONLY'
      return b
    })
  const adjustmentUser = userBudgets.find((b) => b.user_id === 'u-5')!
  const now = new Date(),
    year = now.getFullYear(),
    month = now.getMonth()
  adjustmentUser.adjustments = [
    {
      id: 'adj-1',
      user_id: 'u-5',
      additional_amount: 1000,
      valid_from: new Date(year, month, 1).toISOString(),
      valid_until: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
      source_work_order_id: 'WO-2026-0104',
      status: 'ACTIVE',
    },
    {
      id: 'adj-2',
      user_id: 'u-5',
      additional_amount: 1200,
      valid_from: new Date(year, month - 1, 10).toISOString(),
      valid_until: new Date(year, month, 0, 23, 59, 59).toISOString(),
      source_work_order_id: 'WO-2026-0103',
      status: 'EXPIRED',
    },
  ]
  const billSeeds: [string, string, Bill['period_type'], number, number, number][] = [
    ['2026-09-14', '2026-09-20', 'WEEKLY', 32100, 11300000, 3150],
    ['2026-09-07', '2026-09-13', 'WEEKLY', 35200, 12100000, 3420],
    ['2026-09-01', '2026-09-30', 'MONTHLY', 128450, 45200000, 12580],
    ['2026-08-24', '2026-08-30', 'WEEKLY', 27800, 9700000, 2810],
    ['2026-08-17', '2026-08-23', 'WEEKLY', 30600, 10800000, 2980],
    ['2026-08-01', '2026-08-31', 'MONTHLY', 114380, 40100000, 11200],
    ['2026-07-01', '2026-07-31', 'MONTHLY', 98620, 35100000, 9840],
  ]
  const bills = billSeeds.map(([start, end, type, amount, tokens, requests], i): Bill => ({
    id: `bill-${i + 1}`,
    period_type: type,
    period_start: start,
    period_end: end,
    department_id: 'hq',
    created_by: actor,
    task_id: null,
    total_cost: amount,
    total_input_tokens: Math.round(tokens * 0.7),
    total_output_tokens: Math.round(tokens * 0.3),
    total_requests: requests,
    currency: 'CNY',
    status: 'COMPLETED',
    generated_at: `${end}T18:00:00Z`,
  }))
  return { departmentBudgets, userBudgets, bills, tasks: [], sequence: 20 }
}
function state(): State {
  const key = `ais_cost_mock_v1_${actor}`
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as State
  } catch {
    /* Empty or unavailable storage uses deterministic seeds. */
  }
  return seed()
}
function persist(data: State) {
  localStorage.setItem(`ais_cost_mock_v1_${actor}`, JSON.stringify(data))
}
function subtree(id: string): string[] {
  return [id, ...departments.filter((d) => d.parent_id === id).flatMap((d) => subtree(d.id))]
}
function effectiveDepartment(s: State, id: string): Budget | undefined {
  const own = s.departmentBudgets.find((b) => b.department_id === id)
  if (own) return own
  const parent = departments.find((d) => d.id === id)?.parent_id
  if (!parent) return
  const source = effectiveDepartment(s, parent)
  return source?.budget_mode === 'SHARED' ? source : undefined
}
function viewBudget(s: State, id: string, kind: string): Budget {
  const user = kind === 'users' ? users.find((u) => u.id === id) : undefined
  const departmentId = user?.department_id ?? id
  const own = (kind === 'users' ? s.userBudgets : s.departmentBudgets).find((b) => b.id === id)
  const source = effectiveDepartment(s, departmentId)
  const hq = s.departmentBudgets.find((b) => b.id === 'hq')!
  const b = structuredClone(own ?? source ?? seedBudget(id, departmentId, 0, 0))
  b.id = id
  b.department_id = departmentId
  b.user_id = user?.id ?? null
  b.configured = Boolean(own)
  b.source_department_id = source?.department_id ?? null
  b.currency = hq.currency
  b.period_type = hq.period_type
  Object.assign(b, period(hq.period_type))
  b.adjustments.forEach((a) => {
    a.status = Date.parse(a.valid_until) < Date.now() ? 'EXPIRED' : 'ACTIVE'
  })
  b.temporary_amount = b.adjustments
    .filter((a) => a.status === 'ACTIVE' && Date.parse(a.valid_from) <= Date.now())
    .reduce((sum, a) => sum + a.additional_amount, 0)
  b.effective_amount = Math.round((b.budget_amount + b.temporary_amount) * 1e6) / 1e6
  b.remaining_amount = Math.round((b.effective_amount - b.consumed_amount) * 1e6) / 1e6
  b.usage = b.effective_amount ? (b.consumed_amount / b.effective_amount) * 100 : 0
  b.status = !own
    ? !source
      ? 'UNCONFIGURED'
      : kind === 'users'
        ? source.budget_mode === 'SHARED'
          ? 'SHARED'
          : 'UNCONFIGURED'
        : 'INHERITED'
    : b.usage >= 100
      ? 'EXCEEDED'
      : b.usage >= b.critical_threshold
        ? 'CRITICAL'
        : b.usage >= b.warning_threshold
          ? 'WARNING'
          : 'NORMAL'
  if (!own) {
    const archive = s.archives
      ?.filter((item) => item.id === id && Boolean(item.user_id) === (kind === 'users'))
      .slice(-1)[0]
    b.history = archive?.history ?? []
    b.adjustments = archive?.adjustments ?? []
  }
  return b
}
function nextRun(type: BillTask['period_type']): string {
  const now = new Date()
  if (type === 'MONTHLY') return new Date(now.getFullYear(), now.getMonth() + 1, 1, 2).toISOString()
  const day = now.getDay() || 7
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8 - day, 2).toISOString()
}
const rows = (items: unknown[], q: Record<string, string>) => {
  const page = Math.max(1, Number(q.page) || 1),
    page_size = Math.min(100, Math.max(1, Number(q.page_size) || 20))
  return {
    items: items.slice((page - 1) * page_size, page * page_size),
    page,
    page_size,
    total: items.length,
    total_pages: Math.ceil(items.length / page_size),
  }
}
const providers = ['OpenAI', '阿里云百炼', '火山引擎', '内网推理集群']
const models = ['gpt-4o', 'qwen-plus', 'doubao-pro', 'gpt-4o-mini']
/** Leaf records make all four dimensions, subtree filters and CSV share a single accounting source. */
function billItems(
  bill: Bill,
  dimension: Dimension,
  q: Record<string, string>,
  english: boolean,
): BillItem[] {
  const allowed = subtree(bill.department_id)
  const filterIds = q.department_id
    ? subtree(q.department_id).filter((id) => allowed.includes(id))
    : allowed
  const leaves = users
    .filter((u) => allowed.includes(u.department_id))
    .map((u, i) => ({ user: u, weight: i + 1, provider: i % 4, model: i % 4 }))
  const denominator = leaves.reduce((sum, row) => sum + row.weight, 0)
  const filtered = leaves.filter((r) => filterIds.includes(r.user.department_id))
  const sumWeight = filtered.reduce((sum, r) => sum + r.weight, 0)
  const names =
    dimension === 'PROVIDER'
      ? providers.map((name, i) => ({ id: String(i), name }))
      : dimension === 'MODEL'
        ? models.map((name, i) => ({ id: String(i), name }))
        : dimension === 'USER'
          ? filtered.map((r) => ({ id: r.user.id, name: r.user.username }))
          : departments
              .filter((d) => filterIds.includes(d.id))
              .map((d) => ({ id: d.id, name: english ? d.name_en : d.name }))
  const result: BillItem[] = []
  for (const entry of names) {
    const dept = departments.find((d) => d.id === entry.id)
    const matched = filtered.filter((r) =>
      dimension === 'PROVIDER'
        ? String(r.provider) === entry.id
        : dimension === 'MODEL'
          ? String(r.model) === entry.id
          : dimension === 'USER'
            ? r.user.id === entry.id
            : subtree(entry.id).includes(r.user.department_id),
    )
    if (!matched.length) continue
    const weight = matched.reduce((sum, r) => sum + r.weight, 0)
    const share = weight / denominator
    const user = users.find((u) => u.id === entry.id)
    const userDept = departments.find((d) => d.id === user?.department_id)
    result.push({
      id: entry.id,
      dimension,
      dimension_id: entry.id,
      dimension_name: entry.name,
      department_id: dept?.id ?? user?.department_id ?? '',
      parent_id: dept?.parent_id ?? null,
      has_children: dept?.has_children ?? false,
      own: false,
      name: user?.name ?? '',
      department_path: english
        ? (userDept?.path_en ?? dept?.path_en ?? '')
        : (userDept?.path ?? dept?.path ?? ''),
      service_type: entry.id === '3' ? 'PRIVATE' : 'COMMERCIAL',
      cost: Math.round(bill.total_cost * share * 1e6) / 1e6,
      input_tokens: Math.round(bill.total_input_tokens * share),
      output_tokens: Math.round(bill.total_output_tokens * share),
      request_count: Math.round(bill.total_requests * share),
      cost_ratio: sumWeight ? (weight / sumWeight) * 100 : 0,
      details: models
        .map((name, index) => {
          const w = matched.filter((r) => r.model === index).reduce((sum, r) => sum + r.weight, 0)
          return {
            name,
            cost: Math.round(((bill.total_cost * w) / denominator) * 1e6) / 1e6,
            tokens: Math.round(
              ((bill.total_input_tokens + bill.total_output_tokens) * w) / denominator,
            ),
            request_count: Math.round((bill.total_requests * w) / denominator),
          }
        })
        .filter((r) => r.cost > 0),
    })
  }
  if (dimension === 'DEPARTMENT' && q.parent_id !== undefined) {
    const parent = q.parent_id || q.department_id || bill.department_id
    const own = result.find((r) => r.id === parent)
    const direct = filtered.filter((r) => r.user.department_id === parent)
    const siblings = result.filter((r) => r.parent_id === parent)
    if (own && direct.length && siblings.length) {
      const w = direct.reduce((n, r) => n + r.weight, 0),
        ratio = w / denominator
      siblings.unshift({
        ...own,
        id: `${parent}-own`,
        dimension_name: english ? 'This department' : '本部门',
        own: true,
        has_children: false,
        cost: bill.total_cost * ratio,
        input_tokens: Math.round(bill.total_input_tokens * ratio),
        output_tokens: Math.round(bill.total_output_tokens * ratio),
        request_count: Math.round(bill.total_requests * ratio),
        cost_ratio: sumWeight ? (w / sumWeight) * 100 : 0,
        details: models
          .map((name, i) => {
            const weight = direct.filter((r) => r.model === i).reduce((n, r) => n + r.weight, 0)
            return {
              name,
              cost: (bill.total_cost * weight) / denominator,
              tokens: Math.round(
                ((bill.total_input_tokens + bill.total_output_tokens) * weight) / denominator,
              ),
              request_count: Math.round((bill.total_requests * weight) / denominator),
            }
          })
          .filter((r) => r.cost > 0),
      })
    }
    if (!siblings.length && own) return [own]
    return sortItems(siblings, q)
  }
  return sortItems(result, q)
}
function sortItems(items: BillItem[], q: Record<string, string>) {
  const metric = (r: BillItem) =>
    q.sort_by === 'tokens'
      ? r.input_tokens + r.output_tokens
      : q.sort_by === 'requests'
        ? r.request_count
        : r.cost
  return items.sort((a, b) => (metric(a) - metric(b)) * (q.direction === 'asc' ? 1 : -1))
}
function handle(
  s: State,
  path: string,
  method: string,
  q: Record<string, string>,
  body: Record<string, unknown>,
  english: boolean,
): unknown {
  const fail = (code = 'VALIDATION_FAILED'): never => {
    throw new Error(code)
  }
  if (path === '/cost/mock-budget-validation') {
    const amount = Number(body.budget_amount),
      ids = (body.user_ids as string[] | undefined) ?? []
    if (body.kind === 'departments') {
      const target = String(body.department_id)
      const limit =
        target === 'hq' ? amount : s.departmentBudgets.find((b) => b.id === 'hq')!.budget_amount
      const sum = s.departmentBudgets
        .filter((b) => b.id !== 'hq' && b.id !== target)
        .reduce((n, b) => n + b.budget_amount, target === 'hq' ? 0 : amount)
      return sum > limit ? [{ sum, limit, kind: 'departments' }] : []
    }
    return [
      ...new Set(users.filter((u) => ids.includes(u.id)).map((u) => u.department_id)),
    ].flatMap((departmentId) => {
      const source = effectiveDepartment(s, departmentId)
      if (!source) return []
      const range = subtree(source.department_id)
      const sum =
        s.userBudgets
          .filter((b) => range.includes(b.department_id) && !ids.includes(b.id))
          .reduce((n, b) => n + b.budget_amount, 0) +
        users.filter((u) => ids.includes(u.id) && range.includes(u.department_id)).length * amount
      return sum > source.budget_amount ? [{ sum, limit: source.budget_amount, kind: 'users' }] : []
    })
  }
  if (path.startsWith('/cost/mock-departments/'))
    return departments.find((d) => d.id === path.split('/').slice(-1)[0]) ?? fail('NOT_FOUND')
  if (path === '/cost/mock-users') {
    const allowed = q.allowed_ids.split(',')
    const keyword = q.search.trim().toLowerCase()
    const range = q.department_id ? subtree(q.department_id) : subtree('hq')
    return rows(
      users.filter(
        (u) =>
          allowed.includes(u.id) &&
          range.includes(u.department_id) &&
          (!keyword || `${u.name} ${u.username}`.toLowerCase().includes(keyword)),
      ),
      q,
    )
  }
  if (path === '/cost/mock-context')
    return {
      departments: departments.filter(
        (d) =>
          (!q.scope_id || subtree(q.scope_id).includes(d.id)) &&
          (q.search
            ? `${d.name} ${d.name_en} ${d.path}`.toLowerCase().includes(q.search.toLowerCase())
            : d.parent_id === (q.parent_id || null)),
      ),
      users,
      scope_root_id: 'hq',
      is_headquarters: true,
    }
  if (path === '/bills' && method === 'get')
    return rows(
      s.bills
        .filter(
          (b) =>
            (!q.period_type || b.period_type === q.period_type) &&
            (!q.period_value || b.period_start.startsWith(q.period_value)) &&
            (!q.department_id || b.department_id === q.department_id),
        )
        .sort((a, b) => b.period_start.localeCompare(a.period_start)),
      q,
    )
  if (path === '/bills/generate') {
    const type = body.period_type as Bill['period_type'],
      value = String(body.period_value),
      department_id = String(body.department_id)
    if (
      !departments.some((d) => d.id === department_id) ||
      !['MONTHLY', 'WEEKLY'].includes(type) ||
      !/^\d{4}-\d{2}(-\d{2})?$/.test(value)
    )
      fail()
    const start = new Date(`${value.length === 7 ? `${value}-01` : value}T00:00:00Z`)
    if (!Number.isFinite(start.getTime())) fail()
    if (type === 'WEEKLY') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    const end =
      type === 'MONTHLY'
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
        : new Date(start.getTime() + 6 * 86400000)
    const period_start = start.toISOString().slice(0, 10),
      period_end = end.toISOString().slice(0, 10)
    let bill = s.bills.find(
      (b) =>
        b.period_type === type &&
        b.department_id === department_id &&
        b.period_start === period_start,
    )
    if (!bill) {
      bill = {
        ...s.bills[0]!,
        id: `bill-${++s.sequence}`,
        department_id,
        period_type: type,
        period_start,
        period_end,
        task_id: null,
        total_cost: type === 'MONTHLY' ? 128450 : 32100,
      }
      s.bills.unshift(bill)
    }
    bill.status = 'GENERATING'
    bill.generated_at = new Date().toISOString()
    bill.created_by = actor
    bill.task_id = null
    return bill
  }
  const billMatch = path.match(/^\/bills\/([^/]+)(?:\/(items|export))?$/)
  if (billMatch) {
    const bill = s.bills.find((b) => b.id === billMatch[1])
    if (!bill) return fail('NOT_FOUND')
    if (bill.status === 'GENERATING' && Date.now() - Date.parse(bill.generated_at) > 600)
      bill.status = 'COMPLETED'
    if (!billMatch[2]) return bill
    if (q.department_id && !subtree(bill.department_id).includes(q.department_id))
      return fail('OUT_OF_SCOPE')
    const items = billItems(bill, q.dimension as Dimension, q, english)
    if (billMatch[2] === 'items') return items
    if (q.dimension === 'DEPARTMENT') {
      const ownRows = items
        .filter((r) => r.has_children)
        .flatMap((r) =>
          billItems(bill, 'DEPARTMENT', { ...q, parent_id: r.dimension_id }, english).filter(
            (child) => child.own,
          ),
        )
      items.push(...ownRows)
    }
    const escape = (value: unknown) =>
      `"${String(value ?? '')
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&")}"`
    const header = english
      ? [
          'Name / Department path',
          'Scope',
          'Cost',
          'Input Token',
          'Output Token',
          'Requests',
          'Cost ratio (%)',
        ]
      : [
          '名称 / 部门路径',
          '统计口径',
          '消费金额',
          'Input Token',
          'Output Token',
          '请求次数',
          '费用占比（%）',
        ]
    return new Blob(
      [
        '\uFEFF' +
          [
            header,
            ...items.map((r) => [
              q.dimension === 'DEPARTMENT'
                ? r.department_path
                : q.dimension === 'USER'
                  ? `${r.dimension_name} / ${r.name} / ${r.department_path}`
                  : r.dimension_name,
              q.dimension === 'DEPARTMENT' && r.has_children
                ? english
                  ? 'Includes descendants'
                  : '含下级'
                : english
                  ? 'Direct'
                  : '本部门',
              r.cost.toFixed(6),
              r.input_tokens,
              r.output_tokens,
              r.request_count,
              r.cost_ratio.toFixed(2),
            ]),
          ]
            .map((row) => row.map(escape).join(','))
            .join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8' },
    )
  }
  if (path === '/bill-tasks' && method === 'get')
    return rows(
      s.tasks.filter(
        (t) =>
          t.created_by === actor &&
          (!q.department_id || t.department_id === q.department_id) &&
          (!q.status || t.status === q.status),
      ),
      q,
    )
  if (path.startsWith('/bill-tasks')) {
    const id = path.split('/')[2],
      task = s.tasks.find((t) => t.id === id && t.created_by === actor)
    if (id && !task) return fail('NOT_FOUND')
    if (method === 'delete') {
      if (!String(body.reason ?? '').trim()) fail()
      s.tasks = s.tasks.filter((t) => t !== task)
      return {}
    }
    if (method === 'patch' && task) {
      task.status = body.status as BillTask['status']
      task.next_run_at = task.status === 'ACTIVE' ? nextRun(task.period_type) : null
      return task
    }
    const data = body as unknown as BillTask
    if (
      !departments.some((d) => d.id === data.department_id) ||
      !['MONTHLY', 'WEEKLY'].includes(data.period_type) ||
      (data.email_enabled &&
        (!data.email_recipients.length ||
          data.email_recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
    )
      fail()
    const next: BillTask = {
      ...data,
      id: task?.id ?? `task-${++s.sequence}`,
      created_by: actor,
      status: task?.status ?? 'ACTIVE',
      next_run_at: nextRun(data.period_type),
      last_run_at: task?.last_run_at ?? null,
      last_bill_id: task?.last_bill_id ?? null,
      created_at: task?.created_at ?? new Date().toISOString(),
      email_recipients: data.email_enabled ? data.email_recipients : [],
    }
    if (next.status === 'DISABLED') next.next_run_at = null
    if (task) Object.assign(task, next)
    else s.tasks.unshift(next)
    return next
  }
  const analytics = path.match(/^\/budgets\/(departments|users)\/([^/]+)\/analytics$/)
  if (analytics) {
    const budget = viewBudget(s, analytics[2]!, analytics[1]!)
    const start = new Date(`${budget.current_period_start}T00:00:00Z`)
    const today = new Date()
    const current = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    const days = Math.floor((current.getTime() - start.getTime()) / 86400000) + 1
    const weights = Array.from({ length: days }, (_, i) => 10 + ((i * 7) % 13))
    const total = weights.reduce((n, w) => n + w, 0)
    return {
      trend: weights.map((w, i) => ({
        date: new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10),
        cost: Math.round(((budget.consumed_amount * w) / total) * 1e6) / 1e6,
      })),
      models: models.map((name, i) => ({
        name,
        cost: budget.consumed_amount * [0.36, 0.25, 0.21, 0.18][i]!,
        requests: 33 + i * 7,
      })),
      users: users
        .filter((u) => subtree(budget.department_id).includes(u.department_id))
        .slice(0, 10)
        .map((u, i) => ({ name: u.username, cost: (budget.consumed_amount * (10 - i)) / 55 })),
    }
  }
  const match = path.match(/^\/budgets\/(departments|users)(?:\/([^/]+))?$/)
  if (match) {
    const kind = match[1]!,
      id = match[2]
    if (method === 'get') {
      if (id) return viewBudget(s, id, kind)
      let budgets =
        kind === 'users'
          ? users.map((u) => viewBudget(s, u.id, kind))
          : departments
              .filter(
                (d) =>
                  d.id !== 'hq' && (q.search || q.status || d.parent_id === (q.parent_id || 'hq')),
              )
              .map((d) => viewBudget(s, d.id, kind))
      budgets = budgets.filter((b) => {
        const user = users.find((u) => u.id === b.user_id),
          dept = departments.find((d) => d.id === b.department_id)
        return (
          (!q.search ||
            `${user?.username ?? ''} ${user?.name ?? ''} ${dept?.name ?? ''} ${dept?.name_en ?? ''}`
              .toLowerCase()
              .includes(q.search.toLowerCase())) &&
          (!q.status || b.status === q.status) &&
          (!q.department_id || subtree(q.department_id).includes(b.department_id))
        )
      })
      if (kind === 'users') {
        const order = ['EXCEEDED', 'CRITICAL', 'WARNING', 'NORMAL', 'SHARED', 'UNCONFIGURED']
        budgets.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
      }
      return { ...rows(budgets, q), headquarters: viewBudget(s, 'hq', 'departments') }
    }
    if (method === 'delete' && id) {
      if (!String(body.reason ?? '').trim() || id === 'hq') fail()
      const removed =
        kind === 'users'
          ? s.userBudgets.filter((b) => b.id === id)
          : [
              ...s.departmentBudgets.filter((b) =>
                (body.cascade_subtree ? subtree(id) : [id]).includes(b.id),
              ),
              ...(body.cascade_subtree
                ? s.userBudgets.filter((b) => subtree(id).includes(b.department_id))
                : []),
            ]
      s.archives ??= []
      removed.forEach((budget) => {
        budget.adjustments.forEach((a) => {
          a.status = 'EXPIRED'
          a.valid_until = new Date().toISOString()
        })
        budget.history.unshift({
          action: 'REMOVED',
          amount: budget.budget_amount,
          at: new Date().toISOString(),
          actor,
          reason: String(body.reason),
        })
        s.archives!.push(structuredClone(budget))
      })
      if (kind === 'users') s.userBudgets = s.userBudgets.filter((b) => b.id !== id)
      else {
        const ids = body.cascade_subtree ? subtree(id) : [id]
        s.departmentBudgets = s.departmentBudgets.filter((b) => !ids.includes(b.id))
        if (body.cascade_subtree)
          s.userBudgets = s.userBudgets.filter((b) => !ids.includes(b.department_id))
      }
      return {}
    }
    const data = body as unknown as BudgetConfig
    if (
      !(data.budget_amount > 0) ||
      !Number.isFinite(data.budget_amount) ||
      data.warning_threshold <= 0 ||
      data.critical_threshold <= data.warning_threshold ||
      data.critical_threshold >= 100
    )
      fail()
    const ids: string[] =
      kind === 'users'
        ? ((body.user_ids as string[] | undefined) ?? (id ? [id] : []))
        : [id ?? String(body.department_id)]
    if (!ids.length) fail()
    for (const level of levels) {
      const recipients = data.notification_recipients[level]
      if (kind === 'departments' && data.notification_channels[level].length && !recipients.length)
        fail()
      const effective = [...recipients, ...(kind === 'users' ? ids : [])]
      if (
        data.notification_channels[level].includes('EMAIL') &&
        effective.some((uid) => {
          const u = users.find((u) => u.id === uid)
          return !u?.active || !u.email
        })
      )
        fail()
    }
    const list = kind === 'users' ? s.userBudgets : s.departmentBudgets
    for (const target of ids) {
      const user = users.find((u) => u.id === target)
      if (kind === 'users' ? !user : !departments.some((d) => d.id === target)) fail('OUT_OF_SCOPE')
      let budget = list.find((b) => b.id === target)
      const isNew = !budget
      if (!budget) {
        budget = seedBudget(
          target,
          user?.department_id ?? target,
          data.budget_amount,
          0,
          user?.id ?? null,
        )
        budget.history = []
        list.push(budget)
      }
      const hq = s.departmentBudgets.find((b) => b.id === 'hq')!
      const configuration = Object.fromEntries(
        Object.keys(defaults()).map((key) => [key, data[key as keyof BudgetConfig]]),
      )
      Object.assign(budget, configuration, {
        currency: target === 'hq' ? data.currency : hq.currency,
        period_type: target === 'hq' ? data.period_type : hq.period_type,
      })
      budget.history.unshift({
        action: isNew ? 'CREATED' : 'UPDATED',
        amount: data.budget_amount,
        at: new Date().toISOString(),
        actor,
        configuration: structuredClone(data),
      })
    }
    return viewBudget(s, ids[0]!, kind)
  }
  return fail('NOT_FOUND')
}
export const costMockAdapter: AxiosAdapter = async (config) => {
  await new Promise((resolve) => setTimeout(resolve, 120))
  const s = state(),
    path = config.url ?? '',
    method = config.method ?? 'get'
  const body =
    typeof config.data === 'string'
      ? (JSON.parse(config.data) as Record<string, unknown>)
      : (config.data ?? {})
  const q = Object.fromEntries(
    Object.entries(config.params ?? {})
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  )
  let data: unknown
  try {
    // Polling list responses completes asynchronous generation without page-local timers mutating data.
    s.bills.forEach((b) => {
      if (b.status === 'GENERATING' && Date.now() - Date.parse(b.generated_at) > 600)
        b.status = 'COMPLETED'
    })
    data = handle(
      s,
      path,
      method,
      q,
      body,
      String(config.headers['Accept-Language']).startsWith('en'),
    )
    persist(s)
    if (!(data instanceof Blob))
      data = { code: 'OK', data, params: {}, request_id: `cost-mock-${s.sequence}` }
  } catch (error) {
    data = {
      code: (error as Error).message,
      data: null,
      params: {},
      request_id: `cost-mock-${s.sequence}`,
    }
  }
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': data instanceof Blob ? 'text/csv' : 'application/json' },
    config,
  }
}
