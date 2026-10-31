import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { ProjectMember } from '@/lib/contracts/projects'
import { renderWithProviders as renderBase } from '../../../tests/helpers/render'
import { MembersPanel } from './MembersPanel'

const PID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'

const mocks = vi.hoisted(() => ({
  addMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  removeMemberWithAssignments: vi.fn(),
  restoreRemovedMember: vi.fn(),
  push: vi.fn(),
  undoPush: vi.fn(),
  getJson: vi.fn(),
}))
vi.mock('@/server/actions/members', () => ({
  addMember: mocks.addMember,
  changeMemberRole: mocks.changeMemberRole,
  removeMember: mocks.removeMember,
  removeMemberWithAssignments: mocks.removeMemberWithAssignments,
  restoreRemovedMember: mocks.restoreRemovedMember,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }))
vi.mock('@/components/undo/useUndo', () => ({ useUndo: () => ({ push: mocks.undoPush }) }))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ id: 'cindy', name: 'Cindy C.', nickname: 'Cindy', role: 'worker' }),
}))
vi.mock('@/lib/api', () => ({ getJson: mocks.getJson }))

const member = (
  userId: string,
  name: string,
  nickname: string,
  role: 'LEAD' | 'MEMBER',
  active = true,
): ProjectMember => ({
  userId,
  name,
  nickname,
  positionName: null,
  color: null,
  active,
  role,
})

const members = [
  member('mint', 'Mint M.', 'Mint', 'MEMBER'),
  member('ivy', 'Ivy I.', 'Ivy', 'MEMBER'),
  member('cindy', 'Cindy C.', 'Cindy', 'LEAD'),
  member('nok', 'Nok N.', 'Nok', 'MEMBER', false),
]

function renderPanel(props: ComponentProps<typeof MembersPanel>) {
  return renderBase(
    <>
      <MembersPanel {...props} />
      <Toaster />
    </>,
  )
}

beforeEach(() => {
  mocks.getJson.mockResolvedValue({
    people: [
      { id: 'jack', name: 'Jack J.', nickname: 'Jack', positionName: 'Dev', color: null, active: true },
      { id: 'ivy', name: 'Ivy I.', nickname: 'Ivy', positionName: 'QA', color: null, active: true },
    ],
  })
})

describe('MembersPanel', () => {
  it('lists LEAD first, then by name; marks the viewer and deactivated people', () => {
    renderPanel({ projectId: PID, members, canManage: false })
    const rows = screen.getAllByTestId(/^member-row-/)
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'member-row-cindy',
      'member-row-ivy',
      'member-row-mix',
      'member-row-nok',
    ])
    expect(within(rows[0]!).getByText(th.members.you)).toBeInTheDocument()
    expect(within(rows[0]!).getByText(th.members.roles.LEAD)).toBeInTheDocument()
    expect(within(rows[3]!).getByText(`Nok ${th.users.deactivatedSuffix}`)).toBeInTheDocument()
  })

  it('read-only viewers get no select, remove or add controls', () => {
    renderPanel({ projectId: PID, members, canManage: false })
    expect(screen.getByTestId('members-panel')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.members.remove('Ivy') })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(th.members.add)).not.toBeInTheDocument()
  })

  it('removing a member calls removeMember and pushes an undo entry with the toast (no confirm)', async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockResolvedValue({
      ok: true,
      removedRole: 'MEMBER',
      blockedByAssignments: 0,
      selfRemoved: false,
    })
    mocks.addMember.mockResolvedValue({ ok: true, role: 'MEMBER' })
    renderPanel({ projectId: PID, members, canManage: true })
    await user.click(screen.getByRole('button', { name: th.members.remove('Ivy') }))
    await waitFor(() => expect(mocks.undoPush).toHaveBeenCalledTimes(1))
    expect(mocks.removeMember).toHaveBeenCalledWith({ projectId: PID, userId: 'ivy' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const [entry, opts] = mocks.undoPush.mock.calls[0] as [
      { label: string; undo: () => Promise<void> },
      { toast: string },
    ]
    expect(opts).toEqual({ toast: th.members.toasts.removed('Ivy') })
    expect(entry.label).toBe(th.members.toasts.removed('Ivy'))
    await entry.undo()
    expect(mocks.addMember).toHaveBeenCalledWith({ projectId: PID, userId: 'ivy', role: 'MEMBER' })
  })

  it('FR-404: a member with assignments is kept and offered the two-option toast', async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockResolvedValue({
      ok: true,
      removed: false,
      blockedByAssignments: 2,
      selfRemoved: false,
    })
    const member = { role: 'MEMBER', addedBy: null, addedAt: '2026-09-01T00:00:00+07:00' }
    const batch = '66666666-6666-4666-8666-666666666666'
    mocks.removeMemberWithAssignments.mockResolvedValue({ ok: true, batch, member, unassignedTaskCount: 2 })
    mocks.restoreRemovedMember.mockResolvedValue({ ok: true, restoredAssignments: 2, skipped: 0 })
    renderPanel({ projectId: PID, members, canManage: true })
    await user.click(screen.getByRole('button', { name: th.members.remove('Ivy') }))
    expect(await screen.findByText(th.members.assignmentsBlock.message(2))).toBeInTheDocument()
    expect(await screen.findByTestId('member-row-ivy')).toBeInTheDocument() // the optimistic removal reverts
    expect(mocks.undoPush).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: th.members.assignmentsBlock.unassignAll }))
    await waitFor(() => expect(mocks.undoPush).toHaveBeenCalledTimes(1))
    expect(mocks.removeMemberWithAssignments).toHaveBeenCalledWith({ projectId: PID, userId: 'ivy' })
    const [entry, opts] = mocks.undoPush.mock.calls[0] as [{ undo: () => Promise<void> }, { toast: string }]
    expect(opts).toEqual({ toast: th.members.assignmentsBlock.removedWithAssignments('Ivy', 2) })
    await entry.undo()
    expect(mocks.restoreRemovedMember).toHaveBeenCalledWith({ projectId: PID, userId: 'ivy', member, batch })
  })

  it('FR-404: "ยกเลิกการนำออก" keeps the member and calls nothing else', async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockResolvedValue({
      ok: true,
      removed: false,
      blockedByAssignments: 1,
      selfRemoved: false,
    })
    renderPanel({ projectId: PID, members, canManage: true })
    await user.click(screen.getByRole('button', { name: th.members.remove('Ivy') }))
    await user.click(await screen.findByRole('button', { name: th.members.assignmentsBlock.cancelRemove }))
    expect(mocks.removeMemberWithAssignments).not.toHaveBeenCalled()
    expect(await screen.findByTestId('member-row-ivy')).toBeInTheDocument()
  })

  it('self-removal navigates to /projects without an undo entry', async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockResolvedValue({
      ok: true,
      removedRole: 'LEAD',
      blockedByAssignments: 0,
      selfRemoved: true,
    })
    renderPanel({ projectId: PID, members, canManage: true })
    await user.click(screen.getByRole('button', { name: th.members.remove('Cindy') }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/projects'))
    expect(mocks.undoPush).not.toHaveBeenCalled()
  })

  it('a rejected role change shows the server message and reverts the select', async () => {
    const user = userEvent.setup()
    mocks.changeMemberRole.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: th.members.errors.lastLead,
    })
    renderPanel({ projectId: PID, members, canManage: true })
    const row = screen.getByTestId('member-row-cindy')
    await user.click(within(row).getByRole('combobox', { name: th.members.roleLabel }))
    await user.click(await screen.findByRole('option', { name: th.members.roles.MEMBER }))
    expect(await screen.findByText(th.members.errors.lastLead)).toBeInTheDocument()
    expect(mocks.changeMemberRole).toHaveBeenCalledWith({ projectId: PID, userId: 'cindy', role: 'MEMBER' })
    await waitFor(() =>
      expect(within(screen.getByTestId('member-row-cindy')).getByRole('combobox')).toHaveTextContent(
        th.members.roles.LEAD,
      ),
    )
  })

  it('a LEAD demoting themselves (M2-D19) keeps keyboard focus off <body> when the manage controls go away', async () => {
    const user = userEvent.setup()
    mocks.changeMemberRole.mockResolvedValue({ ok: true })
    const { rerender } = renderPanel({ projectId: PID, members, canManage: true })
    const select = within(screen.getByTestId('member-row-cindy')).getByRole('combobox', {
      name: th.members.roleLabel,
    })
    select.focus()
    await user.keyboard('{ArrowDown}')
    await user.click(await screen.findByRole('option', { name: th.members.roles.MEMBER }))
    await waitFor(() =>
      expect(mocks.changeMemberRole).toHaveBeenCalledWith({ projectId: PID, userId: 'cindy', role: 'MEMBER' }),
    )
    // the action's refresh(): the viewer is now a MEMBER and no longer manages the panel
    const demoted = members.map((m) => (m.userId === 'cindy' ? { ...m, role: 'MEMBER' as const } : m))
    rerender(
      <>
        <MembersPanel projectId={PID} members={demoted} canManage={false} />
        <Toaster />
      </>,
    )
    expect(screen.queryByRole('combobox', { name: th.members.roleLabel })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: th.members.heading })).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('losing manage rights leaves focus alone when it is not on <body>', () => {
    const { rerender } = renderBase(
      <>
        <button type="button">outside</button>
        <MembersPanel projectId={PID} members={members} canManage />
      </>,
    )
    const outside = screen.getByRole('button', { name: 'outside' })
    outside.focus()
    rerender(
      <>
        <button type="button">outside</button>
        <MembersPanel projectId={PID} members={members} canManage={false} />
      </>,
    )
    expect(outside).toHaveFocus()
  })

  it('adds a person from the picker, excluding current members', async () => {
    const user = userEvent.setup()
    mocks.addMember.mockResolvedValue({ ok: true, role: 'MEMBER' })
    renderPanel({ projectId: PID, members, canManage: true })
    const picker = screen.getByRole('combobox', { name: th.members.add })
    await user.type(picker, 'Ivy')
    expect(await screen.findByText(th.members.pickerEmpty)).toBeInTheDocument()
    await user.clear(picker)
    await user.type(picker, 'Jo')
    await user.click(await screen.findByRole('option', { name: /Jack/ }))
    await waitFor(() => expect(mocks.addMember).toHaveBeenCalledWith({ projectId: PID, userId: 'jack' }))
    expect(await screen.findByText(th.members.toasts.added('Jack'))).toBeInTheDocument()
  })

  it('removing with the keyboard moves focus to the next row, else the previous row (never <body>)', async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockReturnValue(new Promise(() => {})) // keep the optimistic removal on screen
    const { unmount } = renderPanel({ projectId: PID, members, canManage: true })
    // rows: cindy, ivy, mint, nok — removing Ivy focuses Mint's remove button
    screen.getByRole('button', { name: th.members.remove('Ivy') }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByTestId('member-row-ivy')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: th.members.remove('Mint') })).toHaveFocus()
    unmount()
    // the last row falls back to the previous row
    renderPanel({ projectId: PID, members, canManage: true })
    screen.getByRole('button', { name: th.members.remove('Nok') }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByTestId('member-row-nok')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: th.members.remove('Mint') })).toHaveFocus()
  })

  it('removing the only member moves focus to the add picker', async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockReturnValue(new Promise(() => {}))
    renderPanel({ projectId: PID, members: [member('ivy', 'Ivy I.', 'Ivy', 'LEAD')], canManage: true })
    screen.getByRole('button', { name: th.members.remove('Ivy') }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByTestId('member-row-ivy')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: th.members.add })).toHaveFocus()
  })

  it('a failed people directory shows an error and a retry, not "ไม่พบพนักงาน" (P4)', async () => {
    const user = userEvent.setup()
    mocks.getJson.mockRejectedValueOnce(new Error('network'))
    renderPanel({ projectId: PID, members, canManage: true })
    expect(await screen.findByText(th.members.pickerLoadError)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.common.retry }))
    await waitFor(() => expect(screen.queryByText(th.members.pickerLoadError)).not.toBeInTheDocument())
    await user.type(screen.getByRole('combobox', { name: th.members.add }), 'Jo')
    expect(await screen.findByRole('option', { name: /Jack/ })).toBeInTheDocument()
  })
})
