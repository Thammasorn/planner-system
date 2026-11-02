// src/lib/grid/load-footer.ts — week-level (and delegated day-level) person loads, BR-40/41 status and the BR-45 footer
// tone of both grid contexts (SPEC §5.6, §8.3, X06/X67, M9-D13). Pure; integer cd.
// D: keys delegate to M7's day-footer.ts (C38) so one key never has two different sums: the person context passes no
// `extra` (its masked row arrives through the rows), the project context passes otherDayLoads(people) when the footer
// switch is on.
import { addLoad, splitLoad, ZERO_LOAD } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import {
  overloadStatus,
  viewTone,
  worstLevel,
  type LoadTone,
  type OverloadLevel,
  type OverloadStatus,
  type TonePalette,
} from '@/domain/overload'
import type { Cd, LoadPair, LoadView, PeriodKey } from '@/domain/types'
import type { GridPeriod, GridPerson, GridTaskRow } from '@/lib/contracts/grid'
import { compareThai } from '@/lib/collate'
import { otherDayLoads, personDayLoads } from './day-footer'
import type { GridModel } from './merge'

type Loads = Partial<Record<PeriodKey, LoadPair>>

function addInto(map: Map<string, Loads>, userId: string, key: PeriodKey, p: LoadPair): void {
  if (p.total === 0 && p.committed === 0) return
  let rec = map.get(userId)
  if (!rec) map.set(userId, (rec = {}))
  rec[key] = addLoad(rec[key] ?? ZERO_LOAD, p)
}

/**
 * Per person, per period (W: and D:), counted per BR-50 with the effective certainty:
 * - project context: Σ assignee cells (+ people[u].otherProjects when `includeOthers`, M6/M7);
 * - person context: Σ assignee cells + the masked row's totals (`includeOthers` ignored).
 * W: keys read the W: cells (`model.cells`, so optimistic writes count); D: keys = personDayLoads (M7).
 */
export function personPeriodLoads(
  m: GridModel,
  periods: readonly GridPeriod[],
  o: { includeOthers: boolean },
): Map<string, Loads> {
  const person = m.context.kind === 'person'
  const withOthers = o.includeOthers && !person
  const out = personDayLoads(m.rows, periods, withOthers ? { extra: otherDayLoads(m.people) } : {})
  const weeks = periods.filter((p) => p.kind === 'WEEK')
  const tasks = new Map<string, GridTaskRow>()
  for (const r of m.rows) if (r.kind === 'task') tasks.set(r.id, r)
  for (const r of m.rows) {
    if (r.kind === 'assignee') {
      const task = tasks.get(r.taskId)
      const cells = m.cells.get(`a:${r.taskAssignmentId}`)
      if (!task || !cells) continue
      for (const p of weeks) {
        const cd = cells.get(p.key)?.cd ?? 0
        if (cd === 0 || !countsTowardLoad(p.weekStart, task.completedWeek)) continue
        addInto(out, r.userId, p.key, splitLoad(cd, task.certainty))
      }
    } else if (r.kind === 'masked' && person) {
      for (const p of weeks) {
        const v = r.totals[p.key]
        if (v) addInto(out, r.userId, p.key, v)
      }
    }
  }
  if (withOthers) {
    for (const [u, gp] of Object.entries(m.people)) {
      for (const p of weeks) {
        const v = gp.otherProjects?.[p.key]
        if (v) addInto(out, u, p.key, v)
      }
    }
  }
  return out
}

export interface PeriodStatus {
  load: LoadPair
  capCd: Cd
  stdCd: Cd
  status: OverloadStatus
}

/** capCd / stdCd = the person's capacity / standard at the key (missing = 0); status = overloadStatus (S1). */
export function periodStatus(load: LoadPair | undefined, person: GridPerson, key: PeriodKey): PeriodStatus {
  const l = load ?? ZERO_LOAD
  const capCd = person.capacity[key] ?? 0
  const stdCd = person.standard[key] ?? 0
  return { load: l, capCd, stdCd, status: overloadStatus(l, capCd, stdCd) }
}

export interface FooterPeriodCell {
  tone: LoadTone
  palette: TonePalette
  /** the worst person's BR-40 level */
  glyph: OverloadLevel
  /** userIds whose level ≠ OK, sorted by `nameOf` (compareThai) */
  overPeople: string[]
  /** the selected view's load (X67) */
  loadCd: Cd
  capCd: Cd
  /** the only person's status when the footer has exactly one person (person grid: excess + cause in the tooltip) */
  single: PeriodStatus | null
}

/**
 * Footer "ภาระรวม" cell: tone / palette = viewTone(Σ loads, Σ caps, view) (M9-D6); glyph = worstLevel of the people
 * (M9-D13: a sum never hides one person's overload). `nameOf` (optional, as M7's footerDayCell) orders overPeople.
 */
export function footerPeriodCell(
  statuses: ReadonlyMap<string, PeriodStatus>,
  view: LoadView,
  nameOf: (userId: string) => string = (u) => u,
): FooterPeriodCell {
  let sum: LoadPair = ZERO_LOAD
  let capCd = 0
  for (const s of statuses.values()) {
    sum = addLoad(sum, s.load)
    capCd += s.capCd
  }
  const t = viewTone(sum, capCd, view)
  const overPeople = [...statuses]
    .filter(([, s]) => s.status.level !== 'OK')
    .map(([u]) => u)
    .sort((a, b) => compareThai(nameOf(a), nameOf(b)) || (a < b ? -1 : a > b ? 1 : 0))
  return {
    tone: t.tone,
    palette: t.palette,
    glyph: worstLevel([...statuses.values()].map((s) => s.status.level)),
    overPeople,
    loadCd: t.loadCd,
    capCd,
    single: statuses.size === 1 ? ([...statuses.values()][0] ?? null) : null,
  }
}
