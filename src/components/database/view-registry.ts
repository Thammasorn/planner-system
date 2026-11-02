'use client'
// src/components/database/view-registry.ts — the views a database block can show (plan/m11 S3.2): TABLE is S3's,
// KANBAN and CALENDAR are registered by S4's modules (`registerDatabaseView('KANBAN', { View, MenuItems })`), which
// view-modules.ts imports. A type without a registration renders the "—" slot (never a crash).
import type { ComponentType } from 'react'
import type { DbRowDTO, DbViewDTO, DbViewType } from '@/lib/contracts/databases'

/** What every view component receives; data and writes come from useDbApi(). */
export interface DatabaseViewProps {
  view: DbViewDTO
  /** The view's rows after its filters and sorts (domain applyView) — the order ˄/˅ of the panel follow. */
  rows: DbRowDTO[]
  /** Opens a row: the side panel in documents / on /r, the row page /r/<id> in a compact (task panel) editor. */
  openRow: (rowId: string) => void
  variant: 'page' | 'compact'
  /** < 600 px (FR-1408, M11-D31). */
  narrow: boolean
}

/** Extra items of the toolbar's ⋯ menu for a view type (e.g. kanban "จัดกลุ่ม", calendar "คอลัมน์วันที่"). */
export interface DatabaseViewMenuProps {
  view: DbViewDTO
  /** Close the ⋯ menu (after an item ran). */
  close: () => void
}

export interface DatabaseViewRegistration {
  View: ComponentType<DatabaseViewProps>
  MenuItems?: ComponentType<DatabaseViewMenuProps>
}

const registry = new Map<DbViewType, DatabaseViewRegistration>()

export function registerDatabaseView(type: DbViewType, reg: DatabaseViewRegistration): void {
  registry.set(type, reg)
}

export function databaseView(type: DbViewType): DatabaseViewRegistration | undefined {
  return registry.get(type)
}

/** Every row of `rows` in view order as ids (the panel's ˄/˅). */
export const rowOrder = (rows: readonly Pick<DbRowDTO, 'id'>[]): string[] => rows.map((r) => r.id)
