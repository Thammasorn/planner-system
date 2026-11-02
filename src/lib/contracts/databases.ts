// src/lib/contracts/databases.ts — isomorphic, type-only DTOs of databases inside pages (SPEC §4.14, §7.9;
// plan/m11 S0.4, M11-D19). Reads: GET /api/pages/[id]/databases/[databaseId] → DatabaseResponse. Writes: server
// actions in src/server/actions/databases.ts (inputs in src/lib/schemas/databases.ts).
import type {
  CellValue,
  ColumnConfig,
  DbColumnType,
  DbPersonRef,
  DbViewType,
  ViewConfig,
} from '@/domain/types'

export type {
  CellValue,
  ColumnConfig,
  DbColumnType,
  DbPersonRef,
  DbViewType,
  ViewConfig,
} from '@/domain/types'

export interface DbColumnDTO {
  id: string
  type: DbColumnType
  name: string
  config: ColumnConfig
  position: string
  version: number
}

export interface DbViewDTO {
  id: string
  type: DbViewType
  name: string
  config: ViewConfig
  position: string
  version: number
}

export interface DbRowDTO {
  id: string
  title: string
  cells: Record<string, CellValue>
  position: string
  version: number
  /** M11-D19 (additive to §7.9): the row has a non-blank DB_ROW body page (📄, FR-1453). */
  hasBody: boolean
  createdBy: string
  /** ISO timestamp. */
  createdAt: string
  updatedBy: string
  /** ISO timestamp. */
  updatedAt: string
}

/** SPEC §7.9 + `rows[].hasBody`. Live columns/views sorted by position; live rows sorted (position, id); `people` =
 *  users referenced in PERSON cells + row creators/updaters only (§3.3). */
export interface DatabaseResponse {
  id: string
  pageId: string
  title: string
  version: number
  canEdit: boolean
  columns: DbColumnDTO[]
  views: DbViewDTO[]
  rows: DbRowDTO[]
  people: Record<string, DbPersonRef>
}

// ── action results (§7.9) ──

export interface CreateDatabaseResult {
  databaseId: string
  database: DatabaseResponse
}

export interface CopyDatabaseResult {
  databaseId: string
}

export interface RenameDatabaseResult {
  databaseId: string
  title: string
  version: number
}

export interface CreateDatabaseRowsResult {
  rows: DbRowDTO[]
}

export interface UpdateDatabaseRowResult {
  row: DbRowDTO
}

/** Deletes of rows / columns / views (M11-D17). */
export interface DeleteBatchResult {
  batch: string
}

export interface RestoreRowBatchResult {
  rows: DbRowDTO[]
}

export interface ColumnResult {
  column: DbColumnDTO
}

export interface RestoreColumnBatchResult {
  columns: DbColumnDTO[]
}

/** M11-D16: `previous.values` only for rows that had a value; `rows` = rows whose value changed. */
export interface ChangeColumnTypeResult {
  column: DbColumnDTO
  rows: DbRowDTO[]
  previous: {
    type: DbColumnType
    config: ColumnConfig
    columnVersion: number
    values: Record<string, CellValue>
  }
}

export interface RevertColumnTypeResult {
  column: DbColumnDTO
  rows: DbRowDTO[]
}

/** M11-D10: KANBAN/CALENDAR in a database without a suitable column also creates it (`createdColumn`). */
export interface ViewResult {
  view: DbViewDTO
  createdColumn?: DbColumnDTO
}

export interface RestoreViewBatchResult {
  views: DbViewDTO[]
}

/** Body of a VERSION_CONFLICT for database objects (M11-D14): the current server copy of that object. */
export type DbConflictCurrent =
  | { target: 'database'; current: Pick<DatabaseResponse, 'id' | 'title' | 'version'> }
  | { target: 'row'; current: DbRowDTO }
  | { target: 'column'; current: DbColumnDTO }
  | { target: 'view'; current: DbViewDTO }
