/** Display both user identities wherever the API exposes them. */
export function userLabel(name?: string | null, username?: string | null): string {
  return name && username ? `${name} (${username})` : name || username || '—'
}
