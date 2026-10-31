import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { PAGE_ICONS } from '@/lib/pages/icons'
import { IconPicker } from './IconPicker'
import { okResult, renderPages, uuid } from './render.test.helper'

const actions = vi.hoisted(() => ({ setPageIcon: vi.fn() }))
vi.mock('@/server/actions/pages', () => actions)

const PAGE = uuid(10)
const scope = { space: 'WORKSPACE' as const, projectId: null }

describe('IconPicker (FR-504)', () => {
  it('shows a grid of the 60 curated emoji; clicking 📌 calls setPageIcon optimistically', async () => {
    actions.setPageIcon.mockReturnValue(okResult({ icon: '📌' }))
    const onChange = vi.fn()
    renderPages(<IconPicker pageId={PAGE} icon={null} canEdit scope={scope} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.icon.button }))
    const picker = screen.getByRole('dialog', { name: th.pages.icon.dialogTitle })
    const buttons = within(picker)
      .getAllByRole('button')
      .filter((b) => PAGE_ICONS.includes(b.getAttribute('aria-label') as never))
    expect(buttons).toHaveLength(60)
    expect(within(picker).queryByRole('button', { name: th.pages.icon.remove })).not.toBeInTheDocument()
    await userEvent.click(within(picker).getByRole('button', { name: '📌' }))
    expect(onChange).toHaveBeenCalledWith('📌')
    expect(actions.setPageIcon).toHaveBeenCalledWith({ pageId: PAGE, icon: '📌' })
  })

  it('remove → icon null', async () => {
    actions.setPageIcon.mockReturnValue(okResult({ icon: null }))
    const onChange = vi.fn()
    renderPages(<IconPicker pageId={PAGE} icon="📘" canEdit scope={scope} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.icon.button }))
    await userEvent.click(screen.getByRole('button', { name: th.pages.icon.remove }))
    expect(actions.setPageIcon).toHaveBeenCalledWith({ pageId: PAGE, icon: null })
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('rolls back and shows the server message on failure', async () => {
    actions.setPageIcon.mockReturnValue(
      Promise.resolve({ ok: false, code: 'FORBIDDEN', message: th.pages.errors.protectedReadOnly }),
    )
    const onChange = vi.fn()
    renderPages(<IconPicker pageId={PAGE} icon="📘" canEdit scope={scope} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.icon.button }))
    await userEvent.click(screen.getByRole('button', { name: '📌' }))
    expect(await screen.findByText(th.pages.errors.protectedReadOnly)).toBeInTheDocument()
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('📘'))
  })

  it('read-only: the icon without a button', () => {
    renderPages(<IconPicker pageId={PAGE} icon="📘" canEdit={false} scope={scope} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: th.pages.icon.button })).not.toBeInTheDocument()
    expect(screen.getByText('📘')).toBeInTheDocument()
  })
})
