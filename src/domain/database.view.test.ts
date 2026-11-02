// View helpers and applyView (plan/m11 S1.6). Calendar month (BR-97) lives in database.calendar.test.ts.
import { describe, expect, it } from 'vitest'
import { applyView, defaultColumnName, liveConfig, visibleColumns } from './database'
import { OPT_DOING, OPT_DONE, ctx, col, row } from './database/fixtures.test.helper'

const title = col('TITLE', { position: 'a5' })
const date = col('DATE', { position: 'a1' })
const sel = col('SELECT', { position: 'a2' })
const num = col('NUMBER', { position: 'a3' })
const text = col('TEXT', { position: 'a3' })
const check = col('CHECKBOX', { position: 'a4' })
const cols = [title, date, sel, num, text, check]

describe('defaultColumnName (FR-1411)', () => {
  it.each([
    [[], 'ข้อความ'],
    [['ชื่อ', 'สถานะ'], 'ข้อความ'],
    [['ข้อความ'], 'ข้อความ 2'],
    [[' ข้อความ ', 'ข้อความ 2'], 'ข้อความ 3'],
    [['ข้อความ', 'ข้อความ 3'], 'ข้อความ 2'],
  ])('%j → %j', (existing, out) => expect(defaultColumnName('ข้อความ', existing)).toBe(out))
})

describe('visibleColumns (FR-1413, FR-1420, FR-1428)', () => {
  it('TABLE: TITLE pinned first, then database order (position, id), hidden removed', () => {
    const out = visibleColumns(cols, { type: 'TABLE', config: { hiddenColumnIds: [check.id, title.id] } })
    const expectedTie = [num, text].sort((a, b) => (a.id < b.id ? -1 : 1)).map((c) => c.id)
    expect(out.map((c) => c.id)).toEqual([title.id, date.id, sel.id, ...expectedTie])
  })
  it('no hidden list = every column; equal positions order by id', () => {
    const a = col('TEXT', { id: 'b-col', position: 'p' })
    const b = col('TEXT', { id: 'a-col', position: 'p' })
    const c = col('TEXT', { id: 'c-col', position: 'p' })
    expect(visibleColumns([a, c, b, a], { type: 'CALENDAR', config: {} }).map((x) => x.id)).toEqual([
      'a-col',
      'b-col',
      'b-col',
      'c-col',
    ])
  })
  it('KANBAN / CALENDAR: database order, TITLE where it sits, never hidden', () => {
    const out = visibleColumns(cols, { type: 'KANBAN', config: { hiddenColumnIds: [title.id] } })
    expect(out.map((c) => c.id).at(-1)).toBe(title.id)
    expect(out).toHaveLength(cols.length)
  })
})

describe('liveConfig (FR-1415 suspended references)', () => {
  it('drops references to missing columns and wrong column types', () => {
    const out = liveConfig(
      {
        hiddenColumnIds: [check.id, 'gone'],
        columnWidths: { [title.id]: 200, gone: 100 },
        sorts: [
          { columnId: 'gone', dir: 'ASC' },
          { columnId: num.id, dir: 'DESC' },
        ],
        filters: [
          { columnId: 'gone', op: 'checked' },
          { columnId: check.id, op: 'checked' },
        ],
        groupByColumnId: 'gone',
        hideEmptyGroups: true,
        dateColumnId: sel.id,
        cardColumnIds: ['gone', sel.id],
      },
      cols,
    )
    expect(out).toEqual({
      hiddenColumnIds: [check.id],
      columnWidths: { [title.id]: 200 },
      sorts: [{ columnId: num.id, dir: 'DESC' }],
      filters: [{ columnId: check.id, op: 'checked' }],
      hideEmptyGroups: true,
      cardColumnIds: [sel.id],
    })
  })
  it('keeps valid group and date columns; empty config stays empty', () => {
    expect(liveConfig({ groupByColumnId: sel.id, dateColumnId: date.id }, cols)).toEqual({
      groupByColumnId: sel.id,
      dateColumnId: date.id,
    })
    expect(liveConfig({}, cols)).toEqual({})
  })
})

describe('applyView = filter ∘ sort (AC-1403)', () => {
  it('number DESC + "status is doing" + "checkbox unticked" → 2 of 5, empties last', () => {
    const rows = [
      row('1', { [sel.id]: OPT_DOING.id, [num.id]: '5' }),
      row('2', { [sel.id]: OPT_DOING.id, [check.id]: true, [num.id]: '9' }),
      row('3', { [sel.id]: OPT_DONE.id, [num.id]: '7' }),
      row('4', { [sel.id]: OPT_DOING.id }),
      row('5'),
    ]
    const out = applyView(
      rows,
      {
        config: {
          sorts: [{ columnId: num.id, dir: 'DESC' }],
          filters: [
            { columnId: sel.id, op: 'isAnyOf', value: [OPT_DOING.id] },
            { columnId: check.id, op: 'unchecked' },
          ],
        },
      },
      cols,
      ctx,
    )
    expect(out.map((r) => r.id)).toEqual(['1', '4'])
  })
  it('an empty config keeps every row in position order', () => {
    const rows = [row('b', {}, { position: 'a2' }), row('a', {}, { position: 'a1' })]
    expect(applyView(rows, { config: {} }, cols, ctx).map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('suspended sorts / filters are ignored', () => {
    const rows = [row('b', {}, { position: 'a1' }), row('a', {}, { position: 'a2' })]
    const out = applyView(
      rows,
      {
        config: {
          sorts: [{ columnId: 'gone', dir: 'DESC' }],
          filters: [{ columnId: 'gone', op: 'checked' }],
        },
      },
      cols,
      ctx,
    )
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
  })
})
