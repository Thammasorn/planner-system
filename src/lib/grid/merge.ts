// src/lib/grid/merge.ts — merges the loaded 8-week chunks into one client model (PLAN §3.10, r4 §9, C87).
import { compareISO } from '@/domain/dates'
import type { ISODate, PeriodKey } from '@/domain/types'
import type {
  AssigneeCell,
  GridAssigneeRow,
  GridPeriod,
  GridPerson,
  GridResponse,
  GridRow,
  GridTaskRow,
} from '@/lib/contracts/grid'

export interface GridModel {
  context: GridResponse['context']
  today: ISODate
  /** Depth-first rows (union of every chunk; row fields from the latest chunk, assignee version = max). */
  rows: GridRow[]
  /** rowKey (`a:<taskAssignmentId>`) → period → cell, unioned over chunks. */
  cells: Map<string, Map<PeriodKey, AssigneeCell>>
  /** ★ merged periods of every loaded chunk, unique by key, in timeline order — M7 reads the D: dates per week (C87). */
  periods: GridPeriod[]
  people: Record<string, GridPerson>
  holidays: Map<ISODate, string>
  loadedWeeks: Set<ISODate>
}

const identity = (r: GridRow): string => (r.kind === 'task' ? `t:${r.id}` : `a:${r.taskAssignmentId}`)

function mergePerson(a: GridPerson | undefined, b: GridPerson): GridPerson {
  if (!a) return { ...b, capacity: { ...b.capacity }, standard: { ...b.standard }, timeOff: [...b.timeOff] }
  const seen = new Set(a.timeOff.map((t) => `${t.start}|${t.end}|${t.half}|${t.label}`))
  const timeOff = [...a.timeOff]
  for (const t of b.timeOff) {
    const k = `${t.start}|${t.end}|${t.half}|${t.label}`
    if (!seen.has(k)) {
      seen.add(k)
      timeOff.push(t)
    }
  }
  const out: GridPerson = {
    name: b.name,
    active: b.active,
    deactivatedOn: b.deactivatedOn,
    capacity: { ...a.capacity, ...b.capacity },
    standard: { ...a.standard, ...b.standard },
    timeOff,
  }
  if (a.otherProjects || b.otherProjects) out.otherProjects = { ...a.otherProjects, ...b.otherProjects }
  return out
}

/** Rows by task id / taskAssignmentId (latest chunk wins for row fields), cells, periods and people keys unioned.
 *  "Latest" = the last defined chunk of the array. */
export function mergeChunks(chunks: readonly (GridResponse | undefined)[]): GridModel | null {
  const defined = chunks.filter((c): c is GridResponse => c !== undefined)
  const latest = defined[defined.length - 1]
  if (!latest) return null

  // ── row order: the latest chunk's order, plus rows only older chunks have, after their predecessor ──
  const order: string[] = latest.rows.map(identity)
  const present = new Set(order)
  for (let i = defined.length - 2; i >= 0; i--) {
    const rows = defined[i]!.rows
    let prev: string | null = null
    for (const r of rows) {
      const id = identity(r)
      if (!present.has(id)) {
        const at = prev === null ? 0 : order.indexOf(prev) + 1
        order.splice(at, 0, id)
        present.add(id)
      }
      prev = id
    }
  }

  const tasks = new Map<string, GridTaskRow>()
  const assignees = new Map<string, GridAssigneeRow>()
  const cells = new Map<string, Map<PeriodKey, AssigneeCell>>()
  const people: Record<string, GridPerson> = {}
  const holidays = new Map<ISODate, string>()
  const periods = new Map<PeriodKey, GridPeriod>()

  for (const chunk of defined) {
    for (const p of chunk.periods) periods.set(p.key, p)
    for (const h of chunk.holidays) holidays.set(h.date, h.name)
    for (const [u, person] of Object.entries(chunk.people)) people[u] = mergePerson(people[u], person)
    for (const r of chunk.rows) {
      if (r.kind === 'task') {
        const prev = tasks.get(r.id)
        tasks.set(r.id, { ...r, totals: { ...prev?.totals, ...r.totals } })
      } else {
        const key = `a:${r.taskAssignmentId}`
        const prev = assignees.get(key)
        const winner = prev && prev.version > r.version ? prev : r
        assignees.set(key, { ...winner, cells: { ...prev?.cells, ...r.cells } })
        let m = cells.get(key)
        if (!m) cells.set(key, (m = new Map<PeriodKey, AssigneeCell>()))
        for (const [k, c] of Object.entries(r.cells) as [PeriodKey, AssigneeCell | undefined][]) {
          if (c) m.set(k, c)
        }
      }
    }
  }

  const rows: GridRow[] = []
  for (const id of order) {
    const r = id.startsWith('t:') ? tasks.get(id.slice(2)) : assignees.get(id)
    if (r) rows.push(r)
  }
  const sortedPeriods = [...periods.values()].sort(
    (a, b) => compareISO(a.date, b.date) || (a.kind === b.kind ? 0 : a.kind === 'DAY' ? -1 : 1),
  )
  return {
    context: latest.context,
    today: latest.today,
    rows,
    cells,
    periods: sortedPeriods,
    people,
    holidays,
    loadedWeeks: new Set(sortedPeriods.filter((p) => p.kind === 'WEEK').map((p) => p.weekStart)),
  }
}
