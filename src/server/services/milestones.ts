// src/server/services/milestones.ts — milestones (SPEC §4.7, §5.9, §7.5; plan/m08 S0.5 signatures, S2.2 bodies,
// M8-D3…D7, D12, D16, D19, D25). Write services are data only: the ACTION has already authorised and writes the audit
// rows afterwards in the same tx. Read services that apply visibility (listVisibleMilestones, listTargets) call
// authz.visibleProjectIds / projectAccess themselves. Services take `today` explicitly (X90) and import no clock.
import { randomUUID } from 'node:crypto'
import { compareISO } from '@/domain/dates'
import { compareMilestones, isLateForMilestone, milestoneLateness, milestoneStatus } from '@/domain/milestone'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { compareThai } from '@/lib/collate'
import type {
  CalendarMilestone,
  CreateMilestoneResult,
  DeleteMilestoneResult,
  LinkTasksResult,
  MilestoneChangeKey,
  MilestoneDTO,
  MilestoneLateness,
  MilestoneRef,
  MilestoneTargetsResponse,
  ProjectMilestonesResponse,
  RestoreMilestoneBatchResult,
  RevertTaskMilestonesResult,
  UpdateMilestoneResult,
} from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import type {
  createMilestoneSchema,
  linkTasksToMilestoneSchema,
  revertTaskMilestonesSchema,
  updateMilestoneSchema,
} from '@/lib/schemas/milestones'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { MilestoneDbRow } from '../db/schema'
import type { DbOrTx, Tx } from '../db/types'
import { NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { LateFactsRow, LateFactsScope } from '../repo/milestones'
import type { SessionUser } from '../session'

export const MILESTONE_AUDIT_ENTITY = 'milestone' as const

const validation = (field: string, message: string): ValidationError =>
  new ValidationError({ [field]: [message] }, message)

export interface Lateness {
  byTask: Map<string, boolean>
  byMilestone: Map<string, { late: boolean; lateTaskCount: number }>
}

const factsOf = (r: LateFactsRow) => ({
  completed: false, // lateFacts only returns not-completed bound tasks (BR-50 / BR-71)
  dueDate: r.dueDate,
  lastWeekStart: r.lastWeekStart,
  lastDayDate: r.lastDayDate,
})

/** BR-71 (M8-D6) over one bounded query: per bound task and per milestone. Milestones asked for by id without late
 *  tasks get `{ late: false, lateTaskCount: 0 }`. */
export async function computeLateness(tx: DbOrTx, scope: LateFactsScope): Promise<Lateness> {
  const rows = await repo.milestones.lateFacts(tx, scope)
  const byTask = new Map<string, boolean>()
  const grouped = new Map<string, { date: ISODate; facts: ReturnType<typeof factsOf>[] }>()
  for (const r of rows) {
    byTask.set(r.taskId, isLateForMilestone(r.milestoneDate, factsOf(r)))
    const g = grouped.get(r.milestoneId) ?? { date: r.milestoneDate, facts: [] }
    g.facts.push(factsOf(r))
    grouped.set(r.milestoneId, g)
  }
  const byMilestone = new Map<string, { late: boolean; lateTaskCount: number }>()
  for (const [id, g] of grouped) byMilestone.set(id, milestoneLateness(g.date, g.facts))
  if ('milestoneIds' in scope) {
    for (const id of scope.milestoneIds) if (!byMilestone.has(id)) byMilestone.set(id, { late: false, lateTaskCount: 0 })
  }
  return { byTask, byMilestone }
}

/** M8-D12: lateness for the milestones bound to the touched tasks or their ancestors; null when none. */
export async function latenessForTouchedTasks(
  tx: DbOrTx,
  taskIds: readonly string[],
): Promise<MilestoneLateness | null> {
  const ids = await repo.milestones.liveMilestoneIdsForTasksOrAncestors(tx, taskIds)
  if (ids.length === 0) return null
  const lat = await computeLateness(tx, { milestoneIds: ids })
  const bound = await repo.milestones.liveBoundTaskIds(tx, ids)
  return {
    tasks: bound.map((b) => ({ taskId: b.taskId, lateForMilestone: lat.byTask.get(b.taskId) ?? false })),
    milestones: ids.map((id) => ({ id, ...(lat.byMilestone.get(id) ?? { late: false, lateTaskCount: 0 }) })),
  }
}

export function toRef(row: MilestoneDbRow): MilestoneRef {
  return { id: row.id, name: row.name, date: row.date, completedOn: row.completedOn }
}

/** `lateness` may be passed when the caller already computed it for a scope covering every row (the grid computes
 *  the project scope once — milestones and bound tasks share the project, X66). */
export async function toDTOs(
  tx: DbOrTx,
  rows: readonly MilestoneDbRow[],
  today: ISODate,
  lateness?: Lateness,
): Promise<MilestoneDTO[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const progress = await repo.milestones.progress(tx, ids)
  const lat = lateness ?? (await computeLateness(tx, { milestoneIds: ids }))
  return rows
    .map(
      (r): MilestoneDTO => ({
        ...toRef(r),
        projectId: r.projectId,
        description: r.description,
        status: milestoneStatus(r, today),
        late: lat.byMilestone.get(r.id)?.late ?? false,
        lateTaskCount: lat.byMilestone.get(r.id)?.lateTaskCount ?? 0,
        progress: progress.get(r.id) ?? { done: 0, total: 0 },
      }),
    )
    .sort(compareMilestones)
}

async function toDTO(tx: DbOrTx, row: MilestoneDbRow, today: ISODate): Promise<MilestoneDTO> {
  const [dto] = await toDTOs(tx, [row], today)
  return dto!
}

/** The route calls authz.requireProject(…, 'view') first. */
export async function listProjectMilestones(
  tx: DbOrTx,
  user: SessionUser,
  projectId: string,
  today: ISODate,
): Promise<ProjectMilestonesResponse> {
  const access = await authz.projectAccess(tx, user, projectId)
  if (!access) throw new NotFoundError()
  const rows = await repo.milestones.listLive(tx, projectId)
  return {
    projectId,
    today,
    canManage: (access.role === 'MANAGER' || access.role === 'LEAD') && !access.archived,
    milestones: await toDTOs(tx, rows, today),
  }
}

/** Manager: non-archived projects; worker: projects where LEAD (M8-D18). */
export async function listTargets(tx: DbOrTx, user: SessionUser): Promise<MilestoneTargetsResponse> {
  authz.requireUser(user)
  const rows = await repo.milestones.targetProjects(tx, authz.isManager(user) ? null : user.id)
  return { projects: [...rows].sort((a, b) => compareThai(a.name, b.name) || (a.id < b.id ? -1 : 1)) }
}

/** ★ M10 home reuses it. Visible, non-archived projects; date ∈ [from, to) (M8-D16). No description, no task data. */
export async function listVisibleMilestones(
  tx: DbOrTx,
  user: SessionUser,
  range: { from: ISODate; to: ISODate },
  today: ISODate,
): Promise<CalendarMilestone[]> {
  const vis = await authz.visibleProjectIds(tx, user)
  if (vis !== 'ALL' && vis.size === 0) return []
  const rows = await repo.milestones.listForProjects(tx, vis === 'ALL' ? 'ALL' : [...vis], range)
  if (rows.length === 0) return []
  const lat = await computeLateness(tx, { milestoneIds: rows.map((r) => r.id) })
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectName: r.projectName,
    projectColor: r.projectColor,
    name: r.name,
    date: r.date,
    status: milestoneStatus(r, today),
    late: lat.byMilestone.get(r.id)?.late ?? false,
  }))
}

// Write services: data only — the ACTION has already authorised (M8-D25) and writes the audit rows afterwards.

export async function create(
  tx: Tx,
  user: SessionUser,
  input: z.output<typeof createMilestoneSchema>,
  today: ISODate,
): Promise<CreateMilestoneResult> {
  const row = await repo.milestones.insertMilestone(tx, {
    projectId: input.projectId,
    name: input.name,
    date: input.date,
    description: input.description ?? null,
    createdBy: user.id,
  })
  return { milestone: await toDTO(tx, row, today) }
}

export async function update(
  tx: Tx,
  _user: SessionUser,
  input: z.output<typeof updateMilestoneSchema>,
  today: ISODate,
): Promise<UpdateMilestoneResult> {
  const row = await repo.milestones.lockLive(tx, input.milestoneId)
  if (!row) throw new NotFoundError()
  const p = input.patch
  const set: Parameters<typeof repo.milestones.update>[2] = {}
  const changed: MilestoneChangeKey[] = []
  if (p.name !== undefined && p.name !== row.name) {
    set.name = p.name
    changed.push('name')
  }
  if (p.date !== undefined && p.date !== row.date) {
    set.date = p.date
    changed.push('date')
  }
  if (p.description !== undefined && p.description !== row.description) {
    set.description = p.description
    changed.push('description')
  }
  let completedOn: ISODate | null | undefined
  if (p.completed !== undefined) completedOn = p.completed ? (row.completedOn ?? today) : null
  if (p.completedOn !== undefined) {
    if (p.completedOn !== null && compareISO(p.completedOn, today) > 0) {
      throw validation('completedOn', th.milestones.errors.completedInFuture)
    }
    completedOn = p.completedOn
  }
  if (completedOn !== undefined && completedOn !== row.completedOn) {
    set.completedOn = completedOn
    changed.push('completed')
  }
  const previous = {
    name: row.name,
    date: row.date,
    description: row.description,
    completed: row.completedOn !== null,
    completedOn: row.completedOn,
  }
  const next = changed.length > 0 ? await repo.milestones.update(tx, row.id, set) : row
  return { milestone: await toDTO(tx, next, today), previous, changed }
}

export async function remove(tx: Tx, _user: SessionUser, milestoneId: string): Promise<DeleteMilestoneResult> {
  const row = await repo.milestones.lockLive(tx, milestoneId)
  if (!row) throw new NotFoundError()
  const batch = randomUUID()
  const unlinkedTaskCount = await repo.milestones.countBoundLive(tx, row.id)
  await repo.milestones.softDelete(tx, row.id, batch) // task bindings are not touched (M8-D5)
  return { projectId: row.projectId, milestoneId: row.id, name: row.name, batch, unlinkedTaskCount }
}

/** `row` = the authorised soft-deleted milestone; 30-day window (VALIDATION restoreExpired). */
export async function restoreBatch(
  tx: Tx,
  _user: SessionUser,
  row: MilestoneDbRow,
  today: ISODate,
): Promise<RestoreMilestoneBatchResult> {
  if (row.deletedAt === null) throw new NotFoundError()
  if (!(await repo.milestones.withinRestoreWindow(tx, row.id))) {
    throw validation('batch', th.milestones.errors.restoreExpired)
  }
  const restored = await repo.milestones.restore(tx, row.id) // bound tasks read as bound again (no write to tasks)
  return { milestone: await toDTO(tx, restored, today) }
}

/** Tasks whose LIVE value already equals the target are skipped; `previousMilestoneId` is the RAW column (M8-D14).
 *  The action has checked the tasks (edit), the milestone (view) and the same-project rule (X66). */
export async function linkTasks(
  tx: Tx,
  _user: SessionUser,
  input: z.output<typeof linkTasksToMilestoneSchema> & { projectId: string },
): Promise<LinkTasksResult> {
  const milestone = input.milestoneId ? await repo.milestones.getLive(tx, input.milestoneId) : null
  if (input.milestoneId && (!milestone || milestone.projectId !== input.projectId)) throw new NotFoundError()
  const rows = await repo.milestones.lockTaskBindings(tx, input.taskIds)
  const changed = rows
    .filter((r) => r.live !== input.milestoneId)
    .map((r) => ({ taskId: r.id, taskName: r.name, previousMilestoneId: r.raw }))
  await repo.milestones.setTaskMilestone(
    tx,
    changed.map((c) => c.taskId),
    input.milestoneId,
  )
  return {
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    milestoneName: milestone?.name ?? null,
    changed,
  }
}

/** Writes exactly the given raw values (a deleted milestone's id comes back); returns the inverse with task names. */
export async function revertLinks(
  tx: Tx,
  _user: SessionUser,
  input: z.output<typeof revertTaskMilestonesSchema> & { projectId: string },
): Promise<RevertTaskMilestonesResult> {
  const rows = await repo.milestones.lockTaskBindings(
    tx,
    input.items.map((i) => i.taskId),
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  const changed: RevertTaskMilestonesResult['changed'] = []
  const groups = new Map<string | null, string[]>()
  for (const item of input.items) {
    const row = byId.get(item.taskId)
    if (!row) throw new NotFoundError()
    changed.push({ taskId: row.id, taskName: row.name, previousMilestoneId: row.raw })
    groups.set(item.milestoneId, [...(groups.get(item.milestoneId) ?? []), row.id])
  }
  for (const [milestoneId, ids] of groups) await repo.milestones.setTaskMilestone(tx, ids, milestoneId)
  return { projectId: input.projectId, changed }
}

/** Pure: audit summary of an update (only date → milestoneMoved; only completion → milestoneCompleted/Reopened; else
 *  milestoneUpdated). */
export function milestoneUpdateSummary(r: UpdateMilestoneResult): string {
  const name = r.milestone.name
  if (r.changed.length === 1 && r.changed[0] === 'date') {
    return th.audit.milestoneMoved(name, formatThaiDate(r.previous.date), formatThaiDate(r.milestone.date))
  }
  if (r.changed.length === 1 && r.changed[0] === 'completed') {
    return r.milestone.completedOn !== null ? th.audit.milestoneCompleted(name) : th.audit.milestoneReopened(name)
  }
  return th.audit.milestoneUpdated(name)
}

/** Pure: { before, after } with only the changed fields ('completed' is written as completedOn). */
export function milestoneAuditDiff(r: UpdateMilestoneResult): {
  before: Record<string, unknown>
  after: Record<string, unknown>
} {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const k of r.changed) {
    if (k === 'completed') {
      before.completedOn = r.previous.completedOn
      after.completedOn = r.milestone.completedOn
    } else {
      before[k] = r.previous[k]
      after[k] = r.milestone[k]
    }
  }
  return { before, after }
}
