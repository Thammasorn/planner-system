/**
 * Responsive layout (SPEC §7 browser support: "จอ ≥ 1280px เต็มรูปแบบ; tablet ใช้ได้; มือถือ = หน้าหลัก, งานของฉัน,
 * แจ้งลา, อ่านเอกสาร"). Every app route at 390 / 768 / 1280 has no horizontal document overflow, and the specific
 * fixes hold: the planning grid shows whole week columns beside a capped frozen column, task rows use a deliberate
 * two-line layout on phones, the page editor aligns its body with the title and scrolls wide tables inside their
 * block, the page column is centred with the save status in its header, dialogs / the task panel fit a phone, and
 * data screens use the full width of wide monitors (1920 / 2560). Waits are on state (hydration, network idle,
 * locators) — never sleeps.
 *
 * M6.1 (plan/m06.1 S7.4 — updated, not rewritten): `/t/<id>` joins ROUTES; ☰ lives in the 48 px header bar; the
 * save status sits in the header bar (full width, right side) instead of the column header; the right gap of work
 * screens is ≤ 24 px (AC-1601, main padding `--space-6`); the row action measured on phones is the ⋯ row menu (the
 * old "เปิดรายละเอียด" icon became the ↗ page link).
 */
import type { Locator, Page } from '@playwright/test'
import { th } from '../src/i18n/th'
import { expect, idOf, loginAs, projectIdByName, resetDb, test } from './fixtures'
import { CalendarPage } from './pages/calendar'
import { EditorPage } from './pages/editor'
import { GridPage } from './pages/grid'
import { HeaderBar } from './pages/header'
import { LeaveDialog } from './pages/leave-dialog'
import { PageScreen } from './pages/page-screen'
import { Palette } from './pages/palette'
import { ProjectFormDialog } from './pages/project'
import { ShellPage } from './pages/shell'
import { TaskListPage } from './pages/tasks'
import { TeamTasksPage } from './pages/team-tasks'
import { insertPage, paragraph } from './support/seed-pages'
import { taskIdOf } from './support/seed-tasks'

const PROJECT = 'POS Upgrade'
const WIDE_PAGE = 'ตารางกว้างทดสอบ'
const TASK = 'ปรับปรุงระบบ POS หน้าร้าน'

/** A page whose table (4 × 220 px columns) is wider than a phone or a tablet column. */
const wideTable = {
  type: 'table',
  content: {
    type: 'tableContent',
    columnWidths: [220, 220, 220, 220],
    rows: [
      { cells: ['หัวข้อ', 'รายละเอียด', 'ผู้รับผิดชอบ', 'กำหนดส่ง'] },
      { cells: ['ลูกค้า', 'Coral', 'Cindy', '31/10'] },
    ],
  },
}

let projectId = ''
let pageId = ''
let taskId = ''

const ROUTES = (): string[] => [
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
  `/projects/${projectId}/overview`,
  `/projects/${projectId}/tasks`,
  `/projects/${projectId}/plan`,
  `/projects/${projectId}/pages`,
  `/p/${pageId}`,
  `/t/${taskId}`, // M6.1 (FR-683)
]

/** Horizontal overflow of the document (0 = nothing sticks out of the viewport). */
const docOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function expectNoOverflow(page: Page, route: string): Promise<void> {
  await page.waitForLoadState('networkidle')
  expect(await docOverflow(page), `horizontal overflow on ${route}`).toBe(0)
}

/** Whole week column headers visible between the frozen name column and the sticky "รวม" column. */
async function visibleWeekColumns(grid: Locator): Promise<{ whole: number; nameW: number; gridW: number }> {
  return grid.evaluate((el) => {
    const heads = [...el.querySelectorAll<HTMLElement>('[role="columnheader"]')]
    const corner = heads[0]!.getBoundingClientRect()
    const total = heads[heads.length - 1]!.getBoundingClientRect()
    const whole = heads
      .slice(1, -1)
      .map((h) => h.getBoundingClientRect())
      .filter((r) => r.left >= corner.right - 1 && r.right <= total.left + 1).length
    return { whole, nameW: corner.width, gridW: el.getBoundingClientRect().width }
  })
}

async function box(l: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  // boundingBox() does not wait for visibility — an editor node view that is re-created (e.g. when the lease makes
  // the editor editable) would otherwise be measured while detached and return null
  await expect(l).toBeVisible()
  const b = await l.boundingBox()
  if (!b) throw new Error('element has no box')
  return b
}

async function expectInsideViewport(page: Page, l: Locator, what: string): Promise<void> {
  const vp = page.viewportSize()!
  const b = await box(l)
  expect(b.x, `${what} left`).toBeGreaterThanOrEqual(-1)
  expect(b.y, `${what} top`).toBeGreaterThanOrEqual(-1)
  expect(b.x + b.width, `${what} right`).toBeLessThanOrEqual(vp.width + 1)
  expect(b.y + b.height, `${what} bottom`).toBeLessThanOrEqual(vp.height + 1)
}

async function setSidebarCollapsed(page: Page, collapsed: boolean): Promise<void> {
  const shell = new ShellPage(page)
  const sidebar = shell.sidebar()
  // the buttons, not Cmd/Ctrl+\ — the shortcut is the editor's while the caret is in it
  if ((await sidebar.getAttribute('data-collapsed')) !== String(collapsed)) {
    await (collapsed ? shell.collapseButton() : shell.expandButton()).click()
  }
  await expect(sidebar).toHaveAttribute('data-collapsed', String(collapsed))
}

test.describe('R1 ⟲ responsive layout (SPEC §7 browser support)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        await insertPage(tx, {
          space: 'PROJECT',
          projectName: PROJECT,
          title: WIDE_PAGE,
          byNickname: 'Manager',
          content: [...paragraph('ย่อหน้าแรกของเอกสาร'), wideTable, ...paragraph('ท้ายเอกสาร')],
        })
      },
    })
    projectId = await projectIdByName(PROJECT)
    pageId = await idOf('page', WIDE_PAGE)
    taskId = await taskIdOf(PROJECT, TASK)
  })

  for (const width of [390, 768, 1280]) {
    test(`no route overflows horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await loginAs(page, 'manager')
      const shell = new ShellPage(page)
      for (const route of ROUTES()) {
        await shell.goto(route)
        await expectNoOverflow(page, route)
      }
    })
  }

  test.describe('phone 390', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('the planning grid caps its frozen column and shows this week as a whole column', async ({
      page,
    }) => {
      await loginAs(page, 'manager')
      const grid = new GridPage(page)
      await new ShellPage(page).goto(`/projects/${projectId}/plan`)
      await grid.waitReady(PROJECT)
      const v = await visibleWeekColumns(grid.root())
      expect(v.whole).toBeGreaterThanOrEqual(1)
      expect(v.nameW).toBeLessThanOrEqual(v.gridW * 0.45)
      // a narrow grid opens with this week in view (not only the 4 weeks of history)
      const todayWhole = await grid.root().evaluate((el) => {
        const heads = [...el.querySelectorAll<HTMLElement>('[role="columnheader"]')]
        const corner = heads[0]!.getBoundingClientRect()
        const total = heads[heads.length - 1]!.getBoundingClientRect()
        const t = el.querySelector('[role="columnheader"][data-today="true"]')?.getBoundingClientRect()
        return t !== undefined && t.left >= corner.right - 1 && t.right <= total.left + 1
      })
      expect(todayWhole, 'this week is a whole visible column').toBe(true)
      await expect(grid.toolbar()).toBeVisible()
      await expectInsideViewport(page, grid.toolbar(), 'grid toolbar')
    })

    test('task rows: name on line 1 with the row actions, meta aligned under the name; treegrid intact', async ({
      page,
    }) => {
      await loginAs(page, 'manager')
      const tasks = new TaskListPage(page)
      await tasks.goto(projectId)
      await expect(tasks.list()).toHaveAttribute('role', 'treegrid')
      const row = tasks.row(TASK)
      await expect(row).toHaveAttribute('aria-level', '1')
      const name = await box(row.getByText(TASK, { exact: true }))
      const status = await box(row.locator('.MuiChip-root').first())
      const open = await box(row.getByRole('button', { name: th.tasks.rowMenu.label, exact: true }))
      expect(status.y, 'meta on its own line').toBeGreaterThanOrEqual(name.y + name.height - 2)
      expect(Math.abs(status.x - name.x), 'meta aligned under the name').toBeLessThanOrEqual(8)
      expect(open.y, 'row actions on the name line').toBeLessThan(status.y)
      expect(open.width, 'touch-sized row action').toBeGreaterThanOrEqual(32)
      await expectInsideViewport(page, row, 'task row')
    })

    test('☰ sits in the header bar and opens the drawer (M6.1-D19)', async ({ page }) => {
      await loginAs(page, 'manager')
      const shell = new ShellPage(page)
      const header = new HeaderBar(page)
      for (const route of ['/home', `/t/${taskId}`]) {
        await shell.goto(route)
        await expect(header.menuButton()).toBeVisible()
        await expectInsideViewport(page, header.bar(), `header bar on ${route}`)
        await header.menuButton().click()
        await expect(shell.nav()).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(shell.nav()).toBeHidden()
      }
    })

    test('the task panel opens as a full-screen sheet and Esc returns to the row', async ({ page }) => {
      await loginAs(page, 'manager')
      const tasks = new TaskListPage(page)
      await tasks.goto(projectId)
      await tasks.openPanel(TASK)
      const panel = tasks.panel()
      await expect(panel).toBeVisible()
      await expect(panel).toBeFocused()
      const b = await box(panel)
      expect(b.x).toBeLessThanOrEqual(1)
      expect(b.width).toBeGreaterThanOrEqual(389)
      await page.keyboard.press('Escape')
      await expect(panel).toBeHidden()
      await expect(tasks.row(TASK)).toBeFocused()
    })

    test('team tasks: each row is name, then a meta line under it', async ({ page }) => {
      await loginAs(page, 'manager')
      const team = new TeamTasksPage(page)
      await team.goto()
      const li = page.locator(`li[data-task-id]`).filter({ hasText: TASK }).first()
      const name = await box(li.getByRole('link', { name: TASK, exact: true }))
      const status = await box(li.locator('.MuiChip-root').first())
      expect(status.y).toBeGreaterThanOrEqual(name.y + name.height - 2)
      expect(Math.abs(status.x - name.x)).toBeLessThanOrEqual(8)
      await expectNoOverflow(page, '/tasks')
    })

    test('page editor: body aligned with the title; a wide table scrolls inside its block', async ({
      page,
    }) => {
      await loginAs(page, 'manager')
      const editor = new EditorPage(page)
      await new ShellPage(page).goto(`/p/${pageId}`)
      await editor.waitReady()
      // the manager takes the lease on open; measure after the editor settled as editable (node views re-render then)
      await editor.expectEditable()
      const title = await box(new PageScreen(page).titleInput())
      const first = await box(editor.content().getByText('ย่อหน้าแรกของเอกสาร'))
      expect(Math.abs(first.x - title.x), 'body text starts where the title starts').toBeLessThanOrEqual(8)
      const wrapper = editor.content().locator('[data-content-type="table"] .tableWrapper')
      await expectInsideViewport(page, wrapper, 'table block')
      // the stored column widths are applied after the first paint (prosemirror-tables' column view)
      await expect.poll(() => wrapper.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      const scroll = await wrapper.evaluate((el) => {
        const table = el.querySelector('table')!
        const before = { sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX }
        el.scrollLeft = el.scrollWidth
        const t = table.getBoundingClientRect()
        const w = el.getBoundingClientRect()
        return { ...before, reachable: t.right <= w.right + 1, moved: el.scrollLeft > 0 }
      })
      expect(scroll.ox).toBe('auto')
      expect(scroll.sw, 'the table is wider than its block').toBeGreaterThan(scroll.cw)
      expect(scroll.moved, 'the block scrolls horizontally').toBe(true)
      expect(scroll.reachable, 'the last column can be scrolled into view').toBe(true)
      await expectNoOverflow(page, '/p/<wide>')
    })

    test('dialogs fit the phone: palette, แจ้งลา, project form', async ({ page }) => {
      await loginAs(page, 'manager')
      const shell = new ShellPage(page)
      await shell.goto('/home')
      const palette = new Palette(page)
      await palette.openByKeyboard()
      await expect(palette.dialog()).toBeVisible()
      await expectInsideViewport(page, page.locator('.MuiDialog-paper'), 'palette')
      await page.keyboard.press('Escape')
      await expect(palette.dialog()).toBeHidden()

      const calendar = new CalendarPage(page)
      await calendar.goto()
      // the header actions never scroll out of sight on a phone (FR-1606/AC-1604): แจ้งลา is on screen untouched
      for (const name of [th.calendar.reportLeave, th.calendar.thisMonth, th.calendar.nextMonth]) {
        await expectInsideViewport(page, calendar.main().getByRole('button', { name, exact: true }), name)
      }
      await calendar.reportLeave()
      const leave = new LeaveDialog(page)
      await leave.expectOpen('create')
      await expectInsideViewport(page, page.locator('.MuiDialog-paper'), 'leave dialog')
      await page.keyboard.press('Escape')
      await leave.expectClosed()

      await shell.goto('/projects')
      const create = page.getByRole('button', { name: th.projects.create, exact: true })
      await expectInsideViewport(page, create, 'สร้างโปรเจค in the header bar')
      await create.click()
      const form = new ProjectFormDialog(page)
      await expect(form.dialog()).toBeVisible()
      await expectInsideViewport(page, page.locator('.MuiDialog-paper'), 'project form')
      await expect(form.name()).toBeVisible()
    })
  })

  test.describe('tablet 768', () => {
    test.use({ viewport: { width: 768, height: 900 } })

    test('the planning grid shows at least 4 whole week columns', async ({ page }) => {
      await loginAs(page, 'manager')
      const grid = new GridPage(page)
      await new ShellPage(page).goto(`/projects/${projectId}/plan`)
      await grid.waitReady(PROJECT)
      expect((await visibleWeekColumns(grid.root())).whole).toBeGreaterThanOrEqual(4)
    })

    test('the wide table scrolls inside its block', async ({ page }) => {
      await loginAs(page, 'manager')
      const editor = new EditorPage(page)
      await new ShellPage(page).goto(`/p/${pageId}`)
      await editor.waitReady()
      // the manager takes the lease on open; measure after the editor settled as editable (node views re-render then)
      await editor.expectEditable()
      const wrapper = editor.content().locator('[data-content-type="table"] .tableWrapper')
      await expectInsideViewport(page, wrapper, 'table block')
      await expect
        .poll(() => wrapper.evaluate((el) => el.scrollWidth > el.clientWidth), {
          message: 'the table is wider than its block',
        })
        .toBe(true)
      await expectNoOverflow(page, '/p/<wide>')
    })
  })

  test.describe('desktop 1280, sidebar collapsed', () => {
    test.use({ viewport: { width: 1280, height: 900 } })

    test('the page column is centred and the save status sits in the header bar', async ({ page }) => {
      await loginAs(page, 'manager')
      const shell = new ShellPage(page)
      const editor = new EditorPage(page)
      await shell.goto(`/p/${pageId}`)
      await editor.waitReady()
      await setSidebarCollapsed(page, true)
      try {
        const main = await box(shell.main())
        const column = await box(page.getByTestId('page-column'))
        const mainCenter = main.x + main.width / 2
        expect(
          Math.abs(column.x + column.width / 2 - mainCenter),
          'column centred in main',
        ).toBeLessThanOrEqual(2)
        await expect(page.getByTestId('page-status-slot').getByTestId('save-status')).toHaveCount(1)
        // an edit shows "บันทึกแล้ว" next to the page menu, not floating over the content
        await editor.content().getByText('ท้ายเอกสาร').click()
        await page.keyboard.press('End')
        await page.keyboard.type('!')
        await editor.waitSaved()
        const status = await box(editor.saveState())
        const bar = await box(new HeaderBar(page).bar())
        // M6.1-D26: inside the full-width 48 px header bar, on its right half (FR-1603 "action อยู่ด้านขวา")
        expect(status.y).toBeGreaterThanOrEqual(bar.y - 1)
        expect(status.y + status.height).toBeLessThanOrEqual(bar.y + bar.height + 1)
        expect(status.x, 'save status on the right half of the bar').toBeGreaterThanOrEqual(bar.x + bar.width / 2)
        expect(status.x + status.width).toBeLessThanOrEqual(bar.x + bar.width + 1)
      } finally {
        await setSidebarCollapsed(page, false)
      }
    })
  })

  for (const width of [1920, 2560]) {
    test.describe(`wide ${width}`, () => {
      test.use({ viewport: { width, height: 1080 } })

      test('the planning grid and the task list use the full width', async ({ page }) => {
        await loginAs(page, 'manager')
        const grid = new GridPage(page)
        await new ShellPage(page).goto(`/projects/${projectId}/plan`)
        await grid.waitReady(PROJECT)
        const g = await box(grid.root())
        expect(width - (g.x + g.width), 'grid reaches the right edge (AC-1601)').toBeLessThanOrEqual(24)
        expect((await visibleWeekColumns(grid.root())).whole).toBeGreaterThanOrEqual(15)

        const tasks = new TaskListPage(page)
        await tasks.goto(projectId)
        const l = await box(tasks.list())
        expect(width - (l.x + l.width), 'task list reaches the right edge (AC-1601)').toBeLessThanOrEqual(24)
        await expectNoOverflow(page, 'tasks')
      })
    })
  }
})
