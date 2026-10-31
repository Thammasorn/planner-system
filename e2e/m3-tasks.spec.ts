/**
 * M3 — tasks (plan/m03-tasks.md §7.3 E1–E20, SPEC §12 M3: AC-601–603, AC-611–616, AC-203 M3 clause).
 * Determinism (PLAN §4.5, X46): every describe marked ⟲ in §7.3 resets planner_e2e in its own beforeAll (golden seed
 * incl. the M3 statuses, tasks and assignments: POS = ปรับปรุงระบบ POS หน้าร้าน (Cindy), ทำ UAT + คู่มือหน้าร้าน (Ivy),
 * Rollout สาขา (Mint, TENTATIVE); CRM = ย้ายข้อมูลลูกค้า (Cindy), ตั้งค่า automation (Ivy); DW = ย้าย pipeline ขึ้น
 * BigQuery (Peter); Store = ทำ dashboard ผู้บริหาร (Peter), เก็บ requirement + สรุป (Jack); all "ยังไม่เริ่ม").
 * Tests inside a describe run serially and may build on each other; the browser clock is pinned by the auto fixture
 * (E3b installs a controllable clock instead), the server's "today" is APP_NOW = 2026-09-30; UI strings come from th;
 * selectors live in page objects; waits are on server-action responses or UI state — never on time.
 *
 * Later milestones change some lines on purpose (§7.3): E9's completion toasts gain BR-52 numbers (M6); E13's count
 * and /my layout change in M9; E1/E15 tab lists gain แผนงาน (M6) and เอกสาร (M4, done in plan/m04 S4.10).
 */
import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { th } from '../src/i18n/th'
import { E2E } from './env'
import {
  expect,
  idOf,
  loginAs,
  openGuardedPage,
  resetDb,
  test,
  waitForServerAction,
  type GoldenLogin,
} from './fixtures'
import { ProjectFormDialog, ProjectPage } from './pages/project'
import { EmployeesPage } from './pages/settings'
import { SidebarPage } from './pages/sidebar'
import { TaskListPage } from './pages/tasks'
import { TeamTasksPage } from './pages/team-tasks'
import { escapeRegExp } from './pages/text'
import { allToasts, toastWith, undoButtonOf } from './pages/toast'

const POS = 'POS Upgrade'
const CRM = 'CRM Migration'
const R1 = 'ปรับปรุงระบบ POS หน้าร้าน'
const R2 = 'ทำ UAT + คู่มือหน้าร้าน'
const ROLLOUT = 'Rollout สาขา'
const POS_TASKS = [R1, R2, ROLLOUT] as const
const S = th.tasks.status.defaults
const C = th.tasks.status.categories
const DEFAULT_STATUSES = [S.todo, S.doing, S.waitData, S.blocked, S.done] as const
/** Server "today" (APP_NOW 2026-09-30) in the SPEC §8 Thai date format. */
const TODAY_TH = '30 ก.ย. 2569'

/** Logs in and opens POS › งาน. */
async function openPos(page: Page, who: GoldenLogin = 'cindy'): Promise<TaskListPage> {
  await loginAs(page, who)
  const tasks = new TaskListPage(page)
  await tasks.goto(await idOf('project', POS))
  return tasks
}

/** Global Cmd/Ctrl(+Shift)+Z from a non-editable target; waits for the server action it runs. */
async function undoByKey(page: Page, redo = false): Promise<void> {
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
  })
  const answered = waitForServerAction(page)
  await page.keyboard.press(redo ? 'ControlOrMeta+Shift+z' : 'ControlOrMeta+z')
  await answered
}

/** Clicks "เลิกทำ" in the toast reading `text` and waits for the server action. */
async function undoByToast(page: Page, text: string): Promise<void> {
  const answered = waitForServerAction(page)
  await undoButtonOf(page, text).click()
  await answered
}

// ---------------------------------------------------------------------------------------------------------------

test.describe('E1–E3 ⟲ (AC-601, AC-602, AC-603) keyboard outliner on POS as Cindy', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  const ABC = ['งาน A', 'งาน B', 'งาน C'] as const

  test('E1 (AC-601, FR-602, FR-408, N) three tasks typed with Enter, no mouse, survive a reload', async ({
    page,
  }) => {
    await loginAs(page, 'cindy')
    const tasks = new TaskListPage(page)
    const project = new ProjectPage(page)
    await tasks.shell.goto('/home')
    await tasks.gotoProject(POS)
    // FR-408 / X15: the งาน tab exists, เอกสาร follows it (M4); M6 inserts แผนงาน; retrying, in order
    await expect(project.tabs()).toContainText([
      th.projects.tabs.overview,
      th.projects.tabs.tasks,
      th.projects.tabs.pages,
    ])
    await expect(project.tab('tasks')).toHaveAttribute('aria-selected', 'true')
    await tasks.expectRowNames(POS_TASKS)

    await page.keyboard.press('n') // M3-D9: N focuses quick add on the tasks tab
    await expect(tasks.quickAdd()).toBeFocused()
    await tasks.typeTasks(ABC)
    await expect(tasks.quickAdd()).toBeFocused() // the cursor stays for the next one
    await tasks.expectRowNames([...POS_TASKS, ...ABC])
    for (const n of ABC) await tasks.expectLevel(n, 1)

    await tasks.reload()
    await tasks.expectRowNames([...POS_TASKS, ...ABC]) // exactly once each
  })

  test('E2 (AC-602, FR-603) Tab indents under the row above, beyond level 3 nothing happens, Shift+Tab outdents', async ({
    page,
  }) => {
    const tasks = await openPos(page)
    const [A, B, C3] = ABC

    await tasks.pressAndWait(B, 'Tab')
    await tasks.expectLevel(B, 2)
    await tasks.expectRowNames([...POS_TASKS, A, B, C3]) // B directly under A

    await tasks.pressAndWait(C3, 'Tab')
    await tasks.expectLevel(C3, 2)
    await tasks.pressAndWait(C3, 'Tab')
    await tasks.expectLevel(C3, 3)
    await tasks.press(C3, 'Tab') // over the limit: a silent no-op, no request (X62)
    await tasks.expectLevel(C3, 3)
    await tasks.pressAndWait(C3, 'Shift+Tab') // answered after anything the no-op could have sent
    await expect(allToasts(page)).toHaveCount(0) // no toast for the over-limit Tab
    await tasks.expectLevel(C3, 2)

    await tasks.reload()
    await tasks.expectLevel(A, 1)
    await tasks.expectLevel(B, 2)
    await tasks.expectLevel(C3, 2)
  })

  test('E3 (AC-603 M3 part, FR-609) delete a parent with 3 children, undo by toast, Cmd+Z, Cmd+Shift+Z', async ({
    page,
  }) => {
    const tasks = await openPos(page)
    const PARENT = 'งานแม่ทดสอบ'
    const KIDS = ['ลูก 1', 'ลูก 2', 'ลูก 3'] as const
    await tasks.addTree(PARENT, KIDS)
    await tasks.openAssigneePicker('ลูก 2')
    await tasks.pickAssignee('Ivy')
    await tasks.closePicker()
    await expect(tasks.assignee('ลูก 2', 'Ivy')).toBeVisible()

    const expectTreeBack = async () => {
      await tasks.expectLevel(PARENT, 1)
      for (const k of KIDS) await tasks.expectLevel(k, 2)
      await expect(tasks.assignee('ลูก 2', 'Ivy')).toBeVisible() // restored with its assignment (X13)
    }
    const expectTreeGone = async () => {
      for (const n of [PARENT, ...KIDS]) await expect(tasks.row(n)).toHaveCount(0)
    }

    await tasks.pressAndWait(PARENT, 'Delete')
    const deleted = th.tasks.toast.deletedWithChildren(PARENT, 3)
    await expect(toastWith(page, deleted)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0) // P2: no confirm
    await expectTreeGone()
    await undoByToast(page, deleted)
    await expectTreeBack()

    await tasks.pressAndWait(PARENT, 'Delete')
    await expectTreeGone()
    await undoByKey(page)
    await expectTreeBack()
    await undoByKey(page, true)
    await expectTreeGone()
    await undoByKey(page)
    await expectTreeBack()

    await tasks.reload()
    await expectTreeBack()
  })
})

test.describe('E3b ⟲ (UNDO-4) the undo toast lasts 8 s', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('visible after 7 s, gone after 8.5 s; the task stays deleted', async ({ page }) => {
    await page.clock.install({ time: new Date(E2E.appNow) }) // R14: only this test drives timers
    const tasks = await openPos(page)
    const NAME = 'งานลบ E3b'
    await tasks.addTasks([NAME])
    await tasks.pressAndWait(NAME, 'Delete')
    const deleted = th.tasks.toast.deleted(NAME)
    await expect(toastWith(page, deleted)).toBeVisible()
    await page.clock.runFor(7000)
    await expect(toastWith(page, deleted)).toBeVisible()
    await page.clock.runFor(1500)
    await expect(toastWith(page, deleted)).toBeHidden()
    await expect(tasks.row(NAME)).toHaveCount(0)
    await tasks.reload()
    await expect(tasks.row(NAME)).toHaveCount(0)
  })
})

test.describe('E4 ⟲ (FR-605, FR-606, BR-60, PERM-13/14) assignee picker', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cindy (LEAD) assigns Ivy and Peter — Peter is hinted and becomes a member; × undoes', async ({
    page,
  }) => {
    const peter = await idOf('user', 'Peter')
    const tasks = await openPos(page)
    await tasks.addTasks(['งาน D', 'งาน E'])
    await expect(tasks.unassignedLabel('งาน D')).toBeVisible() // FR-606: text, never hidden

    await tasks.openAssigneePicker('งาน D')
    const hint = th.tasks.picker.willBecomeMember
    await expect(tasks.pickerOption('Peter').getByText(hint, { exact: true })).toBeVisible()
    await expect(tasks.pickerOption('Ivy').getByText(hint, { exact: true })).toHaveCount(0)
    await tasks.pickAssignee('Ivy')
    await expect(tasks.pickerInput()).toBeVisible() // the picker stays open for the next person
    await tasks.pickAssignee('Peter')
    await tasks.closePicker()
    await expect(toastWith(page, th.tasks.toast.assignedAddedMember('Peter'))).toBeVisible()
    await expect(tasks.assignee('งาน D', 'Ivy')).toBeVisible()
    await expect(tasks.assignee('งาน D', 'Peter')).toBeVisible()
    await expect(tasks.unassignedLabel('งาน D')).toHaveCount(0)

    const unassigned = th.tasks.toast.unassigned('Peter')
    const answered = waitForServerAction(page)
    await tasks.removeChipButton('งาน D', 'Peter').click()
    await answered
    await expect(toastWith(page, unassigned)).toBeVisible()
    await expect(tasks.assignee('งาน D', 'Peter')).toHaveCount(0)
    await undoByToast(page, unassigned)
    await expect(tasks.assignee('งาน D', 'Peter')).toBeVisible()

    const project = new ProjectPage(page)
    await project.openTab('overview')
    await expect(project.memberRow(peter)).toBeVisible() // BR-60: added in the same transaction
  })

  test('Ivy (MEMBER) is offered exactly the POS members, without the hint', async ({ page }) => {
    const tasks = await openPos(page, 'ivy')
    await tasks.openAssigneePicker('งาน E')
    await expect(tasks.pickerOptions()).toHaveCount(4)
    for (const n of ['Cindy', 'Ivy', 'Mint', 'Peter']) await expect(tasks.pickerOption(n)).toHaveCount(1)
    await expect(tasks.pickerOption('Jack')).toHaveCount(0)
    await expect(page.getByRole('listbox').getByText(th.tasks.picker.willBecomeMember)).toHaveCount(0)
  })
})

test.describe('E4b ⟲ (AC-203 M3 part, X12) deactivated people', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('the manager deactivates Cindy: she is not offered, her chip stays with "(ปิดใช้งาน)"', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const emp = new EmployeesPage(page)
    await emp.goto()
    const deactivated = waitForServerAction(page)
    await emp.rowAction('Cindy', th.employees.actions.deactivate)
    await deactivated
    await expect(emp.statusChip('Cindy', 'deactivated')).toBeVisible()

    const tasks = new TaskListPage(page)
    await tasks.goto(await idOf('project', POS))
    await expect(tasks.assignee(R1, `Cindy ${th.users.deactivatedSuffix}`)).toBeVisible()
    await tasks.openAssigneePicker(R2)
    await expect(tasks.pickerOption('Mint')).toHaveCount(1) // the list has loaded
    await expect(tasks.pickerOption('Cindy')).toHaveCount(0)
    await tasks.pickerInput().fill('Cindy')
    await expect(page.getByText(th.tasks.picker.noOptions, { exact: true })).toBeVisible()
  })
})

test.describe('E5 ⟲ (FR-610, BR-31, AC-602 on golden rows) assignees move to the new child', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Tab under an assigned leaf moves its assignee, undo restores; a panel subtask takes over Mint', async ({
    page,
  }) => {
    const tasks = await openPos(page)
    await tasks.pressAndWait(R2, 'Tab')
    await tasks.expectLevel(R2, 2)
    const moved = th.tasks.toast.movedAssignees(1, R2)
    await expect(toastWith(page, moved)).toBeVisible()
    await expect(tasks.removeChipButton(R2, 'Cindy')).toBeVisible()
    await expect(tasks.removeChipButton(R2, 'Ivy')).toBeVisible()
    await expect(tasks.unionAssignees(R1)).toContainText('Cindy') // parent: read-only union (BR-31)
    await expect(tasks.unionAssignees(R1)).toContainText('Ivy')
    await expect(tasks.removeChipButton(R1, 'Cindy')).toHaveCount(0)

    await undoByToast(page, moved)
    await tasks.expectLevel(R2, 1)
    await expect(tasks.removeChipButton(R1, 'Cindy')).toBeVisible()
    await expect(tasks.assignee(R1, 'Ivy')).toHaveCount(0)
    await expect(tasks.removeChipButton(R2, 'Ivy')).toBeVisible()
    await expect(tasks.assignee(R2, 'Cindy')).toHaveCount(0)

    const SUB = 'ติดตั้งระบบที่สาขา'
    await tasks.openPanel(ROLLOUT)
    await tasks.addSubtaskInPanel(SUB)
    await expect(toastWith(page, th.tasks.toast.movedAssignees(1, SUB))).toBeVisible()
    await tasks.expectLevel(SUB, 2)
    await expect(tasks.removeChipButton(SUB, 'Mint')).toBeVisible()
    await expect(tasks.unionAssignees(ROLLOUT)).toContainText('Mint')
    await expect(tasks.removeChipButton(ROLLOUT, 'Mint')).toHaveCount(0)
  })
})

test.describe('E6 ⟲ (FR-607, FR-608, prefs, FR-409 progress) completion', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('ticking a parent asks about its children; "ติ๊กทั้งหมด"; hide completed survives a reload; progress', async ({
    page,
  }) => {
    const tasks = await openPos(page)
    const PARENT = 'แม่ E6'
    const KIDS = ['ลูก E6-1', 'ลูก E6-2'] as const
    await tasks.addTree(PARENT, KIDS)

    let answered = waitForServerAction(page)
    await tasks.checkbox(PARENT).click()
    await answered
    const ask = toastWith(page, th.tasks.toast.askChildren)
    await expect(ask).toBeVisible()
    answered = waitForServerAction(page)
    await ask.getByRole('button', { name: th.tasks.toast.completeAll, exact: true }).click()
    await answered
    for (const n of [PARENT, ...KIDS]) await tasks.expectCompleted(n, true)

    await tasks.setShowCompleted(false)
    for (const n of [PARENT, ...KIDS]) await expect(tasks.row(n)).toHaveCount(0)
    await tasks.reload()
    await expect(tasks.row(R1)).toBeVisible()
    for (const n of [PARENT, ...KIDS]) await expect(tasks.row(n)).toHaveCount(0)
    await tasks.setShowCompleted(true)
    for (const n of [PARENT, ...KIDS]) await tasks.expectCompleted(n, true)

    const project = new ProjectPage(page)
    await project.openTab('overview')
    await expect(project.progress()).toHaveText(th.tasks.progress(3, 6))
  })
})

test.describe('E7 ⟲ (FR-611, BR-36, Esc, deep link) task panel', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Space opens it beside the list; certainty sources; Esc closes; ?task= reopens; unknown id shows nothing', async ({
    page,
  }) => {
    const pos = await idOf('project', POS)
    const tasks = await openPos(page)
    const rolloutId = await tasks.settledId(ROLLOUT)

    await tasks.press(ROLLOUT, 'Space')
    await expect(tasks.panelTitle(ROLLOUT)).toBeVisible()
    expect(new URL(page.url()).searchParams.get('task')).toBe(rolloutId)
    const panel = await tasks.panel().boundingBox()
    const list = await tasks.list().boundingBox()
    if (!panel || !list) throw new Error('panel or list has no box')
    expect(panel.width).toBeGreaterThanOrEqual(420)
    expect(panel.width).toBeLessThanOrEqual(460)
    expect(list.x + list.width).toBeLessThanOrEqual(panel.x) // beside the list, never over it
    await expect(tasks.certaintyButton('tentative')).toHaveAttribute('aria-pressed', 'true')
    await expect(tasks.panel().getByText(th.tasks.certainty.source.task, { exact: true })).toBeVisible()

    const SUB = 'ย่อย R'
    await tasks.addSubtaskInPanel(SUB)
    await tasks.panel().getByRole('button', { name: SUB, exact: true }).click()
    await expect(tasks.panelTitle(SUB)).toBeVisible()
    await expect(
      tasks.panel().getByText(th.tasks.certainty.source.ancestor(ROLLOUT), { exact: true }),
    ).toBeVisible()

    await tasks.openPanel(R1)
    await expect(tasks.panel().getByText(th.tasks.certainty.source.project, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tasks.panel()).toHaveCount(0)
    expect(new URL(page.url()).searchParams.has('task')).toBe(false)

    await tasks.goto(pos, `?task=${rolloutId}`)
    await expect(tasks.panelTitle(ROLLOUT)).toBeVisible()

    await tasks.goto(pos, `?task=${randomUUID()}`)
    await expect(tasks.panel()).toHaveText(th.tasks.panel.notFound) // M3-D17: no name, nothing else
  })
})

test.describe('E8 ⟲ (FR-613) grouping and sorting', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('by assignee, by certainty (no tree ops), then due-date sort', async ({ page }) => {
    const tasks = await openPos(page)
    await tasks.groupBy('assignee')
    await expect(tasks.groupHeaders()).toHaveText(['Cindy', 'Ivy', 'Mint'])
    await expect(tasks.group('Cindy').getByRole('row', { name: R1, exact: true })).toBeVisible()
    await expect(tasks.group('Ivy').getByRole('row', { name: R2, exact: true })).toBeVisible()
    await expect(tasks.group('Mint').getByRole('row', { name: ROLLOUT, exact: true })).toBeVisible()
    await expect(tasks.dragHandles()).toHaveCount(0)

    await tasks.groupBy('certainty')
    const confirmed = th.tasks.groups.confirmed
    const tentative = th.tasks.groups.tentative
    await expect(tasks.groupHeaders()).toHaveText([confirmed, tentative])
    await expect(tasks.group(tentative).getByRole('row', { name: ROLLOUT, exact: true })).toBeVisible()
    await expect(tasks.group(confirmed).getByRole('row', { name: R1, exact: true })).toBeVisible()
    await expect(tasks.group(confirmed).getByRole('row', { name: R2, exact: true })).toBeVisible()
    await expect(tasks.group(confirmed).getByRole('row', { name: ROLLOUT, exact: true })).toHaveCount(0)
    await expect(tasks.dragHandles()).toHaveCount(0)

    await tasks.press(R2, 'Tab')
    await expect(toastWith(page, th.tasks.treeOpsDisabled)).toBeVisible()
    await tasks.expectLevel(R2, 1)

    await tasks.groupBy('none')
    await tasks.openPanel(ROLLOUT)
    await tasks.setPanelDueDate('2026-10-05')
    await tasks.sortBy('due')
    await expect.poll(async () => (await tasks.rowNames())[0]).toBe(ROLLOUT)
  })
})

test.describe('E9 ⟲ (FR-614, Cmd+Enter) multi-select and bulk actions', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cmd+Enter toggles done; Cmd+click two rows → bulk complete, then bulk delete with undo', async ({
    page,
  }) => {
    const tasks = await openPos(page)
    await tasks.pressAndWait(ROLLOUT, 'ControlOrMeta+Enter')
    await tasks.expectCompleted(ROLLOUT, true)
    await expect(toastWith(page, th.tasks.toast.completed)).toBeVisible() // M6 adds BR-52 numbers to this toast
    await tasks.pressAndWait(ROLLOUT, 'ControlOrMeta+Enter')
    await tasks.expectCompleted(ROLLOUT, false)
    await expect(toastWith(page, th.tasks.toast.uncompleted)).toBeVisible()

    await tasks.select(R1, ['ControlOrMeta'])
    await tasks.select(R2, ['ControlOrMeta'])
    await expect(tasks.bulkBar(2)).toBeVisible()
    let answered = waitForServerAction(page)
    await tasks.bulkButton(2, th.tasks.bulk.complete).click()
    await answered
    await tasks.expectCompleted(R1, true)
    await tasks.expectCompleted(R2, true)
    await expect(toastWith(page, th.tasks.toast.completedMany(2))).toBeVisible() // M6 adds BR-52 numbers

    await tasks.bulkButton(2, th.tasks.bulk.clear).click()
    await expect(tasks.bulkBar(2)).toHaveCount(0)
    await tasks.select(R1, ['ControlOrMeta'])
    await tasks.select(R2, ['ControlOrMeta'])
    answered = waitForServerAction(page)
    await tasks.bulkButton(2, th.tasks.bulk.delete).click()
    await answered
    const deleted = th.tasks.toast.deletedMany(2)
    await expect(toastWith(page, deleted)).toBeVisible()
    await expect(tasks.row(R1)).toHaveCount(0)
    await expect(tasks.row(R2)).toHaveCount(0)
    await undoByToast(page, deleted)
    await expect(tasks.row(R1)).toBeVisible()
    await expect(tasks.row(R2)).toBeVisible()
  })
})

test.describe('E10 ⟲ (FR-604) drag to reorder and to nest', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('X3 onto X1 reorders; X2 dragged right nests under X1; both persist', async ({ page }) => {
    const tasks = await openPos(page)
    await tasks.addTasks(['X1', 'X2', 'X3'])

    await tasks.dragRow('X3', { overName: 'X1' })
    await tasks.expectRowNames([...POS_TASKS, 'X3', 'X1', 'X2'])
    await tasks.dragRow('X2', { dx: 24 }) // one TREE_INDENT to the right: the previous row X1 becomes the parent
    await tasks.expectLevel('X2', 2)
    await tasks.expectRowNames([...POS_TASKS, 'X3', 'X1', 'X2'])

    await tasks.reload()
    await tasks.expectRowNames([...POS_TASKS, 'X3', 'X1', 'X2'])
    await tasks.expectLevel('X1', 1)
    await tasks.expectLevel('X2', 2)
  })
})

test.describe('E11 ⟲ (FR-404, BR-61) removing a member who has assignments', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('two-option toast: cancel keeps Ivy; unassign-all removes her; Cmd+Z brings both back', async ({
    page,
  }) => {
    const pos = await idOf('project', POS)
    const ivy = await idOf('user', 'Ivy')
    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    await project.goto(pos)

    await project.removeMember('Ivy')
    await expect(project.assignmentsBlockToast(1)).toBeVisible()
    await project.cancelRemoval(1)
    await expect(project.memberRow(ivy)).toBeVisible()

    await project.removeMember('Ivy')
    await expect(project.assignmentsBlockToast(1)).toBeVisible()
    await project.unassignAllAndRemove(1)
    await expect(project.memberRow(ivy)).toHaveCount(0)
    await expect(toastWith(page, th.members.assignmentsBlock.removedWithAssignments('Ivy', 1))).toBeVisible()

    await project.openTab('tasks')
    const tasks = new TaskListPage(page)
    await tasks.waitReady()
    await expect(tasks.unassignedLabel(R2)).toBeVisible()
    await undoByKey(page) // one undo entry for the combined op (X16)
    await expect(tasks.assignee(R2, 'Ivy')).toBeVisible()
    await project.openTab('overview')
    await expect(project.memberRow(ivy)).toBeVisible()
  })
})

test.describe('E12 (X07) shortcut help', () => {
  test('? opens the data-driven list on the tasks tab; Esc closes it', async ({ page }) => {
    const tasks = await openPos(page)
    await page.keyboard.press('Shift+Slash')
    await expect(tasks.helpDialog()).toBeVisible()
    await expect(tasks.helpDialog().getByText(th.shortcuts.items.listIndent, { exact: true })).toBeVisible()
    await expect(tasks.helpDialog().getByText(th.shortcuts.items.newTask, { exact: true })).toBeVisible()
    // M4 (S0.11): the global Cmd/Ctrl+K entry is listed too (containment, not an exact list)
    await expect(tasks.helpDialog().getByText(th.shortcuts.items.palette, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tasks.helpDialog()).toHaveCount(0)
  })
})

test.describe('E13 ⟲ (FR-1009 basic, sidebar count, NFR-07b) งานของฉัน as Ivy', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('two tasks in two project groups; tick + undo moves the count; phone width; click opens the task', async ({
    page,
  }) => {
    const pos = await idOf('project', POS)
    await loginAs(page, 'ivy')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/my')
    const main = sidebar.shell.main()
    await expect(sidebar.myTaskCount()).toHaveText('2') // M9 changes this count (FR-1009 buckets, X95)
    await expect(main.getByRole('region')).toHaveCount(2)
    await expect(main.getByRole('region').first()).toHaveAccessibleName(CRM) // M3-D8: by project name (Thai collation)
    await expect(main.getByRole('region').last()).toHaveAccessibleName(POS)
    await expect(main.getByRole('region', { name: CRM }).getByRole('link')).toHaveText(['ตั้งค่า automation'])
    await expect(main.getByRole('region', { name: POS }).getByRole('link')).toHaveText([R2])

    const answered = waitForServerAction(page)
    await main.getByRole('checkbox', { name: th.tasks.completeCheckbox('ตั้งค่า automation') }).click()
    await answered
    await expect(sidebar.myTaskCount()).toHaveText('1')
    await undoByToast(page, th.tasks.toast.completed)
    await expect(sidebar.myTaskCount()).toHaveText('2')

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(main.getByRole('link', { name: R2, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await main.getByRole('link', { name: R2, exact: true }).click()
    await page.waitForURL((u) => u.pathname === `/projects/${pos}/tasks` && u.searchParams.has('task'))
    const tasks = new TaskListPage(page)
    await expect(tasks.panelTitle(R2)).toBeVisible()
  })
})

test.describe('E14 ⟲ (PERM-06 in the UI) a non-member gets a 404 on the tasks URL', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test("Peter opens Cindy's POS tasks URL: 404 and no POS task names", async ({ page, browser }) => {
    const tasks = await openPos(page)
    const url = page.url()
    await expect(tasks.row(R1)).toBeVisible()

    const peter = await openGuardedPage(browser, [/status of 404/])
    await loginAs(peter.page, 'peter')
    const res = await peter.page.goto(url)
    expect(res?.status()).toBe(404)
    await expect(peter.page.getByText(th.projects.notFound.title, { exact: true })).toBeVisible()
    const html = await peter.page.content()
    for (const secret of [POS, ...POS_TASKS]) expect(html, secret).not.toContain(secret)
    await peter.close()
  })
})

test.describe('E15 ⟲ (AC-611, FR-621, FR-625) a new project gets the 5 default statuses', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('the manager creates a project; its first task is "ยังไม่เริ่ม"; ภาพรวม lists the defaults in order', async ({
    page,
  }) => {
    const NAME = 'โปรเจคทดสอบสถานะ'
    await loginAs(page, 'manager')
    const sidebar = new SidebarPage(page)
    const form = new ProjectFormDialog(page)
    const project = new ProjectPage(page)
    await sidebar.shell.goto('/home')
    await sidebar.newProjectButton().click()
    await expect(form.dialog()).toBeVisible()
    await form.name().fill(NAME)
    await form.pickLead('Cindy')
    await form.submit()
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    await expect(project.header()).toContainText(NAME)

    // retrying: the create dialog keeps the app aria-hidden until its exit transition ends (M4 adds เอกสาร)
    await expect(project.tabs()).toContainText([th.projects.tabs.tasks, th.projects.tabs.pages])
    await project.openTab('tasks')
    const tasks = new TaskListPage(page)
    await tasks.waitReady()
    await tasks.addTasks(['งานแรก'])
    await expect(tasks.statusChip('งานแรก', S.todo)).toBeVisible()

    await project.openTab('overview')
    await project.statuses.expectNames(DEFAULT_STATUSES)
    await expect(project.statuses.categorySelects()).toHaveText([
      C.TODO,
      C.IN_PROGRESS,
      C.WAITING,
      C.WAITING,
      C.DONE,
    ])
  })
})

test.describe('E16 ⟲ (AC-612, FR-622, PERM-23 UI) LEAD manages the status set; MEMBER reads it', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cindy adds "รอลูกค้ายืนยัน", drags it around and back before "เสร็จ"; the board follows; Ivy is read-only', async ({
    page,
  }) => {
    const NEW = 'รอลูกค้ายืนยัน'
    const pos = await idOf('project', POS)
    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    const statuses = project.statuses
    await project.goto(pos)

    await statuses.add(NEW, 'WAITING') // M3-D30: inserted before the first DONE status
    await statuses.expectNames([S.todo, S.doing, S.waitData, S.blocked, NEW, S.done])
    await expect(
      statuses.row(NEW).getByRole('combobox', { name: th.tasks.status.settings.category }),
    ).toHaveText(C.WAITING)
    await statuses.dragBefore(NEW, S.waitData)
    await statuses.expectNames([S.todo, S.doing, NEW, S.waitData, S.blocked, S.done])
    await statuses.dragBefore(NEW, S.done)
    const finalOrder = [S.todo, S.doing, S.waitData, S.blocked, NEW, S.done]
    await statuses.expectNames(finalOrder)

    await project.openTab('tasks')
    const tasks = new TaskListPage(page)
    await tasks.waitReady()
    await tasks.setView('board')
    await tasks.expectColumns(finalOrder)
    await tasks.reload()
    await tasks.expectColumns(finalOrder)

    await page.context().clearCookies()
    await loginAs(page, 'ivy')
    await project.goto(pos)
    await expect(statuses.readOnlyNote()).toBeVisible()
    await expect(statuses.chips()).toHaveText(finalOrder.map((n) => new RegExp(`^${escapeRegExp(n)}`)))
    await expect(statuses.addButton()).toHaveCount(0)
    await expect(statuses.dragHandles()).toHaveCount(0)
    await expect(statuses.deleteButtons()).toHaveCount(0)
  })
})

test.describe('E17 ⟲ (AC-613, FR-660, FR-662, FR-626 S) board drag to เสร็จ, S on a row', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('drag to "เสร็จ" completes today, undo restores; S + typing changes status; the view survives reload', async ({
    page,
  }) => {
    const tasks = await openPos(page)
    await tasks.setView('board')
    await tasks.expectColumns(DEFAULT_STATUSES)

    await tasks.dragCard(R1, S.done)
    await expect(tasks.column(S.done).getByRole('article', { name: R1, exact: true })).toBeVisible()
    await expect(tasks.card(R1)).toHaveAttribute('data-completed', 'true')
    const changed = th.tasks.status.toast.changed(S.done)
    await expect(toastWith(page, changed)).toBeVisible()
    await tasks.card(R1).focus()
    await page.keyboard.press('Enter') // M3-D35: Enter on a card opens the panel
    await expect(tasks.panelTitle(R1)).toBeVisible()
    const completedOn = tasks.panel().getByText(th.tasks.completedOn(TODAY_TH), { exact: true })
    // BR-80: completed_on = today (Bangkok), shown in the panel (§7.3 E17). Soft, so the rest of AC-613 still runs.
    await expect.soft(completedOn).toBeVisible()

    await undoByToast(page, changed)
    await expect(tasks.column(S.todo).getByRole('article', { name: R1, exact: true })).toBeVisible()
    await expect(tasks.card(R1)).not.toHaveAttribute('data-completed', 'true')
    await expect(completedOn).toHaveCount(0)

    await tasks.setView('list')
    await tasks.press(ROLLOUT, 's')
    await tasks.pickStatus('กำลัง') // typed filter text, narrows to "กำลังทำ"
    await expect(tasks.statusChip(ROLLOUT, S.doing)).toBeVisible()
    await expect(toastWith(page, th.tasks.status.toast.changed(S.doing))).toBeVisible()
    await undoByKey(page)
    await expect(tasks.statusChip(ROLLOUT, S.todo)).toBeVisible()

    await tasks.reload()
    await expect(tasks.list()).toBeVisible() // the last chosen view (ลิสต์) is remembered (FR-660)
    await expect(tasks.viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('E18 ⟲ (AC-614, FR-624, FR-614 bulk status) delete a used status with a destination', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('3 tasks to "รอข้อมูล" in bulk; delete it moving them to "กำลังทำ"; undo restores status and tasks', async ({
    page,
  }) => {
    const tasks = await openPos(page)
    await tasks.select(R1)
    await tasks.select(ROLLOUT, ['Shift'])
    await expect(tasks.bulkBar(3)).toBeVisible()
    await tasks.bulkButton(3, th.tasks.bulk.setStatus).click()
    await tasks.pickStatus(S.waitData)
    await expect(toastWith(page, th.tasks.status.toast.changedMany(3, S.waitData))).toBeVisible()
    for (const n of POS_TASKS) await expect(tasks.statusChip(n, S.waitData)).toBeVisible()

    const project = new ProjectPage(page)
    await project.openTab('overview')
    await project.statuses.remove(S.waitData, { moveTo: S.doing }) // a popover, not a dialog (M3-D30)
    await expect(toastWith(page, th.tasks.status.toast.deletedMoved(3, S.doing))).toBeVisible()
    await project.statuses.expectNames([S.todo, S.doing, S.blocked, S.done])

    await project.openTab('tasks')
    await tasks.waitReady()
    await tasks.setView('board')
    await tasks.expectColumns([S.todo, S.doing, S.blocked, S.done])
    await expect(tasks.column(S.doing).getByRole('article')).toHaveCount(3)

    await undoByKey(page) // the same undo entry as the toast's "เลิกทำ" (X72)
    await tasks.expectColumns(DEFAULT_STATUSES)
    await expect(tasks.column(S.waitData).getByRole('article')).toHaveCount(3)
    await expect(tasks.column(S.doing).getByRole('article')).toHaveCount(0)
  })
})

test.describe('E19 ⟲ (AC-615, FR-640–644) blockers', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('B19 blocked by A19 shows ⛔; the reverse edge is a cycle; A19 done → ✓, B19 status unchanged', async ({
    page,
  }) => {
    const A = 'งาน A19'
    const B = 'งาน B19'
    const tasks = await openPos(page)
    await tasks.addTasks([A, B])

    await tasks.openPanel(B)
    await tasks.addBlockerInPanel(A)
    await expect(toastWith(page, th.tasks.blockers.toast.added(A))).toBeVisible()
    const waiting = tasks.blockerBadge(B, th.tasks.blockers.badgeWaiting(1))
    await expect(waiting).toBeVisible()
    await waiting.hover()
    await expect(page.getByRole('tooltip')).toHaveText(th.tasks.blockers.badgeTooltip(A))

    await tasks.openPanel(A)
    await expect(tasks.panel().getByRole('button', { name: B, exact: true })).toBeVisible() // "กำลังขวาง"
    await tasks.addBlockerInPanel(B)
    await expect(toastWith(page, th.tasks.blockers.errors.cycle([B, A, B].join(' → ')))).toBeVisible()
    await expect(tasks.blockerBadge(A, th.tasks.blockers.badgeWaiting(1))).toHaveCount(0)
    await expect(
      tasks.panel().getByRole('button', { name: th.tasks.blockers.remove(B), exact: true }),
    ).toHaveCount(0)

    const answered = waitForServerAction(page)
    await tasks.checkbox(A).click()
    await answered
    await expect(tasks.blockerBadge(B, th.tasks.blockers.badgeCleared)).toBeVisible()
    await expect(tasks.statusChip(B, S.todo)).toBeVisible() // nothing changes automatically (P7)
  })
})

test.describe('E20 ⟲ (AC-616, FR-665, FR-666, X75) งานของทีม', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    await resetDb()
  })

  const PETER_TASKS = ['ย้าย pipeline ขึ้น BigQuery', 'ทำ dashboard ผู้บริหาร', 'เก็บ requirement + สรุป']
  const NOT_FOR_PETER = [POS, R1, 'Mobile App Revamp', 'ย้ายข้อมูลลูกค้า']
  const CATEGORY_COLUMNS = [C.TODO, C.IN_PROGRESS, C.WAITING, C.DONE]

  test('Peter (DW + Store, M3-D34) sees only his projects’ tasks, in the list and on the 4-column board', async ({
    page,
  }) => {
    await loginAs(page, 'peter')
    const sidebar = new SidebarPage(page)
    const team = new TeamTasksPage(page)
    await sidebar.shell.goto('/home')
    await sidebar.teamTasksLink().click()
    await page.waitForURL((u) => u.pathname === '/tasks')
    await team.waitReady()
    await expect.poll(async () => (await team.linkNames()).sort()).toEqual([...PETER_TASKS].sort())
    let html = await page.content()
    for (const secret of NOT_FOR_PETER) expect(html, secret).not.toContain(secret)

    await team.setView('board')
    await team.board.expectColumns(CATEGORY_COLUMNS)
    await expect(team.board.board().getByRole('article')).toHaveCount(3)
    html = await page.content()
    for (const secret of NOT_FOR_PETER) expect(html, secret).not.toContain(secret)
  })

  test('Cindy filters CRM, drags a card to รอ/ติดขัด → first WAITING status; the list link opens the panel', async ({
    page,
  }) => {
    const crm = await idOf('project', CRM)
    const TASK = 'ย้ายข้อมูลลูกค้า'
    await loginAs(page, 'cindy')
    const team = new TeamTasksPage(page)
    await team.goto()
    await team.filterProject(CRM)
    await expect.poll(() => new URL(page.url()).searchParams.get('projectId')).toBe(crm)
    await expect
      .poll(async () => (await team.linkNames()).sort())
      .toEqual([TASK, 'ตั้งค่า automation'].sort())

    await team.setView('board')
    await team.board.dragCard(TASK, C.WAITING)
    await expect(team.board.column(C.WAITING).getByRole('article', { name: TASK, exact: true })).toBeVisible()
    await expect(team.board.cardStatusChip(TASK, S.waitData)).toBeVisible() // FR-666: first WAITING status of CRM
    expect(new URL(page.url()).searchParams.get('projectId')).toBe(crm)

    await team.setView('list')
    await team.taskLink(TASK).click()
    await page.waitForURL((u) => u.pathname === `/projects/${crm}/tasks` && u.searchParams.has('task'))
    const tasks = new TaskListPage(page)
    await expect(tasks.panelTitle(TASK)).toBeVisible()
  })
})
