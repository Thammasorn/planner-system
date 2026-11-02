// src/components/palette/groups.tsx — result groups of the command palette (X88, M4-D37e). M6.1 adds the tasks group
// before M4's pages group; M8 renders its commands group before these; M10 completes FR-1102's order — projects, tasks,
// pages, people, clients — with an optional `source` and an optional `local` input (a superset of M4's shape, C60).
// M11 appends the ฐานข้อมูล group (database titles, row titles, row bodies) after them.
import type { ReactNode } from 'react'
import { ColorSquare } from '@/components/common/ProjectChip'
import { UserAvatar } from '@/components/common/UserAvatar'
import { th } from '@/i18n/th'
import type {
  DatabaseSearchHit,
  SearchAllResponse,
  SearchIndexClient,
  SearchIndexPerson,
  SearchIndexProject,
} from '@/lib/contracts/search'

export interface PaletteItem {
  /** Unique cmdk value (`page:<id>`): two hits with the same title never collide. */
  value: string
  href: string
  title: string
  subtitle?: string
  icon?: ReactNode
  chips?: string[]
}

/** M10 (M10-D21): projects / people / clients matched on the client from the search index. */
export interface LocalMatches {
  projects: SearchIndexProject[]
  people: SearchIndexPerson[]
  clients: SearchIndexClient[]
}

export interface PaletteGroupDef {
  key: keyof SearchAllResponse
  heading: string
  /** M10: 'local' groups use `local` and fall back to the server arrays when the index is unusable; absent = 'server'. */
  source?: 'local' | 'server'
  map(input: {
    server: Partial<SearchAllResponse> | undefined
    local?: LocalMatches | undefined
  }): PaletteItem[]
}

const projectItem = (
  p: Pick<SearchIndexProject, 'id' | 'name' | 'color' | 'archived' | 'tentative'>,
): PaletteItem => ({
  value: `project:${p.id}`,
  href: `/projects/${p.id}`,
  title: p.name,
  icon: <ColorSquare color={p.color} />,
  chips: [...(p.tentative ? [`◐ ${th.search.tentative}`] : []), ...(p.archived ? [th.search.archived] : [])],
})

const personItem = (p: SearchIndexPerson): PaletteItem => {
  const extra = [p.nickname && p.nickname !== p.name ? p.nickname : null, p.positionName].filter(
    (x): x is string => typeof x === 'string' && x !== '',
  )
  return {
    value: `person:${p.id}`,
    href: `/people/${p.id}`,
    title: p.name,
    ...(extra.length > 0 ? { subtitle: extra.join(' · ') } : {}),
    icon: <UserAvatar user={{ name: p.name, active: p.active }} size={20} />,
    chips: p.active ? [] : [th.search.deactivated],
  }
}

const clientItem = (c: SearchIndexClient): PaletteItem => ({
  value: `client:${c.id}`,
  href: `/clients/${c.id}`,
  title: c.name,
  chips: c.archived ? [th.search.archived] : [],
})

/** M11 (FR-1474, M11-D28): a database title / row title / row body hit; Enter opens the owner page with `?db=&row=`. */
export const databaseItem = (h: DatabaseSearchHit): PaletteItem => {
  const databaseTitle = h.databaseTitle || th.database.untitled
  return {
    value: `db:${h.rowId ?? h.databaseId}`,
    href: h.href,
    title: h.rowId !== null ? h.rowTitle || th.database.table.untitledRow : databaseTitle,
    subtitle: h.rowId !== null ? `${databaseTitle} · ${h.pageTitle}` : h.pageTitle,
    icon: h.rowId !== null ? '▤' : '▦',
    chips: h.matchedIn === 'content' ? [th.palette.matchedInRow] : [],
  }
}

export const PALETTE_GROUPS: readonly PaletteGroupDef[] = [
  {
    key: 'projects',
    heading: th.palette.groups.projects,
    source: 'local',
    map: ({ server, local }) =>
      local ? local.projects.map(projectItem) : (server?.projects ?? []).map(projectItem),
  },
  // FR-690 / M6.1-D14 (X88): tasks by name, then by body — before the pages group; Enter opens /t/<id>
  {
    key: 'tasks',
    heading: th.palette.groups.tasks,
    map: ({ server }) =>
      (server?.tasks ?? []).map((h) => ({
        value: `task:${h.id}`,
        href: h.href,
        title: h.name,
        subtitle: th.search.inProject(h.projectName),
        icon: h.completed ? '☑' : '☐',
        chips: [
          ...(h.matchedIn === 'content' ? [th.palette.matchedInContent] : []),
          ...(h.completed ? [th.palette.taskDone] : []),
          ...(h.projectArchived ? [th.palette.archived] : []),
        ],
      })),
  },
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
  {
    key: 'people',
    heading: th.palette.groups.people,
    source: 'local',
    map: ({ server, local }) =>
      local ? local.people.map(personItem) : (server?.people ?? []).map(personItem),
  },
  {
    key: 'clients',
    heading: th.palette.groups.clients,
    source: 'local',
    map: ({ server, local }) =>
      local ? local.clients.map(clientItem) : (server?.clients ?? []).map(clientItem),
  },
  // M11 (FR-1474, X88): appended after M10's groups
  {
    key: 'databases',
    heading: th.palette.groupDatabases,
    map: ({ server }) => (server?.databases ?? []).map(databaseItem),
  },
]
