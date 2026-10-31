// src/components/palette/groups.tsx — result groups of the command palette (X88, M4-D37e). M4 owns the pages group;
// M8 renders its commands group before these, M10 appends groups (optional `source`/`local` item fields, a superset of
// the `map` input) — keep the names, `key: keyof SearchResponse` and the `map` input object as they are.
import type { ReactNode } from 'react'
import { th } from '@/i18n/th'
import type { SearchResponse } from '@/lib/contracts/search'

export interface PaletteItem {
  /** Unique cmdk value (`page:<id>`): two hits with the same title never collide. */
  value: string
  href: string
  title: string
  subtitle?: string
  icon?: ReactNode
  chips?: string[]
}

export interface PaletteGroupDef {
  key: keyof SearchResponse
  heading: string
  map(input: { server: SearchResponse | undefined }): PaletteItem[]
}

export const PALETTE_GROUPS: readonly PaletteGroupDef[] = [
  {
    key: 'pages',
    heading: th.palette.groups.pages,
    map: ({ server }) =>
      (server?.pages ?? []).map((h) => ({
        value: `page:${h.id}`,
        href: h.href,
        title: h.title || th.pages.untitled,
        subtitle: h.subtitle,
        icon: h.icon ?? '📄',
        chips: h.matchedIn === 'content' ? [th.palette.matchedInContent] : [],
      })),
  },
]
