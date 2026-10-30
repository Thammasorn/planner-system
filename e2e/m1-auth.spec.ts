/**
 * M1 — auth, employees, positions (plan/m01-auth-employees.md §7.3). Serial: later tests build on earlier ones
 * (Nok and Ploy are created here; Cindy is deactivated and reactivated; Peter's password changes; Ivy gets locked).
 * Deterministic per PLAN §4.5: one resetDb() per file, browser clock pinned by the fixtures, server APP_NOW from the
 * webServer env, strings from th, page objects, no sleeps.
 */
import type { Page } from '@playwright/test'
import { th } from '../src/i18n/th'
import { E2E } from './env'
import {
  expect,
  GOLDEN_PASSWORD,
  goldenEmail,
  loginAs,
  openGuardedPage,
  resetDb,
  test,
  waitForServerAction,
} from './fixtures'
import { AccountPage } from './pages/account'
import { LoginPage } from './pages/login'
import { EmployeesPage, PositionsPage } from './pages/settings'
import { ShellPage } from './pages/shell'
import { escapeRegExp } from './pages/text'

const url = (path: string) => new URL(path, E2E.baseUrl).href
const onPath = (page: Page, path: string) => page.waitForURL((u) => u.pathname === path)

const NOK = { name: 'Nok Test', email: 'nok@example.com', initial: 'Start-pass-99', changed: 'Nok-pass-2026' }
const PLOY = { name: 'Ploy Test', email: 'ploy@example.com' }

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await resetDb()
})

test.describe('m1 auth, employees, positions', () => {
  test('E2E-01 (AC-101) anonymous visits go to /login (with ?next=), no sign-up, login lands on next', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(url('/login'))
    await page.goto('/settings/employees')
    await expect(page).toHaveURL(url('/login?next=%2Fsettings%2Femployees'))

    const login = new LoginPage(page)
    await expect(login.heading()).toBeVisible()
    await expect(page.getByText(th.auth.noSignUp, { exact: true })).toBeVisible()
    await expect(page.locator('a[href*="sign-up"], a[href*="signup"], a[href*="register"]')).toHaveCount(0)

    await login.login(goldenEmail('manager'), GOLDEN_PASSWORD)
    await expect(page).toHaveURL(url('/settings/employees')) // X32
  })

  test('E2E-02 (AC-102) the sign-up endpoint is rejected and its would-be account cannot log in', async ({ page }) => {
    const res = await page.request.post('/api/auth/sign-up/email', {
      data: { email: 'x@example.com', password: 'Abcdef-123', name: 'X' },
      headers: { origin: E2E.baseUrl },
    })
    expect([400, 404]).toContain(res.status())

    const login = new LoginPage(page)
    await login.goto()
    await login.login('x@example.com', 'Abcdef-123')
    await expect(login.error(th.auth.errors.INVALID_CREDENTIALS)).toBeVisible()
    await expect(page).toHaveURL(url('/login'))
  })

  test('E2E-03 (AC-103, FR-104, FR-105) a new worker must change the password before anything else', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'manager')
    const emp = new EmployeesPage(page)
    await emp.goto()
    await emp.openCreate()
    await expect(emp.mustChangeCheckbox()).toBeChecked() // FR-203 default
    await emp.fillCreate({ name: NOK.name, email: NOK.email, password: NOK.initial })
    await emp.submit()
    await emp.createdPassword()
    await emp.closeDialog()
    await expect(emp.row(NOK.name)).toBeVisible()

    const nok = await openGuardedPage(browser)
    const login = new LoginPage(nok.page)
    await login.goto()
    await login.login(NOK.email, NOK.initial)
    await onPath(nok.page, '/account/password')
    const account = new AccountPage(nok.page)
    await expect(account.mustChangeBanner()).toBeVisible()

    await nok.page.goto('/home')
    await expect(nok.page).toHaveURL(url('/account/password'))
    await expect(account.mustChangeBanner()).toBeVisible()

    // the whole email (EQUALS_EMAIL alone; the bare local part "nok" would also be TOO_SHORT)
    await account.changePassword(NOK.initial, NOK.email)
    await expect(nok.page.getByText(th.account.policy.EQUALS_EMAIL)).toBeVisible()
    await account.changePassword(NOK.initial, NOK.initial)
    await expect(nok.page.getByText(th.account.policy.SAME_AS_CURRENT)).toBeVisible()
    await account.changePassword(NOK.initial, NOK.changed, `${NOK.changed}-x`)
    await expect(nok.page.getByText(th.account.policy.MISMATCH)).toBeVisible()
    await expect(nok.page).toHaveURL(url('/account/password'))

    await account.changePassword(NOK.initial, NOK.changed)
    await expect(nok.page).toHaveURL(url('/home'))
    await nok.close()
  })

  test('E2E-04 (AC-104, AC-203 M1) deactivating Cindy ends her session at once; reactivating lets her back', async ({
    page,
    browser,
  }) => {
    const cindy = await openGuardedPage(browser)
    await loginAs(cindy.page, 'cindy')
    await new ShellPage(cindy.page).goto('/home')

    await loginAs(page, 'manager')
    const emp = new EmployeesPage(page)
    await emp.goto()
    const deactivated = waitForServerAction(page)
    await emp.rowAction('Cindy', th.employees.actions.deactivate)
    await deactivated
    await expect(page.getByText(th.employees.deactivated('Cindy'))).toBeVisible()
    await expect(page.getByRole('button', { name: th.undo.undo, exact: true })).toBeVisible()
    await expect(emp.statusChip('Cindy', 'deactivated')).toBeVisible()

    await cindy.page.reload()
    await expect(cindy.page).toHaveURL(url('/login'))
    const login = new LoginPage(cindy.page)
    await login.login(goldenEmail('cindy'), GOLDEN_PASSWORD)
    await expect(login.error(th.auth.errors.ACCOUNT_DEACTIVATED)).toBeVisible()

    const reactivated = waitForServerAction(page)
    await emp.rowAction('Cindy', th.employees.actions.reactivate)
    await reactivated
    await expect(emp.statusChip('Cindy', 'active')).toBeVisible()

    await login.login(goldenEmail('cindy'), GOLDEN_PASSWORD)
    await expect(cindy.page).toHaveURL(url('/home'))
    await cindy.close()
  })

  test('E2E-05 (AC-201, FR-202) random password → copy → the worker logs in with it · E2E-06 (AC-202) it is never shown again', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'manager')
    const emp = new EmployeesPage(page)
    await emp.goto()
    await emp.openCreate()
    await emp.fillCreate({ name: PLOY.name, email: PLOY.email })
    const generated = await emp.generatePassword()
    expect(generated).toHaveLength(12)
    await emp.submit()
    const shown = await emp.createdPassword()
    expect(shown).toBe(generated)
    await emp.copyCreatedPassword()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toBe(shown)

    const ploy = await openGuardedPage(browser)
    const login = new LoginPage(ploy.page)
    await login.goto()
    await login.login(PLOY.email, copied)
    await onPath(ploy.page, '/account/password')
    await ploy.close()

    // E2E-06 (AC-202): close, reopen → empty; the password is gone from the DOM, also after a reload
    await emp.closeDialog()
    await emp.openCreate()
    await expect(emp.passwordField()).toHaveValue('')
    await emp.cancelDialog()
    expect(await page.content()).not.toContain(shown)
    await page.reload()
    await expect(emp.addButton()).toBeVisible()
    expect(await page.content()).not.toContain(shown)
  })

  test('E2E-07 (FR-207, FR-201 edit) editing Ploy: no Friday, Wednesday 0.50, position Designer', async ({ page }) => {
    await loginAs(page, 'manager')
    const emp = new EmployeesPage(page)
    await emp.goto()
    await emp.rowAction(PLOY.name, th.employees.actions.edit)
    await expect(emp.dialog()).toBeVisible()
    await emp.setWorks(5, false)
    await emp.setFraction(3, 50)
    await emp.fillForm({ position: 'Designer' })
    await emp.submit()
    await expect(emp.dialog()).toBeHidden()

    const d = th.employees.schedule.weekdayShort
    const summary = `${d[1]} ${d[2]} ${d[3]}(0.50) ${d[4]}`
    const row = emp.row(PLOY.name)
    await expect(row).toContainText(new RegExp(`${escapeRegExp(summary)}(?!\\s*${escapeRegExp(d[5])})`))
    await expect(row).toContainText('Designer')
  })

  test('E2E-08 (FR-107) sign out everywhere ends the session on every device', async ({ browser }) => {
    const a = await openGuardedPage(browser)
    const b = await openGuardedPage(browser)
    await loginAs(a.page, 'jack')
    await loginAs(b.page, 'jack')
    await new ShellPage(b.page).goto('/home')

    const account = new AccountPage(a.page)
    await account.goto()
    await account.signOutEverywhere()
    await expect(a.page).toHaveURL(url('/login'))

    await b.page.reload()
    await expect(b.page).toHaveURL(url('/login'))
    await a.close()
    await b.close()
  })

  test('E2E-09 (FR-105) Peter changes his password: wrong current is refused, then old fails and new works', async ({
    page,
  }) => {
    const NEW = 'Peter-pass-2026'
    await loginAs(page, 'peter')
    const account = new AccountPage(page)
    await account.goto()
    await account.changePasswordOnServer('Wrong-current-1', NEW)
    await expect(page.getByText(th.errors.INVALID_PASSWORD)).toBeVisible()
    await expect(page).toHaveURL(url('/account/password'))

    await account.changePassword(GOLDEN_PASSWORD, NEW)
    await expect(page).toHaveURL(url('/home'))
    const shell = new ShellPage(page)
    await shell.waitForHydration()
    await shell.logout()

    const login = new LoginPage(page)
    await login.login(goldenEmail('peter'), GOLDEN_PASSWORD)
    await expect(login.error(th.auth.errors.INVALID_CREDENTIALS)).toBeVisible()
    await login.login(goldenEmail('peter'), NEW)
    await expect(page).toHaveURL(url('/home'))
  })

  test('E2E-10 (FR-106) five wrong logins lock Ivy out even with the right password', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    for (let i = 1; i <= 5; i++) {
      await login.login(goldenEmail('ivy'), `Wrong-pass-${i}`)
      await expect(login.error(th.auth.errors.INVALID_CREDENTIALS)).toBeVisible()
      await expect(login.error(th.auth.errors.LOGIN_LOCKED)).toHaveCount(0)
    }
    await login.login(goldenEmail('ivy'), GOLDEN_PASSWORD)
    await expect(login.error(th.auth.errors.LOGIN_LOCKED)).toBeVisible()
    await expect(page).toHaveURL(url('/login'))
  })

  test('E2E-11 (FR-208, X04) positions: add, rename, move up, delete with toast undo and Cmd/Ctrl+Z; in-use blocked', async ({
    page,
  }) => {
    await loginAs(page, 'manager')
    const pos = new PositionsPage(page)
    await pos.goto()
    const initial = await pos.names()
    expect(initial.length).toBeGreaterThan(1)

    await pos.add('DevOps')
    await expect.poll(() => pos.names()).toEqual([...initial, 'DevOps'])
    await pos.rename('DevOps', 'Platform')
    await pos.moveUp('Platform')
    const moved = [...initial.slice(0, -1), 'Platform', initial.at(-1)!]
    await expect.poll(() => pos.names()).toEqual(moved)

    await pos.delete('Platform')
    await expect(page.getByText(th.positions.deleted('Platform'))).toBeVisible()
    await expect(pos.row('Platform')).toHaveCount(0)
    const restored = waitForServerAction(page)
    await page.getByRole('button', { name: th.undo.undo, exact: true }).click()
    await restored
    await expect.poll(() => pos.names()).toEqual(moved)

    await pos.delete('Platform')
    await expect(pos.row('Platform')).toHaveCount(0)
    await page.evaluate(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
    const undone = waitForServerAction(page)
    await page.keyboard.press('ControlOrMeta+z')
    await undone
    await expect.poll(() => pos.names()).toEqual(moved)

    await pos.delete('QA')
    await expect(page.getByText(th.positions.inUse(1))).toBeVisible()
    await expect(pos.row('QA')).toBeVisible()
  })

  test.describe('workers on manager pages', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('E2E-12 (FR-209, X41) search and filters; a worker gets 404 on /settings/*', async ({ page }) => {
      await loginAs(page, 'manager')
      const emp = new EmployeesPage(page)
      await emp.goto()
      await expect(emp.rows()).toHaveCount(8) // 6 golden + Nok + Ploy

      await emp.search('pat')
      await expect(emp.rows()).toHaveCount(1)
      await expect(emp.row('Peter')).toBeVisible()
      await emp.search('')
      await expect(emp.rows()).toHaveCount(8)

      await emp.filterPosition('Designer')
      await expect(emp.rows()).toHaveCount(2)
      await expect(emp.row('Jack')).toBeVisible()
      await expect(emp.row(PLOY.name)).toBeVisible() // moved in E2E-07
      await emp.filterPosition(th.employees.filters.allPositions)
      await expect(emp.rows()).toHaveCount(8)

      await emp.filterStatus(th.employees.status.deactivated)
      await expect(page.getByText(th.employees.noMatch)).toBeVisible() // Cindy was reactivated in E2E-04
      await expect(emp.rows()).toHaveCount(0)
      await emp.filterStatus(th.employees.status.active)
      await expect(emp.rows()).toHaveCount(8)

      await page.context().clearCookies()
      await loginAs(page, 'mint')
      expect((await page.goto('/settings/employees'))?.status()).toBe(404)
      expect((await page.goto('/settings/positions'))?.status()).toBe(404)
    })
  })

  test('E2E-13 (§8.1, X05) the theme choice persists across reloads; logout returns to /login', async ({ page }) => {
    await loginAs(page, 'jack')
    const shell = new ShellPage(page)
    await shell.goto('/home')
    const saved = waitForServerAction(page)
    await shell.chooseTheme(th.prefs.themes.dark)
    await saved
    await page.reload()
    await shell.waitForHydration()
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

    await shell.logout()
    await expect(page).toHaveURL(url('/login'))
    await page.goto('/home')
    await expect(page).toHaveURL(url('/login'))
  })

  test('E2E-14 (X33) the collapsed sidebar persists across reloads', async ({ page }) => {
    await loginAs(page, 'jack')
    const shell = new ShellPage(page)
    await shell.goto('/home')
    await shell.expectCollapsed(false)
    const saved = waitForServerAction(page)
    await shell.toggleSidebar()
    await shell.expectCollapsed(true)
    await saved
    await page.reload()
    await shell.waitForHydration()
    await shell.expectCollapsed(true)
  })

  test('E2E-15 (settings nav) only managers see the settings link, and it opens the employees page', async ({ page }) => {
    const settingsLink = page.getByRole('link', { name: th.nav.settings, exact: true })
    const shell = new ShellPage(page)

    await loginAs(page, 'mint')
    await shell.goto('/home')
    await expect(shell.navLink(th.nav.home)).toBeVisible()
    await expect(settingsLink).toHaveCount(0)

    await page.context().clearCookies()
    await loginAs(page, 'manager')
    await shell.goto('/home')
    await settingsLink.click()
    await expect(page).toHaveURL(url('/settings/employees'))
  })
})
