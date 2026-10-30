// tests/helpers/world.ts — the standard permission world (PLAN.md §4.3, X91).
// M1: four users; M2 adds projects P/Q/A (lead = LEAD of P, member = MEMBER of P, outsider = MEMBER of Q only).
// The four role users stay top-level; extra users added by later parts live under `w.users.<name>`.
import { makeUser, type TestUser } from './factories'

/** Pinned part list (X91); each milestone adds the builder for its part(s).
 *  M3 tasks · M4 pages, files · M5 timeOff · M6 allocations · M7 dayAllocations · M8 milestones */
export type WorldPart =
  'tasks' | 'pages' | 'files' | 'timeOff' | 'allocations' | 'dayAllocations' | 'milestones'

/** Fixed build order of the parts. */
export const WORLD_PART_ORDER: readonly WorldPart[] = [
  'tasks',
  'pages',
  'files',
  'timeOff',
  'allocations',
  'dayAllocations',
  'milestones',
]

/** Implications; the owning milestone adds its entry (M6 allocations → tasks + timeOff, M7 dayAllocations →
 *  allocations, M8 milestones → tasks + allocations). */
export const WORLD_PART_IMPLIES: Partial<Record<WorldPart, readonly WorldPart[]>> = {}

export interface World {
  manager: TestUser
  lead: TestUser
  member: TestUser
  outsider: TestUser
  /** Extra users added by later parts (M3 former, M5 coworker/pOnly). */
  users: Record<string, TestUser>
}

type PartBuilder = (w: World) => Promise<void>
/** Builders by part; empty until the owning milestone lands. */
const BUILDERS: Partial<Record<WorldPart, PartBuilder>> = {}

/** Transitive closure over WORLD_PART_IMPLIES. */
export function expandParts(parts: readonly WorldPart[]): Set<WorldPart> {
  const out = new Set<WorldPart>()
  const stack = [...parts]
  while (stack.length > 0) {
    const p = stack.pop()!
    if (out.has(p)) continue
    out.add(p)
    stack.push(...(WORLD_PART_IMPLIES[p] ?? []))
  }
  return out
}

export async function createWorld(opts: { with?: readonly WorldPart[] } = {}): Promise<World> {
  const parts = expandParts(opts.with ?? [])
  for (const p of parts) if (!BUILDERS[p]) throw new Error(`world part ${p} has no builder yet`)
  const manager = await makeUser({ role: 'manager', name: 'World Manager', nickname: 'Manager' })
  const lead = await makeUser({ role: 'worker', name: 'World Lead', nickname: 'Lead' })
  const member = await makeUser({ role: 'worker', name: 'World Member', nickname: 'Member' })
  const outsider = await makeUser({ role: 'worker', name: 'World Outsider', nickname: 'Outsider' })
  const w: World = { manager, lead, member, outsider, users: {} }
  for (const p of WORLD_PART_ORDER) if (parts.has(p)) await BUILDERS[p]!(w)
  return w
}
