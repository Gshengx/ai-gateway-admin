import './identity'
import { directory, existingState } from './_runtime'
export function expenseDirectory() {
  const source =
    existingState<{ id: string; parent_id: string | null; name: string }[]>('departments') ?? []
  const path = (id: string): string => {
    const node = source.find((d) => d.id === id)
    return node ? (node.parent_id ? `${path(node.parent_id)} / ` : '') + node.name : ''
  }
  return {
    departments: source.map((d) => ({ ...d, path: path(d.id) })),
    users: [...directory.values()].map((u) => ({
      id: u.id,
      username: u.username,
      name: u.display_name,
      department_id: u.department_id,
    })),
  }
}
export function expenseSubtree(id: string): string[] {
  return [
    id,
    ...expenseDirectory()
      .departments.filter((d) => d.parent_id === id)
      .flatMap((d) => expenseSubtree(d.id)),
  ]
}
export const expenseToday = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
