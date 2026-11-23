/** Reveal only known ancestor paths; search results never become a complete browse branch. */
export async function revealDepartmentSelection(
  ids: string[],
  parentOf: (id: string) => string | null | undefined,
  loadChildren: (id: string) => Promise<void>,
  isCurrent: () => boolean,
): Promise<string[]> {
  const expanded = new Set<string>()
  for (const id of ids.filter(Boolean)) {
    const path: string[] = []
    const visited = new Set([id])
    let parent = parentOf(id)
    while (parent && !visited.has(parent)) {
      visited.add(parent)
      path.unshift(parent)
      parent = parentOf(parent)
    }
    for (const ancestor of path) {
      if (!isCurrent()) return []
      if (!expanded.has(ancestor)) await loadChildren(ancestor)
      if (!isCurrent()) return []
      expanded.add(ancestor)
    }
  }
  return [...expanded]
}
