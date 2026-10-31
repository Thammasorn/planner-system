import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
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

/** A controlled parent like LeaveDialog: stores whatever ISO (or null) the field emits. */
function StatefulField({ initial, onIso }: { initial: string; onIso: (v: string | null) => void }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">
      <DateField
        label="start"
        value={value}
        onChange={(v) => {
          setValue(v)
          onIso(v)
        }}
      />
    </LocalizationProvider>
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

  it('keeps the other sections while the Buddhist-era year is typed digit by digit (controlled parent)', async () => {
    const user = userEvent.setup()
    const onIso = vi.fn()
    const { container } = render(<StatefulField initial="2026-09-30" onIso={onIso} />)
    const [day, month, year] = screen.getAllByRole('spinbutton')
    await user.click(day!)
    await user.keyboard('20')
    await user.click(month!)
    await user.keyboard('10')
    await user.click(year!)
    await user.keyboard('2569')
    expect(container.querySelector('input')?.value.replace(/[\u200e\u200f\u2066-\u2069]/g, '')).toBe('20/10/2569')
    expect(onIso).toHaveBeenLastCalledWith('2026-10-20')
  })
})
