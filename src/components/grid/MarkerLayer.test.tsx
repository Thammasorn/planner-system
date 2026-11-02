// Plan markers in the grid (S3.5; FR-819/820, AC-812, BR-102, M7.1-D11–D15, X04): one edge feeds the header, body and
// footer pieces (same left, R6), the pattern follows the tone (never colour alone), stacked markers show the first flag
// + "+N", header right click → "เพิ่มเส้นกำกับที่ขอบขวา" creates on Friday, 🗑 deletes with the undo toast, and an
// archived project gets no add entries and a read-only popover.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { formatThaiDate } from '@/lib/format'
import { gridResponse, POS_PEOPLE, POS_TASKS } from '@/lib/grid/fixtures.test.data'
import { resetVersions } from '@/lib/grid/versions'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({
  /** the server's live markers (refetches after each mutation read it) */
  server: [] as unknown[],
  fetchGridChunk: vi.fn(),
  getJson: vi.fn(),
  createPlanMarker: vi.fn(),
  updatePlanMarker: vi.fn(),
  deletePlanMarker: vi.fn(),
  restorePlanMarkerBatch: vi.fn(),
}))
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
  createPlanMarker: m.createPlanMarker,
  updatePlanMarker: m.updatePlanMarker,
  deletePlanMarker: m.deletePlanMarker,
  restorePlanMarkerBatch: m.restorePlanMarkerBatch,
}))

const ctx = { kind: 'project', id: PID } as const
const marker = (o: Partial<PlanMarkerDTO> & Pick<PlanMarkerDTO, 'id' | 'date'>): PlanMarkerDTO => ({
  projectId: PID,
  color: 'RED',
  label: null,
  createdBy: 'cindy',
  updatedAt: '2026-09-30T03:00:00.000Z',
  ...o,
})
const MARKERS = [
  marker({ id: 'mk-uat', date: '2026-10-23', label: 'UAT sign-off' }),
  marker({ id: 'mk-green', date: '2026-10-21', color: 'GREEN' }),
  marker({ id: 'mk-yellow', date: '2026-11-06', color: 'YELLOW' }),
]

function renderPos(o: { archived?: boolean } = {}) {
  return renderGrid(
    <PlanGrid
      context={ctx}
      projectName="POS Upgrade"
      archived={o.archived ?? false}
      canEdit={!o.archived}
      onOpenTask={vi.fn()}
    />,
  )
}

beforeEach(() => {
  resetVersions()
  stubViewport()
  stubScrollTo()
  for (const f of [m.createPlanMarker, m.updatePlanMarker, m.deletePlanMarker, m.restorePlanMarkerBatch]) f.mockReset()
  m.fetchGridChunk.mockImplementation((_ctx: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks: POS_TASKS, people: POS_PEOPLE })),
  )
  m.getJson.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith('/plan-markers') ? { markers: [...m.server] } : projectTasksResponse()),
  )
  m.server = [...MARKERS]
})

/** A mocked action that also changes the server's list (what the refetch on settle reads). */
function serverCreate(created: PlanMarkerDTO) {
  m.createPlanMarker.mockImplementation(() => {
    m.server.push(created)
    return Promise.resolve({ ok: true, marker: created })
  })
}

const lines = (ids: string) => [...document.querySelectorAll<HTMLElement>(`[data-marker-line][data-marker-ids="${ids}"]`)]

describe('MarkerLayer (FR-820, BR-102, M7.1-D12)', () => {
  it('one edge → header, body and footer pieces at the same left; stacked markers keep (date, created) order', async () => {
    renderPos()
    await waitFor(() => expect(lines('mk-green,mk-uat')).toHaveLength(3))
    const pieces = lines('mk-green,mk-uat')
    expect(pieces.map((e) => e.dataset.markerLine).sort()).toEqual(['body', 'footer', 'header'])
    expect(new Set(pieces.map((e) => e.style.left)).size).toBe(1)
    // the edge is the right edge of week 19/10: the 19/10 header's right = the line's left + 1
    const header = document.querySelector<HTMLElement>('[role="columnheader"][data-col-key="W:2026-10-19"]')!
    expect(parseFloat(pieces[0]!.style.left) + 1).toBe(parseFloat(header.style.left) + parseFloat(header.style.width))
    // the first by date styles the shared line; the pattern is a data attribute (solid / dashed / dotted in CSS)
    expect(pieces[0]).toHaveAttribute('data-tone', 'GREEN')
    expect(pieces[0]).toHaveAttribute('aria-hidden', 'true')
    expect(lines('mk-yellow')[0]).toHaveAttribute('data-tone', 'YELLOW')
  })

  it('flags are named "<label or colour> · <date>" (never colour alone); "+N" lists the stack', async () => {
    const user = userEvent.setup()
    renderPos()
    const green = await screen.findByRole('button', {
      name: th.planMarkers.flag(th.planMarkers.color.GREEN, formatThaiDate('2026-10-21', 'medium')),
    })
    expect(green).toHaveTextContent(th.planMarkers.color.GREEN)
    const more = screen.getByRole('button', { name: new RegExp('UAT sign-off') })
    expect(more).toHaveTextContent('+1')
    await user.click(more)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((e) => e.textContent)).toEqual([
      th.planMarkers.flag(th.planMarkers.color.GREEN, formatThaiDate('2026-10-21', 'medium')),
      th.planMarkers.flag('UAT sign-off', formatThaiDate('2026-10-23', 'medium')),
    ])
  })
})

describe('marker edits (FR-819, M7.1-D11/D13, X04)', () => {
  it('right click on the 19/10 header → "เพิ่มเส้นกำกับที่ขอบขวา" creates RED on Friday 23/10 at once', async () => {
    const user = userEvent.setup()
    serverCreate(marker({ id: 'mk-new', date: '2026-10-23' }))
    renderPos()
    const header = await screen.findByRole('columnheader', { name: th.grid.header.week('19/10') })
    fireEvent.contextMenu(header, { clientX: 400, clientY: 50 })
    await user.click(await screen.findByRole('menuitem', { name: th.planMarkers.addHere }))
    await waitFor(() =>
      expect(m.createPlanMarker).toHaveBeenCalledWith({ projectId: PID, date: '2026-10-23', color: 'RED', label: null }),
    )
    // the popover of the new marker opens for colour / label / date
    expect(await screen.findByTestId('marker-popover')).toBeInTheDocument()
  })

  it('the flag opens the popover: colour buttons say their name and ✓; 🗑 deletes with an undo toast', async () => {
    const user = userEvent.setup()
    m.updatePlanMarker.mockResolvedValue({
      ok: true,
      marker: marker({ id: 'mk-yellow', date: '2026-11-06', color: 'GREEN' }),
      previous: { date: '2026-11-06', color: 'YELLOW', label: null },
    })
    m.deletePlanMarker.mockImplementation(({ markerId }: { markerId: string }) => {
      m.server = m.server.filter((x) => (x as PlanMarkerDTO).id !== markerId)
      return Promise.resolve({ ok: true, batch: 'b-1', projectId: PID })
    })
    m.restorePlanMarkerBatch.mockImplementation(() => {
      m.server.push(MARKERS[2])
      return Promise.resolve({ ok: true, markers: [MARKERS[2]], projectId: PID })
    })
    renderPos()
    const flag = await screen.findByRole('button', {
      name: th.planMarkers.flag(th.planMarkers.color.YELLOW, formatThaiDate('2026-11-06', 'medium')),
    })
    await user.click(flag)
    const yellow = await screen.findByTestId('marker-color-YELLOW')
    expect(yellow).toHaveAttribute('aria-pressed', 'true')
    expect(yellow).toHaveTextContent(`✓ ${th.planMarkers.color.YELLOW}`)
    await user.click(screen.getByTestId('marker-color-GREEN'))
    await waitFor(() => expect(m.updatePlanMarker).toHaveBeenCalledWith({ markerId: 'mk-yellow', color: 'GREEN' }))
    await user.click(screen.getByTestId('marker-delete'))
    await waitFor(() => expect(m.deletePlanMarker).toHaveBeenCalledWith({ markerId: 'mk-yellow' }))
    await waitFor(() => expect(lines('mk-yellow')).toHaveLength(0))
    await user.click(await screen.findByRole('button', { name: th.undo.undo }))
    await waitFor(() => expect(m.restorePlanMarkerBatch).toHaveBeenCalledWith({ batch: 'b-1' }))
    await waitFor(() => expect(lines('mk-yellow')).toHaveLength(3))
  })

  it('a colour edit pushes an undo entry without a toast: Cmd+Z sends the previous values (M7.1-D13)', async () => {
    const user = userEvent.setup()
    m.updatePlanMarker.mockImplementation((input: { markerId: string; color?: string }) =>
      Promise.resolve({
        ok: true,
        marker: marker({ id: 'mk-yellow', date: '2026-11-06', color: (input.color ?? 'YELLOW') as 'YELLOW' }),
        previous: { date: '2026-11-06', color: 'YELLOW', label: null },
      }),
    )
    renderPos()
    await user.click(
      await screen.findByRole('button', {
        name: th.planMarkers.flag(th.planMarkers.color.YELLOW, formatThaiDate('2026-11-06', 'medium')),
      }),
    )
    await user.click(await screen.findByTestId('marker-color-GREEN'))
    await waitFor(() => expect(m.updatePlanMarker).toHaveBeenCalledTimes(1))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('marker-popover')).toBeNull())
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', metaKey: true })
    await waitFor(() =>
      expect(m.updatePlanMarker).toHaveBeenLastCalledWith({ markerId: 'mk-yellow', date: '2026-11-06', color: 'YELLOW', label: null }),
    )
    expect(screen.queryByRole('button', { name: th.undo.undo })).toBeNull()
  })

  it('toolbar "เส้นกำกับ (3) ▾" lists by date; "+ เพิ่มเส้นกำกับ…" creates on Friday of this week', async () => {
    const user = userEvent.setup()
    serverCreate(marker({ id: 'mk-new', date: '2026-10-02' }))
    renderPos()
    const button = await screen.findByRole('button', { name: new RegExp(th.planMarkers.menu(3).replace(/[()]/g, '\\$&')) })
    await user.click(button)
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem')
    expect(items.map((e) => e.textContent)).toEqual([
      expect.stringContaining('21 ต.ค.'),
      expect.stringContaining('UAT sign-off'),
      expect.stringContaining('6 พ.ย.'),
      th.planMarkers.add,
    ])
    await user.click(items[3]!)
    await waitFor(() =>
      expect(m.createPlanMarker).toHaveBeenCalledWith({ projectId: PID, date: '2026-10-02', color: 'RED', label: null }),
    )
  })

  it('archived: no add entries, header right click is not taken, flags open the read-only popover', async () => {
    const user = userEvent.setup()
    renderPos({ archived: true })
    const header = await screen.findByRole('columnheader', { name: th.grid.header.week('19/10') })
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 50 })
    act(() => void header.dispatchEvent(ev))
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByRole('menuitem', { name: th.planMarkers.addHere })).toBeNull()
    await user.click(screen.getByRole('button', { name: new RegExp(th.planMarkers.menu(3).replace(/[()]/g, '\\$&')) }))
    expect(screen.queryByRole('menuitem', { name: th.planMarkers.add })).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(
      screen.getByRole('button', {
        name: th.planMarkers.flag(th.planMarkers.color.YELLOW, formatThaiDate('2026-11-06', 'medium')),
      }),
    )
    const pop = await screen.findByTestId('marker-popover')
    expect(pop).toHaveTextContent(th.planMarkers.readOnly)
    expect(within(pop).queryByRole('button')).toBeNull()
  })
})
