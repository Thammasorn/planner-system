// src/lib/database/row-param.ts — the row panel deep link `?db=<databaseId>&row=<rowId>` (FR-1452, M11-D26): written
// with history.pushState/replaceState (the task-param.ts pattern, Next 16 syncs useSearchParams with them) so opening
// the panel never costs a server round trip. The store reads location directly so every reader updates on our own
// writes and on back/forward. Pure helpers (parse / href) are exported for node tests.
import { useSyncExternalStore } from 'react'

export interface RowParam {
  db: string | null
  row: string | null
}

const EVENT = 'database:row-param'
const NONE: RowParam = { db: null, row: null }

/** `?db=&row=` of a search string (`row` without `db` is ignored). */
export function parseRowParam(search: string): RowParam {
  const p = new URLSearchParams(search)
  const db = p.get('db')
  if (!db) return NONE
  return { db, row: p.get('row') || null }
}

/** `base` (a path, may carry a query) with `db` and `row` set (row null → removed). */
export function rowParamHref(base: string, db: string, row: string | null): string {
  const [path, query = ''] = base.split('?', 2) as [string, string?]
  const p = new URLSearchParams(query)
  p.set('db', db)
  if (row === null) p.delete('row')
  else p.set('row', row)
  return `${path}?${p.toString()}`
}

/** The row page of a row (FR-1453). */
export const rowPageHref = (rowId: string): string => `/r/${rowId}`

// ── browser store ──

let cache: { search: string; value: RowParam } = { search: '', value: NONE }

function read(): RowParam {
  const search = window.location.search
  if (search !== cache.search) cache = { search, value: parseRowParam(search) }
  return cache.value
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** `{ db, row }` of the current URL ({ null, null } on the server: the panel appears right after hydration). */
export function useRowParam(): RowParam {
  return useSyncExternalStore(subscribe, read, () => NONE)
}

function write(db: string | null, row: string | null, mode: 'push' | 'replace'): void {
  const url = new URL(window.location.href)
  if (db === null) {
    url.searchParams.delete('db')
    url.searchParams.delete('row')
  } else {
    url.searchParams.set('db', db)
    if (row === null) url.searchParams.delete('row')
    else url.searchParams.set('row', row)
  }
  const next = `${url.pathname}${url.search}${url.hash}`
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
  window.dispatchEvent(new Event(EVENT))
}

/** Opens the row panel of `rowId` in the block of `databaseId` (another row of the same panel → replace). */
export function openRowPanel(databaseId: string, rowId: string): void {
  const cur = read()
  if (cur.db === databaseId && cur.row === rowId) return
  write(databaseId, rowId, cur.db === databaseId && cur.row !== null ? 'replace' : 'push')
}

/** Closes the panel (keeps nothing of the deep link). */
export function closeRowPanel(): void {
  if (read().db === null) return
  write(null, null, 'replace')
}

/** The absolute link of a row (🔗 "คัดลอกลิงก์แถว"): the current page + `?db=&row=`. */
export function rowLinkFromLocation(databaseId: string, rowId: string): string {
  const { origin, pathname } = window.location
  return `${origin}${rowParamHref(pathname, databaseId, rowId)}`
}
