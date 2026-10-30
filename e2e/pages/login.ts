import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { exactName } from './text'

/** `/login` (plan/m01-auth-employees.md S3.2). The only place specs touch the login form. */
export class LoginPage {
  constructor(readonly page: Page) {}

  async goto(next?: string): Promise<void> {
    await this.page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
    await expect(this.submitButton()).toBeEnabled()
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: th.auth.loginTitle })
  }
  email(): Locator {
    return this.page.getByLabel(exactName(th.auth.email))
  }
  password(): Locator {
    return this.page.getByLabel(exactName(th.auth.password))
  }
  submitButton(): Locator {
    return this.page.getByRole('button', { name: th.auth.submit, exact: true })
  }

  /** Fills and submits; resolves once the login server action answered (success navigates away). */
  async login(email: string, password: string): Promise<void> {
    await this.email().fill(email)
    await this.password().fill(password)
    const answered = waitForServerAction(this.page)
    await this.submitButton().click()
    await answered
  }

  /**
   * The form's error alert with this text. Filtered by text because Next's route announcer is also role="alert".
   */
  error(text: string): Locator {
    return this.page.getByRole('alert').filter({ hasText: text })
  }
}
