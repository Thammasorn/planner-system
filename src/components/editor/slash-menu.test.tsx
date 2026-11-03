// S2.5 — slash items with the real schema in a headless editor (FR-502/506/520/528, AC-501/504, M4-D14).
import { BlockNoteEditor } from '@blocknote/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { thaiDictionary } from '@/lib/editor/dictionary'
import {
  consumeDatabaseJustCreated,
  getDatabaseBlockPhase,
  resetDatabaseBlockState,
} from '@/lib/editor/database-block-state'
import { rankSuggestionItems } from '@/lib/editor/suggest'
import { takeBlockEquationOpen, takeInlineEquationOpen } from './math/open-request'
import { type AppEditor, schema } from './schema'
import { getSlashMenuItems, type SlashCtx } from './slash-menu'

const NEW_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

function makeEditor(): AppEditor {
  const editor = BlockNoteEditor.create({
    schema,
    dictionary: thaiDictionary,
    initialContent: [{ type: 'paragraph' }],
  })
  editor.setTextCursorPosition(editor.document[0]!, 'end')
  return editor
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const ctx = (over: Partial<SlashCtx> = {}): SlashCtx => ({
  createSubpage: () => Promise.resolve(NEW_ID),
  canCreateSubpage: true,
  ...over,
})
const titles = (editor: AppEditor, c = ctx()) => getSlashMenuItems(editor, c).map((i) => i.title)
const slash = th.editor.blocknote.slash_menu

describe('getSlashMenuItems', () => {
  it('lists Thai titles incl. table, sub-page, image and attachment', () => {
    expect(titles(makeEditor())).toEqual(
      expect.arrayContaining([
        slash.table.title,
        th.editor.slash.subpage.title,
        slash.image.title,
        slash.file.title,
      ]),
    )
  })

  it('omits blocks the schema excludes (H4, video, audio, toggle headings)', () => {
    const t = titles(makeEditor())
    for (const k of ['heading_4', 'video', 'audio', 'toggle_heading'] as const)
      expect(t).not.toContain(slash[k].title)
  })

  it('ranks "/หน้า" → sub-page and "/table" → ตาราง first', () => {
    const items = getSlashMenuItems(makeEditor(), ctx())
    expect(rankSuggestionItems(items, th.editor.slash.subpage.title)[0]?.title).toBe(
      th.editor.slash.subpage.title,
    )
    expect(rankSuggestionItems(items, 'table')[0]?.title).toBe(slash.table.title)
    expect(rankSuggestionItems(items, 'page')[0]?.title).toBe(th.editor.slash.subpage.title)
  })

  it('hides the sub-page item when it cannot be created (depth 9 / no permission)', () => {
    expect(titles(makeEditor(), ctx({ canCreateSubpage: false }))).not.toContain(
      th.editor.slash.subpage.title,
    )
  })

  it('the table item inserts a 3×3 table (AC-501)', () => {
    const editor = makeEditor()
    getSlashMenuItems(editor, ctx())
      .find((i) => i.title === slash.table.title)!
      .onItemClick()
    const table = editor.document.find((b) => b.type === 'table')
    expect(table).toBeDefined()
    const content = table!.content as { rows: { cells: unknown[] }[] }
    expect(content.rows).toHaveLength(3)
    for (const r of content.rows) expect(r.cells).toHaveLength(3)
  })

  it('the sub-page item inserts a placeholder card, then fills the new page id', async () => {
    const editor = makeEditor()
    const d = deferred<string | null>()
    getSlashMenuItems(editor, ctx({ createSubpage: () => d.promise }))
      .find((i) => i.title === th.editor.slash.subpage.title)!
      .onItemClick()
    const card = () => editor.document.find((b) => b.type === 'subpage')
    expect(card()?.props).toEqual({ pageId: '' })
    d.resolve(NEW_ID)
    await d.promise
    await Promise.resolve()
    await Promise.resolve()
    expect(card()?.props).toEqual({ pageId: NEW_ID })
  })

  it('removes the placeholder when creation fails', async () => {
    const editor = makeEditor()
    const d = deferred<string | null>()
    getSlashMenuItems(editor, ctx({ createSubpage: () => d.promise }))
      .find((i) => i.title === th.editor.slash.subpage.title)!
      .onItemClick()
    expect(editor.document.some((b) => b.type === 'subpage')).toBe(true)
    d.resolve(null)
    await d.promise
    await Promise.resolve()
    await Promise.resolve()
    expect(editor.document.some((b) => b.type === 'subpage')).toBe(false)
  })
})

describe('getSlashMenuItems › TASK (FR-680, M6.1-D9)', () => {
  it('TASK has no หน้าย่อย item (even with canCreateSubpage) — "/หน้า" finds no sub-page', () => {
    const items = getSlashMenuItems(makeEditor(), ctx({ kind: 'TASK' }))
    const t = items.map((i) => i.title)
    expect(t).not.toContain(th.editor.slash.subpage.title)
    expect(rankSuggestionItems(items, th.editor.slash.subpage.title).map((i) => i.title)).not.toContain(
      th.editor.slash.subpage.title,
    )
  })

  it('TASK keeps every other item (table, image, attachment, headings, lists)', () => {
    const doc = titles(makeEditor())
    const task = titles(makeEditor(), ctx({ kind: 'TASK' }))
    expect(task).toEqual(doc.filter((x) => x !== th.editor.slash.subpage.title))
    expect(task).toEqual(expect.arrayContaining([slash.table.title, slash.image.title, slash.file.title]))
  })

  it('"/ตาราง" and "/table" still find the table in a TASK body', () => {
    const items = getSlashMenuItems(makeEditor(), ctx({ kind: 'TASK' }))
    expect(rankSuggestionItems(items, 'table')[0]?.title).toBe(slash.table.title)
    expect(rankSuggestionItems(items, slash.table.title)[0]?.title).toBe(slash.table.title)
  })
})

describe('getSlashMenuItems › live blocks (FR-1301/1303, M10-D5)', () => {
  const live = th.editor.slash
  const project = (over: Partial<SlashCtx> = {}) => ctx({ space: 'PROJECT', canEdit: true, ...over })

  it('a PROJECT page offers มุมมองงาน and ภาระทีม, right after the ขั้นสูง group (หน้า, สมการ…)', () => {
    const t = titles(makeEditor(), project())
    const at = t.indexOf(live.subpage.title)
    expect(t.slice(at, at + 5)).toEqual([
      live.subpage.title,
      live.equation.title,
      live.inlineEquation.title,
      live.taskView.title,
      live.projectWorkload.title,
    ])
  })

  it('ranks Thai titles and English aliases first', () => {
    const items = getSlashMenuItems(makeEditor(), project())
    const first = (q: string) => rankSuggestionItems(items, q)[0]?.title
    expect(first(live.taskView.title)).toBe(live.taskView.title)
    expect(first('board')).toBe(live.taskView.title)
    expect(first('tasks')).toBe(live.taskView.title)
    expect(first('ภาระ')).toBe(live.projectWorkload.title)
    expect(first('workload')).toBe(live.projectWorkload.title)
    expect(first(live.subpage.title)).toBe(live.subpage.title) // M4 "/หน้า" unchanged
  })

  it('a WORKSPACE page, a read-only viewer and a TASK body get neither item', () => {
    for (const c of [
      ctx({ space: 'WORKSPACE', canEdit: true }),
      project({ canEdit: false }),
      project({ kind: 'TASK' }),
    ]) {
      const t = titles(makeEditor(), c)
      expect(t).not.toContain(live.taskView.title)
      expect(t).not.toContain(live.projectWorkload.title)
    }
  })

  it('still offered when the sub-page item is not (depth limit)', () => {
    expect(titles(makeEditor(), project({ canCreateSubpage: false }))).toEqual(
      expect.arrayContaining([live.taskView.title, live.projectWorkload.title]),
    )
  })

  it('มุมมองงาน inserts a taskView in BOARD view; ภาระทีม a projectWorkload in view ALL', () => {
    const editor = makeEditor()
    const items = getSlashMenuItems(editor, project())
    items.find((i) => i.title === live.taskView.title)!.onItemClick()
    const tv = editor.document.find((b) => b.type === 'taskView')
    expect(tv?.props).toMatchObject({ view: 'BOARD' })
    items.find((i) => i.title === live.projectWorkload.title)!.onItemClick()
    const pw = editor.document.find((b) => b.type === 'projectWorkload')
    expect(pw?.props).toEqual({ view: 'ALL' })
  })
})

describe('getSlashMenuItems › database group + equations + ranking (FR-1403/1404, FR-1501/1502, M11-D38)', () => {
  const sl = th.editor.slash
  const DB_ITEMS = [sl.databaseTable.title, sl.databaseKanban.title, sl.databaseCalendar.title]
  const DB_ID = '9b2d5f4e-1c3a-4b5d-8e7f-0a1b2c3d4e5f'
  const withDb = (over: Partial<SlashCtx> = {}) =>
    ctx({ createDatabase: () => Promise.resolve(DB_ID), canEdit: true, ...over })
  const first = (items: ReturnType<typeof getSlashMenuItems>, q: string) => rankSuggestionItems(items, q)[0]?.title

  beforeEach(() => {
    resetDatabaseBlockState()
  })

  it('DOC and TASK bodies offer the three database items in their own contiguous "ฐานข้อมูล" group', () => {
    for (const kind of ['DOC', 'TASK'] as const) {
      const items = getSlashMenuItems(makeEditor(), withDb({ kind }))
      const t = items.map((i) => i.title)
      const at = t.indexOf(sl.databaseTable.title)
      expect(t.slice(at, at + 3)).toEqual(DB_ITEMS)
      expect(items.filter((i) => i.group === sl.databaseTable.group).map((i) => i.title)).toEqual(DB_ITEMS)
    }
  })

  it('a row body (DB_ROW) below the nesting limit (createDatabase wired) offers the database items, never หน้า', () => {
    const items = getSlashMenuItems(makeEditor(), withDb({ kind: 'DB_ROW', canCreateSubpage: true }))
    const t = items.map((i) => i.title)
    const at = t.indexOf(sl.databaseTable.title)
    expect(t.slice(at, at + 3)).toEqual(DB_ITEMS)
    expect(t).not.toContain(sl.subpage.title)
    expect(first(items, 'kanban')).toBe(sl.databaseKanban.title)
  })

  it('a row body at the nesting limit (no createDatabase) has no database items — but keeps equations and the table', () => {
    const items = getSlashMenuItems(makeEditor(), ctx({ kind: 'DB_ROW', canEdit: true }))
    const t = items.map((i) => i.title)
    for (const x of [...DB_ITEMS, sl.subpage.title]) expect(t).not.toContain(x)
    expect(t).toEqual(expect.arrayContaining([sl.equation.title, sl.inlineEquation.title, slash.table.title]))
    expect(rankSuggestionItems(items, 'db').map((i) => i.title)).not.toContain(sl.databaseTable.title)
  })

  it('no createDatabase wired → no database items', () => {
    expect(titles(makeEditor(), ctx())).not.toContain(sl.databaseTable.title)
  })

  it('groups stay contiguous (one heading per group)', () => {
    const items = getSlashMenuItems(makeEditor(), withDb({ space: 'PROJECT' }))
    const seen: string[] = []
    for (const i of items) if (seen.at(-1) !== i.group) seen.push(i.group ?? '')
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('ranking: /ตาราง → plain table; /ตารางข้อมูล, /db, /database, /table view → database table', () => {
    const items = getSlashMenuItems(makeEditor(), withDb({ space: 'PROJECT' }))
    expect(first(items, slash.table.title)).toBe(slash.table.title)
    expect(first(items, 'table')).toBe(slash.table.title)
    for (const q of [sl.databaseTable.title, 'db', 'database', 'table view', 'ฐานข้อมูล'])
      expect(first(items, q)).toBe(sl.databaseTable.title)
  })

  it('ranking: /board → M10 task view; /kanban, /คัมบัง → kanban; /calendar view, /ปฏิทิน → calendar', () => {
    const items = getSlashMenuItems(makeEditor(), withDb({ space: 'PROJECT' }))
    expect(first(items, 'board')).toBe(sl.taskView.title)
    for (const q of ['kanban', 'kanban view', sl.databaseKanban.title]) expect(first(items, q)).toBe(sl.databaseKanban.title)
    for (const q of ['calendar', 'calendar view', sl.databaseCalendar.title])
      expect(first(items, q)).toBe(sl.databaseCalendar.title)
  })

  it('ranking: /สมการ → block equation first; /สมการในบรรทัด and /inline math → inline', () => {
    const items = getSlashMenuItems(makeEditor(), withDb())
    expect(first(items, sl.equation.title)).toBe(sl.equation.title)
    for (const q of ['equation', 'math', 'latex']) expect(first(items, q)).toBe(sl.equation.title)
    for (const q of [sl.inlineEquation.title, 'inline equation', 'inline math'])
      expect(first(items, q)).toBe(sl.inlineEquation.title)
  })

  it('database item: placeholder block ("creating") → createDatabase(view) → id filled + just-created mark', async () => {
    const editor = makeEditor()
    let resolve!: (v: string | null) => void
    const createDatabase = vi.fn(() => new Promise<string | null>((r) => (resolve = r)))
    getSlashMenuItems(editor, withDb({ createDatabase }))
      .find((i) => i.title === sl.databaseKanban.title)!
      .onItemClick()
    const block = () => editor.document.find((b) => b.type === 'database')
    expect(block()?.props).toEqual({ databaseId: '' })
    expect(getDatabaseBlockPhase(block()!.id)).toBe('creating')
    expect(createDatabase).toHaveBeenCalledWith('KANBAN')
    resolve(DB_ID)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(block()?.props).toEqual({ databaseId: DB_ID })
    expect(getDatabaseBlockPhase(block()!.id)).toBeNull()
    expect(consumeDatabaseJustCreated(block()!.id)).toBe(true)
    expect(consumeDatabaseJustCreated(block()!.id)).toBe(false)
  })

  it('database item: failure (null or rejection) removes the placeholder block', async () => {
    for (const createDatabase of [() => Promise.resolve(null), () => Promise.reject(new Error('x'))]) {
      const editor = makeEditor()
      getSlashMenuItems(editor, withDb({ createDatabase }))
        .find((i) => i.title === sl.databaseTable.title)!
        .onItemClick()
      expect(editor.document.some((b) => b.type === 'database')).toBe(true)
      for (let i = 0; i < 4; i++) await Promise.resolve()
      expect(editor.document.some((b) => b.type === 'database')).toBe(false)
    }
  })

  it('equation items insert an empty block equation / an inline equation in the paragraph', () => {
    const editor = makeEditor()
    const items = getSlashMenuItems(editor, ctx())
    items.find((i) => i.title === sl.inlineEquation.title)!.onItemClick()
    const para = editor.document[0]!
    expect(para.content).toEqual([{ type: 'inlineEquation', props: { latex: '' } }])
    expect(takeInlineEquationOpen()).toBe(true)
    items.find((i) => i.title === sl.equation.title)!.onItemClick()
    const eq = editor.document.find((b) => b.type === 'equation')
    expect(eq?.props).toEqual({ latex: '' })
    expect(takeBlockEquationOpen(eq!.id)).toBe(true)
  })
})
