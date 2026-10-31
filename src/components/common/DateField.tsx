'use client'
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
 */
export function DateField({ label, value, onChange, minDate, maxDate, disabled, error }: DateFieldProps) {
  const min = isoToDayjs(minDate ?? null)
  const max = isoToDayjs(maxDate ?? null)
  return (
    <DatePicker
      value={isoToDayjs(value)}
      onChange={(d) => onChange(dayjsToIso(d))}
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
