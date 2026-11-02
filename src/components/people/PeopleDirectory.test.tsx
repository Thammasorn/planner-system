import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PeopleDirectoryResponse } from '@/lib/contracts/workload'
import { qk } from '@/lib/query-keys'
import { renderUi } from '../workload/render.test.helper'
import { cell } from '../workload/test-data.test.helper'
import { PeopleDirectory } from './PeopleDirectory'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const DATA: PeopleDirectoryResponse = {
  week: '2026-09-28',
  groups: [
    {
      positionId: 'pos-dev',
      name: 'Developer',
      people: [
        {
          userId: 'u-ivy',
          name: 'Ivy',
          fullName: 'Ivy I.',
          positionName: 'Developer',
          active: true,
          thisWeek: cell(450, 450, 500),
        },
      ],
    },
  ],
}

describe('PeopleDirectory (FR-1008, M9-D14)', () => {
  it('two columns — name and this week — with the position as the group header only (390 px fit)', () => {
    renderUi(<PeopleDirectory />, { seed: (qc) => qc.setQueryData(qk.peopleDirectory(), DATA) })
    const table = screen.getByRole('table', { name: th.people.directoryLabel })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([th.people.columns.name, th.people.columns.thisWeek])
    expect(within(table).getByRole('rowheader', { name: 'Ivy' })).toBeInTheDocument()
    const group = within(table).getByText('Developer')
    expect(group).toHaveAttribute('colspan', '2')
    // the name only appears once as a group header, never repeated per row
    expect(within(table).getAllByText('Developer')).toHaveLength(1)
    const row = table.querySelector('tr[data-user-id="u-ivy"]') as HTMLElement
    expect(row.children).toHaveLength(2)
  })
})
