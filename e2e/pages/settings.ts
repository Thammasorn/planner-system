import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { escapeRegExp, exactName } from './text'

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
type FractionCd = 25 | 50 | 75 | 100

export interface EmployeeFormValues {
  name?: string
  nickname?: string
  email?: string
  /** Visible position name, or th.users.noPosition. */
  position?: string
  role?: 'manager' | 'worker'
  password?: string
}

/**
 * Picks `option` in the select labelled `label` inside `scope`. Every select on these screens is a native
 * `<select>` (TextField `select` + `slotProps.select.native`), so the option is chosen by its visible label.
 */
async function choose(scope: Locator, label: string, option: string): Promise<void> {
  const select = scope.getByRole('combobox', { name: exactName(label) })
  await select.selectOption({ label: option })
  await expect(select.locator('option:checked')).toHaveText(option)
}

/** `/settings/employees` (plan/m01-auth-employees.md S3.7–S3.10). */
export class EmployeesPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings/employees')
    await expect(this.addButton()).toBeEnabled()
  }

  main(): Locator {
    return this.page.locator('main#main')
  }
  table(): Locator {
    return this.main().getByRole('table')
  }
  /** Data rows only (the header row lives in thead). */
  rows(): Locator {
    return this.table().locator('tbody').getByRole('row')
  }
  /** The row whose name cell starts with the display name (also matches "Cindy (ปิดใช้งาน)"-style suffixes). */
  row(nameOrNickname: string): Locator {
    return this.rows().filter({ has: this.page.getByText(new RegExp(`^${escapeRegExp(nameOrNickname)}(\\s|$)`)) })
  }
  /** The status chip text of a row (th.employees.status.*). */
  statusChip(nameOrNickname: string, status: 'active' | 'deactivated'): Locator {
    return this.row(nameOrNickname).getByText(th.employees.status[status], { exact: true })
  }

  addButton(): Locator {
    return this.page.getByRole('button', { name: th.employees.add, exact: true })
  }
  dialog(): Locator {
    return this.page.getByRole('dialog')
  }

  async openCreate(): Promise<void> {
    await this.addButton().click()
    await expect(this.dialog()).toBeVisible()
  }

  async fillForm(v: EmployeeFormValues): Promise<void> {
    const d = this.dialog()
    if (v.name !== undefined) await d.getByLabel(exactName(th.employees.fields.name)).fill(v.name)
    if (v.nickname !== undefined) await d.getByLabel(exactName(th.employees.fields.nickname)).fill(v.nickname)
    if (v.email !== undefined) await d.getByLabel(exactName(th.employees.fields.email)).fill(v.email)
    if (v.position !== undefined) await choose(d, th.employees.fields.position, v.position)
    if (v.role !== undefined) await choose(d, th.employees.fields.role, th.employees.roles[v.role])
    if (v.password !== undefined) await this.passwordField().fill(v.password)
  }

  /** Create mode: fills the form (S3.8). */
  async fillCreate(v: EmployeeFormValues): Promise<void> {
    await this.fillForm(v)
  }

  passwordField(): Locator {
    return this.dialog().getByRole('textbox', { name: exactName(th.employees.fields.initialPassword) })
  }
  mustChangeCheckbox(): Locator {
    return this.dialog().getByRole('checkbox', { name: th.employees.fields.mustChange })
  }

  async generatePassword(): Promise<string> {
    await this.dialog().getByRole('button', { name: th.employees.generatePassword, exact: true }).click()
    await expect(this.passwordField()).not.toHaveValue('')
    return this.passwordField().inputValue()
  }

  /** Saves the dialog and waits for the server action. */
  async submit(): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.dialog().getByRole('button', { name: th.common.save, exact: true }).click()
    await answered
  }

  /** Success step after create / reset (PasswordReveal): the read-only field labelled th.auth.password. */
  revealedPasswordField(): Locator {
    return this.dialog().getByRole('textbox', { name: exactName(th.auth.password) })
  }

  /** Success step after create / reset: the password shown once (read-only field). */
  async createdPassword(): Promise<string> {
    await expect(this.dialog().getByText(th.employees.passwordShownOnce)).toBeVisible()
    await expect(this.revealedPasswordField()).toHaveAttribute('readonly', '')
    return this.revealedPasswordField().inputValue()
  }

  async copyCreatedPassword(): Promise<void> {
    await this.dialog().getByRole('button', { name: th.employees.copyPassword, exact: true }).click()
    await expect(this.dialog().getByText(th.common.copied)).toBeVisible()
  }

  async closeDialog(): Promise<void> {
    await this.dialog().getByRole('button', { name: th.common.close, exact: true }).click()
    await expect(this.dialog()).toBeHidden()
  }

  async cancelDialog(): Promise<void> {
    await this.dialog().getByRole('button', { name: th.common.cancel, exact: true }).click()
    await expect(this.dialog()).toBeHidden()
  }

  /** Row menu (aria-label th.common.actions) → item `label` (th.employees.actions.*). */
  async rowAction(nameOrNickname: string, label: string): Promise<void> {
    await this.row(nameOrNickname).getByRole('button', { name: th.common.actions }).click()
    await this.page.getByRole('menuitem', { name: label, exact: true }).click()
  }

  /**
   * One weekday row of the ScheduleEditor: a checkbox named "th.employees.schedule.works + weekdayLong[d]" and a
   * native select named "th.employees.schedule.fraction + weekdayLong[d]" (ScheduleEditor.tsx).
   */
  scheduleWorks(d: Weekday): Locator {
    const name = `${th.employees.schedule.works} ${th.employees.schedule.weekdayLong[d]}`
    return this.dialog().getByRole('checkbox', { name, exact: true })
  }
  scheduleFraction(d: Weekday): Locator {
    const name = `${th.employees.schedule.fraction} ${th.employees.schedule.weekdayLong[d]}`
    return this.dialog().getByRole('combobox', { name, exact: true })
  }
  async setWorks(d: Weekday, works: boolean): Promise<void> {
    await this.scheduleWorks(d).setChecked(works)
  }
  async setFraction(d: Weekday, cd: FractionCd): Promise<void> {
    await this.scheduleFraction(d).selectOption({ label: th.employees.schedule.fractions[cd] })
    await expect(this.scheduleFraction(d)).toHaveValue(String(cd))
  }

  /** TextField type="search" → ARIA role searchbox. */
  searchBox(): Locator {
    return this.main().getByRole('searchbox', { name: exactName(th.employees.filters.search) })
  }
  async search(q: string): Promise<void> {
    await this.searchBox().fill(q)
  }
  async filterPosition(label: string): Promise<void> {
    await choose(this.main(), th.employees.filters.position, label)
  }
  async filterStatus(label: string): Promise<void> {
    await choose(this.main(), th.employees.filters.status, label)
  }
}

/** `/settings/positions` (plan/m01-auth-employees.md S3.11). */
export class PositionsPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings/positions')
    await expect(this.addButton()).toBeEnabled()
  }

  main(): Locator {
    return this.page.locator('main#main')
  }
  addButton(): Locator {
    return this.main().getByRole('button', { name: th.positions.add, exact: true })
  }
  /** Position rows: list items that carry the user-count chip. */
  rows(): Locator {
    return this.main().getByRole('listitem').filter({ hasText: userCountPattern() })
  }
  row(name: string): Locator {
    return this.rows().filter({ has: this.page.getByText(name, { exact: true }) })
  }

  /** Visible order of position names. */
  async names(): Promise<string[]> {
    const texts = await this.rows().allInnerTexts()
    return texts.map((t) => t.replace(userCountPattern(), '').replace(/\s+/g, ' ').trim())
  }

  async add(name: string): Promise<void> {
    await this.main().getByPlaceholder(th.positions.namePlaceholder).fill(name)
    const answered = waitForServerAction(this.page)
    await this.addButton().click()
    await answered
    await expect(this.row(name)).toBeVisible()
  }

  async rename(from: string, to: string): Promise<void> {
    const index = (await this.names()).indexOf(from)
    expect(index, `position ${from}`).toBeGreaterThanOrEqual(0)
    // by index: while editing, the name text is replaced by the inline TextField
    const row = this.rows().nth(index)
    await row.getByRole('button', { name: th.positions.rename }).click()
    const input = row.getByRole('textbox')
    await input.fill(to)
    const answered = waitForServerAction(this.page)
    await input.press('Enter')
    await answered
    await expect(this.row(to)).toBeVisible()
  }

  async moveUp(name: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.row(name).getByRole('button', { name: th.common.moveUp }).click()
    await answered
  }

  async delete(name: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.row(name).getByRole('button', { name: th.common.delete }).click()
    await answered
  }
}

/** th.positions.userCount(n) for any n, e.g. "3 คน". */
function userCountPattern(): RegExp {
  const sample = th.positions.userCount(7)
  const [before, after] = sample.split('7') as [string, string]
  return new RegExp(`${escapeRegExp(before)}\\d+${escapeRegExp(after)}`)
}
