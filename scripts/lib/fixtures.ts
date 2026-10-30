// scripts/lib/fixtures.ts — golden seed (SPEC §11.3, X11, SEED-A1, PLAN.md §3.13). Builders go through the real
// services (audit with actor = null). M5 widens FixtureId to 'F2' | 'F3' | 'F4' and adds applyFixture; later
// milestones add stages. Reads docs/reference/golden-fixtures.json (never re-typed; seeds/tests only, never runtime).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import type { DbOrTx } from '@/server/db/types'
import * as repo from '@/server/repo'
import * as services from '@/server/services'

/** Seed stages in order; `upTo` stops after the named stage. M1: positions + users + schedules. */
export type GoldenStage = 'users'

/** Placeholder for resetDb's first parameter (only `resetDb()` / `resetDb(undefined, { extras })` type-check in M1). */
export type FixtureId = never

const FractionCd = z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)])

const GoldenUsers = z.object({
  positions: z.array(z.string()),
  users: z.array(
    z.object({
      nickname: z.string(),
      name: z.string(),
      email: z.string(),
      position: z.string(),
      role: z.enum(['manager', 'worker']),
      devPassword: z.string(),
      scheduleCd: z.record(z.string(), FractionCd),
    }),
  ),
})
export type Golden = z.infer<typeof GoldenUsers>

export const GOLDEN_PATH = path.join(process.cwd(), 'docs/reference/golden-fixtures.json')

let cached: Golden | undefined
/** The M1 part of the golden JSON (positions, users), validated. */
export function loadGolden(): Golden {
  cached ??= GoldenUsers.parse(JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')))
  return cached
}

/** Inserts the golden positions and users through the services (one shared demo-password hash, no forced change). */
// M1 has a single stage, so `upTo` changes nothing yet; later milestones return early after the named stage.
export async function seedGolden(db: DbOrTx, _opts: { upTo?: GoldenStage } = {}): Promise<void> {
  const g = loadGolden()
  const positionIds = new Map<string, string>()
  for (const name of g.positions) {
    const { id } = await services.positions.createPosition(db, null, { name })
    positionIds.set(name, id)
  }
  const hashes = new Map<string, string>()
  for (const pw of new Set(g.users.map((u) => u.devPassword))) hashes.set(pw, await hashPassword(pw))
  for (const u of g.users) {
    const positionId = positionIds.get(u.position) ?? (await repo.positions.findPositionIdByName(db, u.position))
    await services.employees.createEmployee(db, null, {
      name: u.name,
      nickname: u.nickname,
      email: u.email.trim().toLowerCase(),
      role: u.role,
      positionId,
      mustChangePassword: false,
      schedule: Object.entries(u.scheduleCd)
        .map(([weekday, fractionCd]) => ({ weekday: Number(weekday), fractionCd }))
        .sort((a, b) => a.weekday - b.weekday),
      passwordHash: hashes.get(u.devPassword)!,
    })
  }
}
