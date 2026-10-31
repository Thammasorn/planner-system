// src/lib/invalidate.ts — grouped TanStack invalidations so features don't forget views (PLAN.md §3.5, X18).
import type { QueryClient } from '@tanstack/react-query'
import { qk, qkPrefix } from './query-keys'

async function invalidateAll(qc: QueryClient, keys: readonly (readonly unknown[])[]): Promise<void> {
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

/** Every view that shows load numbers: grid, workload, home, tasks.my (FR-405 certainty changes, allocations, …). */
export function invalidateLoad(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [qkPrefix.grid, qkPrefix.workload, qkPrefix.home, qkPrefix.myTasks])
}

/** After any project / member / client mutation: the sidebar and every client-options picker (M2-D08). */
export function invalidateProjects(qc: QueryClient): Promise<void> {
  return invalidateAll(qc, [qk.sidebar(), qkPrefix.clientOptions])
}
