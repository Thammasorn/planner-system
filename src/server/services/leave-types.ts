// src/server/services/leave-types.ts — leave types (FR-902, M5-D10/D12, X48; plan/m05 S0.13/S2.3). Services write
// their audit row as the last statement in the caller's transaction (actor null from scripts). Every write takes
// lockOrderScope(tx, 'leave_types') first: it serialises key generation and the last-active guard.
import type {
  DeleteLeaveTypeResult,
  DeletedLeaveType,
  LeaveTypeAdminDTO,
  LeaveTypeDTO,
} from '@/lib/contracts/leave-types'
import { th } from '@/i18n/th'
import type { updateLeaveTypeSchema } from '@/lib/schemas/leave-types'
import type { z } from '@/lib/z'
import * as audit from '../audit'
import type { LeaveTypeRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo } from '../errors'
import * as repo from '../repo'

type Actor = { id: string } | null

const SCOPE = 'leave_types'

const toDTO = (r: Pick<LeaveTypeRow, 'id' | 'name' | 'color' | 'archivedAt'>): LeaveTypeDTO => ({
  id: r.id,
  name: r.name,
  color: r.color,
  archived: r.archivedAt !== null,
})

function nameTaken(): ConflictError {
  const msg = th.leaveTypes.errors.nameTaken
  return new ConflictError('CONFLICT', msg, { fieldErrors: { name: [msg] } })
}

const lastActive = () => new ConflictError('CONFLICT', th.leaveTypes.errors.lastActive)
const isUnique = (e: unknown): boolean => pgErrorInfo(e).code === '23505'

/** Ordered by position, id; `includeArchived: false` = the dialog's options (usageCount = live entries). */
export async function listLeaveTypes(
  tx: DbOrTx,
  opts: { includeArchived: boolean },
): Promise<LeaveTypeAdminDTO[]> {
  return (await repo.leaveTypes.listOrdered(tx, opts)).map((r) => ({
    ...toDTO(r),
    position: r.position,
    usageCount: r.usageCount,
  }))
}

/** Appends after the last type (archived included); duplicate name → CONFLICT nameTaken (fieldErrors.name). */
export async function createLeaveType(
  tx: DbOrTx,
  actor: Actor,
  input: { name: string; color: string },
): Promise<LeaveTypeDTO> {
  await repo.order.lockOrderScope(tx, SCOPE)
  if (await repo.leaveTypes.findIdByName(tx, input.name)) throw nameTaken()
  const position = repo.order.keyAfter(await repo.leaveTypes.lastPosition(tx))
  let row: LeaveTypeRow
  try {
    row = await repo.leaveTypes.insertLeaveType(tx, { name: input.name, color: input.color, position })
  } catch (e) {
    if (isUnique(e)) throw nameTaken()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'leave_type',
    entityId: row.id,
    action: 'create',
    summary: th.audit.leaveTypeCreated(row.name),
    after: { name: row.name, color: row.color, position: row.position },
  })
  return toDTO(row)
}

/** Rename and/or recolour; nothing changed → no-op (no audit). */
export async function updateLeaveType(
  tx: DbOrTx,
  actor: Actor,
  input: z.output<typeof updateLeaveTypeSchema>,
): Promise<void> {
  await repo.order.lockOrderScope(tx, SCOPE)
  const cur = await repo.leaveTypes.getOrNotFound(tx, input.id)
  const patch: { name?: string; color?: string } = {}
  if (input.name !== undefined && input.name !== cur.name) {
    const other = await repo.leaveTypes.findIdByName(tx, input.name)
    if (other && other !== cur.id) throw nameTaken()
    patch.name = input.name
  }
  if (input.color !== undefined && input.color !== cur.color) patch.color = input.color
  if (patch.name === undefined && patch.color === undefined) return
  try {
    await repo.leaveTypes.updateRow(tx, cur.id, patch)
  } catch (e) {
    if (isUnique(e)) throw nameTaken()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'leave_type',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.leaveTypeUpdated(patch.name ?? cur.name),
    before: { name: cur.name, color: cur.color },
    after: { name: patch.name ?? cur.name, color: patch.color ?? cur.color },
  })
}

/** M1 movePosition algorithm over every type (archived included): no-op (no audit) at the ends; equal neighbour
 *  keys → re-key all in order first (X48). */
export async function moveLeaveType(
  tx: DbOrTx,
  actor: Actor,
  input: { id: string; direction: 'up' | 'down' },
): Promise<void> {
  await repo.order.lockOrderScope(tx, SCOPE)
  let rows = await repo.leaveTypes.listOrdered(tx, { includeArchived: true })
  const i = rows.findIndex((r) => r.id === input.id)
  if (i < 0) throw new NotFoundError()
  const target = rows[i]!
  if (input.direction === 'up' ? i === 0 : i === rows.length - 1) return

  const bounds = (list: typeof rows): [string | null, string | null] =>
    input.direction === 'up'
      ? [list[i - 2]?.position ?? null, list[i - 1]!.position]
      : [list[i + 1]!.position, list[i + 2]?.position ?? null]

  let [a, b] = bounds(rows)
  const collides = (x: string | null, y: string | null) => x !== null && y !== null && x >= y
  if (collides(a, b)) {
    const keys = repo.order.rekey(rows.length)
    for (const [j, r] of rows.entries()) await repo.leaveTypes.updateRow(tx, r.id, { position: keys[j]! })
    rows = rows.map((r, j) => ({ ...r, position: keys[j]! }))
    ;[a, b] = bounds(rows)
  }
  const position = repo.order.keyBetween(a, b)
  await repo.leaveTypes.updateRow(tx, target.id, { position })
  await audit.log(tx, actor, {
    entity: 'leave_type',
    entityId: target.id,
    action: 'update',
    summary: th.audit.leaveTypeMoved(target.name),
    before: { position: target.position },
    after: { position },
  })
}

async function archive(tx: DbOrTx, actor: Actor, cur: LeaveTypeRow): Promise<void> {
  await repo.leaveTypes.updateRow(tx, cur.id, { archivedAt: new Date() })
  await audit.log(tx, actor, {
    entity: 'leave_type',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.leaveTypeArchived(cur.name),
    before: { archived: false },
    after: { archived: true },
  })
}

/** Archiving the last active type → CONFLICT th.leaveTypes.errors.lastActive; unchanged → no-op (no audit). */
export async function setLeaveTypeArchived(
  tx: DbOrTx,
  actor: Actor,
  input: { id: string; archived: boolean },
): Promise<void> {
  await repo.order.lockOrderScope(tx, SCOPE)
  const cur = await repo.leaveTypes.getOrNotFound(tx, input.id)
  const isArchived = cur.archivedAt !== null
  if (isArchived === input.archived) return
  if (input.archived) {
    if ((await repo.leaveTypes.countActive(tx, cur.id)) === 0) throw lastActive()
    await archive(tx, actor, cur)
    return
  }
  await repo.leaveTypes.updateRow(tx, cur.id, { archivedAt: null })
  await audit.log(tx, actor, {
    entity: 'leave_type',
    entityId: cur.id,
    action: 'update',
    summary: th.audit.leaveTypeUnarchived(cur.name),
    before: { archived: true },
    after: { archived: false },
  })
}

/** M5-D10: referenced by any time_off row (live or soft-deleted) → archive instead; otherwise hard delete. The last
 *  active type can be neither archived nor deleted (CONFLICT lastActive). */
export async function deleteLeaveType(tx: DbOrTx, actor: Actor, id: string): Promise<DeleteLeaveTypeResult> {
  await repo.order.lockOrderScope(tx, SCOPE)
  const cur = await repo.leaveTypes.getOrNotFound(tx, id)
  const isArchived = cur.archivedAt !== null
  if (!isArchived && (await repo.leaveTypes.countActive(tx, cur.id)) === 0) throw lastActive()

  const archiveInstead = async (): Promise<DeleteLeaveTypeResult> => {
    if (!isArchived) await archive(tx, actor, cur)
    return { outcome: 'archived', id: cur.id }
  }
  if ((await repo.leaveTypes.countReferences(tx, cur.id)) > 0) return archiveInstead()
  try {
    // Savepoint: a concurrent entry (23503, FK RESTRICT) must not abort the outer transaction.
    await tx.transaction((sp) => repo.leaveTypes.deleteRow(sp, cur.id))
  } catch (e) {
    if (pgErrorInfo(e).code === '23503') return archiveInstead()
    throw e
  }
  const deleted: DeletedLeaveType = {
    id: cur.id,
    name: cur.name,
    color: cur.color,
    position: cur.position,
    archivedAt: cur.archivedAt?.toISOString() ?? null,
  }
  await audit.log(tx, actor, {
    entity: 'leave_type',
    entityId: cur.id,
    action: 'delete',
    summary: th.audit.leaveTypeDeleted(cur.name),
    before: { name: cur.name, color: cur.color, position: cur.position, archivedAt: deleted.archivedAt },
  })
  return { outcome: 'deleted', deleted }
}

/** Re-insert the same id / name / colour / position / archivedAt (id or name taken since → CONFLICT restoreConflict). */
export async function restoreLeaveType(tx: DbOrTx, actor: Actor, input: DeletedLeaveType): Promise<void> {
  const conflict = () => new ConflictError('CONFLICT', th.leaveTypes.errors.restoreConflict)
  await repo.order.lockOrderScope(tx, SCOPE)
  if (
    (await repo.leaveTypes.getLeaveType(tx, input.id)) ||
    (await repo.leaveTypes.findIdByName(tx, input.name))
  ) {
    throw conflict()
  }
  try {
    await repo.leaveTypes.insertLeaveType(tx, {
      id: input.id,
      name: input.name,
      color: input.color,
      position: input.position,
      archivedAt: input.archivedAt === null ? null : new Date(input.archivedAt),
    })
  } catch (e) {
    if (isUnique(e)) throw conflict()
    throw e
  }
  await audit.log(tx, actor, {
    entity: 'leave_type',
    entityId: input.id,
    action: 'restore',
    summary: th.audit.leaveTypeRestored(input.name),
    after: { name: input.name, color: input.color, position: input.position, archivedAt: input.archivedAt },
  })
}

/** M5-D12 / §10.4 step 2: insert th.leaveTypes.defaults in order when the table is empty; returns rows created. */
export async function ensureDefaultLeaveTypes(tx: DbOrTx, actor: Actor): Promise<number> {
  await repo.order.lockOrderScope(tx, SCOPE)
  if ((await repo.leaveTypes.countAll(tx)) > 0) return 0
  for (const d of th.leaveTypes.defaults) await createLeaveType(tx, actor, { name: d.name, color: d.color })
  return th.leaveTypes.defaults.length
}
