import { screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { AgendaList } from './AgendaList'
import { calendarData } from './test-data.test.helper'

it('M8-D16: a day with only a ◆ milestone is listed, with the chip linking to the overview', () => {
  const POS = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
  const data = {
    ...calendarData('2026-09-28', '2026-11-09'),
    milestones: [
      {
        id: '00000000-0000-4000-8000-000000000702',
        projectId: POS,
        projectName: 'POS Upgrade',
        projectColor: '#2F5597',
        name: 'UAT sign-off',
        date: '2026-10-23',
        color: 'PURPLE' as const,
        status: 'UPCOMING' as const,
        late: false,
      },
    ],
  }
  renderWithProviders(<AgendaList month="2026-10" data={data} today="2026-09-30" onOpenEntry={vi.fn()} />)
  const dayItem = within(screen.getByTestId('agenda-2026-10-23'))
  expect(dayItem.getByText('◆ UAT sign-off · POS Upgrade')).toBeInTheDocument()
  expect(dayItem.getByText(th.milestones.status.UPCOMING)).toBeInTheDocument()
  expect(dayItem.getByRole('link')).toHaveAttribute('href', `/projects/${POS}/overview`)
})
