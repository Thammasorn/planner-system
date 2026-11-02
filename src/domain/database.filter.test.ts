// BR-95 filters, M11-D23 operators and new-row inheritance (plan/m11 S1.9).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ME_TOKEN, filterOpsFor, isFilterComplete, matchesFilters, valuesFromFilters } from './database'
import type { FilterOp, ViewFilter } from './types'
import {
  CINDY,
  IVY,
  MINT,
  OLD,
  OPT_DOING,
  OPT_DONE,
  OPT_TODO,
  TODAY,
  ctx,
  col,
  row,
} from './database/fixtures.test.helper'

const title = col('TITLE')
const text = col('TEXT')
const url = col('URL')
const num = col('NUMBER')
const sel = col('SELECT')
const multi = col('MULTI_SELECT')
const date = col('DATE')
const check = col('CHECKBOX')
const person = col('PERSON')
const cols = [title, text, url, num, sel, multi, date, check, person]

const f = (c: { id: string }, op: FilterOp, value?: ViewFilter['value']): ViewFilter =>
  value === undefined ? { columnId: c.id, op } : { columnId: c.id, op, value }
const m = (cells: Record<string, unknown>, filters: ViewFilter[], title = 'r') =>
  matchesFilters(row('r', cells, { title }), filters, cols, ctx)

describe('filterOpsFor (M11-D23)', () => {
  it.each([
    ['TITLE', ['contains', 'notContains', 'equals', 'isEmpty', 'isNotEmpty']],
    ['TEXT', ['contains', 'notContains', 'equals', 'isEmpty', 'isNotEmpty']],
    ['URL', ['contains', 'notContains', 'equals', 'isEmpty', 'isNotEmpty']],
    ['NUMBER', ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty']],
    ['SELECT', ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty']],
    ['MULTI_SELECT', ['hasAnyOf', 'hasAllOf', 'hasNoneOf', 'isEmpty', 'isNotEmpty']],
    ['DATE', ['is', 'before', 'after', 'onOrAfter', 'onOrBefore', 'isEmpty', 'isNotEmpty']],
    ['CHECKBOX', ['checked', 'unchecked']],
    ['PERSON', ['hasAny', 'hasNone', 'isEmpty', 'isNotEmpty']],
  ] as const)('%s → %j', (type, ops) => expect(filterOpsFor(type)).toEqual(ops))
})

describe('isFilterComplete', () => {
  it.each([
    [f(text, 'contains', 'a'), text, true],
    [f(text, 'contains', '  '), text, false],
    [f(text, 'contains'), text, false],
    [f(text, 'contains', ['a']), text, false],
    [f(text, 'isEmpty'), text, true],
    [f(text, 'eq', '1'), text, false],
    [f(num, 'gt', '1,000'), num, true],
    [f(num, 'gt', 'abc'), num, false],
    [f(num, 'gt', ''), num, false],
    [f(sel, 'isAnyOf', [OPT_DONE.id]), sel, true],
    [f(sel, 'isAnyOf', []), sel, false],
    [f(sel, 'isAnyOf', ['o-gone']), sel, false],
    [f(sel, 'isAnyOf', 'x'), sel, false],
    [f(multi, 'hasAllOf', [OPT_DONE.id, 'o-gone']), multi, true],
    [f(date, 'is', { kind: 'today' }), date, true],
    [f(date, 'is', { kind: 'date', date: '2026-11-05' }), date, true],
    [f(date, 'is', { kind: 'date', date: '2026-02-30' }), date, false],
    [f(date, 'is', '2026-11-05'), date, false],
    [f(date, 'is', ['x']), date, false],
    [{ columnId: date.id, op: 'is', value: null as never }, date, false],
    [f(check, 'checked'), check, true],
    [f(person, 'hasAny', [ME_TOKEN]), person, true],
    [f(person, 'hasAny', []), person, false],
  ] as const)('%j → %s', (filter, c, out) => expect(isFilterComplete(filter, c)).toBe(out))
})

describe('matchesFilters (BR-95)', () => {
  it('no filters = every row', () => expect(m({}, [])).toBe(true))
  it('text ops: case-insensitive, trimmed; negative ops pass empties', () => {
    const v = { [text.id]: '  Hello World ' }
    expect(m(v, [f(text, 'contains', 'WORLD')])).toBe(true)
    expect(m(v, [f(text, 'contains', 'xyz')])).toBe(false)
    expect(m({}, [f(text, 'contains', 'a')])).toBe(false)
    expect(m(v, [f(text, 'notContains', 'world ')])).toBe(false)
    expect(m({}, [f(text, 'notContains', 'a')])).toBe(true)
    expect(m(v, [f(text, 'equals', ' hello world')])).toBe(true)
    expect(m(v, [f(text, 'equals', 'hello')])).toBe(false)
    expect(m({}, [f(text, 'equals', 'hello')])).toBe(false)
    expect(m({}, [f(text, 'isEmpty')])).toBe(true)
    expect(m(v, [f(text, 'isEmpty')])).toBe(false)
    expect(m(v, [f(text, 'isNotEmpty')])).toBe(true)
  })
  it('title and url use the text ops', () => {
    expect(m({}, [f(title, 'contains', 'ลูกค้า')], 'ลูกค้าส่ง spec ช้า')).toBe(true)
    expect(m({}, [f(title, 'isEmpty')], '  ')).toBe(true)
    expect(m({ [url.id]: 'https://a.co' }, [f(url, 'contains', 'A.CO')])).toBe(true)
  })
  it.each([
    ['eq', '5', true],
    ['eq', '5.0', true],
    ['eq', '6', false],
    ['neq', '6', true],
    ['neq', '5', false],
    ['gt', '4.99', true],
    ['gt', '5', false],
    ['gte', '5', true],
    ['lt', '5', false],
    ['lt', '1,000', true],
    ['lte', '5', true],
  ] as const)('number %s %j on 5 → %s', (op, value, out) => {
    expect(m({ [num.id]: '5' }, [f(num, op, value)])).toBe(out)
  })
  it('number: empties fail comparisons, pass ≠ (negative op)', () => {
    for (const op of ['eq', 'gt', 'gte', 'lt', 'lte'] as const) expect(m({}, [f(num, op, '0')])).toBe(false)
    expect(m({}, [f(num, 'neq', '0')])).toBe(true)
    expect(m({}, [f(num, 'isEmpty')])).toBe(true)
    expect(m({ [num.id]: '0' }, [f(num, 'isNotEmpty')])).toBe(true)
  })
  it('select: any of / none of; deleted option values are empty', () => {
    const doing = { [sel.id]: OPT_DOING.id }
    expect(m(doing, [f(sel, 'isAnyOf', [OPT_DOING.id, OPT_DONE.id])])).toBe(true)
    expect(m(doing, [f(sel, 'isAnyOf', [OPT_DONE.id])])).toBe(false)
    expect(m(doing, [f(sel, 'isNoneOf', [OPT_DOING.id])])).toBe(false)
    expect(m({}, [f(sel, 'isNoneOf', [OPT_DOING.id])])).toBe(true)
    expect(m({}, [f(sel, 'isAnyOf', [OPT_DOING.id])])).toBe(false)
    expect(m({ [sel.id]: 'o-gone' }, [f(sel, 'isEmpty')])).toBe(true)
    expect(m(doing, [f(sel, 'isNotEmpty')])).toBe(true)
  })
  it('multi: has any / all / none', () => {
    const v = { [multi.id]: [OPT_TODO.id, OPT_DONE.id] }
    expect(m(v, [f(multi, 'hasAnyOf', [OPT_DONE.id, OPT_DOING.id])])).toBe(true)
    expect(m(v, [f(multi, 'hasAnyOf', [OPT_DOING.id])])).toBe(false)
    expect(m({}, [f(multi, 'hasAnyOf', [OPT_DOING.id])])).toBe(false)
    expect(m(v, [f(multi, 'hasAllOf', [OPT_DONE.id, OPT_TODO.id])])).toBe(true)
    expect(m(v, [f(multi, 'hasAllOf', [OPT_DONE.id, OPT_DOING.id])])).toBe(false)
    expect(m({}, [f(multi, 'hasAllOf', [OPT_DONE.id])])).toBe(false)
    expect(m(v, [f(multi, 'hasNoneOf', [OPT_DOING.id])])).toBe(true)
    expect(m(v, [f(multi, 'hasNoneOf', [OPT_DONE.id])])).toBe(false)
    expect(m({}, [f(multi, 'hasNoneOf', [OPT_DONE.id])])).toBe(true)
  })
  it.each([
    ['is', { kind: 'date', date: '2026-11-05' }, true],
    ['is', { kind: 'today' }, false],
    ['before', { kind: 'date', date: '2026-11-06' }, true],
    ['before', { kind: 'date', date: '2026-11-05' }, false],
    ['after', { kind: 'today' }, true],
    ['after', { kind: 'date', date: '2026-11-05' }, false],
    ['onOrAfter', { kind: 'date', date: '2026-11-05' }, true],
    ['onOrBefore', { kind: 'date', date: '2026-11-04' }, false],
    ['onOrBefore', { kind: 'date', date: '2026-11-05' }, true],
  ] as const)('date %s %j on 2026-11-05 → %s', (op, value, out) => {
    expect(m({ [date.id]: '2026-11-05' }, [f(date, op, value)])).toBe(out)
  })
  it('date "today" uses ctx.today; empties fail', () => {
    expect(m({ [date.id]: TODAY }, [f(date, 'is', { kind: 'today' })])).toBe(true)
    expect(m({}, [f(date, 'onOrBefore', { kind: 'today' })])).toBe(false)
    expect(m({}, [f(date, 'isEmpty')])).toBe(true)
  })
  it('checkbox: checked / unchecked', () => {
    expect(m({ [check.id]: true }, [f(check, 'checked')])).toBe(true)
    expect(m({}, [f(check, 'checked')])).toBe(false)
    expect(m({}, [f(check, 'unchecked')])).toBe(true)
    expect(m({ [check.id]: true }, [f(check, 'unchecked')])).toBe(false)
  })
  it('person: has any (with "@me" = viewer) / has none; inactive people count', () => {
    const v = { [person.id]: [CINDY, OLD] }
    expect(m(v, [f(person, 'hasAny', [IVY, CINDY])])).toBe(true)
    expect(m(v, [f(person, 'hasAny', [ME_TOKEN])])).toBe(false)
    expect(m({ [person.id]: [MINT] }, [f(person, 'hasAny', [ME_TOKEN])])).toBe(true)
    expect(m(v, [f(person, 'hasAny', [OLD])])).toBe(true)
    expect(m({}, [f(person, 'hasAny', [CINDY])])).toBe(false)
    expect(m(v, [f(person, 'hasNone', [IVY])])).toBe(true)
    expect(m(v, [f(person, 'hasNone', [CINDY])])).toBe(false)
    expect(m({}, [f(person, 'hasNone', [CINDY])])).toBe(true)
    expect(m({}, [f(person, 'isEmpty')])).toBe(true)
  })
  it('AND of every filter; incomplete and missing-column filters are skipped', () => {
    const v = { [sel.id]: OPT_DOING.id }
    expect(m(v, [f(sel, 'isAnyOf', [OPT_DOING.id]), f(check, 'unchecked')])).toBe(true)
    expect(m(v, [f(sel, 'isAnyOf', [OPT_DOING.id]), f(check, 'checked')])).toBe(false)
    expect(
      m(v, [f(text, 'contains', ''), { columnId: 'gone', op: 'checked' }, f(sel, 'isEmpty', undefined)]),
    ).toBe(false)
    expect(m(v, [f(text, 'contains', ''), { columnId: 'gone', op: 'checked' }])).toBe(true)
    expect(m(v, [f(sel, 'isAnyOf', ['o-gone'])])).toBe(true)
    expect(m(v, [f(sel, 'gt', '1')])).toBe(true)
  })
  it('property: adding a filter never adds rows (AND is monotone)', () => {
    const rowArb = fc.record({
      s: fc.option(fc.constantFrom(OPT_TODO.id, OPT_DONE.id), { nil: undefined }),
      c: fc.option(fc.constant(true as const), { nil: undefined }),
    })
    const filterArb = fc.constantFrom(
      f(sel, 'isAnyOf', [OPT_DONE.id]),
      f(sel, 'isNoneOf', [OPT_DONE.id]),
      f(sel, 'isEmpty'),
      f(check, 'checked'),
      f(check, 'unchecked'),
    )
    fc.assert(
      fc.property(rowArb, fc.array(filterArb, { maxLength: 4 }), filterArb, (r, fs, extra) => {
        const cells = { [sel.id]: r.s, [check.id]: r.c }
        if (m(cells, [...fs, extra])) expect(m(cells, fs)).toBe(true)
      }),
    )
  })
})

describe('valuesFromFilters (M11-D23, FR-1423)', () => {
  it('inherits equals / is / checked values so a new row stays visible', () => {
    const out = valuesFromFilters(
      [
        f(title, 'equals', '  ชื่อ '),
        f(text, 'equals', 'x'),
        f(url, 'equals', 'https://a.co'),
        f(num, 'eq', '1,500'),
        f(sel, 'isAnyOf', [OPT_DOING.id]),
        f(multi, 'hasAnyOf', [OPT_TODO.id]),
        f(multi, 'hasAllOf', [OPT_TODO.id, OPT_DONE.id]),
        f(date, 'is', { kind: 'today' }),
        f(check, 'checked'),
        f(person, 'hasAny', [ME_TOKEN, IVY, MINT]),
      ],
      cols,
      ctx,
    )
    expect(out).toEqual({
      title: 'ชื่อ',
      cells: {
        [text.id]: 'x',
        [url.id]: 'https://a.co',
        [num.id]: '1500',
        [sel.id]: OPT_DOING.id,
        [multi.id]: [OPT_TODO.id, OPT_DONE.id],
        [date.id]: TODAY,
        [check.id]: true,
        [person.id]: [MINT, IVY],
      },
    })
  })
  it('ignores non-equality ops, ambiguous selects, bad links, incomplete and missing-column filters', () => {
    const out = valuesFromFilters(
      [
        f(text, 'contains', 'x'),
        f(sel, 'isAnyOf', [OPT_DOING.id, OPT_DONE.id]),
        f(url, 'equals', 'javascript:x'),
        f(num, 'gt', '1'),
        f(date, 'is', { kind: 'date', date: '2026-11-05' }),
        f(check, 'unchecked'),
        f(person, 'hasNone', [CINDY]),
        f(title, 'equals', ''),
        { columnId: 'gone', op: 'checked' },
      ],
      cols,
      ctx,
    )
    expect(out).toEqual({ cells: { [date.id]: '2026-11-05' } })
  })
})
