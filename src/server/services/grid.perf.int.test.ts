// M6 S2.10 — grid perf smoke (SPEC §9 grid budgets at 2×, M6-D22, R5/R20): 200 leaves × 16 weeks ("Perf grid"),
// two 8-week chunks through buildChunk as Cindy, each < 1 000 ms. Full budgets are M11's. Skipped with CI_SKIP_PERF=1.
// M6.1 §7.4 / R16: listLiveWithBlockerCounts with the `hasBody` subquery on the same project stays < 2× its M6 shape
// (the identical select without `hasBody`, timed in the same run as the baseline); logged. Full budget in M12.
// M8 §7.4 / R2 / R14: 50 milestones on "Perf grid", each bound to 4 leaves → buildChunk (8 weeks) stays < 1 000 ms;
// the BR-71 lateness query (computeLateness, once per chunk) and latenessForTouchedTasks are timed and logged.
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { addSyntheticGridProject, seedGolden } from '../../../scripts/lib/fixtures'
import { goldenUser } from '../../../tests/authz/_support/golden'
import { toSessionUser } from '../../../tests/helpers/as-user'
import { addDays } from '../../domain/dates'
import { bindTask, makeMilestone, makeTaskBody } from '../../../tests/helpers/factories'
import { db } from '../db/client'
import { tasks, taskStatuses } from '../db/schema'
import { blockerCountSql, listLiveWithBlockerCounts } from '../repo/tasks'
import { buildChunk } from './grid'
import { computeLateness, latenessForTouchedTasks } from './milestones'

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

/** The M6 list query: listLiveWithBlockerCounts' select without the M6.1 `hasBody` column. */
function m6List(projectId: string) {
  return db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      parentId: tasks.parentId,
      depth: tasks.depth,
      position: tasks.position,
      name: tasks.name,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      certaintyOverride: tasks.certaintyOverride,
      statusId: tasks.statusId,
      statusCategory: taskStatuses.category,
      completedOn: tasks.completedOn,
      completedWeek: tasks.completedWeek,
      blockersOpen: blockerCountSql.open,
      blockersTotal: blockerCountSql.total,
    })
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.depth), sql`${tasks.parentId} asc nulls first`, asc(tasks.position), asc(tasks.id))
}

/** Timer noise floor (ms): both queries take a few ms, where scheduler jitter alone can exceed the ratio. */
const NOISE_MS = 5

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

  it('R16: listLiveWithBlockerCounts with hasBody on the 200-task project < 2× its M6 time (logged)', async () => {
    await seedGolden(db)
    const { projectId } = await addSyntheticGridProject(db, { tasks: 200, weeks: 16, from: '2026-09-28' })
    const some = await db
      .select({ id: tasks.id, projectId: tasks.projectId, createdBy: tasks.createdBy })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.id))
      .limit(20)
    // a mint: text bodies, an image-only body (jsonb_path_exists branch) and empty body rows
    for (const [i, t] of some.entries()) {
      if (i % 4 === 0) await makeTaskBody({ task: t, content: `รายละเอียด ${i}` })
      else if (i % 4 === 1) await makeTaskBody({ task: t, content: [{ type: 'image', props: { url: '/f/x' } }] })
      else if (i % 4 === 2) await makeTaskBody({ task: t })
    }
    const rows = await listLiveWithBlockerCounts(db, projectId)
    expect(rows).toHaveLength(220)
    expect(rows.filter((r) => r.hasBody).length).toBeGreaterThanOrEqual(5)

    const m6 = await medianMs(9, () => m6List(projectId))
    const m61 = await medianMs(9, () => listLiveWithBlockerCounts(db, projectId))
    console.info('[perf] listLiveWithBlockerCounts ms (median of 9)', {
      m6: Math.round(m6 * 10) / 10,
      withHasBody: Math.round(m61 * 10) / 10,
    })
    expect(m61, 'hasBody list vs M6 list').toBeLessThan(2 * m6 + NOISE_MS)
  })

  it('M8 §7.4: 50 milestones × 4 bound tasks — 8-week buildChunk < 1 s; lateness query timed (logged)', async () => {
    await seedGolden(db)
    const { projectId } = await addSyntheticGridProject(db, { tasks: 200, weeks: 16, from: '2026-09-28' })
    const cindy = toSessionUser(await goldenUser('Cindy'))
    const leaves = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNotNull(tasks.parentId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.id))
    expect(leaves.length).toBeGreaterThanOrEqual(200)
    const milestoneIds: string[] = []
    for (let i = 0; i < 50; i++) {
      // dates spread over the 16 weeks so some bound tasks end after their milestone (BR-71 late branch)
      const m = await makeMilestone({
        project: { id: projectId },
        name: `M${i}`,
        date: addDays('2026-09-28', i * 2),
        createdBy: cindy,
      })
      milestoneIds.push(m.id)
      for (const t of leaves.slice(i * 4, i * 4 + 4)) await bindTask(t, m)
    }
    // Planner statistics as autovacuum would leave them — the smoke measures the steady-state plan. lateFacts is
    // shaped to stay fast without them too (no second reference to the materialized `bound` CTE; verified by running
    // this case with the line removed: ~1 s total instead of > 18 s before the rewrite).
    await db.execute(sql`analyze tasks, milestones, task_assignments, allocations`)

    const t0 = performance.now()
    const g = await db.transaction(
      (tx) =>
        buildChunk(
          tx,
          cindy,
          { kind: 'project', id: projectId },
          { from: '2026-09-28', to: '2026-11-23', expand: [], zoom: 'week', includeOthers: false },
          '2026-09-30',
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
    const chunkMs = performance.now() - t0
    expect(g.milestones).toHaveLength(50)
    const taskRows = g.rows.filter((r) => r.kind === 'task')
    expect(taskRows.filter((r) => r.milestoneId !== null)).toHaveLength(200)
    expect(g.periods).toHaveLength(8)

    const lateMs = await medianMs(9, () => computeLateness(db, { projectId }))
    const touchedMs = await medianMs(9, () => latenessForTouchedTasks(db, [leaves[0]!.id]))
    const lat = await computeLateness(db, { projectId })
    expect(lat.byTask.size).toBe(200)
    console.info('[perf] milestones grid', {
      buildChunk: Math.round(chunkMs),
      latenessQueryMedian: Math.round(lateMs * 10) / 10,
      latenessForTouchedTasksMedian: Math.round(touchedMs * 10) / 10,
    })
    expect(chunkMs, 'buildChunk with 50 milestones').toBeLessThan(BUDGET_MS)
  })
})
