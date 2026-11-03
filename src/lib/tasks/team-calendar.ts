// src/lib/tasks/team-calendar.ts — /tasks' ปฏิทิน (M11.4, FR-669). Pure: the filtered team cards + the team plan spans
// (GET /api/tasks/plan-spans) → the project calendar's CalendarTask shape, so its bars / agenda / "ไม่มีวันที่" logic
// (src/lib/plan-calendar, BR-103 + BR-103a: explicit dates win, a missing side comes from the plan) applies unchanged.
import type { ISODate } from '@/domain/types'
import type { TeamTaskCard } from '@/lib/contracts/tasks'
import type { TaskPlanSpan } from '@/lib/contracts/plan-spans'
import type { CalendarTask } from '@/lib/plan-calendar/bars'

export interface TeamCalendarTask extends CalendarTask {
  name: string
  hasBody: boolean
  blockers: { open: number; total: number }
  card: TeamTaskCard
}

/** Fixed-width keys so the bars' tree order (flattenTree, `<` on position) is the cards' order — the /tasks order. */
function orderKey(i: number): string {
  return String(i).padStart(6, '0')
}

/**
 * Cards in the given order, each as a root task (the team view has no tree) with its plan span — a span whose task
 * is not among the cards (filtered out) is ignored; a card without a span has `planSpan: null`.
 */
export function teamCalendarTasks(
  cards: readonly TeamTaskCard[],
  spans: readonly TaskPlanSpan[] | undefined,
): TeamCalendarTask[] {
  const byTask = new Map<string, { start: ISODate; end: ISODate }>()
  for (const s of spans ?? []) byTask.set(s.taskId, { start: s.start, end: s.end })
  return cards.map((card, i) => ({
    id: card.id,
    parentId: null,
    position: orderKey(i),
    name: card.name,
    startDate: card.startDate,
    dueDate: card.dueDate,
    completedOn: card.completedOn,
    hasBody: card.hasBody,
    blockers: card.blockers,
    planSpan: byTask.get(card.id) ?? null,
    card,
  }))
}
