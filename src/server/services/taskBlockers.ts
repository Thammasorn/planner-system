// src/server/services/taskBlockers.ts — "ถูกขวางโดย" links (SPEC v3.1 FR-640–645, BR-85/86, D12, X73, M3-D31/32).
// camelCase file name is the documented exception (X80). Called after the action's requireTask(…, 'edit'); unlike the
// other M3 services these write their own audit row (M3-D43: only the service knows whether an edge was created).
// Cycle checks are serialised per project with an advisory lock (R23). Never touch statuses or assignments (BR-87).
import { checkBlocker } from '@/domain/blockers'
import { th } from '@/i18n/th'
import type { AddTaskBlockerResult, RemoveTaskBlockerResult } from '@/lib/contracts/tasks'
import type { addTaskBlockerSchema, removeTaskBlockerSchema } from '@/lib/schemas/tasks'
import type { z } from '@/lib/z'
import * as audit from '../audit'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'

const E = th.tasks.blockers.errors
const invalid = (message: string): ValidationError => new ValidationError({ blockerTaskId: [message] }, message)

/** BR-85: same project, not self, not ancestor/descendant, no cycle. An existing live edge is returned as is
 *  (`created: false`, no audit, M3-D32). */
export async function addTaskBlocker(
  tx: DbOrTx,
  user: SessionUser,
  a: z.output<typeof addTaskBlockerSchema>,
): Promise<AddTaskBlockerResult> {
  const task = await repo.tasks.getLive(tx, a.taskId)
  if (!task) throw new NotFoundError()
  const blocker = await repo.tasks.getLive(tx, a.blockerTaskId)
  if (!blocker) throw new NotFoundError()
  if (blocker.projectId !== task.projectId) {
    if (!(await authz.projectAccess(tx, user, blocker.projectId))) throw new NotFoundError()
    throw invalid(E.crossProject)
  }
  const projectId = task.projectId
  await repo.order.lockOrderScope(tx, `task_blockers:${projectId}`)
  const edges = (await repo.blockers.listLiveEdges(tx, projectId)).map((e) => ({
    blockerId: e.blockerTaskId,
    blockedId: e.taskId,
  }))
  const parents = await repo.tasks.parentMap(tx, projectId)
  const problem = checkBlocker({
    edges,
    parentOf: (id) => parents.get(id) ?? null,
    blockerId: blocker.id,
    blockedId: task.id,
  })
  if (problem?.reason === 'SELF') throw invalid(E.self)
  if (problem?.reason === 'ANCESTRY') throw invalid(E.ancestry)
  if (problem?.reason === 'DUPLICATE') {
    const existing = await repo.blockers.findLive(tx, task.id, blocker.id)
    if (existing) {
      return {
        projectId,
        edge: { id: existing.id, taskId: existing.taskId, blockerTaskId: existing.blockerTaskId },
        created: false,
      }
    }
  }
  if (problem?.reason === 'CYCLE') {
    const names = await repo.tasks.namesByIds(tx, problem.path)
    throw invalid(E.cycle(problem.path.map((id) => names.get(id) ?? '?').join(' → ')))
  }
  const edge = await repo.blockers.insertBlocker(tx, {
    projectId,
    taskId: task.id,
    blockerTaskId: blocker.id,
    createdBy: user.id,
  })
  await audit.log(tx, user, {
    entity: 'task_blocker',
    entityId: edge.id,
    action: 'create',
    projectId,
    summary: th.audit.blockerAdded(task.name, blocker.name),
    after: { taskId: task.id, blockerTaskId: blocker.id },
  })
  return { projectId, edge: { id: edge.id, taskId: edge.taskId, blockerTaskId: edge.blockerTaskId }, created: true }
}

/** Soft delete with `deleted_batch = null` (M3-D31); undo = addTaskBlocker on the same pair. */
export async function removeTaskBlocker(
  tx: DbOrTx,
  user: SessionUser,
  a: z.output<typeof removeTaskBlockerSchema>,
): Promise<RemoveTaskBlockerResult> {
  const edge = await repo.blockers.getLive(tx, a.blockerId)
  if (!edge) throw new NotFoundError()
  await repo.blockers.softDeleteOne(tx, edge.id)
  const names = await repo.tasks.namesByIds(tx, [edge.taskId, edge.blockerTaskId])
  await audit.log(tx, user, {
    entity: 'task_blocker',
    entityId: edge.id,
    action: 'delete',
    projectId: edge.projectId,
    summary: th.audit.blockerRemoved(names.get(edge.taskId) ?? '', names.get(edge.blockerTaskId) ?? ''),
    before: { taskId: edge.taskId, blockerTaskId: edge.blockerTaskId },
  })
  return { projectId: edge.projectId, edgeId: edge.id, taskId: edge.taskId, blockerTaskId: edge.blockerTaskId }
}
