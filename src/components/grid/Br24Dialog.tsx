'use client'
// src/components/grid/Br24Dialog.tsx — the BR-24 choice dialog (SPEC §5.3 BR-24, §4.8, M7-D3/D4). Editing the total of
// a DAY week: "ปรับตามสัดส่วนเดิม" (SCALE, largest remainder + spill, preview from the domain) or "เปลี่ยนเป็นรายสัปดาห์"
// (COLLAPSE). One dialog for every pair of a gesture; Esc = Cancel (drops only those pairs). This is the SPEC-mandated
// choice, not a confirm dialog. MUI Dialog traps focus and returns it to the grid on close.
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useId } from 'react'
import type { DayCtx } from '@/domain/allocation'
import { daysOfWeek, isoWeekday } from '@/domain/dates'
import { formatCd } from '@/domain/units'
import type { Cd } from '@/domain/types'
import { th } from '@/i18n/th'
import type { OnDayWeekConflict } from '@/lib/contracts/grid'
import { previewChoice, type ConflictPair } from '@/lib/grid/br24'
import { formatThaiDate } from '@/lib/format'
import styles from './grid.module.css'

const MAX_LINES = 5
const days1 = (cd: Cd) => formatCd(cd, { unit: 'DAYS', decimals: 1 }) || '0'

/** "จ 0.5 · อ 0.5 · พ 1.0" — the non-empty days of a week, 1 decimal. */
export function formatDayParts(week: string, days: readonly Cd[]): string {
  return daysOfWeek(week)
    .map((d, i) => [d, days[i] ?? 0] as const)
    .filter(([, cd]) => cd > 0)
    .map(([d, cd]) => `${th.calendar.weekdays[isoWeekday(d) - 1]} ${days1(cd)}`)
    .join(' · ')
}

export interface Br24DialogProps {
  open: boolean
  pairs: readonly ConflictPair[]
  nameOf: (userId: string) => string
  ctxOf: (pair: ConflictPair) => DayCtx
  onChoose: (choice: OnDayWeekConflict) => void
  onCancel: () => void
}

export function Br24Dialog(p: Br24DialogProps) {
  const titleId = useId()
  const first = p.pairs[0]
  const scale = first ? previewChoice(first, p.ctxOf(first), 'SCALE') : null
  const scaleParts = scale && scale.ok && 'days' in scale ? formatDayParts(first!.week, scale.days) : null
  return (
    <Dialog
      open={p.open && first !== undefined}
      onClose={p.onCancel}
      aria-labelledby={titleId}
      maxWidth="sm"
      fullWidth
      data-testid="br24-dialog"
    >
      <DialogTitle id={titleId}>{th.grid.br24.title(p.pairs.length)}</DialogTitle>
      <DialogContent dividers>
        {first && p.pairs.length === 1 ? (
          <>
            <p className={styles.br24Line}>{th.grid.br24.breakdown(formatDayParts(first.week, first.days))}</p>
            <p className={styles.br24Line}>{th.grid.br24.change(days1(first.fromCd), days1(first.toCd))}</p>
          </>
        ) : (
          <ul className={styles.br24List}>
            {p.pairs.slice(0, MAX_LINES).map((x) => (
              <li key={`${x.taskAssignmentId}|${x.week}`}>
                {th.grid.br24.pairLine(p.nameOf(x.userId), formatThaiDate(x.week), days1(x.fromCd), days1(x.toCd))}
              </li>
            ))}
            {p.pairs.length > MAX_LINES ? <li>{th.grid.br24.more(p.pairs.length - MAX_LINES)}</li> : null}
          </ul>
        )}
        <div className={styles.br24Choices}>
          <Button
            variant="contained"
            onClick={() => p.onChoose('SCALE')}
            className={styles.br24Choice}
            data-testid="br24-scale"
            autoFocus
          >
            <span className={styles.br24ChoiceTitle}>{th.grid.br24.scale}</span>
            <span>{th.grid.br24.scaleHint}</span>
            {scaleParts ? <span>{th.grid.br24.scalePreview(scaleParts)}</span> : null}
          </Button>
          <Button
            variant="outlined"
            onClick={() => p.onChoose('COLLAPSE')}
            className={styles.br24Choice}
            data-testid="br24-collapse"
          >
            <span className={styles.br24ChoiceTitle}>{th.grid.br24.collapse}</span>
            <span>{th.grid.br24.collapseHint}</span>
            {first ? <span>{th.grid.br24.collapsePreview(days1(first.toCd))}</span> : null}
          </Button>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onCancel} data-testid="br24-cancel">
          {th.grid.br24.cancel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
