import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { PID, T, response } from '@/components/tasks/fixtures.test.data'
import { ok, renderTasks } from '@/components/tasks/render.test.helper'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { qk } from '@/lib/query-keys'
import type { MilestonePatch } from '@/lib/schemas/milestones'
import { M, milestone, milestonesResponse } from './test-data.test.helper'
import { useMilestoneMutations } from './useMilestoneMutations'

const a = vi.hoisted(() => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  restoreMilestoneBatch: vi.fn(),
  linkTasksToMilestone: vi.fn(),
  revertTaskMilestones: vi.fn(),
}))
vi.mock('@/server/actions/milestones', () => a)

const BATCH = '00000000-0000-4000-8000-000000000999'
const beta = milestone({ id: M.beta, name: 'Beta', date: '2026-11-13' })
const betaRef: MilestoneRef = { id: M.beta, name: 'Beta', date: '2026-11-13', completedOn: null }
const key = { id: M.beta, projectId: PID, name: 'Beta' }

function Harness({ patch, linkIds = [T.a, T.c] }: { patch?: MilestonePatch; linkIds?: string[] }) {
  const ms = useMilestoneMutations()
  const undo = useUndo()
  return (
    <>
      <button type="button" onClick={() => void ms.remove(key)}>
        remove
      </button>
      <button type="button" onClick={() => void ms.update(key, patch ?? {})}>
        update
      </button>
      <button type="button" onClick={() => void ms.link(PID, linkIds, betaRef, { toast: true })}>
        link
      </button>
      <button
        type="button"
        onClick={() =>
          void ms.create({ projectId: PID, name: 'Beta', date: '2026-11-13', description: null })
        }
      >
        create
      </button>
      <button type="button" onClick={() => void undo.undo()}>
        undo
      </button>
    </>
  )
}

const seed = (qc: import('@tanstack/react-query').QueryClient) =>
  qc.setQueryData(qk.projectMilestones(PID), milestonesResponse([beta]))

beforeEach(() => {
  for (const f of Object.values(a)) f.mockReset()
})

it('FR-708: remove drops the row, toasts deletedUnlinked, and one undo entry restores the batch', async () => {
  const user = userEvent.setup()
  a.deleteMilestone.mockReturnValue(
    ok({ projectId: PID, milestoneId: M.beta, name: 'Beta', batch: BATCH, unlinkedTaskCount: 2 }),
  )
  a.restoreMilestoneBatch.mockReturnValue(ok({ milestone: beta }))
  const { qc } = renderTasks(<Harness />, { seed })
  await user.click(screen.getByRole('button', { name: 'remove' }))
  expect(await screen.findByText(th.milestones.toast.deletedUnlinked('Beta', 2))).toBeInTheDocument()
  expect(a.deleteMilestone).toHaveBeenCalledWith({ milestoneId: M.beta })
  expect(document.querySelector('[role="dialog"]')).toBeNull() // P2: no confirm
  await user.click(screen.getByRole('button', { name: 'undo' }))
  await waitFor(() => expect(a.restoreMilestoneBatch).toHaveBeenCalledWith({ batch: BATCH }))
  expect(qc.getQueryState(qk.projectMilestones(PID))?.isInvalidated).toBe(true)
})

it('FR-708: a failed restore reads restoreFailed(reason)', async () => {
  const user = userEvent.setup()
  a.deleteMilestone.mockReturnValue(
    ok({ projectId: PID, milestoneId: M.beta, name: 'Beta', batch: BATCH, unlinkedTaskCount: 0 }),
  )
  a.restoreMilestoneBatch.mockResolvedValue({
    ok: false,
    code: 'VALIDATION',
    message: th.milestones.errors.restoreExpired,
  })
  renderTasks(<Harness />, { seed })
  await user.click(screen.getByRole('button', { name: 'remove' }))
  expect(await screen.findByText(th.milestones.toast.deleted('Beta'))).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'undo' }))
  expect(
    await screen.findByText(th.milestones.toast.restoreFailed(th.milestones.errors.restoreExpired)),
  ).toBeInTheDocument()
})

it('FR-707: a date update pushes moved and its undo sends the previous date', async () => {
  const user = userEvent.setup()
  const moved = { ...beta, date: '2026-11-20' }
  a.updateMilestone.mockReturnValue(
    ok({
      milestone: moved,
      previous: { name: 'Beta', date: '2026-11-13', description: null, completed: false, completedOn: null },
      changed: ['date'],
    }),
  )
  const { qc } = renderTasks(<Harness patch={{ date: '2026-11-20' }} />, { seed })
  await user.click(screen.getByRole('button', { name: 'update' }))
  expect(
    await screen.findByText(th.milestones.toast.moved('Beta', formatThaiDate('2026-11-20'))),
  ).toBeInTheDocument()
  expect(
    qc.getQueryData<{ milestones: { date: string }[] }>(qk.projectMilestones(PID))?.milestones[0]?.date,
  ).toBe('2026-11-20')
  await user.click(screen.getByRole('button', { name: 'undo' }))
  await waitFor(() =>
    expect(a.updateMilestone).toHaveBeenLastCalledWith({
      milestoneId: M.beta,
      patch: { date: '2026-11-13' },
    }),
  )
})

it('M11.1 FR-709: a colour change patches the cache at once, toasts recoloured with เลิกทำ, undo sends the previous colour', async () => {
  const user = userEvent.setup()
  a.updateMilestone.mockReturnValue(
    ok({
      milestone: { ...beta, color: 'RED' },
      previous: {
        name: 'Beta',
        date: '2026-11-13',
        description: null,
        completed: false,
        completedOn: null,
        color: 'PURPLE',
      },
      changed: ['color'],
    }),
  )
  const { qc } = renderTasks(<Harness patch={{ color: 'RED' }} />, { seed })
  await user.click(screen.getByRole('button', { name: 'update' }))
  expect(
    await screen.findByText(th.milestones.toast.recoloured('Beta', th.milestones.color.name.RED)),
  ).toBeInTheDocument()
  expect(
    qc.getQueryData<{ milestones: { color: string }[] }>(qk.projectMilestones(PID))?.milestones[0]?.color,
  ).toBe('RED')
  await user.click(screen.getByRole('button', { name: 'undo' }))
  await waitFor(() =>
    expect(a.updateMilestone).toHaveBeenLastCalledWith({ milestoneId: M.beta, patch: { color: 'PURPLE' } }),
  )
})

it('M8-D19: reopening a milestone completed on 2026-09-16 → undo sends that exact completedOn', async () => {
  const user = userEvent.setup()
  a.updateMilestone.mockReturnValue(
    ok({
      milestone: { ...beta, completedOn: null },
      previous: {
        name: 'Beta',
        date: '2026-11-13',
        description: null,
        completed: true,
        completedOn: '2026-09-16',
      },
      changed: ['completed'],
    }),
  )
  renderTasks(<Harness patch={{ completed: false }} />, { seed })
  await user.click(screen.getByRole('button', { name: 'update' }))
  expect(await screen.findByText(th.milestones.toast.reopened('Beta'))).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'undo' }))
  await waitFor(() =>
    expect(a.updateMilestone).toHaveBeenLastCalledWith({
      milestoneId: M.beta,
      patch: { completedOn: '2026-09-16' },
    }),
  )
})

it('M3: a rename pushes no undo entry and no toast', async () => {
  const user = userEvent.setup()
  a.updateMilestone.mockReturnValue(
    ok({
      milestone: { ...beta, name: 'Beta 2' },
      previous: { name: 'Beta', date: '2026-11-13', description: null, completed: false, completedOn: null },
      changed: ['name'],
    }),
  )
  renderTasks(<Harness patch={{ name: 'Beta 2' }} />, { seed })
  await user.click(screen.getByRole('button', { name: 'update' }))
  await waitFor(() => expect(a.updateMilestone).toHaveBeenCalledTimes(1))
  await user.click(screen.getByRole('button', { name: 'undo' }))
  expect(a.updateMilestone).toHaveBeenCalledTimes(1)
})

it('FR-614: link with toast shows linked(2, Beta), patches the task cache, undo reverts to the previous ids', async () => {
  const user = userEvent.setup()
  a.linkTasksToMilestone.mockReturnValue(
    ok({
      projectId: PID,
      milestoneId: M.beta,
      milestoneName: 'Beta',
      changed: [
        { taskId: T.a, taskName: 'ออกแบบ', previousMilestoneId: null },
        { taskId: T.c, taskName: 'งาน C', previousMilestoneId: M.uat },
      ],
    }),
  )
  a.revertTaskMilestones.mockReturnValue(ok({ projectId: PID, changed: [] }))
  let resolveLink = () => {}
  a.linkTasksToMilestone.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolveLink = () =>
          r({
            ok: true,
            projectId: PID,
            milestoneId: M.beta,
            milestoneName: 'Beta',
            changed: [
              { taskId: T.a, taskName: 'ออกแบบ', previousMilestoneId: null },
              { taskId: T.c, taskName: 'งาน C', previousMilestoneId: M.uat },
            ],
          })
      }),
  )
  const { qc } = renderTasks(<Harness />, { data: response(), seed })
  await user.click(screen.getByRole('button', { name: 'link' }))
  await waitFor(() =>
    expect(
      qc.getQueryData<ProjectTasksResponse>(qk.projectTasks(PID))?.tasks.find((t) => t.id === T.a)
        ?.milestoneId,
    ).toBe(M.beta),
  )
  resolveLink()
  expect(await screen.findByText(th.milestones.toast.linked(2, 'Beta'))).toBeInTheDocument()
  expect(a.linkTasksToMilestone).toHaveBeenCalledWith({ taskIds: [T.a, T.c], milestoneId: M.beta })
  await user.click(screen.getByRole('button', { name: 'undo' }))
  await waitFor(() =>
    expect(a.revertTaskMilestones).toHaveBeenCalledWith({
      items: [
        { taskId: T.a, milestoneId: null },
        { taskId: T.c, milestoneId: M.uat },
      ],
    }),
  )
})

it('FR-702: create inserts the milestone and toasts created; undo deletes it', async () => {
  const user = userEvent.setup()
  const fresh = milestone({ id: M.kickoff, name: 'Beta', date: '2026-11-13' })
  a.createMilestone.mockReturnValue(ok({ milestone: fresh }))
  a.deleteMilestone.mockReturnValue(
    ok({ projectId: PID, milestoneId: M.kickoff, name: 'Beta', batch: BATCH, unlinkedTaskCount: 0 }),
  )
  const { qc } = renderTasks(<Harness />, {
    seed: (c) => c.setQueryData(qk.projectMilestones(PID), milestonesResponse([])),
  })
  await user.click(screen.getByRole('button', { name: 'create' }))
  expect(await screen.findByText(th.milestones.toast.created('Beta'))).toBeInTheDocument()
  expect(a.createMilestone).toHaveBeenCalledWith({
    projectId: PID,
    name: 'Beta',
    date: '2026-11-13',
    description: null,
  })
  expect(
    qc.getQueryData<{ milestones: { id: string }[] }>(qk.projectMilestones(PID))?.milestones.map((m) => m.id),
  ).toEqual([M.kickoff])
  await user.click(screen.getByRole('button', { name: 'undo' }))
  await waitFor(() => expect(a.deleteMilestone).toHaveBeenCalledWith({ milestoneId: M.kickoff }))
})

it('an action failure shows the Thai message and rolls the cache back', async () => {
  const user = userEvent.setup()
  a.deleteMilestone.mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: th.errors.FORBIDDEN })
  const { qc } = renderTasks(<Harness />, { seed })
  await user.click(screen.getByRole('button', { name: 'remove' }))
  expect(await screen.findByText(th.errors.FORBIDDEN)).toBeInTheDocument()
  expect(qc.getQueryData<{ milestones: unknown[] }>(qk.projectMilestones(PID))?.milestones).toHaveLength(1)
})
