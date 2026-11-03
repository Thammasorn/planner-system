/**
 * M11 — databases inside pages + equations (plan/m11-database-views.md §7.3; SPEC §4.14 FR-1401…1475, §4.15
 * FR-1501…1506, AC-1401…1414, AC-1501…1504, NFR-11/12 smoke).
 *
 * Determinism (PLAN §4.5): production build, APP_NOW = 2026-09-30 10:00 +07, browser clock pinned by the auto fixture.
 * Every describe resets planner_e2e in its own beforeAll (⟲) and runs serially. Strings come from `th`. Waits are on
 * UI state, server-action responses and toasts. Seeded databases (support/seed-databases.ts) are test data the scenario
 * is not about; the behaviour under test always goes through the UI.
 *
 * Golden: POS Upgrade (members Cindy, Ivy, Mint; Peter is not a member), its "Project Charter"; Data Warehouse.
 */
import type { Locator, Page, TestInfo } from '@playwright/test'
import { th } from '../src/i18n/th'
import { expect, loginAs, openGuardedPage, resetDb, switchUser, test, waitForServerAction } from './fixtures'
import { DatabaseBlock, rowPanel } from './pages/database'
import { PageScreen } from './pages/page-screen'
import { toastWith, undoButtonOf } from './pages/toast'
import {
  databasesOfPage,
  insertDatabase,
  insertSyntheticDatabase,
  liveRowsOf,
  type SeedView,
  pageContentJson,
  withE2eDb,
} from './support/seed-databases'
import { charterIdOf } from './support/seed-tasks'
import { insertPage } from './support/seed-pages'

const POS = 'POS Upgrade'
const T = th.database
const RISKS = 'ทะเบียนความเสี่ยง'
const SEEDED = 'ติดตามงานร้าน'
const STATUS = T.defaults.statusOptions
const BY_PERSON = 'ตามคน'

/** The standard seeded database on the POS charter (5 rows, every interesting type, three views + `extraViews`). */
async function seedPosDatabase(o: { extraViews?: SeedView[] } = {}): Promise<void> {
  await resetDb(undefined, {
    extras: (tx) =>
      insertDatabase(tx, {
        pageTitle: 'Project Charter',
        projectName: POS,
        title: SEEDED,
        byNickname: 'Cindy',
        columns: [
          { name: 'สถานะ', type: 'SELECT', options: [...STATUS] },
          { name: 'วันที่', type: 'DATE' },
          { name: 'ตัวเลข', type: 'NUMBER' },
          { name: 'โน้ต', type: 'TEXT' },
          { name: 'ติ๊ก', type: 'CHECKBOX' },
          { name: 'คน', type: 'PERSON' },
          { name: 'ลิงก์', type: 'URL' },
        ],
        views: [
          { type: 'TABLE', name: 'ตาราง' },
          { type: 'KANBAN', name: 'คัมบัง', by: 'สถานะ' },
          { type: 'CALENDAR', name: 'ปฏิทิน', by: 'วันที่' },
          ...(o.extraViews ?? []),
        ],
        rows: [
          { title: 'ลูกค้าส่ง spec ช้า', cells: { สถานะ: 'กำลังทำ', วันที่: '2026-11-05', ตัวเลข: '30', คน: ['Cindy'] } },
          { title: 'ทีมไม่พอ', cells: { สถานะ: 'ยังไม่เริ่ม', ตัวเลข: '5', โน้ต: '12' } },
          { title: 'งบเกิน', cells: { สถานะ: 'กำลังทำ', วันที่: '2026-11-12', ตัวเลข: '100', ติ๊ก: true } },
          { title: 'เซิร์ฟเวอร์ล่ม', cells: { สถานะ: 'เสร็จ', ตัวเลข: '1', โน้ต: 'abc' } },
          { title: 'ไม่มีวันที่', cells: { โน้ต: '1,500' } },
        ],
      }),
  })
}

/**
 * Owner bug 2026-11-03: hovering a block shows BlockNote's side menu (+ / ⠿) vertically centred on the block's title
 * line — within 3 px — for database and equation blocks as for headings and paragraphs (side-menu-offset.ts).
 */
async function expectSideMenuCentredOn(page: Page, line: Locator): Promise<void> {
  await line.scrollIntoViewIfNeeded()
  const box = await line.boundingBox()
  if (!box) throw new Error('title line not laid out')
  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + box.height / 2, { steps: 4 })
  const handle = page.getByRole('button', { name: th.editor.blocknote.side_menu.drag_handle_label, exact: true })
  await expect(handle).toBeVisible()
  await expect
    .poll(async () => {
      const h = await handle.boundingBox()
      const l = await line.boundingBox()
      return h && l ? Math.abs(h.y + h.height / 2 - (l.y + l.height / 2)) : Infinity
    })
    .toBeLessThanOrEqual(3)
}

/** `edit`: the test types into the editor — wait until it is editable (read-only until the first lease answer, so
 *  keystrokes sent before it are dropped; as in m4 E6). Viewers that never hold the lease leave it off. */
async function openCharter(page: Page, o: { edit?: boolean } = {}): Promise<{ screen: PageScreen; pageId: string }> {
  const pageId = await charterIdOf(POS)
  const screen = new PageScreen(page)
  await screen.goto(pageId)
  await screen.editor.waitReady()
  if (o.edit) await screen.editor.expectEditable()
  return { screen, pageId }
}

/** Live rows of a database with their per-row `version` (FR-1463), in position order. */
function rowVersionsOf(databaseId: string): Promise<{ id: string; title: string; version: number }[]> {
  return withE2eDb(async (d) => {
    const { databaseRows } = await import('../src/server/db/schema')
    const { and, asc, eq, isNull } = await import('drizzle-orm')
    return d
      .select({ id: databaseRows.id, title: databaseRows.title, version: databaseRows.version })
      .from(databaseRows)
      .where(and(eq(databaseRows.databaseId, databaseId), isNull(databaseRows.deletedAt)))
      .orderBy(asc(databaseRows.position), asc(databaseRows.id))
  })
}

/** Opens the "⋯" menu of a view tab (shown on the selected tab only) after selecting it. */
async function openViewMenu(page: Page, db: DatabaseBlock, name: string): Promise<void> {
  await db.tab(name).click()
  await db.root.getByRole('button', { name: `${T.toolbar.more} ${name}`, exact: true }).click()
  await expect(page.getByRole('menu')).toBeVisible()
}
function deleteViewItem(page: Page) {
  return page.getByRole('menu').getByRole('menuitem', { name: new RegExp(`^${T.views.delete}`) })
}

async function openSeeded(page: Page): Promise<{ db: DatabaseBlock; pageId: string; screen: PageScreen }> {
  const { screen, pageId } = await openCharter(page)
  const db = DatabaseBlock.first(page) // the charter holds one database
  await expect(db.table()).toBeVisible()
  return { db, pageId, screen }
}

test.describe('D1 create a table database from the slash menu (AC-1401)', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('cindy inserts /ตารางข้อมูล, names it, adds three rows; reload keeps them; the page JSON holds only the id', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const { screen, pageId } = await openCharter(page, { edit: true })
    await screen.editor.newBlock()
    const created = waitForServerAction(page)
    await screen.editor.slash('table view')
    await screen.editor.pickSlash(th.editor.slash.databaseTable.title)
    await created
    const db = DatabaseBlock.first(page)
    await expect(db.table()).toBeVisible()
    await expect(db.title()).toBeFocused()
    const renamed = waitForServerAction(page)
    await page.keyboard.type(RISKS)
    await page.keyboard.press('Enter')
    await renamed
    await expectSideMenuCentredOn(page, db.title())
    // "+ แถวใหม่" opens the new row's title; Enter in the last row confirms and starts the next row (FR-1422)
    await db.newRowButton().click()
    for (const [i, name] of ['เสี่ยง 1', 'เสี่ยง 2', 'เสี่ยง 3'].entries()) {
      await expect(db.rows()).toHaveCount(i + 1)
      await expect(db.focusedEditor()).toHaveCount(1)
      await page.keyboard.type(name)
      await page.keyboard.press(i < 2 ? 'Enter' : 'Tab') // Tab confirms without starting another row
    }
    const dbId = await db.id()
    await expect
      .poll(async () => (await liveRowsOf(dbId)).map((r) => r.title))
      .toEqual(['เสี่ยง 1', 'เสี่ยง 2', 'เสี่ยง 3'])
    await expect(db.rows()).toHaveCount(3)
    await screen.editor.waitSaved()
    await page.reload()
    const again = DatabaseBlock.first(page)
    await expect(again.rows()).toHaveCount(3)
    expect(await again.rowTitles()).toEqual(['เสี่ยง 1', 'เสี่ยง 2', 'เสี่ยง 3'])
    expect(await again.columnHeaders()).toEqual([T.defaults.title, T.defaults.status, T.defaults.date])
    const dbs = await databasesOfPage(pageId)
    expect(dbs.filter((d) => d.detachedAt === null)).toHaveLength(1)
    expect(dbs[0]!.title).toBe(RISKS)
    const json = await pageContentJson(pageId)
    expect(json).toContain(dbs[0]!.id)
    expect(json).not.toContain('เสี่ยง 1')
  })
})

test.describe('D2/D3 cells, sort and the footer count (AC-1402, AC-1403)', () => {
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('number and URL cells validate; a sort persists and every member sees the same view', async ({ page, browser }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    // number round-trips as the canonical string (BR-91)
    const num = await db.cell('ทีมไม่พอ', 'ตัวเลข')
    await num.dblclick()
    const saved = waitForServerAction(page)
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('1234567.891234')
    await page.keyboard.press('Enter')
    await saved
    await expect(num).toContainText('1,234,567.891234')
    // a javascript: URL is refused in the editor and never saved (FR-1410)
    const url = await db.cell('ทีมไม่พอ', 'ลิงก์')
    await url.dblclick()
    await page.keyboard.type('javascript:alert(1)')
    await page.keyboard.press('Enter')
    await expect(page.getByText(T.cells.invalidUrl).first()).toBeVisible()
    await page.keyboard.press('Escape')
    // sort ตัวเลข มาก→น้อย from the column menu
    await db.columnMenuButton('ตัวเลข').click()
    const sorted = waitForServerAction(page)
    await page.getByRole('menuitem', { name: T.columnMenu.sortDesc, exact: true }).click()
    await sorted
    await expect.poll(() => db.rowTitles()).toEqual(['ทีมไม่พอ', 'งบเกิน', 'ลูกค้าส่ง spec ช้า', 'เซิร์ฟเวอร์ล่ม', 'ไม่มีวันที่'])
    await expect(db.footer()).toHaveText(T.table.count(5))
    await page.reload()
    const again = DatabaseBlock.first(page)
    await expect.poll(() => again.rowTitles()).toEqual(['ทีมไม่พอ', 'งบเกิน', 'ลูกค้าส่ง spec ช้า', 'เซิร์ฟเวอร์ล่ม', 'ไม่มีวันที่'])
    const rows = await liveRowsOf(await again.id())
    const cols = await withE2eDb(async (d) => {
      const { databaseColumns } = await import('../src/server/db/schema')
      const { eq } = await import('drizzle-orm')
      return d.select().from(databaseColumns).where(eq(databaseColumns.databaseId, rows.length ? (await again.id()) : ''))
    })
    const numberCol = cols.find((c) => c.name === 'ตัวเลข')!
    const urlCol = cols.find((c) => c.name === 'ลิงก์')!
    const team = rows.find((r) => r.title === 'ทีมไม่พอ')!
    expect(team.cells[numberCol.id]).toBe('1234567.891234')
    expect(team.cells[urlCol.id]).toBeUndefined()
    // ivy sees the same shared view
    const ivy = await openGuardedPage(browser)
    await loginAs(ivy.page, 'ivy')
    const ivyDb = (await openSeeded(ivy.page)).db
    await expect.poll(() => ivyDb.rowTitles()).toEqual(['ทีมไม่พอ', 'งบเกิน', 'ลูกค้าส่ง spec ช้า', 'เซิร์ฟเวอร์ล่ม', 'ไม่มีวันที่'])
    await ivy.close()
  })
})

test.describe('D2b option editor: type + Enter creates once, an existing name in any case is picked (BR-90)', () => {
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('“Review” + Enter creates and closes; “review ” on another row picks it; one option, no temp id after reload', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    const first = await db.cell('ไม่มีวันที่', 'สถานะ')
    await first.click()
    const box = page.getByRole('combobox', { name: 'สถานะ', exact: true })
    await expect(box).toBeFocused()
    await box.fill('Review')
    // "สร้าง “Review”" is the first, highlighted item
    await expect(page.getByRole('option').first()).toHaveText(T.cells.createOption('Review'))
    const created = waitForServerAction(page)
    await page.keyboard.press('Enter')
    await created
    await expect(first).toContainText('Review')
    const second = await db.cell('ทีมไม่พอ', 'สถานะ')
    await second.click()
    await page.getByRole('combobox', { name: 'สถานะ', exact: true }).fill('review ')
    await expect(page.getByRole('option', { name: T.cells.createOption('review') })).toHaveCount(0)
    const picked = waitForServerAction(page)
    await page.keyboard.press('Enter')
    await picked
    await expect(second).toContainText('Review')
    await page.reload()
    await expect(db.table()).toBeVisible()
    await expect(db.table()).not.toContainText('tmp_')
    await (await db.cell('ไม่มีวันที่', 'สถานะ')).click()
    await page.getByRole('combobox', { name: 'สถานะ', exact: true }).fill('rev')
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['Review'])
    await page.keyboard.press('Escape')
  })
})

test.describe('D2c the column menu opens under its header, also for a just-created column (owner bug 2026-11-03)', () => {
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  /** The menu's top-left lies within the header's horizontal span, just below it (never the viewport corner). */
  async function expectUnder(page: Page, header: Locator): Promise<void> {
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: T.columnMenu.rename }) })
    await expect(dialog).toBeVisible()
    await expect
      .poll(async () => {
        const h = await header.boundingBox()
        const d = await dialog.boundingBox()
        if (!h || !d) return 'not laid out'
        const inSpan = d.x >= h.x - 1 && d.x <= h.x + h.width
        const below = d.y >= h.y + h.height - 2 && d.y <= h.y + h.height + 24
        return inSpan && below ? 'under' : `menu ${d.x},${d.y} vs header ${h.x},${h.y} ${h.width}×${h.height}`
      })
      .toBe('under')
  }

  test('“+” → ตัวเลือก: the new column’s menu sits under its header after the server answers; reopening it too', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    const created = waitForServerAction(page)
    await db.root.getByRole('button', { name: T.table.addColumn, exact: true }).click()
    await page.getByRole('menuitem', { name: T.types.SELECT, exact: true }).click()
    await created // the temp id is now the server id (the header re-mounted)
    const header = db.table().getByRole('columnheader').last() // new columns are appended
    await expectUnder(page, header)
    const name = (await header.innerText()).trim()
    await page.keyboard.press('Escape')
    await db.columnMenuButton(name).click()
    await expectUnder(page, header)
    await page.keyboard.press('Escape')
  })
})

test.describe('D4 kanban moves with undo (AC-1404)', () => {
  test.beforeAll(async () => {
    await seedPosDatabase({ extraViews: [{ type: 'KANBAN', name: BY_PERSON, by: 'คน' }] })
  })

  test('“ย้ายไป…” moves a card to เสร็จ; Cmd+Z moves it back; group counts follow', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    await db.tab('คัมบัง').click()
    await expect(db.kanban()).toBeVisible()
    await expect(db.kanbanGroup(STATUS[1])).toBeVisible()
    await expect(db.kanbanGroup(STATUS[1]).getByTestId('db-card')).toHaveCount(2)
    await expect(db.kanbanGroup(STATUS[2]).getByTestId('db-card')).toHaveCount(1)
    await db.root.getByRole('button', { name: T.kanban.cardMenu('งบเกิน'), exact: true }).click()
    await expect(page.getByRole('menu')).toContainText(T.kanban.moveTo) // the card menu is the "ย้ายไป…" list
    const moved = waitForServerAction(page)
    await page.getByRole('menuitem', { name: STATUS[2], exact: true }).click()
    await moved
    await expect(db.kanbanGroup(STATUS[2]).getByTestId('db-card')).toHaveCount(2)
    await expect(db.kanbanGroup(STATUS[1]).getByTestId('db-card')).toHaveCount(1)
    await expect(toastWith(page, T.toasts.moved)).toBeVisible()
    const back = waitForServerAction(page)
    await undoButtonOf(page, T.toasts.moved).click()
    await back
    await expect(db.kanbanGroup(STATUS[1]).getByTestId('db-card')).toHaveCount(2)
    await expect(db.kanbanGroup(T.kanban.noValue).getByTestId('db-card')).toHaveCount(1)
  })

  test('grouped by คน: “ย้ายไป…” ไม่มีค่า clears the person; เลิกทำ puts Cindy back', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    await db.tab(BY_PERSON).click()
    await expect(db.kanban()).toBeVisible()
    const none = db.kanbanGroup(T.kanban.noValue).getByTestId('db-card')
    await expect(none).toHaveCount(4) // only ลูกค้าส่ง spec ช้า has a person (Cindy)
    await expect(db.kanbanGroup(T.kanban.noValue)).not.toContainText('ลูกค้าส่ง spec ช้า')
    await db.root.getByRole('button', { name: T.kanban.cardMenu('ลูกค้าส่ง spec ช้า'), exact: true }).click()
    const moved = waitForServerAction(page)
    await page.getByRole('menuitem', { name: T.kanban.noValue, exact: true }).click()
    await moved
    await expect(none).toHaveCount(5)
    const dbId = await db.id()
    const personOf = async () => {
      const r = (await liveRowsOf(dbId)).find((x) => x.title === 'ลูกค้าส่ง spec ช้า')!
      return Object.values(r.cells).filter((v) => Array.isArray(v) && v.length > 0).length
    }
    await expect.poll(personOf).toBe(0)
    const back = waitForServerAction(page)
    await undoButtonOf(page, T.toasts.moved).click()
    await back
    await expect(none).toHaveCount(4)
    await expect.poll(personOf).toBe(1)
  })
})

test.describe('D5 calendar (AC-1405)', () => {
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('› to พฤศจิกายน 2569 shows the dated rows; + on 20 Nov adds a row with that date', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    await db.tab('ปฏิทิน').click()
    await expect(db.calendar()).toBeVisible()
    // today = 30 ก.ย. 2569 → › twice to พฤศจิกายน 2569
    await db.calendar().getByRole('button', { name: T.calendar.next, exact: true }).click()
    await expect(db.calendar()).toContainText('ตุลาคม 2569')
    await db.calendar().getByRole('button', { name: T.calendar.next, exact: true }).click()
    await expect(db.calendar()).toContainText('พฤศจิกายน 2569')
    await expect(db.card('ลูกค้าส่ง spec ช้า')).toBeVisible()
    await expect(db.card('งบเกิน')).toBeVisible()
    const day = db.calendar().locator('[role="gridcell"][data-date="2026-11-20"]')
    await day.hover()
    await day.getByRole('button', { name: /^เพิ่มแถวในวันที่/ }).click()
    const created = waitForServerAction(page)
    await page.keyboard.type('ตรวจรับ')
    await page.keyboard.press('Enter')
    await created
    await expect(db.card('ตรวจรับ')).toBeVisible()
    const rows = await liveRowsOf(await db.id())
    const hit = rows.find((r) => r.title === 'ตรวจรับ')!
    expect(Object.values(hit.cells)).toContain('2026-11-20')
  })
})

test.describe('D6/D7 type change, deletes and undo without dialogs (AC-1406, AC-1407)', () => {
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('TEXT → ตัวเลข keeps 12 and 1,500, empties abc; เลิกทำ restores; TITLE cannot change type', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    await db.columnMenuButton('โน้ต').click()
    await page.getByRole('menuitem', { name: T.columnMenu.changeType }).click()
    const changed = waitForServerAction(page)
    await page.getByRole('menuitem', { name: T.types.NUMBER, exact: true }).click()
    await changed
    await expect(await db.cell('ทีมไม่พอ', 'โน้ต')).toHaveText('12')
    await expect(await db.cell('ไม่มีวันที่', 'โน้ต')).toHaveText('1,500')
    await expect(await db.cell('เซิร์ฟเวอร์ล่ม', 'โน้ต')).toHaveText('')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const reverted = waitForServerAction(page)
    await undoButtonOf(page, T.toasts.typeConverted).click()
    await reverted
    await expect(await db.cell('เซิร์ฟเวอร์ล่ม', 'โน้ต')).toHaveText('abc')
    await db.columnMenuButton(T.defaults.title).click()
    await expect(page.getByRole('menuitem', { name: T.columnMenu.changeType })).toBeDisabled()
    await page.keyboard.press('Escape')
  })

  test('deleting two rows shows a toast; เลิกทำ brings them back in place', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    await db.row('ทีมไม่พอ').getByRole('checkbox').click()
    await db.row('งบเกิน').getByRole('checkbox').click()
    const deleted = waitForServerAction(page)
    await db.root.getByRole('button', { name: T.table.deleteSelected, exact: true }).click()
    await deleted
    await expect(db.rows()).toHaveCount(3)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const restored = waitForServerAction(page)
    await undoButtonOf(page, T.toasts.rowsDeleted(2)).click()
    await restored
    await expect(db.rows()).toHaveCount(5)
    expect(await db.rowTitles()).toEqual(['ลูกค้าส่ง spec ช้า', 'ทีมไม่พอ', 'งบเกิน', 'เซิร์ฟเวอร์ล่ม', 'ไม่มีวันที่'])
  })

  test('right-click a row → ลบแถว deletes it without a dialog; เลิกทำ brings it back (FR-1424a)', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    await db.row('งบเกิน').locator('[data-type="NUMBER"]').click({ button: 'right' })
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem')).toHaveText([
      T.rowMenu.open,
      T.rowMenu.openAsPage,
      T.rowMenu.duplicate,
      T.rowMenu.delete,
    ])
    const deleted = waitForServerAction(page)
    await menu.getByRole('menuitem', { name: T.rowMenu.delete, exact: true }).click()
    await deleted
    await expect(db.rows()).toHaveCount(4)
    await expect(db.row('งบเกิน')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const restored = waitForServerAction(page)
    await undoButtonOf(page, T.toasts.rowsDeleted(1)).click()
    await restored
    await expect(db.rows()).toHaveCount(5)
    await expect(db.row('งบเกิน')).toHaveCount(1)
  })

  test('deleting สถานะ makes คัมบัง ask for a group column; เลิกทำ regroups; views delete + undo; the last view cannot go', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    // column delete (FR-1415): no dialog, the kanban that grouped by it asks for a column, undo regroups
    await db.columnMenuButton('สถานะ').click()
    const gone = waitForServerAction(page)
    await page.getByRole('menuitem', { name: T.columnMenu.delete, exact: true }).click()
    await gone
    await expect.poll(() => db.columnHeaders()).not.toContain('สถานะ')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await db.tab('คัมบัง').click()
    const pick = db.root.getByTestId('db-kanban-pick')
    await expect(pick).toContainText(T.kanban.pickGroupColumn)
    const back = waitForServerAction(page)
    await undoButtonOf(page, T.toasts.columnDeleted('สถานะ')).click()
    await back
    await expect(pick).toHaveCount(0)
    await expect(db.kanbanGroup(STATUS[1]).getByTestId('db-card')).toHaveCount(2)
    await expect(db.kanbanGroup(STATUS[2]).getByTestId('db-card')).toHaveCount(1)
    // view delete (FR-1405): immediate, undo brings the tab back
    await openViewMenu(page, db, 'ปฏิทิน')
    const viewGone = waitForServerAction(page)
    await deleteViewItem(page).click()
    await viewGone
    await expect(db.tab('ปฏิทิน')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const viewBack = waitForServerAction(page)
    await undoButtonOf(page, T.toasts.viewDeleted('ปฏิทิน')).click()
    await viewBack
    await expect(db.tab('ปฏิทิน')).toBeVisible()
    // down to one view: its delete is disabled with the reason
    for (const name of ['ปฏิทิน', 'คัมบัง']) {
      await openViewMenu(page, db, name)
      const del = waitForServerAction(page)
      await deleteViewItem(page).click()
      await del
      await expect(db.tab(name)).toHaveCount(0)
    }
    await openViewMenu(page, db, 'ตาราง')
    await expect(deleteViewItem(page)).toBeDisabled()
    await expect(deleteViewItem(page)).toContainText(T.errors.lastView)
    await page.keyboard.press('Escape')
    await expect(db.tabs().getByRole('tab')).toHaveCount(1)
  })
})

test.describe('D8 permissions and leaks (AC-1408)', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] })
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('peter (not in POS) gets one 404 without names; ivy finds the row in Cmd+K and opens its panel', async ({
    page,
  }) => {
    const pageId = await charterIdOf(POS)
    const [d] = await databasesOfPage(pageId)
    await loginAs(page, 'peter')
    const res = await page.request.get(`/api/pages/${pageId}/databases/${d!.id}`)
    expect(res.status()).toBe(404)
    const body = await res.text()
    expect(body).not.toContain(SEEDED)
    expect(body).not.toContain('ลูกค้าส่ง')
    const search = await page.request.get(`/api/search?q=${encodeURIComponent('ลูกค้าส่ง spec')}`)
    expect(((await search.json()) as { databases: unknown[] }).databases).toEqual([])
    await page.context().clearCookies()
    await loginAs(page, 'ivy')
    const hit = await page.request.get(`/api/search?q=${encodeURIComponent('ลูกค้าส่ง spec')}`)
    const hits = ((await hit.json()) as { databases: { href: string; rowTitle: string }[] }).databases
    expect(hits.map((h) => h.rowTitle)).toEqual(['ลูกค้าส่ง spec ช้า'])
    await page.goto(hits[0]!.href)
    await expect(rowPanel(page)).toBeVisible()
    await expect(rowPanel(page).getByRole('textbox', { name: T.types.TITLE, exact: true })).toHaveValue('ลูกค้าส่ง spec ช้า')
  })
})

test.describe('D8 locked wiki: workers read, the manager edits (AC-1408, FR-1460)', () => {
  const LOCKED = 'นโยบายล็อก D8'
  const WIKI_DB = 'ทะเบียนนโยบาย'
  let wikiPageId = ''
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        wikiPageId = await insertPage(tx, { space: 'WORKSPACE', title: LOCKED, byNickname: 'Manager', locked: true })
        await insertDatabase(tx, {
          pageId: wikiPageId,
          title: WIKI_DB,
          byNickname: 'Manager',
          columns: [{ name: 'สถานะ', type: 'SELECT', options: [...STATUS] }],
          views: [{ type: 'TABLE', name: 'ตาราง' }],
          rows: [{ title: 'นโยบายลา', cells: { สถานะ: 'เสร็จ' } }],
        })
      },
    })
  })

  test('ivy (worker) sees the rows without any control; manager adds a row', async ({ page }) => {
    await loginAs(page, 'ivy')
    await new PageScreen(page).goto(wikiPageId)
    const db = DatabaseBlock.first(page)
    await expect(db.rows()).toHaveCount(1)
    expect(await db.rowTitles()).toEqual(['นโยบายลา'])
    await expect(db.root).toHaveAttribute('data-readonly', 'true')
    await expect(db.newRowButton()).toHaveCount(0)
    await expect(db.columnMenuButton('สถานะ')).toHaveCount(0)
    await expect(db.root.getByRole('button', { name: T.views.add, exact: true })).toHaveCount(0)
    await switchUser(page, 'manager')
    await new PageScreen(page).goto(wikiPageId)
    const mdb = DatabaseBlock.first(page)
    await expect(mdb.root).not.toHaveAttribute('data-readonly', 'true')
    await mdb.newRowButton().click()
    await expect(mdb.focusedEditor()).toHaveCount(1)
    const created = waitForServerAction(page)
    await page.keyboard.type('นโยบายเบิก')
    await page.keyboard.press('Tab')
    await created
    const dbId = await mdb.id()
    await expect.poll(async () => (await liveRowsOf(dbId)).map((r) => r.title)).toEqual(['นโยบายลา', 'นโยบายเบิก'])
  })
})

test.describe('D10/D11 duplicate and detach (AC-1410, AC-1411)', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] }) // the forged block's GET is a deliberate 404
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('⋯ ทำสำเนา copies the database with new ids; editing the copy leaves the source alone', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { screen, pageId } = await openCharter(page)
    await screen.openMenu('Project Charter')
    const dup = waitForServerAction(page)
    await screen.menuItem(th.pages.duplicate).click()
    await dup
    const [source] = await databasesOfPage(pageId)
    const copies = await withE2eDb(async (db) => {
      const { databases } = await import('../src/server/db/schema')
      const { and, eq, ne } = await import('drizzle-orm')
      return db.select().from(databases).where(and(eq(databases.title, SEEDED), ne(databases.id, source!.id)))
    })
    expect(copies).toHaveLength(1)
    const copy = copies[0]!
    // new ids: the database, its page and every row
    expect(copy.id).not.toBe(source!.id)
    expect(copy.pageId).not.toBe(pageId)
    const before = await rowVersionsOf(source!.id)
    const copyRows = await rowVersionsOf(copy.id)
    expect(copyRows.map((r) => r.title)).toEqual(before.map((r) => r.title))
    const sourceIds = new Set(before.map((r) => r.id))
    expect(copyRows.filter((r) => sourceIds.has(r.id))).toEqual([])
    // edit a row of the copy through its panel; the source row keeps its title and version
    await new PageScreen(page).goto(copy.pageId)
    const cdb = DatabaseBlock.byId(page, copy.id)
    await expect(cdb.table()).toBeVisible()
    await cdb.row('ทีมไม่พอ').hover() // row actions are revealed on hover (TableView.module.css .rowActions)
    await cdb.row('ทีมไม่พอ').getByRole('button', { name: `${T.table.openRow} ทีมไม่พอ` }).click()
    const title = rowPanel(page).getByRole('textbox', { name: T.types.TITLE, exact: true })
    await expect(title).toHaveValue('ทีมไม่พอ')
    await title.fill('ทีมไม่พอ (สำเนา)')
    const saved = waitForServerAction(page)
    await title.press('Enter')
    await saved
    await expect
      .poll(async () => (await rowVersionsOf(copy.id)).map((r) => r.title))
      .toContain('ทีมไม่พอ (สำเนา)')
    expect(await rowVersionsOf(source!.id)).toEqual(before)
  })

  test('a save without the block detaches the database (search no longer finds it); with the block it is back', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const pageId = await charterIdOf(POS)
    const [d] = await databasesOfPage(pageId)
    const content = JSON.parse(await pageContentJson(pageId)) as { type: string }[]
    const version = await withE2eDb(async (db) => {
      const { pages } = await import('../src/server/db/schema')
      const { eq } = await import('drizzle-orm')
      const [p] = await db.select({ v: pages.version }).from(pages).where(eq(pages.id, pageId))
      return p!.v
    })
    const put = (c: unknown[], v: number) =>
      page.request.put(`/api/pages/${pageId}/content`, {
        data: { baseVersion: v, content: c },
        headers: { origin: 'http://localhost:3100' },
      })
    expect((await put(content.filter((b) => b.type !== 'database'), version)).status()).toBe(200)
    expect((await databasesOfPage(pageId)).find((x) => x.id === d!.id)?.detachedAt).not.toBeNull()
    const s1 = await page.request.get(`/api/search?q=${encodeURIComponent('ลูกค้าส่ง spec')}`)
    const ids = ((await s1.json()) as { databases: { databaseId: string }[] }).databases.map((h) => h.databaseId)
    expect(ids).not.toContain(d!.id) // the duplicate made above is a different, attached database
    expect((await put(content, version + 1)).status()).toBe(200)
    expect((await databasesOfPage(pageId)).find((x) => x.id === d!.id)?.detachedAt).toBeNull()
  })

  test('a block forged with the charter database id on another page shows “ไม่พบฐานข้อมูล” and its route 404s', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const charterId = await charterIdOf(POS)
    const [d] = await databasesOfPage(charterId)
    const block = (JSON.parse(await pageContentJson(charterId)) as { type: string }[]).find((b) => b.type === 'database')!
    const { otherId, version } = await withE2eDb(async (db) => {
      const id = await insertPage(db, { space: 'PROJECT', projectName: POS, title: 'หน้าปลอม D10', byNickname: 'Cindy' })
      const { pages } = await import('../src/server/db/schema')
      const { eq } = await import('drizzle-orm')
      const [p] = await db.select({ v: pages.version }).from(pages).where(eq(pages.id, id))
      return { otherId: id, version: p!.v }
    })
    const res = await page.request.put(`/api/pages/${otherId}/content`, {
      data: { baseVersion: version, content: [block] },
      headers: { origin: 'http://localhost:3100' },
    })
    expect(res.status()).toBe(200)
    // the database still belongs to the charter only
    expect((await databasesOfPage(otherId)).map((x) => x.id)).toEqual([])
    const route = await page.request.get(`/api/pages/${otherId}/databases/${d!.id}`)
    expect(route.status()).toBe(404)
    expect(await route.text()).not.toContain(SEEDED)
    await new PageScreen(page).goto(otherId)
    const forged = page.locator(`[data-testid="db-block"][data-database-id="${d!.id}"][data-state="not-found"]`)
    await expect(forged).toHaveCount(1)
    await expect(forged).toHaveText(T.notFound)
    await expect(page.getByText(SEEDED)).toHaveCount(0)
  })
})

test.describe('D12 row limit (AC-1412)', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        const pageId = await insertPage(tx, { space: 'PROJECT', projectName: POS, title: 'หน้าเต็ม', byNickname: 'Cindy' })
        await insertSyntheticDatabase(tx, { pageId, rows: 1000, columns: 3, title: 'ฐานข้อมูลเต็ม' })
      },
    })
  })

  test('a database at 1,000 rows offers no new row', async ({ page }) => {
    await loginAs(page, 'cindy')
    const pageId = await withE2eDb(async (db) => {
      const { pages } = await import('../src/server/db/schema')
      const { eq } = await import('drizzle-orm')
      const [p] = await db.select({ id: pages.id }).from(pages).where(eq(pages.title, 'หน้าเต็ม'))
      return p!.id
    })
    await new PageScreen(page).goto(pageId)
    const db = DatabaseBlock.first(page)
    await expect(db.footer()).toHaveText(T.table.count(1000))
    await expect(db.newRowButton()).toBeDisabled()
  })
})

test.describe('D14 row page /r/<id> (AC-1414)', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] })
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('panel → เปิดเป็นหน้า → /r/<id> with properties and a body; peter gets 404', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { db } = await openSeeded(page)
    await db.row('ลูกค้าส่ง spec ช้า').getByRole('button', { name: `${T.table.openRow} ลูกค้าส่ง spec ช้า` }).click()
    await expect(rowPanel(page)).toBeVisible()
    await rowPanel(page).getByRole('link', { name: T.panel.openAsPage }).click()
    await page.waitForURL(/\/r\/[0-9a-f-]{36}$/)
    const rowUrl = new URL(page.url()).pathname
    await expect(
      page.getByRole('heading', { level: 1 }).getByRole('textbox', { name: T.types.TITLE, exact: true }),
    ).toHaveValue('ลูกค้าส่ง spec ช้า')
    await expect(page.getByRole('navigation', { name: th.layout.breadcrumb })).toContainText(SEEDED)
    const editor = page.getByTestId('row-body').locator('.bn-editor')
    await editor.click()
    const ensured = waitForServerAction(page)
    await page.keyboard.type('รายละเอียดเพิ่มเติม')
    await ensured
    await expect(page.locator('[data-testid="save-status"][data-save-state="saved"][data-dirty="false"]')).toHaveCount(1)
    await page.reload()
    await expect(page.getByTestId('row-body')).toContainText('รายละเอียดเพิ่มเติม')
    await page.context().clearCookies()
    await loginAs(page, 'peter')
    const res = await page.goto(rowUrl)
    expect(res?.status()).toBe(404)
  })
})

test.describe('E1/E3 equations (AC-1501, AC-1503)', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('/สมการ renders KaTeX from the bundle; an invalid formula shows ⚠ + the source', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await loginAs(page, 'cindy')
    const { screen } = await openCharter(page, { edit: true })
    await screen.editor.newBlock()
    await screen.editor.slash('equation')
    await screen.editor.pickSlash(th.editor.slash.equation.title)
    const popover = page.getByTestId('equation-popover')
    await expect(popover).toBeVisible()
    await page.keyboard.type('\\int_0^1 x^2\\,dx = \\frac{1}{3}')
    await page.keyboard.press('ControlOrMeta+Enter')
    const eq = page.getByTestId('equation').first()
    await expect(eq.locator('.katex')).toBeVisible()
    await expect(eq.locator('math')).toHaveCount(1)
    await screen.editor.waitSaved()
    await page.reload()
    await expect(page.getByTestId('equation').first().locator('.katex')).toBeVisible()
    await expectSideMenuCentredOn(page, page.getByTestId('equation').first())
    const fonts = requests.filter((u) => /KaTeX_|katex/i.test(u))
    for (const u of fonts) expect(new URL(u).pathname.startsWith('/_next/static/')).toBe(true)
    // invalid: ⚠ "สมการไม่ถูกต้อง" + the source
    await screen.editor.newBlock()
    await screen.editor.slash('equation')
    await screen.editor.pickSlash(th.editor.slash.equation.title)
    await expect(popover).toBeVisible()
    await page.keyboard.type('\\frac{1}{')
    await page.keyboard.press('ControlOrMeta+Enter')
    const bad = page.locator('[data-testid="equation"][data-state="error"]')
    await expect(bad).toHaveCount(1)
    await expect(bad).toContainText(th.editor.equation.invalid)
    await expect(bad).toContainText('\\frac{1}{')
  })
})

test.describe('E2/E4 inline equations and search (AC-1502, AC-1504)', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('selected text → toolbar “สมการ” becomes an inline equation; its source is searchable', async ({ page }) => {
    await loginAs(page, 'cindy')
    const { screen } = await openCharter(page, { edit: true })
    await screen.editor.newBlock()
    await screen.editor.type('พลังงาน E=mc^2 ตามสูตร')
    await screen.editor.selectText('E=mc^2')
    await page.getByRole('button', { name: th.editor.equation.toolbar, exact: true }).click()
    const inline = page.locator('[data-testid="inline-equation"][data-latex="E=mc^2"]')
    await expect(inline).toHaveCount(1)
    await expect(inline).toHaveAttribute('data-state', 'ok')
    await expect(screen.editor.content()).toContainText('พลังงาน')
    await expect(screen.editor.content()).toContainText('ตามสูตร')
    await screen.editor.waitSaved()
    const res = await page.request.get(`/api/search?q=${encodeURIComponent('mc^2')}`)
    const titles = ((await res.json()) as { pages: { title: string }[] }).pages.map((p) => p.title)
    expect(titles).toContain('Project Charter')
  })
})

test.describe('V1 phone: the page never scrolls sideways (FR-1408)', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.beforeAll(async () => {
    await seedPosDatabase()
  })

  test('the table scrolls inside its block', async ({ page }) => {
    await loginAs(page, 'ivy')
    const { db } = await openSeeded(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const scroller = await db.table().evaluate((el) => {
      const s = el.querySelector('[role="grid"]')?.parentElement ?? el
      return s.scrollWidth > s.clientWidth
    })
    expect(scroller).toBe(true)
  })
})

/** The page column's and an element's widths (px). */
async function widthOf(page: Page, testId: string): Promise<number> {
  return (await page.getByTestId(testId).first().boundingBox())!.width
}
async function attachShot(info: TestInfo, page: Page, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
}

for (const width of [1920, 2560]) {
  test.describe(`V2 ${width} px: reading column, full width and /r (FR-1602)`, () => {
    test.use({ viewport: { width, height: width === 1920 ? 1080 : 1440 } })
    test.beforeAll(async () => {
      await seedPosDatabase()
    })

    test('760 column with the table scrolling inside its block; full width widens the block; /r fits', async ({
      page,
    }, info) => {
      await loginAs(page, 'manager')
      const { db, screen } = await openSeeded(page)
      const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const tableScrolls = () =>
        db.table().evaluate((el) => {
          const s = el.querySelector('[role="grid"]')?.parentElement ?? el
          return s.scrollWidth > s.clientWidth
        })
      await expect(screen.column()).toHaveAttribute('data-full-width', 'false')
      const column = await widthOf(page, 'page-column')
      const block = (await db.root.boundingBox())!.width
      expect(column).toBeLessThanOrEqual(760)
      expect(block).toBeLessThanOrEqual(column + 1)
      expect(await tableScrolls()).toBe(true) // 1,636 px of columns inside ≤ 760
      expect(await noOverflow()).toBeLessThanOrEqual(0)
      await attachShot(info, page, `v2-${width}-default.png`)

      await screen.toggleFullWidth('Project Charter')
      await expect(screen.column()).toHaveAttribute('data-full-width', 'true')
      await expect.poll(async () => (await db.root.boundingBox())!.width).toBeGreaterThan(block + 400)
      expect(await noOverflow()).toBeLessThanOrEqual(0)
      await attachShot(info, page, `v2-${width}-full.png`)

      const [row] = await liveRowsOf(await db.id())
      await page.goto(`/r/${row!.id}`)
      await expect(page.getByTestId('page-column')).toBeVisible()
      await expect(
        page.getByRole('heading', { level: 1 }).getByRole('textbox', { name: T.types.TITLE, exact: true }),
      ).toHaveValue(row!.title)
      expect(await noOverflow()).toBeLessThanOrEqual(0)
      await attachShot(info, page, `v2-${width}-row.png`)
    })
  })
}

test.describe('P1/P2 perf smokes (NFR-11, NFR-12)', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: async (tx) => {
        const pageId = await insertPage(tx, { space: 'PROJECT', projectName: POS, title: 'หน้าพันแถว', byNickname: 'Manager' })
        await insertSyntheticDatabase(tx, { pageId, rows: 1000, columns: 20, title: 'ฐานข้อมูลพันแถว' })
      },
    })
  })

  test('1,000 × 20 renders and switches views within 2× budget; a page without equations loads no KaTeX', async ({
    page,
  }, info) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await loginAs(page, 'manager')
    const pageId = await withE2eDb(async (db) => {
      const { pages } = await import('../src/server/db/schema')
      const { eq } = await import('drizzle-orm')
      const [p] = await db.select({ id: pages.id }).from(pages).where(eq(pages.title, 'หน้าพันแถว'))
      return p!.id
    })
    const t0 = Date.now()
    await new PageScreen(page).goto(pageId)
    const db = DatabaseBlock.first(page)
    await expect(db.footer()).toHaveText(T.table.count(1000))
    const render = Date.now() - t0
    const t1 = Date.now()
    await db.tab('คัมบัง').click()
    await expect(db.kanban()).toBeVisible()
    const sw = Date.now() - t1
    info.annotations.push({ type: 'perf', description: `render ${render} ms · switch ${sw} ms` })
    expect(render).toBeLessThan(15_000)
    expect(sw).toBeLessThan(2_000)
    expect(requests.filter((u) => /katex|KaTeX_/.test(u))).toEqual([])
  })
})
