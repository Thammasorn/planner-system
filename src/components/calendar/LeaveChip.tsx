'use client'
import type { CSSProperties } from 'react'
import Tooltip from '@mui/material/Tooltip'
import { th } from '@/i18n/th'
import type { CalendarPerson, CalendarTimeOff, CalendarTimeOffFull } from '@/lib/contracts/calendar'
import styles from './MonthGrid.module.css'

/** "Peter · ลาพักร้อน (เช้า)" — the visible text of a leave chip (never colour alone, A11Y-1). Masked entries carry
 *  only the server's label ("ลา"); a deactivated person gets the "(ปิดใช้งาน)" suffix. */
export function chipText(entry: CalendarTimeOff, person: CalendarPerson | undefined): string {
  const name = person
    ? person.active
      ? person.displayName
      : `${person.displayName} ${th.users.deactivatedSuffix}`
    : ''
  const label = entry.kind === 'full' ? entry.leaveTypeName : entry.label
  const text = th.calendar.leaveOf(name, label)
  return entry.half ? `${text} (${th.calendar.half[entry.half]})` : text
}

export interface LeaveChipProps {
  entry: CalendarTimeOff
  person: CalendarPerson | undefined
  /** Full entries (manager or owner) open the edit dialog; masked chips are not interactive (M5-D13). */
  onOpen: (e: CalendarTimeOffFull) => void
  /** Roving focus: chips of the focused day are tabbable, the others are reached by moving to their day. */
  tabIndex?: number
}

/**
 * One leave entry on a calendar day (FR-907, M5-D13): striped background (`--timeoff`) + text, a 4 px start border in
 * the leave-type colour for full entries (colour is decoration only, M5-D10). Masked chips use the neutral stripe
 * and show a tooltip explaining why details are hidden.
 */
export function LeaveChip({ entry, person, onOpen, tabIndex }: LeaveChipProps) {
  const text = chipText(entry, person)
  if (entry.kind === 'masked') {
    return (
      <Tooltip title={th.calendar.maskedHint} describeChild>
        <span className={styles.chip} data-chip="masked" data-half={entry.half ?? undefined}>
          {text}
        </span>
      </Tooltip>
    )
  }
  const style: CSSProperties = { borderInlineStartColor: entry.leaveTypeColor }
  return (
    <button
      type="button"
      className={styles.chip}
      data-chip="full"
      data-half={entry.half ?? undefined}
      style={style}
      tabIndex={tabIndex}
      onClick={() => onOpen(entry)}
    >
      {text}
    </button>
  )
}
