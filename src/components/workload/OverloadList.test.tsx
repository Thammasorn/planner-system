import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { F23, U } from './test-data.test.helper'
import { OverloadList } from './OverloadList'

describe('OverloadList (FR-1006, M9-D10)', () => {
  it('F2+F3: 3 rows in server order; the fix link of Peter opens his plan at 5/10', () => {
    render(<OverloadList items={F23.overloads} />)
    const table = screen.getByRole('table', { name: th.workload.list.label })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Peter', 'Jack', 'Mint'])
    const peter = rows[0]!
    expect(within(peter).getByText(th.overload.level.OVER)).toBeInTheDocument()
    expect(within(peter).getByText(th.overload.excess('2.00'))).toBeInTheDocument()
    expect(within(peter).getByText(th.overload.cause.CAPACITY)).toBeInTheDocument()
    expect(
      within(peter).getByRole('link', { name: th.workload.list.fixLabel('Peter', '5 ต.ค. 2569') }),
    ).toHaveAttribute('href', `/people/${U.peter}/plan?week=2026-10-05`)
  })

  it('empty', () => {
    render(<OverloadList items={[]} />)
    expect(screen.getByText(th.workload.list.empty)).toBeInTheDocument()
  })
})
