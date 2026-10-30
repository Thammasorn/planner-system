# R5: Mining `design-spec-v2.1.md` for insights that still work with SPEC 3.0

- **Date:** 2026-09-30
- **Scope:** pre-planning research only. Nothing in the project folder was changed.
- **Read in full:**
  - `docs/history/design-spec-v2.1.md` (1945 lines, v2.1, 15 Sep 2026)
  - `SPEC.md` (1632 lines, v3.0)
- **Read for cross-checking:** `docs/history/decisions-log.md`, `docs/reference/excel-workload-planner.md`, `docs/reference/golden-fixtures.json`, `PROGRESS.md`, `docs/README.md`
- **Precedence:** `SPEC.md` > `CLAUDE.md` > `docs/**`. v2.1 is superseded. Everything here is either adapted to fit SPEC 3.0 or marked **CONFLICT ❌**.

**Status tags used on every item:**

| Tag | Meaning |
|---|---|
| **VERIFIED** | Executed (Node 26.5 / Postgres 17.11), or seen in a package `.d.ts` or official docs |
| **LIKELY** | Strong reasoning or common knowledge; not executed |
| **UNCERTAIN** | An interpretation that needs a `PROGRESS.md › Decisions` entry |

**Compatibility tags:** ✅ fits SPEC 3.0 (possibly adapted) · ❌ conflicts, so the plan must **not** follow v2.1 here.

**Source references:**
- `v2.1 §x.y` points to the old spec.
- "derived" means the insight came from cross-reading v2.1's model against SPEC. It is not literally in v2.1.

**Experiment artifacts** (scratch only, not the repo), in `…/scratchpad/research/r5/`:

| File | What it checks |
|---|---|
| `distribute.mjs`, `distribute2.mjs` | Largest-remainder behaviour, formatting, Thai dates |
| `weekday-model.mjs` | A pure model of BR-20..24 used to test undo semantics |
| `spill.mjs` | The DAY hard-cap spill rule |
| `schema.sql`, `seed2.sql`, `timeoff.sql` | DDL, trigger and constraint behaviour on Postgres 17.11 |
| `raceA.out` / `raceB.out` / `lock*.out` | Concurrency experiment output |

The container `r5-v21-pg17-a64f` was removed after use.

---

## 0. Top findings (read these first)

| # | Finding | Status | Milestone |
|---|---|---|---|
| 1 | **The WEEK/DAY exclusivity trigger (SPEC §6.3, same idea as v2.1 §6.3) is not race-safe.** Under READ COMMITTED, two concurrent transactions inserting a WEEK row and a DAY row for the same (assignment, week) both commit, which breaks BR-20b. **Fix:** every allocation write path first runs `UPDATE task_assignments SET version=version+1 WHERE id=$1 AND version=$2` (or `SELECT … FOR UPDATE`). That row lock serializes writers. Either the second writer gets 0 rows (`VERSION_CONFLICT`), or its trigger now sees the committed row and raises `WEEK_DAY_CONFLICT`. | VERIFIED | M6, M7 |
| 2 | **The DAY hard cap (BR-26: ≤ 100 cd; DB check `person_days <= 1`) collides with BR-21/22/24 distribution whenever a week is overloaded.** Golden **F2** (holiday Fri 2026-10-23) gives Jack and Mint 500 cd with 400 cd capacity. Expanding that week derives 125 cd/day, so editing a day (BR-22) inserts 1.25 and the DB rejects it. v2.1's own BR-24 example (1.0/1.0/0.5 → total 4.0 gives 1.6/1.6/0.8) fails the same way. The plan needs a cap-and-spill rule; v2.1 §5.5 already warned "clamp, overflow to the next day". | VERIFIED | M7 |
| 3 | **SPEC's `distribute` snippet (§5.3) uses float fractional parts and violates its own BR-21 tie rule** ("เศษเท่ากันให้วันที่มาก่อน"). Example: t=10, w=[0,0,25,25,100] gives [0,0,2,1,7]; the correct result is [0,0,2,2,6]. It affects about 1% of SCALE and part-time cases, and none for pure dayCapacity weights of {0,50,100}. **Fix:** compare exact integer remainders `t*w − floor*sumW`. | VERIFIED | M6 |
| 4 | **Undo/redo of plan edits must replay complete week states.** Restoring a DAY week after COLLAPSE by re-sending only the old non-empty days produces Mon 100, Tue 100, Wed 50, **Thu 50, Fri 50** (sum 350 instead of 250). Send all 7 days, with `null` for the empty ones. Restoring a WEEK value over a DAY week needs `onDayWeekConflict:'COLLAPSE'`, or the server answers `NEEDS_CHOICE`. | VERIFIED (model) | M6, M7 |
| 5 | **The `excess` definition is missing from SPEC but comes from v2.1 §5.8:** OVER → committed − cap, RISK → total − cap, OK → 0. It matches golden F2/F3/F4 (`excessCd` 100/200/50). The cause is computed for RISK as well (F4 = RISK/CAPACITY). | VERIFIED vs fixtures | M9 |
| 6 | **Never format loads with `toFixed`.** `(0.35).toFixed(1)` gives "0.3" and `(0.15).toFixed(1)` gives "0.1"; half-up expects 0.4 and 0.2. Use integer half-up on cd, or `Intl.NumberFormat`. The golden and mock numbers (375→3.8, 125→1.3, 625→6.3, 1875→18.8) all follow half-up. | VERIFIED | M6 |
| 7 | **Thai keyboard layout:** with Kedmanee active, `f` types "ด", `h` types "้", and unshifted digit keys type Thai letters. **Handle grid keys by `event.code`** (KeyF, KeyH, Digit/Numpad N, KeyZ…), and accept Thai numerals. | VERIFIED (xmodmap, TIS-620 codes) | M6 |
| 8 | **Sequencing gap:** BR-25 ("วางแผน N วัน", M6) writes **DAY rows for partial edge weeks**, but BR-22..24 (the DAY editing rules and the dialog) are M7. The M6 grid must aggregate DAY rows, show ⋯, and handle a WEEK edit on a DAY week (`NEEDS_CHOICE`). | derived | M6 |
| 9 | **The time-off exclusion constraint cannot be expressed in Drizzle 0.45.3** (pg-core has no EXCLUDE builder). Put it in a custom SQL migration and **name it**. The resulting behaviours: SQLSTATE 23P01 (the DETAIL includes the conflicting range); two half-days (AM and PM) on the same date are rejected; restoring a deleted leave that overlaps a newer one fails with 23P01. | VERIFIED | M5 |
| 10 | Restoring (undoing) an assignment removal after the same user was re-assigned fails with **23505** on `task_assignments_active`. Every `restore*` must map 23505/23P01 to a Thai "กู้คืนไม่ได้…" toast. | VERIFIED | M3, M5 |
| 11 | **MUI X DataGrid is not an option for PlanGrid.** Range cell selection and clipboard paste are **Premium**. This reinforces v2.1 §8.1's headless, own-DOM stance: build the grid with TanStack Virtual and plain elements, and use MUI only for chrome. | VERIFIED (mui.com) | M0, M6 |
| 12 | v2.1's generated `completed_week` over a `timestamptz` fails with **"generation expression is not immutable"**. SPEC's `completed_on date` version works (Sunday 2026-10-04 maps to 2026-09-28). | VERIFIED | M3 |
| 13 | v2.1 supplies **response shapes SPEC leaves undefined**: the `Warning` item (`{code, date, message}`), the time-off impact (`capacityImpact`, `newOverloads`, `allocationsOnTimeOffDays`), `WorkloadCell`, and `CapacityCell` with `standardCapacity`. These are adopted in cd in §4 below. | derived | M5, M6, M9 |
| 14 | v2.1's default window of **4 weeks back + 12 ahead = 16 weeks** equals SPEC §9's perf case ("กริดโปรเจค 16 สัปดาห์ × 200 แถว"). Use it as the initial grid window. Infinite scroll can bound memory with TanStack `useInfiniteQuery` + `getPreviousPageParam` + `maxPages` (both exist in query-core 5.104.0). | VERIFIED (d.ts) | M6 |
| 15 | **"รวม" (row total) is all-time in SPEC's §8.3 mock.** Mint's "Rollout สาขา" shows 18.8 although all its weeks lie outside the visible window, and Cindy's 18.8 includes 31/8 and 7/9. Yet every `allocations` query needs a `week_start` range. Define a bounded `TOTALS_HORIZON` and record the Decision. | VERIFIED (arithmetic) / UNCERTAIN (intent) | M6 |
| 16 | **Team utilization depends on whether the Manager counts.** The Manager has a Mon–Fri schedule but no plan (golden `byUserWeek` lists only 5 workers). For week 2026-08-31 that is 30.0% if the Manager is excluded vs 25.0% if included. v2.1 (§8.3 mock: 7.5/25.0 = 30%) excluded non-planned users. Decide explicitly. | VERIFIED (arithmetic) | M9, M10 |

---

## 1. Orientation: where v2.1 content lands in SPEC 3.0

| v2.1 section | SPEC 3.0 counterpart | Milestone | Verdict |
|---|---|---|---|
| §1.3/§1.5 principles (coarse first, inline editing, no forced setup, reversible) | §1.3 P1–P7 | all | ✅ same spirit. The "≤ 7 concepts" rule was dropped (decisions-log round 5) |
| §4 FR table | §4 FRs (renumbered) | — | mixed (see §8 Conflicts) |
| §5.1 continuous timeline, Monday weeks, no ISO week numbers, mandatory window | BR-04/05, FR-801, §6.5 rule | M5, M6 | ✅ |
| §5.2 person-day unit, fraction display/parse | BR-01..03, FR-804 | M6 | ✅ adapted to cd integers |
| §5.3 hierarchy (sections, cross-project move, confirm dialogs) | BR-30..33, D8, D10 | M3 | partly ❌ |
| §5.4 effective certainty with `source`/`sourceId` | BR-35/36 | M6 (and M3) | ✅ (no `'default'` source) |
| §5.5 WEEK↔DAY | BR-20..25 | M6/M7 | ✅ core, ❌ third dialog option, ❌ `round2`/`weekCap=0→0` |
| §5.6 capacity + leave rules + edge cases | BR-10..13, BR-42, FR-903..906 | M5/M9 | ✅ (half-days as `half` enum) |
| §5.7/§5.8/§5.9/§5.10 aggregation, overload, colours, metrics | BR-37, BR-40/41/45, FR-1001..1007 | M6/M9 | ✅ + gives `excess` |
| §5.11 completed tasks | BR-50..52 | M3/M6 | ✅ |
| §5.12 validation rules | BR-26/27/30/31, FR-905 | M3/M5/M6 | mostly ✅, VR-01 ❌ (DAY ≤ 7) |
| §6 DDL, trigger, views, MV, scenarios | §6.2/§6.3/§6.5 | M5/M6 | trigger ✅ (with lock fix), MV/scenarios/recursive view ❌ |
| §7 REST API + contracts + debounce | §7.3/§7.4/§7.5 (server actions + route handlers) | M5/M6/M9 | contract content ✅, REST surface ❌ |
| §8 frontend (planner, day zoom, keyboard, workload, calendar, alerts, tokens, list, panel) | §8, FR-8xx, FR-10xx | M3/M5/M6/M7/M9 | many ✅ details, several ❌ |
| §9 import/export xlsx | Phase 2 (§13 #10) | — | ❌ (only the "f × 5.0" import rule survives, as `seed:golden`) |
| §10 NFR | §9 | M11 | SPEC numbers win; "query discipline lint/test" ✅ |
| §11 roadmap | §12 build plan | — | ❌ (SPEC order wins) |
| §12 test plan | §11 | M5–M9 | many test cases ✅ (converted to cd) |
| §13 migration plan | — | — | not applicable |
| §14 open questions | §14 D1–D10 | M6 | "past weeks editable but dimmed" ✅ optional |

---

## 2. Insights by milestone

IDs (for example `M6-14`) are cited in the structured summary.

### M0: Scaffold

- **M0-01 ✅ LIKELY (v2.1 §8.9 = SPEC §8.7): tokens → MUI theme.**
  - The token set is identical, except SPEC adds `--milestone #7C3AED` and renames navy-mid to `--brand-blue`.
  - Put the tokens in the MUI theme (palette augmentation: `load.{over,full,light}.{bg,fg}`, `heat.{0,50,100}`, `certainty.*`, `calendar.{nonworking,holiday,timeoff}`, `today`, `milestone`).
  - Expose them as CSS variables so the custom grid can use them without JS.
  - Dark mode: SPEC wants the same tokens redefined for dark.
  - v2.1's extra `--yellow-input #FFF2CC` (the Excel input-cell colour) is not in SPEC; skip it unless a use appears.
- **M0-02 ✅ LIKELY (v2.1 §5.9, SPEC FR-807/BR-45 §8.9): a shared "capacity = 0" pattern.**
  - Diagonal stripes, e.g. `repeating-linear-gradient(135deg, var(--timeoff) 0 4px, transparent 4px 8px)`, plus an icon (🏖 leave / 🎌 holiday) and tooltip text.
  - Never grey-only: it must stay distinguishable from "empty".
- **M0-03 ✅ VERIFIED (v2.1 §8.1 "Table headless — ต้องคุม DOM เอง"): do not use MUI X DataGrid for PlanGrid.**
  - MUI X docs: "With the Data Grid Premium, you can apply the `cellSelection` prop…", and clipboard paste is marked Premium.
  - Build PlanGrid with TanStack Virtual. MUI is for the toolbar, ToggleButtonGroup, Dialog, Menu, Popover and a single shared Tooltip.
- **M0-04 ❌ (v2.1 §8.1): do not add v2.1's stack extras** (Zustand, TanStack Table, date-fns/-tz, Recharts, react-hook-form, next-intl, Auth.js, Trigger.dev/pg-boss, SheetJS/ExcelJS). If one becomes necessary (e.g. an external store for grid selection, see M6-30), record a Decision.

### M1: Auth, employees, positions

- **M1-01 ❌ (v2.1 §6.2, FR-104/105):** do not follow v2.1's
  - `organizations`/`org_id`,
  - the `users`↔`people` split,
  - roles ADMIN/PLANNER/MEMBER/VIEWER,
  - Google SSO/magic link.

  SPEC is single-workspace, uses Better Auth email+password, has manager|worker roles plus LEAD|MEMBER per project, and every user is a person.
- **M1-02 ✅ derived (v2.1 §5.7 "Σ over activePeople"): deactivation.**
  - SPEC keeps deactivated users visible ("ปิดใช้งาน", AC-203) with capacity 0 from `deactivated_on` (BR-13).
  - v2.1's "exclude archived people from team capacity" is then automatic.
  - Their remaining future load still shows as overload. The cause label needs a decision (M9-06).
  - `dayCapacityCd` needs an extra `deactivatedOn` parameter, which SPEC's snippet lacks.
- **M1-03 ✅ derived:** AC-203's grid part ("แผนเก่าของ Cindy ยังแสดงในกริดพร้อมป้าย 'ปิดใช้งาน'") can only be tested once the grid exists (M6). Schedule that assertion in the M6 e2e.
- **M1-04 ❌ (v2.1 VR-08):** v2.1's "delete person with allocations → confirm → soft delete" is replaced by FR-205 deactivate, with no confirm dialog.

### M2: Clients, projects, members, authz

- **M2-01 ✅ (v2.1 §5.4): certainty default.** `certainty` defaults to CONFIRMED because "underestimating load is more dangerous than overestimating". SPEC agrees and makes `projects.certainty` NOT NULL, so there is **no `'default'` certainty source** in SPEC (❌ v2.1's 4th source). GridRow's `certaintySource` is `'task'|'ancestor'|'project'` only.
- **M2-02 ✅ LIKELY (v2.1 FR-74, E2E #10 → SPEC FR-405): immediate updates.**
  - A certainty change must update every number without a reload.
  - Fix the TanStack Query key conventions now: `['grid','project',id,range,expand]`, `['grid','person',userId,…]`, `['workload',…]`, `['home',…]`.
  - The `updateProject` action (certainty, archive) makes the client invalidate `['grid']`, `['workload']` and `['home']`, plus `revalidateTag('project:<id>')` for RSC.
- **M2-03 ✅ derived: FR-406 depends on data that arrives later.** Archive shows "จะปลดภาระ X วัน-คน ในอนาคต", but allocations only exist from M6. In M2, implement archive/unarchive with the message but without X. Wire X in M6 using the future-load query (§5.6).
- **M2-04 ✅ derived: FR-404 depends on M3.** Removing a member who still has assignments needs `task_assignments`, which arrive in M3. Implement the guard and toast in M3.
- **M2-05 ✅ derived:** FR-303 (client page "ภาระรวม 12 สัปดาห์ข้างหน้า") needs allocations. Show it from M6 (or M9 with the workload service).
- **M2-06 ❌ (v2.1 §5.3, FR-04/FR-12):** no sections (SPEC D8), and no moving tasks across projects (BR-33/D10).
- **M2-07 ✅ UNCERTAIN (v2.1 FR-75 was Phase 2):** SPEC's DDL still has `projects.certainty_note text`, but no FR uses it. Exposing it as an optional note (tooltip on ◐) is harmless. Leave it unused unless trivial.

### M3: Tasks

- **M3-01 ✅ VERIFIED (v2.1 FR-110/111, VR-00, E2E #15): quick add.**
  - Name only, no modal; Enter creates the task and keeps the cursor in a fresh input (SPEC FR-602).
  - The DB check `length(trim(name))>0` **accepts an NBSP-only name** (VERIFIED: `insert … values (E' ')` succeeded).
  - So the Zod schema must `.trim().min(1)`. JS `trim()` removes NBSP. Zero-width characters are not whitespace, so optionally strip `​`.
- **M3-02 ✅ (v2.1 §8.10): list rows.**
  - Content: ☐ · name · assignee chips · date range ("31 ส.ค.–28 ก.ย.") · total days (right-aligned).
  - Completed rows show "เสร็จ 7 ก.ย." and strikethrough.
  - Unassigned rows show a faded "รอมอบหมาย" (SPEC FR-606), never hidden.
  - The total-days column needs allocations, so it appears from M6.
- **M3-03 ❌ (v2.1 §8.10 grouping):** v2.1 grouped by project/person/client/certainty/start-week. SPEC FR-613 is none/assignee/milestone/certainty, with sorting by manual order/due date.
- **M3-04 ✅ (v2.1 §8.11): task panel layout.**
  - Editable title at the top.
  - A certainty select whose null option reads **"ตามโปรเจค (แน่นอน)"**, or **"สืบทอดจาก '<งานแม่>' (อาจไม่ทำ)"** (BR-36 wording).
  - Date range; per-assignee rows with total days and SPEC's **"วางแผน"** button (FR-612, M6); a "งานย่อย" list + "+ เพิ่มงานย่อย"; notes; footer "☐ ทำเสร็จแล้ว" + delete.
  - **Drop v2.1's Project and Section dropdowns** (BR-33, D8).
  - Width ~440 px (SPEC wins over v2.1's 420). It shrinks the content rather than overlaying it; Esc closes it; URL `?task=<id>`.
- **M3-05 ✅ VERIFIED (v2.1 §5.11): completion.**
  - Completion never deletes allocations.
  - Completed tasks are hidden by default. The "แสดงงานที่เสร็จแล้ว" toggle persists in `user_preferences.showCompleted` (CLAUDE.md: no localStorage for data).
  - Ticking a parent that has open children shows a **toast** "ติ๊กงานย่อยทั้งหมดด้วยไหม" [ติ๊กทั้งหมด] (SPEC FR-608 uses a toast, not v2.1's question dialog).
  - `completed_on = todayBangkok()`. v2.1's timestamptz version fails as a generated column (VERIFIED).
- **M3-06 ✅ derived: BR-52's toast depends on M6.** The toast "ปลดภาระ X วัน ในอีก N สัปดาห์ · เลิกทำ" needs allocations. In M3 show "ทำเสร็จแล้ว · เลิกทำ"; wire X/N in M6 (M6-28).
- **M3-07 ✅ LIKELY (v2.1 §5.3 "why TaskAssignment is separate", VR-05 → SPEC BR-31/FR-610): leaf-only assignments.**
  - The server rejects assigning to a task that has children; the UI shows no "+ คน" on parent rows.
  - **Implement FR-610 by re-pointing rows:** `UPDATE task_assignments SET task_id=:child WHERE task_id=:parent AND deleted_at IS NULL`.
  - Allocations reference the assignment, so they follow with no copying (works unchanged once M6 adds allocations).
  - Undo re-points back and soft-deletes the new child (same `deleted_batch`).
- **M3-08 ✅ UNCERTAIN (v2.1 §5.3 asked "move to first child or discard"; SPEC forbids the dialog): Tab-indent edge case.**
  - The case: row 2 is indented under row 1 (FR-603), row 1 has assignees and gains its first child, and row 2 already has its own assignees.
  - FR-610 would move row 1's assignees onto row 2. If the **same user** is on both, `task_assignments_active` raises 23505 (the mechanism is VERIFIED).
  - Simplest Decision: re-point only users not already on the child. If a duplicate exists, block the indent with the toast "ย่อไม่ได้: <ชื่อ> เป็นผู้รับผิดชอบทั้งสองงาน".
- **M3-09 ✅ derived (v2.1 VR-04 → BR-30/AC-602): depth checks.**
  - Indenting or moving a task with descendants must check `newDepth + subtreeHeight ≤ 2`, and update the stored `depth` of the whole subtree in the same transaction.
  - Going beyond level 3 does nothing (AC-602), with no error dialog.
- **M3-10 ❌ (v2.1 §5.3 "ลบทั้งกิ่ง (ยืนยัน 2 ชั้น)"):** SPEC BR-32/FR-609 soft-deletes the subtree with one `deleted_batch` and shows an undo toast for 8 s, with no confirm.
- **M3-11 ✅ VERIFIED: restore conflicts.** Restoring by batch can hit 23505 (re-assigned same user) or 23P01 (overlapping leave, M5). `restore*` must catch these and show "กู้คืนไม่ได้ เพราะ…" instead of a 500.
- **M3-12 ✅ (v2.1 FR-119 + tests "unassigned tasks"):** unassigned tasks never overload anyone (BR-43; there are no allocations without an assignment). They still appear in lists and project trees. Keep a unit or integration test.
- **M3-13 ✅ derived: certainty display timing.** SPEC assigns `certainty.ts` to M6, but the M3 panel shows the override and BR-36 text. Either pull the tiny pure `effectiveCertainty` into M3 (record the Decision), or show only the override until M6.
- **M3-14 ✅ note:** SPEC moved these into the MVP although v2.1 had them in Phase 2: multi-select bulk actions (FR-614), undo/redo, and TSV paste. Follow SPEC.

### M4: Notion-style pages

- **M4-01 ✅:** v2.1 has **no** documents, wiki, editor or file content, so there is nothing to mine. Follow SPEC §4.5/§7.6/§7.7. v2.1 §1.5 #5 ("no unrequested notifications") agrees with SPEC keeping notifications in Phase 2.

### M5: Calendar, holidays, leave, capacity

- **M5-01 ✅ (v2.1 §5.6 = SPEC BR-10..12): capacity in cd.**
  - `dayCapacityCd(schedule, holidays, timeOff, d, deactivatedOn)`.
  - Leave `half` AM/PM counts as 50 cd; `null` counts as 100 cd.
  - Holiday first (BR-12: no double deduction); clamp at ≥ 0.
- **M5-02 ✅ test table** (v2.1 §5.6/§12.1 plus derived rows; weeks Mon–Fri, cd):

| Case | weekCapacityCd |
|---|---|
| normal | 500 |
| 2 days leave | 300 |
| half-day PM Friday | 450 |
| part-time Mon/Wed/Fri | 300 |
| part-time Mon/Wed/Fri + leave Wed | 200 |
| **3 holidays (Songkran-like), v2.1 extra** | 200 |
| holiday Fri + leave Fri (BR-12) | 400 |
| whole week on leave (utilization must be `null`, not Infinity) | 0 |
| **leave Thu 2026-10-08 → Tue 2026-10-13 (spans 2 weeks, stored as 1 range; v2.1 §5.6 edge)** | week 10-05 = 300, week 10-12 = 300 |
| leave Fri → Mon over a weekend | −100 in each week (weekend schedule = 0) |
| holiday on a Saturday | no effect |
| half-day leave on a 0.5 (50 cd) schedule day | that day = 0 |
| half-day leave on a 0.6 (60 cd) day | that day = 10 |
| deactivated from Wednesday | 200 |

- **M5-03 ✅ (v2.1 §5.6 ★ = BR-42):** leave never edits plans. After saving, compute the impact only.
- **M5-04 ✅ derived (v2.1 §7.4 → SPEC FR-906): save result shape.** In cd:
  - M5 returns `capacityImpact:[{week, beforeCd, afterCd}]` for each week overlapping [start,end], plus optional `allocationsOnTimeOffDays`.
  - M9 adds `newOverloads` (§4.3).
  - Message template, adapted from v2.1: "capacity ลดจาก 5.0 → 3.0 เพราะลาพักร้อน 12–13 ต.ค.", followed by a **link** to fix (SPEC). v2.1's quick-fix buttons are ❌.
- **M5-05 ✅ VERIFIED (v2.1 §6.2/§6.7 exclusion rationale → SPEC FR-905): overlap handling.**
  - Drizzle 0.45.3 pg-core has **no EXCLUDE builder** (`checks.d.ts` exports `check()`, `indexes.d.ts` has `.where()`, and there is `generatedAlwaysAs`, but no exclusion API).
  - Write `exclude using gist (user_id with =, daterange(start_date,end_date,'[]') with &&) where (deleted_at is null)` in the **custom SQL migration** with an **explicit name** (e.g. `time_off_no_overlap`).
  - The error is SQLSTATE **23P01**; the DETAIL includes the conflicting range, e.g. `[2026-10-05,2026-10-07)`.
  - Map it to FR-905's message by querying the overlapping active entry, e.g. "ทับกับวันลา 5–6 ต.ค. 2569 (ลาพักร้อน)".
  - Do a pre-check query for nicer UX, and rely on the constraint for races (v2.1's rationale).
- **M5-06 ✅ VERIFIED: half-day edge cases.**
  - **AM + PM half-days on the same date as two entries are rejected** (identical ranges overlap). The message should suggest recording a full day: "บันทึกเป็นเต็มวันแทน".
  - `half` on a multi-day range violates `time_off_check1` (**23514**). Zod should prevent it by allowing `half` only when start = end (FR-903).
- **M5-07 ✅ VERIFIED:** undoing the deletion of a leave after a newer overlapping leave was created fails with 23P01. Show the toast "กู้คืนไม่ได้ เพราะทับกับวันลาอื่น".
- **M5-08 ✅ VERIFIED (v2.1 §6.6 materialized view + background job ❌): compute capacity on the fly.**
  - Per request, load schedules (≤ 7 rows per user), holidays in the window, and leave overlapping the window; compute in `src/domain`.
  - Cost is trivial: 100 users × 16 weeks × 7 days = 11,200 calls.
  - Both indexes serve the leave window query (EXPLAIN with seqscan disabled):
    - the btree `(user_id,start_date,end_date) WHERE deleted_at IS NULL` serves `start_date < :to AND end_date >= :from`;
    - the exclusion GiST index serves `daterange(start_date,end_date,'[]') && daterange(:from,:to,'[)')`.
- **M5-09 ✅ / ❌ (v2.1 §5.6 "seed Thai holidays 2 years", FR-50 import-th, `is_substitute` ❌): holidays come from the CSV import per D9.**
  - Reuse v2.1 §9.1's pipeline pattern for the CSV: **upload → parse → validate → preview (new / updated / invalid) → commit in one transaction**, upserting on the unique `date`.
  - Edge cases to handle:
    - UTF-8 BOM and CRLF (Excel exports);
    - an optional header row;
    - duplicate dates within the file;
    - Buddhist-era years ("2569-…" or "23/10/2569").

    Decision: accept ISO `YYYY-MM-DD` only and show a format hint. If being friendly, convert years > 2400 by −543.
  - Bootstrap must **not** seed holidays (SPEC §10.4).
- **M5-10 ✅ (v2.1 §8.7): calendar layout.**
  - Month grid: rows = weeks Mon..Sun.
  - Leave bars span days ("🏖 Peter"); holidays show "🎌 <ชื่อ>"; weekends are shaded (`--nonworking`).
  - Click or drag an empty range to open a quick "my leave" form (FR-908).
  - **Masking:** non-managers other than the person see only "ลา", and receive **no leave-type colour either** (colour leaks the type; SPEC's GridResponse `timeOff` has only `label`).
  - v2.1's per-type filters and "red badge on leave causing overload" are not required.
  - Milestones (◆) come in M8 (FR-705/907).
- **M5-11 ✅ derived:** impact text should count only working days (e.g. a leave over a weekend reads "ลา 2 วันทำการ").
- **M5-12 ✅ (v2.1 §10):** members edit only their own leave, and managers edit anyone's (SPEC §3.2).
- **M5-13 ✅ VERIFIED (v2.1 §5.1 "no ISO week numbers"; ❌ `toWeekStart(d: Date)`): `dates.ts`.**
  - Use string arithmetic (BR-04).
  - It must agree with Postgres `date_trunc('week', d::timestamp)::date`, which maps Sunday 2026-10-04 to Monday 2026-09-28.
  - Test the cross-year week 2026-12-28..2027-01-03.
- **M5-14 ✅ VERIFIED:** `todayBangkok` via `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'})` returns '2026-09-30' at 2026-09-29T23:30Z (the SPEC §11.1 case).
- **M5-15 ✅ VERIFIED: formatting ISO dates with Intl.**
  - Always build with `Date.UTC(y,m-1,d)` and format with `timeZone:'UTC'`. Otherwise a runtime in a zone west of UTC shows the previous day (demonstrated: the same instant formatted in America/Los_Angeles gives "29 ก.ย. 2569").
  - `th-TH` yields Buddhist-era years by default ("30 ก.ย. 2569"), with header "30 ก.ย." and narrow weekdays "จ อ พ พฤ ศ ส อา" (Node ICU 78.3).
  - Node and browser ICU versions differ, so prefer formatting in one place (client) or a fixed month-abbreviation table to avoid hydration mismatches (LIKELY).

### M6: Weekly planning grid (the largest harvest)

**Units and formatting**

- **M6-01 ✅ VERIFIED: never format loads with float arithmetic.**
  - Days: 1 decimal in the grid, half-up on integers: `q = Math.round(cd/10)` → `${Math.trunc(q/10)}.${q%10}`. Expected: 375→"3.8", 125→"1.3", 625→"6.3", 1875→"18.8", **35→"0.4" (toFixed gives 0.3)**, 15→"0.2", 0→"" (SPEC: 0 shows empty).
  - Tooltip: exact 2 decimals `${Math.trunc(cd/100)}.${String(cd%100).padStart(2,'0')}`.
  - For Postgres writes, emit the same exact string (numeric(4,2) rounds half away from zero anyway; VERIFIED 0.125→0.13).
- **M6-02 ✅ UNCERTAIN (v2.1 §5.2 → FR-804): fraction unit.**
  - Display = cd / capCd for that cell's week, shown with **2 decimals** ("0.50" as in v2.1 and Excel). This needs a Decision, because SPEC's "1 decimal in the grid" was written for days, and 0.75 would otherwise show as 0.8.
  - capCd = 0 → **show days instead** (v2.1 §5.6 edge; never ∞ or %).
  - Parse `f` → cd = round(hundredths(f) × capCd / 100), then BR-27 rounds to 25 cd. Parse the string into integer hundredths so no float is involved.
  - Typing a fraction when capCd = 0 would produce 0, which BR-26 treats as **delete**. Decision: evaluate against `standard` (schedule) capacity, like BR-21a, and add a warning; never delete silently.
  - Tooltip from v2.1: **"1.00 × 4 วันทำการ = 4.0 วัน"**.
- **M6-03 ✅: input parsing.**
  - Accept "1.5", ",5" (SPEC test), Thai digits "๑.๕" (VERIFIED normalisation), and surrounding spaces.
  - `f` = the cell's capacity and `h` = half, both per cell (AC-802).
  - Decision needed for `h` on odd capacities: `Math.round(capCd/2)` (exact) vs BR-27 rounding.
  - Values above the limits are rejected with a message: WEEK > 700, DAY > 100 → "สูงสุด 7 วันต่อสัปดาห์ / 1 วันต่อวัน".

**Keyboard and selection**

- **M6-04 ✅ VERIFIED: handle keys by `event.code`.**
  - Under Kedmanee, `event.key` gives: `f`→"ด" (TIS-620 0xB4), `h`→"้" (0xE9), unshifted `1`→"ๅ", `4`→"ภ", `5`→"ถ", and shifted digits give Thai numerals (e.g. shift+2 → "๑").
  - So use `event.code` for grid shortcuts: `KeyF`, `KeyH`, `Digit0-9`/`Numpad0-9` (map to ASCII digits in numeric cells), `Period`/`Comma`, `Backspace`, `Delete`, `Enter`, `Tab`, `Escape`, arrows, and `KeyZ`/`KeyC`/`KeyV`/`KeyK`/`Backslash` with meta/ctrl.
  - Ignore events while `event.isComposing`.
- **M6-05 ✅ / ❌ (v2.1 §8.5 vs SPEC §4.8 table): keyboard map. Follow SPEC's table. Compatible v2.1 extras:**
  - **Cmd+S** (preventDefault) = flush the pending batch.
  - **Cmd+↑** = collapse the expanded day columns, **view only**. Never trigger BR-23 from a key, because it loses data.

  Conflicting v2.1 items:
  - ❌ digit shortcuts `1`/`7`/`5`/`2` (full / 0.75 / half / 0.25 capacity). In SPEC, typing digits starts editing; `f`/`h` replace them.
  - ❌ `0` = clear. Typing 0 + Enter deletes via BR-26 anyway.
  - ❌ `Cmd+←/→` = shift the whole task bar ±1 week. SPEC shifts the selected range ±1 column.
- **M6-06 ✅ derived: key the selection model by `(rowKey, periodKey)`, not by indices.**
  - Rows merge and split: a single-assignee row merges into its task row (SPEC §8.3) and splits when a second assignee is added.
  - Columns get prepended during infinite scroll, and virtualization recycles DOM nodes.
  - State: anchor + focus. Fill, paste and delete skip non-editable cells: task sum rows, masked rows, and weeks after `completed_week` if chosen.
- **M6-07 ✅ (SPEC P1/AC-801; v2.1 FR-36): fill.**
  - Select a range, type, press Enter: the same parsed value goes into every cell.
  - **Capacity-relative inputs (`f`, `h`, fractions) are evaluated per cell**, against each week's own capacity.
  - Fill handle: repeat the source block across the dragged cells (Excel semantics).
- **M6-08 ✅ UNCERTAIN (SPEC Cmd+V/AC-803; v2.1 FR-38 "เข้ากับ Excel"): paste.**
  - Split `text/plain` on `\r?\n`, **drop the trailing empty line Excel appends**, then split on `\t`.
  - Parse each token in the current unit (fractions against each target cell's capacity).
  - Anchor at the top-left of the selection. If the selection is an exact multiple of the block, tile it (Excel). This needs a Decision.
  - Skip non-editable targets. Skip invalid tokens and report the count in a toast. The whole paste is **one undo entry**: "วาง N ช่อง".
- **M6-09 ✅ derived: copy.** Copy TSV with **exact 2-decimal values** in the current unit, not the 1-decimal display, so values survive a round trip (3.75 must not become 3.8). Empty cells become empty strings.
- **M6-10 ✅ UNCERTAIN (SPEC Cmd+←/→; v2.1 US-04 "lag the whole block 2 weeks", `shift {weeks, skipNonWorking}` ❌): shift semantics.**
  - Values in the selected range move ±1 column, and **the selection moves with them**, so the key can be repeated. US-04 then becomes "select the row range, press Cmd+→ twice".
  - The vacated edge cell becomes null.
  - The destination cell just outside the range is overwritten (undo is available). This needs a Decision: overwrite vs merge vs block.
  - Shifting a DAY-resolution week by one week column moves its DAY rows by ±7 days, keeping the pattern.
  - No `skipNonWorking`.
- **M6-11 ✅:** Delete/Backspace sends null changes for cells with a value. On a whole-row selection of a task row, it deletes the task (BR-32) and shows an undo toast.

**Saving, optimism and concurrency**

- **M6-12 ✅ (v2.1 §7.5 = SPEC §7.4): debounce and flush.**
  - Debounce 400 ms.
  - Flush on grid blur, **Cmd+S** (v2.1), `visibilitychange`/`pagehide`, before undo/redo, and before opening the BR-24 dialog.
  - Coalesce by (assignment, granularity, period), last write wins, keeping order.
- **M6-13 ✅ LIKELY (v2.1 §7.5 "rollback เซลล์นั้น + toast + ปุ่ม retry"): optimistic state.**
  - Model: displayed = serverState ⊕ pendingPatches.
  - On failure, drop that batch's patches, which **rolls back to the last server-confirmed value, not to the previous optimistic value**. Toast "บันทึกไม่สำเร็จ · ลองใหม่" with an action that re-sends the same batch.
  - On `VERSION_CONFLICT`, replace the local state with `current` (include `version`) and show SPEC's toast.
- **M6-14 ✅ VERIFIED: `saveAllocations` transaction.** The v2.1 §7.3 contract plus the race fix. All steps run in one transaction:
  1. `UPDATE task_assignments SET version=version+1 WHERE id=:id AND version=:base AND deleted_at IS NULL RETURNING version`. **0 rows means `VERSION_CONFLICT`.** This row lock is what makes the trigger safe.
  2. Load and validate: the task is a leaf and not deleted; the project is not deleted (archived → Decision: read-only?); WEEK periods are Mondays; **the server derives `week_start` from `period`** (a wrong client `week_start` is rejected by the DB check, VERIFIED).
  3. Run domain rules (BR-22/24/26/27) to produce a per-week target state, then a row diff.
  4. DELETE before INSERT for resolution changes; WEEK upserts may use `ON CONFLICT (task_assignment_id,granularity,period_start) DO UPDATE` (VERIFIED works with the trigger).
  5. Write one audit row per batch ("Cindy แก้แผน N ช่อง").
  6. Return `weeks` for every touched week (v2.1's `affectedWeeks`), plus `warnings`.

  **Every other writer must take the same lock and bump:** BR-25 planRange, FR-610 re-point, restore, undo, member-removal unassign, and archive if it touches allocations.
- **M6-15 ✅ derived (SPEC declares `warnings: Warning[]` without a type; v2.1 §7.3 gives `{code, date, message}`):** see §4.1. Warnings never block (v2.1 VR-03/VR-09).
- **M6-16 ✅ (v2.1 `RESOLUTION_CONFLICT` → SPEC `NEEDS_CHOICE`): when the choice is needed.**
  - Only for WEEK changes with cd > 0 on weeks whose current resolution is DAY.
  - The client can **pre-detect** from the cached `resolution` and open the BR-24 dialog before sending (no round trip). The server check stays as a safety net.
  - One choice applies to **all** conflicting weeks in the batch. Additive field `weeks: ISODate[]` (SPEC returns one `week`).
  - **WEEK null/0 on a DAY week deletes all its rows with no dialog**, because both options give the same result.
- **M6-17 ✅ derived: sequencing gap.** BR-25 (M6) writes DAY rows for partial edge weeks, but BR-22..24 are scheduled in M7. So M6 must:
  - (a) aggregate DAY rows into week totals and show ⋯;
  - (b) handle a WEEK edit on such a week. **Recommended:** implement BR-24 SCALE/COLLAPSE and the dialog in M6 (the domain code is in `allocation.ts` anyway) and record the Decision. Alternative: the toast "สัปดาห์นี้วางแผนรายวันอยู่ — แก้ได้เมื่อมีมุมมองรายวัน" until M7.
- **M6-18 ✅ derived (v2.1 FR-40/`autospread` → SPEC BR-25/FR-612): BR-25 edge cases.**
  - (a) Range capacity = 0 (all leave or holidays) makes `distribute` return zeros and the N days vanish. Fall back to the schedule (BR-21a style) plus a warning, or refuse with a message.
  - (b) N too large gives a WEEK > 700 or an edge DAY > 100. The preview shows an error and the maximum allowed.
  - (c) **A partial edge week that currently holds a WEEK row:** days outside [start,end] must be kept. Materialize that week first (BR-22 derived values), then replace only the in-range days.
  - (d) Existing DAY rows inside the range are replaced; those outside are kept.
  - (e) The preview is computed client-side with the same domain function, and the server recomputes.
  - (f) v2.1's automatic spread from task start/due dates is ❌: SPEC requires the explicit "วางแผน" action with a preview.

**Reading data**

- **M6-19 ✅ VERIFIED: window and scrolling.**
  - Initial window `[weekStart(today)−4w, weekStart(today)+12w)` = 16 weeks (v2.1 §5.1 default = SPEC §9 perf case).
  - Horizontal infinite scroll in chunks (e.g. 8 weeks) via `useInfiniteQuery({getNextPageParam, getPreviousPageParam, maxPages})`. `maxPages` exists in query-core 5.104.0 ("Maximum number of pages to store in the data of an infinite query") and bounds memory (v2.1 §12.4's leak concern).
  - "วันนี้" resets the window.
  - Zod caps a request span (e.g. ≤ 26 weeks).
- **M6-20 ✅ LIKELY (v2.1 §10 "เขียน lint rule / test ตรวจ" = CLAUDE.md rule): enforce query discipline.**
  - Only `src/server/repo/allocations.ts` may import the `allocations` table object: ESLint `no-restricted-imports`, or `no-restricted-syntax` on the import.
  - Its functions take a **required** `range: {from, to}` parameter.
  - Add a Vitest guard test that scans `src/server/**` for other references.
- **M6-21 ✅ derived (v2.1 §6.5 `v_effective_allocations`, "ตัวหลักที่ทุกหน้าใช้"): one repo builder for effective allocations.**
  - It encodes SPEC §6.5: `ta.deleted_at IS NULL`, `t.deleted_at IS NULL`, project not deleted, archived excluded **for load**, certainty = `coalesce(t, p1, p2, project)` with two LEFT JOINs (v2.1's recursive view ❌), and `completed_week` filtering **for load**.
  - Flags: `includeArchived` (to display an archived project's own grid) and `includeAfterCompletion` (to display dimmed cells of completed tasks).
  - Grid, person grid, workload, home and client pages all use it, so no page forgets a filter.
- **M6-22 ✅ VERIFIED / UNCERTAIN: "รวม" and list totals are all-time in the SPEC §8.3 mock.**
  - Mint's "Rollout สาขา" total 18.8 = 250+375+500+500+250, with every week (11-30..12-28) outside the 14/9–19/10 columns.
  - The rule "every allocations query has a `week_start` range" still applies. Decision: `TOTALS_HORIZON = [weekStart(today) − 5y, weekStart(today) + 5y)`, computed per assignment with the `(task_assignment_id, week_start)` index. Alternatively, define "รวม" as the loaded window.
- **M6-23 ✅ (v2.1 §5.4 `sourceId` → SPEC BR-36): certainty source name.**
  - `effectiveCertainty` returns `{value, source, sourceTaskId}` so the UI can render "สืบทอดจาก '<ชื่องานแม่>'".
  - The project grid can resolve the name from rows. The person grid needs an additive `certaintySourceName`.
  - Tentative rows get an amber left bar, dimmed numbers and ◐, never colour alone (SPEC FR-808/§8.9).

**Visuals, footer and completed tasks**

- **M6-24 ✅ LIKELY (v2.1 §5.9): colour roles.**
  - The **blue heat scale** (#FFFFFF→#BDD7EE→#2E75B6, OKLCH interpolation, e.g. CSS `color-mix(in oklch, …)`) is for **planning-grid cell intensity**.
  - The **red/green/yellow bands** (BR-45) are for **person load vs capacity** (workload, person grid, footers, home bars). SPEC kept both token sets without saying where each applies.
  - Compute bands with **integer cross-multiplication** (BR-01, no float division):
    ```ts
    if (cap === 0) return load > 0 ? 'over' : 'off'
    if (load > cap) return 'over'
    if (5 * load >= 4 * cap) return 'full'
    return load > 0 ? 'light' : 'empty'
    ```
- **M6-25 ✅ VERIFIED (v2.1 §8.3 footer = SPEC FR-806): footer rows.**
  - Rows: ภาระรวม / Capacity / % for the people in the grid (project work only, with SPEC's toggle "รวมงานโปรเจคอื่นของคนเหล่านี้", masked).
  - Golden POS footer for 14/9, 21/9, 28/9, 5/10 = **625, 500, 500, 125 cd**, which SPEC's mock shows as 6.3, 5.0, 5.0, 1.3 (VERIFIED). Capacity for 3 people is 1500, and **1200 in week 19/10** with the F2 holiday.
  - When capacity is 0, % is `null` and shows "—".
  - Compute footers client-side from cached cells plus `people[].capacity`, so they update optimistically (< 50 ms).
- **M6-26 ✅ (v2.1 §5.5/§8.3/§14 Q2): visual cues.**
  - DAY-resolution weeks show ⋯ under the number.
  - The current week or today gets the `--today` red marker.
  - **Past weeks are slightly dimmed but stay editable** (no lock).
  - Leave stripes span the person's cells, with a tooltip.
  - Deactivated users carry the "ปิดใช้งาน" label.
- **M6-27 ✅ (v2.1 §5.11 + tests): completed tasks in the grid.**
  - Completed tasks are hidden by default.
  - When shown, cells after `completed_week` are dimmed and excluded from footers and totals (BR-50).
  - A DAY row later in the **same** week as completion still counts.
  - A parent marked done while its children are open leaves the **children still counting** (SPEC's §6.5 filter uses the leaf's `completed_week`).
- **M6-28 ✅ derived: BR-52 toast.**
  - X = Σ cd with `week_start > completed_week`, within `TOTALS_HORIZON`; N = the number of distinct such weeks.
  - Undo means unchecking; allocations were never deleted (v2.1 §5.11).

**Undo, performance, accessibility and tests**

- **M6-29 ✅ VERIFIED (model): undo entries (SPEC §7.5).**
  - One entry per gesture. A fill, paste or shift spanning several assignments is **one** entry; its undo/redo sends one `saveAllocations` per assignment, or a batched variant (Decision, see §4.2).
  - Entries store **complete week snapshots** (M7-05).
  - Replay uses the **latest** known version of each assignment.
  - Flush pending changes before undo.
  - On a replay failure (conflict), show a toast and drop the entry.
- **M6-30 ✅ LIKELY (v2.1 §8.1 "Zustand … เลี่ยง re-render ทั้งกริด"): performance.**
  - Keep selection and editing state outside the React tree (a small store with `useSyncExternalStore`). Adding Zustand requires a Decision.
  - Memoize cells.
  - Use **one shared tooltip/popover** driven by event delegation (data attributes), not an MUI `<Tooltip>` per cell.
- **M6-31 ✅ (v2.1 §8.9 = SPEC §8.9): accessibility.**
  - `role="grid"` plus `aria-rowcount`/`aria-colcount` for the **full** virtual size, and `aria-rowindex`/`aria-colindex` on rendered cells.
  - Optional (v2.1): announce via `aria-live` when the user's edit creates a new overload.
- **M6-32 ✅ VERIFIED (v2.1 §12.2 = SPEC F1): golden F1.**
  - Seed **10 tasks**.
  - total **19500**, committed **11625**; POS **4625/2750**, DW 3000/3000, Mobile 5875/5875, CRM **2500/0**, Store 3500/0; OVER/RISK 0/0.
  - Per user-week values come from `golden-fixtures.json › expected.F1.byUserWeek`.
  - `seed:golden` writes WEEK rows as f×500 cd, with **no holiday deduction** (v2.1 §9.1's rule: imported Excel values must not be adjusted).
- **M6-33 ✅ (v2.1 §12.3 adapted): e2e.**
  - #4 keyboard-only edit, then reload: the value persists.
  - #11 an override on a parent changes all its children; an override on a child wins.
  - #13 scrolling 6 months forward loads data without hanging.
  - #17 complete a task with future load → toast → undo → numbers restored.
  - AC-203 "ปิดใช้งาน" label in the grid (M1-03).

### M7: Daily resolution

- **M7-01 ✅ VERIFIED: BR-22 order that keeps "only the edited part changes"** (v2.1 §5.5 step 4, "ผลรวมสัปดาห์เปลี่ยนเฉพาะส่วนที่ผู้ใช้แก้").
  1. derived = `distributeInt(weekCd, dayCaps)`, falling back to the schedule when the week capacity is 0.
  2. Replace the edited days with the user's values.
  3. Enforce DAY ≤ 100 on the **non-edited** days via spill (§3.1).
  4. DELETE the WEEK row, then INSERT the non-zero days.

  Vectors:
  - AC-804, Ivy 250: derived [50,50,50,50,50]; edit Wed = 100 gives a total of 300 ✓.
  - F2 Jack 500 (Friday holiday), edit Mon = 100: the naive result [100,125,125,125] is **rejected by the DB check** (VERIFIED 1.25 insert). With spill it becomes [100,100,100,100, Fri 75 + warning], total 475.
- **M7-02 ✅ VERIFIED:** derived display values may exceed 100 cd (125) in the dashed cells; only stored rows are capped. SPEC's §8.4 mock for Peter (250 cd, Friday holiday → "╌0.6" ×4) matches BR-21 exactly: [63,63,62,62]. Jack's "1.0 ×4" in the same mock would imply 4.0 against the golden 5.0, so treat it as illustrative and compute e2e expectations.
- **M7-03 ✅ VERIFIED / UNCERTAIN (v2.1 §5.5 "ต้อง clamp ไม่ให้วันใดเกิน dayCapacity — ถ้าเกินให้ไหลไปวันถัดไป"): SCALE overflow.**
  - v2.1's own example (Mon 1.0, Tue 1.0, Wed 0.5; total 2.5 → 4.0) gives [160,160,80], which violates BR-26 and the DB.
  - Cap-and-spill (hard cap 100; receivers tiered dayCap>0 → schedule>0 → any; earliest first) gives **[100,100,100,100]**. That coincidentally equals v2.1's "เติมวันที่ยังว่าง" result.
  - Decision: clamp at `dayCapacity` first (v2.1's stricter rule) or only at 100 (simplest, and keeps overload visible under P4).
- **M7-04 ✅ VERIFIED (v2.1 `if (weekCap === 0) return 0` ❌ → SPEC BR-21a): zero-capacity fallbacks.**
  - With weekCap = 0, distribute by schedule (VERIFIED: 250 → [50,50,50,50,50]).
  - **Second fallback:** if the schedule also sums to 0 (a user with no working days), the total is **lost** (VERIFIED: 250 → only the typed 50 remains). Distribute evenly over Mon–Fri instead, and warn.
- **M7-05 ✅ VERIFIED (model): undo/redo snapshots.**
  - A snapshot of a DAY week = all 7 days (null for empty days).
  - A snapshot of a WEEK week = `{WEEK: v}`; replaying it over a DAY week uses `onDayWeekConflict:'COLLAPSE'`.
  - An empty week = WEEK null (deletes everything).
  - A partial snapshot after COLLAPSE gives sum 350 instead of 250 (VERIFIED).
- **M7-06 ❌ / ✅ (v2.1 §5.5 "detail หาย (ต้องเตือน)" vs SPEC P2): "↕ รวมเป็นรายสัปดาห์" (BR-23).** Run it immediately and show the toast "รวมเป็นรายสัปดาห์แล้ว · เลิกทำ", with no warning dialog. Implement it through the single write path: a WEEK change equal to the current day sum, with COLLAPSE.
- **M7-07 ✅ / ❌ (v2.1 §5.5 dialog): BR-24 dialog.**
  - Show the current breakdown ("จ 1.0 · อ 1.0 · พ 0.5"), the line "กำลังเปลี่ยนยอดรวมจาก 2.5 → 4.0 วัน", and **two** options with result previews computed by the domain.
  - SPEC labels: "ปรับตามสัดส่วนเดิม" / "เปลี่ยนเป็นรายสัปดาห์".
  - ❌ v2.1's third option "เติมวันที่ยังว่าง" and its `EXPAND|REDISTRIBUTE|COLLAPSE` enum; SPEC uses `SCALE|COLLAPSE`.
  - Cancel rolls back the optimistic week value. With several conflicting weeks, show one dialog ("มี N สัปดาห์ที่วางรายวันอยู่") applied to all of them.
  - This is a choice dialog that SPEC mandates, not the forbidden delete-confirm.
- **M7-08 ✅ VERIFIED / derived (v2.1 §8.4 "ขยายเป็น 5–7 วัน"): expanded columns.**
  - Show Mon–Fri. Include Sat/Sun only when a visible person's schedule includes that day, or a DAY allocation exists there. The server decides `periods`.
  - Header "19 ต.ค. 2569" plus narrow weekday labels (Intl: "จ อ พ พฤ ศ ส อา"), with 🎌 on holidays.
- **M7-09 ✅ VERIFIED (v2.1 §5.5 "เส้นประ / opacity ต่ำ" = SPEC §8.4): rendering.**
  - Derived day cells are dashed or low-opacity; DAY cells are solid.
  - The ⋯ tooltip shows the daily breakdown with **2 decimals**, because 1-decimal values can look wrong: [63,63,62,62] displays as 0.6 ×4 = "2.4" against a week of 2.5.
- **M7-10 ✅ (v2.1 §5.8 "ใช้ได้ทั้งระดับวันและสัปดาห์"; §5.6 "ลาครึ่งวัน + งานเต็มวัน → OVER +0.5"): day-level overload.** Vector: dayCap 50 with committed 100 → OVER, excess 50. Show it in the day zoom (M7) and in the person grid (M9).
- **M7-11 ✅ (v2.1 §5.6 "ไม่ลบงานอัตโนมัติ"):** leave recorded after DAY rows exist on those days changes nothing. Surface `ALLOCATED_ON_TIME_OFF` (the time-off impact carries `allocationsOnTimeOffDays`, and saves re-emit it). v2.1's "ปุ่มย้าย" is ❌; use a link only.
- **M7-12 ✅ (v2.1 VR-03):** DAY rows on Saturday or Sunday are allowed with a non-blocking `WEEKEND_DAY` or `ALLOCATED_ON_NON_WORKING_DAY` warning. Schedules may include Saturday.
- **M7-13 ✅ VERIFIED:** cross-year week. A DAY on 2027-01-01 has `week_start` 2026-12-28 and is accepted. The golden has Mint at 250 cd in week 2026-12-28, which makes a good e2e week.
- **M7-14 ✅ VERIFIED:** the server always computes a DAY row's `week_start`; the DB rejects a mismatched value (`allocations_check`).
- **M7-15 ✅ derived:** a batch that mixes DAY and WEEK changes for the same week is applied **in order**. The client flushes before the user switches level within the same week.
- **M7-16 ✅:** Cmd+↓ (expand, FR-803), Cmd+↑ (collapse the view, v2.1) and the "↕" button (BR-23 data collapse) are three distinct actions.
- **M7-17 ✅ (v2.1 §5.7 invariants + SPEC §5.3): fast-check properties.**
  - Σ distribute = t.
  - expand → collapse preserves the week total.
  - Σ displayed days (cd) = week total.
  - committed ≤ total.
  - atRisk = total − committed ≥ 0.
  - spill output: every day ≤ 100 and the sum is preserved.
- **M7-18 ✅ (v2.1 §12.3 #5/#6/#7):**
  - Expand → edit Wed → the week total updates → collapse the view → ⋯ is visible.
  - Edit the total of a DAY week → dialog → "ปรับตามสัดส่วนเดิม" → the values are correct.
  - "↕" → the total is unchanged and the detail is gone → undo restores the days exactly.

### M8: Milestones

- **M8-01 ❌ (v2.1 §4.10 "สิ่งที่จงใจไม่มี … milestone", §1.5):** v2.1 deliberately had no milestones. SPEC restored them (decisions-log round 5). Follow SPEC §4.7 / BR-70..72.
- **M8-02 ✅ derived:** reuse the Warning shape for BR-71: `LATE_FOR_MILESTONE`, when a save puts a linked, unfinished task's allocation after the milestone date.
- **M8-03 ✅ derived:** add ◆ to the calendar (built in M5) and the grid in M8, and to home in M10 (FR-705/907/1101).

### M9: Workload and per-person views

- **M9-01 ✅ VERIFIED (v2.1 §5.8): excess.** OVER → committed − cap; RISK → total − cap; OK → 0. It matches golden F2 (100), F3 (200) and F4 (50).
- **M9-02 ✅ VERIFIED:** the cause is computed for OVER **and** RISK (F4 = RISK/CAPACITY). BOTH means `lost > 0 && total > standard`.
- **M9-03 ✅ test vectors (v2.1 §12.1 → cd):**

| committed | total | cap | standard | expected |
|---|---|---|---|---|
| 600 | 600 | 500 | 500 | OVER 100 WORKLOAD |
| 500 | 500 | 300 | 500 (2 days leave) | OVER 200 CAPACITY |
| 600 | 600 | 300 | 500 | OVER 300 BOTH |
| 0 | 600 | 500 | 500 | RISK 100 WORKLOAD |
| 500 | 500 | 500 | 500 | **OK** (equal is not over) |
| 0 | 250 | 200 | 500 | RISK 50 CAPACITY (F4) |
| 100 | 100 | 0 | 0 (non-working) | OVER 100 WORKLOAD |
| 0 | 0 | 0 | 500 (full leave) | OK, utilization null |

- **M9-04 ✅ (v2.1 §5.6 edge "แสดง — ไม่ใช่ 0%"): cap = 0.** Utilization is `null` and shows "—". Fraction mode falls back to days. Level: committed > 0 → OVER; total > 0 → RISK. Colour follows BR-45: stripes, plus red if load > 0.
- **M9-05 ✅ derived (v2.1 §7.1 `WorkloadCell`/`CapacityCell`):** response shape in §4.4. It includes `standardCd`, `holidayLostCd` and `leaveLostCd` for the tooltip. On a day that is both holiday and leave, attribute the loss to the **holiday** (BR-12).
- **M9-06 ✅ UNCERTAIN (derived): deactivated users.** With BR-13, cap = 0 after deactivation. If `standard` still follows the schedule, the cause becomes CAPACITY ("เพราะลา/วันหยุด"), which is misleading. Decision: `standard = 0` from `deactivated_on`, so the cause is WORKLOAD, and label the row "ปิดใช้งาน".
- **M9-07 ✅ (v2.1 §8.6): tooltip template.**
  ```
  Peter · สัปดาห์ 5 ต.ค.
  ภาระทั้งหมด       5.00 วัน
  แน่นอน           5.00 วัน
  ยังไม่แน่นอน       0.00 วัน
  ───────────────
  Capacity 3.00 วัน (มาตรฐาน 5.00 − ลาพักร้อน 2.00)      ← masked viewers: "− ลา 2.00"
  🔴 เกิน 2.00 วัน — สาเหตุ: capacity หดจากวันลา/วันหยุด
  ```
  Use SPEC's labels (ทั้งหมด / แน่นอน / ยังไม่แน่นอน) rather than v2.1's "ยังไม่ชัวร์" and "ส่วนต่าง".
- **M9-08 ✅ / ❌ (v2.1 §8.8 → SPEC FR-1006): the "รายการที่ล้น" tab.**
  - Columns: คน · สัปดาห์ · ระดับ (🔴 OVER / 🟡 RISK, plus text) · เกิน (+2.0) · สาเหตุ · [แก้].
  - Cause text examples: "🏖 capacity หด (ลา 2 วัน)", "📈 งานเยอะ (POS 5.0 + DW 0.5)" (other projects masked as "งานในโปรเจคอื่น"), "CRM Migration 0.75 (อาจไม่ทำ)".
  - [แก้] is a link to `/people/[id]?week=YYYY-MM-DD` that scrolls to and highlights the cell (v2.1: "เปิด Planner พร้อม scroll + highlight").
  - ❌ v2.1's separate `/alerts` page, KPI cards, filter-by-cause, and quick-fix buttons ([เลื่อนงานไปสัปดาห์ถัดไป] [ย้ายให้คนอื่น] [ลดขอบเขตงาน]); v2.1 e2e #9 depends on them.
- **M9-09 ✅ UNCERTAIN (v2.1 §7.4 `newOverloads`): FR-906 overload part.** For the weeks touched by the leave, compute the level before and after. Report weeks where the level worsened (OK→RISK/OVER, RISK→OVER) or the excess grew. List contributing tasks with cd, masked for the viewer. Links only.
- **M9-10 ✅:** the FR-1007 badge counts OVER cells in the next 4 weeks among the people the viewer may see (§3.3). Compute it server-side with the same workload service.
- **M9-11 ✅ UNCERTAIN (v2.1 §5.7 activePeople / §8.3 mock 30%): team utilization.** Should the Manager count in team capacity? Golden week 2026-08-31 total is 750 cd: **30.0%** over 5 workers vs **25.0%** over 6 users. Other weeks follow the same pattern (see §6). Decide once, and use the same rule for home FR-1101 "% ใช้กำลังคนทีม".
- **M9-12 ✅ (v2.1 FR-74, E2E #10):** changing a project's certainty updates the workload "แน่นอน" view without a reload (TanStack invalidation, M2-02).
- **M9-13 ❌ (v2.1 §8.6 "Zoom เดียวกับ Planner" incl. quarter/day):** SPEC's workload is weekly (12 weeks + scroll) only.
- **M9-14 ✅ (SPEC §3.3 + v2.1 CapacityCell colour): masked responses.** Never send leave type, note or **colour**, nor project or task names. Other projects become one "งานในโปรเจคอื่น" entry with cd. Test with `JSON.stringify(res).includes(name) === false` (SPEC §11.2).
- **M9-15 ✅ VERIFIED:** the SPEC §8.5 mock reflects **F2 and F3 applied together**: Jack 19/10 "5/4🔴", Peter 5/10 "5/3🔴", Peter 19/10 "2.5/4". That combined state makes a good M9 e2e fixture. The mock's compact format ("5/5", "3.8/5") vs the grid's "5.0" needs a small formatting Decision.

### M10: Home and search

- **M10-01 ✅ (v2.1 US-18/E2E #18 → SPEC FR-1102/FR-611):** choosing a task in Cmd+K navigates to `/projects/[id]/tasks?task=<id>` (or the plan tab) and opens the panel. Results respect authz (FR-1104).
- **M10-02 ✅ (v2.1 §1.5 #6 → SPEC P6):** the manager card answers "who is over this week and next" at a glance, one click from `/workload`.
- **M10-03 ✅:** the "ภาระของฉัน 8 สัปดาห์" mini bars use BR-45 integer thresholds. Include value text or an aria-label, never colour alone.

### M11: Hardening and deploy

- **M11-01 ✅ / ❌: performance tests.** Seed at SPEC §9 scale (100 users, 300 projects, 20k tasks, 5k pages, 3 years), not v2.1's 50/200/5k. Optionally add v2.1's leak check: scroll horizontally for 2 minutes, and fail if the JS heap grows > 20% (Chromium CDP / `performance.memory`).
- **M11-02 ❌ (v2.1 §10 PITR 7 days):** follow SPEC §10.5 (`pg_dump -Fc` daily, keep 14 days, plus a tar of uploads).
- **M11-03 ✅:** keep the query-discipline guard (M6-20) in `pnpm check`.
- **M11-04 ✅ (v2.1 §8.9 = SPEC §8.9):** contrast ≥ 4.5:1 in light and dark, and full keyboard-only operation of the grid.

---

## 3. Cross-cutting edge-case catalogues

### 3.1 WEEK ↔ DAY (M6/M7)

| # | Case | Required behaviour | Status |
|---|---|---|---|
| E1 | Overloaded WEEK (derived day > 100 cd) materialized by BR-22 | Cap-and-spill on non-edited days; warn when spilling into a dayCap = 0 day | VERIFIED (DB rejects 1.25) |
| E2 | weekCap = 0 | BR-21a: distribute by schedule, flag "วางงานในวันที่ไม่ทำงาน" | VERIFIED |
| E3 | schedule sum = 0 as well | Even split over Mon–Fri (or refuse) plus warning; never lose the total | VERIFIED (loss shown) |
| E4 | DAY edit on a WEEK week equals the derived value | Still materialize (simplest; AC-804 expects the other days to become real) | UNCERTAIN |
| E5 | WEEK null/0 on a DAY week | Delete all rows of the week, no dialog | derived |
| E6 | Undo/redo | Complete week snapshots; COLLAPSE option for WEEK restores | VERIFIED (model) |
| E7 | Batch mixes WEEK and DAY for the same week | Apply sequentially; client flushes on level switch | derived |
| E8 | Last DAY row of a week deleted | Week becomes empty (no resolution) | derived |
| E9 | SCALE with new total > Σ caps | Spill (v2.1 clamp rule); preview shows the result | VERIFIED |
| E10 | SCALE values not multiples of 25 cd | Allowed; BR-27 applies to typed values only | derived |
| E11 | 1-decimal display of derived days does not sum visibly | Tooltip shows 2 decimals | VERIFIED |
| E12 | Which day columns to show | Mon–Fri plus weekend if a schedule or DAY row needs it | derived |
| E13 | Leave added later on DAY-planned days | No change; warning; day-level OVER visible | ✅ v2.1 §5.6 |
| E14 | Half-day leave + 1.0 DAY | Day-level OVER 50 | ✅ v2.1 §5.6 |
| E15 | Deactivated user's future weeks | cap 0 → BR-21a by schedule; "ปิดใช้งาน" | derived |
| E16 | Cross-year week | `week_start` 2026-12-28 holds DAY rows dated 2027-01-01..03 | VERIFIED |
| E17 | Client sends a wrong `week_start` | Server derives it; the DB check is the backstop | VERIFIED |
| E18 | Concurrent writers | Version bump/row lock first | VERIFIED |
| E19 | BR-25 edge week with an existing WEEK row | Materialize first, then replace the in-range days only | derived |
| E20 | BR-25 range with zero capacity | Schedule fallback or refuse | derived |

### 3.2 Capacity (M5)

The rows of M5-02, plus:
- Leave on a weekend inside a range has no effect.
- A holiday on a non-working day has no effect.
- Holiday + leave on the same day is attributed to the holiday.
- Schedule edits have **no history** in SPEC. v2.1's `effective_from` is ❌, so changing a schedule retroactively changes past capacity and overload. Mention this in the UI or README.
- AM + PM as two entries on one day are rejected (VERIFIED).
- Restoring an overlapping leave is rejected (VERIFIED).

### 3.3 Overload (M9)

- `load = cap` → OK.
- Excess per level (M9-01).
- The cause is computed for RISK too.
- cap = 0 → utilization null.
- Deactivation cause (Decision).
- Archived/deleted projects are excluded, but the project grid can still display them (flag).
- Completed tasks: weeks after `completed_week` are excluded.
- Unassigned tasks are excluded.
- Masking (names, leave type, colour).
- The Manager-in-team-capacity rule (Decision).

### 3.4 Completion (M3/M6)

Weeks before or equal to the completion week count; later weeks don't. A DAY row later in the same week still counts. Unchecking restores the load. A parent done with open children leaves the children counting. The toast shows X and N (M6-28). Completion never deletes allocations (v2.1 §5.11).

### 3.5 Undo and optimistic updates (M3/M5/M6/M7)

- The 50-step stack stores `{label, undo, redo}`.
- Soft-delete batches restore by `deleted_batch` and re-check authz (SPEC).
- Restore failures: 23505 / 23P01 give a friendly toast.
- Plan edits: full week snapshots, latest version, flush first.
- Optimistic rollback goes to the last server-confirmed state.
- `NEEDS_CHOICE` keeps the pending value while the dialog is open.
- Retry is available from the toast.

### 3.6 Keyboard, selection, fill and paste (M6)

See M6-04..M6-11. The key rules:
- Use `event.code`.
- Key selections by (rowKey, periodKey).
- Evaluate `f`/`h`/fractions per cell.
- Drop the TSV trailing newline.
- Copy exact 2-decimal values.
- A shift moves the selection with the values.
- A multi-assignment operation is one undo entry.

---

## 4. Proposed shapes for gaps in SPEC

All shapes use cd integers and ISO strings. They are additive to SPEC §7.4; record them in PROGRESS › Decisions.

### 4.1 `Warning` (M6; codes extended in M7 and M8)

```ts
type WarningCode =
  | 'ALLOCATED_ON_TIME_OFF'        // v2.1 §7.3 / §5.6: plan on a leave day (M7 day level; M5 impact list)
  | 'ALLOCATED_ON_NON_WORKING_DAY' // BR-21a flag "วางงานในวันที่ไม่ทำงาน"; spill into dayCap=0 day; v2.1 VR-09
  | 'WEEKEND_DAY'                  // v2.1 VR-03 (optional: can be folded into NON_WORKING)
  | 'DEACTIVATED_USER'             // planning on/after deactivated_on
  | 'LATE_FOR_MILESTONE'           // BR-71 (M8)
interface Warning { code: WarningCode; week?: ISODate; date?: ISODate; message: string } // message from th.ts, masked per §3.3
```

### 4.2 `saveAllocations` additions (M6)

```ts
// SPEC output kept; additive fields marked (+)
| { ok: false; code: 'VERSION_CONFLICT'; current: { version: number /*(+)*/; weeks: Record<ISODate, WeekState> } }
| { ok: false; code: 'NEEDS_CHOICE'; week: ISODate; weeks: ISODate[] /*(+) all conflicting weeks*/ }
type WeekState = { cd: number; resolution: 'WEEK' | 'DAY'; days?: Record<ISODate, number> }
```

For multi-row fill, paste and shift, choose one option and record it as a Decision:

- **(a)** The client sends one `saveAllocations` per assignment (the SPEC signature). Undo groups them into one entry. Partial failure is possible and is reported per row.
- **(b)** A batched variant `saveAllocationsBatch({ items: SaveAllocationsInput[] })`, all-or-nothing in **one transaction**. It locks the assignments in a stable order (sorted by id) to avoid deadlocks. This is closer to v2.1's `POST /api/allocations/bulk` and to CLAUDE.md's "one transaction for multi-table writes".

### 4.3 Time-off save result (M5, extended in M9)

```ts
// M5
{ ok: true; id: string; batch?: string;
  capacityImpact: { week: ISODate; beforeCd: number; afterCd: number }[];
  allocationsOnTimeOffDays: { date: ISODate; taskId: string; taskName: string /*masked if needed*/; cd: number }[] }
// M9 adds
  newOverloads: { userId: string; week: ISODate; level: 'OVER'|'RISK'; excessCd: number; cause: 'WORKLOAD'|'CAPACITY'|'BOTH';
                  tasks: { taskId: string|null; name: string /* or 'งานในโปรเจคอื่น' */; cd: number }[] }[]
// error (FR-905)
{ ok: false; code: 'TIME_OFF_OVERLAP'; message: 'ทับกับวันลา 5–6 ต.ค. 2569 (ลาพักร้อน)'; conflictId: string }
```

### 4.4 Workload (M9) — `GET /api/workload?from&to&view=total|committed|atRisk&position&project&overOnly`

```ts
interface WorkloadResponse {
  weeks: ISODate[]
  groups: { positionId: string|null; positionName: string; userIds: string[] }[]
  users: Record<string, { name: string; nickname: string|null; deactivatedOn: ISODate|null }>
  cells: Record<string /*userId*/, Record<ISODate, {
    totalCd: number; committedCd: number; atRiskCd: number
    capacityCd: number; standardCd: number; holidayLostCd: number; leaveLostCd: number
    level: 'OK'|'RISK'|'OVER'; excessCd: number; cause: 'WORKLOAD'|'CAPACITY'|'BOTH'|null
  }>>
  overCount4w: number                // FR-1007 badge (or a separate endpoint)
}
// click panel (FR-1005): GET /api/workload/cell?userId&week → { items: { projectId|null; projectName|'งานในโปรเจคอื่น'; taskId|null; taskName|null; cd; certainty }[] }
```

### 4.5 Grid additions (M6)

- `GridRow` task: `certaintySourceTaskId?: string`; person grid: `certaintySourceName?: string`.
- `GridRow` task/assignee: `totalCd` (all-time within `TOTALS_HORIZON`) for the "รวม" column.
- `people[userId]`: an optional `holidayLost` / `leaveLost` map for tooltips.

---

## 5. SQL and performance tactics

1. **Lock, then write** (VERIFIED):
   ```sql
   UPDATE task_assignments SET version = version + 1
    WHERE id = $1 AND version = $2 AND deleted_at IS NULL
   RETURNING version;              -- 0 rows ⇒ VERSION_CONFLICT (stop)
   -- per touched week: DELETE rows that must disappear, then INSERT/UPSERT new rows
   ```
   Multi-assignment transactions lock in ascending id order.
2. **Per person-week aggregation** (v2.1 §6.5 = SPEC §6.5). Use `sum(...) FILTER (WHERE coalesce(t.certainty_override,p1.certainty_override,p2.certainty_override,pr.certainty)='CONFIRMED')`, two LEFT JOINs (no recursion), and a mandatory `week_start` range.
3. **Two composite indexes** (v2.1 §6.2/§6.7 rationale, "week_start denormalized ⇒ one index serves both granularities"):
   - `(week_start, task_assignment_id)` for workload scans across everyone;
   - `(task_assignment_id, week_start)` for the project grid via its assignments.
4. **Leave in a window** (VERIFIED EXPLAIN). Use `user_id = ANY($ids) AND deleted_at IS NULL AND start_date < $to AND end_date >= $from` (btree partial index), or `daterange(start_date,end_date,'[]') && daterange($from,$to,'[)')` (the exclusion GiST index).
5. **FR-905 conflict lookup** after a 23P01: `SELECT … FROM time_off WHERE user_id=$u AND deleted_at IS NULL AND daterange(start_date,end_date,'[]') && daterange($s,$e,'[]') LIMIT 1`.
6. **Future load for FR-406 and BR-52:**
   ```sql
   SELECT sum(a.person_days), count(DISTINCT a.week_start)
   FROM allocations a
   JOIN task_assignments ta ON ta.id = a.task_assignment_id AND ta.deleted_at IS NULL
   WHERE ta.task_id = ANY($taskIds)
     AND a.week_start > $completedWeekOrThisWeek
     AND a.week_start < $horizonEnd
   ```
   This is bounded, so it meets the discipline rule.
7. **No materialized capacity view and no job runner** (v2.1 §6.6 ❌). Compute capacity in TypeScript per request.
8. **Custom SQL migration** (`drizzle/9999_triggers.sql` or a drizzle-kit custom migration): extensions, the WEEK/DAY trigger, the named `EXCLUDE` constraint (Drizzle has no builder, VERIFIED), and any SQL Drizzle cannot express. The generated `completed_week` and the partial unique index can live in `schema.ts` (`generatedAlwaysAs`, `uniqueIndex().on().where()` exist in 0.45.3, VERIFIED in d.ts).
9. **Error mapping table** in `action()`:
   - `P0001` + message prefix `WEEK_DAY_CONFLICT` → reload + toast (should never reach users);
   - `23P01` → overlap message;
   - `23505` (on restore) → "กู้คืนไม่ได้…";
   - `23514` → validation message.

   Never show raw DB text.
10. **Request bounds:** Zod caps grid, workload and search windows so that no unbounded query exists (v2.1 §5.1, "ห้ามมี query ที่ดึงทุกอย่าง").

---

## 6. Test vectors (numbers ready to paste)

- **distribute (use the integer version):**

| Input | Result |
|---|---|
| 250 over [100×5,0,0] | [50,50,50,50,50,0,0] |
| 250 over [100×4,0,0,0] (Friday holiday) | [63,63,62,62,0,0,0] |
| 500 over [100×4,0,0,0] | [125,125,125,125,0,0,0] (display only; storing violates the DAY cap) |
| 250 over [100×3,0×4] | [84,83,83,…] |
| 100 over [60×5,0,0] | [20×5,0,0] |
| t=10, w=[0,0,25,25,100] | int **[0,0,2,2,6]** (SPEC float gives [0,0,2,1,7]) |
| t=42, w=[25,25,40] | int **[12,12,18]** (float gives [12,11,19]) |
| t=3, w=[0,0,40,40,100] | int **[0,0,1,1,1]** (float gives [0,0,1,0,2]) |

- **cap-and-spill:**
  - [160,160,80] → [100,100,100,100,0,0,0]
  - F2 Jack with Mon fixed 100: [100,125,125,125,0,0,0] with dayCaps [100,100,100,100,0,0,0] → [100,100,100,100,75,0,0] plus a warning on Fri
  - WEEK 700 → [100×7] plus warnings on Sat and Sun
- **Formatting:** 375→"3.8", 125→"1.3", 625→"6.3", 1875→"18.8", 35→"0.4", 15→"0.2", 5→"0.1", 0→"".
- **Dates:** `weekStart('2026-10-04')='2026-09-28'`; the week of 2026-12-28 contains 2027-01-01; `todayBangkok` at 2026-09-29T23:30Z = '2026-09-30'; Intl th-TH gives "30 ก.ย. 2569" and "30 ก.ย.".
- **Capacity:** the M5-02 table.
- **Overload:** the M9-03 table; golden F2 (Jack and Mint, 2026-10-19, OVER 100 CAPACITY, 500/400), F3 (Peter, 2026-10-05, OVER 200 CAPACITY, 500/300), F4 (Cindy, 2026-10-12, RISK 50 CAPACITY, total 250, committed 0, cap 200).
- **Golden weekly team totals (cd),** from week 2026-08-31 to 2026-12-28:
  - total: 750, 1000, 1250, 1375, 1625, 1875, 1875, 1875, 1375, 1125, 875, 750, 750, 875, 625, 750, 500, 250 (Σ 19500)
  - committed: 750, 1000, 1250, 1375, 1625, 1625, 1375, 1250, 750, 375, 250, 0, 0, 0, 0, 0, 0, 0 (Σ 11625)
  - utilization over 5 workers: 30, 40, 50, 55, 65, 75, 75, 75, 55, 45, 35, 30, 30, 35, 25, 30, 20, 10 %
  - over 6 users: 25.0, 33.3, 41.7, 45.8, 54.2, 62.5, …
  - v2.1's own §8.3 mock ("17.5" for 12 Oct) does **not** match the golden 18.75. Treat v2.1 mock numbers as illustrative.
- **POS footer** (Cindy+Ivy+Mint, project only), weeks 14/9..19/10: 625, 500, 500, 125, 0, 0 cd; capacity 1500 ×5 and 1200 in the F2 holiday week.
- **Undo model:**
  - COLLAPSE of [100,100,50] → WEEK 250. A partial undo gives [100,100,50,50,50] (sum 350, wrong); a full 7-day undo gives [100,100,50] ✓.
  - AC-804 expansion [50,50,100,50,50] (sum 300): undo without an option → `NEEDS_CHOICE`; with COLLAPSE → WEEK 250 ✓.

---

## 7. Thai strings from v2.1, adapted to SPEC wording (for `src/i18n/th.ts`)

| Key (suggested) | Text | Source |
|---|---|---|
| `grid.fractionTooltip` | `{f} × {n} วันทำการ = {d} วัน` | v2.1 §5.2 |
| `grid.dayDetailMarker` | `มีรายละเอียดรายวัน` | SPEC §8.3 legend / v2.1 §8.3 |
| `grid.collapseToWeek` | `↕ รวมเป็นรายสัปดาห์` | SPEC §8.4 (v2.1 "กลับเป็นระดับสัปดาห์") |
| `grid.collapsedToast` | `รวมเป็นรายสัปดาห์แล้ว · เลิกทำ` | derived (P2) |
| `grid.br24.title` | `สัปดาห์นี้มีการวางรายวันอยู่ ({breakdown})` | v2.1 §5.5 |
| `grid.br24.body` | `คุณกำลังเปลี่ยนยอดรวมจาก {from} → {to} วัน` | v2.1 §5.5 |
| `grid.br24.scale` / `grid.br24.collapse` | `ปรับตามสัดส่วนเดิม` / `เปลี่ยนเป็นรายสัปดาห์` | SPEC BR-24 |
| `warn.allocatedOnTimeOff` | `{name} ลา{type?}วันนี้ — มีงาน {d} วันวางไว้` (type omitted when masked) | v2.1 §7.3 |
| `warn.nonWorkingDay` | `วางงานในวันที่ไม่ทำงาน` | SPEC BR-21a / v2.1 VR-09 |
| `timeOff.impact` | `capacity ลดจาก {before} → {after} เพราะ{type} {range}` | v2.1 §5.6 |
| `timeOff.overlap` | `ทับกับวันลา {range} ({type})` | derived FR-905 |
| `timeOff.halfDaySameDay` | `ลาครึ่งวันเช้าและบ่ายวันเดียวกันไม่ได้ — บันทึกเป็นเต็มวันแทน` | derived (VERIFIED behaviour) |
| `restore.failed` | `กู้คืนไม่ได้ เพราะ{reason}` | derived |
| `overload.title` | `{name} · สัปดาห์ {week} — เกิน {d} วัน` | v2.1 §5.6 |
| `overload.cause.CAPACITY` | `capacity หดจากวันลา/วันหยุด` | v2.1 §8.6/§8.8 |
| `overload.cause.WORKLOAD` | `งานเยอะ` | v2.1 §8.8 |
| `overload.cause.BOTH` | `งานเยอะและ capacity หด` | derived |
| `workload.tooltip.capacity` | `Capacity {cap} วัน (มาตรฐาน {std} − {reasons})` | v2.1 §8.6 |
| `task.completedReleased` | `ปลดภาระ {x} วัน ในอีก {n} สัปดาห์ · เลิกทำ` | SPEC BR-52 (v2.1 §5.11 wording differs slightly) |
| `task.unassigned` | `รอมอบหมาย` | SPEC FR-606 |
| `task.certainty.inherit.project` | `ตามโปรเจค ({value})` | v2.1 §8.11 + BR-36 |
| `task.certainty.inherit.ancestor` | `สืบทอดจาก '{name}' ({value})` | BR-36 |
| `err.valueTooLarge` | `ค่าต่อช่องสูงสุด {max} วัน` | derived BR-26 |

---

## 8. Conflicts: v2.1 ideas the plan must not follow (all ❌)

| # | v2.1 idea (ref) | SPEC 3.0 rule |
|---|---|---|
| C1 | Sections: Project → Section → Task, `sections` table, `section_id`, FR-04/12, group by section, board by section (§5.3, §6.2, §8.3, §8.11) | D8: no sections; use parent tasks |
| C2 | Leave approval (FR-58, §11 Phase 2), `time_off.status`, quota (`counts_against_quota`, FR-59) | §1.4: no approval of any kind, no quota |
| C3 | `organizations`/`org_id`, users vs people split, roles ADMIN/PLANNER/MEMBER/VIEWER, Executive persona (§6.2, FR-105, §3.1) | single workspace; manager/worker + LEAD/MEMBER; every user is a person |
| C4 | Auth.js Google SSO / magic link (FR-104, §8.1) | Better Auth email+password, no signup |
| C5 | "No milestones" (§4.10 list, §1.5) | Milestones are MVP (M8) |
| C6 | 3 zoom levels: quarter/month/week (FR-21, §8.3) | 2 levels: week/day (FR-802) |
| C7 | Default display unit = fraction 0–1 (§1.2 #1) | D6: days by default; fraction is a preference |
| C8 | Digit shortcuts `1`/`7`/`5`/`2`, `0` = clear (§8.5) | Digits start editing; `f`/`h` shortcuts |
| C9 | `Cmd+←/→` shifts the whole task bar; `shift {weeks, skipNonWorking}` endpoint (§8.5, §7.2) | Shift the selected range ±1 column; no skipNonWorking |
| C10 | Drag task bars and bar edges, skipping holidays (FR-37, §8.4, E2E #12) | Not in SPEC (fill handle only) |
| C11 | Third BR-24 option "เติมวันที่ยังว่าง"; `EXPAND/REDISTRIBUTE/COLLAPSE`; `RESOLUTION_CONFLICT`/`CONFLICT` 409 (§5.5, §7.3) | Two options `SCALE`/`COLLAPSE`; codes `NEEDS_CHOICE`, `VERSION_CONFLICT` |
| C12 | REST API for writes (`PUT /api/task-assignments/:id/allocations`, `POST /api/tasks`, …) (§7.2) | Writes are server actions; reads for grid/workload are route handlers |
| C13 | `derivedDayLoad` with `round2` float and `weekCap===0 → 0` (§5.5) | BR-21 largest remainder in cd, plus BR-21a |
| C14 | Float person-days arithmetic in domain code (§5.2 `parseFraction`, §5.6 `round2`) | BR-01 integer cd |
| C15 | `toWeekStart(d: Date)`, date-fns(-tz) (§5.1, §8.1) | BR-04 ISO strings + `src/domain/dates.ts` |
| C16 | VR-01: `person_days ≤ 7` for DAY as well | BR-26: DAY ≤ 100 cd, WEEK ≤ 700 cd |
| C17 | Recursive certainty view and a `'default'` source (§6.5, §5.4) | Two LEFT JOINs; `project.certainty` NOT NULL |
| C18 | Materialized capacity view + background job, Trigger.dev/pg-boss (§6.6, §8.1) | Capacity computed in the domain per request; no job runner |
| C19 | Scenario overlay (`scenario_id`, tombstones, FR-90..93) | Phase 2 |
| C20 | Move tasks across projects (FR-12, §5.3, test "ย้าย task ข้าม project") | BR-33: not in MVP |
| C21 | "Adding a child to a task with allocation → ask" (§5.3) | FR-610: move automatically + undo toast |
| C22 | Confirm dialogs: deleting a task with children (2 steps), deleting a person (§5.3, VR-08) | P2: no confirm (except permanent project delete); deactivate instead of delete |
| C23 | Seed Thai holidays 2 years ahead, `import-th`, `is_substitute` (§5.6, FR-50, §6.2) | D9: manager imports CSV; bootstrap seeds no holidays |
| C24 | `work_schedules.effective_from` history (§6.2) | PK (user_id, weekday); no history |
| C25 | `time_off.fraction numeric` (§6.2) | `half` enum AM/PM, single day only |
| C26 | xlsx import/export in the MVP, "DoD = import xlsx matches" (FR-100..102, §9, E2E #2/#14) | Phase 2 (#10); golden JSON seed instead |
| C27 | List grouping by project/client/start week; planner "group by" switch (§8.3, §8.10) | FR-613: none/assignee/milestone/certainty |
| C28 | `/alerts` page with KPI cards and quick-fix buttons (§8.8, §5.6, §7.4, E2E #9) | "รายการที่ล้น" tab in `/workload` + links to fix |
| C29 | Automatic spread from task start/due dates, `POST /api/tasks/:id/autospread` (FR-40) | FR-612 explicit "วางแผน" with preview (BR-25) |
| C30 | `completed_at timestamptz` with generated `completed_week` (§6.2) | `completed_on date` (v2.1's version fails: "not immutable", VERIFIED) |
| C31 | Notifications, e.g. "วันหยุดชดเชยเพิ่มทีหลัง → แจ้ง overload", Slack/email (§5.6, FR-109) | No notifications in the MVP |
| C32 | Routes `/`=planner, `/list`, `/timeline`, `/me`, `/alerts`, `/board` (§8.2) | `/home`, `/my`, `/workload`, `/calendar`, `/people/[id]`, `/projects/[id]/(overview\|plan\|tasks\|pages)` |
| C33 | Workload with the planner's zoom levels (§8.6) | Weekly only |
| C34 | Warn before DAY→WEEK collapse (§5.5) | P2: act + undo toast |
| C35 | Perf targets for 50 people; backups with PITR 7 days (§10, §12.4) | SPEC §9 / §10.5 |
| C36 | "≤ 7 concepts" numeric rule (§1.5 #1); tags (FR-06) | Rule removed (decisions-log round 5); tags not planned |
| C37 | Grid state library Zustand, TanStack Table, Recharts, react-hook-form, next-intl (§8.1) | Not in the SPEC stack; add only with a Decision |
| C38 | v2.1 §11 roadmap order (list view before grid, etc.) | SPEC §12 milestone order |
| C39 | "Mobile = read-only + leave" (§10) | SPEC: mobile = home, my tasks, leave, read docs |
| C40 | Holiday/leave per-type colour shown to everyone (§7.1 `CapacityCell.timeOff.color`) | §3.3 masking: others see only "ลา" (and no colour) |

---

## 9. Decisions the plan should pre-register (`PROGRESS.md › Decisions`)

| # | Topic | Recommended choice | Why |
|---|---|---|---|
| D-R5-01 | `distribute` tie-break | Integer remainder comparison | BR-21 tie rule; BR-01 (VERIFIED divergence) |
| D-R5-02 | DAY cap spill rule (BR-22/24/25) | Hard cap 100; spill to earliest non-edited day, tiers dayCap>0 → schedule>0 → any; warn on non-working days | DB check + v2.1 §5.5 intent; always fits (700 = 7×100) |
| D-R5-03 | Schedule sum = 0 fallback | Even split over Mon–Fri + warning | Never lose totals (VERIFIED loss) |
| D-R5-04 | Fraction unit | 2 decimals; cap=0 → show days; typed fractions with cap=0 use the standard capacity | Excel familiarity; never silently delete |
| D-R5-05 | `h` rounding | `Math.round(cap/2)` exact cd (BR-27 only for typed numbers) | Simplest; AC-802 covers `f` |
| D-R5-06 | "รวม" totals | All-time within `TOTALS_HORIZON` = ±5 years | SPEC mock + discipline rule |
| D-R5-07 | Multi-row paste/fill write | Batched all-or-nothing action (or per-assignment calls grouped in undo) | Atomicity (CLAUDE.md one transaction) |
| D-R5-08 | `NEEDS_CHOICE` | Client pre-detects; one choice for all weeks; additive `weeks[]` | Fewer round trips |
| D-R5-09 | BR-24 in M6 | Pull the SCALE/COLLAPSE dialog into M6, because BR-25 creates DAY weeks there | Sequencing gap |
| D-R5-10 | Cmd+←/→ collision | Selection moves; destination overwritten; undo available | Excel-like, simple |
| D-R5-11 | Paste larger/smaller than selection | Anchor top-left; tile only on exact multiples | Excel semantics |
| D-R5-12 | Deactivated users in overload | `standard = 0` after `deactivated_on` → cause WORKLOAD; label "ปิดใช้งาน" | Avoid "เพราะลา" mislabel |
| D-R5-13 | Team utilization population | Users shown in the table (state whether the Manager is included); same rule on home | 30% vs 25% difference |
| D-R5-14 | `newOverloads` definition | Level worsened or excess increased | v2.1 §7.4 "new" |
| D-R5-15 | Tab-indent with the same user on both tasks | Block with a toast | Avoid 23505; SPEC forbids dialogs |
| D-R5-16 | `certainty.ts` timing | Implement in M3 (pure, tiny) or show the override only until M6 | M3 panel needs BR-36 |
| D-R5-17 | Holiday CSV format | ISO dates only (optionally convert BE years −543); UTF-8 BOM/CRLF tolerant; upsert by date | FR-901 / D9 |
| D-R5-18 | Heat vs band colours | Heat (blue) = cell intensity; bands (BR-45) = person load vs capacity | v2.1 §5.9 clarifies SPEC tokens |
| D-R5-19 | DAY edit equal to the derived value | Still materialize the week | Simplest, matches AC-804 |
| D-R5-20 | Workload vs grid number format | Grid "5.0"; workload "5/4" compact (per the SPEC mocks) | SPEC §8.3 vs §8.5 mocks |

---

## 10. Verification log (commands and output excerpts)

### 10.1 `distribute` (Node 26.5.0), from `r5/distribute.mjs` and `r5/distribute2.mjs`

```
Peter 250 WEEK, Fri 2026-10-23 holiday (SPEC §8.4 mock)  [63,63,62,62,0,0,0] sum= 250
Jack 500 WEEK, Fri holiday (golden F2 week 2026-10-19)     [125,125,125,125,0,0,0] sum= 500
v2.1 BR-24 SCALE 250->400 weights [100,100,50]             [160,160,80] sum= 400
v2.1 derivedDayLoad 2.5 over 3 days                        [0.83,0.83,0.83,0,0,0,0] sum= 2.4899999999999998
v2.1 derivedDayLoad weekCap=0                              [0,0,0,0,0,0,0] sum= 0
float-vs-integer tie-break differences found: 398591
{"t":42,"w":[25,25,40],"spec":[12,11,19],"int":[12,12,18]}
dayCap weights {0,50,100}, 5 days, t<=700: {"diffs":0,"total":170100}
SCALE weights multiples of 25, 5 days, t<=700: {"diffs":21045,"total":2187500,"ex":{"t":10,"w":[0,0,25,25,100],"spec":[0,0,2,1,7],"int":[0,0,2,2,6]}}
part-time weights {0,40,60,80,100}, 5 days: {"diffs":15735,"total":2187500,"ex":{"t":3,"w":[0,0,40,40,100],"spec":[0,0,1,0,2],"int":[0,0,1,1,1]}}
```

Proposed domain code:

```ts
export function distribute(totalCd: number, weights: readonly number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW === 0) return weights.map(() => 0)
  const floor = weights.map(w => Math.floor((totalCd * w) / sumW))
  const remN = weights.map((w, i) => totalCd * w - floor[i]! * sumW)   // exact integer remainders
  let rem = totalCd - floor.reduce((a, b) => a + b, 0)
  const order = weights.map((_, i) => i).sort((a, b) => remN[b]! - remN[a]! || a - b) // ties → earlier day
  for (const i of order) { if (rem-- <= 0) break; floor[i]!++ }
  return floor
}
```

### 10.2 Formatting and dates (`r5/distribute2.mjs`)

```
todayBangkok at 2026-09-29T23:30Z = 2026-09-30
cd=35     toFixed(1)= 0.3    Intl th max1= 0.4    int half-up= 0.4
cd=15     toFixed(1)= 0.1    Intl th max1= 0.2    int half-up= 0.2
dateStyle medium th-TH UTC: 30 ก.ย. 2569
header day+month short  : 30 ก.ย.
weekday narrow th       : จ อ พ พฤ ศ ส อา
Same instant, TZ=America/Los_Angeles w/o timeZone opt: 29 ก.ย. 2569 (off-by-one if runtime TZ is west of UTC)
ICU: 78.3 unicode 17.0
"๑.๕" -> 1.5    ",5" -> .5
```

### 10.3 Postgres 17.11 (`schema.sql`, `seed2.sql`, `timeoff.sql`; container removed)

```
 t-sun  | 2026-10-04   | 2026-09-28            -- SPEC generated completed_week OK (Sunday → Monday)
ERROR:  generation expression is not immutable -- v2.1 timestamptz variant
INSERT 0 1 (name = NBSP)                       -- passes length(trim(name))>0
ERROR:  P0001: WEEK_DAY_CONFLICT: assignment … week 2026-10-19   -- sequential trigger works
BEGIN; DELETE 1; INSERT 0 2; COMMIT            -- DELETE-then-INSERT in one tx OK
ERROR: new row … violates check constraint "allocations_check" (… DAY … 1.25)   -- overloaded materialization
ERROR: new row … violates check constraint "allocations_check" (DAY 2026-10-26 with week_start 2026-10-19)
INSERT 0 1 (DAY 2027-01-01, week_start 2026-12-28)
numeric(4,2): 0.125 → 0.13, 0.135 → 0.14
```

Race, without a lock (sessions A and B concurrent; A sleeps 3 s before commit):

```
== session A: BEGIN / INSERT 0 1 / COMMIT
== session B: BEGIN / INSERT 0 1 / COMMIT
 WEEK | 2026-11-09 | 2.50
 DAY  | 2026-11-11 | 1.00          ← BR-20b violated
```

With `UPDATE … SET version=version+1 WHERE id=… AND version=1`:

```
== A: version 2 / UPDATE 1 / INSERT 0 1 / COMMIT
== B (blocked ~2.1s, then 0 rows => VERSION_CONFLICT): UPDATE 0
```

With `SELECT … FOR UPDATE` (no version predicate):

```
== B: ERROR:  WEEK_DAY_CONFLICT: assignment …04 week 2026-11-09   (trigger now sees committed row)
```

Time off:

```
23P01 conflicting key value violates exclusion constraint "time_off_user_id_daterange_excl"
DETAIL: Key (…)=(u1, [2026-10-06,2026-10-08)) conflicts with existing key (…)=(u1, [2026-10-05,2026-10-07))
AM + PM same day → 23P01 ; half on multi-day → 23514 time_off_check1 ; restore after overlap → 23P01
EXPLAIN (seqscan off): daterange && → Index Scan using time_off_user_id_daterange_excl
                       start_date < … AND end_date >= … → Index Scan using time_off_user_id_start_date_end_date_idx
restore assignment after re-assign → 23505 duplicate key value violates unique constraint "task_assignments_active"
```

### 10.4 Week/day model (`r5/weekday-model.mjs`)

```
before            : DAY Mon:100 Tue:100 Wed:50 (sum 250)
after COLLAPSE    : WEEK 250
undo (3 days only): DAY Mon:100 Tue:100 Wed:50 Thu:50 Fri:50 (sum 350)  <-- WRONG
undo (all 7 days) : DAY Mon:100 Tue:100 Wed:50 (sum 250)  <-- exact
AC-804 edit Wed=1.0: DAY Mon:50 Tue:50 Wed:100 Thu:50 Fri:50 (sum 300)
undo w/o option    : {"needsChoice":true}
undo with COLLAPSE : WEEK 250
SCALE 250->400     : DAY Mon:160 Tue:160 Wed:80 (sum 400)  <-- violates BR-26 DAY<=100 / DB check
F2 Jack edit Mon=1 : DAY Mon:100 Tue:125 Wed:125 Thu:125 (sum 475)  <-- violates DAY<=100
full-week leave    : DAY Mon:50 Tue:50 Wed:50 Thu:50 Fri:50 (sum 250)
no schedule at all : DAY Fri:50 (sum 50)  <-- week total 250 lost
```

`r5/spill.mjs` (proposed rule):

```
SCALE 250->400 [160,160,80]      {"v":[100,100,100,100,0,0,0],"warnings":[]}
F2 Jack Mon fixed 100, rest 125  {"v":[100,100,100,100,75,0,0],"warnings":[{"code":"ALLOCATED_ON_NON_WORKING_DAY","dayIndex":4}]}
WEEK 700 materialized            {"v":[100,100,100,100,100,100,100],"warnings":[…dayIndex 5, 6]}
```

```ts
export function capAndSpill(values: number[], fixed: boolean[], dayCaps: number[], schedule: number[], hardCap = 100) {
  const v = [...values]; let excess = 0
  for (let i = 0; i < 7; i++) if (!fixed[i] && v[i]! > hardCap) { excess += v[i]! - hardCap; v[i] = hardCap }
  const tiers = [(i: number) => dayCaps[i]! > 0, (i: number) => schedule[i]! > 0, () => true]
  const warnings: { code: 'ALLOCATED_ON_NON_WORKING_DAY'; dayIndex: number }[] = []
  for (const inTier of tiers) for (let i = 0; i < 7 && excess > 0; i++) {
    if (fixed[i] || !inTier(i)) continue
    const take = Math.min(hardCap - v[i]!, excess); if (take <= 0) continue
    v[i]! += take; excess -= take
    if (dayCaps[i] === 0) warnings.push({ code: 'ALLOCATED_ON_NON_WORKING_DAY', dayIndex: i })
  }
  if (excess > 0) throw new Error('unreachable when WEEK <= 700')
  return { v, warnings }
}
```

### 10.5 Library and API facts

- `@tanstack/query-core` 5.104.0 `build/modern/hydration-*.d.ts`: `maxPages?: number` ("Maximum number of pages to store in the data of an infinite query") and `getPreviousPageParam?: GetPreviousPageParamFunction` (VERIFIED).
- `drizzle-orm` 0.45.3 `pg-core`: `check(name, sql)`, `index().where(sql)`, `generatedAlwaysAs(...)` exist; **no EXCLUDE constraint builder** (VERIFIED by grep; "exclude" appears only as `excludedMethods` typings).
- MUI X Data Grid:
  - "With the Data Grid Premium, you can apply the `cellSelection` prop to let users select individual cells or ranges of cells" (https://mui.com/x/react-data-grid/cell-selection/).
  - Clipboard paste is marked Premium, and its examples use `DataGridPremium` (https://mui.com/x/react-data-grid/clipboard/). VERIFIED.
- Thai Kedmanee (xmodmap.th, TIS-620 codes, https://stuff.mit.edu/afs/sipb/project/gnome/old-and-dead/share/xmodmap/xmodmap.th): `f` → acute(0xB4) = "ด", `h` → eacute(0xE9) = "้", `1` → aring(0xE5) = "ๅ" / shift "+", `2` shift → ntilde(0xF1) = "๑", `4` → Agrave(0xC0) = "ภ", `z` → onequarter(0xBC) = "ผ". Background: https://en.wikipedia.org/wiki/Thai_Kedmanee_keyboard_layout. VERIFIED.
- Golden fixture facts (python over `golden-fixtures.json`): 10 tasks; `expected.F1.byUserWeek` covers only Cindy, Ivy, Peter, Jack, Mint (the Manager has no plan); F1 overloads `[]`; F2/F3/F4 `excessCd` = 100/200/50 with causes CAPACITY; the weekly totals are listed in §6.
