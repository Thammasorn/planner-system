// FR-692 / AC-627 (plan/m06.1 S0.3, M6.1-D3): tasks.notes → TASK pages (0010), then tasks.notes dropped (0011).
// A scratch DB receives the journal up to 0009, rows are written with the pre-M6.1 schema, then 0010 and 0011 run
// exactly as the migrator would (journal order).
import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractContentText } from '@/lib/editor/content-text'
import { pageContentSchema, sanitizeContent } from '@/lib/schemas/page-content'
import {
  applyJournal,
  createScratchDb,
  dropScratchDb,
  entryStatements,
  readJournal,
} from '../../../tests/helpers/migrate-partial'

const SCRATCH = 'm6_1_notes'

/** Vector (e): zero-width chars, Thai marks in non-canonical order (NFC reorders them), a decomposed é, NBSP, emoji. */
const ODD_LINE = 'กุ่​า﻿  é 🚀'
const MANY_LINES = Array.from({ length: 600 }, (_, i) => `บรรทัด ${i + 1}`)

const VECTORS = {
  a: 'รอ spec จากลูกค้า\nนัด 5 พ.ย.',
  b: '\r\n\r\nบรรทัดแรก\r\n\r\nบรรทัดสาม\r\n',
  c: '   \n\t ',
  d: 'ลบแล้ว',
  e: `${ODD_LINE}\rสอง`,
  f: MANY_LINES.join('\n'),
  g: null,
} as const
type Key = keyof typeof VECTORS

interface PageRowDb {
  id: string
  task_id: string
  space: string
  project_id: string
  kind: string
  title: string
  position: string
  version: number
  content: unknown[]
  content_text: string
  created_by: string
  updated_by: string
  deleted_at: Date | null
  deleted_batch: string | null
  parent_id: string | null
  depth: number
  full_width: boolean
}

describe('M6.1 data migration tasks.notes → TASK pages (0010) + drop tasks.notes (0011)', () => {
  let sql: postgres.Sql
  const ids = {} as Record<Key, string>
  const batch = '6c1b3f1e-1d2a-4a51-9e07-6a1f0f6f6d01'
  const userId = 'u-m6-1'
  let projectId = ''
  let pages: Map<string, PageRowDb>

  beforeAll(async () => {
    sql = (await createScratchDb(SCRATCH)).sql
    await applyJournal(sql, { upTo: '0009' })

    await sql`insert into "user" (id, name, email) values (${userId}, 'Cindy', 'cindy@example.test')`
    const [p] = await sql<{ id: string }[]>`
      insert into projects (name, created_by) values ('POS Upgrade', ${userId}) returning id`
    projectId = p!.id
    const [s] = await sql<{ id: string }[]>`
      insert into task_statuses (project_id, name, category, position)
      values (${projectId}, 'ยังไม่เริ่ม', 'TODO', 'a0') returning id`
    for (const [k, notes] of Object.entries(VECTORS) as [Key, string | null][]) {
      const [t] = await sql<{ id: string }[]>`
        insert into tasks (project_id, name, notes, status_id, position, created_by)
        values (${projectId}, ${`งาน ${k}`}, ${notes}, ${s!.id}, ${`a${k}`}, ${userId}) returning id`
      ids[k] = t!.id
    }
    await sql`update tasks set deleted_at = '2026-10-01T03:00:00Z', deleted_batch = ${batch} where id = ${ids.d}`

    const applied = await applyJournal(sql, { from: '0010', upTo: '0010' })
    expect(applied).toEqual([expect.stringMatching(/^0010_task_notes_to_body$/)])
    const rows = await sql<PageRowDb[]>`select * from pages`
    pages = new Map(rows.map((r) => [r.task_id, r]))
  })

  afterAll(async () => {
    await dropScratchDb(SCRATCH, sql)
  })

  it('journal order is 0009 m6_1_task_pages → 0010 task_notes_to_body → 0011 m6_1_drop_task_notes', () => {
    const tags = readJournal().map((e) => e.tag)
    const i = tags.indexOf('0009_m6_1_task_pages')
    expect(i).toBeGreaterThan(0)
    expect(tags.slice(i, i + 3)).toEqual([
      '0009_m6_1_task_pages',
      '0010_task_notes_to_body',
      '0011_m6_1_drop_task_notes',
    ])
    expect(entryStatements('0011_m6_1_drop_task_notes')).toEqual(['ALTER TABLE "tasks" DROP COLUMN "notes";'])
  })

  it('AC-627: two lines become two paragraphs; content_text joins them', () => {
    const p = pages.get(ids.a)!
    expect(p.content).toEqual([
      { type: 'paragraph', content: 'รอ spec จากลูกค้า' },
      { type: 'paragraph', content: 'นัด 5 พ.ย.' },
    ])
    expect(p.content_text).toBe('รอ spec จากลูกค้า นัด 5 พ.ย.')
  })

  it('CRLF; leading/trailing blank lines dropped; an inner empty line stays an empty paragraph', () => {
    expect(pages.get(ids.b)!.content).toEqual([
      { type: 'paragraph', content: 'บรรทัดแรก' },
      { type: 'paragraph' },
      { type: 'paragraph', content: 'บรรทัดสาม' },
    ])
    expect(pages.get(ids.b)!.content_text).toBe('บรรทัดแรก บรรทัดสาม')
  })

  it('whitespace-only and null notes create no page', () => {
    expect(pages.has(ids.c)).toBe(false)
    expect(pages.has(ids.g)).toBe(false)
    expect(pages.size).toBe(5)
  })

  it('a soft-deleted task keeps its batch on the body (restore brings both back)', () => {
    const p = pages.get(ids.d)!
    expect(p.deleted_batch).toBe(batch)
    expect(p.deleted_at?.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(pages.get(ids.a)!.deleted_at).toBeNull()
    expect(pages.get(ids.a)!.deleted_batch).toBeNull()
  })

  it('lone CR splits lines; content keeps the text verbatim; content_text is normalised like extractContentText', () => {
    const p = pages.get(ids.e)!
    expect(p.content).toEqual([
      { type: 'paragraph', content: ODD_LINE },
      { type: 'paragraph', content: 'สอง' },
    ])
    expect(p.content_text).toBe('กุ่า é 🚀 สอง')
  })

  it('600 lines → 600 paragraphs in order', () => {
    const p = pages.get(ids.f)!
    expect(p.content).toHaveLength(600)
    expect(p.content.map((b) => (b as { content: string }).content)).toEqual(MANY_LINES)
  })

  it('every migrated row: parity with extractContentText, valid + sanitised content, TASK shape', () => {
    for (const p of pages.values()) {
      expect(p.content_text).toBe(extractContentText(p.content))
      const parsed = pageContentSchema.parse(p.content)
      expect(sanitizeContent(parsed)).toEqual(p.content)
      expect(p).toMatchObject({
        kind: 'TASK',
        space: 'PROJECT',
        project_id: projectId,
        title: '',
        position: 'a0',
        version: 1,
        created_by: userId,
        updated_by: userId,
        parent_id: null,
        depth: 0,
        full_width: false,
      })
    }
  })

  it('is idempotent: running 0010 again inserts nothing', async () => {
    await applyJournal(sql, { from: '0010', upTo: '0010' })
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from pages`
    expect(r?.n).toBe(5)
  })

  it('writes no audit rows', async () => {
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from audit_log`
    expect(r?.n).toBe(0)
  })

  it('0011 drops tasks.notes and keeps the bodies', async () => {
    await applyJournal(sql, { from: '0011', upTo: '0011' })
    const cols = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_name = 'tasks' and column_name = 'notes'`
    expect(cols).toEqual([])
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from pages where kind = 'TASK'`
    expect(r?.n).toBe(5)
  })
})
