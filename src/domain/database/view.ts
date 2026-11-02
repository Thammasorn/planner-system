// src/domain/database/view.ts — view helpers: default column names (FR-1411), visible columns (FR-1413/1420/1428),
// suspended references (FR-1415) and applyView = filter ∘ sort (BR-94, BR-95).
import type { DbColumnModel, DbCtx, DbRowModel, DbViewType, ViewConfig } from '../types'
import type { DbColumnLike } from './cells'
import { makeRowFilter } from './filter'
import { sortRows } from './sort'

/**
 * FR-1411: `baseName` (the caller passes the th name of the type, keeping the domain i18n-free) when unused,
 * else `"<baseName> 2"`, `"<baseName> 3"` … — the first free number. Names compare trimmed.
 */
export function defaultColumnName(baseName: string, existingNames: Iterable<string>): string {
  const taken = new Set([...existingNames].map((n) => n.trim()))
  if (!taken.has(baseName)) return baseName
  for (let i = 2; ; i++) {
    const name = `${baseName} ${i}`
    if (!taken.has(name)) return name
  }
}

function byPosition(
  a: Pick<DbColumnModel, 'position' | 'id'>,
  b: Pick<DbColumnModel, 'position' | 'id'>,
): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Columns shown by a view, in database order (position, id); hidden ones removed except TITLE (never hidden).
 * TABLE pins TITLE first (FR-1420); KANBAN / CALENDAR keep it where it sits.
 */
export function visibleColumns<C extends DbColumnModel>(
  cols: readonly C[],
  view: { type: DbViewType; config: ViewConfig },
): C[] {
  const hidden = new Set(view.config.hiddenColumnIds ?? [])
  const shown = cols.filter((c) => c.type === 'TITLE' || !hidden.has(c.id)).sort(byPosition)
  if (view.type !== 'TABLE') return shown
  return [...shown.filter((c) => c.type === 'TITLE'), ...shown.filter((c) => c.type !== 'TITLE')]
}

/**
 * FR-1415: the config with references to missing columns dropped (sorts, filters, hidden, widths, card columns)
 * and `groupByColumnId` / `dateColumnId` kept only when they name a SELECT/PERSON/CHECKBOX resp. DATE column.
 * They come back by themselves when the column is restored (the stored config is untouched).
 */
export function liveConfig(config: ViewConfig, cols: readonly DbColumnLike[]): ViewConfig {
  const byId = new Map(cols.map((c) => [c.id, c]))
  const has = (id: string) => byId.has(id)
  const out: ViewConfig = {}
  if (config.hiddenColumnIds) out.hiddenColumnIds = config.hiddenColumnIds.filter(has)
  if (config.columnWidths) {
    out.columnWidths = Object.fromEntries(Object.entries(config.columnWidths).filter(([id]) => has(id)))
  }
  if (config.sorts) out.sorts = config.sorts.filter((s) => has(s.columnId))
  if (config.filters) out.filters = config.filters.filter((f) => has(f.columnId))
  const group = config.groupByColumnId === undefined ? undefined : byId.get(config.groupByColumnId)
  if (group && ['SELECT', 'PERSON', 'CHECKBOX'].includes(group.type)) out.groupByColumnId = group.id
  if (config.hideEmptyGroups !== undefined) out.hideEmptyGroups = config.hideEmptyGroups
  const date = config.dateColumnId === undefined ? undefined : byId.get(config.dateColumnId)
  if (date?.type === 'DATE') out.dateColumnId = date.id
  if (config.cardColumnIds) out.cardColumnIds = config.cardColumnIds.filter(has)
  return out
}

/** The rows a view shows, in order: BR-95 filters, then BR-94 sorts (suspended references ignored). */
export function applyView<R extends DbRowModel>(
  rows: readonly R[],
  view: { config: ViewConfig },
  cols: readonly DbColumnLike[],
  ctx: DbCtx,
): R[] {
  const keep = makeRowFilter(view.config.filters ?? [], cols, ctx)
  return sortRows(
    rows.filter((r) => keep(r)),
    view.config.sorts ?? [],
    cols,
    ctx,
  )
}
