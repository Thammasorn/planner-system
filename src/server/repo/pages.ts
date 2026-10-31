// src/server/repo/pages.ts — page row primitives (plan/m04 S0.4 / S1). `tx` first.
// Malformed ids never reach SQL (callers parse with z.uuid(); getPage/getLivePageOrNotFound guard themselves). Sibling
// filters use isNull(...) for null projectId/parentId, eq otherwise. Every tree query orders by position, id (X48).
// Recursive CTEs carry a level counter (≤ 10 levels, FR-502) so a corrupt parent chain can never loop.
import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { PageSpace } from '@/lib/contracts/pages'
import { z } from '@/lib/z'
import { pages, type NewPage, type PageRow } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'

export interface PageScope {
  space: PageSpace
  projectId: string | null
  parentId: string | null
}

const uuidSchema = z.uuid()
export const isUuid = (id: string): boolean => uuidSchema.safeParse(id).success

export const uuidArray = (ids: readonly string[]): SQL =>
  ids.length === 0
    ? sql`array[]::uuid[]`
    : sql`array[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[]`

/** Live siblings of a scope (space + project + parent). */
export function scopeWhere(s: PageScope): SQL {
  return and(
    eq(pages.space, s.space),
    s.projectId === null ? isNull(pages.projectId) : eq(pages.projectId, s.projectId),
    s.parentId === null ? isNull(pages.parentId) : eq(pages.parentId, s.parentId),
    isNull(pages.deletedAt),
  )!
}

export async function insertPage(tx: DbOrTx, v: NewPage): Promise<PageRow> {
  const [row] = await tx.insert(pages).values(v).returning()
  return row!
}

/** Includes soft-deleted rows. */
export async function getPage(tx: DbOrTx, id: string): Promise<PageRow | null> {
  if (!isUuid(id)) return null
  const [row] = await tx.select().from(pages).where(eq(pages.id, id))
  return row ?? null
}

/** Deleted, missing or non-UUID id → NotFoundError. */
export async function getLivePageOrNotFound(tx: DbOrTx, id: string): Promise<PageRow> {
  const row = await getPage(tx, id)
  if (!row || row.deletedAt !== null) throw new NotFoundError()
  return row
}

/** Rows by id (deleted included), any order. Non-UUIDs are skipped. */
export async function getPages(tx: DbOrTx, ids: readonly string[]): Promise<PageRow[]> {
  const valid = [...new Set(ids.filter(isUuid))]
  if (valid.length === 0) return []
  return tx.select().from(pages).where(inArray(pages.id, valid))
}

/** The live sibling with the greatest position (append target). */
export async function lastLiveSibling(tx: DbOrTx, s: PageScope): Promise<PageRow | null> {
  const [row] = await tx
    .select()
    .from(pages)
    .where(scopeWhere(s))
    .orderBy(desc(pages.position), desc(pages.id))
    .limit(1)
  return row ?? null
}

/** Live siblings in display order (position, id). */
export function liveSiblings(tx: DbOrTx, s: PageScope): Promise<{ id: string; position: string }[]> {
  return tx
    .select({ id: pages.id, position: pages.position })
    .from(pages)
    .where(scopeWhere(s))
    .orderBy(asc(pages.position), asc(pages.id))
}

export async function setPosition(tx: DbOrTx, id: string, position: string): Promise<void> {
  await tx.update(pages).set({ position }).where(eq(pages.id, id))
}

/** Tree rows of one level (live only) with `has_children` (M4-D23 lazy children). */
export interface TreeRow {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  depth: number
  position: string
  locked: boolean
  isCharter: boolean
  hasChildren: boolean
}

export async function listLevel(tx: DbOrTx, s: PageScope): Promise<TreeRow[]> {
  const rows = await tx.execute<{
    id: string
    parent_id: string | null
    title: string
    icon: string | null
    depth: number
    position: string
    locked: boolean
    is_charter: boolean
    has_children: boolean
  }>(sql`
    select p.id, p.parent_id, p.title, p.icon, p.depth::int as depth, p.position, p.locked, p.is_charter,
           exists (select 1 from pages c where c.parent_id = p.id and c.deleted_at is null) as has_children
    from pages p
    where p.deleted_at is null and p.space = ${s.space}
      and ${s.projectId === null ? sql`p.project_id is null` : sql`p.project_id = ${s.projectId}`}
      and ${s.parentId === null ? sql`p.parent_id is null` : sql`p.parent_id = ${s.parentId}`}
    order by p.position, p.id`)
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    title: r.title,
    icon: r.icon,
    depth: r.depth,
    position: r.position,
    locked: r.locked,
    isCharter: r.is_charter,
    hasChildren: r.has_children,
  }))
}

/** Single-row tree projection (action results). */
export async function treeRow(tx: DbOrTx, id: string): Promise<TreeRow | null> {
  const p = await getPage(tx, id)
  if (!p) return null
  const [child] = await tx
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.parentId, id), isNull(pages.deletedAt)))
    .limit(1)
  return {
    id: p.id,
    parentId: p.parentId,
    title: p.title,
    icon: p.icon,
    depth: p.depth,
    position: p.position,
    locked: p.locked,
    isCharter: p.isCharter,
    hasChildren: child !== undefined,
  }
}

/** Ancestors of `pageId` (self excluded), root first. */
export async function ancestors(
  tx: DbOrTx,
  pageId: string,
): Promise<{ id: string; title: string; icon: string | null; depth: number }[]> {
  const rows = await tx.execute<{ id: string; title: string; icon: string | null; depth: number }>(sql`
    with recursive anc as (
      select p.id, p.parent_id, p.title, p.icon, p.depth, 0 as lvl from pages p
      where p.id = (select parent_id from pages where id = ${pageId})
      union all
      select p.id, p.parent_id, p.title, p.icon, p.depth, anc.lvl + 1 from pages p
      join anc on p.id = anc.parent_id where anc.lvl < 10
    )
    select id, title, icon, depth::int as depth from anc order by depth, id`)
  return [...rows]
}

/** True when the page or any ancestor has locked = true (FR-510 inheritance, M4-D24). */
export async function anyLockedUpward(tx: DbOrTx, pageId: string): Promise<boolean> {
  const [row] = await tx.execute<{ locked: boolean }>(sql`
    with recursive anc as (
      select id, parent_id, locked, 0 as lvl from pages where id = ${pageId}
      union all
      select p.id, p.parent_id, p.locked, anc.lvl + 1 from pages p join anc on p.id = anc.parent_id
      where anc.lvl < 10
    )
    select coalesce(bool_or(locked), false) as locked from anc`)
  return row?.locked ?? false
}

/** True when the live subtree of `pageId` (root included) contains a locked page. */
export async function subtreeHasLocked(tx: DbOrTx, pageId: string): Promise<boolean> {
  const [row] = await tx.execute<{ locked: boolean }>(sql`
    with recursive sub as (
      select id, locked, 0 as lvl from pages where id = ${pageId} and deleted_at is null
      union all
      select p.id, p.locked, sub.lvl + 1 from pages p join sub on p.parent_id = sub.id
      where p.deleted_at is null and sub.lvl < 10
    )
    select coalesce(bool_or(locked), false) as locked from sub`)
  return row?.locked ?? false
}

/** The live subtree of `rootId` (root included), parents before children (depth, position, id). */
export async function liveSubtree(tx: DbOrTx, rootId: string): Promise<PageRow[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    with recursive sub as (
      select id, 0 as lvl from pages where id = ${rootId} and deleted_at is null
      union all
      select p.id, sub.lvl + 1 from pages p join sub on p.parent_id = sub.id
      where p.deleted_at is null and sub.lvl < 10
    )
    select id from sub`)
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return []
  return tx
    .select()
    .from(pages)
    .where(inArray(pages.id, ids))
    .orderBy(asc(pages.depth), asc(pages.position), asc(pages.id))
}

/** Shifts the depth of the live subtree of `rootId` (root included) by `delta` in one statement. */
export async function shiftSubtreeDepth(tx: DbOrTx, rootId: string, delta: number): Promise<void> {
  if (delta === 0) return
  await tx.execute(sql`
    with recursive sub as (
      select id, 0 as lvl from pages where id = ${rootId} and deleted_at is null
      union all
      select p.id, sub.lvl + 1 from pages p join sub on p.parent_id = sub.id
      where p.deleted_at is null and sub.lvl < 10
    )
    update pages set depth = depth + ${delta} where id in (select id from sub)`)
}

export async function updatePlacement(
  tx: DbOrTx,
  id: string,
  v: { parentId: string | null; position: string; depth: number; updatedBy: string },
): Promise<PageRow> {
  const [row] = await tx
    .update(pages)
    .set({ parentId: v.parentId, position: v.position, depth: v.depth, updatedBy: v.updatedBy })
    .where(eq(pages.id, id))
    .returning()
  return row!
}

/** Soft-deletes the live subtree of `rootId` under `batch`; returns the ids it deleted (root first). */
export async function softDeleteSubtree(tx: DbOrTx, rootId: string, batch: string): Promise<string[]> {
  const rows = await tx.execute<{ id: string; depth: number }>(sql`
    with recursive sub as (
      select id, 0 as lvl from pages where id = ${rootId} and deleted_at is null
      union all
      select p.id, sub.lvl + 1 from pages p join sub on p.parent_id = sub.id
      where p.deleted_at is null and sub.lvl < 10
    )
    update pages set deleted_at = now(), deleted_batch = ${batch}
    where id in (select id from sub) and deleted_at is null
    returning id, depth::int as depth`)
  return [...rows].sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : 1)).map((r) => r.id)
}

/** Rows of one deletion batch + whether each is past the 30-day window (DB time, M4-D21). */
export async function listBatch(
  tx: DbOrTx,
  batch: string,
): Promise<(PageRow & { expired: boolean })[]> {
  if (!isUuid(batch)) return []
  return tx
    .select({
      ...getTableColumns(pages),
      expired: sql<boolean>`${pages.deletedAt} <= now() - interval '30 days'`,
    })
    .from(pages)
    .where(eq(pages.deletedBatch, batch))
    .orderBy(asc(pages.depth), asc(pages.position), asc(pages.id))
}

/** Clears deleted_at/deleted_batch on `ids` and shifts their depth by `delta`. */
export async function restoreRows(tx: DbOrTx, ids: readonly string[], delta: number): Promise<void> {
  if (ids.length === 0) return
  await tx
    .update(pages)
    .set({ deletedAt: null, deletedBatch: null, depth: sql`${pages.depth} + ${delta}` })
    .where(inArray(pages.id, [...ids]))
}
