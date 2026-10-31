// Port of plan/research/snippets/r3/nodecheck/contentText.test.ts (expected strings verbatim) + M4 cases (S0.6).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectMentionIds, extractContentText, remapSubpageIds } from './content-text'

const complex: unknown = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '__fixtures__/complex-doc.json'), 'utf8'),
)
const names: Record<string, string> = { 'u-cindy': 'Cindy', 'u-ivy': 'Ivy' }

describe('extractContentText', () => {
  it('real editor.document (captured from BlockNote 0.55 in Chromium)', () => {
    const t = extractContentText(complex, { userName: (id) => names[id] })
    expect(t).toBe(
      'ตัวหนาและปกติ ดูที่ สเปก แล้วคุยกับ @Cindy และหน้า ข้อแม่ ข้อลูก หลาน ชื่อ บทบาท @Ivy Dev select * from pages; screenshot.png ภาพหน้าจอ สัญญา.pdf พับได้ ซ่อนอยู่ คำพูด',
    )
  })

  it('styled runs are joined without separators (Thai word stays searchable)', () => {
    const t = extractContentText([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'ตัว', styles: {} },
          { type: 'text', text: 'หนา', styles: { bold: true } },
        ],
      },
    ])
    expect(t).toBe('ตัวหนา')
  })

  it('page mentions and subpage cards are not indexed; user mentions only with resolver', () => {
    const doc = [
      {
        type: 'paragraph',
        content: [
          { type: 'mention', props: { kind: 'page', id: 'p1' } },
          { type: 'mention', props: { kind: 'user', id: 'u-cindy' } },
        ],
      },
      { type: 'subpage', props: { pageId: 'p2' } },
    ]
    expect(extractContentText(doc)).toBe('')
    expect(extractContentText(doc, { userName: (id) => names[id] })).toBe('@Cindy')
  })

  it('PartialBlock shorthands (templates): string content, string cells, no ids/props/children', () => {
    const doc = [
      { type: 'heading', props: { level: 2 }, content: 'ข้อมูลโปรเจค' },
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [{ cells: ['หัวข้อ', 'รายละเอียด'] }, { cells: ['ลูกค้า', ''] }],
        },
      },
      { type: 'checkListItem', content: ['เป้าหมาย ', { type: 'text', text: 'หนึ่ง', styles: {} }] },
    ]
    expect(extractContentText(doc)).toBe('ข้อมูลโปรเจค หัวข้อ รายละเอียด ลูกค้า เป้าหมาย หนึ่ง')
  })

  it('whitespace/newlines collapse; zero-width chars removed; NFC', () => {
    const doc = [
      { type: 'paragraph', content: 'บรรทัด1\nบรรทัด2\t\t  จบ' },
      { type: 'paragraph', content: 'ภา​ษา' },
      { type: 'paragraph' },
      { type: 'divider' },
    ]
    expect(extractContentText(doc)).toBe('บรรทัด1 บรรทัด2 จบ ภาษา')
  })

  it('hostile input never throws', () => {
    const bad: unknown[] = [
      null,
      undefined,
      42,
      'x',
      {},
      [null, 1, 's', [], { type: 5 }, { content: { type: 'tableContent', rows: 'no' } }],
      [
        {
          type: 'table',
          content: { type: 'tableContent', rows: [null, { cells: [null, 7, { type: 'tableCell' }] }] },
        },
      ],
    ]
    for (const b of bad) expect(() => extractContentText(b)).not.toThrow()
  })

  it('depth cap prevents stack overflow on 100k-deep children', () => {
    let node: Record<string, unknown> = { type: 'paragraph', content: 'ลึก' }
    for (let i = 0; i < 100_000; i++) node = { type: 'bulletListItem', content: 'x', children: [node] }
    const t = extractContentText([node])
    expect(t.startsWith('x x x')).toBe(true)
    expect(t).not.toContain('ลึก')
  })

  it('maxLength cap', () => {
    const doc = [{ type: 'paragraph', content: 'ก'.repeat(300_000) }]
    expect(extractContentText(doc)).toHaveLength(200_000)
    expect(extractContentText(doc, { maxLength: 10 })).toHaveLength(10)
  })

  it('collectMentionIds finds users/pages incl. table cells and subpage cards', () => {
    const ids = collectMentionIds(complex)
    expect([...ids.users].sort()).toEqual(['u-cindy', 'u-ivy'])
    // The fixture's subpage card id is a UUID (page ids come from the server; pageContentSchema requires '' | uuid)
    // — the r3 capture used 'p-child'.
    expect([...ids.pages].sort()).toEqual(['0c4d6a0e-7f3b-4c2a-9d1e-5b6a7c8d9e01', 'p-secret'])
  })

  it('M4-D30: an unknown, content-less block contributes nothing and never throws', () => {
    const doc = [
      { type: 'paragraph', content: 'ก่อน' },
      { type: 'futureLiveBlock', props: { view: 'board' } },
      { type: 'paragraph', content: 'หลัง' },
    ]
    const t = extractContentText(doc)
    expect(t).toBe('ก่อน หลัง')
    expect(t).not.toContain('board')
  })
})

describe('remapSubpageIds', () => {
  it('replaces mapped subpage ids at any depth, leaves the rest, never mutates the input', () => {
    const input = [
      { type: 'subpage', props: { pageId: 'a' } },
      { type: 'paragraph', children: [{ type: 'subpage', props: { pageId: 'b' } }] },
    ]
    const before = structuredClone(input)
    const out = remapSubpageIds(input, new Map([['a', 'x']])) as typeof input
    expect(out[0]?.props).toEqual({ pageId: 'x' })
    expect(out[1]?.children?.[0]?.props).toEqual({ pageId: 'b' })
    expect(input).toEqual(before)
    const nested = remapSubpageIds(input, new Map([['b', 'y']])) as typeof input
    expect(nested[1]?.children?.[0]?.props).toEqual({ pageId: 'y' })
  })

  it('keeps mentions and non-array input safe', () => {
    const doc = [{ type: 'paragraph', content: [{ type: 'mention', props: { kind: 'page', id: 'a' } }] }]
    expect(remapSubpageIds(doc, new Map([['a', 'x']]))).toEqual(doc)
    expect(remapSubpageIds(null, new Map())).toEqual([])
  })
})
