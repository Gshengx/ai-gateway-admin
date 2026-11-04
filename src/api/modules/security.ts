import request from '@/api/request'
import { securityMockAdapter } from '@/api/mock/security'
import type { OffsetPageResult } from '@/api/types'

export * from '@/api/securityTypes'
import type {
  DiscoveryTask,
  DiscoveryFile,
  DiscoveryRecord,
  DiscoverySuggestion,
  Allowlist,
  DetectionRule,
  Direction,
  PolicyDomain,
  RuleImportValidation,
  RuleTestResult,
  SecurityOptions,
  SecurityPolicy,
  SecurityQuery,
} from '@/api/securityTypes'

const mock = {
  adapter: securityMockAdapter,
  handledErrorCodes: [
    'FORBIDDEN',
    'VALIDATION_FAILED',
    'ABILITY_UNCONFIGURED',
    'IN_USE',
    'BUILT_IN_PROTECTED',
    'DUPLICATE_NAME',
  ],
}
const paths: Record<PolicyDomain, string> = {
  ACCESS_CONTROL: '/access-control-policies',
  DATA_CONTROL: '/data-control-policies',
  SECURITY_DETECTION: '/security-detection-policies',
  AUDIT: '/audit-policies',
}
export const listPolicies = (domain: PolicyDomain, params: SecurityQuery) =>
  request.get<OffsetPageResult<SecurityPolicy>>(paths[domain], { ...mock, params })
export const savePolicy = (domain: PolicyDomain, data: SecurityPolicy) =>
  data.id
    ? request.put<SecurityPolicy>(`${paths[domain]}/${data.id}`, data, mock)
    : request.post<SecurityPolicy>(paths[domain], data, mock)
export const deletePolicy = (domain: PolicyDomain, id: string, reason: string) =>
  request.delete(`${paths[domain]}/${id}`, { ...mock, data: { reason } })
export const setPolicyStatus = (
  domain: PolicyDomain,
  ids: string[],
  enabled: boolean,
  reason: string,
) => request.put(paths[domain] + '/status', { ids, enabled, reason }, mock)
export const reorderPolicies = (domain: PolicyDomain, ids: string[]) =>
  request.put(paths[domain] + '/priority', { ids, reason: 'PRIORITY_CHANGE' }, mock)
export const listRules = (params: SecurityQuery) =>
  request.get<OffsetPageResult<DetectionRule>>('/security/detection-rules', { ...mock, params })
/** Selectors and category totals must include every page, including imported rules. */
export async function getAllRules(params: Partial<SecurityQuery> = {}): Promise<DetectionRule[]> {
  const items: DetectionRule[] = []
  let page = 1
  while (true) {
    const result = await listRules({ ...params, page, page_size: 100 })
    items.push(...result.items)
    if (page >= result.total_pages) return items
    page++
  }
}
export const saveRule = (data: DetectionRule) =>
  data.id
    ? request.put<DetectionRule>(`/security/detection-rules/${data.id}`, data, mock)
    : request.post<DetectionRule>('/security/detection-rules', data, mock)
export const setRuleStatus = (ids: string[], enabled: boolean, reason: string) =>
  request.put('/security/detection-rules/status', { ids, enabled, reason }, mock)
export const deleteRule = (id: string, reason: string) =>
  request.delete(`/security/detection-rules/${id}`, { ...mock, data: { reason } })
export const testRule = (rule: DetectionRule, text: string, direction: Direction) =>
  request.post<RuleTestResult>('/security/detection-rules/test', { rule, text, direction }, mock)
export const ruleReferences = (id: string) =>
  request.get<SecurityPolicy[]>(`/security/detection-rules/${id}/references`, mock)
export const validateRuleImport = (rows: Record<string, string>[]) =>
  request.post<RuleImportValidation>('/security/detection-rules/import/validate', { rows }, mock)
export const importRules = (id: string) =>
  request.post<{ imported: number }>('/security/detection-rules/import', { id }, mock)
export const exportRules = (params: SecurityQuery, ids: string[]) =>
  request.get<DetectionRule[]>('/security/detection-rules/export', {
    ...mock,
    params: { ...params, ids: ids.join(',') },
  })
export const listAllowlists = (params: SecurityQuery) =>
  request.get<OffsetPageResult<Allowlist>>('/security/allowlists', { ...mock, params })
export const saveAllowlist = (data: Allowlist) =>
  data.id
    ? request.put<Allowlist>(`/security/allowlists/${data.id}`, data, mock)
    : request.post<Allowlist>('/security/allowlists', data, mock)
export const setAllowlistStatus = (ids: string[], enabled: boolean, reason: string) =>
  request.put('/security/allowlists/status', { ids, enabled, reason }, mock)
export const deleteAllowlist = (id: string, reason: string) =>
  request.delete(`/security/allowlists/${id}`, { ...mock, data: { reason } })
export const getSecurityOptions = (parent_id?: string, resolve_ids?: string[]) =>
  request.get<SecurityOptions>('/security/mock-options', {
    ...mock,
    params: { parent_id, resolve_ids: resolve_ids?.join(',') },
  })

export const listDiscoveryTasks = () =>
  request.get<OffsetPageResult<DiscoveryTask>>('/security/sample-analyses', mock)
export const createDiscoveryTask = (
  source: 'UPLOAD' | 'AUDIT',
  files: DiscoveryFile[],
  record_ids: string[],
  locale: string,
) =>
  request.post<DiscoveryTask>(
    '/security/sample-analyses',
    { source, files, record_ids, locale },
    mock,
  )
export const getDiscoveryTask = (id: string) =>
  request.get<DiscoveryTask>(`/security/sample-analyses/${id}`, mock)
export const deleteDiscoveryTask = (id: string) =>
  request.delete(`/security/sample-analyses/${id}`, mock)
export const updateDiscoverySuggestion = (
  id: string,
  suggestion_id: string,
  status: DiscoverySuggestion['status'],
) => request.put<DiscoveryTask>(`/security/sample-analyses/${id}`, { suggestion_id, status }, mock)
export const retryDiscoveryTask = (id: string) =>
  request.put<DiscoveryTask>(`/security/sample-analyses/${id}`, { retry: true }, mock)
export const listDiscoveryRecords = (params: { user: string; model: string; since?: string }) =>
  request.get<OffsetPageResult<DiscoveryRecord> & { excluded: number }>(
    '/security/discovery-records',
    { ...mock, params },
  )
