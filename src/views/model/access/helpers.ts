import { i18n } from '@/locales'
import { invocationApis } from '@/utils/modelInvocation'
import type { ModelEditErrorDetail } from '@/api/modules/modelAccessContract'
export function invocationFieldErrorMessage(rule: string, standardRoute = '') {
  if (rule === 'INVALID_PATH') return i18n.global.t('ma.invocationPathInvalid')
  if (rule === 'STANDARD_ROUTE_CONFLICT')
    return i18n.global.t('ma.standardRouteConflict', { route: standardRoute })
  return i18n.global.t('requestErrors.VALIDATION_FAILED')
}
export function invocationErrorsMessage(fields: Record<string, string>, standardRoute = '') {
  return [
    ...new Set(
      Object.entries(fields)
        .filter(([field]) => /^(?:base\.)?invocation_apis\[\d+\]\.path$/.test(field))
        .map(([, rule]) => invocationFieldErrorMessage(rule, standardRoute)),
    ),
  ].join('；')
}
/** M05 diagnostics take precedence over the legacy first-error field map. */
export function modelEditDiagnostics(params?: Record<string, unknown>): ModelEditErrorDetail[] {
  const errors: ModelEditErrorDetail[] = []
  const invocationField = /^(?:base\.)?invocation_apis(?:$|\[)/
  if (Array.isArray(params?.errors)) {
    for (const value of params.errors) {
      if (
        value &&
        typeof value === 'object' &&
        typeof value.field === 'string' &&
        invocationField.test(value.field) &&
        typeof value.reason_code === 'string' &&
        typeof value.reason === 'string'
      )
        errors.push(value as ModelEditErrorDetail)
    }
  }
  if (params?.fields && typeof params.fields === 'object' && !Array.isArray(params.fields)) {
    for (const [field, rule] of Object.entries(params.fields)) {
      if (
        invocationField.test(field) &&
        typeof rule === 'string' &&
        !errors.some((error) => error.field === field)
      )
        errors.push({
          field,
          reason_code: rule,
          reason: '',
          standard_route: params.standard_route as ModelEditErrorDetail['standard_route'],
        })
    }
  }
  return errors
}

export function modelEditDiagnosticMessage(error: ModelEditErrorDetail) {
  const key = `ma.invocationError_${error.reason_code}`
  const route = error.standard_route
  const message =
    error.reason_code === 'STANDARD_ROUTE_CONFLICT' && route
      ? i18n.global.t('ma.standardRouteConflict', { route: `${route.method} ${route.path}` })
      : i18n.global.te(key)
        ? i18n.global.t(key)
        : error.reason || invocationFieldErrorMessage(error.reason_code)
  const supported = error.supported_protocols?.filter((protocol) =>
    invocationApis.includes(protocol),
  )
  return supported?.length
    ? `${message} ${i18n.global.t('ma.invocationSupportedProtocols', {
        protocols: supported.map(invocationLabel).join(', '),
      })}`
    : message
}

export function modelEditErrorsMessage(errors: ModelEditErrorDetail[]) {
  return errors.map(modelEditDiagnosticMessage).join('；')
}
export const authFieldLabel = (field: { key: string; label: string }) =>
  field.label ||
  (i18n.global.te('ma.auth_' + field.key) ? i18n.global.t('ma.auth_' + field.key) : field.key)
export const invocationLabel = (s: string) =>
  ({
    CHAT_COMPLETIONS: 'Chat Completions',
    RESPONSES: 'Responses',
    MESSAGES: 'Messages',
    GENERATE_CONTENT: 'Generate Content',
    CONVERSE: 'Converse',
    EMBEDDINGS: 'Embeddings',
    IMAGE_GENERATIONS: 'Image Generations',
    AUDIO: 'Audio',
    VIDEO: 'Video',
    CUSTOM_PASSTHROUGH: i18n.global.t('ma.customProtocol'),
    TEMPLATE_NATIVE: i18n.global.locale.value.startsWith('zh')
      ? '模板专用接口'
      : 'Template native API',
  })[s] ?? s
export const unitLabel = (s: string) =>
  s === 'PER_MILLION_TOKENS'
    ? 'perMillion'
    : s === 'PER_SECOND'
      ? 'perSecond'
      : s === 'PER_FRAME'
        ? 'perFrame'
        : 'perCount'
export function metricLabel(s: string) {
  if (!i18n.global.locale.value.startsWith('zh')) return s.replace(/_/g, ' ')
  const parts: Record<string, string> = {
    input: '输入',
    output: '输出',
    cached: '缓存',
    cache: '缓存',
    write: '写入',
    reasoning: '推理',
    image: '图像',
    audio: '音频',
    video: '视频',
    tokens: 'Token',
    count: '次数',
    seconds: '秒数',
    frame: '帧',
    tool: '工具',
    call: '调用',
    search: '搜索',
    request: '请求',
  }
  return s
    .split('_')
    .map((x) => parts[x] ?? x)
    .join(' ')
}
export function tagLabel(tag: string) {
  return i18n.global.te(`ma.${tag}`) ? i18n.global.t(`ma.${tag}`) : tag
}
export const statusTheme = (
  status: string,
): 'success' | 'warning' | 'danger' | 'primary' | 'default' =>
  ['ACTIVE', 'HEALTHY', 'PASSED'].includes(status)
    ? 'success'
    : ['FAILED', 'ERROR', 'UNHEALTHY'].includes(status)
      ? 'danger'
      : ['PENDING_REVIEW', 'SUSPENDED'].includes(status)
        ? 'warning'
        : ['TESTING', 'CHECKING', 'RUNNING'].includes(status)
          ? 'primary'
          : 'default'
