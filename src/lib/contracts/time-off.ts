// src/lib/contracts/time-off.ts — leave write results (FR-903…909, M5-D5/D16; plan/m05 S0.5). Type-only, isomorphic.
import type { OverloadLevel } from '@/domain/overload'
import type { Cd, HalfDay, ISODate, LoadPair, OverloadCause } from '@/domain/types'
import type { CapacityImpactWeek } from './capacity'

/** FR-906 overload part (M9-D18, X23): one affected week whose status worsened after the leave write. */
export interface OverloadImpactLine {
  week: ISODate
  before: { level: OverloadLevel; excessCd: Cd }
  after: { level: 'RISK' | 'OVER'; excessCd: Cd; cause: OverloadCause }
  load: LoadPair
  capacityCd: Cd
  standardCd: Cd
  /** name = project name | th.masking.otherProjects (projectId null = every hidden project combined). */
  parts: { projectId: string | null; name: string; load: LoadPair }[]
  /** `/people/${userId}/plan?week=${week}`. */
  href: string
}

/** FR-906 (X23). `userName` = displayName of the person whose leave changed. M5: capacity per week; M9 (C36,
 *  M9-D18) adds the worsened overload lines and the M7-D15 "work planned on leave days" sums. */
export interface TimeOffImpact {
  userId: string
  userName: string
  weeks: CapacityImpactWeek[]
  /** M9-D18; [] when nothing worsened. */
  overloads: OverloadImpactLine[]
  /** M7-D15 line: Σ the user's DAY rows on the new leave dates; [] when none. No task names. */
  onTimeOffDays: { date: ISODate; cd: Cd }[]
}

export interface TimeOffSaveResult {
  id: string
  impact: TimeOffImpact
}

/** deleteTimeOff → the undo entry calls restoreTimeOff({ batch }) (X04). */
export interface TimeOffDeleteResult {
  batch: string
  userId: string
  startDate: ISODate
  endDate: ISODate
  half: HalfDay | null
}

export interface TimeOffRestoreResult {
  restored: number
  userId: string
}
