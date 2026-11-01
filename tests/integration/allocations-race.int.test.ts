// tests/integration/allocations-race.int.test.ts — BR-20b under concurrency (SPEC §6.3, plan/m06 S5.4; r2 T9/T9-fix,
// r6b E9–E11, M6-D5). The SPEC trigger cannot see another transaction's uncommitted rows, so correctness rests on
// (1) every writer locking the assignment row first (`ORDER BY ta.id FOR UPDATE OF ta`) + the version check, and
// (2) the `allocations_one_resolution_per_week` exclusion constraint as the backstop. Concurrency is real: the app pool
// (`db`, several connections) runs the services; extra postgres.js clients on the worker DB hold raw transactions and
// watch pg_stat_activity, so every "B is blocked" step waits on an observed lock wait, never on a fixed sleep.
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ISODate } from '@/domain/types'
import type { SaveAllocationsInput, SaveAllocationsOk, SaveItemResult } from '@/lib/contracts/grid'
import { db } from '@/server/db/client'
import { AppError, pgErrorInfo } from '@/server/errors'
import * as services from '@/server/services'
import type { SessionUser } from '@/server/session'
import { toSessionUser } from '../helpers/as-user'
import { allocationRows, assignmentVersion } from '../helpers/factories'
import { createWorld, type World } from '../helpers/world'

const TODAY: ISODate = '2026-09-30'

let raw: postgres.Sql
beforeEach(() => {
  raw = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} })
})
afterEach(async () => {
  await raw.end({ timeout: 5 })
})

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** Resolves once at least `n` backends of this database wait on a heavyweight lock (bounded; fails loudly).
 *  `waiter` is the operation expected to block: if it settles first, its own error (or an "it did not block"
 *  failure) is thrown at once instead of waiting for the timeout. */
async function lockWaiters(n: number, waiter: Promise<Settled<unknown>>, timeoutMs = 10_000): Promise<void> {
  let early: Settled<unknown> | null = null
  void waiter.then((r) => (early = r))
  const started = Date.now()
  for (;;) {
    const [row] = await raw<{ n: number }[]>`
      select count(*)::int as n from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`
    if ((row?.n ?? 0) >= n) return
    const settled = early as Settled<unknown> | null
    if (settled) {
      if (!settled.ok) throw settled.error
      throw new Error('the operation completed without waiting on a lock')
    }
    if (Date.now() - started > timeoutMs) throw new Error(`expected ${n} lock waiter(s) within ${timeoutMs} ms`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** Settles a promise into a value or the error it rejected with (so a pending rejection is never unhandled). */
async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p }
  } catch (error) {
    return { ok: false, error }
  }
}

const weekInput = (
  items: readonly { id: string; version: number }[],
  week: ISODate,
  cd: number,
  clientOpId: string,
): SaveAllocationsInput => ({
  items: items.map((i) => ({
    taskAssignmentId: i.id,
    baseVersion: i.version,
    changes: [{ granularity: 'WEEK', period: week, cd }],
  })),
  clientOpId,
})

const saveTx = (user: SessionUser, input: SaveAllocationsInput): Promise<SaveAllocationsOk> =>
  db.transaction((tx) => services.allocations.save(tx, user, input, TODAY))

function conflictCurrent(e: unknown): SaveItemResult[] {
  expect(e, 'expected an AppError').toBeInstanceOf(AppError)
  const app = e as AppError
  expect(app.code).toBe('VERSION_CONFLICT')
  return (app.extra.current ?? []) as SaveItemResult[]
}

/** Postgres code / constraint of a raw postgres.js error or a DrizzleQueryError wrapping one (reads `cause` first). */
const pgCode = (e: unknown) => pgErrorInfo(e).code
const pgConstraint = (e: unknown) => pgErrorInfo(e).constraint

async function world(): Promise<{ w: World; user: SessionUser }> {
  const w = await createWorld({ with: ['allocations'] })
  return { w, user: toSessionUser(w.manager) }
}

describe('allocations — races and locks (BR-20b)', () => {
  it('version lock: B waits on A’s row lock, then gets VERSION_CONFLICT; only A’s plan is stored', async () => {
    const { w, user } = await world()
    const id = w.assignments.pLeafLead.id // WEEK 2026-10-05 = 500, version 1
    const aSaved = deferred()
    const aCommit = deferred()
    const txA = settle(
      db.transaction(async (tx) => {
        const r = await services.allocations.save(tx, user, weekInput([{ id, version: 1 }], '2026-10-05', 300, 'op-a'), TODAY)
        aSaved.resolve()
        await aCommit.promise
        return r
      }),
    )
    let txB: Promise<Settled<SaveAllocationsOk>>
    try {
      // A must hold its lock before B starts (or A failed — then report A's error, not a timeout)
      const first = await Promise.race([aSaved.promise.then(() => null), txA])
      if (first && !first.ok) throw first.error
      txB = settle(saveTx(user, weekInput([{ id, version: 1 }], '2026-10-05', 400, 'op-b')))
      await lockWaiters(1, txB)
    } finally {
      aCommit.resolve() // never leave A's transaction open (the next test truncates every table)
    }

    const a = await txA
    expect(a.ok).toBe(true)
    const b = await txB
    expect(b.ok, 'B must fail').toBe(false)
    const current = conflictCurrent(!b.ok ? b.error : null)
    expect(current).toMatchObject([
      { taskAssignmentId: id, version: 2, weeks: { '2026-10-05': { cd: 300, resolution: 'WEEK' } } },
    ])
    expect(await allocationRows(id, '2026-10-05')).toEqual([
      { granularity: 'WEEK', periodStart: '2026-10-05', cd: 300 },
    ])
    expect(await assignmentVersion(id)).toBe(2)
  })

  it('exclusion backstop: unlocked WEEK (A, uncommitted) vs DAY (B) of one week → B blocks, A commits, B fails 23P01', async () => {
    const { w } = await world()
    const id = w.assignments.pChildAMember.id // no plan in week 2026-10-05
    const a = await raw.reserve()
    const b = await raw.reserve()
    try {
      await a`begin`
      await a`insert into allocations (task_assignment_id, granularity, period_start, week_start, person_days)
              values (${id}, 'WEEK', '2026-10-05', '2026-10-05', 2.00)`
      await b`begin`
      // the trigger in B cannot see A's uncommitted WEEK row; only the exclusion constraint can stop B
      const pending = settle(
        b`insert into allocations (task_assignment_id, granularity, period_start, week_start, person_days)
          values (${id}, 'DAY', '2026-10-06', '2026-10-05', 0.50)`.execute(),
      )
      await lockWaiters(1, pending)
      await a`commit`
      const r = await pending
      expect(r.ok, 'B must fail').toBe(false)
      const error = !r.ok ? r.error : null
      expect(pgCode(error)).toBe('23P01')
      expect(pgConstraint(error)).toBe('allocations_one_resolution_per_week')
      await b`rollback`
    } finally {
      a.release()
      b.release()
    }
    expect(await allocationRows(id, '2026-10-05')).toEqual([
      { granularity: 'WEEK', periodStart: '2026-10-05', cd: 200 },
    ])
  })

  it('same-tx order: INSERT DAY before DELETE WEEK → P0001 WEEK_DAY_CONFLICT (trigger first); DELETE first → ok', async () => {
    const { w } = await world()
    const id = w.assignments.pLeafLead.id // WEEK 2026-09-28 = 250
    const wrongOrder = await settle(
      raw.begin(async (tx) => {
        await tx`insert into allocations (task_assignment_id, granularity, period_start, week_start, person_days)
                 values (${id}, 'DAY', '2026-09-29', '2026-09-28', 0.50)`
        await tx`delete from allocations where task_assignment_id = ${id} and week_start = '2026-09-28' and granularity = 'WEEK'`
      }),
    )
    expect(wrongOrder.ok).toBe(false)
    const error = !wrongOrder.ok ? wrongOrder.error : null
    expect(pgCode(error)).toBe('P0001')
    expect(String((error as Error).message)).toMatch(/^WEEK_DAY_CONFLICT/)
    expect(await allocationRows(id, '2026-09-28')).toEqual([
      { granularity: 'WEEK', periodStart: '2026-09-28', cd: 250 },
    ])

    await raw.begin(async (tx) => {
      await tx`delete from allocations where task_assignment_id = ${id} and week_start = '2026-09-28'`
      await tx`insert into allocations (task_assignment_id, granularity, period_start, week_start, person_days)
               values (${id}, 'DAY', '2026-09-29', '2026-09-28', 0.50)`
    })
    expect(await allocationRows(id, '2026-09-28')).toEqual([
      { granularity: 'DAY', periodStart: '2026-09-29', cd: 50 },
    ])
  })

  it('lock order: lockAssignments([hi, lo]) locks lo first whatever the input order (ORDER BY ta.id)', async () => {
    const { w } = await world()
    const created = [
      w.assignments.pChildAMember,
      w.assignments.pLeafLead,
      w.assignments.qTaskOutsider,
      w.assignments.aTaskMember,
      w.assignments.pDoneMember,
      w.assignments.pCoworker,
      w.assignments.qTaskCoworker,
    ]
    // Prefer a pair whose physical (insertion) order is the reverse of id order, so an unsorted scan would differ.
    let pair: [string, string] = [created[0]!.id, created[1]!.id]
    outer: for (let i = 0; i < created.length; i++)
      for (let j = i + 1; j < created.length; j++)
        if (created[i]!.id > created[j]!.id) {
          pair = [created[i]!.id, created[j]!.id]
          break outer
        }
    const [lo, hi] = [...pair].sort()
    const holder = await raw.reserve()
    const prober = await raw.reserve()
    try {
      await holder`begin`
      await holder`select id from task_assignments where id = ${hi!} for update`
      const locked = settle(
        db.transaction(async (tx) => {
          const set = await services.allocations.lockAssignments(tx, [{ taskAssignmentId: hi! }, { taskAssignmentId: lo! }])
          return set.ids
        }),
      )
      await lockWaiters(1, locked) // blocked on hi …
      // … while already holding lo: NOWAIT on lo must fail with lock_not_available
      await prober`begin`
      const probe = await settle(prober`select id from task_assignments where id = ${lo!} for update nowait`.execute())
      expect(probe.ok, 'lo must already be locked by lockAssignments').toBe(false)
      expect(pgCode(!probe.ok ? probe.error : null)).toBe('55P03')
      await prober`rollback`
      await holder`commit`
      const r = await locked
      expect(r).toEqual({ ok: true, value: [lo, hi] })
    } finally {
      holder.release()
      prober.release()
    }
  })

  it('deadlock-free: batches [a, b] and [b, a] started together never fail with 40P01; the loser retries and completes', async () => {
    const { w, user } = await world()
    const a = w.assignments.pLeafLead.id
    const b = w.assignments.pCoworker.id
    for (let round = 0; round < 5; round++) {
      const week: ISODate = '2026-11-16'
      const va = await assignmentVersion(a)
      const vb = await assignmentVersion(b)
      const forward = weekInput([{ id: a, version: va }, { id: b, version: vb }], week, 100 + round * 25, `f-${round}`)
      const backward = weekInput([{ id: b, version: vb }, { id: a, version: va }], week, 200 + round * 25, `b-${round}`)
      const results = await Promise.all([settle(saveTx(user, forward)), settle(saveTx(user, backward))])
      for (const r of results) {
        if (r.ok) continue
        expect(pgCode(r.error), 'no deadlock').not.toBe('40P01')
        if (!(r.error instanceof AppError)) throw r.error // anything but an AppError (VERSION_CONFLICT) is a defect
      }
      const winners = results.filter((r) => r.ok)
      expect(winners, `round ${round}: exactly one batch wins the race`).toHaveLength(1)
      const loserIndex = results.findIndex((r) => !r.ok)
      const loser = results[loserIndex]!
      const current = conflictCurrent(!loser.ok ? loser.error : null)
      // the loser replays with the versions the conflict reported → completes
      const versions = new Map(current.map((c) => [c.taskAssignmentId, c.version]))
      const replay = loserIndex === 0 ? forward : backward
      const retried = await saveTx(user, {
        ...replay,
        items: replay.items.map((i) => ({ ...i, baseVersion: versions.get(i.taskAssignmentId) ?? i.baseVersion })),
        clientOpId: `${replay.clientOpId}-retry`,
      })
      expect(retried.results.map((x) => x.taskAssignmentId).sort()).toEqual([a, b].sort())
      expect(await assignmentVersion(a)).toBe(va + 2)
      expect(await assignmentVersion(b)).toBe(vb + 2)
    }
  })
})
