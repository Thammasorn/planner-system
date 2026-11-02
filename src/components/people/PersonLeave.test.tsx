import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeaveDialogContext } from '@/components/calendar/LeaveDialogProvider'
import { th } from '@/i18n/th'
import type { PersonTimeOffResponse } from '@/lib/contracts/workload'
import { qk } from '@/lib/query-keys'
import { renderUi } from '../workload/render.test.helper'
import { PersonLeave } from './PersonLeave'

vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const CINDY = 'u-cindy'
const masked: PersonTimeOffResponse = {
  from: '2025-09-29',
  to: '2027-10-04',
  canEdit: false,
  entries: [
    {
      kind: 'masked',
      userId: CINDY,
      startDate: '2026-10-12',
      endDate: '2026-10-14',
      half: null,
      label: th.masking.leave,
    },
  ],
}
const ENTRY = {
  kind: 'full' as const,
  id: 'to-1',
  userId: CINDY,
  startDate: '2026-10-12',
  endDate: '2026-10-14',
  half: null,
  leaveTypeId: 'lt-1',
  leaveTypeName: 'ลาพักร้อน',
  leaveTypeColor: '#0369A1',
  leaveTypeArchived: false,
  note: null,
}
const full: PersonTimeOffResponse = {
  ...masked,
  canEdit: true,
  entries: [{ ...ENTRY, startDate: '2026-09-01', endDate: '2026-09-01', id: 'to-0' }, ENTRY],
}

function renderLeave(data: PersonTimeOffResponse, open = vi.fn()) {
  renderUi(
    <LeaveDialogContext value={{ open }}>
      <PersonLeave userId={CINDY} />
    </LeaveDialogContext>,
    { seed: (qc) => qc.setQueryData(qk.personTimeOff(CINDY), data) },
  )
  return open
}

describe('PersonLeave (FR-1008 วันลา, M9-D16, MASK-5)', () => {
  it('a masked entry shows ลา, no type and no edit button; no แจ้งลา without canEdit', () => {
    renderLeave(masked)
    const upcoming = screen.getByRole('region', { name: th.people.leave.upcoming })
    expect(within(upcoming).getByText(th.masking.leave)).toBeInTheDocument()
    expect(within(upcoming).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: th.people.leave.add })).toBeNull()
  })

  it('with canEdit a full entry opens the dialog in edit mode; แจ้งลา presets the user; past entries split', async () => {
    const user = userEvent.setup()
    const open = renderLeave(full)
    const upcoming = screen.getByRole('region', { name: th.people.leave.upcoming })
    expect(within(upcoming).getByText('ลาพักร้อน')).toBeInTheDocument()
    const past = screen.getByRole('region', { name: th.people.leave.past })
    expect(within(past).getAllByRole('listitem')).toHaveLength(1)
    await user.click(within(upcoming).getByRole('button', { name: /แก้วันลา/ }))
    expect(open).toHaveBeenCalledWith({ mode: 'edit', entry: ENTRY })
    await user.click(screen.getByRole('button', { name: th.people.leave.add }))
    expect(open).toHaveBeenCalledWith({ mode: 'create', userId: CINDY })
  })
})
