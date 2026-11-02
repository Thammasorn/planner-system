// BR-90 cell values: server validation (M11-D15), tolerant reads (FR-1416), display text (BR-93 step 4).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DB_LIMITS,
  cellText,
  isEmptyCell,
  normalizeCellInput,
  numberConfigOf,
  optionsOf,
  readCell,
  rowValue,
} from './database'
import {
  CINDY,
  IVY,
  OLD,
  OPT_DOING,
  OPT_DONE,
  OPT_TODO,
  PEOPLE,
  col,
  row,
} from './database/fixtures.test.helper'

const active = new Set([CINDY, IVY])
const nctx = { activeUserIds: active }
const ok = (value: unknown) => ({ ok: true, value })
const bad = (reason: string) => ({ ok: false, reason })

describe('normalizeCellInput (M11-D15)', () => {
  const text = col('TEXT')
  const url = col('URL')
  const num = col('NUMBER')
  const sel = col('SELECT')
  const multi = col('MULTI_SELECT')
  const date = col('DATE')
  const check = col('CHECKBOX')
  const person = col('PERSON')
  const title = col('TITLE')

  it.each([null, undefined, '', '   ', [], false])('empty %j → null for every type', (v) => {
    for (const c of [text, url, num, sel, multi, date, check, person]) {
      expect(normalizeCellInput(c, v, nctx)).toEqual(ok(null))
    }
  })
  it('TITLE never lives in cells', () => {
    expect(normalizeCellInput(title, 'x', nctx)).toEqual(bad('TITLE'))
  })
  it('TEXT is trimmed and ≤ 2,000', () => {
    expect(normalizeCellInput(text, '  hi  ', nctx)).toEqual(ok('hi'))
    expect(normalizeCellInput(text, 'a'.repeat(DB_LIMITS.text), nctx)).toEqual(ok('a'.repeat(DB_LIMITS.text)))
    expect(normalizeCellInput(text, 'a'.repeat(DB_LIMITS.text + 1), nctx)).toEqual(bad('TOO_LONG'))
    expect(normalizeCellInput(text, 12, nctx)).toEqual(bad('TYPE'))
    expect(normalizeCellInput(text, true, nctx)).toEqual(bad('TYPE'))
  })
  it('URL must be http/https/mailto (AC-1402 javascript: rejected)', () => {
    expect(normalizeCellInput(url, ' https://x.co ', nctx)).toEqual(ok('https://x.co'))
    expect(normalizeCellInput(url, 'javascript:alert(1)', nctx)).toEqual(bad('URL'))
    expect(normalizeCellInput(url, 'https://x.co/' + 'a'.repeat(DB_LIMITS.text), nctx)).toEqual(
      bad('TOO_LONG'),
    )
  })
  it('NUMBER must already be canonical', () => {
    expect(normalizeCellInput(num, '1234567.891234', nctx)).toEqual(ok('1234567.891234'))
    expect(normalizeCellInput(num, '1,500', nctx)).toEqual(bad('NOT_CANONICAL'))
    expect(normalizeCellInput(num, '-0', nctx)).toEqual(bad('NOT_CANONICAL'))
    expect(normalizeCellInput(num, 1500, nctx)).toEqual(bad('TYPE'))
  })
  it('SELECT id must be a current option', () => {
    expect(normalizeCellInput(sel, OPT_DOING.id, nctx)).toEqual(ok(OPT_DOING.id))
    expect(normalizeCellInput(sel, 'o-gone', nctx)).toEqual(bad('UNKNOWN_OPTION'))
    expect(normalizeCellInput(sel, [OPT_DOING.id], nctx)).toEqual(bad('TYPE'))
  })
  it('MULTI_SELECT: unique current ids, 1–20, order kept', () => {
    expect(normalizeCellInput(multi, [OPT_DONE.id, OPT_TODO.id], nctx)).toEqual(
      ok([OPT_DONE.id, OPT_TODO.id]),
    )
    expect(normalizeCellInput(multi, [OPT_DONE.id, OPT_DONE.id], nctx)).toEqual(bad('DUPLICATE'))
    expect(normalizeCellInput(multi, ['o-gone'], nctx)).toEqual(bad('UNKNOWN_OPTION'))
    expect(normalizeCellInput(multi, OPT_DONE.id, nctx)).toEqual(bad('TYPE'))
    expect(normalizeCellInput(multi, [1], nctx)).toEqual(bad('TYPE'))
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `o${i}`,
      name: `n${i}`,
      color: 'gray' as const,
    }))
    const big = col('MULTI_SELECT', { config: { options: many } })
    expect(
      normalizeCellInput(
        big,
        many.map((o) => o.id),
        nctx,
      ),
    ).toEqual(bad('TOO_MANY'))
    expect(
      normalizeCellInput(
        big,
        many.slice(0, 20).map((o) => o.id),
        nctx,
      ).ok,
    ).toBe(true)
  })
  it('DATE must be a real ISO date', () => {
    expect(normalizeCellInput(date, '2026-11-05', nctx)).toEqual(ok('2026-11-05'))
    expect(normalizeCellInput(date, '2026-02-30', nctx)).toEqual(bad('DATE'))
    expect(normalizeCellInput(date, '5/11/2569', nctx)).toEqual(bad('DATE'))
  })
  it('CHECKBOX accepts only true', () => {
    expect(normalizeCellInput(check, true, nctx)).toEqual(ok(true))
    expect(normalizeCellInput(check, 'true', nctx)).toEqual(bad('TYPE'))
  })
  it('PERSON: unique ids 1–20; new ids must be active, stored inactive ids may stay', () => {
    expect(normalizeCellInput(person, [CINDY, IVY], nctx)).toEqual(ok([CINDY, IVY]))
    expect(normalizeCellInput(person, [OLD], nctx)).toEqual(bad('INACTIVE_USER'))
    expect(normalizeCellInput(person, [OLD, CINDY], { ...nctx, stored: [OLD] })).toEqual(ok([OLD, CINDY]))
    expect(normalizeCellInput(person, [OLD], { ...nctx, stored: 'garbage' })).toEqual(bad('INACTIVE_USER'))
    expect(normalizeCellInput(person, [CINDY, CINDY], nctx)).toEqual(bad('DUPLICATE'))
    expect(normalizeCellInput(person, CINDY, nctx)).toEqual(bad('TYPE'))
    const ids = Array.from({ length: 21 }, (_, i) => `u${i}`)
    expect(normalizeCellInput(person, ids, { activeUserIds: new Set(ids) })).toEqual(bad('TOO_MANY'))
  })
})

describe('readCell (tolerant, FR-1416)', () => {
  const sel = col('SELECT')
  const multi = col('MULTI_SELECT')
  it.each([
    ['TEXT', 'hi', 'hi'],
    ['TEXT', '  ', null],
    ['TEXT', 5, null],
    ['URL', 'https://x.co', 'https://x.co'],
    ['URL', '', null],
    ['NUMBER', '12.5', '12.5'],
    ['NUMBER', '12.50', null],
    ['NUMBER', 12, null],
    ['DATE', '2026-11-05', '2026-11-05'],
    ['DATE', '2026-13-01', null],
    ['DATE', 3, null],
    ['CHECKBOX', true, true],
    ['CHECKBOX', 'true', null],
    ['PERSON', [CINDY, IVY], [CINDY, IVY]],
    ['PERSON', [CINDY, CINDY, '', 3], [CINDY]],
    ['PERSON', [], null],
    ['PERSON', 'u', null],
    ['TITLE', 'x', null],
  ] as const)('%s %j → %j', (type, stored, out) => {
    expect(readCell(col(type), stored)).toEqual(out)
  })
  it('undefined / null → null', () => {
    expect(readCell(col('TEXT'), undefined)).toBeNull()
    expect(readCell(col('TEXT'), null)).toBeNull()
  })
  it('SELECT: unknown (deleted) option ids read as empty', () => {
    expect(readCell(sel, OPT_DONE.id)).toBe(OPT_DONE.id)
    expect(readCell(sel, 'o-gone')).toBeNull()
    expect(readCell(sel, [OPT_DONE.id])).toBeNull()
  })
  it('MULTI_SELECT: unknown ids filtered, duplicates dropped, empty → null', () => {
    expect(readCell(multi, ['o-gone', OPT_DONE.id, OPT_DONE.id, OPT_TODO.id])).toEqual([
      OPT_DONE.id,
      OPT_TODO.id,
    ])
    expect(readCell(multi, ['o-gone'])).toBeNull()
    expect(readCell(multi, OPT_DONE.id)).toBeNull()
  })
  it('a malformed config reads as no options', () => {
    const broken = col('SELECT', { config: {} })
    expect(readCell(broken, OPT_DONE.id)).toBeNull()
  })
  it('rowValue: TITLE comes from row.title, others from cells', () => {
    const t = col('TITLE')
    const x = col('TEXT')
    expect(rowValue(row('r', { [x.id]: 'v' }, { title: 'Hello' }), t)).toBe('Hello')
    expect(rowValue(row('r', {}, { title: '   ' }), t)).toBeNull()
    expect(rowValue(row('r', { [x.id]: 'v' }), x)).toBe('v')
  })
  it('property: normalize then read is the identity on accepted values', () => {
    const c = col('MULTI_SELECT')
    fc.assert(
      fc.property(fc.subarray([OPT_TODO.id, OPT_DOING.id, OPT_DONE.id]), (ids) => {
        const r = normalizeCellInput(c, ids, nctx)
        expect(r.ok).toBe(true)
        if (r.ok) expect(readCell(c, r.value)).toEqual(r.value)
      }),
    )
  })
})

describe('isEmptyCell', () => {
  it.each([
    [null, true],
    [undefined, true],
    ['', true],
    [[], true],
    [false, true],
    ['x', false],
    [['a'], false],
    [true, false],
  ])('%j → %s', (v, e) => expect(isEmptyCell(v)).toBe(e))
})

describe('cellText (BR-93 step 4)', () => {
  const people = { people: PEOPLE }
  it.each([
    ['TEXT', 'hi', 'hi'],
    ['URL', 'https://x.co', 'https://x.co'],
    ['NUMBER', '1234.5', '1234.5'],
    ['DATE', '2026-11-05', '2026-11-05'],
    ['CHECKBOX', true, '✓'],
    ['CHECKBOX', null, ''],
    ['TEXT', null, ''],
  ] as const)('%s %j → %j', (type, v, out) => expect(cellText(col(type), v, people)).toBe(out))
  it('options joined with ", "', () => {
    expect(cellText(col('SELECT'), OPT_DOING.id, people)).toBe('กำลังทำ')
    expect(cellText(col('MULTI_SELECT'), [OPT_DONE.id, OPT_TODO.id], people)).toBe('เสร็จ, ยังไม่เริ่ม')
  })
  it('people as full names joined with ", " (unknown ids skipped)', () => {
    expect(cellText(col('PERSON'), [CINDY, 'u-x', IVY], people)).toBe('ซินดี้ ชัยวัฒน์, ไอวี่ อิศรา')
  })
  it('TITLE text is the title string', () => {
    expect(cellText(col('TITLE'), 'Row', people)).toBe('Row')
    expect(cellText(col('TITLE'), 3, people)).toBe('')
  })
})

describe('config accessors', () => {
  it('numberConfigOf fills defaults (decimals as stored, thousands on)', () => {
    expect(numberConfigOf(col('NUMBER', { config: { decimals: 2, thousands: false } }))).toEqual({
      decimals: 2,
      thousands: false,
    })
    expect(numberConfigOf(col('NUMBER', { config: {} }))).toEqual({ decimals: null, thousands: true })
  })
  it('optionsOf reads options or none', () => {
    expect(optionsOf(col('SELECT')).map((o) => o.id)).toEqual([OPT_TODO.id, OPT_DOING.id, OPT_DONE.id])
    expect(optionsOf(col('TEXT'))).toEqual([])
  })
})
