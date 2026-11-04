/**
 * M8 — Milestones (plan/m08-milestones.md §7.3 M1–M10, S6; SPEC §4.7 FR-701…708, AC-701, AC-702, BR-70…72, FR-409,
 * FR-601/613/614/661/663/907 milestone parts, PERM-15, §3.3).
 * Determinism (PLAN §4.5, X45/X46): production build, APP_NOW = 2026-09-30 10:00 +07, the browser clock pinned by the
 * auto fixture before the first goto; every describe resets planner_e2e in its own beforeAll (⟲). Strings come from
 * `th`, dates via `formatThaiDate`, numbers via `formatCd`; waits are on server-action responses, data attributes,
 * toasts or text — never sleeps. Grid rows / cells by data-row-key / test ids / accessible names only (C27, M8-D26).
 *
 * Golden facts used (F1 + SPEC App. A.2 via `resetDb(undefined, { milestones: true })`):
 * - CRM Migration (LEAD Cindy): "ย้ายข้อมูลลูกค้า" Cindy WEEK 5/10 … 2/11 (incl. 26/10), "ตั้งค่า automation" Ivy;
 *   A.2 "Data migration complete" 6 พ.ย. 2569.
 * - POS Upgrade (LEAD Cindy, member Ivy): "ทำ UAT + คู่มือหน้าร้าน" Ivy 250 cd at 28/9 and 125 at 5/10, bound to A.2
 *   "UAT sign-off" 2 ต.ค. (DUE_SOON on 30/9, late: plans in week 5/10); "Go-live สาขาแรก" 21 ธ.ค.; footer load at 28/9
 *   = 5.0 (Cindy 2.5 + Ivy 2.5).
 * - Data Warehouse (Peter): "Pipeline พร้อมใช้งาน" 23 ต.ค.; Mobile App Revamp: "Design freeze" 9 ต.ค. — hidden from Cindy.
 *
 * Scenario chaining (decision, plan §7.3 ⟲ marks): M1→M2→M3 share one serial describe (one reset); every other
 * scenario group resets for itself, so M6/M7 seed "Data cutover" (23 ต.ค., bound to "ย้ายข้อมูลลูกค้า") through the
 * reset `extras` instead of depending on M3's final date (21 ต.ค.).
 */
import type { Page } from '@playwright/test'
import { and, eq } from 'drizzle-orm'
import type { ISODate, PeriodKey } from '../src/domain/types'
import { formatCd } from '../src/domain/units'
import { th } from '../src/i18n/th'
import { formatThaiDate } from '../src/lib/format'
import { milestones, projects, tasks, user } from '../src/server/db/schema'
import type { Tx } from '../src/server/db/types'
import {
  expect,
  loginAs,
  milestoneIdByName,
  projectIdByName,
  resetDb,
  test,
  waitForServerAction,
  type GoldenLogin,
} from './fixtures'
import { CalendarPage } from './pages/calendar'
import { expectDate, fillDate } from './pages/date-field'
import { escapeRe, GridPage } from './pages/grid'
import { MilestonesSection } from './pages/milestones'
import { Palette } from './pages/palette'
import { ProjectPage } from './pages/project'
import { TaskListPage } from './pages/tasks'
import { TeamTasksPage } from './pages/team-tasks'
import { toastWith, undoButtonOf } from './pages/toast'

const POS = 'POS Upgrade'
const CRM = 'CRM Migration'
const DW = 'Data Warehouse'
const UAT = 'ทำ UAT + คู่มือหน้าร้าน'
const CRM_CINDY = 'ย้ายข้อมูลลูกค้า'
const AUTOMATION = 'ตั้งค่า automation'
const SIGN_OFF = 'UAT sign-off'
const GO_LIVE = 'Go-live สาขาแรก'
const DMC = 'Data migration complete'
const PIPELINE = 'Pipeline พร้อมใช้งาน'
const HIDDEN_FROM_CINDY = [PIPELINE, 'Design freeze', 'Beta release', 'Dashboard v1 review'] // M8-D23
const CUTOVER = 'Data cutover'
const PILOT = 'Pilot'
const SOFT_LAUNCH = 'Soft launch'

const M = th.milestones
const d1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
const W = (monday: ISODate): PeriodKey => `W:${monday}`
const D = (date: ISODate): PeriodKey => `D:${date}`
/** "<name> · <date medium>" group header / option prefix, exact date included. */
const headerWithDate = (name: string, date: ISODate) =>
  new RegExp(`^${escapeRe(M.tasks.groupHeader(name, formatThaiDate(date, 'medium')))}`)

async function openGrid(page: Page, who: GoldenLogin, project: string): Promise<GridPage> {
  await loginAs(page, who)
  const grid = new GridPage(page)
  await grid.open(project, await projectIdByName(project))
  return grid
}

/** Switches the zoom only when it is not already pressed (the zoom is a saved preference). */
async function ensureZoom(grid: GridPage, level: 'week' | 'day'): Promise<void> {
  if ((await grid.zoomButton(level).getAttribute('aria-pressed')) !== 'true') await grid.zoom(level)
}

/** reset extras (M6/M7): "Data cutover" 23 ต.ค. in CRM, created by Cindy, with "ย้ายข้อมูลลูกค้า" bound to it. */
async function addCutover(tx: Tx): Promise<void> {
  const [crm] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.name, CRM))
  const [cindy] = await tx.select({ id: user.id }).from(user).where(eq(user.nickname, 'Cindy'))
  const [m] = await tx
    .insert(milestones)
    .values({ projectId: crm!.id, name: CUTOVER, date: '2026-10-23', createdBy: cindy!.id })
    .returning({ id: milestones.id })
  await tx
    .update(tasks)
    .set({ milestoneId: m!.id })
    .where(and(eq(tasks.projectId, crm!.id), eq(tasks.name, CRM_CINDY)))
}

// ── M1–M3 ────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('M1–M3 ⟲ (AC-701, AC-702, FR-702/706/707) grid ◆: create, late warning, drag + undo · cindy on CRM', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('M1 (AC-701, FR-702 grid cell) click W 19 ต.ค. → pre-filled Monday → ◆ 23 ต.ค. in week 19 ต.ค.; day zoom → Friday', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', CRM)
    await ensureZoom(grid, 'week')
    await expect(grid.milestoneRow()).toHaveAttribute('data-manage', 'true')

    const pop = await grid.openCreateAt(W('2026-10-19'))
    await expectDate(pop, M.fields.date, '2026-10-19') // the column's Monday (M8-D11)
    await grid.submitCreate(CUTOVER, '2026-10-23')
    await expect(toastWith(page, M.toast.created(CUTOVER))).toBeVisible()

    const diamond = grid.diamondIn(W('2026-10-19'), CUTOVER)
    await expect(diamond).toBeVisible()
    await expect(diamond).toHaveAttribute('data-status', 'UPCOMING') // +23 days (BR-70)
    await expect(diamond).toContainText(M.status.UPCOMING) // hidden status text, never colour alone
    await expect(diamond).toHaveAttribute('data-late', 'false')

    await grid.reload()
    await grid.revealMilestoneCell(W('2026-10-19'))
    await expect(grid.diamondIn(W('2026-10-19'), CUTOVER)).toBeVisible()

    await ensureZoom(grid, 'day')
    await grid.revealMilestoneCell(D('2026-10-23'))
    const friday = grid.diamondIn(D('2026-10-23'), CUTOVER)
    await expect(friday).toBeVisible()
    await expect(friday).toHaveAccessibleName(new RegExp(escapeRe(formatThaiDate('2026-10-23', 'medium'))))
    await expect(grid.milestoneCell(D('2026-10-19')).getByRole('button')).toHaveCount(0)
  })

  test('M2 (AC-702 + negative) bind the task planned in week 26 ต.ค. → "เลย milestone" on task and ◆; rebind to 6 พ.ย. → none', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const crmId = await projectIdByName(CRM)
    const list = new TaskListPage(page)
    const grid = new GridPage(page)
    const project = new ProjectPage(page)
    const section = new MilestonesSection(page)

    await list.goto(crmId)
    await list.setTaskMilestone(CRM_CINDY, CUTOVER)
    await expect(list.milestoneTag(CRM_CINDY)).toHaveText(M.tasks.cardLabel(CUTOVER))
    await expect(list.lateBadge(CRM_CINDY)).toBeVisible()
    await expect(list.panelLateAlert(M.tasks.lateAlert(CUTOVER, formatThaiDate('2026-10-23')))).toBeVisible()

    await grid.openTab(CRM)
    await ensureZoom(grid, 'week') // M1 ended in day zoom (a saved preference)
    await grid.revealMilestoneCell(W('2026-10-19'))
    const rowKey = await grid.rowKeyOf(CRM_CINDY, 'Cindy')
    // v3.9: the default 240 px column shows the collapsed chips (the full forms: M10 below)
    await expect(grid.taskMilestoneLink(rowKey)).toHaveText('◆')
    await expect(grid.taskMilestoneLink(rowKey)).toHaveAttribute('title', M.grid.taskLinkLabel(CUTOVER))
    await expect(grid.taskLate(rowKey)).toHaveAccessibleName(M.late)
    await expect(grid.rowHeaderByKey(rowKey)).toHaveAttribute('data-late-for-milestone', 'true')
    await expect(grid.diamond(CUTOVER)).toHaveAttribute('data-late', 'true')
    await expect(grid.diamond(CUTOVER)).toContainText(M.lateTasks(1))

    // overview → second milestone, then rebind in the panel: WEEK 2/11 is its own week → not late (BR-71)
    await project.openTab('overview')
    await section.add(DMC, '2026-11-06')
    await expect(section.row(DMC)).toContainText(M.status.UPCOMING)
    await list.openTab()
    await list.setTaskMilestone(CRM_CINDY, DMC)
    await expect(list.milestoneTag(CRM_CINDY)).toHaveText(M.tasks.cardLabel(DMC))
    await expect(list.lateBadge(CRM_CINDY)).toHaveCount(0)
    await expect(list.panelLateAlert(M.tasks.lateAlert(DMC, formatThaiDate('2026-11-06')))).toHaveCount(0)

    await grid.openTab(CRM)
    await ensureZoom(grid, 'week')
    await grid.revealMilestoneCell(W('2026-10-19'))
    await expect(grid.taskMilestoneLink(rowKey)).toHaveAttribute('title', M.grid.taskLinkLabel(DMC))
    await expect(grid.taskLate(rowKey)).toHaveCount(0)
    await expect(grid.rowHeaderByKey(rowKey)).not.toHaveAttribute('data-late-for-milestone', 'true')
    await expect(grid.diamond(CUTOVER)).toHaveAttribute('data-late', 'false')
    await grid.revealMilestoneCell(W('2026-11-02'))
    await expect(grid.diamondIn(W('2026-11-02'), DMC)).toHaveAttribute('data-late', 'false')
  })

  test('M3 (FR-707) week drag keeps the weekday; เลิกทำ and Cmd+Z undo; day drag ±1; keyboard date; reload keeps it', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', CRM)
    await ensureZoom(grid, 'week')
    await grid.revealMilestoneCell(W('2026-10-19'))
    await expect(grid.diamondIn(W('2026-10-19'), CUTOVER)).toBeVisible()

    // week drag: Friday 23 → Friday 30 (same weekday, M8-D10)
    await grid.dragDiamond(CUTOVER, W('2026-10-26'))
    const moved30 = M.toast.moved(CUTOVER, formatThaiDate('2026-10-30'))
    await expect(toastWith(page, moved30)).toBeVisible()
    await expect(grid.diamondIn(W('2026-10-26'), CUTOVER)).toBeVisible()
    const pop = await grid.openDiamond(CUTOVER)
    await expect(pop).toContainText(formatThaiDate('2026-10-30', 'medium'))
    await grid.closePopover()

    // toast เลิกทำ
    let undone = waitForServerAction(page)
    await undoButtonOf(page, moved30).click()
    await undone
    await expect(grid.diamondIn(W('2026-10-19'), CUTOVER)).toBeVisible()
    await expect(grid.diamondIn(W('2026-10-26'), CUTOVER)).toHaveCount(0)

    // Cmd/Ctrl+Z after a second drag
    await grid.dragDiamond(CUTOVER, W('2026-10-26'))
    await expect(grid.diamondIn(W('2026-10-26'), CUTOVER)).toBeVisible()
    undone = waitForServerAction(page)
    await page.keyboard.press('ControlOrMeta+z')
    await undone
    await expect(grid.diamondIn(W('2026-10-19'), CUTOVER)).toBeVisible()
    await expect(grid.diamondIn(W('2026-10-26'), CUTOVER)).toHaveCount(0)

    // day zoom: one day column = ±1 day
    await ensureZoom(grid, 'day')
    await grid.revealMilestoneCell(D('2026-10-23'))
    await expect(grid.diamondIn(D('2026-10-23'), CUTOVER)).toBeVisible()
    await grid.dragDiamond(CUTOVER, D('2026-10-22'))
    await expect(toastWith(page, M.toast.moved(CUTOVER, formatThaiDate('2026-10-22')))).toBeVisible()
    await expect(grid.diamondIn(D('2026-10-22'), CUTOVER)).toBeVisible()

    // keyboard: focus ◆ → Enter → the popover's date field → Enter (§8.9 keyboard parity)
    const edit = await grid.openDiamond(CUTOVER)
    await fillDate(edit, M.fields.date, '2026-10-21')
    const saved = waitForServerAction(page)
    await grid.milestoneNameInput(edit).press('Enter')
    await saved
    await expect(grid.milestonePopover()).toHaveCount(0)
    await expect(toastWith(page, M.toast.moved(CUTOVER, formatThaiDate('2026-10-21')))).toBeVisible()
    await expect(grid.diamondIn(D('2026-10-21'), CUTOVER)).toBeVisible()

    await grid.reload()
    await ensureZoom(grid, 'day')
    await grid.revealMilestoneCell(D('2026-10-21'))
    await expect(grid.diamondIn(D('2026-10-21'), CUTOVER)).toBeVisible()
    await expect(grid.diamond(CUTOVER)).toHaveAccessibleName(
      new RegExp(escapeRe(formatThaiDate('2026-10-21', 'medium'))),
    )
  })
})

// ── M4 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('M4 ⟲ A.2 (FR-409/702/703/708, §7.5) overview: add, edit, complete, delete + เลิกทำ, progress · cindy on POS', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true })
  })

  test('A.2 list, status/progress/late; add + edit Pilot; Go-live done → last; delete UAT sign-off unbinds, undo re-binds', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    const section = new MilestonesSection(page)
    const list = new TaskListPage(page)
    await project.goto(await projectIdByName(POS), 'overview')

    await section.expectNames([SIGN_OFF, GO_LIVE])
    const signOff = section.row(SIGN_OFF)
    await expect(signOff).toContainText(M.status.DUE_SOON)
    await expect(signOff).toContainText(M.progress(0, 1))
    await expect(signOff).toContainText(M.lateTasks(1))

    await section.add(PILOT, '2026-11-20')
    await section.expectNames([SIGN_OFF, PILOT, GO_LIVE])
    await section.edit(PILOT, { date: '2027-01-08' }) // after Go-live, so completing Go-live visibly moves it last
    await expect(section.row(PILOT)).toContainText(formatThaiDate('2027-01-08', 'medium'))
    await section.expectNames([SIGN_OFF, GO_LIVE, PILOT])

    await section.complete(GO_LIVE)
    await expect(section.row(GO_LIVE)).toContainText(M.status.DONE)
    await expect.poll(() => section.isStruck(GO_LIVE)).toBe(true)
    await section.expectNames([SIGN_OFF, PILOT, GO_LIVE])

    // delete: no confirm dialog, toast with the unbound count (FR-708)
    await section.remove(SIGN_OFF)
    const deleted = M.toast.deletedUnlinked(SIGN_OFF, 1)
    await expect(toastWith(page, deleted)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(section.row(SIGN_OFF)).toHaveCount(0)

    await list.openTab()
    await expect(list.row(UAT)).toBeVisible()
    await expect(list.milestoneTag(UAT)).toHaveCount(0)
    const restored = waitForServerAction(page)
    await undoButtonOf(page, deleted).click()
    await restored
    await expect(list.milestoneTag(UAT)).toHaveText(M.tasks.cardLabel(SIGN_OFF)) // re-bound exactly

    // completing the bound task: progress 1/1, no late badge (BR-71 needs a not-completed task)
    const done = waitForServerAction(page)
    await list.checkbox(UAT).click()
    await done
    await project.openTab('overview')
    await expect(section.row(SIGN_OFF)).toContainText(M.progress(1, 1))
    await expect(section.row(SIGN_OFF)).not.toContainText(M.lateTasks(1))
    await expect(section.row(SIGN_OFF).locator('[data-late="true"]')).toHaveCount(0)
  })
})

// ── M5 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('M5 ⟲ A.2 (PERM-15 Me = read only; PERM-11 binding allowed) · ivy, member of POS', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true })
  })

  test('no create on empty cells, read-only popover, drag does nothing, read-only overview; the panel field is enabled', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'ivy', POS)
    await ensureZoom(grid, 'week')
    await expect(grid.milestoneRow()).not.toHaveAttribute('data-manage', 'true')
    await expect(grid.toolbarAddMilestone()).toHaveCount(0)

    const clicked = await grid.countServerActions(() => grid.clickEmptyMilestoneCell(W('2026-10-19')))
    expect(clicked, 'server actions after a click on an empty ◆ cell').toBe(0)
    await expect(grid.milestoneCreatePopover()).toHaveCount(0)

    const pop = await grid.openDiamond(SIGN_OFF)
    await expect(pop.getByTestId('ms-read-only')).toHaveText(M.grid.readOnly)
    await expect(pop.getByRole('textbox')).toHaveCount(0)
    await expect(pop.getByTestId('ms-delete')).toHaveCount(0)
    await expect(pop.getByTestId('ms-toggle-complete')).toHaveCount(0)
    await grid.closePopover()

    await grid.revealMilestoneCell(W('2026-09-28'))
    const sent = await grid.countServerActions(() =>
      grid.dragDiamond(SIGN_OFF, W('2026-10-05'), { expectMove: false }),
    )
    expect(sent, 'server actions during a member drag').toBe(0)
    await expect(grid.diamondIn(W('2026-09-28'), SIGN_OFF)).toBeVisible()
    await expect(grid.diamondIn(W('2026-10-05'), SIGN_OFF)).toHaveCount(0)

    const project = new ProjectPage(page)
    const section = new MilestonesSection(page)
    await project.openTab('overview')
    await expect(section.row(SIGN_OFF)).toBeVisible()
    await expect(section.readOnlyNote()).toBeVisible()
    await expect(section.addButton()).toHaveCount(0)
    await expect(section.list().getByRole('checkbox')).toHaveCount(0)
    await expect(section.list().getByRole('button')).toHaveCount(0)

    const list = new TaskListPage(page)
    await list.openTab()
    await list.openPanel(UAT)
    await expect(list.panelMilestone()).toBeEnabled()
  })
})

// ── M6–M7 ────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('M6–M7 ⟲ A.2 + Data cutover (FR-613/614/661/663) grouping, bulk link + undo, board and /tasks filters · cindy', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true, extras: addCutover })
  })

  test('M6 group by milestone in date order + ไม่ผูก last; bulk link 2 tasks → one toast; เลิกทำ restores each group', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const list = new TaskListPage(page)
    await list.goto(await projectIdByName(CRM))
    await list.setGroupBy('milestone')
    await expect(list.groupHeaders()).toHaveText([
      headerWithDate(CUTOVER, '2026-10-23'),
      headerWithDate(DMC, '2026-11-06'),
      th.tasks.groups.noMilestone,
    ])
    await expect(list.milestoneGroup(CUTOVER).getByRole('row', { name: CRM_CINDY, exact: true })).toBeVisible()
    await expect(list.noMilestoneGroup().getByRole('row', { name: AUTOMATION, exact: true })).toBeVisible()

    await list.bulkLink([CRM_CINDY, AUTOMATION], DMC)
    const linked = M.toast.linked(2, DMC)
    await expect(toastWith(page, linked)).toBeVisible()
    for (const name of [CRM_CINDY, AUTOMATION])
      await expect(list.milestoneGroup(DMC).getByRole('row', { name, exact: true })).toBeVisible()
    await expect(list.milestoneGroup(CUTOVER).getByRole('row', { name: CRM_CINDY, exact: true })).toHaveCount(0)

    const undone = waitForServerAction(page)
    await undoButtonOf(page, linked).click()
    await undone
    await expect(list.milestoneGroup(CUTOVER).getByRole('row', { name: CRM_CINDY, exact: true })).toBeVisible()
    await expect(list.noMilestoneGroup().getByRole('row', { name: AUTOMATION, exact: true })).toBeVisible()
    // task rows only: the group's own header row (columnheader + "0 งาน") stays, empty groups are kept (M8-D13)
    await expect(
      list.milestoneGroup(DMC).getByRole('row').filter({ hasNot: page.getByRole('columnheader') }),
    ).toHaveCount(0)

    await list.setGroupBy('none')
  })

  test('M7 board cards show ◆ and filter by milestone; /tasks filter is disabled until a project, then sends milestoneId', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const list = new TaskListPage(page)
    await list.goto(await projectIdByName(CRM))
    await list.setTaskMilestone(AUTOMATION, DMC) // after M6's undo nothing is bound to Data migration complete
    await expect(list.milestoneTag(AUTOMATION)).toHaveText(M.tasks.cardLabel(DMC))

    await list.setView('board')
    await expect(list.cardMilestoneTag(AUTOMATION)).toHaveText(M.tasks.cardLabel(DMC))
    await expect(list.cardMilestoneTag(CRM_CINDY)).toHaveText(M.tasks.cardLabel(CUTOVER))
    await expect(list.board().getByRole('article')).toHaveCount(2)
    await list.boardMilestoneFilter(M.tasks.cardLabel(DMC))
    await expect(list.board().getByRole('article')).toHaveCount(1)
    await expect(list.card(AUTOMATION)).toBeVisible()
    await list.boardMilestoneFilter(M.none)
    await expect(list.board().getByRole('article')).toHaveCount(0) // both CRM tasks are bound

    const team = new TeamTasksPage(page)
    await team.goto()
    await expect(team.milestoneFilter()).toBeDisabled()
    await team.filterProject(CRM)
    await expect(team.milestoneFilter()).toBeEnabled()
    const dmcId = await milestoneIdByName(DMC)
    const request = page.waitForRequest((r) => {
      const u = new URL(r.url())
      return u.pathname === '/api/tasks' && u.searchParams.has('milestoneId')
    })
    await team.filterMilestone(M.tasks.cardLabel(DMC))
    expect(new URL((await request).url()).searchParams.get('milestoneId')).toBe(dmcId)
    await expect.poll(() => new URL(page.url()).searchParams.get('milestoneId')).toBe(dmcId)

    await team.setView('list')
    await expect.poll(() => team.linkNames()).toEqual([AUTOMATION])
    await expect(team.milestoneTag(AUTOMATION)).toHaveText(M.tasks.cardLabel(DMC))
  })
})

// ── M8 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('M8 ⟲ A.2 (FR-907, §3.3) ◆ on /calendar and masking · cindy, peter', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true })
  })

  test('cindy: ◆ UAT sign-off (ใกล้ถึง, ⚠) and ◆ Data migration complete; hidden projects absent from the payload; click → overview', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const cal = new CalendarPage(page)
    const response = cal.calendarResponse('2026-09-28')
    await cal.goto('2026-10')
    const body = await (await response).text()
    for (const secret of HIDDEN_FROM_CINDY) expect(body.includes(secret), `${secret} in the payload`).toBe(false)

    const uat = cal.milestoneChip('2026-10-02', SIGN_OFF, POS)
    await expect(uat).toBeVisible()
    await expect(uat).toHaveAttribute('data-status', 'DUE_SOON')
    await expect(uat).toHaveAttribute('data-late', 'true')
    await expect(uat).toContainText(M.status.DUE_SOON) // hidden text next to the glyph
    await expect(uat).toContainText(M.late)
    await expect(cal.milestoneChip('2026-11-06', DMC, CRM)).toBeVisible() // outside-month cell of the 6-week grid
    for (const secret of HIDDEN_FROM_CINDY) await expect(cal.grid()).not.toContainText(secret)

    const posId = await projectIdByName(POS)
    await uat.click()
    await page.waitForURL((u) => u.pathname === `/projects/${posId}/overview`)
  })

  test('peter: ◆ Pipeline พร้อมใช้งาน on 23 ต.ค.; POS / CRM milestones absent from the payload', async ({ page }) => {
    await loginAs(page, 'peter')
    const cal = new CalendarPage(page)
    const response = cal.calendarResponse('2026-09-28')
    await cal.goto('2026-10')
    const body = await (await response).text()
    for (const secret of [SIGN_OFF, DMC, POS, CRM]) expect(body.includes(secret), `${secret} in the payload`).toBe(false)
    await expect(cal.milestoneChip('2026-10-23', PIPELINE, DW)).toBeVisible()
    await expect(cal.grid()).not.toContainText(SIGN_OFF)
  })
})

// ── M9 ───────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('M9 ⟲ A.2 (FR-702 Cmd+K, X08) "สร้าง milestone" from the palette · cindy, then ivy', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true })
  })

  test('cindy on the POS plan: คำสั่ง › สร้าง milestone → POS pre-selected → ◆ Soft launch in W 7 ธ.ค. without reload', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'cindy', POS)
    await ensureZoom(grid, 'week')
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: number }).__noReload = 1
    })
    const palette = new Palette(page)
    await palette.openByKeyboard()
    await expect(palette.dialog()).toBeVisible()
    await palette.search('milestone')
    const command = palette.commands().filter({ hasText: M.palette.create })
    await expect(command).toHaveCount(1)
    await expect(command).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: M.form.createTitle, exact: true })
    await expect(dialog).toBeVisible()
    await expect(palette.dialog()).toHaveCount(0)
    await expect(dialog.getByRole('combobox', { name: M.fields.project })).toHaveText(POS)
    await dialog.getByRole('textbox', { name: M.fields.name }).fill(SOFT_LAUNCH)
    await fillDate(dialog, M.fields.date, '2026-12-07')
    const created = waitForServerAction(page)
    await dialog.getByRole('button', { name: M.form.create, exact: true }).click()
    await created
    await expect(dialog).toHaveCount(0)
    await expect(toastWith(page, M.toast.created(SOFT_LAUNCH))).toBeVisible()

    await grid.revealMilestoneCell(W('2026-12-07'))
    await expect(grid.diamondIn(W('2026-12-07'), SOFT_LAUNCH)).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1)
  })

  test('ivy (member, LEAD of nothing): the palette offers no "สร้าง milestone"', async ({ page }) => {
    await loginAs(page, 'ivy')
    const targets = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/milestones/targets')
    const grid = new GridPage(page)
    await grid.open(POS, await projectIdByName(POS))
    const palette = new Palette(page)
    await palette.openByKeyboard()
    await expect(palette.dialog()).toBeVisible()
    await palette.search('milestone')
    const res = await targets
    expect(res.ok()).toBe(true)
    expect(((await res.json()) as { projects: unknown[] }).projects).toEqual([])
    await expect(palette.option(new RegExp(`^${escapeRe(M.palette.create)}$`))).toHaveCount(0)
  })
})

// ── M10 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test.describe('M10 ⟲ A.2 (§7.4, BR-70/71/72) the POS grid as the manager', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, { milestones: true })
  })

  test('◆ UAT sign-off in W 28 ก.ย. DUE_SOON + late; the UAT row shows →◆ and ⚠; footer load unchanged (5.0)', async ({
    page,
  }) => {
    const grid = await openGrid(page, 'manager', POS)
    await ensureZoom(grid, 'week')
    await grid.revealMilestoneCell(W('2026-09-28'))
    const diamond = grid.diamondIn(W('2026-09-28'), SIGN_OFF)
    await expect(diamond).toBeVisible()
    await expect(diamond).toHaveAttribute('data-status', 'DUE_SOON')
    await expect(diamond).toHaveAttribute('data-late', 'true')
    await expect(diamond).toContainText(M.lateTasks(1))

    const rowKey = await grid.rowKeyOf(UAT, 'Ivy')
    // v3.9: collapsed in the default 240 px column, "→◆UAT sign-off" and "⚠ เลย milestone" once it is wide enough
    await expect(grid.taskMilestoneLink(rowKey)).toHaveText('◆')
    await expect(grid.taskMilestoneLink(rowKey)).toHaveAttribute('title', M.grid.taskLinkLabel(SIGN_OFF))
    await expect(grid.taskLate(rowKey)).toHaveAccessibleName(M.late)
    await grid.resizeTaskColumn(200)
    await expect(grid.taskMilestoneLink(rowKey)).toHaveText(M.grid.taskLink(SIGN_OFF))
    await expect(grid.taskLate(rowKey)).toContainText(M.late)

    await expect(grid.footerLoad(W('2026-09-28'))).toHaveText(d1(500)) // BR-72: milestones carry no load
    await expect(grid.toolbarAddMilestone()).toBeVisible()
    // milestone line in the line layer (BR-102; M11.1 FR-709: default PURPLE = dash-dot), not interactive
    await expect(grid.root().locator('[data-marker-line][data-color="PURPLE"]').first()).toBeAttached()
  })
})
