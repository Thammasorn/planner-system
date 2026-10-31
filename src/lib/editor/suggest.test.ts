// S2.1 — ranked suggestion filter + word-start guards (FR-520, AC-504, r3 §5.1). Ported from
// plan/research/snippets/r3/nodecheck/suggest.test.ts.
import { describe, expect, it } from 'vitest'
import { atWordStart, rankSuggestionItems, slashShouldOpen, type ShouldOpenTr } from './suggest'

const items = [
  { title: 'หัวข้อ 2', aliases: ['h2', 'heading2', 'subheading'], group: 'หัวข้อ' },
  { title: 'ย่อหน้า', aliases: ['p', 'paragraph', 'ข้อความ'], group: 'บล็อกพื้นฐาน' },
  { title: 'ตาราง', aliases: ['table'], group: 'ขั้นสูง' },
  { title: 'หน้า', aliases: ['page', 'subpage', 'หน้าย่อย'], group: 'ขั้นสูง' },
  { title: 'รูปภาพ', aliases: ['image', 'img', 'รูป'], group: 'สื่อ' },
]
const titles = (q: string, list: readonly { title: string; aliases?: string[]; group?: string }[] = items) =>
  rankSuggestionItems(list, q).map((i) => i.title)

describe('rankSuggestionItems', () => {
  it('exact title beats substring (AC-504 "/หน้า")', () => {
    expect(titles('หน้า', [{ title: 'ย่อหน้า' }, { title: 'หน้า', aliases: ['page'] }])).toEqual([
      'หน้า',
      'ย่อหน้า',
    ])
    expect(titles('หน้า')).toEqual(['หน้า', 'ย่อหน้า'])
  })

  it('English alias finds the Thai item (FR-520 "/table", "/page")', () => {
    expect(titles('table')).toEqual(['ตาราง'])
    expect(titles('page', [{ title: 'ย่อหน้า' }, { title: 'หน้า', aliases: ['page'] }])).toEqual(['หน้า'])
  })

  it('Thai prefix, case-insensitive and trimmed', () => {
    expect(titles('รูป')).toEqual(['รูปภาพ'])
    expect(titles('  TABLE ')).toEqual(['ตาราง'])
  })

  it('empty query keeps the input order', () => {
    expect(titles('')).toEqual(items.map((i) => i.title))
    expect(titles('   ')).toEqual(items.map((i) => i.title))
  })

  it('keeps groups contiguous even when ranks interleave', () => {
    const list = [
      { title: 'xa', group: 'A' },
      { title: 'b', aliases: ['x'], group: 'B' }, // exact alias (rank 1)
      { title: 'x', group: 'A' }, // exact title (rank 0)
      { title: 'bx', group: 'B' }, // substring (rank 4)
    ]
    const groups = rankSuggestionItems(list, 'x').map((i) => i.group)
    expect(groups).toEqual(['A', 'A', 'B', 'B'])
    expect(titles('x', list)).toEqual(['x', 'xa', 'b', 'bx'])
  })

  it('never repeats a group on a broad query', () => {
    const groups = rankSuggestionItems(items, 'a').map((i) => i.group)
    const seen = new Set<string | undefined>()
    let prev: string | undefined = '\u0000'
    for (const g of groups) {
      if (g !== prev) {
        expect(seen.has(g)).toBe(false)
        seen.add(g)
        prev = g
      }
    }
  })
})

/** Minimal stand-in for a ProseMirror transaction (only the fields the guards read). */
function fakeTr(nodeBefore: { isText: boolean; text?: string } | null, inTable = false): ShouldOpenTr {
  return {
    selection: {
      $from: {
        nodeBefore,
        parent: { type: { isInGroup: (g: string) => inTable && g === 'tableContent' } },
      },
    },
  } as unknown as ShouldOpenTr
}

describe('atWordStart', () => {
  it('opens at the block start', () => {
    expect(atWordStart(fakeTr(null))).toBe(true)
  })
  it('does not open mid-word ("10:30", "1/2", "cindy@corp")', () => {
    expect(atWordStart(fakeTr({ isText: true, text: '10' }))).toBe(false)
  })
  it('opens after whitespace', () => {
    expect(atWordStart(fakeTr({ isText: true, text: 'ประชุม ' }))).toBe(true)
  })
  it('opens right after an inline atom (mention chip)', () => {
    expect(atWordStart(fakeTr({ isText: false }))).toBe(true)
  })
})

describe('slashShouldOpen', () => {
  it('never opens inside table cells', () => {
    expect(slashShouldOpen(fakeTr(null, true))).toBe(false)
  })
  it('otherwise follows atWordStart', () => {
    expect(slashShouldOpen(fakeTr(null))).toBe(true)
    expect(slashShouldOpen(fakeTr({ isText: true, text: 'แบ่ง 1' }))).toBe(false)
  })
})
