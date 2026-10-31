import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { charterTemplate } from '@/i18n/templates.th'
import {
  isSafeHref,
  PAGE_CONTENT_MAX_BYTES,
  pageContentSchema,
  precheckContent,
  sanitizeContent,
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
