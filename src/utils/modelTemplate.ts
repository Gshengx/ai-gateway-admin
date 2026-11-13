export interface TemplateCondition {
  field: string
  operator: 'EQ' | 'IN' | 'PRESENT'
  values: readonly unknown[]
}
export function matchesConditions(
  conditions: readonly TemplateCondition[] | null | undefined,
  values: Record<string, unknown>,
): boolean {
  return (
    !conditions ||
    conditions.every((condition) => {
      const value = values[condition.field]
      if (condition.operator === 'PRESENT')
        return value !== null && value !== undefined && value !== ''
      if (condition.operator === 'EQ')
        return (
          JSON.stringify(value) === JSON.stringify(condition.values[0]) ||
          String(value) === String(condition.values[0])
        )
      return condition.values.some(
        (candidate) =>
          JSON.stringify(candidate) === JSON.stringify(value) ||
          String(candidate) === String(value),
      )
    })
  )
}
