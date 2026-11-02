import { describe, expect, it } from 'vitest'
import type { StatusRef, TaskCard, TaskDTO, TaskStatusDTO } from '@/lib/contracts/tasks'
import { buildCategoryColumns, buildStatusColumns, resolveCategoryDrop, toCardModel } from './board'
import { buildTaskRows } from './tree'

const task = (id: string, parentId: string | null, position: string, x: Partial<TaskDTO> = {}): TaskDTO => ({
  id,
  projectId: 'pos',
  parentId,
  depth: 0,
  position,
  name: id,
  hasBody: false,
  startDate: null,
  dueDate: null,
  certaintyOverride: null,
  completedOn: null,
  assignees: [],
  statusId: 'todo',
  blockers: { open: 0, total: 0 },
  milestoneId: null,
  lateForMilestone: false,
  ...x,
})
const st = (
  id: string,
  name: string,
  category: TaskStatusDTO['category'],
  position: string,
  projectId = 'pos',
): TaskStatusDTO => ({ id, projectId, name, color: '#15803D', category, position })
// 6 statuses (incl. an unused "รอลูกค้ายืนยัน"), out of order
const statuses = [
  st('done', 'เสร็จ', 'DONE', 'a5'),
  st('todo', 'ยังไม่เริ่ม', 'TODO', 'a0'),
  st('doing', 'กำลังทำ', 'IN_PROGRESS', 'a1'),
  st('wait', 'รอข้อมูล', 'WAITING', 'a2'),
  st('blocked', 'ติดปัญหา', 'WAITING', 'a3'),
  st('confirm', 'รอลูกค้ายืนยัน', 'WAITING', 'a4'),
]
const a = (assignmentId: string, userId: string) => ({ assignmentId, userId })
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)

const rows = buildTaskRows([
  task('P', null, 'a0', { statusId: 'doing' }),
  task('L1', 'P', 'a0', { statusId: 'doing', assignees: [a('1', 'ivy')] }),
  task('L2', 'P', 'a1', { statusId: 'done', completedOn: '2026-09-29', assignees: [a('2', 'cindy')] }),
  task('L3', null, 'a1', { statusId: 'wait', assignees: [a('3', 'ivy'), a('4', 'cindy')] }),
  task('L4', null, 'a2', { statusId: 'blocked' }),
  task('L5', null, 'a3'),
])
const noFilter = { leafOnly: false, hideDone: false, assigneeId: null }

describe('FR-661/663 buildStatusColumns', () => {
  it('one column per status in position order, the unused one empty, cards in DFS order', () => {
    const cols = buildStatusColumns(rows, statuses, noFilter)
    expect(cols.map((c) => [c.key, c.statusId, c.category, ids(c.cards)])).toEqual([
      ['status:todo', 'todo', 'TODO', ['L5']],
      ['status:doing', 'doing', 'IN_PROGRESS', ['P', 'L1']],
      ['status:wait', 'wait', 'WAITING', ['L3']],
      ['status:blocked', 'blocked', 'WAITING', ['L4']],
      ['status:confirm', 'confirm', 'WAITING', []],
      ['status:done', 'done', 'DONE', ['L2']],
    ])
    expect(cols[5]?.status).toEqual({ id: 'done', name: 'เสร็จ', color: '#15803D', category: 'DONE' })
  })

  it('leafOnly drops parents', () => {
    const cols = buildStatusColumns(rows, statuses, { ...noFilter, leafOnly: true })
    expect(ids(cols[1]?.cards ?? [])).toEqual(['L1'])
  })

  it('hideDone drops the DONE column(s)', () => {
    const twoDone = [...statuses, st('cancel', 'ยกเลิก', 'DONE', 'a6')]
    const cols = buildStatusColumns(rows, twoDone, { ...noFilter, hideDone: true })
    expect(cols.map((c) => c.statusId)).toEqual(['todo', 'doing', 'wait', 'blocked', 'confirm'])
  })

  it("assigneeId keeps only that user's leaves (parents dropped)", () => {
    const cols = buildStatusColumns(rows, statuses, { ...noFilter, assigneeId: 'ivy' })
    expect(cols.flatMap((c) => ids(c.cards))).toEqual(['L1', 'L3'])
  })
})

describe('FR-663 / M8-D15 buildStatusColumns › milestone', () => {
  const bound = buildTaskRows([
    task('P', null, 'a0', { statusId: 'doing', milestoneId: 'm1' }),
    task('L1', 'P', 'a0', { statusId: 'doing' }),
    task('L2', null, 'a1', { milestoneId: 'm1' }),
    task('L3', null, 'a2', { milestoneId: 'm2', statusId: 'wait' }),
    task('L4', null, 'a3'),
  ])
  const all = (o: Partial<Parameters<typeof buildStatusColumns>[2]>) =>
    buildStatusColumns(bound, statuses, { ...noFilter, ...o }).flatMap((c) => ids(c.cards))

  it('milestone id keeps only the cards bound to it (parents included when bound)', () => {
    expect(all({ milestone: 'm1' })).toEqual(['L2', 'P'])
  })

  it("'NONE' keeps the unbound cards", () => {
    expect(all({ milestone: 'NONE' })).toEqual(['L4', 'L1'])
  })

  it("'ALL' (and the default) = M3 behaviour", () => {
    expect(all({ milestone: 'ALL' })).toEqual(all({}))
    expect(all({})).toEqual(['L2', 'L4', 'P', 'L1', 'L3'])
  })

  it('combines with leafOnly and the column counts follow the filter', () => {
    expect(all({ milestone: 'm1', leafOnly: true })).toEqual(['L2'])
    const cols = buildStatusColumns(bound, statuses, { ...noFilter, milestone: 'm2' })
    expect(cols.map((c) => c.cards.length)).toEqual([0, 0, 1, 0, 0, 0])
  })
})

describe('FR-665 buildCategoryColumns', () => {
  const ref = (category: StatusRef['category']): StatusRef => ({
    id: category,
    name: category,
    color: '#000000',
    category,
  })
  const cards = [
    { id: 'c1', status: ref('DONE') },
    { id: 'c2', status: ref('WAITING') },
    { id: 'c3', status: ref('TODO') },
    { id: 'c4', status: ref('WAITING') },
  ]

  it('always 4 columns TODO, IN_PROGRESS, WAITING, DONE (statusId null), card order preserved', () => {
    const cols = buildCategoryColumns(cards, { hideDone: false })
    expect(cols.map((c) => [c.key, c.category, c.statusId, c.status, ids(c.cards)])).toEqual([
      ['category:TODO', 'TODO', null, null, ['c3']],
      ['category:IN_PROGRESS', 'IN_PROGRESS', null, null, []],
      ['category:WAITING', 'WAITING', null, null, ['c2', 'c4']],
      ['category:DONE', 'DONE', null, null, ['c1']],
    ])
  })

  it('hideDone → 3 columns', () => {
    expect(buildCategoryColumns(cards, { hideDone: true }).map((c) => c.category)).toEqual([
      'TODO',
      'IN_PROGRESS',
      'WAITING',
    ])
  })

  it('no cards → 4 empty columns', () => {
    expect(buildCategoryColumns([], { hideDone: false }).every((c) => c.cards.length === 0)).toBe(true)
  })
})

describe('FR-666 resolveCategoryDrop', () => {
  const byProject = {
    pos: statuses,
    crm: [st('t', 'ยังไม่เริ่ม', 'TODO', 'a0', 'crm'), st('d', 'เสร็จ', 'DONE', 'a1', 'crm')],
  }

  it('WAITING in P → รอข้อมูล (smaller position than ติดปัญหา)', () => {
    expect(resolveCategoryDrop(byProject, 'pos', 'WAITING')).toBe('wait')
  })

  it('a project without a WAITING status → null', () => {
    expect(resolveCategoryDrop(byProject, 'crm', 'WAITING')).toBeNull()
  })

  it('a project missing from the map → null', () => {
    expect(resolveCategoryDrop(byProject, 'other', 'TODO')).toBeNull()
  })
})

describe('FR-661 toCardModel', () => {
  const leaf = rows.find((r) => r.id === 'L2')!

  it('a completed leaf with two assignees → the TaskCard shape', () => {
    const twoAssignees = {
      ...leaf,
      assignees: [a('2', 'cindy'), a('5', 'ivy')],
      blockers: { open: 1, total: 2 },
    }
    const card = toCardModel(twoAssignees, statuses, 'TENTATIVE')
    const expected: TaskCard = {
      id: 'L2',
      projectId: 'pos',
      name: 'L2',
      parentPath: ['P'],
      status: { id: 'done', name: 'เสร็จ', color: '#15803D', category: 'DONE' },
      assigneeIds: ['cindy', 'ivy'],
      dueDate: null,
      certainty: 'TENTATIVE',
      completed: true,
      blockers: { open: 1, total: 2 },
      hasBody: false,
      milestoneId: null,
    }
    expect(card).toEqual(expected)
  })

  it('FR-691 (M6.1): hasBody is carried to the card (📄)', () => {
    expect(toCardModel({ ...leaf, hasBody: true }, statuses, 'CONFIRMED').hasBody).toBe(true)
  })

  it('M3-D42 (M3-only): the result has exactly the TaskCard keys', () => {
    expect(Object.keys(toCardModel(leaf, statuses, 'CONFIRMED')).sort()).toEqual(
      [
        'assigneeIds',
        'blockers',
        'certainty',
        'completed',
        'dueDate',
        'hasBody',
        'id',
        'milestoneId',
        'name',
        'parentPath',
        'projectId',
        'status',
      ].sort(),
    )
  })

  it('an open row → completed false', () => {
    expect(
      toCardModel(
        rows.find((r) => r.id === 'L5')!,
        statuses,
        'CONFIRMED',
      ).completed,
    ).toBe(false)
  })

  it('a status id missing from the list → RangeError (BR-83)', () => {
    expect(() => toCardModel(leaf, [], 'CONFIRMED')).toThrow(RangeError)
  })
})
