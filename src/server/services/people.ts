// src/server/services/people.ts — the people directory for pickers (X09, X12, M2-D16).
// Every logged-in user may call it; the payload has no email. Sorted by compareThai(displayName).
// M9 (M9-D14/D16): the /people directory, the person header and the person leave tab (stubs by S0, bodies by S2).
import type { ISODate } from '@/domain/types'
import type { PersonOption } from '@/lib/contracts/people'
import type { PeopleDirectoryResponse, PersonHeader, PersonTimeOffResponse } from '@/lib/contracts/workload'
import { addWeeks, compareISO, weekStart } from '@/domain/dates'
import { displayName } from '@/lib/display-name'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import type { SessionUser } from '../session'
import * as repo from '../repo'
import { maskTimeOff } from './masking'
import { compareByDisplayName } from './shared'
import { groupByPosition, weekCells } from './workload'

/** Every user (deactivated ones with `active: false`); exactly the PersonOption keys (no email). */
export async function listPeopleOptions(tx: DbOrTx): Promise<PersonOption[]> {
  const rows = await repo.people.listPeople(tx)
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      nickname: r.nickname,
      positionId: r.positionId,
      positionName: r.positionName,
      color: r.color,
      active: r.active,
    }))
    .sort(compareByDisplayName)
}

// ── M9 (plan/m09 S2.6/S2.7, M9-D14/D16) ──

/** GET /api/people (M9-D14): visible users incl. managers and deactivated, grouped by position, with this week's
 *  WorkloadCell (masked parts, §3.3). */
export async function listPeopleDirectory(
  tx: DbOrTx,
  viewer: SessionUser,
  today: ISODate,
): Promise<PeopleDirectoryResponse> {
  const visible = await authz.visibleUserIds(tx, viewer) // totals (§3.3) before any data
  const visibleProjects = await authz.visibleProjectIds(tx, viewer)
  const users = (await repo.people.listPeople(tx)).filter((u) => visible === 'ALL' || visible.has(u.id))
  const week = weekStart(today)
  const cells = await weekCells(tx, users.map((u) => u.id), { from: week, to: addWeeks(week, 1) }, visibleProjects)
  const positions = await repo.workload.listPositions(tx)
  const people = users.map((u) => ({
    userId: u.id,
    name: displayName(u),
    fullName: u.name,
    positionId: u.positionId,
    positionName: u.positionName,
    active: u.active,
    thisWeek: cells.get(u.id)![week]!,
  }))
  const groups = groupByPosition(people, positions).map((g) => ({
    positionId: g.positionId,
    name: g.name,
    people: g.people.map(({ positionId: _p, ...rest }) => rest),
  }))
  return { week, groups }
}

/** /people/[id] layout (M9-D14): authz.requireVisibleUser first (404). No email. */
export async function getPersonHeader(tx: DbOrTx, viewer: SessionUser, userId: string): Promise<PersonHeader> {
  await authz.requireVisibleUser(tx, viewer, userId)
  const person = await repo.people.getPerson(tx, userId)
  const record = await repo.users.getUser(tx, userId)
  if (!person || !record) throw new NotFoundError()
  const isSelf = viewer.id === userId
  return {
    userId,
    name: displayName(person),
    fullName: person.name,
    nickname: person.nickname,
    positionName: person.positionName,
    active: person.active,
    deactivatedOn: record.deactivatedOn,
    schedule: await repo.users.getSchedule(tx, userId),
    isSelf,
    canEditLeave: isSelf || authz.isManager(viewer),
  }
}

/** GET /api/people/[userId]/time-off (M9-D16): M5 maskTimeOff over [weekStart(today) − 52 w, + 53 w). */
export async function listPersonTimeOff(
  tx: DbOrTx,
  viewer: SessionUser,
  userId: string,
  today: ISODate,
): Promise<PersonTimeOffResponse> {
  await authz.requireVisibleUser(tx, viewer, userId)
  const from = addWeeks(weekStart(today), -52)
  const to = addWeeks(weekStart(today), 53)
  const canSee = authz.canSeeLeaveDetails(viewer, userId)
  const rows = await repo.timeOff.listForCalendar(tx, [userId], from, to)
  const entries = rows
    .map((r) => maskTimeOff(r, canSee))
    .sort((a, b) => compareISO(a.startDate, b.startDate))
  return { from, to, entries, canEdit: canSee }
}
