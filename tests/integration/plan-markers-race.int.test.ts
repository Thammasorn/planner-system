// tests/integration/plan-markers-race.int.test.ts — the 100-marker limit under concurrency (SPEC FR-819 "สูงสุด 100 เส้นต่อ
// โปรเจค", §7.10 createPlanMarker → VALIDATION; M7.1-D13: the count is taken after `select … from projects where id = $1
// for update`, so concurrent creates cannot exceed it; plan/m07.1 S5.4). Real concurrency through the app pool; an extra
// postgres.js client holds the project row lock and watches pg_stat_activity, so "both creates wait" is observed, never
// slept on.
import { count, and, eq, isNull } from 'drizzle-orm'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { PlanMarkerResult } from '@/lib/contracts/plan-markers'
import { PLAN_MARKER_LIMIT } from '@/lib/schemas/plan-markers'
import { createPlanMarker } from '@/server/actions/plan-markers'
import { db } from '@/server/db/client'
import { planMarkers } from '@/server/db/schema'
import { asUser } from '../helpers/as-user'
import { auditCount, auditRowsAfter } from '../helpers/audit'
import { createWorld, type World } from '../helpers/world'
import { fillMarkers, P_WORLD_MARKERS } from '../authz/rows/_m7_1'

let raw: postgres.Sql
beforeEach(() => {
  raw = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} })
})
afterEach(async () => {
  await raw.end({ timeout: 5 })
})

async function liveCount(projectId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(planMarkers)
    .where(and(eq(planMarkers.projectId, projectId), isNull(planMarkers.deletedAt)))
  return row?.n ?? 0
}

/** P at 99 live markers (2 from the world + 97). */
async function worldAt99(): Promise<World> {
  const w = await createWorld({ with: ['planMarkers'] })
  await fillMarkers({ projectId: w.P.id, existing: P_WORLD_MARKERS, total: PLAN_MARKER_LIMIT - 1, createdBy: w.lead })
  expect(await liveCount(w.P.id)).toBe(PLAN_MARKER_LIMIT - 1)
  return w
}

const create = (w: World, label: string): Promise<ActionResult<PlanMarkerResult>> =>
  createPlanMarker({ projectId: w.P.id, date: '2026-10-16', color: 'RED', label })

/** Exactly one ok and one VALIDATION; the table holds exactly 100 live markers; one audit row was written. */
async function expectOneWins(
  w: World,
  results: ActionResult<PlanMarkerResult>[],
  auditBefore: number,
): Promise<void> {
  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  expect(ok, JSON.stringify(results)).toHaveLength(1)
  expect(failed).toHaveLength(1)
  expect(failed.map((r) => (r.ok ? null : String(r.code)))).toEqual(['VALIDATION'])
  expect(await liveCount(w.P.id)).toBe(PLAN_MARKER_LIMIT)
  const audit = await auditRowsAfter(auditBefore)
  expect(audit).toHaveLength(1)
  expect(audit[0]).toMatchObject({ entity: 'plan_marker', projectId: w.P.id })
}

/** Resolves once at least `n` backends of this database wait on a lock; fails fast if `pending` settles first. */
async function lockWaiters(n: number, pending: Promise<unknown>, timeoutMs = 10_000): Promise<void> {
  let settled = false
  void pending.then(
    () => (settled = true),
    () => (settled = true),
  )
  const started = Date.now()
  for (;;) {
    const [row] = await raw<{ n: number }[]>`
      select count(*)::int as n from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`
    if ((row?.n ?? 0) >= n) return
    if (settled) throw new Error('the creates completed without waiting on the project row lock (M7.1-D13)')
    if (Date.now() - started > timeoutMs) throw new Error(`expected ${n} lock waiter(s) within ${timeoutMs} ms`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('plan markers — limit race (FR-819, M7.1-D13)', () => {
  it('two parallel creates at 99 live markers → exactly one succeeds', async () => {
    const w = await worldAt99()
    asUser(w.lead)
    const before = await auditCount()
    const results = await Promise.all([create(w, 'แข่ง A'), create(w, 'แข่ง B')])
    await expectOneWins(w, results, before)
  })

  it('forced interleaving: both creates wait on the project row lock, then exactly one succeeds', async () => {
    const w = await worldAt99()
    asUser(w.member)
    const before = await auditCount()
    let release!: () => void
    const released = new Promise<void>((r) => (release = r))
    let locked!: () => void
    const isLocked = new Promise<void>((r) => (locked = r))
    const holder = raw.begin(async (sql) => {
      await sql`select id from projects where id = ${w.P.id} for update`
      locked()
      await released
    })
    let both: Promise<ActionResult<PlanMarkerResult>[]> | undefined
    try {
      await isLocked
      both = Promise.all([create(w, 'แข่ง A'), create(w, 'แข่ง B')])
      // both creates (or at least their count step) must queue behind the row lock — no unlocked count-then-insert
      await lockWaiters(2, both)
    } finally {
      release() // never leave the lock open (the next test truncates every table)
      await holder
    }
    await expectOneWins(w, await both, before)
  })
})
