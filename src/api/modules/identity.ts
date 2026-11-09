import { request } from '../request'
import { getManagedKeysApi } from './apiKeys'
import type { RequestConfig } from '../request'
import type { OffsetPageQuery, OffsetPageResult } from '../types'

export interface RoleItem {
  id: string
  name: string
  description: string
  display_name: string
  display_description: string
  requested_locale: string
  resolved_locale: string | null
  is_builtin: boolean
  builtin_code: string | null
  permissions_version: string
  user_count: number
  created_at: string
  updated_at: string
}

export interface RolePermission {
  resource_id: string
  resource_code: string
  name: string
  status: string
  management_policy: string
  actions: string[]
  can_read: boolean
  can_write: boolean
  is_assignable: boolean
  is_protected: boolean
}

export interface PermissionResource {
  id: string
  resource_code: string
  display_name: string
  description: string
  localized_name: string
  localized_description: string
  requested_locale: string
  resolved_locale: string | null
  status: string
  management_policy: string
  is_builtin: boolean
  is_protected: boolean
  registered_in_code: boolean
  sort_order: number
  grant_count: number
  actions: string[]
}

export interface RoleMutationResult {
  applied: boolean
  replayed: boolean
  role_id: string
}

export interface RolePayload {
  name: string
  description?: string
}

export type RoleGrant = Pick<RolePermission, 'resource_code' | 'can_read' | 'can_write'>

export function getRolesApi(params: OffsetPageQuery & { search?: string; builtin?: boolean }) {
  return request.get<OffsetPageResult<RoleItem>>('/roles', {
    params,
  })
}

export function getRoleApi(id: string) {
  return request.get<{
    role: RoleItem
    permissions: RolePermission[]
    translations: Record<string, { name: string; description: string }>
  }>(`/roles/${id}`)
}

export function getPermissionResourcesApi(
  params: OffsetPageQuery & { search?: string; status?: string; locale?: string },
) {
  return request.get<OffsetPageResult<PermissionResource>>('/permission-resources', { params })
}

export function createRoleApi(payload: RolePayload) {
  return request.post<RoleMutationResult>('/roles', payload)
}

export function updateRoleApi(id: string, payload: Partial<RolePayload>) {
  return request.patch<RoleMutationResult>(`/roles/${id}`, payload)
}

export function copyRoleApi(id: string, payload: RolePayload) {
  return request.post<RoleMutationResult>(`/roles/${id}/copy`, payload)
}

export function saveRolePermissionsApi(
  id: string,
  payload: { permissions: RoleGrant[] },

  idempotencyKey?: string,
) {
  return request.put<RoleMutationResult>(`/roles/${id}/permissions`, payload, {
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
}

export function deleteRoleApi(
  id: string,

  idempotencyKey?: string,
) {
  return request.delete<RoleMutationResult>(`/roles/${id}`, {
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
}

/** 用户状态（真实后端枚举：ACTIVE / DISABLED） */
export type UserStatus = 'ACTIVE' | 'DISABLED'

/** 后端本地化引用对象（部门 / 角色 / 用户组共用结构） */
export interface LocalizedRef {
  id: string
  /** 规范名称（默认语言） */
  name: string
  /** 按请求 locale 解析后的展示名称 */
  display_name: string
  requested_locale?: string
  resolved_locale?: string
}

export type UserDepartment = LocalizedRef
export type UserGroup = LocalizedRef
export type UserRole = LocalizedRef

/** 用户列表项（GET /users） */
export interface UserItem {
  id: string
  username: string
  display_name: string
  email: string | null
  phone: string | null
  department: UserDepartment | null
  groups: UserGroup[]
  role: UserRole | null
  status: UserStatus
  last_login_at: string | null
  created_at: string
  updated_at: string
  must_change_password: boolean
  ai_access_status: string
}

/** User list query (page/page_size). */
export interface UserQuery extends OffsetPageQuery {
  /** 用户名 / 姓名 / 邮箱 模糊匹配 */
  search?: string
  status?: UserStatus
  /** 部门筛选，含子部门 */
  department_id?: string
  role_id?: string
  sort?: 'created_desc' | 'username_asc'
}

/** 部门（后端返回扁平列表，前端按 parent_id 组树） */
export interface DepartmentItem {
  id: string
  name: string
  display_name: string
  parent_id: string | null
  depth: number
  sort_order: number
  description: string
  has_children: boolean
  matched?: boolean
  user_count: number
  requested_locale?: string
  resolved_locale?: string
}

/** 部门列表查询参数（后端返回树数据，无分页参数） */
export interface DepartmentQuery {
  /** 部门名称 / 描述 模糊匹配 */
  search?: string
  /** 部门筛选，含子部门 */
  parent_id?: string
}

export interface DepartmentListResult {
  items: DepartmentItem[]
  org_version: string
  scope_root_id: string | null
}

export interface DepartmentTranslation {
  name: string
  description: string
}

/** GET /departments/{id}：含多语言翻译，编辑时用于合并提交 */
export interface DepartmentDetail {
  id: string
  name: string
  description: string
  parent_id: string | null
  sort_order: number
  locales: Array<{ code: string; native_name: string }>
  translations: Record<string, DepartmentTranslation>
}

export interface CreateDepartmentPayload {
  name: string
  description: string
  parent_id: string
  sort_order: number
  translations: Record<string, DepartmentTranslation>
}

export interface UpdateDepartmentPayload {
  name: string
  description: string
  sort_order: number
  translations: Record<string, DepartmentTranslation>
}

export interface DepartmentDeletePreview {
  allowed: boolean
  block_reason: string
  /** 将被级联删除的部门数量（含自身） */
  department_count: number
  dependency_count: number
  max_departments: number
  max_dependencies: number
  max_users: number
  /** 将被级联删除的用户数量 */
  user_count: number
  org_version: string
}

/** 拖拽落点：放入节点内 / 节点前 / 节点后 */
export type DepartmentPlacement = 'inside' | 'before' | 'after'

export interface MoveDepartmentPayload {
  parent_id: string
  sort_order: number
}

export interface PlaceDepartmentPayload {
  parent_id: string
  placement: DepartmentPlacement
  /** before/after 时的参照部门；inside 时省略 */
  anchor_id?: string
}

export interface DepartmentMutationResult {
  applied: boolean
  id: string
  replayed: boolean
}

/** 可分配角色（创建/编辑用户下拉，GET /assignable-roles） */
export interface RoleOption {
  id: string
  name: string
  display_name: string
  is_builtin: boolean
}

export interface LocaleOption {
  locale_code: string
  native_name: string
  sort_order: number
  status: 'ACTIVE' | 'DISABLED'
}

export interface LocaleOptionsResult {
  default_locale: string
  items: LocaleOption[]
}

export interface MyPreferencesPayload {
  preferred_locale?: string | null
  time_zone?: string
}

export interface MyPreferences {
  preferred_locale: string | null
  requested_locale: string
  resolved_locale: string
  time_zone: string
}

export interface CreateUserPayload {
  username: string
  display_name: string
  email?: string | null
  phone?: string | null
  department_id: string
  role_id: string
  initial_password: string
}

export interface UpdateUserPayload {
  display_name?: string
  email?: string | null
  phone?: string | null
  department_id?: string
  role_id?: string
}

/** 变更类接口统一要求填写原因，写入审计日志 */
export interface UserMutationResult {
  applied: boolean
  changed: boolean
  replayed: boolean
  status: UserStatus | null
  user_id: string
}

export interface UserSaveResult {
  replayed: boolean
  user: UserItem
}

export interface BatchStatusPayload {
  user_ids: string[]
}

export interface BatchStatusResult {
  applied: boolean
  changed: boolean
  replayed: boolean
  requested_count: number
}

export interface ResetPasswordResult {
  replayed: boolean
  secret_available: boolean
  temporary_password: string | null
  user_id: string
}

export interface DeletePreview {
  allowed: boolean
  block_reason: string
  dependency_count: number
  max_dependencies: number
  org_version: string
  user_id: string
}

export interface BatchDeleteUserPreviewItem {
  display_name: string
  reason: string
  user_id: string
  username: string
}

export interface BatchDeleteUsersPreview {
  /** 是否存在可删除目标且无阻断条件，不代表删除许可 */
  allowed: boolean
  /** 拟删除用户全部 API Key 数量（含启用与禁用） */
  api_key_count: number
  block_reason: string
  deletable: BatchDeleteUserPreviewItem[]
  /** 拟清理的活动依赖总数，整批最多 5000 */
  dependency_count: number
  /** 被排除的本人及超级管理员 */
  excluded: BatchDeleteUserPreviewItem[]
  preview_digest: string
  requested_count: number
}

export interface BatchDeleteUsersPayload {
  preview_digest: string
  /** 预览时原始选择的全部用户 ID，包含排除项 */
  user_ids: string[]
}

export interface BatchDeleteUsersResult {
  api_key_count: number
  applied: boolean
  deleted_count: number
  excluded_count: number
  replayed: boolean
  requested_count: number
}

/** 导入任务状态（三阶段：preview → confirm → result） */
export type ImportTaskState =
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

export type ImportDuplicateMode = 'SKIP' | 'OVERWRITE'

export type ImportFileFormat = 'csv' | 'xlsx'

export interface ImportTask {
  id: string
  state: ImportTaskState
  total_rows: number
  valid_rows?: number
  can_confirm?: boolean
  can_download_errors?: boolean
  input_template_locale?: string | null
  input_template_version?: number | null
  created_count: number
  failed_count: number
  skipped_count: number
  overwritten_count: number
  duplicate_mode: ImportDuplicateMode
  expires_at: string | null
  completed_at: string | null
  last_error_code: string | null
}

export type ImportRowDisposition = 'CREATE' | 'OVERWRITE' | 'SKIP' | 'INVALID'

export interface ImportPreviewRow {
  row_number: number
  username: string
  disposition: ImportRowDisposition
  error_codes: string[]
  errors?: { code: string; field?: string | null; message: string }[]
  fields: {
    display_name: string
    email: string | null
    phone: string | null
    department_path: string
    role_name: string
  }
}

export interface ImportRowsResult {
  task_id: string
  state: ImportTaskState
  valid_rows?: number
  can_confirm?: boolean
  can_download_errors?: boolean
  response_locale?: string
  duplicate_mode: ImportDuplicateMode
  preview_counts: {
    create: number
    invalid: number
    overwrite: number
    skip: number
  }
  rows: ImportPreviewRow[]
}

/**
 * Mock 模式下的本地解析行。
 * 真实后端由服务端解析文件，前端仅上传文件；mock 无法解析 multipart，
 * 故由前端解析 CSV 后以 JSON 传给 mock，模拟同一套三阶段契约。
 */
export interface MockImportRow {
  line?: number
  username: string
  display_name: string
  email?: string
  phone?: string
  department_path: string
  role_name: string
  initial_password: string
}

/** 页码模式：返回 items/page/page_size/total/total_pages */
export function getUserListApi(params: UserQuery) {
  return request.get<OffsetPageResult<UserItem>>('/users', { params })
}

export interface UserTermsCurrent {
  id: string
  version: string
  mandatory_confirmation: boolean
}

export interface UserTermsAcceptance {
  id: string
  terms_id: string
  terms_version: string
  accepted_at: string
  client_ip: string | null
}

export type UserTermsInfo =
  | {
      visibility: 'VISIBLE'
      current_terms: UserTermsCurrent
      status: 'ACCEPTED' | 'NOT_ACCEPTED'
      current_acceptance: UserTermsAcceptance | null
      last_acceptance: UserTermsAcceptance | null
    }
  | { visibility: 'FORBIDDEN' }

/** 用户详情（GET /users/{id}） */
export function getUserDetailApi(id: string, config?: RequestConfig) {
  return request.get<{ user: UserItem; terms: UserTermsInfo | null }>(`/users/${id}`, config)
}

/** 模型授权来源中的模型信息（GET /users/{id}/model-grant-sources） */
export interface ModelGrantSourceModel {
  id: string
  display_name: string
  localized_name: string
  logical_name: string
  description: string
  localized_description: string
  requested_locale: string
  resolved_locale: string | null
  selectable: boolean
  status: string
}

/** 用户模型的授权来源：直接授权 / 部门继承 / 用户组继承 */
export interface UserModelGrantSource {
  model: ModelGrantSourceModel
  source_type: string
  source_id: string | null
  source_display_name: string | null
  source_in_scope: boolean
  scope_mode: string | null
}

/** 用户 API Key（GET /api-keys?user_id=） */
export interface UserApiKeyItem {
  id: string
  name: string
  masked_value: string
  status: UserStatus
  user_id: string
  username: string
  created_at: string
  updated_at?: string
  last_used_at: string | null
  last_used_ip: string | null
}

export interface UserApiKeyQuery extends OffsetPageQuery {
  user_id: string
  /** Key ID / 脱敏 Key / 名称 模糊匹配 */
  search?: string
  status?: UserStatus
}

export function getUserModelGrantSourcesApi(
  id: string,
  params: OffsetPageQuery = { page: 1, page_size: 20 },
) {
  return request.get<OffsetPageResult<UserModelGrantSource>>(`/users/${id}/model-grant-sources`, {
    params,
  })
}

/** 用户级直接模型授权（GET /users/{id}/model-grants） */
export interface UserModelGrant {
  id: string
  granted_at: string
  source_type: string
  source_id: string
  scope_mode: string
  model: ModelGrantSourceModel
}

/** 直接授权变更结果 */
export interface ModelGrantMutationResult {
  applied: boolean
  changed: boolean
  replayed: boolean
  subject_id: string
  subject_type: string
}

export function getUserModelGrantsApi(
  id: string,
  params: OffsetPageQuery = { page: 1, page_size: 20 },
) {
  return request.get<OffsetPageResult<UserModelGrant>>(`/users/${id}/model-grants`, { params })
}

/**
 * 覆盖保存用户级直接授权：model_ids 为全量直接授权集合，空集合表示清空直授。
 * 不影响部门 / 用户组继承的权限。
 */
export function setUserModelGrantsApi(id: string, payload: { model_ids: string[] }) {
  return request.put<ModelGrantMutationResult>(`/users/${id}/model-grants`, payload)
}

/** 已上架逻辑模型选项（模型选择列表用） */
export interface LogicalModelOption {
  id: string
  display_name: string
  localized_name: string
  logical_name: string
  status: string
  workload_kind: string
}

export function getLogicalModelOptionsApi(
  params: OffsetPageQuery & { search?: string } = { page: 1, page_size: 20 },
) {
  return request.get<OffsetPageResult<LogicalModelOption>>('/logical-models/options', { params })
}

export function getUserApiKeysApi(params: UserApiKeyQuery) {
  return getManagedKeysApi(params)
}

export function getDepartmentListApi(params: DepartmentQuery = {}) {
  return request.get<DepartmentListResult>('/departments', { params })
}

export function getDepartmentDetailApi(id: string) {
  return request.get<DepartmentDetail>(`/departments/${id}`, { skipLocale: true })
}

export function createDepartmentApi(payload: CreateDepartmentPayload) {
  return request.post<{ id: string; org_version: string; replayed: boolean }>(
    '/departments',
    payload,
  )
}

export function updateDepartmentApi(id: string, payload: UpdateDepartmentPayload) {
  return request.put<{ id: string; org_version: string; replayed: boolean }>(
    `/departments/${id}`,
    payload,
  )
}

/** 删除部门 */
export function deleteDepartmentApi(
  id: string,

  idempotencyKey?: string,
) {
  return request.delete<{ applied: boolean; id: string; replayed: boolean }>(`/departments/${id}`, {
    data: {},
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
}

export function getDepartmentDeletePreviewApi(id: string) {
  // 后端该接口不接受 locale 查询参数（带 locale 会返回 MALFORMED_REQUEST）
  return request.get<DepartmentDeletePreview>(`/departments/${id}/delete-preview`, {
    skipLocale: true,
  })
}

/** 按排序号移动部门子树（保留在目标父部门下） */
export function moveDepartmentApi(id: string, payload: MoveDepartmentPayload) {
  return request.post<DepartmentMutationResult>(`/departments/${id}/move`, payload)
}

/** 按落点放置部门子树：inside=放入目标下级，before/after=放到目标兄弟位置 */
export function placeDepartmentApi(
  id: string,
  payload: PlaceDepartmentPayload,

  idempotencyKey?: string,
) {
  return request.post<DepartmentMutationResult>(`/departments/${id}/place`, payload, {
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
}

export function getRoleOptionsApi() {
  return request.get<{ items: RoleOption[] }>('/assignable-roles')
}

export function getLocaleOptionsApi() {
  return request.get<LocaleOptionsResult>('/locales/options', { skipLocale: true })
}

/** 更新当前用户偏好（语言 / 时区） */
export function updateMyPreferencesApi(payload: MyPreferencesPayload) {
  return request.patch<MyPreferences>('/me/preferences', payload)
}

export function createUserApi(payload: CreateUserPayload) {
  return request.post<UserSaveResult>('/users', payload)
}

export function updateUserApi(id: string, payload: UpdateUserPayload) {
  return request.patch<UserSaveResult>(`/users/${id}`, payload)
}

export function enableUserApi(id: string) {
  return request.post<UserMutationResult>(`/users/${id}/enable`, {})
}

export function disableUserApi(id: string) {
  return request.post<UserMutationResult>(`/users/${id}/disable`, {})
}

export function batchEnableUsersApi(payload: BatchStatusPayload) {
  return request.post<BatchStatusResult>('/users/batch/enable', payload)
}

export function batchDisableUsersApi(
  payload: BatchStatusPayload,

  idempotencyKey?: string,
) {
  return request.post<BatchStatusResult>('/users/batch/disable', payload, {
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
}

export function resetUserPasswordApi(
  id: string,

  idempotencyKey?: string,
) {
  return request.post<ResetPasswordResult>(
    `/users/${id}/reset-password`,
    {},
    {
      headers: {
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
    },
  )
}

export function getUserDeletePreviewApi(id: string) {
  // 后端该接口未声明 Idempotency-Key，携带会返回 MALFORMED_REQUEST
  return request.post<DeletePreview>(`/users/${id}/delete-preview`, {}, { skipIdempotency: true })
}

export function deleteUserApi(
  id: string,

  idempotencyKey?: string,
) {
  return request.delete<UserMutationResult>(`/users/${id}`, {
    data: {},
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
}

/** 批量删除预览：返回拟删除/被排除用户与预览摘要，不授予删除许可 */
export function previewBatchDeleteUsersApi(payload: { user_ids: string[] }) {
  // 后端该接口未声明 Idempotency-Key，携带会返回 MALFORMED_REQUEST
  return request.post<BatchDeleteUsersPreview>('/users/batch/delete-preview', payload, {
    skipIdempotency: true,
  })
}

/** 批量删除：原子执行，需原样回传预览摘要与原始选择 */
export function batchDeleteUsersApi(payload: BatchDeleteUsersPayload, idempotencyKey: string) {
  return request.post<BatchDeleteUsersResult>('/users/batch/delete', payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  })
}

/**
 * 导入预览（第一阶段）。
 * 真实后端：multipart（file + format + mode）；
 * mock：无法解析 multipart，改为 JSON（前端已解析的 rows）。
 */
export function previewUserImportApi(
  file: File,
  options: { format: ImportFileFormat; mode?: ImportDuplicateMode; mockRows?: MockImportRow[] },
  idempotencyKey?: string,
) {
  const mode = options.mode ?? 'SKIP'
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    return request.post<ImportTask>(
      '/users/imports/preview',
      {
        filename: file.name,
        format: options.format,
        mode,
        rows: options.mockRows ?? [],
      },
      { idempotencyKey },
    )
  }

  const form = new FormData()
  form.append('file', file)
  form.append('format', options.format)
  form.append('mode', mode)
  return request.post<ImportTask>('/users/imports/preview', form, { idempotencyKey })
}

/** 导入确认 */
export function confirmUserImportApi(taskId: string, idempotencyKey?: string) {
  return request.post<ImportTask>(
    `/users/imports/${taskId}/confirm`,
    {},
    {
      headers: { 'Content-Type': 'application/json' },
      idempotencyKey,
      handledErrorCodes: [
        'IMPORT_PREVIEW_CHANGED',
        'PASSWORD_POLICY_CHANGED',
        'VALIDATION_FAILED',
        'FORBIDDEN',
        'OUT_OF_SCOPE',
        'RESOURCE_DISABLED',
        'NOT_FOUND',
      ],
    },
  )
}

export function downloadUserImportFailuresApi(taskId: string, format: ImportFileFormat = 'csv') {
  return request.get<Blob>(`/users/imports/${taskId}/errors`, {
    params: { format },
    responseType: 'blob',
    skipLocale: true,
  })
}

export function getUserImportTaskApi(taskId: string, signal?: AbortSignal) {
  return request.get<ImportTask>(`/users/imports/${taskId}`, {
    skipLocale: true,
    signal,
    handledErrorCodes: [
      'AUTHENTICATION_BUSY',
      'FORBIDDEN',
      'OUT_OF_SCOPE',
      'RESOURCE_DISABLED',
      'NOT_FOUND',
    ],
  })
}

export function getUserImportRowsApi(taskId: string, signal?: AbortSignal) {
  return request.get<ImportRowsResult>(`/users/imports/${taskId}/rows`, {
    skipLocale: true,
    signal,
    handledErrorCodes: [
      'IMPORT_PREVIEW_CHANGED',
      'FORBIDDEN',
      'OUT_OF_SCOPE',
      'RESOURCE_DISABLED',
      'NOT_FOUND',
    ],
  })
}

export function downloadUserImportTemplateApi(format: ImportFileFormat = 'csv') {
  return request.get<Blob>('/users/imports/template', {
    params: { format },
    responseType: 'blob',
    skipLocale: true,
  })
}

export function downloadUserImportResultApi(taskId: string, format: ImportFileFormat = 'csv') {
  return request.get<Blob>(`/users/imports/${taskId}/result`, {
    params: { format },
    responseType: 'blob',
    skipLocale: true,
  })
}

/* ------------------------------- 用户组 ------------------------------- */

/** 用户组成员状态 */
export type UserGroupMemberStatus = 'ACTIVE' | 'DISABLED'

/** 成员项内嵌部门（后端只返回所属部门本身，不含层级信息） */
export interface UserGroupMemberDepartment {
  id: string
  name: string
  display_name: string
  requested_locale?: string
  resolved_locale?: string | null
}

/** 用户组成员（成员列表 / 候选成员共用，GET /groups/{id}/members） */
export interface UserGroupMember {
  id: string
  username: string
  display_name: string
  status: UserGroupMemberStatus
  department: UserGroupMemberDepartment | null
  /** 加入时间，候选成员为 null */
  added_at: string | null
  /** 成员关系 ID，候选成员为 null */
  membership_id: string | null
}

/** 用户组创建人快照（无可见历史时为 null） */
export interface UserGroupCreator {
  user_id: string
  username: string
  display_name: string
}

/** 用户组列表项（GET /groups） */
export interface UserGroupItem {
  id: string
  name: string
  display_name: string
  description: string
  display_description: string
  created_at: string
  updated_at: string
  created_by: UserGroupCreator | null
  /** 当前用户是否可管理该组 */
  can_manage: boolean
  /** 是否存在当前用户不可见的组外成员 */
  has_out_of_scope_members: boolean
  membership_version: string
  requested_locale?: string
  resolved_locale?: string | null
  /** 组内成员总数；不可见时为 null */
  total_member_count: number | null
  /** 当前用户可见的成员数 */
  visible_member_count: number
  /** 非空表示当前用户对该组不可写（如超出管理范围） */
  write_blocking_code: string | null
}

/** 用户组列表查询参数（页码分页） */
export interface UserGroupQuery extends OffsetPageQuery {
  department_id?: string
  /** 用户组名称模糊匹配 */
  search?: string
}

/** 成员列表查询参数（页码分页） */
export interface UserGroupMemberQuery extends OffsetPageQuery {
  /** 姓名 / 用户名 模糊匹配 */
  search?: string
  /** 部门筛选，含子部门 */
  department_id?: string
}

/** 候选成员查询参数（页码分页） */
export interface UserGroupMemberOptionsQuery extends OffsetPageQuery {
  search?: string
  department_id?: string
}

export type UserGroupMemberOptionsPage = OffsetPageResult<UserGroupMember>

/** 成员列表分页结果 */
export interface UserGroupMemberPage extends OffsetPageResult<UserGroupMember> {
  /** 组内成员总数；不可见时为 null */
  total_member_count: number | null
  /** 当前用户可见的成员数 */
  visible_member_count: number
}

export interface UserGroupTranslationPayload {
  locale_code: string
  name: string
  description: string
}

export interface CreateUserGroupPayload {
  /** 名称上限 128 字符 */
  name: string
  /** 描述上限 2048 字符 */
  description: string
  /** 多语言名称 / 描述 */
  translations?: UserGroupTranslationPayload[]
}

export interface UpdateUserGroupPayload {
  name?: string
  description?: string
}

/** 用户组创建 / 编辑 / 删除结果（后端不回传完整用户组） */
export interface UserGroupMutationResult {
  applied: boolean
  group_id: string
  replayed: boolean
}

/** 成员增删结果 */
export interface UserGroupMemberMutationResult extends UserGroupMutationResult {
  /** 本次操作是否实际改变了成员关系 */
  changed: boolean
}

/** Group member mutation payload. */
export interface UserGroupMemberPayload {
  user_ids: string[]
}

export function getUserGroupListApi(params: UserGroupQuery) {
  return request.get<OffsetPageResult<UserGroupItem>>('/groups', { params })
}

export function createUserGroupApi(payload: CreateUserGroupPayload) {
  return request.post<UserGroupMutationResult>('/groups', payload)
}

export function updateUserGroupApi(id: string, payload: UpdateUserGroupPayload) {
  return request.patch<UserGroupMutationResult>(`/groups/${id}`, payload)
}

/** Delete a user group. */
export function deleteUserGroupApi(
  id: string,

  idempotencyKey?: string,
) {
  return request.delete<UserGroupMutationResult>(`/groups/${id}`, {
    data: {},
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
}

export interface UserGroupModelGrant {
  id: string
  granted_at: string
  source_type: string
  source_id: string
  scope_mode: string
  model: ModelGrantSourceModel
}

export function getUserGroupModelGrantsApi(
  id: string,
  params: OffsetPageQuery,
  config: RequestConfig = {},
) {
  return request.get<OffsetPageResult<UserGroupModelGrant>>(`/groups/${id}/model-grants`, {
    ...config,
    params,
  })
}

export function getUserGroupMembersApi(id: string, params: UserGroupMemberQuery) {
  return request.get<UserGroupMemberPage>(`/groups/${id}/members`, { params })
}

/** 组内可添加的候选成员（已在组内的用户不会返回） */
export function getUserGroupMemberOptionsApi(id: string, params: UserGroupMemberOptionsQuery) {
  return request.get<UserGroupMemberOptionsPage>(`/groups/${id}/member-options`, { params })
}

export function addUserGroupMembersApi(id: string, payload: UserGroupMemberPayload) {
  return request.post<UserGroupMemberMutationResult>(`/groups/${id}/members/add`, payload)
}

/** 移除成员：后端为 POST members/remove，且必须填写原因 */
export function removeUserGroupMembersApi(id: string, payload: UserGroupMemberPayload) {
  return request.post<UserGroupMemberMutationResult>(`/groups/${id}/members/remove`, payload)
}

export function getUserRoleOptionsApi() {
  return request.get<{ items: RoleOption[] }>('/user-role-options')
}

export function getGroupApi(id: string) {
  return request.get<{ group: UserGroupItem; translations: UserGroupTranslationPayload[] }>(
    `/groups/${id}`,
  )
}
