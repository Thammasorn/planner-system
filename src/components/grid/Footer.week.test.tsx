// plan/m09 S3.5 — footer week cells: BR-45 tone (view palette) AND the number AND the BR-40 glyph + hidden text
// (never colour alone, §8.9, M9-D13, X06).
import { render, screen } from '@testing-library/react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { buildColumns } from '@/lib/grid/columns'
import type { FooterPeriodCell } from '@/lib/grid/load-footer'
import { Footer } from './Footer'

const cols = buildColumns(['2026-10-19'], new Set(), new Map())
const vCols: VirtualItem[] = cols.map((c, i) => ({ index: i, key: i, start: c.offset, end: c.offset + c.width, size: c.width, lane: 0 }))
const K = 'W:2026-10-19'

function renderWeek(
  cell: FooterPeriodCell,
  load: { total: number; committed: number },
  capacityCd: number,
  o: { view?: 'ALL' | 'COMMITTED' | 'AT_RISK'; person?: boolean } = {},
) {
  render(
    <div role="grid">
      <Footer
        cols={cols}
        vCols={vCols}
        totalWidth={500}
        firstRowIndex={5}
        names={['Jack', 'Mint']}
        cells={{ [K]: { load, capacityCd, utilizationPct: null } }}
        view={o.view ?? 'ALL'}
        includeOthers={false}
        onIncludeOthers={() => {}}
        weekCells={new Map([[K, cell]])}
        {...(o.person ? { loadLabel: th.people.grid.footerLoad, showOthersSwitch: false } : {})}
      />
    </div>,
  )
  return screen.getByTestId(`cell-footer-load-${K}`)
}

const base: FooterPeriodCell = {
  tone: 'over',
  palette: 'load',
  glyph: 'OVER',
  overPeople: ['jack', 'mint'],
  loadCd: 1000,
  capCd: 800,
  single: null,
}

describe('Footer — week cells (M9 S3.5)', () => {
  it('tone over: the number, 🔴 and the hidden footerStatus text; tooltip flag', () => {
    const cell = renderWeek(base, { total: 1000, committed: 1000 }, 800)
    expect(cell).toHaveAttribute('data-tone', 'over')
    expect(cell).toHaveAttribute('data-palette', 'load')
    expect(cell).toHaveTextContent('10.0')
    expect(cell.querySelector('[data-glyph="over"]')).toHaveTextContent('🔴')
    expect(cell).toHaveTextContent(th.overload.footerStatus(th.overload.level.OVER, '10.0', '8.0'))
    expect(cell).toHaveAttribute('data-tip', 'footer')
  })
  it('RISK → ⚠ with its text; OK → no glyph, no tooltip', () => {
    const risk = renderWeek({ ...base, tone: 'over', glyph: 'RISK', overPeople: ['jack'] }, { total: 900, committed: 700 }, 800)
    expect(risk.querySelector('[data-glyph="risk"]')).toHaveTextContent('⚠')
    expect(risk).toHaveTextContent(th.overload.level.RISK)
  })
  it('OK week: tone light, number only', () => {
    const cell = renderWeek(
      { ...base, tone: 'light', glyph: 'OK', overPeople: [], loadCd: 125, capCd: 500 },
      { total: 125, committed: 125 },
      500,
    )
    expect(cell).toHaveAttribute('data-tone', 'light')
    expect(cell.querySelector('[data-glyph]')).toBeNull()
    expect(cell).not.toHaveAttribute('data-tip')
    expect(cell).toHaveTextContent('1.3')
  })
  it('noCapacity renders stripes (tone) with the hidden th.grid.glyph.noCapacity', () => {
    const cell = renderWeek(
      { ...base, tone: 'noCapacity', glyph: 'OK', overPeople: [], loadCd: 0, capCd: 0 },
      { total: 0, committed: 0 },
      0,
    )
    expect(cell).toHaveAttribute('data-tone', 'noCapacity')
    expect(cell.querySelector('[data-glyph="noCapacity"]')).not.toBeNull()
    expect(cell).toHaveTextContent(th.grid.glyph.noCapacity)
  })
  it('AT_RISK view uses data-palette="tentative"', () => {
    const cell = renderWeek(
      { ...base, tone: 'light', palette: 'tentative', loadCd: 200 },
      { total: 1000, committed: 800 },
      800,
      { view: 'AT_RISK' },
    )
    expect(cell).toHaveAttribute('data-palette', 'tentative')
    expect(cell).toHaveTextContent('2.0')
  })
  it('person context: "ภาระรวม (ทุกโปรเจค)" label, no includeOthers switch; tooltip for the single person', () => {
    const cell = renderWeek(
      {
        ...base,
        overPeople: ['peter'],
        loadCd: 500,
        capCd: 300,
        single: {
          load: { total: 500, committed: 500 },
          capCd: 300,
          stdCd: 500,
          status: { level: 'OVER', excessCd: 200, cause: 'CAPACITY' },
        },
      },
      { total: 500, committed: 500 },
      300,
      { person: true },
    )
    expect(screen.getByText(th.people.grid.footerLoad)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: th.grid.toolbar.includeOthers })).toBeNull()
    expect(cell).toHaveAttribute('data-tip', 'footer')
    expect(cell).toHaveTextContent('5.0')
  })
})
