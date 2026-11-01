import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import { th } from '@/i18n/th'
import styles from './StatusGlyph.module.css'
import { VisuallyHidden } from './VisuallyHidden'

/** M6 kinds (FR-807/808, BR-20a, §8.9). M7 adds 'over' | 'risk'. */
export type StatusGlyphKind = 'leave' | 'holiday' | 'tentative' | 'dayDetail' | 'noCapacity'

const GLYPHS: Readonly<Record<Exclude<StatusGlyphKind, 'leave'>, string>> = {
  holiday: '🎌',
  tentative: '◐',
  dayDetail: '⋯',
  noCapacity: '▨',
}

/**
 * A state glyph with its text alternative (never colour alone, A11Y-1): the glyph is aria-hidden and a
 * visually-hidden label (default `th.grid.glyph[kind]`) is read instead. Plain spans + one CSS Module class, so it is
 * cheap enough for dense grid cells (PLAN §3.9).
 */
export function StatusGlyph({ kind, label }: { kind: StatusGlyphKind; label?: string }) {
  return (
    <>
      <span className={styles[kind]} aria-hidden="true" data-glyph={kind}>
        {kind === 'leave' ? <EventBusyOutlined fontSize="inherit" /> : GLYPHS[kind]}
      </span>
      <VisuallyHidden>{label ?? th.grid.glyph[kind]}</VisuallyHidden>
    </>
  )
}
