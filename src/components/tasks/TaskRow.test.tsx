import { screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { buildTaskRows } from '@/lib/tasks/tree'
import { PID, STATUSES, T, task } from './fixtures.test.data'
import { renderTasks } from './render.test.helper'
import { TaskRow, type TaskRowActions, type TaskRowProps } from './TaskRow'

const actions: TaskRowActions = {
  select: vi.fn(),
  toggleExpand: vi.fn(),
  toggleDone: vi.fn(),
  rename: vi.fn(() => Promise.resolve()),
  openStatus: vi.fn(),
  openPanel: vi.fn(),
  unassign: vi.fn(),
  addSubtask: vi.fn(),
  moveUp: vi.fn(),
  moveDown: vi.fn(),
  indent: vi.fn(),
  outdent: vi.fn(),
  remove: vi.fn(),
  quickAddBelow: vi.fn(),
}

function props(over: Partial<TaskRowProps> = {}): TaskRowProps {
  const row = buildTaskRows([task({ id: T.a, name: 'ออกแบบ', position: 'a0' })])[0]!
  return {
    row,
    rowKey: `all|${T.a}`,
    depth: 0,
    focused: true,
    selected: false,
    expanded: true,
    ops: true,
    canEdit: false,
    canManage: false,
    showPath: false,
    status: STATUSES[0],
    certainty: 'CONFIRMED',
    blockerNames: [],
    unionUserIds: [],
    people: new Map(),
    projectId: PID,
    memberIds: new Set(),
    actions,
    ...over,
  }
}

// A11Y-1 (SPEC §8.9): an invalid drop target is shown by an icon *and* text, never by colour alone.
it('an invalid drop shows the block icon and the dropInvalid text on the row', () => {
  renderTasks(<TaskRow {...props({ invalid: true })} />)
  const r = screen.getByRole('row', { name: 'ออกแบบ' })
  expect(within(r).getByText(th.tasks.dropInvalid)).toBeVisible()
  expect(within(r).getByTestId('BlockOutlinedIcon')).toHaveAttribute('aria-hidden', 'true')
})

it('a valid position shows neither', () => {
  renderTasks(<TaskRow {...props()} />)
  expect(screen.queryByText(th.tasks.dropInvalid)).toBeNull()
  expect(screen.queryByTestId('BlockOutlinedIcon')).toBeNull()
})
