// src/server/services/search.ts — page search for Cmd/Ctrl+K and the mention menu (FR-1102…1105, X68, M4-D19).
// M4-D37(b): M10 moves normalizeQuery/escapeLike to src/lib/search/normalize.ts and re-exports them here — import
// them only from '@/server/services/search'. Both are pure (no DB, no server-only).
// The route opens a read-only transaction with SET LOCAL statement_timeout = '500ms'; the content query runs inside a
// savepoint so a timeout (57014) keeps the title hits.
import { sql, type SQL } from 'drizzle-orm'
import { th } from '@/i18n/th'
import type { PageSearchHit } from '@/lib/contracts/search'
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
    where p.deleted_at is null and ${visible}`
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
