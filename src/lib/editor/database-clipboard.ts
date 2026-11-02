// src/lib/editor/database-clipboard.ts — copy / cut / paste of `database` blocks (FR-1471, §7.7, M11-D13). Pure
// (no React, no BlockNote runtime): runs in node tests and in the client editor.
// - On copy/cut the editor adds `application/x-teamos-databases+json` = { v: 1, sourcePageId, cut, ids } next to
//   BlockNote's own types and records the same in a same-tab registry (60 s) — browsers may strip custom types.
//   The listener must run AFTER BlockNote's copy handler (bubble phase on the surface): BlockNote calls
//   `clipboardData.clearData()` before writing (S5.1 spike, core copyExtension.ts), which would drop a type added
//   in the capture phase.
// - On paste the handler diffs the database blocks before / after the default insertion: an inserted block is
//   copied (copyDatabase → new id) when its id is now in the page more than once, or when its source page (MIME or
//   registry) is not this page; otherwise it keeps its id (cut + paste in the same page). A foreign id that is kept
//   is never trusted by the server: the block renders "ไม่พบฐานข้อมูล" (FR-1464).

export const DATABASE_MIME = 'application/x-teamos-databases+json'
/** How long a same-tab copy is remembered when the clipboard lost the custom type. */
export const REGISTRY_TTL_MS = 60_000
/** Upper bound of ids in one payload (a page holds at most 20 databases; copies of copies stay small). */
const MAX_IDS = 100

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DatabaseClip {
  v: 1
  sourcePageId: string
  cut: boolean
  ids: string[]
}

export interface DatabaseSource {
  sourcePageId: string
  cut: boolean
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x)

export function encodeDatabaseClip(clip: DatabaseClip): string {
  return JSON.stringify(clip)
}

/** The payload, or null when it is not exactly a v1 clip with uuid ids. */
export function parseDatabaseClip(raw: string): DatabaseClip | null {
  let x: unknown
  try {
    x = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(x) || x.v !== 1 || !isUuid(x.sourcePageId) || typeof x.cut !== 'boolean') return null
  if (!Array.isArray(x.ids) || x.ids.length > MAX_IDS || !x.ids.every(isUuid)) return null
  return { v: 1, sourcePageId: x.sourcePageId.toLowerCase(), cut: x.cut, ids: x.ids.map((i) => i.toLowerCase()) }
}

// ── same-tab registry ─────────────────────────────────────────────────────────────────────────────────────────────

const registry = new Map<string, DatabaseSource & { at: number }>()

export function rememberDatabaseClip(clip: DatabaseClip, now: number = Date.now()): void {
  for (const id of clip.ids) registry.set(id, { sourcePageId: clip.sourcePageId, cut: clip.cut, at: now })
}

/** Where a database id was last copied from in this tab (within the TTL), or null. */
export function sourceOfDatabase(databaseId: string, now: number = Date.now()): DatabaseSource | null {
  const e = registry.get(databaseId.toLowerCase())
  if (!e || now - e.at > REGISTRY_TTL_MS) return null
  return { sourcePageId: e.sourcePageId, cut: e.cut }
}

/** Test helper: forget every remembered copy. */
export function resetDatabaseClipRegistry(): void {
  registry.clear()
}

/** Adds the MIME to the clipboard (after BlockNote wrote its types) and remembers the copy in this tab. */
export function writeDatabaseClip(dt: DataTransfer, clip: DatabaseClip, now: number = Date.now()): void {
  dt.setData(DATABASE_MIME, encodeDatabaseClip(clip))
  rememberDatabaseClip(clip, now)
}

export function readDatabaseClip(dt: DataTransfer | null | undefined): DatabaseClip | null {
  if (!dt || !Array.from(dt.types).includes(DATABASE_MIME)) return null
  return parseDatabaseClip(dt.getData(DATABASE_MIME))
}

/** The database ids BlockNote put into its internal HTML (`blocknote/html`: props become `data-*` attributes). */
export function databaseIdsInHtml(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/data-database-id="([^"]*)"/g)) {
    const id = m[1] ?? ''
    if (isUuid(id)) out.add(id.toLowerCase())
  }
  return [...out]
}

// ── documents ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DatabaseBlockRef {
  blockId: string
  /** '' while the block is being created. */
  databaseId: string
}

/** Every `database` block of a document (any depth), in document order. */
export function findDatabaseBlocks(doc: unknown): DatabaseBlockRef[] {
  const out: DatabaseBlockRef[] = []
  const walk = (xs: unknown[], depth: number): void => {
    if (depth > 128) return
    for (const b of xs) {
      if (!isObj(b)) continue
      if (b.type === 'database' && typeof b.id === 'string') {
        const props = isObj(b.props) ? b.props : {}
        out.push({ blockId: b.id, databaseId: typeof props.databaseId === 'string' ? props.databaseId : '' })
      }
      if (Array.isArray(b.children)) walk(b.children as unknown[], depth + 1)
    }
  }
  if (Array.isArray(doc)) walk(doc as unknown[], 0)
  return out
}

export type DatabasePasteDecision =
  | { blockId: string; databaseId: string; action: 'keep' }
  | { blockId: string; databaseId: string; action: 'copy'; sourcePageId: string }

/** M11-D13: what to do with each database block a paste inserted. */
export function planDatabasePaste(o: {
  before: unknown
  after: unknown
  clip: DatabaseClip | null
  /** null: a task body without a row yet. */
  currentPageId: string | null
  now?: number
}): DatabasePasteDecision[] {
  const had = new Set(findDatabaseBlocks(o.before).map((b) => b.blockId))
  const after = findDatabaseBlocks(o.after)
  const count = new Map<string, number>()
  for (const b of after) count.set(b.databaseId, (count.get(b.databaseId) ?? 0) + 1)
  const now = o.now ?? Date.now()
  const out: DatabasePasteDecision[] = []
  for (const b of after) {
    if (had.has(b.blockId) || b.databaseId === '') continue
    const id = b.databaseId.toLowerCase()
    const source: string | null =
      o.clip && o.clip.ids.includes(id)
        ? o.clip.sourcePageId
        : (sourceOfDatabase(id, now)?.sourcePageId ?? null)
    const duplicate = (count.get(b.databaseId) ?? 0) > 1
    const from = source ?? (duplicate ? o.currentPageId : null)
    if (from !== null && (duplicate || from !== o.currentPageId))
      out.push({ blockId: b.blockId, databaseId: b.databaseId, action: 'copy', sourcePageId: from })
    else out.push({ blockId: b.blockId, databaseId: b.databaseId, action: 'keep' })
  }
  return out
}
