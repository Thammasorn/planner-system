// src/server/services/search.ts — page search for Cmd/Ctrl+K and the mention menu (FR-1102…1105, X68, M4-D19), and
// the tasks group (FR-690, M6.1-D14). Pages are kind = 'DOC' only (FR-682); task bodies are found through their task.
// M4-D37(b): M10 moves normalizeQuery/escapeLike to src/lib/search/normalize.ts and re-exports them here — import
// them only from '@/server/services/search'. Both are pure (no DB, no server-only).
// The route opens a read-only transaction with SET LOCAL statement_timeout = '500ms'; the content query runs inside a
// savepoint so a timeout (57014) keeps the title hits.
import { sql, type SQL } from 'drizzle-orm'
import { th } from '@/i18n/th'
import type { PageSearchHit, TaskSearchHit } from '@/lib/contracts/search'
import * as authz from '../authz'
import type { Tx } from '../db/types'
import { pgErrorInfo } from '../errors'
import { uuidArray } from '../repo/pages'
import type { SessionUser } from '../session'

export const SEARCH_LIMIT = 8
/** Content matches need at least this many characters (M4-D19). */
export const CONTENT_MIN_CHARS = 3

/** Escapes % _ \ for ILIKE … ESCAPE '\'. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** NFC, zero-width removed, whitespace collapsed, trimmed. */
export function normalizeQuery(q: string): string {
  return q
    .normalize('NFC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type HitRow = {
  id: string
  title: string
  icon: string | null
  project_name: string | null
}

const toHit = (r: HitRow, matchedIn: PageSearchHit['matchedIn']): PageSearchHit => ({
  kind: 'page',
  id: r.id,
  title: r.title,
  icon: r.icon,
  href: `/p/${r.id}`,
  subtitle: r.project_name ?? th.palette.wiki,
  matchedIn,
})

/** Title hits first, then content hits (q ≥ 3 chars) up to 8; read-only tx with statement_timeout 500ms. */
export async function searchPages(
  tx: Tx,
  user: SessionUser,
  q: string,
  opts: { titleOnly: boolean },
): Promise<PageSearchHit[]> {
  const vis = await authz.visibleProjectIds(tx, user) // FR-1104: filter in SQL, never after the fact
  const norm = normalizeQuery(q)
  if (norm === '') return []
  const pattern = `%${escapeLike(norm)}%`
  const visible: SQL =
    vis === 'ALL'
      ? sql`(p.space = 'WORKSPACE' or pr.id is not null)`
      : sql`(p.space = 'WORKSPACE' or (pr.id is not null and p.project_id = any(${uuidArray([...vis])})))`
  const base = sql`
    from pages p
    left join projects pr on pr.id = p.project_id and pr.deleted_at is null
    where p.deleted_at is null and p.kind = 'DOC' and ${visible}` // FR-682: task bodies live in the tasks group
  const titleRows = await tx.execute<HitRow>(sql`
    select p.id, p.title, p.icon, pr.name as project_name
    ${base} and p.title ilike ${pattern} escape '\\'
    order by word_similarity(${norm}, p.title) desc, length(p.title), p.id
    limit ${SEARCH_LIMIT}`)
  const hits = titleRows.map((r) => toHit(r, 'title'))
  if (opts.titleOnly || norm.length < CONTENT_MIN_CHARS || hits.length >= SEARCH_LIMIT) return hits
  const titleIds = hits.map((h) => h.id)
  try {
    const contentRows = await tx.transaction((sp) =>
      sp.execute<HitRow>(sql`
        select p.id, p.title, p.icon, pr.name as project_name
        ${base} and p.content_text ilike ${pattern} escape '\\'
          and p.id <> all(${uuidArray(titleIds)})
        limit ${SEARCH_LIMIT - hits.length}`),
    )
    hits.push(...contentRows.map((r) => toHit(r, 'content')))
  } catch (e) {
    if (pgErrorInfo(e).code !== '57014') throw e // statement timeout → keep the title hits (M4-D19)
  }
  return hits
}

type TaskHitRow = {
  id: string
  name: string
  project_id: string
  project_name: string
  project_archived: boolean
  status_id: string
  status_name: string
  status_color: string
  status_category: TaskSearchHit['status']['category']
  completed: boolean
}

const toTaskHit = (r: TaskHitRow, matchedIn: TaskSearchHit['matchedIn']): TaskSearchHit => ({
  kind: 'task',
  id: r.id,
  name: r.name,
  projectId: r.project_id,
  projectName: r.project_name,
  projectArchived: r.project_archived,
  status: { id: r.status_id, name: r.status_name, color: r.status_color, category: r.status_category },
  completed: r.completed,
  href: `/t/${r.id}`,
  matchedIn,
})

/**
 * FR-690 / M6.1-D14: task hits for Cmd/Ctrl+K — name hits (open before completed, then word_similarity), then body
 * hits (live TASK pages, q ≥ 3 chars, in a savepoint so a 500 ms statement timeout keeps the name hits, like pages);
 * live tasks of live projects visible to the viewer (archived included, flagged); ≤ 8. Visibility is in SQL (FR-1104).
 * The route answers `titleOnly` (mention menu) with `tasks: []` itself.
 */
export async function searchTasks(tx: Tx, user: SessionUser, q: string): Promise<TaskSearchHit[]> {
  const vis = await authz.visibleProjectIds(tx, user)
  const norm = normalizeQuery(q)
  if (norm === '') return []
  if (vis !== 'ALL' && vis.size === 0) return []
  const pattern = `%${escapeLike(norm)}%`
  const visible: SQL = vis === 'ALL' ? sql`true` : sql`t.project_id = any(${uuidArray([...vis])})`
  const select = sql`
    select t.id, t.name, t.project_id, pr.name as project_name, (pr.archived_at is not null) as project_archived,
           s.id as status_id, s.name as status_name, s.color as status_color, s.category as status_category,
           (t.completed_on is not null) as completed
    from tasks t
    join projects pr on pr.id = t.project_id and pr.deleted_at is null
    join task_statuses s on s.id = t.status_id`
  const nameRows = await tx.execute<TaskHitRow>(sql`
    ${select}
    where t.deleted_at is null and ${visible} and t.name ilike ${pattern} escape '\\'
    order by (t.completed_on is not null), word_similarity(${norm}, t.name) desc, length(t.name), t.id
    limit ${SEARCH_LIMIT}`)
  const hits = nameRows.map((r) => toTaskHit(r, 'name'))
  if (norm.length < CONTENT_MIN_CHARS || hits.length >= SEARCH_LIMIT) return hits
  const nameIds = hits.map((h) => h.id)
  try {
    const bodyRows = await tx.transaction((sp) =>
      sp.execute<TaskHitRow>(sql`
        ${select}
        join pages b on b.task_id = t.id and b.kind = 'TASK' and b.deleted_at is null
        where t.deleted_at is null and ${visible} and b.content_text ilike ${pattern} escape '\\'
          and t.id <> all(${uuidArray(nameIds)})
        order by (t.completed_on is not null), length(t.name), t.id
        limit ${SEARCH_LIMIT - hits.length}`),
    )
    hits.push(...bodyRows.map((r) => toTaskHit(r, 'content')))
  } catch (e) {
    if (pgErrorInfo(e).code !== '57014') throw e // statement timeout → keep the name hits (M4-D19)
  }
  return hits
}
