import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { ProjectHeader, ProjectOverview as Overview } from '@/lib/contracts/projects'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ProjectArchivedBanner, ProjectHeaderBar } from './ProjectHeaderBar'
import { ProjectOverview } from './ProjectOverview'

vi.mock('@/server/actions/projects', () => ({
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  unarchiveProject: vi.fn(),
  deleteProjectPermanently: vi.fn(),
  createProject: vi.fn(),
}))
vi.mock('@/server/actions/members', () => ({
  addMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/undo/useUndo', () => ({ useUndo: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ getJson: () => Promise.resolve({ people: [] }) }))
// M8 S4.2: the milestones section has its own test (ProjectMilestones.test.tsx)
vi.mock('./ProjectMilestones', () => ({ ProjectMilestones: () => null }))

const PID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'

function header(over: Partial<ProjectHeader> = {}): ProjectHeader {
  return {
    id: PID,
    name: 'POS Upgrade',
    code: 'POS',
    color: '#2F5597',
    certainty: 'CONFIRMED',
    certaintyNote: null,
    archived: false,
    client: { id: 'c1', name: 'Coral', code: null, color: null, archived: false },
    myRole: 'MANAGER',
    can: { manage: true, unarchive: false, delete: true },
    ...over,
  }
}

function overview(over: Partial<Overview> = {}, h: Partial<ProjectHeader> = {}): Overview {
  return {
    project: header(h),
    members: [
      {
        userId: 'cindy',
        name: 'Cindy C.',
        nickname: 'Cindy',
        positionName: null,
        color: null,
        active: true,
        role: 'LEAD',
      },
    ],
    warnings: { noLead: false },
    ...over,
  }
}

describe('ProjectOverview', () => {
  it('shows the "ยังไม่มี LEAD" warning when warnings.noLead', () => {
    renderWithProviders(<ProjectOverview data={overview({ warnings: { noLead: true }, members: [] })} />)
    expect(screen.getByText(th.projects.overview.noLead)).toBeInTheDocument()
    expect(screen.getByText(th.projects.overview.noLeadHint)).toBeInTheDocument()
  })

  it('managers see edit, the certainty toggle, archive and permanent delete; no load figures (X15)', () => {
    renderWithProviders(<ProjectOverview data={overview()} />)
    expect(screen.getByRole('heading', { name: th.projects.overview.infoHeading })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.projects.edit })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.projects.certainty.TENTATIVE })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.projects.archive })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.projects.deletePermanently })).toBeInTheDocument()
    expect(screen.queryByText(th.projects.overview.noLead)).not.toBeInTheDocument()
    expect(screen.getByText('Coral')).toBeInTheDocument()
  })

  it('archived projects hide Archive and Edit, offer unarchive to M/L and keep delete for managers', () => {
    renderWithProviders(
      <ProjectOverview
        data={overview({}, { archived: true, can: { manage: false, unarchive: true, delete: true } })}
      />,
    )
    expect(screen.queryByRole('button', { name: th.projects.archive })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.projects.edit })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.projects.certainty.TENTATIVE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.projects.unarchive })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.projects.deletePermanently })).toBeInTheDocument()
  })

  it('members (read-only) see no management controls and a text certainty', () => {
    renderWithProviders(
      <ProjectOverview
        data={overview(
          {},
          {
            certainty: 'TENTATIVE',
            certaintyNote: 'รอ PO',
            myRole: 'MEMBER',
            can: { manage: false, unarchive: false, delete: false },
          },
        )}
      />,
    )
    expect(screen.queryByRole('button', { name: th.projects.edit })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.projects.archive })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.projects.deletePermanently })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: th.projects.certainty.TENTATIVE })).toBeInTheDocument()
    expect(screen.getByText('รอ PO')).toBeInTheDocument()
  })
})

describe('ProjectHeaderBar (M6.1: the screen header bar)', () => {
  it('is the 48 px header bar: โปรเจค › name (the one <h1>), actions on the right', () => {
    renderWithProviders(<ProjectHeaderBar header={header({})} />)
    const bar = screen.getByTestId('page-header')
    expect(screen.getByTestId('project-header')).toContainElement(bar)
    const nav = within(bar).getByRole('navigation', { name: th.layout.breadcrumb })
    expect(within(nav).getByRole('link', { name: th.nav.projects })).toHaveAttribute('href', '/projects')
    expect(within(bar).getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(within(bar).getByRole('heading', { level: 1 })).toHaveTextContent('POS Upgrade')
    expect(
      within(screen.getByTestId('page-header-actions')).getByRole('link', { name: 'Coral' }),
    ).toBeInTheDocument()
  })

  it('shows the read-only banner (under the tabs) and archived chip for archived projects (text, not colour only)', () => {
    renderWithProviders(
      <>
        <ProjectHeaderBar
          header={header({ archived: true, can: { manage: false, unarchive: true, delete: true } })}
        />
        <ProjectArchivedBanner archived />
      </>,
    )
    expect(screen.getByText(th.projects.archivedBanner)).toBeInTheDocument()
    expect(screen.getByText(th.projects.archivedChip)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'POS Upgrade' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'POS Upgrade' })).toBeInTheDocument()
  })

  it('managers can rename inline; the client chip links to the client page', () => {
    renderWithProviders(<ProjectHeaderBar header={header({ certainty: 'TENTATIVE' })} />)
    expect(screen.getByRole('button', { name: 'POS Upgrade' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: th.projects.certainty.TENTATIVE })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Coral' })).toHaveAttribute('href', '/clients/c1')
    expect(screen.queryByText(th.projects.archivedBanner)).not.toBeInTheDocument()
  })
})
