// src/lib/contracts/users.ts — isomorphic, type-only DTOs for users, employees and positions (M1, S0.11).
import type { Cd, ISODate, Weekday } from '@/domain/types'

export type SystemRoleDTO = 'manager' | 'worker'

/** The signed-in user as client components see it (no session fields). */
export interface CurrentUserDTO {
  id: string
  email: string
  name: string
  nickname: string | null
  displayName: string
  role: SystemRoleDTO
  color: string | null
}

export interface ScheduleDayDTO {
  weekday: Weekday
  fractionCd: Cd
}

/** /settings/employees row (FR-209). Never carries password data. */
export interface EmployeeRow {
  id: string
  name: string
  nickname: string | null
  displayName: string
  email: string
  role: SystemRoleDTO
  positionId: string | null
  positionName: string | null
  color: string | null
  active: boolean
  deactivatedOn: ISODate | null
  mustChangePassword: boolean
  schedule: ScheduleDayDTO[]
}

/** /settings/positions row; `userCount` counts active and deactivated users (FR-208 delete guard). */
export interface PositionRow {
  id: string
  name: string
  position: string
  userCount: number
}

/** Active users for pickers (AC-203 M1 part, X12). */
export interface AssignableUser {
  id: string
  name: string
  nickname: string | null
  color: string | null
  positionName: string | null
}

/** Returned by deletePosition and sent back by restorePosition (M1-D14). */
export interface DeletedPosition {
  id: string
  name: string
  position: string
}
