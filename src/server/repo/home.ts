// src/server/repo/home.ts — SQL of the home "หน้าที่แก้ล่าสุด" card (SPEC §4.11 FR-1101e, M10-D17). The visibility set
// comes from authz.visibleProjectIds (resolved by the service before this query) and is bound as a parameter. Only live
// DOC pages (M6.1 forward note: task bodies are not documents); editor names are returned raw (display names in TS).
import { sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/types'
import { uuidArray } from './pages'

export type RecentPageRow = {
  id: string
  title: string
  icon: string | null
  updated_at: Date | string
  updated_by: string
  updated_by_name: string
  updated_by_nickname: string | null
  project_name: string | null
}

export const RECENT_PAGES_LIMIT = 8

/** WORKSPACE pages + PROJECT pages of visible live projects (archived included, X43), newest first. */
export async function listRecentPages(
  tx: DbOrTx,
  o: { all: boolean; visibleProjectIds: readonly string[] },
): Promise<RecentPageRow[]> {
  const visible = o.all
    ? sql`(g.space = 'WORKSPACE' or pr.id is not null)`
    : sql`(g.space = 'WORKSPACE' or (pr.id is not null and g.project_id = any(${uuidArray(o.visibleProjectIds)})))`
  return tx.execute<RecentPageRow>(sql`
    select g.id, g.title, g.icon, g.updated_at, g.updated_by, u.name as updated_by_name,
           u.nickname as updated_by_nickname, pr.name as project_name
    from pages g
    join "user" u on u.id = g.updated_by
    left join projects pr on pr.id = g.project_id and pr.deleted_at is null
    where g.deleted_at is null and g.kind = 'DOC' and ${visible}
    order by g.updated_at desc, g.id
    limit ${RECENT_PAGES_LIMIT}`)
}
