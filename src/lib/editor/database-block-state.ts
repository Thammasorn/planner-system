// src/lib/editor/database-block-state.ts — client-only state of `database` blocks that must not live in the
// document (FR-1404, FR-1471, M11-D13/D38). Module stores keyed by the BlockNote block id / database id:
// - phase: 'creating' (slash insert → createDatabase in flight) or 'copying' (paste → copyDatabase in flight); the
//   block renders a sized placeholder meanwhile;
// - just created: the block was inserted by this tab's slash menu → the database view focuses its title once
//   (S3's DatabaseBlockView calls `consumeDatabaseJustCreated(blockId)` on mount);
// - titles: the last known title per database id (from qk.database) — clipboard text for other apps and the
//   paragraph a database block turns into inside a row body (M11-D38). Never sent to the server.
import { useSyncExternalStore } from 'react'

export type DatabaseBlockPhase = 'creating' | 'copying'

const phases = new Map<string, DatabaseBlockPhase>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function setDatabaseBlockPhase(blockId: string, phase: DatabaseBlockPhase | null): void {
  if (phase === null) {
    if (!phases.delete(blockId)) return
  } else {
    if (phases.get(blockId) === phase) return
    phases.set(blockId, phase)
  }
  emit()
}

export function getDatabaseBlockPhase(blockId: string): DatabaseBlockPhase | null {
  return phases.get(blockId) ?? null
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The block's in-flight phase (re-renders when it changes). */
export function useDatabaseBlockPhase(blockId: string): DatabaseBlockPhase | null {
  return useSyncExternalStore(
    subscribe,
    () => getDatabaseBlockPhase(blockId),
    () => null,
  )
}

const justCreated = new Set<string>()

export function markDatabaseJustCreated(blockId: string): void {
  justCreated.add(blockId)
}

/** True once for a block this tab's slash menu just created (focus the database title, FR-1404). */
export function consumeDatabaseJustCreated(blockId: string): boolean {
  return justCreated.delete(blockId)
}

const titles = new Map<string, string>()

export function rememberDatabaseTitle(databaseId: string, title: string): void {
  if (databaseId !== '') titles.set(databaseId.toLowerCase(), title)
}

/** The last known title of a database in this tab, or undefined. */
export function databaseTitleOf(databaseId: string): string | undefined {
  return titles.get(databaseId.toLowerCase())
}

/** Test helper. */
export function resetDatabaseBlockState(): void {
  phases.clear()
  justCreated.clear()
  titles.clear()
  emit()
}
