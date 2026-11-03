// src/lib/contracts/milestones.ts — isomorphic, type-only milestone DTOs (SPEC §4.7, §5.9, §7.4/§7.5/§7.8;
// plan/m08 S0.3, M8-D3/D7/D8/D12/D16/D19). Loads never appear here (BR-72). Status is server-computed on full DTOs and
// client-computed (pure `milestoneStatus(m, useToday())`) on the light `MilestoneRef`.
import type { ISODate, MilestoneStatus } from '@/domain/types'

export type { MilestoneStatus }

/** M11.1 (FR-709, M11.1-D1): the line / ◆ colour; PURPLE (the M8 `--milestone`) is the default. */
export type MilestoneColor = 'PURPLE' | 'RED' | 'YELLOW' | 'GREEN' | 'BLUE'
export const MILESTONE_COLORS = [
  'PURPLE',
  'RED',
  'YELLOW',
  'GREEN',
  'BLUE',
] as const satisfies readonly MilestoneColor[]
export const DEFAULT_MILESTONE_COLOR: MilestoneColor = 'PURPLE'

/** Light reference used inside task responses; status computed client-side (M8-D7). */
export interface MilestoneRef {
  id: string
  name: string
  date: ISODate
  completedOn: ISODate | null
}

/** Live bound tasks at any depth (X66). */
export interface MilestoneProgress {
  done: number
  total: number
}

export interface MilestoneDTO extends MilestoneRef {
  projectId: string
  description: string | null
  /** M11.1 (FR-709) */
  color: MilestoneColor
  /** BR-70 with serverToday(). */
  status: MilestoneStatus
  /** BR-71 (M8-D6): ≥ 1 late bound task. */
  late: boolean
  lateTaskCount: number
  progress: MilestoneProgress
}

/** GET /api/projects/[id]/milestones — sorted by date then id (the UI puts DONE last). */
export interface ProjectMilestonesResponse {
  projectId: string
  today: ISODate
  canManage: boolean
  milestones: MilestoneDTO[]
}

/** GET /api/milestones/targets — projects where the viewer may create a milestone (M8-D18). */
export interface MilestoneTargetsResponse {
  projects: { id: string; name: string; color: string }[]
}

export interface CreateMilestoneResult {
  milestone: MilestoneDTO
}

export type MilestoneChangeKey = 'name' | 'date' | 'description' | 'completed' | 'color'

/** `completedOn` makes undo of complete/reopen exact (M8-D19). */
export interface MilestonePrevious {
  name: string
  date: ISODate
  description: string | null
  completed: boolean
  completedOn: ISODate | null
  color: MilestoneColor
}

export interface UpdateMilestoneResult {
  milestone: MilestoneDTO
  previous: MilestonePrevious
  changed: MilestoneChangeKey[]
}

export interface DeleteMilestoneResult {
  projectId: string
  milestoneId: string
  name: string
  batch: string
  unlinkedTaskCount: number
}

export interface RestoreMilestoneBatchResult {
  milestone: MilestoneDTO
}

/** One changed binding; `previousMilestoneId` is the RAW column value (M8-D14). */
export interface TaskMilestoneChange {
  taskId: string
  taskName: string
  previousMilestoneId: string | null
}

/** milestoneName/taskName feed the action's audit summaries (M8-D25); same project as the edited tasks, so nothing leaks. */
export interface LinkTasksResult {
  projectId: string
  milestoneId: string | null
  milestoneName: string | null
  changed: TaskMilestoneChange[]
}

export interface RevertTaskMilestonesResult {
  projectId: string
  changed: TaskMilestoneChange[]
}

/** Returned by grid saves (M8-D12): only milestones bound to the touched tasks or their ancestors. */
export interface MilestoneLateness {
  tasks: { taskId: string; lateForMilestone: boolean }[]
  milestones: { id: string; late: boolean; lateTaskCount: number }[]
}

/** CalendarResponse.milestones (M8-D16): live milestones of visible, non-archived projects in [from, to). */
export interface CalendarMilestone {
  id: string
  projectId: string
  projectName: string
  projectColor: string
  name: string
  date: ISODate
  color: MilestoneColor
  status: MilestoneStatus
  late: boolean
}
