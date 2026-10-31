// S2.4/S2.6 — save status texts, blocked-save banners, error boundary fallback (FR-531/543, M4-D26, r3 G12).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { EditorBanners } from './EditorBanners'
import { EditorErrorBoundary } from './EditorErrorBoundary'
import { SaveStatus } from './SaveStatus'

const noLease = {
  mode: 'editing' as const,
  lease: null,
  takeover: () => Promise.resolve(),
  retry: () => Promise.resolve(),
  unsaved: false,
  retrySave: () => Promise.resolve(),
}

describe('SaveStatus', () => {
  it.each([
    ['saving', th.editor.saveStatus.saving],
    ['saved', th.editor.saveStatus.saved],
    ['error', th.editor.saveStatus.error],
  ] as const)('%s → text + data-save-state', (state, text) => {
    render(<SaveStatus state={state} />)
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('data-save-state', state)
    expect(el).toHaveTextContent(text)
  })
  it('data-dirty mirrors pending (default false) so e2e waits for the save after the last edit', () => {
    const { rerender } = render(<SaveStatus state="saved" />)
    expect(screen.getByRole('status')).toHaveAttribute('data-dirty', 'false')
    rerender(<SaveStatus state="saved" pending />)
    expect(screen.getByRole('status')).toHaveAttribute('data-dirty', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(th.editor.saveStatus.saved)
  })
  it('idle shows nothing', () => {
    render(<SaveStatus state="idle" />)
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})

describe('EditorBanners', () => {
  it('conflict → "มีการแก้ไขใหม่กว่า" with a reload button', () => {
    const onReload = vi.fn()
    render(<EditorBanners lease={noLease} blocked="conflict" onReload={onReload} />)
    expect(screen.getByTestId('conflict-banner')).toHaveTextContent(th.editor.conflict.banner)
    fireEvent.click(screen.getByRole('button', { name: th.editor.conflict.reload }))
    expect(onReload).toHaveBeenCalledOnce()
  })
  it('deleted / forbidden banners', () => {
    const { rerender } = render(<EditorBanners lease={noLease} blocked="deleted" onReload={() => {}} />)
    expect(screen.getByTestId('deleted-banner')).toHaveTextContent(th.editor.deletedBanner)
    rerender(<EditorBanners lease={noLease} blocked="forbidden" onReload={() => {}} />)
    expect(screen.getByTestId('forbidden-banner')).toHaveTextContent(th.editor.forbiddenBanner)
  })
  it('nothing while editing normally', () => {
    render(<EditorBanners lease={noLease} blocked={false} onReload={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('lease-banner')).toBeNull()
  })
})

describe('EditorErrorBoundary', () => {
  it('shows the crash fallback and remounts on reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    function Boom() {
      if (fail) throw new Error('bad doc')
      return <p>ok</p>
    }
    render(
      <EditorErrorBoundary>
        <Boom />
      </EditorErrorBoundary>,
    )
    expect(screen.getByTestId('editor-crashed')).toHaveTextContent(th.editor.crashed.title)
    fail = false
    fireEvent.click(screen.getByRole('button', { name: th.editor.crashed.reload }))
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
