// src/lib/tasks/board.ts — kanban columns (SPEC v3.1 FR-661–666, X74). Generic so /tasks, M9 and M10 reuse it.
import { firstOfCategory, sortStatuses } from '@/domain/status'
import type { Certainty, TaskStatusCategory } from '@/domain/types'
import type { StatusRef, TaskCard, TaskStatusDTO } from '@/lib/contracts/tasks'
import type { TaskRowModel } from './tree'

export interface BoardColumn<C> {
  key: string
  /** null for category columns (/tasks). */
  statusId: string | null
  category: TaskStatusCategory
  /** null for category columns (/tasks). */
  status: StatusRef | null
  cards: C[]
}

/** Board order of the category columns on /tasks (FR-665). */
const CATEGORIES: readonly TaskStatusCategory[] = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE']

const refOf = (s: TaskStatusDTO): StatusRef => ({
  id: s.id,
  name: s.name,
  color: s.color,
  category: s.category,
})

/** Board milestone filter (FR-663, M8-D15): every card, the unbound cards, or the cards bound to one milestone id. */
export type BoardMilestoneFilter = 'ALL' | 'NONE' | (string & {})

function matchesMilestone(milestoneId: string | null, f: BoardMilestoneFilter): boolean {
  if (f === 'ALL') return true
  if (f === 'NONE') return milestoneId === null
  return milestoneId === f
}

/**
 * Project board: one column per live status in position order (empty columns kept); cards in DFS order; `hideDone`
 * drops DONE columns; `leafOnly` drops parents; `assigneeId` keeps the leaves assigned to that user (parents dropped);
 * `milestone` (default 'ALL', M8-D15) keeps the cards bound to that milestone (parents too) or the unbound ones.
 */
export function buildStatusColumns(
  rows: readonly TaskRowModel[],
  statuses: readonly TaskStatusDTO[],
  o: { leafOnly: boolean; hideDone: boolean; assigneeId: string | null; milestone?: BoardMilestoneFilter },
): BoardColumn<TaskRowModel>[] {
  const milestone = o.milestone ?? 'ALL'
  const cards = rows.filter(
    (r) =>
      (!o.leafOnly || r.isLeaf) &&
      (o.assigneeId === null || (r.isLeaf && r.assignees.some((a) => a.userId === o.assigneeId))) &&
      matchesMilestone(r.milestoneId, milestone),
  )
  return sortStatuses(statuses)
    .filter((s) => !(o.hideDone && s.category === 'DONE'))
    .map((s) => ({
      key: `status:${s.id}`,
      statusId: s.id,
      category: s.category,
      status: refOf(s),
      cards: cards.filter((r) => r.statusId === s.id),
    }))
}

/** /tasks board: the 4 fixed category columns (statusId null), card order preserved; `hideDone` drops DONE. */
export function buildCategoryColumns<C extends { status: StatusRef }>(
  cards: readonly C[],
  o: { hideDone: boolean },
): BoardColumn<C>[] {
  return CATEGORIES.filter((c) => !(o.hideDone && c === 'DONE')).map((category) => ({
    key: `category:${category}`,
    statusId: null,
    category,
    status: null,
    cards: cards.filter((c) => c.status.category === category),
  }))
}

/** FR-666: a drop on a category column → the first status of that category in the task's project, or null (toast). */
export function resolveCategoryDrop(
  statusesByProject: Readonly<Record<string, readonly TaskStatusDTO[]>>,
  projectId: string,
  category: TaskStatusCategory,
): string | null {
  return firstOfCategory(statusesByProject[projectId] ?? [], category)?.id ?? null
}

/**
 * Project board row → the shared TaskCard shape (S3.16). `certainty` is the caller's effective value (taskCertainty,
 * BR-35). RangeError when the row's status is not in `statuses` (BR-83: they come from the same response).
 */
export function toCardModel(
  row: TaskRowModel,
  statuses: readonly TaskStatusDTO[],
  certainty: Certainty,
): TaskCard {
  const status = statuses.find((s) => s.id === row.statusId)
  if (!status) throw new RangeError(`status ${row.statusId} of task ${row.id} is not in the list`)
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    parentPath: row.parentPath,
    status: refOf(status),
    assigneeIds: row.assignees.map((a) => a.userId),
    dueDate: row.dueDate,
    certainty,
    completed: row.completedOn !== null,
    blockers: row.blockers,
    hasBody: row.hasBody,
    milestoneId: row.milestoneId,
  }
}
