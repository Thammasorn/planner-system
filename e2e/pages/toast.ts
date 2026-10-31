import type { Locator, Page } from '@playwright/test'
import { th } from '../../src/i18n/th'

/**
 * Sonner toasts (M0 ToasterHost). The browser clock is pinned (`setFixedTime`), so earlier toasts may still be on
 * screen; always address the toast by its text and click the undo button inside that toast.
 */
export function toastWith(page: Page, text: string): Locator {
  return page.locator('[data-sonner-toast]').filter({ hasText: text })
}

export function undoButtonOf(page: Page, text: string): Locator {
  return toastWith(page, text).getByRole('button', { name: th.undo.undo, exact: true })
}

/** Every toast currently on screen. */
export function allToasts(page: Page): Locator {
  return page.locator('[data-sonner-toast]')
}
