// src/server/services/members.ts — project membership (FR-403, FR-404 + BR-61 (M3-D14), BR-62, M2-D05, M2-D06, M2-D16).
// Called after authz.requireProject(…, 'manage') inside the caller's transaction; the action writes the audit row.
// BR-62: every role change / removal first locks the project's LEAD rows (FOR UPDATE), so two LEADs demoting each
// other concurrently are serialised and the second one sees the first one's commit.
import { randomUUID } from 'node:crypto'
import type { ProjectRole } from '@/domain/types'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'
import type { RemoveMemberWithAssignmentsResult, RestoreRemovedMemberResult } from '@/lib/contracts/tasks'
import type { addMemberSchema, changeMemberRoleSchema, removeMemberSchema } from '@/lib/schemas/members'
import type { restoreRemovedMemberSchema } from '@/lib/schemas/tasks'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { ProjectMemberRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo, ValidationError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'
import { restoreAssignmentRows } from './assignments'

/** Manager actor removing / demoting the last active LEAD (BR-62 exception, M2-D06). */
export type LeadWarning = 'NO_LEAD'

/** 404 with the specific Thai message (the project itself is visible to the actor). */
function notMember(): NotFoundError {
  return Object.assign(new NotFoundError(), { message: th.members.errors.notMember })
}

async function personName(tx: DbOrTx, userId: string): Promise<string> {
  const p = await repo.people.getPerson(tx, userId)
  return p ? displayName(p) : userId
}

/**
 * BR-62 for an operation that takes `userId` out of the LEAD role (demotion or removal), evaluated on the LEAD rows
 * the caller locked with repo.members.lockLeadRows. Worker actor leaving no active LEAD → CONFLICT (lastLead);
 * manager actor → allowed with warning NO_LEAD. A deactivated target LEAD never blocks (it is not an active LEAD).
 */
function leadGuard(
  leads: readonly { userId: string; active: boolean }[],
  actor: SessionUser,
  userId: string,
): LeadWarning | undefined {
  if (leads.some((l) => l.userId !== userId && l.active)) return undefined
  if (authz.isManager(actor)) return 'NO_LEAD'
  if (leads.some((l) => l.userId === userId && l.active)) {
    throw new ConflictError('CONFLICT', th.members.errors.lastLead)
  }
  return undefined
}

/** FR-403. Unknown user → 404; deactivated → VALIDATION (X12); already a member → CONFLICT. */
export async function addMember(
  tx: DbOrTx,
  user: SessionUser,
  input: z.output<typeof addMemberSchema>,
): Promise<{ member: ProjectMemberRow; personName: string }> {
  const person = await repo.people.getPerson(tx, input.userId)
  if (!person) throw new NotFoundError()
  if (!person.active) {
    throw new ValidationError({ userId: [th.members.errors.userInactive] }, th.members.errors.userInactive)
  }
  const already = () => new ConflictError('CONFLICT', th.members.errors.alreadyMember)
  if (await repo.members.getMember(tx, input.projectId, input.userId)) throw already()
  try {
    const member = await repo.members.insertMember(tx, {
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
      addedBy: user.id,
    })
    return { member, personName: displayName(person) }
  } catch (e) {
    if (pgErrorInfo(e).code === '23505') throw already()
    throw e
  }
}

/** Same role → `changed: false` (no write, no audit). */
export async function changeMemberRole(
  tx: DbOrTx,
  user: SessionUser,
  input: z.output<typeof changeMemberRoleSchema>,
): Promise<{ previousRole: ProjectRole; personName: string; changed: boolean; warning?: LeadWarning }> {
  // Lock first, then read: a concurrent change that committed while we waited is visible to the reads below.
  const leads = await repo.members.lockLeadRows(tx, input.projectId)
  const cur = await repo.members.getMember(tx, input.projectId, input.userId)
  if (!cur) throw notMember()
  const name = await personName(tx, input.userId)
  if (cur.role === input.role) return { previousRole: cur.role, personName: name, changed: false }
  const warning = cur.role === 'LEAD' ? leadGuard(leads, user, input.userId) : undefined
  await repo.members.updateMemberRole(tx, input.projectId, input.userId, input.role)
  return { previousRole: cur.role, personName: name, changed: true, ...(warning ? { warning } : {}) }
}

/** BR-61 / M3-D14: a member with assignments on N > 0 live tasks of the project is **not** removed
 *  (`removed: false, blockedByAssignments: N`, nothing written); the client offers the FR-404 combined op.
 *  N = 0: assignments still active on soft-deleted tasks are soft-deleted with the member row, so a later
 *  restoreTaskBatch cannot bring back an assignment of a non-member (BR-60 "assignment ⇒ membership", §3.3). */
export async function removeMember(
  tx: DbOrTx,
  user: SessionUser,
  input: z.output<typeof removeMemberSchema>,
): Promise<
  | { removed: false; blockedByAssignments: number; personName: string }
  | { removed: true; removedRole: ProjectRole; personName: string; blockedByAssignments: 0; warning?: LeadWarning }
> {
  const leads = await repo.members.lockLeadRows(tx, input.projectId)
  const cur = await repo.members.getMember(tx, input.projectId, input.userId)
  if (!cur) throw notMember()
  const name = await personName(tx, input.userId)
  const n = await repo.assignments.countOpenAssignmentTasks(tx, input.projectId, input.userId)
  if (n > 0) return { removed: false, blockedByAssignments: n, personName: name }
  const warning = cur.role === 'LEAD' ? leadGuard(leads, user, input.userId) : undefined
  const onDeletedTasks = await repo.assignments.activeIdsForMember(tx, input.projectId, input.userId)
  if (onDeletedTasks.length > 0) await repo.assignments.softDelete(tx, onDeletedTasks, randomUUID())
  await repo.members.deleteMember(tx, input.projectId, input.userId)
  return {
    removed: true,
    removedRole: cur.role,
    personName: name,
    blockedByAssignments: 0,
    ...(warning ? { warning } : {}),
  }
}

/**
 * FR-404 combined op (X16, M3-D14): soft-deletes every active assignment of the user in the project (also on
 * soft-deleted tasks) under one batch and removes the member row (M2 LEAD rules apply). `batch` is null when the user
 * had no active assignment there.
 */
export async function removeMemberWithAssignments(
  tx: DbOrTx,
  user: SessionUser,
  input: { projectId: string; userId: string },
): Promise<RemoveMemberWithAssignmentsResult & { personName: string; warning?: LeadWarning }> {
  const leads = await repo.members.lockLeadRows(tx, input.projectId)
  const cur = await repo.members.getMember(tx, input.projectId, input.userId)
  if (!cur) throw notMember()
  const name = await personName(tx, input.userId)
  const warning = cur.role === 'LEAD' ? leadGuard(leads, user, input.userId) : undefined
  const n = await repo.assignments.countOpenAssignmentTasks(tx, input.projectId, input.userId)
  const ids = await repo.assignments.activeIdsForMember(tx, input.projectId, input.userId)
  const batch = ids.length > 0 ? randomUUID() : null
  if (batch) await repo.assignments.softDelete(tx, ids, batch)
  await repo.members.deleteMember(tx, input.projectId, input.userId)
  return {
    batch,
    member: { role: cur.role, addedBy: cur.addedBy, addedAt: cur.addedAt.toISOString() },
    unassignedTaskCount: n,
    personName: name,
    ...(warning ? { warning } : {}),
  }
}

/** Undo of removeMemberWithAssignments: the member row comes back as it was (role, added_by, added_at) and the
 *  assignment batch is restored with the S2.7 rules (skips counted). */
export async function restoreRemovedMember(
  tx: DbOrTx,
  user: SessionUser,
  input: z.output<typeof restoreRemovedMemberSchema>,
): Promise<RestoreRemovedMemberResult & { personName: string }> {
  const person = await repo.people.getPerson(tx, input.userId)
  if (!person) throw new NotFoundError()
  await repo.members.insertMemberIfAbsent(tx, {
    projectId: input.projectId,
    userId: input.userId,
    role: input.member.role,
    addedBy: input.member.addedBy,
    addedAt: new Date(input.member.addedAt),
  })
  const r = input.batch
    ? await restoreAssignmentRows(tx, user, { projectId: input.projectId, batch: input.batch, allowDeletedTasks: true })
    : { restored: [], skipped: 0 }
  return { restoredAssignments: r.restored.length, skipped: r.skipped, personName: displayName(person) }
}
