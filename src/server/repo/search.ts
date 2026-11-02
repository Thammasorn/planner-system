// src/server/repo/search.ts — SQL of the M10 palette categories and the local index (SPEC §4.11 FR-1102/1104/1105,
// §6.4 trigram indexes, X68, M10-D20/D21). Visibility sets are resolved by the caller (authz) and bound here as
// parameters, so filtering happens in SQL (FR-1104). Patterns are escaped by the caller (`escapeLike`) and matched with
// `ILIKE … ESCAPE '\'`; ranking is `word_similarity(q, col) desc, length(col), id`. ≤ `limit` rows per category.
// No Thai literals; names are returned raw (display names are built in TypeScript, PLAN §3.7).
import { sql, type SQL } from 'drizzle-orm'
import type { ProjectAccessRole } from '@/lib/contracts/projects'
import type { DbOrTx } from '../db/types'
import { uuidArray } from './pages'

/** `'ALL'` = no restriction (manager / LEAD for people), else the ids the viewer may see. */
export type VisibleIds = 'ALL' | readonly string[]

const textArray = (ids: readonly string[]): SQL =>
  ids.length === 0
    ? sql`array[]::text[]`
    : sql`array[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[]`

const projectVisible = (vis: VisibleIds, col: SQL): SQL =>
  vis === 'ALL' ? sql`true` : sql`${col} = any(${uuidArray(vis)})`

/** M2-D16 activity flag (banned is not true and no deactivated_on), same expression as repo.people.personActive. */
const ACTIVE = sql`(u.banned is not true and u.deactivated_on is null)`

export type ProjectHitRow = {
  id: string
  name: string
  color: string
  archived: boolean
  tentative: boolean
}

export async function searchProjects(
  tx: DbOrTx,
  o: { vis: VisibleIds; q: string; pattern: string; limit: number },
): Promise<ProjectHitRow[]> {
  return tx.execute<ProjectHitRow>(sql`
    select p.id, p.name, p.color, (p.archived_at is not null) as archived, (p.certainty = 'TENTATIVE') as tentative
    from projects p
    where p.deleted_at is null and ${projectVisible(o.vis, sql`p.id`)} and p.name ilike ${o.pattern} escape '\\'
    order by word_similarity(${o.q}, p.name) desc, length(p.name), p.id
    limit ${o.limit}`)
}

export type PersonHitRow = {
  id: string
  name: string
  nickname: string | null
  position_name: string | null
  active: boolean
}

export async function searchPeople(
  tx: DbOrTx,
  o: { users: VisibleIds; q: string; pattern: string; limit: number },
): Promise<PersonHitRow[]> {
  const visible = o.users === 'ALL' ? sql`true` : sql`u.id = any(${textArray(o.users)})`
  return tx.execute<PersonHitRow>(sql`
    select u.id, u.name, u.nickname, pos.name as position_name, ${ACTIVE} as active
    from "user" u
    left join positions pos on pos.id = u.position_id
    where ${visible} and (u.name ilike ${o.pattern} escape '\\' or u.nickname ilike ${o.pattern} escape '\\')
    order by greatest(word_similarity(${o.q}, u.name), word_similarity(${o.q}, coalesce(u.nickname, ''))) desc,
             length(u.name), u.id
    limit ${o.limit}`)
}

export type ClientHitRow = {
  id: string
  name: string
  archived: boolean
}

/** `vis = 'ALL'` (manager) → every client; otherwise clients of the visible live projects (PERM-04). */
const clientVisible = (vis: VisibleIds): SQL =>
  vis === 'ALL'
    ? sql`true`
    : sql`exists (select 1 from projects p
        where p.client_id = c.id and p.deleted_at is null and p.id = any(${uuidArray(vis)}))`

export async function searchClients(
  tx: DbOrTx,
  o: { vis: VisibleIds; q: string; pattern: string; limit: number },
): Promise<ClientHitRow[]> {
  return tx.execute<ClientHitRow>(sql`
    select c.id, c.name, (c.archived_at is not null) as archived
    from clients c
    where ${clientVisible(o.vis)} and c.name ilike ${o.pattern} escape '\\'
    order by word_similarity(${o.q}, c.name) desc, length(c.name), c.id
    limit ${o.limit}`)
}

// ── the local index (M10-D21): unordered here, the service sorts with the Thai collator ──

export type IndexProjectRow = ProjectHitRow & { role: ProjectAccessRole }

/** Live projects (archived included). `viewerId = null` (manager) → every project with role MANAGER; otherwise the
 *  viewer's member projects with their membership role (= visibleProjectIds for workers, X43). */
export async function indexProjects(tx: DbOrTx, viewerId: string | null): Promise<IndexProjectRow[]> {
  const cols = sql`p.id, p.name, p.color, (p.archived_at is not null) as archived, (p.certainty = 'TENTATIVE') as tentative`
  if (viewerId === null) {
    return tx.execute<IndexProjectRow>(sql`
      select ${cols}, 'MANAGER' as role from projects p where p.deleted_at is null`)
  }
  return tx.execute<IndexProjectRow>(sql`
    select ${cols}, pm.role::text as role
    from projects p join project_members pm on pm.project_id = p.id and pm.user_id = ${viewerId}
    where p.deleted_at is null`)
}

export async function indexPeople(tx: DbOrTx, users: VisibleIds): Promise<PersonHitRow[]> {
  const visible = users === 'ALL' ? sql`true` : sql`u.id = any(${textArray(users)})`
  return tx.execute<PersonHitRow>(sql`
    select u.id, u.name, u.nickname, pos.name as position_name, ${ACTIVE} as active
    from "user" u left join positions pos on pos.id = u.position_id
    where ${visible}`)
}

export async function indexClients(tx: DbOrTx, vis: VisibleIds): Promise<ClientHitRow[]> {
  return tx.execute<ClientHitRow>(sql`
    select c.id, c.name, (c.archived_at is not null) as archived from clients c where ${clientVisible(vis)}`)
}
