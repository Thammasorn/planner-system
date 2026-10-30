# R7 — Traceability matrix (SPEC v3.0 → milestones → tests)

> Research note for the Team Working OS implementation plan · written 2026-09-30 by the r7 research agent · source of truth: `SPEC.md` v3.0 (read in full, 1 632 lines).
> Intended use: becomes `plan/traceability.md` (appendix of PLAN.md). Every requirement identifier in SPEC is a row; rows are grouped by the milestone where they are **primarily** delivered, and split requirements list what lands in which milestone. Owner decisions of 2026-09-30 applied: architecture per §7.1, **MUI** instead of Tailwind/shadcn, `@blocknote/mantine` editor chrome, local-disk uploads.

## A. How to read this matrix

- **ID families.** SPEC ids: `FR-`, `BR-`, `AC-`. Ids assigned here for un-numbered SPEC items: `PERM-01…22` (§3.2 rows in table order), `MASK-1…7` (§3.3), `AZ-1…4` (§3.4), `NFR-01…10` (§9 rows; `a/b/c` where one row holds several checks), `UT-01…09` (§11.1 modules + coverage), `TST-1…3` (§11.2/§11.4), `GOLD-F1a…F4` (§11.3), `DEP-01…16` (§10 + §12 deploy items), `KEY-01…08e` (§8.6), `GRID-01…15` (§4.8 input/delete tables), `A11Y-1…3` (§8.9; `2a/2b`), `ACT-` (§7.3), `GAPI-` (§7.4), `UNDO-` (§7.5), `FILE-` (§7.6), `EDI-` (§7.7), `UI-` (§8.1–8.8), `DM-` (§6), `SCAF-` (§12 M0), `SEED-`/`TPL-` (Appendix A/B), `PRIN-`/`OOS-` (§1.3/§1.4/§13), `ARC-` (CLAUDE.md rules).
- **Milestone(s) column.** `M6 (week) · M7 (day)` = the part in parentheses lands in that milestone. `(per §12)` = explicitly stated in SPEC §12; `(proposed)` = SPEC §12 does not place it — see §C.
- **Flags.** `[UNASSIGNED]` = SPEC §12 does not clearly place the id (proposal given). `[CONFLICT]` = §12 places it but a dependency forces a split — see §D.
- **Verification legend.** `unit` (Vitest, pure) · `property` (fast-check) · `component` (Testing Library, jsdom) · `integration` (Vitest + real Postgres, `*.int.test.ts`) · `authz-matrix` (`tests/authz/matrix.int.test.ts` + `rows/<area>.ts`) · `masking` (`tests/authz/masking.int.test.ts`, JSON leak assertions) · `golden` (`tests/golden/golden.int.test.ts`) · `e2e` (Playwright `e2e/m<N>-<slug>.spec.ts`, slugs as in PLAN.md §5) · `perf` (`scripts/perf-check.ts` / perf spec on `seed:perf` data) · `lint` (ESLint/tsc/shellcheck rules) · `review` (spec-reviewer lens) · `manual`/`script` (deploy checks).
- **Evidence tags in Notes.** `[verified …]` = seen in package source/docs or executed here (see §K); `[likely]` = strong expectation, not executed; `[uncertain]` = must be checked during implementation.
- **Test paths** follow the plan conventions: `src/domain/<module>.test.ts`, `src/lib/**/<x>.test.ts`, `src/components/**/<X>.test.tsx`, `src/server/**/<name>.int.test.ts`, `tests/authz/…`, `tests/golden/golden.int.test.ts`, `e2e/m<N>-<slug>.spec.ts`. Proposed extra domain modules: `task-tree` (BR-30…33) and `membership` (BR-60…62), because SPEC §5 says every §5 rule is a pure function with unit tests.
- **Machine-readable copies.** Full rows: `research/r7/compact.json` (required families) and `research/r7/structured_rows.json` (condensed); generator: `research/r7/gen/*.py` — edit the row files and run `python3 gen.py` to regenerate this report and re-run the completeness check against SPEC.md.

## B. Summary

- Rows: **380** (incl. 6 FR-1101 sub-rows). By family: SCAF 5, FR 118, AC 23, BR 43, PERM 22, MASK 7, AZ 4, TST 3, UT 9, GOLD 6, GRID 15, KEY 12, A11Y 4, NFR 14, DEP 16, ACT 3, GAPI 6, UNDO 5, FILE 8, EDI 6, TPL 3, UI 14, DM 18, SEED 3, PRIN 7, OOS 2, ARC 4.
- Primary milestone distribution: M0 21, M1 38, M2 32, M3 39, M4 56, M5 25, M6 66, M7 11, M8 17, M9 28, M10 14, M11 23, cross-cutting 10.
- `[UNASSIGNED]`: **31** rows · `[CONFLICT]`: **31** rows. Completeness check (§J): every SPEC FR/BR/AC id and every §3.2/§9 row is present.

### Key findings (status + evidence)
| # | Finding | Status | Evidence |
|---|---|---|---|
| F-01 | SPEC defines **112 FR**, **43 BR** (incl. BR-20a, BR-20b, BR-21a), **23 AC**, **22** §3.2 permission rows and **10** §9 NFR rows. All are rows in this matrix (completeness check at the end). | verified | `grep -oE '^\| (FR-[0-9]+)' SPEC.md` etc. (§J) |
| F-02 | The full §6.2 DDL, the §6.3 trigger and the §6.5 workload query apply cleanly on `postgres:17` (17.11, Debian, `en_US.utf8`). | verified | scratch container `r7-trace-pg17-a64f` (removed); §K.1 |
| F-03 | BR-20b trigger raises `WEEK_DAY_CONFLICT` (SQLSTATE P0001) when a DAY row is inserted beside a WEEK row of the same assignment/week; DELETE-then-INSERT in one transaction succeeds. | verified | §K.2 T2/T3 |
| F-04 | `allocations` checks reject WEEK 7.25, DAY 1.25, value 0 and a non-Monday `week_start`; `numeric(4,2)` silently rounds 0.125 → 0.13 on insert. | verified | §K.2 T4 |
| F-05 | `tasks.completed_week` (generated `date_trunc('week', completed_on::timestamp)::date`) returns the Monday (2026-10-01 and Sunday 2026-10-04 → 2026-09-28), consistent with BR-05. | verified | §K.2 T1 |
| F-06 | `time_off` exclusion constraint: overlapping ranges → 23P01 (constraint auto-named `time_off_user_id_daterange_excl`); **AM + PM half-days on the same date are also rejected**; soft-deleted rows are ignored; restoring a deleted leave that now overlaps fails with 23P01; `half` on a multi-day range violates `time_off_check1`. | verified | §K.2 T5–T7 |
| F-07 | `tasks.depth` 3, whitespace-only task names, a 2nd charter per project and a WORKSPACE page with `project_id` are all rejected by the DDL. | verified | §K.2 T8 |
| F-08 | Thai substring search: `ILIKE '%ลูกค้า%'` finds 'ย้ายข้อมูลลูกค้า' and uses the GIN trigram index (Bitmap Index Scan) under `en_US.utf8`; the similarity operator `%` does **not** match (similarity 0.278 < 0.3); in a `C`-ctype database `show_trgm('ลูกค้า')` is `{}` (index useless). | verified | §K.3 |
| F-09 | `node:22-alpine` (v22.23.3, ICU 78.3) and local Node v26.5.0 format `th-TH` identically: medium '30 ก.ย. 2569', numeric day/month '30/9', short '30 ก.ย.'; Bangkok "today" at 2026-12-31T23:30Z is '2027-01-01'. | verified | §K.4 |
| F-10 | Golden F1 total 19 500 cd holds only when the week of 2026-12-28 is included (19 250 without) → the golden query window is `[2026-08-31, 2027-01-04)`. Committed 11 625 cd verified from the JSON (task overrides + project certainty). | verified | §K.5 |
| F-11 | better-auth 1.7.6: `/sign-up/email` rejects when `emailAndPassword.disableSignUp` (sign-up.mjs:145); session defaults expiresIn 7 d / updateAge 1 d (create-context.mjs:147-148); admin `banUser` deletes all the user's sessions; admin `setUserPassword` does **not** revoke sessions; cookieCache only active when enabled; built-in rate limiter keys on (ip, path); admin plugin defaults `adminRoles: ['admin']`, `defaultRole: 'user'`. | verified | npm pack better-auth@1.7.6, §K.6 |
| F-12 | file-type 22.1.1 detects binary formats only: txt/csv/svg are not detectable and .doc/.xls/.ppt are reported as generic `cfb`; docx/xlsx/pptx/zip/pdf/png/jpg/gif/webp are detectable; package requires Node ≥ 22 and is ESM-only. | verified | npm pack file-type@22.1.1 readme lines 9, 425, 578-595; package.json engines |
| F-13 | @blocknote/core 0.55.0: no Thai locale; default blocks include every FR-521 type plus audio/video/file/image/table; `tables.headers`, `tables.cellBackgroundColor`, `tables.cellTextColor`, `tables.splitCells` all default to false; options `dictionary`, `pasteHandler`, `uploadFile` exist; Image props include previewWidth/textAlignment/caption; File block props are name/url/caption (no size). | verified | npm pack @blocknote/core@0.55.0 src/ |
| F-14 | SPEC §8.7 tokens violate §8.9: `--load-light-fg #9C6500` on `--load-light-bg #FFEB9C` and the identical tentative pair = 4.12:1 (< 4.5); `--today` on white = 3.76:1 (acceptable only for non-text); leave-type default `#94A3B8` with white text = 2.56:1. `#8F5C00` on `#FFEB9C` = 4.76:1. | verified (computed, WCAG 2.x formula) | §K.7 |
| F-15 | PLAN.md §4.4 example labels task CRUD as `PERM-13`; in §3.2 table order it is **PERM-11** (PERM-13 = assign to existing member). | verified | extraction §J |
| F-16 | Drizzle returns `numeric` as string and supports `date({ mode: 'string' })`; drizzle-kit cannot express `EXCLUDE` constraints (needs a custom SQL migration). | likely | not checked here — confirm in ORM research |
| F-17 | Better Auth default password hasher is scrypt; `revokeSessions` exists for "log out everywhere". | likely | not checked here |
| F-18 | BlockNote's checklist markdown input rule may require `[ ]` rather than `[]` (FR-532). | uncertain | not checked |

## C. Unassigned — ids SPEC §12 does not clearly place (with proposal)

| ID | Requirement | Proposed milestone(s) | Why |
|---|---|---|---|
| AC-604 | Task with Jack + Mint → plan Jack 3 days, Mint 2 days → each person page shows their own load correctly | M6 (plan via FR-612, separate assignee rows) · M9 (closure on /people/[id]) | Not placed by §12. §12 M3 lists only AC 601–603 and the AC needs FR-612 (M6) + person pages (M9). |
| BR-33 | Moving tasks across projects is not allowed in MVP | M3 (proposed) | Not placed by §12; no §4.6 FR mentions it. move/indent with a parent in another project → 400 (404 if that project is invisible). |
| BR-50 | completed_week = week of completed_on; plans in weeks after it do not count; that week and earlier count | M3 (completed_on set by FR-607) · M6 (load exclusion + completed.ts, proposed) | Not placed by §12. §12 never schedules §5.7 / the `completed` module; FR-607 (M3) refers to it but allocations exist only from M6. [verified PG17] generated column completed_week works. |
| BR-51 | Ticking done never deletes plans; un-ticking restores the load | M3 (complete/uncomplete never touches allocations) · M6 (load-return test, proposed) | Not placed by §12; see BR-50. |
| BR-52 | Ticking done with future plans → toast 'ปลดภาระ X วัน ในอีก N สัปดาห์ · เลิกทำ' | M6 (proposed) | Not placed by §12. no FR or §12 entry; needs allocations. X = Σcd in weeks > completed_week; N = number of such weeks. |
| BR-60 | Assigning a non-member (by LEAD/manager) auto-adds them as MEMBER in the same transaction | M3 (proposed, with FR-605) | Not placed by §12; no FR cites BR-60. Deactivated users cannot be assigned. membership is a proposed extra domain module. |
| BR-62 | A project always has ≥ 1 LEAD (manager-administered projects: warning, not block) | M2 (proposed, with FR-403) | Not placed by §12; no FR cites BR-62. Decision: removing/demoting the last LEAD is blocked for LEAD actors; a manager may do it and sees a warning banner. |
| UT-06 | completed: BR-50 week before/equal/after, BR-51 | M6 (proposed) | Not placed by §12. §12 never lists a `completed` module. |
| UT-09 | src/domain/** coverage ≥ 95 % | M0 (threshold config, proposed) → enforced from the first domain module | Not placed by §12. §12 does not schedule the coverage gate. |
| KEY-02 | Cmd/Ctrl+\ → collapse/expand sidebar | M2 (proposed) | Not placed by §12. State persisted in user_preferences (UI-02). |
| KEY-05 | N (outside inputs) → new task in the current context | M3 (proposed: tasks tab, /my) · M6 (grid) · M10 (home) | Not placed by §12. |
| KEY-06 | ? → show the shortcut list | M10 (proposed) | Not placed by §12. Earlier milestones register their shortcuts in a shared registry the dialog reads. |
| KEY-08c | Task list: Cmd+Enter → toggle done | M3 (proposed) | Not placed by §12; only in §8.6. |
| KEY-08e | Task list: Space → open the detail panel | M3 (proposed) | Not placed by §12; only in §8.6. Must not fire while editing the task name. |
| A11Y-1 | Never convey status by colour alone: OVER has 🔴/number, leave is striped, tentative has ◐ | M3 (list 'รอมอบหมาย', certainty badge) · M5 (calendar leave pattern) · M6 (grid ◐, stripes) · M9 (🔴 + numbers, badge count) — proposed | Not placed by §12. Component tests assert an icon/text/aria-label exists next to every colour state. |
| A11Y-2a | Grid uses role='grid' + aria-rowindex/aria-colindex (absolute indices under virtualisation) | M6 (proposed) | Not placed by §12. |
| A11Y-2b | The grid is fully usable by keyboard alone | M6 (proposed) · M7 (expand/collapse) · M8 (◆ move) | Not placed by §12. Keyboard-only runs of AC-801/805 and a keyboard path for hover-only affordances ('+ คน'). |
| A11Y-3 | Contrast ≥ 4.5:1 in light and dark themes | M0 (tokens, proposed) · M11 (audit) | Not placed by §12. [verified by computation] SPEC tokens --load-light-fg #9C6500 on --load-light-bg #FFEB9C and the tentative pair = 4.12:1 (< 4.5) → darken to e.g. #8F5C00 (4.76:1); --today #EF4444 on white = 3.76:1 (non-text only). User-chosen colours (project/client/leave type) need an automatic readable text colour. |
| NFR-07a | Browsers: Chrome, Edge, Safari — 2 latest versions | M11 (proposed) | Not placed by §12; §12 M11 only mentions performance. Edge = Chromium; Safari via an optional Playwright webkit project + manual check. |
| NFR-07b | ≥ 1280 px full UI; tablet usable; mobile = home, my tasks, report leave, read documents | M3 (/my) · M4 (read pages) · M5 (leave form) · M10 (home) · M11 (verify, proposed) | Not placed by §12. build each mobile view in its milestone; verify with mobile/tablet viewports in M11. |
| NFR-08a | Password hashing = Better Auth default | M1 (proposed) | Not placed by §12; implicitly M1. [likely] default hasher is scrypt — do not override. |
| NFR-08b | Cookies httpOnly + sameSite=lax; secure when served over HTTPS (SECURE_COOKIES) | M1 (proposed) · M11 (prod check) | Not placed by §12. Assert Set-Cookie attributes on sign-in for both SECURE_COOKIES values. |
| NFR-08c | Security headers: CSP, frame-ancestors 'none' (+ nosniff) | M0 (proposed: headers/CSP) · M4 (editor inline styles) · M11 (verify) | Not placed by §12. MUI/Emotion and BlockNote inject <style> → style-src needs 'unsafe-inline' or nonces. Smoke checks headers and no CSP console errors. |
| DEP-07 | .env.example with every variable (DATABASE_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, BETTER_AUTH_URL, SECURE_COOKIES, UPLOAD_DIR, MAX_IMAGE_MB, MAX_ATTACHMENT_MB, TZ, INITIAL_MANAGER_EMAIL/NAME/PASSWORD) | M0 (create + DB vars, proposed) · M1 (auth + initial manager) · M4 (upload vars) · M11 (final) | Not placed by §12. zod env schema fails fast at boot; .env.example kept in sync by a unit test. |
| UI-02 | Collapse sidebar (Cmd+\); remember expand/collapse per node | M2 (proposed) · M4 (page nodes) | Not placed by §12. Persist in user_preferences (CLAUDE.md), not localStorage. |
| UI-07 | Footer counts only this project vs these people's full capacity; switch 'รวมงานโปรเจคอื่นของคนเหล่านี้' (masked per §3.3) | M6 (footer) · M9 (switch, proposed) | Not placed by §12; switch. |
| UI-10 | Design tokens as CSS variables + MUI theme; dark mode redefines the same tokens | M0 (proposed) | Not placed by §12. Dark values are not in SPEC → define + test contrast pairs (A11Y-3). |
| UI-12 | Dates: full '30 ก.ย. 2569' (th-TH medium, Buddhist year); grid headers '30/9' or '30 ก.ย.' | M0 (helpers, proposed) · M5 · M6 | Not placed by §12. [verified node 22.23.3 & 26.5, ICU 78.3] medium → '30 ก.ย. 2569'; {day,month:'numeric'} → '30/9'; {day,month:'short'} → '30 ก.ย.'. Format ISODate via a UTC-anchored Date with timeZone 'UTC'. |
| UI-13 | Load numbers: 1 decimal in the grid, 2 in tooltips; 0 shows blank | M6 (proposed) · M9 · M10 | Not placed by §12. 375 cd → '3.8' (grid) / '3.75' (tooltip) — matches the §8.3 mock. Integer half-up rounding, not toFixed. |
| DM-05 | user_preferences (jsonb: unit, zoom, showCompleted, …) | M2 (proposed: sidebar state) · M3 (showCompleted) · M6 (unit, zoom) | Not placed by §12; no milestone names it. |
| SEED-A1 | seed:golden from docs/reference/golden-fixtures.json (dev password demo1234, must_change_password false; refuses NODE_ENV=production) | M1 (users, positions) · M2 (clients, projects, members) · M3 (tasks, assignments) · M6 (allocations) — proposed | Not placed by §12. §12 never schedules seed-golden, yet §11.4 runs every e2e on it → grow it with each entity. JSON is already in cd. |

## D. Placement conflicts (placed by §12, but not deliverable as written)

These are requirements that SPEC §12 *does* place, but whose placement cannot be delivered as written because a dependency lands in another milestone (or a later milestone needs an earlier helper). Each is flagged `[CONFLICT]` in the matrix; the recommended resolution should be copied into `PROGRESS.md › Decisions` at that milestone's kickoff.

| # | IDs | Problem | Recommended resolution |
|---|---|---|---|
| C-01 | BR-01, BR-02, UT-08 | `units.ts` is scheduled for M6, but `work_schedules.fraction` (M1) and capacity (M5) already need numeric ↔ cd at the repo boundary. | Create a minimal `src/domain/units.ts` (`numericToCd`, `cdToNumeric`) + tests in M1; extend with display/parse in M6. |
| C-02 | BR-06, UT-01 | `dates.ts` is scheduled for M5, but `todayBangkok()` is needed in M1 (`deactivated_on`) and M3 (`completed_on`). | Create `src/domain/dates.ts` with `todayBangkok()` (+ fake-today hook) in M1; complete the module in M5. |
| C-03 | BR-35, BR-36, UT-04 | `certainty.ts` is scheduled for M6, but FR-601 (M3) edits the override and the task panel should show BR-36's source. | Implement `certainty.ts` in M3; M6 adds the SQL coalesce parity test and grid usage. |
| C-04 | BR-20a, BR-24, BR-25 | FR-612/BR-25 (M6) writes DAY rows for edge weeks while all day-level work is "ห้ามทำ" until M7. | M6 reads/aggregates DAY weeks (⋯ marker), implements the `NEEDS_CHOICE` server contract, blocks typed totals on DAY weeks with a toast (Delete still clears); M7 adds the dialog, expand/collapse and SCALE/COLLAPSE. Record as a Decision in M6. |
| C-05 | BR-40, UT-05 | M7 asks for "overload ระดับวัน" but `overload.ts` is M9. | Implement `classify()` (BR-40 only) in M7; BR-41/BR-45 and the rest in M9. |
| C-06 | AC-203, FR-205 | Listed under M1 but the assignment picker is M3 and the grid is M6. | Verify each clause in its milestone (M1 deactivation/login, M3 picker, M6 grid label); keep an open item in PROGRESS › Known issues until M6. |
| C-07 | AC-603 | "…พร้อมแผนเดิม" (M3) needs allocations (M6). | M3 proves tasks + assignees restore; M6 adds the plan clause (integration + e2e). |
| C-08 | FR-404, BR-61 | Member removal is M2; assignments arrive in M3. | M2 ships removal; M3 adds the N-assignments check and the two choices. |
| C-09 | FR-406 | "จะปลดภาระ X วัน-คน" (M2) needs allocations (M6). | M2 archives without X; M6 adds the future-load computation to the notice. |
| C-10 | FR-303 | Client 12-week load (M2 per §4.3) needs allocations/aggregation. | M2 client page + project list; load in M9 via the workload service (PLAN.md already assumes this). |
| C-11 | FR-601, FR-613, FR-614, DM-10 | Milestone link/grouping/bulk-link belong to §4.6 (M3) but milestones are M8; the DDL has `tasks.milestone_id` → `milestones`. | M3 tasks table without `milestone_id`; M8 adds column + FK (additive migration) and the milestone UI in list/panel/bulk. |
| C-12 | FR-607 (BR-50) | "กฎภาระดู BR-50" in M3, but load exists only from M6. | M3 sets `completed_on`; M6 implements BR-50/51/52 + `completed.ts` (see unassigned list). |
| C-13 | FR-610, BR-31 | "ย้ายผู้รับผิดชอบและแผน" in M3; plans exist from M6. | Re-point `task_assignments.task_id` in M3 (allocations follow via FK); M6 adds the allocation assertions. |
| C-14 | FR-705, FR-907 | ◆ on person grid (M9) and home (M10); calendar milestones need M8. | M8 project grid + calendar; M9 person grid; M10 home. |
| C-15 | FR-409 | §12 only splits the load part to M9. | M2 info + members · M3 progress · M8 upcoming milestones · M9 loads. |
| C-16 | FR-402 | Charter auto-creation moves to M4, so projects created in M2/M3 (including seeded ones) have no charter. | M4 includes an idempotent backfill (migration or bootstrap step) creating missing charters. |
| C-17 | GOLD-F1c | F1 "OVER 0, RISK 0" needs `overload.ts` (M9). | M6 asserts totals/per-project; M9 asserts overload counts and byUserWeek. |
| C-18 | DM-01, DM-11 | `tasks_name_trgm` (M3) needs `pg_trgm`; `time_off` (M5) needs `btree_gist`. | Create all three extensions in M0's first custom migration. |
| C-19 | FR-1201 | §12 lists audit under M11 "(ถ้ายังไม่ครบ)". | Write audit rows with every mutating action from M1 on (action pattern §7.3); M11 runs a sweep/meta-test. |
| C-20 | FR-405, BR-44 | Certainty changes and archived-project exclusion affect numbers that first appear in M6. | M2 wires query-key invalidation; M6/M9 add assertions; every load query filters archived/deleted projects from M6. |
| C-21 | BR-13 | `deactivated_on` is set in M1; the capacity rule is M5. | M1 stores the date; M5 tests the rule. |

## E. Decisions to record (ambiguities discovered while tracing)

Ambiguities found while tracing (each needs a `PROGRESS.md › Decisions` row in the milestone shown; the suggested option is the simplest one consistent with SPEC §1.3):

| Milestone | Topic | Suggested decision |
|---|---|---|
| M0 | Contrast of SPEC tokens (F-14) | Darken amber foreground to `#8F5C00` (or darker) in both load-light and tentative pairs; auto text colour on user-chosen colours; record as Deviation from §8.7 values. |
| M1 | FR-106 lockout storage | Custom failed-attempt counter keyed by ip + lower(email) (small table or Better Auth `verification`), window 15 min, threshold 5. |
| M1 | FR-207 schedule fraction steps | Allow 0.25 steps (keeps capacity on the 25-cd grid). |
| M1 | PERM-01/02 outcome for workers | 403 (resources not secret), per PLAN.md §4.4. |
| M2 | BR-62 last LEAD | Block for LEAD actors; manager gets a warning banner. |
| M2 | FR-303 worker view | List and sum only projects the viewer can access. |
| M2 | FR-406 "future" | Allocations with `week_start ≥ weekStart(today)`. |
| M2 | Unimplemented tabs (FR-408) | Hide until their milestone. |
| M3 | BR-31 indent collision | Move non-colliding assignments; merge colliding users' allocations (collapse to WEEK when granularities differ) in one tx. |
| M3 | Sidebar "งานของฉัน N" | Count of my open tasks planned or due this week. |
| M3 | FR-613 multi-assignee grouping | Task shown under each assignee. |
| M3 | KEY-04 inside inputs/editor | App undo only when focus is outside text inputs/editor. |
| M4 | FR-509 charter deletion | Charter cannot be deleted. |
| M4 | FR-510 lock scope | Lock covers that page only (title/icon/content/move/delete). |
| M4 | FR-527 attachment size | Custom attachment block (or extra prop) storing size. |
| M4 | FR-531 flush on leave | keepalive fetch / sendBeacon to a route handler. |
| M4 | FR-542 takeover ordering | Previous holder flushes with its baseVersion on next heartbeat, then read-only. |
| M4 | FILE-3 text/CFB types | Extension allow-list + UTF-8/no-NUL check for csv/txt; `cfb` only with .doc/.xls/.ppt. |
| M4 | EDI-3 mention of an inaccessible page | Neutral label, no title. |
| M4 | FR-504 emoji picker | Curated built-in list (no new dependency). |
| M5 | FR-903 AM + PM same day (F-06) | Ask for a full day instead (constraint stays as specified). |
| M5 | FR-901 CSV duplicates/header/BOM | Optional header, strip BOM, duplicate date → update name. |
| M5 | PERM-21 invisible target | 404. |
| M5 | MASK-5 leave colour | Neutral colour for masked entries. |
| M6 | FR-804 fraction base | cd / 500 for week cells, cd / 100 for day cells. |
| M6 | BR-25 full week / zero capacity / per-day cap | Full = all schedule-working days in range; zero capacity → schedule weights + warning; reject if any day > 100 cd. |
| M6 | BR-27 ties | Half-up to the next 25 cd. |
| M6 | BR-24 before M7 | NEEDS_CHOICE server contract; typed totals on DAY weeks blocked with a toast until M7. |
| M6 | UI-07 switch | Defer to M9 (masked other-project totals). |
| M7 | BR-21a all-zero schedule | Equal Mon–Fri weights. |
| M7 | BR-24 SCALE over 100 cd/day | Reject SCALE with a message offering COLLAPSE. |
| M8 | FR-708 undo of unlink | Record unlinked task ids with the batch (audit before/after or batch table); restore re-links. |
| M8 | FR-707 keyboard | Focusable ◆, arrow keys move by one day/week. |
| M9 | FR-1009 grouping key | Earliest current-or-future allocation week; none → ยังไม่วางแผน. |
| M9 | BR-45 colour basis | Colour follows the selected view (all/confirmed/uncertain). |
| M9 | MASK-2 LEAD definition | Only non-archived projects count. |
| M10 | FR-1103 "ไปหน้าวันนี้" | Navigate to /home (inside a grid: scroll to today). |
| M10 | FR-1101a "this week" | Allocation in current week OR due this week. |
| M11 | DEP-04 scheduling / DEP-05 TLS | sleep-until-02:00 loop (TZ Asia/Bangkok); Caddy `tls internal` for LAN names. |

## F. The matrix, grouped by primary milestone

### M0 — Scaffold

21 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **SCAF-01** | §12 M0, §7.1 | Next.js App Router (output 'standalone'), TS strict + noUncheckedIndexedAccess, MUI (owner decision), ESLint flat + Prettier, Vitest, Playwright | M0 | lint, e2e | e2e/m0-smoke.spec.ts; eslint.config.mjs; tsconfig.json | Record Deviations at kickoff: MUI replaces Tailwind v4 + shadcn/ui; @blocknote/mantine replaces @blocknote/shadcn; cmdk installed directly. Pin Node 22 (.nvmrc/engines) — local Node is v26.5.0 [verified]. |
| **SCAF-02** | §12 M0 | Drizzle + postgres.js + drizzle-kit; docker-compose.dev.yml; scripts db:up, db:generate, db:migrate, db:studio | M0 | integration | src/server/db/schema.int.test.ts | — |
| **SCAF-03** | §12 M0 | src/i18n/th.ts, empty (app) layout + sidebar placeholder, self-hosted Thai font | M0 | e2e, lint | e2e/m0-smoke.spec.ts | — |
| **SCAF-04** | §12 M0 | `pnpm check` = typecheck + lint + unit tests (PLAN adds the integration project) | M0 → every milestone | lint | package.json | — |
| **SCAF-05** | §12 M0 | Done when: `pnpm dev` opens, `pnpm check` green, e2e smoke opens the first page | M0 | e2e, manual | e2e/m0-smoke.spec.ts | CLAUDE.md M0: scaffold in a temp dir and move files without overwriting CLAUDE.md/SPEC.md/PROGRESS.md/docs; git init; .gitignore .env node_modules .next uploads/ backups/. |
| **TST-3** | §11.4 | E2E per milestone in e2e/m<N>-*.spec.ts, all on a DB seeded with seed:golden + fixture extras | M0 (harness) → all | e2e | e2e/fixtures.ts; e2e/global-setup.ts | Depends on SEED-A1 growing with each entity. |
| **UT-09** [UNASSIGNED] | §11.1 | src/domain/** coverage ≥ 95 % | M0 (threshold config, proposed) → enforced from the first domain module | unit (coverage gate) | vitest.config.ts | UNASSIGNED: §12 does not schedule the coverage gate. |
| **A11Y-3** [UNASSIGNED] | §8.9 | Contrast ≥ 4.5:1 in light and dark themes | M0 (tokens, proposed) · M11 (audit) | unit, manual | src/lib/theme/contrast.test.ts | UNASSIGNED. [verified by computation] SPEC tokens --load-light-fg #9C6500 on --load-light-bg #FFEB9C and the tentative pair = 4.12:1 (< 4.5) → darken to e.g. #8F5C00 (4.76:1); --today #EF4444 on white = 3.76:1 (non-text only). User-chosen colours (project/client/leave type) need an automatic readable text colour. |
| **NFR-08c** [UNASSIGNED] | §9 | Security headers: CSP, frame-ancestors 'none' (+ nosniff) | M0 (proposed: headers/CSP) · M4 (editor inline styles) · M11 (verify) | e2e | e2e/m0-smoke.spec.ts; e2e/m11-deploy.spec.ts | UNASSIGNED. MUI/Emotion and BlockNote inject <style> → style-src needs 'unsafe-inline' or nonces. Smoke checks headers and no CSP console errors. |
| **NFR-09** | §9 | No CDN or external service at runtime (server may be offline) | M0 (self-hosted font, per §12) · M4 (editor assets) · M11 (verify) | e2e, lint, manual | e2e/m0-smoke.spec.ts; e2e/fixtures.ts | e2e fixture aborts and fails on any non-localhost request (all specs). M11: grep build output for external hosts; run compose on an internal-only network. |
| **DEP-07** [UNASSIGNED] | §10.3 | .env.example with every variable (DATABASE_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, BETTER_AUTH_URL, SECURE_COOKIES, UPLOAD_DIR, MAX_IMAGE_MB, MAX_ATTACHMENT_MB, TZ, INITIAL_MANAGER_EMAIL/NAME/PASSWORD) | M0 (create + DB vars, proposed) · M1 (auth + initial manager) · M4 (upload vars) · M11 (final) | unit | src/lib/env.test.ts | UNASSIGNED: zod env schema fails fast at boot; .env.example kept in sync by a unit test. |
| **DEP-16** | §12 M0 | docker-compose.dev.yml (Postgres only) + `pnpm db:up` | M0 | manual | docker/docker-compose.dev.yml | Use postgres:17 (Debian, en_US.utf8) — see FR-1105 locale finding. |
| **UI-10** [UNASSIGNED] | §8.7 | Design tokens as CSS variables + MUI theme; dark mode redefines the same tokens | M0 (proposed) | unit, manual | src/lib/theme/contrast.test.ts | UNASSIGNED. Dark values are not in SPEC → define + test contrast pairs (A11Y-3). |
| **UI-11** | §8.8 | All UI text lives in src/i18n/th.ts; code/commits/comments in English | M0 → all | lint | eslint.config.mjs (ban Thai literals /[\u0E00-\u0E7F]/ in src/app and src/components) | — |
| **UI-12** [UNASSIGNED] | §8.8, D7 | Dates: full '30 ก.ย. 2569' (th-TH medium, Buddhist year); grid headers '30/9' or '30 ก.ย.' | M0 (helpers, proposed) · M5 · M6 | unit | src/lib/format/thai-date.test.ts | UNASSIGNED. [verified node 22.23.3 & 26.5, ICU 78.3] medium → '30 ก.ย. 2569'; {day,month:'numeric'} → '30/9'; {day,month:'short'} → '30 ก.ย.'. Format ISODate via a UTC-anchored Date with timeZone 'UTC'. |
| **UI-14** | §8.8 | Font IBM Plex Sans Thai or Noto Sans Thai, self-hosted via next/font/local | M0 (per §12) | e2e | e2e/m0-smoke.spec.ts | — |
| **DM-01** | §6.2 | Extensions pgcrypto, pg_trgm, btree_gist | M0 | integration | src/server/db/schema.int.test.ts | Custom SQL migration. pg_trgm is needed by M3 (tasks_name_trgm), btree_gist by M5 (time_off exclusion) — create all in M0. [verified] full §6.2 DDL + §6.3 trigger + §6.5 query apply cleanly on postgres:17.11. |
| **DM-18** | §6.1 | Principles: uuid ids (Better Auth text), deleted_at + deleted_batch for undoable tables, fractional-index `position`, drizzle-kit generate (no hand edits except custom trigger/extension migrations) | M0 → all | review, lint | — | — |
| **ARC-01** | CLAUDE.md, §5 | src/domain is pure TS (no DB/Next/React imports; no JS Date for plan dates) | M0 (lint rules) → all | lint | eslint.config.mjs | — |
| **ARC-02** | CLAUDE.md | No `any`, `@ts-ignore`, `eslint-disable` without a reason comment | M0 → all | lint | eslint.config.mjs | — |
| **ARC-03** | CLAUDE.md | No localStorage for real data (small UI prefs only, preferably user_preferences) | M0 → all | lint, review | eslint.config.mjs (no-restricted-globals) | — |

**Parts of other rows that also land in M0** (primary row lives in another section): UI-01 (primary M2).

### M1 — Auth, employees, positions

38 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-101** | §4.1 | Login with email + password; no sign-up page; sign-up endpoint disabled | M1 | integration, e2e | src/server/auth.int.test.ts; e2e/m1-auth.spec.ts | [verified better-auth@1.7.6 dist/api/routes/sign-up.mjs:145] `/sign-up/email` throws BAD_REQUEST when `emailAndPassword.disableSignUp` is true. Admin `createUser` (manager path) is unaffected. |
| **FR-102** | §4.1, §10.4 | First manager is created at first deploy from INITIAL_MANAGER_* env (bootstrap) | M1 (scripts/bootstrap.ts step 1) · M11 (compose `migrate` service runs bootstrap; clean-machine login) | integration, e2e | src/server/bootstrap.int.test.ts; e2e/m11-deploy.spec.ts | Idempotent: with any user present it does nothing; missing env → no manager + clear log line, exit 0. must_change_password = true (DEP-08). |
| **FR-103** | §4.1 | Session lives 7 days and renews automatically while used | M1 | integration | src/server/auth.int.test.ts | [verified better-auth dist/context/create-context.mjs:147-148] defaults expiresIn = 7 d, updateAge = 1 d (sliding). Set both explicitly in config; test expiresAt ≈ now+7d after sign-in and that a request after updateAge extends it (fake clock). |
| **FR-104** | §4.1 | must_change_password = true → user is forced to the password page before anything else | M1 | integration, e2e | src/server/action.int.test.ts; e2e/m1-auth.spec.ts | Enforce in 3 places: (app)/layout session gate (redirect /account/password), `action()` wrapper (code MUST_CHANGE_PASSWORD), route handlers (JSON 403). Better Auth change-password/sign-out stay reachable. |
| **FR-105** | §4.1 | Change own password: old password required, new ≥ 8 chars and not equal to email | M1 | unit, integration, e2e | src/lib/schemas/account.test.ts; src/server/auth.int.test.ts; e2e/m1-auth.spec.ts | Same zod schema for form and action. Success clears must_change_password. Decision: email comparison case-insensitive. |
| **FR-106** | §4.1 | 5 failed logins within 15 min per (IP + email) → temporary rejection with message | M1 | integration, e2e | src/server/auth.int.test.ts; e2e/m1-auth.spec.ts | [verified better-auth dist/api/rate-limiter/index.mjs:245] built-in limiter keys on (ip, path) and counts every request → insufficient. Implement a failed-attempt counter keyed by ip + lower(email) around /sign-in/email (hook) — may need a small table → record in Decisions. Needs a trusted client IP (X-Forwarded-For from proxy). Tests: 5 failures → 6th rejected even with the right password; other email same IP OK; after 15 min OK. |
| **FR-107** | §4.1 | 'Log out all devices' from own account page | M1 | integration, e2e | src/server/auth.int.test.ts; e2e/m1-auth.spec.ts | Two browser contexts in e2e: revoke from A → B's next navigation lands on /login. [likely] Better Auth `revokeSessions` endpoint for the current user. |
| **FR-201** | §4.2 | Manager creates employee: full name, nickname, email, position, system role, initial password, work schedule | M1 | integration, authz-matrix, e2e | src/server/services/employees.int.test.ts; tests/authz/rows/employees.ts; e2e/m1-auth.spec.ts | One transaction: Better Auth admin createUser + app columns + work_schedules rows + audit. [verified better-auth dist/plugins/admin/admin.mjs:14-15] admin plugin defaults adminRoles ['admin'], defaultRole 'user' → configure roles manager/worker (adminRoles must exist in `roles`, lines 18-19). |
| **FR-202** | §4.2 | Initial password typed or generated ('สุ่มรหัส', 12 chars), shown once with a copy button | M1 | unit, e2e | src/lib/auth/random-password.test.ts; e2e/m1-auth.spec.ts | crypto RNG, unambiguous alphabet; the plaintext is never persisted nor returned by any later GET. |
| **FR-203** | §4.2 | Checkbox 'force change on first login', default on | M1 | integration, e2e | src/server/services/employees.int.test.ts; e2e/m1-auth.spec.ts | — |
| **FR-204** | §4.2 | Manager resets an employee password → all their sessions revoked + must change password | M1 | integration, authz-matrix | src/server/services/employees.int.test.ts; tests/authz/rows/employees.ts | [verified better-auth admin setUserPassword (routes.mjs ~804-838) only re-hashes; it does NOT revoke sessions] → service must also call revokeUserSessions and set must_change_password = true. |
| **FR-205** [CONFLICT] | §4.2 | Deactivate instead of delete: no login, hidden from assignment pickers, plan history kept; can reactivate | M1 (ban/unban + deactivated_on) · M3 (assignee picker excludes) · M6 (grid still shows plans with 'ปิดใช้งาน') | integration, e2e | src/server/services/employees.int.test.ts; src/server/services/assignments.int.test.ts; src/server/services/grid.int.test.ts; e2e/m1-auth.spec.ts; e2e/m3-tasks.spec.ts; e2e/m6-grid.spec.ts | Better Auth admin banUser/unbanUser + app `deactivated_on` (BR-13). Existing assignments/allocations are kept. |
| **FR-206** | §4.2 | Cannot deactivate or demote the last manager; cannot deactivate oneself | M1 | integration | src/server/services/employees.int.test.ts | Count active managers inside the transaction (SELECT … FOR UPDATE) to avoid a race between two managers. |
| **FR-207** | §4.2 | Work schedule: working weekdays + fraction per day (default Mon–Fri 1.00) for part-timers | M1 (UI + work_schedules rows) · M5 (consumed by capacity BR-10) | unit, integration | src/domain/capacity.test.ts; src/server/services/employees.int.test.ts | Stored numeric(3,2) → cd at the repo boundary (needs units helper already in M1, see BR-01). DB check 0 < fraction ≤ 1; no row = non-working day. Decision: allowed steps (suggest 0.25) — SPEC silent. |
| **FR-208** | §4.2 | CRUD positions (name, order); deleting a position in use is blocked | M1 | integration, authz-matrix, e2e | src/server/services/positions.int.test.ts; tests/authz/rows/positions.ts; e2e/m1-auth.spec.ts | Order = fractional index text. Positions have no soft delete → P2 undo implemented as re-create (Decision). |
| **FR-209** | §4.2 | Employee list: search name/nickname, filter by position, show active status | M1 | integration, e2e | src/server/services/employees.int.test.ts; e2e/m1-auth.spec.ts | This is settings/employees (manager). A worker-facing /people directory (sidebar 'ทีมงาน') arrives with M9 visibility rules. |
| **FR-210** | §4.2 | Display name = nickname if present else full name; hover shows full name + position | M1 (helper + UserName component, reused everywhere) | unit, component | src/lib/users/display-name.test.ts; src/components/people/UserName.test.tsx | — |
| **AC-101** | §4.1 | Visiting / without login → redirect to /login | M1 | e2e | e2e/m1-auth.spec.ts | After login `/` → /home (built in M10); until then redirect to a placeholder home. |
| **AC-102** | §4.1 | POST to the sign-up endpoint is rejected | M1 | integration, e2e | src/server/auth.int.test.ts; e2e/m1-auth.spec.ts | e2e: `request.post('/api/auth/sign-up/email')` → 400 (see FR-101 evidence). |
| **AC-103** | §4.1 | New worker's first login → /account/password; cannot open other pages until changed | M1 | e2e, integration | e2e/m1-auth.spec.ts; src/server/action.int.test.ts | Also assert a direct URL and a server action call are both blocked. |
| **AC-104** | §4.1 | Deactivated employee cannot log in and existing sessions drop immediately | M1 | integration, e2e | src/server/services/employees.int.test.ts; e2e/m1-auth.spec.ts | [verified better-auth admin routes.mjs banUser → internalAdapter.deleteUserSessions(userId)]. [verified dist/cookies/index.mjs:77] cookieCache is off unless enabled — keep it off, otherwise 'immediately' fails for up to cookieCache.maxAge (default 300 s). |
| **AC-201** | §4.2 | Manager creates worker with random password → copies it → worker logs in with it | M1 | e2e | e2e/m1-auth.spec.ts | [likely] Chromium needs context.grantPermissions(['clipboard-read','clipboard-write']) to read the copied value. |
| **AC-202** | §4.2 | Re-opening the create-employee page does not show the random password again | M1 | e2e | e2e/m1-auth.spec.ts | — |
| **AC-203** [CONFLICT] | §4.2 | Deactivate Cindy → Cindy not in assignment picker, but Cindy's old plans still in grid with 'ปิดใช้งาน' label | M1 (deactivate, labels in employee list) · M3 (picker clause) · M6 (grid clause) | e2e, integration | e2e/m1-auth.spec.ts; e2e/m3-tasks.spec.ts; e2e/m6-grid.spec.ts; src/server/services/grid.int.test.ts | CONFLICT: §12 lists AC-203 under M1 but the picker (M3) and grid (M6) do not exist yet → close each clause in its milestone; track in PROGRESS › Known issues. Grid uses GridResponse.people[].deactivatedOn. |
| **PERM-01** | §3.2 | Create/edit/deactivate employees; set/reset passwords — «สร้าง/แก้/ปิดใช้งานพนักงาน, ตั้ง/รีเซ็ตรหัสผ่าน» — expect M allow · L 403 · Me 403 · W 403 | M1 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/employees.ts | Actions: createEmployee, updateEmployee, deactivate/reactivate, resetPassword. Workers get 403 (employee directory is not secret). |
| **PERM-02** | §3.2 | Manage positions, holidays, leave types — «จัดการตำแหน่ง, วันหยุด, ประเภทการลา» — expect M allow · L/Me/W 403 (reads allowed to all) | M1 (positions) · M5 (holidays, leave types) | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/positions.ts; tests/authz/rows/holidays.ts; tests/authz/rows/leave-types.ts | Reading positions/holidays/leave types stays open to every user (pickers, calendar). |
| **NFR-08a** [UNASSIGNED] | §9 | Password hashing = Better Auth default | M1 (proposed) | integration, review | src/server/auth.int.test.ts | UNASSIGNED (implicitly M1). [likely] default hasher is scrypt — do not override. |
| **NFR-08b** [UNASSIGNED] | §9 | Cookies httpOnly + sameSite=lax; secure when served over HTTPS (SECURE_COOKIES) | M1 (proposed) · M11 (prod check) | integration, e2e | src/server/auth.int.test.ts; e2e/m11-deploy.spec.ts | UNASSIGNED. Assert Set-Cookie attributes on sign-in for both SECURE_COOKIES values. |
| **DEP-08** | §10.4 | bootstrap step 1: no users + INITIAL_MANAGER_* set → create manager (must_change_password = true) | M1 (per §12) | integration | src/server/bootstrap.int.test.ts | — |
| **DEP-10** | §10.4 | bootstrap step 3: no positions → seed Project Manager, Developer, Designer, QA, Data, Business Analyst | M1 | integration | src/server/bootstrap.int.test.ts | — |
| **ACT-1** | §7.3 | `action()` wrapper: check session, check must_change_password, zod parse, map errors to {ok:false, code, message(th)} | M1 | integration | src/server/action.int.test.ts | — |
| **ACT-3** | §7.3, CLAUDE.md | Any service writing several tables runs in one transaction | M1 → all | integration | per-service *.int.test.ts (failure injection: throw after the first insert → no partial rows) | — |
| **DM-02** | §6.2 | Enums certainty, granularity, project_role, page_space, half_day | M1–M6 (each with its first table) | integration | src/server/db/schema.int.test.ts | — |
| **DM-03** | §6.2 | Better Auth tables (user, session, account, verification) + user columns role, banned, ban_reason, nickname, position_id, must_change_password, color, deactivated_on | M1 | integration | src/server/auth.int.test.ts | Better Auth ids are text; app tables use uuid (§6.1). |
| **DM-04** | §6.2 | positions | M1 | integration | src/server/services/positions.int.test.ts | — |
| **DM-06** | §6.2 | work_schedules (weekday 1–7, fraction numeric(3,2) > 0 ≤ 1; no row = day off) | M1 | integration | src/server/services/employees.int.test.ts | — |
| **DM-14** | §6.2 | audit_log | M1 (first audited entity) | integration | src/server/audit.int.test.ts | — |
| **SEED-A1** [UNASSIGNED] | App. A.1, §11.4 | seed:golden from docs/reference/golden-fixtures.json (dev password demo1234, must_change_password false; refuses NODE_ENV=production) | M1 (users, positions) · M2 (clients, projects, members) · M3 (tasks, assignments) · M6 (allocations) — proposed | integration, golden | tests/golden/golden.int.test.ts; e2e/global-setup.ts | UNASSIGNED: §12 never schedules seed-golden, yet §11.4 runs every e2e on it → grow it with each entity. JSON is already in cd. |

**Parts of other rows that also land in M1** (primary row lives in another section): FR-1201 (primary M11), BR-01 (primary M6), BR-02 (primary M6), BR-06 (primary M5), BR-13 (primary M5), AZ-1 (primary M2), AZ-2 (primary M2), UT-01 (primary M5), UT-08 (primary M6), DEP-07 (primary M0), DEP-11 (primary M5), PRIN-P5 (primary cross-cutting).

### M2 — Clients, projects, members, permissions

32 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-301** | §4.3 | CRUD clients: name (unique), code, colour, note | M2 | integration, authz-matrix, e2e | src/server/services/clients.int.test.ts; tests/authz/rows/clients.ts; e2e/m2-projects.spec.ts | Map unique violation 23505 → Thai message. There is no client delete in SPEC (archive only, FR-302). |
| **FR-302** | §4.3 | Archive client → hidden from project-creation picker; existing projects unaffected | M2 | integration, e2e | src/server/services/clients.int.test.ts; e2e/m2-projects.spec.ts | Reversible (unarchive) → undo toast, no confirm. |
| **FR-303** [CONFLICT] | §4.3 | Client page: the client's projects + total load (person-days) over the next 12 weeks | M2 (page + project list) · M9 (12-week load, proposed) | integration, authz-matrix, e2e | src/server/services/clients.int.test.ts; src/server/services/workload.int.test.ts; tests/authz/rows/clients.ts; e2e/m2-projects.spec.ts; e2e/m9-workload.spec.ts | CONFLICT: §12 gives all of §4.3 to M2 but load needs allocations (M6) → propose M9 (reuse workload aggregation). Decision: workers see/sum only projects they can access (PERM-04). Window = weekStart(today) … +12 weeks. |
| **FR-401** | §4.4 | Manager creates project: name, client (optional), code, colour, certainty (default CONFIRMED), LEAD | M2 | integration, authz-matrix, e2e | src/server/services/projects.int.test.ts; tests/authz/rows/projects.ts; e2e/m2-projects.spec.ts | One transaction: project + LEAD member row + audit (+ charter page from M4, FR-402). |
| **FR-403** | §4.4 | Members: add via picker (search name/nickname/position), change LEAD/MEMBER, remove | M2 | integration, authz-matrix, e2e | src/server/services/members.int.test.ts; tests/authz/rows/members.ts; e2e/m2-projects.spec.ts | Picker excludes deactivated users. |
| **FR-404** [CONFLICT] | §4.4 | Removing a member who still has assignments → toast 'มีงานที่มอบหมายอยู่ N งาน' with: unassign all / cancel removal | M2 (removal) · M3 (assignment check + choices, BR-61) | integration, e2e | src/server/services/members.int.test.ts; e2e/m3-tasks.spec.ts | CONFLICT: task_assignments arrive in M3. Decision: count assignments on non-deleted, incomplete tasks. 'Unassign all' uses one deleted_batch → undoable. |
| **FR-405** [CONFLICT] | §4.4 | Changing project certainty updates numbers on every screen without reload | M2 (edit + query-key invalidation) · M6 (grid) · M9 (workload/person) | e2e, integration | e2e/m6-grid.spec.ts; e2e/m9-workload.spec.ts; src/server/services/grid.int.test.ts | Invalidate TanStack Query keys ['grid',…], ['workload',…], ['home',…] after updateProject. Same tab only (no realtime). |
| **FR-406** [CONFLICT] | §4.4 | Archive project: if future plans exist, notice 'จะปลดภาระ X วัน-คน ในอนาคต', then archive (reversible) | M2 (archive/unarchive, hidden from sidebar) · M6 (X from future allocations) | integration, authz-matrix, e2e | src/server/services/projects.int.test.ts; src/server/services/allocations.int.test.ts; tests/authz/rows/projects.ts; e2e/m2-projects.spec.ts; e2e/m6-grid.spec.ts | CONFLICT: X needs allocations (M6). It is a notice + undo toast, not a confirm dialog (P2). Decision: 'future' = week_start ≥ current week. Note BR-44 also removes past load of archived projects. |
| **FR-407** | §4.4 | Permanent delete: manager only, must type the project name (the only confirm dialog) | M2 (· M4 adds disk-file cleanup) | integration, authz-matrix, e2e | src/server/services/projects.int.test.ts; tests/authz/rows/projects.ts; e2e/m2-projects.spec.ts | Hard delete cascades rows; files rows cascade but UPLOAD_DIR objects do not → delete them from M4 on. audit_log.project_id has no FK, so history survives. |
| **FR-408** | §4.4 | Project page tabs: ภาพรวม · แผนงาน · งาน · เอกสาร | M2 (shell + overview) · M3 (งาน) · M4 (เอกสาร) · M6 (แผนงาน) | e2e | e2e/m2-projects.spec.ts; e2e/m3-tasks.spec.ts; e2e/m4-pages.spec.ts; e2e/m6-grid.spec.ts | Decision: tabs not yet implemented are hidden until their milestone. |
| **FR-409** [CONFLICT] | §4.4 | Overview tab: project info, members + each member's load in this project, upcoming milestones, progress (done/total tasks), weekly load bars (12 weeks) | M2 (info, members) · M3 (progress) · M8 (upcoming milestones) · M9 (member load + 12-week bars, per §12) | integration, e2e | src/server/services/overview.int.test.ts; e2e/m2-projects.spec.ts; e2e/m3-tasks.spec.ts; e2e/m8-milestones.spec.ts; e2e/m9-workload.spec.ts | §12 only moves the load part to M9; progress (M3) and milestones (M8) are inferred splits. |
| **BR-62** [UNASSIGNED] | §5.8 | A project always has ≥ 1 LEAD (manager-administered projects: warning, not block) | M2 (proposed, with FR-403) | unit, integration, e2e | src/domain/membership.test.ts; src/server/services/members.int.test.ts; e2e/m2-projects.spec.ts | UNASSIGNED (no FR cites BR-62). Decision: removing/demoting the last LEAD is blocked for LEAD actors; a manager may do it and sees a warning banner. |
| **PERM-03** | §3.2 | Create/edit/archive clients — «สร้าง/แก้/archive ลูกค้า» — expect M allow · L/Me/W 403 | M2 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/clients.ts | — |
| **PERM-04** | §3.2 | View clients — «ดูลูกค้า» — expect M all · L/Me only clients of their projects · W (no project with that client) 404 | M2 (· M10 search) | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/clients.ts; tests/authz/rows/search.ts | '←' in the Me column means same as L. Client list filtered; unrelated client detail → 404. |
| **PERM-05** | §3.2 | Create project — «สร้างโปรเจค» — expect M allow · L/Me/W 403 | M2 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/projects.ts | D1: manager only. |
| **PERM-06** | §3.2 | See project in list / open project — «เห็นโปรเจคในลิสต์ / เปิดโปรเจค» — expect M allow · L allow · Me allow · W 404 | M2 → every later project-scoped read (M3 tasks, M4 pages/files, M6 grid, M8 milestones, M9 overview load) | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/projects.ts; tests/authz/rows/tasks.ts; tests/authz/rows/pages.ts; tests/authz/rows/grid.ts; tests/authz/rows/milestones.ts | §12 M2 e2e: worker does not see a non-member project in list and direct URL = 404. Sidebar and search must omit it too. |
| **PERM-07** | §3.2 | Edit project info (name, client, colour, certainty) — «แก้ข้อมูลโปรเจค (ชื่อ, ลูกค้า, สี, ความแน่นอน)» — expect M allow · L allow · Me 403 · W 404 | M2 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/projects.ts | — |
| **PERM-08** | §3.2 | Add/remove members, change LEAD/MEMBER — «เพิ่ม/ลบสมาชิก, เปลี่ยน LEAD/MEMBER» — expect M allow · L allow · Me 403 · W 404 | M2 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/members.ts | — |
| **PERM-09** | §3.2 | Archive project — «Archive โปรเจค» — expect M allow · L allow · Me 403 · W 404 | M2 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/projects.ts | — |
| **PERM-10** | §3.2 | Permanently delete project — «ลบโปรเจคถาวร» — expect M allow · L 403 · Me 403 · W 404 | M2 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/projects.ts | — |
| **MASK-7** | §3.3, §3.4 | Masking always happens on the server; hidden names never reach the client even if the UI hides them | M2 (masking helper, per §12) → M5, M6, M9, M10 endpoints | masking, review | tests/authz/masking.int.test.ts | M2 skeleton covers sidebar/project list; each later milestone adds its read endpoints. |
| **AZ-1** | §3.4 | Authorization lives only in src/server/authz.ts (never UI-only checks) | M1 (requireUser, requireManager) · M2 (requireProject) → all | review, authz-matrix | tests/authz/matrix.int.test.ts | — |
| **AZ-2** | §3.4 | Every server action and route handler calls authz before touching data | M1 → all | authz-matrix | tests/authz/matrix.int.test.ts | Add a coverage meta-test: enumerate exports of src/server/actions/** and src/app/api/**/route.ts; each needs ≥ 1 matrix row. |
| **AZ-3** | §3.4 | Resources the user may not see → 404, never 403 | M2 → all | authz-matrix | tests/authz/matrix.int.test.ts | — |
| **AZ-4** | §3.4, §11.2 | Every §3.2 row has table-driven tests | M2 (harness) → rows added in each milestone | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/*.ts | — |
| **TST-1** | §11.2 | Authorization table-driven: every §3.2 row × every role → allow / 404 / forbidden | M2 (harness, per §12) → every milestone adds rows | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/*.ts | — |
| **KEY-02** [UNASSIGNED] | §8.6 | Cmd/Ctrl+\ → collapse/expand sidebar | M2 (proposed) | component, e2e | src/components/ui/Sidebar.test.tsx; e2e/m2-projects.spec.ts | UNASSIGNED. State persisted in user_preferences (UI-02). |
| **UI-01** | §8.1 | Sidebar: search ⌘K, home, my tasks (count), workload (OVER badge), calendar, projects (+ for manager) with sub-links and page tree, ◐ tentative marker, wiki (+), 🔒, team, clients, settings (manager), user + logout | M0 (placeholder) · M2 (real projects) · M4 (page trees, wiki) · M9 (badge) · M10 (search entry) | component, e2e | src/components/ui/Sidebar.test.tsx; e2e/m2-projects.spec.ts; e2e/m4-pages.spec.ts; e2e/m9-workload.spec.ts | 'งานของฉัน 5' count meaning is unspecified → Decision in M3 (suggest: my open tasks planned or due this week). |
| **UI-02** [UNASSIGNED] | §8.1 | Collapse sidebar (Cmd+\); remember expand/collapse per node | M2 (proposed) · M4 (page nodes) | component, e2e | src/components/ui/Sidebar.test.tsx; e2e/m2-projects.spec.ts | UNASSIGNED. Persist in user_preferences (CLAUDE.md), not localStorage. |
| **UI-03** | §8.1 | Archived projects hidden from the sidebar; 'ดูโปรเจคที่ archive' link at the end | M2 | e2e | e2e/m2-projects.spec.ts | — |
| **DM-05** [UNASSIGNED] | §6.2 | user_preferences (jsonb: unit, zoom, showCompleted, …) | M2 (proposed: sidebar state) · M3 (showCompleted) · M6 (unit, zoom) | integration | src/server/db/schema.int.test.ts | UNASSIGNED (no milestone names it). |
| **DM-08** | §6.2 | clients, projects, project_members | M2 | integration | src/server/services/clients.int.test.ts; src/server/services/projects.int.test.ts; src/server/services/members.int.test.ts | — |

**Parts of other rows that also land in M2** (primary row lives in another section): FR-1201 (primary M11), BR-61 (primary M3), TST-2 (primary M9), KEY-03 (primary M3), DM-02 (primary M1), SEED-A1 (primary M1), PRIN-P2 (primary cross-cutting), PRIN-P5 (primary cross-cutting).

### M3 — Tasks

39 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-601** [CONFLICT] | §4.6 | Task fields: name (only required), notes, start, due, certainty override, linked milestone, multiple assignees, done | M3 (all except milestone) · M8 (milestone link) | integration, e2e | src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts; e2e/m8-milestones.spec.ts | [verified PG17] DB rejects whitespace-only names. tasks.milestone_id references milestones (M8) → create tasks without the column in M3 and add it in M8 (additive migration) — Decision. |
| **FR-602** | §4.6 | Quick add '+ เพิ่มงาน…': type a name + Enter → created; cursor stays for the next one | M3 | component, e2e | src/components/tasks/TaskList.test.tsx; e2e/m3-tasks.spec.ts | Optimistic insert; fractional position after the last sibling. |
| **FR-603** | §4.6 | Outliner: Tab indents under the row above, Shift+Tab outdents; max 3 levels | M3 | unit, integration, e2e | src/domain/task-tree.test.ts; src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts | Indenting under an assigned task triggers the BR-31 move (FR-610). |
| **FR-604** | §4.6 | Drag to reorder and to nest under another task | M3 | integration, e2e | src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts | Validate same project (BR-33), depth (BR-30), no cycles. |
| **FR-605** | §4.6 | Assignees: person-cell picker (search name/nickname/position), multi-select; remove with × on chip | M3 | integration, authz-matrix, e2e | src/server/services/assignments.int.test.ts; tests/authz/rows/assignments.ts; e2e/m3-tasks.spec.ts | × soft-deletes the assignment (its plans drop out of every query) → undo toast. Picker for a MEMBER actor lists project members only; for LEAD/manager all active employees (auto-invite BR-60). |
| **FR-606** | §4.6 | Tasks without assignees show 'รอมอบหมาย' (never hidden) | M3 | component, e2e | src/components/tasks/TaskList.test.tsx; e2e/m3-tasks.spec.ts | — |
| **FR-607** [CONFLICT] | §4.6 | Tick done → strikethrough; hidden when 'แสดงงานที่เสร็จแล้ว' is off; load rule BR-50 | M3 (UI, completed_on = todayBangkok, showCompleted pref) · M6 (load effect) | integration, e2e, unit | src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts; src/domain/completed.test.ts | showCompleted lives in user_preferences (DM-05). |
| **FR-608** | §4.6 | Ticking a parent with open children → toast 'ติ๊กงานย่อยทั้งหมดด้วยไหม' [ติ๊กทั้งหมด] | M3 | integration, e2e | src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts | — |
| **FR-609** | §4.6 | Delete (Delete key on selected row or menu) removes subtasks too → toast 'ลบ 'X' และงานย่อย 3 งานแล้ว · เลิกทำ' | M3 | integration, e2e | src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts | — |
| **FR-610** [CONFLICT] | §4.6 | Adding a subtask to a task that has assignees/plans moves them to the new child (BR-31) + toast with undo | M3 (assignments) · M6 (plans verified) | integration, e2e | src/server/services/tasks.int.test.ts; src/server/services/allocations.int.test.ts; e2e/m3-tasks.spec.ts | Re-point task_assignments.task_id; allocations follow via FK. Undo = move back (custom undo entry, not batch restore). |
| **FR-611** | §4.6 | Task detail panel slides from the right (~440 px, does not cover content); Esc closes; URL ?task=<id> | M3 | component, e2e | src/components/tasks/TaskPanel.test.tsx; e2e/m3-tasks.spec.ts | ?task=<id> for an inaccessible project → 404 payload (no task name leak). |
| **FR-613** [CONFLICT] | §4.6 | List view: group by none / assignee / milestone / certainty; sort manual / due date | M3 · M8 (group by milestone) | component, e2e | src/components/tasks/TaskList.test.tsx; e2e/m3-tasks.spec.ts; e2e/m8-milestones.spec.ts | Decision: a multi-assignee task appears under each assignee group. |
| **FR-614** [CONFLICT] | §4.6 | Multi-select (Shift/Cmd+click) → bulk delete, done, assign, link milestone | M3 · M8 (bulk milestone link) | integration, e2e | src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts; e2e/m8-milestones.spec.ts | Bulk delete = one deleted_batch = one undo. |
| **AC-601** | §4.6 | Typing 3 task names with Enter, no mouse → 3 tasks | M3 | e2e | e2e/m3-tasks.spec.ts | — |
| **AC-602** | §4.6 | Select row 2 + Tab → child of row 1; indenting beyond level 3 does nothing | M3 | e2e, unit | e2e/m3-tasks.spec.ts; src/domain/task-tree.test.ts | Build 3 levels first, then try a 4th. |
| **AC-603** [CONFLICT] | §4.6 | Delete a parent with 3 children → all 4 gone → undo → all back with their original plans | M3 (tasks + assignees) · M6 (plans clause) | e2e, integration | e2e/m3-tasks.spec.ts; src/server/services/tasks.int.test.ts; src/server/services/allocations.int.test.ts | CONFLICT: 'พร้อมแผนเดิม' needs allocations (M6); M3 proves tasks + assignees come back. |
| **BR-30** | §5.4 | Tasks nest at most 3 levels (depth 0, 1, 2) | M3 | unit, integration, e2e | src/domain/task-tree.test.ts; src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts | [verified PG17] check rejects depth 3. Subtree moves: depth(parent)+1+height(subtree) ≤ 2. task-tree is a proposed extra domain module (§5 says every §5 rule is a pure fn). |
| **BR-31** [CONFLICT] | §5.4 | Assignees and plans live on leaf tasks only; parents show the sum; adding a child to an assigned task moves assignees + plans to it | M3 (assignments) · M6 (plans + parent totals FR-805) | unit, integration, e2e | src/domain/task-tree.test.ts; src/server/services/tasks.int.test.ts; src/server/services/allocations.int.test.ts | Server rejects assigning to a non-leaf. Decision needed: Tab-indenting a task that already has assignees under an assigned parent (unique active (task,user) collision) — suggest moving non-colliding assignments and merging colliding users' allocations (collapse to WEEK when granularities differ) in one tx. |
| **BR-32** | §5.4 | Deleting a task soft-deletes it and all descendants with one deleted_batch; undo restores that batch only | M3 | integration, e2e | src/server/services/tasks.int.test.ts; e2e/m3-tasks.spec.ts | Assignments/allocations stay but drop out via `t.deleted_at is null` joins (§6.5). Same batch pattern for pages (M4), leave (M5), milestones (M8), assignments (M3). |
| **BR-33** [UNASSIGNED] | §5.4, D10 | Moving tasks across projects is not allowed in MVP | M3 (proposed) | integration, authz-matrix | src/server/services/tasks.int.test.ts; tests/authz/rows/tasks.ts | UNASSIGNED (no §4.6 FR mentions it): move/indent with a parent in another project → 400 (404 if that project is invisible). |
| **BR-60** [UNASSIGNED] | §5.8, §3.1 | Assigning a non-member (by LEAD/manager) auto-adds them as MEMBER in the same transaction | M3 (proposed, with FR-605) | unit, integration, authz-matrix | src/domain/membership.test.ts; src/server/services/assignments.int.test.ts; tests/authz/rows/assignments.ts | UNASSIGNED (no FR cites BR-60). Deactivated users cannot be assigned. membership is a proposed extra domain module. |
| **BR-61** [CONFLICT] | §5.8 | Removing a member first requires cancelling their assignments in that project (FR-404) | M2 (member removal) · M3 (assignment check + choices) | integration, e2e | src/server/services/members.int.test.ts; e2e/m3-tasks.spec.ts | — |
| **PERM-11** | §3.2 | Create/edit/delete/complete tasks — «สร้าง/แก้/ลบ/ติ๊กเสร็จ task» — expect M allow · L allow · Me allow · W 404 | M3 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/tasks.ts | Includes move/indent, bulk actions and restoreTaskBatch (restore re-checks, UNDO-5). NOTE: PLAN.md §4.4 example labels this row 'PERM-13' — in table order it is PERM-11. |
| **PERM-13** | §3.2 | Assign a task to an existing member — «มอบหมายงานให้สมาชิกเดิม» — expect M allow · L allow · Me allow · W 404 | M3 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/assignments.ts | — |
| **PERM-14** | §3.2 | Assign to a non-member (auto-invite) — «มอบหมายงานให้คนที่ยังไม่เป็นสมาชิก (auto-invite)» — expect M allow · L allow · Me 403 · W 404 | M3 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/assignments.ts | Assert the member row exists only on allow (BR-60, same tx). |
| **KEY-03** | §8.6 | Esc → close panel/dialog | M3 (task panel FR-611) · M2 (dialogs) | e2e | e2e/m3-tasks.spec.ts; e2e/m2-projects.spec.ts | — |
| **KEY-04** | §8.6 | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z → undo / redo | M3 (undo stack) · M6 (grid) | unit, e2e | src/lib/undo/undo-stack.test.ts; e2e/m3-tasks.spec.ts; e2e/m6-grid.spec.ts | Do not hijack Cmd+Z inside text inputs or the BlockNote editor (own history) — Decision. |
| **KEY-05** [UNASSIGNED] | §8.6 | N (outside inputs) → new task in the current context | M3 (proposed: tasks tab, /my) · M6 (grid) · M10 (home) | e2e | e2e/m3-tasks.spec.ts; e2e/m6-grid.spec.ts; e2e/m10-home-search.spec.ts | UNASSIGNED. |
| **KEY-08a** | §8.6 | Task list: Enter → next task | M3 (FR-602) | e2e | e2e/m3-tasks.spec.ts | — |
| **KEY-08b** | §8.6 | Task list: Tab / Shift+Tab → indent / outdent | M3 (FR-603) | e2e | e2e/m3-tasks.spec.ts | — |
| **KEY-08c** [UNASSIGNED] | §8.6 | Task list: Cmd+Enter → toggle done | M3 (proposed) | e2e, component | e2e/m3-tasks.spec.ts; src/components/tasks/TaskList.test.tsx | UNASSIGNED (only in §8.6). |
| **KEY-08d** | §8.6 | Task list: Delete → delete task | M3 (FR-609) | e2e | e2e/m3-tasks.spec.ts | — |
| **KEY-08e** [UNASSIGNED] | §8.6 | Task list: Space → open the detail panel | M3 (proposed) | e2e, component | e2e/m3-tasks.spec.ts; src/components/tasks/TaskList.test.tsx | UNASSIGNED (only in §8.6). Must not fire while editing the task name. |
| **UNDO-1** | §7.5 | Client undo stack per tab, 50 entries of {label, undo(), redo()} | M3 (per §12) | unit | src/lib/undo/undo-stack.test.ts | A new push clears redo; the 51st push drops the oldest. |
| **UNDO-3** | §7.5 | Deletes (task, page, milestone, leave, assignment) return deleted_batch; undo = restore*(batch) | M3 (task, assignment) · M4 (page) · M5 (leave) · M8 (milestone) | integration, e2e | src/server/services/tasks.int.test.ts; src/server/services/pages.int.test.ts; src/server/services/time-off.int.test.ts; src/server/services/milestones.int.test.ts | — |
| **UNDO-4** | §7.5 | 'เลิกทำ' toast stays 8 s and is clickable; Cmd+Z works anytime in the tab | M3 | component, e2e | src/components/ui/UndoToast.test.tsx; e2e/m3-tasks.spec.ts | sonner duration 8000. |
| **UNDO-5** | §7.5 | restore* re-checks authorization every time and works within 30 days | M3 → M4, M5, M8 | authz-matrix, integration | tests/authz/rows/tasks.ts; src/server/services/tasks.int.test.ts | 31-day-old batch → rejected. Automatic purge is Phase 2 (§13 #9) — only refuse. |
| **DM-11** | §6.2 | tasks (+ generated completed_week, tasks_name_trgm) | M3 | integration | src/server/db/schema.int.test.ts; src/server/services/tasks.int.test.ts | [verified] generated column works on PG17. |
| **DM-12** | §6.2 | task_assignments (version; unique active (task_id, user_id)) | M3 | integration | src/server/services/assignments.int.test.ts | — |

**Parts of other rows that also land in M3** (primary row lives in another section): FR-205 (primary M1), FR-404 (primary M2), FR-408 (primary M2), FR-409 (primary M2), FR-1009 (primary M9), FR-1201 (primary M11), AC-203 (primary M1), BR-04 (primary M5), BR-06 (primary M5), BR-35 (primary M6), BR-36 (primary M6), BR-43 (primary M9), BR-50 (primary M6), BR-51 (primary M6), PERM-06 (primary M2), UT-04 (primary M6), A11Y-1 (primary M6), NFR-07b (primary M11), DM-02 (primary M1), DM-05 (primary M2), DM-16 (primary M4), SEED-A1 (primary M1), PRIN-P1 (primary cross-cutting), PRIN-P2 (primary cross-cutting).

### M4 — Notion-like pages

56 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-402** | §4.4, App. B | Creating a project auto-creates its Project Charter page from the template | M4 (moved by §12) | integration, e2e | src/server/services/projects.int.test.ts; src/server/services/pages.int.test.ts; e2e/m4-pages.spec.ts | Projects created in M2/M3 have no charter → M4 needs a one-off backfill (migration or bootstrap step) — Decision. [verified PG17] unique index one_charter_per_project rejects a 2nd charter. Decision: the charter cannot be deleted (SPEC silent). |
| **FR-501** | §4.5.1 | Two page spaces: WORKSPACE (team wiki) and PROJECT | M4 | integration, authz-matrix | src/server/services/pages.int.test.ts; tests/authz/rows/pages.ts; tests/authz/rows/wiki.ts | [verified PG17] check `(space='PROJECT') = (project_id is not null)` rejects a WORKSPACE page with project_id. |
| **FR-502** | §4.5.1 | Nested sub-pages up to 10 levels | M4 | unit, integration | src/lib/pages/tree.test.ts; src/server/services/pages.int.test.ts | DB depth 0..9. Moving a subtree: depth(target)+1+height(subtree) ≤ 9; no cycles. |
| **FR-503** | §4.5.1 | Sidebar page tree: expand/collapse, drag to reorder, drag to re-parent within the same space | M4 | integration, component, e2e | src/server/services/pages.int.test.ts; src/components/pages/PageTree.test.tsx; e2e/m4-pages.spec.ts | Server rejects moves across spaces/projects. Lazy-load children per expanded node (5 000 pages target). |
| **FR-504** | §4.5.1 | Page has emoji icon, optional cover image, title, content; breadcrumb | M4 | component, e2e | e2e/m4-pages.spec.ts | Emoji picker = new library? Decision (a curated built-in list avoids a dependency). Cover image = files (kind IMAGE) via pages.cover_file_id. |
| **FR-505** | §4.5.1 | Page URL /p/[pageId] for both spaces (shareable) | M4 | e2e, authz-matrix | e2e/m4-pages.spec.ts; tests/authz/rows/pages.ts | Outsider opening a PROJECT page URL → 404. |
| **FR-506** | §4.5.1 | Create page via sidebar '+', '+' beside a parent, or typing /หน้า in content (creates sub-page + inserts link) | M4 | e2e, integration | e2e/m4-pages.spec.ts; src/server/services/pages.int.test.ts | — |
| **FR-507** | §4.5.1, App. B | Template choice on create: ว่าง · Project Charter · บันทึกการประชุม · คู่มือ/SOP | M4 | unit, e2e | src/lib/editor/templates.test.ts; e2e/m4-pages.spec.ts | — |
| **FR-508** | §4.5.1 | Duplicate a page with its sub-pages | M4 | integration | src/server/services/pages.int.test.ts | Deep copy in one tx; remap `subpage` block pageIds in copied content to the new children; images keep the same file ids (same space/project, so file authz still holds). |
| **FR-509** | §4.5.1 | Delete page → sub-pages deleted too → undo toast | M4 | integration, e2e | src/server/services/pages.int.test.ts; e2e/m4-pages.spec.ts | One deleted_batch. Parent's sub-page card then shows 'หน้านี้ถูกลบแล้ว' (EDI-2). |
| **FR-510** | §4.5.1 | Manager locks a wiki page → workers read-only; padlock icon | M4 | integration, authz-matrix, e2e | src/server/services/pages.int.test.ts; tests/authz/rows/wiki.ts; e2e/m4-pages.spec.ts | Not the same as the edit lock (FR-540, page_locks). Decision: lock covers that page's title/icon/content/move/delete; children not locked (SPEC silent). |
| **FR-520** | §4.5.2 | Slash menu with Thai names, searchable in English (/ตาราง or /table) | M4 | unit, e2e | src/lib/editor/slash-menu.test.ts; e2e/m4-pages.spec.ts | [verified @blocknote/core@0.55.0 src/i18n/locales] no Thai dictionary ships → author one (editor option `dictionary`, verified BlockNoteEditor.ts:102) + custom slash items with English aliases. |
| **FR-521** | §4.5.2 | Text blocks: paragraph, H1–H3, bullet, numbered, checklist, toggle, quote, code, divider | M4 | e2e | e2e/m4-pages.spec.ts | [verified 0.55.0 defaultBlockSpecs] all exist (paragraph, heading, bulletListItem, numberedListItem, checkListItem, toggleListItem, quote, codeBlock, divider). audio/video blocks also exist → drop from schema (not allowed by §7.6). |
| **FR-522** | §4.5.2 | Inline styles: bold, italic, underline, strike, inline code, link, text colour, background colour | M4 | e2e | e2e/m4-pages.spec.ts | — |
| **FR-523** | §4.5.2 | Tables: add/remove rows & columns, header row, column resize, cell background colour | M4 | e2e | e2e/m4-pages.spec.ts | [verified 0.55.0 BlockNoteEditor.ts:276-300, 446-449] `tables.headers` and `tables.cellBackgroundColor` default to false → enable both. |
| **FR-524** | §4.5.2, §7.7 | Paste from Excel / Google Sheets → a table block (not a blob of text) | M4 | unit, e2e | src/lib/editor/paste-table.test.ts; e2e/m4-pages.spec.ts | [verified] editor option `pasteHandler` exists (BlockNoteEditor.ts:210). Handle text/html <table> and multi-row multi-column TSV. |
| **FR-525** | §4.5.2 | Images: paste from clipboard, drag & drop, or choose via /รูป | M4 | e2e, integration | e2e/m4-pages.spec.ts; src/server/services/files.int.test.ts | [verified] editor option `uploadFile` exists → POST /api/files. |
| **FR-526** | §4.5.2 | Image: resize by dragging edge, align left/centre/right, caption | M4 | e2e, manual | e2e/m4-pages.spec.ts | [verified 0.55.0 Image block props] previewWidth, textAlignment, caption. |
| **FR-527** | §4.5.2 | Attachments (PDF, Word, Excel, PowerPoint, ZIP) as a card with name + size; click to download | M4 | integration, e2e | src/server/services/files.int.test.ts; e2e/m4-pages.spec.ts | [verified 0.55.0 File block propSchema = name, url, caption — no size] → custom attachment block or extra prop (Decision). See FILE-3 for type detection limits. |
| **FR-528** | §4.5.2, §7.7 | Sub-page block: Notion-like link card to a child page, created from /หน้า | M4 | component, e2e | src/components/editor/SubpageBlock.test.tsx; e2e/m4-pages.spec.ts | — |
| **FR-529** | §4.5.2, §7.7 | Mention: type @ → pick an employee or a page → clickable chip | M4 | integration, e2e | src/server/services/search.int.test.ts; e2e/m4-pages.spec.ts | Page suggestions must respect page visibility (no titles of inaccessible project pages). Employee names are not secret. |
| **FR-530** | §4.5.2 | Drag blocks to reorder via the left handle | M4 | manual, e2e | e2e/m4-pages.spec.ts | BlockNote side menu (built in). |
| **FR-531** | §4.5.2 | Autosave 800 ms after typing stops and when leaving; status 'กำลังบันทึก… / บันทึกแล้ว' | M4 | unit, e2e | src/lib/editor/autosave.test.ts; e2e/m4-pages.spec.ts | 'On leave': flush on route change + pagehide via keepalive fetch / sendBeacon to a route handler (server actions do not survive unload) — Decision. |
| **FR-532** | §4.5.2 | Markdown shortcuts: #, -, 1., [], >, ``` | M4 | e2e | e2e/m4-pages.spec.ts | [uncertain] confirm BlockNote's checklist input rule accepts `[]` (may require `[ ]`); add a custom input rule if not. |
| **FR-540** | §4.5.3, §7.7 | While someone edits, others see 'Cindy กำลังแก้หน้านี้' and open read-only | M4 | integration, e2e | src/server/services/page-locks.int.test.ts; e2e/m4-pages.spec.ts | — |
| **FR-541** | §4.5.3 | Edit lock expires after 2 minutes without heartbeat | M4 | integration | src/server/services/page-locks.int.test.ts | Heartbeat every 30 s (§7.7). Compute expiry in SQL (now() + interval '2 minutes'); tests move expires_at into the past instead of sleeping. |
| **FR-542** | §4.5.3 | 'แก้ต่อจากนี้' takes over the lock → previous holder sees a banner and goes read-only after flushing pending changes | M4 | integration, e2e | src/server/services/page-locks.int.test.ts; e2e/m4-pages.spec.ts | Decision on ordering: previous holder learns via next heartbeat (≤ 30 s) → flushes with its baseVersion (accepted only if still current) → read-only. |
| **FR-543** | §4.5.3 | Every save sends `version`; on conflict nothing is overwritten and a 'มีการแก้ไขใหม่กว่า' banner offers reload | M4 | integration, e2e | src/server/services/pages.int.test.ts; e2e/m4-pages.spec.ts | UPDATE … WHERE id = $1 AND version = $base RETURNING version + 1. |
| **AC-501** | §4.5 | Create page → /ตาราง → 3×3 table → add a column → reload keeps it | M4 | e2e | e2e/m4-pages.spec.ts | — |
| **AC-502** | §4.5 | Copy 4×3 cells from Excel → paste → 4×3 table block with matching data | M4 | e2e, unit | e2e/m4-pages.spec.ts; src/lib/editor/paste-table.test.ts | e2e dispatches a paste event with an Excel-style text/html + text/plain TSV DataTransfer. |
| **AC-503** | §4.5 | PrintScreen then paste → image shows and survives reload; non-member worker opening the image URL → 404 | M4 | e2e, integration, authz-matrix | e2e/m4-pages.spec.ts; src/server/services/files.int.test.ts; tests/authz/rows/files.ts | §12: clipboard image via page.evaluate + DataTransfer(File image/png). |
| **AC-504** | §4.5 | Type /หน้า in the charter → sub-page appears under the charter in the sidebar and a link card in content | M4 | e2e | e2e/m4-pages.spec.ts | — |
| **AC-505** | §4.5 | Cindy edits a page; Ivy opens it → Ivy sees 'Cindy กำลังแก้' and cannot edit | M4 | e2e | e2e/m4-pages.spec.ts | Two browser contexts; use a page both can open (e.g. POS charter — Cindy LEAD, Ivy member via assignment in golden data). |
| **PERM-16** | §3.2 | View/create/edit/delete project pages — «ดู/สร้าง/แก้/ลบ หน้าเอกสารในโปรเจค» — expect M allow · L allow · Me allow · W 404 | M4 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/pages.ts; tests/authz/rows/files.ts | Covers /api/files upload/download for project pages and /api/pages/:id/lock. |
| **PERM-17** | §3.2 | View team wiki pages — «ดูหน้า wiki ทีม» — expect all allow | M4 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/wiki.ts | — |
| **PERM-18** | §3.2 | Create/edit team wiki pages — «สร้าง/แก้หน้า wiki ทีม» — expect all allow; locked page: M allow, workers 403 | M4 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/wiki.ts | Two rows: unlocked vs locked page (FR-510). |
| **PERM-19** | §3.2 | Lock/unlock team wiki pages — «ล็อก/ปลดล็อกหน้า wiki ทีม» — expect M allow · workers 403 | M4 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/wiki.ts | — |
| **FILE-1** | §7.6 | POST /api/files (multipart + pageId) → authz 'edit that page' → store at UPLOAD_DIR/yyyy/mm/<uuid>.<ext> | M4 (per §12) | integration, authz-matrix | src/server/services/files.int.test.ts; tests/authz/rows/files.ts | storage.ts interface (S3-ready); temp UPLOAD_DIR per test worker. |
| **FILE-2** | §7.6 | Images: png, jpg, gif, webp ≤ 10 MB (MAX_IMAGE_MB) | M4 | unit, integration | src/lib/files/validate-upload.test.ts; src/server/services/files.int.test.ts | — |
| **FILE-3** | §7.6 | Attachments: pdf, doc(x), xls(x), ppt(x), csv, txt, zip ≤ 25 MB (MAX_ATTACHMENT_MB) | M4 | unit, integration | src/lib/files/validate-upload.test.ts; src/server/services/files.int.test.ts | [verified file-type@22.1.1 readme] text formats (txt, csv, svg) are not detectable and .doc/.xls/.ppt are only reported as generic `cfb` → Decision: accept csv/txt when detection returns undefined + allow-listed extension + valid UTF-8 without NUL; accept `cfb` only with .doc/.xls/.ppt (or add @file-type/cfbf = new dependency). |
| **FILE-4** | §7.6 | SVG is never accepted as an image (XSS) — only as an attachment | M4 | unit, integration | src/lib/files/validate-upload.test.ts; src/server/services/files.int.test.ts | Served with Content-Disposition: attachment + nosniff. |
| **FILE-5** | §7.6 | Type checked by magic bytes (file-type), never the client Content-Type | M4 | unit, integration | src/lib/files/validate-upload.test.ts; src/server/services/files.int.test.ts | Cases: PNG bytes named .pdf; EXE renamed .png (rejected). |
| **FILE-6** | §7.6 | GET /api/files/:id checks rights via page/project → 404 when not allowed | M4 | authz-matrix, integration | tests/authz/rows/files.ts; src/server/services/files.int.test.ts | AC-503. Decision: files of soft-deleted pages → 404. |
| **FILE-7** | §7.6 | Headers: nosniff; attachments Content-Disposition: attachment; images inline + Cache-Control: private, max-age=3600 | M4 | integration | src/server/services/files.int.test.ts | Call the route handler directly. RFC 5987 filename* for Thai file names. |
| **FILE-8** | §7.6 | External image URLs unsupported: pasted web images are downloaded then uploaded; otherwise inserted as a link | M4 | unit, e2e | src/lib/editor/paste-table.test.ts; e2e/m4-pages.spec.ts | The server never fetches arbitrary URLs (SSRF; offline server). |
| **EDI-1** | §7.7 | content stored as BlockNote JSON Block[] (no HTML) | M4 | integration | src/server/services/pages.int.test.ts | — |
| **EDI-2** | §7.7 | Custom block `subpage` {pageId}: live title + icon; deleted child → 'หน้านี้ถูกลบแล้ว' | M4 | component, e2e | src/components/editor/SubpageBlock.test.tsx; e2e/m4-pages.spec.ts | — |
| **EDI-3** | §7.7 | Custom inline `mention` {kind: user \| page, id}: live current name | M4 | component, e2e | e2e/m4-pages.spec.ts | Mentioned page the reader cannot open → neutral label, no title leak (Decision). |
| **EDI-4** | §7.7 | Paste handler: HTML <table> or multi-line multi-column TSV → table block; image files → upload + image block | M4 | unit, e2e | src/lib/editor/paste-table.test.ts; e2e/m4-pages.spec.ts | — |
| **EDI-5** | §7.7 | Thai slash menu: overridden titles + English aliases | M4 | unit | src/lib/editor/slash-menu.test.ts | — |
| **EDI-6** | §7.7 | Lock API: POST /api/pages/:id/lock every 30 s while editing; DELETE on exit; POST ?takeover=1 | M4 (per §12) | integration, authz-matrix | src/server/services/page-locks.int.test.ts; tests/authz/rows/pages.ts | — |
| **TPL-B1** | App. B.1 | Project Charter template (headings, info table, deliverables/team/stakeholder/risk tables, checklists) | M4 | unit | src/lib/editor/templates.test.ts | Decision: prefill the info table (client, lead, certainty) from project data on auto-create (P5). |
| **TPL-B2** | App. B.2 | Meeting-notes template | M4 | unit | src/lib/editor/templates.test.ts | — |
| **TPL-B3** | App. B.3 | Manual / SOP template | M4 | unit | src/lib/editor/templates.test.ts | — |
| **DM-09** | §6.2 | pages, page_locks, files (+ pages.cover_file_id FK, trigram indexes on pages) | M4 | integration | src/server/services/pages.int.test.ts; src/server/services/page-locks.int.test.ts; src/server/services/files.int.test.ts | — |
| **DM-16** | §6.4 | Search: pg_trgm GIN on pages.title/content_text, tasks.name, projects.name, clients.name, user.name/nickname; ILIKE + similarity() ordering; 8 per category; no tsvector; content_text built server-side incl. table cells | M3 (tasks index) · M4 (pages + content_text) · M10 (projects/clients/users indexes) | integration, unit | src/server/services/search.int.test.ts; src/lib/editor/content-text.test.ts | §6.2 DDL defines only 3 trigram indexes; §6.4 names 4 more → add them with M10. |

**Parts of other rows that also land in M4** (primary row lives in another section): FR-407 (primary M2), FR-408 (primary M2), FR-1102 (primary M10), FR-1104 (primary M10), FR-1105 (primary M10), FR-1201 (primary M11), PERM-06 (primary M2), KEY-01 (primary M10), NFR-05 (primary M11), NFR-07b (primary M11), NFR-08c (primary M0), NFR-09 (primary M0), DEP-07 (primary M0), UNDO-3 (primary M3), UNDO-5 (primary M3), UI-01 (primary M2), UI-02 (primary M2), DM-02 (primary M1), PRIN-P2 (primary cross-cutting), PRIN-P5 (primary cross-cutting).

### M5 — Calendar, holidays, leave, capacity

25 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-901** | §4.9, D9 | Manager manages company holidays: add/edit/delete one by one and import CSV (date,name) | M5 | unit, integration, authz-matrix, e2e | src/lib/csv/holidays-csv.test.ts; src/server/services/holidays.int.test.ts; tests/authz/rows/holidays.ts; e2e/m5-calendar.spec.ts | Parser shared with scripts/import-holidays.ts. Decisions: optional header, UTF-8 BOM, duplicate date → upsert name (or reject with line numbers). holidays has no deleted_at → undo = re-create. |
| **FR-902** | §4.9 | Manager manages leave types: name, colour, order (seed 4: ลาพักร้อน, ลาป่วย, ลากิจ, อบรม/สัมมนา) | M5 | integration, authz-matrix | src/server/services/leave-types.int.test.ts; tests/authz/rows/leave-types.ts | Archive (archived_at) instead of delete when referenced. Text on user-chosen colours must be auto-contrasted ([verified] default #94A3B8 with white text = 2.56:1). |
| **FR-903** | §4.9 | Employee records own leave: date range, type, full/AM/PM (half only for single day), note | M5 | unit, integration, e2e | src/lib/schemas/time-off.test.ts; src/server/services/time-off.int.test.ts; e2e/m5-calendar.spec.ts | [verified PG17] check rejects `half` on multi-day ranges; [verified] the exclusion constraint also rejects AM + PM on the same date → Decision: ask for a full day instead. |
| **FR-904** | §4.9 | No approval — leave takes effect immediately | M5 | integration, review | src/server/services/time-off.int.test.ts | Scope guard §1.4 (no approval workflow). |
| **FR-905** | §4.9 | Overlapping leave is rejected, naming the conflicting entry | M5 | integration, e2e | src/server/services/time-off.int.test.ts; e2e/m5-calendar.spec.ts | [verified PG17] raises 23P01 on constraint `time_off_user_id_daterange_excl` (auto-named → pin the name in the migration); service then queries the overlapping row for the message. Restoring a deleted leave that now overlaps also raises 23P01 [verified] → undo shows a Thai error. |
| **FR-906** | §4.9, BR-42 | After saving leave show impact: capacity X → Y and newly created overloads with fix links | M5 (capacity before/after) · M9 (new overloads + links, per §12) | integration, e2e | src/server/services/time-off.int.test.ts; src/server/services/workload.int.test.ts; e2e/m5-calendar.spec.ts; e2e/m9-workload.spec.ts | — |
| **FR-907** [CONFLICT] | §4.9 | Team calendar /calendar (month): everyone's leave (per §3.3), holidays, milestones of visible projects | M5 (leave + holidays) · M8 (milestones) | integration, masking, e2e | src/server/services/calendar.int.test.ts; tests/authz/masking.int.test.ts; e2e/m5-calendar.spec.ts; e2e/m8-milestones.spec.ts | Whose leave appears = people whose totals the viewer may see (MASK-1..3); others' label is 'ลา' only (MASK-5). |
| **FR-908** | §4.9 | Click an empty day range on the calendar → quick-create own leave | M5 | e2e | e2e/m5-calendar.spec.ts | — |
| **FR-909** | §4.9 | Delete leave → undo toast | M5 | integration, e2e | src/server/services/time-off.int.test.ts; e2e/m5-calendar.spec.ts | — |
| **BR-04** | §5.1 | Plan dates are 'YYYY-MM-DD' strings in code and DATE in DB — never JS Date | M3 (task start/due) · M5 (dates.ts) · M6+ | lint, unit, integration | src/domain/dates.test.ts; eslint.config.mjs | [likely] Drizzle `date({ mode: 'string' })` for every DATE column. Lint: no `new Date(` in src/domain except todayBangkok. |
| **BR-05** | §5.1 | Weeks start Monday; weekStart(d) = the Monday ≤ d | M5 | unit, property | src/domain/dates.test.ts | Property: isoWeekday(weekStart(d)) = 1 and 0 ≤ d − weekStart(d) ≤ 6. [verified PG17] generated column date_trunc('week', …) also yields Monday (2026-10-01 and Sunday 2026-10-04 → 2026-09-28). |
| **BR-06** [CONFLICT] | §5.1 | 'Today' is computed in Asia/Bangkok on server and client | M1 (deactivated_on) · M3 (completed_on) · M5 (dates.ts per §12) | unit, e2e | src/domain/dates.test.ts; e2e/fixtures.ts | CONFLICT: todayBangkok() is needed before M5 → add dates.ts with todayBangkok in M1 (Decision). [verified node 22.23 & 26.5] Intl en-CA + timeZone Asia/Bangkok gives '2027-01-01' at 2026-12-31T23:30Z. Server fake-today hook (APP_FAKE_TODAY) + Playwright clock for tests. |
| **BR-10** | §5.2 | dayCapacity = schedule[weekday] → 0 on company holiday → minus time off → never negative | M5 | unit | src/domain/capacity.test.ts | — |
| **BR-11** | §5.2 | weekCapacity = sum of dayCapacity over the 7 days | M5 | unit, property | src/domain/capacity.test.ts | Property: 0 ≤ weekCapacity ≤ Σschedule. |
| **BR-12** | §5.2 | Holiday on a leave day → no double deduction (day = 0) | M5 | unit | src/domain/capacity.test.ts | Table row 'holiday Fri + leave Fri' = 400. |
| **BR-13** [CONFLICT] | §5.2 | Deactivated employee: capacity 0 from the deactivation date | M1 (deactivated_on set/cleared) · M5 (rule) | unit, integration | src/domain/capacity.test.ts; src/server/services/employees.int.test.ts | Not in the §5.2 table — add explicit cases (day before = normal; on/after = 0). Decision: reactivation clears deactivated_on (no history of periods). |
| **BR-42** | §5.6, P4 | Leave only lowers capacity; the system never edits plans automatically | M5 (leave service never touches allocations) · M9 (overload surfaced + FR-906 links) | integration, review | src/server/services/time-off.int.test.ts; src/server/services/workload.int.test.ts | Test: allocation checksum unchanged after creating/deleting leave. |
| **PERM-20** | §3.2 | Create/edit/delete own leave — «บันทึก/แก้/ลบวันลาของตัวเอง» — expect all allow | M5 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/time-off.ts | — |
| **PERM-21** | §3.2 | Create/edit/delete someone else's leave — «บันทึก/แก้/ลบวันลาของคนอื่น» — expect M allow · workers 403 (404 if the target person is outside their visibility) | M5 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/time-off.ts | Decision: 404 when the worker may not see the target person at all (§3.3). |
| **MASK-5** | §3.3 | Other people's leave shows only 'ลา' (no type, no note) — except to the manager and the person | M5 (calendar) · M6 (grid timeOff label) · M9 (person grid/workload) · M10 (home) | masking | tests/authz/masking.int.test.ts | Leave-type colour also reveals the type → neutral colour for masked entries (Decision). |
| **UT-01** | §11.1 | dates: weekStart for every weekday, year boundary (28 Dec 2026 → 4 Jan 2027), todayBangkok at 23:30 UTC | M5 (· M1 todayBangkok subset) | unit, property | src/domain/dates.test.ts | vi.setSystemTime(new Date('2026-12-31T23:30:00Z')) → '2027-01-01' ([verified] formatter output). weekStart('2027-01-01') = '2026-12-28'. |
| **UT-02** | §11.1 | capacity: every row of the §5.2 table (500/300/450/300/200/400/0) | M5 | unit | src/domain/capacity.test.ts | Add BR-13 deactivation cases. |
| **DEP-09** | §10.4 | bootstrap step 2: no leave_types → seed the 4 types | M5 (leave_types table) | integration | src/server/bootstrap.int.test.ts | — |
| **DEP-11** | §10.4, D9 | bootstrap step 4: never seed holidays; the whole script is idempotent | M1 (idempotency) · M5 (holiday rule) | integration | src/server/bootstrap.int.test.ts | Run twice → identical row counts; holidays count stays 0. |
| **DM-07** | §6.2 | holidays, leave_types, time_off (+ partial exclusion constraint on daterange) | M5 | integration | src/server/db/schema.int.test.ts; src/server/services/time-off.int.test.ts | [verified PG17] exclusion + checks behave as intended. [likely] drizzle-kit cannot express EXCLUDE → custom migration. |

**Parts of other rows that also land in M5** (primary row lives in another section): FR-207 (primary M1), FR-1201 (primary M11), BR-01 (primary M6), PERM-02 (primary M1), PERM-22 (primary M9), MASK-1 (primary M9), MASK-2 (primary M9), MASK-3 (primary M9), MASK-7 (primary M2), TST-2 (primary M9), A11Y-1 (primary M6), NFR-07b (primary M11), UNDO-3 (primary M3), UNDO-5 (primary M3), UI-12 (primary M0), DM-02 (primary M1), PRIN-P2 (primary cross-cutting), PRIN-P4 (primary cross-cutting).

### M6 — Weekly planning grid

66 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-612** | §4.6, BR-25 | In the panel each assignee has 'วางแผน': total days + date range → auto-distribution (BR-25) with preview | M6 (moved by §12) | unit, integration, e2e | src/domain/allocation.test.ts; src/server/services/allocations.int.test.ts; e2e/m6-grid.spec.ts | See BR-25 decisions (full-week definition, capacity-0 range, per-day cap). |
| **FR-801** | §4.8 | Continuous timeline: horizontal scroll keeps loading weeks; 'วันนี้' jumps back | M6 | component, e2e | src/components/grid/PlanGrid.test.tsx; e2e/m6-grid.spec.ts | Windowed fetches (?from&to) merged; keep scroll anchor when prepending weeks. |
| **FR-802** | §4.8 | Two zoom levels: week columns and day columns | M6 (week) · M7 (day) | e2e | e2e/m6-grid.spec.ts; e2e/m7-daily.spec.ts | Zoom stored in user_preferences. |
| **FR-804** | §4.8, D6 | Display unit: days (default) or fraction of week (0–1) — personal preference | M6 | unit, integration, e2e | src/domain/units.test.ts; e2e/m6-grid.spec.ts | Decision: fraction = cd / 500 (standard 5-day week; matches Excel and golden-fixtures 'unit' note) for everyone; day cells in fraction mode = cd / 100. |
| **FR-805** | §4.8 | Task rows show the read-only sum of assignees; assignee rows are editable | M6 | component, e2e | src/components/grid/PlanGrid.test.tsx; e2e/m6-grid.spec.ts | — |
| **FR-806** | §4.8 | Sticky footer: total load · capacity · % utilisation of the people in the grid | M6 | integration, e2e | src/server/services/grid.int.test.ts; e2e/m6-grid.spec.ts | §8.3: counts only this project's work vs these people's full capacity; the 'include other projects' switch is UI-07. |
| **FR-807** | §4.8 | Time off as diagonal stripes + icon; holidays grey with name tooltip | M6 (week cells) · M7 (day cells) | component, e2e | src/components/grid/GridCell.test.tsx; e2e/m6-grid.spec.ts | Leave label masked per MASK-5 (GridResponse.people[].timeOff[].label). |
| **FR-808** | §4.8 | Tentative task rows: amber bar on the left + faded numbers | M6 | component | src/components/grid/GridCell.test.tsx | Must also carry ◐ (A11Y-1). |
| **FR-809** | §4.8 | Load view: all · confirmed only · uncertain part | M6 | unit, integration, e2e | src/domain/certainty.test.ts; src/server/services/grid.int.test.ts; e2e/m6-grid.spec.ts | — |
| **AC-801** | §4.8 | Select Cindy's 6 week cells → type 3 → Enter → all six = 3.0 days | M6 | e2e | e2e/m6-grid.spec.ts | Run it keyboard-only as well (A11Y-2b). |
| **AC-802** | §4.8 | Press f on a week where Peter has 2 days of leave → 3.0, not 5.0 | M6 | e2e, unit | e2e/m6-grid.spec.ts; src/domain/capacity.test.ts | Seed the F3 leave (2026-10-05..06). |
| **AC-803** | §4.8 | Copy 2×4 cells from Excel (0.5, 1 … in fraction mode) → paste → values match the chosen unit | M6 | e2e, unit | e2e/m6-grid.spec.ts; src/lib/grid/clipboard.test.ts | Synthetic paste event with text/plain TSV, or grant clipboard permissions. |
| **AC-805** | §4.8 | Edit several cells → Cmd+Z three times → values revert in order → reload shows the undone values | M6 | e2e | e2e/m6-grid.spec.ts | Undo must persist (undo = saveAllocations with previous values, UNDO-2). |
| **BR-01** [CONFLICT] | §5.1 | Internal unit = integer centi-days (100 = 1 person-day); never compute load with floats | M1 (work_schedules cd) · M5 (capacity cd) · M6 (units.ts per §12) | unit, property, review | src/domain/units.test.ts; src/domain/capacity.test.ts | CONFLICT: §12 places units.ts in M6 but cd conversion is needed in M1 (work_schedules.fraction) and M5 (capacity) → create a minimal units.ts (numericToCd/cdToNumeric) in M1 (Decision). fast-check: round-trip for every cd in [0,700]. Review lens flags parseFloat/*0.01 outside units.ts. |
| **BR-02** [CONFLICT] | §5.1 | DB numeric(4,2) person-days; convert to cd on read and back on write, only at the repo boundary | M1 (numeric(3,2) schedules) · M6 (allocations) | unit, integration | src/domain/units.test.ts; src/server/services/allocations.int.test.ts | [verified PG17] numeric(4,2) silently rounds 0.125 → 0.13 — always write cd/100 (≤ 2 decimals). Prefer string parsing ('2.50' → 250) over parseFloat. [likely] Drizzle returns numeric as string by default. |
| **BR-03** | §5.1 | APIs always send load numbers as integer cd; UI converts only for display | M6 (grid API) · M9 (workload/person API) · M10 (home) | integration | src/server/services/grid.int.test.ts; src/server/services/workload.int.test.ts | Helper walks every numeric field of GridResponse / workload JSON and asserts Number.isInteger. |
| **BR-25** | §5.3 | 'Plan N days in [start, end]': distribute daily ∝ dayCapacity (largest remainder); full weeks → WEEK rows, edge weeks → DAY rows; replaces the assignment's plan in range; preview first | M6 | unit, integration, e2e | src/domain/allocation.test.ts; src/server/services/allocations.int.test.ts; e2e/m6-grid.spec.ts | Decisions: (a) 'full week' = range covers every day with schedule > 0 of that week (a literal Mon–Sun rule would make Mon–Fri ranges never full); (b) zero-capacity range → BR-21a fallback + warning; (c) an edge week currently at WEEK must be expanded first (keep days outside the range) — BR-22-like logic lands in M6; (d) reject when any day would exceed 100 cd (BR-26) e.g. N > working days in range. |
| **BR-26** | §5.3 | Cell limits: WEEK 0 < v ≤ 700 cd, DAY 0 < v ≤ 100 cd; value 0 deletes the row | M6 (WEEK + DB checks) · M7 (DAY) | unit, integration | src/domain/units.test.ts; src/server/services/allocations.int.test.ts | [verified PG17] DB checks reject WEEK 7.25, DAY 1.25, 0, and non-Monday week_start — validate first and return a Thai message instead of a raw 23514. |
| **BR-27** | §5.3 | Typed values round to the nearest 0.25 person-day (25 cd) | M6 | unit, property | src/domain/units.test.ts | Decisions: ties (12.5 cd) round half-up; rounding happens after unit conversion (fraction × 500); a value that rounds to 0 deletes the cell. |
| **BR-35** [CONFLICT] | §5.5 | effectiveCertainty = task.override ?? parent.override ?? grandparent.override ?? project.certainty | M3 (task panel override/inheritance) · M6 (certainty.ts per §12, grid, §6.5 SQL) | unit, integration | src/domain/certainty.test.ts; src/server/services/grid.int.test.ts | CONFLICT: FR-601 (M3) edits the override and shows the inherited value → implement certainty.ts in M3 (Decision). Integration test compares the TS function with the SQL coalesce chain on one fixture. |
| **BR-36** [CONFLICT] | §5.5 | UI shows the source: 'ตั้งที่งานนี้' / 'สืบทอดจาก '<parent>'' / 'ตามโปรเจค' | M3 (task panel) · M6 (grid certaintySource) | unit, component | src/domain/certainty.test.ts; src/components/tasks/TaskPanel.test.tsx | GridRow.certaintySource: 'task' \| 'ancestor' \| 'project'. |
| **BR-37** | §5.5 | total = all plans; committed = plans whose effective certainty is CONFIRMED; atRisk = total − committed | M6 (FR-809) · M9 (FR-1003) | unit, integration, golden | src/domain/certainty.test.ts; tests/golden/golden.int.test.ts | [verified golden-fixtures.json] F1 total 19 500 cd, committed 11 625 cd. |
| **BR-50** [UNASSIGNED] | §5.7 | completed_week = week of completed_on; plans in weeks after it do not count; that week and earlier count | M3 (completed_on set by FR-607) · M6 (load exclusion + completed.ts, proposed) | unit, integration | src/domain/completed.test.ts; src/server/services/grid.int.test.ts | UNASSIGNED: §12 never schedules §5.7 / the `completed` module; FR-607 (M3) refers to it but allocations exist only from M6. [verified PG17] generated column completed_week works. |
| **BR-51** [UNASSIGNED] | §5.7 | Ticking done never deletes plans; un-ticking restores the load | M3 (complete/uncomplete never touches allocations) · M6 (load-return test, proposed) | unit, integration | src/domain/completed.test.ts; src/server/services/tasks.int.test.ts | UNASSIGNED (see BR-50). |
| **BR-52** [UNASSIGNED] | §5.7 | Ticking done with future plans → toast 'ปลดภาระ X วัน ในอีก N สัปดาห์ · เลิกทำ' | M6 (proposed) | integration, e2e | src/server/services/tasks.int.test.ts; e2e/m6-grid.spec.ts | UNASSIGNED: no FR or §12 entry; needs allocations. X = Σcd in weeks > completed_week; N = number of such weeks. |
| **PERM-12** | §3.2 | Plan (edit allocations) — «วางแผน (แก้ allocation)» — expect M allow · L allow · Me allow · W 404 | M6 (saveAllocations, FR-612) · M7 (expand/collapse/convert) | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/allocations.ts | — |
| **UT-03** | §11.1 | allocation: distribute + fast-check invariants, BR-21a, BR-22/23 totals preserved, BR-24 SCALE, BR-25 full/edge weeks, BR-27 rounding | M6 (distribute, sum invariant, BR-25, BR-27) · M7 (BR-21a, 22, 23, 24 + remaining invariants, per §12 M7) | unit, property | src/domain/allocation.test.ts | — |
| **UT-04** | §11.1 | certainty: BR-35 at every level, BR-36 source | M6 (per §12) · M3 (if pulled earlier, see BR-35) | unit | src/domain/certainty.test.ts | — |
| **UT-06** [UNASSIGNED] | §11.1 | completed: BR-50 week before/equal/after, BR-51 | M6 (proposed) | unit | src/domain/completed.test.ts | UNASSIGNED: §12 never lists a `completed` module. |
| **UT-08** | §11.1 | units: numeric ↔ cd, display in days / fraction, parse '1.5', 'f', 'h', ',5' | M6 (· M1 numeric↔cd subset) | unit, property | src/domain/units.test.ts | ',5' = 0.5 (comma decimal). 'f'/'h' resolve against the cell capacity passed in. |
| **GOLD-F1a** | §11.3 | F1 (no holidays/leave): total 195.00, committed 116.25 over 2026-08-31 … 2026-12-28 | M6 (via project-grid service/API, per §12) · M9 (via workload) | golden | tests/golden/golden.int.test.ts | [verified] 19 500 cd only when the week of 2026-12-28 is included (19 250 without) → query [2026-08-31, 2027-01-04) because weekRange is [from, to). |
| **GOLD-F1b** | §11.3 | F1 per project total/committed: POS 46.25/27.50 · DW 30.00/30.00 · Mobile 58.75/58.75 · CRM 25.00/0 · Store 35.00/0 | M6 | golden | tests/golden/golden.int.test.ts | [verified] matches golden-fixtures.json expected.F1.byProject. |
| **GRID-01** | §4.8 tables | Click a cell and type a digit → edit starts immediately (no double-click) | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | component, e2e | src/components/grid/PlanGrid.test.tsx; e2e/m6-grid.spec.ts | — |
| **GRID-02** | §4.8 tables | Enter / Tab → save and move down / right | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | component, e2e | src/components/grid/PlanGrid.test.tsx; e2e/m6-grid.spec.ts | — |
| **GRID-03** | §4.8 tables | Esc → cancel the current typing | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | component, e2e | src/components/grid/PlanGrid.test.tsx; e2e/m6-grid.spec.ts | — |
| **GRID-04** | §4.8 tables | Arrow keys move the active cell | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/lib/grid/selection.test.ts; e2e/m6-grid.spec.ts | — |
| **GRID-05** | §4.8 tables | Shift+arrows or mouse drag → range selection | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/lib/grid/selection.test.ts; e2e/m6-grid.spec.ts | — |
| **GRID-06** | §4.8 tables | Select range → type → Enter → same value in every cell (AC-801) | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/lib/grid/selection.test.ts; e2e/m6-grid.spec.ts | — |
| **GRID-07** | §4.8 tables | f → full capacity of that cell after leave/holidays (AC-802) | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/domain/units.test.ts; e2e/m6-grid.spec.ts | — |
| **GRID-08** | §4.8 tables | h → half of that cell's capacity | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/domain/units.test.ts; e2e/m6-grid.spec.ts | Round to 25 cd (BR-27) for odd capacities (e.g. part-time 0.33). |
| **GRID-09** | §4.8 tables | Drag the fill handle → copy the value across cells | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/lib/grid/fill.test.ts; e2e/m6-grid.spec.ts | — |
| **GRID-10** | §4.8 tables | Cmd+C / Cmd+V as TSV; paste from Excel (AC-803) | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/lib/grid/clipboard.test.ts; e2e/m6-grid.spec.ts | — |
| **GRID-11** | §4.8 tables | Cmd+← / Cmd+→ → shift values of the selection by ±1 column | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/lib/grid/fill.test.ts; e2e/m6-grid.spec.ts | Decision: behaviour when shifting into DAY-resolution weeks / expanded days (M7). |
| **GRID-12** | §4.8 tables | Delete / Backspace on a cell or range → clear | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | e2e | e2e/m6-grid.spec.ts | — |
| **GRID-13** | §4.8 tables | Delete on a fully selected task row → delete the task → undo toast | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | e2e | e2e/m6-grid.spec.ts | Reuses M3 deleteTask/restore. |
| **GRID-14** | §4.8 tables | × on an assignee chip → unassign + drop that person's plan → undo toast | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | e2e | e2e/m6-grid.spec.ts | Same action as FR-605 in the list (M3). |
| **GRID-15** | §4.8 tables | Cmd+Z / Cmd+Shift+Z → undo/redo every edit in this tab (max 50) | M6 (per §12 'ทุก interaction ในตาราง การกรอก และ การลบ') | unit, e2e | src/lib/undo/undo-stack.test.ts; e2e/m6-grid.spec.ts | AC-805. |
| **KEY-07** | §8.6, §4.8 | Grid shortcuts as in §4.8 (see GRID-01…15) | M6 (· M7 Cmd+↓) | e2e | e2e/m6-grid.spec.ts; e2e/m7-daily.spec.ts | — |
| **A11Y-1** [UNASSIGNED] | §8.9 | Never convey status by colour alone: OVER has 🔴/number, leave is striped, tentative has ◐ | M3 (list 'รอมอบหมาย', certainty badge) · M5 (calendar leave pattern) · M6 (grid ◐, stripes) · M9 (🔴 + numbers, badge count) — proposed | component, review | src/components/grid/GridCell.test.tsx; src/components/people/WorkloadCell.test.tsx | UNASSIGNED. Component tests assert an icon/text/aria-label exists next to every colour state. |
| **A11Y-2a** [UNASSIGNED] | §8.9 | Grid uses role='grid' + aria-rowindex/aria-colindex (absolute indices under virtualisation) | M6 (proposed) | component, e2e | src/components/grid/PlanGrid.test.tsx; e2e/m6-grid.spec.ts | UNASSIGNED. |
| **A11Y-2b** [UNASSIGNED] | §8.9 | The grid is fully usable by keyboard alone | M6 (proposed) · M7 (expand/collapse) · M8 (◆ move) | e2e | e2e/m6-grid.spec.ts; e2e/m7-daily.spec.ts; e2e/m8-milestones.spec.ts | UNASSIGNED. Keyboard-only runs of AC-801/805 and a keyboard path for hover-only affordances ('+ คน'). |
| **NFR-04** | §9 | Cell edit → visible result < 50 ms (optimistic) | M6 | e2e, perf | e2e/m6-grid.spec.ts | Measure keydown→DOM update with performance.now inside the page; no network wait. |
| **ACT-2** | §7.3 | Grid/workload reads via GET route handlers + TanStack Query; writes via server actions | M6 · M9 | review, integration | src/server/services/grid.int.test.ts; src/server/services/workload.int.test.ts | — |
| **GAPI-1** | §7.4 | GET /api/grid/project/:id?from&to&expand → GridResponse (periods, task/assignee rows, milestones, people capacity/standard/timeOff/deactivatedOn, holidays) | M6 (week) · M7 (expand + derived day cells) · M8 (milestones, lateForMilestone) | integration, authz-matrix | src/server/services/grid.int.test.ts; tests/authz/rows/grid.ts | Every allocations query bounded by week_start (DM-17). |
| **GAPI-3** | §7.4 | saveAllocations(taskAssignmentId, baseVersion, changes[], onDayWeekConflict?) → ok+version+weeks+warnings \| VERSION_CONFLICT \| NEEDS_CHOICE | M6 (· M7 NEEDS_CHOICE / SCALE / COLLAPSE) | integration, authz-matrix | src/server/services/allocations.int.test.ts; tests/authz/rows/allocations.ts | — |
| **GAPI-4** | §7.4 | Client debounces 400 ms then sends a batch; leaving the grid flushes immediately | M6 | unit | src/lib/grid/save-queue.test.ts | Fake timers. |
| **GAPI-5** | §7.4 | Optimistic update; on failure rollback + toast 'บันทึกไม่สำเร็จ · ลองใหม่' | M6 | unit, e2e | src/lib/grid/save-queue.test.ts; e2e/m6-grid.spec.ts | e2e intercepts the action request and returns 500. |
| **GAPI-6** | §7.4 | VERSION_CONFLICT → reload latest values + toast 'มีคนแก้แผนนี้พร้อมกัน — โหลดค่าล่าสุดแล้ว' | M6 | integration, e2e | src/server/services/allocations.int.test.ts; e2e/m6-grid.spec.ts | Two browser contexts editing the same assignment. |
| **UNDO-2** | §7.5 | Grid edit undo = saveAllocations with the previous values | M6 | e2e, integration | e2e/m6-grid.spec.ts; src/server/services/allocations.int.test.ts | Uses a fresh baseVersion. |
| **UI-05** | §8.3 | Single-assignee task rows are merged with their assignee row (name in the left column) | M6 | component | src/components/grid/PlanGrid.test.tsx | — |
| **UI-06** | §8.3 | '+ คน' appears when hovering a task row | M6 | e2e | e2e/m6-grid.spec.ts | Needs a keyboard equivalent (A11Y-2b). |
| **UI-07** [UNASSIGNED] | §8.3 | Footer counts only this project vs these people's full capacity; switch 'รวมงานโปรเจคอื่นของคนเหล่านี้' (masked per §3.3) | M6 (footer) · M9 (switch, proposed) | integration, masking | src/server/services/grid.int.test.ts; tests/authz/masking.int.test.ts | UNASSIGNED (switch). |
| **UI-13** [UNASSIGNED] | §8.8 | Load numbers: 1 decimal in the grid, 2 in tooltips; 0 shows blank | M6 (proposed) · M9 · M10 | unit | src/domain/units.test.ts | UNASSIGNED. 375 cd → '3.8' (grid) / '3.75' (tooltip) — matches the §8.3 mock. Integer half-up rounding, not toFixed. |
| **DM-13** | §6.2 | allocations (checks, unique (assignment, granularity, period_start), two indexes) | M6 (per §12) | integration | src/server/db/schema.int.test.ts; src/server/services/allocations.int.test.ts | [verified] checks reject out-of-range values. |
| **DM-15** | §6.3 | Trigger enforce_week_day_exclusivity on allocations | M6 (per §12) | integration | src/server/db/schema.int.test.ts | [verified] see BR-20b. |
| **DM-17** | §6.5, CLAUDE.md | Workload query (total/committed per user × week) + rule: every allocations query carries a week_start range | M6 · M9 | integration, review | src/server/services/grid.int.test.ts; src/server/services/workload.int.test.ts | [verified] query prepares on PG17. Review lens greps for unbounded allocations queries. |

**Parts of other rows that also land in M6** (primary row lives in another section): FR-205 (primary M1), FR-405 (primary M2), FR-406 (primary M2), FR-408 (primary M2), FR-607 (primary M3), FR-610 (primary M3), FR-1201 (primary M11), AC-203 (primary M1), AC-603 (primary M3), AC-604 (primary M9), BR-04 (primary M5), BR-20 (primary M7), BR-20a (primary M7), BR-20b (primary M7), BR-21 (primary M7), BR-21a (primary M7), BR-24 (primary M7), BR-31 (primary M3), BR-44 (primary M9), PERM-06 (primary M2), PERM-22 (primary M9), MASK-5 (primary M5), MASK-7 (primary M2), TST-2 (primary M9), KEY-04 (primary M3), KEY-05 (primary M3), NFR-02a (primary M11), NFR-02b (primary M11), UI-12 (primary M0), DM-02 (primary M1), DM-05 (primary M2), SEED-A1 (primary M1), PRIN-P1 (primary cross-cutting), PRIN-P2 (primary cross-cutting), PRIN-P3 (primary cross-cutting).

### M7 — Day level

11 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-803** | §4.8 | Expand selected weeks to days inline (click week header or Cmd+↓) | M7 | e2e | e2e/m7-daily.spec.ts | GET …?expand=<weekStarts> (§7.4). |
| **AC-804** | §4.8 | Expand Ivy's 2.5-day WEEK week → 0.5/day dashed → edit Wednesday to 1.0 → week = 3.0 and the other days become real values | M7 | e2e, integration | e2e/m7-daily.spec.ts; src/server/services/allocations.int.test.ts | Ivy has 2.5-day weeks in golden data (POS 09-14..09-28, CRM 10-12..11-02). Expected rows: 0.5/0.5/1.0/0.5/0.5 DAY (BR-22). |
| **BR-20** | §5.3 | WEEK resolution: exactly one WEEK row; daily values are a display-only distribution (BR-21) | M6 (WEEK rows) · M7 (derived daily display, per §12) | unit, integration | src/domain/allocation.test.ts; src/server/services/allocations.int.test.ts | — |
| **BR-20a** [CONFLICT] | §5.3 | DAY resolution: ≥ 1 DAY rows; the week total = sum of the days | M6 (read side: BR-25 edge weeks already write DAY rows; grid week total sums them) · M7 (day editing) | unit, integration | src/server/services/grid.int.test.ts; src/domain/allocation.test.ts | CONFLICT: FR-612/BR-25 (M6) produce DAY weeks before M7 → M6 grid must aggregate and mark them (⋯). |
| **BR-20b** [CONFLICT] | §5.3, §6.3 | Never WEEK and DAY in the same week of the same assignment — enforced by DB trigger | M6 (trigger ships with allocations schema, per §12 M6) · M7 (conversion flows) | integration | src/server/db/schema.int.test.ts; src/server/services/allocations.int.test.ts | [verified PG17] trigger raises `WEEK_DAY_CONFLICT` (P0001) when a DAY row is inserted beside a WEEK row; delete-then-insert in one tx succeeds. Not race-proof alone → bump task_assignments.version (UPDATE … WHERE version = $base) before writing. |
| **BR-21** [CONFLICT] | §5.3 | Distribute a WEEK value to days ∝ dayCapacity with largest remainder; exact sum; ties go to the earlier day | M6 (distribute() used by BR-25) · M7 (derived display, WEEK→DAY) | unit, property | src/domain/allocation.test.ts | fast-check: sum(distribute(t, w)) = t; parts ≥ 0; ties → lower index. SPEC sample code is float-based (t*w/sumW) → implement with integer quotient/remainder to honour BR-01. |
| **BR-21a** | §5.3 | weekCapacity = 0 → distribute by schedule only (ignore holidays/leave) and flag 'วางงานในวันที่ไม่ทำงาน' | M7 (· M6 if FR-612 reuses the fallback) | unit, integration | src/domain/allocation.test.ts; src/server/services/grid.int.test.ts | Decision: if the schedule itself sums to 0 (no working days) fall back to equal Mon–Fri weights (SPEC silent). |
| **BR-22** | §5.3 | WEEK→DAY when a day is edited: distribute (BR-21), write DAY rows (skip 0), delete WEEK row, apply the edit — one transaction | M7 | unit, integration, e2e | src/domain/allocation.test.ts; src/server/services/allocations.int.test.ts; e2e/m7-daily.spec.ts | Order DELETE then INSERT ([verified] trigger). |
| **BR-23** | §5.3 | DAY→WEEK ('กลับเป็นรายสัปดาห์'): sum DAY rows into one WEEK row and delete the DAY rows; total unchanged | M7 | unit, property, integration, e2e | src/domain/allocation.test.ts; src/server/services/allocations.int.test.ts; e2e/m7-daily.spec.ts | Always ≤ 700 cd because Σ days ≤ 7 × 100. |
| **BR-24** [CONFLICT] | §5.3 | Editing the week total of a DAY week asks (dialog): scale proportionally (largest remainder) or convert to WEEK | M6 (server NEEDS_CHOICE contract; weeks made DAY by FR-612 need a guard) · M7 (dialog + SCALE/COLLAPSE) | unit, integration, e2e | src/domain/allocation.test.ts; src/server/services/allocations.int.test.ts; e2e/m7-daily.spec.ts | CONFLICT: DAY weeks exist in M6 (BR-25 edges). Recommend: M6 implements NEEDS_CHOICE server-side and blocks typed totals on DAY weeks with a toast (Delete still clears them); M7 adds the dialog. SCALE must respect DAY ≤ 100 — Decision when scaling would exceed it. |
| **UI-08** | §8.4 | Day expansion: day headers with holiday marker, dashed derived values, '↕ รวมเป็นรายสัปดาห์' | M7 | component, e2e | src/components/grid/GridCell.test.tsx; e2e/m7-daily.spec.ts | — |

**Parts of other rows that also land in M7** (primary row lives in another section): FR-802 (primary M6), FR-807 (primary M6), BR-26 (primary M6), BR-40 (primary M9), PERM-12 (primary M6), UT-03 (primary M6), UT-05 (primary M9), KEY-07 (primary M6), A11Y-2b (primary M6), GAPI-1 (primary M6), GAPI-3 (primary M6), PRIN-P2 (primary cross-cutting), PRIN-P3 (primary cross-cutting).

### M8 — Milestones

17 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-701** | §4.7 | Milestone: name, date (day), description, done status | M8 | integration | src/server/services/milestones.int.test.ts | — |
| **FR-702** | §4.7 | LEAD/manager create from the overview tab, the grid milestone row (click a date cell) or Cmd+K | M8 | e2e, authz-matrix | e2e/m8-milestones.spec.ts; tests/authz/rows/milestones.ts | The Cmd+K command plugs into the palette shell that exists since M4. |
| **FR-703** | §4.7 | Link a task to one milestone; show progress 'เสร็จ 4/7 งาน' | M8 | integration, e2e | src/server/services/milestones.int.test.ts; e2e/m8-milestones.spec.ts | Decision: progress counts all linked non-deleted tasks. |
| **FR-704** | §4.7 | Computed status (BR-70): DONE · OVERDUE · DUE_SOON (≤ 7 days) · UPCOMING | M8 | unit | src/domain/milestone.test.ts | — |
| **FR-705** [CONFLICT] | §4.7 | ◆ on the project grid top row, person grid (projects where that person has tasks), team calendar, home | M8 (project grid, calendar) · M9 (person grid) · M10 (home) | integration, masking, e2e | src/server/services/grid.int.test.ts; src/server/services/calendar.int.test.ts; tests/authz/masking.int.test.ts; e2e/m8-milestones.spec.ts; e2e/m9-workload.spec.ts; e2e/m10-home-search.spec.ts | Only milestones of visible projects (MASK-6). |
| **FR-706** | §4.7 | 'เลย milestone' warning when a linked task has plans or due date after the milestone (BR-71) | M8 | unit, integration, e2e | src/domain/milestone.test.ts; src/server/services/grid.int.test.ts; e2e/m8-milestones.spec.ts | GridRow.lateForMilestone + flag on ◆. |
| **FR-707** | §4.7 | Drag ◆ on the grid to change its date | M8 | e2e | e2e/m8-milestones.spec.ts | Needs a keyboard path too (A11Y-2b): focusable ◆ + arrow keys (Decision). |
| **FR-708** | §4.7 | Delete milestone → linked tasks are unlinked (not deleted) → undo toast | M8 | integration, e2e | src/server/services/milestones.int.test.ts; e2e/m8-milestones.spec.ts | Soft delete does not fire the FK `on delete set null` → service nulls tasks.milestone_id itself and records the ids so restore can re-link. |
| **AC-701** | §4.7 | Milestone on 23 Oct → ◆ in the week-of-19-Oct column → in day zoom ◆ sits on Friday 23 | M8 | e2e | e2e/m8-milestones.spec.ts | Uses M7 day zoom. |
| **AC-702** | §4.7 | Linking a task planned in the week of 26 Oct → 'เลย milestone' on the task and on ◆ | M8 | e2e | e2e/m8-milestones.spec.ts | — |
| **BR-70** | §5.9 | Status: completed_on → DONE; date < today → OVERDUE; date − today ≤ 7 → DUE_SOON; else UPCOMING | M8 | unit | src/domain/milestone.test.ts | Edges: today = date → DUE_SOON; +7 → DUE_SOON; +8 → UPCOMING; −1 → OVERDUE; DONE beats OVERDUE. |
| **BR-71** | §5.9 | 'เลย milestone' if a linked open task has a WEEK plan with week_start > date, a DAY plan with period_start > date, or due_date > date | M8 | unit, integration, e2e | src/domain/milestone.test.ts; src/server/services/milestones.int.test.ts; e2e/m8-milestones.spec.ts | Literal rule: a WEEK plan in the milestone's own week never warns. Completed tasks never warn. |
| **BR-72** | §5.9 | Milestones carry no load and never affect capacity/overload | M8 (· M9 check) | integration | src/server/services/workload.int.test.ts | — |
| **PERM-15** | §3.2 | Create/edit/delete milestones — «สร้าง/แก้/ลบ milestone» — expect M allow · L allow · Me read-only (mutations 403) · W 404 | M8 | authz-matrix | tests/authz/matrix.int.test.ts; tests/authz/rows/milestones.ts | Two rows: read (Me allow) and mutate (Me 403). D3. |
| **MASK-6** | §3.3 | Milestones of inaccessible projects are not shown | M8 (calendar, project grid) · M9 (person grid) · M10 (home) | masking | tests/authz/masking.int.test.ts | — |
| **UT-07** | §11.1 | milestone: BR-70 every status (today = milestone date → DUE_SOON), BR-71 three conditions | M8 | unit | src/domain/milestone.test.ts | — |
| **DM-10** [CONFLICT] | §6.2 | milestones (+ tasks.milestone_id FK) | M8 | integration | src/server/services/milestones.int.test.ts | CONFLICT: the DDL has tasks (M3) referencing milestones → add the column + FK in M8. |

**Parts of other rows that also land in M8** (primary row lives in another section): FR-409 (primary M2), FR-601 (primary M3), FR-613 (primary M3), FR-614 (primary M3), FR-907 (primary M5), FR-1201 (primary M11), PERM-06 (primary M2), TST-2 (primary M9), A11Y-2b (primary M6), GAPI-1 (primary M6), UNDO-3 (primary M3), UNDO-5 (primary M3), PRIN-P2 (primary cross-cutting).

### M9 — Workload & person views

28 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-1001** | §4.10 | /workload: people × weeks (12 weeks from this week, scrollable), grouped by position | M9 | integration, masking, e2e | src/server/services/workload.int.test.ts; tests/authz/masking.int.test.ts; e2e/m9-workload.spec.ts | Rows limited to people the viewer may see (MASK-1..3). |
| **FR-1002** | §4.10 | Cell shows load/capacity + BR-45 colour; hover = per-project breakdown (masked per §3.3) | M9 | component, integration, masking | src/components/people/WorkloadCell.test.tsx; src/server/services/workload.int.test.ts; tests/authz/masking.int.test.ts | — |
| **FR-1003** | §4.10 | View toggle: all · confirmed only · uncertain part | M9 | integration, e2e | src/server/services/workload.int.test.ts; e2e/m9-workload.spec.ts | — |
| **FR-1004** | §4.10 | Filters: position / project / only overloaded people | M9 | integration, e2e | src/server/services/workload.int.test.ts; e2e/m9-workload.spec.ts | Project filter lists only visible projects. |
| **FR-1005** | §4.10 | Click a cell → side panel with the tasks behind the number; each links to its editor | M9 | integration, masking, e2e | src/server/services/workload.int.test.ts; tests/authz/masking.int.test.ts; e2e/m9-workload.spec.ts | Hidden projects collapse into one 'งานในโปรเจคอื่น' line. |
| **FR-1006** | §4.10 | 'รายการที่ล้น' tab: person · week · level (OVER/RISK) · excess days · cause (BR-41) · fix link | M9 | integration, golden, e2e | src/server/services/workload.int.test.ts; tests/golden/golden.int.test.ts; e2e/m9-workload.spec.ts | — |
| **FR-1007** | §4.10, §8.1 | Workload menu badge = number of OVER cells in the next 4 weeks visible to the user | M9 | integration, e2e | src/server/services/workload.int.test.ts; e2e/m9-workload.spec.ts | Show the number (non-colour cue). |
| **FR-1008** | §4.10 | /people/[id]: header (name, position, schedule) + tabs แผนงาน (person grid) · งาน · วันลา | M9 | integration, authz-matrix, masking, e2e | src/server/services/grid.int.test.ts; tests/authz/rows/people.ts; tests/authz/masking.int.test.ts; e2e/m9-workload.spec.ts | Person outside the viewer's visibility → 404. |
| **FR-1009** | §4.10 | /my: own tasks grouped this week / next week / later / unplanned; tick done here | M3 (basic list + tick, per §12) · M9 (grouping by plan) | integration, e2e | src/server/services/my-tasks.int.test.ts; e2e/m3-tasks.spec.ts; e2e/m9-workload.spec.ts | Decision: group key = earliest current-or-future allocation week of the user's assignment; no allocation → 'ยังไม่วางแผน'. |
| **AC-604** [UNASSIGNED] | §4.6 | Task with Jack + Mint → plan Jack 3 days, Mint 2 days → each person page shows their own load correctly | M6 (plan via FR-612, separate assignee rows) · M9 (closure on /people/[id]) | e2e, integration | e2e/m6-grid.spec.ts; e2e/m9-workload.spec.ts; src/server/services/grid.int.test.ts | UNASSIGNED: §12 M3 lists only AC 601–603 and the AC needs FR-612 (M6) + person pages (M9). |
| **BR-40** [CONFLICT] | §5.6 | Per person per week (or per day in day zoom): committed > cap → OVER; total > cap ≥ committed → RISK; else OK | M7 (day-level overload, per §12 M7) · M9 (overload.ts, workload) | unit, integration, golden | src/domain/overload.test.ts; src/server/services/workload.int.test.ts; tests/golden/golden.int.test.ts | CONFLICT: §12 M7 wants day-level overload but overload.ts is M9 → implement classify() (BR-40 only) in M7; BR-41/45 in M9. Boundary: load = cap → OK. |
| **BR-41** | §5.6 | Cause: standard = schedule capacity; lost = standard − cap; lost > 0 & total > standard → BOTH; lost > 0 → CAPACITY; else WORKLOAD | M9 | unit, golden | src/domain/overload.test.ts; tests/golden/golden.int.test.ts | [verified fixtures] F2, F3, F4 all expect CAPACITY. |
| **BR-43** | §5.6 | Tasks without assignees never count toward anyone's overload | M9 (· M3 'รอมอบหมาย') | integration | src/server/services/workload.int.test.ts | Structural: allocations hang off assignments; removing the last assignee removes its plans from queries. |
| **BR-44** [CONFLICT] | §5.6 | Archived or deleted projects do not count toward load | M6 (grid/footers/FR-406 queries) · M9 (workload) | integration, golden | src/server/services/grid.int.test.ts; src/server/services/workload.int.test.ts | Archive also drops past load (the §6.5 filter has no date). |
| **BR-45** | §5.6 | Cell colour by load/cap: > 1 red · 0.8–1 green · > 0 & < 0.8 yellow · 0 empty · cap = 0 grey stripes (red if load > 0) | M9 (workload) · M10 (home 8-week bars) | unit, component | src/domain/overload.test.ts; src/components/people/WorkloadCell.test.tsx | Integer comparison (load·5 vs cap·4) for the 0.8 edge; exactly 0.8 and 1.0 are green. Always paired with a non-colour cue (A11Y-1). Decision: colour follows the selected view (all/confirmed/uncertain). |
| **PERM-22** | §3.2 | View workload — «ดู workload» — expect per §3.3 (MASK-1..3) | M9 (· M5 calendar people, M6 project-grid footer, M10 home) | authz-matrix, masking | tests/authz/matrix.int.test.ts; tests/authz/rows/workload.ts; tests/authz/rows/people.ts; tests/authz/masking.int.test.ts | — |
| **MASK-1** | §3.3 | Manager: sees totals of everyone and all details | M5 (calendar) · M9 (workload/person) · M10 (home) | masking, integration | tests/authz/masking.int.test.ts; src/server/services/workload.int.test.ts | — |
| **MASK-2** | §3.3 | Worker who is LEAD of ≥ 1 project: totals of everyone (to pick helpers); details only for projects they belong to | M9 (· M5 calendar, M10 home) | masking | tests/authz/masking.int.test.ts | LEAD status evaluated per request. Decision: only non-archived projects make someone a LEAD for this rule. |
| **MASK-3** | §3.3 | Other workers: totals of self + people sharing ≥ 1 project; details only for their projects | M5 (calendar people) · M9 (workload rows, person pages) · M10 (home leave card) | masking, authz-matrix | tests/authz/masking.int.test.ts; tests/authz/rows/people.ts | Opening /people/[id] of someone outside this set → 404. |
| **MASK-4** | §3.3 | Load from projects the viewer can't access → one item 'งานในโปรเจคอื่น' with days; project/task names never sent | M9 (person grid masked row, workload hover/panel) · M9 (project-grid footer switch UI-07, proposed) | masking | tests/authz/masking.int.test.ts | GridRow kind 'masked' (§7.4). Assert JSON.stringify(body).includes(<Q project/task names>) === false. |
| **TST-2** | §11.2 | Masking: worker fetching another person's grid gets no unauthorized project name anywhere (JSON.stringify(res).includes(name) === false) | M2 (skeleton) · M5 · M6 · M8 · M9 (per §12) · M10 | masking | tests/authz/masking.int.test.ts | — |
| **UT-05** | §11.1 | overload: BR-40 every level, boundary load = cap → OK, BR-41 three causes, cap = 0 | M9 (· M7 BR-40 subset) | unit | src/domain/overload.test.ts | — |
| **GOLD-F1c** [CONFLICT] | §11.3 | F1 OVER 0, RISK 0 and every expected.F1.byUserWeek cell (total/committed/capacity) | M9 | golden | tests/golden/golden.int.test.ts | CONFLICT: 'OVER 0, RISK 0' needs overload.ts (M9); M6 asserts totals only. |
| **GOLD-F2** | §11.3 | + holiday Fri 2026-10-23 → OVER Jack and Mint, week 2026-10-19, excess 1.00, cause CAPACITY (5.0 / 4.0) | M9 (per §12) | golden | tests/golden/golden.int.test.ts | — |
| **GOLD-F3** | §11.3 | + Peter leave 2026-10-05 … 06 → OVER Peter, week 2026-10-05, excess 2.00, CAPACITY (5.0 / 3.0) | M9 (per §12) | golden | tests/golden/golden.int.test.ts | The same leave drives AC-802 in M6. |
| **GOLD-F4** | §11.3 | + Cindy leave 2026-10-12 … 14 → RISK Cindy, week 2026-10-12, excess 0.50 (total 2.5, committed 0, cap 2.0) | M9 (per §12) | golden | tests/golden/golden.int.test.ts | — |
| **GAPI-2** | §7.4 | GET /api/grid/person/:userId with masked rows ('งานในโปรเจคอื่น') | M9 (per §12) | integration, masking, authz-matrix | src/server/services/grid.int.test.ts; tests/authz/masking.int.test.ts; tests/authz/rows/people.ts | — |
| **UI-09** | §8.5 | Workload layout: view toggle, position/project filters, 'เฉพาะคนที่ล้น', tabs ตาราง \| รายการที่ล้น (n), cells '3.8/5' + 🔴 | M9 | e2e | e2e/m9-workload.spec.ts | — |

**Parts of other rows that also land in M9** (primary row lives in another section): FR-303 (primary M2), FR-405 (primary M2), FR-409 (primary M2), FR-705 (primary M8), FR-906 (primary M5), BR-03 (primary M6), BR-37 (primary M6), BR-42 (primary M5), BR-72 (primary M8), PERM-06 (primary M2), MASK-5 (primary M5), MASK-6 (primary M8), MASK-7 (primary M2), GOLD-F1a (primary M6), A11Y-1 (primary M6), NFR-03 (primary M11), ACT-2 (primary M6), UI-01 (primary M2), UI-07 (primary M6), UI-13 (primary M6), DM-17 (primary M6), PRIN-P4 (primary cross-cutting), PRIN-P6 (primary cross-cutting).

### M10 — Home & search

14 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-1101** | §4.11, §8.2 | /home (first page after login) cards: my tasks this week (tickable) · my load 8 weeks (BR-45) · milestones next 14 days · who is on leave today/this week · 8 recently edited pages · manager-only overload + team utilisation | M10 (reads data delivered earlier: pages, leave, milestones, load) | integration, masking, e2e | src/server/services/home.int.test.ts; tests/authz/masking.int.test.ts; e2e/m10-home-search.spec.ts | Sub-rows FR-1101a–f below. |
| **FR-1101a** | §4.11 | Home card: my tasks this week (tickable) | M10 (reads tasks + plans) | integration, e2e | src/server/services/home.int.test.ts; e2e/m10-home-search.spec.ts | Decision: 'this week' = assignments with an allocation in the current week OR due this week. |
| **FR-1101b** | §4.11 | Home card: my load for the next 8 weeks (small bars coloured per BR-45) | M10 (reads load data) | integration, e2e | src/server/services/home.int.test.ts; e2e/m10-home-search.spec.ts | — |
| **FR-1101c** | §4.11 | Home card: milestones in the next 14 days (visible projects only) | M10 (reads milestones) | integration, masking, e2e | src/server/services/home.int.test.ts; tests/authz/masking.int.test.ts; e2e/m10-home-search.spec.ts | — |
| **FR-1101d** | §4.11 | Home card: who is on leave today / this week | M10 (reads leave) | integration, masking, e2e | src/server/services/home.int.test.ts; tests/authz/masking.int.test.ts; e2e/m10-home-search.spec.ts | People per MASK-1..3; label per MASK-5. |
| **FR-1101e** | §4.11 | Home card: 8 most recently edited pages the user can see | M10 (reads pages) | integration, masking, e2e | src/server/services/home.int.test.ts; tests/authz/masking.int.test.ts; e2e/m10-home-search.spec.ts | — |
| **FR-1101f** | §4.11 | Home cards, manager only: people overloaded this week and next week; team utilisation % over 4 weeks | M10 (reads load data) | integration, authz-matrix, e2e | src/server/services/home.int.test.ts; tests/authz/rows/home.ts; e2e/m10-home-search.spec.ts | Worker payload must not contain these cards at all. |
| **FR-1102** | §4.11 | Cmd/Ctrl+K from every page: search projects · tasks · pages (title + content) · employees · clients | M4 (palette shell + pages, per §12) · M10 (all categories) | integration, e2e | src/server/services/search.int.test.ts; e2e/m4-pages.spec.ts; e2e/m10-home-search.spec.ts | — |
| **FR-1103** | §4.11 | Palette quick commands: create task, create page, report leave, go to today | M10 | component, e2e | src/components/ui/CommandPalette.test.tsx; e2e/m10-home-search.spec.ts | 'ไปหน้าวันนี้' is ambiguous → Decision (suggest /home; inside a grid scroll to today). Create task needs a target project (context or picker). |
| **FR-1104** | §4.11 | Search results respect §3 — nothing the user may not see | M4 (pages) · M10 (all) | authz-matrix, masking, integration | tests/authz/rows/search.ts; tests/authz/masking.int.test.ts; src/server/services/search.int.test.ts | Filter in SQL before LIMIT 8 (post-filtering would return short/leaky lists). |
| **FR-1105** | §4.11, §6.4 | Thai substring search ('ลูกค้า' finds 'ย้ายข้อมูลลูกค้า') via pg_trgm | M4 (pages) · M10 (all) | integration | src/server/services/search.int.test.ts | [verified PG17 en_US.utf8] ILIKE '%ลูกค้า%' finds the row and uses the GIN trigram index; [verified] the `%` operator does NOT match (similarity 0.278 < 0.3) → never filter by similarity; [verified] a C-ctype DB extracts no Thai trigrams → keep postgres:17's default en_US.utf8 in dev/test/prod. |
| **KEY-01** | §8.6 | Cmd/Ctrl+K → command palette | M4 (palette shell + page search, per §12 M4) · M10 (all categories + commands) | e2e, component | e2e/m4-pages.spec.ts; e2e/m10-home-search.spec.ts; src/components/ui/CommandPalette.test.tsx | — |
| **KEY-06** [UNASSIGNED] | §8.6 | ? → show the shortcut list | M10 (proposed) | component, e2e | src/components/ui/ShortcutHelp.test.tsx; e2e/m10-home-search.spec.ts | UNASSIGNED. Earlier milestones register their shortcuts in a shared registry the dialog reads. |
| **UI-04** | §8.2 | Home layout: greeting + Thai date, card grid incl. '+ เพิ่มงาน…' in the my-tasks card | M10 | e2e | e2e/m10-home-search.spec.ts | Quick add from home needs a project choice (Decision). |

**Parts of other rows that also land in M10** (primary row lives in another section): FR-705 (primary M8), BR-03 (primary M6), BR-45 (primary M9), PERM-04 (primary M2), PERM-22 (primary M9), MASK-1 (primary M9), MASK-2 (primary M9), MASK-3 (primary M9), MASK-5 (primary M5), MASK-6 (primary M8), MASK-7 (primary M2), TST-2 (primary M9), KEY-05 (primary M3), NFR-06 (primary M11), NFR-07b (primary M11), UI-01 (primary M2), UI-13 (primary M6), DM-16 (primary M4), PRIN-P6 (primary cross-cutting).

### M11 — Hardening & deploy

23 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **FR-1201** | §4.12 | Audit every change of project, member, task, assignment, plan (per batch), milestone, page (per save, no content), leave, employee | M1 (employees) · M2 (projects, members) · M3 (tasks, assignments) · M4 (pages) · M5 (leave) · M6 (plans per batch) · M8 (milestones) · M11 (sweep, per §12) | integration, authz-matrix | src/server/audit.int.test.ts; tests/authz/matrix.int.test.ts | Matrix rows that mutate and are allowed assert +1 audit_log row. Page audits never store content. M11 meta-test: every exported server action has an audit expectation. |
| **FR-1202** | §4.12 | MVP only records; no audit UI (Phase 2) | M11 | review | — | Scope guard: nothing reads audit_log in the UI. |
| **NFR-01** | §9 | Target size: ≤ 100 employees · 300 projects · 20 000 tasks · 5 000 pages · 3 years of data | M11 (seed:perf) | perf | scripts/seed-perf.ts; scripts/perf-check.ts | seed:perf generates this volume incl. ~3 years of allocations. |
| **NFR-02a** | §9 | Project grid 16 weeks × 200 rows: response < 500 ms p95 | M6 (smoke) · M11 (per §12) | perf | scripts/perf-check.ts | p95 over ≥ 50 requests against seed:perf data. |
| **NFR-02b** | §9 | Project grid 16 weeks × 200 rows: render < 300 ms | M6 (smoke) · M11 | perf, e2e | e2e/m11-perf.spec.ts | performance.mark around first grid paint after data arrives. |
| **NFR-03** | §9 | Team workload 100 people × 12 weeks < 800 ms p95 | M9 (smoke) · M11 | perf | scripts/perf-check.ts | — |
| **NFR-05** | §9 | Open a 300-block page < 1 s | M4 (smoke) · M11 | perf, e2e | e2e/m11-perf.spec.ts | — |
| **NFR-06** | §9 | Command palette: first result < 200 ms | M10 · M11 | perf, e2e | e2e/m11-perf.spec.ts; scripts/perf-check.ts | — |
| **NFR-07a** [UNASSIGNED] | §9 | Browsers: Chrome, Edge, Safari — 2 latest versions | M11 (proposed) | manual, e2e | e2e/m11-deploy.spec.ts | UNASSIGNED (§12 M11 only mentions performance). Edge = Chromium; Safari via an optional Playwright webkit project + manual check. |
| **NFR-07b** [UNASSIGNED] | §9 | ≥ 1280 px full UI; tablet usable; mobile = home, my tasks, report leave, read documents | M3 (/my) · M4 (read pages) · M5 (leave form) · M10 (home) · M11 (verify, proposed) | e2e, manual | e2e/m11-responsive.spec.ts | UNASSIGNED: build each mobile view in its milestone; verify with mobile/tablet viewports in M11. |
| **NFR-10** | §9, §10.5 | Backup: daily pg_dump kept 14 days + UPLOAD_DIR backup | M11 | manual, script | docker/backup.sh | See DEP-04, DEP-12, DEP-13. |
| **DEP-01** | §10.1–10.2 | db service: postgres:17, pgdata volume, pg_isready healthcheck, restart unless-stopped | M11 | manual, script | docker/docker-compose.yml; e2e/m11-deploy.spec.ts | — |
| **DEP-02** | §10.1–10.2 | migrate service: build target builder; `pnpm db:migrate && pnpm bootstrap`; env_file; waits for healthy db; exits | M11 | manual, script | docker/docker-compose.yml | Builder stage must contain drizzle migrations + scripts + tooling used by db:migrate. |
| **DEP-03** | §10.1–10.2 | app service: target runner (Next standalone), port 3000, uploads volume at /data/uploads, waits for migrate to complete | M11 | manual, e2e | docker/docker-compose.yml; e2e/m11-deploy.spec.ts | — |
| **DEP-04** | §10.1–10.2 | backup service: postgres:17 + backup.sh, daily 02:00, backups volume, uploads read-only, 14-day retention | M11 | manual, script | docker/docker-compose.yml; docker/backup.sh | The postgres image has no cron → sleep-until-02:00 loop in backup.sh with TZ=Asia/Bangkok (Decision). |
| **DEP-05** | §10.1–10.2 | caddy (profile tls): caddy:2, ports 80/443, Caddyfile, caddy_data; automatic HTTPS | M11 | manual | docker/Caddyfile | LAN hostname without public DNS → `tls internal` (Decision). |
| **DEP-06** | §10.2 | Named volumes pgdata, uploads, backups, caddy_data | M11 | manual | docker/docker-compose.yml | — |
| **DEP-12** | §10.5 | backup.sh: pg_dump -Fc → /backups/db-YYYYMMDD.dump + tar czf uploads-YYYYMMDD.tgz; delete files older than 14 days | M11 | manual, script, lint | docker/backup.sh | shellcheck in lint; run once inside compose and list /backups. |
| **DEP-13** | §10.5, §12 M11 | README: install, bootstrap, backup/restore (pg_restore --clean -d $DATABASE_URL + untar), upgrade | M11 | manual | README.md | Do one restore drill into scratch volumes before closing M11. |
| **DEP-14** | §10.6 | Dockerfile multi-stage deps → builder → runner (node:22-alpine, standalone + static + public, non-root, CMD node server.js) | M11 | manual, script | docker/Dockerfile | [verified] node:22-alpine = v22.23.3 with full ICU (Thai formats OK). [verified file-type@22.1.1 package.json] needs Node ≥ 22 (ESM-only). Check `id -u` ≠ 0 in the runner. |
| **DEP-15** | §12 M11 | Clean machine: `docker compose up` → login with initial manager, all e2e green, backup files really created | M11 | e2e, manual | e2e/m11-deploy.spec.ts | — |
| **SEED-A2** | App. A.2, §12 M11 | seed:demo = golden + milestones, multi-assignee DAY task, nested unassigned subtask, Peter leave, charters/pages incl. table + image, wiki manual | M11 | manual, integration | scripts/seed-demo.ts | Smoke: runs on an empty DB and is idempotent. |
| **SEED-PERF** | §12 M11, §9 | seed:perf synthetic data at NFR-01 scale | M11 | perf | scripts/seed-perf.ts | — |

**Parts of other rows that also land in M11** (primary row lives in another section): FR-102 (primary M1), A11Y-3 (primary M0), NFR-08b (primary M1), NFR-08c (primary M0), NFR-09 (primary M0), DEP-07 (primary M0).

### Cross-cutting (every milestone)

10 rows primarily delivered here.

| ID | SPEC | Requirement (EN) | Milestone(s) — what lands where | Verification | Test file(s) | Notes |
|---|---|---|---|---|---|---|
| **PRIN-P1** | §1.3 | Easy input: task needs only a name; inline edits; Excel-like grid; range fill | M3 · M6 | e2e, review | e2e/m3-tasks.spec.ts; e2e/m6-grid.spec.ts | — |
| **PRIN-P2** | §1.3 | Easy delete + undo; no confirm dialog except permanent project delete | M2–M8 | review, e2e | all e2e specs | Review lens: the only confirm dialog is the project hard-delete dialog. |
| **PRIN-P3** | §1.3 | Coarse first (weeks), fine later (days); both levels always agree | M6 · M7 | property | src/domain/allocation.test.ts | — |
| **PRIN-P4** | §1.3 | Never hide problems: leave lowers capacity, no silent re-planning | M5 · M9 | integration | src/server/services/time-off.int.test.ts; src/server/services/workload.int.test.ts | — |
| **PRIN-P5** | §1.3 | Zero setup: Mon–Fri default, projects CONFIRMED, charter on create | M1 · M2 · M4 | integration | src/server/services/employees.int.test.ts; src/server/services/projects.int.test.ts; src/server/services/pages.int.test.ts | — |
| **PRIN-P6** | §1.3 | One page answers the main questions (home; manager sees who is overloaded within one click) | M9 · M10 | e2e | e2e/m9-workload.spec.ts; e2e/m10-home-search.spec.ts | — |
| **PRIN-P7** | §1.3 | No custom fields, automation or rule engine | all | review | — | — |
| **OOS-1** | §1.4 | Out of scope: time tracking, approvals, chat, file drive, HR, dependencies/Gantt, custom fields/multi-status, multi-tenant/signup, native mobile | all | review | — | — |
| **OOS-2** | §13 | Phase 2+ items must not be built (realtime editing, live embeds, DB tables, page history, comments, notifications, private pages, board, trash, Excel import/export, scenarios, audit UI, user templates/export, cost & rate card) | all | review | — | — |
| **ARC-04** | CLAUDE.md | Every new library gets a PROGRESS › Decisions entry | all | review | — | — |

## G. Authorization matrix expectations (tests/authz/rows/<area>.ts)

Rule: resource invisible to the role → `404`; visible but not permitted → `403`; manager-only global settings → `403` for workers. `M` manager · `L` LEAD of the project · `Me` MEMBER of the project · `W` worker who is not a member. Each mutating `allow` row also asserts one new `audit_log` row (FR-1201).

| PERM | §3.2 action (TH) | Expected outcomes | Area row file(s) | First milestone |
|---|---|---|---|---|
| PERM-01 | สร้าง/แก้/ปิดใช้งานพนักงาน, ตั้ง/รีเซ็ตรหัสผ่าน | M allow · L 403 · Me 403 · W 403 | tests/authz/rows/employees.ts | M1 |
| PERM-02 | จัดการตำแหน่ง, วันหยุด, ประเภทการลา | M allow · L/Me/W 403 (reads allowed to all) | tests/authz/rows/positions.ts, tests/authz/rows/holidays.ts, tests/authz/rows/leave-types.ts | M1 (positions) · M5 (holidays, leave types) |
| PERM-03 | สร้าง/แก้/archive ลูกค้า | M allow · L/Me/W 403 | tests/authz/rows/clients.ts | M2 |
| PERM-04 | ดูลูกค้า | M all · L/Me only clients of their projects · W (no project with that client) 404 | tests/authz/rows/clients.ts, tests/authz/rows/search.ts | M2 (· M10 search) |
| PERM-05 | สร้างโปรเจค | M allow · L/Me/W 403 | tests/authz/rows/projects.ts | M2 |
| PERM-06 | เห็นโปรเจคในลิสต์ / เปิดโปรเจค | M allow · L allow · Me allow · W 404 | tests/authz/rows/projects.ts, tests/authz/rows/tasks.ts, tests/authz/rows/pages.ts, tests/authz/rows/grid.ts, tests/authz/rows/milestones.ts | M2 → every later project-scoped read (M3 tasks, M4 pages/files, M6 grid, M8 milestones, M9 overview load) |
| PERM-07 | แก้ข้อมูลโปรเจค (ชื่อ, ลูกค้า, สี, ความแน่นอน) | M allow · L allow · Me 403 · W 404 | tests/authz/rows/projects.ts | M2 |
| PERM-08 | เพิ่ม/ลบสมาชิก, เปลี่ยน LEAD/MEMBER | M allow · L allow · Me 403 · W 404 | tests/authz/rows/members.ts | M2 |
| PERM-09 | Archive โปรเจค | M allow · L allow · Me 403 · W 404 | tests/authz/rows/projects.ts | M2 |
| PERM-10 | ลบโปรเจคถาวร | M allow · L 403 · Me 403 · W 404 | tests/authz/rows/projects.ts | M2 |
| PERM-11 | สร้าง/แก้/ลบ/ติ๊กเสร็จ task | M allow · L allow · Me allow · W 404 | tests/authz/rows/tasks.ts | M3 |
| PERM-12 | วางแผน (แก้ allocation) | M allow · L allow · Me allow · W 404 | tests/authz/rows/allocations.ts | M6 (saveAllocations, FR-612) · M7 (expand/collapse/convert) |
| PERM-13 | มอบหมายงานให้สมาชิกเดิม | M allow · L allow · Me allow · W 404 | tests/authz/rows/assignments.ts | M3 |
| PERM-14 | มอบหมายงานให้คนที่ยังไม่เป็นสมาชิก (auto-invite) | M allow · L allow · Me 403 · W 404 | tests/authz/rows/assignments.ts | M3 |
| PERM-15 | สร้าง/แก้/ลบ milestone | M allow · L allow · Me read-only (mutations 403) · W 404 | tests/authz/rows/milestones.ts | M8 |
| PERM-16 | ดู/สร้าง/แก้/ลบ หน้าเอกสารในโปรเจค | M allow · L allow · Me allow · W 404 | tests/authz/rows/pages.ts, tests/authz/rows/files.ts | M4 |
| PERM-17 | ดูหน้า wiki ทีม | all allow | tests/authz/rows/wiki.ts | M4 |
| PERM-18 | สร้าง/แก้หน้า wiki ทีม | all allow; locked page: M allow, workers 403 | tests/authz/rows/wiki.ts | M4 |
| PERM-19 | ล็อก/ปลดล็อกหน้า wiki ทีม | M allow · workers 403 | tests/authz/rows/wiki.ts | M4 |
| PERM-20 | บันทึก/แก้/ลบวันลาของตัวเอง | all allow | tests/authz/rows/time-off.ts | M5 |
| PERM-21 | บันทึก/แก้/ลบวันลาของคนอื่น | M allow · workers 403 (404 if the target person is outside their visibility) | tests/authz/rows/time-off.ts | M5 |
| PERM-22 | ดู workload | per §3.3 (MASK-1..3) | tests/authz/rows/workload.ts, tests/authz/rows/people.ts, tests/authz/masking.int.test.ts | M9 (· M5 calendar people, M6 project-grid footer, M10 home) |

## H. Masking assertions by milestone

`tests/authz/masking.int.test.ts` — world: manager, lead (LEAD of P), member (MEMBER of P), outsider (MEMBER of Q only); Q has distinctive project/task/milestone names and a leave with a distinctive type + note. Each case: request as the viewer, `JSON.stringify(body)` must not include any Q-only string (or leave type/note), and required masked totals must still be present.

| Milestone | Endpoint / payload | Viewer → subject | Must be absent | Must be present |
|---|---|---|---|---|
| M2 | project list / sidebar data, client list | outsider | P name, P client (unless shared) | own projects |
| M4 | Cmd+K page search, mention suggestions, GET /api/files/:id | outsider | P page titles/content, P file (404) | wiki pages |
| M5 | GET calendar month | member → lead's leave | leave type name, note | 'ลา' label, dates |
| M5 | GET calendar month | outsider → people not sharing a project | their entries entirely (MASK-3) | own + co-members' entries |
| M6 | GET /api/grid/project/P | member | other people's leave type/note | 'ลา' labels, capacity |
| M8 | calendar, project grid milestones | outsider | Q-invisible milestones (for P viewers: Q milestones) | own project milestones |
| M9 | GET /api/grid/person/:lead | member (shares P) | Q project name, Q task names | masked row 'งานในโปรเจคอื่น' with totals |
| M9 | GET /api/workload (+ hover breakdown, cell panel, overload list) | member / lead / manager | per MASK-1…4 | totals per §3.3 table |
| M9 | GET /people/[id] data | outsider → person with no shared project | everything (404) | — |
| M10 | search (all categories), home cards | outsider / worker | Q projects/tasks/clients, manager-only cards | own results/cards |

## I. E2E scenarios per spec file

| Spec file | Scenarios (ids) |
|---|---|
| `e2e/m0-smoke.spec.ts` | App boots; Thai text from th.ts renders; no request leaves localhost (NFR-09 guard reused by all specs); security headers present, no CSP violations (NFR-08c); self-hosted font (UI-14). |
| `e2e/m1-auth.spec.ts` | AC-101, AC-102 (request API), AC-103, AC-104 (two contexts), AC-201, AC-202, AC-203 (M1 clause); FR-105 validation messages; FR-106 lockout message; FR-107 log out everywhere (two contexts); FR-208 positions CRUD + in-use delete blocked; FR-209 search/filter. |
| `e2e/m2-projects.spec.ts` | §12 M2: worker cannot see a non-member project (list + direct URL = 404); FR-301/302 client CRUD + archive; FR-303 client page (project list); FR-401 create project; FR-403 members add/role/remove; FR-406 archive/unarchive with undo; FR-407 permanent delete with typed name; FR-408 tabs; FR-409 basic overview; UI-03 archived link; KEY-02/UI-02 sidebar collapse (proposed). |
| `e2e/m3-tasks.spec.ts` | AC-601, AC-602, AC-603 (task + assignee clause); FR-605 picker (+ AC-203 picker clause: deactivated Cindy absent); FR-606, FR-607/608, FR-609, FR-610 (assignee move + undo); FR-611 (Esc, ?task= deep link); FR-613 grouping; FR-614 bulk; FR-404 member-removal toast; FR-1009 /my basic; KEY-04/05/08c/08e (proposed); UNDO-4 toast 8 s. |
| `e2e/m4-pages.spec.ts` | AC-501…AC-505; FR-402 charter exists for new project (+ backfill); FR-506 create paths; FR-507 templates; FR-509 delete + undo; FR-510 lock (worker read-only); FR-520 Thai/English slash search; FR-527 attachment card + download; FR-529 mention; FR-531 autosave status; FR-532 markdown shortcuts; FR-542 takeover (two contexts); FR-1102/1105 Cmd+K page search with Thai substring. |
| `e2e/m5-calendar.spec.ts` | §12 M5: record leave, overlapping leave rejected with the conflicting entry named, holiday CSV import; FR-906 capacity X→Y; FR-907 calendar shows 'ลา' for others (MASK-5); FR-908 quick create; FR-909 delete + undo. |
| `e2e/m6-grid.spec.ts` | AC-801 (also keyboard-only), AC-802 (F3 leave), AC-803 (fraction mode paste), AC-805 (undo ×3 + reload); FR-612 plan N days with preview; FR-801 infinite scroll + 'วันนี้'; FR-804 unit switch; FR-809 load view; FR-405 certainty change updates without reload; AC-203 grid clause; AC-603 plan clause; GRID-09…14; GAPI-5 rollback toast (500); GAPI-6 version-conflict toast (two contexts); NFR-04 < 50 ms; BR-52 release toast. |
| `e2e/m7-daily.spec.ts` | AC-804; FR-802 day zoom; FR-803 expand via header click and Cmd+↓; BR-23 collapse; BR-24 dialog (both options); day-cell leave/holiday rendering; day-level overload display. |
| `e2e/m8-milestones.spec.ts` | AC-701, AC-702; FR-702 create from overview, grid row and Cmd+K; FR-703 progress; FR-707 drag ◆ (+ keyboard path); FR-708 delete + undo re-links tasks; FR-907 ◆ on calendar; FR-613/614 milestone grouping/bulk link. |
| `e2e/m9-workload.spec.ts` | FR-1001…1004 table, toggles, filters; FR-1005 breakdown panel with masked line; FR-1006 overload tab (F3 data); FR-1007 badge; FR-1008 person page tabs; FR-1009 /my grouping; AC-604 closure; FR-906 overload links after leave; FR-409 member loads + bars; FR-303 client load; worker DOM never contains hidden project names. |
| `e2e/m10-home-search.spec.ts` | Login lands on /home (AC-101 target); FR-1101a–f cards incl. manager-only cards absent for workers; FR-1102 all categories; FR-1103 quick commands; FR-1104 permission-filtered results; FR-1105 Thai substring; KEY-06 shortcut help (proposed). |
| `e2e/m11-deploy.spec.ts` | Against the compose stack (BASE_URL): initial manager login + forced password change (FR-102/DEP-15), cookie flags with SECURE_COOKIES (NFR-08b), security headers, no external requests; backup files checked by script. |
| `e2e/m11-perf.spec.ts` | NFR-02b grid render < 300 ms, NFR-05 300-block page < 1 s, NFR-06 palette first result < 200 ms on seed:perf data. |
| `e2e/m11-responsive.spec.ts` | NFR-07b mobile viewport: home, my tasks, report leave, read a page; tablet viewport: grid usable. |

### Test-file inventory per milestone (C = create, E = extend)

| Milestone | Files |
|---|---|
| M0 | C: e2e/m0-smoke.spec.ts, e2e/fixtures.ts, e2e/global-setup.ts, tests/setup/*, tests/helpers/*, src/server/db/schema.int.test.ts (connectivity + extensions), src/lib/theme/contrast.test.ts, src/lib/format/thai-date.test.ts, src/lib/env.test.ts; vitest coverage threshold for src/domain/**; ESLint rules (domain purity, Thai literals, no-explicit-any, localStorage). |
| M1 | C: src/server/auth.int.test.ts, src/server/action.int.test.ts, src/server/bootstrap.int.test.ts, src/server/services/employees.int.test.ts, src/server/services/positions.int.test.ts, src/lib/auth/random-password.test.ts, src/lib/users/display-name.test.ts, src/lib/schemas/account.test.ts, src/components/people/UserName.test.tsx, src/domain/units.test.ts (numeric↔cd subset, C-01), src/domain/dates.test.ts (todayBangkok subset, C-02), tests/authz/matrix.int.test.ts + rows/employees.ts, rows/positions.ts (harness may start here although §12 schedules the suite in M2), src/server/audit.int.test.ts (skeleton), e2e/m1-auth.spec.ts. |
| M2 | C: src/server/services/clients.int.test.ts, projects.int.test.ts, members.int.test.ts, overview.int.test.ts, src/domain/membership.test.ts (proposed), src/components/ui/Sidebar.test.tsx, tests/authz/rows/clients.ts, projects.ts, members.ts, tests/authz/masking.int.test.ts (skeleton), e2e/m2-projects.spec.ts. |
| M3 | C: src/domain/task-tree.test.ts (proposed), src/domain/certainty.test.ts (C-03), src/server/services/tasks.int.test.ts, assignments.int.test.ts, my-tasks.int.test.ts, src/lib/undo/undo-stack.test.ts, src/components/tasks/TaskList.test.tsx, TaskPanel.test.tsx, src/components/ui/UndoToast.test.tsx, tests/authz/rows/tasks.ts, assignments.ts, e2e/m3-tasks.spec.ts. E: members.int.test.ts (FR-404/BR-61). |
| M4 | C: src/server/services/pages.int.test.ts, page-locks.int.test.ts, files.int.test.ts, search.int.test.ts, src/lib/editor/{paste-table,content-text,templates,slash-menu,autosave}.test.ts, src/lib/pages/tree.test.ts, src/lib/files/validate-upload.test.ts, src/components/pages/PageTree.test.tsx, src/components/editor/SubpageBlock.test.tsx, tests/authz/rows/pages.ts, files.ts, wiki.ts, search.ts (pages), e2e/m4-pages.spec.ts. E: projects.int.test.ts (charter + disk cleanup on hard delete), masking.int.test.ts (search). |
| M5 | C: src/domain/capacity.test.ts, src/lib/csv/holidays-csv.test.ts, src/lib/schemas/time-off.test.ts, src/server/services/holidays.int.test.ts, leave-types.int.test.ts, time-off.int.test.ts, calendar.int.test.ts, tests/authz/rows/holidays.ts, leave-types.ts, time-off.ts, e2e/m5-calendar.spec.ts. E: src/domain/dates.test.ts (full), bootstrap.int.test.ts (leave types, no holidays), schema.int.test.ts (exclusion), masking.int.test.ts (calendar). |
| M6 | C: src/domain/allocation.test.ts, completed.test.ts, src/lib/grid/{selection,clipboard,fill,save-queue}.test.ts, src/server/services/allocations.int.test.ts, grid.int.test.ts, src/components/grid/PlanGrid.test.tsx, GridCell.test.tsx, tests/authz/rows/allocations.ts, grid.ts, tests/golden/golden.int.test.ts (F1 totals + per project), scripts/perf-check.ts (grid smoke), e2e/m6-grid.spec.ts. E: units.test.ts, certainty.test.ts, schema.int.test.ts (trigger, checks), tasks.int.test.ts (BR-52, FR-610 plans), projects.int.test.ts (FR-406 X), masking.int.test.ts (grid leave labels). |
| M7 | C: src/domain/overload.test.ts (BR-40 subset, C-05), e2e/m7-daily.spec.ts. E: allocation.test.ts (BR-21a–24, invariants), allocations.int.test.ts (conversions, NEEDS_CHOICE), grid.int.test.ts (expand, derived), GridCell.test.tsx (dashed derived cells). |
| M8 | C: src/domain/milestone.test.ts, src/server/services/milestones.int.test.ts, tests/authz/rows/milestones.ts, e2e/m8-milestones.spec.ts. E: grid.int.test.ts (milestones, lateForMilestone), calendar.int.test.ts, overview.int.test.ts, tasks.int.test.ts (milestone link), masking.int.test.ts (MASK-6). |
| M9 | C: src/server/services/workload.int.test.ts, src/components/people/WorkloadCell.test.tsx, tests/authz/rows/workload.ts, people.ts, e2e/m9-workload.spec.ts. E: overload.test.ts (BR-41, colours), grid.int.test.ts (person mode, masked rows), clients.int.test.ts (FR-303 load), overview.int.test.ts (loads), my-tasks.int.test.ts (grouping), time-off.int.test.ts (FR-906 overloads), masking.int.test.ts (person grid, workload, panel), golden.int.test.ts (F1 byUserWeek + F2–F4). |
| M10 | C: src/server/services/home.int.test.ts, src/components/ui/CommandPalette.test.tsx, ShortcutHelp.test.tsx, tests/authz/rows/home.ts, e2e/m10-home-search.spec.ts. E: search.int.test.ts (all categories), tests/authz/rows/search.ts, masking.int.test.ts (search + home). |
| M11 | C: scripts/seed-demo.ts, scripts/seed-perf.ts, e2e/m11-deploy.spec.ts, e2e/m11-perf.spec.ts, e2e/m11-responsive.spec.ts; shellcheck for docker/backup.sh. E: src/server/audit.int.test.ts (sweep + meta-test), scripts/perf-check.ts (all NFR scenarios). |

### §14 decisions → rows

| §14 | Decision | Traced by | Milestone |
|---|---|---|---|
| D1 | Only managers create projects | PERM-05, FR-401 | M2 |
| D2 | Worker workload visibility per §3.3 | MASK-1…3, PERM-22 | M9 (M5, M10) |
| D3 | Milestones editable by manager + LEAD | PERM-15, FR-702 | M8 |
| D4 | One-editor lock, no realtime | FR-540…543, EDI-6, OOS-2 | M4 |
| D5 | Block tables, not Notion databases | FR-523, FR-524, OOS-2 | M4 |
| D6 | Default display unit = days | FR-804 | M6 |
| D7 | Buddhist year | UI-12 | M0 (M5, M6) |
| D8 | No project sections — parent tasks instead | FR-603, PRIN-P7 (review) | M3 |
| D9 | Holidays imported by manager from CSV; none seeded | FR-901, DEP-11 | M5 |
| D10 | No cross-project task moves | BR-33 | M3 |

## J. Completeness check (generated)

| Check | Expected ids | Missing |
|---|---|---|
| FR rows in SPEC tables | 112 | none |
| BR rows in SPEC tables | 43 | none |
| AC bullets in SPEC | 23 | none |
| §3.2 permission rows | 22 | none |
| §9 NFR rows (parent ids; a/b/c sub-ids count) | 10 | none |
| §11.1 modules + coverage | 9 | none |
| §11.3 fixtures | 6 | none |
| §8.6 shortcut lines (8 lines; list line split a–e) | 8 | none |
| §8.9 bullets (3; bullet 2 split a/b) | 3 | none |
| §3.3 masking rules | 7 | none |
| §10 deployment items | 16 | none |

SPEC ids found: 112 FR, 43 BR, 23 AC, 22 §3.2 rows, 10 §9 rows.

## K. Evidence log (commands run on 2026-09-30)

### K.1 Apply SPEC SQL on Postgres 17
```bash
# SQL blocks extracted from SPEC.md into ddl_1.sql (§6.2), ddl_2.sql (§6.3), ddl_3.sql (§6.5); stub "user" table first
docker run -d --name r7-trace-pg17-a64f -e POSTGRES_PASSWORD=x -e POSTGRES_USER=planner -e POSTGRES_DB=planner postgres:17
psql … -c "select datcollate, datctype …"      # en_US.utf8|en_US.utf8|UTF8
psql -v ON_ERROR_STOP=1 < 00_stub_user.sql; < ddl_1.sql; < ddl_2.sql   # no errors
psql -c "prepare wl(date,date) as <§6.5 query>"                        # PREPARE
select count(*) from information_schema.tables where table_schema='public';   # 18
```
### K.2 Behaviour probes (excerpts)
```text
T1 completed_on 2026-10-01 → completed_week 2026-09-28 ; completed_on 2026-10-04 → 2026-09-28
T2 ERROR:  WEEK_DAY_CONFLICT: assignment 00000000-…-c1 week 2026-10-19
T3 BEGIN; DELETE 1; INSERT 0 2; COMMIT   (DAY 2026-10-21 1.00, DAY 2026-10-22 0.50)
T4 WEEK 7.25 → allocations_check ; DAY 1.25 → allocations_check ; week_start 2026-10-27 → allocations_week_start_check ;
   0 → allocations_person_days_check ; 0.125 → stored 0.13
T5 overlap → ERROR: conflicting key value violates exclusion constraint "time_off_user_id_daterange_excl"
   AM then PM same day → same exclusion error ; after soft delete → insert OK
T6 restore (deleted_at=null) of the old overlapping row → exclusion error
T7 half='AM' on 2026-11-02..03 → time_off_check1
T8 depth 3 → tasks_depth_check ; '   ' → tasks_name_check ; 2nd charter → one_charter_per_project ;
   WORKSPACE + project_id → pages_check
```
### K.3 Thai trigram probes
```text
select name, similarity(name,'ลูกค้า') from tasks where name ilike '%ลูกค้า%'  → ย้ายข้อมูลลูกค้า | 0.2777778
explain (enable_seqscan=off) … ilike '%ลูกค้า%' → Bitmap Index Scan on tasks_name_trgm (actual rows=1)
select 'ย้ายข้อมูลลูกค้า' % 'ลูกค้า' → f   (similarity 0.278, word_similarity 0.714)
C-ctype database: show_trgm('ลูกค้า') → {}   ; ILIKE still true (seq scan)
```
### K.4 Intl on node:22-alpine vs local Node
```text
{"node":"v22.23.3","icu":"78.3","medium":"30 ก.ย. 2569","dayMonth":"30 ก.ย.","numericDM":"30/9","weekdayShort":"พุธ","todayBangkokAt2330UTC":"2027-01-01"}
{"node":"v26.5.0","icu":"78.3", … identical …}
```
### K.5 Golden totals
```text
total incl 12-28: 19500  committed: 11625  total excluding 12-28 week: 19250
```
### K.6 better-auth 1.7.6 (npm pack)
```text
dist/api/routes/sign-up.mjs:145   if (!…emailAndPassword?.enabled || …emailAndPassword?.disableSignUp) throw APIError.from("BAD_REQUEST", …
dist/context/create-context.mjs:147 updateAge: … : 1440 * 60,
dist/context/create-context.mjs:148 expiresIn: options.session?.expiresIn || 3600 * 24 * 7,
dist/plugins/admin/routes.mjs (banUser)   banned: true, … await ctx.context.internalAdapter.deleteUserSessions(ctx.body.userId);
dist/plugins/admin/routes.mjs (setUserPassword) hash → updatePassword/createAccount → return { status: true }   (no session revocation)
dist/cookies/index.mjs:77          if (!ctx.context.options.session?.cookieCache?.enabled) return;
dist/api/rate-limiter/index.mjs:245 const key = createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path);
dist/plugins/admin/admin.mjs:14-15 defaultRole: options?.defaultRole ?? "user", adminRoles: options?.adminRoles ?? ["admin"],
```
### K.7 Contrast (WCAG relative luminance)
```text
load-over 5.92 · load-full 6.14 · load-light 4.12 (FAIL text) · certain 6.49 · tentative 4.12 (FAIL text)
brand-navy/white 11.62 · brand-blue/white 7.32 · heat-100/white 4.84 · today/white 3.76 (non-text only)
milestone/white 5.70 · white on #94A3B8 2.56 (FAIL) · candidates on #FFEB9C: #8F5C00 4.76, #8A5900 5.02, #805300 5.58
```

