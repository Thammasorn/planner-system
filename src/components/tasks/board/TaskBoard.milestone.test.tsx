import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { M } from '@/components/milestones/test-data.test.helper'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import { PID, response, S, STATUSES, T } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { TasksView } from '../TasksView'

vi.mock('@/server/actions/tasks', () => ({}))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))
vi.mock('@/server/actions/allocations', () => ({}))
vi.mock('@/server/actions/milestones', () => ({}))
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/components/editor/TaskBody', () => ({ TaskBody: () => null }))

const MILESTONES: MilestoneRef[] = [
  { id: M.uat, name: 'UAT sign-off', date: '2026-10-23', completedOn: null },
]

function renderBoard() {
  const data = response({ milestones: MILESTONES })
  data.tasks = data.tasks.map((t) =>
    t.id === T.c
      ? { ...t, milestoneId: M.uat, lateForMilestone: true, statusId: S.doing }
      : t.id === T.d
        ? { ...t, milestoneId: M.uat }
        : t,
  )
  return renderTasks(<TasksView projectId={PID} />, { data, prefs: { 'tasks.view': 'BOARD' } })
}

beforeEach(() => window.history.replaceState(null, '', '/projects/p/tasks'))

it('FR-661: a bound card shows "◆ UAT sign-off" (+ เลย milestone when late); unbound cards show none', () => {
  renderBoard()
  const late = within(screen.getByRole('article', { name: 'งาน C' }))
  expect(late.getByText('◆ UAT sign-off')).toBeInTheDocument()
  expect(late.getByText(th.milestones.late)).toBeInTheDocument()
  const bound = within(screen.getByRole('article', { name: 'งาน D' }))
  expect(bound.getByText('◆ UAT sign-off')).toBeInTheDocument()
  expect(bound.queryByText(th.milestones.late)).toBeNull()
  expect(within(screen.getByRole('article', { name: 'ออกแบบ' })).queryByText(/◆/)).toBeNull()
})

it('FR-663: filter = that milestone leaves only its cards and the column counts follow; ไม่ผูก the rest', async () => {
  const user = userEvent.setup()
  renderBoard()
  await user.click(screen.getByRole('combobox', { name: th.milestones.tasks.filter }))
  await user.click(screen.getByRole('option', { name: th.milestones.tasks.cardLabel('UAT sign-off') }))
  expect(screen.getAllByRole('article').map((c) => c.getAttribute('aria-label'))).toEqual(['งาน D', 'งาน C'])
  expect(screen.getByRole('group', { name: th.tasks.board.column(STATUSES[0]!.name, 1) })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: th.tasks.board.column(STATUSES[1]!.name, 1) })).toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: th.milestones.tasks.filter }))
  await user.click(screen.getByRole('option', { name: th.milestones.none }))
  expect(screen.getAllByRole('article').map((c) => c.getAttribute('aria-label'))).toEqual([
    'ออกแบบ',
    'ย่อย B',
  ])
})
