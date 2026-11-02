import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { SearchAllResponse, SearchIndexResponse, SearchResponse } from '@/lib/contracts/search'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { renderWithProviders } from '../../../tests/helpers/render'
import { CommandPalette } from './CommandPalette'
import { installCmdkShims } from './jsdom.test.helper'
import { LeaveDialogContext } from '@/components/calendar/LeaveDialogProvider'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { PreferencesContext, type PreferencesApi } from '@/hooks/usePreferences'
import { qk } from '@/lib/query-keys'
import { DEFAULT_PREFERENCES } from '@/lib/schemas/preferences'
import { theme } from '@/lib/theme/theme'
import { PaletteProvider, usePalette } from './PaletteProvider'
import { PaletteProjectScope, PaletteProjectScopeProvider } from './project-scope'

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: '/home' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), usePathname: () => nav.pathname }))
// `api.getJson` is the search; the M8 milestone targets (palette command visibility) answer from `targets`.
// M10: GET /api/search/index answers from `api.index` (default: an empty index — M4/M8 cases see no local hits).
const api = vi.hoisted(() => ({
  getJson: vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(),
  index: vi.fn<() => Promise<unknown>>(),
  targets: { projects: [] as { id: string; name: string; color: string }[] },
}))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: (url: string, init?: RequestInit): Promise<unknown> =>
    url === '/api/milestones/targets'
      ? Promise.resolve(api.targets)
      : url === '/api/search/index'
        ? api.index()
        : api.getJson(url, init),
}))
vi.mock('@/server/actions/milestones', () => ({ createMilestone: vi.fn() }))
const actions = vi.hoisted(() => ({
  createTask: vi.fn(),
  deleteTaskTree: vi.fn(),
  restoreTaskBatch: vi.fn(),
  createPage: vi.fn(),
}))
vi.mock('@/server/actions/tasks', () => ({
  createTask: actions.createTask,
  deleteTaskTree: actions.deleteTaskTree,
  restoreTaskBatch: actions.restoreTaskBatch,
}))
vi.mock('@/server/actions/pages', () => ({ createPage: actions.createPage }))

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

const EMPTY_INDEX: SearchIndexResponse = { projects: [], people: [], clients: [] }

beforeAll(installCmdkShims)

beforeEach(() => {
  nav.push.mockReset()
  nav.pathname = '/home'
  api.targets = { projects: [] }
  api.getJson.mockReset()
  api.getJson.mockResolvedValue(hits)
  api.index.mockReset()
  api.index.mockResolvedValue(EMPTY_INDEX)
  for (const f of Object.values(actions)) f.mockReset()
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

// ── M10 (FR-1102…1104, NFR-06, M10-D20…D24) ────────────────────────────────────────────────────────────────────────
describe('M10 palette categories, local index and debounce', () => {
  const POS = '00000000-0000-4000-8000-0000000000a1'
  const CRM = '00000000-0000-4000-8000-0000000000a2'
  const CINDY = '00000000-0000-4000-8000-0000000000b1'
  const IVY = '00000000-0000-4000-8000-0000000000b2'
  const MINT = '00000000-0000-4000-8000-0000000000b3'
  const PAT = '00000000-0000-4000-8000-0000000000b4'
  const CORAL = '00000000-0000-4000-8000-0000000000c1'
  const T1 = '00000000-0000-4000-8000-0000000000d1'
  const INDEX: SearchIndexResponse = {
    projects: [
      { id: POS, name: 'POS Upgrade', color: '#2F5597', archived: false, tentative: false, role: 'MEMBER' },
    ],
    people: [
      { id: CINDY, name: 'Cindy', nickname: null, positionName: 'Developer', active: true },
      { id: IVY, name: 'Ivy', nickname: null, positionName: 'Designer', active: true },
      { id: MINT, name: 'Mint', nickname: null, positionName: 'Developer', active: true },
    ],
    clients: [{ id: CORAL, name: 'Coral', archived: false }],
  }
  const never = () => new Promise<never>(() => {})
  const serverTask: SearchAllResponse = {
    pages: [],
    projects: [],
    people: [],
    clients: [],
    tasks: [
      {
        kind: 'task',
        id: T1,
        name: 'ย้ายข้อมูลลูกค้า',
        projectId: CRM,
        projectName: 'CRM Migration',
        projectArchived: false,
        status,
        completed: false,
        href: `/t/${T1}`,
        matchedIn: 'name',
      },
    ],
  }
  const searchCalls = () => api.getJson.mock.calls.filter(([url]) => url.startsWith('/api/search?'))

  async function openWithIndex(index: SearchIndexResponse = INDEX) {
    api.index.mockResolvedValue(index)
    const r = renderPalette()
    openWithKeys()
    const input = await within(await screen.findByRole('dialog')).findByRole('combobox')
    await waitFor(() => expect(r.queryClient.getQueryData(qk.searchIndex())).toEqual(index))
    return input
  }
  const type = (input: HTMLElement, v: string) => fireEvent.change(input, { target: { value: v } })

  it('typing "po" shows the POS Upgrade project synchronously (local index), before any server answer', async () => {
    api.getJson.mockImplementation(never)
    const input = await openWithIndex()
    type(input, 'po')
    const group = within(dialog()).getByRole('group', { name: th.palette.groups.projects })
    expect(within(group).getByRole('option', { name: /POS Upgrade/ })).toBeInTheDocument()
    expect(searchCalls()).toHaveLength(0) // the server search waits for the debounce
  })

  it('the server search runs once, 120 ms after the last keystroke; tasks show "ใน <project>"', async () => {
    api.getJson.mockResolvedValue(serverTask)
    const input = await openWithIndex()
    for (const v of ['ล', 'ลู', 'ลูก', 'ลูกค้า']) type(input, v)
    expect(searchCalls()).toHaveLength(0)
    const group = await within(dialog()).findByRole('group', { name: th.palette.groups.tasks })
    expect(searchCalls()).toHaveLength(1)
    expect(searchCalls()[0]![0]).toBe(`/api/search?q=${encodeURIComponent('ลูกค้า')}`)
    const option = within(group).getByRole('option', { name: /ย้ายข้อมูลลูกค้า/ })
    expect(option).toHaveAccessibleName(new RegExp(th.search.inProject('CRM Migration')))
    fireEvent.keyDown(input, { key: 'Enter' }) // the first (selected) option is the task
    expect(nav.push).toHaveBeenCalledWith(`/t/${T1}`)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('people come from the index only: "pat" finds nobody even if the server would answer Peter', async () => {
    api.getJson.mockResolvedValue({
      ...serverTask,
      tasks: [],
      people: [
        {
          kind: 'person',
          id: PAT,
          name: 'Peter',
          nickname: null,
          positionName: null,
          active: true,
          href: `/people/${PAT}`,
        },
      ],
    } satisfies SearchAllResponse)
    const input = await openWithIndex()
    type(input, 'pat')
    await waitFor(() => expect(searchCalls()).toHaveLength(1))
    await within(dialog()).findByText(th.palette.empty)
    expect(within(dialog()).queryByRole('group', { name: th.palette.groups.people })).toBeNull()
    expect(within(dialog()).queryByRole('option', { name: /Peter/ })).toBeNull()
  })

  it('when the index fails, the people group falls back to the server results', async () => {
    api.index.mockRejectedValue(new Error('500'))
    api.getJson.mockResolvedValue({
      ...serverTask,
      tasks: [],
      people: [
        {
          kind: 'person',
          id: MINT,
          name: 'Mint',
          nickname: null,
          positionName: 'Developer',
          active: false,
          href: `/people/${MINT}`,
        },
      ],
    } satisfies SearchAllResponse)
    renderPalette()
    openWithKeys()
    const input = await within(await screen.findByRole('dialog')).findByRole('combobox')
    type(input, 'mi')
    const group = await within(dialog()).findByRole('group', { name: th.palette.groups.people })
    const option = within(group).getByRole('option', { name: /Mint/ })
    expect(within(option).getByText(th.search.deactivated)).toBeInTheDocument()
  })

  it('group order: commands, projects, tasks, pages, people, clients; values carry the kind', async () => {
    api.getJson.mockResolvedValue({ ...serverTask, pages: hits.pages } satisfies SearchAllResponse)
    const input = await openWithIndex({
      projects: INDEX.projects,
      people: [{ id: PAT, name: 'Jack', nickname: null, positionName: null, active: true }],
      clients: [{ id: CORAL, name: 'Coral', archived: true }],
    })
    type(input, 'o') // matches "ไปหน้าวันนี้" (keyword today/home), POS, Jack, Coral
    await within(dialog()).findByRole('group', { name: th.palette.groups.tasks })
    const headings = within(dialog())
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-labelledby'))
      .map((id) => (id ? document.getElementById(id)?.textContent : null))
    expect(headings).toEqual([
      th.milestones.palette.group,
      th.palette.groups.projects,
      th.palette.groups.tasks,
      th.palette.groups.pages,
      th.palette.groups.people,
      th.palette.groups.clients,
    ])
    const client = within(within(dialog()).getByRole('group', { name: th.palette.groups.clients })).getByRole(
      'option',
    )
    expect(client).toHaveAttribute('data-value', `client:${CORAL}`)
    expect(within(client).getByText(th.search.archived)).toBeInTheDocument()
  })
})

describe('M10 quick commands (FR-1103, M10-D23/D24)', () => {
  const POS = '00000000-0000-4000-8000-0000000000a1'
  const CRM = '00000000-0000-4000-8000-0000000000a2'
  const OLD = '00000000-0000-4000-8000-0000000000a3'
  const TASK = '00000000-0000-4000-8000-0000000000e1'
  const project = (id: string, name: string, archived = false) => ({
    id,
    name,
    color: '#2F5597',
    archived,
    tentative: false,
    role: 'MEMBER' as const,
  })
  const INDEX: SearchIndexResponse = {
    projects: [project(POS, 'POS Upgrade'), project(CRM, 'CRM Migration'), project(OLD, 'Store เก่า', true)],
    people: [],
    clients: [],
  }
  const prefs = { set: vi.fn() }
  const leave = { open: vi.fn() }

  function renderCommands(
    o: { scope?: { id: string; name: string; archived: boolean }; lastProjectId?: string } = {},
  ) {
    api.index.mockResolvedValue(INDEX)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const prefsApi: PreferencesApi = {
      prefs: { ...DEFAULT_PREFERENCES, 'palette.lastProjectId': o.lastProjectId ?? null },
      setPreference: prefs.set as PreferencesApi['setPreference'],
    }
    const utils = render(
      <QueryClientProvider client={qc}>
        <ThemeProvider theme={theme} storageManager={null}>
          <PreferencesContext value={prefsApi}>
            <UndoProvider>
              <LeaveDialogContext value={leave}>
                <PaletteProjectScopeProvider>
                  {o.scope ? <PaletteProjectScope project={o.scope} /> : null}
                  <PaletteProvider>
                    <CommandPalette />
                    <StartButton />
                  </PaletteProvider>
                </PaletteProjectScopeProvider>
              </LeaveDialogContext>
              <Toaster />
            </UndoProvider>
          </PreferencesContext>
        </ThemeProvider>
      </QueryClientProvider>,
    )
    return { ...utils, qc }
  }
  function StartButton() {
    const { open } = usePalette()
    return (
      <button type="button" onClick={() => open({ start: 'task.create' })}>
        start
      </button>
    )
  }
  const commandsGroup = () => within(dialog()).getByRole('group', { name: th.milestones.palette.group })
  async function openPalette() {
    openWithKeys()
    return within(await screen.findByRole('dialog')).findByRole('combobox')
  }

  beforeEach(() => {
    prefs.set.mockReset()
    leave.open.mockReset()
  })

  it('an empty query lists the four commands; a query matching none renders no commands group', async () => {
    api.getJson.mockResolvedValue({ pages: [], tasks: [] } satisfies SearchResponse)
    renderCommands()
    const input = await openPalette()
    await waitFor(() =>
      expect(
        within(commandsGroup()).getByRole('option', { name: th.palette.commands.createTask.label }),
      ).toBeInTheDocument(),
    )
    for (const label of [
      th.palette.commands.createPage.label,
      th.palette.commands.reportLeave.label,
      th.palette.commands.goToday.label,
    ])
      expect(within(commandsGroup()).getByRole('option', { name: label })).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'Coral' } })
    expect(within(dialog()).queryByRole('group', { name: th.milestones.palette.group })).toBeNull()
  })

  it('สร้าง task with a scope (POS) goes straight to the name; Enter creates, remembers the project, toasts', async () => {
    actions.createTask.mockResolvedValue({
      ok: true,
      task: { id: TASK, projectId: POS, name: 'งาน X' },
      transfer: null,
    })
    const user = userEvent.setup()
    const { qc } = renderCommands({ scope: { id: POS, name: 'POS Upgrade', archived: false } })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await openPalette()
    await user.click(
      await within(dialog()).findByRole('option', { name: th.palette.commands.createTask.label }),
    )
    const input = await within(dialog()).findByPlaceholderText(
      th.palette.createTask.namePlaceholder('POS Upgrade'),
    )
    await user.keyboard('{Enter}') // empty name: nothing happens (P1)
    expect(actions.createTask).not.toHaveBeenCalled()
    await user.type(input, 'งาน X{Enter}')
    expect(actions.createTask).toHaveBeenCalledWith({ projectId: POS, name: 'งาน X' })
    expect(await screen.findByText(th.palette.createTask.created('งาน X', 'POS Upgrade'))).toBeInTheDocument()
    expect(prefs.set).toHaveBeenCalledWith('palette.lastProjectId', POS, { immediate: true })
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.projectTasks(POS) })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // the toast carries "เลิกทำ" and "เปิด" (→ the task in its project)
    expect(screen.getByRole('button', { name: th.undo.undo })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.palette.createTask.open }))
    expect(nav.push).toHaveBeenCalledWith(`/projects/${POS}/tasks?task=${TASK}`)
  })

  it('a failed create keeps the step and the name, with a Thai error toast', async () => {
    actions.createTask.mockResolvedValue({ ok: false, code: 'INTERNAL', message: 'x' })
    const user = userEvent.setup()
    renderCommands({ scope: { id: POS, name: 'POS Upgrade', archived: false } })
    await user.click(screen.getByRole('button', { name: 'start' }))
    const input = await within(await screen.findByRole('dialog')).findByPlaceholderText(
      th.palette.createTask.namePlaceholder('POS Upgrade'),
    )
    await user.type(input, 'งาน X{Enter}')
    expect(await screen.findByText(th.palette.createTask.failed)).toBeInTheDocument()
    expect(input).toHaveValue('งาน X')
  })

  it('without a scope: the picker lists only non-archived projects, the last used first; Backspace on empty goes back', async () => {
    const user = userEvent.setup()
    renderCommands({ lastProjectId: CRM })
    await user.click(screen.getByRole('button', { name: 'start' })) // open({ start: 'task.create' }) — the N fallback
    expect(await within(dialog()).findByText(th.palette.createTask.pickProject)).toBeInTheDocument()
    const list = await within(dialog()).findByRole('group', { name: th.palette.groups.projects })
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(2))
    const [first, second] = within(list).getAllByRole('option')
    expect(first).toHaveAccessibleName(/CRM Migration/)
    expect(within(first!).getByText(th.palette.createTask.lastUsed)).toBeInTheDocument()
    expect(second).toHaveAccessibleName(/POS Upgrade/)
    expect(within(dialog()).queryByRole('option', { name: /Store เก่า/ })).toBeNull()

    await user.keyboard('{ArrowDown}{Enter}') // POS
    const name = await within(dialog()).findByPlaceholderText(
      th.palette.createTask.namePlaceholder('POS Upgrade'),
    )
    expect(name).toHaveFocus()
    await user.keyboard('{Backspace}') // empty → back to the picker
    expect(
      await within(dialog()).findByPlaceholderText(th.palette.createTask.projectPlaceholder),
    ).toBeInTheDocument()
    await user.keyboard('{Backspace}') // empty → back to search
    expect(await within(dialog()).findByPlaceholderText(th.palette.placeholder)).toBeInTheDocument()
  })

  it('a failed index shows the error + retry in the picker, not "no projects" (SPEC P4)', async () => {
    const user = userEvent.setup()
    renderCommands()
    api.index.mockReset()
    api.index.mockRejectedValue(new Error('500'))
    await user.click(screen.getByRole('button', { name: 'start' }))
    expect(await within(dialog()).findByText(th.palette.createTask.pickProject)).toBeInTheDocument()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(th.palette.error)
    expect(within(dialog()).queryByText(th.palette.createTask.noProjects)).toBeNull()

    api.index.mockResolvedValue(INDEX)
    await user.click(within(dialog()).getByRole('option', { name: th.palette.retry }))
    const list = await within(dialog()).findByRole('group', { name: th.palette.groups.projects })
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(2))
    expect(within(dialog()).queryByRole('alert')).toBeNull()
  })

  it('an archived scope is not a target: the picker opens instead', async () => {
    const user = userEvent.setup()
    renderCommands({ scope: { id: OLD, name: 'Store เก่า', archived: true } })
    await user.click(screen.getByRole('button', { name: 'start' }))
    expect(await within(dialog()).findByText(th.palette.createTask.pickProject)).toBeInTheDocument()
  })

  it('สร้างหน้า without a scope creates a wiki page and opens it', async () => {
    actions.createPage.mockResolvedValue({
      ok: true,
      page: {},
      space: 'WORKSPACE',
      projectId: null,
      href: '/p/new-id',
    })
    const user = userEvent.setup()
    renderCommands()
    await openPalette()
    await user.click(
      await within(dialog()).findByRole('option', { name: th.palette.commands.createPage.label }),
    )
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/p/new-id'))
    expect(actions.createPage).toHaveBeenCalledWith({ space: 'WORKSPACE', projectId: null, parentId: null })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('สร้างหน้า with a scope creates the page in that project', async () => {
    actions.createPage.mockResolvedValue({
      ok: true,
      page: {},
      space: 'PROJECT',
      projectId: POS,
      href: '/p/new-2',
    })
    const user = userEvent.setup()
    renderCommands({ scope: { id: POS, name: 'POS Upgrade', archived: false } })
    await openPalette()
    await user.click(
      await within(dialog()).findByRole('option', { name: th.palette.commands.createPage.label }),
    )
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/p/new-2'))
    expect(actions.createPage).toHaveBeenCalledWith({ space: 'PROJECT', projectId: POS, parentId: null })
  })

  it('แจ้งลา closes the palette and opens the leave dialog; ไปหน้าวันนี้ goes to /home', async () => {
    const user = userEvent.setup()
    renderCommands()
    await openPalette()
    await user.click(
      await within(dialog()).findByRole('option', { name: th.palette.commands.reportLeave.label }),
    )
    expect(leave.open).toHaveBeenCalledWith({ mode: 'create' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await openPalette()
    await user.click(await within(dialog()).findByRole('option', { name: th.palette.commands.goToday.label }))
    expect(nav.push).toHaveBeenCalledWith('/home')
  })
})
