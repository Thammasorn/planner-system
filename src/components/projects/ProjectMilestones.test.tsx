import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { M, milestone, milestonesResponse } from '@/components/milestones/test-data.test.helper'
import { PID } from '@/components/tasks/fixtures.test.data'
import { ok, renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import type { ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import { qk } from '@/lib/query-keys'
import { ProjectMilestones } from './ProjectMilestones'

const a = vi.hoisted(() => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  restoreMilestoneBatch: vi.fn(),
  linkTasksToMilestone: vi.fn(),
  revertTaskMilestones: vi.fn(),
}))
vi.mock('@/server/actions/milestones', () => a)
const api = vi.hoisted(() => ({ getJson: vi.fn() }))
vi.mock('@/lib/api', () => api)

beforeEach(() => {
  for (const f of Object.values(a)) f.mockReset()
  api.getJson.mockReset()
})

const LIST = [
  milestone({
    id: M.kickoff,
    name: 'Kickoff',
    date: '2026-09-15',
    completedOn: '2026-09-15',
    status: 'DONE',
  }),
  milestone({
    id: M.cutover,
    name: 'Data cutover',
    date: '2026-10-02',
    status: 'DUE_SOON',
    late: true,
    lateTaskCount: 1,
    progress: { done: 1, total: 3 },
  }),
  milestone({
    id: M.uat,
    name: 'UAT sign-off',
    date: '2026-10-23',
    status: 'UPCOMING',
    description: 'ลูกค้าเซ็นรับ',
  }),
]

function renderSection(over: Partial<ProjectMilestonesResponse> = {}) {
  return renderTasks(<ProjectMilestones projectId={PID} />, {
    seed: (qc) => qc.setQueryData(qk.projectMilestones(PID), milestonesResponse(LIST, over)),
  })
}

it('FR-409 / M8-D17: not-DONE by date, then DONE last; status, progress, late count and description', () => {
  renderSection()
  const list = screen.getByRole('list', { name: th.milestones.overview.listLabel })
  const items = within(list).getAllByRole('listitem')
  expect(items.map((i) => within(i).getByTestId('milestone-name').textContent)).toEqual([
    'Data cutover',
    'UAT sign-off',
    'Kickoff',
  ])
  const late = items[0]!
  expect(within(late).getByText(th.milestones.status.DUE_SOON)).toBeInTheDocument()
  expect(within(late).getByText(formatThaiDate('2026-10-02', 'medium'))).toBeInTheDocument()
  expect(within(late).getByText(th.milestones.progress(1, 3))).toBeInTheDocument()
  expect(within(late).getByText('เลย milestone 1 งาน')).toBeInTheDocument()
  expect(within(items[1]!).getByText('ลูกค้าเซ็นรับ')).toBeInTheDocument()
  expect(within(items[2]!).getByText(th.milestones.status.DONE)).toBeInTheDocument()
  expect(within(items[2]!).getByTestId('milestone-name')).toHaveStyle({ textDecoration: 'line-through' })
})

it('a member sees no add / edit / delete / checkbox and the read-only caption', () => {
  renderSection({ canManage: false })
  expect(screen.queryByRole('button', { name: th.milestones.overview.add })).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: th.milestones.overview.edit('Kickoff') }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: th.milestones.overview.remove('Kickoff') }),
  ).not.toBeInTheDocument()
  expect(screen.getByText(th.milestones.overview.readOnly)).toBeInTheDocument()
})

it('P2: delete as lead calls deleteMilestone with no dialog in the DOM', async () => {
  const user = userEvent.setup()
  a.deleteMilestone.mockReturnValue(
    ok({ projectId: PID, milestoneId: M.uat, name: 'UAT sign-off', batch: M.beta, unlinkedTaskCount: 0 }),
  )
  renderSection()
  await user.click(screen.getByRole('button', { name: th.milestones.overview.remove('UAT sign-off') }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(a.deleteMilestone).toHaveBeenCalledWith({ milestoneId: M.uat }))
  expect(await screen.findByText(th.milestones.toast.deleted('UAT sign-off'))).toBeInTheDocument()
})

it('the checkbox completes a milestone', async () => {
  const user = userEvent.setup()
  a.updateMilestone.mockReturnValue(new Promise(() => {}))
  renderSection()
  await user.click(
    screen.getByRole('checkbox', { name: th.milestones.overview.completeToggle('UAT sign-off') }),
  )
  expect(a.updateMilestone).toHaveBeenCalledWith({ milestoneId: M.uat, patch: { completed: true } })
})

it('add opens the inline form with an empty date; edit sends only the changed fields', async () => {
  const user = userEvent.setup()
  a.updateMilestone.mockReturnValue(new Promise(() => {}))
  renderSection()
  await user.click(screen.getByRole('button', { name: th.milestones.overview.add }))
  expect(screen.getByRole('textbox', { name: th.milestones.fields.name })).toHaveValue('')
  await user.click(screen.getByRole('button', { name: th.milestones.form.cancel }))
  await user.click(screen.getByRole('button', { name: th.milestones.overview.edit('UAT sign-off') }))
  const name = screen.getByRole('textbox', { name: th.milestones.fields.name })
  await user.clear(name)
  await user.type(name, 'UAT{Enter}')
  expect(a.updateMilestone).toHaveBeenCalledWith({ milestoneId: M.uat, patch: { name: 'UAT' } })
})

it('empty → the empty state', () => {
  renderTasks(<ProjectMilestones projectId={PID} />, {
    seed: (qc) => qc.setQueryData(qk.projectMilestones(PID), milestonesResponse([])),
  })
  expect(screen.getByText(th.milestones.overview.empty)).toBeInTheDocument()
})

it('the add button shows its plus once (icon only, no "+" in the label)', () => {
  renderSection()
  const add = screen.getByRole('button', { name: th.milestones.overview.add })
  expect(th.milestones.overview.add.trimStart().startsWith('+')).toBe(false)
  expect(add.textContent?.trim().startsWith('+')).toBe(false)
  expect(add.querySelector('svg')).not.toBeNull()
})

it('loading: shows a loading line while the list is pending (not an empty section)', () => {
  api.getJson.mockReturnValue(new Promise(() => {}))
  renderTasks(<ProjectMilestones projectId={PID} />)
  expect(screen.getByRole('status')).toHaveTextContent(th.common.loading)
  expect(screen.queryByText(th.milestones.overview.empty)).toBeNull()
})

it('load error: says so (not "no milestones") and ลองอีกครั้ง refetches', async () => {
  const user = userEvent.setup()
  api.getJson.mockRejectedValueOnce(new Error('boom'))
  api.getJson.mockResolvedValueOnce(milestonesResponse(LIST))
  renderTasks(<ProjectMilestones projectId={PID} />)
  expect(await screen.findByText(th.milestones.overview.loadError)).toBeInTheDocument()
  expect(screen.queryByText(th.milestones.overview.empty)).toBeNull()
  await user.click(screen.getByRole('button', { name: th.common.retry }))
  expect(await screen.findByText('Kickoff')).toBeInTheDocument()
  expect(screen.queryByText(th.milestones.overview.loadError)).toBeNull()
  expect(api.getJson).toHaveBeenCalledTimes(2)
})
