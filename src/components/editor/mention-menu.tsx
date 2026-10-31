'use client'
// src/components/editor/mention-menu.tsx — `@` mention menu (FR-529, M4-D20, r3 §5.3): active people from M2's
// people directory (filtered client-side by name / nickname / position) + visible pages from the title-only search
// (server-side masking). Opens only at word start ("cindy@corp.co.th" never opens it). getItems never rejects.
import { type DefaultReactSuggestionItem, SuggestionMenuController } from '@blocknote/react'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { type JSX, useCallback } from 'react'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { PeopleOptionsResponse } from '@/lib/contracts/people'
import type { SearchResponse } from '@/lib/contracts/search'
import { displayName } from '@/lib/display-name'
import { atWordStart, rankSuggestionItems } from '@/lib/editor/suggest'
import { sortPeople } from '@/lib/people/sort'
import { qk } from '@/lib/query-keys'
import type { AppEditor } from './schema'

export const MENTION_MAX_ITEMS = 20
const SEARCH_MAX_QUERY = 100 // searchQuerySchema

type MentionTarget = { kind: 'user' | 'page'; id: string }

function insertMention(editor: AppEditor, t: MentionTarget): void {
  editor.insertInlineContent([{ type: 'mention', props: { kind: t.kind, id: t.id } }, ' '])
}

async function peopleItems(editor: AppEditor, qc: QueryClient): Promise<DefaultReactSuggestionItem[]> {
  const res = await qc.query({
    queryKey: qk.peopleOptions(),
    queryFn: ({ signal }) => getJson<PeopleOptionsResponse>('/api/people/options', { signal }),
    staleTime: 5 * 60_000,
  })
  return sortPeople(res.people.filter((p) => p.active)).map((p) => ({
    title: displayName(p),
    subtext: p.positionName ?? undefined,
    aliases: [p.name, p.nickname, p.positionName].filter(
      (x): x is string => typeof x === 'string' && x !== '',
    ),
    group: th.editor.mention.groupPeople,
    onItemClick: () => insertMention(editor, { kind: 'user', id: p.id }),
  }))
}

async function pageItems(
  editor: AppEditor,
  qc: QueryClient,
  q: string,
): Promise<DefaultReactSuggestionItem[]> {
  const res = await qc.query({
    queryKey: qk.search(q, 'title'),
    queryFn: ({ signal }) =>
      getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&titleOnly=1`, { signal }),
    staleTime: 30_000,
  })
  return res.pages.map((hit) => ({
    title: hit.title || th.editor.subpage.untitled,
    subtext: hit.subtitle,
    icon: <span aria-hidden>{hit.icon ?? '📄'}</span>,
    group: th.editor.mention.groupPages,
    onItemClick: () => insertMention(editor, { kind: 'page', id: hit.id }),
  }))
}

/** People (ranked by the query) first, then the server's page hits; at most MENTION_MAX_ITEMS. Never rejects. */
export async function getMentionItems(
  editor: AppEditor,
  qc: QueryClient,
  query: string,
): Promise<DefaultReactSuggestionItem[]> {
  const q = query.trim()
  const [people, pages] = await Promise.all([
    peopleItems(editor, qc).catch((): DefaultReactSuggestionItem[] => []),
    q === '' || q.length > SEARCH_MAX_QUERY
      ? Promise.resolve<DefaultReactSuggestionItem[]>([])
      : pageItems(editor, qc, q).catch((): DefaultReactSuggestionItem[] => []),
  ])
  return [...rankSuggestionItems(people, q), ...pages].slice(0, MENTION_MAX_ITEMS)
}

export function MentionMenu({ editor }: { editor: AppEditor }): JSX.Element {
  const qc = useQueryClient()
  const getItems = useCallback((q: string) => getMentionItems(editor, qc, q), [editor, qc])
  return <SuggestionMenuController triggerCharacter="@" shouldOpen={atWordStart} getItems={getItems} />
}
