// src/server/services/masking.ts — the only place that turns hidden projects into masked aggregates (SPEC §3.3,
// PLAN.md §3.4.4, X30). Pure: no DB import. M2 = skeleton; M5 adds leave labels (maskTimeOff, th.masking.leave), M9 completes it.
// Services import this module directly (not through the services barrel).
import type { HalfDay, ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { CalendarTimeOff } from '@/lib/contracts/calendar'

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

/** A live leave entry joined with its type (M5 calendar loader; M6 grid `people[u].timeOff`). */
export interface TimeOffWithType {
  id: string
  userId: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
  note: string | null
  leaveTypeId: string
  leaveTypeName: string
  leaveTypeColor: string
  leaveTypeArchived: boolean
}

/**
 * §3.3 leave masking (MASK-5, M5-D7). `canSeeDetails` = authz.canSeeLeaveDetails(viewer, row.userId). Hidden entries
 * keep only who / when / half and the label th.masking.leave — no entry id, type id/name, colour or note. Built as an
 * explicit object literal (never a spread of `row`), so a new column can never leak by accident.
 */
export function maskTimeOff(row: TimeOffWithType, canSeeDetails: boolean): CalendarTimeOff {
  if (canSeeDetails) {
    return {
      kind: 'full',
      id: row.id,
      userId: row.userId,
      startDate: row.startDate,
      endDate: row.endDate,
      half: row.half,
      leaveTypeId: row.leaveTypeId,
      leaveTypeName: row.leaveTypeName,
      leaveTypeColor: row.leaveTypeColor,
      leaveTypeArchived: row.leaveTypeArchived,
      note: row.note,
    }
  }
  return {
    kind: 'masked',
    userId: row.userId,
    startDate: row.startDate,
    endDate: row.endDate,
    half: row.half,
    label: th.masking.leave,
  }
}
