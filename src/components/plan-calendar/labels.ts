// src/components/plan-calendar/labels.ts — texts of the project calendar's bars (SPEC FR-811, §8.13). Pure.
import type { Certainty } from '@/domain/types'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { TaskDTO } from '@/lib/contracts/tasks'
import { displayName } from '@/lib/display-name'
import { formatThaiDateRange, formatThaiDate } from '@/lib/format'
import { taskSpan } from '@/lib/plan-calendar/bars'

/** Names shown on a bar: none → "รอมอบหมาย"; ≤ 2 → "Cindy, Ivy"; more → "Cindy, Ivy +1" (FR-811). */
export function assigneeText(userIds: readonly string[], people: ReadonlyMap<string, PersonOption>): string {
  const names = userIds.map((id) => {
    const p = people.get(id)
    return p ? displayName(p) : '…'
  })
  if (names.length === 0) return th.planCalendar.unassigned
  if (names.length <= 2) return names.join(', ')
  return th.planCalendar.assigneesMore(names.slice(0, 2).join(', '), names.length - 2)
}

/** A parent shows the union of its subtree's assignees (as the task list does, BR-31); a leaf its own. */
export function assigneeIdsByTask(tasks: readonly TaskDTO[]): Map<string, string[]> {
  const children = new Map<string | null, TaskDTO[]>()
  for (const t of tasks) {
    const list = children.get(t.parentId)
    if (list) list.push(t)
    else children.set(t.parentId, [t])
  }
  const out = new Map<string, string[]>()
  const collect = (t: TaskDTO, seen: Set<string>): string[] => {
    if (seen.has(t.id)) return []
    seen.add(t.id)
    const own = t.assignees.map((a) => a.userId)
    const kids = (children.get(t.id) ?? []).flatMap((c) => collect(c, seen))
    const all = [...new Set([...own, ...kids])]
    out.set(t.id, all)
    return all
  }
  for (const t of tasks) if (!out.has(t.id)) collect(t, new Set())
  return out
}

export interface BarInfo {
  task: TaskDTO
  assignees: string
  certainty: Certainty
}

/** The bar's visible text: "ชื่องาน · ชื่อผู้รับผิดชอบ". */
export function barText(b: BarInfo): string {
  return `${b.task.name} · ${b.assignees}`
}

/** Accessible name of a bar / agenda row: text, dates, then each state glyph spelled out (§8.9, never colour alone). */
export function barLabel(b: BarInfo, cut: { left?: boolean; right?: boolean } = {}): string {
  const parts = [barText(b)]
  const span = taskSpan(b.task)
  if (span) parts.push(span.start === span.end ? formatThaiDate(span.start) : formatThaiDateRange(span.start, span.end))
  if (b.certainty === 'TENTATIVE') parts.push(th.projects.certainty.TENTATIVE)
  if (b.task.completedOn !== null) parts.push(th.planCalendar.done)
  if (b.task.hasBody) parts.push(th.tasks.hasBody)
  if (b.task.blockers.open > 0) parts.push(th.tasks.blockers.badgeWaiting(b.task.blockers.open))
  if (cut.left) parts.push(th.planCalendar.continuesLeft)
  if (cut.right) parts.push(th.planCalendar.continuesRight)
  return parts.join(', ')
}
