import { request } from '../request'
import type { OffsetPageQuery, OffsetPageResult } from '../types'

/** Temporary prototype contract, authorized 2026-11-13. No production endpoints yet. */
export type ProjectStatus = 'ACTIVE' | 'DISABLED' | 'ARCHIVED'
export type ProjectRole = 'ADMIN' | 'MEMBER'
export interface ProjectRef {
  id: string
  name: string
  display_name: string
}
export interface ProjectUsage {
  amount: number
  requests: number
  tokens: number
}
export interface ProjectMember extends ProjectUsage {
  id: string
  username: string
  display_name: string
  department: string
  role: ProjectRole
  joined_at: string
  model_usage: ProjectModelUsage[]
}
export interface ProjectModelUsage extends ProjectUsage {
  id: string
  name: string
  provider: string
  input_tokens: number
  output_tokens: number
  cache_tokens: number
}
export interface ProjectBudget {
  currency?: 'CNY' | 'USD'
  status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EXHAUSTED' | 'DISABLED'
  amount: number
  consumed: number
  member_limit: number
  start: string
  end: string
  period_type?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  warning_threshold?: number
  critical_threshold?: number
}
export interface ProjectItem {
  id: string
  name: string
  description: string
  department_id: string
  department: string
  admin_ids: string[]
  member_ids: string[]
  model_ids: string[]
  member_count: number
  status: ProjectStatus
  created_at: string
  role: ProjectRole | null
  budget: ProjectBudget | null
  usage: ProjectUsage | null
  key_count: number
}
export interface ProjectDetail extends ProjectItem {
  admins: string[]
  models: ProjectRef[]
  ranking: ProjectModelUsage[]
  can_manage: boolean
}
export interface ProjectPayload {
  name: string
  description: string
  department_id: string
  admin_ids: string[]
  member_ids: string[]
  model_ids: string[]
}
export interface ProjectQuery extends OffsetPageQuery {
  search?: string
  status?: string
  department_id?: string
  role?: string
  mine?: boolean
  created_start?: string
  created_end?: string
  min_members?: number
  max_members?: number
  sort?: string
}
export const getProjects = (params: ProjectQuery, personal = false) =>
  request.get<OffsetPageResult<ProjectItem>>(personal ? '/me/projects' : '/projects', { params })
export const getProject = (id: string) => request.get<ProjectDetail>(`/me/projects/${id}`)
export const createProject = (data: ProjectPayload) => request.post<ProjectItem>('/projects', data)
export const updateProject = (id: string, data: ProjectPayload) =>
  request.patch<ProjectItem>(`/projects/${id}`, data)
export const projectAction = (id: string, action: string) =>
  request.post(`/projects/${id}/${action}`)
export const getProjectMembers = (id: string, params: OffsetPageQuery) =>
  request.get<OffsetPageResult<ProjectMember>>(`/me/projects/${id}/members`, { params })
export const addProjectMembers = (id: string, user_ids: string[], role: ProjectRole) =>
  request.post(`/me/projects/${id}/members`, { user_ids, role })
export const changeProjectMembers = (
  id: string,
  user_ids: string[],
  action: 'remove' | 'promote',
) => request.post(`/me/projects/${id}/members/${action}`, { user_ids })
export const projectUserOptions = (params: OffsetPageQuery & { search?: string }) =>
  request.get<OffsetPageResult<ProjectMember>>('/projects/user-options', { params })
export const projectModelOptions = (params: OffsetPageQuery & { search?: string }) =>
  request.get<OffsetPageResult<ProjectRef>>('/projects/model-options', { params })
