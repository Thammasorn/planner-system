// FR-661 (M8-D15): the shared card's optional `milestone` prop — absent renders exactly as M3 (M9/M10 call sites).
import { screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { TaskCard as TaskCardDTO } from '@/lib/contracts/tasks'
import { PID, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TaskCard } from './TaskCard'

vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const card: TaskCardDTO = {
  id: T.c,
  projectId: PID,
  name: 'งาน C',
  parentPath: [],
  status: STATUSES[0]!,
  assigneeIds: [],
  dueDate: null,
  certainty: 'CONFIRMED',
  completed: false,
  blockers: { open: 0, total: 0 },
  hasBody: false,
  milestoneId: null,
}

const render = (milestone?: { name: string; late: boolean } | null) =>
  renderTasks(
    <TaskCard
      card={card}
      statuses={STATUSES}
      canEdit
      onOpen={vi.fn()}
      onPickStatus={vi.fn()}
      onToggleDone={vi.fn()}
      {...(milestone !== undefined ? { milestone } : {})}
    />,
  )

it('no milestone prop → no ◆ line', () => {
  render()
  expect(within(screen.getByRole('article')).queryByText(/◆/)).toBeNull()
})

it('◆ name on its own line; ⚠ เลย milestone only when late', () => {
  render({ name: 'UAT sign-off', late: true })
  const a = within(screen.getByRole('article'))
  expect(a.getByText(th.milestones.tasks.cardLabel('UAT sign-off'))).toBeInTheDocument()
  expect(a.getByText(th.milestones.late)).toBeInTheDocument()
})

it('not late → name only', () => {
  render({ name: 'UAT sign-off', late: false })
  expect(screen.queryByText(th.milestones.late)).toBeNull()
})
