import { readFileSync } from 'node:fs'
import path from 'node:path'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { gridResponse, type FxPerson, type FxTask } from '@/lib/grid/fixtures.test.data'
import type { Preferences } from '@/lib/schemas/preferences'
import type { GridChunk } from '@/lib/query-keys'
import { PID, projectTasksResponse, stubScrollTo } from './grid.test.mocks'
import { PlanGrid } from './PlanGrid'
import { renderGrid, stubViewport } from './render.test.helper'

const m = vi.hoisted(() => ({ fetchGridChunk: vi.fn(), getJson: vi.fn() }))
vi.mock('@/lib/grid/fetch', () => ({ fetchGridChunk: m.fetchGridChunk, gridChunkUrl: vi.fn() }))
vi.mock('@/server/actions/allocations', () => ({ saveAllocations: vi.fn(), planAssignmentRange: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('@/server/actions/tasks', () => ({}))
vi.mock('@/server/actions/assignments', () => ({}))
vi.mock('@/server/actions/task-blockers', () => ({}))

const TASKS: FxTask[] = [
  {
    id: 't-cindy',
    name: 'งาน Cindy',
    assignees: [{ taId: 'a-cindy', userId: 'cindy', cells: { '2026-09-14': 375, '2026-09-21': 375 } }],
  },
  {
    id: 't-ivy',
    name: 'งาน Ivy',
    assignees: [
      {
        taId: 'a-ivy',
        userId: 'ivy',
        cells: { '2026-09-28': { days: { '2026-09-28': 50, '2026-09-29': 50 } } },
      },
    ],
  },
  {
    id: 't-mix',
    name: 'งาน Mint',
    certainty: 'TENTATIVE',
    certaintySource: 'task',
    assignees: [{ taId: 'a-mix', userId: 'mint', cells: { '2026-09-14': 100 } }],
  },
]
const PEOPLE: Record<string, FxPerson> = {
  cindy: {
    name: 'Cindy',
    capacity: { '2026-09-21': 0 },
    timeOff: [{ start: '2026-09-14', end: '2026-09-15', half: null, label: 'ลาพักร้อน' }],
  },
  ivy: { name: 'Ivy' },
  mint: { name: 'Mint' },
}

function render(prefs?: Partial<Preferences>) {
  return renderGrid(
    <PlanGrid
      context={{ kind: 'project', id: PID }}
      projectName="X"
      archived={false}
      canEdit
      onOpenTask={vi.fn()}
    />,
    prefs ? { prefs } : {},
  )
}

beforeEach(() => {
  stubViewport()
  stubScrollTo()
  m.fetchGridChunk.mockImplementation((_c: unknown, chunk: GridChunk) =>
    Promise.resolve(gridResponse({ from: chunk.from, tasks: TASKS, people: PEOPLE })),
  )
  m.getJson.mockImplementation(() => Promise.resolve(projectTasksResponse()))
})

describe('GridCell (FR-804/807/808, BR-20a)', () => {
  it('a DAY week shows its total with ⋯ and the hidden text', async () => {
    render()
    const cell = await screen.findByTestId('cell-a:a-ivy-W:2026-09-28')
    expect(cell).toHaveTextContent('1.0')
    expect(cell).toHaveAttribute('data-resolution', 'DAY')
    expect(cell).toHaveAttribute('aria-readonly', 'true')
    expect(cell.querySelector('[data-glyph="dayDetail"]')).toHaveTextContent('⋯')
    expect(within(cell).getByText(th.grid.glyph.dayDetail)).toBeInTheDocument()
  })

  it('tentative rows: data-tentative on cells and ◐ (+ hidden text) in the row header', async () => {
    render()
    const cell = await screen.findByTestId('cell-a:a-mix-W:2026-09-14')
    expect(cell).toHaveAttribute('data-tentative', 'true')
    const header = screen.getByRole('rowheader', { name: 'งาน Mint · Mint' })
    expect(within(header).getByText(th.grid.glyph.tentative)).toBeInTheDocument()
    expect(header).toHaveTextContent('*')
    // the aria-label (task · person) replaces the content: the states reach AT through aria-describedby (§8.9)
    expect(header).toHaveAccessibleName('งาน Mint · Mint')
    expect(header).toHaveAccessibleDescription(
      th.grid.row.states([th.grid.glyph.tentative, th.grid.row.sourceTask].join(' · ')),
    )
    expect(cell.getAttribute('aria-label')).toContain(th.grid.glyph.tentative)
  })

  it('a deactivated assignee is described as (ปิดใช้งาน); a plain row has no description', async () => {
    m.fetchGridChunk.mockImplementation((_c: unknown, chunk: GridChunk) =>
      Promise.resolve(
        gridResponse({
          from: chunk.from,
          tasks: TASKS,
          people: { ...PEOPLE, ivy: { name: 'Ivy', active: false } },
        }),
      ),
    )
    render()
    const ivy = await screen.findByRole('rowheader', { name: 'งาน Ivy · Ivy' })
    expect(ivy).toHaveAccessibleDescription(th.grid.row.states(th.users.deactivatedSuffix))
    expect(screen.getByRole('rowheader', { name: 'งาน Cindy · Cindy' })).not.toHaveAttribute('aria-describedby')
  })

  it('the roving cell shows a focus ring on keyboard focus without a store selection (:focus-visible)', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/components/grid/grid.module.css'), 'utf8')
    expect(css).toMatch(/\.cell:focus-visible\s*\{[^}]*box-shadow: inset 0 0 0 2px var\(--brand-blue\)/)
  })

  it('leave weeks render stripes + the hidden "ลา" text', async () => {
    render()
    const cell = await screen.findByTestId('cell-a:a-cindy-W:2026-09-14')
    expect(cell).toHaveAttribute('data-leave', 'true')
    expect(within(cell).getByText(th.grid.glyph.leave)).toBeInTheDocument()
    expect(cell.getAttribute('aria-label')).toContain(th.grid.glyph.leave)
  })

  it('fraction unit: 375 / 500 → 0.75; capacity 0 → days 3.8 + noCapacity', async () => {
    render({ 'grid.unit': 'FRACTION' })
    expect(await screen.findByTestId('cell-a:a-cindy-W:2026-09-14')).toHaveTextContent('0.75')
    const zero = screen.getByTestId('cell-a:a-cindy-W:2026-09-21')
    expect(zero).toHaveTextContent('3.8')
    expect(zero).toHaveAttribute('data-no-capacity', 'true')
    expect(within(zero).getByText(th.grid.glyph.noCapacity)).toBeInTheDocument()
  })

  it('the cell label names row, week and value', async () => {
    render()
    const cell = await screen.findByTestId('cell-a:a-cindy-W:2026-09-14')
    expect(cell.getAttribute('aria-label')).toBe(
      th.grid.cell.label('งาน Cindy · Cindy', '14/9', ['3.8', th.grid.glyph.leave].join(' · ')),
    )
    expect(screen.getByTestId('cell-a:a-cindy-W:2026-10-05').getAttribute('aria-label')).toBe(
      th.grid.cell.label('งาน Cindy · Cindy', '5/10', th.grid.cell.empty),
    )
  })
})
