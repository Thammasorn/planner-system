import { describe, expect, it } from 'vitest'
import { parseRowParam, rowPageHref, rowParamHref } from './row-param'

describe('row-param (FR-1452, M11-D26)', () => {
  it('parses db + row', () => {
    expect(parseRowParam('?db=d1&row=r1')).toEqual({ db: 'd1', row: 'r1' })
  })
  it('db alone scrolls to the block (row null)', () => {
    expect(parseRowParam('?db=d1')).toEqual({ db: 'd1', row: null })
  })
  it('row without db is ignored', () => {
    expect(parseRowParam('?row=r1')).toEqual({ db: null, row: null })
    expect(parseRowParam('')).toEqual({ db: null, row: null })
  })
  it('keeps other params and replaces db/row', () => {
    expect(rowParamHref('/p/abc?x=1&row=old', 'd1', 'r2')).toBe('/p/abc?x=1&row=r2&db=d1')
    expect(rowParamHref('/t/t1', 'd1', null)).toBe('/t/t1?db=d1')
  })
  it('row page href', () => {
    expect(rowPageHref('r9')).toBe('/r/r9')
  })
})
