import { describe, expect, it } from 'vitest'
import type { TaskDTO, TaskStatusDTO } from '@/lib/contracts/tasks'
import { groupTasks } from './group'
import { buildTaskRows } from './tree'

const task = (id: string, parentId: string | null, position: string, x: Partial<TaskDTO> = {}): TaskDTO => ({
  id,
  projectId: 'pos',
  parentId,
  depth: 0,
  position,
  name: id,
  notes: null,
  startDate: null,
  dueDate: null,
  certaintyOverride: null,
  completedOn: null,
  assignees: [],
  statusId: 'todo',
  blockers: { open: 0, total: 0 },
  ...x,
})
const st = (
  id: string,
  name: string,
  category: TaskStatusDTO['category'],
  position: string,
): TaskStatusDTO => ({
  id,
  projectId: 'pos',
  name,
  color: '#94A3B8',
  category,
  position,
})
// P-like statuses, given out of order
const statuses = [
  st('done', 'เสร็จ', 'DONE', 'a4'),
  st('todo', 'ยังไม่เริ่ม', 'TODO', 'a0'),
  st('doing', 'กำลังทำ', 'IN_PROGRESS', 'a1'),
  st('wait', 'รอข้อมูล', 'WAITING', 'a2'),
  st('blocked', 'ติดปัญหา', 'WAITING', 'a3'),
]
const names: Record<string, string> = { cindy: 'Cindy', ivy: 'Ivy', kif: 'กิ๊ฟ', aom: 'อ้อม' }
const ctx = { projectCertainty: 'CONFIRMED' as const, displayName: (u: string) => names[u] ?? u, statuses }
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)
const a = (assignmentId: string, userId: string) => ({ assignmentId, userId })

describe('FR-613 groupTasks', () => {
  const rows = buildTaskRows([
    task('P', null, 'a0'),
    task('L1', 'P', 'a0', { depth: 1, assignees: [a('1', 'ivy'), a('2', 'cindy')] }),
    task('L2', 'P', 'a1', { depth: 1, assignees: [a('3', 'ivy')], statusId: 'doing' }),
    task('L3', 'P', 'a2', { depth: 1 }),
    task('Q', null, 'a1', { statusId: 'doing' }),
  ])

  it("'none' → one group with every row in order", () => {
    expect(groupTasks(rows, 'none', ctx)).toEqual([{ key: 'all', kind: 'all', rows }])
  })

  it("M3-D7 'assignee': leaves under each assignee by display name + unassigned leaves; parents in none", () => {
    const groups = groupTasks(rows, 'assignee', ctx)
    expect(groups.map((g) => [g.key, g.kind, g.userId, ids(g.rows)])).toEqual([
      ['user:cindy', 'assignee', 'cindy', ['L1']],
      ['user:ivy', 'assignee', 'ivy', ['L1', 'L2']],
      ['unassigned', 'unassigned', undefined, ['L3', 'Q']],
    ])
    // each row keeps its parent path for the grouped view
    expect(groups[1]?.rows[0]?.parentPath).toEqual(['P'])
  })

  it("'assignee': Thai display names in Intl.Collator('th') order; no unassigned group when every leaf is assigned", () => {
    const thai = buildTaskRows([
      task('X', null, 'a0', { assignees: [a('1', 'aom')] }),
      task('Y', null, 'a1', { assignees: [a('2', 'kif')] }),
    ])
    expect(groupTasks(thai, 'assignee', ctx).map((g) => g.userId)).toEqual(['kif', 'aom'])
  })

  it("'assignee': equal display names are ordered by user id", () => {
    const same = buildTaskRows([
      task('X', null, 'a0', { assignees: [a('1', 'u2')] }),
      task('Y', null, 'a1', { assignees: [a('2', 'u1')] }),
    ])
    expect(groupTasks(same, 'assignee', { ...ctx, displayName: () => 'Same' }).map((g) => g.userId)).toEqual([
      'u1',
      'u2',
    ])
  })

  it("BR-35 'certainty': CONFIRMED then TENTATIVE; a child of a TENTATIVE parent lands in TENTATIVE", () => {
    const pos = buildTaskRows([
      task('UAT', null, 'a0'),
      task('Rollout สาขา', null, 'a1', { certaintyOverride: 'TENTATIVE' }),
      task('R1', 'Rollout สาขา', 'a0', { depth: 1 }),
      task('Train', null, 'a2'),
    ])
    expect(groupTasks(pos, 'certainty', ctx).map((g) => [g.key, g.kind, g.certainty, ids(g.rows)])).toEqual([
      ['certainty:CONFIRMED', 'certainty', 'CONFIRMED', ['UAT', 'Train']],
      ['certainty:TENTATIVE', 'certainty', 'TENTATIVE', ['Rollout สาขา', 'R1']],
    ])
  })

  it("'certainty': empty groups are omitted", () => {
    const tentative = buildTaskRows([task('A', null, 'a0')])
    expect(
      groupTasks(tentative, 'certainty', { ...ctx, projectCertainty: 'TENTATIVE' }).map((g) => g.key),
    ).toEqual(['certainty:TENTATIVE'])
  })

  it("v3.1 'status': one group per status in position order, empty groups kept, every depth in DFS order", () => {
    const groups = groupTasks(rows, 'status', ctx)
    expect(groups.map((g) => [g.key, g.kind, g.statusId, ids(g.rows)])).toEqual([
      ['status:todo', 'status', 'todo', ['P', 'L1', 'L3']],
      ['status:doing', 'status', 'doing', ['L2', 'Q']],
      ['status:wait', 'status', 'wait', []],
      ['status:blocked', 'status', 'blocked', []],
      ['status:done', 'status', 'done', []],
    ])
  })
})
