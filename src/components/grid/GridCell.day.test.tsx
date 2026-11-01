// plan/m07 S3.4 — day cell rendering: derived, DAY, warnings, fallback (BR-20/20a/21a, M7-D9/D15/D20, §8.9).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { GridCell, type GridCellProps } from './GridCell'
import { createGridStore } from './gridStore'
import styles from './grid.module.css'

const base = (o: Partial<GridCellProps>): GridCellProps => ({
  store: createGridStore(),
  r: 0,
  c: 0,
  left: 0,
  width: 44,
  rowKey: 'a:ivy',
  periodKey: 'D:2026-09-30',
  text: '',
  label: 'cell',
  editability: 'ok',
  resolution: 'WEEK',
  tentative: false,
  leave: false,
  noCapacity: false,
  notCounted: false,
  today: false,
  exactValue: '',
  onEditorBlur: () => {},
  colKind: 'D',
  ...o,
})
const cell = () => screen.getByTestId(/^cell-/)

describe('GridCell — day cells (S3.4)', () => {
  it('derived 50 → "0.5", data-derived, aria-description, dashed class, never opacity', () => {
    render(<GridCell {...base({ text: '0.5', derived: true, description: th.grid.day.derivedDescription })} />)
    expect(cell()).toHaveTextContent('0.5')
    expect(cell()).toHaveAttribute('data-derived', 'true')
    expect(cell()).toHaveAttribute('aria-description', th.grid.day.derivedDescription)
    expect(cell().querySelector('[data-cell-value]')).toHaveClass(styles.derivedValue!)
    const op = getComputedStyle(cell()).opacity
    expect(op === '' || Number(op) === 1).toBe(true)
  })
  it('DAY 100 → "1.0" solid; derived 125 → "1.3"', () => {
    const { unmount } = render(<GridCell {...base({ text: '1.0', resolution: 'DAY' })} />)
    expect(cell()).toHaveTextContent('1.0')
    expect(cell()).not.toHaveAttribute('data-derived')
    expect(cell().querySelector('[data-glyph="dayDetail"]')).toBeNull() // ⋯ only on the W cell
    unmount()
    render(<GridCell {...base({ text: '1.3', derived: true })} />)
    expect(cell()).toHaveTextContent('1.3')
  })
  it('NON_WORKING → ⚠ with the warning text', () => {
    render(<GridCell {...base({ text: '0.5', warnLabel: th.grid.warn.nonWorkingDay })} />)
    expect(cell().querySelector('[data-glyph="warn"]')).toHaveTextContent(th.grid.warn.nonWorkingDay)
  })
  it('W cell with fallback SCHEDULE → ⚠ weekNoCapacity', () => {
    render(
      <GridCell {...base({ colKind: 'W', periodKey: 'W:2026-09-28', text: '2.5', warnLabel: th.grid.warn.weekNoCapacity })} />,
    )
    expect(cell()).toHaveTextContent(th.grid.warn.weekNoCapacity)
  })
  it('TIME_OFF → leave glyph with "มีงาน X วัน…"; OVER → 🔴 with its status text', () => {
    render(
      <GridCell
        {...base({
          text: '1.0',
          timeOffLabel: th.grid.warn.allocatedOnTimeOff('1.0'),
          dayLevel: 'OVER',
          dayLevelLabel: th.overload.dayStatus(th.overload.level.OVER, '1.3', '1.0'),
        })}
      />,
    )
    expect(cell()).toHaveTextContent(th.grid.warn.allocatedOnTimeOff('1.0'))
    expect(cell().querySelector('[data-glyph="over"]')).toHaveTextContent('🔴')
    expect(cell()).toHaveTextContent(th.overload.level.OVER)
    expect(cell()).toHaveAttribute('data-day-level', 'OVER')
  })
  it('pending BR-24 value and loading placeholder are marked', () => {
    render(<GridCell {...base({ text: '2.0', pendingChoice: true, busy: true })} />)
    expect(cell()).toHaveAttribute('data-pending-choice', 'true')
    expect(cell()).toHaveAttribute('aria-busy', 'true')
  })
  it('busy day cell without a value shows a visible placeholder and the loading text (not cursor only)', () => {
    render(<GridCell {...base({ text: '', busy: true })} />)
    const ph = cell().querySelector('[data-busy-placeholder]')
    expect(ph).not.toBeNull()
    expect(ph).toHaveTextContent('…')
    expect(ph).toHaveTextContent(th.grid.day.loading)
  })
  it('loaded day cell shows no busy placeholder', () => {
    render(<GridCell {...base({ text: '' })} />)
    expect(cell().querySelector('[data-busy-placeholder]')).toBeNull()
  })
})
