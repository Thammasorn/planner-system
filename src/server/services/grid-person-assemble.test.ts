// M9 S2.5 — pure person-grid assembly (assemblePersonGrid): project → task → assignee rows flattened per visible
// project (compareThai), breadcrumb from the tree, the person's totals only, one masked row without names, context
// person with canManage false (M9-D12/D29). No DB.
import { describe, expect, it } from 'vitest'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridAssigneeRow, GridMaskedRow, GridTaskRow } from '@/lib/contracts/grid'
import type { TaskListRow } from '../repo/tasks'
import { assemblePersonGrid, type PersonAssembleInput } from './grid'

const A = 'a0000000-0000-4000-8000-00000000000a'
const B = 'b0000000-0000-4000-8000-00000000000b'

function task(id: string, projectId: string, o: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id,
    projectId,
    parentId: null,
    depth: 0,
    position: 'a0',
    name: `task ${id}`,
    startDate: null,
    dueDate: null,
    certaintyOverride: null,
    statusId: 's',
    statusCategory: 'TODO',
    completedOn: null,
    completedWeek: null,
    blockersOpen: 0,
    blockersTotal: 0,
    milestoneId: null,
    ...o,
  }
}

const week = (a: string, w: ISODate, cd: number) => ({
  taskAssignmentId: a,
  granularity: 'WEEK' as const,
  periodStart: w,
  weekStart: w,
  cd,
})

function input(o: Partial<PersonAssembleInput> = {}): PersonAssembleInput {
  return {
    person: { id: 'u', name: 'Ivy', active: true, deactivatedOn: null },
    projects: [
      { id: B, name: 'ข โปรเจค', color: '#000000', certainty: 'CONFIRMED', canEdit: true },
      { id: A, name: 'ก โปรเจค', color: '#111111', certainty: 'TENTATIVE', canEdit: false },
    ],
    taskTrees: new Map([
      [A, [task('pa', A, { name: 'แม่', position: 'a0' }), task('la', A, { parentId: 'pa', depth: 1, name: 'ลูก', position: 'a1' }), task('other', A, { position: 'a2' })]],
      [B, [task('lb', B, { name: 'งาน B', blockersOpen: 1, blockersTotal: 2 })]],
    ]),
    assignments: [
      { id: 'asA', taskId: 'la', projectId: A, version: 3 },
      { id: 'asB', taskId: 'lb', projectId: B, version: 1 },
    ],
    assigneeCounts: new Map([
      ['la', 2],
      ['lb', 1],
    ]),
    rows: [week('asA', '2026-09-28', 200), week('asB', '2026-09-28', 100)],
    totals: new Map([
      ['asA', 200],
      ['asB', 100],
    ]),
    hiddenWeeks: { '2026-10-05': { total: 300, committed: 300 } },
    hiddenDays: [],
    capacity: new Map(),
    leave: [],
    holidays: [],
    milestones: [],
    lateForMilestone: new Map([['lb', true]]),
    p: { from: '2026-09-28', to: '2026-10-12', expand: [], zoom: 'week', includeOthers: true },
    today: '2026-09-30',
    viewer: { id: 'viewer', role: 'worker' },
    ...o,
  }
}

describe('assemblePersonGrid', () => {
  it('rows: projects by compareThai, flattened task rows with breadcrumb, own assignee rows, masked last', () => {
    const g = assemblePersonGrid(input())
    expect(g.rows.map((r) => (r.kind === 'project' ? `p:${r.name}` : r.kind === 'task' ? `t:${r.name}` : r.kind))).toEqual([
      'p:ก โปรเจค',
      't:ลูก',
      'assignee',
      'p:ข โปรเจค',
      't:งาน B',
      'assignee',
      'masked',
    ])
    const child = g.rows[1] as GridTaskRow
    expect(child).toMatchObject({
      depth: 0,
      parentId: null,
      hasChildren: false,
      projectId: A,
      breadcrumb: ['แม่'],
      assigneeCount: 2,
      certainty: 'TENTATIVE',
      totals: { 'W:2026-09-28': { total: 200, committed: 0 } },
    })
    expect((g.rows[2] as GridAssigneeRow).editable).toBe(false) // project A not editable for the viewer
    expect((g.rows[5] as GridAssigneeRow).editable).toBe(true)
    expect(g.rows[4]).toMatchObject({ blockers: { open: 1, total: 2 }, lateForMilestone: true })
    expect(g.rows[0]).toMatchObject({ kind: 'project', totals: { 'W:2026-09-28': { total: 200, committed: 0 } } })
    expect(g.rows[6] as GridMaskedRow).toEqual({
      kind: 'masked',
      userId: 'u',
      label: th.masking.otherProjects,
      totals: { 'W:2026-10-05': { total: 300, committed: 300 } },
    })
    expect(g.context).toEqual({
      kind: 'person',
      id: 'u',
      name: 'Ivy',
      active: true,
      deactivatedOn: null,
      canEdit: true,
      canManage: false,
    })
    expect(g.window.includeOthers).toBe(false)
    expect(Object.keys(g.people)).toEqual(['u'])
    expect(g.people.u!.otherProjects).toBeUndefined()
  })

  it('no hidden load → no masked row; no projects → empty rows and canEdit false', () => {
    const g = assemblePersonGrid(input({ hiddenWeeks: {}, projects: [], assignments: [], rows: [] }))
    expect(g.rows).toEqual([])
    expect(g.context.canEdit).toBe(false)
  })
})
