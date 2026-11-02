// src/lib/editor/task-body.ts — helpers of TASK page bodies (SPEC §4.6.4 FR-680/691, M6.1-D9/D11). Pure (type-only
// BlockNote imports): runs in node tests and in the client editor.
// - `hasTaskBodyContent`: the client mirror of the hasBody SQL (content_text <> '' or an image/file block anywhere),
//   so the open body can patch 📄 in the task list without a refetch (M6.1-D11).
// - Sub-page cards have no place in a task body (no page tree, FR-680): pasted / dropped cards become a paragraph with
//   a page mention (the link survives); the server rejects any that remain (M6.1-D9).
// - M11-D38 (FR-1453): database blocks have no place in a row body (no nesting): pasted / dropped ones become a
//   paragraph with the database title; the server rejects any that remain.
import type { AppEditor, AppPartialBlock } from '@/components/editor/schema'
import { th } from '@/i18n/th'
import { extractContentText } from './content-text'
import { findDatabaseBlocks } from './database-clipboard'

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/** `$.** ? (@.type == "image" || @.type == "file")` — any object at any depth (blocks, children, table content). */
function containsMedia(x: unknown, depth = 0): boolean {
  if (depth > 128) return false
  if (Array.isArray(x)) return x.some((v) => containsMedia(v, depth + 1))
  if (!isObj(x)) return false
  if (x.type === 'image' || x.type === 'file') return true
  return Object.values(x).some((v) => containsMedia(v, depth + 1))
}

/** M6.1-D11: true when the body would show 📄 (non-empty indexed text, or an image / attachment). */
export function hasTaskBodyContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return extractContentText(content) !== '' || containsMedia(content)
}

export interface SubpageRef {
  id: string
  pageId: string
}

/** Every `subpage` block (any depth) of a document. */
export function findSubpageBlocks(doc: unknown): SubpageRef[] {
  const out: SubpageRef[] = []
  const stack: unknown[] = Array.isArray(doc) ? (doc as unknown[]).slice() : []
  while (stack.length > 0) {
    const b = stack.pop()
    if (!isObj(b)) continue
    if (b.type === 'subpage' && typeof b.id === 'string') {
      const props = isObj(b.props) ? b.props : {}
      out.push({ id: b.id, pageId: typeof props.pageId === 'string' ? props.pageId : '' })
    }
    if (Array.isArray(b.children)) stack.push(...(b.children as unknown[]))
  }
  return out
}

/** The paragraph that replaces a sub-page card in a task body: a page mention (children kept, id dropped so
 *  BlockNote assigns a fresh one). A placeholder card without a page id becomes an empty paragraph. */
export function subpageAsMention(block: {
  props: Record<string, unknown>
  children?: unknown
}): AppPartialBlock {
  const pageId = typeof block.props.pageId === 'string' ? block.props.pageId : ''
  const children = Array.isArray(block.children) ? (block.children as AppPartialBlock[]) : []
  return {
    type: 'paragraph',
    content: pageId === '' ? [] : [{ type: 'mention', props: { kind: 'page', id: pageId } }],
    children,
  }
}

function blocksById(doc: unknown): Map<string, Obj> {
  const byId = new Map<string, Obj>()
  const stack: unknown[] = Array.isArray(doc) ? (doc as unknown[]).slice() : []
  while (stack.length > 0) {
    const b = stack.pop()
    if (!isObj(b)) continue
    if (typeof b.id === 'string') byId.set(b.id, b)
    if (Array.isArray(b.children)) stack.push(...(b.children as unknown[]))
  }
  return byId
}

/** Replaces every sub-page card of the editor's document (FR-680). Returns whether anything changed. */
export function replaceSubpagesWithMentions(editor: Pick<AppEditor, 'document' | 'replaceBlocks'>): boolean {
  const cards = findSubpageBlocks(editor.document)
  if (cards.length === 0) return false
  const byId = blocksById(editor.document)
  for (const card of cards) {
    const block = byId.get(card.id)
    const props = block && isObj(block.props) ? block.props : {}
    editor.replaceBlocks([card.id], [subpageAsMention({ props, children: block?.children })])
  }
  return true
}

/** M11-D38: the paragraph that replaces a database block in a row body — the database title (children kept). */
export function databaseAsParagraph(
  block: { props: Record<string, unknown>; children?: unknown },
  titleOf: (databaseId: string) => string | undefined,
): AppPartialBlock {
  const id = typeof block.props.databaseId === 'string' ? block.props.databaseId : ''
  const title = (id === '' ? undefined : titleOf(id)) || th.database.untitled
  const children = Array.isArray(block.children) ? (block.children as AppPartialBlock[]) : []
  return { type: 'paragraph', content: title, children }
}

/** Replaces every database block of a row body's document (M11-D38). Returns whether anything changed. */
export function replaceDatabasesWithParagraphs(
  editor: Pick<AppEditor, 'document' | 'replaceBlocks'>,
  titleOf: (databaseId: string) => string | undefined,
): boolean {
  const refs = findDatabaseBlocks(editor.document)
  if (refs.length === 0) return false
  const byId = blocksById(editor.document)
  for (const ref of refs) {
    const block = byId.get(ref.blockId)
    const props = block && isObj(block.props) ? block.props : {}
    editor.replaceBlocks([ref.blockId], [databaseAsParagraph({ props, children: block?.children }, titleOf)])
  }
  return true
}
