import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { ShellPage } from './shell'
import { TaskListPage, type TaskView } from './tasks'

/**
 * `/tasks` งานของทีม (FR-665/666, X75, M3-D33; plan/m03-tasks.md S3.19 / S5.1). DOM contract from S3: filters are
 * labelled controls (person picker, project/position/category selects, switches), the list is one section per
 * project (named by the project) with one link per task, the board is the shared TaskBoard with the 4 category
 * columns. Board helpers are reused from TaskListPage.
 */
export class TeamTasksPage {
  readonly shell: ShellPage
  readonly board: TaskListPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
    this.board = new TaskListPage(page)
  }

  async goto(search = ''): Promise<void> {
    await this.shell.goto(`/tasks${search}`)
    await this.waitReady()
  }

  async waitReady(): Promise<void> {
    await expect(this.heading()).toBeVisible()
    await expect(this.taskLinks().first().or(this.board.board()).or(this.emptyState())).toBeVisible()
  }

  heading(): Locator {
    return this.page.getByRole('heading', { level: 1, name: th.teamTasks.title })
  }
  emptyState(): Locator {
    return this.shell.main().getByText(th.teamTasks.empty, { exact: true })
  }
  /** Project sections of the list view, named by project. */
  projectSection(name: string): Locator {
    return this.shell.main().getByRole('region', { name, exact: true })
  }
  /**
   * One link per task in the list view (→ /projects/<id>/tasks?task=<id>). Since M6.1 every item also has the ↗ page
   * link (`data-open-page`, named th.tasks.openAsPage), which is not a task-name link.
   */
  taskLinks(): Locator {
    return this.shell.main().getByRole('listitem').locator('a[href]:not([data-open-page])')
  }
  /** The list item of `name` (its row: ☐, name link, 📄, ↗, meta line). */
  item(name: string): Locator {
    return this.shell
      .main()
      .getByRole('listitem')
      .filter({ has: this.page.getByRole('link', { name, exact: true }) })
  }
  openAsPageLink(name: string): Locator {
    return this.item(name).getByRole('link', { name: th.tasks.openAsPage, exact: true })
  }
  hasBodyMarker(name: string): Locator {
    return this.item(name).getByRole('img', { name: th.tasks.hasBody, exact: true })
  }
  taskLink(name: string): Locator {
    return this.shell.main().getByRole('listitem').getByRole('link', { name, exact: true })
  }

  /** ลิสต์/บอร์ด (shares the `tasks.view` preference with the project tab, X74); waits for the save. */
  async setView(view: TaskView): Promise<void> {
    const saved = waitForServerAction(this.page)
    await this.board.viewButton(view).click()
    await saved
    await expect(this.board.viewButton(view)).toHaveAttribute('aria-pressed', 'true')
    await expect(view === 'board' ? this.board.board() : this.taskLinks().first()).toBeVisible()
  }

  /** Task names of the list view (all project sections, in display order). */
  async linkNames(): Promise<string[]> {
    return this.taskLinks().allTextContents()
  }

  projectFilter(): Locator {
    return this.shell.main().getByRole('combobox', { name: th.teamTasks.filters.project })
  }
  async filterProject(name: string): Promise<void> {
    await this.projectFilter().click()
    await this.page.getByRole('listbox').getByRole('option', { name, exact: true }).click()
    await expect(this.projectFilter()).toHaveText(name)
  }
}
