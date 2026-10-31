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
