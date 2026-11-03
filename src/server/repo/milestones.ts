// src/server/repo/milestones.ts — the milestones table + the only reads of `tasks.milestone_id` (X87, M8-D5/D6;
// plan/m08 S0.5 signatures, S2.1 bodies). Every read of a task's milestone goes through LIVE_MILESTONE_JOIN /
// LIVE_MILESTONE_ON so soft-deleted milestones read as unbound. Every allocations query here carries a week_start
// range (X65: m.date − 6 … m.date + 1096); no now()/current_date in SQL on plan dates (X52).
import { and, asc, eq, getTableColumns, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import { LATE_LOOKAHEAD_DAYS } from '@/domain/milestone'
import type { ISODate } from '@/domain/types'
import type { MilestoneProgress } from '@/lib/contracts/milestones'
import { type MilestoneDbRow, milestones, projectMembers, projects, tasks } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'

export type { MilestoneDbRow }

/** Raw-SQL join for queries that alias tasks as `t` and milestones as `m`:
 *  `left join milestones m on m.id = t.milestone_id and m.deleted_at is null` — then read `m.id` as the live id. */
export const LIVE_MILESTONE_JOIN: SQL = sql`left join milestones m on m.id = t.milestone_id and m.deleted_at is null`

/** Drizzle-builder twin: `.leftJoin(milestones, LIVE_MILESTONE_ON)` + `milestoneId: milestones.id` (M3's builder
 *  queries use this one). */
export const LIVE_MILESTONE_ON: SQL = and(eq(milestones.id, tasks.milestoneId), isNull(milestones.deletedAt))!

const uuidArray = (ids: readonly string[]): SQL =>
  sql`array[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`

export async function insertMilestone(
  tx: DbOrTx,
  row: {
    projectId: string
    name: string
    date: ISODate
    description?: string | null
    /** M11.1: absent = the DB default PURPLE */
    color?: MilestoneDbRow['color']
    createdBy: string
    completedOn?: ISODate | null
    deletedAt?: Date | null
    deletedBatch?: string | null
  },
): Promise<MilestoneDbRow> {
  const [out] = await tx
    .insert(milestones)
    .values({
      projectId: row.projectId,
      name: row.name,
      date: row.date,
      description: row.description ?? null,
      ...(row.color ? { color: row.color } : {}),
      createdBy: row.createdBy,
      completedOn: row.completedOn ?? null,
      deletedAt: row.deletedAt ?? null,
      deletedBatch: row.deletedBatch ?? null,
    })
    .returning()
  return out!
}

export async function getLive(tx: DbOrTx, id: string): Promise<MilestoneDbRow | null> {
  const [row] = await tx
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, id), isNull(milestones.deletedAt)))
  return row ?? null
}

/** The soft-deleted milestone of a delete batch (owner lookup for restoreMilestoneBatch). */
export async function getByBatch(tx: DbOrTx, batch: string): Promise<MilestoneDbRow | null> {
  const [row] = await tx.select().from(milestones).where(eq(milestones.deletedBatch, batch)).limit(1)
  return row ?? null
}

/** FOR UPDATE. */
export async function lockLive(tx: Tx, id: string): Promise<MilestoneDbRow | null> {
  const [row] = await tx
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, id), isNull(milestones.deletedAt)))
    .for('update')
  return row ?? null
}

/** ORDER BY date, id. */
export async function listLive(tx: DbOrTx, projectId: string): Promise<MilestoneDbRow[]> {
  return tx
    .select()
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
    .orderBy(asc(milestones.date), asc(milestones.id))
}

/** Live milestones of several projects (one query; `/tasks` milestonesByProject). ORDER BY date, id. */
export async function listLiveForProjectIds(tx: DbOrTx, projectIds: readonly string[]): Promise<MilestoneDbRow[]> {
  if (projectIds.length === 0) return []
  return tx
    .select()
    .from(milestones)
    .where(and(inArray(milestones.projectId, [...projectIds]), isNull(milestones.deletedAt)))
    .orderBy(asc(milestones.date), asc(milestones.id))
}

/** Live or soft-deleted (requireMilestone includeDeleted). */
export async function getAnyById(tx: DbOrTx, id: string): Promise<MilestoneDbRow | null> {
  const [row] = await tx.select().from(milestones).where(eq(milestones.id, id))
  return row ?? null
}

/** 'ALL' (manager) = no project filter; M9 passes an array. Archived/deleted projects and deleted milestones are
 *  dropped in SQL. `range` = date ∈ [from, to). ORDER BY date, project name, id. */
export async function listForProjects(
  tx: DbOrTx,
  projectIds: readonly string[] | 'ALL',
  range?: { from: ISODate; to: ISODate },
): Promise<(MilestoneDbRow & { projectName: string; projectColor: string })[]> {
  if (projectIds !== 'ALL' && projectIds.length === 0) return []
  const where: SQL[] = [isNull(milestones.deletedAt)]
  if (projectIds !== 'ALL') where.push(inArray(milestones.projectId, [...projectIds]))
  if (range) where.push(sql`${milestones.date} >= ${range.from}::date and ${milestones.date} < ${range.to}::date`)
  return tx
    .select({ ...getTableColumns(milestones), projectName: projects.name, projectColor: projects.color })
    .from(milestones)
    .innerJoin(
      projects,
      and(eq(projects.id, milestones.projectId), isNull(projects.deletedAt), isNull(projects.archivedAt)),
    )
    .where(and(...where))
    .orderBy(asc(milestones.date), asc(projects.name), asc(milestones.id))
}

export async function update(
  tx: Tx,
  id: string,
  set: Partial<Pick<MilestoneDbRow, 'name' | 'date' | 'description' | 'completedOn' | 'color'>>,
): Promise<MilestoneDbRow> {
  const [row] = await tx
    .update(milestones)
    .set({ ...set, updatedAt: sql`now()` })
    .where(eq(milestones.id, id))
    .returning()
  return row!
}

/** Sets deleted_at / deleted_batch; tasks.milestone_id is NOT touched (M8-D5). */
export async function softDelete(tx: Tx, id: string, batch: string): Promise<void> {
  await tx
    .update(milestones)
    .set({ deletedAt: sql`now()`, deletedBatch: batch, updatedAt: sql`now()` })
    .where(and(eq(milestones.id, id), isNull(milestones.deletedAt)))
}

/** Clears deleted_at / deleted_batch; bound tasks read as bound again (M8-D5). */
export async function restore(tx: Tx, id: string): Promise<MilestoneDbRow> {
  const [row] = await tx
    .update(milestones)
    .set({ deletedAt: null, deletedBatch: null, updatedAt: sql`now()` })
    .where(eq(milestones.id, id))
    .returning()
  return row!
}

/** The soft-deleted row is still inside the 30-day restore window (DB time on timestamptz, M3-D12 pattern). */
export async function withinRestoreWindow(tx: DbOrTx, id: string): Promise<boolean> {
  const [row] = await tx
    .select({ ok: sql<boolean>`(${milestones.deletedAt} > now() - interval '30 days')` })
    .from(milestones)
    .where(eq(milestones.id, id))
  return row?.ok === true
}

/** Live tasks bound to the milestone (raw column). */
export async function countBoundLive(tx: DbOrTx, milestoneId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(tasks)
    .where(and(eq(tasks.milestoneId, milestoneId), isNull(tasks.deletedAt)))
  return row?.n ?? 0
}

/** Live bound tasks at any depth: done (completed) / total (X66). Every id gets an entry ({0, 0} when unbound). */
export async function progress(tx: DbOrTx, milestoneIds: readonly string[]): Promise<Map<string, MilestoneProgress>> {
  const out = new Map<string, MilestoneProgress>()
  if (milestoneIds.length === 0) return out
  const rows = await tx.execute<{ id: string; done: number; total: number }>(sql`
    select m.id, count(t.id) filter (where t.completed_on is not null)::int as done, count(t.id)::int as total
    from milestones m
    left join tasks t on t.milestone_id = m.id and t.deleted_at is null
    where m.id = any(${uuidArray(milestoneIds)})
    group by m.id`)
  for (const r of rows) out.set(r.id, { done: Number(r.done), total: Number(r.total) })
  for (const id of milestoneIds) if (!out.has(id)) out.set(id, { done: 0, total: 0 })
  return out
}

/** One row per (live bound, not-completed task, live milestone); last plan dates over the task and its live,
 *  not-completed descendants (M8-D6), bounded by week_start ∈ [m.date − 6, m.date + 1096]. */
export interface LateFactsRow {
  taskId: string
  milestoneId: string
  milestoneDate: ISODate
  dueDate: ISODate | null
  lastWeekStart: ISODate | null
  lastDayDate: ISODate | null
}

export type LateFactsScope =
  | { projectId: string }
  | { milestoneIds: readonly string[] }
  | { boundTaskIds: readonly string[] }

function scopeSql(scope: LateFactsScope): SQL | null {
  if ('projectId' in scope) return sql`t.project_id = ${scope.projectId}`
  if ('milestoneIds' in scope) {
    return scope.milestoneIds.length === 0 ? null : sql`m.id = any(${uuidArray(scope.milestoneIds)})`
  }
  return scope.boundTaskIds.length === 0 ? null : sql`t.id = any(${uuidArray(scope.boundTaskIds)})`
}

export async function lateFacts(tx: DbOrTx, scope: LateFactsScope): Promise<LateFactsRow[]> {
  const filter = scopeSql(scope)
  if (!filter) return []
  // depth ≤ 2 (BR-30): two explicit descendant levels instead of a recursive CTE. For WEEK rows period_start =
  // week_start, so `period_start > date` is BR-71's `week_start > date`; DAY rows later in the milestone's own week
  // count (X66/X95). The week_start bound keeps the allocations scan on the index (X65).
  // Plan shape (robust to stale statistics): `members` carries the bound row's columns, so `bound` is only read by
  // the three member branches and the allocations are left-joined straight onto `members` — no second reference to
  // `bound` and no join of `bound` against a per-row re-evaluated subquery. The depth-0 branch guarantees one group
  // per bound task.
  const rows = await tx.execute<{
    task_id: string
    milestone_id: string
    milestone_date: string
    due_date: string | null
    last_week_start: string | null
    last_day_date: string | null
  }>(sql`
    with bound as (
      select t.id as task_id, m.id as milestone_id, m.date as milestone_date, t.due_date
      from tasks t join milestones m on m.id = t.milestone_id and m.deleted_at is null
      where t.deleted_at is null and t.completed_on is null and ${filter}
    ), members as (
      select b.task_id, b.milestone_id, b.milestone_date, b.due_date, b.task_id as member_id from bound b
      union all
      select b.task_id, b.milestone_id, b.milestone_date, b.due_date, c.id from bound b
        join tasks c on c.parent_id = b.task_id and c.deleted_at is null and c.completed_on is null
      union all
      select b.task_id, b.milestone_id, b.milestone_date, b.due_date, g.id from bound b
        join tasks c on c.parent_id = b.task_id and c.deleted_at is null
        join tasks g on g.parent_id = c.id and g.deleted_at is null and g.completed_on is null
    )
    select mm.task_id, mm.milestone_id, mm.milestone_date::text as milestone_date, mm.due_date::text as due_date,
           (max(a.week_start) filter (where a.granularity = 'WEEK'))::text as last_week_start,
           (max(a.period_start) filter (where a.granularity = 'DAY'))::text as last_day_date
    from members mm
    left join (task_assignments ta join allocations a on a.task_assignment_id = ta.id)
      on ta.task_id = mm.member_id and ta.deleted_at is null
     and a.week_start >= mm.milestone_date - 6
     and a.week_start <= mm.milestone_date + ${LATE_LOOKAHEAD_DAYS}::int
     and a.period_start > mm.milestone_date
    group by mm.task_id, mm.milestone_id, mm.milestone_date, mm.due_date
    order by mm.task_id`)
  return rows.map((r) => ({
    taskId: r.task_id,
    milestoneId: r.milestone_id,
    milestoneDate: r.milestone_date,
    dueDate: r.due_date,
    lastWeekStart: r.last_week_start,
    lastDayDate: r.last_day_date,
  }))
}

/** Live milestone ids bound (live join) to the given tasks or to their live ancestors (≤ 2 levels) — M8-D12. */
export async function liveMilestoneIdsForTasksOrAncestors(
  tx: DbOrTx,
  taskIds: readonly string[],
): Promise<string[]> {
  if (taskIds.length === 0) return []
  const rows = await tx.execute<{ id: string }>(sql`
    with touched as (
      select t0.id from tasks t0 where t0.id = any(${uuidArray(taskIds)}) and t0.deleted_at is null
      union
      select p1.id from tasks t0 join tasks p1 on p1.id = t0.parent_id and p1.deleted_at is null
        where t0.id = any(${uuidArray(taskIds)}) and t0.deleted_at is null
      union
      select p2.id from tasks t0
        join tasks p1 on p1.id = t0.parent_id and p1.deleted_at is null
        join tasks p2 on p2.id = p1.parent_id and p2.deleted_at is null
        where t0.id = any(${uuidArray(taskIds)}) and t0.deleted_at is null
    )
    select distinct m.id from touched x join tasks t on t.id = x.id ${LIVE_MILESTONE_JOIN}
    where m.id is not null
    order by m.id`)
  return rows.map((r) => r.id)
}

/** Live tasks with their live milestone id (LIVE_MILESTONE_JOIN), locked FOR UPDATE OF t in id order; `raw` is the
 *  stored column (undo of a link restores it exactly, M8-D14). */
export async function lockTaskBindings(
  tx: Tx,
  taskIds: readonly string[],
): Promise<{ id: string; name: string; raw: string | null; live: string | null }[]> {
  if (taskIds.length === 0) return []
  const rows = await tx.execute<{ id: string; name: string; raw: string | null; live: string | null }>(sql`
    select t.id, t.name, t.milestone_id as raw, m.id as live
    from tasks t ${LIVE_MILESTONE_JOIN}
    where t.id = any(${uuidArray(taskIds)}) and t.deleted_at is null
    order by t.id
    for update of t`)
  return [...rows]
}

/** Writes `tasks.milestone_id` for the given tasks (link / revert only). */
export async function setTaskMilestone(tx: Tx, taskIds: readonly string[], milestoneId: string | null): Promise<void> {
  if (taskIds.length === 0) return
  await tx
    .update(tasks)
    .set({ milestoneId, updatedAt: sql`now()` })
    .where(inArray(tasks.id, [...taskIds]))
}

/** Live tasks whose raw milestone_id is one of `milestoneIds` (callers pass live milestone ids, so the binding is
 *  live by construction) — the task half of a save's `lateness` (M8-D12). ORDER BY id. */
export async function liveBoundTaskIds(
  tx: DbOrTx,
  milestoneIds: readonly string[],
): Promise<{ taskId: string; milestoneId: string }[]> {
  if (milestoneIds.length === 0) return []
  const rows = await tx
    .select({ taskId: tasks.id, milestoneId: milestones.id })
    .from(tasks)
    .innerJoin(milestones, LIVE_MILESTONE_ON)
    .where(and(inArray(milestones.id, [...milestoneIds]), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.id))
  return rows
}

/** Non-archived, live projects; `leadUserId` = only those where that user is LEAD (milestone targets, M8-D18). */
export async function targetProjects(
  tx: DbOrTx,
  leadUserId: string | null,
): Promise<{ id: string; name: string; color: string }[]> {
  const live = and(isNull(projects.deletedAt), isNull(projects.archivedAt))
  if (leadUserId === null) {
    return tx.select({ id: projects.id, name: projects.name, color: projects.color }).from(projects).where(live)
  }
  return tx
    .select({ id: projects.id, name: projects.name, color: projects.color })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, leadUserId),
        eq(projectMembers.role, 'LEAD'),
      ),
    )
    .where(live)
}
