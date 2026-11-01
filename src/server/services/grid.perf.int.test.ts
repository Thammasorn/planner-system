// M6 S2.10 — grid perf smoke (SPEC §9 grid budgets at 2×, M6-D22, R5/R20): 200 leaves × 16 weeks ("Perf grid"),
// two 8-week chunks through buildChunk as Cindy, each < 1 000 ms. Full budgets are M11's. Skipped with CI_SKIP_PERF=1.
import { describe, expect, it } from 'vitest'
import { addSyntheticGridProject, seedGolden } from '../../../scripts/lib/fixtures'
import { goldenUser } from '../../../tests/authz/_support/golden'
import { toSessionUser } from '../../../tests/helpers/as-user'
import { db } from '../db/client'
import { buildChunk } from './grid'

const BUDGET_MS = 1000

describe.skipIf(process.env.CI_SKIP_PERF === '1')('grid perf smoke (M6-D22)', () => {
  it('two 8-week chunks of a 200-task project each build in < 1 s; 220 task rows + 200 assignee rows', async () => {
    await seedGolden(db)
    const { projectId } = await addSyntheticGridProject(db, { tasks: 200, weeks: 16, from: '2026-09-28' })
    const cindy = toSessionUser(await goldenUser('Cindy'))
    const timings: number[] = []
    for (const [from, to] of [
      ['2026-09-28', '2026-11-23'],
      ['2026-11-23', '2027-01-18'],
    ] as const) {
      const t0 = performance.now()
      const g = await db.transaction(
        (tx) =>
          buildChunk(
            tx,
            cindy,
            { kind: 'project', id: projectId },
            { from, to, expand: [], zoom: 'week', includeOthers: false },
            '2026-09-30',
          ),
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
      const ms = performance.now() - t0
      timings.push(ms)
      expect(g.rows.filter((r) => r.kind === 'task')).toHaveLength(220)
      expect(g.rows.filter((r) => r.kind === 'assignee')).toHaveLength(200)
      expect(g.periods).toHaveLength(8)
      expect(ms, `buildChunk ${from}..${to}`).toBeLessThan(BUDGET_MS)
    }
    console.info('[perf] grid buildChunk ms', timings.map((t) => Math.round(t)))
  })
})
