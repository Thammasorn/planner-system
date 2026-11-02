// src/server/services/workload.ts — the workload service (SPEC §4.10 FR-1001…1007, FR-906 overload part, FR-409/FR-303
// load parts, §3.3 masking; plan/m09 S0.6/S2, M9-D2…D11/D18…D20/D27). One loader (repo.allocations.loadByUserProjectWeek)
// + capacity (services/capacity) + the pure assembleCells feed the table, cell detail, badge, overload list, impact
// lines and project/client loads. Services take `today` (X45); routes pass serverToday(). Integer cd only (BR-03).
// Authz first in every entry point: visibleUserIds (totals) / visibleProjectIds (details) (X43), requireVisibleUser,
// requireProject, requireClient. Masked shapes come from services/masking.ts only (S2.11).
import { splitLoad } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import { addWeeks, compareISO, weekRange, weekStart } from '@/domain/dates'
import { overloadStatus, worsened } from '@/domain/overload'
import type { Cd, ISODate, LoadPair } from '@/domain/types'
import { th } from '@/i18n/th'
import { compareThai } from '@/lib/collate'
import type { UserCapacity } from '@/lib/contracts/capacity'
import type { OverloadImpactLine } from '@/lib/contracts/time-off'
import type {
  ClientLoadResponse,
  OverloadItem,
  ProjectLoadMember,
  ProjectLoadResponse,
  WorkloadBadgeResponse,
  WorkloadCell,
  WorkloadCellDetail,
  WorkloadCellItem,
  WorkloadGroup,
  WorkloadPerson,
  WorkloadResponse,
} from '@/lib/contracts/workload'
import { displayName } from '@/lib/display-name'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import type { WorkloadCandidate } from '../repo/workload'
import type { SessionUser } from '../session'
import { loadCapacity } from './capacity'
import { isVisible, maskCellItems, maskProjectParts, namedProjectParts, type Visible } from './masking'

/** Mondays, `to` exclusive. */
export interface WorkloadWindow {
  from: ISODate
  to: ISODate
}

export interface BuildTableOpts {
  window: WorkloadWindow
  positionId?: string | null
  projectId?: string | null
  onlyOver?: boolean
  /** M10 embed: restrict to a project's members (still ∩ visible ∩ the M9-D3 population). */
  userIds?: readonly string[]
}

type Loads = Map<string, Map<string, Record<ISODate, LoadPair>>>

const ZERO: LoadPair = { total: 0, committed: 0 }
const WEEKS_AHEAD = 12

const defaultWindow = (today: ISODate, weeks: number): WorkloadWindow => ({
  from: weekStart(today),
  to: addWeeks(weekStart(today), weeks),
})

const personHref = (userId: string, week: ISODate): string => `/people/${userId}/plan?week=${week}`

function hasLoad(byProject: Map<string, Record<ISODate, LoadPair>> | undefined, projectId?: string): boolean {
  if (!byProject) return false
  for (const [pid, weeks] of byProject) {
    if (projectId !== undefined && pid !== projectId) continue
    for (const v of Object.values(weeks)) if (v.total > 0 || v.committed > 0) return true
  }
  return false
}

/** Names of the visible projects referenced by `loads` (for sorting parts and the response dictionary). */
async function visibleProjectInfo(
  tx: DbOrTx,
  loads: Loads,
  visible: Visible,
): Promise<Map<string, { name: string; color: string }>> {
  const ids = new Set<string>()
  for (const byProject of loads.values()) for (const pid of byProject.keys()) if (isVisible(visible, pid)) ids.add(pid)
  const rows = await repo.projects.listByIds(tx, [...ids])
  return new Map(rows.map((p) => [p.id, { name: p.name, color: p.color }]))
}

export interface AssembleInput {
  weeks: readonly ISODate[]
  userIds: readonly string[]
  /** userId → projectId → week → load (repo.allocations.loadByUserProjectWeek). */
  loads: Map<string, Map<string, Record<ISODate, LoadPair>>>
  capacity: Map<string, UserCapacity>
  visibleProjects: 'ALL' | ReadonlySet<string>
  /** Visible project names (part order, M9-D8); missing names sort first by id. */
  projectNames?: ReadonlyMap<string, string>
}

/** Pure assembly (unit-tested in workload-assemble.test.ts): loads + capacity + visibility → cells for every
 *  (user, week) of the input, empty weeks included. */
export function assembleCells(input: AssembleInput): Map<string, Record<ISODate, WorkloadCell>> {
  const names = input.projectNames ?? new Map<string, string>()
  const out = new Map<string, Record<ISODate, WorkloadCell>>()
  for (const userId of input.userIds) {
    const byProject = input.loads.get(userId)
    const cap = input.capacity.get(userId)
    const cells: Record<ISODate, WorkloadCell> = {}
    for (const w of input.weeks) {
      const parts = new Map<string, LoadPair>()
      let total = 0
      let committed = 0
      for (const [pid, weeks] of byProject ?? []) {
        const v = weeks[w]
        if (!v) continue
        parts.set(pid, v)
        total += v.total
        committed += v.committed
      }
      const capacity = cap?.weeks[w]?.capacityCd ?? 0
      const standard = cap?.weeks[w]?.standardCd ?? 0
      const status = overloadStatus({ total, committed }, capacity, standard)
      cells[w] = {
        total,
        committed,
        capacity,
        standard,
        level: status.level,
        excess: status.excessCd,
        cause: status.cause,
        byProject: maskProjectParts(parts, input.visibleProjects, names),
      }
    }
    out.set(userId, cells)
  }
  return out
}

/** M9-D10: every non-OK cell, week ↑, OVER before RISK, compareThai(name). */
function overloadItems(
  people: readonly { id: string; name: string; deactivatedOn: ISODate | null }[],
  weeks: readonly ISODate[],
  cells: Map<string, Record<ISODate, WorkloadCell>>,
): OverloadItem[] {
  const out: OverloadItem[] = []
  for (const p of people) {
    for (const w of weeks) {
      const c = cells.get(p.id)?.[w]
      if (!c || c.level === 'OK' || c.cause === null) continue
      out.push({
        userId: p.id,
        name: p.name,
        week: w,
        level: c.level,
        excess: c.excess,
        cause: c.cause,
        total: c.total,
        committed: c.committed,
        capacity: c.capacity,
        standard: c.standard,
        deactivatedOn: p.deactivatedOn,
        href: personHref(p.id, w),
      })
    }
  }
  const rank = (l: 'RISK' | 'OVER'): number => (l === 'OVER' ? 0 : 1)
  return out.sort(
    (a, b) =>
      compareISO(a.week, b.week) ||
      rank(a.level) - rank(b.level) ||
      compareThai(a.name, b.name) ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  )
}

/** Groups in positions order, "ไม่มีตำแหน่ง" last, people by compareThai(name); empty groups omitted (M9-D3). */
function groupByPosition<P extends { positionId: string | null; name: string }>(
  people: readonly P[],
  positions: readonly { id: string; name: string }[],
): { positionId: string | null; name: string; people: P[] }[] {
  const sorted = [...people].sort((a, b) => compareThai(a.name, b.name))
  const known = new Set(positions.map((p) => p.id))
  const groups: { positionId: string | null; name: string; people: P[] }[] = []
  for (const pos of positions) {
    const members = sorted.filter((p) => p.positionId === pos.id)
    if (members.length > 0) groups.push({ positionId: pos.id, name: pos.name, people: members })
  }
  const none = sorted.filter((p) => p.positionId === null || !known.has(p.positionId))
  if (none.length > 0) groups.push({ positionId: null, name: th.workload.noPosition, people: none })
  return groups
}

const nameOf = (c: Pick<WorkloadCandidate, 'name' | 'nickname'>): string => displayName(c)

/** Signature pinned for M10 (S1.6/S1.10, M10-D11/D18) and M12 (DM-02):
 *  buildTable(tx, viewer, { window, userIds?, positionId?, projectId?, onlyOver? }, today). */
export async function buildTable(
  tx: DbOrTx,
  viewer: SessionUser,
  o: BuildTableOpts,
  today: ISODate,
): Promise<WorkloadResponse> {
  const visibleUsers = await authz.visibleUserIds(tx, viewer) // totals (§3.3) — before any load query
  const visibleProjects = await authz.visibleProjectIds(tx, viewer) // details
  if (o.projectId) await authz.requireProject(tx, viewer, o.projectId, 'view') // invisible → 404 (M9-D5)
  const weeks = weekRange(o.window.from, o.window.to)
  const positions = await repo.workload.listPositions(tx)
  const candidates = await repo.workload.listCandidates(tx, {
    visibleUsers,
    userIds: o.userIds ?? null,
    positionId: o.positionId ?? null,
  })
  const loads = await repo.allocations.loadByUserProjectWeek(tx, {
    userIds: candidates.map((c) => c.id),
    range: o.window,
  })
  const population = candidates.filter((c) => (c.active && c.isActiveMember) || hasLoad(loads.get(c.id))) // M9-D3
  const projectId = o.projectId ?? null
  const selected =
    projectId === null
      ? population
      : population.filter((c) => c.memberProjectIds.includes(projectId) || hasLoad(loads.get(c.id), projectId))
  const capacity =
    selected.length > 0 ? await loadCapacity(tx, selected.map((p) => p.id), o.window) : new Map<string, UserCapacity>()
  const info = await visibleProjectInfo(tx, loads, visibleProjects)
  const cells = assembleCells({
    weeks,
    userIds: selected.map((p) => p.id),
    loads,
    capacity,
    visibleProjects,
    projectNames: new Map([...info].map(([id, p]) => [id, p.name])),
  })
  const final = o.onlyOver ? selected.filter((p) => weeks.some((w) => cells.get(p.id)![w]!.level !== 'OK')) : selected

  const people: WorkloadPerson[] = final.map((c) => ({
    userId: c.id,
    name: nameOf(c),
    positionId: c.positionId,
    active: c.active,
    deactivatedOn: c.deactivatedOn,
    cells: cells.get(c.id)!,
  }))
  const groups: WorkloadGroup[] = groupByPosition(people, positions)
  const projects: WorkloadResponse['projects'] = {}
  for (const p of people) {
    for (const c of Object.values(p.cells)) {
      for (const part of c.byProject) {
        if (part.projectId === null || projects[part.projectId]) continue
        const meta = info.get(part.projectId)
        if (meta) projects[part.projectId] = { name: meta.name, color: meta.color }
      }
    }
  }
  return {
    from: o.window.from,
    to: o.window.to,
    today,
    weeks,
    groups,
    positions,
    projects,
    overloads: overloadItems(
      people.map((p) => ({ id: p.userId, name: p.name, deactivatedOn: p.deactivatedOn })),
      weeks,
      cells,
    ),
  }
}

/** Cells of one user (no population filter) over `window`, masked per `visibleProjects`. */
async function cellsOfUser(
  tx: DbOrTx,
  userId: string,
  window: WorkloadWindow,
  visibleProjects: Visible,
): Promise<{ cells: Record<ISODate, WorkloadCell>; loads: Loads }> {
  const loads = await repo.allocations.loadByUserProjectWeek(tx, { userIds: [userId], range: window })
  const capacity = await loadCapacity(tx, [userId], window)
  const info = await visibleProjectInfo(tx, loads, visibleProjects)
  const cells = assembleCells({
    weeks: weekRange(window.from, window.to),
    userIds: [userId],
    loads,
    capacity,
    visibleProjects,
    projectNames: new Map([...info].map(([id, p]) => [id, p.name])),
  })
  return { cells: cells.get(userId)!, loads }
}

/** FR-1005 (M9-D9): requireVisibleUser (404) → the cell + visible task items + one masked item. */
export async function cellDetail(
  tx: DbOrTx,
  viewer: SessionUser,
  q: { userId: string; week: ISODate },
  _today: ISODate,
): Promise<WorkloadCellDetail> {
  const { visibleProjects } = await authz.requireVisibleUser(tx, viewer, q.userId) // 404 first
  const person = await repo.users.getUser(tx, q.userId)
  if (!person) throw new NotFoundError()
  const window = { from: q.week, to: addWeeks(q.week, 1) }
  const { cells, loads } = await cellsOfUser(tx, q.userId, window, visibleProjects)

  const mine = await repo.assignments.listActiveForUserLive(tx, q.userId)
  const visible = mine.filter((a) => isVisible(visibleProjects, a.projectId)) // hidden projects never queried (R1/R2)
  const rows = await repo.allocations.listForWeeks(
    tx,
    visible.map((a) => a.id),
    [q.week],
  )
  const cdByAssignment = new Map<string, Cd>()
  for (const r of rows) cdByAssignment.set(r.taskAssignmentId, (cdByAssignment.get(r.taskAssignmentId) ?? 0) + r.cd)
  const facts = await repo.workload.listCellTasks(tx, [...cdByAssignment.keys()])
  const items = facts
    .filter((f) => countsTowardLoad(q.week, f.completedWeek) && (cdByAssignment.get(f.assignmentId) ?? 0) > 0)
    .sort(
      (a, b) =>
        compareThai(a.projectName, b.projectName) ||
        (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0) ||
        (a.taskPosition < b.taskPosition ? -1 : a.taskPosition > b.taskPosition ? 1 : 0) ||
        (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0),
    )
    .map(
      (f): WorkloadCellItem & { kind: 'task' } => ({
        kind: 'task',
        taskId: f.taskId,
        taskName: f.taskName,
        parentPath: f.parentPath,
        projectId: f.projectId,
        projectName: f.projectName,
        projectColor: f.projectColor,
        load: splitLoad(cdByAssignment.get(f.assignmentId)!, f.certainty),
        certainty: f.certainty,
        completed: f.completed,
        href: `/projects/${f.projectId}/plan?task=${f.taskId}`,
      }),
    )
  const hidden = { total: 0, committed: 0 }
  for (const [pid, weeks] of loads.get(q.userId) ?? []) {
    if (isVisible(visibleProjects, pid)) continue
    const v = weeks[q.week] ?? ZERO
    hidden.total += v.total
    hidden.committed += v.committed
  }
  return {
    userId: q.userId,
    name: displayName(person),
    week: q.week,
    cell: cells[q.week]!,
    items: maskCellItems(items, hidden),
  }
}

/** FR-1007 (M9-D11): OVER cells over the visible population in [weekStart(today), +4 w). */
export async function badgeCount(tx: DbOrTx, viewer: SessionUser, today: ISODate): Promise<WorkloadBadgeResponse> {
  const window = defaultWindow(today, 4)
  const table = await buildTable(tx, viewer, { window }, today)
  let overCount = 0
  for (const g of table.groups) {
    for (const p of g.people) for (const c of Object.values(p.cells)) if (c.level === 'OVER') overCount++
  }
  return { overCount, from: window.from, to: window.to }
}

/** M10 home "ภาระของฉัน": requireVisibleUser (404) → one user's cells over `window` (≤ 53 weeks, Mondays, `to` exclusive).
 *  NO population filter (M9-D3 applies to the table only), so a viewer's own cells exist even without memberships.
 *  Same assembleCells/masking as buildTable. */
export async function personCells(
  tx: DbOrTx,
  viewer: SessionUser,
  userId: string,
  window: WorkloadWindow,
): Promise<Record<ISODate, WorkloadCell>> {
  const { visibleProjects } = await authz.requireVisibleUser(tx, viewer, userId)
  return (await cellsOfUser(tx, userId, window, visibleProjects)).cells
}

/** FR-906 overload part (M9-D18): worsened weeks after a leave write (same transaction, after the write).
 *  `viewer` null = a system write (seed) → nothing hidden. Plans are never modified (BR-42). */
export async function overloadImpact(
  tx: DbOrTx,
  viewer: SessionUser | null,
  userId: string,
  weeks: readonly ISODate[],
  before: ReadonlyMap<ISODate, { capacityCd: Cd; standardCd: Cd }>,
  after: ReadonlyMap<ISODate, { capacityCd: Cd; standardCd: Cd }>,
): Promise<OverloadImpactLine[]> {
  if (weeks.length === 0) return []
  const visibleProjects: Visible = viewer === null ? 'ALL' : await authz.visibleProjectIds(tx, viewer)
  const sorted = [...new Set(weeks)].sort(compareISO)
  const range = { from: sorted[0]!, to: addWeeks(sorted.at(-1)!, 1) }
  const loads = await repo.allocations.loadByUserProjectWeek(tx, { userIds: [userId], range })
  const info = await visibleProjectInfo(tx, loads, visibleProjects)
  const names = new Map([...info].map(([id, p]) => [id, p.name]))
  const out: OverloadImpactLine[] = []
  for (const w of sorted) {
    const parts = new Map<string, LoadPair>()
    const load = { total: 0, committed: 0 }
    for (const [pid, byWeek] of loads.get(userId) ?? []) {
      const v = byWeek[w]
      if (!v) continue
      parts.set(pid, v)
      load.total += v.total
      load.committed += v.committed
    }
    const b = before.get(w) ?? { capacityCd: 0, standardCd: 0 }
    const a = after.get(w) ?? b
    const sb = overloadStatus(load, b.capacityCd, b.standardCd)
    const sa = overloadStatus(load, a.capacityCd, a.standardCd)
    if (!worsened(sb, sa) || sa.level === 'OK' || sa.cause === null) continue
    out.push({
      week: w,
      before: { level: sb.level, excessCd: sb.excessCd },
      after: { level: sa.level, excessCd: sa.excessCd, cause: sa.cause },
      load,
      capacityCd: a.capacityCd,
      standardCd: a.standardCd,
      parts: namedProjectParts(parts, visibleProjects, names),
      href: personHref(userId, w),
    })
  }
  return out
}

const sumPair = (into: LoadPair, v: LoadPair): void => {
  into.total += v.total
  into.committed += v.committed
}

/** FR-409 load part (M9-D19): requireProject(view) → per-member + weekly totals over [weekStart(today), +12 w). */
export async function projectLoad(
  tx: DbOrTx,
  viewer: SessionUser,
  projectId: string,
  today: ISODate,
): Promise<ProjectLoadResponse> {
  const access = await authz.requireProject(tx, viewer, projectId, 'view') // 404 first; archived allowed (X42)
  const window = defaultWindow(today, WEEKS_AHEAD)
  const weeks = weekRange(window.from, window.to)
  if (access.archived) return { projectId, archived: true, weeks, members: [], weekly: {}, sum: { ...ZERO } }

  const members = await repo.members.listMembers(tx, projectId)
  const assignees = await repo.assignments.listActiveForProject(tx, projectId)
  const userIds = [...new Set([...members.map((m) => m.userId), ...assignees.map((a) => a.userId)])]
  const loads = await repo.allocations.loadByUserProjectWeek(tx, { userIds, range: window, projectIds: [projectId] })
  const role = new Map(members.map((m) => [m.userId, m.role]))
  const extra = userIds.filter((id) => !role.has(id))
  const extraPeople = new Map((await repo.users.listCalendarPeople(tx, extra)).map((u) => [u.id, u]))

  const weekly: Record<ISODate, LoadPair> = {}
  for (const w of weeks) weekly[w] = { ...ZERO }
  const sum = { ...ZERO }
  const rows: ProjectLoadMember[] = []
  for (const id of userIds) {
    const m = members.find((x) => x.userId === id)
    const u = m ?? extraPeople.get(id)
    if (!u) continue
    const byWeek = loads.get(id)?.get(projectId) ?? {}
    const mine = { ...ZERO }
    for (const w of weeks) {
      const v = byWeek[w]
      if (!v) continue
      sumPair(mine, v)
      sumPair(weekly[w]!, v)
      sumPair(sum, v)
    }
    const thisWeek = byWeek[window.from] ?? ZERO
    rows.push({
      userId: id,
      name: displayName(u),
      role: role.get(id) ?? null,
      active: u.active,
      thisWeek: { total: thisWeek.total, committed: thisWeek.committed },
      sum: mine,
    })
  }
  rows.sort((a, b) => (a.role === 'LEAD' ? 0 : 1) - (b.role === 'LEAD' ? 0 : 1) || compareThai(a.name, b.name))
  return { projectId, archived: false, weeks, members: rows, weekly, sum }
}

/** FR-303 load part (M9-D20): requireClient → Σ over the client's visible, non-archived projects, next 12 weeks. */
export async function clientLoad(
  tx: DbOrTx,
  viewer: SessionUser,
  clientId: string,
  today: ISODate,
): Promise<ClientLoadResponse> {
  await authz.requireClient(tx, viewer, clientId) // 404 first
  const visibleProjects = await authz.visibleProjectIds(tx, viewer)
  const window = defaultWindow(today, WEEKS_AHEAD)
  const weeks = weekRange(window.from, window.to)
  const projects = await repo.projects.listProjects(tx, { ids: visibleProjects, archived: false, clientId })
  const projectIds = projects.map((p) => p.id)
  const members = await repo.members.listMembersOf(tx, projectIds)
  const assignees = (await Promise.all(projectIds.map((id) => repo.assignments.listActiveForProject(tx, id)))).flat()
  const userIds = [...new Set([...members.map((m) => m.userId), ...assignees.map((a) => a.userId)])]
  const loads = await repo.allocations.loadByUserProjectWeek(tx, { userIds, range: window, projectIds })
  const per = new Map(projectIds.map((id) => [id, { ...ZERO }]))
  const sum = { ...ZERO }
  for (const byProject of loads.values()) {
    for (const [pid, byWeek] of byProject) {
      const into = per.get(pid)
      if (!into) continue
      for (const v of Object.values(byWeek)) {
        sumPair(into, v)
        sumPair(sum, v)
      }
    }
  }
  const sorted = [...projects].sort((a, b) => compareThai(a.name, b.name) || (a.id < b.id ? -1 : 1))
  return { clientId, weeks, sum, projects: sorted.map((p) => ({ projectId: p.id, sum: per.get(p.id)! })) }
}

/** /people directory helper (services/people.ts): this week's cells of `userIds`, masked per `visibleProjects`. */
export async function weekCells(
  tx: DbOrTx,
  userIds: readonly string[],
  window: WorkloadWindow,
  visibleProjects: Visible,
): Promise<Map<string, Record<ISODate, WorkloadCell>>> {
  const loads = await repo.allocations.loadByUserProjectWeek(tx, { userIds, range: window })
  const capacity = userIds.length > 0 ? await loadCapacity(tx, userIds, window) : new Map<string, UserCapacity>()
  const info = await visibleProjectInfo(tx, loads, visibleProjects)
  return assembleCells({
    weeks: weekRange(window.from, window.to),
    userIds,
    loads,
    capacity,
    visibleProjects,
    projectNames: new Map([...info].map(([id, p]) => [id, p.name])),
  })
}

export { groupByPosition }
