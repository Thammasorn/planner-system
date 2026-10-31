import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { PageBreadcrumbs } from './Breadcrumbs'
import { renderPages, uuid } from './render.test.helper'

const A = uuid(21)
const B = uuid(22)
const PID = uuid(5)

const nav = () => screen.getByRole('navigation', { name: th.pages.breadcrumbLabel })

describe('PageBreadcrumbs (FR-504)', () => {
  it('wiki: root text (not a link), two ancestors in order, current page last with aria-current', () => {
    renderPages(
      <PageBreadcrumbs
        space="WORKSPACE"
        projectId={null}
        projectName={null}
        crumbs={[
          { id: A, title: 'คู่มือทีม', icon: '📘' },
          { id: B, title: '', icon: null },
        ]}
        current={{ title: 'ก2', icon: '📌' }}
      />,
    )
    const root = within(nav()).getByText(th.pages.wikiRoot)
    expect(root.closest('a')).toBeNull()
    const links = within(nav()).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['📘 คู่มือทีม', th.pages.untitled])
    expect(links[0]).toHaveAttribute('href', `/p/${A}`)
    expect(links[1]).toHaveAttribute('href', `/p/${B}`)
    const current = within(nav()).getByText('📌 ก2')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.closest('a')).toBeNull()
  })

  it('project: the root is the project name linking to its เอกสาร tab', () => {
    renderPages(
      <PageBreadcrumbs
        space="PROJECT"
        projectId={PID}
        projectName="POS Upgrade"
        crumbs={[]}
        current={{ title: '', icon: null }}
      />,
    )
    expect(within(nav()).getByRole('link', { name: 'POS Upgrade' })).toHaveAttribute(
      'href',
      `/projects/${PID}/pages`,
    )
    expect(within(nav()).getByText(th.pages.untitled)).toHaveAttribute('aria-current', 'page')
    expect(within(nav()).queryByText(th.pages.wikiRoot)).not.toBeInTheDocument()
  })
})
