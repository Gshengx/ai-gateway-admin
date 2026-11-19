/** Explicit user-name displays may include the username for identification. */
export function userLabel(name?: string | null, username?: string | null): string {
  return name && username ? `${name} (${username})` : name || username || '—'
}

/** Role labels (creator, operator, recipient, etc.) show the display name only. */
export function userDisplayName(name?: string | null, username?: string | null): string {
  return name || username || '—'
}
