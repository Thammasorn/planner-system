// M11.1 (FR-813/FR-1002, BR-104, M11.1-D4/D5): load as % of capacity or days — integer cd math, pct half-up.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { th } from '@/i18n/th'
import { DEFAULT_PREFERENCES, preferenceInput, preferencesSchema } from '@/lib/schemas/preferences'
import { footerValue } from '@/lib/grid/aggregate'
import { loadDisplay, loadPct, percentText, workloadDisplayText } from './display'

describe('loadPct (BR-104: same integer as the footer "% ใช้กำลังคน")', () => {
  it('half-up integer percent; cap 0 → null', () => {
    expect(loadPct(450, 500)).toBe(90)
    expect(loadPct(375, 600)).toBe(63) // 62.5 → 63
    expect(loadPct(1, 600)).toBe(0) // 0.1666 → 0
    expect(loadPct(625, 500)).toBe(125)
    expect(loadPct(0, 500)).toBe(0)
    expect(loadPct(250, 0)).toBeNull()
    expect(loadPct(0, 0)).toBeNull()
  })

  it('equals the footer percent for one person (any load / capacity)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 700 }), (load, cap) => {
        const footer = footerValue(
          { load: { total: load, committed: load }, capacityCd: cap, utilizationPct: null },
          'ALL',
        ).pct
        expect(loadPct(load, cap)).toBe(footer)
      }),
    )
  })

  it('never uses floats: 1/3 of a day over 3 days', () => {
    expect(loadPct(33, 300)).toBe(11)
    expect(loadPct(50, 300)).toBe(17) // 16.67
  })
})

describe('percentText / workloadDisplayText (FR-1002, M11.1-D5)', () => {
  it('percentText', () => {
    expect(percentText(90)).toBe('90%')
  })
  it('PERCENT: "90%"; DAYS: "4.5/5"; load 0 → "–" in both; cap 0 → the days text in both', () => {
    expect(workloadDisplayText(450, 500, 'PERCENT')).toBe('90%')
    expect(workloadDisplayText(450, 500, 'DAYS')).toBe('4.5/5')
    expect(workloadDisplayText(0, 500, 'PERCENT')).toBe(th.workload.cell.empty)
    expect(workloadDisplayText(0, 500, 'DAYS')).toBe(th.workload.cell.empty)
    expect(workloadDisplayText(250, 0, 'PERCENT')).toBe('2.5/0')
    expect(workloadDisplayText(250, 0, 'DAYS')).toBe('2.5/0')
    expect(workloadDisplayText(625, 500, 'PERCENT')).toBe('125%')
  })
})

describe('load.display preference (X05, M11.1-D4)', () => {
  it('accepts PERCENT | DAYS; rejects anything else', () => {
    expect(preferenceInput.safeParse({ key: 'load.display', value: 'PERCENT' }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'load.display', value: 'DAYS' }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'load.display', value: 'FRACTION' }).success).toBe(false)
  })
  it('default PERCENT; a bad stored value falls back to the default', () => {
    expect(loadDisplay(DEFAULT_PREFERENCES)).toBe('PERCENT')
    expect(
      loadDisplay(
        preferencesSchema.parse({ theme: 'system', 'sidebar.collapsed': false, 'load.display': 'DAYS' }),
      ),
    ).toBe('DAYS')
    expect(
      loadDisplay(
        preferencesSchema.parse({ theme: 'system', 'sidebar.collapsed': false, 'load.display': 'x' }),
      ),
    ).toBe('PERCENT')
  })
})
