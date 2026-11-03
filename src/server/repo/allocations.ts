// src/server/repo/allocations.ts — the only module that touches the `allocations` table (BR-02, M6-D24, r5 M6-20).
// numeric(4,2) ↔ cd happens only here (numericToCd / cdToNumeric). EVERY query carries a `week_start` range (SPEC §6.5);
// SQL sums return integer cd: `(coalesce(sum(a.person_days), 0) * 100)::int` (PLAN §3.6). Writers call deleteWeek
// before insertWeekPlan inside the caller's transaction after locking the assignment row (BR-20b, SPEC §6.3).
// Names marked ★ are reused by M7 (plan/m07 §5.S0.1) — keep signatures and semantics.
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { WeekPlan } from '@/domain/allocation'
import { addDays, compareISO, daysOfWeek, isoWeekday, maxISO, minISO, weekStart } from '@/domain/dates'
import type { Cd, ISODate, LoadPair } from '@/domain/types'
import type { DayLoadRow } from '@/lib/contracts/grid'
import { cdToNumeric, numericToCd } from '@/domain/units'
import { allocations, projects, taskAssignments, tasks } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'

/** [from, to), Mondays — REQUIRED on every list/sum. */
export interface WeekRange {
  from: ISODate
  to: ISODate
}

/** ★ One stored row in cd. */
export interface AllocRow {
  taskAssignmentId: string
  granularity: 'WEEK' | 'DAY'
  periodStart: ISODate
  weekStart: ISODate
  cd: Cd
}

const cdSum = sql<number>`(coalesce(sum(${allocations.personDays}), 0) * 100)::int`.mapWith(Number)

function inWeeks(range: WeekRange): SQL {
  return and(gte(allocations.weekStart, range.from), lt(allocations.weekStart, range.to))!
}

/** BR-50: a row counts while its task is open or its week ≤ the task's completed week. */
const countedSql = or(isNull(tasks.completedWeek), lte(allocations.weekStart, tasks.completedWeek))!

const rowColumns = {
  taskAssignmentId: allocations.taskAssignmentId,
  granularity: allocations.granularity,
  periodStart: allocations.periodStart,
  weekStart: allocations.weekStart,
  personDays: allocations.personDays,
}

function toRow(r: {
  taskAssignmentId: string
  granularity: 'WEEK' | 'DAY'
  periodStart: ISODate
  weekStart: ISODate
  personDays: string
}): AllocRow {
  return {
    taskAssignmentId: r.taskAssignmentId,
    granularity: r.granularity,
    periodStart: r.periodStart,
    weekStart: r.weekStart,
    cd: numericToCd(r.personDays),
  }
}

/** Rows of the live assignments of the project's live tasks in range, by assignment, week, granularity, period. */
export async function listForProject(tx: DbOrTx, projectId: string, range: WeekRange): Promise<AllocRow[]> {
  const rows = await tx
    .select(rowColumns)
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .where(and(eq(tasks.projectId, projectId), inWeeks(range)))
    .orderBy(
      asc(allocations.taskAssignmentId),
      asc(allocations.weekStart),
      asc(allocations.granularity),
      asc(allocations.periodStart),
    )
  return rows.map(toRow)
}

/** ★ Rows of the given assignments in the given weeks (week_start = ANY($weeks) AND between min/max). */
export async function listForWeeks(
  tx: DbOrTx,
  assignmentIds: readonly string[],
  weeks: readonly ISODate[],
): Promise<AllocRow[]> {
  if (assignmentIds.length === 0 || weeks.length === 0) return []
  const lo = weeks.reduce(minISO)
  const hi = weeks.reduce(maxISO)
  const rows = await tx
    .select(rowColumns)
    .from(allocations)
    .where(
      and(
        inArray(allocations.taskAssignmentId, [...assignmentIds]),
        inArray(allocations.weekStart, [...new Set(weeks)]),
        gte(allocations.weekStart, lo),
        lte(allocations.weekStart, hi),
      ),
    )
    .orderBy(
      asc(allocations.taskAssignmentId),
      asc(allocations.weekStart),
      asc(allocations.granularity),
      asc(allocations.periodStart),
    )
  return rows.map(toRow)
}

/** ★ Always first in a rewrite (SPEC §6.3 DELETE before INSERT); returns the number of deleted rows. */
export async function deleteWeek(tx: Tx, assignmentId: string, week: ISODate): Promise<number> {
  const rows = await tx
    .delete(allocations)
    .where(and(eq(allocations.taskAssignmentId, assignmentId), eq(allocations.weekStart, week)))
    .returning({ id: allocations.id })
  return rows.length
}

/** ★ WEEK row or the non-zero DAY rows of the plan (nothing for `resolution: null`). */
export async function insertWeekPlan(tx: Tx, assignmentId: string, week: ISODate, plan: WeekPlan): Promise<void> {
  if (isoWeekday(week) !== 1) throw new RangeError(`week must be a Monday: ${week}`)
  if (plan.resolution === null) return
  if (plan.resolution === 'WEEK') {
    if (plan.weekCd <= 0) return
    await tx.insert(allocations).values({
      taskAssignmentId: assignmentId,
      granularity: 'WEEK',
      periodStart: week,
      weekStart: week,
      personDays: cdToNumeric(plan.weekCd),
    })
    return
  }
  const values = plan.days.flatMap((cd, i) =>
    cd > 0
      ? [
          {
            taskAssignmentId: assignmentId,
            granularity: 'DAY' as const,
            periodStart: addDays(week, i),
            weekStart: week,
            personDays: cdToNumeric(cd),
          },
        ]
      : [],
  )
  if (values.length > 0) await tx.insert(allocations).values(values)
}

/** ★ Pure: rows → assignment → week → plan; mixed granularity in one week → internal error (BR-20b broken). */
export function plansFromRows(rows: readonly AllocRow[]): Map<string, Map<ISODate, WeekPlan>> {
  const out = new Map<string, Map<ISODate, WeekPlan>>()
  for (const r of rows) {
    let weeks = out.get(r.taskAssignmentId)
    if (!weeks) out.set(r.taskAssignmentId, (weeks = new Map<ISODate, WeekPlan>()))
    const cur = weeks.get(r.weekStart)
    if (r.granularity === 'WEEK') {
      if (cur) throw new Error(`allocations: mixed or duplicate rows in one week (${r.weekStart})`)
      weeks.set(r.weekStart, { resolution: 'WEEK', weekCd: r.cd })
      continue
    }
    if (cur && cur.resolution !== 'DAY') throw new Error(`allocations: mixed rows in one week (${r.weekStart})`)
    const days = cur?.resolution === 'DAY' ? [...cur.days] : [0, 0, 0, 0, 0, 0, 0]
    const index = daysOfWeek(r.weekStart).indexOf(r.periodStart)
    if (index < 0) throw new Error(`allocations: DAY row outside its week (${r.periodStart})`)
    days[index] = r.cd
    weeks.set(r.weekStart, { resolution: 'DAY', days })
  }
  return out
}

/** Counted rowTotal per assignment (BR-50) over a range; certainty applied by the caller. Absent = 0. */
export async function sumCountedByAssignment(
  tx: DbOrTx,
  assignmentIds: readonly string[],
  range: WeekRange,
): Promise<Map<string, Cd>> {
  if (assignmentIds.length === 0) return new Map()
  const rows = await tx
    .select({ id: allocations.taskAssignmentId, cd: cdSum })
    .from(allocations)
    .innerJoin(taskAssignments, eq(taskAssignments.id, allocations.taskAssignmentId))
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .where(and(inArray(allocations.taskAssignmentId, [...assignmentIds]), inWeeks(range), countedSql))
    .groupBy(allocations.taskAssignmentId)
  return new Map(rows.map((r) => [r.id, r.cd]))
}

/**
 * §6.5 builder (M6-D24, X03, BR-44): live assignment/task, project not deleted and not archived, BR-50, effective
 * certainty `coalesce(t, parent, grandparent, project)`. `excludeProjectId` (footer switch, X29) / `projectId` narrow it.
 * Users without plans are absent; weeks without plans are absent.
 */
export async function loadByUserWeek(
  tx: DbOrTx,
  o: { userIds: readonly string[]; range: WeekRange; excludeProjectId?: string; projectId?: string },
): Promise<Map<string, Record<ISODate, LoadPair>>> {
  const out = new Map<string, Record<ISODate, LoadPair>>()
  if (o.userIds.length === 0 || compareISO(o.range.from, o.range.to) >= 0) return out
  const p1 = alias(tasks, 'p1')
  const p2 = alias(tasks, 'p2')
  const effective = sql`coalesce(${tasks.certaintyOverride}, ${p1.certaintyOverride}, ${p2.certaintyOverride}, ${projects.certainty})`
  const rows = await tx
    .select({
      userId: taskAssignments.userId,
      weekStart: allocations.weekStart,
      total: cdSum,
      committed:
        sql<number>`(coalesce(sum(${allocations.personDays}) filter (where ${effective} = 'CONFIRMED'), 0) * 100)::int`.mapWith(
          Number,
        ),
    })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .leftJoin(p1, eq(p1.id, tasks.parentId))
    .leftJoin(p2, eq(p2.id, p1.parentId))
    .innerJoin(
      projects,
      and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .where(
      and(
        inWeeks(o.range),
        countedSql,
        inArray(taskAssignments.userId, [...o.userIds]),
        o.excludeProjectId === undefined ? undefined : ne(projects.id, o.excludeProjectId),
        o.projectId === undefined ? undefined : eq(projects.id, o.projectId),
      ),
    )
    .groupBy(taskAssignments.userId, allocations.weekStart)
  for (const r of rows) {
    let weeks = out.get(r.userId)
    if (!weeks) out.set(r.userId, (weeks = {}))
    weeks[r.weekStart] = { total: r.total, committed: r.committed }
  }
  return out
}

/**
 * M7 (S2.1, C39, M7-D27; M9 reuses it): §6.5 filters exactly as loadByUserWeek (live assignment + task, project not
 * deleted and not archived (BR-44), BR-50 per task, effective certainty coalesce(t, parent, grandparent, project)),
 * restricted to `week_start = ANY($weeks)` (+ min/max bounds); grouped by (user_id, week_start, granularity,
 * period_start). excludeProjectId → other projects of the grid people (X29); projectIds → only those projects (M9).
 * WEEK rows have periodStart = weekStart. `weeks` or `userIds` empty → [] without a query.
 */
export async function dayLoadsForProjects(
  tx: DbOrTx,
  o: { userIds: readonly string[]; weeks: readonly ISODate[]; excludeProjectId?: string; projectIds?: readonly string[] },
): Promise<DayLoadRow[]> {
  if (o.userIds.length === 0 || o.weeks.length === 0) return []
  if (o.projectIds !== undefined && o.projectIds.length === 0) return []
  const weeks = [...new Set(o.weeks)]
  const p1 = alias(tasks, 'p1')
  const p2 = alias(tasks, 'p2')
  const effective = sql`coalesce(${tasks.certaintyOverride}, ${p1.certaintyOverride}, ${p2.certaintyOverride}, ${projects.certainty})`
  const rows = await tx
    .select({
      userId: taskAssignments.userId,
      weekStart: allocations.weekStart,
      granularity: allocations.granularity,
      periodStart: allocations.periodStart,
      totalCd: cdSum,
      committedCd:
        sql<number>`(coalesce(sum(${allocations.personDays}) filter (where ${effective} = 'CONFIRMED'), 0) * 100)::int`.mapWith(
          Number,
        ),
    })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .leftJoin(p1, eq(p1.id, tasks.parentId))
    .leftJoin(p2, eq(p2.id, p1.parentId))
    .innerJoin(
      projects,
      and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .where(
      and(
        inArray(allocations.weekStart, weeks),
        gte(allocations.weekStart, weeks.reduce(minISO)),
        lte(allocations.weekStart, weeks.reduce(maxISO)),
        countedSql,
        inArray(taskAssignments.userId, [...o.userIds]),
        o.excludeProjectId === undefined ? undefined : ne(projects.id, o.excludeProjectId),
        o.projectIds === undefined ? undefined : inArray(projects.id, [...o.projectIds]),
      ),
    )
    .groupBy(taskAssignments.userId, allocations.weekStart, allocations.granularity, allocations.periodStart)
    .orderBy(
      asc(taskAssignments.userId),
      asc(allocations.weekStart),
      asc(allocations.granularity),
      asc(allocations.periodStart),
    )
  return rows.filter((r) => r.totalCd > 0 || r.committedCd > 0)
}

/** Rows (weekStart, cd) of the live assignments of `taskIds` in (afterWeek, bound) — BR-52; one row per week. */
export async function listAfterWeek(
  tx: DbOrTx,
  taskIds: readonly string[],
  afterWeek: ISODate,
  bound: ISODate,
): Promise<{ weekStart: ISODate; cd: Cd }[]> {
  if (taskIds.length === 0) return []
  return tx
    .select({ weekStart: allocations.weekStart, cd: cdSum })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .where(
      and(
        inArray(taskAssignments.taskId, [...taskIds]),
        gt(allocations.weekStart, afterWeek),
        lt(allocations.weekStart, bound),
      ),
    )
    .groupBy(allocations.weekStart)
    .orderBy(asc(allocations.weekStart))
}

/** Rows of a project's live tasks/assignments in range with each task's completed_week — FR-406. */
export async function listProjectFuture(
  tx: DbOrTx,
  projectId: string,
  range: WeekRange,
): Promise<{ weekStart: ISODate; cd: Cd; completedWeek: ISODate | null }[]> {
  return tx
    .select({ weekStart: allocations.weekStart, cd: cdSum, completedWeek: tasks.completedWeek })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .where(and(eq(tasks.projectId, projectId), inWeeks(range)))
    .groupBy(allocations.weekStart, tasks.completedWeek)
    .orderBy(asc(allocations.weekStart))
}

// ── M9 (plan/m09 S0.6/S2.1/S2.8/S2.9, M9-D17/D18/D27) ──

/** §6.5 grouped by (user, project, week) — M9-D27: live assignment + task, project not deleted and not archived
 *  (BR-44), BR-50, effective certainty coalesce(t, parent, grandparent, project); integer cd. `projectIds` narrows.
 *  Users / projects / weeks without counted load are absent. Statuses (FR-628/BR-87) and milestones (BR-72) never
 *  enter; unassigned tasks have no rows (BR-43). */
export async function loadByUserProjectWeek(
  tx: DbOrTx,
  o: { userIds: readonly string[]; range: WeekRange; projectIds?: readonly string[] },
): Promise<Map<string /* userId */, Map<string /* projectId */, Record<ISODate, LoadPair>>>> {
  const out = new Map<string, Map<string, Record<ISODate, LoadPair>>>()
  if (o.userIds.length === 0 || compareISO(o.range.from, o.range.to) >= 0) return out
  if (o.projectIds !== undefined && o.projectIds.length === 0) return out
  const p1 = alias(tasks, 'p1')
  const p2 = alias(tasks, 'p2')
  const effective = sql`coalesce(${tasks.certaintyOverride}, ${p1.certaintyOverride}, ${p2.certaintyOverride}, ${projects.certainty})`
  const rows = await tx
    .select({
      userId: taskAssignments.userId,
      projectId: tasks.projectId,
      weekStart: allocations.weekStart,
      total: cdSum,
      committed:
        sql<number>`(coalesce(sum(${allocations.personDays}) filter (where ${effective} = 'CONFIRMED'), 0) * 100)::int`.mapWith(
          Number,
        ),
    })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .leftJoin(p1, eq(p1.id, tasks.parentId))
    .leftJoin(p2, eq(p2.id, p1.parentId))
    .innerJoin(
      projects,
      and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .where(
      and(
        inWeeks(o.range),
        countedSql,
        inArray(taskAssignments.userId, [...new Set(o.userIds)]),
        o.projectIds === undefined ? undefined : inArray(tasks.projectId, [...new Set(o.projectIds)]),
      ),
    )
    .groupBy(taskAssignments.userId, tasks.projectId, allocations.weekStart)
  for (const r of rows) {
    if (r.total === 0 && r.committed === 0) continue
    let byProject = out.get(r.userId)
    if (!byProject) out.set(r.userId, (byProject = new Map<string, Record<ISODate, LoadPair>>()))
    let weeks = byProject.get(r.projectId)
    if (!weeks) byProject.set(r.projectId, (weeks = {}))
    weeks[r.weekStart] = { total: r.total, committed: r.committed }
  }
  return out
}

/** Σ DAY rows per date of one user on [from, toInclusive] (FR-906 onTimeOffDays, M7-D15), bounded by week_start;
 *  same live / non-archived / BR-50 filters as §6.5. Dates without DAY load are absent; ascending. */
export async function sumDayRowsByDate(
  tx: DbOrTx,
  userId: string,
  from: ISODate,
  toInclusive: ISODate,
): Promise<{ date: ISODate; cd: Cd }[]> {
  if (compareISO(from, toInclusive) > 0) return []
  const rows = await tx
    .select({ date: allocations.periodStart, cd: cdSum })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
    .innerJoin(
      projects,
      and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .where(
      and(
        eq(allocations.granularity, 'DAY'),
        gte(allocations.weekStart, weekStart(from)),
        lte(allocations.weekStart, weekStart(toInclusive)),
        gte(allocations.periodStart, from),
        lte(allocations.periodStart, toInclusive),
        eq(taskAssignments.userId, userId),
        countedSql,
      ),
    )
    .groupBy(allocations.periodStart)
    .orderBy(asc(allocations.periodStart))
  return rows.filter((r) => r.cd > 0)
}

/** FR-1009 (M9-D17): per assignment, the earliest week in `range` whose Σ cd > 0 and that week's cd. Assignments
 *  without such a week are absent. Callers pass open tasks only (BR-50 has no effect on them). */
export async function firstPlannedWeekByAssignment(
  tx: DbOrTx,
  assignmentIds: readonly string[],
  range: WeekRange,
): Promise<Map<string, { week: ISODate; cd: Cd }>> {
  if (assignmentIds.length === 0 || compareISO(range.from, range.to) >= 0) return new Map()
  const rows = await tx
    .selectDistinctOn([allocations.taskAssignmentId], {
      id: allocations.taskAssignmentId,
      week: allocations.weekStart,
      cd: cdSum,
    })
    .from(allocations)
    .where(and(inArray(allocations.taskAssignmentId, [...new Set(assignmentIds)]), inWeeks(range)))
    .groupBy(allocations.taskAssignmentId, allocations.weekStart)
    .having(sql`sum(${allocations.personDays}) > 0`)
    .orderBy(asc(allocations.taskAssignmentId), asc(allocations.weekStart))
  return new Map(rows.map((r) => [r.id, { week: r.week, cd: r.cd }]))
}

// ── v3.6 project calendar from the plan (SPEC FR-812, BR-103a) ──

/** One live assignment's first / last week with counted load in a range (FR-812, BR-103a). */
export interface PlannedWeekBounds {
  assignmentId: string
  taskId: string
  userId: string
  first: ISODate
  last: ISODate
}

/** Per live assignment of the project's live tasks: the first and last week in `range` with counted load (BR-50;
 *  person_days > 0 is a table check). The project may be archived (the project calendar reads archived projects).
 *  Assignments without load in range are absent. One grouped scan bounded by week_start (§6.5). */
export async function plannedWeekBoundsForProject(
  tx: DbOrTx,
  projectId: string,
  range: WeekRange,
): Promise<PlannedWeekBounds[]> {
  return plannedWeekBounds(tx, eq(tasks.projectId, projectId), range, false)
}

/** M11.4 (FR-669): the same bounds for the live tasks of `projectIds` (or every project for 'ALL') whose project is
 *  neither archived nor deleted — the /api/tasks project set. An empty id list → []. */
export async function plannedWeekBoundsForProjects(
  tx: DbOrTx,
  projectIds: readonly string[] | 'ALL',
  range: WeekRange,
): Promise<PlannedWeekBounds[]> {
  if (projectIds !== 'ALL' && projectIds.length === 0) return []
  return plannedWeekBounds(
    tx,
    projectIds === 'ALL' ? undefined : inArray(tasks.projectId, [...new Set(projectIds)]),
    range,
    true,
  )
}

async function plannedWeekBounds(
  tx: DbOrTx,
  scope: SQL | undefined,
  range: WeekRange,
  activeProjectsOnly: boolean,
): Promise<PlannedWeekBounds[]> {
  if (compareISO(range.from, range.to) >= 0) return []
  const base = tx
    .select({
      assignmentId: taskAssignments.id,
      taskId: taskAssignments.taskId,
      userId: taskAssignments.userId,
      first: sql<ISODate>`min(${allocations.weekStart})::text`,
      last: sql<ISODate>`max(${allocations.weekStart})::text`,
    })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, and(eq(tasks.id, taskAssignments.taskId), isNull(tasks.deletedAt)))
  const scoped = activeProjectsOnly
    ? base.innerJoin(
        projects,
        and(eq(projects.id, tasks.projectId), isNull(projects.archivedAt), isNull(projects.deletedAt)),
      )
    : base
  return scoped
    .where(and(scope, inWeeks(range), countedSql))
    .groupBy(taskAssignments.id, taskAssignments.taskId, taskAssignments.userId)
    .orderBy(asc(taskAssignments.id))
}

/** M11.4 (FR-668, the ตาราง "ภาระ" column): Σ counted load (BR-50) per task over its OWN live assignments in `range`
 *  (a parent never sums its children). One grouped query; tasks without counted load are absent (= 0). */
export async function sumCountedByTask(
  tx: DbOrTx,
  taskIds: readonly string[],
  range: WeekRange,
): Promise<Map<string, Cd>> {
  if (taskIds.length === 0 || compareISO(range.from, range.to) >= 0) return new Map()
  const rows = await tx
    .select({ id: taskAssignments.taskId, cd: cdSum })
    .from(allocations)
    .innerJoin(
      taskAssignments,
      and(eq(taskAssignments.id, allocations.taskAssignmentId), isNull(taskAssignments.deletedAt)),
    )
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .where(and(inArray(taskAssignments.taskId, [...new Set(taskIds)]), inWeeks(range), countedSql))
    .groupBy(taskAssignments.taskId)
  return new Map(rows.map((r) => [r.id, r.cd]))
}
