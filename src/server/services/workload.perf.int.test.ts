// M9 S2.12 — workload perf smoke (SPEC §9 NFR-03 at 2×, M9-D23): golden + addSyntheticWorkload (95 people, 20 projects,
// 12 weeks — the same composition as M12's seed:perf) → buildTable as manager over the default window returns 100
// people; median of 5 runs < 1 600 ms; badgeCount < 800 ms. Logged. Full measurement M12. Skipped with CI_SKIP_PERF=1.
import { describe, expect, it } from 'vitest'
import { addSyntheticWorkload, seedGolden } from '../../../scripts/lib/fixtures'
import { goldenUser } from '../../../tests/authz/_support/golden'
import { toSessionUser } from '../../../tests/helpers/as-user'
import { db } from '../db/client'
import { badgeCount, buildTable } from './workload'

const TODAY = '2026-09-30'

/** Median of `n` timed runs after one warm-up run (ms). */
async function medianMs(n: number, run: () => Promise<unknown>): Promise<number> {
  await run()
  const xs: number[] = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    await run()
    xs.push(performance.now() - t0)
  }
  xs.sort((a, b) => a - b)
  return xs[Math.floor(n / 2)]!
}

describe.skipIf(process.env.CI_SKIP_PERF === '1')('workload perf smoke (M9-D23)', () => {
  it('100 people × 12 weeks: buildTable < 1 600 ms, badgeCount < 800 ms (median of 5)', async () => {
    await seedGolden(db)
    await db.transaction((tx) => addSyntheticWorkload(tx, { people: 95, projects: 20, weeks: 12, from: '2026-09-28' }))
    const manager = toSessionUser(await goldenUser('Manager'))
    const window = { from: '2026-09-28', to: '2026-12-21' }
    const r = await buildTable(db, manager, { window }, TODAY)
    expect(r.groups.reduce((n, g) => n + g.people.length, 0)).toBe(100)
    const table = await medianMs(5, () => buildTable(db, manager, { window }, TODAY))
    const badge = await medianMs(5, () => badgeCount(db, manager, TODAY))
    console.info(`[perf] workload buildTable 100×12: ${table.toFixed(0)} ms · badgeCount: ${badge.toFixed(0)} ms`)
    expect(table).toBeLessThan(1600)
    expect(badge).toBeLessThan(800)
  })
})
