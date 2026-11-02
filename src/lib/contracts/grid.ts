// src/lib/contracts/grid.ts — isomorphic, type-only planning-grid DTOs (SPEC §7.4 + X65/X85, plan/m06 S0.4, M6-D2/D3).
// Names are fixed for M7–M9 (they extend these types additively). Loads are integer cd; dates are ISODate strings.
import type { Cd, Certainty, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type { MilestoneDTO, MilestoneLateness } from './milestones'

export type { LoadPair, PeriodKey }

/** Client zoom key; the URL uses `week` | `day` (S3.2 gridChunkUrl, X85). */
export type GridZoom = 'WEEK' | 'DAY'

/** One period column of a chunk. M6: WEEK only (`key = W:<Monday>`, `date = weekStart`). M7 adds `expanded?: true`. */
export interface GridPeriod {
  key: PeriodKey
  kind: 'WEEK' | 'DAY'
  weekStart: ISODate
  date: ISODate
  /** M7 (M7-D10): an expanded week contributes its D: periods followed by its W: period with `expanded: true`
   *  (the narrow "รวม" column). Absent on collapsed weeks. */
  expanded?: true
}

/** Day-cell warnings (M7-D9 cap-0 day, M7-D15 time-off date); only on D: cells with cd > 0. */
export type DayWarn = 'NON_WORKING' | 'TIME_OFF'

export interface AssigneeCell {
  /** W: the week total (Σ days for DAY weeks). */
  cd: Cd
  resolution: 'WEEK' | 'DAY'
  /** M7: true on D: cells of WEEK weeks (BR-20, display-only BR-21 spread; such cd may exceed 100). */
  derived: boolean
  /** W: cells of DAY weeks only (tooltip, 2 decimals). */
  days?: Record<ISODate, Cd>
  /** M7 (BR-21a, M7-D9): W: cells of WEEK weeks whose week capacity is 0 — how the derived days were spread. */
  fallback?: 'SCHEDULE' | 'WEEKDAYS'
  /** M7 (M7-D9, M7-D15): D: cells with cd > 0 on a cap-0 day / a time-off date. */
  warn?: DayWarn[]
}

/** Authoritative state of one (assignment, week) — save results, undo snapshots, FR-612 preview. */
export interface WeekState {
  cd: Cd
  resolution: 'WEEK' | 'DAY' | null
  days?: Record<ISODate, Cd>
}

/** Leave entry of a grid person; `label` is masked server-side for non-manager/non-owner viewers (§3.3). */
export interface GridTimeOff {
  start: ISODate
  end: ISODate
  half: 'AM' | 'PM' | null
  label: string
}

export interface GridPerson {
  /** displayName (FR-210). */
  name: string
  /** false = deactivated ("ปิดใช้งาน", AC-203). */
  active: boolean
  deactivatedOn: ISODate | null
  /** W: keys in M6. M7 (M7-D19) adds D: keys for every day of expanded weeks and of weeks where this person
   *  has a DAY-resolution cell; zeros omitted; missing = 0. */
  capacity: Partial<Record<PeriodKey, Cd>>
  standard: Partial<Record<PeriodKey, Cd>>
  timeOff: GridTimeOff[]
  /** Only with includeOthers (X29); numbers only — never names or ids of other projects. */
  otherProjects?: Partial<Record<PeriodKey, LoadPair>>
}

export interface GridTaskRow {
  kind: 'task'
  id: string
  depth: 0 | 1 | 2
  name: string
  parentId: string | null
  hasChildren: boolean
  certainty: Certainty
  certaintySource: 'task' | 'ancestor' | 'project'
  certaintySourceName: string | null
  completed: boolean
  /** BR-50 (M7 uses it at day level). */
  completedWeek: ISODate | null
  /** Live milestone (M8, X28/X85 via LIVE_MILESTONE_ON). */
  milestoneId: string | null
  lateForMilestone: boolean
  /** FR-643, BR-86 (X76). */
  blockers: { open: number; total: number }
  assigneeCount: number
  /** Counted load (BR-50); leaves summed for parents. */
  totals: Partial<Record<PeriodKey, LoadPair>>
}

export interface GridAssigneeRow {
  kind: 'assignee'
  taskAssignmentId: string
  taskId: string
  userId: string
  version: number
  /** context.canEdit && the task is a leaf. */
  editable: boolean
  /** Counted load over the timeline bound (M6-D7). */
  rowTotal: LoadPair
  cells: Partial<Record<PeriodKey, AssigneeCell>>
}

/** M9 adds 'masked' | 'project'. */
export type GridRow = GridTaskRow | GridAssigneeRow

/** M8-D8 (C19): all live milestones of the project (not windowed), date then id. */
export type GridMilestone = MilestoneDTO

export interface GridResponse {
  /** canManage (M8-D8) = M/L and not archived; M9 widens it to GridContextInfo ('project' | 'person', X85). */
  context: { kind: 'project'; id: string; name: string; archived: boolean; canEdit: boolean; canManage: boolean }
  /** expand [] / zoom 'week' in M6. */
  window: { from: ISODate; to: ISODate; expand: ISODate[]; zoom: 'week' | 'day'; includeOthers: boolean }
  today: ISODate
  periods: GridPeriod[]
  /** Depth-first; each task row followed by its assignee rows (created_at, id). */
  rows: GridRow[]
  milestones: GridMilestone[]
  people: Record<string, GridPerson>
  holidays: { date: ISODate; name: string }[]
}

// ── save (X65, M6-D3/D4/D34) ──

/** cd null/0 = delete. WEEK: period is the Monday; DAY: period is the day. */
export interface AllocationChange {
  granularity: 'WEEK' | 'DAY'
  period: ISODate
  cd: Cd | null
}
/** M7 alias. */
export type Change = AllocationChange
export type OnDayWeekConflict = 'SCALE' | 'COLLAPSE'

export interface SaveAllocationsItem {
  taskAssignmentId: string
  baseVersion: number
  changes: AllocationChange[]
}
export interface SaveAllocationsInput {
  items: SaveAllocationsItem[]
  onDayWeekConflict?: OnDayWeekConflict
  clientOpId: string
}
export interface SaveItemResult {
  taskAssignmentId: string
  version: number
  weeks: Record<ISODate, WeekState>
  rowTotal: LoadPair
}
/** ALLOCATED_ON_TIME_OFF: M7 (M7-D15). */
export type SaveWarningCode =
  'WORK_ON_NON_WORKING_DAY' | 'WEEK_NO_CAPACITY' | 'SPILLED_OVER_DAY_LIMIT' | 'ALLOCATED_ON_TIME_OFF'
export interface SaveWarning {
  code: SaveWarningCode
  taskAssignmentId: string
  week: ISODate
  date?: ISODate
}
/** lateness (M8-D12, X85): milestones bound to the touched tasks or their ancestors; null when none. */
export interface SaveAllocationsOk {
  results: SaveItemResult[]
  warnings: SaveWarning[]
  lateness: MilestoneLateness | null
}
/** ActionError extra on VERSION_CONFLICT (read through `ActionFailure.extra`, M6-D25). */
export interface VersionConflictPayload {
  current: SaveItemResult[]
}
/** ActionError extra on NEEDS_CHOICE (M7-D3, BR-24): every (assignment, week) whose DAY plan needs a SCALE/COLLAPSE
 *  choice; `week` = `weeks[0]` (SPEC §7.4-compatible). Nothing was written. */
export interface NeedsChoicePayload {
  week: ISODate
  weeks: ISODate[]
  pairs: { taskAssignmentId: string; week: ISODate }[]
}
/** M7 removed M6's read-only day-week reason (M6-D34): BR-22/BR-24 make every DAY week editable (G25). */
export type SaveValidationReason = 'MAX' | 'NEGATIVE' | 'MIXED_WEEK_AND_DAY' | 'UNREPRESENTABLE'
export interface SaveValidationIssue {
  taskAssignmentId: string
  period: ISODate
  reason: SaveValidationReason
}

// ── FR-612 / BR-25 (M6-D6) ──

export interface PlanAssignmentRangeInput {
  taskAssignmentId: string
  /** null only for dryRun. */
  baseVersion: number | null
  totalCd: Cd
  start: ISODate
  end: ISODate
  dryRun: boolean
  clientOpId: string
}
export interface PlanRangeWeek {
  week: ISODate
  kind: 'WHOLE' | 'BOUNDARY'
  before: WeekState
  after: WeekState
  capacityCd: Cd
}
export interface PlanRangePreview {
  version: number
  weeks: PlanRangeWeek[]
  totalCd: Cd
  capacityCd: Cd
  overCapacityCd: Cd
  warnings: SaveWarning[]
}
/** applied = null when dryRun; lateness null when dryRun or nothing bound (M8-D12). */
export interface PlanAssignmentRangeOk {
  preview: PlanRangePreview
  applied: SaveItemResult | null
  lateness: MilestoneLateness | null
}

// ── M7 day loads (M7-D27) ──

/** Server-internal row of repo.allocations.dayLoadsForProjects, consumed by src/lib/grid/day.ts#spreadDayLoads (M7, M9).
 *  Grouped by user / week / granularity / period; WEEK rows have `periodStart = weekStart`. */
export interface DayLoadRow {
  userId: string
  weekStart: ISODate
  granularity: 'WEEK' | 'DAY'
  periodStart: ISODate
  totalCd: Cd
  committedCd: Cd
}
