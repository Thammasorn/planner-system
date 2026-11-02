import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import { displayName } from '@/lib/display-name'
import { PEOPLE } from './fixtures.test.data'
import { renderTasks } from './render.test.helper'
import { TaskToolbar } from './TaskToolbar'

const members: PersonOption[] = PEOPLE.people.slice(0, 2).map((p) => ({ ...p, positionId: null }))

function label(text: string): HTMLElement {
  const el = [...document.querySelectorAll<HTMLElement>('label')].find((l) => l.textContent === text)
  if (!el) throw new Error(`no label ${text}`)
  return el
}

it('board assignee filter: "ทุกคน" keeps the floating label notched above the value (no overlap, §8.12)', () => {
  renderTasks(
    <TaskToolbar members={members} assigneeId={null} onAssignee={vi.fn()} onMilestone={vi.fn()} />,
    {
      prefs: { 'tasks.view': 'BOARD' },
    },
  )
  expect(label(th.tasks.board.assignee)).toHaveAttribute('data-shrink', 'true')
  expect(screen.getByRole('combobox', { name: th.tasks.board.assignee })).toHaveTextContent(
    th.tasks.board.allAssignees,
  )
})

it('board assignee filter: picking a member passes its id, "ทุกคน" passes null', async () => {
  const user = userEvent.setup()
  const onAssignee = vi.fn()
  renderTasks(<TaskToolbar members={members} assigneeId={null} onAssignee={onAssignee} />, {
    prefs: { 'tasks.view': 'BOARD' },
  })
  await user.click(screen.getByRole('combobox', { name: th.tasks.board.assignee }))
  await user.click(within(screen.getByRole('listbox')).getByText(displayName(members[1]!)))
  expect(onAssignee).toHaveBeenLastCalledWith('ivy')
})

it('board assignee filter: back to "ทุกคน" passes null', async () => {
  const user = userEvent.setup()
  const onAssignee = vi.fn()
  renderTasks(<TaskToolbar members={members} assigneeId="ivy" onAssignee={onAssignee} />, {
    prefs: { 'tasks.view': 'BOARD' },
  })
  expect(label(th.tasks.board.assignee)).toHaveAttribute('data-shrink', 'true')
  await user.click(screen.getByRole('combobox', { name: th.tasks.board.assignee }))
  await user.click(within(screen.getByRole('listbox')).getByText(th.tasks.board.allAssignees))
  expect(onAssignee).toHaveBeenLastCalledWith(null)
})
