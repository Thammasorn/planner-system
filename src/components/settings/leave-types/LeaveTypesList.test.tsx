import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToasterHost } from '@/components/providers/ToasterHost'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { th } from '@/i18n/th'
import type { DeletedLeaveType, LeaveTypeAdminDTO } from '@/lib/contracts/leave-types'
import { renderWithProviders } from '../../../../tests/helpers/render'
import { LeaveTypesList } from './LeaveTypesList'

const m = vi.hoisted(() => ({
  createLeaveType: vi.fn<(i: unknown) => Promise<unknown>>(),
  updateLeaveType: vi.fn<(i: unknown) => Promise<unknown>>(),
  moveLeaveType: vi.fn<(i: unknown) => Promise<unknown>>(),
  setLeaveTypeArchived: vi.fn<(i: unknown) => Promise<unknown>>(),
  deleteLeaveType: vi.fn<(i: unknown) => Promise<unknown>>(),
  restoreLeaveType: vi.fn<(i: unknown) => Promise<unknown>>(),
}))
vi.mock('@/server/actions/leave-types', () => m)

const id = (n: number) => `0b6f7c1e-1111-4a6c-9a0e-00000000000${n}`
const rows: LeaveTypeAdminDTO[] = [
  { id: id(1), name: 'ลาพักร้อน', color: '#0369A1', archived: false, position: 'a0', usageCount: 3 },
  { id: id(2), name: 'ลาป่วย', color: '#B91C1C', archived: false, position: 'a1', usageCount: 0 },
  { id: id(3), name: 'ลาเก่า', color: '#475569', archived: true, position: 'a2', usageCount: 1 },
]

function setup(list = rows) {
  return renderWithProviders(
    <UndoProvider>
      <LeaveTypesList rows={list} />
      <ToasterHost />
    </UndoProvider>,
  )
}

const itemOf = (name: string) =>
  screen.getAllByRole('listitem').find((li) => within(li).queryByText(name, { exact: true }) !== null)!

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  for (const f of Object.values(m)) f.mockResolvedValue({ ok: true })
})

describe('LeaveTypesList (FR-902, M5-D10)', () => {
  it('first row cannot move up, last cannot move down; a move sends intent only', async () => {
    const user = userEvent.setup()
    setup()
    expect(within(itemOf('ลาพักร้อน')).getByRole('button', { name: th.common.moveUp })).toBeDisabled()
    expect(within(itemOf('ลาเก่า')).getByRole('button', { name: th.common.moveDown })).toBeDisabled()
    await user.click(within(itemOf('ลาป่วย')).getByRole('button', { name: th.common.moveUp }))
    expect(m.moveLeaveType).toHaveBeenCalledWith({ id: id(2), direction: 'up' })
  })

  it('shows usage and the archived chip as text', () => {
    setup()
    expect(within(itemOf('ลาพักร้อน')).getByText(th.leaveTypes.usage(3))).toBeInTheDocument()
    expect(within(itemOf('ลาเก่า')).getByText(th.leaveTypes.archivedChip)).toBeInTheDocument()
    expect(
      within(itemOf('ลาเก่า')).getByRole('button', { name: th.leaveTypes.unarchive }),
    ).toBeInTheDocument()
    expect(within(itemOf('ลาพักร้อน')).queryByText(th.leaveTypes.archivedChip)).toBeNull()
  })

  it('delete with outcome archived shows archivedInstead; its undo calls setLeaveTypeArchived({ archived: false })', async () => {
    const user = userEvent.setup()
    m.deleteLeaveType.mockResolvedValue({ ok: true, outcome: 'archived', id: id(1) })
    setup()
    await user.click(within(itemOf('ลาพักร้อน')).getByRole('button', { name: th.leaveTypes.delete }))
    expect(m.deleteLeaveType).toHaveBeenCalledWith({ id: id(1) })
    expect(screen.queryByRole('dialog')).toBeNull() // no confirm
    expect(await screen.findByText(th.leaveTypes.archivedInstead('ลาพักร้อน'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await waitFor(() => expect(m.setLeaveTypeArchived).toHaveBeenCalledWith({ id: id(1), archived: false }))
  })

  it('delete with outcome deleted → undo calls restoreLeaveType with the snapshot', async () => {
    const user = userEvent.setup()
    const deleted: DeletedLeaveType = {
      id: id(2),
      name: 'ลาป่วย',
      color: '#B91C1C',
      position: 'a1',
      archivedAt: null,
    }
    m.deleteLeaveType.mockResolvedValue({ ok: true, outcome: 'deleted', deleted })
    setup()
    await user.click(within(itemOf('ลาป่วย')).getByRole('button', { name: th.leaveTypes.delete }))
    expect(await screen.findByText(th.leaveTypes.deleted('ลาป่วย'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await waitFor(() => expect(m.restoreLeaveType).toHaveBeenCalledWith(deleted))
  })

  it('CONFLICT lastActive shows the error toast and pushes no undo', async () => {
    const user = userEvent.setup()
    m.setLeaveTypeArchived.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: th.leaveTypes.errors.lastActive,
    })
    setup()
    await user.click(within(itemOf('ลาป่วย')).getByRole('button', { name: th.leaveTypes.archive }))
    expect(m.setLeaveTypeArchived).toHaveBeenCalledWith({ id: id(2), archived: true })
    expect(await screen.findByText(th.leaveTypes.errors.lastActive)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.undo.undo })).toBeNull()
  })

  it('archive → toast archived(name) with an undo that unarchives', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(itemOf('ลาป่วย')).getByRole('button', { name: th.leaveTypes.archive }))
    expect(await screen.findByText(th.leaveTypes.archived('ลาป่วย'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await waitFor(() =>
      expect(m.setLeaveTypeArchived).toHaveBeenLastCalledWith({ id: id(2), archived: false }),
    )
  })

  it('rename inline: Enter saves, Esc cancels', async () => {
    const user = userEvent.setup()
    setup()
    const list = screen.getByRole('list', { name: th.leaveTypes.title })
    await user.click(within(list).getByRole('button', { name: 'ลาป่วย' }))
    const input = within(list).getByRole('textbox', { name: th.leaveTypes.name })
    await user.clear(input)
    await user.type(input, 'ลาป่วยมีใบรับรอง{Enter}')
    expect(m.updateLeaveType).toHaveBeenCalledWith({ id: id(2), name: 'ลาป่วยมีใบรับรอง' })

    await user.click(within(list).getByRole('button', { name: 'ลาเก่า' }))
    await user.type(within(list).getByRole('textbox', { name: th.leaveTypes.name }), 'x{Escape}')
    expect(m.updateLeaveType).toHaveBeenCalledTimes(1)
    expect(within(list).queryByRole('textbox')).toBeNull()
  })

  it('the swatch menu changes the colour', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(
      within(itemOf('ลาป่วย')).getByRole('button', {
        name: `${th.leaveTypes.color} ลาป่วย: ${th.leaveTypes.swatch('#B91C1C')}`,
      }),
    )
    const menu = await screen.findByRole('menu', { name: th.leaveTypes.color })
    expect(
      within(menu).getByRole('menuitemradio', { name: th.leaveTypes.swatch('#B91C1C') }),
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(within(menu).getByRole('menuitemradio', { name: th.leaveTypes.swatch('#15803D') }))
    expect(m.updateLeaveType).toHaveBeenCalledWith({ id: id(2), color: '#15803D' })
  })

  it('add: empty name → nameRequired; otherwise name + the first unused colour', async () => {
    const user = userEvent.setup()
    m.createLeaveType.mockResolvedValue({
      ok: true,
      leaveType: { id: id(9), name: 'ลาบวช', color: '#2F5597', archived: false },
    })
    setup()
    const form = screen.getByRole('form', { name: th.leaveTypes.add })
    await user.click(within(form).getByRole('button', { name: th.leaveTypes.add }))
    expect(await within(form).findByText(th.leaveTypes.errors.nameRequired)).toBeInTheDocument()
    expect(m.createLeaveType).not.toHaveBeenCalled()
    await user.type(within(form).getByRole('textbox', { name: th.leaveTypes.name }), 'ลาบวช{Enter}')
    expect(m.createLeaveType).toHaveBeenCalledWith({ name: 'ลาบวช', color: '#2F5597' })
  })

  it('closing the inline rename (Enter, Esc or unchanged) returns focus to that row’s name button', async () => {
    const user = userEvent.setup()
    m.updateLeaveType.mockReturnValue(new Promise(() => {})) // keep the optimistic name on screen
    setup()
    const list = screen.getByRole('list', { name: th.leaveTypes.title })
    await user.click(within(list).getByRole('button', { name: 'ลาป่วย' }))
    await user.keyboard('x{Escape}')
    expect(within(list).queryByRole('textbox')).toBeNull()
    expect(within(list).getByRole('button', { name: 'ลาป่วย' })).toHaveFocus()

    await user.keyboard('{Enter}') // the focused name button reopens the field
    const input = within(list).getByRole('textbox', { name: th.leaveTypes.name })
    await user.clear(input)
    await user.type(input, 'ลาป่วยใหม่{Enter}')
    expect(m.updateLeaveType).toHaveBeenCalledWith({ id: id(2), name: 'ลาป่วยใหม่' })
    expect(within(list).getByRole('button', { name: 'ลาป่วยใหม่' })).toHaveFocus()

    await user.keyboard('{Enter}{Enter}') // reopen, save unchanged
    expect(within(list).queryByRole('textbox')).toBeNull()
    expect(within(list).getByRole('button', { name: 'ลาป่วยใหม่' })).toHaveFocus()

    // A validation error keeps the field open and focused.
    await user.keyboard('{Enter}')
    await user.clear(within(list).getByRole('textbox', { name: th.leaveTypes.name }))
    await user.keyboard('{Enter}')
    expect(within(list).getByRole('textbox', { name: th.leaveTypes.name })).toHaveFocus()
  })

  it('after a delete that removes the row, focus moves to the next row, else the previous one, else the add field', async () => {
    const user = userEvent.setup()
    m.deleteLeaveType.mockReturnValue(new Promise(() => {})) // keep the optimistic removal on screen
    const deleteIn = (name: string) =>
      within(itemOf(name)).getByRole('button', { name: th.leaveTypes.delete })
    const unused = (n: number, name: string): LeaveTypeAdminDTO => ({
      ...rows[1]!,
      id: id(n),
      name,
      usageCount: 0,
    })

    const first = setup([unused(1, 'ก'), unused(2, 'ข'), unused(3, 'ค')])
    await user.click(deleteIn('ข'))
    expect(screen.queryByText('ข', { exact: true })).toBeNull()
    expect(deleteIn('ค')).toHaveFocus()
    first.unmount()

    const second = setup([unused(1, 'ก'), unused(2, 'ข')])
    await user.click(deleteIn('ข'))
    expect(deleteIn('ก')).toHaveFocus()
    second.unmount()

    const third = setup([unused(1, 'ก')])
    await user.click(deleteIn('ก'))
    const form = screen.getByRole('form', { name: th.leaveTypes.add })
    expect(within(form).getByRole('textbox', { name: th.leaveTypes.name })).toHaveFocus()
    third.unmount()

    // In use → archived instead: the row (and its focused delete button) stays.
    setup()
    await user.click(deleteIn('ลาพักร้อน'))
    expect(deleteIn('ลาพักร้อน')).toHaveFocus()
  })

  it('a move that disables the pressed button at the list end moves focus to the opposite move button', async () => {
    const user = userEvent.setup()
    m.moveLeaveType.mockReturnValue(new Promise(() => {}))
    const button = (name: string, label: string) => within(itemOf(name)).getByRole('button', { name: label })
    setup()
    button('ลาป่วย', th.common.moveUp).focus()
    await user.keyboard('{Enter}')
    expect(m.moveLeaveType).toHaveBeenCalledWith({ id: id(2), direction: 'up' })
    expect(button('ลาป่วย', th.common.moveUp)).toBeDisabled()
    expect(button('ลาป่วย', th.common.moveDown)).toHaveFocus()
  })
})
