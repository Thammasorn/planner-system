// RowHeader chips (v3.9 owner feedback): "→◆ส่งงาน", "⚠ เลย milestone" and "รอ 1 งาน" overflowed the task column onto
// the ผู้รับผิดชอบ column. The name + chips box is measured (ResizeObserver, stubbed here — jsdom has no layout) and
// the chips collapse: milestone label → "◆", then late / blocker → icon-only with the full text in aria-label; the
// cell itself clips at its edge (static CSS guard in grid-css.test.ts).
import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { GridAssigneeRow, GridTaskRow } from '@/lib/contracts/grid'
import { taskLeadLayout } from '@/lib/grid/row-layout'
import type { ViewRow } from '@/lib/grid/rows'
import { taskMainWidth } from '@/lib/grid/task-chips'
import { createGridStore } from './gridStore'
import { renderGrid } from './render.test.helper'
import { RowHeader, type RowHeaderProps } from './RowHeader'

const observers: { cb: ResizeObserverCallback; el: Element }[] = []
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    observers.push({ cb: this.cb, el })
  }
  unobserve() {}
  disconnect() {}
}
function resizeTo(width: number) {
  act(() => {
    for (const o of observers) {
      const entry = { target: o.el, contentRect: { width } as DOMRectReadOnly } as ResizeObserverEntry
      o.cb([entry], {} as ResizeObserver)
    }
  })
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})
afterEach(() => vi.unstubAllGlobals())

const task: GridTaskRow = {
  kind: 'task',
  id: 't-send',
  depth: 0,
  name: '',
  parentId: null,
  hasChildren: false,
  certainty: 'CONFIRMED',
  certaintySource: 'project',
  certaintySourceName: null,
  completed: false,
  completedWeek: null,
  milestoneId: 'm-send',
  lateForMilestone: true,
  blockers: { open: 1, total: 1 },
  assigneeCount: 1,
  totals: {},
}
const assignee: GridAssigneeRow = {
  kind: 'assignee',
  taskAssignmentId: 'a-mint',
  taskId: 't-send',
  userId: 'mint',
  version: 1,
  editable: true,
  rowTotal: { total: 0, committed: 0 },
  cells: {},
}
const merged: ViewRow = { key: 'a:a-mint', kind: 'merged', task, assignee, depth: 0 }

function renderRow(o: Partial<RowHeaderProps> = {}) {
  const props: RowHeaderProps = {
    store: createGridStore(),
    r: 0,
    row: merged,
    height: 32,
    personName: 'Mint',
    personActive: true,
    canEdit: true,
    blockerNames: ['ออกแบบ'],
    canAddPerson: false,
    addPersonOpen: false,
    milestone: { name: 'ส่งงาน', date: '2026-10-02' },
    onAddPerson: vi.fn(),
    onSelectRow: vi.fn(),
    onOpenTask: vi.fn(),
    onToggle: vi.fn(),
    onUnassign: vi.fn(),
    selectable: true,
    draggable: true,
    ...o,
  }
  renderGrid(<RowHeader {...props} />)
  return document.querySelector<HTMLElement>('[data-row-header]')!
}

const boxAt = (colW: number) =>
  taskMainWidth(colW, taskLeadLayout(0, { check: true, handle: true }).leadW, 44)

describe('RowHeader task-column chips collapse (v3.9)', () => {
  it('wide column: full "→◆ส่งงาน", "⚠ เลย milestone" and "รอ 1 งาน"', () => {
    const header = renderRow()
    resizeTo(600)
    expect(header.querySelector('[data-task-main]')).toHaveAttribute('data-chip-level', '0')
    expect(within(header).getByText(th.milestones.grid.taskLink('ส่งงาน'))).toBeInTheDocument()
    expect(within(header).getByText(th.milestones.late)).toBeInTheDocument()
    expect(within(header).getByText(th.tasks.blockers.badgeWaiting(1))).toBeInTheDocument()
  })

  it('milestone label collapses first: "◆" while late / blocker stay full', () => {
    const header = renderRow()
    resizeTo(280)
    expect(header.querySelector('[data-task-main]')).toHaveAttribute('data-chip-level', '1')
    expect(header.querySelector('[data-ms-link]')).toHaveTextContent(/^◆$/)
    expect(within(header).getByText(th.milestones.late)).toBeInTheDocument()
    expect(within(header).getByText(th.tasks.blockers.badgeWaiting(1))).toBeInTheDocument()
  })

  it.each([200, 320])('%i px column: late / blocker become icons, full text stays in aria-label', (colW) => {
    const header = renderRow()
    resizeTo(boxAt(colW))
    expect(header.querySelector('[data-task-main]')).toHaveAttribute('data-chip-level', '2')
    expect(header.querySelector('[data-ms-link]')).toHaveTextContent(/^◆$/)
    expect(within(header).queryByText(th.milestones.late)).toBeNull()
    expect(within(header).getByRole('img', { name: th.milestones.late })).toHaveTextContent('⚠')
    const blocker = within(header).getByRole('img', { name: th.tasks.blockers.badgeWaiting(1) })
    expect(blocker).toHaveTextContent('1')
    expect(blocker).toHaveAttribute('data-blocker-badge', 'WAITING')
    // not colour alone: the row's states still name the milestone and lateness
    expect(header).toHaveAccessibleDescription(expect.stringContaining(th.milestones.late))
    // the chips live inside the clipped name box, not after the task cell
    const main = header.querySelector('[data-task-main]')!
    expect(main.contains(blocker)).toBe(true)
    expect(screen.getByText('Mint').closest('[data-task-cell]')).toBeNull()
  })
})
