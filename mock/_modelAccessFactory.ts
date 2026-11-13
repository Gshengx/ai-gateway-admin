import { schemas } from './_modelAccessSchema'

type Field = {
  key: string
  type: string
  required: boolean
  nullable: boolean
  enum: readonly (string | number)[] | null
}
const dictionary: Record<string, readonly Field[]> = schemas
/** Emit exactly the documented read projection, including nested snapshot projections. */
export function project(name: string, input: unknown): unknown {
  if (input === null || input === undefined || typeof input !== 'object') return input
  const rows = dictionary[name] ?? []
  if (!rows.length) return input
  function fields(prefix: string, value: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const row of rows) {
      if (!row.key.startsWith(prefix)) continue
      const key = row.key.slice(prefix.length)
      if (key.includes('.') || key.includes('[]') || !(key in value)) continue
      const raw = value[key],
        type = row.type.replace(' / null', '')
      if (raw === null) {
        result[key] = raw
        continue
      }
      const childPrefix = `${prefix}${key}${type.startsWith('array') ? '[].' : '.'}`
      const childRows = rows.some((r) => r.key.startsWith(childPrefix))
      if (type.startsWith('array<') && Array.isArray(raw)) {
        const childType = type.slice(6, -1)
        result[key] = raw.map((item) =>
          childRows
            ? fields(childPrefix, item as Record<string, unknown>)
            : project(childType, item),
        )
      } else
        result[key] =
          childRows && raw && typeof raw === 'object'
            ? fields(childPrefix, raw as Record<string, unknown>)
            : project(type, raw)
    }
    return result
  }
  return fields('', input as Record<string, unknown>)
}
export function mockObject<T>(name: string, values: Partial<T> = {}): T {
  const rows = dictionary[name] ?? []
  function defaults(prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const field of rows) {
      if (!field.key.startsWith(prefix)) continue
      const key = field.key.slice(prefix.length)
      if (key.includes('.') || key.includes('[]') || !field.required) continue
      const type = field.type.replace(' / null', '')
      result[key] = field.nullable
        ? null
        : (field.enum?.[0] ??
          (type.startsWith('array')
            ? []
            : type === 'boolean'
              ? false
              : type === 'integer'
                ? 0
                : type === 'string' || type === 'Decimal'
                  ? ''
                  : dictionary[type]?.length
                    ? mockObject(type)
                    : defaults(`${prefix}${key}.`)))
    }
    return result
  }
  return { ...defaults(), ...values } as T
}

/** Reject response-only keys at the mock HTTP boundary, just like the new API. */
export function validBody(name: string, body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const fields = (dictionary[name] ?? []).filter(
    (field) => !field.key.includes('.') && !field.key.includes('[]'),
  )
  if (!fields.length) return true
  const value = body as Record<string, unknown>
  if (Object.keys(value).some((key) => !fields.some((field) => field.key === key))) return false
  return fields.every((field) => {
    const item = value[field.key]
    if (item === undefined) return !field.required
    if (item === null) return field.nullable
    const type = field.type.replace(' / null', '')
    if (type === 'null') return false
    if (field.enum && !field.enum.includes(item as string)) return false
    if (type.startsWith('array<')) {
      if (!Array.isArray(item)) return false
      const child = type.slice(6, -1)
      return item.every((entry) =>
        dictionary[child]?.length
          ? validBody(child, entry)
          : child === 'string'
            ? typeof entry === 'string'
            : true,
      )
    }
    if (type === 'string') return typeof item === 'string'
    if (type === 'Decimal') return typeof item === 'string' && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(item)
    if (type === 'integer') return Number.isInteger(item)
    if (type === 'boolean') return typeof item === 'boolean'
    return dictionary[type]?.length ? validBody(type, item) : typeof item === 'object'
  })
}
