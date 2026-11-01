import { describe, expect, it } from 'vitest'
import { fakeGrid } from './grid.test.helper'
import { cellsOf } from './selection'
import { copyValues, parseTsv, serializeTsv } from './tsv'

describe('parseTsv (M6-D28)', () => {
  it('parses an Excel 2×2 block with CRLF and drops the trailing newline', () => {
    expect(parseTsv('0.5\t1\r\n0.75\t0.25\r\n')).toEqual([
      ['0.5', '1'],
      ['0.75', '0.25'],
    ])
  })
  it('handles LF, quoted cells, escaped quotes and embedded tabs', () => {
    expect(parseTsv('"1,5"\t2\n3\t"a""b"\n')).toEqual([
      ['1,5', '2'],
      ['3', 'a"b'],
    ])
    expect(parseTsv('"x\ty"\t1')).toEqual([['x\ty', '1']])
  })
  it('keeps empty cells and returns [] for empty text', () => {
    expect(parseTsv('1\t\t3')).toEqual([['1', '', '3']])
    expect(parseTsv('')).toEqual([])
    expect(parseTsv('\r\n')).toEqual([])
  })
})

describe('serializeTsv / copyValues', () => {
  it('joins rows with CRLF and no trailing newline', () => {
    expect(
      serializeTsv([
        ['1', '2'],
        ['3', ''],
      ]),
    ).toBe('1\t2\r\n3\t')
  })
  it('copies exact values in the current unit (G4)', () => {
    const g = fakeGrid([
      { id: 'cindy', values: [250, 500, 375, 125] },
      { id: 'ivy', values: [500, 250, 125, 375] },
    ])
    const targets = cellsOf({ r0: 0, c0: 0, r1: 1, c1: 3 }, g.at)
    expect(serializeTsv(copyValues(targets, 'DAYS'))).toBe('2.50\t5.00\t3.75\t1.25\r\n5.00\t2.50\t1.25\t3.75')
    expect(copyValues(targets, 'FRACTION')[0]).toEqual(['0.50', '1.00', '0.75', '0.25'])
  })
  it('empty cells copy as empty and cap-0 cells copy as days', () => {
    const g = fakeGrid([{ id: 'cindy', values: [0, 375], capCd: 0 }])
    expect(copyValues(cellsOf({ r0: 0, c0: 0, r1: 0, c1: 1 }, g.at), 'FRACTION')).toEqual([['', '3.75']])
  })
})
