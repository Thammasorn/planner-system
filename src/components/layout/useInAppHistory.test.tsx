// useInAppBack (FR-686, AC-623, M6.1-D18; plan/m06.1 S4.2): direct entry → the fallback; after an in-app navigation →
// router.back(); a browser Back to the entry page counts down again.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InAppHistoryProvider, useInAppBack } from './InAppHistory'

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), pathname: '/t/1' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, back: nav.back }),
}))

function Back() {
  const back = useInAppBack('/projects/p/tasks')
  return (
    <button type="button" onClick={back}>
      back
    </button>
  )
}

const tree = () => (
  <InAppHistoryProvider>
    <Back />
  </InAppHistoryProvider>
)

beforeEach(() => {
  nav.push.mockClear()
  nav.back.mockClear()
  nav.pathname = '/t/1'
})

describe('useInAppBack', () => {
  it('direct entry → push(fallback)', async () => {
    render(tree())
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(nav.push).toHaveBeenCalledWith('/projects/p/tasks')
    expect(nav.back).not.toHaveBeenCalled()
  })

  it('after a client navigation → router.back()', async () => {
    nav.pathname = '/projects/p/tasks'
    const { rerender } = render(tree())
    nav.pathname = '/t/1'
    act(() => rerender(tree()))
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(nav.back).toHaveBeenCalledOnce()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('a browser Back to the entry page → the fallback again', async () => {
    nav.pathname = '/t/1'
    const { rerender } = render(tree())
    nav.pathname = '/projects/p/tasks'
    act(() => rerender(tree())) // push: depth 1
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    nav.pathname = '/t/1'
    act(() => rerender(tree())) // popstate: depth 0
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(nav.push).toHaveBeenCalledWith('/projects/p/tasks')
    expect(nav.back).not.toHaveBeenCalled()
  })

  it('without the provider it always pushes the fallback', async () => {
    render(<Back />)
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(nav.push).toHaveBeenCalledWith('/projects/p/tasks')
  })
})
