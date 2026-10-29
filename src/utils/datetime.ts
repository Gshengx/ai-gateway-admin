/**
 * 时间展示工具。
 * 后端所有时间字段均为 UTC（ISO 8601），展示前必须按浏览器当前时区转换，
 * 统一格式为 `YYYY-MM-DD` 或 `YYYY-MM-DD hh:mm:ss`，禁止直接渲染后端原始字符串。
 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
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

/** 日期：YYYY-MM-DD（本地时区） */
export function formatDate(value?: string | null): string {
  const date = parseUtc(value)
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 日期时间：YYYY-MM-DD hh:mm:ss（本地时区） */
export function formatDateTime(value?: string | null): string {
  const date = parseUtc(value)
  if (!date) return ''
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`
}

/** 当前时区（IANA 名称），用于上报用户偏好 */
export function getTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
}
