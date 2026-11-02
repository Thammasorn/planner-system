// src/lib/search/normalize.ts — isomorphic query normalisation (M10-D26, M4-D37b). The bodies moved here from M4's
// services/search.ts, which re-exports normalizeQuery/escapeLike so M4 imports keep working. Used by the server's
// escaped ILIKE patterns and by the palette's local matcher (src/lib/search/match.ts) alike. Pure, no IO.

/** Content (body) matches need at least this many characters (X68, M4-D19). */
export const SEARCH_MIN_CONTENT_CHARS = 3
/** At most this many hits per palette category (X68). */
export const SEARCH_LIMIT_PER_CATEGORY = 8

/** NFC, strip U+200B–U+200D, U+2060, U+FEFF, collapse whitespace, trim. */
export function normalizeQuery(q: string): string {
  return q
    .normalize('NFC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Escape \ % _ with a backslash for ILIKE … ESCAPE '\'. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** normalizeQuery + Latin lower-case (Thai has no case); used for local matching and server patterns alike. */
export function foldForMatch(s: string): string {
  return normalizeQuery(s).replace(/[A-Z]/g, (c) => c.toLowerCase())
}
