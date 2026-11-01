import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PlanAssignmentRangeOk, PlanRangeWeek } from '@/lib/contracts/grid'
import { PID } from '../fixtures.test.data'
import { renderTasks } from '../render.test.helper'
import { PlanRangeDialog } from './PlanRangeDialog'

const a = vi.hoisted(() => ({ planAssignmentRange: vi.fn(), saveAllocations: vi.fn() }))
vi.mock('@/server/actions/allocations', () => a)
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const TA = '9b1c2c38-5a8e-4a6c-9a0e-0000000000aa'
const NULL_STATE = { cd: 0, resolution: null } as const

const week = (w: string, kind: PlanRangeWeek['kind'], cd: number): PlanRangeWeek => ({
  week: w,
  kind,
  before: NULL_STATE,
  after: kind === 'WHOLE' ? { cd, resolution: 'WEEK' } : { cd, resolution: 'DAY', days: { [w]: cd } },
  capacityCd: kind === 'WHOLE' ? 500 : 300,
})

const okPreview = (applied: boolean): { ok: true } & PlanAssignmentRangeOk => ({
  ok: true,
  preview: {
    version: 3,
    weeks: [week('2026-11-09', 'BOUNDARY', 300), week('2026-11-16', 'WHOLE', 500), week('2026-11-23', 'BOUNDARY', 200)],
    totalCd: 1000,
    capacityCd: 1000,
    overCapacityCd: 0,
    warnings: [],
  },
  applied: applied
    ? { taskAssignmentId: TA, version: 4, weeks: {}, rowTotal: { total: 1000, committed: 1000 } }
    : null,
})

/** Closes like TaskPanel does, so the page (and its toasts) leave the modal's aria-hidden state. */
function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <PlanRangeDialog
      open={open}
      onClose={() => {
        onClose()
        setOpen(false)
      }}
      taskAssignmentId={TA}
      personName="Ivy"
      taskName="ลูก 2"
      projectId={PID}
      defaultStart="2026-11-11"
      defaultEnd="2026-11-24"
    />
  )
}

function setup() {
  const onClose = vi.fn()
  const utils = renderTasks(<Harness onClose={onClose} />)
  const dialog = screen.getByRole('dialog', { name: th.plan.title('Ivy', 'ลูก 2') })
  const total = within(dialog).getByRole('textbox', { name: th.plan.totalLabel })
  const apply = within(dialog).getByRole('button', { name: th.plan.apply })
  return { ...utils, onClose, dialog, total, apply }
}

beforeEach(() => {
  a.planAssignmentRange.mockReset()
  a.saveAllocations.mockReset()
})

describe('PlanRangeDialog (FR-612, BR-25, M6-D6)', () => {
  it('typing 10 previews once after the debounce with totalCd 1000 and renders the three weeks', async () => {
    const user = userEvent.setup()
    a.planAssignmentRange.mockResolvedValue(okPreview(false))
    const { dialog, total, apply } = setup()
    expect(apply).toBeDisabled()
    await user.type(total, '10')
    const table = await within(dialog).findByRole('table', { name: th.plan.preview })
    expect(a.planAssignmentRange).toHaveBeenCalledTimes(1)
    expect(a.planAssignmentRange).toHaveBeenCalledWith(
      expect.objectContaining({
        taskAssignmentId: TA,
        baseVersion: null,
        totalCd: 1000,
        start: '2026-11-11',
        end: '2026-11-24',
        dryRun: true,
      }),
    )
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[1]!.textContent)).toEqual([
      th.plan.kind.BOUNDARY,
      th.plan.kind.WHOLE,
      th.plan.kind.BOUNDARY,
    ])
    expect(within(dialog).getByText(th.plan.capacityInRange('10.0'))).toBeInTheDocument()
    expect(apply).toBeEnabled()
  })

  it("'abc' shows the format hint and keeps apply disabled without calling the server", async () => {
    const user = userEvent.setup()
    const { dialog, total, apply } = setup()
    await user.type(total, 'abc')
    expect(within(dialog).getByText(th.plan.errors.invalidTotal)).toBeInTheDocument()
    expect(apply).toBeDisabled()
    expect(a.planAssignmentRange).not.toHaveBeenCalled()
  })

  it('UNREPRESENTABLE from the server shows the inline alert and disables apply', async () => {
    const user = userEvent.setup()
    a.planAssignmentRange.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: th.plan.errors.unrepresentable,
      issues: [{ taskAssignmentId: TA, period: '2026-11-09', reason: 'UNREPRESENTABLE' }],
    })
    const { dialog, total, apply } = setup()
    await user.type(total, '40')
    expect(await within(dialog).findByText(th.plan.errors.unrepresentable)).toBeInTheDocument()
    expect(apply).toBeDisabled()
  })

  it('apply sends the preview version, pushes one undo entry with the applied toast and closes', async () => {
    const user = userEvent.setup()
    a.planAssignmentRange.mockImplementation((i: { dryRun: boolean }) => Promise.resolve(okPreview(!i.dryRun)))
    const { dialog, total, apply, onClose } = setup()
    await user.type(total, '10')
    await within(dialog).findByRole('table', { name: th.plan.preview })
    await user.click(apply)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(a.planAssignmentRange).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseVersion: 3, dryRun: false, totalCd: 1000 }),
    )
    expect(await screen.findByText(th.plan.applied('10.0', 'Ivy'))).toBeInTheDocument()

    // the toast's เลิกทำ writes the before snapshots back (all empty → WEEK null per week), COLLAPSE
    a.saveAllocations.mockResolvedValue({ ok: true, results: [], warnings: [] })
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await waitFor(() => expect(a.saveAllocations).toHaveBeenCalledTimes(1))
    expect(a.saveAllocations).toHaveBeenCalledWith(
      expect.objectContaining({
        onDayWeekConflict: 'COLLAPSE',
        items: [
          {
            taskAssignmentId: TA,
            baseVersion: 4,
            changes: [
              { granularity: 'WEEK', period: '2026-11-09', cd: null },
              { granularity: 'WEEK', period: '2026-11-16', cd: null },
              { granularity: 'WEEK', period: '2026-11-23', cd: null },
            ],
          },
        ],
      }),
    )
  })
})
