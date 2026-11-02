import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ManagerOverloadCard, ManagerUtilisationCard } from './ManagerCards'
import { MANAGER, PETER } from './test-data.test.helper'

describe('manager cards (FR-1101f, PRIN-P6, M10-D18)', () => {
  it('overloaded row: name → person plan, week, level (glyph + text), excess, cause', () => {
    renderWithProviders(<ManagerOverloadCard overloaded={MANAGER.overloaded} />)
    const row = screen.getByRole('listitem')
    expect(within(row).getByRole('link', { name: 'Peter' })).toHaveAttribute(
      'href',
      `/people/${PETER}/plan?week=2026-10-05`,
    )
    expect(row).toHaveTextContent(th.home.manager.week('5/10'))
    expect(row).toHaveTextContent(th.overload.level.OVER)
    expect(row).toHaveTextContent(th.overload.excess('2'))
    expect(row).toHaveTextContent(th.overload.cause.CAPACITY)
    expect(screen.getByRole('link', { name: th.home.manager.openWorkload })).toHaveAttribute(
      'href',
      '/workload',
    )
  })

  it('nobody overloaded → the empty text', () => {
    renderWithProviders(<ManagerOverloadCard overloaded={[]} />)
    expect(screen.getByText(th.home.manager.overloadedEmpty)).toBeInTheDocument()
  })

  it('utilisation: 725 → 72.5%, capacity 0 → —, the 4-week total row', () => {
    renderWithProviders(<ManagerUtilisationCard utilisation={MANAGER.utilisation} />)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent(th.home.manager.week('28/9'))
    expect(rows[0]).toHaveTextContent('72.5%')
    expect(rows[0]).toHaveTextContent(th.home.manager.committed('72.5%'))
    expect(rows[3]).toHaveTextContent(th.home.manager.noCapacity)
    expect(rows[4]).toHaveTextContent(th.home.manager.utilisationTotal)
    expect(rows[4]).toHaveTextContent('74.0%')
  })
})
