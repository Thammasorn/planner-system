// src/lib/contracts/leave-types.ts — leave type DTOs (FR-902, M5-D9/D10, plan/m05 S0.5). Type-only, isomorphic.

export interface LeaveTypeDTO {
  id: string
  name: string
  /** '#RRGGBB' (upper case). Used only as a chip border / swatch, never as a text background (M5-D10). */
  color: string
  archived: boolean
}

/** Settings table row: + order key and the number of live entries that use the type. */
export interface LeaveTypeAdminDTO extends LeaveTypeDTO {
  position: string
  usageCount: number
}

/** GET /api/leave-types (M5-D9): the active types in order. */
export interface LeaveTypesResponse {
  leaveTypes: LeaveTypeDTO[]
}

/** Snapshot returned by a hard delete; restoreLeaveType takes it back (same id/name/colour/position). */
export interface DeletedLeaveType {
  id: string
  name: string
  color: string
  position: string
  /** ISO timestamp with offset, or null. */
  archivedAt: string | null
}

/** M5-D10: a type that is referenced by any time_off row is archived instead of deleted. */
export type DeleteLeaveTypeResult =
  { outcome: 'deleted'; deleted: DeletedLeaveType } | { outcome: 'archived'; id: string }
