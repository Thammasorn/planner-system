import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { SearchResponse } from '@/lib/contracts/search'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { renderWithProviders } from '../../../tests/helpers/render'
import { CommandPalette } from './CommandPalette'
import { installCmdkShims } from './jsdom.test.helper'
import { PaletteProvider } from './PaletteProvider'

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: '/home' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), usePathname: () => nav.pathname }))
// `api.getJson` is the search; the M8 milestone targets (palette command visibility) answer from `targets`.
const api = vi.hoisted(() => ({
  getJson: vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(),
  targets: { projects: [] as { id: string; name: string; color: string }[] },
}))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: (url: string, init?: RequestInit): Promise<unknown> =>
    url === '/api/milestones/targets' ? Promise.resolve(api.targets) : api.getJson(url, init),
}))
vi.mock('@/server/actions/milestones', () => ({ createMilestone: vi.fn() }))

const A = '00000000-0000-4000-8000-000000000041'
const B = '00000000-0000-4000-8000-000000000042'
const hits: SearchResponse = {
  pages: [
    {
      kind: 'page',
      id: A,
      title: 'ย้ายข้อมูลลูกค้า',
      icon: '📝',
      href: `/p/${A}`,
      subtitle: 'CRM Migration',
      matchedIn: 'title',
    },
    {
      kind: 'page',
      id: B,
      title: 'คู่มือทีม',
      icon: null,
      href: `/p/${B}`,
      subtitle: th.palette.wiki,
      matchedIn: 'content',
    },
  ],
  tasks: [],
}

const TA = '00000000-0000-4000-8000-000000000051'
const TB = '00000000-0000-4000-8000-000000000052'
const P = '00000000-0000-4000-8000-000000000061'
const status = {
  id: '00000000-0000-4000-8000-000000000071',
  name: 'กำลังทำ',
  color: '#2F5597',
  category: 'IN_PROGRESS',
} as const
const taskHits: SearchResponse = {
  pages: hits.pages,
  tasks: [
    {
      kind: 'task',
      id: TA,
      name: 'ย้ายข้อมูลลูกค้าเก่า',
      projectId: P,
      projectName: 'CRM Migration',
      projectArchived: false,
      status,
      completed: false,
      href: `/t/${TA}`,
      matchedIn: 'name',
    },
    {
      kind: 'task',
      id: TB,
      name: 'ตรวจรายชื่อ',
      projectId: P,
      projectName: 'Store เก่า',
      projectArchived: true,
      status: { ...status, category: 'DONE', name: 'เสร็จ' },
      completed: true,
      href: `/t/${TB}`,
      matchedIn: 'content',
    },
  ],
}

beforeAll(installCmdkShims)

beforeEach(() => {
  nav.push.mockReset()
  nav.pathname = '/home'
  api.targets = { projects: [] }
  api.getJson.mockReset()
  api.getJson.mockResolvedValue(hits)
})

function renderPalette(extra?: React.ReactNode) {
  return renderWithProviders(
    <PaletteProvider>
      {extra}
      <CommandPalette />
    </PaletteProvider>,
  )
}

const dialog = () => screen.getByRole('dialog', { name: th.palette.dialogLabel })
const openWithKeys = () => fireEvent.keyDown(document.body, { code: 'KeyK', key: 'k', ctrlKey: true })

describe('CommandPalette (FR-1102, X08, X49)', () => {
  it('Ctrl+K opens the named dialog with the input focused and the hint on an empty query', async () => {
    renderPalette()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openWithKeys()
    expect(await screen.findByRole('dialog', { name: th.palette.dialogLabel })).toBeInTheDocument()
    await waitFor(() => expect(within(dialog()).getByRole('combobox')).toHaveFocus())
    expect(within(dialog()).getByText(th.palette.hint)).toBeInTheDocument()
    expect(api.getJson).not.toHaveBeenCalled()
  })

  it('matches e.code (Thai layout: Ctrl + " า")', async () => {
    renderPalette()
    fireEvent.keyDown(document.body, { code: 'KeyK', key: 'า', metaKey: true })
    expect(await screen.findByRole('dialog', { name: th.palette.dialogLabel })).toBeInTheDocument()
  })

  it('typing shows the server hits in order inside the pages group; ArrowDown + Enter opens the second', async () => {
    const user = userEvent.setup()
    renderPalette()
    openWithKeys()
    const input = await within(await screen.findByRole('dialog')).findByRole('combobox')
    await user.type(input, 'ลูกค้า')
    const group = await within(dialog()).findByRole('group', { name: th.palette.groups.pages })
    const options = within(group).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAccessibleName(/ย้ายข้อมูลลูกค้า/)
    expect(options[0]).toHaveAccessibleName(/CRM Migration/)
    expect(options[1]).toHaveAccessibleName(/คู่มือทีม/)
    expect(within(options[1]!).getByText(th.palette.matchedInContent)).toBeInTheDocument()
    expect(within(options[0]!).queryByText(th.palette.matchedInContent)).toBeNull()
    expect(api.getJson).toHaveBeenLastCalledWith(
      `/api/search?q=${encodeURIComponent('ลูกค้า')}`,
      expect.anything(),
    )

    await user.keyboard('{ArrowDown}{Enter}')
    expect(nav.push).toHaveBeenCalledWith(`/p/${B}`)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('FR-690 (M6.1-D14): the งาน group comes before หน้าเอกสาร; chips say content / done / archived; Enter opens /t', async () => {
    api.getJson.mockResolvedValue(taskHits)
    const user = userEvent.setup()
    renderPalette()
    openWithKeys()
    await user.type(await within(await screen.findByRole('dialog')).findByRole('combobox'), 'ลูกค้า')
    const tasks = await within(dialog()).findByRole('group', { name: th.palette.groups.tasks })
    const groups = within(dialog()).getAllByRole('group')
    expect(groups.indexOf(tasks)).toBeLessThan(
      groups.indexOf(within(dialog()).getByRole('group', { name: th.palette.groups.pages })),
    )
    const [first, second] = within(tasks).getAllByRole('option')
    expect(first).toHaveAccessibleName(/ย้ายข้อมูลลูกค้าเก่า/)
    expect(first).toHaveAccessibleName(/CRM Migration/)
    expect(within(first!).queryByText(th.palette.matchedInContent)).toBeNull()
    for (const chip of [th.palette.matchedInContent, th.palette.taskDone, th.palette.archived])
      expect(within(second!).getByText(chip)).toBeInTheDocument()
    await user.keyboard('{Enter}') // the first option (a task) is selected
    expect(nav.push).toHaveBeenCalledWith(`/t/${TA}`)
  })

  it('no hits → the empty text', async () => {
    api.getJson.mockResolvedValue({ pages: [], tasks: [] } satisfies SearchResponse)
    const user = userEvent.setup()
    renderPalette()
    openWithKeys()
    await user.type(await within(await screen.findByRole('dialog')).findByRole('combobox'), 'zzz')
    expect(await within(dialog()).findByText(th.palette.empty)).toBeInTheDocument()
  })

  it('a failed search shows the error alert (never the empty text); Enter on retry searches again', async () => {
    api.getJson.mockRejectedValue(new Error('500'))
    const user = userEvent.setup()
    renderPalette()
    openWithKeys()
    await user.type(await within(await screen.findByRole('dialog')).findByRole('combobox'), 'zzz')
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(th.palette.error)
    expect(within(dialog()).queryByText(th.palette.empty)).toBeNull()
    api.getJson.mockResolvedValue(hits)
    await user.keyboard('{Enter}') // the retry item is the only (selected) option
    expect(await within(dialog()).findByRole('option', { name: /ย้ายข้อมูลลูกค้า/ })).toBeInTheDocument()
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('Escape closes', async () => {
    const user = userEvent.setup()
    renderPalette()
    openWithKeys()
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a keydown already handled (defaultPrevented, e.g. BlockNote link shortcut) does not open', () => {
    renderPalette()
    const ev = new KeyboardEvent('keydown', {
      code: 'KeyK',
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    ev.preventDefault()
    document.body.dispatchEvent(ev)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Ctrl+K over a text selection inside the editor stays closed (BlockNote link shortcut, r3 G16)', () => {
    renderPalette(
      <div className="bn-editor" contentEditable suppressContentEditableWarning data-testid="ed">
        ข้อความที่เลือก
      </div>,
    )
    const ed = screen.getByTestId('ed')
    const range = document.createRange()
    range.selectNodeContents(ed)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    const ev = fireEvent.keyDown(ed, { code: 'KeyK', key: 'k', ctrlKey: true })
    expect(ev).toBe(true) // not prevented: BlockNote may still handle it
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    window.getSelection()?.collapse(ed, 0)
    fireEvent.keyDown(ed, { code: 'KeyK', key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: th.palette.dialogLabel })).toBeInTheDocument()
  })

  it('Ctrl+K while focus is in an input still opens', async () => {
    renderPalette(<input aria-label="q" />)
    const input = screen.getByRole('textbox', { name: 'q' })
    input.focus()
    fireEvent.keyDown(input, { code: 'KeyK', key: 'k', ctrlKey: true })
    expect(await screen.findByRole('dialog', { name: th.palette.dialogLabel })).toBeInTheDocument()
  })
})

describe('M8 palette command "สร้าง milestone" (FR-702, M8-D18)', () => {
  const POS = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
  // full app providers: the milestone dialog needs today, undo and the date adapter
  const renderFull = () =>
    renderTasks(
      <PaletteProvider>
        <CommandPalette />
      </PaletteProvider>,
    )

  it('with targets [POS] on /projects/POS/plan: "milestone" shows the command in คำสั่ง; Enter opens the dialog with POS', async () => {
    api.targets = { projects: [{ id: POS, name: 'POS Upgrade', color: '#2F5597' }] }
    api.getJson.mockResolvedValue({ pages: [], tasks: [] } satisfies SearchResponse)
    nav.pathname = `/projects/${POS}/plan`
    const user = userEvent.setup()
    renderFull()
    openWithKeys()
    await user.type(await within(await screen.findByRole('dialog')).findByRole('combobox'), 'milestone')
    const group = await within(dialog()).findByRole('group', { name: th.milestones.palette.group })
    expect(within(group).getByRole('option', { name: th.milestones.palette.create })).toBeInTheDocument()
    await user.keyboard('{Enter}')
    const ms = await screen.findByRole('dialog', { name: th.milestones.form.createTitle })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: th.palette.dialogLabel })).toBeNull())
    expect(within(ms).getByRole('combobox', { name: th.milestones.fields.project })).toHaveTextContent(
      'POS Upgrade',
    )
  })

  it('on an empty query the command shows together with the hint', async () => {
    api.targets = { projects: [{ id: POS, name: 'POS Upgrade', color: '#2F5597' }] }
    renderFull()
    openWithKeys()
    await screen.findByRole('dialog')
    expect(
      await within(dialog()).findByRole('option', { name: th.milestones.palette.create }),
    ).toBeInTheDocument()
    expect(within(dialog()).getByText(th.palette.hint)).toBeInTheDocument()
  })

  it('with targets [] there is no "สร้าง milestone" option', async () => {
    api.getJson.mockResolvedValue({ pages: [], tasks: [] } satisfies SearchResponse)
    const user = userEvent.setup()
    renderFull()
    openWithKeys()
    await user.type(await within(await screen.findByRole('dialog')).findByRole('combobox'), 'milestone')
    await within(dialog()).findByText(th.palette.empty)
    expect(within(dialog()).queryByRole('option', { name: th.milestones.palette.create })).toBeNull()
  })
})
