// tests/integration/task-body-race.int.test.ts — task bodies under concurrency (plan/m06.1 S6.6, risk R7; SPEC FR-681,
// FR-689, M6.1-D6, M6.1-D13). (1) Ten parallel ensureTaskBody calls for one task → exactly one TASK page and one
// `page · create` audit row; every caller gets the same page id (`on conflict (task_id)` + pages_task_id_unique).
// (2) A body save that races a task delete: the delete holds the body row (it soft-deletes it in the task's batch),
// the save waits on that row lock and, once the delete commits, answers 404 — the deleted body is never written.
// Every "is blocked" step waits on an observed lock wait in pg_stat_activity, never on a fixed sleep.
import { and, eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { EnsureTaskBodyResult } from '@/lib/contracts/task-pages'
import { savePageContent } from '@/server/actions/pages'
import { ensureTaskBody } from '@/server/actions/task-pages'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { auditLog, pages } from '@/server/db/schema'
import * as services from '@/server/services'
import { asUser } from '../helpers/as-user'
import { outcomeOf } from '../helpers/outcome'
import { createWorld } from '../helpers/world'

let raw: postgres.Sql
beforeEach(() => {
  raw = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} })
})
afterEach(async () => {
  await raw.end({ timeout: 5 })
})

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p }
  } catch (error) {
    return { ok: false, error }
  }
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** Resolves once at least `n` backends of this database wait on a heavyweight lock (bounded; fails loudly). If the
 *  operation expected to block settles first, fail at once with "it did not block" (or its own error). */
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
      throw new Error(`the operation completed without waiting on a lock: ${JSON.stringify(settled.value)}`)
    }
    if (Date.now() - started > timeoutMs) throw new Error(`expected ${n} lock waiter(s) within ${timeoutMs} ms`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('task bodies — races (plan/m06.1 S6.6)', () => {
  it('10 parallel ensureTaskBody → one TASK page, one create audit, the same pageId for every caller', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    const task = w.tasks.pChildB // no body yet
    asUser(w.member)
    const results: ActionResult<EnsureTaskBodyResult>[] = await Promise.all(
      Array.from({ length: 10 }, () => ensureTaskBody({ taskId: task.id })),
    )
    for (const r of results) expect(r, JSON.stringify(r)).toMatchObject({ ok: true })
    const ok = results.flatMap((r) => (r.ok ? [r] : []))
    expect(new Set(ok.map((d) => d.pageId)).size).toBe(1)
    expect(ok.filter((d) => d.created)).toHaveLength(1)
    for (const d of ok) expect(d.version).toBe(1)

    const rows = await db.select().from(pages).where(eq(pages.taskId, task.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: ok[0]!.pageId, kind: 'TASK', projectId: w.P.id, deletedAt: null })
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'page'), eq(auditLog.entityId, ok[0]!.pageId)))
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'create', projectId: w.P.id, actorId: w.member.id })
  })

  it('delete-while-saving: the save waits for the task delete, then gets 404; the deleted body keeps its content', async () => {
    const w = await createWorld({ with: ['taskBodies'] })
    const body = w.taskBodies.pLeafBody
    const user = asUser(w.member) // the mocked session of the save action
    const deleted = deferred()
    const commit = deferred()
    const del = settle(
      db.transaction(async (tx) => {
        const acc = await authz.requireTasks(tx, user, [w.tasks.pLeaf.id], 'edit')
        const r = await services.tasks.deleteTaskTree(tx, user, {
          projectId: acc.projectId,
          tasks: acc.tasks,
          taskIds: [w.tasks.pLeaf.id],
        })
        deleted.resolve()
        await commit.promise
        return r
      }),
    )
    let save: Promise<Settled<Awaited<ReturnType<typeof savePageContent>>>> | undefined
    try {
      // the delete must hold the body row before the save starts (or report the delete's own error)
      const first = await Promise.race([deleted.promise.then(() => null), del])
      if (first && !first.ok) throw first.error
      save = settle(savePageContent({ pageId: body.id, baseVersion: body.version, content: [{ type: 'paragraph', content: 'แก้ระหว่างลบ' }] }))
      await lockWaiters(1, save)
    } finally {
      commit.resolve()
    }
    const d = await del
    if (!d.ok) throw d.error
    const s = await save
    if (!s.ok) throw s.error
    expect(outcomeOf(s.value)).toBe('404')

    const [after] = await db.select().from(pages).where(eq(pages.id, body.id))
    expect(after!.deletedAt, 'FR-689: the body is deleted with its task').not.toBeNull()
    expect(after!.deletedBatch).toBe(d.value.batch)
    expect(after!.version).toBe(body.version)
    expect(after!.contentText).toBe(body.contentText)
  })
})
