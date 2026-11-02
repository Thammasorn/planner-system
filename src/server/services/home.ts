// src/server/services/home.ts — the /home dashboard (SPEC §4.11 FR-1101, plan/m10 S1.1–S1.7, M10-D13…D19/D34).
// Read-only; visibility comes from authz (visibleProjectIds / visibleUserIds / canSeeLeaveDetails) and the M5/M8/M9
// services it reuses, masking from services/masking.ts and M9's workload service. Every function takes the clock
// explicitly (X56/X90) and imports no request context. The pure split of leave lines lives in home-leave.ts.
// Integer cd only (BR-03); plan dates are ISODate strings computed with src/domain/dates.ts.
import { addDays, addWeeks, compareISO, weekRange, weekStart } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { compareThai } from '@/lib/collate'
import type {
  HomeLeave,
  HomeLoadWeek,
  HomeManagerCards,
  HomeMilestone,
  HomeRecentPage,
  HomeResponse,
  HomeUtilisationWeek,
} from '@/lib/contracts/home'
import { displayName } from '@/lib/display-name'
import { percentTenths } from '@/lib/home/percent'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { listRecentPages } from '../repo/home'
import type { SessionUser } from '../session'
import { getCalendar } from './calendar'
import { splitLeaveLines } from './home-leave'
import { listVisibleMilestones } from './milestones'
import { listMyTaskBuckets } from './my-tasks'
import { buildTable, personCells } from './workload'

export const HOME_TASKS_LIMIT = 20
export const HOME_MILESTONES_LIMIT = 10
const LOAD_WEEKS = 8

/** All cards in one REPEATABLE READ read-only snapshot (M10-D34); `manager` is null for non-managers. */
export async function getHome(
  tx: DbOrTx,
  user: SessionUser,
  clock: { today: ISODate; now: Date },
): Promise<HomeResponse> {
  authz.requireUser(user)
  const { today, now } = clock
  const ws = weekStart(today)
  // Sequential awaits: postgres.js runs one query at a time per transaction connection.
  const myTasks = await myTasksThisWeek(tx, user, today)
  const load = await myLoad(tx, user, ws)
  const milestones = await homeMilestones(tx, user, today)
  const leave = await homeLeave(tx, user, today)
  const pages = await recentPages(tx, user)
  const manager = await managerCards(tx, user, ws, today)
  return {
    today,
    now: now.toISOString(),
    weekStart: ws,
    myTasks,
    myLoad: load,
    milestones,
    leave,
    recentPages: pages,
    manager,
  }
}

/** M9's THIS_WEEK bucket (M10-D13): ≤ 20 items + `more`. Own rows only — no masking needed. */
export async function myTasksThisWeek(
  tx: DbOrTx,
  user: SessionUser,
  today: ISODate,
): Promise<HomeResponse['myTasks']> {
  const b = await listMyTaskBuckets(tx, user, today)
  const tasks = b.buckets.find((x) => x.key === 'THIS_WEEK')?.tasks ?? []
  return { items: tasks.slice(0, HOME_TASKS_LIMIT), more: Math.max(0, tasks.length - HOME_TASKS_LIMIT) }
}

/** 8 Mondays from `ws` via M9 personCells (M10-D14): capacity, BR-40/41 level and masking inside M9. */
export async function myLoad(tx: DbOrTx, user: SessionUser, ws: ISODate): Promise<HomeLoadWeek[]> {
  const window = { from: ws, to: addWeeks(ws, LOAD_WEEKS) }
  const cells = await personCells(tx, user, user.id, window) // requireVisibleUser(self) first
  return weekRange(window.from, window.to).map((week) => ({ week, cell: cells[week]! }))
}

/** M8 listVisibleMilestones over [today − 28, today + 15), not DONE, upcoming or OVERDUE; ≤ 10 (M10-D15). */
export async function homeMilestones(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<HomeMilestone[]> {
  const rows = await listVisibleMilestones(tx, user, { from: addDays(today, -28), to: addDays(today, 15) }, today)
  return rows
    .filter((m) => m.status !== 'DONE' && (compareISO(m.date, today) >= 0 || m.status === 'OVERDUE'))
    .sort(
      (a, b) =>
        Number(b.status === 'OVERDUE') - Number(a.status === 'OVERDUE') ||
        compareISO(a.date, b.date) ||
        compareThai(a.name, b.name) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, HOME_MILESTONES_LIMIT)
}

/** M5 getCalendar over two weeks (visible people, masked entries), split into today / this week / next (M10-D16). */
export async function homeLeave(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<HomeLeave> {
  const ws = weekStart(today)
  const cal = await getCalendar(tx, user, { from: ws, to: addWeeks(ws, 2) }, today)
  const entries = cal.timeOff.map((entry) => ({
    userId: entry.userId,
    name: cal.people[entry.userId]?.displayName ?? '',
    entry,
  }))
  return splitLeaveLines(entries, today, ws)
}

/** 8 live DOC pages the viewer can see, newest first (M10-D17). */
export async function recentPages(tx: DbOrTx, user: SessionUser): Promise<HomeRecentPage[]> {
  const vis = await authz.visibleProjectIds(tx, user) // before the page query (FR-1104 style: filter in SQL)
  const rows = await listRecentPages(tx, {
    all: vis === 'ALL',
    visibleProjectIds: vis === 'ALL' ? [] : [...vis],
  })
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    icon: r.icon,
    projectName: r.project_name,
    updatedAt: new Date(r.updated_at).toISOString(),
    updatedBy: { id: r.updated_by, name: displayName({ name: r.updated_by_name, nickname: r.updated_by_nickname }) },
    href: `/p/${r.id}`,
  }))
}

const utilWeek = (week: ISODate, totalCd: number, committedCd: number, capacityCd: number): HomeUtilisationWeek => ({
  week,
  totalCd,
  committedCd,
  capacityCd,
  percentTenths: percentTenths(totalCd, capacityCd),
  committedPercentTenths: percentTenths(committedCd, capacityCd),
})

/** Manager-only: OVER/RISK this week and next + 4-week utilisation (M10-D18); null for everyone else. */
export async function managerCards(
  tx: DbOrTx,
  user: SessionUser,
  ws: ISODate,
  today: ISODate,
): Promise<HomeManagerCards | null> {
  if (!authz.isManager(user)) return null
  const over = await buildTable(tx, user, { window: { from: ws, to: addWeeks(ws, 2) }, onlyOver: true }, today)
  const wl = await buildTable(tx, user, { window: { from: ws, to: addWeeks(ws, 4) } }, today)
  const people = wl.groups.flatMap((g) => g.people)
  const weeks = wl.weeks.map((week) => {
    let total = 0
    let committed = 0
    let capacity = 0
    for (const p of people) {
      const c = p.cells[week]!
      total += c.total
      committed += c.committed
      capacity += c.capacity
    }
    return utilWeek(week, total, committed, capacity)
  })
  const sum = (k: 'totalCd' | 'committedCd' | 'capacityCd') => weeks.reduce((s, w) => s + w[k], 0)
  return {
    overloaded: over.overloads,
    utilisation: { weeks, total: utilWeek(ws, sum('totalCd'), sum('committedCd'), sum('capacityCd')) },
  }
}
