import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { okResult, renderPages, uuid } from './render.test.helper'
import { TemplateChooser } from './TemplateChooser'

const actions = vi.hoisted(() => ({ applyTemplate: vi.fn() }))
vi.mock('@/server/actions/pages', () => actions)
const api = vi.hoisted(() => ({ getJson: vi.fn() }))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: api.getJson,
}))

const PAGE = uuid(10)
const view = (version: number, isBlank = true) => ({ page: { version, isBlank } })

beforeEach(() => {
  api.getJson.mockReset()
  actions.applyTemplate.mockReset()
})

const region = () => screen.getByRole('region', { name: th.pages.templates.heading })

describe('TemplateChooser (FR-507, M4-D7)', () => {
  it('four buttons in FR-507 order', () => {
    renderPages(<TemplateChooser pageId={PAGE} version={1} onApplied={vi.fn()} onDismiss={vi.fn()} />)
    expect(
      within(region())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      th.pages.templates.blank,
      th.pages.templates.charter,
      th.pages.templates.meeting,
      th.pages.templates.sop,
    ])
  })

  it('meeting → applyTemplate with the latest version, then onApplied', async () => {
    api.getJson.mockResolvedValue(view(1))
    actions.applyTemplate.mockReturnValue(
      okResult({ version: 2, title: 'บันทึกการประชุม — 30 ก.ย. 2569', icon: '📝' }),
    )
    const onApplied = vi.fn()
    renderPages(<TemplateChooser pageId={PAGE} version={1} onApplied={onApplied} onDismiss={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.meeting }))
    expect(api.getJson).toHaveBeenCalledWith(`/api/pages/${PAGE}`, expect.anything())
    expect(actions.applyTemplate).toHaveBeenCalledWith({ pageId: PAGE, baseVersion: 1, template: 'meeting' })
    await waitFor(() =>
      expect(onApplied).toHaveBeenCalledWith({
        version: 2,
        title: 'บันทึกการประชุม — 30 ก.ย. 2569',
        icon: '📝',
        template: 'meeting',
        ok: true,
      }),
    )
  })

  it('uses the version the editor saved since load', async () => {
    api.getJson.mockResolvedValue(view(3))
    actions.applyTemplate.mockReturnValue(okResult({ version: 4, title: '', icon: '📘' }))
    renderPages(<TemplateChooser pageId={PAGE} version={1} onApplied={vi.fn()} onDismiss={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.sop }))
    expect(actions.applyTemplate).toHaveBeenCalledWith({ pageId: PAGE, baseVersion: 3, template: 'sop' })
  })

  it('blank → no call, the row is dismissed', async () => {
    const onDismiss = vi.fn()
    renderPages(<TemplateChooser pageId={PAGE} version={1} onApplied={vi.fn()} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.blank }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(actions.applyTemplate).not.toHaveBeenCalled()
    expect(api.getJson).not.toHaveBeenCalled()
  })

  it('a page that got content meanwhile → dismissed without a call', async () => {
    api.getJson.mockResolvedValue(view(2, false))
    const onDismiss = vi.fn()
    renderPages(<TemplateChooser pageId={PAGE} version={1} onApplied={vi.fn()} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.charter }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalled())
    expect(actions.applyTemplate).not.toHaveBeenCalled()
  })

  it('VERSION_CONFLICT → conflict toast and dismissed', async () => {
    api.getJson.mockResolvedValue(view(1))
    actions.applyTemplate.mockReturnValue(
      Promise.resolve({ ok: false, code: 'VERSION_CONFLICT', message: 'x' }),
    )
    const onDismiss = vi.fn()
    const onApplied = vi.fn()
    renderPages(<TemplateChooser pageId={PAGE} version={1} onApplied={onApplied} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.charter }))
    expect(await screen.findByText(th.editor.conflict.banner)).toBeInTheDocument()
    expect(onDismiss).toHaveBeenCalled()
    expect(onApplied).not.toHaveBeenCalled()
  })
})
