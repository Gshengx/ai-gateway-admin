import { i18n } from '@/locales'
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
