import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CurrentUserContext } from '@/hooks/useCurrentUser'
import { th } from '@/i18n/th'
import type { ClientDetail } from '@/lib/contracts/clients'
import type { ClientLoadResponse } from '@/lib/contracts/workload'
import type { ProjectListItem } from '@/lib/contracts/projects'
import { qk } from '@/lib/query-keys'
import { MANAGER, WORKER } from '../pages/render.test.helper'
import { renderUi } from '../workload/render.test.helper'
import { ClientDetailView } from './ClientDetailView'

vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))
vi.mock('./useClientArchive', () => ({ useClientArchive: () => ({ archive: vi.fn(), unarchive: vi.fn() }) }))
vi.mock('./ClientFormDialog', () => ({ ClientFormDialog: () => null }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/clients/c1',
}))

const POS = '11111111-1111-4111-8111-111111111111'
const DW = '22222222-2222-4222-8222-222222222222'
const project = (id: string, name: string): ProjectListItem =>
  ({
    id,
    name,
    color: '#B45309',
    certainty: 'CONFIRMED',
    archived: false,
    client: null,
    leads: [],
    memberCount: 3,
  }) as unknown as ProjectListItem

const detail: ClientDetail = {
  client: { id: 'c1', name: 'Coral', code: null, color: null, archived: false, note: null },
  projects: [project(POS, 'POS Upgrade'), project(DW, 'Data Warehouse')],
  can: { manage: false },
}
// Coral as cindy (e2e W11): only POS is visible → 17.50
const load: ClientLoadResponse = {
  clientId: 'c1',
  weeks: [],
  sum: { total: 1750, committed: 1500 },
  projects: [{ projectId: POS, sum: { total: 1750, committed: 1500 } }],
}

function renderClient(user = WORKER) {
  renderUi(
    <CurrentUserContext value={user}>
      <ClientDetailView detail={detail} />
    </CurrentUserContext>,
    { seed: (qc) => qc.setQueryData(qk.clientLoad('c1'), load) },
  )
}

describe('Client load (FR-303 load part, M9-D20)', () => {
  it('worker: total line + visibleOnly; the column shows per-project sums and – for none', () => {
    renderClient()
    const line = screen.getByTestId('client-load')
    expect(line).toHaveTextContent(th.workload.clientLoad.total('17.50'))
    expect(line).toHaveTextContent(th.workload.clientLoad.visibleOnly)
    const table = screen.getByRole('table', { name: th.clients.projectsHeading })
    expect(
      within(table).getByRole('columnheader', { name: th.workload.clientLoad.column }),
    ).toBeInTheDocument()
    const pos = within(table).getByTestId(`project-row-${POS}`)
    expect(pos.querySelector('[data-col="load"]')).toHaveTextContent(th.workload.tooltip.days('17.50'))
    const dw = within(table).getByTestId(`project-row-${DW}`)
    expect(dw.querySelector('[data-col="load"]')).toHaveTextContent(th.workload.cell.empty)
  })

  it('manager: no visibleOnly note', () => {
    renderClient(MANAGER)
    expect(screen.getByTestId('client-load')).not.toHaveTextContent(th.workload.clientLoad.visibleOnly)
  })
})
