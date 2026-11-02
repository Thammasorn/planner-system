// src/lib/grid/load-series.ts — the per-person weekly load chart (SPEC FR-813, BR-104, M7.1-D3/D4/D5). Pure; integer
// cd. Computed from the loaded grid chunks only, so the numbers (and the masking of otherProjects, X29) are exactly
// the footer's: Σ of every line in week w = the footer's "ภาระรวม" at W:w. The weeks are the ones whose value column the
// grid renders (chart-geometry.ts slotWeeks, M7.1-D30 — no 4–26 clamp any more).
import { addLoad, viewLoad, ZERO_LOAD } from '@/domain/certainty'
import { overloadLevel } from '@/domain/overload'
import type { CellUnit, ISODate, LoadPair, LoadView, PeriodKey } from '@/domain/types'
import type { LoadSeries } from '@/components/load-chart/types'
import type { GridTaskRow } from '@/lib/contracts/grid'
import { footerTotals, footerValue } from './aggregate'
import type { GridModel } from './merge'
import { counted } from './totals'

export interface LoadSeriesOptions {
  view: LoadView
  /** the footer's "รวมงานโปรเจคอื่น" switch (shared state) */
  includeOthers: boolean
  /** display only — the chart converts cd / pct at the edge; values here do not depend on it */
  unit?: CellUnit
}

/**
 * BR-104: one series per footer person (footerTotals order). Per week: `loadCd` = counted load (BR-50) of the person
 * in this project at W:w in `view` (+ otherProjects when `includeOthers`), `capacityCd` = capacity[W:w], `pct` = the
 * footer's integer half-up percent (null when cap 0), `level` = BR-40 from the committed/total pair. Weeks the model
 * has not loaded → every field null.
 */
export function memberLoadSeries(
  m: GridModel,
  weeks: readonly ISODate[],
  o: LoadSeriesOptions,
): LoadSeries[] {
  const tasks = new Map<string, GridTaskRow>()
  for (const r of m.rows) if (r.kind === 'task') tasks.set(r.id, r)
  const wanted = new Set(weeks)
  /** userId → week → counted pair */
  const own = new Map<string, Map<ISODate, LoadPair>>()
  for (const r of m.rows) {
    if (r.kind !== 'assignee') continue
    const task = tasks.get(r.taskId)
    const cells = m.cells.get(`a:${r.taskAssignmentId}`)
    if (!task || !cells) continue
    for (const w of wanted) {
      const c = cells.get(`W:${w}`)
      if (!c) continue
      let perWeek = own.get(r.userId)
      if (!perWeek) own.set(r.userId, (perWeek = new Map<ISODate, LoadPair>()))
      perWeek.set(w, addLoad(perWeek.get(w) ?? ZERO_LOAD, counted(c.cd, w, task)))
    }
  }
  const { people } = footerTotals(m, { includeOthers: false })
  return people.map((userId) => {
    const person = m.people[userId]!
    return {
      userId,
      name: person.name,
      points: weeks.map((week) => {
        if (!m.loadedWeeks.has(week)) return { week, loadCd: null, capacityCd: null, pct: null, level: null }
        const key: PeriodKey = `W:${week}`
        let load = own.get(userId)?.get(week) ?? ZERO_LOAD
        if (o.includeOthers) load = addLoad(load, person.otherProjects?.[key] ?? ZERO_LOAD)
        const capacityCd = person.capacity[key] ?? 0
        const { pct } = footerValue({ load, capacityCd, utilizationPct: null }, o.view)
        return {
          week,
          loadCd: viewLoad(load, o.view),
          capacityCd,
          pct,
          level: overloadLevel(load, capacityCd),
        }
      }),
    }
  })
}
