// src/server/services/masking.ts — the only place that turns hidden projects into masked aggregates (SPEC §3.3,
// PLAN.md §3.4.4, X30). Pure: no DB import. M2 = skeleton; M5 adds leave labels (maskTimeOff, th.masking.leave), M9 completes it.
// Services import this module directly (not through the services barrel).
import type { HalfDay, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import { th } from '@/i18n/th'
import { compareThai } from '@/lib/collate'
import type { CalendarTimeOff } from '@/lib/contracts/calendar'
import type { GridMaskedRow } from '@/lib/contracts/grid'
import type { WorkloadCellItem, WorkloadProjectPart } from '@/lib/contracts/workload'

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

// ── M9 completion (X30, plan/m09 S2.1/S2.11) ──
// Consumers of the three helpers below (the ONLY places that build masked load shapes — grep th.masking.otherProjects):
//   · services/workload.ts — assembleCells (table cells, badge, /people this week, personCells), cellDetail (side panel),
//     overloadImpact (FR-906 lines via namedProjectParts)
//   · services/grid.ts — buildPersonChunk (the person grid's one masked row)
// Leave labels stay maskTimeOff (M5).

const isZero = (v: LoadPair): boolean => v.total === 0 && v.committed === 0

/** M9-D8: visible parts with load (sorted by compareThai(name), then id) + at most one `{ projectId: null }` part =
 *  Σ every hidden project (no id, no name, no count). `'ALL'` → never a null part. */
export function maskProjectParts(
  parts: ReadonlyMap<string, LoadPair>,
  visible: Visible,
  names: ReadonlyMap<string, string>,
): WorkloadProjectPart[] {
  const shown: (WorkloadProjectPart & { projectId: string })[] = []
  const hidden = { total: 0, committed: 0 }
  for (const [projectId, v] of parts) {
    if (isZero(v)) continue
    if (isVisible(visible, projectId)) shown.push({ projectId, total: v.total, committed: v.committed })
    else {
      hidden.total += v.total
      hidden.committed += v.committed
    }
  }
  shown.sort(
    (a, b) =>
      compareThai(names.get(a.projectId) ?? '', names.get(b.projectId) ?? '') ||
      (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0),
  )
  const out: WorkloadProjectPart[] = shown
  if (!isZero(hidden)) out.push({ projectId: null, ...hidden })
  return out
}

/** FR-906 lines (M9-D18): maskProjectParts with display names — hidden part named th.masking.otherProjects. */
export function namedProjectParts(
  parts: ReadonlyMap<string, LoadPair>,
  visible: Visible,
  names: ReadonlyMap<string, string>,
): { projectId: string | null; name: string; load: LoadPair }[] {
  return maskProjectParts(parts, visible, names).map((p) => ({
    projectId: p.projectId,
    name: p.projectId === null ? th.masking.otherProjects : (names.get(p.projectId) ?? ''),
    load: { total: p.total, committed: p.committed },
  }))
}

/** SPEC §7.4 masked row (label th.masking.otherProjects); keys with 0/0 dropped; null when every period is 0. */
export function maskedGridRow(userId: string, totals: Partial<Record<PeriodKey, LoadPair>>): GridMaskedRow | null {
  const kept: Partial<Record<PeriodKey, LoadPair>> = {}
  for (const [key, v] of Object.entries(totals) as [PeriodKey, LoadPair | undefined][]) {
    if (v && !isZero(v)) kept[key] = { total: v.total, committed: v.committed }
  }
  if (Object.keys(kept).length === 0) return null
  return { kind: 'masked', userId, label: th.masking.otherProjects, totals: kept }
}

/** FR-1005: visible task items + one masked aggregate item (no id, no count) when hidden load ≠ 0. */
export function maskCellItems(
  items: readonly (WorkloadCellItem & { kind: 'task' })[],
  hidden: LoadPair,
): WorkloadCellItem[] {
  const out: WorkloadCellItem[] = [...items]
  if (!isZero(hidden)) {
    out.push({ kind: 'masked', label: th.masking.otherProjects, load: { total: hidden.total, committed: hidden.committed } })
  }
  return out
}
