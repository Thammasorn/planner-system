import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { PID, response, T } from './fixtures.test.data'
import { ok, renderTasks } from './render.test.helper'
import { AssigneeAddButton, AssigneePicker } from './AssigneePicker'

const a = vi.hoisted(() => ({ assign: vi.fn() }))
vi.mock('@/server/actions/assignments', () => ({
  assign: a.assign,
  unassign: vi.fn(),
  restoreAssignmentBatch: vi.fn(),
}))
vi.mock('@/server/actions/tasks', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const members = new Set(['cindy', 'ivy'])

async function openList(canManage: boolean) {
  const user = userEvent.setup()
  renderTasks(
    <AssigneePicker
      projectId={PID}
      taskId={T.b}
      projectMemberIds={members}
      assignedUserIds={new Set()}
      canManage={canManage}
    />,
    { data: response() },
  )
  await user.click(screen.getByRole('combobox', { name: th.tasks.picker.label }))
  return { user, options: await screen.findAllByRole('option') }
}

describe('AssigneePicker (FR-605, BR-60, AC-203)', () => {
  it('MEMBER: only project members, no hint', async () => {
    const { options } = await openList(false)
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('Cindy')
    expect(options[1]).toHaveTextContent('Ivy')
    expect(screen.queryByText(th.tasks.picker.willBecomeMember)).toBeNull()
  })

  it('LEAD: everyone active; non-members carry the hint; deactivated people are absent', async () => {
    const { options } = await openList(true)
    expect(options).toHaveLength(3)
    const jack = options.find((o) => o.textContent?.includes('Jack'))!
    expect(within(jack).getByText(th.tasks.picker.willBecomeMember)).toBeInTheDocument()
    const ivy = options.find((o) => o.textContent?.includes('Ivy'))!
    expect(within(ivy).queryByText(th.tasks.picker.willBecomeMember)).toBeNull()
    expect(options.some((o) => o.textContent?.includes('Nok'))).toBe(false)
  })

  it('two picks without reopening assign twice', async () => {
    a.assign.mockImplementation((v: { taskIds: string[]; userId: string }) =>
      ok({
        projectId: PID,
        created: [{ assignmentId: crypto.randomUUID(), taskId: v.taskIds[0]! }],
        addedMember: false,
        skippedParentIds: [],
        alreadyAssignedIds: [],
      }),
    )
    const { user } = await openList(true)
    await user.click(screen.getByRole('option', { name: /Jack/ }))
    await user.click(await screen.findByRole('option', { name: /Cindy/ }))
    await waitFor(() => expect(a.assign).toHaveBeenCalledTimes(2))
    expect(a.assign).toHaveBeenNthCalledWith(1, { taskIds: [T.b], userId: 'jack' })
    expect(a.assign).toHaveBeenNthCalledWith(2, { taskIds: [T.b], userId: 'cindy' })
  })

  it('"+ คน" popover: one Escape closes the whole picker while its list is open (keepOpen)', async () => {
    const user = userEvent.setup()
    renderTasks(
      <AssigneeAddButton
        projectId={PID}
        taskId={T.b}
        projectMemberIds={members}
        assignedUserIds={new Set()}
        canManage
      />,
      { data: response() },
    )
    await user.click(screen.getByRole('button', { name: th.tasks.panel.addAssignee }))
    const dialog = await screen.findByRole('dialog', { name: th.tasks.picker.label })
    expect(await within(dialog).findByRole('combobox', { name: th.tasks.picker.label })).toHaveFocus()
    expect(await screen.findAllByRole('option')).not.toHaveLength(0)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: th.tasks.picker.label })).toBeNull())
  })
})
