/** Go strings.TrimSpace's fixed Unicode White_Space set; FEFF is intentionally retained. */
export function normalizeModelId(value: string): string {
  return value.replace(
    /^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu,
    '',
  )
}

export function validModelId(value: string): boolean {
  const normalized = normalizeModelId(value)
  return normalized.length > 0 && [...normalized].length <= 128 && !normalized.includes('\u0000')
}

export function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)(\.\d+)?$/.test(value)
}

/** Display only; the original Decimal string is kept for editing and requests. */
export function formatDecimal(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value))
  if (!match) return '—'
  const fraction = match[3] ?? ''
  let cents = BigInt(match[2]!) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'))
  if ((fraction[2] ?? '0') >= '5') cents++
  const decimal = String(cents % 100n)
    .padStart(2, '0')
    .replace(/0+$/, '')
  return `${cents ? match[1] : ''}${cents / 100n}${decimal ? '.' + decimal : ''}`
}
