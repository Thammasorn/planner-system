// M6.1 S2 — task-body helpers: the hasBody rule (M6.1-D11 mirror of the SQL) and sub-page → page mention (FR-680,
// M6.1-D9). Node env: pure functions only.
import { describe, expect, it, vi } from 'vitest'
import {
  findSubpageBlocks,
  hasTaskBodyContent,
  replaceSubpagesWithMentions,
  subpageAsMention,
} from './task-body'

const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('hasTaskBodyContent (M6.1-D11: content_text <> "" or an image/file anywhere)', () => {
  it('empty / blank paragraphs → false', () => {
    expect(hasTaskBodyContent([])).toBe(false)
    expect(hasTaskBodyContent([{ type: 'paragraph' }, { type: 'paragraph', content: [] }])).toBe(false)
    expect(hasTaskBodyContent([{ type: 'paragraph', content: '   ' }])).toBe(false)
    expect(hasTaskBodyContent(null)).toBe(false)
  })

  it('text anywhere → true (incl. nested children and table cells)', () => {
    expect(hasTaskBodyContent([{ type: 'paragraph', content: 'x' }])).toBe(true)
    expect(
      hasTaskBodyContent([{ type: 'paragraph', children: [{ type: 'bulletListItem', content: 'ลูก' }] }]),
    ).toBe(true)
    expect(
      hasTaskBodyContent([
        {
          type: 'table',
          content: { type: 'tableContent', rows: [{ cells: [[{ type: 'text', text: 'a' }]] }] },
        },
      ]),
    ).toBe(true)
  })

  it('image-only or file-only bodies count (no text)', () => {
    expect(hasTaskBodyContent([{ type: 'image', props: { url: `/api/files/${PAGE}` } }])).toBe(true)
    expect(hasTaskBodyContent([{ type: 'paragraph', children: [{ type: 'file', props: {} }] }])).toBe(true)
  })

  it('a page mention alone is not indexed text → false (same as the server)', () => {
    expect(
      hasTaskBodyContent([
        { type: 'paragraph', content: [{ type: 'mention', props: { kind: 'page', id: PAGE } }] },
      ]),
    ).toBe(false)
  })
})

describe('sub-page blocks in a task body (FR-680)', () => {
  const doc = [
    { id: 'a', type: 'paragraph', content: [], children: [] },
    { id: 's1', type: 'subpage', props: { pageId: PAGE }, children: [] },
    {
      id: 'b',
      type: 'bulletListItem',
      content: [],
      children: [{ id: 's2', type: 'subpage', props: { pageId: '' }, children: [] }],
    },
  ]

  it('findSubpageBlocks finds them at any depth', () => {
    expect(
      findSubpageBlocks(doc)
        .map((b) => b.id)
        .sort(),
    ).toEqual(['s1', 's2'])
    expect(findSubpageBlocks([{ type: 'paragraph' }])).toEqual([])
    expect(findSubpageBlocks('nope')).toEqual([])
  })

  it('subpageAsMention → a paragraph with a page mention, children kept', () => {
    const kid = { id: 'k', type: 'paragraph', content: [], children: [] }
    expect(subpageAsMention({ props: { pageId: PAGE }, children: [kid] })).toEqual({
      type: 'paragraph',
      content: [{ type: 'mention', props: { kind: 'page', id: PAGE } }],
      children: [kid],
    })
  })

  it('a placeholder card (no page id yet) becomes an empty paragraph', () => {
    expect(subpageAsMention({ props: { pageId: '' } })).toEqual({
      type: 'paragraph',
      content: [],
      children: [],
    })
  })

  it('replaceSubpagesWithMentions replaces every card in the editor and reports it', () => {
    const replaceBlocks = vi.fn()
    const editor = { document: doc, replaceBlocks }
    expect(replaceSubpagesWithMentions(editor as never)).toBe(true)
    expect(replaceBlocks).toHaveBeenCalledTimes(2)
    const replaced = replaceBlocks.mock.calls.map((c) => (c[0] as string[])[0]).sort()
    expect(replaced).toEqual(['s1', 's2'])
    const s1 = replaceBlocks.mock.calls.find((c) => (c[0] as string[])[0] === 's1')!
    expect(s1[1]).toEqual([
      { type: 'paragraph', content: [{ type: 'mention', props: { kind: 'page', id: PAGE } }], children: [] },
    ])
  })

  it('no cards → no edit (returns false)', () => {
    const replaceBlocks = vi.fn()
    expect(replaceSubpagesWithMentions({ document: [doc[0]], replaceBlocks } as never)).toBe(false)
    expect(replaceBlocks).not.toHaveBeenCalled()
  })
})
