// GridToolbar (M7.1 review, §8.12 / §4.16, SPEC §9 phone): three wrapping groups; ‹ วันนี้ › stay together on one line.
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { GridToolbar } from './GridToolbar'
import { renderGrid } from './render.test.helper'

function setup() {
  renderGrid(
    <GridToolbar
      start={<button type="button">view-switch</button>}
      view="ALL"
      unit="DAYS"
      showCompleted={false}
      saveState="idle"
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onToday={vi.fn()}
      onView={vi.fn()}
      onUnit={vi.fn()}
      onShowCompleted={vi.fn()}
      zoom="WEEK"
      onZoom={vi.fn()}
      showAssignees
      onShowAssignees={vi.fn()}
      chartOpen={false}
      onChart={vi.fn()}
    />,
  )
  return screen.getByRole('toolbar', { name: th.grid.toolbar.label })
}

describe('GridToolbar groups (M7.1 review)', () => {
  it('view · filters · overlays, in that order, then the save status', () => {
    const bar = setup()
    const groups = [...bar.querySelectorAll(':scope > [data-toolbar-group]')].map((g) =>
      g.getAttribute('data-toolbar-group'),
    )
    expect(groups).toEqual(['view', 'filters', 'overlays'])
    const view = bar.querySelector<HTMLElement>('[data-toolbar-group="view"]')!
    expect(within(view).getByRole('button', { name: 'view-switch' })).toBeInTheDocument()
    expect(within(view).getByRole('group', { name: th.grid.toolbar.zoom })).toBeInTheDocument()
    const overlays = bar.querySelector<HTMLElement>('[data-toolbar-group="overlays"]')!
    expect(within(overlays).getByRole('button', { name: th.loadChart.toggle })).toBeInTheDocument()
    expect(bar.lastElementChild).toHaveAttribute('role', 'status')
  })

  it('‹ วันนี้ › share one no-wrap box (a chevron is never stranded on its own line)', () => {
    setup()
    const nav = screen.getByTestId('toolbar-nav')
    expect([...nav.children].map((c) => c.getAttribute('aria-label') ?? c.textContent)).toEqual([
      th.grid.toolbar.prev,
      th.grid.toolbar.today,
      th.grid.toolbar.next,
    ])
  })

  it('the zoom toggle is the same segmented control as the view switch (no separate outlined pills)', () => {
    setup()
    for (const name of [th.grid.toolbar.zoomWeek, th.grid.toolbar.zoomDay]) {
      const b = screen.getByRole('button', { name })
      expect(b.className).toMatch(/MuiToggleButton-root/)
      expect(b.className).not.toMatch(/toolbarToggle/)
    }
  })
})
