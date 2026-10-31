// M5 S2.2 — company holidays (FR-901, M5-D2/D11, X64): CRUD with hard delete + same-id restore, CSV import upsert
// (one audit row, all-or-nothing), range reads; plus the manager-only actions (refresh() after the tx).
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/dates'
import { th } from '@/i18n/th'
import {
  createHoliday as createHolidayAction,
  deleteHoliday as deleteHolidayAction,
  importHolidays as importHolidaysAction,
} from '@/server/actions/holidays'
import { asUser } from '../../../tests/helpers/as-user'
import { makeHoliday, makeUser } from '../../../tests/helpers/factories'
import { testCache } from '../../../tests/helpers/request'
import { db } from '../db/client'
import { auditLog, holidays } from '../db/schema'
import { AppError } from '../errors'
import {
  createHoliday,
  deleteHoliday,
  importHolidays,
  listHolidays,
  listHolidaysInRange,
  restoreHoliday,
  updateHoliday,
} from './holidays'

/** `expect.any(String)` typed as unknown (no-unsafe-assignment inside object literals). */
const ANY_STRING: unknown = expect.any(String)

async function caught(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    throw e
  }
  throw new Error('expected an AppError')
}

const holidayAudits = () => db.select().from(auditLog).where(eq(auditLog.entity, 'holiday'))

describe('holidays service (FR-901)', () => {
  it('create → row + one audit row; same date again → CONFLICT dateTaken with fieldErrors.date', async () => {
    const h = await db.transaction((tx) =>
      createHoliday(tx, null, { date: '2026-10-23', name: 'วันปิยมหาราช' }),
    )
    expect(h).toEqual({ id: ANY_STRING, date: '2026-10-23', name: 'วันปิยมหาราช' })
    const audits = await holidayAudits()
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      action: 'create',
      entityId: h.id,
      projectId: null,
      summary: th.audit.holidayCreated('2026-10-23', 'วันปิยมหาราช'),
    })
    const e = await caught(
      db.transaction((tx) => createHoliday(tx, null, { date: '2026-10-23', name: 'ซ้ำ' })),
    )
    expect(e.code).toBe('CONFLICT')
    expect(e.message).toBe(th.holidays.errors.dateTaken)
    expect(e.extra.fieldErrors).toEqual({ date: [th.holidays.errors.dateTaken] })
    expect(await holidayAudits()).toHaveLength(1)
  })

  it('update: renames / moves, audits before/after; to an existing date → CONFLICT; missing → NOT_FOUND', async () => {
    const a = await makeHoliday({ date: '2026-10-23', name: 'A' })
    await makeHoliday({ date: '2026-12-31', name: 'B' })
    const u = await db.transaction((tx) =>
      updateHoliday(tx, null, { id: a.id, date: '2026-10-24', name: 'A2' }),
    )
    expect(u).toEqual({ id: a.id, date: '2026-10-24', name: 'A2' })
    const [audit] = await holidayAudits()
    expect(audit).toMatchObject({
      action: 'update',
      before: { date: '2026-10-23', name: 'A' },
      after: { date: '2026-10-24', name: 'A2' },
    })
    const e = await caught(
      db.transaction((tx) => updateHoliday(tx, null, { id: a.id, date: '2026-12-31', name: 'A3' })),
    )
    expect(e.code).toBe('CONFLICT')
    expect(e.extra.fieldErrors).toEqual({ date: [th.holidays.errors.dateTaken] })
    const missing = await caught(
      db.transaction((tx) =>
        updateHoliday(tx, null, {
          id: '00000000-0000-4000-8000-000000000000',
          date: '2026-01-01',
          name: 'x',
        }),
      ),
    )
    expect(missing.code).toBe('NOT_FOUND')
  })

  it('delete returns the snapshot and removes the row; restore re-creates the same id; date taken since → restoreConflict', async () => {
    const a = await makeHoliday({ date: '2026-10-23', name: 'A' })
    const deleted = await db.transaction((tx) => deleteHoliday(tx, null, a.id))
    expect(deleted).toEqual({ id: a.id, date: '2026-10-23', name: 'A' })
    expect(await db.select().from(holidays)).toEqual([])
    const restored = await db.transaction((tx) => restoreHoliday(tx, null, deleted))
    expect(restored).toEqual(deleted)
    expect((await db.select().from(holidays))[0]?.id).toBe(a.id)
    expect((await holidayAudits()).map((r) => r.action).sort()).toEqual(['delete', 'restore'])

    await db.transaction((tx) => deleteHoliday(tx, null, a.id))
    await makeHoliday({ date: '2026-10-23', name: 'ใหม่' })
    const e = await caught(db.transaction((tx) => restoreHoliday(tx, null, deleted)))
    expect(e.code).toBe('CONFLICT')
    expect(e.message).toBe(th.holidays.errors.restoreConflict)
    const gone = await caught(db.transaction((tx) => deleteHoliday(tx, null, a.id)))
    expect(gone.code).toBe('NOT_FOUND')
  })

  it('import upserts by date with one audit row; counts new / renamed / unchanged', async () => {
    const r1 = await db.transaction((tx) =>
      importHolidays(tx, null, [
        { date: '2026-10-23', name: 'A' },
        { date: '2026-12-31', name: 'B' },
      ]),
    )
    expect(r1).toEqual({ inserted: 2, updated: 0, unchanged: 0 })
    expect(await holidayAudits()).toHaveLength(1)
    const r2 = await db.transaction((tx) =>
      importHolidays(tx, null, [
        { date: '2026-12-31', name: 'B2' },
        { date: '2026-12-30', name: 'C' },
        { date: '2026-10-23', name: 'A' },
      ]),
    )
    expect(r2).toEqual({ inserted: 1, updated: 1, unchanged: 1 })
    const audits = await holidayAudits()
    expect(audits).toHaveLength(2)
    const last = audits.find((a) => a.summary === th.audit.holidaysImported(1, 1))
    expect(last?.after).toEqual({ inserted: 1, updated: 1, dates: ['2026-12-30', '2026-12-31'] })
    expect((await listHolidays(db)).map((h) => [h.date, h.name])).toEqual([
      ['2026-10-23', 'A'],
      ['2026-12-30', 'C'],
      ['2026-12-31', 'B2'],
    ])
  })

  it('import guards: 501 rows → VALIDATION; duplicate dates → VALIDATION and nothing written (all-or-nothing)', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ date: addDays('2027-01-01', i), name: `h${i}` }))
    const tooMany = await caught(db.transaction((tx) => importHolidays(tx, null, many)))
    expect(tooMany.code).toBe('VALIDATION')
    expect(tooMany.message).toBe(th.holidays.import.errors.tooMany(500))
    const dup = await caught(
      db.transaction((tx) =>
        importHolidays(tx, null, [
          { date: '2026-10-23', name: 'A' },
          { date: '2026-10-23', name: 'B' },
        ]),
      ),
    )
    expect(dup.code).toBe('VALIDATION')
    expect(dup.message).toBe(th.holidays.import.errors.duplicateAny)
    expect(await db.select().from(holidays)).toEqual([])
    expect(await holidayAudits()).toEqual([])
  })

  it('listHolidaysInRange: from ≤ date < to, by date, {date, name} only', async () => {
    await makeHoliday({ date: '2026-10-19', name: 'start' })
    await makeHoliday({ date: '2026-10-23', name: 'mid' })
    await makeHoliday({ date: '2026-10-26', name: 'end (exclusive)' })
    await makeHoliday({ date: '2026-10-18', name: 'before' })
    expect(await listHolidaysInRange(db, { from: '2026-10-20', to: '2026-10-26' })).toEqual([
      { date: '2026-10-23', name: 'mid' },
    ])
    expect(await listHolidaysInRange(db, { from: '2026-10-19', to: '2026-10-26' })).toEqual([
      { date: '2026-10-19', name: 'start' },
      { date: '2026-10-23', name: 'mid' },
    ])
  })
})

describe('holidays actions (PERM-02, M5-D15)', () => {
  it('manager: create → { holiday } + refresh(); worker → FORBIDDEN without a write', async () => {
    const manager = await makeUser({ role: 'manager' })
    const worker = await makeUser()
    asUser(worker)
    const denied = await createHolidayAction({ date: '2027-01-02', name: 'x' })
    expect(denied).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await db.select().from(holidays)).toEqual([])
    asUser(manager)
    const ok = await createHolidayAction({ date: '2027-01-02', name: '  วันหยุด  ' })
    expect(ok).toMatchObject({ ok: true, holiday: { date: '2027-01-02', name: 'วันหยุด' } })
    expect(testCache.refresh).toHaveBeenCalled()
    const [audit] = await holidayAudits()
    expect(audit?.actorId).toBe(manager.id)
    const del = await deleteHolidayAction({ id: ok.ok ? ok.holiday.id : '' })
    expect(del).toMatchObject({ ok: true, deleted: { date: '2027-01-02', name: 'วันหยุด' } })
  })

  it('importHolidays action re-validates (duplicates → VALIDATION) and imports in one transaction', async () => {
    asUser(await makeUser({ role: 'manager' }))
    const dup = await importHolidaysAction({
      rows: [
        { date: '2026-10-23', name: 'A' },
        { date: '2026-10-23', name: 'B' },
      ],
    })
    expect(dup).toMatchObject({ ok: false, code: 'VALIDATION' })
    const ok = await importHolidaysAction({ rows: [{ date: '2026-10-23', name: 'A' }] })
    expect(ok).toEqual({ ok: true, inserted: 1, updated: 0, unchanged: 0 })
  })
})
