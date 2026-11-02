// src/lib/editor/paste.ts — custom BlockNote pasteHandler (FR-524/525, SPEC §7.6/§7.7, PLAN §3.11, r3 §7.4).
// From plan/research/snippets/r3/harness/src/lib/paste.ts (without the harness's stock-behaviour test hook). Client module.
// Why: stock BlockNote drops Excel tables whose text/plain "looks like markdown", turns TSV-only pastes into one
// paragraph and hot-links external images (r3 G2/G3).
import type { AppEditor } from '@/components/editor/schema'
import { th } from '@/i18n/th'
import type { PageKind } from '@/lib/contracts/pages'
import type { UploadLimits } from '@/lib/files/upload-rules'
import { type DatabaseBlockRef, type DatabaseClip, findDatabaseBlocks, readDatabaseClip } from './database-clipboard'
import { replaceDatabasesWithParagraphs, replaceSubpagesWithMentions } from './task-body'
import { gridToHtmlTable, parseTsvGrid } from './tsv'
import { insertFilesAtCursor, type Notify } from './upload'

type DefaultPasteHandler = (ctx?: {
  prioritizeMarkdownOverHTML?: boolean
  plainTextAsMarkdown?: boolean
}) => boolean | undefined

/** Same shape as BlockNoteEditorOptions['pasteHandler'], typed with our schema (no `any`). */
export type PasteHandler = (ctx: {
  event: ClipboardEvent
  editor: AppEditor
  defaultPasteHandler: DefaultPasteHandler
}) => boolean | undefined

const HAS_TABLE = /<table[\s>]/i
const HAS_IMG = /<img[\s>]/i
const EXTERNAL_SRC = /^(https?:)?\/\//i

/**
 * No hot-linked external images (offline server, CSP img-src 'self'): every `<img>` whose src is http(s), protocol-
 * relative or a data: URL becomes a link (alt text or th.editor.pasteImageLinkFallback); data: URLs keep the text
 * only (no href). Same-origin images (e.g. `/api/files/<id>`) stay.
 */
export function externalImagesToLinks(html: string, doc: Document = document): string {
  const tpl = doc.createElement('template')
  tpl.innerHTML = html
  for (const img of Array.from(tpl.content.querySelectorAll('img'))) {
    const src = (img.getAttribute('src') ?? '').trim()
    const isData = /^data:/i.test(src)
    if (EXTERNAL_SRC.test(src) || isData) {
      const a = doc.createElement('a')
      if (!isData) a.setAttribute('href', src)
      a.textContent = img.getAttribute('alt') || th.editor.pasteImageLinkFallback
      img.replaceWith(a)
    }
  }
  return tpl.innerHTML
}

/** True when the HTML carries visible text (ignoring style/script/meta/link/title). Word/PowerPoint put an extra PNG
 *  rendering into Files — their HTML must win over the picture. */
export function htmlHasText(html: string, doc: Document = document): boolean {
  const tpl = doc.createElement('template')
  tpl.innerHTML = html
  tpl.content.querySelectorAll('style,script,meta,link,title').forEach((n) => n.remove())
  return (tpl.content.textContent ?? '').trim().length > 0
}

/**
 * Routing (PLAN §3.11):
 *   1 `blocknote/html` (internal copy) → default (sub-page cards / mentions round-trip exactly);
 *   2 HTML with a `<table>` → pasteHTML, even when files are present (Excel puts a PNG next to it);
 *   3 files without meaningful HTML → upload at the cursor;
 *   4 TSV-only grid (≥ 2×2) → pasteHTML(table) (pastes into an existing table when the cursor is in one);
 *   5 other HTML with images → external images become links;
 *   6 everything else → default, preferring HTML over markdown-sniffed text (M4-D13).
 * TASK bodies (M6.1-D9, FR-680): whatever was pasted, sub-page cards become paragraphs with a page mention right
 * after the (synchronous) insertion — a task body has no page tree and the server rejects `subpage` there.
 * M11 (FR-1471, M11-D13/D38): the database blocks of the document are diffed around the insertion. In a row body
 * (DB_ROW) every database block becomes a paragraph with its title + toast; elsewhere the inserted ones go to
 * `onDatabaseBlocksPasted` (the editor decides copy vs keep and runs copyDatabase).
 */
/** M11-D13: database blocks a paste inserted (new block ids), the document before it and the clipboard payload. */
export type PasteDatabaseHook = (o: {
  editor: AppEditor
  before: unknown[]
  inserted: DatabaseBlockRef[]
  clip: DatabaseClip | null
}) => void | Promise<void>

export interface PasteHandlerOptions {
  notify: Notify
  limits: UploadLimits
  kind?: PageKind
  onDatabaseBlocksPasted?: PasteDatabaseHook
  /** M11-D38: the last known title of a database (row bodies turn database blocks into this text). */
  databaseTitle?: (databaseId: string) => string | undefined
}

export function makePasteHandler(o: PasteHandlerOptions): PasteHandler {
  const route = routePaste(o)
  const kind = o.kind ?? 'DOC'
  return (ctx) => {
    const before = ctx.editor.document as unknown[]
    const had = new Set(findDatabaseBlocks(before).map((b) => b.blockId))
    const handled = route(ctx)
    if (kind !== 'DOC') replaceSubpagesWithMentions(ctx.editor)
    if (kind === 'DB_ROW') {
      if (replaceDatabasesWithParagraphs(ctx.editor, o.databaseTitle ?? (() => undefined)))
        o.notify(th.editor.errors.databaseNotAllowed)
      return handled
    }
    if (o.onDatabaseBlocksPasted) {
      const inserted = findDatabaseBlocks(ctx.editor.document).filter((b) => !had.has(b.blockId))
      if (inserted.length > 0)
        void o.onDatabaseBlocksPasted({
          editor: ctx.editor,
          before,
          inserted,
          clip: readDatabaseClip(ctx.event.clipboardData),
        })
    }
    return handled
  }
}

function routePaste(o: { notify: Notify; limits: UploadLimits }): PasteHandler {
  return ({ event, editor, defaultPasteHandler }) => {
    const dt = event.clipboardData
    if (!dt) return defaultPasteHandler()
    const types = Array.from(dt.types)
    if (types.includes('blocknote/html')) return defaultPasteHandler()

    const html = types.includes('text/html') ? dt.getData('text/html') : ''
    const text = types.includes('text/plain') ? dt.getData('text/plain') : ''

    if (HAS_TABLE.test(html)) {
      editor.pasteHTML(HAS_IMG.test(html) ? externalImagesToLinks(html) : html)
      return true
    }

    const files = Array.from(dt.files)
    if (files.length > 0 && (html === '' || !htmlHasText(html))) {
      void insertFilesAtCursor(editor, files, o.notify, o.limits)
      return true
    }

    if (html === '') {
      const grid = parseTsvGrid(text)
      if (grid) {
        editor.pasteHTML(gridToHtmlTable(grid))
        return true
      }
    }

    if (HAS_IMG.test(html)) {
      editor.pasteHTML(externalImagesToLinks(html))
      return true
    }

    return defaultPasteHandler({ prioritizeMarkdownOverHTML: false, plainTextAsMarkdown: true })
  }
}
