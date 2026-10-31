import { expect, type Locator, type Page } from '@playwright/test'
import type { ProjectRole } from '../../src/domain/types'
import { th } from '../../src/i18n/th'
import { waitForServerAction } from '../fixtures'
import { ShellPage } from './shell'
import { PageTreePanel } from './page-tree'
import { StatusSettingsPage } from './status-settings'
import { exactName } from './text'
import { toastWith } from './toast'

export type ProjectTab = 'overview' | 'tasks' | 'pages' // M4 เอกสาร (X15, X84); M6 adds 'plan'

/**
 * Project shell + ภาพรวม tab (FR-408, FR-409 part; plan/m02-clients-projects-authz.md S2.3–S2.5 / S3.5).
 * DOM contract requested from S2: `data-testid="project-header"` on ProjectHeaderBar, `data-testid="members-panel"`
 * on MembersPanel and `data-testid="member-row-<userId>"` per member row. Everything else by role + th strings.
 */
export class ProjectPage {
  readonly shell: ShellPage
  /** M3: ภาพรวม › สถานะงาน. */
  readonly statuses: StatusSettingsPage

  constructor(readonly page: Page) {
    this.shell = new ShellPage(page)
    this.statuses = new StatusSettingsPage(page)
  }

  async goto(projectId: string, tab: ProjectTab = 'overview'): Promise<void> {
    await this.shell.goto(`/projects/${projectId}/${tab}`)
  }

  tab(tab: ProjectTab): Locator {
    return this.tabList().getByRole('tab', { name: th.projects.tabs[tab], exact: true })
  }
  /** Client-side tab switch (keeps the undo stack and toasts of the tab, unlike goto). */
  async openTab(tab: ProjectTab): Promise<void> {
    await this.tab(tab).click()
    await this.page.waitForURL((u) => u.pathname.endsWith(`/${tab}`))
    await expect(this.tab(tab)).toHaveAttribute('aria-selected', 'true')
  }
  // --- M4: เอกสาร tab (FR-408, X15) ---------------------------------------------------------------------------
  /** The project's page tree inside the tab (same PageTree component as the sidebar, M4-D27/X81). */
  pagesTree(projectName: string): PageTreePanel {
    return new PageTreePanel(this.page, th.pages.tree.projectLabel(projectName), this.main())
  }
  newPageButton(): Locator {
    return this.main().getByRole('button', { name: th.pages.projectTab.newPage, exact: true })
  }

  /** FR-409 "เสร็จ X/Y งาน" (M3-D21). */
  progress(): Locator {
    return this.page.getByTestId('project-progress')
  }

  main(): Locator {
    return this.shell.main()
  }
  header(): Locator {
    return this.page.getByTestId('project-header')
  }
  headerTentativeMark(): Locator {
    return this.header().getByRole('img', { name: th.projects.certainty.TENTATIVE })
  }
  tabList(): Locator {
    return this.page.getByRole('tablist', { name: th.projects.tabsLabel })
  }
  tabs(): Locator {
    return this.tabList().getByRole('tab')
  }
  archivedBanner(): Locator {
    return this.main().getByText(th.projects.archivedBanner, { exact: true })
  }
  noLeadWarning(): Locator {
    return this.main().getByText(th.projects.overview.noLead, { exact: true })
  }
  editButton(): Locator {
    return this.main().getByRole('button', { name: th.projects.edit, exact: true })
  }

  // --- certainty (FR-405) -------------------------------------------------------------------------------------
  certaintyOption(c: 'CONFIRMED' | 'TENTATIVE'): Locator {
    return this.main().getByRole('button', { name: th.projects.certainty[c], exact: true })
  }
  async setCertainty(c: 'CONFIRMED' | 'TENTATIVE'): Promise<void> {
    const saved = waitForServerAction(this.page)
    await this.certaintyOption(c).click()
    await saved
    await expect(this.certaintyOption(c)).toHaveAttribute('aria-pressed', 'true')
  }

  // --- archive / delete (FR-406, FR-407) ----------------------------------------------------------------------
  archiveButton(): Locator {
    return this.main().getByRole('button', { name: th.projects.archive, exact: true })
  }
  unarchiveButton(): Locator {
    return this.main().getByRole('button', { name: th.projects.unarchive, exact: true })
  }
  deleteButton(): Locator {
    return this.main().getByRole('button', { name: th.projects.deletePermanently, exact: true })
  }
  deleteDialog(): Locator {
    return this.page.getByRole('dialog', { name: th.projects.deleteDialog.title })
  }
  deleteNameInput(): Locator {
    return this.deleteDialog().getByLabel(exactName(th.projects.deleteDialog.inputLabel))
  }
  deleteConfirmButton(): Locator {
    return this.deleteDialog().getByRole('button', { name: th.projects.deleteDialog.confirm, exact: true })
  }

  // --- members (FR-403, FR-404 part, BR-62) -------------------------------------------------------------------
  membersPanel(): Locator {
    return this.page.getByTestId('members-panel')
  }
  memberRows(): Locator {
    return this.membersPanel().locator('[data-testid^="member-row-"]')
  }
  memberRow(userId: string): Locator {
    return this.membersPanel().getByTestId(`member-row-${userId}`)
  }
  /** The role Select of a row (present only for M/L). */
  roleSelect(userId: string): Locator {
    return this.memberRow(userId).getByRole('combobox')
  }
  /** The text the row shows for its role (Select value or read-only chip). */
  async expectRole(userId: string, role: ProjectRole): Promise<void> {
    await expect(this.memberRow(userId)).toContainText(th.members.roles[role])
  }
  async setRole(userId: string, role: ProjectRole): Promise<void> {
    await this.roleSelect(userId).click()
    const answered = waitForServerAction(this.page)
    await this.page.getByRole('option', { name: th.members.roles[role], exact: true }).click()
    await answered
  }
  removeButton(displayName: string): Locator {
    return this.membersPanel().getByRole('button', { name: th.members.remove(displayName), exact: true })
  }
  async removeMember(displayName: string): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.removeButton(displayName).click()
    await answered
  }
  /** FR-404 / BR-61 (X16): the toast offered when the removed member still has assignments. */
  assignmentsBlockToast(n: number): Locator {
    return toastWith(this.page, th.members.assignmentsBlock.message(n))
  }
  async cancelRemoval(n: number): Promise<void> {
    await this.assignmentsBlockToast(n)
      .getByRole('button', { name: th.members.assignmentsBlock.cancelRemove, exact: true })
      .click()
    await expect(this.assignmentsBlockToast(n)).toHaveCount(0)
  }
  async unassignAllAndRemove(n: number): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.assignmentsBlockToast(n)
      .getByRole('button', { name: th.members.assignmentsBlock.unassignAll, exact: true })
      .click()
    await answered
  }

  /** The "เพิ่มสมาชิก" person picker input. */
  pickerInput(): Locator {
    return this.membersPanel().getByRole('combobox', { name: exactName(th.members.add) })
  }
  async typeInPicker(query: string): Promise<void> {
    await this.pickerInput().fill(query)
  }
  pickerOption(displayName: string): Locator {
    return this.page.getByRole('listbox').getByRole('option').filter({ hasText: displayName })
  }
  async addMember(displayName: string, query = displayName): Promise<void> {
    await this.typeInPicker(query)
    const answered = waitForServerAction(this.page)
    await this.pickerOption(displayName).first().click()
    await answered
  }
}

/** ProjectFormDialog (create: manager; edit: M/L) — FR-401, M2-D15. */
export class ProjectFormDialog {
  constructor(readonly page: Page) {}

  dialog(): Locator {
    return this.page.getByRole('dialog')
  }
  name(): Locator {
    return this.dialog().getByLabel(exactName(th.projects.fields.name))
  }
  certaintyNote(): Locator {
    return this.dialog().getByLabel(exactName(th.projects.fields.certaintyNote))
  }
  certainty(c: 'CONFIRMED' | 'TENTATIVE'): Locator {
    return this.dialog().getByRole('button', { name: th.projects.certainty[c], exact: true })
  }
  clientInput(): Locator {
    return this.dialog().getByRole('combobox', { name: exactName(th.projects.fields.client) })
  }
  leadInput(): Locator {
    return this.dialog().getByRole('combobox', { name: exactName(th.projects.fields.lead) })
  }
  /** Option texts of the open client picker. */
  clientOptions(): Locator {
    return this.page.getByRole('listbox').getByRole('option')
  }
  async pickClient(name: string): Promise<void> {
    await this.clientInput().click()
    await this.clientInput().fill(name)
    await this.clientOptions().filter({ hasText: name }).first().click()
  }
  async pickLead(displayName: string): Promise<void> {
    await this.leadInput().fill(displayName)
    await this.page.getByRole('listbox').getByRole('option').filter({ hasText: displayName }).first().click()
  }
  saveButton(): Locator {
    return this.dialog().getByRole('button', { name: th.projects.save, exact: true })
  }
  cancelButton(): Locator {
    return this.dialog().getByRole('button', { name: th.projects.cancel, exact: true })
  }
  async submit(): Promise<void> {
    const answered = waitForServerAction(this.page)
    await this.saveButton().click()
    await answered
  }
}
