import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import type { TimeOffImpact } from '@/lib/contracts/time-off'
import { formatThaiDate } from '@/lib/format'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ImpactPanel } from './ImpactPanel'

const impact = (weeks: TimeOffImpact['weeks']): TimeOffImpact => ({
  userId: 'u-p',
  userName: 'Peter',
  weeks,
  overloads: [],
  onTimeOffDays: [],
})

describe('ImpactPanel (FR-906 capacity part, M5-D5)', () => {
  it('lists every changed week as "สัปดาห์ <d>: X → Y วัน" under the person heading', () => {
    renderWithProviders(
      <ImpactPanel impact={impact([{ weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 }])} />,
    )
    expect(screen.getByRole('heading', { name: th.capacity.impactTitle })).toBeInTheDocument()
    expect(screen.getByText(th.capacity.impactFor('Peter'))).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      th.capacity.impactLine(formatThaiDate('2026-10-05'), '5.00', '3.00'),
    ])
    expect(screen.queryByText(th.capacity.noImpact)).toBeNull()
  })

  it('weeks without a change → only noImpact', () => {
    renderWithProviders(
      <ImpactPanel impact={impact([{ weekStart: '2026-10-19', beforeCd: 400, afterCd: 400 }])} />,
    )
    expect(screen.getByText(th.capacity.noImpact)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('a two-week move shows both lines in week order; unchanged weeks are skipped', () => {
    renderWithProviders(
      <ImpactPanel
        impact={impact([
          { weekStart: '2026-10-12', beforeCd: 500, afterCd: 450 },
          { weekStart: '2026-10-05', beforeCd: 300, afterCd: 500 },
          { weekStart: '2026-10-19', beforeCd: 500, afterCd: 500 },
        ])}
      />,
    )
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      th.capacity.impactLine(formatThaiDate('2026-10-05'), '3.00', '5.00'),
      th.capacity.impactLine(formatThaiDate('2026-10-12'), '5.00', '4.50'),
    ])
  })
})

describe('ImpactPanel FR-906 overload lines (M9-D18, X23)', () => {
  const F3: TimeOffImpact = {
    ...impact([{ weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 }]),
    overloads: [
      {
        week: '2026-10-05',
        before: { level: 'OK', excessCd: 0 },
        after: { level: 'OVER', excessCd: 200, cause: 'CAPACITY' },
        load: { total: 500, committed: 500 },
        capacityCd: 300,
        standardCd: 500,
        parts: [{ projectId: 'p-dw', name: 'Data Warehouse', load: { total: 500, committed: 500 } }],
        href: '/people/u-p/plan?week=2026-10-05',
      },
    ],
  }

  it('F3: "สัปดาห์ 5 ต.ค. 2569: ล้น เกิน 2.00 วัน — เพราะลา/วันหยุด" with parts and a fix link', () => {
    renderWithProviders(<ImpactPanel impact={F3} />)
    expect(screen.getByRole('heading', { name: th.overload.impact.heading })).toBeInTheDocument()
    const line = th.overload.impact.line(
      formatThaiDate('2026-10-05'),
      th.overload.level.OVER,
      th.overload.excess('2.00'),
      th.overload.cause.CAPACITY,
    )
    expect(line).toBe('สัปดาห์ 5 ต.ค. 2569: ล้น เกิน 2.00 วัน — เพราะลา/วันหยุด')
    const item = screen.getByText(line).closest('li') as HTMLElement
    expect(within(item).getByText(th.overload.impact.part('Data Warehouse', '5.00'))).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: th.overload.impact.fix })).toHaveAttribute(
      'href',
      '/people/u-p/plan?week=2026-10-05',
    )
  })

  it('same level, larger excess → the "worse" line', () => {
    renderWithProviders(
      <ImpactPanel
        impact={{
          ...F3,
          overloads: [{ ...F3.overloads[0]!, before: { level: 'OVER', excessCd: 100 } }],
        }}
      />,
    )
    expect(
      screen.getByText(
        th.overload.impact.worse(formatThaiDate('2026-10-05'), th.overload.level.OVER, '1.00', '2.00'),
      ),
    ).toBeInTheDocument()
  })

  it('empty overloads render nothing extra', () => {
    renderWithProviders(
      <ImpactPanel impact={impact([{ weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 }])} />,
    )
    expect(screen.queryByRole('heading', { name: th.overload.impact.heading })).toBeNull()
    expect(screen.queryByText(/วันที่ลา/)).toBeNull()
  })

  it('onTimeOffDays [{100}] renders allocatedOnTimeOff("1.00")', () => {
    renderWithProviders(
      <ImpactPanel impact={{ ...impact([]), onTimeOffDays: [{ date: '2026-10-05', cd: 100 }] }} />,
    )
    expect(screen.getByText(th.grid.warn.allocatedOnTimeOff('1.00'))).toBeInTheDocument()
  })
})
