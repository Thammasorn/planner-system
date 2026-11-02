import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { PID } from '@/components/tasks/fixtures.test.data'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import { MilestoneDialog } from './MilestoneDialog'

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

it('loading: the body says so while the targets load (not a blank dialog)', () => {
  api.getJson.mockReturnValue(new Promise(() => {}))
  renderTasks(<MilestoneDialog open onClose={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent(th.common.loading)
  expect(screen.getByRole('button', { name: th.milestones.form.cancel })).toBeInTheDocument()
})

it('load error: an alert with ลองอีกครั้ง that refetches into the form', async () => {
  const user = userEvent.setup()
  api.getJson.mockRejectedValueOnce(new Error('boom'))
  api.getJson.mockResolvedValueOnce({ projects: [{ id: PID, name: 'ERP', color: '#000' }] })
  renderTasks(<MilestoneDialog open onClose={vi.fn()} />)
  expect(await screen.findByText(th.milestones.form.targetsError)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: th.common.retry }))
  expect(await screen.findByRole('textbox', { name: th.milestones.fields.name })).toBeInTheDocument()
  expect(screen.queryByText(th.milestones.form.targetsError)).toBeNull()
  expect(api.getJson).toHaveBeenCalledTimes(2)
})

it('no manageable projects: an explanation instead of a form with an empty project select', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  api.getJson.mockResolvedValue({ projects: [] })
  renderTasks(<MilestoneDialog open onClose={onClose} />)
  expect(await screen.findByText(th.milestones.form.noTargets)).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: th.milestones.fields.name })).toBeNull()
  await user.click(screen.getByRole('button', { name: th.milestones.form.cancel }))
  expect(onClose).toHaveBeenCalled()
})
