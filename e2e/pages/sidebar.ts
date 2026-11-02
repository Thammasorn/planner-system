import { expect, type Locator, type Page } from '@playwright/test'
import { sortedProjectTabs } from '../../src/components/projects/project-tabs'
import { th } from '../../src/i18n/th'
import { PageTreePanel } from './page-tree'
import { Palette } from './palette'
import { ShellPage } from './shell'
import { escapeRegExp } from './text'

/** Any project tab sub-link label (ภาพรวม, งาน, … — whatever PROJECT_TABS holds), matched as the whole text. */
const TAB_LABEL = new RegExp(`^(${sortedProjectTabs().map((t) => escapeRegExp(t.label)).join('|')})$`)

/**
 * Sidebar "โปรเจค" section (SPEC §8.1, plan/m02-clients-projects-authz.md S2.2 / S3.5). DOM contract (S2):
 * each project row is `data-testid="sidebar-project-<id>"` holding a link (project name → /projects/<id>/overview),
 * an expand toggle named th.sidebar.expand/collapse(name), the ◐ `img` named อาจไม่ทำ when TENTATIVE, and — when
 * expanded — the tab sub-links (ภาพรวม, งาน from M3). Header `+` = th.sidebar.newProject; footer link =
 * th.sidebar.archivedLink. M3 (X33, M3-D40): primary nav "งานของฉัน" (link named "<label> <count>" once the count
 * has loaded, count in `data-testid="nav-badge-my"`) and "งานของทีม".
 * M4 (M4-D27, plan/m04 S4.8/S4.10): "🔍 ค้นหา… ⌘K" at the top, each expanded project shows the sub-links
 * ภาพรวม · งาน · เอกสาร and then its page tree (`role="tree"` th.pages.tree.projectLabel(name)); the "Wiki ทีม" section
 * (heading th.sidebar.wikiHeading, `+` th.sidebar.newWikiPage, tree th.pages.tree.wikiLabel) follows the projects.
 * Page-tree links are never project rows (projectLinks excludes everything inside a tree).
 * M5 (X84): primary nav gains "ปฏิทินทีม" after งานของทีม (`calendarLink()`).
 */
export class SidebarPage {
  readonly shell: ShellPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
  }

  nav(): Locator {
    return this.shell.nav()
  }

  /** Project name links in display order (tab sub-links such as ภาพรวม / งาน excluded). */
  projectLinks(): Locator {
    return this.nav()
      .locator('[data-testid^="sidebar-project-"]')
      .getByRole('link')
      .and(this.page.locator('a:not([role="tree"] a)'))
      .filter({ hasNotText: TAB_LABEL })
  }

  /** Retrying assertion: the sidebar lists exactly these project names, in this order. */
  async expectProjects(names: readonly string[]): Promise<void> {
    await expect(this.projectLinks()).toHaveText([...names])
  }

  projectRow(projectId: string): Locator {
    return this.nav().getByTestId(`sidebar-project-${projectId}`)
  }

  projectLink(name: string): Locator {
    return this.nav().getByRole('link', { name, exact: true })
  }

  tentativeMark(projectId: string): Locator {
    return this.projectRow(projectId).getByRole('img', { name: th.projects.certainty.TENTATIVE })
  }

  expandToggle(name: string): Locator {
    return this.nav().getByRole('button', { name: th.sidebar.expand(name), exact: true })
  }

  collapseToggle(name: string): Locator {
    return this.nav().getByRole('button', { name: th.sidebar.collapse(name), exact: true })
  }

  async expandProject(name: string): Promise<void> {
    await this.expandToggle(name).click()
    await expect(this.collapseToggle(name)).toHaveAttribute('aria-expanded', 'true')
  }

  /** The ภาพรวม sub-link of an expanded project row. */
  overviewSubLink(projectId: string): Locator {
    return this.projectRow(projectId).getByRole('link', { name: th.projects.tabs.overview, exact: true })
  }

  /** The งาน sub-link of an expanded project row (M3, FR-408). */
  tasksSubLink(projectId: string): Locator {
    return this.projectRow(projectId).getByRole('link', { name: th.projects.tabs.tasks, exact: true })
  }

  /** The เอกสาร sub-link of an expanded project row (M4, FR-408 / X15). */
  pagesSubLink(projectId: string): Locator {
    return this.projectRow(projectId).getByRole('link', { name: th.projects.tabs.pages, exact: true })
  }

  // --- M4: search, Wiki ทีม, project page trees (M4-D27) ------------------------------------------------------
  /** Sidebar "🔍 ค้นหา… ⌘K" — opens the command palette. */
  searchButton(): Locator {
    return new Palette(this.page).searchButton()
  }
  wikiHeading(): Locator {
    return this.nav().getByText(th.sidebar.wikiHeading, { exact: true })
  }
  wiki(): PageTreePanel {
    return new PageTreePanel(this.page, th.pages.tree.wikiLabel, this.nav())
  }
  newWikiPageButton(): Locator {
    return this.nav().getByRole('button', { name: th.sidebar.newWikiPage, exact: true })
  }
  /** Sidebar `+` of Wiki ทีม → a blank page opens at /p/<new id>. */
  async newWikiPage(): Promise<void> {
    const before = this.page.url()
    await this.newWikiPageButton().click()
    await this.page.waitForURL((u) => /^\/p\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== before)
  }
  projectTree(name: string): PageTreePanel {
    return new PageTreePanel(this.page, th.pages.tree.projectLabel(name), this.nav())
  }
  newProjectPageButton(name: string): Locator {
    return this.nav().getByRole('button', { name: th.sidebar.newProjectPage(name), exact: true })
  }
  async newProjectPage(name: string): Promise<void> {
    const before = this.page.url()
    await this.newProjectPageButton(name).click()
    await this.page.waitForURL((u) => /^\/p\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== before)
  }

  /** "งานของฉัน" (with or without its count in the accessible name). */
  myTasksLink(): Locator {
    return this.nav().getByRole('link', { name: new RegExp(`^${escapeRegExp(th.nav.my)}( \\d+)?$`) })
  }

  /** The count shown after "งานของฉัน" (text, never a coloured dot — SPEC §8.9). */
  myTaskCount(): Locator {
    return this.nav().getByTestId('nav-badge-my')
  }

  teamTasksLink(): Locator {
    return this.shell.navLink(th.nav.teamTasks)
  }

  /** M5 (X84): "ปฏิทินทีม" → /calendar, appended after งานของทีม for every role. */
  calendarLink(): Locator {
    return this.shell.navLink(th.nav.calendar)
  }

  /**
   * M9 (X84, M9-D11): "Workload ทีม" → /workload, after งานของทีม. Its accessible name gains
   * th.workload.badge.label(n) while the badge shows, so the link is found by its stable `data-nav-id`.
   */
  workloadLink(): Locator {
    return this.nav().locator('a[data-nav-id="workload"]')
  }
  /** The ●N badge of Workload ทีม (`role=img` named th.workload.badge.label(n); absent at 0). */
  workloadBadge(): Locator {
    return this.workloadLink().getByTestId('workload-badge')
  }
  /** M9 (X33, M4-D27): "ทีมงาน" → /people, directly before ลูกค้า. */
  peopleLink(): Locator {
    return this.shell.navLink(th.nav.people)
  }
  /** The `data-nav-id`s of the primary + bottom nav rows in DOM order (the projects section header excluded). */
  async navIds(): Promise<string[]> {
    const ids = await this.nav()
      .locator('a[data-nav-id]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-nav-id') ?? ''))
    return ids.filter((id) => id !== 'projects')
  }

  newProjectButton(): Locator {
    return this.nav().getByRole('button', { name: th.sidebar.newProject, exact: true })
  }

  archivedLink(): Locator {
    return this.nav().getByRole('link', { name: th.sidebar.archivedLink, exact: true })
  }

  /** The "โปรเจค" section header (→ /projects) and the "ลูกค้า" nav item (→ /clients), X33. */
  projectsHeaderLink(): Locator {
    return this.shell.navLink(th.nav.projects)
  }

  clientsLink(): Locator {
    return this.shell.navLink(th.nav.clients)
  }
}
