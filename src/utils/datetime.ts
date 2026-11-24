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

/** 将个人时区的筛选时间转换为 UTC 时刻；无效或夏令时跳变中无法唯一确定的时间返回 null。 */
export function parseDateTimeInTimeZone(value: string): Date | null {
  const text = value.trim().replace('T', ' ')
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return null
  const wallTime = new Date(`${text.replace(' ', 'T')}Z`)
  if (
    Number.isNaN(wallTime.getTime()) ||
    wallTime.toISOString().slice(0, 19).replace('T', ' ') !== text
  )
    return null

  // 取相邻日期的实际偏移，兼容半小时/四十五分钟时区和夏令时，不能按浏览器偏移或固定 UTC+8 换算。
  const offsets = new Set<number>()
  for (const hours of [-36, 0, 36]) {
    const probe = new Date(wallTime.getTime() + hours * 60 * 60 * 1000)
    const parts = dateParts(probe)
    const local = new Date(0)
    local.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
    local.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0)
    offsets.add(local.getTime() - probe.getTime())
  }
  const matches = [...offsets]
    .map((offset) => new Date(wallTime.getTime() - offset))
    .filter((date) => formatDateTime(date.toISOString()) === text)
  return matches.length === 1 ? matches[0]! : null
}

/** 日期边界取个人时区该日首个存在的时刻，兼容午夜跳时或重复的情况。 */
function startOfDayInTimeZone(value: string): Date | null {
  const calendar = parseUtc(value)
  if (!calendar || calendar.toISOString().slice(0, 10) !== value) return null
  let low = calendar.getTime() / 1000 - 36 * 60 * 60
  let high = calendar.getTime() / 1000 + 36 * 60 * 60
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const parts = dateParts(new Date(middle * 1000))
    const date = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`
    if (date < value) low = middle + 1
    else high = middle
  }
  return new Date(low * 1000)
}

/** 包含首尾日期的个人时区自然日范围，转换为 UTC 的 [开始日边界, 结束日次日边界)。 */
export function getDateRangeInTimeZone(
  start: string,
  end: string,
): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end)
    return null
  const from = startOfDayInTimeZone(start)
  const endDay = new Date(`${end}T00:00:00Z`)
  if (!from || Number.isNaN(endDay.getTime()) || endDay.toISOString().slice(0, 10) !== end)
    return null
  // 这里只递增业务日历日期，再按个人时区解析边界，不能给 UTC 开始时刻直接加 24 小时。
  endDay.setUTCDate(endDay.getUTCDate() + 1)
  const to = startOfDayInTimeZone(endDay.toISOString().slice(0, 10))
  return to && from < to ? { from: from.toISOString(), to: to.toISOString() } : null
}

/** 当前显示时区（IANA 名称），语言切换时保留该偏好。 */
export function getTimeZone(): string {
  return (
    preferredTimeZone.value || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  )
}
