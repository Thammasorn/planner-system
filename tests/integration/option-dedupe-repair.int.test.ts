// tests/integration/option-dedupe-repair.int.test.ts — the M11.3 data repair migration (owner bug 2026-11-03, BR-90):
// duplicate option names per SELECT / MULTI_SELECT column are merged into the first one (cells and view filters
// remapped, MULTI_SELECT arrays de-duplicated), unknown option ids (temp `tmp_…`) are dropped, and a second run
// changes nothing. Runs the migration's SQL file as-is against rows built by the factories.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { databaseColumns, databaseRows, databaseViews } from '@/server/db/schema'
import { makeDatabase, makeDbRow, makePage, makeUser } from '../helpers/factories'

function repairSql(): string {
  const journal = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
  ) as {
    entries: { tag: string }[]
  }
  const tag = journal.entries.find((e) => e.tag.endsWith('_m11_3_dedupe_select_options'))?.tag
  if (!tag) throw new Error('m11_3_dedupe_select_options migration missing from the journal')
  return readFileSync(path.resolve(process.cwd(), `drizzle/${tag}.sql`), 'utf8')
}

describe('M11.3 repair: duplicate select options and unknown option ids (BR-90)', () => {
  it('merges same-name options (trim + case) into the first, remaps cells and filters, drops temp ids; idempotent', async () => {
    const u = await makeUser({ role: 'manager' })
    const page = await makePage({ createdBy: u })
    const made = await makeDatabase({
      page,
      createdBy: u,
      columns: [
        { type: 'MULTI_SELECT', name: 'ป้าย' },
        { type: 'SELECT', name: 'สถานะ' },
      ],
    })
    const tags = made.columns['ป้าย']!
    const status = made.columns['สถานะ']!
    const [q1, a1, q2, a2, q3, x] = Array.from({ length: 6 }, () => randomUUID())
    await db
      .update(databaseColumns)
      .set({
        config: {
          options: [
            { id: q1, name: 'qwer', color: 'gray' },
            { id: a1, name: 'asdf', color: 'blue' },
            { id: q2, name: 'qwer', color: 'red' },
            { id: a2, name: 'ASDF ', color: 'green' },
            { id: q3, name: 'qwer', color: 'teal' },
            { id: x, name: 'หกด', color: 'brown' },
          ],
        },
      })
      .where(eq(databaseColumns.id, tags.id))
    await db
      .update(databaseColumns)
      .set({ config: { options: [{ id: x, name: 'ok', color: 'gray' }] } })
      .where(eq(databaseColumns.id, status.id))
    const r1 = await makeDbRow({
      database: made.database,
      createdBy: u,
      cells: { [tags.id]: [q2, a1, q3, 'tmp_13_56155416c941', x], [status.id]: x },
    })
    const r2 = await makeDbRow({ database: made.database, createdBy: u, cells: { [tags.id]: ['tmp_1_x'] } })
    const r3 = await makeDbRow({ database: made.database, createdBy: u, cells: { [status.id]: 'tmp_2_y' } })
    const view = Object.values(made.views)[0]!
    await db
      .update(databaseViews)
      .set({ config: { filters: [{ columnId: tags.id, op: 'hasAnyOf', value: [q3, a2, q1] }] } })
      .where(eq(databaseViews.id, view.id))

    await db.execute(sql.raw(repairSql()))

    const [col] = await db.select().from(databaseColumns).where(eq(databaseColumns.id, tags.id))
    expect((col!.config as { options: { id: string; name: string }[] }).options).toEqual([
      { id: q1, name: 'qwer', color: 'gray' },
      { id: a1, name: 'asdf', color: 'blue' },
      { id: x, name: 'หกด', color: 'brown' },
    ])
    expect(col!.version).toBe(tags.version + 1)
    const cells = async (id: string) =>
      (await db.select({ c: databaseRows.cells }).from(databaseRows).where(eq(databaseRows.id, id)))[0]!.c
    expect(await cells(r1.id)).toEqual({ [tags.id]: [q1, a1, x], [status.id]: x })
    expect(await cells(r2.id)).toEqual({})
    expect(await cells(r3.id)).toEqual({})
    const [v] = await db.select().from(databaseViews).where(eq(databaseViews.id, view.id))
    expect(v!.config).toEqual({ filters: [{ columnId: tags.id, op: 'hasAnyOf', value: [q1, a1] }] })

    // a second run is a no-op (no version moves)
    const before = await db.select({ id: databaseRows.id, v: databaseRows.version }).from(databaseRows)
    await db.execute(sql.raw(repairSql()))
    const after = await db.select({ id: databaseRows.id, v: databaseRows.version }).from(databaseRows)
    expect(after).toEqual(before)
    const [col2] = await db.select().from(databaseColumns).where(eq(databaseColumns.id, tags.id))
    expect(col2!.version).toBe(col!.version)
  })
})
