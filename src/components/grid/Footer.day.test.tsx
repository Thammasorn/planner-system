// plan/m07 S3.10 — footer day cells: BR-45 tone AND the BR-40 glyph + number (never colour alone, §8.9).
import { render, screen } from '@testing-library/react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { buildColumns } from '@/lib/grid/columns'
import { Footer } from './Footer'

const cols = buildColumns(['2026-10-19'], new Set(['2026-10-19']), new Map())
const vCols: VirtualItem[] = cols.map((c, i) => ({ index: i, key: i, start: c.offset, end: c.offset + c.width, size: c.width, lane: 0 }))

describe('Footer — day cells (M7-D13)', () => {
  it('renders 🔴 with the hidden level text, data-tone="over" and the number', () => {
    render(
      <div role="grid">
        <Footer
          cols={cols}
          vCols={vCols}
          totalWidth={500}
          firstRowIndex={5}
          names={['Jack', 'Mint']}
          cells={{ 'D:2026-10-19': { load: { total: 250, committed: 250 }, capacityCd: 200, utilizationPct: 125 } }}
          view="ALL"
          includeOthers={false}
          onIncludeOthers={() => {}}
          dayCells={
            new Map([
              ['D:2026-10-19', { tone: 'over', palette: 'load', glyph: 'OVER', overPeople: ['jack', 'mint'], load: 250, capCd: 200 }],
            ])
          }
        />
      </div>,
    )
    const cell = screen.getByTestId('cell-footer-load-D:2026-10-19')
    expect(cell).toHaveAttribute('data-tone', 'over')
    expect(cell).toHaveAttribute('data-palette', 'load')
    expect(cell.querySelector('[data-glyph="over"]')).toHaveTextContent('🔴')
    expect(cell).toHaveTextContent(th.overload.level.OVER)
    expect(cell).toHaveTextContent('2.5')
    expect(cell).toHaveAttribute('data-tip', 'footer')
    // capacity row: no tone
    expect(screen.getByTestId('cell-footer-capacity-D:2026-10-19')).not.toHaveAttribute('data-tone')
  })
})
