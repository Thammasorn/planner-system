// src/lib/contracts/capacity.ts — capacity DTOs (BR-10…13, BR-41, FR-906; plan/m05 S0.5). Type-only, isomorphic.
import type { Cd, ISODate } from '@/domain/types'

/** capacityCd = after holidays, leave and deactivation (BR-10); standardCd = schedule only (BR-41, X64). */
export interface PeriodCapacity {
  capacityCd: Cd
  standardCd: Cd
}

/** Keyed by day (ISODate) and by week start (Monday ISODate). */
export interface UserCapacity {
  days: Record<ISODate, PeriodCapacity>
  weeks: Record<ISODate, PeriodCapacity>
}

/** FR-906 (M5-D5): one affected week, before vs after the leave write. */
export interface CapacityImpactWeek {
  weekStart: ISODate
  beforeCd: Cd
  afterCd: Cd
}
