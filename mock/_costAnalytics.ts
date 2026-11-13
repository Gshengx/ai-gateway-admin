import type { ExpenseRecord } from '../src/api/modules/expenses'
import { summarize } from './_costRecords'
export function costAnalytics(rows: ExpenseRecord[]) {
  const groups = (key: 'created_at' | 'model_id' | 'user_id' | 'project_id') => {
    const values = new Map<string, ExpenseRecord[]>()
    for (const row of rows) {
      const value = key === 'created_at' ? row.created_at.slice(0, 10) : row[key]
      if (value) values.set(value, [...(values.get(value) ?? []), row])
    }
    return [...values.entries()].map(([id, items]) => {
      const s = summarize(items)
      return {
        id,
        name:
          key === 'user_id'
            ? items[0]!.user_name
            : key === 'project_id'
              ? items[0]!.project_name!
              : key === 'model_id'
                ? items[0]!.model_name
                : id,
        cost: s.cost,
        requests: s.requests,
        tokens: s.tokens,
      }
    })
  }
  return {
    trend: groups('created_at')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => ({ date: r.id, cost: r.cost })),
    models: groups('model_id')
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
    users: groups('user_id')
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
    projects: groups('project_id')
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
    direct_cost: summarize(rows.filter((r) => !r.project_id)).cost,
    project_cost: summarize(rows.filter((r) => r.project_id)).cost,
  }
}
