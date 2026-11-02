// src/server/services/grid.ts — one planning-grid chunk [from, to) (SPEC §7.4, FR-805–809, X28/X29/X65/X76, M6-D2).
// Called by GET /api/grid/project/[projectId] inside a REPEATABLE READ read-only transaction; authz first
// (requireProject 'view', archived allowed — X42); `today` is a parameter (X45). The DTO is assembled by the pure
// `assembleGrid` (unit-tested): masking of leave labels happens here (§3.3, canSeeLeaveDetails); `otherProjects` carries
// numbers only (X29). Loads stay integer cd; every allocations query is week-bounded (repo/allocations.ts).
import type { WeekPlan } from '@/domain/allocation'
import { resolveCertainty, splitLoad, addLoad, type CertaintyNode } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import { addDays, isoWeekday, weekRange, weekStart } from '@/domain/dates'
import type { Cd, Certainty, ISODate, LoadPair, PeriodKey, Weekday } from '@/domain/types'
import { compareThai } from '@/lib/collate'
import { displayName } from '@/lib/display-name'
import type { UserCapacity } from '@/lib/contracts/capacity'
import type {
  AssigneeCell,
  DayLoadRow,
  GridAssigneeRow,
  GridMilestone,
  GridPeriod,
  GridPerson,
  GridResponse,
  GridRow,
  GridTaskRow,
  GridTimeOff,
} from '@/lib/contracts/grid'
import type { GridCtx } from '@/lib/query-keys'
import { dayCellsFromPlan, dayCtxFor, dKey, spreadDayLoads, visibleDayDates, weekCellFromPlan, wKey } from '@/lib/grid/day'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import type { AllocRow } from '../repo/allocations'
import type { TaskListRow } from '../repo/tasks'
import type { CalendarTimeOffRow } from '../repo/time-off'
import type { SessionUser } from '../session'
import * as capacity from './capacity'
import { dayKeysFor } from './day-context'
import * as holidaysSvc from './holidays'
import { maskedGridRow, maskTimeOff, partitionByProject } from './masking'
import * as milestonesSvc from './milestones'
import { timelineBound } from './timeline'

/** M7 (M7-D10/D17): `expand` = Mondays shown as days; `zoom: 'day'` expands every week (and ignores `expand`). */
export interface ChunkParams {
  from: ISODate
  to: ISODate
  expand: ISODate[]
  zoom: 'week' | 'day'
  includeOthers: boolean
}

const wk = (w: ISODate): PeriodKey => `W:${w}`

/** FR-802/803: the weeks of the chunk that are shown as days (zoom=day → all of them). */
export function expandedWeeks(p: Pick<ChunkParams, 'expand' | 'zoom'>, weeks: readonly ISODate[]): Set<ISODate> {
  if (p.zoom === 'day') return new Set(weeks)
  const inChunk = new Set(weeks)
  return new Set(p.expand.filter((w) => inChunk.has(w)))
}

/** M7-D10: collapsed week → its W: period; expanded week → its visible D: periods, then W: `expanded: true` ("รวม"). */
export function buildPeriods(
  weeks: readonly ISODate[],
  expanded: ReadonlySet<ISODate>,
  vis: { scheduledWeekdays: ReadonlySet<Weekday>; dayRowDates: ReadonlySet<ISODate> },
): GridPeriod[] {
  const out: GridPeriod[] = []
  for (const w of weeks) {
    if (!expanded.has(w)) {
      out.push({ key: wKey(w), kind: 'WEEK', weekStart: w, date: w })
      continue
    }
    for (const d of visibleDayDates(w, vis)) out.push({ key: dKey(d), kind: 'DAY', weekStart: w, date: d })
    out.push({ key: wKey(w), kind: 'WEEK', weekStart: w, date: w, expanded: true })
  }
  return out
}

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)]
}

/** ASCII order keys: plain `<` = COLLATE "C" (M3 order keys). */
function byPositionThenId(a: { position: string; id: string }, b: { position: string; id: string }): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** M9 (X85, PLAN §3.10): `ctx.kind === 'person'` → buildPersonChunk (GET /api/grid/person/[userId]). */
export async function buildChunk(
  tx: DbOrTx,
  user: SessionUser,
  ctx: GridCtx,
  p: ChunkParams,
  today: ISODate,
): Promise<GridResponse> {
  if (ctx.kind === 'person') return buildPersonChunk(tx, user, ctx.id, p, today)
  const access = await authz.requireProject(tx, user, ctx.id, 'view') // 404 invisible; archived allowed (X42)
  const project = await repo.projects.getProject(tx, ctx.id)
  if (!project) throw new NotFoundError() // unreachable after requireProject; keeps the type non-null
  const tasks = await repo.tasks.listLiveWithBlockerCounts(tx, ctx.id) // milestoneId = live (LIVE_MILESTONE_ON)
  // X28 / M8-D8: all live milestones of the project (not windowed) + BR-71 per task row
  const lateness = await milestonesSvc.computeLateness(tx, { projectId: ctx.id })
  const milestones = await milestonesSvc.toDTOs(tx, await repo.milestones.listLive(tx, ctx.id), today, lateness)
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
  // X29 (M7-D27): other projects' loads of the grid people in expanded weeks, spread to days in assembleGrid
  const expanded = [...expandedWeeks(p, weekRange(p.from, p.to))]
  const othersDay =
    p.includeOthers && expanded.length > 0
      ? await repo.allocations.dayLoadsForProjects(tx, { userIds, weeks: expanded, excludeProjectId: ctx.id })
      : null
  return assembleGrid({
    project: {
      id: project.id,
      name: project.name,
      certainty: project.certainty,
      archived: access.archived,
      canManage: (access.role === 'MANAGER' || access.role === 'LEAD') && !access.archived,
    },
    tasks,
    milestones,
    lateForMilestone: lateness.byTask,
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
    othersDay,
    p,
    today,
    viewer: user,
  })
}

/** M9-D12 person grid chunk (GET /api/grid/person/[userId], SPEC §7.4, X28/X67/X76): authz.requireVisibleUser (404)
 *  first → per visible non-archived project one `project` row, the person's task + assignee rows, one `masked` row
 *  for the load of every hidden project (numbers only — hidden projects are never queried for task data, R1/R2);
 *  context `{ kind: 'person', canManage: false }` (M9-D29). `includeOthers` is ignored. */
export async function buildPersonChunk(
  tx: DbOrTx,
  user: SessionUser,
  userId: string,
  p: ChunkParams,
  today: ISODate,
): Promise<GridResponse> {
  const { visibleProjects } = await authz.requireVisibleUser(tx, user, userId) // 404 first (X86)
  const [person] = await repo.users.listCalendarPeople(tx, [userId])
  if (!person) throw new NotFoundError()
  const deactivatedOn = (await repo.users.listDeactivatedOn(tx, [userId])).get(userId) ?? null
  const mine = await repo.assignments.listActiveForUserLive(tx, userId) // live, non-archived projects (BR-44)
  const { visible, hidden } = partitionByProject(mine, visibleProjects)
  const projectRows = await repo.projects.listByIds(tx, unique(visible.map((a) => a.projectId)))
  const projects: PersonAssembleInput['projects'][number][] = []
  const taskTrees = new Map<string, TaskListRow[]>()
  const assigneeCounts = new Map<string, number>()
  for (const pr of projectRows) {
    if (pr.archivedAt !== null) continue // BR-44 (listActiveForUserLive already drops them)
    const access = await authz.projectAccess(tx, user, pr.id)
    projects.push({
      id: pr.id,
      name: pr.name,
      color: pr.color,
      certainty: pr.certainty,
      canEdit: access !== null && !access.archived,
    })
    taskTrees.set(pr.id, await repo.tasks.listLiveWithBlockerCounts(tx, pr.id)) // milestoneId live (M8)
    for (const a of await repo.assignments.listActiveForProject(tx, pr.id)) {
      assigneeCounts.set(a.taskId, (assigneeCounts.get(a.taskId) ?? 0) + 1)
    }
  }
  const kept = new Set(projects.map((pr) => pr.id))
  const assignments = visible.filter((a) => kept.has(a.projectId))
  const range = { from: p.from, to: p.to }
  const weeks = weekRange(p.from, p.to)
  const expanded = [...expandedWeeks(p, weeks)]
  const rows = await repo.allocations.listForWeeks(
    tx,
    assignments.map((a) => a.id),
    weeks,
  )
  const totals = await repo.allocations.sumCountedByAssignment(
    tx,
    assignments.map((a) => a.id),
    timelineBound(today),
  )
  const hiddenIds = unique(hidden.map((a) => a.projectId))
  const hiddenLoad =
    hiddenIds.length > 0
      ? await repo.allocations.loadByUserProjectWeek(tx, { userIds: [userId], range, projectIds: hiddenIds })
      : new Map<string, Map<string, Record<ISODate, LoadPair>>>()
  const hiddenWeeks: Record<ISODate, LoadPair> = {}
  for (const byWeek of hiddenLoad.get(userId)?.values() ?? []) {
    for (const [w, v] of Object.entries(byWeek)) hiddenWeeks[w] = addLoad(hiddenWeeks[w] ?? { total: 0, committed: 0 }, v)
  }
  // C39: M7's other-projects day aggregate, restricted to the HIDDEN ids (numbers only)
  const hiddenDays =
    hiddenIds.length > 0 && expanded.length > 0
      ? await repo.allocations.dayLoadsForProjects(tx, { userIds: [userId], weeks: expanded, projectIds: hiddenIds })
      : []
  const cap = await capacity.loadCapacity(tx, [userId], range)
  const leave = await repo.timeOff.listForCalendar(tx, [userId], p.from, p.to)
  const holidays = await holidaysSvc.listHolidaysInRange(tx, range)
  // FR-705 person part (X28, MASK-6): milestones of the visible projects of this person only (never 'ALL')
  const msRows = projects.length > 0 ? await repo.milestones.listForProjects(tx, projects.map((pr) => pr.id)) : []
  const milestones = await milestonesSvc.toDTOs(tx, msRows, today)
  const lateness =
    assignments.length > 0
      ? await milestonesSvc.computeLateness(tx, { boundTaskIds: unique(assignments.map((a) => a.taskId)) })
      : { byTask: new Map<string, boolean>() }
  return assemblePersonGrid({
    person: { id: userId, name: displayName(person), active: person.active, deactivatedOn },
    projects,
    taskTrees,
    assignments,
    assigneeCounts,
    rows,
    totals,
    hiddenWeeks,
    hiddenDays,
    capacity: cap,
    leave,
    holidays,
    milestones,
    lateForMilestone: lateness.byTask,
    p,
    today,
    viewer: user,
  })
}

export interface PersonAssembleInput {
  person: { id: string; name: string; active: boolean; deactivatedOn: ISODate | null }
  /** Visible, non-archived projects in which the person has live assignments. */
  projects: readonly { id: string; name: string; color: string; certainty: Certainty; canEdit: boolean }[]
  taskTrees: ReadonlyMap<string, readonly TaskListRow[]>
  /** The person's live assignments in `projects`. */
  assignments: readonly { id: string; taskId: string; projectId: string; version: number }[]
  /** Task id → its real number of live assignments (every user). */
  assigneeCounts: ReadonlyMap<string, number>
  rows: readonly AllocRow[]
  totals: ReadonlyMap<string, Cd>
  /** Σ counted load of every hidden project per week (W: keys of the masked row). */
  hiddenWeeks: Readonly<Record<ISODate, LoadPair>>
  /** dayLoadsForProjects rows of the hidden projects in expanded weeks (D: keys of the masked row). */
  hiddenDays: readonly DayLoadRow[]
  capacity: ReadonlyMap<string, UserCapacity>
  leave: readonly CalendarTimeOffRow[]
  holidays: readonly { date: ISODate; name: string }[]
  milestones: readonly GridMilestone[]
  lateForMilestone: ReadonlyMap<string, boolean>
  p: ChunkParams
  today: ISODate
  viewer: Pick<SessionUser, 'id' | 'role'>
}

/** Pure (grid-person-assemble.test.ts): the person grid from per-project assembleGrid passes, keeping only the
 *  person's task rows (flattened: depth 0, breadcrumb, projectId) and assignee rows, plus project and masked rows. */
export function assemblePersonGrid(i: PersonAssembleInput): GridResponse {
  const { p } = i
  const weeks = weekRange(p.from, p.to)
  const expanded = expandedWeeks(p, weeks)
  const personList = [i.person]
  const dayWeeks = new Set(i.rows.filter((r) => r.granularity === 'DAY').map((r) => r.weekStart))
  const people = gridPeople({
    people: personList,
    capacity: i.capacity,
    leave: i.leave,
    viewer: i.viewer,
    weeks,
    expanded,
    dayWeeksOf: new Map([[i.person.id, dayWeeks]]),
    others: null,
    othersDay: null,
  })

  const out: GridRow[] = []
  const sortedProjects = [...i.projects].sort((a, b) => compareThai(a.name, b.name) || (a.id < b.id ? -1 : 1))
  for (const pr of sortedProjects) {
    const mine = i.assignments.filter((a) => a.projectId === pr.id)
    if (mine.length === 0) continue
    const tree = i.taskTrees.get(pr.id) ?? []
    const ids = new Set(mine.map((a) => a.id))
    const sub = assembleGrid({
      project: { id: pr.id, name: pr.name, certainty: pr.certainty, archived: !pr.canEdit, canManage: false },
      tasks: tree,
      milestones: [],
      lateForMilestone: i.lateForMilestone,
      assignments: mine.map((a) => ({ id: a.id, taskId: a.taskId, userId: i.person.id, version: a.version })),
      rows: i.rows.filter((r) => ids.has(r.taskAssignmentId)),
      totals: i.totals,
      people: personList,
      capacity: i.capacity,
      leave: [],
      holidays: [],
      others: null,
      p,
      today: i.today,
      viewer: i.viewer,
    })
    const byId = new Map(tree.map((t) => [t.id, t]))
    const breadcrumbOf = (taskId: string): string[] => {
      const names: string[] = []
      let cur = byId.get(taskId)?.parentId ?? null
      while (cur !== null && names.length < 3) {
        const t = byId.get(cur)
        if (!t) break
        names.unshift(t.name)
        cur = t.parentId
      }
      return names
    }
    const projectTotals: Partial<Record<PeriodKey, LoadPair>> = {}
    const body: GridRow[] = []
    for (let k = 0; k < sub.rows.length; k++) {
      const row = sub.rows[k]!
      if (row.kind !== 'task') continue
      const own: GridAssigneeRow[] = []
      for (let j = k + 1; j < sub.rows.length && sub.rows[j]!.kind === 'assignee'; j++) own.push(sub.rows[j] as GridAssigneeRow)
      if (own.length === 0) continue
      const taskRow: GridTaskRow = {
        ...row,
        depth: 0,
        parentId: null,
        hasChildren: false,
        assigneeCount: i.assigneeCounts.get(row.id) ?? own.length,
        projectId: pr.id,
        breadcrumb: breadcrumbOf(row.id),
      }
      for (const [key, v] of Object.entries(row.totals) as [PeriodKey, LoadPair][]) addInto(projectTotals, key, v)
      body.push(taskRow, ...own)
    }
    if (body.length === 0) continue
    out.push({
      kind: 'project',
      id: pr.id,
      name: pr.name,
      color: pr.color,
      certainty: pr.certainty,
      canEdit: pr.canEdit,
      totals: projectTotals,
    })
    out.push(...body)
  }

  // SPEC §7.4 masked row: W: Σ hidden per week + D: hidden day loads of expanded weeks (WEEK rows spread, M7-D27)
  const maskedTotals: Partial<Record<PeriodKey, LoadPair>> = {}
  for (const w of weeks) {
    const v = i.hiddenWeeks[w]
    if (v) addInto(maskedTotals, wk(w), v)
  }
  const spread = spreadDayLoads(i.hiddenDays, (uid, w) => dayCtxFor(people[uid], w))
  Object.assign(maskedTotals, spread.get(i.person.id) ?? {})
  const masked = maskedGridRow(i.person.id, maskedTotals)
  if (masked) out.push(masked)

  const dayRowDates = new Set([
    ...i.rows.filter((r) => r.granularity === 'DAY' && expanded.has(r.weekStart)).map((r) => r.periodStart),
    ...i.hiddenDays.filter((r) => r.granularity === 'DAY' && expanded.has(r.weekStart)).map((r) => r.periodStart),
  ])
  const canEdit = out.some((r) => r.kind === 'assignee' && r.editable)
  return {
    context: {
      kind: 'person',
      id: i.person.id,
      name: i.person.name,
      active: i.person.active,
      deactivatedOn: i.person.deactivatedOn,
      canEdit,
      canManage: false, // M9-D29
    },
    window: { from: p.from, to: p.to, expand: [...p.expand], zoom: p.zoom, includeOthers: false },
    today: i.today,
    periods: buildPeriods(weeks, expanded, {
      scheduledWeekdays: scheduledWeekdays({ capacity: i.capacity, people: personList }),
      dayRowDates,
    }),
    rows: out,
    milestones: [...i.milestones],
    people,
    holidays: i.holidays.map((h) => ({ date: h.date, name: h.name })),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Pure assembly (src/server/services/grid-assemble.test.ts)
// ---------------------------------------------------------------------------------------------------------------

export interface AssembleInput {
  /** canManage = M/L and not archived (M8-D8). */
  project: { id: string; name: string; certainty: Certainty; archived: boolean; canManage: boolean }
  tasks: readonly TaskListRow[]
  /** M8 (X28, M8-D8): every live milestone of the project, sorted by date then id. */
  milestones: readonly GridMilestone[]
  /** M8 (BR-71): task id → late for its live milestone; absent = false. */
  lateForMilestone: ReadonlyMap<string, boolean>
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
  /** M7 includeOthers: repo.allocations.dayLoadsForProjects rows of the expanded weeks (X29, M7-D27); numbers only. */
  othersDay?: readonly DayLoadRow[] | null
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
        if (!countsTowardLoad(weekStart(key.slice(2)), n.completedWeek)) continue // BR-50 per week (M7-D14)
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

/** Weekdays (6/7 matter) on which some footer person is scheduled — from M5's per-day standard (schedule only). */
function scheduledWeekdays(i: Pick<AssembleInput, 'capacity' | 'people'>): Set<Weekday> {
  const out = new Set<Weekday>()
  for (const u of i.people) {
    for (const [d, c] of Object.entries(i.capacity.get(u.id)?.days ?? {})) if (c.standardCd > 0) out.add(isoWeekday(d))
  }
  return out
}

/** FR-806/807, §3.3: `people[u]` of a chunk — W: capacity/standard per week, D: keys for expanded weeks and the
 *  person's DAY weeks (M7-D19), masked leave labels, and (project grid, includeOthers) the X29 other-projects load. */
export function gridPeople(i: {
  people: AssembleInput['people']
  capacity: AssembleInput['capacity']
  leave: AssembleInput['leave']
  viewer: AssembleInput['viewer']
  weeks: readonly ISODate[]
  expanded: ReadonlySet<ISODate>
  dayWeeksOf: ReadonlyMap<string, ReadonlySet<ISODate>>
  others: AssembleInput['others']
  othersDay: readonly DayLoadRow[] | null
}): Record<string, GridPerson> {
  const { weeks, expanded, dayWeeksOf } = i
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
    // M7-D19: D: keys for every day of expanded weeks and of weeks where this person has a DAY cell (zeros omitted)
    const dk = dayKeysFor(cap?.days, new Set([...expanded, ...(dayWeeksOf.get(u.id) ?? [])]))
    Object.assign(capacityCd, dk.capacity)
    Object.assign(standardCd, dk.standard)
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
  // X29 day keys (M7-D27): WEEK rows spread separately for committed and tentative parts; no ids or names
  if (i.others && i.othersDay) {
    const spread = spreadDayLoads(i.othersDay, (userId, w) => dayCtxFor(people[userId], w))
    for (const [userId, loads] of spread) {
      const person = people[userId]
      if (person?.otherProjects) Object.assign(person.otherProjects, loads)
    }
  }

  return people
}

export function assembleGrid(i: AssembleInput): GridResponse {
  const { p } = i
  const canEdit = !i.project.archived // M, L, Me all edit (PERM-12); archived → read-only (X42)
  const weeks = weekRange(p.from, p.to)
  const expanded = expandedWeeks(p, weeks)

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
  // plans per assignment; weeks with DAY plans per user (M7-D19)
  const plansOf = new Map(
    i.assignments.map((a) => [
      a.id,
      repo.allocations.plansFromRows(rowsByAssignment.get(a.id) ?? []).get(a.id) ?? new Map<ISODate, WeekPlan>(),
    ]),
  )
  const dayWeeksOf = new Map<string, Set<ISODate>>()
  for (const a of i.assignments) {
    for (const [w, plan] of plansOf.get(a.id)!) {
      if (plan.resolution !== 'DAY') continue
      const set = dayWeeksOf.get(a.userId) ?? new Set<ISODate>()
      set.add(w)
      dayWeeksOf.set(a.userId, set)
    }
  }

  const people = gridPeople({
    people: i.people,
    capacity: i.capacity,
    leave: i.leave,
    viewer: i.viewer,
    weeks,
    expanded,
    dayWeeksOf,
    others: i.others,
    othersDay: i.othersDay ?? null,
  })

  // assignee cells: W: per week (BR-20/20a, BR-21a fallback flag) + D: per expanded week (BR-20 derived / BR-20a stored)
  const cellsOf = new Map<string, Partial<Record<PeriodKey, AssigneeCell>>>()
  for (const a of i.assignments) {
    const cells: Partial<Record<PeriodKey, AssigneeCell>> = {}
    const cap = i.capacity.get(a.userId)
    for (const [w, plan] of plansOf.get(a.id)!) {
      const cell = weekCellFromPlan(plan, w, cap?.weeks[w]?.capacityCd ?? 0, cap?.weeks[w]?.standardCd ?? 0)
      if (cell) cells[wk(w)] = cell
      if (expanded.has(w)) Object.assign(cells, dayCellsFromPlan(plan, dayCtxFor(people[a.userId], w)))
    }
    cellsOf.set(a.id, cells)
  }

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
      milestoneId: t.milestoneId, // live (LIVE_MILESTONE_ON, X28)
      lateForMilestone: i.lateForMilestone.get(t.id) ?? false,
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

  // M7-D10: Sat/Sun columns when a grid person is scheduled that weekday or a DAY row of this project exists that date
  const dayRowDates = new Set(
    i.rows.filter((r) => r.granularity === 'DAY' && expanded.has(r.weekStart)).map((r) => r.periodStart),
  )

  return {
    context: {
      kind: 'project',
      id: i.project.id,
      name: i.project.name,
      archived: i.project.archived,
      canEdit,
      canManage: i.project.canManage, // M8-D8
    },
    window: { from: p.from, to: p.to, expand: [...p.expand], zoom: p.zoom, includeOthers: p.includeOthers },
    today: i.today,
    periods: buildPeriods(weeks, expanded, { scheduledWeekdays: scheduledWeekdays(i), dayRowDates }),
    rows: out,
    milestones: [...i.milestones], // X28 (M8-D8)
    people,
    holidays: i.holidays.map((h) => ({ date: h.date, name: h.name })),
  }
}
