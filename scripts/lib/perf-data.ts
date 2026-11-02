// scripts/lib/perf-data.ts — synthetic database data for perf smokes (plan/m11 S2.15, M11-D32; M12's seed:perf reuses
// it). Plain Drizzle inserts (no audit, no services): a database on an existing DOC page with every column type and
// realistic values. Positions via fractional-indexing (X48); numbers and dates are strings (BR-91/92).
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import { extractContentText } from '@/lib/editor/content-text'
import { databaseColumns, databaseRows, databases, databaseViews, pages, user } from '@/server/db/schema'
import type { DbOrTx } from '@/server/db/types'

const TYPES = ['SELECT', 'DATE', 'TEXT', 'NUMBER', 'MULTI_SELECT', 'CHECKBOX', 'PERSON', 'URL'] as const
const COLORS = ['gray', 'blue', 'green', 'orange', 'purple'] as const

/** `rows` × `columns` (TITLE included) database appended to the content of `pageId`; returns its id. */
export async function addSyntheticDatabase(
  db: DbOrTx,
  o: { pageId: string; rows?: number; columns?: number; title?: string },
): Promise<{ databaseId: string }> {
  const nRows = o.rows ?? 1000
  const nCols = Math.max(1, o.columns ?? 20)
  const [page] = await db.select().from(pages).where(eq(pages.id, o.pageId))
  if (!page) throw new Error(`addSyntheticDatabase: no page ${o.pageId}`)
  const people = (await db.select({ id: user.id }).from(user).limit(5)).map((u) => u.id)
  const by = page.createdBy
  const [d] = await db
    .insert(databases)
    .values({ pageId: page.id, title: o.title ?? `ฐานข้อมูลทดสอบ ${nRows}`, createdBy: by, updatedBy: by })
    .returning()
  const keys = generateNKeysBetween(null, null, nCols)
  const columns: { id: string; type: (typeof TYPES)[number] | 'TITLE'; options: string[] }[] = [
    { id: randomUUID(), type: 'TITLE', options: [] },
  ]
  for (let i = 1; i < nCols; i++) {
    const type = TYPES[(i - 1) % TYPES.length]!
    const options = type === 'SELECT' || type === 'MULTI_SELECT' ? [randomUUID(), randomUUID(), randomUUID()] : []
    columns.push({ id: randomUUID(), type, options })
  }
  await db.insert(databaseColumns).values(
    columns.map((c, i) => ({
      id: c.id,
      databaseId: d!.id,
      type: c.type,
      name: i === 0 ? 'ชื่อ' : `คอลัมน์ ${i}`,
      config:
        c.options.length > 0
          ? { options: c.options.map((id, j) => ({ id, name: `ตัวเลือก ${j + 1}`, color: COLORS[j % COLORS.length] })) }
          : c.type === 'NUMBER'
            ? { decimals: null, thousands: true }
            : {},
      position: keys[i]!,
    })),
  )
  const select = columns.find((c) => c.type === 'SELECT')
  const date = columns.find((c) => c.type === 'DATE')
  await db.insert(databaseViews).values([
    { databaseId: d!.id, type: 'TABLE', name: 'ตาราง', config: {}, position: 'a0' },
    ...(select ? [{ databaseId: d!.id, type: 'KANBAN' as const, name: 'คัมบัง', config: { groupByColumnId: select.id }, position: 'a1' }] : []),
    ...(date ? [{ databaseId: d!.id, type: 'CALENDAR' as const, name: 'ปฏิทิน', config: { dateColumnId: date.id }, position: 'a2' }] : []),
  ])
  const rowKeys = generateNKeysBetween(null, null, nRows)
  const values = rowKeys.map((position, r) => {
    const cells: Record<string, unknown> = {}
    for (const c of columns.slice(1)) {
      switch (c.type) {
        case 'SELECT':
          cells[c.id] = c.options[r % 3]
          break
        case 'MULTI_SELECT':
          cells[c.id] = [c.options[r % 3], c.options[(r + 1) % 3]]
          break
        case 'DATE':
          cells[c.id] = `2026-${String((r % 12) + 1).padStart(2, '0')}-${String((r % 28) + 1).padStart(2, '0')}`
          break
        case 'TEXT':
          cells[c.id] = `ข้อความ ${r}`
          break
        case 'NUMBER':
          cells[c.id] = String(r * 7)
          break
        case 'CHECKBOX':
          if (r % 2 === 0) cells[c.id] = true
          break
        case 'PERSON':
          if (people.length > 0) cells[c.id] = [people[r % people.length]]
          break
        case 'URL':
          cells[c.id] = `https://example.com/${r}`
          break
      }
    }
    return { databaseId: d!.id, title: `แถว ${r + 1}`, cells, position, createdBy: by, updatedBy: by }
  })
  for (let i = 0; i < values.length; i += 500) await db.insert(databaseRows).values(values.slice(i, i + 500))
  const content = [...(Array.isArray(page.content) ? page.content : []), { type: 'database', props: { databaseId: d!.id } }]
  await db.update(pages).set({ content, contentText: extractContentText(content) }).where(eq(pages.id, page.id))
  return { databaseId: d!.id }
}
