// src/lib/editor/sanitize.ts — client-side hygiene for stored content before it reaches BlockNote (r3 §8.3, §12,
// G3/G12). Pure (type-only BlockNote imports).
// - `prepareInitialContent`: BlockNote throws on `[]` and on any unknown block type in `initialContent` (unmounting
//   the tree), so stored JSON is validated with the shared page-content schema; blocks that fail are replaced by a
//   paragraph with their text instead of losing the page.
// - `findForeignMedia` / `foreignMediaReplacement`: image/file blocks with an external url (e.g. an image dragged
//   from another tab bypasses the paste handler) become link paragraphs, mirroring the server sanitiser (M4-D9).
import type { AppPartialBlock } from '@/components/editor/schema'
import { FILE_URL_RE } from '@/lib/files/upload-rules'
import { type BlockInput, blockSchema, pageContentSchema, sanitizeContent } from '@/lib/schemas/page-content'
import { extractContentText } from './content-text'

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Validated partial blocks have the shape BlockNote's PartialBlock accepts (schema parity is tested in
 *  schema.test.ts and templates.headless.test.tsx); the cast only bridges the two declared types. */
const asPartial = (blocks: BlockInput[]): AppPartialBlock[] => blocks as unknown as AppPartialBlock[]

/** Stored content → BlockNote `initialContent`. `undefined` = an empty document (BlockNote rejects `[]`). */
export function prepareInitialContent(raw: unknown): AppPartialBlock[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const parsed = pageContentSchema.safeParse(raw)
  let blocks: BlockInput[]
  if (parsed.success) {
    blocks = parsed.data
  } else {
    blocks = raw.map((b): BlockInput => {
      const one = blockSchema.safeParse(b)
      return one.success ? one.data : { type: 'paragraph', content: extractContentText([b]) }
    })
  }
  const out = sanitizeContent(blocks)
  return out.length === 0 ? undefined : asPartial(out)
}

const isForeignUrl = (url: unknown): boolean =>
  typeof url === 'string' && url !== '' && !FILE_URL_RE.test(url)

/** Ids of image/file blocks (any depth) whose url is neither '' nor `/api/files/<uuid>`. */
export function findForeignMedia(doc: unknown): string[] {
  const ids: string[] = []
  const stack: unknown[] = Array.isArray(doc) ? (doc as unknown[]).slice() : []
  while (stack.length > 0) {
    const b = stack.pop()
    if (!isObj(b)) continue
    const props = isObj(b.props) ? b.props : {}
    if ((b.type === 'image' || b.type === 'file') && isForeignUrl(props.url) && typeof b.id === 'string')
      ids.push(b.id)
    if (Array.isArray(b.children)) {
      const kids: unknown[] = b.children
      stack.push(...kids)
    }
  }
  return ids
}

/** The link paragraph that replaces one foreign image/file block (children kept, id dropped so BlockNote assigns a
 *  fresh one). Same conversion as the server's `sanitizeContent`. */
export function foreignMediaReplacement(block: {
  type: string
  props: Record<string, unknown>
  children?: unknown
}): AppPartialBlock {
  const name = typeof block.props.name === 'string' ? block.props.name : ''
  const url = typeof block.props.url === 'string' ? block.props.url : ''
  const [converted] = sanitizeContent([
    { type: block.type === 'file' ? 'file' : 'image', props: { url, name } },
  ])
  const children = Array.isArray(block.children) ? (block.children as AppPartialBlock[]) : []
  return { ...(converted as unknown as AppPartialBlock), children }
}
