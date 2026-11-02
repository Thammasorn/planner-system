// src/domain/database/url.ts — FR-1410 link cells: http://, https:// or mailto: only, no control characters.
import { DB_LIMITS } from './limits'

const SCHEME_RE = /^(?:https?:\/\/[^\s/]|mailto:\S)/i
/** C0 control characters and DEL. */
const CONTROL_RE = /[\u0000-\u001f\u007f]/

/** True for a link the UI may render as `<a target="_blank" rel="noopener noreferrer">` (`javascript:` → false). */
export function isDbUrl(s: string): boolean {
  return s.length <= DB_LIMITS.text && !CONTROL_RE.test(s) && SCHEME_RE.test(s)
}
