import { directory, existingState, runtimeState, type RuntimeUser } from './_runtime'
import { modelAccessState } from './_modelAccessState'
// Load the shared physical-model fixtures before any project/expense snapshot.
import './modelAccess'
import type {
  ProjectBudget,
  ProjectPayload,
  ProjectRole,
  ProjectStatus,
  ProjectUsage,
  ProjectDetail,
} from '../src/api/modules/projects'

export interface StoredProject extends ProjectPayload {
  id: string
  status: ProjectStatus
  created_at: string
  joined: Record<string, string>
  usage: Record<string, ProjectUsage>
  budget: ProjectBudget | null
  ranking: Record<string, ProjectDetail['ranking']>
}
const seeds = [
  ['智能客服知识库', 'd-algo'],
  ['代码助手试点', 'd-platform'],
  ['营销内容生成', 'd-marketing'],
  ['产品体验分析', 'd-product'],
  ['安全事件研判', 'd-security'],
  ['财务智能报表', 'd-finance'],
  ['数据分析平台', 'd-data'],
  ['招聘简历筛选', 'd-hr'],
  ['技术中心智能运维', 'd-tech'],
  ['总部知识助理', 'd-root'],
  ['智能合同审阅', 'd-finance'],
  ['客服质检分析', 'd-support'],
  ['风控模型评测', 'd-security'],
  ['研发知识检索', 'd-platform'],
  ['市场洞察分析', 'd-marketing'],
  ['财务合规检查', 'd-finance'],
  ['招聘助手', 'd-hr'],
  ['运维告警归因', 'd-tech'],
  ['产品需求摘要', 'd-product'],
  ['安全周报生成', 'd-security'],
  ['临时测试项目', 'd-root'],
  ['运营流程自动化', 'd-ops'],
  ['客户支持问答', 'd-support'],
]
export function projects() {
  return runtimeState<StoredProject[]>('projects', () =>
    seeds.map(([name, department_id], index) => {
      const candidates = [...directory.values()].filter(
        (user) => user.status === 'ACTIVE' && user.department_id === department_id,
      )
      const admins =
        index === 9 || index === 20
          ? [...directory.values()].filter(
              (user) => user.username === 'admin' || user.username === 'mock_admin',
            )
          : (candidates.length
              ? candidates
              : [...directory.values()].filter((user) => user.username === 'admin')
            ).slice(0, 1)
      const memberIds = [
        ...new Set(
          [...admins, ...candidates.slice(0, index === 20 ? 0 : 7)].map((user) => user.id),
        ),
      ]
      const created = new Date(Date.UTC(2026, index % 10, 1 + (index % 25), 1)).toISOString()
      const consumed = memberIds.reduce((sum, _, i) => sum + (i + 1) * 880, 0)
      const models = modelAccessState.models
        .filter((model) => model.status === 'ACTIVE')
        .slice(0, 3)
      return {
        id: `project-${index + 1}`,
        name: name!,
        department_id: department_id!,
        description:
          index === 9
            ? '总部制度与流程问答，覆盖跨部门知识检索。'
            : index === 20
              ? ''
              : `${name}，提供企业 AI 场景支持。`,
        admin_ids: admins.map((user) => user.id),
        member_ids: memberIds.filter((id) => !admins.some((user) => user.id === id)),
        model_ids:
          index === 20
            ? []
            : modelAccessState.models
                .filter((model) => model.status === 'ACTIVE')
                .slice(0, 3)
                .map((model) => model.id),
        status: index === 21 ? 'DISABLED' : index === 22 ? 'ARCHIVED' : 'ACTIVE',
        created_at: created,
        joined: Object.fromEntries(memberIds.map((id) => [id, created])),
        usage: Object.fromEntries(
          memberIds.map((id, i) => [
            id,
            {
              amount: index === 20 ? 0 : (i + 1) * 880,
              requests: index === 20 ? 0 : (i + 1) * 2750,
              tokens: index === 20 ? 0 : (i + 1) * 1320000,
            },
          ]),
        ),
        ranking: Object.fromEntries(
          memberIds.map((id, i) => [
            id,
            index === 20
              ? []
              : models.map((model, j) => {
                  const share = (total: number) =>
                    Math.floor(total / models.length) + (j < total % models.length ? 1 : 0)
                  return {
                    id: model.id,
                    name: model.model_id_at_gateway,
                    provider: model.provider_name,
                    amount: share((i + 1) * 88000) / 100,
                    requests: share((i + 1) * 2750),
                    tokens: share((i + 1) * 1320000),
                    input_tokens: Math.floor(share((i + 1) * 1320000) * 0.6),
                    output_tokens: Math.floor(share((i + 1) * 1320000) * 0.3),
                    cache_tokens:
                      share((i + 1) * 1320000) -
                      Math.floor(share((i + 1) * 1320000) * 0.6) -
                      Math.floor(share((i + 1) * 1320000) * 0.3),
                  }
                }),
          ]),
        ),
        budget:
          index === 20
            ? null
            : {
                status:
                  index > 20
                    ? 'DISABLED'
                    : index % 5 === 3
                      ? 'WARNING'
                      : index % 7 === 5
                        ? 'EXHAUSTED'
                        : 'NORMAL',
                amount:
                  index % 5 === 3
                    ? Math.ceil(consumed / 0.85)
                    : index % 7 === 5
                      ? Math.floor(consumed / 1.05)
                      : 30000,
                consumed,
                member_limit: 10000,
                start: '2026-11-01',
                end: '2026-11-30',
              },
      }
    }),
  )
}
export function projectIds(project: StoredProject) {
  return [...new Set([...project.admin_ids, ...project.member_ids])].filter((id) =>
    [...directory.values()].some((user) => user.id === id),
  )
}
export function projectRole(project: StoredProject, id: string): ProjectRole | null {
  return project.admin_ids.includes(id)
    ? 'ADMIN'
    : project.member_ids.includes(id)
      ? 'MEMBER'
      : null
}
export function userProjects(id: string) {
  return projects()
    .filter((project) => projectIds(project).includes(id))
    .map((project) => ({ id: project.id, name: project.name, display_name: project.name }))
}
export function departmentPath(id: string | null, english = false): string {
  if (!id) return '—'
  const departments =
    existingState<
      {
        id: string
        name: string
        parent_id: string | null
        translations: Record<string, { name: string }>
      }[]
    >('departments') ?? []
  const item = departments.find((department) => department.id === id)
  if (!item) return '—'
  const name = english ? (item.translations['en-US']?.name ?? item.name) : item.name
  return item.parent_id ? `${departmentPath(item.parent_id, english)}/${name}` : name
}
export function memberView(user: RuntimeUser, project?: StoredProject, english = false) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    department: departmentPath(user.department_id, english),
    role: project ? (projectRole(project, user.id) ?? 'MEMBER') : 'MEMBER',
    joined_at: project?.joined[user.id] ?? '',
    model_usage: project?.ranking?.[user.id] ?? [],
    ...(project?.usage[user.id] ?? { amount: 0, requests: 0, tokens: 0 }),
  }
}
