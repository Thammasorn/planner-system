// plan/m07 S3.3 — week header toggles (FR-803, M7-D11): plain click toggles, Shift+click still selects (M6-D33),
// no toggle in day zoom.
import { fireEvent, render, screen } from '@testing-library/react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { buildColumns } from '@/lib/grid/columns'
import { GridHeader } from './GridHeader'

const weeks = ['2026-09-21', '2026-09-28', '2026-10-05']
const vItems = (n: number, widths: number[]): VirtualItem[] => {
  let start = 0
  return Array.from({ length: n }, (_, i) => {
    const v = { index: i, key: i, start, end: start + widths[i]!, size: widths[i]!, lane: 0 }
    start += widths[i]!
    return v
  })
}

function renderHeader(o: { expanded?: string[]; toggle?: boolean } = {}) {
  const cols = buildColumns(weeks, new Set(o.expanded ?? []), new Map())
  const onToggleWeek = vi.fn()
  const onSelectColumn = vi.fn()
  render(
    <div role="grid">
      <GridHeader
        cols={cols}
        vCols={vItems(cols.length, cols.map((c) => c.width))}
        totalWidth={1000}
        thisWeek="2026-09-28"
        holidayWeeks={new Set()}
        onSelectColumn={onSelectColumn}
        today="2026-09-30"
        holidays={new Map([['2026-10-01', 'วันทดสอบ']])}
        toggle={o.toggle ?? true}
        onToggleWeek={onToggleWeek}
      />
    </div>,
  )
  return { onToggleWeek, onSelectColumn, cols }
}

describe('GridHeader — M7', () => {
  it('a collapsed week header is a button (aria-expanded false); click → onToggleWeek, no save', () => {
    const { onToggleWeek } = renderHeader()
    const b = screen.getByRole('button', { name: th.grid.day.expandWeek('28/9') })
    expect(b).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(b)
    expect(onToggleWeek).toHaveBeenCalledWith('2026-09-28')
  })
  it('Shift+click still selects the column (M6), without toggling', () => {
    const { onToggleWeek, onSelectColumn } = renderHeader()
    const header = document.querySelector<HTMLElement>('[data-col-key="W:2026-09-28"]')!
    fireEvent.pointerDown(header, { shiftKey: true, button: 0 })
    fireEvent.click(screen.getByTestId('expand-week-2026-09-28'), { shiftKey: true })
    expect(onSelectColumn).toHaveBeenCalledWith(1)
    expect(onToggleWeek).not.toHaveBeenCalled()
  })
  it('an expanded week: collapse button (aria-expanded true), weekday labels, 🎌 holiday, รวม header', () => {
    const { onToggleWeek } = renderHeader({ expanded: ['2026-09-28'] })
    const b = screen.getByRole('button', { name: th.grid.day.collapseWeekView('28/9') })
    expect(b).toHaveAttribute('aria-expanded', 'true')
    expect(b).toHaveTextContent('28 ก.ย. 2569')
    fireEvent.click(b)
    expect(onToggleWeek).toHaveBeenCalledWith('2026-09-28')
    const thu = document.querySelector<HTMLElement>('[data-col-key="D:2026-10-01"]')!
    expect(thu).toHaveAttribute('role', 'columnheader')
    expect(thu).toHaveTextContent('พฤ')
    expect(thu).toHaveAttribute('data-holiday', 'true')
    expect(thu.querySelector('[data-glyph="holiday"]')).not.toBeNull()
    expect(document.querySelector('[data-col-key="D:2026-09-30"]')).toHaveAttribute('data-today', 'true')
    expect(screen.getByRole('columnheader', { name: th.grid.day.totalColumnLabel('28/9') })).toHaveTextContent(
      th.grid.day.totalColumn,
    )
  })
  it('day zoom → no toggle buttons', () => {
    renderHeader({ expanded: ['2026-09-21', '2026-09-28', '2026-10-05'], toggle: false })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
