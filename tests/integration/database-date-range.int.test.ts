// tests/integration/database-date-range.int.test.ts — v3.7 per-cell date ranges (owner 2026-11-03; SPEC BR-90/92/93):
// the server accepts `{ start, end }` (start ≤ end, real dates) in a DATE cell through updateDatabaseRow and
// createDatabaseRows, stores it as a JSON object next to plain 'YYYY-MM-DD' cells (no data migration), and rejects
// every malformed shape with VALIDATION before anything is written; a range in a non-DATE column is rejected too.
// Changing the column type to TEXT and back round-trips the range through "start → end" (BR-93).
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { changeDatabaseColumnType, createDatabaseRows, updateDatabaseRow } from '@/server/actions/databases'
import { db } from '@/server/db/client'
import { databaseColumns } from '@/server/db/schema'
import { asUser } from '../helpers/as-user'
import { createWorld } from '../helpers/world'
import { dbRowById } from '../authz/rows/_m11'

const DBW = ['databases'] as const

describe('database DATE ranges — server validation (v3.7, BR-90)', () => {
  it('stores a range and a single date side by side; rejects malformed ranges with VALIDATION and writes nothing', async () => {
    const w = await createWorld({ with: DBW })
    const { date, text } = w.databases.dbPColumns
    const row = w.databases.pRow2
    asUser(w.member)

    const range = { start: '2026-11-03', end: '2026-11-07' }
    const ok = await updateDatabaseRow({
      rowId: row.id,
      baseVersion: (await dbRowById(row.id)).version,
      cells: { [date.id]: range },
    })
    expect(ok, JSON.stringify(ok)).toMatchObject({ ok: true })
    const stored = await dbRowById(row.id)
    expect(stored.cells[date.id]).toEqual(range)

    for (const bad of [
      { start: '2026-11-07', end: '2026-11-03' }, // end before start
      { start: '2026-02-30', end: '2026-03-01' }, // no such day
      { start: '2026-11-03', end: '2026-11-07T00:00' }, // not an ISO date
    ]) {
      const r = await updateDatabaseRow({
        rowId: row.id,
        baseVersion: stored.version,
        cells: { [date.id]: bad },
      })
      expect(r, JSON.stringify(bad)).toMatchObject({ ok: false, code: 'VALIDATION' })
    }
    for (const bad of [{ start: '2026-11-03' }, { start: '2026-11-03', end: '2026-11-04', extra: 1 }]) {
      // an incomplete / extra-key object is not a cell shape at all (zod)
      const r = await updateDatabaseRow({
        rowId: row.id,
        baseVersion: stored.version,
        cells: { [date.id]: bad as unknown as typeof range },
      })
      expect(r, JSON.stringify(bad)).toMatchObject({ ok: false, code: 'VALIDATION' })
    }
    // a range in a TEXT column
    const wrongCol = await updateDatabaseRow({
      rowId: row.id,
      baseVersion: stored.version,
      cells: { [text.id]: range },
    })
    expect(wrongCol).toMatchObject({ ok: false, code: 'VALIDATION' })
    const after = await dbRowById(row.id)
    expect(after.version).toBe(stored.version)
    expect(after.cells[date.id]).toEqual(range)

    const created = await createDatabaseRows({
      databaseId: w.databases.dbP.id,
      rows: [
        { title: 'ช่วง', cells: { [date.id]: { start: '2026-12-30', end: '2027-01-02' } } },
        { title: 'วันเดียว', cells: { [date.id]: '2026-11-05' } },
      ],
    })
    expect(created, JSON.stringify(created)).toMatchObject({ ok: true })
  })

  it('DATE → TEXT → DATE keeps the range through "start → end" (BR-93)', async () => {
    const w = await createWorld({ with: DBW })
    const { date } = w.databases.dbPColumns
    const row = w.databases.pRow3
    asUser(w.manager)
    const range = { start: '2026-11-30', end: '2026-12-04' }
    const r = await updateDatabaseRow({
      rowId: row.id,
      baseVersion: (await dbRowById(row.id)).version,
      cells: { [date.id]: range },
    })
    expect(r).toMatchObject({ ok: true })
    const version = async () =>
      (await db.select().from(databaseColumns).where(eq(databaseColumns.id, date.id)))[0]!.version
    const toText = await changeDatabaseColumnType({
      columnId: date.id,
      baseVersion: await version(),
      type: 'TEXT',
    })
    expect(toText, JSON.stringify(toText)).toMatchObject({ ok: true })
    expect((await dbRowById(row.id)).cells[date.id]).toBe('2026-11-30 → 2026-12-04')
    const back = await changeDatabaseColumnType({
      columnId: date.id,
      baseVersion: await version(),
      type: 'DATE',
    })
    expect(back, JSON.stringify(back)).toMatchObject({ ok: true })
    expect((await dbRowById(row.id)).cells[date.id]).toEqual(range)
  })
})
