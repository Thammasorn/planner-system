import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PersonHeader } from '@/lib/contracts/workload'
import { renderUi } from '../workload/render.test.helper'
import { PersonHeaderView } from './PersonHeaderView'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/people/u1/plan',
}))

const base: PersonHeader = {
  userId: 'u-peter',
  name: 'Peter',
  fullName: 'Peter',
  nickname: 'Peter',
  positionName: 'Data',
  active: true,
  deactivatedOn: null,
  schedule: { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 },
  isSelf: false,
  canEditLeave: false,
}

describe('PersonHeaderView (FR-1008, M9-D14)', () => {
  it('name as the h1, position and schedule text', () => {
    renderUi(<PersonHeaderView header={base} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Peter')
    expect(screen.getByTestId('person-position')).toHaveTextContent('Data')
    expect(screen.getByTestId('person-schedule')).toHaveTextContent(th.people.schedule.perDay('จ–ศ', '1.00'))
    expect(screen.queryByText(th.people.header.deactivated)).toBeNull()
  })

  it('deactivated chip, full name when different, no-position fallback', () => {
    renderUi(
      <PersonHeaderView
        header={{
          ...base,
          name: 'Ton',
          fullName: 'Thanakorn S.',
          positionName: null,
          active: false,
          deactivatedOn: '2026-10-01',
        }}
      />,
    )
    const header = screen.getByTestId('person-header')
    expect(within(header).getByText(th.people.header.deactivated)).toBeInTheDocument()
    expect(within(header).getByText(th.people.header.fullName('Thanakorn S.'))).toBeInTheDocument()
    expect(screen.getByTestId('person-position')).toHaveTextContent(th.people.header.noPosition)
  })
})
