import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { formatThaiDate } from '../../src/lib/format'
import { waitForServerAction } from '../fixtures'
import { escapeRegExp } from './text'

/** th.tasks.board.column(name, n) for any n (columns are named "<status> (<n> งาน)"). */
function columnPattern(name: string): RegExp {
  const sample = th.tasks.board.column('\u0000', 7)
  const [before, rest] = sample.split('\u0000') as [string, string]
  const [mid, after] = rest.split('7') as [string, string]
  return new RegExp(
    `^${escapeRegExp(before)}${escapeRegExp(name)}${escapeRegExp(mid)}\\d+${escapeRegExp(after)}$`,
  )
}

/**
 * The live data blocks inside a page editor (plan/m10 S4.3; FR-1301…1304, M10-D7/D8). DOM contract (S3): every block
 * root carries `data-live-block` (the shared LiveBlockFrame) with its title text (th.editor.liveBlocks.taskViewTitle /
 * workloadTitle); the embedded board reuses M3's TaskBoard (columns `role="group"` named th.tasks.board.column, cards
 * `role="article"`, drag handle th.tasks.board.cardDragHandle); the workload table reuses M9's cells (cell accessible
 * name th.workload.cell.label — M9's WorkloadCell, week as formatThaiDate). R17: golden charters already hold one block of each kind, so tests
 * address the block they inserted with `.last()`.
 */
export class LiveBlocks {
  constructor(readonly page: Page) {}

  all(): Locator {
    return this.page.locator('[data-live-block]')
  }
  taskViews(): Locator {
    return this.all().filter({
      has: this.page.getByText(th.editor.liveBlocks.taskViewTitle, { exact: true }),
    })
  }
  workloads(): Locator {
    return this.all().filter({
      has: this.page.getByText(th.editor.liveBlocks.workloadTitle, { exact: true }),
    })
  }

  // ── taskView (board) ──
  column(block: Locator, statusName: string): Locator {
    return block.getByRole('group', { name: columnPattern(statusName) })
  }
  card(block: Locator, name: string): Locator {
    return block.getByRole('article', { name, exact: true })
  }
  /**
   * Drags a card by its handle into the column `toStatus` (dnd-kit pointer drag, M3 pattern) and waits for the save.
   * The embedded board scrolls sideways inside the page column, and dnd-kit auto-scrolls it while the pointer is near
   * its edges (20 % of its width), so the drop point is re-measured on the way and kept in the board's middle part.
   */
  async dragCard(block: Locator, name: string, toStatus: string): Promise<void> {
    const page = this.page
    const handle = block.getByRole('button', { name: th.tasks.board.cardDragHandle(name), exact: true })
    const target = this.column(block, toStatus)
    const board = block.getByRole('region', { name: th.tasks.board.label, exact: true })
    await handle.scrollIntoViewIfNeeded()
    await handle.hover({ trial: true }) // stable box: a previous drop may still be animating
    const h = await handle.boundingBox()
    if (!h) throw new Error(`dragCard(${name} → ${toStatus}): no handle box`)
    const dropPoint = async () => {
      const [t, b] = await Promise.all([target.boundingBox(), board.boundingBox()])
      if (!t || !b) throw new Error(`dragCard(${name} → ${toStatus}): no boxes`)
      const lo = Math.max(t.x + 12, b.x + b.width * 0.25)
      const hi = Math.min(t.x + t.width - 12, b.x + b.width * 0.75)
      const x = lo <= hi ? (lo + hi) / 2 : t.x + t.width / 2
      return { x, y: t.y + Math.min(t.height / 2, 60) }
    }
    const start = { x: h.x + h.width / 2, y: h.y + h.height / 2 }
    const answered = waitForServerAction(page)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 6, start.y, { steps: 8 }) // past the 4 px activation distance
    let drop = await dropPoint()
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(drop.x, drop.y, { steps: 8 })
      drop = await dropPoint() // the board may have auto-scrolled under the pointer
    }
    await page.mouse.move(drop.x, drop.y, { steps: 2 }) // one more event so dnd-kit recomputes `over`
    await page.mouse.up()
    await answered
  }

  /** The FR-1304 placeholder of a live block in a wiki page. */
  wikiPlaceholder(block: Locator): Locator {
    return block.getByText(th.editor.liveBlocks.wikiOnly, { exact: true })
  }

  // ── projectWorkload ──
  /** Body rows of the workload table (one per member). */
  rows(block: Locator): Locator {
    return block.getByRole('row').filter({ has: this.page.getByRole('cell') })
  }
  row(block: Locator, person: string): Locator {
    return this.rows(block).filter({ has: this.page.getByRole('rowheader', { name: person, exact: true }) })
  }
  /** A person × week cell (`week` = its Monday) by its accessible name prefix (M9's th.workload.cell.label). */
  cell(block: Locator, person: string, week: string): Locator {
    const prefix = th.workload.cell
      .label(person, formatThaiDate(week), '\u0000', '\u0000', '')
      .split('\u0000')[0]!
    return block.getByRole('cell', { name: new RegExp(`^${escapeRegExp(prefix)}`) })
  }

  async waitLoaded(block: Locator): Promise<void> {
    await expect(block).toBeVisible()
    await expect(block.getByText(th.editor.liveBlocks.loading, { exact: true })).toHaveCount(0)
  }
}
