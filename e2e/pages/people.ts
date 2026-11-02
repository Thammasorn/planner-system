import { expect, type Locator, type Page } from '@playwright/test'
import { th } from '../../src/i18n/th'
import { GridPage } from './grid'
import { ShellPage } from './shell'
import { TaskListPage } from './tasks'

export type PersonTab = 'plan' | 'tasks' | 'leave'

/**
 * The person grid (plan/m09 S6.1, M9-D12/D28): M6's GridPage bound to role=grid named th.people.grid.label(name).
 * Row keys: `p:<projectId>` project rows (`data-row-kind="project"`, name link → /projects/<id>/plan), `a:…` merged
 * task rows named '<task> · <person>', `m:<userId>` the one masked row (th.masking.otherProjects, no link); cells keep
 * the M6 test ids (`cell-<rowKey>-W:<Monday>`), the footer is `cell-footer-load-W:<Monday>` (ภาระรวม (ทุกโปรเจค)).
 * Every GridPage locator goes through `root()`, so rowKeyOf / cell / reveal / footerLoad / typeInto / waitSaved are
 * reused as they are (C27: no absolute aria-rowindex — the ◆ row shifts it).
 */
export class PersonGridPage extends GridPage {
  constructor(
    page: Page,
    readonly personName: string,
  ) {
    super(page)
  }

  override root(): Locator {
    return this.page.getByRole('grid', { name: th.people.grid.label(this.personName) })
  }

  /** The grid has rendered its first row and every edit is saved. */
  async waitPersonReady(): Promise<void> {
    await expect(this.root()).toBeVisible()
    await expect(this.root().locator('[data-row-key]').first()).toBeVisible()
    await this.shell.waitForHydration()
    await this.waitSaved()
  }

  projectRows(): Locator {
    return this.root().locator('[role="rowheader"][data-row-kind="project"]')
  }
  maskedRows(): Locator {
    return this.root().locator('[role="rowheader"][data-row-kind="masked"]')
  }
  /** The 🔴/⚠ glyph of a footer week cell (its text alternative is hidden text inside the same cell). */
  footerGlyph(week: string): Locator {
    return this.footerLoad(`W:${week}`).locator('[data-glyph]')
  }
}

/**
 * `/people/[id]/{plan,tasks,leave}` (FR-1008, M9-D14; plan/m09 S6.1). DOM contract (S4): header bar crumb
 * ทีมงาน › <name> (the name is the <h1>), facts line `data-testid="person-header"` with `person-position` and
 * `person-schedule`; link-tabs (tablist th.people.tabs.label) แผนงาน · งาน · วันลา; the plan tab wraps the grid in
 * `data-testid="person-plan"`. Invisible / unknown / malformed ids answer HTTP 404 with the not-found screen.
 */
export class PersonPage {
  readonly shell: ShellPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
  }

  /** page.goto the tab; returns the HTTP status (404 checks). Waits for hydration only on a 200. */
  async goto(userId: string, tab: PersonTab = 'plan', q = ''): Promise<{ status: number }> {
    const res = await this.page.goto(`/people/${userId}/${tab}${q}`)
    const status = res?.status() ?? 0
    if (status === 200) await this.shell.waitForHydration()
    return { status }
  }

  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 })
  }
  header(): Locator {
    return this.page.getByTestId('person-header')
  }
  position(): Locator {
    return this.page.getByTestId('person-position')
  }
  schedule(): Locator {
    return this.page.getByTestId('person-schedule')
  }
  tabs(): Locator {
    return this.page.getByRole('tablist', { name: th.people.tabs.label })
  }
  tab(name: PersonTab): Locator {
    return this.tabs().getByRole('tab', { name: th.people.tabs[name], exact: true })
  }
  notFound(): Locator {
    return this.page.getByText(th.errors.notFoundPage.title, { exact: true })
  }

  /** The person grid of `personName` (the plan tab). */
  grid(personName: string): PersonGridPage {
    return new PersonGridPage(this.page, personName)
  }
  maskedRow(userId: string): Locator {
    return this.page.locator(`[role="rowheader"][data-row-key="m:${userId}"]`)
  }
  projectRow(projectId: string): Locator {
    return this.page.locator(`[role="rowheader"][data-row-key="p:${projectId}"]`)
  }

  // ── งาน tab (M3 TeamTasks fixed to the person, M9-D15) ────────────────────────────────────────────────────
  tasksHint(): Locator {
    return this.page.getByTestId('team-tasks-hint')
  }
  tasksEmpty(): Locator {
    return this.shell.main().getByText(th.people.tasks.empty, { exact: true })
  }
  /** Task-name links of the list view (↗ page links and the header breadcrumb ทีมงาน › name excluded). */
  taskLinks(): Locator {
    return this.shell
      .main()
      .getByRole('listitem')
      .locator('a[href]:not([data-open-page])')
      .and(this.shell.main().locator('a:not(nav a)'))
  }
  board(): TaskListPage {
    return new TaskListPage(this.page)
  }
  /** The list or the board or the empty state has rendered. */
  async waitTasksReady(): Promise<void> {
    await expect(this.taskLinks().first().or(this.board().board()).or(this.tasksEmpty())).toBeVisible()
  }

  // ── วันลา tab (M9-D16) ────────────────────────────────────────────────────────────────────────────────────
  leaveSection(which: 'upcoming' | 'past'): Locator {
    return this.shell.main().getByRole('region', { name: th.people.leave[which], exact: true })
  }
  leaveEntries(which: 'upcoming' | 'past'): Locator {
    return this.leaveSection(which).getByRole('listitem')
  }
  addLeaveButton(): Locator {
    return this.shell.main().getByRole('button', { name: th.people.leave.add, exact: true })
  }
  editLeaveButton(range: string): Locator {
    return this.shell.main().getByRole('button', { name: th.people.leave.edit(range), exact: true })
  }
}
