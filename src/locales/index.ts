import { createI18n } from 'vue-i18n'

import {
  getStoredApiLocale,
  getStoredLocale,
  setStoredApiLocale,
  setStoredLocale,
} from '@/utils/auth'
import enUS from './en-US'
import zhCN from './zh-CN'

/** 支持的语言列表（label 为各自语言的原生名称，无需翻译） */
export const SUPPORTED_LOCALES = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]['value']

const DEFAULT_LOCALE: AppLocale = 'zh-CN'

/**
 * 后端语言代码 → 前端语言包代码。
 * 后端注册的英文代码为 en（实测 /locales/options 返回），前端语言包键为 en-US；
 * 这里统一归一化，避免 setLocale('en') 找不到语言包而回退中文。
 */
const LOCALE_ALIASES: Record<string, AppLocale> = {
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  en: 'en-US',
  'en-us': 'en-US',
}

/** 归一化语言代码：兼容后端简写、下划线写法与大小写差异 */
export function normalizeLocale(code?: string | null): AppLocale {
  const key = (code ?? '').trim().toLowerCase().replace(/_/g, '-')
  return LOCALE_ALIASES[key] ?? DEFAULT_LOCALE
}

function resolveInitialLocale(): AppLocale {
  const stored = getStoredLocale()
  return stored ? normalizeLocale(stored) : DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

/** 切换语言并持久化 */
export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  setStoredLocale(locale)
}

/** 当前语言：请求层据此注入 Accept-Language 与 locale 查询参数 */
export function getCurrentLocale(): AppLocale {
  return i18n.global.locale.value as AppLocale
}

/** 请求层使用的后端语言代码：优先使用后端注册的原始代码（如 en），未记录时退回当前语言 */
export function getApiLocale(): string {
  return getStoredApiLocale() || getCurrentLocale()
}

/** 记录后端注册的原始语言代码，供请求层注入 locale 与 Accept-Language */
export function setApiLocale(code: string): void {
  setStoredApiLocale(code)
}

/** 路由标题翻译：meta.title 存的是 i18n key，缺失时原样返回（便于渐进迁移） */
export function translateRouteTitle(key?: string): string {
  if (!key) return ''
  const { t, te } = i18n.global
  return te(key) ? t(key) : key
}

/** 更新浏览器标签页标题 */
export function setDocumentTitle(title?: string): void {
  const { t, te } = i18n.global
  const appTitle = te('app.title') ? t('app.title') : import.meta.env.VITE_APP_TITLE
  document.title = title ? `${title} · ${appTitle}` : appTitle
}
