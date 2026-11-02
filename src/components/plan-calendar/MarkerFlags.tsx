'use client'
// ⚑ plan-marker flags on their date (FR-820, §8.13): glyph in the marker colour + label + the colour name for AT.
import { th } from '@/i18n/th'
import type { PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { formatThaiDate } from '@/lib/format'
import { markerVar } from '@/lib/theme/tokens'
import styles from './PlanCalendar.module.css'

export function MarkerFlags({ markers }: { markers: readonly PlanMarkerDTO[] | undefined }) {
  if (!markers || markers.length === 0) return null
  return (
    <>
      {markers.map((m) => {
        const name = th.planMarkers.flag(m.label, formatThaiDate(m.date))
        return (
          <span
            key={m.id}
            className={styles.flag}
            title={name}
            data-marker={m.id}
            data-color={m.color}
            style={{ color: markerVar(m.color) }}
          >
            <span aria-hidden="true" className={styles.flagGlyph}>
              ⚑
            </span>
            <span className={styles.srOnly}>{`${th.planMarkers.color[m.color]} ${name}`}</span>
            {m.label ? (
              <span aria-hidden="true" className={styles.flagText}>
                {m.label}
              </span>
            ) : null}
          </span>
        )
      })}
    </>
  )
}

