// M5 S2.8 — `pnpm import:holidays <file.csv> [--dry-run]` core (FR-901, M5-D11, X64): the shared CSV parser, then the
// holidays service in one transaction (actor null). Bad files write nothing.
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { auditLog, holidays } from '@/server/db/schema'
import { runImportHolidays } from './import-holidays'

/** windows-874 (TIS-620 superset): ASCII as is; U+0E01…U+0E5B → cp − 0x0E01 + 0xA1. */
function encodeWindows874(s: string): Uint8Array {
  const out: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) out.push(cp)
    else if (cp >= 0x0e01 && cp <= 0x0e5b) out.push(cp - 0x0e01 + 0xa1)
    else throw new Error(`not encodable: ${ch}`)
  }
  return Uint8Array.from(out)
}

const CSV = 'date,name\r\n2026-10-23,วันปิยมหาราช\r\n2026-12-31,วันสิ้นปี\r\n'
const utf8Bom = (s: string) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(s)])

describe('runImportHolidays', () => {
  it('UTF-8 + BOM → inserted 2 (one audit row); the same content in windows-874 → unchanged 2', async () => {
    expect(await runImportHolidays(db, utf8Bom(CSV), { dryRun: false })).toEqual({
      ok: true,
      result: { inserted: 2, updated: 0, unchanged: 0 },
    })
    expect((await db.select().from(holidays)).map((h) => [h.date, h.name]).sort()).toEqual([
      ['2026-10-23', 'วันปิยมหาราช'],
      ['2026-12-31', 'วันสิ้นปี'],
    ])
    const audits = await db.select().from(auditLog)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.actorId).toBeNull()
    expect(await runImportHolidays(db, encodeWindows874(CSV), { dryRun: false })).toEqual({
      ok: true,
      result: { inserted: 0, updated: 0, unchanged: 2 },
    })
  })

  it('a file with one bad line → ok:false with the line message; the table is unchanged', async () => {
    const bytes = utf8Bom('date,name\r\n23/10/2569,วันปิยมหาราช\r\n2026-12-31,วันสิ้นปี\r\n')
    expect(await runImportHolidays(db, bytes, { dryRun: false })).toEqual({
      ok: false,
      messages: [th.holidays.import.errors.line(2, th.holidays.import.errors.badDate('23/10/2569'))],
    })
    expect(await db.select().from(holidays)).toEqual([])
  })

  it('file-level errors: empty / too large', async () => {
    expect(await runImportHolidays(db, new Uint8Array(0), { dryRun: false })).toEqual({
      ok: false,
      messages: [th.holidays.import.errors.empty],
    })
    expect(await runImportHolidays(db, new Uint8Array(256 * 1024 + 1).fill(0x41), { dryRun: true })).toEqual({
      ok: false,
      messages: [th.holidays.import.errors.tooLarge],
    })
  })

  it('dryRun classifies against the existing holidays and writes nothing', async () => {
    await runImportHolidays(db, utf8Bom('2026-12-31,วันสิ้นปีเก่า\n'), { dryRun: false })
    const before = await db.select().from(auditLog)
    const res = await runImportHolidays(db, utf8Bom(CSV), { dryRun: true })
    expect(res).toEqual({
      ok: true,
      result: [
        { line: 2, date: '2026-10-23', name: 'วันปิยมหาราช', status: 'new' },
        { line: 3, date: '2026-12-31', name: 'วันสิ้นปี', status: 'update', previousName: 'วันสิ้นปีเก่า' },
      ],
    })
    expect((await db.select().from(holidays)).map((h) => h.name)).toEqual(['วันสิ้นปีเก่า'])
    expect(await db.select().from(auditLog)).toEqual(before)
  })
})
