// src/lib/nav/scroll-memory.ts — scroll memory of the task list views (FR-686, M6.1-D18). Before ↗ / Shift+Space
// leaves a list the view records `scrollY` under `pathname + search`; on a browser-history return (popstate — the
// task page's ← / Esc go through `router.back()`) the view restores it once its data has rendered. A backup to
// Next's own restoration, which runs before the TanStack data is back on screen. Module state only (no storage).

const positions = new Map<string, number>()
/** Views that scroll inside their own box (the planning grid), not the window. */
const boxes = new Map<string, BoxScroll>()
let popPending = false
let listening = false
/** Where the traversal signal comes from (kept for the test-hook cleanup). */
let source: { target: EventTarget; type: string } | null = null

const onPop = (): void => {
  popPending = true
}
/** Navigation API: only back / forward (traverse) count; pushes and replaces do not. */
const onNavigate = (e: Event): void => {
  if ((e as Event & { navigationType?: string }).navigationType === 'traverse') popPending = true
}

/** `pathname + search` of the current location (the open `?task=` panel is part of the place). */
export function currentScrollKey(): string {
  return `${window.location.pathname}${window.location.search}`
}

/** Records the position of `key` (default: the current place and `window.scrollY`). */
export function rememberScroll(key: string = currentScrollKey(), y: number = window.scrollY): void {
  installPopListener() // the return trip's popstate fires before the list mounts again
  popPending = false
  positions.set(key, y)
}

/** A scroll box's position plus the window's (the grid scrolls in its own `.scroller`, FR-686). */
export interface BoxScroll {
  top: number
  left: number
  windowY: number
}

/** Records the position of the scroll box `el` (and of the window) under `key` (default: the current place). */
export function rememberBoxScroll(el: HTMLElement, key: string = currentScrollKey()): void {
  installPopListener()
  popPending = false
  boxes.set(key, { top: el.scrollTop, left: el.scrollLeft, windowY: window.scrollY })
}

/** The remembered box position of `key`, once (null when none). */
export function takeBoxScroll(key: string): BoxScroll | null {
  const v = boxes.get(key)
  boxes.delete(key)
  return v ?? null
}

/** The remembered position of `key`, once (null when none). */
export function takeScroll(key: string): number | null {
  const y = positions.get(key)
  positions.delete(key)
  return y ?? null
}

/** Listens for history traversals (Navigation API `navigate`, else popstate) once per page load (idempotent); list views call it on mount. */
export function installPopListener(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  // Navigation API first: on a back / forward Chromium fires `navigate` (traverse) at once, but `popstate` only after
  // Next has already rendered the returning route (a replaceState lands in between, seen in the T3 e2e trace), so
  // with popstate alone the grid / lists mount before the flag is set and never restore. popstate is the fallback for
  // browsers without `window.navigation`.
  const nav = (window as Window & { navigation?: EventTarget }).navigation
  if (nav && typeof nav.addEventListener === 'function') {
    nav.addEventListener('navigate', onNavigate)
    source = { target: nav, type: 'navigate' }
  } else {
    window.addEventListener('popstate', onPop)
    source = { target: window, type: 'popstate' }
  }
}

/** Whether a history (popstate) navigation happened since the last call. */
export function consumePopNavigation(): boolean {
  const v = popPending
  popPending = false
  return v
}

/** Test hook: forget everything and stop listening. */
export function resetScrollMemory(): void {
  positions.clear()
  boxes.clear()
  popPending = false
  if (source) source.target.removeEventListener(source.type, source.type === 'navigate' ? onNavigate : onPop)
  source = null
  listening = false
}
