import { request } from '@/api/request'

export interface TermsTranslation {
  locale_code: string
  title: string
  body: string
}
export interface TermsTranslationDetail extends TermsTranslation {
  content_digest: string
}
export interface TermsConfig {
  terms_id: string
  version: string
  version_updated_at: string
  config_updated_at: string
  bundle_digest: string
  login_popup_enabled: boolean
  mandatory_confirmation: boolean
  translations: TermsTranslationDetail[]
}
export interface TermsMutationResult {
  applied: boolean
  changed: boolean
  replayed: boolean
  terms_id: string
}
export interface TermsStatus {
  terms_id: string
  version: string
  version_updated_at: string
  config_updated_at: string
  title: string
  body: string
  requested_locale: string
  resolved_locale: string
  content_digest: string
  mandatory_confirmation: boolean
  login_popup_enabled: boolean
  accepted: boolean
}
export interface AcceptTermsResult {
  id: string
  user_id: string
  terms_id: string
  locale_code: string
  content_digest: string
  evidence_digest: string
  accepted_at: string
  username_snapshot: string
  display_name_snapshot: string
  department_snapshot: {
    snapshot_version: number
    department_id: string | null
    name: string
    ancestor_ids: string[]
    path: Array<{ id: string; name: string }>
  }
}
export const getTermsConfigApi = () =>
  request.get<TermsConfig>('/terms/config', { skipLocale: true })
export const updateTermsConfigApi = (
  payload: { login_popup_enabled?: boolean; mandatory_confirmation?: boolean },

  idempotencyKey?: string,
) =>
  request.patch<TermsMutationResult>('/terms/config', payload, {
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
export const previewTermsApi = (payload: { translations: TermsTranslation[] }) =>
  request.post<{ translations: TermsTranslationDetail[] }>('/terms/preview', payload)
export const publishTermsVersionApi = (
  payload: { translations: TermsTranslation[] },

  idempotencyKey?: string,
) =>
  request.post<TermsMutationResult>('/terms/versions', payload, {
    headers: {
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  })
// Login guidance reads the terms bound to the current session.
export const getRequiredTermsApi = () => request.get<TermsStatus>('/terms/required')
// In-app reading uses the globally current terms.
export const getTermsStatusApi = () => request.get<TermsStatus>('/terms/current')
export const acceptTermsApi = (payload: {
  terms_id: string
  locale_code: string
  content_digest: string
}) => request.post<AcceptTermsResult>('/terms/accept', payload)
