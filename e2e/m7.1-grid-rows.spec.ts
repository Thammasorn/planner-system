/**
 * v3.8 / v3.9 row work on the plan grid (SPEC FR-815, FR-821, FR-822, FR-823; owner feedback 2026-11-03): the gestures
 * that jsdom cannot prove — click opens the panel, inline rename, ☐ multi-select delete, row drag into a parent, the
 * density toggle, and the chips staying inside the task column measured in real pixels.
 * Determinism as in m7.1-grid.spec.ts (PLAN §4.5): production build, APP_NOW = 2026-09-30, browser clock pinned, each
 * describe resets planner_e2e (F1 golden) in its own beforeAll; strings come from `th`; waits are on aria state,
 * server-action responses, toasts or text.
 * Golden POS: "ปรับปรุงระบบ POS หน้าร้าน" Cindy, "ทำ UAT + คู่มือหน้าร้าน" Ivy (250 cd at 28/9), "Rollout สาขา" Mint.
 */
import type { Locator, Page } from '@playwright/test'
import { formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { TASK_W_DEFAULT, TASK_W_MIN } from '../src/lib/grid/frozen'
import {
  expect,
  loginAs,
  resetDb,
  test,
  waitForServerAction,
  waitForServerActionWith,
  type GoldenLogin,
} from './fixtures'
import { GridPage } from './pages/grid'
import { TaskListPage } from './pages/tasks'
import { toastWith, undoButtonOf } from './pages/toast'
import { WorkloadPage } from './pages/workload'

const POS = 'POS Upgrade'
const R1 = 'ปรับปรุงระบบ POS หน้าร้าน'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const ROLLOUT = 'Rollout สาขา'
const SIGN_OFF = 'UAT sign-off'
const WEEK = '2026-09-28'

const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })

async function openGrid(page: Page, who: GoldenLogin = 'cindy'): Promise<GridPage> {
  await loginAs(page, who)
  const grid = new GridPage(page)
  await grid.goto(POS)
  return grid
}

// ── R1 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('R1 ⟲ (FR-823) a click opens the panel · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('click selects + opens; another row switches in place; Esc closes back to the row; Space opens', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    const panel = new TaskListPage(page)
    await expect(panel.panel()).toHaveCount(0)

    await grid.openPanelByClick(R1, 'Cindy')
    await expect(panel.panelTitle(R1)).toBeVisible()
    await expect(grid.rowHeader(R1, 'Cindy')).toHaveAttribute('aria-selected', 'true')
    // a plain click is no multi-select: no ☐ state, no bar
    await expect(grid.selectionBar()).toHaveCount(0)

    await grid.openPanelByClick(UAT, 'Ivy')
    await expect(panel.panelTitle(UAT)).toBeVisible()
    await expect(grid.rowHeader(UAT, 'Ivy')).toHaveAttribute('aria-selected', 'true')
    await expect(grid.rowHeader(R1, 'Cindy')).toHaveAttribute('aria-selected', 'false')

    await page.keyboard.press('Escape')
    await expect(panel.panel()).toHaveCount(0)
    expect(new URL(page.url()).searchParams.has('task')).toBe(false)
    await expect(grid.rowHeader(UAT, 'Ivy')).toBeFocused()

    await page.keyboard.press('Space')
    await expect(panel.panelTitle(UAT)).toBeVisible()
  })

  test('switching rows replaces the history entry: Back leaves the panel in one step', async ({ page }) => {
    const grid = await openGrid(page)
    const panel = new TaskListPage(page)
    await grid.openPanelByClick(R1, 'Cindy')
    await grid.openPanelByClick(UAT, 'Ivy')
    await grid.openPanelByClick(ROLLOUT, 'Mint')
    await expect(panel.panelTitle(ROLLOUT)).toBeVisible()
    await page.goBack()
    await expect(panel.panel()).toHaveCount(0)
  })

  test('below 1440 px the panel floats and the grid keeps its width; from 1440 px it sits beside it and ⇔ resizes it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const grid = await openGrid(page)
    const panel = new TaskListPage(page)
    const box = page.getByTestId('task-panel')
    const gridWidth = async () => (await grid.root().boundingBox())!.width
    const before = await gridWidth()
    await grid.openPanelByClick(R1, 'Cindy')
    await expect(panel.panelTitle(R1)).toBeVisible()
    await expect(box).toHaveAttribute('data-overlay', 'true')
    expect(await gridWidth()).toBe(before)
    await page.keyboard.press('Escape')
    await expect(panel.panel()).toHaveCount(0)
    await expect(grid.rowHeader(R1, 'Cindy')).toBeFocused()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.keyboard.press('Space')
    await expect(panel.panelTitle(R1)).toBeVisible()
    await expect(box).not.toHaveAttribute('data-overlay', 'true')
    const edge = panel.panel().getByRole('separator', { name: th.tasks.panel.resize })
    await edge.hover()
    const w0 = (await box.boundingBox())!.width
    const e = (await edge.boundingBox())!
    const saved = waitForServerActionWith(page, 'panel.width')
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2)
    await page.mouse.down()
    await page.mouse.move(e.x + e.width / 2 - 100, e.y + e.height / 2, { steps: 8 })
    await page.mouse.up()
    await saved
    const w1 = (await box.boundingBox())!.width
    expect(w1 - w0).toBeGreaterThanOrEqual(96)
    expect(w1 - w0).toBeLessThanOrEqual(104)
    await grid.reload()
    await expect(panel.panelTitle(R1)).toBeVisible()
    expect((await box.boundingBox())!.width).toBe(w1)
  })

  test('the ☐ and the ⋯ of a row keep their own action: neither opens the panel', async ({ page }) => {
    const grid = await openGrid(page)
    const panel = new TaskListPage(page)
    await grid.checkRow(R1, 'Cindy')
    await grid.selectionBarButton(th.grid.row.selBarClear).click()
    await grid.rowHeader(UAT, 'Ivy').hover()
    await grid
      .rowHeader(UAT, 'Ivy')
      .getByRole('button', { name: th.grid.row.menuButton(`${UAT} · Ivy`) })
      .click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel.panel()).toHaveCount(0)
    expect(new URL(page.url()).searchParams.has('task')).toBe(false)
  })
})

// ── R2 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('R2 ⟲ (FR-823) inline rename · cindy', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  /** Row selected, panel closed, focus on the row header: where the keyboard paths start. */
  async function selectClosed(grid: GridPage, task: string, person: string): Promise<void> {
    await grid.selectRow(task, person)
    await grid.press('Escape')
    await expect(grid.rowHeader(task, person)).toBeFocused()
  }

  test('double-click → caret at the end; Enter saves; survives reload; Cmd+Z / redo re-send the names', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    const next = `${ROLLOUT} รอบสอง`
    await grid.taskName(ROLLOUT, 'Mint').dblclick()
    await expect(grid.renameInput()).toBeFocused()
    await expect(grid.renameInput()).toHaveValue(ROLLOUT)
    let saved = waitForServerAction(page)
    await page.keyboard.type(' รอบสอง')
    await page.keyboard.press('Enter')
    await saved
    await expect(grid.renameInput()).toHaveCount(0)
    await expect(grid.rowHeader(next, 'Mint')).toBeVisible()
    await expect(grid.rowHeader(next, 'Mint')).toBeFocused()

    saved = waitForServerAction(page)
    await grid.press('ControlOrMeta+z')
    await saved
    await expect(grid.rowHeader(ROLLOUT, 'Mint')).toBeVisible()
    saved = waitForServerAction(page)
    await grid.press('ControlOrMeta+Shift+z')
    await saved
    await expect(grid.rowHeader(next, 'Mint')).toBeVisible()

    await grid.reload()
    await expect(grid.rowHeader(next, 'Mint')).toBeVisible()
  })

  test('F2 and Enter edit the name, a typed character replaces it, Space does not', async ({ page }) => {
    const grid = await openGrid(page)
    await selectClosed(grid, ROLLOUT, 'Mint')

    await grid.press('F2')
    await expect(grid.renameInput()).toHaveValue(ROLLOUT)
    await grid.press('Escape')
    await expect(grid.renameInput()).toHaveCount(0)
    await expect(grid.rowHeader(ROLLOUT, 'Mint')).toBeFocused()

    await grid.press('Enter')
    await expect(grid.renameInput()).toHaveValue(ROLLOUT)
    await grid.press('Escape')

    await page.keyboard.press('x')
    await expect(grid.renameInput()).toHaveValue('x')
    const saved = waitForServerAction(page)
    await page.keyboard.type('yz')
    await page.keyboard.press('Enter')
    await saved
    await expect(grid.rowHeader('xyz', 'Mint')).toBeVisible()
  })

  test('Esc, an unchanged and an empty value write nothing; a click elsewhere saves', async ({ page }) => {
    const grid = await openGrid(page)
    await selectClosed(grid, ROLLOUT, 'Mint')
    const writes = await grid.countServerActions(async () => {
      await grid.press('F2')
      await page.keyboard.type('ไม่เอา')
      await grid.press('Escape')
      await grid.press('F2')
      await grid.press('Enter') // unchanged
      await grid.press('F2')
      await grid.renameInput().fill('   ')
      await grid.press('Enter') // empty
      await expect(grid.renameInput()).toHaveCount(0)
    })
    expect(writes).toBe(0)
    await expect(grid.rowHeader(ROLLOUT, 'Mint')).toBeVisible()

    await grid.press('F2')
    await page.keyboard.type(' ใหม่')
    const saved = waitForServerAction(page)
    await grid.taskHeader().click()
    await saved
    await expect(grid.rowHeader(`${ROLLOUT} ใหม่`, 'Mint')).toBeVisible()
  })

  test('a double-click renames the row under the pointer: opening the panel on its first click moves no row', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    const panel = new TaskListPage(page)
    const y = async () => (await grid.rowHeader(ROLLOUT, 'Mint').boundingBox())!.y
    const before = await y()
    await grid.openPanelByClick(ROLLOUT, 'Mint')
    await expect(panel.panelTitle(ROLLOUT)).toBeVisible()
    expect(await y(), 'the row stays under the pointer').toBe(before)
    await page.keyboard.press('Escape')
    await expect(panel.panel()).toHaveCount(0)

    await grid.taskName(ROLLOUT, 'Mint').dblclick()
    await expect(grid.renameInput()).toHaveValue(ROLLOUT)
  })

  test('the rename keeps the keyboard while the first click of the double-click opens the panel', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    const panel = new TaskListPage(page)
    await grid.openPanelByClick(R1, 'Cindy') // an open panel is the case that could steal focus
    await expect(panel.panelTitle(R1)).toBeVisible()
    await grid.taskName(ROLLOUT, 'Mint').dblclick()
    await expect(grid.renameInput()).toBeFocused()
    await expect(panel.panelTitle(ROLLOUT)).toBeVisible()
    await expect(grid.renameInput()).toBeFocused()
    const saved = waitForServerAction(page)
    await page.keyboard.type(' ก')
    await page.keyboard.press('Enter')
    await saved
    await expect(grid.rowHeader(`${ROLLOUT} ก`, 'Mint')).toBeVisible()
    await expect(panel.panelTitle(`${ROLLOUT} ก`)).toBeVisible()
  })
})

// ── R3 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('R3 ⟲ (FR-821, FR-823) ☐ multi-select, bar, delete + undo · cindy', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  test('☐ on two rows → "เลือก 2 งาน", no panel; ลบ → gone + toast; เลิกทำ → back with their plan', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    const panel = new TaskListPage(page)
    await expect(grid.selectionBar()).toHaveCount(0)

    await grid.checkRow(UAT, 'Ivy')
    await expect(grid.selectionBar()).toContainText(th.grid.row.selBarCount(1))
    // every ☐ shows while a selection is under way, also on rows the pointer is not on
    await page.mouse.move(0, 0)
    await expect(grid.rowCheckbox(ROLLOUT, 'Mint')).toHaveCSS('opacity', '1')
    await grid.checkRow(ROLLOUT, 'Mint')
    await expect(grid.selectionBar()).toContainText(th.grid.row.selBarCount(2))
    await expect(panel.panel()).toHaveCount(0)

    const toast = th.tasks.toast.deletedMany(2)
    let answered = waitForServerAction(page)
    await grid.selectionBarButton(th.grid.row.selBarDelete).click()
    await answered
    await expect(toastWith(page, toast)).toBeVisible()
    await grid.expectRowTaskNames([R1])
    await expect(grid.selectionBar()).toHaveCount(0)

    answered = waitForServerAction(page)
    await undoButtonOf(page, toast).click()
    await answered
    await grid.expectRowTaskNames([R1, UAT, ROLLOUT])
    const cell = await grid.reveal(await grid.rowKeyOf(UAT, 'Ivy'), WEEK)
    await expect(grid.value(cell)).toHaveText(d1(250))
    await grid.reload()
    await grid.expectRowTaskNames([R1, UAT, ROLLOUT])
  })

  test("Cmd+Z undoes the bar's delete; Cmd+click and Shift+click join the selection; ยกเลิก and Esc clear it", async ({
    page,
  }) => {
    const grid = await openGrid(page)
    await grid.checkRow(R1, 'Cindy')
    await grid.selectionBarButton(th.grid.row.selBarClear).click()
    await expect(grid.selectionBar()).toHaveCount(0)
    await expect(grid.rowHeader(R1, 'Cindy')).toHaveAttribute('aria-selected', 'false')

    await grid.taskName(R1, 'Cindy').click({ modifiers: ['ControlOrMeta'] })
    await grid.taskName(UAT, 'Ivy').click({ modifiers: ['ControlOrMeta'] })
    await expect(grid.selectionBar()).toContainText(th.grid.row.selBarCount(2))
    await grid.press('Escape')
    await expect(grid.selectionBar()).toHaveCount(0)

    await grid.taskName(R1, 'Cindy').click({ modifiers: ['ControlOrMeta'] })
    await grid.taskName(ROLLOUT, 'Mint').click({ modifiers: ['Shift'] })
    await expect(grid.selectionBar()).toContainText(th.grid.row.selBarCount(3))
    await expect(new TaskListPage(page).panel()).toHaveCount(0)

    await grid.rowCheckbox(R1, 'Cindy').click() // ☐ takes one row out again
    await expect(grid.selectionBar()).toContainText(th.grid.row.selBarCount(2))
    const toast = th.tasks.toast.deletedMany(2)
    let answered = waitForServerAction(page)
    await grid.selectionBarButton(th.grid.row.selBarDelete).click()
    await answered
    await expect(toastWith(page, toast)).toBeVisible()
    await grid.expectRowTaskNames([R1])
    answered = waitForServerAction(page)
    await grid.press('ControlOrMeta+z')
    await answered
    await grid.expectRowTaskNames([R1, UAT, ROLLOUT])
  })
})

// ── R4 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('R4 ⟲ (FR-815, BR-31, BR-105) drag a row into a parent · cindy', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  test('lower half + right → line at the child depth, "ย้ายไปเป็นงานย่อยของ …", parent lit; drop nests; Cmd+Z; reload', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    const tasks = new TaskListPage(page)
    await grid.startRowDrag(
      { task: ROLLOUT, person: 'Mint' },
      { task: UAT, person: 'Ivy' },
      { half: 'lower', indent: 16 },
    )

    const line = grid.dropIndicator()
    await expect(line).toHaveAttribute('data-valid', 'true')
    await expect(line).toHaveAttribute('data-depth', '1')
    await expect(line).toContainText(th.grid.reorder.dropInside(UAT))
    await expect(grid.dragGhost()).toContainText(ROLLOUT)
    await expect(grid.root().locator('[data-drop-parent="true"]')).toHaveAttribute(
      'data-row-key',
      await grid.rowKeyOf(UAT, 'Ivy'),
    )

    const answered = waitForServerAction(page)
    await page.mouse.up()
    await answered
    await expect(line).toHaveCount(0)
    await expect(grid.dragGhost()).toHaveCount(0)

    // UAT is a parent now: Ivy and her plan move to the child (BR-31 / FR-610), as with Alt+→ in P3
    await expect(toastWith(page, th.tasks.toast.movedAssignees(1, ROLLOUT))).toBeVisible()
    await expect(grid.rowHeader(UAT)).toBeVisible()
    await expect(grid.rowHeader(ROLLOUT, 'Ivy')).toBeVisible()
    await expect(grid.rowHeader(ROLLOUT).locator('[data-indent="1"]')).toBeAttached()

    await grid.reload()
    await expect(grid.rowHeader(ROLLOUT).locator('[data-indent="1"]')).toBeAttached()
    await tasks.openTab()
    await tasks.expectRowNames([R1, UAT, ROLLOUT])
    await grid.openTab(POS)

    // and a third row lands on the parent's lower half: first child, before ROLLOUT
    await grid.dragRow({ task: R1, person: 'Cindy' }, { task: UAT }, { half: 'lower', indent: 16 })
    await grid.expectRowTaskNames([UAT, R1, ROLLOUT])
    await expect(grid.rowHeader(R1, 'Cindy').locator('[data-indent="1"]')).toBeAttached()
  })

  test('the upper half of the next row keeps the depth: a plain reorder, no nesting text, no parent lit', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    await grid.startRowDrag({ task: R1, person: 'Cindy' }, { task: ROLLOUT, person: 'Mint' })
    await expect(grid.dropIndicator()).toHaveAttribute('data-depth', '0')
    await expect(grid.dropIndicator()).not.toContainText(th.grid.reorder.dropInside(UAT))
    await expect(grid.root().locator('[data-drop-parent="true"]')).toHaveCount(0)
    const answered = waitForServerAction(page)
    await page.mouse.up()
    await answered
    await grid.expectRowTaskNames([UAT, R1, ROLLOUT])
  })

  test('Esc while dragging: nothing moves, nothing is written, the rows slide back', async ({ page }) => {
    const grid = await openGrid(page)
    const writes = await grid.countServerActions(async () => {
      await grid.startRowDrag(
        { task: ROLLOUT, person: 'Mint' },
        { task: UAT, person: 'Ivy' },
        { half: 'lower', indent: 16 },
      )
      await expect(grid.dropIndicator()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(grid.dropIndicator()).toHaveCount(0)
      await expect(grid.dragGhost()).toHaveCount(0)
      await page.mouse.up()
    })
    expect(writes).toBe(0)
    await grid.expectRowTaskNames([R1, UAT, ROLLOUT])
    await expect(grid.rowHeader(ROLLOUT, 'Mint').locator('[data-indent]')).toHaveCount(0)
  })
})

// ── R5 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('R5 ⟲ (FR-822) ปกติ | แคบ · cindy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('แคบ = 36 px columns with day-only headers, values still editable; saved; the same choice on /workload', async ({
    page,
  }) => {
    const grid = await openGrid(page)
    const header = grid.columnHeader(WEEK)
    await expect(grid.densityButton('NORMAL')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await header.boundingBox())!.width).toBe(52)

    await grid.setDensity('COMPACT')
    await expect.poll(async () => (await header.boundingBox())!.width).toBe(36)
    await expect(header).toContainText('28')
    await expect(header).not.toContainText('28/9')

    const row = await grid.rowKeyOf(R1, 'Cindy')
    const cell = await grid.reveal(row, '2026-11-02')
    await grid.typeInto(cell, '2')
    await grid.waitSaved()
    await expect(grid.value(cell)).toHaveText('2') // แคบ drops the trailing ".0"

    await grid.reload()
    await expect(grid.densityButton('COMPACT')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await header.boundingBox())!.width).toBe(36)

    const wl = new WorkloadPage(page)
    await wl.open()
    const toolbar = page.getByRole('group', { name: th.grid.toolbar.density })
    await expect(
      toolbar.getByRole('button', { name: th.grid.toolbar.densityCompact, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(wl.table()).toHaveAttribute('data-density', 'COMPACT')
  })
})

// ── R6 ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Every pixel column of `box` (client px) is one flat colour top to bottom: nothing is painted over that strip. */
async function expectFlatStrip(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  what: string,
) {
  const png = (await page.screenshot({ clip: box })).toString('base64')
  const mixed = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    const px = (x: number, y: number) => data.slice((y * width + x) * 4, (y * width + x) * 4 + 3).join()
    const bad: number[] = []
    for (let x = 0; x < width; x++) for (let y = 1; y < height; y++) if (px(x, y) !== px(x, 0)) bad.push(x)
    return [...new Set(bad)]
  }, png)
  expect(mixed, `${what}: pixel columns with something painted on them`).toEqual([])
}

test.describe('R6 ⟲ (FR-706, FR-823) the chips stay inside the task column, in real pixels · manager', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true })
  })

  /** The strip just right of the task column on the row, inside its ผู้รับผิดชอบ cell, before the person's name. */
  async function assigneeEdge(header: Locator) {
    const task = (await header.locator('[data-task-cell]').boundingBox())!
    return { x: task.x + task.width + 1, y: task.y + 3, width: 6, height: task.height - 6 }
  }

  test('at 160–240 px nothing paints past the column; the collapsed ◆ and ⚠ keep their glyphs; a wide column shows full text', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'manager')
    const tasks = new TaskListPage(page)
    await tasks.openTab()
    await tasks.openPanel(UAT)
    await tasks.addBlockerInPanel(R1)
    await grid.openTab(POS)
    await page.keyboard.press('Escape')
    await expect(tasks.panel()).toHaveCount(0)

    const header = grid.rowHeader(UAT, 'Ivy')
    const key = await grid.rowKeyOf(UAT, 'Ivy')
    const main = header.locator('[data-task-main]')
    await page.mouse.move(0, 0) // no hover: the row's actions keep their slot either way
    expect(await grid.taskColumnWidth()).toBe(TASK_W_DEFAULT)

    // default column: all chips are in their smallest form, with their glyph on screen
    await expect(main).toHaveAttribute('data-chip-level', '2')
    await expect(grid.taskMilestoneLink(key)).toHaveText('◆')
    const chipBoxes = async () =>
      main.evaluate((m) => {
        const box = (s: string) => {
          const r = m.querySelector(s)!.getBoundingClientRect()
          return { left: r.left, right: r.right, width: r.width }
        }
        const late = m.querySelector('[data-ms-late] span')!.getBoundingClientRect()
        return {
          main: m.getBoundingClientRect().right,
          ms: box('[data-ms-link]'),
          late: box('[data-ms-late]'),
          lateGlyph: late.width,
          blocker: box('[data-blocker-badge]'),
        }
      })
    const c = await chipBoxes()
    expect(c.ms.width, '◆ has its width').toBeGreaterThanOrEqual(8)
    expect(c.lateGlyph, '⚠ has its width').toBeGreaterThanOrEqual(8)
    expect(c.blocker.right, 'the last chip ends inside the box').toBeLessThanOrEqual(c.main + 0.5)
    await expectFlatStrip(page, await assigneeEdge(header), `${TASK_W_DEFAULT} px`)

    // narrowest column: no room for everything, but the overflow is clipped at the column edge
    await grid.resizeTaskColumn(TASK_W_MIN - TASK_W_DEFAULT)
    expect(await grid.taskColumnWidth()).toBe(TASK_W_MIN)
    await page.mouse.move(0, 0)
    await expectFlatStrip(page, await assigneeEdge(header), `${TASK_W_MIN} px`)
    const hit = await header.locator('[data-assignee-cell]').evaluate((cell) => {
      const r = cell.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + 2, r.top + r.height / 2)
      return top !== null && cell.contains(top)
    })
    expect(hit, 'the assignee cell is on top at its left edge').toBe(true)

    // a wide column: level 0, the full forms
    await grid.resizeTaskColumn(520 - TASK_W_MIN)
    await expect(main).toHaveAttribute('data-chip-level', '0')
    await expect(grid.taskMilestoneLink(key)).toHaveText(th.milestones.grid.taskLink(SIGN_OFF))
    await expect(grid.taskLate(key)).toContainText(th.milestones.late)
    await expect(header.getByText(th.tasks.blockers.badgeWaiting(1), { exact: true })).toBeVisible()
  })
})
