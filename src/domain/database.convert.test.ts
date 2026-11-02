// BR-93 column type conversion (plan/m11 S1.7, AC-1406, FR-1414).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DB_LIMITS,
  DbDomainError,
  OPTION_COLORS,
  convertCell,
  convertColumn,
  type ConvertUser,
} from './database'
import type { DbColumnType, SelectConfig } from './types'
import {
  CINDY,
  IVY,
  MINT,
  OLD,
  OPT_DOING,
  OPT_DONE,
  OPT_TODO,
  TODAY,
  col,
  row,
} from './database/fixtures.test.helper'

const USERS: ConvertUser[] = [
  { id: CINDY, name: 'ซินดี้ ชัยวัฒน์', nickname: 'Cindy', email: 'cindy@team.test', active: true },
  { id: IVY, name: 'ไอวี่ อิศรา', nickname: 'Ivy', email: 'ivy@team.test', active: true },
  { id: MINT, name: 'มินท์ มานะ', nickname: 'Mint', email: 'mint@team.test', active: true },
  { id: 'u-mint2', name: 'Mint Two', nickname: 'Mint', email: 'mint2@team.test', active: true },
  { id: OLD, name: 'กมล เก่า', nickname: 'Kamon', email: 'old@team.test', active: false },
]
const cctx = { users: USERS, today: TODAY }
let seq = 0
const newId = () => `new-${++seq}`
const xctx = () => {
  seq = 0
  return { ...cctx, newId }
}

function to(type: DbColumnType, config: object = {}) {
  return { type, config } as { type: DbColumnType; config: SelectConfig }
}

describe('convertCell (BR-93)', () => {
  const text = col('TEXT')
  const num = col('NUMBER')
  const sel = col('SELECT')
  const multi = col('MULTI_SELECT')
  const check = col('CHECKBOX')
  const date = col('DATE')
  const person = col('PERSON')
  const url = col('URL')
  const opts = sel.config as SelectConfig

  it('(1) same type keeps the value', () => {
    expect(convertCell(text, to('TEXT'), 'abc', cctx)).toBe('abc')
    expect(convertCell(person, to('PERSON'), [OLD], cctx)).toEqual([OLD])
  })
  it('(2) SELECT ↔ MULTI_SELECT', () => {
    expect(convertCell(sel, to('MULTI_SELECT', opts), OPT_DOING.id, cctx)).toEqual([OPT_DOING.id])
    expect(convertCell(multi, to('SELECT', opts), [OPT_DONE.id, OPT_TODO.id], cctx)).toBe(OPT_DONE.id)
  })
  it('(3) NUMBER ↔ CHECKBOX', () => {
    expect(convertCell(num, to('CHECKBOX'), '0.5', cctx)).toBe(true)
    expect(convertCell(num, to('CHECKBOX'), '-3', cctx)).toBe(true)
    expect(convertCell(num, to('CHECKBOX'), '0', cctx)).toBeNull()
    expect(convertCell(check, to('NUMBER'), true, cctx)).toBe('1')
    expect(convertCell(check, to('NUMBER'), undefined, cctx)).toBeNull()
  })
  it('empty stays empty', () => {
    expect(convertCell(text, to('NUMBER'), undefined, cctx)).toBeNull()
  })
  it.each([
    ['12', '12'],
    ['abc', null],
    ['1,500', '1500'],
    ['๑๒', '12'],
    ['', null],
  ])('(4) TEXT %j → NUMBER %j (AC-1406)', (v, out) => {
    expect(convertCell(text, to('NUMBER'), v, cctx)).toBe(out)
  })
  it.each([
    ['5/11/2569', '2026-11-05'],
    ['2026-11-05', '2026-11-05'],
    ['31/2', null],
    ['soon', null],
  ])('(4) TEXT %j → DATE %j', (v, out) => expect(convertCell(text, to('DATE'), v, cctx)).toBe(out))
  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['Yes', true],
    ['y', true],
    ['ใช่', true],
    ['✓', true],
    ['X', true],
    [' x ', true],
    ['no', null],
    ['0', null],
    ['ok', null],
  ])('(4) TEXT %j → CHECKBOX %j', (v, out) => expect(convertCell(text, to('CHECKBOX'), v, cctx)).toBe(out))
  it('(4) TEXT → URL keeps valid links only', () => {
    expect(convertCell(text, to('URL'), 'https://x.co', cctx)).toBe('https://x.co')
    expect(convertCell(text, to('URL'), 'javascript:alert(1)', cctx)).toBeNull()
  })
  it('(4) values → TEXT through the display text, cut at 2,000', () => {
    expect(convertCell(multi, to('TEXT'), [OPT_DONE.id, OPT_TODO.id], cctx)).toBe('เสร็จ, ยังไม่เริ่ม')
    expect(convertCell(person, to('TEXT'), [CINDY, IVY], cctx)).toBe('ซินดี้ ชัยวัฒน์, ไอวี่ อิศรา')
    expect(convertCell(check, to('TEXT'), true, cctx)).toBe('✓')
    expect(convertCell(date, to('TEXT'), '2026-11-05', cctx)).toBe('2026-11-05')
    expect(convertCell(url, to('TEXT'), 'https://x.co', cctx)).toBe('https://x.co')
    expect(convertCell(person, to('TEXT'), ['u-unknown'], cctx)).toBeNull() // no known name → empty text → empty
    const longOpts = Array.from({ length: 20 }, (_, i) => ({
      id: `L${i}`,
      name: 'n'.repeat(100),
      color: 'gray' as const,
    }))
    const longMulti = col('MULTI_SELECT', { config: { options: longOpts } })
    expect(
      convertCell(
        longMulti,
        to('TEXT'),
        longOpts.map((o) => o.id),
        cctx,
      ),
    ).toHaveLength(DB_LIMITS.text)
  })
  it('(4) TEXT → SELECT / MULTI_SELECT maps names to the target options', () => {
    expect(convertCell(text, to('SELECT', opts), 'กำลังทำ', cctx)).toBe(OPT_DOING.id)
    expect(convertCell(text, to('SELECT', opts), 'other', cctx)).toBeNull()
    expect(convertCell(text, to('MULTI_SELECT', opts), 'เสร็จ, x, เสร็จ, ยังไม่เริ่ม', cctx)).toEqual([
      OPT_DONE.id,
      OPT_TODO.id,
    ])
    expect(convertCell(text, to('MULTI_SELECT', opts), 'x, y', cctx)).toBeNull()
  })
  it('(4) TEXT → PERSON: exactly one active match by name / nickname / email, case-insensitive', () => {
    expect(convertCell(text, to('PERSON'), 'cindy, IVY@TEAM.TEST, ไอวี่ อิศรา, nobody', cctx)).toEqual([
      CINDY,
      IVY,
    ])
    expect(convertCell(text, to('PERSON'), 'Mint', cctx)).toBeNull() // ambiguous (two active "Mint")
    expect(convertCell(text, to('PERSON'), 'มินท์ มานะ', cctx)).toEqual([MINT])
    expect(convertCell(text, to('PERSON'), 'Kamon', cctx)).toBeNull() // inactive
  })
  it('(4) TEXT → PERSON keeps at most 20 people', () => {
    const many: ConvertUser[] = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      nickname: null,
      email: `p${i}@t`,
      active: true,
    }))
    const names = many.map((u) => u.name).join(', ')
    expect(convertCell(text, to('PERSON'), names, { users: many, today: TODAY })).toHaveLength(
      DB_LIMITS.people,
    )
  })
  it('(5) TITLE in either direction throws', () => {
    expect(() => convertCell(col('TITLE'), to('TEXT'), 'x', cctx)).toThrow(DbDomainError)
    expect(() => convertCell(text, to('TITLE'), 'x', cctx)).toThrow(DbDomainError)
  })
})

describe('convertColumn (BR-93, M11-D16)', () => {
  it('AC-1406: TEXT "12", "abc", "1,500" → NUMBER 12, empty, 1500', () => {
    const c = col('TEXT')
    const rows = [
      row('r1', { [c.id]: '12' }),
      row('r2', { [c.id]: 'abc' }),
      row('r3', { [c.id]: '1,500' }),
      row('r4'),
    ]
    const out = convertColumn(c, 'NUMBER', rows, xctx())
    expect(out.config).toEqual({ decimals: null, thousands: true })
    expect([...out.values]).toEqual([
      ['r1', '12'],
      ['r2', null],
      ['r3', '1500'],
      ['r4', null],
    ])
  })
  it('AC-1406: TEXT → SELECT creates options from unique texts in order, palette cycling', () => {
    const c = col('TEXT')
    const texts = ['b', 'a', 'b', ' a ', ...Array.from({ length: 10 }, (_, i) => `t${i}`)]
    const rows = texts.map((t, i) => row(`r${i}`, { [c.id]: t }))
    const out = convertColumn(c, 'SELECT', rows, xctx())
    const options = (out.config as SelectConfig).options
    expect(options.map((o) => o.name)).toEqual(['b', 'a', ...Array.from({ length: 10 }, (_, i) => `t${i}`)])
    expect(options.map((o) => o.color)).toEqual([...OPTION_COLORS, OPTION_COLORS[0], OPTION_COLORS[1]])
    expect(options[0]!.id).toBe('new-1')
    expect(out.values.get('r0')).toBe(options[0]!.id)
    expect(out.values.get('r3')).toBe(options[1]!.id)
  })
  it('TEXT → MULTI_SELECT splits on "," and keeps ≤ 20 values per cell', () => {
    const c = col('TEXT')
    const many = Array.from({ length: 22 }, (_, i) => `v${i}`).join(', ')
    const out = convertColumn(
      c,
      'MULTI_SELECT',
      [row('r1', { [c.id]: 'x, y, x' }), row('r2', { [c.id]: many })],
      xctx(),
    )
    const options = (out.config as SelectConfig).options
    expect(options.map((o) => o.name).slice(0, 2)).toEqual(['x', 'y'])
    expect(out.values.get('r1')).toEqual([options[0]!.id, options[1]!.id])
    expect(out.values.get('r2')).toHaveLength(DB_LIMITS.multi)
  })
  it('more than 100 unique texts → the extra cells become empty', () => {
    const c = col('TEXT')
    const rows = Array.from({ length: 105 }, (_, i) => row(`r${i}`, { [c.id]: `n${i}` }))
    const out = convertColumn(c, 'SELECT', rows, xctx())
    expect((out.config as SelectConfig).options).toHaveLength(DB_LIMITS.optionsPerColumn)
    expect(out.values.get('r99')).not.toBeNull()
    expect(out.values.get('r100')).toBeNull()
  })
  it('option names are cut to the name limit', () => {
    const c = col('TEXT')
    const long = 'x'.repeat(DB_LIMITS.name + 20)
    const out = convertColumn(c, 'SELECT', [row('r1', { [c.id]: long })], xctx())
    expect((out.config as SelectConfig).options[0]!.name).toHaveLength(DB_LIMITS.name)
    expect(out.values.get('r1')).toBe('new-1')
  })
  it('SELECT ↔ MULTI_SELECT keeps the options (same ids)', () => {
    const c = col('SELECT')
    const out = convertColumn(c, 'MULTI_SELECT', [row('r1', { [c.id]: OPT_DONE.id })], xctx())
    expect(out.config).toEqual(c.config)
    expect(out.values.get('r1')).toEqual([OPT_DONE.id])
  })
  it('other targets get the empty config; PERSON matches users', () => {
    const c = col('TEXT')
    const out = convertColumn(c, 'PERSON', [row('r1', { [c.id]: 'Cindy, Ivy' })], xctx())
    expect(out.config).toEqual({})
    expect(out.values.get('r1')).toEqual([CINDY, IVY])
  })
  it('TITLE in either direction throws DbDomainError(TITLE)', () => {
    expect(() => convertColumn(col('TITLE'), 'TEXT', [], xctx())).toThrow(new DbDomainError('TITLE'))
    expect(() => convertColumn(col('TEXT'), 'TITLE', [], xctx())).toThrow(DbDomainError)
  })
  it('property: converting to the same type is the identity (read form)', () => {
    const c = col('MULTI_SELECT')
    fc.assert(
      fc.property(
        fc.array(fc.subarray([OPT_TODO.id, OPT_DOING.id, OPT_DONE.id]), { maxLength: 20 }),
        (cells) => {
          const rows = cells.map((v, i) => row(`r${i}`, { [c.id]: v }))
          const out = convertColumn(c, 'MULTI_SELECT', rows, xctx())
          expect(out.config).toBe(c.config)
          rows.forEach((r, i) => expect(out.values.get(r.id)).toEqual(cells[i]!.length ? cells[i] : null))
        },
      ),
    )
  })
  it('property: TEXT → NUMBER → TEXT keeps canonical numbers', () => {
    const t = col('TEXT')
    const n = col('NUMBER')
    const canonical = fc.bigInt({ min: -(10n ** 21n) + 1n, max: 10n ** 21n - 1n }).map((s) => {
      const neg = s < 0n
      const m = neg ? -s : s
      const frac = (m % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
      return m === 0n ? '0' : (neg ? '-' : '') + (m / 1_000_000n).toString() + (frac ? '.' + frac : '')
    })
    fc.assert(
      fc.property(canonical, (v) => {
        const asNumber = convertCell(
          t,
          { type: 'NUMBER', config: { decimals: null, thousands: true } },
          v,
          cctx,
        )
        expect(asNumber).toBe(v)
        expect(convertCell(n, { type: 'TEXT', config: {} }, asNumber, cctx)).toBe(v)
      }),
    )
  })
})
