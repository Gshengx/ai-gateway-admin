import request from '@/api/request'

export interface ModelImpact {
  active_job_count: string
  blocking_codes: string[]
  configuration_version: string
  grant_count: string
  mount_count: string
  remote_obligation_count: string
  target_id: string
}

export function getModelImpactApi(resource: 'providers' | 'models' | 'logical-models', id: string) {
  return request.get<ModelImpact>(`/${resource}/${encodeURIComponent(id)}/impact`, {
    skipLocale: true,
  })
}
