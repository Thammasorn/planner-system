import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import type { TimeOffImpact } from '@/lib/contracts/time-off'
import { formatThaiDate } from '@/lib/format'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ImpactPanel } from './ImpactPanel'

const impact = (weeks: TimeOffImpact['weeks']): TimeOffImpact => ({
  userId: 'u-p',
  userName: 'Peter',
  weeks,
})

describe('ImpactPanel (FR-906 capacity part, M5-D5)', () => {
  it('lists every changed week as "สัปดาห์ <d>: X → Y วัน" under the person heading', () => {
    renderWithProviders(
      <ImpactPanel impact={impact([{ weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 }])} />,
    )
    expect(screen.getByRole('heading', { name: th.capacity.impactTitle })).toBeInTheDocument()
    expect(screen.getByText(th.capacity.impactFor('Peter'))).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      th.capacity.impactLine(formatThaiDate('2026-10-05'), '5.00', '3.00'),
    ])
    expect(screen.queryByText(th.capacity.noImpact)).toBeNull()
  })

  it('weeks without a change → only noImpact', () => {
    renderWithProviders(
      <ImpactPanel impact={impact([{ weekStart: '2026-10-19', beforeCd: 400, afterCd: 400 }])} />,
    )
    expect(screen.getByText(th.capacity.noImpact)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('a two-week move shows both lines in week order; unchanged weeks are skipped', () => {
    renderWithProviders(
      <ImpactPanel
        impact={impact([
          { weekStart: '2026-10-12', beforeCd: 500, afterCd: 450 },
          { weekStart: '2026-10-05', beforeCd: 300, afterCd: 500 },
          { weekStart: '2026-10-19', beforeCd: 500, afterCd: 500 },
        ])}
      />,
    )
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      th.capacity.impactLine(formatThaiDate('2026-10-05'), '3.00', '5.00'),
      th.capacity.impactLine(formatThaiDate('2026-10-12'), '5.00', '4.50'),
    ])
  })
})
