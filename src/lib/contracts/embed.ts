// src/lib/contracts/embed.ts — GET /api/pages/:id/embed/{tasks,workload} (SPEC §4.13 FR-1301…1304, §7.8; plan/m10
// S0.6, M10-D2/D3/D11). Isomorphic, type-only. Loads are integer cd (BR-03).
import type { ISODate, LoadView } from '@/domain/types'
import type { ProjectTasksResponse } from './tasks'
import type { WorkloadCell } from './workload'

/** = M9's LoadView values; a projectWorkload block prop only (never a server parameter, M9-D2). */
export type WorkloadView = LoadView

/** A wiki page answers `{ kind: 'wiki' }` (200, no project data — M10-D3). */
export type EmbedTasksResponse =
  | { kind: 'wiki' }
  | {
      kind: 'project'
      projectId: string
      projectName: string
      /** `/projects/<id>/tasks`. */
      tasksHref: string
      /** M3's listProjectTasks payload, identical to the tasks tab (M10-D2); archived → viewer.canEdit false. */
      data: ProjectTasksResponse
    }

export interface EmbedWorkloadPerson {
  userId: string
  name: string
  deactivated: boolean
  /** Every week of `weeks`; masked parts have projectId null (M9-D8). */
  cells: Record<ISODate, WorkloadCell>
}

export type EmbedWorkloadResponse =
  | { kind: 'wiki' }
  | {
      kind: 'project'
      projectId: string
      projectName: string
      /** Archived project: its own allocations are not counted (BR-44); the block shows a note (M10-D11). */
      archived: boolean
      /** `/workload?projectId=<id>`. */
      workloadHref: string
      /** 8 Mondays from this week. */
      weeks: ISODate[]
      /** Project members ∩ visible people ∩ M9's population, sorted with compareThai by name. */
      people: EmbedWorkloadPerson[]
      /** Visible projects only (M9). */
      projects: Record<string, { name: string; color: string }>
    }
