// Test-only builders of GridResponse chunks (golden numbers from plan/research/r8-golden.md §4.5/§6.3).
// Not imported by app code.
import { splitLoad, addLoad, ZERO_LOAD } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import { addWeeks, compareISO } from '@/domain/dates'
import type { Certainty, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type {
  AssigneeCell,
  GridAssigneeRow,
  GridPerson,
  GridResponse,
  GridRow,
  GridTaskRow,
} from '@/lib/contracts/grid'

export interface FxAssignee {
  taId: string
  userId: string
  version?: number
  /** week → cd (WEEK) or { days } (DAY week; Σ days) */
  cells: Record<ISODate, number | { days: Record<ISODate, number> }>
}
export interface FxTask {
  id: string
  name: string
  parentId?: string | null
  depth?: 0 | 1 | 2
  certainty?: Certainty
  certaintySource?: 'task' | 'ancestor' | 'project'
  certaintySourceName?: string | null
  completedWeek?: ISODate | null
  blockers?: { open: number; total: number }
  assignees: FxAssignee[]
}
export interface FxPerson {
  name: string
  active?: boolean
  deactivatedOn?: ISODate | null
  /** default 500 every week */
  capacity?: Record<ISODate, number>
  defaultCapacity?: number
  timeOff?: GridPerson['timeOff']
  otherProjects?: Record<ISODate, LoadPair>
}

function cellOf(v: number | { days: Record<ISODate, number> }): AssigneeCell {
  if (typeof v === 'number') return { cd: v, resolution: 'WEEK', derived: false }
  const cd = Object.values(v.days).reduce((a, b) => a + b, 0)
  return { cd, resolution: 'DAY', derived: false, days: { ...v.days } }
}

function inRange(w: ISODate, from: ISODate, to: ISODate): boolean {
  return compareISO(w, from) >= 0 && compareISO(w, to) < 0
}

export function gridResponse(o: {
  from: ISODate
  weeks?: number
  projectName?: string
  archived?: boolean
  canEdit?: boolean
  includeOthers?: boolean
  tasks: FxTask[]
  people: Record<string, FxPerson>
  holidays?: { date: ISODate; name: string }[]
}): GridResponse {
  const weeks = o.weeks ?? 8
  const to = addWeeks(o.from, weeks)
  const periodWeeks = Array.from({ length: weeks }, (_, i) => addWeeks(o.from, i))
  const byId = new Map(o.tasks.map((t) => [t.id, t]))
  const hasChildren = (id: string) => o.tasks.some((t) => t.parentId === id)
  const leavesOf = (id: string): FxTask[] =>
    hasChildren(id)
      ? o.tasks.filter((t) => t.parentId === id).flatMap((c) => leavesOf(c.id))
      : [byId.get(id)!]
  const certaintyOf = (t: FxTask): Certainty => t.certainty ?? 'CONFIRMED'

  const rows: GridRow[] = []
  for (const t of o.tasks) {
    const totals: Partial<Record<PeriodKey, LoadPair>> = {}
    for (const leaf of leavesOf(t.id)) {
      for (const a of leaf.assignees) {
        for (const [w, v] of Object.entries(a.cells)) {
          if (!inRange(w, o.from, to) || !countsTowardLoad(w, leaf.completedWeek ?? null)) continue
          const k: PeriodKey = `W:${w}`
          totals[k] = addLoad(totals[k] ?? ZERO_LOAD, splitLoad(cellOf(v).cd, certaintyOf(leaf)))
        }
      }
    }
    const taskRow: GridTaskRow = {
      kind: 'task',
      id: t.id,
      depth: t.depth ?? 0,
      name: t.name,
      parentId: t.parentId ?? null,
      hasChildren: hasChildren(t.id),
      certainty: certaintyOf(t),
      certaintySource: t.certaintySource ?? 'project',
      certaintySourceName: t.certaintySourceName ?? null,
      completed: (t.completedWeek ?? null) !== null,
      completedWeek: t.completedWeek ?? null,
      milestoneId: null,
      lateForMilestone: false,
      blockers: t.blockers ?? { open: 0, total: 0 },
      assigneeCount: t.assignees.length,
      totals,
    }
    rows.push(taskRow)
    for (const a of t.assignees) {
      const cells: Partial<Record<PeriodKey, AssigneeCell>> = {}
      let rowTotal: LoadPair = ZERO_LOAD
      for (const [w, v] of Object.entries(a.cells)) {
        const c = cellOf(v)
        if (countsTowardLoad(w, t.completedWeek ?? null))
          rowTotal = addLoad(rowTotal, splitLoad(c.cd, certaintyOf(t)))
        if (inRange(w, o.from, to)) cells[`W:${w}`] = c
      }
      const row: GridAssigneeRow = {
        kind: 'assignee',
        taskAssignmentId: a.taId,
        taskId: t.id,
        userId: a.userId,
        version: a.version ?? 1,
        editable: (o.canEdit ?? true) && !hasChildren(t.id),
        rowTotal,
        cells,
      }
      rows.push(row)
    }
  }

  const people: Record<string, GridPerson> = {}
  for (const [id, p] of Object.entries(o.people)) {
    const capacity: Partial<Record<PeriodKey, number>> = {}
    const standard: Partial<Record<PeriodKey, number>> = {}
    for (const w of periodWeeks) {
      capacity[`W:${w}`] = p.capacity?.[w] ?? p.defaultCapacity ?? 500
      standard[`W:${w}`] = 500
    }
    const person: GridPerson = {
      name: p.name,
      active: p.active ?? true,
      deactivatedOn: p.deactivatedOn ?? null,
      capacity,
      standard,
      timeOff: p.timeOff ?? [],
    }
    if (o.includeOthers) {
      const other: Partial<Record<PeriodKey, LoadPair>> = {}
      for (const [w, v] of Object.entries(p.otherProjects ?? {}))
        if (inRange(w, o.from, to)) other[`W:${w}`] = v
      person.otherProjects = other
    }
    people[id] = person
  }

  return {
    context: {
      kind: 'project',
      id: 'p-pos',
      name: o.projectName ?? 'POS Upgrade',
      archived: o.archived ?? false,
      canEdit: o.canEdit ?? !(o.archived ?? false),
    },
    window: { from: o.from, to, expand: [], zoom: 'week', includeOthers: o.includeOthers ?? false },
    today: '2026-09-30',
    periods: periodWeeks.map((w) => ({
      key: `W:${w}` as const,
      kind: 'WEEK' as const,
      weekStart: w,
      date: w,
    })),
    rows,
    milestones: [],
    people,
    holidays: (o.holidays ?? []).filter((h) => inRange(h.date, o.from, to)),
  }
}

export const POS_TASKS: FxTask[] = [
  {
    id: 't-pos',
    name: 'ปรับปรุงระบบ POS หน้าร้าน',
    assignees: [
      {
        taId: 'a-cindy-pos',
        userId: 'cindy',
        cells: {
          '2026-08-31': 500,
          '2026-09-07': 500,
          '2026-09-14': 375,
          '2026-09-21': 250,
          '2026-09-28': 250,
        },
      },
    ],
  },
  {
    id: 't-uat',
    name: 'ทำ UAT + คู่มือหน้าร้าน',
    assignees: [
      {
        taId: 'a-ivy-uat',
        userId: 'ivy',
        cells: { '2026-09-14': 250, '2026-09-21': 250, '2026-09-28': 250, '2026-10-05': 125 },
      },
    ],
  },
  {
    id: 't-rollout',
    name: 'Rollout สาขา',
    certainty: 'TENTATIVE',
    certaintySource: 'task',
    certaintySourceName: 'Rollout สาขา',
    blockers: { open: 1, total: 1 },
    assignees: [
      {
        taId: 'a-mix-rollout',
        userId: 'mint',
        cells: {
          '2026-11-30': 250,
          '2026-12-07': 375,
          '2026-12-14': 500,
          '2026-12-21': 500,
          '2026-12-28': 250,
        },
      },
    ],
  },
]

export const POS_PEOPLE: Record<string, FxPerson> = {
  cindy: { name: 'Cindy' },
  ivy: { name: 'Ivy' },
  mint: { name: 'Mint' },
}

/** POS as two adjacent 8-week chunks starting at the golden window (2026-08-31, 2026-10-26). */
export function posChunks(
  o: { includeOthers?: boolean; archived?: boolean } = {},
): [GridResponse, GridResponse] {
  return [
    gridResponse({ from: '2026-08-31', tasks: POS_TASKS, people: POS_PEOPLE, ...o }),
    gridResponse({ from: '2026-10-26', tasks: POS_TASKS, people: POS_PEOPLE, ...o }),
  ]
}

export const CRM_TASKS: FxTask[] = [
  {
    id: 't-crm-move',
    name: 'ย้ายข้อมูลลูกค้า',
    certainty: 'TENTATIVE',
    assignees: [
      {
        taId: 'a-cindy-crm',
        userId: 'cindy',
        cells: {
          '2026-10-05': 250,
          '2026-10-12': 250,
          '2026-10-19': 375,
          '2026-10-26': 375,
          '2026-11-02': 250,
        },
      },
    ],
  },
  {
    id: 't-crm-auto',
    name: 'ตั้งค่า automation',
    certainty: 'TENTATIVE',
    assignees: [
      {
        taId: 'a-ivy-crm',
        userId: 'ivy',
        cells: { '2026-10-12': 250, '2026-10-19': 250, '2026-10-26': 250, '2026-11-02': 250 },
      },
    ],
  },
]
