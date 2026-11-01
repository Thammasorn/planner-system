// M6.1 S0 smoke tests of the minimal layout primitives (S4 extends them: PageHeaderBar.test.tsx, useFullWidth.test.tsx…).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { DocColumn } from './DocColumn'
import { HeaderActions, useHeaderSlot } from './HeaderActions'
import { InAppHistoryProvider, useInAppBack } from './InAppHistory'
import { PageHeaderBar } from './PageHeaderBar'
import { PropertyList, PropertyRow } from './PropertyList'

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), pathname: '/projects/p/tasks' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, back: nav.back }),
}))

function SlotProbe() {
  const status = useHeaderSlot('status')
  return <span data-testid="probe">{status ? 'slot' : 'none'}</span>
}

describe('PageHeaderBar (M6.1-D19, S0 minimal)', () => {
  it('renders the breadcrumb, the heading crumb, back, actions and portal slots', async () => {
    const onBack = vi.fn()
    renderWithProviders(
      <>
        <PageHeaderBar
          crumbs={[
            { label: 'โปรเจค', href: '/projects' },
            { label: 'POS Upgrade', asHeading: true },
          ]}
          back={{ onClick: onBack }}
          actions={<button type="button">A</button>}
        />
        <HeaderActions>
          <button type="button">ported</button>
        </HeaderActions>
        <SlotProbe />
      </>,
    )
    const bar = screen.getByTestId('page-header')
    const crumbs = within(bar).getByRole('navigation', { name: th.layout.breadcrumb })
    expect(within(crumbs).getByRole('link', { name: 'โปรเจค' })).toHaveAttribute('href', '/projects')
    expect(within(bar).getByRole('heading', { level: 1, name: 'POS Upgrade' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'ported' })).toBeInTheDocument()
    expect(screen.getByTestId('probe')).toHaveTextContent('slot')
    await userEvent.click(within(bar).getByRole('button', { name: th.layout.back }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('DocColumn / PropertyList (S0 minimal)', () => {
  it('DocColumn marks the column and its width mode', () => {
    renderWithProviders(<DocColumn fullWidth>x</DocColumn>)
    expect(screen.getByTestId('page-column')).toHaveAttribute('data-full-width', 'true')
  })

  it('PropertyRow is a group named by its label inside a light form', () => {
    renderWithProviders(
      <PropertyList aria-label="คุณสมบัติ">
        <PropertyRow label={th.taskPage.properties.status}>กำลังทำ</PropertyRow>
      </PropertyList>,
    )
    const list = screen.getByRole('group', { name: 'คุณสมบัติ' })
    expect(list).toHaveAttribute('data-light-form')
    expect(within(list).getByRole('group', { name: th.taskPage.properties.status })).toHaveTextContent(
      'กำลังทำ',
    )
  })
})

describe('PropertyList.module.css alignment (FR-1604, SPEC §8.12 aligned label · value columns)', () => {
  const css = readFileSync(path.join(__dirname, 'PropertyList.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (sel: string) => {
    const m = new RegExp(`(?:^|\\n)${sel.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
    if (!m?.[1]) throw new Error(`no rule ${sel}`)
    return m[1]
  }

  it('label and value both start at the row top and centre their first line in the same 32px line box', () => {
    expect(rule('.row')).toMatch(/align-items:\s*start/)
    expect(rule('.label')).not.toMatch(/align-self/)
    for (const sel of ['.label', '.value']) {
      expect(rule(sel)).toMatch(/min-height:\s*32px/)
      expect(rule(sel)).toMatch(/align-content:\s*center/)
    }
  })

  it('leading controls hang their start padding outside the value column', () => {
    expect(rule('.value [data-lead]')).toMatch(/margin-inline-start:\s*calc\(-1 \* var\(--space-1\)\)/)
    expect(rule('.value [data-lead-input]')).toMatch(/margin-inline-start:\s*-14px/)
  })
})

describe('useInAppBack (FR-686, S0 minimal)', () => {
  function Back() {
    const back = useInAppBack('/projects/p/tasks')
    return (
      <button type="button" onClick={back}>
        back
      </button>
    )
  }

  it('direct entry → push(fallback); after an in-app navigation → router.back()', async () => {
    nav.push.mockClear()
    nav.back.mockClear()
    nav.pathname = '/t/1'
    const { rerender } = renderWithProviders(
      <InAppHistoryProvider>
        <Back />
      </InAppHistoryProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(nav.push).toHaveBeenCalledWith('/projects/p/tasks')
    nav.pathname = '/t/2'
    act(() => {
      rerender(
        <InAppHistoryProvider>
          <Back />
        </InAppHistoryProvider>,
      )
    })
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(nav.back).toHaveBeenCalledOnce()
  })
})
