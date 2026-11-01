# M8 — Milestones

> Depends on: M7 ✅ · SPEC v3.1: §4.7 (FR-701…708, AC-701, AC-702), §5.9 (BR-70…72), §3.2 (milestone row = PERM-15; PERM-06/11 for reads and task binding), §3.3 (milestones of hidden projects are not shown), §6.2 (`milestones`, `tasks.milestone_id`), §7.4 (`GridResponse.milestones`, `lateForMilestone`), §7.5, §7.8 (`TaskCard.milestoneId`), FR-409 (upcoming milestones), FR-601/613/614 milestone parts, FR-661/663 milestone parts, FR-702 `Cmd+K`, FR-705 (project grid + calendar), FR-907 milestone part, §8.3, §8.7 `--milestone`, §8.9, §8.10, §11.1 `milestone`, §12 M8 ·
> Owner-visible result: projects get **milestones** (◆) — created and edited on the overview tab, on the ◆ row of the plan grid (click a date cell, drag ◆ to move it, works in week and day zoom) or from `Cmd+K`; every view warns **"เลย milestone"** when a bound task still has plans or a due date after the milestone; tasks can be bound one by one or in bulk, grouped by milestone, filtered on the board and on `/tasks`; ◆ also appears on the team calendar. Deleting a milestone unbinds its tasks with an 8-second "เลิกทำ" that re-binds them exactly.

> **Forward note — SPEC v3.3 / M7.1 (2026-11-01, PLAN §1.9). M8 now depends on M7.1; read `plan/m07.1-grid-improvements.md` §3.2 first.**
> (1) **Header rows:** M7.1 already set `HEADER_ROWS = 2` (month row `aria-rowindex 1`, period row 2) and `HEADER_TOTAL_H = MONTH_H + HEADER_H`.
> M8-D26 therefore becomes **`HEADER_ROWS = 3`** with the ◆ row **on top** (`aria-rowindex 1`), month row 2, period row 3, and adds the ◆ row height
> (28 px) to `HEADER_TOTAL_H`; every "`HEADER_ROWS === 2`" / "`aria-rowindex 2`" expectation in this plan (S3.3, S3.9, S6.3, R4) reads 3 / 3.
> (2) **Frozen columns:** the single name column (`NAME_W`, `NAME_COL_W`) no longer exists — the ◆ row's first cell spans the two frozen columns
> (`--grid-task-w` + `--grid-assignee-w`, `src/lib/grid/frozen.ts`). (3) **Milestone lines (SPEC FR-820, D24):** besides ◆, every milestone is
> drawn as a vertical line in M7.1's `MarkerLayer` — map `GridMilestone` → `GridMarkerView { source: 'MILESTONE', tone: 'MILESTONE', date,
> label: name, editable: false }` (helper `milestoneMarkerViews` in `src/lib/grid/milestones.ts`) and concatenate with the plan markers;
> placement = `markerEdgeColumn` (BR-102) so the line sits on the right edge of the column holding the ◆; colour `--milestone`, pattern
> dash-dot; the line is not interactive (edit via ◆). Plan markers (`plan_markers`) are **not** milestones: no binding, status or lateness, and no
> conversion either way. (4) **Task-row label `→◆UAT`** (S3.7) goes in the **task** column (`TaskCell`), never the assignee column; in M7.1's
> hidden-assignee mode it is shown on the sum row. (5) `CellMenu` header items: M7.1 added "เพิ่มเส้นกำกับที่ขอบขวา" on column headers; M8's
> ◆-row items are separate (◆ row cells), so there is no conflict.

---

## 1. Goal and scope

### 1.1 In scope

Legend — "Where": stream.step in §5. "Test": `unit` = Vitest node, `ui` = Vitest jsdom, `int` = Vitest + Postgres, `authz` = row in `tests/authz/rows/milestones.ts` (§7.2), `mask` = `tests/authz/masking.int.test.ts`, `golden` = `tests/golden/milestones.int.test.ts`, `e2e` = scenario id in `e2e/m8-milestones.spec.ts` (§7.3).

| ID | What M8 delivers | Where | Test |
|---|---|---|---|
| FR-701 | Milestone = name (1–200, trimmed), date (`'YYYY-MM-DD'`), description (≤ 2 000, blank → null), completion (`completed_on`) | S0.2, S0.4, S2.2 | int `milestones.int.test.ts › create/update` · unit `schemas/milestones.test.ts` |
| FR-702 | Create from (a) the overview tab, (b) a date cell of the grid's ◆ row (pre-filled with that column's date), (c) `Cmd+K` "สร้าง milestone" (M/L only) | S4.2, S3.4, S4.10 | e2e M1, M4, M9 · ui |
| FR-703 | Bind a task to at most one milestone (panel field + bulk); progress "เสร็จ 4/7 งาน" = live bound tasks at any depth (X66) | S2.2, S2.7, S4.5, S4.6 | int `milestones.int.test.ts › progress`, `› link` · e2e M2, M4, M6 |
| FR-704 / BR-70 | `milestoneStatus(m, today)`: `completedOn` → DONE; `date < today` → OVERDUE; `0 ≤ date − today ≤ 7` → DUE_SOON; else UPCOMING (today = date → DUE_SOON) | S1.2, S2.2 | unit `milestone.test.ts` · golden (r8 §4.9 table) |
| FR-705 (M8 part) | ◆ on the top row of the project plan grid (week + day zoom) and on the team calendar | S3.3, S4.9 | ui `MilestoneRow.test.tsx` · e2e M1, M8 |
| FR-706 / BR-71 | "เลย milestone" on the task (list row, board card, panel, grid task row) and on ◆ (grid, overview, calendar) | S1.3, S2.1, S2.5–S2.8, S3.7, S4.4–S4.7 | unit · int `repo/milestones.int.test.ts › lateFacts`, `milestones.int.test.ts › AC-702` · golden · e2e M2 |
| FR-707 | Drag ◆ on the grid: ±7 days per week column keeping the weekday, ±1 day per day column; keyboard = date popover; only M/L (X66) | S1.4, S3.5, S3.6 | unit `lib/grid/milestones.test.ts` · e2e M3 |
| FR-708 | Delete = soft delete with a batch; bound tasks read as unbound; toast "เลิกทำ" re-binds exactly (X66) | S2.2, S4.2, S3.5 | int `› delete/restore` · authz MS-DELETE/MS-RESTORE · e2e M4 |
| BR-72 | Milestones carry no load: grid footer, `loadByUserWeek` and capacity unchanged | S2.5 | golden `BR-72` · int `grid.int.test.ts › BR-72` |
| AC-701 | Milestone 23 ต.ค. → ◆ in column week 19 ต.ค. → day zoom → ◆ on Friday 23 | S3.3, S3.4 | e2e M1 |
| AC-702 | Bind a task planned in week 26 ต.ค. → "เลย milestone" on the task and on ◆ | S2.1, S3.7, S4.4, S4.5 | e2e M2 · int `› AC-702` |
| FR-409 (milestone part, X15 carry-in) | Overview section "Milestones": list (date order, upcoming first, done last), status chip, progress, late badge; M/L create/edit/complete/delete | S2.4, S4.2 | int `› listProjectMilestones` · ui `ProjectMilestones.test.tsx` · e2e M4 |
| FR-601 (milestone part, X21) | Task field "Milestone" in the panel (`Select`: ไม่ผูก + live milestones of the project) | S2.7, S4.5 | ui `TaskPanel.milestone.test.tsx` · e2e M2 |
| FR-613 (milestone part, X21) | Group by milestone (`tasks.groupBy = 'milestone'`): one group per live milestone in date order (empty kept) + "ไม่ผูก milestone" last | S0.6, S4.3, S4.4 | unit `group.test.ts › milestone` · e2e M6 |
| FR-614 (milestone part, X21) | Bulk bar "ผูก milestone" (milestone menu + "ไม่ผูก") → one action, one undo entry | S2.2, S4.6 | int `› link bulk` · e2e M6 |
| FR-661 (milestone part, M3-D37) | Board card shows `◆ <name>` (+ ⚠ when late) | S4.7 | ui `TaskCard.milestone.test.tsx` · e2e M7 |
| FR-663 (milestone part, M3-D37) | Board filter "milestone" (ทุก milestone · ไม่ผูก · each milestone), in memory; `/tasks` filter `milestoneId` (enabled once a project is chosen) | S4.3, S4.7, S4.8, S2.7 | unit `board.test.ts › milestone` · int `team-tasks.int.test.ts › milestoneId` · e2e M7 |
| §7.8 `TaskCard.milestoneId` | Added to `TaskCard`; `TeamTasksResponse.milestonesByProject` (visible projects present in the page only) | S0.3, S2.7 | int · mask |
| FR-907 (milestone part, X24) | `CalendarResponse.milestones` of visible, non-archived projects in `[from, to)`; ◆ chip per day | S2.8, S4.9 | int `calendar.int.test.ts › milestones` · mask · e2e M8 |
| §7.4 / X28 | `GridResponse.milestones` (all live milestones of the project with status, late, progress) and task rows `milestoneId` / `lateForMilestone` | S0.3, S2.5 | int `grid.int.test.ts › milestones` |
| §7.5 | Deletion returns `deleted_batch`; undo = `restoreMilestoneBatch({ batch })` (authz re-checked, 30-day window) | S2.2, S4.1 | int · authz MS-RESTORE* |
| §3.3 (milestone rule) | Milestones of projects the viewer cannot see never reach the client (grid, list, calendar, `/tasks`, targets) | S2.5–S2.8 | mask (world + golden Cindy/Ivy, r8 §4.3) |
| §8.9 / A11Y-2b (◆ part) | ◆ is a focusable button with a text label; Enter = popover (date field = keyboard move), `Shift+F10` = `CellMenu`; status never by colour alone (glyph + text) | S3.3, S3.5, S3.10 | ui · e2e M3 |
| FR-1201 / X44 | Audit `milestone` create/update/delete/restore, `task` per changed binding, in the same tx, written by the actions (M8-D25) | S2.3 | authz audit assertion · int |
| UT-07 (§11.1 `milestone`) | Every BR-70 status (incl. today = date), all three BR-71 conditions | S1 | unit (domain ≥ 95 %) |

**§3.2 permission rows in scope** (PERM numbering = §3.2 table order; PERM-23 appended, X79):

| PERM | §3.2 row | M | L | Me | W | Rows (§7.2) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-15 | สร้าง/แก้/ลบ milestone — `createMilestone`, `updateMilestone` (rename, move, complete), `deleteMilestone`, `restoreMilestoneBatch` | allow | allow | **403** (ดูได้) | 404 | MS-CREATE, MS-RENAME, MS-MOVE, MS-COMPLETE, MS-DELETE, MS-RESTORE, MS-*-ARCH, MS-Q, MS-MISSING, MS-TARGETS |
| PERM-06 | เห็นโปรเจค / เปิดโปรเจค — `GET /api/projects/[id]/milestones`, milestones inside grid/tasks/calendar reads | allow | allow | allow | 404 | MS-LIST, MS-LIST-ARCH, TT-MS, TT-MS-Q |
| PERM-11 | สร้าง/แก้ … task — binding a task (`linkTasksToMilestone`, `revertTaskMilestones`) is a task edit (M8-D4) | allow | allow | allow | 404 | MS-LINK, MS-UNLINK, MS-LINK-CROSS, MS-LINK-ARCH, MS-REVERT |

Archived project A (X42): every PERM-15 and PERM-11 write → M/L/Me `403`, W `404`; reads stay allowed. Enforced once in `requireProject` (via `requireMilestone`/`requireTasks`), tested by S5.1.

### 1.2 Out of scope (do NOT build; target milestone)

| Item | Lands in |
|---|---|
| ◆ on the person grid `/people/[id]` (FR-705 part: only projects where that person has tasks and the viewer can see the project) | M9 (r6b M8-06; reuse `GridMilestone`, `repo.milestones.listForProjects`) |
| Home card "Milestone ใน 14 วันข้างหน้า" (FR-1101, FR-705 home part) | M10 (reuse `services.milestones.listVisibleMilestones`, `MilestoneStatusChip`) |
| Palette search categories (projects/tasks/people/clients) and quick commands สร้าง task / สร้างหน้า / แจ้งลา / ไปหน้าวันนี้ | M10 (X08, X68; they register in M8's `PALETTE_COMMANDS`) |
| FR-409 per-member load and 12-week bars | M9 (X15) |
| `seed:demo` composition (calls `addMilestones`) | M12 (X69) |
| Live "milestone" block in pages; live milestone list in the charter's "Milestones สำคัญ" section | Phase 2 (SPEC §13 #2, App. B.1 note) |
| Purging soft-deleted milestones, audit UI | Phase 2 (§13, FR-1202) |
| Milestone dependencies, Gantt links, automatic re-planning when a milestone moves, reminders/notifications | never (SPEC §1.4, P4/P7) |
| A milestone search category in `Cmd+K` | not in SPEC (FR-1102 lists no milestone category) |

### 1.3 Carried-in items (deferred to M8 by earlier milestones)

| From | Item | Ruling |
|---|---|---|
| M2 | FR-409 "milestone ที่กำลังจะถึง" on the overview tab | M2 §1.2, r7 C-15 |
| M3 | Milestone field, group by milestone, bulk "ผูก milestone" — **no stubs existed** | X21 |
| M3 | Milestone on board cards (FR-661), milestone filter on the board and `/tasks` (FR-663), `TaskCard.milestoneId` | X21, M3-D37 |
| M4 | Palette command "สร้าง milestone" plugged into the M4 palette (`PALETTE_GROUPS` stays as is) | X08, HANDOFF C6 |
| M5 | ◆ on `/calendar`; `milestones` field in `CalendarResponse` (M5 had no stub field) | X24, M5 §1.2 |
| M6 | `GridResponse.milestones` (`[]` until now), task rows `milestoneId`/`lateForMilestone` (null/false until now), `GridMilestone` (no status), sticky milestone header row, `columnIndexOfPeriod` | X28, PLAN §3.10, m06 S0.4/S3.1 |
| M7 | ◆ in day columns, drag ±1 day, `CellMenu` reuse | X66, m07 §1.2, HANDOFF C15 |
| PLAN | Table `milestones` + `tasks.milestone_id` (X10); `makeMilestone`, world `'milestones'` (§4.3); `addMilestones(db)` (§3.13) | X10, PLAN §3.13, §4.3 |

---

## 2. Read first

- **SPEC:** §0–§3 (§3.2 milestone row + D3, §3.3 last bullet), §4.4 FR-409, §4.6 FR-601/613/614, §4.6.3 FR-661/663/665, §4.7 (all), §4.9 FR-907, §5.9 (BR-70…72), §5.7 (BR-50 "completed" semantics), §6.2 (`milestones`, `tasks.milestone_id`, `allocations`), §7.4, §7.5, §7.8, §8.3 (◆ row mock, `→◆UAT`), §8.6, §8.7 (`--milestone #7C3AED`), §8.9, §8.10 (board toolbar "milestone ▾"), §11.1 `milestone`, §12 M8, App. A.2 (milestones list).
- **PLAN.md:** §1.3 (Drizzle `timestamptz`/errors, no plan dates in SQL from `now()`, MUI 9 slots, Zod 4, Playwright clock); §1.4 **X04, X08, X10, X11, X21, X24, X28, X30, X40–X49, X52, X53, X56, X57, X59, X65 (timeline bound), X66, X70, X71, X74, X75**; §2.3 ownership; §3.4 (errors, `action()`, `route()`, authz, transactions, audit, clock); §3.5 (query keys, invalidation); §3.7; §3.8; §3.9; §3.10 (milestone header row); §3.13; §4.
- **Previous plans (reuse names verbatim; m03 and m04 are the source of truth for their names):** `plan/m03-tasks.md` M3-D37…D42 (forward hooks M8 fills: `TaskCard.milestoneId`, `listLiveWithBlockerCounts` → `TaskListRow`, `repo.assignments`, `TeamTaskFilters`/`useTeamTaskFilters({ syncUrl })`, exact-key tests and the G2 grep are M3-only), S0.4 (`taskPatchSchema`, `teamTasksQuerySchema`), S0.5 (`TaskDTO`, `ProjectTasksResponse`, `TaskCard`, `TeamTasksResponse`), S0.7 (`TaskListRow`), S0.6 (`requireTasks`), S0.13 (`tasks.groupBy`), S1.4 (`groupTasks`, `buildStatusColumns`, `patch*`), S2.10 (`listProjectTasks`), S2.16 (`listTeamTasks`), S3.1 (`useTaskMutations`, undo matrix), S3.4–S3.9, S3.16, S3.19; `plan/m04-pages-editor.md` S3.5 (`PaletteProvider`, `CommandPalette`, `PALETTE_GROUPS` in `src/components/palette/groups.tsx`), M4-D37d/e, the `Palette` page object (`group(heading)`, `option(name)`, `pageResults()`) and E16; `plan/m05-calendar-capacity.md` S0.5 (`CalendarResponse`), S2.6 (`getCalendar`), S3.2–S3.3 (`MonthGrid`, `TeamCalendar`, `AgendaList`); **`plan/m06-weekly-grid.md` S0.4 (`GridMilestone`, `GridTaskRow`, `GridResponse`, `SaveAllocationsOk`, `PlanAssignmentRangeOk`), S2.2 (`buildChunk`, `assembleGrid`), S3.1 (`columnIndexOfPeriod`, `HEADER_ROWS`/`FOOTER_ROWS`, M6-D35 column shape), S3.2 (`mergeChunks`, `GridModel`), S3.6 (`cache-ops.ts`, `save-invalidate.ts#invalidateAfterGridSave`), S3.9 (`VirtualGrid`, `GridToolbar`, `RowHeader`), S6.1 (`GridPage`)**; **`plan/m07-daily-resolution.md` S3.1 (`GridColumn` with `role`, `buildColumns`), S3.3, S3.9 (`CellMenu`), S5.1 (`GridPage.zoom`)**; `plan/m02-clients-projects-authz.md` S2.5 (overview page, `ProjectOverview.tsx`), M2-D21 (`orNotFound`), S0 `compareThai`.
- **Research:** `plan/research/r6b-gaps-m6-m11.md` §3.3 (M8-01…M8-08), §4.1 (`late` on milestones), §5 "M8"; `plan/research/r8-golden.md` §4.3 ("Seed:demo milestones to hide"), §4.9, §6.11; `snippets/r8/facts.json › milestones`; `plan/research/r5-v21-mining.md` §2 M8 (M8-01…03; v2.1 had no milestones — follow SPEC); `plan/research/r4-client-testing.md` (cmdk §, sonner, Playwright clock/mouse).
- **docs:** `docs/reference/golden-fixtures.json` has **no** milestones; the A.2 list lives only in SPEC App. A.2 (M8-D20).

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings

| ID | What it means in M8 |
|---|---|
| X04 | Milestone delete returns `deleted_batch`; undo = `restoreMilestoneBatch({ batch })` re-checking authz + 30-day window (M3 pattern). |
| X08 | M8 adds exactly one palette command, "สร้าง milestone", for M/L; search categories and other commands stay M10. |
| X10 | M8 migration: table `milestones` + `tasks.milestone_id` FK `ON DELETE SET NULL`. Only S0 generates it. |
| X11 / X59 | `seedGolden` is unchanged (A.1 has no milestones); the A.2 builder `addMilestones(db)` is separate and audits with actor `null`. |
| X21 | Every milestone part of tasks lands now: field, grouping, bulk link, card, filters, `TaskCard.milestoneId`. |
| X24 | `/calendar` gains ◆ of visible projects. |
| X28 | `GridResponse.milestones` and `lateForMilestone` become real; the M6 contract is extended additively (`GridMilestone` gains status/late/progress). |
| X30 / X43 | Calendar and `/tasks` use `visibleProjectIds`; nothing else decides visibility. |
| X40 | `pnpm check` includes integration (`pnpm db:up` first). |
| X41 / X42 | Invisible → 404; Me on PERM-15 → 403; archived → 403 for writes, reads allowed; bad input → 400 before authz reveals anything. |
| X44 | One audit row per milestone operation; one per changed task binding; same tx. |
| X45 / X52 | Status uses `serverToday()` passed in by actions/routes; SQL only does arithmetic on stored dates (`m.date + 1096`), never `now()`/`current_date`. |
| X46 | E2E on the production build, `resetDb(…, { milestones: true })`, `loginAs`, `page.clock.setFixedTime`, page objects; S6.3 updates older specs. |
| X47 | `z.uuid()`, `z.iso.date()`, Thai only via `th.*`; no `refresh()` (milestone views are TanStack-driven). |
| X49 | Grid ◆ keys (`Enter`, `Shift+F10`, `Escape`) and palette keys match `e.code` first. |
| X53 | No `localStorage`: board milestone filter is in memory, grouping in `user_preferences`. |
| X56 / X59 | Services take `today`; S0 creates no runtime file under `src/domain/**` (signatures in §5.S1); factories use plain Drizzle. |
| X57 | Overview/plan pages keep their M2/M6 authz-before-Suspense; no `loading.tsx`. |
| X65 | Every new `allocations` query has a `week_start` range; lateness uses `week_start ≥ m.date − 6` and `≤ m.date + 1096` plus `period_start > m.date` (X66 as clarified by X95, M8-D6). |
| X66 | Followed verbatim: soft delete + reads ignore deleted milestones + exact re-link on undo; drag ±7 days per week column keeping weekday / ±1 day per day column; keyboard = date popover; only M/L move; click pre-fills the date; BR-71 bounded to `(m.date, m.date + 3 years]` — on `allocations` that is `week_start ≥ m.date − 6` and `period_start > m.date` (X95, M8-D6), so DAY rows later in the milestone's own week count; a WEEK row in the milestone's own week never counts; DUE_SOON when `0 ≤ date − today ≤ 7`; progress = non-deleted bound tasks at any depth; service checks `task.project_id = milestone.project_id`. |
| X70 | `makeMilestone`/`addMilestones` never insert tasks; any test task they need comes from `makeTask` (default status) — every task fixture sets `status_id`. |
| X71 | Progress and lateness react to completion through M3's `setStatus` only (no second completion path). |
| X74 / X75 | Board card/filter changes live in the shared `TaskBoard`/`TaskCard` and `TeamTasks`; `/tasks` keeps SQL-side visibility. |
| X81–X88, X90, X91, X93, X95, X96 (2026-10-30 contracts) | X81 routes `api/projects/[id]/milestones`, `api/milestones/targets`, components `milestones/`, `palette/commands.ts`; X82 `qk.projectMilestones`/`milestoneTargets`, `invalidateMilestones` (incl. `['grid','person']`), `invalidateTasks` → milestones, `invalidateAfterGridSave` + milestones (S0.6, S3.8); X83 `getJson`; **X85** `HEADER_ROWS = 2`, `GridMilestone` = `MilestoneDTO`, `context.canManage`, `lateness` on save results, task rows `milestoneId` via `LIVE_MILESTONE_ON`, ◆ in day columns via `columnIndexOfPeriod` + `CellMenu` `items?`; X86 malformed route id → 404, query-string errors 400 (S2.4); X87 `repo.milestones`, `services.milestones`, `requireMilestone`, `LIVE_MILESTONE_JOIN`/`ON` as the only reads of `tasks.milestone_id`; X88 `PALETTE_COMMANDS`, `useCommandCtx()`, `fakeCommandCtx()` (S4.10); X90 services take `today`; X91 world `'milestones'` ⇒ `'tasks'` + `'allocations'`, `resetDb(…, { milestones })`, rows file registered (S5.1); X93 audit entity `milestone`; X95 lateness bound (M8-D6); X96 audit in the actions (M8-D25). |

### 3.2 New milestone decisions (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M8-D1 | §12 M8, PLAN §5 | Streams refined from the skeleton: tests split into **S5** (authz rows, masking, golden — depends only on S0) and **S6** (e2e + page objects + older specs), as M6-D1. S0 ships **typed stubs** of `useMilestoneMutations` and `MilestoneForm` (`src/components/milestones/`) so S3 (grid) and S4 (frontend) run in parallel; S4 implements them. `src/lib/tasks/**` (pure helpers) belongs to S4 in M8. | Ownership by path (PLAN §2.3); maximal parallelism. |
| M8-D2 | §6.2, X10 | Schema = SPEC DDL with PLAN §1.3 conventions: `timestamptz`, `date({ mode: 'string' })`, named indexes `milestones_project_id_date_idx` (partial `deleted_at is null`), `milestones_deleted_batch_idx`, `tasks_milestone_id_idx` (partial), plus `milestones_name_check length(trim(name)) > 0` (same rule as tasks/statuses). `tasks.milestone_id` single-column FK `ON DELETE SET NULL` (SPEC); **no** composite FK — same-project is checked in the service (X66). | SPEC DDL; additive check mirrors zod. |
| M8-D3 | FR-701/702/707/708, r6b M8-07 | Actions: `createMilestone`, `updateMilestone({ milestoneId, patch: { name?, date?, description?, completed? } })` (covers rename, **move** and **complete/reopen** with one authz path; returns `previous` for exact undo), `deleteMilestone`, `restoreMilestoneBatch`, `linkTasksToMilestone({ taskIds, milestoneId \| null })` (single + bulk), `revertTaskMilestones({ items })` (undo of a link). Routes: `GET /api/projects/[id]/milestones`, `GET /api/milestones/targets`. The skeleton's separate move/complete/linkTask/bulkLink are folded into these (fewer actions, same coverage). | P1/P2 with the smallest API. |
| M8-D4 | §3.2, FR-601, FR-614, D3 | Binding a task to a milestone is a **task edit** (PERM-11: M/L/Me allow, W 404); creating, editing, moving, completing, deleting and restoring a milestone is **`manage`** (PERM-15: Me 403). | §3.2 separates the two rows; binding is a task field (FR-601). |
| M8-D5 | FR-708, X66, r6b M8-02 | Delete = `deleted_at`, `deleted_batch`; `tasks.milestone_id` is **not** touched. Every read joins `milestones m on m.id = t.milestone_id and m.deleted_at is null` (one SQL fragment `repo.milestones.LIVE_MILESTONE_JOIN`, or its Drizzle-builder twin `LIVE_MILESTONE_ON`), so bound tasks read as unbound and progress/lateness ignore deleted milestones; restore clears both columns and the tasks are bound again exactly. Restore: batch must exist, `deleted_at` ≥ now − 30 days (else `VALIDATION restoreExpired`), project not archived (X42). | X66; undo is exact with zero bookkeeping. |
| M8-D6 | BR-71, FR-706, X66 | A bound task is late iff it is **not completed** and any of: a WEEK allocation with `week_start > m.date`, a DAY allocation with `period_start > m.date`, `due_date > m.date`. Plans counted = active assignments of the task **and of its live, not-completed descendants** (a bound parent warns when its subtree is planned after the date; P4). SQL bound: `a.week_start between m.date − 6 and m.date + 1096` and the comparison above (WEEK in the milestone's own week never late; DAY later in the same week is late). Milestone `late` = ≥ 1 late bound task, reported as `lateTaskCount`; computed whatever the milestone's own status (literal BR-71). **Reviewed (Q1): kept** — parents carry no assignments (BR-31), so without the subtree a bound parent could never warn about plans although FR-703 lets users bind parents; the subtree's plans *are* the parent's plans. | Literal BR-71 + X66; P4. |
| M8-D7 | BR-70, FR-704 | `MilestoneDTO`/`GridMilestone`/`CalendarMilestone` carry a server-computed `status` (`serverToday()`); light references (`MilestoneRef` in task responses) carry `completedOn` and the client computes the status with the same pure `milestoneStatus(m, useToday())`. | One function, no extra `today` parameter on M3 services. |
| M8-D8 | §7.4, X28 | `GridResponse.milestones` = **all** live milestones of the project (not windowed; small list) as `GridMilestone` (= `MilestoneDTO`: id, projectId, name, date, description, completedOn, status, late, lateTaskCount, progress), sorted by date then id; every chunk returns the same list, `mergeChunks` takes the latest. `context` gains `canManage` (M/L and not archived). The client ◆ code reads only `context.canManage` (never `context.kind`) and takes the project of a mutation from `GridMilestone.projectId`, so M9's person context (`canManage: false`, M9-D29) renders read-only ◆ unchanged (C40). | Stable merge; optimistic moves patch one list. |
| M8-D9 | FR-705, AC-701, X66 | ◆ placement: week columns → `W:<weekStart(date)>`; when the week is expanded or in day zoom → `D:<date>`, falling back to the week's "รวม" column (`W:<week>`) when that day column is absent (weekend not loaded). Several ◆ in one column: first by date then id is drawn, the rest as "+N" (button opening a list popover). | X66; M7 column model. |
| M8-D10 | FR-707, X66, §8.9 | Dragging uses pointer events on the ◆ button (no dnd-kit), shows a ghost ◆ over the target column, and on drop computes `dateForDrop(orig, targetColumn)`: day column → its date; week/"รวม" column → same weekday in that week (`dateInWeekKeepingWeekday`). Only when `context.canManage`. Optimistic patch + one undo entry + toast `moved(name, date)` with "เลิกทำ". Keyboard: focus ◆ → `Enter` opens the ◆ popover whose `DateField` changes the date; `Shift+F10` opens M7's `CellMenu` with milestone items (M7's `grid.cellMenu` shortcut entry covers it; M7's `CellMenu` gains the **additive** optional prop `items?`, its existing props and call sites unchanged). | X66 + §8.9 keyboard parity. |
| M8-D11 | FR-702, r6b M8-04 | Clicking an **empty area** of a ◆-row cell (M/L only) opens an inline create popover (`MilestoneForm`) pre-filled with the column date: week column → Monday, day column → that day, "รวม" column → Monday. The grid toolbar adds "+ milestone" (keyboard path, pre-filled with today). Members see ◆ read-only (popover without inputs; clicks on empty cells do nothing). | P1, D3. |
| M8-D12 | FR-706, §7.4 | Lateness stays fresh after grid edits without refetch: `SaveAllocationsOk` and `PlanAssignmentRangeOk` gain `lateness: MilestoneLateness \| null`, computed in the same transaction for the milestones bound to the touched tasks or their ancestors (null when none); the grid patches task rows and ◆ from it. Other changes (due date, completion, binding, delete/restore) call `invalidateMilestones(qc, projectId)`. | M6 never refetches after save (M6-D3). |
| M8-D13 | FR-601/613, X21 | `TaskDTO` gains `milestoneId` (live) and `lateForMilestone`; `ProjectTasksResponse` gains `milestones: MilestoneRef[]` (live, date order). `GroupBy` gains `'milestone'` (preference enum extended): one group per live milestone in date-then-id order (empty groups kept, header ◆ name · date · status · progress) then "ไม่ผูก milestone"; every depth; tree operations stay disabled in grouped views (M3 `treeOpsEnabled`). | Mirrors the status grouping (M3). |
| M8-D14 | FR-601/614, §7.5 | Panel field = `Select` (ไม่ผูก + live milestones, each "◆ name · 23 ต.ค. 2569"), enabled when `viewer.canEdit`; one undo entry, no toast. Bulk bar "ผูก milestone" = menu (milestones + "ไม่ผูก milestone") → `linkTasksToMilestone` → toast `linked(n, name)`/`unlinked(n)` with "เลิกทำ" = `revertTaskMilestones({ items: changed → previous })`. `previousMilestoneId` is the **raw** column value, so undo after a milestone was deleted keeps re-link semantics; tasks whose *live* value already equals the target are skipped. | P1/P2; exact undo. |
| M8-D15 | FR-661/663, §7.8, M3-D37 | Project board card: `◆ <name>` line + `⚠ เลย milestone` when late. Board filter `milestone: 'ALL' \| 'NONE' \| <id>` in component state (not a preference). `/tasks`: `TaskCard.milestoneId`, `TeamTasksResponse.milestonesByProject` (only projects present in the page), query param `milestoneId` (live milestone of a visible project, else 404); the UI enables it only when exactly one project is selected. The key joins M3's `TeamTaskFilters` (= `z.input<typeof teamTasksQuerySchema>` minus `cursor`, so adding it to the schema adds it to the type) and is read/written by `useTeamTaskFilters({ syncUrl })` like every other filter — no restructuring (M3-D41). Cards on `/tasks` show the name only (no lateness: counts-only policy). | SPEC §7.8; no cross-project leak. |
| M8-D16 | FR-907, §3.3, X24 | `CalendarResponse.milestones: CalendarMilestone[]` = live milestones of `visibleProjectIds` minus archived/deleted projects, `date ∈ [from, to)`, sorted by date then project name; chip "◆ name · project" + status glyph/text + ⚠ when late; clicking opens `/projects/<id>/overview`. `getCalendar` gains a `today` parameter (route passes `serverToday()`). | Archived projects are hidden from navigation (X42). |
| M8-D17 | FR-409, FR-702 | Overview section is a client component over `GET /api/projects/[id]/milestones` (`qk.projectMilestones`), not RSC data, so mutations update it through TanStack (no `refresh()`). Order: not-DONE by date, then DONE by date (struck through). | Same pattern as `StatusSettings` (M3). |
| M8-D18 | FR-702 `Cmd+K`, X08, C6 | Palette gains `src/components/palette/commands.ts#PALETTE_COMMANDS` (registry `{ id, label, keywords, useVisible(), run(ctx) }`) rendered as group "คำสั่ง" above the M4 search groups (`PALETTE_GROUPS` untouched); commands filter client-side on the query (match label or keyword) and show on an empty query. "สร้าง milestone" is visible iff `GET /api/milestones/targets` is non-empty (manager: non-archived projects; worker: projects where LEAD); `run` closes the palette and opens `MilestoneDialog` with the current route's project pre-selected when it is a target. `PaletteCommandCtx` is **open for additive fields**: it is built in one place (`useCommandCtx()` in `PaletteProvider.tsx`), M10 adds `navigate`, `openLeaveDialog`, `beginCreateTask`, `createPageHere` and makes `currentProjectId` prefer its palette project scope (`scope?.id ?? projectIdFromPath(pathname)`, C48). M8 tests find the command **by id** and build ctx with `fakeCommandCtx()`, and never assert the group's absence or its option count (M10 commands are visible to everyone). | No palette restructuring; M10 appends its quick commands here. |
| M8-D19 | FR-701, §7.5 | `patch.completed: true` sets `completed_on = today` (the service's `today` parameter; the action passes `serverToday()`, X90) (kept if already set), `false` clears it. **Reviewed (Q1): changed to exact undo** — `patch.completedOn: ISODate \| null` (never together with `completed`; a date must be ≤ `today`, else `VALIDATION completedInFuture`) writes that value directly; `UpdateMilestoneResult.previous.completedOn` carries the old value, so undo of complete **and** of reopen sends `{ completedOn: previous.completedOn }` and redo sends `{ completedOn: <result>.completedOn }`. | Same exact-undo rule as M3's `revertTaskStatus` (M3-D28); one optional field. |
| M8-D20 | App. A.2, X11, PLAN §3.13 | `addMilestones(db)` inserts the 7 A.2 milestones (SPEC App. A.2 constants, typed once in `scripts/lib/fixtures.ts` because the golden JSON has none — same exception as M7-D16 `addDayExample`), `created_by` = Manager, binds "UAT sign-off" to "ทำ UAT + คู่มือหน้าร้าน", one audit row per milestone (actor `null`). Not part of `seedGolden`. It is a **builder** (plain Drizzle, fixed A.2 dates, no `today` parameter, audits itself — M12's "builders" row); M12 `seed:demo` calls it after `addDayExample` (C30). | No re-typed JSON data; M12 composes it. |
| M8-D21 | FR-1201, X44 | Audit: `entity: 'milestone'` (`MILESTONE_AUDIT_ENTITY`), actions `create`/`update`/`delete`/`restore`, summaries `th.audit.milestone*`, `before`/`after` = changed fields; binding writes `entity: 'task'`, `action: 'update'`, one row per changed task (`th.audit.taskMilestoneLinked/Unlinked`). | M3-D4 precedent (per task). |
| M8-D22 | X44, PLAN §3.5 | `invalidateMilestones(qc, projectId)` = `projectMilestones(projectId)` + `gridAll({ kind: 'project', id })` + `['grid', 'person']` (M9 person grids show ◆ too) + `projectTasks(projectId)` + `teamTasksAll()` + `['calendar']`; M3's `invalidateTasks` additionally invalidates `projectMilestones(projectId)` (progress). `useTaskMutations.update` with `dueDate` and `link`/`revert` call `invalidateMilestones`. | Nothing forgets a view. |
| M8-D23 | §3.3, R4 | Masking test names: `w.milestones.p` "Milestone P-ลับ06", `w.milestones.q` "Milestone Q-ลับ05"; golden Cindy/Ivy must not see "Pipeline พร้อมใช้งาน", "Design freeze", "Beta release", "Dashboard v1 review" (r8 §4.3). | Greppable leak tests. |
| M8-D24 | CLAUDE.md deps | No new dependency (MUI, dnd-kit not needed, sonner, cmdk, TanStack already present). | — |
| M8-D25 | CLAUDE.md "thin action", PLAN §3.4.2, M3 S2.6 | Every milestone action is `zod parse → authz (requireProject / requireMilestone / requireTasks, in the action) → service (data only, no authz, no audit) → audit.log (in the action, same tx)`; no `refresh()`. Write services return the facts the audit summaries need (names, changed fields). Read services that apply visibility (`listVisibleMilestones`, `listTargets`) call `visibleProjectIds`/`projectAccess` themselves, like M3's `listTeamTasks`; routes call `requireProject` before `listProjectMilestones`. Accepted by **X96** (audit in the action, same tx, after the change, before any revalidate). Write services that need a date take `today` explicitly (`create`, `update`, `restoreBatch`; X90) and import no clock. No M8 script calls a milestone write service (`addMilestones` is a builder, M8-D20); a later script that does must mirror the action per M12-D34 (`AUDIT_IN_SERVICE[op] = false` for every milestone op). | CLAUDE.md order; same shape as M3's actions. |
| M8-D26 | PLAN §3.10, m06 review | The ◆ row is a second **header** row: M8 sets `HEADER_ROWS = 2` in M6's `src/lib/grid/columns.ts` (M6 derives `aria-rowcount`/`aria-rowindex` from `HEADER_ROWS` and `FOOTER_ROWS = 3`); nothing else shifts indexes by hand. Grid saves keep invalidating other views through M6's `invalidateAfterGridSave(qc, ctx)` (`src/lib/grid/save-invalidate.ts`), which M8 extends with `qk.projectMilestones(ctx.id)` for project contexts. | One source of row-index truth; one post-save invalidation helper. |

No DEVIATION from SPEC in M8.

---

## 4. Streams (machine-readable)

DAG: `S0 → {S1, S5}`; `S1 → {S2, S3, S4}`; `{S2, S3, S4, S5} → S6`. Concurrent sets: {S1, S5}, then {S2, S3, S4, S5}. S0 runs alone and may touch the M2–M7 files its steps name (`src/lib/schemas/{tasks,preferences}.ts`, `src/lib/contracts/{tasks,grid,calendar}.ts`, `src/server/services/{calendar,grid,allocations,tasks,teamTasks}.ts` one-line compile fixes, `src/app/api/calendar/route.ts`, `src/server/authz.ts`, `src/lib/invalidate.ts`, `e2e/fixtures.ts`) plus the existing test files/DTO builders that stop compiling because of the new required DTO fields (one-line additions only, S0.3); after G0 those files belong to the stream whose globs cover them. `src/i18n/th.ts` belongs to S0; afterwards S2 may add keys only in `audit`/`errors`/`milestones.errors`, S3 only in `milestones.grid`, S4 only in `milestones.{overview,tasks,calendar,palette,form,toast}` and `tasks.groupBy` (PLAN §2.3, Edit tool only). S1's domain file is read-only for S2–S4 (sequential).

```json
{ "milestone": 8,
  "streams": [
    { "id": "S0", "title": "Contracts: milestones schema + tasks.milestone_id + generated migration, zod, DTOs (milestones, grid/task/calendar extensions), authz requireMilestone signature, action/route/service/repo stubs, stub useMilestoneMutations + MilestoneForm, query keys + invalidateMilestones, preference groupBy 'milestone', shortcut entries, i18n (milestones + audit/errors/tasks keys), addMilestones builder, makeMilestone + world 'milestones', resetDb milestones option", "agent": "backend-engineer",
      "owns": ["src/server/db/schema.ts", "src/server/db/schema.int.test.ts", "drizzle/**", "src/domain/types.ts", "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts", "src/lib/shortcuts.ts", "src/lib/shortcuts.test.ts", "src/i18n/th.ts", "src/server/authz.ts", "src/server/actions/milestones.ts", "src/server/services/index.ts", "src/server/services/milestones.ts", "src/server/services/calendar.ts", "src/server/services/tasks.ts", "src/server/services/teamTasks.ts", "src/server/services/grid.ts", "src/server/services/allocations.ts", "src/app/api/calendar/route.ts", "src/server/repo/index.ts", "src/server/repo/milestones.ts", "src/app/api/projects/[id]/milestones/route.ts", "src/app/api/milestones/targets/route.ts", "src/components/milestones/useMilestoneMutations.ts", "src/components/milestones/MilestoneForm.tsx", "scripts/lib/fixtures.ts", "scripts/lib/fixtures.int.test.ts", "tests/helpers/**", "e2e/fixtures.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain (TDD): milestone.ts — BR-70 milestoneStatus, BR-71 lateReasons/isLateForMilestone/milestoneLateness, progress, dateInWeekKeepingWeekday, compareMilestones", "agent": "domain-engineer",
      "owns": ["src/domain/milestone*.ts"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Backend: repo/milestones (live join, lateFacts bounded query, progress), milestone services + actions (create/update/delete/restore, link/revert, same-project check, audit), requireMilestone body, routes, grid milestones + lateForMilestone + canManage, save/planRange lateness, task reads (TaskDTO, ProjectTasksResponse, TeamTasks milestoneId filter), calendar milestones, error mapping", "agent": "backend-engineer",
      "owns": ["src/server/**", "src/app/api/**", "scripts/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S2" },
    { "id": "S3", "title": "Grid: ◆ row (sticky header row, placement week/day, stacking +N, status glyphs, late ⚠), inline create on date-cell click, ◆ popover + CellMenu items, pointer drag ±7 / ±1 day, task-row late marker and →◆ label, cache patches (lateness, optimistic moves), toolbar + milestone, a11y", "agent": "grid-engineer",
      "owns": ["src/components/grid/**", "src/lib/grid/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Frontend: milestone components (useMilestoneMutations, MilestoneForm/Dialog, status chip, late badge), overview section, task list grouping + row chip, panel field + late alert, bulk link, board card + filter, /tasks card + filter, calendar ◆ chips, palette command registry + สร้าง milestone, invalidation wiring", "agent": "frontend-engineer",
      "owns": ["src/components/milestones/**", "src/components/tasks/**", "src/components/projects/**", "src/components/calendar/**", "src/components/palette/**", "src/app/(app)/projects/[id]/overview/**", "src/lib/tasks/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S4" },
    { "id": "S5", "title": "Authz matrix rows (test-first), masking milestone cases (world + golden), golden A.2 status/lateness + BR-72, older test updates", "agent": "test-engineer",
      "owns": ["tests/authz/**", "tests/golden/**", "tests/integration/**"],
      "dependsOn": ["S0"], "planSection": "5.S5" },
    { "id": "S6", "title": "E2E m8-milestones spec, page objects (grid ◆, milestones overview, tasks/board/team-tasks/calendar/palette additions), update older specs", "agent": "test-engineer",
      "owns": ["e2e/**"],
      "dependsOn": ["S2", "S3", "S4", "S5"], "planSection": "5.S6" }
  ],
  "e2e": ["e2e/m8-milestones.spec.ts"] }
```

Overlap check (concurrent sets): S2 `src/server/**`, `src/app/api/**`, `scripts/**` · S3 `src/components/grid/**`, `src/lib/grid/**` · S4 `src/components/{milestones,tasks,projects,calendar,palette}/**`, `src/app/(app)/projects/[id]/overview/**`, `src/lib/tasks/**` · S5 `tests/{authz,golden,integration}/**` · S1 `src/domain/milestone*.ts` — pairwise disjoint. `src/components/milestones/{useMilestoneMutations.ts,MilestoneForm.tsx}` are S0 stubs, then S4's (S3 only imports them).

---

## 5. Step-by-step

### 5.S0 — Contracts (backend-engineer · owns: see §4 S0)

Runs alone and ends at **G0** (`pnpm check` green with stubs). Nothing here implements behaviour except the schema, the migration, zod, i18n, the registry entries, the A.2 builder, factories and the world. No dependency is installed (M8-D24).

**S0.1 Preflight + inventory.**
- `git status` clean on tag `m7`; `pnpm db:up`; `pnpm check` green; `pnpm db:generate` → "No schema changes, nothing to migrate".
- Inventory what M3–M7 actually exported (paste into the S0 report and `PROGRESS.md › แผนของ milestone ปัจจุบัน`; **when a name differs, use the real one and report it — never rename an earlier export**):
  ```bash
  grep -n "^export" src/lib/contracts/{tasks,grid,calendar}.ts src/lib/schemas/{tasks,preferences,grid,allocations}.ts \
    src/server/authz.ts src/server/services/{tasks,teamTasks,grid,allocations,calendar,taskStatus}.ts \
    src/server/repo/{tasks,task-assignments,allocations,projects}.ts src/lib/{query-keys,invalidate,shortcuts,api,collate}.ts \
    src/lib/tasks/{group,board,optimistic}.ts src/lib/grid/{columns,fetch,merge,cache-ops,rows,save-invalidate}.ts \
    src/components/grid/{PlanGrid,VirtualGrid,GridToolbar,RowHeader,CellMenu}.tsx src/components/palette/*.tsx \
    src/components/tasks/team/{TeamTasks.tsx,useTeamTaskFilters.ts} tests/helpers/*.ts e2e/fixtures.ts e2e/pages/*.ts
  ```
  Expected (this plan's names): `TaskDTO`, `TaskCard`, `ProjectTasksResponse`, `TeamTasksResponse`, `teamTasksQuerySchema`, `GroupBy`, `groupTasks`, `buildStatusColumns`, `listProjectTasks`, `listTeamTasks`, `GridMilestone`, `GridTaskRow`, `GridResponse`, `SaveAllocationsOk`, `PlanAssignmentRangeOk`, `buildChunk`, `assembleGrid`, `services.allocations.save`/`planRange` (+ `lockAssignments` → `LockedSet.taskIds`, m06 S2.3), `applyServerResults(resp, ok: SaveAllocationsOk)`, `CalendarResponse`, `getCalendar`, `requireProject`, `requireTasks`, `projectAccess`, `visibleProjectIds`, `columnIndexOfPeriod`, `GridColumn`, `mergeChunks`, `GridModel`, `applyServerResults`, `CellMenu`, `PALETTE_GROUPS`, `usePalette`, `qk`, `invalidateTasks`, `invalidateLoad`, `invalidateCalendar`, `invalidateAfterGridSave` (M6 `src/lib/grid/save-invalidate.ts`), `HEADER_ROWS`/`FOOTER_ROWS` (M6 `src/lib/grid/columns.ts`), `getJson` (M2 `src/lib/api.ts`; pinned name, never `getJSON`), `repo.tasks.listLiveWithBlockerCounts` → `TaskListRow`, `repo.assignments.listActiveForProject` (M3-D39), `TeamTaskFilters`/`useTeamTaskFilters` (M3-D41), `Palette` page object (`group`, `option`, `pageResults`, M4), `compareThai`, `makeTask`, `makeStatuses`, `createWorld`, `resetDb`, `GridPage`, `TaskListPage`.

**S0.2 Schema + migration (`src/server/db/schema.ts`, M8-D2).**
```ts
export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  description: text('description'),
  completedOn: date('completed_on', { mode: 'string' }),
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('milestones_name_check', sql`length(trim(${t.name})) > 0`),
  index('milestones_project_id_date_idx').on(t.projectId, t.date).where(sql`${t.deletedAt} is null`),
  index('milestones_deleted_batch_idx').on(t.deletedBatch).where(sql`${t.deletedBatch} is not null`),
])
// in `tasks` (M3 left the comment "milestone_id: added by M8") — replace the comment with:
  milestoneId: uuid('milestone_id').references((): AnyPgColumn => milestones.id, { onDelete: 'set null' }),
// and add to the tasks table callback:
  index('tasks_milestone_id_idx').on(t.milestoneId).where(sql`${t.deletedAt} is null`),
export type MilestoneDbRow = typeof milestones.$inferSelect   // "Db" suffix: the name MilestoneRow belongs to the grid component (S3.3, cited by M9) — C81
```
- `pnpm db:generate --name=milestones` → one journaled file. Inspect: `CREATE TABLE "milestones"`, the check, both partial indexes, `ALTER TABLE "tasks" ADD COLUMN "milestone_id" uuid`, the FK `… REFERENCES "milestones"("id") ON DELETE set null`, `tasks_milestone_id_idx`. Never hand-edit; no custom migration is needed. `pnpm db:migrate`; `pnpm db:generate` again → "No schema changes"; `pnpm exec drizzle-kit check` OK.
- Tests first — extend `src/server/db/schema.int.test.ts › describe('milestones')`: insert ok with `date '2026-10-23'` round-tripping as the string `'2026-10-23'`; `name '  '` → `23514` (`milestones_name_check`); a task with a random `milestone_id` → `23503`; `DELETE FROM milestones WHERE id = $m` → the bound task's `milestone_id` becomes `null` and the task survives; on a fresh project holding only one milestone and one bound task (no assignments), `DELETE FROM projects` removes both in one statement (cascade); `pg_indexes` lists `milestones_project_id_date_idx`, `milestones_deleted_batch_idx`, `tasks_milestone_id_idx`; `information_schema.columns` → `tasks.milestone_id` nullable uuid.
- Done-check: `pnpm vitest run --project integration src/server/db/schema.int.test.ts`.

**S0.3 Types + DTOs.**
- `src/domain/types.ts` (type-only, X59): `export type MilestoneStatus = 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'` and `export type LateReason = 'WEEK_PLAN' | 'DAY_PLAN' | 'DUE_DATE'`.
- `src/lib/contracts/milestones.ts` (new):
```ts
import type { ISODate, MilestoneStatus } from '@/domain/types'
export type { MilestoneStatus }
export interface MilestoneRef { id: string; name: string; date: ISODate; completedOn: ISODate | null }   // light, status computed client-side (M8-D7)
export interface MilestoneProgress { done: number; total: number }                                      // live bound tasks, any depth (X66)
export interface MilestoneDTO extends MilestoneRef {
  projectId: string; description: string | null
  status: MilestoneStatus                     // BR-70 with serverToday()
  late: boolean; lateTaskCount: number        // BR-71 (M8-D6)
  progress: MilestoneProgress
}
export interface ProjectMilestonesResponse { projectId: string; today: ISODate; canManage: boolean; milestones: MilestoneDTO[] }   // date then id (UI reorders done last)
export interface MilestoneTargetsResponse { projects: { id: string; name: string; color: string }[] }   // projects where the viewer may create (M8-D18)
export interface CreateMilestoneResult { milestone: MilestoneDTO }
export type MilestoneChangeKey = 'name' | 'date' | 'description' | 'completed'
export interface MilestonePrevious { name: string; date: ISODate; description: string | null; completed: boolean; completedOn: ISODate | null }   // completedOn: exact undo (M8-D19)
export interface UpdateMilestoneResult { milestone: MilestoneDTO; previous: MilestonePrevious; changed: MilestoneChangeKey[] }
export interface DeleteMilestoneResult { projectId: string; milestoneId: string; name: string; batch: string; unlinkedTaskCount: number }
export interface RestoreMilestoneBatchResult { milestone: MilestoneDTO }
/** milestoneName/taskName feed the action's audit summaries (M8-D25); same project as the edited tasks, so nothing leaks. */
export interface LinkTasksResult { projectId: string; milestoneId: string | null; milestoneName: string | null; changed: { taskId: string; taskName: string; previousMilestoneId: string | null }[] }
export interface RevertTaskMilestonesResult { projectId: string; changed: { taskId: string; taskName: string; previousMilestoneId: string | null }[] }
/** Returned by grid saves (M8-D12): only milestones bound to the touched tasks or their ancestors. */
export interface MilestoneLateness { tasks: { taskId: string; lateForMilestone: boolean }[]; milestones: { id: string; late: boolean; lateTaskCount: number }[] }
export interface CalendarMilestone { id: string; projectId: string; projectName: string; projectColor: string; name: string; date: ISODate; status: MilestoneStatus; late: boolean }
```
- `src/lib/contracts/tasks.ts` (M3, additive): `TaskDTO` gains `milestoneId: string | null; lateForMilestone: boolean`; `ProjectTasksResponse` gains `milestones: MilestoneRef[]`; `TaskCard` gains `milestoneId: string | null` (SPEC §7.8 — removes M3-D37's omission); `TeamTasksResponse` gains `milestonesByProject: Record<string, MilestoneRef[]>`.
- `src/lib/contracts/grid.ts` (M6/M7, additive): replace `export interface GridMilestone { id; name; date; projectId }` with `export type GridMilestone = MilestoneDTO` (same four fields plus the rest); `GridResponse['context']` gains `canManage: boolean`; `SaveAllocationsOk` and `PlanAssignmentRangeOk` gain `lateness: MilestoneLateness | null`.
- `src/lib/contracts/calendar.ts` (M5, additive): `CalendarResponse` gains `milestones: CalendarMilestone[]`.
- `src/server/repo/tasks.ts` (M3, additive): `TaskListRow` gains `milestoneId: string | null` (the **live** id); S0 makes the M3 body return `null`, S2.1 fills it through `LIVE_MILESTONE_ON`. M6's grid chunk and M3's `listProjectTasks` both read it from here (one place).
- Existing tests and DTO builders (M3 `TaskDTO`/`ProjectTasksResponse`/`TaskCard`/`TeamTasksResponse` fixtures in `src/components/tasks/**` ui tests and `tests/helpers/**`, M5 `CalendarResponse` fixtures, M6 `GridResponse`/`SaveAllocationsOk` fixtures) that stop compiling get the one-line defaults `milestoneId: null`, `lateForMilestone: false`, `milestones: []`, `milestonesByProject: {}`, `canManage: false`, `lateness: null` — prefer the shared builder where one exists; never change an assertion here (S2/S5.4 update the exact-key ones on purpose).
- Done-check: `pnpm typecheck` (S0.5 stubs make existing services compile: they return `milestones: []`, `milestoneId: null`, `lateForMilestone: false`, `lateness: null`, `canManage: false` until S2).

**S0.4 Zod (`src/lib/schemas/milestones.ts`, new; `src/lib/schemas/tasks.ts`, `preferences.ts` extended).**
```ts
import { z } from '@/lib/z'
import { th } from '@/i18n/th'
export const zMilestoneName = z.string().trim()
  .min(1, { error: th.milestones.errors.nameRequired }).max(200, { error: th.milestones.errors.nameTooLong })
export const zMilestoneDate = z.iso.date({ error: th.milestones.errors.dateRequired })
export const zMilestoneDescription = z.string().max(2_000, { error: th.milestones.errors.descriptionTooLong })
  .transform((s) => (s.trim() === '' ? null : s)).nullable()
export const createMilestoneSchema = z.object({
  projectId: z.uuid(), name: zMilestoneName, date: zMilestoneDate, description: zMilestoneDescription.optional(),
})
export const milestonePatchSchema = z.object({
  name: zMilestoneName.optional(), date: zMilestoneDate.optional(),
  description: zMilestoneDescription.optional(), completed: z.boolean().optional(),
  completedOn: z.iso.date().nullable().optional(),                       // exact undo of complete/reopen (M8-D19); ≤ today checked in the service
}).refine((p) => Object.values(p).some((v) => v !== undefined), { error: th.milestones.errors.emptyPatch })
  .refine((p) => p.completed === undefined || p.completedOn === undefined, { error: th.milestones.errors.completedConflict, path: ['completedOn'] })
export const updateMilestoneSchema = z.object({ milestoneId: z.uuid(), patch: milestonePatchSchema })
export const deleteMilestoneSchema = z.object({ milestoneId: z.uuid() })
export const restoreMilestoneBatchSchema = z.object({ batch: z.uuid() })
export const linkTasksToMilestoneSchema = z.object({ taskIds: z.array(z.uuid()).min(1).max(500), milestoneId: z.uuid().nullable() })
export const revertTaskMilestonesSchema = z.object({
  items: z.array(z.object({ taskId: z.uuid(), milestoneId: z.uuid().nullable() })).min(1).max(500),
}).refine((v) => new Set(v.items.map((i) => i.taskId)).size === v.items.length, { error: th.milestones.errors.duplicateTask, path: ['items'] })
```
- `teamTasksQuerySchema` (M3): add `milestoneId: z.uuid().optional()` — this alone adds the key to M3's `TeamTaskFilters` type (`z.input<…>` minus `cursor`, M3-D41); nothing in M3's hook is restructured (S4.8 adds the URL key).
- Preferences (M1 schema, M3 key): `'tasks.groupBy': z.enum(['none', 'status', 'assignee', 'certainty', 'milestone'])` (default `'none'` unchanged). If M3's preference test used `'milestone'` as its invalid example, switch it to `'project'`.
- Tests first `src/lib/schemas/milestones.test.ts` (unit): `'  UAT sign-off  '` → `'UAT sign-off'`; `''` → `nameRequired` at `name`; 201 chars → `nameTooLong`; `date '2026-02-30'` → `dateRequired`; description `'   '` → `null`; 2 001 chars → `descriptionTooLong`; `patch: {}` → `emptyPatch`; `patch: { completed: true }` ok; `patch: { completedOn: '2026-09-16' }` and `{ completedOn: null }` ok; `{ completed: true, completedOn: '2026-09-16' }` → `completedConflict` at `completedOn`; `linkTasksToMilestoneSchema` with `milestoneId: null` ok, `taskIds: []` → error, 501 ids → error; `revertTaskMilestonesSchema` with a repeated `taskId` → `duplicateTask`; `teamTasksQuerySchema` parses `milestoneId=<uuid>`, rejects `milestoneId=abc`; preference `{ key: 'tasks.groupBy', value: 'milestone' }` parses.

**S0.5 Authz signature + stubs (bodies `throw new Error('NOT_IMPLEMENTED: <name> (M8 S2)')` via a local `notImplemented`).**
- `src/server/authz.ts`:
  ```ts
  /** Live milestone (or a batch-deleted one when includeDeleted) → its project → requireProject(need).
   *  Missing, deleted (without includeDeleted) or invisible → NotFoundError. PERM-15 callers pass 'manage'. */
  export async function requireMilestone(tx: DbOrTx, user: SessionUser, milestoneId: string, need: Need,
    o?: { includeDeleted?: boolean }): Promise<{ milestone: MilestoneDbRow } & ProjectAccessInfo>
  ```
- `src/server/repo/milestones.ts` (signatures for S2; plain Drizzle/SQL):
  ```ts
  export type { MilestoneDbRow }
  /** SQL fragment: `m.id` of a LIVE milestone for `t.milestone_id` — use with `left join milestones m on m.id = t.milestone_id and m.deleted_at is null`. */
  export const LIVE_MILESTONE_JOIN: SQL
  /** Drizzle-builder twin: `.leftJoin(milestones, LIVE_MILESTONE_ON)` + `milestoneId: milestones.id` (M3's builder queries use this one). */
  export const LIVE_MILESTONE_ON: SQL   // and(eq(milestones.id, tasks.milestoneId), isNull(milestones.deletedAt))
  export async function insertMilestone(tx: DbOrTx, row: { projectId: string; name: string; date: ISODate; description?: string | null; createdBy: string; completedOn?: ISODate | null; deletedAt?: Date | null; deletedBatch?: string | null }): Promise<MilestoneDbRow>
  export async function getLive(tx: DbOrTx, id: string): Promise<MilestoneDbRow | null>
  export async function getByBatch(tx: DbOrTx, batch: string): Promise<MilestoneDbRow | null>
  export async function lockLive(tx: Tx, id: string): Promise<MilestoneDbRow | null>                          // FOR UPDATE
  export async function listLive(tx: DbOrTx, projectId: string): Promise<MilestoneDbRow[]>                   // ORDER BY date, id
  export async function getAnyById(tx: DbOrTx, id: string): Promise<MilestoneDbRow | null>                     // live or soft-deleted (requireMilestone includeDeleted)
  /** 'ALL' (manager) = no project filter; M9 passes an array. Archived/deleted projects and deleted milestones are dropped in SQL. */
  export async function listForProjects(tx: DbOrTx, projectIds: readonly string[] | 'ALL', range?: { from: ISODate; to: ISODate }): Promise<(MilestoneDbRow & { projectName: string; projectColor: string })[]>
  export async function update(tx: Tx, id: string, set: Partial<Pick<MilestoneDbRow, 'name' | 'date' | 'description' | 'completedOn'>>): Promise<MilestoneDbRow>
  export async function softDelete(tx: Tx, id: string, batch: string): Promise<void>
  export async function restore(tx: Tx, id: string): Promise<MilestoneDbRow>
  export async function countBoundLive(tx: DbOrTx, milestoneId: string): Promise<number>
  export async function progress(tx: DbOrTx, milestoneIds: readonly string[]): Promise<Map<string, MilestoneProgress>>
  export interface LateFactsRow { taskId: string; milestoneId: string; milestoneDate: ISODate; dueDate: ISODate | null; lastWeekStart: ISODate | null; lastDayDate: ISODate | null }
  export async function lateFacts(tx: DbOrTx, scope: { projectId: string } | { milestoneIds: readonly string[] } | { boundTaskIds: readonly string[] }): Promise<LateFactsRow[]>
  ```
  `src/server/repo/index.ts`: `export * as milestones from './milestones'`.
- `src/server/services/milestones.ts`:
  ```ts
  export const MILESTONE_AUDIT_ENTITY = 'milestone' as const
  export interface Lateness { byTask: Map<string, boolean>; byMilestone: Map<string, { late: boolean; lateTaskCount: number }> }
  export async function computeLateness(tx: DbOrTx, scope: Parameters<typeof repo.milestones.lateFacts>[1]): Promise<Lateness>
  export async function latenessForTouchedTasks(tx: DbOrTx, taskIds: readonly string[]): Promise<MilestoneLateness | null>   // M8-D12
  export async function toDTOs(tx: DbOrTx, rows: readonly MilestoneDbRow[], today: ISODate): Promise<MilestoneDTO[]>
  export async function listProjectMilestones(tx: DbOrTx, user: SessionUser, projectId: string, today: ISODate): Promise<ProjectMilestonesResponse>
  export async function listTargets(tx: DbOrTx, user: SessionUser): Promise<MilestoneTargetsResponse>
  export async function listVisibleMilestones(tx: DbOrTx, user: SessionUser, range: { from: ISODate; to: ISODate }, today: ISODate): Promise<CalendarMilestone[]>   // ★ M10 home reuses
  // Write services: data only — the ACTION has already authorised (M8-D25) and writes the audit rows afterwards.
  export async function create(tx: Tx, user: SessionUser, input: z.output<typeof createMilestoneSchema>, today: ISODate): Promise<CreateMilestoneResult>
  export async function update(tx: Tx, user: SessionUser, input: z.output<typeof updateMilestoneSchema>, today: ISODate): Promise<UpdateMilestoneResult>
  export async function remove(tx: Tx, user: SessionUser, milestoneId: string): Promise<DeleteMilestoneResult>
  export async function restoreBatch(tx: Tx, user: SessionUser, row: MilestoneDbRow, today: ISODate): Promise<RestoreMilestoneBatchResult>   // row = the authorised soft-deleted milestone
  export async function linkTasks(tx: Tx, user: SessionUser, input: z.output<typeof linkTasksToMilestoneSchema> & { projectId: string }): Promise<LinkTasksResult>
  export async function revertLinks(tx: Tx, user: SessionUser, input: z.output<typeof revertTaskMilestonesSchema> & { projectId: string }): Promise<RevertTaskMilestonesResult>
  /** Pure: audit summary of an update (only date → milestoneMoved; only completion → milestoneCompleted/Reopened; else milestoneUpdated). */
  export function milestoneUpdateSummary(r: UpdateMilestoneResult): string
  /** Pure: { before, after } with only the changed fields ('completed' is written as completedOn). */
  export function milestoneAuditDiff(r: UpdateMilestoneResult): { before: Record<string, unknown>; after: Record<string, unknown> }
  ```
  `src/server/services/index.ts`: `export * as milestones from './milestones'`.
- `src/server/actions/milestones.ts` (`'use server'`):

  | Export | Schema | Returns (`{ ok: true } &`) | Authz in the action (M8-D25) |
  |---|---|---|---|
  | `createMilestone` | `createMilestoneSchema` | `CreateMilestoneResult` | `requireProject(projectId, 'manage')` (PERM-15) |
  | `updateMilestone` | `updateMilestoneSchema` | `UpdateMilestoneResult` | `requireMilestone(milestoneId, 'manage')` |
  | `deleteMilestone` | `deleteMilestoneSchema` | `DeleteMilestoneResult` | `requireMilestone(milestoneId, 'manage')` |
  | `restoreMilestoneBatch` | `restoreMilestoneBatchSchema` | `RestoreMilestoneBatchResult` | owner lookup `getByBatch` → `requireMilestone(row.id, 'manage', { includeDeleted: true })` |
  | `linkTasksToMilestone` | `linkTasksToMilestoneSchema` | `LinkTasksResult` | `requireTasks(taskIds, 'edit')` (PERM-11, M8-D4), then `requireMilestone(milestoneId, 'view')` when set |
  | `revertTaskMilestones` | `revertTaskMilestonesSchema` | `RevertTaskMilestonesResult` | `requireTasks(edit)`, then `requireMilestone(id, 'view', { includeDeleted: true })` per distinct non-null id |
  ```ts
  export const createMilestone = action<typeof createMilestoneSchema, CreateMilestoneResult>(createMilestoneSchema, async () => notImplemented('createMilestone'))
  // … same pattern for every row
  ```
- Routes: `src/app/api/projects/[id]/milestones/route.ts` → `GET = route<{ id: string }>(async () => notImplemented('GET project milestones'))` (`ProjectMilestonesResponse`); `src/app/api/milestones/targets/route.ts` → `GET = route(async () => notImplemented('GET milestone targets'))` (`MilestoneTargetsResponse`).
- Existing services compile against the extended DTOs: `services/calendar.ts#getCalendar(tx, viewer, range, today: ISODate)` gains the `today` parameter (route passes `serverToday()`; M5 tests pass `'2026-09-30'`) and returns `milestones: []`; M3/M6 builders add `milestoneId: null`, `lateForMilestone: false`, `milestones: []`, `milestonesByProject: {}`, `canManage: false`, `lateness: null` (each a one-line change; S2 fills them).
- Client stubs (M8-D1), `src/components/milestones/`:
  ```ts
  // useMilestoneMutations.ts ('use client')
  export interface MilestoneMutations {
    create(v: { projectId: string; name: string; date: ISODate; description?: string | null }): Promise<MilestoneDTO | null>
    update(m: Pick<MilestoneDTO, 'id' | 'projectId' | 'name'>, patch: MilestonePatch, o?: { toast?: 'moved' | 'completed' | 'reopened' }): Promise<void>
    remove(m: Pick<MilestoneDTO, 'id' | 'projectId' | 'name'>): Promise<void>
    link(projectId: string, taskIds: readonly string[], milestone: MilestoneRef | null, o?: { toast?: boolean }): Promise<void>
  }
  export function useMilestoneMutations(): MilestoneMutations   // stub: every method throws NOT_IMPLEMENTED (S4.1)
  // MilestoneForm.tsx ('use client')
  export interface MilestoneFormValue { name: string; date: ISODate | null; description: string }
  export interface MilestoneFormProps { initial: MilestoneFormValue; projects?: { id: string; name: string }[]; projectId?: string
    readOnly?: boolean; dense?: boolean; submitLabel: string; onSubmit(v: { projectId?: string; name: string; date: ISODate; description: string | null }): void; onCancel(): void }
  export function MilestoneForm(p: MilestoneFormProps): React.JSX.Element   // stub renders <form aria-label={th.milestones.form.createTitle} />
  ```
  `MilestonePatch = z.input<typeof milestonePatchSchema>` (exported from the schema file).
- Done-check: `pnpm typecheck`.

**S0.6 Query keys + invalidation (`src/lib/query-keys.ts`, `src/lib/invalidate.ts`, M8-D22).**
```ts
// qk additions
projectMilestones: (projectId: string) => ['projects', projectId, 'milestones'] as const,
milestoneTargets: () => ['milestones', 'targets'] as const,
// invalidate.ts
export async function invalidateMilestones(qc: QueryClient, projectId: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.projectMilestones(projectId) }),
    qc.invalidateQueries({ queryKey: qk.gridAll({ kind: 'project', id: projectId }) }),
    qc.invalidateQueries({ queryKey: ['grid', 'person'] }),          // M9 person grids show ◆ (prefix of qk.gridAll({ kind: 'person', id }))
    qc.invalidateQueries({ queryKey: qk.projectTasks(projectId) }),
    qc.invalidateQueries({ queryKey: qk.teamTasksAll() }),
    qc.invalidateQueries({ queryKey: ['calendar'] }),
  ])
}
// invalidateTasks (M3) also invalidates qk.projectMilestones(projectId)   (progress, M8-D22) — append to M3's list, nothing else changes
```
`src/lib/grid/save-invalidate.ts` (M6 `invalidateAfterGridSave(qc, ctx)`, M8-D26) belongs to S3 after G0; S3.8 appends `qk.projectMilestones(ctx.id)` for `ctx.kind === 'project'` (overview `late` badges; the grid itself is patched from `lateness`, and the task list/calendar keys are covered if M6 already lists them — add `qk.projectTasks(ctx.id)` and `['calendar']` only when absent).
Tests (extend `src/lib/invalidate.test.ts`): after `invalidateMilestones(qc, 'p')` the queries `qk.projectMilestones('p')`, `qk.gridChunk({ kind: 'project', id: 'p' }, { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false })`, `qk.gridChunk({ kind: 'person', id: 'u1' }, …)`, `qk.calendar('2026-09-28', '2026-11-09')` are invalidated and `qk.projectMilestones('q')` is not; `invalidateTasks(qc, 'p')` invalidates `qk.projectMilestones('p')`.

**S0.7 Shortcut registry (`src/lib/shortcuts.ts`, X07).** Append to scope `'grid'`: `{ id: 'grid.milestoneOpen', scope: 'grid', combos: [['Enter']], label: th.shortcuts.items.gridMilestoneOpen }`. **No** second `Shift+F10` entry: M7's `grid.cellMenu` already lists that key and the ◆ menu is the same `CellMenu` with other items (one key, one help line). `shortcuts.test.ts` keeps passing (ids unique).

**S0.8 i18n (`src/i18n/th.ts`).** Create `milestones`; add keys elsewhere (final strings; functions for parameters, PLAN §3.7):
```ts
milestones: {
  label: 'Milestone', heading: 'Milestones', diamond: '◆',
  status: { DONE: 'เสร็จแล้ว', OVERDUE: 'เลยกำหนด', DUE_SOON: 'ใกล้ถึง', UPCOMING: 'กำลังจะถึง' },
  late: 'เลย milestone',
  lateTasks: (n: number) => `เลย milestone ${n} งาน`,
  lateHint: (date: string) => `มีแผนหรือวันครบกำหนดหลังวันที่ ${date}`,
  progress: (done: number, total: number) => `เสร็จ ${done}/${total} งาน`,
  dateLine: (date: string, status: string) => `${date} · ${status}`,
  none: 'ไม่ผูก milestone',
  fields: { project: 'โปรเจค', name: 'ชื่อ milestone', date: 'วันที่', description: 'คำอธิบาย', completed: 'เสร็จแล้ว' },
  form: { createTitle: 'สร้าง milestone', editTitle: 'แก้ไข milestone', create: 'สร้าง', save: 'บันทึก', cancel: 'ยกเลิก',
    delete: 'ลบ milestone', complete: 'ทำเครื่องหมายเสร็จ', reopen: 'ยกเลิกเสร็จ', openOverview: 'ดูในภาพรวม' },
  errors: {
    nameRequired: 'กรุณาใส่ชื่อ milestone', nameTooLong: 'ชื่อ milestone ยาวได้ไม่เกิน 200 ตัวอักษร',
    dateRequired: 'กรุณาเลือกวันที่', descriptionTooLong: 'คำอธิบายยาวได้ไม่เกิน 2,000 ตัวอักษร',
    emptyPatch: 'ไม่มีอะไรเปลี่ยน', duplicateTask: 'มีงานซ้ำในรายการ',
    sameProjectOnly: 'ผูกได้เฉพาะ milestone ในโปรเจคเดียวกับงาน', restoreExpired: 'กู้คืนได้ภายใน 30 วันหลังลบ',
    notFound: 'ไม่พบ milestone',
    completedInFuture: 'วันที่เสร็จต้องไม่เกินวันนี้',
    completedConflict: 'เลือกอย่างใดอย่างหนึ่ง: ติ๊กเสร็จ หรือระบุวันที่เสร็จ',
  },
  toast: {
    created: (name: string) => `สร้าง milestone '${name}' แล้ว`,
    updated: (name: string) => `บันทึก '${name}' แล้ว`,
    moved: (name: string, date: string) => `เลื่อน '${name}' เป็น ${date} แล้ว`,
    completed: (name: string) => `'${name}' เสร็จแล้ว`,
    reopened: (name: string) => `ยกเลิกเสร็จ '${name}' แล้ว`,
    deleted: (name: string) => `ลบ milestone '${name}' แล้ว`,
    deletedUnlinked: (name: string, n: number) => `ลบ milestone '${name}' แล้ว — ${n} งานหลุดการผูก`,
    linked: (n: number, name: string) => `ผูก ${n} งานกับ '${name}' แล้ว`,
    unlinked: (n: number) => `ยกเลิกการผูก milestone ${n} งานแล้ว`,
    restoreFailed: (reason: string) => `กู้คืนไม่ได้ เพราะ${reason}`,
  },
  undoLabel: { create: 'สร้าง milestone', update: 'แก้ milestone', move: 'เลื่อน milestone', complete: 'ติ๊กเสร็จ milestone', delete: 'ลบ milestone', link: 'ผูก milestone' },
  grid: {
    rowHeader: '◆ Milestones', rowLabel: 'แถว milestone',
    addAt: (date: string) => `สร้าง milestone วันที่ ${date}`,
    diamondLabel: (name: string, date: string, status: string) => `milestone ${name} ${date} ${status}`,
    more: (n: number) => `+${n}`, moreLabel: (n: number, date: string) => `อีก ${n} milestone ในช่วง ${date}`,
    readOnly: 'เฉพาะ LEAD และ Manager แก้ milestone ได้',
    dragLabel: (name: string) => `ลากเพื่อเลื่อน ${name}`, dropHint: (date: string) => `ปล่อยเพื่อเลื่อนไป ${date}`,
    toolbarAdd: '+ milestone', taskLink: (name: string) => `→◆${name}`, taskLinkLabel: (name: string) => `ผูกกับ milestone ${name}`,
    menu: { open: 'เปิดรายละเอียด', complete: 'ทำเครื่องหมายเสร็จ', reopen: 'ยกเลิกเสร็จ', delete: 'ลบ milestone', create: 'สร้าง milestone ที่นี่' },
  },
  overview: { add: '+ เพิ่ม milestone', empty: 'ยังไม่มี milestone — เพิ่มวันที่สำคัญของโปรเจคได้ที่นี่', readOnly: 'เฉพาะ LEAD และ Manager แก้ milestone ได้',
    listLabel: 'รายการ milestone', edit: (name: string) => `แก้ไข ${name}`, remove: (name: string) => `ลบ ${name}`, completeToggle: (name: string) => `ติ๊กเสร็จ: ${name}` },
  tasks: { field: 'Milestone', fieldHint: 'งานละ 1 milestone', bulkLink: 'ผูก milestone', filter: 'milestone', allMilestones: 'ทุก milestone',
    groupHeader: (name: string, date: string) => `◆ ${name} · ${date}`, cardLabel: (name: string) => `◆ ${name}`,
    lateAlert: (name: string, date: string) => `เลย milestone '${name}' — มีแผนหรือวันครบกำหนดหลัง ${date}` },
  calendar: { chip: (name: string, project: string) => `◆ ${name} · ${project}`, chipLabel: (name: string, project: string, status: string) => `milestone ${name} โปรเจค ${project} ${status}` },
  palette: { group: 'คำสั่ง', create: 'สร้าง milestone', keywords: 'milestone มายล์สโตน หมุด กำหนดส่ง' },
},
tasks: { /* M3 … */ groupBy: { /* … */ milestone: 'milestone' }, groups: { /* … */ noMilestone: 'ไม่ผูก milestone' } },
audit: { /* … */
  milestoneCreated: (name: string) => `สร้าง milestone ${name}`,
  milestoneUpdated: (name: string) => `แก้ milestone ${name}`,
  milestoneMoved: (name: string, from: string, to: string) => `เลื่อน milestone ${name} จาก ${from} เป็น ${to}`,
  milestoneCompleted: (name: string) => `ติ๊กเสร็จ milestone ${name}`,
  milestoneReopened: (name: string) => `ยกเลิกเสร็จ milestone ${name}`,
  milestoneDeleted: (name: string, n: number) => `ลบ milestone ${name} (หลุดการผูก ${n} งาน)`,
  milestoneRestored: (name: string) => `กู้คืน milestone ${name}`,
  milestoneSeeded: (name: string) => `นำเข้า milestone ตั้งต้น ${name}`,
  taskMilestoneLinked: (task: string, milestone: string) => `ผูก ${task} กับ milestone ${milestone}`,
  taskMilestoneUnlinked: (task: string) => `ยกเลิกการผูก milestone ของ ${task}`,
},
shortcuts: { /* … */ items: { /* … */ gridMilestoneOpen: 'เปิด milestone ที่เลือก (เปลี่ยนวันที่ได้)' } },
```
Rules: no Thai outside this file (ESLint); tests import `th`.

**S0.9 A.2 builder (`scripts/lib/fixtures.ts`, M8-D20).**
```ts
/** SPEC App. A.2 milestones (the golden JSON has none — M7-D16 exception). Plain Drizzle + audit actor null. */
export const DEMO_MILESTONES = [
  { project: 'POS Upgrade', name: 'UAT sign-off', date: '2026-10-02', bindTask: 'ทำ UAT + คู่มือหน้าร้าน' },
  { project: 'POS Upgrade', name: 'Go-live สาขาแรก', date: '2026-12-21' },
  { project: 'Data Warehouse', name: 'Pipeline พร้อมใช้งาน', date: '2026-10-23' },
  { project: 'Mobile App Revamp', name: 'Design freeze', date: '2026-10-09' },
  { project: 'Mobile App Revamp', name: 'Beta release', date: '2026-11-13' },
  { project: 'CRM Migration', name: 'Data migration complete', date: '2026-11-06' },
  { project: 'Store Analytics Dashboard', name: 'Dashboard v1 review', date: '2026-12-11' },
] as const satisfies readonly { project: string; name: string; date: ISODate; bindTask?: string }[]
export async function addMilestones(db: DbOrTx): Promise<{ ids: Record<string, string> }>   // keyed by milestone name
```
Inside one transaction (or the caller's): resolve project ids by name (throws if missing), `created_by` = the user with nickname "Manager", `insertMilestone`, `UPDATE tasks SET milestone_id` for `bindTask` (live task of that project by name), one `audit.log(tx, null, { entity: 'milestone', entityId, action: 'create', projectId, summary: th.audit.milestoneSeeded(name) })`. Idempotency is not required (called after truncate).
Tests first `scripts/lib/fixtures.int.test.ts › addMilestones`: after `seedGolden` + `addMilestones` → 7 milestones, 1 bound task ("ทำ UAT + คู่มือหน้าร้าน" → UAT sign-off), 7 new `audit_log` rows with entity `milestone`, `allocations` still 57 rows summing 195.00 (BR-72), task count unchanged (no task inserted, X70 not affected).

**S0.10 Test helpers (`tests/helpers/**`, PLAN §4.3).**
```ts
// factories.ts (plain Drizzle, X59)
export async function makeMilestone(o: { project: { id: string }; name?: string; date: ISODate; createdBy: { id: string }
  completedOn?: ISODate | null; description?: string | null; deleted?: { batch: string; daysAgo: number } }): Promise<MilestoneDbRow>
export async function bindTask(task: { id: string }, milestone: { id: string } | null): Promise<void>   // UPDATE tasks SET milestone_id
```
`createWorld({ with: ['milestones'] })` implies `'tasks'` and `'allocations'` (so `w.allocations.pLeafLead` = WEEK 09-28 250, 10-05 500 exists) and adds:

| Key | Data |
|---|---|
| `w.milestones.p` | P "Milestone P-ลับ06", date `2026-10-23`, bound: `pChildB` (no plans → not late) |
| `w.milestones.pLate` | P "ส่งมอบรอบแรก P", date `2026-10-02`, bound: `pLeaf` (WEEK 10-05 = 500 > date → late, `lateTaskCount 1`) |
| `w.milestones.pDone` | P "Kickoff P", date `2026-09-15`, `completedOn '2026-09-16'`, bound: `pDone` |
| `w.milestones.q` | Q "Milestone Q-ลับ05", date `2026-10-20`, bound: `qTask` |
| `w.milestones.a` | A (archived) "Milestone A", date `2026-10-30`, bound: `aTask` |
| `w.batches.pDeletedMilestone` | P "Milestone ที่ลบแล้ว P" soft-deleted 1 day ago (batch), `pParent` still has `milestone_id` = it (reads as unbound) |
| `w.batches.pExpiredMilestone` | P "Milestone เก่า P" soft-deleted 31 days ago (restore → 400) |
| `w.batches.aDeletedMilestone` | A milestone soft-deleted 1 day ago (restore → 403) |

Smoke test `tests/helpers/world.int.test.ts › with milestones`: the rows above; `pParent.milestone_id` points at the deleted milestone; every world task still has a `status_id` of its own project (X70) and `assertCompletionInvariant` holds.
`tests/helpers/outcome.ts`: no change expected (`VALIDATION` → `'400'` exists since M6).

**S0.11 e2e fixture helpers (`e2e/fixtures.ts`).** `resetDb(fixture?, opts?: { syntheticGrid?; dayExample?; milestones?: boolean })` — `milestones: true` runs `addMilestones(tx)` after `seedGolden`/`applyFixture`/`addDayExample` in the same transaction; `milestoneIdByName(name: string): Promise<string>` (DB lookup from the Playwright process).

**S0.12 G0.** `pnpm check` green; `pnpm db:generate` → "No schema changes"; report the migration file name, the S0.1 inventory (with every name that differs from this plan) and the files of M3–M7 touched by S0.3/S0.5.

### 5.S1 — Domain `milestone.ts` (domain-engineer · owns `src/domain/milestone*.ts`)

Test-first, pure, no `Date` (X59, CLAUDE.md), dates through `src/domain/dates.ts` only (`diffDays`, `compareISO`, `addDays`, `weekStart`, `isoWeekday`), coverage ≥ 95 %. File `src/domain/milestone.ts` + `milestone.test.ts` (+ `milestone.property.test.ts`).

**S1.1 API.**
```ts
import type { ISODate, LateReason, MilestoneStatus } from './types'
export const DUE_SOON_DAYS = 7
export function milestoneStatus(m: { date: ISODate; completedOn: ISODate | null }, today: ISODate): MilestoneStatus
export interface LateFacts { completed: boolean; dueDate: ISODate | null; lastWeekStart: ISODate | null; lastDayDate: ISODate | null }
export function lateReasons(milestoneDate: ISODate, f: LateFacts): LateReason[]      // order WEEK_PLAN, DAY_PLAN, DUE_DATE
export function isLateForMilestone(milestoneDate: ISODate, f: LateFacts): boolean
export function milestoneLateness(milestoneDate: ISODate, tasks: readonly LateFacts[]): { late: boolean; lateTaskCount: number }
export function milestoneProgress(tasks: readonly { completed: boolean }[]): { done: number; total: number }
export function dateInWeekKeepingWeekday(date: ISODate, targetWeekStart: ISODate): ISODate   // FR-707 week columns (X66)
export function compareMilestones(a: { date: ISODate; id: string }, b: { date: ISODate; id: string }): number   // date, then id (byte order)
export const LATE_LOOKAHEAD_DAYS = 1096                                                       // X66 bound (3 years), shared with the SQL
```

**S1.2 `milestoneStatus` (BR-70) — tests (`today = '2026-09-30'` unless noted):**

| date | completedOn | expected |
|---|---|---|
| `2026-09-01` | `2026-09-29` | DONE (beats OVERDUE) |
| `2026-12-21` | `2026-09-30` | DONE |
| `2026-09-29` | null | OVERDUE |
| `2026-09-30` | null | DUE_SOON (today = date, SPEC §11.1) |
| `2026-10-07` | null | DUE_SOON (+7) |
| `2026-10-08` | null | UPCOMING (+8) |
| `2026-10-02` | null | DUE_SOON (A.2 UAT sign-off, r8 §4.9) |
| `2026-10-09` | null | UPCOMING (A.2 Design freeze, +9) |
| `2027-01-04` (today `2026-12-28`) | null | DUE_SOON (year boundary) |
| `2026-01-01` (today `2026-12-31`) | null | OVERDUE |
Property (fast-check over `fc.integer({ min: -400, max: 400 })` offsets): status is DUE_SOON ⇔ `0 ≤ offset ≤ 7` when not completed; completed ⇒ DONE.

**S1.3 BR-71 (`lateReasons`, `isLateForMilestone`, `milestoneLateness`) — tests, milestone `2026-10-23` (Fri) unless noted:**

| facts | expected reasons |
|---|---|
| `lastWeekStart '2026-10-26'` | `['WEEK_PLAN']` (AC-702: week 26 ต.ค.) |
| `lastWeekStart '2026-10-19'` | `[]` (WEEK row in the milestone's own week, X66) |
| milestone `2026-10-19` (Mon), `lastWeekStart '2026-10-19'` | `[]` (not `>`) |
| `lastDayDate '2026-10-24'` | `['DAY_PLAN']` (Saturday, same week) |
| `lastDayDate '2026-10-23'` | `[]` |
| `dueDate '2026-10-24'` | `['DUE_DATE']` |
| `dueDate '2026-10-23'` | `[]` |
| all three later, `completed: true` | `[]` (BR-71 "ยังไม่เสร็จ") |
| all three later | `['WEEK_PLAN', 'DAY_PLAN', 'DUE_DATE']` |
| milestone `2026-10-02`, `lastWeekStart '2026-10-05'` | `['WEEK_PLAN']` (A.2 UAT sign-off ← "ทำ UAT + คู่มือหน้าร้าน", r8 §6.11) |
| milestone `2026-11-06`, `lastWeekStart '2026-11-02'` | `[]` ("ย้ายข้อมูลลูกค้า" ends in the milestone's week) |
| milestone `2026-10-23`, `lastWeekStart '2026-10-19'` | `[]` (DW "ย้าย pipeline", r8 §4.9) |
`milestoneLateness('2026-10-23', [late, notLate, late])` → `{ late: true, lateTaskCount: 2 }`; `[]` → `{ late: false, lateTaskCount: 0 }`. `milestoneProgress([{completed:true},{completed:false}×6, …])` with 4 of 7 completed → `{ done: 4, total: 7 }` (FR-703 "เสร็จ 4/7 งาน"); `[]` → `{ 0, 0 }`.

**S1.4 `dateInWeekKeepingWeekday` (FR-707) — tests:** `('2026-10-23', '2026-10-26')` → `'2026-10-30'`; `('2026-10-23', '2026-10-12')` → `'2026-10-16'`; Sunday `('2026-10-25', '2026-11-02')` → `'2026-11-08'`; year boundary `('2026-12-31', '2027-01-04')` → `'2027-01-07'`; target not a Monday → throws `RangeError` (callers pass Mondays). Property: result's `isoWeekday` equals the input's and `weekStart(result) === targetWeekStart`. `compareMilestones` sorts `[{date:'2026-10-23',id:'b'},{date:'2026-10-02',id:'z'},{date:'2026-10-23',id:'a'}]` → z, a, b.

**S1.5 Done-check.** `pnpm vitest run --project unit src/domain/milestone --coverage` (domain ≥ 95 %) · `pnpm eslint src/domain/milestone.ts`.

### 5.S2 — Milestone backend (backend-engineer · owns `src/server/**`, `src/app/api/**`, `scripts/**`)

Starts after S1. Integration tests live next to the code (`*.int.test.ts`), are written **first**, pin `APP_NOW=2026-09-30T10:00:00+07:00` + `ALLOW_TEST_HOOKS=1`, and use `createWorld({ with: ['milestones'] })` or golden data (`seedGolden` + `addMilestones`). Rules for every step: authz before data (except the lookup that finds the owner); one `db.transaction` per action/route; services take `tx` and `today` (never read the clock, X56); every `allocations` query has a `week_start` bound; every read of `tasks.milestone_id` goes through the live join (M8-D5); no `refresh()`; no Thai literals (`th.*` only).

**S2.1 Repo (`src/server/repo/milestones.ts`, M8-D5/D6).**
- `LIVE_MILESTONE_JOIN = sql\`left join milestones m on m.id = t.milestone_id and m.deleted_at is null\`` and the column expression `m.id as milestone_id`; `LIVE_MILESTONE_ON = and(eq(milestones.id, tasks.milestoneId), isNull(milestones.deletedAt))` for builder queries (`.leftJoin(milestones, LIVE_MILESTONE_ON)`, select `milestoneId: milestones.id`) — the only ways task reads expose a milestone id. `repo.tasks.listLiveWithBlockerCounts` (M3-D39) gets the join once, so `TaskListRow.milestoneId` is live for both `listProjectTasks` and M6's `buildChunk`. A raw `TaskRow.milestoneId` (e.g. from `requireTasks().tasks` or `select().from(tasks)`) is **never** mapped into a DTO — the `pParent` cases (raw id = a deleted milestone) in S2.2/S2.5/S2.7 prove it on every read path. A unit guard test `src/server/repo/milestone-join-guard.test.ts` scans `src/server/**/*.ts` (except schema, this repo file, tests) and fails if `milestone_id`/`milestoneId` is read in a file that contains neither `LIVE_MILESTONE_JOIN` nor `LIVE_MILESTONE_ON` (write-only files — `UPDATE tasks SET milestone_id` in `services/milestones.ts` — are allow-listed by name).
- `lateFacts(tx, scope)` — one query (X66 bound; depth ≤ 2 so two explicit levels instead of a recursive CTE):
  ```sql
  with bound as (
    select t.id as task_id, m.id as milestone_id, m.date as milestone_date, t.due_date
    from tasks t join milestones m on m.id = t.milestone_id and m.deleted_at is null
    where t.deleted_at is null and t.completed_on is null
      and (/* scope */ t.project_id = $projectId  |  m.id = any($milestoneIds)  |  t.id = any($boundTaskIds))
  ), members as (                        -- the bound task + live, not-completed descendants (M8-D6)
    select b.task_id, b.task_id as member_id from bound b
    union all
    select b.task_id, c.id from bound b join tasks c on c.parent_id = b.task_id and c.deleted_at is null and c.completed_on is null
    union all
    select b.task_id, g.id from bound b join tasks c on c.parent_id = b.task_id and c.deleted_at is null
      join tasks g on g.parent_id = c.id and g.deleted_at is null and g.completed_on is null
  ), plans as (
    select mm.task_id, a.granularity, a.week_start, a.period_start
    from members mm
    join task_assignments ta on ta.task_id = mm.member_id and ta.deleted_at is null
    join bound b on b.task_id = mm.task_id
    join allocations a on a.task_assignment_id = ta.id
     and a.week_start >= b.milestone_date - 6 and a.week_start <= b.milestone_date + 1096   -- week_start rule (X65/X66)
     and a.period_start > b.milestone_date
  )
  select b.task_id, b.milestone_id, b.milestone_date, b.due_date,
         max(p.week_start) filter (where p.granularity = 'WEEK') as last_week_start,
         max(p.period_start) filter (where p.granularity = 'DAY') as last_day_date
  from bound b left join plans p on p.task_id = b.task_id
  group by b.task_id, b.milestone_id, b.milestone_date, b.due_date
  ```
  (For WEEK rows `period_start = week_start`, so `period_start > date` is BR-71's `week_start > date`.) Dates map as strings (`date({ mode: 'string' })` / `::text`).
- `progress(tx, ids)` = `select m.id, count(t.id) filter (where t.completed_on is not null)::int as done, count(t.id)::int as total from milestones m left join tasks t on t.milestone_id = m.id and t.deleted_at is null where m.id = any($1) group by m.id`.
- `listForProjects(tx, ids | 'ALL', range?)` joins `projects p` (`p.deleted_at is null and p.archived_at is null`), `m.deleted_at is null`, `m.project_id = any($ids)` unless `'ALL'`, optional `m.date >= $from and m.date < $to`, `ORDER BY m.date, p.name, m.id`.
- Tests first `src/server/repo/milestones.int.test.ts` (world): `lateFacts({ projectId: P })` → `pLeaf` row with `lastWeekStart '2026-10-05'`, `pChildB` row with both null; `pDone` absent (completed); `pParent` absent (its milestone is deleted); a DAY row of `pChildAMember` on `2026-10-13` with `pChildA` bound to a milestone dated `2026-10-12` → `lastDayDate '2026-10-13'`; a WEEK row on `2029-10-29` (> date + 1096) is ignored; binding the **parent** `pParent` to a live milestone dated `2026-09-01` → `lastWeekStart '2026-09-28'` via `pChildA`'s assignment (descendant plans); a soft-deleted assignment's rows are ignored. `progress([w.milestones.pDone.id])` → `{ done: 1, total: 1 }`.

**S2.2 Services (`src/server/services/milestones.ts`, FR-701–708, X66, M8-D3–D6/D14/D19/D21).**
- `computeLateness(tx, scope)` → `lateFacts` → for each row `isLateForMilestone(row.milestoneDate, { completed: false, … })` (S1) → `byTask`; group by milestone → `milestoneLateness` → `byMilestone` (milestones without late tasks get `{ late: false, lateTaskCount: 0 }` when asked by id).
- `toDTOs(tx, rows, today)` → `progress` + `computeLateness({ milestoneIds })` + `milestoneStatus(row, today)`; sorted with `compareMilestones`.
Write services assume the action has authorised (M8-D25, S2.3) and never call `audit.log`; they return what the audit summary needs.
- `create`: `insertMilestone({ …, createdBy: user.id })` → `{ milestone: DTO }` (status from `today`).
- `update`: `lockLive` (null → `NotFoundError`) → build `set` only from fields that differ (`completed: true` → `completedOn = row.completedOn ?? today`; `false` → `null`; `completedOn: d` → `d > today` → `ValidationError(th.milestones.errors.completedInFuture)`, else `completedOn = d`) → nothing differs → return the current DTO with `changed: []` → else `update` + `updated_at = now()` → `{ milestone, previous: { name, date, description, completed: row.completedOn != null, completedOn: row.completedOn }, changed }` (a `completedOn` patch reports `'completed'`). `milestoneUpdateSummary(r)`: only `date` → `th.audit.milestoneMoved(name, formatThaiDate(previous.date), formatThaiDate(milestone.date))` (`src/lib/format.ts` is isomorphic, allowed on the server); only `completed` → `milestoneCompleted`/`milestoneReopened` by the new value; otherwise `milestoneUpdated(name)`.
- `remove`: `batch = crypto.randomUUID()` (server side) → `unlinkedTaskCount = countBoundLive` → `softDelete` → result. **Never** writes `tasks.milestone_id` (M8-D5).
- `restoreBatch(tx, user, row, today)`: `row.deletedAt < now − 30 days` (timestamp arithmetic on `timestamptz`, not a plan date) → `ValidationError(th.milestones.errors.restoreExpired)` → `restore` → `{ milestone: DTO }`. The bound tasks are bound again without any write to `tasks`.
- `linkTasks(tx, user, { taskIds, milestoneId, projectId })` (the action has checked tasks, milestone visibility and same project): `SELECT t.id, t.name, t.milestone_id AS raw, m.id AS live … ${LIVE_MILESTONE_JOIN} WHERE t.id = ANY($ids) ORDER BY t.id FOR UPDATE OF t` → skip rows whose `live === milestoneId` (null = null) → `UPDATE tasks SET milestone_id = $m, updated_at = now() WHERE id = ANY($changedIds)` → `{ projectId, milestoneId, milestoneName, changed: [{ taskId, taskName, previousMilestoneId: raw }] }` (M8-D14).
- `revertLinks`: writes exactly the given raw values (no skip, so a deleted milestone's id comes back), returns the inverse with task names.
- `listProjectMilestones(tx, user, projectId, today)` (route authorises with `requireProject(view)` first; archived readable): `projectAccess` → `listLive` → `toDTOs` → `{ projectId, today, canManage: role ∈ {MANAGER, LEAD} && !archived, milestones }`.
- `listTargets`: manager → all projects with `archived_at is null and deleted_at is null`; worker → those where `project_members.role = 'LEAD'`; sorted with `compareThai`.
- `listVisibleMilestones(tx, user, range, today)`: `vis = visibleProjectIds(tx, user)` → `listForProjects(vis === 'ALL' ? 'ALL' : [...vis], range)` (archived/deleted dropped in SQL; an empty set returns `[]` without a query) → status + lateness (`computeLateness({ milestoneIds })`) → `CalendarMilestone[]` (no description, no task data).
- `latenessForTouchedTasks(tx, taskIds)` (M8-D12): ancestors of the touched tasks (≤ 2 levels, live) ∪ the tasks themselves that have a live milestone → none → `null`; else `computeLateness({ milestoneIds: <their milestone ids> })` → `{ tasks: [{ taskId, lateForMilestone }] for every live bound task of those milestones, milestones: [{ id, late, lateTaskCount }] }`.
- Tests first `src/server/services/milestones.int.test.ts` (world unless noted):
  Cases that check authz or audit call the **actions** inside `asUser(w.users.<x>, …)` (PLAN §4.3, `outcomeOf`); pure data cases call the services in a transaction.
  - `create` — action as lead on P `{ name: '  Beta  ', date: '2026-11-13' }` → name `'Beta'`, `status 'UPCOMING'`, `progress { 0, 0 }`, one audit row (`entity 'milestone'`, `project_id = P`, summary `th.audit.milestoneCreated('Beta')`); as member → `'403'`; as outsider → `'404'`; on A → `'403'`.
  - `update` — rename → audit `milestoneUpdated`; date `2026-10-23 → 2026-10-30` → `previous.date '2026-10-23'`, audit `milestoneMoved`; `completed: true` → `completedOn '2026-09-30'`, `status 'DONE'`; again `completed: true` → `changed: []`, **no** audit row; `completed: false` → `status 'DUE_SOON'` for a `2026-10-02` milestone; exact undo (M8-D19): `pDone` (`completedOn '2026-09-16'`) → `completed: false` → `previous.completedOn '2026-09-16'` → `patch: { completedOn: '2026-09-16' }` → `completedOn '2026-09-16'` again (not `'2026-09-30'`); `completedOn: '2026-10-01'` → `'400'` `completedInFuture`.
  - `progress` (FR-703) — P milestone bound to `pChildA`, `pChildB`, `pParent` (any depth) → `{ 0, 3 }`; complete `pChildA` through M3 `setStatus` (X71) → `{ 1, 3 }`; delete `pChildB` through M3 `deleteTaskTree` → `{ 1, 2 }` (live tasks only); restore its batch → `{ 1, 3 }`.
  - `delete/restore` (FR-708, X66) — delete `w.milestones.p` → `unlinkedTaskCount 1`; `listProjectTasks` → `pChildB.milestoneId === null`; `GET` milestones no longer lists it; `tasks.milestone_id` column of `pChildB` still equals the milestone id (raw); `restoreMilestoneBatch` → `pChildB.milestoneId === w.milestones.p.id` again; expired batch → `'400'`; `aDeletedMilestone` → `'403'`; random batch → `'404'`.
  - `link` — `pChildB` → `pLate` as member → allowed (PERM-11), `changed` has the previous raw id and `taskName`, one audit row `taskMilestoneLinked`; same target again → `changed: []`, no audit; `qTask` + P milestone as manager → `'400'` `sameProjectOnly` (M8-D4/X66); P task + Q milestone as lead → `'404'` and no Q name in the error; `pParent` (raw = deleted milestone) → set `null` → skipped (live already null), raw kept; `revertLinks` restores raw ids exactly (incl. a deleted milestone's id).
  - `AC-702` (golden) — `seedGolden`; Cindy creates CRM "Data cutover" `2026-10-23`; link "ย้ายข้อมูลลูกค้า" (WEEK 10-26 = 375) → `listProjectTasks(CRM)` task `lateForMilestone: true`; `listProjectMilestones` → `late: true, lateTaskCount: 1`; relink it to "Data migration complete" `2026-11-06` → `late: false` (WEEK 11-02 is the milestone's own week).
  - `listTargets` — golden: Manager → 5 projects; Cindy → `['CRM Migration', 'POS Upgrade']` (collator order); Ivy → `[]`; after archiving CRM, Cindy → POS only.

**S2.3 Authz + actions (`src/server/authz.ts` body, `src/server/actions/milestones.ts`, M8-D25).**
- `requireMilestone`: `getLive` (or `getAnyById` when `includeDeleted`) → null → `NotFoundError` → `requireProject(tx, user, row.projectId, need)` → `{ milestone: row, role, archived }`.
- Every action is thin, CLAUDE.md order — zod parse (by `action()`) → authz → service → audit → no `refresh()` (all milestone views are TanStack; the overview section is client-fetched, M8-D17):
  ```ts
  export const updateMilestone = action(updateMilestoneSchema, async (input, { user }) =>
    db.transaction(async (tx) => {
      const acc = await authz.requireMilestone(tx, user, input.milestoneId, 'manage')            // 404 invisible · 403 Me / archived
      const r = await services.milestones.update(tx, user, input, serverToday())
      if (r.changed.length > 0) await audit.log(tx, user, { entity: MILESTONE_AUDIT_ENTITY, action: 'update', entityId: r.milestone.id,
        projectId: acc.milestone.projectId, summary: services.milestones.milestoneUpdateSummary(r), ...services.milestones.milestoneAuditDiff(r) })
      return r
    }))
  ```
  - `createMilestone`: `requireProject(projectId, 'manage')` → `create` → audit `create` `milestoneCreated(name)`, `after: { name, date, description }`.
  - `deleteMilestone`: `requireMilestone(manage)` → `remove` → audit `delete` `milestoneDeleted(name, unlinkedTaskCount)`.
  - `restoreMilestoneBatch`: `repo.milestones.getByBatch` (owner lookup, allowed before authz; null → `NotFoundError`) → `requireMilestone(row.id, 'manage', { includeDeleted: true })` (Me 403, W 404, archived 403 **before** the 30-day check) → `restoreBatch(tx, user, row, today)` → audit `restore` `milestoneRestored(name)`.
  - `linkTasksToMilestone`: `acc = requireTasks(taskIds, 'edit')` (cross-project ids → M3's `VALIDATION sameProjectOnly`) → when `milestoneId` is set: `m = requireMilestone(milestoneId, 'view')` (invisible → 404, never reveals another project's milestone) → `m.milestone.projectId !== acc.projectId` → `ValidationError(th.milestones.errors.sameProjectOnly)` (X66) → `linkTasks(tx, user, { ...input, projectId: acc.projectId })` → one audit row per changed task (`entity 'task'`, `action 'update'`, `taskMilestoneLinked(taskName, milestoneName)` / `taskMilestoneUnlinked(taskName)`, `before: { milestoneId: previousMilestoneId }`, `after: { milestoneId }`).
  - `revertTaskMilestones`: `requireTasks(edit)` → each distinct non-null `milestoneId`: `requireMilestone(id, 'view', { includeDeleted: true })` and same project, else `NotFoundError` → `revertLinks` → audit per changed task.
- Error mapping (M1 `mapDbError`, backstop only): `23503` on `tasks_milestone_id_milestones_id_fk` → `NOT_FOUND`; `23514` on `milestones_name_check` → `VALIDATION`.

**S2.4 Routes.**
- `GET /api/projects/[id]/milestones` → `route<{ id: string }>(async (_req, { user, params }) => db.transaction(async (tx) => { await authz.requireProject(tx, user, params.id, 'view'); return services.milestones.listProjectMilestones(tx, user, params.id, serverToday()) }, { isolationLevel: 'repeatable read', accessMode: 'read only' }))`; malformed id → 404 (same as M3 routes).
- `GET /api/milestones/targets` → `listTargets`. Both return `Cache-Control: private, no-store` (M1 `route()`).
- Tests `src/app/api/projects/[id]/milestones/route.int.test.ts`: as member on P → 200 with 3 live milestones (`pLate`, `p`, `pDone` sorted by date: `pDone` 09-15, `pLate` 10-02, `p` 10-23), `canManage false`; as lead → `canManage true`; on A as lead → `canManage false`; as outsider → 404 and the body has no "Milestone P-ลับ06".

**S2.5 Grid (`src/server/services/grid.ts`, X28, M8-D8, BR-72).** In `buildChunk` after the task rows: `milestones = toDTOs(tx, listLive(tx, ctx.id), today)` (all live, not windowed); `lateness = computeLateness(tx, { projectId: ctx.id })`; task rows `milestoneId` = `TaskListRow.milestoneId` (live; `repo.tasks.listLiveWithBlockerCounts` already carries it after S2.1), `lateForMilestone = lateness.byTask.get(id) ?? false`; `context.canManage = access.role ∈ {MANAGER, LEAD} && !archived`. `assembleGrid` gains the two inputs (pure; unit test updated). Tests first — extend `src/server/services/grid.int.test.ts`:
  - `milestones` — world P as member → `milestones` = 3 entries, `pLate.status 'DUE_SOON'`, `pLate.late true`, `p.late false`; task row `pLeaf.milestoneId = pLate.id`, `lateForMilestone true`; `pParent.milestoneId null` (deleted milestone); no Q milestone; `context.canManage false`; as lead `true`; archived A as lead → `false`.
  - `BR-72` — golden + `addMilestones` + bind every task to some milestone: every `people[u].capacity`, every task `totals` and `assignee.rowTotal` deep-equal the run without milestones.
  - `A.2` — golden + `addMilestones`, POS as cindy: `milestones` = UAT sign-off (`DUE_SOON`, `late true`, `lateTaskCount 1`, `progress { 0, 1 }`) and Go-live สาขาแรก (`UPCOMING`, `late false`); task row "ทำ UAT + คู่มือหน้าร้าน" `lateForMilestone true`.

**S2.6 Save + plan-range lateness (`services/allocations.ts`, M8-D12).** At the end of `save` and of `planRange` (apply only), inside the same transaction: `lateness = await milestones.latenessForTouchedTasks(tx, locked.taskIds)` (M6's `LockedSet.taskIds` from `lockAssignments`, m06 S2.3 — the assignments M6 locked for this save) → added to `SaveAllocationsOk` / `PlanAssignmentRangeOk`. No extra lock, no audit change, no `refresh()`. Tests first (extend `allocations.int.test.ts`): world `pChildB` bound to `w.milestones.p` (10-23) — assign lead to `pChildB`, save WEEK `2026-10-26 = 100` → `lateness.tasks` contains `{ taskId: pChildB, lateForMilestone: true }` and `milestones` `{ id: p, late: true, lateTaskCount: 1 }`; clearing it → `late: false`; a save on an unbound task with no bound ancestor → `lateness: null`; `pChildA` (child of `pParent` whose milestone is deleted) → `null`.

**S2.7 Task reads (`services/tasks.ts#listProjectTasks`, `services/teamTasks.ts#listTeamTasks`, X21, M8-D13/D15).**
- `listProjectTasks`: `milestoneId` comes from `TaskListRow.milestoneId` (`repo.tasks.listLiveWithBlockerCounts`, live join added once in S2.1; assignees still from `repo.assignments.listActiveForProject`, M3-D39); `lateness = computeLateness(tx, { projectId })` → `lateForMilestone`; `milestones = listLive(tx, projectId).map(toRef)` (`{ id, name, date, completedOn }`).
- `listTeamTasks`: add `LIVE_MILESTONE_JOIN` to its card query → `TaskCard.milestoneId`; `q.milestoneId` → `getLive` (null → `NotFoundError`), its project ∉ `vis` → `NotFoundError`, else `and t.milestone_id = $milestoneId` (live by construction); `milestonesByProject` = `listLive` refs for the project ids present in the page only (one query `where project_id = any($pageProjectIds)`).
- Update on purpose (M3-D42 marks them M3-only, C58): M3's exact-key `tasks.int.test.ts › listProjectTasks › shape` gains `milestoneId`, `lateForMilestone` on `TaskDTO` and `milestones` on the response; any exact-key assertion on `TaskCard`/`TeamTasksResponse` in `team-tasks.int.test.ts` gains `milestoneId`/`milestonesByProject`. Add keys only; every other assertion stays.
- Tests first: `tasks.int.test.ts › milestones` — `pLeaf { milestoneId: pLate.id, lateForMilestone: true }`, `pChildB { milestoneId: p.id, lateForMilestone: false }`, `pParent.milestoneId null`; `milestones` has 3 refs in date order; `team-tasks.int.test.ts › milestoneId` — as member `?milestoneId=<pLate>` → only `pLeaf`; `?milestoneId=<q>` as member → 404; as outsider → only `qTask`; cards carry `milestoneId`; `milestonesByProject` keys ⊆ projects of the cards and never contains Q for member; the AC-616 test (Peter) also asserts that no POS milestone name/id is in the body (golden + `addMilestones`).

**S2.8 Calendar (`services/calendar.ts#getCalendar`, FR-907, X24, M8-D16).** `milestones = listVisibleMilestones(tx, viewer, { from, to }, today)` (the `today` parameter and the route's `serverToday()` were added in S0.5). Tests first — extend `calendar.int.test.ts`: golden + `addMilestones`, `from 2026-09-28, to 2026-11-09`: Cindy → `['UAT sign-off', 'Data migration complete']` (POS 10-02, CRM 11-06) and nothing from DW/Mobile/Store; Peter → `['Pipeline พร้อมใช้งาน']` (DW 10-23); Manager → exactly `['UAT sign-off', 'Design freeze', 'Pipeline พร้อมใช้งาน', 'Data migration complete']` (Beta release 11-13 is ≥ `to`); archive CRM → Cindy loses "Data migration complete"; a soft-deleted milestone is absent; `UAT sign-off.status 'DUE_SOON'`, `late true`.

**S2.9 Done-check.** `pnpm db:up` · `pnpm vitest run --project integration src/server scripts` · `pnpm vitest run --project unit src/server` (join guard) · `pnpm eslint src/server src/app/api scripts` · `pnpm typecheck` (own paths clean). Report any contract change as a `request`.

### 5.S3 — ◆ row on the plan grid (grid-engineer · owns `src/components/grid/**`, `src/lib/grid/**`)

Starts after S1, in parallel with S2/S4 (code against S0's contracts and S0's stubs of `useMilestoneMutations`/`MilestoneForm`). Pure helpers in `src/lib/grid/**` are **test-first** (`unit`); components get focused `ui` tests with `offsetWidth`/`offsetHeight` stubs; full interaction is S6's Playwright. Rules: the ◆ row is part of the existing `VirtualGrid` scroll container (one container, two virtualizers, `useFlushSync: false`); cells are memoised plain `div`s with one CSS Module class and `data-*` state; colours only from tokens (`var(--milestone)`, `var(--today)`); every state also has a glyph **and** text (§8.9); strings from `th.milestones.*` (new keys only under `milestones.grid`); keys via `e.code` first (X49); no `localStorage`. Reuse M6/M7 names: `GridColumn`, `buildColumns`, `columnIndexOfPeriod`, `mergeChunks`, `GridModel`, `applyServerResults`, `useSaveAllocations`, `CellMenu`, `GridToolbar`, `RowHeader`, `VirtualGrid`.

**S3.1 Pure ◆ model (`src/lib/grid/milestones.ts`, FR-705/707, AC-701, X66, M8-D9/D10/D11).**
```ts
import type { GridColumn } from './columns'
import type { GridMilestone, GridResponse, PeriodKey } from '@/lib/contracts/grid'
import type { MilestoneLateness } from '@/lib/contracts/milestones'
/** D:<date> when that day column exists (expanded week / day zoom), else W:<weekStart(date)>; null when outside the timeline. */
export function milestoneColumnKey(date: ISODate, cols: readonly GridColumn[]): PeriodKey | null
/** column index → milestones in that column, sorted by compareMilestones (S1). */
export function placeMilestones(ms: readonly GridMilestone[], cols: readonly GridColumn[]): Map<number, GridMilestone[]>
/** Drop target → new date: D: column → its date; W: (week or "รวม") column → same weekday in that week (dateInWeekKeepingWeekday). */
export function dateForDrop(orig: ISODate, col: GridColumn): ISODate
/** Click on an empty ◆-row cell → pre-filled date: D: → its date; W: → its weekStart (Monday). */
export function dateForCellClick(col: GridColumn): ISODate
/** Column under an x offset measured from the start of the scrollable timeline (binary search on col.offset). */
export function columnAtX(cols: readonly GridColumn[], x: number): number
export function applyMilestonePatch(r: GridResponse, id: string, patch: Partial<Pick<GridMilestone, 'name' | 'date' | 'completedOn' | 'status'>>): GridResponse
export function removeMilestone(r: GridResponse, id: string): GridResponse
export function applyLateness(r: GridResponse, l: MilestoneLateness | null): GridResponse   // task rows lateForMilestone + ◆ late/lateTaskCount; others untouched
```
Column shape is M6-D35's (`GridColumn { key; kind: ColKind ('W' | 'D'); role: 'week' | 'day' | 'weekTotal'; weekStart; date; width; offset }`, `buildColumns(weeks, expanded, dayDatesByWeek)`); the helpers decide day vs week from the key prefix (`D:`/`W:`) and use `col.date`/`col.weekStart`, and locate columns only through M6's `columnIndexOfPeriod(cols, key)`. Tests first `src/lib/grid/milestones.test.ts` with columns from `buildColumns(weeks, expanded, dayDatesByWeek)`:
- weeks `[2026-10-12, 2026-10-19, 2026-10-26]`, nothing expanded → `milestoneColumnKey('2026-10-23') = 'W:2026-10-19'` (AC-701 week part); expanded `{2026-10-19}` with Mon–Fri day dates → `'D:2026-10-23'` (AC-701 day part); `'2026-10-25'` (Sunday, no Sunday column loaded) → `'W:2026-10-19'` (the "รวม" column); `'2031-01-01'` → `null`.
- `placeMilestones` — 10-20 and 10-23 in week zoom → one entry `[10-20, 10-23]` at the index of `W:2026-10-19`; expanded → two entries.
- `dateForDrop('2026-10-23', col W:2026-10-26)` → `'2026-10-30'`; `col W:2026-10-12` → `'2026-10-16'`; `col D:2026-10-22` → `'2026-10-22'`; the "รวม" column `W:2026-10-19` → `'2026-10-23'` (unchanged).
- `dateForCellClick(W:2026-10-19)` → `'2026-10-19'`; `(D:2026-10-21)` → `'2026-10-21'`.
- `columnAtX` — offsets `[0, 64, 128]` (M6 week width 64): x 0 → 0, 63 → 0, 64 → 1, 1 000 → last.
- `applyMilestonePatch` moves `date` and keeps `milestones` sorted; `applyLateness({ tasks: [{ taskId: t1, lateForMilestone: true }], milestones: [{ id: m1, late: true, lateTaskCount: 1 }] })` flips only `t1` and `m1`; `null` → same object.

**S3.2 Model merge + save results (`src/lib/grid/merge.ts`, `src/lib/grid/cache-ops.ts`, M8-D8/D12).**
- `GridModel` gains `milestones: GridMilestone[]` (from the most recently fetched chunk — every chunk carries the full list) and `context.canManage`.
- `applyServerResults(resp, ok: SaveAllocationsOk)` (M6 already takes the whole result, m06 S3.6) additionally applies `applyLateness(resp, ok.lateness)`; no signature change.
- Tests first (extend `merge.test.ts`, `cache-ops.test.ts`): two chunks with different `milestones` → model takes the later chunk's; `applyServerResults` with `lateness` flips the task row and the ◆ flag; without `lateness` (null) nothing changes.

**S3.3 `MilestoneRow` (`src/components/grid/MilestoneRow.tsx`, `MilestoneRow.module.css`, FR-705, §8.3, M8-D9).**
- A sticky header row **above** M6's period header (PLAN §3.10 "milestone row from M8"): `role="row"` `aria-rowindex={1}`, first cell `role="rowheader"` with `th.milestones.grid.rowHeader` (sticky left, `NAME_W`), then one `role="gridcell"` per **virtual** column (`data-testid="ms-cell-<periodKey>"`, `aria-label={th.milestones.grid.rowLabel}` on the row). Height 28 px. Row indexes are **not** shifted by hand: set `HEADER_ROWS = 2` in M6's `src/lib/grid/columns.ts` (M8-D26) — `VirtualGrid` derives the period header's `aria-rowindex` (2), the body rows and `aria-rowcount` (M6's formula `HEADER_ROWS + viewRows.length + 1 /* quick-add row */ + FOOTER_ROWS`, m06 S3.9) from it; update only the `PlanGrid.test.tsx` expectations that read those numbers.
- Props stay open for additive optional fields: M9 adds `projectLabel?` (project-name prefix on ◆ in the person grid, C76) without changing M8's call site. The component name `MilestoneRow` is not reused for any type (the repo row type is `MilestoneDbRow`, C81).
- Context guard (C40, M9-D29): `MilestoneRow` and its popover/drag/create code read only `model.context.canManage`, never `context.kind`; mutations take `projectId` from the `GridMilestone`. `canManage === false` (member, archived, or M9's `kind: 'person'`) → ◆ open the read-only popover, no drag, no create on empty cells, no toolbar button. UI test: a `{ kind: 'person', canManage: false }` model renders ◆ and opens the read-only popover.
- Each placed column renders its first ◆ as a `<button data-testid="ms-<id>" data-status={status} data-late={late} data-period-key={key}>`: glyph ◆ in `var(--milestone)`, the name (ellipsis; full text in the shared `CellTooltip`), and status glyphs **with visually hidden text**: DONE ✓ + `th.milestones.status.DONE`, OVERDUE ❗ + `status.OVERDUE`, DUE_SOON ⏰ + `status.DUE_SOON`, UPCOMING (no glyph) + `status.UPCOMING`, late ⚠ + `th.milestones.lateTasks(n)`; accessible name `th.milestones.grid.diamondLabel(name, formatThaiDate(date, 'medium'), th.milestones.status[status])` (+ `lateTasks(n)` when late). More than one in the column → a `+N` button (`th.milestones.grid.more(n)`, `aria-label moreLabel(n, formatWeekHeader(week))`) opening an MUI `Popover` that lists every ◆ of that column as buttons with the same behaviour.
- Tooltip (`tooltipFor` in `src/lib/grid/tooltip.ts`, extend): name, `formatThaiDate`, status, `th.milestones.progress(done, total)`, `th.milestones.lateTasks(n)` when late, description (first 200 chars).
- The `--today` line continues through the ◆ row; holiday/leave styles do not apply to it.
- Tests first `src/components/grid/MilestoneRow.test.tsx` (`ui`, offset stubs, golden-like model): renders `rowheader` "◆ Milestones"; UAT sign-off at `ms-cell-W:2026-09-28` with name `diamondLabel('UAT sign-off', '2 ต.ค. 2569', 'ใกล้ถึง')`, hidden text `th.milestones.lateTasks(1)` and `data-late="true"`; two ◆ in one week → one ◆ + "+1"; DONE ◆ contains hidden `th.milestones.status.DONE`; no element relies on colour alone (every ◆ has text).

**S3.4 Create from a date cell (FR-702, M8-D11).** When `model.context.canManage`: a click on an **empty area** of a ◆-row cell (target is not a ◆ / `+N` button) or `Enter` on a focused empty ◆-row cell opens an MUI `Popover` anchored to the cell with `<MilestoneForm dense initial={{ name: '', date: dateForCellClick(col), description: '' }} submitLabel={th.milestones.form.create} …/>` (S0 stub → S4 implementation); submit → `useMilestoneMutations().create({ projectId, name, date, description })` → on success `qc.setQueriesData(qk.gridAll(ctx), (r) => r && { ...r, milestones: sortedInsert(r.milestones, m) })` (the hook's own `invalidateMilestones` then refreshes). Members: no handler, the cell shows nothing on hover. Toolbar (`GridToolbar`): button `th.milestones.grid.toolbarAdd` (visible when `canManage`) opening the same popover with `date = today`. Tests (`ui`, mutations mocked): as manager clicking `ms-cell-W:2026-10-19` renders the form with `initial.date '2026-10-19'`; as member nothing opens; the toolbar button exists only when `canManage`.

**S3.5 ◆ popover and menu (`MilestonePopover.tsx`; M7 `CellMenu`; FR-707 keyboard, FR-708, §8.9, M8-D10).**
- Click or `Enter`/`Space` on a ◆ → `MilestonePopover` (MUI `Popover`, focus moves into it, `Esc` returns focus to the ◆): heading (name), date line `th.milestones.dateLine(formatThaiDate(date), status text)`, progress, late hint `th.milestones.lateHint(formatThaiDate(date))` when late, link `th.milestones.form.openOverview` → `/projects/<id>/overview`. With `canManage`: `MilestoneForm dense` (name + date + description; the `DateField` is the keyboard way to move ◆) → `update(m, patch, { toast: patch.date ? 'moved' : undefined })`; buttons `th.milestones.form.complete` / `reopen` → `update(m, { completed })` and `th.milestones.form.delete` → `remove(m)` (no confirm; undo toast from the hook). Without `canManage`: read-only text + `th.milestones.grid.readOnly`.
- `Shift+F10` / context-menu key / right click on a ◆ opens M7's `CellMenu` with items `th.milestones.grid.menu.{open, complete|reopen, delete}` (M/L) or `open` only (Me); on an empty ◆-row cell (M/L) the menu has `menu.create`. Extend M7's `CellMenu` (m07 S3.9: MUI `Menu`, right click / context-menu key / `Shift+F10`, default item `th.grid.day.collapseToWeek`) **additively**: new optional prop `items?: CellMenuItem[]` with `export interface CellMenuItem { id: string; label: string; disabled?: boolean; onSelect(): void }` — when given, they replace the default collapse item; every existing prop and M7 call site is unchanged and M7's `CellMenu` tests stay green untouched. The key is M7's `grid.cellMenu` entry (no new shortcut, S0.7).
- Optimistic grid patch for every edit made here: `qc.setQueriesData(qk.gridAll(ctx), (r) => r && applyMilestonePatch(r, id, patch))` (delete → `removeMilestone`) **before** calling the hook; the hook's `onSettled` (`invalidateMilestones`) reconciles or reverts.
- Tests (`ui`): `Enter` on a focused ◆ opens the popover with `DateField` labelled `th.milestones.fields.date` (manager) or no inputs + `readOnly` text (member); `Shift+F10` opens a menu whose items are `menu.open`, `menu.complete`, `menu.delete`; choosing delete calls `remove` once and patches the cache (spy).

**S3.6 Drag ◆ (`useMilestoneDrag.ts`, FR-707, X66, M8-D10).**
```ts
export function useMilestoneDrag(o: { cols: readonly GridColumn[]; scrollEl: RefObject<HTMLElement | null>; enabled: boolean
  onDrop(m: GridMilestone, newDate: ISODate): void }): { onPointerDown(e: React.PointerEvent, m: GridMilestone): void; drag: { id: string; targetIdx: number } | null }
```
- `enabled = model.context.canManage`; otherwise the ◆ has `aria-disabled` drag semantics off (click still opens the popover).
- `pointerdown` (primary button) records the start; a move ≥ 4 px starts dragging (`setPointerCapture`), below that it is a click. While dragging: `targetIdx = columnAtX(cols, e.clientX − timelineLeft + scrollEl.scrollLeft)`; a ghost ◆ is drawn in that column with `th.milestones.grid.dropHint(formatThaiDate(dateForDrop(m.date, cols[targetIdx])))` (visually hidden, `aria-live="polite"`). `Escape` cancels. `pointerup` → `newDate = dateForDrop(...)`; equal → nothing; else optimistic `applyMilestonePatch(…, { date: newDate })` + `onDrop` → `useMilestoneMutations().update(m, { date: newDate }, { toast: 'moved' })` (one undo entry: `update(m, { date: old })`, toast "เลื่อน … · เลิกทำ").
- No auto-scroll in MVP: far moves use the popover date field (documented in §9 R8).
- Tests: pure parts are S3.1; a `ui` test dispatches `pointerdown`/`pointermove` (+ 70 px)/`pointerup` on a ◆ with offset stubs (week width 64) → `onDrop(m, '2026-10-30')` for a 10-23 milestone; a 2 px move → no drop, popover opens; disabled for member.

**S3.7 Task rows: binding label + late marker (`RowHeader.tsx`, FR-706, AC-702).** Task and merged rows whose `task.milestoneId` resolves in `model.milestones` show a small label `th.milestones.grid.taskLink(name)` (§8.3 "→◆UAT", `aria-label taskLinkLabel(name)`) and, when `task.lateForMilestone`, a ⚠ chip with the visible text `th.milestones.late` and the tooltip `th.milestones.lateHint(formatThaiDate(m.date))`; `data-late-for-milestone="true"` on the row header. Tests (`ui`): a late merged row shows the text "เลย milestone"; an unbound row shows neither label.

**S3.8 Freshness after saves (M8-D12, M8-D26).** `useSaveAllocations` success path already writes `applyServerResults` into every chunk; S3.2 makes it carry `lateness`. Views outside the grid (overview `late`/`lateTaskCount`) are refreshed by extending M6's `invalidateAfterGridSave(qc, ctx)` in `src/lib/grid/save-invalidate.ts` with `qk.projectMilestones(ctx.id)` when `ctx.kind === 'project'` (plus `qk.projectTasks(ctx.id)` / `['calendar']` only if M6 does not list them yet) — no second post-save helper; extend its test (`save-invalidate.test.ts`: a project save invalidates `qk.projectMilestones(p)`, a person save does not touch `projectMilestones`). The FR-612 dialog lives in `src/components/tasks/**` (S4) and calls `applyLateness` from this file (S4.11). Test (`save-queue.test.ts` extend): a save result with `lateness` flips the task row's `lateForMilestone` in the cache without a refetch (fetch spy not called).

**S3.9 Accessibility.** The ◆ row is reachable by Tab (◆ buttons are tabbable; empty cells are focusable with `tabIndex -1` and reached by `ArrowUp` from the period header row when `canManage`); `aria-rowindex`/`aria-colindex` stay contiguous (M7 rule); popovers trap focus and return it; every glyph has hidden text. UI test: `aria-rowcount` = `HEADER_ROWS + viewRows.length + 1 + FOOTER_ROWS` (M6's formula; the `+ 1` is the project grid's quick-add row) with `HEADER_ROWS === 2` (computed from the constants, not a literal); the ◆ row has `aria-rowindex 1`; the first ◆ has `aria-colindex` equal to its period column's.

**S3.10 Done-check.** `pnpm vitest run --project unit src/lib/grid` · `pnpm vitest run --project ui src/components/grid` · `pnpm eslint src/components/grid src/lib/grid` · `pnpm typecheck` (own paths clean).

### 5.S4 — Milestone UI: overview, tasks, board, `/tasks`, calendar, palette (frontend-engineer · owns `src/components/{milestones,tasks,projects,calendar,palette}/**`, `src/app/(app)/projects/[id]/overview/**`, `src/lib/tasks/**`)

Starts after S1, in parallel with S2/S3. All strings from `th` (new keys only under `milestones.{overview,tasks,calendar,palette,form,toast}` and `tasks.groupBy`/`tasks.groups`); MUI 9 API only (`slots`/`slotProps`, `sx`); reads through TanStack Query + `getJson`, writes through server actions + `unwrap()`; undo through M1's `useUndo().push(entry, { toast })` (sonner 8 s, `Cmd+Z`); **no confirm dialog** anywhere (P2); dates through `DateField` (ISO ↔ Dayjs only there, X50) and `formatThaiDate`; `useToday()` for client-side status (M8-D7). Pure helpers in `src/lib/tasks/**` are test-first (`unit`).

**S4.1 Milestone building blocks (`src/components/milestones/`, replaces the S0 stubs).**
- `useMilestoneMutations()` (M8-D3/D14/D19/D22): every mutation `useMutation({ mutationKey: ['milestones', projectId], scope: { id: 'milestones:' + projectId }, … })`, `unwrap(await action(input))`, `onSettled → invalidateMilestones(qc, projectId)`, errors → `toast.error(err.message)`.

  | Method | Optimistic (`qk.projectMilestones`) | Toast | `undo()` | `redo()` |
  |---|---|---|---|---|
  | `create` | — (insert on success) | `toast.created(name)` | `deleteMilestone({ milestoneId })` (keeps the batch) | `restoreMilestoneBatch({ batch })` |
  | `update` date (move) | patch date | `toast.moved(name, formatThaiDate(date))` | `updateMilestone({ patch: { date: previous.date } })` | same patch again |
  | `update` completed | patch `completedOn`/status | `toast.completed` / `reopened` | `updateMilestone({ patch: { completedOn: previous.completedOn } })` (exact date back, M8-D19) | `updateMilestone({ patch: { completedOn: result.milestone.completedOn } })` |
  | `update` name/description | patch | — (text edit, no undo entry, as M3) | — | — |
  | `remove` | drop the row | `toast.deleted(name)` / `deletedUnlinked(name, n)` | `restoreMilestoneBatch({ batch })` → failure → `toast.restoreFailed(msg)` | `deleteMilestone` (new batch kept) |
  | `link` | `patchMilestone` on `qk.projectTasks` (S4.3) | `toast.linked(n, name)` / `unlinked(n)` when `o.toast` | `revertTaskMilestones({ items: changed → previousMilestoneId })` | `linkTasksToMilestone` again |
- `MilestoneForm` (controlled MUI inputs + `createMilestoneSchema`/`milestonePatchSchema` `safeParse` on submit; `fieldErrors` → helper texts): optional project `Select` (when `projects` given), name `TextField` (autoFocus, `slotProps.htmlInput.maxLength 200`), `DateField` (`th.milestones.fields.date`, required), description multiline (hidden when `dense`), submit (`Enter` in name submits) + cancel (`Esc`). `readOnly` renders text only.
- `MilestoneDialog` (MUI `Dialog`, `slotProps.paper` `aria-labelledby`, title `th.milestones.form.createTitle`, `fullScreen` below `sm`) wrapping `MilestoneForm` with the project `Select` over `GET /api/milestones/targets` (`qk.milestoneTargets()`); success → close + `toast.created` (from the hook).
- `MilestoneStatusChip({ status })` — MUI `Chip` outlined: icon by status (`CheckCircleOutlined` DONE · `ErrorOutline` OVERDUE · `ScheduleOutlined` DUE_SOON · `EventOutlined` UPCOMING) + label `th.milestones.status[status]` (text always visible, never colour alone). `MilestoneLateBadge({ count?, hint? })` — `WarningAmberOutlined` + `th.milestones.late` (or `lateTasks(count)`), `Tooltip` = `hint`.
- `useProjectMilestones(projectId)` = `useQuery({ queryKey: qk.projectMilestones(projectId), queryFn: ({ signal }) => getJson<ProjectMilestonesResponse>(\`/api/projects/${projectId}/milestones\`, { signal }) })`; `useMilestoneTargets(enabled)` likewise for `qk.milestoneTargets()` (`staleTime 60_000`).
- Tests first (`ui`): `MilestoneForm.test.tsx` — empty name → `th.milestones.errors.nameRequired`; Enter with valid values calls `onSubmit({ name: 'Beta', date: '2026-11-13', description: null })`; `useMilestoneMutations.test.tsx` (actions mocked) — `remove` pushes one undo entry whose `undo` calls `restoreMilestoneBatch({ batch })` and shows `deletedUnlinked('Beta', 2)`; `update` with a date pushes `moved`; `link` with `o.toast` shows `linked(2, 'Beta')` and its undo sends `revertTaskMilestones` with the previous ids; reopening a milestone completed on `2026-09-16` pushes an entry whose `undo` sends `{ completedOn: '2026-09-16' }`; `MilestoneStatusChip.test.tsx` — each status renders its Thai text.

**S4.2 Overview section (`src/components/projects/ProjectMilestones.tsx`, `src/app/(app)/projects/[id]/overview/page.tsx`, FR-409/702/703/708, M8-D17).**
- The overview page (RSC, authz first, M2) renders `<ProjectMilestones projectId={id} />` after M2's info card and before M3's `StatusSettings`. Heading `th.milestones.heading`.
- Data `useProjectMilestones`. Order (M8-D17): not-DONE by date, then DONE by date. Row (`role="listitem"` in a list labelled `th.milestones.overview.listLabel`): ◆ (`var(--milestone)`, `aria-hidden`), name, `formatThaiDate(date, 'medium')`, `MilestoneStatusChip`, `th.milestones.progress(done, total)`, `MilestoneLateBadge count={lateTaskCount}` when late, description (secondary text). DONE rows: name struck through + ✓ chip.
- `canManage`: "+ เพิ่ม milestone" (`th.milestones.overview.add`) → inline `MilestoneForm` (date empty) → `create`; per row: `Checkbox` (`aria-label completeToggle(name)`) → `update({ completed })`; edit `IconButton` (`th.milestones.overview.edit(name)`) → inline form → `update` (date change → moved toast); delete `IconButton` (`th.milestones.overview.remove(name)`) → `remove` (no confirm). Otherwise read-only + `th.milestones.overview.readOnly` caption. Empty → `EmptyState` `th.milestones.overview.empty`.
- Tests first `ProjectMilestones.test.tsx` (`ui`, query data seeded): rows ordered DUE_SOON 10-02, UPCOMING 10-23, DONE 09-15 last; late row shows "เลย milestone 1 งาน"; member sees no add/edit/delete/checkbox; clicking delete as lead calls `remove` with no `dialog` in the DOM.

**S4.3 Pure task helpers (`src/lib/tasks/{group,board,optimistic}.ts`, FR-613/663/614, M8-D13/D15).**
```ts
// group.ts — GroupBy gains 'milestone'; TaskGroup.kind gains 'milestone' | 'noMilestone' (+ milestoneId?)
export function groupTasks(rows, by, ctx: { projectCertainty; displayName; statuses; milestones: readonly MilestoneRef[] }): TaskGroup[]
  // 'milestone': one group per live milestone, compareMilestones order (empty kept), then 'noMilestone' (key 'milestone:none'); every depth; DFS order inside
// board.ts — buildStatusColumns options gain milestone: 'ALL' | 'NONE' | string (default 'ALL')
// optimistic.ts
export function patchMilestone(tasks: readonly TaskDTO[], ids: readonly string[], milestoneId: string | null): TaskDTO[]   // lateForMilestone untouched (server refetch)
```
Tests first: `group.test.ts › milestone` — refs `[{ m2, 10-23 }, { m1, 10-02 }]`, rows A→m1, B→m2, C→none, child of A unbound → groups `m1 [A]`, `m2 [B]`, `noMilestone [C, A's child]`; an unused milestone keeps an empty group; `board.test.ts › milestone` — `milestone: m1` keeps only cards bound to m1 (parents included when bound), `'NONE'` keeps unbound cards, `'ALL'` = M3 behaviour; `optimistic.test.ts` — `patchMilestone([a, b], [a], 'm1')` changes only `a.milestoneId`.

**S4.4 Task list (`TaskRow.tsx`, `TaskToolbar.tsx`, FR-613, FR-706).** Group-by `Select` gains `th.tasks.groupBy.milestone`; milestone group header = `th.milestones.tasks.groupHeader(name, formatThaiDate(date, 'medium'))` + `MilestoneStatusChip` (client status via `milestoneStatus(ref, useToday())`) + `th.milestones.progress(done, total)` computed over **all** live rows of the group (not only visible ones); the none-group header `th.tasks.groups.noMilestone`. Rows bound to a live milestone show a small `◆ name` chip (`th.milestones.tasks.cardLabel(name)`); `lateForMilestone` rows add `MilestoneLateBadge` with hint `th.milestones.lateHint(date)`. Tree operations stay disabled while grouped (M3 `treeOpsEnabled`). Test (`TaskList.milestone.test.tsx`): late row shows the text "เลย milestone"; group by milestone renders headers in date order and the none-group last.

**S4.5 Task panel (`TaskPanel.tsx`, FR-601, FR-706, AC-702, M8-D14).** Under the status field: `Select` labelled `th.milestones.tasks.field` with options `th.milestones.none` + each ref `"◆ name · 23 ต.ค. 2569"`, value = `task.milestoneId ?? ''`, disabled when `!viewer.canEdit`; change → `link(projectId, [task.id], ref, { toast: false })` (one undo entry, no toast). When `task.lateForMilestone`: `Alert severity="warning"` with `WarningAmberOutlined` and `th.milestones.tasks.lateAlert(name, formatThaiDate(date))` (text, never colour alone). Test (`TaskPanel.milestone.test.tsx`): choosing "Data cutover" calls `link` with that ref; a late task renders the alert text; archived → select disabled.

**S4.6 Bulk link (`BulkBar.tsx`, FR-614).** Button `th.milestones.tasks.bulkLink` → MUI `Menu` (refs in date order + `th.milestones.none`) → `link(projectId, selectedIds, ref | null, { toast: true })` (all selected ids, any depth — binding parents is allowed). Test: two selected rows + pick "Beta" → one `link` call with both ids.

**S4.7 Board (`src/components/tasks/board/`, FR-661/663, M8-D15).** The `TaskCard` component (m03 S3.16; shared by `/tasks`, M9 and M10, X74) gains an optional prop `milestone?: { name: string; late: boolean } | null` (absent → renders exactly as in M3, so M9/M10 call sites need no change); M3's "No milestone (X21)" note is superseded. It renders `th.milestones.tasks.cardLabel(name)` on its own line and, when `late`, `MilestoneLateBadge` (text). The project board passes it from `data.milestones` + `row.lateForMilestone`. Board toolbar (board view only) gains a `Select` `th.milestones.tasks.filter` with `th.milestones.tasks.allMilestones` · `th.milestones.none` · each milestone, held in component state (not a preference, M8-D15) and passed to `buildStatusColumns`. Tests (`TaskBoard.milestone.test.tsx`): a bound card shows "◆ UAT sign-off"; filter = that milestone leaves only its cards; column counts update.

**S4.8 `/tasks` (`src/components/tasks/team/TeamTasks.tsx`, FR-663, §7.8, M8-D15).** Cards and list rows pass `milestone = card.milestoneId ? { name: milestonesByProject[card.projectId].find(…).name, late: false } : null` (no lateness on `/tasks`). Filter bar gains `Select` `th.milestones.tasks.filter` enabled only when the project filter is set; options from `useProjectMilestones(projectId)`. State: the `milestoneId` key of M3's `TeamTaskFilters` (already in the type via S0.4), owned by `useTeamTaskFilters({ syncUrl })` (`src/components/tasks/team/useTeamTaskFilters.ts`, M3-D41) — add `milestoneId` to the hook's URL read/write key list (written with `history.replaceState` **only when `syncUrl`**, so M9's `syncUrl={false}` embed stays URL-free) and make its project setter clear `milestoneId`; no new state object, no prop, no restructuring. It is sent as the `milestoneId` query param because the filters object is part of `qk.teamTasks(filters)`. Tests (extend M3's `useTeamTaskFilters`/`TeamTasks` tests): with project CRM selected the milestone select lists CRM milestones and the request carries `milestoneId=`; without a project it is disabled; changing the project clears it; with `syncUrl={false}` `history.replaceState` is never called.

**S4.9 Calendar ◆ (`src/components/calendar/{MonthGrid,AgendaList}.tsx`, `MilestoneChip.tsx`, FR-907, X24, M8-D16).** For each day, `data.milestones` with that date render **before** leave chips as `MilestoneChip`: a `Link` to `/projects/<projectId>/overview` with text `th.milestones.calendar.chip(name, projectName)`, `aria-label chipLabel(name, projectName, statusText)`, a 3 px inline-start border in `projectColor` plus the ◆ glyph in `var(--milestone)`, status glyph + hidden text (as S3.3) and the ⚠ text when `late`. They count toward M5's `splitVisible` limit and the `dayLabel(date, n)` count; the `+N` popover lists them too. `AgendaList` days with only milestones are listed. Pointer-down on a chip never starts a leave selection (M5 rule). Tests (extend `MonthGrid.test.tsx`): `day-2026-10-02` shows "◆ UAT sign-off · POS Upgrade" as a link to the POS overview and the hidden text `th.milestones.status.DUE_SOON`; a day with 1 milestone + 3 leave entries shows 3 chips + "+1"; dragging from a milestone chip does not call `onSelectRange`.

**S4.10 Palette command (`src/components/palette/{commands.ts,CommandsGroup.tsx,PaletteProvider.tsx,CommandPalette.tsx}`, FR-702, X08, M8-D18).** M4's `PALETTE_GROUPS` (`src/components/palette/groups.tsx`, M4-D37e) and its `map({ server })` input stay untouched.
```ts
/** Open for additive fields (C48): M10 adds navigate, openLeaveDialog, beginCreateTask, createPageHere. Built only by useCommandCtx(). */
export interface PaletteCommandCtx { close(): void; pathname: string; currentProjectId: string | null; openMilestoneDialog(o: { projectId?: string }): void }
export interface PaletteCommand { id: string; label: string; keywords: string; useVisible(): boolean; run(ctx: PaletteCommandCtx): void }
export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { id: 'milestone.create', label: th.milestones.palette.create, keywords: th.milestones.palette.keywords,
    useVisible: () => (useMilestoneTargets(true).data?.projects.length ?? 0) > 0,
    run: (ctx) => { ctx.close(); ctx.openMilestoneDialog({ projectId: ctx.currentProjectId ?? undefined }) } },
]   // M10 appends สร้าง task / สร้างหน้า / แจ้งลา / ไปหน้าวันนี้ here
export function matchCommand(c: Pick<PaletteCommand, 'label' | 'keywords'>, q: string): boolean   // '' → true; case-insensitive substring of label or keywords
/** Calls every command's useVisible() in array order (PALETTE_COMMANDS is a module constant → stable hook order), then filters by visibility and matchCommand. */
export function useVisibleCommands(q: string): PaletteCommand[]
export function projectIdFromPath(pathname: string): string | null   // /^\/projects\/([0-9a-f-]{36})/ → id; M10 uses it as its scope fallback
```
- `useVisibleCommands` loops over the constant array; the one hook call inside the loop carries `// eslint-disable-next-line react-hooks/rules-of-hooks -- PALETTE_COMMANDS is a module-level constant, so the hook order never changes` (CLAUDE.md: a disable needs a reason).
- `CommandsGroup` renders nothing when `useVisibleCommands(q)` is empty; otherwise `<Command.Group heading={th.milestones.palette.group}>` with one `Command.Item value={\`cmd:${id}\`}` per command (`onSelect` → `c.run(ctx)`), placed **before** the groups rendered from `PALETTE_GROUPS`; on an empty query it shows together with `th.palette.hint`.
- `PaletteProvider` holds `milestoneDialog: { open: boolean; projectId?: string }`, renders `<MilestoneDialog>` once and builds the ctx in exactly one hook, `useCommandCtx()` (`close`, `pathname = usePathname()`, `currentProjectId = projectIdFromPath(pathname)`, `openMilestoneDialog`); the dialog pre-selects `currentProjectId` only when it is among the targets. M10 extends `useCommandCtx()` (its fields, scope-first `currentProjectId`) without touching M8's fields.
- Tests first, independent of M10's additions: `commands.test.ts` (unit) — the command is taken **by id** (`PALETTE_COMMANDS.find((c) => c.id === 'milestone.create')`), never by index or array length; `matchCommand(cmd, 'mile')`, `('มายล์')`, `('')` → true, `('งาน')` → false; `run(fakeCommandCtx({ currentProjectId: POS }))` calls `close` then `openMilestoneDialog({ projectId: POS })`; `projectIdFromPath('/projects/<uuid>/plan')` → the uuid, `('/home')` → null. `fakeCommandCtx(over: Partial<PaletteCommandCtx> = {}): PaletteCommandCtx` lives in `src/components/palette/commands.test-utils.ts` and returns `{ close: vi.fn(), pathname: '/', currentProjectId: null, openMilestoneDialog: vi.fn(), ...over } as PaletteCommandCtx` (the cast keeps it compiling when M10 adds required fields; M10 adds its `vi.fn()` defaults there). `CommandPalette.test.tsx` (extend M4's) — with targets `[POS]` and pathname `/projects/<POS>/plan`, typing "milestone" shows the option named `th.milestones.palette.create` inside the group `th.milestones.palette.group` (selected by name, M4-D37d); Enter closes the palette and opens the dialog with POS selected; with targets `[]` there is **no option** named `th.milestones.palette.create` (nothing asserted about the group itself — M10 commands keep it visible); M4's page-search assertions still pass unchanged.

**S4.11 Wiring in existing task code (`src/components/tasks/**`, M8-D12/D22).** `useTaskMutations.update` → when the patch has `dueDate` and the task has a live milestone → `invalidateMilestones(qc, projectId)`; `invalidateTasks` (S0) already refreshes progress after status/delete/restore/create. The M6 FR-612 `PlanRangeDialog` grid cache write uses `applyLateness(r, ok.lateness)` (`ok` = the `PlanAssignmentRangeOk` of the apply call — `lateness` sits on the result, not on `applied`) (import from `src/lib/grid/milestones.ts`; if S3's file is not merged yet, code against S0's `MilestoneLateness` type and resolve at G2). Test: `useTaskMutations` spy — a due-date update on a bound task invalidates `qk.projectMilestones`.

**S4.12 Done-check.** `pnpm vitest run --project unit src/lib/tasks src/components/palette` · `pnpm vitest run --project ui src/components/milestones src/components/tasks src/components/projects src/components/calendar src/components/palette` · `pnpm eslint src/components src/lib/tasks "src/app/(app)/projects/[id]/overview"` · `pnpm typecheck` (own paths clean).

### 5.S5 — Authz rows, masking, golden (test-engineer · owns `tests/authz/**`, `tests/golden/**`, `tests/integration/**`)

Starts right after S0 (rows are written test-first from SPEC §3.2; they fail with `NOT_IMPLEMENTED` until S2 lands).

**S5.1 Rows `tests/authz/rows/milestones.ts`** (registered in `tests/authz/rows/index.ts`) — the full table is §7.2. Shared constants as M7: `VIEW = { M: 'allow', L: 'allow', Me: 'allow', W: '404' }`, `MANAGE = { M: 'allow', L: 'allow', Me: '403', W: '404' }`, `ARCH = { M: '403', L: '403', Me: '403', W: '404' }`, `ALL404 = { M: '404', L: '404', Me: '404', W: '404' }`. Mutating `allow` rows declare `audit: { entity: 'milestone' | 'task', projectId: (w) => w.P.id }` (X44: exactly one new audit row). Each `run` uses world ids, e.g. `run: (w) => updateMilestone({ milestoneId: w.milestones.p.id, patch: { date: '2026-10-30' } })`. `TT-MS*` rows call `GET /api/tasks?milestoneId=…` through the route handler (`GET(new Request(...), { params: Promise.resolve({}) })`).

**S5.2 Masking (`tests/authz/masking.int.test.ts › describe('milestones (M8)')`, §3.3, M8-D23).** World `with: ['milestones']`:
- as `outsider`: `GET /api/projects/{P}/milestones` → 404 and the body contains neither "Milestone P-ลับ06" nor `w.milestones.p.id`; `GET /api/calendar?from=2026-09-28&to=2026-11-09` → contains "Milestone Q-ลับ05", none of P's milestone names/ids; `GET /api/tasks` → `milestonesByProject` keys = `[Q]`; `GET /api/milestones/targets` → `{ projects: [] }`.
- as `member`: `GET /api/grid/project/{P}` → `milestones` names ⊆ P's, body without "Milestone Q-ลับ05"/`w.milestones.q.id`; `GET /api/calendar` (same range) → no Q milestone; `GET /api/tasks?milestoneId={q}` → 404 and the error body has no Q name.
- as `lead`: `linkTasksToMilestone({ taskIds: [pLeaf], milestoneId: q })` → 404 without Q names.
- golden (r8 §4.3): `seedGolden` + `addMilestones`; Cindy and Ivy `GET /api/calendar?from=2026-09-28&to=2027-01-04` (three requests within M5's 42-day cap: `09-28→11-09`, `11-09→12-21`, `12-21→01-04`) bodies contain none of "Pipeline พร้อมใช้งาน", "Design freeze", "Beta release", "Dashboard v1 review"; Peter's contain "Pipeline พร้อมใช้งาน" and "Dashboard v1 review" but not "UAT sign-off".

**S5.3 Golden (`tests/golden/milestones.int.test.ts`, r8 §4.9/§6.11, BR-72).** `seedGolden` + `addMilestones`, `APP_NOW` pinned, manager:
- `listProjectMilestones` per project → statuses exactly r8's table (UAT sign-off `DUE_SOON`; Design freeze, Pipeline, Data migration complete, Beta release, Dashboard v1 review, Go-live `UPCOMING`); UAT sign-off `late true`, `lateTaskCount 1`, `progress { 0, 1 }`; every other `late false`, `progress { 0, 0 }`.
- Binding through `services.milestones.linkTasks` (one tx each): "ย้าย pipeline ขึ้น BigQuery" → Pipeline (10-23) → `late false`; "พัฒนา front-end" → Beta release (11-13; plan ends 11-09) → `late false`; "ออกแบบ flow ใหม่" → Design freeze (10-09; plan to 10-26) → `late true`; "ย้ายข้อมูลลูกค้า" → Data migration complete (11-06; plan to 11-02) → `late false` (own week, X66).
- BR-72: after all bindings `repo.allocations.loadByUserWeek` over `[2026-08-31, 2027-01-04)` sums to `{ total: 19 500, committed: 11 625 }` and every `expected.F1.byUserWeek` cell is unchanged; `capacity.loadCapacity` for all six users over the same range equals the run without milestones.

**S5.4 Older tests.** Update only what M8 changes on purpose (M3-D42 marks these M3-only, C58): M3's exact-key `src/server/services/tasks.int.test.ts › listProjectTasks › shape` and any exact-key `TaskCard`/`TeamTasksResponse` assertion are updated by **S2.7** (S2 owns `src/server/**`); S5 updates exact-key copies under `tests/**` (masking/authz bodies compared whole) by adding `milestoneId`/`lateForMilestone`/`milestones`/`milestonesByProject`; M3's G2 check `grep -rn "milestone" src/components/tasks … # expect no hits` is an M3-only gate and is **not** re-run from M8 on (§6); M5's calendar masking block gains `milestones: []` expectations where it compares whole bodies; M6's grid golden/route tests that assert `milestones: []` switch to "no milestones because none exist in golden" (still `[]` without `addMilestones`). Never weaken an older assertion. Done-check: `pnpm vitest run --project integration tests` (report which rows stay red until S2 lands).

### 5.S6 — E2E `m8-milestones` (test-engineer · owns `e2e/**`)

Runs after S2–S5. The integrator runs Playwright at G2; this stream writes specs and page objects only (`pnpm exec playwright test --list`).

**S6.1 Page objects.**
```ts
// e2e/pages/grid.ts — additions to M6/M7 GridPage
milestoneRow(): Locator                                       // getByRole('row', { name: th.milestones.grid.rowLabel })
milestoneCell(key: PeriodKey): Locator                        // getByTestId(`ms-cell-${key}`)
diamond(name: string): Locator                                // milestoneRow().getByRole('button', { name: new RegExp('^milestone ' + escapeRe(name) + ' ') })
diamondIn(key: PeriodKey, name: string): Locator              // milestoneCell(key).getByRole('button', { name: … })
createMilestoneAt(key: PeriodKey, name: string, date?: ISODate): Promise<void>   // click empty area of the cell → fill name (+ date via fillDate) → Enter
openDiamond(name: string): Promise<Locator>                   // focus + Enter → the popover (getByRole('dialog' | 'presentation'))
dragDiamond(name: string, toKey: PeriodKey): Promise<void>    // mouse.down on ◆ centre → mouse.move(target cell centre, { steps: 8 }) → mouse.up
toolbarAddMilestone(): Locator                                // getByRole('button', { name: th.milestones.grid.toolbarAdd })
taskLate(rowKey: string): Locator                             // row header [data-row-key=rowKey] getByText(th.milestones.late)
// e2e/pages/milestones.ts — overview section (new)
export class MilestonesSection { constructor(readonly page: Page) {}
  list(): Locator                                             // getByRole('list', { name: th.milestones.overview.listLabel })
  row(name: string): Locator; add(name: string, date: ISODate): Promise<void>; complete(name: string): Promise<void>
  edit(name: string, patch: { name?: string; date?: ISODate }): Promise<void>; remove(name: string): Promise<void> }
// e2e/pages/tasks.ts (M3) — additions
setGroupBy(by: 'milestone' | 'none'): Promise<void>; panelMilestone(): Locator   // combobox th.milestones.tasks.field
setTaskMilestone(taskName: string, label: string | null): Promise<void>; bulkLink(taskNames: string[], label: string | null): Promise<void>
boardMilestoneFilter(label: string): Promise<void>
// e2e/pages/team-tasks.ts, e2e/pages/calendar.ts — filterMilestone(label); milestoneChip(date, name)
// e2e/pages/palette.ts (M4 `Palette`) — reuse group(heading), option(name), pageResults() as they are; add only:
commands(): Locator                                           // group(th.milestones.palette.group).getByRole('option')
runCommand(label: string): Promise<void>                      // option(label).click()  (by name, never by index — M4-D37d)
```
Row locators use `data-row-key`/test ids, never `aria-rowindex` or `nth()` (the ◆ row is a header row, M8-D26).
Dates are typed through the existing `DateField` helper (`fillDate(locator, iso)` from the M3/M5 page objects — Buddhist-era display, ISO in tests); expected texts use `formatThaiDate`/`formatWeekHeader` from `src/lib/format.ts` and `th` strings.

**S6.2 `e2e/m8-milestones.spec.ts`** — scenarios M1–M10 exactly as §7.3. `test.describe.configure({ mode: 'serial' })` inside chained describes; `test.beforeAll(async () => { await resetDb(…) })` per describe (never `beforeAll(resetDb)` / `beforeAll(resetDb(...))`; options go in the 2nd argument — M1, X91) (⟲ in §7.3); `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; server `APP_NOW` from the webServer env (X45/X46); `loginAs(page, …)` via the API; strings from `th`; waits on UI state (`waitSaved()`, toast visibility, `data-late`), no fixed sleeps; the CSP-violation listener and the external-request guard stay on; `allowedConsoleErrors` only `/status of 404/` in M5/M10 (masking 404s).

**S6.3 Update older specs.** Run `m0`–`m7` against the M8 build; adjust through page objects only: `m6-grid` / `m7-daily` — page objects already avoid `aria-rowindex`/`nth()` (m06 review); only an assertion that reads `aria-rowcount` as a number changes, and it must derive from `HEADER_ROWS`/`FOOTER_ROWS` (cell test ids are unchanged); `m3-tasks` — the group-by option count (now five) if asserted exactly, card text snapshots that now include no milestone (golden has none → unchanged unless `resetDb(undefined, { milestones: true })`); `m4-pages` E16 — **no change** (M4-D37d already selects by name and asserts nothing about other groups); the "Ivy cannot create milestones" check is M8's scenario M9 (`palette.option(th.milestones.palette.create)` has count 0), never "no คำสั่ง group" (C59 — M10's commands are visible to Ivy); `m5-calendar` — unchanged without `milestones: true` (assert so). Never weaken an older assertion.

**S6.4 Done-check (integrator, G2).** `pnpm test:e2e` — full suite m0…m8.

---

## 6. Integration (orchestrator)

**Expected requests (apply after Build, step 4):**

| From → to | Request | Resolution |
|---|---|---|
| S3 → S0/S4 | `MilestoneForm` must support `dense` + `readOnly` exactly as the S0 signature | S4 implements; no signature change expected |
| S3 → (M7 file) | `CellMenu` gains `items?: CellMenuItem[]` (additive; existing props/call sites/tests unchanged) | S3 owns `src/components/grid/**`; record in the S3 report |
| S3 → (M6 files) | `HEADER_ROWS = 2` in `src/lib/grid/columns.ts`; `invalidateAfterGridSave` gains `qk.projectMilestones` (M8-D26) | S3 owns `src/lib/grid/**`; no other index shifts |
| S4 → S3 | `applyLateness` import for the FR-612 dialog cache write | resolve at G2 once both are merged |
| S2 → orchestrator | a pinned M3/M6 name missing in the code (`repo.tasks.listLiveWithBlockerCounts` → `TaskListRow`, `repo.assignments.listActiveForProject` (M3-D39), `getJson`) | use the real export, add a PROGRESS Decision, report as blueprint gap — never rename the earlier export |
| any → S0 | i18n keys outside the stream's namespace | orchestrator adds them with Edit |
| S5 → S2 | rows red because of a 403/404 mismatch | fix in the service (authz rule), never in the row |

**Wiring order:** S0 (G0) → S1 → {S2, S3, S4} (S5 in parallel from G0) → requests → replace the S0 client stubs (S4 already did) → S6 → G2.

**Commands (G2):**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                                   # → "No schema changes, nothing to migrate"
pnpm check                                         # typecheck + lint + unit/ui/integration (+ domain coverage ≥ 95 %)
pnpm test:e2e                                      # m0 … m8 against the production build (X46)
grep -rn "milestone_id\|milestoneId" src/server --include=*.ts | grep -v -e "LIVE_MILESTONE" -e "schema.ts" -e ".test.ts"   # review: every hit is a write or sits in a file using the live join (M8-D5; the guard test enforces it)
# M3's G2 "grep milestone … expect no hits" (m03 §6) is an M3-only gate (M3-D42) — do not run it from M8 on
grep -rn "from allocations\|join allocations" src/server/repo/milestones.ts      # each has a week_start bound (X65)
grep -rn "confirm(\|<Dialog" src/components/milestones src/components/projects/ProjectMilestones.tsx   # only MilestoneDialog (a form, not a confirm)
grep -rn "localStorage" src/components src/lib | grep -v test                  # none (X53)
```

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Tests |
|---|---|
| AC-701 (◆ 23 ต.ค. in week 19 ต.ค., then Friday in day zoom) | e2e **M1**; unit `lib/grid/milestones.test.ts › milestoneColumnKey`; ui `MilestoneRow.test.tsx` |
| AC-702 ("เลย milestone" on the task and on ◆) | e2e **M2**; int `milestones.int.test.ts › AC-702`; unit `milestone.test.ts › BR-71`; golden bindings |
| §12 M8 "§4.7 ทั้งหมด" — FR-701/703/704/708 | int `milestones.int.test.ts` (create/update/progress/delete/restore); e2e M4 |
| §12 M8 "`milestone.ts`" | unit `src/domain/milestone.test.ts` (BR-70 table incl. today = date, BR-71 three conditions; coverage ≥ 95 %) |
| §12 M8 "แถว ◆ ในกริด" — FR-705 grid part | ui `MilestoneRow.test.tsx`; int `grid.int.test.ts › milestones`; e2e M1, M10 |
| §12 M8 "ลากเลื่อน" — FR-707 | unit `dateForDrop`, `dateInWeekKeepingWeekday`; ui `useMilestoneDrag`; e2e **M3** (week drag, day drag, undo, keyboard popover) |
| §12 M8 "เตือนเลย milestone" — FR-706 | int `repo/milestones.int.test.ts › lateFacts` + `allocations.int.test.ts › lateness`; ui list/panel/board/grid; e2e M2 |
| FR-702 (overview / grid cell / Cmd+K) | e2e M4, M1, **M9**; ui `CommandPalette.test.tsx` |
| FR-705 calendar / FR-907 | int `calendar.int.test.ts › milestones`; mask; e2e **M8** |
| FR-409 milestone part | ui `ProjectMilestones.test.tsx`; e2e M4 |
| FR-601/613/614 milestone parts | ui panel/list/bulk tests; unit `group.test.ts`; e2e M2, **M6** |
| FR-661/663 milestone parts, §7.8 `TaskCard.milestoneId` | ui `TaskBoard.milestone.test.tsx`; int `team-tasks.int.test.ts › milestoneId`; e2e **M7** |
| BR-72 | golden `milestones.int.test.ts › BR-72`; int `grid.int.test.ts › BR-72` |
| §3.2 PERM-15 (Me ดูได้) | authz MS-* (§7.2); e2e **M5** (member read-only UI) |
| §3.3 milestone masking | mask `describe('milestones (M8)')` (world + golden Cindy/Ivy/Peter) |
| §7.5 undo of delete | int restore; e2e M4 (toast เลิกทำ + `Cmd+Z`) |

### 7.2 Authorization matrix rows added (`tests/authz/rows/milestones.ts`)

`M` manager · `L` lead (LEAD of P and A) · `Me` member (MEMBER of P and A) · `W` outsider (MEMBER of Q only). Mutating `allow` rows assert exactly one new `audit_log` row (entity in brackets).

| Key | PERM | Action / route (world ids) | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| MS-LIST | PERM-06 | `GET /api/projects/{P}/milestones` | allow | allow | allow | 404 | no |
| MS-LIST-ARCH | PERM-06, X42 | `GET /api/projects/{A}/milestones` | allow | allow | allow | 404 | no |
| MS-TARGETS | — (own data) | `GET /api/milestones/targets` | allow | allow | allow | allow | no |
| MS-CREATE | PERM-15 | `createMilestone({ projectId: P, name: 'x', date: '2026-11-13' })` [milestone] | allow | allow | 403 | 404 | yes |
| MS-CREATE-ARCH | PERM-15, X42 | `createMilestone({ projectId: A, … })` | 403 | 403 | 403 | 404 | yes |
| MS-RENAME | PERM-15 | `updateMilestone({ milestoneId: p, patch: { name: 'y' } })` [milestone] | allow | allow | 403 | 404 | yes |
| MS-MOVE | PERM-15 | `updateMilestone({ milestoneId: p, patch: { date: '2026-10-30' } })` [milestone] | allow | allow | 403 | 404 | yes |
| MS-COMPLETE | PERM-15 | `updateMilestone({ milestoneId: p, patch: { completed: true } })` [milestone] | allow | allow | 403 | 404 | yes |
| MS-UPDATE-ARCH | PERM-15, X42 | `updateMilestone({ milestoneId: a, patch: { name } })` | 403 | 403 | 403 | 404 | yes |
| MS-DELETE | PERM-15 | `deleteMilestone({ milestoneId: p })` [milestone] | allow | allow | 403 | 404 | yes |
| MS-DELETE-ARCH | PERM-15, X42 | `deleteMilestone({ milestoneId: a })` | 403 | 403 | 403 | 404 | yes |
| MS-RESTORE | PERM-15, §7.5 | `restoreMilestoneBatch({ batch: pDeletedMilestone })` [milestone] | allow | allow | 403 | 404 | yes |
| MS-RESTORE-EXPIRED | §7.5 | `restoreMilestoneBatch({ batch: pExpiredMilestone })` | 400 | 400 | 403 | 404 | yes |
| MS-RESTORE-ARCH | X42 | `restoreMilestoneBatch({ batch: aDeletedMilestone })` | 403 | 403 | 403 | 404 | yes |
| MS-Q | PERM-15 (other project) | `updateMilestone({ milestoneId: q, patch: { name } })` [milestone] | allow | 404 | 404 | 403 | yes |
| MS-MISSING | X41 | `deleteMilestone({ milestoneId: <random v4> })` | 404 | 404 | 404 | 404 | yes |
| MS-BAD | X41 | `createMilestone({ projectId: P, name: ' ', date: '2026-02-30' })` | 400 | 400 | 400 | 400 | yes |
| MS-LINK | PERM-11 (M8-D4) | `linkTasksToMilestone({ taskIds: [pLeaf], milestoneId: p })` [task] | allow | allow | allow | 404 | yes |
| MS-UNLINK | PERM-11 | `linkTasksToMilestone({ taskIds: [pChildB], milestoneId: null })` [task] | allow | allow | allow | 404 | yes |
| MS-LINK-CROSS | X66 | `linkTasksToMilestone({ taskIds: [pLeaf], milestoneId: q })` | 400 | 404 | 404 | 404 | yes |
| MS-LINK-ARCH | PERM-11, X42 | `linkTasksToMilestone({ taskIds: [aTask], milestoneId: a })` | 403 | 403 | 403 | 404 | yes |
| MS-REVERT | PERM-11 | `revertTaskMilestones({ items: [{ taskId: pLeaf, milestoneId: p }] })` [task] | allow | allow | allow | 404 | yes |
| TT-MS | PERM-06 | `GET /api/tasks?milestoneId={pLate}` | allow | allow | allow | 404 | no |
| TT-MS-Q | PERM-06 | `GET /api/tasks?milestoneId={q}` | allow | 404 | 404 | allow | no |
| TT-MS-DELETED | M8-D5 | `GET /api/tasks?milestoneId={pDeletedMilestone id}` | 404 | 404 | 404 | 404 | no |

Notes: MS-RESTORE-EXPIRED shows authz first (Me 403, W 404) then validation (M/L 400) — `requireMilestone(manage)` precedes the 30-day check (S2.2). MS-LINK-CROSS for the manager is `VALIDATION sameProjectOnly` (both visible); for everyone else the Q milestone is invisible → 404. The M6 grid rows (GR-*) and M5 calendar rows (PERM-22a) are unchanged; their milestone content is covered by S5.2.

### 7.3 E2E scenario outline (`e2e/m8-milestones.spec.ts`)

| # | Scenario (role) | Steps | Assertions |
|---|---|---|---|
| M1 ⟲ | **AC-701**, FR-702 grid cell (cindy on CRM) | `resetDb()`; plan tab of CRM Migration; `createMilestoneAt('W:2026-10-19', 'Data cutover', '2026-10-23')`; reload; `zoom('day')` | after create the form had date `formatThaiDate('2026-10-19')` pre-filled (Monday); `diamondIn('W:2026-10-19', 'Data cutover')` visible with hidden status text `th.milestones.status.UPCOMING` (+23 days); after reload still there; in day zoom `diamondIn('D:2026-10-23', …)` visible and its accessible name contains `formatThaiDate('2026-10-23', 'medium')`; no ◆ in `D:2026-10-19` |
| M2 | **AC-702** + negative (cindy, continues M1) | tab งาน → open "ย้ายข้อมูลลูกค้า" → `setTaskMilestone(…, 'Data cutover')`; back to plan tab; then overview → add "Data migration complete" `2026-11-06`; panel → rebind to it | list row and panel show `th.milestones.late` / `lateAlert('Data cutover', formatThaiDate('2026-10-23'))`; plan tab: task row `taskLate(rowKey)` visible, label `→◆Data cutover`, ◆ has `data-late="true"` and text `lateTasks(1)`; after rebinding: no ⚠ on the row, ◆ Data cutover `data-late="false"` (WEEK 11-02 is Data migration complete's own week) |
| M3 | FR-707 drag + undo + keyboard (cindy) | week zoom: `dragDiamond('Data cutover', 'W:2026-10-26')`; toast เลิกทำ click; `ControlOrMeta+z` after a second drag; day zoom: drag to `D:2026-10-22`; keyboard: Tab to ◆, Enter, `fillDate(date, '2026-10-21')`, Enter | after first drag ◆ in `W:2026-10-26` and popover date = 30 ต.ค. (weekday kept); toast `moved('Data cutover', formatThaiDate('2026-10-30'))`; after เลิกทำ back in `W:2026-10-19`; `Cmd+Z` same; day drag → 22 ต.ค.; keyboard → 21 ต.ค.; reload confirms the final date |
| M4 ⟲ | FR-409/702/703/708 overview (cindy on POS, `resetDb(undefined, { milestones: true })`) | overview → section shows A.2 POS milestones; `add('Pilot', '2026-11-20')`; edit Pilot date; complete Go-live; remove UAT sign-off; click เลิกทำ; complete "ทำ UAT + คู่มือหน้าร้าน" in the task tab | UAT sign-off row: `ใกล้ถึง`, `เสร็จ 0/1 งาน`, `เลย milestone 1 งาน`; Go-live after complete: `เสร็จแล้ว` text + struck through, moved last; remove → toast `deletedUnlinked('UAT sign-off', 1)`, no `dialog` role on the page, task tab shows the task unbound; after เลิกทำ → row back and the task bound again (◆ chip); after completing the task → `เสร็จ 1/1 งาน` and the late badge gone |
| M5 | PERM-15 read-only (ivy, member of POS and CRM) | POS plan tab; click empty `ms-cell-W:2026-10-19`; focus ◆ UAT sign-off + Enter; try `dragDiamond`; POS overview | no create form; popover shows text only + `th.milestones.grid.readOnly`; ◆ stays in `W:2026-09-28` after the drag attempt (no request with `next-action` header); overview has no add/edit/delete/checkbox; the panel milestone field **is** enabled (binding = PERM-11) |
| M6 | FR-613/614 grouping + bulk (cindy on CRM) | tasks tab → `setGroupBy('milestone')`; select "ย้ายข้อมูลลูกค้า" + Mod-click "ตั้งค่า automation" → `bulkLink([...], 'Data migration complete')`; click เลิกทำ | group headers in date order (`Data cutover` 23 ต.ค., `Data migration complete` 6 พ.ย.) then `ไม่ผูก milestone`; after bulk link both rows under Data migration complete, toast `linked(2, 'Data migration complete')`; after เลิกทำ each back in its previous group |
| M7 | FR-661/663 board + `/tasks` (cindy) | CRM tasks → board view → `boardMilestoneFilter('Data migration complete')`; `/tasks` → project CRM → milestone filter same | cards show `◆ Data migration complete`; filter leaves only bound cards (column counts match); `/tasks` request has `milestoneId=`; cards listed = bound CRM tasks only; milestone select disabled before choosing a project |
| M8 ⟲ | FR-907 calendar + masking (cindy, then peter; `resetDb(undefined, { milestones: true })`) | cindy `/calendar?month=2026-10`; click the UAT chip; peter same month | cindy: `day-2026-10-02` has link `◆ UAT sign-off · POS Upgrade` with hidden `ใกล้ถึง` and ⚠ text; `day-2026-11-06` (outside-month cell) shows `◆ Data migration complete · CRM Migration`; the `/api/calendar` body (`waitForResponse`) contains neither "Pipeline พร้อมใช้งาน" nor "Design freeze"; click → POS overview URL; peter: `day-2026-10-23` has "Pipeline พร้อมใช้งาน", body lacks "UAT sign-off" |
| M9 | FR-702 `Cmd+K` (cindy on POS plan, then ivy) | `ControlOrMeta+KeyK`; type "milestone"; Enter; fill name "Soft launch", date 2026-12-07; save; ivy: `ControlOrMeta+KeyK`, type "milestone" | cindy: `palette.group(th.milestones.palette.group)` contains `palette.option(th.milestones.palette.create)`; dialog has project `POS Upgrade` pre-selected; after save the POS grid shows ◆ Soft launch in `W:2026-12-07` without reload (invalidation); ivy: `palette.option(th.milestones.palette.create)` has count 0 (nothing asserted about the group or other options — C59, M4-D37d) |
| M10 | A.2 grid (manager; `resetDb(undefined, { milestones: true })`) | POS plan tab | ◆ UAT sign-off in `W:2026-09-28` with `data-status="DUE_SOON"`, `data-late="true"`; row "ทำ UAT + คู่มือหน้าร้าน" shows `→◆UAT sign-off` + `th.milestones.late`; footer `cell-footer-load-W:2026-09-28` text equals the M6 value without milestones ("5.0", BR-72); `toolbarAddMilestone()` visible |


### 7.4 Golden, perf and manual checks

- **Golden:** S5.3 (`tests/golden/milestones.int.test.ts`) — A.2 statuses on 2026-09-30 (r8 §4.9), lateness of the four bindings, F1 totals unchanged (BR-72).
- **Perf smoke (not a gate):** `resetDb(undefined, { syntheticGrid: true })` + 50 milestones on "Perf grid" each bound to 4 tasks → `buildChunk` (8 weeks) stays < 1 000 ms in `grid.perf.int.test.ts` (M6-D22 budget; S2 adds the milestone case); the lateness query appears once per chunk (log the measured value).
- **Manual (owner-visible):** Thai Kedmanee layout — `Shift+F10` on ◆ opens the menu, `Enter` opens the popover, `Cmd+K` + "มายล์" finds the command; ◆ colour `#7C3AED` on white ≥ 4.5:1 and its dark-mode token (M0 X51 table) passes the existing contrast test; mobile width: `/calendar` agenda shows milestone lines; screen reader reads "milestone UAT sign-off 2 ต.ค. 2569 ใกล้ถึง เลย milestone 1 งาน".

---

## 8. Definition of done

- [ ] SPEC §12 M8: §4.7 complete (FR-701…708), `src/domain/milestone.ts` with unit tests, ◆ row in the project grid (week + day zoom), drag to move (±7 / ±1, keyboard popover), "เลย milestone" warnings on tasks and ◆.
- [ ] AC-701 and AC-702 pass in e2e (M1, M2) and every row of §7.1 has a passing test.
- [ ] X21 carry-ins done: panel field, group by milestone, bulk link, board card + filter, `/tasks` filter, `TaskCard.milestoneId`; X24 calendar ◆; X28 grid fields real; FR-409 milestone section; `Cmd+K` command (X08).
- [ ] `pnpm check` green (domain coverage ≥ 95 %); `pnpm db:generate` → "No schema changes"; exactly one new migration (`…_milestones.sql`), generated by S0 only.
- [ ] Full e2e suite m0…m8 green on the production build.
- [ ] Authz rows of §7.2 green, each mutating allow row with exactly one audit row; masking block `milestones (M8)` green (world + golden).
- [ ] Every read of `tasks.milestone_id` uses the live join (guard test green); every new `allocations` query has a `week_start` bound.
- [ ] Every milestone action follows `zod → authz → service → audit` inside one transaction (M8-D25); no `refresh()`.
- [ ] No confirm dialog (milestone delete = undo toast + `Cmd+Z`); state never by colour alone (◆ + text, status glyph + text, ⚠ + text).
- [ ] No Thai outside `src/i18n/th.ts`; no `localStorage`; no `any`/`@ts-ignore`/`eslint-disable` without a reason; no new dependency.
- [ ] Nothing from M9/M10/M12/Phase 2 (§1.2): no person-grid ◆, no home card, no other palette commands, no milestone page block.
- [ ] `PROGRESS.md` updated (§10); commit `feat(m8): …`; tag `m8`.

---

## 9. Risks and gotchas

| # | Risk | Mitigation (step) |
|---|---|---|
| R1 | A query forgets that soft-deleted milestones are "unbound" and leaks a deleted milestone id or counts it in progress/lateness | single `LIVE_MILESTONE_JOIN` + guard test (S2.1); integration cases with `w.batches.pDeletedMilestone` (S2.2, S2.7) |
| R2 | BR-71 query cost on large projects (allocations scan) | bounded `week_start` range uses `allocations_ta_week_start_idx` (M6); `tasks_milestone_id_idx`; perf smoke (§7.4) |
| R3 | DAY rows later in the milestone's own week are missed if the bound is taken literally on `week_start` | bound is `week_start ≥ date − 6` + `period_start > date` (M8-D6); repo test with a DAY row on 10-13 vs a 10-12 milestone (S2.1) |
| R4 | Adding the ◆ header row shifts `aria-rowindex`/`aria-rowcount` and breaks M6/M7 ui tests or page objects | `HEADER_ROWS = 2` is the only change (M8-D26); cell test ids unchanged (M6-D33); page objects never use `aria-rowindex`/`nth()`; S3.3/S3.9 update the numeric `PlanGrid.test.tsx` expectations |
| R5 | Pointer drag fights the virtualizer's scroll container (scrollLeft changes mid-drag) | `columnAtX` uses `scrollEl.scrollLeft` at each move; pointer capture; `Escape` cancels; no auto-scroll (far moves via popover) (S3.6) |
| R7 | drizzle-kit names the FK `tasks_milestone_id_milestones_id_fk`; error mapping keyed on another name never matches | S0.2 inspects the generated SQL; S2.3 maps by the real name |
| R8 | Optimistic grid move and `invalidateMilestones` refetch flicker or race with grid saves | the hook invalidates `gridAll` only on settle; grid save scope unchanged; S3.5 patches before the action |
| R9 | `cmdk` with `shouldFilter={false}` shows commands regardless of the query | `matchCommand` filters client-side (S4.10, unit-tested) |
| R10 | Undo of complete/reopen restores a different completion date | exact undo via `patch.completedOn` (M8-D19), ≤ today validated; S2.2 test with `pDone` (09-16) |
| R10b | The palette ctx or command list grows in M10 and breaks M8's tests | ctx built in `useCommandCtx()` only; tests use `fakeCommandCtx()` and find commands by id; no group-absence or count assertions (S4.10, C48/C59) |
| R10c | Raw `tasks.milestone_id` (deleted milestone) leaks through `TaskRow` in a DTO mapper | live id only from `TaskListRow.milestoneId` / `LIVE_MILESTONE_*`; guard test; `pParent` cases on every read path (S2.1) |
| R11 | Calendar day cells overflow with milestones + leave | milestones count toward `splitVisible` (+N popover) (S4.9) |
| R12 | `getCalendar` gains a `today` parameter → M5 tests and the route break | S0.5 updates the route and M5's test calls in the same step |
| R13 | JSON-fetch helper naming drift | the pinned name is `getJson` (M2 `src/lib/api.ts`, G27); S0.1 inventory confirms it |
| R14 | `latenessForTouchedTasks` adds work to every grid save (M6 hot path, § 9 50 ms budget) | early `null` when no touched task or ancestor is bound (one indexed query); measured in the perf smoke |
| R15 | Bulk "ไม่ผูก" on tasks that point at a deleted milestone would break re-link on restore | skip by live value, keep raw (M8-D14); test in S2.2 |
| R16 | DST/timezone mistakes in ◆ placement | ISO strings only; `dates.ts` integer arithmetic; e2e clock pinned (CLAUDE.md) |

---

## 10. Close-out

- **PROGRESS.md:**
  - Milestone table: M8 ✅ with date, commit hash and tag `m8`; "Milestone ปัจจุบัน" → M9.
  - Decisions: copy M8-D1…D26 (and the X-rows of §3.1 that are new to PROGRESS).
  - Deviations: none.
  - Known issues / forward notes: **M9** shows ◆ on the person grid for projects where that person has active assignments and the viewer can see the project (reuse `GridMilestone`, `repo.milestones.listForProjects`, `services.milestones.toDTOs`/`computeLateness`, `src/lib/grid/milestones.ts`; `MilestoneRow` is already read-only whenever `context.canManage === false`, and `invalidateMilestones` already covers `['grid', 'person']`); **M10** builds the home card "Milestone ใน 14 วันข้างหน้า" from `services.milestones.listVisibleMilestones(tx, user, range, today)` + `MilestoneStatusChip`, appends its quick commands to `PALETTE_COMMANDS` (`src/components/palette/commands.ts`), adds its ctx fields in `useCommandCtx()` and its defaults in `fakeCommandCtx()`; **M12** `seed:demo` composes `addMilestones` and the §4.12 audit sweep covers the milestone/binding actions; remove the M3 known issue "board milestone filter/card field + `TaskCard.milestoneId` → M8".
- **Commit:** `feat(m8): milestones — ◆ row on the plan grid with drag, late warnings, task binding, calendar and Cmd+K` with a body listing FR-701…708, AC-701, AC-702, BR-70…72, the FR-409/601/613/614/661/663/907 milestone parts, PERM-15, and the attribution trailer.
- **Tag:** `git tag m8`.
