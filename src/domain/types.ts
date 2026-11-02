// src/domain/types.ts — type-only contract (M1-D24): no runtime statements, so the domain coverage gate is
// unaffected. S0 creates it so DTOs compile before S1; the domain stream owns it afterwards.

/** Calendar date of a plan, 'YYYY-MM-DD' (BR-04). Never a JS Date. */
export type ISODate = string
/** Load / capacity in centi-days: integer, 100 = one person-day (BR-01). */
export type Cd = number
/** ISO weekday: 1 = Monday … 7 = Sunday (BR-05). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
/** Work schedule: weekday → fraction in cd; a missing weekday = not working (FR-207). */
export type Schedule = Partial<Record<Weekday, Cd>>
/** Allowed per-day fractions of a work schedule (X60). */
export type FractionCd = 25 | 50 | 75 | 100
/** Project certainty (SPEC §5.5 BR-35..BR-37): TENTATIVE load counts as `atRisk`, not `committed`. */
export type Certainty = 'CONFIRMED' | 'TENTATIVE'
/** Role inside a project (SPEC §3.1, `project_members.role`). */
export type ProjectRole = 'LEAD' | 'MEMBER'
/** Category of a per-project task status (SPEC v3.1 §4.6.1, BR-80): only `DONE` counts as completed. */
export type TaskStatusCategory = 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE'
/** Half-day leave (SPEC §6.2 `half_day`): AM = ครึ่งวันเช้า, PM = ครึ่งวันบ่าย; null elsewhere = full day. */
export type HalfDay = 'AM' | 'PM'
/** One live leave entry reduced to what capacity needs (BR-10). fractionCd: 100 = full day, 50 = half day. */
export interface TimeOffSpan {
  startDate: ISODate
  endDate: ISODate
  fractionCd: 50 | 100
}
/** Resolution of one allocation row (SPEC §6.2 `granularity`, BR-20): a week is either one WEEK row or DAY rows. */
export type Granularity = 'WEEK' | 'DAY'
/** Grid period key (X65): `W:<Monday>` for a week column, `D:<date>` for a day column (M7). */
export type PeriodKey = `W:${ISODate}` | `D:${ISODate}`
/** Load split by certainty (BR-37): atRisk = total − committed. */
export interface LoadPair {
  total: Cd
  committed: Cd
}
/** Load view (FR-809), preference `load.view`. */
export type LoadView = 'ALL' | 'COMMITTED' | 'AT_RISK'
/** Cell unit (FR-804), preference `grid.unit`. */
export type CellUnit = 'DAYS' | 'FRACTION'
/** BR-70 milestone status (FR-704, M8). */
export type MilestoneStatus = 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'
/** BR-71: why a bound task is late for its milestone (M8-D6). */
export type LateReason = 'WEEK_PLAN' | 'DAY_PLAN' | 'DUE_DATE'
/** BR-41 cause of an OVER/RISK week (M9, X67). */
export type OverloadCause = 'WORKLOAD' | 'CAPACITY' | 'BOTH'
/** BR-40 level + X67 excess (OVER = committed − cap, RISK = total − cap, 0 when OK) + BR-41 cause (null when OK). M9. */
export interface OverloadStatus {
  level: 'OK' | 'RISK' | 'OVER'
  excessCd: Cd
  cause: OverloadCause | null
}

// ── M11 — databases inside pages (SPEC §4.14, §5.11 BR-90…97, §7.9; plan/m11 S0.3). Type-only (X91): values such as
//    ME_TOKEN and DB_LIMITS live in src/domain/database.ts.
/** SPEC §6.2 db_column_type. */
export type DbColumnType =
  'TITLE' | 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTI_SELECT' | 'DATE' | 'CHECKBOX' | 'PERSON' | 'URL'
/** SPEC §6.2 db_view_type. */
export type DbViewType = 'TABLE' | 'KANBAN' | 'CALENDAR'
/** BR-90: TEXT/URL/NUMBER (canonical decimal string, BR-91)/DATE (ISODate, BR-92)/SELECT (option id) = string;
 *  MULTI_SELECT (option ids)/PERSON (user ids) = string[]; CHECKBOX = true (unchecked = key absent). */
export type CellValue = string | string[] | true
/** M11-D35: the 10 named option colours (tokens `--option-<name>-bg/-fg`). */
export type OptionColor =
  'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red' | 'teal'
export interface SelectOption {
  id: string
  name: string
  color: OptionColor
}
export interface SelectConfig {
  options: SelectOption[]
}
/** NUMBER display (BR-91, M11-D36): decimals 0..6 or null (= as stored). */
export interface NumberConfig {
  decimals: number | null
  thousands: boolean
}
export type ColumnConfig = SelectConfig | NumberConfig | Record<string, never>
export interface DbColumnModel {
  id: string
  type: DbColumnType
  name: string
  config: ColumnConfig
  position: string
}
/** `cells` values are `unknown`: stored shapes are read tolerantly (BR-90 readCell). */
export interface DbRowModel {
  id: string
  title: string
  cells: Record<string, unknown>
  position: string
}
/** M11-D23 filter operators (BR-95). */
export type FilterOp =
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isAnyOf'
  | 'isNoneOf'
  | 'hasAnyOf'
  | 'hasAllOf'
  | 'hasNoneOf'
  | 'is'
  | 'before'
  | 'after'
  | 'onOrAfter'
  | 'onOrBefore'
  | 'checked'
  | 'unchecked'
  | 'hasAny'
  | 'hasNone'
/** Date filter reference: a fixed date or "today" (resolved with DbCtx.today). */
export type DateRef = { kind: 'date'; date: ISODate } | { kind: 'today' }
export interface ViewFilter {
  columnId: string
  op: FilterOp
  value?: string | string[] | DateRef
}
export interface ViewSort {
  columnId: string
  dir: 'ASC' | 'DESC'
}
/** SPEC §7.9 ViewConfig. */
export interface ViewConfig {
  hiddenColumnIds?: string[]
  columnWidths?: Record<string, number>
  sorts?: ViewSort[]
  filters?: ViewFilter[]
  groupByColumnId?: string
  hideEmptyGroups?: boolean
  dateColumnId?: string
  cardColumnIds?: string[]
}
/** `DatabaseResponse.people` entry (§3.3: no email, load, leave or projects). */
export interface DbPersonRef {
  name: string
  nickname: string | null
  color: string | null
  deactivated: boolean
}
export interface DbCtx {
  people: ReadonlyMap<string, DbPersonRef>
  viewerId: string
  today: ISODate
  collator?: Intl.Collator
}
/** PERSON filter token for the viewer (the value `ME_TOKEN` lives in src/domain/database.ts). */
export type MeToken = '@me'
