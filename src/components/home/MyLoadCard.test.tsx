import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { MyLoadCard } from './MyLoadCard'
import { cell, homeResponse, WEEKS } from './test-data.test.helper'

describe('MyLoadCard (FR-1101b, BR-45, M10-D14)', () => {
  it('Peter F1: eight labelled bars with numbers and BR-45 tones (never colour alone)', () => {
    renderWithProviders(<MyLoadCard weeks={homeResponse().myLoad} />)
    const card = screen.getByRole('region', { name: th.home.myLoad.title })
    const bars = within(card).getAllByRole('img')
    expect(bars).toHaveLength(8)
    expect(bars[0]).toHaveAccessibleName(th.home.myLoad.barLabel('28/9', '5', '5'))
    expect(bars[2]).toHaveAccessibleName(th.home.myLoad.barLabel('12/10', '3.8', '5'))
    expect(bars[4]).toHaveAccessibleName(th.home.myLoad.barLabel('26/10', '0', '5'))
    const items = within(card).getAllByRole('listitem')
    expect(items.map((li) => li.firstElementChild?.textContent)).toEqual([
      '5/5',
      '5/5',
      '3.8/5',
      '2.5/5',
      '–',
      '2.5/5',
      '3.8/5',
      '5/5',
    ])
    expect(bars.map((b) => b.firstElementChild?.getAttribute('data-tone'))).toEqual([
      'full',
      'full',
      'light',
      'light',
      'empty',
      'light',
      'light',
      'full',
    ])
    expect(within(card).getByText(th.home.myLoad.legend)).toBeInTheDocument()
  })

  it('an OVER week shows the 🔴 glyph with its hidden text; capacity 0 shows the striped track', () => {
    const weeks = homeResponse().myLoad.map((w, i) =>
      i === 1
        ? { week: WEEKS[1]!, cell: cell(500, 300, { level: 'OVER', excess: 200, cause: 'CAPACITY' }) }
        : i === 2
          ? { week: WEEKS[2]!, cell: cell(0, 0) }
          : w,
    )
    renderWithProviders(<MyLoadCard weeks={weeks} />)
    const items = screen.getAllByRole('listitem')
    expect(within(items[1]!).getByText(th.home.myLoad.over)).toBeInTheDocument()
    expect(within(items[1]!).getByRole('img')).toHaveAccessibleName(th.home.myLoad.barLabel('5/10', '5', '3'))
    expect(within(items[1]!).getByRole('img').firstElementChild).toHaveAttribute('data-tone', 'over')
    expect(within(items[2]!).getByRole('img')).toHaveAttribute('data-no-capacity', 'true')
    expect(within(items[0]!).queryByText(th.home.myLoad.over)).toBeNull()
  })
})
