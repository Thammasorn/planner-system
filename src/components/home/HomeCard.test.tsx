import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ManagerOverloadCard } from './ManagerCards'
import { RecentPagesCard } from './RecentPagesCard'
import { MANAGER, homeResponse } from './test-data.test.helper'

// SPEC §4.16 / §8.12 (M10 review): home links never show the browser-default blue/purple underline.
describe('home card links use the app tokens, not browser defaults', () => {
  it('header action links: accent (primary) colour, no underline at rest', () => {
    renderWithProviders(<ManagerOverloadCard overloaded={MANAGER.overloaded} />)
    const action = screen.getByRole('link', { name: th.home.manager.openWorkload })
    expect(action).toHaveStyle({ textDecoration: 'none' })
    expect(getComputedStyle(action).color).toBe('var(--mui-palette-primary-main)')
  })

  it('item title links (overloaded person, recent page): primary text, no underline at rest', () => {
    const { unmount } = renderWithProviders(<ManagerOverloadCard overloaded={MANAGER.overloaded} />)
    expect(screen.getByRole('link', { name: 'Peter' })).toHaveStyle({ textDecoration: 'none' })
    unmount()
    const d = homeResponse()
    renderWithProviders(<RecentPagesCard pages={d.recentPages} now={d.now} />)
    expect(screen.getByRole('link', { name: 'Project Charter' })).toHaveStyle({ textDecoration: 'none' })
  })
})
