import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { charterTemplate } from '@/i18n/templates.th'
import {
  BLOCK_TYPES,
  isSafeHref,
  LIVE_BLOCK_TYPES,
  PAGE_CONTENT_MAX_BYTES,
  pageContentSchema,
  precheckContent,
  resolveTaskViewProps,
  resolveWorkloadProps,
  sanitizeContent,
  TASK_VIEW_DEFAULTS,
  WORKLOAD_VIEW_DEFAULTS,
  type PageContent,
} from './page-content'

const complex: unknown = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/lib/editor/__fixtures__/complex-doc.json'), 'utf8'),
)
const V4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const para = (href: string) => [{ type: 'paragraph', content: [{ type: 'link', href, content: 'x' }] }]
const messages = (v: unknown): string[] => {
  const r = pageContentSchema.safeParse(v)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('pageContentSchema', () => {
  it('parses the captured BlockNote document and sanitize keeps it deep-equal', () => {
    const r = pageContentSchema.safeParse(complex)
    expect(r.success, JSON.stringify(r.error?.issues.slice(0, 3))).toBe(true)
    expect(sanitizeContent(r.data!)).toEqual(r.data)
    expect(r.data).toEqual(complex)
  })

  it('parses partial blocks (charter template)', () => {
    expect(pageContentSchema.safeParse(charterTemplate().content).success).toBe(true)
  })

  it.each<[string, unknown]>([
    ['unknown type', [{ type: 'nope' }]],
    ['heading level 7', [{ type: 'heading', props: { level: 7 } }]],
    ['subpage pageId number', [{ type: 'subpage', props: { pageId: 5 } }]],
    ['subpage pageId not uuid', [{ type: 'subpage', props: { pageId: 'abc' } }]],
    [
      'mention kind team',
      [{ type: 'paragraph', content: [{ type: 'mention', props: { kind: 'team', id: 'x' } }] }],
    ],
    ['table content on a paragraph', [{ type: 'paragraph', content: { type: 'tableContent', rows: [] } }]],
    ['inline content on a table', [{ type: 'table', content: 'x' }]],
    ['file size negative', [{ type: 'file', props: { size: -1 } }]],
    ['codeBlock with a link', [{ type: 'codeBlock', content: [{ type: 'link', href: '/x', content: 'x' }] }]],
    ['not an array', { type: 'paragraph' }],
  ])('rejects %s', (_name, v) => {
    expect(pageContentSchema.safeParse(v).success).toBe(false)
  })

  it('accepts subpage pageId "" or a uuid, heading 1–3', () => {
    expect(
      pageContentSchema.safeParse([
        { type: 'subpage', props: { pageId: '' } },
        { type: 'subpage', props: { pageId: V4 } },
        { type: 'heading', props: { level: 3 }, content: 'x' },
        { type: 'codeBlock', content: 'select 1' },
      ]).success,
    ).toBe(true)
  })

  it('link hrefs: only http(s), mailto, tel and same-origin paths', () => {
    for (const bad of [
      'javascript:alert(1)',
      ' JaVaScRiPt:x',
      '//evil.com',
      '/\\evil.com',
      'data:text/html,x',
      'java\nscript:x',
    ])
      expect(pageContentSchema.safeParse(para(bad)).success, bad).toBe(false)
    for (const ok of [`/p/${V4}`, 'https://example.com', 'mailto:a@b.co', 'tel:+6621234567', 'http://x.y'])
      expect(pageContentSchema.safeParse(para(ok)).success, ok).toBe(true)
    expect(isSafeHref(' https://x ')).toBe(true)
  })

  it('size, nesting and block-count limits', () => {
    const big = [{ type: 'paragraph', content: 'a'.repeat(PAGE_CONTENT_MAX_BYTES + 1) }]
    expect(messages(big)).toEqual([th.pages.errors.contentTooLarge])
    let deep: Record<string, unknown> = { type: 'paragraph' }
    for (let i = 1; i < 21; i++) deep = { type: 'paragraph', children: [deep] }
    expect(messages([deep])).toEqual([th.pages.errors.contentInvalid])
    let ok20: Record<string, unknown> = { type: 'paragraph' }
    for (let i = 1; i < 20; i++) ok20 = { type: 'paragraph', children: [ok20] }
    expect(pageContentSchema.safeParse([ok20]).success).toBe(true)
    const many = Array.from({ length: 5001 }, () => ({ type: 'paragraph' }))
    expect(pageContentSchema.safeParse(many).success).toBe(false)
    expect(pageContentSchema.safeParse(many.slice(0, 5000)).success).toBe(true)
  })

  it('a 100 000-deep children chain fails fast without a stack overflow', () => {
    let node: Record<string, unknown> = { type: 'paragraph' }
    for (let i = 0; i < 100_000; i++) node = { type: 'paragraph', children: [node] }
    expect(precheckContent([node])).toEqual({ ok: false, reason: 'tooDeep' })
    expect(pageContentSchema.safeParse([node]).success).toBe(false)
  })

  it('strips unknown keys on blocks but keeps BlockNote table internals', () => {
    const r = pageContentSchema.safeParse([
      {
        type: 'table',
        extra: 1,
        content: {
          type: 'tableContent',
          columnWidths: [100, null],
          internal: 'kept',
          rows: [{ cells: [{ type: 'tableCell', props: { colspan: 1 }, content: 'a', inner: true }, 'b'] }],
        },
      },
    ])
    expect(r.success).toBe(true)
    expect(r.data![0]).not.toHaveProperty('extra')
    expect(r.data![0]!.content).toMatchObject({ internal: 'kept', rows: [{ cells: [{ inner: true }, 'b'] }] })
  })
})

describe('sanitizeContent', () => {
  const parse = (v: unknown): PageContent => pageContentSchema.parse(v)

  it('external image → paragraph with a link named after the image', () => {
    const out = sanitizeContent(
      parse([{ id: 'b1', type: 'image', props: { url: 'https://example.com/cat.png', name: 'cat' } }]),
    )
    expect(out).toEqual([
      {
        id: 'b1',
        type: 'paragraph',
        content: [{ type: 'link', href: 'https://example.com/cat.png', content: 'cat' }],
      },
    ])
    const noName = sanitizeContent(parse([{ type: 'image', props: { url: 'https://example.com/a.png' } }]))
    expect(noName[0]!.content).toEqual([
      { type: 'link', href: 'https://example.com/a.png', content: th.editor.pasteImageLinkFallback },
    ])
  })

  it('data: image → paragraph with the (empty) name; children preserved', () => {
    const out = sanitizeContent(
      parse([
        {
          type: 'image',
          props: { url: 'data:image/png;base64,AAAA' },
          children: [{ type: 'paragraph', content: 'c' }],
        },
      ]),
    )
    expect(out).toEqual([{ type: 'paragraph', content: '', children: [{ type: 'paragraph', content: 'c' }] }])
  })

  it('local and empty urls are untouched, at any depth; the input is not mutated', () => {
    const doc = parse([
      { type: 'image', props: { url: `/api/files/${V4}`, name: 'a.png' } },
      { type: 'file', props: { url: '', name: 'b.pdf' } },
      { type: 'paragraph', children: [{ type: 'file', props: { url: 'http://evil/x.pdf', name: 'x.pdf' } }] },
    ])
    const before = structuredClone(doc)
    const out = sanitizeContent(doc)
    expect(out.slice(0, 2)).toEqual(doc.slice(0, 2))
    expect(out[2]!.children![0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'link', href: 'http://evil/x.pdf', content: 'x.pdf' }],
    })
    expect(doc).toEqual(before)
  })
})

// M10 S0.4 (FR-1302, M10-D4): live blocks carry view config only — no project id, no task data, no content/children.
describe('live blocks (taskView / projectWorkload)', () => {
  const V4B = '6ba7b810-9dad-41d1-80b4-00c04fd430c8'
  const ok = (v: unknown): boolean => pageContentSchema.safeParse(v).success

  it('parses the template form and a full taskView', () => {
    expect(ok([{ type: 'taskView', props: { view: 'BOARD' } }])).toBe(true)
    expect(
      ok([
        {
          type: 'taskView',
          props: {
            view: 'LIST',
            assigneeId: 'u1',
            milestoneId: '',
            statusIds: `${V4},${V4B}`,
            showDone: true,
            limit: 50,
          },
          children: [],
        },
      ]),
    ).toBe(true)
    expect(ok([{ type: 'taskView', props: { milestoneId: V4 }, content: [] }])).toBe(true)
  })

  it.each<[string, Record<string, unknown>]>([
    ['projectId prop', { props: { projectId: V4 } }],
    ['tasks prop', { props: { tasks: '[{"name":"x"}]' } }],
    ['limit 7', { props: { limit: 7 } }],
    ['view TABLE', { props: { view: 'TABLE' } }],
    ['statusIds not uuids', { props: { statusIds: 'x' } }],
    ['13 status ids', { props: { statusIds: Array.from({ length: 13 }, () => V4).join(',') } }],
    ['milestoneId not uuid', { props: { milestoneId: 'abc' } }],
    ['showDone string', { props: { showDone: 'yes' } }],
    ['inline content', { content: [{ type: 'text', text: 'ลับ' }] }],
    ['string content', { content: 'ลับ' }],
    ['children', { children: [{ type: 'paragraph', content: 'x' }] }],
  ])('taskView rejects %s', (_name, extra) => {
    expect(messages([{ type: 'taskView', ...extra }])).toContain(th.pages.errors.contentInvalid)
  })

  it('projectWorkload: empty or a known view parses; anything else fails', () => {
    expect(ok([{ type: 'projectWorkload' }])).toBe(true)
    expect(ok([{ type: 'projectWorkload', props: {} }])).toBe(true)
    expect(ok([{ type: 'projectWorkload', props: { view: 'AT_RISK' } }])).toBe(true)
    expect(ok([{ type: 'projectWorkload', props: { weeks: 12 } }])).toBe(false)
    expect(ok([{ type: 'projectWorkload', props: { view: 'TOTAL' } }])).toBe(false)
    expect(ok([{ type: 'projectWorkload', props: { projectId: V4 } }])).toBe(false)
    expect(ok([{ type: 'projectWorkload', content: 'x' }])).toBe(false)
    expect(ok([{ type: 'projectWorkload', children: [{ type: 'paragraph' }] }])).toBe(false)
  })

  it('LIVE_BLOCK_TYPES are part of BLOCK_TYPES', () => {
    for (const t of LIVE_BLOCK_TYPES) expect(BLOCK_TYPES).toContain(t)
  })

  it('resolveTaskViewProps fills defaults and drops junk', () => {
    expect(resolveTaskViewProps({ view: 'NOPE', limit: 7 })).toEqual(TASK_VIEW_DEFAULTS)
    expect(resolveTaskViewProps(undefined)).toEqual(TASK_VIEW_DEFAULTS)
    expect(
      resolveTaskViewProps({
        view: 'LIST',
        assigneeId: 'u1',
        statusIds: `${V4},bad`,
        showDone: true,
        limit: 50,
      }),
    ).toEqual({
      ...TASK_VIEW_DEFAULTS,
      view: 'LIST',
      assigneeId: 'u1',
      statusIds: V4,
      showDone: true,
      limit: 50,
    })
    expect(resolveTaskViewProps({ milestoneId: 'x', assigneeId: 5 })).toEqual(TASK_VIEW_DEFAULTS)
    expect(resolveTaskViewProps({ milestoneId: V4 }).milestoneId).toBe(V4)
  })

  it('resolveWorkloadProps fills the default view', () => {
    expect(resolveWorkloadProps(undefined)).toEqual(WORKLOAD_VIEW_DEFAULTS)
    expect(resolveWorkloadProps({ view: 'COMMITTED' })).toEqual({ view: 'COMMITTED' })
    expect(resolveWorkloadProps({ view: 'TOTAL' })).toEqual({ view: 'ALL' })
  })
})

describe('database / equation / inlineEquation (M11, FR-1407, FR-1501…1506)', () => {
  const ok = (v: unknown): boolean => pageContentSchema.safeParse(v).success
  const latex = (n: number) => 'x'.repeat(n)

  it('are part of BLOCK_TYPES', () => {
    expect(BLOCK_TYPES).toContain('database')
    expect(BLOCK_TYPES).toContain('equation')
  })

  it('database: props only databaseId (uuid or empty), no content, no children', () => {
    expect(ok([{ type: 'database', props: { databaseId: V4 } }])).toBe(true)
    expect(ok([{ type: 'database', props: { databaseId: '' } }])).toBe(true)
    expect(ok([{ type: 'database' }])).toBe(true)
    expect(ok([{ type: 'database', props: { databaseId: 'nope' } }])).toBe(false)
    expect(ok([{ type: 'database', props: { databaseId: 5 } }])).toBe(false)
    expect(ok([{ type: 'database', props: { databaseId: V4, title: 'x' } }])).toBe(false)
    expect(ok([{ type: 'database', props: { databaseId: V4 }, content: 'x' }])).toBe(false)
    expect(ok([{ type: 'database', props: { databaseId: V4 }, children: [{ type: 'paragraph' }] }])).toBe(
      false,
    )
  })

  it('equation: latex string ≤ 2,000, no other props, no content/children', () => {
    expect(ok([{ type: 'equation', props: { latex: latex(2000) } }])).toBe(true)
    expect(ok([{ type: 'equation', props: { latex: '' } }])).toBe(true)
    expect(ok([{ type: 'equation', props: { latex: latex(2001) } }])).toBe(false)
    expect(ok([{ type: 'equation', props: { latex: 1 } }])).toBe(false)
    expect(ok([{ type: 'equation', props: { latex: 'x', size: 2 } }])).toBe(false)
    expect(ok([{ type: 'equation', props: { latex: 'x' }, content: 'x' }])).toBe(false)
    expect(ok([{ type: 'equation', props: { latex: 'x' }, children: [{ type: 'paragraph' }] }])).toBe(false)
  })

  it('inlineEquation: latex ≤ 2,000 inside inline content and table cells', () => {
    const inl = (l: unknown) => [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a' },
          { type: 'inlineEquation', props: { latex: l } },
        ],
      },
    ]
    expect(ok(inl(latex(2000)))).toBe(true)
    expect(ok(inl(latex(2001)))).toBe(false)
    expect(ok(inl(3))).toBe(false)
    expect(
      ok([
        {
          type: 'table',
          content: {
            type: 'tableContent',
            rows: [{ cells: [[{ type: 'inlineEquation', props: { latex: '\\pi' } }]] }],
          },
        },
      ]),
    ).toBe(true)
  })
})
