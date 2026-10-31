import { expect, type Locator, type Page } from '@playwright/test'
import { sortedProjectTabs } from '../../src/components/projects/project-tabs'
import { th } from '../../src/i18n/th'
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
    return this.nav().locator('[data-testid^="sidebar-project-"]').getByRole('link').filter({ hasNotText: TAB_LABEL })
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
