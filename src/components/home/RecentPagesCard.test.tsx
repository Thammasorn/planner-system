import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { RecentPagesCard } from './RecentPagesCard'
import { CHARTER, homeResponse } from './test-data.test.helper'

describe('RecentPagesCard (FR-1101e, M10-D17)', () => {
  it('links to the page; project name; "Ivy แก้ 2 ชม.ที่แล้ว" against the response clock', () => {
    const d = homeResponse()
    renderWithProviders(<RecentPagesCard pages={d.recentPages} now={d.now} />)
    const card = screen.getByRole('region', { name: th.home.recentPages.title })
    expect(within(card).getByRole('link', { name: 'Project Charter' })).toHaveAttribute(
      'href',
      `/p/${CHARTER}`,
    )
    const item = within(card).getByRole('listitem')
    expect(item).toHaveTextContent('POS Upgrade')
    expect(item).toHaveTextContent(/Ivy แก้ .*2.*ชม\./)
  })

  it('a wiki page shows "Wiki ทีม"; an untitled page shows the untitled text; empty list text', () => {
    const d = homeResponse()
    const { unmount } = renderWithProviders(
      <RecentPagesCard pages={[{ ...d.recentPages[0]!, title: '', projectName: null }]} now={d.now} />,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent(th.palette.wiki)
    expect(screen.getByRole('link', { name: th.pages.untitled })).toBeInTheDocument()
    unmount()
    renderWithProviders(<RecentPagesCard pages={[]} now={d.now} />)
    expect(screen.getByText(th.home.recentPages.empty)).toBeInTheDocument()
  })
})
