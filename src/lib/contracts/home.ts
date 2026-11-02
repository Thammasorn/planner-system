// src/lib/contracts/home.ts — GET /api/home (SPEC §4.11 FR-1101, plan/m10 S0.6, M10-D13…D19/D34). Isomorphic,
// type-only. Loads are integer cd (BR-03); plan dates are ISODate strings; `now` is an ISO instant from serverNow().
import type { Cd, ISODate } from '@/domain/types'
import type { CalendarTimeOff } from './calendar'
import type { CalendarMilestone } from './milestones'
import type { MyBucketTask } from './tasks'
import type { OverloadItem, WorkloadCell } from './workload'

/** M9's FR-1009 bucket item of THIS_WEEK (M10-D13). href built on the client: `/projects/<pid>/tasks?task=<id>`. */
export type HomeTaskItem = MyBucketTask

/** One Monday of "ภาระของฉัน 8 สัปดาห์" (M10-D14): M9 personCells; the tone comes from viewTone on the client. */
export interface HomeLoadWeek {
  week: ISODate
  cell: WorkloadCell
}

/** M8's milestone (status + late computed by M8). Never status 'DONE' on home (M10-D15). */
export type HomeMilestone = CalendarMilestone

/** One leave line item (M10-D16). `entry` is M5's masked shape unless the viewer is a manager or the person (X60b). */
export interface HomeLeaveEntry {
  userId: string
  name: string
  entry: CalendarTimeOff
}

export interface HomeLeave {
  today: HomeLeaveEntry[]
  /** Overlapping this week, not already listed under today. */
  thisWeek: HomeLeaveEntry[]
  nextWeek: HomeLeaveEntry[]
}

/** M10-D17: live DOC pages (M6.1 forward note) — wiki pages and pages of visible projects (archived included). */
export interface HomeRecentPage {
  id: string
  title: string
  icon: string | null
  /** null = the team wiki (shown as th.palette.wiki). */
  projectName: string | null
  /** ISO instant. */
  updatedAt: string
  updatedBy: { id: string; name: string }
  /** `/p/<id>`. */
  href: string
}

/** One week (or the 4-week total) of team utilisation over M9's population (M10-D18, X67). */
export interface HomeUtilisationWeek {
  week: ISODate
  totalCd: Cd
  committedCd: Cd
  capacityCd: Cd
  /** percentTenths(totalCd, capacityCd): 725 = 72.5 %; null when capacity is 0. */
  percentTenths: number | null
  committedPercentTenths: number | null
}

export interface HomeManagerCards {
  /** OVER and RISK this week and next (M9 OverloadItem order). */
  overloaded: OverloadItem[]
  utilisation: {
    weeks: HomeUtilisationWeek[]
    /** `week` = the first Monday of the 4-week window. */
    total: HomeUtilisationWeek
  }
}

export interface HomeResponse {
  today: ISODate
  /** ISO instant of serverNow() — relative times are computed against it (one clock). */
  now: string
  weekStart: ISODate
  myTasks: { items: HomeTaskItem[]; more: number }
  /** Exactly 8 weeks from weekStart. */
  myLoad: HomeLoadWeek[]
  milestones: HomeMilestone[]
  leave: HomeLeave
  /** ≤ 8. */
  recentPages: HomeRecentPage[]
  /** null for every non-manager (FR-1101f). */
  manager: HomeManagerCards | null
}
