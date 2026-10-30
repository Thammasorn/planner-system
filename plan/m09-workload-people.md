# M9 — Workload and person views

> Depends on: M8 ✅ · SPEC: §3.3 (all masking rules), §4.10 (FR-1001…1009), FR-667 (person tab), FR-906 (overload part), FR-409 (load part), FR-303 (load part), AC-604 (verification), §5.6 (BR-40…45), §5.7, §6.5, §7.4 (person grid, masked rows), §8.1 (badge, ทีมงาน), §8.5, §8.8, §8.9, §9 (workload budget), §11.2, §11.3 F1–F4, §12 M9 ·
> Owner-visible result: a **Workload ทีม** page (people × weeks grouped by position, `ภาระ/capacity` cells coloured by BR-45 with 🔴/⚠ glyphs, hover breakdown, three load views, filters, side panel of tasks, a **รายการที่ล้น** tab with excess + cause + fix link), a live **●N** badge on the sidebar item, a **ทีมงาน** directory and **person pages** (`/people/[id]`: header, แผนงาน person grid grouped by project with one masked "งานในโปรเจคอื่น" row, งาน tab reusing the `/tasks` list/board, วันลา tab), `/my` grouped **สัปดาห์นี้ / สัปดาห์หน้า / หลังจากนั้น / ยังไม่วางแผน**, new-overload lines after recording leave, load figures on the project overview and client page — and golden F2–F4 matching the old Excel, with no hidden project or task name ever leaving the server.

---

## 1. Goal and scope

### 1.1 In scope

Legend — "Where": stream.step in §5. "Test": `unit` = Vitest node, `ui` = Vitest jsdom, `int` = Vitest + Postgres, `authz` = row key in `tests/authz/rows/{workload,people}.ts` (§7.2), `mask` = `tests/authz/masking.int.test.ts › describe('workload & people (M9)')`, `golden` = `tests/golden/golden.int.test.ts › describe('M9 …')`, `e2e` = scenario id in `e2e/m9-workload.spec.ts` (§7.3).

| ID | What M9 delivers | Where | Test |
|---|---|---|---|
| FR-1001 | `/workload`: table people × weeks, 12 weeks from this week (window shifts ◀/▶ by 4 weeks, "สัปดาห์นี้" resets), grouped by position (position order, "ไม่มีตำแหน่ง" last), population per X67 | S2.2, S4.2 | int `workload.int.test.ts › population/groups` · golden · e2e W1 |
| FR-1002 | Cell `ภาระ/capacity` (compact days) + BR-45 colour of the selected view + BR-40 glyph (🔴 OVER / ⚠ RISK, never colour alone); hover = breakdown by project, hidden projects folded into one "งานในโปรเจคอื่น" line | S1.1–S1.3, S2.2, S4.3 | unit `overload.test.ts`, `format.test.ts`, `tooltip.test.ts` · ui `WorkloadCell.test.tsx` · mask · e2e W1, W4 |
| FR-1003 | View toggle ทั้งหมด · แน่นอน · ยังไม่แน่นอน (`load.view`, M6-D21); colours follow the view, glyph follows BR-40 (X67) | S1.2, S4.2 | unit `viewTone` · ui · e2e W2 |
| FR-1004 | Filters ตำแหน่ง / โปรเจค (visible projects only) / เฉพาะคนที่ล้น; filters select **people**, cells always show the full load (X67); filters live in the URL | S2.2, S4.2 | int `› filters` · authz WL-PROJ-* · e2e W2 |
| FR-1005 | Click a cell → side panel with the tasks behind the number (masked aggregate for hidden projects), each linking to the project plan with `?task=` | S2.3, S4.4 | int `› cell detail` · mask · e2e W3 |
| FR-1006 | Tab **รายการที่ล้น (n)**: คน · สัปดาห์ · ระดับ · เกิน · สาเหตุ · แก้ (→ `/people/<id>/plan?week=`) from the same service as the table | S2.2, S4.5 | int · golden F2–F4 · e2e W1 |
| FR-1007 | Sidebar badge = number of OVER cells in `[weekStart(today), +4 w)` over the people the viewer may see; server-rendered initial value + client query `qk.workloadBadge()` invalidated by load changes (X31) | S2.4, S4.6 | int `› badge` · golden (r8 badge table) · e2e W5 |
| FR-1008 | `/people/[id]` (404 when not visible): header (ชื่อ, ตำแหน่ง, ตารางวันทำงาน, ปิดใช้งาน), tabs **แผนงาน** (person grid) · **งาน** · **วันลา** | S2.5–S2.7, S3, S4.7–S4.9 | int · authz PG-*, PH-*, PT-* · mask · e2e W6, W10 |
| FR-1009 | `/my` buckets สัปดาห์นี้ / สัปดาห์หน้า / หลังจากนั้น / ยังไม่วางแผน (X22 M9 part), my planned days per task, tickable; sidebar "งานของฉัน N" = open tasks in สัปดาห์นี้ | S1.4, S2.8, S4.10 | unit `buckets.test.ts` · int `my-tasks.int.test.ts` · e2e W9 |
| FR-667 (M9 part, X77) | Person page **งาน** tab and `/my` (alternate views ลิสต์ · บอร์ด) reuse M3's `TeamTasks` (its list view = flat rows grouped by project, its board view = `TaskBoard`; `fixedUserId` + `syncUrl={false}`) fed by `GET /api/tasks?userId=` (`qk.teamTasks`) — no new endpoint | S4.8, S4.10 | ui `TeamTasks.fixedUser.test.tsx` · mask (via M3's `/api/tasks`) · e2e W10 |
| FR-906 (overload part, X23) | After create/update of leave: new or worsened OVER/RISK weeks with excess, cause, masked project parts and a fix link; plus the M7-deferred line "มีงาน X วันวางไว้ในวันที่ลา" (M7-D15) | S1.2, S2.9, S4.11 | unit `worsened` · int `time-off.int.test.ts › overloads` · golden F3/F4 · e2e W8 |
| FR-409 (load part, X15) | Overview: each member's load **in this project** (this week + 12-week sum) and 12 weekly bars of the project total (tentative part hatched + text) | S2.10, S4.12 | int `project-load.int.test.ts` · authz PJ-LOAD-* · e2e W11 |
| FR-303 (load part, X15) | Client page: Σ load of the client's **visible, non-archived** projects over the next 12 weeks + per-project column | S2.10, S4.12 | int `client-load.int.test.ts` · authz CL-LOAD-* · e2e W11 |
| FR-705 (person grid part, X28) | ◆ milestones on the person grid = milestones of (projects where the person has live assignments) ∩ (viewer-visible projects), via M8's `repo.milestones.listForProjects` + `toDTOs` (`GridMilestone` = `MilestoneDTO`), read-only (`canManage: false`, M9-D29) | S2.5, S3.6 | int `grid-person.int.test.ts › milestones` · mask (MASK-6) |
| AC-604 (verification, X14) | Task with Jack + Mint → FR-612 Jack 3 d, Mint 2 d → `/people/Jack` shows 3.0, `/people/Mint` shows 2.0 in that week, footers include them | S2.5, S6.2 | int `grid-person.int.test.ts › AC-604` · e2e W7 |
| BR-40 (week level) | `overloadLevel` (M7) per person per week in workload, person grid footer and project grid footer | S1.1, S2.2, S3.5 | unit · golden |
| BR-41 | `overloadCause` (WORKLOAD / CAPACITY / BOTH) for OVER **and** RISK; deactivated weeks labelled "ปิดใช้งาน" in the UI (X64 keeps `standard`) | S1.1, S4.3 | unit (r5 M9-03 + r8 §4.8 vectors) · golden |
| BR-42 (surfacing) | Leave never edits plans (M5/M6 checksum tests stay green); overloads are shown, not fixed | S2.9 | int (existing checksum + new overload lines) |
| BR-43 | Unassigned tasks never count (structural: loads come only from assignments) | S2.1 | int `› BR-43` |
| BR-44 | Archived/deleted projects excluded from every M9 figure and from the person grid | S2.1, S2.5 | int `› BR-44` |
| BR-45 (week level) | `loadTone` (M7) by the selected view's load; cap 0 = stripes (red when load > 0); AT_RISK view uses the tentative palette (X67) | S1.2, S3.5, S4.3 | unit · ui · golden colour counts (r8 §4.6) |
| BR-37 / BR-50 / FR-628 / BR-87 / BR-72 | `{ total, committed }` everywhere; weeks after `completed_week` not counted; statuses other than `DONE` and milestones never change load | S2.1 | int `› WAITING`, `› milestones no load`, `› BR-50` |
| BR-03 | Every workload/person/load response carries integer cd only | S2.2 | int `› integers` (JSON walker) |
| §3.3 MASK-1…7, §11.2 | Totals per `visibleUserIds`, details per `visibleProjectIds`; masked aggregate without ids/counts; leave label "ลา"; milestones of hidden projects absent; masking completed in `services/masking.ts` | S2.1, S2.11 | mask (world + golden r8 §6.4 all 15 pairs + 5 invisible pairs) |
| §8.1 sidebar | Items **Workload ทีม** (with badge) after งานของทีม and **ทีมงาน** before ลูกค้า (X33, M4-D27 order) | S0.11, S4.6 | ui `Sidebar.test.tsx` · e2e W5 |
| §8.5 | Layout per the mock: toolbar, tabs ตาราง · รายการที่ล้น (n), cells "3.8/5" + 🔴 | S4.2 | e2e W1 |
| X06 (M9 part) | Week-level tones + glyphs in the grid footer (project grid aggregated; person grid = the person's full load) and excess/cause in tooltips | S3.5 | unit `load-footer.test.ts` · ui |
| X67 (unit) | `grid.unit` applies to the person grid only; workload, overview, client page and `/people` always show days | S3, S4 | ui |
| GOLD-F1c, F2, F3, F4 | Through the workload service **and** route; person grid masking pairs; badge per viewer | S5.3 | golden |
| NFR-03 (smoke) | Workload 100 people × 12 weeks < 1 600 ms locally (2× the §9 800 ms; full measurement M11) | S2.12 | int `workload.perf.int.test.ts` |
| A11Y-1 | OVER/RISK glyph + visually hidden text, numbers on every coloured cell, badge number, striped cap-0 | S3.5, S4.3, S4.6 | ui |
| PRIN-P4 / P6 | Overloads visible, never auto-fixed; manager reaches "who is overloaded" in one click (badge → list tab) | S4.5, S4.6 | e2e W1, W5 |

**§3.2 permission rows in scope** (PERM numbering = §3.2 table order; PERM-23 appended, X79):

| PERM | §3.2 row | M | L | Me | W | Rows (§7.2) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-22 | ดู workload (§3.3) — table, cell, badge, directory, person grid/header/leave | per §3.3 | per §3.3 | per §3.3 | per §3.3 | WL-TABLE, WL-CELL-ME, WL-CELL-W, WL-BADGE, WL-BADQ, WL-SPAN, PEOPLE, PG-ME, PG-W, PG-MISSING, PG-BADQ, PH-ME, PH-W, PT-ME, PT-W |
| PERM-06 | เห็นโปรเจค / เปิดโปรเจค — overview load, workload project filter | allow | allow | allow | 404 | PJ-LOAD, PJ-LOAD-ARCH, PJ-LOAD-MISSING, WL-PROJ-P, WL-PROJ-Q |
| PERM-04 | ดูลูกค้า — client load | allow | allow (own clients) | allow (own clients) | 404 | CL-LOAD-C1, CL-LOAD-C2 |
| PERM-12 | วางแผน — edits from the person grid (same `saveAllocations`, per-item authz) | allow | allow | allow | 404 | AL-PERSON |
| PERM-11 / PERM-20 / PERM-21 | ticking on `/my`, leave edits from the person page — M3/M5 actions unchanged | (M3/M5 rows) | | | | unchanged; result shapes asserted in integration |

M9 adds **no server action** and **no table**: every new endpoint is a GET route handler; writes reuse `saveAllocations` (M6/M7), `setTaskStatus`/`completeTask` (M3/M6) and the M5 time-off actions.

### 1.2 Out of scope (do NOT build; target milestone)

| Item | Lands in |
|---|---|
| `/home` dashboard (my week, my 8-week load bars, manager "ล้นสัปดาห์นี้และสัปดาห์หน้า", team utilisation %), Cmd+K people/category search | M10 (reuses `services.workload.*`, §10) |
| Live block "ภาระทีมโปรเจค" (`projectWorkload`) and `GET /api/pages/:pageId/embed/workload` | M10 (X78; reuses `services.workload.buildTable({ userIds })`) |
| ◆ milestone feature itself (create/drag/late rules, project-grid row, calendar) | M8 ✅ (M9 only feeds the person context) |
| `seed:demo`, `seed:perf` at full scale, full §9 performance measurement | M11 (X69) |
| Day zoom on `/workload` (weekly only); per-day overload lives in the person grid (M7 day zoom) | never (r6b M9-14, r5 M9-13) |
| v2.1 `/alerts` page, KPI cards, filter-by-cause, quick-fix buttons ("เลื่อนงาน", "ย้ายให้คนอื่น") | never (r5 M9-08 ❌) |
| Notifications for new overloads, Excel export, scenarios, cost/rate card, audit UI | SPEC §13 #6, #10, #11, #14, #12 |
| Automatic re-planning when leave creates an overload | never (BR-42, P4) |

### 1.3 Carried-in items (deferred to M9 by earlier milestones)

| From | Item | Ruling |
|---|---|---|
| M2 | FR-409 load part and FR-303 load part (M2 shows no load figures) | X15 |
| M2 | `/people`, `/people/[id]` (first consumer of `canSeeUserDetails`), "👥 ทีมงาน" nav item | X30, M2 §1.2 |
| M2 | `services/masking.ts` completion (hidden projects → one masked aggregate) | X30, PLAN §3.4.4 |
| M3 | FR-667 person-page tab (via `/tasks`'s `TeamTasks`: flat list grouped by project + `TaskBoard`) | X77, X74 |
| M3 | FR-1009 buckets on `/my` and the sidebar count = my open tasks in สัปดาห์นี้ | X22 |
| M5 | FR-906 new-overload lines with links (M5 shows capacity before → after only); m05 §1.2's `allocationsOnTimeOffDays` → `TimeOffImpact.onTimeOffDays` (built here as `repo.allocations.sumDayRowsByDate`, S2.9) and `TimeOffImpact.overloads`, with M5's deep-equal `impact` tests updated (C36) | X23, M9-D18 |
| M5 | `services/capacity.ts#loadCapacity` / `loadCapacityInputs`, `maskTimeOff`, `canSeeLeaveDetails` reused | M5 §1.2 |
| M6 | Person grid (`GET /api/grid/person/[userId]`, `{ kind: 'person' }` context), `masked`/`project` row kinds, AC-604 verification on `/people/[id]` | X14, PLAN §3.10, M6 §1.2 |
| M6 | `repo.allocations.loadByUserWeek` (the single §6.5 builder), preference `load.view` | M6-D21, M6-D24 |
| M7 | BR-41 causes, excess amounts, week-level BR-45 tones in grid footers and workload cells, FR-906 line "มีงาน X วันวางไว้ในวันที่ลา" | X06, M7-D15, M7 §1.2 |
| M7 | `src/lib/grid/day.ts`, `day-footer.ts`, `src/domain/overload.ts` (`overloadLevel`, `loadTone`, `worstLevel`), preference `grid.zoom` reused by the person grid | M7-D1, M7-D13 |
| M8 | ◆ on the person grid (FR-705 person part, MASK-6; m08 §1.2) — `MilestoneRow` (component) gains only the optional `projectLabel?` prop (m08 S3.3); FR-409 per-member load + 12-week bars | X28, X15 |

---

## 2. Read first

- **SPEC:** §0–§3 (esp. §3.2 PERM-04/06/12/22, **§3.3 every line**), §4.3 FR-303, §4.4 FR-405/FR-409, §4.6 AC-604 + §4.6.3 FR-665/FR-667, §4.9 FR-906, **§4.10 FR-1001…1009**, §5.2 (BR-10…13), **§5.6 BR-40…45**, §5.7 BR-50/51, §5.9 BR-72, §5.10 BR-80/87, §6.2 (`user`, `positions`, `work_schedules`, `project_members`, `tasks.completed_week`, `allocations`), **§6.5**, §7.4 (`masked` row, `GET /api/grid/person`), §7.8 (`/api/tasks`), §8.1, §8.5, §8.7, §8.8, §8.9, §9, §11.1 `overload`, §11.2, §11.3, §12 M9.
- **PLAN.md:** §1.3 (Next `refresh()`, serialised actions, Drizzle numeric/`timestamptz`, DB in UTC, Playwright clock), §1.4 **X06, X09, X14, X15, X18, X22, X23, X28, X30, X31, X40–X47, X53, X57, X59, X64, X67, X74, X75, X77**; §2.3; §3.4 (errors, `route()`, authz API, masking, transactions); §3.5 (`qk.workload`, `workloadCell`, `workloadBadge`, `gridChunk`, `teamTasks`, `invalidateLoad`); §3.6; §3.7; §3.9; §3.10 (contexts); §4.3–§4.6.
- **Previous plans (names reused verbatim):** `plan/m06-weekly-grid.md` §5.S0 (`GridResponse`, `GridTaskRow`, `GridAssigneeRow`, `GridPerson`, `GridMilestone`, `gridQuerySchema`, `ChunkParams`, `services.grid.buildChunk`, `assembleGrid`), S2.1 (`repo.allocations.loadByUserWeek`, `listForWeeks`, `sumCountedByAssignment`, `WeekRange`), S3.1–S3.7 (`columns.ts`, `fetch.ts#gridChunkUrl`, `rows.ts#RowKey/ViewRow/buildViewRows/cellEditability`, `useSaveAllocations`, `aggregate.ts#footerTotals/footerValue`), M6-D33 (row keys `t:`/`a:`, test ids), S6.1 `GridPage`; `plan/m07-daily-resolution.md` §5.S0.1/S0.2, S1.10 (`overloadLevel`, `loadTone`, `worstLevel`), S1.11 (`src/lib/grid/day.ts`), S2.3 (`services/day-context.ts#loadDayData`, other-projects day aggregate), S3.10 (`src/lib/grid/day-footer.ts#personDayLoads/personDayStatus/footerDayCell`), S3.11 (`grid.zoom`); `plan/m05-calendar-capacity.md` S0.5 (`TimeOffImpact`, `CapacityImpactWeek`, `CalendarTimeOff`), S2.4 (`createTimeOff`/`updateTimeOff`), S3.5 `ImpactPanel`, world `'timeOff'`; `plan/m03-tasks.md` S0.4 (`teamTasksQuerySchema`, `zUserId`), S0.5 (`MyTasksResponse`, `MyTaskDTO`, `TeamTasksResponse`, `TaskCard`), S2.10 (`listMyTasks`, `countMyOpenTasks`), S3.12 (`MyTasks`), S3.19 (`TeamTasks`); `plan/m02-clients-projects-authz.md` S0.6 (`masking.ts` skeleton), S1.2 (`visibleUserIds`, `canSeeUserDetails`, `requireClient`), S2.5/S2.6 (overview, client page); `plan/m00-scaffold.md` (`src/components/shell/nav.ts`), M4-D27 (sidebar order).
- **Research:** `plan/research/r6b-gaps-m6-m11.md` §3.4 (M9-01…M9-14), §4.1, §4.5, §4.7 (`band`, `level`, `excess`), §5 "M9"; `plan/research/r8-golden.md` §2.3, §3.3 G6–G9/G13, §4.1, §4.3, §4.4, **§4.6**, **§4.8**, §4.10, §6.4, §6b, and `snippets/r8/facts.json` (`masking`, `invisiblePairs`, `badges`, `synthetic`, `colors`); `plan/research/r5-v21-mining.md` §2 M9-01…M9-15, §3.3, §4.3, §4.4; `plan/research/r4-client-testing.md` §4–§16 (grid reuse, `useQueries`, virtualizer), §29 (Zod), §37–§41 (Playwright); `plan/research/r2-auth-db.md` (§6.5 query + `coalesce`).
- **docs:** `docs/reference/golden-fixtures.json` (`expected.F1.byUserWeek`, `expected.F2/F3/F4.overloads`).

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings

| ID | What it means in M9 |
|---|---|
| X06 | M7 delivered `overloadLevel`/`loadTone`/`worstLevel`; M9 adds BR-41 `overloadCause`, `overloadExcess`, `overloadStatus`, `viewTone`, `worsened` and the week-level footer tones/glyphs. |
| X09 | `GET /api/people/options` stays the picker directory; workload numbers never go through it. |
| X14 | AC-604 verified on `/people/Jack` and `/people/Mint` (int + e2e W7). |
| X15 | FR-409 and FR-303 load figures land here (overview section, client page header + column). |
| X18 | New queries registered under the `['workload']` prefix (or `['calendar']` for person leave) so `invalidateLoad`/`invalidateCalendar` reach them; FR-405 proven on `/workload` (e2e W2). |
| X22 | `/my` switches to FR-1009 buckets; the sidebar count = my open tasks in สัปดาห์นี้. |
| X23 | FR-906: new/worsened overload lines with links; project names masked through `masking.ts`. |
| X28 | Person grid `milestones` = M8 `MilestoneDTO`s of (visible ∩ the person's projects) via `repo.milestones.listForProjects` + `toDTOs`; `lateForMilestone` via `computeLateness({ boundTaskIds })`; `context.canManage = false` (M9-D29). |
| X30 | `services/masking.ts` completed: `maskProjectParts`, `maskedGridRow`, `maskCellItems`. |
| X31 | Badge = server-rendered initial value + `WorkloadBadge` client component on `qk.workloadBadge()`. |
| X40/X41 | `pnpm check` includes integration; invisible person/project/client → 404; bad query → 400 (parse before authz). |
| X42 | Archived projects: overview load section shows the "ไม่นับภาระ" note; excluded from workload and person grid (BR-44). |
| X43 | `visibleUserIds` (totals) and `visibleProjectIds` (details) are the only visibility sources. |
| X44 | No new mutating action → no new audit rows; AL-PERSON asserts the existing `allocation` audit row. |
| X45 | Services take `today`; routes pass `serverToday()`; tests pin `APP_NOW=2026-09-30T10:00:00+07:00`. |
| X46 | e2e on the production build, `resetDb`, `loginAs`, `page.clock.setFixedTime`, page objects, older specs updated (S6.3). |
| X47 | `z.uuid()`, `z.iso.date()`; Thai only via `th.*` (the masked row label is `th.masking.otherProjects` set on the server); no `revalidateTag`. |
| X53 | Filters in the URL, view in `load.view`, unit/zoom in `grid.unit`/`grid.zoom`; no `localStorage`. |
| X57 | Person layout authz (`orNotFound(getPersonHeader)`) runs before any Suspense; no `loading.tsx` under `(app)/people/**`. |
| X59 | S0 creates no runtime file under `src/domain/**` (signatures in §5.S1); factories plain Drizzle; no new preference key. |
| X64 | `standard` ignores deactivation → a deactivated week's cause is computed per BR-41; the UI label says "ปิดใช้งาน" (M9-D7). |
| X67 | Followed verbatim: colour by the selected view (tentative palette for AT_RISK), glyph by BR-40, integer bands, excess OVER = committed − cap / RISK = total − cap, population, filters select people, windows include the current week, `{ kind: 'project' }` rows (visible only) + one masked row without ids, unit preference grids only. |
| X74 / X77 | Person tab and `/my` alternate views render M3's `TeamTasks` (list view = M3 S3.19's flat rows grouped by project; board view = `TaskBoard`/`TaskCard`) with `fixedUserId` and `syncUrl={false}` (M3-D41); `/my` default stays the FR-1009 buckets. |
| X75 | `GET /api/tasks?userId=` filters visibility in SQL; reused unchanged. |
| X76 | Person-grid task rows keep `blockers: { open, total }` (counts only). |
| X80–X92, X95 (2026-10-30 contracts) | X81 routes `api/people`, `api/people/[userId]/time-off`, `api/projects/[id]/load`, `api/clients/[id]/load`; X82 keys `peopleDirectory`/`projectLoad`/`clientLoad`/`personTimeOff`, `invalidateLoad` → `['sidebar']`, `invalidateAfterGridSave` extension (S3.7); X83 `getJson`; X84 `NavBadge` gains `'workloadOver'`, `PRIMARY_NAV` home, my, tasks, workload, calendar (S0.9); X85 grid contract (`personDayLoads(rows, periods, { extra? })` with M9's masked-row branch, row keys `p:`/`m:`, `GridContextInfo` person with `canManage: false`, `dayLoadsForProjects(… projectIds?)`); X86 malformed/unknown user id → 404 (`requireVisibleUser`); X87 `repo.assignments.listActiveForUserLive`, `repo.people.getPerson`, `requireVisibleUser` (created here); X90 `buildTable(…, today)`, `countMyOpenTasks(tx, userId, today)`; X91 `resetDb(fixture?, { alsoFixtures })`, rows files registered in `tests/authz/rows/index.ts`, type-only `src/domain/types.ts` additions; X92 `addSyntheticWorkload` (no audit rows, `client_id = null`); X95 `/my` → `MyTaskBucketsResponse`. |

### 3.2 New milestone decisions (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M9-D1 | §12 M9, PLAN §5 | Streams refined from the skeleton: **S1** (domain) also owns pure client/server helpers `src/lib/workload/**` and `src/lib/my/**`; tests split into **S5** (authz rows, masking, golden — depends only on S0) and **S6** (e2e + page objects + older specs). Service integration tests are written test-first by S2 inside `src/server/**` (M3-D1 precedent). | Ownership by path (PLAN §2.3); maximal parallelism. |
| M9-D2 | FR-1001/1002, r6b §4.5 | `GET /api/workload?from&to&positionId&projectId&onlyOver` → `WorkloadResponse` (§5.S0.3): `weeks`, `groups[].people[].cells[week]` = `{ total, committed, capacity, standard, level, excess, cause, byProject[] }` for **every** week (empty weeks included), `positions` (all, ordered), `projects` (visible projects referenced by `byProject` only), `overloads` (the FR-1006 list). The load **view is not a server parameter**: cells carry both numbers and the client colours them, so switching views never refetches. | One payload serves table, tooltip, list tab and tab count (r6b M9-03). |
| M9-D3 | FR-1001, X67, r6b M9-05 | Population = visible users (`visibleUserIds`) ∩ (users that are **active** (`!banned && deactivated_on is null`) and members of ≥ 1 non-archived, non-deleted project ∪ users with total load > 0 in the window). Managers without memberships are excluded. Groups follow `positions.position, id`; users without a position go to `th.workload.noPosition` last; people inside a group by `compareThai(displayName)`; empty groups are omitted. | X67; golden shows 5 rows (no Manager). |
| M9-D4 | FR-1001, X65, r6b M9-06/M9-14 | Default window `[weekStart(today), +12 w)`; ◀/▶ shift by 4 weeks, "สัปดาห์นี้" resets; the table scrolls horizontally inside its own container. `from`/`to` are Mondays, `to` exclusive, span ≤ 53 weeks (same rule as the grid). "scroll ต่อได้" = moving the window (keepPreviousData, no flash). | Simplest reading; bounded queries (`week_start` rule). |
| M9-D5 | FR-1004, X67, r6b M9-04 | Filters select people only: `positionId` = users of that position; `projectId` (must be visible, else **404**) = members of that project ∪ users with load in it within the window; `onlyOver=1` = people with ≥ 1 cell whose BR-40 level ≠ OK in the window (view-independent, so it matches the list tab). Cells and the badge always use the full load. Filters live in the URL (`history.replaceState`, as M3-D33). | Simpler than r6b's view-dependent reading; one definition of "ล้น" across table, list and filter. |
| M9-D6 | FR-1002, §8.5, §8.8, X67 | Cell text = `compact(viewLoad)/compact(capacity)` where `compact` = 1 decimal half-up with a trailing ".0" removed ("5/4", "3.8/5", "2.5/4"); view load 0 → "–" (aria "ว่าง"); tooltip and panel numbers 2 decimals. Colour = `viewTone(load, cap, view)` (ALL → total, COMMITTED → committed, AT_RISK → tentative palette when total − committed > 0); glyph = BR-40 level of `{ total, committed }` with visually hidden `th.overload.weekStatus(...)`. | X67, r8 G7 (F4 Cindy red but RISK). |
| M9-D7 | BR-41, X64, r5 M9-06 | Cause is computed for OVER **and** RISK (null for OK) from `{ total, cap, standard }`; `standard` stays the schedule capacity (X64), so weeks on/after a user's `deactivatedOn` compute CAPACITY/BOTH — the UI shows `th.overload.cause.DEACTIVATED` instead of the cause text for those weeks (data unchanged). | Keeps X64; avoids "เพราะลา" on a deactivated person. |
| M9-D8 | §3.3, FR-1002, X30 | `byProject` = one part per **visible** project with non-zero load (sorted by `compareThai(name)`) + at most one `{ projectId: null }` part = Σ all hidden projects (no id, no count, no name; rendered as `th.masking.otherProjects`); `projects` dictionary only holds visible projects. Manager sees no null part. | SPEC masking literal. |
| M9-D9 | FR-1005 | `GET /api/workload/cell?userId&week` → `{ cell, items }`: one item per live assignment of that user with counted load in that week in a **visible** project (task name, parent path, project name/colour, `{ total, committed }`, certainty, `href = /projects/<pid>/plan?task=<taskId>`), plus one `{ kind: 'masked', label, load }` item for all hidden projects. Invisible user → 404. | Lazy, masked, links to M6's plan page with the panel. |
| M9-D10 | FR-1006 | `overloads` = every non-OK cell of the selected people in the window, sorted week ↑, OVER before RISK, `compareThai(name)`; each with `href = /people/<userId>/plan?week=<week>`. The tab label shows the count. | Same service as table and badge (r6b M9-03). |
| M9-D11 | FR-1007, X31, r6b M9-06/07 | Badge = number of (person, week) cells at OVER over the **visible population** (M9-D3) and weeks `[weekStart(today), +4 w)`. `(app)/layout.tsx` computes the initial value server-side; `WorkloadBadge` uses `useQuery(qk.workloadBadge(), { initialData })`, refetches on focus and is invalidated by `invalidateLoad`. Hidden at 0; otherwise "●N" with a visually hidden sentence (never colour alone). | r8 badge table; layouts don't re-render on navigation. |
| M9-D12 | §7.4, X67, r6b M9-08 | Person grid (`GET /api/grid/person/[userId]`, M6 `gridQuerySchema`; `includeOthers` ignored): `context = { kind: 'person', id, name, active, deactivatedOn, canEdit, canManage: false }`; rows = per visible non-archived project (sorted `compareThai`) one `{ kind: 'project' }` row, then for each live assignment of the person in that project (task tree order) a task row (`totals` = **this person's** counted cells, `breadcrumb` = parent names, `projectId`) followed by that person's assignee row (always merged in the UI); finally one `{ kind: 'masked', userId, label: th.masking.otherProjects, totals }` row when hidden load ≠ 0 in the chunk. No ids, names or counts of hidden projects anywhere. `people` holds only the person. Archived/deleted projects are excluded (BR-44). Completed tasks follow `tasks.showCompleted` (M6-D12). | One grid component (PLAN §3.10); SPEC §7.4 masked row. |
| M9-D13 | §8.3, X06, M7-D13 | Footers: **person grid** = the person's full load (Σ counted assignee cells + masked row) vs `people[u].capacity` per period with tone (view) + BR-40 glyph + tooltip (excess, cause); **project grid** week columns gain the aggregated tone (Σ load vs Σ cap) and worst-person glyph, mirroring M7-D13's day columns. No per-cell week glyphs. | Footer sums must not hide one person's overload; symmetric with M7. |
| M9-D14 | FR-1008, M2 §1.2, r6b M9-09 | Routes: `/people` (directory, `GET /api/people` → visible users incl. managers, grouped by position, this week's `WorkloadCell`) and `/people/[id]` → redirect to `/people/[id]/plan`; tabs `plan` · `tasks` · `leave` from `PEOPLE_TABS`. `src/app/(app)/people/[id]/layout.tsx` runs `orNotFound(getPersonHeader(db, user, id))` first (404 via `authz.requireVisibleUser`). Header: display name (+ full name), position, schedule text (e.g. "จ–ศ · 1.00 วัน/วัน"), "ปิดใช้งาน" chip; no email. | X57; PLAN §3.1 routes. |
| M9-D15 | FR-667, X77, M3-D41 | `TeamTasks` (M3) gains `fixedUserId?: string`, `forcedView?: 'LIST' \| 'BOARD'`, `hint?: string` on top of M3's `syncUrl?: boolean`. Every M9 call site passes **`syncUrl={false}`** together with `fixedUserId` (M3's `useTeamTaskFilters({ syncUrl })` then never calls `history.replaceState`; filters stay in memory); `fixedUserId` is merged into the `TeamTaskFilters` object (`userId: fixedUserId`) and the person filter control is hidden; same `qk.teamTasks({ ...filters, userId })` → `GET /api/tasks?userId=` (no new endpoint; visibility in SQL). The person tab shows `th.people.tasks.hiddenHint` when the viewer is neither the person nor a manager. `/my` gets a view switch `ตามสัปดาห์ · ลิสต์ · บอร์ด` in the URL (`?view=list|board`, default buckets); ลิสต์/บอร์ด render `TeamTasks fixedUserId={me} forcedView=…` (the shared `tasks.view` preference is not touched by `forcedView`). | FR-667 literal ("ค่าเริ่มต้น" = buckets); no new endpoint. |
| M9-D16 | FR-1008 วันลา, §3.3 | `GET /api/people/[userId]/time-off` → `{ entries: CalendarTimeOff[]; canEdit }` over `[weekStart(today) − 52 w, weekStart(today) + 53 w)` using M5's `maskTimeOff` (masked entries have no id/type/colour/note). `canEdit` = self or manager → the tab offers "แจ้งลา" and edit via M5's `LeaveDialog`, delete with undo (M5 actions). Query key `qk.personTimeOff(userId)` under the `['calendar']` prefix. | Reuses M5 masking and actions. |
| M9-D17 | FR-1009, X22, r6b M9-10 | Bucket of an open assigned leaf task (M3's `/my` set) = the bucket of the **earliest week ≥ weekStart(today)** with my counted cd > 0 (bounded to `+157 w`): this week → `THIS_WEEK`, next → `NEXT_WEEK`, later → `LATER`; none (incl. past-only plans) → `UNPLANNED`. Each task carries `firstWeek` and `plannedCd` (my cd in that week). Inside a bucket: `firstWeek`, due date (nulls last), `created_at`, `id`. `GET /api/tasks/my` returns the new `MyTaskBucketsResponse` `{ today, buckets: { key, tasks }[], count }` (replaces M3's `MyTasksResponse`, X95) with `count = THIS_WEEK length` = the sidebar number. `invalidateLoad` now also invalidates `qk.sidebar()` (the count depends on plans). | r6b M9-10; X22. |
| M9-D18 | FR-906, BR-42, X23, r5 M9-09 | `TimeOffImpact` gains `overloads: OverloadImpactLine[]` and `onTimeOffDays: { date, cd }[]` (Σ the user's DAY rows on the new leave dates, no task names; UI line `th.grid.warn.allocatedOnTimeOff`). Lines = affected weeks whose status **worsened** (level rank up OK → RISK → OVER, or same non-OK level with larger excess); RISK counts as an overload. Each line: before/after level and excess, cause, load, capacity, masked project parts, `href = /people/<id>/plan?week=`. Computed in the same transaction **after** the write; create and update only (delete/restore can only lower load ratio — no panel, M5-D5). | FR-906; never edits plans. |
| M9-D19 | FR-409, X15, r6b M9-12 | `GET /api/projects/[id]/load` (`requireProject(view)`) → per member (project members ∪ users with load here) `thisWeek` and 12-week `sum` (this project only), weekly totals for `[weekStart(today), +12 w)`; archived project → `archived: true` and no numbers (UI note `th.workload.projectLoad.archived`). Bars: committed part solid, tentative part hatched, each bar with a text label (sr-only). Rendered as a client section on M2's overview tab (`qk.projectLoad(id)`). | Route + TanStack for load data (CLAUDE.md). |
| M9-D20 | FR-303, X15, r7 FR-303 | `GET /api/clients/[id]/load` (`requireClient`) → Σ over the client's projects that are **visible to the viewer and not archived**, window `[weekStart(today), +12 w)`, plus per-project sums; the client page shows the total in its header (`th.workload.clientLoad.total(days)`) + a "ภาระ 12 สัปดาห์" column, with `th.workload.clientLoad.visibleOnly` for workers. | Masking: a worker never sums hidden projects. |
| M9-D21 | §8.8, X67, r6b M9-13 | `grid.unit` applies to the person grid only; workload, overview, client page and `/people` always show days (+ % where shown). | X67. |
| M9-D22 | PLAN §3.5, X18 | Query keys added: `qk.peopleDirectory()` = `['workload','people']`, `qk.projectLoad(id)` = `['workload','project',id]`, `qk.clientLoad(id)` = `['workload','client',id]`, `qk.personTimeOff(userId)` = `['calendar','person',userId]`; `WorkloadParams` = the parsed `workloadQuerySchema` output. A successful grid save also invalidates the **other** grid context prefix (`['grid','project']` after a person-grid save and `['grid','person']` after a project-grid save) and `qk.sidebar()`, by **appending** `invalidateQueries` calls to M6's `invalidateAfterGridSave(qc, ctx)` in `src/lib/grid/save-invalidate.ts` (C65; additive to M8's `qk.projectMilestones(ctx.id)` call, never touching the saving context's own `qk.gridAll(ctx)`). | Everything under existing prefixes → `invalidateLoad` covers it. |
| M9-D23 | §9 NFR-03, C69 | Perf smoke: `seedGolden` + `addSyntheticWorkload(tx, { people: 95, projects: 20, weeks: 12, from: '2026-09-28' })` (same composition as M11's `seed:perf` → 100 workers on `/workload`); `workload.perf.int.test.ts` asserts `buildTable` over 12 weeks < 1 600 ms (2× budget, logged). Full measurement M11. | Regression guard without flaky CI; one builder for M9 and M11. |
| M9-D24 | CLAUDE.md deps/DB | No new dependency, no schema change, no migration, no new server action, no new preference key. | Smallest footprint. |
| M9-D25 | §3.3 | Workload tooltips show "Capacity X วัน (มาตรฐาน Y)" and never name a leave type or holiday (no `maskTimeOff` needed in workload responses); the person grid keeps M6's masked `timeOff` labels. | No leak path through tooltips. |
| M9-D26 | §8.5 mock, X11, r5 M9-15 | e2e uses the combined **F2 + F3** state (the §8.5 mock) via `resetDb('F2', { alsoFixtures: ['F3'] })` (each fixture still applies only its own setup, X11). | Matches the mock: Jack 19/10 "5/4🔴", Peter 5/10 "5/3🔴". |
| M9-D27 | §6.5, M6-D24 | One new repo loader `repo.allocations.loadByUserProjectWeek(tx, { userIds, range })` (§6.5 grouped additionally by `t.project_id`) feeds workload cells, breakdowns, masked rows, impact lines, overview and client loads; M6's `loadByUserWeek` stays for the grid footer switch. | One query shape, every filter (BR-44, BR-50, coalesce) in one place. |
| M9-D28 | §4.8, M6-D19 | The person grid has **no** structure affordances (no "+ เพิ่มงาน…", no "+ คน", no ×, no row Delete); cell editing, fill, paste, undo and the M7 day zoom work as in the project grid; ↗ opens `/projects/<pid>/plan?task=<id>`. `?week=<Monday>` scrolls that week to the first visible column and marks its header (`data-focus-week`). | Rows belong to projects; edits through the same save pipeline. |
| M9-D29 | FR-705, M8-D8/D10 | Person-grid `context.canManage = false`: ◆ are shown (visible projects where the person has live assignments, via `repo.milestones.listForProjects` + `toDTOs`, lateness via `computeLateness({ boundTaskIds })`) but never created, dragged or edited there; managing milestones stays on the project grid/overview. | One `canManage` flag cannot express per-project rights in a multi-project grid; simplest safe choice. |

DEVIATION summary: **none** (M9-D4/M9-D5 are interpretations within SPEC wording; no SPEC rule is overridden).

---
## 4. Streams (machine-readable)

DAG: `S0 → {S1, S5}`; `S1 → {S2, S3, S4}`; `{S2, S3, S4, S5} → S6`. Concurrent sets: {S1, S5}, then {S2, S3, S4, S5}. S0 runs alone and may touch the M3/M5/M6/M7/M8 files its steps name to keep G0 green (union widening, additive result fields; e.g. `ImpactPanel.test.tsx`/`LeaveDialog.test.tsx` fixtures in S0.3, the `Sidebar.tsx` icon map in S0.9); after G0 those files belong to the stream whose globs cover them. `src/i18n/th.ts` belongs to S0; afterwards S2 may add keys only in `errors`, S3 only in `grid` and `overload`, S4 only in `workload`, `people`, `my`, `nav` (PLAN §2.3, Edit tool only). S1's files are read-only for S2–S4 (S1 → S2/S3/S4 is sequential).

```json
{ "milestone": 9,
  "streams": [
    { "id": "S0", "title": "Contracts: M6/M7/M8 inventory, workload/people/load/person-grid DTOs, GridRow project+masked kinds and person context, zod query schemas, MyTaskBuckets + TimeOffImpact additions, authz requireVisibleUser signature, service/repo/route stubs, query keys + invalidation, i18n (workload, people, overload, my, nav), nav entries, synthetic workload builder, e2e resetDb alsoFixtures + userIdByNickname", "agent": "backend-engineer",
      "owns": ["src/domain/types.ts", "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts", "src/i18n/th.ts", "src/server/authz.ts", "src/server/services/index.ts", "src/server/services/workload.ts", "src/server/services/people.ts", "src/server/services/masking.ts", "src/server/services/my-tasks.ts", "src/server/services/time-off.ts", "src/server/services/grid.ts", "src/server/repo/allocations.ts", "src/app/api/workload/**", "src/app/api/grid/person/**", "src/app/api/people/route.ts", "src/app/api/people/[userId]/**", "src/app/api/projects/[id]/load/**", "src/app/api/clients/[id]/load/**", "src/components/shell/nav.ts", "src/components/shell/nav.test.ts", "scripts/lib/fixtures.ts", "scripts/lib/fixtures.int.test.ts", "tests/helpers/**", "e2e/fixtures.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain (TDD): overload.ts BR-41 cause, excess, overloadStatus, viewTone (BR-45 per view), worsened; pure helpers src/lib/workload (compact format, cell text, tooltip lines) and src/lib/my (FR-1009 bucketOf)", "agent": "domain-engineer",
      "owns": ["src/domain/overload*.ts", "src/lib/workload/**", "src/lib/my/**"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Backend: loadByUserProjectWeek, masking completion, workload table/cell/badge/overloads, people directory + header + time-off, person grid chunk (project rows, masked row, milestones), my-task buckets + sidebar count, FR-906 overload lines, project/client load, perf smoke", "agent": "backend-engineer",
      "owns": ["src/server/**", "src/app/api/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S2" },
    { "id": "S3", "title": "PlanGrid person context: row model (project/masked rows, always-merged rows), person chunk fetch, read-only rows, person footer + week-level tones/glyphs in both contexts, focus week, save invalidation of the other context, no structure affordances", "agent": "grid-engineer",
      "owns": ["src/components/grid/**", "src/lib/grid/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Frontend: /workload (table, toolbar, filters, tooltip, side panel, overload tab), sidebar badge + nav, /people directory, /people/[id] layout/header/tabs (plan, tasks via TeamTasks fixedUserId, leave), /my buckets + view switch, FR-906 impact lines, overview + client load sections, invalidation audit", "agent": "frontend-engineer",
      "owns": ["src/app/(app)/**", "src/components/workload/**", "src/components/people/**", "src/components/tasks/**", "src/components/calendar/**", "src/components/projects/**", "src/components/clients/**", "src/components/shell/**", "src/hooks/**", "src/lib/people/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S4" },
    { "id": "S5", "title": "Authz matrix rows (test-first), masking leak tests (world + golden r8 pairs), golden F1–F4 through workload service/route and person grid, badge per viewer, older test updates", "agent": "test-engineer",
      "owns": ["tests/authz/**", "tests/golden/**", "tests/integration/**"],
      "dependsOn": ["S0"], "planSection": "5.S5" },
    { "id": "S6", "title": "E2E m9-workload spec, workload/people/my page objects, update older specs", "agent": "test-engineer",
      "owns": ["e2e/**"],
      "dependsOn": ["S2", "S3", "S4", "S5"], "planSection": "5.S6" }
  ],
  "e2e": ["e2e/m9-workload.spec.ts"] }
```

Ownership notes: `src/components/shell/nav.ts` is S0's (entries) and `src/components/shell/**` is S4's afterwards (sequential). S3 never edits `src/app/**`; the person plan page (S4) renders `PlanGrid`. `src/lib/workload/**` (S1) and `src/lib/grid/**` (S3) are disjoint.

---

## 5. Step-by-step

### 5.S0 — Contracts (backend-engineer · owns: see §4 S0)

Runs alone and ends at **G0** (`pnpm check` green with stubs). M9 has **no schema change** and **no new dependency** (M9-D24): nothing is installed and no migration is generated. Nothing here implements behaviour except zod, i18n, nav entries, the seed builder and the test helpers.

**S0.1 Preflight + inventory (name map).**
- `git status` clean on tag `m8`; `pnpm db:up`; `pnpm check` green; `pnpm db:generate` → "No schema changes, nothing to migrate".
- Inventory the names M9 reuses (M6–M8 were planned in parallel; **when a real export differs, use the real one and never rename it**):
  ```bash
  grep -n "^export" src/domain/{types,overload,certainty,units,capacity,dates}.ts src/lib/contracts/{grid,tasks,time-off,capacity,calendar,workload,sidebar}.ts \
    src/lib/schemas/{grid,tasks,time-off}.ts src/lib/query-keys.ts src/lib/invalidate.ts src/lib/grid/*.ts \
    src/server/services/{grid,capacity,masking,my-tasks,time-off,teamTasks,day-context,milestones,people}.ts \
    src/server/repo/{index,allocations,tasks,task-assignments,people,projects,milestones}.ts src/lib/api.ts src/lib/grid/save-invalidate.ts \
    src/server/authz.ts src/components/shell/nav.ts src/components/tasks/team/{TeamTasks,useTeamTaskFilters}.ts* tests/helpers/*.ts e2e/fixtures.ts e2e/pages/*.ts
  ```
- Names already pinned by reviewed plans (m03, m04, m06, m08 — do not re-derive): repo barrels `repo.tasks`, `repo.assignments` (= `./task-assignments`), `repo.statuses`, `repo.blockers` (M3-D39); `repo.tasks.listLiveWithBlockerCounts(tx, projectId)` → `TaskListRow` (live tasks incl. `completedWeek`, `statusCategory`, `blockersOpen`, `blockersTotal`, M8's live `milestoneId`; no assignees) and `repo.assignments.listActiveForProject(tx, projectId)` (M3-D39, + `version` from M6); `repo.assignments.listActiveForUserLive` does **not** exist — S2.5 creates it (C52); nav `NavBadge`, ids `'my'`/`'tasks'`, `NavIcon` `'my'`/`'teamTasks'` (M3-D40); `TeamTasks({ syncUrl })` + `useTeamTaskFilters({ syncUrl })` + `TeamTaskFilters` (M3-D41); `getJson` from `src/lib/api.ts` (never `getJSON`); grid columns `ColKind 'W' | 'D'` + `role`, `buildColumns(weeks, expanded, dayDatesByWeek)`, `columnIndexOfPeriod`, `HEADER_ROWS` (= 2 after M8) / `FOOTER_ROWS` (= 3) in `src/lib/grid/columns.ts` (M6-D35, M8-D26); `invalidateAfterGridSave(qc, ctx)` in `src/lib/grid/save-invalidate.ts` (M6 S3.6, extended by M8 with `qk.projectMilestones`); `GridCtx` in `src/lib/query-keys.ts`; `ChunkParams.zoom: 'week' | 'day'` (M6 S0.6).
- Fill this table in the S0 report (and paste it into `PROGRESS.md › แผนของ milestone ปัจจุบัน`):

  | This plan | Expected location (milestone) | Purpose |
  |---|---|---|
  | `LoadPair`, `LoadView`, `PeriodKey`, `Cd`, `ISODate`, `Weekday`, `Schedule` | `src/domain/types.ts` (M1/M6) | types |
  | `overloadLevel`, `OverloadLevel`, `loadTone`, `LoadTone`, `worstLevel` | `src/domain/overload.ts` (M7 S1.10) | BR-40/45 |
  | `viewLoad`, `splitLoad`, `effectiveCertainty` | `src/domain/certainty.ts` (M3/M6) | certainty views |
  | `formatCd` | `src/domain/units.ts` (M6) | integer formatting |
  | `GridResponse`, `GridRow`, `GridTaskRow`, `GridAssigneeRow`, `GridPerson`, `GridPeriod`, `GridMilestone`, `AssigneeCell` | `src/lib/contracts/grid.ts` (M6/M7/M8) | grid DTOs |
  | `gridQuerySchema`, `GridQuery`, `zMonday` (local) | `src/lib/schemas/grid.ts` (M6/M7) | person grid query |
  | `services.grid.buildChunk`, `assembleGrid`, `ChunkParams` | `src/server/services/grid.ts` (M6/M7) | chunk builder |
  | `repo.allocations.loadByUserWeek`, `listForWeeks`, `sumCountedByAssignment`, `WeekRange` | `src/server/repo/allocations.ts` (M6) | bounded loads |
  | `loadDayData`, `loadDayCtx`, other-projects day aggregate `repo.allocations.dayLoadsForProjects` (name given by the m07 review; record the real signature) | `src/server/services/day-context.ts`, `src/server/repo/allocations.ts` (M7 S2.3) | D: keys |
  | `repo.tasks.listLiveWithBlockerCounts` → `TaskListRow`, `repo.assignments.listActiveForProject`, `LIVE_MILESTONE_ON`/`LIVE_MILESTONE_JOIN` | `src/server/repo/{tasks,task-assignments,milestones}.ts` (M3-D39, M8-D5) | person-grid task rows |
  | `HEADER_ROWS`, `FOOTER_ROWS`, `buildColumns`, `ColKind`, `columnIndexOfPeriod`, `invalidateAfterGridSave` | `src/lib/grid/{columns,save-invalidate}.ts` (M6, M8) | grid client |
  | `repo.milestones.listForProjects(tx, projectIds, range?)`, `services.milestones.toDTOs(tx, rows, today)`, `computeLateness(tx, { boundTaskIds })`, `LIVE_MILESTONE_JOIN`, `GridMilestone` (= `MilestoneDTO`), `context.canManage`, `SaveAllocationsOk.lateness`, `src/lib/grid/milestones.ts` (`milestoneColumnKey`, `placeMilestones`, `applyLateness`, `applyMilestonePatch`), `MilestoneRow` (grid ◆ row **component**; the repo row type is `MilestoneDbRow`, C81), `MilestoneStatusChip`, `MilestoneLateBadge`, `qk.projectMilestones`, `invalidateMilestones` | M8 (`plan/m08-milestones.md` §5.S0, S2.5, S3) | ◆ in person grid |
  | `loadCapacity`, `UserCapacity`, `maskTimeOff`, `canSeeLeaveDetails`, `TimeOffImpact`, `CapacityImpactWeek`, `CalendarTimeOff` | M5 | capacity, masking, impact |
  | `visibleProjectIds`, `visibleUserIds`, `canSeeUserDetails`, `requireProject`, `requireClient`, `isManager` | `src/server/authz.ts` (M2) | authz |
  | `partitionByProject`, `maskHidden`, `isVisible`, `Visible` | `src/server/services/masking.ts` (M2/M5) | masking |
  | `listMyTasks`, `countMyOpenTasks`, `MyTasksResponse`, `MyTaskDTO` | `services/my-tasks.ts`, `contracts/tasks.ts` (M3) | `/my` |
  | `teamTasksQuerySchema`, `zUserId`, `TeamTasks` (prop `syncUrl`), `useTeamTaskFilters({ syncUrl })`, `TeamTaskFilters` | M3 S0.4, S3.19, M3-D41 | person tab |
  | `rowKeyOfTask`, `rowKeyOfAssignment`, `RowKey`, `ViewRow`, `buildViewRows`, `cellEditability`, `footerTotals`, `footerValue`, `gridChunkUrl`, `useSaveAllocations` | `src/lib/grid/**`, `src/components/grid/**` (M6) | grid client |
  | `personDayLoads`, `personDayStatus`, `footerDayCell` | `src/lib/grid/day-footer.ts` (M7 S3.10) | footer tones |
  | `PRIMARY_NAV`, `NavItem`, `NavIcon`, `NavBadge` (`'myTaskCount'`), item ids `'my'`/`'tasks'`, bottom group with `clients` | `src/components/shell/nav.ts` (M0–M5, M3-D40) | nav |
  | `createWorld({ with: ['allocations'] })`, `w.users.coworker`, `w.assignments.pCoworker`, `w.assignments.qTaskCoworker`, `makeAllocation`, `asUser`, `outcomeOf`, `outcomeOfCall`, `currentUser` | `tests/helpers/**` (M2–M6) | tests |
  | `resetDb`, `loginAs`, `projectIdByName`, `GridPage` | `e2e/fixtures.ts`, `e2e/pages/grid.ts` (M6/M7) | e2e |
- Done-check: every row maps to a real export or is marked "absent → created by step S…".

**S0.2 Domain types (`src/domain/types.ts`, type-only — allowed for S0 since it holds no runtime code).** `LoadPair`/`LoadView` exist (M6 S0.2). Add:
```ts
export type OverloadCause = 'WORKLOAD' | 'CAPACITY' | 'BOTH'                          // BR-41
export interface OverloadStatus { level: 'OK' | 'RISK' | 'OVER'; excessCd: Cd; cause: OverloadCause | null }   // X67; cause null when OK
```
S1 imports them in `src/domain/overload.ts` (and re-exports them so callers can import from either place). No runtime file under `src/domain/**` is created by S0 (X59).

**S0.3 DTOs (`src/lib/contracts/workload.ts`, new; names fixed for M10).**
```ts
import type { Cd, Certainty, ISODate, LoadPair, OverloadCause } from '@/domain/types'
import type { OverloadLevel } from '@/domain/overload'                      // M7 (type-only import)
export type { OverloadCause, OverloadLevel }
/** Per-project share of a cell. projectId null = all projects the viewer may not see, combined (th.masking.otherProjects). */
export interface WorkloadProjectPart { projectId: string | null; total: Cd; committed: Cd }
export interface WorkloadCell {
  total: Cd; committed: Cd                     // counted load (BR-37, BR-44, BR-50)
  capacity: Cd; standard: Cd                   // BR-11 / BR-41 standard (M5)
  level: OverloadLevel; excess: Cd; cause: OverloadCause | null   // BR-40, X67, BR-41 (null when OK)
  byProject: WorkloadProjectPart[]             // M9-D8; [] when total = 0
}
export interface WorkloadPerson {
  userId: string; name: string                 // displayName (FR-210)
  positionId: string | null; active: boolean; deactivatedOn: ISODate | null
  cells: Record<ISODate, WorkloadCell>         // every week of `weeks`
}
export interface WorkloadGroup { positionId: string | null; name: string; people: WorkloadPerson[] }   // name = position name | th.workload.noPosition
export interface OverloadItem {
  userId: string; name: string; week: ISODate; level: 'RISK' | 'OVER'; excess: Cd; cause: OverloadCause
  total: Cd; committed: Cd; capacity: Cd; standard: Cd; deactivatedOn: ISODate | null
  href: string                                 // `/people/${userId}/plan?week=${week}` (M9-D10)
}
export interface WorkloadParams { from: ISODate; to: ISODate; positionId: string | null; projectId: string | null; onlyOver: boolean }
export interface WorkloadResponse {
  from: ISODate; to: ISODate; today: ISODate; weeks: ISODate[]
  groups: WorkloadGroup[]
  positions: { id: string; name: string }[]                   // all positions in order (filter options)
  projects: Record<string, { name: string; color: string }>   // visible projects referenced by byProject only
  overloads: OverloadItem[]                                    // FR-1006 list for the selected people and window (M9-D10)
}
export type WorkloadCellItem =
  | { kind: 'task'; taskId: string; taskName: string; parentPath: string[]; projectId: string; projectName: string; projectColor: string
      load: LoadPair; certainty: Certainty; completed: boolean; href: string }          // `/projects/${projectId}/plan?task=${taskId}`
  | { kind: 'masked'; label: string; load: LoadPair }                                   // label = th.masking.otherProjects; no id, no count
export interface WorkloadCellDetail { userId: string; name: string; week: ISODate; cell: WorkloadCell; items: WorkloadCellItem[] }
export interface WorkloadBadgeResponse { overCount: number; from: ISODate; to: ISODate }
// ── /people (M9-D14) ──
export interface PeopleDirectoryPerson { userId: string; name: string; fullName: string; positionName: string | null; active: boolean; thisWeek: WorkloadCell }
export interface PeopleDirectoryResponse { week: ISODate; groups: { positionId: string | null; name: string; people: PeopleDirectoryPerson[] }[] }
export interface PersonHeader {
  userId: string; name: string; fullName: string; nickname: string | null; positionName: string | null
  active: boolean; deactivatedOn: ISODate | null; schedule: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, Cd>>
  isSelf: boolean; canEditLeave: boolean                      // self || manager (M5 rules)
}
export interface PersonTimeOffResponse { from: ISODate; to: ISODate; entries: import('./calendar').CalendarTimeOff[]; canEdit: boolean }
// ── FR-409 / FR-303 (M9-D19/D20) ──
export interface ProjectLoadMember { userId: string; name: string; role: 'LEAD' | 'MEMBER' | null; active: boolean; thisWeek: LoadPair; sum: LoadPair }
export interface ProjectLoadResponse { projectId: string; archived: boolean; weeks: ISODate[]; members: ProjectLoadMember[]; weekly: Record<ISODate, LoadPair>; sum: LoadPair }
export interface ClientLoadResponse { clientId: string; weeks: ISODate[]; sum: LoadPair; projects: { projectId: string; sum: LoadPair }[] }
```
- `src/lib/contracts/grid.ts` (M6/M7/M8) — **additive**:
  ```ts
  export interface GridProjectRow {                       // person context only (M9-D12)
    kind: 'project'; id: string; name: string; color: string; certainty: Certainty; canEdit: boolean
    totals: Partial<Record<PeriodKey, LoadPair>>          // this person's counted load in the project
  }
  export interface GridMaskedRow {                        // person context only; SPEC §7.4
    kind: 'masked'; userId: string; label: string         // th.masking.otherProjects
    totals: Partial<Record<PeriodKey, LoadPair>>          // Σ hidden projects (W: and, for expanded weeks, D: keys); no ids/counts
  }
  export type GridRow = GridTaskRow | GridAssigneeRow | GridProjectRow | GridMaskedRow
  // GridTaskRow gains (person context; absent in project context):
  //   projectId?: string; breadcrumb?: string[]          // parent names root → parent (M9-D12)
  export type GridContextInfo =
    | { kind: 'project'; id: string; name: string; archived: boolean; canEdit: boolean; canManage: boolean }   // M6 shape + M8-D8 canManage, unchanged
    | { kind: 'person'; id: string; name: string; active: boolean; deactivatedOn: ISODate | null; canEdit: boolean; canManage: false }   // ◆ read-only here (M9-D29)
  // GridResponse.context: GridContextInfo
  ```
  Widening the union and `context` may break exhaustive narrowing in M6/M7/M8 code. Run `pnpm typecheck`; in each flagged file (expected: `src/lib/grid/{rows,merge,aggregate,cache-ops,day-footer}.ts`, `src/server/services/grid.ts`, `src/components/grid/*.tsx`) add the **minimal** guard (`if (row.kind === 'project' || row.kind === 'masked') continue` / `context.kind === 'project' && context.archived`) with no behaviour change, and list the files in the S0 report (S3/S2 own them afterwards).
- `src/lib/contracts/tasks.ts` (M3) — add, keeping `MyTasksResponse` until G2 (the integrator deletes it once nothing imports it):
  ```ts
  export type MyBucketKey = 'THIS_WEEK' | 'NEXT_WEEK' | 'LATER' | 'UNPLANNED'
  export interface MyBucketTask extends MyTaskDTO {
    project: { id: string; name: string; color: string; certainty: Certainty }
    firstWeek: ISODate | null; plannedCd: Cd | null       // my cd in firstWeek (M9-D17); null when UNPLANNED
  }
  export interface MyTaskBucketsResponse { today: ISODate; buckets: { key: MyBucketKey; tasks: MyBucketTask[] }[]; count: number }   // 4 buckets always, in key order; count = THIS_WEEK length
  ```
- `src/lib/contracts/time-off.ts` (M5) — additive:
  ```ts
  export interface OverloadImpactLine {
    week: ISODate
    before: { level: OverloadLevel; excessCd: Cd }
    after: { level: 'RISK' | 'OVER'; excessCd: Cd; cause: OverloadCause }
    load: LoadPair; capacityCd: Cd; standardCd: Cd
    parts: { projectId: string | null; name: string; load: LoadPair }[]   // name = project name | th.masking.otherProjects
    href: string                                                         // `/people/${userId}/plan?week=${week}`
  }
  export interface TimeOffImpact { userId: string; userName: string; weeks: CapacityImpactWeek[]
    overloads: OverloadImpactLine[]                     // M9-D18; [] when nothing worsened
    onTimeOffDays: { date: ISODate; cd: Cd }[] }       // M7-D15 line; [] when no DAY rows on the new dates
  ```
  S0 makes `services/time-off.ts` (M5) return `overloads: [], onTimeOffDays: []` so it typechecks, and updates exactly these M5 tests (C36; additions only, never weaken an assertion):
  - `src/components/calendar/ImpactPanel.test.tsx` — every `TimeOffImpact` fixture literal gains `overloads: [], onTimeOffDays: []` (the 3 M5 cases: one changed week, the no-change week, the two-week move); their expected texts are unchanged.
  - `src/components/calendar/LeaveDialog.test.tsx` — the mocked `createTimeOff`/`updateTimeOff` results (`TimeOffSaveResult.impact`) gain the two empty arrays.
  - `src/server/services/time-off.int.test.ts › create › own leave / manager for another / weekend-holiday allowed` and `› update › move` assert `impact.weeks` only → no change; if one of them `toEqual`s the whole `impact`, S2.9 (which owns the file afterwards) adds the computed `overloads`/`onTimeOffDays` for that case (e.g. Peter 10-05..06 on F1 → the OVER +200 line).
  - any shared builder in `tests/helpers/**` that returns a `TimeOffImpact` (S0.1 inventory) gains the two empty arrays.
  E2E m5 E1/E5 are handled in S6.3.
- `src/lib/contracts/sidebar.ts` (M2/M3): `myTaskCount` keeps its name; its meaning changes in S2.8 (M9-D17).
- Done-check: `pnpm typecheck`.

**S0.4 Zod (`src/lib/schemas/workload.ts`, new; `src/lib/schemas/grid.ts` reused).**
```ts
import { z } from '@/lib/z'; import { th } from '@/i18n/th'
import { isoWeekday, compareISO, diffDays } from '@/domain/dates'
import { zUserId } from '@/lib/schemas/tasks'                                     // M3
const zMonday = z.iso.date().refine((d) => isoWeekday(d) === 1, { error: th.grid.errors.weekNotMonday })
const zFlag = z.enum(['0', '1']).default('0').transform((v) => v === '1')
export const workloadQuerySchema = z.object({
  from: zMonday.optional(), to: zMonday.optional(),                                // both or neither; default [weekStart(today), +12 w) (route)
  positionId: z.uuid().optional(), projectId: z.uuid().optional(), onlyOver: zFlag,
}).superRefine((q, ctx) => {
  if ((q.from === undefined) !== (q.to === undefined)) ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
  if (q.from && q.to && (compareISO(q.to, q.from) <= 0 || diffDays(q.from, q.to) > 53 * 7))
    ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
})
export type WorkloadQuery = z.output<typeof workloadQuerySchema>
export const workloadCellQuerySchema = z.object({ userId: zUserId, week: zMonday })
export const personTimeOffQuerySchema = z.object({})                               // fixed window (M9-D16)
```
Person grid reuses M6/M7 `gridQuerySchema` unchanged (`includeOthers` accepted and ignored in the person context). Tests first `src/lib/schemas/workload.test.ts` (`unit`): no params → `{ onlyOver: false }`; `from=2026-09-28&to=2026-12-21` ok; `from=2026-09-29&to=2026-12-21` → `weekNotMonday`; only `from` → `badRange`; `to = from` → `badRange`; 54 weeks (`2026-01-05`→`2027-01-11`) → `badRange`; `projectId=x` → error; `onlyOver=1` → `true`, `=yes` → error; cell `{ userId: 'u', week: '2026-10-05' }` ok, `week '2026-10-06'` → error.

**S0.5 Authz signature (`src/server/authz.ts`).** One helper (PLAN §3.4.4 rule "every permission decision here"):
```ts
/** 404 unless canSeeUserDetails(viewer, userId) — also for unknown/malformed ids (X41). Returns the visibility sets for reuse. */
export async function requireVisibleUser(tx: DbOrTx, viewer: SessionUser, userId: string):
  Promise<{ visibleUsers: 'ALL' | Set<string>; visibleProjects: 'ALL' | Set<string> }> { throw new Error('NOT_IMPLEMENTED: requireVisibleUser (M9 S2)') }
```

**S0.6 Stubs (exact signatures; bodies `throw new Error('NOT_IMPLEMENTED: <name> (M9 S2)')`).**
- `src/server/repo/allocations.ts` (M6):
  ```ts
  /** §6.5 grouped by (user, project, week) — M9-D27. BR-44 + BR-50 + coalesce certainty; integer cd. */
  export async function loadByUserProjectWeek(tx: DbOrTx, o: { userIds: readonly string[]; range: WeekRange; projectIds?: readonly string[] }):
    Promise<Map<string /*userId*/, Map<string /*projectId*/, Record<ISODate, LoadPair>>>>
  /** Σ DAY rows per date of one user on [from, toInclusive] (FR-906 onTimeOffDays), bounded by week_start. */
  export async function sumDayRowsByDate(tx: DbOrTx, userId: string, from: ISODate, toInclusive: ISODate): Promise<{ date: ISODate; cd: Cd }[]>
  ```
- `src/server/services/workload.ts` (new):
  ```ts
  export interface WorkloadWindow { from: ISODate; to: ISODate }   // Mondays, `to` exclusive
  export interface BuildTableOpts { window: WorkloadWindow; positionId?: string | null; projectId?: string | null; onlyOver?: boolean
    userIds?: readonly string[] }                    // M10 embed: restrict to a project's members (still ∩ visible ∩ M9-D3 population)
  /** Signature pinned for M10 (S1.6/S1.10, M10-D11/D18) and M11 (DM-02): buildTable(tx, viewer, { window, userIds?, positionId?, projectId?, onlyOver? }, today). */
  export async function buildTable(tx: DbOrTx, viewer: SessionUser, o: BuildTableOpts, today: ISODate): Promise<WorkloadResponse>
  export async function cellDetail(tx: DbOrTx, viewer: SessionUser, q: { userId: string; week: ISODate }, today: ISODate): Promise<WorkloadCellDetail>
  export async function badgeCount(tx: DbOrTx, viewer: SessionUser, today: ISODate): Promise<WorkloadBadgeResponse>
  /** M10 home "ภาระของฉัน": requireVisibleUser (404) → one user's cells over `window` (≤ 53 weeks, Mondays, `to` exclusive).
   *  NO population filter (M9-D3 applies to the table only), so a viewer's own cells exist even without memberships. Same assembleCells/masking as buildTable. */
  export async function personCells(tx: DbOrTx, viewer: SessionUser, userId: string, window: WorkloadWindow): Promise<Record<ISODate, WorkloadCell>>
  export async function overloadImpact(tx: DbOrTx, viewer: SessionUser, userId: string, weeks: readonly ISODate[],
    before: ReadonlyMap<ISODate, { capacityCd: Cd; standardCd: Cd }>, after: ReadonlyMap<ISODate, { capacityCd: Cd; standardCd: Cd }>): Promise<OverloadImpactLine[]>
  export async function projectLoad(tx: DbOrTx, viewer: SessionUser, projectId: string, today: ISODate): Promise<ProjectLoadResponse>
  export async function clientLoad(tx: DbOrTx, viewer: SessionUser, clientId: string, today: ISODate): Promise<ClientLoadResponse>
  /** Pure assembly (unit-tested in workload-assemble.test.ts): loads + capacity + visibility → cells. */
  export function assembleCells(input: AssembleInput): Map<string, Record<ISODate, WorkloadCell>>
  export interface AssembleInput { weeks: readonly ISODate[]; userIds: readonly string[]
    loads: Map<string, Map<string, Record<ISODate, LoadPair>>>; capacity: Map<string, UserCapacity>; visibleProjects: 'ALL' | ReadonlySet<string> }
  ```
- `src/server/services/people.ts` (M2 file; add): `listPeopleDirectory(tx, viewer, today): Promise<PeopleDirectoryResponse>`, `getPersonHeader(tx, viewer, userId): Promise<PersonHeader>`, `listPersonTimeOff(tx, viewer, userId, today): Promise<PersonTimeOffResponse>`.
- `src/server/services/masking.ts` (M2/M5; add):
  ```ts
  /** M9-D8: visible parts (non-zero, sorted by name) + one null part for everything hidden. */
  export function maskProjectParts(parts: ReadonlyMap<string, LoadPair>, visible: Visible, names: ReadonlyMap<string, string>): WorkloadProjectPart[]
  /** SPEC §7.4 masked row; null when every period is 0. */
  export function maskedGridRow(userId: string, totals: Partial<Record<PeriodKey, LoadPair>>): GridMaskedRow | null
  /** FR-1005: visible task items + one masked aggregate item. */
  export function maskCellItems(items: readonly (WorkloadCellItem & { kind: 'task' })[], hidden: LoadPair): WorkloadCellItem[]
  ```
- `src/server/services/my-tasks.ts` (M3; add): `listMyTaskBuckets(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<MyTaskBucketsResponse>` and change nothing else yet (S2.8 rewires `countMyOpenTasks` and the route).
- `src/server/services/grid.ts` (M6/M7): widen `buildChunk(tx, user, ctx: GridCtx, p, today)`; the `person` branch calls a stub `buildPersonChunk(tx, user, userId, p, today): Promise<GridResponse>`.
- `src/server/services/index.ts`: `export * as workload from './workload'` (PLAN: `services.workload.*`).
- Routes (`route(handler, { query })` from M1; JSON bodies typed):
  | File | Method | Query schema | Returns |
  |---|---|---|---|
  | `src/app/api/workload/route.ts` | GET | `workloadQuerySchema` | `WorkloadResponse` |
  | `src/app/api/workload/cell/route.ts` | GET | `workloadCellQuerySchema` | `WorkloadCellDetail` |
  | `src/app/api/workload/badge/route.ts` | GET | — | `WorkloadBadgeResponse` |
  | `src/app/api/grid/person/[userId]/route.ts` | GET | `gridQuerySchema` | `GridResponse` |
  | `src/app/api/people/route.ts` | GET | — | `PeopleDirectoryResponse` |
  | `src/app/api/people/[userId]/time-off/route.ts` | GET | `personTimeOffQuerySchema` | `PersonTimeOffResponse` |
  | `src/app/api/projects/[id]/load/route.ts` | GET | — | `ProjectLoadResponse` |
  | `src/app/api/clients/[id]/load/route.ts` | GET | — | `ClientLoadResponse` |
  (`/api/people/route.ts` coexists with M2's `/api/people/options/route.ts`; the static segment wins over `[userId]`.)
- Done-check: `pnpm typecheck`.

**S0.7 Query keys + invalidation (`src/lib/query-keys.ts`, `src/lib/invalidate.ts`, M9-D17/D22).**
```ts
// query-keys.ts — PLAN §3.5 keys kept; WorkloadParams from contracts/workload
workload: (p: WorkloadParams) => ['workload', 'table', p] as const,
workloadCell: (userId: string, week: ISODate) => ['workload', 'cell', userId, week] as const,
workloadBadge: () => ['workload', 'badge'] as const,
peopleDirectory: () => ['workload', 'people'] as const,
projectLoad: (projectId: string) => ['workload', 'project', projectId] as const,
clientLoad: (clientId: string) => ['workload', 'client', clientId] as const,
personTimeOff: (userId: string) => ['calendar', 'person', userId] as const,
```
`invalidateLoad(qc)` additionally invalidates `qk.sidebar()` (M9-D17). Extend `src/lib/invalidate.test.ts`: after `invalidateLoad` → `['workload','badge']`, `['workload','project','p']`, `['workload','people']`, `['grid','person','u',{…}]`, `['sidebar']` are invalidated; `['calendar','person','u']` is not; after `invalidateCalendar` it is.

**S0.8 i18n (`src/i18n/th.ts`).** Create `workload`, `people`; extend `overload` (M7), `my` (M3), `nav`. Final strings (functions for parameters, PLAN §3.7):
```ts
nav: { /* … */ workload: 'Workload ทีม', people: 'ทีมงาน' },
workload: {
  title: 'Workload ทีม',
  view: { label: 'มุมมองภาระ', ALL: 'ทั้งหมด', COMMITTED: 'แน่นอน', AT_RISK: 'ยังไม่แน่นอน' },
  tabs: { label: 'มุมมอง Workload', table: 'ตาราง', overloads: (n: number) => `รายการที่ล้น (${n})` },
  filters: { label: 'ตัวกรอง', position: 'ตำแหน่ง', allPositions: 'ทุกตำแหน่ง', project: 'โปรเจค', allProjects: 'ทุกโปรเจค',
    onlyOver: 'เฉพาะคนที่ล้น', clear: 'ล้างตัวกรอง' },
  window: { prev: 'ก่อนหน้า 4 สัปดาห์', next: 'ถัดไป 4 สัปดาห์', thisWeek: 'สัปดาห์นี้', range: (from: string, to: string) => `${from} – ${to}` },
  tableLabel: 'ตารางภาระงานรายคนรายสัปดาห์',
  personHeader: 'คน', noPosition: 'ไม่มีตำแหน่ง', deactivated: 'ปิดใช้งาน',
  empty: 'ไม่มีคนที่ตรงกับตัวกรอง', loading: 'กำลังโหลด workload…', loadError: 'โหลด workload ไม่สำเร็จ', retry: 'ลองใหม่',
  cell: {
    empty: '–', emptyLabel: 'ว่าง',
    label: (name: string, week: string, load: string, cap: string, status: string) => `${name} สัปดาห์ ${week}: ภาระ ${load} จาก ${cap} วัน${status}`,
    open: 'คลิกเพื่อดูรายการงาน',
  },
  tooltip: {
    header: (name: string, week: string) => `${name} · สัปดาห์ ${week}`,
    total: 'ภาระทั้งหมด', committed: 'แน่นอน', atRisk: 'ยังไม่แน่นอน',
    days: (v: string) => `${v} วัน`,
    capacity: (cap: string, std: string) => `Capacity ${cap} วัน (มาตรฐาน ${std})`,
    noCapacity: 'ไม่มี capacity สัปดาห์นี้', byProject: 'แยกตามโปรเจค',
  },
  panel: { title: (name: string, week: string) => `${name} · สัปดาห์ ${week}`, close: 'ปิด', loading: 'กำลังโหลดรายการงาน…',
    empty: 'ไม่มีงานในสัปดาห์นี้', openTask: (name: string) => `ไปแก้แผน ${name}`, tentative: 'อาจไม่ทำ', completed: 'เสร็จแล้ว',
    openPerson: 'ดูหน้ารายคน' },
  list: { label: 'รายการที่ล้น', person: 'คน', week: 'สัปดาห์', level: 'ระดับ', excess: 'เกิน', cause: 'สาเหตุ', fix: 'แก้',
    fixLabel: (name: string, week: string) => `แก้แผนของ ${name} สัปดาห์ ${week}`, empty: 'ไม่มีรายการที่ล้นในช่วงนี้' },
  badge: { label: (n: number) => `ล้น ${n} ช่องใน 4 สัปดาห์ข้างหน้า` },
  projectLoad: {
    heading: 'ภาระงาน 12 สัปดาห์', member: 'สมาชิก', thisWeek: 'สัปดาห์นี้', sum: 'รวม 12 สัปดาห์',
    barsLabel: 'ภาระรวมรายสัปดาห์ของโปรเจค',
    bar: (week: string, total: string, committed: string) => `สัปดาห์ ${week}: รวม ${total} วัน (แน่นอน ${committed})`,
    legendCommitted: 'แน่นอน', legendTentative: 'อาจไม่ทำ (ลายทาง)',
    archived: 'โปรเจคถูก archive แล้ว — ไม่นับภาระ', empty: 'ยังไม่มีแผนใน 12 สัปดาห์ข้างหน้า',
  },
  clientLoad: {
    total: (days: string) => `ภาระรวม 12 สัปดาห์ข้างหน้า: ${days} วัน-คน`, column: 'ภาระ 12 สัปดาห์',
    visibleOnly: 'นับเฉพาะโปรเจคที่คุณเป็นสมาชิก',
  },
},
overload: { /* M7: level, glyph, dayStatus, peopleOver */
  cause: { WORKLOAD: 'เพราะงานเยอะ', CAPACITY: 'เพราะลา/วันหยุด', BOTH: 'งานเยอะและมีลา/วันหยุด', DEACTIVATED: 'ปิดใช้งาน' },
  excess: (days: string) => `เกิน ${days} วัน`,
  weekStatus: (level: string, excess: string, cause: string) => ` — ${level} ${excess} (${cause})`,
  footerStatus: (level: string, load: string, cap: string) => `${level}: ภาระ ${load} / capacity ${cap} วัน`,
  impact: {
    heading: 'overload ที่เกิดใหม่',
    line: (week: string, level: string, excess: string, cause: string) => `สัปดาห์ ${week}: ${level} ${excess} — ${cause}`,
    worse: (week: string, level: string, before: string, after: string) => `สัปดาห์ ${week}: ${level} เพิ่มจาก ${before} เป็น ${after} วัน`,
    part: (name: string, days: string) => `${name} ${days} วัน`,
    fix: 'ไปแก้แผน',
  },
},
people: {
  title: 'ทีมงาน', directoryLabel: 'รายชื่อทีมงาน',
  columns: { name: 'ชื่อ', position: 'ตำแหน่ง', thisWeek: 'ภาระสัปดาห์นี้' },
  empty: 'ไม่มีคนที่คุณเห็นได้', loadError: 'โหลดรายชื่อไม่สำเร็จ',
  header: { position: 'ตำแหน่ง', noPosition: 'ไม่มีตำแหน่ง', schedule: 'ตารางวันทำงาน', deactivated: 'ปิดใช้งาน',
    fullName: (name: string) => `ชื่อเต็ม: ${name}` },
  schedule: { none: 'ไม่มีวันทำงาน', perDay: (days: string, fraction: string) => `${days} · ${fraction} วัน/วัน`,
    mixed: (parts: string) => parts, part: (day: string, fraction: string) => `${day} ${fraction}` },
  tabs: { label: 'แท็บหน้ารายคน', plan: 'แผนงาน', tasks: 'งาน', leave: 'วันลา' },
  grid: { label: (name: string) => `แผนงานของ ${name}`, footerLoad: 'ภาระรวม (ทุกโปรเจค)', maskedHint: 'ภาระจากโปรเจคที่คุณไม่ได้เป็นสมาชิก',
    openTask: (name: string) => `เปิด ${name} ในแผนงานโปรเจค`, empty: 'ยังไม่มีแผนในช่วงนี้', focusWeek: 'สัปดาห์ที่เลือกจากรายการที่ล้น' },
  tasks: { hiddenHint: 'แสดงเฉพาะงานในโปรเจคที่คุณเห็นได้', empty: 'ไม่มีงานที่มอบหมาย' },
  leave: { heading: 'วันลา', upcoming: 'ที่กำลังจะถึง', past: 'ที่ผ่านมา', empty: 'ไม่มีวันลาในช่วงนี้', add: 'แจ้งลา',
    edit: (range: string) => `แก้วันลา ${range}`, loadError: 'โหลดวันลาไม่สำเร็จ' },
},
my: { /* M3: title, empty, due, inParent, countLabel */
  buckets: { THIS_WEEK: 'สัปดาห์นี้', NEXT_WEEK: 'สัปดาห์หน้า', LATER: 'หลังจากนั้น', UNPLANNED: 'ยังไม่วางแผน' },
  planned: (days: string) => `${days} วัน`, fromWeek: (week: string) => `เริ่มสัปดาห์ ${week}`, emptyBucket: 'ไม่มีงาน',
  view: { label: 'มุมมองงานของฉัน', weeks: 'ตามสัปดาห์', list: 'ลิสต์', board: 'บอร์ด' },
},
```
Rules: no Thai outside this file (ESLint); tests import `th`. The masked label reuses `th.masking.otherProjects` (M2) and the leave label `th.masking.leave` (M5).

**S0.9 Nav entries (`src/components/shell/nav.ts`, X33, M3-D40, M4-D27, C57).** M3 already defines `NavIcon` keys `'my' | 'teamTasks'`, `export type NavBadge = 'myTaskCount'`, `NavItem.badge?: NavBadge`, and the items `{ id: 'my', …, badge: 'myTaskCount' }` and `{ id: 'tasks', href: '/tasks', label: th.nav.teamTasks, icon: 'teamTasks' }`. M9:
- widens the union to `export type NavBadge = 'myTaskCount' | 'workloadOver'` (the only change to M3's type);
- extends `NavIcon` with `'workload' | 'people'`;
- inserts `{ id: 'workload', href: '/workload', label: th.nav.workload, icon: 'workload', badge: 'workloadOver' }` directly **after** the item with `id: 'tasks'` (งานของทีม);
- inserts `{ id: 'people', href: '/people', label: th.nav.people, icon: 'people' }` in `BOTTOM_NAV` directly **before** `id: 'clients'` (M2).
- After the edit `PRIMARY_NAV.map((i) => i.id)` must equal `['home', 'my', 'tasks', 'workload', 'calendar']` (SPEC §8.1, X84): M5 appended `calendar` after `tasks`, so inserting `workload` directly after `tasks` (= before `calendar`) yields it without any reorder; `BOTTOM_NAV.map((i) => i.id)` = `['people', 'clients', 'settings']`.
- Extend M0's `nav.test.ts` (or create `src/components/shell/nav.test.ts`): the id order above; the bottom group contains `people` immediately before `clients`; exactly one item has `badge: 'workloadOver'`.
`Sidebar.tsx`'s `NAV_ICONS` entries `workload: InsertChartOutlined`, `people: GroupsOutlined` (`NavIcon` stays a string key; `@mui/icons-material/*` path imports) and the `'workloadOver'` badge branch are added by S4.6 (S4 owns `src/components/shell/**`); since `NAV_ICONS` is typed `Record<NavIcon, …>`, S0 adds the two map entries now so typecheck stays green (no behaviour).

**S0.10 Seed builder (`scripts/lib/fixtures.ts`, M9-D23).**
```ts
/** NFR-03 smoke + M11 seed:perf (C69). Composes AFTER seedGolden in the caller's transaction (`db` may be a Tx; it never opens
 *  its own transaction and never truncates). Inserts with plain Drizzle (X59):
 *  - `people` workers: `user` rows (role worker, `email = perf-${pad2(i)}@example.com`, i = 1…people, padStart(2,'0') — unique next to
 *    the golden addresses; `name`/`nickname` = `Perf ${pad2(i)}`), no credential account (they never log in), Mon–Fri `work_schedules`
 *    rows `fraction '1.00'` (otherwise capacity is 0); `position_id` round-robin over the EXISTING positions from seedGolden
 *    (`ORDER BY position, id`; throws `Error('addSyntheticWorkload: run seedGolden first')` when there is none) — no new position;
 *  - `projects` projects `Perf workload ${pad2(j)}` (CONFIRMED, `client_id` null), each with M3's default status set (`ensureProjectStatuses`, X70);
 *  - worker i is a member of projects (i mod P) and ((i + 1) mod P); the first member added to a project is its LEAD, the others MEMBER;
 *  - one leaf task per (worker, project) with the project's default `status_id`, one assignment, and one WEEK allocation per week of
 *    [from, from + weeks): cd = 100 + 100 · ((i + w) mod 3) (100–300; integer cd → `cdToNumeric`).
 *  No audit rows (synthetic data, not user operations — X92, M11-D11) and no charter pages (plain Drizzle, not `createProject`; M11's
 *  `addPerfBulk` runs `ensureProjectCharters` afterwards, C100). `from` must be a Monday (RangeError otherwise). */
export async function addSyntheticWorkload(db: DbOrTx, o: { people: number; projects: number; weeks: number; from: ISODate }):
  Promise<{ userIds: string[]; projectIds: string[] }>
```
Test first `scripts/lib/fixtures.int.test.ts › addSyntheticWorkload` (after `truncateAll` + `seedGolden`, inside one transaction like M11's `seedPerf`): `{ people: 95, projects: 20, weeks: 12, from: '2026-09-28' }` → +95 users with e-mails `perf-01@example.com … perf-95@example.com` (no collision with golden ones), every one with a golden `position_id` and 5 schedule rows; +20 projects; 190 tasks each with a non-null `status_id`; 190 assignments; 2 280 allocation rows, all WEEK with `week_start` in `[2026-09-28, 2026-12-21)`; `audit_log` count unchanged; positions count unchanged (the "100 people on `/workload`" assertion lives in S2.12, because `buildTable` is a stub at G0). `{ people: 100, … }` on a fresh `seedGolden` also works (e-mails up to `perf-100@example.com`). Without `seedGolden` → throws the "run seedGolden first" error. `from: '2026-09-29'` → `RangeError`.

**S0.11 Test helpers (`tests/helpers/**`, PLAN §4.3).** No new world part: M9 tests use `createWorld({ with: ['allocations'] })` (M6: `w.assignments.pCoworker` WEEK 2026-10-05 = 100 on P, `w.assignments.qTaskCoworker` WEEK 2026-10-05 = 300 on Q, `pLeafLead`, `pDoneMember`, archived `aTaskMember`). Add to `factories.ts` (plain Drizzle, X59): `deactivateUser(user, on: ISODate)` (sets `banned = true`, `deactivated_on`) if M1 has no equivalent. Add `tests/helpers/json.ts`: `allNumbersInteger(body: unknown): boolean` (walks every number, BR-03) and `containsAny(body: unknown, needles: readonly string[]): string[]` (returns the needles found in `JSON.stringify(body)`). `outcomeOf` already maps 404/400.

**S0.12 e2e fixture helpers (`e2e/fixtures.ts`).** M1's `resetDb(fixture?: FixtureId, opts: ResetDbOptions = {})` (options always in the 2nd slot; it already empties `UPLOAD_DIR`) — `ResetDbOptions` gains `alsoFixtures?: FixtureId[]` (each `applyFixture` runs its own setup in the same transaction, M9-D26) and `syntheticWorkload?: boolean`; add `userIdByNickname(nick: 'Manager' | 'Cindy' | 'Ivy' | 'Peter' | 'Jack' | 'Mint'): Promise<string>` (DB lookup from the Playwright process).

**S0.13 G0.** `pnpm check` green; `pnpm db:generate` → "No schema changes"; report the S0.1 name map, the S0.3 compile-guard files and any sibling name that differs from this plan.

### 5.S1 — Domain overload causes/excess/view tones + pure workload and my-task helpers (domain-engineer · owns `src/domain/overload*.ts`, `src/lib/workload/**`, `src/lib/my/**`)

Test-first for every function (CLAUDE.md, PLAN §4.1); integers only (cd); ISO strings only, no `Date`; `src/domain/**` imports only `src/domain/**`; `src/lib/workload/**` and `src/lib/my/**` may import `src/domain/**`, `src/lib/contracts/**` and `src/i18n/th.ts` (isomorphic, PLAN §3.1). New tests go to `src/domain/overload.m9.test.ts` so M7's `overload.test.ts` stays untouched. Coverage gate `src/domain/**` ≥ 95 %.

**S1.1 BR-41 + excess + status (`src/domain/overload.ts`, extend M7's file).**
```ts
import type { Cd, LoadPair, LoadView, OverloadCause, OverloadStatus } from './types'
export type { OverloadCause, OverloadStatus }
// M7 (unchanged): OverloadLevel, overloadLevel(load, capCd), LoadTone, loadTone(loadCd, capCd), worstLevel(levels)
/** BR-41: lost = standard − cap; lost > 0 && total > standard → BOTH; lost > 0 → CAPACITY; else WORKLOAD. */
export function overloadCause(totalCd: Cd, capCd: Cd, standardCd: Cd): OverloadCause
/** X67: OVER → committed − cap; RISK → total − cap; OK → 0. */
export function overloadExcess(level: OverloadLevel, load: LoadPair, capCd: Cd): Cd
/** level (BR-40, M7) + excess + cause (null when OK). */
export function overloadStatus(load: LoadPair, capCd: Cd, standardCd: Cd): OverloadStatus
export function levelRank(level: OverloadLevel): 0 | 1 | 2                    // OK 0, RISK 1, OVER 2
/** FR-906 (M9-D18): rank went up, or same non-OK level with a larger excess. */
export function worsened(before: OverloadStatus, after: OverloadStatus): boolean
```
Tests first (`overload.m9.test.ts`), each row `overloadStatus({ total, committed }, cap, standard)`:

| case (source) | total | committed | cap | std | expected |
|---|---:|---:|---:|---:|---|
| F2 Jack/Mint 10-19 (golden) | 500 | 500 | 400 | 500 | OVER +100 CAPACITY |
| F3 Peter 10-05 (golden) | 500 | 500 | 300 | 500 | OVER +200 CAPACITY |
| F4 Cindy 10-12 (golden) | 250 | 0 | 200 | 500 | RISK +50 CAPACITY |
| r8 §4.8 WORKLOAD/OVER | 625 | 625 | 500 | 500 | OVER +125 WORKLOAD |
| r8 §4.8 WORKLOAD/RISK | 625 | 0 | 500 | 500 | RISK +125 WORKLOAD |
| r8 §4.8 BOTH/OVER (committed-based excess) | 625 | 500 | 400 | 500 | OVER +100 BOTH (not 225) |
| r8 §4.8 BOTH/RISK | 550 | 0 | 200 | 500 | RISK +350 BOTH |
| r8 §4.8 boundary `load = cap` | 400 | 400 | 400 | 500 | OK +0, cause null |
| r5 M9-03 | 600 | 600 | 300 | 500 | OVER +300 BOTH |
| r5 M9-03 equal not over | 500 | 500 | 500 | 500 | OK |
| r5 M9-03 non-working | 100 | 100 | 0 | 0 | OVER +100 WORKLOAD |
| r5 M9-03 full leave, no load | 0 | 0 | 0 | 500 | OK, cause null |
| cap 0, tentative only | 50 | 0 | 0 | 500 | RISK +50 CAPACITY |
| deactivated week (X64) | 250 | 250 | 0 | 500 | OVER +250 CAPACITY (UI relabels, M9-D7) |

`worsened`: OK → RISK true; RISK → OVER true; OVER(+100) → OVER(+200) true (F2 + Jack leave Mon 10-19); OVER(+200) → OVER(+200) false; RISK(+50) → RISK(+25) false; OVER → RISK false; OK → OK false. Properties (fast-check, `fc.assert`, integers `0 ≤ committed ≤ total ≤ 5000`, `0 ≤ cap ≤ std ≤ 700`): `excess ≥ 0`; `excess > 0 ⇔ level ≠ OK`; `level === 'OK' ⇔ cause === null`; `cause ≠ 'WORKLOAD' ⇒ cap < std`; `worsened(s, s) === false`.

**S1.2 BR-45 per view (`src/domain/overload.ts`, X67, M9-D6).**
```ts
export type TonePalette = 'load' | 'tentative'
/** ALL → loadTone(total, cap); COMMITTED → loadTone(committed, cap); AT_RISK → tentative palette: 'light' when total − committed > 0, else 'empty'
 *  (cap 0 keeps 'noCapacity' stripes in every view). loadCd = the number shown in the cell (viewLoad from certainty.ts). */
export function viewTone(load: LoadPair, capCd: Cd, view: LoadView): { tone: LoadTone; palette: TonePalette; loadCd: Cd }
```
Tests: F4 Cindy `{250, 0}` cap 200 → ALL `{ over, load, 250 }` (red although RISK, r8 G7), COMMITTED `{ empty, load, 0 }`, AT_RISK `{ light, tentative, 250 }`; F2 Cindy 10-19 `{375,0}` cap 400 → ALL `full` (yellow → green vs F1 500: `light`, r8 §4.6); `{400,400}` cap 500 → `full` (exactly 0.8); `{399,399}` cap 500 → `light`; cap 0 & load 0 → `noCapacity`; cap 0 & load 50 → `over` (ALL), COMMITTED with committed 0 → `noCapacity`; AT_RISK with cap 0 and atRisk 50 → `{ noCapacity, tentative, 50 }`. Property: palette `tentative` ⇔ view `AT_RISK`; for ALL/COMMITTED `tone === loadTone(loadCd, cap)`.

**S1.3 Pure workload helpers (`src/lib/workload/format.ts`, `src/lib/workload/tooltip.ts`).**
```ts
// format.ts
/** 1 decimal half-up via formatCd (M6), trailing ".0" removed: 500 → "5", 375 → "3.8", 250 → "2.5", 35 → "0.4"; 0 → "0". */
export function compactDays(cd: Cd): string
/** M9-D6: view load 0 → th.workload.cell.empty ('–'); else `${compactDays(load)}/${compactDays(cap)}`. */
export function workloadCellText(loadCd: Cd, capCd: Cd): string
export function twoDecimals(cd: Cd): string                         // formatCd(cd, { unit: 'DAYS', decimals: 2 }) but 0 → "0.00"
/** Visually hidden status suffix for aria: '' for OK, else th.overload.weekStatus(level label, excess text, cause text). */
export function statusSuffix(cell: Pick<WorkloadCell, 'level' | 'excess' | 'cause'>, opts: { deactivated: boolean }): string
// tooltip.ts
export interface TooltipLine { kind: 'header' | 'value' | 'capacity' | 'status' | 'part'; text: string; masked?: boolean }
export function tooltipLines(o: { name: string; week: ISODate; cell: WorkloadCell; projects: WorkloadResponse['projects']; deactivated: boolean }): TooltipLine[]
```
Tests first (`format.test.ts`, `tooltip.test.ts`): `workloadCellText(500, 400)` → `'5/4'`; `(375, 500)` → `'3.8/5'`; `(250, 400)` → `'2.5/4'`; `(0, 500)` → `'–'`; `(50, 0)` → `'0.5/0'`; `(125, 500)` → `'1.3/5'`; `compactDays(1000)` → `'10'`; tooltip for F3 Peter 10-05 (r8 §4.6 example): header `th.workload.tooltip.header('Peter', '5/10')`, values `5.00 / 5.00 / 0.00`, capacity `th.workload.tooltip.capacity('3.00', '5.00')`, status `OVER` + `th.overload.excess('2.00')` + `th.overload.cause.CAPACITY`, one part `Data Warehouse 5.00`; a cell with a null part renders `th.masking.otherProjects` with `masked: true` and no project name; `deactivated: true` replaces the cause text with `th.overload.cause.DEACTIVATED`. Week labels via `formatWeekHeader` (M6 `src/lib/format.ts`).

**S1.4 FR-1009 bucket (`src/lib/my/buckets.ts`, M9-D17).**
```ts
export const MY_BUCKETS: readonly MyBucketKey[] = ['THIS_WEEK', 'NEXT_WEEK', 'LATER', 'UNPLANNED']
/** firstWeek = earliest Monday ≥ weekStart(today) with my counted cd > 0 (null when none). */
export function bucketOf(firstWeek: ISODate | null, today: ISODate): MyBucketKey
export function sortBucketTasks<T extends { firstWeek: ISODate | null; dueDate: ISODate | null; createdAt: string; id: string }>(tasks: readonly T[]): T[]
```
Tests (today `2026-09-30`): `'2026-09-28'` → THIS_WEEK; `'2026-10-05'` → NEXT_WEEK; `'2026-10-12'` → LATER; `null` → UNPLANNED; `'2026-09-21'` (defensive: past) → UNPLANNED; year crossing today `2026-12-31` with `'2027-01-04'` → NEXT_WEEK; sort: firstWeek ↑, due date nulls last, `createdAt`, `id`.

**S1.5 Done-check.** `pnpm vitest run --project unit src/domain src/lib/workload src/lib/my --coverage` (domain ≥ 95 %) · `pnpm eslint src/domain src/lib/workload src/lib/my` · `pnpm typecheck` (own paths clean).

### 5.S2 — Workload, people, person grid, buckets, impact and load backend (backend-engineer · owns `src/server/**`, `src/app/api/**`)

Starts after S1. Integration tests live next to the code (`*.int.test.ts`), are written **first**, pin `APP_NOW=2026-09-30T10:00:00+07:00` + `ALLOW_TEST_HOOKS=1`, and use golden data (`seedGolden` + `applyFixture`) or `createWorld({ with: ['allocations'] })`. Rules for every step: authz (`src/server/authz.ts`) before touching data, invisible → 404; every route = `route(handler, { query })` → one read-only transaction `db.transaction(fn, { isolationLevel: 'repeatable read', accessMode: 'read only' })` (PLAN §3.4.5); services take `tx` and `today` (`serverToday()` in the route, X45); every `allocations` query has a `week_start` range; integer cd only; no Thai literals (`th.*` only); masking only in `services/masking.ts`; no new action, no `refresh()`.

**S2.1 Loader + masking (`repo/allocations.ts#loadByUserProjectWeek`, `services/masking.ts`, §6.5, BR-43/44/50, M9-D27, M9-D8).**
```sql
select ta.user_id, t.project_id, a.week_start,
       (coalesce(sum(a.person_days), 0) * 100)::int as total,
       (coalesce(sum(a.person_days) filter (where coalesce(t.certainty_override, p1.certainty_override,
           p2.certainty_override, pr.certainty) = 'CONFIRMED'), 0) * 100)::int as committed
from allocations a
join task_assignments ta on ta.id = a.task_assignment_id and ta.deleted_at is null
join tasks t             on t.id  = ta.task_id          and t.deleted_at  is null
left join tasks p1       on p1.id = t.parent_id
left join tasks p2       on p2.id = p1.parent_id
join projects pr         on pr.id = t.project_id and pr.deleted_at is null and pr.archived_at is null
where a.week_start >= $from and a.week_start < $to                  -- REQUIRED range (CLAUDE.md)
  and ta.user_id = any($userIds::text[])
  and ($projectIds::uuid[] is null or t.project_id = any($projectIds))
  and (t.completed_week is null or a.week_start <= t.completed_week) -- BR-50
group by ta.user_id, t.project_id, a.week_start
```
`sumDayRowsByDate(tx, userId, from, toInclusive)`: `select a.period_start, (sum(a.person_days)*100)::int … where a.granularity = 'DAY' and a.week_start >= weekStart(from) and a.week_start <= weekStart(toInclusive) and a.period_start between $from and $to and ta.user_id = $1` (+ the same live/archived joins). `masking.ts` bodies: `maskProjectParts` (visible parts with total > 0 sorted by `compareThai(name)`, then one `{ projectId: null, total, committed }` part when Σ hidden > 0; never a count), `maskedGridRow` (`label: th.masking.otherProjects`, keys with zero totals omitted, `null` if all zero), `maskCellItems`.
Tests first:
- `src/server/repo/allocations.int.test.ts › loadByUserProjectWeek` (golden F1): Mint week 2026-10-05 → `{ Mobile: { total 500, committed 500 } }`; Mint 2026-12-14 → `{ POS: { 500, 0 } }` (Rollout TENTATIVE); Cindy 2026-10-05 → `{ CRM: { 250, 0 } }`; Σ over all users/projects/weeks of `[2026-08-31, 2027-01-04)` = 19 500 / 11 625; archive CRM → Cindy's CRM entries disappear (BR-44); complete Ivy's "ตั้งค่า automation" via M3 `setStatus` on 2026-09-30 → its weeks after 2026-09-28 disappear (BR-50); a task moved to "รอข้อมูล" keeps its load (FR-628/BR-87); a task without assignees contributes nothing (BR-43); `projectIds` filter restricts.
- `src/server/services/masking.int.test.ts › M9`: parts `{P: {100,100}, Q: {300,300}}`, visible `{P}` → `[{ projectId: P, 100, 100 }, { projectId: null, 300, 300 }]`; `JSON.stringify` contains no `Q`; visible `'ALL'` → no null part; zero parts dropped; `maskedGridRow('u', { 'W:2026-10-05': { total: 0, committed: 0 } })` → `null`.
- Guard: M6's `allocations-import-guard.test.ts` still green (only `repo/allocations.ts` imports the table).

**S2.2 Workload table (`services/workload.ts#buildTable`, `assembleCells`, FR-1001…1004/1006, X67, M9-D2…D10).**
```ts
export async function buildTable(tx, viewer, o, today) {
  const visibleUsers = await authz.visibleUserIds(tx, viewer)                    // totals (§3.3) — before any load query
  const visibleProjects = await authz.visibleProjectIds(tx, viewer)            // details
  if (o.projectId) await authz.requireProject(tx, viewer, o.projectId, 'view')  // invisible → 404 (M9-D5)
  const weeks = weekRange(o.window.from, o.window.to)
  const candidates = await repo.workload.listCandidates(tx, { visibleUsers, userIds: o.userIds ?? null, positionId: o.positionId ?? null })
  //   id, displayName, positionId, banned, deactivatedOn, isActiveMember (member of ≥ 1 non-archived, non-deleted project)
  const loads = await repo.allocations.loadByUserProjectWeek(tx, { userIds: candidates.map((c) => c.id), range: o.window })
  const people = candidates.filter((c) => (c.active && c.isActiveMember) || hasLoad(loads.get(c.id)))   // M9-D3
  const selected = o.projectId ? people.filter((p) => isMemberOf(p, o.projectId!) || hasProjectLoad(loads.get(p.id), o.projectId!)) : people
  const capacity = await capacityService.loadCapacity(tx, selected.map((p) => p.id), o.window)          // M5: weeks[ws] = { capacityCd, standardCd }
  const cells = assembleCells({ weeks, userIds: selected.map((p) => p.id), loads, capacity, visibleProjects })
  const finalPeople = o.onlyOver ? selected.filter((p) => weeks.some((w) => cells.get(p.id)![w]!.level !== 'OK')) : selected
  return { from: o.window.from, to: o.window.to, today, weeks, groups: groupByPosition(finalPeople, positions, cells),
    positions, projects: visibleProjectDict(cells, visibleProjects), overloads: overloadItems(finalPeople, cells) }
}
```
- `repo/workload.ts` (new, S2 owns): `listCandidates` (`"user"` left join `positions`; `visibleUsers === 'ALL'` → no id filter; `userIds: null` → no extra restriction, `userIds: []` → **nobody** (returns `[]` without a query — M10's embed of a project without members relies on it, C92); `isActiveMember` via `exists (select 1 from project_members pm join projects p on p.id = pm.project_id and p.archived_at is null and p.deleted_at is null where pm.user_id = u.id)`; `memberProjectIds` array for the project filter), `listPositions` (`ORDER BY position, id`).
- `assembleCells` (pure): per user × week: `total/committed` = Σ parts; `capacity/standard` = `capacity.get(u).weeks[w]` (0/0 if missing); `{ level, excessCd, cause } = overloadStatus(...)` (S1); `byProject = maskProjectParts(...)` (S2.1). `overloadItems`: every non-OK cell, sorted week ↑, OVER before RISK, `compareThai(name)`; `href = '/people/' + userId + '/plan?week=' + week`.
- Route `GET /api/workload`: parse (400 first) → default window `{ from: weekStart(today), to: addWeeks(weekStart(today), 12) }` → `buildTable` → JSON (`Cache-Control: private, no-store` from `route()`).
- Tests first `src/server/services/workload.int.test.ts` (golden unless noted; viewer manager unless noted):
  - `› population/groups` — F1 default window → groups `[Project Manager: Cindy] [Developer: Mint] [Designer: Jack] [QA: Ivy] [Data: Peter]` in `positions` order; Manager absent; `weeks` = 12 Mondays `2026-09-28 … 2026-12-14`; every person has 12 cells; Ivy 2026-10-05 `{ total 125, committed 125, capacity 500, standard 500, level OK, excess 0, cause null }`.
  - `› deactivated` — deactivate Ivy on 2026-10-01 via M1 service → Ivy still listed (load > 0), week 2026-10-05 `{ capacity 0, level OVER, excess 125 }`; a deactivated user without load in the window and without memberships is absent.
  - `› viewer Ivy` — groups contain only Cindy, Ivy, Mint (r8 §4.3); Mint 2026-10-05 `byProject = [{ projectId: null, total: 500, committed: 500 }]`; `JSON.stringify(res)` contains neither `'Mobile App Revamp'` nor `'พัฒนา front-end'` nor the Mobile project id; `projects` has only POS and CRM entries that appear.
  - `› filters` — `positionId` = Data → only Peter; `projectId` = Mobile → Jack, Mint; `projectId` = DW as Ivy → `NotFoundError`; F2+F3 `onlyOver` → Jack, Mint, Peter; F1 `onlyOver` → `groups: []`.
  - `› overloads` — F2 + F3 (both setups) over the default window → exactly `[Peter 2026-10-05 OVER 200 CAPACITY (500/500/300), Jack 2026-10-19 OVER 100 CAPACITY (500/500/400), Mint 2026-10-19 OVER 100 CAPACITY]` in that order with `href`s; F4 → `[Cindy 2026-10-12 RISK 50 CAPACITY (250/0/200)]`.
  - `› FR-405` — set CRM certainty CONFIRMED (M2 service) → Cindy 2026-10-05 committed 0 → 250.
  - `› WAITING` / `› milestones no load` (BR-87/BR-72) — move "ย้ายข้อมูลลูกค้า" to "ติดปัญหา" and add an M8 milestone on CRM 2026-10-14 → cells unchanged.
  - `› integers` — `allNumbersInteger(res)` (BR-03).
  - `› route` — `GET /api/workload?from=2026-09-29&to=2026-12-21` → 400; without session → 401; body equals the service result.
  - `› userIds` (M10 embed) — `{ window, userIds: [Cindy, Manager] }` as manager → only Cindy (Manager outside the M9-D3 population); as Ivy with `userIds: [Jack, Mint]` → only Mint (Jack invisible), Mint's Mobile part masked; `userIds: []` → `groups: []` (nobody, C92), while omitting `userIds` returns the full population.
  - `› personCells` (M10 home) — Manager → own cells over `[2026-09-28, 2026-11-23)` = 8 cells `{ total 0, committed 0, capacity 500, level 'OK', byProject: [] }` (no population filter); Ivy → Mint 2026-10-05 `byProject = [{ projectId: null, 500, 500 }]`; Ivy → Jack → `NotFoundError`.

**S2.3 Cell detail (`services/workload.ts#cellDetail`, FR-1005, M9-D9).** `requireVisibleUser(viewer, userId)` (404) → assignments of that user with counted allocations in `week` (`listForWeeks` on the user's live assignments of non-archived projects, BR-50) joined with tasks (names, parent path via `p1`/`p2`), projects (name, colour), effective certainty (M3 `effectiveCertainty`) → split visible/hidden with `partitionByProject` → `maskCellItems(visibleItems, Σ hidden)`; items sorted by project name (`compareThai`), then task position; `cell` = the same `assembleCells` output for that one (user, week). Route `GET /api/workload/cell`. Tests first (`workload.int.test.ts › cell detail`): F3 manager Peter 2026-10-05 → one item `ย้าย pipeline ขึ้น BigQuery` `{ 500, 500 }` `href '/projects/<DW>/plan?task=<id>'`, `cell.level 'OVER'`; Ivy → Mint 2026-10-05 → `[{ kind: 'masked', label: th.masking.otherProjects, load: { 500, 500 } }]` and no Mobile string/id; Ivy → Jack → `NotFoundError`; world as `member` → `coworker` 2026-10-05 → P item `งานร่วม P-ลับ03` 100 + masked `{ 300, 300 }`, body without `'งาน Q-ลับ02'`, `w.Q.id`, `w.tasks.qTask.id`, `w.assignments.qTaskCoworker.id`.

**S2.4 Badge (`services/workload.ts#badgeCount`, FR-1007, M9-D11).** `buildTable(tx, viewer, { window: { from: weekStart(today), to: addWeeks(weekStart(today), 4) } }, today)` → count cells with `level === 'OVER'`. Route `GET /api/workload/badge` → `{ overCount, from, to }`. Tests first (`› badge`, r8 §4.6 table, today 2026-09-30) for viewers Manager/Cindy/Ivy/Peter/Jack/Mint: F1 `0/0/0/0/0/0`; F2 `2/2/1/2/2/2`; F3 `1/1/0/1/1/0`; F4 `0/0/0/0/0/0`; F2+F3 `3/3/1/3/3/2`; a deactivated user's remaining OVER counts (X67).

**S2.5 Person grid chunk (`services/grid.ts#buildPersonChunk`, `GET /api/grid/person/[userId]`, FR-1008, §7.4, X28/X67/X76, M9-D12).**
```ts
export async function buildPersonChunk(tx, viewer, userId, p, today): Promise<GridResponse> {
  const { visibleProjects } = await authz.requireVisibleUser(tx, viewer, userId)            // 404 first
  const person = await repo.people.getPerson(tx, userId)                                    // S2 creates (M2 repo/people.ts): name, positionName, banned, deactivatedOn; null → NotFoundError
  const mine = await repo.assignments.listActiveForUserLive(tx, userId)                     // S2 creates (C52): { id, taskId, projectId, version }[] — see below
  const { visible, hidden } = masking.partitionByProject(mine, visibleProjects)            // hidden projects are never queried for task data (R1/R2)
  const projects = await repo.projects.listByIds(tx, unique(visible.map((a) => a.projectId)))   // S2 adds if M2 lacks it: id, name, colour, certainty, archivedAt
  const access = new Map(await Promise.all(projects.map(async (pr) => [pr.id, await authz.projectAccess(tx, viewer, pr.id)] as const)))   // M2: ProjectAccess | null
  const taskTrees = new Map(await Promise.all(projects.map(async (pr) =>
    [pr.id, await repo.tasks.listLiveWithBlockerCounts(tx, pr.id)] as const)))               // M3-D39 → TaskListRow[] (completedWeek, blockersOpen/Total, live milestoneId via M8's LIVE_MILESTONE_ON)
  const weeks = periodWeeks(p)                                                             // Mondays of [from, to)
  const expandedWeeks = p.zoom === 'day' ? weeks : weeks.filter((w) => p.expand.includes(w))   // M7: zoom=day expands every week
  // expandedAndDayWeeks = expandedWeeks ∪ weeks holding DAY rows of `rows` (M7-D19: D: capacity keys also for collapsed DAY weeks) — computed after `rows`
  const rows = await repo.allocations.listForWeeks(tx, visible.map((a) => a.id), weeks)     // bounded (M6 ★)
  const tl = timelineBound(today)
  const totals = await repo.allocations.sumCountedByAssignment(tx, visible.map((a) => a.id), tl)   // rowTotal (M6-D7)
  const hiddenLoad = hidden.length ? await repo.allocations.loadByUserProjectWeek(tx, { userIds: [userId], range: { from: p.from, to: p.to },
                      projectIds: unique(hidden.map((a) => a.projectId)) }) : new Map()
  const day = await dayContext.loadDayData(tx, [userId], expandedAndDayWeeks)              // M7-D19 D: capacity/standard/timeOff
  const hiddenDays = hidden.length && expandedWeeks.length                                 // C39: M7's other-projects day aggregate, restricted to the HIDDEN ids
    ? await repo.allocations.dayLoadsForProjects(tx, { userIds: [userId], weeks: expandedWeeks, projectIds: unique(hidden.map((a) => a.projectId)) })
    : new Map()                                                                            // → Map<userId, Record<`D:${ISODate}`, LoadPair>>; WEEK rows spread per M7-D27 (committed/tentative separately), BR-44/BR-50 filters
  const cap = await capacityService.loadCapacity(tx, [userId], { from: p.from, to: p.to })  // M5
  const leave = await repo.timeOff.listSpans(tx, [userId], p.from, p.to)                   // masked below (maskTimeOff + canSeeLeaveDetails)
  const holidays = await holidaysSvc.listHolidaysInRange(tx, { from: p.from, to: p.to })
  const msRows = projects.length ? await repo.milestones.listForProjects(tx, projects.map((pr) => pr.id)) : []   // M8: id ARRAY (never 'ALL'), live milestones, archived/deleted projects dropped (not windowed, M8-D8)
  const milestones = await milestonesSvc.toDTOs(tx, msRows, today)                             // GridMilestone = MilestoneDTO (status, late, progress)
  const lateness = await milestonesSvc.computeLateness(tx, { boundTaskIds: visible.map((a) => a.taskId) })   // M8 → lateForMilestone
  return assemblePersonGrid({ person, projects, access, taskTrees, visible, rows, totals, hiddenLoad, hiddenDays, cap, day, leave, holidays, milestones, lateness, p, today, viewer })
}
```
- New repo functions S2 creates (C52 — none of them exists in M3/M2; add them to the existing files so the barrels expose them):
  ```ts
  // src/server/repo/task-assignments.ts (M3 file, barrel `repo.assignments`)
  /** Live assignments of one user on live tasks of live, non-archived projects. Leaves only (assignments live on leaves). No allocations read here. */
  export async function listActiveForUserLive(tx: DbOrTx, userId: string): Promise<{ id: string; taskId: string; projectId: string; version: number }[]>
  //   select ta.id, ta.task_id, t.project_id, ta.version from task_assignments ta
  //   join tasks t on t.id = ta.task_id and t.deleted_at is null
  //   join projects p on p.id = t.project_id and p.deleted_at is null and p.archived_at is null
  //   where ta.user_id = $1 and ta.deleted_at is null order by t.project_id, t.position, t.id
  // src/server/repo/people.ts (M2 file, barrel `repo.people`)
  export async function getPerson(tx: DbOrTx, userId: string): Promise<{ id: string; displayName: string; fullName: string; nickname: string | null
    positionName: string | null; banned: boolean; deactivatedOn: ISODate | null } | null>
  // src/server/repo/projects.ts (M2 file) — only if M2 has no equivalent (S0.1 map)
  export async function listByIds(tx: DbOrTx, ids: readonly string[]): Promise<{ id: string; name: string; color: string; certainty: Certainty; archivedAt: Date | null }[]>
  ```
  Tests (`repo/task-assignments.int.test.ts › listActiveForUserLive`, golden): Ivy → 2 rows (CRM automation, POS UAT); archive CRM → 1; soft-delete the UAT assignment → 0; an assignment on a soft-deleted task is absent.
- M7's `repo.allocations.dayLoadsForProjects(tx, { userIds, weeks, excludeProjectId?, projectIds? })` already has the `projectIds` filter (M7-D27, X85); S2 only calls it — never a second day aggregate.
- Task rows come from `TaskListRow` only; never read `tasks.milestone_id` directly — M8's `LIVE_MILESTONE_ON`/`LIVE_MILESTONE_JOIN` are the only allowed paths (M8's `milestone-join-guard.test.ts` scans `src/server/**`).
- `assemblePersonGrid` (pure, exported, unit-tested in `grid-person-assemble.test.ts`): per visible project (sorted `compareThai(name)`): `GridProjectRow { id, name, color, certainty, canEdit: access !== null && !access.archived, totals: Σ of this person's counted cells in the project }`; then per assignment in task-tree order (`position, id`, depth-first across the project's `TaskListRow` tree): `GridTaskRow` with `depth: 0`, `projectId`, `breadcrumb` (ancestor names root → parent, from the same `TaskListRow[]`), `certainty`/`certaintySource`/`certaintySourceName` (M3 `resolveCertainty`), `completed`, `completedWeek`, `blockers: { open: row.blockersOpen, total: row.blockersTotal }` (X76, counts only), `milestoneId` (= `TaskListRow.milestoneId`, live via M8) + `lateForMilestone = lateness.byTask.get(taskId) ?? false` (M8), `assigneeCount` (the task's real count), `hasChildren: false`, `totals` = **this person's** counted cells only; then the person's `GridAssigneeRow` (`editable = projectRow.canEdit`, leaves only, `rowTotal`, cells as M6/M7 incl. D: keys for expanded weeks); finally `maskedGridRow(userId, Σ hidden W: totals ∪ hiddenDays D: totals)` when non-null. `people = { [userId]: GridPerson }` (capacity/standard W: + D: keys, masked `timeOff`, no `otherProjects`). `context = { kind: 'person', id, name: displayName, active, deactivatedOn, canEdit: rows.some(editable), canManage: false }` (M9-D29). `milestones` = the M8 DTOs of the visible projects in which the person has a live assignment (only those projects are queried — hidden projects never reach `listForProjects`, MASK-6). `window.includeOthers = false`.
- Route `GET /api/grid/person/[userId]`: `gridQuerySchema` (400 first; default window −4/+12 weeks as M6); `buildChunk(tx, user, { kind: 'person', id: userId }, params, serverToday())`.
- Saves need no server change: `saveAllocations` authorises each item through `requireProject(edit)` (M6 S2.3), so a person-grid edit of a hidden-project assignment is impossible (404) and a visible one follows PERM-12.
- Tests first `src/server/services/grid-person.int.test.ts` (golden unless noted):
  - `› shape` — manager → Ivy over `[2026-09-14, 2026-11-09)`: rows `[project CRM, task "ตั้งค่า automation", assignee, project POS, task "ทำ UAT + คู่มือหน้าร้าน", assignee]` (CRM before POS by `compareThai`), no masked row; POS project row `totals['W:2026-09-28'] = { 250, 250 }`; `people` keys = `[ivy]`; `context.kind 'person'`.
  - `› masking Cindy → Peter` — rows = `[masked]` only, `totals['W:2026-09-28'] = { total: 500 }`, `'W:2026-10-05'` 500, `'W:2026-10-19'` 250 (r8 §6.4); `containsAny(body, ['Data Warehouse','ย้าย pipeline ขึ้น BigQuery','Store Analytics Dashboard','ทำ dashboard ผู้บริหาร', <DW id>, <Store id>, <their task/assignment ids>])` = `[]`.
  - `› masking Ivy → Mint` — POS project row + "Rollout สาขา" rows visible; masked `W:2026-09-28 = 250`, `W:2026-10-05 = 500`, `W:2026-11-02 = 375`; no Mobile name/id.
  - `› 404` — Ivy → Jack, Ivy → Peter, Ivy → Manager, Mint → Manager, Mint → Peter → `NotFoundError` (r8 invisible pairs); random uuid → 404.
  - `› archived` — archive CRM → Cindy's grid has no CRM project row and no masked row for it (BR-44).
  - `› day zoom` — Ivy `zoom=day` over `[2026-09-28, 2026-10-05)` → assignee D cells `50 ×5 derived` (M7) and, as Peter viewing Ivy, masked row `D:2026-09-28 … D:2026-10-02 = { 50, 50 }` (spread, no names).
  - `› milestones` (M8) — golden + `addMilestones(db)` (M8): Ivy's grid as Cindy lists exactly the `addMilestones` milestones of POS and CRM (incl. "UAT sign-off", "Go-live สาขาแรก"); Cindy → Peter lists none and the body contains none of "Pipeline พร้อมใช้งาน", "Dashboard v1 review" (r8 §4.3, M8-D23); Mint's grid as Ivy has the POS milestones but not "Design freeze"/"Beta release"; "ทำ UAT + คู่มือหน้าร้าน" task row `lateForMilestone true` (M8 A.2 binding); `context.canManage === false` even for the manager.
  - `› AC-604` — on Mobile create task "งานร่วม AC-604" (M3 service, default status), assign Jack + Mint, `planAssignmentRange` Jack 300 and Mint 200 over 2026-11-16..2026-11-20 (M6 service, apply) → `/api/grid/person/<Jack>` row `W:2026-11-16 = { cd: 300 }` and Mint's `= { cd: 200 }`; each task row's `totals` are that person's only (300 vs 200), `assigneeCount 2`.
  - `› parity` — for every golden user, Σ over rows (assignee counted cells + masked totals) per week = `buildTable` cell `total/committed` (manager and Cindy as viewers).
  - `› edits` — Cindy saves Ivy's CRM cell 2026-10-19 = 300 via `saveAllocations` (Cindy LEAD of CRM) → ok; Peter saving that assignment → 404.

**S2.6 People directory + header (`services/people.ts`, FR-1008, M9-D14).**
- `listPeopleDirectory(tx, viewer, today)`: `visibleUserIds` → users (incl. managers and deactivated), grouped like the workload (positions order, "ไม่มีตำแหน่ง" last), each with `thisWeek` = `assembleCells` for `[weekStart(today), +1 w)` (masked parts). Route `GET /api/people`.
- `getPersonHeader(tx, viewer, userId)`: `requireVisibleUser` → `{ userId, name: displayName, fullName, nickname, positionName, active, deactivatedOn, schedule: getSchedule (M1), isSelf, canEditLeave: isSelf || isManager(viewer) }` (no email).
- Tests first `src/server/services/people.int.test.ts`: as Ivy → names `Cindy, Ivy, Mint` only; as manager → 6 incl. Manager; Peter's `thisWeek.total = 500`; header Peter as Cindy → position `Data`, schedule `{1..5: 100}`, `canEditLeave false`; as Peter → `isSelf true, canEditLeave true`; Ivy → Peter → `NotFoundError`.

**S2.7 Person time off (`services/people.ts#listPersonTimeOff`, M9-D16).** `requireVisibleUser` → `repo.timeOff.listForCalendar(tx, [userId], from, to)` over `[addWeeks(weekStart(today), −52), addWeeks(weekStart(today), 53))` → `maskTimeOff(row, canSeeLeaveDetails(viewer, userId))` (M5) sorted by `startDate`; `canEdit = canSeeLeaveDetails(viewer, userId)` (self or manager; matches PERM-20/21). Route `GET /api/people/[userId]/time-off`. Tests first: F4 as Ivy → Cindy's entry `{ kind: 'masked', label: th.masking.leave, startDate: '2026-10-12', endDate: '2026-10-14' }` with exactly the masked keys; body without `'ลาพักร้อน'`; as Cindy → `kind 'full'` with the type name and `canEdit true`; Ivy → Peter → 404.

**S2.8 My-task buckets + sidebar count (`services/my-tasks.ts`, FR-1009, X22, M9-D17).**
```sql
-- my open assigned leaf tasks in non-archived projects (M3 set) + the earliest planned week from this week on
select t.id, …(M3 columns)…, min(a.week_start) filter (where a.person_days > 0) as first_week
from task_assignments ta join tasks t on … (M3 joins/filters) …
left join allocations a on a.task_assignment_id = ta.id
      and a.week_start >= $thisWeek and a.week_start < $bound              -- bound = addWeeks(thisWeek, 157)
where ta.user_id = $1 and ta.deleted_at is null and <M3 leaf + open filters>
group by t.id, …
```
`plannedCd` = my cd in `first_week` (second bounded query `week_start = any($firstWeeks)` summing per assignment). Bucket by `bucketOf` (S1.4), sorted by `sortBucketTasks`; `listMyTaskBuckets` returns 4 buckets always; `count` = THIS_WEEK length. `countMyOpenTasks` (sidebar) now returns that `count` (same query with `having`); its M3 signature `countMyOpenTasks(tx, userId)` gains the third parameter `today: ISODate` (X45), and M2's `services/sidebar.ts#getSidebar(tx, user, today)` (m02, X90) passes the `today` its route gives it (`serverToday()` in `GET /api/sidebar`; never `todayBangkok()` inside the service). `GET /api/tasks/my` returns `MyTaskBucketsResponse`; delete `listMyTasks` once S4 switched (integrator, §6). Tests first `src/server/services/my-tasks.int.test.ts` (rewrite the M3 cases on the new shape; today 2026-09-30, r8 §4.10):
- Cindy → THIS_WEEK `[ปรับปรุงระบบ POS หน้าร้าน 250]`, NEXT_WEEK `[ย้ายข้อมูลลูกค้า 250]`, LATER `[]`, UNPLANNED `[]`, `count 1`.
- Ivy → THIS_WEEK `[ทำ UAT + คู่มือหน้าร้าน 250]`, LATER `[ตั้งค่า automation firstWeek 2026-10-12 250]`.
- Peter → THIS_WEEK `[ย้าย pipeline ขึ้น BigQuery 500]`, LATER `[ทำ dashboard ผู้บริหาร 2026-11-02]`; Jack → THIS_WEEK `[ออกแบบ flow ใหม่ 375]`, LATER `[เก็บ requirement + สรุป 2026-11-09]`; Mint → THIS_WEEK `[พัฒนา front-end 250]`, LATER `[Rollout สาขา 2026-11-30]`; Manager `count 0`.
- A new assigned task without plans → UNPLANNED; a task planned only in 2026-09-14 → UNPLANNED; completing Ivy's UAT → Ivy `count 0`; archived project tasks absent; `getSidebar(ivy).myTaskCount === 1`.

**S2.9 FR-906 overload lines (`services/time-off.ts` M5 + `services/workload.ts#overloadImpact`, X23, M7-D15, M9-D18).** In `createTimeOff`/`updateTimeOff`, after the write and M5's `weekCapacityImpact`: build `before`/`after` maps `{ capacityCd, standardCd }` per affected week (`standard` from `capacityByWeek`); `impact.overloads = await workload.overloadImpact(tx, actor, userId, weeks, before, after)`; `impact.onTimeOffDays = sumDayRowsByDate(tx, userId, start, end)` (non-zero only). `overloadImpact`: one `loadByUserProjectWeek` over the affected weeks → per week `before = overloadStatus(load, before.cap, before.std)`, `after = overloadStatus(load, after.cap, after.std)` → keep `worsened(before, after)` → line with `parts` = `maskProjectParts` (names from visible projects, null → `th.masking.otherProjects`) and `href`. The actor is the person or a manager, so nothing is normally hidden; masking still runs (defence in depth). Plans are never modified (BR-42). Tests first `src/server/services/time-off.int.test.ts › overloads` (golden F1 unless noted):
- Peter creates 2026-10-05..06 (F3 setup) → `overloads = [{ week: '2026-10-05', before: { level: 'OK', excessCd: 0 }, after: { level: 'OVER', excessCd: 200, cause: 'CAPACITY' }, load: { 500, 500 }, capacityCd: 300, standardCd: 500, parts: [{ projectId: <DW>, name: 'Data Warehouse', load: { 500, 500 } }], href: '/people/<peter>/plan?week=2026-10-05' }]` (r8 §6b); allocation checksum unchanged.
- Cindy creates 2026-10-12..14 (F4) → one RISK line `+50 CAPACITY`, part CRM `{ 250, 0 }`.
- update Peter's leave 10-05..06 → 10-12..13 → one line for week 2026-10-12 (`OVER +75 CAPACITY`, load 375, cap 300); week 10-05 (improved) not listed.
- F2 + Jack leave 2026-10-19 → `before OVER +100`, `after OVER +200` → listed (excess grew).
- Ivy leave 2026-10-05 (125 load, cap 400) → `overloads []`.
- DAY rows: Ivy DAY `{2026-10-13: 100}` (M7 factory) then Ivy leave 2026-10-13 → `onTimeOffDays = [{ date: '2026-10-13', cd: 100 }]`.
- masking: `overloadImpact(tx, lead, coworker, ['2026-10-05'], …)` with cap 0 after → parts `[{ P … 100 }, { projectId: null, name: th.masking.otherProjects, load: { 300, 300 } }]`, no `'World Q'`.

**S2.10 Project + client load (`services/workload.ts#projectLoad`, `#clientLoad`, FR-409/FR-303, M9-D19/D20).**
- `projectLoad`: `requireProject(view)` (404; archived allowed) → archived → `{ archived: true, weeks, members: [], weekly: {}, sum: { 0, 0 } }`; else members = `project_members` ∪ users with load here (names, roles, active) → `loadByUserProjectWeek({ userIds, range: [weekStart(today), +12 w), projectIds: [projectId] })` → `thisWeek`, `sum`, `weekly`, `sum`. Members sorted LEAD first, then `compareThai`. Route `GET /api/projects/[id]/load`.
- `clientLoad`: `requireClient` (M2; 404) → the client's non-archived, non-deleted projects ∩ `visibleProjectIds` → `loadByUserProjectWeek` grouped per project (all users of those projects: `userIds` = members of those projects) → `sum`, `projects[]`. Route `GET /api/clients/[id]/load`.
- Tests first `src/server/services/project-load.int.test.ts` / `client-load.int.test.ts` (golden F1, today 2026-09-30, window `2026-09-28 … 2026-12-14`): POS → members Cindy (LEAD) `thisWeek { 250, 250 }`, `sum { 250, 250 }`; Ivy `thisWeek { 250 }`, `sum { 375, 375 }`; Mint `thisWeek 0`, `sum { 1125, 0 }`; `weekly['2026-09-28'] = { 500, 500 }`, `weekly['2026-10-05'] = { 125, 125 }`, `weekly['2026-12-14'] = { 500, 0 }`; `sum { 1750, 625 }`; archived A (world) → `archived: true`; outsider → 404. Client Coral: manager `sum { 3375, 2250 }` (POS 1750/625 + DW 1625/1625), Cindy `{ 1750, 625 }` with `projects = [POS]` only, Peter `{ 1625, 1625 }`; Bluebird as Cindy → 404; archive POS → manager `{ 1625, 1625 }`.

**S2.11 Masking sweep (`services/masking.ts`).** Confirm the three helpers are the only places that build masked shapes (grep `th.masking.otherProjects` in `src/server` → only `masking.ts`); add a unit-level doc comment listing every consumer (workload table/cell, person grid, impact). Leave labels stay M5's `maskTimeOff`.

**S2.12 Perf smoke (`src/server/services/workload.perf.int.test.ts`, NFR-03, M9-D23).** `truncateAll` + `seedGolden` + `addSyntheticWorkload(tx, { people: 95, projects: 20, weeks: 12, from: '2026-09-28' })` (committed before measuring) → `buildTable` as manager over the default window returns 100 people; median of 5 runs < 1 600 ms (logged with the measured value); `badgeCount` < 800 ms. Skipped when `CI_SKIP_PERF=1` (as M6's grid smoke). Not a functional gate beyond that bound.

**S2.13 Done-check.** `pnpm vitest run --project integration src/server` · `pnpm vitest run --project unit src/server` (pure assembly tests) · `pnpm eslint src/server src/app/api` · `pnpm typecheck` (own paths clean) · `grep -rn "th.masking.otherProjects" src/server | grep -v services/masking.ts` prints nothing.

### 5.S3 — PlanGrid person context (grid-engineer · owns `src/components/grid/**`, `src/lib/grid/**`)

Starts after S1, in parallel with S2/S4 (code against S0's contracts and M6/M7's existing modules). Pure helpers in `src/lib/grid/**` are **test-first** (`unit`); components get focused `ui` tests with `offsetWidth`/`offsetHeight` stubs (r4 §16); interaction is covered by S6. Dense cells stay plain `div`s with one CSS Module class and `data-*` state (PLAN §3.9); one shared tooltip; strings from `th`; `e.code` first (X49); no `localStorage`. Never rename an M6/M7 export (S0.1 map).

**S3.1 Fetch for the person context (`src/lib/grid/fetch.ts`, M6 ★).** `gridChunkUrl({ kind: 'person', id }, chunk)` → `/api/grid/person/<id>?from=…&to=…` (+ `expand`/`zoom` as M7; `includeOthers` never sent for person). `mergeChunks` unions rows by **row key** (S3.2) so a masked row present in only one chunk still appears once, with `totals` merged per period key. Tests first (`fetch.test.ts`, `merge.test.ts` additions): person URL; two chunks where only the second has a masked row → one masked row with both chunks' keys; project rows merged by id with totals unioned.

**S3.2 Row model (`src/lib/grid/rows.ts`, M6-D33 ★, M9-D12/D28).**
```ts
export type RowKey = `t:${string}` | `a:${string}` | `p:${string}` | `m:${string}`
export function rowKeyOfProject(id: string): `p:${string}`; export function rowKeyOfMasked(userId: string): `m:${string}`
export type ViewRow =
  | /* M6 kinds: task, merged, assignee */
  | { key: `p:${string}`; kind: 'project'; project: GridProjectRow; depth: 0; collapsed: boolean }
  | { key: `m:${string}`; kind: 'masked'; masked: GridMaskedRow; depth: 0 }
```
- `buildViewRows(m, o)`: project context unchanged; **person context**: for each project row → its `ViewRow` then, unless collapsed (in-memory set, keyed `p:`), each following task row **merged** with its single assignee row (`kind: 'merged'`, key `a:<taskAssignmentId>`, `depth: 1`) — regardless of `assigneeCount`; completed tasks hidden when `showCompleted` is false (M6-D12); the masked row last.
- `cellEditability`: `project`/`masked` rows → `'readOnlyRow'`; merged rows of a project whose `canEdit` is false → `'noEdit'`; everything else as M6/M7 (DAY weeks editable since M7).
- Tests first (`rows.test.ts › person`): a person fixture (Ivy: CRM + POS) → keys `[p:CRM, a:<ivyAutomation>, p:POS, a:<ivyUat>]`; a task with `assigneeCount 2` still yields one merged row; collapsing `p:POS` hides its merged row; masked row last with key `m:<userId>`; editability of `m:` and `p:` = `readOnlyRow`.

**S3.3 Aggregates for the person context (`src/lib/grid/aggregate.ts` M6 ★, `src/lib/grid/load-footer.ts` new; M9-D13).**
```ts
/** Client recompute after optimistic writes: project row totals = Σ its merged rows' counted cells (BR-50, effective certainty). */
export function projectTotals(m: GridModel, rows: readonly ViewRow[]): Map<string /*projectId*/, Partial<Record<PeriodKey, LoadPair>>>
/** Per person, per period (W: and D:): project ctx = Σ assignee cells (+ otherProjects when included, M6/M7);
 *  person ctx = Σ assignee cells + the masked row's totals. Counted per BR-50. */
export function personPeriodLoads(m: GridModel, periods: readonly GridPeriod[], o: { includeOthers: boolean }): Map<string, Partial<Record<PeriodKey, LoadPair>>>
export interface PeriodStatus { load: LoadPair; capCd: Cd; stdCd: Cd; status: OverloadStatus }
export function periodStatus(load: LoadPair | undefined, person: GridPerson, key: PeriodKey): PeriodStatus   // overloadStatus (S1)
/** Footer "ภาระรวม" cell: tone/palette = viewTone(Σ loads, Σ caps, view); glyph = worstLevel; overPeople for the tooltip. */
export function footerPeriodCell(statuses: ReadonlyMap<string, PeriodStatus>, view: LoadView):
  { tone: LoadTone; palette: TonePalette; glyph: OverloadLevel; overPeople: string[]; loadCd: Cd; capCd: Cd; single: PeriodStatus | null }
```
D: keys delegate to M7 (C38) — never two different sums for the same key:
- `src/lib/grid/day-footer.ts` (M7, S3 owns it now) — M9 uses the **additive masked-row branch** (one of the two options m07 S3.10 allows; C88) in M7's unchanged 3-argument `personDayLoads(rows, periods, o: { extra? })` (X85): a row with `kind === 'masked'` adds its `totals['D:…']` to `masked.userId`'s day loads. In the person context M9 passes **no** `extra` (the masked totals arrive through `rows`, so they are never counted twice); project contexts never contain masked rows and keep passing `extra` = `otherDayLoads(people)` when the footer switch is on, so M7's outputs and tests are unchanged. `project` rows are skipped (their totals duplicate the merged rows). `personDayStatus` and `footerDayCell` are reused as they are.
- `personPeriodLoads` = `personDayLoads(rows, periods, ctx === 'person' ? {} : { extra })` for D: keys + the W: sum (Σ assignee W: cells per BR-50, + masked W: totals in the person context, + `otherProjects` W: when included in the project context) for W: keys.
- Footer D: cells render `footerDayCell(...)` (M7); footer W: cells render `footerPeriodCell(...)` (this step). `periodStatus` for D: keys equals `personDayStatus` + `overloadStatus` (excess/cause) on the same load/cap.
`single` = the only person's status when the footer has exactly one person (person grid) so the tooltip can show excess and cause.
Tests first (`load-footer.test.ts`): person fixture F3 Peter as Cindy (masked only) → `W:2026-10-05` load `{ 500, 500 }`, cap 300, `single.status = OVER +200 CAPACITY`, tone `over`; Ivy person grid F1 `W:2026-10-05` = 125 (CRM 0 + POS 125) tone `light`; project grid F2 Mobile `W:2026-10-19` (Jack + Mint 1000 vs 800) → tone `over`, glyph OVER, `overPeople` both; view AT_RISK → palette `tentative`; masked D: keys added in day zoom — `personDayLoads(rows incl. a masked row { userId: peter, totals: { 'D:2026-10-07': { 100, 100 } } }, periods, {})` → Peter `D:2026-10-07 = { 100, 100 }` (and not 200: no `extra` in the person context); parity with M7's day footer on D: keys (same inputs → same numbers); M7's `day-footer.test.ts` stays green unchanged.

**S3.4 PlanGrid props + person mode (`PlanGrid.tsx`, `RowHeader.tsx`, `GridCell.tsx`, `grid.module.css`).**
```tsx
export interface PlanGridProps {               // M6 props kept; additions optional
  context: GridCtx; projectName: string; archived: boolean; canEdit: boolean
  onOpenTask(taskId: string, projectId?: string): void
  label?: string                              // M9: aria-label override (th.people.grid.label(name))
  focusWeek?: ISODate                         // M9-D28: scroll + data-focus-week
  initialZoom?: GridZoom                      // M7
}
```
- `context.kind === 'person'`: `role="grid"` with `aria-label={label}`; **no** "+ เพิ่มงาน…" row, no "+ คน", no ×, row Delete does nothing (M9-D28); the `N` shortcut is not registered; `includeOthers` switch hidden.
- Project row header: colour square (`aria-hidden`), project name (link to `/projects/<id>/plan`), ▸/▾ collapse button (`th.grid.row.expand/collapse`), ◐ when TENTATIVE; its week cells show the project totals read-only (days, 1 decimal) with `data-row-kind="project"`.
- Merged row header (person context): task name + muted breadcrumb `breadcrumb.join(' › ')`, `BlockerBadge` counts (X76, names only in the project's own views), tentative ◐/`*`, ↗ button `th.people.grid.openTask(name)` → `onOpenTask(taskId, projectId)`.
- Masked row header: `th.masking.otherProjects` + hint tooltip `th.people.grid.maskedHint`; cells read-only (`aria-readonly`), `data-row-kind="masked"`, test ids `cell-m:<userId>-<periodKey>`; no ↗, no tooltip names.
- Footer (person context): rows "ภาระรวม (ทุกโปรเจค)" (`th.people.grid.footerLoad`), "Capacity", "%"; test ids unchanged (`cell-footer-load-<periodKey>`, `cell-footer-capacity-…`, `cell-footer-util-…`).
- `focusWeek`: after the first chunk containing it resolves, `scrollToColumn(columnIndexOfPeriod(cols, 'W:' + focusWeek))` aligned after the name column (once); that week's header carries `data-focus-week="true"` (outline token, not colour alone: plus `aria-description={th.people.grid.focusWeek}`).
- Unit (`grid.unit`) and zoom (`grid.zoom`) work as in the project grid (M6/M7; X67 — grids only).
- Tests (`PlanGrid.person.test.tsx`, `ui`, offset stubs, mocked `fetchGridChunk` with a person fixture): renders project rows + merged rows + masked row; no "+ เพิ่มงาน…" button; masked cells `aria-readonly="true"`; footer `cell-footer-load-W:2026-10-05` text `5.0` and a 🔴 glyph with hidden text `th.overload.level.OVER`; `focusWeek="2026-10-05"` calls the scroll handle once with that column index; `aria-rowcount` = `HEADER_ROWS + viewRows.length + FOOTER_ROWS` (imported from `src/lib/grid/columns.ts`; person context has no quick-add row, so the `+ 1` of M6's formula is dropped here) — never a literal row index (C27/C64, `HEADER_ROWS` is 2 after M8).

**S3.5 Week-level footer tones + glyphs in both contexts (`Footer.tsx`, `FooterCell.tsx`, M9-D13, X06).** W: footer "ภาระรวม" cells render `data-tone`, `data-palette` **and** the number **and**, when the glyph ≠ OK, `StatusGlyph kind="over"|"risk"` (M7) + hidden `th.overload.footerStatus(levelLabel, load, cap)`; tooltip: project context → `th.overload.peopleOver(names)`; person context → `th.overload.excess(…)` + cause text (`th.overload.cause[...]`, or `DEACTIVATED` when `people[u].deactivatedOn ≤ week`, M9-D7). Tones never appear without number + glyph/text (§8.9). D: footer cells keep M7's behaviour (person context includes masked D: totals via S3.3). Tests (`Footer.week.test.tsx`): tone `over` cell shows number, 🔴 and hidden text; `noCapacity` renders stripes with the hidden `th.grid.glyph.noCapacity`; AT_RISK view uses `data-palette="tentative"`.

**S3.6 ◆ in the person context (M8 `MilestoneRow`, `src/lib/grid/milestones.ts`, FR-705, X28, M9-D29).** M8's `MilestoneRow` (`src/components/grid/MilestoneRow.tsx`) consumes `GridResponse.milestones` (`GridMilestone` = `MilestoneDTO`) through `placeMilestones`/`milestoneColumnKey` unchanged and reads **only** `model.context.canManage` (never `context.kind`; mutations take the project from `GridMilestone.projectId`, M8-D8/C40) — so with the person context's `canManage: false` it is already read-only: ◆ open M8's read-only popover (caption `th.milestones.grid.readOnly`, link to the project overview), no drag, no create on empty cells, no toolbar button. No guard change is needed; do not add a `context.kind` check. The only M9 addition: in the person context each ◆ accessible name/tooltip/popover heading is prefixed with the project name (looked up from the `p:<GridMilestone.projectId>` row of the model) via an optional `projectLabel?(projectId: string): string | null` prop that `PlanGrid` passes to `MilestoneRow` only when `context.kind === 'person'` (absent → M8 output unchanged). Save results keep applying `applyLateness(ok.lateness)` (M8-D12) via `applyServerResults` in the person chunks too. `invalidateMilestones` (M8-D22) already invalidates `['grid','person']`, so ◆ edits on a project grid reach person grids without M9 code. The ◆ row is header row 1 (`HEADER_ROWS = 2`, set by M8 in `src/lib/grid/columns.ts`; C64) — never locate rows by `aria-rowindex` or `nth()`. Test (`PlanGrid.person.test.tsx`): person fixture with milestones of two visible projects → two ◆ in the right columns with prefixed accessible names; clicking an empty ◆-row cell opens nothing; a save result with `lateness` flips the merged row's late marker without refetch.

**S3.7 Save invalidation of the other context (`src/lib/grid/save-invalidate.ts` M6 ★, M9-D22, C65).** `useSaveAllocations` is not changed: it already calls M6's `invalidateAfterGridSave(qc: QueryClient, ctx: GridCtx): void` on success. Extend that helper by **appending** calls to its list (no early return, M8's `qk.projectMilestones(ctx.id)` call for project contexts kept as is):
```ts
qc.invalidateQueries({ queryKey: ['grid', ctx.kind === 'person' ? 'project' : 'person'] })   // the OTHER grid context only
qc.invalidateQueries({ queryKey: qk.sidebar() })                                             // M9-D17: my-tasks count depends on plans
// workload/home prefixes and qk.myTasks are already in M6's list (keep them; add ['workload'] only if the S0.1 map shows it missing)
```
Never invalidate the saving context's own `qk.gridAll(ctx)` keys (patched via `setQueriesData`). Tests first (`src/lib/grid/save-invalidate.test.ts`, extend M6's/M8's): after `invalidateAfterGridSave(qc, { kind: 'person', id: 'u' })` the queries `qk.gridChunk({ kind: 'project', id: 'p' }, …)`, `qk.workloadBadge()`, `qk.sidebar()` are invalidated and `qk.gridChunk({ kind: 'person', id: 'u' }, …)` is not; for `{ kind: 'project', id: 'p' }`: `qk.gridChunk({ kind: 'person', id: 'u' }, …)` and `qk.projectMilestones('p')` (M8) are invalidated, `qk.gridChunk({ kind: 'project', id: 'p' }, …)` is not.

**S3.8 Done-check.** `pnpm vitest run --project unit src/lib/grid` · `pnpm vitest run --project ui src/components/grid` · `pnpm eslint src/components/grid src/lib/grid` · `pnpm typecheck` (own paths clean).

### 5.S4 — Workload, people, `/my`, impact and load UI (frontend-engineer · owns `src/app/(app)/**`, `src/components/{workload,people,tasks,calendar,projects,clients,shell}/**`, `src/hooks/**`, `src/lib/people/**`)

Starts after S1, in parallel with S2/S3. Pages: server shell with authz at the top (X41/X57, no `loading.tsx`, no Suspense above a 404), client components with TanStack Query (`getJson` from M2 `src/lib/api.ts`, `staleTime: 60_000`, `refetchOnWindowFocus`). Dense table cells = plain elements + CSS Modules (`Workload.module.css`) reading tokens (`--load-over-bg/fg`, `--load-full-*`, `--load-light-*` with the X51 `#8F5C00`, `--tentative-*`, `--nonworking`); MUI only for toolbar, tabs, drawer, menus. Strings from `th`; MUI 9 API (`slots`/`slotProps`, `sx`, no system props); `next/link` via `@/components/Link`; icons by path import.

**S4.1 Hooks (`src/hooks/useWorkload.ts`).**
```ts
export function useWorkloadTable(p: WorkloadParams)       // useQuery(qk.workload(p), () => getJson<WorkloadResponse>('/api/workload?' + qs(p)), { placeholderData: keepPreviousData })
export function useWorkloadCell(userId: string | null, week: ISODate | null)   // enabled when both set; qk.workloadCell
export function useWorkloadBadge(initial: number)          // qk.workloadBadge(), initialData { overCount: initial, … }, initialDataUpdatedAt: 0 → refetch once on mount
export function usePeopleDirectory(); export function usePersonTimeOff(userId: string)
export function useProjectLoad(projectId: string); export function useClientLoad(clientId: string)
export function useWorkloadUrlState(): [WorkloadParams, (patch: Partial<WorkloadParams>) => void]   // URL ⇄ params via history.replaceState (M9-D5)
```
Window math in `useWorkloadUrlState` uses `weekStart(today)` from `useToday()` and `addWeeks` (ISO strings, no `Date`).

**S4.2 `/workload` page (`src/app/(app)/workload/page.tsx` + `src/components/workload/WorkloadPage.tsx`, FR-1001/1003/1004, §8.5).**
- Server: `requirePageUser()` (layout) → read `getPreferences(user)['load.view']` → `<WorkloadPage initialView={…} />`.
- Toolbar (`role="toolbar"`): title `th.workload.title`; view `ToggleButtonGroup` `th.workload.view.*` bound to `usePreferences().set('load.view', v)` (M6-D21 key; debounced, not audited); ตำแหน่ง `Select` (options from `response.positions`, `th.workload.filters.allPositions`), โปรเจค `Select` (options = visible non-archived projects from `qk.sidebar()` data, sorted `compareThai`), `Checkbox` `th.workload.filters.onlyOver`, `ล้างตัวกรอง`; window ◀ `th.workload.window.prev` / `สัปดาห์นี้` / ▶ `next` + range text.
- Tabs (`aria-label th.workload.tabs.label`): `ตาราง` · `th.workload.tabs.overloads(response.overloads.length)`.
- `WorkloadTable`: `<table aria-label={th.workload.tableLabel}>`; header row `formatWeekHeader(w)`, this week marked (`--today` bar + hidden text); group header rows (`<th colSpan scope="rowgroup">` position name); person rows: `<th scope="row">` `UserName` (M1) + `th.workload.deactivated` chip when `!active` + link to `/people/<id>/plan`; one `WorkloadCell` per week. Horizontal overflow inside its own container (no page scroll). Roving focus: one tab stop, arrows move between cells, Enter opens the panel. Empty → `EmptyState th.workload.empty`; loading skeleton; error + retry.
- Tests (`WorkloadPage.test.tsx`, QueryClient seeded with a F2+F3 manager response): group headers in order; Jack row cell for 19/10 text `5/4` with hidden status containing `th.overload.level.OVER`; switching view to แน่นอน calls the preference setter and changes no request (no refetch); the tab label reads `th.workload.tabs.overloads(3)`; filters write URL params.

**S4.3 `WorkloadCell` + tooltip (`src/components/workload/WorkloadCell.tsx`, `WorkloadTooltip.tsx`, FR-1002, M9-D6/D7).** Component signature (reused verbatim by M10's embed block and home, m10 S3.5):
```tsx
import type { WorkloadCell as WorkloadCellDTO, WorkloadResponse } from '@/lib/contracts/workload'
export interface WorkloadCellProps { name: string; week: ISODate; cell: WorkloadCellDTO; view: LoadView
  projects: WorkloadResponse['projects']; deactivated: boolean; onOpen?: () => void }   // no onOpen → read-only (no button role change; still focusable for the tooltip)
export function WorkloadCell(p: WorkloadCellProps): React.JSX.Element
```
Render: `<button className={styles.cell} data-tone data-palette data-level aria-label={th.workload.cell.label(name, week, load, cap, statusSuffix(cell))}>{workloadCellText(viewTone.loadCd, cell.capacity)}{glyph}</button>` where glyph = `StatusGlyph kind="over"|"risk"` (M7) when `level ≠ OK` (always, regardless of view); cap 0 → stripes class. One shared MUI `Popper` driven by delegated `pointerover`/`focusin` renders `tooltipLines(...)` (S1.3). Tests first (`WorkloadCell.test.tsx`): F4 Cindy 10-12 in view ALL → `data-tone="over"`, text `2.5/2`, ⚠ glyph + hidden `th.overload.level.RISK`; view COMMITTED → text `–`, ⚠ still shown; view AT_RISK → `data-palette="tentative"`; Peter F3 tooltip lines include `th.overload.cause.CAPACITY`; a deactivated person's OVER week shows `th.overload.cause.DEACTIVATED`; every coloured state has text (A11Y-1).

**S4.4 Cell side panel (`WorkloadCellPanel.tsx`, FR-1005).** Click/Enter on a cell → MUI `Drawer` `anchor="right"`, `variant="persistent"` width 440 px (does not cover the table; Esc closes, focus returns to the cell); title `th.workload.panel.title(name, week)`; summary (ทั้งหมด/แน่นอน/ยังไม่แน่นอน, capacity, status line); list of `items`: task items = `Link href={item.href}` with `th.workload.panel.openTask(taskName)`, breadcrumb, project chip (`ProjectChip`, M2), `twoDecimals` days, ◐ when tentative; masked item = `th.masking.otherProjects` + days, no link; footer link `th.workload.panel.openPerson` → `/people/<id>/plan?week=<w>`. Test (`WorkloadCellPanel.test.tsx`): renders a masked item without a link; Esc closes and calls `onClose`.

**S4.5 Overload list tab (`OverloadList.tsx`, FR-1006).** Table columns `th.workload.list.*`: person (`UserName`), week (`formatThaiDate(week, 'medium')`), level (`StatusGlyph` + `th.overload.level[level]` text), excess (`th.overload.excess(twoDecimals(excess))`), cause (`th.overload.cause[cause]` or `DEACTIVATED`), fix = `Link href={item.href}` `aria-label={th.workload.list.fixLabel(name, week)}` text `th.workload.list.fix`. Empty → `th.workload.list.empty`. Test: F2+F3 fixture → 3 rows in server order; the fix link of Peter points to `/people/<peter>/plan?week=2026-10-05`.

**S4.6 Sidebar badge + nav (`src/components/shell/Sidebar.tsx`, `src/components/workload/WorkloadBadge.tsx`, `src/app/(app)/layout.tsx`, FR-1007, X31, M9-D11).**
- Layout: after `requirePageUser()`, `const badge = await db.transaction((tx) => services.workload.badgeCount(tx, user, serverToday()), { accessMode: 'read only' })` → pass `initialWorkloadOver={badge.overCount}` to `AppShell` → `Sidebar`.
- `Sidebar.tsx`: `NAV_ICONS` entries `workload: InsertChartOutlined`, `people: GroupsOutlined` (next to M3's `my`/`teamTasks`; S0 already added them); badge rendering switches on `item.badge` (`NavBadge`): `'myTaskCount'` keeps M3's branch unchanged, `'workloadOver'` renders `<WorkloadBadge initial={initialWorkloadOver} />` (an exhaustive `switch` so a future kind fails typecheck).
- `WorkloadBadge`: `useWorkloadBadge(initial)`; `overCount === 0` → nothing; else `<span className={styles.badge} aria-label={th.workload.badge.label(n)}><span aria-hidden className={styles.dot}>●</span>{n}</span>`; collapsed rail shows the number in the tooltip.
- Tests (`WorkloadBadge.test.tsx`, `Sidebar.test.tsx` additions): initial 2 renders "2" and the label `th.workload.badge.label(2)`; after `invalidateLoad` with a mocked fetch returning 3 → "3"; 0 renders nothing; nav order `หน้าหลัก, งานของฉัน, งานของทีม, Workload ทีม, ปฏิทินทีม` and the bottom group `ทีมงาน` before `ลูกค้า`.

**S4.7 `/people` directory + person layout/header/tabs (`src/app/(app)/people/page.tsx`, `src/app/(app)/people/[id]/{layout,page}.tsx`, `src/components/people/**`, `src/lib/people/schedule.ts`, FR-1008, M9-D14).**
- `/people`: client `PeopleDirectory` (`usePeopleDirectory`): grouped table (position header rows), each person: `UserName` link to `/people/<id>/plan`, position, this week `WorkloadCell` (view ALL, read-only tooltip; click navigates to the person page). Empty/error states.
- `people/[id]/layout.tsx` (RSC): `requirePageUser()` → `const { id } = await props.params` → `const header = await orNotFound(services.people.getPersonHeader(db, user, id))` **first** → `<PersonHeaderView header />` + `<PersonTabs userId={id} />` (`PEOPLE_TABS` in `src/components/people/people-tabs.ts`: `plan` 0 · `tasks` 1 · `leave` 2, labels `th.people.tabs.*`, MUI `Tabs` with `Tab component={Link}`, value from `useSelectedLayoutSegment()`); `people/[id]/page.tsx` → `redirect('/people/' + id + '/plan')` (search params kept).
- `PersonHeaderView`: display name (h1), full name when different, position (`th.people.header.noPosition` fallback), schedule text `formatSchedule(schedule)` (pure, `src/lib/people/schedule.ts`: Mon–Fri all 100 → `th.people.schedule.perDay('จ–ศ', '1.00')`; otherwise parts per day via `formatWeekday` + `cdToNumeric`; none → `th.people.schedule.none`), `th.people.header.deactivated` chip.
- Tests: `schedule.test.ts` (`{1..5:100}` → `perDay('จ–ศ','1.00')`; `{1:100,3:100,5:100}` → `จ 1.00 · พ 1.00 · ศ 1.00`; `{}` → none); `PersonHeaderView.test.tsx` (deactivated chip text present).

**S4.8 Person tabs: แผนงาน + งาน (`people/[id]/plan/page.tsx`, `people/[id]/tasks/page.tsx`, `src/components/tasks/team/TeamTasks.tsx`, FR-667, X77, M9-D15/D28).**
- `plan/page.tsx` (RSC): prefs `grid.zoom`, `grid.unit` → `<PersonPlan userId name focusWeek={sp.week (validated Monday, else undefined)} initialZoom />` → `PlanGrid context={{ kind: 'person', id }} projectName={name} label={th.people.grid.label(name)} archived={false} canEdit focusWeek onOpenTask={(taskId, projectId) => router.push('/projects/' + projectId + '/plan?task=' + taskId)}`.
- `TeamTasks` (M3-D41: `export function TeamTasks({ syncUrl = true, …}: TeamTasksProps)`, filters from `useTeamTaskFilters({ syncUrl })`) gains props `fixedUserId?: string; forcedView?: 'LIST' | 'BOARD'; hint?: string` (C33/C57). With `fixedUserId`: the person filter control is hidden and the hook's `TeamTaskFilters` object is forced to `{ ...filters, userId: fixedUserId }` → `qk.teamTasks(...)` / `GET /api/tasks?userId=`; M9 call sites **always** pass `syncUrl={false}` with it, so M3's hook never calls `history.replaceState` (no new URL code in M9); `forcedView` overrides `tasks.view` without writing the preference. M8's `milestoneId` filter key stays available. Status changes, ticking and board drag keep M3's mutations + undo + M6's BR-52 toast helper (unchanged code paths). M3's `TeamTasks.test.tsx` (incl. its `syncUrl={false}` case) stays green unchanged.
- `tasks/page.tsx`: `<TeamTasks fixedUserId={id} syncUrl={false} hint={!header.isSelf && !isManager ? th.people.tasks.hiddenHint : undefined} />` (the page calls `orNotFound(getPersonHeader(db, user, id))` again — cheap, and keeps the page safe on its own).
- Tests (`TeamTasks.fixedUser.test.tsx`): with `fixedUserId` + `syncUrl={false}` the request URL contains `userId=<id>`, no person filter control, `window.location.search` untouched after changing the category filter; `forcedView="BOARD"` renders `TaskBoard` and never calls the preference setter; the hint text renders.

**S4.9 Person tab วันลา (`people/[id]/leave/page.tsx`, `src/components/people/PersonLeave.tsx`, M9-D16).** `usePersonTimeOff(userId)` → two lists ที่กำลังจะถึง / ที่ผ่านมา (split at `useToday()`), each entry `formatLeaveRange(start, end, half)` (M5) + type name (full) or `th.masking.leave` (masked) — masked entries carry no id and no actions; when `canEdit`: "แจ้งลา" opens M5's `LeaveDialog` (create, `userId` preset for managers) and full entries open it in edit mode; delete through M5's flow (undo toast); success → `invalidateCalendar(qc)` + `invalidateLoad(qc)` (covers `qk.personTimeOff`). Test (`PersonLeave.test.tsx`): masked entry shows `ลา` and no edit button; full entry with `canEdit` opens the dialog.

**S4.10 `/my` buckets + view switch (`src/app/(app)/my/page.tsx`, `src/components/tasks/MyTasks.tsx`, FR-1009, FR-667, M9-D15/D17).**
- `MyTasks` now reads `MyTaskBucketsResponse` (`qk.myTasks()`): four sections in `MY_BUCKETS` order with `th.my.buckets[key]` headings and counts; empty buckets show `th.my.emptyBucket` (UNPLANNED hidden when empty); rows keep M3's `StatusChip`, checkbox (complete + undo + BR-52 toast helper), parent/due text, plus `th.my.planned(twoDecimals(plannedCd))` and, for NEXT_WEEK/LATER, `th.my.fromWeek(formatWeekHeader(firstWeek))`; optimistic removal on tick; single column at 390 px.
- View switch (`ToggleButtonGroup` `th.my.view.*`) in the URL `?view=list|board` (default buckets): list/board render `<TeamTasks fixedUserId={me} syncUrl={false} forcedView={…} />` (`/my` owns its URL: only `?view=`).
- Sidebar "งานของฉัน N" keeps M3's rendering; the number now comes from the THIS_WEEK bucket (S2.8) and refreshes via `qk.sidebar()` (in `invalidateLoad`, M9-D17).
- Tests (`MyTasks.test.tsx`, rewrite on the new shape): sections in order with Ivy's golden content; ticking calls `completeTask({ taskIds: [id] })` and pushes the undo entry; `?view=board` renders `TaskBoard`.

**S4.11 FR-906 impact lines (`src/components/calendar/ImpactPanel.tsx`, M9-D18).** Below M5's capacity lines: when `impact.overloads.length > 0` a heading `th.overload.impact.heading` and one `<li>` per line: `StatusGlyph` + `th.overload.impact.line(formatThaiDate(week), th.overload.level[after.level], th.overload.excess(twoDecimals(after.excessCd)), th.overload.cause[after.cause])` (or `th.overload.impact.worse(...)` when `before.level === after.level`), parts `th.overload.impact.part(name, twoDecimals(total))`, and `Link href={line.href}` `th.overload.impact.fix`; when `onTimeOffDays` is non-empty, one line `th.grid.warn.allocatedOnTimeOff(twoDecimals(Σ cd))` (M7 key). Tests first (`ImpactPanel.test.tsx` additions): F3 line renders "สัปดาห์ 5 ต.ค. 2569: ล้น เกิน 2.00 วัน — เพราะลา/วันหยุด" (built from `th`) with a link to `/people/<id>/plan?week=2026-10-05`; empty `overloads` renders nothing extra; `onTimeOffDays [{100}]` renders `allocatedOnTimeOff('1.00')`.

**S4.12 Overview + client load sections (`src/components/projects/ProjectLoadSection.tsx`, `src/components/clients/ClientLoad.tsx`, FR-409/FR-303, M9-D19/D20).**
- Overview tab (M2 page, M3 progress, M8 milestones): append `<ProjectLoadSection projectId />` (client): heading `th.workload.projectLoad.heading`; members table (name + role chip, this week, 12-week sum in days via `twoDecimals`); 12 bars (`div`s with heights proportional to `total`, max = the largest week; committed part solid `--brand-blue`, tentative part hatched `--tentative-*` stripes; each bar has `aria-label th.workload.projectLoad.bar(formatWeekHeader(w), total, committed)`; legend); archived → `th.workload.projectLoad.archived` only; no plans → `empty`.
- Overview order (C41): M2 info + members → M3 progress/`StatusSettings` → M8 milestones → M9 `ProjectLoadSection` last (append; never reorder earlier sections).
- Client page (M2): header line `th.workload.clientLoad.total(twoDecimals(sum.total))` + for workers `th.workload.clientLoad.visibleOnly`; column `th.workload.clientLoad.column` added to M2's `ProjectsTable` through a new **optional** prop `loadByProject?: Record<string, LoadPair>` rendered as the last column only when present (the `/projects` list page passes nothing → unchanged; per project sum, "–" when 0 or absent).
- Tests (`ProjectLoadSection.test.tsx`, `ClientLoad.test.tsx`): POS fixture → Mint sum `11.25`, Cindy `2.50`, 12 bars with the 2026-12-14 bar labelled committed `0.00`; archived note.

**S4.13 Invalidation audit (X18).** Every load-changing mutation in `src/components/**` calls `invalidateLoad(qc)` (grid save is S3's): FR-612 apply, `setTaskStatus`/`completeTask`/`revertTaskStatus` (list, board, `/tasks`, `/my`, person tab), assign/unassign, task delete/restore, member removal with unassign, archive/unarchive, certainty change, time off create/update/delete/restore, holiday create/update/delete/import. List the call sites in the S4 report; add the missing ones. Test: `src/lib/invalidate.test.ts` already proves the keys; a `ui` test for `/my` tick asserts `invalidateLoad` was called.

**S4.14 Done-check.** `pnpm vitest run --project ui src/components src/hooks` · `pnpm vitest run --project unit src/lib/people` · `pnpm eslint "src/app/(app)" src/components src/hooks src/lib/people` · `pnpm typecheck` (own paths clean). Never run `next dev`/`next build`.

### 5.S5 — Authz rows, masking, golden (test-engineer · owns `tests/authz/**`, `tests/golden/**`, `tests/integration/**`)

Written **from SPEC §3.2/§3.3 before S2 finishes** (PLAN §4.1); rows are red until S2 lands (stubs throw `NOT_IMPLEMENTED`), green at G2. World `createWorld({ with: ['allocations', 'milestones'] })` (M6 + M8: `w.users.coworker` in P and Q, `w.assignments.pCoworker` WEEK 2026-10-05 = 100, `w.assignments.qTaskCoworker` WEEK 2026-10-05 = 300, `w.milestones.p` "Milestone P-ลับ06", `w.milestones.q` "Milestone Q-ลับ05"); `asUser`, `outcomeOf`, `outcomeOfCall`. Visibility in the world (X43): M, L → all users; Me → {member, lead, coworker, pOnly}; W → {outsider, coworker}.

**S5.1 Rows (`tests/authz/rows/workload.ts`, `tests/authz/rows/people.ts`, both appended to `tests/authz/rows/index.ts` — X91, M11 AUD-00 fails on a missing registration; full table §7.2).**
```ts
const get = (path: string, params: Record<string, string>, handler: RouteHandler) => handler(new Request(`http://t${path}`), { params: Promise.resolve(params) })
{ id: 'PERM-22', key: 'WL-TABLE', spec: '§3.3 ดู workload', action: 'GET /api/workload', mutates: false,
  expect: { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' }, run: () => get('/api/workload?from=2026-09-28&to=2026-12-21', {}, getWorkload) },
{ id: 'PERM-22', key: 'WL-CELL-W', spec: '§3.3 totals of co-members only', action: 'GET /api/workload/cell', mutates: false,
  expect: { M: 'allow', L: 'allow', Me: '404', W: 'allow' }, run: (w) => get(`/api/workload/cell?userId=${w.outsider.id}&week=2026-10-05`, {}, getWorkloadCell) },
{ id: 'PERM-12', key: 'AL-PERSON', spec: '§3.2 วางแผน (from the person grid)', action: 'saveAllocations', mutates: true,
  audit: { entity: 'allocation', projectId: (w) => w.P.id },
  expect: { M: 'allow', L: 'allow', Me: 'allow', W: '404' },
  run: (w) => saveAllocations({ items: [{ taskAssignmentId: w.assignments.pCoworker.id, baseVersion: 1, changes: [{ granularity: 'WEEK', period: '2026-11-16', cd: 100 }] }], clientOpId: 'op-m9' }) },
{ id: 'PERM-22', key: 'PH-W', spec: 'FR-1008 header', action: 'getPersonHeader (page loader)', mutates: false,
  expect: { M: 'allow', L: 'allow', Me: '404', W: 'allow' }, run: async (w) => outcomeOfCall(async () => services.people.getPersonHeader(db, await currentUser(), w.outsider.id)) },
```
Every row also runs as nobody (`401`) and as a mustChange user (`403`, M1 loop). The AZ-2 coverage meta-test (M2) must find a row for each of the 8 new routes.

**S5.2 Masking (`tests/authz/masking.int.test.ts › describe('workload & people (M9)')`, §11.2, MASK-1…7, R4).** For each case assert `containsAny(body, needles)` = `[]` **and** that the required masked totals are present.

| Viewer → endpoint | Must be absent | Must be present |
|---|---|---|
| outsider → `GET /api/workload?from=2026-09-28&to=2026-12-21` | ids of manager, lead, member, pOnly; `w.P.name`, `w.P.id`, `'งานร่วม P-ลับ03'`, `w.tasks.pCoworker.id`, `w.assignments.pCoworker.id`, `'Milestone P-ลับ06'` | people = {outsider, coworker}; coworker `cells['2026-10-05'].byProject` = `[{ projectId: Q, 300, 300 }, { projectId: null, 100, 100 }]`; `projects` keys ⊆ {Q} |
| member → `GET /api/workload` | `w.Q.name`, `w.Q.id`, `'งาน Q-ลับ02'`, `w.tasks.qTask.id`, `w.assignments.qTaskCoworker.id`, `w.assignments.qTaskOutsider.id`, `'สถานะลับ Q-04'`, outsider's id | coworker 10-05 null part `{ 300, 300 }` |
| member → `GET /api/workload/cell?userId=<coworker>&week=2026-10-05` | same Q needles | P item `'งานร่วม P-ลับ03'` + masked `{ 300, 300 }` |
| member → `GET /api/grid/person/<coworker>?from=2026-09-28&to=2026-11-23` | same Q needles + `'Milestone Q-ลับ05'` | project row P, masked row `W:2026-10-05 = { 300, 300 }` |
| outsider → `GET /api/grid/person/<coworker>` | P needles (name, ids, `'งานร่วม P-ลับ03'`, `'Milestone P-ลับ06'`) | project row Q, masked row `W:2026-10-05 = { 100, 100 }` |
| outsider → `GET /api/grid/person/<member>` | everything (404 body has no member name/ids) | — |
| outsider → `GET /api/people` | member, lead, pOnly, manager ids/names | outsider, coworker |
| outsider → `GET /api/people/<coworker>/time-off` | `'โน้ตลับ-โลก-01'`, `'ลาพักร้อน-โลก'`, the entry id, the leave-type id/colour | one masked entry 2026-11-09..10 label `th.masking.leave` |
| outsider → `GET /api/workload/badge` | any string at all (body keys exactly `overCount, from, to`) | number |
| lead → `GET /api/clients/<C2>/load` | — (404) | — |
| member → `GET /api/tasks?userId=<coworker>` (M3 route, person tab) | Q needles | P cards only |

Golden pairs (`describe('golden person grid masking')`, `seedGolden`): for **every** `facts.masking` item of r8 §6.4 (15 pairs, e.g. Cindy → Peter, Ivy → Mint, Jack → Mint, Mint → Jack): as the viewer `GET /api/grid/person/<target>?from=2026-08-31&to=2027-01-04` → masked row `totals['W:<week>'].total` = `byWeek[week]` for every listed week (and absent/0 elsewhere), `containsAny(body, mustNotContain)` = `[]`, plus no id of a hidden project/task/assignment; the 5 invisible pairs (Ivy → Manager/Peter/Jack, Mint → Manager/Peter) → 404 for the person grid, the header loader, the time-off route and the cell route. With `addMilestones` (M8): Cindy/Ivy bodies contain none of "Pipeline พร้อมใช้งาน", "Design freeze", "Beta release", "Dashboard v1 review" (r8 §4.3, M8-D23).

**S5.3 Golden (`tests/golden/golden.int.test.ts › describe('M9 workload')`, §11.3, r8 §2–§4.6, X11).** Fresh `truncateAll` + `seedGolden` (+ `applyFixture`) per case; as manager, `services.workload.buildTable` over `[2026-08-31, 2027-01-04)` (18 weeks, exclusive end) **and** `GET /api/workload?from=2026-08-31&to=2027-01-04` (deep-equal bodies):
- F1: every `expected.F1.byUserWeek` cell (57) equals `{ total, committed, capacity }` of the person's cell; every other user × week of the 5 listed people = `{ 0, 0, 500 }`; `overloads = []`; Σ cells = 19 500 / 11 625; Manager absent.
- F2, F3, F4: `overloads` (mapped to `{ user: nickname, week, level, excessCd, cause, totalCd, committedCd, capacityCd }` and sorted with r8's `sortOv`) deep-equal `expected.Fn.overloads`; no other non-OK cell.
- F2 + F3: 3 items (Peter 10-05, Jack 10-19, Mint 10-19); F2 + F3 + F4: 4 items (r8 §4.6).
- BR-45 colour counts via `viewTone` over the 5 × 18 cells (r8 §4.6 table minus Manager's 18 empty cells): F1 ALL → GREEN 16, YELLOW 41, EMPTY 33; F1 COMMITTED → GREEN 12, YELLOW 20, EMPTY 58; F2 ALL → RED 2 (Jack/Mint 10-19), Cindy 10-19 `full`; F4 ALL → RED 1 (Cindy 10-12) with level RISK; F4 COMMITTED → Cindy 10-12 `empty`.
- Badge per viewer (r8 §6b): F1 0×6; F2 `2/2/1/2/2/2`; F3 `1/1/0/1/1/0`; F4 0×6; F2+F3 `3/3/1/3/3/2` (order Manager, Cindy, Ivy, Peter, Jack, Mint).
- Person grid parity: for each of the 5 workers, Σ (assignee counted cells + masked totals) per week from `buildChunk({ kind: 'person' })` as manager **and** as Cindy equals the workload cell totals (F1 and F3).
- FR-906: F3 and F4 setups applied **through** `createTimeOff` (not `applyFixture`) → the returned `impact.overloads` equal r8 §6b ("OVER +2.00 CAPACITY", "RISK +0.50 CAPACITY").

**S5.4 Older tests under `tests/**`.** Update only what M9 changes on purpose: M3 matrix row T-MY still `allow` ×4 (shape changed — no body assertion there); M3 masking `GET /api/tasks/my` case reads `buckets` instead of `groups`; M5 masking/calendar cases comparing whole `impact` objects gain `overloads: []`/`onTimeOffDays: []`; M6 GridResponse key-set assertions accept the widened `context`. Never weaken an assertion.

**S5.5 Done-check.** `pnpm vitest run --project integration tests` (rows red only while S2 stubs throw) · `pnpm eslint tests` · `pnpm typecheck` (own paths clean).

### 5.S6 — E2E `m9-workload` (test-engineer · owns `e2e/**`)

Runs after S2–S5. The integrator runs Playwright at G2; the stream writes specs and page objects only (`pnpm exec playwright test --list`).

**S6.1 Page objects.**
```ts
// e2e/pages/workload.ts
export class WorkloadPage {
  constructor(readonly page: Page) {}
  goto(): Promise<void>                                          // sidebar link th.nav.workload; waits for role=table name th.workload.tableLabel
  cell(personName: string, week: ISODate): Locator               // row header = personName → cell button whose aria-label starts with th.workload.cell.label(personName, formatWeekHeader(week), …) prefix
  setView(v: LoadView): Promise<void>; filterPosition(name: string): Promise<void>; filterProject(name: string): Promise<void>; onlyOver(on: boolean): Promise<void>
  next(): Promise<void>; prev(): Promise<void>; thisWeek(): Promise<void>
  openOverloadsTab(): Promise<void>; overloadRows(): Locator; fixLink(personName: string, week: ISODate): Locator
  hover(personName: string, week: ISODate): Promise<Locator>     // returns the shared tooltip
  panel(): Locator                                               // role=complementary / drawer heading th.workload.panel.title(...)
  groupHeaders(): Locator
  badge(): Locator                                               // sidebar nav item th.nav.workload → its badge (aria-label th.workload.badge.label(n))
}
// e2e/pages/people.ts
export class PersonPage {
  constructor(readonly page: Page) {}
  goto(userId: string, tab?: 'plan' | 'tasks' | 'leave', q?: string): Promise<{ status: number }>   // page.goto(`/people/${userId}/${tab ?? 'plan'}${q ?? ''}`) → response status (404 check)
  header(): Locator; tab(name: 'plan' | 'tasks' | 'leave'): Locator
  grid(): GridPage                                               // M6 GridPage bound to role=grid name th.people.grid.label(name); rowKeyOf/cell/footerLoad reused (no absolute aria-rowindex — the ◆ row shifts it, M8)
  maskedRow(userId: string): Locator                             // data-row-key="m:<userId>"
  projectRow(projectId: string): Locator                         // data-row-key="p:<projectId>"
}
// e2e/pages/my.ts
export class MyTasksPage { goto(): Promise<void>; bucket(key: MyBucketKey): Locator; tick(taskName: string): Promise<void>; setView(v: 'weeks' | 'list' | 'board'): Promise<void> }
```
Extend `e2e/pages/sidebar.ts` with `workload()`, `people()` and the badge; extend the M5 `LeaveDialog` page object with `overloadLines()`.

**S6.2 `e2e/m9-workload.spec.ts`** — scenarios W1–W11 exactly as §7.3; `test.describe.configure({ mode: 'serial' })` inside describes that chain state; `test.beforeAll(async () => { await resetDb('F2', { alsoFixtures: ['F3'] }) })` (or the describe's fixture) per describe — never `beforeAll(resetDb(...))`; `loginAs` per test; `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; numbers via `compactDays`/`twoDecimals`/`formatCd`, dates via `formatWeekHeader`/`formatThaiDate`, strings from `th`, user ids via `userIdByNickname`; masking checks read the JSON with `page.waitForResponse(/\/api\/(workload|grid\/person)/)` and assert the needles are absent; no sleeps (wait on table/grid visibility, `data-save-state="idle"`, toasts, text).

**S6.3 Update older specs (shared UI changed).**
- `e2e/m3-tasks.spec.ts` E13 (C34; m03 §7.3 E13 as written: ivy opens `/my`, ticks "ตั้งค่า automation", clicks "เลิกทำ", sets 390×844, clicks "ทำ UAT + คู่มือหน้าร้าน") — keep the steps, change only these assertions:
  - sidebar "งานของฉัน" shows **1** (was 2: only UAT is in สัปดาห์นี้);
  - instead of the project groups "CRM Migration" / "POS Upgrade": section `th.my.buckets.THIS_WEEK` holds "ทำ UAT + คู่มือหน้าร้าน" and section `th.my.buckets.LATER` holds "ตั้งค่า automation" (via `MyTasksPage.bucket(key)`, S6.1);
  - after ticking "ตั้งค่า automation" the count stays **1** (was 1) and the task leaves the LATER section; after undo the count is **1** (was 2) and the task is back in LATER;
  - the toast text follows m06 S6.3 (`th.tasks.toast.released('10.0', 4)`) only if E13 asserts the toast; the 390 px no-horizontal-scroll check and the navigation to POS tasks with the panel open stay unchanged.
- `e2e/m0-smoke`, `m2-projects`, `m4-pages`, `m5-calendar`: sidebar enumerations gain `Workload ทีม` (after งานของทีม) and `ทีมงาน` (before ลูกค้า); the m2 overview scenario tolerates the new load section (assert its heading); the m2 client page shows the load line.
- `e2e/m5-calendar.spec.ts` E1 (F1, Peter 10-05..06): the impact panel now also shows the overload line — assert the capacity line as before and the new line `th.overload.impact.line(formatThaiDate('2026-10-05'), th.overload.level.OVER, th.overload.excess('2.00'), th.overload.cause.CAPACITY)`. E5 (F4, manager records Peter 10-15..16): the capacity line assertion stays; the panel now also lists week 2026-10-12 OVER +0.75 (load 3.75 vs cap 3.00) — add that assertion; no M5 assertion may count `<li>` elements of the panel. E4/E7: unchanged (no worsened week).
- `e2e/m6-grid.spec.ts` / `m7-daily.spec.ts`: footer week cells may carry tone/glyph — text assertions unchanged; no new behaviour expected. `m8-milestones`: nothing.
- Move any new shared selector into page objects.

**S6.4 Done-check.** `pnpm exec playwright test --list` · `pnpm eslint e2e` · `pnpm typecheck`.

---

## 6. Integration (orchestrator)

**Expected cross-stream requests (apply after Build, step 4):**

| From | Request |
|---|---|
| S2 | `th.errors.*` keys if a new error message is needed (none expected); the new repo functions `repo.assignments.listActiveForUserLive`, `repo.people.getPerson`, `repo.projects.listByIds` (if absent) (M7's `repo.allocations.dayLoadsForProjects` already takes `projectIds`, M7-D27) live in `src/server/**` (S2 creates them, S2.5 — listed for visibility; M3 does not define `listActiveForUserLive`, C52) |
| S3 | `th.grid.*` / `th.overload.*` keys added during build; M8 ◆ row guard generalisation (inside `src/components/grid/**`, S3 owns) |
| S4 | `th.workload.*` / `th.people.*` / `th.my.*` / `th.nav.*` additions; M2 `ProjectsTable` column slot for the client load (S4 owns `src/components/projects/**`); M5 `LeaveDialog` props for preset user (S4 owns `src/components/calendar/**`) |
| S4 → S2 | `MyTaskBucketsResponse` switch: once `MyTasks.tsx` reads buckets, delete M3's `listMyTasks` and the old `MyTasksResponse` type (integrator, after both land) |
| S5 | `tests/helpers/**` tweaks found while writing rows (orchestrator applies; S0 owned them) |
| S6 | missing accessible names / test ids in `src/components/{workload,people,grid}/**` (request to S3/S4) |

**Wiring order:** S0 (G0) → {S1, S5} → {S2, S3, S4} (S5 continues) → integrator: delete the dead M3 `MyTasksResponse`/`listMyTasks`, confirm `(app)/layout.tsx` passes the badge, run the commands → S6 → G2.

**Commands (G2):**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                     # → "No schema changes, nothing to migrate" (M9 has no schema change)
pnpm check                           # typecheck + lint + unit + ui + integration (authz, masking, golden, perf smoke) + domain coverage ≥ 95 %
pnpm test:e2e                        # full suite m0 … m9 (production build, APP_NOW, ALLOW_TEST_HOOKS=1)
git diff --exit-code CLAUDE.md SPEC.md docs/
grep -rn "th.masking.otherProjects" src/server | grep -v services/masking.ts          # must print nothing (masking in one place)
grep -rnE "from allocations|allocations\b" src/server/repo/allocations.ts | grep -n "week_start" >/dev/null   # manual: every new query has a week_start range
grep -rn "localStorage" src/components/workload src/components/people && exit 1 || true
grep -rln "refresh()" src/server/services/workload.ts src/app/api/workload && exit 1 || true
```
Integrator checks by hand: `/workload` as Ivy shows only Cindy, Ivy, Mint; the sidebar badge updates after a grid edit without reload; the person grid opened from a fix link scrolls to the week; `ls` the repo root for stray files.

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Tests |
|---|---|
| AC-604 (verification, X14) | int `grid-person.int.test.ts › AC-604` · e2e W7 |
| §12 M9 "overload.ts" | unit `src/domain/overload.m9.test.ts` (BR-41 vectors, excess, `viewTone`, `worsened`, properties) |
| §12 M9 "§4.10 ทั้งหมด" FR-1001…1009 | int `workload.int.test.ts` (population, filters, overloads, cell detail, badge), `people.int.test.ts`, `grid-person.int.test.ts`, `my-tasks.int.test.ts` · ui `WorkloadPage`, `WorkloadCell`, `WorkloadCellPanel`, `OverloadList`, `WorkloadBadge`, `MyTasks` · e2e W1–W6, W9, W10 |
| §12 M9 "`GET /api/grid/person`, `GET /api/workload` + masking" | int · mask (world + 15 golden pairs + 5 invisible pairs) · authz PG-*, WL-* · e2e W4, W6 |
| §12 M9 "FR-906 ส่วน overload" | unit `worsened` · int `time-off.int.test.ts › overloads` · golden FR-906 · ui `ImpactPanel.test.tsx` · e2e W8 |
| §12 M9 "FR-409 ส่วนภาระ" + FR-303 load | int `project-load.int.test.ts`, `client-load.int.test.ts` · authz PJ-LOAD-*, CL-LOAD-* · ui · e2e W11 |
| §12 M9 Golden F2, F3, F4 (+ F1c) | golden `describe('M9 workload')` |
| §12 M9 Tests: masking §11.2 | mask `describe('workload & people (M9)')` |
| FR-667 (person tab + `/my` views) | ui `TeamTasks.fixedUser.test.tsx`, `MyTasks.test.tsx` · mask (`/api/tasks?userId=`) · e2e W9, W10 |
| FR-705 person part / MASK-6 | int `grid-person › milestones` · mask golden (M8 names) · ui `PlanGrid.person.test.tsx` |
| FR-405 on workload | int `workload › FR-405` · e2e W2 |
| BR-43/44/50/72/87, FR-628 | int `repo/allocations › loadByUserProjectWeek`, `workload › WAITING / milestones no load` |
| BR-03 | int `workload › integers` |
| NFR-03 (smoke) | int `workload.perf.int.test.ts` |
| A11Y-1 | ui `WorkloadCell`, `Footer.week`, `WorkloadBadge` (glyph + text, never colour alone) |

### 7.2 Authorization matrix rows added (`tests/authz/rows/workload.ts`, `tests/authz/rows/people.ts`)

`M` manager · `L` lead (LEAD of P and A; sees all users) · `Me` member (MEMBER of P and A; sees member, lead, coworker, pOnly) · `W` outsider (MEMBER of Q; sees outsider, coworker). World `createWorld({ with: ['allocations', 'milestones'] })`.

| Key | PERM | Route / action (world ids) | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| WL-TABLE | PERM-22 | `GET /api/workload?from=2026-09-28&to=2026-12-21` | allow | allow | allow | allow | no |
| WL-DEFAULT | PERM-22 | `GET /api/workload` (no params) | allow | allow | allow | allow | no |
| WL-PROJ-P | PERM-06 | `GET /api/workload?projectId={P}` | allow | allow | allow | 404 | no |
| WL-PROJ-Q | PERM-06 | `GET /api/workload?projectId={Q}` | allow | 404 | 404 | allow | no |
| WL-BADQ | — | `GET /api/workload?from=2026-09-29&to=2026-12-21` | 400 | 400 | 400 | 400 | no |
| WL-SPAN | — | `GET /api/workload?from=2026-01-05&to=2027-01-11` (54 w) | 400 | 400 | 400 | 400 | no |
| WL-CELL-ME | PERM-22 | `GET /api/workload/cell?userId={member}&week=2026-10-05` | allow | allow | allow | 404 | no |
| WL-CELL-W | PERM-22 | `GET /api/workload/cell?userId={outsider}&week=2026-10-05` | allow | allow | 404 | allow | no |
| WL-CELL-BADQ | — | `…/cell?userId={member}&week=2026-10-06` | 400 | 400 | 400 | 400 | no |
| WL-BADGE | PERM-22 | `GET /api/workload/badge` | allow | allow | allow | allow | no |
| PEOPLE | PERM-22 | `GET /api/people` | allow | allow | allow | allow | no |
| PG-ME | PERM-22 | `GET /api/grid/person/{member}?from=2026-09-28&to=2026-11-23` | allow | allow | allow | 404 | no |
| PG-W | PERM-22 | `GET /api/grid/person/{outsider}?…` | allow | allow | 404 | allow | no |
| PG-CO | PERM-22 | `GET /api/grid/person/{coworker}?…` | allow | allow | allow | allow | no |
| PG-MISSING | — | `GET /api/grid/person/<random v4 uuid>` | 404 | 404 | 404 | 404 | no |
| PG-BADQ | — | `GET /api/grid/person/{member}?from=2026-09-29&to=2026-11-23` | 400 | 400 | 400 | 400 | no |
| PH-ME | PERM-22 | page loader `getPersonHeader(member)` | allow | allow | allow | 404 | no |
| PH-W | PERM-22 | page loader `getPersonHeader(outsider)` | allow | allow | 404 | allow | no |
| PT-ME | PERM-22 | `GET /api/people/{member}/time-off` | allow | allow | allow | 404 | no |
| PT-W | PERM-22 | `GET /api/people/{outsider}/time-off` | allow | allow | 404 | allow | no |
| PJ-LOAD | PERM-06 | `GET /api/projects/{P}/load` | allow | allow | allow | 404 | no |
| PJ-LOAD-ARCH | PERM-06, X42 | `GET /api/projects/{A}/load` | allow | allow | allow | 404 | no |
| PJ-LOAD-MISSING | — | `GET /api/projects/<random v4 uuid>/load` | 404 | 404 | 404 | 404 | no |
| CL-LOAD-C1 | PERM-04 | `GET /api/clients/{C1}/load` | allow | allow | allow | 404 | no |
| CL-LOAD-C2 | PERM-04 | `GET /api/clients/{C2}/load` | allow | 404 | 404 | allow | no |
| AL-PERSON | PERM-12 | `saveAllocations` `pCoworker` WEEK 2026-11-16 = 100 (person-grid edit) | allow | allow | allow | 404 | yes (1 `allocation` audit row, `project_id` P) |
| (loop) | — | every row as nobody | 401 | 401 | 401 | 401 | — |
| (loop) | — | every row as a mustChange user | 403 | | | | — |

M3 rows (T-MY, completeTask, setTaskStatus) and M5 rows (PERM-20/21 createTimeOff/updateTimeOff/deleteTimeOff) are unchanged; their new result fields are asserted in S2.8/S2.9 integration tests.

### 7.3 E2E scenarios (`e2e/m9-workload.spec.ts`)

Deterministic per PLAN §4.5: production build, `APP_NOW=2026-09-30T10:00:00+07:00`, `ALLOW_TEST_HOOKS=1`; `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; `loginAs` via the API; strings from `th`; page objects from S6.1; the CSP-violation listener stays on. ⟲ = `resetDb(...)` in `beforeAll` of that describe; `F2+F3` = `resetDb('F2', { alsoFixtures: ['F3'] })`.

| # | Setup / actor | Steps | Assertions |
|---|---|---|---|
| W1 ⟲ `F2+F3` | FR-1001/1002/1006, §8.5, PRIN-P6 · manager | sidebar Workload ทีม; read the table; tab `รายการที่ล้น (3)`; click the fix link of Peter 2026-10-05 | group headers `Project Manager, Developer, Designer, QA, Data`; first column `28/9`, 12 week columns to `14/12`; Jack `19/10` text `5/4` + 🔴 (hidden text `th.overload.level.OVER`); Peter `5/10` `5/3` 🔴; Peter `19/10` `2.5/4` no glyph; list rows in order Peter 5 ต.ค. / Jack 19 ต.ค. / Mint 19 ต.ค., each `th.overload.excess('2.00'|'1.00'|'1.00')` + `th.overload.cause.CAPACITY`; fix link lands on `/people/<peter>/plan?week=2026-10-05` with that header `data-focus-week="true"` |
| W2 ⟲ `F2+F3` | FR-1003/1004, FR-405 · manager | view แน่นอน; then ยังไม่แน่นอน; back to ทั้งหมด; filter ตำแหน่ง Data; clear; filter โปรเจค Mobile App Revamp; clear; tick เฉพาะคนที่ล้น; untick; open CRM overview → certainty แน่นอน (M2 toggle) → back to `/workload` view แน่นอน | a request counter on `/api/workload` stays 0 during the view switches; Cindy `5/10` reads `–` in แน่นอน and has `data-palette="tentative"` in ยังไม่แน่นอน; Data filter → only Peter; Mobile filter → Jack, Mint; onlyOver → Jack, Mint, Peter; URL carries `positionId`/`projectId`/`onlyOver`; after the certainty change Cindy `5/10` reads `2.5/5` in แน่นอน without reload |
| W3 ⟲ `F3` | FR-1005 · manager | click Peter `5/10`; Esc; click again; click the task link | drawer title `th.workload.panel.title('Peter', '5/10')` lists "ย้าย pipeline ขึ้น BigQuery" `5.00` and status OVER; Esc closes and focus returns to the cell; the link navigates to `/projects/<DW>/plan?task=<id>` with the task panel open |
| W4 ⟲ `F2+F3` | MASK-2/3/4, FR-1008 404 · ivy | `/workload`; hover Mint `5/10`; open `/people/<Jack>/plan` and `/people/<Peter>/plan` | rows only Cindy, Ivy, Mint; tooltip lists `th.masking.otherProjects 5.00` and no project name; the captured `/api/workload` body contains none of `Mobile App Revamp`, `พัฒนา front-end`, `Data Warehouse`, Jack's/Peter's ids; both person URLs answer **404** (response status) and render the not-found page |
| W5 ⟲ `F2+F3` | FR-1007, X31 · manager, ivy, mint, peter | read the badge as each viewer; as peter open `/calendar?month=2026-10`, delete the 5–6 ต.ค. leave (undo toast not clicked), then look at the sidebar | badge `3` (manager), `1` (ivy), `2` (mint), `3` (peter), each with label `th.workload.badge.label(n)`; after peter's delete the badge reads `2` without reload |
| W6 ⟲ | FR-1008, MASK-4 · cindy | `/people/<Peter>/plan`; read header + grid; capture `/api/grid/person` | header `Peter`, position `Data`, schedule `th.people.schedule.perDay('จ–ศ', '1.00')`; grid has **only** the masked row `m:<peter>` with `W:2026-09-28 = 5.0`, `W:2026-10-19 = 2.5`, no project row, no "+ เพิ่มงาน…"; footer `W:2026-09-28` load `5.0`; body without `Data Warehouse`, `ย้าย pipeline ขึ้น BigQuery`, `Store Analytics Dashboard`, `ทำ dashboard ผู้บริหาร` |
| W7 ⟲ | AC-604 · jack | Mobile tasks tab: quick add "งานร่วม AC-604"; assign Jack + Mint; panel → วางแผน Jack 3 days 2026-11-16..2026-11-20 → apply; วางแผน Mint 2 days same range → apply; open `/people/<Jack>/plan` then `/people/<Mint>/plan` | Jack: merged row "งานร่วม AC-604" `W:2026-11-16 = 3.0` under the Mobile project row, footer load `5.5` with ⚠ (RISK: Store 2.5 tentative); Mint: the row reads `2.0`, footer `2.0`; each grid shows only its own number |
| W8 ⟲ | FR-906, M7-D15, person-grid edit · ivy, then peter | ivy: `/people/<Ivy>/plan`, type `3` on the CRM "ตั้งค่า automation" `W:2026-10-19` cell, Enter, `waitSaved`; open `/workload`; peter: `/calendar` → แจ้งลา 2026-10-05..2026-10-06 ลาพักร้อน → save | Ivy's workload cell `19/10` reads `3/5` without reload (`invalidateLoad`); Peter's impact panel shows the capacity line (M5) **and** `th.overload.impact.line(formatThaiDate('2026-10-05'), 'ล้น', th.overload.excess('2.00'), th.overload.cause.CAPACITY)` with a link to `/people/<peter>/plan?week=2026-10-05` |
| W9 ⟲ | FR-1009, FR-667, X22 · ivy | `/my`; tick "ทำ UAT + คู่มือหน้าร้าน"; click "เลิกทำ"; switch view บอร์ด; viewport 390×844 back to ตามสัปดาห์ | sections สัปดาห์นี้ [ทำ UAT + คู่มือหน้าร้าน `2.50 วัน`], หลังจากนั้น [ตั้งค่า automation `th.my.fromWeek('12/10')`]; sidebar "งานของฉัน" `1` → `0` after tick → `1` after undo; board view renders `TaskBoard` cards of Ivy's tasks; no horizontal page scroll at 390 px |
| W10 ⟲ `F4` | FR-667 person tab, วันลา tab, MASK-5 · cindy, then ivy, then peter | cindy: `/people/<Ivy>/tasks`, toggle บอร์ด; ivy: `/people/<Cindy>/leave`; peter (LEAD → sees Ivy's totals): `/people/<Ivy>/tasks` | cindy sees Ivy's two tasks ("ทำ UAT + คู่มือหน้าร้าน", "ตั้งค่า automation") via `TaskList`, บอร์ด shows `TaskBoard`; ivy sees Cindy's entry `ลา` 12–14 ต.ค. with no type and no edit button; peter's view of Ivy's tasks tab is empty with `th.people.tasks.hiddenHint` (POS/CRM hidden) and the `/api/tasks` body has no POS/CRM names |
| W11 ⟲ | FR-409, FR-303 · cindy, then manager | cindy: POS overview; `/clients/<Coral>`; manager: `/clients/<Coral>` | POS load section: Cindy `2.50`, Ivy `3.75`, Mint `11.25` (12-week sums), 12 bars, the `14/12` bar labelled with committed `0.00`; Coral as cindy `th.workload.clientLoad.total('17.50')` + `visibleOnly`; as manager `33.75` |

### 7.4 Golden, perf and manual checks

- Golden: S5.3 (F1–F4, F2+F3, colour counts, badges, parity, FR-906) and S5.2 golden masking pairs — r8 numbers only, never re-typed from SPEC prose.
- Perf: S2.12 (100 people × 12 weeks < 1 600 ms, badge < 800 ms, logged); full §9 measurement in M11 against `seed:perf`.
- Manual: dark mode — workload tones, tentative palette and hatched bars readable (token contrast test from M0/X51 still green); screen reader spot check (VoiceOver) — a workload cell reads name, week, load, capacity and the status sentence; keyboard-only: Tab into the table, arrows, Enter opens the panel, Esc returns; the badge number is announced; `/people/[id]` at 1280 px and on a tablet.

---

## 8. Definition of done

- [ ] SPEC §12 M9 delivered: `overload.ts` (BR-41, excess, `viewTone`, `worsened`); §4.10 FR-1001…1009 complete; `GET /api/grid/person` + `GET /api/workload` with masking; FR-906 overload part; FR-409 load part (and FR-303 load part per X15); FR-667 person tab + `/my` views (X77).
- [ ] Golden F2, F3, F4 (and F1 cells/no-overload, F2+F3) pass through the workload service **and** route; badge per viewer matches r8; person grid parity holds.
- [ ] Masking §11.2: every case in S5.2 green (world + 15 golden pairs + 5 invisible pairs + M8 milestone names); `th.masking.otherProjects` built only in `services/masking.ts`.
- [ ] AC-604 verified on `/people/Jack` and `/people/Mint` (int + e2e W7).
- [ ] e2e m0 … m9 all green (older specs updated per S6.3).
- [ ] `pnpm check` green (domain coverage ≥ 95 %); `pnpm db:generate` → "No schema changes"; no new dependency, action, table or preference key (M9-D24).
- [ ] Authz rows exist for **every** new route (§7.2) incl. AL-PERSON with its audit assertion; AZ-2 coverage meta-test green.
- [ ] Every new `allocations` query has a `week_start` range; integer cd only (`allNumbersInteger`); no JS `Date` on plan dates; no Thai outside `src/i18n`; no `localStorage`; no confirm dialog; every coloured state has a glyph/number/text.
- [ ] `invalidateLoad` reaches workload, badge, person grid, `/people`, overview/client load and the sidebar count (unit test + e2e W2/W5/W8).
- [ ] No `any`, `@ts-ignore` or `eslint-disable` without a reason comment.
- [ ] `PROGRESS.md` updated (§10); commit + tag done.

---

## 9. Risks and gotchas

| # | Risk / pitfall | Mitigation (step) |
|---|---|---|
| R1 | Masking leak via ids (project/task/assignment), milestone names, status names or leave types in workload, cell, person grid or impact bodies | masking only in `services/masking.ts` (S2.1/S2.11); hidden projects never queried for names (S2.5 partitions **before** loading task data); `containsAny` leak tests with distinctive world strings and the 15 golden pairs (S5.2) |
| R2 | Person grid queries hidden projects' task trees "just to sum" | hidden load comes only from `loadByUserProjectWeek` numbers (S2.5); unit test on `assemblePersonGrid` asserts no hidden task row |
| R3 | RISK cells look identical to OVER in the ทั้งหมด view (r8 G7) | glyph from BR-40 always (🔴 vs ⚠ + text), colour by view (M9-D6); tests assert the level text, not only the colour (S4.3, S5.3) |
| R4 | Excess computed from total for OVER (r8 §4.8 BOTH case gives 225 instead of 100) | `overloadExcess` per X67 with the BOTH/OVER vector (S1.1) |
| R5 | Badge stale because the layout doesn't re-render on navigation (r6b M9-07) | client `WorkloadBadge` + `invalidateLoad` + refetch on focus (S4.6); e2e W5 |
| R6 | Sidebar "งานของฉัน" count stale after grid edits (now plan-dependent) | `invalidateLoad` includes `qk.sidebar()`; grid save success invalidates it too (S0.7, S3.7) |
| R7 | Widening `GridRow`/`context` unions breaks M6/M7/M8 exhaustive code at G0 | S0.3 minimal guards in the flagged files, listed in the S0 report |
| R8 | Float drift in tones at the 0.8 boundary | integer bands (`5·load ≥ 4·cap`) from M7's `loadTone`; vectors `{400/500}` and `{399/500}` (S1.2) |
| R9 | `toFixed` rounding in compact cell text ("0.35" → "0.3") | `compactDays` builds on M6's integer `formatCd` (S1.3) |
| R10 | Workload population differs from home/team utilisation (r8 G8) | one population function (M9-D3) exported for M10; documented in §10 forward notes |
| R11 | Deactivated users show "เพราะลา/วันหยุด" | UI relabel `DEACTIVATED` (M9-D7) without changing X64's `standard` |
| R12 | Project filter with an invisible project id leaks existence | `requireProject(view)` → 404 (M9-D5), rows WL-PROJ-* |
| R13 | `/api/people/[userId]` dynamic segment shadows `/api/people/options` | static segments win in the App Router; both routes covered by rows (PEOPLE, M2's options row) |
| R14 | Workload response too large at 100 × 53 weeks | span ≤ 53 weeks, default 12; perf smoke (S2.12); cells only numbers |
| R15 | Grid edits from the person grid leave project grids stale | other-context grid prefix invalidated on save success (S3.7) |
| R16 | MyTasks shape change breaks M3 UI/tests mid-build | new `MyTaskBucketsResponse` type alongside the old one until the integrator deletes it (S0.3, §6) |
| R17 | FR-906 lines computed before the write (wrong capacity) | computed after the write, inside the same tx, from M5's before/after spans (S2.9); golden through `createTimeOff` (S5.3) |
| R18 | Older e2e break on new nav items, `/my` buckets and impact lines | S6.3 list; page objects |
| R19 | Sibling plans (m07/m08 reviewed in parallel) export slightly different names (`dayLoadsForProjects` signature, `MilestoneRow` prop surface) | S0.1 inventory uses the real export and records the difference; additive parameters only (S2.5, S3.6); never rename an M6–M8 export |
| R20 | Person-grid `TeamTasks` / `/my` views overwrite the page URL with M3 filter params | `syncUrl={false}` at every M9 call site (M3-D41), test in `TeamTasks.fixedUser.test.tsx` (S4.8) |

---

## 10. Close-out

**PROGRESS.md updates:**
- Milestone table: M9 ✅ with date, commit hash and tag `m9`.
- Decisions: copy §3.1 (X06, X09, X14, X15, X18, X22, X23, X28, X30, X31, X40–X47, X53, X57, X59, X64, X67, X74–X77 as applied) and §3.2 (M9-D1 … M9-D29).
- Deviations: none.
- Known issues / forward notes: **M10** reuses `services.workload.buildTable({ window: 8 weeks, userIds: <project members> })` for the `projectWorkload` embed (masking identical to `/api/workload`, AC-1303), `services.workload.personCells` for "ภาระของฉัน 8 สัปดาห์", `overloads` of `buildTable` over weeks `[weekStart(today), +2 w)` for the manager card, `MyTaskBucketsResponse` THIS_WEEK for "งานของฉันสัปดาห์นี้", the M9-D3 population for team utilisation (r8 G8: 72.5 % F1 with 5 workers), `WorkloadCell`/`workloadCellText`/`viewTone` for block cells; **M11** full NFR-03 measurement with `seed:perf` (reuse `addSyntheticWorkload`), audit sweep finds no new M9 actions.

**Commit** (orchestrator, after G4):
```
feat(m9): team workload, person pages with masking, golden F2-F4

- domain: overload.ts BR-41 causes, excess (OVER committed-cap, RISK total-cap), overloadStatus, viewTone (BR-45 per view), worsened
- GET /api/workload (+ cell, badge): people x weeks by position, view toggle, filters, hover breakdown, side panel, รายการที่ล้น tab; sidebar ●N badge (X31)
- /people directory and /people/[id] (header, แผนงาน person grid with project rows + masked row, งาน tab reusing TeamTasks, วันลา tab)
- GET /api/grid/person/[userId]; week-level footer tones/glyphs in both grid contexts
- /my FR-1009 buckets + list/board views; sidebar count = this week (X22)
- FR-906 new-overload lines + allocations-on-leave line; FR-409 overview load; FR-303 client load
- AC-604 verified; golden F1-F4; masking leak tests (world + r8 pairs); authz rows WL-*, PG-*, PH-*, PT-*, PJ-LOAD-*, CL-LOAD-*, AL-PERSON; e2e m9-workload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
**Tag:** `git tag m9`.
