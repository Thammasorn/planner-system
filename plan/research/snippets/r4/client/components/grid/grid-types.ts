// Mirrors SPEC §7.4 (trimmed to what the client snippets need).
export type ISODate = string
export type Period = { key: ISODate; kind: 'WEEK' | 'DAY'; weekStart: ISODate }
export type Cell = { cd: number; resolution: 'WEEK' | 'DAY'; derived: boolean }
export type GridRow =
  | { kind: 'task'; id: string; depth: 0 | 1 | 2; name: string; totals: Record<string, number> }
  | {
      kind: 'assignee'
      taskAssignmentId: string
      taskId: string
      userId: string
      version: number
      cells: Record<string, Cell>
    }
export interface GridResponse {
  periods: Period[]
  rows: GridRow[]
}

export type AllocationChange = { granularity: 'WEEK' | 'DAY'; period: ISODate; cd: number | null }
export type SaveAllocationsInput = {
  taskAssignmentId: string
  baseVersion: number
  changes: AllocationChange[]
  onDayWeekConflict?: 'SCALE' | 'COLLAPSE'
}
export type SaveAllocationsOk = {
  version: number
  weeks: Record<ISODate, { cd: number; resolution: 'WEEK' | 'DAY'; days?: Record<ISODate, number> }>
}
export type SaveAllocationsCode = 'VERSION_CONFLICT' | 'NEEDS_CHOICE' | 'NOT_FOUND' | 'VALIDATION'

// Pure helper (would live in src/domain/dates.ts in the real app — string dates only, no JS Date).
export declare function addDays(d: ISODate, n: number): ISODate
