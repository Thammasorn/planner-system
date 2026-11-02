// src/lib/schemas/db-limits.ts — FR-1475 limits of databases inside pages (M11-D37): the single source of the numbers.
// Plain constants (no zod, no th) so src/domain/database.ts can re-export them (`export { DB_LIMITS }`) and the zod
// schemas, services and UI all read the same values.
export const DB_LIMITS = {
  /** Live rows per database. */
  rows: 1000,
  /** Live columns per database, TITLE included. */
  columns: 30,
  views: 10,
  /** Attached databases per owner page. */
  databasesPerPage: 20,
  optionsPerColumn: 100,
  /** MULTI_SELECT values per cell. */
  multi: 20,
  /** PERSON values per cell. */
  people: 20,
  dbTitle: 200,
  /** Column, view and option names (trimmed, ≥ 1). */
  name: 100,
  rowTitle: 500,
  /** TEXT / URL / NUMBER / DATE strings. */
  text: 2000,
  sorts: 3,
  filters: 10,
  /** Rows created per createDatabaseRows call. */
  rowsPerAction: 50,
  /** Row ids per deleteDatabaseRows call (= the row limit). */
  rowIdsPerAction: 1000,
  /** Values in a filter's id list. */
  filterValues: 100,
  widthMin: 80,
  widthMax: 600,
  decimalsMax: 6,
  /** Length of one id inside a MULTI_SELECT / PERSON cell (option uuids, Better Auth user ids). */
  idMax: 64,
} as const
