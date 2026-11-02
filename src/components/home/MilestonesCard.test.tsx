import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { formatThaiDate } from '@/lib/format'
import { renderWithProviders } from '../../../tests/helpers/render'
import { MilestonesCard } from './MilestonesCard'
import { homeResponse, POS } from './test-data.test.helper'

describe('MilestonesCard (FR-1101c, FR-705, M10-D15)', () => {
  it('a milestone row: date, link to the project overview, project, status text and the late badge', () => {
    const milestones = homeResponse().milestones
    renderWithProviders(<MilestonesCard milestones={milestones} />)
    const card = screen.getByRole('region', { name: th.home.milestones.title })
    const [row] = within(card).getAllByRole('listitem')
    expect(row).toHaveAttribute('data-milestone-id', milestones[0]!.id)
    expect(within(row!).getByText(formatThaiDate('2026-10-02', 'medium'))).toBeInTheDocument()
    expect(within(row!).getByRole('link', { name: 'UAT sign-off' })).toHaveAttribute(
      'href',
      `/projects/${POS}/overview`,
    )
    expect(row).toHaveTextContent('POS Upgrade')
    // status by text + icon, never colour alone
    expect(within(row!).getByText(th.milestones.status.DUE_SOON)).toBeInTheDocument()
    expect(within(row!).getByText(th.milestones.late)).toBeInTheDocument()
  })

  it('no late badge when the milestone is not late', () => {
    const [m] = homeResponse().milestones
    renderWithProviders(<MilestonesCard milestones={[{ ...m!, status: 'UPCOMING', late: false }]} />)
    expect(screen.getByText(th.milestones.status.UPCOMING)).toBeInTheDocument()
    expect(screen.queryByText(th.milestones.late)).toBeNull()
  })

  it('no milestones → the empty text', () => {
    renderWithProviders(<MilestonesCard milestones={[]} />)
    expect(screen.getByText(th.home.milestones.empty)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
