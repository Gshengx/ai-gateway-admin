// Billing periods are calendar dates, independent of personal display time zones.
export function getBillWeek(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  const year = date.getUTCFullYear(),
    month = date.getUTCMonth() + 1
  const first = new Date(date)
  first.setUTCDate(1)
  const week = Math.floor((date.getUTCDate() - 1 + ((first.getUTCDay() + 6) % 7)) / 7) + 1
  const start = new Date(date)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return {
    year,
    month,
    week,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}
