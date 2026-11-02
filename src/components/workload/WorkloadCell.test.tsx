import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LoadView } from '@/domain/types'
import { th } from '@/i18n/th'
import type { WorkloadCell as WorkloadCellDTO } from '@/lib/contracts/workload'
import { F23, P, cell } from './test-data.test.helper'
import { WorkloadCell, isDeactivatedWeek } from './WorkloadCell'
import { WorkloadTooltipHost } from './WorkloadTooltip'

// F4: Cindy 12/10 — 2.5 d tentative work on a 2 d week (leave 12–14/10) → RISK, cause CAPACITY, red in view ALL (r8 G7)
const cindyF4 = cell(250, 0, 200, { byProject: [{ projectId: P.pos, total: 250, committed: 0 }] })

function renderCell(
  c: WorkloadCellDTO,
  view: LoadView,
  o: { deactivated?: boolean; onOpen?: () => void } = {},
) {
  return render(
    <WorkloadCell
      name="Cindy"
      week="2026-10-12"
      cell={c}
      view={view}
      projects={F23.projects}
      deactivated={o.deactivated ?? false}
      onOpen={o.onOpen}
    />,
  )
}

describe('WorkloadCell (FR-1002/1003, BR-40/45, M9-D6/D7)', () => {
  it('F4 Cindy in view ALL: over tone, 2.5/2, ⚠ glyph + hidden RISK text', () => {
    renderCell(cindyF4, 'ALL')
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('data-tone', 'over')
    expect(btn).toHaveAttribute('data-level', 'RISK')
    expect(btn).toHaveTextContent('2.5/2')
    expect(btn).toHaveTextContent(th.overload.glyph.RISK)
    expect(btn).toHaveTextContent(th.overload.level.RISK)
    expect(btn.getAttribute('aria-label')).toContain(th.overload.level.RISK)
    expect(btn.getAttribute('aria-label')).toContain(th.overload.cause.CAPACITY)
  })

  it('view COMMITTED: text "–" but the ⚠ glyph stays (glyph follows BR-40, X67)', () => {
    renderCell(cindyF4, 'COMMITTED')
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent(th.workload.cell.empty)
    expect(btn).toHaveTextContent(th.overload.glyph.RISK)
    expect(btn.getAttribute('aria-label')).toContain(th.workload.cell.emptyLabel)
  })

  it('view AT_RISK uses the tentative palette', () => {
    renderCell(cindyF4, 'AT_RISK')
    expect(screen.getByRole('button')).toHaveAttribute('data-palette', 'tentative')
    expect(screen.getByRole('button')).toHaveTextContent('2.5/2')
  })

  it('capacity 0 → stripes; OK cells have no glyph', () => {
    renderCell(cell(0, 0, 0), 'ALL')
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('data-no-capacity', 'true')
    expect(btn).toHaveAttribute('data-tone', 'noCapacity')
    expect(btn).not.toHaveTextContent(th.overload.glyph.RISK)
  })

  it('a deactivated OVER week says ปิดใช้งาน instead of the cause', () => {
    renderCell(cell(500, 500, 0, { standard: 500 }), 'ALL', { deactivated: true })
    const label = screen.getByRole('button').getAttribute('aria-label') ?? ''
    expect(label).toContain(th.overload.cause.DEACTIVATED)
    expect(label).not.toContain(th.overload.cause.CAPACITY)
  })

  it('A11Y-1: every coloured state carries text', () => {
    for (const c of [cell(100, 100, 500), cell(450, 450, 500), cell(600, 600, 500), cell(300, 0, 500)]) {
      const { unmount } = renderCell(c, 'ALL')
      const btn = screen.getByRole('button')
      expect(btn.textContent).not.toBe('')
      expect(btn.getAttribute('aria-label')).toBeTruthy()
      unmount()
    }
  })

  it('click calls onOpen', () => {
    const onOpen = vi.fn()
    renderCell(cindyF4, 'ALL', { onOpen })
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('isDeactivatedWeek: the week containing the date and later', () => {
    expect(isDeactivatedWeek(null, '2026-10-05')).toBe(false)
    expect(isDeactivatedWeek('2026-10-07', '2026-09-28')).toBe(false)
    expect(isDeactivatedWeek('2026-10-07', '2026-10-05')).toBe(true)
    expect(isDeactivatedWeek('2026-10-07', '2026-10-12')).toBe(true)
  })
})

describe('WorkloadTooltipHost (FR-1002, M9-D8/D25)', () => {
  const peter = F23.groups[4]!.people[0]!
  const week = '2026-10-05'

  function renderHost(c: WorkloadCellDTO, deactivated = false) {
    return render(
      <WorkloadTooltipHost
        resolve={() => ({ name: 'Peter', week, cell: c, projects: F23.projects, deactivated })}
      >
        <WorkloadCell
          name="Peter"
          week={week}
          cell={c}
          view="ALL"
          projects={F23.projects}
          deactivated={deactivated}
        />
      </WorkloadTooltipHost>,
    )
  }

  it('Peter F3: hover shows the breakdown with the CAPACITY cause; Esc hides it', async () => {
    renderHost(peter.cells[week]!)
    fireEvent.pointerOver(screen.getByRole('button'))
    const tip = await screen.findByTestId('workload-tooltip')
    expect(
      within(tip).getByText(new RegExp(th.overload.cause.CAPACITY.replace('/', '\\/'))),
    ).toBeInTheDocument()
    expect(within(tip).getByText(/Data Warehouse/)).toBeInTheDocument()
    expect(within(tip).getByText(th.workload.tooltip.capacity('3.00', '5.00'))).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('workload-tooltip')).toBeNull()
  })

  it('hidden projects fold into one งานในโปรเจคอื่น line; focus also opens it', async () => {
    renderHost(cell(300, 300, 500, { byProject: [{ projectId: null, total: 300, committed: 300 }] }))
    fireEvent.focus(screen.getByRole('button'))
    const tip = await screen.findByTestId('workload-tooltip')
    expect(within(tip).getByText(new RegExp(th.masking.otherProjects))).toBeInTheDocument()
  })

  it('a deactivated OVER week shows ปิดใช้งาน', async () => {
    renderHost(cell(500, 500, 0), true)
    fireEvent.pointerOver(screen.getByRole('button'))
    const tip = await screen.findByTestId('workload-tooltip')
    expect(within(tip).getByText(new RegExp(th.overload.cause.DEACTIVATED))).toBeInTheDocument()
  })
})
