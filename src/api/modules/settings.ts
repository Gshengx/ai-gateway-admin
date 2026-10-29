import { request } from '@/api/request'

export interface PasswordPolicy {
  complexity_categories: number
  failure_threshold: number
  history_count: number
  lock_duration_minutes: number
  max_length: number
  min_length: number
  policy_version: string
  version_updated_at: string
}
export interface PasswordPolicyUpdateResult {
  changed: boolean
  policy: PasswordPolicy
  replayed: boolean
}
export type PasswordPolicyPayload = Omit<
  PasswordPolicy,
  'policy_version' | 'version_updated_at'
> & { reason: string }
export const getPasswordPolicyApi = () =>
  request.get<PasswordPolicy>('/settings/password-policy', { skipLocale: true })
export const updatePasswordPolicyApi = (
  payload: PasswordPolicyPayload,
  proof?: string,
  idempotencyKey?: string,
) =>
  request.put<PasswordPolicyUpdateResult>('/settings/password-policy', payload, {
    headers: {
      ...(proof ? { 'X-Reauth-Proof': proof } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
