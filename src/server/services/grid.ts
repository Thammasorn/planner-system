// src/server/services/grid.ts — one planning-grid chunk [from, to) (SPEC §7.4, FR-805–809, X28/X29/X65/X76, M6-D2).
// Called by GET /api/grid/project/[projectId] inside a REPEATABLE READ read-only transaction; authz first
// (requireProject 'view', archived allowed — X42); `today` is a parameter (X45). The DTO is assembled by the pure
// `assembleGrid` (unit-tested): masking of leave labels happens here (§3.3, canSeeLeaveDetails); `otherProjects` carries
// numbers only (X29). Loads stay integer cd; every allocations query is week-bounded (repo/allocations.ts).
import { resolveCertainty, splitLoad, addLoad, type CertaintyNode } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import { addDays, weekRange } from '@/domain/dates'
import type { Cd, Certainty, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import { displayName } from '@/lib/display-name'
import type { UserCapacity } from '@/lib/contracts/capacity'
import type {
  AssigneeCell,
  GridAssigneeRow,
  GridPerson,
  GridResponse,
  GridRow,
  GridTaskRow,
  GridTimeOff,
} from '@/lib/contracts/grid'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import type { AllocRow } from '../repo/allocations'
import type { TaskListRow } from '../repo/tasks'
import type { CalendarTimeOffRow } from '../repo/time-off'
import type { SessionUser } from '../session'
import * as capacity from './capacity'
import * as holidaysSvc from './holidays'
import { maskTimeOff } from './masking'
import { timelineBound } from './timeline'

/** M6: expand [] and zoom 'week' (M7 fills them). */
export interface ChunkParams {
  from: ISODate
  to: ISODate
  expand: ISODate[]
  zoom: 'week' | 'day'
  includeOthers: boolean
}

const wk = (w: ISODate): PeriodKey => `W:${w}`

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)]
}

/** ASCII order keys: plain `<` = COLLATE "C" (M3 order keys). */
function byPositionThenId(a: { position: string; id: string }, b: { position: string; id: string }): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export async function buildChunk(
  tx: DbOrTx,
  user: SessionUser,
  ctx: { kind: 'project'; id: string },
  p: ChunkParams,
  today: ISODate,
): Promise<GridResponse> {
  const access = await authz.requireProject(tx, user, ctx.id, 'view') // 404 invisible; archived allowed (X42)
  const project = await repo.projects.getProject(tx, ctx.id)
  if (!project) throw new NotFoundError() // unreachable after requireProject; keeps the type non-null
  const tasks = await repo.tasks.listLiveWithBlockerCounts(tx, ctx.id)
  const assignments = await repo.assignments.listActiveForProject(tx, ctx.id)
  const range = { from: p.from, to: p.to }
  const rows = await repo.allocations.listForProject(tx, ctx.id, range)
  const totals = await repo.allocations.sumCountedByAssignment(
    tx,
    assignments.map((a) => a.id),
    timelineBound(today),
  )
  const userIds = unique(assignments.map((a) => a.userId))
  const cap = await capacity.loadCapacity(tx, userIds, range)
  const people = await repo.users.listCalendarPeople(tx, userIds)
  const deactivated = await repo.users.listDeactivatedOn(tx, userIds)
  const leave = await repo.timeOff.listForCalendar(tx, userIds, p.from, p.to)
  const holidays = await holidaysSvc.listHolidaysInRange(tx, range)
  const others = p.includeOthers
    ? await repo.allocations.loadByUserWeek(tx, { userIds, range, excludeProjectId: ctx.id })
    : null
  return assembleGrid({
    project: { id: project.id, name: project.name, certainty: project.certainty, archived: access.archived },
    tasks,
    assignments,
    rows,
    totals,
    people: people.map((u) => ({
      id: u.id,
      name: displayName(u),
      active: u.active,
      deactivatedOn: deactivated.get(u.id) ?? null,
    })),
    capacity: cap,
    leave,
    holidays,
    others,
    p,
    today,
    viewer: user,
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Pure assembly (src/server/services/grid-assemble.test.ts)
// ---------------------------------------------------------------------------------------------------------------

export interface AssembleInput {
  project: { id: string; name: string; certainty: Certainty; archived: boolean }
  tasks: readonly TaskListRow[]
  assignments: readonly { id: string; taskId: string; userId: string; version: number }[]
  rows: readonly AllocRow[]
  /** Counted cd per assignment over the timeline bound (M6-D7). */
  totals: ReadonlyMap<string, Cd>
  people: readonly { id: string; name: string; active: boolean; deactivatedOn: ISODate | null }[]
  capacity: ReadonlyMap<string, UserCapacity>
  leave: readonly CalendarTimeOffRow[]
  holidays: readonly { date: ISODate; name: string }[]
  /** includeOthers: per user and week, the counted load of their other live, non-archived projects (X29). */
  others: ReadonlyMap<string, Record<ISODate, LoadPair>> | null
  p: ChunkParams
  today: ISODate
  viewer: Pick<SessionUser, 'id' | 'role'>
}

/** Assignee cells of one assignment: WEEK → its row; DAY → Σ days + the day values (BR-20a). Mixed → error. */
export function assigneeCells(rows: readonly AllocRow[]): Partial<Record<PeriodKey, AssigneeCell>> {
  const cells: Partial<Record<PeriodKey, AssigneeCell>> = {}
  const weeks = repo.allocations.plansFromRows(rows)
  for (const plans of weeks.values()) {
    for (const [week, plan] of plans) {
      if (plan.resolution === 'WEEK') cells[wk(week)] = { cd: plan.weekCd, resolution: 'WEEK', derived: false }
      else if (plan.resolution === 'DAY') {
        const days: Record<ISODate, Cd> = {}
        let cd = 0
        plan.days.forEach((v, i) => {
          if (v > 0) {
            days[addDays(week, i)] = v
            cd += v
          }
        })
        cells[wk(week)] = { cd, resolution: 'DAY', derived: false, days }
      }
    }
  }
  return cells
}

export interface TotalsNode {
  id: string
  parentId: string | null
  completedWeek: ISODate | null
  certainty: Certainty
  /** Cells of the task's own assignments (leaves; parents normally have none — BR-31). */
  cells: readonly Partial<Record<PeriodKey, AssigneeCell>>[]
}

function addInto(into: Partial<Record<PeriodKey, LoadPair>>, key: PeriodKey, v: LoadPair): void {
  if (v.total === 0 && v.committed === 0) return
  into[key] = addLoad(into[key] ?? { total: 0, committed: 0 }, v)
}

/**
 * Task-total aggregate (FR-805, BR-37, BR-50, M6-D12): each task's own assignee cells counted under its own completed
 * week and effective certainty, plus the totals of its children (parents = Σ leaves). Keys with 0/0 are left out.
 */
export function aggregateTaskTotals(nodes: readonly TotalsNode[]): Map<string, Partial<Record<PeriodKey, LoadPair>>> {
  const out = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
  const children = new Map<string | null, TotalsNode[]>()
  for (const n of nodes) {
    const list = children.get(n.parentId) ?? []
    list.push(n)
    children.set(n.parentId, list)
  }
  const visit = (n: TotalsNode): Partial<Record<PeriodKey, LoadPair>> => {
    const t: Partial<Record<PeriodKey, LoadPair>> = {}
    for (const cells of n.cells) {
      for (const [key, cell] of Object.entries(cells) as [PeriodKey, AssigneeCell | undefined][]) {
        if (!cell || cell.cd === 0) continue
        if (!countsTowardLoad(key.slice(2), n.completedWeek)) continue
        addInto(t, key, splitLoad(cell.cd, n.certainty))
      }
    }
    for (const c of children.get(n.id) ?? []) {
      for (const [key, v] of Object.entries(visit(c)) as [PeriodKey, LoadPair][]) addInto(t, key, v)
    }
    out.set(n.id, t)
    return t
  }
  for (const n of nodes) if (!out.has(n.id)) visit(n)
  return out
}

export function assembleGrid(i: AssembleInput): GridResponse {
  const { p } = i
  const canEdit = !i.project.archived // M, L, Me all edit (PERM-12); archived → read-only (X42)
  const weeks = weekRange(p.from, p.to)

  // task tree (depth-first by position COLLATE "C", then id)
  const live = new Map(i.tasks.map((t) => [t.id, t]))
  const kids = new Map<string | null, TaskListRow[]>()
  for (const t of i.tasks) {
    const parent = t.parentId !== null && live.has(t.parentId) ? t.parentId : t.parentId === null ? null : undefined
    if (parent === undefined) continue // orphan of a deleted parent: not part of the live tree
    const list = kids.get(parent) ?? []
    list.push(t)
    kids.set(parent, list)
  }
  for (const list of kids.values()) list.sort(byPositionThenId)

  const chainOf = (t: TaskListRow): CertaintyNode[] => {
    const chain: CertaintyNode[] = []
    for (let n: TaskListRow | undefined = t; n && chain.length < 3; n = n.parentId ? live.get(n.parentId) : undefined)
      chain.push({ id: n.id, name: n.name, certaintyOverride: n.certaintyOverride })
    return chain
  }
  const certainty = new Map(i.tasks.map((t) => [t.id, resolveCertainty(chainOf(t), i.project.certainty)]))

  const rowsByAssignment = new Map<string, AllocRow[]>()
  for (const r of i.rows) {
    const list = rowsByAssignment.get(r.taskAssignmentId) ?? []
    list.push(r)
    rowsByAssignment.set(r.taskAssignmentId, list)
  }
  const assignmentsByTask = new Map<string, AssembleInput['assignments'][number][]>()
  for (const a of i.assignments) {
    const list = assignmentsByTask.get(a.taskId) ?? []
    list.push(a)
    assignmentsByTask.set(a.taskId, list)
  }
  const cellsOf = new Map(i.assignments.map((a) => [a.id, assigneeCells(rowsByAssignment.get(a.id) ?? [])]))

  const totals = aggregateTaskTotals(
    i.tasks
      .filter((t) => t.parentId === null || live.has(t.parentId))
      .map((t) => ({
        id: t.id,
        parentId: t.parentId,
        completedWeek: t.completedWeek,
        certainty: certainty.get(t.id)!.value,
        cells: (assignmentsByTask.get(t.id) ?? []).map((a) => cellsOf.get(a.id)!),
      })),
  )

  const out: GridRow[] = []
  const emit = (t: TaskListRow): void => {
    const children = kids.get(t.id) ?? []
    const hasChildren = children.length > 0
    const c = certainty.get(t.id)!
    const own = assignmentsByTask.get(t.id) ?? []
    const taskRow: GridTaskRow = {
      kind: 'task',
      id: t.id,
      depth: Math.min(Math.max(t.depth, 0), 2) as 0 | 1 | 2,
      name: t.name,
      parentId: t.parentId,
      hasChildren,
      certainty: c.value,
      certaintySource: c.source,
      certaintySourceName: c.sourceTaskName,
      completed: t.completedOn !== null,
      completedWeek: t.completedWeek,
      milestoneId: null, // X28 (M8)
      lateForMilestone: false,
      blockers: { open: t.blockersOpen, total: t.blockersTotal }, // X76
      assigneeCount: own.length,
      totals: totals.get(t.id) ?? {},
    }
    out.push(taskRow)
    for (const a of own) {
      const row: GridAssigneeRow = {
        kind: 'assignee',
        taskAssignmentId: a.id,
        taskId: a.taskId,
        userId: a.userId,
        version: a.version,
        editable: canEdit && !hasChildren,
        rowTotal: splitLoad(i.totals.get(a.id) ?? 0, c.value), // M6-D7
        cells: cellsOf.get(a.id)!,
      }
      out.push(row)
    }
    for (const k of children) emit(k)
  }
  for (const root of kids.get(null) ?? []) emit(root)

  // people (FR-806/807, §3.3): every assignee user
  const leaveBy = new Map<string, GridTimeOff[]>()
  for (const row of i.leave) {
    const m = maskTimeOff(row, authz.canSeeLeaveDetails(i.viewer, row.userId))
    const entry: GridTimeOff = {
      start: m.startDate,
      end: m.endDate,
      half: m.half,
      label: m.kind === 'full' ? m.leaveTypeName : m.label,
    }
    const list = leaveBy.get(row.userId) ?? []
    list.push(entry)
    leaveBy.set(row.userId, list)
  }
  const people: Record<string, GridPerson> = {}
  for (const u of i.people) {
    const cap = i.capacity.get(u.id)
    const capacityCd: Partial<Record<PeriodKey, Cd>> = {}
    const standardCd: Partial<Record<PeriodKey, Cd>> = {}
    for (const w of weeks) {
      capacityCd[wk(w)] = cap?.weeks[w]?.capacityCd ?? 0
      standardCd[wk(w)] = cap?.weeks[w]?.standardCd ?? 0
    }
    const person: GridPerson = {
      name: u.name,
      active: u.active,
      deactivatedOn: u.deactivatedOn,
      capacity: capacityCd,
      standard: standardCd,
      timeOff: leaveBy.get(u.id) ?? [],
    }
    if (i.others) {
      const other: Partial<Record<PeriodKey, LoadPair>> = {}
      for (const [w, v] of Object.entries(i.others.get(u.id) ?? {})) other[wk(w)] = { total: v.total, committed: v.committed }
      person.otherProjects = other
    }
    people[u.id] = person
  }

  return {
    context: { kind: 'project', id: i.project.id, name: i.project.name, archived: i.project.archived, canEdit },
    window: { from: p.from, to: p.to, expand: [], zoom: 'week', includeOthers: p.includeOthers },
    today: i.today,
    periods: weeks.map((w) => ({ key: wk(w), kind: 'WEEK', weekStart: w, date: w })),
    rows: out,
    milestones: [], // X28 (M8)
    people,
    holidays: i.holidays.map((h) => ({ date: h.date, name: h.name })),
  }
}
