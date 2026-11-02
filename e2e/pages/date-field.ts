import { expect, type Locator } from '@playwright/test'
import type { ISODate } from '../../src/domain/types'

/**
 * The shared `DateField` (MUI X DatePicker + AdapterDayjsBuddhist, X50) inside any scope (dialog, popover, form). DOM
 * contract (M3/M5): the field is a `group` named by its label holding three `spinbutton` sections DD / MM / BBBB; the
 * value is mirrored in the hidden `<input>` under `.MuiPickersTextField-root`. Dates are ISO in tests (plan/m08 S6.1).
 */

/** ISO → what the field shows, e.g. '2026-10-19' → "19/10/2569". */
export function pickerText(iso: ISODate): string {
  const [y, m, d] = iso.split('-') as [string, string, string]
  return `${d}/${m}/${Number(y) + 543}`
}

/** MUI X may wrap section text in bidi isolation marks; compare the plain digits. */
const stripBidi = (s: string): string => s.replace(/[‎‏⁦-⁩]/g, '')

function sections(scope: Locator, label: string): Locator {
  return scope.getByRole('group', { name: label }).getByRole('spinbutton')
}

/**
 * Types `iso` into the field labelled `label`: month, Buddhist-era year, then day — each step stays a valid date when
 * the field already holds one (a pre-filled cell date), and the last section completes it when it was empty.
 */
export async function fillDate(scope: Locator, label: string, iso: ISODate): Promise<void> {
  const [y, m, d] = iso.split('-') as [string, string, string]
  const parts = sections(scope, label)
  await expect(parts).toHaveCount(3)
  const page = scope.page()
  await parts.nth(1).click()
  await page.keyboard.type(m)
  await parts.nth(2).click()
  await page.keyboard.type(String(Number(y) + 543))
  await parts.nth(0).click()
  await page.keyboard.type(d)
  await expectDate(scope, label, iso)
}

/** Retrying assertion: the field labelled `label` shows `iso` (DD/MM/BBBB). */
export async function expectDate(scope: Locator, label: string, iso: ISODate): Promise<void> {
  const input = scope
    .locator('.MuiPickersTextField-root')
    .filter({ has: scope.page().getByText(label, { exact: true }) })
    .locator('input')
  await expect.poll(async () => stripBidi(await input.inputValue())).toBe(pickerText(iso))
}
