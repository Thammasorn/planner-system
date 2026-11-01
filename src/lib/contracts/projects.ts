// src/lib/contracts/projects.ts — isomorphic, type-only project DTOs (FR-401..FR-409, M2 S0.5).
import type { Cd, Certainty, ProjectRole } from '@/domain/types'
import type { ClientRef } from './clients'

/** The viewer's effective role on a project: managers are always MANAGER, even when they are members (M2-D17). */
export type ProjectAccessRole = 'MANAGER' | ProjectRole

/** `active` has the PersonOption meaning (M2-D16). */
export interface MemberUser {
  userId: string
  name: string
  nickname: string | null
  positionName: string | null
  color: string | null
  active: boolean
}

export interface ProjectMember extends MemberUser {
  role: ProjectRole
}

/** `/projects` and client-detail row. */
export interface ProjectListItem {
  id: string
  name: string
  code: string | null
  color: string
  certainty: Certainty
  archived: boolean
  client: ClientRef | null
  leads: MemberUser[]
  memberCount: number
  myRole: ProjectAccessRole
}

/**
 * Project layout header. `can.manage` = role ∈ {MANAGER, LEAD} and not archived; `can.unarchive` = role ∈
 * {MANAGER, LEAD} and archived; `can.delete` = role = MANAGER (archived too).
 */
export interface ProjectHeader {
  id: string
  name: string
  code: string | null
  color: string
  certainty: Certainty
  certaintyNote: string | null
  archived: boolean
  client: ClientRef | null
  myRole: ProjectAccessRole
  can: { manage: boolean; unarchive: boolean; delete: boolean }
}

/** ภาพรวม tab (FR-409 part): no load, progress or milestones in M2 (X15). `noLead` = no active LEAD (M2-D17). */
export interface ProjectOverview {
  project: ProjectHeader
  members: ProjectMember[]
  warnings: { noLead: boolean }
}

/** archiveProject (FR-406, X17, M6-D17): `releasedCd` = future counted load released by archiving (0 = none). */
export interface ArchiveProjectResult {
  changed: boolean
  releasedCd: Cd
}
