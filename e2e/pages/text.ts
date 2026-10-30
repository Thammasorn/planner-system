/** Matches an accessible name exactly, tolerating MUI's required-field asterisk (` *`). */
export function exactName(text: string): RegExp {
  return new RegExp(`^${escapeRegExp(text)}(?:\\s*\\*)?$`)
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
