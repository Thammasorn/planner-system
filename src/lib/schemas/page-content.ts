// src/lib/schemas/page-content.ts — the one validator for page content (SPEC §7.7, M4-D8/D9, r3 §13): saves,
// templates and seeds. Isomorphic (no server imports). Accepts full BlockNote blocks and partial blocks (string
// content, string table cells, no ids). Unknown block types, bad props and unsafe links are rejected; image/file
// blocks pointing outside /api/files/<uuid> are converted by `sanitizeContent` (the service stores parsed +
// sanitised output, never the raw input).
// Extension point (M4-D37): BLOCK_TYPES is the only block-type list and `checkBlockProps` the only per-type rule
// set; M10 appends its live blocks to both.
import { th } from '@/i18n/th'
import { FILE_URL_RE } from '@/lib/files/upload-rules'
import { z } from '@/lib/z'

export const PAGE_CONTENT_MAX_BYTES = 2 * 1024 * 1024
export const PAGE_MAX_BLOCKS = 5000
export const PAGE_MAX_NESTING = 20

export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
  'quote',
  'codeBlock',
  'divider',
  'table',
  'image',
  'file',
  'subpage',
  'taskView', // M10 (FR-1301, M10-D4)
  'projectWorkload', // M10 (FR-1303, M10-D4)
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

/** M10 live data blocks (X78): view config only in props, data read through authz at render time. */
export const LIVE_BLOCK_TYPES = ['taskView', 'projectWorkload'] as const
export type LiveBlockType = (typeof LIVE_BLOCK_TYPES)[number]
export const TASK_VIEW_LIMITS = [10, 20, 50, 100] as const
export type TaskViewLimit = (typeof TASK_VIEW_LIMITS)[number]
export const TASK_VIEW_MAX_STATUS_IDS = 12

export interface TaskViewProps {
  view: 'LIST' | 'BOARD'
  /** '' = anyone (Better Auth text ids). */
  assigneeId: string
  /** '' = any milestone. */
  milestoneId: string
  /** '' = any status; else comma-separated uuids (≤ 12). */
  statusIds: string
  showDone: boolean
  limit: TaskViewLimit
}
export interface ProjectWorkloadProps {
  view: 'ALL' | 'COMMITTED' | 'AT_RISK'
}

export const TASK_VIEW_DEFAULTS: Readonly<TaskViewProps> = Object.freeze({
  view: 'BOARD',
  assigneeId: '',
  milestoneId: '',
  statusIds: '',
  showDone: false,
  limit: 20,
})
export const WORKLOAD_VIEW_DEFAULTS: Readonly<ProjectWorkloadProps> = Object.freeze({ view: 'ALL' })

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Allowed link targets (M4-D9): http(s), mailto, tel, or a same-origin path ('/x', never '//' or '/\' which browsers
 * treat as protocol-relative). Leading/trailing whitespace is ignored; control characters anywhere → unsafe.
 */
export function isSafeHref(href: string): boolean {
  if (CONTROL_CHARS.test(href)) return false
  const h = href.trim()
  if (/^(https?:|mailto:|tel:)/i.test(h)) return true
  return h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/\\')
}

export type PrecheckResult =
  { ok: true; blocks: number } | { ok: false; reason: 'notArray' | 'tooLarge' | 'tooDeep' | 'tooManyBlocks' }

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * Cheap structural pre-check before zod walks the document (zod recursion is bounded by this). ITERATIVE (explicit
 * stack) so a 100 000-deep `children` chain fails fast without a stack overflow. Nesting counts block levels
 * (top-level blocks = 1); blocks counts every block at every level; size = UTF-8 bytes of the JSON.
 */
export function precheckContent(raw: unknown): PrecheckResult {
  if (!Array.isArray(raw)) return { ok: false, reason: 'notArray' }
  let blocks = 0
  const stack: [unknown[], number][] = [[raw, 1]]
  while (stack.length > 0) {
    const [list, level] = stack.pop()!
    if (level > PAGE_MAX_NESTING) return { ok: false, reason: 'tooDeep' }
    for (const b of list) {
      blocks += 1
      if (blocks > PAGE_MAX_BLOCKS) return { ok: false, reason: 'tooManyBlocks' }
      if (isObj(b) && Array.isArray(b.children) && b.children.length > 0) stack.push([b.children, level + 1])
    }
  }
  let bytes: number
  try {
    bytes = new TextEncoder().encode(JSON.stringify(raw)).length
  } catch {
    return { ok: false, reason: 'tooDeep' } // cyclic or pathologically nested non-block values
  }
  if (bytes > PAGE_CONTENT_MAX_BYTES) return { ok: false, reason: 'tooLarge' }
  return { ok: true, blocks }
}

const Styles = z.record(z.string().max(40), z.union([z.boolean(), z.string().max(40)]))
const Text = z.object({ type: z.literal('text'), text: z.string().max(100_000), styles: Styles.optional() })
const Link = z.object({
  type: z.literal('link'),
  href: z.string().max(2048).refine(isSafeHref),
  content: z.union([z.string().max(100_000), z.array(Text).max(500)]),
})
const Mention = z.object({
  type: z.literal('mention'),
  props: z.object({ kind: z.enum(['user', 'page']), id: z.string().min(1).max(64) }),
})
const Inline = z.union([z.string().max(100_000), z.discriminatedUnion('type', [Text, Link, Mention])])
const InlineContent = z.union([z.string().max(100_000), z.array(Inline).max(2000)])
const Prop = z.union([z.string().max(2048), z.number(), z.boolean(), z.null()])
const Props = z.record(z.string().max(40), Prop)
const Cell = z.union([
  InlineContent,
  z.looseObject({ type: z.literal('tableCell'), props: Props.optional(), content: InlineContent.optional() }),
])
const TableContent = z.looseObject({
  type: z.literal('tableContent'),
  // nullish: BlockNote keeps `undefined` widths in memory (JSON turns them into null).
  columnWidths: z.array(z.number().nullish()).max(100).optional(),
  headerRows: z.number().int().min(0).max(1).optional(),
  headerCols: z.number().int().min(0).max(1).optional(),
  rows: z.array(z.object({ cells: z.array(Cell).max(100) })).max(1000),
})

export interface BlockInput {
  id?: string
  type: BlockType
  props?: Record<string, string | number | boolean | null>
  content?: unknown
  children?: BlockInput[]
}

const isTableContent = (c: unknown): boolean => isObj(c) && c.type === 'tableContent'

const isUuid = (s: string): boolean => UUID_RE.test(s)
const isStatusIdList = (s: string): boolean => {
  if (s === '') return true
  const ids = s.split(',')
  return ids.length <= TASK_VIEW_MAX_STATUS_IDS && ids.every(isUuid)
}

// FR-1302 / M10-D4: strict — any other key (projectId, tasks, …) is an issue.
const taskViewPropsSchema = z
  .object({
    view: z.enum(['LIST', 'BOARD']).optional(),
    assigneeId: z.string().max(64).optional(),
    milestoneId: z
      .string()
      .refine((s) => s === '' || isUuid(s))
      .optional(),
    statusIds: z
      .string()
      .max(TASK_VIEW_MAX_STATUS_IDS * 37)
      .refine(isStatusIdList)
      .optional(),
    showDone: z.boolean().optional(),
    limit: z.union(TASK_VIEW_LIMITS.map((n) => z.literal(n))).optional(),
  })
  .strict()
const projectWorkloadPropsSchema = z
  .object({ view: z.enum(['ALL', 'COMMITTED', 'AT_RISK']).optional() })
  .strict()

const isLiveBlockType = (t: string): t is LiveBlockType => (LIVE_BLOCK_TYPES as readonly string[]).includes(t)

/** Fill defaults and drop junk for rendering (client) — never throws (M10-D4). */
export function resolveTaskViewProps(p: Record<string, unknown> | undefined): TaskViewProps {
  const v = p ?? {}
  const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined)
  const view = v.view === 'LIST' || v.view === 'BOARD' ? v.view : TASK_VIEW_DEFAULTS.view
  const assigneeId = str(v.assigneeId)
  const milestoneId = str(v.milestoneId)
  const statusIds = (str(v.statusIds) ?? '')
    .split(',')
    .filter((x) => isUuid(x))
    .slice(0, TASK_VIEW_MAX_STATUS_IDS)
    .join(',')
  const limit = TASK_VIEW_LIMITS.find((n) => n === v.limit) ?? TASK_VIEW_DEFAULTS.limit
  return {
    view,
    assigneeId:
      assigneeId !== undefined && assigneeId.length <= 64 ? assigneeId : TASK_VIEW_DEFAULTS.assigneeId,
    milestoneId:
      milestoneId !== undefined && isUuid(milestoneId) ? milestoneId : TASK_VIEW_DEFAULTS.milestoneId,
    statusIds,
    showDone: typeof v.showDone === 'boolean' ? v.showDone : TASK_VIEW_DEFAULTS.showDone,
    limit,
  }
}

/** Fill the default view for rendering (client) — never throws (M10-D4). */
export function resolveWorkloadProps(p: Record<string, unknown> | undefined): ProjectWorkloadProps {
  const view = p?.view
  return {
    view: view === 'COMMITTED' || view === 'AT_RISK' || view === 'ALL' ? view : WORKLOAD_VIEW_DEFAULTS.view,
  }
}

/**
 * Per-type rules (M4-D9). One `if (block.type === …)` branch per rule so M10 can add a branch without touching
 * M4's (M4-D37). Exported for that reason.
 */
export function checkBlockProps(block: BlockInput, ctx: z.RefinementCtx): void {
  const props = block.props ?? {}
  const fail = (path: (string | number)[]): void => {
    ctx.addIssue({ code: 'custom', message: th.pages.errors.contentInvalid, path })
  }
  if (block.type === 'heading') {
    if (props.level !== undefined && props.level !== 1 && props.level !== 2 && props.level !== 3)
      fail(['props', 'level'])
  }
  if (block.type === 'subpage') {
    const id = props.pageId
    if (id !== undefined && (typeof id !== 'string' || (id !== '' && !UUID_RE.test(id))))
      fail(['props', 'pageId'])
  }
  if (block.type === 'file') {
    const size = props.size
    if (size !== undefined && (typeof size !== 'number' || !Number.isInteger(size) || size < 0))
      fail(['props', 'size'])
  }
  if (block.type === 'image' || block.type === 'file') {
    if (props.url !== undefined && typeof props.url !== 'string') fail(['props', 'url'])
  }
  if (block.type === 'table') {
    if (block.content !== undefined && !isTableContent(block.content)) fail(['content'])
  }
  if (block.type !== 'table') {
    if (isTableContent(block.content)) fail(['content'])
  }
  if (block.type === 'codeBlock') {
    const c = block.content
    const plain =
      c === undefined ||
      typeof c === 'string' ||
      (Array.isArray(c) && c.every((ic) => isObj(ic) && ic.type === 'text'))
    if (!plain) fail(['content'])
  }
  // M10 (FR-1302, M10-D4): live blocks hold view config only — never data in content, never children.
  if (isLiveBlockType(block.type)) {
    const schema = block.type === 'taskView' ? taskViewPropsSchema : projectWorkloadPropsSchema
    if (!schema.safeParse(props).success) fail(['props'])
    const c = block.content
    if (c !== undefined && !(Array.isArray(c) && c.length === 0)) fail(['content'])
    if (block.children !== undefined && block.children.length > 0) fail(['children'])
  }
}

// Object shapes: block / inline objects use z.object (unknown keys stripped); TableContent and the tableCell object
// use z.looseObject so BlockNote table internals survive a save.
export const blockSchema: z.ZodType<BlockInput> = z.lazy(() =>
  z
    .object({
      id: z.string().max(64).optional(),
      type: z.enum(BLOCK_TYPES),
      props: Props.optional(),
      content: z.union([InlineContent, TableContent]).optional(),
      children: z.array(blockSchema).max(1000).optional(),
    })
    .superRefine(checkBlockProps),
)

/** Pre-check first (no deep recursion in zod for hostile input), then the structural schema. */
export const pageContentSchema = z
  .unknown()
  .superRefine((v, ctx) => {
    const p = precheckContent(v)
    if (!p.ok)
      ctx.addIssue({
        code: 'custom',
        continue: false, // abort: the pipe never walks oversized input
        message: p.reason === 'tooLarge' ? th.pages.errors.contentTooLarge : th.pages.errors.contentInvalid,
      })
  })
  .pipe(z.array(blockSchema).max(PAGE_MAX_BLOCKS))

export type PageContent = BlockInput[]

const isHttp = (url: string): boolean => /^https?:\/\//i.test(url)

/**
 * Deep copy where every image/file block whose `props.url` is neither '' nor `/api/files/<uuid>` becomes a
 * paragraph: a link to the url (http/https) or the file name (anything else, e.g. data: URLs). Children are kept;
 * nothing else changes (M4-D9; §7.6 "no external images"). Input is validated content (nesting ≤ 20).
 */
export function sanitizeContent(doc: PageContent): PageContent {
  return doc.map(sanitizeBlock)
}

function sanitizeBlock(block: BlockInput): BlockInput {
  const children = block.children?.map(sanitizeBlock)
  const url = block.props?.url
  if (
    (block.type === 'image' || block.type === 'file') &&
    typeof url === 'string' &&
    url !== '' &&
    !FILE_URL_RE.test(url)
  ) {
    const name = typeof block.props?.name === 'string' ? block.props.name : ''
    const out: BlockInput = {
      type: 'paragraph',
      content: isHttp(url)
        ? [{ type: 'link', href: url, content: name || th.editor.pasteImageLinkFallback }]
        : name,
    }
    if (block.id !== undefined) out.id = block.id
    if (children !== undefined) out.children = children
    return out
  }
  const { children: _children, ...rest } = block
  const copy: BlockInput = structuredClone(rest)
  if (children !== undefined) copy.children = children
  return copy
}
