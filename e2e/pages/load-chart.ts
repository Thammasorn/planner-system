import { expect, type Locator, type Page } from '@playwright/test'
import type { ISODate } from '../../src/domain/types'
import { th } from '../../src/i18n/th'

/**
 * "กราฟภาระ" pane under the plan grid (plan/m07.1 S4.4, S6; FR-813). DOM contract (S4): `load-chart-panel` (section
 * named th.loadChart.title) with the "รวมงานโปรเจคอื่น" switch, the "ดูเป็นตาราง" / "ดูเป็นกราฟ" toggle
 * (aria-pressed), a legend list named th.loadChart.legend (one button per person, `data-user`), the lazy chart
 * `load-line-chart`, and the table `load-table` whose rows are `tr[data-user=<userId>]` and cells `td[data-week]`
 * with th.loadChart.daysValue(load, cap) (+ 🔴 / ⚠ and the alert text for screen readers).
 */
export class LoadChartPage {
  constructor(readonly page: Page) {}

  panel(): Locator {
    return this.page.getByTestId('load-chart-panel')
  }
  includeOthersSwitch(): Locator {
    return this.panel().getByRole('switch', { name: th.loadChart.includeOthers })
  }
  async includeOthers(on: boolean): Promise<void> {
    const sw = this.includeOthersSwitch()
    if ((await sw.isChecked()) !== on) await sw.click()
    await expect(sw).toBeChecked({ checked: on })
  }
  legend(): Locator {
    return this.panel().getByRole('list', { name: th.loadChart.legend })
  }
  /** Person names in the legend, in order. */
  async legendNames(): Promise<string[]> {
    return this.legend()
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
  }
  lineChart(): Locator {
    return this.page.getByTestId('load-line-chart')
  }
  tableToggle(): Locator {
    return this.panel().getByTestId('load-chart-table-toggle')
  }
  async showTable(on: boolean): Promise<void> {
    const t = this.tableToggle()
    if ((await t.getAttribute('aria-pressed')) !== String(on)) await t.click()
    await expect(t).toHaveAttribute('aria-pressed', String(on))
    await expect(t).toHaveText(on ? th.loadChart.chart : th.loadChart.table)
    if (on) await expect(this.table()).toBeVisible()
    else await expect(this.table()).toHaveCount(0)
  }
  table(): Locator {
    return this.page.getByTestId('load-table')
  }
  /** One person × week cell of the table. */
  cell(userId: string, week: ISODate): Locator {
    return this.table().locator(`tr[data-user="${userId}"] td[data-week="${week}"]`)
  }
  /** Names of the table rows, in order. */
  async tableNames(): Promise<string[]> {
    return this.table()
      .locator('tbody th[scope="row"]')
      .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
  }
}
