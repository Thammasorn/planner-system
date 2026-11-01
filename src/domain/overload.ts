// src/domain/overload.ts — SPEC §5.6 BR-40 (levels) and BR-45 (tone bands), X06/X51/X67. Pure; integer cd only.
// BR-41 (causes) and excess are M9.
import type { Cd } from './types'

export type OverloadLevel = 'OK' | 'RISK' | 'OVER'
export type LoadTone = 'empty' | 'light' | 'full' | 'over' | 'noCapacity'

/** BR-40 per person per week (or per day in day zoom): committed > cap → OVER; total > cap → RISK; else OK. */
export function overloadLevel(load: { total: Cd; committed: Cd }, capCd: Cd): OverloadLevel {
  if (load.committed > capCd) return 'OVER'
  if (load.total > capCd) return 'RISK'
  return 'OK'
}

/**
 * BR-45 with integer bands (no float ratio): cap 0 → 'over' when load > 0, else 'noCapacity'; load > cap → 'over';
 * 5·load ≥ 4·cap (ratio ≥ 0.8) → 'full'; load > 0 → 'light'; else 'empty'.
 */
export function loadTone(loadCd: Cd, capCd: Cd): LoadTone {
  if (capCd === 0) return loadCd > 0 ? 'over' : 'noCapacity'
  if (loadCd > capCd) return 'over'
  if (5 * loadCd >= 4 * capCd) return 'full'
  if (loadCd > 0) return 'light'
  return 'empty'
}

const RANK: Record<OverloadLevel, number> = { OK: 0, RISK: 1, OVER: 2 }

/** OVER > RISK > OK; empty → OK. */
export function worstLevel(levels: Iterable<OverloadLevel>): OverloadLevel {
  let worst: OverloadLevel = 'OK'
  for (const l of levels) if (RANK[l] > RANK[worst]) worst = l
  return worst
}
