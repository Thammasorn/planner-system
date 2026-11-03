import { describe, expect, it } from 'vitest'
import {
  EMPTY_ROW_KEYS,
  inCheckMode,
  isRowSelected,
  rangeRows,
  selectedRowKeys,
  selectedTaskIds,
  selectOne,
  toggleRow,
  type RowSelectState,
} from './row-select'
import type { RowKey } from './rows'

const row = (key: RowKey, kind: string, task: string) => ({ key, kind, task: { id: task } })
const ROWS = [
  row('t:a', 'task', 'a'),
  row('a:a1', 'assignee', 'a'),
  row('a:a2', 'assignee', 'a'),
  row('a:b', 'merged', 'b'),
  row('t:c', 'sum', 'c'),
  row('t:d', 'task', 'd'),
]
const none: RowSelectState = { rowSelection: null, rowKeys: EMPTY_ROW_KEYS, rowAnchor: null }

describe('row multi-select', () => {
  it('plain selection is one row', () => {
    const s = selectOne('t:a')
    expect(selectedRowKeys(s)).toEqual(['t:a'])
    expect(isRowSelected(s, 't:a')).toBe(true)
    expect(isRowSelected(s, 'a:b')).toBe(false)
    expect(selectedRowKeys(none)).toEqual([])
  })

  it('Mod+click toggles task rows in and out; the focus moves to the last remaining', () => {
    let s = toggleRow(selectOne('t:a'), ROWS[3]!)
    expect(selectedRowKeys(s)).toEqual(['t:a', 'a:b'])
    expect(s.rowSelection).toBe('a:b')
    s = toggleRow(s, ROWS[3]!)
    expect(selectedRowKeys(s)).toEqual(['t:a'])
    expect(s.rowSelection).toBe('t:a')
    s = toggleRow(s, ROWS[0]!)
    expect(s.rowSelection).toBeNull()
    expect(selectedRowKeys(s)).toEqual([])
  })

  it('Mod+click on an assignee row is a plain selection of it', () => {
    const s = toggleRow(selectOne('t:a'), ROWS[1]!)
    expect(selectedRowKeys(s)).toEqual(['a:a1'])
  })

  it('Shift+click selects the task rows between the anchor and the row, skipping assignee rows', () => {
    const s = rangeRows(selectOne('t:a'), ROWS, ROWS[4]!)
    expect(selectedRowKeys(s)).toEqual(['t:a', 'a:b', 't:c'])
    expect(s.rowAnchor).toBe('t:a')
    // the anchor stays: a second Shift+click re-ranges from it
    const back = rangeRows(s, ROWS, ROWS[3]!)
    expect(selectedRowKeys(back)).toEqual(['t:a', 'a:b'])
    // upwards
    expect(selectedRowKeys(rangeRows(selectOne('t:d'), ROWS, ROWS[3]!))).toEqual(['a:b', 't:c', 't:d'])
    // no anchor → plain
    expect(selectedRowKeys(rangeRows(none, ROWS, ROWS[5]!))).toEqual(['t:d'])
  })

  it('stale keys do not resurrect: a focused row outside them is a single selection', () => {
    const s: RowSelectState = { rowSelection: 't:d', rowKeys: new Set<RowKey>(['t:a', 'a:b']), rowAnchor: 't:a' }
    expect(selectedRowKeys(s)).toEqual(['t:d'])
    expect(isRowSelected(s, 't:a')).toBe(false)
  })

  it('selectedTaskIds: distinct task ids of task rows in view order', () => {
    const s = rangeRows(selectOne('t:d'), ROWS, ROWS[0]!)
    expect(selectedTaskIds(s, ROWS)).toEqual(['a', 'b', 'c', 'd'])
    expect(selectedTaskIds(selectOne('a:a1'), ROWS)).toEqual([])
  })

  it('check mode (v3.9): ☐ / Mod / Shift selections, not a plain click; ends with the last unchecked row', () => {
    expect(inCheckMode(selectOne('t:a'))).toBe(false)
    expect(inCheckMode(none)).toBe(false)
    let s = toggleRow(none, ROWS[0]!)
    expect(selectedRowKeys(s)).toEqual(['t:a'])
    expect(inCheckMode(s)).toBe(true)
    expect(inCheckMode(rangeRows(selectOne('t:a'), ROWS, ROWS[3]!))).toBe(true)
    s = toggleRow(s, ROWS[0]!)
    expect(inCheckMode(s)).toBe(false)
    expect(inCheckMode(selectOne('t:d'))).toBe(false)
  })
})
