// plan/m09 §5.S1.3 — workload cell text (M9-D6), 2-decimal numbers, aria status suffix (M9-D7).
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { compactDays, statusSuffix, twoDecimals, workloadCellText } from './format'

describe('compactDays', () => {
  it.each<[number, string]>([
    [500, '5'],
    [375, '3.8'],
    [250, '2.5'],
    [35, '0.4'],
    [0, '0'],
    [1000, '10'],
    [125, '1.3'],
    [4, '0'],
    [5, '0.1'],
  ])('%i → %s', (cd, text) => {
    expect(compactDays(cd)).toBe(text)
  })
})

describe('workloadCellText', () => {
  it.each<[number, number, string]>([
    [500, 400, '5/4'],
    [375, 500, '3.8/5'],
    [250, 400, '2.5/4'],
    [0, 500, '–'],
    [50, 0, '0.5/0'],
    [125, 500, '1.3/5'],
  ])('(%i, %i) → %s', (load, cap, text) => {
    expect(workloadCellText(load, cap)).toBe(text)
  })
  it('the empty text is th.workload.cell.empty', () => {
    expect(workloadCellText(0, 0)).toBe(th.workload.cell.empty)
  })
})

describe('twoDecimals', () => {
  it.each<[number, string]>([
    [0, '0.00'],
    [500, '5.00'],
    [375, '3.75'],
    [5, '0.05'],
  ])('%i → %s', (cd, text) => {
    expect(twoDecimals(cd)).toBe(text)
  })
})

describe('statusSuffix', () => {
  it('OK → empty string', () => {
    expect(statusSuffix({ level: 'OK', excess: 0, cause: null }, { deactivated: false })).toBe('')
  })
  it('OVER +2.00 CAPACITY', () => {
    expect(statusSuffix({ level: 'OVER', excess: 200, cause: 'CAPACITY' }, { deactivated: false })).toBe(
      th.overload.weekStatus(th.overload.level.OVER, th.overload.excess('2.00'), th.overload.cause.CAPACITY),
    )
  })
  it('RISK +0.50 WORKLOAD', () => {
    expect(statusSuffix({ level: 'RISK', excess: 50, cause: 'WORKLOAD' }, { deactivated: false })).toBe(
      th.overload.weekStatus(th.overload.level.RISK, th.overload.excess('0.50'), th.overload.cause.WORKLOAD),
    )
  })
  it('deactivated week shows the DEACTIVATED label instead of the cause (M9-D7)', () => {
    expect(statusSuffix({ level: 'OVER', excess: 250, cause: 'CAPACITY' }, { deactivated: true })).toBe(
      th.overload.weekStatus(th.overload.level.OVER, th.overload.excess('2.50'), th.overload.cause.DEACTIVATED),
    )
  })
})
