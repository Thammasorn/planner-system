import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { WorkloadCellDetail } from '@/lib/contracts/workload'
import { qk } from '@/lib/query-keys'
import { P, U, cell } from './test-data.test.helper'
import { renderUi } from './render.test.helper'
import { WorkloadCellPanel } from './WorkloadCellPanel'

vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const week = '2026-10-19'
const TASK = '99999999-9999-4999-8999-999999999999'
const detail: WorkloadCellDetail = {
  userId: U.jack,
  name: 'Jack',
  week,
  cell: cell(500, 500, 400),
  items: [
    {
      kind: 'task',
      taskId: TASK,
      taskName: 'ออกแบบ flow ใหม่',
      parentPath: ['Phase 1'],
      projectId: P.mobile,
      projectName: 'Mobile App Revamp',
      projectColor: '#7C3AED',
      load: { total: 300, committed: 300 },
      certainty: 'CONFIRMED',
      completed: false,
      href: `/projects/${P.mobile}/plan?task=${TASK}`,
    },
    { kind: 'masked', label: th.masking.otherProjects, load: { total: 200, committed: 200 } },
  ],
}

function renderPanel(onClose = vi.fn()) {
  renderUi(
    <WorkloadCellPanel
      target={{ userId: U.jack, name: 'Jack', week, deactivated: false }}
      onClose={onClose}
    />,
    {
      seed: (qc) => qc.setQueryData(qk.workloadCell(U.jack, week), detail),
    },
  )
  return onClose
}

describe('WorkloadCellPanel (FR-1005, M9-D9)', () => {
  it('task items link to the project plan; the masked item has no link', () => {
    renderPanel()
    const panel = screen.getByRole('complementary', { name: th.workload.panel.title('Jack', '19/10') })
    expect(
      within(panel).getByRole('link', { name: th.workload.panel.openTask('ออกแบบ flow ใหม่') }),
    ).toHaveAttribute('href', `/projects/${P.mobile}/plan?task=${TASK}`)
    const masked = panel.querySelector('[data-item-kind="masked"]') as HTMLElement
    expect(within(masked).getByText(th.masking.otherProjects)).toBeInTheDocument()
    expect(within(masked).queryByRole('link')).toBeNull()
    expect(within(panel).getByRole('link', { name: th.workload.panel.openPerson })).toHaveAttribute(
      'href',
      `/people/${U.jack}/plan?week=${week}`,
    )
    expect(within(panel).getByRole('link', { name: th.tasks.openAsPage })).toHaveAttribute(
      'href',
      `/t/${TASK}`,
    )
  })

  it('Esc closes (calls onClose)', () => {
    const onClose = renderPanel()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

const originalMatchMedia = window.matchMedia
function stubViewport(narrow: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: narrow,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }))
}
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('WorkloadCellPanel layout (SPEC §9 browser row)', () => {
  it('renders nothing while closed (no off-screen paper in layout → no horizontal document scroll)', () => {
    const { container } = renderUi(<WorkloadCellPanel target={null} onClose={vi.fn()} />)
    expect(container.querySelector('.MuiDrawer-root, .MuiDrawer-docked, .MuiDrawer-paper')).toBeNull()
    expect(document.querySelector('.MuiDrawer-paper')).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('from md up: a docked side panel in the flow beside the table (no backdrop)', () => {
    stubViewport(false)
    renderPanel()
    const panel = screen.getByRole('complementary', { name: th.workload.panel.title('Jack', '19/10') })
    expect(panel.closest('[data-variant]')).toHaveAttribute('data-variant', 'side')
    expect(document.querySelector('.MuiBackdrop-root')).toBeNull()
  })

  it('below md: an overlay sheet with a backdrop that does not squeeze the table; backdrop click closes', () => {
    stubViewport(true)
    const onClose = renderPanel()
    // a modal sheet: MUI gives the paper role=dialog + aria-modal (focus is trapped inside it)
    const panel = screen.getByRole('dialog', { name: th.workload.panel.title('Jack', '19/10') })
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(panel.closest('[data-variant]')).toHaveAttribute('data-variant', 'sheet')
    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('below md: Esc calls onClose exactly once', () => {
    stubViewport(true)
    const onClose = renderPanel()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
