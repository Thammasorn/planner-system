import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addWeeks } from '@/domain/dates'
import { th } from '@/i18n/th'
import type { ProjectLoadResponse } from '@/lib/contracts/workload'
import { qk } from '@/lib/query-keys'
import { renderUi } from '../workload/render.test.helper'
import { ProjectLoadSection } from './ProjectLoadSection'

vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const PID = '11111111-1111-4111-8111-111111111111'
const weeks = Array.from({ length: 12 }, (_, i) => addWeeks('2026-09-28', i))
// POS Upgrade from 2026-09-28 as cindy sees it (e2e W11): Cindy 2.50, Ivy 3.75, Mint 11.25; 14/12 tentative only
const POS: ProjectLoadResponse = {
  projectId: PID,
  archived: false,
  weeks,
  members: [
    {
      userId: 'u-cindy',
      name: 'Cindy',
      role: 'LEAD',
      active: true,
      thisWeek: { total: 250, committed: 250 },
      sum: { total: 250, committed: 250 },
    },
    {
      userId: 'u-ivy',
      name: 'Ivy',
      role: 'MEMBER',
      active: true,
      thisWeek: { total: 250, committed: 250 },
      sum: { total: 375, committed: 375 },
    },
    {
      userId: 'u-mint',
      name: 'Mint',
      role: 'MEMBER',
      active: true,
      thisWeek: { total: 0, committed: 0 },
      sum: { total: 1125, committed: 875 },
    },
  ],
  weekly: Object.fromEntries(
    weeks.map((w) => [
      w,
      w === '2026-12-14'
        ? { total: 250, committed: 0 }
        : w === '2026-09-28'
          ? { total: 500, committed: 500 }
          : { total: 125, committed: 125 },
    ]),
  ),
  sum: { total: 1750, committed: 1500 },
}

function renderSection(d: ProjectLoadResponse) {
  renderUi(<ProjectLoadSection projectId={PID} />, { seed: (qc) => qc.setQueryData(qk.projectLoad(PID), d) })
}

describe('ProjectLoadSection (FR-409 load part, M9-D19)', () => {
  it('member sums in days, 12 bars, the 14/12 bar labelled committed 0.00', () => {
    renderSection(POS)
    expect(screen.getByRole('heading', { name: th.workload.projectLoad.heading })).toBeInTheDocument()
    const mint = document.querySelector('tr[data-user-id="u-mint"]') as HTMLElement
    expect(within(mint).getByTestId('member-sum')).toHaveTextContent('11.25')
    const cindy = document.querySelector('tr[data-user-id="u-cindy"]') as HTMLElement
    expect(within(cindy).getByTestId('member-sum')).toHaveTextContent('2.50')
    expect(within(cindy).getByText(th.members.roles.LEAD)).toBeInTheDocument()
    const bars = within(screen.getByRole('list', { name: th.workload.projectLoad.barsLabel })).getAllByRole(
      'listitem',
    )
    expect(bars).toHaveLength(12)
    expect(
      screen.getByRole('listitem', { name: th.workload.projectLoad.bar('14/12', '2.50', '0.00') }),
    ).toBeInTheDocument()
    expect(screen.getByText(th.workload.projectLoad.legendTentative)).toBeInTheDocument()
  })

  it('archived → the note only', () => {
    renderSection({ ...POS, archived: true, members: [], weekly: {}, sum: { total: 0, committed: 0 } })
    expect(screen.getByText(th.workload.projectLoad.archived)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: th.workload.projectLoad.barsLabel })).toBeNull()
  })

  it('no plans → empty', () => {
    renderSection({ ...POS, members: [], weekly: {}, sum: { total: 0, committed: 0 } })
    expect(screen.getByText(th.workload.projectLoad.empty)).toBeInTheDocument()
  })
})
