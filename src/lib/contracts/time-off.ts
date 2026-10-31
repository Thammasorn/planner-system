// src/lib/contracts/time-off.ts — leave write results (FR-903…909, M5-D5/D16; plan/m05 S0.5). Type-only, isomorphic.
import type { HalfDay, ISODate } from '@/domain/types'
import type { CapacityImpactWeek } from './capacity'

/** FR-906 capacity part (X23). `userName` = displayName of the person whose leave changed.
 *  Forward change (C36, M9-D18): M9 adds `overloads` and `onTimeOffDays` (additive); M5 adds no placeholders. */
export interface TimeOffImpact {
  userId: string
  userName: string
  weeks: CapacityImpactWeek[]
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
