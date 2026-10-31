import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/dates'
import { th } from '@/i18n/th'
import {
  HOLIDAY_CSV_MAX_BYTES,
  HOLIDAY_CSV_MAX_ROWS,
  classifyHolidayRows,
  decodeCsv,
  holidayCsvErrorMessage,
  parseCsvRecords,
  parseHolidaysCsv,
  type HolidayCsvError,
} from './holidays'

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

/** TIS-620 / windows-874 for ASCII + the Thai block: U+0E01…U+0E5B → 0xA1…0xFB. */
function encodeWindows874(s: string): Uint8Array {
  const out: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) out.push(cp)
    else if (cp >= 0x0e01 && cp <= 0x0e5b) out.push(cp - 0x0e01 + 0xa1)
    else throw new Error(`not encodable: ${ch}`)
  }
  return new Uint8Array(out)
}

const parse = (s: string) => parseHolidaysCsv(utf8(s))

describe('decodeCsv', () => {
  it('UTF-8 with BOM → BOM stripped', () => {
    expect(decodeCsv(utf8('﻿date,name'))).toEqual({ text: 'date,name', encoding: 'utf-8' })
  })
  it('UTF-8 without BOM (Thai) stays UTF-8', () => {
    expect(decodeCsv(utf8('2026-10-23,วันปิยมหาราช'))).toEqual({
      text: '2026-10-23,วันปิยมหาราช',
      encoding: 'utf-8',
    })
  })
  it('invalid UTF-8 → windows-874', () => {
    expect(decodeCsv(encodeWindows874('ลาพักร้อน'))).toEqual({ text: 'ลาพักร้อน', encoding: 'windows-874' })
  })
  it('empty input → empty UTF-8 text', () => {
    expect(decodeCsv(new Uint8Array(0))).toEqual({ text: '', encoding: 'utf-8' })
  })
})

describe('parseCsvRecords (RFC 4180 subset)', () => {
  it('LF, CRLF and CR line ends; physical line numbers', () => {
    expect(parseCsvRecords('a,b\nc,d\r\ne,f\rg,h').records).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['c', 'd'] },
      { line: 3, fields: ['e', 'f'] },
      { line: 4, fields: ['g', 'h'] },
    ])
  })
  it('a trailing line break does not create a record; blank lines are records with one empty field', () => {
    expect(parseCsvRecords('a\n\nb\n').records).toEqual([
      { line: 1, fields: ['a'] },
      { line: 2, fields: [''] },
      { line: 3, fields: ['b'] },
    ])
  })
  it('empty text → no records', () => {
    expect(parseCsvRecords('')).toEqual({ records: [], errors: [] })
  })
  it('unquoted fields are trimmed; quoted fields keep inner spaces', () => {
    expect(parseCsvRecords(' a ,  " b " , c').records).toEqual([{ line: 1, fields: ['a', ' b ', 'c'] }])
  })
  it('"" escapes, embedded commas and newlines; the record keeps its start line', () => {
    const r = parseCsvRecords('x,"a ""b"""\ny,"1,2"\nz,"l1\r\nl2"\nw,end')
    expect(r.errors).toEqual([])
    expect(r.records).toEqual([
      { line: 1, fields: ['x', 'a "b"'] },
      { line: 2, fields: ['y', '1,2'] },
      { line: 3, fields: ['z', 'l1\r\nl2'] },
      { line: 5, fields: ['w', 'end'] },
    ])
  })
  it('text after a closing quote is kept literally (lenient)', () => {
    expect(parseCsvRecords('"a"b ,c').records).toEqual([{ line: 1, fields: ['ab', 'c'] }])
  })
  it('a quote inside an unquoted field is literal', () => {
    expect(parseCsvRecords('a"b,c').records).toEqual([{ line: 1, fields: ['a"b', 'c'] }])
  })
  it('empty fields', () => {
    expect(parseCsvRecords(',,\n""').records).toEqual([
      { line: 1, fields: ['', '', ''] },
      { line: 2, fields: [''] },
    ])
  })
  it('unclosed quote → UNCLOSED_QUOTE at the line where the quote opened; that record is dropped', () => {
    expect(parseCsvRecords('a,b\n2026-10-23,"x\ny,z')).toEqual({
      records: [{ line: 1, fields: ['a', 'b'] }],
      errors: [{ line: 2, code: 'UNCLOSED_QUOTE' }],
    })
  })
})

describe('parseHolidaysCsv', () => {
  it('UTF-8 + BOM + header + CRLF', () => {
    expect(parse('﻿date,name\r\n2026-10-23,วันหยุดสมมติสำหรับทดสอบ\r\n')).toEqual({
      encoding: 'utf-8',
      rows: [{ line: 2, date: '2026-10-23', name: 'วันหยุดสมมติสำหรับทดสอบ' }],
      errors: [],
      fileError: null,
    })
  })
  it('windows-874 without header', () => {
    expect(parseHolidaysCsv(encodeWindows874('2026-10-23,วันปิยมหาราช\n'))).toEqual({
      encoding: 'windows-874',
      rows: [{ line: 1, date: '2026-10-23', name: 'วันปิยมหาราช' }],
      errors: [],
      fileError: null,
    })
  })
  it('header is case-insensitive and trimmed; quoted name with a comma', () => {
    const r = parse('Date , Name\n2026-12-31,"วันสิ้นปี, ครึ่งวัน"\n')
    expect(r.rows).toEqual([{ line: 2, date: '2026-12-31', name: 'วันสิ้นปี, ครึ่งวัน' }])
    expect(r.errors).toEqual([])
  })
  it('"" escape inside a quoted name', () => {
    expect(parse('2026-12-30,"a ""b"""').rows).toEqual([{ line: 1, date: '2026-12-30', name: 'a "b"' }])
  })
  it('a quoted name with an embedded newline keeps its start line', () => {
    const r = parse('date,name\n2026-12-30,"a\nb"\n2026-12-31,c')
    expect(r.rows).toEqual([
      { line: 2, date: '2026-12-30', name: 'a\nb' },
      { line: 4, date: '2026-12-31', name: 'c' },
    ])
  })
  it('a header is only recognised as the first non-blank record', () => {
    const r = parse('2026-10-23,x\ndate,name')
    expect(r.rows).toEqual([{ line: 1, date: '2026-10-23', name: 'x' }])
    expect(r.errors).toEqual([{ line: 2, code: 'BAD_DATE', raw: 'date' }])
  })
  it('trailing empty fields are ignored', () => {
    const r = parse('2026-10-23,x,,\n')
    expect(r.rows).toEqual([{ line: 1, date: '2026-10-23', name: 'x' }])
    expect(r.errors).toEqual([])
  })
  it('an extra non-empty field → COLUMNS', () => {
    expect(parse('2026-10-23,x,y\n').errors).toEqual([{ line: 1, code: 'COLUMNS' }])
  })
  it('a single field → COLUMNS', () => {
    expect(parse('2026-10-23\n').errors).toEqual([{ line: 1, code: 'COLUMNS' }])
  })
  it.each([
    ['23/10/2569', 'Thai D/M/BE'],
    ['2026-02-30', 'impossible day'],
    ['2569-10-23', 'B.E. year in ISO shape (never converted, M5-D11)'],
    ['2400-01-01', 'first rejected year'],
    ['2026-1-5', 'missing zero padding'],
  ])('BAD_DATE %s (%s)', (raw) => {
    const r = parse(`${raw},x`)
    expect(r.errors).toEqual([{ line: 1, code: 'BAD_DATE', raw }])
    expect(r.rows).toEqual([])
    expect(r.fileError).toBeNull()
  })
  it('2399-12-31 and 2026-10-23 are accepted', () => {
    expect(parse('2399-12-31,x\n2026-10-23,y').rows.map((r) => r.date)).toEqual(['2399-12-31', '2026-10-23'])
  })
  it('empty name → EMPTY_NAME', () => {
    expect(parse('2026-10-23,').errors).toEqual([{ line: 1, code: 'EMPTY_NAME' }])
    expect(parse('2026-10-23,"   "').errors).toEqual([{ line: 1, code: 'EMPTY_NAME' }])
  })
  it('name of 200 chars ok, 201 → NAME_TOO_LONG', () => {
    expect(parse(`2026-10-23,${'ก'.repeat(200)}`).errors).toEqual([])
    expect(parse(`2026-10-23,${'ก'.repeat(201)}`).errors).toEqual([{ line: 1, code: 'NAME_TOO_LONG' }])
  })
  it('names are trimmed and NFC-normalised', () => {
    const decomposed = 'Café'
    expect(parse(`2026-10-23,"  ${decomposed}  "`).rows[0]?.name).toBe('Café')
  })
  it('duplicate date → DUPLICATE on the later line with firstLine', () => {
    const r = parse('date,name\n2026-10-23,a\n2026-12-31,b\n2026-10-23,c')
    expect(r.errors).toEqual([{ line: 4, code: 'DUPLICATE', date: '2026-10-23', firstLine: 2 }])
    expect(r.rows.map((x) => x.line)).toEqual([2, 3])
  })
  it('unclosed quote → UNCLOSED_QUOTE line 1', () => {
    const r = parse('2026-10-23,"x')
    expect(r.errors).toEqual([{ line: 1, code: 'UNCLOSED_QUOTE' }])
    expect(r.fileError).toBeNull()
  })
  it('blank lines are skipped and later line numbers stay physical', () => {
    const r = parse('date,name\n\n2026-10-23,x\n ,  \n\n2026-10-24,y')
    expect(r.rows).toEqual([
      { line: 3, date: '2026-10-23', name: 'x' },
      { line: 6, date: '2026-10-24', name: 'y' },
    ])
    expect(r.errors).toEqual([])
  })
  it('blank lines before the header', () => {
    expect(parse('\n\ndate,name\n2026-10-23,x').rows).toEqual([{ line: 4, date: '2026-10-23', name: 'x' }])
  })
  it('collects every line error, rows only hold valid lines', () => {
    const r = parse('2026-10-23,a\nbad,b\n2026-10-24,\n2026-10-25,c')
    expect(r.rows.map((x) => x.date)).toEqual(['2026-10-23', '2026-10-25'])
    expect(r.errors.map((e) => [e.line, e.code])).toEqual([
      [2, 'BAD_DATE'],
      [3, 'EMPTY_NAME'],
    ])
  })
  it('empty file → EMPTY', () => {
    expect(parseHolidaysCsv(new Uint8Array(0))).toEqual({
      encoding: 'utf-8',
      rows: [],
      errors: [],
      fileError: 'EMPTY',
    })
  })
  it('header only → EMPTY', () => {
    expect(parse('date,name\n').fileError).toBe('EMPTY')
    expect(parse('﻿date,name\r\n\r\n').fileError).toBe('EMPTY')
  })
  it(`${HOLIDAY_CSV_MAX_ROWS} data rows ok, ${HOLIDAY_CSV_MAX_ROWS + 1} → TOO_MANY`, () => {
    const unique = (n: number) =>
      Array.from({ length: n }, (_, i) => `${addDays('2026-01-01', i)},h${i}`).join('\n')
    const ok = parse(`date,name\n${unique(HOLIDAY_CSV_MAX_ROWS)}`)
    expect(ok.fileError).toBeNull()
    expect(ok.rows).toHaveLength(HOLIDAY_CSV_MAX_ROWS)
    expect(parse(`date,name\n${unique(HOLIDAY_CSV_MAX_ROWS + 1)}`).fileError).toBe('TOO_MANY')
  })
  it('more than 256 KiB → TOO_LARGE', () => {
    expect(HOLIDAY_CSV_MAX_BYTES).toBe(256 * 1024)
    expect(parseHolidaysCsv(new Uint8Array(HOLIDAY_CSV_MAX_BYTES + 1).fill(0x61))).toEqual({
      encoding: 'utf-8',
      rows: [],
      errors: [],
      fileError: 'TOO_LARGE',
    })
    expect(parseHolidaysCsv(new Uint8Array(HOLIDAY_CSV_MAX_BYTES).fill(0x0a)).fileError).toBe('EMPTY')
  })
})

describe('holidayCsvErrorMessage', () => {
  const e = th.holidays.import.errors
  it.each<[HolidayCsvError, string]>([
    [
      { line: 4, code: 'DUPLICATE', date: '2026-10-23', firstLine: 2 },
      e.line(4, e.duplicate('2026-10-23', 2)),
    ],
    [{ line: 1, code: 'COLUMNS' }, e.line(1, e.columns)],
    [{ line: 2, code: 'BAD_DATE', raw: '2569-10-23' }, e.line(2, e.badDate('2569-10-23'))],
    [{ line: 3, code: 'EMPTY_NAME' }, e.line(3, e.emptyName)],
    [{ line: 5, code: 'NAME_TOO_LONG' }, e.line(5, e.nameTooLong)],
    [{ line: 6, code: 'UNCLOSED_QUOTE' }, e.line(6, e.unclosedQuote)],
    [{ line: 7, code: 'BAD_DATE' }, e.line(7, e.badDate(''))],
    [{ line: 8, code: 'DUPLICATE' }, e.line(8, e.duplicate('', 0))],
  ])('%j', (err, expected) => {
    expect(holidayCsvErrorMessage(err)).toBe(expected)
  })
  it('DUPLICATE example from the plan', () => {
    expect(holidayCsvErrorMessage({ line: 4, code: 'DUPLICATE', date: '2026-10-23', firstLine: 2 })).toBe(
      'บรรทัด 4: วันที่ 2026-10-23 ซ้ำกับบรรทัด 2',
    )
  })
})

describe('classifyHolidayRows', () => {
  it('new / update / same against the existing holidays', () => {
    const rows = [
      { line: 1, date: '2026-10-23', name: 'A' },
      { line: 2, date: '2026-12-31', name: 'B' },
      { line: 3, date: '2027-01-01', name: 'C' },
    ]
    const existing = [
      { date: '2026-10-23', name: 'A' },
      { date: '2026-12-31', name: 'Old' },
      { date: '2026-05-01', name: 'unrelated' },
    ]
    expect(classifyHolidayRows(rows, existing)).toEqual([
      { line: 1, date: '2026-10-23', name: 'A', status: 'same' },
      { line: 2, date: '2026-12-31', name: 'B', status: 'update', previousName: 'Old' },
      { line: 3, date: '2027-01-01', name: 'C', status: 'new' },
    ])
  })
  it('no rows → []', () => {
    expect(classifyHolidayRows([], [{ date: '2026-10-23', name: 'A' }])).toEqual([])
  })
})
