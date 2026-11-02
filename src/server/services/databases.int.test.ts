// M11 S2 — database services beyond the authz matrix (plan/m11 S2.4–S2.12): defaults of createDatabase, cell
// validation + merge, type change and revert (AC-1406 vectors), deletes / restores with bodies, view config validation,
// deep copy (ids remapped, source untouched, bodies copied), page delete → 404, audit never carries cell values.
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { DB_LIMITS } from '@/lib/schemas/db-limits'
import * as actions from '../actions/databases'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { createWorld } from '../../../tests/helpers/world'
import { dbRowById, liveColumns, liveRows, liveViews } from '../../../tests/authz/rows/_m11'
import { db } from '../db/client'
import { auditLog, databaseColumns, databaseRows, databases, databaseViews, pages } from '../db/schema'
import * as copy from './database-copy'
import * as svc from './databases'

const DBW = ['databases'] as const
const TODAY = '2026-09-30'

describe('services.databases (M11 S2)', () => {
  it('createDatabase: ชื่อ · สถานะ (3 options) · วันที่ + one view; KANBAN groups by สถานะ', async () => {
    const w = await createWorld({ with: DBW })
    const u = toSessionUser(w.member)
    const r = await db.transaction((tx) => svc.createDatabase(tx, u, { pageId: w.pages.pChild.id, view: 'KANBAN' }))
    expect(r.database.columns.map((c) => c.name)).toEqual(['ชื่อ', 'สถานะ', 'วันที่'])
    const status = r.database.columns[1]!
    expect((status.config as { options: { name: string; color: string }[] }).options.map((o) => [o.name, o.color])).toEqual([
      ['ยังไม่เริ่ม', 'gray'],
      ['กำลังทำ', 'blue'],
      ['เสร็จ', 'green'],
    ])
    expect(r.database.views).toEqual([expect.objectContaining({ type: 'KANBAN', config: { groupByColumnId: status.id } })])
  })

  it('updateRow merges only the sent keys; null clears; a kept deactivated person may stay', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    const u = toSessionUser(w.lead)
    const before = await dbRowById(d.pRow1.id)
    const r = await db.transaction((tx) =>
      svc.updateRow(tx, u, {
        rowId: d.pRow1.id,
        baseVersion: before.version,
        cells: { [d.dbPColumns.text.id]: null, [d.dbPColumns.number.id]: '-0.5' },
      }),
    )
    expect(r.row.cells[d.dbPColumns.text.id]).toBeUndefined()
    expect(r.row.cells[d.dbPColumns.number.id]).toBe('-0.5')
    expect(r.row.cells[d.dbPColumns.status.id]).toBe(d.dbPOptions.doing)
    // audit never carries cell values or row titles (M11-D5)
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, d.dbP.id))
    expect(JSON.stringify(audits)).not.toContain('-0.5')
    expect(JSON.stringify(audits)).not.toContain('แถว P-ลับ21')
  })

  it('AC-1406: TEXT "12" / "abc" / "1,500" → NUMBER = 12 / empty / 1500; revert restores the texts', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    const u = toSessionUser(w.member)
    const col = d.dbPColumns.text.id
    const set = async (rowId: string, v: string) =>
      db.update(databaseRows).set({ cells: { [col]: v } }).where(eq(databaseRows.id, rowId))
    await set(d.pRow1.id, '12')
    await set(d.pRow2.id, 'abc')
    await set(d.pRow3.id, '1,500')
    const changed = await db.transaction((tx) =>
      svc.changeColumnType(tx, u, { columnId: col, baseVersion: d.dbPColumns.text.version, type: 'NUMBER' }, TODAY),
    )
    const value = async (id: string) => (await dbRowById(id)).cells[col]
    expect([await value(d.pRow1.id), await value(d.pRow2.id), await value(d.pRow3.id)]).toEqual(['12', undefined, '1500'])
    expect(changed.previous.values).toEqual({ [d.pRow1.id]: '12', [d.pRow2.id]: 'abc', [d.pRow3.id]: '1,500' })
    await db.transaction((tx) => svc.revertColumnType(tx, u, { columnId: col, previous: changed.previous }))
    expect([await value(d.pRow1.id), await value(d.pRow2.id), await value(d.pRow3.id)]).toEqual(['12', 'abc', '1,500'])
  })

  it('TEXT → SELECT creates one option per unique text in order of appearance', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    const u = toSessionUser(w.member)
    const r = await db.transaction((tx) =>
      svc.changeColumnType(tx, u, { columnId: d.dbPColumns.text.id, baseVersion: 1, type: 'SELECT' }, TODAY),
    )
    const options = (r.column.config as { options: { id: string; name: string }[] }).options
    expect(options.map((o) => o.name)).toEqual(['ค่าเซลล์ P-ลับ28'])
    expect((await dbRowById(d.pRow1.id)).cells[d.dbPColumns.text.id]).toBe(options[0]!.id)
  })

  it('deleteRows → body soft-deleted in the batch; restoreRowBatch brings both back', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    const u = toSessionUser(w.member)
    const { batch } = await db.transaction((tx) => svc.deleteRows(tx, u, { rowIds: [d.pRow1.id] }))
    const body = async () => (await db.select().from(pages).where(eq(pages.id, d.pRowBody.id)))[0]!
    expect((await body()).deletedBatch).toBe(batch)
    await db.transaction((tx) => svc.restoreRowBatch(tx, u, { batch }))
    expect((await body()).deletedAt).toBeNull()
    expect((await dbRowById(d.pRow1.id)).deletedAt).toBeNull()
  })

  it('createView KANBAN in a database without a group column creates "สถานะ"; CALENDAR finds วันที่', async () => {
    const w = await createWorld({ with: DBW })
    const u = toSessionUser(w.member)
    const made = await db.transaction((tx) => svc.createDatabase(tx, u, { pageId: w.pages.pChild.id, view: 'TABLE' }))
    const dbId = made.databaseId
    const status = made.database.columns.find((c) => c.type === 'SELECT')!
    await db.transaction((tx) => svc.deleteColumn(tx, u, { columnId: status.id }))
    const k = await db.transaction((tx) => svc.createView(tx, u, { databaseId: dbId, type: 'KANBAN' }))
    expect(k.createdColumn).toMatchObject({ type: 'SELECT', name: 'สถานะ' })
    expect(k.view.config.groupByColumnId).toBe(k.createdColumn!.id)
    const c = await db.transaction((tx) => svc.createView(tx, u, { databaseId: dbId, type: 'CALENDAR' }))
    expect(c.createdColumn).toBeUndefined()
    expect((await liveViews(dbId)).map((v) => v.name)).toEqual(['ตาราง', 'คัมบัง', 'ปฏิทิน'])
  })

  it('deep copy: new ids everywhere (options, view config), bodies copied, editing the copy leaves the source', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    asUser(w.member)
    const u = toSessionUser(w.member)
    const { databaseId } = await db.transaction((tx) =>
      copy.copyDatabase(tx, u, { sourcePageId: w.pages.pPage.id, sourceDatabaseId: d.dbP.id, targetPageId: w.pages.pChild.id }),
    )
    const cols = await liveColumns(databaseId)
    const srcIds = new Set((await liveColumns(d.dbP.id)).map((c) => c.id))
    expect(cols.some((c) => srcIds.has(c.id))).toBe(false)
    const status = cols.find((c) => c.name === 'สถานะ')!
    const optionIds = (status.config as { options: { id: string }[] }).options.map((o) => o.id)
    expect(optionIds).not.toContain(d.dbPOptions.doing)
    const kanban = (await liveViews(databaseId)).find((v) => v.type === 'KANBAN')!
    expect((kanban.config as { groupByColumnId: string }).groupByColumnId).toBe(status.id)
    const rows = await liveRows(databaseId)
    const copy1 = rows.find((r) => r.title === 'แถว P-ลับ21')!
    expect(optionIds).toContain(copy1.cells[status.id])
    const bodies = await db.select().from(pages).where(eq(pages.databaseRowId, copy1.id))
    expect(bodies).toHaveLength(1)
    expect(bodies[0]!.contentText).toContain('เนื้อหาแถว P-ลับ22')
    expect(bodies[0]!.id).not.toBe(d.pRowBody.id)
    await db.transaction((tx) => svc.updateRow(tx, u, { rowId: copy1.id, baseVersion: 1, title: 'สำเนาแก้แล้ว' }))
    expect((await dbRowById(d.pRow1.id)).title).toBe('แถว P-ลับ21')
  })

  it('updateView with a column of another database → VALIDATION; with a soft-deleted column of its own → ok', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    const u = toSessionUser(w.member)
    const other = (await liveColumns(d.dbQ.id))[0]!
    await expect(
      db.transaction((tx) =>
        svc.updateView(tx, u, { viewId: d.dbPViews.table.id, baseVersion: 1, config: { hiddenColumnIds: [other.id] } }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    const r = await db.transaction((tx) =>
      svc.updateView(tx, u, {
        viewId: d.dbPViews.table.id,
        baseVersion: 1,
        config: { hiddenColumnIds: [d.dbPColumns.deleted.id] },
      }),
    )
    expect(r.view.version).toBe(2)
  })
})

describe('services.databases › limits (FR-1475)', () => {
  const lim = th.database.errors.limit
  const failsWith = (r: unknown, message: string) => {
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(JSON.stringify(r)).toContain(message)
  }

  it('databases per page: 20 attached max; detached ones do not count', async () => {
    const w = await createWorld({ with: DBW })
    const page = w.pages.pChild
    const by = { createdBy: w.manager.id, updatedBy: w.manager.id }
    await db.insert(databases).values([
      ...Array.from({ length: DB_LIMITS.databasesPerPage - 1 }, () => ({ pageId: page.id, title: '', ...by })),
      { pageId: page.id, title: '', detachedAt: new Date(Date.now() - 60_000), ...by },
    ])
    asUser(w.member)
    expect(await actions.createDatabase({ pageId: page.id, view: 'TABLE' })).toMatchObject({ ok: true })
    failsWith(await actions.createDatabase({ pageId: page.id, view: 'TABLE' }), lim.databases(DB_LIMITS.databasesPerPage))
    const attached = await db
      .select()
      .from(databases)
      .where(and(eq(databases.pageId, page.id), isNull(databases.detachedAt)))
    expect(attached).toHaveLength(DB_LIMITS.databasesPerPage)
  })

  it('columns: 30 live max (TITLE included); views: 10 live max', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    asUser(w.member)
    const cols = await liveColumns(d.dbP.id)
    const lastCol = cols.map((c) => c.position).sort().at(-1)!
    const colKeys = generateNKeysBetween(lastCol, null, DB_LIMITS.columns - cols.length - 1)
    await db.insert(databaseColumns).values(
      colKeys.map((position, i) => ({ databaseId: d.dbP.id, type: 'TEXT' as const, name: `เติม ${i}`, position })),
    )
    expect(await actions.createDatabaseColumn({ databaseId: d.dbP.id, type: 'TEXT' })).toMatchObject({ ok: true })
    expect(await liveColumns(d.dbP.id)).toHaveLength(DB_LIMITS.columns)
    failsWith(await actions.createDatabaseColumn({ databaseId: d.dbP.id, type: 'TEXT' }), lim.columns(DB_LIMITS.columns))

    const views = await liveViews(d.dbP.id)
    const lastView = views.map((v) => v.position).sort().at(-1)!
    const viewKeys = generateNKeysBetween(lastView, null, DB_LIMITS.views - views.length - 1)
    await db.insert(databaseViews).values(
      viewKeys.map((position, i) => ({ databaseId: d.dbP.id, type: 'TABLE' as const, name: `มุมมอง ${i}`, position })),
    )
    expect(await actions.createDatabaseView({ databaseId: d.dbP.id, type: 'TABLE' })).toMatchObject({ ok: true })
    expect(await liveViews(d.dbP.id)).toHaveLength(DB_LIMITS.views)
    failsWith(await actions.createDatabaseView({ databaseId: d.dbP.id, type: 'TABLE' }), lim.views(DB_LIMITS.views))
  })

  it('rows: 1,000 live max per database; at most 50 rows per createDatabaseRows call', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    asUser(w.member)
    failsWith(
      await actions.createDatabaseRows({
        databaseId: d.dbP.id,
        rows: Array.from({ length: DB_LIMITS.rowsPerAction + 1 }, (_, i) => ({ title: `r${i}` })),
      }),
      lim.rowsPerAction(DB_LIMITS.rowsPerAction),
    )
    const live = await liveRows(d.dbP.id)
    const [last] = await db
      .select({ position: databaseRows.position })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, d.dbP.id))
      .orderBy(desc(databaseRows.position))
      .limit(1)
    const keys = generateNKeysBetween(last!.position, null, DB_LIMITS.rows - live.length - 1)
    await db.insert(databaseRows).values(
      keys.map((position) => ({
        id: randomUUID(),
        databaseId: d.dbP.id,
        title: '',
        cells: {},
        position,
        createdBy: w.manager.id,
        updatedBy: w.manager.id,
      })),
    )
    expect(await actions.createDatabaseRows({ databaseId: d.dbP.id, rows: [{ title: 'สุดท้าย' }] })).toMatchObject({
      ok: true,
    })
    expect(await liveRows(d.dbP.id)).toHaveLength(DB_LIMITS.rows)
    failsWith(
      await actions.createDatabaseRows({ databaseId: d.dbP.id, rows: [{ title: 'เกิน' }] }),
      lim.rows(DB_LIMITS.rows),
    )
    expect(await liveRows(d.dbP.id)).toHaveLength(DB_LIMITS.rows)
  })

  it('view config: ≤ 3 sorts and ≤ 10 filters; nothing is written when over', async () => {
    const w = await createWorld({ with: DBW })
    const d = w.databases
    const c = d.dbPColumns
    asUser(w.member)
    const viewId = d.dbPViews.table.id
    const sortCols = [c.title, c.text, c.number, c.date]
    const sorts = sortCols.map((col) => ({ columnId: col.id, dir: 'ASC' as const }))
    failsWith(
      await actions.updateDatabaseView({ viewId, baseVersion: 1, config: { sorts } }),
      lim.sorts(DB_LIMITS.sorts),
    )
    const filters = Array.from({ length: DB_LIMITS.filters + 1 }, () => ({ columnId: c.text.id, op: 'isNotEmpty' as const }))
    failsWith(
      await actions.updateDatabaseView({ viewId, baseVersion: 1, config: { filters } }),
      lim.filters(DB_LIMITS.filters),
    )
    expect(
      await actions.updateDatabaseView({
        viewId,
        baseVersion: 1,
        config: { sorts: sorts.slice(0, DB_LIMITS.sorts), filters: filters.slice(0, DB_LIMITS.filters) },
      }),
    ).toMatchObject({ ok: true })
  })
})
