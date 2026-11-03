'use server'
// src/server/actions/milestones.ts — milestones (SPEC §4.7, §3.2 PERM-15 / PERM-11, §7.5, X41/X42/X44/X96;
// plan/m08 S0.5 signatures, S2.3 bodies, M8-D3/D4/D25).
// Shape: zod → db.transaction(authz in the action → services.milestones.* (data only) → audit.log in the same tx) →
// result. No revalidateTag / refresh() (X47); TanStack: the caller runs invalidateMilestones (X82).
//   createMilestone        requireProject(projectId, 'manage')                         PERM-15
//   updateMilestone        requireMilestone(milestoneId, 'manage')                     PERM-15 (rename / move / complete)
//   deleteMilestone        requireMilestone(milestoneId, 'manage')                     PERM-15
//   restoreMilestoneBatch  repo.milestones.getByBatch → requireMilestone(id, 'manage', { includeDeleted })
//   linkTasksToMilestone   requireTasks(taskIds, 'edit') → requireMilestone(id, 'view') when set   PERM-11 (M8-D4)
//   revertTaskMilestones   requireTasks(edit) → requireMilestone(id, 'view', { includeDeleted }) per distinct id
import { th } from '@/i18n/th'
import type {
  CreateMilestoneResult,
  DeleteMilestoneResult,
  LinkTasksResult,
  RestoreMilestoneBatchResult,
  RevertTaskMilestonesResult,
  TaskMilestoneChange,
  UpdateMilestoneResult,
} from '@/lib/contracts/milestones'
import {
  createMilestoneSchema,
  deleteMilestoneSchema,
  linkTasksToMilestoneSchema,
  restoreMilestoneBatchSchema,
  revertTaskMilestonesSchema,
  updateMilestoneSchema,
} from '@/lib/schemas/milestones'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { serverToday } from '../clock'
import { db } from '../db/client'
import type { Tx } from '../db/types'
import { NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'
import { MILESTONE_AUDIT_ENTITY } from '../services/milestones'
import type { SessionUser } from '../session'

const sameProjectOnly = (): ValidationError => {
  const msg = th.milestones.errors.sameProjectOnly
  return new ValidationError({ milestoneId: [msg] }, msg)
}

/** One `task` audit row per changed binding (M8-D21): before/after carry the raw milestone ids. */
async function auditBindings(
  tx: Tx,
  user: SessionUser,
  projectId: string,
  changes: readonly TaskMilestoneChange[],
  targetOf: (c: TaskMilestoneChange) => string | null,
  nameOf: (milestoneId: string) => string,
): Promise<void> {
  for (const c of changes) {
    const target = targetOf(c)
    await audit.log(tx, user, {
      entity: 'task',
      entityId: c.taskId,
      action: 'update',
      projectId,
      summary:
        target === null
          ? th.audit.taskMilestoneUnlinked(c.taskName)
          : th.audit.taskMilestoneLinked(c.taskName, nameOf(target)),
      before: { milestoneId: c.previousMilestoneId },
      after: { milestoneId: target },
    })
  }
}

export const createMilestone = action(
  createMilestoneSchema,
  async (input, { user }): Promise<CreateMilestoneResult> =>
    db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'manage') // 404 invisible · 403 Me / archived
      const r = await services.milestones.create(tx, user, input, serverToday())
      await audit.log(tx, user, {
        entity: MILESTONE_AUDIT_ENTITY,
        entityId: r.milestone.id,
        action: 'create',
        projectId: input.projectId,
        summary: th.audit.milestoneCreated(r.milestone.name),
        after: {
          name: r.milestone.name,
          date: r.milestone.date,
          description: r.milestone.description,
          color: r.milestone.color,
        },
      })
      return r
    }),
)

/** Undo = updateMilestone({ milestoneId, patch: previous-derived }) (M8-D19: completedOn for complete/reopen). */
export const updateMilestone = action(
  updateMilestoneSchema,
  async (input, { user }): Promise<UpdateMilestoneResult> =>
    db.transaction(async (tx) => {
      const acc = await authz.requireMilestone(tx, user, input.milestoneId, 'manage') // 404 invisible · 403 Me / archived
      const r = await services.milestones.update(tx, user, input, serverToday())
      if (r.changed.length > 0) {
        await audit.log(tx, user, {
          entity: MILESTONE_AUDIT_ENTITY,
          action: 'update',
          entityId: r.milestone.id,
          projectId: acc.milestone.projectId,
          summary: services.milestones.milestoneUpdateSummary(r),
          ...services.milestones.milestoneAuditDiff(r),
        })
      }
      return r
    }),
)

/** Undo = restoreMilestoneBatch({ batch }). */
export const deleteMilestone = action(
  deleteMilestoneSchema,
  async (input, { user }): Promise<DeleteMilestoneResult> =>
    db.transaction(async (tx) => {
      const acc = await authz.requireMilestone(tx, user, input.milestoneId, 'manage')
      const r = await services.milestones.remove(tx, user, input.milestoneId)
      await audit.log(tx, user, {
        entity: MILESTONE_AUDIT_ENTITY,
        action: 'delete',
        entityId: r.milestoneId,
        projectId: acc.milestone.projectId,
        summary: th.audit.milestoneDeleted(r.name, r.unlinkedTaskCount),
        after: { batch: r.batch, unlinkedTaskCount: r.unlinkedTaskCount },
      })
      return r
    }),
)

export const restoreMilestoneBatch = action(
  restoreMilestoneBatchSchema,
  async (input, { user }): Promise<RestoreMilestoneBatchResult> =>
    db.transaction(async (tx) => {
      const deleted = await repo.milestones.getByBatch(tx, input.batch) // owner lookup (before authz)
      if (!deleted) throw new NotFoundError()
      // Me 403, W 404, archived 403 — all before the 30-day check
      const acc = await authz.requireMilestone(tx, user, deleted.id, 'manage', { includeDeleted: true })
      const r = await services.milestones.restoreBatch(tx, user, acc.milestone, serverToday())
      await audit.log(tx, user, {
        entity: MILESTONE_AUDIT_ENTITY,
        action: 'restore',
        entityId: r.milestone.id,
        projectId: acc.milestone.projectId,
        summary: th.audit.milestoneRestored(r.milestone.name),
        after: { batch: input.batch },
      })
      return r
    }),
)

/** Single + bulk binding (FR-601/614); undo = revertTaskMilestones({ items: changed → previous }). */
export const linkTasksToMilestone = action(
  linkTasksToMilestoneSchema,
  async (input, { user }): Promise<LinkTasksResult> =>
    db.transaction(async (tx) => {
      const acc = await authz.requireTasks(tx, user, input.taskIds, 'edit') // cross-project → VALIDATION (M3)
      if (input.milestoneId !== null) {
        // invisible → 404 (never reveals another project's milestone); visible other project → 400 (X66)
        const m = await authz.requireMilestone(tx, user, input.milestoneId, 'view')
        if (m.milestone.projectId !== acc.projectId) throw sameProjectOnly()
      }
      const r = await services.milestones.linkTasks(tx, user, { ...input, projectId: acc.projectId })
      await auditBindings(
        tx,
        user,
        acc.projectId,
        r.changed,
        () => r.milestoneId,
        () => r.milestoneName ?? '',
      )
      return r
    }),
)

export const revertTaskMilestones = action(
  revertTaskMilestonesSchema,
  async (input, { user }): Promise<RevertTaskMilestonesResult> =>
    db.transaction(async (tx) => {
      const acc = await authz.requireTasks(
        tx,
        user,
        input.items.map((i) => i.taskId),
        'edit',
      )
      const names = new Map<string, string>()
      for (const id of new Set(input.items.flatMap((i) => (i.milestoneId ? [i.milestoneId] : [])))) {
        const m = await authz.requireMilestone(tx, user, id, 'view', { includeDeleted: true })
        if (m.milestone.projectId !== acc.projectId) throw new NotFoundError()
        names.set(id, m.milestone.name)
      }
      const r = await services.milestones.revertLinks(tx, user, { ...input, projectId: acc.projectId })
      const target = new Map(input.items.map((i) => [i.taskId, i.milestoneId]))
      await auditBindings(
        tx,
        user,
        acc.projectId,
        r.changed.filter((c) => c.previousMilestoneId !== target.get(c.taskId)),
        (c) => target.get(c.taskId) ?? null,
        (id) => names.get(id) ?? '',
      )
      return r
    }),
)
