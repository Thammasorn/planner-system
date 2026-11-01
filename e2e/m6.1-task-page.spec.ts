/**
 * M6.1 — task as a document page + AFFiNE-like layout (plan/m06.1-task-page-ui.md §7.3 T1–T9, V1–V5; SPEC §4.6.4
 * AC-621…628, §4.16 AC-1601…1604).
 * Determinism (PLAN §4.5, X45/X46): production build, APP_NOW = 2026-09-30 10:00 +07, the browser clock pinned by the
 * auto fixture (before the first goto), API login per role, every describe marked ⟲ resets planner_e2e in its own
 * beforeAll. Strings come from `th`; waits are on UI state (save status, toasts, URLs, server-action answers, network
 * idle) — never sleeps. DB reads (pages rows of kind TASK, audit rows) only check what the UI wrote.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { formatThaiDate } from '../src/lib/format'
import type { Tx } from '../src/server/db/types'
import {
  expect,
  idOf,
  loginAs,
  openGuardedPage,
  projectIdByName,
  resetDb,
  test,
  waitForServerAction,
  waitForServerActionWith,
} from './fixtures'
import { E2E } from './env'
import { EditorPage } from './pages/editor'
import { GridPage } from './pages/grid'
import { HeaderBar } from './pages/header'
import { LeaveDialog } from './pages/leave-dialog'
import { MyTasksPage } from './pages/my-tasks'
import { PageScreen } from './pages/page-screen'
import { Palette } from './pages/palette'
import { ProjectPage } from './pages/project'
import { ShellPage } from './pages/shell'
import { SidebarPage } from './pages/sidebar'
import { TaskPage } from './pages/task-page'
import { PlanRangeDialog, TaskListPage } from './pages/tasks'
import { TeamTasksPage } from './pages/team-tasks'
import { escapeRegExp } from './pages/text'
import { toastWith, undoButtonOf } from './pages/toast'
import { PNG_1X1_B64, realClipboardImage, syntheticPaste } from './support/clipboard'
import { insertPage, insertTaskBody, paragraph, wideTable12 } from './support/seed-pages'
import {
  auditRowsSince,
  auditWatermark,
  charterIdOf,
  insertRootTasksFirst,
  taskBodyRows,
  taskFacts,
  taskIdOf,
  taskPageCount,
} from './support/seed-tasks'

const POS = 'POS Upgrade'
const CRM = 'CRM Migration'
const R1 = 'ปรับปรุงระบบ POS หน้าร้าน' // Cindy
const UAT = 'ทำ UAT + คู่มือหน้าร้าน' // Ivy
const ROLLOUT = 'Rollout สาขา' // Mint
const CRM_CINDY = 'ย้ายข้อมูลลูกค้า'
const IVY_CRM = 'ตั้งค่า automation'
const S = th.tasks.status.defaults
const TODAY = E2E.appNow.slice(0, 10)
const TASK_URL = /\/t\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FILE_SRC = /^\/api\/files\/[0-9a-f-]{36}$/
const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
const fixture = (name: string): string => readFileSync(path.resolve('e2e/fixtures', name), 'utf8')

// ── small helpers ────────────────────────────────────────────────────────────────────────────────────────────
async function box(l: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await l.boundingBox()
  if (!b) throw new Error('element has no box')
  return b
}
/** Horizontal overflow of the document (0 = nothing sticks out of the viewport). */
const docOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
async function expectNoOverflow(page: Page, what: string): Promise<void> {
  await page.waitForLoadState('networkidle')
  expect(await docOverflow(page), `horizontal overflow on ${what}`).toBeLessThanOrEqual(0)
}
const scrollY = (page: Page): Promise<number> => page.evaluate(() => window.scrollY)
/** Focus leaves every field / the editor (Esc and Cmd+Z then belong to the page, FR-686 / FR-1602). */
async function blur(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}
/** Right gap between an element and the viewport's right edge (AC-1601). */
async function rightGap(page: Page, l: Locator): Promise<number> {
  const b = await box(l)
  return page.viewportSize()!.width - (b.x + b.width)
}
const pathOf = (page: Page): string => new URL(page.url()).pathname
async function attachShot(testInfo: TestInfo, page: Page, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' })
}
/** Whole week column headers between the frozen name column and the sticky "รวม" column (m6-responsive). */
async function wholeWeekColumns(grid: Locator): Promise<number> {
  return grid.evaluate((el) => {
    const heads = [...el.querySelectorAll<HTMLElement>('[role="columnheader"]')]
    const corner = heads[0]!.getBoundingClientRect()
    const total = heads[heads.length - 1]!.getBoundingClientRect()
    return heads
      .slice(1, -1)
      .map((h) => h.getBoundingClientRect())
      .filter((r) => r.left >= corner.right - 1 && r.right <= total.left + 1).length
  })
}
/** The lease POST answered (TASK bodies take the lease on first focus, M6.1-D8). Start before the focus. */
function waitForLeasePost(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/pages\/[0-9a-f-]{36}\/lock$/.test(new URL(r.url()).pathname),
  )
}
function waitForSearch(page: Page) {
  return page.waitForResponse((r) => new URL(r.url()).pathname === '/api/search')
}

async function openPosTasks(page: Page, who: 'cindy' | 'ivy' | 'manager'): Promise<TaskListPage> {
  await loginAs(page, who)
  const tasks = new TaskListPage(page)
  await tasks.goto(await projectIdByName(POS))
  return tasks
}

/** A 12-column table wider than the 760 px column: a POS document and the UAT body (T8, V2). */
async function seedWideDocs(tx: Tx): Promise<{ pageId: string; taskId: string }> {
  await insertPage(tx, {
    space: 'PROJECT',
    projectName: POS,
    title: WIDE_DOC,
    byNickname: 'Cindy',
    content: [...paragraph('ย่อหน้าก่อนตาราง'), wideTable12(), ...paragraph('ย่อหน้าหลังตาราง')],
  })
  const body = await insertTaskBody(tx, {
    projectName: POS,
    taskName: UAT,
    content: [...paragraph('เนื้อหางานก่อนตาราง'), wideTable12(), ...paragraph('เนื้อหางานหลังตาราง')],
  })
  return { pageId: body.pageId, taskId: body.taskId }
}
const WIDE_DOC = 'เอกสารตาราง 12 คอลัมน์'
/** The visual lens's viewports (M6.1-D2). */
const VIEWPORT_HEIGHT: Record<number, number> = { 390: 844, 768: 1024, 1280: 800, 1920: 1080, 2560: 1440 }

/** The reading column fits ≤ 760 px, centred in main; the 12-col table scrolls inside its block (AC-1602). */
async function expectReadingColumn(page: Page, what: string): Promise<void> {
  const shell = new ShellPage(page)
  const column = page.getByTestId('page-column')
  await expect(column).toHaveAttribute('data-full-width', 'false')
  const c = await box(column)
  const main = await box(shell.main())
  expect(c.width, `${what}: column ≤ 760`).toBeLessThanOrEqual(760)
  expect(Math.abs(c.x + c.width / 2 - (main.x + main.width / 2)), `${what}: column centred`).toBeLessThanOrEqual(2)
  const wrapper = new EditorPage(page).content().locator('[data-content-type="table"] .tableWrapper').first()
  await expect
    .poll(() => wrapper.evaluate((el) => el.scrollWidth > el.clientWidth), {
      message: `${what}: the table scrolls inside its block`,
    })
    .toBe(true)
  await expectNoOverflow(page, what)
}

/** Full width: the column spans main minus the `--space-12` gutters at most (AC-1602 "เต็มพื้นที่"). */
async function expectFullWidthColumn(page: Page, what: string): Promise<void> {
  const column = page.getByTestId('page-column')
  await expect(column).toHaveAttribute('data-full-width', 'true')
  const c = await box(column)
  const main = await box(new ShellPage(page).main())
  expect(c.width, `${what}: full width`).toBeGreaterThanOrEqual(main.width - 2 * 48 - 2)
  await expectNoOverflow(page, what)
}

// =============================================================================================================
test.describe('T1 ⟲ (AC-621, FR-681, FR-684) panel body → เปิดเป็นหน้า · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('type a heading, a checklist, paste a PNG and an Excel 4×3 in the panel; the page shows the same; reload keeps it', async ({
    page,
  }) => {
    const pos = await projectIdByName(POS)
    const r1 = await taskIdOf(POS, R1)
    const tasks = await openPosTasks(page, 'cindy')
    const editor = new EditorPage(page)

    await tasks.clickRow(R1) // FR-685: a row click opens the panel
    await expect(tasks.panelBody()).toBeVisible()
    await editor.waitReady()
    expect(await editor.placeholders()).toContain(th.editor.taskPlaceholder)
    expect(await taskBodyRows(r1), 'no body row before the first edit (FR-681)').toHaveLength(0)

    await editor.focusEnd()
    await editor.type('## ขอบเขต')
    await page.keyboard.press('Enter')
    await editor.type('[] ติดตั้งเครื่อง')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter') // an empty checklist item + Enter → a plain paragraph
    await realClipboardImage(page, PNG_1X1_B64)
    await page.keyboard.press('ControlOrMeta+V')
    await expect(editor.images()).toHaveCount(1)
    await editor.newBlock()
    await syntheticPaste(page, {
      'text/html': fixture('excel-4x3.html'),
      'text/plain': fixture('excel-4x3.tsv'),
    })
    await expect(editor.tables()).toHaveCount(1)
    await editor.waitSaved()

    const check = async (): Promise<void> => {
      await expect(editor.content().getByRole('heading', { level: 2, name: 'ขอบเขต' })).toBeVisible()
      await expect(editor.content().locator('[data-content-type="checkListItem"]').first()).toContainText(
        'ติดตั้งเครื่อง',
      )
      await expect(editor.images()).toHaveCount(1)
      await expect(editor.images().first()).toHaveAttribute('src', FILE_SRC)
      await expect.poll(() => editor.tableShape(0)).toEqual({ rows: 3, cols: 4 }) // "4×3" = 4 columns × 3 rows
    }
    await check()

    await tasks.panelOpenAsPage().click()
    await page.waitForURL((u) => u.pathname === `/t/${r1}`)
    const tp = new TaskPage(page)
    await tp.waitReady()
    await expect.poll(() => tp.header.crumbTexts()).toEqual([POS, R1])
    await expect(tp.header.crumbLink(POS)).toHaveAttribute('href', `/projects/${pos}/tasks`)
    await expect(tp.title()).toHaveText(R1)
    for (const label of Object.values(th.taskPage.properties)) await expect(tp.props.row(label)).toBeVisible()
    await editor.waitReady()
    await check()

    await page.reload()
    await tp.waitReady()
    await editor.waitReady()
    await check()

    const rows = await taskBodyRows(r1)
    expect(rows, 'one pages row of kind TASK for the task').toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'TASK', title: '', deletedAt: null })
    expect(rows[0]!.contentText).toContain('ติดตั้งเครื่อง')
  })
})

// =============================================================================================================
test.describe('T2 ⟲ (AC-622, FR-683, FR-1604) every property on the task page · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('status, due date, + Ivy → วางแผน 3 วัน, blocker, + subtask; list, board and grid agree; tick → struck + completed today', async ({
    page,
  }) => {
    const pos = await projectIdByName(POS)
    const rollout = await taskIdOf(POS, ROLLOUT)
    await loginAs(page, 'cindy')
    const tp = new TaskPage(page)
    await tp.goto(rollout)

    await tp.props.setStatus(S.todo, S.doing)
    await expect(toastWith(page, th.tasks.status.toast.changed(S.doing))).toBeVisible()
    await expect(tp.props.statusChip(S.doing)).toBeVisible()
    await tp.props.setDate('due', '2026-10-16')
    await tp.props.addAssignee('Ivy')
    await expect(tp.props.planButton('Ivy')).toBeVisible()
    await tp.props.planButton('Ivy').click()
    const plan = new PlanRangeDialog(page, 'Ivy', ROLLOUT)
    await expect(plan.root()).toBeVisible()
    await plan.fill('3', '2026-10-12', '2026-10-16')
    await plan.apply()
    await tp.props.addBlocker(UAT)
    await expect(toastWith(page, th.tasks.blockers.toast.added(UAT))).toBeVisible()
    await expect(tp.props.blockedByItem(UAT)).toBeVisible()
    const SUB = 'ย่อย T2'
    await tp.props.addSubtask(SUB)
    // a leaf with people gets its first child → people and plans move to the child (FR-610, M3)
    await expect(toastWith(page, th.tasks.toast.movedAssignees(2, SUB))).toBeVisible()
    await expect(tp.props.subtask(SUB).getByRole('link', { name: SUB, exact: true })).toHaveAttribute(
      'href',
      /^\/t\/[0-9a-f-]{36}$/,
    )

    // ← กลับ on a direct entry → the project's task tab (FR-686)
    await tp.back()
    await page.waitForURL((u) => u.pathname === `/projects/${pos}/tasks`)
    const tasks = new TaskListPage(page)
    await tasks.waitReady()
    await expect(tasks.statusChip(ROLLOUT, S.doing)).toBeVisible()
    await expect(tasks.row(ROLLOUT)).toContainText(formatThaiDate('2026-10-16'))
    await expect(tasks.unionAssignees(ROLLOUT)).toContainText('Ivy')
    await expect(tasks.blockerBadge(ROLLOUT, th.tasks.blockers.badgeWaiting(1))).toBeVisible()
    await tasks.expectLevel(SUB, 2)

    await tasks.setView('board')
    await expect(tasks.column(S.doing).getByRole('article', { name: ROLLOUT, exact: true })).toBeVisible()
    await tasks.setView('list')

    const grid = new GridPage(page)
    await grid.openTab(POS)
    const ivyRow = await grid.rowKeyOf(SUB, 'Ivy')
    const cell = await grid.reveal(ivyRow, '2026-10-12')
    await expect(grid.value(cell)).toHaveText(d1(300))

    await tp.goto(rollout)
    const answered = waitForServerAction(page)
    await tp.titleCheckbox(ROLLOUT).click()
    await answered
    await expect
      .poll(() => tp.title().evaluate((h) => getComputedStyle(h).textDecorationLine))
      .toContain('line-through')
    await expect(tp.props.row(th.taskPage.properties.done)).toContainText(
      th.tasks.completedOn(formatThaiDate(TODAY)),
    )
    expect(await taskFacts(rollout)).toMatchObject({ completedOn: TODAY, dueDate: '2026-10-16' })
  })
})

// =============================================================================================================
test.describe('T3 ⟲ (AC-623, FR-685, FR-686) opening rules, back / Esc with the scroll position · cindy', () => {
  const FILLERS = Array.from({ length: 40 }, (_, i) => `งานเติม T3-${String(i + 1).padStart(2, '0')}`)
  test.use({ viewport: { width: 1280, height: 700 } })
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: (tx) => insertRootTasksFirst(tx, { projectName: POS, names: FILLERS }),
    })
  })

  test('row click = panel; ↗ = page; Esc = back at the same scroll; Cmd+click = new tab; Shift+Space; direct entry; board, /my, /tasks and grid ↗', async ({
    page,
    context,
  }) => {
    const pos = await projectIdByName(POS)
    const rollout = await taskIdOf(POS, ROLLOUT)
    const tasks = await openPosTasks(page, 'cindy')
    const tp = new TaskPage(page)

    await tasks.row(ROLLOUT).scrollIntoViewIfNeeded()
    await tasks.clickRow(ROLLOUT)
    expect(new URL(page.url()).searchParams.get('task')).toBe(rollout)
    const before = await scrollY(page)
    expect(before, 'the list really scrolled').toBeGreaterThan(100)

    await tasks.openAsPage(ROLLOUT)
    expect(pathOf(page)).toBe(`/t/${rollout}`)
    await tp.waitReady()
    await blur(page) // Esc outside inputs / the editor
    await page.keyboard.press('Escape')
    await page.waitForURL((u) => u.pathname === `/projects/${pos}/tasks`)
    await tasks.waitReady()
    await expect.poll(async () => Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(8)

    // Cmd/Ctrl+click on ↗ → a new tab (a real link, FR-685)
    await tasks.row(ROLLOUT).hover()
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      tasks.openAsPageLink(ROLLOUT).click({ modifiers: ['ControlOrMeta'] }),
    ])
    await tab.waitForURL(TASK_URL)
    expect(new URL(tab.url()).pathname).toBe(`/t/${rollout}`)
    await tab.close()
    expect(pathOf(page)).toBe(`/projects/${pos}/tasks`)

    // Shift+Space on a focused row → the page
    await tasks.focus(ROLLOUT)
    await page.keyboard.press('Shift+Space')
    await page.waitForURL((u) => u.pathname === `/t/${rollout}`)
    await tp.waitReady()

    // direct entry (no in-app history) → ← กลับ = the project's task tab
    await tp.goto(rollout)
    await tp.back()
    await page.waitForURL((u) => u.pathname === `/projects/${pos}/tasks`)

    // /my ↗ and /tasks ↗
    const my = new MyTasksPage(page)
    await my.goto()
    const r1 = await taskIdOf(POS, R1)
    await my.item(R1).hover()
    await my.openAsPageLink(R1).click()
    await page.waitForURL((u) => u.pathname === `/t/${r1}`)

    const team = new TeamTasksPage(page)
    await team.goto()
    await team.filterProject(CRM)
    const crmTask = await taskIdOf(CRM, CRM_CINDY)
    await team.item(CRM_CINDY).hover()
    await team.openAsPageLink(CRM_CINDY).click()
    await page.waitForURL((u) => u.pathname === `/t/${crmTask}`)

    // board ↗ (then back to the list view — the preference is shared with /tasks, X74)
    await tasks.goto(pos)
    await tasks.setView('board')
    await tasks.card(ROLLOUT).hover()
    await tasks.cardOpenAsPageLink(ROLLOUT).click()
    await page.waitForURL((u) => u.pathname === `/t/${rollout}`)
    await tasks.goto(pos)
    await tasks.setView('list')

    // grid: ↗ = page; double-click = panel (M6-D18 kept)
    const grid = new GridPage(page)
    await grid.openTab(POS)
    const header = grid.rowHeader(ROLLOUT, 'Mint')
    await expect(async () => {
      await grid.root().evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }))
      await expect(header).toBeVisible({ timeout: 1_000 })
    }).toPass()
    const gridAt = await grid.root().evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))
    await grid.openTaskPage(ROLLOUT, 'Mint')
    expect(pathOf(page)).toBe(`/t/${rollout}`)
    // FR-686: back at the same place of the grid's own scroll box — no manual re-scroll
    await page.goBack()
    await grid.waitReady(POS)
    await expect(header).toBeVisible()
    await expect
      .poll(() => grid.root().evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft })))
      .toEqual(gridAt)
    await grid.openPanelByDoubleClick(ROLLOUT, 'Mint')
    await expect(tasks.panelTitle(ROLLOUT)).toBeVisible()
  })
})

// =============================================================================================================
test.describe('T4 ⟲ (AC-624, FR-687, FR-690) permissions on a POS body with an image · ivy, peter', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ allowedConsoleErrors: [/status of 404/] })
  const WORD = 'ลิ้นชักเก็บเงินสดลับ'
  let uat = ''
  let bodyId = ''
  let imageId = ''
  test.beforeAll(async () => {
    let seeded: { pageId: string; taskId: string } | undefined
    await resetDb(undefined, {
      extras: async (tx) => {
        seeded = await insertTaskBody(tx, {
          projectName: POS,
          taskName: UAT,
          content: paragraph(`รายละเอียด ${WORD} T4`),
        })
      },
    })
    uat = seeded!.taskId
    bodyId = seeded!.pageId
  })

  test('ivy (POS member): uploads an image into the body; finds the body word in Cmd+K and opens /t', async ({
    page,
  }) => {
    await loginAs(page, 'ivy')
    const up = await page.request.post('/api/files', {
      headers: { origin: E2E.baseUrl },
      multipart: {
        file: { name: 't4.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_B64, 'base64') },
        pageId: bodyId,
      },
    })
    expect(up.status()).toBe(201)
    imageId = ((await up.json()) as { id: string }).id
    expect((await page.request.get(`/api/files/${imageId}`)).status()).toBe(200)
    expect((await page.request.get(`/api/tasks/${uat}/body`)).status()).toBe(200)

    const shell = new ShellPage(page)
    await shell.goto('/home')
    const palette = new Palette(page)
    await palette.openByKeyboard()
    await expect(palette.dialog()).toBeVisible()
    const searched = waitForSearch(page)
    await palette.search(WORD)
    await searched
    const hit = palette.taskResult(UAT)
    await expect(hit).toBeVisible()
    await expect(hit).toContainText(th.palette.matchedInContent)
    await expect(palette.pageResults()).toHaveCount(0) // FR-682: a TASK page is never a page hit
    await page.keyboard.press('Enter')
    await page.waitForURL((u) => u.pathname === `/t/${uat}`)
    await new TaskPage(page).waitReady()
  })

  test('peter (not in POS): 404 on /t, the body, lease, save, the image; Cmd+K finds nothing', async ({ page }) => {
    expect(imageId, 'the previous test uploaded the image').not.toBe('')
    await loginAs(page, 'peter')
    expect((await page.request.get(`/api/tasks/${uat}/body`)).status()).toBe(404)
    expect((await page.request.get(`/api/pages/${bodyId}`)).status()).toBe(404)
    expect((await page.request.get(`/api/pages/${bodyId}/lock`)).status()).toBe(404)
    expect(
      (await page.request.post(`/api/pages/${bodyId}/lock`, { headers: { origin: E2E.baseUrl } })).status(),
    ).toBe(404)
    expect(
      (
        await page.request.put(`/api/pages/${bodyId}/content`, {
          headers: { origin: E2E.baseUrl, 'content-type': 'application/json' },
          data: { baseVersion: 1, content: paragraph('แอบแก้') },
        })
      ).status(),
    ).toBe(404)
    expect((await page.request.get(`/api/files/${imageId}`)).status()).toBe(404)

    const shell = new ShellPage(page)
    await shell.goto('/home')
    const palette = new Palette(page)
    await palette.openByKeyboard()
    const searched = waitForSearch(page)
    await palette.search(WORD)
    const res = await searched
    expect(JSON.stringify(await res.json())).not.toContain(WORD) // SPEC §11.2 leak check
    await expect(palette.taskResults()).toHaveCount(0)
    await expect(palette.dialog()).not.toContainText(UAT)
    await page.keyboard.press('Escape')

    const tp = new TaskPage(page)
    const doc = await tp.goto(uat)
    expect(doc?.status()).toBe(404)
    await expect(tp.notFound()).toBeVisible()
    expect(await page.content()).not.toContain(WORD)
  })
})

// =============================================================================================================
test.describe('T5 ⟲ (AC-625, FR-688) the lease covers the body only · cindy + ivy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('cindy edits the UAT body on /t; ivy in the panel sees "Cindy กำลังแก้" read-only, yet changes status and due date', async ({
    page,
    browser,
  }) => {
    const uat = await taskIdOf(POS, UAT)
    await loginAs(page, 'cindy')
    const tp = new TaskPage(page)
    await tp.goto(uat)
    const leased = waitForLeasePost(page)
    await tp.editor.focusEnd()
    await tp.editor.type('แก้โดย Cindy T5')
    expect((await leased).status()).toBe(200)
    await tp.editor.waitSaved()

    const ivy = await openGuardedPage(browser)
    try {
      await loginAs(ivy.page, 'ivy')
      const tasks = new TaskListPage(ivy.page)
      await tasks.goto(await projectIdByName(POS))
      await tasks.openPanel(UAT)
      const ivyEditor = new EditorPage(ivy.page)
      await ivyEditor.waitReady()
      await expect(tasks.panel().getByText(th.editor.lease.badge('Cindy')).first()).toBeVisible()
      await ivyEditor.expectReadOnly()
      await expect(ivyEditor.content()).toContainText('แก้โดย Cindy T5')

      const props = tasks.panelProps()
      await props.setStatus(S.todo, S.waitData)
      await expect(toastWith(ivy.page, th.tasks.status.toast.changed(S.waitData))).toBeVisible()
      await expect(tasks.statusChip(UAT, S.waitData)).toBeVisible()
      await props.setDate('due', '2026-10-09')
      await expect(tasks.row(UAT)).toContainText(formatThaiDate('2026-10-09'))
      expect(await taskFacts(uat)).toMatchObject({ statusName: S.waitData, dueDate: '2026-10-09' })
      await ivyEditor.expectReadOnly() // still Cindy's body
    } finally {
      await ivy.close()
    }
  })
})

// =============================================================================================================
test.describe('T6 ⟲ (AC-626, FR-689) delete a parent whose child has a body → เลิกทำ · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('the body is soft-deleted with the subtree and comes back with the undo', async ({ page }) => {
    const PARENT = 'แม่ T6'
    const KIDS = ['ลูก 1', 'ลูก 2'] as const
    const TEXT = 'เนื้อหาของลูก 1 ใน T6'
    const tasks = await openPosTasks(page, 'cindy')
    await tasks.addTree(PARENT, KIDS)
    const child = await tasks.settledId(KIDS[0])

    await tasks.openPanel(KIDS[0])
    const editor = new EditorPage(page)
    await editor.focusEnd()
    await editor.type(TEXT)
    await editor.waitSaved()
    await tasks.panel().getByRole('button', { name: th.tasks.panel.close, exact: true }).click()
    await expect(tasks.panel()).toHaveCount(0)

    const deleted = th.tasks.toast.deletedWithChildren(PARENT, KIDS.length)
    const answered = waitForServerAction(page)
    await tasks.rowMenu(PARENT, th.tasks.rowMenu.delete)
    await answered
    await expect(toastWith(page, deleted)).toBeVisible()
    for (const n of [PARENT, ...KIDS]) await expect(tasks.row(n)).toHaveCount(0)
    const gone = await taskBodyRows(child)
    expect(gone).toHaveLength(1)
    expect(gone[0]!.deletedAt, 'the body is soft-deleted with the task batch').not.toBeNull()

    const restored = waitForServerAction(page)
    await undoButtonOf(page, deleted).click()
    await restored
    for (const n of [PARENT, ...KIDS]) await expect(tasks.row(n)).toBeVisible()
    await tasks.openPanel(KIDS[0])
    await expect(tasks.panelBody()).toContainText(TEXT)
    const back = await taskBodyRows(child)
    expect(back[0]).toMatchObject({ deletedAt: null, deletedBatch: null })
  })
})

// =============================================================================================================
test.describe('T7 ⟲ (AC-627, AC-628, FR-680, FR-682, FR-691) lazy rows, no /หน้า, 📄, no TASK page in page lists · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('quick add + opening the panel create no row; the slash menu has no sub-page; 📄 in list, board, /my, /tasks; trees, Cmd+K pages and @ never show a body', async ({
    page,
  }) => {
    const pos = await projectIdByName(POS)
    const tasks = await openPosTasks(page, 'cindy')
    const project = new ProjectPage(page)
    const sidebar = new SidebarPage(page)
    const editor = new EditorPage(page)

    // the page lists before any body exists
    await project.goto(pos, 'pages')
    const tabBefore = await project.pagesTree(POS).rows()
    await sidebar.expandProject(POS)
    const sideBefore = await sidebar.projectTree(POS).rows()
    const countBefore = await taskPageCount()

    await tasks.goto(pos)
    const T7 = 'งาน T7'
    await tasks.addTasks([T7])
    const t7 = await tasks.settledId(T7)
    expect(await taskBodyRows(t7), 'AC-627: quick add creates no pages row').toHaveLength(0)
    await tasks.openPanel(T7)
    await editor.waitReady()
    expect(await taskBodyRows(t7), 'FR-681: opening the panel creates no row').toHaveLength(0)

    // FR-680: no sub-page item in a TASK body, by title or by query
    await editor.focusEnd()
    await editor.slash('')
    const subpage = new RegExp(`^\\s*${escapeRegExp(th.editor.slash.subpage.title)}\\s*$`)
    await expect(editor.slashItems().first()).toBeVisible()
    await expect(editor.slashItems().filter({ hasText: subpage })).toHaveCount(0)
    await page.keyboard.type(th.editor.slash.subpage.title)
    await expect(editor.slashItems().filter({ hasText: subpage })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // give R1 (Cindy's own task, so it is on her /my) a body on its page
    const r1 = await taskIdOf(POS, R1)
    const tp = new TaskPage(page)
    await tp.goto(r1)
    await tp.editor.focusEnd()
    const BODY = 'รายละเอียดงาน T7 สำหรับค้นหา'
    await tp.editor.type(BODY)
    await tp.editor.waitSaved()

    await tasks.goto(pos)
    await expect(tasks.hasBodyMarker(R1)).toBeVisible()
    await expect(tasks.hasBodyMarker(ROLLOUT)).toHaveCount(0)
    await tasks.setView('board')
    await expect(tasks.cardHasBodyMarker(R1)).toBeVisible()
    await tasks.setView('list')
    const my = new MyTasksPage(page)
    await my.goto()
    await expect(my.hasBodyMarker(R1)).toBeVisible()
    const team = new TeamTasksPage(page)
    await team.goto()
    await team.filterProject(POS)
    await expect(team.hasBodyMarker(R1)).toBeVisible()

    // FR-682: no TASK page in the project tab, the sidebar tree, the Cmd+K pages group or the @ picker
    expect(await taskPageCount()).toBeGreaterThan(countBefore)
    await project.goto(pos, 'pages')
    await expect.poll(() => project.pagesTree(POS).rows()).toEqual(tabBefore)
    await sidebar.expandProject(POS)
    await expect.poll(() => sidebar.projectTree(POS).rows()).toEqual(sideBefore)
    for (const r of await sidebar.projectTree(POS).rows()) expect(r.text).not.toBe(th.pages.untitled)

    const palette = new Palette(page)
    await palette.openByKeyboard()
    const searched = waitForSearch(page)
    await palette.search(BODY)
    await searched
    await expect(palette.taskResult(R1)).toBeVisible()
    await expect(palette.pageResults()).toHaveCount(0)
    await page.keyboard.press('Escape')

    await new PageScreen(page).goto(await charterIdOf(POS))
    await editor.waitReady()
    await editor.newBlock() // '@' opens the picker at a word start only
    const WORD = BODY.split(' ')[0]!
    const titleSearch = page.waitForResponse((r) => {
      const u = new URL(r.url())
      return u.pathname === '/api/search' && u.searchParams.get('titleOnly') === '1'
    })
    await page.keyboard.type(`@${WORD}`)
    const hits = (await (await titleSearch).json()) as { pages: { title: string }[] }
    expect(hits.pages, 'the @ picker gets no page for a body word (TASK pages have no title)').toEqual([])
    await expect(editor.suggestionGroup(th.editor.mention.groupPages)).toHaveCount(0)
    await expect(page.locator('.bn-suggestion-menu')).not.toContainText(th.pages.untitled)
    await page.keyboard.press('Escape')
  })
})

// =============================================================================================================
test.describe('T8 ⟲ (AC-1602, FR-1602) เต็มความกว้าง on /p and /t · cindy, ivy', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })
  const LOCKED = 'นโยบายล็อก T8'
  let uatBody = ''
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        uatBody = (await seedWideDocs(tx)).pageId
        await insertPage(tx, {
          space: 'WORKSPACE',
          title: LOCKED,
          byNickname: 'Manager',
          locked: true,
          content: paragraph('หน้า wiki ที่ล็อก'),
        })
      },
    })
  })

  test('760 column → full width (✓, optimistic, one audit row per toggle) → Cmd+Z → 760; again → reload and ivy see it; locked wiki has no switch for ivy', async ({
    page,
    browser,
  }) => {
    const docId = await idOf('page', WIDE_DOC)
    const uat = await taskIdOf(POS, UAT)
    await loginAs(page, 'cindy')

    const steps: { name: string; open: () => Promise<void>; toggle: () => Promise<void>; entityId: string }[] = [
      {
        name: '/p',
        entityId: docId,
        open: async () => {
          const ps = new PageScreen(page)
          await ps.goto(docId)
          await ps.editor.waitReady()
        },
        toggle: () => new PageScreen(page).toggleFullWidth(WIDE_DOC),
      },
      {
        name: '/t',
        entityId: uatBody,
        open: async () => {
          const tp = new TaskPage(page)
          await tp.goto(uat)
          await tp.editor.waitReady()
        },
        toggle: () => new TaskPage(page).toggleFullWidth(),
      },
    ]

    for (const s of steps) {
      await s.open()
      await expectReadingColumn(page, s.name)
      const since = await auditWatermark()
      const audits = () => auditRowsSince(since, { entity: 'page', entityId: s.entityId })

      await s.toggle()
      await expectFullWidthColumn(page, `${s.name} on`)
      await expect.poll(async () => (await audits()).length).toBe(1)
      await (s.name === '/p' ? new PageScreen(page).openMenu(WIDE_DOC) : new TaskPage(page).openMenu())
      await expect(page.getByRole('menuitemcheckbox', { name: th.layout.fullWidth })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await page.keyboard.press('Escape')

      await blur(page)
      const undone = waitForServerAction(page)
      await page.keyboard.press('ControlOrMeta+KeyZ') // no toast: not a delete (FR-1602)
      await undone
      await expect(page.getByTestId('page-column')).toHaveAttribute('data-full-width', 'false')
      await expect.poll(async () => (await audits()).length).toBe(2)

      await s.toggle()
      await expect.poll(async () => (await audits()).length).toBe(3)
      expect((await audits()).map((a) => a.action)).toEqual(['update', 'update', 'update'])
      await page.reload()
      await s.open()
      await expectFullWidthColumn(page, `${s.name} after reload`)

      const ivy = await openGuardedPage(browser)
      try {
        await loginAs(ivy.page, 'ivy')
        await ivy.page.goto(s.name === '/p' ? `/p/${docId}` : `/t/${uat}`)
        await new ShellPage(ivy.page).waitForHydration()
        await expect(ivy.page.getByTestId('page-column')).toHaveAttribute('data-full-width', 'true')
        expect(await docOverflow(ivy.page)).toBeLessThanOrEqual(0)
      } finally {
        await ivy.close()
      }
    }

    // ivy may only read a protected wiki page → no switch (M6.1-D15, FR-510)
    const ivy = await openGuardedPage(browser)
    try {
      await loginAs(ivy.page, 'ivy')
      const ps = new PageScreen(ivy.page)
      await ps.goto(await idOf('page', LOCKED))
      await ps.openMenu(LOCKED)
      await expect(ps.fullWidthItem()).toHaveCount(0)
      await ivy.page.keyboard.press('Escape')
    } finally {
      await ivy.close()
    }
  })
})

// =============================================================================================================
test.describe('T9 ⟲ (AC-1603, FR-1603) the 48 px header bar on every screen · manager', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('crumbs as listed; work screens: h1 = last crumb in the bar; documents: h1 in the column; actions on the right', async ({
    page,
  }) => {
    const pos = await projectIdByName(POS)
    const charter = await charterIdOf(POS)
    const r1 = await taskIdOf(POS, R1)
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    const header = new HeaderBar(page)
    type Screen = { path: string; crumbs: string[]; doc?: boolean; actions?: boolean }
    const screens: Screen[] = [
      { path: '/home', crumbs: [th.home.title] },
      { path: `/projects/${pos}/overview`, crumbs: [th.nav.projects, POS], actions: true },
      { path: `/projects/${pos}/plan`, crumbs: [th.nav.projects, POS], actions: true },
      { path: `/projects/${pos}/tasks`, crumbs: [th.nav.projects, POS], actions: true },
      { path: `/p/${charter}`, crumbs: [POS, th.pages.charterTitle], doc: true, actions: true },
      { path: `/t/${r1}`, crumbs: [POS, R1], doc: true, actions: true },
      { path: '/calendar', crumbs: [th.calendar.title], actions: true },
      { path: '/settings/employees', crumbs: [th.nav.settings, th.nav.employees], actions: true },
    ]
    for (const s of screens) {
      await shell.goto(s.path)
      await header.expectHeight48()
      const crumbs = await header.crumbTexts()
      expect(crumbs.length, `${s.path} crumbs`).toBe(s.crumbs.length)
      for (const [i, c] of s.crumbs.entries()) expect(crumbs[i], `${s.path} crumb ${i}`).toContain(c)
      await expect(page.getByRole('heading', { level: 1 }), `${s.path}: one h1`).toHaveCount(1)
      if (s.doc) {
        await expect(header.h1(), `${s.path}: no h1 in the bar`).toHaveCount(0)
        await expect(page.getByTestId('page-column').getByRole('heading', { level: 1 })).toHaveCount(1)
      } else {
        await expect(header.h1()).toContainText(s.crumbs.at(-1)!)
      }
      if (s.actions) {
        const bar = await box(header.bar())
        const buttons = header.actions().locator('button:visible, a:visible')
        expect(await buttons.count(), `${s.path}: has actions`).toBeGreaterThan(0)
        for (const b of await buttons.all()) {
          const bb = await box(b)
          expect(bb.x, `${s.path}: action on the right half`).toBeGreaterThanOrEqual(bar.x + bar.width / 2)
        }
      }
    }
  })
})

// =============================================================================================================
test.describe('V1 ⟲ (AC-1601, FR-1601) work screens use the full width · manager', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('1920 and 2560: grid, list, board, /tasks reach the right edge (≤ 24 px); 2560 shows more week columns', async ({
    page,
  }) => {
    const pos = await projectIdByName(POS)
    await loginAs(page, 'manager')
    const weeks: Record<number, number> = {}
    for (const width of [1920, 2560]) {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 1440 })
      const grid = new GridPage(page)
      await new ShellPage(page).goto(`/projects/${pos}/plan`)
      await grid.waitReady(POS)
      expect(await rightGap(page, grid.root()), `grid @${width}`).toBeLessThanOrEqual(24)
      weeks[width] = await wholeWeekColumns(grid.root())

      const tasks = new TaskListPage(page)
      await tasks.goto(pos)
      expect(await rightGap(page, tasks.list()), `list @${width}`).toBeLessThanOrEqual(24)
      await tasks.setView('board')
      expect(await rightGap(page, tasks.board()), `board @${width}`).toBeLessThanOrEqual(24)
      await tasks.setView('list')

      const team = new TeamTasksPage(page)
      await team.goto()
      expect(await rightGap(page, page.locator('[data-team-project]').first()), `/tasks @${width}`).toBeLessThanOrEqual(
        24,
      )
      await expectNoOverflow(page, `/tasks @${width}`)
    }
    expect(weeks[2560]!, 'more whole week columns at 2560 than at 1920').toBeGreaterThan(weeks[1920]!)
  })
})

// =============================================================================================================
test.describe('V2 ⟲ (AC-1602) the 760 px column with a 12-column table · manager', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })
  test.beforeAll(async () => {
    await resetDb(undefined, { extras: (tx) => seedWideDocs(tx) })
  })

  for (const width of [1920, 2560]) {
    test(`/p and /t at ${width}: column ≤ 760, the table scrolls in its block, the page never scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 1440 })
      await loginAs(page, 'manager')
      const ps = new PageScreen(page)
      await ps.goto(await idOf('page', WIDE_DOC))
      await ps.editor.waitReady()
      await expectReadingColumn(page, `/p @${width}`)
      const tp = new TaskPage(page)
      await tp.goto(await taskIdOf(POS, UAT))
      await tp.editor.waitReady()
      await expectReadingColumn(page, `/t @${width}`)
    })
  }

  test('dark mode: the table cell borders use the dark --border-subtle (#2e3238)', async ({ page }) => {
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    await shell.goto('/home')
    const toDark = waitForServerAction(page)
    await shell.chooseTheme(th.prefs.themes.dark)
    await toDark
    try {
      const ps = new PageScreen(page)
      await ps.goto(await idOf('page', WIDE_DOC))
      await ps.editor.waitReady()
      await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
      const td = page.locator('.bn-editor [data-content-type="table"] td').first()
      await expect(td).toBeVisible()
      await expect.poll(() => td.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(46, 50, 56)')
    } finally {
      // leave the shared account on the default theme for later specs
      await shell.goto('/home')
      const toLight = waitForServerAction(page)
      await shell.chooseTheme(th.prefs.themes.light)
      await toLight
    }
  })
})

// =============================================================================================================
test.describe('V3 ⟲ (AC-1604, FR-1606) phone 390×844, tap only · ivy', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('/home; /my tick + status; ☰; /t read + status + due date; แจ้งลา; read a document — no sideways scroll', async ({
    page,
  }) => {
    await loginAs(page, 'ivy')
    const shell = new ShellPage(page)
    const header = new HeaderBar(page)

    await shell.goto('/home')
    await expectNoOverflow(page, '/home')

    const my = new MyTasksPage(page)
    await my.goto()
    await expectNoOverflow(page, '/my')
    let answered = waitForServerAction(page)
    await my.checkbox(IVY_CRM).tap()
    await answered
    await expect(toastWith(page, th.tasks.toast.released('10.0', 4))).toBeVisible() // BR-52 (m3 E13)
    await my.statusChip(UAT, S.todo).tap()
    await my.pickStatusOption(S.doing, 'tap')
    await expect(toastWith(page, th.tasks.status.toast.changed(S.doing))).toBeVisible()
    await expect(my.statusChip(UAT, S.doing)).toBeVisible()

    await header.menuButton().tap()
    await expect(shell.nav()).toBeVisible()
    await shell.navLink(th.nav.home).tap()
    await page.waitForURL((u) => u.pathname === '/home')
    await expect(shell.nav()).toBeHidden()

    const uat = await taskIdOf(POS, UAT)
    const tp = new TaskPage(page)
    await tp.goto(uat)
    await expect(tp.title()).toHaveText(UAT)
    await expectNoOverflow(page, '/t')
    await tp.props.statusChip(S.doing).tap()
    const filter = page.getByRole('combobox', { name: th.tasks.status.filter, exact: true })
    await expect(filter).toBeVisible()
    answered = waitForServerAction(page)
    await page
      .getByRole('listbox', { name: th.tasks.status.label, exact: true })
      .getByRole('option')
      .filter({ has: page.getByText(S.waitData, { exact: true }) })
      .first()
      .tap()
    await answered
    await expect(tp.props.statusChip(S.waitData)).toBeVisible()
    // due date: tap each section (DD / MM / BBBB) and type — month, year, then day so it is valid once
    const sections = tp.props
      .row(th.taskPage.properties.dates)
      .getByRole('group', { name: th.tasks.panel.dueDate })
      .getByRole('spinbutton')
    await expect(sections).toHaveCount(3)
    await sections.nth(1).tap()
    await page.keyboard.type('10')
    await sections.nth(2).tap()
    await page.keyboard.type(String(2026 + 543))
    answered = waitForServerActionWith(page, '"2026-10-23"')
    await sections.nth(0).tap()
    await page.keyboard.type('23')
    await answered
    expect(await taskFacts(uat)).toMatchObject({ dueDate: '2026-10-23', statusName: S.waitData })
    await expectNoOverflow(page, '/t after edits')

    // แจ้งลา from the user menu (in the drawer on phones)
    await header.menuButton().tap()
    await shell.userMenuButton().tap()
    await page.getByRole('menuitem', { name: th.nav.reportLeave, exact: true }).tap()
    const leave = new LeaveDialog(page)
    await leave.expectOpen('create')
    const paper = await box(page.locator('.MuiDialog-paper'))
    expect(paper.x + paper.width).toBeLessThanOrEqual(391)
    await leave.typeSelect().tap()
    await leave.typeOptions().first().tap()
    answered = waitForServerAction(page)
    await leave.root().getByRole('button', { name: th.timeOff.dialog.save, exact: true }).tap()
    await answered
    await expect(leave.saved()).toBeVisible()
    await leave.root().getByRole('button', { name: th.timeOff.dialog.close, exact: true }).tap()
    await leave.expectClosed()

    const ps = new PageScreen(page)
    await ps.goto(await charterIdOf(POS))
    await ps.editor.waitReady()
    await expect(ps.editor.content()).toBeVisible()
    await expectNoOverflow(page, '/p charter')
  })
})

// =============================================================================================================
test.describe('V3b ⟲ (FR-1603, FR-1606) phone 390×844: the header first row is 48 px on every screen · manager', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('☰ and the screen name keep the same place, wrapped actions or not', async ({ page }) => {
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    const header = new HeaderBar(page)
    const pos = await projectIdByName(POS)
    // /projects, /calendar and /clients wrap their actions onto a second row at 390 px; the others do not
    const routes = ['/home', '/my', '/tasks', '/projects', '/calendar', '/clients', `/projects/${pos}/tasks`]
    for (const route of routes) {
      await shell.goto(route)
      await header.expectFirstRow48(route)
    }
  })
})

// =============================================================================================================
test.describe('V4 ⟲ (AC-1604) tablet 768×1024: every route · manager', () => {
  test.use({ viewport: { width: 768, height: 1024 } })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('no horizontal overflow, header bar visible; the task page properties are editable', async ({ page }) => {
    const pos = await projectIdByName(POS)
    const charter = await charterIdOf(POS)
    const r1 = await taskIdOf(POS, R1)
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    const header = new HeaderBar(page)
    const routes = [
      '/home',
      '/my',
      '/tasks',
      '/calendar',
      '/projects',
      '/clients',
      '/settings',
      '/settings/holidays',
      '/settings/leave-types',
      '/settings/positions',
      '/settings/employees',
      `/projects/${pos}/overview`,
      `/projects/${pos}/tasks`,
      `/projects/${pos}/plan`,
      `/projects/${pos}/pages`,
      `/p/${charter}`,
      `/t/${r1}`,
    ]
    for (const route of routes) {
      await shell.goto(route)
      await expect(header.bar(), `header bar on ${route}`).toBeVisible()
      await expectNoOverflow(page, route)
    }
    const tp = new TaskPage(page)
    await tp.goto(r1)
    await expect(tp.props.statusChip(S.todo)).toBeEnabled()
    await tp.props.chooseCertainty('tentative')
    await expect(tp.props.certaintyButton()).toContainText(th.tasks.certainty.tentative)
    await tp.props.setDate('due', '2026-10-30')
    expect(await taskFacts(r1)).toMatchObject({ dueDate: '2026-10-30' })
  })
})

// =============================================================================================================
test.describe('V5 ⟲ visual evidence 390/768/1280/1920/2560 × light/dark (M6.1-D2, S7.3) · manager', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('screenshots of the main screens are attached; nothing overflows', async ({ page }, testInfo) => {
    test.setTimeout(15 * 60_000)
    const pos = await projectIdByName(POS)
    const charter = await charterIdOf(POS)
    const r1 = await taskIdOf(POS, R1)
    await loginAs(page, 'manager')
    const shell = new ShellPage(page)
    const routes: { name: string; path: string }[] = [
      { name: 'home', path: '/home' },
      { name: 'my', path: '/my' },
      { name: 'pos-plan', path: `/projects/${pos}/plan` },
      { name: 'pos-tasks', path: `/projects/${pos}/tasks` },
      { name: 'pos-tasks-panel', path: `/projects/${pos}/tasks?task=${r1}` },
      { name: 'task-page', path: `/t/${r1}` },
      { name: 'charter', path: `/p/${charter}` },
      { name: 'calendar', path: '/calendar' },
      { name: 'settings-employees', path: '/settings/employees' },
    ]
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 1440, height: 900 })
      await shell.goto('/home')
      const saved = waitForServerAction(page)
      await shell.chooseTheme(th.prefs.themes[theme])
      await saved
      for (const width of [390, 768, 1280, 1920, 2560]) {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT[width]! })
        for (const r of routes) {
          await shell.goto(r.path)
          await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
          await expectNoOverflow(page, `${r.name} @${width} ${theme}`)
          await attachShot(testInfo, page, `${r.name}-${width}-${theme}.png`)
        }
      }
    }
    // leave the shared account on the default theme for later specs
    await page.setViewportSize({ width: 1440, height: 900 })
    await shell.goto('/home')
    const saved = waitForServerAction(page)
    await shell.chooseTheme(th.prefs.themes.light)
    await saved
  })
})
