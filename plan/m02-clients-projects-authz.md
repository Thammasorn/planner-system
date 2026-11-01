# M2 — Clients, projects, members, permissions

> Depends on: M1 ✅ · SPEC: §3 (all), §4.3, §4.4 (−FR-402 → M4, −FR-409 load → M9, −FR-303 load → M9), §5.8, §6.2 (clients, projects, project_members), §6.4 (trigram indexes), §8.1 (sidebar projects), §11.2, §12 M2 ·
> Owner-visible result: managers create clients and projects, managers and LEADs manage members, and every worker sees only the projects they belong to — any other project or client URL answers **404** with a Thai "not found" page.

---

## 1. Goal and scope

Deliver the permission backbone of the product: `clients`, `projects`, `project_members`, the project-level
authorization API in `src/server/authz.ts` (`projectAccess`, `requireProject`, `requireClient` and the §3.3
visibility helpers), the masking skeleton, the real sidebar project list, `/projects`, the project shell with
its **ภาพรวม** tab, `/clients` and `/clients/[id]`, and the table-driven authz rows for every client / project /
member line of SPEC §3.2.

### 1.1 In scope

| ID | Requirement (short) | Implemented in | Tested by |
|---|---|---|---|
| FR-301 | Client CRUD: name (unique), code, colour, note (create / edit; "delete" = archive, M2-D07) | S0.3 schema · S1.4 `services/clients.ts` + `actions/clients.ts` · S2.6 `/clients`, `ClientFormDialog` | `src/server/services/clients.int.test.ts` · rows `PERM-03a..c` · e2e E3 |
| FR-302 | Archive / unarchive client → hidden from project pickers; its projects unaffected | S1.4 `archiveClient`/`unarchiveClient`, `listClientOptions` excludes archived · S2.6 undo toast | `clients.int.test.ts › archive` · row `PERM-03c/d` · e2e E3 |
| FR-303 (part) | Client page = list of the client's projects the viewer can see (**no load**, X15) | S1.4 `getClientDetail` · S2.6 `/clients/[id]` | `clients.int.test.ts › detail` · rows `PERM-04b..d` · e2e E1, E3 |
| FR-401 | Manager creates project: name, client (optional), code, colour, certainty (default CONFIRMED), certainty note, LEAD (optional, X61) | S1.5 `createProject` · S2.4 `ProjectFormDialog` (sidebar `+`, `/projects` button) | `projects.int.test.ts › create` · row `PERM-05` · e2e E2 |
| FR-403 | Members: add from picker (search name / nickname / position), change LEAD/MEMBER, remove | S1.6 `actions/members.ts` · S2.5 `MembersPanel` + `PersonPicker` | `members.int.test.ts` · rows `PERM-08a..f` · e2e E4 |
| FR-404 (part) | `removeMember` returns `blockedByAssignments: 0`; removal + undo (X16). Count + two-option toast → M3 | S1.6 `removeMember` · S2.5 undo toast | `members.int.test.ts › remove` · e2e E4 |
| FR-405 (part) | Certainty change: action calls `refresh()`; client calls `invalidateLoad(qc)` + `invalidateProjects(qc)`; overview badge and sidebar ◐ update without reload (X18) | S0.7 `query-keys.ts`/`invalidate.ts` · S1.5 `updateProject` · S2.3/S2.5 `CertaintyToggle` | `projects.int.test.ts › certainty` (refresh mock) · `invalidate.test.ts` · e2e E5 |
| FR-406 (part) | Archive / unarchive project immediately with undo toast, no confirm; X person-days → M6 (X17) | S1.5 `archiveProject`/`unarchiveProject` · S2.5 `ArchiveProjectButton` | `projects.int.test.ts › archive` · rows `PERM-09a/b` · e2e E6 |
| FR-407 | Permanent delete: manager only, type the project name; one tx (cascade + audit), file unlink after commit (hook; M4 fills keys, X26) | S1.5 `deleteProjectPermanently` · S2.5 `DeleteProjectDialog` (the only confirm dialog) | `projects.int.test.ts › delete` · rows `PERM-10a/b` · `DeleteProjectDialog.test.tsx` · e2e E7 |
| FR-408 (part) | Project page tab bar from a config; only **ภาพรวม** exists in M2 (X15) | S2.3 `project-tabs.ts`, `ProjectTabs` | `ProjectTabs.test.tsx` · e2e E8 |
| FR-409 (part) | Overview: project info + members with role chips + "ยังไม่มี LEAD" warning (no load, no progress, no milestones) | S1.5 `getProjectOverview` · S2.5 overview page | `projects.int.test.ts › overview` · e2e E2, E4 |
| FR-1201 (part) | Audit every client / project / member mutation in the same tx (X44) | S1.4–S1.6 actions | matrix audit assertion on every `mutates` allow row |
| BR-60 (context) | Invariant "assignee ⇒ member": golden seed derives MEMBER rows from task assignees (X11). Auto-invite itself → M3 | S1.7 `seedClientsProjects` | `tests/authz/golden-visibility.int.test.ts` |
| BR-61 (part) | Removal path exists; the "unassign first" check → M3 (X16) | S1.6 | `members.int.test.ts` (`blockedByAssignments === 0`) |
| BR-62 | ≥ 1 LEAD: a worker LEAD cannot demote/remove the last LEAD (`CONFLICT`); a manager can, with a warning (X61) | S1.6 `assertLeadGuard` + `FOR UPDATE` lock | `members.int.test.ts › BR-62` (incl. race) · row `PERM-08e/f` · e2e E4 |
| AC-203 (M2 clause, X12) | Deactivated users are absent from the member picker (still listed as existing members with "(ปิดใช้งาน)") | S1.3 `people.active` · S2.5 `PersonPicker` | `people.int.test.ts` · `PersonPicker.test.tsx` · e2e E4 |
| §12 M2 e2e | Worker does not see non-member projects (list + sidebar) and direct URL = **404** | S1.2 authz · S2.2/S2.3 · S2.7 not-found pages | e2e E1 · golden-visibility test |
| UI-01/UI-03 (§8.1, part) | Sidebar "โปรเจค" section: visible non-archived projects sorted by `Intl.Collator('th')`, ◐ with aria-label, `+` (manager), sub-link ภาพรวม, link "ดูโปรเจคที่ archive" | S1.3 `GET /api/sidebar` · S2.2 `SidebarProjects` | `sidebar.int.test.ts` · `SidebarProjects.test.tsx` · e2e E1, E6 |
| UI-02 (part) · DM-05 key | Remember expand/collapse of each project node (preference `sidebar.expanded` in M1's `user_preferences`, never localStorage) | S0.9 preference key · S2.2 | `SidebarProjects.test.tsx` · e2e E9 |
| §3.3 / MASK-7 / X30 | `visibleProjectIds`, `visibleUserIds`, `canSeeUserDetails`, `isLeadAnywhere`, `services/masking.ts` skeleton, masking leak tests on M2 list endpoints | S0.6 masking · S1.2 authz bodies · S3.4 | `authz.int.test.ts` · `src/server/services/masking.int.test.ts` · `tests/authz/masking.int.test.ts` |
| X09 | `GET /api/people/options` for any logged-in user (id, name, nickname, position, colour, active) | S1.3 | `people.int.test.ts` · row `PERM-XA` · masking test |
| §3.4 AZ-1..AZ-4, TST-1 | All checks in `authz.ts`, before data; invisible → 404; every M2 §3.2 row table-driven; every action/route has a row | S1.2 · S3.1–S3.2 | `tests/authz/matrix.int.test.ts` + `rows/{clients,projects,members}.ts` · `tests/authz/coverage.int.test.ts` |
| §6.2 / §6.4 / DM-08 (+ DM-02 part) | Tables + enums + trigram indexes (`projects.name`, `clients.name`, `"user".name`, `"user".nickname`) | S0.3 | `src/server/db/schema.int.test.ts › M2 schema` |
| KEY-03 (§8.6 `Esc`, part) | `Esc` closes every M2 dialog (project/client forms, delete dialog) — MUI default, kept | S2.1, S2.4, S2.6 | `DeleteProjectDialog.test.tsx` (Esc → `onClose`) · e2e E2 |
| PRIN-P2 (§1.3) | No confirm for reversible operations (archive, member removal, client archive) — undo toast instead; the delete dialog is the single exception | S2.5, S2.6 | e2e E4, E6 (no `dialog` role appears) |
| PRIN-P5 (§1.3) | Defaults work without setup: certainty `CONFIRMED`, colour `#2F5597`, LEAD optional | S0.3, S0.9 | `schema.int.test.ts › defaults` · `projects.test.ts` |
| SEED-A1 (part, App. A.1) | Golden clients / projects / memberships read from `golden-fixtures.json` | S1.7 | `scripts/lib/fixtures.int.test.ts › M2` |

**§3.2 permission rows in scope** (ids follow `plan/research/r7-traceability.md` §G, table order):

| PERM | §3.2 line | Expectation (M · L · Me · W) | Rows |
|---|---|---|---|
| PERM-03 | สร้าง/แก้/archive ลูกค้า | allow · 403 · 403 · 403 | §7.2 `PERM-03a..d` |
| PERM-04 | ดูลูกค้า | all · own projects' clients · ← · 404 | `PERM-04a..g` |
| PERM-05 | สร้างโปรเจค | allow · 403 · 403 · 403 | `PERM-05` |
| PERM-06 | เห็นโปรเจคในลิสต์ / เปิดโปรเจค | allow · allow · allow · **404** | `PERM-06a..e` |
| PERM-07 | แก้ข้อมูลโปรเจค (ชื่อ, ลูกค้า, สี, ความแน่นอน) | allow · allow · 403 · 404 (archived: 403 · 403 · 403 · 404) | `PERM-07a..d` |
| PERM-08 | เพิ่ม/ลบสมาชิก, เปลี่ยน LEAD/MEMBER | allow · allow · 403 · 404 (archived: 403 ×3 · 404; last LEAD: allow · 409 · 403 · 404) | `PERM-08a..f` |
| PERM-09 | Archive โปรเจค | allow · allow · 403 · 404 | `PERM-09a/b` |
| PERM-10 | ลบโปรเจคถาวร | allow · 403 · 403 · 404 (archived too) | `PERM-10a/b` |

### 1.2 Out of scope (do not build; each lands later)

| Item | Lands in |
|---|---|
| FR-402 Project Charter created with the project (+ `ensureProjectCharters()` backfill) | M4 (X25) |
| FR-621 default task-status set inserted by `createProject` (+ `ensureProjectStatuses()` backfill for M2 projects); status management on the overview tab (PERM-23) | M3 (X70, X79) |
| Sidebar item "งานของทีม" (`/tasks`) | M3 (X75) |
| FR-404 assignment count + two-option toast, combined "unassign all + remove" tx; BR-61 enforcement | M3 (X16) |
| BR-60 auto-invite when assigning a non-member; assignee picker | M3 (X62) |
| FR-405 numbers in grid / workload / home (consumers of `invalidateLoad`) | M6, M9 (X18) |
| FR-406 "ปลดภาระ X วัน-คน ในอนาคต" | M6 (X17) |
| FR-407 collecting `files.storage_key` for unlink | M4 (X26) |
| FR-408 tabs งาน / เอกสาร / แผนงาน (never as disabled placeholders) | M3 / M4 / M6 (X15) |
| FR-409 progress (M3), upcoming milestones (M8), per-member load + 12-week bars (M9) | M3, M8, M9 |
| FR-303 12-week client load | M9 (X15) |
| Sidebar page trees / wiki section, Cmd+K palette and search over projects / clients / people | M4, M10 (X08, X33) |
| Sidebar "งานของฉัน" count, workload badge | M3/M9, M9 (X22, X31) |
| Leave masking (`th.masking.leave`), calendar consumers of `visibleUserIds` | M5 (X30) |
| `/people`, `/people/[id]` (consumer of `canSeeUserDetails`), "👥 ทีมงาน" nav item | M9 |
| Manual project ordering, project templates, custom fields, client hard delete | never (SPEC §1.3 P7, §13) |
| Allocations, plan dates, cd math | M6+ (nothing in M2 touches them) |

### 1.3 Carried-in items (delivered earlier, used here)

| From | Item | Used by |
|---|---|---|
| M0 | Data-driven sidebar shell (X33), `EmptyState`, `Link.tsx`, `AppProviders` (QueryClientProvider, ToasterHost), `th.ts` base namespaces, e2e harness | S0.13, S2 |
| M0/M1 | KEY-02 `Cmd+\` sidebar collapse and its persisted `sidebar.collapsed` preference (X33) — not rebuilt; `SidebarProjects` must respect the collapsed rail | S2.2 |
| M1 | `authz.ts` first part (`narrowRole`, `requireUser`, `isManager`, `requireManager`), `errors.ts` (incl. `notImplemented`, `ValidationError.fromZod`), `action.ts`, `route.ts`, `audit.ts` (`AuditEntity`), `clock.ts`, `session.ts` (`getSessionUser`, `requirePageUser`), barrels `src/server/{repo,services}/index.ts`, `TodayProvider`/`useToday` | S0, S1, S2 |
| M1 | `UndoProvider`/`useUndo`/`toastUndo` (X04), `usePreferences`/`setPreference` (X05), `UserName`, `UserAvatar`, `displayName()` | S2 |
| M1 | Test harness (X91): `tests/authz/{types,matrix.int.test}.ts` (`AuthzRow` with `audit.projectId` + `with`, T-META-01), `tests/authz/rows/index.ts` registry, `tests/helpers/{world,as-user,outcome,factories,db}.ts` (`WorldPart`), `e2e/fixtures.ts` (`resetDb(fixture?, opts?)`, `loginAs`, M0's named guards) | S0.14, S3 |
| M1 | `seedGolden(db, { upTo })` with positions, users, schedules (X11) | S1.7 |
| M1 → M2 | X12: the member picker must exclude deactivated users | S1.3, S2.5 |

---

## 2. Read first

- **SPEC:** §0–§3 (all of §3), §4.3, §4.4, §5.8, §6.1, §6.2 (clients / projects / project_members / audit_log), §6.4, §7.3, §7.5, §8.1, §8.6, §8.8, §8.9, §11.2, §11.4, §12 M2, §14 D1, Appendix A.1.
- **PLAN.md:** §1.3 (Next 16.3, MUI 9, Drizzle, client libraries, Zod 4, testing), §1.4 rows X04, X05, X09, X11, X12, X15–X18, X25, X26, X30, X33, X40–X47, X53, X61; §2.3 ownership; §3.4 (errors, action, route, **authz API**, data access, audit); §3.5 (client data flow, query keys, invalidate); §3.7 i18n; §3.8 undo; §3.9 UI system; §4.3–§4.5 (world, matrix, masking, Playwright).
- **Research:** `plan/research/r6a-gaps-m0-m5.md` §3.3 (M2-01…M2-17), X-05, X-06, X-07, X-17, X-18, X-19, §6 rows 6–16, §7 (derived memberships) · `plan/research/r8-golden.md` §4.2–§4.3 and §6.4 (memberships, per-viewer visible projects / clients / 404 lists) · `plan/research/r1-next-mui-tooling.md` §2.2 (async params, `PageProps`), §2.3 (`refresh()`), §8.4 (RSC boundaries, `Link.tsx`), §8.6 (MUI 9 API changes), §11 #5 (router.refresh bug) · `plan/research/r2-auth-db.md` §9.2, §10.3 (`DrizzleQueryError.cause.code`), §11.3 #2 (trigram indexes), §12 (verified Drizzle definitions of clients / projects / project_members) · `plan/research/r4-client-testing.md` §6 (mutations), §8 (QueryClient), §22 (MUI Dialog slots), §23 (sonner), §29–§30 (Zod 4, forms without RHF), §34 (mocking `next/cache`), §38 (Playwright clock).
- **Snippets:** `plan/research/snippets/r2/v2/kt2/schema.ts` and r2 §12 (schema), `plan/research/snippets/r4/client/lib/{query-client,action-result}.ts`, `plan/research/snippets/r4/client/components/ToasterHost.tsx`, `plan/research/snippets/r4/vitest/tests/integration/rename-task.test.ts` (mocking pattern), `plan/research/snippets/r1/src/components/Link.tsx`.
- **docs:** `docs/reference/golden-fixtures.json` (`clients`, `projects`, `tasks[].assignee`).
- Not needed in M2: fractional-indexing (projects are sorted by name; members by role then name), dnd-kit, TanStack Virtual, BlockNote.

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | What it means in M2 |
|---|---|
| X04 | Archive (project, client) and member removal use the M1 `UndoProvider` toast (8 s) + Cmd+Z — no confirm dialog. |
| X05 | Sidebar node expansion is stored in the `sidebar.expanded` preference via `setPreference` (debounced, not audited). |
| X09 | `GET /api/people/options` (id, name, nickname, positionName, color, active) for any logged-in user; first consumer = member picker. |
| X11 | `seedGolden` grows: 4 clients, 5 projects, 5 LEAD rows + 5 MEMBER rows derived from task assignees (POS: Ivy, Mint · Mobile: Mint · CRM: Ivy · Store: Jack). |
| X12 | M2 clause of AC-203: the member picker excludes deactivated users. |
| X15 | No load figures on overview or client pages; only the ภาพรวม tab exists; no disabled tabs. |
| X16 | `removeMember` returns `blockedByAssignments: 0` and removes with undo; M3 adds the count and the two-option toast. |
| X17 | Archive happens immediately with toast "archive "<ชื่อ>" แล้ว · เลิกทำ"; no X person-days until M6. |
| X18 | M2 creates `src/lib/query-keys.ts` + `src/lib/invalidate.ts#invalidateLoad`; the certainty-changing action calls `refresh()`. |
| X26 | Permanent delete = one tx (cascade + audit), then best-effort unlink of the keys returned by the `collectProjectFileKeys` hook (always `[]` in M2). |
| X30 | `visibleProjectIds`, `visibleUserIds`, `canSeeUserDetails`, `isLeadAnywhere`, `services/masking.ts` skeleton and `tests/authz/masking.int.test.ts` skeleton are created here. |
| X33 | Nav gains "โปรเจค" (section + `/projects`) and "ลูกค้า" (`/clients`); nothing that leads to an unbuilt page. |
| X40 | `pnpm check` includes the integration project; `pnpm db:up` is required. |
| X41 | Invisible → 404 `NOT_FOUND`; visible but not allowed → 403 `FORBIDDEN`; client CRUD and project create are global manager-only actions → `FORBIDDEN`; authz at the top of layouts/pages before any Suspense. |
| X42 | Archived projects are read-only: `view` allowed; `edit`/`manage` → `FORBIDDEN` "โปรเจคถูก archive แล้ว" except unarchive (M, L) and permanent delete (M); enforced only in `requireProject`. Archived projects are hidden from the sidebar. |
| X43 | `visibleUserIds`: manager → all; worker LEAD of ≥ 1 non-archived project → all; else self ∪ users sharing ≥ 1 non-archived project; deactivated users included. `visibleProjectIds`: manager → all; worker → member projects incl. archived. |
| X44 | Every mutating M2 action writes exactly one `audit_log` row inside its transaction; summaries from `th.audit.*`. |
| X46 | E2E against the production build, `resetDb()` per describe block, `loginAs` per role, page objects. |
| X47 | `z.uuid()`; Thai only through `th.*`; `refresh()` instead of SPEC §7.3's `revalidateTag`. |
| X53 | No localStorage; ids come from the server (no `crypto.randomUUID` in client code). |
| X80 / X87 | New repo files `clients.ts`, `projects.ts`, `members.ts`, `people.ts` join the M1 barrel as `repo.clients`, `repo.projects`, **`repo.members`** (M10 reuses `repo.members.listMembers`), `repo.people`; services barrel gains `clients`, `projects`, `members`, `people`, `sidebar`. |
| X83 | `src/lib/api.ts#getJson` is created here (never `getJSON`); every later client fetch uses it. |
| X84 | `PROJECT_TABS` uses the 0/1/2/3 scale (M2-D10); nav entries follow M0's `NavItem` model (string `icon` keys, `BOTTOM_NAV`). |
| X86 | Route handlers parse their id params inside the handler; a malformed id is a 404 like an unknown one (`projectAccess` → `null`, M2-D02); query-string validation errors stay 400. |
| X90 | `getSidebar(tx, user, today)` takes `today` from its route (`serverToday()`), unused in M2; M3's `countMyOpenTasks(tx, userId, today)` needs it. |
| X91 | Factories insert with plain Drizzle; route rows name their action `'GET /api/sidebar'`; M2's rows files are registered in M1's `tests/authz/rows/index.ts`. |
| X93 | `AuditEntity` gains `client`, `project`, `project_member`. |
| X61 | Client picker lists all non-archived clients to the project's editors (M/L); LEAD optional with "ยังไม่มี LEAD" warning; worker LEAD cannot remove/demote the last LEAD (`CONFLICT`), a manager can with a warning; client names unique incl. archived; workers see only their projects' clients (other client pages → 404); sidebar sorted by `Intl.Collator('th')`. |

### 3.2 New M2 decisions

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M2-D01 | §3.2 ดูลูกค้า, X61 | New authz function `requireClient(tx, user, clientId)` → `NotFoundError` unless manager or the client has ≥ 1 non-deleted project the worker is a member of (archived projects count). PLAN §3.4.4 lacks it. | One place for the "ดูลูกค้า" row. |
| M2-D02 | X42 | `requireProject(tx, user, projectId, need, opts?: { allowArchived?: boolean })`. The archived check applies to `edit` and `manage`; `owner` is exempt (permanent delete of archived projects); only `unarchiveProject` passes `allowArchived: true`. `projectAccess` returns `null` for malformed ids (no `22P02` → 500). | Keeps X42 in one function. |
| M2-D03 | FR-405, X18 | Certainty is edited through `updateProject` (same action as name/client/code/colour/note); it returns `{ certaintyChanged }`; the action always calls `refresh()`; the client calls `invalidateLoad(qc)` when `certaintyChanged`, and `invalidateProjects(qc)` always. | One action = one matrix row = one audit row (PERM-07). |
| M2-D04 | X61, FR-301 | `GET /api/clients/options?projectId=` returns non-archived clients. Without `projectId`: manager only (403 otherwise). With `projectId`: `requireProject(…, 'manage')` (404/403, archived → 403) and the project's current client is appended even when archived (`archived: true`). | LEADs can re-pick a client (X61); hidden-client names are not project data. |
| M2-D05 | FR-404, X16 | Undo of a member removal (and its redo) calls `addMember({ projectId, userId, role })` with the removed role; `added_by`/`added_at` become the undoer/now. M3 replaces this with the batch restore. | Simplest reversible path (P2). |
| M2-D06 | BR-62, X61 | The guard locks the project's LEAD rows `SELECT … FOR UPDATE` before any role change or removal. Worker actor removing/demoting the last **active** LEAD → `ConflictError('CONFLICT', th.members.errors.lastLead)`. Manager actor → allowed, result carries `warning: 'NO_LEAD'` (client shows `th.members.toasts.noLeadWarning`). | Race-safe BR-62 with its manager exception. |
| M2-D07 | FR-301, §3.2 | "CRUD" for clients = create / read / update / archive (+ unarchive). No hard delete of clients (§3.2 lists only archive). Name uniqueness is the DB constraint (exact match after trim, archived included); a pre-check gives `th.clients.errors.nameTaken`, and `23505` on `clients_name_unique` maps to the same message. | Matches DDL; P7. |
| M2-D08 | §8.1, X33 | Sidebar projects come from `GET /api/sidebar` via TanStack Query (client fetch with skeleton; no SSR prefetch). Response = `{ projects, hasArchived, canCreateProject }`. Every project/member mutation calls `invalidateProjects(qc)` in the same tab; other tabs/users refresh on window focus (no realtime). | PLAN §3.5; FR-405 "same tab". |
| M2-D09 | §7.3, X47 | `refresh()` is called by actions whose current RSC route changes: client create/update/archive/unarchive, `updateProject`, `archiveProject`, `unarchiveProject`, `addMember`, `changeMemberRole`, `removeMember` (except self-removal). `createProject` and `deleteProjectPermanently` do not refresh; the client navigates (`router.push` / `router.replace`). | Avoids re-rendering a page that is about to 404; `router.refresh()` is broken (#99028). |
| M2-D10 | FR-408 | Routes: `/projects/[id]` → `redirect('/projects/[id]/overview')`; `projects/[id]/layout.tsx` does authz + header + tab bar; tabs come from `PROJECT_TABS` (`src/components/projects/project-tabs.ts`) with an `order` field fixing FR-408's order on **the one scale every milestone uses (X84): ภาพรวม 0 · แผนงาน 1 (M6) · งาน 2 (M3) · เอกสาร 3 (M4)** — no other values; the sidebar sub-links reuse the same config. | Single source; later milestones append one entry. |
| M2-D11 | §6.2 `projects.deleted_at`, FR-407 | `deleted_at` stays in the schema, is filtered (`is null`) by every project query, and is never set in the MVP; permanent delete is a hard `DELETE` (r6a M2-07). | Simplest meaning of FR-407. |
| M2-D12 | X11, BR-60 | `seedClientsProjects` inserts through repo functions with **no audit rows** (seeding is not a user operation); clients have only names; projects get the default colour and `created_by` = the golden manager; LEAD from `projects[].lead`, MEMBER = distinct `tasks[].assignee` of that project minus its LEAD; `added_by` = manager. | Data never re-typed; deterministic. |
| M2-D13 | PLAN §4.3, X59, X91 | `makeClient` / `makeProject` insert with **plain Drizzle** on the schema tables (`clients`, `projects`, `project_members`), never through `src/server/repo/**`, so factories exist before S1 and stay independent of repo code. The S0 repo insert functions (`repo.clients.insertClient`, `repo.projects.insertProject`, `repo.members.insertMember`) are for the seed and the services. | Lets S3 work in parallel with S1; X91. |
| M2-D14 | §6.2 `"user".id text` | User ids in zod schemas are `z.string().min(1).max(64)` (text ids, not `z.uuid()`); project/client ids use `z.uuid()`. | Better Auth text ids. |
| M2-D15 | FR-401, FR-301 | Field rules: project name 1–200 chars (trimmed, not unique); client name 1–120 (trimmed, unique); code ≤ 20 (empty → null); note ≤ 2000; certainty note ≤ 500 (shown when TENTATIVE, kept when switching back); colour `^#[0-9A-F]{6}$` chosen from the 12-swatch `PROJECT_COLORS` (default `#2F5597`); client colour optional. | P1 — only the name is required. |
| M2-D16 | X09, X12 | `PersonOption.active = banned = false AND deactivated_on IS NULL`. The directory includes deactivated users (flag false) so existing members still render; the picker filters `active`. No email in the payload. | Minimal directory (X17). |
| M2-D17 | BR-62, FR-409 | Overview `warnings.noLead` = no member with role LEAD **and** `active = true`; the warning "ยังไม่มี LEAD" is shown to every viewer (non-blocking); only M/L see the add/role controls. Managers may be members/LEADs; manager membership changes nothing (`projectAccess` → `MANAGER`). | X61; r6a M2-06. |
| M2-D18 | §8.1, X61 | One isomorphic comparator `compareThai = new Intl.Collator('th').compare` in `src/lib/collate.ts`: sidebar, `/projects`, `/clients`, client detail and member lists (LEAD first, then display name). Node 22 has full ICU (r7 K.4). | Same order on server and client. |
| M2-D19 | §3.2, FR-403 | A LEAD may remove or demote themselves when another active LEAD remains; `removeMember` then skips `refresh()` and returns `selfRemoved: true`, and the client goes to `/projects`. A MEMBER cannot leave a project by themselves (§3.2: Me has no member rights). | Literal §3.2. |
| M2-D20 | FR-406 | `archiveProject` on an archived project → 403 (X42 read-only); `unarchiveProject` on an active project is a no-op `{ changed: false }` without audit. Same for clients (`archiveClient` on archived / `unarchiveClient` on active → no-op `{ changed: false }`). | Idempotent undo/redo. |
| M2-D21 | §3.4, X41 | Page loaders (`getProjectHeader`, `getProjectOverview`, `listProjectsForViewer`, `listClientsForViewer`, `getClientDetail`) start with authz; pages wrap them in `orNotFound()` (`src/server/page-helpers.ts`), which turns `NotFoundError` into `notFound()`. No `loading.tsx` under `(app)/projects/**` or `(app)/clients/**`. | 404 keeps its HTTP status (r6a M2-16). |
| M2-D22 | PLAN §4.4 | PERM ids follow `r7-traceability.md` §G (PERM-03…PERM-10 for M2). PLAN §4.4's sample id `PERM-13` for `createTask` is a typo (r7: PERM-11) — reported as a blueprint gap. Extra non-§3.2 rows use `PERM-X*` ids. | One numbering. |

No **DEVIATION** from SPEC in M2. (SPEC §7.3's `revalidateTag` → `refresh()` is covered by X47.)

---

## 4. Streams (machine-readable)

```json
{ "milestone": 2,
  "streams": [
    { "id": "S0", "title": "Contracts: schema + migration, zod schemas, DTOs, authz signatures, masking skeleton, query keys, i18n, stubs, factories/world, nav entries", "agent": "backend-engineer",
      "owns": ["package.json", "pnpm-lock.yaml", "src/server/db/schema.ts", "src/server/db/schema.int.test.ts", "drizzle/**", "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts", "src/lib/collate.ts", "src/lib/collate.test.ts", "src/lib/project-colors.ts", "src/lib/api.ts", "src/domain/types.ts", "src/i18n/th.ts", "src/server/authz.ts", "src/server/page-helpers.ts", "src/server/services/masking.ts", "src/server/services/masking.int.test.ts", "src/server/services/{clients,projects,members,people,sidebar}.ts", "src/server/repo/{clients,projects,members,people}.ts", "src/server/actions/{clients,projects,members}.ts", "src/app/api/sidebar/route.ts", "src/app/api/people/options/route.ts", "src/app/api/clients/options/route.ts", "src/components/shell/nav*.ts", "src/components/shell/Sidebar.tsx", "src/server/audit.ts", "src/server/repo/index.ts", "src/server/services/index.ts", "tests/helpers/**", "tests/helpers/world.int.test.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Backend: authz bodies, repo, services, actions, route handlers, golden seed (clients/projects/members)", "agent": "backend-engineer",
      "owns": ["src/server/authz.ts", "src/server/authz.int.test.ts", "src/server/repo/**", "src/server/services/**", "src/server/actions/**", "src/app/api/**", "scripts/**"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Frontend: sidebar projects, /projects, project shell + overview, members panel, dialogs, /clients pages, shared components", "agent": "frontend-engineer",
      "owns": ["src/app/(app)/projects/**", "src/app/(app)/clients/**", "src/components/shell/**", "src/components/common/**", "src/components/projects/**", "src/components/clients/**", "src/hooks/**", "src/lib/people/**"],
      "dependsOn": ["S0"], "planSection": "5.S2" },
    { "id": "S3", "title": "Tests: authz matrix rows, visibility + golden visibility, masking skeleton, e2e m2-projects, older specs", "agent": "test-engineer",
      "owns": ["tests/authz/**", "e2e/**"],
      "dependsOn": ["S0"], "planSection": "5.S3" }
  ],
  "e2e": ["e2e/m2-projects.spec.ts"] }
```

Notes on the DAG:
- S1, S2 and S3 run concurrently after G0. Their `owns` do not overlap: S1 = server + API + scripts; S2 = pages (non-API), components, hooks, `src/lib/people/**`; S3 = `tests/authz/**`, `e2e/**`. S0 owns the files S1/S2 later fill (`authz.ts`, stubs, nav config) but never runs concurrently with them.
- `src/i18n/th.ts` belongs to S0. After G0: S2 may add keys only inside `projects`, `clients`, `members`, `sidebar`; S1 only inside `audit`; S3 adds none (Edit tool only, PLAN §2.3).
- `tests/helpers/**` belongs to S0; S3 puts M2-only helpers in `tests/authz/_support/**`.
- Change vs. the brief's skeleton: none in stream count; S0 additionally owns `src/server/page-helpers.ts`, `src/lib/collate.ts`, `src/lib/project-colors.ts` and the repo insert functions (M2-D13), because S1, S2 and S3 all depend on them.

---

## 5. Step-by-step

### Hard-rule checklist for every stream (CLAUDE.md, embodied in the steps below)

| Rule | Where it is enforced in M2 |
|---|---|
| Authz in `src/server/authz.ts`, before touching data; invisible → 404 | S1.2 bodies; every action in S1.4–S1.6 starts with `requireManager`/`requireProject`; every loader starts with `requireProject`/`requireClient`; `projectAccess` returns `null` for unknown **and** malformed ids |
| Masking server-side | S1.3 sidebar / options endpoints only ever select visible rows; S0.6 `masking.ts`; S3.4 leak tests (`JSON.stringify(body)` never contains hidden names or ids) |
| Action = zod parse → authz → service → audit → refresh (only if RSC output changes) | S1.4–S1.6 action skeletons; M2-D09 lists which actions refresh |
| Multi-table writes in one transaction with audit inside | `createProject` (project + LEAD row + audit), `deleteProjectPermanently` (delete + audit), member writes (member row + audit) — all `db.transaction`; `refresh()` and file unlink run **after** commit |
| Loads in integer cd; plan dates as `'YYYY-MM-DD'`; allocations queries bounded by `week_start`; WEEK↔DAY delete-before-insert | **N/A in M2** — no loads, plan dates or allocations exist; do not add any (no "0" placeholders either, X15) |
| All UI text in `src/i18n/th.ts` | S0.8 defines every key used; ESLint Thai ban covers `src/**`; tests import `th` |
| No confirm dialogs except permanent project delete; undo toast 8 s + Cmd+Z | S2.5/S2.6: archive, member removal and client archive use `useUndo().push(entry, { toast })`; `DeleteProjectDialog` is the only `Dialog` with a confirm button |
| Creating a task requires only its name | N/A (no tasks); analogously only the project / client **name** is required (M2-D15) |
| State never by colour alone | ◐ glyph + aria-label for TENTATIVE; "archive แล้ว" chip text; role chips with text; colour squares are `aria-hidden` decoration |
| No localStorage for data; no runtime CDN | sidebar expansion via `setPreference('sidebar.expanded')`; icons are local `@mui/icons-material` path imports |
| Schema only via `schema.ts` + `pnpm db:generate` | S0.3; no custom migration needed in M2 (extensions exist since M0 `0000_extensions`) |
| New libraries need a Decision | none added in M2 (S0.1 only verifies existing ones) |

### 5.S0 — Contracts (backend-engineer · package.json, schema, drizzle, contracts, schemas, query keys, i18n, authz signatures, stubs, helpers, nav)

S0 runs alone. At the end `pnpm check` must be green (G0) with all stubs in place.

**S0.1 Preflight and dependencies.**
- `git status` clean; `pnpm db:up`; `pnpm check` green on the M1 tree.
- Verify (do not upgrade) that `package.json` already has: `@tanstack/react-query@5.104.0` (+ `@tanstack/react-query-devtools`), `sonner@2.0.8`, `@mui/material@9.4.0`, `@mui/icons-material@9.4.0`, `zod@4.6.5`, `drizzle-orm@0.45.3`, `drizzle-kit@0.31.11`. If `@tanstack/react-query` is missing (M0 should have installed it for `AppProviders`), run exactly one batch, `pnpm add @tanstack/react-query@5.104.0 @tanstack/react-query-devtools@5.104.0` (PLAN §1.2 pins), and record it in the S0 report.
- **No new library in M2.** fractional-indexing is not used (projects are sorted by name).
- Read the M1 files you will extend and note their exact exports in the S0 report: `src/server/{errors,action,route,audit,authz,session,clock}.ts`, `src/server/db/{schema,client}.ts`, `tests/helpers/*.ts`, `tests/authz/matrix.int.test.ts`, the M0 nav config (`grep -rn "href: '/home'" src/components/shell`), the M1 preference key registry (`grep -rn "sidebar.collapsed" src/lib src/server`).
- Done-check: `pnpm check` green before any edit.

**S0.2 Domain type.** In `src/domain/types.ts` add (only if absent; PLAN §3.6 lists it):
```ts
export type Certainty = 'CONFIRMED' | 'TENTATIVE'
export type ProjectRole = 'LEAD' | 'MEMBER'
```
No other domain code in M2 (the coverage gate is unaffected: types only).

**S0.3 Schema (`src/server/db/schema.ts`) — exactly SPEC §6.2 + PLAN §1.3 corrections.** Start from `plan/research/r2-auth-db.md` §12 (verified on PG 17.11). Reuse the existing `tstz`/`createdAt`/`updatedAt` helpers if M1 defined them; otherwise add them as below. If `certainty`/`projectRole` enums already exist, reuse them.
```ts
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const certainty = pgEnum('certainty', ['CONFIRMED', 'TENTATIVE'])
export const projectRole = pgEnum('project_role', ['LEAD', 'MEMBER'])

const tstz = (name: string) => timestamp(name, { withTimezone: true })        // reuse M1's if present

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),                 // constraint "clients_name_unique" (archived included)
  code: text('code'),
  color: text('color'),
  note: text('note'),
  archivedAt: tstz('archived_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('clients_name_trgm').using('gin', t.name.op('gin_trgm_ops'))])

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  code: text('code'),
  color: text('color').notNull().default('#2F5597'),
  certainty: certainty('certainty').notNull().default('CONFIRMED'),
  certaintyNote: text('certainty_note'),
  archivedAt: tstz('archived_at'),
  deletedAt: tstz('deleted_at'),                          // never set in the MVP (M2-D11)
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('projects_name_trgm').using('gin', t.name.op('gin_trgm_ops'))])

export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: projectRole('role').notNull().default('MEMBER'),
  addedBy: text('added_by').references(() => user.id),
  addedAt: tstz('added_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.userId] }),
  index('project_members_user_id_idx').on(t.userId),
])
```
- **Trigram indexes on `"user"`** (§6.4 + PLAN §1.3): if the M1 `user` table does not already declare them, add to its extra-config array: `index('user_name_trgm').using('gin', t.name.op('gin_trgm_ops'))`, `index('user_nickname_trgm').using('gin', t.nickname.op('gin_trgm_ops'))`.
- No `position` column exists in the M2 tables, so no `orderKey` (`text COLLATE "C"`) column is needed (X48 applies from the first ordered table).
- `gin_trgm_ops` needs `pg_trgm`, created by M0's journaled custom migration `0000_extensions`; confirm it is listed in `drizzle/meta/_journal.json` **before** the new migration. No custom migration is needed in M2 (no triggers / EXCLUDE).
- Export inferred types: `export type ClientRow = typeof clients.$inferSelect`, `ProjectRow`, `ProjectMemberRow`, `NewClient`, `NewProject`, `NewProjectMember`.
- Generate: `pnpm db:generate --name=m2_clients_projects` → one new journaled file `drizzle/0002_m2_clients_projects.sql` (after M0's `0000_extensions` and M1's `0001_m1_auth_employees`; same naming pattern as M1/M5). Never edit it. Then `pnpm db:migrate`.
- Inspect the SQL: it must contain `CREATE TYPE "public"."certainty" AS ENUM('CONFIRMED', 'TENTATIVE')`, `"project_role"`, `CONSTRAINT "clients_name_unique" UNIQUE("name")`, `ON DELETE set null` for `projects_client_id_clients_id_fk`, `ON DELETE cascade` for both `project_members` FKs, `USING gin ("name" gin_trgm_ops)` ×3 (+ nickname), `"color" text DEFAULT '#2F5597' NOT NULL`, `"certainty" "certainty" DEFAULT 'CONFIRMED' NOT NULL`, `"role" "project_role" DEFAULT 'MEMBER' NOT NULL`, every timestamp `timestamp with time zone`.
- Test first — extend `src/server/db/schema.int.test.ts` › `describe('M2 schema')`:
  - `it('has the trigram indexes')`: `select indexname from pg_indexes where indexname in ('projects_name_trgm','clients_name_trgm','user_name_trgm','user_nickname_trgm','project_members_user_id_idx')` → 5 rows.
  - `it('rejects duplicate client names including archived')`: insert `{ name: 'Coral', archivedAt: new Date() }` then `{ name: 'Coral' }` → `DrizzleQueryError` with `cause.code === '23505'` and `cause.constraint_name === 'clients_name_unique'`.
  - `it('sets client_id null when a client row is deleted')` (raw SQL delete; the app never deletes clients) and `it('cascades project_members on project delete')`.
  - `it('defaults')`: inserted project has `color '#2F5597'`, `certainty 'CONFIRMED'`; member role `'MEMBER'`.
  - `it('Thai substring uses the trigram index')` is optional here (M10 verifies search); skip.
- Done-check: `pnpm db:generate` prints "No schema changes" on a second run; `pnpm vitest run --project integration src/server/db/schema.int.test.ts` green.

**S0.4 Repo insert functions (M2-D13)** — used by the golden seed and the services (factories use plain Drizzle); S1 adds every other repo function to the same files. Register the four files in M1's barrel `src/server/repo/index.ts`: `export * as clients from './clients'`, `projects`, `members`, `people` (X87).
```ts
// src/server/repo/clients.ts
export async function insertClient(tx: DbOrTx, v: { name: string; code?: string | null; color?: string | null;
  note?: string | null; archivedAt?: Date | null }): Promise<ClientRow>
// src/server/repo/projects.ts
export async function insertProject(tx: DbOrTx, v: { name: string; clientId?: string | null; code?: string | null;
  color?: string; certainty?: Certainty; certaintyNote?: string | null; archivedAt?: Date | null; createdBy: string }): Promise<ProjectRow>
// src/server/repo/members.ts
export async function insertMember(tx: DbOrTx, v: { projectId: string; userId: string; role: ProjectRole;
  addedBy: string | null }): Promise<ProjectMemberRow>
// src/server/repo/people.ts   (file created empty-but-typed; S1 fills)
export {}
```
Each is `tx.insert(table).values(v).returning()` + `const [row] = rows; if (!row) throw new Error('insert failed'); return row`.

**S0.5 Contracts — DTOs (`src/lib/contracts/`)** (isomorphic, type-only):
```ts
// src/lib/contracts/people.ts
export interface PersonOption { id: string; name: string; nickname: string | null; positionName: string | null;
  color: string | null; active: boolean }
export interface PeopleOptionsResponse { people: PersonOption[] }

// src/lib/contracts/clients.ts
export interface ClientRef { id: string; name: string; code: string | null; color: string | null; archived: boolean }
export interface ClientOption { id: string; name: string; code: string | null; color: string | null; archived: boolean }
export interface ClientOptionsResponse { clients: ClientOption[] }
export interface ClientListItem extends ClientRef { projectCount: number }          // viewer-visible projects only
export interface ClientDetail { client: ClientRef & { note: string | null }; projects: ProjectListItem[];
  can: { manage: boolean } }

// src/lib/contracts/projects.ts
import type { Certainty, ProjectRole } from '@/domain/types'
export type ProjectAccessRole = 'MANAGER' | ProjectRole
export interface MemberUser { userId: string; name: string; nickname: string | null; positionName: string | null;
  color: string | null; active: boolean }
export interface ProjectMember extends MemberUser { role: ProjectRole }
export interface ProjectListItem { id: string; name: string; code: string | null; color: string; certainty: Certainty;
  archived: boolean; client: ClientRef | null; leads: MemberUser[]; memberCount: number; myRole: ProjectAccessRole }
export interface ProjectHeader { id: string; name: string; code: string | null; color: string; certainty: Certainty;
  certaintyNote: string | null; archived: boolean; client: ClientRef | null; myRole: ProjectAccessRole;
  can: { manage: boolean; unarchive: boolean; delete: boolean } }
export interface ProjectOverview { project: ProjectHeader; members: ProjectMember[]; warnings: { noLead: boolean } }

// src/lib/contracts/sidebar.ts
export interface SidebarProject { id: string; name: string; color: string; certainty: Certainty }
export interface SidebarResponse { projects: SidebarProject[]; hasArchived: boolean; canCreateProject: boolean }
```
`can.manage` = role ∈ {MANAGER, LEAD} **and** not archived; `can.unarchive` = role ∈ {MANAGER, LEAD} and archived; `can.delete` = role = MANAGER.

**S0.6 Masking skeleton (`src/server/services/masking.ts`, X30)** — complete in S0 (pure, no DB import), M5/M9 extend.
```ts
import { th } from '@/i18n/th'
export type Visible = 'ALL' | ReadonlySet<string>
export const isVisible = (visible: Visible, id: string): boolean => visible === 'ALL' || visible.has(id)
/** Split rows by project visibility. Hidden rows must never be returned to a client as-is. */
export function partitionByProject<T extends { projectId: string }>(rows: readonly T[], visible: Visible):
  { visible: T[]; hidden: T[] }
/** One aggregate for everything hidden: no ids, no names, no counts — only the Thai label and the combined value. */
export interface MaskedAggregate<V> { kind: 'masked'; label: string; value: V }
export function maskHidden<T extends { projectId: string }, V>(rows: readonly T[], visible: Visible,
  combine: (hidden: readonly T[]) => V): { visible: T[]; masked: MaskedAggregate<V> | null }
// masked === null when nothing is hidden; label = th.masking.otherProjects
```
Test first — `src/server/services/masking.int.test.ts` (runs in the integration project, whose include covers `src/server/**/*.int.test.ts`; it needs no DB rows): rows `[{projectId:'p',v:1},{projectId:'q',v:2},{projectId:'q',v:3}]`, visible `new Set(['p'])` → `visible = [p row]`, `masked = { kind:'masked', label: th.masking.otherProjects, value: 5 }` with `combine = (h) => h.reduce((s, r) => s + r.v, 0)`; `JSON.stringify(masked)` does not contain `'q'`; visible `'ALL'` → `masked === null`.

**S0.7 Query keys + invalidation (X18).** Create (or extend, if M1 created it) `src/lib/query-keys.ts`; register only M2's queries plus load prefixes:
```ts
export const qk = {
  sidebar: () => ['sidebar'] as const,
  peopleOptions: () => ['people', 'options'] as const,
  clientOptions: (projectId: string | null) => ['clients', 'options', projectId] as const,
}
/** Prefixes for views that arrive later (M3 tasks.my, M6 grid, M9 workload, M10 home). Invalidating an
 *  unused prefix is a no-op, so invalidateLoad is correct from M2 on. */
export const qkPrefix = {
  grid: ['grid'] as const, workload: ['workload'] as const, home: ['home'] as const, myTasks: ['tasks', 'my'] as const,
  clientOptions: ['clients', 'options'] as const,
}
```
`src/lib/invalidate.ts`:
```ts
import type { QueryClient } from '@tanstack/react-query'
export async function invalidateLoad(qc: QueryClient): Promise<void>      // grid, workload, home, tasks.my
export async function invalidateProjects(qc: QueryClient): Promise<void>  // sidebar + clients.options
```
(`Promise.all(prefixes.map((queryKey) => qc.invalidateQueries({ queryKey })))`.)
Test first — `src/lib/invalidate.test.ts` (unit): seed a `new QueryClient()` with `setQueryData` for `['grid','project','x',{}]`, `['workload','table',{}]`, `['home']`, `['tasks','my']`, `['sidebar']`, `['people','options']`; after `invalidateLoad` the first four have `isInvalidated === true` and `['sidebar']`/`['people','options']` do not; after `invalidateProjects` `['sidebar']` and `['clients','options',null]` are invalidated, `['people','options']` is not.

**S0.8 i18n namespaces (`src/i18n/th.ts`, Edit tool only).** Add the namespaces `clients`, `projects`, `members`, `sidebar`, `masking` and the keys below to the existing `nav` and `audit` namespaces. Exact strings:
```ts
nav: { /* …M0/M1 keys… */ projects: 'โปรเจค', clients: 'ลูกค้า' },

sidebar: {
  projectsHeading: 'โปรเจค',
  newProject: 'สร้างโปรเจค',
  noProjects: 'ยังไม่มีโปรเจค',
  archivedLink: 'ดูโปรเจคที่ archive',
  expand: (name: string) => `ขยาย ${name}`,
  collapse: (name: string) => `ยุบ ${name}`,
  loadError: 'โหลดรายการโปรเจคไม่สำเร็จ',
  retry: 'ลองใหม่',
},

projects: {
  listTitle: 'โปรเจคทั้งหมด',
  archivedListTitle: 'โปรเจคที่ archive',
  showArchived: 'ดูโปรเจคที่ archive',
  showActive: 'กลับไปโปรเจคที่ใช้งานอยู่',
  empty: 'ยังไม่มีโปรเจค',
  emptyWorker: 'คุณยังไม่ได้เป็นสมาชิกของโปรเจคใด',
  emptyArchived: 'ไม่มีโปรเจคที่ archive',
  create: 'สร้างโปรเจค',
  createTitle: 'สร้างโปรเจคใหม่',
  editTitle: 'แก้ไขข้อมูลโปรเจค',
  edit: 'แก้ไข',
  save: 'บันทึก',
  cancel: 'ยกเลิก',
  fields: {
    name: 'ชื่อโปรเจค', client: 'ลูกค้า', noClient: 'ไม่มีลูกค้า (โปรเจคภายใน)', code: 'รหัสย่อ', color: 'สี',
    certainty: 'ความแน่นอน', certaintyNote: 'หมายเหตุความแน่นอน', lead: 'LEAD', leadHint: 'เลือกภายหลังได้',
  },
  columns: { name: 'โปรเจค', client: 'ลูกค้า', leads: 'LEAD', members: 'สมาชิก', certainty: 'ความแน่นอน' },
  memberCount: (n: number) => `${n} คน`,
  certainty: { CONFIRMED: 'แน่นอน', TENTATIVE: 'อาจไม่ทำ' },
  tentativeGlyph: '◐',
  colorOption: (hex: string) => `สี ${hex}`,
  tabsLabel: 'แท็บของโปรเจค',
  tabs: { overview: 'ภาพรวม' },                      // M3/M4/M6 add tasks/pages/plan
  overview: { infoHeading: 'ข้อมูลโปรเจค', noLead: 'ยังไม่มี LEAD', noLeadHint: 'โปรเจคควรมี LEAD อย่างน้อย 1 คน' },
  archivedBanner: 'โปรเจคนี้ถูก archive แล้ว — อ่านอย่างเดียว',
  archivedChip: 'archive แล้ว',
  archive: 'Archive โปรเจค',
  unarchive: 'เลิก archive',
  deletePermanently: 'ลบโปรเจคถาวร',
  deleteDialog: {
    title: 'ลบโปรเจคถาวร',
    body: (name: string) => `การลบนี้ย้อนกลับไม่ได้ ข้อมูลทั้งหมดของ "${name}" รวมถึงสมาชิกจะถูกลบ`,
    prompt: (name: string) => `พิมพ์ชื่อโปรเจค "${name}" เพื่อยืนยัน`,
    inputLabel: 'ชื่อโปรเจค',
    confirm: 'ลบถาวร',
  },
  toasts: {
    created: (name: string) => `สร้างโปรเจค "${name}" แล้ว`,
    saved: 'บันทึกแล้ว',
    archived: (name: string) => `archive "${name}" แล้ว`,
    unarchived: (name: string) => `เลิก archive "${name}" แล้ว`,
    deleted: (name: string) => `ลบโปรเจค "${name}" ถาวรแล้ว`,
    certaintyChanged: (label: string) => `เปลี่ยนความแน่นอนเป็น "${label}" แล้ว`,
  },
  errors: {
    archivedReadOnly: 'โปรเจคถูก archive แล้ว',
    nameRequired: 'กรุณาใส่ชื่อโปรเจค',
    nameTooLong: 'ชื่อโปรเจคยาวเกิน 200 ตัวอักษร',
    codeTooLong: 'รหัสย่อยาวเกิน 20 ตัวอักษร',
    noteTooLong: 'หมายเหตุยาวเกินไป',
    invalidColor: 'สีไม่ถูกต้อง',
    clientArchived: 'ลูกค้านี้ถูก archive แล้ว',
    clientNotFound: 'ไม่พบลูกค้า',
    leadInactive: 'พนักงานคนนี้ถูกปิดใช้งาน',
    deleteNameMismatch: 'ชื่อโปรเจคไม่ตรง',
  },
  notFound: { title: 'ไม่พบโปรเจค', body: 'โปรเจคนี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง', back: 'ไปที่รายการโปรเจค' },
},

members: {
  heading: 'สมาชิก',
  add: 'เพิ่มสมาชิก',
  pickerLabel: 'ค้นหาชื่อ ชื่อเล่น หรือตำแหน่ง',
  pickerEmpty: 'ไม่พบพนักงาน',
  roleLabel: 'บทบาทในโปรเจค',
  roles: { LEAD: 'LEAD', MEMBER: 'MEMBER' },
  you: '(คุณ)',
  remove: (name: string) => `นำ ${name} ออกจากโปรเจค`,
  toasts: {
    added: (name: string) => `เพิ่ม ${name} เป็นสมาชิกแล้ว`,
    removed: (name: string) => `นำ ${name} ออกแล้ว`,
    roleChanged: (name: string, role: string) => `เปลี่ยน ${name} เป็น ${role} แล้ว`,
    noLeadWarning: 'ตอนนี้โปรเจคไม่มี LEAD',
  },
  errors: {
    lastLead: 'โปรเจคต้องมี LEAD อย่างน้อย 1 คน',
    alreadyMember: 'เป็นสมาชิกอยู่แล้ว',
    userInactive: 'พนักงานคนนี้ถูกปิดใช้งาน',
    notMember: 'ไม่ได้เป็นสมาชิกของโปรเจคนี้',
  },
},

clients: {
  listTitle: 'ลูกค้า',
  create: 'เพิ่มลูกค้า',
  createTitle: 'เพิ่มลูกค้าใหม่',
  editTitle: 'แก้ไขข้อมูลลูกค้า',
  edit: 'แก้ไข',
  fields: { name: 'ชื่อลูกค้า', code: 'รหัสย่อ', color: 'สี', note: 'หมายเหตุ', noColor: 'ไม่ระบุสี' },
  columns: { name: 'ลูกค้า', code: 'รหัสย่อ', projects: 'โปรเจค' },
  projectCount: (n: number) => `${n} โปรเจค`,
  showArchived: 'แสดงลูกค้าที่ archive',
  hideArchived: 'ซ่อนลูกค้าที่ archive',
  archivedChip: 'archive แล้ว',
  empty: 'ยังไม่มีลูกค้า',
  emptyWorker: 'ยังไม่มีลูกค้าของโปรเจคที่คุณเป็นสมาชิก',
  projectsHeading: 'โปรเจคของลูกค้านี้',
  noProjects: 'ยังไม่มีโปรเจค',
  archive: 'Archive ลูกค้า',
  unarchive: 'เลิก archive',
  toasts: {
    created: (name: string) => `เพิ่มลูกค้า "${name}" แล้ว`,
    saved: 'บันทึกแล้ว',
    archived: (name: string) => `archive ลูกค้า "${name}" แล้ว`,
    unarchived: (name: string) => `เลิก archive ลูกค้า "${name}" แล้ว`,
  },
  errors: {
    nameRequired: 'กรุณาใส่ชื่อลูกค้า',
    nameTooLong: 'ชื่อลูกค้ายาวเกิน 120 ตัวอักษร',
    nameTaken: 'มีลูกค้าชื่อนี้แล้ว (อาจถูก archive อยู่)',
  },
  notFound: { title: 'ไม่พบลูกค้า', body: 'ลูกค้านี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง', back: 'ไปที่รายการลูกค้า' },
},

masking: { otherProjects: 'งานในโปรเจคอื่น' },        // M5 adds `leave`

audit: { /* …M1 builders… */
  clientCreated: (name: string) => `สร้างลูกค้า ${name}`,
  clientUpdated: (name: string) => `แก้ไขลูกค้า ${name}`,
  clientArchived: (name: string) => `archive ลูกค้า ${name}`,
  clientUnarchived: (name: string) => `เลิก archive ลูกค้า ${name}`,
  projectCreated: (name: string) => `สร้างโปรเจค ${name}`,
  projectUpdated: (name: string) => `แก้ไขโปรเจค ${name}`,
  projectArchived: (name: string) => `archive โปรเจค ${name}`,
  projectUnarchived: (name: string) => `เลิก archive โปรเจค ${name}`,
  projectDeleted: (name: string) => `ลบโปรเจค ${name} ถาวร`,
  memberAdded: (project: string, person: string, role: string) => `เพิ่ม ${person} เป็น ${role} ใน ${project}`,
  memberRoleChanged: (project: string, person: string, role: string) => `เปลี่ยน ${person} เป็น ${role} ใน ${project}`,
  memberRemoved: (project: string, person: string) => `นำ ${person} ออกจาก ${project}`,
},
```
Done-check: `pnpm typecheck`, `pnpm eslint src/i18n`.

**S0.9 Zod schemas (`src/lib/schemas/`)**, shared by forms and actions (Zod 4, messages from `th`, `import { z } from '@/lib/z'`):
```ts
// src/lib/schemas/common.ts (add if absent)
export const userIdSchema = z.string().min(1).max(64)                                  // M2-D14
export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: th.projects.errors.invalidColor })
  .transform((v) => v.toUpperCase())
export const optionalText = (max: number, error: string) =>
  z.string().trim().max(max, { error }).transform((v) => (v === '' ? null : v)).nullable().optional()

// src/lib/schemas/clients.ts
const clientName = z.string().trim().min(1, { error: th.clients.errors.nameRequired })
  .max(120, { error: th.clients.errors.nameTooLong })
export const createClientSchema = z.object({ name: clientName,
  code: optionalText(20, th.projects.errors.codeTooLong), color: colorSchema.nullable().optional(),
  note: optionalText(2000, th.projects.errors.noteTooLong) })
export const updateClientSchema = z.object({ clientId: z.uuid(), name: clientName.optional(),
  code: optionalText(20, th.projects.errors.codeTooLong), color: colorSchema.nullable().optional(),
  note: optionalText(2000, th.projects.errors.noteTooLong) })
export const clientIdSchema = z.object({ clientId: z.uuid() })

// src/lib/schemas/projects.ts
const projectName = z.string().trim().min(1, { error: th.projects.errors.nameRequired })
  .max(200, { error: th.projects.errors.nameTooLong })
export const certaintySchema = z.enum(['CONFIRMED', 'TENTATIVE'])
export const createProjectSchema = z.object({ name: projectName, clientId: z.uuid().nullable().optional(),
  code: optionalText(20, th.projects.errors.codeTooLong), color: colorSchema.optional(),
  certainty: certaintySchema.optional(), certaintyNote: optionalText(500, th.projects.errors.noteTooLong),
  leadUserId: userIdSchema.nullable().optional() })
export const updateProjectSchema = z.object({ projectId: z.uuid(), name: projectName.optional(),
  clientId: z.uuid().nullable().optional(), code: optionalText(20, th.projects.errors.codeTooLong),
  color: colorSchema.optional(), certainty: certaintySchema.optional(),
  certaintyNote: optionalText(500, th.projects.errors.noteTooLong) })
  // undefined = unchanged; null = clear (clientId, code, certaintyNote)
export const projectIdSchema = z.object({ projectId: z.uuid() })
export const deleteProjectSchema = z.object({ projectId: z.uuid(), confirmName: z.string().max(400) })

// src/lib/schemas/members.ts
export const projectRoleSchema = z.enum(['LEAD', 'MEMBER'])
export const addMemberSchema = z.object({ projectId: z.uuid(), userId: userIdSchema,
  role: projectRoleSchema.default('MEMBER') })
export const changeMemberRoleSchema = z.object({ projectId: z.uuid(), userId: userIdSchema, role: projectRoleSchema })
export const removeMemberSchema = z.object({ projectId: z.uuid(), userId: userIdSchema })
```
- Preference key (S0 runs alone, so it may edit the M1 registry file wherever it lives; report its path): in the M1 preference registry add `'sidebar.expanded': z.array(z.string().max(80)).max(500)` (values `project:<uuid>`; M4 adds `page:<uuid>`), only if absent.
- Test first — `src/lib/schemas/projects.test.ts` (unit): `createProjectSchema.parse({ name: '  POS  ' }).name === 'POS'`; `{ name: '   ' }` fails with `th.projects.errors.nameRequired`; `code: ''` → `null`; `color: '#2f5597'` → `'#2F5597'`; `color: 'blue'` fails; `clientId: 'x'` fails; `updateProjectSchema` keeps `clientId: null`. `src/lib/schemas/clients.test.ts`: 121-char name fails with `nameTooLong`; `members.test.ts`: `addMemberSchema.parse({ projectId, userId: 'u1' }).role === 'MEMBER'`.

**S0.10 Shared helpers.**
- `src/lib/collate.ts` (M2-D18):
  ```ts
  const collator = new Intl.Collator('th')
  export const compareThai = (a: string, b: string): number => collator.compare(a, b)
  export const sortByThai = <T>(items: readonly T[], key: (t: T) => string): T[] => [...items].sort((a, b) => compareThai(key(a), key(b)))
  ```
  Test first `src/lib/collate.test.ts`: `sortByThai(['Store Analytics Dashboard','CRM Migration','POS Upgrade','Data Warehouse','Mobile App Revamp'], (s) => s)` → `['CRM Migration','Data Warehouse','Mobile App Revamp','POS Upgrade','Store Analytics Dashboard']`; Thai `['ข','ก','ค']` → `['ก','ข','ค']`; case-insensitive `['b','A']` → `['A','b']`.
- `src/lib/project-colors.ts`: `export const DEFAULT_PROJECT_COLOR = '#2F5597'` and `export const PROJECT_COLORS = ['#2F5597','#1F3864','#0F766E','#15803D','#A16207','#B45309','#B91C1C','#BE185D','#7E22CE','#4338CA','#0369A1','#475569'] as const`.
- `src/lib/api.ts` (only if M0/M1 did not create it): `export class ApiError extends Error { status; code }` and `export async function getJson<T>(url: string, init?: RequestInit): Promise<T>` (`fetch(url, { ...init, headers: { accept: 'application/json' } })`; non-2xx → parse `{ code, message }` → throw `ApiError`).
- `src/server/page-helpers.ts`:
  ```ts
  import 'server-only'
  import { notFound } from 'next/navigation'
  import { NotFoundError } from '@/server/errors'
  export async function orNotFound<T>(p: Promise<T>): Promise<T> {
    try { return await p } catch (e) { if (e instanceof NotFoundError) notFound(); throw e }
  }
  ```

**S0.11 Authz signatures (`src/server/authz.ts`)** — append to M1's file; bodies `throw notImplemented('M2 S1')` (M1's helper in `src/server/errors.ts` → `'NOT_IMPLEMENTED: M2 S1'`). Also extend `AuditEntity` in `src/server/audit.ts` with `'client' | 'project' | 'project_member'` (X93; no other change to M1's file).
```ts
export type Need = 'view' | 'edit' | 'manage' | 'owner'
export interface ProjectAccess { role: ProjectAccessRole; archived: boolean }
export async function projectAccess(tx: DbOrTx, user: SessionUser, projectId: string): Promise<ProjectAccess | null>
export async function requireProject(tx: DbOrTx, user: SessionUser, projectId: string, need: Need,
  opts?: { allowArchived?: boolean }): Promise<ProjectAccess>                                 // M2-D02
export async function requireClient(tx: DbOrTx, user: SessionUser, clientId: string): Promise<{ clientId: string }>  // M2-D01
export async function visibleProjectIds(tx: DbOrTx, user: SessionUser): Promise<'ALL' | Set<string>>
export async function visibleUserIds(tx: DbOrTx, user: SessionUser): Promise<'ALL' | Set<string>>
export async function canSeeUserDetails(tx: DbOrTx, viewer: SessionUser, userId: string): Promise<boolean>
export async function isLeadAnywhere(tx: DbOrTx, user: SessionUser): Promise<boolean>
```

**S0.12 Service, action and route stubs** (exact signatures; bodies `throw notImplemented('M2 S1')`). Register the service files in M1's barrel `src/server/services/index.ts`: `export * as clients`, `projects`, `members`, `people`, `sidebar` (X87; `masking.ts` is imported directly by services, not through the barrel).
```ts
// src/server/services/people.ts
export async function listPeopleOptions(tx: DbOrTx): Promise<PersonOption[]>
// src/server/services/sidebar.ts
/** `today` (X90) comes from the route (`serverToday()`); unused in M2 (`_today`), M3's `countMyOpenTasks(tx, userId, today)` needs it. */
export async function getSidebar(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<SidebarResponse>
// src/server/services/clients.ts
export async function listClientsForViewer(tx: DbOrTx, user: SessionUser, opts: { includeArchived: boolean }): Promise<ClientListItem[]>
export async function getClientDetail(tx: DbOrTx, user: SessionUser, clientId: string): Promise<ClientDetail>
export async function listClientOptions(tx: DbOrTx, user: SessionUser, projectId: string | null): Promise<ClientOption[]>
export async function createClient(tx: DbOrTx, user: SessionUser, input: z.output<typeof createClientSchema>): Promise<ClientRow>
export async function updateClient(tx: DbOrTx, user: SessionUser, input: z.output<typeof updateClientSchema>): Promise<{ before: ClientRow; after: ClientRow }>
export async function setClientArchived(tx: DbOrTx, clientId: string, archived: boolean): Promise<{ client: ClientRow; changed: boolean }>
// src/server/services/projects.ts
export async function listProjectsForViewer(tx: DbOrTx, user: SessionUser, opts: { archived: boolean }): Promise<ProjectListItem[]>
export async function getProjectHeader(tx: DbOrTx, user: SessionUser, projectId: string): Promise<ProjectHeader>
export async function getProjectOverview(tx: DbOrTx, user: SessionUser, projectId: string): Promise<ProjectOverview>
export async function createProject(tx: DbOrTx, user: SessionUser, input: z.output<typeof createProjectSchema>): Promise<ProjectRow>
export async function updateProject(tx: DbOrTx, user: SessionUser, input: z.output<typeof updateProjectSchema>): Promise<{ before: ProjectRow; after: ProjectRow; certaintyChanged: boolean }>
export async function setProjectArchived(tx: DbOrTx, projectId: string, archived: boolean): Promise<{ project: ProjectRow; changed: boolean }>
export async function collectProjectFileKeys(tx: DbOrTx, projectId: string): Promise<string[]>        // M2: [] (X26 → M4)
export async function deleteProjectRow(tx: DbOrTx, projectId: string): Promise<ProjectRow>
export async function unlinkFilesBestEffort(keys: readonly string[]): Promise<void>                    // M2: no-op (M4)
// src/server/services/members.ts
export type LeadWarning = 'NO_LEAD'
export async function addMember(tx: DbOrTx, user: SessionUser, input: z.output<typeof addMemberSchema>): Promise<{ member: ProjectMemberRow; personName: string }>
export async function changeMemberRole(tx: DbOrTx, user: SessionUser, input: z.output<typeof changeMemberRoleSchema>): Promise<{ previousRole: ProjectRole; personName: string; warning?: LeadWarning }>
export async function removeMember(tx: DbOrTx, user: SessionUser, input: z.output<typeof removeMemberSchema>): Promise<{ removedRole: ProjectRole; personName: string; blockedByAssignments: 0; warning?: LeadWarning }>
```
Actions (`'use server'`, using M1's `action()`):
```ts
// src/server/actions/clients.ts
export const createClient = action(createClientSchema, async (input, ctx): Promise<{ clientId: string }> => stub())
export const updateClient = action(updateClientSchema, async (input, ctx): Promise<Record<string, never>> => stub())
export const archiveClient = action(clientIdSchema, async (input, ctx): Promise<{ changed: boolean }> => stub())
export const unarchiveClient = action(clientIdSchema, async (input, ctx): Promise<{ changed: boolean }> => stub())
// src/server/actions/projects.ts
export const createProject = action(createProjectSchema, async (input, ctx): Promise<{ projectId: string }> => stub())
export const updateProject = action(updateProjectSchema, async (input, ctx): Promise<{ certaintyChanged: boolean }> => stub())
export const archiveProject = action(projectIdSchema, async (input, ctx): Promise<{ changed: boolean }> => stub())
export const unarchiveProject = action(projectIdSchema, async (input, ctx): Promise<{ changed: boolean }> => stub())
export const deleteProjectPermanently = action(deleteProjectSchema, async (input, ctx): Promise<Record<string, never>> => stub())
// src/server/actions/members.ts
export const addMember = action(addMemberSchema, async (input, ctx): Promise<{ role: ProjectRole }> => stub())
export const changeMemberRole = action(changeMemberRoleSchema, async (input, ctx):
  Promise<{ previousRole: ProjectRole; warning?: 'NO_LEAD' }> => stub())
export const removeMember = action(removeMemberSchema, async (input, ctx):
  Promise<{ removedRole: ProjectRole; blockedByAssignments: 0; selfRemoved: boolean; warning?: 'NO_LEAD' }> => stub())
```
Route handlers (M1's `route()`):
```ts
// src/app/api/sidebar/route.ts
export const GET = route(async (_req, { user }): Promise<SidebarResponse> => stub())
// src/app/api/people/options/route.ts
export const GET = route(async (_req, { user }): Promise<PeopleOptionsResponse> => stub())
// src/app/api/clients/options/route.ts
export const GET = route(async (_req, { user, url }): Promise<ClientOptionsResponse> => stub(),
  { query: z.object({ projectId: z.uuid().optional() }) })
```
(`stub()` = a local `function stub(): never { throw notImplemented('M2 S1') }` in each file; adapt generics to M1's actual `action`/`route` signatures.)

**S0.13 Nav entries (X33, X84).** In M0's `src/components/shell/nav.ts`: extend `NavIcon` with `'projects' | 'clients'`; add `export const PROJECTS_NAV: NavItem = { id: 'projects', href: '/projects', label: th.nav.projects, icon: 'projects' }` as the header of the projects section (S2 renders `SidebarProjects` under it; it is in neither `PRIMARY_NAV` nor `BOTTOM_NAV`) and insert `{ id: 'clients', href: '/clients', label: th.nav.clients, icon: 'clients' }` into `BOTTOM_NAV` **before** M1's `settings` (§8.1 "🏢 ลูกค้า"; M9 later inserts `people` before `clients`). `Sidebar`'s `NAV_ICONS` gains `projects: FolderOutlined`, `clients: BusinessOutlined` (path imports `@mui/icons-material/FolderOutlined`, `@mui/icons-material/BusinessOutlined`). Do **not** add "ทีมงาน" (M9). Follow the config's existing item shape exactly. If M0 named the config file differently from `src/components/shell/nav*.ts`, edit it anyway (S0 runs alone) and report the path.

**S0.14 Test helpers (`tests/helpers/**`).**
- `factories.ts`: add
  ```ts
  export async function makeClient(opts?: { name?: string; code?: string; color?: string; archived?: boolean }): Promise<ClientRow>
  export async function makeProject(opts: { lead?: TestUser | null; members?: TestUser[]; client?: ClientRow | null;
    certainty?: Certainty; archived?: boolean; name?: string; createdBy?: TestUser }): Promise<ProjectRow>
  ```
  with plain Drizzle inserts on `clients` / `projects` / `project_members` (M2-D13, X91 — never through `src/server/repo/**`; `createdBy` defaults to the first manager in the DB or a new one; names default to `'Project <n>'`/`'Client <n>'` with a counter; ids are DB-generated v4 UUIDs).
- `world.ts`: extend `createWorld()` so it always also builds:
  - clients **C1**, **C2**, **C3** (C3 archived, no projects);
  - **P** = `makeProject({ name: 'World P', client: C1, lead: lead, members: [member] })`;
  - **Q** = `makeProject({ name: 'World Q', client: C2, members: [outsider] })` (no LEAD);
  - **A** = `makeProject({ name: 'World A', client: C1, lead: lead, members: [member], archived: true })`.
  Expose `w.C1 … w.C3`, `w.P`, `w.Q`, `w.A` (rows) next to the M1 users.
- `as-user.ts`: add `export async function currentUser(): Promise<SessionUser>` (returns the user set by `asUser`, throws if none) — lets matrix rows call page loaders.
- `outcome.ts`: add `export async function outcomeOfCall(fn: () => Promise<unknown>): Promise<Outcome>` that maps a resolved value through `outcomeOf` and a thrown `AppError` by its HTTP status (`NotFoundError` → `'404'`, `ForbiddenError` → `'403'`, `ConflictError` → `'409'`, `ValidationError` → `'400'`, `UnauthenticatedError` → `'401'`), rethrowing anything else.
- Test first — `tests/helpers/world.int.test.ts` (integration project; S0 creates it, S3 may extend): `createWorld()` → `select count(*) from project_members` = 5 (P: 2, Q: 1, A: 2); `w.A.archivedAt !== null`; `w.C3.archivedAt !== null`; P.clientId = C1.id.

**S0.15 G0.** `pnpm db:generate` ("No schema changes"), `pnpm check` green, `pnpm exec next typegen` OK. Report: migration file name, exact M1 signatures adapted, any helper that already existed.

### 5.S1 — Backend: authz, services, actions, routes, seed (backend-engineer · src/server/**, src/app/api/**, scripts/**)

Test-first: write each `*.int.test.ts` block listed in a step before its implementation. All integration tests mock `next/cache` (`refresh`) and `next/headers` as in `plan/research/snippets/r4/vitest/tests/integration/rename-task.test.ts` (the M1 `db-worker.ts` already does this) and use `createWorld()` / factories.

**S1.1 Repo functions** (`src/server/repo/{clients,projects,members,people}.ts`; every function takes `tx: DbOrTx` first, never opens a transaction, filters `projects.deleted_at is null`):
```ts
// clients
getClient(tx, id): Promise<ClientRow | null> · findClientByName(tx, name): Promise<ClientRow | null>
updateClientRow(tx, id, patch: Partial<Pick<ClientRow,'name'|'code'|'color'|'note'>>): Promise<ClientRow>
setClientArchivedAt(tx, id, archived: boolean): Promise<ClientRow>          // archived_at = now() | null
listClients(tx, f: { ids?: ReadonlySet<string>; includeArchived: boolean }): Promise<ClientRow[]>
clientIdsOfProjects(tx, projectIds: 'ALL' | ReadonlySet<string>): Promise<Set<string>>
// projects
getProject(tx, id): Promise<ProjectRow | null>
updateProjectRow(tx, id, patch): Promise<ProjectRow> · setProjectArchivedAt(tx, id, archived: boolean): Promise<ProjectRow>
deleteProject(tx, id): Promise<ProjectRow | null>                            // DELETE … RETURNING
listProjects(tx, f: { ids: 'ALL' | ReadonlySet<string>; archived?: boolean; clientId?: string }): Promise<ProjectRow[]>
existsArchivedVisible(tx, ids: 'ALL' | ReadonlySet<string>): Promise<boolean>
// members
getMember(tx, projectId, userId): Promise<ProjectMemberRow | null>
listMembers(tx, projectId): Promise<(ProjectMemberRow & MemberUser)[]>      // join "user" + positions
listMembersOf(tx, projectIds: readonly string[]): Promise<(ProjectMemberRow & MemberUser)[]>
lockLeadRows(tx, projectId): Promise<{ userId: string; active: boolean }[]> // … WHERE role = 'LEAD' FOR UPDATE (.for('update'))
updateMemberRole(tx, projectId, userId, role): Promise<void> · deleteMember(tx, projectId, userId): Promise<boolean>
membershipsOf(tx, userId): Promise<{ projectId: string; role: ProjectRole; archived: boolean }[]>
// people
listPeople(tx): Promise<PersonOption[]>     // user left join positions; active = !banned && deactivated_on is null
```
`MemberUser.active` uses the same definition as `PersonOption.active` (M2-D16). Namespaces are pinned (X87): `repo.clients`, `repo.projects`, **`repo.members`** (file `repo/members.ts`; M10 reuses `repo.members.listMembers(tx, projectId)` for embed workload, so keep that name and return shape), `repo.people`. Left for M9 (do not add now): `repo.people.getPerson` (its person-header shape) and, if needed, `repo.projects.listByIds`. Done-check: covered by S1.2–S1.6 tests.

**S1.2 Authz bodies (`src/server/authz.ts`).** Test first — `src/server/authz.int.test.ts`:

| it | Setup | Expect |
|---|---|---|
| projectAccess manager | `w.manager`, P | `{ role: 'MANAGER', archived: false }` (also when the manager is a member) |
| projectAccess lead / member | P | `LEAD` / `MEMBER`, `archived: false`; A → `archived: true` |
| projectAccess outsider | P | `null` |
| projectAccess unknown / malformed id | `randomUUID()`, `'abc'` | `null` (no DB error) |
| requireProject view | outsider · P | throws `NotFoundError` |
| requireProject manage by member | member · P | `ForbiddenError` |
| requireProject edit on archived | lead · A · `'edit'` | `ForbiddenError` with `message === th.projects.errors.archivedReadOnly` |
| requireProject owner | lead · P → `ForbiddenError`; manager · A → ok | |
| requireProject allowArchived | lead · A · `'manage'`, `{ allowArchived: true }` | ok; member same → `ForbiddenError` |
| requireClient | lead · C1 ok · lead · C2 → `NotFoundError` · outsider · C2 ok · member · C3 → `NotFoundError` · manager · C3 ok | |
| visibleProjectIds | manager → `'ALL'`; lead → `{P, A}`; outsider → `{Q}` | |
| isLeadAnywhere | lead → true; member → false; a user whose only LEAD role is on an archived project → false | |
| visibleUserIds | manager → `'ALL'`; lead → `'ALL'`; member → `{member, lead}` (A is archived and adds nothing); outsider → `{outsider}`; after adding a deactivated user `d` to P → member's set contains `d` | |
| canSeeUserDetails | member → outsider `false`; lead → outsider `true`; member → lead `true`; manager → anyone `true` | |

Implementation notes:
- `projectAccess`: `if (!z.uuid().safeParse(projectId).success) return null`; one query `select p.archived_at, pm.role from projects p left join project_members pm on pm.project_id = p.id and pm.user_id = $user where p.id = $1 and p.deleted_at is null`; manager → `MANAGER` whenever the row exists; worker without `pm` → `null`.
- `requireProject`: null → `throw new NotFoundError()`; `need === 'view'` → return; archived and `need ∈ {edit, manage}` and `!opts?.allowArchived` → `throw new ForbiddenError(th.projects.errors.archivedReadOnly)`; `edit` → any role; `manage` → MANAGER | LEAD; `owner` → MANAGER; else `ForbiddenError()`.
- `requireClient`: client row missing → 404; manager → ok; worker → `exists (select 1 from projects p join project_members pm on pm.project_id = p.id where p.client_id = $1 and p.deleted_at is null and pm.user_id = $user)` else 404. Validate the uuid first (malformed → 404).
- `visibleUserIds` SQL (worker, not LEAD anywhere): `select distinct pm2.user_id from project_members pm1 join projects p on p.id = pm1.project_id and p.archived_at is null and p.deleted_at is null join project_members pm2 on pm2.project_id = pm1.project_id where pm1.user_id = $viewer` ∪ `{viewer}`.
- `canSeeUserDetails` = `visibleUserIds` contains `userId` (or `'ALL'`).
- No caching across requests. Done-check: `pnpm vitest run --project integration src/server/authz.int.test.ts`.

**S1.3 Read endpoints: people options, sidebar, client options.** Test first — `src/server/services/people.int.test.ts`, `sidebar.int.test.ts`, and the options block of `clients.int.test.ts`:
- `listPeopleOptions`: returns every user (world users + a deactivated one with `active: false`), each object's keys exactly `['id','name','nickname','positionName','color','active']` (no `email`), sorted by `compareThai(displayName)`.
- `getSidebar(member)` → `projects` = `[P]` only (A archived excluded, Q invisible), `hasArchived: true`, `canCreateProject: false`; `getSidebar(manager)` → `[P, Q]` sorted with `compareThai`, `hasArchived: true`, `canCreateProject: true`; `getSidebar(outsider)` → `[Q]`, `hasArchived: false`; each item has exactly `id, name, color, certainty`.
- `listClientOptions(manager, null)` → `[C1, C2]` (C3 archived excluded); `listClientOptions(lead, null)` → `ForbiddenError`; `(lead, P.id)` → `[C1, C2]` (all non-archived, X61); `(member, P.id)` → `ForbiddenError`; `(outsider, P.id)` → `NotFoundError`; `(lead, A.id)` → `ForbiddenError` (archived); after archiving C1, `(lead, P.id)` → `[C2, C1(archived: true)]` (current client appended).
- Routes (thin): `GET /api/people/options` → `{ people: await services.people.listPeopleOptions(db) }`; `GET /api/sidebar` → `services.sidebar.getSidebar(db, user, serverToday())` (X90); `GET /api/clients/options` → parse `ctx.url.searchParams` with the route's `query` schema (use the parsed value M1's `route()` exposes; if it exposes none, `const { projectId } = querySchema.parse(Object.fromEntries(url.searchParams))` — a malformed `projectId` → 400) → `{ clients: await services.clients.listClientOptions(db, user, projectId ?? null) }`. The `route()` wrapper adds `Cache-Control: private, no-store`.
- Done-check: integration tests above green.

**S1.4 Clients: services + actions (FR-301, FR-302, FR-303 part).** Test first — `src/server/services/clients.int.test.ts`:
- `create` trims (`'  SCB '` → `'SCB'`), stores `code`/`color`/`note` nulls when absent; duplicate `'Coral'` while an archived `'Coral'` exists → `ConflictError` with `th.clients.errors.nameTaken` (pre-check) — and a raced insert (simulate by inserting directly after the pre-check via a spy) maps `23505`/`clients_name_unique` to the same error.
- `update` renames, `before`/`after` returned; renaming to an existing name → same `ConflictError`.
- `setClientArchived(C1, true)` → `archived_at` set, `changed: true`; again → `changed: false`; P still has `client_id = C1` and `getProjectHeader(lead, P).client.archived === true`.
- `listClientsForViewer(manager, { includeArchived: false })` → `[C1, C2]` with `projectCount` 2 and 1 (A counts: archived projects are visible); `includeArchived: true` → `[C1, C2, C3]`; `(lead)` → `[C1]` (`projectCount: 2`); `(outsider)` → `[C2]`; workers ignore `includeArchived` (their clients are listed even if archived, chip shown).
- `getClientDetail(lead, C1)` → projects `[A, P]` sorted by name (both visible), `can.manage: false`; `(manager, C1).can.manage === true`; `(lead, C2)` → `NotFoundError`; `(member, 'not-a-uuid')` → `NotFoundError`.
- Action skeleton (all four follow it; `refresh()` per M2-D09):
  ```ts
  export const createClient = action(createClientSchema, async (input, { user }) => {
    const client = await db.transaction(async (tx) => {
      requireManager(user)                                                     // FORBIDDEN for workers
      const c = await services.clients.createClient(tx, user, input)
      await audit.log(tx, user, { entity: 'client', entityId: c.id, action: 'create',
        summary: th.audit.clientCreated(c.name), after: { name: c.name, code: c.code, color: c.color } })
      return c
    })
    refresh()
    return { clientId: client.id }
  })
  ```
  `updateClient` (`action: 'update'`, before/after), `archiveClient` / `unarchiveClient` (`action: 'update'`, `after: { archivedAt }`; no audit row when `changed: false`). Client CRUD has no `projectId` in the audit row.
- Action test (in the same file, `describe('actions')`): worker `createClient` → `{ ok: false, code: 'FORBIDDEN' }`; manager → ok, one audit row `entity='client'`, `refresh` called once.
- Done-check: `pnpm vitest run --project integration src/server/services/clients.int.test.ts`.

**S1.5 Projects: services + actions (FR-401, FR-405 part, FR-406 part, FR-407, FR-409 part).** Test first — `src/server/services/projects.int.test.ts`:
- **create**: manager creates `{ name: 'ระบบจองห้องประชุม', clientId: C1, certainty: 'TENTATIVE', leadUserId: member.id }` → project row (`created_by = manager`, colour `#2F5597`), one `project_members` row `(LEAD, added_by = manager)`, **exactly one** audit row (`entity 'project'`, `action 'create'`, `project_id` = new id, `after.leadUserId`). Without `leadUserId` → no member rows and `getProjectOverview(manager).warnings.noLead === true`. `clientId = C3` (archived) → `ValidationError` (`th.projects.errors.clientArchived`); unknown clientId → `ValidationError` (`clientNotFound`); `leadUserId` of a deactivated user → `ValidationError` (`leadInactive`). Worker → action `FORBIDDEN`.
- **update**: lead renames P → audit `before.name/after.name`; `clientId: null` clears; `clientId: C3` (archived, different from current) → `ValidationError`; keeping the current archived client is allowed; `certainty: 'TENTATIVE'` → `certaintyChanged: true` and `refresh` called; unchanged certainty → `certaintyChanged: false`; member → 403; A (archived) → 403; outsider → 404.
- **archive/unarchive**: lead archives P → `archived_at` set; `getSidebar(member).projects` no longer contains P; `getProjectOverview(member, P).project.archived === true` and `can.manage === false`; second archive → 403 (read-only); `unarchiveProject` by lead → `archived_at` null; unarchive of an active project → `{ changed: false }` and no audit row.
- **delete**: `deleteProjectPermanently({ projectId: P, confirmName: '  World P ' })` by manager → P gone, `project_members` rows for P = 0, audit row (`action 'delete'`, `project_id = P.id`) **still present after commit**; `confirmName: 'World'` → `ValidationError` (`deleteNameMismatch`) and nothing deleted; lead → 403; outsider → 404; archived A by manager → ok. Spy `collectProjectFileKeys` (called inside the tx) and `unlinkFilesBestEffort` (called once after commit with `[]`).
- **loaders**: `listProjectsForViewer(lead, { archived: false })` → `[P]`; `{ archived: true }` → `[A]`; manager → `[P, Q]` / `[A]`; `ProjectListItem.leads` of P = `[lead]`, `memberCount` 2, `myRole` `LEAD`; `getProjectOverview(member, P)` → members sorted LEAD first then `compareThai(displayName)`, `myRole 'MEMBER'`, `can` all false; outsider → `NotFoundError`; overview of Q → `warnings.noLead: true`; a project whose only LEAD is deactivated → `noLead: true` (M2-D17).
- Action skeletons:
  ```ts
  export const updateProject = action(updateProjectSchema, async (input, { user }) => {
    const res = await db.transaction(async (tx) => {
      await requireProject(tx, user, input.projectId, 'manage')               // 404 / 403 / archived 403
      const r = await services.projects.updateProject(tx, user, input)       // validates client, computes diff
      await audit.log(tx, user, { entity: 'project', entityId: input.projectId, action: 'update',
        projectId: input.projectId, summary: th.audit.projectUpdated(r.after.name),
        before: pickChanged(r.before, input), after: pickChanged(r.after, input) })
      return r
    })
    refresh()                                                                 // header + overview are RSC (X18)
    return { certaintyChanged: res.certaintyChanged }
  })
  // pickChanged(row, input): object with only the columns named in `input` (minus projectId) whose value changed —
  // a small local helper in actions/projects.ts; audit before/after never contain unrelated columns.

  export const deleteProjectPermanently = action(deleteProjectSchema, async ({ projectId, confirmName }, { user }) => {
    const keys = await db.transaction(async (tx) => {
      await requireProject(tx, user, projectId, 'owner')                     // M only; archived allowed
      const p = await repo.projects.getProject(tx, projectId)
      if (!p) throw new NotFoundError()
      if (confirmName.trim() !== p.name.trim()) throw new ValidationError(th.projects.errors.deleteNameMismatch)
      const fileKeys = await services.projects.collectProjectFileKeys(tx, projectId)   // [] until M4
      await services.projects.deleteProjectRow(tx, projectId)                // FK cascade: members (+ later tables)
      await audit.log(tx, user, { entity: 'project', entityId: projectId, action: 'delete', projectId,
        summary: th.audit.projectDeleted(p.name), before: { name: p.name } })
      return fileKeys
    })
    await services.projects.unlinkFilesBestEffort(keys)                      // after commit; logs failures only
    return {}                                                                 // no refresh (M2-D09)
  })
  ```
  `createProject`: `requireManager(user)` → insert project → optional LEAD row (`added_by = user.id`) → one audit row → return `{ projectId }` (no refresh). `archiveProject`: `requireProject(…, 'manage')` → `setProjectArchived(true)` → audit (`summary: th.audit.projectArchived`) → `refresh()`. `unarchiveProject`: `requireProject(…, 'manage', { allowArchived: true })` → `setProjectArchived(false)` → audit when changed → `refresh()`.
- Done-check: `pnpm vitest run --project integration src/server/services/projects.int.test.ts`.

**S1.6 Members: services + actions (FR-403, FR-404 part, BR-62).** Test first — `src/server/services/members.int.test.ts`:
- `addMember(lead, { P, outsider })` → role `MEMBER`, `added_by = lead`; audit `entity 'project_member'`, `entityId = '<projectId>:<userId>'`, `action 'create'`, `project_id = P`; adding `member` again → `ConflictError` (`th.members.errors.alreadyMember`); adding a deactivated user → `ValidationError` (`userInactive`); unknown user id → `NotFoundError`.
- `changeMemberRole(lead, member → LEAD)` → ok, `previousRole 'MEMBER'`; then lead demotes self → ok (another LEAD exists).
- **BR-62**: P with one LEAD: lead demotes self → `ConflictError` code `CONFLICT`, message `th.members.errors.lastLead`; lead removes self → same; manager demotes / removes lead → ok with `warning: 'NO_LEAD'`; a deactivated LEAD does not count as the "other" LEAD (active only).
- **BR-62 race**: P with two LEADs (lead, member promoted); run `Promise.all([db.transaction(tx => changeMemberRole(tx, lead, { userId: lead.id, role: 'MEMBER' })), db.transaction(tx => changeMemberRole(tx, member, { userId: member.id, role: 'MEMBER' }))])` with `allSettled` → exactly one fulfilled, one rejected with `lastLead` (the `FOR UPDATE` lock serialises them).
- `removeMember(lead, member)` → row deleted, `blockedByAssignments: 0`, `removedRole: 'MEMBER'`; removing a non-member → `NotFoundError` (`notMember`); undo path = `addMember({ role: removedRole })` restores the same role.
- Actions: `addMember` / `changeMemberRole` / `removeMember` → `requireProject(tx, user, projectId, 'manage')` first (Me 403, W 404, archived 403), then service, then audit (`th.audit.memberAdded(project.name, displayName, role)` etc.), then `refresh()` — except `removeMember` when `userId === user.id` (`selfRemoved: true`, no refresh, M2-D19).
- Done-check: `pnpm vitest run --project integration src/server/services/members.int.test.ts`.

**S1.7 Golden seed (X11, M2-D12).** In `scripts/lib/fixtures.ts` add `seedClientsProjects(db, ctx)` and call it from `seedGolden(db, { upTo })` after users when `upTo` ≥ `'M2'` (follow M1's `upTo` convention):
- clients from `fixtures.clients` in JSON order (`insertClient({ name })`);
- projects from `fixtures.projects` in JSON order: `insertProject({ name, clientId: byName(client), certainty, createdBy: managerId })`;
- members: LEAD = `project.lead`; MEMBER = distinct `tasks.filter(t => t.project === p.name).map(t => t.assignee)` minus the LEAD, in task order; `addedBy: managerId`;
- users looked up by `nickname`; no audit rows; refuses `NODE_ENV=production` (M1 guard).
Test first — `scripts/lib/fixtures.int.test.ts › M2`: after `seedGolden(db)` → 4 clients, 5 projects, 10 `project_members` (5 LEAD); POS members `{Cindy: LEAD, Ivy: MEMBER, Mint: MEMBER}`, DW `{Peter: LEAD}`, Mobile `{Jack: LEAD, Mint: MEMBER}`, CRM `{Cindy: LEAD, Ivy: MEMBER}`, Store `{Peter: LEAD, Jack: MEMBER}`; CRM and Store `certainty = 'TENTATIVE'`.
- Done-check: `pnpm seed:golden` on the dev DB prints the counts; `pnpm vitest run --project integration scripts`.

**S1.8 G1 for S1.** `pnpm vitest run --project integration src/server scripts` · `pnpm eslint src/server src/app/api scripts` · `pnpm typecheck` (own paths clean). Report requests (e.g. extra i18n keys outside `audit`).

### 5.S2 — Frontend: sidebar, projects, overview, members, clients (frontend-engineer · src/app/(app)/{projects,clients}/**, src/components/{shell,common,projects,clients}/**, src/hooks/**, src/lib/people/**)

Rules for every S2 file: MUI 9 API only (`slots`/`slotProps`, `sx` instead of system props, `Grid size`); `next/link` via `@/components/Link`; icons by path import; every string from `th`; no `localStorage`; no `router.refresh()` (server actions call `refresh()`); forms = controlled inputs + `schema.safeParse` with the S0 schemas and `z.flattenError(e).fieldErrors` → `helperText`; every action call goes through `unwrap()` (`src/lib/action-result.ts`) inside `useMutation` so `onError` shows `toast.error(err.message)`. Component tests live in the `ui` project (`afterEach(cleanup)` comes from `tests/setup/ui.ts`); wrap renders in a test `QueryClientProvider` and the MUI theme from M0.

**S2.1 Shared components (`src/components/common/`)** — built here, reused by M3+ (PLAN §3.9):
- `CertaintyBadge.tsx` — `{ certainty: Certainty; showConfirmed?: boolean }`. TENTATIVE → `<Box component="span" role="img" aria-label={th.projects.certainty.TENTATIVE}>` with `th.projects.tentativeGlyph` inside an MUI `Tooltip` (title = same label); CONFIRMED → `null` unless `showConfirmed` (then a small outlined `Chip` labelled `th.projects.certainty.CONFIRMED`). Never colour only.
- `ProjectChip.tsx` — `{ project: { id; name; color; certainty }; href?: string; archived?: boolean }`: 10 px colour square (`aria-hidden`), name, `CertaintyBadge`, optional `Chip` `th.projects.archivedChip`; renders a `Link` when `href` is given.
- `InlineEditText.tsx` — `{ value: string; onCommit: (next: string) => Promise<void>; label: string; disabled?: boolean; maxLength?: number; variant?: TypographyVariant }`. Click/Enter/F2 → `TextField` (`slotProps.htmlInput={{ maxLength, 'aria-label': label }}`); Enter or blur commits the **trimmed** value when changed and non-empty; Esc cancels; empty → revert without calling `onCommit`; while committing shows a disabled field; on rejection reverts and keeps focus.
- `ColorSwatchPicker.tsx` — `{ value: string | null; onChange(v: string | null): void; allowNone?: boolean; label: string }`: radio group of `PROJECT_COLORS` swatches (`role="radio"`, `aria-label={th.projects.colorOption(hex)}`, `aria-checked`, check icon on the selected one — not colour alone); `allowNone` adds `th.clients.fields.noColor`.
- `PersonPicker.tsx` — MUI `Autocomplete` over `PersonOption[]`: props `{ options: PersonOption[]; excludeIds?: ReadonlySet<string>; onSelect(p: PersonOption): void; label: string; disabled?: boolean; value?: PersonOption | null }`; shows only `active` options not in `excludeIds`; `filterOptions={(opts, s) => filterPeople(opts, s.inputValue)}`; `getOptionLabel = displayName`; option row = `UserAvatar` + display name + full name/position (secondary); `noOptionsText={th.members.pickerEmpty}`; `slotProps` only (no `renderTags`/`ChipProps` — v9 uses `renderValue`/`slotProps.chip`).
- `DeleteProjectDialog.tsx` — **the only confirm dialog** (FR-407): `{ open; projectName; onClose(); onConfirm(typedName: string): Promise<void> }`. MUI `Dialog` (MUI 9: any customisation via `slots`/`slotProps`, e.g. `slotProps={{ paper: { sx: { … } } }}`; no `PaperProps`) whose content is wrapped in a plain `<form onSubmit>` (Enter submits only when enabled), title `th.projects.deleteDialog.title`, body + prompt builders, `TextField` labelled `inputLabel`, confirm `Button color="error"` **disabled until `typed.trim() === projectName.trim()`**, Esc closes, focus trapped (MUI default), pending state disables both buttons.
- `src/lib/people/filter.ts` — `filterPeople(options: readonly PersonOption[], q: string): PersonOption[]`: NFC-normalise and `toLocaleLowerCase('th')` both sides; match substring in `name`, `nickname`, `positionName`; empty `q` → all; keeps input order. `src/lib/people/sort.ts` — `sortPeople(options)` by `compareThai(displayName(p))`.
- `src/hooks/usePeopleOptions.ts` — `useQuery({ queryKey: qk.peopleOptions(), queryFn: () => getJson<PeopleOptionsResponse>('/api/people/options'), staleTime: 5 * 60_000, select: (r) => sortPeople(r.people) })`. `src/hooks/useClientOptions.ts` — `(projectId: string | null, enabled: boolean)` → `GET /api/clients/options?projectId=…`.
- Tests first:
  - `src/lib/people/filter.test.ts` (unit): options Cindy (Project Manager), Ivy (QA), Peter (Data), ชื่อไทย "สมชาย ใจดี" nickname "ชาย" → `filterPeople(o, 'qa')` = [Ivy]; `'ใจ'` = [สมชาย]; `'ชาย'` = [สมชาย]; `' '` = all; `'PATH'` = [Peter].
  - `CertaintyBadge.test.tsx`: TENTATIVE → `getByRole('img', { name: th.projects.certainty.TENTATIVE })` has text `◐`; CONFIRMED → container empty; `showConfirmed` → text `แน่นอน`.
  - `InlineEditText.test.tsx`: type `'  New  '` + Enter → `onCommit('New')` once; Esc → no call, original text back; clear + Enter → no call; rejected promise → value reverts.
  - `PersonPicker.test.tsx`: options incl. an inactive user and an excluded id → neither appears after typing; typing `'ivy'` shows Ivy; selecting calls `onSelect` with Ivy.
  - `DeleteProjectDialog.test.tsx`: confirm disabled initially; typing `'POS'` keeps it disabled; typing `'POS Upgrade '` enables it; click → `onConfirm('POS Upgrade ')`; Esc → `onClose`.
  - `ColorSwatchPicker.test.tsx`: 12 radios; arrow/space selects; selected has `aria-checked="true"`.
- Done-check: `pnpm vitest run --project ui src/components/common` and `pnpm vitest run --project unit src/lib/people`.

**S2.2 Sidebar projects (`src/components/shell/SidebarProjects.tsx`, X33, M2-D08).**
- Mount under the "โปรเจค" nav header added in S0.13 (edit M0's `Sidebar.tsx` in place; keep its collapse behaviour: in the collapsed rail show only the header icon linking to `/projects`).
- Data: `useQuery({ queryKey: qk.sidebar(), queryFn: () => getJson<SidebarResponse>('/api/sidebar') })`; skeleton rows while loading; error → `th.sidebar.loadError` + retry button.
- Rows: `sortByThai(projects, (p) => p.name)` (server already sorts; sort again so optimistic cache writes stay ordered). Each row: expand toggle `IconButton` (`aria-expanded`, `aria-label={th.sidebar.expand(name) | collapse(name)}`), colour square (`aria-hidden`), name as `Link` to `/projects/<id>/overview` (`aria-current="page"` when `usePathname()` starts with `/projects/<id>`), `CertaintyBadge`. Expanded rows show sub-links from `PROJECT_TABS` (S2.3) — only "ภาพรวม" in M2.
- Expanded state: `usePreferences()` key `sidebar.expanded` (array of `project:<id>`), toggled with `setPreference` (debounced by M1); default collapsed. Never localStorage.
- Header actions: `+` `IconButton` (`aria-label={th.sidebar.newProject}`) only when `canCreateProject`; opens `ProjectFormDialog` (S2.4) in create mode. Footer link `th.sidebar.archivedLink` → `/projects?archived=1`, only when `hasArchived`. Empty list → `th.sidebar.noProjects` (muted text).
- Rows are plain list elements with a CSS Module (`SidebarProjects.module.css`), not one MUI component per row (PLAN §3.9 dense surfaces).
- Test first — `src/components/shell/SidebarProjects.test.tsx`: seed `qc.setQueryData(qk.sidebar(), { projects: [Store(TENTATIVE), DW(CONFIRMED)], hasArchived: true, canCreateProject: false })` → link texts in order `['Data Warehouse', 'Store Analytics Dashboard']`; exactly one `img` named `อาจไม่ทำ`; archived link present; no `+` button; with `canCreateProject: true` the `+` button exists; clicking expand calls the mocked `setPreference('sidebar.expanded', ['project:<dwId>'])` and reveals a "ภาพรวม" link to `/projects/<dwId>/overview`.
- Done-check: `pnpm vitest run --project ui src/components/shell`.

**S2.3 Project shell: list page, layout, tabs, not-found.**
- `src/components/projects/project-tabs.ts` (M2-D10):
  ```ts
  export type ProjectTabId = 'overview'                         // M3 'tasks', M4 'pages', M6 'plan'
  /** order is the fixed X84 / M2-D10 scale — overview 0 · plan 1 (M6) · tasks 2 (M3) · pages 3 (M4); never other values. */
  export interface ProjectTab { id: ProjectTabId; order: number; label: string }
  export const PROJECT_TABS: readonly ProjectTab[] = [{ id: 'overview', order: 0, label: th.projects.tabs.overview }]
  export const projectTabHref = (projectId: string, tab: ProjectTabId): string => `/projects/${projectId}/${tab}`
  ```
- `src/components/projects/ProjectTabs.tsx` (`'use client'`): MUI `Tabs` (`aria-label={th.projects.tabsLabel}`) with `Tab component={Link} href=… value=id` for each tab sorted by `order`; value from `useSelectedLayoutSegment()`. Test `ProjectTabs.test.tsx`: renders exactly one `tab` named `ภาพรวม`, selected on segment `overview`.
- `src/app/(app)/projects/page.tsx` (RSC): `const user = await requirePageUser(); const sp = await props.searchParams; const archived = sp.archived === '1'; const items = await listProjectsForViewer(db, user, { archived })`. Renders `ProjectsTable` (client, `src/components/projects/ProjectsTable.tsx`, props `{ items: ProjectListItem[] }` — M9 adds an optional `loadByProject?` prop and column for the client page, so keep the props an object and the columns a list; MUI `Table`: ProjectChip link, client name (+ archived chip), LEAD names via `UserName`, `th.projects.memberCount(n)`, certainty text label), title `listTitle`/`archivedListTitle`, toggle link `showArchived`/`showActive`, empty states (`empty` / `emptyWorker` / `emptyArchived`), and a "สร้างโปรเจค" button for managers (opens `ProjectFormDialog`). Use `PageProps<'/projects'>`.
- `src/app/(app)/projects/[id]/layout.tsx` (RSC) — **authz first, before any Suspense** (X41, M2-D21):
  ```tsx
  export default async function ProjectLayout(props: LayoutProps<'/projects/[id]'>) {
    const user = await requirePageUser()
    const { id } = await props.params
    const header = await orNotFound(getProjectHeader(db, user, id))   // 404 for invisible / unknown / malformed
    return (<>
      <ProjectHeaderBar header={header} />
      <ProjectTabs projectId={header.id} />
      {props.children}
    </>)
  }
  ```
  `ProjectHeaderBar` (client): colour square, name via `InlineEditText` (enabled iff `header.can.manage`; commit → `updateProject({ projectId, name })`), `CertaintyBadge`, client `Chip` linking to `/clients/<id>` (+ archived chip), "archive แล้ว" chip, and the archived banner `th.projects.archivedBanner` (MUI `Alert severity="info"` with text, not colour only) when archived.
- `src/app/(app)/projects/[id]/page.tsx`: `redirect(projectTabHref(id, 'overview'))` (after `await props.params`).
- `src/app/(app)/projects/not-found.tsx` and `src/app/(app)/clients/not-found.tsx`: `EmptyState` with `th.projects.notFound.*` / `th.clients.notFound.*` and a link back. Do **not** create `loading.tsx` under these segments, and check that neither `(app)/loading.tsx` nor M0's `AppShell` wraps `{children}` in `<Suspense>`; if one does, file a request (the orchestrator moves the boundary below the page content) — otherwise the 404 status is lost.
- Done-check: `pnpm vitest run --project ui src/components/projects`; `pnpm typecheck` (PageProps/LayoutProps via `next typegen`).

**S2.4 `ProjectFormDialog` (`src/components/projects/ProjectFormDialog.tsx`)** — create (manager) and edit (M/L) modes.
- Fields: name (required, autofocus), client `Autocomplete` (`useClientOptions(mode === 'edit' ? projectId : null, open)`; option label `name (code)`; "ไม่มีลูกค้า" = null; archived current client shown with chip), code, `ColorSwatchPicker` (default `DEFAULT_PROJECT_COLOR`), certainty `ToggleButtonGroup` (แน่นอน / อาจไม่ทำ, each with text), certainty note (visible when TENTATIVE), LEAD `PersonPicker` (create mode only, optional, helper `th.projects.fields.leadHint`).
- Submit: `createProjectSchema.safeParse` / `updateProjectSchema.safeParse` → field errors; then `useMutation` → `unwrap(await createProject(values))` → `toast.success(th.projects.toasts.created(name))`, `await invalidateProjects(qc)`, `router.push(projectTabHref(projectId, 'overview'))`. Edit → `unwrap(await updateProject(diff))`; send only changed fields; on success `invalidateProjects(qc)` and, if `certaintyChanged`, `invalidateLoad(qc)`; toast `saved`; close. `VALIDATION` errors with `fieldErrors` map back to fields.
- Only the name is required (P1). Test first `ProjectFormDialog.test.tsx` (mock the action module with `vi.mock('@/server/actions/projects')`): empty name → helper `nameRequired`, action not called; valid submit calls `createProject` with `{ name: 'X', certainty: 'CONFIRMED', color: '#2F5597', clientId: null, leadUserId: null }`; note field appears only for TENTATIVE.

**S2.5 Overview page, members panel, certainty, archive, delete.**
- `src/app/(app)/projects/[id]/overview/page.tsx` (RSC): `requirePageUser()` → `await props.params` → `const ov = await orNotFound(getProjectOverview(db, user, id))` → `<ProjectOverview data={ov} />` (client). No Suspense around the lookup.
- `ProjectOverview.tsx` (client) sections:
  1. **ข้อมูลโปรเจค** card: client, code, colour, certainty (`CertaintyToggle` when `can.manage`, else text + badge), certainty note; "แก้ไข" opens `ProjectFormDialog` (edit). FR-409 load/progress/milestones are **not** rendered (X15).
  2. Warning `Alert severity="warning"` with `th.projects.overview.noLead` + `noLeadHint` when `warnings.noLead`.
  3. **สมาชิก** (`MembersPanel`).
  4. Footer actions: `ArchiveProjectButton` (`can.manage` → archive; `can.unarchive` → unarchive), "ลบโปรเจคถาวร" (`can.delete`) → `DeleteProjectDialog`.
  Later milestones add their FR-409 sections in milestone order (C41): M3 progress (+ the status-set settings, PERM-23), then M8 upcoming milestones, then M9 per-member load + 12-week bars — each placed by its own plan, never before section 1 or after the footer. Keep the sections as separate components in a plain list so each insert is one line.
- `CertaintyToggle.tsx`: `ToggleButtonGroup exclusive` (labels from `th.projects.certainty`), on change → `unwrap(await updateProject({ projectId, certainty }))` → `await Promise.all([invalidateLoad(qc), invalidateProjects(qc)])` → `toast(th.projects.toasts.certaintyChanged(label))`. The action's `refresh()` re-renders the header/overview; `invalidateProjects` refreshes the sidebar ◐ (FR-405, no reload).
- `MembersPanel.tsx`: rows (LEAD first, then `compareThai`) with `UserAvatar`, `UserName` (shows "(ปิดใช้งาน)" for inactive, M1), `th.members.you` for the viewer, role: `Select` (`aria-label={th.members.roleLabel}`) when `can.manage`, else a text `Chip`; remove `IconButton` (`aria-label={th.members.remove(name)}`) when `can.manage`. "เพิ่มสมาชิก" `PersonPicker` (when `can.manage`) with `excludeIds` = current member ids → `addMember({ projectId, userId })` → `toast.success(added(name))` + `invalidateProjects(qc)`.
  - Role change → `changeMemberRole`; result `warning === 'NO_LEAD'` → `toast.warning(th.members.toasts.noLeadWarning)`; `CONFLICT` → `toast.error(err.message)` (= "โปรเจคต้องมี LEAD อย่างน้อย 1 คน") and the Select reverts.
  - Remove → `removeMember` → `useUndo().push({ label: th.members.toasts.removed(name), undo: () => unwrap(addMember({ projectId, userId, role: removedRole })).then(() => invalidateProjects(qc)), redo: () => unwrap(removeMember({ projectId, userId })).then(() => invalidateProjects(qc)) }, { toast: th.members.toasts.removed(name) })` — 8 s toast with "เลิกทำ", Cmd+Z works (M1 provider). No confirm (P2). `selfRemoved` → `invalidateProjects(qc)` then `router.push('/projects')`.
- `ArchiveProjectButton.tsx`: archive → `unwrap(archiveProject({ projectId }))` → `invalidateProjects(qc)` → `useUndo().push({ label, undo: unarchive…, redo: archive… }, { toast: th.projects.toasts.archived(name) })`. Unarchive → toast `unarchived(name)` (no undo needed). No confirm dialog (FR-406 / X17).
- Delete: `DeleteProjectDialog onConfirm={(typed) => unwrap(deleteProjectPermanently({ projectId, confirmName: typed })).then(async () => { await invalidateProjects(qc); router.replace('/projects'); toast.success(th.projects.toasts.deleted(name)) })}`.
- Tests first (`ui`): `MembersPanel.test.tsx` — with `can.manage=false` no Select/remove/add controls; with `can.manage=true` removing a member calls `removeMember` and `push` on a mocked `useUndo` with a toast string `th.members.toasts.removed('Ivy')`; `ProjectOverview.test.tsx` — `warnings.noLead` shows `th.projects.overview.noLead`; archived data shows the banner and hides Archive/Edit.
- Done-check: `pnpm vitest run --project ui src/components/projects`.

**S2.6 Clients pages (`/clients`, `/clients/[id]`).**
- `src/app/(app)/clients/page.tsx` (RSC): `listClientsForViewer(db, user, { includeArchived: isManager(user) && sp.archived === '1' })` → `ClientsTable` (client): name (link), code, colour dot (`aria-hidden`), `th.clients.projectCount(n)`, archived chip; managers get "เพิ่มลูกค้า" (`ClientFormDialog`), the archived toggle, and per-row edit / archive (`useUndo` toast `th.clients.toasts.archived(name)`, undo = `unarchiveClient`) or unarchive. Workers: read-only; empty state `emptyWorker`.
- `src/app/(app)/clients/[id]/page.tsx` (RSC): `orNotFound(getClientDetail(db, user, id))` at the top → header (name, code, colour, note, archived chip; manager edit/archive buttons) + `ProjectsTable` of `detail.projects` (reuse from S2.3) or `th.clients.noProjects`. **No load figure** (FR-303 load → M9).
- `ClientFormDialog.tsx`: name (required), code, `ColorSwatchPicker allowNone`, note (multiline); `createClientSchema`/`updateClientSchema` client-side; `CONFLICT` → helper text on the name field = `err.message` (`nameTaken`).
- Tests first: `ClientFormDialog.test.tsx` — empty name → `th.clients.errors.nameRequired`; a mocked `{ ok:false, code:'CONFLICT', message: th.clients.errors.nameTaken }` shows that text under the name field.
- Done-check: `pnpm vitest run --project ui src/components/clients`.

**S2.7 G1 for S2.** `pnpm vitest run --project ui src/components src/hooks` · `pnpm vitest run --project unit src/lib/people` · `pnpm eslint "src/app/(app)/projects" "src/app/(app)/clients" src/components src/hooks src/lib/people` · `pnpm typecheck` (own paths clean). Pages that call S1 services will typecheck against S0 stubs; runtime is verified at G2. Never run `next dev`/`next build`.

### 5.S3 — Tests: authz matrix, visibility, masking, e2e (test-engineer · tests/authz/**, e2e/**)

Rows are written test-first from SPEC §3.2 against the S0 stubs; until S1 lands they fail with "not implemented" — expected (G1 for S3 = compiles, runs, lists those failures). They must be green at G2.

**S3.1 Row harness check.** Read `tests/authz/matrix.int.test.ts` (M1). Rows call actions (session from `asUser`), route handlers (`GET(new Request('http://t/api/sidebar'), { params: Promise.resolve({}) })`) or loaders through `outcomeOfCall(async () => getProjectOverview(db, await currentUser(), w.P.id))` (S0.14). For each `mutates` allow case the harness asserts one new `audit_log` row with the row's `audit: { entity, projectId: (w) => string | null }` (M1's `AuthzRow` already has it, X91; use `projectId: 'any'` for PERM-05, whose project id is new). The `nobody → 401` and `mustChangePassword → 403` loops of M1's matrix already run for every row — no extra block.
- **AZ-2 coverage meta-test** (`tests/authz/coverage.int.test.ts`, new; M1's `T-META-01` in `matrix.int.test.ts` keeps covering action names): import every `src/app/api/**/route.ts` except Better Auth's `api/auth/[...all]` and the public `api/health`, enumerate its exported HTTP methods, build `'<METHOD> /api/<path>'` (dynamic segments as written, e.g. `'GET /api/projects/[id]/tasks'`), and fail when no row in `tests/authz/rows/index.ts` has that string as its **`action`** (X91 route-row format — the same field action rows use; there is no separate `target` field). M2's routes: `'GET /api/sidebar'`, `'GET /api/people/options'`, `'GET /api/clients/options'`; its 12 actions are covered by T-META-01.

**S3.2 Rows** — `tests/authz/rows/clients.ts`, `projects.ts`, `members.ts` (exact table in §7.2); register each in M1's `tests/authz/rows/index.ts` (one `import` + spread per file, X91/C98) — the matrix, AZ-2 and M12's audit sweep read only that index.

**S3.3 Visibility content tests.**
- `tests/authz/visibility.int.test.ts` (world): sidebar ids per role (M `[P,Q]`, L `[P]`, Me `[P]`, W `[Q]`); `listProjectsForViewer({archived:true})` (M/L/Me `[A]`, W `[]`); `listClientsForViewer` (M `[C1,C2]`, L/Me `[C1]`, W `[C2]`); `getClientDetail(C1)` for L lists `[A, P]`; people options contain every world user for every role (X09).
- `tests/authz/golden-visibility.int.test.ts` (golden, r8 §4.3): `beforeEach(() => seedGolden(db))`; for each of Manager, Cindy, Ivy, Peter, Jack, Mint assert sidebar project names (sorted), client list names and that `getProjectOverview` of each other project throws `NotFoundError`:
  | viewer | sidebar projects | clients | 404 projects |
  |---|---|---|---|
  | Manager | CRM Migration, Data Warehouse, Mobile App Revamp, POS Upgrade, Store Analytics Dashboard | Bluebird, Coral, Internal, Sunrise | — |
  | Cindy | CRM Migration, POS Upgrade | Coral, Sunrise | DW, Mobile, Store |
  | Ivy | CRM Migration, POS Upgrade | Coral, Sunrise | DW, Mobile, Store |
  | Peter | Data Warehouse, Store Analytics Dashboard | Coral, Internal | POS, Mobile, CRM |
  | Jack | Mobile App Revamp, Store Analytics Dashboard | Bluebird, Internal | POS, DW, CRM |
  | Mint | Mobile App Revamp, POS Upgrade | Bluebird, Coral | DW, CRM, Store |
  (lists sorted with `compareThai`; also `getClientDetail(<Bluebird id>)` as Cindy → `NotFoundError`.)
  Plus `visibleUserIds`: Manager/Cindy/Peter/Jack → `'ALL'`; Ivy → `{Cindy, Ivy, Mint}`; Mint → `{Cindy, Ivy, Jack, Mint}`; `canSeeUserDetails(Ivy, Peter) === false`, `(Mint, Manager) === false`, `(Cindy, Peter) === true`. `isLeadAnywhere`: Cindy, Peter, Jack true; Ivy, Mint false.

**S3.4 Masking skeleton (`tests/authz/masking.int.test.ts`, X30, MASK-7).** Helper `assertNoLeak(body: unknown, forbidden: string[])` → `expect(JSON.stringify(body)).not.toContain(s)` for each.
- World: as `outsider` → `GET /api/sidebar`, `listProjectsForViewer` (both modes), `listClientsForViewer`, `getClientDetail(C2)` must not contain `w.P.name`, `w.P.id`, `w.A.name`, `w.A.id`, `w.C1.name`, `w.C1.id`; and **must** contain `w.Q.name` (sidebar). As `member` → sidebar must not contain `w.Q.name`/`w.Q.id`/`w.A.id` (A archived: not in sidebar).
- `GET /api/people/options` as outsider → contains user names (allowed, X09) but none of `w.P.name`, `w.Q.name`, `w.A.name`, and no `email` key (`Object.keys(person)` exact).
- Golden: as Peter → sidebar JSON contains none of `POS Upgrade`, `Mobile App Revamp`, `CRM Migration` or their ids (r6a M2-17); as Ivy → none of `Data Warehouse`, `Mobile App Revamp`, `Store Analytics Dashboard`.
- Documented exception: `GET /api/clients/options?projectId=<P>` lists all non-archived client names to P's LEAD (X61/M2-D04); assert it contains **no project names**.
- Later milestones append describe blocks (M5 calendar, M6 grid, M9 workload/person, M10 search/home).

**S3.5 E2E `e2e/m2-projects.spec.ts`** — scenarios in §7.3. Infrastructure (S3 owns `e2e/**`):
- `e2e/fixtures.ts`: reuse M1's `resetDb(fixture?, opts?: { extras?: (tx) => Promise<unknown> })` unchanged (X91 — the first parameter is the fixture, so extras go second: `resetDb(undefined, { extras })`) and add `idOf(kind: 'project' | 'client' | 'user', name: string): Promise<string>` that queries `planner_e2e` (projects/clients by `name`, users by `nickname`).
- Page objects: extend `e2e/pages/sidebar.ts` (`projectLinks()`, `expandProject(name)`, `newProjectButton()`, `archivedLink()`), add `e2e/pages/project.ts` (`goto(id, tab)`, `header`, `tabs`, `membersPanel`, `addMember(name)`, `setRole(name, role)`, `removeMember(name)`, `certaintyToggle`, `archiveButton`, `deleteButton`) and `e2e/pages/clients.ts`.
- Every describe block: `test.beforeAll(async () => { await resetDb(...) })` (never `beforeAll(resetDb)`), `loginAs(page, role)`, `await page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; selectors via `getByRole`/`getByLabel`/`getByText` with strings imported from `src/i18n/th.ts`; no fixed sleeps; the CSP-violation listener from `e2e/fixtures.ts` stays on.

**S3.6 Update older specs.** The sidebar gains a project section and a "ลูกค้า" item: run `pnpm exec playwright test --list` and grep `e2e/m0-smoke.spec.ts`, `e2e/m1-auth.spec.ts` and `e2e/pages/sidebar.ts` for assertions on the nav item list/count or on `/home` sidebar snapshots; update them through the page object (e.g. expect "ลูกค้า" present for every role, project section visible). Do not weaken any M0/M1 assertion.

**S3.7 G1 for S3.** `pnpm vitest run --project integration tests/authz` (lists the expected stub failures until S1 lands) · `pnpm exec playwright test --list` · `pnpm eslint tests e2e` · `pnpm typecheck` (own paths clean). The integrator runs Playwright at G2.

---

## 6. Integration (orchestrator)

**Expected cross-stream requests**
| From | Request | Resolution |
|---|---|---|
| S2 | Extra DTO fields (e.g. `positionName` on `ProjectListItem.leads`) | Add to `src/lib/contracts/**` + S1 service; keep payloads minimal (no hidden data) |
| S2 | i18n keys outside `projects/clients/members/sidebar` (e.g. `common`) | Orchestrator adds with Edit |
| S1 | Audit summaries not foreseen in S0.8 | S1 adds inside `th.audit` only |
| S1 | M1 `action()`/`route()` generics differ from S0 stubs | Adjust stubs; record in Decisions if the wrapper changes |
| S3 | `outcomeOfCall` tweaks (M1's `AuthzRow` already has `audit.projectId` and `with`, X91) | S3 edits `tests/authz/types.ts` only if something is still missing; `tests/helpers/**` changes go through the orchestrator |
| S3 | Stable `data-testid`s where roles/labels are ambiguous (e.g. member row) | S2 adds `data-testid="member-row-<userId>"`, `data-testid="sidebar-project-<id>"` |

**Wiring order**
1. Apply S1 + S2 + S3 results; resolve requests (above).
2. Replace remaining stub throws (none may remain: `grep -rn "NOT_IMPLEMENTED: M2\|notImplemented('M2" src` → empty).
3. Run the gates below; fix at root cause (owner of the path fixes).

**G2 commands**
```bash
pnpm db:up
pnpm db:migrate
pnpm db:generate            # must print "No schema changes"
grep -rn "notImplemented('M2" src && exit 1 || true
pnpm check                  # typecheck + lint + unit + ui + integration (authz matrix, masking, golden visibility)
pnpm seed:golden            # smoke on the dev DB: 4 clients, 5 projects, 10 members
pnpm test:e2e               # full suite: m0-smoke, m1-auth, m2-projects
git diff --exit-code CLAUDE.md SPEC.md docs/
```

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Test(s) |
|---|---|
| §12 M2 "worker ไม่เห็นโปรเจคที่ไม่ได้เป็นสมาชิก — ลิสต์" | e2e E1 (sidebar + `/projects` for Peter) · `golden-visibility.int.test.ts` · `visibility.int.test.ts` · masking test |
| §12 M2 "URL ตรง = 404" | e2e E1 (`response.status() === 404` + Thai not-found UI for `/projects/<POS>/overview`, `/projects/<POS>`, random uuid, `/clients/<Bluebird>`) · rows `PERM-06b/e`, `PERM-04c` |
| §12 M2 "Tests §11.2 ทุกแถวที่เกี่ยวกับลูกค้า/โปรเจค/สมาชิก" | `tests/authz/matrix.int.test.ts` rows PERM-03…PERM-10 (§7.2) + unauthenticated block · `tests/authz/coverage.int.test.ts` (AZ-2) |
| AC-203 (M2 clause: member picker) | `PersonPicker.test.tsx` · `people.int.test.ts` (`active: false`) · e2e E4 (deactivated "Nok" not offered) |
| FR-301 | `clients.int.test.ts` (create/update/uniqueness) · rows PERM-03a/b · e2e E3 |
| FR-302 | `clients.int.test.ts › archive`, options exclude archived · rows PERM-03c/d · e2e E3 (Bluebird hidden from picker, Mobile still shows Bluebird) |
| FR-303 (part) | `clients.int.test.ts › detail` · rows PERM-04b–d · e2e E1/E3 |
| FR-401 | `projects.int.test.ts › create` · `ProjectFormDialog.test.tsx` · row PERM-05 · e2e E2 |
| FR-403 | `members.int.test.ts` · `MembersPanel.test.tsx` · rows PERM-08a–c · e2e E4 |
| FR-404 (part, X16) | `members.int.test.ts` (`blockedByAssignments === 0`, undo re-add) · e2e E4 (toast + เลิกทำ + Cmd+Z) |
| FR-405 (part, X18) | `projects.int.test.ts › certainty` (`refresh` called, `certaintyChanged`) · `invalidate.test.ts` · e2e E5 (◐ in header and sidebar without reload) — numbers: M6/M9 |
| FR-406 (part, X17) | `projects.int.test.ts › archive` · rows PERM-09a/b · e2e E6 |
| FR-407 | `projects.int.test.ts › delete` (cascade, audit survives, name check, unlink hook) · `DeleteProjectDialog.test.tsx` · rows PERM-10a/b · e2e E7 |
| FR-408 (part) | `ProjectTabs.test.tsx` · e2e E8 (one tab, no disabled tabs) |
| FR-409 (part) | `projects.int.test.ts › loaders` · `ProjectOverview.test.tsx` · e2e E2/E4 |
| BR-60 (context) | `scripts/lib/fixtures.int.test.ts › M2` · `golden-visibility.int.test.ts` |
| BR-62 | `members.int.test.ts › BR-62` + race · rows PERM-08e/f · e2e E4 |
| §3.3 helpers (X30, X43) | `authz.int.test.ts` · `golden-visibility.int.test.ts` (Ivy/Mint sets) |
| MASK-7 | `tests/authz/masking.int.test.ts` · `src/server/services/masking.int.test.ts` |
| UI-01/UI-03/UI-02 (part) | `SidebarProjects.test.tsx` · e2e E1, E6, E9 |
| FR-1201 (part) | matrix audit assertion on every `mutates` allow row · per-service audit asserts |
| §6.2/§6.4 | `schema.int.test.ts › M2 schema` |

### 7.2 Authz matrix rows added (`M` manager · `L` lead · `Me` member · `W` outsider)

| Row | Action / route / loader | M | L | Me | W | mutates (audit entity · project_id) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-03a | `createClient({ name: 'New C' })` | allow | 403 | 403 | 403 | ✓ client · null |
| PERM-03b | `updateClient({ clientId: C1, name: 'C1x' })` | allow | 403 | 403 | 403 | ✓ client · null |
| PERM-03c | `archiveClient({ clientId: C1 })` | allow | 403 | 403 | 403 | ✓ client · null |
| PERM-03d | `unarchiveClient({ clientId: C3 })` | allow | 403 | 403 | 403 | ✓ client · null |
| PERM-04a | `listClientsForViewer` loader (content in visibility test) | allow | allow | allow | allow | — |
| PERM-04b | `getClientDetail(C1)` | allow | allow | allow | 404 | — |
| PERM-04c | `getClientDetail(C2)` | allow | 404 | 404 | allow | — |
| PERM-04d | `getClientDetail(C3)` (archived, no projects) | allow | 404 | 404 | 404 | — |
| PERM-04e | `GET /api/clients/options` (no projectId) | allow | 403 | 403 | 403 | — |
| PERM-04f | `GET /api/clients/options?projectId=P` | allow | allow | 403 | 404 | — |
| PERM-04g | `GET /api/clients/options?projectId=A` (archived) | 403 | 403 | 403 | 404 | — |
| PERM-05 | `createProject({ name: 'New P' })` | allow | 403 | 403 | 403 | ✓ project · new id |
| PERM-06a | `GET /api/sidebar` (content in visibility test) | allow | allow | allow | allow | — |
| PERM-06b | `getProjectOverview(P)` | allow | allow | allow | 404 | — |
| PERM-06c | `getProjectOverview(A)` (archived = viewable) | allow | allow | allow | 404 | — |
| PERM-06d | `listProjectsForViewer({ archived: false })` | allow | allow | allow | allow | — |
| PERM-06e | `getProjectOverview(Q)` | allow | 404 | 404 | allow | — |
| PERM-07a | `updateProject({ projectId: P, name: 'P2' })` | allow | allow | 403 | 404 | ✓ project · P |
| PERM-07b | `updateProject({ projectId: P, certainty: 'TENTATIVE' })` | allow | allow | 403 | 404 | ✓ project · P |
| PERM-07c | `updateProject({ projectId: A, name: 'A2' })` (archived) | 403 | 403 | 403 | 404 | — |
| PERM-07d | `updateProject({ projectId: A, certainty: 'TENTATIVE' })` (archived) | 403 | 403 | 403 | 404 | — |
| PERM-08a | `addMember({ projectId: P, userId: outsider })` | allow | allow | 403 | 404 | ✓ project_member · P |
| PERM-08b | `changeMemberRole({ projectId: P, userId: member, role: 'LEAD' })` | allow | allow | 403 | 404 | ✓ project_member · P |
| PERM-08c | `removeMember({ projectId: P, userId: member })` | allow | allow | 403 | 404 | ✓ project_member · P |
| PERM-08d | `addMember({ projectId: A, userId: outsider })` (archived) | 403 | 403 | 403 | 404 | — |
| PERM-08e | `removeMember({ projectId: P, userId: lead })` (last LEAD, BR-62) | allow | **409** | 403 | 404 | ✓ project_member · P (M only) |
| PERM-08f | `changeMemberRole({ projectId: P, userId: lead, role: 'MEMBER' })` (last LEAD) | allow | **409** | 403 | 404 | ✓ project_member · P (M only) |
| PERM-09a | `archiveProject({ projectId: P })` | allow | allow | 403 | 404 | ✓ project · P |
| PERM-09b | `unarchiveProject({ projectId: A })` | allow | allow | 403 | 404 | ✓ project · A |
| PERM-10a | `deleteProjectPermanently({ projectId: P, confirmName: 'World P' })` | allow | 403 | 403 | 404 | ✓ project · P (row survives) |
| PERM-10b | `deleteProjectPermanently({ projectId: A, confirmName: 'World A' })` | allow | 403 | 403 | 404 | ✓ project · A |
| PERM-XA | `GET /api/people/options` (X09) | allow | allow | allow | allow | — |
| PERM-XB | every row above with `asNobody()` | 401 | 401 | 401 | 401 | — |

Notes: W = outsider (MEMBER of Q only). 403 for archived edits comes from `requireProject` (X42). Row PERM-08e/f prove the M2-D06 manager exception. `action` values: action rows use the export name (`'createClient'`), route rows `'GET /api/clients/options'` / `'GET /api/sidebar'` / `'GET /api/people/options'` (AZ-2), loader rows `'services.projects.getProjectOverview'` etc. PERM-XB and the `MUST_CHANGE_PASSWORD` → 403 case come from M1's per-row loops, not extra rows.

### 7.3 E2E scenario outline (`e2e/m2-projects.spec.ts`)

All blocks: `resetDb()` in `beforeAll` (golden seed incl. M2 memberships), clock pinned, `APP_NOW` from the webServer env, strings from `th`, page objects from S3.5.

| # | Block (role) | Steps | Assertions |
|---|---|---|---|
| E1 | Worker visibility (peter) — **§12 M2** | `loginAs(page,'peter')`; goto `/home`; goto `/projects`; `idOf('project','POS Upgrade')`; `page.goto('/projects/<pos>/overview')`; `page.goto('/projects/<pos>')`; `page.goto('/projects/<randomUUID>/overview')`; goto `/clients`; `page.goto('/clients/<Bluebird>')` | Sidebar project links exactly `['Data Warehouse','Store Analytics Dashboard']` (order); Store row has `img` named `อาจไม่ทำ`, DW none; `/projects` table lists the same two; each direct URL → `response.status() === 404` and `getByText(th.projects.notFound.title)` / `th.clients.notFound.title`; no POS text anywhere on the page (`page.content()` lacks `POS Upgrade`); `/clients` shows Coral, Internal only |
| E2 | Manager creates project (manager) | Sidebar `+` → dialog; name `ระบบจองห้องประชุม`, client Coral, certainty อาจไม่ทำ, note, LEAD Ivy → บันทึก; second project `โปรเจคไม่มีลีด` without LEAD | URL `/projects/<id>/overview`; header shows name + ◐; members panel: Ivy · LEAD; sidebar contains both new projects in `compareThai` order; second project shows `th.projects.overview.noLead`; Cindy (new context, `loginAs('cindy')`) does not see either project |
| E3 | Clients (manager, then cindy) | `/clients` → เพิ่มลูกค้า `SCB` code `SCB` → appears; เพิ่มลูกค้า `Coral` → error; archive Bluebird from its row → toast `archive ลูกค้า "Bluebird" แล้ว` + เลิกทำ → click เลิกทำ → Bluebird back; archive Bluebird again; open create-project dialog → client picker lacks Bluebird; open Mobile App Revamp overview; then `loginAs('cindy')` → `/clients` | SCB row visible; name helper `th.clients.errors.nameTaken`; after undo Bluebird listed without chip; picker options lack Bluebird; Mobile header still shows client Bluebird with archived chip; Cindy sees Coral, Sunrise only and no "เพิ่มลูกค้า" button |
| E4 | Members + BR-62 (cindy on POS) | `resetDb(undefined, { extras: (db) => db.insert(user).values({ id: randomUUID(), name: 'Nok Deactivated', nickname: 'Nok', email: 'nok@example.com', role: 'worker', banned: true, deactivatedOn: '2026-09-01', mustChangePassword: false }) })` (no account row: Nok never logs in); POS overview → try role Cindy → MEMBER; add Jack (type `Jo`); type `Nok` in picker; set Jack → LEAD; remove Jack → toast; click เลิกทำ; remove Mint; press `ControlOrMeta+z` (focus on body); `loginAs('ivy')` → POS overview | First change → error toast `th.members.errors.lastLead`, Cindy still LEAD; Jack row `MEMBER` then `LEAD`; picker shows `th.members.pickerEmpty` for Nok; after เลิกทำ Jack back as LEAD; after Cmd+Z Mint back as MEMBER; Ivy sees the member list but no add/role/remove controls and no "แก้ไข" |
| E5 | Certainty without reload (cindy on POS) — FR-405 | Set `window.__m2Marker = 1`; certainty toggle → อาจไม่ทำ; then back → แน่นอน | Header badge ◐ appears; sidebar POS row gains `img` `อาจไม่ทำ`; `await page.evaluate(() => window.__m2Marker)` still `1` (no reload); toast `certaintyChanged('อาจไม่ทำ')`; switching back removes ◐ in both places |
| E6 | Archive + undo (cindy on CRM) — FR-406 | CRM overview → Archive → toast; click เลิกทำ; Archive again; sidebar link `ดูโปรเจคที่ archive`; open CRM; เลิก archive | No confirm dialog appears (`getByRole('dialog')` count 0); after archive: banner `archivedBanner`, CRM missing from sidebar, edit controls hidden; after undo: CRM back in sidebar; archived list shows CRM; after unarchive: banner gone |
| E7 | Permanent delete (manager on Store; cindy check) — FR-407 | `loginAs('cindy')` → POS overview: no delete button; manager → Store overview → ลบโปรเจคถาวร → type `Store` → type `Store Analytics Dashboard` → ลบถาวร | Confirm disabled until exact name; after confirm URL `/projects`, toast `deleted`, Store absent from sidebar/list; `page.goto('/projects/<store>/overview')` → 404 |
| E8 | Tabs (jack on Mobile) — FR-408 | open `/projects/<mobile>` | redirected to `/overview`; `getByRole('tab')` count 1, name `ภาพรวม`, selected; no disabled tab |
| E9 | Sidebar expansion remembered (mint) | expand POS node → reload | after reload POS node still expanded, sub-link `ภาพรวม` visible (preference, not localStorage: `page.evaluate(() => localStorage.length) === 0`) |

**Update older specs** (S3.6): `m0-smoke` / `m1-auth` sidebar assertions go through `e2e/pages/sidebar.ts`; expect the new "ลูกค้า" item and project section; run the full suite at G2.

### 7.4 Golden / perf / manual checks

- Golden: `scripts/lib/fixtures.int.test.ts › M2` (counts 4/5/10 + exact memberships) and `golden-visibility.int.test.ts` (r8 §4.3 table, Ivy/Mint visible-user sets). No load numbers in M2.
- Perf: none required (≤ 300 projects; `GET /api/sidebar` is two indexed queries). Manual: sidebar with 300 synthetic projects is deferred to M12 perf.
- Manual a11y (integrator, 5 min): keyboard-only — Tab to sidebar `+`, open dialog, Esc closes; members Select operable by keyboard; ◐ announced as "อาจไม่ทำ" (VoiceOver); dark mode contrast of chips/banners.
- Manual Thai keyboard (Kedmanee): Cmd+Z undo of a member removal works (M1 `e.code` helper).

---

## 8. Definition of done

- [x] SPEC §12 M2 delivered: §4.3, §4.4 minus FR-402 and the FR-409/FR-303 load parts; `authz.requireProject`; masking helper; real sidebar projects; `/projects` + overview.
- [x] §12 M2 e2e: worker cannot see non-member projects (sidebar + list) and direct URLs answer **404** with the Thai not-found UI (E1).
- [x] Every §3.2 client / project / member line has matrix rows (PERM-03…PERM-10, §7.2) incl. archived and last-LEAD variants; every mutating allow case asserts one audit row; unauthenticated → 401.
- [x] `visibleProjectIds`, `visibleUserIds`, `canSeeUserDetails`, `isLeadAnywhere`, `requireClient` implemented and tested (world + golden).
- [x] `tests/authz/masking.int.test.ts` exists and passes for sidebar, project list, client list/detail, people options.
- [x] `pnpm check` green (typecheck, lint, unit, ui, integration incl. authz + masking + golden visibility; domain coverage ≥ 95 % unaffected).
- [x] `pnpm test:e2e` green: `m0-smoke`, `m1-auth`, `m2-projects` (no CSP violations).
- [x] `pnpm db:generate` → "No schema changes"; one new journaled migration; no hand edits.
- [x] No Thai literals outside `src/i18n/**` (lint); no `any`, `@ts-ignore` or `eslint-disable` without a reason; no `localStorage`; no `router.refresh()`; no `revalidateTag`.
- [x] Only `DeleteProjectDialog` has a confirm step; archive / member removal / client archive use the 8 s undo toast + Cmd+Z.
- [x] Every M2 query on `projects` filters `deleted_at is null`; no allocations / plan-date code introduced.
- [x] `PROGRESS.md` updated (status, Decisions X-rows + M2-D01…D22, Known issues); commit + tag `m2`.

---

## 9. Risks and gotchas

| Risk | Mitigation (step) |
|---|---|
| `notFound()` after streaming starts keeps HTTP 200 (r6a M2-16) | Authz in the layout/page body before any Suspense, no `loading.tsx` under projects/clients, `orNotFound` (S0.10, S2.3, M2-D21); E1 asserts `status() === 404` |
| `orNotFound` swallowing Next's internal `notFound`/`redirect` errors | It catches only `NotFoundError`, calls `notFound()` in the catch and rethrows everything else (S0.10) |
| Malformed ids → Postgres `22P02` → 500 instead of 404 | `projectAccess`/`requireClient` validate with `z.uuid()` first (S1.2 test "malformed id") |
| `router.refresh()` no-op on streamed pages (#99028); `revalidateTag` single-arg doesn't typecheck | Server actions call `refresh()` from `next/cache` (M2-D09); sidebar uses TanStack invalidation (S2.2) |
| `refresh()` after self-removal re-renders a page that now 404s | `selfRemoved` path skips refresh and navigates (M2-D19) |
| BR-62 race (two LEADs demote each other) | `lockLeadRows … FOR UPDATE` (S1.1/S1.6) + race test |
| Unique violation aborts the transaction | Pre-check for the friendly message; map `23505` via `e.cause?.code` (`DrizzleQueryError`) and rethrow as `ConflictError` (S1.4) |
| Leaks through list endpoints (sidebar, options) | Endpoints select only visible rows; masking + golden leak tests (S3.4) |
| People directory leaking emails | `PersonOption` has no email; exact-keys assertion (S1.3, S3.4) |
| MUI 9 API from memory (`InputProps`, `PaperProps`, `renderTags`, system props) | `slotProps`, `renderValue`, `sx` only (S2 preamble); typecheck catches leftovers |
| Passing `Link` or MUI elements as props from RSC (mui#48214) | Pages pass plain data to `'use client'` components; `@/components/Link` (S2) |
| `params`/`searchParams` are Promises; `PageProps`/`LayoutProps` need `next typegen` | `await props.params`; `pnpm typecheck` = `next typegen && tsc` (S2.3) |
| Thai sort differences server vs client | One `compareThai` (`Intl.Collator('th')`, full ICU on Node 22) used everywhere (M2-D18) |
| Server Actions are serialised per client | Actions are single short transactions; reads go through route handlers/RSC |
| Seed drift from SPEC A.1 | Seed reads `golden-fixtures.json`; MEMBER rows derived from `tasks[].assignee` (S1.7 test) |
| `pnpm db:generate` run by two streams | Only S0 generates; G2 re-runs and expects "No schema changes" |
| Duplicate trigram indexes on `"user"` if M1 already added them | S0.3 adds them only if absent (check `schema.ts`) |

---

## 10. Close-out

**PROGRESS.md updates**
- Status table: M2 → ✅ with the date; "Milestone ปัจจุบัน" → M3.
- `แผนของ milestone ปัจจุบัน`: replace with the M3 kickoff.
- `Decisions`: add the §3.1 X-rows (X04, X05, X09, X11, X12, X15–X18, X26, X30, X33, X40–X44, X46, X47, X53, X61, X80, X83, X84, X86, X87, X90, X91, X93) and M2-D01…M2-D22 (date · SPEC ref · decision · rationale, in Thai/English as the file uses).
- `Deviations`: none for M2.
- `Known issues / TODO ถัดไป`: "FR-404 count + two-option toast (M3)", "FR-406 X person-days (M6)", "FR-303 / FR-409 loads (M9)", "FR-402 charter + backfill for M2 projects (M4)", "file unlink on permanent delete (M4)".

**Commit** (orchestrator, after G4):
```
feat(m2): clients, projects, members and project-level authorization

- FR-301, FR-302, FR-303 (project list), FR-401, FR-403, FR-404 (removal + undo), FR-405 (refresh + invalidateLoad),
  FR-406 (archive + undo), FR-407, FR-408 (overview tab), FR-409 (info + members), BR-62
- authz: projectAccess, requireProject (archived read-only), requireClient, visibleProjectIds,
  visibleUserIds, canSeeUserDetails, isLeadAnywhere; masking skeleton
- sidebar projects, /projects, /projects/[id]/overview, /clients, /clients/[id]
- authz matrix PERM-03…PERM-10, masking + golden visibility tests, e2e m2-projects

Co-Authored-By: <attribution trailer required by the session>
```
**Tag:** `git tag m2` (next milestone reviews `git diff m2`).
