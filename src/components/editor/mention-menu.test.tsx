// S2.5 — mention menu items (FR-529, M4-D20): active people ranked, visible page hits, never rejects.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { SearchResponse } from '@/lib/contracts/search'
import { getMentionItems } from './mention-menu'
import type { AppEditor } from './schema'
import { makeTestQueryClient } from './render.test.helper'

const urlOf = (u: RequestInfo | URL): string =>
  typeof u === 'string' ? u : u instanceof URL ? u.href : u.url

const person = (id: string, name: string, over: Partial<PersonOption> = {}): PersonOption => ({
  id,
  name,
  nickname: null,
  positionId: null,
  positionName: null,
  color: null,
  active: true,
  ...over,
})
const PEOPLE = [
  person('u1', 'Cindy', { positionName: 'Dev' }),
  person('u2', 'Mice'),
  person('u3', 'Ivy', { positionName: 'QA' }),
  person('u4', 'Icarus', { active: false }),
]
const PAGE = '0c4d6a0e-7f3b-4c2a-9d1e-5b6a7c8d9e01'
const SEARCH: SearchResponse = {
  pages: [
    {
      kind: 'page',
      id: PAGE,
      title: 'Icon guide',
      icon: null,
      href: `/p/${PAGE}`,
      subtitle: 'Wiki',
      matchedIn: 'title',
    },
  ],
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('getMentionItems', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const editor = { insertInlineContent: vi.fn() } as unknown as AppEditor & {
    insertInlineContent: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input)
      if (url.startsWith('/api/people/options')) return Promise.resolve(ok({ people: PEOPLE }))
      if (url.startsWith('/api/search')) return Promise.resolve(ok(SEARCH))
      return Promise.resolve(new Response(null, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    editor.insertInlineContent.mockClear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('"Ic" → Ivy first, inactive people excluded, then page hits', async () => {
    const items = await getMentionItems(editor, makeTestQueryClient(), 'Ic')
    expect(items[0]?.title).toBe('Ivy')
    expect(items.map((i) => i.title)).not.toContain('Icarus')
    expect(items.map((i) => i.title)).toEqual(['Ivy', 'Mice', 'Icon guide'])
    expect(items.map((i) => i.group)).toEqual([
      th.editor.mention.groupPeople,
      th.editor.mention.groupPeople,
      th.editor.mention.groupPages,
    ])
    expect(fetchMock.mock.calls.some(([u]) => urlOf(u) === '/api/search?q=Ic&titleOnly=1')).toBe(true)
  })

  it('matches positions too', async () => {
    const items = await getMentionItems(editor, makeTestQueryClient(), 'QA')
    expect(items[0]?.title).toBe('Ivy')
  })

  it('empty query → active people only, no search request', async () => {
    const items = await getMentionItems(editor, makeTestQueryClient(), '')
    expect(items.map((i) => i.title).sort()).toEqual(['Cindy', 'Ivy', 'Mice'])
    expect(fetchMock.mock.calls.some(([u]) => urlOf(u).startsWith('/api/search'))).toBe(false)
  })

  it('clicking inserts a mention chip with the id only, plus a space', async () => {
    const items = await getMentionItems(editor, makeTestQueryClient(), 'Ic')
    items[0]!.onItemClick()
    expect(editor.insertInlineContent).toHaveBeenCalledWith([
      { type: 'mention', props: { kind: 'user', id: 'u3' } },
      ' ',
    ])
    items[2]!.onItemClick()
    expect(editor.insertInlineContent).toHaveBeenLastCalledWith([
      { type: 'mention', props: { kind: 'page', id: PAGE } },
      ' ',
    ])
  })

  it('fetch failure → [] (never rejects)', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await expect(getMentionItems(editor, makeTestQueryClient(), 'Ic')).resolves.toEqual([])
  })
})
