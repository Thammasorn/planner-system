// src/lib/grid/day-footer.ts — day-level load, BR-40 status and BR-45 footer tones (SPEC §5.6, X06/X67, M7-D13/D14).
// Pure and context-agnostic so M9's person grid delegates to it (C38): it reads only `assignee` rows (any other row
// kind is skipped), looks the task up by `assignee.taskId`, and takes contributions that are not assignee cells (other
// projects, M9 masked rows) through `extra`. Extension points: M9 adds a masked-row branch to personDayLoads and
// reuses personDayStatus / footerDayCell unchanged.
import { addLoad, splitLoad, viewLoad, ZERO_LOAD } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import { loadTone, overloadLevel, worstLevel, type LoadTone, type OverloadLevel } from '@/domain/overload'
import type { Cd, LoadPair, LoadView, PeriodKey } from '@/domain/types'
import type { GridPeriod, GridPerson, GridResponse, GridRow, GridTaskRow } from '@/lib/contracts/grid'
import { compareThai } from '@/lib/collate'

type DayLoads = Partial<Record<PeriodKey, LoadPair>>

function addInto(map: Map<string, DayLoads>, userId: string, key: PeriodKey, p: LoadPair): void {
  if (p.total === 0 && p.committed === 0) return
  let rec = map.get(userId)
  if (!rec) map.set(userId, (rec = {}))
  rec[key] = addLoad(rec[key] ?? ZERO_LOAD, p)
}

/**
 * Per person per D: period: Σ of that person's assignee D cells (+ Σ extra.get(user)[key]), committed by the row's
 * effective certainty; a row of a completed task counts only if period.weekStart ≤ completedWeek (BR-50, M7-D14).
 */
export function personDayLoads(
  rows: readonly GridRow[],
  periods: readonly GridPeriod[],
  o: { extra?: ReadonlyMap<string, DayLoads> },
): Map<string, DayLoads> {
  const out = new Map<string, DayLoads>()
  const days = periods.filter((p) => p.kind === 'DAY')
  const tasks = new Map<string, GridTaskRow>()
  for (const r of rows) if (r.kind === 'task') tasks.set(r.id, r)
  for (const r of rows) {
    if (r.kind !== 'assignee') continue
    const task = tasks.get(r.taskId)
    if (!task) continue
    for (const p of days) {
      const cd = r.cells[p.key]?.cd ?? 0
      if (cd === 0 || !countsTowardLoad(p.weekStart, task.completedWeek)) continue
      addInto(out, r.userId, p.key, splitLoad(cd, task.certainty))
    }
  }
  for (const [u, rec] of o.extra ?? []) {
    for (const p of days) {
      const v = rec[p.key]
      if (v) addInto(out, u, p.key, v)
    }
  }
  return out
}

/** Helper for the project footer switch: people[u].otherProjects restricted to D: keys. */
export function otherDayLoads(people: GridResponse['people']): Map<string, DayLoads> {
  const out = new Map<string, DayLoads>()
  for (const [u, person] of Object.entries(people)) {
    const rec: DayLoads = {}
    for (const [k, v] of Object.entries(person.otherProjects ?? {}) as [PeriodKey, LoadPair | undefined][])
      if (v && k.startsWith('D:')) rec[k] = v
    if (Object.keys(rec).length > 0) out.set(u, rec)
  }
  return out
}

export interface DayStatus {
  level: OverloadLevel
  load: LoadPair
  capCd: Cd
}

/** capCd = person.capacity[key] ?? 0; level = overloadLevel(load, capCd); a missing load = { 0, 0 }. */
export function personDayStatus(loads: DayLoads | undefined, person: GridPerson | undefined, key: PeriodKey): DayStatus {
  const load = loads?.[key] ?? ZERO_LOAD
  const capCd = person?.capacity[key] ?? 0
  return { level: overloadLevel(load, capCd), load, capCd }
}

export interface FooterDayCell {
  tone: LoadTone
  palette: 'load' | 'tentative'
  glyph: OverloadLevel
  overPeople: string[]
  /** the selected view's load (X67) */
  load: Cd
  capCd: Cd
}

/**
 * Footer "ภาระรวม" D cell: tone = loadTone(view load of Σ loads, Σ caps) (palette 'tentative' for the AT_RISK view,
 * X67); glyph = the worst person's level; overPeople = userIds whose level ≠ OK, sorted by `nameOf` (compareThai).
 */
export function footerDayCell(
  statuses: ReadonlyMap<string, DayStatus>,
  view: LoadView,
  nameOf: (userId: string) => string = (u) => u,
): FooterDayCell {
  let sum: LoadPair = ZERO_LOAD
  let capCd = 0
  for (const s of statuses.values()) {
    sum = addLoad(sum, s.load)
    capCd += s.capCd
  }
  const load = viewLoad(sum, view)
  const overPeople = [...statuses]
    .filter(([, s]) => s.level !== 'OK')
    .map(([u]) => u)
    .sort((a, b) => compareThai(nameOf(a), nameOf(b)) || (a < b ? -1 : a > b ? 1 : 0))
  return {
    tone: loadTone(load, capCd),
    palette: view === 'AT_RISK' ? 'tentative' : 'load',
    glyph: worstLevel([...statuses.values()].map((s) => s.level)),
    overPeople,
    load,
    capCd,
  }
}
