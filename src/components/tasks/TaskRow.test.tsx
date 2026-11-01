import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  openPage: vi.fn(),
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

// M6.1-D17 / FR-685: ↗ is a real link (Cmd/Ctrl/middle-click = new tab) and is never a row click.
it('↗ links to /t/<id> and its click neither selects nor opens the panel', async () => {
  renderTasks(<TaskRow {...props()} />)
  const link = within(screen.getByRole('row', { name: 'ออกแบบ' })).getByRole('link', {
    name: th.tasks.openAsPage,
  })
  expect(link).toHaveAttribute('href', `/t/${T.a}`)
  expect(link).toHaveAttribute('tabindex', '-1')
  link.addEventListener('click', (e) => e.preventDefault()) // jsdom has no navigation
  await userEvent.click(link, { skipHover: true })
  expect(actions.select).not.toHaveBeenCalled()
  expect(actions.openPanel).not.toHaveBeenCalled()
})

it('a plain click on the row selects it (TaskList opens the panel there)', async () => {
  renderTasks(<TaskRow {...props()} />)
  await userEvent.click(screen.getByRole('row', { name: 'ออกแบบ' }))
  expect(actions.select).toHaveBeenCalled()
})

it('FR-691: 📄 when hasBody', () => {
  const row = buildTaskRows([task({ id: T.a, name: 'ออกแบบ', position: 'a0', hasBody: true })])[0]!
  renderTasks(<TaskRow {...props({ row })} />)
  expect(screen.getByRole('img', { name: th.tasks.hasBody })).toBeInTheDocument()
})
