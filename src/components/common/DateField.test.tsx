import { render, screen } from '@testing-library/react'
import { AdapterDayjsBuddhist } from '@mui/x-date-pickers/AdapterDayjsBuddhist'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import 'dayjs/locale/th'
import { describe, expect, it, vi } from 'vitest'
import { DateField, dayjsToIso, isoToDayjs } from './DateField'

function renderField(value: string | null, error?: string) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
      <DateField label="due" value={value} onChange={vi.fn()} {...(error ? { error } : {})} />
    </LocalizationProvider>,
  )
}

describe('DateField (X50, BR-04)', () => {
  it('round-trips an ISO date through Dayjs', () => {
    expect(dayjsToIso(isoToDayjs('2026-09-30'))).toBe('2026-09-30')
    expect(dayjsToIso(isoToDayjs('2024-02-29'))).toBe('2024-02-29')
  })

  it('round-trips null and rejects invalid dayjs values', () => {
    expect(isoToDayjs(null)).toBeNull()
    expect(dayjsToIso(null)).toBeNull()
    expect(dayjsToIso(isoToDayjs('2026-13-45'))).toBeNull()
  })

  it('shows a plan date in the Buddhist era', () => {
    const { container } = renderField('2026-09-30')
    const input = container.querySelector('input')
    expect(input?.value).toBe('30/09/2569')
  })

  it('shows the error text', () => {
    renderField('2026-09-30', 'bad')
    expect(screen.getByText('bad')).toBeInTheDocument()
  })
})
