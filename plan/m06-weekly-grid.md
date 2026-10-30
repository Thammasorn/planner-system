# M6 — Weekly planning grid

> Depends on: M5 ✅ · SPEC: §4.8 (week level), FR-612, FR-643 grid part, §5.1, §5.3 (BR-20b, BR-21/21a, BR-25, BR-26, BR-27 + the WEEK→DAY split BR-25 needs), §5.5, §5.7, §6.2 (`allocations`), §6.3, §6.5, §7.4, §7.5, §8.3, §8.6, §8.8, §8.9, §9 (grid budgets), §11.1, §11.3 F1, §12 M6 ·
> Owner-visible result: every project gets a **แผนงาน** tab with an Excel-like weekly grid — type, range-fill, `f`/`h`, paste from Excel, fill handle, `Cmd+←/→`, Delete, undo/redo, sticky footer (ภาระรวม · Capacity · %), leave/holiday marks, tentative rows, the ⛔ blocker badge — plus **"วางแผน N วัน"** per assignee in the task panel, real "ปลดภาระ X วัน" numbers in the completion and archive toasts, and golden F1 numbers matching the old Excel.

---

## 1. Goal and scope

### 1.1 In scope

Legend — "Where": stream.step in §5. "Test": `unit` = Vitest node, `ui` = Vitest jsdom, `int` = Vitest + Postgres, `authz` = row in `tests/authz/rows/allocations.ts` (§7.2), `mask` = `tests/authz/masking.int.test.ts`, `golden` = `tests/golden/golden.int.test.ts`, `e2e` = scenario id in `e2e/m6-grid.spec.ts` (§7.3).

| ID | What M6 delivers | Where | Test |
|---|---|---|---|
| FR-801 | Continuous timeline: fixed column space today ± 156 weeks (X65), 8-week chunk queries loaded as you scroll, "วันนี้" jumps back | S3.2, S3.5, S3.9 | unit `columns.test.ts` · e2e G1 |
| FR-802 (week part) | Week zoom only; the toolbar shows **[สัปดาห์]** pressed; day zoom → M7 | S3.9 | e2e G1 |
| FR-804 | Unit toggle **วัน · สัดส่วน** in preference `grid.unit`; fraction = cd ÷ the cell's own week capacity, 2 decimals; cap 0 → days | S1.1, S3.4, S3.9 | unit `units.test.ts` · e2e G4 |
| FR-805 | Task rows read-only sums (parents = Σ leaves); assignee rows editable; single-assignee leaf merged into its task row (§8.3) | S2.2, S3.3 | unit `rows.test.ts`, `aggregate.test.ts` · int · e2e G2 |
| FR-806 | Sticky footer: ภาระรวม (names) · Capacity · % of the people in the grid; switch "รวมงานโปรเจคอื่นของคนเหล่านี้" (X29) | S2.2, S3.7 | unit `aggregate.test.ts` · int `grid.int.test.ts` · golden · e2e G8 |
| FR-807 (week cells) | Leave = diagonal stripes + "ลา" icon + masked tooltip on that person's week cells; holidays grey + 🎌 + name in the header tooltip; cap 0 = full stripes (day cells → M7) | S2.2, S3.4, S3.6 | ui `GridCell.test.tsx` · mask · e2e G3 |
| FR-808 | Tentative rows: amber left bar + faded number token + ◐ (never colour alone) | S3.4 | ui `GridCell.test.tsx` |
| FR-809 | Load view **ทั้งหมด · เฉพาะที่แน่นอน · ส่วนที่ยังไม่แน่นอน** (`load.view`); rows stay editable, excluded only from sums | S1.2, S3.7, S3.9 | unit `aggregate.test.ts` · e2e G8 |
| §4.8 การกรอก (all rows) | Type to start editing, Enter/Tab, Esc, arrows, Shift+arrows / mouse drag, range + type + Enter, `f`, `h`, fill handle, Cmd+C/Cmd+V TSV, Cmd+←/→ — per X65 | S3.8, S3.10–S3.13 | unit `keymap.test.ts`, `paste.test.ts`, `fill.test.ts`, `shift.test.ts`, `tsv.test.ts` · e2e G2–G6 |
| §4.8 การลบ (all rows) | Delete/Backspace clears; Delete on a fully selected task row deletes the task (M3 `deleteTaskTree` + undo toast); × on an assignee chip unassigns (M3 `unassign` + undo toast); Cmd+Z / Cmd+Shift+Z (50 steps) | S3.10, S3.14 | e2e G6, G7 |
| AC-801 | 6 Cindy cells (CRM grid, weeks 10-05…11-09) → type `3` → Enter → all 3.0 (r8 option C) | S3.10 | e2e G2 |
| AC-802 | `f` on Peter's DW cell of week 2026-10-05 under F3 → 3.0, not 5.0 (`h` → 1.5) | S1.1, S3.10 | unit · e2e G3 |
| AC-803 | Paste a 2×4 TSV block (0.5 / 1 / 0.75 / 0.25) in fraction mode into POS Cindy + Ivy, weeks 11-09…11-30 → 250/500/375/125 … | S3.11 | unit `paste.test.ts` · e2e G4 |
| AC-805 | Three edits → Cmd+Z ×3 → values return in reverse order → reload shows the undone values | S3.14 | unit `snapshots.test.ts` · e2e G5 |
| AC-603 (plans clause, X13) | Delete a parent with 3 children whose child has a plan → undo → the plan is back | S2.9 | int `tasks.int.test.ts › AC-603` (extended) · e2e G9 |
| AC-604 (M6 part, X14) | Jack + Mint on one task → "วางแผน" Jack 3 days, Mint 2 days → separate rows and correct footer | S2.5, S4.3 | int `plan-range.int.test.ts › AC-604` · e2e G10 |
| AC-203 (grid clause, X12 — closes AC-203) | A deactivated assignee's old plans stay in the grid with the "ปิดใช้งาน" label; capacity 0 from `deactivated_on` | S2.2, S3.3 | int · e2e G11 |
| FR-612 | Task panel: "วางแผน" per assignee → N days + range → preview (dryRun) → apply → one undo entry | S2.5, S4.3 | int `plan-range.int.test.ts` · authz PR-* · e2e G9, G10 |
| FR-643 (grid part, X76) | Task rows carry `blockers: { open, total }`; rendered with M3's `BlockerBadge`, names in the tooltip from the project-tasks query | S0.4, S2.2, S3.3 | int `grid.int.test.ts › blockers` · ui · e2e G2 |
| FR-405 (grid part, X18) | Certainty / leave / status / assignment changes refresh the grid without reload (`invalidateLoad` covers `['grid']`) | S0.7, S4.5 | unit `invalidate.test.ts` · e2e G8 |
| FR-406 (X part, X17) | Archive toast appends "ปลดภาระ X วัน-คน ในอนาคต" (X = future counted load, BR-50 honoured) | S2.8, S4.4 | int `projects.int.test.ts › archive X` · e2e G12 |
| FR-408 (X15) | Project tab **แผนงาน** (`order: 1`) between ภาพรวม and งาน (also in the sidebar sub-links) | S4.1 | unit `project-tabs.test.ts` · e2e G1 |
| FR-610 / BR-31 (plans clause) | Moving assignments to a new child keeps their allocations (FK follows `task_assignments.task_id`) | S2.9 | int `tasks.int.test.ts › FR-610 plans` |
| FR-628 / BR-87 (load part) | Statuses other than `DONE` never change load; `WAITING` tasks still count | S2.2 | int `grid.int.test.ts › WAITING counts` |
| BR-01/02/03 | Integer cd end to end; `numeric(4,2)` ↔ cd only in `repo/allocations.ts`; API sends cd | S0.2, S2.1 | int `allocations.int.test.ts › numeric round trip` |
| BR-20 / BR-20a (week level) | WEEK weeks = one row; DAY weeks shown as their Σ with ⋯ and a 2-decimal day tooltip, read-only in M6 (X27) | S2.2, S3.4 | int · ui · e2e G6 |
| BR-20b | SPEC trigger + exclusion constraint (custom migration) + lock-first in every writer | S0.3, S2.3–S2.5 | int `schema.int.test.ts › allocations`, `tests/integration/allocations-race.int.test.ts` |
| BR-21 / BR-21a | `spreadWeek` with largest remainder over `dayCaps`, schedule fallback, Mon–Fri fallback (needed by BR-25 boundary weeks; display is M7) | S1.3 | unit `allocation.test.ts` + property |
| BR-25 | `planRange`: whole weeks → WEEK, boundary weeks → DAY (in-range days replaced only), clamp-and-spill (X65), N = 0 clears | S1.5, S2.5 | unit · int · e2e G9 |
| BR-26 | WEEK `0 < v ≤ 700`, DAY `0 < v ≤ 100`; 0/null deletes; > max rejected per cell | S0.5, S1.1, S1.4 | unit · int |
| BR-27 | Typed values round once to 25 cd, half-up, integer math | S1.1 | unit (vectors + property) |
| BR-35 / BR-36 (grid) | Task rows carry `certainty`, `certaintySource`, `certaintySourceName` from M3's `resolveCertainty` | S2.2 | int |
| BR-37 / §6.5 | `{ total, committed }` everywhere; §6.5 SQL `coalesce` parity with `effectiveCertainty` (X03) | S1.2, S2.1 | unit · int `allocations.int.test.ts › §6.5 parity` |
| BR-42 (M6 part) | Leave lowers capacity only, plans untouched — M6 extends M5's `time-off.int.test.ts › BR-42` with an `allocations` checksum | S2.9 | int |
| BR-44 | Archived/deleted projects excluded from `otherProjects` and future-load figures | S2.1 | int |
| BR-50 / BR-51 | `completed.ts`: weeks after `completed_week` not counted (cells faded + "ไม่นับภาระ"); uncompleting restores load; allocations never deleted | S1.6, S2.2, S3.4 | unit `completed.test.ts` · int |
| BR-52 (X19, X71) | `setStatus` returns `released: { cd, weeks }` for tasks newly entering `DONE`; **every** path (checkbox, `Mod+Enter`, bulk ติ๊กเสร็จ, chip/`S` menu, board drag, bulk status, FR-608 "ติ๊กทั้งหมด", `/my` checkbox, `/tasks` drag/chip) shows "ปลดภาระ X วัน ในอีก N สัปดาห์ · เลิกทำ" through one helper | S2.7, S4.2 | int `task-status.int.test.ts › BR-52` · ui `statusToast.test.ts` · e2e G12 |
| §7.4 GET grid | `GET /api/grid/project/[projectId]?from&to&includeOthers` (X65 params, default window −4/+12 weeks) | S0.6, S2.2 | int · authz GR-* |
| §7.4 saveAllocations | Batch `{ items[], onDayWeekConflict?, clientOpId }`, one tx, lock order, per-item authz, version check, audit per assignment, authoritative `results` (X65) | S0.5, S2.3–S2.4 | int `allocations.int.test.ts` · authz AL-* |
| §7.4 client | Debounce 400 ms, flush on blur/`pagehide`/`visibilitychange`/route change, optimistic overlay, rollback + "บันทึกไม่สำเร็จ · ลองใหม่", VERSION_CONFLICT toast | S3.6 | unit `save-queue.test.ts` · e2e G13, G14 |
| §7.5 | Undo/redo of grid edits = `saveAllocations` with week snapshots (latest version) | S3.14 | unit · e2e G5 |
| §8.3 | Toolbar `[สัปดาห์] ◀ [วันนี้] ▶ ภาระ: [ทั้งหมด▾] หน่วย: [วัน▾]`, merged rows, `+ คน` on hover/focus, legend, footer | S3.3, S3.7, S3.9 | ui · e2e |
| §8.6 grid keys / KEY-05 | Grid shortcuts in the `?` help (scope `grid`); `N` focuses the grid's "+ เพิ่มงาน…" row | S0.8, S3.8 | unit `shortcuts.test.ts` · e2e G7 |
| §8.8 | 1 decimal in the grid (integer half-up: 375 → "3.8", 35 → "0.4"), 2 in tooltips, 0 → blank | S1.1 | unit |
| §8.9 / A11Y-1/2a/2b | `role="grid"`, `aria-rowcount/colcount` = full virtual size, `aria-rowindex/colindex`, roving focus, keyboard-only AC-801/805, glyphs with text alternatives | S3.15 | ui `PlanGrid.test.tsx` · e2e G2, G5 |
| §9 grid budgets | 16 w × 200 rows: response < 500 ms, render < 300 ms, edit → visible < 50 ms — smoke at 2× budget (M6-D22), full measurement M11 | S2.10, S6.4 | int `grid.perf.int.test.ts` · e2e G15 |
| §11.3 F1 | Golden F1 through the grid service **and** route: 19 500 / 11 625, per project, 57 `byUserWeek` cells, row totals, footer weeks | S5.3 | golden |
| §11.1 units/allocation/certainty/completed | Every row of the §11.1 table that M6 owns | S1 | unit (domain ≥ 95 %) |
| FR-1201 / X44 | One audit row per changed assignment per batch / per FR-612 apply, inside the tx (entity `allocation`) | S2.4, S2.5 | authz audit assertion · int |
| X11 (M6 part) | `seedGolden` writes the JSON's WEEK allocations (57 rows) | S0.10 | int `fixtures.int.test.ts` |

**§3.2 permission rows in scope** (PERM numbering = §3.2 table order; PERM-23 appended, X79):

| PERM | §3.2 row | M | L | Me | W | Rows (§7.2) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-06 | เห็นโปรเจค / เปิดโปรเจค (grid read, footer switch) | allow | allow | allow | 404 | GR-READ, GR-ARCH, GR-OTHERS, GR-DEFAULT, GR-MISSING, GR-BADID, GR-BADQ, GR-SPAN |
| PERM-12 | วางแผน (แก้ allocation) — `saveAllocations`, `planAssignmentRange` | allow | allow | allow | 404 | AL-SAVE, AL-CLEAR, AL-COLLAPSE, AL-DAYWEEK, AL-STALE, AL-MISSING, PR-PREVIEW, PR-APPLY, PR-UNREP |
| PERM-11 (BR-52 numbers) | ติ๊กเสร็จ / เปลี่ยนสถานะ — M3 rows unchanged; M6 asserts `released` in integration tests only | allow | allow | allow | 404 | (M3 T-COMPLETE, T-STATUS) |
| PERM-09 (FR-406 X) | Archive โปรเจค — M2 rows unchanged; `releasedCd` asserted in integration | allow | allow | 403 | 404 | (M2 PERM-09a) |

Archived project A (X42): every PERM-12 row → M/L/Me `403`, W `404` (AL-ARCH, AL-MIXED-ARCH, PR-ARCH); the grid read stays allowed (GR-ARCH). Enforced once in `requireProject` (M2-D02), called by S2.3/S2.5 before any allocation access; tested by S5.1.

### 1.2 Out of scope (do NOT build; target milestone)

| Item | Lands in |
|---|---|
| Day zoom, inline week expansion, derived dashed day values, editing day cells, BR-22 split on edit, BR-23 "↕ รวมเป็นรายสัปดาห์", BR-24 dialog / `NEEDS_CHOICE` / SCALE, `expand=`/`zoom=day` params, day-level overload glyphs and tones, `grid.zoom` preference | M7 (X27, X06) |
| `src/domain/overload.ts`: BR-40/45 levels and tones, any load colour in cells or footer | M7 (day level, X06) · M9 (week level, X67) |
| BR-41 causes, excess amounts, overload badge/list | M9 only |
| ◆ milestone row, `milestones` data, `lateForMilestone = true`, milestone field/filter | M8 (X28, X21) |
| Person grid `/people/[id]`, `masked` and `project` row kinds, `GET /api/grid/person/[userId]`, AC-604 verification on person pages | M9 (X14, PLAN §3.10) |
| FR-409 / FR-303 load figures, `/workload`, FR-906 overload lines and the "มีงาน X วันวางไว้ในวันที่ลา" line (m05's `allocationsOnTimeOffDays` → `TimeOffImpact.onTimeOffDays`) | M9 (X15, X23, M9-D18; M7-D15) |
| FR-1009 buckets on `/my` | M9 (M10 home only consumes them via FR-1101a) |
| Home load cards | M10 |
| `seed:demo` (A.2 composition), `seed:perf` at full scale, perf pass against §9 budgets | M11 (X69) |
| v2.1 extras: drag task bars, automatic spread from task dates, third BR-24 option, digit shortcuts `1/7/5/2`, `0` = clear, `Cmd+←/→` = shift the whole bar | never (r5 C10, C11, C29, M6-05) |
| Excel import/export (×500 rule), scenarios/what-if, time tracking, notifications | SPEC §13 / §1.4 |

### 1.3 Carried-in items (deferred to M6 by earlier milestones)

| From | Item | Ruling |
|---|---|---|
| M1 | `units.ts` formatting, parsing, fraction conversion (M1 shipped only `numericToCd`/`cdToNumeric`) | X02 |
| M1 | AC-203 grid clause: "ปิดใช้งาน" label on old plans (closes AC-203) | X12 |
| M1 | Preference keys `grid.unit`, `load.view` — added by their first consumer | X05, X59 |
| M2 | FR-406 "ปลดภาระ X วัน-คน ในอนาคต" in the archive toast | X17 |
| M2 | `qk`/`invalidateLoad` registration for grid queries; FR-405 e2e without reload | X18 |
| M2 | Project tab แผนงาน (`PROJECT_TABS` entry `order: 1`, between ภาพรวม 0 and งาน 2 — M2-D10 scale) | X15 |
| M3 | FR-612 "วางแผน" per assignee in the task panel | M3 §1.2 |
| M3 | BR-50/51/52, `completed.ts`, completion-toast numbers on every `DONE` path (`setStatus`) | X19, X71 |
| M3 | AC-603 plans clause (extend `tasks.int.test.ts › AC-603` and add an e2e) | X13 |
| M3 | ⛔ badge on grid task rows (`blockers: { open, total }`) | X76 |
| M3 | Grid "Delete on a whole task row" and × on grid chips reuse `deleteTaskTree` / `unassign` | M3 §1.2 |
| M3 | `N` in the grid (M3-D9) and the shortcut scope `grid` (M3 S0.11) | X07 |
| M3 | `certainty.ts` total/committed split + §6.5 SQL parity test | X03 |
| M5 | Grid consumes `services/capacity.ts#loadCapacity`/`loadCapacityInputs` and `maskTimeOff` for leave/holiday display (FR-807 week cells, `people[u].timeOff`), `f`/`h` capacity keys and footer capacity; extends `time-off.int.test.ts › BR-42` with an `allocations` checksum. m05 §1.2 also lists `allocationsOnTimeOffDays` for M6 — that FR-906 line ("มีงาน X วันวางไว้ในวันที่ลา") needs DAY rows on leave dates and is forwarded to **M9** (`TimeOffImpact.onTimeOffDays`, M9-D18; M7-D15), see §1.2 | M5 §1.2, §10 |
| PLAN | `allocations` + custom migration `allocations_week_day_guard`; `seedGolden` WEEK allocations; `makeAllocation`, world `'allocations'` | X10, X11, PLAN §4.3 |

---

## 2. Read first

- **SPEC:** §0–§3 (§3.2 PERM-06/11/12, §3.3 masking), §4.4 (FR-405, FR-406, FR-408), §4.6 (FR-607, FR-612, AC-603, AC-604) + §4.6.2 (FR-643), §4.8 (whole section incl. both tables and AC-801…805), §5.1, §5.2, §5.3 (BR-20…27, invariants, the `distribute` sample — **do not copy its float tie-break**), §5.5, §5.7, §5.10 (BR-80, BR-86, BR-87), §6.2 (`allocations`, `tasks.completed_week`), §6.3, §6.5, §7.3, §7.4, §7.5, §8.3, §8.6, §8.7, §8.8, §8.9, §9, §11.1, §11.3, §12 M6, Appendix A.1.
- **PLAN.md:** §1.2 (`@tanstack/react-virtual 3.14.13`), §1.3 (Next actions serialised, `refresh()`, Drizzle errors/`timestamptz`, BR-20b race, client libraries, Playwright clock), §1.4 **X02, X03, X10–X15, X17–X19, X27–X29, X40–X47, X49, X51, X53, X55–X59, X65, X71, X76**; §2.3 ownership; §3.4 (errors, `action()`, `route()`, authz, transactions, audit, clock); §3.5 (query keys `gridAll`/`gridChunk`, `invalidateLoad`); §3.6 (units, `distribute`, format); §3.7; §3.8; §3.9 (tokens, CSS Modules, `usePreferences` keys); **§3.10 (grid architecture — follow exactly)**; §4.
- **Previous plans (names reused verbatim):** `plan/m03-tasks.md` S0.5 (`SetTaskStatusResult`, `TaskDTO`, `ProjectTasksResponse`), S2.6 (`services/taskStatus.ts#setStatus`), S2.8, S3.1 (undo/toast matrix), S3.12, S3.16–S3.19; `plan/m05-calendar-capacity.md` S0.8 (`maskTimeOff`), S0.13/S2.5 (`loadCapacity`, `loadCapacityInputs`, `UserCapacity`), world `'timeOff'` (`w.users.coworker`); `plan/m02-clients-projects-authz.md` S2.3 (`PROJECT_TABS`), M2-D02; `plan/m01-auth-employees.md` S0.6–S0.7 (`AppError.extra`, `ActionFailure`); **`plan/m07-daily-resolution.md` §3 + §5.S0–S1** (names M7 expects from M6).
- **Research:** `plan/research/r4-client-testing.md` §4–§16, §37, §38, §41; snippets `plan/research/snippets/r4/client/components/grid/{VirtualGrid.tsx,useGridWindow.ts,useSaveAllocations.ts,grid-types.ts}`, `snippets/r4/client/lib/{query-client,action-result}.ts`; `r6b-gaps-m6-m11.md` §1, §2 (E8–E13), §3.1 M6-01…M6-31, §4.1–§4.4, §4.7, §4.8, §5 "M6"; `r5-v21-mining.md` §2 M6 (M6-01…M6-33), §3.1, §3.4–§3.6, §4.1–§4.5, §8 C10–C16, C29; `r8-golden.md` §2.1–§2.2, §3.3 G3–G5/G10–G12, §4.5, §6.2, §6.3, §6.8; `r2-auth-db.md` §9 (trigger SQL), §12 (`allocations` Drizzle table), T6–T9-fix and finding 3.
- **docs:** `docs/reference/golden-fixtures.json` (`tasks[].allocationsCd`, `expected.F1`).

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings

| ID | What it means in M6 |
|---|---|
| X02 | `units.ts` M6 part: `formatCd`, `parseCellInput`, fraction conversions, `fullCapacityCd`/`halfCapacityCd`; M1's `numericToCd`/`cdToNumeric` are reused unchanged. |
| X03 | `certainty.ts` gains `splitLoad`/`addLoad`/`viewLoad`; S2.1 adds the §6.5 `coalesce` parity integration test. |
| X10 | Tables: `allocations` (+ pgEnum `granularity`) and the custom migration `allocations_week_day_guard` (SPEC trigger + exclusion constraint, M6-D5). |
| X11 | `seedGolden` M6 part: the 57 WEEK rows from `tasks[].allocationsCd` (M6-D23). |
| X12 | AC-203 grid clause closes here: deactivated assignees keep their rows with the "ปิดใช้งาน" label. |
| X13 | AC-603: M3's int test and an M6 e2e assert allocations come back with the restored tree. |
| X14 | AC-604: M6 plans Jack/Mint through FR-612 and checks separate rows; M9 checks `/people/[id]`. |
| X15 | Tab แผนงาน appears now, between ภาพรวม and งาน; never a placeholder. |
| X17 | `archiveProject` returns `releasedCd`; the toast appends the X text when > 0. |
| X18 | `qk.gridAll`/`qk.gridChunk` added; `invalidateLoad` already covers the `['grid']` prefix — M6 proves it and adds it to time-off mutations (S4.5). |
| X19 | `completed.ts` (BR-50/51/52) lands here; the completion toast gets numbers. |
| X27 | DAY-resolution weeks (written by BR-25 boundaries) render as read-only totals with ⋯ + tooltip; every edit gesture skips them with the toast "สัปดาห์นี้มีแผนรายวัน". M6's domain includes BR-21 spreading and clamp-and-spill. No BR-22/23/24 editing. |
| X28 | `milestones: []`, task rows `milestoneId: null`, `lateForMilestone: false`. |
| X29 | Footer switch "รวมงานโปรเจคอื่นของคนเหล่านี้" → `people[u].otherProjects` with per-period `{ total, committed }` only. |
| X40 | `pnpm check` includes integration; `pnpm db:up` first. |
| X41 | Invisible → 404; archived writes → 403; bad query → 400 (parse precedes authz and reveals nothing). |
| X42 | Archived project: grid readable with banner, every allocation write `FORBIDDEN`. |
| X43 | Grid people are co-members of the viewer (BR-60) → visible; leave labels masked via `canSeeLeaveDetails`. |
| X44 | One audit row per changed assignment, same tx; the matrix asserts it for single-item allow rows. |
| X45 | Services take `today` as a parameter (`serverToday()` in the action/route); integration/e2e pin `APP_NOW`. |
| X46 | E2E on the production build with `resetDb`, `loginAs`, `page.clock.setFixedTime`, page objects; S6.3 updates older specs. |
| X47 | `z.uuid()`, `z.iso.date()`, Thai only via `th.*`, no `revalidateTag`; `saveAllocations` never calls `refresh()`. |
| X49 | Grid keys match `e.code` first (`KeyF`, `KeyH`, `Digit*`, `Numpad*`, `Period`, `Comma`, arrows with `metaKey \|\| ctrlKey`). |
| X51 | Tentative bar and faded numbers use the corrected tokens (`--tentative-fg #8F5C00`, faded `#5B6878`), never opacity. |
| X53 | No `localStorage`; unit and view live in `user_preferences`; ids come from the server. |
| X55/X56 | Integration DB per run; services/repo do not import `server-only`. |
| X57 | The plan page relies on the M2 project layout's authz (before any Suspense); no `loading.tsx`. |
| X59 | S0 creates **no runtime files under `src/domain/**`** (signatures in §5.S1); factories use plain Drizzle; preference keys added by their first consumer. |
| X65 | Followed verbatim: batch save (lock `ORDER BY ta.id FOR UPDATE OF ta`, per-item authz, VERSION_CONFLICT with current states, audit per assignment); `W:`/`D:` keys; `{ total, committed }` aggregates; fraction base; exact parse + single 25-cd rounding; `f` exact, `h` rounded; skip cap-0/read-only/DAY-week cells; paste tiling; fill copies; shift within same-kind columns; ±156-week timeline + 8-week chunks; default API window −4/+12; `to` exclusive; ≤ 53 weeks; row "รวม" over the timeline bound; certainty view keeps rows editable; footer population; clamp-and-spill on every DAY write; undo = week snapshots; FR-612 dryRun/apply semantics. |
| X71 | `setStatus` is the only completion path; M6 extends its result (`released`) instead of adding a second path. |
| X76 | Grid task rows carry `blockers: { open, total }`; `completed.ts` keys off `completed_on` only (BR-80 → BR-50). |
| X07 | Grid shortcuts registered in `src/lib/shortcuts.ts` (scope `grid`). |
| X80–X93, X96 (2026-10-30 contracts) | X82 `qk.gridAll`/`gridChunk` + `invalidateAfterGridSave` as the post-save extension point (S3.6); X83 `getJson` (S3.2); X84 tab แผนงาน = 1 (S4.1); **X85 grid contract** (columns, `HEADER_ROWS`/`FOOTER_ROWS`, row keys/test ids, `GridPeriod.date`, `VERSION_CONFLICT { current }`, `DAY_WEEK` M6-only, `UNREPRESENTABLE`, COLLAPSE before the Σ no-op — S0.4, S1.4, S3.1–S3.3); X86 23P01 on `allocations_one_resolution_per_week` → `INTERNAL`, `ActionFailure.extra`, malformed route id → 404 (S0.7, S2.2, S2.4); X87 `repo.assignments.listActiveForProject` + `version`, `repo.tasks.listLiveWithBlockerCounts` (M6-D36); X90/X96 `save`/`planRange` take `today` and audit in the service (S2.4); X91 rows file registered in `tests/authz/rows/index.ts` (S5.1); X92 `addSyntheticGridProject` writes no audit rows (S0.10); X93 audit entity `allocation` (M6-D29). |

### 3.2 New milestone decisions (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M6-D1 | §12 M6, PLAN §5 | Streams refined from the skeleton: tests split into **S5** (authz rows, masking, golden, race/integration; depends only on S0) and **S6** (e2e + page objects + older specs). S0 ships a typed **stub `PlanGrid`** so S4 can build the page while S3 builds the grid. Service integration tests are written test-first by S2 inside `src/server/**` (M3-D1 precedent). | Ownership by path (PLAN §2.3); maximal parallelism. |
| M6-D2 | §7.4, X28, X65 | `GridResponse` is a superset of SPEC §7.4: `context` (`kind`, `id`, `name`, `archived`, `canEdit`), `window` (`from`, `to`, `expand: []`, `zoom: 'week'`, `includeOthers`), `today`, `periods` keyed `W:`, `rows` (flat, depth-first by `position COLLATE "C"`, then `id`), `milestones: []`, `people`, `holidays`. Task rows add `certaintySourceName`, `completedWeek`, `assigneeCount`, `hasChildren`, `blockers` (X76); assignee rows add `editable` and `rowTotal`; `people[u]` adds `name` and `active`. Row kinds `masked`/`project` arrive in M9. | One stable contract M7–M9 extend (X28). |
| M6-D3 | §7.4, X65 | `saveAllocations` result = `{ results: SaveItemResult[]; warnings }` where `SaveItemResult = { taskAssignmentId, version, weeks: Record<ISODate, WeekState>, rowTotal }` for every week the item touched. `VERSION_CONFLICT` carries **`current: SaveItemResult[]`** (SPEC's field name, made per item). An item whose every week is a no-op is skipped (no version bump, no audit). Writes use **replace-week**: `DELETE` every row of a touched (assignment, week), then `INSERT` the new rows. `clientOpId` is stored in the audit `after` only (no dedupe). One retry on `40P01`. | SPEC-compatible; DELETE-before-INSERT satisfies trigger + constraint for every transition. |
| M6-D4 | X27, BR-24, §7.4 | M6 implements the per-(item, week) table as `planWeek` (M7's name and types) **restricted to what M6 can produce**: WEEK edits on null/WEEK weeks; on a DAY week, WEEK `0`/`null` deletes the week, `COLLAPSE` writes WEEK (checked **before** the Σ no-op, so BR-23 "รวมเป็นรายสัปดาห์" with x = Σ days still converts — M7-D2), otherwise WEEK = Σ days is a no-op; DAY changes set days on null/DAY weeks and replace a WEEK week only when all 7 days are given (snapshot replay). Anything else — WEEK ≠ Σ on a DAY week without `COLLAPSE` (incl. `SCALE`), partial DAY edits on a WEEK week — returns the M6-only reason **`DAY_WEEK`** (`VALIDATION`, toast "สัปดาห์นี้มีแผนรายวัน"). M7 replaces those branches with `NEEDS_CHOICE`/`SCALE`/BR-22 and drops `DAY_WEEK`. | Literal X27; every M6 result equals what M7's full rules return for the same input (no behaviour change later). |
| M6-D5 | §6.3, BR-20b, r6b M6-11 | The custom migration holds the SPEC trigger **and** `allocations_one_resolution_per_week EXCLUDE USING gist (task_assignment_id WITH =, week_start WITH =, granularity WITH <>)` (verified on PG 17, r6b E9). `P0001 WEEK_DAY_CONFLICT` and `23P01` on this constraint map to `INTERNAL` (they must never fire because every writer locks first). | Race-proof backstop; SPEC trigger kept as mandated. |
| M6-D6 | BR-25, BR-26, FR-612 | **DEVIATION (SPEC-internal conflict BR-25 vs BR-26 + DDL `person_days <= 1`):** `planRange` distributes N over the in-range days by `dayCapacity` (largest remainder); weights fall back to schedule (BR-21a) → Mon–Fri equal → all in-range days equal; a week is **WHOLE** when the range covers every day of that week whose schedule > 0 (holidays/leave ignored; a week with no scheduled day is whole only when all 7 days are in range) → one WEEK row; other weeks are **BOUNDARY** → DAY rows where only in-range days are replaced: the out-of-range part is the current week (WEEK → `spreadWeek`) clamp-and-spilled among out-of-range days only, the in-range part is clamp-and-spilled among in-range days only (X65 tiers). Anything that still exceeds 100 cd/day or a WEEK > 700 → `VALIDATION` reason `UNREPRESENTABLE` ("ช่วงวันสั้นเกินไป…"). N = 0 clears the range. N ≤ 37 100 cd; range ≤ 371 days. Weeks whose result equals the current plan are not rewritten. | Golden G3 (Ivy 4 d over Wed–Fri = 134/133/133) otherwise breaks the DB check; sums are preserved; days outside the range never change. Record under PROGRESS › Deviations. |
| M6-D7 | §8.3 "รวม", X65 | Assignee `rowTotal` = **counted** load (BR-50 applied) over the timeline bound `[weekStart(today) − 156 w, weekStart(today) + 157 w)`, as `{ total, committed }`; task "รวม" = Σ of its leaves' `rowTotal` (client). Shown in a sticky right column "รวม". | Matches the §8.3 mock (18.8); satisfies the `week_start` rule (E8: 4 ms). |
| M6-D8 | FR-806, r6b M6-19 | Footer people = distinct users with an active assignment on a live task of this project (deactivated included); **ภาระรวม** = Σ counted assignee cells (BR-50, view applied) + `otherProjects` when the switch is on; **Capacity** = Σ `people[u].capacity`; **%** = `floor((200·load + cap) / (2·cap))` (integer half-up) or "—" when cap = 0; all footer values in days regardless of the unit. The switch state is in memory (default off). | Simplest reading of §8.3; integer math (BR-01). |
| M6-D9 | FR-804, r6b M6-04, G4 | Fraction unit: an assignee/merged cell shows `cd ÷ people[u].capacity[W:week]` with 2 decimals (integer half-up); cap 0 → shown and parsed as days with the tooltip `th.grid.cell.noCapacity`; task rows with ≥ 2 assignees, parent rows and the footer always show days. Tooltip "0.75 × 4.00 วันทำการ = 3.00 วัน". The ×500 rule is import-only (Phase 2). | X65; r6b M6-04. |
| M6-D10 | BR-26, BR-27, §11.1 | `parseCellInput` accepts optional spaces, Thai digits ๐–๙, `.` or `,` as the decimal separator (`,5`, `1,5`), ≤ 3 integer and ≤ 4 decimal digits, a trailing `%` in fraction mode, and `f`/`h` (ASCII or the Kedmanee keys `ด`/`้`); rounds once to 25 cd half-up in integers; `''`/`0` → clear; > max → `invalid MAX` ("ใส่ได้ไม่เกิน 7 วันต่อสัปดาห์"); negative/other → `invalid`. `f` = exact capacity (never rounded), `h` = `25·floor((2·cap+50)/100)`; both skip cap-0 cells. | X65, r6b M6-05/06. |
| M6-D11 | §4.8, X27, r6b M6-07/08/24 | Read-only targets (typing shows a hint, paste/fill **skip**, shift **cancels**): task rows with ≥ 2 assignees, parent rows, unassigned leaves (hint `needAssignee`), every cell of an archived project (banner), DAY weeks (toast `dayWeekReadOnly`), and every cell when `context.canEdit` is false. Completed tasks stay editable (their later weeks are faded and not counted). Deactivated assignees stay editable. | P4: plans stay correctable; one rule set for all gestures. |
| M6-D12 | BR-50, FR-607, r5 M6-27 | Completed tasks follow M3's `tasks.showCompleted` preference (shared key, no new one): hidden when off; when on, struck through with week cells after `completedWeek` faded + tooltip "ไม่นับภาระ (งานเสร็จแล้ว)" and excluded from task totals, `rowTotal` and the footer. A parent that is completed while its children are open does not stop the children counting (BR-50 uses each leaf's own `completed_week`). | SPEC §6.5 semantics. |
| M6-D13 | §7.5, AC-805, r6b M6-13 | One undo entry per gesture (commit, range fill, `f`/`h`, paste, fill handle, shift, range clear, FR-612 apply) holding `WeekSnapshot`s before/after; undo/redo flush the queue, apply the snapshot optimistically and send it as its own batch (`onDayWeekConflict: 'COLLAPSE'`) using the latest known versions. Grid value edits push **no toast** (Cmd+Z only); FR-612 apply, task delete and unassign push toasts. When a VERSION_CONFLICT hits an assignment, entries holding older snapshots of it become stale: their undo/redo does nothing but toast `th.grid.toast.undoStale` (no change to M1's `UndoProvider` API). | Exact undo; no API churn in M1. |
| M6-D14 | §7.4, X65 | One per-tab **version registry** (`src/lib/grid/versions.ts`: `knownVersion(id)`, `rememberVersion(id, v)` keeping the max) shared by the grid save hook and the FR-612 dialog; `baseVersion` is read from it inside `mutationFn` at send time. | Grid and panel on the same page never conflict with each other. |
| M6-D15 | FR-801, X65, r6b M6-26 | Columns: fixed timeline `[weekStart(today) − 156 w, weekStart(today) + 157 w)` (313 week columns, 64 px; name column 260 px; "รวม" 72 px sticky right; rows 32 px). Chunks of 8 weeks aligned to the timeline start; the visible range ± 1 chunk is queried with `keepPreviousData`. On open the first visible column is `weekStart(today) − 4 w`; "วันนี้" aligns this week right after the name column; ◀/▶ scroll by 4 weeks. No prepending, so `anchorTo` stays default. | Verified virtualizer behaviour (r4 §12–§14); simplest. |
| M6-D16 | BR-52, X19, X71 | `setStatus` computes `released` for tasks whose `completed_on` goes from null to today in that call: X = Σ allocations of their live assignments with `week_start > weekStart(today)` and `< weekStart(today) + 157 w`, N = number of distinct such weeks; `released = null` when X = 0 or for `revertTaskStatus`/uncomplete/DONE→DONE. The client builds every completion/status toast through `statusToastMessage(result, fallback)` → `th.tasks.toast.released(days, weeks)` when `released` is set. | BR-52 on every path with one service (X71). |
| M6-D17 | FR-406, X17 | `archiveProject` returns `{ changed, releasedCd }`, `releasedCd` = Σ counted load (BR-50) of the project's live tasks/assignments with `week_start ≥ weekStart(today)` and `< weekStart(today) + 157 w`, computed in the same tx **before** archiving; the toast uses `th.projects.toasts.archivedReleased(name, days)` when > 0, else M2's `archived(name)`. | X17 literal; bounded query. |
| M6-D18 | FR-612, FR-611 | The plan page supports `?task=<id>` with M3's `TaskPanel` beside the grid (same component, same `?task=` mechanics, M3-D17). In the grid a click on the name cell selects the row; the ↗ button (or double-click) opens the panel. FR-612's "วางแผน" button lives in `TaskPanel`'s assignee list for leaf tasks when `canEdit`. | FR-612 is a panel feature; reachable from the grid. |
| M6-D19 | §8.3, §4.8 การลบ, KEY-05 | Grid row affordances reuse M3 actions and undo entries: "+ เพิ่มงาน…" quick-add row at the bottom (`createTask`, root, name only; `N` focuses it), "+ คน" button on task rows (visible on hover **and** focus-within, keyboard reachable) → M3 `PersonPicker` → `assign`; × on an assignee name → `unassign` + toast; `Delete` while a task row is selected (row-header selection) → `deleteTaskTree` + toast. Delete on an assignee row selection does nothing. | No duplicate task logic; keyboard parity (§8.9). |
| M6-D20 | FR-807, X06, r6b M6-20 | Week cells get **no load colours** in M6. Leave: diagonal-stripe background + "ลา" glyph + tooltip `th.grid.cell.leave(label, range)` per overlapping entry (label masked); holiday weeks: header 🎌 + tooltip names, capacity reflects it; cap 0 week: full grey stripes. Today's week has the `--today` line. Past weeks stay editable. | Colours belong to M7/M9. |
| M6-D21 | FR-804, FR-809, PLAN §3.9 | New preference keys (X59): `'grid.unit': 'DAYS' \| 'FRACTION'` (default `DAYS`, D6) and `'load.view': 'ALL' \| 'COMMITTED' \| 'AT_RISK'` (default `ALL`; M9's workload reuses it). | Personal settings in `user_preferences` (X53). |
| M6-D22 | §9, R5 | Perf smoke: `addSyntheticGridProject(db, { tasks: 200, weeks: 16 })` builder; `grid.perf.int.test.ts` asserts `buildChunk` (8 weeks) < 1 000 ms and two chunks < 1 000 ms locally; e2e G15 asserts first paint < 600 ms and keydown → DOM < 100 ms (2× the §9 budgets, logged with the measured value). Full budgets are M11's. | Catch regressions without flaky CI. |
| M6-D23 | App. A.1, X11, X59 | `seedGolden` inserts the WEEK rows from `tasks[].allocationsCd` (`granularity` from the JSON, `cdToNumeric`) after the assignments, and writes one audit row per assignment (`actor null`, `th.audit.allocationsSeeded(n)`). Older seed tests that count audit rows are updated (S5.5). | Seeds audit like services (X59, M5-D2). |
| M6-D24 | X29, §6.5, BR-44 | `repo.allocations.loadByUserWeek(tx, { userIds, range, excludeProjectId? })` is the single §6.5 builder (live assignment, live task, project not deleted **and not archived**, BR-50 filter, certainty `coalesce`) returning `Map<userId, Record<ISODate, LoadPair>>`; the footer switch calls it with `excludeProjectId`. M9 reuses it. | One query, no forgotten filter (r5 M6-21). |
| M6-D25 | §7.4, M1 S0.7 | `ActionFailure` (client, M1) gains `readonly extra: Readonly<Record<string, unknown>>` = every field of the failed result except `ok`/`code`/`message`/`fieldErrors`, so `onError` can read `current` (and M7's `weeks`). | Needed by VERSION_CONFLICT handling; additive. |
| M6-D26 | r5 M6-06, M6-30 | Selection/editing state lives in a small external store (`src/components/grid/gridStore.ts`, `useSyncExternalStore`), keyed by `(rowKey, periodKey)`; cells subscribe to their own slice. No new state library. | Avoids re-rendering 3 000 cells per keystroke; no dependency. |
| M6-D27 | X49, R21 | Keyboard: navigation mode maps `Digit*`/`Numpad*`/`Period`/`Comma`/`Minus` to their ASCII character and starts editing with it; `KeyF`/`KeyH` apply `f`/`h` at once; inside the cell editor those codes are also rewritten to ASCII (`preventDefault` + insert) so the Kedmanee layout types digits; `e.isComposing` is ignored. `Cmd/Ctrl+←/→` always `preventDefault` (browser Back). | Thai keyboard layout (r5 M6-04). |
| M6-D28 | §4.8 Cmd+C/V, r5 M6-08/09 | Copy writes TSV of **exact** values in the current unit (2 decimals, empty cells empty, `\r\n` rows) via the DOM `copy` event (`clipboardData.setData('text/plain')`), falling back to `copyText()`; paste reads `text/plain` from the DOM `paste` event, drops one trailing newline, splits `\r?\n` / `\t`, strips Excel quotes; per-token parse against each target cell's capacity; invalid tokens are skipped and counted; one toast `pasted(n)` + `readOnlySkipped(k)` when k > 0. | Excel round trip (3.75 stays 3.75). |
| M6-D29 | FR-1201, PLAN §3.4.6 | Audit for plans: `entity: 'allocation'`, `entityId = taskAssignmentId`, `action: 'update'`, `projectId`, `summary = th.audit.allocationsSaved(person, task, weeks)` / `planRangeApplied(person, task, days, range)`, `before`/`after` = the touched weeks' `WeekState`s (+ `clientOpId`). | One row per assignment per batch (X65). |
| M6-D30 | CLAUDE.md deps | New dependency: `@tanstack/react-virtual 3.14.13` (SPEC §7.1 "TanStack Virtual", PLAN §1.2). Nothing else. | Required by the 2-axis grid. |
| M6-D31 | FR-643, X76 | The grid `BlockerBadge` tooltip resolves blocker names from `qk.projectTasks(projectId)` (already loaded for the panel, same project → no leak); the grid response itself carries counts only. | No second name source. |
| M6-D32 | §4.8 การกรอก, r6b M6-25 | Typing over a range then Enter fills the range and keeps it selected; Enter on a single cell commits and moves down, Tab/Shift+Tab right/left; Esc cancels an edit, a second Esc clears the selection and the next Tab leaves the grid (no keyboard trap); `Cmd+S` flushes the save queue (preventDefault). | Excel-like; §8.9. |
| M6-D33 | §8.9, PLAN §4.5, M7-D11 | Stable DOM contract for M7–M9 and the page objects: row keys `t:<taskId>` (task rows with ≠ 1 assignee and parents) and `a:<taskAssignmentId>` (assignee rows **and** merged single-assignee rows); cell test ids `cell-<rowKey>-<periodKey>`, the "รวม" cell `cell-<rowKey>-total`; footer `cell-footer-load-<periodKey>`, `cell-footer-capacity-<periodKey>`, `cell-footer-util-<periodKey>`; row headers carry `data-row-key`; the grid root carries `data-save-state`. A **plain click on a week header does nothing in M6** (reserved for M7's expand); **Shift+click** on a header selects that column over all editable rows. | M7/M9 page objects rely on them; M7-D11. |
| M6-D34 | X27, §7.4 | Server answer to a WEEK change on a DAY-resolution week (without `COLLAPSE`, or with `SCALE`) or a partial DAY edit on a WEEK week: the whole batch fails with **`VALIDATION`** (HTTP 400), `message = th.grid.errors.dayWeek`, `issues: [{ taskAssignmentId, period: <Monday>, reason: 'DAY_WEEK' }]`; nothing written, no version bump, no audit. Tested by `allocations.int.test.ts › X27` and authz row **AL-DAYWEEK** (400/400/400/404). M7 changes it to `409 NEEDS_CHOICE` (M7 S2.10/S4.5). | Named, testable code M7 can flip. |
| M6-D35 | FR-801, PLAN §3.10, G26 | The client column model uses **M7's shape from day one**: `GridColumn { key; kind: 'W' \| 'D'; role: 'week' \| 'day' \| 'weekTotal'; weekStart; date; width; offset }` and `buildColumns(weeks, expanded, dayDatesByWeek)`. M6 is the base (week columns only, `expanded` always empty); M7 adds the day/รวม branch without changing a signature. `chunksForRange` takes visible **weeks** (not column indexes) and ARIA row indexes derive from `HEADER_ROWS`/`FOOTER_ROWS` (M8's ◆ row, C27). The DTO `GridPeriod.kind` stays `'WEEK' \| 'DAY'` (server contract, S0.4) — the two unions are deliberately different types. | One column contract for M6–M9; no rename in M7. |
| M6-D36 | §7.4, M3-D39, C53 | The grid chunk reads tasks with M3's **`repo.tasks.listLiveWithBlockerCounts(tx, projectId)` → `TaskListRow`** (no assignees, unchanged) and assignments with M3's **`repo.assignments.listActiveForProject(tx, projectId)`**, which M6 extends additively with `version` (needed for `GridAssigneeRow.version`). No parallel `listActiveForTasks` loader. `repo.assignments.bumpVersions` is new. | One loader per concept (M3-D39); M3 DTOs untouched. |

DEVIATION summary: **M6-D6** only (record in `PROGRESS.md › Deviations`: what = clamp-and-spill of BR-25 boundary-week DAY values / reject when impossible; why = BR-26 + DDL forbid > 1.00 per day; instead = spill within the in-range days, sums preserved, warning shown).

---

## 4. Streams (machine-readable)

DAG: `S0 → {S1, S5}`; `S1 → {S2, S3, S4}`; `{S2, S3, S4, S5} → S6`. Concurrent sets: {S1, S5}, then {S2, S3, S4, S5}. S0 runs alone and may touch the M1–M5 files its steps name (`src/lib/action-result.ts`, `src/server/services/taskStatus.ts`, `src/server/actions/projects.ts`, `src/components/common/StatusGlyph.tsx`, preference schema); after G0 those files belong to the stream whose globs cover them. `src/i18n/th.ts` belongs to S0; afterwards S2 may add keys only in `errors`/`audit`, S3 only in `grid` and `units`, S4 only in `plan`, `tasks.toast`, `projects.toasts` (PLAN §2.3, Edit tool only). S1's domain files are read-only for S2–S4 (sequential).

```json
{ "milestone": 6,
  "streams": [
    { "id": "S0", "title": "Contracts: @tanstack/react-virtual, allocations schema + generated migration + custom allocations_week_day_guard (trigger + exclusion), grid/save/plan-range DTOs and zod, task/archive result extensions, query keys, preferences, ActionFailure.extra, action/route/service stubs, stub PlanGrid, StatusGlyph, i18n (grid, plan, units + keys), shortcut entries, seedGolden allocations + synthetic builder, factories makeAllocation + world 'allocations', e2e fixture helpers", "agent": "backend-engineer",
      "owns": ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "src/server/db/schema.ts", "src/server/db/schema.int.test.ts", "drizzle/**", "src/domain/types.ts", "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts", "src/lib/action-result.ts", "src/lib/shortcuts.ts", "src/lib/shortcuts.test.ts", "src/i18n/th.ts", "src/server/actions/allocations.ts", "src/server/actions/projects.ts", "src/server/services/index.ts", "src/server/services/grid.ts", "src/server/services/allocations.ts", "src/server/services/taskStatus.ts", "src/server/repo/allocations.ts", "src/app/api/grid/project/[projectId]/route.ts", "src/components/grid/PlanGrid.tsx", "src/components/common/StatusGlyph.tsx", "src/components/common/StatusGlyph.test.tsx", "scripts/lib/fixtures.ts", "scripts/lib/fixtures.int.test.ts", "tests/helpers/**", "e2e/fixtures.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain (TDD): units.ts format/parse/fraction/f/h, certainty.ts load split, allocation.ts distribute/spreadWeek/clampAndSpill/planWeek (M6 subset)/planRange (BR-25) + fast-check invariants, completed.ts BR-50/51/52", "agent": "domain-engineer",
      "owns": ["src/domain/units*.ts", "src/domain/certainty*.ts", "src/domain/allocation*.ts", "src/domain/completed*.ts"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Backend: repo/allocations (§6.5 builder, bounded queries), grid chunk service + route, batch save (lock, authz, versions, planWeek, replace-week, audit), planAssignmentRange, setStatus released load, archive X, AC-603/FR-610 plan assertions, BR-42 checksum, perf service test", "agent": "backend-engineer",
      "owns": ["src/server/**", "src/app/api/**", "scripts/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S2" },
    { "id": "S3", "title": "PlanGrid: pure grid model (columns, rows/merge, chunks, selection, keymap, TSV, paste, fill, shift, undo snapshots, cache ops, aggregates, versions, fetch) + VirtualGrid, chunk queries, save queue, every §4.8 interaction, undo, footer + switch, leave/holiday/tentative/completed rendering, toolbar, a11y", "agent": "grid-engineer",
      "owns": ["src/components/grid/**", "src/lib/grid/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Frontend: แผนงาน tab + plan page with TaskPanel, FR-612 PlanRangeDialog in the panel, BR-52 toast helper on every DONE path, archive X toast, FR-405/leave invalidation wiring", "agent": "frontend-engineer",
      "owns": ["src/app/(app)/projects/[id]/plan/**", "src/components/tasks/**", "src/components/projects/**", "src/components/calendar/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S4" },
    { "id": "S5", "title": "Authz matrix rows (test-first), masking grid cases, golden F1 via service + route, race/lock integration tests, older test updates", "agent": "test-engineer",
      "owns": ["tests/authz/**", "tests/golden/**", "tests/integration/**"],
      "dependsOn": ["S0"], "planSection": "5.S5" },
    { "id": "S6", "title": "E2E m6-grid spec, grid page object, update older specs", "agent": "test-engineer",
      "owns": ["e2e/**"],
      "dependsOn": ["S2", "S3", "S4", "S5"], "planSection": "5.S6" }
  ],
  "e2e": ["e2e/m6-grid.spec.ts"] }
```

---

## 5. Step-by-step

### 5.S0 — Contracts (backend-engineer · owns: see §4 S0)

Runs alone and ends at **G0** (`pnpm check` green with stubs). Nothing here implements behaviour except the schema, both migrations, zod, i18n, `StatusGlyph`, the registry entries, the seed rows, factories and the world.

**S0.1 Preflight + dependency (one batch).**
- `git status` clean on tag `m5`; `pnpm db:up`; `pnpm check` green; `pnpm db:generate` → "No schema changes".
- `pnpm add @tanstack/react-virtual@3.14.13` (M6-D30; no install script → `allowBuilds` unchanged; commit any `minimumReleaseAgeExclude` lines). `@tanstack/react-query` 5.104.0 is already present (M2) — check with `pnpm ls @tanstack/react-query @tanstack/react-virtual`.
- Inventory names this plan reuses and paste the result into the S0 report: `grep -n "^export" src/domain/{types,units,dates,capacity,certainty}.ts src/lib/contracts/tasks.ts src/lib/schemas/preferences.ts src/server/services/{capacity,masking,taskStatus}.ts src/server/repo/{tasks,task-assignments,index}.ts src/lib/{api,format,keys,query-keys,invalidate,action-result,shortcuts}.ts src/components/projects/project-tabs.ts tests/helpers/*.ts e2e/fixtures.ts e2e/pages/*.ts`. Expected: `numericToCd`, `cdToNumeric`, `weekStart`, `addDays`, `addWeeks`, `weekRange`, `daysOfWeek`, `isoWeekday`, `compareISO`, `diffDays`, `eachDay`, `capacityByDay`, `standardDayCd`, `loadCapacity`, `loadCapacityInputs`, `maskTimeOff`, `canSeeLeaveDetails`, `resolveCertainty`, `setStatus`, `listLiveWithBlockerCounts` + `TaskListRow`, `listActiveForProject`, `assignments` (repo barrel), `getJson`, `PROJECT_TABS`, `formatWeekHeader`, `formatThaiDate`, `invalidateLoad`, `qkPrefix`, `ActionFailure`, `unwrap`, `SHORTCUTS`, `makeTask`, `makeAssignment`, `createWorld`, `resetDb`. A missing one is created by the step that needs it and reported.

**S0.2 Domain types (`src/domain/types.ts`, type-only).** Ensure (add the missing ones; PLAN §3.6):
```ts
export type Granularity = 'WEEK' | 'DAY'
export type PeriodKey = `W:${ISODate}` | `D:${ISODate}`
export interface LoadPair { total: Cd; committed: Cd }            // atRisk = total − committed (BR-37)
export type LoadView = 'ALL' | 'COMMITTED' | 'AT_RISK'           // FR-809, preference load.view
export type CellUnit = 'DAYS' | 'FRACTION'                        // FR-804, preference grid.unit
```

**S0.3 Schema + migrations.**
- `src/server/db/schema.ts` (from `snippets/r2/v2/kt2/schema.ts` / r2 §12; PLAN §1.3 corrections):
  ```ts
  export const granularity = pgEnum('granularity', ['WEEK', 'DAY'])
  export const allocations = pgTable('allocations', {
    id: uuid('id').primaryKey().defaultRandom(),
    taskAssignmentId: uuid('task_assignment_id').notNull().references(() => taskAssignments.id, { onDelete: 'cascade' }),
    granularity: granularity('granularity').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),   // Monday for WEEK, the day for DAY
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    personDays: numeric('person_days', { precision: 4, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }, (t) => [
    unique('allocations_ta_granularity_period_key').on(t.taskAssignmentId, t.granularity, t.periodStart),
    check('allocations_person_days_check', sql`${t.personDays} > 0`),
    check('allocations_week_start_check', sql`extract(isodow from ${t.weekStart}) = 1`),
    check('allocations_period_check', sql`(${t.granularity} = 'WEEK' and ${t.periodStart} = ${t.weekStart} and ${t.personDays} <= 7) or
      (${t.granularity} = 'DAY' and ${t.periodStart} >= ${t.weekStart} and ${t.periodStart} < ${t.weekStart} + 7 and ${t.personDays} <= 1)`),
    index('allocations_week_start_ta_idx').on(t.weekStart, t.taskAssignmentId),
    index('allocations_ta_week_start_idx').on(t.taskAssignmentId, t.weekStart),
  ])
  ```
- `pnpm db:generate --name=allocations` → one journaled file; inspect it (enum, FK `ON DELETE cascade`, 3 checks, unique, 2 indexes); never hand-edit.
- **Then** `pnpm exec drizzle-kit generate --custom --name=allocations_week_day_guard` and fill it verbatim (M6-D5; SPEC §6.3 + r6b E9):
  ```sql
  CREATE OR REPLACE FUNCTION enforce_week_day_exclusivity() RETURNS trigger AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM allocations
      WHERE task_assignment_id = NEW.task_assignment_id
        AND week_start = NEW.week_start
        AND granularity <> NEW.granularity
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'WEEK_DAY_CONFLICT: assignment % week %', NEW.task_assignment_id, NEW.week_start
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql;
  --> statement-breakpoint
  CREATE TRIGGER trg_week_day_exclusivity BEFORE INSERT OR UPDATE ON allocations
    FOR EACH ROW EXECUTE FUNCTION enforce_week_day_exclusivity();
  --> statement-breakpoint
  ALTER TABLE "allocations" ADD CONSTRAINT "allocations_one_resolution_per_week"
    EXCLUDE USING gist ("task_assignment_id" WITH =, "week_start" WITH =, "granularity" WITH <>);
  ```
  (`btree_gist` exists since M0's `0000_extensions`.) `pnpm db:migrate`; `pnpm db:generate` again → "No schema changes"; `pnpm exec drizzle-kit check` OK.
- Tests first — extend `src/server/db/schema.int.test.ts › describe('allocations')` (r2 T6–T7): WEEK on a Monday ok; `week_start` Tuesday → `23514`; WEEK `period_start ≠ week_start` → `23514`; WEEK `7.25` → `23514`; DAY `1.25` → `23514`; DAY on the next Monday → `23514`; DAY on Sunday (`week_start + 6`) ok; `person_days 0` → `23514`; duplicate `(assignment, granularity, period_start)` → `23505`; DAY in a week that has WEEK (sequential) → `P0001` with message prefix `WEEK_DAY_CONFLICT` (the BEFORE ROW trigger fires before the constraint, so a same-transaction violation always reports **P0001**; `23P01` only appears for concurrent writers — S5.4); DELETE WEEK then INSERT DAY in one tx → ok; deleting the assignment cascades its rows; `pg_constraint` has `allocations_one_resolution_per_week` (contype `x`); `0.125` is stored as `0.13` (documented, harmless).
- Done-check: `pnpm vitest run --project integration src/server/db/schema.int.test.ts`.

**S0.4 DTOs (`src/lib/contracts/grid.ts`, new; names fixed for M7–M9).**
```ts
import type { Cd, Certainty, ISODate, LoadPair, PeriodKey } from '@/domain/types'
export type { LoadPair, PeriodKey }
export type GridZoom = 'WEEK' | 'DAY'                                   // client key; URL uses week|day (S3.2 gridChunkUrl, X85)
export interface GridPeriod { key: PeriodKey; kind: 'WEEK' | 'DAY'; weekStart: ISODate; date: ISODate }   // M7 adds expanded?: true
export interface AssigneeCell {
  cd: Cd                                       // W: week total (Σ days for DAY weeks)
  resolution: 'WEEK' | 'DAY'
  derived: boolean                             // always false in M6 (M7: derived day values)
  days?: Record<ISODate, Cd>                   // W: cells of DAY weeks only (tooltip, 2 decimals)
}
export interface WeekState { cd: Cd; resolution: 'WEEK' | 'DAY' | null; days?: Record<ISODate, Cd> }
export interface GridTimeOff { start: ISODate; end: ISODate; half: 'AM' | 'PM' | null; label: string }   // label masked (§3.3)
export interface GridPerson {
  name: string                                 // displayName (FR-210)
  active: boolean                              // false = deactivated ("ปิดใช้งาน")
  deactivatedOn: ISODate | null
  capacity: Partial<Record<PeriodKey, Cd>>     // W: keys in M6 (M7 adds D: keys); missing = 0
  standard: Partial<Record<PeriodKey, Cd>>
  timeOff: GridTimeOff[]
  otherProjects?: Partial<Record<PeriodKey, LoadPair>>   // only with includeOthers (X29); numbers only
}
export interface GridTaskRow {
  kind: 'task'; id: string; depth: 0 | 1 | 2; name: string; parentId: string | null; hasChildren: boolean
  certainty: Certainty; certaintySource: 'task' | 'ancestor' | 'project'; certaintySourceName: string | null
  completed: boolean; completedWeek: ISODate | null                       // BR-50 (M7 uses it at day level)
  milestoneId: string | null; lateForMilestone: boolean                   // null / false until M8 (X28)
  blockers: { open: number; total: number }                               // FR-643, BR-86 (X76)
  assigneeCount: number
  totals: Partial<Record<PeriodKey, LoadPair>>                            // counted load (BR-50), leaves summed for parents
}
export interface GridAssigneeRow {
  kind: 'assignee'; taskAssignmentId: string; taskId: string; userId: string; version: number
  editable: boolean                                                        // context.canEdit && task is a leaf
  rowTotal: LoadPair                                                       // M6-D7
  cells: Partial<Record<PeriodKey, AssigneeCell>>
}
export type GridRow = GridTaskRow | GridAssigneeRow                        // M9 adds 'masked' | 'project'
export interface GridMilestone { id: string; name: string; date: ISODate; projectId: string }   // [] in M6; M8 replaces it with `= MilestoneDTO` (adds status, late, lateTaskCount, progress — M8-D8, C19)
export interface GridResponse {
  context: { kind: 'project'; id: string; name: string; archived: boolean; canEdit: boolean }   // M8 adds canManage; M9 widens it to GridContextInfo ('project' | 'person', X85)
  window: { from: ISODate; to: ISODate; expand: ISODate[]; zoom: 'week' | 'day'; includeOthers: boolean }   // expand [] / zoom 'week' in M6
  today: ISODate
  periods: GridPeriod[]
  rows: GridRow[]                              // depth-first; each task row followed by its assignee rows (created_at, id)
  milestones: GridMilestone[]
  people: Record<string, GridPerson>
  holidays: { date: ISODate; name: string }[]
}
// ── save (X65, M6-D3/D4/D34) ──
export interface AllocationChange { granularity: 'WEEK' | 'DAY'; period: ISODate; cd: Cd | null }   // null/0 = delete
export type Change = AllocationChange                                      // M7 alias
export type OnDayWeekConflict = 'SCALE' | 'COLLAPSE'
export interface SaveAllocationsItem { taskAssignmentId: string; baseVersion: number; changes: AllocationChange[] }
export interface SaveAllocationsInput { items: SaveAllocationsItem[]; onDayWeekConflict?: OnDayWeekConflict; clientOpId: string }
export interface SaveItemResult { taskAssignmentId: string; version: number; weeks: Record<ISODate, WeekState>; rowTotal: LoadPair }
export type SaveWarningCode = 'WORK_ON_NON_WORKING_DAY' | 'WEEK_NO_CAPACITY' | 'SPILLED_OVER_DAY_LIMIT'   // M7 adds ALLOCATED_ON_TIME_OFF
export interface SaveWarning { code: SaveWarningCode; taskAssignmentId: string; week: ISODate; date?: ISODate }
export interface SaveAllocationsOk { results: SaveItemResult[]; warnings: SaveWarning[] }   // M8 adds lateness (M8-D12, X85)
export interface VersionConflictPayload { current: SaveItemResult[] }    // ActionError extra on VERSION_CONFLICT
export type SaveValidationReason = 'MAX' | 'NEGATIVE' | 'MIXED_WEEK_AND_DAY' | 'UNREPRESENTABLE' | 'DAY_WEEK'   // DAY_WEEK = M6 only (M6-D34); M7 removes it from this union instead of redeclaring it (G25)
export interface SaveValidationIssue { taskAssignmentId: string; period: ISODate; reason: SaveValidationReason }
// ── FR-612 / BR-25 (M6-D6) ──
export interface PlanAssignmentRangeInput { taskAssignmentId: string; baseVersion: number | null; totalCd: Cd; start: ISODate; end: ISODate; dryRun: boolean; clientOpId: string }
export interface PlanRangeWeek { week: ISODate; kind: 'WHOLE' | 'BOUNDARY'; before: WeekState; after: WeekState; capacityCd: Cd }
export interface PlanRangePreview { version: number; weeks: PlanRangeWeek[]; totalCd: Cd; capacityCd: Cd; overCapacityCd: Cd; warnings: SaveWarning[] }
export interface PlanAssignmentRangeOk { preview: PlanRangePreview; applied: SaveItemResult | null }   // applied = null when dryRun; M8 adds lateness
```
And in `src/lib/contracts/tasks.ts` (M3): `export interface ReleasedLoad { cd: Cd; weeks: number }` and add **`released: ReleasedLoad | null`** to `SetTaskStatusResult` (M6-D16; `null` for `revertTaskStatus` and uncomplete). In `src/lib/contracts/projects.ts` (or wherever M2's archive result type lives): `export interface ArchiveProjectResult { changed: boolean; releasedCd: Cd }`.

**S0.5 Zod (`src/lib/schemas/allocations.ts`, `src/lib/schemas/grid.ts`, new).**
```ts
// allocations.ts
import { z } from '@/lib/z'; import { th } from '@/i18n/th'; import { isoWeekday, diffDays, compareISO } from '@/domain/dates'
export const zChange = z.object({
  granularity: z.enum(['WEEK', 'DAY']), period: z.iso.date(), cd: z.number().int().min(0).max(700).nullable(),
}).superRefine((c, ctx) => {
  if (c.granularity === 'WEEK' && isoWeekday(c.period) !== 1) ctx.addIssue({ code: 'custom', message: th.grid.errors.weekNotMonday, path: ['period'] })
  if (c.granularity === 'DAY' && c.cd !== null && c.cd > 100) ctx.addIssue({ code: 'custom', message: th.grid.errors.maxDay, path: ['cd'] })
})
export const saveAllocationsSchema = z.object({
  items: z.array(z.object({ taskAssignmentId: z.uuid(), baseVersion: z.number().int().min(1), changes: z.array(zChange).min(1).max(800) })).min(1).max(500),
  onDayWeekConflict: z.enum(['SCALE', 'COLLAPSE']).optional(),
  clientOpId: z.string().min(1).max(64),
}).refine((v) => new Set(v.items.map((i) => i.taskAssignmentId)).size === v.items.length, { error: th.grid.errors.invalidBatch, path: ['items'] })
export const planAssignmentRangeSchema = z.object({
  taskAssignmentId: z.uuid(), baseVersion: z.number().int().min(1).nullable(), totalCd: z.number().int().min(0).max(37_100),
  start: z.iso.date(), end: z.iso.date(), dryRun: z.boolean(), clientOpId: z.string().min(1).max(64),
}).superRefine((v, ctx) => {
  if (compareISO(v.end, v.start) < 0) ctx.addIssue({ code: 'custom', message: th.plan.errors.endBeforeStart, path: ['end'] })
  else if (diffDays(v.start, v.end) > 370) ctx.addIssue({ code: 'custom', message: th.plan.errors.rangeTooLong, path: ['end'] })
  if (!v.dryRun && v.baseVersion === null) ctx.addIssue({ code: 'custom', message: th.grid.errors.invalidBatch, path: ['baseVersion'] })
})
// grid.ts — GET /api/grid/project/[projectId] (X65, r6b M6-31; M7 adds expand/zoom here)
const zMonday = z.iso.date().refine((d) => isoWeekday(d) === 1, { error: th.grid.errors.weekNotMonday })
export const gridQuerySchema = z.object({
  from: zMonday.optional(), to: zMonday.optional(),                       // both or neither; default = −4/+12 weeks (route)
  includeOthers: z.enum(['0', '1']).default('0').transform((v) => v === '1'),
}).superRefine((q, ctx) => {
  if ((q.from === undefined) !== (q.to === undefined)) ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
  if (q.from && q.to && (compareISO(q.to, q.from) <= 0 || diffDays(q.from, q.to) > 53 * 7))
    ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['to'] })
})
export type GridQuery = z.output<typeof gridQuerySchema>
```
`src/lib/schemas/preferences.ts` (M1): add to `preferenceInput` `{ key: 'grid.unit', value: z.enum(['DAYS','FRACTION']) }` and `{ key: 'load.view', value: z.enum(['ALL','COMMITTED','AT_RISK']) }`; to `preferencesSchema` `'grid.unit': z.enum([...]).catch('DAYS')`, `'load.view': z.enum([...]).catch('ALL')`; to `DEFAULT_PREFERENCES` (M6-D21). M1's test "rejects `grid.unit`" is inverted: `{ key: 'grid.unit', value: 'DAYS' }` now parses, `'MONTH'` fails.
Tests first (`unit`): `src/lib/schemas/allocations.test.ts` — WEEK period `2026-09-29` → issue `weekNotMonday` at `items.0.changes.0.period`; WEEK `cd 701` → error; DAY `cd 101` → `maxDay`; `cd null` ok; duplicate assignment ids in `items` → `invalidBatch`; `onDayWeekConflict: 'EXPAND'` → error (r5 C11); `planAssignmentRangeSchema` end < start → `endBeforeStart`; 372-day range → `rangeTooLong`; apply with `baseVersion null` → error; dryRun with null ok. `src/lib/schemas/grid.test.ts` — no params → `{ includeOthers: false }`; `from=2026-09-28&to=2026-11-23` ok; Tuesday → `weekNotMonday`; `to = from` → `badRange`; 54 weeks → `badRange`; only `from` → `badRange`; `includeOthers=1` → `true`, `=yes` → error.

**S0.6 Stubs (exact signatures; bodies `throw new Error('NOT_IMPLEMENTED: <name> (M6 S2)')`).**
- `src/server/actions/allocations.ts` (`'use server'`):
  ```ts
  export const saveAllocations = action<typeof saveAllocationsSchema, SaveAllocationsOk>(saveAllocationsSchema, async () => notImplemented('saveAllocations'))
  export const planAssignmentRange = action<typeof planAssignmentRangeSchema, PlanAssignmentRangeOk>(planAssignmentRangeSchema, async () => notImplemented('planAssignmentRange'))
  ```
- `src/app/api/grid/project/[projectId]/route.ts`: `export const GET = route<{ projectId: string }>(async () => notImplemented('GET grid'), { query: gridQuerySchema })` → `GridResponse`.
- `src/server/services/grid.ts`: `export interface ChunkParams { from: ISODate; to: ISODate; expand: ISODate[]; zoom: 'week' | 'day'; includeOthers: boolean }` · `export async function buildChunk(tx: DbOrTx, user: SessionUser, ctx: { kind: 'project'; id: string }, p: ChunkParams, today: ISODate): Promise<GridResponse>`.
- `src/server/services/allocations.ts`: `export const ALLOCATION_AUDIT_ENTITY = 'allocation' as const` (M6-D29) · `export async function save(tx: Tx, user: SessionUser, input: SaveAllocationsInput, today: ISODate): Promise<SaveAllocationsOk>` · `export async function planRange(tx: Tx, user: SessionUser, input: PlanAssignmentRangeInput, today: ISODate): Promise<PlanAssignmentRangeOk>` · `export async function futureProjectLoad(tx: DbOrTx, projectId: string, today: ISODate): Promise<Cd>` · `export async function releasedLoadForTasks(tx: DbOrTx, taskIds: readonly string[], today: ISODate): Promise<ReleasedLoad | null>` · plus the internals M7 calls (S2.3): `lockAssignments`, `authorizeItems`, `assertVersions` (exported, stubbed).
- `src/server/services/index.ts`: `export * as grid from './grid'; export * as allocations from './allocations'` (PLAN: `services.grid.buildChunk`, `services.allocations.save`).
- `src/server/repo/allocations.ts`: type `AllocRow` and the function signatures of S2.1 with stub bodies (so S2 and S5 compile against them).
- `src/server/services/taskStatus.ts` (M3): return `released: null` from `setStatus`/`revertStatuses` so `SetTaskStatusResult` typechecks (S2.7 fills it).
- `src/server/actions/projects.ts` (M2): `archiveProject` return type → `ArchiveProjectResult`, body returns `releasedCd: 0` until S2.8.
- `src/components/grid/PlanGrid.tsx` (stub, replaced by S3):
  ```tsx
  'use client'
  /** M6 props. Later milestones only ADD optional props (C37): M7 `initialZoom?: GridZoom`; M9 `label?: string` (aria-label override)
   *  and `focusWeek?: ISODate`. `onOpenTask` already takes the optional `projectId` M9's person grid passes; the project plan page ignores it. */
  export interface PlanGridProps { context: GridCtx; projectName: string; archived: boolean; canEdit: boolean; onOpenTask(taskId: string, projectId?: string): void }
  export function PlanGrid(props: PlanGridProps): React.JSX.Element { return <div role="grid" aria-label={th.grid.gridLabel(props.projectName)} data-save-state="idle" /> }
  ```
  S3's real `PlanGrid` keeps exactly this props interface (no required prop may be added later); behaviour that depends on the context reads `context.kind` (M6 renders only `'project'`), so M9's `'person'` branch is additive.
- Done-check: `pnpm typecheck`.

**S0.7 Query keys, invalidation, client error extra.**
- `src/lib/query-keys.ts`: add exactly PLAN §3.5 `GridCtx`, `GridChunk = { from: ISODate; expand: ISODate[]; zoom: 'WEEK' | 'DAY'; includeOthers: boolean }`, `qk.gridAll(ctx)` = `['grid', ctx.kind, ctx.id]`, `qk.gridChunk(ctx, c)` = `['grid', ctx.kind, ctx.id, c]`.
- `src/lib/invalidate.ts`: `invalidateLoad` already invalidates `qkPrefix.grid` (M2); extend `src/lib/invalidate.test.ts`: after `invalidateLoad`, `qk.gridChunk({ kind: 'project', id: 'p' }, { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false })` is invalidated; `qk.projectTasks('p')` is not.
- `src/lib/action-result.ts` (M6-D25): `ActionFailure` gains `readonly extra: Readonly<Record<string, unknown>>` (the result minus `ok`, `code`, `message`, `fieldErrors`). Test: `unwrap({ ok: false, code: 'VERSION_CONFLICT', message: 'x', current: [1] })` throws a failure whose `extra.current` deep-equals `[1]`.

**S0.8 Shortcut registry (`src/lib/shortcuts.ts`, X07).** Add scope `'grid'` to `ShortcutScope` and `SHORTCUT_SCOPES`; add `KeyToken`s `'F' | 'H' | 'C' | 'V' | 'Arrows' | 'ArrowLeft' | 'ArrowRight' | 'Backspace' | 'Drag'`; entries:
```ts
{ id: 'grid.edit', scope: 'grid', combos: [['Enter'], ['Tab']], label: th.shortcuts.items.gridEdit },
{ id: 'grid.cancel', scope: 'grid', combos: [['Esc']], label: th.shortcuts.items.gridCancel },
{ id: 'grid.select', scope: 'grid', combos: [['Shift', 'Arrows'], ['Drag']], label: th.shortcuts.items.gridSelect },
{ id: 'grid.full', scope: 'grid', combos: [['F']], label: th.shortcuts.items.gridFull },
{ id: 'grid.half', scope: 'grid', combos: [['H']], label: th.shortcuts.items.gridHalf },
{ id: 'grid.copy', scope: 'grid', combos: [['Mod', 'C']], label: th.shortcuts.items.gridCopy },
{ id: 'grid.paste', scope: 'grid', combos: [['Mod', 'V']], label: th.shortcuts.items.gridPaste },
{ id: 'grid.shift', scope: 'grid', combos: [['Mod', 'ArrowLeft'], ['Mod', 'ArrowRight']], label: th.shortcuts.items.gridShift },
{ id: 'grid.clear', scope: 'grid', combos: [['Delete'], ['Backspace']], label: th.shortcuts.items.gridClear },
{ id: 'grid.newTask', scope: 'grid', combos: [['N']], label: th.shortcuts.items.gridNewTask },
```
`src/lib/shortcuts.test.ts` keeps passing (ids unique, scopes listed, labels non-empty). M7 appends `grid.expandWeek`, `grid.collapseWeek`, `grid.cellMenu`.

**S0.9 i18n (`src/i18n/th.ts`).** Create `units`, `grid`, `plan`; add keys elsewhere. Final strings (functions for parameters, PLAN §3.7):
```ts
units: {
  label: 'หน่วย', DAYS: 'วัน', FRACTION: 'สัดส่วน',
  days: (v: string) => `${v} วัน`, personDays: (v: string) => `${v} วัน-คน`,
  fractionTooltip: (fraction: string, cap: string, days: string) => `${fraction} × ${cap} วันทำการ = ${days} วัน`,
},
grid: {
  tabLabel: 'แผนงาน',
  gridLabel: (project: string) => `กริดแผนงาน ${project}`,
  toolbar: { label: 'เครื่องมือกริด', zoom: 'มุมมอง', zoomWeek: 'สัปดาห์', today: 'วันนี้', prev: 'สัปดาห์ก่อนหน้า', next: 'สัปดาห์ถัดไป',
    view: 'ภาระ', includeOthers: 'รวมงานโปรเจคอื่นของคนเหล่านี้', showCompleted: 'แสดงงานที่เสร็จแล้ว' },
  view: { ALL: 'ทั้งหมด', COMMITTED: 'เฉพาะที่แน่นอน', AT_RISK: 'ส่วนที่ยังไม่แน่นอน' },
  header: { name: 'งาน / ผู้รับผิดชอบ', total: 'รวม', week: (label: string) => `สัปดาห์ ${label}`, holiday: (names: string) => `วันหยุด: ${names}`, today: 'สัปดาห์นี้' },
  row: { addTask: '+ เพิ่มงาน…', addTaskLabel: 'เพิ่มงานใหม่ในแผนงาน', addPerson: '+ คน', addPersonLabel: (task: string) => `เพิ่มผู้รับผิดชอบให้ ${task}`,
    unassigned: 'รอมอบหมาย', removeAssignee: (name: string) => `ยกเลิกการมอบหมาย ${name}`, deactivated: 'ปิดใช้งาน',
    tentative: 'อาจไม่ทำ', sourceTask: 'ตั้งที่งานนี้', sourceAncestor: (name: string) => `สืบทอดจาก '${name}'`, completed: 'เสร็จแล้ว',
    openTask: (name: string) => `เปิดรายละเอียด ${name}`, expand: 'ขยายงานย่อย', collapse: 'ยุบงานย่อย' },
  cell: { label: (row: string, week: string, value: string) => `${row} สัปดาห์ ${week}: ${value}`, empty: 'ว่าง',
    dayDetail: 'มีรายละเอียดรายวัน', dayTooltip: (parts: string) => `แผนรายวัน: ${parts}`,
    exact: (value: string) => `${value} วัน`, notCounted: 'ไม่นับภาระ (งานเสร็จแล้ว)', noCapacity: 'ไม่มี capacity ช่วงนี้',
    leave: (label: string, range: string) => `${label} ${range}`, holiday: (name: string) => `วันหยุด: ${name}` },
  footer: { load: (names: string) => `ภาระรวม (${names})`, loadEmpty: 'ภาระรวม', capacity: 'Capacity', utilization: '% ใช้กำลังคน',
    noCapacity: '—', percent: (n: number) => `${n}%`, withOthers: 'รวมงานโปรเจคอื่น' },
  legend: { dayDetail: '⋯ มีรายละเอียดรายวัน', tentative: '◐ อาจไม่ทำ', source: '* ตั้งที่งานนี้', bar: '▌ แถบเหลือง = อาจไม่ทำ', leave: 'ลายทาง = ลา', holiday: 'พื้นเทา = วันหยุด' },
  glyph: { leave: 'ลา', holiday: 'วันหยุด', tentative: 'อาจไม่ทำ', dayDetail: 'มีรายละเอียดรายวัน', noCapacity: 'ไม่มี capacity' },
  save: { idle: 'บันทึกแล้ว', pending: 'รอบันทึก…', saving: 'กำลังบันทึก…', error: 'บันทึกไม่สำเร็จ' },
  toast: {
    saveFailed: 'บันทึกไม่สำเร็จ · ลองใหม่', retry: 'ลองใหม่',
    conflict: 'มีคนแก้แผนนี้พร้อมกัน — โหลดค่าล่าสุดแล้ว',
    dayWeekReadOnly: 'สัปดาห์นี้มีแผนรายวัน',
    readOnlySkipped: (n: number) => `ข้าม ${n} ช่องที่แก้ไม่ได้`,
    invalidSkipped: (n: number) => `ข้าม ${n} ค่าที่อ่านไม่ได้`,
    invalidValue: 'ค่าไม่ถูกต้อง', maxWeek: 'ใส่ได้ไม่เกิน 7 วันต่อสัปดาห์',
    noCapacity: 'ไม่มี capacity ช่วงนี้', needAssignee: 'มอบหมายคนก่อนวางแผน', readOnlyRow: 'แถวนี้เป็นผลรวม แก้ที่แถวผู้รับผิดชอบ',
    archived: 'โปรเจคถูก archive แล้ว — ดูได้อย่างเดียว',
    pasted: (n: number) => `วาง ${n} ช่องแล้ว`, shiftBlocked: 'เลื่อนไม่ได้ — มีช่องที่แก้ไม่ได้ในช่วงนี้',
    undoStale: 'แผนนี้ถูกแก้โดยคนอื่น — เลิกทำไม่ได้',
    warning: { WORK_ON_NON_WORKING_DAY: 'วางงานในวันที่ไม่ทำงาน', WEEK_NO_CAPACITY: 'สัปดาห์นี้ไม่มี capacity', SPILLED_OVER_DAY_LIMIT: 'บางวันเกิน 1 วัน — ย้ายส่วนเกินไปวันอื่นแล้ว' },
  },
  undo: { edit: 'แก้แผน', fill: 'เติมค่า', paste: 'วาง', shift: 'เลื่อนแผน', clear: 'ล้างค่า', capacity: 'ใส่ตาม capacity', planRange: 'วางแผนตามช่วง' },
  empty: 'ยังไม่มีงาน — พิมพ์ชื่องานในแถว "+ เพิ่มงาน…" ด้านล่าง',
  loading: 'กำลังโหลดแผน…', loadError: 'โหลดแผนไม่สำเร็จ', reload: 'ลองใหม่',
  errors: { weekNotMonday: 'สัปดาห์ต้องเริ่มวันจันทร์', badRange: 'ช่วงวันที่ไม่ถูกต้อง', maxDay: 'ไม่เกิน 1 วันต่อวัน',
    dayWeek: 'สัปดาห์นี้มีแผนรายวัน — แก้ได้เมื่อมีมุมมองรายวัน', invalidBatch: 'มีค่าที่บันทึกไม่ได้' },
},
plan: {
  button: 'วางแผน', buttonFor: (name: string) => `วางแผนให้ ${name}`,
  title: (name: string, task: string) => `วางแผน ${name} · ${task}`,
  totalLabel: 'จำนวนวันรวม', totalHint: 'ใส่ 0 เพื่อล้างแผนในช่วงนี้', startLabel: 'วันเริ่ม', endLabel: 'วันสิ้นสุด',
  preview: 'ตัวอย่าง', previewLoading: 'กำลังคำนวณ…', apply: 'วางแผน', cancel: 'ยกเลิก',
  columns: { week: 'สัปดาห์', kind: 'ชนิด', before: 'เดิม', after: 'ใหม่', capacity: 'capacity' },
  kind: { WHOLE: 'ทั้งสัปดาห์', BOUNDARY: 'ติดขอบ (รายวัน)' },
  capacityInRange: (days: string) => `capacity ในช่วงนี้ ${days} วัน`,
  overCapacity: (days: string) => `เกิน capacity ${days} วัน`,
  replaceNote: 'แผนเดิมของคนนี้ในช่วงนี้จะถูกแทนที่',
  applied: (days: string, name: string) => `วางแผน ${days} วันให้ ${name} แล้ว`,
  errors: { endBeforeStart: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', rangeTooLong: 'ช่วงยาวได้ไม่เกิน 53 สัปดาห์',
    invalidTotal: 'ใส่จำนวนวันเป็นตัวเลข เช่น 3 หรือ 2.5',
    unrepresentable: 'ช่วงวันสั้นเกินไปสำหรับจำนวนวันนี้ (เกิน 1 วันต่อวัน) — ขยายช่วงหรือลดจำนวนวัน' },
},
tasks: { /* M3 … */ toast: { /* M3 … */ released: (days: string, weeks: number) => `ปลดภาระ ${days} วัน ในอีก ${weeks} สัปดาห์` } },
projects: { /* M2 … */ tabs: { /* … */ plan: 'แผนงาน' },
  toasts: { /* … */ archivedReleased: (name: string, days: string) => `archive "${name}" แล้ว — ปลดภาระ ${days} วัน-คน ในอนาคต` } },
audit: { /* … */
  allocationsSaved: (person: string, task: string, weeks: number) => `แก้แผน ${person} · ${task} (${weeks} สัปดาห์)`,
  planRangeApplied: (person: string, task: string, days: string, range: string) => `วางแผน ${person} · ${task} ${days} วัน (${range})`,
  allocationsSeeded: (n: number) => `นำเข้าแผนตั้งต้น ${n} สัปดาห์`,
},
shortcuts: { /* … */ scopes: { /* … */ grid: 'กริดวางแผน' },
  keys: { /* … */ F: 'F', H: 'H', C: 'C', V: 'V', Arrows: '←↑↓→', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace', Drag: 'ลากเมาส์' },
  items: { /* … */ gridEdit: 'บันทึกแล้วไปช่องล่าง / ขวา', gridCancel: 'ยกเลิกที่กำลังพิมพ์', gridSelect: 'เลือกช่วง',
    gridFull: 'ใส่เต็ม capacity', gridHalf: 'ใส่ครึ่งหนึ่งของ capacity', gridCopy: 'คัดลอก (TSV)', gridPaste: 'วาง (จาก Excel ได้)',
    gridShift: 'เลื่อนค่าในช่วงไป ±1 สัปดาห์', gridClear: 'ล้างค่า', gridNewTask: 'เพิ่มงานใหม่ในแผนงาน' } },
```
Rules: no Thai outside this file (ESLint); tests import `th`.

**S0.10 Seed rows + builders (`scripts/lib/fixtures.ts`, X11, M6-D23, M6-D22).**
- In `seedGolden(db, …)` after M3's assignments: for each JSON task, for each `[week, cd]` of `allocationsCd`, insert `{ taskAssignmentId, granularity: task.granularity, periodStart: week, weekStart: week, personDays: cdToNumeric(cd) }` (plain Drizzle, X59; the assignment rows are new in this transaction, so no lock is needed); one audit row per assignment (`actor null`, `entity: ALLOCATION_AUDIT_ENTITY`, `summary: th.audit.allocationsSeeded(n)`).
- `export async function addSyntheticGridProject(db: DbOrTx, o: { tasks: number; weeks: number; from: ISODate }): Promise<{ projectId: string }>` — project "Perf grid" (LEAD Cindy, MEMBER Ivy/Mint), `o.tasks` leaf tasks under 20 parents (depth 0/1), each assigned Cindy, Ivy or Mint in turn, WEEK 100 in every week of `[from, from + weeks)`; default status per X70; `client_id = null`; **no audit rows** (X92 — synthetic builders never audit; M11's perf counts rely on it). Plain Drizzle, no `today` needed (fixed `from`).
- Tests first `scripts/lib/fixtures.int.test.ts`: after `seedGolden`: `allocations` = 57 rows, all WEEK, `sum(person_days) = 195.00`; Rollout สาขา rows `11-30:2.50 … 12-28:2.50`; 10 audit rows with entity `allocation`; `addSyntheticGridProject(db, { tasks: 200, weeks: 16, from: '2026-09-28' })` → 220 tasks, 200 assignments, 3 200 rows, `audit_log` count unchanged.

**S0.11 Test helpers (`tests/helpers/**`, PLAN §4.3).**
```ts
// factories.ts (plain Drizzle, X59)
export async function makeAllocation(o: { assignment: { id: string }; period: ISODate; cd: Cd; granularity?: 'WEEK' | 'DAY' }): Promise<AllocRow>   // weekStart = weekStart(period)
export async function allocationRows(assignmentId: string, week: ISODate): Promise<{ granularity: 'WEEK' | 'DAY'; periodStart: ISODate; cd: Cd }[]>   // bounded by week_start = week; sorted
export async function assignmentVersion(assignmentId: string): Promise<number>
```
`createWorld({ with: ['allocations'] })` implies `'tasks'` and `'timeOff'` (M5's `w.users.coworker` = MEMBER of P and Q). It adds — **no November 2026 week on `pLeafLead` or `aTaskMember`** (M7's `dayAllocations` uses 11-02/11-09):

| Key | Data |
|---|---|
| `w.allocations.pLeafLead` | WEEK 2026-09-28 = 250, 2026-10-05 = 500 on `w.assignments.pLeafLead` |
| `w.allocations.pChildAMember` | WEEK 2026-09-28 = 100; DAY week 2026-10-12 = `{ 10-12: 50, 10-13: 50 }` on `w.assignments.pChildAMember` (the X27 DAY week) |
| `w.assignments.pDoneMember` | `member` on `w.tasks.pDone` (completed 2026-09-28) with WEEK 2026-09-28 = 100, 2026-10-05 = 200 (BR-50: 10-05 not counted) |
| `w.allocations.qTaskOutsider` | WEEK 2026-09-28 = 300 on `w.assignments.qTaskOutsider` |
| `w.allocations.aTaskMember` | WEEK 2026-10-05 = 200 on `w.assignments.aTaskMember` (archived A) |
| `w.tasks.pCoworker` + `w.assignments.pCoworker` | P root "งานร่วม P-ลับ03" assigned `coworker`, WEEK 2026-10-05 = 100 |
| `w.assignments.qTaskCoworker` | `coworker` on `w.tasks.qTask`, WEEK 2026-10-05 = 300 (feeds P's `otherProjects`; Q stays hidden) |

Smoke test `tests/helpers/world.int.test.ts › with allocations`: the rows above via `allocationRows`; every assignment version = 1; `assertCompletionInvariant` (M3) still holds.
`tests/helpers/outcome.ts`: `outcomeOf` maps action `VALIDATION` → `'400'` and `VERSION_CONFLICT` → `'409'` (extend if it maps by code).

**S0.12 `StatusGlyph` (`src/components/common/StatusGlyph.tsx`, PLAN §3.9).** `StatusGlyph({ kind: 'leave' | 'holiday' | 'tentative' | 'dayDetail' | 'noCapacity', label?: string })` → `<span className={styles[kind]} aria-hidden="true">{glyph}</span><span className="visually-hidden">{label ?? th.grid.glyph[kind]}</span>` with glyphs `ลา`-icon (`EventBusyOutlined`, 12 px), 🎌, ◐, ⋯, ▨. M7 adds `'over' | 'risk'`. Test `StatusGlyph.test.tsx`: each kind renders its hidden text from `th.grid.glyph`.

**S0.13 e2e fixture helpers (`e2e/fixtures.ts`).** `resetDb(fixture?: FixtureId, opts?: { syntheticGrid?: boolean })` (M7 adds `dayExample` to `opts`) → `addSyntheticGridProject(tx, { tasks: 200, weeks: 16, from: '2026-09-28' })` after `seedGolden`/`applyFixture` in the same transaction; `projectIdByName(name: string): Promise<string>` (DB lookup from the Playwright process).

**S0.14 G0.** `pnpm check` green; `pnpm db:generate` → "No schema changes"; report the two migration file names and the S0.1 inventory.

### 5.S1 — Domain units, certainty split, allocation, completed (domain-engineer · owns `src/domain/units*.ts`, `src/domain/certainty*.ts`, `src/domain/allocation*.ts`, `src/domain/completed*.ts`)

Test-first for every function (CLAUDE.md); integers only (cd), ISO strings only, no `Date`; `src/domain/**` imports only `src/domain/**`. Coverage `src/domain/**` ≥ 95 %. M1's `numericToCd`/`cdToNumeric` and M3's `certainty.ts` exports stay unchanged. Names marked ★ are the ones M7 reuses (`plan/m07-daily-resolution.md` §5.S0.1/S1) — keep signature and semantics exactly.

**S1.1 `units.ts` M6 part (X02, X65, M6-D9/D10; tests `src/domain/units.test.ts`).**
```ts
export type ParsedCell =
  | { kind: 'value'; cd: Cd }                                  // already rounded to 25 (typed) or exact (f)
  | { kind: 'clear' }                                          // '' or a value that rounds to 0
  | { kind: 'skip'; reason: 'NO_CAPACITY' }                    // f/h on a cap-0 cell
  | { kind: 'invalid'; reason: 'FORMAT' | 'NEGATIVE' | 'MAX' }
export function normalizeNumericInput(raw: string): string   // trim, Thai digits ๐–๙ → 0–9, ',' → '.', Kedmanee 'ด' → 'f', '้' → 'h', lower-case
export function parseCellInput(raw: string, o: { unit: CellUnit; capCd: Cd; maxCd: Cd }): ParsedCell
export function fullCapacityCd(capCd: Cd): Cd                  // = capCd (never rounded)
export function halfCapacityCd(capCd: Cd): Cd                  // 25 * floor((2 * capCd + 50) / 100)
export function roundToQuarterCd(cd: Cd): Cd                   // BR-27 on an integer: 25 * floor((2 * cd + 25) / 50)
export function validateCellCd(granularity: Granularity, cd: Cd): 'ok' | 'clear' | 'MAX' | 'NEGATIVE'   // BR-26
export function formatCd(cd: Cd, o: { unit: CellUnit; baseCd?: Cd; decimals: 1 | 2 }): string
export function fractionHundredths(cd: Cd, baseCd: Cd): number // floor((200·cd + baseCd) / (2·baseCd)), baseCd > 0
```
Rules: the exact decimal `n / 10^k` is read from `^(\d{0,3})(?:\.(\d{1,4}))?%?$` (at least one digit; `%` only in FRACTION, meaning `n/100`); DAYS `k25 = floor((200n + 25·10^k) / (50·10^k))`, FRACTION `k25 = floor((2·n·cap + 25·10^k) / (50·10^k))` (with `%`: the denominator gains ×100); FRACTION with `capCd = 0` parses as DAYS; `cd = 25·k25`; `cd = 0` → clear; `cd > maxCd` → MAX; leading `-` → NEGATIVE. `formatCd`: `cd = 0` → `''`; DAYS 1 decimal `t = floor((cd + 5) / 10)` → `${floor(t/10)}.${t%10}`; DAYS 2 decimals exact `${floor(cd/100)}.${pad2(cd%100)}`; FRACTION (baseCd > 0) 2 decimals from `fractionHundredths`; FRACTION with baseCd 0 or undefined → DAYS. Never `toFixed`, never `/`.

| Input | Expected |
|---|---|
| `parseCellInput('3', DAYS, cap 500, max 700)` | value 300 (AC-801) |
| `'0.125'` / `'0.375'` / `'0.1'` | 25 / 50 / clear (r6b §5) |
| `',5'` / `'1,5'` / `'๑.๕'` / `' 2 '` | 50 / 150 / 150 / 200 |
| `'1.13'` / `'1.12'` | 125 / 100 |
| `'7'` / `'7.25'` / `'-1'` / `'abc'` / `'1.2.3'` / `'1234'` / `'0.12345'` / `''` / `'0'` | 700 / invalid MAX / invalid NEGATIVE / invalid FORMAT ×4 / clear / clear |
| FRACTION `'0.5'` cap 500 / `'1'` cap 500 / `'0.75'` / `'0.25'` | 250 / 500 / 375 / 125 (AC-803) |
| FRACTION `'0.33'` cap 500 / `'50%'` cap 500 / `'0.5'` cap 400 | 175 / 250 / 200 |
| FRACTION `'2'` cap 0 | 200 (days fallback) |
| `'f'` cap 300 / `'h'` cap 300 / `'ด'` cap 300 | 300 / 150 / 300 (AC-802, Kedmanee) |
| `halfCapacityCd(450)` / `(75)` / `(500)` / `(25)` | 225 / 50 / 250 / 25 |
| `'f'` cap 0 / `'h'` cap 0 | skip NO_CAPACITY |
| `formatCd(375, DAYS, 1)` / `125` / `625` / `1875` / `35` / `15` / `0` | `'3.8'` / `'1.3'` / `'6.3'` / `'18.8'` / `'0.4'` / `'0.2'` / `''` (r8 G12) |
| `formatCd(375, DAYS, 2)` / `5` | `'3.75'` / `'0.05'` |
| `formatCd(250, FRACTION, base 500, 2)` / `375` / `125, base 400` / `500, base 0` | `'0.50'` / `'0.75'` / `'0.31'` / `'5.0'` |
| `validateCellCd('WEEK', 700)` / `('WEEK', 701)` / `('DAY', 101)` / `('DAY', 0)` | ok / MAX / MAX / clear |
| `roundToQuarterCd(12)` / `13` / `37` / `38` | 0 / 25 / 25 / 50 |

Properties (`fc.assert`): for DAYS and every integer `x ∈ [0, 700]` with 2 decimals, `parseCellInput(formatCd(x, DAYS, 2))` is `value roundToQuarterCd(x)` or clear; every `value` result is a multiple of 25 except `f`; `formatCd(x, DAYS, 1)` equals the integer half-up reference for all `x ∈ [0, 70 000]`.

**S1.2 `certainty.ts` load split (X03, BR-37; tests `src/domain/certainty.test.ts › load`).**
```ts
export function splitLoad(cd: Cd, certainty: Certainty): LoadPair          // { total: cd, committed: certainty === 'CONFIRMED' ? cd : 0 }
export function addLoad(a: LoadPair, b: LoadPair): LoadPair
export const ZERO_LOAD: LoadPair
export function viewLoad(p: LoadPair, view: LoadView): Cd                   // ALL → total; COMMITTED → committed; AT_RISK → total − committed
```
Tests: `splitLoad(250, 'TENTATIVE')` → `{250, 0}`; `viewLoad({625, 500}, 'AT_RISK')` → 125; `addLoad` associative (property).

**S1.3 ★ `allocation.ts` primitives (BR-21, BR-21a, X65; tests `src/domain/allocation.test.ts`).** Types exported from `allocation.ts`:
```ts
export type Days7 = readonly Cd[]                                   // index 0 = Monday … 6 = Sunday, length 7
export interface DayCtx { week: ISODate; dayCaps: Days7; schedule: Days7; timeOff: readonly boolean[] }
export type DayWarningCode = 'WORK_ON_NON_WORKING_DAY' | 'SPILLED_OVER_DAY_LIMIT' | 'WEEK_NO_CAPACITY' | 'ALLOCATED_ON_TIME_OFF'
export interface DayWarning { code: DayWarningCode; dayIndex?: number }
export type StepResult = { ok: true; days: Cd[]; spilled: boolean; warnings: DayWarning[] } | { ok: false; reason: 'UNREPRESENTABLE' }
/** Exact largest remainder (PLAN §3.6, r6b M6-03): q = floor(t·w / Σw), r = (t·w) mod Σw; extra units by r desc, then index asc. Σw = 0 → zeros. */
export function distribute(totalCd: Cd, weights: readonly number[]): Cd[]
/** BR-21 + BR-21a fallback chain (M7-D9): dayCaps → schedule ('SCHEDULE') → Mon–Fri equal ('WEEKDAYS'). Never clamps. */
export function spreadWeek(weekCd: Cd, ctx: DayCtx): { days: Cd[]; fallback: null | 'SCHEDULE' | 'WEEKDAYS' }
/** X65 tiers: (1) dayCaps[i] > 0 with room, (2) schedule[i] > 0 && dayCaps[i] = 0, (3) the rest; earliest index first in a tier;
 *  `fixed` indexes never change (assumed ≤ hardCap); excess left → { ok: false }. spilled = any value changed. Warnings are added by callers. */
export function clampAndSpill(values: readonly Cd[], fixed: ReadonlySet<number>, ctx: DayCtx, hardCap?: Cd /* = 100 */): StepResult
```
Tests (copy of `plan/m07-daily-resolution.md` S1.2/S1.3 tables so both milestones pin the same values):
- `distribute`: `(50, [10, 40, 100])` → `[4, 13, 33]` (PLAN §3.6 counterexample); `(320, [40, 25, 67, 60])` → `[67, 42, 111, 100]` (r6b E12); `(100, [25, 75, 100, 100])` → `[9, 25, 33, 33]` (r8 G11); `(250, [100×5, 0, 0])` → `[50×5, 0, 0]`; `(250, [100×4, 0×3])` → `[63, 63, 62, 62, 0, 0, 0]`; `(5, [0, 0])` → `[0, 0]`. Properties: Σ = t when Σw > 0; each value within 1 of `t·w/Σw`; permuting equal weights keeps the earlier index ≥ the later.
- `spreadWeek`: 250 / caps Mon–Fri 100 → 50 ×5, null; 500 / F2 caps `[100,100,100,100,0,0,0]` → `[125,125,125,125,0,0,0]`; 500 / F3 caps `[0,0,100,100,100,0,0]` → `[0,0,167,167,166,0,0]`; 250 / caps 0×7, schedule Mon–Fri → 50 ×5 `'SCHEDULE'`; 250 / caps 0×7, schedule 0×7 → 50 ×5 `'WEEKDAYS'`; 250 / caps 0×7, schedule `[100,0,100,0,100,0,0]` → `[84,0,83,0,83,0,0]` `'SCHEDULE'`; 0 → zeros.
- `clampAndSpill`: `[160,160,80,0,0,0,0]`, none fixed, caps Mon–Fri 100 → `[100,100,100,100,0,0,0]` spilled; `[100,125,125,125,0,0,0]` fixed {0}, caps `[100,100,100,100,0,0,0]`, schedule Mon–Fri → `[100,100,100,100,75,0,0]`; `[700,0,…]` caps Mon–Fri → `[100×7]`; `[700,0,…]` fixed {1} → `UNREPRESENTABLE`; already ≤ 100 → unchanged, `spilled: false`.
- Property: every ok result has Σ = Σ input and every value in `[0, hardCap]`; fixed indexes unchanged.

**S1.4 ★ `planWeek` — the per-(item, week) table, M6 subset (M6-D4, M6-D34; tests `src/domain/allocation.test.ts › planWeek`).**
```ts
export type WeekPlan = { resolution: null } | { resolution: 'WEEK'; weekCd: Cd } | { resolution: 'DAY'; days: Days7 }   // DAY: Σ > 0
export type WeekChange = { granularity: 'WEEK'; cd: Cd | null } | { granularity: 'DAY'; dayIndex: number; cd: Cd | null }
export type PlanWeekResult =
  | { kind: 'ok'; next: WeekPlan; changed: boolean; warnings: DayWarning[] }
  | { kind: 'needsChoice' }                                                       // M6: mapped to VALIDATION DAY_WEEK by the service
  | { kind: 'invalid'; reason: 'MAX' | 'NEGATIVE' | 'MIXED_WEEK_AND_DAY' | 'UNREPRESENTABLE' | 'DAY_WEEK'; dayIndex?: number }
export function planWeek(current: WeekPlan, changes: readonly WeekChange[], ctx: DayCtx, choice?: OnDayWeekChoice): PlanWeekResult
export type OnDayWeekChoice = 'SCALE' | 'COLLAPSE'
export function weekPlanTotal(plan: WeekPlan): Cd
```
Rules in order (results normalised: DAY with all zeros → `{ resolution: null }`, WEEK 0 → null; `changed` = deep inequality):
1. Empty changes → ok unchanged. Both granularities → invalid `MIXED_WEEK_AND_DAY`; any `cd < 0` → `NEGATIVE`; WEEK > 700 or DAY > 100 → `MAX` (+ `dayIndex`).
2. WEEK (last wins), `x = cd ?? 0`: current null/WEEK → next WEEK x (or null); warning `WEEK_NO_CAPACITY` when x > 0 and Σ dayCaps = 0. Current DAY → x = 0 → null; `choice === 'COLLAPSE'` → WEEK x (checked before the Σ no-op — M7-D2; test: DAY week Σ 150 + WEEK 150 with `COLLAPSE` → one WEEK row 150); x = Σ days → ok unchanged; otherwise (none or `SCALE` — SCALE is M7) → `needsChoice`.
3. DAY changes (per `dayIndex`, last wins, null → 0): current DAY or null → set those days (others kept / 0); current WEEK → if all 7 indexes are present → exactly those days (snapshot replay; equals M7's BR-22 result because every day is fixed); otherwise → invalid `DAY_WEEK` (M7 implements BR-22 here).

| current | changes | choice | expected |
|---|---|---|---|
| null | WEEK 250 | — | ok WEEK 250, changed |
| WEEK 250 | WEEK null | — | ok null |
| WEEK 250 | WEEK 250 | — | ok, changed false |
| WEEK 250 | WEEK 725 | — | invalid MAX |
| DAY [50,50,100,50,50,0,0] | WEEK 400 | — | needsChoice |
| same | WEEK 400 | SCALE | needsChoice (M6) |
| same | WEEK 400 | COLLAPSE | ok WEEK 400 |
| same | WEEK 300 | — | ok, changed false (M7-D5) |
| same | WEEK 300 | COLLAPSE | ok WEEK 300, changed (BR-23: COLLAPSE is checked before the Σ no-op, M7-D2) |
| same | WEEK null | — | ok null (M7-D5) |
| WEEK 250 | DAY Mon..Sun = 100,100,50,null×4 | — | ok DAY [100,100,50,0,0,0,0] (undo replay; Σ 250) |
| WEEK 250 | DAY Wed 100 | — | invalid DAY_WEEK |
| null | DAY Mon 50 | — | ok DAY [50,0,0,0,0,0,0] |
| DAY [50,0,0,0,0,0,0] | DAY Mon null | — | ok null |
| DAY … | DAY Mon 125 | — | invalid MAX dayIndex 0 |
| WEEK 250 | WEEK 300 + DAY Mon 50 | — | invalid MIXED_WEEK_AND_DAY |
| null, caps 0×7 | WEEK 250 | — | ok WEEK 250 + WEEK_NO_CAPACITY |

Property: whenever the result is ok it equals what M7's full rules would return (DAY changes covering 7 days, WEEK on null/WEEK, COLLAPSE) — asserted by the snapshot round trip: for any plan `p` and any target snapshot `s`, `planWeek(p, sevenDayChanges(s))` → `s` (or null) and `planWeek(p, [WEEK s], ctx, 'COLLAPSE')` → WEEK s.

**S1.5 `planRange` — BR-25 (M6-D6; tests `src/domain/allocation.test.ts › planRange`).**
```ts
export interface RangeWeek { week: ISODate; ctx: DayCtx; current: WeekPlan }
export type PlanRangeDomainResult =
  | { ok: true; fallback: null | 'SCHEDULE' | 'WEEKDAYS' | 'ALL_DAYS'; capacityCd: Cd; overCapacityCd: Cd
      weeks: { week: ISODate; kind: 'WHOLE' | 'BOUNDARY'; next: WeekPlan; inRangeCapCd: Cd; changed: boolean; warnings: DayWarning[] }[] }
  | { ok: false; reason: 'UNREPRESENTABLE'; week: ISODate }
/** weeks = every Monday from weekStart(start) to weekStart(end), in order (RangeError otherwise). */
export function planRange(totalCd: Cd, start: ISODate, end: ISODate, weeks: readonly RangeWeek[]): PlanRangeDomainResult
export function isWholeWeek(week: ISODate, schedule: Days7, start: ISODate, end: ISODate): boolean
```
Algorithm: in-range days D (in order); weights = `dayCaps`; Σ = 0 → `schedule` (`SCHEDULE`) → Mon–Fri of D equal (`WEEKDAYS`) → all of D equal (`ALL_DAYS`); `dist = distribute(totalCd, weights)`; per week: WHOLE (`isWholeWeek`) → WEEK Σ dist (> 700 → UNREPRESENTABLE; 0 → null); BOUNDARY → `base = current` as days (WEEK → `spreadWeek(weekCd, ctx).days`, DAY → days, null → zeros); `outside = clampAndSpill(base with in-range zeroed, inRangeIdx, ctx)`; `inside = clampAndSpill(zeros with dist at in-range idx, outsideIdx, ctx)`; next = elementwise sum (Σ 0 → null); either step not ok → UNREPRESENTABLE for that week. Warnings: `WORK_ON_NON_WORKING_DAY` per day with cd > 0 and `dayCaps = 0`, `SPILLED_OVER_DAY_LIMIT` once per spilled week, `WEEK_NO_CAPACITY` when a WHOLE week has Σ dayCaps = 0 and cd > 0. `capacityCd` = Σ dayCaps over D; `overCapacityCd = max(0, totalCd − capacityCd)`. Days outside the range never change in DAY weeks; they change only by the BR-21 split of a WEEK boundary week, with their sum preserved.

| Case (Ivy, F1 unless noted) | Expected |
|---|---|
| 1000 cd over 2026-11-11..11-24 (r8 §6.8) | 11-09 BOUNDARY DAY `[0,0,100,100,100,0,0]`; 11-16 WHOLE WEEK 500; 11-23 BOUNDARY DAY `[100,100,0,0,0,0,0]` |
| 500 over 11-11..11-24 | DAY 50 ×3 · WEEK 250 · DAY 50 ×2 |
| 200 over 11-11..11-13 | DAY `[0,0,67,67,66,0,0]` |
| 400 over 11-11..11-13 (r8 G3) | `UNREPRESENTABLE` week 2026-11-09 |
| 400 over 11-11..11-15 (Sat/Sun in range) | DAY `[0,0,100,100,100,100,0]` + SPILLED + NON_WORKING@5 |
| 500 over 11-16..11-20, current WEEK 250 | WHOLE WEEK 500, changed |
| 0 over 11-16..11-20, current WEEK 250 | WHOLE null (clears) |
| 150 over 11-11..11-13, current WEEK 500 (caps Mon–Fri) | DAY `[100,100,50,50,50,0,0]` (Mon/Tue from the split kept) |
| 200 over 11-10..11-13, current DAY `[100,0,0,0,0,0,0]` | DAY `[100,50,50,50,50,0,0]` |
| F3 Peter, 200 over 10-05..10-06 (both on leave, caps 0) | fallback `SCHEDULE`; DAY `[100,100,…]` for in-range days + NON_WORKING@0,1; out-of-range days = current split |
| a holiday Friday inside an otherwise covered week | still WHOLE (holidays ignored) |
| 37 100 over 1 week | UNREPRESENTABLE |
Properties: Σ next over all weeks = `totalCd` + Σ out-of-range parts of the current plans (sum preserved); every DAY value ≤ 100; every WEEK value ≤ 700; days outside the range of DAY weeks unchanged.

**S1.6 `completed.ts` — BR-50/51/52 (X19; tests `src/domain/completed.test.ts`).**
```ts
export function completedWeekOf(completedOn: ISODate | null): ISODate | null          // weekStart(completedOn)
/** BR-50: a period counts iff the task is open or its week ≤ completedWeek. */
export function countsTowardLoad(weekStart: ISODate, completedWeek: ISODate | null): boolean
/** BR-52: X = Σ cd with weekStart > completedWeek, N = distinct such weeks; null when X = 0. */
export function releasedLoad(rows: readonly { weekStart: ISODate; cd: Cd }[], completedWeek: ISODate): { cd: Cd; weeks: number } | null
/** FR-406: Σ counted cd with weekStart ≥ fromWeek (BR-50 per row). */
export function futureLoad(rows: readonly { weekStart: ISODate; cd: Cd; completedWeek: ISODate | null }[], fromWeek: ISODate): Cd
```
Tests: `completedWeekOf('2026-10-04')` → `'2026-09-28'`, `('2027-01-01')` → `'2026-12-28'`; `countsTowardLoad('2026-09-21', '2026-09-28')` true, `('2026-09-28', '2026-09-28')` true, `('2026-10-05', '2026-09-28')` false, `(x, null)` true; `releasedLoad` of Rollout สาขา (11-30:250, 12-07:375, 12-14:500, 12-21:500, 12-28:250) at `'2026-09-28'` → `{ cd: 1875, weeks: 5 }`; UAT (09-14…10-05) at `'2026-09-28'` → `{ cd: 125, weeks: 1 }`; Cindy POS (ends 09-28) → `null`; two assignments in the same week count once for N; `futureLoad` of POS rows (r8 §6.3) at `'2026-09-28'` → 2 500; a completed task's later rows excluded.

**S1.7 Done-check.** `pnpm vitest run --project unit src/domain --coverage` (domain ≥ 95 %) · `pnpm eslint src/domain`.

### 5.S2 — Grid and allocation backend (backend-engineer · owns `src/server/**`, `src/app/api/**`, `scripts/**`)

Starts after S1. Integration tests live next to the code (`*.int.test.ts`), are written **first**, pin `APP_NOW=2026-09-30T10:00:00+07:00` + `ALLOW_TEST_HOOKS=1`, and use golden data (`seedGolden` + `applyFixture`) or `createWorld({ with: ['allocations'] })`. Rules for every step: authz before data (except the lookup that finds the owner); one `db.transaction` per action/route; services take `tx` and `today`; every `allocations` query has a `week_start` bound; no `refresh()`; no Thai literals (`th.*` only); `numeric` ↔ cd only in `repo/allocations.ts`.

**S2.1 `repo/allocations.ts` (BR-02, §6.5, M6-D24; names M7 reuses ★).**
```ts
export interface WeekRange { from: ISODate; to: ISODate }                 // [from, to), Mondays — REQUIRED on every list/sum
export interface AllocRow { taskAssignmentId: string; granularity: 'WEEK' | 'DAY'; periodStart: ISODate; weekStart: ISODate; cd: Cd }   // ★
export async function listForProject(tx: DbOrTx, projectId: string, range: WeekRange): Promise<AllocRow[]>          // live assignments of live tasks
export async function listForWeeks(tx: DbOrTx, assignmentIds: readonly string[], weeks: readonly ISODate[]): Promise<AllocRow[]>   // ★ week_start = ANY($weeks) AND between min/max
export async function deleteWeek(tx: Tx, assignmentId: string, week: ISODate): Promise<number>                       // ★ always first in a rewrite
export async function insertWeekPlan(tx: Tx, assignmentId: string, week: ISODate, plan: WeekPlan): Promise<void>     // ★ WEEK row or non-zero DAY rows
export function plansFromRows(rows: readonly AllocRow[]): Map<string, Map<ISODate, WeekPlan>>                         // ★ pure; mixed granularity → internal error
/** Counted rowTotal per assignment (BR-50) over a range; certainty applied by the caller. */
export async function sumCountedByAssignment(tx: DbOrTx, assignmentIds: readonly string[], range: WeekRange): Promise<Map<string, Cd>>
/** §6.5 builder (M6-D24): live assignment/task, project not deleted and not archived, BR-50, coalesce certainty. */
export async function loadByUserWeek(tx: DbOrTx, o: { userIds: readonly string[]; range: WeekRange; excludeProjectId?: string; projectId?: string }): Promise<Map<string, Record<ISODate, LoadPair>>>
/** Rows (weekStart, cd) of the live assignments of `taskIds` in (afterWeek, bound) — BR-52. */
export async function listAfterWeek(tx: DbOrTx, taskIds: readonly string[], afterWeek: ISODate, bound: ISODate): Promise<{ weekStart: ISODate; cd: Cd }[]>
/** Rows of a project's live tasks/assignments in range with each task's completed_week — FR-406. */
export async function listProjectFuture(tx: DbOrTx, projectId: string, range: WeekRange): Promise<{ weekStart: ISODate; cd: Cd; completedWeek: ISODate | null }[]>
```
SQL sums return integer cd: `(coalesce(sum(a.person_days), 0) * 100)::int` (PLAN §3.6); rows convert with `numericToCd`; writes with `cdToNumeric`. `loadByUserWeek` is SPEC §6.5 verbatim plus `and pr.id <> $exclude` / `= $project` and `(coalesce(…) = 'CONFIRMED')` wrapped in `coalesce(sum(...) filter (...), 0)` (PLAN §1.3).
`src/server/repo/task-assignments.ts` (M3; namespace `repo.assignments` per M3-D39 — already in the repo barrel) changes **additively** (M6-D36):
- M3's `listActiveForProject(tx, projectId)` also selects `ta.version` → return type `{ id: string; taskId: string; userId: string; version: number }[]` (same `WHERE`, same `ORDER BY ta.created_at, ta.id`). M3's `listProjectTasks` keeps mapping only `assignmentId`/`userId`, so its DTOs and exact-key tests are unaffected; re-run `src/server/services/tasks.int.test.ts` to prove it.
- New ★ `bumpVersions(tx: Tx, ids: readonly string[]): Promise<Map<string, number>>` (`UPDATE task_assignments SET version = version + 1 WHERE id = ANY($1) RETURNING id, version`; `ids` empty → empty map without a query), called as `repo.assignments.bumpVersions`.
- No `listActiveForTasks` is added (one loader per concept, M3-D39).
Tests first `src/server/repo/allocations.int.test.ts`:
- `numeric round trip` — `insertWeekPlan(WEEK 375)` → `person_days '3.75'` → `listForWeeks` → 375; DAY `[50,50,100,50,50,0,0]` week 2026-09-28 → 5 rows `'0.50','0.50','1.00','0.50','0.50'`; `deleteWeek` returns 5, other weeks untouched; a DAY row dated 2027-01-01 lands in week 2026-12-28.
- `§6.5 parity` (X03) — world + nested tasks with overrides at every depth (task, parent, grandparent, none) and project certainties both ways: for each user × week, `loadByUserWeek` equals the sum computed in TS with M3's `effectiveCertainty` + `splitLoad` + `countsTowardLoad`; archived project A and soft-deleted tasks/assignments excluded (BR-44).
- `excludeProjectId` — world: `coworker` in P with `excludeProjectId = P` → only `W 2026-10-05 = { 300, 300 }` (Q).
- `sumCountedByAssignment` — `pDoneMember` → 100 (10-05 excluded by BR-50); golden Rollout สาขา → 1875.
- Guard test `src/server/repo/allocations-import-guard.test.ts` (unit): scanning `src/server/**/*.ts` (except this repo file, `db/schema.ts`, tests) finds no import of the `allocations` table object (r5 M6-20).

**S2.2 Grid chunk service + route (`services/grid.ts#buildChunk`, FR-805–809, X28/X29/X76, M6-D2/D7/D8/D12/D20).**
```ts
export async function buildChunk(tx: DbOrTx, user: SessionUser, ctx: { kind: 'project'; id: string }, p: ChunkParams, today: ISODate): Promise<GridResponse> {
  const access = await authz.requireProject(tx, user, ctx.id, 'view')           // 404 invisible; archived allowed (X42)
  const project = await repo.projects.getProject(tx, ctx.id)                    // M2 repo
  if (!project) throw new NotFoundError()                                       // unreachable after requireProject; keeps the type non-null
  const tasks: TaskListRow[] = await repo.tasks.listLiveWithBlockerCounts(tx, ctx.id)   // M3-D39, reused unchanged: no assignees; blockersOpen/blockersTotal, completedOn/completedWeek, statusCategory
  const assignments = await repo.assignments.listActiveForProject(tx, ctx.id)  // M3-D39 + `version` (S2.1): { id, taskId, userId, version } ORDER BY created_at, id
  const range = { from: p.from, to: p.to }
  const rows = await repo.allocations.listForProject(tx, ctx.id, range)
  const tl = timelineBound(today)                                               // [weekStart(today) − 156 w, weekStart(today) + 157 w)
  const totals = await repo.allocations.sumCountedByAssignment(tx, assignments.map((a) => a.id), tl)
  const userIds = unique(assignments.map((a) => a.userId))
  const cap = await capacity.loadCapacity(tx, userIds, range)                   // M5: W: capacity/standard
  const leave = await repo.timeOff.listSpans(tx, userIds, p.from, p.to)        // M5 repo, masked below
  const holidays = await holidaysSvc.listHolidaysInRange(tx, range)
  const others = p.includeOthers ? await repo.allocations.loadByUserWeek(tx, { userIds, range, excludeProjectId: ctx.id }) : null
  return assembleGrid({ project, access, tasks, assignments, rows, totals, cap, leave, holidays, others, p, today, viewer: user })   // pure helper below
}
```
- Run the route in one read-only tx: `db.transaction((tx) => buildChunk(...), { isolationLevel: 'repeatable read', accessMode: 'read only' })`. Route `GET /api/grid/project/[projectId]`: `route(handler, { query: gridQuerySchema })` — query parse (400) precedes authz; the handler parses `params.projectId` with `z.uuid()` and throws `NotFoundError` on a malformed id (X86, like M2's `projectAccess`); default window when `from`/`to` are absent: `from = addWeeks(weekStart(today), -4)`, `to = addWeeks(weekStart(today), 12)` (X65); `ChunkParams` = `{ from, to, expand: [], zoom: 'week', includeOthers }`; `today = serverToday()`.
- `assembleGrid` (pure, exported for unit tests in `src/server/services/grid-assemble.test.ts`):
  - `periods` = `weekRange(from, to).map((w) => ({ key: \`W:${w}\`, kind: 'WEEK', weekStart: w, date: w }))`.
  - Rows: M3's query returns rows ordered `depth, parent_id, position, id` (not depth-first), so `assembleGrid` builds the tree in memory (children grouped by `parentId`, each group sorted by `position` then `id` with plain `<` string comparison = `COLLATE "C"` for the ASCII order keys) and emits it depth-first; each task row is followed by its assignee rows (list order = `created_at`, `id`). `hasChildren` = the task has live children in that map; `assigneeCount` = its assignments. Task row from `TaskListRow`: `depth` narrowed to `0 | 1 | 2`; `certainty`/`certaintySource`/`certaintySourceName` from M3's `resolveCertainty(chain, project.certainty)` (chain of `certaintyOverride` from the in-memory task map, BR-35/36); `completed = completedOn !== null` (BR-80: `completed_on` is set by M3's `setStatus` when the status category becomes `DONE`); `completedWeek` (BR-50); `blockers = { open: row.blockersOpen, total: row.blockersTotal }` (X76); `milestoneId: null`, `lateForMilestone: false` (X28); `assigneeCount`; `hasChildren`; `totals[W:w]` = Σ over its leaves' cells of `splitLoad(cd, leafCertainty)` where `countsTowardLoad(w, leaf.completedWeek)` (BR-50, M6-D12) — the **task-total aggregate** (`aggregateTaskTotals`, exported).
  - Assignee row: `cells[W:w]` = WEEK → `{ cd, resolution: 'WEEK', derived: false }`; DAY → `{ cd: Σ days, resolution: 'DAY', derived: false, days: { [date]: cd } }` (BR-20a); `editable = access.canEdit && !task.hasChildren` (canEdit = !archived; M/L/Me all edit, PERM-12); `rowTotal = splitLoad(totals.get(id) ?? 0, leafCertainty)` (M6-D7).
  - `people[u]` for every assignee user: `name = displayName(u)`, `active = !banned && deactivated_on == null`, `deactivatedOn`, `capacity`/`standard` W: keys from `UserCapacity.weeks` (zeros kept for weeks in range), `timeOff` = `maskTimeOff(row, authz.canSeeLeaveDetails(viewer, row.userId))` → `{ start, end, half, label: kind === 'full' ? leaveTypeName : th.masking.leave }` (explicit literal, never spread), `otherProjects` (only when included) keyed `W:` — the **other-projects aggregate**.
  - `context = { kind: 'project', id, name, archived, canEdit }`; `window = { from, to, expand: [], zoom: 'week', includeOthers }`; `today`; `milestones: []`; `holidays`.
- Tests first `src/server/services/grid.int.test.ts` (golden F1 unless noted):
  - `shape` — POS as cindy over `[2026-09-28, 2026-11-23)`: 8 periods `W:2026-09-28…W:2026-11-16`; rows = 3 task rows each followed by 1 assignee row, in JSON order; Cindy cell `W:2026-09-28 = { cd: 250, resolution: 'WEEK', derived: false }`; Rollout สาขา `certainty 'TENTATIVE'`, `certaintySource 'task'`; `milestones` `[]`; every task row `lateForMilestone false`, `blockers { open: 0, total: 0 }`.
  - `rowTotal` (r8 §4.5) — Cindy POS `{ 1875, 1875 }`, Ivy POS `{ 875, 875 }`, Mint Rollout `{ 1875, 0 }` (all-time, independent of the chunk).
  - `footer data` — POS `people` = Cindy, Ivy, Mint with `capacity['W:2026-10-19'] = 500`; F2 → 400 each (§8.3 mock 12.0).
  - `default window` — no `from`/`to` → `window.from '2026-08-31'`, `to '2026-12-21'`, 16 periods.
  - `blockers` (X76) — POS task A blocked by B (M3 `addTaskBlocker` service) → A `{ open: 1, total: 1 }`; complete B through `setStatus` → `{ open: 0, total: 1 }`.
  - `BR-50` — world `pDoneMember`: cells W:10-05 = 200 present, task totals W:10-05 absent/0, rowTotal 100.
  - `WAITING counts` (FR-628/BR-87) — move Cindy's POS task to "รอข้อมูล" → totals unchanged.
  - `DAY week` — world `pChildAMember` W:2026-10-12 = `{ cd: 100, resolution: 'DAY', days: { '2026-10-12': 50, '2026-10-13': 50 } }`.
  - `parents` — nest two golden POS leaves under a new parent (M3 `moveTask`) → parent `totals` = Σ children, `hasChildren true`, no assignee rows under it.
  - `AC-203` — deactivate Cindy (M1 service) → POS still has Cindy's row and cells; `people[cindy].active === false`, `deactivatedOn '2026-09-30'`, `capacity['W:2026-10-05'] = 0`.
  - `archived` — archive POS → GET as cindy 200 with `context.archived true`, `canEdit false`, every `editable false`.
  - `includeOthers` (X29) — POS as manager → `people[cindy].otherProjects['W:2026-10-05'] = { total: 250, committed: 0 }` (CRM), `people[mint].otherProjects['W:2026-09-28'] = { 250, 250 }` (Mobile); `JSON.stringify` contains no CRM/Mobile name or id; archived CRM → no CRM load (BR-44).
  - `route` — `GET /api/grid/project/<POS>?from=2026-09-29&to=2026-10-26` → 400; as peter → 404; `GET /api/grid/project/not-a-uuid` → **404** `NOT_FOUND` (the handler parses `projectId` with `z.uuid()` and maps a malformed id to 404, X86; query-string errors stay 400); JSON body equals the service result; `Cache-Control: private, no-store`.

**S2.3 Save pipeline helpers (`services/allocations.ts`, X65, r6b §4.8; names M7 calls ★).**
```ts
export interface LockedAssignment { id: string; version: number; userId: string; taskId: string; projectId: string; isLeaf: boolean; completedWeek: ISODate | null; certainty: Certainty }
/** taskIds = distinct task ids of the locked assignments, sorted — M8-D12 computes `lateness` from them at the end of save/planRange (C77). */
export interface LockedSet { rows: LockedAssignment[]; ids: string[]; userIds: string[]; taskIds: string[]; byId: Map<string, LockedAssignment>; userOf(id: string): string }
/** ★ SELECT ta.id, ta.version, ta.user_id, t.id, t.project_id … FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
 *  WHERE ta.id = ANY($ids) AND ta.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY ta.id FOR UPDATE OF ta   (deterministic, r6b E11)
 *  Any requested id missing → NotFoundError (whole batch, never reveals which). */
export async function lockAssignments(tx: Tx, items: readonly { taskAssignmentId: string }[]): Promise<LockedSet>
/** ★ requireProject(tx, user, projectId, 'edit') once per distinct project (sorted): invisible → 404 for the batch; archived → 403 (X42). Non-leaf task → ValidationError. */
export async function authorizeItems(tx: Tx, user: SessionUser, locked: LockedSet): Promise<void>
/** ★ Any baseVersion ≠ locked version → ConflictError('VERSION_CONFLICT', th.grid.toast.conflict, { current: SaveItemResult[] }) for the mismatching items
 *  (their current WeekStates for the weeks the request touched + rowTotal) — read before throwing; nothing written. */
export async function assertVersions(tx: Tx, items: readonly SaveAllocationsItem[], locked: LockedSet, today: ISODate): Promise<void>
```
Effective certainty per locked task is resolved with one query on the 2-level parent chain + `resolveCertainty` (needed for `rowTotal` pairs). Tests come with S2.4.

**S2.4 `save` (`saveAllocations`, BR-20b, BR-26, X27, X65, M6-D3/D4/D29/D34).**
```ts
export async function save(tx: Tx, user: SessionUser, input: SaveAllocationsInput, today: ISODate): Promise<SaveAllocationsOk> {
  const locked = await lockAssignments(tx, input.items)
  await authorizeItems(tx, user, locked)
  await assertVersions(tx, input.items, locked, today)
  const pairs = groupByWeek(input.items)        // (assignmentId, week) → WeekChange[] in input order; DAY: week = weekStart(period), dayIndex = isoWeekday(period) − 1
  const weeks = uniqueSorted(pairs.map((p) => p.week))
  const current = repo.allocations.plansFromRows(await repo.allocations.listForWeeks(tx, locked.ids, weeks))
  const ctx = await loadWeekCtx(tx, locked.userIds, weeks)      // DayCtx per (user, week) from loadCapacityInputs + capacityByDay (M5)
  const issues: SaveValidationIssue[] = []; const planned: Planned[] = []
  for (const p of pairs) {
    const cur = current.get(p.assignmentId)?.get(p.week) ?? { resolution: null }
    const r = planWeek(cur, p.changes, ctx.get(locked.userOf(p.assignmentId))!.get(p.week)!, input.onDayWeekConflict)
    if (r.kind === 'invalid') issues.push({ taskAssignmentId: p.assignmentId, period: periodOf(p, r.dayIndex), reason: r.reason })
    else if (r.kind === 'needsChoice') issues.push({ taskAssignmentId: p.assignmentId, period: p.week, reason: 'DAY_WEEK' })   // M6 only (M6-D34)
    else planned.push({ ...p, before: cur, next: r.next, changed: r.changed, warnings: r.warnings })
  }
  if (issues.length) throw new ValidationError({}, issues.some((i) => i.reason === 'DAY_WEEK') ? th.grid.errors.dayWeek : th.grid.errors.invalidBatch, { issues })
  for (const p of planned) if (p.changed) {
    await repo.allocations.deleteWeek(tx, p.assignmentId, p.week)            // DELETE first (SPEC §6.3)
    await repo.allocations.insertWeekPlan(tx, p.assignmentId, p.week, p.next)
  }
  const changedIds = uniqueSorted(planned.filter((p) => p.changed).map((p) => p.assignmentId))
  const versions = await repo.assignments.bumpVersions(tx, changedIds)       // no-op items keep their version (M6-D3)
  await auditItems(tx, user, planned, locked, input.clientOpId)              // one row per changed assignment (M6-D29)
  return { results: await resultsFor(tx, input.items, planned, current, versions, locked, today), warnings: toSaveWarnings(planned) }
}
```
- `ValidationError`'s third argument is M1's `extra` (`AppError.extra` spreads into the action result → `{ ok: false, code: 'VALIDATION', message, issues }`). If M1's `ValidationError` constructor lacks the `extra` parameter, add it there (same file) and report.
- `results[i]` = `{ taskAssignmentId, version (bumped or unchanged), weeks: { [w]: WeekState } for every touched week, rowTotal }` (fresh `sumCountedByAssignment` over the timeline bound).
- DB errors: `P0001` (`WEEK_DAY_CONFLICT`) and `23P01` on `allocations_one_resolution_per_week` → `AppError('INTERNAL')` (logged as `{ name, code }`, never params; M6-D5). M1's `mapDbError` maps every `23P01` to `OVERLAP` (correct for M5's `time_off_no_overlap`), so S2 adds a per-constraint branch **before** the generic one in `src/server/errors.ts` (S2 owns `src/server/**`): `pgErrorInfo(e).constraint === 'allocations_one_resolution_per_week'` → `new AppError('INTERNAL')`; test in `src/server/errors.test.ts`: `{ cause: { code: '23P01', constraint_name: 'allocations_one_resolution_per_week' } }` → `INTERNAL`, `{ cause: { code: '23P01', constraint_name: 'time_off_no_overlap' } }` → still `OVERLAP` (G23; use whatever field `pgErrorInfo` already reads for the constraint name). The action wraps the transaction in `withDeadlockRetry` (one retry on `40P01`; `src/server/db/retry.ts`).
- Action `saveAllocations`: `action(saveAllocationsSchema, (input, { user }) => withDeadlockRetry(() => db.transaction((tx) => services.allocations.save(tx, user, input, serverToday()))))` — no `refresh()` (PLAN §1.3). `save`/`planRange` take `today` as a required parameter and never import `clock.ts`, and they write their own audit rows (X59), so a script can call them directly (X90; under M11-D34 their `AUDIT_IN_SERVICE` entry would be `true`, X96).
Tests first `src/server/services/allocations.int.test.ts` (golden F1 + world):
- `single edit` — cindy, CRM Cindy `W 2026-10-05 = 300` → one WEEK row `3.00`; `results[0] = { version: 2, weeks: { '2026-10-05': { cd: 300, resolution: 'WEEK' } }, rowTotal: { 1550, 0 } }`; 1 audit row (`entity 'allocation'`, `entityId` = assignment id, `projectId` = CRM, `before.weeks`/`after.weeks`, `after.clientOpId`).
- `AC-801 batch` — Cindy CRM 6 weeks 10-05…11-09 → 300 each in one item → 6 rows of 300, version 2, **one** audit row; CRM rowTotal 1800.
- `clear` — `cd null` and `cd 0` delete the WEEK row; deleting an absent week is a no-op (no version bump, no audit, M6-D3).
- `multi-assignment` — AC-803 shape: Cindy + Ivy POS, 4 weeks each → 8 rows, 2 audit rows, both versions +1, lock order by id (assert via a spy on the executed SQL or `pg_locks` in a second connection).
- `all-or-nothing` — item A valid, item B on Q's `qTaskOutsider` as lead → `NOT_FOUND`; A unchanged, no audit; as manager both succeed (visible).
- `version` — `baseVersion 1` twice in a row (second stale) → `VERSION_CONFLICT` with `current[0].version = 2` and the stored week; nothing written.
- `X27 / M6-D34` — world `pChildAMember`, `W 2026-10-12 = 150` → `VALIDATION`, `issues [{ period: '2026-10-12', reason: 'DAY_WEEK' }]`, message `th.grid.errors.dayWeek`, rows unchanged, version 1; same with `onDayWeekConflict: 'SCALE'` → same; with `'COLLAPSE'` → one WEEK row 150, the two DAY rows gone; `W 2026-10-12 = 100` (= Σ) **with `'COLLAPSE'`** → one WEEK row 100 (BR-23, M7-D2); `W 2026-10-12 = 100` without a choice → no-op; `W null` → both DAY rows deleted; snapshot replay: 7 DAY changes `{10-12: 50, 10-13: 50, others null}` onto WEEK 150 → the two DAY rows again.
- `BR-26` — DAY `cd 125` rejected by zod (400 at the action); domain `MAX` path covered by unit tests.
- `warnings` — WEEK 250 on a week whose capacity is 0 (user deactivated before that week) → `warnings [{ code: 'WEEK_NO_CAPACITY', … }]`, still written.
- `archived` — `aTaskMember` → `FORBIDDEN`; outsider on P → `NOT_FOUND`.
- `parent` — an assignment on a task that has children (constructed via factories) → `VALIDATION`.

**S2.5 `planRange` (`planAssignmentRange`, FR-612, BR-25, M6-D6).**
```ts
export async function planRange(tx: Tx, user: SessionUser, input: PlanAssignmentRangeInput, today: ISODate): Promise<PlanAssignmentRangeOk> {
  const locked = input.dryRun ? await peekAssignment(tx, input.taskAssignmentId) : await lockAssignments(tx, [input])
  await authorizeItems(tx, user, locked)                       // edit; archived → 403 even for dryRun
  if (!input.dryRun) await assertVersions(tx, [{ ...input, baseVersion: input.baseVersion!, changes: [] }], locked, today)
  const weeks = weekRange(weekStart(input.start), addDays(weekStart(input.end), 7))
  const current = repo.allocations.plansFromRows(await repo.allocations.listForWeeks(tx, locked.ids, weeks)).get(input.taskAssignmentId)
  const ctx = (await loadWeekCtx(tx, locked.userIds, weeks)).get(locked.userIds[0]!)!
  const r = planRange(input.totalCd, input.start, input.end, weeks.map((w) => ({ week: w, ctx: ctx.get(w)!, current: current?.get(w) ?? { resolution: null } })))
  if (!r.ok) throw new ValidationError({}, th.plan.errors.unrepresentable, { issues: [{ taskAssignmentId: input.taskAssignmentId, period: r.week, reason: 'UNREPRESENTABLE' }] })
  const preview = toPreview(r, current, locked)                // before/after WeekState per week, capacity, warnings, version = locked version
  if (input.dryRun) return { preview, applied: null }
  for (const w of r.weeks) if (w.changed) { await repo.allocations.deleteWeek(tx, input.taskAssignmentId, w.week); await repo.allocations.insertWeekPlan(tx, input.taskAssignmentId, w.week, w.next) }
  const versions = await repo.assignments.bumpVersions(tx, [input.taskAssignmentId])
  await audit.log(tx, user, { entity: ALLOCATION_AUDIT_ENTITY, entityId: input.taskAssignmentId, action: 'update', projectId: locked.rows[0]!.projectId,
    summary: th.audit.planRangeApplied(personName, taskName, formatCd(input.totalCd, { unit: 'DAYS', decimals: 2 }), formatThaiDateRange(input.start, input.end)), before, after })
  return { preview, applied: { taskAssignmentId: input.taskAssignmentId, version: versions.get(input.taskAssignmentId)!, weeks: preview-after map, rowTotal } }
}
```
`peekAssignment` = the same select without `FOR UPDATE`. `formatThaiDateRange` is M5's `src/lib/format.ts` helper (isomorphic). Action: `planAssignmentRange = action(planAssignmentRangeSchema, …)` wrapping `withDeadlockRetry(db.transaction(...))`; no `refresh()`.
Tests first `src/server/services/plan-range.int.test.ts` (golden F1, `asUser(cindy)` on POS UAT = Ivy):
- `r8 1000 cd over 11-11..11-24` — dryRun → 3 preview weeks (`BOUNDARY`, `WHOLE`, `BOUNDARY`) with `after` as S1.5, `capacityCd 1000`, `overCapacityCd 0`, `version 1`; nothing written, no audit; apply with `baseVersion 1` → DAY rows 11-11/12/13 = 1.00, WEEK 11-16 = 5.00, DAY 11-23/24 = 1.00; version 2; one audit row.
- `UNREPRESENTABLE` — 400 over 11-11..11-13 → `VALIDATION`, `issues[0] = { period: '2026-11-09', reason: 'UNREPRESENTABLE' }`.
- `replace within range only` — Ivy UAT has WEEK 09-28 = 250; plan 100 over 09-30..10-02 → week 09-28 DAY `[50,50,34,33,33,0,0]` (Mon/Tue from the split 50/50, in-range 100 distributed); 10-05 untouched.
- `N = 0` — clears a whole week; boundary days in range set to 0, outside kept.
- `F3 fallback` — `applyFixture('F3')`, as peter, 200 over 10-05..10-06 → warnings `WORK_ON_NON_WORKING_DAY` ×2, fallback `SCHEDULE`.
- `stale` — apply with `baseVersion 1` after a grid save → `VERSION_CONFLICT`.
- `AC-604 (X14)` — Mobile task "งาน AC604" (factory) assigned Jack and Mint; plan Jack 300 and Mint 200 over 11-16..11-20 → two WEEK rows (300, 200); `buildChunk` Mobile `W:2026-11-16` rows 300 / 200, task totals 500; `loadByUserWeek` Jack 11-16 = 300 + 250 (Store) and Mint 11-16 = 200.
- `archived` — dryRun on `aTaskMember` → `FORBIDDEN`.

**S2.6 Week context helper (`services/allocations.ts#loadWeekCtx`, internal).** `loadWeekCtx(tx, userIds, weeks): Promise<Map<userId, Map<ISODate, DayCtx>>>` from M5's `loadCapacityInputs` (range `[min(weeks), max(weeks) + 7)`): `dayCaps` = `capacityByDay` capacity per day, `schedule` = `standardDayCd`, `timeOff[i]` = any live span covers that date. M7 replaces it with its `services/day-context.ts#loadDayCtx` (M7-D25); keep the signature compatible. Unit-tested through S2.4/S2.5.

**S2.7 BR-52 in `setStatus` (`services/taskStatus.ts`, X19, X71, M6-D16).** After the status update inside M3's `setStatus`: `newlyCompleted = changed rows whose previous completed_on was null and new completed_on = today`; `released = await allocationsSvc.releasedLoadForTasks(tx, newlyCompleted, today)` = `completed.releasedLoad(await repo.allocations.listAfterWeek(tx, ids, weekStart(today), addWeeks(weekStart(today), 157)), weekStart(today))`; return it in `SetTaskStatusResult.released`. `revertStatuses` returns `released: null`. Never touches allocations (BR-51, BR-87).
Tests first — extend `src/server/services/task-status.int.test.ts › BR-52` (golden): `completeTask([Rollout สาขา])` → `released { cd: 1875, weeks: 5 }`; `setTaskStatus([UAT], firstDone)` → `{ 125, 1 }`; Cindy POS task (plans end 09-28) → `null`; `withChildren` on a parent whose two children have 100 and 200 after this week → `{ 300, n }`; a second DONE status move (DONE → DONE) → `null`; `uncompleteTask` → `null` and `buildChunk` shows the later weeks counted again (BR-51); allocations row count unchanged before/after; the M3 completion invariant still holds.

**S2.8 FR-406 X in `archiveProject` (`services/projects.ts` + action, X17, M6-D17).** Before `setProjectArchived(true)`: `releasedCd = completed.futureLoad(await repo.allocations.listProjectFuture(tx, projectId, { from: weekStart(today), to: addWeeks(weekStart(today), 157) }), weekStart(today))`; the action returns `{ changed, releasedCd }` (`today = serverToday()`); unchanged `refresh()` behaviour (M2-D09). Tests first — extend `src/server/services/projects.int.test.ts › archive X`: golden POS → `releasedCd 2500`; Store → 3500; DW (current week 09-28 included; r8 §6.3: 500 + 500 + 375 + 250) → **1625**; complete Rollout first → POS 625; a project without plans → 0.

**S2.9 Plans follow tasks (X13, X20, FR-610).** No new code expected — verify and extend M3's tests:
- `src/server/services/tasks.int.test.ts › AC-603` — the child 2 assignment gets `makeAllocation(W 2026-11-16 = 200)` before the parent delete; after `restoreTaskBatch` the row is still there and `buildChunk` shows it under child 2; during the deleted state `buildChunk` has neither the rows nor the cell and `loadByUserWeek` excludes it.
- `› FR-610 plans` — UAT (Ivy, 4 WEEK rows) gets its first child through `createTask(parentId)` → the assignment (same id, version +1) now belongs to the child; the 4 rows unchanged; undo moves them back.
- `src/server/services/time-off.int.test.ts › BR-42` (M5) — add an `allocations` checksum (count + Σ `person_days`) to the "unchanged" assertion.

**S2.10 Perf smoke (`src/server/services/grid.perf.int.test.ts`, M6-D22).** `addSyntheticGridProject(db, { tasks: 200, weeks: 16, from: '2026-09-28' })`; `buildChunk` for `[2026-09-28, 2026-11-23)` and `[2026-11-23, 2027-01-18)` as cindy: each < 1 000 ms (`performance.now()`), logs both timings; response contains 220 task rows + 200 assignee rows. Not part of the 95 % gate; skipped when `CI_SKIP_PERF=1`.

**S2.11 Done-check.** `pnpm vitest run --project integration src/server scripts` · `pnpm vitest run --project unit src/server` · `pnpm eslint src/server src/app/api scripts` · `pnpm typecheck` (own paths clean).

### 5.S3 — PlanGrid (grid-engineer · owns `src/components/grid/**`, `src/lib/grid/**`)

Starts after S1, in parallel with S2 (code against S0's contracts). Pure helpers in `src/lib/grid/**` are **test-first** (`unit` project, isomorphic, may import `src/domain/**` and `src/lib/contracts/**` only); components get focused `ui` tests with `offsetWidth`/`offsetHeight` stubs (r4 §16); full interaction is covered by S6 in Playwright. Dense cells are plain `div`s with one CSS Module class and `data-*` state reading `var(--…)` tokens (PLAN §3.9) — no MUI component, `sx` or `Tooltip` per cell (one shared tooltip). Every string from `th`. Shortcuts via `e.code` first (X49). No `localStorage` (X53). Names marked ★ are reused by M7/M8/M9.

**S3.1 ★ Column model (`src/lib/grid/columns.ts`, FR-801, M6-D15, M6-D35).** The `GridColumn` shape and the `buildColumns` signature are **M7's** (`plan/m07-daily-resolution.md` S3.1) so M7 only adds branches: M6 is the base, M7 extends it compatibly (G26).
```ts
export const WEEK_W = 64, NAME_W = 260, TOTAL_W = 72, ROW_H = 32, HEADER_H = 40, CHUNK_WEEKS = 8, TIMELINE_WEEKS = 156
/** ARIA bookkeeping (C27): header rows above the body (M8 adds the ◆ row → 2) and footer rows below it. Every aria-rowindex /
 *  aria-rowcount is computed from these — never a literal. */
export const HEADER_ROWS = 1, FOOTER_ROWS = 3
export type ColKind = 'W' | 'D'                                   // W = week column (M7: also the "รวม" column of an expanded week); D = day column (M7)
export interface GridColumn { key: PeriodKey; kind: ColKind; role: 'week' | 'day' | 'weekTotal'; weekStart: ISODate; date: ISODate; width: number; offset: number }
export function timelineStart(today: ISODate): ISODate                       // addWeeks(weekStart(today), −156)
export function timelineWeeks(today: ISODate): ISODate[]                     // the 313 Mondays [timelineStart, weekStart(today) + 157 w)
/** M6: one { kind: 'W', role: 'week', key: `W:${w}`, weekStart: w, date: w, width: WEEK_W } per week, offsets cumulative from 0.
 *  M6 always passes `new Set()` / `new Map()`; a non-empty `expanded` throws RangeError('day columns arrive in M7') — M7 replaces that branch. */
export function buildColumns(weeks: readonly ISODate[], expanded: ReadonlySet<ISODate>,
                             dayDatesByWeek: ReadonlyMap<ISODate, readonly ISODate[]>): GridColumn[]
export function columnIndexOfPeriod(cols: readonly GridColumn[], key: PeriodKey): number   // ★ M8 places ◆; −1 when absent
export function chunkStartOf(today: ISODate, week: ISODate): ISODate         // aligned to timelineStart, multiples of 8 weeks
/** Visible weeks (from the column virtualizer: cols[first].weekStart … cols[last].weekStart) → chunk starts, ± 1 chunk, clamped to the timeline.
 *  Takes weeks, not column indexes, so M7's day columns do not change chunking. */
export function chunksForRange(today: ISODate, firstWeek: ISODate, lastWeek: ISODate): ISODate[]
export function initialScrollIndex(cols: readonly GridColumn[], today: ISODate): number   // columnIndexOfPeriod(cols, W:(weekStart(today) − 4 w))
```
Tests first `columns.test.ts` (today 2026-09-30; `cols = buildColumns(timelineWeeks(today), new Set(), new Map())`): 313 columns, every one `kind 'W'`, `role 'week'`, width 64; first `W:2023-10-02` (= 2026-09-28 − 156 w), last `W:2029-09-24`; `columnIndexOfPeriod(cols, 'W:2026-09-28') = 156`, unknown key → −1; `initialScrollIndex(cols, today) = 152` (`W:2026-08-31`); `chunkStartOf(today, '2026-09-28') = '2026-08-31'` (index 152 = 19 × 8, so the golden window starts a chunk); `chunksForRange(today, '2026-08-31', '2026-12-14')` (indexes 152…167) → `['2026-07-06', '2026-08-31', '2026-10-26', '2026-12-21']` (2 visible + 1 overscan each side); offsets `[0, 64, 128 …]`; `buildColumns(weeks, new Set(['2026-09-28']), new Map())` throws `RangeError`. M7's `columns.day.test.ts` "nothing expanded → identical to M6's output" is the regression guard.

**S3.2 ★ Fetch + merge (`src/lib/grid/fetch.ts`, `src/lib/grid/merge.ts`; X65, M7-D17).**
```ts
/** URL mapping pinned here: GridChunk.zoom 'WEEK'|'DAY' → zoom=week|day (omitted when 'WEEK'); expand[] → comma list (omitted when empty);
 *  includeOthers → '1' (omitted when false); to = from + 8 weeks. */
export function gridChunkUrl(ctx: GridCtx, chunk: GridChunk): string        // `/api/grid/${ctx.kind}/${ctx.id}?from=…&to=…`
export async function fetchGridChunk(ctx: GridCtx, chunk: GridChunk, signal: AbortSignal): Promise<GridResponse>   // getJson<GridResponse>(gridChunkUrl(ctx, chunk), { signal }) (M2 `src/lib/api.ts`); non-2xx → throws `ApiError`
export interface GridModel { context: GridResponse['context']; today: ISODate; rows: GridRow[]; cells: Map<string /*rowKey*/, Map<PeriodKey, AssigneeCell>>
  periods: GridPeriod[]                        // ★ merged periods of every loaded chunk, unique by key, in timeline order — M7 reads the D: dates per week from it (C87)
  people: Record<string, GridPerson>; holidays: Map<ISODate, string>; loadedWeeks: Set<ISODate> }   // M8 adds milestones (latest chunk wins)
export function mergeChunks(chunks: readonly (GridResponse | undefined)[]): GridModel | null   // rows by task id / taskAssignmentId (latest chunk wins for row fields), cells, periods and people keys unioned
```
Tests first: `gridChunkUrl({ kind: 'project', id: 'p' }, { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false })` → `/api/grid/project/p?from=2026-09-28&to=2026-11-23`; with `includeOthers: true` → `…&includeOthers=1`; `zoom: 'DAY', expand: ['2026-10-05']` → `…&expand=2026-10-05&zoom=day` (M7 ready); `mergeChunks` of two adjacent chunks keeps one row per id, all 16 week cells, 16 `periods` in order (no duplicates), people capacities from both.

**S3.3 ★ Row model (`src/lib/grid/rows.ts`, FR-805, §8.3, M6-D11/D12/D33).**
```ts
export type RowKey = `t:${string}` | `a:${string}`
export type ViewRow =
  | { key: `t:${string}`; kind: 'task'; task: GridTaskRow; depth: number; collapsed: boolean }                 // ≥ 2 assignees, 0 assignees or parent
  | { key: `a:${string}`; kind: 'merged'; task: GridTaskRow; assignee: GridAssigneeRow; depth: number }        // leaf with exactly 1 assignee
  | { key: `a:${string}`; kind: 'assignee'; task: GridTaskRow; assignee: GridAssigneeRow; depth: number }
export function rowKeyOfTask(id: string): `t:${string}`; export function rowKeyOfAssignment(id: string): `a:${string}`
export function buildViewRows(m: GridModel, o: { showCompleted: boolean; collapsed: ReadonlySet<string> }): ViewRow[]
export type Editability = 'ok' | 'readOnlyRow' | 'unassigned' | 'archived' | 'dayWeek' | 'noEdit'
export function cellEditability(row: ViewRow, cell: AssigneeCell | undefined, m: GridModel): Editability   // M6-D11 order: noEdit (canEdit false) → archived → readOnlyRow/unassigned → dayWeek → ok
```
Rules: depth-first order from the response; a completed task (and its subtree when every node is completed, M3-D6) is hidden when `showCompleted` is false; collapsed parents hide descendants (in memory, M3-D19). Tests first `rows.test.ts`: golden POS → 3 `merged` rows keyed `a:<id>`; a task with Jack + Mint → `t:` row + two `a:` rows; unassigned leaf → `t:` row with editability `unassigned`; parent → `readOnlyRow`; DAY cell → `dayWeek`; archived → `archived`; `showCompleted false` hides `pDone`.

**S3.4 Cells, glyphs, tooltip (`GridCell.tsx`, `grid.module.css`, `CellTooltip.tsx`, FR-804/807/808, BR-20a, M6-D9/D12/D20).**
- `GridCell` (memo by `rowKey`, `periodKey`, cell, editability, unit, capacity, selected/focused flags): text = `formatCd(cd, { unit, baseCd: capacity, decimals: unit === 'FRACTION' ? 2 : 1 })` (merged/assignee rows) or days (task rows ≥ 2 assignees, parents); `data-testid="cell-<rowKey>-<periodKey>"`, `role="gridcell"`, `aria-colindex`, `aria-readonly` when not `ok`, `aria-label = th.grid.cell.label(rowName, formatWeekHeader(week), text || th.grid.cell.empty)`; `data-resolution`, `data-tentative`, `data-not-counted` (after `completedWeek`), `data-leave`, `data-no-capacity`, `data-today`.
- DAY weeks: the number + `StatusGlyph kind="dayDetail"` (⋯); tooltip `th.grid.cell.dayTooltip(parts)` where parts = `จ 0.50 · อ 0.50` (2 decimals, `formatWeekday`).
- Tentative rows: amber left bar (`--tentative-fg #8F5C00` via X51 token), faded number token `#5B6878`, `StatusGlyph kind="tentative"` in the row header (never colour alone); "*" after the name when `certaintySource === 'task'`, otherwise the tooltip `sourceAncestor(name)`.
- Leave: person's week overlaps `timeOff` → `data-leave` stripes + `StatusGlyph kind="leave"`; tooltip one line per entry `th.grid.cell.leave(label, formatLeaveRange(start, end, half))` (M5 helper). Cap 0 → full stripes + `noCapacity` glyph. Holiday weeks: header cell `🎌` + tooltip `th.grid.header.holiday(names)`.
- Not counted (BR-50): faded + tooltip `notCounted`. No load colours anywhere (M6-D20).
- `CellTooltip`: one MUI `Popper` driven by delegated `pointerover`/`focusin` on `[data-tip]` (r5 M6-30); content built by `tooltipFor(rowKey, periodKey, model)` (pure, in `src/lib/grid/tooltip.ts`, tested): 2-decimal exact value, fraction tooltip `th.units.fractionTooltip`, leave lines, DAY parts, not-counted note.
- Tests `src/components/grid/GridCell.test.tsx`: DAY cell shows ⋯ and the hidden text; tentative cell has `data-tentative` and the ◐ hidden text in its row header; leave cell renders the hidden "ลา" text; fraction unit 375/500 renders `0.75`, cap 0 renders days `3.8`.

**S3.5 Chunk queries (`useGridChunks.ts`, PLAN §3.10, r4 §9).** `useGridChunks(ctx, chunkStarts, includeOthers)` = `useQueries({ queries: starts.map((from) => ({ queryKey: qk.gridChunk(ctx, { from, expand: [], zoom: 'WEEK', includeOthers }), queryFn: ({ signal }) => fetchGridChunk(ctx, chunk, signal), placeholderData: keepPreviousData, staleTime: 60_000 })), combine: (rs) => ({ model: mergeChunks(rs.map((r) => r.data)), isError, isFetching }) })`. The visible range comes from the column virtualizer (S3.9) → `chunksForRange`. Loading state = skeleton row in the body (`th.grid.loading`); error = `th.grid.loadError` + retry.

**S3.6 ★ Save queue + mutation (`useSaveAllocations.ts`, `src/lib/grid/queue.ts`, `src/lib/grid/versions.ts`, `src/lib/grid/cache-ops.ts`, §7.4, X65, M6-D3/D14; start from `snippets/r4/client/components/grid/useSaveAllocations.ts`).**
```ts
// queue.ts (pure)
export interface CellWrite { taskAssignmentId: string; granularity: 'WEEK' | 'DAY'; period: ISODate; cd: Cd | null }
export function coalesce(pending: readonly CellWrite[], next: readonly CellWrite[]): CellWrite[]   // last write wins per (assignment, granularity, period), order kept
export function toItems(writes: readonly CellWrite[], versionOf: (id: string) => number): SaveAllocationsItem[]   // grouped per assignment, sorted by id
// versions.ts (module-level per tab, M6-D14)
export function knownVersion(id: string): number; export function rememberVersion(id: string, v: number): void   // keeps the max
// cache-ops.ts (pure)
export function applyWritesOptimistically(resp: GridResponse, writes: readonly CellWrite[]): GridResponse
/** Takes the whole SaveAllocationsOk so M8 applies `ok.lateness` here without a signature change (M8 S3.2). */
export function applyServerResults(resp: GridResponse, ok: SaveAllocationsOk): GridResponse   // ok.results → cells, version, rowTotal, task totals recomputed
export function applyConflicts(resp: GridResponse, current: readonly SaveItemResult[]): GridResponse
// useSaveAllocations.ts
export type SaveState = 'idle' | 'pending' | 'saving' | 'error'
export function useSaveAllocations(ctx: GridCtx): {
  enqueue(writes: readonly CellWrite[], o?: { onDayWeekConflict?: 'COLLAPSE'; immediate?: boolean }): Promise<SaveAllocationsOk | null>
  flush(): Promise<void>; retry(): void; state: SaveState }
```
- `enqueue` applies the writes optimistically at once to every chunk (`qc.setQueriesData(qk.gridAll(ctx), …)`, < 50 ms), coalesces into `pending`, (re)starts a 400 ms debounce; `immediate` (undo/redo, snapshots) flushes first, then sends its own batch with `onDayWeekConflict: 'COLLAPSE'` (never merged with plain edits). Flush also on grid `blur` (focusout leaving the root), `visibilitychange` → hidden, `pagehide`, route change (`usePathname` effect cleanup) and `Cmd+S`.
- `useMutation({ mutationKey: ['saveAllocations', ctx.id], scope: { id: 'grid-save:' + ctx.id }, mutationFn })`: `mutationFn` builds items with `knownVersion` **at send time**, `clientOpId` from a counter (`'op-' + n`; no `randomUUID` on plain HTTP), `unwrap(await saveAllocations(input))`; on success `rememberVersion` per result + `setQueriesData(applyServerResults)` (no refetch) + warnings toast (`th.grid.toast.warning[code]`) + `invalidateAfterGridSave(qc: QueryClient, ctx: GridCtx): void` (exported from `src/lib/grid/save-invalidate.ts`, test `save-invalidate.test.ts`): the `invalidateLoad`-equivalent for **other** views only (`qk.myTasks`, workload/home prefixes) — never the saving context's own `qk.gridAll(ctx)` keys, which are patched, not refetched. It is the single extension point (X82): M8 appends `qk.projectMilestones(ctx.id)` for project contexts (M8-D26), M9 appends `['grid', <the other context kind>]` and `qk.sidebar()` (M9-D22) — so keep it a list of `invalidateQueries` calls with no early return. Unit test: after a project-context save it invalidates `qk.myTasks()` and does **not** invalidate `qk.gridChunk({ kind: 'project', id: 'p' }, …)`.
- `onError`: `VERSION_CONFLICT` → `applyConflicts(err.extra.current)` for those ids, drop their pending writes, mark the undo entries holding them stale (S3.14), `toast.warning(th.grid.toast.conflict)`; `VALIDATION` with `DAY_WEEK` → revert those cells from the cache snapshot + `toast(th.grid.toast.dayWeekReadOnly)`; other errors → if `isMutating(['saveAllocations', ctx.id]) === 1` restore the snapshot else `invalidateQueries(qk.gridAll(ctx))`, keep the batch for `retry()`, `toast.error(th.grid.toast.saveFailed, { action: { label: th.grid.toast.retry, onClick: retry } })`.
- `state` drives `data-save-state` on the grid root and a small status text (`th.grid.save.*`).
- Tests first `src/lib/grid/queue.test.ts` (coalesce, toItems sorted, versions read lazily: `toItems` after `rememberVersion(id, 3)` uses 3), `cache-ops.test.ts` (optimistic write sets cd and resolution `WEEK`; null removes the cell; server results replace cells/version/rowTotal; conflict restores server weeks), `save-queue.test.ts` (`ui`, fake timers + `userEvent.setup({ advanceTimers })`): two enqueues within 400 ms → one action call; blur flushes at once; a failing action restores the snapshot when alone and shows the retry toast; a second queued save keeps order (scope).

**S3.7 ★ Aggregates + footer (`src/lib/grid/aggregate.ts`, ★ `src/components/grid/Footer.tsx` + `FooterCell.tsx`, FR-805/806/809, BR-37/50, M6-D8; the "footer aggregation").** The sticky footer is one component, **`Footer`** (`Footer.tsx`: the `FOOTER_ROWS` = 3 rows ภาระรวม · Capacity · % plus the "รวมงานโปรเจคอื่นของคนเหล่านี้" switch, rendered by `VirtualGrid`), and each cell is a memoised **`FooterCell`** (`FooterCell.tsx`, test ids `cell-footer-{load,capacity,util}-<periodKey>`, M6-D33). M7 adds day cells/tones to these two components (`Footer.day.test.tsx`), M9 adds week tones (C87).
```ts
export function taskTotals(m: GridModel, rows: readonly ViewRow[]): Map<string /*taskId*/, Partial<Record<PeriodKey, LoadPair>>>   // client recompute after optimistic writes
export interface FooterCell { load: LoadPair; capacityCd: Cd; utilizationPct: number | null }
export function footerTotals(m: GridModel, o: { includeOthers: boolean }): { people: string[]; cells: Partial<Record<PeriodKey, FooterCell>> }
export function footerValue(cell: FooterCell, view: LoadView): { loadCd: Cd; pct: number | null }   // pct = floor((200·load + cap) / (2·cap)), null when cap 0
export function rowTotalView(p: LoadPair, view: LoadView): Cd
```
Counted = `countsTowardLoad(week, task.completedWeek)`; committed by the task's effective certainty; footer people = every `people` key (assignees on live tasks); names sorted with `Intl.Collator('th')` for `th.grid.footer.load(names)`. Tests first `aggregate.test.ts` (golden POS response fixture built from r8 §6.3): footer `W:2026-09-14 = 625`, `W:2026-09-21 = 500`, `W:2026-09-28 = 500`, `W:2026-10-05 = 125`, capacity 1500, pct 42 (625/1500 → 41.67 → 42); view COMMITTED on CRM → loads 0; AT_RISK on POS 12-14 → 500; `includeOthers` adds `otherProjects`; cap 0 → pct `null`; parent totals = Σ children.

**S3.8 ★ Keyboard map (`src/lib/grid/keymap.ts`, `useGridKeyboard.ts`, §4.8, X49, M6-D27/D32).**
```ts
export type GridKeyAction =
  | { kind: 'move'; dr: number; dc: number; extend: boolean } | { kind: 'startEdit'; char: string } | { kind: 'commit'; dir: 'down' | 'right' | 'left' }
  | { kind: 'cancel' } | { kind: 'full' } | { kind: 'half' } | { kind: 'clear' } | { kind: 'shift'; dir: -1 | 1 }
  | { kind: 'undo' } | { kind: 'redo' } | { kind: 'flush' } | { kind: 'newTask' } | { kind: 'deleteRow' }
export function gridKeyAction(e: Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'isComposing'>, mode: 'nav' | 'edit', sel: { rowSelected: boolean }): GridKeyAction | null
export function asciiForCode(code: string): string | null                   // Digit0–9/Numpad0–9 → '0'–'9', Period/NumpadDecimal → '.', Comma → ',', Minus → '-'
```
`useGridKeyboard(store, handlers)` attaches one `keydown` on the grid root; `preventDefault` for every handled action (incl. `Cmd+←/→` browser Back, `Cmd+S`); `undo`/`redo` reuse M1's `isUndoKey`/`isRedoKey` and the shared `useUndo()` stack; `Mod+ArrowDown/Up` are left unmapped for M7. Tests first `keymap.test.ts`: `{ code: 'Digit3', key: 'ๅ' }` nav → `startEdit '3'` (Kedmanee); `{ code: 'KeyF', key: 'ด' }` → `full`; `{ code: 'KeyH', key: '้' }` → `half`; `{ code: 'ArrowRight', metaKey: true }` → `shift 1`; `ctrlKey` same; `Shift+ArrowDown` → move extend; Enter edit → commit down; Tab edit → commit right; Shift+Tab → left; Escape edit → cancel; Delete nav with `rowSelected` → `deleteRow`, without → `clear`; `isComposing` → null; `{ code: 'KeyS', metaKey: true }` → `flush`; `{ code: 'KeyN' }` nav → `newTask`; `Mod+Z` → undo, `Mod+Shift+Z` → redo.

**S3.9 `PlanGrid` + `VirtualGrid` + toolbar + headers (`PlanGrid.tsx` replaces the S0 stub; `VirtualGrid.tsx` from `snippets/r4/client/components/grid/VirtualGrid.tsx`; `GridToolbar.tsx`, `GridHeader.tsx`, `RowHeader.tsx`, `gridStore.ts`).**
- `VirtualGrid`: one scroll container, row virtualizer (32 px, `paddingStart = HEADER_H`) + column virtualizer (`horizontal`, `estimateSize` from `col.width`, `getItemKey = col.key` memoised on `cols`, `paddingStart = NAME_W`, `scrollPaddingStart = NAME_W`, `overscan 4`), both `useFlushSync: false`; sticky name column, sticky header row, sticky "รวม" column (`position: sticky; right: 0`), sticky footer (`<Footer>` from S3.7, `FOOTER_ROWS` rows) as an in-flow sibling after the sized container (r4 §13); `role="grid"`, `aria-rowcount = HEADER_ROWS + viewRows.length + 1 /* quick-add row */ + FOOTER_ROWS`, `aria-colcount = cols.length + 2` (name + รวม), the period header row gets `aria-rowindex = HEADER_ROWS` (M8: ◆ row 1, period header 2), body row `i` gets `aria-rowindex = HEADER_ROWS + i + 1` and footer rows follow — always from the S3.1 constants so M8's ◆ header row (+1) needs no other change (C27); `aria-colindex` absolute; `VirtualGridHandle.scrollToColumn(i)`; `onRangeChange(firstIdx, lastIdx)` (guarded, one update per frame) is mapped to `cols[firstIdx].weekStart` / `cols[lastIdx].weekStart` → `chunksForRange` (S3.5).
- `GridToolbar` (`role="toolbar"`, `aria-label th.grid.toolbar.label`): `[สัปดาห์]` toggle (pressed, the only option — M7 adds วัน), ◀ / **วันนี้** / ▶ (`scrollToColumn(columnIndexOfPeriod(cols, 'W:' + weekStart(today)))`, ±4 weeks), ภาระ `Select` (`load.view`, `th.grid.view.*`), หน่วย `Select` (`grid.unit`, `th.units.*`) — unit change calls `colVirtualizer.measure()` only if widths change (they don't), "แสดงงานที่เสร็จแล้ว" `Switch` bound to M3's `tasks.showCompleted`, save status text, legend (`th.grid.legend.*`).
- `GridHeader`: per week `formatWeekHeader(ws)` ("30/9"), today's week marked `--today` + hidden `th.grid.header.today`, holidays 🎌 + tooltip. **Plain click does nothing** (M7 expands); **Shift+click** selects that column over all editable rows (M6-D33).
- `RowHeader` (`role="rowheader"`, `data-row-key`): indent by depth, ▸/▾ for parents (`th.grid.row.expand/collapse`), name (click selects the row; double-click or ↗ button `openTask(name)` → `onOpenTask`), assignee name via M1 `UserName` (+ "(ปิดใช้งาน)" chip `th.grid.row.deactivated` when `!people[u].active`, AC-203), × button `removeAssignee(name)` on assignee/merged rows when editable, "+ คน" button (`addPersonLabel(task)`, visible on hover and `:focus-within`) on leaf task/merged rows, `BlockerBadge` (M3) with `open/total` and names from `qk.projectTasks` (M6-D31), ◐ + "*" for tentative, "รอมอบหมาย" for unassigned leaves, struck-through name for completed.
- Bottom body row "+ เพิ่มงาน…" (`QuickAdd` from M3, `aria-label th.grid.row.addTaskLabel`) → M3 `useTaskMutations(projectId).create({ parentId: null, name })`; `N` focuses it (M6-D19).
- Initial scroll: `scrollToColumn(initialScrollIndex(cols, today))` once data for that chunk exists. Archived → banner `th.projects.archivedBanner` above the grid, every cell read-only.
- `gridStore.ts` (M6-D26): `{ anchor, focus, mode: 'nav' | 'edit', draft, rowSelection: RowKey | null }` with `subscribe/getSnapshot`; `useCellState(rowKey, periodKey)` selector hook.
- Tests `src/components/grid/PlanGrid.test.tsx` (`ui`, offset stubs, mocked `fetchGridChunk` with a golden POS fixture): renders `role="grid"` with `aria-label th.grid.gridLabel('POS Upgrade')`, three merged rows, the ⛔ badge when `blockers.open > 0`, footer `cell-footer-load-W:2026-09-28` text "5.0", plain header click changes nothing, Shift+click selects the column.

**S3.10 Editing gestures (`useGridEditing.ts`, `src/lib/grid/apply.ts`, §4.8, AC-801/802, M6-D10/D11/D32).**
```ts
/** Resolve a typed value or f/h for every target cell of the selection; returns writes + skipped counts. */
export function planTyped(raw: string, targets: readonly TargetCell[], unit: CellUnit): { writes: CellWrite[]; skippedReadOnly: number; skippedDayWeek: number; skippedNoCapacity: number; invalid: ParsedCell | null }
export function planCapacityKey(key: 'f' | 'h', targets: readonly TargetCell[]): { writes: CellWrite[]; skippedReadOnly: number; skippedDayWeek: number; skippedNoCapacity: number }
export interface TargetCell { rowKey: RowKey; taskAssignmentId: string | null; week: ISODate; editability: Editability; capCd: Cd; cell?: AssigneeCell }
```
Typing in nav mode opens an inline `<input inputMode="decimal">` in the focused cell prefilled with the first character (`asciiForCode`); in edit mode digit codes are rewritten to ASCII (M6-D27); Enter/Tab commit → `planTyped` over the whole selection (range fill, AC-801) → one `enqueue` + one undo entry (S3.14) → selection stays (range) or moves (single); invalid → keep the editor open with `aria-invalid` and `th.grid.toast.invalidValue`/`maxWeek`; read-only targets in a single-cell commit → toast with the matching reason (`readOnlyRow`, `needAssignee`, `archived`, `dayWeekReadOnly`). `f`/`h` in nav mode apply per cell with each cell's own capacity (`people[u].capacity[W:w]`, AC-802), skipping cap 0 (`noCapacity` toast once). Delete/Backspace → writes `cd: null` for every editable non-empty target (one undo entry); with a row selection on a task/merged row → `deleteRow` (S3.14 via M3). Tests first `apply.test.ts`: `'3'` over 6 Cindy CRM targets → 6 writes of 300; one DAY target among 4 → 3 writes + `skippedDayWeek 1`; `f` with capacities `[300, 500, 0]` → writes 300, 500 + skipped 1; `h` cap 300 → 150; FRACTION `'0.5'` with caps `[500, 400]` → 250, 200; `'7.5'` → invalid MAX, no writes.

**S3.11 Clipboard (`useGridClipboard.ts`, `src/lib/grid/tsv.ts`, `src/lib/grid/paste.ts`, AC-803, M6-D28).**
```ts
export function parseTsv(text: string): string[][]                       // \r?\n rows, drop one trailing empty line, \t cells, "…" quotes with "" escapes
export function serializeTsv(values: readonly (readonly string[])[]): string   // \r\n rows
export function copyValues(targets: readonly (readonly TargetCell[])[], unit: CellUnit): string[][]   // exact 2-decimal values in the unit, '' for empty
export function planPaste(block: readonly (readonly string[])[], anchor: { row: number; col: number }, sel: { rows: number; cols: number },
  grid: (r: number, c: number) => TargetCell | null, unit: CellUnit): { writes: CellWrite[]; pasted: number; skippedReadOnly: number; invalid: number }
```
Tiling: a selection whose height and width are exact multiples of the block (and larger) is tiled; otherwise the block is pasted once from the top-left; rows past the last row are dropped; read-only targets are skipped (not shifted); empty tokens clear; tokens parsed per target cell (fraction against each cell's capacity). Copy/paste use the DOM `copy`/`paste` events on the grid root (no async clipboard API; `copyText()` fallback for the menu path). Tests first `tsv.test.ts` (Excel `"0.5\t1\r\n0.75\t0.25\r\n"` → 2×2; quoted `"1,5"`; trailing newline dropped), `paste.test.ts`: 2×4 fraction block into Cindy/Ivy POS 11-09…11-30 → `[250,500,375,125]`, `[500,250,125,375]` (AC-803); 1×2 block into a 2×4 selection → tiled 8 writes; 2×3 into 2×4 → pasted once (6); a DAY target → skipped, counted; invalid token `'x'` → skipped, `invalid 1`.

**S3.12 Fill handle (`useFillHandle.ts`, `src/lib/grid/fill.ts`, §4.8, X65).** A 7 px square at the selection's bottom-right (`aria-hidden`, pointer only; keyboard alternative = range + type); dragging extends a target rect along one axis; `planFill(sourceRect, targetRect, grid)` tiles the source values (copy, never increment), skips read-only targets; one undo entry. Tests `fill.test.ts`: source `[300, 500]` dragged right 4 columns → `300, 500, 300, 500`; vertical drag over a parent row → that row skipped.

**S3.13 Shift ±1 column (`src/lib/grid/shift.ts`, §4.8 Cmd+←/→, X65).** `planShift(rect, dir, grid): { writes: CellWrite[]; newRect } | { blocked: true }` — values move one column, the vacated edge column is cleared, the destination column is overwritten, the selection moves; any read-only or DAY-week cell in the source rect or the destination column → `{ blocked: true }` + toast `shiftBlocked`; the timeline edge → blocked. Tests `shift.test.ts`: `[a, b, ∅]` right → `[∅, a, b]`, newRect +1; left at the edge → blocked; a DAY week in the destination → blocked.

**S3.14 ★ Undo/redo (`src/lib/grid/undo.ts`, `useGridUndo.ts`, §7.5, AC-805, M6-D13).**
```ts
/** Complete week snapshot (r6b §4.3): DAY weeks always carry all 7 days (incl. BR-25 boundary weeks); WEEK weeks carry weekCd. */
export interface WeekSnapshot { taskAssignmentId: string; week: ISODate; resolution: 'WEEK' | 'DAY' | null; weekCd: Cd; days: Record<ISODate, Cd> }
export function snapshotOf(cell: AssigneeCell | undefined, taskAssignmentId: string, week: ISODate): WeekSnapshot
export function snapshotFromState(state: WeekState, taskAssignmentId: string, week: ISODate): WeekSnapshot
/** DAY → seven DAY changes (null for empty days); WEEK → one WEEK change; null → WEEK null. Sent with onDayWeekConflict 'COLLAPSE'. */
export function snapshotToChanges(s: WeekSnapshot): Change[]
export interface GridUndoEntry { label: string; before: WeekSnapshot[]; after: WeekSnapshot[]; epochs: Map<string, number> }
```
Each gesture records `before` from the cache and `after` from the writes, pushes `useUndo().push({ label: th.grid.undo.<gesture>, undo, redo })` (no toast); `undo()` = `flush()` → if any assignment's conflict epoch changed since the entry → `toast(th.grid.toast.undoStale)` and resolve → else apply `before` optimistically and `enqueue(writes, { onDayWeekConflict: 'COLLAPSE', immediate: true })`; `redo()` mirrors with `after`; on success the entry's `after` is refreshed from the server `weeks`. Delete of a task row → M3's `deleteTaskTree` mutation + its undo entry/toast (`deletedWithChildren` …); × → M3 `unassign` + `unassigned(name)` toast with `restoreAssignmentBatch` undo; "+ คน" → M3 `assign` + its toast. Tests first `undo.test.ts`: WEEK snapshot → `[{ WEEK, 250 }]`; DAY snapshot `{11-11:100, 11-12:100, 11-13:100}` → 7 changes with nulls for 11-09/10/14/15; null → `[{ WEEK, null }]`; three edits A, B, C then three undos send snapshots of C, B, A in that order (queue spy).

**S3.15 Accessibility + perf instrumentation (§8.9, A11Y-2a/2b, M6-D22).** Roving `tabIndex` (only the focused cell is tabbable); `aria-selected` on selected cells; Esc twice + Tab leaves the grid; all row-header buttons reachable with Tab inside the focused row; `performance.mark('grid:first-data')` when the first chunk resolves and `performance.mark('grid:painted')` in the next `requestAnimationFrame` (standard User Timing, harmless in production); edit latency is measured by Playwright itself (`performance.now()` around a keydown + `MutationObserver` on the cell), so no test hook ships in the bundle. UI test: `aria-rowcount`/`aria-colcount` equal the full virtual size computed from `HEADER_ROWS`/`FOOTER_ROWS`/`viewRows.length`/`cols.length` (import the constants — never assert a literal row index, C27); the first body row's `aria-rowindex` = `HEADER_ROWS + 1`; focused cell `tabIndex 0`, others `-1`.

**S3.16 Done-check.** `pnpm vitest run --project unit src/lib/grid` · `pnpm vitest run --project ui src/components/grid` · `pnpm eslint src/components/grid src/lib/grid` · `pnpm typecheck` (own paths clean).

### 5.S4 — Plan tab, FR-612 dialog, completion/archive toasts, invalidation (frontend-engineer · owns `src/app/(app)/projects/[id]/plan/**`, `src/components/tasks/**`, `src/components/projects/**`, `src/components/calendar/**`)

Starts after S1 (uses `formatCd`, `parseCellInput`) and runs in parallel with S2/S3 against S0's stubs (`PlanGrid` stub, action stubs). MUI 9 API only (`slots`/`slotProps`, `sx`), strings from `th`, `unwrap()` + `useMutation`, no `router.refresh()`, no `localStorage`.

**S4.1 Tab + page (FR-408, X15, M6-D18).**
- `src/components/projects/project-tabs.ts` (M2): extend `ProjectTabId` with `'plan'` and insert `{ id: 'plan', order: 1, label: th.projects.tabs.plan }` — the M2-D10 scale is fixed: ภาพรวม 0 · **แผนงาน 1** · งาน 2 · เอกสาร 3 (G20/C54). The tabs render sorted by `order`, so array position does not matter. Before editing, read the current entries; if the เอกสาร entry still carries M4's old `order: 40`, set it to 3 (same file, count-free change, report it). Test `project-tabs.test.ts` (`unit`): `PROJECT_TABS` sorted by `order` → ids `['overview', 'plan', 'tasks', 'pages']` (M3 `tasks`, M4 `pages`) and orders `[0, 1, 2, 3]`. The sidebar sub-links reuse the config automatically.
- `src/app/(app)/projects/[id]/plan/page.tsx` (RSC): `const { id } = await props.params` (`PageProps<'/projects/[id]/plan'>`); authz already in the M2 layout (before any Suspense, X41/X57); load `getProjectHeader` (M2) for `name`, `archived`, `myRole`; render `<PlanView projectId={id} projectName archived canEdit={!archived} />`.
- `src/app/(app)/projects/[id]/plan/PlanView.tsx` (`'use client'`): flex row — `<PlanGrid context={{ kind: 'project', id }} … onOpenTask={(taskId) => history.pushState(null, '', '?task=' + taskId)} />` and, when `useSearchParams().get('task')` is set, M3's `TaskPanel` (440 px, same component and close semantics as the tasks tab, M3-D17); the grid shrinks (no overlay). Height: `calc(100dvh - header)` so the grid owns the scroll.
- Test `PlanView.test.tsx` (`ui`, PlanGrid mocked): `?task=<id>` renders the `complementary` panel; closing removes the param.

**S4.2 BR-52 toast on every DONE path (X19, X71, M6-D16).**
- `src/components/tasks/statusToast.ts`:
  ```ts
  /** BR-52: released load replaces the path's own message ("ติ๊กเสร็จแล้ว", "เปลี่ยน … เป็น 'เสร็จ' แล้ว", …). */
  export function statusToastMessage(result: Pick<SetTaskStatusResult, 'released'>, fallback: string): string
  // result.released ? th.tasks.toast.released(formatCd(released.cd, { unit: 'DAYS', decimals: 1 }), released.weeks) : fallback
  ```
- Replace the toast text at **every** call site that shows a toast from a `SetTaskStatusResult` (grep `th.tasks.toast.completed`, `completedMany`, `th.tasks.status.toast.changed`, `changedMany` under `src/components/**` and list them in the report): `useTaskMutations.complete` (row checkbox, panel checkbox, `Mod+Enter`, bulk ติ๊กเสร็จ, board card `Mod+Enter`), `useTaskMutations.setStatus` (chip, `S` menu, board drag, bulk เปลี่ยนสถานะ), the FR-608 "ติ๊กทั้งหมด" action, `/my` (`MyTasks.tsx` checkbox), `/tasks` (`TeamTasks.tsx` → `useSetTaskStatus`: board drop, chip, checkbox). The undo entry, the action button "เลิกทำ" and the 8 s duration are unchanged (M3 S3.1 matrix); uncomplete/revert toasts are unchanged. Every one of these mutations already calls `invalidateLoad(qc)` (M3 S3.1) — verify and add where missing, so the grid shows the faded weeks without reload.
- Tests first `statusToast.test.ts` (`unit`): `released { 1875, 5 }` → `'ปลดภาระ 18.8 วัน ในอีก 5 สัปดาห์'`; `null` → fallback. `TaskList.test.tsx` / `TaskBoard.test.tsx` / `TeamTasks.test.tsx` / `MyTasks.test.tsx` (`ui`, actions mocked to return `released`): each path's toast shows the released text (one assertion per path; sonner mocked).

**S4.3 FR-612 "วางแผน" (`src/components/tasks/plan/PlanRangeDialog.tsx`, `usePlanRange.ts`, M6-D6/D13/D14).**
- In M3's `TaskPanel` assignee list (leaf tasks, `viewer.canEdit`): per assignee a button `th.plan.button` (`aria-label th.plan.buttonFor(name)`) → opens `PlanRangeDialog({ taskAssignmentId, personName, taskName, defaultStart, defaultEnd, projectId })`. Defaults: start = task `startDate ?? today`, end = task `dueDate ?? addDays(start, 4)` (if end < start → start).
- Dialog (MUI `Dialog`, a form — not a confirm): `TextField` "จำนวนวันรวม" (`inputMode="decimal"`, parsed with `parseCellInput(raw, { unit: 'DAYS', capCd: 0, maxCd: 37_100 })`; `f`/`h` not offered; invalid → helper `th.plan.errors.invalidTotal`), two M3 `DateField`s (start/end, cross-limited), hint `th.plan.totalHint`, note `th.plan.replaceNote`. Preview: debounced 300 ms `planAssignmentRange({ …, baseVersion: null, dryRun: true })` → table (สัปดาห์ `formatWeekHeader`, ชนิด `th.plan.kind`, เดิม → ใหม่ in days with DAY parts in a tooltip, capacity), lines `capacityInRange`, `overCapacity` (when > 0), warnings `th.grid.toast.warning[code]`; server `VALIDATION UNREPRESENTABLE` → inline alert `th.plan.errors.unrepresentable`, apply disabled.
- Apply → `planAssignmentRange({ …, baseVersion: preview.version, dryRun: false })` → `rememberVersion(id, applied.version)`; `invalidateLoad(qc)` + `invalidateTasks(qc, projectId)`; close; `useUndo().push({ label: th.grid.undo.planRange, undo, redo }, { toast: th.plan.applied(formatCd(totalCd, { unit: 'DAYS', decimals: 1 }), personName) })` where `undo` = `saveAllocations({ items: [{ taskAssignmentId, baseVersion: knownVersion(id), changes: before snapshots → snapshotToChanges }], onDayWeekConflict: 'COLLAPSE', clientOpId })` and `redo` = the same with `after` (snapshots from `preview.weeks[].before/after` via `snapshotFromState`); both `rememberVersion` and `invalidateLoad` on success. `VERSION_CONFLICT` → `toast.warning(th.grid.toast.conflict)` and re-run the preview.
- Tests `PlanRangeDialog.test.tsx` (`ui`, actions mocked): typing `10` with 2026-11-11..11-24 calls dryRun with `totalCd 1000` once after the debounce and renders 3 rows (`ติดขอบ (รายวัน)`, `ทั้งสัปดาห์`, `ติดขอบ (รายวัน)`); `'abc'` disables apply; UNREPRESENTABLE shows the alert; apply pushes one undo entry with the toast text `th.plan.applied('10.0', 'Ivy')`.

**S4.4 FR-406 X toast (`src/components/projects/ArchiveProjectButton.tsx`, X17, M6-D17).** `const r = unwrap(await archiveProject({ projectId }))` → toast `r.releasedCd > 0 ? th.projects.toasts.archivedReleased(name, formatCd(r.releasedCd, { unit: 'DAYS', decimals: 1 })) : th.projects.toasts.archived(name)`; plus `invalidateLoad(qc)` (BR-44 removes the load). Test: mocked `releasedCd 2500` → `'archive "POS Upgrade" แล้ว — ปลดภาระ 25.0 วัน-คน ในอนาคต'`.

**S4.5 FR-405 and leave invalidation (X18, r6b M6-29).** Verify (and add where missing): M2's `CertaintyToggle` calls `invalidateLoad`; M3's certainty override, assign/unassign, delete/restore, status changes call it; **M5's time-off create/update/delete/restore mutations** (`src/components/calendar/**`, `useLeaveDialog`) and holiday import/delete call `invalidateLoad(qc)` too (capacity changes the grid footer and `f`). Test `useLeaveDialog.test.tsx`: a successful save calls `invalidateLoad`.

**S4.6 Done-check.** `pnpm vitest run --project ui src/components/tasks src/components/projects src/components/calendar src/app` · `pnpm vitest run --project unit src/components/tasks` · `pnpm eslint src/components/tasks src/components/projects src/components/calendar "src/app/(app)/projects/[id]/plan"` · `pnpm typecheck`.

### 5.S5 — Authz rows, masking, golden, race (test-engineer · owns `tests/authz/**`, `tests/golden/**`, `tests/integration/**`)

Written **from SPEC §3.2/§3.3 before S2 finishes** (PLAN §4.1); rows are red until S2 lands, green at G2. World `createWorld({ with: ['allocations'] })` (implies `tasks` + `timeOff`), `asUser`, `outcomeOf`; the matrix asserts exactly one audit row (`entity: 'allocation'`, `project_id`) for every `mutates: true` + `allow` pair (X44).

**S5.1 `tests/authz/rows/allocations.ts`** — the full table in §7.2, **registered in `tests/authz/rows/index.ts`** (append its export to the barrel M1 created; X91 — M1's AUD-00 / coverage check fails at runtime on an unregistered file, C98). Shapes:
```ts
const gridGet = (w: World, id: string, qs: string) => getGrid(new Request(`http://t/api/grid/project/${id}?${qs}`), { params: Promise.resolve({ projectId: id }) })
{ id: 'PERM-06', key: 'GR-READ', spec: '§3.2 เปิดโปรเจค (grid)', action: 'GET /api/grid/project/[projectId]', mutates: false,
  expect: { M: 'allow', L: 'allow', Me: 'allow', W: '404' }, run: (w) => gridGet(w, w.P.id, 'from=2026-09-28&to=2026-11-23') },
{ id: 'PERM-12', key: 'AL-SAVE', spec: '§3.2 วางแผน', action: 'saveAllocations', mutates: true,
  expect: { M: 'allow', L: 'allow', Me: 'allow', W: '404' },
  run: (w) => saveAllocations({ items: [{ taskAssignmentId: w.assignments.pLeafLead.id, baseVersion: 1, changes: [{ granularity: 'WEEK', period: '2026-11-16', cd: 200 }] }], clientOpId: 'op-1' }) },
{ id: 'PERM-12', key: 'AL-DAYWEEK', spec: 'X27 / M6-D34', action: 'saveAllocations', mutates: false,
  expect: { M: '400', L: '400', Me: '400', W: '404' },
  run: (w) => saveAllocations({ items: [{ taskAssignmentId: w.assignments.pChildAMember.id, baseVersion: 1, changes: [{ granularity: 'WEEK', period: '2026-10-12', cd: 150 }] }], clientOpId: 'op-2' }) },
```

**S5.2 Masking (`tests/authz/masking.int.test.ts`, extend with `describe('grid (M6)')`, MASK-5/7, X29).**
- As `outsider`: `GET /api/grid/project/{P}` → 404 and the body contains none of P's name, `w.tasks.pParent.name`, `pLeaf.name`, `'งานร่วม P-ลับ03'`, any P task/assignment id.
- As `lead` (worker LEAD of P, not the manager): P grid over `[2026-10-26, 2026-11-09)` → `people[member].timeOff[0].label === th.masking.leave`; body lacks `'โน้ตของ member'` and the training leave-type name; as `member` (self) → own label = the type name; as manager → type name.
- As `member`, P grid with `includeOthers=1` over `[2026-09-28, 2026-10-26)` → `people[coworker].otherProjects['W:2026-10-05'] = { total: 300, committed: 300 }`; `JSON.stringify(body)` contains none of `w.Q.name`, `w.tasks.qTask.name` (`'งาน Q-ลับ02'`), `w.Q.id`, `w.tasks.qTask.id`, `w.assignments.qTaskCoworker.id`, `w.assignments.qTaskOutsider.id`, and no Q status name (`'สถานะลับ Q-04'`).
- Save errors: as `lead`, a batch with `qTaskOutsider` → 404 body without Q names; `VERSION_CONFLICT` `current` contains only the caller's items.

**S5.3 Golden (`tests/golden/golden.int.test.ts`, extend with `describe('F1 via grid (M6)')`, §11.3, r8 §2–§4.5/§6.3).** `truncateAll` + `seedGolden`; as manager, for each project `buildChunk` over `[2026-08-31, 2027-01-04)` (18 weeks, exclusive end, r8 N6) **and** the same through `GET /api/grid/project/[id]` (deep-equal bodies):
- per project Σ over assignee cells (counted, `splitLoad`) = POS 4625/2750 · DW 3000/3000 · Mobile 5875/5875 · CRM 2500/0 · Store 3500/0; grand total 19 500 / 11 625;
- per project weekly footer loads = r8 §6.3 lists exactly (absent weeks 0) via `footerTotals` (S3.7 imported in the test — pure), capacities POS 1500, DW 500, Mobile/CRM/Store 1000 every week;
- every `expected.F1.byUserWeek` cell (57) = Σ across the 5 grids of that user's cells for the week (total and committed), every other user×week 0;
- `rowTotal` per task = r8 §4.5 (1875, 875, 1875, 3000, 3000, 2875, 1500, 1000, 2500, 1000; committed 0 for CRM, Store and Rollout);
- `applyFixture('F2')` → POS capacity `W:2026-10-19 = 1200`; `applyFixture('F3')` → DW `people[peter].capacity['W:2026-10-05'] = 300`.

**S5.4 Race and lock (`tests/integration/allocations-race.int.test.ts`, BR-20b, r2 T9/T9-fix, r6b E9–E11).** Two independent connections (`postgres` clients on the worker DB):
- `version lock` — tx A runs `services.allocations.save` (WEEK 10-05) and pauses before commit (a hook resolving a promise); tx B saves the same assignment with the same `baseVersion` → B waits on the row lock, then gets `VERSION_CONFLICT`; final rows = A's only.
- `exclusion backstop` — raw SQL without locks: tx A inserts WEEK for (a, 2026-10-05) and holds; tx B inserts DAY for (a, 2026-10-05) → B blocks, A commits, B fails `23P01` on `allocations_one_resolution_per_week` (without the constraint both would commit — r2 T9).
- `same-tx order` — INSERT DAY before DELETE WEEK in one tx → `P0001 WEEK_DAY_CONFLICT` (trigger first).
- `deadlock-free` — two batches `[a, b]` and `[b, a]` started concurrently both complete (sorted lock order) — no `40P01`.

**S5.5 Older tests under `tests/**` (C3, C23).** Update only what M6 changes on purpose, counts only, never weakening an assertion:
- `tests/integration/seed-golden.int.test.ts` (M1, extended by M3–M5): after `seedGolden` the `audit_log` total grows by exactly **+10** (one `entity 'allocation'` row per golden assignment, actor `null`, M6-D23) and a new assertion `allocations` = 57 rows / `sum(person_days) = 195.00`. Write the expectation as the previous total + 10 (keep M4's +5 page rows and M5's own delta as they are) so later seeds stay relative. `bootstrap.int.test.ts` is unchanged (bootstrap writes no allocations).
- `scripts/lib/fixtures.int.test.ts` belongs to S0 (S0.10 updates its exact counts the same way).
- M5's world smoke test (`tests/helpers/world.int.test.ts`) keeps passing when `'allocations'` is not requested (the new parts are added only under `with: ['allocations']`).
- M3's matrix rows for `completeTask`/`setTaskStatus`/`revertTaskStatus` still pass (their result now has `released`; the matrix checks outcome + audit only); M2's PERM-09a still passes (`archiveProject` result gains `releasedCd`).
- Any test that deep-equals a `SetTaskStatusResult` or the archive result adds `released: null` / `releasedCd` (grep `toEqual({ changed` under `tests/` and `src/**/*.test.ts`; S2 owns the `src/**` ones).

**S5.6 Done-check.** `pnpm vitest run --project integration tests` (rows red only while S2 stubs throw `NOT_IMPLEMENTED`) · `pnpm eslint tests` · `pnpm typecheck` (own paths clean).

### 5.S6 — E2E `m6-grid` (test-engineer · owns `e2e/**`)

Runs after S2–S5. The integrator runs Playwright at G2; the stream writes specs and page objects only (`pnpm exec playwright test --list`).

**S6.1 Page object `e2e/pages/grid.ts` (★ M7/M9 extend it).**
```ts
export class GridPage {
  constructor(readonly page: Page) {}
  goto(projectName: string): Promise<void>                       // sidebar → project → tab th.projects.tabs.plan; waits for role=grid + [data-save-state="idle"]
  root(): Locator                                                // getByRole('grid', { name: th.grid.gridLabel(projectName) })
  rowKeyOf(taskName: string, personName?: string): Promise<string>   // ★ rowheader by accessible name → data-row-key ('t:…' | 'a:…')
  cell(rowKey: string, week: ISODate): Locator                   // getByTestId(`cell-${rowKey}-W:${week}`)
  total(rowKey: string): Locator                                 // getByTestId(`cell-${rowKey}-total`)
  footerLoad(periodKey: PeriodKey): Locator                      // ★ getByTestId(`cell-footer-load-${periodKey}`)
  footerCapacity(periodKey: PeriodKey): Locator; footerUtil(periodKey: PeriodKey): Locator
  select(from: Locator, to?: Locator): Promise<void>             // click + shift+click
  typeInto(cell: Locator, text: string, commit?: 'Enter' | 'Tab'): Promise<void>   // click, keyboard.type, Enter
  press(key: string): Promise<void>                              // page.keyboard.press
  paste(tsv: string): Promise<void>                              // synthetic DataTransfer + ClipboardEvent on the focused cell (r4 §41)
  copy(): Promise<string>                                        // ControlOrMeta+C, then navigator.clipboard.readText()
  setUnit(u: 'DAYS' | 'FRACTION'): Promise<void>; setView(v: LoadView): Promise<void>; today(): Promise<void>
  includeOthers(on: boolean): Promise<void>
  waitSaved(): Promise<void>                                     // ★ expect(root()).toHaveAttribute('data-save-state', 'idle')
  toast(text: string): Locator
  countServerActions(fn: () => Promise<void>): Promise<number>   // requests with header 'next-action' while fn runs
}
```
Locator rules (C27, M7/M8/M9 extend this object): rows and cells are found only by `data-row-key`, `data-testid` (M6-D33) or accessible names — **never** by `aria-rowindex`, `nth()` row position or a row count that includes header rows (M8 inserts the ◆ header row and shifts every index by +1). Also extend `e2e/pages/tasks.ts` (`TaskListPage`) with `planFor(personName)` (panel button `th.plan.buttonFor`) + a `PlanRangeDialog` helper (`fill(days, start, end)`, `previewRows()`, `apply()`), and the M2 project page object with `openTab('plan')`.

**S6.2 `e2e/m6-grid.spec.ts`** — scenarios G1–G15 exactly as §7.3; `test.describe.configure({ mode: 'serial' })` inside describes that chain state; `test.beforeAll(async () => { await resetDb(…) })` per describe (never `beforeAll(resetDb)` / `beforeAll(resetDb(...))`; options go in the 2nd argument — M1, X91); `loginAs` per test; `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; numbers via `formatCd`, dates via `formatWeekHeader`; strings from `th`; no sleeps (wait on `data-save-state`, toasts, text).

**S6.3 Update older specs (shared UI changed).**
- `e2e/m2-projects.spec.ts`: any tab/sub-link enumeration now reads ภาพรวม · แผนงาน · งาน · เอกสาร; **E6** archives CRM Migration, whose whole golden plan (2 500 cd, weeks 10-05…11-02) is in the future → the archive toast is `th.projects.toasts.archivedReleased('CRM Migration', '25.0')` (r8 §6.3); the undo/unarchive steps are unchanged.
- `e2e/m3-tasks.spec.ts`: **E9** first `Cmd+Enter` on "Rollout สาขา" → toast `th.tasks.toast.released('18.8', 5)` instead of `completed` (the second `Cmd+Enter` uncompletes → M3 text unchanged); bulk ติ๊กเสร็จ of "ปรับปรุงระบบ POS หน้าร้าน" + "ทำ UAT + คู่มือหน้าร้าน" → `released('1.3', 1)` instead of `completedMany(2)` (only UAT has a later week: 10-05 = 125); **E13** (`/my`, ivy) tick "ตั้งค่า automation" → `released('10.0', 4)` if E13 asserts the toast text (it asserts the count; keep that); **E17** drag of "ปรับปรุงระบบ POS หน้าร้าน" to เสร็จ keeps M3's text (Cindy's POS plan ends 09-28 → `released` null); **E3** unchanged (the AC-603 plans clause is G9 here); any tab enumeration gains แผนงาน. Assert the new texts through `th` + the numbers above, never by regex on digits.
- `e2e/m5-calendar.spec.ts`: nothing expected (leave invalidation is additive); `e2e/m0-smoke`, `m1-auth`, `m4-pages`: update only sidebar/tab enumerations if any.
- Move shared selectors into page objects.

**S6.4 Perf smoke (G15, M6-D22).** `resetDb(undefined, { syntheticGrid: true })`; as cindy open "Perf grid": `performance.measure('grid', 'grid:first-data', 'grid:painted')` < 600 ms (logged); type `1` + Enter on a cell and measure keydown → cell text change via an in-page `MutationObserver` < 100 ms (logged); the 220 task rows are virtualised (rendered row elements < 60).

**S6.5 Done-check.** `pnpm exec playwright test --list` · `pnpm eslint e2e` · `pnpm typecheck`.

---

## 6. Integration (orchestrator)

**Expected cross-stream requests (apply after Build, step 4):**

| From | Request |
|---|---|
| S2 | `src/server/errors.ts` (M1): `ValidationError(fieldErrors, message?, extra?)` third parameter if absent; `src/server/db/retry.ts#withDeadlockRetry` and the `mapDbError` per-constraint branch (S2 owns both, listed for visibility); M3's `listActiveForProject` gains `version` (S2 owns `src/server/**`; M3-D39 namespace `repo.assignments` is fixed) |
| S2 | `th.audit.*` / `th.errors.*` keys it adds in its namespaces (Edit only) |
| S3 | `th.grid.*` / `th.units.*` keys added during build; M3 `QuickAdd`/`BlockerBadge`/`PersonPicker`/`UserName` props it needs (read-only reuse — request a prop if missing) |
| S3 | `src/lib/api.ts` (M2) `getJson` `init.signal` pass-through if missing (M3 already requested it) |
| S4 | M3 `TaskPanel` assignee list hook point for the "วางแผน" button (S4 owns `src/components/tasks/**`, so this is internal) · `th.plan.*` additions |
| S5 | `tests/helpers/**` tweaks found while writing rows (orchestrator applies; S0 owned them) |
| S6 | data-testids or accessible names missing in `src/components/grid/**` (request to S3) |

**Wiring order:** S0 (G0) → {S1, S5} → {S2, S3, S4} (S5 continues) → integrator replaces nothing: S3's real `PlanGrid` already overwrote the S0 stub (same props) → S6 → G2.

**Commands (G2):**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                     # → "No schema changes, nothing to migrate"
pnpm exec drizzle-kit check
pnpm check                           # typecheck + lint + unit + ui + integration (authz, masking, golden, race) + domain coverage ≥ 95 %
pnpm test:e2e                        # full suite: m0 … m6 (production build, APP_NOW, ALLOW_TEST_HOOKS=1)
git diff --exit-code CLAUDE.md SPEC.md docs/
grep -rn "refresh()" src/server/actions/allocations.ts && exit 1 || true     # X47/PLAN §1.3: saveAllocations never refreshes
grep -rnE "from '@/server/db/schema'.*allocations|allocations\b.*from '@/server/db/schema'" src/server --include=*.ts | grep -v repo/allocations.ts   # guard (also unit-tested)
grep -rn "milestone" src/lib/contracts/grid.ts                               # only the X28 placeholders
```
Integrator checks by hand: the M3 task panel opened from the grid uses the same component; the sidebar shows แผนงาน in the project sub-links; no new dependency besides `@tanstack/react-virtual`; `ls` the repo root for stray files.

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Tests |
|---|---|
| AC-801 | e2e G2 (keyboard-only variant included) · unit `apply.test.ts › range fill` · int `allocations.int.test.ts › AC-801 batch` |
| AC-802 | e2e G3 (F3, `f` → 3.0, `h` → 1.5) · unit `units.test.ts › f/h`, `apply.test.ts › f per cell` |
| AC-803 | e2e G4 (synthetic DataTransfer, fraction mode) · unit `paste.test.ts`, `tsv.test.ts`, `units.test.ts › fraction` |
| AC-805 | e2e G5 (3 edits, Cmd+Z ×3, reload) · unit `undo.test.ts` · int `allocations.int.test.ts › X27 snapshot replay` |
| AC-603 (plans clause, X13) | int `tasks.int.test.ts › AC-603` (extended) · e2e G9 |
| AC-604 (M6 part, X14) | int `plan-range.int.test.ts › AC-604` · e2e G10 (person pages → M9) |
| AC-203 (grid clause, X12 — closes AC-203) | int `grid.int.test.ts › AC-203` · e2e G11 |
| §11.3 F1 | golden `F1 via grid (M6)` (service + route) |
| FR-612 / BR-25 | unit `allocation.test.ts › planRange` · int `plan-range.int.test.ts` · e2e G9, G10 |
| BR-52 on every DONE path (X19/X71) | int `task-status.int.test.ts › BR-52` · ui per path (S4.2) · e2e G12 |
| FR-406 X (X17) | int `projects.int.test.ts › archive X` · ui `ArchiveProjectButton.test.tsx` · e2e G12 |
| FR-405 (grid, X18) | unit `invalidate.test.ts` · e2e G8 (no reload) |
| FR-643 grid (X76) | int `grid.int.test.ts › blockers` · ui `PlanGrid.test.tsx` · e2e G2 |
| BR-20b | int `schema.int.test.ts › allocations`, `allocations-race.int.test.ts` |
| §6.5 parity (X03) | int `allocations.int.test.ts › §6.5 parity` |
| X27 (DAY weeks read-only) | int `› X27 / M6-D34` · authz AL-DAYWEEK · e2e G6 |
| §7.4 client (debounce, rollback, conflict) | ui `save-queue.test.ts` · e2e G13, G14 |
| §9 budgets (smoke) | int `grid.perf.int.test.ts` · e2e G15 |
| §8.9 | ui `PlanGrid.test.tsx` (ARIA) · e2e G2/G5 keyboard-only |

### 7.2 Authorization matrix rows added (`tests/authz/rows/allocations.ts`)

`M` manager · `L` lead (LEAD of P and A) · `Me` member (MEMBER of P and A) · `W` outsider (MEMBER of Q only). `mutates` rows with `allow` assert exactly one new `audit_log` row (`entity 'allocation'`, `project_id`). World `createWorld({ with: ['allocations'] })`.

| Key | PERM | Action / route (world ids) | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| GR-READ | PERM-06 | `GET /api/grid/project/{P}?from=2026-09-28&to=2026-11-23` | allow | allow | allow | 404 | no |
| GR-ARCH | PERM-06, X42 | `GET /api/grid/project/{A}?…` | allow | allow | allow | 404 | no |
| GR-OTHERS | PERM-06, X29 | `GET …/{P}?…&includeOthers=1` | allow | allow | allow | 404 | no |
| GR-DEFAULT | PERM-06 | `GET …/{P}` (no params → −4/+12 weeks) | allow | allow | allow | 404 | no |
| GR-MISSING | — | `GET …/<random v4 uuid>` | 404 | 404 | 404 | 404 | no |
| GR-BADID | X86 | `GET /api/grid/project/not-a-uuid?from=2026-09-28&to=2026-11-23` (malformed id) | 404 | 404 | 404 | 404 | no |
| GR-BADQ | — | `GET …/{P}?from=2026-09-29&to=2026-11-23` (parse before authz) | 400 | 400 | 400 | 400 | no |
| GR-SPAN | — | `GET …/{P}?from=2026-01-05&to=2027-01-11` (54 weeks) | 400 | 400 | 400 | 400 | no |
| AL-SAVE | PERM-12 | `saveAllocations` pLeafLead WEEK 2026-11-16 = 200 | allow | allow | allow | 404 | yes |
| AL-CLEAR | PERM-12 | pLeafLead WEEK 2026-09-28 = null | allow | allow | allow | 404 | yes |
| AL-COLLAPSE | PERM-12, X27 | pChildAMember WEEK 2026-10-12 = 150 + `COLLAPSE` | allow | allow | allow | 404 | yes |
| AL-DAYWEEK | PERM-12, X27, M6-D34 | pChildAMember WEEK 2026-10-12 = 150 (no choice) | 400 | 400 | 400 | 404 | no |
| AL-STALE | PERM-12 | pLeafLead `baseVersion 99` | 409 | 409 | 409 | 404 | no |
| AL-ARCH | PERM-12, X42 | aTaskMember WEEK 2026-10-12 = 100 | 403 | 403 | 403 | 404 | no |
| AL-MIXED-ARCH | PERM-12, X42 | items [pLeafLead, aTaskMember] | 403 | 403 | 403 | 404 | no |
| AL-MISSING | — | items [<random v4 uuid>] | 404 | 404 | 404 | 404 | no |
| AL-BAD | — | WEEK period 2026-09-29 (zod) | 400 | 400 | 400 | 400 | no |
| PR-PREVIEW | PERM-12 | `planAssignmentRange` pLeafLead 500 over 2026-11-16..11-20, dryRun | allow | allow | allow | 404 | no |
| PR-APPLY | PERM-12 | same, `baseVersion 1`, apply | allow | allow | allow | 404 | yes |
| PR-UNREP | PERM-12 | pLeafLead 400 over 2026-11-11..11-13 | 400 | 400 | 400 | 404 | no |
| PR-ARCH | PERM-12, X42 | aTaskMember dryRun | 403 | 403 | 403 | 404 | no |
| (loop) | — | every row as nobody | 401 | 401 | 401 | 401 | — |
| (loop) | — | every row as a mustChange user | 403 | | | | — |

Multi-item batches across projects (P + Q: manager allow with 2 audit rows, L/Me/W 404) are integration tests (S2.4 `all-or-nothing`), not matrix rows, because the matrix asserts exactly one audit row. M3's PERM-11 rows and M2's PERM-09a are unchanged; their new result fields are asserted in S2.7/S2.8.

### 7.3 E2E scenarios (`e2e/m6-grid.spec.ts`)

Deterministic per PLAN §4.5: production build, `APP_NOW=2026-09-30T10:00:00+07:00`, `ALLOW_TEST_HOOKS=1`; `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; `loginAs` via the API; strings from `th`; numbers via `formatCd`; page objects from S6.1; waits on `data-save-state="idle"`, toasts or text only; the CSP-violation listener stays on. ⟲ = `resetDb(...)` in `beforeAll` of that describe.

| # | Setup / actor | Steps | Assertions |
|---|---|---|---|
| G1 ⟲ | FR-408, FR-801, FR-802 (week), toolbar · cindy | sidebar → POS Upgrade → tab แผนงาน; scroll right 20 weeks (mouse wheel on the grid); click วันนี้ | tabs read ภาพรวม · แผนงาน · งาน · เอกสาร in order; first visible week header `31/8`; `[สัปดาห์]` pressed and no วัน option; scrolling right fires requests for further chunks (`page.waitForResponse(/api\/grid\/project\/.*from=2027-02-15/)`) and their headers render; วันนี้ puts `28/9` right after the name column (bounding box) |
| G2 ⟲ | AC-801, FR-805, X76, A11Y-2b · cindy | CRM แผนงาน; keyboard only: focus the grid, arrow to Cindy `W:2026-10-05`, `Shift+ArrowRight` ×5, type `3`, Enter; `waitSaved`; reload; in POS add a blocker (M3 panel) "Rollout สาขา" blocked by "ทำ UAT + คู่มือหน้าร้าน", open POS แผนงาน | six cells `3.0`; selection still 6 cells; one server action call (`countServerActions` = 1); "รวม" `18.0`; after reload the same; POS Rollout row shows ⛔ `th.tasks.blockers.badgeWaiting(1)` with the tooltip naming UAT |
| G3 ⟲ `F3` | AC-802 · peter | DW แผนงาน; click Peter `W:2026-10-05` (5.0); press `f`; `waitSaved`; press `h`; `waitSaved` | after `f` the cell reads `3.0`, the cell shows the leave glyph + tooltip `th.grid.cell.leave('ลาพักร้อน', …)` (own leave → type name); after `h` `1.5`; footer capacity `W:2026-10-05` = `3.0` |
| G4 ⟲ | AC-803, FR-804 · cindy | POS แผนงาน; หน่วย → สัดส่วน; focus Cindy `W:2026-11-09`; `paste("0.5\t1\t0.75\t0.25\r\n1\t0.5\t0.25\t0.75\r\n")`; `waitSaved`; switch หน่วย → วัน; `copy()` on the same 2×4 block | fraction mode shows `0.50 1.00 0.75 0.25` / `1.00 0.50 0.25 0.75`; toast `th.grid.toast.pasted(8)`; days mode shows `2.5 5.0 3.8 1.3` / `5.0 2.5 1.3 3.8`; copied TSV = `2.50\t5.00\t3.75\t1.25\r\n5.00\t2.50\t1.25\t3.75` (exact, M6-D28) |
| G5 ⟲ | AC-805, §7.5 · cindy | POS; type `1` on Cindy 08-31, Enter; `2` on 09-07; `3` on 09-14 (separate gestures); `waitSaved`; `ControlOrMeta+z` ×3 with waits; `waitSaved`; reload; `ControlOrMeta+Shift+z` | after each undo the latest edited cell reverts in reverse order (3.0 → 3.8, 2.0 → 5.0, 1.0 → 5.0); after reload `5.0 5.0 3.8`; redo after reload does nothing (stack is per tab) |
| G6 ⟲ | X27, BR-20a, §4.8 การลบ · ivy | POS UAT task panel → วางแผน Ivy 2 วัน 2026-11-11..2026-11-13 → apply; grid: select Ivy `W:2026-11-02…W:2026-11-16`, type `1` Enter; select `W:2026-11-09`, Delete; select `W:2026-11-16`, Delete | `W:2026-11-09` shows `2.0` + ⋯ and tooltip `แผนรายวัน: พ 0.67 · พฤ 0.67 · ศ 0.66`; range typing skips it (toast `dayWeekReadOnly`), the other two weeks become 1.0; Delete on the DAY week → toast, value kept; Delete on 11-16 clears it |
| G7 ⟲ | §4.8 การลบ, KEY-05, `?` help · cindy | POS; press `N`, type "งาน G7", Enter; on the new row "+ คน" → Ivy; type `2` on its 11-16 cell; × on Ivy → toast "เลิกทำ" → click; click the row header of "งาน G7", Delete → toast → `ControlOrMeta+z`; press `?` | the new row appears with "รอมอบหมาย" then merges with Ivy; × removes the row's person (toast `th.tasks.toast.unassigned('Ivy')`), undo brings back Ivy and the 2.0; Delete removes the task (toast `deleted('งาน G7')`), Cmd+Z restores it with the 2.0; help dialog lists `th.shortcuts.items.gridFull` under `th.shortcuts.scopes.grid` |
| G8 ⟲ | FR-405, FR-806, FR-809, X29 · cindy | CRM แผนงาน; set `window.__noReload = 1`; ภาระ → เฉพาะที่แน่นอน; read footer `W:2026-10-12`; tab ภาพรวม → certainty แน่นอน (M2 toggle); tab แผนงาน; footer again; switch "รวมงานโปรเจคอื่นของคนเหล่านี้" on | committed view footer `W:2026-10-12` empty (CRM tentative); after the certainty change it reads `5.0` without reload (`__noReload` still set); footer label `th.grid.footer.load('Cindy, Ivy')`, capacity `10.0`, % `50%`; with the switch on, footer `W:2026-09-28` becomes `5.0` (Cindy's and Ivy's POS work, committed) and the `includeOthers=1` response body (`waitForResponse`) contains neither "POS Upgrade" nor any POS task name |
| G9 ⟲ | FR-612, AC-603 plans, BR-25 · cindy | POS งาน: quick add "แม่ G9", "ลูก 1", "ลูก 2", "ลูก 3", Tab each child; assign Ivy to "ลูก 2"; panel → วางแผน Ivy: `10`, 2026-11-11 → 2026-11-24; check the preview; apply; แผนงาน; back to งาน: delete "แม่ G9" → "เลิกทำ"; แผนงาน; reload | preview rows `ติดขอบ (รายวัน)`, `ทั้งสัปดาห์`, `ติดขอบ (รายวัน)` and `capacityInRange('10.0')`; toast `th.plan.applied('10.0', 'Ivy')`; grid "ลูก 2" row: `W:2026-11-09` `3.0⋯`, `W:2026-11-16` `5.0`, `W:2026-11-23` `2.0⋯`; after delete + undo the same cells are back; after reload still |
| G10 ⟲ | AC-604 (M6 part) · jack | Mobile งาน: quick add "งาน AC604", assign Jack and Mint; panel → วางแผน Jack `3`, 2026-11-16..2026-11-20 → apply; วางแผน Mint `2`, same range → apply; แผนงาน | task row (2 assignees, not merged) `W:2026-11-16` `5.0`; Jack row `3.0`, Mint row `2.0`; footer `W:2026-11-16` = `5.0` (no other Mobile plans that week) |
| G11 ⟲ | AC-203 grid clause · manager | deactivate Cindy (M1 employees page object); POS แผนงาน | Cindy's row still lists `ปรับปรุงระบบ POS หน้าร้าน` with "(ปิดใช้งาน)" and `5.0` at 08-31; footer capacity `W:2026-10-05` = `10.0` (Cindy 0 from 2026-09-30); typing on Cindy still allowed (cell editable) |
| G12 ⟲ | BR-52 on every path, FR-406 X · cindy, then manager | POS งาน: tick "Rollout สาขา"; click toast "เลิกทำ"; board → drag "ทำ UAT + คู่มือหน้าร้าน" to "เสร็จ"; `/tasks` board → drag "ย้ายข้อมูลลูกค้า" to the เสร็จ column; POS แผนงาน (show completed on); manager: Store ภาพรวม → archive | toasts `released('18.8', 5)`, `released('1.3', 1)`, `released('15.0', 5)`; after the undo Rollout counts again; in the grid UAT's `W:2026-10-05` is faded with the tooltip `notCounted` and the footer `W:2026-10-05` excludes it; archive toast `archivedReleased('Store Analytics Dashboard', '35.0')` |
| G13 ⟲ | §7.4 rollback · cindy | POS; `page.route` fulfils the next request with header `next-action` with 500; type `4` on Cindy 08-31; Enter; then `page.unroute`; click "ลองใหม่" | the cell shows `4.0` immediately, then reverts to `5.0` with toast `saveFailed` + action `retry`; `data-save-state="error"`; after retry `4.0` and `idle`; reload shows `4.0` |
| G14 ⟲ | VERSION_CONFLICT · cindy + ivy (two contexts) | both open POS แผนงาน; ivy types `1` on Ivy `W:2026-09-14`; `waitSaved`; cindy (stale) types `2` on the same cell | cindy sees `th.grid.toast.conflict` and the cell shows `1.0`; reload in cindy's context → `1.0` |
| G15 ⟲ `syntheticGrid` | §9 smoke (M6-D22) · cindy | open "Perf grid" แผนงาน; measure; type `1` Enter on the first editable cell | first data → painted < 600 ms; keydown → cell text < 100 ms; rendered `role="row"` elements < 60 (virtualised); timings logged |

### 7.4 Golden, perf and manual checks

- Golden: S5.3 (F1 through service and route, F2/F3 capacity spot checks); r8 numbers only, never re-typed from SPEC prose.
- Perf: S2.10 (service, 2 × 8-week chunks < 1 s each) and G15 (2× budget); full §9 measurement in M11 against `seed:perf`.
- Manual: Thai Kedmanee keyboard — digits start editing, `ด`/`้` act as `f`/`h`, `Cmd+←/→` does not navigate back (Chrome and Safari); paste from real Excel and Google Sheets (TSV with `\r\n`, quoted cells); dark mode — tentative bar, faded numbers, leave stripes readable (token contrast unit test from M0 still green); keyboard-only run of AC-801/805 with a screen reader spot check (VoiceOver: cell labels read row, week and value).

---

## 8. Definition of done

- [ ] SPEC §12 M6 delivered: `units.ts`, `certainty.ts` (split), `allocation.ts` (distribute + BR-25 + spread/spill), `completed.ts`; `allocations` + trigger (+ exclusion); `GET /api/grid/project`; `saveAllocations`; PlanGrid with 2-axis virtualisation, horizontal timeline, **every** row of §4.8 "การกรอก" and "การลบ", undo/redo, footer, leave/holiday, certainty toggle; FR-612 in the task panel. No day-level UI (M7).
- [ ] AC-801, AC-802, AC-803, AC-805 pass in `e2e/m6-grid.spec.ts`; AC-603 plans clause, AC-604 M6 part and AC-203 grid clause pass; golden F1 matches through the grid service **and** route.
- [ ] e2e m0 … m6 all green (older specs updated per S6.3).
- [ ] `pnpm check` green (domain coverage ≥ 95 %); `pnpm db:generate` → "No schema changes"; `drizzle-kit check` OK; both migrations journaled; `allocations_one_resolution_per_week` present.
- [ ] Authz rows exist for **every** new action and route (§7.2), each single-item mutating `allow` asserting one `allocation` audit row; masking block `grid (M6)` green (leave labels, `otherProjects` numbers only).
- [ ] Every allocation writer locks the assignment first (`lockAssignments`/version bump); every `allocations` query has a `week_start` bound (guard test green); `saveAllocations`/`planAssignmentRange` never call `refresh()`.
- [ ] BR-52 numbers appear on every `DONE` path through `setStatus` + `statusToastMessage` (one ui test per path); FR-406 X shown.
- [ ] No float math on loads (all formatting integer-based); no JS `Date` on plan dates; no Thai outside `src/i18n`; no `localStorage`; no confirm dialog added (the FR-612 dialog is a form); state never by colour alone (◐, ⋯, ลา glyphs with hidden text).
- [ ] Only new dependency `@tanstack/react-virtual 3.14.13` (Decision M6-D30).
- [ ] No `any`, `@ts-ignore` or `eslint-disable` without a reason comment.
- [ ] `PROGRESS.md` updated (§10); commit + tag done.

---

## 9. Risks and gotchas

| # | Risk / pitfall | Mitigation (step) |
|---|---|---|
| R1 | BR-20b race: the trigger cannot see uncommitted rows (r2 T9) | lock-first in every writer (S2.3), exclusion constraint backstop (S0.3, M6-D5), race tests (S5.4) |
| R2 | Deadlocks when two batches lock in different orders (r6b E11) | `ORDER BY ta.id FOR UPDATE OF ta`; one retry on `40P01` (S2.4); deadlock test (S5.4) |
| R3 | Hand-named trigger SQL is ignored by the migrator | `drizzle-kit generate --custom --name=allocations_week_day_guard` after the table migration; schema test checks `pg_trigger`/`pg_constraint` (S0.3) |
| R4 | `btree_gist` exclusion on the enum column fails to create | verified on PG 17 (r6b E9); if it fails, use `(granularity::text) WITH <>` in the same custom migration and record it (S0.3) |
| R5 | SPEC `distribute` float tie-break wrong (r6b E12, r8 G11) | integer remainders + counterexample tests (S1.3) |
| R6 | Display rounding with `toFixed` (35 → "0.3") | integer half-up `formatCd`, property over 0…70 000 (S1.1) |
| R7 | BR-25 boundary days > 100 cd (r8 G3) breaks the DB check | clamp-and-spill per part, `UNREPRESENTABLE` otherwise (M6-D6, S1.5) |
| R8 | Fraction unit ambiguity (÷500 vs capacity, r8 G4) | cell's own capacity, cap 0 → days (M6-D9); AC-803 uses clean 500-capacity weeks |
| R9 | Thai keyboard: `e.key` is Thai, digits type `ๅ/ภ/ถ` | `e.code` mapping in nav and edit mode (M6-D27, S3.8); manual QA |
| R10 | `Cmd+←` triggers browser Back on Mac Chrome | `preventDefault` in the grid handler (S3.8); manual QA in Chrome and Safari |
| R11 | Server actions are serialised per client; a slow save blocks other actions | one batched call per debounce window, no `refresh()`, reads via route handlers (S2.4, S3.6) |
| R12 | Infinite-query refetch is sequential (r4 §5) | independent 8-week chunk queries with `setQueriesData` on success (S3.5/S3.6) |
| R13 | Virtualizer does not re-measure on width changes (r4 §14) | `getItemKey` memoised on columns; `measure()` if widths ever change (S3.9) |
| R14 | React 19 `flushSync` warning from TanStack Virtual | `useFlushSync: false` on both virtualizers (S3.9) |
| R15 | jsdom renders 0 virtual rows | `offsetWidth`/`offsetHeight` stubs in ui tests; interactions in Playwright (S3) |
| R16 | Undo after a concurrent edit overwrites someone else's plan | stale-epoch check per assignment (M6-D13); replay uses the latest version |
| R17 | Grid and FR-612 dialog conflict with each other's versions | shared version registry (M6-D14) |
| R18 | Masking leak through `otherProjects` or leave labels | numbers only; `maskTimeOff` explicit literal; leak tests with distinctive strings (S2.2, S5.2) |
| R19 | M3 toasts on some DONE path forgotten | grep list in the S4.2 report + one ui test per path + e2e G12 |
| R20 | `rowTotal` all-time query violates the `week_start` rule | timeline-bounded range (M6-D7); guard + timing in perf test |
| R21 | Footer double counting when a person has two tasks | footer = Σ cells per period (not per row), golden S5.3 asserts project footers |
| R22 | Per-cell MUI Tooltip/`sx` kills render time (§9) | plain cells + CSS Modules + one delegated tooltip (S3.4) |
| R23 | Older e2e specs break on new tabs and new toast texts | S6.3 list (m2 tabs/archive, m3 E9/E13) |
| R24 | `seedGolden` audit rows change older counts | S5.5 updates counts (M6-D23) |

---

## 10. Close-out

**PROGRESS.md updates:**
- Milestone table: M6 ✅ with date, commit hash and tag `m6`.
- Decisions: copy §3.1 (X02, X03, X10–X15, X17–X19, X27–X29, X40–X47, X49, X51, X53, X55–X59, X65, X71, X76, X07, X80–X93, X96 as applied) and §3.2 (M6-D1 … M6-D36).
- Deviations: **M6-D6** (BR-25 boundary clamp-and-spill / reject; what · why · instead).
- Known issues: AC-203 closed (remove the M1 item); forward notes — **M7** replaces `planWeek`'s `DAY_WEEK` branches with `NEEDS_CHOICE`/SCALE/BR-22 and flips AL-DAYWEEK to 409, reuses `distribute`/`spreadWeek`/`clampAndSpill`, `lockAssignments`/`authorizeItems`/`assertVersions`, `repo.allocations.{listForWeeks,deleteWeek,insertWeekPlan,plansFromRows}`, `repo.assignments.bumpVersions`, `useSaveAllocations`, `useGridKeyboard`, `src/lib/grid/undo.ts`, `columns.ts`, `fetch.ts`, `GridModel.periods`, `Footer`/`FooterCell`, header plain click; **M8** places ◆ with `columnIndexOfPeriod` (day columns too, plus M7's `CellMenu` `items?`), sets `HEADER_ROWS = 2`, turns `GridMilestone` into `MilestoneDTO` (status, late, progress), fills `milestones`/`lateForMilestone`, adds `context.canManage` and `SaveAllocationsOk`/`PlanAssignmentRangeOk.lateness` (from `LockedSet.taskIds`), extends `applyServerResults` and `invalidateAfterGridSave`; **M9** adds the person context (`GridContextInfo`, `canManage: false`), the `masked`/`project` row kinds and row keys `p:`/`m:`, reuses `repo.allocations.loadByUserWeek`, `load.view`, `PlanGrid` with `{ kind: 'person' }` (+ `label`/`focusWeek`), `repo.milestones.listForProjects` with an id array, `GridPage`, extends `invalidateAfterGridSave`, and verifies AC-604 on `/people/[id]`.

**Commit** (orchestrator, after G4):
```
feat(m6): weekly planning grid, FR-612 plan range, golden F1

- PlanGrid: 2-axis virtualisation, ±156-week timeline, every §4.8 input/delete gesture, undo/redo, footer + other-projects switch, leave/holiday/tentative marks, ⛔ badge (X76)
- allocations + custom migration allocations_week_day_guard (SPEC trigger + exclusion); batch saveAllocations (lock order, per-item authz, versions, audit)
- domain: units (format/parse/f/h), certainty split, allocation (distribute, spreadWeek, clampAndSpill, planWeek, planRange BR-25), completed (BR-50/51/52)
- GET /api/grid/project/[projectId]; planAssignmentRange (dryRun + apply)
- BR-52 numbers on every DONE path via setStatus; FR-406 X in the archive toast; FR-405 without reload
- AC-801, AC-802, AC-803, AC-805; AC-603 plans, AC-604 (plan), AC-203 grid label; golden F1
- authz rows GR-*, AL-*, PR-* (PERM-06, PERM-12); grid masking; e2e m6-grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
**Tag:** `git tag m6`.
