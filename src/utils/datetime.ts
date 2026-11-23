/**
 * 时间展示工具。
 * 后端所有时间字段均为 UTC（ISO 8601），展示前按已保存的个人时区转换，
 * 统一格式为 `YYYY-MM-DD` 或 `YYYY-MM-DD hh:mm:ss`，禁止直接渲染后端原始字符串。
 */

import { ref } from 'vue'

const preferredTimeZone = ref('')
let formatter: Intl.DateTimeFormat | undefined
let formatterTimeZone = ''

/** 同步服务端已保存的偏好；未登录或无有效偏好时使用浏览器时区。 */
export function setTimeZone(value?: string | null): void {
  const zone = value?.trim() ?? ''
  try {
    if (zone) new Intl.DateTimeFormat('en', { timeZone: zone })
    preferredTimeZone.value = zone
  } catch {
    preferredTimeZone.value = ''
  }
}

function dateParts(date: Date): Record<string, string> {
  const timeZone = getTimeZone()
  if (!formatter || formatterTimeZone !== timeZone) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatterTimeZone = timeZone
  }
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
}

/** 解析 UTC 时间；无时区标识的字面量按 UTC 处理，避免被浏览器当作本地时间 */
function parseUtc(value?: string | null): Date | null {
  const text = value?.trim()
  if (!text) return null

  let normalized = text
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    normalized = `${text}T00:00:00Z`
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
    normalized = `${text.replace(' ', 'T')}Z`
  }

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 日期：时间戳按个人时区转换；纯业务日期不随时区偏移。 */
export function formatDate(value?: string | null): string {
  const date = parseUtc(value)
  if (!date) return ''
  const text = value?.trim() ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parts = dateParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** 日期时间：YYYY-MM-DD HH:mm:ss（个人时区） */
export function formatDateTime(value?: string | null): string {
  const date = parseUtc(value)
  if (!date) return ''
  const parts = dateParts(date)
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

/** 当前显示时区（IANA 名称），语言切换时保留该偏好。 */
export function getTimeZone(): string {
  return (
    preferredTimeZone.value || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  )
}
