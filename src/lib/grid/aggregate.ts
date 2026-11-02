// src/lib/grid/aggregate.ts — task sums and the sticky footer (FR-805/806/809, BR-37, BR-50, M6-D7/D8). Pure; integer cd.
import { addLoad, splitLoad, viewLoad, ZERO_LOAD } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import type { Cd, ISODate, LoadPair, LoadView, PeriodKey } from '@/domain/types'
import type { GridAssigneeRow, GridTaskRow } from '@/lib/contracts/grid'
import type { GridModel } from './merge'
import type { CellRow, ViewRow } from './rows'
import { weekOfPeriodKey } from './totals'

const collator = new Intl.Collator('th')

/** W:<Monday> → Monday; other kinds (M7 D:) → null. */
export function weekOfKey(key: PeriodKey): ISODate | null {
  return key.startsWith('W:') ? key.slice(2) : null
}

function indexTasks(m: GridModel): { tasks: Map<string, GridTaskRow>; assignees: GridAssigneeRow[] } {
  const tasks = new Map<string, GridTaskRow>()
  const assignees: GridAssigneeRow[] = []
  for (const r of m.rows) {
    if (r.kind === 'task') tasks.set(r.id, r)
    else if (r.kind === 'assignee') assignees.push(r) // M9 project / masked rows hold sums, never cells
  }
  return { tasks, assignees }
}

/** Counted contribution of one assignee row per period (BR-50 + certainty split; M7: D: cells count by their week). */
function countedCells(m: GridModel, a: GridAssigneeRow, task: GridTaskRow): [PeriodKey, LoadPair][] {
  const out: [PeriodKey, LoadPair][] = []
  const cells = m.cells.get(`a:${a.taskAssignmentId}`)
  if (!cells) return out
  for (const [key, cell] of cells) {
    if (cell.cd === 0 || !countsTowardLoad(weekOfPeriodKey(key), task.completedWeek)) continue
    out.push([key, splitLoad(cell.cd, task.certainty)])
  }
  return out
}

function addInto(rec: Partial<Record<PeriodKey, LoadPair>>, key: PeriodKey, p: LoadPair): void {
  rec[key] = addLoad(rec[key] ?? ZERO_LOAD, p)
}

/** Client recompute of task-row sums (after optimistic writes): leaves = Σ assignee cells, parents = Σ children. */
export function taskTotals(
  m: GridModel,
  rows: readonly ViewRow[],
): Map<string, Partial<Record<PeriodKey, LoadPair>>> {
  const { tasks, assignees } = indexTasks(m)
  const own = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
  for (const a of assignees) {
    const task = tasks.get(a.taskId)
    if (!task) continue
    let rec = own.get(task.id)
    if (!rec) own.set(task.id, (rec = {}))
    for (const [k, p] of countedCells(m, a, task)) addInto(rec, k, p)
  }
  const out = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
  // tasks arrive depth-first; walk them in reverse so children are complete before their parent
  const ordered = [...tasks.values()].reverse()
  for (const t of ordered) {
    const rec = out.get(t.id) ?? {}
    if (!t.hasChildren)
      for (const [k, p] of Object.entries(own.get(t.id) ?? {}) as [PeriodKey, LoadPair][]) addInto(rec, k, p)
    out.set(t.id, rec)
    if (t.parentId !== null) {
      const parent = out.get(t.parentId) ?? {}
      for (const [k, p] of Object.entries(rec) as [PeriodKey, LoadPair][]) addInto(parent, k, p)
      out.set(t.parentId, parent)
    }
  }
  const wanted = new Set(rows.map((r) => r.task.id))
  for (const id of [...out.keys()]) if (!wanted.has(id)) out.delete(id)
  return out
}

/**
 * M9 (S3.3): client recompute of the person grid's project-row totals after optimistic writes = Σ the counted cells
 * (BR-50, effective certainty) of every assignee row whose task belongs to the project. Computed from the model (a
 * collapsed project keeps its totals); only projects with a row in `rows` are returned.
 */
export function projectTotals(
  m: GridModel,
  rows: readonly CellRow[],
): Map<string, Partial<Record<PeriodKey, LoadPair>>> {
  const wanted = new Set<string>()
  for (const r of rows) if (r.kind === 'project') wanted.add(r.project.id)
  const out = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
  for (const id of wanted) out.set(id, {})
  const { tasks, assignees } = indexTasks(m)
  for (const a of assignees) {
    const task = tasks.get(a.taskId)
    const rec = task?.projectId === undefined ? undefined : out.get(task.projectId)
    if (!task || !rec) continue
    for (const [k, p] of countedCells(m, a, task)) addInto(rec, k, p)
  }
  return out
}

/** Task "รวม" (M6-D7): Σ of its leaves' rowTotal; leaves = Σ of their assignees' rowTotal. */
export function taskRowTotals(m: GridModel): Map<string, LoadPair> {
  const { tasks, assignees } = indexTasks(m)
  const own = new Map<string, LoadPair>()
  for (const a of assignees) own.set(a.taskId, addLoad(own.get(a.taskId) ?? ZERO_LOAD, a.rowTotal))
  const out = new Map<string, LoadPair>()
  for (const t of [...tasks.values()].reverse()) {
    const mine = addLoad(out.get(t.id) ?? ZERO_LOAD, t.hasChildren ? ZERO_LOAD : (own.get(t.id) ?? ZERO_LOAD))
    out.set(t.id, mine)
    if (t.parentId !== null) out.set(t.parentId, addLoad(out.get(t.parentId) ?? ZERO_LOAD, mine))
  }
  return out
}

export interface FooterCell {
  load: LoadPair
  capacityCd: Cd
  /** % of total load (view ALL); null when capacity is 0. */
  utilizationPct: number | null
}

/** floor((200·load + cap) / (2·cap)) — integer half-up; null when cap = 0 (M6-D8). */
function pctOf(loadCd: Cd, capCd: Cd): number | null {
  if (capCd <= 0) return null
  const n = 200 * loadCd + capCd
  const d = 2 * capCd
  return (n - (n % d)) / d
}

/**
 * Footer per period (M6-D8): people = every `people` key (assignees on live tasks of this project), sorted by name;
 * ภาระรวม = Σ counted assignee cells (+ otherProjects when the switch is on); Capacity = Σ people capacity.
 * M9 person context (M9-D13): people = the person; ภาระรวม = Σ counted assignee cells + the masked row's totals
 * (every project, visible or not); `includeOthers` is ignored.
 */
export function footerTotals(
  m: GridModel,
  o: { includeOthers: boolean },
): { people: string[]; cells: Partial<Record<PeriodKey, FooterCell>> } {
  const { tasks, assignees } = indexTasks(m)
  const loads: Partial<Record<PeriodKey, LoadPair>> = {}
  for (const a of assignees) {
    const task = tasks.get(a.taskId)
    if (task) for (const [k, p] of countedCells(m, a, task)) addInto(loads, k, p)
  }
  const person = m.context.kind === 'person'
  if (person)
    for (const r of m.rows)
      if (r.kind === 'masked')
        for (const [k, p] of Object.entries(r.totals) as [PeriodKey, LoadPair | undefined][]) if (p) addInto(loads, k, p)
  const withOthers = o.includeOthers && !person
  const people = Object.keys(m.people).sort(
    (a, b) => collator.compare(m.people[a]!.name, m.people[b]!.name) || (a < b ? -1 : a > b ? 1 : 0),
  )
  const cells: Partial<Record<PeriodKey, FooterCell>> = {}
  for (const period of m.periods) {
    const key = period.key
    let load = loads[key] ?? ZERO_LOAD
    let capacityCd = 0
    for (const u of people) {
      const person = m.people[u]!
      capacityCd += person.capacity[key] ?? 0
      if (withOthers) load = addLoad(load, person.otherProjects?.[key] ?? ZERO_LOAD)
    }
    cells[key] = { load, capacityCd, utilizationPct: pctOf(load.total, capacityCd) }
  }
  return { people, cells }
}

export function footerValue(cell: FooterCell, view: LoadView): { loadCd: Cd; pct: number | null } {
  const loadCd = viewLoad(cell.load, view)
  return { loadCd, pct: pctOf(loadCd, cell.capacityCd) }
}

export function rowTotalView(p: LoadPair, view: LoadView): Cd {
  return viewLoad(p, view)
}
