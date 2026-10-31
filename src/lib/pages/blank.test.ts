import { describe, expect, it } from 'vitest'
import { isBlankPage } from './blank'

describe('isBlankPage', () => {
  it.each<[string, { title: string; content: unknown }, boolean]>([
    ['empty doc', { title: '', content: [] }, true],
    ['one empty paragraph', { title: '', content: [{ type: 'paragraph', content: [] }] }, true],
    [
      'BlockNote empty paragraph',
      { title: '', content: [{ id: 'x', type: 'paragraph', props: {}, content: [], children: [] }] },
      true,
    ],
    [
      'empty text run',
      { title: '', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
      true,
    ],
    ['text', { title: '', content: [{ type: 'paragraph', content: 'x' }] }, false],
    ['title', { title: 'a', content: [] }, false],
    [
      'table',
      { title: '', content: [{ type: 'table', content: { type: 'tableContent', rows: [] } }] },
      false,
    ],
    [
      'paragraph with children',
      { title: '', content: [{ type: 'paragraph', children: [{ type: 'paragraph' }] }] },
      false,
    ],
    [
      'mention',
      { title: '', content: [{ type: 'paragraph', content: [{ type: 'mention', props: {} }] }] },
      false,
    ],
    ['not an array', { title: '', content: null }, false],
  ])('%s', (_name, page, expected) => {
    expect(isBlankPage(page)).toBe(expected)
  })
})
