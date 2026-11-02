// src/lib/tasks/group.ts — list grouping (FR-613, M3-D7; group by milestone M8-D13, X21). Labels are the UI's (th.ts);
// keys and kinds here are language-free.
import { compareMilestones } from '@/domain/milestone'
import { sortStatuses } from '@/domain/status'
import type { Certainty } from '@/domain/types'
import { compareThai } from '@/lib/collate'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import type { TaskStatusDTO } from '@/lib/contracts/tasks'
import { compareKeys } from '@/lib/tree/ops'
import { taskCertainty } from './certainty'
import type { TaskRowModel } from './tree'

export type GroupBy = 'none' | 'status' | 'assignee' | 'certainty' | 'milestone'

export interface TaskGroup {
  key: string
  kind: 'all' | 'status' | 'assignee' | 'unassigned' | 'certainty' | 'milestone' | 'noMilestone'
  statusId?: string
  milestoneId?: string
  userId?: string
  certainty?: Certainty
  rows: TaskRowModel[]
}

/** แน่นอน, then อาจไม่ทำ (M3-D7). */
const CERTAINTY_ORDER: readonly Certainty[] = ['CONFIRMED', 'TENTATIVE']

/**
 * - `none`: one group with every row.
 * - `status`: one group per live status in position order (empty groups kept), every depth, DFS order inside.
 * - `assignee`: leaves only, one group per assignee by display name (Intl.Collator('th'), then user id), then the
 *   unassigned leaves ("รอมอบหมาย") when there are any. A multi-assignee leaf appears under each assignee (X62).
 * - `certainty`: every row by effective certainty (BR-35), CONFIRMED then TENTATIVE; empty groups omitted.
 *   Ancestors of a row must be in `rows` (visibleRows never hides the ancestor of a visible row).
 * - `milestone` (M8-D13): one group per live milestone in compareMilestones order (empty groups kept), then the
 *   unbound rows ('noMilestone', key 'milestone:none', always last); every depth, DFS order inside. A row bound to a
 *   milestone that is not in `ctx.milestones` (deleted) reads as unbound (M8-D5).
 */
export function groupTasks(
  rows: readonly TaskRowModel[],
  by: GroupBy,
  ctx: {
    projectCertainty: Certainty
    displayName: (userId: string) => string
    statuses: readonly TaskStatusDTO[]
    milestones: readonly MilestoneRef[]
  },
): TaskGroup[] {
  switch (by) {
    case 'none':
      return [{ key: 'all', kind: 'all', rows: [...rows] }]
    case 'milestone': {
      const live = [...ctx.milestones].sort(compareMilestones)
      const known = new Set(live.map((m) => m.id))
      const groups: TaskGroup[] = live.map((m) => ({
        key: `milestone:${m.id}`,
        kind: 'milestone',
        milestoneId: m.id,
        rows: rows.filter((r) => r.milestoneId === m.id),
      }))
      groups.push({
        key: 'milestone:none',
        kind: 'noMilestone',
        rows: rows.filter((r) => r.milestoneId === null || !known.has(r.milestoneId)),
      })
      return groups
    }
    case 'status':
      return sortStatuses(ctx.statuses).map((s) => ({
        key: `status:${s.id}`,
        kind: 'status',
        statusId: s.id,
        rows: rows.filter((r) => r.statusId === s.id),
      }))
    case 'assignee': {
      const leaves = rows.filter((r) => r.isLeaf)
      const byUser = new Map<string, TaskRowModel[]>()
      for (const r of leaves) {
        for (const userId of new Set(r.assignees.map((a) => a.userId))) {
          const list = byUser.get(userId)
          if (list) list.push(r)
          else byUser.set(userId, [r])
        }
      }
      const users = [...byUser.keys()].sort(
        (a, b) => compareThai(ctx.displayName(a), ctx.displayName(b)) || compareKeys(a, b),
      )
      const groups: TaskGroup[] = users.map((userId) => ({
        key: `user:${userId}`,
        kind: 'assignee',
        userId,
        rows: byUser.get(userId) as TaskRowModel[],
      }))
      const unassigned = leaves.filter((r) => r.assignees.length === 0)
      if (unassigned.length > 0) groups.push({ key: 'unassigned', kind: 'unassigned', rows: unassigned })
      return groups
    }
    case 'certainty': {
      const byId = new Map(rows.map((r) => [r.id, r]))
      const valueOf = new Map(rows.map((r) => [r.id, taskCertainty(byId, r.id, ctx.projectCertainty).value]))
      return CERTAINTY_ORDER.map((certainty): TaskGroup => ({
        key: `certainty:${certainty}`,
        kind: 'certainty',
        certainty,
        rows: rows.filter((r) => valueOf.get(r.id) === certainty),
      })).filter((g) => g.rows.length > 0)
    }
  }
}
