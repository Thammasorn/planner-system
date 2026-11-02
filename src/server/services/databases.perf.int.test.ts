// M11 S2.15 — database GET perf smoke (SPEC §9 NFR-11 at 2×, M11-D32): a 1,000 × 20 database built by
// addSyntheticDatabase on a world page → getDatabase as a member, 20 runs, p95 logged; fails above 1,000 ms. The full
// measurement is M12's. Skipped with CI_SKIP_PERF=1.
import { describe, expect, it } from 'vitest'
import { addSyntheticDatabase } from '../../../scripts/lib/perf-data'
import { toSessionUser } from '../../../tests/helpers/as-user'
import { createWorld } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { getDatabase } from './databases'

describe.skipIf(process.env.CI_SKIP_PERF === '1')('databases perf smoke (M11-D32)', () => {
  it('GET of 1,000 rows × 20 columns: p95 of 20 runs < 1,000 ms; the JSON carries no email', async () => {
    const w = await createWorld({ with: ['pages'] })
    const { databaseId } = await addSyntheticDatabase(db, { pageId: w.pages.pChild.id, rows: 1000, columns: 20 })
    const member = toSessionUser(w.member)
    const ids = { pageId: w.pages.pChild.id, databaseId }
    const first = await getDatabase(db, member, ids)
    expect(first.rows).toHaveLength(1000)
    expect(first.columns).toHaveLength(20)
    expect(JSON.stringify(first)).not.toContain('@')
    const xs: number[] = []
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now()
      await getDatabase(db, member, ids)
      xs.push(performance.now() - t0)
    }
    xs.sort((a, b) => a - b)
    const p95 = xs[Math.ceil(0.95 * xs.length) - 1]!
    console.info(`[perf] database GET 1,000 × 20: p95 ${p95.toFixed(0)} ms`)
    expect(p95).toBeLessThan(1000)
  })
})
