// tests/authz/rows/_m4.ts — shared helpers for the four M4 rows files (pages, wiki, files, search; plan/m04 S4.1).
// No rows here. Expectation shapes follow SPEC §3.2 (PERM-16…19) and X41/X42: invisible → 404, visible but not
// allowed (protected wiki page, archived project) → 403. Route handlers are called directly with M2's callRoute
// (request origin http://t); the multipart upload goes through tests/helpers/files.ts#uploadRequest.
import { eq } from 'drizzle-orm'
import { POST as POST_FILE } from '@/app/api/files/route'
import { GET as GET_FILE } from '@/app/api/files/[id]/route'
import { PUT as PUT_CONTENT } from '@/app/api/pages/[id]/content/route'
import { DELETE as LOCK_DELETE, GET as LOCK_GET, POST as LOCK_POST } from '@/app/api/pages/[id]/lock/route'
import { GET as GET_PAGE } from '@/app/api/pages/[id]/route'
import { GET as GET_TITLES } from '@/app/api/pages/titles/route'
import { GET as GET_TREE } from '@/app/api/pages/tree/route'
import { GET as GET_SEARCH } from '@/app/api/search/route'
import { db } from '@/server/db/client'
import { pages } from '@/server/db/schema'
import { uploadRequest, type UploadRequestOptions } from '../../helpers/files'
import type { World, WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'

/** PERM-16: the team of P (and A) may; the outsider never sees the project (404). */
export const PROJ = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<Role, Outcome>
/** X42: every write on archived A is 403 for everyone who can see it. */
export const ARCH_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const satisfies Record<Role, Outcome>
/** PERM-17 / PERM-18: every logged-in user. */
export const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const satisfies Record<
  Role,
  Outcome
>
/** PERM-18 on a protected wiki page, PERM-19 (ล็อก/ปลดล็อก): manager only; workers 403 (the wiki is visible). */
export const MGR = { M: 'allow', L: '403', Me: '403', W: '403' } as const satisfies Record<Role, Outcome>
/** M4-D31 / BR-33 style cross-scope input: only the manager sees both pages (→ 400); everyone else 404. */
export const CROSS = { M: '400', L: '404', Me: '404', W: '404' } as const satisfies Record<Role, Outcome>
/** The same outcome for every role. */
export const each = (o: Outcome): Record<Role, Outcome> => ({ M: o, L: o, Me: o, W: o })

/** World parts of every M4 row (files implies pages). */
export const PAGES = ['pages', 'files'] as const satisfies readonly WorldPart[]

/** A different origin than the request's (M4-D18 `assertSameOrigin`). */
export const FOREIGN_ORIGIN = 'https://evil.example'

/** Audit expectations (X44, M4-D38): entity + the page's project (omitted projectId ⇒ null = wiki). */
export const auditPageP = { entity: 'page', projectId: (w: World) => w.P.id } as const
export const auditPageA = { entity: 'page', projectId: (w: World) => w.A.id } as const
export const auditPageWiki = { entity: 'page' } as const
export const auditFileP = { entity: 'file', projectId: (w: World) => w.P.id } as const
export const auditFileA = { entity: 'file', projectId: (w: World) => w.A.id } as const
export const auditFileWiki = { entity: 'file' } as const

/** One partial paragraph block (M4-D8: partial blocks are valid content). */
export const para = (text: string): { type: 'paragraph'; content: string }[] => [
  { type: 'paragraph', content: text },
]

/** M4-D9: a `javascript:` link is rejected by zod (before authz). */
export const unsafeLinkContent = (): unknown[] => [
  { type: 'paragraph', content: [{ type: 'link', href: 'javascript:alert(1)', content: 'คลิก' }] },
]

export const pageGet = (id: string): Promise<Response> => callRoute(GET_PAGE, `/api/pages/${id}`, { id })

export const treeGet = (query: string): Promise<Response> => callRoute(GET_TREE, `/api/pages/tree?${query}`)

export const titlesGet = (ids: readonly string[] | string): Promise<Response> =>
  callRoute(GET_TITLES, `/api/pages/titles?ids=${typeof ids === 'string' ? ids : ids.join(',')}`)

export const searchGet = (query: string): Promise<Response> => callRoute(GET_SEARCH, `/api/search?${query}`)

const LOCK = { GET: LOCK_GET, POST: LOCK_POST, DELETE: LOCK_DELETE } as const

export const lockCall = (
  method: 'GET' | 'POST' | 'DELETE',
  id: string,
  q = '',
  headers?: HeadersInit,
): Promise<Response> => callRoute(LOCK[method], `/api/pages/${id}/lock${q}`, { id }, { method, headers })

/** Keepalive leave-page save (M4-D2): `PUT /api/pages/[id]/content` with a JSON body. */
export const keepalive = (id: string, body: unknown, headers?: Record<string, string>): Promise<Response> =>
  callRoute(
    PUT_CONTENT,
    `/api/pages/${id}/content`,
    { id },
    {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    },
  )

export const fileGet = (id: string): Promise<Response> => callRoute(GET_FILE, `/api/files/${id}`, { id })

export const upload = async (o: UploadRequestOptions): Promise<Response> =>
  POST_FILE(await uploadRequest(o), { params: Promise.resolve({}) })

/** Current `pages.version` (setup reads it instead of hard-coding 1). */
export const currentVersion = async (pageId: string): Promise<number> => {
  const [row] = await db.select({ v: pages.version }).from(pages).where(eq(pages.id, pageId))
  if (!row) throw new Error(`currentVersion: no page ${pageId}`)
  return row.v
}
