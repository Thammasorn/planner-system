// src/server/services/task-tree.ts — tree placement core (FR-603/604, BR-30/31/33, X48, X20, M3-D2/D3/D11).
// Used by create, indent, outdent, move and restore. Every function runs inside the caller's transaction (after the
// action's authz). Order keys are generated only here, between real neighbours, under the sibling-scope advisory lock.
import { th } from '@/i18n/th'
import type { AssignmentTransfer, TreePlacement } from '@/lib/contracts/tasks'
import { displayName } from '@/lib/display-name'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { TaskRow } from '../repo/tasks'
import { keyAmong } from './order-keys'
import type { SessionUser } from '../session'

/** BR-30: depth index 0..2 (three levels). */
export const TASK_MAX_DEPTH_INDEX = 2

/** BR-30: a subtree of `height` placed at `newDepth` must end at depth ≤ 2. */
export const fitsDepth = (newDepth: number, height: number, max = TASK_MAX_DEPTH_INDEX): boolean =>
  newDepth + height <= max

const treeChanged = (): ConflictError => new ConflictError('CONFLICT', th.tasks.errors.treeChanged)
const validation = (field: string, message: string): ValidationError =>
  new ValidationError({ [field]: [message] }, message)

/** X48: one advisory lock per sibling scope (children of a parent, or the project's roots). */
export async function lockSiblingScope(tx: DbOrTx, projectId: string, parentId: string | null): Promise<void> {
  await repo.order.lockOrderScope(tx, `tasks:${parentId ?? `root:${projectId}`}`)
}

/**
 * Order key for a new position among the live children of `parentId` (excluding `excludeId`):
 * afterId undefined → append · null → first · id → right after that sibling (stale → CONFLICT treeChanged, M3-D11).
 * Equal neighbour keys → the scope is re-keyed in order first (X48).
 */
export async function keyAt(
  tx: DbOrTx,
  a: { projectId: string; parentId: string | null; afterId: string | null | undefined; excludeId?: string },
): Promise<string> {
  const siblings = (await repo.tasks.liveChildren(tx, a.projectId, a.parentId)).filter((s) => s.id !== a.excludeId)
  return keyAmong(siblings, a.afterId, (id, position) => repo.tasks.setPosition(tx, id, position))
}

/** The live subtree of `rootId` (root first) and its height (max depth − root depth). */
export async function subtree(
  tx: DbOrTx,
  rootId: string,
): Promise<{ nodes: { id: string; depth: number }[]; height: number }> {
  const nodes = await repo.tasks.liveSubtree(tx, rootId)
  const root = nodes[0]
  const height = root ? Math.max(...nodes.map((n) => n.depth)) - root.depth : 0
  return { nodes, height }
}

async function nameOf(tx: DbOrTx, userId: string): Promise<string> {
  const p = await repo.people.getPerson(tx, userId)
  return p ? displayName(p) : userId
}

/**
 * BR-31 / M3-D2 when `moving` lands under `newParent`: the parent's active assignments (locked) move to `moving`.
 * None → null. `moving` has children → CONFLICT nestUnderAssignedNeedsLeaf; a user on both → CONFLICT sameAssignee.
 */
export async function autoTransfer(
  tx: DbOrTx,
  newParent: Pick<TaskRow, 'id'>,
  moving: { id: string; isLeaf: boolean },
): Promise<AssignmentTransfer | null> {
  const parentRows = await repo.assignments.activeForTask(tx, newParent.id, { forUpdate: true })
  if (parentRows.length === 0) return null
  if (!moving.isLeaf) throw new ConflictError('CONFLICT', th.tasks.errors.nestUnderAssignedNeedsLeaf)
  const own = new Set((await repo.assignments.activeForTask(tx, moving.id)).map((r) => r.userId))
  const clash = parentRows.find((r) => own.has(r.userId))
  if (clash) throw new ConflictError('CONFLICT', th.tasks.errors.sameAssignee(await nameOf(tx, clash.userId)))
  return { assignmentIds: parentRows.map((r) => r.id), fromTaskId: newParent.id, toTaskId: moving.id }
}

/**
 * Applies a transfer (X20: re-point + version + 1). The rows must be exactly the listed active assignments of
 * `fromTaskId`; `toTaskId` must be a live leaf of the project; a user already on `toTaskId` → CONFLICT sameAssignee.
 * `allowDeletedFrom`: the undo of FR-610 moves assignments off a just-deleted child (S2.8).
 */
export async function applyTransfer(
  tx: DbOrTx,
  projectId: string,
  t: AssignmentTransfer,
  o?: { allowDeletedFrom?: boolean },
): Promise<void> {
  const from = o?.allowDeletedFrom
    ? await repo.tasks.getAny(tx, t.fromTaskId)
    : await repo.tasks.getLive(tx, t.fromTaskId)
  if (!from || from.projectId !== projectId) throw treeChanged()
  const rows = await repo.assignments.lockActiveOnTask(tx, t.assignmentIds, t.fromTaskId)
  if (rows.length !== new Set(t.assignmentIds).size) throw treeChanged()
  const to = await repo.tasks.getLive(tx, t.toTaskId, { forUpdate: true })
  if (!to || to.projectId !== projectId || (await repo.tasks.hasLiveChildren(tx, to.id))) throw treeChanged()
  const onTarget = new Set((await repo.assignments.activeForTask(tx, to.id)).map((r) => r.userId))
  const clash = rows.find((r) => onTarget.has(r.userId))
  if (clash) throw new ConflictError('CONFLICT', th.tasks.errors.sameAssignee(await nameOf(tx, clash.userId)))
  await repo.assignments.repoint(
    tx,
    rows.map((r) => r.id),
    to.id,
  )
}

/** Current placement: parent + previous live sibling (null = first). */
export async function currentPlacement(tx: DbOrTx, task: TaskRow): Promise<TreePlacement> {
  const siblings = await repo.tasks.liveChildren(tx, task.projectId, task.parentId)
  const i = siblings.findIndex((s) => s.id === task.id)
  return { parentId: task.parentId, afterId: i > 0 ? siblings[i - 1]!.id : null }
}

/**
 * Moves `task` (and its subtree) to `to` (S2.2 algorithm). Parent invisible → 404, other project → VALIDATION
 * crossProject (BR-33), own subtree → VALIDATION cycle, too deep → VALIDATION maxDepth, stale afterId → CONFLICT.
 * `changed: false` when `to` is the current placement. BR-31 transfer: `o.transfer` if given, else autoTransfer.
 */
export async function placeTask(
  tx: DbOrTx,
  task: TaskRow,
  to: { parentId: string | null; afterId: string | null | undefined },
  o: { transfer?: AssignmentTransfer; user: SessionUser },
): Promise<
  | { changed: false }
  | { changed: true; task: TaskRow; previous: TreePlacement; transfer: AssignmentTransfer | null }
> {
  const locked = await repo.tasks.getLive(tx, task.id, { forUpdate: true })
  if (!locked) throw new NotFoundError()
  let parent: TaskRow | null = null
  if (to.parentId !== null) {
    parent = await repo.tasks.getLive(tx, to.parentId, { forUpdate: true })
    if (!parent) throw new NotFoundError()
    if (parent.projectId !== locked.projectId) {
      if (!(await authz.projectAccess(tx, o.user, parent.projectId))) throw new NotFoundError()
      throw validation('parentId', th.tasks.errors.crossProject)
    }
  }
  const sub = await subtree(tx, locked.id)
  if (parent && sub.nodes.some((n) => n.id === parent.id)) throw validation('parentId', th.tasks.errors.cycle)
  const newDepth = parent ? parent.depth + 1 : 0
  if (!fitsDepth(newDepth, sub.height)) throw validation('parentId', th.tasks.errors.maxDepth)

  const previous = await currentPlacement(tx, locked)
  const siblingsAtTarget = (await repo.tasks.liveChildren(tx, locked.projectId, to.parentId)).filter(
    (s) => s.id !== locked.id,
  )
  const afterId = to.afterId === undefined ? (siblingsAtTarget.at(-1)?.id ?? null) : to.afterId
  if (to.parentId === previous.parentId && afterId === previous.afterId && !o.transfer) return { changed: false }

  await lockSiblingScope(tx, locked.projectId, to.parentId)
  const position =
    to.parentId === previous.parentId && afterId === previous.afterId
      ? locked.position
      : await keyAt(tx, { projectId: locked.projectId, parentId: to.parentId, afterId, excludeId: locked.id })
  await repo.tasks.updatePlacement(tx, locked.id, { parentId: to.parentId, depth: newDepth, position })
  await repo.tasks.shiftDepth(
    tx,
    sub.nodes.slice(1).map((n) => n.id),
    newDepth - locked.depth,
  )

  let transfer: AssignmentTransfer | null = null
  if (o.transfer) {
    await applyTransfer(tx, locked.projectId, o.transfer)
    transfer = o.transfer
  } else if (parent) {
    transfer = await autoTransfer(tx, parent, { id: locked.id, isLeaf: sub.height === 0 })
    if (transfer) await applyTransfer(tx, locked.projectId, transfer)
  }
  const updated = await repo.tasks.getLive(tx, locked.id)
  if (!updated) throw new NotFoundError()
  return { changed: true, task: updated, previous, transfer }
}
