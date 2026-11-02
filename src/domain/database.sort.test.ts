// BR-94 sorting (plan/m11 S1.8).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareRows, makeCollator, sortRows } from './database'
import type { DbRowModel, ViewSort } from './types'
import { CINDY, IVY, MINT, OPT_DOING, OPT_DONE, OPT_TODO, ctx, col, row } from './database/fixtures.test.helper'

const title = col('TITLE')
const text = col('TEXT')
const num = col('NUMBER')
const date = col('DATE')
const sel = col('SELECT')
const multi = col('MULTI_SELECT')
const check = col('CHECKBOX')
const person = col('PERSON')
const url = col('URL')
const cols = [title, text, num, date, sel, multi, check, person, url]

const ids = (rows: DbRowModel[]) => rows.map((r) => r.id)
const asc = (c: { id: string }): ViewSort => ({ columnId: c.id, dir: 'ASC' })
const desc = (c: { id: string }): ViewSort => ({ columnId: c.id, dir: 'DESC' })

describe('makeCollator', () => {
  it('is Thai, numeric, base sensitivity', () => {
    const c = makeCollator()
    expect(c.compare('a2', 'a10')).toBeLessThan(0)
    expect(c.compare('A', 'a')).toBe(0)
    expect(c.resolvedOptions().numeric).toBe(true)
  })
})

describe('sortRows (BR-94)', () => {
  it('no sorts → position then id (plain <, not localeCompare)', () => {
    const rows = [
      row('b', {}, { position: 'a1' }),
      row('a', {}, { position: 'a1' }),
      row('c', {}, { position: 'Z' }),
    ]
    expect(ids(sortRows(rows, [], cols, ctx))).toEqual(['c', 'a', 'b'])
  })
  it('does not mutate its input', () => {
    const rows = [row('b'), row('a')]
    sortRows(rows, [], cols, ctx)
    expect(ids(rows)).toEqual(['b', 'a'])
  })
  it('TITLE / TEXT / URL with the Thai numeric collator', () => {
    const rows = [
      row('1', {}, { title: 'item 10' }),
      row('2', {}, { title: 'item 2' }),
      row('3', {}, { title: '' }),
    ]
    expect(ids(sortRows(rows, [asc(title)], cols, ctx))).toEqual(['2', '1', '3'])
    expect(ids(sortRows(rows, [desc(title)], cols, ctx))).toEqual(['1', '2', '3'])
    const t = [row('x', { [text.id]: 'ข' }), row('y', { [text.id]: 'ก' })]
    expect(ids(sortRows(t, [asc(text)], cols, ctx))).toEqual(['y', 'x'])
    const u = [row('x', { [url.id]: 'https://b' }), row('y', { [url.id]: 'https://a' })]
    expect(ids(sortRows(u, [asc(url)], cols, ctx))).toEqual(['y', 'x'])
  })
  it('NUMBER by decimal value; empties last in both directions', () => {
    const rows = [
      row('a', { [num.id]: '10' }),
      row('b', { [num.id]: '9.5' }),
      row('e'),
      row('c', { [num.id]: '-100' }),
      row('f', { [num.id]: 'bad' }),
    ]
    expect(ids(sortRows(rows, [asc(num)], cols, ctx))).toEqual(['c', 'b', 'a', 'e', 'f'])
    expect(ids(sortRows(rows, [desc(num)], cols, ctx))).toEqual(['a', 'b', 'c', 'e', 'f'])
  })
  it('DATE by ISO date', () => {
    const rows = [row('a', { [date.id]: '2026-12-01' }), row('b', { [date.id]: '2026-02-01' }), row('c')]
    expect(ids(sortRows(rows, [asc(date)], cols, ctx))).toEqual(['b', 'a', 'c'])
    expect(ids(sortRows(rows, [desc(date)], cols, ctx))).toEqual(['a', 'b', 'c'])
  })
  it('SELECT by option order; deleted options are empty', () => {
    const rows = [
      row('done', { [sel.id]: OPT_DONE.id }),
      row('gone', { [sel.id]: 'o-gone' }),
      row('todo', { [sel.id]: OPT_TODO.id }),
      row('doing', { [sel.id]: OPT_DOING.id }),
    ]
    expect(ids(sortRows(rows, [asc(sel)], cols, ctx))).toEqual(['todo', 'doing', 'done', 'gone'])
  })
  it('MULTI_SELECT lexicographic over option order', () => {
    const rows = [
      row('a', { [multi.id]: [OPT_DOING.id, OPT_TODO.id] }),
      row('b', { [multi.id]: [OPT_DOING.id] }),
      row('c', { [multi.id]: [OPT_TODO.id, OPT_DONE.id] }),
      row('d', { [multi.id]: [OPT_DOING.id, OPT_DONE.id] }),
    ]
    expect(ids(sortRows(rows, [asc(multi)], cols, ctx))).toEqual(['c', 'b', 'a', 'd'])
  })
  it('CHECKBOX: unticked < ticked, unticked is not empty', () => {
    const rows = [row('t', { [check.id]: true }), row('u')]
    expect(ids(sortRows(rows, [asc(check)], cols, ctx))).toEqual(['u', 't'])
    expect(ids(sortRows(rows, [desc(check)], cols, ctx))).toEqual(['t', 'u'])
  })
  it('PERSON by full names of the first person, then the next', () => {
    // names: Cindy = ซินดี้…, Ivy = ไอวี่…, Mint = มินท์… → collator order ซินดี้ < มินท์ < ไอวี่
    const rows = [
      row('ivy', { [person.id]: [IVY] }),
      row('mixice', { [person.id]: [MINT, IVY] }),
      row('mint', { [person.id]: [MINT] }),
      row('cindy', { [person.id]: [CINDY] }),
    ]
    expect(ids(sortRows(rows, [asc(person)], cols, ctx))).toEqual(['cindy', 'mint', 'mixice', 'ivy'])
    // An id missing from the people map sorts by the id itself (deterministic).
    const unknown = [row('z', { [person.id]: ['u-b'] }), row('y', { [person.id]: ['u-a'] })]
    expect(ids(sortRows(unknown, [asc(person)], cols, ctx))).toEqual(['y', 'z'])
  })
  it('several sorts, then position, then id', () => {
    const rows = [
      row('a', { [sel.id]: OPT_DOING.id, [num.id]: '1' }, { position: 'a2' }),
      row('b', { [sel.id]: OPT_DOING.id, [num.id]: '5' }, { position: 'a1' }),
      row('c', { [sel.id]: OPT_TODO.id }, { position: 'a3' }),
      row('d', { [sel.id]: OPT_DOING.id, [num.id]: '5' }, { position: 'a0' }),
    ]
    expect(ids(sortRows(rows, [asc(sel), desc(num)], cols, ctx))).toEqual(['c', 'd', 'b', 'a'])
  })
  it('sorts on missing columns are suspended', () => {
    const rows = [row('b', {}, { position: 'a1' }), row('a', {}, { position: 'a2' })]
    expect(ids(sortRows(rows, [{ columnId: 'gone', dir: 'DESC' }], cols, ctx))).toEqual(['b', 'a'])
  })
  it('compareRows agrees with sortRows and uses a given collator', () => {
    const a = row('a', { [text.id]: 'x' })
    const b = row('b', { [text.id]: 'y' })
    expect(compareRows(a, b, [asc(text)], cols, ctx)).toBeLessThan(0)
    expect(compareRows(a, b, [desc(text)], cols, { ...ctx, collator: makeCollator() })).toBeGreaterThan(0)
    expect(compareRows(a, a, [asc(text)], cols, ctx)).toBe(0)
  })

  const rowArb = fc
    .record({
      id: fc.uuid(),
      position: fc.constantFrom('a0', 'a1', 'a2'),
      title: fc.constantFrom('', 'ก', 'ข', 'a 2', 'a 10'),
      n: fc.option(fc.constantFrom('-1', '0', '2.5', '10'), { nil: undefined }),
      d: fc.option(fc.constantFrom('2026-01-01', '2026-06-01'), { nil: undefined }),
      s: fc.option(fc.constantFrom(OPT_TODO.id, OPT_DONE.id, 'o-gone'), { nil: undefined }),
      c: fc.boolean(),
      p: fc.option(fc.subarray([CINDY, IVY, MINT]), { nil: undefined }),
    })
    .map((r): DbRowModel => ({
      id: r.id,
      title: r.title,
      position: r.position,
      cells: { [num.id]: r.n, [date.id]: r.d, [sel.id]: r.s, [check.id]: r.c || undefined, [person.id]: r.p },
    }))
  const sortArb = fc.array(
    fc.record({
      columnId: fc.constantFrom(title.id, num.id, date.id, sel.id, check.id, person.id),
      dir: fc.constantFrom<'ASC' | 'DESC'>('ASC', 'DESC'),
    }),
    { maxLength: 3 },
  )

  it('property: total order (antisymmetric, transitive), deterministic, empties last', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(rowArb, { selector: (r) => r.id, maxLength: 25 }),
        sortArb,
        (rows, sorts) => {
          const out = sortRows(rows, sorts, cols, ctx)
          expect(ids(sortRows([...rows].reverse(), sorts, cols, ctx))).toEqual(ids(out))
          for (let i = 1; i < out.length; i++)
            expect(compareRows(out[i - 1]!, out[i]!, sorts, cols, ctx)).toBeLessThan(0)
          for (const a of rows)
            for (const b of rows) {
              expect(
                Math.sign(compareRows(a, b, sorts, cols, ctx)) ===
                  -Math.sign(compareRows(b, a, sorts, cols, ctx)),
              ).toBe(true)
            }
          const first = sorts[0]
          if (first && first.columnId === num.id) {
            const empty = out.map((r) => r.cells[num.id] === undefined)
            expect(empty.indexOf(true) === -1 || empty.slice(empty.indexOf(true)).every(Boolean)).toBe(true)
          }
        },
      ),
    )
  })
})
