// Port of plan/research/snippets/r3/nodecheck/contentText.test.ts (expected strings verbatim) + M4 cases (S0.6).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectDatabaseIds,
  collectMentionIds,
  extractContentText,
  remapContentIds,
  remapSubpageIds,
} from './content-text'

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

describe('live blocks (M10 S0.9, FR-1307, M4-D30)', () => {
  it('taskView / projectWorkload add nothing to content_text — no prop value leaks', () => {
    const doc = [
      { type: 'paragraph', content: 'ก่อน' },
      { type: 'taskView', props: { view: 'BOARD', assigneeId: 'u1' } },
      { type: 'projectWorkload', props: { view: 'ALL' } },
      { type: 'paragraph', content: 'หลัง' },
    ]
    const t = extractContentText(doc)
    expect(t).toBe('ก่อน หลัง')
    for (const v of ['BOARD', 'u1', 'ALL']) expect(t).not.toContain(v)
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

const DB1 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const DB2 = '9b2d7c1e-2a4b-4c6d-8e0f-1a2b3c4d5e6f'

describe('latex (M11, FR-1506)', () => {
  it('equation blocks and inline equations add their LaTeX source', () => {
    const doc = [
      { type: 'equation', props: { latex: 'E=mc^2' } },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'สูตร' },
          { type: 'inlineEquation', props: { latex: '\\frac{a}{b}' } },
          { type: 'text', text: 'จบ' },
        ],
      },
    ]
    // inline runs join without a separator (like styled text); blocks are separated by a space
    expect(extractContentText(doc)).toBe('E=mc^2 สูตร\\frac{a}{b}จบ')
  })

  it('nested in a list item and inside a table cell', () => {
    const doc = [
      {
        type: 'bulletListItem',
        content: 'ข้อ',
        children: [{ type: 'equation', props: { latex: 'x^2' } }],
      },
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [{ cells: [[{ type: 'inlineEquation', props: { latex: '\\pi' } }], 'ค่า'] }],
        },
      },
    ]
    expect(extractContentText(doc)).toBe('ข้อ x^2 \\pi ค่า')
  })

  it('empty or non-string latex adds nothing', () => {
    expect(extractContentText([{ type: 'equation', props: { latex: '' } }])).toBe('')
    expect(extractContentText([{ type: 'equation', props: { latex: 5 } }])).toBe('')
    expect(extractContentText([{ type: 'paragraph', content: [{ type: 'inlineEquation' }] }])).toBe('')
  })
})

describe('database blocks (M11, FR-1474)', () => {
  it('a database block adds nothing to content_text (not its id, not its data)', () => {
    const t = extractContentText([
      { type: 'paragraph', content: 'ก่อน' },
      { type: 'database', props: { databaseId: DB1 } },
      { type: 'paragraph', content: 'หลัง' },
    ])
    expect(t).toBe('ก่อน หลัง')
  })

  it('collectDatabaseIds walks every depth, keeps uuids only', () => {
    const doc = [
      { type: 'database', props: { databaseId: DB1 } },
      {
        type: 'toggleListItem',
        children: [
          { type: 'paragraph', children: [{ type: 'database', props: { databaseId: DB2.toUpperCase() } }] },
        ],
      },
      { type: 'database', props: { databaseId: '' } },
      { type: 'database', props: { databaseId: 'not-a-uuid' } },
      { type: 'database', props: {} },
      { type: 'paragraph', props: { databaseId: DB1 } },
      null,
    ]
    expect([...collectDatabaseIds(doc)].sort()).toEqual([DB1, DB2].sort())
    expect(collectDatabaseIds(null).size).toBe(0)
  })
})

describe('remapContentIds (M11-D11)', () => {
  it('remaps subpage and database ids at any depth without mutating the input', () => {
    const input = [
      { type: 'subpage', props: { pageId: 'p1' } },
      {
        type: 'paragraph',
        children: [
          { type: 'database', props: { databaseId: DB1 } },
          { type: 'database', props: { databaseId: DB2 } },
        ],
      },
    ]
    const before = structuredClone(input)
    const out = remapContentIds(input, {
      pages: new Map([['p1', 'p9']]),
      databases: new Map([[DB1, DB2]]),
    }) as typeof input
    expect(out[0]?.props).toEqual({ pageId: 'p9' })
    expect(out[1]?.children?.[0]?.props).toEqual({ databaseId: DB2 })
    expect(out[1]?.children?.[1]?.props).toEqual({ databaseId: DB2 }) // unmapped ids stay
    expect(input).toEqual(before)
  })

  it('either map may be omitted; remapSubpageIds delegates', () => {
    const doc = [
      { type: 'subpage', props: { pageId: 'a' } },
      { type: 'database', props: { databaseId: DB1 } },
    ]
    expect(remapContentIds(doc, { databases: new Map([[DB1, DB2]]) })).toEqual([
      { type: 'subpage', props: { pageId: 'a' } },
      { type: 'database', props: { databaseId: DB2 } },
    ])
    expect(remapContentIds(doc, {})).toEqual(doc)
    expect(remapSubpageIds(doc, new Map([['a', 'b']]))).toEqual(
      remapContentIds(doc, { pages: new Map([['a', 'b']]) }),
    )
    expect(remapContentIds('x', {})).toEqual([])
  })
})
