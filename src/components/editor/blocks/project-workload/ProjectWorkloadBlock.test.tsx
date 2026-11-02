// M10 S3.5 — the "ภาระทีมโปรเจค" block (FR-1303, AC-1303, M10-D3/D11/D31): M9 cells and tooltip with masking, view
// switch on the client (no refetch) that writes the prop, F4-like RISK cell, archived note, wiki placeholder, labels.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cell } from '@/components/workload/test-data.test.helper'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { EmbedWorkloadResponse } from '@/lib/contracts/embed'
import type { ProjectWorkloadProps } from '@/lib/schemas/page-content'
import { renderWithClient } from '../../render.test.helper'
import { ProjectWorkloadBlock } from './ProjectWorkloadBlock'

vi.mock('@/lib/api', () => ({ getJson: vi.fn() }))
const fetchJson = vi.mocked(getJson)

const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const POS = '11111111-1111-4111-8111-111111111111'
const WEEKS = [
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
  '2026-11-23',
]
const empty = () => Object.fromEntries(WEEKS.map((w) => [w, cell(0, 0, 500)]))

/** Mint: 2.5/5 all in a project the viewer cannot see; Cindy: F4-like 2.5 tentative on a 2-day week (RISK). */
function answer(
  over: Partial<Extract<EmbedWorkloadResponse, { kind: 'project' }>> = {},
): EmbedWorkloadResponse {
  return {
    kind: 'project',
    projectId: POS,
    projectName: 'POS Upgrade',
    archived: false,
    workloadHref: `/workload?projectId=${POS}`,
    weeks: WEEKS,
    projects: { [POS]: { name: 'POS Upgrade', color: '#2F5597' } },
    people: [
      {
        userId: 'u-cindy',
        name: 'Cindy',
        deactivated: false,
        cells: {
          ...empty(),
          '2026-10-12': cell(250, 0, 200, { byProject: [{ projectId: POS, total: 250, committed: 0 }] }),
        },
      },
      {
        userId: 'u-mix',
        name: 'Mint',
        deactivated: false,
        cells: {
          ...empty(),
          '2026-10-05': cell(250, 250, 500, { byProject: [{ projectId: null, total: 250, committed: 250 }] }),
        },
      },
    ],
    ...over,
  }
}

function Block({
  editable = true,
  onWrite,
}: {
  editable?: boolean
  onWrite?: (p: Partial<ProjectWorkloadProps>) => void
}) {
  const [props, setProps] = useState<ProjectWorkloadProps>({ view: 'ALL' })
  return (
    <UndoProvider>
      <ProjectWorkloadBlock
        pageId={PAGE}
        props={props}
        editable={editable}
        onPropsChange={(next) => {
          onWrite?.(next)
          setProps((p) => ({ ...p, ...next }))
        }}
      />
    </UndoProvider>
  )
}

const cellOf = (name: string, week: string) =>
  within(screen.getByRole('row', { name: new RegExp(name) })).getAllByRole('button')[WEEKS.indexOf(week)]!

beforeEach(() => fetchJson.mockReset())

describe('projectWorkload block (FR-1303, AC-1303)', () => {
  it('Mint 2.5/5 with the masked part as งานในโปรเจคอื่น; no hidden project name anywhere', async () => {
    fetchJson.mockResolvedValue(answer())
    renderWithClient(<Block />)
    await screen.findByTestId('embed-workload-table')
    expect(fetchJson).toHaveBeenCalledWith(`/api/pages/${PAGE}/embed/workload`, expect.anything())
    const mint = cellOf('Mint', '2026-10-05')
    expect(mint).toHaveTextContent('2.5/5')
    fireEvent.pointerOver(mint)
    const tip = await screen.findByTestId('workload-tooltip')
    expect(within(tip).getByText(new RegExp(th.masking.otherProjects))).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Data Warehouse|Mobile/)
  })

  it('F4-like Cindy (250/0/200) in view ALL → over tone + ⚠', async () => {
    fetchJson.mockResolvedValue(answer())
    renderWithClient(<Block />)
    await screen.findByTestId('embed-workload-table')
    const cindy = cellOf('Cindy', '2026-10-12')
    expect(cindy).toHaveAttribute('data-tone', 'over')
    expect(cindy).toHaveTextContent(th.overload.glyph.RISK)
  })

  it('switching to แน่นอน recolours without a new fetch and writes props.view', async () => {
    fetchJson.mockResolvedValue(answer())
    const onWrite = vi.fn()
    renderWithClient(<Block onWrite={onWrite} />)
    await screen.findByTestId('embed-workload-table')
    expect(cellOf('Cindy', '2026-10-12')).toHaveTextContent('2.5/2')
    fireEvent.click(screen.getByRole('button', { name: th.editor.liveBlocks.workload.view.COMMITTED }))
    expect(onWrite).toHaveBeenCalledWith({ view: 'COMMITTED' })
    await waitFor(() => expect(cellOf('Cindy', '2026-10-12')).toHaveTextContent(th.workload.cell.empty))
    expect(fetchJson).toHaveBeenCalledTimes(1)
  })

  it('a read-only viewer switches the view locally without writing', async () => {
    fetchJson.mockResolvedValue(answer())
    const onWrite = vi.fn()
    renderWithClient(<Block editable={false} onWrite={onWrite} />)
    await screen.findByTestId('embed-workload-table')
    fireEvent.click(screen.getByRole('button', { name: th.editor.liveBlocks.workload.view.AT_RISK }))
    expect(onWrite).not.toHaveBeenCalled()
    expect(cellOf('Cindy', '2026-10-12')).toHaveAttribute('data-palette', 'tentative')
  })

  it('archived → the note above a table that still renders', async () => {
    fetchJson.mockResolvedValue(answer({ archived: true }))
    renderWithClient(<Block />)
    expect(await screen.findByText(th.editor.liveBlocks.workloadArchived)).toBeInTheDocument()
    expect(screen.getByTestId('embed-workload-table')).toBeInTheDocument()
  })

  it('no people → noMembers', async () => {
    fetchJson.mockResolvedValue(answer({ people: [] }))
    renderWithClient(<Block />)
    expect(await screen.findByText(th.editor.liveBlocks.workload.noMembers)).toBeInTheDocument()
  })

  it('wiki → the placeholder', async () => {
    fetchJson.mockResolvedValue({ kind: 'wiki' })
    renderWithClient(<Block />)
    expect(await screen.findByText(th.editor.liveBlocks.wikiOnly)).toBeInTheDocument()
    expect(screen.queryByTestId('embed-workload-table')).toBeNull()
  })

  it('every cell has M9 accessible label; the link opens the team workload', async () => {
    fetchJson.mockResolvedValue(answer())
    renderWithClient(<Block />)
    const table = await screen.findByTestId('embed-workload-table')
    const cells = within(table).getAllByRole('button')
    expect(cells).toHaveLength(16)
    for (const c of cells) expect(c.getAttribute('aria-label')).toBeTruthy()
    expect(within(table).getAllByRole('columnheader')).toHaveLength(9)
    expect(screen.getByRole('link', { name: th.editor.liveBlocks.openWorkload })).toHaveAttribute(
      'href',
      `/workload?projectId=${POS}`,
    )
  })
})
