import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseResponse, DbRowDTO } from '@/lib/contracts/databases'
import {
  dbIdMap,
  insertByPosition,
  mergeCells,
  placeAfter,
  previousId,
  reconcileRow,
  remapOptionInCells,
  resolveCells,
  sameDbId,
} from './optimistic'

const row = (id: string, position: string, cells: DbRowDTO['cells'] = {}): DbRowDTO => ({
  id,
  title: id,
  cells,
  position,
  version: 1,
  hasBody: false,
  createdBy: 'u',
  createdAt: 'x',
  updatedBy: 'u',
  updatedAt: 'x',
})
const db = (rows: DbRowDTO[]): DatabaseResponse => ({
  id: 'd',
  pageId: 'p',
  title: '',
  version: 1,
  canEdit: true,
  columns: [],
  views: [],
  rows,
  people: {},
})

afterEach(() => dbIdMap.clear())

describe('optimistic database patches (M11-D20)', () => {
  it('placeAfter: null = first, undefined = last, provisional positions keep the order', () => {
    const list = [row('a', 'a0'), row('b', 'a1')]
    const first = placeAfter(list, row('n', ''), null)
    expect(first.map((r) => r.id)).toEqual(['n', 'a', 'b'])
    expect(first[0]!.position < 'a0').toBe(true)
    expect(placeAfter(list, row('n', ''), undefined).map((r) => r.id)).toEqual(['a', 'b', 'n'])
    const mid = placeAfter(list, row('n', ''), 'a')
    expect(mid.map((r) => r.id)).toEqual(['a', 'n', 'b'])
    expect(mid[1]!.position > 'a0' && mid[1]!.position < 'a1').toBe(true)
    // a move keeps one copy
    expect(placeAfter(list, list[0]!, 'b').map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('insertByPosition puts deleted rows back in place', () => {
    const list = [row('a', 'a0'), row('c', 'a2')]
    expect(insertByPosition(list, [row('b', 'a1')]).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(previousId(list, 'c')).toBe('a')
    expect(previousId(list, 'a')).toBeNull()
  })

  it('mergeCells: null clears, others set', () => {
    expect(mergeCells({ a: 'x', b: true }, { a: null, c: ['1'] })).toEqual({ b: true, c: ['1'] })
  })

  it('reconcileRow keeps other optimistic cells and takes the sent keys from the server', () => {
    const d = db([row('r', 'a0', { a: 'mine', b: 'queued' })])
    const server = { ...row('r', 'a0', { a: 'trimmed' }), version: 2 }
    const out = reconcileRow(d, server, { cells: { a: ' trimmed ' } })
    expect(out.rows[0]!.cells).toEqual({ a: 'trimmed', b: 'queued' })
    expect(out.rows[0]!.version).toBe(2)
  })

  it('temp ids resolve after the create answered', () => {
    dbIdMap.set('tmp_1', 'real')
    expect(sameDbId('tmp_1', 'real')).toBe(true)
    expect(resolveCells({ tmp_1: 'tmp_1', c: ['tmp_1', 'x'], d: true })).toEqual({
      real: 'real',
      c: ['real', 'x'],
      d: true,
    })
    const d = db([row('r', 'a0', { col: 'tmp_1' }), row('s', 'a1', { col: ['tmp_1', 'o'] })])
    const out = remapOptionInCells(d, 'col', 'tmp_1', 'real')
    expect(out.rows.map((r) => r.cells.col)).toEqual(['real', ['real', 'o']])
  })
})
