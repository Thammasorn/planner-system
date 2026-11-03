// src/lib/tasks/team-table.ts — the /tasks ตาราง view model (M11.4, FR-668). Pure: column set from the `tasks.table`
// preference, header-click sort cycle (none → asc → desc → none), stable sorts per column and the optional
// "จัดกลุ่มตามโปรเจค" grouping. Dates are ISO strings compared as strings; loads are integer cd.
import type { TaskStatusCategory } from '@/domain/types'
import { compareThai } from '@/lib/collate'
import type { TeamTaskCard } from '@/lib/contracts/tasks'
import {
  TEAM_TABLE_COLUMNS,
  TEAM_TABLE_PREF_DEFAULT,
  TEAM_TABLE_WIDTH_MAX,
  TEAM_TABLE_WIDTH_MIN,
  type TeamTableColumn,
  type TeamTablePref,
} from '@/lib/schemas/preferences'

export type SortDir = 'asc' | 'desc'
export interface TableSort {
  column: TeamTableColumn
  dir: SortDir
}

/** Default widths (px) — the name column is the wide one. */
export const TEAM_TABLE_DEFAULT_WIDTHS: Readonly<Record<TeamTableColumn, number>> = {
  name: 320,
  project: 180,
  status: 150,
  assignees: 200,
  startDate: 132,
  dueDate: 140,
  milestone: 180,
  blockers: 120,
  load: 104,
}

export interface TableColumn {
  id: TeamTableColumn
  width: number
}

export function clampWidth(w: number): number {
  return Math.min(TEAM_TABLE_WIDTH_MAX, Math.max(TEAM_TABLE_WIDTH_MIN, Math.round(w)))
}

/** The shown columns in their fixed order with their widths; `name` can never be hidden. */
export function visibleColumns(pref: TeamTablePref | undefined): TableColumn[] {
  const p = pref ?? TEAM_TABLE_PREF_DEFAULT
  const hidden = new Set<TeamTableColumn>(p.hidden)
  return TEAM_TABLE_COLUMNS.filter((c) => c === 'name' || !hidden.has(c)).map((id) => ({
    id,
    width: clampWidth(p.widths[id] ?? TEAM_TABLE_DEFAULT_WIDTHS[id]),
  }))
}

/** The preference after toggling one column's visibility (`name` is ignored). */
export function toggleColumn(pref: TeamTablePref | undefined, column: TeamTableColumn): TeamTablePref {
  const p = pref ?? TEAM_TABLE_PREF_DEFAULT
  if (column === 'name') return p
  const hidden = p.hidden.includes(column) ? p.hidden.filter((c) => c !== column) : [...p.hidden, column]
  return { ...p, hidden: TEAM_TABLE_COLUMNS.filter((c): c is Exclude<TeamTableColumn, 'name'> => hidden.some((h) => h === c)) }
}

export function setColumnWidth(pref: TeamTablePref | undefined, column: TeamTableColumn, width: number): TeamTablePref {
  const p = pref ?? TEAM_TABLE_PREF_DEFAULT
  return { ...p, widths: { ...p.widths, [column]: clampWidth(width) } }
}

/** Header click: none → ascending → descending → none (another column starts at ascending). */
export function nextSort(current: TableSort | null, column: TeamTableColumn): TableSort | null {
  if (!current || current.column !== column) return { column, dir: 'asc' }
  return current.dir === 'asc' ? { column, dir: 'desc' } : null
}

const CATEGORY_RANK: Readonly<Record<TaskStatusCategory, number>> = {
  TODO: 0,
  IN_PROGRESS: 1,
  WAITING: 2,
  DONE: 3,
}

/** What the sorts need from outside the card. */
export interface SortContext {
  projectName: (projectId: string) => string
  /** first assignee's display name ('' = none) */
  assigneeName: (card: TeamTaskCard) => string
  milestoneOf: (card: TeamTaskCard) => { name: string; date: string } | null
}

function emptyOf(column: TeamTableColumn, ctx: SortContext): (c: TeamTaskCard) => boolean {
  switch (column) {
    case 'startDate':
      return (c) => c.startDate === null
    case 'dueDate':
      return (c) => c.dueDate === null
    case 'assignees':
      return (c) => c.assigneeIds.length === 0
    case 'milestone':
      return (c) => ctx.milestoneOf(c) === null
    default:
      return () => false
  }
}

function compareBy(column: TeamTableColumn, ctx: SortContext): (a: TeamTaskCard, b: TeamTaskCard) => number {
  const iso = (x: string | null, y: string | null) => ((x ?? '') < (y ?? '') ? -1 : (x ?? '') > (y ?? '') ? 1 : 0)
  switch (column) {
    case 'name':
      return (a, b) => compareThai(a.name, b.name)
    case 'project':
      return (a, b) => compareThai(ctx.projectName(a.projectId), ctx.projectName(b.projectId))
    case 'status':
      return (a, b) =>
        CATEGORY_RANK[a.status.category] - CATEGORY_RANK[b.status.category] || compareThai(a.status.name, b.status.name)
    case 'assignees':
      return (a, b) => compareThai(ctx.assigneeName(a), ctx.assigneeName(b)) || a.assigneeIds.length - b.assigneeIds.length
    case 'startDate':
      return (a, b) => iso(a.startDate, b.startDate)
    case 'dueDate':
      return (a, b) => iso(a.dueDate, b.dueDate)
    case 'milestone':
      return (a, b) => {
        const x = ctx.milestoneOf(a)
        const y = ctx.milestoneOf(b)
        return iso(x?.date ?? null, y?.date ?? null) || compareThai(x?.name ?? '', y?.name ?? '')
      }
    case 'blockers':
      return (a, b) => a.blockers.open - b.blockers.open || a.blockers.total - b.blockers.total
    case 'load':
      return (a, b) => a.plannedCd - b.plannedCd
  }
}

/**
 * Stable sort of the server order (due date, project, position). Empty values (no date / nobody / no milestone) stay
 * last in both directions, as in Notion; ties keep the server order.
 */
export function sortCards<T extends TeamTaskCard>(cards: readonly T[], sort: TableSort | null, ctx: SortContext): T[] {
  if (!sort) return [...cards]
  const isEmpty = emptyOf(sort.column, ctx)
  const cmp = compareBy(sort.column, ctx)
  const sign = sort.dir === 'asc' ? 1 : -1
  return cards
    .map((c, i) => ({ c, i, empty: isEmpty(c) }))
    .sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? 1 : -1
      if (a.empty) return a.i - b.i
      return sign * cmp(a.c, b.c) || a.i - b.i
    })
    .map((x) => x.c)
}

export type TableItem<T> =
  | { kind: 'group'; projectId: string; count: number }
  | { kind: 'row'; card: T; rowIndex: number }

/**
 * The rendered sequence: rows only, or (grouped) a header per project — projects by Thai name, rows keep the sort
 * inside their group. `rowIndex` counts rows only (the keyboard grid's row index).
 */
export function tableItems<T extends TeamTaskCard>(
  cards: readonly T[],
  o: { groupByProject: boolean; projectName: (projectId: string) => string },
): TableItem<T>[] {
  if (!o.groupByProject) return cards.map((card, rowIndex) => ({ kind: 'row', card, rowIndex }))
  const by = new Map<string, T[]>()
  for (const c of cards) {
    const list = by.get(c.projectId)
    if (list) list.push(c)
    else by.set(c.projectId, [c])
  }
  const out: TableItem<T>[] = []
  let rowIndex = 0
  for (const [projectId, list] of [...by].sort((a, b) => compareThai(o.projectName(a[0]), o.projectName(b[0])))) {
    out.push({ kind: 'group', projectId, count: list.length })
    for (const card of list) out.push({ kind: 'row', card, rowIndex: rowIndex++ })
  }
  return out
}
