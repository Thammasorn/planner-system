// src/domain/overload.ts — SPEC §5.6 BR-40 (levels), BR-41 (causes, M9), BR-45 (tone bands, per view in M9),
// X06/X51/X67. Pure; integer cd only.
import type { Cd, LoadPair, LoadView, OverloadCause, OverloadStatus } from './types'

export type { OverloadCause, OverloadStatus }

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

const RANK = { OK: 0, RISK: 1, OVER: 2 } as const satisfies Record<OverloadLevel, 0 | 1 | 2>

/** OVER > RISK > OK; empty → OK. */
export function worstLevel(levels: Iterable<OverloadLevel>): OverloadLevel {
  let worst: OverloadLevel = 'OK'
  for (const l of levels) if (RANK[l] > RANK[worst]) worst = l
  return worst
}

/** OK 0, RISK 1, OVER 2. */
export function levelRank(level: OverloadLevel): 0 | 1 | 2 {
  return RANK[level]
}

/** BR-41: lost = standard − cap; lost > 0 && total > standard → BOTH; lost > 0 → CAPACITY; else WORKLOAD. */
export function overloadCause(totalCd: Cd, capCd: Cd, standardCd: Cd): OverloadCause {
  const lost = standardCd - capCd
  if (lost > 0 && totalCd > standardCd) return 'BOTH'
  if (lost > 0) return 'CAPACITY'
  return 'WORKLOAD'
}

/** X67: OVER → committed − cap; RISK → total − cap; OK → 0. */
export function overloadExcess(level: OverloadLevel, load: LoadPair, capCd: Cd): Cd {
  switch (level) {
    case 'OVER':
      return load.committed - capCd
    case 'RISK':
      return load.total - capCd
    case 'OK':
      return 0
  }
}

/** level (BR-40) + excess (X67) + cause (BR-41, null when OK). A deactivated week keeps its computed cause (X64);
 *  the UI relabels it (M9-D7). */
export function overloadStatus(load: LoadPair, capCd: Cd, standardCd: Cd): OverloadStatus {
  const level = overloadLevel(load, capCd)
  return {
    level,
    excessCd: overloadExcess(level, load, capCd),
    cause: level === 'OK' ? null : overloadCause(load.total, capCd, standardCd),
  }
}

/** FR-906 (M9-D18): the level rank went up, or the same non-OK level with a larger excess. */
export function worsened(before: OverloadStatus, after: OverloadStatus): boolean {
  const b = levelRank(before.level)
  const a = levelRank(after.level)
  if (a !== b) return a > b
  return a > 0 && after.excessCd > before.excessCd
}

export type TonePalette = 'load' | 'tentative'

/**
 * BR-45 per load view (X67, M9-D6). ALL → loadTone(total, cap); COMMITTED → loadTone(committed, cap);
 * AT_RISK → tentative palette: 'light' when total − committed > 0, else 'empty' (cap 0 → 'noCapacity' stripes).
 * loadCd = the number shown in the cell (= viewLoad).
 */
export function viewTone(load: LoadPair, capCd: Cd, view: LoadView): { tone: LoadTone; palette: TonePalette; loadCd: Cd } {
  switch (view) {
    case 'ALL':
      return { tone: loadTone(load.total, capCd), palette: 'load', loadCd: load.total }
    case 'COMMITTED':
      return { tone: loadTone(load.committed, capCd), palette: 'load', loadCd: load.committed }
    case 'AT_RISK': {
      const atRisk = load.total - load.committed
      const tone: LoadTone = capCd === 0 ? 'noCapacity' : atRisk > 0 ? 'light' : 'empty'
      return { tone, palette: 'tentative', loadCd: atRisk }
    }
  }
}
