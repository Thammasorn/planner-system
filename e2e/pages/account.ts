import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { exactName } from './text'

/** `/account/password` — own password + sign out everywhere (plan/m01-auth-employees.md S3.3). */
export class AccountPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/account/password')
    await expect(this.submitButton()).toBeEnabled()
  }

  mustChangeBanner(): Locator {
    return this.page.getByText(th.account.mustChangeBanner, { exact: true })
  }
  currentPassword(): Locator {
    return this.page.getByLabel(exactName(th.account.currentPassword))
  }
  newPassword(): Locator {
    return this.page.getByLabel(exactName(th.account.newPassword))
  }
  confirmPassword(): Locator {
    return this.page.getByLabel(exactName(th.account.confirmPassword))
  }
  submitButton(): Locator {
    return this.page.getByRole('button', { name: th.account.submit, exact: true })
  }

  /** Fills the three fields and submits. Client-side validation errors may stop it before any server call. */
  async changePassword(current: string, next: string, confirm: string = next): Promise<void> {
    await this.currentPassword().fill(current)
    await this.newPassword().fill(next)
    await this.confirmPassword().fill(confirm)
    await this.submitButton().click()
  }

  /** Submits and waits for the server action's answer (use when the client-side checks pass). */
  async changePasswordOnServer(current: string, next: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.changePassword(current, next)
    await answered
  }

  async signOutEverywhere(): Promise<void> {
    await this.page.getByRole('button', { name: th.account.signOutEverywhere, exact: true }).click()
  }
}
