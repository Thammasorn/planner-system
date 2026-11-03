'use client'
import { useSyncExternalStore } from 'react'

// `?task=<id>` (FR-611, M3-D17): written with history.pushState/replaceState (Next 16 syncs useSearchParams with
// them) so opening the panel never costs a server round trip. This store reads location directly so every reader
// updates on our own writes and on back/forward.
const EVENT = 'tasks:task-param'

function read(): string | null {
  return new URLSearchParams(window.location.search).get('task')
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** The open task id, or null (null on the server: the panel appears right after hydration). */
export function useTaskParam(): string | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

function write(id: string | null, mode: 'push' | 'replace'): void {
  const url = new URL(window.location.href)
  if (id === null) url.searchParams.delete('task')
  else url.searchParams.set('task', id)
  const next = `${url.pathname}${url.search}${url.hash}`
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
  window.dispatchEvent(new Event(EVENT))
}

/** `o.switchInPlace` (v3.9, plan grid click-to-open): switching an already open panel replaces the history entry, so
 *  clicking through rows does not stack one entry per row. */
export function openTaskPanel(id: string, o?: { switchInPlace?: boolean }): void {
  const current = read()
  if (current === id) return
  write(id, o?.switchInPlace && current !== null ? 'replace' : 'push')
}

export function closeTaskPanel(): void {
  if (read() === null) return
  write(null, 'replace')
}
