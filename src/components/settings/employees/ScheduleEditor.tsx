'use client'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { FractionCd, Weekday } from '@/domain/types'
import { cdToNumeric } from '@/domain/units'
import { th } from '@/i18n/th'
import type { ScheduleDayDTO } from '@/lib/contracts/users'
import { FRACTION_CD } from '@/lib/schemas/employees'

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly Weekday[]

export interface ScheduleRowState {
  weekday: Weekday
  works: boolean
  fractionCd: FractionCd
}

function asFraction(cd: number): FractionCd {
  return (FRACTION_CD as readonly number[]).includes(cd) ? (cd as FractionCd) : 100
}

/** Stored days → 7 editor rows (unticked days keep 1.00 ready for when they are ticked). */
export function scheduleState(days: readonly { weekday: number; fractionCd: number }[]): ScheduleRowState[] {
  return WEEKDAYS.map((weekday) => {
    const d = days.find((x) => x.weekday === weekday)
    return { weekday, works: d !== undefined, fractionCd: d ? asFraction(d.fractionCd) : 100 }
  })
}

/** Editor rows → the action's `schedule` (ticked days only). */
export function scheduleValue(
  state: readonly ScheduleRowState[],
): { weekday: Weekday; fractionCd: FractionCd }[] {
  return state.filter((r) => r.works).map((r) => ({ weekday: r.weekday, fractionCd: r.fractionCd }))
}

/** Table summary (E2E-07): "จ อ พ(0.50) พฤ" — weekday shorts, fraction only when it is not a full day. */
export function scheduleSummary(days: readonly ScheduleDayDTO[]): string {
  return [...days]
    .sort((a, b) => a.weekday - b.weekday)
    .map((d) => {
      const short = th.employees.schedule.weekdayShort[d.weekday]
      return d.fractionCd === 100 ? short : `${short}(${cdToNumeric(d.fractionCd)})`
    })
    .join(' ')
}

/**
 * FR-207 / X60: weekday toggles 1–7 × {0.25, 0.5, 0.75, 1.0}, at least one day; default Mon–Fri 1.00.
 * Each day is a labelled checkbox + a native select (keyboard friendly, fully labelled).
 */
export function ScheduleEditor({
  value,
  onChange,
  errors,
}: {
  value: readonly ScheduleRowState[]
  onChange: (next: ScheduleRowState[]) => void
  errors?: string[] | undefined
}) {
  const update = (weekday: Weekday, patch: Partial<ScheduleRowState>) =>
    onChange(value.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)))
  const hasError = Boolean(errors?.length)
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <Typography component="legend" variant="subtitle2" sx={{ mb: 0.5 }}>
        {th.employees.fields.schedule}
      </Typography>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, auto) minmax(140px, 1fr)',
          gap: 'calc(var(--space-1) / 2) var(--space-4)',
        }}
      >
        {value.map((r) => {
          const day = th.employees.schedule.weekdayLong[r.weekday]
          return (
            <div key={r.weekday} style={{ display: 'contents' }}>
              <FormControlLabel
                label={day}
                control={
                  <Checkbox
                    size="small"
                    checked={r.works}
                    onChange={(e) => update(r.weekday, { works: e.target.checked })}
                    slotProps={{ input: { 'aria-label': `${th.employees.schedule.works} ${day}` } }}
                  />
                }
              />
              <TextField
                select
                size="small"
                value={r.fractionCd}
                disabled={!r.works}
                onChange={(e) => update(r.weekday, { fractionCd: asFraction(Number(e.target.value)) })}
                slotProps={{
                  select: { native: true },
                  htmlInput: { 'aria-label': `${th.employees.schedule.fraction} ${day}` },
                }}
              >
                {FRACTION_CD.map((cd) => (
                  <option key={cd} value={cd}>
                    {th.employees.schedule.fractions[cd]}
                  </option>
                ))}
              </TextField>
            </div>
          )
        })}
      </div>
      {hasError ? (
        <FormHelperText error>
          {errors?.map((m) => (
            <span key={m} style={{ display: 'block' }}>
              {m}
            </span>
          ))}
        </FormHelperText>
      ) : null}
    </fieldset>
  )
}
