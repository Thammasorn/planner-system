// src/lib/database/optimistic.ts — pure patches of a cached DatabaseResponse (plan/m11 S3.1, M11-D20). The client data
// layer applies them optimistically and again with the server's DTOs. Lists keep the server order (position, id);
// a provisional position between the real neighbours keeps later re-inserts (undo of a delete) in place. Never mutates.
import { generateKeyBetween } from 'fractional-indexing'
import type { CellValue, DatabaseResponse, DbColumnDTO, DbRowDTO, DbViewDTO } from '@/lib/contracts/databases'

type Positioned = { id: string; position: string }

/** temp id → server id of rows, columns, views and options (filled when a create resolves; R9). */
export const dbIdMap = new Map<string, string>()
export const resolveDbId = (id: string): string => dbIdMap.get(id) ?? id
/** `a` and `b` name the same object (one of them may still be the temp id). */
/**
 * A React key that survives the temp id → server id swap: the temp id an object was created with (or its own id).
 * Keying rows by it keeps their DOM — and an open cell editor with what was typed so far — when the create answers.
 */
export function stableDbKeys(): (id: string) => string {
  const back = new Map<string, string>()
  for (const [tmp, real] of dbIdMap) back.set(real, tmp)
  return (id) => back.get(id) ?? id
}
export const sameDbId = (a: string, b: string): boolean => a === b || resolveDbId(a) === resolveDbId(b)

export function findById<T extends { id: string }>(list: readonly T[], id: string): T | undefined {
  return list.find((x) => sameDbId(x.id, id))
}

function between(prev: string | null, next: string | null): string {
  try {
    return generateKeyBetween(prev, next)
  } catch {
    // provisional only (the server answers with its own key): equal or malformed neighbours → stay next to prev
    return prev ?? next ?? 'a0'
  }
}

/**
 * Moves / inserts `item` right after `afterId` (`null` = first, `undefined` = last) with a provisional position.
 * An unknown `afterId` appends.
 */
export function placeAfter<T extends Positioned>(
  list: readonly T[],
  item: T,
  afterId: string | null | undefined,
): T[] {
  const out = list.filter((x) => !sameDbId(x.id, item.id))
  let at: number
  if (afterId === undefined) at = out.length
  else if (afterId === null) at = 0
  else {
    const i = out.findIndex((x) => sameDbId(x.id, afterId))
    at = i < 0 ? out.length : i + 1
  }
  const position = between(out[at - 1]?.position ?? null, out[at]?.position ?? null)
  out.splice(at, 0, { ...item, position })
  return out
}

/** Re-inserts objects by their (kept) position — undo of a delete, server results of a restore. */
export function insertByPosition<T extends Positioned>(list: readonly T[], items: readonly T[]): T[] {
  const ids = new Set(items.map((x) => x.id))
  const out = list.filter((x) => !ids.has(x.id))
  for (const item of items) {
    const at = out.findIndex(
      (x) => x.position > item.position || (x.position === item.position && x.id > item.id),
    )
    out.splice(at < 0 ? out.length : at, 0, item)
  }
  return out
}

/** The id of the object right before `id` (null when first) — the `afterId` that puts it back. */
export function previousId<T extends { id: string }>(list: readonly T[], id: string): string | null {
  const i = list.findIndex((x) => sameDbId(x.id, id))
  return i > 0 ? list[i - 1]!.id : null
}

/** Merges a cells patch (`null` clears the key, BR-90). */
export function mergeCells(
  cells: Record<string, CellValue>,
  patch: Record<string, CellValue | null> | undefined,
): Record<string, CellValue> {
  if (!patch) return cells
  const out = { ...cells }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k]
    else out[k] = v
  }
  return out
}

export interface RowPatch {
  title?: string
  cells?: Record<string, CellValue | null>
}

export function patchRowValues(d: DatabaseResponse, rowId: string, p: RowPatch): DatabaseResponse {
  return {
    ...d,
    rows: d.rows.map((r) =>
      sameDbId(r.id, rowId)
        ? { ...r, ...(p.title !== undefined ? { title: p.title } : {}), cells: mergeCells(r.cells, p.cells) }
        : r,
    ),
  }
}

/**
 * Applies the server copy of a row after an update: version, position, audit fields and the values this
 * mutation sent come from the server; other cells keep the cache (later optimistic edits still queued).
 */
export function reconcileRow(
  d: DatabaseResponse,
  server: DbRowDTO,
  sent: RowPatch & { move?: boolean },
): DatabaseResponse {
  const rows = d.rows.map((r) => {
    if (!sameDbId(r.id, server.id)) return r
    const cells = { ...r.cells }
    for (const k of Object.keys(sent.cells ?? {})) {
      const v = server.cells[k]
      if (v === undefined) delete cells[k]
      else cells[k] = v
    }
    return {
      ...r,
      id: server.id,
      version: server.version,
      position: server.position,
      hasBody: server.hasBody,
      updatedAt: server.updatedAt,
      updatedBy: server.updatedBy,
      ...(sent.title !== undefined ? { title: server.title } : {}),
      cells,
    }
  })
  const moved = sent.move ? rows.find((r) => r.id === server.id) : undefined
  return { ...d, rows: moved ? insertByPosition(rows, [moved]) : rows }
}

/** Replaces one object wholesale (VERSION_CONFLICT `current`, server results). */
export function replaceRow(d: DatabaseResponse, row: DbRowDTO): DatabaseResponse {
  return { ...d, rows: d.rows.map((r) => (sameDbId(r.id, row.id) ? row : r)) }
}
export function replaceColumn(d: DatabaseResponse, col: DbColumnDTO): DatabaseResponse {
  return { ...d, columns: d.columns.map((c) => (sameDbId(c.id, col.id) ? col : c)) }
}
export function replaceView(d: DatabaseResponse, view: DbViewDTO): DatabaseResponse {
  return { ...d, views: d.views.map((v) => (sameDbId(v.id, view.id) ? view : v)) }
}

/** Server rows of a create replace the temp rows (same order). */
export function replaceTempRows(
  d: DatabaseResponse,
  tempIds: readonly string[],
  rows: readonly DbRowDTO[],
): DatabaseResponse {
  const map = new Map(tempIds.map((t, i) => [t, rows[i]]))
  const next = d.rows.map((r) => {
    const s = map.get(r.id)
    // keep values typed while the create was in flight (their own updates are queued behind it)
    return s ? { ...s, title: r.title === '' ? s.title : r.title, cells: { ...s.cells, ...r.cells } } : r
  })
  return { ...d, rows: next }
}

export function removeRows(d: DatabaseResponse, ids: readonly string[]): DatabaseResponse {
  return { ...d, rows: d.rows.filter((r) => !ids.some((id) => sameDbId(id, r.id))) }
}

/** Replaces a temp option id with the server's in the column's cells (a cell picked it before the create resolved). */
export function remapOptionInCells(
  d: DatabaseResponse,
  columnId: string,
  tmp: string,
  real: string,
): DatabaseResponse {
  return {
    ...d,
    rows: d.rows.map((r) => {
      const v = r.cells[columnId]
      if (v === tmp) return { ...r, cells: { ...r.cells, [columnId]: real } }
      if (Array.isArray(v) && v.includes(tmp))
        return { ...r, cells: { ...r.cells, [columnId]: v.map((x) => (x === tmp ? real : x)) } }
      return r
    }),
  }
}

/** Resolves temp ids inside a cells patch (option ids, never user ids — those are real). */
export function resolveCells<T extends CellValue | null>(cells: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(cells)) {
    const key = resolveDbId(k)
    if (typeof v === 'string') out[key] = resolveDbId(v) as T
    else if (Array.isArray(v)) out[key] = v.map(resolveDbId) as T
    else out[key] = v
  }
  return out
}
