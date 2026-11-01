// M6 S2.2 — pure grid assembly (assembleGrid, aggregateTaskTotals, assigneeCells): tree order, merge-independent
// rows, BR-50/BR-37 totals, leave masking (§3.3), otherProjects numbers only (X29). No DB.
import { describe, expect, it } from 'vitest'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridAssigneeRow, GridTaskRow } from '@/lib/contracts/grid'
import type { TaskListRow } from '../repo/tasks'
import { aggregateTaskTotals, assembleGrid, assigneeCells, type AssembleInput } from './grid'

const P = 'p0000000-0000-4000-8000-000000000000'

function task(id: string, o: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id,
    projectId: P,
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
    ...o,
  }
}

function input(o: Partial<AssembleInput> = {}): AssembleInput {
  return {
    project: { id: P, name: 'P', certainty: 'CONFIRMED', archived: false },
    tasks: [],
    assignments: [],
    rows: [],
    totals: new Map(),
    people: [],
    capacity: new Map(),
    leave: [],
    holidays: [],
    others: null,
    p: { from: '2026-09-28', to: '2026-10-12', expand: [], zoom: 'week', includeOthers: false },
    today: '2026-09-30',
    viewer: { id: 'viewer', role: 'worker' },
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

describe('assigneeCells', () => {
  it('WEEK rows → cells; DAY rows → Σ + days', () => {
    expect(
      assigneeCells([
        week('a', '2026-09-28', 250),
        { taskAssignmentId: 'a', granularity: 'DAY', periodStart: '2026-10-06', weekStart: '2026-10-05', cd: 25 },
        { taskAssignmentId: 'a', granularity: 'DAY', periodStart: '2026-10-11', weekStart: '2026-10-05', cd: 100 },
      ]),
    ).toEqual({
      'W:2026-09-28': { cd: 250, resolution: 'WEEK', derived: false },
      'W:2026-10-05': { cd: 125, resolution: 'DAY', derived: false, days: { '2026-10-06': 25, '2026-10-11': 100 } },
    })
  })
})

describe('aggregateTaskTotals (BR-37, BR-50)', () => {
  it('leaves counted under their own completed week and certainty; parents = Σ children; 0/0 keys omitted', () => {
    const cell = (cd: number) => ({ cd, resolution: 'WEEK' as const, derived: false })
    const out = aggregateTaskTotals([
      { id: 'root', parentId: null, completedWeek: '2026-09-28', certainty: 'CONFIRMED', cells: [] },
      {
        id: 'done',
        parentId: 'root',
        completedWeek: '2026-09-28',
        certainty: 'CONFIRMED',
        cells: [{ 'W:2026-09-28': cell(100), 'W:2026-10-05': cell(200) }],
      },
      {
        id: 'open',
        parentId: 'root',
        completedWeek: null,
        certainty: 'TENTATIVE',
        cells: [{ 'W:2026-10-05': cell(50) }, { 'W:2026-10-05': cell(25), 'W:2026-10-12': cell(0) }],
      },
    ])
    expect(out.get('done')).toEqual({ 'W:2026-09-28': { total: 100, committed: 100 } })
    expect(out.get('open')).toEqual({ 'W:2026-10-05': { total: 75, committed: 0 } })
    // a completed parent does not stop its open children counting (M6-D12)
    expect(out.get('root')).toEqual({
      'W:2026-09-28': { total: 100, committed: 100 },
      'W:2026-10-05': { total: 75, committed: 0 },
    })
  })
})

describe('assembleGrid', () => {
  it('depth-first by position (COLLATE "C") then id; each task followed by its assignees; inherited certainty', () => {
    const tasks = [
      task('r2', { position: 'a1' }),
      task('r1', { position: 'a0', certaintyOverride: 'TENTATIVE', name: 'Root one' }),
      task('c2', { parentId: 'r1', depth: 1, position: 'Zz' }),
      task('c1', { parentId: 'r1', depth: 1, position: 'Zz' }),
      task('orphan', { parentId: 'gone', depth: 1 }),
    ]
    const g = assembleGrid(
      input({
        tasks,
        assignments: [
          { id: 'a2', taskId: 'c1', userId: 'u1', version: 3 },
          { id: 'a1', taskId: 'c1', userId: 'u2', version: 1 },
        ],
        rows: [week('a2', '2026-09-28', 300)],
        totals: new Map([['a2', 900]]),
      }),
    )
    expect(g.rows.map((r) => (r.kind === 'task' ? r.id : r.taskAssignmentId))).toEqual(['r1', 'c1', 'a2', 'a1', 'c2', 'r2'])
    const c1 = g.rows[1] as GridTaskRow
    expect(c1).toMatchObject({
      certainty: 'TENTATIVE',
      certaintySource: 'ancestor',
      certaintySourceName: 'Root one',
      assigneeCount: 2,
      hasChildren: false,
    })
    expect(c1.totals).toEqual({ 'W:2026-09-28': { total: 300, committed: 0 } })
    expect((g.rows[0] as GridTaskRow).totals).toEqual(c1.totals)
    expect(g.rows[2] as GridAssigneeRow).toMatchObject({ version: 3, editable: true, rowTotal: { total: 900, committed: 0 } })
    expect(g.rows[3] as GridAssigneeRow).toMatchObject({ cells: {}, rowTotal: { total: 0, committed: 0 } })
    expect(g.periods.map((p) => p.key)).toEqual(['W:2026-09-28', 'W:2026-10-05'])
  })

  it('archived → canEdit false; parent assignee rows never editable', () => {
    const g = assembleGrid(
      input({
        project: { id: P, name: 'P', certainty: 'CONFIRMED', archived: true },
        tasks: [task('t')],
        assignments: [{ id: 'a', taskId: 't', userId: 'u', version: 1 }],
      }),
    )
    expect(g.context).toEqual({ kind: 'project', id: P, name: 'P', archived: true, canEdit: false })
    expect((g.rows[1] as GridAssigneeRow).editable).toBe(false)
    const parent = assembleGrid(
      input({
        tasks: [task('t'), task('k', { parentId: 't', depth: 1 })],
        assignments: [{ id: 'a', taskId: 't', userId: 'u', version: 1 }],
      }),
    )
    expect((parent.rows[1] as GridAssigneeRow).editable).toBe(false)
  })

  it('people: capacity W: keys for every week (missing = 0); leave masked unless manager/self; otherProjects only when included', () => {
    const leaveRow = {
      id: 'to1',
      userId: 'u',
      startDate: '2026-09-29',
      endDate: '2026-09-29',
      half: 'AM' as const,
      note: 'secret note',
      leaveTypeId: 'lt',
      leaveTypeName: 'ลาพักร้อน',
      leaveTypeColor: '#123456',
      leaveTypeArchived: false,
    }
    const base = input({
      people: [{ id: 'u', name: 'U', active: false, deactivatedOn: '2026-10-01' }],
      capacity: new Map([
        ['u', { days: {}, weeks: { '2026-09-28': { capacityCd: 150, standardCd: 500 } } }],
      ]),
      leave: [leaveRow],
    })
    const g = assembleGrid(base)
    expect(g.people.u).toEqual({
      name: 'U',
      active: false,
      deactivatedOn: '2026-10-01',
      capacity: { 'W:2026-09-28': 150, 'W:2026-10-05': 0 },
      standard: { 'W:2026-09-28': 500, 'W:2026-10-05': 0 },
      timeOff: [{ start: '2026-09-29', end: '2026-09-29', half: 'AM', label: th.masking.leave }],
    })
    expect(JSON.stringify(g)).not.toContain('secret note')
    expect(assembleGrid({ ...base, viewer: { id: 'u', role: 'worker' } }).people.u!.timeOff[0]!.label).toBe('ลาพักร้อน')
    expect(assembleGrid({ ...base, viewer: { id: 'm', role: 'manager' } }).people.u!.timeOff[0]!.label).toBe('ลาพักร้อน')
    const others = assembleGrid({
      ...base,
      others: new Map([['u', { '2026-10-05': { total: 300, committed: 0 } }]]),
      p: { ...base.p, includeOthers: true },
    })
    expect(others.people.u!.otherProjects).toEqual({ 'W:2026-10-05': { total: 300, committed: 0 } })
    expect(others.window.includeOthers).toBe(true)
  })
})
