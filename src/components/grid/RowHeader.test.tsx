// RowHeader (M6.1 S5.1, FR-685, M6.1-D17): ↗ on task rows is a real link to the task page (`/t/<id>`, Cmd/Ctrl/middle
// click open a new tab natively); double-click on the row header still opens the panel (`onOpenTask`), and a click on
// the ↗ neither selects the row nor opens the panel.
import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { GridAssigneeRow, GridTaskRow } from '@/lib/contracts/grid'
import type { ViewRow } from '@/lib/grid/rows'
import { createGridStore } from './gridStore'
import { renderGrid } from './render.test.helper'
import { renameResult, RowHeader, TASK_NAME_MAX, type RowHeaderProps } from './RowHeader'

const task = (o: Partial<GridTaskRow> = {}): GridTaskRow => ({
  kind: 'task',
  id: 't-rollout',
  depth: 0,
  name: 'Rollout สาขา',
  parentId: null,
  hasChildren: false,
  certainty: 'CONFIRMED',
  certaintySource: 'project',
  certaintySourceName: null,
  completed: false,
  completedWeek: null,
  milestoneId: null,
  lateForMilestone: false,
  blockers: { open: 0, total: 0 },
  assigneeCount: 1,
  totals: {},
  ...o,
})

const assignee: GridAssigneeRow = {
  kind: 'assignee',
  taskAssignmentId: 'a-ivy',
  taskId: 't-rollout',
  userId: 'ivy',
  version: 1,
  editable: true,
  rowTotal: { total: 0, committed: 0 },
  cells: {},
}

function renderRow(row: ViewRow, o: Partial<RowHeaderProps> = {}) {
  const props: RowHeaderProps = {
    store: createGridStore(),
    r: 0,
    row,
    height: 32,
    personName: 'Ivy',
    personActive: true,
    canEdit: true,
    blockerNames: [],
    canAddPerson: true,
    addPersonOpen: false,
    onAddPerson: vi.fn(),
    onSelectRow: vi.fn(),
    onOpenTask: vi.fn(),
    onToggle: vi.fn(),
    onUnassign: vi.fn(),
    ...o,
  }
  renderGrid(<RowHeader {...props} />)
  const header = document.querySelector<HTMLElement>('[data-row-header]')!
  return { props, header }
}

const merged: ViewRow = { key: 'a:a-ivy', kind: 'merged', task: task(), assignee, depth: 0 }
const parent: ViewRow = {
  key: 't:t-parent',
  kind: 'task',
  task: task({ id: 't-parent', name: 'POS เฟส 2', hasChildren: true, assigneeCount: 0 }),
  depth: 0,
  collapsed: false,
}

describe('RowHeader ↗ = task page link (M6.1-D17)', () => {
  it('task and merged rows: ↗ is a link to /t/<id> named openTaskPage; the M6 panel button is gone', () => {
    const { header } = renderRow(merged)
    const link = within(header).getByRole('link', { name: th.grid.row.openTaskPage('Rollout สาขา') })
    expect(link).toHaveAttribute('href', '/t/t-rollout')
    expect(link.tagName).toBe('A')
    expect(within(header).queryByRole('button', { name: th.grid.row.openTask('Rollout สาขา') })).toBeNull()
  })

  it('parent task row: ↗ links its own task', () => {
    const { header } = renderRow(parent)
    expect(within(header).getByRole('link', { name: th.grid.row.openTaskPage('POS เฟส 2') })).toHaveAttribute(
      'href',
      '/t/t-parent',
    )
  })

  it('assignee rows have no ↗ (the task row above carries it)', () => {
    const { header } = renderRow({ key: 'a:a-ivy', kind: 'assignee', task: task(), assignee, depth: 1 })
    expect(within(header).queryByRole('link')).toBeNull()
  })

  it('Cmd / Ctrl / Shift click on ↗ is not prevented (native new tab) and neither selects nor opens the panel', () => {
    const { header, props } = renderRow(merged)
    const link = within(header).getByRole('link', { name: th.grid.row.openTaskPage('Rollout สาขา') })
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }]) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...mod })
      link.dispatchEvent(ev)
      expect(ev.defaultPrevented, JSON.stringify(mod)).toBe(false)
    }
    expect(props.onSelectRow).not.toHaveBeenCalled()
    expect(props.onOpenTask).not.toHaveBeenCalled()
  })

  it('middle click (auxclick) is left to the browser', () => {
    const { header, props } = renderRow(merged)
    const link = within(header).getByRole('link', { name: th.grid.row.openTaskPage('Rollout สาขา') })
    const ev = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    link.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(props.onOpenTask).not.toHaveBeenCalled()
  })

  it('double-click on ↗ does not open the panel (it belongs to the link)', () => {
    const { header, props } = renderRow(merged)
    fireEvent.doubleClick(within(header).getByRole('link'))
    expect(props.onOpenTask).not.toHaveBeenCalled()
  })

  it('double-click on the row header still opens the panel; a click selects the row', () => {
    const { header, props } = renderRow(merged)
    fireEvent.click(screen.getByText('Rollout สาขา'))
    expect(props.onSelectRow).toHaveBeenCalledWith(0)
    fireEvent.doubleClick(screen.getByText('Rollout สาขา'))
    expect(props.onOpenTask).toHaveBeenCalledWith('t-rollout')
    expect(header).toHaveAttribute('data-row-key', 'a:a-ivy')
  })

  it('↗ is tabbable only inside the selected row (roving focus, §8.9)', () => {
    const store = createGridStore()
    const { header } = renderRow(merged, { store })
    const link = within(header).getByRole('link')
    expect(link).toHaveAttribute('tabindex', '-1')
    act(() => store.set({ rowSelection: 'a:a-ivy' }))
    expect(link).toHaveAttribute('tabindex', '0')
  })
})

describe('RowHeader indentation (v3.9 lead layout)', () => {
  it('indents by depth AFTER the ⠿ gutter: a 32 px spacer at depth 2, none at depth 0', () => {
    const { header } = renderRow({ ...merged, depth: 2 }, { draggable: true })
    const lead = header.querySelector<HTMLElement>('[data-lead]')!
    const kids = Array.from(lead.children)
    expect(kids[0]).toHaveAttribute('data-drag-handle')
    expect(kids[1]).toHaveAttribute('data-indent', '2')
    expect((kids[1] as HTMLElement).style.width).toBe('32px')
    expect(kids[2]).toHaveAttribute('data-toggle-spacer')
    expect(lead.style.width).toBe(`${14 + 32 + 16}px`)
    document.body.innerHTML = ''
    const top = renderRow(merged, { draggable: true }).header
    expect(top.querySelector('[data-indent]')).toBeNull()
    expect(top.querySelector<HTMLElement>('[data-lead]')!.style.width).toBe(`${14 + 16}px`)
  })
})

describe('RowHeader milestone label + late marker (M8 S3.7, FR-706, AC-702)', () => {
  const uat = { name: 'UAT', date: '2026-10-02' }

  it('a late bound merged row shows "→◆UAT" and the visible "เลย milestone" chip; states carry both', () => {
    const late: ViewRow = {
      ...merged,
      task: task({ milestoneId: 'm-uat', lateForMilestone: true }),
    }
    const { header } = renderRow(late, { milestone: uat })
    expect(header).toHaveAttribute('data-late-for-milestone', 'true')
    expect(within(header).getByText(th.milestones.grid.taskLink('UAT'))).toBeInTheDocument()
    expect(within(header).getByText(th.milestones.late)).toBeInTheDocument()
    expect(header).toHaveAccessibleDescription(
      expect.stringContaining(th.milestones.grid.taskLinkLabel('UAT')),
    )
    expect(header).toHaveAccessibleDescription(expect.stringContaining(th.milestones.late))
  })

  it('bound but not late: the label only', () => {
    const bound: ViewRow = { ...merged, task: task({ milestoneId: 'm-uat' }) }
    const { header } = renderRow(bound, { milestone: uat })
    expect(within(header).getByText(th.milestones.grid.taskLink('UAT'))).toBeInTheDocument()
    expect(within(header).queryByText(th.milestones.late)).toBeNull()
    expect(header).not.toHaveAttribute('data-late-for-milestone')
  })

  it('an unbound row shows neither label', () => {
    const { header } = renderRow(merged, { milestone: null })
    expect(header.querySelector('[data-ms-link]')).toBeNull()
    expect(header.querySelector('[data-ms-late]')).toBeNull()
  })
})

describe('RowHeader caret slot (v3.8): sibling names line up, children indent one step', () => {
  /** What sits before the name: the task cell's indent and its children up to the name. */
  function lead(row: ViewRow): { indent: string; slots: string[] } {
    const { header } = renderRow(row)
    const cell = header.querySelector<HTMLElement>('[data-lead]')!
    const slots: string[] = []
    for (const el of Array.from(cell.children)) {
      if (el.hasAttribute('data-indent')) continue
      slots.push(
        el.hasAttribute('data-toggle-spacer')
          ? 'slot'
          : el.tagName === 'BUTTON' && el.hasAttribute('aria-expanded')
            ? 'slot'
            : el.tagName,
      )
    }
    const out = { indent: cell.style.width, slots }
    document.body.innerHTML = ''
    return out
  }

  it('a parent (▸/▾) and a leaf sibling have the same lead; a child = one indent step further', () => {
    const p = lead(parent)
    const leaf = lead(merged)
    expect(leaf).toEqual(p)
    expect(p.slots).toEqual(['slot'])
    const child: ViewRow = { ...merged, key: 'a:a-child', task: task({ id: 't-child', depth: 1 }), depth: 1 }
    const c = lead(child)
    expect(c.slots).toEqual(p.slots)
    expect(c.indent).toBe('32px')
    expect(p.indent).toBe('16px')
  })
})

describe('RowHeader unassigned hint (v3.9): in the ผู้รับผิดชอบ column, beside the name only when it is hidden', () => {
  const lone: ViewRow = {
    key: 't:t-lone',
    kind: 'task',
    task: task({ id: 't-lone', name: 'งานเดี่ยว', assigneeCount: 0 }),
    depth: 0,
    collapsed: false,
  }

  it('assignee column shown: "รอมอบหมาย" + "+ คน" live in the assignee cell; the task cell has the name only', () => {
    const { header } = renderRow(lone)
    const taskCell = header.querySelector<HTMLElement>('[data-task-cell]')!
    const assigneeCell = header.querySelector<HTMLElement>('[data-assignee-cell]')!
    expect(within(taskCell).queryByText(th.grid.row.unassigned)).toBeNull()
    expect(
      within(taskCell).queryByRole('button', { name: th.grid.row.addPersonLabel('งานเดี่ยว') }),
    ).toBeNull()
    expect(within(assigneeCell).getByText(th.grid.row.unassigned)).toBeInTheDocument()
    expect(
      within(assigneeCell).getByRole('button', { name: th.grid.row.addPersonLabel('งานเดี่ยว') }),
    ).toBeInTheDocument()
  })

  it('assignee column hidden: the hint and "+ คน" stay in the task cell', () => {
    const { header } = renderRow(lone, { showAssignees: false })
    const taskCell = header.querySelector<HTMLElement>('[data-task-cell]')!
    expect(header.querySelector('[data-assignee-cell]')).toBeNull()
    expect(within(taskCell).getByText(th.grid.row.unassigned)).toBeInTheDocument()
    expect(
      within(taskCell).getByRole('button', { name: th.grid.row.addPersonLabel('งานเดี่ยว') }),
    ).toBeInTheDocument()
  })

  it('an assigned (merged) row keeps "+ คน" in the task cell actions', () => {
    const { header } = renderRow(merged)
    expect(header.querySelector('[data-assignee-cell] [data-add-person]')).toBeNull()
    expect(header.querySelector('[data-task-cell] [data-add-person]')).not.toBeNull()
  })
})

describe('renameResult (v3.9 inline rename)', () => {
  it('trims; empty or unchanged = no save; capped at the task-name maximum', () => {
    expect(renameResult('A', '  B  ')).toBe('B')
    expect(renameResult('A', '   ')).toBeNull()
    expect(renameResult('A', ' A ')).toBeNull()
    expect(renameResult('A', 'x'.repeat(TASK_NAME_MAX + 5))).toHaveLength(TASK_NAME_MAX)
  })
})
