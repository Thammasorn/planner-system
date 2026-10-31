// S2.2 — stored JSON → safe BlockNote initialContent; foreign media detection (r3 G3/G12, M4-D9).
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import complexDoc from './__fixtures__/complex-doc.json'
import { findForeignMedia, foreignMediaReplacement, prepareInitialContent } from './sanitize'

const V4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('prepareInitialContent', () => {
  it('[] and non-arrays → undefined (BlockNote throws on [])', () => {
    expect(prepareInitialContent([])).toBeUndefined()
    expect(prepareInitialContent(null)).toBeUndefined()
    expect(prepareInitialContent({ type: 'paragraph' })).toBeUndefined()
  })

  it('unknown block types become a paragraph with their text', () => {
    expect(prepareInitialContent([{ type: 'nope', content: 'x' }])).toEqual([
      { type: 'paragraph', content: 'x' },
    ])
  })

  it('keeps valid neighbours of an invalid block', () => {
    expect(
      prepareInitialContent([
        { type: 'heading', props: { level: 2 }, content: 'h' },
        { type: 'heading', props: { level: 7 }, content: 'bad' },
      ]),
    ).toEqual([
      { type: 'heading', props: { level: 2 }, content: 'h' },
      { type: 'paragraph', content: 'bad' },
    ])
  })

  it('external images become link paragraphs', () => {
    const out = prepareInitialContent([{ type: 'image', props: { url: 'https://x/c.png', name: 'แมว' } }])
    expect(out).toEqual([
      { type: 'paragraph', content: [{ type: 'link', href: 'https://x/c.png', content: 'แมว' }] },
    ])
  })

  it('a real BlockNote document round-trips unchanged', () => {
    expect(prepareInitialContent(complexDoc)).toEqual(complexDoc)
  })
})

describe('findForeignMedia', () => {
  it('finds nested external images and ignores same-origin / empty ones', () => {
    const doc = [
      { id: 'a', type: 'image', props: { url: `/api/files/${V4}` }, children: [] },
      {
        id: 'b',
        type: 'bulletListItem',
        props: {},
        children: [{ id: 'c', type: 'image', props: { url: 'https://evil/x.png' }, children: [] }],
      },
      { id: 'd', type: 'file', props: { url: '' }, children: [] },
      { id: 'e', type: 'file', props: { url: 'data:text/plain,hi' }, children: [] },
    ]
    expect(findForeignMedia(doc).sort()).toEqual(['c', 'e'])
    expect(findForeignMedia(complexDoc)).toEqual([])
    expect(findForeignMedia('x')).toEqual([])
  })
})

describe('foreignMediaReplacement', () => {
  it('http(s) → link paragraph; anything else → the name; children kept', () => {
    expect(
      foreignMediaReplacement({ type: 'image', props: { url: 'https://x/c.png', name: '' }, children: [] }),
    ).toEqual({
      type: 'paragraph',
      content: [{ type: 'link', href: 'https://x/c.png', content: th.editor.pasteImageLinkFallback }],
      children: [],
    })
    expect(foreignMediaReplacement({ type: 'file', props: { url: 'data:x', name: 'a.txt' } })).toEqual({
      type: 'paragraph',
      content: 'a.txt',
      children: [],
    })
  })
})
