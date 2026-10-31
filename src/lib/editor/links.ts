// src/lib/editor/links.ts — where a clicked editor link goes (r3 G17): same-origin paths open in-app (router.push),
// everything else safe opens in a new tab; unsafe hrefs (javascript:, //host, …) go nowhere. Pure.
import { isSafeHref } from '@/lib/schemas/page-content'

export type LinkTarget = { kind: 'internal'; path: string } | { kind: 'external'; href: string } | null

export function resolveLinkTarget(href: string, origin: string): LinkTarget {
  if (!isSafeHref(href)) return null
  const h = href.trim()
  if (h.startsWith('/')) return { kind: 'internal', path: h }
  try {
    const u = new URL(h)
    if (u.origin === origin) return { kind: 'internal', path: `${u.pathname}${u.search}${u.hash}` }
  } catch {
    return null
  }
  return { kind: 'external', href: h }
}
