// src/lib/contracts/workload.ts — isomorphic, type-only DTOs of the workload / people / load views (SPEC §4.10
// FR-1001…1008, FR-409/FR-303 load parts, §3.3 masking; plan/m09 S0.3, M9-D2/D8/D9/D14/D16/D19/D20).
// Names are fixed for M10 (home, embed). Loads are integer cd (BR-03); dates are ISODate strings.
import type { Cd, Certainty, ISODate, LoadPair, OverloadCause } from '@/domain/types'
import type { OverloadLevel } from '@/domain/overload'
import type { CalendarTimeOff } from './calendar'

export type { OverloadCause, OverloadLevel }

/** Per-project share of a cell. projectId null = all projects the viewer may not see, combined
 *  (rendered as th.masking.otherProjects; no id, no count, no name — M9-D8). */
export interface WorkloadProjectPart {
  projectId: string | null
  total: Cd
  committed: Cd
}

export interface WorkloadCell {
  /** Counted load (BR-37, BR-44, BR-50). */
  total: Cd
  committed: Cd
  /** BR-11 capacity / BR-41 standard (M5, X64). */
  capacity: Cd
  standard: Cd
  /** BR-40, X67 excess, BR-41 cause (null when OK). */
  level: OverloadLevel
  excess: Cd
  cause: OverloadCause | null
  /** M9-D8; [] when total = 0. */
  byProject: WorkloadProjectPart[]
}

export interface WorkloadPerson {
  userId: string
  /** displayName (FR-210). */
  name: string
  positionId: string | null
  active: boolean
  deactivatedOn: ISODate | null
  /** Every week of `WorkloadResponse.weeks`. */
  cells: Record<ISODate, WorkloadCell>
}

/** name = position name | th.workload.noPosition. */
export interface WorkloadGroup {
  positionId: string | null
  name: string
  people: WorkloadPerson[]
}

export interface OverloadItem {
  userId: string
  name: string
  week: ISODate
  level: 'RISK' | 'OVER'
  excess: Cd
  cause: OverloadCause
  total: Cd
  committed: Cd
  capacity: Cd
  standard: Cd
  deactivatedOn: ISODate | null
  /** `/people/${userId}/plan?week=${week}` (M9-D10). */
  href: string
}

/** = the parsed workloadQuerySchema output with the route's default window applied (M9-D22). */
export interface WorkloadParams {
  from: ISODate
  to: ISODate
  positionId: string | null
  projectId: string | null
  onlyOver: boolean
}

/** GET /api/workload (M9-D2). */
export interface WorkloadResponse {
  from: ISODate
  to: ISODate
  today: ISODate
  weeks: ISODate[]
  groups: WorkloadGroup[]
  /** All positions in order (filter options). */
  positions: { id: string; name: string }[]
  /** Visible projects referenced by byProject only. */
  projects: Record<string, { name: string; color: string }>
  /** FR-1006 list for the selected people and window (M9-D10). */
  overloads: OverloadItem[]
}

export type WorkloadCellItem =
  | {
      kind: 'task'
      taskId: string
      taskName: string
      parentPath: string[]
      projectId: string
      projectName: string
      projectColor: string
      load: LoadPair
      certainty: Certainty
      completed: boolean
      /** `/projects/${projectId}/plan?task=${taskId}`. */
      href: string
    }
  /** label = th.masking.otherProjects; no id, no count. */
  | { kind: 'masked'; label: string; load: LoadPair }

/** GET /api/workload/cell (M9-D9). */
export interface WorkloadCellDetail {
  userId: string
  name: string
  week: ISODate
  cell: WorkloadCell
  items: WorkloadCellItem[]
}

/** GET /api/workload/badge (M9-D11): OVER cells in [from, to) = [weekStart(today), +4 w). */
export interface WorkloadBadgeResponse {
  overCount: number
  from: ISODate
  to: ISODate
}

// ── /people (M9-D14) ──

export interface PeopleDirectoryPerson {
  userId: string
  name: string
  fullName: string
  positionName: string | null
  active: boolean
  thisWeek: WorkloadCell
}

/** GET /api/people. */
export interface PeopleDirectoryResponse {
  week: ISODate
  groups: { positionId: string | null; name: string; people: PeopleDirectoryPerson[] }[]
}

export interface PersonHeader {
  userId: string
  name: string
  fullName: string
  nickname: string | null
  positionName: string | null
  active: boolean
  deactivatedOn: ISODate | null
  schedule: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, Cd>>
  isSelf: boolean
  /** self || manager (M5 rules). */
  canEditLeave: boolean
}

/** GET /api/people/[userId]/time-off (M9-D16). */
export interface PersonTimeOffResponse {
  from: ISODate
  to: ISODate
  entries: CalendarTimeOff[]
  canEdit: boolean
}

// ── FR-409 / FR-303 (M9-D19/D20) ──

export interface ProjectLoadMember {
  userId: string
  name: string
  role: 'LEAD' | 'MEMBER' | null
  active: boolean
  thisWeek: LoadPair
  sum: LoadPair
}

/** GET /api/projects/[id]/load. */
export interface ProjectLoadResponse {
  projectId: string
  archived: boolean
  weeks: ISODate[]
  members: ProjectLoadMember[]
  weekly: Record<ISODate, LoadPair>
  sum: LoadPair
}

/** GET /api/clients/[id]/load. */
export interface ClientLoadResponse {
  clientId: string
  weeks: ISODate[]
  sum: LoadPair
  projects: { projectId: string; sum: LoadPair }[]
}
