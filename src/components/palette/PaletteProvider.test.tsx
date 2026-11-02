import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaletteProvider, useCommandCtx } from './PaletteProvider'
import { PaletteProjectScope, PaletteProjectScopeProvider } from './project-scope'

const nav = vi.hoisted(() => ({ pathname: '/home', push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), usePathname: () => nav.pathname }))
vi.mock('@/server/actions/pages', () => ({ createPage: vi.fn() }))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: () => Promise.resolve({ projects: [], people: [], clients: [] }),
}))

const POS = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
const CRM = '7a2d3c9f-4e5b-4c6d-8e7f-8a9b0c1d2e3f'

function Current() {
  const ctx = useCommandCtx()
  return <output data-testid="current">{ctx.currentProjectId ?? 'none'}</output>
}

function renderCtx(scope?: { id: string; name: string; archived: boolean }) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PaletteProjectScopeProvider>
        {scope ? <PaletteProjectScope project={scope} /> : null}
        <PaletteProvider>
          <Current />
        </PaletteProvider>
      </PaletteProjectScopeProvider>
    </QueryClientProvider>,
  )
}

const current = () => screen.getByTestId('current').textContent

beforeEach(() => {
  nav.pathname = '/home'
})

describe('useCommandCtx().currentProjectId (M10-D24, C48)', () => {
  it('on /p/<pageId> it is the registered palette scope (a PROJECT page)', () => {
    nav.pathname = '/p/00000000-0000-4000-8000-000000000001'
    renderCtx({ id: POS, name: 'POS Upgrade', archived: false })
    expect(current()).toBe(POS)
  })

  it('without a scope it falls back to projectIdFromPath on /projects/<id>/plan', () => {
    nav.pathname = `/projects/${CRM}/plan`
    renderCtx()
    expect(current()).toBe(CRM)
  })

  it('the scope wins over the path; no scope and no project path → null', () => {
    nav.pathname = `/projects/${CRM}/plan`
    const { unmount } = renderCtx({ id: POS, name: 'POS Upgrade', archived: false })
    expect(current()).toBe(POS)
    unmount()
    nav.pathname = '/home'
    renderCtx()
    expect(current()).toBe('none')
  })
})
