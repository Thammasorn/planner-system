'use client'
import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import type { ISODate } from '@/domain/types'

dayjs.extend(customParseFormat)

const ISO_FORMAT = 'YYYY-MM-DD'

/** The only ISO ↔ Dayjs conversion in the app (X50, r1 §9). Strict parse; local midnight (round-trip stable). */
export function isoToDayjs(iso: ISODate | null): Dayjs | null {
  return iso ? dayjs(iso, ISO_FORMAT, true) : null
}

export function dayjsToIso(d: Dayjs | null): ISODate | null {
  return d && d.isValid() ? d.format(ISO_FORMAT) : null
}

export interface DateFieldProps {
  label: string
  value: ISODate | null
  onChange: (v: ISODate | null) => void
  minDate?: ISODate | undefined
  maxDate?: ISODate | undefined
  disabled?: boolean | undefined
  error?: string | undefined
}

/**
 * Plan date input (FR-601, BR-04): MUI X DatePicker + AdapterDayjsBuddhist (the provider in AppProviders) shows
 * "30/09/2569"; the value in and out is an ISO string. Clearing gives null.
 *
 * While a section is being typed (e.g. the year 2 → 25 → 256 → 2569) the picker emits intermediate invalid dates,
 * which reach the parent as `null`. Handing `null` back would make MUI X treat it as an outside change and clear
 * every section, so the field keeps the last Dayjs it emitted and passes it back as long as the parent's ISO
 * still equals that Dayjs's ISO; any other parent value is an outside change and wins.
 */
export function DateField({ label, value, onChange, minDate, maxDate, disabled, error }: DateFieldProps) {
  const [emitted, setEmitted] = useState<Dayjs | null>(null)
  const min = isoToDayjs(minDate ?? null)
  const max = isoToDayjs(maxDate ?? null)
  const shown = emitted !== null && dayjsToIso(emitted) === value ? emitted : isoToDayjs(value)
  return (
    <DatePicker
      value={shown}
      onChange={(d) => {
        setEmitted(d)
        onChange(dayjsToIso(d))
      }}
      disabled={Boolean(disabled)}
      {...(min ? { minDate: min } : {})}
      {...(max ? { maxDate: max } : {})}
      slotProps={{
        textField: { size: 'small', label, error: Boolean(error), helperText: error, fullWidth: true },
        field: { clearable: true },
      }}
    />
  )
}
