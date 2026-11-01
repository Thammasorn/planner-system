// src/server/services/allocations.ts — plan writes (SPEC §7.4 saveAllocations, FR-612 planAssignmentRange; X65,
// BR-20b/25/26, M6-D3/D4/D6/D29/D34) and the load figures of BR-52 / FR-406. Writers lock the assignment rows first
// (`ORDER BY ta.id FOR UPDATE OF ta`), authorize per project, check versions, DELETE before INSERT per week, bump
// versions and write one audit row per changed assignment — all in the caller's transaction. `today` is a required
// parameter (X90); these never import clock.ts and never call refresh(). Names marked ★ are reused by M7.
import {
  planRange as domainPlanRange,
  planWeek,
  weekPlanTotal,
  type DayCtx,
  type DayWarning,
  type WeekChange,
  type WeekPlan,
} from '@/domain/allocation'
import { dayCapacityCd, standardDayCd } from '@/domain/capacity'
import { splitLoad } from '@/domain/certainty'
import { futureLoad, releasedLoad } from '@/domain/completed'
import { addDays, addWeeks, compareISO, daysOfWeek, isoWeekday, weekRange, weekStart } from '@/domain/dates'
import type { Cd, Certainty, ISODate, LoadPair } from '@/domain/types'
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'
import { formatThaiDateRange } from '@/lib/format'
import type {
  PlanAssignmentRangeInput,
  PlanAssignmentRangeOk,
  PlanRangePreview,
  SaveAllocationsInput,
  SaveAllocationsItem,
  SaveAllocationsOk,
  SaveItemResult,
  SaveValidationIssue,
  SaveWarning,
  SaveWarningCode,
  WeekState,
} from '@/lib/contracts/grid'
import type { ReleasedLoad } from '@/lib/contracts/tasks'
import * as audit from '../audit'
import * as authz from '../authz'
import type { DbOrTx, Tx } from '../db/types'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import { loadCapacityInputs } from './capacity'
import { timelineBound, TIMELINE_WEEKS_AHEAD } from './timeline'

/** Audit entity of every plan write (M6-D29, X93). */
export const ALLOCATION_AUDIT_ENTITY = 'allocation' as const

export interface LockedAssignment {
  id: string
  version: number
  userId: string
  taskId: string
  projectId: string
  isLeaf: boolean
  completedWeek: ISODate | null
  certainty: Certainty
}

/** taskIds = distinct task ids of the locked assignments, sorted — M8-D12 computes `lateness` from them (C77). */
export interface LockedSet {
  rows: LockedAssignment[]
  ids: string[]
  userIds: string[]
  taskIds: string[]
  byId: Map<string, LockedAssignment>
  userOf(id: string): string
}

const sortedUnique = (xs: readonly string[]): string[] => [...new Set(xs)].sort()

async function selectLocked(
  tx: DbOrTx,
  items: readonly { taskAssignmentId: string }[],
  lock: boolean,
): Promise<LockedSet> {
  const wanted = sortedUnique(items.map((i) => i.taskAssignmentId))
  const found = await repo.assignments.selectForPlan(tx, wanted, { lock })
  if (found.length !== wanted.length) throw new NotFoundError() // whole batch; never reveals which
  const rows: LockedAssignment[] = found.map((r) => ({
    id: r.id,
    version: r.version,
    userId: r.userId,
    taskId: r.taskId,
    projectId: r.projectId,
    isLeaf: !r.hasChildren,
    completedWeek: r.completedWeek,
    certainty: r.certainty,
  }))
  const byId = new Map(rows.map((r) => [r.id, r]))
  return {
    rows,
    ids: rows.map((r) => r.id),
    userIds: sortedUnique(rows.map((r) => r.userId)),
    taskIds: sortedUnique(rows.map((r) => r.taskId)),
    byId,
    userOf(id: string): string {
      const r = byId.get(id)
      if (!r) throw new NotFoundError()
      return r.userId
    },
  }
}

/** ★ Locks the live assignments (ORDER BY ta.id FOR UPDATE OF ta); any requested id missing → NotFoundError. */
export function lockAssignments(tx: Tx, items: readonly { taskAssignmentId: string }[]): Promise<LockedSet> {
  return selectLocked(tx, items, true)
}

/** The same read without a lock (FR-612 dryRun). */
export function peekAssignments(tx: DbOrTx, items: readonly { taskAssignmentId: string }[]): Promise<LockedSet> {
  return selectLocked(tx, items, false)
}

/** ★ Two passes over the distinct projects (sorted): first requireProject(…, 'view') for all — any invisible
 *  project → 404 before any 403 can reveal that a hidden id exists (CLAUDE.md › สิทธิ์, SPEC §3.3); then
 *  requireProject(…, 'edit') — archived → 403; finally non-leaf → 400. */
export async function authorizeItems(tx: Tx, user: SessionUser, locked: LockedSet): Promise<void> {
  const projectIds = sortedUnique(locked.rows.map((r) => r.projectId))
  for (const projectId of projectIds) {
    await authz.requireProject(tx, user, projectId, 'view')
  }
  for (const projectId of projectIds) {
    await authz.requireProject(tx, user, projectId, 'edit')
  }
  if (locked.rows.some((r) => !r.isLeaf)) {
    throw new ValidationError({}, th.grid.toast.readOnlyRow)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Week states, results
// ---------------------------------------------------------------------------------------------------------------

/** WeekPlan → the DTO state of one week (DAY: Σ + the non-zero days). */
export function toWeekState(week: ISODate, plan: WeekPlan): WeekState {
  if (plan.resolution === 'WEEK') return { cd: plan.weekCd, resolution: 'WEEK' }
  if (plan.resolution === 'DAY') {
    const days: Record<ISODate, Cd> = {}
    plan.days.forEach((cd, i) => {
      if (cd > 0) days[addDays(week, i)] = cd
    })
    return { cd: weekPlanTotal(plan), resolution: 'DAY', days }
  }
  return { cd: 0, resolution: null }
}

const NULL_PLAN: WeekPlan = { resolution: null }

async function rowTotals(tx: DbOrTx, locked: LockedSet, ids: readonly string[], today: ISODate): Promise<Map<string, LoadPair>> {
  const sums = await repo.allocations.sumCountedByAssignment(tx, ids, timelineBound(today))
  return new Map(ids.map((id) => [id, splitLoad(sums.get(id) ?? 0, locked.byId.get(id)!.certainty)]))
}

function weeksOf(item: Pick<SaveAllocationsItem, 'changes'>): ISODate[] {
  return [...new Set(item.changes.map((c) => weekStart(c.period)))].sort()
}

/** Stored states (re-read) of the given (assignment, weeks) + rowTotal — VERSION_CONFLICT `current`. */
async function currentResults(
  tx: DbOrTx,
  locked: LockedSet,
  entries: readonly { id: string; weeks: readonly ISODate[] }[],
  today: ISODate,
): Promise<SaveItemResult[]> {
  const ids = entries.map((e) => e.id)
  const allWeeks = [...new Set(entries.flatMap((e) => e.weeks))]
  const plans = repo.allocations.plansFromRows(await repo.allocations.listForWeeks(tx, ids, allWeeks))
  const totals = await rowTotals(tx, locked, ids, today)
  return entries.map((e) => ({
    taskAssignmentId: e.id,
    version: locked.byId.get(e.id)!.version,
    weeks: Object.fromEntries(e.weeks.map((w) => [w, toWeekState(w, plans.get(e.id)?.get(w) ?? NULL_PLAN)])),
    rowTotal: totals.get(e.id)!,
  }))
}

/** ★ Any baseVersion ≠ locked version → ConflictError VERSION_CONFLICT with `current: SaveItemResult[]` (mismatching items). */
export async function assertVersions(
  tx: Tx,
  items: readonly SaveAllocationsItem[],
  locked: LockedSet,
  today: ISODate,
): Promise<void> {
  const stale = items.filter((i) => locked.byId.get(i.taskAssignmentId)?.version !== i.baseVersion)
  if (stale.length === 0) return
  const current = await currentResults(
    tx,
    locked,
    stale.map((i) => ({ id: i.taskAssignmentId, weeks: weeksOf(i) })),
    today,
  )
  throw new ConflictError('VERSION_CONFLICT', th.grid.toast.conflict, { current })
}

// ---------------------------------------------------------------------------------------------------------------
// Week context (S2.6; M7 replaces it with services/day-context.ts#loadDayCtx, M7-D25)
// ---------------------------------------------------------------------------------------------------------------

/** DayCtx per (user, week) from M5's capacity inputs: dayCaps (BR-10…13), schedule (BR-21a), leave flags. */
export async function loadWeekCtx(
  tx: DbOrTx,
  userIds: readonly string[],
  weeks: readonly ISODate[],
): Promise<Map<string, Map<ISODate, DayCtx>>> {
  const out = new Map<string, Map<ISODate, DayCtx>>()
  const sorted = [...new Set(weeks)].sort()
  if (sorted.length === 0 || userIds.length === 0) return out
  const inputs = await loadCapacityInputs(tx, userIds, {
    from: sorted[0]!,
    to: addDays(sorted[sorted.length - 1]!, 7),
  })
  for (const userId of new Set(userIds)) {
    const u = inputs.users.get(userId)
    const spans = u?.timeOff ?? []
    const byWeek = new Map<ISODate, DayCtx>()
    for (const week of sorted) {
      const days = daysOfWeek(week)
      byWeek.set(week, {
        week,
        dayCaps: days.map((d) =>
          u ? dayCapacityCd(u.schedule, inputs.holidays, spans, d, u.deactivatedOn) : 0,
        ),
        schedule: days.map((d) => (u ? standardDayCd(u.schedule, d) : 0)),
        timeOff: days.map((d) => spans.some((s) => compareISO(s.startDate, d) <= 0 && compareISO(d, s.endDate) <= 0)),
      })
    }
    out.set(userId, byWeek)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// save — saveAllocations (X65, M6-D3/D4/D29/D34)
// ---------------------------------------------------------------------------------------------------------------

interface WeekPair {
  assignmentId: string
  week: ISODate
  changes: WeekChange[]
}

interface Planned extends WeekPair {
  before: WeekPlan
  next: WeekPlan
  changed: boolean
  warnings: DayWarning[]
}

/** (assignment, week) → changes in input order; DAY changes carry their weekday index (Mon = 0). */
function groupByWeek(items: readonly SaveAllocationsItem[]): WeekPair[] {
  const out = new Map<string, WeekPair>()
  for (const item of items) {
    for (const c of item.changes) {
      const week = weekStart(c.period)
      const key = `${item.taskAssignmentId}|${week}`
      let pair = out.get(key)
      if (!pair) out.set(key, (pair = { assignmentId: item.taskAssignmentId, week, changes: [] }))
      pair.changes.push(
        c.granularity === 'WEEK'
          ? { granularity: 'WEEK', cd: c.cd }
          : { granularity: 'DAY', dayIndex: isoWeekday(c.period) - 1, cd: c.cd },
      )
    }
  }
  return [...out.values()]
}

const SAVE_WARNING_CODES: ReadonlySet<string> = new Set<SaveWarningCode>([
  'WORK_ON_NON_WORKING_DAY',
  'WEEK_NO_CAPACITY',
  'SPILLED_OVER_DAY_LIMIT',
])

function toSaveWarnings(taskAssignmentId: string, week: ISODate, ws: readonly DayWarning[]): SaveWarning[] {
  return ws.flatMap((w) => {
    if (!SAVE_WARNING_CODES.has(w.code)) return []
    const out: SaveWarning = { code: w.code as SaveWarningCode, taskAssignmentId, week }
    if (w.dayIndex !== undefined) out.date = addDays(week, w.dayIndex)
    return [out]
  })
}

/** Display names of users and task names for audit summaries. */
async function namesFor(tx: DbOrTx, locked: LockedSet): Promise<{ person(id: string): string; task(id: string): string }> {
  const people = new Map((await repo.users.listCalendarPeople(tx, locked.userIds)).map((u) => [u.id, displayName(u)]))
  const tasks = await repo.tasks.namesByIds(tx, locked.taskIds)
  return {
    person: (assignmentId) => {
      const userId = locked.userOf(assignmentId)
      return people.get(userId) ?? userId
    },
    task: (assignmentId) => {
      const taskId = locked.byId.get(assignmentId)!.taskId
      return tasks.get(taskId) ?? taskId
    },
  }
}

export async function save(
  tx: Tx,
  user: SessionUser,
  input: SaveAllocationsInput,
  today: ISODate,
): Promise<SaveAllocationsOk> {
  const locked = await lockAssignments(tx, input.items)
  await authorizeItems(tx, user, locked)
  await assertVersions(tx, input.items, locked, today)

  const pairs = groupByWeek(input.items)
  const weeks = [...new Set(pairs.map((p) => p.week))].sort()
  const current = repo.allocations.plansFromRows(await repo.allocations.listForWeeks(tx, locked.ids, weeks))
  const ctx = await loadWeekCtx(tx, locked.userIds, weeks)

  const issues: SaveValidationIssue[] = []
  const planned: Planned[] = []
  for (const p of pairs) {
    const before = current.get(p.assignmentId)?.get(p.week) ?? NULL_PLAN
    const dayCtx = ctx.get(locked.userOf(p.assignmentId))!.get(p.week)!
    const r = planWeek(before, p.changes, dayCtx, input.onDayWeekConflict)
    if (r.kind === 'invalid') {
      const period = r.dayIndex === undefined ? p.week : addDays(p.week, r.dayIndex)
      issues.push({ taskAssignmentId: p.assignmentId, period, reason: r.reason })
    } else if (r.kind === 'needsChoice') {
      issues.push({ taskAssignmentId: p.assignmentId, period: p.week, reason: 'DAY_WEEK' }) // M6 only (M6-D34)
    } else {
      planned.push({ ...p, before, next: r.next, changed: r.changed, warnings: r.warnings })
    }
  }
  if (issues.length > 0) {
    const dayWeek = issues.some((i) => i.reason === 'DAY_WEEK')
    throw new ValidationError({}, dayWeek ? th.grid.errors.dayWeek : th.grid.errors.invalidBatch, { issues })
  }

  for (const p of planned) {
    if (!p.changed) continue
    await repo.allocations.deleteWeek(tx, p.assignmentId, p.week) // DELETE first (SPEC §6.3)
    await repo.allocations.insertWeekPlan(tx, p.assignmentId, p.week, p.next)
  }
  const changedIds = sortedUnique(planned.filter((p) => p.changed).map((p) => p.assignmentId))
  const versions = await repo.assignments.bumpVersions(tx, changedIds) // no-op items keep their version (M6-D3)

  if (changedIds.length > 0) {
    const names = await namesFor(tx, locked)
    for (const id of changedIds) {
      const mine = planned.filter((p) => p.assignmentId === id && p.changed)
      await audit.log(tx, user, {
        entity: ALLOCATION_AUDIT_ENTITY,
        entityId: id,
        action: 'update',
        projectId: locked.byId.get(id)!.projectId,
        summary: th.audit.allocationsSaved(names.person(id), names.task(id), mine.length),
        before: { weeks: Object.fromEntries(mine.map((p) => [p.week, toWeekState(p.week, p.before)])) },
        after: {
          weeks: Object.fromEntries(mine.map((p) => [p.week, toWeekState(p.week, p.next)])),
          clientOpId: input.clientOpId,
        },
      })
    }
  }

  const itemIds = input.items.map((i) => i.taskAssignmentId)
  const totals = await rowTotals(tx, locked, itemIds, today)
  const nextOf = new Map(planned.map((p) => [`${p.assignmentId}|${p.week}`, p.next]))
  const results: SaveItemResult[] = input.items.map((item) => {
    const id = item.taskAssignmentId
    return {
      taskAssignmentId: id,
      version: versions.get(id) ?? locked.byId.get(id)!.version,
      weeks: Object.fromEntries(
        weeksOf(item).map((w) => [w, toWeekState(w, nextOf.get(`${id}|${w}`) ?? NULL_PLAN)]),
      ),
      rowTotal: totals.get(id)!,
    }
  })
  const warnings = planned.flatMap((p) => toSaveWarnings(p.assignmentId, p.week, p.warnings))
  return { results, warnings }
}

// ---------------------------------------------------------------------------------------------------------------
// planRange — planAssignmentRange (FR-612, BR-25, M6-D6)
// ---------------------------------------------------------------------------------------------------------------

export async function planRange(
  tx: Tx,
  user: SessionUser,
  input: PlanAssignmentRangeInput,
  today: ISODate,
): Promise<PlanAssignmentRangeOk> {
  const id = input.taskAssignmentId
  const locked = input.dryRun ? await peekAssignments(tx, [input]) : await lockAssignments(tx, [input])
  await authorizeItems(tx, user, locked) // edit; archived → 403 even for dryRun
  const weeks = weekRange(weekStart(input.start), addDays(weekStart(input.end), 7))
  if (!input.dryRun) {
    const changes = weeks.map((w) => ({ granularity: 'WEEK' as const, period: w, cd: null }))
    await assertVersions(tx, [{ taskAssignmentId: id, baseVersion: input.baseVersion ?? 0, changes }], locked, today)
  }
  const current = repo.allocations.plansFromRows(await repo.allocations.listForWeeks(tx, [id], weeks)).get(id)
  const userId = locked.userOf(id)
  const ctx = (await loadWeekCtx(tx, [userId], weeks)).get(userId)!
  const r = domainPlanRange(
    input.totalCd,
    input.start,
    input.end,
    weeks.map((w) => ({ week: w, ctx: ctx.get(w)!, current: current?.get(w) ?? NULL_PLAN })),
  )
  if (!r.ok) {
    throw new ValidationError({}, th.plan.errors.unrepresentable, {
      issues: [{ taskAssignmentId: id, period: r.week, reason: 'UNREPRESENTABLE' } satisfies SaveValidationIssue],
    })
  }
  const version = locked.byId.get(id)!.version
  const preview: PlanRangePreview = {
    version,
    weeks: r.weeks.map((w) => ({
      week: w.week,
      kind: w.kind,
      before: toWeekState(w.week, current?.get(w.week) ?? NULL_PLAN),
      after: toWeekState(w.week, w.next),
      capacityCd: w.inRangeCapCd,
    })),
    totalCd: input.totalCd,
    capacityCd: r.capacityCd,
    overCapacityCd: r.overCapacityCd,
    warnings: r.weeks.flatMap((w) => toSaveWarnings(id, w.week, w.warnings)),
  }
  if (input.dryRun) return { preview, applied: null }

  for (const w of r.weeks) {
    if (!w.changed) continue
    await repo.allocations.deleteWeek(tx, id, w.week) // DELETE first (SPEC §6.3)
    await repo.allocations.insertWeekPlan(tx, id, w.week, w.next)
  }
  const versions = await repo.assignments.bumpVersions(tx, [id])
  const names = await namesFor(tx, locked)
  const changed = preview.weeks.filter((w) => r.weeks.find((x) => x.week === w.week)!.changed)
  await audit.log(tx, user, {
    entity: ALLOCATION_AUDIT_ENTITY,
    entityId: id,
    action: 'update',
    projectId: locked.byId.get(id)!.projectId,
    summary: th.audit.planRangeApplied(
      names.person(id),
      names.task(id),
      formatCd(input.totalCd, { unit: 'DAYS', decimals: 2 }) || '0.00',
      formatThaiDateRange(input.start, input.end),
    ),
    before: { weeks: Object.fromEntries(changed.map((w) => [w.week, w.before])) },
    after: {
      weeks: Object.fromEntries(changed.map((w) => [w.week, w.after])),
      totalCd: input.totalCd,
      start: input.start,
      end: input.end,
      clientOpId: input.clientOpId,
    },
  })
  const totals = await rowTotals(tx, locked, [id], today)
  return {
    preview,
    applied: {
      taskAssignmentId: id,
      version: versions.get(id)!,
      weeks: Object.fromEntries(preview.weeks.map((w) => [w.week, w.after])),
      rowTotal: totals.get(id)!,
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// BR-52 / FR-406 figures
// ---------------------------------------------------------------------------------------------------------------

/** FR-406 X (M6-D17): counted future load of the project's live tasks from this week to the timeline bound. */
export async function futureProjectLoad(tx: DbOrTx, projectId: string, today: ISODate): Promise<Cd> {
  const ws = weekStart(today)
  const rows = await repo.allocations.listProjectFuture(tx, projectId, {
    from: ws,
    to: addWeeks(ws, TIMELINE_WEEKS_AHEAD),
  })
  return futureLoad(rows, ws)
}

/** BR-52 (M6-D16): load after this week of the tasks' live assignments; null when 0. */
export async function releasedLoadForTasks(
  tx: DbOrTx,
  taskIds: readonly string[],
  today: ISODate,
): Promise<ReleasedLoad | null> {
  if (taskIds.length === 0) return null
  const ws = weekStart(today)
  const rows = await repo.allocations.listAfterWeek(tx, taskIds, ws, addWeeks(ws, TIMELINE_WEEKS_AHEAD))
  return releasedLoad(rows, ws)
}
