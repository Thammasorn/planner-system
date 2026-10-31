// src/lib/editor/content-text.ts — server-side plain-text extraction for pages.content_text (SPEC §6.4, DM-16, M4-D10).
// Copied from plan/research/snippets/r3/harness/src/lib/contentText.ts (logic verbatim, repo formatting).
// PURE: no BlockNote / DOM import → runs in route handlers, server actions, scripts and Vitest (node env).
// Input is UNTRUSTED JSON (client payload or DB row): walk defensively, never throw.
// Accepts Block[] (editor.document) AND PartialBlock[] (templates / seed data written by hand).
// Blocks without inline content and unknown block types contribute nothing of their own (M4-D30: M10's live blocks
// need no change here).

export type ContentTextOptions = {
  /** Resolve user-mention ids to a display name (optional). Page mentions are never indexed. */
  userName?: (id: string) => string | undefined
  /** Hard cap on output length (characters). Default 200_000. */
  maxLength?: number
  /** Max nesting depth walked (children). Default 64 (BlockNote UI can't realistically exceed this). */
  maxDepth?: number
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown): string => (typeof x === 'string' ? x : '')

/** One inline container (block content, table cell, link content) → ONE string.
 *  Styled runs are concatenated WITHOUT separators: Thai has no spaces between words, so
 *  "ตัว"+"หนา" must stay "ตัวหนา" for ILIKE '%ตัวหนา%'. */
function inlineText(content: unknown, opts: ContentTextOptions): string {
  if (typeof content === 'string') return content // PartialBlock shorthand
  if (!Array.isArray(content)) return ''
  let run = ''
  for (const ic of content) {
    if (typeof ic === 'string') {
      run += ic // PartialInlineContent shorthand
      continue
    }
    if (!isObj(ic)) continue
    switch (ic.type) {
      case 'text':
        run += str(ic.text)
        break
      case 'link':
        run += inlineText(ic.content, opts) // link text only (href not indexed)
        break
      case 'mention': {
        const p = isObj(ic.props) ? ic.props : {}
        // page mentions: NOT indexed (title may be invisible to the searcher + goes stale on rename)
        if (p.kind === 'user' && opts.userName) {
          const n = opts.userName(str(p.id))
          if (n) run += `@${n}`
        }
        break
      }
      default:
        // unknown/custom inline content with styled content
        run += inlineText(ic.content, opts)
    }
  }
  return run
}

function tableText(content: Obj, out: string[], opts: ContentTextOptions): void {
  const rows = content.rows
  if (!Array.isArray(rows)) return
  for (const row of rows) {
    if (!isObj(row) || !Array.isArray(row.cells)) continue
    for (const cell of row.cells) {
      // cell = { type: "tableCell", props, content: InlineContent[] } | InlineContent[] | string (partial)
      const t =
        isObj(cell) && cell.type === 'tableCell' ? inlineText(cell.content, opts) : inlineText(cell, opts)
      if (t) out.push(t)
    }
  }
}

function blockText(
  block: unknown,
  out: string[],
  opts: Required<Pick<ContentTextOptions, 'maxDepth'>> & ContentTextOptions,
  depth: number,
): void {
  if (!isObj(block) || depth > opts.maxDepth) return
  const content = block.content
  if (isObj(content) && content.type === 'tableContent') tableText(content, out, opts)
  else {
    const t = inlineText(content, opts) // inline | plain (code block) | string | undefined ("none")
    if (t) out.push(t)
  }
  const type = str(block.type)
  const props = isObj(block.props) ? block.props : {}
  if (type === 'image' || type === 'file' || type === 'video' || type === 'audio') {
    if (str(props.name)) out.push(str(props.name)) // "สัญญา.pdf" is searchable
    if (str(props.caption)) out.push(str(props.caption))
  }
  // subpage: its title is indexed on its own pages row → not duplicated here.
  const children = block.children
  if (Array.isArray(children)) for (const c of children) blockText(c, out, opts, depth + 1)
}

const ZERO_WIDTH = /[​-‍⁠﻿]/g

export function extractContentText(doc: unknown, options: ContentTextOptions = {}): string {
  const opts = { maxDepth: 64, ...options }
  const out: string[] = []
  if (Array.isArray(doc)) for (const b of doc) blockText(b, out, opts, 0)
  const text = out.join(' ').normalize('NFC').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim()
  const max = opts.maxLength ?? 200_000
  return text.length > max ? text.slice(0, max) : text
}

/** Ids referenced by a document (for resolving names in one query, or for link-integrity checks). */
export function collectMentionIds(doc: unknown): { users: Set<string>; pages: Set<string> } {
  const users = new Set<string>()
  const pages = new Set<string>()
  const visitInline = (content: unknown): void => {
    if (!Array.isArray(content)) return
    for (const ic of content) {
      if (!isObj(ic)) continue
      if (ic.type === 'mention' && isObj(ic.props)) {
        const id = str(ic.props.id)
        if (id) (ic.props.kind === 'page' ? pages : users).add(id)
      } else if (ic.type === 'link') visitInline(ic.content)
    }
  }
  const visitBlock = (b: unknown, depth: number): void => {
    if (!isObj(b) || depth > 64) return
    if (isObj(b.content) && b.content.type === 'tableContent' && Array.isArray(b.content.rows)) {
      for (const r of b.content.rows)
        if (isObj(r) && Array.isArray(r.cells)) for (const c of r.cells) visitInline(isObj(c) ? c.content : c)
    } else visitInline(b.content)
    if (b.type === 'subpage' && isObj(b.props) && str(b.props.pageId)) pages.add(str(b.props.pageId))
    if (Array.isArray(b.children)) for (const c of b.children) visitBlock(c, depth + 1)
  }
  if (Array.isArray(doc)) for (const b of doc) visitBlock(b, 0)
  return { users, pages }
}

/**
 * FR-508 duplicate: deep copy of `doc` where every `subpage` block whose `props.pageId` is a key of `map` gets the
 * mapped id; everything else (mentions included) is untouched. The input is never mutated. Callers pass stored,
 * validated content (nesting ≤ PAGE_MAX_NESTING); non-array input → [].
 */
export function remapSubpageIds(doc: unknown, map: ReadonlyMap<string, string>): unknown[] {
  if (!Array.isArray(doc)) return []
  const root = structuredClone(doc) as unknown[]
  const stack: unknown[] = [...root]
  while (stack.length > 0) {
    const b = stack.pop()
    if (!isObj(b)) continue
    if (b.type === 'subpage' && isObj(b.props)) {
      const next = map.get(str(b.props.pageId))
      if (next !== undefined) b.props.pageId = next
    }
    if (Array.isArray(b.children)) for (const c of b.children) stack.push(c)
  }
  return root
}
