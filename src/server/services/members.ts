// src/server/services/members.ts — project membership (FR-403, FR-404 part, BR-62, M2-D05, M2-D06, M2-D16).
// Called after authz.requireProject(…, 'manage') inside the caller's transaction; the action writes the audit row.
// BR-62: every role change / removal first locks the project's LEAD rows (FOR UPDATE), so two LEADs demoting each
// other concurrently are serialised and the second one sees the first one's commit.
import type { ProjectRole } from '@/domain/types'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'
import type { addMemberSchema, changeMemberRoleSchema, removeMemberSchema } from '@/lib/schemas/members'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { ProjectMemberRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, pgErrorInfo, ValidationError } from '../errors'
import * as repo from '../repo'
import type { SessionUser } from '../session'

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

/** `blockedByAssignments` is always 0 in M2 (X16; M3 counts assignments and enforces BR-61). */
export async function removeMember(
  tx: DbOrTx,
  user: SessionUser,
  input: z.output<typeof removeMemberSchema>,
): Promise<{ removedRole: ProjectRole; personName: string; blockedByAssignments: 0; warning?: LeadWarning }> {
  const leads = await repo.members.lockLeadRows(tx, input.projectId)
  const cur = await repo.members.getMember(tx, input.projectId, input.userId)
  if (!cur) throw notMember()
  const name = await personName(tx, input.userId)
  const warning = cur.role === 'LEAD' ? leadGuard(leads, user, input.userId) : undefined
  await repo.members.deleteMember(tx, input.projectId, input.userId)
  return { removedRole: cur.role, personName: name, blockedByAssignments: 0, ...(warning ? { warning } : {}) }
}
