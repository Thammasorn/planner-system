/**
 * Page rows for `resetDb(undefined, { extras })` (plan/m04-pages-editor.md S4.7, M4-D35). Plain Drizzle inserts into
 * `planner_e2e` (X56): test data the scenario is not about, so the scenario never needs a server action from Playwright.
 */
import { and, desc, eq, isNull } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { extractContentText } from '../../src/lib/editor/content-text'
import { pages, projects, tasks, user } from '../../src/server/db/schema'
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

// ---------------------------------------------------------------------------------------------------------------
// M6.1 (plan/m06.1-task-page-ui.md S7.1): task bodies — `pages` rows of kind TASK (FR-681, M6.1-D3)
// ---------------------------------------------------------------------------------------------------------------

export interface InsertTaskBodyOptions {
  /** Golden project name (POS Upgrade, …). */
  projectName: string
  /** Live task of that project (names are unique per project in golden + spec extras). */
  taskName: string
  /** BlockNote (partial) blocks; content_text is derived with the server's walker (same rule as the migration). */
  content: unknown[]
  fullWidth?: boolean
}

/**
 * Inserts the TASK body of a live task (shape of M6.1-D3 / `pages_kind_shape`: no parent, depth 0, title '', position
 * 'a0', PROJECT space, creator = the task's creator) and returns its ids. Test data the scenario is not about — the
 * lazy-create path (ensureTaskBody) is exercised through the UI in T1/T7.
 */
export async function insertTaskBody(
  db: DbOrTx,
  o: InsertTaskBodyOptions,
): Promise<{ pageId: string; taskId: string; projectId: string }> {
  const t = await one(
    await db
      .select({ id: tasks.id, projectId: tasks.projectId, createdBy: tasks.createdBy })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(projects.name, o.projectName), eq(tasks.name, o.taskName), isNull(tasks.deletedAt))),
    `task ${o.projectName} › ${o.taskName}`,
  )
  const [row] = await db
    .insert(pages)
    .values({
      space: 'PROJECT',
      projectId: t.projectId,
      kind: 'TASK',
      taskId: t.id,
      title: '',
      content: o.content,
      contentText: extractContentText(o.content),
      position: 'a0',
      fullWidth: o.fullWidth ?? false,
      createdBy: t.createdBy,
      updatedBy: t.createdBy,
    })
    .returning({ id: pages.id })
  return { pageId: row!.id, taskId: t.id, projectId: t.projectId }
}

/** A 12-column, 2-row table block (AC-1602 "ตาราง 12 คอลัมน์") — wider than the 760 px column at 140 px a column. */
export function wideTable12(): unknown {
  const cols = Array.from({ length: 12 }, (_, i) => i + 1)
  return {
    type: 'table',
    content: {
      type: 'tableContent',
      columnWidths: cols.map(() => 140),
      rows: [{ cells: cols.map((c) => `คอลัมน์ ${c}`) }, { cells: cols.map((c) => `ค่า ${c}`) }],
    },
  }
}
