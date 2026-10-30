# M7 — Daily resolution

> Depends on: M6 ✅ · SPEC: §4.8 (FR-802 day zoom, FR-803 inline expand, AC-804; "การกรอก"/"การลบ" on day cells), §5.3 (BR-20 … BR-24 + invariants; BR-26 DAY part), §5.6 (BR-40 at day level, BR-45 tones), §6.3, §7.4 (`NEEDS_CHOICE`, `onDayWeekConflict`), §7.5, §8.4, §8.9, §11.1 (allocation + overload rows), §12 M7 ·
> Owner-visible result: in a project's **แผนงาน** grid you can zoom to days or expand single weeks inline (header click / `Cmd+↓`), see week plans spread over the days as **dashed** derived values, type day values (the week turns into a real daily plan and its total follows), edit a daily week's total through the two-option BR-24 dialog (one dialog for many weeks), merge it back with "↕ รวมเป็นรายสัปดาห์" (undo toast), and see per-day overload glyphs (🔴 / ⚠) and load tones in the footer.

---

## 1. Goal and scope

### 1.1 In scope

Legend — "Where": stream.step in §5. "Test": `unit` = Vitest node, `ui` = Vitest jsdom, `int` = Vitest + Postgres, `authz` = row in `tests/authz/rows/*.ts` (§7.2), `golden` = `tests/golden/day-level.int.test.ts`, `e2e` = scenario id in `e2e/m7-daily.spec.ts` (§7.3).

| ID | What M7 delivers | Where | Test |
|---|---|---|---|
| FR-802 (M7 part) | Zoom toggle **[สัปดาห์ \| วัน]**: day zoom = every week expanded (`zoom=day`); persisted in preference `grid.zoom` | S0.3, S2.2, S3.3, S3.11 | int `grid-day.int.test.ts › zoom=day` · e2e D5 |
| FR-803 | Inline expansion of single weeks: click the week header or `Cmd+↓`; `Cmd+↑` collapses the **view** (never data) | S2.2, S3.1–S3.3 | ui `GridHeader.day.test.tsx` · e2e D1, D6 |
| AC-804 | Expand Ivy week 2026-09-28 (250 cd WEEK) → 0.5 × 5 dashed → Wed = 1.0 → week 3.0, other days solid | S1.5, S2.4, S3.4–S3.6 | unit `allocation.day.test.ts › AC-804` · int `allocations-day.int.test.ts › AC-804` · e2e D1 |
| BR-20 | WEEK week: one WEEK row; day values are display-only (`derived: true`) | S1.4, S1.11, S2.3, S3.4 | unit · int `grid-day › derived` · ui `GridCell.day.test.tsx` |
| BR-20a | DAY week: ≥ 1 DAY rows; week total = Σ days (W cell = sum, `days` record) | S1.8, S2.3 | unit property P3 · int |
| BR-20b | Never both in one (assignment, week): every M7 writer locks the assignment first, then DELETE-before-INSERT per week in one tx (trigger from M6 is the backstop) | S2.4 | int `tests/integration/allocations-race.int.test.ts › M7` |
| BR-21 (display) | Derived day values = BR-21 largest remainder over `dayCapacity`, computed by one shared function on server and client | S1.4, S1.11, S2.3 | unit · int contract test `grid-day › parity` · golden |
| BR-21a | `weekCapacity = 0` → spread by schedule; schedule all 0 → equal Mon–Fri; W cell flag `fallback` + warning "วางงานในวันที่ไม่ทำงาน" | S1.4, S1.11, S2.3, S3.4 | unit · int `grid-day › BR-21a` |
| BR-22 | Editing a day of a WEEK week: spread (BR-21) → apply the user's days → clamp-and-spill the other days → DELETE WEEK → INSERT DAY rows (skip 0), one tx; new total = W − Σderived[edited] + Σx | S1.5, S2.4, S3.6 | unit · int · e2e D1, D7 |
| BR-23 | "↕ รวมเป็นรายสัปดาห์": DAY rows → one WEEK row with the same total; undo toast, no confirm | S1.7, S1.8, S2.4, S3.9 | unit · int `› BR-23` · e2e D4 |
| BR-24 | Editing the total of a DAY week → dialog **ปรับตามสัดส่วนเดิม** (SCALE, largest remainder + spill) / **เปลี่ยนเป็นรายสัปดาห์** (COLLAPSE); one dialog for N weeks; Cancel drops only those weeks; undo never shows it | S1.6, S1.8, S2.5, S3.8 | unit · int `› NEEDS_CHOICE/SCALE/COLLAPSE` · authz · e2e D2, D3 |
| §5.3 invariants | Σ distribute = t; expand → collapse keeps the week total; displayed day sum = week total for every resolution; + every stored day ≤ 100, spill preserves sums, snapshot round-trip | S1.9 | unit (fast-check) `allocation.day.property.test.ts` |
| BR-26 (DAY part) | DAY `0 < v ≤ 100` cd: typed > 1.00 rejected per cell; zod rejects DAY > 100; 0/null deletes the day | S0.3, S1.8, S3.6 | unit `src/lib/schemas/allocations.test.ts` · int · ui |
| BR-40 (day level, X06) | `overloadLevel` per person per day (committed > cap → OVER; total > cap ≥ committed → RISK) → 🔴/⚠ glyph on assignee day cells and footer day cells | S1.10, S3.10 | unit `overload.test.ts` · ui `Footer.day.test.tsx` · golden · e2e D7 |
| BR-45 (tones, X06) | `loadTone` integer bands on footer "ภาระรวม" **day** cells (week-level tones → M9) | S1.10, S3.10 | unit · ui |
| FR-804 (day cells) | Fraction unit on day cells = cd ÷ that day's capacity; cap 0 → days; 'รวม' column uses week capacity | S3.6 | unit `src/lib/grid/day-input.test.ts` |
| FR-807 (day cells) | Leave stripes + "ลา" icon on day cells (masked label), holidays grey + 🎌 + name in header tooltip | S2.3, S3.4 | ui · e2e D7 |
| §4.8 การกรอก/การลบ on day cells | Type, Enter/Tab, Esc, arrows, range fill, `f` = day capacity, `h` = half rounded to 25, fill handle, paste, `Cmd+←/→`, Delete — same-kind column rules; one undo entry per gesture | S3.6, S3.7 | unit `kinds.test.ts`, `day-input.test.ts` · e2e D6 |
| §7.4 NEEDS_CHOICE / onDayWeekConflict | Batch save returns `{ code: 'NEEDS_CHOICE', week, weeks[], pairs[] }`; `SCALE`/`COLLAPSE` applied to every conflicting pair; validated before any write | S0.4, S2.5 | int · authz |
| §7.5 / AC-805 continuity | Undo/redo of day edits, SCALE, COLLAPSE and BR-23 via complete week snapshots (7 days); never triggers the dialog | S3.9 | unit `undo.day.test.ts` · e2e D2, D4 |
| §8.4 | Expanded-week layout: header "19 ต.ค. 2569", narrow weekday labels, 🎌, dashed derived values, ↕ action, narrow editable "รวม" column | S3.1–S3.5 | ui · e2e D1 |
| §8.9 | Derived = dashed **and** `aria-description`; glyphs have text alternatives; header toggles are buttons with `aria-expanded`; keyboard-only expand/collapse/collapse-to-week | S3.12 | ui · e2e D6 |
| BR-50 at day level (r6b M7-07) | Completion cut-off stays per week: day cells of the completion week count, later weeks do not; tooltip | S3.10 | unit `day-footer.test.ts` |
| BR-42 at day level (r6b M7-08) | Leave recorded after DAY rows changes nothing; day cells flag `TIME_OFF` → glyph + "มีงาน X วันวางไว้ในวันที่ลา" | S1.11, S2.3, S3.4 | int `grid-day › leave later` · ui |
| X29 (day keys) | Footer switch "รวมงานโปรเจคอื่นของคนเหล่านี้" also returns `otherProjects['D:…']` (no names/ids) | S2.3 | int · masking |
| KEY-07 / X07 | `Cmd+↓`, `Cmd+↑`, `Shift+F10` (cell menu) registered in the `?` help | S0.6, S3.3 | unit `shortcuts.test.ts` |
| Seed (PLAN §3.13) | `addDayExample(db)` — Mobile "Kickoff workshop", Jack + Mint 0.5 DAY on 2026-09-07 (App. A.2) | S0.7 | int `scripts/lib/fixtures.int.test.ts › addDayExample` · golden · e2e D5 |
| FR-1201 / X44 | One audit row per assignment per batch, inside the tx; conversions recorded in `after` | S2.6 | authz (audit assertion) · int |

**§3.2 permission rows in scope** (PERM numbering = §3.2 table order, as in M3):

| PERM | §3.2 row | M | L | Me | W | Rows (§7.2) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-06 | เห็นโปรเจค / เปิดโปรเจค (grid read with `zoom=day` / `expand`) | allow | allow | allow | 404 | GR-D-ZOOM, GR-D-EXPAND, GR-D-ARCH, GR-D-BADQ, GR-D-MISSING |
| PERM-12 | วางแผน (แก้ allocation) — BR-22 split, DAY edits, NEEDS_CHOICE, SCALE, COLLAPSE (= BR-23), clear | allow | allow | allow | 404 | AL-D-SPLIT, AL-D-SET, AL-D-NEEDS, AL-D-SCALE, AL-D-COLLAPSE, AL-D-CLEAR, AL-D-MIXED, AL-D-MAX |

Archived project A (X42): every PERM-12 row above → M/L/Me `403`, W `404` (AL-D-ARCH, AL-D-ARCH-COLLAPSE); the grid read stays allowed (GR-D-ARCH). Implemented by M6's `requireProject` path inside `saveAllocations` (S2.4 keeps it before any allocation access); tested by S4.1.

### 1.2 Out of scope (do NOT build; target milestone)

| Item | Lands in |
|---|---|
| BR-41 causes, excess amounts ("เกินกี่วัน"), week-level BR-45 tones in the grid footer and workload cells, `/workload`, overload list, badge | M9 (X06, X67) |
| Person grid `/people/[id]` (incl. its day zoom and masked rows) | M9 |
| FR-906 impact-panel line "มีงาน X วันวางไว้ในวันที่ลา" / new-overload links | M9 (X23; M7-D15) |
| ◆ milestone row in day columns, AC-701 day placement, drag ◆ ±1 day | M8 (X66) |
| `seed:demo` composition (only the `addDayExample` builder is built now) | M11 (X69) |
| v2.1's third BR-24 option "เติมวันที่ยังว่าง", `EXPAND/REDISTRIBUTE`, warn-before-collapse dialog, drag task bars | never (r5 C10, C11, C34) |
| Excel import/export, scenarios/what-if, notifications, time tracking | SPEC §13 #10, #11, #6 · §1.4 |
| Full-scale performance measurement (`seed:perf`) | M11 (M7 runs a local smoke only, §7.4) |

### 1.3 Carried-in items (deferred to M7 by earlier milestones)

| From | Item | Ruling |
|---|---|---|
| M6 | DAY-resolution weeks (BR-25 boundary weeks) were read-only totals with ⋯ and the toast "สัปดาห์นี้มีแผนรายวัน"; M7 makes them editable (BR-24) and removes that skip from every gesture | X27 |
| M6 | `saveAllocations({ items, onDayWeekConflict?, clientOpId })` batch: `lockAssignments` → `authorizeItems` → `assertVersions` (VERSION_CONFLICT `{ current }`) → `planWeek` → replace-week → `repo.assignments.bumpVersions` → `auditItems` (m06 S2.3/S2.4). M7 completes the per-week table (BR-22/23/24, NEEDS_CHOICE) | X65, X27, M6-D3 |
| M6 | `planWeek` exists as the **M6 subset** (M6-D4): partial DAY edits on a WEEK week and WEEK ≠ Σ on a DAY week return reason **`DAY_WEEK`** (`VALIDATION` 400, `th.grid.errors.dayWeek`), asserted by `allocations.int.test.ts › X27 / M6-D34`, authz row **AL-DAYWEEK** and e2e **G6**. M7 replaces those branches and removes `DAY_WEEK` everywhere (S1.8, S2.10, S3.14, S4.5, S5.3, §6) | M6-D4, M6-D34, X27 |
| M6 | `distribute`, `spreadWeek` (incl. the BR-21a fallback), `clampAndSpill`, `weekPlanTotal` and the types `Days7`, `DayCtx`, `WeekPlan`, `WeekChange`, `PlanWeekResult`, `DayWarning`, `StepResult`, `OnDayWeekChoice` in `src/domain/allocation.ts` (BR-25 needed them) — M7 reuses them unchanged | m06 S1.3/S1.4 |
| M6 | `repo.allocations.{AllocRow, listForWeeks, deleteWeek, insertWeekPlan, plansFromRows, loadByUserWeek}` and the internal week-context helper `services/allocations.ts#loadWeekCtx` (M7 replaces it, M7-D25) | m06 S2.1, S2.6 |
| M6 | Client column model already has M7's shape (`GridColumn { kind: 'W' \| 'D'; role }`, `buildColumns(weeks, expanded, dayDatesByWeek)` which throws on a non-empty `expanded`), `chunksForRange(today, firstWeek, lastWeek)` takes weeks, `HEADER_ROWS`/`FOOTER_ROWS`; `gridChunkUrl` already maps `zoom`/`expand` (M7-D17); query keys carry `expand` and `zoom` (`GridChunk`); period keys are `W:`/`D:` | M6-D35, m06 S3.1/S3.2, PLAN §3.5 |
| M6 | A plain click on a week header does nothing (reserved for M7); Shift+click selects the column; `Mod+ArrowDown/Up` are unmapped in `keymap.ts`; undo entries already refresh `after` from the server `weeks` | M6-D33, m06 S3.8, S3.14 |
| M6 | Fraction unit "dayCapacity for a day cell" and the same-kind rules for fill/shift/paste were deferred to M7 | r6b M6-04, M6-08, M6-09 |
| M1 | `NEEDS_CHOICE` error code is added by M7 (M1-D23) | PLAN §3.4.1 |
| PLAN | `overload.ts` BR-40 levels + BR-45 tones (pulled forward from M9) | X06 |
| PLAN | Preference key `grid.zoom` ('WEEK' \| 'DAY') — added by its first consumer | PLAN §3.9, X59 |
| PLAN | `addDayExample(db)` builder | PLAN §3.13, X11 |
| r7 | A11Y-2b keyboard path for expand/collapse; FR-807 day cells; BR-26 DAY limit | r7-traceability M7 rows |

---

## 2. Read first

- **SPEC:** §0–§3 (esp. §3.2 PERM-06/PERM-12, §3.3 masking, §3.4), §4.8 (whole section incl. "การกรอก", "การลบ", AC-801…805), §5.1, §5.2, §5.3 (BR-20…BR-27 + invariants + the `distribute` sample — **do not copy its float tie-break**), §5.5 (BR-37), §5.6 (BR-40, BR-45), §5.7 (BR-50), §6.2 (`allocations` checks), §6.3, §7.4, §7.5, §8.3, §8.4, §8.6, §8.8 (1 decimal in grid, 2 in tooltips), §8.9, §11.1, §12 M7, Appendix A.1 (Ivy/Jack/Peter/Cindy rows), A.2 ("Kickoff workshop").
- **Previous plans (names reused verbatim, M7-D28):** `plan/m06-weekly-grid.md` §3 (M6-D3/D4/D5/D13/D25/D33–D36), §5.S0 (S0.4 DTOs, S0.5 zod, S0.9 i18n, S0.11 world, S0.12 `StatusGlyph`), S1.3/S1.4, S2.1–S2.6, S3.1–S3.14, S5.1 (`AL-DAYWEEK`), S6.1 (`GridPage`), §7.3 G1/G6; `plan/m05-calendar-capacity.md` world (`coworker`, `w.leaveTypes.training`, `w.timeOff.member`), `loadCapacity`/`loadCapacityInputs`; `plan/m01-auth-employees.md` `AppError`/`toActionError`, `getPreferences`/`usePreferences`; `plan/m03-tasks.md` M3-D39 repo names. Sibling contracts that cite M7: `plan/m08-milestones.md` (M8-D9/D10 `CellMenu.items?`, `columnIndexOfPeriod`), `plan/m09-workload-people.md` (S2.5 `dayLoadsForProjects`, S3.3 `personDayLoads`).
- **PLAN.md:** §1.3 (Drizzle errors, BR-20b race, `serverToday()`, MUI 9, TanStack Virtual, Playwright clock), §1.4 **X06, X27, X29, X41, X42, X44–X47, X49, X51, X53, X55, X56, X59, X65, X67**; §2.3 ownership; §3.4 (errors incl. `NeedsChoiceError`, `action()`, `route()`, authz, transactions, audit); §3.5 (query keys, `GridChunk`, invalidation); §3.6 (units, `distribute`, format); §3.7 i18n; §3.8 undo/keys; §3.9 (tokens, `usePreferences`); §3.10 grid architecture; §4 testing.
- **Research:** `plan/research/r6b-gaps-m6-m11.md` §3.2 (M7-01…M7-09), §3.1 M6-01/02/04/05/06/07/08/09/13/15/16/18/20, §4.1–§4.3, §4.7, §4.8, §5 "M7"; `r5-v21-mining.md` §2 M7 (M7-01…M7-18), §3.1 (E1–E20), §3.5, §6 (cap-and-spill vectors), §8 C11/C13/C16/C34, §10.4 (`capAndSpill` model); `r8-golden.md` §3.3 G1/G2/G6, §4.7 (day zoom table), §6.7, §6.8 (AC-804, BR-24 numbers), §6.10 (Kickoff totals); `r2-auth-db.md` T7, T9, T9-fix and finding 3 (lock first); `r4-client-testing.md` §11–§16 (save hook, virtualizer API, re-measure rules, jsdom stubs), §37 (fast-check), §38 (clock), §41 (synthetic paste).
- **Snippets:** `plan/research/snippets/r4/client/components/grid/{VirtualGrid.tsx,useSaveAllocations.ts,grid-types.ts,useGridWindow.ts}`.
- **docs:** `docs/reference/golden-fixtures.json` (`tasks[]`, `expected.F2/F3/F4.setup`).

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings

| ID | What it means in M7 |
|---|---|
| X06 | `src/domain/overload.ts` gets `overloadLevel` (BR-40) and `loadTone` (BR-45, integer bands) now, test-first; used for **day-level** status only. BR-41, excess and week-level colours stay M9. |
| X18 | Every M7 grid mutation goes through M6's save hook, which patches the saving grid's own chunks and calls M6's `invalidateAfterGridSave(qc, ctx)` (`src/lib/grid/save-invalidate.ts`) for the other views; M7 adds **no** new invalidation. No `refresh()` in `saveAllocations`. |
| X27 | M7 removes M6's "DAY week = read-only" skip and toast; BR-22 editing, BR-23, BR-24, `NEEDS_CHOICE` and the dialog land here. |
| X28 | `milestones: []`, `lateForMilestone: false` unchanged. |
| X29 | `includeOthers=1` adds `otherProjects['D:…']` for day periods (totals only, no names/ids). |
| X40 | `pnpm check` includes integration tests; `pnpm db:up` first. |
| X41 | Invisible → 404; archived writes → 403; bad query → 400 (parse precedes authz and reveals nothing). |
| X42 | Archived project: grid with day zoom readable; every allocation write `FORBIDDEN`. |
| X44 | Saves write one audit row per assignment per batch in the same tx; the matrix asserts it for allow rows. |
| X45 | Integration/e2e pin `APP_NOW=2026-09-30T10:00:00+07:00`; services receive `today`. |
| X46 | E2E on the production build; `resetDb()` + `loginAs()` + `page.clock.setFixedTime`; page objects; "update older specs" step (S5.3). |
| X47 | `z.uuid()`, `z.iso.date()`, Thai only via `th.*`, no `revalidateTag`. |
| X49 | `Cmd/Ctrl+↓/↑` match `e.code === 'ArrowDown'/'ArrowUp'` with `metaKey \|\| ctrlKey`; `f`/`h` by `KeyF`/`KeyH`; digits by `Digit*`/`Numpad*`. |
| X51 | Tones use the X51-corrected tokens (`--load-light-fg #8F5C00`); derived values use the "faded" token `#5B6878` + dashed underline, never opacity. |
| X53 | No `localStorage`: expansion state is in memory; zoom lives in `user_preferences`. |
| X55 | Integration DB names per run (unchanged harness). |
| X56 | New server modules do not import `server-only`; services never read the clock. |
| X59 | S0 creates **no runtime files under `src/domain/**`** (signatures are documented in §5.S1); factories insert with plain Drizzle; preference key `grid.zoom` is added now (first consumer). |
| X65 | `saveAllocations` stays one tx across assignments (lock `ORDER BY ta.id FOR UPDATE OF ta`, authz per item, version check, one audit row per assignment). Clamp-and-spill on **every** DAY write (BR-22, BR-24 SCALE). `f`/`h`/paste/fill/shift rules apply to day cells per cell capacity; cap-0 cells skipped; one undo entry per gesture of week snapshots. |
| X67 | Applied at day level for consistency with M9: tone follows the selected view's load (ทั้งหมด → total, แน่นอน → committed, ยังไม่แน่นอน → total − committed with the tentative palette); the glyph always shows the BR-40 level. Bands are integer (`5·load ≥ 4·cap`). |
| X07 | New shortcuts are added to `src/lib/shortcuts.ts` (help dialog). |
| X04 | Undo entries (`useUndo().push`, 8 s sonner toast, `Cmd+Z`/`Cmd+Shift+Z`) come from M1's framework; BR-23 collapse uses it instead of a confirm. |
| X30 | Grid leave labels stay masked by M6/M5's `maskTimeOff`; day cells add only the `TIME_OFF` code, never a type or note. |
| X76 | Task rows keep `blockers: { open, total }` in every `GridResponse` M7 touches (day zoom included); day-level work never changes task statuses. |
| X82, X83, X85, X86, X87, X90, X91 (2026-10-30 contracts) | X85 is the grid contract M7 completes: `buildColumns` day branch (S3.1), `GridPeriod.expanded?` (S0.2), `AssigneeCell.fallback?`/`warn?`, `NEEDS_CHOICE { week, weeks, pairs }` (S0.4), `UNREPRESENTABLE`, `DAY_WEEK` removed (§6), COLLAPSE before the Σ no-op (S1.8), `repo.allocations.dayLoadsForProjects` + `spreadDayLoads` (S2.1, S1.11), `personDayLoads(rows, periods, { extra? })` (S3.10), `CellMenu` `items?` for M8 (S3.9); X82 no new invalidation (M6's `invalidateAfterGridSave`); X83 `getJson`; X86 malformed project id → 404 (GR-D-MISSING covers unknown ids; M6's GR-BADID covers malformed ones); X87 `repo.assignments`/`repo.allocations` names; X90 `save` takes `today`; X91 rows files registered in `tests/authz/rows/index.ts` (S4.1), world `with: ['dayAllocations']`. |

### 3.2 New milestone decisions (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M7-D1 | §12 M7, PLAN §5 | Streams refined from the skeleton: **S1 (domain) also owns the shared pure day model `src/lib/grid/day.ts`** used by both the grid service and the client, so S2 and S3 depend on S1; tests split into **S4** (authz rows, masking, golden day-level, lock/race; depends only on S0) and **S5** (e2e + page objects + older specs). Service integration tests are written test-first by S2 inside `src/server/**` (M3-D1 precedent). | One implementation of derived values on both sides (r6b M7-09); ownership by path (PLAN §2.3). |
| M7-D2 | BR-23, r5 M7-06 | **No new server action for BR-23.** The client command `collapseToWeek` sends a WEEK change equal to Σ days with `onDayWeekConflict: 'COLLAPSE'` through the normal save pipeline (serial scope, version read at send time → a stale sum is caught by `VERSION_CONFLICT`). Undo toast "รวมเป็นรายสัปดาห์แล้ว · เลิกทำ", no confirm. For this to work, `planWeek` on a DAY week checks **`choice === 'COLLAPSE'` before the "x = Σ days → unchanged" no-op** — m06 S1.4 / M6-D4 already use this order (fixed 2026-10-30, with the table row "WEEK 300 + COLLAPSE → WEEK 300, changed" and the int case "W = Σ + COLLAPSE → one WEEK row"), so M7 keeps it unchanged (X85). | Single write path; P2. The skeleton's "collapseToWeek action" becomes a client command. |
| M7-D3 | §7.4, BR-24, r6b M7-03 | `NEEDS_CHOICE` payload = `{ week, weeks: ISODate[], pairs: { taskAssignmentId, week }[] }` (`week` = first of `weeks`, SPEC-compatible). The server validates every (item, week) before writing; any pair needing a choice → nothing is written, no version bump, no audit. | Superset of SPEC; one dialog for N weeks. |
| M7-D4 | BR-24, r5 §3.5 | The client opens the BR-24 dialog **pre-emptively** when its cache shows a DAY week under a WEEK change; the server's `NEEDS_CHOICE` is the authority and opens the same dialog as a fallback. While open, the typed value shows as pending (`data-pending-choice`). Choice → those changes are enqueued with that `onDayWeekConflict`; Cancel → only the conflicting pairs are dropped and reverted, the rest is sent. The save queue never merges changes with different `onDayWeekConflict` values (it flushes first). Undo/redo/collapse always send DAY snapshots or `COLLAPSE` and never open the dialog. | One choice per gesture; no surprise data loss. |
| M7-D5 | BR-24, r5 E5 | On a DAY week: WEEK `null`/0 deletes all rows of that week **without** a dialog (Delete is undoable); a WEEK value equal to the current Σ days without a choice is a no-op. An item whose every week is a no-op is skipped (no version bump, no audit). | P1/P2; avoids pointless dialogs. |
| M7-D6 | §7.4, r6b §4.2 | An item with WEEK **and** DAY changes for the same week → `VALIDATION` reason `MIXED_WEEK_AND_DAY`. The client queue flushes before it enqueues a change of the other granularity for a week that already has queued changes. | Deterministic server semantics. |
| M7-D7 | BR-22, BR-24, BR-26, §6.2 check | **DEVIATION (SPEC-internal conflict BR-22/BR-24 vs BR-26 + DDL `person_days <= 1`):** stored DAY values are clamped at 100 cd and the excess **spills** to non-fixed days in X65 tier order (working days with room → scheduled days lost to leave/holiday → non-scheduled days), earliest first within a tier; sums are preserved. "Fixed" = days the user (or a snapshot) set. If nothing can absorb the excess → `VALIDATION` reason `UNREPRESENTABLE` (cell rejected, Thai message). SCALE also spills (overrides r7's "reject SCALE"; X65 wins). | Golden F2/F3/F4 otherwise make the natural fix action fail (r8 G1/G2); P4 keeps overloads visible. Record under PROGRESS › Deviations. |
| M7-D8 | BR-22, r5 E4, r6b M7-04 | A day edit always materialises the week, even when the typed value equals the derived one (AC-804 wants the other days to become real). Displayed derived values are the **pure BR-21 values** (may exceed 1.0, e.g. 1.3); when clamping changes stored days, the toast "แยกเป็นรายวันแล้ว — ปรับค่าที่เกิน 1 วัน/วัน" is shown (warning `SPILLED_OVER_DAY_LIMIT`). | Literal AC; honest display. |
| M7-D9 | BR-21a, r5 M7-04 | Fallback chain for spreading: `dayCapacity` → schedule (if Σ dayCaps = 0) → equal Mon–Fri weights (if Σ schedule = 0). The W cell carries `fallback: 'SCHEDULE' \| 'WEEKDAYS'`; saves emit `WEEK_NO_CAPACITY`; derived day cells on cap-0 days carry `warn: ['NON_WORKING']`. | Never lose a total (r5 verified loss). |
| M7-D10 | FR-802/803, §8.4, r6b M7-02, r5 M7-08 | Expanded week = day columns **Mon–Fri always + Sat/Sun only when a grid person is scheduled that weekday or a DAY row exists that date**, followed by a narrow editable **"รวม"** column (W key, 52 px; distinct from M6's sticky all-time row-total column `cell-<rowKey>-total`). Day zoom = every week expanded (`zoom=day`, not `expand=` of everything). Expansion state is in memory per grid (not persisted); zoom is persisted (`grid.zoom`). Widths: week = M6's `WEEK_W` (64 px), day 44 px, รวม 52 px. Day labels render inside M6's single period header row (`HEADER_ROWS` unchanged). | Simplest layout meeting §8.4; no localStorage; M6-D35 column contract. |
| M7-D11 | FR-803, r6b M7-01, r5 M7-16 | Header click toggles expansion (button with `aria-expanded`); `Cmd/Ctrl+↓` on a week cell expands that week and focuses its first visible day cell; `Cmd/Ctrl+↑` on a day or รวม cell collapses and focuses the week cell; in day zoom header clicks and `Cmd+↑` are no-ops. None of these write data. M6 already left the plain header click free and maps Shift+click to column selection (M6-D33), so no M6 behaviour moves. | FR-803 literal; three distinct actions. |
| M7-D12 | §4.8, r6b M7-05, M6-07/08/09 | Column kinds: **W** (week columns and รวม columns) and **D** (day columns). Paste and fill stop at the first target column of another kind (toast "วาง/เติม/เลื่อนได้เฉพาะคอลัมน์ชนิดเดียวกัน"); `Cmd+←/→` requires every involved column to be the same kind and, for D, the same week (else no-op + toast). `f` = exact day capacity, `h` = `25·floor((2·cap+50)/100)`, both skip cap-0 days; typed DAY values > 1.00 are rejected per cell ("ไม่เกิน 1 วันต่อวัน"). | Excel-like; X65. |
| M7-D13 | BR-40, BR-45, X06, r6b M7-06 | Day-level load per person = Σ displayed day values of that person's assignee rows in this project (+ `otherProjects['D:…']` when the footer switch is on), committed by effective certainty, BR-50 applied per week. Glyph (🔴 OVER / ⚠ RISK + visually-hidden text) on that person's assignee **day** cells and on footer day cells (worst person's level; tooltip lists the people). Tone (`loadTone`) only on footer "ภาระรวม" day cells, aggregated (Σ load vs Σ cap). | Footer sums must not hide one person's overload. |
| M7-D14 | BR-50, r6b M7-07 | Completion cut-off stays per week: a period counts iff `period.weekStart ≤ task.completedWeek` (or the task is open). Day cells later in the completion week still count; tooltip "งานเสร็จแล้ว — สัปดาห์ที่ติ๊กเสร็จยังนับภาระครบทั้งสัปดาห์". | SPEC §6.5 `week_start <= completed_week`. |
| M7-D15 | BR-42, r6b M7-08, r5 M7-11 | Leave added later on days with DAY rows changes nothing. Day cells with cd > 0 on a time-off date carry `warn: ['TIME_OFF']` (glyph + "มีงาน X วันวางไว้ในวันที่ลา"); saves return `ALLOCATED_ON_TIME_OFF`. The FR-906 impact-panel line is M9's (with X23). | P4; keep M5's panel untouched. |
| M7-D16 | App. A.2, PLAN §3.13 | `addDayExample(db)` takes its data from **SPEC A.2** (the golden JSON has no such task): constants `{ project: 'Mobile App Revamp', task: 'Kickoff workshop', assignees: ['Jack','Mint'], day: '2026-09-07', cd: 50 }` with a comment citing A.2. The task is depth 0, appended after Mobile's last task, no override, `created_by` = golden Manager, audit actor `null`. | The only exception to "never re-typed" — the data is not in the JSON. |
| M7-D17 | §7.4 | Grid URL params: `zoom=week\|day` (lowercase, default `week`), `expand=<Monday>,<Monday>` (each a Monday in `[from, to)`, ≤ 53). `GridChunk.zoom` stays `'WEEK' \| 'DAY'`; M6's `src/lib/grid/fetch.ts#gridChunkUrl` maps it (X85). | r6b M6-31; PLAN §3.5 key unchanged. |
| M7-D18 | §7.5 | On save success the hook replaces the gesture's undo `after` snapshots with the server's authoritative weeks (so redo after spill is exact) — M6's `undo.ts` already does this (m06 S3.14); M7 only adds day-level tests. | Exact redo. |
| M7-D19 | r6b M7-09 | Server per-day capacity data: `people[u].capacity/standard` include `D:` keys for every day of **expanded** weeks and of every week in which `u` has a DAY-resolution cell (zeros omitted; a missing key means 0). The client builds `DayCtx` only from these keys. | BR-24 previews and optimistic BR-22 match the server; response stays small. |
| M7-D20 | §8.9 | Derived day cells: dashed underline + faded token + `data-derived="true"` + `aria-description` "ค่ากระจายจากแผนรายสัปดาห์"; DAY cells solid. Tooltip shows 2 decimals. | Never by colour alone. |
| M7-D21 | CLAUDE.md deps | No new dependencies. fast-check is used through `fc.assert` (no `@fast-check/vitest`). | PLAN §1.2. |
| M7-D22 | BR-20b, BR-22/23, §6.3 | The save rewrites a changed (assignment, week) as a whole: `DELETE … WHERE task_assignment_id = $1 AND week_start = $2`, then INSERT the new WEEK row or non-zero DAY rows; unchanged weeks are not touched. No upserts in M7's path. | One code path satisfies the trigger order for every conversion. |
| M7-D23 | BR-23, §8.4, r6b M7-01 | "↕ รวมเป็นรายสัปดาห์" = an icon button in the assignee row's narrow **รวม** cell of an expanded DAY week (visible on hover/focus) **and** the first item of the cell menu (right click / `Shift+F10`), which applies to every DAY (row, week) in the selection. | Per-row data action, keyboard reachable, never confused with collapsing the view. |
| M7-D24 | FR-803, PLAN §3.5 | Each 8-week chunk query carries only the expanded weeks inside that chunk (`chunkParams`), so expanding a week refetches one chunk; placeholders (Mon–Fri) show while it loads. | Keeps the `GridChunk` key shape; minimal refetch. |
| M7-D25 | r6b M7-09, C18 | The grid service and the save service build `DayCtx` through one server helper (`services/day-context.ts`: `loadDayData` + `loadDayCtx`) feeding `src/lib/grid/day.ts#dayCtxFor`, the same function the client uses on the response; a parity test pins it. **`loadDayCtx(tx, userIds, weeks): Promise<Map<userId, Map<ISODate, DayCtx>>>` has exactly the signature of M6's `services/allocations.ts#loadWeekCtx`; S2 deletes `loadWeekCtx` and switches its two call sites (`save`, `planRange`) to `loadDayCtx`**; M6's `plan-range.int.test.ts` and `allocations.int.test.ts` staying green is the compatibility proof. | One source of truth for spread values. |
| M7-D26 | §7.4, BR-24 | A `VERSION_CONFLICT` while the BR-24 dialog is open closes the dialog and reverts that assignment's pending pairs (M6's conflict flow). | No choice applied to stale data. |
| M7-D27 | X29, BR-21, C39 | Other-project day loads come from one repo function **`repo.allocations.dayLoadsForProjects(tx, { userIds, weeks, excludeProjectId?, projectIds? })`** (rows grouped by user/week/granularity/period with committed and total cd; same §6.5 filters as M6's `loadByUserWeek`) and one pure spreader **`src/lib/grid/day.ts#spreadDayLoads`**: WEEK rows are spread to days separately for their committed and tentative parts, then summed, so `committed ≤ total` holds per day. M9 reuses both (person grid masked row: `projectIds` = hidden projects). | Largest remainder is not monotone; one aggregate for M7 and M9. |
| M7-D28 | M6-D35, G17/G18/G21/G22/G25 | **M6's names are the source of truth** (m06 §5.S0 + S2/S3): M7 extends M6 declarations additively and never redeclares one — `GridColumn`/`buildColumns`/`WEEK_W`/`HEADER_ROWS`/`FOOTER_ROWS`, `gridQuerySchema` (`from`/`to` stay optional, X65 default window), `VERSION_CONFLICT { current }`, `snapshotOf(cell, taskAssignmentId, week)`, `WeekSnapshot`, `CellWrite`, `GridModel`, `TargetCell`, `parseCellInput`, `halfCapacityCd`, `LoadView`, `StatusGlyph`, `getJson`, the world's `coworker`/`pCoworker`/`qTaskCoworker`. The M6-only reason `'DAY_WEEK'` is **removed** from `SaveValidationReason` and `PlanWeekResult` (not redeclared): S1 drops it from the domain union, S2/S3 delete its server/client uses, and the orchestrator deletes it from `src/lib/contracts/grid.ts` together with `th.grid.errors.dayWeek` / `th.grid.toast.dayWeekReadOnly` once both report no use (§6). | One name per concept across M6–M9. |

DEVIATION summary: **M7-D7** only (record in `PROGRESS.md › Deviations`: what = clamp-and-spill of DAY values in BR-22/BR-24; why = BR-26 + DDL check forbid > 1.00/day; instead = spill with warning, sums preserved).

---

## 4. Streams (machine-readable)

DAG: `S0 → {S1, S4}`; `S1 → {S2, S3}`; `{S2, S3, S4} → S5`. Concurrent sets: {S1, S4}, then {S2, S3, S4}. S0 runs alone and may touch the M6/M1 files its steps name (they belong to the globs of later streams afterwards). `src/i18n/th.ts` belongs to S0; afterwards S2 may add keys only in `errors`/`audit`, S3 only in `grid` (sub-objects `toolbar`, `day`, `br24`, `warn`, `glyph`) and `overload` (PLAN §2.3, Edit tool only); key **removals** (`grid.errors.dayWeek`, `grid.toast.dayWeekReadOnly`) and the `'DAY_WEEK'` union member are deleted by the orchestrator in §6. S1's `src/lib/grid/day.ts` is read-only for S2 and S3 (S1 → S2/S3 is sequential, so the globs never run concurrently). S1 owns M6's `src/domain/allocation.test.ts` too (it updates two M6 rows, S1.8).

```json
{ "milestone": 7,
  "streams": [
    { "id": "S0", "title": "Contracts: M6 name map, additive grid DTO day fields, gridQuerySchema expand/zoom + grid.zoom preference, NeedsChoiceError, i18n, shortcut entries, StatusGlyph over/risk, addDayExample builder, world 'dayAllocations' (reusing M5/M6 coworker), e2e resetDb dayExample option", "agent": "backend-engineer",
      "owns": ["src/lib/contracts/**", "src/lib/schemas/**", "src/lib/shortcuts.ts", "src/lib/shortcuts.test.ts", "src/i18n/th.ts", "src/server/errors.ts", "src/server/errors.test.ts", "src/components/common/StatusGlyph.tsx", "src/components/common/StatusGlyph.test.tsx", "scripts/lib/fixtures.ts", "scripts/lib/fixtures.int.test.ts", "tests/helpers/**", "e2e/fixtures.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain: allocation.ts BR-22/23/24 + full planWeek (drops DAY_WEEK) + invariants (fast-check), overload.ts BR-40/BR-45, shared pure day model src/lib/grid/day.ts incl. spreadDayLoads (TDD)", "agent": "domain-engineer",
      "owns": ["src/domain/allocation*.ts", "src/domain/overload*.ts", "src/lib/grid/day.ts", "src/lib/grid/day.test.ts"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Backend: grid service day periods/cells/capacity/otherProjects (repo.allocations.dayLoadsForProjects), day-context.ts replacing loadWeekCtx, save service per-week table (BR-22/23/24, NEEDS_CHOICE, spill, warnings), audit, integration + contract tests, M6 X27 test flip", "agent": "backend-engineer",
      "owns": ["src/server/**", "src/app/api/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S2" },
    { "id": "S3", "title": "PlanGrid: zoom toggle, inline expand/collapse, day columns + รวม, derived rendering, day editing + same-kind rules, BR-24 dialog flow, collapseToWeek + undo, day footer tones/glyphs, a11y", "agent": "grid-engineer",
      "owns": ["src/components/grid/**", "src/lib/grid/**", "src/app/(app)/projects/[id]/plan/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Authz matrix rows (test-first) + AL-DAYWEEK flip, masking day cases, golden day-level tests, lock-first and race integration tests", "agent": "test-engineer",
      "owns": ["tests/authz/**", "tests/golden/**", "tests/integration/**"],
      "dependsOn": ["S0"], "planSection": "5.S4" },
    { "id": "S5", "title": "E2E m7-daily spec, grid page-object extensions, update older specs", "agent": "test-engineer",
      "owns": ["e2e/**"],
      "dependsOn": ["S2", "S3", "S4"], "planSection": "5.S5" }
  ],
  "e2e": ["e2e/m7-daily.spec.ts"] }
```

---

## 5. Step-by-step

### 5.S0 — Contracts (backend-engineer · owns: see §4 S0)

Runs alone and ends at **G0** (`pnpm check` green). M7 has **no schema change** and **no new dependency** (M7-D21): nothing is installed and no migration is generated. Nothing here implements behaviour except the zod schemas, the error class, i18n, the registry entries, the seed builder and the test helpers.

**S0.1 Preflight + M6 name map.**
- `git status` clean on tag `m6`; `pnpm db:up`; `pnpm check` green; `pnpm db:generate` → "No schema changes, nothing to migrate".
- M6's plan (`plan/m06-weekly-grid.md`, reviewed) is the **source of truth** for every name below (M7-D28). Confirm the real exports:
  ```bash
  grep -n "^export" src/domain/allocation.ts src/domain/units.ts src/domain/types.ts src/lib/contracts/grid.ts src/lib/schemas/allocations.ts \
    src/lib/schemas/grid.ts src/server/services/allocations.ts src/server/services/grid.ts src/server/repo/allocations.ts \
    src/lib/grid/*.ts src/components/grid/*.tsx src/components/common/StatusGlyph.tsx tests/helpers/*.ts e2e/pages/grid.ts e2e/fixtures.ts
  grep -rn "DAY_WEEK\|dayWeek\|skippedDayWeek" src/ tests/ e2e/ --include=*.ts --include=*.tsx
  ```
- Expected map (from m06; **when the real code differs, use the real name, never rename an M6 export, and list the difference in the S0 report**):

  | Name(s) M7 uses | M6 location (m06 step) |
  |---|---|
  | `Days7`, `DayCtx`, `WeekPlan`, `WeekChange`, `PlanWeekResult`, `OnDayWeekChoice`, `DayWarning(Code)`, `StepResult`, `distribute`, `spreadWeek`, `clampAndSpill`, `planWeek` (M6 subset), `weekPlanTotal` | `src/domain/allocation.ts` (S1.3/S1.4) |
  | `parseCellInput(raw, { unit, capCd, maxCd })`, `ParsedCell`, `fullCapacityCd`, `halfCapacityCd`, `formatCd`, `validateCellCd` | `src/domain/units.ts` (S1.1) |
  | `PeriodKey`, `LoadPair`, `LoadView`, `CellUnit`, `Granularity` | `src/domain/types.ts` (S0.2) |
  | `GridZoom`, `GridPeriod`, `AssigneeCell`, `WeekState`, `GridPerson`, `GridTaskRow` (`completedWeek`, `blockers`), `GridAssigneeRow`, `GridRow`, `GridResponse`, `AllocationChange`/`Change`, `OnDayWeekConflict`, `SaveAllocationsItem`, `SaveAllocationsInput`, `SaveItemResult`, `SaveWarningCode`, `SaveWarning`, `SaveAllocationsOk`, `VersionConflictPayload { current }`, `SaveValidationReason`, `SaveValidationIssue` | `src/lib/contracts/grid.ts` (S0.4) |
  | `zChange`, `saveAllocationsSchema` (DAY > 100 → `th.grid.errors.maxDay` already), `gridQuerySchema` (optional `from`/`to`), `GridQuery` | `src/lib/schemas/allocations.ts`, `src/lib/schemas/grid.ts` (S0.5) |
  | `ChunkParams`, `buildChunk`, `assembleGrid`, `aggregateTaskTotals` | `src/server/services/grid.ts` (S2.2) |
  | `ALLOCATION_AUDIT_ENTITY`, `save`, `planRange`, `lockAssignments`, `authorizeItems`, `assertVersions(tx, items, locked, today)`, `LockedSet`, `groupByWeek`, `auditItems`, `resultsFor`, `toSaveWarnings`, `loadWeekCtx` (replaced by M7, M7-D25) | `src/server/services/allocations.ts` (S2.3–S2.6) |
  | `AllocRow`, `WeekRange`, `listForProject`, `listForWeeks`, `deleteWeek`, `insertWeekPlan`, `plansFromRows`, `loadByUserWeek`; `repo.assignments.bumpVersions`, `repo.assignments.listActiveForProject` (+`version`), `repo.tasks.listLiveWithBlockerCounts` | `src/server/repo/allocations.ts`, `repo/task-assignments.ts` (S2.1, M6-D36) |
  | `WEEK_W`, `HEADER_ROWS`, `FOOTER_ROWS`, `ColKind`, `GridColumn`, `buildColumns`, `columnIndexOfPeriod`, `chunksForRange`, `initialScrollIndex`, `timelineWeeks` | `src/lib/grid/columns.ts` (S3.1) |
  | `gridChunkUrl`, `fetchGridChunk` (via `getJson`), `GridModel` (incl. merged `periods`), `mergeChunks` | `src/lib/grid/fetch.ts`, `merge.ts` (S3.2) |
  | `RowKey`, `ViewRow`, `buildViewRows`, `Editability`, `cellEditability` | `src/lib/grid/rows.ts` (S3.3) |
  | `CellWrite`, `coalesce`, `toItems`, `knownVersion`/`rememberVersion`, `applyWritesOptimistically`, `applyServerResults`, `applyConflicts`, `useSaveAllocations` (`enqueue(writes, { onDayWeekConflict?, immediate? })`), `invalidateAfterGridSave` | `queue.ts`, `versions.ts`, `cache-ops.ts`, `useSaveAllocations.ts`, `save-invalidate.ts` (S3.6) |
  | `taskTotals`, `footerTotals`, `footerValue`, `rowTotalView`; footer components `Footer`, `FooterCell` | `src/lib/grid/aggregate.ts`, `src/components/grid/Footer.tsx`, `FooterCell.tsx` (S3.7) |
  | `GridKeyAction`, `gridKeyAction`, `asciiForCode`, `useGridKeyboard` | `keymap.ts`, `useGridKeyboard.ts` (S3.8) |
  | `PlanGrid` (props + optional `initialZoom?: GridZoom`), `VirtualGrid`, `GridToolbar`, `GridHeader`, `RowHeader`, `gridStore` | `src/components/grid/*` (S0.6, S3.9) |
  | `TargetCell`, `planTyped`, `planCapacityKey`, `planPaste`, `planFill`, `planShift` | `apply.ts`, `paste.ts`, `fill.ts`, `shift.ts` (S3.10–S3.13) |
  | `WeekSnapshot`, `snapshotOf(cell, taskAssignmentId, week)`, `snapshotFromState`, `snapshotToChanges`, `GridUndoEntry` | `src/lib/grid/undo.ts` (S3.14) |
  | `StatusGlyph` (`kind` union), `formatWeekHeader` | `src/components/common/StatusGlyph.tsx` (S0.12), `src/lib/format.ts` |
  | `makeAllocation`, `allocationRows`, `assignmentVersion`, world `'allocations'` (`w.users.coworker`, `w.tasks.pCoworker`, `w.assignments.pCoworker`, `w.assignments.qTaskCoworker`, `pChildAMember` DAY week 10-12), `outcomeOf` | `tests/helpers/**` (S0.11, M5 world) |
  | `GridPage` (`rowKeyOf`, `cell`, `total`, `footerLoad`, `typeInto`, `paste`, `waitSaved`, `toast`, `countServerActions`), `resetDb(fixture?, { syntheticGrid })`, `projectIdByName` | `e2e/pages/grid.ts`, `e2e/fixtures.ts` (S6.1, S0.13) |
  | absent → created by M7: `src/server/services/day-context.ts`, `repo.allocations.dayLoadsForProjects`, `src/lib/grid/{day,day-footer,expansion,kinds,br24,collapse,day-input,day-overlay}.ts`, `CellMenu.tsx`, `DayGroupHeader.tsx`, `ZoomToggle.tsx`, `Br24Dialog.tsx`, `src/domain/overload.ts` | S1–S3 |
- Done-check: the table is pasted into `PROGRESS.md › แผนของ milestone ปัจจุบัน` with every row confirmed or its real name noted.

**S0.2 DTO additions (`src/lib/contracts/grid.ts`, M6 file) — additive edits only; never redeclare an M6 type.**
```ts
// GridPeriod (M6): add the optional flag M6 announced
export interface GridPeriod { key: PeriodKey; kind: 'WEEK' | 'DAY'; weekStart: ISODate; date: ISODate
  expanded?: true }   // M7: an expanded week contributes its D: periods followed by its W: period with expanded: true (the narrow "รวม" column)
export type DayWarn = 'NON_WORKING' | 'TIME_OFF'
// AssigneeCell (M6) gains two optional fields; `derived` becomes true on D: cells of WEEK weeks (BR-20); D: cd may exceed 100 for derived values
//   fallback?: 'SCHEDULE' | 'WEEKDAYS'   // W: cells of WEEK weeks whose week capacity is 0 (BR-21a, M7-D9)
//   warn?: DayWarn[]                     // D: cells with cd > 0 on a cap-0 day / a time-off date (M7-D9, M7-D15)
// GridPerson.capacity / standard / otherProjects (M6, Partial<Record<PeriodKey, …>>) carry D: keys (M7-D19): every day of expanded weeks and of
//   weeks where this person has a DAY-resolution cell; zeros omitted; a missing key means 0. No type change.
export interface NeedsChoicePayload { week: ISODate; weeks: ISODate[]; pairs: { taskAssignmentId: string; week: ISODate }[] }  // M7-D3
// SaveWarningCode (M6): add 'ALLOCATED_ON_TIME_OFF' (M6's comment reserves it)
export type SaveWarningCode = 'WORK_ON_NON_WORKING_DAY' | 'WEEK_NO_CAPACITY' | 'SPILLED_OVER_DAY_LIMIT' | 'ALLOCATED_ON_TIME_OFF'
/** Server-internal row of repo.allocations.dayLoadsForProjects (M7-D27), consumed by src/lib/grid/day.ts#spreadDayLoads (M7, M9). */
export interface DayLoadRow { userId: string; weekStart: ISODate; granularity: 'WEEK' | 'DAY'; periodStart: ISODate; totalCd: Cd; committedCd: Cd }
```
`SaveValidationReason` is **not** edited here: M6 code still produces `'DAY_WEEK'` until S2/S3 remove it; the orchestrator deletes the member in §6 (M7-D28, G25). `GridZoom`, `OnDayWeekConflict`, `SaveAllocationsInput.onDayWeekConflict?` and `VersionConflictPayload { current }` already exist (M6). Done-check: `pnpm typecheck`.

**S0.3 Zod schemas.**
- `src/lib/schemas/allocations.ts` (M6) — **no change**: M6's `zChange` already rejects DAY `cd > 100` with `th.grid.errors.maxDay` and WEEK periods that are not Mondays; `onDayWeekConflict: z.enum(['SCALE', 'COLLAPSE']).optional()` exists. Add tests only (`src/lib/schemas/allocations.test.ts › M7`): DAY `cd 100` ok; DAY `cd 125` → issue at `items.0.changes.0.cd` with `th.grid.errors.maxDay`; `'SCALE'`/`'COLLAPSE'` ok; `'EXPAND'` → error (r5 C11).
- `src/lib/schemas/grid.ts` (M6 `gridQuerySchema`) — extend **additively**, keeping `from`/`to` optional (X65 default window, G21) and every M6 refinement:
  ```ts
  export const gridQuerySchema = z.object({
    from: zMonday.optional(), to: zMonday.optional(),                                   // M6, unchanged
    includeOthers: z.enum(['0', '1']).default('0').transform((v) => v === '1'),        // M6, unchanged
    expand: z.string().optional().transform((s) => (s ? s.split(',').filter(Boolean) : [])).pipe(z.array(zMonday).max(53)),   // M7
    zoom: z.enum(['week', 'day']).default('week'),                                     // M7 (lowercase URL, M7-D17)
  }).superRefine((q, ctx) => {
    /* M6's two badRange checks, unchanged */
    if (q.expand.length > 0 && (q.from === undefined || q.to === undefined))          // M7: expand needs an explicit window
      ctx.addIssue({ code: 'custom', message: th.grid.errors.badRange, path: ['expand'] })
    else if (q.from && q.to) for (const w of q.expand)
      if (compareISO(w, q.from) < 0 || compareISO(w, q.to) >= 0) ctx.addIssue({ code: 'custom', message: th.grid.errors.expandOutOfRange, path: ['expand'] })
  })
  ```
  Tests (`grid.test.ts › M7`; M6's cases stay): no params → `{ includeOthers: false, expand: [], zoom: 'week' }`; `from=2026-09-28&to=2026-11-23&expand=2026-09-28,2026-10-05` → `expand ['2026-09-28','2026-10-05']`; `expand=2026-09-29` → `weekNotMonday`; `expand=2026-12-07` in that window → `expandOutOfRange`; `expand=2026-09-28` without `from`/`to` → `badRange`; `zoom=DAY` → error (lowercase only); 54 expand entries → error.
- `src/lib/schemas/preferences.ts` (M1, extended by M6): add `{ key: 'grid.zoom', value: z.enum(['WEEK', 'DAY']) }` to `preferenceInput`, `'grid.zoom': z.enum(['WEEK', 'DAY']).catch('WEEK')` to `preferencesSchema` and `'grid.zoom': 'WEEK'` to `DEFAULT_PREFERENCES` (X59: first consumer; same three places as M6-D21). Tests: `{ 'grid.zoom': 'DAY' }` kept; `'MONTH'` → `'WEEK'`; `preferenceInput` `{ key: 'grid.zoom', value: 'DAY' }` parses.

**S0.4 `NEEDS_CHOICE` error (`src/server/errors.ts`, M1-D23).** M1's `AppError(code, message?, extra)` already spreads `extra` into the action result (`toActionError`) and M6-D25's client `ActionFailure.extra` exposes it, so only the code and the class are new:
```ts
// errors.ts (M1)
export type ErrorCode = /* M1…M6 codes */ | 'NEEDS_CHOICE'
export const ERROR_STATUS = { /* … */ NEEDS_CHOICE: 409 }
export class NeedsChoiceError extends AppError {                 // 409 (PLAN §3.4.1); not a ConflictError (its code union is closed)
  constructor(readonly payload: NeedsChoicePayload) { super('NEEDS_CHOICE', th.errors.NEEDS_CHOICE, { ...payload }) }
}
```
M6's `ValidationError(fieldErrors, message?, extra?)` already carries `issues` (m06 S2.4). Test first in `src/server/errors.test.ts`: `toActionError(new NeedsChoiceError({ week: '2026-09-21', weeks: ['2026-09-21','2026-09-28'], pairs: [p] }))` → `{ ok: false, code: 'NEEDS_CHOICE', message: th.errors.NEEDS_CHOICE, week: '2026-09-21', weeks: [...], pairs: [p] }`; `ERROR_STATUS.NEEDS_CHOICE === 409`. `tests/helpers/outcome.ts#outcomeOf` maps `NEEDS_CHOICE` → `'409'` (S0.9). No change to `action.ts`/`route.ts`.

**S0.5 Action wiring.** `src/server/actions/allocations.ts` (M6) is unchanged: same schema, same `withDeadlockRetry(db.transaction(… services.allocations.save …))`; no new action (M7-D2). Done-check: `pnpm typecheck`.

**S0.6 Shortcut registry (`src/lib/shortcuts.ts`).** Scope `'grid'` exists (M6). Add `KeyToken`s `'ArrowDown' | 'ArrowUp' | 'F10'` (M8 reuses `'F10'`) and append:
```ts
{ id: 'grid.expandWeek', scope: 'grid', combos: [['Mod', 'ArrowDown']], label: th.shortcuts.items.gridExpandWeek },
{ id: 'grid.collapseWeek', scope: 'grid', combos: [['Mod', 'ArrowUp']], label: th.shortcuts.items.gridCollapseWeek },
{ id: 'grid.cellMenu', scope: 'grid', combos: [['Shift', 'F10']], label: th.shortcuts.items.gridCellMenu },
```
`src/lib/shortcuts.test.ts` keeps passing (ids unique, labels non-empty).

**S0.7 `addDayExample` (`scripts/lib/fixtures.ts`, M7-D16).**
```ts
/** SPEC Appendix A.2 "Task หลายคน + รายวัน". Not in golden-fixtures.json, hence constants (M7-D16).
 *  Requires seedGolden(db) at M6 level. Idempotent (no-op when the task exists). Audit actor = null (X59).
 *  A builder with fixed A.2 dates: it takes no `today` (X90 covers services; M11 composes it as-is in seed:demo, before addMilestones). */
export const DAY_EXAMPLE = { project: 'Mobile App Revamp', task: 'Kickoff workshop', assignees: ['Jack', 'Mint'] as const, day: '2026-09-07', cd: 50 } as const
export async function addDayExample(db: DbOrTx): Promise<{ taskId: string; assignmentIds: Record<'Jack' | 'Mint', string> }>
```
Body (plain Drizzle inside the caller's transaction): find the project by name and users by nickname (throw if missing); `position = generateKeyBetween(<last live root position of Mobile>, null)`; insert the task (depth 0, `created_by` = golden Manager, `status_id` = Mobile's default status per BR-81 / X70 — `tasks.status_id` is NOT NULL since SPEC v3.1); insert two assignments (version 1); insert two allocations `{ granularity: 'DAY', periodStart: '2026-09-07', weekStart: weekStart('2026-09-07'), personDays: cdToNumeric(50) }` — the assignments are new rows of this transaction, so they are already locked; write audit rows with the existing builders, `actor null`: M3's task-create row for the task and one row per assignment with `entity: ALLOCATION_AUDIT_ENTITY`, `summary: th.audit.allocationsSeeded(1)` (M6-D23 pattern). Test first `scripts/lib/fixtures.int.test.ts › addDayExample`:
- after `seedGolden(db)` + `addDayExample(db)`: Mobile has 3 live root tasks, the last is "Kickoff workshop"; 2 active assignments; exactly 2 DAY rows (`person_days = '0.50'`, `week_start = '2026-09-07'`), no WEEK row for that task;
- totals over `[2026-08-31, 2027-01-04)`: all projects **19 600 / 11 725** cd (r8 §6.10), Mobile **5 975**, Jack week 2026-09-07 = **300**, Mint week 2026-09-07 = **50**;
- calling it twice leaves 2 rows.

**S0.8 i18n (`src/i18n/th.ts`).** Add (final strings; functions for parameters, PLAN §3.7). Keep every M6 key and **reuse** M6's where they exist: `grid.toolbar.zoom` ('มุมมอง') / `grid.toolbar.zoomWeek` ('สัปดาห์'), `grid.errors.maxDay` ('ไม่เกิน 1 วันต่อวัน'), `grid.errors.weekNotMonday`/`badRange`/`invalidBatch`, `grid.header.holiday(names)`, `grid.toast.warning.*`, `shortcuts.scopes.grid`. Nest under the existing objects:
```ts
grid: { /* M6 keys … */
  toolbar: { /* M6 … */ zoomDay: 'วัน' },
  glyph: { /* M6 … */ over: 'ล้น', risk: 'เสี่ยงล้น' },
  toast: { /* M6 … */ warning: { /* M6 three codes … */ ALLOCATED_ON_TIME_OFF: 'มีงานวางไว้ในวันที่ลา' } },
  day: {
    expandWeek: (label: string) => `ขยายสัปดาห์ ${label} เป็นรายวัน`,
    collapseWeekView: (label: string) => `ยุบสัปดาห์ ${label}`,
    totalColumn: 'รวม',
    totalColumnLabel: (label: string) => `ยอดรวมสัปดาห์ ${label}`,
    derivedDescription: 'ค่ากระจายจากแผนรายสัปดาห์',
    derivedTooltip: (value: string, week: string) => `ค่ากระจายจากแผนรายสัปดาห์ (${week} วัน): ${value} วัน`,
    dayTooltip: (value: string) => `${value} วัน`,
    cellLabel: (weekday: string, date: string, value: string) => `${weekday} ${date}: ${value}`,
    collapseToWeek: '↕ รวมเป็นรายสัปดาห์',
    collapseToWeekDisabled: 'สัปดาห์นี้เป็นแผนรายสัปดาห์อยู่แล้ว',
    collapsedToast: 'รวมเป็นรายสัปดาห์แล้ว',
    collapsedManyToast: (n: number) => `รวมเป็นรายสัปดาห์แล้ว ${n} สัปดาห์`,
    splitClampedToast: 'แยกเป็นรายวันแล้ว — ปรับค่าที่เกิน 1 วัน/วัน',
    unrepresentable: 'ใส่ค่านี้ไม่ได้ — ทุกวันในสัปดาห์เต็ม 1 วันแล้ว',
    mixedKinds: 'วาง/เติม/เลื่อนได้เฉพาะคอลัมน์ชนิดเดียวกัน',
    shiftWithinWeek: 'เลื่อนค่ารายวันได้ภายในสัปดาห์เดียวกันเท่านั้น',
    noCapacityDay: 'ไม่มี capacity วันนี้',
    completedWeekCounts: 'งานเสร็จแล้ว — สัปดาห์ที่ติ๊กเสร็จยังนับภาระครบทั้งสัปดาห์',
    cellMenu: 'เมนูเซลล์',
    loading: 'กำลังโหลดรายวัน…',
    undo: { dayEdit: 'แก้แผนรายวัน', scale: 'ปรับยอดตามสัดส่วนเดิม', collapse: 'รวมเป็นรายสัปดาห์' },
  },
  warn: {
    nonWorkingDay: 'วางงานในวันที่ไม่ทำงาน',
    weekNoCapacity: 'สัปดาห์นี้ไม่มี capacity — กระจายตามตารางงาน',
    allocatedOnTimeOff: (days: string) => `มีงาน ${days} วันวางไว้ในวันที่ลา`,
  },
  br24: {
    title: (n: number) => (n === 1 ? 'สัปดาห์นี้มีแผนรายวัน' : `${n} สัปดาห์มีแผนรายวัน`),
    breakdown: (parts: string) => `แผนเดิม: ${parts}`,                       // "จ 1.0 · อ 1.0 · พ 0.5"
    change: (from: string, to: string) => `กำลังเปลี่ยนยอดรวมจาก ${from} → ${to} วัน`,
    pairLine: (person: string, week: string, from: string, to: string) => `${person} · สัปดาห์ ${week}: ${from} → ${to} วัน`,
    more: (k: number) => `และอีก ${k} สัปดาห์`,
    scale: 'ปรับตามสัดส่วนเดิม',
    scaleHint: 'คงสัดส่วนรายวันเดิม ปัดเศษให้ยอดรวมตรง',
    scalePreview: (parts: string) => `ผลลัพธ์: ${parts}`,
    collapse: 'เปลี่ยนเป็นรายสัปดาห์',
    collapseHint: 'ทิ้งรายละเอียดรายวัน',
    collapsePreview: (total: string) => `ผลลัพธ์: ${total} วันทั้งสัปดาห์`,
    cancel: 'ยกเลิก',
  },
  errors: { /* M6 … */ expandOutOfRange: 'สัปดาห์ที่ขยายอยู่นอกช่วง',
    mixedWeekAndDay: 'แก้ยอดสัปดาห์และรายวันของสัปดาห์เดียวกันพร้อมกันไม่ได้' },
},
overload: {
  level: { OK: 'ปกติ', RISK: 'เสี่ยงล้น', OVER: 'ล้น' },
  glyph: { RISK: '⚠', OVER: '🔴' },
  dayStatus: (level: string, load: string, cap: string) => `${level}: ภาระ ${load} / capacity ${cap} วัน`,
  peopleOver: (names: string) => `คนที่ล้น: ${names}`,
},
errors: { /* … */ NEEDS_CHOICE: 'สัปดาห์นี้มีแผนรายวัน — เลือกวิธีปรับยอดรวม' },
shortcuts: { /* … */
  keys: { /* … */ ArrowDown: '↓', ArrowUp: '↑', F10: 'F10' },
  items: { /* … */ gridExpandWeek: 'ขยายสัปดาห์เป็นรายวัน', gridCollapseWeek: 'ยุบสัปดาห์', gridCellMenu: 'เมนูเซลล์ (รวมเป็นรายสัปดาห์)' } },
```
The expanded week's group label uses `formatThaiDate(ws, 'medium')` ("19 ต.ค. 2569") directly (no i18n key needed). M6's `grid.errors.dayWeek` and `grid.toast.dayWeekReadOnly` stay until S2/S3 remove their last uses; the orchestrator deletes them in §6 (the string "สัปดาห์นี้มีแผนรายวัน" survives as `th.grid.br24.title(1)`).

**S0.9 Test helpers.**
- `tests/helpers/factories.ts` (plain Drizzle, X59): add only
  ```ts
  /** DAY rows of one week (all dates in the same Monday-week; week_start = weekStart(date)); zero values skipped. */
  export async function makeDayAllocations(o: { assignment: { id: string }; days: Record<ISODate, Cd> }): Promise<void>
  ```
  M6's `makeAllocation`, `allocationRows(assignmentId, week)` and `assignmentVersion(assignmentId)` are reused as they are.
- `tests/helpers/outcome.ts`: `outcomeOf` maps `NEEDS_CHOICE` → `'409'` (it already maps `VERSION_CONFLICT` → `'409'`).
- `tests/helpers/world.ts`: `createWorld({ with: ['dayAllocations'] })` implies M6's `'allocations'` (→ `'tasks'` + `'timeOff'`, M5's `w.users.coworker` = MEMBER of P and Q). M6's world uses no November 2026 week on `pLeafLead` or `aTaskMember` (m06 S0.11), so the rows below never collide. Adds (G17 — **no new users or tasks**):

  | Key | Data |
  |---|---|
  | `w.dayWeeks.pWeek = '2026-11-02'` | WEEK 250 on `w.assignments.pLeafLead` (P) |
  | `w.dayWeeks.pDay = '2026-11-09'` | DAY `{11-09: 100, 11-10: 100, 11-11: 50}` on `w.assignments.pLeafLead` |
  | `w.dayWeeks.aDay = '2026-11-09'` | DAY `{11-09: 50}` on `w.assignments.aTaskMember` (archived A) |
  | `w.dayWeeks.qDay = '2026-11-09'` | DAY `{11-10: 75}` added to M6's **`w.assignments.qTaskCoworker`** (`coworker` on Q's `qTask`; M6 gave it WEEK 2026-10-05 = 300) — feeds `people[coworker].otherProjects['D:2026-11-10']` in P's grid without exposing Q. `coworker` is a P footer person through M6's `w.assignments.pCoworker` (`w.tasks.pCoworker` "งานร่วม P-ลับ03", WEEK 2026-10-05 = 100) |

  Smoke test `tests/helpers/world.int.test.ts › with dayAllocations`: the rows via `allocationRows` (e.g. `allocationRows(qTaskCoworker.id, '2026-11-09')` = `[{ DAY, '2026-11-10', 75 }]`, `allocationRows(qTaskCoworker.id, '2026-10-05')` still M6's WEEK 300); every version still 1.
- `e2e/fixtures.ts` (M6): extend `resetDb(fixture?, opts?: { syntheticGrid?: boolean; dayExample?: boolean })` — `addDayExample(tx)` after `seedGolden`/`applyFixture` (and M6's synthetic builder) in the same transaction. `projectIdByName` exists (M6).

**S0.10 `StatusGlyph` kinds (`src/components/common/StatusGlyph.tsx`, M6 S0.12 announced `'over' | 'risk'`).** Extend `kind` with `'over'` (🔴) and `'risk'` (⚠); default hidden text `th.grid.glyph.over` / `th.grid.glyph.risk`; callers pass `label` for the full status text (`th.overload.dayStatus(...)`). Test `StatusGlyph.test.tsx`: the two new kinds render their glyph `aria-hidden` and the hidden text; M6's cases unchanged.

**S0.11 G0.** `pnpm check` green; `pnpm db:generate` → "No schema changes"; report the S0.1 name map (with every real name that differs from m06), the files touched and any M6 name that differs from this plan.

### 5.S1 — Domain day rules + overload + shared day model (domain-engineer · owns `src/domain/allocation*.ts`, `src/domain/overload*.ts`, `src/lib/grid/day.ts`, `src/lib/grid/day.test.ts`)

Test-first for every function (CLAUDE.md, PLAN §4.1); integers only (cd), ISO strings only, no `Date`; `src/domain/**` imports only `src/domain/**`. New tests go to `src/domain/allocation.day.test.ts`, `src/domain/allocation.day.property.test.ts` and `src/domain/overload.test.ts`; in M6's `allocation.test.ts` only the two `planWeek` rows that encode M6-only behaviour change (S1.8). Coverage gate `src/domain/**` ≥ 95 %.

**S1.1 Inventory + types.** Read M6's `allocation.ts` (m06 S1.3/S1.4). The types `Days7`, `DayCtx`, `WeekPlan`, `WeekChange`, `PlanWeekResult`, `DayWarningCode` (already incl. `ALLOCATED_ON_TIME_OFF`), `DayWarning`, `StepResult`, `OnDayWeekChoice` and the functions `distribute`, `spreadWeek`, `clampAndSpill`, `planWeek`, `weekPlanTotal` **exist — reuse them, never redeclare**. The only type change is G25: remove `'DAY_WEEK'` from `PlanWeekResult`'s `invalid` reasons once `planWeek` no longer returns it (S1.8):
```ts
export type PlanWeekResult =                                                  // M6 type, one member removed
  | { kind: 'ok'; next: WeekPlan; changed: boolean; warnings: DayWarning[] }
  | { kind: 'needsChoice' }
  | { kind: 'invalid'; reason: 'MAX' | 'NEGATIVE' | 'MIXED_WEEK_AND_DAY' | 'UNREPRESENTABLE'; dayIndex?: number }
```
M6's `services/allocations.ts` (S2 rewrites it) still compiles: it only reads `r.reason`.

**S1.2 `spreadWeek` (BR-21, BR-21a, M7-D9) — exists (M6 S1.3), no code change.** Weights = `dayCaps`; Σ = 0 → `schedule` (`'SCHEDULE'`); Σ = 0 → Mon–Fri equal (`'WEEKDAYS'`); never clamps (display values). M6's `allocation.test.ts` already pins most rows below (m06 copied this table); add to `allocation.day.test.ts › spreadWeek` only the rows absent there (expected: F2 Peter/Ivy 63…, F2 Cindy 94…, F4 Cindy). Caps written Mon..Sun:

| weekCd | dayCaps | schedule | days | fallback |
|---|---|---|---|---|
| 250 | 100,100,100,100,100,0,0 | same | 50,50,50,50,50,0,0 (AC-804) | null |
| 250 | 100,100,100,100,0,0,0 | 100×5,0,0 | 63,63,62,62,0,0,0 (F2 Peter/Ivy) | null |
| 500 | 100,100,100,100,0,0,0 | 100×5,0,0 | 125,125,125,125,0,0,0 (F2 Jack/Mint) | null |
| 375 | 100,100,100,100,0,0,0 | 100×5,0,0 | 94,94,94,93,0,0,0 (F2 Cindy) | null |
| 500 | 0,0,100,100,100,0,0 | 100×5,0,0 | 0,0,167,167,166,0,0 (F3 Peter) | null |
| 250 | 0,0,0,100,100,0,0 | 100×5,0,0 | 0,0,0,125,125,0,0 (F4 Cindy) | null |
| 250 | 0×7 | 100×5,0,0 | 50,50,50,50,50,0,0 | 'SCHEDULE' |
| 250 | 0×7 | 0×7 | 50,50,50,50,50,0,0 | 'WEEKDAYS' |
| 250 | 0×7 | 100,0,100,0,100,0,0 | 84,0,83,0,83,0,0 | 'SCHEDULE' |
| 0 | any | any | 0×7 | null |

**S1.3 `clampAndSpill(values, fixed, ctx, hardCap = 100): StepResult` (X65, M7-D7) — exists (M6 S1.3), no code change.** X65 tiers: (1) `dayCaps[i] > 0`, (2) `schedule[i] > 0 && dayCaps[i] === 0`, (3) the rest; earliest index first within a tier; fixed days never change; `ok: false` when excess remains; `spilled = true` iff any value changed; warnings are added by callers (S1.4). These cases are already in M6's tests (same values); `allocation.day.test.ts` re-asserts them only through `materializeWithEdits`/`scaleDays` below:
- `[160,160,80,0,0,0,0]`, none fixed, caps Mon–Fri 100 → `[100,100,100,100,0,0,0]`, spilled.
- `[100,125,125,125,0,0,0]`, fixed Mon, caps `[100,100,100,100,0,0,0]`, schedule Mon–Fri → `[100,100,100,100,75,0,0]` (F2 Jack; Fri is tier 2).
- `[700,0,0,0,0,0,0]`, caps Mon–Fri → `[100,100,100,100,100,100,100]` (Sat, Sun tier 3).
- `[700,0,0,0,0,0,0]` with Tue fixed (value 0): Mon clamps to 100, excess 600, the five other non-fixed days hold at most 500 → `{ ok: false, reason: 'UNREPRESENTABLE' }`.
- Already ≤ 100 → unchanged, `spilled: false`.

**S1.4 Warnings helper `dayWarnings(days, ctx, spilled): DayWarning[]`.** `WORK_ON_NON_WORKING_DAY` for every `i` with `days[i] > 0 && dayCaps[i] === 0`; `ALLOCATED_ON_TIME_OFF` for `days[i] > 0 && timeOff[i]`; `SPILLED_OVER_DAY_LIMIT` once when `spilled`. Test: F2 Jack result → `[SPILLED_OVER_DAY_LIMIT, WORK_ON_NON_WORKING_DAY@4]`; half-day leave day (cap 50, timeOff true) with 100 → `ALLOCATED_ON_TIME_OFF@i` only.

**S1.5 `materializeWithEdits(weekCd, edits: ReadonlyMap<number, Cd>, ctx): StepResult` (BR-22, M7-D8).** `derived = spreadWeek(weekCd, ctx).days`; set edited indexes to their values (fixed); `clampAndSpill(values, fixed, ctx)`; append `dayWarnings`. Tests:

| weekCd | edits | ctx | result days | total |
|---|---|---|---|---|
| 250 | Wed→100 | Mon–Fri 100 | 50,50,100,50,50,0,0 (AC-804) | 300 |
| 250 | Wed→50 | Mon–Fri 100 | 50,50,50,50,50,0,0 (still materialised, E4) | 250 |
| 250 | Mon→0 | Mon–Fri 100 | 0,50,50,50,50,0,0 | 200 |
| 500 | Mon→100 | F2 (Fri holiday) | 100,100,100,100,75,0,0 + spilled + NON_WORKING@4 | 475 |
| 0 | Wed→100 | Mon–Fri 100 | 0,0,100,0,0,0,0 | 100 |
| 250 | Sat→50 | Mon–Fri 100, Sat cap 0 | 50,50,50,50,50,50,0 + NON_WORKING@5 | 300 |
| 500 | Wed→50 | F3 (Mon/Tue leave) | 100,33,50,100,100,0,0 + spilled + NON_WORKING@0,1 + TIME_OFF@0,1 | 383 |
| 700 | Tue→0 | caps Mon 100 only, schedule Mon only | `UNREPRESENTABLE` | — |

(F3 row: derived `[0,0,167,167,166]`, Wed fixed 50, Thu/Fri clamp → excess 133, tier 1 has no room, tier 2 = Mon (100) then Tue (33).)

**S1.6 `scaleDays(days, newTotal, ctx): StepResult` (BR-24 SCALE).** `distribute(newTotal, days)` then `clampAndSpill(…, none fixed)` + warnings. Tests:
- `[50,50,100,50,50,0,0]` → 200 → `[34,33,67,33,33,0,0]` (r8 §4.7).
- `[100,50,50,50,50,0,0]` → 200 → `[67,34,33,33,33,0,0]`.
- `[50,50,100,50,50,0,0]` → 400, caps Mon–Fri → distribute `[67,67,133,67,66]` → `[100,67,100,67,66,0,0]`, spilled.
- `[100,100,50,0,0,0,0]` → 400, caps Mon–Fri → `[100,100,100,100,0,0,0]`, spilled.
- `[100,0,0,0,0,0,0]` → 700, caps Mon–Fri → `[100,100,100,100,100,100,100]` + NON_WORKING@5,6.

**S1.7 `collapseDays(days): Cd` (BR-23)** = Σ days. Tests: `[50,50,100,50,50,0,0]` → 300; `[100×7]` → 700.

**S1.8 `planWeek(current, changes, ctx, choice?: OnDayWeekChoice): PlanWeekResult` — complete M6's per-(item, week) table (r6b §4.2 + M7-D2/D5/D6).** Same function, same signature (M6 S1.4); M7 replaces the M6-only branches. Normalise every result: a DAY plan whose days are all 0 → `{ resolution: null }`; WEEK 0 → null. `changed` = next differs from current (deep). Rules, in order:
1. Both granularities present → `invalid MIXED_WEEK_AND_DAY`. Any `cd < 0` → `NEGATIVE`; WEEK `cd > 700` or DAY `cd > 100` → `MAX` (+`dayIndex`). Empty `changes` → ok, unchanged.
2. WEEK changes (last one wins), `x = cd ?? 0`:
   - current null/WEEK → next = x > 0 ? WEEK x : null; warnings `WEEK_NO_CAPACITY` when x > 0 and Σ dayCaps = 0 (M6, unchanged).
   - current DAY, in this order: x = 0 → null (no choice needed, M7-D5); **`'COLLAPSE'` → WEEK x (also when x = Σ days: that is BR-23, M7-D2)**; x = Σ days → ok, unchanged (M7-D5); `'SCALE'` → `scaleDays(days, x, ctx)` (failure → `invalid UNREPRESENTABLE`) — **M7, replaces M6's `needsChoice` for SCALE**; no choice → `needsChoice`.
3. DAY changes (per `dayIndex`, last wins; null → 0):
   - current DAY or null → set those days (others kept / 0; each already ≤ 100); warnings via `dayWarnings(days, ctx, false)` (M6 + warnings).
   - current WEEK → `materializeWithEdits(current.weekCd, edits, ctx)` (failure → `invalid UNREPRESENTABLE`) — **M7 BR-22, replaces M6's `invalid DAY_WEEK`**; with all 7 indexes present the result equals M6's snapshot replay (every day fixed).
Update in M6's `src/domain/allocation.test.ts › planWeek` exactly two rows: `DAY [50,50,100,50,50,0,0] | WEEK 400 | SCALE` → `ok DAY [100,67,100,67,66,0,0] + SPILLED` (was `needsChoice (M6)`); `WEEK 250 | DAY Wed 100 | —` → `ok DAY [50,50,100,50,50,0,0]` (was `invalid DAY_WEEK`). Every other M6 row stays. New tests (`allocation.day.test.ts › planWeek`), ctx = Mon–Fri 100 unless noted:

| current | changes | choice | expected |
|---|---|---|---|
| null | WEEK 250 | — | ok WEEK 250 |
| WEEK 250 | WEEK null | — | ok null |
| WEEK 250 | DAY Wed 100 | — | ok DAY [50,50,100,50,50,0,0] |
| DAY [50,50,100,50,50,0,0] | WEEK 400 | — | needsChoice |
| same | WEEK 400 | SCALE | ok DAY [100,67,100,67,66,0,0] + SPILLED |
| same | WEEK 400 | COLLAPSE | ok WEEK 400 |
| same | WEEK 300 | COLLAPSE | ok WEEK 300, `changed: true` (BR-23; COLLAPSE is checked before the Σ no-op, M7-D2) |
| same | WEEK 300 | SCALE | ok, `changed: false` (= Σ days) |
| same | WEEK 300 | — | ok, `changed: false` (M7-D5) |
| same | WEEK null | — | ok null, no choice (M7-D5) |
| DAY [100,100,50,0,0,0,0] | DAY Mon..Sun = 100,100,50,null,null,null,null | — | ok DAY [100,100,50,0,0,0,0], unchanged (snapshot replay) |
| WEEK 250 | DAY Mon..Sun = 100,100,50,null×4 | — | ok DAY [100,100,50,0,0,0,0] (exact undo after COLLAPSE, r5 §10.4: sum 250, not 350) |
| DAY [50,0,0,0,0,0,0] | DAY Mon null | — | ok null (E8) |
| DAY … | DAY Mon 125 | — | invalid MAX dayIndex 0 |
| WEEK 250 | WEEK 725 | — | invalid MAX |
| WEEK 250 | WEEK 300 + DAY Mon 50 | — | invalid MIXED_WEEK_AND_DAY |
| WEEK 0 cap week (caps 0×7) | WEEK 250 | — | ok WEEK 250 + WEEK_NO_CAPACITY |

**S1.9 Property tests (`allocation.day.property.test.ts`, `fc.assert(fc.property(...))`, fast-check 4.10.2, r4 §37).** Arbitraries: `cd = fc.integer({ min: 0, max: 700 })`, `day = fc.integer({ min: 0, max: 100 })`, caps/schedule = `fc.array(fc.constantFrom(0, 25, 50, 75, 100), { minLength: 7, maxLength: 7 })` with `dayCaps[i] ≤ schedule[i]`, edits = `fc.dictionary` over indexes 0–6. Properties:
- P1 `Σ distribute(t, w) === t` whenever Σw > 0 (keep M6's; add weights from the caps arbitrary).
- P2 expand → collapse identity: `collapseDays(clampAndSpill(spreadWeek(W).days, none).days) === W` for every W ≤ 700.
- P3 displayed day sum = week total for every `WeekPlan` (`displayDays` below): WEEK → Σ = weekCd; DAY → Σ = Σ days; null → 0.
- P4 every `ok` result of `materializeWithEdits`, `scaleDays`, `planWeek` has all days in `[0, 100]`.
- P5 BR-22 total formula: when ok, `Σ result = W − Σ derived[edited] + Σ x`.
- P6 SCALE: when ok, `Σ result = newTotal`.
- P7 snapshot round trip: for any current plan and any target DAY snapshot `s` (days ≤ 100), `planWeek(current, sevenDayChanges(s), ctx)` → `s` (or null when Σ s = 0); for a WEEK snapshot `planWeek(current, [WEEK s], ctx, 'COLLAPSE')` → WEEK s.
- P8 `planWeek` never returns `needsChoice` when `choice` is given or the current plan is not DAY.
Add `displayDays(plan, ctx): { days: Cd[]; derived: boolean; fallback }` (WEEK → `spreadWeek`, derived true; DAY → days, false; null → zeros) and `weekPlanTotal(plan)` with unit tests.

**S1.10 `src/domain/overload.ts` (X06) — test first in `overload.test.ts`.**
```ts
export type OverloadLevel = 'OK' | 'RISK' | 'OVER'
export function overloadLevel(load: { total: Cd; committed: Cd }, capCd: Cd): OverloadLevel   // BR-40: committed > cap → OVER; total > cap → RISK; else OK
export type LoadTone = 'empty' | 'light' | 'full' | 'over' | 'noCapacity'
export function loadTone(loadCd: Cd, capCd: Cd): LoadTone
// cap = 0 → load > 0 ? 'over' : 'noCapacity'; load > cap → 'over'; 5·load ≥ 4·cap → 'full'; load > 0 → 'light'; else 'empty'
export function worstLevel(levels: Iterable<OverloadLevel>): OverloadLevel   // OVER > RISK > OK
```
Tests: `overloadLevel` — (100,100 | 100) OK (boundary); (101,101 | 100) OVER; (125,0 | 100) RISK (F4 Cindy day); (125,125 | 100) OVER (F2 Jack day); (100,100 | 50) OVER (half-day leave + 1.0 DAY, r5 M7-10); (167,167 | 100) OVER (F3); (0,0 | 0) OK; (50,0 | 0) RISK; (50,50 | 0) OVER; (625,500 | 400) OVER; (625,0 | 500) RISK. `loadTone` — (0,0) noCapacity; (50,0) over; (0,100) empty; (79,100) light; (80,100) full; (100,100) full; (101,100) over; (150,300) light; (240,300) full; (250,200) over. Properties: `overloadLevel` is OVER ⇔ committed > cap (given committed ≤ total); `loadTone(l, c) === 'over'` ⇔ (c > 0 ? l > c : l > 0); `worstLevel` is order-independent. No BR-41/excess here (M9).

**S1.11 Shared pure day model `src/lib/grid/day.ts` (used by `services/grid.ts` **and** the client; M7-D1, M7-D19).** May import `src/domain/**` and `src/lib/contracts/**` only.
```ts
export const wKey = (week: ISODate): PeriodKey => `W:${week}`
export const dKey = (date: ISODate): PeriodKey => `D:${date}`
/** Missing D: keys = 0. timeOff[i] = true when any of person.timeOff covers that date (AM/PM included). */
export function dayCtxFor(person: GridPerson | undefined, week: ISODate): DayCtx
export function weekPlanFromCell(cell: AssigneeCell | undefined, week: ISODate): WeekPlan      // DAY uses cell.days
export function weekPlanFromState(state: WeekState | undefined, week: ISODate): WeekPlan
export function weekStateFromPlan(plan: WeekPlan, week: ISODate): WeekState                 // { cd, resolution, days? }
/** W: cell for any week; fallback flag when WEEK cd > 0 and weekCapCd = 0 (weekStdCd > 0 ? 'SCHEDULE' : 'WEEKDAYS'). undefined for an empty week. */
export function weekCellFromPlan(plan: WeekPlan, week: ISODate, weekCapCd: Cd, weekStdCd: Cd): AssigneeCell | undefined
/** D: cells of one week: WEEK → spreadWeek values with derived: true; DAY → stored values, derived: false;
 *  warn NON_WORKING when cd > 0 && dayCaps[i] = 0, TIME_OFF when cd > 0 && timeOff[i]; zero days omitted. */
export function dayCellsFromPlan(plan: WeekPlan, ctx: DayCtx): Record<PeriodKey, AssigneeCell>
/** Mon–Fri always; Sat/Sun when some grid person is scheduled that weekday or a DAY row exists on that date (M7-D10). */
export function visibleDayDates(week: ISODate, opts: { scheduledWeekdays: ReadonlySet<Weekday>; dayRowDates: ReadonlySet<ISODate> }): ISODate[]
/** M7-D27 (reused by M9's person grid masked row): rows of repo.allocations.dayLoadsForProjects → D: LoadPairs per user.
 *  DAY rows count as stored; WEEK rows: spreadWeek(committedCd) + spreadWeek(totalCd − committedCd), summed per day; zeros omitted. */
export function spreadDayLoads(rows: readonly DayLoadRow[], ctxOf: (userId: string, week: ISODate) => DayCtx):
  Map<string, Partial<Record<PeriodKey, LoadPair>>>
```
Tests first (`src/lib/grid/day.test.ts`): Ivy person (capacity `D:2026-09-28…D:2026-10-02` = 100) + W cell `{cd 250, WEEK}` → five D cells `{cd 50, derived: true}`; DAY cell `{cd 300, DAY, days: {…50,50,100,50,50}}` → solid cells, Wed 100; a person with time off 2026-10-05..06 and DAY rows Mon 100 → `warn: ['NON_WORKING','TIME_OFF']`; `weekCellFromPlan(WEEK 500, cap 0, std 500)` → `fallback: 'SCHEDULE'`; `visibleDayDates('2026-09-28', { scheduledWeekdays: {1..5}, dayRowDates: {} })` → 5 dates; with `dayRowDates {'2026-10-04'}` → 6 dates ending Sunday; with Saturday scheduled → includes `2026-10-03`; property: Σ `dayCellsFromPlan(plan).cd` = `weekPlanTotal(plan)`. `spreadDayLoads`: one WEEK row `{ total 250, committed 0 }` with Mon–Fri caps → `D:` × 5 `{ total: 50, committed: 0 }` (Cindy CRM 10-05, S2.3); WEEK `{ total 250, committed 125 }` + caps `[100,100,100,100,0,0,0]` → Σ total 250, Σ committed 125 and `committed ≤ total` on every day; a DAY row `{ 11-10, 75, 75 }` → `D:2026-11-10 { 75, 75 }`; property: per user and week Σ total over D: keys = Σ input totalCd, Σ committed likewise, and committed ≤ total per key.

**S1.12 Done-check.** `pnpm vitest run --project unit src/domain src/lib/grid/day.test.ts --coverage` (domain ≥ 95 %), `pnpm eslint src/domain src/lib/grid/day.ts`.

### 5.S2 — Backend: grid day periods + save per-week table (backend-engineer · owns `src/server/**`, `src/app/api/**`)

Starts after S1 (it imports `planWeek`, `spreadWeek`, `displayDays` and `src/lib/grid/day.ts`). Integration tests live next to the code (`src/server/**/*.int.test.ts`), are written **first** and stay red until their step lands (M7-D1). Rules for every step:
- The action stays M6's thin wrapper: `saveAllocations = action(saveAllocationsSchema, (input, { user }) => withDeadlockRetry(() => db.transaction((tx) => services.allocations.save(tx, user, input, serverToday()))))` — zod parse → lock + authz (inside `save`, before any allocation read) → service → audit (same tx) → **no `refresh()`** (PLAN §1.3; the grid is TanStack-driven).
- Every `allocations` query carries a `week_start` predicate: `week_start >= $from AND week_start < $to` for chunk reads, `week_start = ANY($weeks)` for the save (a bounded set of touched Mondays). Reviewers grep `src/server/repo/allocations.ts` for it.
- Loads are integer cd end to end; `numeric` ↔ cd only inside `repo/allocations.ts` (`numericToCd` / `cdToNumeric`, M1); dates are ISO strings (`addDays`, `weekStart`, `eachDay`, `isoWeekday` from `src/domain/dates.ts`). Services receive `today` and never read the clock (X56).
- Every response keeps M6's fields; **task rows keep `blockers: { open, total }`** (X76) and M7 only adds `D:` keys. Day-level work never reads or writes `tasks.status_id` (BR-80 untouched).

**S2.1 Inventory + repo (`src/server/repo/allocations.ts`).** Read M6's `services/allocations.ts`, `services/grid.ts`, `repo/allocations.ts` and their tests; list in the S2 report the M6 branches that produce `DAY_WEEK` (replaced in S2.4) and the M6 tests that assert it (flipped in S2.10). **Reuse M6's** `AllocRow`, `WeekRange`, `listForProject`, `listForWeeks` (`week_start = ANY($weeks)`), `deleteWeek` (always first), `insertWeekPlan` (WEEK row or non-zero DAY rows, `week_start` computed from `periodStart`), `plansFromRows` and `loadByUserWeek` unchanged — M6's `repo/allocations.int.test.ts` already covers their DAY round trip and the cross-year week (2027-01-01 → week 2026-12-28). Add one function (C39, M7-D27; M9 reuses it):
```ts
/** §6.5 filters exactly as loadByUserWeek (live assignment + task, project not deleted and not archived (BR-44), BR-50 per task,
 *  coalesce certainty), restricted to `week_start = ANY($weeks)`; grouped by (user_id, week_start, granularity, period_start).
 *  excludeProjectId → other projects of the grid people (X29); projectIds → only those projects (M9: hidden projects of a person). */
export async function dayLoadsForProjects(tx: DbOrTx, o: { userIds: readonly string[]; weeks: readonly ISODate[];
  excludeProjectId?: string; projectIds?: readonly string[] }): Promise<DayLoadRow[]>
```
SQL sums return integer cd (`(coalesce(sum(a.person_days), 0) * 100)::int`, committed with `filter (where coalesce(…) = 'CONFIRMED')`, PLAN §1.3); `weeks` empty → `[]` without a query. Tests first `src/server/repo/allocations.int.test.ts › dayLoadsForProjects` (world `dayAllocations`): `{ userIds: [coworker], weeks: ['2026-11-09'], excludeProjectId: P }` → `[{ userId: coworker, weekStart: '2026-11-09', granularity: 'DAY', periodStart: '2026-11-10', totalCd: 75, committedCd: 75 }]`; `{ projectIds: [Q] }` same row; `{ projectIds: [P] }` for `pLeafLead`'s user and week 11-09 → the three DAY rows; archived A excluded; a week outside `weeks` never returned; parity with `loadByUserWeek`: Σ per (user, week) of `dayLoadsForProjects` = `loadByUserWeek` for the same filters.

**S2.2 Grid periods for expanded weeks and day zoom (`src/server/services/grid.ts`, FR-802/803, M7-D10/D17).** `buildChunk(tx, user, ctx, p: ChunkParams, today)` and M6's `ChunkParams { from; to; expand; zoom: 'week' | 'day'; includeOthers }` are unchanged; M6's route hard-codes `expand: []`, `zoom: 'week'` — M7 forwards the parsed values instead (default window when `from`/`to` are absent stays M6's −4/+12 weeks; S0.3 forbids `expand` without a window), and `assembleGrid` echoes them in `window`. Periods (replaces M6's week-only `periods` line in `assembleGrid`):
```ts
const expandedWeeks = (p: ChunkParams, weeks: ISODate[]) => new Set(p.zoom === 'day' ? weeks : p.expand)   // zoom=day ignores expand
function buildPeriods(weeks: ISODate[], expanded: ReadonlySet<ISODate>,
                      vis: { scheduledWeekdays: ReadonlySet<Weekday>; dayRowDates: ReadonlySet<ISODate> }): GridPeriod[] {
  const out: GridPeriod[] = []
  for (const w of weeks) {
    if (!expanded.has(w)) { out.push({ key: wKey(w), kind: 'WEEK', weekStart: w, date: w }); continue }
    for (const d of visibleDayDates(w, vis)) out.push({ key: dKey(d), kind: 'DAY', weekStart: w, date: d })
    out.push({ key: wKey(w), kind: 'WEEK', weekStart: w, date: w, expanded: true })          // narrow "รวม" column
  }
  return out
}
```
`scheduledWeekdays` = union of the schedule weekdays (`loadCapacityInputs`, M5) of the grid's footer people (M6: assignees on live tasks of this project, deactivated included); `dayRowDates` = `period_start` of this project's DAY rows in expanded weeks (already loaded for the cells). The route `src/app/api/grid/project/[projectId]/route.ts` (M6) keeps `route(handler, { query: gridQuerySchema })` — parse (400) precedes `requireProject(tx, user, projectId, 'view')` (404 invisible, archived readable; X41/X42) — and forwards `zoom`/`expand`; M6's `grid.int.test.ts › shape`/`default window` stay green unchanged. Tests first `src/server/services/grid-day.int.test.ts` (golden F1, actor Cindy, LEAD of POS):
- `zoom=week`, no expand, `[2026-09-28, 2026-10-26)` → 4 periods, all `WEEK`, none `expanded` (M6 shape unchanged).
- `expand=2026-09-28` → `D:2026-09-28 … D:2026-10-02` (5), then `W:2026-09-28 { expanded: true }`, then `W:2026-10-05 …`.
- `zoom=day`, same range → 4 × (5 + 1) = 24 periods; a Saturday in Mint's schedule (factory override) → 6 day periods + รวม per week; a DAY row on Sunday `2026-10-04` → that week also lists `D:2026-10-04`.
- `zoom=day&expand=2026-10-05` → identical to `zoom=day`.

**S2.3 Day cells, per-day capacity and other-project day loads (`services/grid.ts`, BR-20/20a/21/21a, BR-42, X29, M7-D9/D15/D19).**
- Plans: `plansFromRows(rows in [from, to))` (M6's chunk query, already bounded). Per assignee row and week:
  - W cell = `weekCellFromPlan(plan, w, weekCapCd, weekStdCd)` (S1.11): DAY weeks keep M6's `days` record; WEEK weeks with week capacity 0 get `fallback`.
  - D cells (expanded weeks only) = `dayCellsFromPlan(plan, dayCtxFor(people[userId], w))`, zeros omitted.
- `people[u].capacity`/`standard` gain `D:` keys per M7-D19. One helper serves the grid **and** the save path, so S2.8 compares like with like (M7-D25):
  ```ts
  // src/server/services/day-context.ts (new; m09 S2 reuses loadDayData)
  /** D: capacity/standard keys of `weeks` per user from M5's loadCapacity (one call, range [min(weeks), max(weeks) + 7)),
   *  plus the person's live time-off spans in that range (unmasked dates; callers mask labels). */
  export async function loadDayData(tx: DbOrTx, userIds: readonly string[], weeks: readonly ISODate[]):
    Promise<Map<string, Pick<GridPerson, 'capacity' | 'standard' | 'timeOff'>>>
  /** DayCtx per (user, week) = src/lib/grid/day.ts#dayCtxFor applied to loadDayData's output.
   *  Same signature as M6's former week-context helper in services/allocations.ts (deleted by S2); save() and planRange() call this (C18). */
  export async function loadDayCtx(tx: DbOrTx, userIds: readonly string[], weeks: readonly ISODate[]): Promise<Map<string, Map<ISODate, DayCtx>>>
  ```
  Replacement steps (C18): (1) add `day-context.ts`; (2) in `services/allocations.ts` delete `loadWeekCtx` and import `loadDayCtx` in `save` and `planRange`; (3) `grep -rn loadWeekCtx src` → nothing; (4) M6's `plan-range.int.test.ts` (incl. `F3 fallback`) and `allocations.int.test.ts` stay green — the same `DayCtx` values (dayCaps from `capacityByDay`, schedule from `standardDayCd`, `timeOff[i]` from live spans) are the compatibility contract. Unit test `day-context.int.test.ts`: F3 Peter week 10-05 → `dayCaps [0,0,100,100,100,0,0]`, `schedule [100×5,0,0]`, `timeOff [true,true,false,false,false,false,false]`.
  `dayCtxFor` needs only the time-off **dates**, so the grid keeps serialising M6's masked `timeOff` (label `th.masking.leave` for viewers who are neither the manager nor the person; X30, X60b); the `TIME_OFF` flag carries no type or note.
- Task rows: `totals['D:…']` for expanded weeks through M6's task-total aggregation fed with the assignee D cells (each assignee row is wholly committed or wholly tentative by its task's effective certainty, so `{ total, committed }` stays exact). `blockers`, `completed`, `completedWeek`, `milestoneId: null`, `lateForMilestone: false` unchanged (X28, X76).
- `includeOthers=1` (X29): other projects' load of the grid people in expanded weeks, totals only: `spreadDayLoads(await repo.allocations.dayLoadsForProjects(tx, { userIds, weeks: expandedWeeks, excludeProjectId: ctx.id }), (u, w) => dayCtx.get(u)!.get(w)!)` (S2.1, S1.11, M7-D27) merged into `people[u].otherProjects` next to M6's `W:` keys from `loadByUserWeek`. DAY rows count as stored; WEEK rows are spread **separately for the committed and the tentative part** and summed (keeps `committed ≤ total` per day). No project id, name or task reaches the response.
- Tests first (`grid-day.int.test.ts`, golden F1 unless noted):
  - `› derived` — POS, `expand=2026-09-28`, Ivy's row: `D:2026-09-28…D:2026-10-02` = `{ cd: 50, resolution: 'WEEK', derived: true }` ×5; `W:2026-09-28` = `{ cd: 250, resolution: 'WEEK', derived: false }`; `people[ivy].capacity['D:2026-09-30'] = 100`.
  - `› DAY week collapsed` — `makeDayAllocations({ assignment: ivyUat, days: { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 } })`, no expand → `W:2026-09-28 = { cd: 300, resolution: 'DAY', derived: false, days }` and `people[ivy].capacity` has those five `D:` keys anyway (M7-D19).
  - `› BR-21a` — Ivy deactivated on `2026-09-28` (factory update; X64 → cap 0 from that date): `W:2026-10-05 { cd: 125, fallback: 'SCHEDULE' }`; with `expand=2026-10-05` the D cells are `25 ×5` with `warn: ['NON_WORKING']`.
  - `› F2` (`applyFixture('F2')`, Mobile, `expand=2026-10-19`): Jack `D:2026-10-19…22` = 125 derived (display may exceed 100, M7-D8), no `D:2026-10-23` cell, `periods` include `D:2026-10-23` and `holidays` lists it.
  - `› leave later (BR-42)` — Ivy DAY `{10-12: 100, 10-13: 100, 10-14: 100}` (CRM), then M5 `createTimeOff(Ivy, 2026-10-13)` → allocation rows unchanged (checksum); `D:2026-10-13 = { cd: 100, warn: ['NON_WORKING','TIME_OFF'] }`.
  - `› otherProjects day keys` — Cindy on POS with `includeOthers=1&expand=2026-10-05` → `people[cindy].otherProjects['D:2026-10-05'] = { total: 50, committed: 0 }` (CRM 250 TENTATIVE spread); `JSON.stringify(body)` contains neither `'CRM Migration'` nor `'ย้ายข้อมูลลูกค้า'` nor a CRM id.
  - `› blockers kept` — a POS task blocked by another POS task (M3 `addTaskBlocker` service) → `blockers: { open: 1, total: 1 }` under `zoom=day` (X76).

**S2.4 Save: the per-(item, week) table (`services/allocations.ts#save`, BR-20b/22/23, X65, M7-D3/D5/D6/D7/D22).** Replace M6's per-week application with `planWeek` (S1.8). M6's lock, authz and version steps stay first and unchanged.
```ts
export async function save(tx: Tx, user: SessionUser, input: SaveAllocationsInput, today: ISODate): Promise<SaveAllocationsOk> {
  const locked = await lockAssignments(tx, input.items)          // M6: SELECT … ORDER BY ta.id FOR UPDATE OF ta — before any allocation read (r2 finding 3)
  await authorizeItems(tx, user, locked)                          // M6: requireProject(…, 'edit') per project; hidden → 404 for the batch; archived → 403
  await assertVersions(tx, input.items, locked, today)            // M6: mismatch → ConflictError('VERSION_CONFLICT', …, { current: SaveItemResult[] })
  const pairs = groupByWeek(input.items)                          // (assignmentId, week) → WeekChange[] in input order; DAY: week = weekStart(period), dayIndex = isoWeekday(period) − 1
  const weeks = uniqueSorted(pairs.map((p) => p.week))
  const current = repo.allocations.plansFromRows(await repo.allocations.listForWeeks(tx, locked.ids, weeks))
  const ctx = await loadDayCtx(tx, locked.userIds, weeks)        // replaces M6's loadWeekCtx (S2.3, C18); same data as the grid
  const issues: SaveValidationIssue[] = []; const choice: NeedsChoicePayload['pairs'] = []; const planned: Planned[] = []
  for (const p of pairs) {
    const cur = current.get(p.assignmentId)?.get(p.week) ?? { resolution: null }
    const r = planWeek(cur, p.changes, ctx.get(locked.userOf(p.assignmentId))!.get(p.week)!, input.onDayWeekConflict)
    if (r.kind === 'invalid') issues.push({ taskAssignmentId: p.assignmentId, period: periodOf(p, r.dayIndex), reason: r.reason })
    else if (r.kind === 'needsChoice') choice.push({ taskAssignmentId: p.assignmentId, week: p.week })
    else planned.push({ ...p, before: cur, next: r.next, changed: r.changed, warnings: r.warnings })
  }
  if (issues.length) throw new ValidationError({}, th.grid.errors.invalidBatch, { issues })       // M6 signature (fieldErrors, message, extra); nothing written; M6's DAY_WEEK message branch is deleted
  if (choice.length) { const ws = uniqueSorted(choice.map((c) => c.week)); throw new NeedsChoiceError({ week: ws[0]!, weeks: ws, pairs: choice }) }
  for (const p of planned) if (p.changed) {                       // M7-D22: rewrite the whole week
    await repo.allocations.deleteWeek(tx, p.assignmentId, p.week) // DELETE first (BR-20b trigger, SPEC §6.3)
    await repo.allocations.insertWeekPlan(tx, p.assignmentId, p.week, p.next)
  }
  const changedIds = uniqueSorted(planned.filter((p) => p.changed).map((p) => p.assignmentId))
  const versions = await repo.assignments.bumpVersions(tx, changedIds)                       // M6-D3 / M7-D5: unchanged items keep their version
  await auditItems(tx, user, planned, locked, input.clientOpId)                              // M6 helper + M7 conversions (S2.6)
  return { results: await resultsFor(tx, input.items, planned, current, versions, locked, today), warnings: toSaveWarnings(planned) }
}
```
The action itself is M6's, unchanged (`withDeadlockRetry(() => db.transaction(…))`, no `refresh()`). `groupByWeek`, `resultsFor`, `toSaveWarnings`, `auditItems` are M6's helpers (S0.1 map); M7 changes only the `needsChoice` branch, the error construction and the conversions in the audit payload.
Precedence is `VERSION_CONFLICT` → `VALIDATION` → `NEEDS_CHOICE` (a choice cannot fix an invalid value). Thrown errors roll the transaction back: nothing written, no version moves. `results[i].weeks` holds `weekStateFromPlan` for **every** week the item touched (unchanged ones too), so the client can overwrite its overlay and its undo `after` snapshots (M7-D18). Tests first `src/server/services/allocations-day.int.test.ts` (golden F1, `asUser(ivy)`, POS "ทำ UAT + คู่มือหน้าร้าน" = `ivyUat`):
- `› AC-804` — `[{ granularity: 'DAY', period: '2026-09-30', cd: 100 }]` → `allocationRows(ivyUat, '2026-09-28')` = DAY `09-28:50, 09-29:50, 09-30:100, 10-01:50, 10-02:50` (no WEEK row, nothing on Sat/Sun); `results[0].weeks['2026-09-28'] = { cd: 300, resolution: 'DAY', days }`; version +1; POS total over `[2026-08-31, 2027-01-04)` `4625 → 4675`.
- `› equal value still materialises` — DAY `09-30 = 50` → 5 DAY rows of 50, total 250 (M7-D8).
- `› spill F2` (`applyFixture('F2')`, `asUser(jack)`, Mobile "ออกแบบ flow ใหม่", 10-19 WEEK 500) — DAY `10-19 = 100` → `100,100,100,100` + Fri `10-23:75`; warnings `SPILLED_OVER_DAY_LIMIT`, `WORK_ON_NON_WORKING_DAY { date: '2026-10-23' }`; total 475.
- `› spill F3` (`asUser(peter)`, DW, 10-05 WEEK 500, Wed = 50) → `10-05:100, 10-06:33, 10-07:50, 10-08:100, 10-09:100` (= 383); warnings include `ALLOCATED_ON_TIME_OFF` for 10-05 and 10-06.
- `› spill F4` (`asUser(cindy)`, CRM, 10-12 WEEK 250, Thu = 100) → `10-12:25, 10-15:100, 10-16:100` (= 225 = 250 − 125 + 100).
- `› DAY edits on a DAY week` — after AC-804, DAY `10-01 = null` → 4 rows, total 250; all five days `null` → no rows, `weeks['2026-09-28'] = { cd: 0, resolution: null }` (E8).
- `› BR-23 via COLLAPSE` — after AC-804, `WEEK 2026-09-28 = 300` + `'COLLAPSE'` → one WEEK row 300; replaying the 7-day DAY snapshot `[50,50,100,50,50,null,null]` (undo) restores the five DAY rows exactly (r5 §10.4).
- `› M7-D5` — WEEK `null` on the DAY week → all rows gone, no choice needed; WEEK `= Σ days` without a choice → nothing written, version unchanged, no audit row.
- `› mixed batch` — item A: DAY change on a WEEK week; item B: WEEK change on a WEEK week → both applied, two audit rows, both versions +1.
- `› week isolation` — a 09-28 save leaves the 10-05 rows of the same assignment untouched.

**S2.5 NEEDS_CHOICE, SCALE, COLLAPSE, validation (`save`, BR-24, §7.4, M7-D3/D4/D6/D7).** The code is S2.4; this step owns `describe('BR-24')` in the same file. Setup: Ivy POS after AC-804 (09-28 DAY 300) and after `10-05 = 50` on the WEEK 125 week (`[50,25,25,25,25]` = 150).
- WEEK `09-28 = 200`, no choice → `NeedsChoiceError { week: '2026-09-28', weeks: ['2026-09-28'], pairs: [{ taskAssignmentId: ivyUat, week: '2026-09-28' }] }`; rows, version and audit unchanged; the action result is `{ ok: false, code: 'NEEDS_CHOICE', message: th.errors.NEEDS_CHOICE, week, weeks, pairs }`.
- Two weeks in one item (09-28 = 200, 10-05 = 300) → `weeks: ['2026-09-28', '2026-10-05']`, one error, nothing written.
- One item needs a choice, another is a plain WEEK edit → whole batch rejected; the plain item's version unchanged.
- `SCALE` 09-28 → 200 → `[34,33,67,33,33]` (r8 §6.8); → 400 → `[100,67,100,67,66]` + `SPILLED_OVER_DAY_LIMIT`; → 700 → seven rows of 100 (Sat/Sun written) + `WORK_ON_NON_WORKING_DAY` ×2.
- `COLLAPSE` 09-28 → 400 → one WEEK row 400. `SCALE` on a WEEK week → plain write (P8).
- `VALIDATION` (nothing written): WEEK + DAY for the same week in one item → `MIXED_WEEK_AND_DAY`; capacity and schedule Mon only, WEEK 700, DAY Tue = 0 → `UNREPRESENTABLE`; stale `baseVersion` **and** a choice-needing pair → `VERSION_CONFLICT` (precedence).

**S2.6 Audit (`auditItems`, FR-1201, X44).** One row per assignment with ≥ 1 changed week, in the tx, using M6's entity and summary builder (`th.audit.*`; no Thai literals in `src/server`): `before: { weeks: Record<ISODate, WeekState> }`, `after: { weeks, conversions: { week: ISODate; from: 'WEEK' | 'DAY' | null; to: 'WEEK' | 'DAY' | null; via: 'SET' | 'SPLIT' | 'SCALE' | 'COLLAPSE' }[] }` (`SPLIT` = BR-22; `COLLAPSE` = BR-23 and BR-24 COLLAPSE). Add a key inside `th.audit` only if M6's summary cannot express the change. Test `allocations-day.int.test.ts › audit`: AC-804 → exactly one new `audit_log` row (`entity_id = ivyUat`, `project_id = POS`, `after.conversions = [{ week: '2026-09-28', from: 'WEEK', to: 'DAY', via: 'SPLIT' }]`); NEEDS_CHOICE → zero rows.

**S2.7 Warnings (`toSaveWarnings`).** `DayWarning` → `SaveWarning { code, taskAssignmentId, week, date: addDays(week, dayIndex) }`; one `SPILLED_OVER_DAY_LIMIT` per (item, week); `WEEK_NO_CAPACITY` without `date`; identical entries deduplicated. The client renders them from `th.grid.warn.*` / `th.grid.day.splitClampedToast`; the server never sends warning text. Unit coverage: S1.4; integration assertions: S2.4/S2.5.

**S2.8 Contract test: server vs client derived values (r6b M7-09, M7-D19, M7-D25).** `src/server/services/grid-day-parity.int.test.ts`, one case per row of r8 §4.7 (F1 Ivy 09-28, F1 Peter 10-12, F2 Jack/Mint/Peter/Cindy/Ivy 10-19, F3 Peter 10-05, F4 Cindy 10-12; fresh `truncateAll` + `seedGolden` + fixture per case):
1. `GET /api/grid/project/<p>?from=<w>&to=<w + 7>&expand=<w>` as the manager;
2. for every assignee row, the client-side computation `dayCellsFromPlan(weekPlanFromCell(row.cells['W:' + w], w), dayCtxFor(body.people[row.userId], w))` deep-equals the response's `D:` cells (numbers = the r8 §4.7 table);
3. `planWeek(weekPlanFromCell(…), [{ granularity: 'DAY', dayIndex: 0, cd: 100 }], dayCtxFor(body.people[u], w))` equals what `save` writes for the same change (inside `db.transaction`, rolled back with a thrown sentinel).

**S2.9 Leave added after DAY rows (BR-42, M7-D15).** Extend `src/server/services/time-off.int.test.ts › BR-42 never edits plans` (M5, extended by M6) with a DAY case: Ivy DAY `{10-12: 100, 10-13: 100}` (CRM), `createTimeOff` on 10-13 → allocation checksum unchanged; a later save in that week (`10-14 = 50`) returns `ALLOCATED_ON_TIME_OFF { date: '2026-10-13' }`. FR-906 stays as M5 built it (overload lines are M9, X23).

**S2.10 Older server tests + `DAY_WEEK` removal + done-check (C17, G25).** Update only the M6 assertions that encoded M6-only behaviour (X27); keep every other M6 assertion:
- `src/server/services/allocations.int.test.ts › X27 / M6-D34` (world `pChildAMember`, DAY week 10-12 = `{10-12: 50, 10-13: 50}`): `W 2026-10-12 = 150` without a choice → **`NEEDS_CHOICE`** (`NeedsChoiceError` payload `{ week: '2026-10-12', weeks: ['2026-10-12'], pairs: [{ taskAssignmentId: pChildAMember, week: '2026-10-12' }] }`), rows unchanged, version 1, no audit — was `VALIDATION DAY_WEEK`; with `'SCALE'` → DAY `10-12: 75, 10-13: 75`, version 2 — was `VALIDATION`; `'COLLAPSE'`, `= Σ` no-op, `W null` and the snapshot-replay cases unchanged. Rename the describe to `X27 / M6-D34 → M7 BR-24`.
- Delete the server uses of `'DAY_WEEK'` and `th.grid.errors.dayWeek` in `services/allocations.ts` (S2.4); `grep -rn "DAY_WEEK\|errors.dayWeek" src/server src/app/api` → nothing, then report to the orchestrator (§6).
- Done-check: `pnpm vitest run --project integration src/server` · `pnpm eslint src/server src/app/api` · `pnpm typecheck` (own paths clean).

### 5.S3 — PlanGrid day resolution (grid-engineer · owns `src/components/grid/**`, `src/lib/grid/**`, `src/app/(app)/projects/[id]/plan/**`)

Starts after S1 (it consumes `src/lib/grid/day.ts` read-only and the domain functions) and runs in parallel with S2 against S0's contracts. Pure helpers in `src/lib/grid/**` are **test-first** (`unit` project); components get focused `ui` tests with `offsetWidth`/`offsetHeight` stubs (r4 §16); full interaction is covered by S5's Playwright spec. Rules for every step:
- Cells stay memoised `div`s with one CSS Module class and `data-*` state; no MUI component, `sx` or `styled` per cell (PLAN §3.9). Colours only from tokens (`var(--load-*)`, the X51 faded token `#5B6878`); never opacity; every state also has a glyph or text (§8.9).
- All UI text from `th.grid.*` / `th.overload.*` / `th.shortcuts.*`; new keys only inside `grid.zoom`, `grid.day`, `grid.br24`, `grid.warn` and `overload` (Edit tool).
- Shortcuts match `e.code` first (X49) through M6's `useGridKeyboard`; no `localStorage` (expansion lives in React state, zoom in `user_preferences`; X53).
- View actions (header click, `Cmd+↓`, `Cmd+↑`, zoom toggle) **never write data**; data actions (typing, `f`/`h`, Delete, paste, fill, shift, ↕ collapse, BR-24 choice) go through M6's change pipeline + `useSaveAllocations` and produce **one undo entry per gesture** of complete week snapshots (X65, §7.5).

**S3.1 Column model with day and "รวม" columns (`src/lib/grid/columns.ts`, M6-D35, M7-D10, M7-D24, C63).** M6's file already declares `ColKind`, `GridColumn`, `buildColumns(weeks, expanded, dayDatesByWeek)`, `columnIndexOfPeriod`, `chunksForRange`, `WEEK_W`, `HEADER_ROWS`, `FOOTER_ROWS` with M7's shape; M7 **only replaces the `RangeError('day columns arrive in M7')` branch** of `buildColumns` and adds two width constants. No signature changes, no redeclaration of `HEADER_ROWS`/`FOOTER_ROWS` (the expanded-week labels live inside M6's single period header row; M8 later sets `HEADER_ROWS = 2` for its ◆ row).
```ts
// additions to M6's columns.ts
export const DAY_W = 44, WEEK_TOTAL_W = 52
export const WIDTH = { week: WEEK_W, day: DAY_W, weekTotal: WEEK_TOTAL_W } as const     // WIDTH.week === WEEK_W (64)
/** M7 branch: an expanded week → its day columns (dates from dayDatesByWeek.get(week), i.e. the loaded chunk's D: periods;
 *  Mon–Fri placeholders while absent), each { kind: 'D', role: 'day', key: `D:${d}`, weekStart: week, date: d, width: DAY_W },
 *  then one { kind: 'W', role: 'weekTotal', key: `W:${week}`, weekStart: week, date: week, width: WEEK_TOTAL_W }.
 *  Collapsed weeks keep M6's { kind: 'W', role: 'week', width: WEEK_W }. Offsets cumulative. */
export function buildColumns(weeks: readonly ISODate[], expanded: ReadonlySet<ISODate>,
                             dayDatesByWeek: ReadonlyMap<ISODate, readonly ISODate[]>): GridColumn[]
```
Chunking stays week-based: `VirtualGrid.onRangeChange(firstIdx, lastIdx)` keeps mapping to `cols[firstIdx].weekStart` / `cols[lastIdx].weekStart` and calls `chunksForRange(today, firstWeek, lastWeek)` (M6, unchanged), so day columns never change which chunks load. `columnIndexOfPeriod` is unchanged (M8 uses it for ◆ in day columns). Tests first `src/lib/grid/columns.day.test.ts`: weeks `[09-21, 09-28, 10-05]`, expanded `{09-28}`, no loaded dates → keys `W:09-21, D:09-28…D:10-02, W:09-28 (role weekTotal), W:10-05`, kinds `W, D×5, W, W`, widths `64, 44×5, 52, 64`, offsets cumulative; with loaded dates incl. `2026-10-04` → 6 day columns; `columnIndexOfPeriod(cols, 'D:2026-09-30') = 3`; `WIDTH.week === WEEK_W`; nothing expanded → deep-equals M6's output (regression). In M6's `columns.test.ts` delete only the case "`buildColumns(weeks, new Set(['2026-09-28']), new Map())` throws `RangeError`" (M6 behaviour removed on purpose).

**S3.2 Expansion state and chunk params (`src/lib/grid/expansion.ts`, `src/components/grid/useExpansion.ts`, `useGridChunks.ts`, FR-802/803, M7-D17, M7-D24).**
```ts
export interface ExpansionState { zoom: GridZoom; expanded: ReadonlySet<ISODate> }
export function toggleWeek(s: ExpansionState, week: ISODate): ExpansionState        // no-op in DAY zoom (M7-D11)
export function isExpanded(s: ExpansionState, week: ISODate): boolean                // DAY zoom → true
/** Per-chunk query part: only the expanded weeks inside [chunk.from, chunk.from + 8 weeks), sorted; DAY zoom → expand []. */
export function chunkParams(s: ExpansionState, chunkFrom: ISODate, includeOthers: boolean): GridChunk
```
`useExpansion(ctx, initialZoom)` holds the state in `useState` (reset when `ctx.id` changes), exposes `toggle`, `expand`, `collapse`, `setZoom`. M6's `useGridChunks(ctx, chunkStarts, includeOthers)` gains an optional fourth parameter `expansion?: ExpansionState` (additive; absent → M6's `{ expand: [], zoom: 'WEEK' }`) and builds each key with `qk.gridChunk(ctx, chunkParams(expansion, from, includeOthers))`, `keepPreviousData` unchanged — so only the chunk whose expand set changed refetches; while it loads, the expanded week shows its placeholder day columns with `th.grid.day.loading` (`aria-busy`). The URL mapping (`zoom=day`, comma-separated `expand`) is already M6's `gridChunkUrl` (m06 S3.2 test "M7 ready"); `fetchGridChunk` keeps using `getJson`. `dayDatesByWeek` for S3.1 = the `D:` periods of M6's merged `GridModel.periods` (m06 S3.2 keeps every chunk's periods, unique by key, in timeline order), grouped by `weekStart`. Tests first `src/lib/grid/expansion.test.ts`: toggle twice → original; DAY zoom → `toggleWeek` returns the same object; `chunkParams` with expanded `{09-28, 12-07}` and chunk `2026-09-28` → `{ from: '2026-09-28', expand: ['2026-09-28'], zoom: 'WEEK', includeOthers: false }`; DAY zoom → `{ zoom: 'DAY', expand: [] }`; `gridChunkUrl` of that DAY chunk ends with `&zoom=day` (regression on M6's helper).

**S3.3 Week header, zoom toggle and expand/collapse keys (`GridHeader.tsx`, `DayGroupHeader.tsx`, `ZoomToggle.tsx`, `GridToolbar.tsx`, `keymap.ts`, `useGridKeyboard.ts`, FR-802/803, KEY-07, M7-D11).**
- `GridHeader` (M6): each collapsed week header cell becomes a `<button aria-expanded={false} aria-label={th.grid.day.expandWeek(formatWeekHeader(ws))}>`; plain click → `toggle(ws)` (M6 left it free, M6-D33); M6's Shift+click column selection is unchanged. In DAY zoom headers are not buttons (no toggle).
- Expanded week (`DayGroupHeader`, inside the same period header row — `HEADER_ROWS` unchanged): each day column header is `role="columnheader"` with two text lines — line 1 (only on the week's first day column, visually spanning the group's width) the button `formatThaiDate(ws, 'medium')` ("19 ต.ค. 2569") with `aria-expanded={true}` and `aria-label={th.grid.day.collapseWeekView(formatWeekHeader(ws))}`; line 2 the narrow weekday label (`formatWeekday(d)` → "จ อ พ พฤ ศ ส อา"); 🎌 + `th.grid.header.holiday(name)` tooltip on holidays (FR-807); the weekTotal column header reads `th.grid.day.totalColumn` ("รวม") with `aria-label={th.grid.day.totalColumnLabel(formatWeekHeader(ws))}`. Both lines fit M6's `HEADER_H` (40 px).
- `ZoomToggle` (extracted from M6's `GridToolbar` `[สัปดาห์]` toggle, §8.3 `[สัปดาห์|วัน]`): MUI `ToggleButtonGroup exclusive size="small" aria-label={th.grid.toolbar.zoom}` with `th.grid.toolbar.zoomWeek` / `th.grid.toolbar.zoomDay`; `GridToolbar` renders it in M6's place.
- `keymap.ts` (M6): `GridKeyAction` gains `{ kind: 'expandWeek' } | { kind: 'collapseWeek' } | { kind: 'cellMenu' }` — `Mod+ArrowDown` (`e.code === 'ArrowDown' && (e.metaKey || e.ctrlKey)`) → `expandWeek`, `Mod+ArrowUp` → `collapseWeek`, `Shift+F10` and `ContextMenu` → `cellMenu` (M6 left `Mod+ArrowDown/Up` unmapped). `useGridKeyboard` handles them: on a **week cell** `expandWeek` → expand that week, then focus its first visible day cell (same row) after the columns are built; on a **day or รวม cell** `collapseWeek` → collapse the view and focus the week cell; both `preventDefault()`; in DAY zoom both are no-ops; plain arrows keep M6's movement across all columns (day columns included). `cellMenu` (and right click) opens `CellMenu` (S3.9).
Tests first: `src/components/grid/GridHeader.day.test.tsx` — click → `onToggle('2026-09-28')`, `aria-expanded` flips, no call to the save mutation (spy); Shift+click still selects the column (M6 behaviour); DAY zoom → no button role. `src/lib/grid/keymap.test.ts` (M6 file, new cases) — `{ code: 'ArrowDown', metaKey: true }` and `{ code: 'ArrowDown', ctrlKey: true }` → `expandWeek`; Thai layout `{ code: 'ArrowDown', key: 'ArrowDown', metaKey: true }` same; `{ code: 'ArrowUp', ctrlKey: true }` → `collapseWeek`; `{ code: 'F10', shiftKey: true }` → `cellMenu`; `{ code: 'ArrowDown' }` without modifier → M6 `move`. In M6's `PlanGrid.test.tsx` replace "plain header click changes nothing" with "plain header click toggles `aria-expanded` and fires no save".

**S3.4 Cell rendering: derived, DAY, warnings, leave, holiday (`GridCell.tsx`, `grid.module.css`, BR-20/20a/21a, FR-807, M7-D9/D15/D20).**
- D cell of a WEEK week (`derived: true`): `data-derived="true"`, class `derived` = dashed underline + `color: var(--faded)`, `aria-description={th.grid.day.derivedDescription}`, tooltip `th.grid.day.derivedTooltip(formatCd(cd, { decimals: 2 }), formatCd(weekCd, { decimals: 2 }))`. Values may exceed 1.0 (e.g. "1.3", M7-D8).
- D cell of a DAY week: solid, tooltip `th.grid.day.dayTooltip(<2 decimals>)`.
- W cell: M6 rendering; DAY weeks keep M6's "⋯" marker; `fallback` → ⚠ glyph + tooltip `th.grid.warn.weekNoCapacity`; in an expanded week the W value renders in the narrow รวม column.
- `warn` on D cells: `NON_WORKING` → ⚠ + `th.grid.warn.nonWorkingDay`; `TIME_OFF` → leave glyph + `th.grid.warn.allocatedOnTimeOff(formatCd(cd))` (visually hidden text, M6's `StatusGlyph`).
- Leave stripes + "ลา" icon on day cells whose date is covered by the person's (masked) `timeOff` (half days: stripe on half the cell + `th.masking.leave`); holiday columns grey (`--holiday`) for every row; cap-0 days `--nonworking`.
- Zero renders empty (§8.8); 1 decimal in cells, 2 in tooltips (`formatCd`, M6).
Tests first `src/components/grid/GridCell.day.test.tsx`: derived 50 → text "0.5", `data-derived="true"`, `aria-description` = `th.grid.day.derivedDescription`, computed style has no `opacity` < 1; DAY 100 → "1.0", no `data-derived`; derived 125 → "1.3"; `warn: ['NON_WORKING']` → accessible name contains `th.grid.warn.nonWorkingDay`; `fallback: 'SCHEDULE'` → ⚠ with `th.grid.warn.weekNoCapacity`.

**S3.5 Expanded-week layout in `PlanGrid` / `VirtualGrid` (§8.4, r4 §12–§14).** Columns come from S3.1 (`getItemKey = col.key`, memoised on the columns array, so a new expansion rebuilds the size cache; call `colVirtualizer.measure()` when widths change without a key change — unit toggle). Header rows: M6's period header row becomes two lines for expanded weeks (S3.3). The ↕ affordance (M7-D23) is an icon button inside the **รวม** cell of an assignee row when that (row, week) is DAY — `aria-label={th.grid.day.collapseToWeek}` — visible on hover and on focus of any cell of that row in that week; it is also the first item of `CellMenu`. Single-assignee merged rows (§8.3, M6) behave like assignee rows. Today button / `scrollToColumn` use `columnIndexOfPeriod(cols, wKey(todayWeek))` (or the day column of today when that week is expanded). Done-check: Playwright covers layout (S5); a `ui` smoke `PlanGrid.day.test.tsx` with offset stubs asserts that expanding renders `role="columnheader"` cells for 5 days + "รวม" and that `aria-colindex` stays contiguous.

**S3.6 Typing on day and รวม cells (`src/lib/grid/day-input.ts`, M6's `src/lib/grid/apply.ts`, FR-804, BR-22, BR-26/27, X65, M7-D8/D12).** M6's gesture planners (`planTyped`, `planCapacityKey`, `planPaste`, `planFill`, `planShift`) produce `CellWrite { taskAssignmentId, granularity, period, cd }` from `TargetCell`s; M7 makes them column-kind aware instead of adding a parallel pipeline:
```ts
// apply.ts (M6) — TargetCell gains two optional fields (additive; absent = M6's week cell)
export interface TargetCell { rowKey: RowKey; taskAssignmentId: string | null; week: ISODate; editability: Editability; capCd: Cd; cell?: AssigneeCell
  granularity?: 'WEEK' | 'DAY'      // M7: 'DAY' for D columns (role 'day'), 'WEEK' (default) for week and weekTotal columns
  date?: ISODate }                  // M7: the day of a D column; capCd is then that day's capacity (people[u].capacity['D:' + date] ?? 0)
// day-input.ts (new, pure) — thin wrappers over M6's units.ts
/** parseCellInput(raw, { unit, capCd: dayCapCd, maxCd: 100 }) — FRACTION denominator = the day's capacity; cap 0 → days (M6 rule). */
export function parseDayInput(raw: string, o: { unit: CellUnit; dayCapCd: Cd }): ParsedCell
/** 'f' → fullCapacityCd(dayCapCd); 'h' → halfCapacityCd(dayCapCd); cap 0 → null (cell skipped, M6 `skip NO_CAPACITY`). */
export function dayCapacityKey(key: 'f' | 'h', dayCapCd: Cd): Cd | null
/** TargetCell → CellWrite: D → { granularity: 'DAY', period: date, cd }; week / weekTotal → { granularity: 'WEEK', period: week, cd }. */
export function writeFor(t: TargetCell, cd: Cd | null): CellWrite
```
`planTyped`/`planCapacityKey` call `parseDayInput`/`dayCapacityKey` for `granularity === 'DAY'` targets and `writeFor` for every target; their `skippedDayWeek` counter is removed (S3.14).
- An invalid day value (`> 1.00`, `MAX`) rejects that cell only: the editor stays open with `aria-invalid` and helper text `th.grid.errors.maxDay`; nothing is queued.
- Optimistic overlay: M6's `cache-ops.ts#applyWritesOptimistically(resp, writes)` gains the day path — per touched (assignment, week) it computes `next = planWeek(weekPlanFromCell(cell, week), changes, dayCtxFor(resp.people[userId], week), choice)` and calls the new pure `src/lib/grid/day-overlay.ts#applyPlanToResponse(resp, taskAssignmentId, week, next: WeekPlan): GridResponse`, which patches the W cell (`weekCellFromPlan`) and, for expanded weeks, the D cells (`dayCellsFromPlan(next, dayCtxFor(person, week))`) of every loaded chunk (`setQueriesData(qk.gridAll(ctx))`); `next` comes from `planWeek(current, changes, ctx)` with the **same** `DayCtx` the server uses (M7-D19), so AC-804 shows 3.0 immediately and the server result only confirms it.
- When the save returns `SPILLED_OVER_DAY_LIMIT`, toast `th.grid.day.splitClampedToast`; other warning codes → one toast listing `th.grid.warn.*` texts (deduplicated); the cells take the server's `weeks` (authoritative).
- An `UNREPRESENTABLE` / `MIXED_WEEK_AND_DAY` validation result reverts those cells and shows `th.grid.day.unrepresentable` / `th.grid.errors.mixedWeekAndDay`.
Tests first `src/lib/grid/day-input.test.ts` (`ParsedCell` results: `value` / `clear` / `invalid`): `'1'` → 100; `'0.5'` → 50; `',5'` → 50; `'๐.๕'` → 50; `'1.25'` → invalid MAX; `'0'` → clear; FRACTION `'0.5'` at day cap 50 → 25; FRACTION at cap 0 → days; `dayCapacityKey('f', 50)` → 50; `('h', 100)` → 50; `('h', 75)` → 50 (X65: `25·floor((150 + 50)/100)`); `('h', 50)` → 25; `('f', 0)` and `('h', 0)` → null. `apply.test.ts › M7` (M6 file, new cases): `writeFor` D target `2026-09-30` → `{ granularity: 'DAY', period: '2026-09-30', cd: 100 }`; รวม target → WEEK on `2026-09-28`; Delete on a derived day → `{ DAY, cd: null }`; `'3'` over 4 week targets incl. one DAY week → 4 writes (M6's "skippedDayWeek 1" case becomes 4 writes; the DAY-week write goes through S3.8). `day-overlay.test.ts`: AC-804 overlay → W `{ cd: 300, resolution: 'DAY' }`, D cells solid `[50,50,100,50,50]`.

**S3.7 Same-kind rules for fill, paste, shift and range typing (`src/lib/grid/kinds.ts`, §4.8 การกรอก, X65, M7-D12).**
```ts
/** Target columns for paste/fill/range-typing: from the anchor column onward, stop before the first column whose kind differs. */
export function sameKindRun(cols: readonly GridColumn[], fromIdx: number, toIdx: number): { from: number; to: number; clipped: boolean }
/** Cmd+←/→: every involved column and its destination must share the kind; for D also the same weekStart. */
export function canShift(cols: readonly GridColumn[], sel: { from: number; to: number }, dir: -1 | 1): boolean
```
- Paste (M6 tiling rules) and fill handle (copy/tile, never increment) apply only to `sameKindRun`; when clipped, toast `th.grid.day.mixedKinds`. Range typing + Enter and `f`/`h` over a range follow the same run (per cell capacity; cap-0 days skipped; read-only rows skipped).
- `Cmd+←/→` with `canShift === false` → no-op + toast `th.grid.day.shiftWithinWeek` (D) or `mixedKinds` (W/D mint).
- M6's "skip DAY-resolution weeks" branch is **removed** from every gesture (S3.14); a WEEK value landing on a DAY week goes through S3.8.
Tests first `src/lib/grid/kinds.test.ts`: cols `[W 09-21, D×5 09-28, W 09-28(total), W 10-05]` — paste of 3 values anchored at `D:2026-10-01` → run Thu, Fri, clipped (`รวม` not written); anchored at `W:2026-09-21` with 2 values → only `W:09-21`, clipped; shift right of `D:10-01..10-02` → false (destination is W); shift right of `D:09-29..09-30` → true; fill from `W:2026-09-28 (total)` → `W:10-05` allowed (both W).

**S3.8 BR-24 dialog flow (`Br24Dialog.tsx`, `useDayWeekChoice.ts`, `useSaveAllocations.ts`, `src/lib/grid/br24.ts`, BR-24, §7.4, M7-D3/D4).**
```ts
// src/lib/grid/br24.ts (pure)
export interface ConflictPair { taskAssignmentId: string; week: ISODate; fromCd: Cd; toCd: Cd; days: Days7; userId: string }
/** WEEK writes whose week is DAY in the merged GridModel (M6 S3.2), cd > 0 and cd ≠ Σ days (M7-D5 cases are not conflicts). */
export function findDayWeekConflicts(writes: readonly CellWrite[], model: GridModel): ConflictPair[]
/** Previews computed by the domain: SCALE → scaleDays(days, toCd, ctx) (may spill); COLLAPSE → WEEK toCd. */
export function previewChoice(pair: ConflictPair, ctx: DayCtx, choice: OnDayWeekConflict): StepResult | { ok: true; weekCd: Cd }
export function splitByConflicts(writes: readonly CellWrite[], pairs: readonly ConflictPair[]): { plain: CellWrite[]; conflicting: CellWrite[] }
```
- **Pre-emptive (normal path):** after a gesture builds its changes, `findDayWeekConflicts` against the cache. `plain` is enqueued at once; the conflicting cells show the typed value with `data-pending-choice="true"` and the dialog opens **once** for the whole gesture.
- `Br24Dialog` (MUI `Dialog` with `slotProps`, focus trapped, `Esc` = Cancel; this is the SPEC-mandated choice dialog, not a confirm): title `th.grid.br24.title(n)`; for one pair `breakdown(formatDayParts(days))` ("จ 0.5 · อ 0.5 · พ 1.0 · พฤ 0.5 · ศ 0.5") and `change(from, to)`; for several pairs up to 5 `pairLine(person, formatThaiDate(week), from, to)` + `more(k)`; two large buttons — **`th.grid.br24.scale`** with `scaleHint` + `scalePreview(parts)` (first pair) and **`th.grid.br24.collapse`** with `collapseHint` + `collapsePreview(total)` — and `th.grid.br24.cancel`. Choosing enqueues `conflicting` with that `onDayWeekConflict`; Cancel reverts only those cells (overlay back to the cached plan, `data-pending-choice` removed); `plain` is unaffected.
- **Server fallback:** `NEEDS_CHOICE` from `saveAllocations` (stale cache) keeps the optimistic values, opens the same dialog built from `pairs` + the current cache, and on a choice re-sends the same items (baseVersions re-read at send time) with that choice; Cancel removes the pairs' changes from the batch, re-sends the rest and reverts the pairs.
- `VERSION_CONFLICT` while the dialog is open (another tab saved the same assignment): M6's conflict handling runs (`applyConflicts(err.extra.current)`, drop that assignment's pending writes, mark its undo entries stale, toast `th.grid.toast.conflict`); the dialog closes and the pending pairs of that assignment are reverted to the server state (M7-D26).
- `useSaveAllocations` (M6): widen `enqueue(writes, o?: { onDayWeekConflict?: OnDayWeekConflict; immediate?: boolean })` from M6's `'COLLAPSE'`-only option to `'SCALE' | 'COLLAPSE'`; `onError` handles `NEEDS_CHOICE` (`err.extra` = `NeedsChoicePayload`, via M6-D25's `ActionFailure.extra`) by opening the dialog (server fallback above) and drops M6's `VALIDATION … DAY_WEEK` branch; `VALIDATION` with `issues` reverts only the listed cells. The debounce queue keys batches by `onDayWeekConflict` and **flushes before** enqueueing a batch with a different value; it also flushes before enqueueing a change of the other granularity for a week that already has queued changes (M7-D6); `scope: { id: 'grid-save:' + ctx.id }` unchanged; `baseVersion` read in `mutationFn`.
- Undo/redo and collapse never open the dialog (S3.9).
Tests first: `src/lib/grid/br24.test.ts` — cache DAY 09-28 `[50,50,100,50,50]` + WEEK change 200 → one pair `{ fromCd: 300, toCd: 200 }`; change 300 → none; change null → none; WEEK week → none; `previewChoice(SCALE)` → `[34,33,67,33,33]`; 400 → `[100,67,100,67,66]` + spilled. `src/components/grid/Br24Dialog.test.tsx` — one pair: title `th.grid.br24.title(1)`, texts of breakdown/change/previews; clicking `th.grid.br24.scale` → `onChoose('SCALE')`; `Escape` → `onCancel`; three pairs → `title(3)` and three pair lines.

**S3.9 Undo/redo, collapse to week and the cell menu (`src/lib/grid/undo.ts`, `src/lib/grid/collapse.ts`, `CellMenu.tsx`, `useCollapseToWeek.ts`, BR-23, §7.5, AC-805, M7-D2/D18/D23).**
```ts
// src/lib/grid/undo.ts (M6, reused unchanged): WeekSnapshot { taskAssignmentId; week; resolution; weekCd; days },
//   snapshotOf(cell, taskAssignmentId, week) — DAY snapshots always carry all 7 days —, snapshotFromState, snapshotToChanges (DAY → seven DAY
//   changes with null for empty days; WEEK → one WEEK change; null → WEEK null; sent with 'COLLAPSE'), GridUndoEntry
// src/lib/grid/collapse.ts (new)
/** BR-23 targets → WEEK writes equal to Σ days (M6 CellWrite), sent with onDayWeekConflict 'COLLAPSE'. WEEK/empty targets are ignored. */
export function collapseChanges(targets: readonly { taskAssignmentId: string; week: ISODate }[], model: GridModel): CellWrite[]
// src/components/grid/CellMenu.tsx (new; M8 extends it with the additive `items?` prop — C28)
export interface CellMenuItem { id: string; label: string; disabled?: boolean; onSelect(): void }
export interface CellMenuProps {
  anchor: { rowKey: RowKey; periodKey: PeriodKey } | { x: number; y: number } | null   // focused cell (Shift+F10 / ContextMenu key) or pointer position
  targets: readonly { taskAssignmentId: string; week: ISODate }[]                     // DAY (row, week) pairs of the selection
  onCollapse(): void; onClose(): void
  items?: readonly CellMenuItem[]                                                      // M8: when given, replaces the default collapse item
}
export function CellMenu(props: CellMenuProps): React.JSX.Element
```
- Every gesture pushes one `{ label, undo, redo }` entry (`useUndo().push`, M1/X04) whose `before`/`after` are complete week snapshots of every touched (assignment, week); `undo` sends `snapshotToChanges(before)` with `'COLLAPSE'`, `redo` sends `after` the same way — P7 guarantees no `NEEDS_CHOICE` and no dialog. On save success the entry's `after` is replaced by the server's `weeks` (M7-D18). Labels: `th.grid.day.undo.dayEdit` / `.scale` / `.collapse`.
- **Extension point (M8, reviewed):** `CellMenu`'s optional `items?: CellMenuItem[]` prop is the only way later milestones add entries (M8's ◆ menu); M8 also reuses the `grid.cellMenu` shortcut entry (`Shift+F10`, label `th.shortcuts.items.gridCellMenu`, S0.6) and the menu label `th.grid.day.cellMenu` — keep those ids and keys stable.
- `CellMenu` (MUI `Menu` with `slotProps`, `aria-label={th.grid.day.cellMenu}`; right click, context-menu key, `Shift+F10`; focus returns to the cell on close): default item `th.grid.day.collapseToWeek` acts on every DAY (row, week) in `targets`; disabled with `th.grid.day.collapseToWeekDisabled` when `targets` is empty. When `items` is passed (M8's ◆ menu) they are rendered instead of the default item; no other prop changes, and M7's call sites never pass `items`. Running it: optimistic WEEK = Σ days, toast `collapsedToast` (or `collapsedManyToast(n)`) with `th.undo.undo` (8 s, sonner via `useUndo`), `Cmd+Z` restores the exact days. No confirm (P2).
Tests first `src/lib/grid/undo.day.test.ts`: DAY snapshot `{09-28:100, 09-29:100, 09-30:50}` → 7 changes with nulls for 10-01…10-04; applying them through `planWeek` to WEEK 250 (after COLLAPSE) gives `[100,100,50,0,0,0,0]` (not 350); WEEK snapshot (`snapshotOf(cell, ivyUat, '2026-09-28')`) → `[{ WEEK, 250 }]`; AC-804 undo → `planWeek(DAY [50,50,100,50,50], [WEEK 250], ctx, 'COLLAPSE')` → WEEK 250, never `needsChoice`. `collapse.test.ts`: DAY 300 target → WEEK 300; WEEK target → no change. `src/components/grid/CellMenu.test.tsx`: two DAY targets → one enabled item `th.grid.day.collapseToWeek`, clicking calls `onCollapse` once; no targets → item disabled with `collapseToWeekDisabled`; `items=[{ id: 'x', label: 'X', onSelect }]` → only "X" rendered (M8 contract); `Escape` → `onClose`.

**S3.10 Day-level load, overload glyphs and tones (`src/lib/grid/day-footer.ts`, M6's footer components `Footer.tsx`/`FooterCell.tsx` (m06 S3.7), `GridCell.tsx`, BR-40/45/50, X06/X67, M7-D13/D14).** Pure and context-agnostic so M9's person grid delegates to it (C38): in M7 it reads only `assignee` rows (any other `GridRow` kind is skipped, never a type error), looks the task up by `assignee.taskId`, and takes contributions that are not assignee cells (other projects) through `extra`. **Extension points (later milestones extend, never change the signature):** M9 S3.3 adds a masked-row branch to `personDayLoads` (a `masked` row's D: totals count for `masked.userId`) and reuses `personDayStatus`/`footerDayCell` unchanged; passing the same totals through `extra` is equivalent and also allowed.
```ts
import type { LoadPair, LoadView, PeriodKey } from '@/domain/types'                      // M6 types — not redeclared
/** Per person per D: period: Σ of that person's assignee D cells (+ Σ extra.get(user)[key]),
 *  committed by the row's effective certainty; a row of a completed task counts only if period.weekStart ≤ completedWeek (BR-50).
 *  Project context: extra = otherProjects D: keys when the footer switch is on (otherDayLoads below). Person context (M9): no `extra` — M9 uses the additive masked-row branch (m09 S3.3); either is allowed, never both. */
export function personDayLoads(rows: readonly GridRow[], periods: readonly GridPeriod[],
                               o: { extra?: ReadonlyMap<string, Partial<Record<PeriodKey, LoadPair>>> }): Map<string, Partial<Record<PeriodKey, LoadPair>>>
/** Helper for the project footer switch: people[u].otherProjects restricted to D: keys. */
export function otherDayLoads(people: GridResponse['people']): Map<string, Partial<Record<PeriodKey, LoadPair>>>
export interface DayStatus { level: OverloadLevel; load: LoadPair; capCd: Cd }
/** capCd = person.capacity[key] ?? 0; level = overloadLevel(load, capCd); a missing load = { 0, 0 }. */
export function personDayStatus(loads: Partial<Record<PeriodKey, LoadPair>>, person: GridPerson, key: PeriodKey): DayStatus
/** Footer "ภาระรวม" D cell: tone = loadTone(footerValue-style view load of Σ loads (M6 rowTotalView), Σ caps); glyph = worstLevel(people);
 *  overPeople = userIds whose level ≠ OK (sorted by people[u].name, compareThai). Works for one person (person grid) or many. */
export function footerDayCell(statuses: ReadonlyMap<string, DayStatus>, view: LoadView):
  { tone: LoadTone; palette: 'load' | 'tentative'; glyph: OverloadLevel; overPeople: string[]; load: Cd; capCd: Cd }
```
- Assignee D cells of a person whose day level ≠ OK show 🔴 (OVER) / ⚠ (RISK) plus visually hidden `th.overload.dayStatus(th.overload.level[l], load, cap)`; the footer D cells show tone classes (`data-tone`, `data-palette`) **and** the glyph + number; the footer tooltip uses `th.overload.peopleOver(names)` (display names via M6's people/`displayName`). Week columns keep M6's footer (week tones/glyphs are M9, X06).
- Day cells of a completed task in its completion week carry tooltip `th.grid.day.completedWeekCounts` (M7-D14).
Tests first `src/lib/grid/day-footer.test.ts`: F2 Jack 10-19 derived 125 committed, cap 100 → OVER; F4 Cindy 10-15 125 tentative, cap 100 → RISK; half-day leave cap 50 + DAY 100 committed → OVER (r5 M7-10); footer of Jack + Mint on 10-19 (250/200) → tone `over`, glyph OVER, `overPeople` both; view `AT_RISK` for Cindy 10-15 → load 125, palette `tentative`; completed task (`completedWeek 2026-09-28`) → its 2026-10-01 day counts, its 2026-10-05 day does not; `extra: otherDayLoads(people)` adds `otherProjects['D:…']`; `extra` with a masked-row map `{ ivy: { 'D:2026-09-28': { 50, 50 } } }` adds 50 to Ivy's day (M9 person context); rows containing an object with `kind: 'masked'` are skipped without throwing (M7 behaviour; M9's masked-row branch replaces this case in its own tests). `src/components/grid/Footer.day.test.tsx`: renders 🔴 with hidden text `th.overload.level.OVER` and `data-tone="over"`; tone never without glyph or number.

**S3.11 Zoom preference and initial state (`src/app/(app)/projects/[id]/plan/page.tsx`, `PlanGrid.tsx`, FR-802, X59).** The page (authz first, M6) reads `(await getPreferences(tx, user.id))['grid.zoom']` (M1 service; default `'WEEK'`) on the server and passes the optional prop `initialZoom` to `PlanGrid` (announced in M6's `PlanGridProps`; when absent `PlanGrid` uses `usePreferences().prefs['grid.zoom']`); `ZoomToggle` → `setZoom` + `usePreferences().setPreference('grid.zoom', z)` (M1, debounced action, not audited). Switching to DAY keeps the horizontal position on the same week (`scrollToColumn` (M6 `VirtualGridHandle`) of the first visible week's first day column). Test `ZoomToggle.test.tsx`: click `th.grid.toolbar.zoomDay` → `onChange('DAY')` and the preference setter called once with `'DAY'`.

**S3.12 Accessibility (§8.9, A11Y-2b, M7-D20).** `role="grid"`, contiguous `aria-colindex` over day/รวม columns; day cells' accessible name `th.grid.day.cellLabel(formatWeekday(d), formatThaiDate(d, 'short'), value)` + `aria-description` for derived values; header toggles are buttons with `aria-expanded`; ↕ button and `CellMenu` reachable by keyboard (`Shift+F10`); the BR-24 dialog traps focus and returns it to the edited cell; glyphs always have text. Contrast: derived text uses the X51 faded token (M6's token test already covers `#5B6878` on white / `--nonworking` / `--holiday`). Test: `PlanGrid.day.test.tsx › a11y` checks roles/attributes; keyboard-only flow is e2e D6.

**S3.13 Performance guard.** Day zoom over the default window (16 weeks) yields ≤ 16 × 8 columns; both virtualizers stay `useFlushSync: false`; cells memoised by `(rowKey, periodKey, cell, status)`; `personDayLoads` computed once per data change (`useMemo` on the chunk data), not per cell. Local smoke (not a gate): golden data, `zoom=day`, keyboard-repeat `ArrowRight` across 40 columns without dropped frames in the Chromium performance panel; record the observation in the S3 report (full measurement M11).

**S3.14 Remove M6's DAY-week skip + done-check (X27, G25).** Delete M6's "DAY week = read-only total" behaviour from every gesture and its tests:
- `rows.ts#cellEditability`: drop the `'dayWeek'` result and the `'dayWeek'` member of `Editability` (M9 relies on "DAY weeks editable since M7"); `rows.test.ts` "DAY cell → `dayWeek`" becomes "DAY cell → `ok`".
- `apply.ts`: remove `skippedDayWeek` from `planTyped`/`planCapacityKey` results and the `dayWeekReadOnly` single-cell toast; `paste.ts`/`fill.ts`: DAY weeks are no longer skipped (their writes go through S3.8); `shift.ts#planShift`: the "DAY-week cell → blocked" rule is replaced by `canShift` (S3.7). Update M6's `apply.test.ts` ("one DAY target among 4 → 3 writes + skippedDayWeek 1"), `paste.test.ts` ("a DAY target → skipped") and `shift.test.ts` ("a DAY week in the destination → blocked") to the M7 results.
- `useSaveAllocations.ts`: the `VALIDATION … DAY_WEEK` branch is gone (S3.8).
- `grep -rn "DAY_WEEK\|dayWeek\|skippedDayWeek" src/components/grid src/lib/grid` → nothing; report to the orchestrator, who deletes `th.grid.toast.dayWeekReadOnly`, `th.grid.errors.dayWeek` and the `'DAY_WEEK'` union member (§6; the string "สัปดาห์นี้มีแผนรายวัน" stays only as `th.grid.br24.title(1)`). Done-check: `pnpm vitest run --project unit src/lib/grid` · `pnpm vitest run --project ui src/components/grid` · `pnpm eslint src/components/grid src/lib/grid 'src/app/(app)/projects/[id]/plan'` · `pnpm typecheck` (own paths clean).

### 5.S4 — Authz rows, masking, golden day level, lock/race (test-engineer · owns `tests/authz/**`, `tests/golden/**`, `tests/integration/**`)

Starts right after G0 (depends on S0 only) and is written **from SPEC §3.2/§3.3 and §5.3 before S2 lands** (PLAN §4.1): red until S2, green at G2. Uses `createWorld({ with: ['dayAllocations'] })` (implies M6's `'allocations'` → `'tasks'` + `'timeOff'`; S0.9), `asUser`, `outcomeOf`/`outcomeOfCall`, `assignmentVersion`, `allocationRows`, `makeDayAllocations` (S0.9). Helpers outside `tests/authz|golden|integration` (e.g. a new factory) are **requests** to the orchestrator (S0 owns `tests/helpers/**`).

**S4.1 Authz rows (`tests/authz/rows/grid-day.ts`, `tests/authz/rows/allocations-day.ts`, registered in `tests/authz/rows/index.ts`; PERM-06, PERM-12, X41/X42/X44/X65).** Shared constants: `VIEW = { M: 'allow', L: 'allow', Me: 'allow', W: '404' }`, `ARCH = { M: '403', L: '403', Me: '403', W: '404' }`, `BAD = { M: '400', L: '400', Me: '400', W: '400' }`. Helper inside the row file:
```ts
const save = async (w: World, items: { a: { id: string }; changes: Change[] }[], onDayWeekConflict?: 'SCALE' | 'COLLAPSE') =>
  saveAllocations({ items: await Promise.all(items.map(async (i) => ({ taskAssignmentId: i.a.id, baseVersion: await assignmentVersion(i.a.id), changes: i.changes }))),
                    onDayWeekConflict, clientOpId: 'authz-m7' })
const grid = (projectId: string, qs: string) => GET(new Request(`http://t/api/grid/project/${projectId}?${qs}`), { params: Promise.resolve({ projectId }) })
const AUDIT = { entity: ALLOCATION_AUDIT_ENTITY, projectId: (w: World) => w.P.id }   // 'allocation', from src/server/services/allocations.ts (M6-D29)
```
Rows (full table in §7.2): `GR-D-ZOOM` `grid(P, 'from=2026-11-02&to=2026-11-16&zoom=day')` VIEW · `GR-D-EXPAND` `expand=2026-11-09` VIEW · `GR-D-ARCH` grid of A with `zoom=day` VIEW · `GR-D-BADQ` `expand=2026-11-10` BAD · `GR-D-MISSING` random v4 uuid → 404 ×4 · `AL-D-SPLIT` `save(w, [{ a: pLeafLead, changes: [DAY 2026-11-04 = 100] }])` allow M/L/Me, W 404, audit · `AL-D-SET` DAY `2026-11-11 = 25` on the pDay week · `AL-D-NEEDS` WEEK `2026-11-09 = 400`, no choice → `{ M: '409', L: '409', Me: '409', W: '404' }` · `AL-D-SCALE` same + `'SCALE'` allow, audit · `AL-D-COLLAPSE` WEEK `2026-11-09 = 250` + `'COLLAPSE'` allow, audit · `AL-D-CLEAR` WEEK `2026-11-09 = null` allow, audit · `AL-D-MIXED` WEEK `2026-11-09 = 300` + DAY `2026-11-10 = 50` in one item → `{ M: '400', L: '400', Me: '400', W: '404' }` (business validation runs after authz) · `AL-D-MAX` DAY `cd: 125` → BAD (zod precedes authz) · `AL-D-HIDDEN` items `[pLeafLead DAY 2026-11-04 = 50, qTaskCoworker DAY 2026-11-10 = 25]` → `{ M: 'allow', L: '404', Me: '404', W: '404' }` · `AL-D-ARCH` DAY on `aTaskMember` `2026-11-09 = 25` → ARCH · `AL-D-ARCH-COLLAPSE` WEEK `2026-11-09 = 50` + `'COLLAPSE'` on `aTaskMember` → ARCH. Every row also runs the generic "nobody → 401" and "mustChangePassword → 403" loops (M1 harness). Each `allow` + `mutates` pair asserts exactly one new `audit_log` row per changed assignment (X44); `AL-D-NEEDS` additionally asserts `allocationRows(pLeafLead, '2026-11-09')` unchanged and no new audit row (explicit `after` hook in the row, if the harness supports `verify`; else a separate `it` in `tests/integration/allocations-needs-choice.int.test.ts`).

**S4.2 Masking day cases (`tests/authz/masking.int.test.ts › describe('grid day (M7)')`, §3.3, X29, X30).** World `with: ['dayAllocations']` (includes `'timeOff'`):
- as **member**, `grid(P, 'from=2026-11-02&to=2026-11-16&expand=2026-11-09&includeOthers=1')`: `people[coworker].otherProjects['D:2026-11-10'].total === 75`; `assertNoLeak(body, [w.Q.name, w.tasks.qTask.name, w.Q.id, w.tasks.qTask.id, w.assignments.qTaskCoworker.id, w.assignments.qTaskOutsider.id])`.
- as **lead**, `grid(P, 'from=2026-11-02&to=2026-11-09&zoom=day')`: `w.timeOff.member` (2026-11-02, type 'อบรม-โลก') appears only as `{ …, label: th.masking.leave }`; `assertNoLeak(body, ['อบรม-โลก', 'โน้ตของ member', w.timeOff.member.id, w.leaveTypes.training.id])` (M5 world keys; C16); every D cell `warn` holds codes only.
- as **outsider**, the same URL → 404 and `assertNoLeak(body, [w.P.name, w.tasks.pLeaf.name, w.tasks.pCoworker.name, w.P.id])`.
- golden block (F1 + `addDayExample`): Ivy (not in Mobile) → `GET /api/grid/project/<Mobile>?…&zoom=day` → 404 and no `'Kickoff workshop'` in the body; Jack (Mobile LEAD) with `includeOthers=1&expand=2026-09-07` → `otherProjects` D keys for Mint contain only numbers.

**S4.3 Golden day level (`tests/golden/day-level.int.test.ts`, r8 §4.7/§6.7/§6.8/§6.10).** Fresh `truncateAll` + `seedGolden` + fixture per `describe`; reads through the grid service (`buildChunk` via the route) as the manager, then pure checks with S1's functions:
- derived values exactly the r8 §4.7 table (F1 Ivy 09-28 `50×5`; F1 Peter 10-12 `75×5`; F2 Peter/Ivy 10-19 `63,63,62,62,0`; F2 Cindy `94,94,94,93,0`; F2 Jack/Mint `125×4,0`; F3 Peter 10-05 `0,0,167,167,166`; F4 Cindy 10-12 `0,0,0,125,125`); `Σ D cells = W cell` for every assignee and week (§5.3 invariant on real data).
- day levels via `overloadLevel` against `people[u].capacity['D:…']`: F2 Jack and Mint 10-19…10-22 OVER (125/100); F3 Peter 10-07…10-09 OVER; F4 Cindy 10-15/10-16 RISK (tentative); F1 → no day above OK in any expanded week of `[2026-08-31, 2027-01-04)` (`zoom=day`, 18 weeks, one request per 8-week chunk).
- materialisation numbers (through `saveAllocations` as each project's LEAD): F2 Jack Mon = 1.0 → `[100,100,100,100,75]`; F3 Peter Wed = 0.5 → `[100,33,50,100,100]`; F4 Cindy Thu = 1.0 → `[25,0,0,100,100]` — every stored day ≤ 100 (R20) and the week total equals `W − derived + x`.
- `addDayExample` over F1: all projects **19 600 / 11 725** cd, Mobile **5 975**, Jack week 2026-09-07 = 300, Mint 50 (r8 §6.10); the Kickoff rows render as DAY cells `{ cd: 50, resolution: 'DAY', derived: false }` on `D:2026-09-07` in `zoom=day`.
- F1 week-level totals unchanged by M7 (re-run M6's F1 grid assertion helper: 19 500 / 11 625).

**S4.4 Lock-first and race (M6's `tests/integration/allocations-race.int.test.ts`, new `describe('M7 day paths')`, BR-20b, r2 T9/T9-fix, X65).** M6's four cases (version lock, exclusion backstop `23P01`, same-tx order `P0001`, deadlock-free) stay; M7 adds the day conversions. Two independent `db.transaction` calls on the integration DB (postgres.js pool `max ≥ 2`, reuse M6's pause-before-commit hook):
- `BR-22 vs BR-22` — A: `services.allocations.save(txA, lead, { pLeafLead DAY 2026-11-04 = 100 })`, then `await gate` before returning (commit delayed); B (started after A's lock, `setTimeout(…, 50)`): same input with the same `baseVersion` → blocks on `FOR UPDATE`, resumes after `gate.resolve()` → `ConflictError VERSION_CONFLICT`; final rows of week 2026-11-02 are DAY only (`allocationRows`), no WEEK row.
- `WEEK vs DAY` — A writes `WEEK 2026-11-09 = 300` + `'COLLAPSE'` (pDay week), B writes DAY `2026-11-12 = 50` with the same base → B `VERSION_CONFLICT`; the week holds exactly one granularity.
- `lock order` — batch X = `[pLeafLead, pCoworker]` and batch Y = `[pCoworker, pLeafLead]` (as manager) started concurrently → no `40P01` (deadlock); one commits, the other `VERSION_CONFLICT` (M6 sorts ids).
- `backstop` — raw SQL inside one tx: INSERT DAY before DELETE WEEK for the pWeek week → `P0001 WEEK_DAY_CONFLICT` (proves the service's DELETE-first order matters; r2 T7d).
Each test ends with `SELECT task_assignment_id, week_start FROM allocations WHERE week_start >= '2026-11-02' AND week_start < '2026-11-16' GROUP BY 1, 2 HAVING count(DISTINCT granularity) > 1` → 0 rows.

**S4.5 Older tests under `tests/**` (C17).** Update only what M7 changes on purpose:
- `tests/authz/rows/allocations.ts` row **`AL-DAYWEEK`** (pChildAMember WEEK 2026-10-12 = 150, no choice): `expect` `{ M: '400', L: '400', Me: '400', W: '404' }` → **`{ M: '409', L: '409', Me: '409', W: '404' }`** (`NEEDS_CHOICE`), `spec` → `'X27 / M6-D34 → BR-24 NEEDS_CHOICE (M7-D3)'`, still `mutates: false`; keep the key so M6's §7.2 reference stays valid. `AL-COLLAPSE` (same week + `'COLLAPSE'`) is unchanged.
- M6's `masking.int.test.ts › grid (M6)` block keeps passing unchanged (the extra `D:` keys appear only with `expand`/`zoom`).
- Never weaken an M2–M6 assertion. Done-check: `pnpm vitest run --project integration tests` (report which rows stay red until S2 lands).

### 5.S5 — E2E `m7-daily` (test-engineer · owns `e2e/**`)

Runs after S2, S3 and S4. The integrator runs Playwright at G2; the stream itself only writes specs and page objects (`pnpm exec playwright test --list` to check they load).

**S5.1 Page objects (`e2e/pages/grid.ts`, extend M6's `GridPage` — m06 S6.1).** Reuse M6's members as they are: `rowKeyOf(taskName, personName?)`, `cell(rowKey, week)` (= `cell-<rowKey>-W:<week>`, which is the narrow **รวม** column when that week is expanded), `total(rowKey)` (M6's sticky all-time row total — not the รวม week column), `footerLoad(periodKey)`, `footerCapacity(periodKey)`, `typeInto(cell, text, commit?)`, `paste(tsv)`, `press(key)`, `waitSaved()`, `toast(text)`, `countServerActions(fn)`. Add only (locators by test id or accessible name, never by `aria-rowindex`/`nth()` — C27; M8/M9 extend the same object):
```ts
zoom(level: 'week' | 'day'): Promise<void>                 // getByRole('group', { name: th.grid.toolbar.zoom }).getByRole('button', { name: th.grid.toolbar[level === 'week' ? 'zoomWeek' : 'zoomDay'] })
weekHeader(week: ISODate): Locator                          // getByRole('button', { name: th.grid.day.expandWeek(formatWeekHeader(week)) })
dayGroupHeader(week: ISODate): Locator                      // getByRole('button', { name: th.grid.day.collapseWeekView(formatWeekHeader(week)) })
dayCell(rowKey: string, date: ISODate): Locator             // getByTestId(`cell-${rowKey}-D:${date}`)
collapseButton(rowKey: string, week: ISODate): Locator      // within cell(rowKey, week): getByRole('button', { name: th.grid.day.collapseToWeek })
cellMenu(): Locator                                         // getByRole('menu', { name: th.grid.day.cellMenu })
br24(): { root: Locator; scale(): Promise<void>; collapse(): Promise<void>; cancel(): Promise<void> }   // getByRole('dialog') filtered by th.grid.br24.title text; buttons by th.grid.br24.scale/collapse/cancel
```
`e2e/fixtures.ts` already has `resetDb(fixture?, { syntheticGrid, dayExample })` and `projectIdByName` (M6 + S0.9).

**S5.2 `e2e/m7-daily.spec.ts`** — scenarios D1–D7 exactly as §7.3. `test.describe.configure({ mode: 'serial' })` inside each describe that chains state; `test.beforeAll(async () => { await resetDb(…) })` per describe (never `beforeAll(resetDb)` / `beforeAll(resetDb(...))`; options go in the 2nd argument — M1, X91); `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; server `APP_NOW` from the webServer env (X45/X46); `loginAs(page, …)` via the API; strings from `th` and numbers through `formatCd` / `formatThaiDate` / `formatWeekHeader` imported from `src/domain/units.ts` / `src/lib/format.ts`; no fixed sleeps (wait on `waitSaved()`, dialog/toast visibility, `aria-expanded`).

**S5.3 Update older specs.** Run `m0`–`m6` against the M7 build. Expected adjustments in `e2e/m6-grid.spec.ts`, through page objects only (never weaken an older assertion):
- **G1** "`[สัปดาห์]` pressed and no วัน option" → "`[สัปดาห์]` pressed and `[วัน]` present, not pressed" (FR-802 now complete).
- **G6** (X27 → BR-24): after the FR-612 apply `W:2026-11-09` still shows `2.0` + ⋯ and the same tooltip; range typing `1` over `W:2026-11-02…W:2026-11-16` now sets 11-02 and 11-16 to `1.0` **and opens the BR-24 dialog once for 11-09** (`th.grid.br24.title(1)`, `change('2.0', '1.0')`) instead of the `dayWeekReadOnly` toast → `br24().cancel()` → 11-09 stays `2.0` + ⋯; Delete on the DAY week now **clears it** (M7-D5, no dialog) → `ControlOrMeta+KeyZ` restores `2.0` + ⋯ (complete 7-day snapshot); Delete on 11-16 clears it (unchanged).
- Column selection already uses Shift+click in M6 (M6-D33) — no change; M6's undo scenario (G5, AC-805) is unchanged.

**S5.4 Done-check (integrator, G2).** `pnpm test:e2e` — full suite m0…m7.

---

## 6. Integration (orchestrator)

**Expected requests (apply after Build, step 4):**

| From | Path · change |
|---|---|
| Orchestrator (after S2 **and** S3 report no use, S2.10/S3.14) | **`DAY_WEEK` removal (G25, M7-D28):** delete `'DAY_WEEK'` from `SaveValidationReason` in `src/lib/contracts/grid.ts`, and `th.grid.errors.dayWeek` + `th.grid.toast.dayWeekReadOnly` from `src/i18n/th.ts`; then `grep -rn "DAY_WEEK\|dayWeek\b\|dayWeekReadOnly\|skippedDayWeek" src tests e2e` must print nothing and `pnpm typecheck` stays green |
| S3 | `src/i18n/th.ts` · any key outside `grid.toolbar/day/br24/warn/glyph` and `overload` (none expected) |
| S3 | `src/lib/grid/merge.ts` is S3's own file (M6) — M6's `GridModel.periods` already carries the merged periods (m06 S3.2); if the real code lacks it, S3 adds it additively and reports (S0.1 map) |
| S2 | `src/lib/contracts/grid.ts` · only if the result type needs a field S0 missed (e.g. `results[].weeks` doc comment); no shape change expected |
| S2 | `src/i18n/th.ts` · keys outside `errors`/`audit` (none expected) |
| S4 | `tests/helpers/factories.ts` · e.g. `setSchedule(userId, weekdays)` / `deactivate(userId, on)` if M1–M6 lack them; a `deferred()` gate helper may stay local to `tests/integration` |
| S5 | `e2e/fixtures.ts` · none expected (S0.9 delivered `resetDb(fixture?, { syntheticGrid, dayExample })`; `projectIdByName` is M6's) |
| S5 | data-testids / accessible names missing in `src/components/grid/**` → request to S3 (M6 pattern) |

**Wiring order:** S0 (G0, alone) → S1 ∥ S4 → S2 ∥ S3 (S4 continues) → apply requests → S5 → G2. S4's rows go green only when S2 has landed; S5 starts when S2, S3 and S4 report green G1.

**Commands (G2):**
```bash
pnpm db:up
pnpm db:migrate
pnpm db:generate             # → "No schema changes, nothing to migrate" (M7 has no schema change)
pnpm check                   # typecheck + lint + unit + ui + integration (authz, masking, golden day level, lock/race) + domain coverage ≥ 95 %
pnpm test:e2e                # full suite m0…m7 against the production build (integrator only)
# hard-rule greps (must print nothing):
grep -rn "new Date(" src/domain src/lib/grid --include=*.ts | grep -v "todayBangkok"
grep -rn "localStorage" src/components/grid src/lib/grid
grep -rn "toFixed\|parseFloat" src/domain src/lib/grid src/server/services/allocations.ts src/server/services/grid.ts src/server/services/day-context.ts
grep -rn "DAY_WEEK\|loadWeekCtx\|skippedDayWeek" src tests e2e
grep -rn "refresh()" src/server/actions/allocations.ts
git diff --exit-code CLAUDE.md SPEC.md docs/
# every allocations query bounded (manual read of the matches):
grep -n "allocations" src/server/repo/allocations.ts src/server/services/grid.ts src/server/services/allocations.ts
pnpm seed:golden --fixture=F2 && pnpm dev   # manual smoke §7.4 (integrator only)
```

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Tests |
|---|---|
| **AC-804** (§12 M7) | unit `allocation.day.test.ts › materializeWithEdits › AC-804`, `planWeek` row 3 · int `allocations-day.int.test.ts › AC-804` · int `grid-day.int.test.ts › derived` · golden `day-level › F1 Ivy` · e2e **D1** |
| **§5.3 invariants** (§12 M7 "Unit: invariant ทั้งหมด") | unit `allocation.day.property.test.ts` P1–P8 (Σ distribute = t; expand → collapse identity; displayed day sum = week total; days ≤ 100; BR-22 total; SCALE total; snapshot round trip; no choice when not needed) · `src/lib/grid/day.test.ts › Σ day cells = total` · golden `day-level › Σ D = W` |
| AC-805 continuity (day level; AC owned by M6) | unit `undo.day.test.ts` · int `› BR-23 via COLLAPSE` (7-day replay) · e2e D2 (undo after SCALE, no dialog), D3 (one undo for two weeks), D4 (undo/redo + reload) |
| AC-801…803 regression on M7's columns (owned by M6) | unit `kinds.test.ts`, `day-input.test.ts` · e2e m6-grid unchanged (S5.3) · e2e D6 (paste on day cells) |
| FR-802 (day part) | int `grid-day › zoom=day` · ui `ZoomToggle.test.tsx` · e2e D5 |
| FR-803 | ui `GridHeader.day.test.tsx` · unit `expansion.test.ts`, `keymap.test.ts` · e2e D1, D6 (no server action during view changes) |
| BR-20 / BR-20a | int `grid-day › derived`, `› DAY week collapsed` · ui `GridCell.day.test.tsx` · parity `grid-day-parity.int.test.ts` |
| BR-20b | int `allocations-race.int.test.ts › M7` (4 cases + the "no week with two granularities" query) · int `allocations-day › AC-804` (DELETE first) |
| BR-21 / BR-21a | unit `spreadWeek` table · int `grid-day › BR-21a` · parity test · golden derived table |
| BR-22 | unit `materializeWithEdits` table · int `› AC-804`, `› spill F2/F3/F4`, `› equal value` · golden materialisation · e2e D1, D7 |
| BR-23 | unit `collapseDays`, `collapse.test.ts` · int `› BR-23 via COLLAPSE` · authz AL-D-COLLAPSE · e2e D4 |
| BR-24 | unit `scaleDays`, `planWeek` rows · unit `br24.test.ts` · ui `Br24Dialog.test.tsx` · int `describe('BR-24')` · authz AL-D-NEEDS/SCALE/COLLAPSE · e2e D2, D3 |
| BR-26 (DAY part) | unit `src/lib/schemas/allocations.test.ts › M7` · unit `day-input.test.ts` · authz AL-D-MAX · e2e D6 (1.5 rejected) |
| M7-D7 DEVIATION (clamp-and-spill) | unit `clampAndSpill`, P4 · int `› spill F2/F3/F4`, `SCALE 400/700` · golden materialisation · e2e D7 |
| BR-40 / BR-45 (day level, X06/X67) | unit `overload.test.ts` · unit `day-footer.test.ts` · ui `Footer.day.test.tsx` · golden `day-level › day levels` · e2e D7 |
| BR-42 (day part) | int `grid-day › leave later`, `time-off.int.test.ts › BR-42 DAY case` |
| BR-50 (day level) | unit `day-footer.test.ts › completed week` |
| FR-804 / FR-807 (day cells) | unit `day-input.test.ts` · ui `GridCell.day.test.tsx` · e2e D7 (🎌 header, grey Friday) |
| §7.4 NEEDS_CHOICE / onDayWeekConflict | unit `src/lib/schemas/allocations.test.ts`, `action.test.ts` · int `describe('BR-24')` · authz AL-D-NEEDS |
| X29 (day keys) | int `grid-day › otherProjects day keys` · mask `grid day (M7)` |
| X76 (blocker badge kept) | int `grid-day › blockers kept` |
| KEY-07 / X07 | unit `shortcuts.test.ts`, `keymap.test.ts › M7` · e2e D6 |
| A11Y-2b (expand/collapse) | ui `PlanGrid.day.test.tsx › a11y`, `CellMenu.test.tsx` · e2e D6 |
| M8/M9 reuse contracts (C28, C38, C39) | ui `CellMenu.test.tsx › items` · unit `day-footer.test.ts › extra / masked kind skipped` · unit `day.test.ts › spreadDayLoads` · int `repo/allocations.int.test.ts › dayLoadsForProjects` |
| X27 flip (M6 assertions changed on purpose) | int `allocations.int.test.ts › X27 / M6-D34 → M7 BR-24` · authz AL-DAYWEEK 409 · e2e m6 G6 (S5.3) |
| Seed A.2 `addDayExample` | int `scripts/lib/fixtures.int.test.ts › addDayExample` · golden `› addDayExample` · e2e D5 |
| FR-1201 / X44 | int `› audit` · authz audit assertions for every allow + mutates row |
| PERM-06 / PERM-12 | authz rows §7.2 · mask `grid day (M7)` |

### 7.2 Authz matrix rows added (`M` manager · `L` lead · `Me` member · `W` outsider)

World `with: ['dayAllocations']` (S0.9; implies M6's `'allocations'`): pWeek = 2026-11-02 WEEK 250 and pDay = 2026-11-09 DAY `{11-09:100, 11-10:100, 11-11:50}` on `pLeafLead`; aDay on `aTaskMember` (archived A); M6's `qTaskCoworker` (coworker on Q's `qTask`) gains DAY `{11-10:75}`. Mutating `allow` rows declare `audit: AUDIT` (entity `'allocation'`, X44).

| ID | PERM | Action / route (input) | M | L | Me | W | Mutates (audit) |
|---|---|---|---|---|---|---|---|
| GR-D-ZOOM | 06 | `GET /api/grid/project/{P}?from=2026-11-02&to=2026-11-16&zoom=day` | allow | allow | allow | 404 | no |
| GR-D-EXPAND | 06 | same with `expand=2026-11-09` | allow | allow | allow | 404 | no |
| GR-D-ARCH | 06, X42 | `GET /api/grid/project/{A}?…&zoom=day` | allow | allow | allow | 404 | no |
| GR-D-BADQ | 06, X41 | `expand=2026-11-10` (not a Monday) | 400 | 400 | 400 | 400 | no |
| GR-D-MISSING | 06 | random v4 project id, `zoom=day` | 404 | 404 | 404 | 404 | no |
| AL-D-SPLIT | 12 | `saveAllocations` DAY `2026-11-04 = 100` on pWeek (BR-22) | allow | allow | allow | 404 | yes (1 row) |
| AL-D-SET | 12 | DAY `2026-11-11 = 25` on pDay | allow | allow | allow | 404 | yes |
| AL-D-NEEDS | 12 | WEEK `2026-11-09 = 400`, no choice | 409 | 409 | 409 | 404 | no write, no audit |
| AL-D-SCALE | 12 | WEEK `2026-11-09 = 400` + `SCALE` | allow | allow | allow | 404 | yes |
| AL-D-COLLAPSE | 12 | WEEK `2026-11-09 = 250` + `COLLAPSE` (BR-23) | allow | allow | allow | 404 | yes |
| AL-D-CLEAR | 12 | WEEK `2026-11-09 = null` on pDay | allow | allow | allow | 404 | yes |
| AL-D-MIXED | 12 | WEEK `2026-11-09 = 300` + DAY `2026-11-10 = 50` in one item | 400 | 400 | 400 | 404 | no |
| AL-D-MAX | 12 | DAY `2026-11-04 = 125` (zod) | 400 | 400 | 400 | 400 | no |
| AL-D-HIDDEN | 12, X65 | items pLeafLead DAY `2026-11-04 = 50` + qTaskCoworker DAY `2026-11-10 = 25` | allow | 404 | 404 | 404 | yes (2 rows for M) |
| AL-D-ARCH | 12, X42 | DAY `2026-11-09 = 25` on aTaskMember | 403 | 403 | 403 | 404 | no |
| AL-D-ARCH-COLLAPSE | 12, X42 | WEEK `2026-11-09 = 50` + `COLLAPSE` on aTaskMember | 403 | 403 | 403 | 404 | no |
| AL-DAYWEEK (M6 row, flipped in S4.5) | 12, X27, M7-D3 | pChildAMember WEEK `2026-10-12 = 150`, no choice | 409 | 409 | 409 | 404 | no |
| (loop) | — | every row as nobody | 401 | 401 | 401 | 401 | — |
| (loop) | — | every row as a mustChange user | 403 | | | | — |

No new action exists (M7-D2), so no new PERM id; PERM-23 is untouched.

### 7.3 E2E scenario outline (`e2e/m7-daily.spec.ts`)

Deterministic per PLAN §4.5: production build, `APP_NOW=2026-09-30T10:00:00+07:00`, `ALLOW_TEST_HOOKS=1`; `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; `loginAs` via the API; selectors from `th`; numbers via `formatCd`/`formatThaiDate`/`formatWeekHeader`; page objects from S5.1; no sleeps. Row keys come from M6's `GridPage` resolver (`rowKeyOf(taskName, person)`). D1 → D4 → D2 → D3 run serially on one `resetDb()`.

| # | Setup / actor | Steps | Assertions |
|---|---|---|---|
| D1 (AC-804, FR-803, BR-22, §8.4) | `resetDb()` (F1) · ivy | open POS แผนงาน; `countServerActions(() => weekHeader('2026-09-28').click())`; then `typeInto(dayCell(ivy, '2026-09-30'), '1')`; `waitSaved()`; reload; expand 09-28 again | 0 server actions for the expand; `dayGroupHeader` text `formatThaiDate('2026-09-28','medium')` + 5 weekday labels; before the edit five cells "0.5" with `data-derived="true"` and รวม "2.5"; after: รวม "3.0", 09-30 "1.0", the other four "0.5" without `data-derived`; no dialog; after reload the collapsed week cell shows "3.0" with the ⋯ marker; re-expanded values still solid |
| D4 (BR-23, AC-805 continuity) | continue · ivy | `collapseButton(ivy, '2026-09-28').click()`; toast `th.undo.undo`; then `ControlOrMeta+Shift+KeyZ`, `ControlOrMeta+KeyZ` (focus on body); reload + expand | toast `th.grid.day.collapsedToast`; days "0.6" dashed, รวม "3.0", no dialog; undo → `[0.5, 0.5, 1.0, 0.5, 0.5]` solid; redo → dashed 0.6; undo → solid again; after reload solid values (server state = undo state) |
| D2 (BR-24 SCALE, undo without dialog) | continue · ivy | `typeInto(cell(ivy, '2026-09-28'), '2')` (รวม column); `br24().scale()`; `waitSaved()`; `ControlOrMeta+KeyZ` | dialog title `th.grid.br24.title(1)`, texts `breakdown('จ 0.5 · อ 0.5 · พ 1.0 · พฤ 0.5 · ศ 0.5')`, `change('3.0','2.0')`, `scalePreview('จ 0.3 · อ 0.3 · พ 0.7 · พฤ 0.3 · ศ 0.3')`; cell `data-pending-choice="true"` while open; after SCALE days `0.3, 0.3, 0.7, 0.3, 0.3` solid, รวม "2.0", Mon tooltip "0.34"; undo → `[0.5, 0.5, 1.0, 0.5, 0.5]` and **no dialog** |
| D3 (BR-24 COLLAPSE, Cancel, one dialog for N weeks) | continue · ivy | `typeInto(รวม 09-28, '4')` → `cancel()`; again `'4'` → `collapse()`; expand 10-05; `typeInto(dayCell 10-05, '0.5')`; `typeInto(dayCell 09-28, '1')`; collapse both views (`ControlOrMeta+ArrowUp`); select week cells 09-28 + 10-05 (`Shift+ArrowRight`), type `2` + Enter → `collapse()`; `ControlOrMeta+KeyZ` | Cancel: 0 server actions, รวม back to "3.0"; COLLAPSE: days "0.8" dashed, รวม "4.0"; 10-05 week รวม "1.5" (`[0.5,0.3,0.3,0.3,0.3]`, 50/25 cd); 09-28 รวม "4.2"; one dialog `title(2)` with two `pairLine` texts; both weeks "2.0" after COLLAPSE, ⋯ gone; one undo → "4.2" and "1.5" with ⋯ again, no dialog |
| D5 (FR-802 day zoom, seed A.2) | `resetDb(undefined, { dayExample: true })` · jack | Mobile แผนงาน; `zoom('day')`; scroll to week 2026-09-07; reload; `zoom('week')` | no week-header toggle buttons in day zoom; Kickoff workshop rows Jack and Mint: `D:2026-09-07` "0.5" solid; Jack "ออกแบบ flow ใหม่" 09-07…09-11 "0.5" dashed; footer load `D:2026-09-07` "1.5", `D:2026-09-08` "0.5", footer capacity `D:2026-09-07` "2.0"; after reload still day zoom (preference); week zoom: Kickoff Jack `W:2026-09-07` "0.5" with ⋯, footer `W:2026-09-07` "3.5" |
| D6 (keyboard only, KEY-07, A11Y-2b, same-kind) | `resetDb()` · ivy | focus `cell(ivy, '2026-10-05')`; `ControlOrMeta+ArrowDown`; `h`; `ArrowRight`; type `1.5` + Enter; `Escape`; synthetic paste TSV `0.5\t0.5\t0.5` at `D:2026-10-08`; `Shift+F10` → `Enter` on `th.grid.day.collapseToWeek`; `ControlOrMeta+ArrowUp` | expand/collapse: 0 server actions, `aria-expanded` true/false; focus lands on `D:2026-10-05` then back on `W:2026-10-05`; `h` → "0.5", รวม "1.5"; `1.5` → `aria-invalid` + `th.grid.errors.maxDay`, nothing saved; paste writes Thu + Fri "0.5", toast `th.grid.day.mixedKinds`, รวม "2.0"; collapse-to-week toast `collapsedToast`; final week cell "2.0" without ⋯ |
| D7 (F2: overload glyphs, spill, holiday) | `resetDb('F2')` · jack | Mobile แผนงาน; expand 2026-10-19; hover Fri header; `typeInto(dayCell(jack, '2026-10-19'), '1')`; `waitSaved()` | Fri header 🎌 + tooltip `th.grid.header.holiday(<F2 holiday name from golden-fixtures.json expected.F2.setup>)`, Fri cells grey and empty; Jack Mon–Thu "1.3" dashed with 🔴 (accessible text `th.overload.level.OVER`); footer `D:2026-10-19` `data-tone="over"` + 🔴 + tooltip `peopleOver('Jack, Mint')`; after the edit toast `th.grid.day.splitClampedToast` (+ `th.grid.warn.nonWorkingDay`); Mon–Thu "1.0" solid without 🔴, Fri "0.8" with ⚠ and 🔴; รวม "4.8"; footer `D:2026-10-19` still 🔴 (Mint 1.3) |

### 7.4 Golden / perf / manual checks

- Golden: `tests/golden/day-level.int.test.ts` (S4.3) — r8 §4.7 derived table, day levels, materialisation numbers, Kickoff totals 19 600 / 11 725; M6's F1 grid assertions unchanged (19 500 / 11 625).
- Perf (smoke, not a gate): `GET /api/grid/project/<DW>?zoom=day` for 8 weeks on golden data returns in < 300 ms locally (log the timing in the S2 report); keyboard repeat across day columns without visible lag (S3.13). The §9 scale measurement is M11.
- Manual (integrator, `pnpm seed:golden --fixture=F2` + `pnpm dev`): Thai Kedmanee layout — `Cmd+↓`/`Cmd+↑`, `f`, `h`, digits work (e.code); dark mode — dashed derived values, grey holiday and stripes readable; screen reader (VoiceOver) reads "ค่ากระจายจากแผนรายสัปดาห์" on a derived cell and the 🔴 text; BR-24 dialog: Tab order scale → collapse → cancel, focus returns to the cell.

---

## 8. Definition of done

- [ ] SPEC §12 M7 delivered: BR-20 … BR-24 (with the M7-D7 spill), inline expand/collapse (header click, `Cmd+↓`/`Cmd+↑`), day zoom, BR-24 dialog (one dialog for N weeks), dashed derived values, day-level overload (BR-40 glyphs, BR-45 tones on footer day cells); **AC-804** passes in unit, integration and e2e (D1).
- [ ] Every §5.3 invariant has a fast-check property (S1.9 P1–P8) and the domain coverage gate (`src/domain/**` ≥ 95 %) holds with `overload.ts` included.
- [ ] `pnpm check` green (typecheck, lint, unit, ui, integration incl. authz matrix, masking, golden day level, lock/race); `pnpm db:generate` → "No schema changes"; no new dependency.
- [ ] e2e `m7-daily` D1–D7 pass, plus every older spec (m0–m6) — full suite green; S5.3 updates done through page objects only.
- [ ] Authz rows §7.2 exist (PERM-06 grid day reads, PERM-12 every new save path incl. NEEDS_CHOICE/SCALE/COLLAPSE/hidden/archived); each mutating `allow` asserts one audit row per changed assignment; NEEDS_CHOICE writes nothing.
- [ ] Masking: grid day responses contain no Q names/ids (otherProjects D keys = numbers only) and no leave type/note (S4.2).
- [ ] Hard rules: allocation writes lock the assignment first and DELETE before INSERT in one tx; every `allocations` query has a `week_start` predicate; integer cd only (no `toFixed`/`parseFloat` on loads); no JS `Date` on plan dates; all UI text in `th.ts`; no `localStorage` (expansion in memory, zoom in `user_preferences`); state never by colour alone (glyph + text on every tone/derived/warn state).
- [ ] View actions never write data (D1, D6: 0 server actions); undo/redo never opens the BR-24 dialog (D2, D3; `undo.day.test.ts`); BR-23 collapse uses an undo toast, no confirm; no new confirm dialog anywhere.
- [ ] M6's "DAY week is read-only" skip and toast are gone from every gesture (S3.14); `'DAY_WEEK'`, `th.grid.errors.dayWeek`, `th.grid.toast.dayWeekReadOnly` and `loadWeekCtx` no longer exist (`grep` in §6 prints nothing); AL-DAYWEEK expects 409 and `allocations.int.test.ts › X27` expects `NEEDS_CHOICE`; M6's task rows still carry `blockers` and `completedWeek` (X76).
- [ ] No M6 name redeclared or renamed (M7-D28): `buildColumns`/`GridColumn`/`WEEK_W`/`HEADER_ROWS`/`FOOTER_ROWS`, `gridQuerySchema` (optional `from`/`to`), `VERSION_CONFLICT { current }`, `snapshotOf(cell, taskAssignmentId, week)`, world `coworker`/`pCoworker`/`qTaskCoworker`; M8/M9 extension points in place (`CellMenu.items?`, `personDayLoads` `extra`, `repo.allocations.dayLoadsForProjects` with `projectIds?`, `loadDayData`).
- [ ] No `any`, `@ts-ignore` or `eslint-disable` without a reason comment.
- [ ] `PROGRESS.md` updated (§10), Deviation M7-D7 recorded; commit + tag done.

---

## 9. Risks and gotchas

| # | Risk / pitfall | Mitigation (step) |
|---|---|---|
| R1 | Derived display (1.3) differs from stored days after spill (1.0 + spill) — users think the plan changed by itself | toast `splitClampedToast` + warnings; display stays pure BR-21 until the user edits (M7-D7/D8, S3.6) |
| R2 | Client and server spread values drift (different capacity data or rounding) | one pure `src/lib/grid/day.ts` + one server `day-context.ts`; parity test on every r8 §4.7 week (M7-D25, S2.8) |
| R3 | BR-20b race: the trigger cannot see uncommitted rows (r2 T9) | lock `FOR UPDATE OF ta` in id order before any allocation read; race tests (S2.4, S4.4) |
| R4 | INSERT before DELETE inside the tx raises P0001 (r2 T7d) | `deleteWeek` always first (M7-D22); backstop test (S4.4) |
| R5 | Partial undo snapshots after COLLAPSE give 350 instead of 250 (r5 §10.4) | DAY snapshots always carry 7 days; P7 property; `undo.day.test.ts` (S1.9, S3.9) |
| R6 | Undo/redo or collapse triggering the BR-24 dialog (loops, surprise prompts) | replays use `COLLAPSE`/DAY snapshots; P8 property; e2e D2/D3 assert no dialog (S3.9) |
| R7 | The save queue merges changes with different `onDayWeekConflict`, or WEEK + DAY for one week | queue keyed by choice, flush before switching granularity (M7-D4/D6, S3.8); server rejects `MIXED_WEEK_AND_DAY` (S2.5) |
| R8 | Stale cache → client misses a DAY week → server `NEEDS_CHOICE` | same dialog as fallback, resend with fresh baseVersions (S3.8) |
| R9 | `VERSION_CONFLICT` while the dialog is open | dialog closes, pairs reverted (M7-D26, S3.8) |
| R10 | TanStack Virtual keeps stale column sizes (estimateSize is not a memo dependency, r4 §14) | `getItemKey` memoised on the columns array; `measure()` on width-only changes (S3.5) |
| R11 | Expanding one week refetches every chunk (expand list in every key) | per-chunk `expand` (M7-D24, S3.2) |
| R12 | Day-zoom payload grows (200 rows × 56 days) | zeros omitted; `D:` capacity keys only for expanded/DAY weeks (M7-D19); `staleTime` 60 s; perf smoke (§7.4) |
| R13 | Largest remainder not monotone → committed > total on a day for other-project loads | spread committed and tentative parts separately (M7-D27, S2.3) |
| R14 | Plain header click toggles expansion while Shift+click selects the column | M6 already reserved the plain click (M6-D33); `GridHeader.day.test.tsx` asserts both (S3.3) |
| R15 | Thai keyboard layout: `e.key` is Thai, `Cmd+↓` and `f`/`h` break | `e.code` first (X49, S3.3/S3.6); manual QA (§7.4) |
| R16 | SCALE results not multiples of 25 cd (34/33) look like a BR-27 violation | BR-27 applies to typed input only (r5 E10); `numeric(4,2)` stores 0.34 exactly; tooltip shows 2 decimals |
| R17 | Masking leak through `otherProjects` D keys or the `TIME_OFF` flag | numbers/codes only; leak tests with distinctive strings (S4.2) |
| R18 | Weekend columns appear only after the chunk loads → layout jump | Mon–Fri placeholders + `aria-busy`; Sat/Sun inserted with `measure()` (S3.1/S3.2) |
| R19 | M6's real names differ from this plan's expectations | S0.1 name map (taken from the reviewed m06); M6's names win; S0 report lists differences before Build |
| R22 | `planWeek` checks the Σ no-op before `COLLAPSE` → BR-23 collapse silently does nothing | m06 S1.4/M6-D4 already put `COLLAPSE` first (with an M6 test); S1.8 keeps the order (M7-D2); `planWeek` row "WEEK 300 + COLLAPSE → WEEK 300, changed"; P7 WEEK-snapshot property; int `› BR-23 via COLLAPSE` |
| R23 | Removing `'DAY_WEEK'` from the shared union breaks G0/G1 while M6 code still uses it | S0 leaves the union; S2/S3 delete uses; orchestrator removes the member last (§6) |
| R20 | Cross-year week (2026-12-28 … 2027-01-03) mis-assigned | server computes `week_start` (repo test S2.1); DB check is the backstop (r5 M7-13/14) |
| R21 | SPEC-internal conflict BR-22/BR-24 vs BR-26 + DDL | **DEVIATION** M7-D7 recorded in PROGRESS › Deviations; clamp-and-spill everywhere (S1.3, S2.4) |

---

## 10. Close-out

**PROGRESS.md updates:**
- Milestone table: M7 ✅ with date, commit hash and tag `m7`.
- Decisions: copy §3.1 (X04, X06, X07, X18, X27, X28, X29, X30, X40–X42, X44–X47, X49, X51, X53, X55, X56, X59, X65, X67, X76, X82, X83, X85–X87, X90, X91 as they apply) and §3.2 (M7-D1 … M7-D28).
- Deviations: **M7-D7** — what: stored DAY values are clamped at 1.00/day and the excess spills (BR-22 and BR-24 SCALE); why: BR-26 and the DDL check `person_days <= 1` forbid the literal results for golden F2–F4 and SCALE above capacity; instead: tiered spill with a warning toast, sums preserved, `UNREPRESENTABLE` only when no day can absorb the excess.
- Known issues: any review finding that survived two fix rounds; the S0.1 M6 name map if any M6 name differed.
- Forward notes: **M8** draws ◆ in day columns via `columnIndexOfPeriod` and moves ◆ ±1 day there (X66), and reuses `CellMenu` through its additive `items?` prop plus the `grid.cellMenu` shortcut; **M9** reuses `src/lib/grid/day.ts` (`dayCtxFor`, `spreadDayLoads`), `services/day-context.ts#loadDayData`, `repo.allocations.dayLoadsForProjects` (with `projectIds` for hidden projects), `day-footer.ts` (`personDayLoads` gains a masked-row branch; `personDayStatus`/`footerDayCell` unchanged) and `overload.ts` (adds BR-41 causes, excess, week-level tones, the FR-906 "มีงาน X วันวางไว้ในวันที่ลา" line, X23) and the person grid's day zoom uses `grid.zoom`; **M11** `seed:demo` composes `addDayExample` (X69).

**Commit** (orchestrator, after G4):
```
feat(m7): daily resolution — day zoom, inline week expansion, BR-22/23/24 conversions, day-level overload

- FR-802 (day zoom, grid.zoom preference), FR-803 (header click, Cmd+↓/↑), §8.4 layout with narrow "รวม" column
- BR-20..BR-24 in src/domain/allocation.ts (+ clamp-and-spill, DEVIATION M7-D7) with fast-check invariants
- saveAllocations per-week table: BR-22 split, BR-23 collapse, BR-24 NEEDS_CHOICE { week, weeks[], pairs } + SCALE/COLLAPSE
- BR-24 dialog (one dialog for N weeks), ↕ รวมเป็นรายสัปดาห์ with undo, dashed derived values, same-kind fill/paste/shift
- overload.ts BR-40 levels + BR-45 tones at day level (X06); day glyphs in assignee cells and footer
- addDayExample (SPEC A.2 Kickoff workshop); authz rows PERM-06/PERM-12 (day paths); masking day cases; golden day level
- e2e m7-daily (AC-804)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
**Tag:** `git tag m7`.
