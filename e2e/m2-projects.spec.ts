/**
 * M2 — clients, projects, members, permissions (plan/m02-clients-projects-authz.md §7.3, SPEC §12 M2:
 * "worker ไม่เห็นโปรเจคที่ไม่ได้เป็นสมาชิก (ลิสต์ + URL ตรง = 404)").
 * Determinism (PLAN §4.5): every describe block resets planner_e2e in its own beforeAll (golden seed incl. the M2
 * memberships: POS Cindy(L) Ivy Mint · DW Peter(L) · Mobile Jack(L) Mint · CRM Cindy(L) Ivy · Store Peter(L) Jack;
 * from M3 also the golden tasks + assignments, so removing Ivy or Mint from POS hits FR-404 — see m3 E11),
 * the browser clock is pinned by the auto fixture, the server's APP_NOW comes from the webServer env, all UI strings
 * come from th, selectors live in page objects, and nothing sleeps — waits are on server-action responses or UI state.
 */
import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { th } from '../src/i18n/th'
import { sortByThai } from '../src/lib/collate'
import { user } from '../src/server/db/schema'
import { expect, idOf, loginAs, openGuardedPage, resetDb, test, waitForServerAction } from './fixtures'
import { ClientsPage } from './pages/clients'
import { ProjectFormDialog, ProjectPage } from './pages/project'
import { ShellPage } from './pages/shell'
import { SidebarPage } from './pages/sidebar'
import { toastWith, undoButtonOf } from './pages/toast'

const GOLDEN_PROJECTS = [
  'POS Upgrade',
  'Data Warehouse',
  'Mobile App Revamp',
  'CRM Migration',
  'Store Analytics Dashboard',
] as const
const byThai = (names: readonly string[]) => sortByThai(names, (s) => s)
const onPath = (page: Page, path: string) => page.waitForURL((u) => u.pathname === path)

/** Moves focus off any input so the global Cmd/Ctrl+Z undo handler receives the key (as in m1-auth E2E-11). */
async function blurActive(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
  })
}

test.describe('E1 (§12 M2) worker visibility — Peter sees only DW and Store; other URLs are 404', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('sidebar, /projects and /clients list only his projects; direct URLs answer 404 without leaking', async ({
    page,
  }) => {
    const pos = await idOf('project', 'POS Upgrade')
    const dw = await idOf('project', 'Data Warehouse')
    const store = await idOf('project', 'Store Analytics Dashboard')
    const bluebird = await idOf('client', 'Bluebird')

    await loginAs(page, 'peter')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    await expect(sidebar.projectsHeaderLink()).toBeVisible()
    await expect(sidebar.clientsLink()).toBeVisible() // X33: "ลูกค้า" for every role
    await sidebar.expectProjects(['Data Warehouse', 'Store Analytics Dashboard'])
    await expect(sidebar.tentativeMark(store)).toBeVisible() // UI-03: ◐ with a text alternative
    await expect(sidebar.tentativeMark(dw)).toHaveCount(0)
    await expect(sidebar.newProjectButton()).toHaveCount(0) // FR-401: manager only
    expect(await page.content()).not.toContain('POS Upgrade')

    await sidebar.shell.goto('/projects')
    const table = sidebar.shell.main().getByRole('table')
    await expect(table.getByRole('link', { name: 'Data Warehouse', exact: true })).toBeVisible()
    await expect(table.getByRole('link', { name: 'Store Analytics Dashboard', exact: true })).toBeVisible()
    await expect(table.getByRole('row').filter({ has: page.getByRole('link') })).toHaveCount(2)
    for (const hidden of ['POS Upgrade', 'Mobile App Revamp', 'CRM Migration']) {
      expect(await page.content()).not.toContain(hidden)
    }

    for (const path of [`/projects/${pos}/overview`, `/projects/${pos}`, `/projects/${randomUUID()}/overview`]) {
      const res = await page.goto(path)
      expect(res?.status(), path).toBe(404)
      await expect(page.getByText(th.projects.notFound.title, { exact: true }), path).toBeVisible()
      expect(await page.content(), path).not.toContain('POS Upgrade')
    }

    const clients = new ClientsPage(page)
    await clients.goto()
    await expect(clients.nameLinks()).toHaveText(byThai(['Coral', 'Internal']))
    await expect(clients.addButton()).toHaveCount(0)

    const res = await page.goto(`/clients/${bluebird}`)
    expect(res?.status()).toBe(404)
    await expect(page.getByText(th.clients.notFound.title, { exact: true })).toBeVisible()
    expect(await page.content()).not.toContain('Mobile App Revamp')
  })
})

test.describe('E2 (FR-401, FR-409 part) the manager creates projects from the sidebar', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('with client, TENTATIVE and LEAD; then one without LEAD; Cindy sees neither', async ({ page, browser }) => {
    const NEW = 'ระบบจองห้องประชุม'
    const NO_LEAD = 'โปรเจคไม่มีลีด'
    const ivy = await idOf('user', 'Ivy')

    await loginAs(page, 'manager')
    const sidebar = new SidebarPage(page)
    const project = new ProjectPage(page)
    const form = new ProjectFormDialog(page)
    await sidebar.shell.goto('/home')

    await sidebar.newProjectButton().click()
    await expect(form.dialog()).toBeVisible()
    await expect(form.name()).toBeFocused()
    await form.name().fill(NEW)
    await form.pickClient('Coral')
    await form.certainty('TENTATIVE').click()
    await form.certaintyNote().fill('รอยืนยันงบประมาณ')
    await form.pickLead('Ivy')
    await form.submit()

    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    await expect(form.dialog()).toHaveCount(0)
    await expect(project.header()).toContainText(NEW)
    await expect(project.headerTentativeMark()).toBeVisible()
    await expect(project.memberRows()).toHaveCount(1)
    await project.expectRole(ivy, 'LEAD')
    await expect(project.noLeadWarning()).toHaveCount(0)
    await expect(project.statuses.region()).toBeVisible() // M3: ภาพรวม › สถานะงาน (FR-621 defaults)
    await project.statuses.expectNames(Object.values(th.tasks.status.defaults))

    await sidebar.newProjectButton().click()
    await expect(form.dialog()).toBeVisible()
    await form.name().fill(NO_LEAD)
    await form.submit()
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/)
    await expect(project.header()).toContainText(NO_LEAD)
    await expect(project.noLeadWarning()).toBeVisible() // BR-62 / M2-D17: warning, not a block

    await sidebar.expectProjects(byThai([...GOLDEN_PROJECTS, NEW, NO_LEAD]))

    const cindy = await openGuardedPage(browser)
    await loginAs(cindy.page, 'cindy')
    const cindySidebar = new SidebarPage(cindy.page)
    await cindySidebar.shell.goto('/home')
    await cindySidebar.expectProjects(['CRM Migration', 'POS Upgrade'])
    expect(await cindy.page.content()).not.toContain(NEW)
    expect(await cindy.page.content()).not.toContain(NO_LEAD)
    await cindy.close()
  })
})

test.describe('E3 (FR-301, FR-302, FR-303 part) clients', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('create, unique name, archive with undo, hidden from the picker; Cindy sees only her clients', async ({
    page,
  }) => {
    const mobile = await idOf('project', 'Mobile App Revamp')
    await loginAs(page, 'manager')
    const clients = new ClientsPage(page)
    await clients.goto()

    await clients.create('SCB', 'SCB')
    await expect(clients.dialog()).toHaveCount(0)
    await expect(clients.row('SCB')).toBeVisible()

    await clients.create('Coral')
    await expect(clients.dialog().getByText(th.clients.errors.nameTaken, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape') // KEY-03
    await expect(clients.dialog()).toHaveCount(0)

    await clients.archive('Bluebird')
    await expect(page.getByRole('dialog')).toHaveCount(0) // P2: no confirm
    const archivedToast = th.clients.toasts.archived('Bluebird')
    await expect(toastWith(page, archivedToast)).toBeVisible()
    const undone = waitForServerAction(page)
    await undoButtonOf(page, archivedToast).click()
    await undone
    await expect(clients.row('Bluebird')).toBeVisible()
    await expect(clients.archivedChip('Bluebird')).toHaveCount(0)

    await clients.archive('Bluebird')
    await expect(clients.row('Bluebird')).toHaveCount(0) // archived clients are hidden by default

    const sidebar = new SidebarPage(page)
    const form = new ProjectFormDialog(page)
    await sidebar.newProjectButton().click()
    await expect(form.dialog()).toBeVisible()
    await form.clientInput().click()
    await expect(form.clientOptions().filter({ hasText: 'Coral' })).toHaveCount(1)
    await expect(form.clientOptions().filter({ hasText: 'Bluebird' })).toHaveCount(0) // FR-302
    await page.keyboard.press('Escape')
    await form.cancelButton().click()
    await expect(form.dialog()).toHaveCount(0)

    const project = new ProjectPage(page)
    await project.goto(mobile)
    await expect(project.header()).toContainText('Bluebird') // FR-302: existing projects unaffected
    await expect(project.header().getByText(th.clients.archivedChip, { exact: true })).toBeVisible()

    await page.context().clearCookies()
    await loginAs(page, 'cindy')
    await clients.goto()
    await expect(clients.nameLinks()).toHaveText(byThai(['Coral', 'Sunrise']))
    await expect(clients.addButton()).toHaveCount(0)
  })
})

test.describe('E4 (FR-403, FR-404 part, BR-62, AC-203 M2) members on POS as Cindy', () => {
  test.beforeAll(async () => {
    await resetDb(undefined, {
      extras: (tx) =>
        tx.insert(user).values({
          id: randomUUID(),
          name: 'Nok Deactivated',
          nickname: 'Nok',
          email: 'nok@example.com',
          role: 'worker',
          banned: true,
          banReason: 'DEACTIVATED',
          deactivatedOn: '2026-09-01',
          mustChangePassword: false,
        }), // no account row: Nok never logs in
    })
  })

  test('last LEAD guard, add, role change, remove + undo (button and Cmd+Z); Ivy is read-only', async ({ page }) => {
    const pos = await idOf('project', 'POS Upgrade')
    const cindy = await idOf('user', 'Cindy')
    const jack = await idOf('user', 'Jack')
    const mint = await idOf('user', 'Mint')

    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    await project.goto(pos)
    await expect(project.memberRows()).toHaveCount(3)

    await project.setRole(cindy, 'MEMBER')
    await expect(toastWith(page, th.members.errors.lastLead)).toBeVisible()
    await project.expectRole(cindy, 'LEAD')

    await project.addMember('Jack', 'Jo')
    await expect(project.memberRow(jack)).toBeVisible()
    await project.expectRole(jack, 'MEMBER')

    await project.typeInPicker('Nok')
    await expect(page.getByText(th.members.pickerEmpty, { exact: true })).toBeVisible() // deactivated: not offered
    await project.typeInPicker('')
    await page.keyboard.press('Escape')

    await project.setRole(jack, 'LEAD')
    await project.expectRole(jack, 'LEAD')

    await project.removeMember('Jack')
    await expect(page.getByRole('dialog')).toHaveCount(0) // P2: no confirm
    const removedJack = th.members.toasts.removed('Jack')
    await expect(toastWith(page, removedJack)).toBeVisible()
    await expect(project.memberRow(jack)).toHaveCount(0)
    const undone = waitForServerAction(page)
    await undoButtonOf(page, removedJack).click()
    await undone
    await expect(project.memberRow(jack)).toBeVisible()
    await project.expectRole(jack, 'LEAD') // M2-D05: re-added with the removed role

    // M3 (S5.3): Mint now has a POS assignment, so removing her shows the FR-404 choice instead (covered by m3 E11);
    // the Cmd+Z path removes Jack again, who has none.
    await project.removeMember('Jack')
    await expect(project.memberRow(jack)).toHaveCount(0)
    await blurActive(page)
    const undoneByKey = waitForServerAction(page)
    await page.keyboard.press('ControlOrMeta+z')
    await undoneByKey
    await expect(project.memberRow(jack)).toBeVisible()
    await project.expectRole(jack, 'LEAD')
    await expect(project.memberRow(mint)).toBeVisible()
    await project.expectRole(mint, 'MEMBER')

    await page.context().clearCookies()
    await loginAs(page, 'ivy')
    await project.goto(pos)
    await expect(project.memberRows()).toHaveCount(4) // Cindy, Ivy, Mint, Jack
    await expect(project.membersPanel().getByRole('combobox')).toHaveCount(0)
    await expect(project.removeButton('Mint')).toHaveCount(0)
    await expect(project.editButton()).toHaveCount(0)
  })
})

test.describe('E5 (FR-405) certainty changes without a reload', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('◐ appears and disappears in the header and the sidebar; the page is never reloaded', async ({ page }) => {
    const pos = await idOf('project', 'POS Upgrade')
    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    const sidebar = new SidebarPage(page)
    await project.goto(pos)
    await expect(project.headerTentativeMark()).toHaveCount(0)
    await expect(sidebar.tentativeMark(pos)).toHaveCount(0)
    await page.evaluate(() => {
      ;(window as unknown as { __m2Marker?: number }).__m2Marker = 1
    })

    await project.setCertainty('TENTATIVE')
    await expect(project.headerTentativeMark()).toBeVisible()
    await expect(sidebar.tentativeMark(pos)).toBeVisible()
    await expect(
      toastWith(page, th.projects.toasts.certaintyChanged(th.projects.certainty.TENTATIVE)),
    ).toBeVisible()

    await project.setCertainty('CONFIRMED')
    await expect(project.headerTentativeMark()).toHaveCount(0)
    await expect(sidebar.tentativeMark(pos)).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __m2Marker?: number }).__m2Marker)).toBe(1)
  })
})

test.describe('E6 (FR-406 part) archive with undo, archived list, unarchive', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Cindy archives CRM without a confirm, undoes, archives again and unarchives from the archived list', async ({
    page,
  }) => {
    const crm = await idOf('project', 'CRM Migration')
    await loginAs(page, 'cindy')
    const project = new ProjectPage(page)
    const sidebar = new SidebarPage(page)
    await project.goto(crm)
    await expect(sidebar.archivedLink()).toHaveCount(0)

    const archived = th.projects.toasts.archived('CRM Migration')
    let answered = waitForServerAction(page)
    await project.archiveButton().click()
    await answered
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(toastWith(page, archived)).toBeVisible()
    await expect(project.archivedBanner()).toBeVisible()
    await expect(sidebar.projectLink('CRM Migration')).toHaveCount(0)
    await expect(project.archiveButton()).toHaveCount(0)
    await expect(project.editButton()).toHaveCount(0)

    answered = waitForServerAction(page)
    await undoButtonOf(page, archived).click()
    await answered
    await expect(sidebar.projectLink('CRM Migration')).toBeVisible()
    await expect(project.archivedBanner()).toHaveCount(0)

    answered = waitForServerAction(page)
    await project.archiveButton().click()
    await answered
    await expect(project.archivedBanner()).toBeVisible()

    await sidebar.archivedLink().click()
    await page.waitForURL((u) => u.pathname === '/projects' && u.searchParams.get('archived') === '1')
    const archivedList = sidebar.shell.main().getByRole('table')
    await archivedList.getByRole('link', { name: 'CRM Migration', exact: true }).click()
    await onPath(page, `/projects/${crm}/overview`)

    answered = waitForServerAction(page)
    await project.unarchiveButton().click()
    await answered
    await expect(toastWith(page, th.projects.toasts.unarchived('CRM Migration'))).toBeVisible()
    await expect(project.archivedBanner()).toHaveCount(0)
    await expect(sidebar.projectLink('CRM Migration')).toBeVisible()
  })
})

test.describe('E7 (FR-407) permanent delete — the only confirm dialog', () => {
  test.use({ allowedConsoleErrors: [/status of 404/] })
  test.beforeAll(async () => {
    await resetDb()
  })

  test('a LEAD has no delete button; the manager must type the exact name; afterwards the URL is 404', async ({
    page,
  }) => {
    const pos = await idOf('project', 'POS Upgrade')
    const store = await idOf('project', 'Store Analytics Dashboard')
    const project = new ProjectPage(page)
    const sidebar = new SidebarPage(page)

    await loginAs(page, 'cindy')
    await project.goto(pos)
    await expect(project.archiveButton()).toBeVisible()
    await expect(project.deleteButton()).toHaveCount(0)

    await page.context().clearCookies()
    await loginAs(page, 'manager')
    await project.goto(store)
    await project.deleteButton().click()
    await expect(project.deleteDialog()).toBeVisible()
    await expect(project.deleteConfirmButton()).toBeDisabled()
    await project.deleteNameInput().fill('Store')
    await expect(project.deleteConfirmButton()).toBeDisabled()
    await project.deleteNameInput().fill('Store Analytics Dashboard')
    await expect(project.deleteConfirmButton()).toBeEnabled()
    const answered = waitForServerAction(page)
    await project.deleteConfirmButton().click()
    await answered

    await onPath(page, '/projects')
    await expect(toastWith(page, th.projects.toasts.deleted('Store Analytics Dashboard'))).toBeVisible()
    await expect(sidebar.projectLink('Store Analytics Dashboard')).toHaveCount(0)
    await expect(
      sidebar.shell.main().getByRole('link', { name: 'Store Analytics Dashboard', exact: true }),
    ).toHaveCount(0)

    const res = await page.goto(`/projects/${store}/overview`)
    expect(res?.status()).toBe(404)
    await expect(page.getByText(th.projects.notFound.title, { exact: true })).toBeVisible()
  })
})

test.describe('E8 (FR-408 part) project tabs', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  // M3 (X15, S5.3): the งาน tab joins ภาพรวม; M4 (X15, X84) appends เอกสาร; M6 (แผนงาน) updates this list.
  test('/projects/<id> redirects to the overview; only built tabs (ภาพรวม, งาน, เอกสาร), overview selected, none disabled', async ({
    page,
  }) => {
    const mobile = await idOf('project', 'Mobile App Revamp')
    await loginAs(page, 'jack')
    const project = new ProjectPage(page)
    await page.goto(`/projects/${mobile}`)
    await onPath(page, `/projects/${mobile}/overview`)
    await project.shell.waitForHydration()
    await expect(project.tabs()).toHaveText([
      th.projects.tabs.overview,
      th.projects.tabs.tasks,
      th.projects.tabs.pages,
    ])
    await expect(project.tab('overview')).toHaveAttribute('aria-selected', 'true')
    await expect(project.tab('tasks')).toHaveAttribute('aria-selected', 'false')
    await expect(project.tab('tasks')).toHaveAttribute('href', `/projects/${mobile}/tasks`)
    await expect(project.tab('pages')).toHaveAttribute('aria-selected', 'false')
    await expect(project.tab('pages')).toHaveAttribute('href', `/projects/${mobile}/pages`)
    await expect(project.tabList().getByRole('tab', { disabled: true })).toHaveCount(0)
  })
})

test.describe('E9 (UI-02 part, X05) the sidebar remembers expanded projects', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  test('Mint expands POS, reloads, POS is still expanded — stored as a preference, not localStorage', async ({
    page,
  }) => {
    const pos = await idOf('project', 'POS Upgrade')
    await loginAs(page, 'mint')
    const sidebar = new SidebarPage(page)
    await sidebar.shell.goto('/home')
    await sidebar.expectProjects(['Mobile App Revamp', 'POS Upgrade'])
    await expect(sidebar.overviewSubLink(pos)).toHaveCount(0)

    const saved = waitForServerAction(page) // setPreference('sidebar.expanded', …), debounced by M1
    await sidebar.expandProject('POS Upgrade')
    await saved
    await expect(sidebar.overviewSubLink(pos)).toHaveAttribute('href', `/projects/${pos}/overview`)

    await page.reload()
    await sidebar.shell.waitForHydration()
    await expect(sidebar.collapseToggle('POS Upgrade')).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebar.overviewSubLink(pos)).toBeVisible()
    await expect(sidebar.tasksSubLink(pos)).toHaveAttribute('href', `/projects/${pos}/tasks`) // M3 tab sub-link
    await expect(sidebar.pagesSubLink(pos)).toHaveAttribute('href', `/projects/${pos}/pages`) // M4 tab sub-link
    await sidebar.expectProjects(['Mobile App Revamp', 'POS Upgrade']) // sub-links are not project rows
    // eslint-disable-next-line no-restricted-globals -- reads (never writes) localStorage to prove it stays empty (X53)
    expect(await page.evaluate(() => localStorage.length)).toBe(0)
  })
})

test.describe('X33 nav entries for every golden role', () => {
  test.beforeAll(async () => {
    await resetDb()
  })

  for (const who of ['manager', 'cindy', 'ivy', 'peter', 'jack', 'mint'] as const) {
    test(`${who}: the ${th.nav.projects} section header, ${th.nav.clients}, ${th.nav.my} and ${th.nav.teamTasks} are in the sidebar`, async ({
      page,
    }) => {
      await loginAs(page, who)
      const shell = new ShellPage(page)
      await shell.goto('/home')
      await expect(shell.navLink(th.nav.projects)).toHaveAttribute('href', '/projects')
      await expect(shell.navLink(th.nav.clients)).toHaveAttribute('href', '/clients')
      await expect(shell.navLink(th.nav.home)).toBeVisible()
      // M3 (X33, X84): งานของฉัน (with its count) and งานของทีม for every role
      const sidebar = new SidebarPage(page)
      await expect(sidebar.myTasksLink()).toHaveAttribute('href', '/my')
      await expect(sidebar.teamTasksLink()).toHaveAttribute('href', '/tasks')
    })
  }
})
