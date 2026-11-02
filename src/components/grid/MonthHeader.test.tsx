// Month header row (S3.4; FR-818, AC-811, M7.1-D10, X85): header row 1 = month + year spans over the rendered columns,
// row 2 = weeks / days; the first column of each month carries data-month-start in the header, the body and the
// footer; expanding 28/9 puts 1 ต.ค. under ตุลาคม with the boundary between 30 ก.ย. and 1 ต.ค.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { FOOTER_ROWS, HEADER_ROWS } from '@/lib/grid/columns'
import { MONTH_LABEL_LONG_MIN_W } from '@/lib/grid/months'
import { gridResponse, POS_PEOPLE, POS_TASKS } from '@/lib/grid/fixtures.test.data'
import { resetVersions } from '@/lib/grid/versions'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { MONTH_ROW_INDEX } from './MonthHeader'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({ fetchGridChunk: vi.fn(), getJson: vi.fn() }))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({ saveAllocations: vi.fn(), planAssignmentRange: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  indentTask: vi.fn(),
  outdentTask: vi.fn(),
  moveTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  setTaskStatus: vi.fn(),
  revertTaskStatus: vi.fn(),
  deleteTaskTree: vi.fn(),
  restoreTaskBatch: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({ assign: vi.fn(), unassign: vi.fn(), restoreAssignmentBatch: vi.fn() }))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))
vi.mock('@/server/actions/plan-markers', () => ({
  createPlanMarker: vi.fn(),
  updatePlanMarker: vi.fn(),
  deletePlanMarker: vi.fn(),
  restorePlanMarkerBatch: vi.fn(),
}))

beforeEach(() => {
  resetVersions()
  stubViewport()
  stubScrollTo()
  m.fetchGridChunk.mockImplementation((_c: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks: POS_TASKS, people: POS_PEOPLE, expand: chunk.expand })),
  )
  m.getJson.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith('/plan-markers') ? { markers: [] } : projectTasksResponse()),
  )
})

function renderPos() {
  return renderGrid(
    <PlanGrid context={{ kind: 'project', id: PID }} projectName="POS Upgrade" archived={false} canEdit onOpenTask={vi.fn()} />,
  )
}

const monthHeader = (label: string) =>
  screen.getByRole('columnheader', { name: label })
const starts = (sel: string) => document.querySelector<HTMLElement>(sel)?.hasAttribute('data-month-start') ?? false

describe('MonthHeader (FR-818, AC-811)', () => {
  it('two header rows from HEADER_ROWS: month row 1, period row 2; aria-rowcount includes both', async () => {
    renderPos()
    const grid = screen.getByRole('grid')
    await waitFor(() => expect(grid.querySelectorAll('[data-row-header]')).toHaveLength(3))
    const rows = screen.getAllByRole('row')
    expect(rows[0]).toHaveAttribute('aria-rowindex', String(MONTH_ROW_INDEX))
    expect(rows[1]).toHaveAttribute('aria-rowindex', String(HEADER_ROWS))
    expect(grid).toHaveAttribute('aria-rowcount', String(HEADER_ROWS + 3 + 1 + FOOTER_ROWS))
  })

  it('week zoom: "กันยายน 2569" over 7/9–28/9, "ตุลาคม 2569" over 5/10–26/10; boundaries before 5/10 and 2/11', async () => {
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const sep = monthHeader(th.grid.months.long(th.calendar.months[8], 2569))
    const oct = monthHeader(th.grid.months.long(th.calendar.months[9], 2569))
    expect(sep).toHaveAttribute('aria-colspan', '4')
    expect(oct).toHaveAttribute('aria-colspan', '4')
    expect(oct).toHaveTextContent(th.grid.months.long(th.calendar.months[9], 2569))
    expect(oct).toHaveAttribute('data-month-start')
    // the line runs through header, body and footer at the first column of each month
    for (const w of ['2026-10-05', '2026-11-02']) {
      expect(starts(`[role="columnheader"][data-col-key="W:${w}"]`)).toBe(true)
      expect(starts(`[data-testid="cell-a:a-cindy-pos-W:${w}"]`)).toBe(true)
      expect(starts(`[data-testid="cell-footer-load-W:${w}"]`)).toBe(true)
    }
    expect(starts('[role="columnheader"][data-col-key="W:2026-09-28"]')).toBe(false)
    expect(starts('[data-testid="cell-a:a-cindy-pos-W:2026-10-12"]')).toBe(false)
  })

  it('expanding 28/9: 1 ต.ค. sits under ตุลาคม; the boundary is between 30 ก.ย. and 1 ต.ค.', async () => {
    const user = userEvent.setup()
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    await user.click(screen.getByTestId('expand-week-2026-09-28'))
    await waitFor(() => expect(document.querySelector('[data-col-key="D:2026-10-01"]')).not.toBeNull())
    expect(starts('[role="columnheader"][data-col-key="D:2026-10-01"]')).toBe(true)
    expect(starts('[role="columnheader"][data-col-key="D:2026-09-30"]')).toBe(false)
    expect(starts('[role="columnheader"][data-col-key="W:2026-10-05"]')).toBe(false)
    const oct = monthHeader(th.grid.months.long(th.calendar.months[9], 2569))
    const firstDay = document.querySelector<HTMLElement>('[role="columnheader"][data-col-key="D:2026-10-01"]')!
    expect(oct.style.left).toBe(firstDay.style.left)
  })

  it('768 px (§8.12): a month mostly under "รวม" gets a label capped to its on-screen width — never a clipped long name', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(768)
    renderPos()
    await screen.findByTestId('cell-a:a-cindy-pos-W:2026-09-28')
    const labels = await waitFor(() => {
      const els = [...document.querySelectorAll<HTMLElement>('[data-testid^="month-label-"]')]
      expect(els.length).toBeGreaterThan(0)
      expect(els.every((el) => el.style.maxWidth !== '')).toBe(true)
      return els
    })
    let capped = 0
    for (const el of labels) {
      const shown = Number.parseFloat(el.style.maxWidth)
      const span = el.closest<HTMLElement>('[role="columnheader"]')!
      const full = span.getAttribute('aria-label')!
      if (shown < Number.parseFloat(span.style.width)) capped++
      // the long name only where the on-screen part is wide enough for it
      if (shown < MONTH_LABEL_LONG_MIN_W) expect(el.textContent).not.toBe(full)
    }
    expect(capped).toBeGreaterThan(0)
  })
})
