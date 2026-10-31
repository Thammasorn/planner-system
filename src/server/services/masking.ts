// src/server/services/masking.ts — the only place that turns hidden projects into masked aggregates (SPEC §3.3,
// PLAN.md §3.4.4, X30). Pure: no DB import. M2 = skeleton; M5 adds leave labels (th.masking.leave), M9 completes it.
// Services import this module directly (not through the services barrel).
import { th } from '@/i18n/th'

/** Result of authz.visibleProjectIds / visibleUserIds. */
export type Visible = 'ALL' | ReadonlySet<string>

export const isVisible = (visible: Visible, id: string): boolean => visible === 'ALL' || visible.has(id)

/** Split rows by project visibility (order kept). Hidden rows must never be returned to a client as-is. */
export function partitionByProject<T extends { projectId: string }>(
  rows: readonly T[],
  visible: Visible,
): { visible: T[]; hidden: T[] } {
  const out: { visible: T[]; hidden: T[] } = { visible: [], hidden: [] }
  for (const r of rows) (isVisible(visible, r.projectId) ? out.visible : out.hidden).push(r)
  return out
}

/** One aggregate for everything hidden: no ids, no names, no counts — only the Thai label and the combined value. */
export interface MaskedAggregate<V> {
  kind: 'masked'
  label: string
  value: V
}

/** `masked` is null when nothing is hidden; its label is th.masking.otherProjects ("งานในโปรเจคอื่น"). */
export function maskHidden<T extends { projectId: string }, V>(
  rows: readonly T[],
  visible: Visible,
  combine: (hidden: readonly T[]) => V,
): { visible: T[]; masked: MaskedAggregate<V> | null } {
  const parts = partitionByProject(rows, visible)
  if (parts.hidden.length === 0) return { visible: parts.visible, masked: null }
  return {
    visible: parts.visible,
    masked: { kind: 'masked', label: th.masking.otherProjects, value: combine(parts.hidden) },
  }
}
