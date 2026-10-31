/**
 * M4 — Notion-style pages (plan/m04-pages-editor.md §7.3 E1–E19; SPEC §12 M4: AC-501…AC-505, FR-402, FR-501…543).
 * Determinism (PLAN §4.5, X46, M4-D35): production build on :3100 with APP_NOW = 2026-09-30, UPLOAD_DIR=.e2e-uploads;
 * every describe marked ⟲ resets planner_e2e (golden seed incl. the 5 charters of seedGolden's M4 part) in its own
 * beforeAll, with extras inserted by e2e/support/seed-pages.ts; tests inside a describe run serially and may build on
 * each other; the auto fixture pins the browser clock (only E17 installs a controllable clock) and keeps the CSP,
 * external-request and page-error guards on. UI strings come from th; selectors live in page objects; waits are on UI
 * state (data-save-state, banners, counts) or responses — never on time. Golden users: cindy (LEAD of POS, CRM), ivy
 * (MEMBER of POS, CRM), peter (non-member of POS; LEAD of DW, Store), manager.
 *
 * Later milestones change some lines on purpose: E1's tab list gains แผนงาน (M6, m06 S6.3); E16's palette gains groups
 * (M8 "คำสั่ง", M10 categories) — E16 therefore only ever selects/counts inside the pages group (M4-D37d).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { th } from '../src/i18n/th'
import { charterTemplate, meetingTemplate } from '../src/i18n/templates.th'
import type { PageView } from '../src/lib/contracts/pages'
import { formatBytes } from '../src/lib/files/format-bytes'
import { formatThaiDate } from '../src/lib/format'
import { E2E } from './env'
import {
  expect,
  idOf,
  loginAs,
  openGuardedPage,
  pageIdFromUrl,
  resetDb,
  test,
  waitForPageUrl,
  waitForServerAction,
} from './fixtures'
import { PageScreen } from './pages/page-screen'
import { Palette } from './pages/palette'
import { ProjectFormDialog, ProjectPage } from './pages/project'
import { SidebarPage } from './pages/sidebar'
import { escapeRegExp } from './pages/text'
import { toastWith, undoButtonOf } from './pages/toast'
import {
  dropFile,
  EXE_B64,
  PDF_B64,
  PNG_1X1_B64,
  realClipboardImage,
  SVG_B64,
  syntheticPaste,
} from './support/clipboard'
import { insertPage, paragraph } from './support/seed-pages'

const POS = 'POS Upgrade'
const CRM = 'CRM Migration'
const DW = 'Data Warehouse'
const STORE = 'Store Analytics Dashboard'
const CHARTER = th.pages.charterTitle
const SLASH = th.editor.blocknote.slash_menu
const FILE_SRC = /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// ---------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------

const fixture = (name: string): string => readFileSync(path.resolve('e2e/fixtures', name), 'utf8')
/** Expected cells are parsed from the fixture files, never retyped (S4.7). */
const gridOf = (name: string): string[][] =>
  fixture(name)
    .trimEnd()
    .split(/\r?\n/)
    .map((l) => l.split('\t'))
const b64Size = (b64: string): number => Buffer.from(b64, 'base64').length
/** A colour menu item: BlockNote prefixes the colour name with its "A" swatch, so the accessible name ends with it. */
const colorItem = (name: string): RegExp => new RegExp(`(^|\\s)${escapeRegExp(name)}$`)

interface Block {
  type: string
  props?: Record<string, unknown>
  content?: unknown
  children?: Block[]
}
/** Depth-first list of every block. */
const flatBlocks = (blocks: readonly Block[]): Block[] =>
  blocks.flatMap((b) => [b, ...flatBlocks(b.children ?? [])])

/** `GET /api/pages/<id>` with the context's session (persistence checks, M4 S4.9). */
async function apiPage(page: Page, id: string): Promise<PageView> {
  const res = await page.request.get(`/api/pages/${id}`)
  expect(res.status(), `GET /api/pages/${id}`).toBe(200)
  return (await res.json()) as PageView
}
const contentOf = async (page: Page, id: string): Promise<Block[]> =>
  (await apiPage(page, id)).page.content as Block[]

/** Expands a project row in the sidebar unless it already is (M2 rows remember expansion). */
async function expandSidebarProject(sidebar: SidebarPage, name: string): Promise<void> {
  if ((await sidebar.collapseToggle(name).count()) === 0) await sidebar.expandProject(name)
}

/** Sidebar `+` of Wiki ทีม → new blank page → title committed with Enter. Returns the page id. */
async function newWikiPage(page: Page, title: string): Promise<string> {
  const sidebar = new SidebarPage(page)
  await sidebar.newWikiPage()
  const id = pageIdFromUrl(page)
  const screen = new PageScreen(page)
  await screen.editor.waitReady()
  if (title !== '') await screen.rename(title)
  return id
}

/** POS (or another project) › tab เอกสาร › "สร้างหน้าใหม่" → title. Returns the page id. */
async function newProjectPage(page: Page, projectName: string, title: string): Promise<string> {
  const project = new ProjectPage(page)
  await project.goto(await idOf('project', projectName), 'pages')
  await project.newPageButton().click()
  const id = await waitForPageUrl(page)
  const screen = new PageScreen(page)
  await screen.shell.waitForHydration()
  await screen.editor.waitReady()
  await screen.rename(title)
  return id
}

/** The first `table` block of the charter template with these fills (row texts). */
function charterInfoRows(fill: Parameters<typeof charterTemplate>[0]): string[][] {
  const table = charterTemplate(fill).content.find((b) => b.type === 'table')
  const content = table?.content as { rows: { cells: string[] }[] } | undefined
  if (!content) throw new Error('charter template has no table')
  return content.rows.map((r) => r.cells)
}
const h2Texts = (blocks: readonly Block[]): string[] =>
  blocks
    .filter((b) => b.type === 'heading' && b.props?.level === 2)
    .map((b) => (typeof b.content === 'string' ? b.content : ''))

/** Records every data-save-state value the editor passes through (transient states included). */
async function recordSaveStates(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __saveStates: string[] }
    w.__saveStates = []
    const el = document.querySelector('[data-testid="page-editor"] [data-save-state]')
    if (!el) throw new Error('no [data-save-state] element')
    w.__saveStates.push(el.getAttribute('data-save-state') ?? '')
    new MutationObserver(() => w.__saveStates.push(el.getAttribute('data-save-state') ?? '')).observe(el, {
      attributes: true,
      attributeFilter: ['data-save-state'],
    })
  })
}
const saveStates = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __saveStates: string[] }).__saveStates)

// ---------------------------------------------------------------------------------------------------------------

test.describe('E1 ⟲ (FR-402, FR-505, FR-408, UI-01, X78) every project has its Project Charter', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  const NAME = 'โปรเจคเอกสารทดสอบ'

  test('the manager creates a project; its charter is in the sidebar tree and the เอกสาร tab, pre-filled', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const sidebar = new SidebarPage(page)
    const form = new ProjectFormDialog(page)
    const project = new ProjectPage(page)
    await sidebar.shell.goto('/home')
    await sidebar.newProjectButton().click()
    await expect(form.dialog()).toBeVisible()
    await form.name().fill(NAME)
    await form.pickClient('Coral')
    await form.pickLead('Cindy')
    await form.submit()
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    const projectId = /\/projects\/([0-9a-f-]{36})\//.exec(page.url())![1]!

    // FR-408 / X15: ภาพรวม · งาน · เอกสาร (M4-only list: M6 inserts แผนงาน and updates this line)
    await expect(project.tabs()).toHaveText([
      th.projects.tabs.overview,
      th.projects.tabs.tasks,
      th.projects.tabs.pages,
    ])

    await expandSidebarProject(sidebar, NAME)
    await expect(sidebar.pagesSubLink(projectId)).toHaveAttribute('href', `/projects/${projectId}/pages`)
    const sideTree = sidebar.projectTree(NAME)
    await expect(sideTree.item(CHARTER)).toContainText('📋')
    expect(await sideTree.level(CHARTER)).toBe(1)

    await project.openTab('pages')
    const tabTree = project.pagesTree(NAME)
    await expect(tabTree.item(CHARTER)).toContainText('📋')
    expect(await tabTree.level(CHARTER)).toBe(1)
    await tabTree.open(CHARTER)
    const charterId = await waitForPageUrl(page)

    const screen = new PageScreen(page)
    await screen.editor.waitReady()
    await expect(screen.titleInput()).toHaveValue(CHARTER)
    // M4-D6: ลูกค้า / Project Lead / ความแน่นอน pre-filled, ช่วงเวลา blank — rows derived from the template, containment
    const filled = charterInfoRows({
      clientName: 'Coral',
      leadName: 'Cindy',
      certaintyLabel: th.projects.certainty.CONFIRMED,
    })
    await expect.poll(() => screen.editor.cellTexts(0)).toEqual(expect.arrayContaining(filled.slice(1)))
    // M4-D37c: the h2 list contains the template's headings (M10 adds "งานและภาระของทีม" — never an exact list)
    const h2 = await screen.editor.content().getByRole('heading', { level: 2 }).allTextContents()
    expect(h2.map((s) => s.trim())).toEqual(expect.arrayContaining(h2Texts(charterTemplate().content)))
    expect(h2Texts(await contentOf(page, charterId))).toEqual(
      expect.arrayContaining(h2Texts(charterTemplate().content)),
    )

    // M4-D6: the charter cannot be deleted — no menu item
    await screen.openMenu(CHARTER)
    await expect(screen.menuItem(th.pages.delete)).toHaveCount(0)
    await page.keyboard.press('Escape')
    // breadcrumb root = the project name, linking to its เอกสาร tab
    await expect(screen.breadcrumb().getByRole('link', { name: NAME, exact: true })).toHaveAttribute(
      'href',
      `/projects/${projectId}/pages`,
    )
  })

  test('cindy sees the backfilled POS charter (seedGolden) and nothing of Data Warehouse', async ({ page }) => {
    const pos = await idOf('project', POS)
    await loginAs(page, 'cindy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    await expandSidebarProject(sidebar, POS)
    await expect(sidebar.projectTree(POS).item(CHARTER)).toBeVisible()
    await expect(sidebar.projectTree(DW).tree()).toHaveCount(0)
    const project = new ProjectPage(page)
    await project.goto(pos, 'pages')
    await expect(project.pagesTree(POS).item(CHARTER)).toContainText('📋')
    await project.pagesTree(POS).open(CHARTER)
    await waitForPageUrl(page)
    const screen = new PageScreen(page)
    await screen.editor.waitReady()
    // golden POS: client Coral, LEAD Cindy, CONFIRMED (M4-D6 backfill pre-fills the same cells)
    const filled = charterInfoRows({
      clientName: 'Coral',
      leadName: 'Cindy',
      certaintyLabel: th.projects.certainty.CONFIRMED,
    })
    await expect.poll(() => screen.editor.cellTexts(0)).toEqual(expect.arrayContaining(filled.slice(1, 3)))
    expect(await page.content()).not.toContain(DW)
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E2/E3/E19 ⟲ (AC-501, AC-502, FILE-8) tables, Excel paste, no external images (cindy)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('E2 (AC-501, FR-506, FR-520, FR-523) /ตาราง → 3×3 → add a column → 3×4 survives a reload', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    const id = await newWikiPage(page, 'ตารางทดสอบ')
    const screen = new PageScreen(page)
    const editor = screen.editor
    await expect(sidebar.wiki().item('ตารางทดสอบ')).toBeVisible()

    await editor.focusEnd()
    await editor.slash(SLASH.table.title)
    expect((await editor.slashTitles())[0]).toBe(SLASH.table.title)
    await page.keyboard.press('Enter')
    await expect(editor.tables()).toHaveCount(1)
    await expect.poll(() => editor.tableShape(0)).toEqual({ rows: 3, cols: 3 })

    await editor.addColumnRight(0)
    await expect.poll(() => editor.tableShape(0)).toEqual({ rows: 3, cols: 4 })
    await editor.waitSaved()

    await page.reload()
    await screen.shell.waitForHydration()
    await editor.waitReady()
    await expect.poll(() => editor.tableShape(0)).toEqual({ rows: 3, cols: 4 })
    await expect(sidebar.wiki().item('ตารางทดสอบ')).toBeVisible()
    expect(page.url()).toContain(`/p/${id}`)
  })

  test('E3 (AC-502, FR-524, M4-D33) Excel 4×3, markdown-looking Excel, TSV-only and Google Sheets → 4 tables', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    await new SidebarPage(page).shell.goto('/home')
    const id = await newWikiPage(page, 'วางจาก Excel')
    const editor = new PageScreen(page).editor

    await editor.focusEnd()
    await syntheticPaste(page, {
      'text/html': fixture('excel-4x3.html'),
      'text/plain': fixture('excel-4x3.tsv'),
    })
    await expect(editor.tables()).toHaveCount(1)
    await editor.newBlock()
    await syntheticPaste(page, {
      'text/html': fixture('excel-markdownish.html'),
      'text/plain': fixture('excel-markdownish.tsv'),
    })
    await expect(editor.tables()).toHaveCount(2)
    await editor.newBlock()
    await syntheticPaste(page, { 'text/plain': fixture('tsv-only-markdownish.txt') })
    await expect(editor.tables()).toHaveCount(3)
    await editor.newBlock()
    await syntheticPaste(page, { 'text/html': fixture('gsheets-3x2.html') })
    await expect(editor.tables()).toHaveCount(4)
    await editor.waitSaved()

    const expected = [
      gridOf('excel-4x3.tsv'),
      gridOf('excel-markdownish.tsv'),
      gridOf('tsv-only-markdownish.txt'),
      gridOf('gsheets-3x2.tsv'),
    ]
    const check = async (): Promise<void> => {
      await expect(editor.tables()).toHaveCount(4)
      expect(await editor.tableShape(0)).toEqual({ rows: 3, cols: 4 }) // "4×3" = 4 columns × 3 rows (M4-D33)
      for (const i of [1, 2, 3]) expect(await editor.tableShape(i)).toEqual({ rows: 3, cols: 2 })
      for (const [i, grid] of expected.entries()) expect(await editor.cellTexts(i)).toEqual(grid)
      await expect(
        editor.content().locator('[data-content-type="paragraph"]', { hasText: 'task_name_1' }),
      ).toHaveCount(0)
    }
    await check()
    await page.reload()
    await editor.waitReady()
    await check()
    expect(flatBlocks(await contentOf(page, id)).filter((b) => b.type === 'table')).toHaveLength(4)
  })

  test('E19 (FILE-8, NFR-09, M4-D9) pasted external images become links / text; only real files are uploaded', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    await new SidebarPage(page).shell.goto('/home')
    await newWikiPage(page, 'รูปจากเว็บ')
    const editor = new PageScreen(page).editor

    await editor.focusEnd()
    await syntheticPaste(page, {
      'text/html': '<p>ดูรูป <img src="https://example.com/cat.png" alt="แมว"></p>',
    })
    await editor.newBlock()
    await syntheticPaste(page, { 'text/html': '<img src="https://example.com/dog.png">' }, [
      { name: 'image.png', type: 'image/png', b64: PNG_1X1_B64 },
    ])
    await editor.newBlock()
    await syntheticPaste(page, { 'text/html': '<img src="data:image/png;base64,AAAA">' })
    await editor.waitSaved()

    const check = async (): Promise<void> => {
      await expect(editor.content().getByRole('link', { name: 'แมว' })).toHaveAttribute(
        'href',
        'https://example.com/cat.png',
      )
      await expect(editor.content().locator('img[src*="example.com"]')).toHaveCount(0)
      await expect(editor.images()).toHaveCount(1)
      await expect(editor.images().first()).toHaveAttribute('src', FILE_SRC)
      await expect(editor.content().getByText(th.editor.pasteImageLinkFallback)).toBeVisible()
    }
    await check()
    await page.reload()
    await editor.waitReady()
    await check()
    // the external-request guard (auto fixture) proves no request to example.com was ever made
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E4/E5/E14 ⟲ (AC-503, AC-504, FR-529) screenshots, sub-pages, mentions', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ allowedConsoleErrors: [/status of 404/] })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('E4 (AC-503, FR-525, FR-526, M4-D34) pasted screenshots survive a reload; a non-member gets 404 on the URL', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'cindy')
    const id = await newProjectPage(page, POS, 'รูปหน้าจอ')
    const editor = new PageScreen(page).editor

    // (1) the real clipboard route: a trusted ControlOrMeta+V of a ClipboardItem
    await editor.focusEnd()
    await realClipboardImage(page, PNG_1X1_B64)
    await page.keyboard.press('ControlOrMeta+V')
    await expect(editor.images()).toHaveCount(1)
    // (2) the route SPEC §12 names: page.evaluate + DataTransfer with a File + synthetic ClipboardEvent
    await editor.newBlock()
    await syntheticPaste(page, {}, [{ name: 'screenshot.png', type: 'image/png', b64: PNG_1X1_B64 }])
    await expect(editor.images()).toHaveCount(2)
    for (const i of [0, 1]) {
      await expect(editor.images().nth(i)).toHaveAttribute('src', FILE_SRC)
      await expect
        .poll(() =>
          editor
            .images()
            .nth(i)
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0)
    }

    // FR-526: caption + centre alignment through the image toolbar
    await editor.images().first().click()
    await page
      .getByRole('button', { name: th.editor.blocknote.formatting_toolbar.file_caption.tooltip, exact: true })
      .click()
    await page
      .getByPlaceholder(th.editor.blocknote.formatting_toolbar.file_caption.input_placeholder)
      .fill('ภาพหน้าจอ')
    await page.keyboard.press('Enter')
    await editor.images().first().click()
    await page
      .getByRole('button', { name: th.editor.blocknote.formatting_toolbar.align_center.tooltip, exact: true })
      .click()
    await editor.waitSaved()

    await page.reload()
    await editor.waitReady()
    await expect(editor.images()).toHaveCount(2)
    await expect(editor.content().getByText('ภาพหน้าจอ')).toBeVisible()
    const images = flatBlocks(await contentOf(page, id)).filter((b) => b.type === 'image')
    expect(images).toHaveLength(2)
    expect(images[0]!.props).toMatchObject({ caption: 'ภาพหน้าจอ', textAlignment: 'center' })
    const src = (await editor.images().first().getAttribute('src'))!
    expect(src).toMatch(FILE_SRC)

    // ivy (member of POS): the image URL works with the §7.6 headers
    const ivy = await openGuardedPage(browser)
    await loginAs(ivy.page, 'ivy')
    const ok = await ivy.page.request.get(src)
    expect(ok.status()).toBe(200)
    expect(ok.headers()['content-type']).toBe('image/png')
    expect(ok.headers()['x-content-type-options']).toBe('nosniff')
    await ivy.close()

    // peter (not in POS): API 404, navigation 404, the page itself 404 without its title
    const peter = await openGuardedPage(browser, [/status of 404/])
    await loginAs(peter.page, 'peter')
    expect((await peter.page.request.get(src)).status()).toBe(404)
    expect((await peter.page.goto(src))?.status()).toBe(404)
    const res = await peter.page.goto(`/p/${id}`)
    expect(res?.status()).toBe(404)
    await expect(new PageScreen(peter.page).notFound()).toBeVisible()
    expect(await peter.page.content()).not.toContain('รูปหน้าจอ')
    await peter.close()
  })

  test('E5 (AC-504, FR-506, FR-528, M4-D14) /หน้า in the POS charter → a child page in the tree + a card', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    await expandSidebarProject(sidebar, POS)
    const tree = sidebar.projectTree(POS)
    await tree.open(CHARTER)
    const charterId = await waitForPageUrl(page)
    const screen = new PageScreen(page)
    const editor = screen.editor
    await editor.waitReady()

    // a new block: the charter ends with "ช่องทางหลัก:", and `/` right after text stays text (word-start guard, R8)
    await editor.newBlock()
    await editor.slash(th.editor.slash.subpage.title)
    const titles = await editor.slashTitles()
    expect(titles[0]).toBe(th.editor.slash.subpage.title) // ranked: "หน้า" before "ย่อหน้า" (r3 G4)
    expect(titles.indexOf(SLASH.paragraph.title)).toBeGreaterThan(0)
    await page.keyboard.press('Enter')

    await expect(editor.subpageCards()).toHaveCount(1)
    const card = editor.subpageCards().first()
    await expect(card).toContainText(th.editor.subpage.untitled)
    await expect(editor.subpageLink(0)).toHaveAttribute('href', /^\/p\/[0-9a-f-]{36}$/)
    expect(page.url()).toContain(`/p/${charterId}`) // the user stays on the charter
    await editor.waitSaved() // the card is in the saved charter content

    await tree.expand(CHARTER)
    await expect(tree.item(th.pages.untitled)).toBeVisible()
    expect(await tree.level(th.pages.untitled)).toBe(2)

    await editor.subpageLink(0).click()
    await waitForPageUrl(page, charterId)
    await editor.waitReady()
    await screen.rename('หน้าย่อยทดสอบ')
    await page.goBack()
    await page.waitForURL((u) => u.pathname === `/p/${charterId}`)
    await editor.waitReady()
    await expect(editor.subpageCards().first()).toContainText('หน้าย่อยทดสอบ') // live title

    await page.reload()
    await editor.waitReady()
    await expect(editor.subpageCards()).toHaveCount(1)
    await tree.expand(CHARTER)
    await expect(tree.item('หน้าย่อยทดสอบ')).toBeVisible()
    await expect(tree.items().filter({ hasText: 'หน้าย่อยทดสอบ' })).toHaveCount(1)
  })

  test('E14 (FR-529, EDI-3, M4-D20) @mentions of a person and a page; a non-member sees no page title', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'cindy')
    const secretId = await newProjectPage(page, POS, 'แผนลับ POS')
    await new SidebarPage(page).shell.goto('/home')
    const refId = await newWikiPage(page, 'บันทึกอ้างอิง')
    const editor = new PageScreen(page).editor

    await editor.focusEnd()
    await page.keyboard.type('@Ic')
    await expect(editor.suggestionMenu()).toBeVisible()
    await expect(editor.suggestionGroup(th.editor.mention.groupPeople)).toBeVisible()
    await expect(editor.slashItems().first()).toContainText('Ivy')
    await page.keyboard.press('Enter')
    await page.keyboard.type(' @แผนลับ')
    await expect(editor.suggestionGroup(th.editor.mention.groupPages)).toBeVisible()
    await expect(editor.slashItems().filter({ hasText: 'แผนลับ POS' })).toHaveCount(1)
    await page.keyboard.press('Enter')
    await editor.waitSaved()

    await expect(editor.mentionChips()).toHaveCount(2)
    await expect(editor.mentionChips().first()).toContainText('@Ivy')
    await expect(editor.mentionChips().nth(1)).toContainText('แผนลับ POS')
    await editor.mentionChips().nth(1).click()
    await page.waitForURL((u) => u.pathname === `/p/${secretId}`) // same tab (r3 G17)

    const peter = await openGuardedPage(browser, [/status of 404/])
    await loginAs(peter.page, 'peter')
    const titleBodies: Promise<string>[] = []
    peter.page.on('response', (r) => {
      if (r.url().includes('/api/pages/titles')) titleBodies.push(r.text())
    })
    await new PageScreen(peter.page).goto(refId)
    const theirs = new PageScreen(peter.page).editor
    await theirs.waitReady()
    await expect(theirs.mentionChips().first()).toContainText('@Ivy')
    const hidden = theirs.mentionChips().filter({ hasText: th.editor.mention.noAccess })
    await expect(hidden).toHaveCount(1)
    await expect(hidden.locator('a[href]')).toHaveCount(0)
    expect(await hidden.getAttribute('href')).toBeNull()
    expect(await peter.page.content()).not.toContain('แผนลับ POS')
    expect(titleBodies.length).toBeGreaterThan(0)
    for (const body of await Promise.all(titleBodies)) expect(body).not.toContain('แผนลับ POS')
    await peter.close()
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E6 ⟲ (AC-505, FR-540, FR-541, FR-542) one editor at a time: banner, takeover, hand-back', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('cindy edits the POS charter; ivy sees "Cindy กำลังแก้หน้านี้", takes over; cindy re-acquires after ivy leaves', async ({
    page,
    browser,
  }) => {
    // the POS charter specifically (the 5 golden charters share the title), opened from POS › เอกสาร
    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    await project.goto(await idOf('project', POS), 'pages')
    await project.pagesTree(POS).open(CHARTER)
    const charterId = await waitForPageUrl(page)
    const cindy = new PageScreen(page).editor
    await cindy.waitReady()
    await cindy.expectEditable()
    await cindy.focusEnd()
    await cindy.type('แก้โดย Cindy')
    await cindy.waitSaved()

    const ivyCtx = await openGuardedPage(browser)
    await loginAs(ivyCtx.page, 'ivy')
    const ivyScreen = new PageScreen(ivyCtx.page)
    await ivyScreen.goto(charterId)
    const ivy = ivyScreen.editor
    await ivy.waitReady()
    await expect(ivy.leaseBanner()).toContainText(th.editor.lease.heldBy('Cindy'))
    await ivy.expectReadOnly()
    const versionBefore = (await apiPage(ivyCtx.page, charterId)).page.version
    const textBefore = await ivy.content().innerText()
    // caret right after cindy's "แก้โดย Cindy" (the last block): an editable editor would make it "แก้โดย Cindyx"
    await ivy.blocks().last().locator('.bn-inline-content').last().click()
    await ivyCtx.page.keyboard.press('End')
    await ivyCtx.page.keyboard.type('x')
    const typedAt = Date.now()
    await expect(ivy.content()).not.toContainText('แก้โดย Cindyx')
    expect(await ivy.content().innerText()).toBe(textBefore)
    // no save past the 800 ms autosave debounce: polls until 1.2 s after the keystroke; a changed version at any
    // poll is returned as-is and never matches, so a save fails the test (no fixed sleep)
    await expect
      .poll(
        async () => {
          const v = (await apiPage(ivyCtx.page, charterId)).page.version
          return v !== versionBefore || Date.now() - typedAt > 1_200 ? v : 'debounce pending'
        },
        { intervals: [250], timeout: 5_000 },
      )
      .toBe(versionBefore)

    // FR-542 takeover: ivy edits after a fresh fetch (sees cindy's text)
    await ivy.takeover()
    await ivy.expectEditable()
    await expect(ivy.content()).toContainText('แก้โดย Cindy')
    // cindy is displaced on the next lease call
    await cindy.pokeLease()
    await expect(cindy.leaseBanner()).toContainText(th.editor.lease.takenOverBy('Ivy'))
    await cindy.expectReadOnly()

    await ivy.focusEnd()
    await ivy.type('ต่อโดย Ivy')
    await ivy.waitSaved()
    await ivyCtx.page.close() // pagehide → DELETE lease
    await ivyCtx.close()

    // cindy re-acquires (retrying the "tab visible again" POST until the released lease is seen — no sleeps)
    await expect(async () => {
      await cindy.pokeLease()
      await expect(cindy.leaseBanner()).toHaveCount(0, { timeout: 1_000 })
    }).toPass()
    await cindy.expectEditable()
    await expect(cindy.content()).toContainText('ต่อโดย Ivy') // re-created from the newer version
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E7 ⟲ (FR-510, PERM-18/19, X63) the manager protects a wiki page; protection inherits', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        await insertPage(tx, {
          space: 'WORKSPACE',
          title: 'นโยบายทีม',
          byNickname: 'Cindy',
          content: paragraph('นโยบาย'),
        })
        await insertPage(tx, {
          space: 'WORKSPACE',
          parentTitle: 'นโยบายทีม',
          title: 'ย่อยนโยบาย',
          byNickname: 'Cindy',
        })
      },
    })
  })

  test('manager locks "นโยบายทีม"; ivy reads both pages read-only without any lease POST; unlock restores editing', async ({
    page,
    browser,
  }) => {
    const policy = await idOf('page', 'นโยบายทีม')
    const child = await idOf('page', 'ย่อยนโยบาย')
    await loginAs(page, 'manager')
    const screen = new PageScreen(page)
    await screen.goto(policy)
    await screen.editor.waitReady()
    await screen.openMenu('นโยบายทีม')
    await screen.menuItem(th.pages.protect).click()
    await expect(toastWith(page, th.pages.toasts.protected)).toBeVisible()
    const wiki = new SidebarPage(page).wiki()
    await wiki.expand('นโยบายทีม')
    await expect(wiki.lockIcon('นโยบายทีม')).toBeVisible()
    await expect(wiki.lockIcon('ย่อยนโยบาย')).toBeVisible() // inherited (X63)

    const ivyCtx = await openGuardedPage(browser)
    await loginAs(ivyCtx.page, 'ivy')
    const lockPosts: string[] = []
    ivyCtx.page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/pages\/[^/]+\/lock/.test(r.url())) lockPosts.push(r.url())
    })
    const ivy = new PageScreen(ivyCtx.page)
    for (const [id, title] of [
      [policy, 'นโยบายทีม'],
      [child, 'ย่อยนโยบาย'],
    ] as const) {
      await ivy.goto(id)
      await ivy.editor.waitReady()
      await expect(ivy.protectedBanner()).toBeVisible()
      await ivy.editor.expectReadOnly()
      await expect(ivy.titleInput()).not.toBeEditable()
      const ivyWiki = new SidebarPage(ivyCtx.page).wiki()
      await ivyWiki.expand('นโยบายทีม')
      await ivyWiki.item(title).hover()
      await expect(ivyWiki.addChildButton(title)).toHaveCount(0)
      await expect(ivyWiki.dragHandle(title)).toHaveCount(0)
    }
    expect(lockPosts, 'no lease POST on a protected page').toEqual([])

    await screen.openMenu('นโยบายทีม')
    await screen.menuItem(th.pages.unprotect).click()
    await expect(toastWith(page, th.pages.toasts.unprotected)).toBeVisible()
    // The manager's tab still holds the edit lease (FR-540); leaving the page in-app releases it (EDI-6).
    const released = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && /\/api\/pages\/[^/]+\/lock/.test(r.url()),
    )
    await new SidebarPage(page).shell.navLink(th.nav.home).click()
    await released
    await ivy.goto(policy)
    await ivy.editor.waitReady()
    await expect(ivy.protectedBanner()).toHaveCount(0)
    await ivy.editor.expectEditable()
    await ivyCtx.close()
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E8/E9/E10/E18 ⟲ (FR-509, FR-508, FR-503, FR-504) delete + undo, duplicate, drag, icon + cover', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test.describe('E8 · the deleted page was on screen', () => {
    // Deleting the page on screen makes its fire-and-forget lease release (`DELETE …/lock`, EDI-6) and the expanded
    // tree's child query answer 404 — the authz contract for a deleted page (PG-VIEW-DELETED, PG-UNLOCK; the server
    // already cleared the lease, M4-D21). Allowed here only, like E4/E14/E16 (plan §7.3).
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('E8 (FR-509, UNDO-3, P2) delete a child and a parent; undo by toast and by Cmd+Z; never a dialog', async ({
      page,
    }) => {
      let dialogs = 0
      page.on('dialog', () => {
        dialogs += 1
      })
      await loginAs(page, 'cindy')
      const sidebar = new SidebarPage(page)
      await sidebar.shell.goto('/home')
      const parentId = await newWikiPage(page, 'แม่ลบ')
      const screen = new PageScreen(page)
      await screen.editor.focusEnd()
      await screen.editor.slash(th.editor.slash.subpage.title)
      await page.keyboard.press('Enter')
      await expect(screen.editor.subpageLink(0)).toHaveAttribute('href', /^\/p\//)
      await screen.editor.waitSaved()
      await screen.editor.subpageLink(0).click()
      await waitForPageUrl(page, parentId)
      await screen.editor.waitReady()
      await screen.rename('ลูกลบ')

      const deleted = waitForServerAction(page)
      await screen.openMenu('ลูกลบ')
      await screen.menuItem(th.pages.delete).click()
      await deleted
      await page.waitForURL((u) => u.pathname === `/p/${parentId}`)
      await expect(toastWith(page, th.pages.toasts.deleted('ลูกลบ', 0))).toBeVisible()
      await screen.editor.waitReady()
      await expect(screen.editor.subpageCards().first()).toContainText(th.editor.subpage.deleted)

      const restored = waitForServerAction(page)
      await undoButtonOf(page, th.pages.toasts.deleted('ลูกลบ', 0)).click()
      await restored
      await expect(screen.editor.subpageCards().first()).toContainText('ลูกลบ')
      const wiki = sidebar.wiki()
      await wiki.expand('แม่ลบ')
      await expect(wiki.item('ลูกลบ')).toBeVisible()

      const deletedParent = waitForServerAction(page)
      await wiki.openMenu('แม่ลบ')
      await wiki.menuItem(th.pages.delete).click()
      await deletedParent
      await expect(toastWith(page, th.pages.toasts.deleted('แม่ลบ', 1))).toBeVisible()
      await expect(wiki.items().filter({ hasText: 'แม่ลบ' })).toHaveCount(0)
      await expect(wiki.items().filter({ hasText: 'ลูกลบ' })).toHaveCount(0)

      await page.evaluate(() => {
        ;(document.activeElement as HTMLElement | null)?.blur()
      })
      const undone = waitForServerAction(page)
      await page.keyboard.press('ControlOrMeta+z')
      await undone
      await expect(wiki.item('แม่ลบ')).toBeVisible()
      await wiki.expand('แม่ลบ')
      await expect(wiki.item('ลูกลบ')).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(dialogs).toBe(0)

      await page.reload()
      await sidebar.shell.waitForHydration()
      await wiki.expand('แม่ลบ')
      await expect(wiki.item('แม่ลบ')).toBeVisible()
      await expect(wiki.item('ลูกลบ')).toBeVisible()
    })
  })

  test('E9 (FR-508, M4-D22) duplicate "แม่ลบ": the copy sits right after it, with its own copied child', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    const wiki = sidebar.wiki()
    const COPY = th.pages.copyTitle('แม่ลบ')
    const originalChild = await idOf('page', 'ลูกลบ')

    const duplicated = waitForServerAction(page)
    await wiki.openMenu('แม่ลบ')
    await wiki.menuItem(th.pages.duplicate).click()
    await duplicated
    await expect(toastWith(page, th.pages.toasts.duplicated('แม่ลบ'))).toBeVisible()
    await expect(wiki.item(COPY)).toBeVisible()
    expect(await wiki.level(COPY)).toBe(1)
    const roots = (await wiki.rows()).filter((r) => r.level === 1).map((r) => r.text)
    const at = roots.findIndex((t) => t.endsWith('แม่ลบ'))
    expect(roots[at + 1]?.endsWith(COPY), `root order ${JSON.stringify(roots)}`).toBe(true)

    await wiki.expand(COPY)
    await wiki.open(COPY)
    const copyId = await waitForPageUrl(page)
    const editor = new PageScreen(page).editor
    await editor.waitReady()
    const href = await editor.subpageLink(0).getAttribute('href')
    expect(href).not.toBe(`/p/${originalChild}`)
    const copied = (await apiPage(page, copyId)).page
    const copyChild = flatBlocks(copied.content as Block[]).find((b) => b.type === 'subpage')
    expect(href).toBe(`/p/${String(copyChild?.props?.pageId)}`)
    // the original is unchanged: its card still points at the original child
    const original = await apiPage(page, await idOf('page', 'แม่ลบ'))
    const originalCard = flatBlocks(original.page.content as Block[]).find((b) => b.type === 'subpage')
    expect(originalCard?.props?.pageId).toBe(originalChild)
  })

  test('E10 (FR-503, UI-02, M4-D23) drag wiki roots to reorder and nest; order, levels and expansion persist', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    for (const t of ['ก1', 'ก2', 'ก3']) await newWikiPage(page, t)
    const wiki = sidebar.wiki()
    const order = async (): Promise<string[]> =>
      (await wiki.rows())
        .map((r) => r.text)
        .filter((t) => ['ก1', 'ก2', 'ก3'].some((k) => t.endsWith(k)))
        .map((t) => t.slice(-2))

    let moved = waitForServerAction(page)
    await wiki.dragOnto('ก3', 'ก1')
    await moved
    await expect.poll(order).toEqual(['ก3', 'ก1', 'ก2'])

    // "ก2" now sits directly after "ก1": dragging it one indent to the right nests it under "ก1"
    moved = waitForServerAction(page)
    await wiki.indent('ก2', 24)
    await moved
    const prefSaved = waitForServerAction(page) // sidebar.expanded (debounced 300 ms, X05) — like M1 E2E-14
    await wiki.expand('ก1')
    await prefSaved
    await expect.poll(() => wiki.level('ก2')).toBe(2)

    await page.reload()
    await sidebar.shell.waitForHydration()
    await expect(wiki.collapseButton('ก1')).toBeVisible() // remembered (user_preferences)
    await expect.poll(order).toEqual(['ก3', 'ก1', 'ก2'])
    expect(await wiki.level('ก2')).toBe(2)
    // eslint-disable-next-line no-restricted-globals -- reads (never writes) localStorage to prove it stays empty (X53)
    expect(await page.evaluate(() => localStorage.length)).toBe(0)
  })

  test('E18 (FR-504) breadcrumb, icon and cover image of "ก2"', async ({ page }) => {
    await loginAs(page, 'cindy')
    const screen = new PageScreen(page)
    const id = await idOf('page', 'ก2')
    await screen.goto(id)
    await screen.editor.waitReady()

    const crumbs = screen.breadcrumb()
    await expect(crumbs.getByText(th.pages.wikiRoot, { exact: true })).toBeVisible()
    await expect(crumbs.getByRole('link', { name: th.pages.wikiRoot, exact: true })).toHaveCount(0)
    await expect(crumbs.getByRole('link', { name: /ก1/ })).toHaveAttribute(
      'href',
      `/p/${await idOf('page', 'ก1')}`,
    )
    await expect(crumbs.locator('[aria-current="page"]')).toContainText('ก2')

    await screen.pickIcon('📌')
    await screen.addCover(PNG_1X1_B64)
    await page.reload()
    await screen.editor.waitReady()
    await expect(screen.iconButton()).toContainText('📌')
    const wiki = new SidebarPage(page).wiki()
    await wiki.expand('ก1')
    await expect(wiki.item('ก2')).toContainText('📌')
    await expect(screen.cover()).toHaveAttribute('src', FILE_SRC)

    const removed = waitForServerAction(page)
    await screen.coverRemoveButton().click()
    await removed
    await page.reload()
    await screen.editor.waitReady()
    await expect(screen.cover()).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E11 ⟲ (FR-507, TPL-B1…B3, M4-D6/D7) templates on blank pages (ivy)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('the chooser offers ว่าง · Project Charter · บันทึกการประชุม · คู่มือ/SOP; each fills the blank page', async ({
    page,
  }) => {
    await loginAs(page, 'ivy')
    await new SidebarPage(page).shell.goto('/home')
    const screen = new PageScreen(page)

    // meeting notes
    let id = await newWikiPage(page, '')
    await expect(screen.templateButtons()).toHaveText([
      th.pages.templates.blank,
      th.pages.templates.charter,
      th.pages.templates.meeting,
      th.pages.templates.sop,
    ])
    const label = formatThaiDate('2026-09-30', 'medium')
    let applied = waitForServerAction(page)
    await screen.templateButton(th.pages.templates.meeting).click()
    await applied
    await expect(screen.titleInput()).toHaveValue(th.pages.meetingTitle(label))
    await expect(screen.iconButton()).toContainText('📝')
    await expect(screen.templateRegion()).toHaveCount(0)
    const meetingH2 = h2Texts(meetingTemplate(label).content)
    await expect(screen.editor.content().getByRole('heading', { level: 2 })).toHaveText(meetingH2)
    expect(h2Texts(await contentOf(page, id))).toEqual(meetingH2)

    // SOP: empty, focused title, 📘
    await newWikiPage(page, '')
    applied = waitForServerAction(page)
    await screen.templateButton(th.pages.templates.sop).click()
    await applied
    await expect(screen.titleInput()).toHaveValue('')
    await expect(screen.titleInput()).toBeFocused()
    await expect(screen.iconButton()).toContainText('📘')

    // charter on an ordinary page: 5 tables, info cells beside ลูกค้า / Project Lead blank (M4-D6)
    id = await newWikiPage(page, '')
    applied = waitForServerAction(page)
    await screen.templateButton(th.pages.templates.charter).click()
    await applied
    await expect(screen.editor.tables()).toHaveCount(5)
    const blankInfo = charterInfoRows({})
    await expect.poll(() => screen.editor.cellTexts(0)).toEqual(blankInfo)
    expect((await apiPage(page, id)).page.isCharter).toBe(false)

    // blank: the chooser just goes away and comes back after a reload (still blank)
    id = await newWikiPage(page, '')
    await screen.templateButton(th.pages.templates.blank).click()
    await expect(screen.templateRegion()).toHaveCount(0)
    await page.reload()
    await screen.editor.waitReady()
    await expect(screen.templateRegion()).toBeVisible()
    expect((await apiPage(page, id)).page.isBlank).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E12 ⟲ (FR-520…523, FR-530, FR-532) blocks, markdown shortcuts, formatting (cindy)', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('English alias, markdown shortcuts, toggle list, bold + colours, header row, drag handle — all persisted', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    await new SidebarPage(page).shell.goto('/home')
    const id = await newWikiPage(page, 'บล็อกทั้งหมด')
    const editor = new PageScreen(page).editor

    // FR-520: English search finds the Thai item
    await editor.focusEnd()
    await editor.slash('table')
    expect((await editor.slashTitles())[0]).toBe(SLASH.table.title)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+Home')
    await page.keyboard.press('Backspace')

    // FR-532 markdown shortcuts, one per block
    const shortcuts: [string, string][] = [
      ['# ', 'หัวข้อหนึ่ง'],
      ['## ', 'หัวข้อสอง'],
      ['- ', 'รายการจุด'],
      ['1. ', 'รายการเลข'],
      ['[] ', 'เช็ก'],
      ['> ', 'อ้างอิง'],
      ['``` ', 'const a = 1'],
    ]
    for (const [n, [prefix, text]] of shortcuts.entries()) {
      // the first prefix goes into the page's (now empty) first block; every later one into a new block
      if (n === 0) await editor.focusEnd()
      else await editor.newBlock()
      await editor.type(prefix)
      await editor.type(text)
    }
    // Enter inside a code block adds a line break; Shift+Enter starts a paragraph below it (BlockNote 0.55)
    await page.keyboard.press('Shift+Enter')
    await editor.type('---')
    // toggle list via the Thai slash item
    await editor.newBlock()
    await editor.slash(SLASH.toggle_list.title)
    await page.keyboard.press('Enter')
    await editor.type('พับได้')

    // FR-523 header row
    await editor.newBlock()
    await editor.slash(SLASH.table.title)
    await page.keyboard.press('Enter')
    await expect(editor.tables()).toHaveCount(1)
    await editor.toggleHeaderRow(0)

    // FR-522 bold + text colour + background colour on one word
    // last edit: BlockNote keeps its toolbar selection after the colour menu, so nothing is typed after it
    await editor.appendBlock() // the table has no trailing text block; the widget appends a paragraph
    await editor.type('bold')
    // the toolbar opens only once ProseMirror has synced the DOM selection (async selectionchange), and that sync is
    // occasionally dropped — re-select (idempotent) until it opens; pressing Mod+B before that is lost
    await expect(async () => {
      await editor.selectText('bold')
      await expect(editor.formattingToolbar()).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await page.keyboard.press('ControlOrMeta+b')
    await expect(editor.content().locator('strong', { hasText: 'bold' })).toBeVisible()
    await editor
      .formattingToolbar()
      .getByRole('button', { name: th.editor.blocknote.formatting_toolbar.colors.tooltip, exact: true })
      .click()
    await page
      .getByRole('menuitem', { name: colorItem(th.editor.blocknote.color_picker.colors.red) })
      .first()
      .click()
    await editor
      .formattingToolbar()
      .getByRole('button', { name: th.editor.blocknote.formatting_toolbar.colors.tooltip, exact: true })
      .click()
    await page
      .getByRole('menuitem', { name: colorItem(th.editor.blocknote.color_picker.colors.yellow) })
      .last()
      .click()
    await page.keyboard.press('Escape') // the colour menu stays open after a pick

    // FR-530 side-menu drag handle on hover
    await editor.blocks().first().hover()
    await expect(editor.sideMenuDragHandle()).toBeVisible()
    await expect(editor.sideMenuDragHandle()).toHaveAttribute('draggable', 'true')
    await editor.waitSaved()

    await page.reload()
    await editor.waitReady()
    const blocks = flatBlocks(await contentOf(page, id))
    const kinds = blocks.map((b) => (b.type === 'heading' ? `heading(${String(b.props?.level)})` : b.type))
    const expectedOrder = [
      'heading(1)',
      'heading(2)',
      'bulletListItem',
      'numberedListItem',
      'checkListItem',
      'quote',
      'codeBlock',
      'divider',
      'toggleListItem',
      'table',
    ]
    // in order (other blocks such as empty paragraphs may sit between)
    let at = -1
    for (const k of expectedOrder) {
      const next = kinds.indexOf(k, at + 1)
      expect(next, `${k} after index ${at} in ${JSON.stringify(kinds)}`).toBeGreaterThan(at)
      at = next
    }
    const table = blocks.find((b) => b.type === 'table')
    expect((table?.content as { headerRows?: number } | undefined)?.headerRows).toBe(1)
    expect(JSON.stringify(blocks)).toContain('"bold":true')
    const styled = blocks
      .flatMap((b) =>
        Array.isArray(b.content) ? (b.content as { text?: string; styles?: Record<string, unknown> }[]) : [],
      )
      .find((ic) => ic.text === 'bold')
    expect(styled?.styles).toMatchObject({ bold: true, textColor: 'red', backgroundColor: 'yellow' })
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E13 ⟲ (FR-527, FILE-2…5) attachments: drop a PDF, SVG only as a file, forbidden types refused', () => {
  test.use({ allowedConsoleErrors: [/status of 415/] })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('PDF card with name + size and a download; SVG never an <img>; an exe named .pdf → toast, no card', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    await newProjectPage(page, POS, 'เอกสารแนบ')
    const editor = new PageScreen(page).editor

    await editor.focusEnd()
    await dropFile(page, { name: 'สัญญา.pdf', type: 'application/pdf', b64: PDF_B64 })
    await expect(editor.attachments()).toHaveCount(1)
    const card = editor.attachments().first()
    await expect(card).toContainText('📎')
    await expect(card).toContainText('สัญญา.pdf')
    await expect(card).toContainText(formatBytes(b64Size(PDF_B64)))
    const download = page.waitForEvent('download')
    await card.getByRole('link').first().click()
    expect((await download).suggestedFilename()).toBe('สัญญา.pdf')

    const panel = page.locator('.bn-panel')
    await editor.newBlock()
    await editor.slash(SLASH.file.title)
    await page.keyboard.press('Enter')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('tab')).toHaveText([th.editor.blocknote.file_panel.upload.title]) // no embed tab
    await panel.locator('input[type="file"]').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(SVG_B64, 'base64'),
    })
    await expect(editor.attachments()).toHaveCount(2)
    await expect(editor.attachments().nth(1)).toContainText('logo.svg')
    await expect(editor.content().locator('img[src*="/api/files/"]')).toHaveCount(0) // FILE-4

    await editor.newBlock()
    await editor.slash(SLASH.file.title)
    await page.keyboard.press('Enter')
    await expect(panel).toBeVisible()
    await panel.locator('input[type="file"]').setInputFiles({
      name: 'x.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(EXE_B64, 'base64'),
    })
    await expect(toastWith(page, th.editor.upload.typeNotAllowed)).toBeVisible()
    await expect(editor.attachments().filter({ hasText: 'x.pdf' })).toHaveCount(0)
    await editor.waitSaved()

    await page.reload()
    await editor.waitReady()
    await expect(editor.attachments()).toHaveCount(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E15 ⟲ (FR-531, M4-D2, M4-D26) autosave: status, flush on in-app navigation, keepalive on leave', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('saving → saved; navigating away mid-debounce keeps the text; closing the tab saves through keepalive PUT', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    const id = await newWikiPage(page, 'ร่างบันทึก')
    const editor = new PageScreen(page).editor

    await recordSaveStates(page)
    await editor.focusEnd()
    await editor.type('ร่างแรก')
    await editor.waitSaved()
    const seen = await saveStates(page)
    expect(seen).toContain('saving')
    expect(seen.lastIndexOf('saved')).toBeGreaterThan(seen.indexOf('saving'))
    await expect(editor.saveState()).toHaveText(th.editor.saveStatus.saved)

    // unmount flush: type, then immediately navigate in-app
    await expandSidebarProject(sidebar, POS)
    await editor.focusEnd() // the expand click moved focus to the sidebar
    await editor.type(' ต่อ')
    await sidebar.projectTree(POS).open(CHARTER)
    await page.waitForURL((u) => u.pathname !== `/p/${id}`)
    await page.goBack()
    await page.waitForURL((u) => u.pathname === `/p/${id}`)
    await editor.waitReady()
    await expect(editor.content()).toContainText('ร่างแรก ต่อ')

    // leave-page save: keepalive PUT /api/pages/<id>/content (M4-D2)
    await editor.focusEnd()
    await editor.type(' ปิดแท็บ')
    await page.goto('about:blank')
    await expect.poll(async () => JSON.stringify((await apiPage(page, id)).page.content)).toContain('ปิดแท็บ')
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E16 ⟲ (FR-1102/1104/1105 pages part, X08, X49, KEY-01) Cmd/Ctrl+K page search', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] })
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        await insertPage(tx, { space: 'WORKSPACE', title: 'คู่มือการลาพักร้อน', byNickname: 'Manager' })
      },
    })
  })

  test('ivy: Thai substring, the two visible charters, content hits; Enter opens; Cmd+K over a selection is the link shortcut', async ({
    page,
  }) => {
    await loginAs(page, 'ivy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    const palette = new Palette(page)

    await palette.openByKeyboard()
    await expect(palette.dialog()).toBeVisible()
    await expect(palette.hint()).toBeVisible()

    await palette.search('ลาพัก') // Thai substring (FR-1105)
    const leave = palette.pageResults().filter({ hasText: 'คู่มือการลาพักร้อน' })
    await expect(leave).toHaveCount(1)
    await expect(leave).toContainText(th.palette.wiki)

    await palette.search('Charter')
    await expect(palette.pageResults()).toHaveCount(2) // scoped to the pages group (M4-D37d)
    await expect(palette.pageResults().filter({ hasText: POS })).toHaveCount(1)
    await expect(palette.pageResults().filter({ hasText: CRM })).toHaveCount(1)

    await palette.search('ประชุมประจำ') // a charter bullet: content hits
    await expect(palette.pageResults().first()).toBeVisible()
    for (const option of await palette.pageResults().all())
      await expect(option).toContainText(th.palette.matchedInContent)

    await palette.search('Charter')
    const posOption = palette.pageResults().filter({ hasText: POS })
    await posOption.hover()
    await page.keyboard.press('Enter')
    await waitForPageUrl(page)
    await expect(palette.dialog()).toHaveCount(0)

    // r3 G16 / X49: with a text selection Cmd+K is BlockNote's link shortcut — the palette stays closed
    const editor = new PageScreen(page).editor
    await editor.waitReady()
    await editor.content().locator('blockquote, [data-content-type="quote"]').first().click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await palette.openByKeyboard()
    await expect(palette.dialog()).toHaveCount(0)
    await page.keyboard.press('Escape')

    await palette.openByButton()
    await expect(palette.dialog()).toBeVisible()
  })

  test('peter: "Charter" lists only the DW and Store charters; no response mentions POS Upgrade', async ({
    page,
  }) => {
    await loginAs(page, 'peter')
    const bodies: Promise<string>[] = []
    page.on('response', (r) => {
      if (r.url().includes('/api/search')) bodies.push(r.text())
    })
    await new SidebarPage(page).shell.goto('/home')
    const palette = new Palette(page)
    await palette.openByKeyboard()
    await palette.search('Charter')
    await expect(palette.pageResults()).toHaveCount(2)
    await expect(palette.pageResults().filter({ hasText: DW })).toHaveCount(1)
    await expect(palette.pageResults().filter({ hasText: STORE })).toHaveCount(1)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of await Promise.all(bodies)) expect(body).not.toContain(POS)
    expect(await page.content()).not.toContain(POS)
  })
})

// ---------------------------------------------------------------------------------------------------------------

test.describe('E17 ⟲ (FR-543, M4-D35) a newer version is never overwritten', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        await insertPage(tx, {
          space: 'WORKSPACE',
          title: 'หน้าชนกัน',
          byNickname: 'Cindy',
          content: paragraph('ต้นฉบับ'),
        })
      },
    })
  })

  test('another tab saves first → banner "มีการแก้ไขใหม่กว่า", read-only, no retry; reload shows the newer text', async ({
    page,
  }) => {
    // the only test with a controllable clock: the 800 ms debounce fires only when we advance it (M4-D35, R19)
    await page.clock.install({ time: new Date(E2E.appNow) })
    const id = await idOf('page', 'หน้าชนกัน')
    await loginAs(page, 'cindy')
    const screen = new PageScreen(page)
    await screen.goto(id)
    const editor = screen.editor
    await editor.waitReady()
    await editor.expectEditable()

    const saves: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.headers()['next-action']) saves.push(r.url())
    })
    await editor.focusEnd()
    await editor.type(' แก้จากแท็บนี้')

    const version = (await apiPage(page, id)).page.version
    const put = await page.request.put(`/api/pages/${id}/content`, {
      data: { baseVersion: version, content: paragraph('จากอีกแท็บ') },
      headers: { origin: E2E.baseUrl },
    })
    expect(put.status()).toBe(200)

    await page.clock.runFor(1_000)
    await expect(editor.conflictBanner()).toBeVisible()
    await editor.expectReadOnly()
    const savesAtConflict = saves.length
    expect(savesAtConflict).toBeGreaterThan(0)
    await page.clock.runFor(10_000)
    expect(saves.length, 'a conflicting save is never retried').toBe(savesAtConflict)

    await editor.reloadAfterConflict()
    await expect(editor.conflictBanner()).toHaveCount(0)
    await expect(editor.content()).toContainText('จากอีกแท็บ')
    await expect(editor.content()).not.toContainText('แก้จากแท็บนี้')
    await editor.expectEditable()
    const server = JSON.stringify((await apiPage(page, id)).page.content)
    expect(server).toContain('จากอีกแท็บ')
    expect(server).not.toContain('แก้จากแท็บนี้')
  })
})
