// tests/integration/database-race.int.test.ts — databases under concurrency (plan/m11 S6.6; SPEC FR-1453, FR-1463,
// FR-1472, FR-1475, AC-1409, AC-1412; M11-D8, M11-D14, M11-D18, M11-D9).
// (1) Ten parallel ensureRowBody calls for one row → exactly one DB_ROW page and one `page · create` audit row.
// (2) Two users update the same row from the same baseVersion → exactly one VERSION_CONFLICT; the winner's value stays.
// (3) 25 parallel createDatabaseRows of 50 near the 1,000-row limit → never more than 1,000 live rows (the database row
//     lock serialises the count); every loser is a VALIDATION.
// (4) 25 parallel createDatabase on one page → never more than 20 attached databases.
// (5) A page save without the block racing createDatabase may detach the new database; the next save that contains the
//     block re-attaches it (FR-1472 self-heal).
import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { EnsureRowBodyResult } from '@/lib/contracts/row-pages'
import { createDatabase, createDatabaseRows } from '@/server/actions/databases'
import { savePageContent } from '@/server/actions/pages'
import { ensureRowBody } from '@/server/actions/row-pages'
import { db } from '@/server/db/client'
import { auditLog, databases, pages } from '@/server/db/schema'
import * as services from '@/server/services'
import { asUser, toSessionUser } from '../helpers/as-user'
import { outcomeOf, outcomeOfCall } from '../helpers/outcome'
import { createWorld } from '../helpers/world'
import { attachedOf, databaseBlock, databaseById, DB_LIMITS, dbRowById, fillRowsTo, liveRows } from '../authz/rows/_m11'

const DBW = ['databases'] as const

async function pageVersion(id: string): Promise<number> {
  const [p] = await db.select({ v: pages.version }).from(pages).where(eq(pages.id, id))
  return p!.v
}

describe('databases — races (plan/m11 S6.6)', () => {
  it('10 parallel ensureRowBody → one DB_ROW page, one create audit, the same pageId for every caller', async () => {
    const w = await createWorld({ with: DBW })
    const row = w.databases.pRow2 // no body yet
    asUser(w.member)
    const results: ActionResult<EnsureRowBodyResult>[] = await Promise.all(
      Array.from({ length: 10 }, () => ensureRowBody({ rowId: row.id })),
    )
    for (const r of results) expect(r, JSON.stringify(r)).toMatchObject({ ok: true })
    const ok = results.flatMap((r) => (r.ok ? [r] : []))
    expect(new Set(ok.map((d) => d.pageId)).size).toBe(1)
    expect(ok.filter((d) => d.created)).toHaveLength(1)

    const bodies = await db.select().from(pages).where(eq(pages.databaseRowId, row.id))
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ id: ok[0]!.pageId, kind: 'DB_ROW', projectId: w.P.id, deletedAt: null })
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'page'), eq(auditLog.entityId, ok[0]!.pageId)))
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'create', projectId: w.P.id, actorId: w.member.id })
  })

  it('AC-1409: two users update the same row from the same version → exactly one 409, no silent overwrite', async () => {
    const w = await createWorld({ with: DBW })
    const row = w.databases.pRow2
    const base = (await dbRowById(row.id)).version
    const attempt = (u: typeof w.lead, title: string) =>
      outcomeOfCall(() =>
        db.transaction((tx) => services.databases.updateRow(tx, toSessionUser(u), { rowId: row.id, baseVersion: base, title })),
      )
    const [a, b] = await Promise.all([attempt(w.lead, 'ของ Lead'), attempt(w.member, 'ของ Member')])
    expect([a, b].sort()).toEqual(['409', 'allow'])
    const after = await dbRowById(row.id)
    expect(after.version).toBe(base + 1)
    expect(after.title).toBe(a === 'allow' ? 'ของ Lead' : 'ของ Member')
  })

  it('FR-1475: 25 parallel createDatabaseRows × 50 near the limit → live rows never exceed 1,000; losers are 400', async () => {
    const w = await createWorld({ with: DBW })
    const dbId = w.databases.dbP.id
    const start = DB_LIMITS.rows - 2 * DB_LIMITS.rowsPerAction - 10 // room for exactly two batches of 50
    await fillRowsTo(dbId, start, w.manager)
    asUser(w.member)
    const batch = Array.from({ length: DB_LIMITS.rowsPerAction }, (_, i) => ({ title: `ขนาน ${i}` }))
    const results = await Promise.all(Array.from({ length: 25 }, () => createDatabaseRows({ databaseId: dbId, rows: batch })))
    const outcomes = results.map((r) => outcomeOf(r))
    for (const o of outcomes) expect(['allow', '400']).toContain(o)
    const allowed = outcomes.filter((o) => o === 'allow').length
    const live = (await liveRows(dbId)).length
    expect(live).toBeLessThanOrEqual(DB_LIMITS.rows)
    expect(live).toBe(start + allowed * DB_LIMITS.rowsPerAction)
    expect(allowed).toBe(2)
  })

  it('FR-1475: 25 parallel createDatabase on one page → at most 20 attached databases', async () => {
    const w = await createWorld({ with: DBW })
    const pageId = w.pages.pChild.id // no database yet
    asUser(w.member)
    const results = await Promise.all(
      Array.from({ length: 25 }, () => createDatabase({ pageId, view: 'TABLE' })),
    )
    const outcomes = results.map((r) => outcomeOf(r))
    for (const o of outcomes) expect(['allow', '400']).toContain(o)
    const attached = await attachedOf(pageId)
    expect(attached.length).toBeLessThanOrEqual(DB_LIMITS.databasesPerPage)
    expect(attached).toHaveLength(outcomes.filter((o) => o === 'allow').length)
    expect(attached).toHaveLength(DB_LIMITS.databasesPerPage)
  })

  it('FR-1472 self-heal: a save without the block racing createDatabase → the next save with the block re-attaches it', async () => {
    const w = await createWorld({ with: DBW })
    const pageId = w.pages.pChild.id
    asUser(w.member)
    const base = await pageVersion(pageId)
    // the client saves stale content (no block yet) while the database is being created
    const [created, saved] = await Promise.all([
      createDatabase({ pageId, view: 'TABLE' }),
      savePageContent({ pageId, baseVersion: base, content: [{ type: 'paragraph', content: 'ก่อนแทรกบล็อก' }] }),
    ])
    if (!created.ok) throw new Error(`createDatabase: ${created.code} ${created.message}`)
    expect(outcomeOf(saved)).toBe('allow')
    const id = created.databaseId
    // either order is legal: attached (create committed after the save) or detached (save reconciled after create)
    const mid = await databaseById(id)
    expect(mid.pageId).toBe(pageId)

    // a stale save that still lacks the block detaches it deterministically
    const stale = await savePageContent({
      pageId,
      baseVersion: await pageVersion(pageId),
      content: [{ type: 'paragraph', content: 'ยังไม่มีบล็อก' }],
    })
    expect(outcomeOf(stale)).toBe('allow')
    expect((await databaseById(id)).detachedAt).not.toBeNull()

    // the next save that contains the block re-attaches it
    const healed = await savePageContent({
      pageId,
      baseVersion: await pageVersion(pageId),
      content: [{ type: 'paragraph', content: 'มีบล็อกแล้ว' }, databaseBlock(id)],
    })
    expect(outcomeOf(healed)).toBe('allow')
    expect((await databaseById(id)).detachedAt).toBeNull()
    const attachedIds = (
      await db
        .select({ id: databases.id })
        .from(databases)
        .where(and(eq(databases.pageId, pageId), isNull(databases.detachedAt)))
    ).map((r) => r.id)
    expect(attachedIds).toEqual([id])
  })
})
