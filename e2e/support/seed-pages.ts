/**
 * Page rows for `resetDb(undefined, { extras })` (plan/m04-pages-editor.md S4.7, M4-D35). Plain Drizzle inserts into
 * `planner_e2e` (X56): test data the scenario is not about, so the scenario never needs a server action from Playwright.
 */
import { and, desc, eq, isNull } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { extractContentText } from '../../src/lib/editor/content-text'
import { pages, projects, user } from '../../src/server/db/schema'
import type { DbOrTx } from '../../src/server/db/types'

export interface InsertPageOptions {
  space: 'WORKSPACE' | 'PROJECT'
  /** Required for PROJECT pages (golden project name). */
  projectName?: string
  /** Live page in the same space/project to nest under. */
  parentTitle?: string
  title: string
  /** Golden nickname of the creator (Manager, Cindy, Ivy, …). */
  byNickname: string
  locked?: boolean
  icon?: string | null
  /** BlockNote (partial) blocks; content_text is derived with the server's walker. */
  content?: unknown[]
}

async function one<T>(rows: T[], what: string): Promise<T> {
  if (rows.length !== 1) throw new Error(`insertPage: ${what} → ${rows.length} rows`)
  return rows[0]!
}

/** Inserts one live page appended after its last live sibling and returns its id. */
export async function insertPage(db: DbOrTx, o: InsertPageOptions): Promise<string> {
  const creator = await one(
    await db.select({ id: user.id }).from(user).where(eq(user.nickname, o.byNickname)),
    `user ${o.byNickname}`,
  )
  let projectId: string | null = null
  if (o.space === 'PROJECT') {
    if (!o.projectName) throw new Error('insertPage: PROJECT pages need projectName')
    const p = await one(
      await db.select({ id: projects.id }).from(projects).where(eq(projects.name, o.projectName)),
      `project ${o.projectName}`,
    )
    projectId = p.id
  }
  const scope = and(
    eq(pages.space, o.space),
    projectId ? eq(pages.projectId, projectId) : isNull(pages.projectId),
    isNull(pages.deletedAt),
  )
  let parent: { id: string; depth: number } | null = null
  if (o.parentTitle !== undefined) {
    parent = await one(
      await db
        .select({ id: pages.id, depth: pages.depth })
        .from(pages)
        .where(and(scope, eq(pages.title, o.parentTitle))),
      `parent ${o.parentTitle}`,
    )
  }
  const [last] = await db
    .select({ position: pages.position })
    .from(pages)
    .where(and(scope, parent ? eq(pages.parentId, parent.id) : isNull(pages.parentId)))
    .orderBy(desc(pages.position), desc(pages.id))
    .limit(1)
  const content = o.content ?? []
  const [row] = await db
    .insert(pages)
    .values({
      space: o.space,
      projectId,
      parentId: parent?.id ?? null,
      depth: parent ? parent.depth + 1 : 0,
      title: o.title,
      icon: o.icon ?? null,
      content,
      contentText: extractContentText(content),
      locked: o.locked ?? false,
      position: generateKeyBetween(last?.position ?? null, null),
      createdBy: creator.id,
      updatedBy: creator.id,
    })
    .returning({ id: pages.id })
  return row!.id
}

/** One partial paragraph block. */
export const paragraph = (text: string): unknown[] => [{ type: 'paragraph', content: text }]
