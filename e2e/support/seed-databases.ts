/**
 * Database rows for `resetDb(undefined, { extras })` (plan/m11 S7.1). Plain Drizzle inserts into `planner_e2e`: test data
 * the scenario is not about. `insertDatabase` appends a `database` block to the owner page's content (so the page shows
 * it) and creates columns / options / views / rows with fractional-indexing positions (X48).
 */
import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import { addSyntheticDatabase } from '../../scripts/lib/perf-data'
import { extractContentText } from '../../src/lib/editor/content-text'
import { databaseColumns, databaseRows, databases, databaseViews, pages, projects, user } from '../../src/server/db/schema'
import type { DbOrTx } from '../../src/server/db/types'

type ColType = 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTI_SELECT' | 'DATE' | 'CHECKBOX' | 'PERSON' | 'URL'
export interface SeedColumn {
  name: string
  type: ColType
  /** SELECT / MULTI_SELECT option names (colours cycle). */
  options?: string[]
}
export interface SeedRow {
  title: string
  /** By column name: option names for SELECT / MULTI_SELECT, nicknames for PERSON, raw strings otherwise; `true` = ticked. */
  cells?: Record<string, string | string[] | true>
}
export interface SeedView {
  type: 'TABLE' | 'KANBAN' | 'CALENDAR'
  name: string
  /** KANBAN group / CALENDAR date column by name. */
  by?: string
}
export interface InsertDatabaseOptions {
  /** Owner page: id, or a live page title (+ project name for PROJECT pages). */
  pageId?: string
  pageTitle?: string
  projectName?: string
  title: string
  columns?: SeedColumn[]
  rows?: SeedRow[]
  views?: SeedView[]
  byNickname?: string
}

const COLORS = ['gray', 'blue', 'green', 'orange', 'purple', 'pink', 'red', 'teal', 'yellow', 'brown'] as const

async function ownerPage(db: DbOrTx, o: InsertDatabaseOptions): Promise<typeof pages.$inferSelect> {
  if (o.pageId) {
    const [p] = await db.select().from(pages).where(eq(pages.id, o.pageId))
    if (!p) throw new Error(`insertDatabase: no page ${o.pageId}`)
    return p
  }
  const rows = await db
    .select({ p: pages })
    .from(pages)
    .leftJoin(projects, eq(projects.id, pages.projectId))
    .where(
      and(
        eq(pages.title, o.pageTitle ?? ''),
        isNull(pages.deletedAt),
        ...(o.projectName ? [eq(projects.name, o.projectName)] : []),
      ),
    )
  if (rows.length !== 1) throw new Error(`insertDatabase: page "${o.pageTitle}" → ${rows.length} rows`)
  return rows[0]!.p
}

/** Inserts one attached database (+ its block at the end of the page content); returns the ids by name. */
export async function insertDatabase(
  db: DbOrTx,
  o: InsertDatabaseOptions,
): Promise<{ databaseId: string; pageId: string; columns: Record<string, string>; rows: Record<string, string> }> {
  const page = await ownerPage(db, o)
  const people = await db.select({ id: user.id, nickname: user.nickname }).from(user)
  const nick = (n: string): string => {
    const hit = people.find((p) => p.nickname === n)
    if (!hit) throw new Error(`insertDatabase: no user ${n}`)
    return hit.id
  }
  const by = o.byNickname ? nick(o.byNickname) : page.createdBy
  const [d] = await db
    .insert(databases)
    .values({ pageId: page.id, title: o.title, createdBy: by, updatedBy: by })
    .returning({ id: databases.id })
  const spec: SeedColumn[] = o.columns ?? [
    { name: 'สถานะ', type: 'SELECT', options: ['ยังไม่เริ่ม', 'กำลังทำ', 'เสร็จ'] },
    { name: 'วันที่', type: 'DATE' },
  ]
  const keys = generateNKeysBetween(null, null, spec.length + 1)
  const colIds: Record<string, string> = { ชื่อ: randomUUID() }
  const optionIds: Record<string, Record<string, string>> = {}
  const values: (typeof databaseColumns.$inferInsert)[] = [
    { id: colIds['ชื่อ'], databaseId: d!.id, type: 'TITLE', name: 'ชื่อ', position: keys[0]! },
  ]
  spec.forEach((c, i) => {
    const id = randomUUID()
    colIds[c.name] = id
    let config: Record<string, unknown> = {}
    if (c.options) {
      optionIds[c.name] = Object.fromEntries(c.options.map((n) => [n, randomUUID()]))
      config = {
        options: c.options.map((n, j) => ({ id: optionIds[c.name]![n], name: n, color: COLORS[j % COLORS.length] })),
      }
    } else if (c.type === 'SELECT' || c.type === 'MULTI_SELECT') config = { options: [] }
    else if (c.type === 'NUMBER') config = { decimals: null, thousands: true }
    values.push({ id, databaseId: d!.id, type: c.type, name: c.name, config, position: keys[i + 1]! })
  })
  await db.insert(databaseColumns).values(values)
  const views = o.views ?? [{ type: 'TABLE', name: 'ตาราง' }]
  const viewKeys = generateNKeysBetween(null, null, views.length)
  await db.insert(databaseViews).values(
    views.map((v, i) => ({
      databaseId: d!.id,
      type: v.type,
      name: v.name,
      config:
        v.type === 'KANBAN'
          ? { groupByColumnId: colIds[v.by ?? 'สถานะ'] }
          : v.type === 'CALENDAR'
            ? { dateColumnId: colIds[v.by ?? 'วันที่'] }
            : {},
      position: viewKeys[i]!,
    })),
  )
  const rowIds: Record<string, string> = {}
  const rows = o.rows ?? []
  if (rows.length > 0) {
    const rowKeys = generateNKeysBetween(null, null, rows.length)
    await db.insert(databaseRows).values(
      rows.map((r, i) => {
        const id = randomUUID()
        rowIds[r.title] = id
        const cells: Record<string, unknown> = {}
        for (const [name, v] of Object.entries(r.cells ?? {})) {
          const c = spec.find((x) => x.name === name)
          if (!c) throw new Error(`insertDatabase: no column ${name}`)
          if (c.type === 'SELECT') cells[colIds[name]!] = optionIds[name]![v as string]
          else if (c.type === 'MULTI_SELECT') cells[colIds[name]!] = (v as string[]).map((x) => optionIds[name]![x])
          else if (c.type === 'PERSON') cells[colIds[name]!] = (v as string[]).map(nick)
          else cells[colIds[name]!] = v
        }
        return { id, databaseId: d!.id, title: r.title, cells, position: rowKeys[i]!, createdBy: by, updatedBy: by }
      }),
    )
  }
  const content = [...(Array.isArray(page.content) ? page.content : []), { type: 'database', props: { databaseId: d!.id } }]
  await db.update(pages).set({ content, contentText: extractContentText(content) }).where(eq(pages.id, page.id))
  return { databaseId: d!.id, pageId: page.id, columns: colIds, rows: rowIds }
}

/** 1,000 × 20 (or as given) synthetic database on a page (NFR-11 smoke, M11-D32). */
export function insertSyntheticDatabase(
  db: DbOrTx,
  o: { pageId: string; rows?: number; columns?: number; title?: string },
): Promise<{ databaseId: string }> {
  return addSyntheticDatabase(db, o)
}

/** `n` paragraphs each holding an inline equation + one block equation per paragraph (NFR-12 smoke). */
export function equationContent(n: number): unknown[] {
  const out: unknown[] = []
  for (let i = 0; i < n; i++) out.push({ type: 'equation', props: { latex: `x_{${i}}^2 + \\frac{${i}}{2}` } })
  return out
}

/** A read of `planner_e2e` from the Playwright process (checks of what the UI wrote). */
export async function withE2eDb<T>(fn: (db: DbOrTx) => Promise<T>): Promise<T> {
  const { createScriptDb } = await import('../../scripts/lib/db')
  const { E2E } = await import('../env')
  const { db, close } = createScriptDb(E2E.databaseUrl)
  try {
    return await fn(db)
  } finally {
    await close()
  }
}

/** Live rows of a database (title + cells), in position order. */
export function liveRowsOf(databaseId: string): Promise<{ id: string; title: string; cells: Record<string, unknown> }[]> {
  return withE2eDb(async (db) => {
    const { asc } = await import('drizzle-orm')
    return db
      .select({ id: databaseRows.id, title: databaseRows.title, cells: databaseRows.cells })
      .from(databaseRows)
      .where(and(eq(databaseRows.databaseId, databaseId), isNull(databaseRows.deletedAt)))
      .orderBy(asc(databaseRows.position), asc(databaseRows.id))
  })
}

/** The databases rows owned by a page. */
export function databasesOfPage(pageId: string): Promise<{ id: string; title: string; detachedAt: Date | null }[]> {
  return withE2eDb((db) =>
    db
      .select({ id: databases.id, title: databases.title, detachedAt: databases.detachedAt })
      .from(databases)
      .where(eq(databases.pageId, pageId)),
  )
}

/** `pages.content` (JSON text) of a page. */
export function pageContentJson(pageId: string): Promise<string> {
  return withE2eDb(async (db) => {
    const [p] = await db.select({ content: pages.content }).from(pages).where(eq(pages.id, pageId))
    return JSON.stringify(p?.content ?? null)
  })
}

/** The DB_ROW body page of a row (nested databases, FR-1453 rev. 2026-11-03): space / project of the owner page. */
export async function insertRowBody(db: DbOrTx, rowId: string, text = ''): Promise<string> {
  const [owner] = await db
    .select({ space: pages.space, projectId: pages.projectId, by: databaseRows.createdBy })
    .from(databaseRows)
    .innerJoin(databases, eq(databases.id, databaseRows.databaseId))
    .innerJoin(pages, eq(pages.id, databases.pageId))
    .where(eq(databaseRows.id, rowId))
  if (!owner) throw new Error(`insertRowBody: no row ${rowId}`)
  const content = text === '' ? [] : [{ type: 'paragraph', content: text }]
  const [p] = await db
    .insert(pages)
    .values({
      space: owner.space,
      projectId: owner.projectId,
      kind: 'DB_ROW',
      databaseRowId: rowId,
      title: '',
      content,
      contentText: extractContentText(content),
      position: 'a0',
      createdBy: owner.by,
      updatedBy: owner.by,
    })
    .returning({ id: pages.id })
  return p!.id
}
