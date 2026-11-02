// src/domain/database/group.ts — BR-96 kanban: groups by a SELECT / PERSON / CHECKBOX column, multi-person rows in
// every person group, and the value a card takes when dropped on another group.
import type { CellValue, DbCtx, DbRowModel, OptionColor, ViewConfig } from '../types'
import { optionsOf, readCell, type DbColumnLike } from './cells'
import { DbDomainError } from './limits'
import { collatorOf, sortRows } from './sort'

export type GroupKey =
  | { kind: 'option'; id: string }
  | { kind: 'person'; id: string }
  | { kind: 'checked' }
  | { kind: 'unchecked' }
  | { kind: 'none' }

export interface DbGroup<R extends DbRowModel = DbRowModel> {
  key: GroupKey
  /** Option name / person full name (id when unknown); null for checked / unchecked / none (UI texts in th). */
  label: string | null
  /** Option colour; null otherwise. */
  color: OptionColor | null
  rows: R[]
}

export type GroupRowsResult<R extends DbRowModel = DbRowModel> =
  { ok: true; groups: DbGroup<R>[] } | { ok: false; reason: 'NO_GROUP_COLUMN' }

/** Stable string id of a group (dnd ids, React keys): `option:<id>`, `person:<id>`, `checked`, `unchecked`, `none`. */
export function groupKeyId(key: GroupKey): string {
  return key.kind === 'option' || key.kind === 'person' ? `${key.kind}:${key.id}` : key.kind
}

const GROUPABLE = new Set(['SELECT', 'PERSON', 'CHECKBOX'])

/**
 * BR-96 groups of `rows` (already filtered by the view) for `view.config.groupByColumnId`; in-group order = BR-94
 * with the view's sorts. SELECT = option order (empty options too) then none · PERSON = people in ≥ 1 row by the
 * collator, then none · CHECKBOX = checked, unchecked. `hideEmptyGroups` drops groups without cards.
 */
export function groupRows<R extends DbRowModel>(
  rows: readonly R[],
  view: { config: ViewConfig },
  cols: readonly DbColumnLike[],
  ctx: DbCtx,
): GroupRowsResult<R> {
  const col = cols.find((c) => c.id === view.config.groupByColumnId)
  if (!col || !GROUPABLE.has(col.type)) return { ok: false, reason: 'NO_GROUP_COLUMN' }
  const sorted = sortRows(rows, view.config.sorts ?? [], cols, ctx)
  const none: DbGroup<R> = { key: { kind: 'none' }, label: null, color: null, rows: [] }
  let groups: DbGroup<R>[]
  if (col.type === 'CHECKBOX') {
    const checked: DbGroup<R> = { key: { kind: 'checked' }, label: null, color: null, rows: [] }
    const unchecked: DbGroup<R> = { key: { kind: 'unchecked' }, label: null, color: null, rows: [] }
    for (const r of sorted) (readCell(col, r.cells[col.id]) === true ? checked : unchecked).rows.push(r)
    groups = [checked, unchecked]
  } else if (col.type === 'SELECT') {
    const byId = new Map<string, DbGroup<R>>()
    for (const o of optionsOf(col)) {
      byId.set(o.id, { key: { kind: 'option', id: o.id }, label: o.name, color: o.color, rows: [] })
    }
    for (const r of sorted) {
      const v = readCell(col, r.cells[col.id]) as string | null
      ;(v === null ? none : byId.get(v)!).rows.push(r)
    }
    groups = [...byId.values(), none]
  } else {
    const byId = new Map<string, DbGroup<R>>()
    for (const r of sorted) {
      const ids = readCell(col, r.cells[col.id]) as string[] | null
      if (ids === null) none.rows.push(r)
      for (const id of ids ?? []) {
        let g = byId.get(id)
        if (!g) {
          g = { key: { kind: 'person', id }, label: ctx.people.get(id)?.name ?? id, color: null, rows: [] }
          byId.set(id, g)
        }
        g.rows.push(r)
      }
    }
    const collator = collatorOf(ctx)
    const people = [...byId.values()].sort(
      (a, b) => collator.compare(a.label!, b.label!) || (groupKeyId(a.key) < groupKeyId(b.key) ? -1 : 1),
    )
    groups = [...people, none]
  }
  return { ok: true, groups: view.config.hideEmptyGroups ? groups.filter((g) => g.rows.length > 0) : groups }
}

function keyMismatch(): never {
  throw new DbDomainError('GROUP_KEY')
}

/**
 * BR-96 drop of `row`'s card from group `from` onto group `to` → the new value of the group column (null = delete
 * the key). SELECT / CHECKBOX: the target group's value. PERSON (others always kept): A → B replaces A in place
 * (B already there → just remove A); A → none removes A; none → B = `[B]`. A stale A (no longer in the row) → B
 * is appended when missing. Throws DbDomainError for a non-group column or a key of the wrong kind.
 */
export function dropOnGroup(
  row: DbRowModel,
  col: DbColumnLike,
  from: GroupKey,
  to: GroupKey,
): CellValue | null {
  switch (col.type) {
    case 'SELECT':
      if (to.kind === 'none') return null
      return to.kind === 'option' ? to.id : keyMismatch()
    case 'CHECKBOX':
      if (to.kind === 'checked') return true
      return to.kind === 'unchecked' ? null : keyMismatch()
    case 'PERSON': {
      if ((to.kind !== 'person' && to.kind !== 'none') || (from.kind !== 'person' && from.kind !== 'none')) {
        return keyMismatch()
      }
      const current = (readCell(col, row.cells[col.id]) as string[] | null) ?? []
      if (from.kind === 'none') return to.kind === 'none' ? (current.length ? current : null) : [to.id]
      if (to.kind === 'person' && to.id === from.id) return current.length ? current : null
      const i = current.indexOf(from.id)
      let next: string[]
      if (to.kind === 'none') next = current.filter((id) => id !== from.id)
      else if (current.includes(to.id)) next = current.filter((id) => id !== from.id)
      else if (i === -1) next = [...current, to.id]
      else next = current.map((id, k) => (k === i ? to.id : id))
      return next.length ? next : null
    }
    default:
      throw new DbDomainError('GROUP_COLUMN')
  }
}
