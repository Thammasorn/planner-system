// plan/m09 S3.4–S3.6 — PlanGrid in the person context (M9-D12/D13/D28/D29): project rows + merged rows + the masked
// row, no structure affordances, the person footer with week tones / glyphs, focus week, ◆ with project prefixes.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { Preferences } from '@/lib/schemas/preferences'
import { buildColumns, FOOTER_ROWS, HEADER_ROWS, timelineWeeks } from '@/lib/grid/columns'
import { fxMilestone } from '@/lib/grid/fixtures.test.data'
import { IVY_PROJECTS, personResponse } from '@/lib/grid/person.test.data'
import type { GridResponse, SaveAllocationsInput } from '@/lib/contracts/grid'
import type { GridChunk, GridCtx } from '@/lib/query-keys'
import { resetVersions } from '@/lib/grid/versions'
import { projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({
  fetchGridChunk: vi.fn(),
  saveAllocations: vi.fn(),
  getJson: vi.fn(),
}))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({
  saveAllocations: m.saveAllocations,
  planAssignmentRange: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/milestones', () => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  restoreMilestoneBatch: vi.fn(),
  linkTasksToMilestone: vi.fn(),
  revertTaskMilestones: vi.fn(),
}))
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
vi.mock('@/server/actions/assignments', () => ({
  assign: vi.fn(),
  unassign: vi.fn(),
  restoreAssignmentBatch: vi.fn(),
}))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))

const IVY: GridCtx = { kind: 'person', id: 'ivy' }
const PETER: GridCtx = { kind: 'person', id: 'peter' }

/** Ivy (F1): CRM + POS, a masked row, ◆ in both projects. */
function ivyChunk(from: string): GridResponse {
  return personResponse({
    from,
    userId: 'ivy',
    person: { name: 'Ivy' },
    projects: IVY_PROJECTS,
    masked: { '2026-10-05': { total: 100, committed: 100 } },
    milestones: [
      fxMilestone('ms-crm', '2026-10-14', { projectId: 'p-crm', name: 'Go-live' }),
      fxMilestone('ms-pos', '2026-10-21', { projectId: 'p-pos', name: 'UAT done' }),
    ],
  })
}
/** Peter (F3) seen by Cindy: hidden projects only — 5.0 vs cap 3.0 in 10-05. */
function peterChunk(from: string): GridResponse {
  return personResponse({
    from,
    userId: 'peter',
    person: { name: 'Peter', capacity: { '2026-10-05': 300 } },
    projects: [],
    masked: { '2026-10-05': { total: 500, committed: 500 } },
  })
}

function renderPerson(
  ctx: GridCtx,
  o: { focusWeek?: string; onOpenTask?: (t: string, p?: string) => void; prefs?: Partial<Preferences> } = {},
) {
  return renderGrid(
    <PlanGrid
      context={ctx}
      projectName={ctx.id}
      label={th.people.grid.label(ctx.id)}
      archived={false}
      canEdit
      onOpenTask={o.onOpenTask ?? vi.fn()}
      {...(o.focusWeek ? { focusWeek: o.focusWeek } : {})}
    />,
    o.prefs ? { prefs: o.prefs } : {},
  )
}

beforeEach(() => {
  resetVersions()
  m.saveAllocations.mockReset()
  stubViewport()
  stubScrollTo()
  m.fetchGridChunk.mockImplementation((ctx: GridCtx, chunk: GridChunk) =>
    Promise.resolve(ctx.id === 'peter' ? peterChunk(chunk.from) : ivyChunk(chunk.from)),
  )
  m.getJson.mockImplementation(() => Promise.resolve(projectTasksResponse()))
})

describe('PlanGrid — person context (M9 S3.4)', () => {
  it('renders project rows, merged rows and the masked row last; labelled by th.people.grid.label', async () => {
    renderPerson(IVY)
    const grid = screen.getByRole('grid', { name: th.people.grid.label('ivy') })
    await screen.findByRole('rowheader', { name: 'CRM' })
    const headers = within(grid)
      .getAllByRole('rowheader')
      .map((h) => h.getAttribute('data-row-key'))
      .filter((k): k is string => k !== null)
    expect(headers).toEqual(['p:p-crm', 'a:a-ivy-crm', 'p:p-pos', 'a:a-ivy-uat', 'm:ivy'])
    expect(screen.getByRole('rowheader', { name: th.masking.otherProjects })).toBeInTheDocument()
    // project name links to its plan; breadcrumb on the merged row
    expect(screen.getByRole('link', { name: 'CRM' })).toHaveAttribute('href', '/projects/p-crm/plan')
    const auto = screen.getByRole('rowheader', { name: 'ตั้งค่า automation · Ivy' })
    expect(within(auto).getByText('ย้ายระบบ')).toBeInTheDocument()
    // aria-rowcount = header rows + view rows + footer rows (no quick-add row in the person context)
    expect(grid).toHaveAttribute('aria-rowcount', String(HEADER_ROWS + 5 + FOOTER_ROWS))
    // no fetch of /api/projects/<userId>/tasks for a person id
    expect(m.getJson).not.toHaveBeenCalled()
  })

  it('no structure affordances: no quick add, no "+ คน", no ×, no includeOthers switch, no assignee toggle', async () => {
    renderPerson(IVY)
    await screen.findByRole('rowheader', { name: 'CRM' })
    expect(screen.queryByRole('textbox', { name: th.grid.row.addTaskLabel })).toBeNull()
    expect(screen.queryByRole('button', { name: th.grid.row.addPersonLabel('ตั้งค่า automation') })).toBeNull()
    expect(screen.queryByRole('button', { name: th.grid.row.removeAssignee('Ivy') })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: th.grid.toolbar.includeOthers })).toBeNull()
    expect(screen.queryByTestId('hide-assignees')).toBeNull()
    expect(screen.getByText(th.people.grid.footerLoad)).toBeInTheDocument()
  })

  it('project and masked cells are read-only (aria-readonly) with data-row-kind; merged cells stay editable', async () => {
    renderPerson(IVY)
    const masked = await screen.findByTestId('cell-m:ivy-W:2026-10-05')
    expect(masked).toHaveAttribute('aria-readonly', 'true')
    expect(masked).toHaveAttribute('data-row-kind', 'masked')
    expect(masked).toHaveTextContent('1.0')
    const project = screen.getByTestId('cell-p:p-pos-W:2026-10-05')
    expect(project).toHaveAttribute('aria-readonly', 'true')
    expect(project).toHaveAttribute('data-row-kind', 'project')
    expect(project).toHaveTextContent('1.3')
    expect(screen.getByTestId('cell-a:a-ivy-uat-W:2026-10-05')).not.toHaveAttribute('aria-readonly')
  })

  it('collapsing a project hides its merged row (in memory)', async () => {
    const user = userEvent.setup()
    renderPerson(IVY)
    const pos = await screen.findByRole('rowheader', { name: 'POS Upgrade' })
    const toggle = within(pos).getByRole('button', { name: th.grid.row.collapse })
    await user.click(toggle)
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'ทำ UAT + คู่มือหน้าร้าน · Ivy' })).toBeNull())
    expect(within(screen.getByRole('rowheader', { name: 'POS Upgrade' })).getByRole('button', { name: th.grid.row.expand })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('"เปิดในแผนงานโปรเจค" and double-click open the task with its project id', async () => {
    const onOpenTask = vi.fn()
    renderPerson(IVY, { onOpenTask })
    const row = await screen.findByRole('rowheader', { name: 'ทำ UAT + คู่มือหน้าร้าน · Ivy' })
    fireEvent.click(within(row).getByRole('button', { name: th.people.grid.openTask('ทำ UAT + คู่มือหน้าร้าน') }))
    expect(onOpenTask).toHaveBeenLastCalledWith('t-uat', 'p-pos')
    fireEvent.doubleClick(row)
    expect(onOpenTask).toHaveBeenCalledTimes(2)
    expect(onOpenTask).toHaveBeenLastCalledWith('t-uat', 'p-pos')
    // ↗ stays the task page link (SPEC v3.2, M6.1-D17)
    expect(within(row).getByRole('link', { name: th.grid.row.openTaskPage('ทำ UAT + คู่มือหน้าร้าน') })).toHaveAttribute(
      'href',
      '/t/t-uat',
    )
  })

  it('footer (F3 Peter as Cindy), days: ภาระรวม 5/3 with 🔴 and the hidden status text, tone over', async () => {
    renderPerson(PETER, { prefs: { 'load.display': 'DAYS' } })
    const cell = await screen.findByTestId('cell-footer-load-W:2026-10-05')
    await waitFor(() => expect(cell.querySelector('[data-footer-text]')).toHaveTextContent('5/3'))
    expect(cell).toHaveAttribute('data-tone', 'over')
    expect(cell.querySelector('[data-glyph="over"]')).toHaveTextContent('🔴')
    expect(cell).toHaveTextContent(th.overload.footerStatus(th.overload.level.OVER, '5.0', '3.0'))
    expect(screen.getByTestId('cell-footer-capacity-W:2026-10-05')).toHaveTextContent('3.0')
  })

  it('M11.1 FR-1008/FR-1010: the person footer follows load.display (default %) with a toolbar toggle', async () => {
    renderPerson(PETER)
    const cell = await screen.findByTestId('cell-footer-load-W:2026-10-05')
    await waitFor(() => expect(cell.querySelector('[data-footer-text]')).toHaveTextContent('167%'))
    expect(cell).toHaveAttribute('data-tone', 'over')
    expect(cell).toHaveTextContent(th.overload.footerStatus(th.overload.level.OVER, '5.0', '3.0'))
    const toggle = screen.getByTestId('load-display-toggle')
    fireEvent.click(within(toggle).getByRole('button', { name: th.loadDisplay.DAYS_long }))
    await waitFor(() => expect(cell.querySelector('[data-footer-text]')).toHaveTextContent('5/3'))
  })

  it('focusWeek opens that week as the first column and marks its header', async () => {
    renderPerson(IVY, { focusWeek: '2026-10-05' })
    const grid = screen.getByRole('grid', { name: th.people.grid.label('ivy') })
    await screen.findByRole('rowheader', { name: 'CRM' })
    const header = await waitFor(() => {
      const h = grid.querySelector<HTMLElement>('[role="columnheader"][data-week="2026-10-05"]')
      expect(h).not.toBeNull()
      return h!
    })
    expect(header).toHaveAttribute('data-focus-week', 'true')
    expect(header).toHaveAttribute('aria-description', th.people.grid.focusWeek)
    const cols = buildColumns(timelineWeeks('2026-09-30'), new Set(), new Map())
    const idx = cols.findIndex((c) => c.weekStart === '2026-10-05')
    await waitFor(() => expect(grid.scrollLeft).toBe(cols[idx]!.offset))
    expect(grid.querySelectorAll('[data-focus-week="true"]')).toHaveLength(1)
  })

  it('◆ of two projects are prefixed with the project name and read-only (canManage false)', async () => {
    renderPerson(IVY)
    const crm = await screen.findByTestId('ms-ms-crm')
    expect(crm.getAttribute('aria-label')).toContain('CRM · Go-live')
    expect(screen.getByTestId('ms-ms-pos').getAttribute('aria-label')).toContain('POS Upgrade · UAT done')
    expect(screen.queryByRole('button', { name: th.milestones.grid.toolbarAdd })).toBeNull()
  })

  it('typing into a merged cell saves that assignment; project row and person footer follow at once; lateness applies', async () => {
    const user = userEvent.setup()
    m.fetchGridChunk.mockImplementation((_ctx: GridCtx, chunk: GridChunk) => {
      const r = ivyChunk(chunk.from)
      return Promise.resolve({
        ...r,
        rows: r.rows.map((x) => (x.kind === 'task' && x.id === 't-uat' ? { ...x, milestoneId: 'ms-pos' } : x)),
      })
    })
    m.saveAllocations.mockImplementation((input: SaveAllocationsInput) =>
      Promise.resolve({
        ok: true as const,
        results: input.items.map((i) => ({
          taskAssignmentId: i.taskAssignmentId,
          version: 2,
          weeks: Object.fromEntries(i.changes.map((c) => [c.period, { cd: c.cd ?? 0, resolution: 'WEEK' as const }])),
          rowTotal: { total: 1, committed: 1 },
        })),
        warnings: [],
        lateness: { tasks: [{ taskId: 't-uat', lateForMilestone: true }], milestones: [] },
      }),
    )
    renderPerson(IVY)
    const cell = await screen.findByTestId('cell-a:a-ivy-uat-W:2026-10-05')
    await user.click(cell)
    await user.keyboard('2{Enter}')
    await waitFor(() => expect(screen.getByTestId('cell-p:p-pos-W:2026-10-05')).toHaveTextContent('2.0'))
    expect(screen.getByTestId('cell-footer-load-W:2026-10-05')).toHaveTextContent('60%') // 3.0 of 5 days
    fireEvent.blur(screen.getByRole('grid', { name: th.people.grid.label('ivy') }))
    await waitFor(() => expect(m.saveAllocations).toHaveBeenCalledTimes(1))
    const input = m.saveAllocations.mock.calls[0]![0] as SaveAllocationsInput
    expect(input.items.map((i) => i.taskAssignmentId)).toEqual(['a-ivy-uat'])
    expect(input.items[0]?.changes).toEqual([{ granularity: 'WEEK', period: '2026-10-05', cd: 200 }])
    await waitFor(() =>
      expect(screen.getByRole('rowheader', { name: 'ทำ UAT + คู่มือหน้าร้าน · Ivy' })).toHaveAttribute(
        'data-late-for-milestone',
        'true',
      ),
    )
  })

  it('typing into a masked or project cell writes nothing', async () => {
    const user = userEvent.setup()
    renderPerson(IVY)
    const masked = await screen.findByTestId('cell-m:ivy-W:2026-10-05')
    await user.click(masked)
    await user.keyboard('3{Enter}')
    await user.click(screen.getByTestId('cell-p:p-crm-W:2026-10-12'))
    await user.keyboard('{Delete}')
    fireEvent.blur(screen.getByRole('grid', { name: th.people.grid.label('ivy') }))
    await new Promise((r) => setTimeout(r, 50))
    expect(m.saveAllocations).not.toHaveBeenCalled()
    expect(masked).toHaveTextContent('1.0')
  })
})
