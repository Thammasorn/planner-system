import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import type { WorkloadParams } from '@/lib/contracts/workload'
import { qk } from '@/lib/query-keys'
import { F23, P, POS, U } from './test-data.test.helper'
import { renderUi } from './render.test.helper'
import { WorkloadPage } from './WorkloadPage'

const m = vi.hoisted(() => ({ getJson: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))

const DEFAULT: WorkloadParams = {
  from: '2026-09-28',
  to: '2026-12-21',
  positionId: null,
  projectId: null,
  onlyOver: false,
}
const SIDEBAR: SidebarResponse = {
  projects: [{ id: P.mobile, name: 'Mobile App Revamp', color: '#7C3AED', certainty: 'CONFIRMED' }],
  hasArchived: false,
  canCreateProject: true,
  myTaskCount: 0,
}

function renderPage(onSet = vi.fn()) {
  const r = renderUi(<WorkloadPage initialView="ALL" />, {
    onSetPreference: onSet,
    seed: (qc) => {
      qc.setQueryData(qk.workload(DEFAULT), F23)
      qc.setQueryData(qk.sidebar(), SIDEBAR)
    },
  })
  return { ...r, onSet }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/workload')
  m.getJson.mockClear()
})

describe('WorkloadPage (FR-1001…1006, §8.5)', () => {
  it('group headers in position order', () => {
    renderPage()
    const table = screen.getByRole('table', { name: th.workload.tableLabel })
    const groups = within(table)
      .getAllByRole('rowheader')
      .filter((h) => h.getAttribute('scope') === 'rowgroup')
      .map((h) => h.textContent)
    expect(groups).toEqual(['Project Manager', 'Developer', 'Designer', 'QA', 'Data'])
  })

  it('Jack 19/10 reads 125% (default PERCENT, M11.1) with the hidden OVER status; person links to the person page', () => {
    renderPage()
    const row = document.querySelector(`tr[data-user-id="${U.jack}"]`) as HTMLElement
    const btn = row.querySelector('[data-week="2026-10-19"]') as HTMLElement
    expect(btn).toHaveTextContent('125%')
    expect(btn).toHaveTextContent(th.overload.level.OVER)
    expect(within(row).getByRole('link', { name: 'Jack' })).toHaveAttribute('href', `/people/${U.jack}/plan`)
  })

  it('M11.1 FR-1002: the "% | วัน/capacity" toggle switches every cell to 5/4 and stores load.display', async () => {
    const user = userEvent.setup()
    const { onSet } = renderPage()
    const toolbar = screen.getByRole('toolbar', { name: th.workload.filters.label })
    await user.click(within(toolbar).getByRole('button', { name: th.loadDisplay.DAYS_long }))
    expect(onSet).toHaveBeenCalledWith('load.display', 'DAYS')
    const btn = document.querySelector(`tr[data-user-id="${U.jack}"] [data-week="2026-10-19"]`) as HTMLElement
    expect(btn).toHaveTextContent('5/4')
    expect(btn).toHaveAttribute('data-display', 'DAYS')
  })

  it('switching the view calls the preference setter and does not refetch', async () => {
    const user = userEvent.setup()
    const { onSet } = renderPage()
    await user.click(screen.getByRole('button', { name: th.workload.view.COMMITTED }))
    expect(onSet).toHaveBeenCalledWith('load.view', 'COMMITTED')
    const cindy = document.querySelector(`tr[data-user-id="${U.cindy}"] [data-week="2026-10-05"]`) as HTMLElement
    expect(cindy).toHaveTextContent(th.workload.cell.empty)
    expect(m.getJson).not.toHaveBeenCalled()
  })

  it('the overloads tab is labelled with the count and lists the rows', async () => {
    const user = userEvent.setup()
    renderPage()
    const tab = screen.getByRole('tab', { name: th.workload.tabs.overloads(3) })
    await user.click(tab)
    expect(screen.getByRole('table', { name: th.workload.list.label })).toBeInTheDocument()
  })

  it('filters write URL params', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('combobox', { name: th.workload.filters.position }))
    await user.click(await screen.findByRole('option', { name: 'Data' }))
    await waitFor(() => expect(window.location.search).toContain(`positionId=${POS.data}`))
    await user.click(screen.getByRole('checkbox', { name: th.workload.filters.onlyOver }))
    expect(window.location.search).toContain('onlyOver=1')
    await user.click(screen.getByRole('button', { name: th.workload.filters.clear }))
    expect(window.location.search).toBe('')
  })

  it('▶ moves the window by 4 weeks (from/to in the URL); สัปดาห์นี้ resets', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: th.workload.window.next }))
    expect(window.location.search).toContain('from=2026-10-26')
    expect(window.location.search).toContain('to=2027-01-18')
    await user.click(screen.getByRole('button', { name: th.workload.window.thisWeek }))
    expect(window.location.search).toBe('')
  })

  it('clicking a cell opens the side panel; Esc closes it', async () => {
    const user = userEvent.setup()
    renderPage()
    const btn = document.querySelector(
      `tr[data-user-id="${U.peter}"] [data-week="2026-10-05"]`,
    ) as HTMLElement
    await user.click(btn)
    expect(
      screen.getByRole('complementary', { name: th.workload.panel.title('Peter', '5/10') }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: th.workload.panel.title('Peter', '5/10') }),
      ).toBeNull(),
    )
  })

  it('roving focus: one tab stop, arrows move between cells', async () => {
    const user = userEvent.setup()
    renderPage()
    const table = screen.getByRole('table', { name: th.workload.tableLabel })
    const focusable = [...table.querySelectorAll('[data-wl-cell]')].filter(
      (b) => b.getAttribute('tabindex') === '0',
    )
    expect(focusable).toHaveLength(1)
    ;(focusable[0] as HTMLElement).focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toHaveAttribute('data-week', '2026-10-05')
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement?.closest('tr')).toHaveAttribute('data-user-id', U.mint)
  })
})
