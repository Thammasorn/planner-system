// src/server/services/shared.ts — small helpers shared by the M2 services (ordering + DTO mapping).
import { compareThai } from '@/lib/collate'
import type { ClientRef } from '@/lib/contracts/clients'
import type { MemberUser, ProjectMember } from '@/lib/contracts/projects'
import { displayName } from '@/lib/display-name'
import type { ClientRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import type { MemberWithUser } from '../repo/members'

/** Display-name order (compareThai), ties by id so the order is total and deterministic. */
export function compareByDisplayName(
  a: { id?: string; userId?: string; name: string; nickname: string | null },
  b: { id?: string; userId?: string; name: string; nickname: string | null },
): number {
  return (
    compareThai(displayName(a), displayName(b)) || compareThai(a.id ?? a.userId ?? '', b.id ?? b.userId ?? '')
  )
}

export function toClientRef(c: ClientRow): ClientRef {
  return { id: c.id, name: c.name, code: c.code, color: c.color, archived: c.archivedAt !== null }
}

export function toMemberUser(m: MemberWithUser): MemberUser {
  return {
    userId: m.userId,
    name: m.name,
    nickname: m.nickname,
    positionName: m.positionName,
    color: m.color,
    active: m.active,
  }
}

export function toProjectMember(m: MemberWithUser): ProjectMember {
  return { ...toMemberUser(m), role: m.role }
}

/** Member lists: LEAD first, then display name (M2-D18). */
export function compareMembers(a: ProjectMember, b: ProjectMember): number {
  if (a.role !== b.role) return a.role === 'LEAD' ? -1 : 1
  return compareByDisplayName(a, b)
}

/** Display name of a user for audit summaries and Thai messages (falls back to the id for unknown users). */
export async function personDisplayName(tx: DbOrTx, userId: string): Promise<string> {
  const p = await repo.people.getPerson(tx, userId)
  return p ? displayName(p) : userId
}
