// SPEC §5.6 BR-40/BR-41 (cause), X67 (excess, tone per view), BR-45 per view (M9-D6), FR-906 worsened (M9-D18) —
// plan/m09 §5.S1.1/S1.2. M7's overload.test.ts stays untouched.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  levelRank,
  loadTone,
  overloadCause,
  overloadExcess,
  overloadLevel,
  overloadStatus,
  viewTone,
  worsened,
  type OverloadCause,
  type OverloadStatus,
} from './overload'
import type { LoadView } from './types'

type Row = [string, number, number, number, number, OverloadStatus]

describe('overloadStatus (BR-40 level + X67 excess + BR-41 cause)', () => {
  it.each<Row>([
    ['F2 Jack/Mint 10-19 (golden)', 500, 500, 400, 500, { level: 'OVER', excessCd: 100, cause: 'CAPACITY' }],
    ['F3 Peter 10-05 (golden)', 500, 500, 300, 500, { level: 'OVER', excessCd: 200, cause: 'CAPACITY' }],
    ['F4 Cindy 10-12 (golden)', 250, 0, 200, 500, { level: 'RISK', excessCd: 50, cause: 'CAPACITY' }],
    ['r8 §4.8 WORKLOAD/OVER', 625, 625, 500, 500, { level: 'OVER', excessCd: 125, cause: 'WORKLOAD' }],
    ['r8 §4.8 WORKLOAD/RISK', 625, 0, 500, 500, { level: 'RISK', excessCd: 125, cause: 'WORKLOAD' }],
    ['r8 §4.8 BOTH/OVER (committed-based excess, not 225)', 625, 500, 400, 500, { level: 'OVER', excessCd: 100, cause: 'BOTH' }],
    ['r8 §4.8 BOTH/RISK', 550, 0, 200, 500, { level: 'RISK', excessCd: 350, cause: 'BOTH' }],
    ['r8 §4.8 boundary load = cap', 400, 400, 400, 500, { level: 'OK', excessCd: 0, cause: null }],
    ['r5 M9-03', 600, 600, 300, 500, { level: 'OVER', excessCd: 300, cause: 'BOTH' }],
    ['r5 M9-03 equal not over', 500, 500, 500, 500, { level: 'OK', excessCd: 0, cause: null }],
    ['r5 M9-03 non-working', 100, 100, 0, 0, { level: 'OVER', excessCd: 100, cause: 'WORKLOAD' }],
    ['r5 M9-03 full leave, no load', 0, 0, 0, 500, { level: 'OK', excessCd: 0, cause: null }],
    ['cap 0, tentative only', 50, 0, 0, 500, { level: 'RISK', excessCd: 50, cause: 'CAPACITY' }],
    ['deactivated week (X64, UI relabels M9-D7)', 250, 250, 0, 500, { level: 'OVER', excessCd: 250, cause: 'CAPACITY' }],
  ])('%s: (%i, %i | cap %i, std %i)', (_n, total, committed, cap, std, expected) => {
    expect(overloadStatus({ total, committed }, cap, std)).toEqual(expected)
  })
})

describe('overloadCause (BR-41)', () => {
  it.each<[string, number, number, number, OverloadCause]>([
    ['no lost capacity → WORKLOAD', 600, 500, 500, 'WORKLOAD'],
    ['lost, total within standard → CAPACITY', 500, 400, 500, 'CAPACITY'],
    ['lost, total = standard → CAPACITY (strict >)', 500, 300, 500, 'CAPACITY'],
    ['lost, total over standard → BOTH', 501, 300, 500, 'BOTH'],
    ['cap above standard (negative lost) → WORKLOAD', 700, 600, 500, 'WORKLOAD'],
  ])('%s', (_n, total, cap, std, cause) => {
    expect(overloadCause(total, cap, std)).toBe(cause)
  })
})

describe('overloadExcess (X67)', () => {
  it('OVER uses committed − cap', () => {
    expect(overloadExcess('OVER', { total: 625, committed: 500 }, 400)).toBe(100)
  })
  it('RISK uses total − cap', () => {
    expect(overloadExcess('RISK', { total: 625, committed: 0 }, 500)).toBe(125)
  })
  it('OK is 0', () => {
    expect(overloadExcess('OK', { total: 300, committed: 300 }, 500)).toBe(0)
  })
})

describe('levelRank', () => {
  it('OK 0, RISK 1, OVER 2', () => {
    expect([levelRank('OK'), levelRank('RISK'), levelRank('OVER')]).toEqual([0, 1, 2])
  })
})

const ok: OverloadStatus = { level: 'OK', excessCd: 0, cause: null }
const risk = (excessCd: number): OverloadStatus => ({ level: 'RISK', excessCd, cause: 'CAPACITY' })
const over = (excessCd: number): OverloadStatus => ({ level: 'OVER', excessCd, cause: 'CAPACITY' })

describe('worsened (FR-906, M9-D18)', () => {
  it.each<[string, OverloadStatus, OverloadStatus, boolean]>([
    ['OK → RISK', ok, risk(50), true],
    ['RISK → OVER', risk(50), over(50), true],
    ['OVER(+100) → OVER(+200) (F2 + Jack leave Mon 10-19)', over(100), over(200), true],
    ['OVER(+200) → OVER(+200)', over(200), over(200), false],
    ['RISK(+50) → RISK(+25)', risk(50), risk(25), false],
    ['OVER → RISK', over(100), risk(300), false],
    ['OK → OK', ok, ok, false],
  ])('%s → %s', (_n, before, after, expected) => {
    expect(worsened(before, after)).toBe(expected)
  })
})

const loadArb = fc
  .tuple(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 5000 }))
  .map(([a, b]) => ({ total: Math.max(a, b), committed: Math.min(a, b) }))
const capStdArb = fc
  .tuple(fc.integer({ min: 0, max: 700 }), fc.integer({ min: 0, max: 700 }))
  .map(([a, b]) => ({ cap: Math.min(a, b), std: Math.max(a, b) }))

describe('overloadStatus properties', () => {
  it('excess is a non-negative integer; excess > 0 ⇔ level ≠ OK; OK ⇔ cause null; non-WORKLOAD ⇒ cap < std', () => {
    fc.assert(
      fc.property(loadArb, capStdArb, (load, { cap, std }) => {
        const s = overloadStatus(load, cap, std)
        expect(Number.isInteger(s.excessCd)).toBe(true)
        expect(s.excessCd).toBeGreaterThanOrEqual(0)
        expect(s.excessCd > 0).toBe(s.level !== 'OK')
        expect(s.level === 'OK').toBe(s.cause === null)
        expect(s.level).toBe(overloadLevel(load, cap))
        if (s.cause !== null && s.cause !== 'WORKLOAD') expect(cap).toBeLessThan(std)
      }),
    )
  })
  it('worsened(s, s) is false', () => {
    fc.assert(
      fc.property(loadArb, capStdArb, (load, { cap, std }) => {
        const s = overloadStatus(load, cap, std)
        expect(worsened(s, s)).toBe(false)
      }),
    )
  })
})

describe('viewTone (BR-45 per view, X67, M9-D6)', () => {
  it('F4 Cindy {250, 0} cap 200: ALL red although RISK (r8 G7)', () => {
    expect(viewTone({ total: 250, committed: 0 }, 200, 'ALL')).toEqual({ tone: 'over', palette: 'load', loadCd: 250 })
  })
  it('F4 Cindy {250, 0} cap 200: COMMITTED empty', () => {
    expect(viewTone({ total: 250, committed: 0 }, 200, 'COMMITTED')).toEqual({ tone: 'empty', palette: 'load', loadCd: 0 })
  })
  it('F4 Cindy {250, 0} cap 200: AT_RISK light on the tentative palette', () => {
    expect(viewTone({ total: 250, committed: 0 }, 200, 'AT_RISK')).toEqual({
      tone: 'light',
      palette: 'tentative',
      loadCd: 250,
    })
  })
  it('F2 Cindy 10-19 {375, 0} cap 400: ALL full', () => {
    expect(viewTone({ total: 375, committed: 0 }, 400, 'ALL').tone).toBe('full')
  })
  it('F1 Cindy {375, 0} cap 500: ALL light', () => {
    expect(viewTone({ total: 375, committed: 0 }, 500, 'ALL').tone).toBe('light')
  })
  it('{400, 400} cap 500: full (exactly 0.8)', () => {
    expect(viewTone({ total: 400, committed: 400 }, 500, 'ALL').tone).toBe('full')
  })
  it('{399, 399} cap 500: light', () => {
    expect(viewTone({ total: 399, committed: 399 }, 500, 'ALL').tone).toBe('light')
  })
  it('cap 0 & load 0: noCapacity', () => {
    expect(viewTone({ total: 0, committed: 0 }, 0, 'ALL').tone).toBe('noCapacity')
  })
  it('cap 0 & load 50: ALL over; COMMITTED with committed 0 noCapacity', () => {
    expect(viewTone({ total: 50, committed: 0 }, 0, 'ALL').tone).toBe('over')
    expect(viewTone({ total: 50, committed: 0 }, 0, 'COMMITTED')).toEqual({
      tone: 'noCapacity',
      palette: 'load',
      loadCd: 0,
    })
  })
  it('AT_RISK with cap 0 and atRisk 50: noCapacity stripes on the tentative palette', () => {
    expect(viewTone({ total: 50, committed: 0 }, 0, 'AT_RISK')).toEqual({
      tone: 'noCapacity',
      palette: 'tentative',
      loadCd: 50,
    })
  })
  it('AT_RISK with nothing tentative: empty', () => {
    expect(viewTone({ total: 300, committed: 300 }, 500, 'AT_RISK')).toEqual({
      tone: 'empty',
      palette: 'tentative',
      loadCd: 0,
    })
  })

  it('property: palette tentative ⇔ AT_RISK; ALL/COMMITTED tone = loadTone(loadCd, cap)', () => {
    const viewArb = fc.constantFrom<LoadView>('ALL', 'COMMITTED', 'AT_RISK')
    fc.assert(
      fc.property(loadArb, fc.integer({ min: 0, max: 700 }), viewArb, (load, cap, view) => {
        const r = viewTone(load, cap, view)
        expect(r.palette === 'tentative').toBe(view === 'AT_RISK')
        expect(Number.isInteger(r.loadCd)).toBe(true)
        if (view !== 'AT_RISK') expect(r.tone).toBe(loadTone(r.loadCd, cap))
      }),
    )
  })
})
