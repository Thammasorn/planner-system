# Traceability — SPEC → milestone → plan step → test

> Appendix of `PLAN.md` (§7). Every requirement id that `SPEC.md` v3.2 defines (FR-, BR-, AC-), every §3.2 permission row (PERM-01…28) and every §9 row (NFR-01…10 r7 numbering + NFR-11…12 appended in v3.2) maps to the milestone(s) that deliver it, the plan step(s) that build it and the test(s) that prove it.
> **Precedence:** `SPEC.md` > `CLAUDE.md` > `PLAN.md` / `plan/**` (this file included) > `docs/**`. If a row here disagrees with a milestone plan, the milestone plan's §1.1/§7 wins for *how*; SPEC wins for *what*. This file replaces `plan/research/r7-traceability.md` §F–§I (v3.0 baseline) and the interim v3.1-only version of this file.
> **Generated** 2026-10-30 (HANDOFF T9) from the 12 milestone plans `plan/m00…m11-*.md` of that day (all complete, reviewed, consistency-checked; PLAN §1.4 rulings X01–X96). **Updated 2026-11-01 (SPEC v3.2, PLAN §1.8):** the hardening plan is now `plan/m12-hardening-deploy.md` (every former "M11"/"m11" here reads M12/m12; r6b gap ids `M11-nn` unchanged); rows for the new M11 (FR-1401…1506, BR-90…98, AC-1401…1504, PERM-24…28, NFR-11…12; plus the M6.1 ids FR-680…693, AC-621…628, FR-1601…1606, AC-1601…1605, AC-1414) are placeholders marked "plan pending" until `plan/m11-database-views.md` is written; the same holds for the M6.1 rows (FR-680…693, AC-621…628, FR-1601…1606, AC-1601…1605, PERM-27…28) until `plan/m06.1-task-page-ui.md` is written. **Updated 2026-11-03 (M11 close-out):** the M11 rows (FR-1401…1506, BR-90…98, AC-1401…1414, AC-1501…1504, PERM-24…26, NFR-11/12) now point at `plan/m11-database-views.md` §1.1 / §7.1 / §7.2 and the tests as built (e2e scenarios in `e2e/m11-database.spec.ts`; D9 and D13 have no e2e scenario — covered by int/authz/golden).

> **Updated 2026-11-01 (SPEC v3.3, PLAN §1.9):** rows for M7.1 (FR-810…820, BR-100…105, AC-806…813, PERM-29, NFR-13) point to `plan/m07.1-grid-improvements.md`; e2e index `e2e/m7.1-grid.spec.ts`.

## 0. How to read and how to regenerate

- **Source of each row.** Mechanically extracted from each plan's §1.1 (§1.2 in m01) "In scope" table (columns *id · requirement · where implemented · tested by*), its §3.2-permission table, §7.1 (AC → test map), §7.2 (authorization rows) and §7.3 (e2e scenarios). Descriptions are r7's English summaries (v3.0 ids), the v3.1 rows of the previous version of this file, or the plan's own wording; Thai only where SPEC is quoted.
- **Milestone.** `M3 · M6 (grid part)` = the id has an in-scope row in both plans; the parenthesis is the plan's own label for its part (`carried in`, `clause`, `day level`, …). `M7 (§7.1 tests)` = that plan builds nothing new for the id but its §7.1 adds regression tests for it.
- **Plan step.** `m03 §5.S2.6` = file `plan/m03-tasks.md`, §5, stream S2, step 6 (`**S2.6 …**`). One line per milestone. `mNN (text)` = the plan names no step (e.g. a BlockNote built-in or a scope guard).
- **Test file › test name.** Plan text with abbreviations resolved: `unit` = Vitest node, `ui` = Vitest jsdom (Testing Library), `int` = Vitest + Postgres (`*.int.test.ts`), `authz`/`rows`/`matrix` = a row in `tests/authz/rows/<area>.ts` run by `tests/authz/matrix.int.test.ts`, `mask` = `tests/authz/masking.int.test.ts`, `golden` = `tests/golden/*.int.test.ts`, `e2e/<spec> › E7` = Playwright scenario id from that plan's §7.3. A bare `› name` continues the file named just before it. `(files per step: …)` = the plan cell gave only a layer word; the files are the test files that the cited step's body creates or extends. `(v3.1 row)` = test file kept from the interim v3.1 table and still present in the plans. `mNN §7.4 …` = a golden/perf/manual check in that plan's §7.4. Several milestones → one `Mn:` group per milestone.
- **Notes.** SPEC section, then the X-rulings (PLAN §1.4), milestone decisions (`M3-D27`), and review ids (`C51`, `G11`) cited on that id's plan rows.
- **Regenerate** (after any plan or SPEC change): (1) list SPEC ids — `grep -oE '^\| \*{0,2}(FR|BR)-[0-9]+[a-z]?|^- \*{0,2}(AC|BR|FR)-[0-9]+[a-z]?' SPEC.md` (FR/BR live in `| ID |` tables, AC in `- AC-…:` bullets); PERM = §3.2 rows in table order; NFR = §9 rows with r7's a/b/c split; (2) for each `plan/mNN-*.md`, read every table row under §1.1/§1.2 "In scope", §7.1, §7.2, §7.3, expand shorthand (`BR-04/05/06`, `FR-640–644`, `FR-1101a–e`, `MASK-1…7`) and record milestone, `Where` steps, `Test` cell, X-ids; (3) rebuild the tables below and re-run the completeness check:

```bash
comm -23 <(grep -oE '^\| \*{0,2}(FR|BR)-[0-9]+[a-z]?|^- \*{0,2}(AC|BR|FR)-[0-9]+[a-z]?' SPEC.md | grep -oE '(FR|BR|AC)-[0-9]+[a-z]?' | sort -u) \
        <(grep -oE '^\| (FR|BR|AC)-[0-9]+[a-z]?' plan/traceability.md | grep -oE '(FR|BR|AC)-[0-9]+[a-z]?' | sort -u)   # must print nothing
```

**Row counts:** FR 239 (233 SPEC ids + 6 r7 sub-rows FR-1101a–f) · BR 66 · AC 71 · PERM 29 · NFR 17 · MASK 7 (masking section) · other v3.1 ids 15 (§6).

## 1. Functional requirements (FR)

SPEC §4. FR-1101a–f are r7 sub-rows of FR-1101 (one per home card; m10 tracks them separately).

| ID | Short description | Milestone | Plan step (mNN §5.Sx.y) | Test file › test name | Notes (X-id) |
|---|---|---|---|---|---|
| FR-101 | Login with email + password; no sign-up page; sign-up endpoint disabled | M1 | m01 §5.S0.8, §5.S2.3, §5.S2.6, §5.S3.2 | `tests/integration/auth.int.test.ts` › T-AUTH-01..03, T-AUTH-06 · `e2e/m1-auth.spec.ts` › E2E-01, E2E-02 | §4.1 |
| FR-102 | First manager is created at first deploy from INITIAL_MANAGER_* env (bootstrap) | M1 · M12 | m01 §5.S2.12<br>m12 §5.S2.3 | M1: `tests/integration/bootstrap.int.test.ts` + `tests/integration/seed-golden.int.test.ts` › T-BOOT-01..06<br>M12: `e2e/m12-deploy.spec.ts` › D1 | §4.1 |
| FR-103 | Session lives 7 days and renews automatically while used | M1 | m01 §5.S0.8, §5.S2.4 | `tests/integration/proxy.int.test.ts` › T-SESS-04, T-SESS-05, `tests/integration/auth.int.test.ts` › T-AUTH-05 | §4.1 |
| FR-104 | must_change_password = true → user is forced to the password page before anything else | M1 | m01 §5.S2.4, §5.S0.7, §5.S0.8, §5.S3.3 | `tests/integration/proxy.int.test.ts` › T-SESS-03, `src/server/action.int.test.ts` + `src/server/route.int.test.ts` › T-GATE-02, T-GATE-04, matrix MCP loop · `e2e/m1-auth.spec.ts` › E2E-03 | §4.1 |
| FR-105 | Change own password: old password required, new ≥ 8 chars and not equal to email | M1 | m01 §5.S0.10, §5.S2.7, §5.S3.3 | `src/lib/schemas/account.test.ts` › U-SCH-01..08 · `tests/integration/account.int.test.ts` › T-ACC-01..05 · `e2e/m1-auth.spec.ts` › E2E-03, E2E-09 | §4.1, X60 |
| FR-106 | 5 failed logins within 15 min per (IP + email) → temporary rejection with message | M1 | m01 §5.S0.4, §5.S2.3 | `tests/integration/lockout.int.test.ts` › T-LOCK-01..08 · `e2e/m1-auth.spec.ts` › E2E-10 | §4.1 |
| FR-107 | 'Log out all devices' from own account page | M1 | m01 §5.S2.7, §5.S3.3 | `tests/integration/account.int.test.ts` › T-ACC-06 · `e2e/m1-auth.spec.ts` › E2E-08 | §4.1 |
| FR-201 | Manager creates employee: full name, nickname, email, position, system role, initial password, work schedule | M1 | m01 §5.S2.8, §5.S3.8 | `tests/integration/employees.int.test.ts` › T-EMP-01 · matrix `tests/authz/rows/employees.ts` › PERM-01a · `e2e/m1-auth.spec.ts` › E2E-05 | §4.2 |
| FR-202 | Initial password typed or generated ('สุ่มรหัส', 12 chars), shown once with a copy button | M1 | m01 §5.S1.5, §5.S3.8, §5.S3.12 | `src/lib/random-password.test.ts` › U-PW-01..05 · `src/lib/copy-text.test.ts` › U-COPY-01..02 · `e2e/m1-auth.spec.ts` › E2E-05, E2E-06 | §4.2 |
| FR-203 | Checkbox 'force change on first login', default on | M1 | m01 §5.S0.10, §5.S3.8 | `tests/integration/employees.int.test.ts` › T-EMP-01b · `e2e/m1-auth.spec.ts` › E2E-03 (default on), E2E-05 | §4.2 |
| FR-204 | Manager resets an employee password → all their sessions revoked + must change password | M1 | m01 §5.S2.8, §5.S3.9 | `tests/integration/employees.int.test.ts` › T-EMP-03 · matrix `tests/authz/rows/employees.ts` › PERM-01e | §4.2 |
| FR-205 | Deactivate instead of delete: no login, hidden from assignment pickers, plan history kept; can reactivate | M1 | m01 §5.S2.8, §5.S2.11, §5.S3.10 | `tests/integration/employees.int.test.ts` › T-EMP-04, T-EMP-05, T-EMP-06 · `e2e/m1-auth.spec.ts` › E2E-04 | §4.2 |
| FR-206 | Cannot deactivate or demote the last manager; cannot deactivate oneself | M1 | m01 §5.S2.8 | `tests/integration/employees.int.test.ts` › T-EMP-07..10 | §4.2 |
| FR-207 | Work schedule: working weekdays + fraction per day (default Mon–Fri 1.00) for part-timers | M1 | m01 §5.S0.10, §5.S1.4, §5.S2.8, §5.S3.8 | U-UNIT-*, `tests/integration/employees.int.test.ts` › T-EMP-11 · `e2e/m1-auth.spec.ts` › E2E-07 | §4.2 |
| FR-208 | CRUD positions (name, order); deleting a position in use is blocked | M1 | m01 §5.S2.9, §5.S3.11 | `tests/integration/positions.int.test.ts` › T-POS-01..08 · matrix `tests/authz/rows/positions.ts` › PERM-02a..e · `e2e/m1-auth.spec.ts` › E2E-11 | §4.2 |
| FR-209 | Employee list: search name/nickname, filter by position, show active status | M1 | m01 §5.S3.7 | `src/components/settings/employees/filter.test.ts` › U-FILT-01..05 · `e2e/m1-auth.spec.ts` › E2E-12 | §4.2 |
| FR-210 | Display name = nickname if present else full name; hover shows full name + position | M1 | m01 §5.S1.6, §5.S3.5 | `src/lib/display-name.test.ts` › U-NAME-01..04 · m01 §5.S3.5 component tests › U-UN-01..03 (file not named in m01; see Cross-file notes) | §4.2 |
| FR-301 | CRUD clients: name (unique), code, colour, note | M2 | m02 §5.S0.3, §5.S1.4, §5.S2.6 | `src/server/services/clients.int.test.ts` · rows `tests/authz/rows/clients.ts` › PERM-03a..c` · `e2e/m2-projects.spec.ts` › E3 · rows `tests/authz/rows/clients.ts` › PERM-03a/b | §4.3, M2-D07 |
| FR-302 | Archive client → hidden from project-creation picker; existing projects unaffected | M2 | m02 §5.S1.4, §5.S2.6 | `src/server/services/clients.int.test.ts` › archive · row `tests/authz/rows/clients.ts` › PERM-03c/d` · `e2e/m2-projects.spec.ts` › E3 · `src/server/services/clients.int.test.ts` › archive, options exclude archived · rows `tests/authz/rows/clients.ts` › PERM-03c/d | §4.3 |
| FR-303 | Client page: the client's projects + total load (person-days) over the next 12 weeks | M2 (part) · M9 (load part) | m02 §5.S1.4, §5.S2.6<br>m09 §5.S2.10, §5.S4.12 | M2: `src/server/services/clients.int.test.ts` › detail · rows `tests/authz/rows/clients.ts` › PERM-04b..d` · `e2e/m2-projects.spec.ts` › E1, E3 · rows `tests/authz/rows/clients.ts` › PERM-04b–d · `e2e/m2-projects.spec.ts` › E1/E3<br>M9: int `client-load.int.test.ts` · authz `tests/authz/rows/people.ts` › CL-LOAD-* · `e2e/m9-workload.spec.ts` › W11 · int `src/server/services/project-load.int.test.ts`, `client-load.int.test.ts` · authz `tests/authz/rows/people.ts` › PJ-LOAD-*, CL-LOAD-* · ui | §4.3, X15 |
| FR-401 | Manager creates project: name, client (optional), code, colour, certainty (default CONFIRMED), LEAD | M2 | m02 §5.S1.5, §5.S2.4 | `src/server/services/projects.int.test.ts` › create · row `tests/authz/rows/projects.ts` › PERM-05 · `e2e/m2-projects.spec.ts` › E2 · `ProjectFormDialog.test.tsx` | §4.4, X61 |
| FR-402 | Creating a project auto-creates its Project Charter page from the template | M4 | m04 §5.S0.12, §5.S1.9 | `src/server/services/charters.int.test.ts` · `src/server/services/projects.int.test.ts` › charter · `scripts/lib/fixtures.int.test.ts` › M4 · `e2e/m4-pages.spec.ts` › E1 | §4.4, X25 |
| FR-403 | Members: add via picker (search name/nickname/position), change LEAD/MEMBER, remove | M2 | m02 §5.S1.6, §5.S2.5 | `src/server/services/members.int.test.ts` · rows `tests/authz/rows/members.ts` › PERM-08a..f` · `e2e/m2-projects.spec.ts` › E4 · `MembersPanel.test.tsx` · rows `tests/authz/rows/members.ts` › PERM-08a–c | §4.4 |
| FR-404 | Removing a member who still has assignments → toast 'มีงานที่มอบหมายอยู่ N งาน' with: unassign all / cancel removal | M2 (part) · M3 (carried in) | m02 §5.S1.6, §5.S2.5<br>m03 §5.S2.9, §5.S3.10 | M2: `src/server/services/members.int.test.ts` › remove · `e2e/m2-projects.spec.ts` › E4<br>M3: int `src/server/services/members.int.test.ts` › FR-404 · authz PERM-08 rows · `e2e/m3-tasks.spec.ts` › E11 | §4.4, X16 |
| FR-405 | Changing project certainty updates numbers on every screen without reload | M2 (part) · M6 (grid part) · M9 (§7.1 tests) | m02 §5.S0.7, §5.S1.5, §5.S2.3, §5.S2.5<br>m06 §5.S0.7, §5.S4.5 | M2: `src/server/services/projects.int.test.ts` › certainty (refresh mock) · `src/lib/invalidate.test.ts` · `e2e/m2-projects.spec.ts` › E5 · `e2e/m2-projects.spec.ts` › E5 (◐ in header and sidebar without reload) — numbers: M6/M9<br>M6: unit `src/lib/invalidate.test.ts` · `e2e/m6-grid.spec.ts` › G8<br>M9: int `workload › FR-405` · `e2e/m9-workload.spec.ts` › W2 | §4.4, X18 |
| FR-406 | Archive project: if future plans exist, notice 'จะปลดภาระ X วัน-คน ในอนาคต', then archive (reversible) | M2 (part) · M6 (X part) | m02 §5.S1.5, §5.S2.5<br>m06 §5.S2.8, §5.S4.4 | M2: `src/server/services/projects.int.test.ts` › archive · rows `tests/authz/rows/projects.ts` › PERM-09a/b` · `e2e/m2-projects.spec.ts` › E6<br>M6: int `src/server/services/projects.int.test.ts` › archive X · `e2e/m6-grid.spec.ts` › G12 · ui `ArchiveProjectButton.test.tsx` | §4.4, X17, G12 |
| FR-407 | Permanent delete: manager only, must type the project name (the only confirm dialog) | M2 · M4 (part) | m02 §5.S1.5, §5.S2.5<br>m04 §5.S1.10 | M2: `src/server/services/projects.int.test.ts` › delete · rows `tests/authz/rows/projects.ts` › PERM-10a/b` · `DeleteProjectDialog.test.tsx` · `e2e/m2-projects.spec.ts` › E7<br>M4: `src/server/services/projects.int.test.ts` › delete removes files | §4.4, X26 |
| FR-408 | Project page tabs: ภาพรวม · แผนงาน · งาน · เอกสาร | M2 (part) · M3 (tab) · M4 (part) · M6 | m02 §5.S2.3<br>m03 §5.S3.13<br>m04 §5.S3.6<br>m06 §5.S4.1 | M2: `src/components/projects/ProjectTabs.test.tsx` · `e2e/m2-projects.spec.ts` › E8<br>M3: `e2e/m3-tasks.spec.ts` › E1<br>M4: `src/components/projects/ProjectTabs.test.tsx` · `e2e/m4-pages.spec.ts` › E1<br>M6: unit `project-tabs.test.ts` · `e2e/m6-grid.spec.ts` › G1 | §4.4, X15 |
| FR-409 | Overview tab: project info, members + each member's load in this project, upcoming milestones, progress (done/total tasks), weekly load bars (12 weeks) | M2 (part) · M3 (progress) · M8 (milestone part, carry-in) · M9 (load part) | m02 §5.S1.5, §5.S2.5<br>m03 §5.S2.11, §5.S3.13<br>m08 §5.S2.4, §5.S4.2<br>m09 §5.S2.10, §5.S4.12 | M2: `src/server/services/projects.int.test.ts` › overview · `e2e/m2-projects.spec.ts` › E2, E4 · `src/server/services/projects.int.test.ts` › loaders · `ProjectOverview.test.tsx` · `e2e/m2-projects.spec.ts` › E2/E4<br>M3: int · `e2e/m3-tasks.spec.ts` › E6<br>M8: int `› listProjectMilestones` · ui `ProjectMilestones.test.tsx` · `e2e/m8-milestones.spec.ts` › M4<br>M9: int `src/server/services/project-load.int.test.ts` · authz `tests/authz/rows/people.ts` › PJ-LOAD-* · `e2e/m9-workload.spec.ts` › W11 · int `src/server/services/project-load.int.test.ts`, `client-load.int.test.ts` · authz `tests/authz/rows/people.ts` › PJ-LOAD-*, CL-LOAD-* · ui | §4.4, X15 |
| FR-501 | Two page spaces: WORKSPACE (team wiki) and PROJECT | M4 | m04 §5.S0.3, §5.S1.2, §5.S1.3 | `src/server/db/schema.int.test.ts` › pages · rows `tests/authz/rows/pages.ts` › PG-* / `WK-*` | §4.5.1 |
| FR-502 | Nested sub-pages up to 10 levels | M4 | m04 §5.S0.3, §5.S1.3, §5.S2.5 | `src/server/services/page-tree.int.test.ts` › depth · `src/components/editor/slash-menu.test.ts` | §4.5.1 |
| FR-503 | Sidebar page tree: expand/collapse, drag to reorder, drag to re-parent within the same space | M4 | m04 §5.S1.4, §5.S3.3 | `src/server/services/page-tree.int.test.ts` › move · `src/lib/pages/tree.test.ts` · `src/components/pages/PageTree.test.tsx` · `e2e/m4-pages.spec.ts` › E10 | §4.5.1 |
| FR-504 | Page has emoji icon, optional cover image, title, content; breadcrumb | M4 | m04 §5.S1.3, §5.S3.2 | `src/server/services/pages.int.test.ts` › header · `IconPicker.test.tsx` · `e2e/m4-pages.spec.ts` › E18 | §4.5.1 |
| FR-505 | Page URL /p/[pageId] for both spaces (shareable) | M4 | m04 §5.S3.1 | rows `tests/authz/rows/pages.ts` › PG-VIEW, `WK-VIEW` · `e2e/m4-pages.spec.ts` › E1, E4 (404 for outsider) | §4.5.1 |
| FR-506 | Create page via sidebar '+', '+' beside a parent, or typing /หน้า in content (creates sub-page + inserts link) | M4 | m04 §5.S1.3, §5.S3.3, §5.S2.5 | `src/server/services/pages.int.test.ts` › create · `e2e/m4-pages.spec.ts` › E2, E5 | §4.5.1 |
| FR-507 | Template choice on create: ว่าง · Project Charter · บันทึกการประชุม · คู่มือ/SOP | M4 | m04 §5.S0.12, §5.S1.3, §5.S3.4 | `src/i18n/templates.test.ts` · `src/components/editor/templates.headless.test.ts` · `e2e/m4-pages.spec.ts` › E11 | §4.5.1 |
| FR-508 | Duplicate a page with its sub-pages | M4 | m04 §5.S1.5 | `src/server/services/pages.int.test.ts` › duplicate · `e2e/m4-pages.spec.ts` › E9 | §4.5.1 |
| FR-509 | Delete page → sub-pages deleted too → undo toast | M4 | m04 §5.S1.5, §5.S3.3 | `src/server/services/pages.int.test.ts` › delete/restore · `e2e/m4-pages.spec.ts` › E8 | §4.5.1 |
| FR-510 | Manager locks a wiki page → workers read-only; padlock icon | M4 | m04 §5.S1.2, §5.S1.6, §5.S3.2, §5.S3.3 | rows `tests/authz/rows/wiki.ts` › WK-PROT-* · `src/server/services/pages.int.test.ts` › protect · `e2e/m4-pages.spec.ts` › E7 | §4.5.1 |
| FR-520 | Slash menu with Thai names, searchable in English (/ตาราง or /table) | M4 | m04 §5.S0.9, §5.S2.2, §5.S2.5 | `dictionary.test.ts` · `src/lib/editor/suggest.test.ts` · `src/components/editor/slash-menu.test.ts` · `e2e/m4-pages.spec.ts` › E2, E12 | §4.5.2 |
| FR-521 | Text blocks: paragraph, H1–H3, bullet, numbered, checklist, toggle, quote, code, divider | M4 | m04 §5.S2.3 | `src/components/editor/schema.test.ts` · `e2e/m4-pages.spec.ts` › E12 | §4.5.2 |
| FR-522 | Inline styles: bold, italic, underline, strike, inline code, link, text colour, background colour | M4 | m04 §5.S2.3 | `e2e/m4-pages.spec.ts` › E12 (formatting toolbar bold + colour) | §4.5.2 |
| FR-523 | Tables: add/remove rows & columns, header row, column resize, cell background colour | M4 | m04 §5.S2.4 | `e2e/m4-pages.spec.ts` › E2 (add column), E12 (header row) | §4.5.2 |
| FR-524 | Paste from Excel / Google Sheets → a table block (not a blob of text) | M4 | m04 §5.S2.2 | `src/lib/editor/tsv.test.ts` · `paste.test.ts` · `e2e/m4-pages.spec.ts` › E3 | §4.5.2 |
| FR-525 | Images: paste from clipboard, drag & drop, or choose via /รูป | M4 | m04 §5.S2.2, §5.S2.4, §5.S1.7 | `upload.test.ts` · `src/server/services/files.int.test.ts` · `e2e/m4-pages.spec.ts` › E4 | §4.5.2 |
| FR-526 | Image: resize by dragging edge, align left/centre/right, caption | M4 | m04 (built into BlockNote image block (r3 §8.1)) | `e2e/m4-pages.spec.ts` › E4 (caption + align via toolbar) · manual M-3 | §4.5.2 |
| FR-527 | Attachments (PDF, Word, Excel, PowerPoint, ZIP) as a card with name + size; click to download | M4 | m04 §5.S2.3, §5.S1.7 | `attachment.test.tsx` · `src/server/services/files.int.test.ts` · `e2e/m4-pages.spec.ts` › E13 | §4.5.2 |
| FR-528 | Sub-page block: Notion-like link card to a child page, created from /หน้า | M4 | m04 §5.S2.3, §5.S2.5 | `subpage.test.tsx` · `e2e/m4-pages.spec.ts` › E5 | §4.5.2 |
| FR-529 | Mention: type @ → pick an employee or a page → clickable chip | M4 | m04 §5.S2.3, §5.S2.5, §5.S1.4, §5.S1.8 | `mention.test.tsx` · `src/server/services/pages.int.test.ts` › titles · `e2e/m4-pages.spec.ts` › E14 | §4.5.2 |
| FR-530 | Drag blocks to reorder via the left handle | M4 | m04 (built-in side menu) | `e2e/m4-pages.spec.ts` › E12 (side-menu drag handle visible, `draggable="true"`) · manual M-3 (reorder by drag) | §4.5.2 |
| FR-531 | Autosave 800 ms after typing stops and when leaving; status 'กำลังบันทึก… / บันทึกแล้ว' | M4 | m04 §5.S2.6, §5.S1.3, §5.S1.6 | `useAutosave.test.tsx` · `src/server/services/pages.int.test.ts` › save · `e2e/m4-pages.spec.ts` › E15 | §4.5.2 |
| FR-532 | Markdown shortcuts while typing: #, -, 1., [], >, triple backtick (code block) | M4 | m04 (built-in input rules (r3 §11)) | `e2e/m4-pages.spec.ts` › E12 | §4.5.2 |
| FR-540 | While someone edits, others see 'Cindy กำลังแก้หน้านี้' and open read-only | M4 | m04 §5.S1.6, §5.S2.7 | `src/server/services/page-lease.int.test.ts` · `useEditLease.test.tsx` · `e2e/m4-pages.spec.ts` › E6 | §4.5.3 |
| FR-541 | Edit lock expires after 2 minutes without heartbeat | M4 | m04 §5.S1.6, §5.S2.7 | `src/server/services/page-lease.int.test.ts` › expiry · `useEditLease.test.tsx` | §4.5.3 |
| FR-542 | 'แก้ต่อจากนี้' takes over the lock → previous holder sees a banner and goes read-only after flushing pending changes | M4 | m04 §5.S1.6, §5.S2.7 | `src/server/services/page-lease.int.test.ts` › takeover · `e2e/m4-pages.spec.ts` › E6 | §4.5.3 |
| FR-543 | Every save sends `version`; on conflict nothing is overwritten and a 'มีการแก้ไขใหม่กว่า' banner offers reload | M4 | m04 §5.S1.3, §5.S2.6 | `src/server/services/pages.int.test.ts` › version · `e2e/m4-pages.spec.ts` › E17 | §4.5.3 |
| FR-601 | Task fields: name (only required), notes, start, due, certainty override, linked milestone, multiple assignees, done | M3 · M8 (milestone part) | m03 §5.S0.2, §5.S2.4, §5.S3.6<br>m08 §5.S2.7, §5.S4.5 | M3: int `src/server/services/tasks.int.test.ts` › updateTask · ui `src/components/tasks/TaskPanel.test.tsx` · `e2e/m3-tasks.spec.ts` › E7<br>M8: ui `TaskPanel.milestone.test.tsx` · `e2e/m8-milestones.spec.ts` › M2 · ui panel/list/bulk tests · unit `group.test.ts` · `e2e/m8-milestones.spec.ts` › M2, **M6** | §4.6, X21 |
| FR-602 | Quick add '+ เพิ่มงาน…': type a name + Enter → created; cursor stays for the next one | M3 | m03 §5.S2.3, §5.S3.3 | ui `src/components/tasks/QuickAdd.test.tsx` · `e2e/m3-tasks.spec.ts` › E1 | §4.6 |
| FR-603 | Outliner: Tab indents under the row above, Shift+Tab outdents; max 3 levels | M3 | m03 §5.S1.3, §5.S2.5, §5.S3.4 | unit `src/lib/tree/ops.test.ts` · int `src/server/services/tasks.int.test.ts` › indent/outdent · `e2e/m3-tasks.spec.ts` › E2 | §4.6 |
| FR-604 | Drag to reorder and to nest under another task | M3 | m03 §5.S1.2, §5.S2.5, §5.S3.2 | unit `src/lib/tree/projection.test.ts` · int `› moveTask` · `e2e/m3-tasks.spec.ts` › E10 | §4.6 |
| FR-605 | Assignees: person-cell picker (search name/nickname/position), multi-select; remove with × on chip | M3 | m03 §5.S2.7, §5.S3.7 | int `src/server/services/assignments.int.test.ts` · authz PERM-13/14 · `e2e/m3-tasks.spec.ts` › E4 | §4.6 |
| FR-606 | Tasks without assignees show 'รอมอบหมาย' (never hidden) | M3 | m03 §5.S3.4 | ui `src/components/tasks/TaskList.test.tsx` · `e2e/m3-tasks.spec.ts` › E4 | §4.6 |
| FR-607 | Tick done → strikethrough; hidden when 'แสดงงานที่เสร็จแล้ว' is off; load rule BR-50 — **v3.1:** Checkbox = move to the first `DONE` status (BR-82); uncheck = default … | M3 | m03 §5.S2.6, §5.S1.4, §5.S3.4 | int `src/server/services/task-status.int.test.ts` › checkbox · unit `src/lib/pages/tree.test.ts` · `e2e/m3-tasks.spec.ts` › E6 · `src/domain/status.test.ts` (v3.1 row) | §4.6, X71 |
| FR-608 | Ticking a parent with open children → toast 'ติ๊กงานย่อยทั้งหมดด้วยไหม' [ติ๊กทั้งหมด] — **v3.1:** Prompt also fires when moving a parent into any `DONE` status | M3 | m03 §5.S2.6, §5.S3.8 | int `src/server/services/task-status.int.test.ts` › withChildren · `e2e/m3-tasks.spec.ts` › E6, E17 · `src/components/tasks/TaskList.test.tsx` (v3.1 row) | §4.6 |
| FR-609 | Delete (Delete key on selected row or menu) removes subtasks too → toast 'ลบ 'X' และงานย่อย 3 งานแล้ว · เลิกทำ' | M3 | m03 §5.S2.8, §5.S3.8 | int `› delete/restore` · `e2e/m3-tasks.spec.ts` › E3 | §4.6 |
| FR-610 | Adding a subtask to a task that has assignees/plans moves them to the new child (BR-31) + toast with undo | M3 · M6 (plans clause) | m03 §5.S2.3, §5.S2.5, §5.S3.8<br>m06 §5.S2.9 | M3: int `› FR-610 transfer` · `e2e/m3-tasks.spec.ts` › E5<br>M6: int `src/server/services/tasks.int.test.ts` › FR-610 plans | §4.6, X20 |
| FR-611 | Task detail panel slides from the right (~440 px, does not cover content); Esc closes; URL ?task=<id> | M3 | m03 §5.S3.6 | ui `src/components/tasks/TaskPanel.test.tsx` · `e2e/m3-tasks.spec.ts` › E7 | §4.6 |
| FR-612 | In the panel each assignee has 'วางแผน': total days + date range → auto-distribution (BR-25) with preview | M6 | m06 §5.S2.5, §5.S4.3 | int `src/server/services/plan-range.int.test.ts` · authz `tests/authz/rows/allocations.ts` › PR-* · `e2e/m6-grid.spec.ts` › G9, G10 · unit `src/domain/allocation.test.ts` › planRange | §4.6, G10 |
| FR-613 | List view: group by none / assignee / milestone / certainty; sort manual / due date — **v3.1:** Group by status added | M3 · M8 (milestone part) | m03 §5.S1.4, §5.S3.5<br>m08 §5.S0.6, §5.S4.3, §5.S4.4 | M3: unit `group.test.ts` · `e2e/m3-tasks.spec.ts` › E8 · `src/components/tasks/TaskList.test.tsx` (v3.1 row)<br>M8: unit `group.test.ts` › milestone · `e2e/m8-milestones.spec.ts` › M6 · ui panel/list/bulk tests · `e2e/m8-milestones.spec.ts` › M2, **M6** | §4.6, X21 |
| FR-614 | Multi-select (Shift/Cmd+click) → bulk delete, done, assign, link milestone — **v3.1:** Bulk status change added | M3 · M8 (milestone part) | m03 §5.S1.4, §5.S2, §5.S3.9<br>m08 §5.S2.2, §5.S4.6 | M3: unit `selection.test.ts` · int bulk cases · `e2e/m3-tasks.spec.ts` › E9, E18 · `src/components/tasks/TaskList.test.tsx` (v3.1 row)<br>M8: int `› link bulk` · `e2e/m8-milestones.spec.ts` › M6 · ui panel/list/bulk tests · unit `group.test.ts` · `e2e/m8-milestones.spec.ts` › M2, **M6** | §4.6, X21 |
| FR-620 | Every task has exactly one status of its own project; parent status independent of children | M3 | m03 §5.S0.2, §5.S2.14 | int `src/server/db/schema.int.test.ts` › task_statuses · `src/server/services/task-statuses.int.test.ts` (v3.1 row) | §4.6.1 |
| FR-621 | Five default statuses on project creation (+ `ensureProjectStatuses()` backfill, X70) | M3 | m03 §5.S2.14, §5.S2.12 | int `src/server/services/task-statuses.int.test.ts` › defaults · `e2e/m3-tasks.spec.ts` › E15 | §4.6.1, X70 |
| FR-622 | LEAD/Manager add, rename, recolour, recategorise, reorder; unique name; max 12 | M3 | m03 §5.S2.14, §5.S3.18 | int `› create/update/reorder` · ui `src/components/projects/StatusSettings.test.tsx` · authz PERM-23 · `e2e/m3-tasks.spec.ts` › E16 · `src/server/services/task-statuses.int.test.ts` (v3.1 row) | §4.6.1 |
| FR-623 | `TODO` ≥ 1 and `DONE` ≥ 1; in-use status cannot change category into/out of `DONE` | M3 | m03 §5.S1.5, §5.S2.14 | unit `src/domain/status.test.ts` · int `src/server/services/task-statuses.int.test.ts` › doneCategoryInUse | §4.6.1, X71, M3-D27 |
| FR-624 | Delete status: unused → immediate + undo; used → choose destination, move + delete in one tx, undo restores exactly | M3 | m03 §5.S2.14, §5.S3.18 | int `› delete/restore` · `e2e/m3-tasks.spec.ts` › E18 · `src/server/services/task-statuses.int.test.ts` (v3.1 row) | §4.6.1, X72 |
| FR-625 | New task gets the default status; column quick-add gets the column's status | M3 | m03 §5.S2.3, §5.S3.16 | int `› createTask status` · `e2e/m3-tasks.spec.ts` › E15 · `src/server/services/tasks.int.test.ts` · `src/components/tasks/QuickAdd.test.tsx` (v3.1 row) | §4.6.1 |
| FR-626 | Change status from chip, panel, board drag, multi-select, `S` shortcut | M3 | m03 §5.S3.15, §5.S3.4, §5.S3.16, §5.S3.9 | ui `src/components/tasks/status/StatusMenu.test.tsx`, `src/components/tasks/TaskList.test.tsx` · `e2e/m3-tasks.spec.ts` › E17 | §4.6.1 |
| FR-627 | Chip = category icon + name + colour (not colour alone) | M3 | m03 §5.S3.15 | ui · manual a11y · `src/components/tasks/status/StatusMenu.test.tsx` (v3.1 row) | §4.6.1 |
| FR-628 | Only `DONE` affects load; `WAITING` still counts | M3 · M6 (load part) · M9 | m03 §5.S1.5, §5.S2.6<br>m06 §5.S2.2<br>m09 §5.S2.1 | M3: unit · int (files per step: `src/domain/status.test.ts`, `src/server/services/task-status.int.test.ts`, `src/server/services/task-statuses.int.test.ts`, `src/server/services/tasks.int.test.ts`)<br>M6: int `src/server/services/grid.int.test.ts` › WAITING counts<br>M9: int `› WAITING`, `› milestones no load`, `› BR-50` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) · int `repo/allocations › loadByUserProjectWeek`, `workload › WAITING / milestones no load` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) | §4.6.1 |
| FR-640 | "ถูกขวางโดย" picker, same project, remove with undo | M3 | m03 §5.S2.15, §5.S3.17 | int `src/server/services/task-blockers.int.test.ts` · `e2e/m3-tasks.spec.ts` › E19 · `src/components/tasks/blockers/BlockersSection.test.tsx` (v3.1 row) | §4.6.2 |
| FR-641 | Many blockers; reverse "กำลังขวาง" list | M3 | m03 §5.S3.17 | ui `src/components/tasks/blockers/BlockersSection.test.tsx` · `src/server/services/task-blockers.int.test.ts` (v3.1 row) | §4.6.2 |
| FR-642 | Reject cycles, self, ancestor/descendant, with path | M3 | m03 §5.S1.6, §5.S2.15 | unit + property · int · `e2e/m3-tasks.spec.ts` › E19 (files per step: `src/domain/blockers.test.ts`, `src/domain/certainty.test.ts`, `src/domain/status.test.ts`, `src/server/services/task-blockers.int.test.ts`) | §4.6.2, X73 |
| FR-643 | ⛔ "รอ N งาน" badge in list/board (grid in M6, X76) | M3 · M6 (grid part) | m03 §5.S2.10, §5.S3.17<br>m06 §5.S0.4, §5.S2.2, §5.S3.3 | M3: `src/server/services/tasks.int.test.ts` (S2.10 SQL counts `{ open, total }`) · ui `src/components/tasks/TaskList.test.tsx` (row "รอ 1 งาน"), `src/components/tasks/blockers/BlockersSection.test.tsx` (badge + tooltip), `src/components/tasks/board/TaskBoard.test.tsx` · `e2e/m3-tasks.spec.ts` › E19<br>M6: int `src/server/services/grid.int.test.ts` › blockers · ui · `e2e/m6-grid.spec.ts` › G2 · ui `src/components/grid/PlanGrid.test.tsx` | §4.6.2, X76 |
| FR-644 | ✓ "ตัวขวางเสร็จแล้ว"; no automatic status/plan change | M3 | m03 §5.S1.6, §5.S3.17 | unit · int · `e2e/m3-tasks.spec.ts` › E19 (files per step: `src/domain/blockers.test.ts`, `src/domain/certainty.test.ts`, `src/domain/status.test.ts`) | §4.6.2 |
| FR-645 | Deleting a task soft-deletes its edges in the same batch; undo restores them | M3 | m03 §5.S2.8 | int `› delete/restore › blockers` (files per step: `src/server/services/tasks.int.test.ts`) | §4.6.2, X73 |
| FR-660 | List/board toggle remembered (`tasks.view`) | M3 | m03 §5.S0.13, §5.S3.16 | ui · `e2e/m3-tasks.spec.ts` › E17 · `src/components/tasks/board/TaskBoard.test.tsx` (v3.1 row) | §4.6.3, X74 |
| FR-661 | Columns = project statuses; card content (milestone from M8, X21) | M3 · M8 (milestone part) | m03 §5.S1.4, §5.S3.16<br>m08 §5.S4.7 | M3: unit `board.test.ts` · ui `src/components/tasks/board/TaskBoard.test.tsx`<br>M8: ui `TaskCard.milestone.test.tsx` · `e2e/m8-milestones.spec.ts` › M7 · ui `TaskBoard.milestone.test.tsx` · int `src/server/services/team-tasks.int.test.ts` › milestoneId | §4.6.3, X21, M3-D37 |
| FR-662 | Drag across columns = status change with undo; no within-column reorder | M3 | m03 §5.S3.16 | `e2e/m3-tasks.spec.ts` › E17 | §4.6.3 |
| FR-663 | All levels; filters (milestone filter from M8) | M3 · M8 (milestone part) | m03 §5.S1.4, §5.S3.16<br>m08 §5.S4.3, §5.S4.7, §5.S4.8, §5.S2.7 | M3: unit · ui<br>M8: unit `board.test.ts` › milestone · int `src/server/services/team-tasks.int.test.ts` › milestoneId · `e2e/m8-milestones.spec.ts` › M7 · ui `TaskBoard.milestone.test.tsx` | §4.6.3, X21, M3-D37 |
| FR-664 | `+ เพิ่มงาน` per column | M3 | m03 §5.S2.3, §5.S3.16 | int · ui (files per step: `src/server/services/tasks.int.test.ts`) · `src/components/tasks/QuickAdd.test.tsx` (v3.1 row) | §4.6.3 |
| FR-665 | `/tasks`: visible projects only; columns = categories; filters | M3 | m03 §5.S2.16, §5.S1.4, §5.S3.19 | int `src/server/services/team-tasks.int.test.ts` · `tests/authz/masking.int.test.ts` (m03 §5.S4.3) · `e2e/m3-tasks.spec.ts` › E20 · `src/components/tasks/team/TeamTasks.test.tsx` (v3.1 row) | §4.6.3, X75 |
| FR-666 | Category drag → first status of that category, or refuse | M3 | m03 §5.S1.4, §5.S3.19 | unit · ui · `e2e/m3-tasks.spec.ts` › E20 | §4.6.3 |
| FR-667 | Person tab + `/my` reuse the component (`/my` keeps X22 grouping) | M3 · M9 | m03 §5.S3.12<br>m09 §5.S4.8, §5.S4.10 | M3: `e2e/m3-tasks.spec.ts` › E13<br>M9: ui `TeamTasks.fixedUser.test.tsx` · mask (via M3's `/api/tasks`) · `e2e/m9-workload.spec.ts` › W10 · ui `TeamTasks.fixedUser.test.tsx`, `src/components/tasks/MyTasks.test.tsx` · `e2e/m9-workload.spec.ts` › W9, W10 | §4.6.3, X22, X77 |
| FR-680 | Every task has a document body (M4 editor, all blocks except sub-page) | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, D18 |
| FR-681 | Body = pages row kind TASK 1:1 (task_id unique), created on first edit | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, §6.2 |
| FR-682 | TASK pages hidden from trees/sidebar/docs tab/recent/@/page search; not movable/duplicable/lockable | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4 |
| FR-683 | Task page /t/[taskId]: header bar, title, properties (status, dates, certainty, assignees+plan, blockers, subtasks), body | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, §8.12 |
| FR-684 | Panel keeps quick edits, gains compact body + "เปิดเป็นหน้า" | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, FR-611 |
| FR-685 | Click = panel; ↗ link = page (Cmd/Ctrl-click new tab); Shift+Space in list | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, FR-614 |
| FR-686 | Back / Esc returns to previous in-app view (else project tasks tab) | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4 |
| FR-687 | Permissions = task (requirePage TASK → requireTask); W 404; masking unchanged | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, §3.2 PERM-27/28 |
| FR-688 | Edit lease covers body only; properties stay editable | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, FR-540 |
| FR-689 | Task delete/restore carries the body (same batch); cascade on project delete | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, FR-609 |
| FR-690 | Cmd+K task group matches name and body (≥ 3 chars) | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, FR-1102 |
| FR-691 | 📄 marker on tasks with a body | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4 |
| FR-692 | Migrate tasks.notes into the body, then drop the column | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, §6.2 |
| FR-693 | Body saves audited like page saves (no content) | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.6.4, FR-1201 |
| FR-701 | Milestone: name, date (day), description, done status | M8 | m08 §5.S0.2, §5.S0.4, §5.S2.2 | int `milestones.int.test.ts` › create/update · unit `schemas/milestones.test.ts` · `e2e/m8-milestones.spec.ts` › M4 | §4.7 |
| FR-702 | LEAD/manager create from the overview tab, the grid milestone row (click a date cell) or Cmd+K | M8 | m08 §5.S4.2, §5.S3.4, §5.S4.10 | `e2e/m8-milestones.spec.ts` › M1, M4, M9 · ui (files per step: `src/components/palette/CommandPalette.test.tsx`) · `e2e/m8-milestones.spec.ts` › M4, M1, **M9** · ui `src/components/palette/CommandPalette.test.tsx` | §4.7 |
| FR-703 | Link a task to one milestone; show progress 'เสร็จ 4/7 งาน' | M8 | m08 §5.S2.2, §5.S2.7, §5.S4.5, §5.S4.6 | int `milestones.int.test.ts` › progress, `› link` · `e2e/m8-milestones.spec.ts` › M2, M4, M6 · `e2e/m8-milestones.spec.ts` › M4 | §4.7, X66 |
| FR-704 | Computed status (BR-70): DONE · OVERDUE · DUE_SOON (≤ 7 days) · UPCOMING | M8 | m08 §5.S1.2, §5.S2.2 | unit `src/domain/milestone.test.ts` · golden (r8 §4.9 table) · int `milestones.int.test.ts` (create/update/progress/delete/restore) · `e2e/m8-milestones.spec.ts` › M4 | §4.7 |
| FR-705 | ◆ on the project grid top row, person grid (projects where that person has tasks), team calendar, home | M8 · M9 (person grid part) · M10 (home part) | m08 §5.S3.3, §5.S4.9<br>m09 §5.S2.5, §5.S3.6<br>m10 §5.S1.3, §5.S2.2 | M8: ui `src/components/grid/MilestoneRow.test.tsx` · `e2e/m8-milestones.spec.ts` › M1, M8 · int `src/server/services/grid.int.test.ts` › milestones · `e2e/m8-milestones.spec.ts` › M1, M10 · int `src/server/services/calendar.int.test.ts` › milestones · mask · `e2e/m8-milestones.spec.ts` › **M8**<br>M9: int `src/server/services/grid-person.int.test.ts` › milestones · mask (MASK-6) · int `grid-person › milestones` · mask golden (M8 names) · ui `PlanGrid.person.test.tsx`<br>M10: `src/server/services/home.int.test.ts` › milestones · `tests/authz/masking.int.test.ts` › K4/K5 · `e2e/m10-home-search.spec.ts` › H1, H3 | §4.7, X28, M9-D29 |
| FR-706 | 'เลย milestone' warning when a linked task has plans or due date after the milestone (BR-71) | M8 | m08 §5.S1.3, §5.S2.1, §5.S2.5–S2.8, §5.S3.7, §5.S4.4–S4.7 | unit · int `repo/milestones.int.test.ts` › lateFacts, `milestones.int.test.ts` › AC-702 · golden · `e2e/m8-milestones.spec.ts` › M2 (files per step: `src/server/repo/milestone-join-guard.test.ts`) · int `repo/milestones.int.test.ts` › lateFacts + `allocations.int.test.ts` › lateness · ui list/panel/board/grid | §4.7 |
| FR-707 | Drag ◆ on the grid to change its date | M8 | m08 §5.S1.4, §5.S3.5, §5.S3.6 | unit `lib/grid/milestones.test.ts` · `e2e/m8-milestones.spec.ts` › M3 · unit `dateForDrop`, `dateInWeekKeepingWeekday` · ui `useMilestoneDrag` | §4.7, X66 |
| FR-708 | Delete milestone → linked tasks are unlinked (not deleted) → undo toast | M8 | m08 §5.S2.2, §5.S4.2, §5.S3.5 | int `› delete/restore` · authz `tests/authz/rows/milestones.ts` › MS-DELETE/MS-RESTORE · `e2e/m8-milestones.spec.ts` › M4 · int `milestones.int.test.ts` (create/update/progress/delete/restore) | §4.7, X66 |
| FR-801 | Continuous timeline: horizontal scroll keeps loading weeks; 'วันนี้' jumps back | M6 | m06 §5.S3.2, §5.S3.5, §5.S3.9 | unit `columns.test.ts` · `e2e/m6-grid.spec.ts` › G1 | §4.8, X65 |
| FR-802 | Two zoom levels: week columns and day columns | M6 (week part) · M7 | m06 §5.S3.9<br>m07 §5.S0.3, §5.S2.2, §5.S3.3, §5.S3.11 | M6: `e2e/m6-grid.spec.ts` › G1<br>M7: int `src/server/services/grid-day.int.test.ts` › zoom=day · `e2e/m7-daily.spec.ts` › D5 · int `grid-day › zoom=day` · ui `ZoomToggle.test.tsx` | §4.8 |
| FR-803 | Expand selected weeks to days inline (click week header or Cmd+↓) | M7 | m07 §5.S2.2, §5.S3.1–S3.3 | ui `src/components/grid/GridHeader.day.test.tsx` · `e2e/m7-daily.spec.ts` › D1, D6 · unit `src/lib/grid/expansion.test.ts`, `src/lib/grid/keymap.test.ts` | §4.8 |
| FR-804 | Display unit: days (default) or fraction of week (0–1) — personal preference | M6 · M7 (day cells) | m06 §5.S1.1, §5.S3.4, §5.S3.9<br>m07 §5.S3.6 | M6: unit `src/domain/units.test.ts` · `e2e/m6-grid.spec.ts` › G4<br>M7: unit `src/lib/grid/day-input.test.ts` · ui `src/components/grid/GridCell.day.test.tsx` · `e2e/m7-daily.spec.ts` › D7 (🎌 header, grey Friday) | §4.8 |
| FR-805 | Task rows show the read-only sum of assignees; assignee rows are editable | M6 | m06 §5.S2.2, §5.S3.3 | unit `rows.test.ts`, `aggregate.test.ts` · int · `e2e/m6-grid.spec.ts` › G2 (files per step: `src/server/services/grid.int.test.ts`) | §4.8 |
| FR-806 | Sticky footer: total load · capacity · % utilisation of the people in the grid | M6 | m06 §5.S2.2, §5.S3.7 | unit `aggregate.test.ts` · int `src/server/services/grid.int.test.ts` · golden · `e2e/m6-grid.spec.ts` › G8 | §4.8, X29 |
| FR-807 | Time off as diagonal stripes + icon; holidays grey with name tooltip | M6 (week cells) · M7 (day cells) | m06 §5.S2.2, §5.S3.4, §5.S3.6<br>m07 §5.S2.3, §5.S3.4 | M6: ui `src/components/grid/GridCell.test.tsx` · mask · `e2e/m6-grid.spec.ts` › G3<br>M7: ui · `e2e/m7-daily.spec.ts` › D7 (files per step: `src/components/grid/GridCell.day.test.tsx`) · unit `src/lib/grid/day-input.test.ts` · ui `src/components/grid/GridCell.day.test.tsx` | §4.8 |
| FR-808 | Tentative task rows: amber bar on the left + faded numbers | M6 | m06 §5.S3.4 | ui `src/components/grid/GridCell.test.tsx` | §4.8 |
| FR-809 | Load view: all · confirmed only · uncertain part | M6 | m06 §5.S1.2, §5.S3.7, §5.S3.9 | unit `aggregate.test.ts` · `e2e/m6-grid.spec.ts` › G8 | §4.8 |
| FR-810 | Plan tab switch [แผนงาน \| ปฏิทิน]; pref plan.view; ?view= wins; panel in both | M7.1 | m07.1 §5.S0.4, §5.S4.1 | ui `PlanViewSwitch.test.tsx` · `e2e/m7.1-grid.spec.ts` › P7 | §4.8.1, M7.1-D20 |
| FR-811 | Project month calendar: Thai month/พ.ศ., Monday first, holidays, bars start→due with assignee names, ◐, done, +N, click = panel, ↗ = page | M7.1 | m07.1 §5.S1.6, §5.S4.2 | unit `src/lib/plan-calendar/bars.test.ts` · ui `PlanCalendar.test.tsx` · `e2e/m7.1-grid.spec.ts` › P7 | §4.8.1, §8.13, D22, M7.1-D19 |
| FR-812 | Calendar date rules (BR-103), "ไม่มีวันที่" list, parents with own dates, phone agenda | M7.1 | m07.1 §5.S1.6, §5.S4.2, §5.S4.3 | unit `bars.test.ts`, `agenda.test.ts` · ui `PlanAgenda.test.tsx` · `e2e/m7.1-grid.spec.ts` › P7, P9 | §4.8.1 |
| FR-813 | Per-person weekly load line chart over visible weeks; capacity; shared "รวมงานโปรเจคอื่น"; OVER marks; markers; table view | M7.1 | m07.1 §5.S1.4, §5.S3.7, §5.S4.4 | unit `src/lib/grid/load-series.test.ts` · ui `LoadChartPanel.test.tsx` · golden `tests/golden/plan-chart.int.test.ts` · mask `› M7.1 chart` · `e2e/m7.1-grid.spec.ts` › P8 | §4.8.1, §8.13, D25, M7.1-D2…D5, X29 |
| FR-814 | Resize the งาน column (pointer + keyboard separator), 160–640 px, pref grid.taskColumnWidth | M7.1 | m07.1 §5.S1.5, §5.S3.2 | unit `frozen.test.ts` · ui `ColumnResizeHandle.test.tsx` · `e2e/m7.1-grid.spec.ts` › P2 | §4.8.1, M7.1-D8/D9 |
| FR-815 | Drag ⠿ to reorder task rows (subtree, depth by offset, autoscroll); Alt+↑/↓/→/←; undo | M7.1 | m07.1 §5.S1.3, §5.S3.6 | unit `row-drop.test.ts` · ui `useRowDrag.test.tsx` · `e2e/m7.1-grid.spec.ts` › P3 | §4.8.1, BR-105, M7.1-D16…D18 |
| FR-816 | Separate frozen columns งาน / ผู้รับผิดชอบ; hide toggle (grid.showAssignees); hidden = one row per task with sums | M7.1 | m07.1 §5.S1.2, §5.S3.1, §5.S3.3 | unit `rows.test.ts` · ui `PlanGrid.columns.test.tsx` · `e2e/m7.1-grid.spec.ts` › P1 | §4.8.1, §8.3, M7.1-D6/D7 |
| FR-817 | Summed cell editing: 1 assignee editable, ≥ 2 read-only + hint + [แสดงผู้รับผิดชอบ]; ranges skip | M7.1 | m07.1 §5.S1.2, §5.S3.3 | unit `rows.test.ts › readOnlySum` · ui `SumModeHint.test.tsx` · `e2e/m7.1-grid.spec.ts` › P1 | §4.8.1, BR-101, D23 |
| FR-818 | Two-level header: month-year row + week/day row; month boundary lines | M7.1 | m07.1 §5.S1.1, §5.S3.4 | unit `months.test.ts` · ui `MonthHeader.test.tsx` · `e2e/m7.1-grid.spec.ts` › P4 | §4.8.1, M7.1-D10, X85 |
| FR-819 | Plan markers red/yellow/green + label at a column's right edge; shared per project; create/edit/delete + undo; ≤ 100 | M7.1 | m07.1 §5.S0.2–S0.6, §5.S2.1–S2.4, §5.S3.5 | int `src/server/services/plan-markers.int.test.ts` · authz `tests/authz/rows/plan-markers.ts` · ui `MarkerPopover.test.tsx` · `e2e/m7.1-grid.spec.ts` › P5, P6 | §4.8.1, §6.2, §7.10, M7.1-D11…D15 |
| FR-820 | Marker rendering (patterns, flags, grid/calendar/chart); one layer shared with M8 milestones | M7.1 | m07.1 §5.S1.7, §5.S3.5, §5.S4.2, §5.S4.4 | unit `markers.test.ts` · ui `MarkerLayer.test.tsx` · `e2e/m7.1-grid.spec.ts` › P5 | §4.8.1, D24, M7.1-D12 |
| FR-901 | Manager manages company holidays: add/edit/delete one by one and import CSV (date,name) | M5 | m05 §5.S1.2, §5.S2.2, §5.S2.8, §5.S3.6 | unit `src/lib/csv/holidays.test.ts` · int `src/server/services/holidays.int.test.ts`, `scripts/lib/import-holidays.int.test.ts` · authz `tests/authz/rows/holidays.ts` › PERM-02f…j · `e2e/m5-calendar.spec.ts` › E4 · ui `HolidaysTable.test.tsx` | §4.9, X64 |
| FR-902 | Manager manages leave types: name, colour, order (seed 4: ลาพักร้อน, ลาป่วย, ลากิจ, อบรม/สัมมนา) | M5 | m05 §5.S2.3, §5.S2.9, §5.S3.7 | int `src/server/services/leave-types.int.test.ts` · int `tests/integration/bootstrap.int.test.ts` (M5 cases) · authz `tests/authz/rows/leave-types.ts` › PERM-02k…p · `e2e/m5-calendar.spec.ts` › E6 · ui `LeaveTypesList.test.tsx` · bootstrap T-BOOT-LT-* | §4.9, X64 |
| FR-903 | Employee records own leave: date range, type, full/AM/PM (half only for single day), note | M5 | m05 §5.S0.6, §5.S2.4, §5.S3.4 | unit `src/lib/schemas/time-off.test.ts` · int `src/server/services/time-off.int.test.ts` · ui `src/components/calendar/LeaveDialog.test.tsx` · authz `tests/authz/rows/time-off.ts` › PERM-20a…e · `e2e/m5-calendar.spec.ts` › E1 · `e2e/m5-calendar.spec.ts` › E1, E5, E7 · int `› create`, `› effective immediately` | §4.9, X50 |
| FR-904 | No approval — leave takes effect immediately | M5 | m05 §5.S2.4 | int `src/server/services/time-off.int.test.ts` › effective immediately (capacity loader sees it in the same request) · `e2e/m5-calendar.spec.ts` › E1, E5, E7 · int `› create`, `› effective immediately` · unit `src/lib/schemas/time-off.test.ts` | §4.9 |
| FR-905 | Overlapping leave is rejected, naming the conflicting entry | M5 | m05 §5.S2.4, §5.S0.3 | int `src/server/services/time-off.int.test.ts` › overlap* · int `src/server/db/schema.int.test.ts` › exclusion · `e2e/m5-calendar.spec.ts` › E2 · see AC-M5-b | §4.9, X64 |
| FR-906 | After saving leave show impact: capacity X → Y and newly created overloads with fix links | M5 (capacity part) · M9 (overload part) | m05 §5.S1.1, §5.S2.4, §5.S3.5<br>m09 §5.S1.2, §5.S2.9, §5.S4.11 | M5: unit `src/domain/capacity.test.ts` › impact · int `src/server/services/time-off.int.test.ts` › impact · `e2e/m5-calendar.spec.ts` › E1, E4, E5 · unit `› impact` · int `› impact`<br>M9: unit `worsened` · int `src/server/services/time-off.int.test.ts` › overloads · golden F3/F4 · `e2e/m9-workload.spec.ts` › W8 · golden FR-906 · ui `src/components/calendar/ImpactPanel.test.tsx` | §4.9, X23, M7-D15 |
| FR-907 | Team calendar /calendar (month): everyone's leave (per §3.3), holidays, milestones of visible projects | M5 (leave + holidays) · M8 (milestone part) | m05 §5.S1.3, §5.S2.6, §5.S0.8, §5.S3.2–S3.3<br>m08 §5.S2.8, §5.S4.9 | M5: int `src/server/services/calendar.int.test.ts` · mask (calendar block) · ui `src/components/calendar/MonthGrid.test.tsx` · `e2e/m5-calendar.spec.ts` › E1, E5, E7 · `e2e/m5-calendar.spec.ts` › E1, E4, E5, E7 · ui `src/components/calendar/MonthGrid.test.tsx`, `TeamCalendar.test.tsx` (files per step: `src/server/services/masking.int.test.ts`)<br>M8: int `src/server/services/calendar.int.test.ts` › milestones · mask · `e2e/m8-milestones.spec.ts` › M8 | §4.9, X24 |
| FR-908 | Click an empty day range on the calendar → quick-create own leave | M5 | m05 §5.S3.2, §5.S3.4 | ui `src/components/calendar/MonthGrid.test.tsx` › selection · `e2e/m5-calendar.spec.ts` › E1, E8 | §4.9 |
| FR-909 | Delete leave → undo toast | M5 | m05 §5.S2.4, §5.S3.4 | int `src/server/services/time-off.int.test.ts` › restore* · authz `tests/authz/rows/time-off.ts` › PERM-20c/d, 21e/f · `e2e/m5-calendar.spec.ts` › E3 · int `› restore*` | §4.9 |
| FR-1001 | /workload: people × weeks (12 weeks from this week, scrollable), grouped by position | M9 | m09 §5.S2.2, §5.S4.2 | int `src/server/services/workload.int.test.ts` › population/groups · golden · `e2e/m9-workload.spec.ts` › W1 · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10, X67 |
| FR-1002 | Cell shows load/capacity + BR-45 colour; hover = per-project breakdown (masked per §3.3) | M9 | m09 §5.S1.1–S1.3, §5.S2.2, §5.S4.3 | unit `src/domain/overload.test.ts`, `src/lib/format.test.ts`, `tooltip.test.ts` · ui `WorkloadCell.test.tsx` · mask · `e2e/m9-workload.spec.ts` › W1, W4 · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10 |
| FR-1003 | View toggle: all · confirmed only · uncertain part | M9 | m09 §5.S1.2, §5.S4.2 | unit `viewTone` · ui · `e2e/m9-workload.spec.ts` › W2 · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10, M6-D21, X67 |
| FR-1004 | Filters: position / project / only overloaded people | M9 | m09 §5.S2.2, §5.S4.2 | int `› filters` · authz `tests/authz/rows/workload.ts` › WL-PROJ-* · `e2e/m9-workload.spec.ts` › W2 · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10, X67 |
| FR-1005 | Click a cell → side panel with the tasks behind the number; each links to its editor | M9 | m09 §5.S2.3, §5.S4.4 | int `› cell detail` · mask · `e2e/m9-workload.spec.ts` › W3 · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10 |
| FR-1006 | 'รายการที่ล้น' tab: person · week · level (OVER/RISK) · excess days · cause (BR-41) · fix link | M9 | m09 §5.S2.2, §5.S4.5 | int · golden F2–F4 · `e2e/m9-workload.spec.ts` › W1 (files per step: `src/server/services/workload.int.test.ts`) · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10 |
| FR-1007 | Workload menu badge = number of OVER cells in the next 4 weeks visible to the user | M9 | m09 §5.S2.4, §5.S4.6 | int `› badge` · golden (r8 badge table) · `e2e/m9-workload.spec.ts` › W5 · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10, X31 |
| FR-1008 | /people/[id]: header (name, position, schedule) + tabs แผนงาน (person grid) · งาน · วันลา | M9 | m09 §5.S2.5–S2.7, §5.S3, §5.S4.7–S4.9 | int · authz `tests/authz/rows/people.ts` › PG-*, PH-*, PT-* · mask · `e2e/m9-workload.spec.ts` › W6, W10 (files per step: `src/server/services/grid-person.int.test.ts`, `src/server/services/people.int.test.ts`) · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10 |
| FR-1009 | /my: own tasks grouped this week / next week / later / unplanned; tick done here | M3 (basic) · M9 | m03 §5.S2.10, §5.S3.12<br>m09 §5.S1.4, §5.S2.8, §5.S4.10 | M3: int `src/server/services/my-tasks.int.test.ts` · `e2e/m3-tasks.spec.ts` › E13<br>M9: unit `buckets.test.ts` · int `src/server/services/my-tasks.int.test.ts` · `e2e/m9-workload.spec.ts` › W9 · int `src/server/services/workload.int.test.ts` (population, filters, overloads, cell detail, badge), `src/server/services/people.int.test.ts`, `src/server/services/grid-person.int.test.ts`, `src/server/services/my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · `e2e/m9-workload.spec.ts` › W1–W6, W9, W10 | §4.10, X22 |
| FR-1101 | /home (first page after login) cards: my tasks this week (tickable) · my load 8 weeks (BR-45) · milestones next 14 days · who is on leave today/this week · 8 recently … | M10 | m10 §5.S2.1, §5.S1.7 | `src/server/services/home.int.test.ts` · `HomeDashboard.test.tsx` · `e2e/m10-home-search.spec.ts` › H1–H4 | §4.11, X32 |
| FR-1101a | Home card "งานของฉันสัปดาห์นี้" = M9 FR-1009 bucket THIS_WEEK (supersedes r7 "plan OR due", G48 / M10-D13); tickable | M10 | m10 §5.S1.1, §5.S2.2 | `src/server/services/home.int.test.ts` › myTasks · `MyTasksCard.test.tsx` · `e2e/m10-home-search.spec.ts` › H1, H2 · `HomeDashboard.test.tsx` and card tests · `e2e/m10-home-search.spec.ts` › **H1–H4** | §4.11 — r7 sub-row of FR-1101 (not a SPEC id) |
| FR-1101b | Home card: my load for the next 8 weeks (small bars coloured per BR-45) | M10 | m10 §5.S1.2, §5.S2.2 | `src/server/services/home.int.test.ts` › myLoad (golden r8 §4.10) · `MyLoadCard.test.tsx` · `e2e/m10-home-search.spec.ts` › H1 · `HomeDashboard.test.tsx` and card tests · `e2e/m10-home-search.spec.ts` › **H1–H4** | §4.11 — r7 sub-row of FR-1101 (not a SPEC id) |
| FR-1101c | Home card: milestones in the next 14 days (visible projects only) | M10 (home part) | m10 §5.S1.3, §5.S2.2 | `src/server/services/home.int.test.ts` › milestones · `tests/authz/masking.int.test.ts` › K4/K5 · `e2e/m10-home-search.spec.ts` › H1, H3 · `HomeDashboard.test.tsx` and card tests · `e2e/m10-home-search.spec.ts` › **H1–H4** | §4.11 — r7 sub-row of FR-1101 (not a SPEC id) |
| FR-1101d | Home card: who is on leave today / this week | M10 | m10 §5.S1.4, §5.S2.2 | `leave-lines.test.ts` · `src/server/services/home.int.test.ts` › leave · `tests/authz/masking.int.test.ts` › K4/K5 · `e2e/m10-home-search.spec.ts` › H1, H3 · `HomeDashboard.test.tsx` and card tests · `e2e/m10-home-search.spec.ts` › **H1–H4** | §4.11 — r7 sub-row of FR-1101 (not a SPEC id), X68 |
| FR-1101e | Home card: 8 most recently edited pages the user can see | M10 | m10 §5.S1.5, §5.S2.2 | `src/server/services/home.int.test.ts` › recentPages · `tests/authz/masking.int.test.ts` › K4 · `e2e/m10-home-search.spec.ts` › H1 · `HomeDashboard.test.tsx` and card tests · `e2e/m10-home-search.spec.ts` › **H1–H4** | §4.11 — r7 sub-row of FR-1101 (not a SPEC id) |
| FR-1101f | Home cards, manager only: people overloaded this week and next week; team utilisation % over 4 weeks | M10 | m10 §5.S1.6, §5.S2.2 | `src/server/services/home.int.test.ts` › manager (golden F1/F3: 72.5 % / 74.0 %, Peter 10-05 OVER +2.00) · row `tests/authz/rows/home.ts` › HM-HOME + `tests/authz/masking.int.test.ts` › K4 (`manager: null`) · `e2e/m10-home-search.spec.ts` › H3 · `HomeDashboard.test.tsx` and card tests · `e2e/m10-home-search.spec.ts` › **H1–H4** | §4.11 — r7 sub-row of FR-1101 (not a SPEC id), X67 |
| FR-1102 | Cmd/Ctrl+K from every page: search projects · tasks · pages (title + content) · employees · clients | M4 (part) · M10 | m04 §5.S3.5<br>m10 §5.S0.6, §5.S1.8, §5.S2.3 | M4: `src/components/palette/CommandPalette.test.tsx` · `e2e/m4-pages.spec.ts` › E16<br>M10: `src/server/services/search.int.test.ts` · `src/components/palette/CommandPalette.test.tsx` · `e2e/m10-home-search.spec.ts` › P1, P2 · rows `tests/authz/rows/search.ts` › SR-* · `tests/authz/masking.int.test.ts` › K1–K3 | §4.11, X08 |
| FR-1103 | Palette quick commands: create task, create page, report leave, go to today | M10 | m10 §5.S2.4 | `src/components/palette/commands.test.ts` · `src/components/palette/CommandPalette.test.tsx` · `e2e/m10-home-search.spec.ts` › P4 | §4.11, X68 |
| FR-1104 | Search results respect §3 — nothing the user may not see | M4 (pages part) · M10 | m04 §5.S1.8<br>m10 §5.S1.8 | M4: `src/server/services/search.int.test.ts` · `tests/authz/masking.int.test.ts` › search · `e2e/m4-pages.spec.ts` › E16<br>M10: rows `tests/authz/rows/search.ts` › SR-* · `tests/authz/masking.int.test.ts` › K1–K3 · `src/server/services/search.int.test.ts` › visibility · `e2e/m10-home-search.spec.ts` › **P1, P2** | §4.11 |
| FR-1105 | Thai substring search ('ลูกค้า' finds 'ย้ายข้อมูลลูกค้า') via pg_trgm | M4 (pages part) · M10 | m04 §5.S1.8<br>m10 §5.S1.8, §5.S0.3 | M4: `src/server/services/search.int.test.ts` · `tests/authz/masking.int.test.ts` › search · `e2e/m4-pages.spec.ts` › E16<br>M10: `src/server/services/search.int.test.ts` › thai substring · `e2e/m10-home-search.spec.ts` › P1 · rows `tests/authz/rows/search.ts` › SR-* · `tests/authz/masking.int.test.ts` › K1–K3 · `e2e/m10-home-search.spec.ts` › **P1, P2** | §4.11 |
| FR-1201 | Audit every change of project, member, task, assignment, plan (per batch), milestone, page (per save, no content), leave, employee — **v3.1:** Audit also covers status … | M1 · M2 (part) · M3 · M4 (part) · M5 · M6 · M7 · M8 · M10 · M12 | m01 §5.S0.9<br>m02 §5.S1.4–S1.6<br>m03 §5.S2<br>m04 §5.S1.3–S1.7<br>m05 §5.S2.2–S2.4<br>m06 §5.S2.4, §5.S2.5<br>m07 §5.S2.6<br>m08 §5.S2.3<br>m10 — (no step)<br>m12 §5.S0.4, §5.S1.1 | M1: matrix audit assertion · `src/server/audit.int.test.ts` › T-AUD-01..02<br>M2: matrix audit assertion on every `mutates` allow row · per-service audit asserts<br>M3: authz (audit assertion) + int · `tests/authz/matrix.int.test.ts` (v3.1 row)<br>M4: matrix audit assertion · `src/server/services/pages.int.test.ts`<br>M5: authz audit assertion on every mutating `allow` · int (files per step: `src/server/services/holidays.int.test.ts`, `src/server/services/leave-types.int.test.ts`, `src/server/services/time-off.int.test.ts`) · matrix audit assertions<br>M6: authz audit assertion · int (files per step: `src/server/services/allocations.int.test.ts`, `src/server/services/plan-range.int.test.ts`)<br>M7: authz (audit assertion) · int (files per step: `src/server/services/allocations-day.int.test.ts`) · int `› audit` · authz audit assertions for every allow + mutates row (files per step: `src/server/services/allocations-day.int.test.ts`)<br>M8: authz audit assertion · int<br>M10: matrix: no new `mutates` rows · M3/M4/M5 rows unchanged<br>M12: `tests/authz/audit-coverage.int.test.ts` (AUD-00…AUD-10) + the M1 matrix audit assertion per row · `tests/authz/audit-coverage.int.test.ts` › AUD-00…AUD-08, AUD-10 + every mutating matrix row's audit assertion (M1 harness) + `scripts/lib/demo.int.test.ts` › DM-12 (seed audit trail) | §4.12, X44, M8-D25 |
| FR-1202 | MVP only records; no audit UI (Phase 2) | M12 | m12 (scope guard (§1.2)) | `tests/authz/audit-coverage.int.test.ts` › AUD-09 (`grep` no `audit_log` read outside `src/server/audit.ts` + tests) | §4.12 |
| FR-1301 | `taskView` block (list/board of the page's project), editable in place | M10 | m10 §5.S3.2–S3.4, §5.S1.9 | `TaskViewBlock.test.tsx` · `src/components/tasks/embed/EmbeddedTasks.test.tsx` · `src/server/services/embed.int.test.ts` · `e2e/m10-home-search.spec.ts` › B1 | §4.13 |
| FR-1302 | Block props = view config only; no task data in `content` | M10 | m10 §5.S0.4, §5.S3.3 | `src/lib/schemas/page-content.test.ts` › live blocks · `src/components/tasks/embed/EmbeddedTasks.test.tsx` › limit · `TaskViewBlock.test.tsx` › no task data in content | §4.13 |
| FR-1303 | `projectWorkload` block, masking as `/api/workload` | M10 | m10 §5.S1.10, §5.S3.5 | `src/server/services/embed.int.test.ts` › workload · `tests/authz/masking.int.test.ts` › K6–K8 · `ProjectWorkloadBlock.test.tsx` · `e2e/m10-home-search.spec.ts` › B3 | §4.13 |
| FR-1304 | Bound to the page's project; wiki → placeholder | M10 | m10 §5.S1.9, §5.S1.10, §5.S3.4 | `src/server/services/embed.int.test.ts` › binding · rows `tests/authz/rows/pages.ts` › EMB-*-WIKI` · `e2e/m10-home-search.spec.ts` › B2 | §4.13 |
| FR-1305 | Charter template section "งานและภาระของทีม" | M10 | m10 §5.S0.8 | `src/i18n/templates.test.ts` · `src/components/editor/templates.headless.test.ts` · `src/server/services/charters.int.test.ts` (M4, still green) | §4.13, M4-D30 |
| FR-1306 | Refetch on focus + invalidate after mutation | M10 | m10 §5.S0.5, §5.S3.3 | `src/lib/invalidate.test.ts` · `src/components/tasks/embed/EmbeddedTasks.test.tsx` › refetch · `e2e/m10-home-search.spec.ts` › B4 | §4.13 |
| FR-1307 | Blocks contribute nothing to `content_text` | M10 | m10 (M4 walker (M4-D30) — test only) | `src/lib/editor/content-text.test.ts` › live blocks · `e2e/m10-home-search.spec.ts` › B5 | §4.13, M4-D30 |
| FR-1401 | Database = one data source (title, typed columns, rows) with several views | M11 | m11 §5 S0.4, S3.1, S3.2 | ui `useDatabase.test.tsx` · e2e D4 | §4.14.1 |
| FR-1402 | Owned by exactly one page; no linked views in MVP | M11 | m11 §5 S0.2, S2.3 | authz DB-GET-WRONGPAGE · e2e D10 | §4.14.1, D15 |
| FR-1403 | Slash items table/kanban/calendar view with Thai titles + English aliases | M11 | m11 §5 S5.3 | ui `slash-menu.test.tsx › database group + ranking` · e2e D1 | §4.14.1 |
| FR-1404 | Insert creates a ready database (title + สถานะ + วันที่ columns, first view) | M11 | m11 §5 S2.4, S5.3, S3.2 | int `databases.int.test.ts › create` · ui `DatabaseHeader.test.tsx` · e2e D1 | §4.14.1, P5 |
| FR-1405 | Block header: editable title + view tabs (add/switch/rename/duplicate/delete/reorder) | M11 | m11 §5 S3.3 | ui `ViewTabs.test.tsx` · e2e D3, D7 | §4.14.1 |
| FR-1406 | Views are shared by everyone; read-only viewers cannot change view settings | M11 | m11 §5 S2.7, S3.3 | authz VIEW-UPDATE-WIKIPROT · e2e D3 | §4.14.1 |
| FR-1407 | Block is a non-text island; delete/undo of the block via editor; Cmd+Z inside = database undo | M11 | m11 §5 S5.2, S5.4 | ui `DatabaseBlock.test.tsx › isolation` · e2e D11 | §4.14.1, §7.5 |
| FR-1408 | Narrow screens: horizontal scroll inside block, calendar as day list, menu instead of drag | M11 | m11 §5 S3.5, S4.1, S4.2 | ui · e2e V1 | §4.14.1, §9 |
| FR-1410 | Column types TITLE, TEXT, NUMBER, SELECT, MULTI_SELECT, DATE, CHECKBOX, PERSON (1–20 active users), URL | M11 | m11 §5 S1.2–S1.5, S3.4 | unit `database.cells.test.ts` · ui `cells/*.test.tsx` · int · e2e D2 | §4.14.2, BR-90 |
| FR-1411 | Add column with type and default name | M11 | m11 §5 S1.6, S3.6 | unit `defaultColumnName` · ui `ColumnMenu.test.tsx` | §4.14.2 |
| FR-1412 | Column header menu (rename, type, config, sort, filter, hide, insert, duplicate, delete) | M11 | m11 §5 S3.6 | ui `ColumnMenu.test.tsx` · e2e D2, D6, D7 | §4.14.2 |
| FR-1413 | Column order per database; hidden/width/card props per view | M11 | m11 §5 S2.6, S3.2 | int · ui `TableView.test.tsx` · e2e D3 | §4.14.2 |
| FR-1414 | Change type converts all rows (BR-93), no dialog, undo restores everything | M11 | m11 §5 S1.7, S2.6, S3.6 | unit `database.convert.test.ts` · int `› changeType/revert` · e2e D6 | §4.14.2, BR-93 |
| FR-1415 | Delete column with undo; dependent sort/filter/group suspended | M11 | m11 §5 S2.6, S3.6, S4.1, S4.2 | int · ui · e2e D7 | §4.14.2 |
| FR-1416 | Delete select option with undo; values shown empty | M11 | m11 §5 S1.3, S3.6 | unit `readCell` · e2e D2 | §4.14.2, BR-95 |
| FR-1420 | Table view: rows × columns, title pinned, virtualized > 50 rows | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3 |
| FR-1421 | Inline cell editing per type; type-to-replace | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3 |
| FR-1422 | Table keyboard navigation | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3, §8.6 |
| FR-1423 | Add row (no required value); inherits "is" filter values | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3, P1 |
| FR-1424 | Select rows, delete with undo toast | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3, P2 |
| FR-1425 | Column width per view (80–600 px) | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3 |
| FR-1426 | Sort up to 3 keys; manual drag order only without sort | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3, BR-94 |
| FR-1427 | Filter up to 10 AND conditions | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3, BR-95 |
| FR-1428 | Hide columns per view | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3 |
| FR-1429 | Row count footer "N / N จาก M แถว"; no aggregates | M11 | m11 §5 S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `toolbar.test.tsx` (filter/sort menus) · unit `database.filter.test.ts` · e2e D1, D3, D7 | §4.14.3 |
| FR-1430 | Kanban group by SELECT / PERSON / CHECKBOX; auto-create สถานะ | M11 | m11 §5 S1.9, S4.1 | unit `database.group.test.ts` · ui `KanbanView.test.tsx` · e2e D4 | §4.14.4, BR-96 |
| FR-1431 | Groups with counts and "ไม่มีค่า"; hide empty groups | M11 | m11 §5 S1.9, S4.1 | unit `database.group.test.ts` · ui `KanbanView.test.tsx` · e2e D4 | §4.14.4, BR-96 |
| FR-1432 | Cards show chosen properties; view filter/sort apply | M11 | m11 §5 S1.9, S4.1 | unit `database.group.test.ts` · ui `KanbanView.test.tsx` · e2e D4 | §4.14.4 |
| FR-1433 | Drag between groups sets value; reorder within group; undo | M11 | m11 §5 S1.9, S4.1 | unit `database.group.test.ts` · ui `KanbanView.test.tsx` · e2e D4 | §4.14.4, BR-96 |
| FR-1434 | Quick add per group; add group = new option | M11 | m11 §5 S1.9, S4.1 | unit `database.group.test.ts` · ui `KanbanView.test.tsx` · e2e D4 | §4.14.4 |
| FR-1435 | Card click opens row detail | M11 | m11 §5 S1.9, S4.1 | unit `database.group.test.ts` · ui `KanbanView.test.tsx` · e2e D4 | §4.14.4 |
| FR-1440 | Calendar month grid by date column, Monday first, Thai month/พ.ศ., today marker | M11 | m11 §5 S1.10, S4.2 | unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` · e2e D5 | §4.14.5, BR-97 |
| FR-1441 | Cards per day, "+N เพิ่มเติม" | M11 | m11 §5 S1.10, S4.2 | unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` · e2e D5 | §4.14.5, BR-97 |
| FR-1442 | Drag card to another day = reschedule with undo | M11 | m11 §5 S1.10, S4.2 | unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` · e2e D5 | §4.14.5 |
| FR-1443 | Add row on a day | M11 | m11 §5 S1.10, S4.2 | unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` · e2e D5 | §4.14.5 |
| FR-1444 | Rows without date listed separately; drag in/out | M11 | m11 §5 S1.10, S4.2 | unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` · e2e D5 | §4.14.5 |
| FR-1445 | Calendar shows database data only (no leave/holidays/milestones) | M11 | m11 §5 S1.10, S4.2 | unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` · e2e D5 | §4.14.5, BR-98 |
| FR-1450 | Row detail side panel with all properties | M11 | m11 §5 S3.7 | ui `RowPanel.test.tsx` · e2e D14 | §4.14.6 |
| FR-1451 | Prev/next row in panel; Esc closes | M11 | m11 §5 S3.7 | ui `RowPanel.test.tsx` · e2e D14 | §4.14.6 |
| FR-1452 | Row deep link /p/[pageId]?db=&row= | M11 | m11 §5 S3.7 | ui `RowPanel.test.tsx` · e2e D14 | §4.14.6 |
| FR-1453 | Rows open as pages (kind DB_ROW, /r/[rowId]) with a document body, same mechanism as tasks (§4.6.4) | M11 | m11 §5 S0.2, S2.2, S2.9, S4.3, S5.6 | int `row-pages.int.test.ts` · authz RB-*, RP-* · e2e D14 | §4.14.6, §13 |
| FR-1460 | Permissions = owning page (view/edit/protected/archived); 404 when invisible | M11 | m11 §5 S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8 | §4.14.7, §3.2 PERM-24/25 |
| FR-1461 | Read-only viewers see data without edit controls | M11 | m11 §5 S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8 | §4.14.7 |
| FR-1462 | Database edits independent of the page edit lease | M11 | m11 §5 S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8 | §4.14.7, D16 |
| FR-1463 | Per-row/column/view/database version; conflict toast; refetch on focus | M11 | m11 §5 S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8 | §4.14.7, §7.9 |
| FR-1464 | Foreign/missing/forbidden databaseId → generic placeholder, 404 without data | M11 | m11 §5 S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8 | §4.14.7, §3.3 |
| FR-1465 | Undo for everything without confirm dialogs | M11 | m11 §5 S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8 | §4.14.7, §7.5, P2 |
| FR-1466 | Audit per action, no cell values | M11 | m11 §5 S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8 | §4.14.7, FR-1201 |
| FR-1470 | Page duplicate deep-copies databases | M11 | m11 §5 S2.10 | int `database-copy.int.test.ts › duplicatePage` · e2e D10 | §4.14.8, FR-508 |
| FR-1471 | Paste/copy block = deep copy (view source + edit target); cut-paste same page keeps id | M11 | m11 §5 S2.10, S5.5 | int `› copyDatabase` · authz DB-COPY-* · ui `paste-database.test.tsx` · e2e D10 | §4.14.8, D15, PERM-26 |
| FR-1472 | Removing the block detaches the database on save; editor undo re-attaches | M11 | m11 §5 S2.11 | int `pages.int.test.ts › detach reconcile` · e2e D11 | §4.14.8 |
| FR-1473 | Page delete/restore and project permanent delete | M11 | m11 §5 S2.12 | int · e2e D11 | §4.14.8, FR-509 |
| FR-1474 | Cmd+K database group: database titles + row titles; cells not indexed | M11 | m11 §5 S2.13, S4.4 | int `search.databases.int.test.ts` · authz SR-DB-* · mask · e2e D8 | §4.14.8, FR-1102, §6.4 |
| FR-1475 | Server-enforced limits (1,000 rows, 30 columns, 10 views, …) | M11 | m11 §5 S1.1, S2.* | unit · int `› limits` · authz *-LIMIT · e2e D12 | §4.14.8 |
| FR-1501 | Block equation via /สมการ (/equation, /math, /latex) | M11 | m11 §5 S0.9, S0.11, S5.7–S5.9 | unit `content-text.test.ts › latex` · ui `Equation*.test.tsx` · e2e E1–E4 | §4.15 |
| FR-1502 | Inline equation via slash or toolbar button on selection | M11 | m11 §5 S0.9, S0.11, S5.7–S5.9 | unit `content-text.test.ts › latex` · ui `Equation*.test.tsx` · e2e E1–E4 | §4.15 |
| FR-1503 | Equation editing popover with live preview | M11 | m11 §5 S0.9, S0.11, S5.7–S5.9 | unit `content-text.test.ts › latex` · ui `Equation*.test.tsx` · e2e E1–E4 | §4.15 |
| FR-1504 | Invalid LaTeX error state; source kept | M11 | m11 §5 S0.9, S0.11, S5.7–S5.9 | unit `content-text.test.ts › latex` · ui `Equation*.test.tsx` · e2e E1–E4 | §4.15 |
| FR-1505 | KaTeX bundled locally, safe options, MathML output | M11 | m11 §5 S0.9, S0.11, S5.7–S5.9 | unit `content-text.test.ts › latex` · ui `Equation*.test.tsx` · e2e E1–E4 | §4.15, NFR-09 |
| FR-1506 | Stored in pages.content; LaTeX source in content_text | M11 | m11 §5 S0.9, S0.11, S5.7–S5.9 | unit `content-text.test.ts › latex` · ui `Equation*.test.tsx` · e2e E1–E4 | §4.15, §6.4 |
| FR-1601 | Work screens use full width after the sidebar (1920/2560), no max-width | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.16, §8.12, D19 |
| FR-1602 | Documents (/p, /t, /r bodies) in a centred 760 px reading column by default + per-page "เต็มความกว้าง" toggle (pages.full_width, shared, undo, audit) | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.16, §8.12, D19 |
| FR-1603 | 48 px page header bar: breadcrumb left, page actions right | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.16, §8.12, D19 |
| FR-1604 | Light forms: borderless label·value rows, inline editing, few dialogs | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.16, §8.12, D19 |
| FR-1605 | All screens use the §8.12 typography/spacing/radius/colour scale | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.16, §8.12, D19 |
| FR-1606 | Phone (< 600 px) and tablet layouts per §9 Browser row | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §4.16, §8.12, D19 |

## 2. Business rules (BR)

SPEC §5 (incl. BR-20a, BR-20b, BR-21a). Every §5 rule is a pure function in `src/domain/**` with unit tests (coverage ≥ 95 %, UT-09).

| ID | Short description | Milestone | Plan step (mNN §5.Sx.y) | Test file › test name | Notes (X-id) |
|---|---|---|---|---|---|
| BR-01 | Internal unit = integer centi-days (100 = 1 person-day); never compute load with floats | M1 (subset) · M6 | m01 §5.S1.4, §5.S2.2<br>m06 §5.S0.2, §5.S2.1 | M1: `src/domain/units.test.ts` › U-UNIT-01..06<br>M6: int `allocations.int.test.ts` › numeric round trip | §5.1, X02 |
| BR-02 | DB numeric(4,2) person-days; convert to cd on read and back on write, only at the repo boundary | M1 (subset) · M6 | m01 §5.S1.4, §5.S2.2<br>m06 §5.S0.2, §5.S2.1 | M1: `src/domain/units.test.ts` › U-UNIT-01..06<br>M6: int `allocations.int.test.ts` › numeric round trip | §5.1, X02 |
| BR-03 | APIs always send load numbers as integer cd; UI converts only for display | M6 · M9 · M10 | m06 §5.S0.2, §5.S2.1<br>m09 §5.S2.2<br>m10 §5.S0.6 | M6: int `allocations.int.test.ts` › numeric round trip<br>M9: int `› integers` (JSON walker) (files per step: `src/server/services/workload.int.test.ts`) · int `workload › integers` (files per step: `src/server/services/workload.int.test.ts`)<br>M10: `src/server/services/home.int.test.ts` › integers · `src/server/services/embed.int.test.ts` › integers | §5.1 |
| BR-04 | Plan dates are 'YYYY-MM-DD' strings in code and DATE in DB — never JS Date | M1 · M3 · M5 (consumed) | m01 §5.S1.2–S1.3, §5.S2.1<br>m03 §5.S0.2, §5.S3.6<br>m05 (every step) | M1: `src/domain/dates.test.ts` › U-DATE-01..15 · `src/server/clock.int.test.ts` › T-CLOCK-01..02<br>M3: int `src/server/db/schema.int.test.ts` · ui `src/components/common/DateField.test.tsx`<br>M5: lint + the tests above | §5.1, X01, X50 |
| BR-05 | Weeks start Monday; weekStart(d) = the Monday ≤ d | M1 · M5 (consumed) | m01 §5.S1.2–S1.3, §5.S2.1<br>m05 (every step) | M1: `src/domain/dates.test.ts` › U-DATE-01..15 · `src/server/clock.int.test.ts` › T-CLOCK-01..02<br>M5: lint + the tests above | §5.1, X01 |
| BR-06 | 'Today' is computed in Asia/Bangkok on server and client | M1 · M5 (consumed) | m01 §5.S1.2–S1.3, §5.S2.1<br>m05 (every step) | M1: `src/domain/dates.test.ts` › U-DATE-01..15 · `src/server/clock.int.test.ts` › T-CLOCK-01..02<br>M5: lint + the tests above | §5.1, X01 |
| BR-10 | dayCapacity = schedule[weekday] → 0 on company holiday → minus time off → never negative | M5 | m05 §5.S1.1 | unit (every §5.2 row) (files per step: `src/domain/capacity.test.ts`) · unit `src/domain/capacity.test.ts` · int `capacity.int.test.ts` · golden F1–F4 | §5.2 |
| BR-11 | weekCapacity = sum of dayCapacity over the 7 days | M5 | m05 §5.S1.1 | unit + fast-check (files per step: `src/domain/capacity.test.ts`) · unit `src/domain/capacity.test.ts` · int `capacity.int.test.ts` · golden F1–F4 | §5.2 |
| BR-12 | Holiday on a leave day → no double deduction (day = 0) | M5 | m05 §5.S1.1 | unit row "วันหยุดวันศุกร์ + ลาวันศุกร์ = 400" · `e2e/m5-calendar.spec.ts` › E4 (leave on the imported holiday → "ไม่กระทบ capacity") · unit `src/domain/capacity.test.ts` · int `capacity.int.test.ts` · golden F1–F4 | §5.2 |
| BR-13 | Deactivated employee: capacity 0 from the deactivation date | M1 · M5 | m01 §5.S2.8<br>m05 §5.S1.1, §5.S2.5 | M1: `tests/integration/employees.int.test.ts` › T-EMP-04 asserts `'2026-09-30'` under `APP_NOW`<br>M5: unit · int `capacity.int.test.ts` › deactivated (files per step: `src/domain/capacity.test.ts`) · unit `src/domain/capacity.test.ts` · golden F1–F4 | §5.2, X64 |
| BR-20 | WEEK resolution: exactly one WEEK row; daily values are a display-only distribution (BR-21) | M6 (week level) · M7 | m06 §5.S2.2, §5.S3.4<br>m07 §5.S1.4, §5.S1.11, §5.S2.3, §5.S3.4 | M6: int · ui · `e2e/m6-grid.spec.ts` › G6 (files per step: `src/server/services/grid.int.test.ts`, `src/components/grid/GridCell.test.tsx`)<br>M7: unit · int `grid-day › derived` · ui `src/components/grid/GridCell.day.test.tsx` (files per step: `src/lib/grid/day.test.ts`) · int `grid-day › derived`, `› DAY week collapsed` · parity `src/server/services/grid-day-parity.int.test.ts` | §5.3, X27 |
| BR-20a | DAY resolution: ≥ 1 DAY rows; the week total = sum of the days | M6 (week level) · M7 | m06 §5.S2.2, §5.S3.4<br>m07 §5.S1.8, §5.S2.3 | M6: int · ui · `e2e/m6-grid.spec.ts` › G6 (files per step: `src/server/services/grid.int.test.ts`, `src/components/grid/GridCell.test.tsx`)<br>M7: unit property P3 · int (files per step: `src/domain/allocation.test.ts`, `src/domain/allocation.day.test.ts`, `src/server/services/plan-range.int.test.ts`, `src/server/services/grid-day.int.test.ts`) · int `grid-day › derived`, `› DAY week collapsed` · ui `src/components/grid/GridCell.day.test.tsx` · parity `src/server/services/grid-day-parity.int.test.ts` | §5.3, X27 |
| BR-20b | Never WEEK and DAY in the same week of the same assignment — enforced by DB trigger | M6 · M7 | m06 §5.S0.3, §5.S2.3–S2.5<br>m07 §5.S2.4 | M6: int `src/server/db/schema.int.test.ts` › allocations, `tests/integration/allocations-race.int.test.ts`<br>M7: int `tests/integration/allocations-race.int.test.ts` › M7 · int `allocations-day › AC-804` (DELETE first) | §5.3 |
| BR-21 | Distribute a WEEK value to days ∝ dayCapacity with largest remainder; exact sum; ties go to the earlier day | M6 · M7 (display) | m06 §5.S1.3<br>m07 §5.S1.4, §5.S1.11, §5.S2.3 | M6: unit `src/domain/allocation.test.ts` + property (files per step: `src/domain/allocation.test.ts`)<br>M7: unit · int contract test `grid-day › parity` · golden (files per step: `src/lib/grid/day.test.ts`, `src/server/services/plan-range.int.test.ts`, `src/server/services/grid-day.int.test.ts`) · unit `spreadWeek` table · int `grid-day › BR-21a` · parity test · golden derived table (files per step: `src/lib/grid/day.test.ts`, `src/server/services/plan-range.int.test.ts`, `src/server/services/grid-day.int.test.ts`) | §5.3 |
| BR-21a | weekCapacity = 0 → distribute by schedule only (ignore holidays/leave) and flag 'วางงานในวันที่ไม่ทำงาน' | M6 · M7 | m06 §5.S1.3<br>m07 §5.S1.4, §5.S1.11, §5.S2.3, §5.S3.4 | M6: unit `src/domain/allocation.test.ts` + property (files per step: `src/domain/allocation.test.ts`)<br>M7: unit · int `grid-day › BR-21a` (files per step: `src/lib/grid/day.test.ts`, `src/server/services/plan-range.int.test.ts`, `src/server/services/grid-day.int.test.ts`) · unit `spreadWeek` table · parity test · golden derived table (files per step: `src/lib/grid/day.test.ts`, `src/server/services/plan-range.int.test.ts`, `src/server/services/grid-day.int.test.ts`) | §5.3 |
| BR-22 | WEEK→DAY when a day is edited: distribute (BR-21), write DAY rows (skip 0), delete WEEK row, apply the edit — one transaction | M7 | m07 §5.S1.5, §5.S2.4, §5.S3.6 | unit · int · `e2e/m7-daily.spec.ts` › D1, D7 (files per step: `src/server/services/allocations-day.int.test.ts`, `src/lib/grid/day-input.test.ts`) · unit `materializeWithEdits` table · int `› AC-804`, `› spill F2/F3/F4`, `› equal value` · golden materialisation | §5.3 |
| BR-23 | DAY→WEEK ('กลับเป็นรายสัปดาห์'): sum DAY rows into one WEEK row and delete the DAY rows; total unchanged | M7 | m07 §5.S1.7, §5.S1.8, §5.S2.4, §5.S3.9 | unit · int `› BR-23` · `e2e/m7-daily.spec.ts` › D4 (files per step: `src/domain/allocation.test.ts`, `src/domain/allocation.day.test.ts`, `src/lib/grid/undo.day.test.ts`) · unit `collapseDays`, `collapse.test.ts` · int `› BR-23 via COLLAPSE` · authz `tests/authz/rows/allocations-day.ts` › AL-D-COLLAPSE | §5.3 |
| BR-24 | Editing the week total of a DAY week asks (dialog): scale proportionally (largest remainder) or convert to WEEK | M7 | m07 §5.S1.6, §5.S1.8, §5.S2.5, §5.S3.8 | unit · int `› NEEDS_CHOICE/SCALE/COLLAPSE` · authz · `e2e/m7-daily.spec.ts` › D2, D3 (files per step: `src/domain/allocation.test.ts`, `src/domain/allocation.day.test.ts`, `src/lib/grid/br24.test.ts`) · unit `scaleDays`, `planWeek` rows · unit `src/lib/grid/br24.test.ts` · ui `src/components/grid/Br24Dialog.test.tsx` · int `describe('BR-24')` · authz `tests/authz/rows/allocations-day.ts` › AL-D-NEEDS/SCALE/COLLAPSE | §5.3 |
| BR-25 | 'Plan N days in [start, end]': distribute daily ∝ dayCapacity (largest remainder); full weeks → WEEK rows, edge weeks → DAY rows; replaces the assignment's plan in … | M6 | m06 §5.S1.5, §5.S2.5 | unit · int · `e2e/m6-grid.spec.ts` › G9 (files per step: `src/domain/allocation.test.ts`, `src/server/services/plan-range.int.test.ts`) · unit `src/domain/allocation.test.ts` › planRange · int `src/server/services/plan-range.int.test.ts` · `e2e/m6-grid.spec.ts` › G9, G10 | §5.3, X65, G10 |
| BR-26 | Cell limits: WEEK 0 < v ≤ 700 cd, DAY 0 < v ≤ 100 cd; value 0 deletes the row | M6 · M7 (DAY part) | m06 §5.S0.5, §5.S1.1, §5.S1.4<br>m07 §5.S0.3, §5.S1.8, §5.S3.6 | M6: unit · int (files per step: `src/lib/schemas/allocations.test.ts`, `src/lib/schemas/grid.test.ts`, `src/domain/units.test.ts`, `src/domain/allocation.test.ts`)<br>M7: unit `src/lib/schemas/allocations.test.ts` · int · ui · unit `src/lib/schemas/allocations.test.ts` › M7 · unit `src/lib/grid/day-input.test.ts` · authz `tests/authz/rows/allocations-day.ts` › AL-D-MAX · `e2e/m7-daily.spec.ts` › D6 (1.5 rejected) | §5.3 |
| BR-27 | Typed values round to the nearest 0.25 person-day (25 cd) | M6 | m06 §5.S1.1 | unit (vectors + property) (files per step: `src/domain/units.test.ts`) | §5.3 |
| BR-30 | Tasks nest at most 3 levels (depth 0, 1, 2) | M3 | m03 §5.S0.2, §5.S2.2 | int · unit (files per step: `src/server/services/task-tree.int.test.ts`) | §5.4 |
| BR-31 | Assignees and plans live on leaf tasks only; parents show the sum; adding a child to an assigned task moves assignees + plans to it | M3 · M6 (plans clause) · M12 (seed) | m03 §5.S2.2, §5.S2.7<br>m06 §5.S2.9<br>m12 §5.S1.3 | M3: int `› BR-31` (files per step: `src/server/services/task-tree.int.test.ts`, `src/server/services/assignments.int.test.ts`)<br>M6: int `src/server/services/tasks.int.test.ts` › FR-610 plans<br>M12: `scripts/lib/demo.int.test.ts` › DM-04 | §5.4, X69 |
| BR-32 | Deleting a task soft-deletes it and all descendants with one deleted_batch; undo restores that batch only | M3 | m03 §5.S2.8 | int `› BR-32` (files per step: `src/server/services/tasks.int.test.ts`) | §5.4 |
| BR-33 | Moving tasks across projects is not allowed in MVP | M3 | m03 §5.S2.2 | int + authz row `tests/authz/rows/tasks.ts` › T-MOVE-X (files per step: `src/server/services/task-tree.int.test.ts`) | §5.4 |
| BR-35 | effectiveCertainty = task.override ?? parent.override ?? grandparent.override ?? project.certainty | M3 · M6 (grid) | m03 §5.S1.1<br>m06 §5.S2.2 | M3: unit `src/domain/certainty.test.ts` (table + property)<br>M6: int (files per step: `src/server/services/grid.int.test.ts`) | §5.5, X03 |
| BR-36 | UI shows the source: 'ตั้งที่งานนี้' / 'สืบทอดจาก '<parent>'' / 'ตามโปรเจค' | M3 · M6 (grid) | m03 §5.S1.1, §5.S3.6<br>m06 §5.S2.2 | M3: unit · ui `src/components/tasks/TaskPanel.test.tsx` · `e2e/m3-tasks.spec.ts` › E7 (files per step: `src/domain/certainty.test.ts`)<br>M6: int (files per step: `src/server/services/grid.int.test.ts`) | §5.5 |
| BR-37 | total = all plans; committed = plans whose effective certainty is CONFIRMED; atRisk = total − committed | M6 (§6.5) · M9 | m06 §5.S1.2, §5.S2.1<br>m09 §5.S2.1 | M6: unit · int `allocations.int.test.ts` › §6.5 parity (files per step: `src/domain/certainty.test.ts`, `src/server/repo/allocations-import-guard.test.ts`)<br>M9: int `› WAITING`, `› milestones no load`, `› BR-50` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) | §5.5, X03 |
| BR-40 | Per person per week (or per day in day zoom): committed > cap → OVER; total > cap ≥ committed → RISK; else OK | M7 (day level) · M9 (week level) · M10 (home + embed) | m07 §5.S1.10, §5.S3.10<br>m09 §5.S1.1, §5.S2.2, §5.S3.5<br>m10 §5.S1.2, §5.S3.5 | M7: unit `src/domain/overload.test.ts` · ui `src/components/grid/Footer.day.test.tsx` · golden · `e2e/m7-daily.spec.ts` › D7 · unit `src/lib/grid/day-footer.test.ts` · golden `day-level › day levels`<br>M9: unit · golden (files per step: `src/domain/overload.m9.test.ts`)<br>M10: `src/server/services/home.int.test.ts` · `ProjectWorkloadBlock.test.tsx` | §5.6, X06, X67 |
| BR-41 | Cause: standard = schedule capacity; lost = standard − cap; lost > 0 & total > standard → BOTH; lost > 0 → CAPACITY; else WORKLOAD | M9 | m09 §5.S1.1, §5.S4.3 | unit (r5 M9-03 + r8 §4.8 vectors) · golden (files per step: `src/domain/overload.m9.test.ts`) | §5.6, X64 |
| BR-42 | Leave only lowers capacity; the system never edits plans automatically | M5 · M7 (at day level) · M9 (surfacing) | m05 §5.S2.4<br>m07 §5.S1.11, §5.S2.3, §5.S3.4<br>m09 §5.S2.9 | M5: int `src/server/services/time-off.int.test.ts` › BR-42 never edits plans<br>M7: int `grid-day › leave later` · ui (files per step: `src/server/services/plan-range.int.test.ts`, `src/server/services/grid-day.int.test.ts`, `src/components/grid/GridCell.day.test.tsx`) · int `grid-day › leave later`, `src/server/services/time-off.int.test.ts` › BR-42 DAY case<br>M9: int (existing checksum + new overload lines) (files per step: `src/server/services/time-off.int.test.ts`) | §5.6 |
| BR-43 | Tasks without assignees never count toward anyone's overload | M9 | m09 §5.S2.1 | int `› BR-43` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) · int `repo/allocations › loadByUserProjectWeek`, `workload › WAITING / milestones no load` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) | §5.6 |
| BR-44 | Archived or deleted projects do not count toward load | M6 · M9 | m06 §5.S2.1<br>m09 §5.S2.1, §5.S2.5 | M6: int (files per step: `src/server/services/tasks.int.test.ts`, `src/server/repo/allocations.int.test.ts`)<br>M9: int `› BR-44` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`, `src/server/services/grid-person.int.test.ts`) · int `repo/allocations › loadByUserProjectWeek`, `workload › WAITING / milestones no load` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`, `src/server/services/grid-person.int.test.ts`) | §5.6 |
| BR-45 | Cell colour by load/cap: > 1 red · 0.8–1 green · > 0 & < 0.8 yellow · 0 empty · cap = 0 grey stripes (red if load > 0) | M7 (tones) · M9 (week level) · M10 (home + embed) | m07 §5.S1.10, §5.S3.10<br>m09 §5.S1.2, §5.S3.5, §5.S4.3<br>m10 §5.S1.2, §5.S3.5 | M7: unit · ui (files per step: `src/domain/overload.test.ts`, `src/lib/grid/day-footer.test.ts`, `src/components/grid/Footer.day.test.tsx`) · unit `src/domain/overload.test.ts` · unit `src/lib/grid/day-footer.test.ts` · ui `src/components/grid/Footer.day.test.tsx` · golden `day-level › day levels` · `e2e/m7-daily.spec.ts` › D7<br>M9: unit · ui · golden colour counts (r8 §4.6)<br>M10: `src/server/services/home.int.test.ts` · `ProjectWorkloadBlock.test.tsx` | §5.6, X06, X67 |
| BR-50 | completed_week = week of completed_on; plans in weeks after it do not count; that week and earlier count | M6 · M7 (at day level) · M9 | m06 §5.S1.6, §5.S2.2, §5.S3.4<br>m07 §5.S3.10<br>m09 §5.S2.1 | M6: unit `src/domain/completed.test.ts` · int (files per step: `src/server/services/grid.int.test.ts`)<br>M7: unit `src/lib/grid/day-footer.test.ts` · unit `src/lib/grid/day-footer.test.ts` › completed week<br>M9: int `› WAITING`, `› milestones no load`, `› BR-50` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) · int `repo/allocations › loadByUserProjectWeek`, `workload › WAITING / milestones no load` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) | §5.7 |
| BR-51 | Ticking done never deletes plans; un-ticking restores the load | M6 | m06 §5.S1.6, §5.S2.2, §5.S3.4 | unit `src/domain/completed.test.ts` · int (files per step: `src/server/services/grid.int.test.ts`) | §5.7 |
| BR-52 | Ticking done with future plans → toast 'ปลดภาระ X วัน ในอีก N สัปดาห์ · เลิกทำ' | M6 | m06 §5.S2.7, §5.S4.2 | int `src/server/services/task-status.int.test.ts` › BR-52 · ui `statusToast.test.ts` · `e2e/m6-grid.spec.ts` › G12 · ui per path (S4.2) | §5.7, X19, X71, G12 |
| BR-60 | Assigning a non-member (by LEAD/manager) auto-adds them as MEMBER in the same transaction | M2 (context) · M3 | m02 §5.S1.7<br>m03 §5.S2.7 | M2: `tests/authz/golden-visibility.int.test.ts` · `scripts/lib/fixtures.int.test.ts` › M2<br>M3: int · authz PERM-14 (files per step: `src/server/services/assignments.int.test.ts`) | §5.8, X11 |
| BR-61 | Removing a member first requires cancelling their assignments in that project (FR-404) | M2 (part) · M3 (count) | m02 §5.S1.6<br>m03 §5.S2.9, §5.S3.10 | M2: `src/server/services/members.int.test.ts` (`blockedByAssignments === 0`)<br>M3: int `src/server/services/members.int.test.ts` › FR-404 · authz PERM-08 rows · `e2e/m3-tasks.spec.ts` › E11 | §5.8, X16 |
| BR-62 | A project always has ≥ 1 LEAD (manager-administered projects: warning, not block) | M2 | m02 §5.S1.6 | `src/server/services/members.int.test.ts` › BR-62 (incl. race) · row `tests/authz/rows/members.ts` › PERM-08e/f` · `e2e/m2-projects.spec.ts` › E4 · `src/server/services/members.int.test.ts` › BR-62 + race · rows `tests/authz/rows/members.ts` › PERM-08e/f | §5.8, X61 |
| BR-70 | Status: completed_on → DONE; date < today → OVERDUE; date − today ≤ 7 → DUE_SOON; else UPCOMING | M8 | m08 §5.S1.2, §5.S2.2 | unit `src/domain/milestone.test.ts` · golden (r8 §4.9 table) | §5.9 |
| BR-71 | 'เลย milestone' if a linked open task has a WEEK plan with week_start > date, a DAY plan with period_start > date, or due_date > date | M8 | m08 §5.S1.3, §5.S2.1, §5.S2.5–S2.8, §5.S3.7, §5.S4.4–S4.7 | unit · int `repo/milestones.int.test.ts` › lateFacts, `milestones.int.test.ts` › AC-702 · golden · `e2e/m8-milestones.spec.ts` › M2 (files per step: `src/server/repo/milestone-join-guard.test.ts`) | §5.9 |
| BR-72 | Milestones carry no load and never affect capacity/overload | M8 · M9 | m08 §5.S2.5<br>m09 §5.S2.1 | M8: golden `BR-72` · int `src/server/services/grid.int.test.ts` › BR-72 · golden `milestones.int.test.ts` › BR-72<br>M9: int `› WAITING`, `› milestones no load`, `› BR-50` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) · int `repo/allocations › loadByUserProjectWeek`, `workload › WAITING / milestones no load` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) | §5.9 |
| BR-80 | `DONE` ⇔ completed; set/clear/keep `completed_on` | M3 · M12 (§7.1 tests) | m03 §5.S1.5, §5.S2.6, §5.S2.14 | M3: unit `src/domain/status.test.ts` · int (+ invariant query, R22)<br>M12: `scripts/lib/demo.int.test.ts` › DM-06 · DM-07 | §5.10, M3-D43 |
| BR-81 | Default status = lowest-position `TODO` | M3 | m03 §5.S1.5 | unit (files per step: `src/domain/status.test.ts`) | §5.10 |
| BR-82 | Checkbox → lowest-position `DONE`; uncheck → BR-81 | M3 | m03 §5.S1.5 | unit (files per step: `src/domain/status.test.ts`) | §5.10 |
| BR-83 | Status belongs to the task's project (composite FK) | M3 | m03 §5.S0.2 | int `src/server/db/schema.int.test.ts` (23503) | §5.10 |
| BR-84 | Set invariant `TODO` ≥ 1, `DONE` ≥ 1 | M3 | m03 §5.S1.5, §5.S2.14 | unit · int (files per step: `src/domain/status.test.ts`, `src/server/services/task-statuses.int.test.ts`) | §5.10 |
| BR-85 | Blocker validity + `wouldCreateCycle` with path | M3 | m03 §5.S1.6, §5.S2.15 | unit + property · int (files per step: `src/domain/blockers.test.ts`, `src/domain/certainty.test.ts`, `src/domain/status.test.ts`, `src/server/services/task-blockers.int.test.ts`) | §5.10 |
| BR-86 | Badge states open/done/none | M3 · M12 (§7.1 tests) | m03 §5.S1.6, §5.S2.10, §5.S2.16 | M3: unit · int (files per step: `src/domain/blockers.test.ts`, `src/domain/certainty.test.ts`, `src/domain/status.test.ts`, `src/server/services/my-tasks.int.test.ts` …)<br>M12: `scripts/lib/demo.int.test.ts` › DM-06 · DM-07 | §5.10, X73 |
| BR-87 | Status/blockers never change plan, capacity, overload | M3 · M6 (load part) · M9 · M12 (§7.1 tests) | m03 §5.S2.6, §5.S2.15<br>m06 §5.S2.2<br>m09 §5.S2.1 | M3: int (files per step: `src/server/services/task-status.int.test.ts`, `src/server/services/task-statuses.int.test.ts`, `src/server/services/tasks.int.test.ts`, `src/server/services/task-blockers.int.test.ts`)<br>M6: int `src/server/services/grid.int.test.ts` › WAITING counts<br>M9: int `› WAITING`, `› milestones no load`, `› BR-50` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`) · int `repo/allocations › loadByUserProjectWeek`, `workload › WAITING / milestones no load` (files per step: `src/server/repo/allocations.int.test.ts`, `src/server/services/masking.int.test.ts`)<br>M12: `scripts/lib/demo.int.test.ts` › DM-06 · DM-07 | §5.10 |
| BR-90 | Cell value shapes per column type; validated against current type | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-91 | Numbers as canonical decimal strings, no float | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-92 | Cell dates are ISODate; input formats incl. พ.ศ. | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-93 | Column type conversion rules | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-94 | Sort: empties last, collator, stable by position/id | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-95 | Filters: AND, per-type operators, empty semantics | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-96 | Kanban grouping order and drop effect (multi-person: card in every person group; A→B replaces A) | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-97 | Calendar month range and placement | M11 | m11 §5 S1 | unit `src/domain/database*.test.ts` | §5.11 |
| BR-98 | Databases never touch planning, membership or automation | M11 | m11 §5 S0.2, S2.14, S6.4 | int `tests/golden/database-isolation.int.test.ts` · int `tests/integration/br98-imports.int.test.ts` | §5.11 |
| BR-100 | Summed cell = task row totals (view, BR-50); day columns = Σ per-person days | M7.1 | m07.1 §5.S1.2 | unit `src/lib/grid/rows.test.ts` (+ fast-check Σ days = week) | §5.12 |
| BR-101 | Summed cell editable ⇔ leaf with exactly one active assignee; never distribute | M7.1 | m07.1 §5.S1.2, §5.S3.3 | unit `rows.test.ts` · ui `SumModeHint.test.tsx` · `e2e/m7.1-grid.spec.ts` › P1 | §5.12, D23 |
| BR-102 | Marker edge = right edge of the displayed column containing the date (week / day / last shown day); never "รวม" | M7.1 | m07.1 §5.S1.7 | unit `src/lib/grid/markers.test.ts` | §5.12, D24 |
| BR-103 | Calendar bar span (start ?? due … due ?? start), week-row segments, greedy lanes, +N | M7.1 | m07.1 §5.S1.6 | unit `src/lib/plan-calendar/bars.test.ts` (+ fast-check) | §5.12 |
| BR-104 | Chart series = counted project load (+ otherProjects) vs capacity; BR-40 level; DAYS/FRACTION; Σ = footer | M7.1 | m07.1 §5.S1.4 | unit `load-series.test.ts` · golden `tests/golden/plan-chart.int.test.ts` | §5.12, X29 |
| BR-105 | Grid order = task tree DFS by position; grid moves call M3 moveTask (depth, BR-31 transfer, same project) | M7.1 | m07.1 §5.S1.3, §5.S3.6 | unit `row-drop.test.ts` · int `tasks.int.test.ts › move` (M3) · `e2e/m7.1-grid.spec.ts` › P3 | §5.12, FR-603/604 |

## 3. Acceptance criteria (AC)

SPEC §4 `- AC-…` bullets. M5 has no SPEC AC ids (§4.9); its §12 e2e bullets are labelled AC-M5-a…d inside `plan/m05-calendar-capacity.md` §7.1 (not SPEC ids). M12 owns no AC (its acceptance is §12 "Done when", FR-1201/1202 and the NFR rows).

| ID | Short description | Milestone | Plan step (mNN §5.Sx.y) | Test file › test name | Notes (X-id) |
|---|---|---|---|---|---|
| AC-101 | Visiting / without login → redirect to /login | M1 | m01 §5.S2.4 | `tests/integration/proxy.int.test.ts` › T-SESS-01 · `e2e/m1-auth.spec.ts` › E2E-01 | §4.1 |
| AC-102 | POST to the sign-up endpoint is rejected | M1 | m01 §5.S0.8, §5.S2.3 | `tests/integration/auth.int.test.ts` › T-AUTH-01 · `e2e/m1-auth.spec.ts` › E2E-02 · matrix `tests/authz/rows/auth-endpoints.ts` › BA-01 | §4.1 |
| AC-103 | New worker's first login → /account/password; cannot open other pages until changed | M1 | m01 §5.S2.4, §5.S0.7, §5.S3.3 | `tests/integration/proxy.int.test.ts` › T-SESS-03, `src/server/action.int.test.ts` + `src/server/route.int.test.ts` › T-GATE-02, T-GATE-04 · `e2e/m1-auth.spec.ts` › E2E-03 · proxy › `tests/integration/proxy.int.test.ts` › T-SESS-03 · `tests/integration/gate.int.test.ts` › T-GATE-10, T-GATE-11 · `src/server/action.int.test.ts` › T-GATE-02 · route › T-GATE-04 · matrix "mustChangePassword → 403" loop | §4.1 |
| AC-104 | Deactivated employee cannot log in and existing sessions drop immediately | M1 | m01 §5.S2.8 | `tests/integration/employees.int.test.ts` › T-EMP-04 · `e2e/m1-auth.spec.ts` › E2E-04 | §4.1 |
| AC-201 | Manager creates worker with random password → copies it → worker logs in with it | M1 | m01 §5.S2.8, §5.S3.8 | `tests/integration/employees.int.test.ts` › T-EMP-01 · `e2e/m1-auth.spec.ts` › E2E-05 · employees › `tests/integration/employees.int.test.ts` › T-EMP-01 | §4.2 |
| AC-202 | Re-opening the create-employee page does not show the random password again | M1 | m01 §5.S3.8, §5.S2.8 | `tests/integration/employees.int.test.ts` › T-EMP-02 · `e2e/m1-auth.spec.ts` › E2E-06 · employees › `tests/integration/employees.int.test.ts` › T-EMP-02 · `EmployeeFormDialog.test.tsx` › U-FORM-03 | §4.2 |
| AC-203 | Deactivate Cindy → Cindy not in assignment picker, but Cindy's old plans still in grid with 'ปิดใช้งาน' label | M1 · M2 (clause) · M3 · M6 (grid clause) | m01 §5.S2.11, §5.S3.7<br>m02 §5.S1.3, §5.S2.5<br>m03 §5.S2.7, §5.S3.7<br>m06 §5.S2.2, §5.S3.3 | M1: `tests/integration/employees.int.test.ts` › T-EMP-06 · `e2e/m1-auth.spec.ts` › E2E-04 · employees › `tests/integration/employees.int.test.ts` › T-EMP-06 (assignable query) · T-EMP-04 (login blocked, sessions revoked) · `e2e/m1-auth.spec.ts` › E2E-04 ("ปิดใช้งาน" chip) — picker clauses: `e2e/m2-projects.spec.ts`, `e2e/m3-tasks.spec.ts` · grid clause: `e2e/m6-grid.spec.ts` (PROGRESS › Known issues until M6)<br>M2: `src/server/services/people.int.test.ts` · `PersonPicker.test.tsx` · `e2e/m2-projects.spec.ts` › E4<br>M3: int `› deactivated` · `e2e/m3-tasks.spec.ts` › E4b · int `src/server/services/assignments.int.test.ts` › deactivated<br>M6: int · `e2e/m6-grid.spec.ts` › G11 (files per step: `src/server/services/grid.int.test.ts`) · int `src/server/services/grid.int.test.ts` › AC-203 | §4.2, X12, G11 |
| AC-501 | Create page → /ตาราง → 3×3 table → add a column → reload keeps it | M4 | m04 §5.S2.5, §5.S2.4 | `e2e/m4-pages.spec.ts` › E2 · ui `src/components/editor/slash-menu.test.ts` › table item 3×3 · ui `src/components/editor/templates.headless.test.ts` (table round-trip) | §4.5.3 |
| AC-502 | Copy 4×3 cells from Excel → paste → 4×3 table block with matching data | M4 | m04 §5.S2.2 | `paste.test.ts` · `e2e/m4-pages.spec.ts` › E3 · ui `paste.test.ts` (6 routes) · unit `src/lib/editor/tsv.test.ts` | §4.5.3, M4-D33 |
| AC-503 | PrintScreen then paste → image shows and survives reload; non-member worker opening the image URL → 404 | M4 | m04 §5.S2.2, §5.S1.7 | `e2e/m4-pages.spec.ts` › E4 · `src/server/services/files.int.test.ts` › download · row `tests/authz/rows/files.ts` › FL-DOWNLOAD-P · `e2e/m4-pages.spec.ts` › E4 (real `ClipboardItem` + `ControlOrMeta+V`, and `page.evaluate` + `DataTransfer`, M4-D34 · reload · Peter → 404) · int `src/server/services/files.int.test.ts` › download · authz `tests/authz/rows/files.ts` › FL-DOWNLOAD-P · `tests/authz/masking.int.test.ts` › K8 | §4.5.3, M4-D34 |
| AC-504 | Type /หน้า in the charter → sub-page appears under the charter in the sidebar and a link card in content | M4 | m04 §5.S2.5, §5.S1.3, §5.S3.3 | `e2e/m4-pages.spec.ts` › E5 · ui `src/components/editor/slash-menu.test.ts` › หน้า item · int `src/server/services/pages.int.test.ts` › create · ui `src/components/pages/PageTree.test.tsx` | §4.5.3 |
| AC-505 | Cindy edits a page; Ivy opens it → Ivy sees 'Cindy กำลังแก้' and cannot edit | M4 | m04 §5.S1.6, §5.S2.7 | `e2e/m4-pages.spec.ts` › E6 · int `src/server/services/page-lease.int.test.ts` · ui `useEditLease.test.tsx` | §4.5.3 |
| AC-601 | Typing 3 task names with Enter, no mouse → 3 tasks | M3 | m03 §5.S3.3 | `e2e/m3-tasks.spec.ts` › E1 · ui `src/components/tasks/QuickAdd.test.tsx` · int `src/server/services/tasks.int.test.ts` › createTask append order | §4.6 |
| AC-602 | Select row 2 + Tab → child of row 1; indenting beyond level 3 does nothing | M3 | m03 §5.S1.3, §5.S2.5, §5.S3.4 | unit + int + `e2e/m3-tasks.spec.ts` › E2 (files per step: `src/lib/tree/ops.test.ts`, `src/server/services/tasks.int.test.ts`) · unit `src/lib/tree/ops.test.ts` › AC-602 · int `src/server/services/tasks.int.test.ts` › tree › AC-602 | §4.6 |
| AC-603 | Delete a parent with 3 children → all 4 gone → undo → all back with their original plans | M3 · M6 (plans clause) | m03 §5.S2.8, §5.S3.8<br>m06 §5.S2.9 | M3: int `› AC-603` · `e2e/m3-tasks.spec.ts` › E3 · int `src/server/services/tasks.int.test.ts` › delete/restore › AC-603<br>M6: int `src/server/services/tasks.int.test.ts` › AC-603 (extended) · `e2e/m6-grid.spec.ts` › G9 | §4.6, X13 |
| AC-604 | Task with Jack + Mint → plan Jack 3 days, Mint 2 days → each person page shows their own load correctly | M6 · M9 (verification) | m06 §5.S2.5, §5.S4.3<br>m09 §5.S2.5, §5.S6.2 | M6: int `src/server/services/plan-range.int.test.ts` › AC-604 · `e2e/m6-grid.spec.ts` › G10<br>M9: int `src/server/services/grid-person.int.test.ts` › AC-604 · `e2e/m9-workload.spec.ts` › W7 | §4.6, X14, G10 |
| AC-611 | Defaults + quick add → "ยังไม่เริ่ม" | M3 | m03 §5.S2.14, §5.S2.3 | `e2e/m3-tasks.spec.ts` › E15 · int `src/server/services/task-statuses.int.test.ts` › defaults · int `src/server/services/tasks.int.test.ts` › createTask | §4.6.3 |
| AC-612 | LEAD adds "รอลูกค้ายืนยัน" before "เสร็จ"; MEMBER refused | M3 | m03 §5.S2.14, §5.S3.18 | `e2e/m3-tasks.spec.ts` › E16 · authz `tests/authz/rows/task-statuses.ts` › S-* rows (Me → 403) · int `src/server/services/task-statuses.int.test.ts` › AC-612 | §4.6.3 |
| AC-613 | Drag to "เสร็จ" sets `completed_on`; undo clears it | M3 | m03 §5.S2.6, §5.S3.16 | `e2e/m3-tasks.spec.ts` › E17 · int `src/server/services/task-status.int.test.ts` › BR-80 | §4.6.3 |
| AC-614 | Delete used status with move; undo restores | M3 | m03 §5.S2.14, §5.S3.18 | `e2e/m3-tasks.spec.ts` › E18 · int `› delete/restore` · int `src/server/services/task-statuses.int.test.ts` › AC-614 | §4.6.3 |
| AC-615 | Blocker badge, cycle refused, ✓ after done, status unchanged | M3 | m03 §5.S1.6, §5.S2.15, §5.S3.17 | `e2e/m3-tasks.spec.ts` › E19 · int · unit (files per step: `src/domain/blockers.test.ts`, `src/domain/certainty.test.ts`, `src/domain/status.test.ts`, `src/server/services/task-blockers.int.test.ts`) · int `src/server/services/task-blockers.int.test.ts` › AC-615 · unit `src/domain/blockers.test.ts` | §4.6.3 |
| AC-616 | Non-member of POS (Peter) sees no POS data in `/tasks` | M3 | m03 §5.S2.16, §5.S3.19 | `e2e/m3-tasks.spec.ts` › E20 (Peter, M3-D34) · `tests/authz/masking.int.test.ts` (m03 §5.S4.3) (world `outsider`) · int `src/server/services/team-tasks.int.test.ts` | §4.6.3, M3-D34 |
| AC-621 | Write rich body in panel, open as page, same content after reload | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-622 | Edit all properties on the task page; list/board/grid agree | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-623 | Open semantics: click/↗/Cmd-click/Shift+Space/Esc/Back | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-624 | Non-member 404 on page, body, lease, files; body search scoped | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-625 | Lease on body only; properties editable by others | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-626 | Delete parent with bodies + undo restores all | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-627 | notes migrated to paragraphs; column dropped; quick add creates no page | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-628 | TASK pages hidden from trees/search; no /หน้า; 📄 marker | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · `e2e/m6.1-task-page.spec.ts` | §4.6.4 |
| AC-701 | Milestone on 23 Oct → ◆ in the week-of-19-Oct column → in day zoom ◆ sits on Friday 23 | M8 | m08 §5.S3.3, §5.S3.4 | `e2e/m8-milestones.spec.ts` › M1 · unit `lib/grid/milestones.test.ts` › milestoneColumnKey · ui `src/components/grid/MilestoneRow.test.tsx` | §4.7 |
| AC-702 | Linking a task planned in the week of 26 Oct → 'เลย milestone' on the task and on ◆ | M8 | m08 §5.S2.1, §5.S3.7, §5.S4.4, §5.S4.5 | `e2e/m8-milestones.spec.ts` › M2 · int `› AC-702` · int `milestones.int.test.ts` › AC-702 · unit `src/domain/milestone.test.ts` › BR-71 · golden bindings | §4.7 |
| AC-801 | Select Cindy's 6 week cells → type 3 → Enter → all six = 3.0 days | M6 · M7 (§7.1 tests) | m06 §5.S3.10 | M6: `e2e/m6-grid.spec.ts` › G2 · unit `apply.test.ts` › range fill · int `allocations.int.test.ts` › AC-801 batch<br>M7: unit `src/lib/grid/kinds.test.ts`, `src/lib/grid/day-input.test.ts` · e2e m6-grid unchanged (S5.3) · `e2e/m7-daily.spec.ts` › D6 (paste on day cells) | §4.8 |
| AC-802 | Press f on a week where Peter has 2 days of leave → 3.0, not 5.0 | M6 · M7 (§7.1 tests) | m06 §5.S1.1, §5.S3.10 | M6: unit · `e2e/m6-grid.spec.ts` › G3 (files per step: `src/domain/units.test.ts`) · unit `src/domain/units.test.ts` › f/h, `apply.test.ts` › f per cell<br>M7: unit `src/lib/grid/kinds.test.ts`, `src/lib/grid/day-input.test.ts` · e2e m6-grid unchanged (S5.3) · `e2e/m7-daily.spec.ts` › D6 (paste on day cells) | §4.8 |
| AC-803 | Copy 2×4 cells from Excel (0.5, 1 … in fraction mode) → paste → values match the chosen unit | M6 · M7 (§7.1 tests) | m06 §5.S3.11 | M6: unit `paste.test.ts` · `e2e/m6-grid.spec.ts` › G4 · unit `paste.test.ts`, `src/lib/editor/tsv.test.ts`, `src/domain/units.test.ts` › fraction<br>M7: unit `src/lib/grid/kinds.test.ts`, `src/lib/grid/day-input.test.ts` · e2e m6-grid unchanged (S5.3) · `e2e/m7-daily.spec.ts` › D6 (paste on day cells) | §4.8 |
| AC-804 | Expand Ivy's 2.5-day WEEK week → 0.5/day dashed → edit Wednesday to 1.0 → week = 3.0 and the other days become real values | M7 | m07 §5.S1.5, §5.S2.4, §5.S3.4–S3.6 | unit `src/domain/allocation.day.test.ts` › AC-804 · int `src/server/services/allocations-day.int.test.ts` › AC-804 · `e2e/m7-daily.spec.ts` › D1 · unit `src/domain/allocation.day.test.ts` › materializeWithEdits › AC-804, `planWeek` row 3 · int `src/server/services/grid-day.int.test.ts` › derived · golden `day-level › F1 Ivy` | §4.8 |
| AC-805 | Edit several cells → Cmd+Z three times → values revert in order → reload shows the undone values | M6 · M7 (§7.5, continuity) | m06 §5.S3.14<br>m07 §5.S3.9 | M6: unit `snapshots.test.ts` · `e2e/m6-grid.spec.ts` › G5 · unit `undo.test.ts` · int `allocations.int.test.ts` › X27 snapshot replay<br>M7: unit `src/lib/grid/undo.day.test.ts` · `e2e/m7-daily.spec.ts` › D2, D4 · int `› BR-23 via COLLAPSE` (7-day replay) · `e2e/m7-daily.spec.ts` › D2 (undo after SCALE, no dialog), D3 (one undo for two weeks), D4 (undo/redo + reload) | §4.8, X27 |
| AC-806 | Calendar: Rollout สาขา 3–12 Nov bar split over 2 weeks with Mint ◐; no-date list; click = panel; view remembered | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P7 | §4.8.1 |
| AC-807 | Chart: Cindy/Ivy/Mint values match grid; includeOthers syncs with footer; table; no other-project names for Mint | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P8 | §4.8.1 |
| AC-808 | Resize งาน to 420 px persists per user across projects; keyboard ±; double-click reset | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P2 | §4.8.1 |
| AC-809 | Drag/Alt+↑ reorder persists in grid + task tab; Cmd+Z; Alt+→ indent with BR-31 transfer; archived: no handle | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P3 | §4.8.1 |
| AC-810 | Split columns; hidden mode one row per task, 3.5 sum with 👥 2 read-only + hint; single-assignee edit saves | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P1 | §4.8.1 |
| AC-811 | Month row ก.ย./ต.ค./พ.ย. spans + boundary lines; expanded week splits at 1 ต.ค. | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P4 | §4.8.1 |
| AC-812 | Red marker at 19/10 edge; Ivy edits to green; day zoom Fri 23; calendar flag; delete + undo; W 404, archived 403 | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P5, P6 | §4.8.1 |
| AC-813 | Viewports 390/768/1280/1920/2560 usable; phone calendar agenda; no horizontal page scroll | M7.1 | m07.1 §7.1 | `e2e/m7.1-grid.spec.ts` › P9 | §4.8.1 |
| AC-1301 | `/มุมมองงาน` in POS charter; drag updates the tasks tab | M10 | m10 §5.S3.4, §5.S3.6 | `e2e/m10-home-search.spec.ts` › B1 · `src/components/editor/slash-menu.test.ts` › มุมมองงาน · `src/components/tasks/embed/EmbeddedTasks.test.tsx` › onMove | §4.13 |
| AC-1302 | Copied block follows the destination page's project; wiki placeholder | M10 | m10 §5.S3.4, §5.S1.9 | `e2e/m10-home-search.spec.ts` › B2 · `src/server/services/embed.int.test.ts` › binding · `src/server/services/embed.int.test.ts` › tasks binding · rows `tests/authz/rows/pages.ts` › EMB-T-WIKI | §4.13 |
| AC-1303 | Worker sees "งานในโปรเจคอื่น" with no other project name | M10 | m10 §5.S1.10 | `tests/authz/masking.int.test.ts` › K6–K8 · `e2e/m10-home-search.spec.ts` › B3 · `tests/authz/masking.int.test.ts` › **K6/K8** + golden Ivy variant · `src/server/services/embed.int.test.ts` › workload | §4.13 |
| AC-1401 | Insert table view, add rows by keyboard, page JSON holds only databaseId | M11 | m11 §7.1 | e2e D1 · ui `useTableKeyboard.test.tsx`, `DatabaseHeader.test.tsx` · int `databases.int.test.ts › create` · e2e DB assertion (page JSON has only `databaseId`) | §4.14 |
| AC-1402 | Every column type round-trips (exact number, ISO date, active people, URL guard) | M11 | m11 §7.1 | e2e D2 · unit `database.number/cells/date.test.ts` · ui `cells/*.test.tsx` · int `› rows validation` · authz ROW-UPDATE-BAD*, ROW-UPDATE-URL-JS | §4.14 |
| AC-1403 | Sort + AND filters + hidden column + width persist and are shared | M11 | m11 §7.1 | e2e D3 · unit `database.sort/filter.test.ts` (`valuesFromFilters`) · ui `TableView.test.tsx › footer + inherit` | §4.14 |
| AC-1404 | Kanban drag between groups, undo, regroup by person (multi-person rows in each group, A→B replace) | M11 | m11 §7.1 | e2e D4 · unit `database.group.test.ts` · ui `KanbanView.test.tsx` | §4.14 |
| AC-1405 | Calendar Monday-first พ.ศ., drag reschedule, add on day, no-date list | M11 | m11 §7.1 | e2e D5 · unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` | §4.14 |
| AC-1406 | Type change text→number→undo restores; text→select | M11 | m11 §7.1 | e2e D6 · unit `database.convert.test.ts` · int `› changeType/revert` · authz COL-TYPE-TITLE | §4.14 |
| AC-1407 | Delete rows/column/view with undo; last view protected | M11 | m11 §7.1 | e2e D7 · int `› deletes/restores` · ui `useDbMutations.test.tsx › toasts` · authz VIEW-DELETE-LAST | §4.14 |
| AC-1408 | Non-member 404 + no leak; search scoped; locked wiki; archived project | M11 | m11 §7.1 | e2e D8 · authz (whole files) · mask · int `search.databases.int.test.ts` | §4.14, §3.3 |
| AC-1409 | Edits while another user holds the lease; version conflict | M11 | m11 §7.1 | int `database-race.int.test.ts` · authz ROW-UPDATE-LEASED | §4.14, D16 |
| AC-1410 | Duplicate page / copy block = independent copy; forged id = placeholder | M11 | m11 §7.1 | e2e D10 · int `database-copy.int.test.ts` · authz DB-COPY-*, DB-GET-WRONGPAGE · ui `paste-database.test.tsx` | §4.14, D15 |
| AC-1411 | Block delete + undo; detached not searchable; page delete + undo | M11 | m11 §7.1 | e2e D11 · int `pages.int.test.ts › detach reconcile`, `› page delete/restore` | §4.14 |
| AC-1412 | 1,000-row limit; perf budget | M11 | m11 §7.1 | e2e D12, P1 · int `› limits` · perf `databases.perf.int.test.ts`, `database.perf.test.ts` | §4.14, §9 |
| AC-1413 | Cell values do not change planning (golden F1 unchanged) | M11 | m11 §7.1 | golden `database-isolation.int.test.ts` · int `br98-imports.int.test.ts` | §4.14, BR-98 |
| AC-1414 | Row opens as page /r/[rowId] with body; no sub-page/database blocks; 404 for non-members; duplicate/delete carry the body | M11 | m11 §7.1 | e2e D14 · int `row-pages.int.test.ts` · authz RB-*, RP-* · ui `RowPageScreen.test.tsx`, `RowBody.test.tsx`, `slash-menu.test.tsx › DB_ROW` | §4.14, FR-1453 |
| AC-1501 | Block equation renders, persists, no external requests | M11 | m11 §7.1 | e2e E1 · ui `EquationView.test.tsx`, `EquationPopover.test.tsx` · unit `katex.test.ts` | §4.15 |
| AC-1502 | Inline equation from selection / slash | M11 | m11 §7.1 | e2e E2 · ui `formatting-toolbar.test.tsx`, `inline-equation.test.tsx` | §4.15 |
| AC-1503 | Invalid LaTeX error state survives reload | M11 | m11 §7.1 | e2e E3 · ui `EquationView.test.tsx › invalid` | §4.15 |
| AC-1504 | Equation source searchable; read-only view | M11 | m11 §7.1 | e2e E4 · unit `content-text.test.ts › latex` · int `search.int.test.ts › latex in content_text` | §4.15 |
| AC-1601 | Full-width work screens at 1920 and 2560 px | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · viewport e2e | §4.16 |
| AC-1602 | Reading column ≤ 760 px; wide tables scroll inside the block; full-width toggle persists for all viewers, Cmd+Z reverts, audited | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · viewport e2e | §4.16 |
| AC-1603 | 48 px header bar with correct breadcrumb on main screens | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · viewport e2e | §4.16 |
| AC-1604 | Phone 390×844 and tablet 768×1024 usable, no horizontal page scroll | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · viewport e2e | §4.16 |
| AC-1605 | Contrast ≥ 4.5:1 with new tokens; no off-scale px in components | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) · viewport e2e | §4.16 |

## 4. Permissions (PERM-01…28 = SPEC §3.2 rows in table order)

Outcomes: `M` manager · `L` LEAD of that project · `Me` MEMBER of that project · `W` worker who is not a member. Invisible → **404**, visible but not allowed → **403** (X41); every write on an archived project → M/L/Me 403, W 404 (X42). Every row also runs as nobody (401) and as a must-change-password user (403) via the M1 loops; every mutating `allow` row asserts exactly one `audit_log` row (X44). M12 adds no rows; its audit sweep `tests/authz/audit-coverage.int.test.ts` (AUD-00…AUD-10, m12 §5.S0.4) re-reads every rows file. PERM-23 was appended at the end of §3.2 so PERM-01…22 keep their numbers (X79); PERM-11 was widened in v3.1.

| ID | Short description | Milestone | Plan step (mNN §5.Sx.y) | Test file › test name | Notes (X-id) |
|---|---|---|---|---|---|
| PERM-01 | "สร้าง/แก้/ปิดใช้งานพนักงาน, ตั้ง/รีเซ็ตรหัสผ่าน" — M allow · L/Me/W 403 | M1 | m01 §5.S0.8, §5.S2.8, §5.S4.1 | M1: `tests/authz/rows/employees.ts` › PERM-01a, PERM-01b, PERM-01c, PERM-01d, PERM-01e | §3.2 |
| PERM-02 | "จัดการตำแหน่ง, วันหยุด, ประเภทการลา" — M allow · L/Me/W 403 (reads open to all) | M1 (positions part) · M5 (holidays + leave-types part) | m01 §5.S2.9, §5.S4.1<br>m05 §5.S4.1 | M1: `tests/authz/rows/positions.ts` › PERM-02a, PERM-02b, PERM-02c, PERM-02d, PERM-02e<br>M5: `tests/authz/rows/holidays.ts` › PERM-02f, PERM-02g, PERM-02h, PERM-02i, PERM-02j · `tests/authz/rows/leave-types.ts` › PERM-02k, PERM-02l, PERM-02m, PERM-02n, PERM-02o, PERM-02p | §3.2, X41 |
| PERM-03 | "สร้าง/แก้/archive ลูกค้า" — M allow · L/Me/W 403 | M2 | m02 §5.S3.2 | M2: `tests/authz/rows/clients.ts` › PERM-03a, PERM-03b, PERM-03c, PERM-03d | §3.2 |
| PERM-04 | "ดูลูกค้า" — M all · L/Me only clients of their projects · W (no shared project) 404 | M2 · M9 · M10 (search part) | m02 §5.S3.2<br>m09 §5.S5.1<br>m10 §5.S1.8, §5.S4.1 | M2: `tests/authz/rows/clients.ts` › PERM-04a, PERM-04b, PERM-04c, PERM-04d, PERM-04e, PERM-04f, PERM-04g<br>M9: `tests/authz/rows/people.ts` › CL-LOAD-C1, CL-LOAD-C2<br>M10: `tests/authz/rows/search.ts` › SR-ALL, SR-INDEX | §3.2 |
| PERM-05 | "สร้างโปรเจค" — M allow · L/Me/W 403 | M2 | m02 §5.S3.2 | M2: `tests/authz/rows/projects.ts` › PERM-05 | §3.2 |
| PERM-06 | "เห็นโปรเจคในลิสต์ / เปิดโปรเจค" — M/L/Me allow · W 404; applies to every project-scoped read in later milestones | M2 · M3 · M4 (part) · M6 · M7 · M8 · M9 · M10 (search, embed part) | m02 §5.S3.2<br>m03 §5.S4.1, §5.S4.2<br>m04 §5.S1.2, §5.S1.4, §5.S1.8, §5.S4.2, §5.S4.4, §5.S4.5<br>m06 §5.S5.1<br>m07 §5.S4.1<br>m08 §5.S5.1<br>m09 §5.S5.1<br>m10 §5.S1.8, §5.S1.9, §5.S4.1 | M2: `tests/authz/rows/projects.ts` › PERM-06a, PERM-06b, PERM-06c, PERM-06d, PERM-06e<br>M3: `tests/authz/rows/tasks.ts` › T-LIST, T-LIST-ARCH, T-LIST-BAD, T-TEAM-P · `tests/authz/rows/task-statuses.ts` › S-LIST<br>M4: `tests/authz/rows/pages.ts` › PG-VIEW, PG-TREE · `tests/authz/rows/files.ts` › FL-DOWNLOAD-Q · `tests/authz/rows/search.ts` › SR-PAGES, SR-TITLE-ONLY, PG-TITLES<br>M6: `tests/authz/rows/allocations.ts` › GR-READ, GR-ARCH, GR-OTHERS, GR-DEFAULT<br>M7: `tests/authz/rows/grid-day.ts` › GR-D-ZOOM, GR-D-EXPAND, GR-D-ARCH, GR-D-BADQ, GR-D-MISSING<br>M8: `tests/authz/rows/milestones.ts` › MS-LIST, MS-LIST-ARCH, TT-MS, TT-MS-Q<br>M9: `tests/authz/rows/workload.ts` › WL-PROJ-P, WL-PROJ-Q · `tests/authz/rows/people.ts` › PJ-LOAD, PJ-LOAD-ARCH<br>M10: `tests/authz/rows/search.ts` › SR-ALL, SR-INDEX, SR-PAGES / SR-TITLE-ONLY / SR-EMPTY (M4) · `tests/authz/rows/pages.ts` › EMB-T-P, EMB-T-Q<br>AZ-2 meta-test `tests/authz/coverage.int.test.ts` (M2) — every route has a row | §3.2 |
| PERM-07 | "แก้ข้อมูลโปรเจค (ชื่อ, ลูกค้า, สี, ความแน่นอน)" — M/L allow · Me 403 · W 404 | M2 | m02 §5.S3.2 | M2: `tests/authz/rows/projects.ts` › PERM-07a, PERM-07b, PERM-07c, PERM-07d | §3.2 |
| PERM-08 | "เพิ่ม/ลบสมาชิก, เปลี่ยน LEAD/MEMBER" — M/L allow · Me 403 · W 404 | M2 · M3 | m02 §5.S3.2<br>m03 §5.S4.2 | M2: `tests/authz/rows/members.ts` › PERM-08a, PERM-08b, PERM-08c, PERM-08d, PERM-08e, PERM-08f<br>M3: `tests/authz/rows/members.ts` › M-REMOVE-BLOCKED, M-REMOVE-WITH-ASSIGN, M-RESTORE-REMOVED | §3.2 |
| PERM-09 | "Archive โปรเจค" — M/L allow · Me 403 · W 404 | M2 · M6 (FR-406 X) | m02 §5.S3.2 | M2: `tests/authz/rows/projects.ts` › PERM-09a, PERM-09b | §3.2 |
| PERM-10 | "ลบโปรเจคถาวร" — M allow · L/Me 403 · W 404 (the only confirm dialog) | M2 | m02 §5.S3.2 | M2: `tests/authz/rows/projects.ts` › PERM-10a, PERM-10b | §3.2 |
| PERM-11 | "สร้าง/แก้/ลบ/ติ๊กเสร็จ task, เปลี่ยนสถานะ, เพิ่ม/ลบตัวขวาง" (widened in v3.1) — M/L/Me allow · W 404 | M3 · M6 (BR-52 numbers) · M8 · M9 · M10 (reuse) | m03 §5.S4.1, §5.S4.2<br>m08 §5.S5.1<br>m10 §5.S2.2, §5.S3.3 | M3: `tests/authz/rows/tasks.ts` › T-* ×21 (T-CREATE … T-REVERT) · `tests/authz/rows/task-blockers.ts` › B-ADD, B-ADD-X, B-ADD-ARCH, B-REMOVE<br>M8: `tests/authz/rows/milestones.ts` › MS-LINK, MS-UNLINK, MS-LINK-ARCH, MS-REVERT | §3.2, X79, M8-D4, v3.1 widened (X79) |
| PERM-12 | "วางแผน (แก้ allocation)" — M/L/Me allow · W 404 | M6 · M7 · M9 | m06 §5.S5.1<br>m07 §5.S4.1<br>m09 §5.S5.1 | M6: `tests/authz/rows/allocations.ts` › AL-* ×7 (AL-SAVE … AL-MIXED-ARCH), PR-* ×4 (PR-PREVIEW … PR-ARCH)<br>M7: `tests/authz/rows/allocations-day.ts` › AL-* ×11 (AL-D-SPLIT … AL-D-ARCH-COLLAPSE) · `tests/authz/rows/allocations.ts` › AL-DAYWEEK (M6 row, flipped in S4.5)<br>M9: `tests/authz/rows/people.ts` › AL-PERSON | §3.2 |
| PERM-13 | "มอบหมายงานให้สมาชิกเดิม" — M/L/Me allow · W 404 | M3 | m03 §5.S4.2 | M3: `tests/authz/rows/assignments.ts` › A-ASSIGN-MEMBER, A-ASSIGN-ARCH, A-UNASSIGN, A-UNASSIGN-ARCH, A-RESTORE | §3.2 |
| PERM-14 | "มอบหมายงานให้คนที่ยังไม่เป็นสมาชิก (auto-invite)" — M/L allow · Me 403 · W 404 (BR-60) | M3 | m03 §5.S4.2 | M3: `tests/authz/rows/assignments.ts` › A-ASSIGN-NONMEMBER | §3.2 |
| PERM-15 | "สร้าง/แก้/ลบ milestone" — M/L allow · Me read-only (writes 403) · W 404 | M8 | m08 §5.S5.1 | M8: `tests/authz/rows/milestones.ts` › MS-* ×10 (MS-CREATE … MS-Q) | §3.2 |
| PERM-16 | "ดู/สร้าง/แก้/ลบ หน้าเอกสารในโปรเจค" — M/L/Me allow · W 404 | M4 · M10 (embed part) | m04 §5.S1.2, §5.S4.2, §5.S4.4<br>m10 §5.S1.9, §5.S1.10, §5.S4.1 | M4: `tests/authz/rows/pages.ts` › PG-* ×43 (PG-VIEW … PG-KEEPALIVE-ORIGIN) · `tests/authz/rows/files.ts` › FL-* ×10 (FL-UPLOAD-P … FL-DOWNLOAD-DELETED-PAGE)<br>M10: `tests/authz/rows/search.ts` › SR-ALL · `tests/authz/rows/pages.ts` › EMB-T-P, EMB-T-Q, EMB-T-A, EMB-T-DEL, EMB-W-P, EMB-W-Q, EMB-W-A, EMB-W-DEL | §3.2, X42 |
| PERM-17 | "ดูหน้า wiki ทีม" — all allow | M4 · M10 (embed part) | m04 §5.S1.2, §5.S4.3, §5.S4.4, §5.S4.5<br>m10 §5.S1.9, §5.S1.10, §5.S4.1 | M4: `tests/authz/rows/wiki.ts` › WK-VIEW, WK-VIEW-PROT, WK-TREE, WK-TREE-CHILD, WK-PROT-LOCK-GET · `tests/authz/rows/files.ts` › FL-DOWNLOAD-WIKI · `tests/authz/rows/search.ts` › SR-PAGES, SR-TITLE-ONLY, PG-TITLES<br>M10: `tests/authz/rows/search.ts` › SR-ALL, SR-PAGES / SR-TITLE-ONLY / SR-EMPTY (M4) · `tests/authz/rows/pages.ts` › EMB-T-WIKI, EMB-T-PROT, EMB-W-WIKI, EMB-W-PROT | §3.2 |
| PERM-18 | "สร้าง/แก้หน้า wiki ทีม" — all allow; locked page: M allow, workers 403 | M4 | m04 §5.S1.2, §5.S4.3, §5.S4.4 | M4: `tests/authz/rows/wiki.ts` › WK-* ×23 (WK-CREATE … WK-PROT-KEEPALIVE) · `tests/authz/rows/files.ts` › FL-UPLOAD-WIKI, FL-UPLOAD-PROT | §3.2 |
| PERM-19 | "ล็อก/ปลดล็อกหน้า wiki ทีม" — M allow · workers 403 | M4 · M10 | m04 §5.S1.6, §5.S4.2, §5.S4.3<br>m10 §5.S4.1 | M4: `tests/authz/rows/pages.ts` › PG-PROTECT · `tests/authz/rows/wiki.ts` › WK-PROTECT, WK-UNPROTECT<br>M10: `tests/authz/rows/pages.ts` › EMB-T-PROT | §3.2 |
| PERM-20 | "บันทึก/แก้/ลบวันลาของตัวเอง" — all allow | M5 · M9 | m05 §5.S4.2 | M5: `tests/authz/rows/time-off.ts` › PERM-20a…e, TO-400 | §3.2 |
| PERM-21 | "บันทึก/แก้/ลบวันลาของคนอื่น" — M allow · workers 403 (404 when the person is outside their visibility) | M5 · M9 | m05 §5.S4.2 | M5: `tests/authz/rows/time-off.ts` › PERM-21a, PERM-21b, PERM-21c, PERM-21d, PERM-21e, PERM-21f, PERM-21g | §3.2, M5-D3 |
| PERM-22 | "ดู workload" — per §3.3 (MASK-1…7, §7 below) | M5 (calendar part) · M9 · M10 (home, search, embed part) | m05 §5.S4.3<br>m09 §5.S5.1<br>m10 §5.S1.2, §5.S1.6, §5.S1.8, §5.S1.10, §5.S4.1 | M5: `tests/authz/rows/calendar.ts` › PERM-22a, CAL-400<br>M9: `tests/authz/rows/workload.ts` › WL-TABLE, WL-DEFAULT, WL-CELL-ME, WL-CELL-W, WL-BADGE · `tests/authz/rows/people.ts` › PEOPLE, PG-ME, PG-W, PG-CO, PH-ME, PH-W, PT-ME, PT-W<br>M10: `tests/authz/rows/home.ts` › HM-HOME · `tests/authz/rows/search.ts` › SR-ALL, SR-INDEX · `tests/authz/rows/pages.ts` › EMB-W-P, EMB-W-Q, EMB-W-A<br>masking: `tests/authz/masking.int.test.ts` (M2, M5, M6–M10 blocks — §7) | §3.2 |
| PERM-23 | "จัดการชุดสถานะงานของโปรเจค (เพิ่ม/แก้/เรียง/ลบ)" — M/L allow · Me 403 · W 404 · archived 403 | M3 | m03 §5.S4.2 | M3: `tests/authz/rows/task-statuses.ts` › S-CREATE, S-CREATE-ARCH, S-UPDATE, S-REORDER, S-DELETE, S-RESTORE, S-RESTORE-ARCH | §3.2, X79, v3.1 new (X79) |
| PERM-24 | "ดูฐานข้อมูลในหน้าเอกสาร" — = view of the owning page (project page: M/L/Me allow · W 404; wiki: all allow) | M11 | m11 §7.2 | authz `tests/authz/rows/databases.ts` / `row-pages.ts` › DB-GET*, RB-GET*, RP-LOADER*, RB-PAGE-GET, RB-LOCK-GET, RB-FILE-GET, SR-DB-* | §3.2 (v3.2) |
| PERM-25 | "แก้ฐานข้อมูลในหน้า" — = edit of the owning page, lease not required (locked wiki: workers 403; archived: 403) | M11 | m11 §7.2 | authz `tests/authz/rows/databases.ts` / `row-pages.ts` › DB-CREATE*, DB-RENAME*, ROW-*, COL-*, VIEW-*, RB-ENSURE*, RB-SAVE*, RB-KEEPALIVE, RB-LOCK-POST*, RB-UPLOAD*, FW-ROW* | §3.2 (v3.2), D16 |
| PERM-26 | "คัดลอกฐานข้อมูลไปหน้าอื่น" — view source (else 404) + edit target (invisible 404, protected/archived 403) | M11 | m11 §7.2 | authz `tests/authz/rows/databases.ts` / `row-pages.ts` › DB-COPY-* , PG-DUP-DB | §3.2 (v3.2), D15 |
| PERM-27 | "เปิด task เป็นหน้า / ดูเนื้อหางาน" — = view of the task (M/L/Me allow, archived allowed · W 404) | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §3.2 (v3.2) |
| PERM-28 | "แก้เนื้อหางาน" (save, lease, upload) — = edit of the task (M/L/Me allow · archived 403 · W 404) | M6.1 | m06.1 (plan pending — PLAN §1.8) | TBD (`plan/m06.1-task-page-ui.md`) | §3.2 (v3.2) |
| PERM-29 | "เพิ่ม/แก้/ลบ/กู้คืน เส้นกำกับบนแผนงาน" = plan edit (M/L/Me allow · archived 403 · W 404); GET markers = PERM-06 | M7.1 | m07.1 §5.S2.2–S2.4, §5.S5.1 | `tests/authz/rows/plan-markers.ts` › PM-LIST…PM-LIMIT | §3.2 (v3.3), M7.1-D22 |

Rows not tied to one PERM line: M1 `ACC-01/02` (own password, sign-out everywhere), `PREF-01/02`, `BA-01…08` (Better Auth endpoints → 404) in `tests/authz/rows/{account,preferences,auth-endpoints}.ts`; M3 `T-TEAM`, `T-MY`, `T-SIDEBAR` (own data / visibility filter X75); M5 `LT-READ` (M5-D15); M8 `MS-Q`, `MS-MISSING`, `MS-BAD` (X41/X42); M10 `HM-HOME` extra assertion `manager` card only for M.

## 5. Non-functional requirements (NFR, SPEC §9; r7 numbering)

`NFR-02a/b` = grid response/render, `NFR-07a/b` = browsers/viewports, `NFR-08a/b/c` = hashing/cookies/headers. m00 calls the NFR-07b part "NFR-07 (part)". Budgets are measured in M12 on `seed:perf` data (`scripts/perf-check.ts` P1–P8, `e2e/perf/m12-perf.spec.ts` PF1–PF6; gates per M12-D12).

| ID | Short description | Milestone | Plan step (mNN §5.Sx.y) | Test file › test name | Notes (X-id) |
|---|---|---|---|---|---|
| NFR-01 | Target size: ≤ 100 employees · 300 projects · 20 000 tasks · 5 000 pages · 3 years of data | M12 | m12 §5.S1.6–S1.8 | `scripts/lib/perf-data.int.test.ts` (scaled) · m12 §7.4 P0 data-volume counts on `planner_perf` | §9 (r7 numbering) |
| NFR-02a | Project grid 16 weeks × 200 rows: response < 500 ms p95 | M12 | m12 §5.S3.2 | `scripts/perf-check.ts` › P1, P1b, P1c (gates, m12 §7.4) | §9 (r7 numbering) |
| NFR-02b | Project grid 16 weeks × 200 rows: render < 300 ms | M12 | m12 §5.S3.4 | `e2e/perf/m12-perf.spec.ts` › PF1 (gate, m12 §7.4; m12 §1.1 calls it "P5") | §9 (r7 numbering) |
| NFR-03 | Team workload 100 people × 12 weeks < 800 ms p95 | M9 (smoke) · M12 | m09 §5.S2.12<br>m12 §5.S3.2 | M9: int `src/server/services/workload.perf.int.test.ts`<br>M12: `scripts/perf-check.ts` › P2, P2b (gates, m12 §7.4) · `e2e/perf/m12-perf.spec.ts` › PF6 (client, logged) | §9 (r7 numbering) |
| NFR-04 | Cell edit → visible result < 50 ms (optimistic) | M12 | m12 §5.S3.4 | `e2e/perf/m12-perf.spec.ts` › PF2 (gate, m12 §7.4; m12 §1.1 calls it "P6") | §9 (r7 numbering) |
| NFR-05 | Open a 300-block page < 1 s | M4 (smoke) · M12 | m04 §5.S2.4<br>m12 §5.S1.8, §5.S3.4 | M4: m04 §7.4 P-1<br>M12: `e2e/perf/m12-perf.spec.ts` › PF3 (gate, m12 §7.4; m12 §1.1 calls it "P7") | §9 (r7 numbering) |
| NFR-06 | Command palette: first result < 200 ms | M10 · M12 | m10 §5.S2.3, §5.S1.8<br>m12 §5.S3.4, §5.S3.2 | M10: `e2e/m10-home-search.spec.ts` › P3 (timing) · m10 §7.4 perf note · `src/server/services/search.int.test.ts` › timing<br>M12: `e2e/perf/m12-perf.spec.ts` › PF4 (gate) · `scripts/perf-check.ts` › P3b (server search p95, gate), P3c (logged) — m12 §7.4; m12 §1.1 calls them "P8" + "P3" | §9 (r7 numbering) |
| NFR-07a | Browsers: Chrome, Edge, Safari — 2 latest versions | M12 | m12 (Chromium automated; manual Safari/Edge pass (M12-D25)) | m12 §7.4 M3 manual | §9 (r7 numbering), M12-D25 |
| NFR-07b | ≥ 1280 px full UI; tablet usable; mobile = home, my tasks, report leave, read documents | M0 (part) · M3 · M4 (part) · M5 · M10 (home part) · M12 | m00 §5.S2.10<br>m03 §5.S3.12<br>m04 §5.S3.1<br>m05 §5.S3.3, §5.S3.4<br>m10 §5.S2.2<br>m12 §5.S4.2 | M0: `src/components/shell/AppShell.test.tsx` · `e2e/m0-smoke.spec.ts` › "narrow screens use a drawer" · `e2e/m0-smoke.spec.ts` › "narrow screens use a temporary drawer"<br>M3: `e2e/m3-tasks.spec.ts` › E13 (390 px viewport)<br>M4: m04 §7.4 M-4<br>M5: `e2e/m5-calendar.spec.ts` › E7 (390 × 844)<br>M10: `e2e/m10-home-search.spec.ts` › H4 (390 × 844)<br>M12: `e2e/m12-hardening.spec.ts` V1–V4 · `e2e/m12-hardening.spec.ts` › H6 (desktop tour) · V1–V3 | §9 (r7 numbering) |
| NFR-08a | Password hashing = Better Auth default | M1 · M12 | m01 §5.S0.8, §5.S2.3<br>m12 (M1) | M1: `tests/integration/auth.int.test.ts` › T-AUTH-04, T-AUTH-04b<br>M12: unchanged — M1 `auth.int.test.ts` · `tests/authz/audit-coverage.int.test.ts` › AUD-08 no hash in audit rows | §9 (r7 numbering) |
| NFR-08b | Cookies httpOnly + sameSite=lax; secure when served over HTTPS (SECURE_COOKIES) | M1 · M12 | m01 §5.S0.8, §5.S2.3<br>m12 (M1) + prod check | M1: `tests/integration/auth.int.test.ts` › T-AUTH-04, T-AUTH-04b<br>M12: `e2e/m12-hardening.spec.ts` H3 · `e2e/m12-deploy.spec.ts` D1 | §9 (r7 numbering) |
| NFR-08c | Security headers: CSP, frame-ancestors 'none' (+ nosniff) | M0 · M4 (editor part) · M12 | m00 §5.S1.4, §5.S1.5<br>m04 §5.S2.4<br>m12 (M0) + verification | M0: `src/lib/csp.test.ts`, `src/proxy.test.ts` · `e2e/m0-smoke.spec.ts` › "security headers and CSP nonce" + CSP guard on every test · CSP guard on every e2e test<br>M4: e2e CSP + external-request guards (M0 fixtures) on every M4 test<br>M12: `e2e/m12-hardening.spec.ts` H1–H2, H4 · `e2e/m12-deploy.spec.ts` › D1 · H6 | §9 (r7 numbering) |
| NFR-09 | No CDN or external service at runtime (server may be offline) | M0 · M4 (editor part) · M12 | m00 §5.S2.1, §5.S3.4<br>m04 §5.S2.4<br>m12 §5.S3.5, §5.S2.9 | M0: e2e/fixtures.ts external-request guard on every test · m00 §5.S2.13 grep · m00 §6 I9 grep<br>M4: e2e CSP + external-request guards (M0 fixtures) on every M4 test<br>M12: `tests/hardening/no-external-urls.test.ts` · `scripts/offline-check.sh` · every e2e (external-request guard) · external-request guard in every e2e · `offline:check` · `e2e/m12-deploy.spec.ts` › D6 | §9 (r7 numbering) |
| NFR-10 | Backup: daily pg_dump kept 14 days + UPLOAD_DIR backup | M12 | m12 §5.S2.4 | `tests/deploy/files.test.ts` · `e2e/m12-deploy.spec.ts` › D3–D4 · m12 §7.4 M1 restore drill · `tests/deploy/backup.int.test.ts` | §9 (r7 numbering) |
| NFR-11 | Page database 1,000 rows × 20 columns: GET < 500 ms p95, table render < 300 ms, view switch < 100 ms, cell edit < 50 ms | M11 (smoke) · M12 | m11 §5 S1.12, S2.15, S7.3 | perf (§7.4) · e2e P1 | §9 (v3.2, appended) |
| NFR-12 | Page with 3 database blocks (1,000 rows) + 50 equations opens < 1.5 s; KaTeX lazy | M11 (smoke) · M12 | m11 §5 S5.8, S7.3 | e2e P2 | §9 (v3.2, appended) |
| NFR-13 | Plan tab (M7.1): chart 20 people × 26 weeks < 200 ms after data; calendar month switch < 150 ms with 500 tasks; drag/resize ≥ 50 fps on 200 rows | M7.1 (smoke) · M12 | m07.1 §5.S3.8, §5.S4.5 | `e2e/m7.1-grid.spec.ts` › P10 (local smoke) · M12 perf | §9 (v3.3 row) |

## 6. Other v3.1 ids (kept from the interim v3.1 table; r7 families)

These are not FR/BR/AC/PERM/NFR ids, but the v3.1 change introduced or changed them; r7 §F holds the v3.0 rows of the same families (SCAF-, UT-, DM-, GAPI-, ACT-, UI-, KEY-, TPL-, …).

| ID | Short description | Milestone | Plan step (mNN §5.Sx.y) | Test file › test name | Notes (X-id) |
|---|---|---|---|---|---|
| PRIN-P7 | §1.3 principle P7 gains one exception: per-project status sets (name + colour + category, no automation) | M3 | m03 §5.S2.14, §5.S3.18 | spec-reviewer `scope` lens (review, no test file) · no-automation proven by `src/server/services/task-status.int.test.ts` (BR-87) | §1.3, X70, X71 |
| OOS (§1.4) | Multi-step status allowed; a dependency that moves plans / Gantt / critical path stays forbidden; no automatic status change | all (M3, M6, M9) | m03 §5.S2.15 (blockers never touch status/plans) | review lens · `src/server/services/task-blockers.int.test.ts` (FR-644: status unchanged) · `e2e/m3-tasks.spec.ts` › E19 | §1.4, X73 |
| DM (tasks) | `tasks.status_id` NOT NULL + composite FK `(project_id, status_id)`; `unique (project_id, id)` | M3 | m03 §5.S0.2, §5.S0.3 | `src/server/db/schema.int.test.ts` › task_statuses (23503) · `src/server/services/task-statuses.int.test.ts` | §6.2, X70 |
| GAPI (GridRow) | Grid task rows carry `blockers: { open, total }` | M6 | m06 §5.S0.4, §5.S2.2, §5.S3.3 | `src/server/services/grid.int.test.ts` › blockers · `src/components/grid/PlanGrid.test.tsx` · `e2e/m6-grid.spec.ts` › G2 | §7.4, X76 |
| TPL-B1 | Charter gains "งานและภาระของทีม" with both live blocks — M4 omits it (M4-D30), M10 adds it | M4 · M10 (v3.1 section) | m04 §5.S0.12<br>m10 §5.S0.8 | `src/i18n/templates.test.ts` · `src/components/editor/templates.headless.test.ts` · `e2e/m4-pages.spec.ts` › E11 | App. B.1, X78, M4-D30 |
| §13 #2 / #8 | Task + workload live blocks and the board moved into MVP; milestone block and within-column reorder stay Phase 2 | M3 · M10 | m03 §5.S3.16<br>m10 §5.S3 | review lens · `src/components/tasks/board/TaskBoard.test.tsx` (drag across columns only) | §13, X74, X78 |
| UT-10 | `status` domain module | M3 | m03 §5.S1.5 | `src/domain/status.test.ts` | §11.1 |
| UT-11 | `blockers` domain module (+ fast-check) | M3 | m03 §5.S1.6 | `src/domain/blockers.test.ts` (table + property) | §11.1, X73 |
| DM-19 | `task_status_category`, `task_statuses` (+ name/position indexes) | M3 | m03 §5.S0.2, §5.S0.3 | `src/server/db/schema.int.test.ts` › task_statuses | §6.2, X70 |
| DM-20 | `task_blockers` (+ composite FKs, active-pair unique index) | M3 | m03 §5.S0.2, §5.S0.3 | `src/server/db/schema.int.test.ts` | §6.2, X73 |
| GAPI-07 | `GET /api/tasks`, `GET /api/projects/:id/statuses` | M3 | m03 §5.S0.8, §5.S0.9, §5.S2.14, §5.S2.16 | `src/server/services/team-tasks.int.test.ts` · `src/server/services/task-statuses.int.test.ts` · `tests/authz/masking.int.test.ts` (m03 §5.S4.3) · `tests/authz/rows/tasks.ts` › T-TEAM* · `tests/authz/rows/task-statuses.ts` › S-LIST | §7.8, X75, X86 |
| GAPI-08 | `GET /api/pages/:pageId/embed/{tasks,workload}` | M10 | m10 §5.S1.9, §5.S1.10 | `tests/authz/rows/pages.ts` › EMB-T-*, EMB-W-* · `src/server/services/embed.int.test.ts` · `tests/authz/masking.int.test.ts` › K6–K9 (m10 §5.S4.2) | §7.8, C51 |
| ACT-04 | Status/blocker server actions incl. `revertTaskStatus`, `restoreTaskStatusBatch` | M3 | m03 §5.S2.6, §5.S2.14, §5.S2.15 | `tests/authz/rows/tasks.ts` › T-STATUS*, T-REVERT · `tests/authz/rows/task-statuses.ts` › S-* · `tests/authz/rows/task-blockers.ts` › B-* | §7.8, M3-D28 |
| UI-15 | Sidebar "งานของทีม" (nav id `tasks`, M3-D40) | M3 | m03 §5.S3.12 | `e2e/m3-tasks.spec.ts` › E20 (and E13 for the "งานของฉัน N" badge) | §8.1, X75, M3-D40 |
| UI-16 | Board layout, `/tasks` category columns, status settings on ภาพรวม | M3 | m03 §5.S3.16, §5.S3.18, §5.S3.19 | `src/components/tasks/board/TaskBoard.test.tsx` · `src/components/projects/StatusSettings.test.tsx` · `src/components/tasks/team/TeamTasks.test.tsx` · `e2e/m3-tasks.spec.ts` › E16–E20 | §8.10 |

## 7. Masking (SPEC §3.3; extends r7 §H)

All leak cases live in `tests/authz/masking.int.test.ts` (one `describe` per milestone); helper `assertNoLeak(body, forbidden)` (M2) = `JSON.stringify(body)` contains none of the forbidden strings/ids, and required masked totals must still be present. World: manager, lead (LEAD of P), member (MEMBER of P), outsider (MEMBER of Q only), coworker (P + Q). MASK ids follow r7 §A.

### 7.1 MASK ids

| ID | Short description | Milestone | Plan step (mNN §5.Sx.y) | Test file › test name | Notes (X-id) |
|---|---|---|---|---|---|
| MASK-1 | Manager: sees totals of everyone and all details | M9 (§11.2) · M10 (TST-2) | m09 §5.S2.1, §5.S2.11<br>m10 §5.S1 (all steps) | M9: mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) (files per step: `src/server/services/masking.int.test.ts`)<br>M10: `tests/authz/masking.int.test.ts` › M10 (K1–K10) | §3.3 (r7 numbering) |
| MASK-2 | Worker who is LEAD of ≥ 1 project: totals of everyone (to pick helpers); details only for projects they belong to | M9 (§11.2) · M10 (TST-2) | m09 §5.S2.1, §5.S2.11<br>m10 §5.S1 (all steps) | M9: mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) (files per step: `src/server/services/masking.int.test.ts`)<br>M10: `tests/authz/masking.int.test.ts` › M10 (K1–K10) | §3.3 (r7 numbering) |
| MASK-3 | Other workers: totals of self + people sharing ≥ 1 project; details only for their projects | M9 (§11.2) · M10 (TST-2) | m09 §5.S2.1, §5.S2.11<br>m10 §5.S1 (all steps) | M9: mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) (files per step: `src/server/services/masking.int.test.ts`)<br>M10: `tests/authz/masking.int.test.ts` › M10 (K1–K10) | §3.3 (r7 numbering) |
| MASK-4 | Load from projects the viewer can't access → one item 'งานในโปรเจคอื่น' with days; project/task names never sent | M9 (§11.2) | m09 §5.S2.1, §5.S2.11 | mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) (files per step: `src/server/services/masking.int.test.ts`) | §3.3 (r7 numbering) |
| MASK-5 | Other people's leave shows only 'ลา' (no type, no note) — except to the manager and the person | M5 (§3.3) · M9 (§11.2) · M10 (TST-2) | m05 §5.S0.8, §5.S2.6<br>m09 §5.S2.1, §5.S2.11<br>m10 §5.S1 (all steps) | M5: mask (world + golden) · int `src/server/services/calendar.int.test.ts` · `e2e/m5-calendar.spec.ts` › E5<br>M9: mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) (files per step: `src/server/services/masking.int.test.ts`)<br>M10: `tests/authz/masking.int.test.ts` › M10 (K1–K10) | §3.3 (r7 numbering), X30, X43 |
| MASK-6 | Milestones of inaccessible projects are not shown | M9 (§11.2) · M10 (TST-2) | m09 §5.S2.1, §5.S2.11<br>m10 §5.S1 (all steps) | M9: mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) (files per step: `src/server/services/masking.int.test.ts`) · int `grid-person › milestones` · mask golden (M8 names) · ui `PlanGrid.person.test.tsx`<br>M10: `tests/authz/masking.int.test.ts` › M10 (K1–K10) | §3.3 (r7 numbering) |
| MASK-7 | Masking always happens on the server; hidden names never reach the client even if the UI hides them | M2 (§3.3) · M5 (§3.3) · M9 (§11.2) · M10 (TST-2) | m02 §5.S0.6, §5.S1.2, §5.S3.4<br>m05 §5.S0.8, §5.S2.6<br>m09 §5.S2.1, §5.S2.11<br>m10 §5.S1 (all steps) | M2: `src/server/authz.int.test.ts` · `src/server/services/masking.int.test.ts` · `tests/authz/masking.int.test.ts`<br>M5: mask (world + golden) · int `src/server/services/calendar.int.test.ts` · `e2e/m5-calendar.spec.ts` › E5<br>M9: mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) (files per step: `src/server/services/masking.int.test.ts`)<br>M10: `tests/authz/masking.int.test.ts` › M10 (K1–K10) | §3.3 (r7 numbering), X30, X43 |

### 7.2 Leak assertions by milestone

| Milestone | `describe` block (plan step) | Endpoint / payload | Viewer → subject | Must be absent | Must be present |
|---|---|---|---|---|---|
| M2 | skeleton (m02 §5.S3.4, MASK-7, X30) | project list / sidebar data, client list | outsider | P name, P client (unless shared) | own projects |
| M3 | tasks (m03 §5.S4.3) | `GET /api/projects/P/tasks`, `GET /api/tasks/my` | outsider of P | everything (404); P task names/ids | only Q tasks in `/my` |
| M3 | tasks (m03 §5.S4.3, X75) | `GET /api/tasks` (no `projectId`) | outsider of P | P task names/ids, P status names/ids, P blocker edges | own projects' tasks |
| M3 | tasks (m03 §5.S4.3) | `GET /api/projects/P/statuses` | outsider of P | everything (404) | — |
| M4 | `pages (M4)` K1–K14 (m04 §5.S4.6, M4-D32) | Cmd+K page search, mention suggestions (`titleOnly`), `GET /api/pages/titles`, page tree, page + lock, `GET /api/files/:id` | outsider | P page titles/content, P file bytes/name (404); P titles behind ids in wiki content | wiki pages; `{ id, visible: false }` for hidden ids |
| M5 | calendar (m05 §5.S4.3, MASK-5/7, X43) | `GET /api/calendar` month | member → lead's leave | leave type name, note | "ลา" label, dates |
| M5 | calendar (m05 §5.S4.3, MASK-3) | `GET /api/calendar` month | outsider → people not sharing a project | their entries entirely | own + co-members' entries |
| M6 | `grid (M6)` (m06 §5.S5.2, MASK-5/7, X29) | `GET /api/grid/project/P` | lead / member | other people's leave type/note; names in `otherProjects` | "ลา" labels, capacity, `otherProjects` numbers only |
| M7 | `grid day (M7)` (m07 §5.S4.2, X29, X30) | `GET /api/grid/project/P?zoom=day` / `expand` | lead | member's leave type/note/id on day cells | `{ label: "ลา" }` day entries |
| M8 | `milestones (M8)` (m08 §5.S5.2, M8-D23) | `GET /api/projects/P/milestones`, `GET /api/calendar`, `GET /api/tasks` (`milestonesByProject`), grid ◆ row | outsider | P milestone names/ids (404 on P routes) | own project milestones |
| M9 | `workload & people (M9)` (m09 §5.S5.2, MASK-1…7) | `GET /api/workload` (+ cell detail, overload list, badge), `GET /api/grid/person/:id`, `/people/[id]` data, project/client load | member / lead / outsider | Q project/task names (folded into one "งานในโปรเจคอื่น" line); persons outside visibility (404) | totals per §3.3; masked row with totals |
| M10 | `home, search, embeds (M10)` K1–K10 + golden variant (m10 §5.S4.2, TST-2) | `GET /api/search` (all categories), `GET /api/search/index`, `GET /api/home` | outsider / member | Q/P projects, tasks, clients, statuses, milestones, pages, leave type/note; `manager` cards for workers | own results/cards; masked leave `{ kind: "masked" }` |
| M10 | same block (X78, AC-1303) | `GET /api/pages/:id/embed/tasks` | outsider of P (page in P) | everything (404) | — |
| M10 | same block (X78, AC-1303) | `GET /api/pages/:id/embed/workload` | member of P | names/ids of projects the viewer is not in | masked "งานในโปรเจคอื่น" totals |
| M10 | same block (K9) | `/embed/{tasks,workload}` on a wiki page | member | every project/task name and id | body = `{ kind: "wiki" }` |

Server-side masking helpers have their own unit/integration tests: `src/server/services/masking.int.test.ts` (M9 `› M9` parts fold, m09 §5.S2.1) and the pure `src/server/services/masking.ts` skeleton (M2 S0.6, M5 S0.8).

## 8. E2E spec index (spec file → scenario ids → ACs)

Scenario ids are those of each plan's §7.3 (m12: §5.S3.4/§5.S4.2/§5.S4.3). "Other ids" = FR/BR/PERM/NFR/MASK ids named in the scenario label or pointing at it from a §1.1/§7.1 row. `⟲` in the plan = scenario starts from `resetDb()`.

### `e2e/m0-smoke.spec.ts`

ACs covered: — (no SPEC AC id)

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| 1 | root redirects to /home | — | — |
| 2 | home renders the Thai shell | — | — |
| 3 | self-hosted Thai font is used | — | — |
| 4 | security headers and CSP nonce | — | NFR-08c |
| 5 | sidebar collapses with the shortcut and the button | — | — |
| 6 | keyboard: skip link and focus | — | — |
| 7 | narrow screens use a temporary drawer | — | NFR-07b |
| 8 | health endpoint is public and uncached | — | — |
| 9 | unknown page shows the Thai 404 | — | — |
| all | guards (auto fixture) | — | — |

### `e2e/m1-auth.spec.ts`

ACs covered: AC-101, AC-102, AC-103, AC-104, AC-201, AC-202, AC-203

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| E2E-01 | E2E-01 (AC-101) | AC-101 | FR-101 |
| E2E-02 | E2E-02 (AC-102) | AC-102 | FR-101 |
| E2E-03 | E2E-03 (AC-103, FR-104/105) | AC-103 | FR-104, FR-105, FR-203 |
| E2E-04 | E2E-04 (AC-104, AC-203 M1) | AC-104, AC-203 | FR-205 |
| E2E-05 | E2E-05 (AC-201, FR-202) | AC-201 | FR-202, FR-201 |
| E2E-06 | E2E-06 (AC-202) | AC-202 | FR-202 |
| E2E-07 | E2E-07 (FR-207, FR-201 edit) | — | FR-207, FR-201 |
| E2E-08 | E2E-08 (FR-107) | — | FR-107 |
| E2E-09 | E2E-09 (FR-105) | — | FR-105 |
| E2E-10 | E2E-10 (FR-106) | — | FR-106 |
| E2E-11 | E2E-11 (FR-208, X04) | — | FR-208 |
| E2E-12 | E2E-12 (FR-209, X41) | — | FR-209 |
| E2E-13 | E2E-13 (§8.1, X05) | — | — |
| E2E-14 | E2E-14 (X33) | — | — |
| E2E-15 | E2E-15 (settings nav) | — | — |

### `e2e/m2-projects.spec.ts`

ACs covered: AC-203

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| E1 | E1 — Worker visibility (peter) — §12 M2 | — | FR-303 |
| E2 | E2 — Manager creates project (manager) | — | FR-401, FR-409 |
| E3 | E3 — Clients (manager, then cindy) | — | FR-301, FR-302, FR-303 |
| E4 | E4 — Members + BR-62 (cindy on POS) | AC-203 | BR-62, FR-403, FR-404, FR-409 |
| E5 | E5 — Certainty without reload (cindy on POS) — FR-405 | — | FR-405 |
| E6 | E6 — Archive + undo (cindy on CRM) — FR-406 | — | FR-406 |
| E7 | E7 — Permanent delete (manager on Store; cindy check) — FR-407 | — | FR-407 |
| E8 | E8 — Tabs (jack on Mobile) — FR-408 | — | FR-408 |
| E9 | E9 — Sidebar expansion remembered (mint) | — | — |

### `e2e/m3-tasks.spec.ts`

ACs covered: AC-203, AC-601, AC-602, AC-603, AC-611, AC-612, AC-613, AC-614, AC-615, AC-616

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| E1 | E1 ⟲ — AC-601, FR-602, FR-408, `N` (cindy) | AC-601 | FR-602, FR-408 |
| E2 | E2 — AC-602, FR-603 (cindy) | AC-602 | FR-603 |
| E3 | E3 — AC-603 (M3 part), FR-609, Cmd+Z (cindy) | AC-603 | FR-609 |
| E3b | E3b ⟲ — UNDO-4 toast 8 s (cindy) | — | — |
| E4 | E4 ⟲ — FR-605, FR-606, BR-60, PERM-13/14 (cindy, then ivy) | — | FR-605, FR-606, BR-60, PERM-13, PERM-14 |
| E4b | E4b ⟲ — AC-203 (M3 part) (manager) | AC-203 | — |
| E5 | E5 ⟲ — FR-610, BR-31, AC-602 on golden rows (cindy) | AC-602 | FR-610, BR-31 |
| E6 | E6 ⟲ — FR-607, FR-608, prefs, FR-409 progress (cindy) | — | FR-607, FR-608, FR-409 |
| E7 | E7 ⟲ — FR-611, BR-36, Esc, deep link (cindy) | — | FR-611, BR-36, FR-601 |
| E8 | E8 ⟲ — FR-613 (cindy) | — | FR-613 |
| E9 | E9 ⟲ — FR-614, Cmd+Enter (cindy) | — | FR-614 |
| E10 | E10 ⟲ — FR-604 drag (cindy) | — | FR-604 |
| E11 | E11 ⟲ — FR-404, BR-61 (cindy) | — | FR-404, BR-61 |
| E12 | E12 — `?` help, X07 (cindy) | — | — |
| E13 | E13 ⟲ — FR-1009 basic, sidebar count, NFR-07b (ivy) | — | FR-1009, NFR-07b, FR-667 |
| E14 | E14 ⟲ — authz in the UI (cindy, then peter) | — | — |
| E15 | E15 ⟲ — AC-611, FR-621/625 (manager) | AC-611 | FR-621, FR-625 |
| E16 | E16 ⟲ — AC-612, FR-622, PERM-23 UI (cindy = LEAD of POS, then ivy = MEMBER) | AC-612 | FR-622, PERM-23 |
| E17 | E17 ⟲ — AC-613, FR-660/662, FR-626 `S`, FR-608 (cindy) | AC-613 | FR-660, FR-662, FR-626, FR-608 |
| E18 | E18 ⟲ — AC-614, FR-624, FR-614 bulk status (cindy) | AC-614 | FR-624, FR-614 |
| E19 | E19 ⟲ — AC-615, FR-640–644 (cindy) | AC-615 | FR-640, FR-641, FR-642, FR-643, FR-644 |
| E20 | E20 ⟲ — AC-616, FR-665/666, X75 (peter, then cindy) | AC-616 | FR-665, FR-666 |

### `e2e/m4-pages.spec.ts`

ACs covered: AC-501, AC-502, AC-503, AC-504, AC-505

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| E1 | E1 ⟲ — FR-402, FR-505, FR-408, UI-01, X78 (manager, then cindy) | — | FR-402, FR-505, FR-408 |
| E2 | E2 ⟲ — AC-501, FR-506, FR-520, FR-523 (cindy) | AC-501 | FR-506, FR-520, FR-523 |
| E3 | E3 — AC-502, FR-524, EDI-4, M4-D33 (cindy) | AC-502 | FR-524 |
| E4 | E4 ⟲ — AC-503, FR-525, FR-526, FR-505, M4-D34 (cindy, ivy, peter) | AC-503 | FR-525, FR-526, FR-505 |
| E5 | E5 — AC-504, FR-506, FR-528, M4-D14 (cindy) | AC-504 | FR-506, FR-528 |
| E14 | E14 — FR-529, EDI-3, M4-D20 (cindy, then peter) | — | FR-529 |
| E6 | E6 ⟲ — AC-505, FR-540, FR-542, FR-541 release (cindy + ivy, two contexts) | AC-505 | FR-540, FR-542, FR-541 |
| E7 | E7 ⟲ — FR-510, PERM-18/19, X63 (manager, ivy) — extras: wiki "นโยบายทีม" + child "ย่อยนโยบาย" (by Cindy) | — | FR-510, PERM-18, PERM-19 |
| E8 | E8 ⟲ — FR-509, UNDO-3, P2 (cindy) | — | FR-509 |
| E9 | E9 — FR-508, M4-D22 (cindy) | — | FR-508 |
| E10 | E10 — FR-503, UI-02, M4-D23 (cindy) | — | FR-503 |
| E18 | E18 — FR-504 (cindy) | — | FR-504 |
| E11 | E11 ⟲ — FR-507, TPL-B1…B3, M4-D6/D7 (ivy) | — | FR-507 |
| E12 | E12 ⟲ — FR-520, FR-521, FR-522, FR-523, FR-530, FR-532 (cindy) | — | FR-520, FR-521, FR-522, FR-523, FR-530, FR-532 |
| E13 | E13 ⟲ — FR-527, FILE-2…5 (cindy) | — | FR-527 |
| E15 | E15 ⟲ — FR-531, M4-D2, M4-D26 (cindy) | — | FR-531 |
| E16 | E16 ⟲ — FR-1102/1104/1105 pages part, X08, X49, KEY-01 (ivy, then peter) — extras: wiki … | — | FR-1102, FR-1104, FR-1105 |
| E17 | E17 ⟲ — FR-543, M4-D35 (cindy) — extras: wiki "หน้าชนกัน" content "ต้นฉบับ" | — | FR-543 |
| E19 | E19 — FILE-8, NFR-09, M4-D9 (cindy) — in E2's describe | — | NFR-09 |

### `e2e/m5-calendar.spec.ts`

ACs covered: — (no SPEC AC id)

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| E1 | E1 (AC-M5-a, FR-903/906/907/908) — `resetDb()` (F1) · peter | — | FR-903, FR-906, FR-907, FR-908, FR-904 |
| E2 | E2 (AC-M5-b, FR-905) — continue as peter | — | FR-905 |
| E3 | E3 (FR-909) — continue as peter | — | FR-909 |
| E4 | E4 (AC-M5-c, FR-901, BR-12, SET-02) — `resetDb()` · manager, then mint, then peter | — | FR-901, BR-12, FR-906 |
| E5 | E5 (MASK-5, PERM-21, FR-906) — `resetDb('F4')` · manager, ivy, jack, cindy | — | MASK-5, PERM-21, FR-906, FR-903, FR-904, FR-907, MASK-7 |
| E6 | E6 (FR-902) — `resetDb('F4')` · manager, cindy, worker 404 | — | FR-902 |
| E7 | E7 (NFR-07b) — `resetDb()` · ivy, viewport 390 × 844 | — | NFR-07b, FR-903, FR-904, FR-907 |
| E8 | E8 (FR-908 keyboard) — inside E1's describe, after E3 (peter) | — | FR-908 |

### `e2e/m6-grid.spec.ts`

ACs covered: AC-203, AC-603, AC-604, AC-801, AC-802, AC-803, AC-805

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| G1 | G1 ⟲ — FR-408, FR-801, FR-802 (week), toolbar · cindy | — | FR-408, FR-801, FR-802 |
| G2 | G2 ⟲ — AC-801, FR-805, X76, A11Y-2b · cindy | AC-801 | FR-805, FR-643 |
| G3 | G3 ⟲ `F3` — AC-802 · peter | AC-802 | FR-807 |
| G4 | G4 ⟲ — AC-803, FR-804 · cindy | AC-803 | FR-804 |
| G5 | G5 ⟲ — AC-805, §7.5 · cindy | AC-805 | — |
| G6 | G6 ⟲ — X27, BR-20a, §4.8 การลบ · ivy | — | BR-20a, BR-20 |
| G7 | G7 ⟲ — §4.8 การลบ, KEY-05, `?` help · cindy | — | — |
| G8 | G8 ⟲ — FR-405, FR-806, FR-809, X29 · cindy | — | FR-405, FR-806, FR-809 |
| G9 | G9 ⟲ — FR-612, AC-603 plans, BR-25 · cindy | AC-603 | FR-612, BR-25 |
| G10 | G10 ⟲ — AC-604 (M6 part) · jack | AC-604 | BR-25, FR-612 |
| G11 | G11 ⟲ — AC-203 grid clause · manager | AC-203 | — |
| G12 | G12 ⟲ — BR-52 on every path, FR-406 X · cindy, then manager | — | BR-52, FR-406 |
| G13 | G13 ⟲ — §7.4 rollback · cindy | — | — |
| G14 | G14 ⟲ — VERSION_CONFLICT · cindy + ivy (two contexts) | — | — |
| G15 | G15 ⟲ `syntheticGrid` — §9 smoke (M6-D22) · cindy | — | — |

### `e2e/m6.1-task-page.spec.ts`

Plan pending (`plan/m06.1-task-page-ui.md`, PLAN §1.8). Must cover AC-621…628 and AC-1601…1605 (viewports 1920, 2560, 768×1024, 390×844) — SPEC §12 M6.1.

### `e2e/m7-daily.spec.ts`

ACs covered: AC-801, AC-802, AC-803, AC-804, AC-805

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| D1 | D1 (AC-804, FR-803, BR-22, §8.4) — `resetDb()` (F1) · ivy | AC-804 | FR-803, BR-22 |
| D4 | D4 (BR-23, AC-805 continuity) — continue · ivy | AC-805 | BR-23 |
| D2 | D2 (BR-24 SCALE, undo without dialog) — continue · ivy | AC-805 | BR-24 |
| D3 | D3 (BR-24 COLLAPSE, Cancel, one dialog for N weeks) — continue · ivy | — | BR-24 |
| D5 | D5 (FR-802 day zoom, seed A.2) — `resetDb(undefined, { dayExample: true })` · jack | — | FR-802 |
| D6 | D6 (keyboard only, KEY-07, A11Y-2b, same-kind) — `resetDb()` · ivy | AC-801, AC-802, AC-803 | BR-26, FR-803 |
| D7 | D7 (F2: overload glyphs, spill, holiday) — `resetDb('F2')` · jack | — | BR-22, BR-40, BR-45, FR-804, FR-807 |

### `e2e/m7.1-grid.spec.ts`

ACs covered: AC-806, AC-807, AC-808, AC-809, AC-810, AC-811, AC-812, AC-813

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| P1 | Split + hide assignees, summed cells (cindy) | AC-810 | FR-816, FR-817, BR-100, BR-101 |
| P2 | Resize the งาน column (cindy, ivy) | AC-808 | FR-814 |
| P3 | Drag / Alt+arrows reorder, undo, transfer, archived (cindy, manager) | AC-809 | FR-815, BR-105, FR-610 |
| P4 | Month header row + boundaries (ivy) | AC-811 | FR-818 |
| P5 | Plan markers CRUD, day zoom, calendar flag, undo (cindy, ivy) | AC-812 | FR-819, FR-820, BR-102 |
| P6 | Marker permissions (peter 404, archived 403) | AC-812 | PERM-29 |
| P7 | Calendar view (cindy) | AC-806 | FR-810, FR-811, FR-812, BR-103 |
| P8 | Load chart + masking (cindy, mint) | AC-807 | FR-813, BR-104 |
| P9 | Viewport suite 390/768/1280/1920/2560 | AC-813 | FR-1601, FR-1606 |
| P10 | Perf smoke (not a gate) | — | NFR-13 |

### `e2e/m8-milestones.spec.ts`

ACs covered: AC-701, AC-702

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| M1 | M1 ⟲ — AC-701, FR-702 grid cell (cindy on CRM) | AC-701 | FR-702, FR-705 |
| M2 | M2 — AC-702 + negative (cindy, continues M1) | AC-702 | BR-71, FR-601, FR-613, FR-614, FR-703, FR-706 |
| M3 | M3 — FR-707 drag + undo + keyboard (cindy) | — | FR-707 |
| M4 | M4 ⟲ — FR-409/702/703/708 overview (cindy on POS, `resetDb(undefined, { milestones: true })`) | — | FR-409, FR-702, FR-703, FR-708, FR-701, FR-704 |
| M5 | M5 — PERM-15 read-only (ivy, member of POS and CRM) | — | PERM-15 |
| M6 | M6 — FR-613/614 grouping + bulk (cindy on CRM) | — | FR-613, FR-614, FR-601, FR-703 |
| M7 | M7 — FR-661/663 board + `/tasks` (cindy) | — | FR-661, FR-663 |
| M8 | M8 ⟲ — FR-907 calendar + masking (cindy, then peter; `resetDb(undefined, { milestones: true })`) | — | FR-907, FR-705 |
| M9 | M9 — FR-702 `Cmd+K` (cindy on POS plan, then ivy) | — | FR-702 |
| M10 | M10 — A.2 grid (manager; `resetDb(undefined, { milestones: true })`) | — | FR-705 |

### `e2e/m9-workload.spec.ts`

ACs covered: AC-604

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| W1 | W1 ⟲ `F2+F3` — FR-1001/1002/1006, §8.5, PRIN-P6 · manager | — | FR-1001, FR-1002, FR-1006 |
| W2 | W2 ⟲ `F2+F3` — FR-1003/1004, FR-405 · manager | — | FR-1003, FR-1004, FR-405 |
| W3 | W3 ⟲ `F3` — FR-1005 · manager | — | FR-1005 |
| W4 | W4 ⟲ `F2+F3` — MASK-2/3/4, FR-1008 404 · ivy | — | MASK-2, MASK-3, MASK-4, FR-1008, FR-1002 |
| W5 | W5 ⟲ `F2+F3` — FR-1007, X31 · manager, ivy, mint, peter | — | FR-1007 |
| W6 | W6 ⟲ — FR-1008, MASK-4 · cindy | — | FR-1008, MASK-4 |
| W7 | W7 ⟲ — AC-604 · jack | AC-604 | — |
| W8 | W8 ⟲ — FR-906, M7-D15, person-grid edit · ivy, then peter | — | FR-906 |
| W9 | W9 ⟲ — FR-1009, FR-667, X22 · ivy | — | FR-1009, FR-667 |
| W10 | W10 ⟲ `F4` — FR-667 person tab, วันลา tab, MASK-5 · cindy, then ivy, then peter | — | FR-667, MASK-5, FR-1008 |
| W11 | W11 ⟲ — FR-409, FR-303 · cindy, then manager | — | FR-409, FR-303 |

### `e2e/m10-home-search.spec.ts`

ACs covered: AC-1301, AC-1302, AC-1303

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| H1 | H1 ⟲ — FR-1101a–e, UI-04, X68 (cindy) | — | FR-1101a, FR-1101b, FR-1101c, FR-1101d, FR-1101e, FR-705 |
| H2 | H2 — FR-1101a tick + undo (cindy) | — | FR-1101a |
| H3 | H3 — FR-1101f, PRIN-P6 (manager) | — | FR-1101f, FR-1101c, FR-1101d, FR-705 |
| H4 | H4 — NFR-07b (ivy, viewport 390 × 844) | — | NFR-07b |
| P1 | P1 ⟲ (golden F1) — FR-1102/1105 | — | FR-1102, FR-1105, FR-1104 |
| P2 | P2 — FR-1104 local categories (ivy) | — | FR-1104, FR-1102, FR-1105 |
| P3 | P3 — NFR-06 (cindy) | — | NFR-06 |
| P4 | P4 — FR-1103 (cindy) | — | FR-1103 |
| P5 | P5 — KEY-05 (cindy) | — | — |
| P6 | P6 — KEY-01 vs BlockNote (cindy) | — | — |
| P7 | P7 — KEY-06 | — | — |
| B1 | B1 ⟲ (golden F1, `livePages`) — AC-1301 (cindy) | AC-1301 | FR-1301 |
| B2 | B2 — AC-1302 (manager) | AC-1302 | FR-1304 |
| B3 | B3 — AC-1303 (ivy) | AC-1303 | FR-1303 |
| B4 | B4 — FR-1306 (cindy) | — | FR-1306 |
| B5 | B5 — FR-1307 (cindy) | — | FR-1307 |
| B6 | B6 — M10-D5 (cindy) | — | — |

### `e2e/m11-database.spec.ts`

Plan pending (`plan/m11-database-views.md`, PLAN §1.8). Must cover AC-1401…1413 and AC-1501…1504 (SPEC §12 M11).

### `e2e/perf/m12-perf.spec.ts`

ACs covered: — (no SPEC AC id)

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| PF1 | PF1 — NFR-02b | — | NFR-02b |
| PF2 | PF2 — NFR-04 | — | NFR-04 |
| PF3 | PF3 — NFR-05 | — | NFR-05 |
| PF4 | PF4 — NFR-06 | — | NFR-06 |
| PF5 | PF5 — — (X75) | — | — |
| PF6 | PF6 — — (NFR-03 client) | — | NFR-03 |

### `e2e/m12-hardening.spec.ts`

ACs covered: — (no SPEC AC id)

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| H1 | H1 — NFR-08c | — | NFR-08c |
| H2 | H2 — NFR-08c | — | NFR-08c |
| H3 | H3 — NFR-08b | — | NFR-08b |
| H4 | H4 — NFR-08c, FILE-7 | — | NFR-08c |
| H5 | H5 — M12-D32, §7.6 | — | — |
| H6 | H6 — NFR-09, NFR-08c | — | NFR-09, NFR-08c, NFR-07b |
| V1 | V1 — NFR-07b mobile | — | NFR-07b |
| V2 | V2 — NFR-07b tablet | — | NFR-07b |
| V3 | V3 — NFR-07b desktop | — | NFR-07b |
| V4 | V4 — §8.9 | — | — |

### `e2e/m12-deploy.spec.ts`

ACs covered: — (no SPEC AC id)

| Scenario | Plan label (actor) | ACs | Other ids |
|---|---|---|---|
| D1 | D1 — FR-102, FR-104, DEP-15, NFR-08b/c | — | FR-102, FR-104, NFR-08b, NFR-08c |
| D2 | D2 — DEP-03, FR-201, FR-401 | — | FR-201, FR-401 |
| D3 | D3 — DEP-04, DEP-12, NFR-10 | — | NFR-10 |
| D4 | D4 — DEP-12, DEP-13, M12-D26 | — | NFR-10 |
| D5 | D5 — DEP-01, X52 | — | — |
| D6 | D6 — NFR-09 | — | NFR-09 |

Every spec also runs the M0 auto-fixture guards (`e2e/fixtures.ts`: no external request — NFR-09; no CSP console error — NFR-08c) and the M1 `loginAs`/`resetDb` helpers (X91). `e2e/perf/**` and `e2e/m12-deploy.spec.ts` are excluded from the default run (`testIgnore`, m12 §5.S0.3).

## 9. Gaps

### 9.1 Ids with no milestone or no test

- **No milestone:** none — every SPEC FR/BR/AC id, every §3.2 row (PERM-01…23) and every §9 row (NFR-01…10) has at least one in-scope row in a milestone plan — **except the v3.2 ids** (FR-1401…1506, BR-90…98, AC-1401…1504, PERM-24…28, NFR-11…12; plus the M6.1 ids FR-680…693, AC-621…628, FR-1601…1606, AC-1601…1605, AC-1414): milestone M11 or M6.1 is assigned but `plan/m11-database-views.md` / `plan/m06.1-task-page-ui.md` is not written yet (owner review of SPEC v3.2 first, PLAN §1.8).
- **No test:** none.
- **Manual check only (allowed; named explicitly):** NFR-07a → m12 §7.4 M3 (Safari + Edge manual pass; Chromium runs every automated test, M12-D25).
- **Test named but file not named in the plan:** FR-210 (`U-UN-01..03` in m01 §5.S3.5 — component test for `UserName`/`UserAvatar`; expected `src/components/common/UserName.test.tsx`). The unit half (`src/lib/display-name.test.ts` › U-NAME-01..04) is named.
- **Automated test plus a manual check** (the manual part is in that plan's §7.4): FR-526, FR-530 (m04 §7.4 M-3), FR-627 (m03 §7.4 "Manual v3.1"), NFR-01…06 (m12 §7.4 P0 counts and the P1–P3e / PF1–PF4 gates), NFR-07b (m04 §7.4 M-4), NFR-10 (m12 §7.4 M1 restore drill).

### 9.2 Ids cited by plan files that SPEC does not define

| Id(s) | Where | Status |
|---|---|---|
| FR-1101a … FR-1101f | m10 §1.1, §7.1, §7.3; r7 | r7 sub-rows of SPEC FR-1101 (one per home card); kept as sub-rows in §1. |
| AC-M5-a … AC-M5-d | m05 §1.1, §7.1, §7.3 | m05's own labels for the SPEC §12 M5 e2e bullets (SPEC §4.9 has no AC ids); documented in m05 line 14. Not SPEC ids. |
| PERM-01…28, NFR-01…12 (a/b/c), MASK-1…7 | all plans | r7 numbering of un-numbered SPEC rows (§3.2, §9, §3.3) — by design (r7 §A, X79). |
| NFR-07 | m00 §1.1, §5.S2.10, §7.1 | Means NFR-07b (tablet/mobile shell). Counted under NFR-07b here. |
| Other r7 families (SCAF-, UT-, TST-, GOLD-, GRID-, KEY-, A11Y-, DEP-, ACT-, GAPI-, UNDO-, FILE-, EDI-, UI-, DM-, SEED-, TPL-, PRIN-, OOS-, ARC-) | all plans | r7 ids for un-numbered SPEC items; not part of this file's required categories (v3.0 rows: r7 §F; v3.1 rows: §6 above). |

## 10. Cross-file notes found while tracing (for the implementer; none blocks a milestone)

> **Status 2026-10-30:** the orchestrator fixed these in the plan files right after tracing — schema suite path (m01 → `src/server/db/schema.int.test.ts`), world self-test path (m02 → `tests/helpers/world.int.test.ts`), NFR-07b (m00), `ensureAllProjectStatuses(tx)` (m03 §1.1, PLAN X70, HANDOFF), BR-41/FR-1009 pointers and the BR-42 row (m06), m12 perf ids (PF1–PF4 + P3b), FR-210 test file (m01). The row-key prefix reuse, duplicate basenames and r7 rows-file notes remain informational.

- **Schema test path (m01 vs the rest).** m01 §5.S4.10 writes the M1 schema checks (T-SCHEMA-01…05) to `tests/integration/schema.int.test.ts`; M0 creates and M2–M8 extend `src/server/db/schema.int.test.ts`. Either name works, but two schema suites will exist — when implementing M1, prefer extending `src/server/db/schema.int.test.ts` (the M0 file) or record the split in PROGRESS › Decisions.
- **World self-test path (m02 vs the rest).** m02 §5.S0.14 ("Test helpers (`tests/helpers/**`)") writes its world self-test to `tests/authz/world.int.test.ts`; m01 and m03–m10 extend `tests/helpers/world.int.test.ts`. Same risk: two files; use `tests/helpers/world.int.test.ts`.
- **NFR-07 vs NFR-07b (m00).** m00 says "NFR-07 (part)"; r7 and every other plan use NFR-07b for the tablet/mobile clause.
- **FR-621 helper name (m03 §1.1).** The §1.1 row says `ensureProjectStatuses()` backfills older projects; m03 §5.S2.14 (and X70 in m03 §3.1, m04, m12) define the backfill as `ensureAllProjectStatuses(tx)`, with `ensureProjectStatuses(tx, projectId)` being the per-project call used by `createProject`. PLAN/HANDOFF mention only `ensureProjectStatuses`.
- **BR-41 pointer (m06 §1.2).** m06's out-of-scope row sends `overload.ts (BR-40/41/45)` to "M7 (day level) · M9 (week level)"; m07 implements only BR-40/BR-45 at day level (X06), BR-41 (causes/excess) is M9 only. Wording only.
- **BR-42 checksum (m05 §1.2 → m06).** m05 says M6 extends `src/server/services/time-off.int.test.ts › BR-42` with an `allocations` checksum; m06 does it in §5.S2.9 but has no §1.1 row for BR-42.
- **FR-1009 pointer (m06 §1.2).** "FR-1009 buckets on `/my`, home load cards → M9 / M10": M10 consumes M9's bucket via FR-1101a (G48/M10-D13) and has no FR-1009 row — consistent, but the pointer reads as if M10 builds FR-1009.
- **Row-key prefix reuse.** m09 §7.2 uses `PG-ME`, `PG-W`, `PG-CO`, `PG-MISSING`, `PG-BADQ` (person grid, `tests/authz/rows/people.ts`) while m04 uses `PG-*` for page rows (`tests/authz/rows/pages.ts`). No key collides, but `PG-*` greps mix two files.
- **Duplicate basenames (intentional, but cite with the directory).** `allocations.int.test.ts` (repo/ and services/), `capacity.int.test.ts` (services/ and tests/golden/), `masking.int.test.ts` (src/server/services/ and tests/authz/), `milestones.int.test.ts` (repo/, services/, tests/golden/), `employees`/`positions`/`auth.int.test.ts` (src/server/** and tests/integration/ — both in m01), `holidays.test.ts`, `filter.test.ts`, `schema.test.ts`, `route.int.test.ts`, `files.test.ts`. Plan cells that give only the basename were resolved here only when the plan names one full path.
- **m12 perf ids (m12 §1.1 vs §5.S3/§7.4).** m12 §1.1 cites "§7.4 P5/P6/P7/P8 (gate)" for NFR-02b/04/05/06 and "P3 server p95" for NFR-06, but `scripts/perf-check.ts` defines only P1–P4 (+ b/c/d/e) and the browser budgets are PF1–PF6 (`e2e/perf/m12-perf.spec.ts`, m12 §5.S3.4): NFR-02b = PF1, NFR-04 = PF2, NFR-05 = PF3, NFR-06 = PF4 + P3b (search). §5 above uses the §5.S3 ids.
- **r7 rows files superseded.** r7 §G listed `tests/authz/rows/grid.ts`; the plans put grid reads in `allocations.ts` (M6 GR-*) and `grid-day.ts` (M7 GR-D-*). `leave-types.ts` (M5) and `allocations-day.ts` (M7) are new. This file follows the plans.

