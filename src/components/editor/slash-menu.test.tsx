// S2.5 — slash items with the real schema in a headless editor (FR-502/506/520/528, AC-501/504, M4-D14).
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { thaiDictionary } from '@/lib/editor/dictionary'
import { rankSuggestionItems } from '@/lib/editor/suggest'
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

  it('a PROJECT page offers มุมมองงาน and ภาระทีม, right after หน้า', () => {
    const t = titles(makeEditor(), project())
    const at = t.indexOf(live.subpage.title)
    expect(t.slice(at, at + 3)).toEqual([live.subpage.title, live.taskView.title, live.projectWorkload.title])
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
