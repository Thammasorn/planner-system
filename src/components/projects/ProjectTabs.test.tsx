import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { PROJECT_TABS } from './project-tabs'
import { ProjectTabs } from './ProjectTabs'

const nav = vi.hoisted(() => ({ segment: null as string | null }))
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => nav.segment }))

const ID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'

describe('ProjectTabs', () => {
  it('renders exactly one tab, ภาพรวม, selected on the overview segment (FR-408 part, X15)', () => {
    nav.segment = 'overview'
    renderWithProviders(<ProjectTabs projectId={ID} />)
    expect(screen.getByRole('tablist', { name: th.projects.tabsLabel })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(PROJECT_TABS.length)
    expect(tabs).toHaveLength(1)
    const tab = screen.getByRole('tab', { name: th.projects.tabs.overview })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveAttribute('href', `/projects/${ID}/overview`)
    expect(tab).not.toHaveAttribute('aria-disabled')
  })

  it('selects nothing on an unknown segment', () => {
    nav.segment = null
    renderWithProviders(<ProjectTabs projectId={ID} />)
    expect(screen.getByRole('tab', { name: th.projects.tabs.overview })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })
})
