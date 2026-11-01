// src/lib/grid/versions.ts — one per-tab version registry shared by the grid save hook and the FR-612 dialog (M6-D14),
// plus the per-assignment conflict epochs that make older undo entries stale (M6-D13). Module-level state.

const versions = new Map<string, number>()
const epochs = new Map<string, number>()

/** Latest known version of an assignment (1 = the initial version when nothing is known yet). */
export function knownVersion(id: string): number {
  return versions.get(id) ?? 1
}

/** Remembers a version; keeps the max so a stale chunk can never move it back. */
export function rememberVersion(id: string, v: number): void {
  if (!Number.isSafeInteger(v) || v < 1) return
  if ((versions.get(id) ?? 0) < v) versions.set(id, v)
}

/** Bumped when a VERSION_CONFLICT hits the assignment; undo entries holding an older epoch are stale. */
export function conflictEpoch(id: string): number {
  return epochs.get(id) ?? 0
}
export function bumpConflictEpoch(id: string): void {
  epochs.set(id, conflictEpoch(id) + 1)
}

/** Tests only. */
export function resetVersions(): void {
  versions.clear()
  epochs.clear()
}
