'use client'
// src/components/database/data/contract.ts — the client database API every view, menu and panel talks to
// (plan/m11 S0.12, M11-D20). S3's data layer implements it over qk.database + the §7.9 actions (optimistic, undo,
// conflicts, temp ids); ui tests use the in-memory fake (fakeDbApi.test-helper.ts). Writes are fire-and-forget for
// the caller (errors surface as toasts in the implementation); creators resolve to the (temp, then server) id.
import { createContext, useContext } from 'react'
import type { ISODate } from '@/domain/types'
import type {
  CellValue,
  ColumnConfig,
  DatabaseResponse,
  DbColumnType,
  DbViewType,
  ViewConfig,
} from '@/lib/contracts/databases'

export interface DbApi {
  /** The current (optimistic) database. */
  db: DatabaseResponse
  canEdit: boolean
  viewerId: string
  today: ISODate
  renameDatabase(title: string): void
  createRows(
    rows: { title?: string; cells?: Record<string, CellValue>; afterRowId?: string | null }[],
    opts?: { focusTitle?: boolean },
  ): Promise<string[]>
  updateRow(
    rowId: string,
    patch: {
      title?: string
      cells?: Record<string, CellValue | null>
      move?: { afterRowId: string | null }
    },
    label?: string,
    /** FR-1433 / FR-1442: drags show the 8 s undo toast (`toast` = its text). */
    opts?: { toast?: string },
  ): void
  deleteRows(rowIds: string[]): void
  createColumn(type: DbColumnType, opts?: { name?: string; afterColumnId?: string | null }): Promise<string>
  updateColumn(
    columnId: string,
    patch: { name?: string; config?: ColumnConfig; afterColumnId?: string | null },
  ): void
  duplicateColumn(columnId: string): void
  changeColumnType(columnId: string, type: DbColumnType): void
  deleteColumn(columnId: string): void
  /** Creates a SELECT / MULTI_SELECT option; resolves to its id (a temp id until the server answers). */
  addOption(columnId: string, name: string): Promise<string>
  createView(type: DbViewType, opts?: { copyFromViewId?: string }): Promise<string>
  updateView(
    viewId: string,
    patch: { name?: string; config?: ViewConfig; afterViewId?: string | null },
    label?: string,
  ): void
  deleteView(viewId: string): void
}

export const DbApiContext = createContext<DbApi | null>(null)

/** The database API of the surrounding block / row page. Throws outside a provider (programming error). */
export function useDbApi(): DbApi {
  const api = useContext(DbApiContext)
  if (!api) throw new Error('useDbApi() outside <DbApiContext.Provider>')
  return api
}
