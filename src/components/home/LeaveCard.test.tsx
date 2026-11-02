import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { formatLeaveRange } from '@/lib/format'
import { renderWithProviders } from '../../../tests/helpers/render'
import { LeaveCard } from './LeaveCard'
import { homeResponse, PETER } from './test-data.test.helper'

const dd = (term: string) => {
  const dt = screen.getByText(term, { selector: 'dt' })
  return dt.nextElementSibling as HTMLElement
}

describe('LeaveCard (FR-1101d, X68, MASK-5)', () => {
  it('three lines; a masked entry shows "ลา" and no leave type; empty lines show "—"', () => {
    renderWithProviders(<LeaveCard leave={homeResponse().leave} />)
    expect(dd(th.home.leave.today)).toHaveTextContent(th.home.leave.none)
    expect(dd(th.home.leave.thisWeek)).toHaveTextContent(th.home.leave.none)
    const next = dd(th.home.leave.nextWeek)
    expect(next).toHaveTextContent(
      `${th.home.leave.entry('Peter', formatLeaveRange('2026-10-05', '2026-10-06', null))} · ${th.masking.leave}`,
    )
    expect(next).not.toHaveTextContent('ลาพักร้อน')
    expect(th.home.leave.none).toBe('—')
  })

  it('a full entry (manager / self) shows the leave type', () => {
    const leave = {
      today: [
        {
          userId: PETER,
          name: 'Peter',
          entry: {
            kind: 'full' as const,
            id: '00000000-0000-4000-8000-0000000000f9',
            userId: PETER,
            startDate: '2026-09-30',
            endDate: '2026-09-30',
            half: 'AM' as const,
            leaveTypeId: '00000000-0000-4000-8000-0000000000f8',
            leaveTypeName: 'ลาพักร้อน',
            leaveTypeColor: '#2F5597',
            leaveTypeArchived: false,
            note: null,
          },
        },
      ],
      thisWeek: [],
      nextWeek: [],
    }
    renderWithProviders(<LeaveCard leave={leave} />)
    const today = dd(th.home.leave.today)
    expect(today).toHaveTextContent('ลาพักร้อน')
    expect(today).toHaveTextContent(formatLeaveRange('2026-09-30', '2026-09-30', 'AM'))
    expect(within(today).queryByText(new RegExp(` · ${th.masking.leave}$`))).toBeNull()
  })
})
