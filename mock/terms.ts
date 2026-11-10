import { runtimeState, directory } from './_runtime'
import type { AcceptTermsResult } from '../src/api/modules/terms'
import type { UserTermsInfo } from '../src/api/modules/identity'
import {
  checkToken,
  checkCsrf,
  mockPasswordRequired,
  mockId,
  authMock,
  fail,
  success,
  unauthorized,
  usernameFromToken,
  type MockMethod,
  type MockRequest,
} from './_utils'
import { createHash } from 'node:crypto'
import type {
  TermsConfig,
  TermsTranslation,
  TermsTranslationDetail,
} from '../src/api/modules/terms'

interface AcceptanceRecord {
  user_id: string
  username: string
  display_name: string
  accepted_at: string
  version: string
  ip: string
}
interface TermsState {
  config: TermsConfig
  records: AcceptanceRecord[]
}
const acceptanceEvidence = runtimeState(
  'acceptanceEvidence',
  () => new Map<string, AcceptTermsResult>(),
)
export function termsAcceptances() {
  return [...acceptanceEvidence.values()]
}
export function hasAcceptedTerms(username: string) {
  return (
    !state.config.mandatory_confirmation ||
    state.records.some((r) => r.username === username && r.version === state.config.version)
  )
}
export function userTermsInfo(username: string): UserTermsInfo {
  const records = state.records
    .filter((record) => record.username === username)
    .sort((a, b) => Date.parse(b.accepted_at) - Date.parse(a.accepted_at))
  const acceptance = (record: AcceptanceRecord | undefined) =>
    record
      ? {
          id: mockId(`acceptance-${record.username}-${record.version}`),
          terms_id: mockId(`terms-${record.version}`),
          terms_version: record.version,
          accepted_at: record.accepted_at,
          client_ip: record.ip,
        }
      : null
  const current = records.find((record) => record.version === state.config.version)
  return {
    visibility: 'VISIBLE',
    current_terms: {
      id: state.config.terms_id,
      version: state.config.version,
      mandatory_confirmation: state.config.mandatory_confirmation,
    },
    status: current ? 'ACCEPTED' : 'NOT_ACCEPTED',
    current_acceptance: acceptance(current),
    last_acceptance: acceptance(records[0]),
  }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const detail = (item: TermsTranslation): TermsTranslationDetail => ({
  ...item,
  content_digest: digest(item.body),
})
const initialTranslations = [
  {
    locale_code: 'zh-CN',
    title: '企业 AI 使用须知',
    body: '一、AI 使用行为规范\n员工使用 AI 服务时应遵守公司信息安全管理制度。\n\n二、数据安全责任\n不得向 AI 服务发送未经授权的敏感信息。\n\n三、行为监控与审计\nAI 服务请求、响应和安全事件将按企业安全要求记录并接受审计。',
  },
  {
    locale_code: 'en',
    title: 'Enterprise AI Usage Notice',
    body: '1. Acceptable Use\nEmployees must follow the company information security policies when using AI services.\n\n2. Data Security Responsibilities\nDo not submit sensitive information without authorization.\n\n3. Monitoring and Audit\nAI requests, responses, and security events may be recorded and audited under company security requirements.',
  },
].map(detail)
const shared = globalThis as typeof globalThis & { __aisMockTerms?: TermsState }
const state = (shared.__aisMockTerms ??= {
  config: {
    terms_id: mockId('terms-1.0'),
    version: '1.0',
    version_updated_at: '2026-09-01T00:00:00.000Z',
    config_updated_at: '2026-09-01T00:00:00.000Z',
    bundle_digest: digest(JSON.stringify(initialTranslations)),
    login_popup_enabled: true,
    mandatory_confirmation: true,
    translations: initialTranslations,
  },
  records: [
    {
      user_id: 'user-ops-01',
      username: 'ops_admin',
      display_name: '运维管理员',
      accepted_at: '2026-09-02T10:12:00+08:00',
      version: '1.0',
      ip: '10.21.17.42',
    },
    {
      user_id: 'user-audit-01',
      username: 'auditor',
      display_name: '审计员',
      accepted_at: '2026-09-03T14:35:00+08:00',
      version: '1.0',
      ip: '10.21.17.57',
    },
  ],
})
const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const acceptedRecord = (req: MockRequest) =>
  state.records.find(
    (record) =>
      record.username === usernameFromToken(req) && record.version === state.config.version,
  )
export function isTermsConfirmed(req: MockRequest): boolean {
  return !state.config.mandatory_confirmation || !!acceptedRecord(req)
}
export function currentTerms(req: MockRequest) {
  const header = req.headers?.['accept-language'] ?? req.headers?.['Accept-Language']
  const language = Array.isArray(header) ? header[0] : header
  const locale = firstOf(req.query?.locale) ?? (typeof language === 'string' ? language : 'zh-CN')
  const resolved = locale.startsWith('en') ? 'en' : 'zh-CN'
  const translation = state.config.translations.find((item) => item.locale_code === resolved)!
  return {
    terms_id: state.config.terms_id,
    version: state.config.version,
    version_updated_at: state.config.version_updated_at,
    config_updated_at: state.config.config_updated_at,
    title: translation.title,
    body: translation.body,
    requested_locale: locale,
    resolved_locale: resolved,
    content_digest: translation.content_digest,
    mandatory_confirmation: state.config.mandatory_confirmation,
    login_popup_enabled: state.config.login_popup_enabled,
    accepted: !!acceptedRecord(req),
  }
}
function validTranslations(value: unknown): value is TermsTranslation[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false
      return ['locale_code', 'title', 'body'].every(
        (key) => typeof Reflect.get(item, key) === 'string' && !!Reflect.get(item, key).trim(),
      )
    })
  )
}
function mutationGuard(req: MockRequest) {
  if (!checkToken(req)) return unauthorized()
  if (!checkCsrf(req)) return fail('CSRF_INVALID', '')
}
function result(changed: boolean) {
  return success({ applied: true, changed, replayed: false, terms_id: state.config.terms_id })
}
export default authMock([
  {
    url: '/api/v1/terms/config',
    method: 'get',
    response: (req: MockRequest) => (checkToken(req) ? success(state.config) : unauthorized()),
  },
  {
    url: '/api/v1/terms/config',
    method: 'patch',
    response: (req: MockRequest) => {
      const error = mutationGuard(req)
      if (error) return error
      const body = req.body ?? {}
      const keys = ['login_popup_enabled', 'mandatory_confirmation'] as const
      if (
        !keys.some((key) => key in body) ||
        keys.some((key) => key in body && typeof body[key] !== 'boolean')
      )
        return fail('MALFORMED_REQUEST', '')
      let changed = false
      for (const key of keys) {
        const value = body[key]
        if (typeof value === 'boolean' && value !== state.config[key]) {
          state.config[key] = value
          changed = true
        }
      }
      if (changed) state.config.config_updated_at = new Date().toISOString()
      return result(changed)
    },
  },
  {
    url: '/api/v1/terms/preview',
    method: 'post',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      if (Object.keys(req.headers ?? {}).some((key) => key.toLowerCase() === 'idempotency-key'))
        return fail('MALFORMED_REQUEST', '')
      const translations = req.body?.translations
      if (
        !validTranslations(translations) ||
        !translations.some((item) => item.locale_code.startsWith('zh')) ||
        !translations.some((item) => item.locale_code.startsWith('en')) ||
        translations.some((item) => !['zh-CN', 'en'].includes(item.locale_code))
      )
        return fail('VALIDATION_FAILED', '')
      return success({ translations: translations.map(detail) })
    },
  },
  {
    url: '/api/v1/terms/versions',
    method: 'post',
    response: (req: MockRequest) => {
      const error = mutationGuard(req)
      if (error) return error
      if (!validTranslations(req.body?.translations)) return fail('MALFORMED_REQUEST', '')
      const translations = req.body.translations.map(detail)
      const bundle = digest(JSON.stringify(translations))
      const changed = bundle !== state.config.bundle_digest
      if (changed) {
        state.config.version_updated_at = new Date().toISOString()
        state.config.version = `1.${Number(state.config.version.split('.')[1]) + 1}`
        state.config.terms_id = mockId(`terms-${state.config.version}`)
        state.config.bundle_digest = bundle
        state.config.translations = translations
      }
      return result(changed)
    },
  },
  {
    url: '/api/v1/terms/required',
    method: 'get',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      return success(currentTerms(req))
    },
  },
  {
    url: '/api/v1/terms/current',
    method: 'get',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      return success(currentTerms(req))
    },
  },
  {
    url: '/api/v1/terms/accept',
    method: 'post',
    response: (req: MockRequest) => {
      if (!checkToken(req)) return unauthorized()
      if (!checkCsrf(req)) return fail('CSRF_INVALID', '')
      if (mockPasswordRequired(req)) return fail('PASSWORD_CHANGE_REQUIRED', '')
      const displayed = currentTerms({
        ...req,
        query: { locale: String(req.body?.locale_code ?? '') },
      })
      if (
        req.body?.terms_id !== displayed.terms_id ||
        req.body?.locale_code !== displayed.resolved_locale ||
        req.body?.content_digest !== displayed.content_digest
      )
        return fail('TERMS_VERSION_CHANGED', '', { refresh_required: true })
      let record = acceptedRecord(req)
      if (!record) {
        const username = usernameFromToken(req) ?? ''
        const header = req.headers?.['x-forwarded-for'] ?? req.headers?.['X-Forwarded-For']
        const forwarded = Array.isArray(header) ? header[0] : header
        record = {
          user_id: directory.get(username)?.id ?? mockId(username),
          username,
          display_name: directory.get(username)?.display_name ?? username,
          accepted_at: new Date().toISOString(),
          version: state.config.version,
          ip:
            typeof forwarded === 'string'
              ? forwarded.split(',')[0].trim() || '127.0.0.1'
              : '127.0.0.1',
        }
        state.records.unshift(record)
      }
      const evidence: AcceptTermsResult = {
        id: mockId(`acceptance-${record.username}-${record.version}`),
        user_id: record.user_id,
        terms_id: displayed.terms_id,
        locale_code: displayed.resolved_locale,
        content_digest: displayed.content_digest,
        evidence_digest: createHash('sha256').update(JSON.stringify(record)).digest('hex'),
        accepted_at: record.accepted_at,
        username_snapshot: record.username,
        display_name_snapshot: record.display_name,
        department_snapshot: {
          snapshot_version: 1,
          department_id: directory.get(record.username)?.department_id ?? null,
          name: '',
          ancestor_ids: [],
          path: [],
        },
      }
      acceptanceEvidence.set(evidence.id, evidence)
      return success(evidence)
    },
  },
] as MockMethod[])
