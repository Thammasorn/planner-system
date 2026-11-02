// Test-only builders of person-context GridResponse chunks (M9-D12, SPEC §7.4). Golden numbers from
// plan/research/r8-golden.md (F1 Ivy: CRM + POS; F3 Peter: hidden projects only). Not imported by app code.
import { addLoad, ZERO_LOAD } from '@/domain/certainty'
import type { Certainty, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type {
  GridMilestone,
  GridProjectRow,
  GridResponse,
  GridRow,
  GridTaskRow,
} from '@/lib/contracts/grid'
import { CRM_TASKS, gridResponse, POS_TASKS, type FxPerson, type FxTask } from './fixtures.test.data'

/** One of the person's tasks in a project (only that person's assignee is listed, as the server sends it). */
export interface FxPersonTask extends FxTask {
  /** the real number of assignees of the task (M9 merges regardless, S3.2) */
  assigneeCount?: number
  breadcrumb?: string[]
  completed?: boolean
}
export interface FxPersonProject {
  id: string
  name: string
  color?: string
  certainty?: Certainty
  canEdit?: boolean
  tasks: FxPersonTask[]
}

export function personResponse(o: {
  from: ISODate
  weeks?: number
  userId: string
  person: FxPerson
  projects: FxPersonProject[]
  /** Σ hidden projects per week (W: keys) — the masked row (absent → no masked row) */
  masked?: Record<ISODate, LoadPair>
  /** D: keys of the masked row (expanded weeks / day zoom) */
  maskedDays?: Record<ISODate, LoadPair>
  canEdit?: boolean
  expand?: ISODate[]
  milestones?: GridMilestone[]
}): GridResponse {
  const rows: GridRow[] = []
  let base: GridResponse | null = null
  for (const p of o.projects) {
    const canEdit = (o.canEdit ?? true) && (p.canEdit ?? true)
    const r = gridResponse({
      from: o.from,
      ...(o.weeks !== undefined ? { weeks: o.weeks } : {}),
      tasks: p.tasks,
      people: { [o.userId]: o.person },
      canEdit,
      ...(o.expand ? { expand: o.expand } : {}),
    })
    base ??= r
    const totals: Partial<Record<PeriodKey, LoadPair>> = {}
    const projectRow: GridProjectRow = {
      kind: 'project',
      id: p.id,
      name: p.name,
      color: p.color ?? '#3366cc',
      certainty: p.certainty ?? 'CONFIRMED',
      canEdit,
      totals,
    }
    rows.push(projectRow)
    for (const row of r.rows) {
      if (row.kind === 'task') {
        const fx = p.tasks.find((t) => t.id === row.id)
        const task: GridTaskRow = {
          ...row,
          depth: 0,
          parentId: null,
          hasChildren: false,
          projectId: p.id,
          breadcrumb: fx?.breadcrumb ?? [],
          assigneeCount: fx?.assigneeCount ?? row.assigneeCount,
          completed: fx?.completed ?? row.completed,
        }
        for (const [k, v] of Object.entries(row.totals) as [PeriodKey, LoadPair][])
          totals[k] = addLoad(totals[k] ?? ZERO_LOAD, v)
        rows.push(task)
      } else rows.push(row)
    }
  }
  base ??= gridResponse({ from: o.from, ...(o.weeks !== undefined ? { weeks: o.weeks } : {}), tasks: [], people: { [o.userId]: o.person } })
  if (o.masked || o.maskedDays) {
    const totals: Partial<Record<PeriodKey, LoadPair>> = {}
    for (const [w, v] of Object.entries(o.masked ?? {})) if (base.periods.some((p) => p.key === `W:${w}`)) totals[`W:${w}`] = v
    for (const [d, v] of Object.entries(o.maskedDays ?? {})) totals[`D:${d}`] = v
    rows.push({ kind: 'masked', userId: o.userId, label: 'งานในโปรเจคอื่น', totals })
  }
  return {
    ...base,
    context: {
      kind: 'person',
      id: o.userId,
      name: o.person.name,
      active: o.person.active ?? true,
      deactivatedOn: o.person.deactivatedOn ?? null,
      canEdit: o.canEdit ?? true,
      canManage: false,
    },
    rows,
    milestones: o.milestones ?? [],
  }
}

/** F1 Ivy: CRM (ตั้งค่า automation) + POS (ทำ UAT + คู่มือหน้าร้าน). */
export const IVY_PROJECTS: FxPersonProject[] = [
  {
    id: 'p-crm',
    name: 'CRM',
    certainty: 'TENTATIVE',
    tasks: CRM_TASKS.filter((t) => t.id === 't-crm-auto').map((t) => ({ ...t, breadcrumb: ['ย้ายระบบ'] })),
  },
  {
    id: 'p-pos',
    name: 'POS Upgrade',
    tasks: POS_TASKS.filter((t) => t.id === 't-uat').map((t) => ({ ...t, assigneeCount: 2 })),
  },
]

export function ivyResponse(o: { from?: ISODate; masked?: Record<ISODate, LoadPair>; canEdit?: boolean } = {}): GridResponse {
  return personResponse({
    from: o.from ?? '2026-09-28',
    userId: 'ivy',
    person: { name: 'Ivy' },
    projects: IVY_PROJECTS,
    ...(o.masked ? { masked: o.masked } : {}),
    ...(o.canEdit !== undefined ? { canEdit: o.canEdit } : {}),
  })
}
