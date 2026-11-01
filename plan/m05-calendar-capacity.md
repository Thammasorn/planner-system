# M5 — Calendar, holidays, leave, capacity

> Depends on: M4 ✅ · SPEC: §3.2 (holidays/leave types row, both leave rows), §3.3 (leave masking), §4.9 (FR-901…909; FR-906 capacity part only), §5.1, §5.2 (BR-10…13), §6.2 (`holidays`, `leave_types`, `time_off` + exclusion), §10.4 (bootstrap step 2 + step 4), §11.1 (capacity), §11.3 (F2–F4 setups), §12 M5 ·
> Owner-visible result: a manager maintains company holidays (one by one or by CSV import with preview) and leave types; every employee records leave (full day / morning / afternoon) from the team calendar or the user menu, sees immediately how it changes their capacity week by week, can delete it with undo, and the month calendar `/calendar` shows everyone's leave the viewer may see (other people's leave only as "ลา") plus holidays.

---

## 1. Goal and scope

### 1.1 In scope

Legend for "Where": stream.step in §5. "Test": `unit` = Vitest node, `ui` = Vitest jsdom, `int` = Vitest + Postgres, `authz` = row in `tests/authz/rows/*.ts`, `mask` = `tests/authz/masking.int.test.ts`, `golden` = `tests/golden/capacity.int.test.ts`, `e2e` = scenario id in `e2e/m5-calendar.spec.ts` (§7.3).

SPEC §4.9 defines **no `AC-9xx` ids**. The acceptance criteria of M5 are the three SPEC §12 M5 e2e bullets, labelled here **AC-M5-a** "บันทึกลา", **AC-M5-b** "ลาทับถูกปฏิเสธ", **AC-M5-c** "import CSV วันหยุด", plus "unit test ครบ §5.2" (**AC-M5-d**).

| ID | What M5 delivers | Where | Test |
|---|---|---|---|
| FR-901 | Manager manages holidays: add / edit / delete one by one (hard delete + undo re-insert, X64) and **CSV import** (`date,name`; UTF-8 with BOM or windows-874; optional header; RFC 4180 quotes; ISO dates only; duplicates in file = error; existing dates upserted; preview; all-or-nothing; ≤ 500 rows); sample CSV download; `pnpm import:holidays <file.csv>` shares the parser | S1.2 parser · S2.2 service · S2.8 script · S3.6 page + import dialog | unit `src/lib/csv/holidays.test.ts` · int `holidays.int.test.ts`, `scripts/lib/import-holidays.int.test.ts` · authz PERM-02f…j · e2e E4 |
| FR-902 | Manager manages leave types: name, colour, order (up/down); delete if unused else archive (X64); unarchive; at least one active type; bootstrap seeds ลาพักร้อน, ลาป่วย, ลากิจ, อบรม/สัมมนา when the table is empty | S2.3 service · S2.9 bootstrap · S3.7 page | int `leave-types.int.test.ts` · int `tests/integration/bootstrap.int.test.ts` (M5 cases) · authz PERM-02k…p · e2e E6 |
| FR-903 | Record own leave: date range (two pickers, X50), type, full / ครึ่งวันเช้า / ครึ่งวันบ่าย (half only when start = end), note | S0.6 schemas · S2.4 service · S3.4 `LeaveDialog` | unit `src/lib/schemas/time-off.test.ts` · int `time-off.int.test.ts` · ui `LeaveDialog.test.tsx` · authz PERM-20a…e · e2e E1 |
| FR-904 | No approval: the entry is effective on save (no status column, no workflow) | S2.4 | int `time-off.int.test.ts › effective immediately` (capacity loader sees it in the same request) |
| FR-905 | Overlap rejected, naming the conflicting entry; AM + PM on the same date rejected with the "แก้รายการเดิมเป็นเต็มวัน" hint (X64); `23P01` → `OVERLAP` backstop | S2.4 · S0.3 custom migration | int `time-off.int.test.ts › overlap*` · int `schema.int.test.ts › exclusion` · e2e E2 |
| FR-906 (capacity part, X23) | After save (create or update): impact panel "สัปดาห์ <d>: X → Y วัน" for every affected week, or "ไม่กระทบ capacity" | S1.1 `weekCapacityImpact` · S2.4 · S3.5 `ImpactPanel` | unit `capacity.test.ts › impact` · int `time-off.int.test.ts › impact` · e2e E1, E4, E5 |
| FR-907 (leave + holidays, X24) | `/calendar` month view: custom CSS grid, Monday first, 6 rows, holidays grey with their name, weekends shaded, leave chips (stripes + text, never colour alone), "+N", เช้า/บ่าย markers, keyboard accessible, agenda list < 600 px; leave of `visibleUserIds(viewer)` only; other people's entries masked as "ลา" (no type, note, colour, id) | S1.3 month helpers · S2.6 calendar service + route · S0.8 masking · S3.2–S3.3 | int `calendar.int.test.ts` · mask (calendar block) · ui `MonthGrid.test.tsx` · e2e E1, E5, E7 |
| FR-908 | Click or drag an empty day range (or keyboard Shift+arrows + Enter) → leave dialog pre-filled with the range | S3.2 selection · S3.4 | ui `MonthGrid.test.tsx › selection` · e2e E1, E8 |
| FR-909 | Delete leave → 8 s toast "เลิกทำ" + Cmd+Z (no confirm); restore re-checks authz, 30-day window and overlap ("กู้คืนไม่ได้ เพราะทับกับวันลาที่บันทึกภายหลัง") | S2.4 `deleteTimeOff`/`restoreTimeOff` · S3.4 | int `time-off.int.test.ts › restore*` · authz PERM-20c/d, 21e/f · e2e E3 |
| BR-04/05/06 (consumed) | Plan dates are ISO strings; weeks Monday-first; "today" from `serverToday()`/`useToday()` (all from M1, X01) | every step | lint + the tests above |
| BR-10 | `dayCapacityCd` = schedule → 0 on holiday → minus leave → clamp ≥ 0 | S1.1 | unit (every §5.2 row) |
| BR-11 | `weekCapacityCd` = Σ 7 days | S1.1 | unit + fast-check |
| BR-12 | Holiday on a leave day is not deducted twice | S1.1 | unit row "วันหยุดวันศุกร์ + ลาวันศุกร์ = 400" · e2e E4 (leave on the imported holiday → "ไม่กระทบ capacity") |
| BR-13 | Deactivated user: capacity 0 from `deactivated_on` (inclusive) (X64) | S1.1 · S2.5 loader reads `deactivated_on` | unit · int `capacity.int.test.ts › deactivated` |
| BR-42 (M5 part) | Leave only lowers capacity; leave writes never touch tasks/assignments (allocations arrive in M6) | S2.4 | int `time-off.int.test.ts › BR-42 never edits plans` |
| §5.2 test table / §11.1 capacity (AC-M5-d) | All 7 rows + BR-12, BR-13, part-time half days, cross-week ranges, weekend/holiday-only leave | S1.1 | unit `src/domain/capacity.test.ts` (coverage ≥ 95 %) |
| Capacity loader (PLAN §3.10, r6a M5-14) | `services/capacity.ts#loadCapacity(tx, userIds, {from,to})` → per-day and per-week `{ capacityCd, standardCd }`; first consumer = impact; reused by M6 (footer, `f`/`h`) and M9 | S2.5 | int `capacity.int.test.ts › parity with domain` · golden |
| §11.3 F2/F3/F4 setups (X11) | `applyFixture(db, 'F2'|'F3'|'F4')`, each = F1 + its own setup (not cumulative); `pnpm seed:golden --fixture=F3`; `resetDb(fixture)` in e2e | S2.10 · S5.1 | int `scripts/lib/fixtures.int.test.ts` · golden `capacity.int.test.ts` (r8 §4.4 numbers) |
| §10.4 step 2 / step 4 (DEP-09, DEP-11) | Bootstrap seeds 4 leave types only when empty; never seeds holidays; idempotent | S2.9 | int `tests/integration/bootstrap.int.test.ts › M5` |
| FR-1201 / X44 | One audit row per mutating action (`holiday`, `leave_type`, `time_off`) inside the transaction (holiday import = one row) | S2.2–S2.4 | authz audit assertion on every mutating `allow` · int |
| §3.3 / MASK-5 / MASK-7 / X30 / X43 | First masking consumer: calendar returns only visible users; other people's leave = `{ kind: 'masked', userId, startDate, endDate, half, label: 'ลา' }`; no type id/name, colour, note or entry id leaves the server | S0.8 `maskTimeOff` · S2.6 | mask (world + golden) · int `calendar.int.test.ts` · e2e E5 |
| NFR-07b (M5 part) | Leave reporting works on a phone: agenda list < 600 px and a full-screen dialog | S3.3 · S3.4 | e2e E7 (390 × 844) |
| A11Y-1 (M5 part) | Leave chips = stripe pattern + text; holidays = grey + name text; half days = "เช้า/บ่าย" text; today = outline + "วันนี้" text + `aria-current="date"`; selection = `aria-selected` + outline | S3.2 | ui `MonthGrid.test.tsx › never colour alone` |
| UI-12 (M5 part) | Dates shown as "5 ต.ค. 2569"; month title "ตุลาคม 2569" from a fixed `th` month table (no ICU drift) | S0.9 format helpers · S1.3 | unit `format.test.ts`, `month-grid.test.ts` |

**§3.2 permission rows in scope** (PERM numbering = §3.2 table order, as in M1–M3):

| PERM | §3.2 row | M | L | Me | W | Rows (§7.2) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-02 (holidays + leave-types part) | จัดการตำแหน่ง, **วันหยุด, ประเภทการลา** | allow | 403 | 403 | 403 | PERM-02f…02p (`/settings/holidays`, `/settings/leave-types` pages → 404 for workers, X41) |
| PERM-20 | บันทึก/แก้/ลบวันลาของตัวเอง | allow | allow | allow | allow | PERM-20a…20e |
| PERM-21 | บันทึก/แก้/ลบวันลาของคนอื่น | allow | 403 | 403 | 403 (404 when the target person is not visible, M5-D3) | PERM-21a…21g |
| PERM-22 (calendar part) | ดู workload — whose leave appears (§3.3) | all | all (LEAD) | self + co-members | self + co-members | PERM-22a + mask |

### 1.2 Out of scope (do NOT build; target milestone)

| Item | Lands in |
|---|---|
| FR-906 overload part: "overload ใหม่" lines with links (BR-42 notification), `newOverloads` in the save result | M9 (X23) |
| ◆ milestones on `/calendar` (FR-907/FR-705), a `milestones` field in `CalendarResponse` — **no stub field** | M8 (X24) |
| Leave/holiday display inside the planning grid (FR-807 stripes, `people[u].timeOff`), `f`/`h` capacity keys, footer capacity | M6 (consumes `services/capacity.ts` + `maskTimeOff`) |
| `allocationsOnTimeOffDays` → `TimeOffImpact.onTimeOffDays`, and `TimeOffImpact.overloads` (additive fields of M5's `impact`; M9 updates M5's deep-equal `impact` tests, C36) | M9 (M9-D18; M7-D15 deferred it) |
| `allocations` checksum in the BR-42 test | M6 extends `time-off.int.test.ts` |
| Day-level overload glyphs (BR-40/45 per day) | M7 (X06) |
| Workload tables, overload list, person page "วันลา" tab, FR-1007 badge | M9 |
| Home "ใครลาวันนี้ / สัปดาห์นี้" card, palette quick command "แจ้งลา" (reuses `useLeaveDialog`) | M10 (X68) |
| `seed:demo` leave entries (Appendix A.2) | M12 |
| Leave approval, quotas, balances, HR | SPEC §1.4 (never) |
| Seeding official Thai holidays, `is_substitute`, B.E. → C.E. auto conversion in CSV | SPEC §10.4 step 4 / D9 (never) — ISO only, X64 |
| Google Calendar sync, notifications (e.g. "new holiday causes overload") | SPEC §13 Phase 3 / Phase 2 #6 |
| Work-schedule effective dating (schedule history) | not in SPEC (X60: none) |
| Trash for old batches (only refusal after 30 days) | SPEC §13 #9 |

### 1.3 Carried-in items (delivered earlier, used here)

| From | Item | Ruling |
|---|---|---|
| M0 | Custom migration `0000_extensions` (pg_trgm, **btree_gist**, pgcrypto) — required by `time_off_no_overlap` | X10 |
| M1 | `src/domain/dates.ts` complete (weekStart, addDays, daysOfWeek, weekRange, isoWeekday, isISODate, compareISO, diffDays, eachDay, min/maxISO, todayBangkok) + §11.1 dates tests. SPEC §12 M5 lists `dates.ts`; M5 only verifies it exists and adds nothing to it | X01 |
| M1 | `units.ts` `numericToCd`/`cdToNumeric` (impact numbers shown via `cdToNumeric`, e.g. 500 → `'5.00'`); `work_schedules` repo (`getSchedule`); `user.deactivated_on` set by deactivation | X02, X60 |
| M1 | `serverToday()` (APP_NOW), `TodayProvider`/`useToday()`, `UndoProvider` + `useUndo()` (8 s toast, Cmd+Z), `usePreferences()`, `requireManagerPage()`, settings layout with tabs, `UserMenu`, positions page pattern (hard delete + `restore*` same id; up/down moves under `lockOrderScope`) | X04, X45, X48, M1-D14 |
| M1 | Authz matrix harness (`AuthzRow` with `audit`), `asUser`, `outcomeOf`, `createWorld`, `makeUser`; `scripts/lib/{db,fixtures,bootstrap}.ts`; `e2e/fixtures.ts` `resetDb()`/`loginAs()` | X11, X46 |
| M2 | `visibleUserIds`, `visibleProjectIds`, `isLeadAnywhere`, `services/masking.ts` skeleton, `tests/authz/masking.int.test.ts` skeleton with `assertNoLeak`; `GET /api/people/options` (X09) for the manager's employee selector; `colorSchema`, `optionalText`, `userIdSchema`; `PROJECT_COLORS` | X30, X43 |
| M3 | `DateField` (ISO ↔ Dayjs only there), `@mui/x-date-pickers` + `dayjs` + `LocalizationProvider` installed; `?` shortcut registry (`src/lib/shortcuts.ts`); restore pattern (30-day window on DB timestamps, M3-D12) | X50, X07 |
| M4 | Nothing specific (charters/pages untouched); the M4 e2e must keep passing. `seedGolden` already writes M4's 5 charter pages + 5 audit rows, so every M5 seed/audit count assertion is **relative** (delta over the previous stage, C3/C23/M12-D28) | — |

---

## 2. Read first

- **SPEC:** §0–§3 (esp. §3.2 rows PERM-02/20/21/22, §3.3, §3.4), §4.9, §5.1, §5.2, §5.6 (BR-41 `standard`, BR-42), §6.1, §6.2 (`holidays`, `leave_types`, `time_off`, `work_schedules`, `user.deactivated_on`), §7.3, §7.5, §8.1 (sidebar "📅 ปฏิทินทีม"), §8.6, §8.7 (`--nonworking --holiday --timeoff --today`), §8.8, §8.9, §9 (mobile = แจ้งลา), §10.4, §11.1, §11.3, §12 M5, §14 D7/D9, Appendix A.1.
- **PLAN.md:** §1.2 (no new dependency in M5), §1.3 (Drizzle custom migrations + error shape, Zod 4, MUI 9 slots, Next `refresh()`, Playwright clock), §1.4 X01, X04, X10, X11, X23, X24, X30, X40–X50, X53–X59, X64; §2.3 ownership; §3.4 (errors, `action()`, `route()`, authz API incl. `requireTimeOffEdit`, masking, transactions, audit, clock); §3.5 (query keys `calendar`, invalidation); §3.6 (types `TimeOffSpan`, dates, format); §3.7 i18n; §3.8 undo; §3.9 UI (CSS Modules for dense cells); §3.13 seeds (`applyFixture`, `import-holidays.ts`); §4.3–§4.6.
- **Research:** `plan/research/r6a-gaps-m0-m5.md` §3.6 (M5-01…M5-16), §5.5 (CSV decoding), §6 rows 30–34, §7 (visibility per golden user); `plan/research/r2-auth-db.md` §9.3–§9.4 (custom migration), §10.3 (23P01 shape), §11.2 T1–T3c, §11.3 items 4–5, §12 (Drizzle definitions of the three tables); `plan/research/snippets/r2/sql/94_halfday.sql` (why AM+PM conflict — the half-aware variant there is **not** adopted, X64); `plan/research/r4-client-testing.md` §28 (windows-874), §29 (Zod 4), §37 (fast-check), §38 (Playwright clock); `plan/research/r1-next-mui-tooling.md` §2.3 (`refresh()`), §8.6 (MUI 9 API), §9 (pickers, Buddhist era, two pickers); `plan/research/r8-golden.md` §2.3, §4.3, §4.4; `plan/research/r5-v21-mining.md` M5-01…M5-15, §3.2, §4.3, §8 C2/C23/C31/C40.
- **docs:** `docs/reference/golden-fixtures.json` (`users`, `expected.F2|F3|F4.setup`).

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | What it means in M5 |
|---|---|
| X01 | `dates.ts` already exists (M1). M5 adds only `src/domain/capacity.ts`; month arithmetic for the calendar lives in `src/lib/calendar/month-grid.ts` on top of `dates.ts`. |
| X04 | Leave deletion returns `deleted_batch`; undo = `restoreTimeOff({ batch })` through M1's `UndoProvider` (8 s toast + Cmd+Z). Holidays / leave types use the positions pattern (hard delete, undo re-inserts the same id). |
| X10 | M5 tables: `holidays`, `leave_types`, `time_off` (one generated migration) + custom migration `time_off_no_overlap` (EXCLUDE USING gist, needs M0's btree_gist). |
| X11 | `seedGolden` gains the 4 default leave types (via `ensureDefaultLeaveTypes`); `applyFixture(db, 'F2'|'F3'|'F4')` = F1 + its own setup only; `seed-golden --fixture=F3`. |
| X23 | FR-906 in M5 = capacity before → after per affected week; overload lines are M9. |
| X24 | Calendar = leave + holidays; ◆ milestones are M8 (no placeholder). |
| X30 | `services/masking.ts` gains `maskTimeOff`; the calendar is its first consumer; masking leak tests grow (calendar block). |
| X40 | `pnpm check` includes integration (needs `pnpm db:up`). |
| X41 | Settings pages → `notFound()` for workers; manager-only actions → `FORBIDDEN`; invisible person or entry → 404. |
| X43 | Calendar people = `visibleUserIds(viewer)` (manager / LEAD of a non-archived project → all; else self + co-members of non-archived projects; deactivated included). |
| X44 | Every mutating action writes exactly one audit row in its transaction (entities `holiday`, `leave_type`, `time_off`). |
| X45 | "today" (default month, impact labels) from `serverToday()` / `useToday()`; integration/e2e pin `APP_NOW=2026-09-30T10:00:00+07:00`. |
| X46 | E2E on the production build; `resetDb(fixture?)` per `describe` block; API login; page objects `e2e/pages/{calendar,leave-dialog,holidays,leave-types}.ts`. |
| X47 | `z.uuid()`, `z.iso.date()`; Thai only via `th.*` (also in `src/server`); `refresh()` (never `revalidateTag`). |
| X48 | `leave_types.position` = `orderKey` (`text COLLATE "C"`), keys generated on the server under `lockOrderScope(tx, 'leave_types')`, `ORDER BY position, id`, re-key on equal neighbours. |
| X49 | Calendar keyboard: arrows/Shift+arrows/Enter/Space/Escape matched via `e.code`-first helper (`src/lib/keys.ts`). |
| X50 | Leave dialog = two `DateField`s (M3) — start and end — no range picker (Pro). |
| X53 | No `localStorage`; month in the URL (`?month=YYYY-MM`). No client `crypto.randomUUID`. |
| X54 | Formatters/linters ignore the plan documents; nothing in M5 touches them except this file's own edits by the orchestrator. |
| X55 | Integration DB names are per run (`planner_test_<run>_w<ID>`), so S2's and S4's integration runs can overlap safely; the e2e DB is migrated/seeded in `webServer.command` and each `describe` still calls `resetDb(fixture?)` from the Playwright process. |
| X56 | `server-only` only in `session.ts`/`clock.ts`: M5 repos/services (holidays, leave types, time off, capacity, calendar) stay importable from `scripts/import-holidays.ts`, `bootstrap`, `seed-golden` and Playwright `resetDb`; services never read the clock. `scripts/*.ts` compile as CommonJS under tsx → no top-level `await`, no `import.meta` (wrap in `main()`). |
| X57 | No `loading.tsx` and no Suspense above `/calendar`, `/settings/holidays`, `/settings/leave-types`; their authz (`requirePageUser` / `requireManagerPage`) runs first; loaders that can 404 use `orNotFound()`. |
| X58 | Calendar keys register in `src/lib/shortcuts.ts` (built on `HOTKEYS` in `src/lib/keys.ts`); leave-type moves send intent (`id`, `direction`), never order keys. |
| X59 | Services write audit rows in the caller's tx (actor `null` from scripts) — M5-D2; factories insert with plain Drizzle; S0 creates no runtime file under `src/domain/**` (capacity signatures are documented in S1.1); session mocks are plain functions; the integration project already includes `scripts/**` and `tests/**` `*.int.test.ts`. |
| X64 | `dayCapacityCd(..., deactivatedOn?)` → 0 from the deactivation date; `standardDayCd` ignores holidays, leave and deactivation; AM + PM same date rejected with "ทับกับ … — ถ้าลาทั้งวันให้แก้รายการเดิมเป็นเต็มวัน", `23P01` → `OVERLAP` backstop; leave may cover weekends/holidays; half day = −50 cd clamped at 0; past leave editable by the person and the manager (audited); CSV rules (UTF-8 + BOM, windows-874 fallback, optional header, RFC 4180, ISO only, duplicates = error, upsert existing, all-or-nothing + preview, ≤ 500 rows); holidays hard-deleted with undo re-insert; leave type in use is archived; month view = custom CSS grid, Monday first. |
| X80 / X87 | New files are kebab-case (`leave-types.ts`, `time-off.ts`); they join the barrels as `repo.holidays`, `repo.leaveTypes`, `repo.timeOff` and `services.holidays`, `services.leaveTypes`, `services.timeOff`, `services.capacity`, `services.calendar`. |
| X83 | Client reads use `getJson` from `src/lib/api.ts` (M2). |
| X84 | Calendar is appended to `PRIMARY_NAV` after `tasks`; M9 inserts `workload` before it (final order home, my, tasks, workload, calendar). |
| X90 | `getCalendar(tx, viewer, range, today)` — `today` from the route; M8 uses it for ◆ status. |
| X91 | `WorldPart` `'timeOff'` builder; rows files registered in `tests/authz/rows/index.ts`; `FixtureId` widened; seed/audit count tests relative. |
| X93 | `AuditEntity` gains `holiday`, `leave_type`, `time_off`. |

### 3.2 New milestone decisions (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M5-D1 | §12 M5, PLAN §5 | Streams refined from the skeleton: **S1 (domain + pure lib) runs before S2 and S3** (both import `capacity.ts`, the CSV parser and the month helpers; S0 must not create throwing domain stubs, which would fail the 95 % coverage gate). The test stream is split like M3: **S4** = authz rows, masking, golden capacity, older integration tests (test-first, after S0 only); **S5** = e2e + page objects + older specs. Service-level integration tests are written test-first by S2 inside `src/server/**` and `scripts/**` (M3-D1 convention). | Ownership by path (PLAN §2.3) without duplicated work; domain gate stays green at G0. |
| M5-D2 | FR-1201, PLAN §3.4.6, X59 | Audit rows for M5 entities are written **by the service** as its last statement inside the caller's transaction (M1-D5), because `bootstrap`, `import-holidays`, `applyFixture` and `seedGolden` call the same services with `actor = null`. Actions never write a second row. The holiday CSV import writes **one** row (`entityId` = a server-generated import id, `after: { inserted, updated, dates }`). | One code path for UI and scripts; X44 "one row per user operation". |
| M5-D3 | §3.2 PERM-21, X41 | `requireTimeOffEdit(tx, user, targetUserId): Promise<void>` (async, refines PLAN §3.4.4's `void`): self → ok; manager → ok if the user exists else 404; worker → 404 when the target is outside `visibleUserIds(user)` (or does not exist), otherwise 403. Entry actions look the entry up first (`getLiveOrNotFound`) and check its `user_id`. | "Not visible → 404" (§3.4) applies to people as well (r7 PERM-21). |
| M5-D4 | FR-905, X64, r2 §11.3 | Overlap handling in `createTimeOff`/`updateTimeOff`/`restoreTimeOff`: (1) `pg_advisory_xact_lock(hashtext('time_off:' || userId))`; (2) pre-check query for the first live overlapping entry (excluding the entry itself) → `ConflictError('OVERLAP', message)` naming type + range; when both entries are single-day half days on the same date the message is `th.timeOff.errors.overlapHalfDay` (the X64 hint); (3) the constraint's `23P01` maps to `OVERLAP` with the generic `th.errors.OVERLAP` via `mapDbError` (the transaction is aborted, so no re-query). | Lock makes the pre-check race-free between our own writers; constraint stays the backstop. |
| M5-D5 | FR-906, BR-42 | Impact = for every week touched by the new range (update: union of old and new ranges) `{ weekStart, beforeCd, afterCd }` computed by the pure `weekCapacityImpact` from the user's schedule, holidays, `deactivated_on` and live leave **before** vs **after** the write. The UI lists weeks with `beforeCd ≠ afterCd` as `th.capacity.impactLine(formatThaiDate(ws), cdToNumeric(before), cdToNumeric(after))` (e.g. "สัปดาห์ 5 ต.ค. 2569: 5.00 → 3.00 วัน", 2 decimals as r8 §4.4), or `th.capacity.noImpact` when no week changes. Deletion shows only the undo toast (no impact). | FR-906 says "หลังบันทึกวันลา"; `cdToNumeric` exists (M1) so no early copy of M6's `formatCd`. |
| M5-D6 | FR-903 | A range is at most **366 days** (`VALIDATION` `th.timeOff.errors.rangeTooLong`); note ≤ 500 characters; leave type must be active for create, and for update either active or the entry's current (archived) type. Creating leave **has no undo toast** (the dialog shows the impact; deleting is one click); update has none either. | P1/P2 only demand undo for deletions; bounded impact computation. |
| M5-D7 | §3.3, MASK-5, r5 C40 | Calendar DTO: entries are `kind: 'full'` (viewer is manager or the owner: id, type id/name/colour/archived, note) or `kind: 'masked'` (`userId, startDate, endDate, half, label: th.masking.leave`) with **no entry id**, no type id/name, no colour, no note; masked chips render in the neutral `--timeoff` stripes. `half` stays visible (it is not type or note). | Colour reveals the type; ids enable probing; SPEC allows showing "ลา" + dates. |
| M5-D8 | FR-907 | `GET /api/calendar?from&to`: `from`, `to` are Mondays, `to` exclusive, `to − from` ≤ 42 days (6 weeks); response `{ from, to, holidays: [{date,name}], people: Record<userId, CalendarPerson>, timeOff: CalendarTimeOff[], viewer }` sorted by `startDate`, then display name. The month view always shows 6 Monday-first weeks starting at `weekStart(<month>-01)`. | r6a M5-13; stable layout. |
| M5-D9 | FR-902 | `GET /api/leave-types` (any logged-in user) returns the **active** types in order for the leave dialog (new route, not in PLAN §3.1; query key `qk.leaveTypes()`). Archived types stay readable through the entries that reference them. | The dialog is reachable from every page (user menu), not only the calendar. |
| M5-D10 | FR-902, X64 | `deleteLeaveType`: if any `time_off` row (live or soft-deleted) references the type → archive instead (`{ outcome: 'archived' }`, toast `archivedInstead`, undo = unarchive); otherwise hard delete (`{ outcome: 'deleted', deleted }`, undo = `restoreLeaveType` same id/name/colour/position). Archiving or deleting the **last active** type → `CONFLICT` `th.leaveTypes.errors.lastActive`. Names unique (archived included), 1–60 chars; colour from `colorSchema` (M2), picked from `PROJECT_COLORS` swatches. Leave-type colour is used only as a 4 px chip border/swatch, never as a text background. | FK is `RESTRICT`; P5 (recording leave must always be possible); contrast-safe (r7 FR-902 note). |
| M5-D11 | FR-901 | CSV import flow: the browser reads the file (≤ 256 KB), `parseHolidaysCsv(bytes)` (shared pure parser) builds the preview and `classifyHolidayRows(rows, existing)` marks ใหม่ / อัปเดตชื่อ / ไม่เปลี่ยน against all existing holidays (passed from the server page); "นำเข้า" is enabled only with zero errors; the action `importHolidays({ rows })` re-validates (zod: ≤ 500 rows, ISO dates, unique dates, names 1–200) and upserts in one transaction, returning `{ inserted, updated, unchanged }`. Names are NFC-normalised and trimmed. A header row is recognised when the first non-blank record is `date,name` (case-insensitive, trimmed). Dates must be Gregorian ISO with a year < 2400 — a B.E. year in ISO shape (`2569-10-23`) is a `BAD_DATE` error (never auto-converted, X64). Trailing empty fields (Excel's `,,`) are ignored; any other extra field is a `COLUMNS` error. The sample file is generated client-side from `th.holidays.import.sampleCsv` with a UTF-8 BOM. | X64; the server never trusts the preview; no upload endpoint needed. |
| M5-D12 | §10.4 step 2, X11 | `ensureDefaultLeaveTypes(tx, actor)` (in `services/leave-types.ts`) inserts `th.leaveTypes.defaults` (ลาพักร้อน `#0369A1`, ลาป่วย `#B91C1C`, ลากิจ `#A16207`, อบรม/สัมมนา `#7E22CE`) in order only when the table is empty; called by bootstrap step 2 and at the start of `seedGolden` (so `applyFixture` can find "ลาพักร้อน"). Audited with `actor = null` (older seed/bootstrap tests that count audit rows are updated in S4.6). | SPEC §10.4; r8 N5 (golden JSON has no leave types). |
| M5-D13 | FR-907, FR-908, §8.9 | Month view details: per-day chips (no multi-day spanning bars), at most 3 chips per cell then a "+N" button opening a popover with all entries of that day; chip text `th.calendar.leaveOf(displayName, label)` + `th.calendar.half[AM|PM]`; holidays: `--holiday` background + 🎌 + name text; weekends `--nonworking`; days outside the month dimmed with `data-outside`; selection by pointer (down on a cell background → enter → up) or keyboard (roving focus, arrows ±1/±7 days, Shift+arrows extend, Enter/Space open the dialog, Escape clears); clicking an editable chip (full entry) opens the edit dialog, masked chips are not interactive (tooltip only). Below 600 px (`theme.breakpoints.down('sm')`) the grid is replaced by an agenda list of the month's days that have entries or holidays, with a "แจ้งลา" button; the dialog is `fullScreen` there. Month title from `th.calendar.months` + B.E. year (y + 543) — no ICU. | Simplest accessible layout (r6a M5-12); avoids hydration drift (r5 M5-15). |
| M5-D14 | FR-903, r6a M5-08 | Entry points: `/calendar` (selection, "แจ้งลา" button) and the user menu item "แจ้งลา" (any page), both through one `LeaveDialogProvider` mounted in `AppShell` exposing `useLeaveDialog().open(...)` (M9 person page and M10 palette reuse it). Managers get a "พนักงาน" Autocomplete (active people from `qk.peopleOptions()`, default self; fixed in edit mode). Type defaults to the first active type by position; duration defaults to เต็มวัน; half options are disabled unless start = end, and changing to a multi-day range resets to เต็มวัน. | P1; one dialog everywhere. |
| M5-D15 | §3.2, X41 | Holidays and leave-type **reads** are open to every logged-in user (calendar holidays, leave-type options); writes are manager-only. Settings tabs "วันหยุด" and "ประเภทการลา" are added to M1's settings layout. | r7 PERM-02 note. |
| M5-D16 | FR-909, X04, M3-D12 | `restoreTimeOff({ batch })`: rows by batch (none → 404); `requireTimeOffEdit` on the owner; `deleted_at > now() - interval '30 days'` else `CONFLICT` `restoreExpired`; overlap pre-check under the user lock → `OVERLAP` `th.timeOff.errors.restoreOverlap`; then clear `deleted_at/deleted_batch`; audit `restore`. Redo after undo = `deleteTimeOff({ id })` again, and the undo entry keeps the newest batch. | Same restore rules as tasks; r2 T2b. |
| M5-D17 | BR-13, X64 | The capacity loader passes `user.deactivated_on` to the domain; reactivation clears it (M1-D13), so capacity returns to normal for all dates (no deactivation history). | Simplest consistent with M1. |
| M5-D18 | §4.9 | No new library: the calendar is CSS Modules + MUI; CSV parsing is hand-written (RFC 4180 subset); windows-874 via `TextDecoder`. | CLAUDE.md "new libraries need a Decision" — none needed. |

No SPEC **DEVIATION** in M5. (SPEC §12 M5 lists `src/domain/dates.ts`; it moved to M1 by X01 — a re-sequencing recorded in M1, not a deviation. The AM + PM rejection follows SPEC's DDL as written.)

---

## 4. Streams (machine-readable)

DAG: `S0 → S1 → {S2, S3}`; `S0 → S4`; `{S2, S3, S4} → S5`. S0 runs alone, so it may touch the few M1/M2 files its steps name (audit entity union, `nav`/`audit` keys in `th.ts`, `rows/index.ts`, the namespace barrels `src/server/{repo,services}/index.ts` for the X87 entries of §3.1); afterwards those files belong to the stream whose globs cover them. Concurrent sets: `{S1, S4}` and `{S2, S3, S4}` — their globs are disjoint (`src/domain/capacity*`/`src/lib/{csv,calendar}` · `src/server`/`src/app/api`/`scripts` · `src/app/(app)`/`src/components`/`src/hooks` · `tests`). `src/i18n/th.ts` belongs to S0; later streams may only add keys inside `calendar`, `timeOff`, `holidays`, `leaveTypes`, `capacity` with the Edit tool (PLAN §2.3).

```json
{ "milestone": 5,
  "streams": [
    { "id": "S0", "title": "Contracts: holidays/leave_types/time_off schema + generated migration + custom time_off_no_overlap, zod schemas, DTOs, query keys, invalidation, format helpers, authz signatures, maskTimeOff, audit entities, repo inserts, service/action/route stubs, i18n, factories + world 'timeOff', authz row files, fixtures signature, import:holidays script entry", "agent": "backend-engineer",
      "owns": ["package.json", "src/server/db/schema.ts", "src/server/db/schema.int.test.ts", "drizzle/**", "src/domain/types.ts", "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts", "src/lib/format.ts", "src/lib/format.test.ts", "src/i18n/th.ts", "src/server/audit.ts", "src/server/authz.ts", "src/server/authz.test.ts", "src/server/services/masking.ts", "src/server/services/masking.int.test.ts", "src/server/repo/holidays.ts", "src/server/repo/leave-types.ts", "src/server/repo/time-off.ts", "src/server/services/holidays.ts", "src/server/services/leave-types.ts", "src/server/services/time-off.ts", "src/server/services/capacity.ts", "src/server/services/calendar.ts", "src/server/actions/holidays.ts", "src/server/actions/leave-types.ts", "src/server/actions/time-off.ts", "src/app/api/calendar/route.ts", "src/app/api/leave-types/route.ts", "scripts/lib/fixtures.ts", "tests/helpers/**", "tests/authz/rows/**"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain capacity.ts (BR-10..13, impact) + pure holiday CSV parser + calendar month helpers (TDD)", "agent": "domain-engineer",
      "owns": ["src/domain/capacity.ts", "src/domain/capacity.test.ts", "src/lib/csv/**", "src/lib/calendar/**"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Backend: authz bodies, repos, holidays/leave-types/time-off/capacity/calendar services, actions, routes, import-holidays script, bootstrap leave types, applyFixture + seed-golden --fixture, service integration tests", "agent": "backend-engineer",
      "owns": ["src/server/**", "src/app/api/**", "scripts/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S2" },
    { "id": "S3", "title": "Frontend: /calendar month grid + agenda, LeaveDialog + provider + impact panel, delete with undo, settings holidays (CSV import) and leave types, nav + settings tabs + user menu entry", "agent": "frontend-engineer",
      "owns": ["src/app/(app)/**", "src/components/**", "src/hooks/**", "src/lib/shortcuts.ts"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Tests: authz rows (PERM-02f..p, 20, 21, 22), calendar masking leak tests (world + golden), golden capacity F1-F4, bootstrap/seed test updates", "agent": "test-engineer",
      "owns": ["tests/**"],
      "dependsOn": ["S0"], "planSection": "5.S4" },
    { "id": "S5", "title": "E2E m5-calendar spec, page objects, resetDb(fixture), update older specs", "agent": "test-engineer",
      "owns": ["e2e/**"],
      "dependsOn": ["S2", "S3", "S4"], "planSection": "5.S5" }
  ],
  "e2e": ["e2e/m5-calendar.spec.ts"] }
```

---

## 5. Step-by-step

### Hard-rule checklist for every stream (CLAUDE.md, embodied in the steps below)

| Rule | Where it is enforced in M5 |
|---|---|
| Authz in `src/server/authz.ts` before touching data; invisible → 404 | S2.1 `requireTimeOffEdit` (M5-D3); every action: lookup owning row → authz → service; settings actions `requireManager` first; routes call `visibleUserIds` before selecting leave |
| Masking server-side | S0.8 `maskTimeOff`; S2.6 selects only visible users in SQL and masks before serialising; S4.3 leak tests |
| Action = zod parse → authz → service (audit inside, M5-D2) → `refresh()` only when RSC output changes | holidays/leave-types actions call `refresh()` (settings tables are RSC); time-off actions never do (calendar is TanStack; client invalidates) |
| Multi-table writes in one transaction with audit inside | every action body is one `db.transaction`; import = one tx; bootstrap/fixtures one tx |
| Integer cd, no float | capacity math only in `src/domain/capacity.ts` on integers; numeric → cd via M1 `numericToCd`; display via `cdToNumeric` |
| Plan dates = ISO strings; no JS `Date` except `todayBangkok`/`format.ts` | Drizzle `date({ mode: 'string' })`; month helpers on strings; `dayjs` only inside `DateField`; ESLint domain Date ban |
| Every `allocations` query has a `week_start` range | not applicable (no allocations in M5); BR-42 test asserts M5 writes touch no plan tables |
| WEEK↔DAY delete-before-insert | not applicable in M5 |
| UI text only in `th.ts` | S0.10 lists every key; S3 adds keys only inside its namespaces |
| No confirm dialogs (undo toast 8 s + Cmd+Z) | holiday delete, leave-type delete/archive, leave delete → toast + `useUndo` |
| Never colour alone | stripes + text for leave, name text for holidays, "วันนี้" text, `aria-selected` + outline (S3.2 tests) |
| No localStorage, no runtime CDN | month in URL; sample CSV built from `th`; no external assets |
| Schema only via `schema.ts` + `drizzle-kit generate`; EXCLUDE in a custom migration | S0.3 |
| New libraries need a Decision | none added (M5-D18) |

### 5.S0 — Contracts (backend-engineer · package.json, schema, drizzle, types, contracts, schemas, query keys, invalidate, format, i18n, audit, authz signatures, masking, M5 repo/service/action/route stubs, fixtures signature, tests/helpers, tests/authz/rows)

S0 runs alone. At the end `pnpm check` must be green (G0) with every stub in place.

**S0.1 Preflight.**
- `git status` clean; `pnpm db:up`; `pnpm check` green on the M4 tree.
- Confirm, without upgrading: `@mui/x-date-pickers@9.14.0`, `dayjs@1.11.23` (M3), `fast-check@4.10.2` (M1), `fractional-indexing@4.0.0`, `sonner@2.0.8`, `@tanstack/react-query@5.104.0` in `package.json`. **No `pnpm add` in M5** (M5-D18).
- Confirm `drizzle/meta/_journal.json` lists M0's `0000_extensions` and that it contains `CREATE EXTENSION IF NOT EXISTS btree_gist`.
- Read and note in the S0 report the exact exports of: `src/server/{errors,action,route,audit,authz,clock}.ts`, `src/server/session.ts` (`requireManagerPage`), `src/server/repo/{users,order}.ts` (`getSchedule`, `lockOrderScope`, key helpers), `src/server/services/masking.ts`, `src/lib/format.ts`, `src/lib/query-keys.ts`, `src/lib/invalidate.ts`, `src/lib/schemas/common.ts`, `tests/helpers/*.ts`, `tests/authz/{types,matrix.int.test}.ts`, `tests/authz/rows/index.ts`, `scripts/lib/{fixtures,bootstrap}.ts`, `src/components/shell/nav.ts`.
- Done-check: `pnpm check` green before any edit.

**S0.2 Domain types (`src/domain/types.ts`, type-only).** Add if absent (PLAN §3.6):
```ts
export type HalfDay = 'AM' | 'PM'
/** One live leave entry reduced to what capacity needs. fractionCd: 100 = full day, 50 = half day. */
export interface TimeOffSpan { startDate: ISODate; endDate: ISODate; fractionCd: 50 | 100 }
```
No other domain file in S0 (S1 writes `capacity.ts`; the coverage gate stays unaffected).

**S0.3 Schema + migrations (`src/server/db/schema.ts`) — exactly SPEC §6.2 + PLAN §1.3/X48.** Start from `plan/research/r2-auth-db.md` §12; reuse M1's `tstz`/`createdAt`/`updatedAt` helpers and M0/M1's `orderKey` customType.
```ts
export const halfDay = pgEnum('half_day', ['AM', 'PM'])

export const holidays = pgTable('holidays', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date', { mode: 'string' }).notNull().unique(),          // constraint "holidays_date_unique"
  name: text('name').notNull(),
})

export const leaveTypes = pgTable('leave_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),                                 // "leave_types_name_unique" (archived included)
  color: text('color').notNull().default('#94A3B8'),
  position: orderKey('position').notNull(),                              // text COLLATE "C" (X48)
  archivedAt: tstz('archived_at'),
})

export const timeOff = pgTable('time_off', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),   // RESTRICT (default)
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  half: halfDay('half'),                                                 // null = full day
  note: text('note'),
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: tstz('deleted_at'),
  deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('time_off_range_check', sql`${t.endDate} >= ${t.startDate}`),
  check('time_off_half_check', sql`${t.half} is null or ${t.startDate} = ${t.endDate}`),
  index('time_off_user_id_start_date_end_date_idx').on(t.userId, t.startDate, t.endDate).where(sql`${t.deletedAt} is null`),
  // EXCLUDE constraint "time_off_no_overlap": custom migration below (no Drizzle API, r2 §9.2)
])
export type HolidayRow = typeof holidays.$inferSelect;   export type NewHoliday = typeof holidays.$inferInsert
export type LeaveTypeRow = typeof leaveTypes.$inferSelect; export type NewLeaveType = typeof leaveTypes.$inferInsert
export type TimeOffRow = typeof timeOff.$inferSelect;    export type NewTimeOff = typeof timeOff.$inferInsert
```
- Generate: `pnpm db:generate --name=m5_calendar_leave` → one journaled `drizzle/00NN_m5_calendar_leave.sql`. **Never edit it.** Inspect: `CREATE TYPE "public"."half_day" AS ENUM('AM', 'PM')`, `CONSTRAINT "holidays_date_unique" UNIQUE("date")`, `CONSTRAINT "leave_types_name_unique" UNIQUE("name")`, `"position" text COLLATE "C" NOT NULL`, `"color" text DEFAULT '#94A3B8' NOT NULL`, both CHECKs, the partial index, `ON DELETE cascade` on `time_off_user_id_user_id_fk`, no cascade on the other two FKs, every timestamp `timestamp with time zone`, dates `date`.
- Then the custom migration: `pnpm exec drizzle-kit generate --custom --name=time_off_no_overlap` → fill the generated empty file **verbatim**:
```sql
-- Custom SQL migration: SPEC §6.2 exclusion (needs btree_gist from 0000_extensions). Name pinned for error mapping/tests.
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("deleted_at" IS NULL);
```
- `pnpm db:migrate`; `pnpm db:generate` again → "No schema changes, nothing to migrate"; `pnpm exec drizzle-kit check` → OK.
- Test first — extend `src/server/db/schema.int.test.ts` › `describe('M5 schema')` (insert two users and a leave type through raw inserts; `expectPg(code, constraint)` = assert `DrizzleQueryError` with `cause.code`/`cause.constraint_name`):
  - `it('pins the exclusion constraint')`: `select conname, contype from pg_constraint where conname = 'time_off_no_overlap'` → one row, `contype = 'x'`.
  - `it('rejects overlapping live leave')`: 10-05..10-06 then 10-06..10-08 for the same user → `23P01` `time_off_no_overlap`; same dates for another user → ok.
  - `it('rejects AM + PM on the same date')` (r2 T3): AM 2026-10-20 then PM 2026-10-20 → `23P01`.
  - `it('ignores soft-deleted rows')`: mark the first deleted (`deleted_at = now()`), insert the overlap → ok; clearing `deleted_at` of the first again → `23P01` (r2 T2b).
  - `it('checks')`: `half='AM'` with start ≠ end → `23514` `time_off_half_check`; end < start → `23514` `time_off_range_check`.
  - `it('unique holiday date / leave type name')`: `23505` `holidays_date_unique`, `leave_types_name_unique`.
  - `it('leave_types.position uses collation C')`: `select collation_name from information_schema.columns where table_name='leave_types' and column_name='position'` → `'C'`.
  - `it('leave type in use cannot be deleted')`: delete a referenced leave type → `23503`.
- Done-check: `pnpm vitest run --project integration src/server/db/schema.int.test.ts` green; second `pnpm db:generate` prints "No schema changes".

**S0.4 Audit entities (`src/server/audit.ts`).** Extend `AuditEntity` with `'holiday' | 'leave_type' | 'time_off'`. No other change.

**S0.5 Contracts — DTOs (`src/lib/contracts/`, type-only, isomorphic).**
```ts
// src/lib/contracts/holidays.ts
import type { ISODate } from '@/domain/types'
export interface HolidayDTO { id: string; date: ISODate; name: string }
export type DeletedHoliday = HolidayDTO
export interface HolidayImportResult { inserted: number; updated: number; unchanged: number }

// src/lib/contracts/leave-types.ts
export interface LeaveTypeDTO { id: string; name: string; color: string; archived: boolean }
export interface LeaveTypeAdminDTO extends LeaveTypeDTO { position: string; usageCount: number }   // usage = live entries
export interface LeaveTypesResponse { leaveTypes: LeaveTypeDTO[] }                                  // active only, ordered
export interface DeletedLeaveType { id: string; name: string; color: string; position: string; archivedAt: string | null }
export type DeleteLeaveTypeResult = { outcome: 'deleted'; deleted: DeletedLeaveType } | { outcome: 'archived'; id: string }

// src/lib/contracts/capacity.ts
import type { Cd, ISODate } from '@/domain/types'
export interface PeriodCapacity { capacityCd: Cd; standardCd: Cd }
export interface UserCapacity { days: Record<ISODate, PeriodCapacity>; weeks: Record<ISODate, PeriodCapacity> }
export interface CapacityImpactWeek { weekStart: ISODate; beforeCd: Cd; afterCd: Cd }

// src/lib/contracts/time-off.ts
import type { HalfDay, ISODate } from '@/domain/types'
export interface TimeOffImpact { userId: string; userName: string; weeks: CapacityImpactWeek[] }   // userName = displayName
//   Forward change (C36, M9-D18): M9 adds `overloads` and `onTimeOffDays` to this interface (additive). M5 tests that
//   deep-equal `impact` (`toEqual`) are updated by M9's S2/S4 — M5 does not add placeholder fields.
export interface TimeOffSaveResult { id: string; impact: TimeOffImpact }
export interface TimeOffDeleteResult { batch: string; userId: string; startDate: ISODate; endDate: ISODate; half: HalfDay | null }
export interface TimeOffRestoreResult { restored: number; userId: string }

// src/lib/contracts/calendar.ts
export interface CalendarPerson { id: string; displayName: string; name: string; positionName: string | null;
  color: string | null; active: boolean }
export interface CalendarTimeOffFull { kind: 'full'; id: string; userId: string; startDate: ISODate; endDate: ISODate;
  half: HalfDay | null; leaveTypeId: string; leaveTypeName: string; leaveTypeColor: string; leaveTypeArchived: boolean;
  note: string | null }
export interface CalendarTimeOffMasked { kind: 'masked'; userId: string; startDate: ISODate; endDate: ISODate;
  half: HalfDay | null; label: string }                           // label = th.masking.leave; NO id/type/colour/note
export type CalendarTimeOff = CalendarTimeOffFull | CalendarTimeOffMasked
export interface CalendarHoliday { date: ISODate; name: string }
export interface CalendarResponse { from: ISODate; to: ISODate; holidays: CalendarHoliday[];
  people: Record<string, CalendarPerson>; timeOff: CalendarTimeOff[]; viewer: { userId: string; canEditOthers: boolean } }
```
`people` contains only users that appear in `timeOff`.

**S0.6 Zod schemas (`src/lib/schemas/`, `import { z } from '@/lib/z'`, messages from `th`).** Zod 4: `.extend()` on a refined object throws — keep shapes and refinements separate.
```ts
// src/lib/schemas/dates.ts (add if absent)
export const isoDateSchema = (error: string) => z.iso.date({ error })
// src/lib/schemas/holidays.ts
const holidayName = z.string().trim().min(1, { error: th.holidays.errors.nameRequired })
  .max(200, { error: th.holidays.errors.nameTooLong }).transform((v) => v.normalize('NFC'))
const holidayDate = isoDateSchema(th.holidays.errors.invalidDate)
export const createHolidaySchema = z.object({ date: holidayDate, name: holidayName })
export const updateHolidaySchema = z.object({ id: z.uuid(), date: holidayDate, name: holidayName })
export const holidayIdSchema = z.object({ id: z.uuid() })
export const restoreHolidaySchema = z.object({ id: z.uuid(), date: holidayDate, name: holidayName })
export const HOLIDAY_IMPORT_MAX = 500
export const importHolidaysSchema = z.object({
  rows: z.array(z.object({ date: holidayDate, name: holidayName }))
    .min(1, { error: th.holidays.import.errors.empty })
    .max(HOLIDAY_IMPORT_MAX, { error: th.holidays.import.errors.tooMany(HOLIDAY_IMPORT_MAX) })
    .refine((rows) => new Set(rows.map((r) => r.date)).size === rows.length, { error: th.holidays.import.errors.duplicateAny }),
})
// src/lib/schemas/leave-types.ts
const leaveTypeName = z.string().trim().min(1, { error: th.leaveTypes.errors.nameRequired })
  .max(60, { error: th.leaveTypes.errors.nameTooLong })
export const createLeaveTypeSchema = z.object({ name: leaveTypeName, color: colorSchema })   // colorSchema from M2 common.ts
export const updateLeaveTypeSchema = z.object({ id: z.uuid(), name: leaveTypeName.optional(), color: colorSchema.optional() })
export const moveLeaveTypeSchema = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) })
export const leaveTypeIdSchema = z.object({ id: z.uuid() })
export const setLeaveTypeArchivedSchema = z.object({ id: z.uuid(), archived: z.boolean() })
export const restoreLeaveTypeSchema = z.object({ id: z.uuid(), name: leaveTypeName, color: colorSchema,
  position: z.string().regex(POSITION_KEY), archivedAt: z.iso.datetime({ offset: true }).nullable() })  // POSITION_KEY from M1
// src/lib/schemas/time-off.ts
export const TIME_OFF_MAX_DAYS = 366
export const halfDaySchema = z.enum(['AM', 'PM']).nullable()
const timeOffFields = {
  leaveTypeId: z.uuid({ error: th.timeOff.errors.typeRequired }),
  startDate: isoDateSchema(th.timeOff.errors.invalidDate),
  endDate: isoDateSchema(th.timeOff.errors.invalidDate),
  half: halfDaySchema.default(null),
  note: optionalText(500, th.timeOff.errors.noteTooLong),                 // M2 helper: '' → null
}
export function refineTimeOffRange(v: { startDate: string; endDate: string; half: 'AM' | 'PM' | null }, ctx: z.RefinementCtx): void {
  // endDate < startDate → issue path ['endDate'] th.timeOff.errors.endBeforeStart
  // half !== null && startDate !== endDate → path ['half'] th.timeOff.errors.halfMultiDay
  // diffDays(startDate, endDate) + 1 > TIME_OFF_MAX_DAYS → path ['endDate'] th.timeOff.errors.rangeTooLong
  // (compare with compareISO/diffDays from @/domain/dates; skip when either date failed its own parse)
}
export const createTimeOffSchema = z.object({ userId: userIdSchema.optional(), ...timeOffFields }).superRefine(refineTimeOffRange)
export const updateTimeOffSchema = z.object({ id: z.uuid(), ...timeOffFields }).superRefine(refineTimeOffRange)
export const timeOffIdSchema = z.object({ id: z.uuid() })
export const restoreTimeOffSchema = z.object({ batch: z.uuid() })
// src/lib/schemas/calendar.ts
export const CALENDAR_MAX_DAYS = 42
export const calendarQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date() }).superRefine((v, ctx) => {
  // isoWeekday(from) === 1 && isoWeekday(to) === 1, compareISO(to, from) > 0, diffDays(from, to) <= 42 — else issue th.errors.VALIDATION
})
```
Tests first (`unit`):
- `src/lib/schemas/time-off.test.ts`: `{ leaveTypeId, startDate:'2026-10-05', endDate:'2026-10-06' }` → ok with `half: null`, `note` undefined; `half:'AM'` + 10-05..10-06 → issue path `half` message `th.timeOff.errors.halfMultiDay`; end 10-04 → `endBeforeStart`; 2026-01-01..2027-01-02 (367 days) → `rangeTooLong`, ..2027-01-01 (366) ok; `startDate:'2026-02-30'` → `invalidDate`; `note:''` → `null`; 501-char note → `noteTooLong`; `leaveTypeId:'x'` → `typeRequired`; `updateTimeOffSchema` requires `id`.
- `src/lib/schemas/holidays.test.ts`: name `'  วันปิยมหาราช  '` → trimmed; `''` → `nameRequired`; 201 chars → `nameTooLong`; 501 rows → `tooMany(500)`; two rows same date → `duplicateAny`.
- `src/lib/schemas/calendar.test.ts`: `2026-08-31`→`2026-10-12` (42 days) ok; `2026-09-01` (Tue) fails; 49 days fails; `to = from` fails.
- `src/lib/schemas/leave-types.test.ts`: `color:'#0369a1'` → `'#0369A1'`; name 61 chars fails.

**S0.7 Query keys + invalidation.** In `src/lib/query-keys.ts` add (PLAN §3.5 already names `calendar`):
```ts
calendar: (from: ISODate, to: ISODate) => ['calendar', from, to] as const,
leaveTypes: () => ['leaveTypes'] as const,
// qkPrefix: calendar: ['calendar'] as const, leaveTypes: ['leaveTypes'] as const
```
`src/lib/invalidate.ts`: `export async function invalidateCalendar(qc: QueryClient): Promise<void>` (prefix `['calendar']`) and `export async function invalidateLeaveTypes(qc: QueryClient): Promise<void>` (`['leaveTypes']` + `['calendar']`). Test first in `src/lib/invalidate.test.ts`: after `invalidateCalendar`, `['calendar','2026-08-31','2026-10-12']` is invalidated and `['sidebar']` is not; after `invalidateLeaveTypes` both `['leaveTypes']` and the calendar key are invalidated.

**S0.8 Leave masking (`src/server/services/masking.ts`, pure, X30) — complete in S0.**
```ts
import type { CalendarTimeOff } from '@/lib/contracts/calendar'
export interface TimeOffWithType { id: string; userId: string; startDate: ISODate; endDate: ISODate; half: HalfDay | null;
  note: string | null; leaveTypeId: string; leaveTypeName: string; leaveTypeColor: string; leaveTypeArchived: boolean }
/** canSeeDetails = authz.canSeeLeaveDetails(viewer, row.userId). Hidden entries keep only who/when/half and the label. */
export function maskTimeOff(row: TimeOffWithType, canSeeDetails: boolean): CalendarTimeOff
// true  → { kind: 'full', ...row }
// false → { kind: 'masked', userId, startDate, endDate, half, label: th.masking.leave }   (explicit object literal — never spread row)
```
Test first — extend `src/server/services/masking.int.test.ts` › `maskTimeOff`: a row with `note:'โน้ตลับ-01'`, `leaveTypeName:'ลาพักร้อน'`, colour `#0369A1`, id `X` → masked output has exactly the keys `kind,userId,startDate,endDate,half,label`, `label === th.masking.leave`, `JSON.stringify` contains none of `'โน้ตลับ-01'`, `'ลาพักร้อน'`, `'#0369A1'`, `X`, the leave type id; `canSeeDetails=true` → `kind:'full'` with the note.

**S0.9 Format helpers (`src/lib/format.ts`).**
```ts
/** "5 ต.ค. 2569" or "5 ต.ค. 2569 – 6 ต.ค. 2569" (same day → one date). */
export function formatThaiDateRange(start: ISODate, end: ISODate): string
/** Leave label used in messages: range + " (ครึ่งวันเช้า|ครึ่งวันบ่าย)" when half. */
export function formatLeaveRange(start: ISODate, end: ISODate, half: HalfDay | null): string
```
Tests first (`src/lib/format.test.ts`): `formatThaiDateRange('2026-10-05','2026-10-06')` → `'5 ต.ค. 2569 – 6 ต.ค. 2569'`; same day → `'5 ต.ค. 2569'`; `formatLeaveRange('2026-10-20','2026-10-20','AM')` → `'20 ต.ค. 2569 (ครึ่งวันเช้า)'` (built from `th.timeOff.halfLong.AM`); invalid ISO → `RangeError` (delegates to `formatThaiDate`).

**S0.10 i18n (`src/i18n/th.ts`, Edit tool only).** Add the namespaces `calendar`, `timeOff`, `holidays`, `leaveTypes`, `capacity`; add keys to `nav`, `masking`, `audit` (only if absent). Exact strings:
```ts
nav: { /* existing … */ calendar: 'ปฏิทินทีม', holidays: 'วันหยุด', leaveTypes: 'ประเภทการลา', reportLeave: 'แจ้งลา' },
masking: { /* otherProjects (M2) */ leave: 'ลา' },
calendar: {
  title: 'ปฏิทินทีม',
  months: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  monthTitle: (month: string, beYear: number) => `${month} ${beYear}`,
  weekdays: ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'],
  weekdaysLong: ['วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์'],
  prevMonth: 'เดือนก่อน', nextMonth: 'เดือนถัดไป', thisMonth: 'เดือนนี้',
  reportLeave: 'แจ้งลา',
  today: 'วันนี้',
  gridLabel: (title: string) => `ปฏิทิน ${title}`,
  dayLabel: (date: string, n: number) => (n > 0 ? `${date} · ลา ${n} รายการ` : date),
  holidayPrefix: '🎌',
  leaveOf: (name: string, label: string) => `${name} · ${label}`,
  half: { AM: 'เช้า', PM: 'บ่าย' },
  more: (n: number) => `+${n}`,
  moreLabel: (n: number) => `ดูอีก ${n} รายการ`,
  selectHint: 'คลิกหรือลากเลือกวันเพื่อแจ้งลา (ใช้ Shift + ลูกศร แล้วกด Enter ได้)',
  agendaEmpty: 'เดือนนี้ไม่มีวันลาหรือวันหยุด',
  loading: 'กำลังโหลดปฏิทิน…',
  loadError: 'โหลดปฏิทินไม่สำเร็จ ลองใหม่อีกครั้ง',
  retry: 'ลองใหม่',
  shortcuts: { scope: 'ปฏิทิน', moveDay: 'เลื่อนวัน', extend: 'เลือกช่วงวัน', open: 'แจ้งลาช่วงที่เลือก', clear: 'ยกเลิกการเลือก' },
},
timeOff: {
  dialog: {
    titleCreate: 'แจ้งลา', titleEdit: 'แก้ไขวันลา',
    employee: 'พนักงาน', startDate: 'วันเริ่ม', endDate: 'วันสุดท้าย', type: 'ประเภทการลา',
    duration: 'ช่วงเวลา', full: 'เต็มวัน', am: 'ครึ่งวันเช้า', pm: 'ครึ่งวันบ่าย',
    halfOnlySingleDay: 'ลาครึ่งวันเลือกได้เฉพาะลาวันเดียว',
    note: 'หมายเหตุ', notePlaceholder: 'ไม่บังคับ',
    save: 'บันทึก', cancel: 'ยกเลิก', delete: 'ลบวันลา', close: 'ปิด',
    saved: 'บันทึกวันลาแล้ว',
    archivedType: (name: string) => `${name} (ซ่อนแล้ว)`,
  },
  halfLong: { AM: 'ครึ่งวันเช้า', PM: 'ครึ่งวันบ่าย' },
  deleted: (range: string) => `ลบวันลา ${range} แล้ว`,
  undoLabel: (range: string) => `ลบวันลา ${range}`,
  errors: {
    overlap: (range: string, type: string) => `ทับกับวันลา '${type} ${range}' ที่บันทึกไว้แล้ว`,
    overlapHalfDay: (range: string, type: string) => `ทับกับ '${type} ${range}' — ถ้าลาทั้งวันให้แก้รายการเดิมเป็นเต็มวัน`,
    endBeforeStart: 'วันสุดท้ายต้องไม่ก่อนวันเริ่ม',
    halfMultiDay: 'ลาครึ่งวันได้เฉพาะลาวันเดียว',
    rangeTooLong: 'บันทึกได้ครั้งละไม่เกิน 366 วัน',
    invalidDate: 'วันที่ไม่ถูกต้อง',
    typeRequired: 'เลือกประเภทการลา',
    typeArchived: 'ประเภทการลานี้ถูกซ่อนแล้ว เลือกประเภทอื่น',
    noteTooLong: 'หมายเหตุยาวเกิน 500 ตัวอักษร',
    restoreOverlap: 'กู้คืนไม่ได้ เพราะทับกับวันลาที่บันทึกภายหลัง',
    restoreExpired: 'กู้คืนไม่ได้ เพราะลบไปนานกว่า 30 วันแล้ว',
  },
},
capacity: {
  impactTitle: 'ผลกระทบต่อ capacity',
  impactFor: (name: string) => `capacity ของ ${name}`,
  impactLine: (week: string, before: string, after: string) => `สัปดาห์ ${week}: ${before} → ${after} วัน`,
  noImpact: 'ไม่กระทบ capacity (ตรงกับวันหยุดหรือวันที่ไม่ได้ทำงาน)',
},
holidays: {
  title: 'วันหยุดบริษัท', year: 'ปี', add: 'เพิ่มวันหยุด', date: 'วันที่', name: 'ชื่อวันหยุด',
  namePlaceholder: 'เช่น วันปิยมหาราช', empty: 'ยังไม่มีวันหยุดในปีนี้',
  edit: 'แก้ไข', delete: 'ลบ', save: 'บันทึก', cancel: 'ยกเลิก',
  created: (name: string) => `เพิ่มวันหยุด ${name} แล้ว`,
  deleted: (name: string, date: string) => `ลบวันหยุด ${name} (${date}) แล้ว`,
  errors: { dateTaken: 'มีวันหยุดวันนี้แล้ว', nameRequired: 'กรอกชื่อวันหยุด', nameTooLong: 'ชื่อยาวเกิน 200 ตัวอักษร',
    invalidDate: 'วันที่ไม่ถูกต้อง', restoreConflict: 'กู้คืนไม่ได้ เพราะมีวันหยุดวันนี้แล้ว' },
  import: {
    button: 'นำเข้าจาก CSV', title: 'นำเข้าวันหยุดจาก CSV',
    hint: 'ไฟล์ CSV 2 คอลัมน์ date,name — วันที่แบบ ค.ศ. YYYY-MM-DD เช่น 2026-10-23 (มีบรรทัดหัวตารางหรือไม่ก็ได้)',
    chooseFile: 'เลือกไฟล์ CSV', sample: 'ดาวน์โหลดไฟล์ตัวอย่าง', sampleFileName: 'holidays-sample.csv',
    sampleCsv: 'date,name\r\n2026-10-13,วันคล้ายวันสวรรคต รัชกาลที่ 9\r\n2026-10-23,วันปิยมหาราช\r\n',
    previewTitle: (n: number) => `ตรวจสอบก่อนนำเข้า (${n} รายการ)`,
    status: { new: 'ใหม่', update: 'อัปเดตชื่อ', same: 'ไม่เปลี่ยน' },
    previousName: (name: string) => `เดิม: ${name}`,
    errorsTitle: (n: number) => `พบข้อผิดพลาด ${n} บรรทัด — แก้ไฟล์แล้วเลือกใหม่`,
    confirm: (n: number) => `นำเข้า ${n} รายการ`,
    done: (inserted: number, updated: number) => `เพิ่ม ${inserted} · อัปเดต ${updated}`,
    errors: {
      empty: 'ไฟล์ไม่มีข้อมูล', tooLarge: 'ไฟล์ใหญ่เกิน 256 KB',
      tooMany: (max: number) => `นำเข้าได้ครั้งละไม่เกิน ${max} รายการ`,
      duplicateAny: 'มีวันที่ซ้ำกันในไฟล์',
      line: (line: number, msg: string) => `บรรทัด ${line}: ${msg}`,
      columns: 'ต้องมี 2 คอลัมน์: date,name',
      badDate: (raw: string) => `วันที่ "${raw}" ไม่ถูกต้อง ใช้รูปแบบ YYYY-MM-DD (ค.ศ.)`,
      emptyName: 'ไม่มีชื่อวันหยุด', nameTooLong: 'ชื่อยาวเกิน 200 ตัวอักษร',
      duplicate: (date: string, firstLine: number) => `วันที่ ${date} ซ้ำกับบรรทัด ${firstLine}`,
      unclosedQuote: 'เครื่องหมายคำพูดไม่ครบคู่',
    },
  },
},
leaveTypes: {
  title: 'ประเภทการลา', add: 'เพิ่มประเภท', name: 'ชื่อประเภท', namePlaceholder: 'เช่น ลาบวช', color: 'สี',
  swatch: (hex: string) => `สี ${hex}`,
  archivedChip: 'ซ่อนแล้ว', archive: 'ซ่อน', unarchive: 'เลิกซ่อน', delete: 'ลบ',
  usage: (n: number) => `ใช้อยู่ ${n} รายการ`,
  deleted: (name: string) => `ลบประเภท ${name} แล้ว`,
  archivedInstead: (name: string) => `${name} ถูกใช้อยู่ จึงซ่อนแทนการลบ`,
  archived: (name: string) => `ซ่อน ${name} แล้ว`,
  unarchived: (name: string) => `เลิกซ่อน ${name} แล้ว`,
  errors: { nameTaken: 'มีชื่อประเภทนี้แล้ว', nameRequired: 'กรอกชื่อประเภท', nameTooLong: 'ชื่อยาวเกิน 60 ตัวอักษร',
    lastActive: 'ต้องมีประเภทการลาที่ใช้งานอยู่อย่างน้อย 1 ประเภท', restoreConflict: 'กู้คืนไม่ได้ เพราะมีชื่อประเภทนี้แล้ว' },
  defaults: [
    { name: 'ลาพักร้อน', color: '#0369A1' }, { name: 'ลาป่วย', color: '#B91C1C' },
    { name: 'ลากิจ', color: '#A16207' }, { name: 'อบรม/สัมมนา', color: '#7E22CE' },
  ],
},
audit: { /* existing … */
  holidayCreated: (date: string, name: string) => `เพิ่มวันหยุด ${date} ${name}`,
  holidayUpdated: (date: string, name: string) => `แก้วันหยุด ${date} ${name}`,
  holidayDeleted: (date: string, name: string) => `ลบวันหยุด ${date} ${name}`,
  holidayRestored: (date: string, name: string) => `กู้คืนวันหยุด ${date} ${name}`,
  holidaysImported: (inserted: number, updated: number) => `นำเข้าวันหยุดจาก CSV: เพิ่ม ${inserted} อัปเดต ${updated}`,
  leaveTypeCreated: (name: string) => `เพิ่มประเภทการลา ${name}`,
  leaveTypeUpdated: (name: string) => `แก้ประเภทการลา ${name}`,
  leaveTypeMoved: (name: string) => `เลื่อนลำดับประเภทการลา ${name}`,
  leaveTypeArchived: (name: string) => `ซ่อนประเภทการลา ${name}`,
  leaveTypeUnarchived: (name: string) => `เลิกซ่อนประเภทการลา ${name}`,
  leaveTypeDeleted: (name: string) => `ลบประเภทการลา ${name}`,
  leaveTypeRestored: (name: string) => `กู้คืนประเภทการลา ${name}`,
  timeOffCreated: (person: string, range: string) => `บันทึกวันลา ${person} ${range}`,
  timeOffUpdated: (person: string, range: string) => `แก้วันลา ${person} ${range}`,
  timeOffDeleted: (person: string, range: string) => `ลบวันลา ${person} ${range}`,
  timeOffRestored: (person: string, range: string) => `กู้คืนวันลา ${person} ${range}`,
},
```
The `as const` on `th` keeps `defaults` readonly; consumers type it as `readonly { name: string; color: string }[]`. Done-check: `pnpm typecheck`, `pnpm eslint src/i18n`.

**S0.11 Authz signatures (`src/server/authz.ts`)** — append; bodies `throw notImplemented('M5 S2.1')`:
```ts
/** M5-D3: self → ok; manager → ok (404 if the user does not exist); worker → 404 if invisible/nonexistent, else 403. */
export async function requireTimeOffEdit(tx: DbOrTx, user: SessionUser, targetUserId: string): Promise<void>
/** §3.3: leave type + note of ownerId are visible only to managers and the owner. Pure. */
export function canSeeLeaveDetails(viewer: Pick<SessionUser, 'id' | 'role'>, ownerId: string): boolean
```
`canSeeLeaveDetails` is trivial — S0 writes its body (`isManager(viewer) || viewer.id === ownerId`) with a unit test in `src/server/authz.test.ts` (manager/other → true, owner → true, other worker → false).

**S0.12 Repo inserts (used by services and seeds; S2 adds every other function to the same files). Test factories do NOT use them — they insert with plain Drizzle (X59).**
```ts
// src/server/repo/holidays.ts
export async function insertHoliday(tx: DbOrTx, v: { id?: string; date: ISODate; name: string }): Promise<HolidayRow>
// src/server/repo/leave-types.ts
export async function insertLeaveType(tx: DbOrTx, v: { id?: string; name: string; color: string; position: string;
  archivedAt?: Date | null }): Promise<LeaveTypeRow>
// src/server/repo/time-off.ts
export async function insertTimeOff(tx: DbOrTx, v: { userId: string; leaveTypeId: string; startDate: ISODate; endDate: ISODate;
  half: HalfDay | null; note: string | null; createdBy: string; deletedAt?: Date | null; deletedBatch?: string | null }): Promise<TimeOffRow>
```
`tx.insert(t).values(v).returning()` → `const [row] = rows; if (!row) throw new Error('insert failed'); return row`.

**S0.13 Service, action and route stubs (exact signatures; bodies `throw notImplemented('M5 S2.x')`).**
```ts
// src/server/services/capacity.ts
export interface DateRange { from: ISODate; to: ISODate }                      // [from, to), both Mondays
export interface CapacityInputs { holidays: ReadonlySet<ISODate>;
  users: Map<string, { schedule: Schedule; deactivatedOn: ISODate | null; timeOff: TimeOffSpan[] }> }
export async function loadCapacityInputs(tx: DbOrTx, userIds: readonly string[], range: DateRange): Promise<CapacityInputs>
export async function loadCapacity(tx: DbOrTx, userIds: readonly string[], range: DateRange): Promise<Map<string, UserCapacity>>
// src/server/services/holidays.ts
export async function listHolidays(tx: DbOrTx): Promise<HolidayDTO[]>                                   // all, by date
export async function listHolidaysInRange(tx: DbOrTx, range: DateRange): Promise<CalendarHoliday[]>
export async function createHoliday(tx: DbOrTx, actor: { id: string } | null, input: z.output<typeof createHolidaySchema>): Promise<HolidayDTO>
export async function updateHoliday(tx: DbOrTx, actor: { id: string } | null, input: z.output<typeof updateHolidaySchema>): Promise<HolidayDTO>
export async function deleteHoliday(tx: DbOrTx, actor: { id: string } | null, id: string): Promise<DeletedHoliday>
export async function restoreHoliday(tx: DbOrTx, actor: { id: string } | null, input: DeletedHoliday): Promise<HolidayDTO>
export async function importHolidays(tx: DbOrTx, actor: { id: string } | null, rows: readonly { date: ISODate; name: string }[]): Promise<HolidayImportResult>
// src/server/services/leave-types.ts
export async function listLeaveTypes(tx: DbOrTx, opts: { includeArchived: boolean }): Promise<LeaveTypeAdminDTO[]>
export async function createLeaveType(tx: DbOrTx, actor: { id: string } | null, input: { name: string; color: string }): Promise<LeaveTypeDTO>
export async function updateLeaveType(tx: DbOrTx, actor: { id: string } | null, input: z.output<typeof updateLeaveTypeSchema>): Promise<void>
export async function moveLeaveType(tx: DbOrTx, actor: { id: string } | null, input: { id: string; direction: 'up' | 'down' }): Promise<void>
export async function setLeaveTypeArchived(tx: DbOrTx, actor: { id: string } | null, input: { id: string; archived: boolean }): Promise<void>
export async function deleteLeaveType(tx: DbOrTx, actor: { id: string } | null, id: string): Promise<DeleteLeaveTypeResult>
export async function restoreLeaveType(tx: DbOrTx, actor: { id: string } | null, input: DeletedLeaveType): Promise<void>
export async function ensureDefaultLeaveTypes(tx: DbOrTx, actor: { id: string } | null): Promise<number>   // rows created
// src/server/services/time-off.ts
export interface TimeOffInput { userId: string; leaveTypeId: string; startDate: ISODate; endDate: ISODate; half: HalfDay | null; note: string | null }
export async function createTimeOff(tx: DbOrTx, actor: { id: string } | null, input: TimeOffInput): Promise<TimeOffSaveResult>
export async function updateTimeOff(tx: DbOrTx, actor: { id: string } | null, existing: TimeOffRow, input: Omit<TimeOffInput, 'userId'>): Promise<TimeOffSaveResult>
export async function deleteTimeOff(tx: DbOrTx, actor: { id: string } | null, existing: TimeOffRow): Promise<TimeOffDeleteResult>
export async function restoreTimeOff(tx: DbOrTx, actor: { id: string } | null, rows: readonly TimeOffRow[]): Promise<TimeOffRestoreResult>
// src/server/services/calendar.ts
export async function getCalendar(tx: DbOrTx, viewer: SessionUser, range: DateRange, today: ISODate): Promise<CalendarResponse>
//   `today` (X90) comes from the route (`serverToday()`); unused in M5, M8 needs it for milestone status on ◆
```
Actions (`'use server'`, M1's `action()`; `stub()` local helper):
```ts
// src/server/actions/holidays.ts
export const createHoliday = action(createHolidaySchema, async (input, ctx): Promise<{ holiday: HolidayDTO }> => stub())
export const updateHoliday = action(updateHolidaySchema, async (input, ctx): Promise<{ holiday: HolidayDTO }> => stub())
export const deleteHoliday = action(holidayIdSchema, async (input, ctx): Promise<{ deleted: DeletedHoliday }> => stub())
export const restoreHoliday = action(restoreHolidaySchema, async (input, ctx): Promise<{ holiday: HolidayDTO }> => stub())
export const importHolidays = action(importHolidaysSchema, async (input, ctx): Promise<HolidayImportResult> => stub())
// src/server/actions/leave-types.ts
export const createLeaveType = action(createLeaveTypeSchema, async (i, c): Promise<{ leaveType: LeaveTypeDTO }> => stub())
export const updateLeaveType = action(updateLeaveTypeSchema, async (i, c): Promise<Record<string, never>> => stub())
export const moveLeaveType = action(moveLeaveTypeSchema, async (i, c): Promise<Record<string, never>> => stub())
export const setLeaveTypeArchived = action(setLeaveTypeArchivedSchema, async (i, c): Promise<Record<string, never>> => stub())
export const deleteLeaveType = action(leaveTypeIdSchema, async (i, c): Promise<DeleteLeaveTypeResult> => stub())
export const restoreLeaveType = action(restoreLeaveTypeSchema, async (i, c): Promise<Record<string, never>> => stub())
// src/server/actions/time-off.ts
export const createTimeOff = action(createTimeOffSchema, async (i, c): Promise<TimeOffSaveResult> => stub())
export const updateTimeOff = action(updateTimeOffSchema, async (i, c): Promise<TimeOffSaveResult> => stub())
export const deleteTimeOff = action(timeOffIdSchema, async (i, c): Promise<TimeOffDeleteResult> => stub())
export const restoreTimeOff = action(restoreTimeOffSchema, async (i, c): Promise<TimeOffRestoreResult> => stub())
```
Routes (M1's `route()`):
```ts
// src/app/api/calendar/route.ts
export const GET = route(async (_req, { user, url }): Promise<CalendarResponse> => stub(), { query: calendarQuerySchema })
// src/app/api/leave-types/route.ts
export const GET = route(async (_req, { user }): Promise<LeaveTypesResponse> => stub())
```
(Adapt generics to M1's actual `action`/`route` signatures; record any adaptation in the S0 report.)

**S0.14 Fixtures signature + script entry.**
- `scripts/lib/fixtures.ts`: widen M1's placeholder `export type FixtureId = never` to `export type FixtureId = 'F2' | 'F3' | 'F4'` (so `resetDb('F4')` type-checks, X91) and add (stub body) `export async function applyFixture(db: DbOrTx, id: FixtureId): Promise<void>`; `export function parseFixtureArg(argv: readonly string[]): FixtureId | null`.
- `package.json` scripts: `"import:holidays": "tsx --env-file-if-exists=.env scripts/import-holidays.ts"` (PLAN §3.2). The script file itself is S2's.

**S0.15 Test helpers (`tests/helpers/**`) and row files.**
- `factories.ts` (plain Drizzle inserts on the schema tables, never through `src/server/repo/**` — X59):
  ```ts
  export async function makeHoliday(o?: { date?: ISODate; name?: string }): Promise<HolidayRow>        // default date 2027-01-0n counter, name 'วันหยุดทดสอบ n'
  export async function makeLeaveType(o?: { name?: string; color?: string; archived?: boolean }): Promise<LeaveTypeRow>
  //   position = generateKeyBetween(<last position by "position, id">, null)
  export async function makeTimeOff(o: { user: { id: string }; leaveType: { id: string }; startDate: ISODate; endDate?: ISODate;
    half?: HalfDay | null; note?: string | null; createdBy?: { id: string }; deleted?: { batch: string; daysAgo: number } }): Promise<TimeOffRow>
  //   deleted → deleted_at = now() - (daysAgo || ' days')::interval, deleted_batch = batch
  ```
- `world.ts`: add the `'timeOff'` builder (part name pinned by M1's `WorldPart`; no implication entry). `createWorld({ with: ['timeOff'] })` additionally builds (every string distinctive for leak greps). Values are the factory rows, so later milestones use the stable keys `w.leaveTypes.<key>.id` / `.name` (e.g. `w.leaveTypes.training.id` in M7's masking test, C16), `w.users.<key>` (`TestUser`), `w.timeOff.<key>.id`:

  | Key | Shape |
  |---|---|
  | `w.leaveTypes.vacation` | `'ลาพักร้อน-โลก'`, `#0369A1`, first by position |
  | `w.leaveTypes.sick` | `'ลาป่วย-โลก'`, `#B91C1C` |
  | `w.leaveTypes.training` | `'อบรม-โลก'`, `#7E22CE` (used only by the member's own entry) |
  | `w.leaveTypes.archived` | `'ลาเก่า-โลก'`, archived |
  | `w.users.coworker` | worker, MEMBER of **P and Q** → visible to M, L, Me and W |
  | `w.users.pOnly` | worker, MEMBER of **P** only → invisible to W (outsider) |
  | `w.timeOff.coworker` | coworker, vacation, 2026-11-09..2026-11-10, note `'โน้ตลับ-โลก-01'` |
  | `w.timeOff.pOnly` | pOnly, sick, 2026-11-16, half `'PM'`, note `'โน้ตลับ-โลก-02'` |
  | `w.timeOff.member` | member, training, 2026-11-02, note `'โน้ตของ member'` |
  | `w.batches.coworkerDeletedTimeOff` | coworker, sick, 2026-11-23, soft-deleted 1 day ago |
  | `w.holidays.h1` | `2026-11-20 'วันหยุดโลก'` |
- `tests/authz/rows/{holidays,leave-types,time-off,calendar}.ts`: `export const rows: AuthzRow[] = []`; register them in `tests/authz/rows/index.ts` (S4 fills them).
- Test first — `tests/helpers/world.int.test.ts › with timeOff`: the keys above exist; `visibleUserIds(outsider)` contains coworker and not pOnly; `w.leaveTypes.archived.archivedAt !== null`.

**S0.16 G0.** `pnpm db:migrate` · `pnpm db:generate` ("No schema changes") · `pnpm exec drizzle-kit check` · `pnpm check` green. Report: migration file names (generated + custom), journal order (custom after generated), exact M1/M2 signatures adapted, helper names that already existed.

### 5.S1 — Domain capacity + pure CSV/month helpers (domain-engineer · owns `src/domain/capacity*.ts`, `src/lib/csv/**`, `src/lib/calendar/**`)

Test-first for every file (PLAN §4.1). No React, DB or Next imports; `src/lib/**` may import `src/domain/**` and `@/i18n/th`. No `Date`; integer cd only.

**S1.1 `src/domain/capacity.ts` (BR-10…13, BR-41 `standard`, FR-906 impact; X64).**
```ts
import type { Cd, HalfDay, ISODate, Schedule, TimeOffSpan } from './types'
import { addDays, daysOfWeek, isoWeekday, weekRange, weekStart, compareISO, minISO, maxISO } from './dates'

export function timeOffFractionCd(half: HalfDay | null): 50 | 100                       // null → 100, AM/PM → 50
export function toTimeOffSpan(e: { startDate: ISODate; endDate: ISODate; half: HalfDay | null }): TimeOffSpan
/** BR-41 standard: schedule only — ignores holidays, leave and deactivation (X64). */
export function standardDayCd(schedule: Schedule, d: ISODate): Cd                        // schedule[isoWeekday(d)] ?? 0
export function standardWeekCd(schedule: Schedule): Cd                                   // Σ over weekdays 1..7
/** BR-10 + BR-12 + BR-13. */
export function dayCapacityCd(schedule: Schedule, holidays: ReadonlySet<ISODate>, timeOff: readonly TimeOffSpan[],
  d: ISODate, deactivatedOn?: ISODate | null): Cd {
  if (deactivatedOn && compareISO(d, deactivatedOn) >= 0) return 0                       // BR-13, inclusive
  const base = schedule[isoWeekday(d)] ?? 0
  if (base === 0 || holidays.has(d)) return 0                                            // BR-10/BR-12: holiday wins, no double deduction
  let off = 0
  for (const t of timeOff) if (t.startDate <= d && d <= t.endDate) off += t.fractionCd    // ISO strings compare lexicographically
  return Math.max(0, base - off)
}
/** BR-11: Σ dayCapacityCd over the 7 days of the Monday ws (RangeError if ws is not a Monday). */
export function weekCapacityCd(schedule: Schedule, holidays: ReadonlySet<ISODate>, timeOff: readonly TimeOffSpan[],
  ws: ISODate, deactivatedOn?: ISODate | null): Cd
export interface CapacityProfile { schedule: Schedule; holidays: ReadonlySet<ISODate>; timeOff: readonly TimeOffSpan[];
  deactivatedOn: ISODate | null }
export function capacityByDay(p: CapacityProfile, from: ISODate, toExclusive: ISODate): Record<ISODate, { capacityCd: Cd; standardCd: Cd }>
export function capacityByWeek(p: CapacityProfile, from: ISODate, toExclusive: ISODate): Record<ISODate, { capacityCd: Cd; standardCd: Cd }>   // Mondays
/** Mondays from weekStart(min start) to weekStart(max end) inclusive; [] for []. */
export function affectedWeeks(ranges: readonly { startDate: ISODate; endDate: ISODate }[]): ISODate[]
/** FR-906 (M5-D5): per week, capacity with `before` vs `after` leave sets (same schedule/holidays/deactivation). */
export function weekCapacityImpact(p: Omit<CapacityProfile, 'timeOff'>, before: readonly TimeOffSpan[],
  after: readonly TimeOffSpan[], weeks: readonly ISODate[]): { weekStart: ISODate; beforeCd: Cd; afterCd: Cd }[]
```
Tests first — `src/domain/capacity.test.ts` (`MON_FRI = {1:100,2:100,3:100,4:100,5:100}`, week `W = '2026-10-05'`, `span(s, e, half = null)` helper):

| describe › it | Input | Expected |
|---|---|---|
| §5.2 › ปกติ | MON_FRI, no holidays, no leave | `weekCapacityCd = 500` |
| §5.2 › ลา 2 วัน | span 10-05..10-06 | 300; per day `[0,0,100,100,100,0,0]` (= F3) |
| §5.2 › ลาครึ่งวันบ่ายวันศุกร์ | span 10-09..10-09 PM | 450 |
| §5.2 › พาร์ตไทม์ จ/พ/ศ | `{1:100,3:100,5:100}` | 300 |
| §5.2 › พาร์ตไทม์ + ลาวันพุธ | + span 10-07 | 200 |
| §5.2 › วันหยุดวันศุกร์ + ลาวันศุกร์ (BR-12) | holiday 10-09 + span 10-09 | 400 |
| §5.2 › ลาทั้งสัปดาห์ | span 10-05..10-11 | 0 |
| BR-13 › from Wednesday | deactivatedOn 10-07 | 200; `dayCapacityCd(…,'2026-10-06',…,'2026-10-07') = 100`; on 10-07 = 0 |
| BR-13 › before/after | deactivatedOn 10-05 → 0; 10-12 → 500; `null`/`undefined` → 500 | |
| half on part-time | `{3:50}`, span 10-07 AM | day 10-07 = 0; `{3:75}` → 25 |
| clamp | two half spans + one full on 10-05 (domain only) | day = 0, never negative |
| cross-week range (r5 M5-02) | span Thu 10-08..Tue 10-13 | week 10-05 = 300, week 10-12 = 300 |
| over a weekend | span Fri 10-09..Mon 10-12 | week 10-05 = 400, week 10-12 = 400 |
| weekend / holiday on non-working day | span 10-10..10-11; holiday 10-10 | 500 each |
| F2 (r8 §4.4) | holiday 2026-10-23 | week 10-19 = 400, days `[100,100,100,100,0,0,0]` |
| F4 | span 10-12..10-14 | week 10-12 = 200, days `[0,0,0,100,100,0,0]` |
| year boundary | holiday 2027-01-01, week 2026-12-28 | 400 |
| standard | `standardWeekCd(MON_FRI) = 500`, part-time 300; `standardDayCd` on a holiday/leave/deactivated day = 100 | |
| weekCapacityCd › non-Monday | ws `'2026-10-06'` | throws `RangeError` |
| fractions | `timeOffFractionCd(null)=100`, `('AM')=50`, `('PM')=50`; `toTimeOffSpan` maps fields | |
| capacityByDay/Week | F3 profile over [2026-09-28, 2026-10-19) | 21 day keys, 3 week keys `{ '2026-09-28': 500/500, '2026-10-05': 300/500, '2026-10-12': 500/500 }` |
| affectedWeeks | `[]` → `[]`; `[10-05..10-06]` → `['2026-10-05']`; `[10-08..10-13]` → `['2026-10-05','2026-10-12']`; `[{10-05..10-06},{10-12..10-13}]` → both weeks (gap week 10-12 only once, ordered) | |
| impact › create (F3) | before `[]`, after `[span 10-05..10-06]`, weeks `['2026-10-05']` | `[{ weekStart:'2026-10-05', beforeCd:500, afterCd:300 }]` |
| impact › move | before `[10-05..10-06]`, after `[10-12..10-13]`, weeks both | `[{…10-05, 300→500}, {…10-12, 500→300}]` |
| impact › on holiday | holiday 10-23, before `[]`, after `[10-23]`, weeks `['2026-10-19']` | `[{ 400 → 400 }]` (no change) |

fast-check properties (`fc.assert(fc.property(...))`, no adapter — M1 rule): arbitrary schedule (each weekday ∈ {absent, 25, 50, 75, 100}), up to 5 spans inside a 3-week window, up to 3 holidays, optional deactivation: (1) `0 ≤ weekCapacityCd ≤ standardWeekCd`; (2) `weekCapacityCd = Σ dayCapacityCd(daysOfWeek(ws))`; (3) adding one more span never increases any day; (4) a holiday day is 0; (5) every result is an integer. Done-check: `pnpm vitest run --project unit --coverage src/domain/capacity.test.ts` (100 % lines/branches for this file; domain gate ≥ 95 %).

**S1.2 `src/lib/csv/holidays.ts` (FR-901, X64, M5-D11) — shared by the settings dialog and `scripts/import-holidays.ts`.** Start from `plan/research/r6a-gaps-m0-m5.md` §5.5.
```ts
export const HOLIDAY_CSV_MAX_ROWS = 500
export const HOLIDAY_CSV_MAX_BYTES = 256 * 1024
export type CsvEncoding = 'utf-8' | 'windows-874'
export interface HolidayCsvRow { line: number; date: ISODate; name: string }
export type HolidayCsvErrorCode = 'COLUMNS' | 'BAD_DATE' | 'EMPTY_NAME' | 'NAME_TOO_LONG' | 'DUPLICATE' | 'UNCLOSED_QUOTE'
export interface HolidayCsvError { line: number; code: HolidayCsvErrorCode; raw?: string; date?: ISODate; firstLine?: number }
export interface HolidayCsvResult { encoding: CsvEncoding; rows: HolidayCsvRow[]; errors: HolidayCsvError[];
  fileError: 'EMPTY' | 'TOO_MANY' | 'TOO_LARGE' | null }
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: CsvEncoding }
//   try new TextDecoder('utf-8', { fatal: true }).decode(bytes) (BOM stripped) catch → new TextDecoder('windows-874').decode(bytes)
export function parseCsvRecords(text: string): { records: { line: number; fields: string[] }[]; errors: HolidayCsvError[] }
//   RFC 4180: comma separator; "…" quoted fields with "" escapes and embedded commas/newlines; CRLF, LF or CR line ends;
//   line = physical line where the record starts (1-based); unquoted fields trimmed; unclosed quote → UNCLOSED_QUOTE at its line
export function parseHolidaysCsv(bytes: Uint8Array): HolidayCsvResult
//   bytes.length > MAX_BYTES → fileError TOO_LARGE; drop records whose fields are all empty; header = first remaining record
//   with fields[0..1] lowercased === ['date','name']; trailing empty fields ignored; ≠ 2 non-trailing fields → COLUMNS;
//   date must match /^\d{4}-\d{2}-\d{2}$/, isISODate and year < 2400 → else BAD_DATE (raw); name trim + NFC, '' → EMPTY_NAME, > 200 → NAME_TOO_LONG;
//   duplicate date → DUPLICATE (date, firstLine) on the later line; 0 data rows → fileError EMPTY; > 500 → TOO_MANY
export function holidayCsvErrorMessage(e: HolidayCsvError): string        // th.holidays.import.errors.line(e.line, <specific>)
export interface ClassifiedHolidayRow extends HolidayCsvRow { status: 'new' | 'update' | 'same'; previousName?: string }
export function classifyHolidayRows(rows: readonly HolidayCsvRow[], existing: readonly { date: ISODate; name: string }[]): ClassifiedHolidayRow[]
```
Tests first — `src/lib/csv/holidays.test.ts` (local helper `encodeWindows874(s)`: ASCII as is; U+0E01…U+0E5B → `cp - 0x0E01 + 0xA1`):
- UTF-8 + BOM + header + CRLF: `'﻿date,name\r\n2026-10-23,วันหยุดสมมติสำหรับทดสอบ\r\n'` → `encoding 'utf-8'`, rows `[{ line: 2, date: '2026-10-23', name: 'วันหยุดสมมติสำหรับทดสอบ' }]`, no errors.
- windows-874: `encodeWindows874('2026-10-23,วันปิยมหาราช\n')` → `encoding 'windows-874'`, name `'วันปิยมหาราช'`, line 1 (no header).
- `'Date , Name\n2026-12-31,"วันสิ้นปี, ครึ่งวัน"\n'` → header skipped, name `'วันสิ้นปี, ครึ่งวัน'`; `'2026-12-30,"a ""b"""'` → `'a "b"'`; a quoted name with an embedded newline keeps its start line.
- `'2026-10-23,x,,\n'` → ok (trailing empties); `'2026-10-23,x,y\n'` → `COLUMNS` line 1; `'2026-10-23\n'` → `COLUMNS`.
- `'23/10/2569,x'` → `BAD_DATE` raw `'23/10/2569'`; `'2026-02-30,x'` → `BAD_DATE`; `'2569-10-23,x'` (B.E. year written in ISO shape) → `BAD_DATE` raw `'2569-10-23'` (years ≥ 2400 are rejected, never converted — M5-D11); `'2026-10-23,x'` ok.
- `'2026-10-23,'` → `EMPTY_NAME`; 201-char name → `NAME_TOO_LONG`; lines 2 and 4 with the same date → `DUPLICATE` on line 4 with `firstLine 2`; `'2026-10-23,"x'` → `UNCLOSED_QUOTE` line 1.
- blank lines between rows are skipped and later line numbers stay physical (`'a\n\n2026-10-23,x'` style).
- `new Uint8Array(0)` and `'date,name\n'` → `fileError 'EMPTY'`; 501 data rows → `'TOO_MANY'`; 256 KiB + 1 bytes → `'TOO_LARGE'`.
- `holidayCsvErrorMessage({ line: 4, code: 'DUPLICATE', date: '2026-10-23', firstLine: 2 })` → `th.holidays.import.errors.line(4, th.holidays.import.errors.duplicate('2026-10-23', 2))`.
- `classifyHolidayRows([{2026-10-23 'A'},{2026-12-31 'B'},{2027-01-01 'C'}], [{2026-10-23 'A'},{2026-12-31 'Old'}])` → statuses `same`, `update` (previousName `'Old'`), `new`.
Done-check: `pnpm vitest run --project unit src/lib/csv`.

**S1.3 `src/lib/calendar/month-grid.ts` (FR-907/908, M5-D8/D13).**
```ts
export type YearMonth = string                                   // 'YYYY-MM'
export function isYearMonth(s: string): boolean                  // /^\d{4}-(0[1-9]|1[0-2])$/
export function yearMonthOf(d: ISODate): YearMonth               // d.slice(0, 7)
export function addMonths(ym: YearMonth, n: number): YearMonth    // integer y/m arithmetic
export function monthTitle(ym: YearMonth): string                // th.calendar.monthTitle(th.calendar.months[m-1], y + 543)
export function monthGrid(ym: YearMonth): { from: ISODate; to: ISODate; weeks: ISODate[][] }   // 6 Monday-first weeks
export function inMonth(d: ISODate, ym: YearMonth): boolean
export function dayOfMonth(d: ISODate): number                   // Number(d.slice(8, 10))
export function orderRange(a: ISODate, b: ISODate): { startDate: ISODate; endDate: ISODate }
export function moveFocus(d: ISODate, code: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): ISODate   // ±1 / ±7 days
export function entriesOnDay<T extends { startDate: ISODate; endDate: ISODate }>(entries: readonly T[], d: ISODate): T[]
export function splitVisible<T>(items: readonly T[], max = 3): { shown: T[]; more: number }
```
Tests first — `src/lib/calendar/month-grid.test.ts`: `monthGrid('2026-09')` → `from '2026-08-31'`, `to '2026-10-12'`, 6 weeks, each 7 days, `weeks[0][0] = '2026-08-31'`, `weeks[5][6] = '2026-10-11'`; `monthGrid('2026-10')` → `from '2026-09-28'`, `to '2026-11-09'`; `monthGrid('2027-02')` → `from '2027-02-01'`; `addMonths('2026-12', 1) = '2027-01'`, `addMonths('2026-01', -1) = '2025-12'`; `monthTitle('2026-10') = 'ตุลาคม 2569'`; `isYearMonth('2026-13') = false`; `orderRange('2026-10-06','2026-10-05')` → start 10-05; `moveFocus('2026-10-05','ArrowUp') = '2026-09-28'`; `entriesOnDay` includes boundaries; `splitVisible([1,2,3,4,5])` → `{ shown:[1,2,3], more:2 }`. Done-check: `pnpm vitest run --project unit src/lib/calendar` · `pnpm eslint src/domain src/lib/csv src/lib/calendar`.

### 5.S2 — Backend (backend-engineer · owns `src/server/**`, `src/app/api/**`, `scripts/**`)

Rules for every action in this stream: `action(schema, handler)` → `db.transaction(async (tx) => { lookup owning row (entries only) → authz → service (audit inside, M5-D2) → return DTO })`; settings actions end with `refresh()` from `next/cache` **after** the transaction (RSC settings tables); time-off actions never call `refresh()`. Errors from `src/server/errors.ts` (M1 constructors). Postgres errors through `mapDbError` (`23505` → `CONFLICT`, `23P01` → `OVERLAP`, `23503` → `IN_USE`). Never derive dates in SQL (`current_date`); "today" is never needed by these services. Integration tests mock `next/cache`, `next/headers` and the session (`asUser`) as in `tests/setup/db-worker.ts`, stub `ALLOW_TEST_HOOKS=1` + `APP_NOW`. Write each `*.int.test.ts` case **before** the code it exercises.

**S2.1 Authz bodies (`src/server/authz.ts`).**
```ts
export async function requireTimeOffEdit(tx, user, targetUserId) {
  if (user.id === targetUserId) return
  if (isManager(user)) { if (!(await repo.users.userExists(tx, targetUserId))) throw new NotFoundError(); return }
  const visible = await visibleUserIds(tx, user)
  if (visible !== 'ALL' && !visible.has(targetUserId)) throw new NotFoundError()
  if (!(await repo.users.userExists(tx, targetUserId))) throw new NotFoundError()
  throw new ForbiddenError()
}
```
Tests (`src/server/authz.int.test.ts › requireTimeOffEdit`, world with timeOff): manager→coworker ok; manager→`'nope'` 404; member→self ok; member→coworker 403; outsider→pOnly 404; outsider→coworker 403; lead→pOnly 403.

**S2.2 Holidays (repo + service + actions, FR-901).**
- `repo/holidays.ts`: `listAll(tx)` (`ORDER BY date`), `listInRange(tx, from, toExclusive)` (`date >= from AND date < to`), `getOrNotFound(tx, id)`, `updateHolidayRow`, `deleteHolidayRow(tx, id): HolidayRow | null` (`returning`), `findByDates(tx, dates)`.
- `services/holidays.ts`: `createHoliday` → insert; `23505 holidays_date_unique` (via `pgErrorInfo`) → `ConflictError('CONFLICT', th.holidays.errors.dateTaken, { fieldErrors: { date: [th.holidays.errors.dateTaken] } })`; audit `create` `holidayCreated(date, name)`. `updateHoliday` → 404 when missing; same 23505 mapping; audit `update` with before/after. `deleteHoliday` → 404 when missing; returns the row; audit `delete`. `restoreHoliday` → insert with the same id/date/name; `23505` (date or id) → `ConflictError('CONFLICT', th.holidays.errors.restoreConflict)`; audit `restore`. `importHolidays(rows)` → `existing = findByDates(rows.dates)`; split new / changed / same; insert new, update changed names (`UPDATE … SET name WHERE date = …`); one audit row `{ entity:'holiday', entityId: crypto.randomUUID(), action:'create', summary: holidaysImported(i, u), after: { inserted, updated, dates } }`; return counts. Guards inside the service too (≤ 500 rows, unique dates) so the script path is safe.
- `actions/holidays.ts`: each = `requireManager(user)` → `db.transaction(service)` → `refresh()` → result.
- Tests first — `src/server/services/holidays.int.test.ts`: create → row + 1 audit; same date again → `CONFLICT` with `fieldErrors.date`; update to an existing date → `CONFLICT`; delete returns `{ id, date, name }` and the row is gone; restore re-creates the same id; restore after another holiday took that date → `CONFLICT` `restoreConflict`; import `[2026-10-23 A, 2026-12-31 B]` on an empty table → `{ inserted:2, updated:0, unchanged:0 }`, 1 audit row; importing `[2026-12-31 B2, 2026-12-30 C, 2026-10-23 A]` → `{ inserted:1, updated:1, unchanged:1 }`; 501 rows → `VALIDATION`; duplicate dates → `VALIDATION` and **no** row written (all-or-nothing); `listInRange('2026-10-19','2026-10-26')` returns only 10-23.

**S2.3 Leave types (repo + service + actions, FR-902, M5-D10/D12).**
- `repo/leave-types.ts`: `listOrdered(tx, { includeArchived })` (`ORDER BY position, id`) with `usageCount` = count of **live** `time_off` rows; `getOrNotFound`; `countReferences(tx, id)` (all rows incl. soft-deleted); `countActive(tx)`; `updateRow`; `deleteRow`.
- `services/leave-types.ts`: `createLeaveType` → `lockOrderScope(tx, 'leave_types')` → key after the last (M1 order helpers) → insert; `23505 leave_types_name_unique` → `CONFLICT nameTaken` (+ `fieldErrors.name`); audit. `updateLeaveType` → same 23505 mapping; audit. `moveLeaveType` → the M1 `movePosition` algorithm (no-op at the ends without audit; re-key equal neighbours). `setLeaveTypeArchived` → archiving when `countActive = 1` and this one is active → `CONFLICT lastActive`; no-op if unchanged; audit `leaveTypeArchived/Unarchived`. `deleteLeaveType` → active-last guard → `countReferences > 0` → archive (`{ outcome:'archived', id }`, audit `leaveTypeArchived`) else delete (`{ outcome:'deleted', deleted }`, audit `leaveTypeDeleted`; `23503` backstop → archive path). `restoreLeaveType` → insert same id/name/colour/position/archivedAt; `23505` → `CONFLICT restoreConflict`. `ensureDefaultLeaveTypes` → `countAll = 0` → `createLeaveType(tx, actor, d)` for each `th.leaveTypes.defaults` in order → returns 4, else 0.
- `actions/leave-types.ts`: `requireManager` → tx → service → `refresh()`.
- `GET /api/leave-types` (`src/app/api/leave-types/route.ts`): any logged-in user → `{ leaveTypes: listLeaveTypes(db, { includeArchived: false }).map(({ id, name, color, archived }) => …) }`.
- Tests first — `src/server/services/leave-types.int.test.ts`: create A, B, C → order A, B, C (keys strictly increasing by byte order); move C up twice → C, A, B; delete unused B → hard delete + snapshot; restore → same id and position; delete A while an entry (even soft-deleted) uses it → `outcome 'archived'`, row still there with `archived_at`; archive the last active → `CONFLICT lastActive`; duplicate name (also vs archived) → `CONFLICT nameTaken`; `ensureDefaultLeaveTypes` on empty → 4 rows named and coloured as `th.leaveTypes.defaults` in that order; second call → 0; route returns only active types in order.

**S2.4 Time off (repo + service + actions, FR-903…906, FR-909, BR-42, M5-D3…D6, D16).**
- `repo/time-off.ts`: `getLiveOrNotFound(tx, id)`; `listByBatch(tx, batch)`; `lockUser(tx, userId)` = ``select pg_advisory_xact_lock(hashtext(${'time_off:' + userId}))``; `findOverlap(tx, userId, start, end, excludeIds: string[])` →
  ```sql
  select t.id, t.start_date, t.end_date, t.half, lt.name as type_name from time_off t join leave_types lt on lt.id = t.leave_type_id
  where t.user_id = $1 and t.deleted_at is null and not (t.id = any($excludeIds))
    and daterange(t.start_date, t.end_date, '[]') && daterange($start, $end, '[]')
  order by t.start_date, t.id limit 1
  ```
  `listSpans(tx, userIds, from, toExclusive)` = live rows with `start_date < $to and end_date >= $from` (index-friendly); `updateRow`, `softDelete(tx, id, batch)` (`deleted_at = now()`), `restoreBatch(tx, batch)`; `listForCalendar(tx, userIds | null, from, toExclusive)` joined with `leave_types` (null = all users).
- `services/time-off.ts`:
  ```ts
  createTimeOff(tx, actor, input):
    await repo.timeOff.lockUser(tx, input.userId)
    const type = await repo.leaveTypes.get(tx, input.leaveTypeId)            // missing → ValidationError({ leaveTypeId: [typeRequired] })
    if (type.archivedAt) throw new ValidationError({ leaveTypeId: [th.timeOff.errors.typeArchived] }, th.timeOff.errors.typeArchived)
    await assertNoOverlap(tx, input.userId, input, [])                        // M5-D4 message builder below
    const weeks = affectedWeeks([input])
    const inputs = await loadCapacityInputs(tx, [input.userId], { from: weeks[0]!, to: addDays(weeks.at(-1)!, 7) })
    const u = inputs.users.get(input.userId)!
    const row = await repo.timeOff.insertTimeOff(tx, { ...input, createdBy: actor?.id ?? input.userId })   // 23P01 → OVERLAP via mapDbError
    const weeksImpact = weekCapacityImpact(u, u.timeOff, [...u.timeOff, toTimeOffSpan(row)], weeks)
    await audit.log(tx, actor, { entity: 'time_off', entityId: row.id, action: 'create',
      summary: th.audit.timeOffCreated(personName, formatLeaveRange(row.startDate, row.endDate, row.half)),
      after: { userId: row.userId, startDate: row.startDate, endDate: row.endDate, half: row.half, leaveTypeId: row.leaveTypeId } })
    return { id: row.id, impact: { userId: row.userId, userName: personName, weeks: weeksImpact } }
  assertNoOverlap(tx, userId, next, excludeIds):
    const c = await repo.timeOff.findOverlap(tx, userId, next.startDate, next.endDate, excludeIds); if (!c) return
    const range = formatLeaveRange(c.startDate, c.endDate, c.half)
    const halfPair = c.half && next.half && c.startDate === c.endDate && next.startDate === next.endDate && c.half !== next.half
    throw new ConflictError('OVERLAP', halfPair ? th.timeOff.errors.overlapHalfDay(range, c.typeName) : th.timeOff.errors.overlap(range, c.typeName))
  ```
  `updateTimeOff(tx, actor, existing, input)`: lock; type check (archived allowed only if `input.leaveTypeId === existing.leaveTypeId`); `assertNoOverlap(…, [existing.id])`; weeks = `affectedWeeks([existing, input])`; before spans from the loader (contain `existing`); after = before without `existing.id`'s span + new span (the loader returns spans keyed by id — add `id` to the internal span list used here); update row; audit `update` with before/after (no note); return impact.
  `deleteTimeOff(tx, actor, existing)`: batch = `crypto.randomUUID()`; soft delete; audit `delete` (before snapshot); return `{ batch, userId, startDate, endDate, half }`.
  `restoreTimeOff(tx, actor, rows)`: window check `deleted_at > now() - interval '30 days'` (in SQL) else `ConflictError('CONFLICT', restoreExpired)`; per row (one in practice): lock; `findOverlap(…, [row.id])` → `ConflictError('OVERLAP', restoreOverlap)`; `restoreBatch`; audit `restore`; `23P01` → same `OVERLAP` `restoreOverlap` (catch in the service: `pgErrorInfo(e).code === '23P01'`).
- `actions/time-off.ts`:
  ```ts
  export const createTimeOff = action(createTimeOffSchema, async (input, { user }) => db.transaction(async (tx) => {
    const userId = input.userId ?? user.id
    await authz.requireTimeOffEdit(tx, user, userId)
    return services.timeOff.createTimeOff(tx, user, { userId, leaveTypeId: input.leaveTypeId, startDate: input.startDate,
      endDate: input.endDate, half: input.half, note: input.note ?? null })
  }))   // no refresh(): TanStack views; the client calls invalidateCalendar + invalidateLoad
  export const updateTimeOff = action(updateTimeOffSchema, async (input, { user }) => db.transaction(async (tx) => {
    const existing = await repo.timeOff.getLiveOrNotFound(tx, input.id)       // owning-row lookup
    await authz.requireTimeOffEdit(tx, user, existing.userId)
    return services.timeOff.updateTimeOff(tx, user, existing, { … })
  }))
  // deleteTimeOff: same lookup + authz → service; restoreTimeOff: rows = listByBatch (none → NotFoundError) → authz on rows[0].userId → service
  ```
- Tests first — `src/server/services/time-off.int.test.ts` (golden-style setup: `makeUser` Mon–Fri, `ensureDefaultLeaveTypes`; `asUser`):
  - `create › own leave` 10-05..10-06 → row with `created_by = self`, `impact.weeks = [{ weekStart:'2026-10-05', beforeCd:500, afterCd:300 }]`, `userName` = display name, one audit row `time_off`.
  - `create › effective immediately (FR-904)` → `loadCapacity` in the same tx returns 300 for that week.
  - `create › manager for another` → `created_by = manager`, impact for the target.
  - `create › overlap names the entry` → existing 10-05..10-06 ลาพักร้อน; new 10-06 → `OVERLAP` with message `th.timeOff.errors.overlap(formatLeaveRange('2026-10-05','2026-10-06',null), 'ลาพักร้อน')`.
  - `create › AM + PM` → AM 10-20 ok; PM 10-20 → message `overlapHalfDay(formatLeaveRange('2026-10-20','2026-10-20','AM'), 'ลาพักร้อน')`; AM again → `overlap(…)` (same half is a plain overlap).
  - `create › backstop` → spy `repo.timeOff.findOverlap` to return `null` once, insert an overlapping row → result code `OVERLAP` (from `23P01`), message `th.errors.OVERLAP`.
  - `create › weekend/holiday allowed` → holiday 10-23 + leave 10-23..10-25 → ok, impact `[{ 2026-10-19, 400 → 400 }]`.
  - `create › archived type` → `VALIDATION` with `fieldErrors.leaveTypeId = [typeArchived]`.
  - `update › move` 10-05..06 → 10-12..13 → impact two weeks (300→500, 500→300); `update` keeping an archived type → ok; changing to another archived type → `VALIDATION`; past entry (2026-09-01) editable by owner (X64) → ok, audited.
  - `delete › soft delete + batch`; `restore` → back; `restore › expired` (`deleted.daysAgo: 31`) → `CONFLICT restoreExpired`; `restore › overlap` → delete 10-05..06, create 10-06, restore → `OVERLAP restoreOverlap`.
  - `BR-42 never edits plans`: counts of `tasks`, `task_assignments` (and every table except `time_off`/`audit_log`) unchanged after create/update/delete/restore (M6 adds `allocations` here).
  - action-level: worker creating for coworker → `FORBIDDEN`; for pOnly as outsider → `NOT_FOUND`; deleting another's entry by id as a worker who cannot see the owner → `NOT_FOUND`.

**S2.5 Capacity loader (`services/capacity.ts`, PLAN §3.10, X64, M5-D17).**
```ts
export async function loadCapacityInputs(tx, userIds, range) {
  // holidays: repo.holidays.listInRange(tx, range.from, range.to) → Set
  // schedules: one query over work_schedules where user_id = any($ids) → numericToCd(fraction) per weekday (M1 units)
  // deactivatedOn: select id, deactivated_on from "user" where id = any($ids)
  // timeOff: repo.timeOff.listSpans(tx, userIds, range.from, range.to) → toTimeOffSpan per row (keeps id for updateTimeOff)
}
export async function loadCapacity(tx, userIds, range) {
  // assert isoWeekday(from) === 1 && isoWeekday(to) === 1 && from < to (internal RangeError otherwise)
  // per user: capacityByDay(profile, from, to) + capacityByWeek(profile, from, to) (domain)
}
```
Tests first — `src/server/services/capacity.int.test.ts`: `parity with domain` — three users (Mon–Fri, part-time `{1:100,3:50,5:100}`, deactivated 2026-10-07), holidays 10-13 and 10-23, leave (one entry starting **before** `from` 09-25..09-29, one AM half 10-14, one soft-deleted 10-20 that must be ignored) over `[2026-09-28, 2026-10-26)` → every day/week equals the domain functions called directly with the same raw inputs; `range filter` — leave entirely outside the range is not loaded; users without schedule rows → 0 capacity and 0 standard; unknown user ids are simply absent from the map.

**S2.6 Calendar service + route (FR-907, X43, M5-D7/D8).**
```ts
export async function getCalendar(tx, viewer, { from, to }, _today) {   // X90: today param for M8
  const visible = await authz.visibleUserIds(tx, viewer)                       // before selecting any leave
  const rows = await repo.timeOff.listForCalendar(tx, visible === 'ALL' ? null : [...visible], from, to)
  const holidays = await listHolidaysInRange(tx, { from, to })
  const people = await repo.users.listCalendarPeople(tx, unique(rows.map((r) => r.userId)))  // id, name, nickname, position, color, banned
  const timeOff = rows.map((r) => maskTimeOff(r, authz.canSeeLeaveDetails(viewer, r.userId)))
  // sort: startDate, then people[userId].displayName via compareThai (M2), then userId
  return { from, to, holidays, people, timeOff, viewer: { userId: viewer.id, canEditOthers: authz.isManager(viewer) } }
}
// GET /api/calendar: route(async (_req, { user, url }) => db.transaction((tx) => getCalendar(tx, user, query, serverToday())), { query: calendarQuerySchema })
```
Run the reads in one read-only transaction: `db.transaction(fn, { isolationLevel: 'repeatable read', accessMode: 'read only' })` (PLAN §3.4.5). `displayName` comes from M1's `src/lib/display-name.ts`; inactive = `banned` (deactivated). Tests first — `src/server/services/calendar.int.test.ts` (golden via `seedGolden` + `applyFixture`): F4 as Ivy → one masked Cindy entry 10-12..10-14 (`kind 'masked'`, label `'ลา'`); F3 as Ivy → **no** Peter entry and no Peter in `people`; F3 as Jack (LEAD) → Peter masked; as Peter → own `kind 'full'` with `leaveTypeName 'ลาพักร้อน'`; as manager → full; holidays in range only (F2: 10-23 in `[2026-10-19, 2026-10-26)`); soft-deleted entries absent; a deactivated co-member's leave is still returned with `active: false`; invalid query (Tuesday `from`) → 400 through the route handler; 43-day span → 400.

**S2.7 Error mapping check.** Confirm M1's `mapDbError` maps `23P01` → `OVERLAP` and `toActionError` keeps the specific `ConflictError` message; add `src/server/errors.test.ts › 23P01 keeps code OVERLAP` only if M1 lacks it.

**S2.8 `scripts/import-holidays.ts` + `scripts/lib/import-holidays.ts` (FR-901, PLAN §3.13).**
```ts
// scripts/lib/import-holidays.ts
export async function runImportHolidays(db: Db, bytes: Uint8Array, opts: { dryRun: boolean }):
  Promise<{ ok: true; result: HolidayImportResult | ClassifiedHolidayRow[] } | { ok: false; messages: string[] }>
// parseHolidaysCsv → fileError/errors → messages via holidayCsvErrorMessage (+ th.holidays.import.errors.{empty,tooMany,tooLarge});
// dryRun → classifyHolidayRows(rows, listHolidays) ; else db.transaction(tx => importHolidays(tx, null, rows))
// scripts/import-holidays.ts (CommonJS under tsx, X56: `void main()` — no top-level await, no import.meta): argv[2] = path (missing → usage message, exit 2); readFileSync → runImportHolidays(createScriptDb().db, …,
//   { dryRun: argv.includes('--dry-run') }) → print th.holidays.import.done(...) or each message; exitCode 1 on errors; close()
```
Tests first — `scripts/lib/import-holidays.int.test.ts`: UTF-8 BOM file bytes → inserted 2; the same content encoded windows-874 → `unchanged 2`; a file with one bad line → `ok:false`, message `th.holidays.import.errors.line(2, …badDate('23/10/2569'))`, and the table is unchanged; `dryRun` writes nothing.

**S2.9 Bootstrap step 2 + step 4 (`scripts/lib/bootstrap.ts`, §10.4, M5-D12).** In `runBootstrap`'s transaction, after positions: `const n = await ensureDefaultLeaveTypes(tx, null)`; add `seededLeaveTypes: number` to `BootstrapResult`; never touch `holidays`. The summary line prints the count. (Tests: S4.6.)

**S2.10 `applyFixture` + `seed-golden --fixture` (X11, PLAN §3.13).**
```ts
// scripts/lib/fixtures.ts
export async function applyFixture(db: DbOrTx, id: FixtureId): Promise<void>
// setup = loadGolden().expected[id].setup (extend the M1 zod schema: holidays?: {date,name}[]; timeOff?: {user,startDate,endDate,half,type}[])
// holidays → services.holidays.createHoliday(tx, null, h)
// timeOff → services.timeOff.createTimeOff(tx, null, { userId: <user id by nickname>, leaveTypeId: <id by name>, startDate, endDate, half, note: null })
export function parseFixtureArg(argv: readonly string[]): FixtureId | null   // '--fixture=F3' | ['--fixture','F3']; other values → throw Error
```
`seedGolden` calls `ensureDefaultLeaveTypes(tx, null)` right after positions (M5-D12). `scripts/seed-golden.ts`: `const fixture = parseFixtureArg(process.argv.slice(2))` → one transaction `truncateAll` + `seedGolden` + (`fixture && applyFixture`). Tests first — `scripts/lib/fixtures.int.test.ts`: `seedGolden` → 4 leave types; `applyFixture('F2')` → 1 holiday, 0 time_off; `applyFixture('F3')` → Peter 2026-10-05..06 ลาพักร้อน, 0 holidays (**not cumulative**); `F4` → Cindy 10-12..14; `parseFixtureArg(['--fixture=F3'])='F3'`, `(['--fixture','F4'])='F4'`, `([])=null`, `(['--fixture=F9'])` throws.

**S2.11 Done-check.** `pnpm vitest run --project integration src/server scripts` · `pnpm eslint src/server src/app/api scripts` · `pnpm typecheck` (own paths clean). No `next build`/`next dev`.

### 5.S3 — Frontend (frontend-engineer · owns `src/app/(app)/**`, `src/components/**`, `src/hooks/**`, `src/lib/shortcuts.ts`)

All strings from `th`; MUI 9 API only (`slots`/`slotProps`, `sx`, no system props); dense calendar cells are plain elements with CSS Modules (`MonthGrid.module.css`) reading `var(--holiday)`, `var(--nonworking)`, `var(--timeoff)`, `var(--today)`, `var(--mui-palette-*)`; no `localStorage`; no Thai literals; "today" from `useToday()`; reads via TanStack Query + `getJson`, writes via server actions + `unwrap()` (M1 `src/lib/action-result.ts`).

**S3.1 Nav, settings tabs, page routes.**
- `src/components/shell/nav.ts`: extend `NavIcon` with `'calendar'`; **append** `{ id: 'calendar', href: '/calendar', label: th.nav.calendar, icon: 'calendar' }` at the end of `PRIMARY_NAV` (after M3's `'tasks'`, so `PRIMARY_NAV.map((i) => i.id)` = `['home', 'my', 'tasks', 'calendar']`); M9 S0.9 later inserts `'workload'` before it, giving the final X84 / SPEC §8.1 order home, my, tasks, workload, calendar; `Sidebar.tsx` `NAV_ICONS` entry `calendar: CalendarMonthOutlined` (`@mui/icons-material/CalendarMonthOutlined`). Update the nav-order test (`nav.test.ts` / `Sidebar.test.tsx`) to the 4-id list above.
- `src/app/(app)/settings/layout.tsx`: append tabs `th.nav.holidays` → `/settings/holidays`, `th.nav.leaveTypes` → `/settings/leave-types` (after positions).
- No `loading.tsx` under `calendar/` or `settings/` (X57).
- `src/app/(app)/calendar/page.tsx`:
  ```tsx
  export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
    await requirePageUser()                                     // before any Suspense (X41)
    const sp = await searchParams
    const m = typeof sp.month === 'string' && isYearMonth(sp.month) ? sp.month : yearMonthOf(serverToday())
    return <TeamCalendar initialMonth={m} />
  }
  ```

**S3.2 `MonthGrid` (FR-907/908, M5-D13, A11Y-1).** `src/components/calendar/MonthGrid.tsx` (`'use client'`) + `MonthGrid.module.css` + `LeaveChip.tsx`:
- Props `{ month: YearMonth; data: CalendarResponse; today: ISODate; onSelectRange(r: { startDate; endDate }): void; onOpenEntry(e: CalendarTimeOffFull): void }`.
- Markup: `<div role="grid" aria-label={th.calendar.gridLabel(monthTitle(month))}>`; header row `role="row"` with 7 `role="columnheader"` (`th.calendar.weekdays[i]`, `title` = `weekdaysLong[i]`); 6 week rows; each day `role="gridcell"` with `data-testid={'day-' + iso}`, `aria-selected`, `aria-current={iso === today ? 'date' : undefined}`, `data-outside`, `data-weekend`, `data-holiday`, `tabIndex` roving (focused day 0, others −1), `aria-label={th.calendar.dayLabel(formatThaiDate(iso), n)}`.
- Cell content: day number (`dayOfMonth`), a visible "วันนี้" tag when today, holiday line `th.calendar.holidayPrefix + ' ' + name`, then `splitVisible(entriesOnDay(timeOff, iso))`: each chip text `th.calendar.leaveOf(displayName(+ th.users.deactivatedSuffix when inactive), full ? leaveTypeName : label)` + ` (${th.calendar.half[half]})` when half; full entries render a `<button>` (`onOpenEntry`) with `style={{ borderInlineStartColor: leaveTypeColor }}`; masked entries render a `<span>` with a `Tooltip`; every chip has the stripe class (`repeating-linear-gradient(135deg, var(--timeoff) 0 4px, transparent 4px 8px)`); `more > 0` → `<button aria-label={th.calendar.moreLabel(n)}>{th.calendar.more(n)}</button>` opening an MUI `Popover` (`slotProps.paper`) listing all chips of that day.
- Selection: `onPointerDown` on a cell (ignore events whose target is inside a chip/button) → `anchor = iso`, `setPointerCapture` not used (cells receive `pointerenter`); `onPointerEnter` while pressed → `head = iso`; `onPointerUp` → `onSelectRange(orderRange(anchor, head))`. Keyboard via M1 `src/lib/keys.ts` (e.code first): arrows → `moveFocus` (crossing the grid edge changes month through a callback), Shift+arrows extend from the anchor, Enter/Space → `onSelectRange(selection ?? focused)`, Escape clears. Selected cells get `aria-selected="true"` + a 2 px outline (not colour alone).
- Register the calendar keys in the `?` help registry `src/lib/shortcuts.ts` (X07/X58, built on `HOTKEYS` in `src/lib/keys.ts`; S3 owns the file in M5): scope `calendar` (`th.calendar.shortcuts.scope`) with entries `ArrowLeft/Right/Up/Down` → `moveDay`, `Shift+Arrow` → `extend`, `Enter` → `open`, `Escape` → `clear`.
- Tests first — `src/components/calendar/MonthGrid.test.tsx` (`ui`; data built from contracts): September 2026 renders 42 gridcells, first `day-2026-08-31` with `data-outside`; holiday 10-23 shows its name text; a masked chip shows "Ivy · ลา" and is not a button; a full chip is a button and calls `onOpenEntry`; 5 entries on one day → 3 chips + "+2"; today cell has `aria-current="date"` and the text "วันนี้"; a half-day chip contains "เช้า"; pointer down on 10-05, enter 10-06, up → `onSelectRange({ startDate:'2026-10-05', endDate:'2026-10-06' })`; dragging backwards orders the range; focus 10-26 + Shift+ArrowRight + Enter → `{ 10-26, 10-27 }`; pointer down on a chip does not start a selection; **never colour alone**: every chip has visible text, every holiday cell has its name.

**S3.3 `TeamCalendar` + agenda (FR-907, NFR-07b).** `src/components/calendar/TeamCalendar.tsx`:
- State `month` (initial prop); header: `<Typography component="h1">{monthTitle(month)}</Typography>`, buttons `th.calendar.prevMonth` / `thisMonth` (→ `yearMonthOf(useToday())`) / `nextMonth`, and `th.calendar.reportLeave` (`useLeaveDialog().open({ mode: 'create' })`); month changes call `window.history.replaceState(null, '', '?month=' + m)` (M3-D17 pattern).
- `const { from, to } = monthGrid(month)`; `useQuery({ queryKey: qk.calendar(from, to), queryFn: () => getJson<CalendarResponse>('/api/calendar?from=' + from + '&to=' + to), placeholderData: keepPreviousData })`; loading `th.calendar.loading` (Skeleton), error `th.calendar.loadError` + retry.
- `useMediaQuery(theme.breakpoints.down('sm'))` → `AgendaList` (`src/components/calendar/AgendaList.tsx`: `<ol>` of in-month days with a holiday or entries, heading `formatThaiDate(iso)` + `weekdaysLong`, same chips; empty → `th.calendar.agendaEmpty`), else `MonthGrid`; caption `th.calendar.selectHint` (grid only).
- `onSelectRange(r)` → `open({ mode: 'create', ...r })`; `onOpenEntry(e)` → `open({ mode: 'edit', entry: e })`.
- Tests — `TeamCalendar.test.tsx`: `getJson` mocked → renders the month title "กันยายน 2569" for `2026-09`; next → fetches `from=2026-09-28&to=2026-11-09`; narrow viewport (`window.matchMedia` stub) renders the agenda list, not `role="grid"`.

**S3.4 `LeaveDialog` + provider (FR-903/905/909, M5-D6/D14).**
- `src/components/calendar/LeaveDialogProvider.tsx`: context `{ open(args: { mode: 'create'; startDate?: ISODate; endDate?: ISODate; userId?: string } | { mode: 'edit'; entry: CalendarTimeOffFull }): void }`, `useLeaveDialog()`; mounted once in `src/components/shell/AppShell.tsx` (inside the providers so it sees `UndoProvider`, QueryClient, `CurrentUserProvider`).
- `src/components/calendar/LeaveDialog.tsx`: MUI `Dialog` (`fullScreen` below `sm`, `slotProps.paper` with `aria-labelledby`), title `titleCreate`/`titleEdit`. Fields (controlled): employee `Autocomplete` (only when `currentUser.role === 'manager'`; options = active people from `qk.peopleOptions()`; default self; disabled in edit mode; label `th.timeOff.dialog.employee`); `DateField` start + `DateField` end (`minDate` = start; changing start past end moves end to start); duration `ToggleButtonGroup` exclusive (`full`/`am`/`pm`; AM/PM `disabled` + helper `halfOnlySingleDay` when start ≠ end; switching to multi-day resets to full); type `Select` from `useQuery(qk.leaveTypes(), GET /api/leave-types)` (default first; edit with an archived type adds it as an option labelled `archivedType(name)`); note multiline `TextField` (`slotProps.htmlInput.maxLength` 500). Buttons: ยกเลิก, บันทึก (Enter submits), and in edit mode ลบวันลา.
- Submit: `createTimeOffSchema.safeParse` (or `updateTimeOffSchema`) → field errors under each input; else `unwrap(createTimeOff(...))`; `OVERLAP` → `<Alert severity="error" role="alert">{error.message}</Alert>` and the dialog stays open; success → `invalidateCalendar(qc)` + `invalidateLoad(qc)` and the body switches to `<ImpactPanel impact />` with `th.timeOff.dialog.saved` and a single ปิด button.
- Delete (edit mode, no confirm): `unwrap(deleteTimeOff({ id }))` → close → `let batch = r.batch; undo.push({ label: th.timeOff.undoLabel(range), undo: async () => { await unwrap(restoreTimeOff({ batch })); await invalidateCalendar(qc); await invalidateLoad(qc) }, redo: async () => { batch = (await unwrap(deleteTimeOff({ id }))).batch; await invalidateCalendar(qc); await invalidateLoad(qc) } }, { toast: th.timeOff.deleted(range) })` where `range = formatLeaveRange(...)`; a failing undo (`OVERLAP`/`CONFLICT`) → `toast.error(error.message)`.
- The success body is S3.5's `ImpactPanel`.
- `src/components/shell/UserMenu.tsx`: add a `MenuItem` `th.nav.reportLeave` (icon `EventBusyOutlined`) → close menu → `useLeaveDialog().open({ mode: 'create' })`; update `UserMenu.test.tsx` (U-MENU-01 now lists four entries).
- Tests first — `src/components/calendar/LeaveDialog.test.tsx` (actions mocked with `vi.mock('@/server/actions/time-off')`, QueryClient seeded with leave types and people): create with `startDate/endDate` 10-05..10-06 shows both dates and the first type; AM/PM disabled for multi-day; setting end = start enables them; end before start shows `endBeforeStart` and no action call; OVERLAP result renders the message in an alert and keeps the dialog; success renders "สัปดาห์ 5 ต.ค. 2569: 5.00 → 3.00 วัน"; impact with no change renders `noImpact`; worker sees no employee field, manager does; edit mode shows ลบวันลา, which calls `deleteTimeOff` and pushes an undo entry whose `undo` calls `restoreTimeOff({ batch })`.

**S3.5 `ImpactPanel` (FR-906 capacity part, M5-D5).**
- `src/components/calendar/ImpactPanel.tsx`: heading `th.capacity.impactTitle`, sub `th.capacity.impactFor(impact.userName)`, `<ul>` of `impact.weeks.filter(w => w.beforeCd !== w.afterCd)` as `th.capacity.impactLine(formatThaiDate(w.weekStart), cdToNumeric(w.beforeCd), cdToNumeric(w.afterCd))`; empty → `th.capacity.noImpact`.
- Tests first — `src/components/calendar/ImpactPanel.test.tsx`: weeks `[{2026-10-05, 500, 300}]` → text `th.capacity.impactLine(formatThaiDate('2026-10-05'), '5.00', '3.00')` and heading `impactFor('Peter')`; weeks `[{2026-10-19, 400, 400}]` → only `th.capacity.noImpact`; a two-week move shows both lines in week order.

**S3.6 Settings · holidays (FR-901, M5-D11).**
- `src/app/(app)/settings/holidays/page.tsx` (server): `await requireManagerPage()` first; `const rows = await listHolidays(db)`; `<HolidaysTable rows={rows} initialYear={Number(serverToday().slice(0, 4))} />`.
- `src/components/settings/holidays/HolidaysTable.tsx`: year `Select` (years present ∪ current, labels `y + 543`), MUI `Table` (date `formatThaiDate`, weekday, name, actions edit/delete `IconButton`s with `aria-label`), inline edit row (DateField + TextField + บันทึก/ยกเลิก) → `updateHoliday`; add row → `createHoliday` (`fieldErrors.date` → helper text `dateTaken`); delete → `unwrap(deleteHoliday({ id }))` → `undo.push({ label, undo: () => unwrap(restoreHoliday(deleted)).then(() => {}), redo: () => unwrap(deleteHoliday({ id: deleted.id })).then(() => {}) }, { toast: th.holidays.deleted(name, formatThaiDate(date)) })`; after each mutation `invalidateCalendar(qc)` + `invalidateLoad(qc)` (the table itself updates through the action's `refresh()`); empty → `th.holidays.empty`.
- `src/components/settings/holidays/HolidayImportDialog.tsx`: button `th.holidays.import.button` opens a Dialog: hint text; "ดาวน์โหลดไฟล์ตัวอย่าง" link (`URL.createObjectURL(new Blob(['﻿' + th.holidays.import.sampleCsv], { type: 'text/csv;charset=utf-8' }))`, `download={sampleFileName}`, revoked on unmount); file `<input type="file" accept=".csv,text/csv">` labelled `chooseFile` → `new Uint8Array(await file.arrayBuffer())` → `parseHolidaysCsv` → `fileError` message / error list (`holidayCsvErrorMessage`, heading `errorsTitle(n)`) / preview table of `classifyHolidayRows(rows, props.existing)` with status chips (text, not colour) and `previousName`; confirm button `confirm(n)` enabled only when there are rows and zero errors → `unwrap(importHolidays({ rows }))` → `toast(th.holidays.import.done(inserted, updated))` → close → invalidate calendar + load.
- Tests — `HolidayImportDialog.test.tsx`: a UTF-8 file with 2 rows → preview 2 × "ใหม่" and confirm `นำเข้า 2 รายการ`; a file with a bad line → error "บรรทัด 1: …" and the confirm button is disabled; an existing date → "อัปเดตชื่อ" + "เดิม: …"; confirm calls `importHolidays` with exactly the parsed rows. `HolidaysTable.test.tsx`: delete pushes an undo entry calling `restoreHoliday` with the deleted row.

**S3.7 Settings · leave types (FR-902, M5-D10).**
- `src/app/(app)/settings/leave-types/page.tsx` (server): `await requireManagerPage()`; `listLeaveTypes(db, { includeArchived: true })` → `<LeaveTypesList rows />`.
- `src/components/settings/leave-types/LeaveTypesList.tsx`: MUI `List`; each row: colour swatch button (opens a `Menu` of `PROJECT_COLORS` swatches with `aria-label={th.leaveTypes.swatch(hex)}`) → `updateLeaveType({ id, color })`; name (click → inline `TextField`, Enter saves, Esc cancels); `Chip` `usage(n)`; `Chip` `archivedChip` when archived (row text dimmed by a token colour, never only by opacity); `th.common.moveUp`/`moveDown` (disabled at the ends) → `moveLeaveType`; archive/unarchive text button → `setLeaveTypeArchived` + toast `archived(name)` with undo = the inverse; delete `IconButton` → `deleteLeaveType` → `outcome 'deleted'` → undo entry `restoreLeaveType(deleted)` + toast `deleted(name)`; `outcome 'archived'` → toast `archivedInstead(name)` with undo = `setLeaveTypeArchived({ id, archived: false })`; `CONFLICT lastActive` → `toast.error(message)`. Add form: name + swatch (default = the first of `PROJECT_COLORS` not used yet) + `th.leaveTypes.add`. After every mutation `invalidateLeaveTypes(qc)`.
- Tests — `LeaveTypesList.test.tsx`: first row's move-up disabled; delete with `outcome 'archived'` shows the archivedInstead toast and its undo calls `setLeaveTypeArchived({ archived:false })`; delete with `outcome 'deleted'` → undo calls `restoreLeaveType` with the snapshot.

**S3.8 Done-check.** `pnpm vitest run --project ui src/components src/app` · `pnpm eslint 'src/app/(app)' src/components src/hooks` · `pnpm typecheck` (own paths clean). No `next build`/`next dev`.

### 5.S4 — Tests: authz, masking, golden capacity, older tests (test-engineer · owns `tests/**`)

Written **from SPEC §3.2/§3.3 before S2 finishes** (PLAN §4.1); red until S2 lands, green at G2. Uses `createWorld({ with: ['timeOff'] })`, `asUser`, `outcomeOf`/`outcomeOfCall`; the matrix asserts one new `audit_log` row (`entity`, `projectId: null`, `actorId`) for every `mutates: true` + `allow` pair (X44).

**S4.1 `tests/authz/rows/holidays.ts` + `leave-types.ts` (PERM-02 part).** `MGR = { M:'allow', L:'403', Me:'403', W:'403' }`:
```ts
{ id: 'PERM-02f', spec: '§3.2 จัดการวันหยุด — เพิ่ม', action: 'createHoliday', mutates: true, audit: { entity: 'holiday' }, expect: MGR,
  run: () => createHoliday({ date: '2027-01-02', name: 'วันหยุดแถว' }) },
// 02g updateHoliday({ id: w.holidays.h1.id, date: '2026-11-21', name: 'แก้' }) · 02h deleteHoliday({ id: w.holidays.h1.id })
// 02i restoreHoliday (setup: insert + delete directly → snapshot) · 02j importHolidays({ rows: [{ date: '2027-01-03', name: 'x' }] })
// 02k createLeaveType({ name: 'ลาบวช-แถว', color: '#0F766E' }) · 02l updateLeaveType({ id: sick, name: 'ลาป่วย-แก้' })
// 02m moveLeaveType({ id: sick, direction: 'up' }) · 02n deleteLeaveType (setup: makeLeaveType unused) · 02o restoreLeaveType (setup: snapshot)
// 02p setLeaveTypeArchived({ id: sick, archived: true })        — all MGR, audit holiday / leave_type
{ id: 'LT-READ', spec: 'M5-D15 อ่านประเภทการลา', action: 'GET /api/leave-types', mutates: false,
  expect: { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' }, run: () => GET(new Request('http://t/api/leave-types'), { params: Promise.resolve({}) }) },
```

**S4.2 `tests/authz/rows/time-off.ts` (PERM-20, PERM-21).** `ALL = allow ×4`, `OTHERS = { M:'allow', L:'403', Me:'403', W:'403' }`, `OTHERS_P = { M:'allow', L:'403', Me:'403', W:'404' }`:

| id | action (setup) | expect | audit |
|---|---|---|---|
| PERM-20a | `createTimeOff({ leaveTypeId: vacation, startDate:'2026-12-07', endDate:'2026-12-08' })` (own) | ALL | time_off |
| PERM-20b | `updateTimeOff` own (setup `makeTimeOff({ user: actor, startDate:'2026-12-14' })` → change to sick AM, note) | ALL | time_off |
| PERM-20c | `deleteTimeOff` own (setup as 20b) | ALL | time_off |
| PERM-20d | `restoreTimeOff({ batch })` own (setup `makeTimeOff({ user: actor, deleted:{ batch, daysAgo:1 } })`) | ALL | time_off |
| PERM-20e | `createTimeOff({ userId: actor.id, … })` explicit self | ALL | time_off |
| PERM-21a | `createTimeOff({ userId: coworker, startDate:'2026-12-21' })` | OTHERS | time_off |
| PERM-21b | `createTimeOff({ userId: pOnly, startDate:'2026-12-21' })` | OTHERS_P | time_off |
| PERM-21c | `updateTimeOff({ id: w.timeOff.coworker.id, … })` | OTHERS | time_off |
| PERM-21d | `updateTimeOff({ id: w.timeOff.pOnly.id, … })` | OTHERS_P | time_off |
| PERM-21e | `deleteTimeOff({ id: w.timeOff.coworker.id })` | OTHERS | time_off |
| PERM-21f | `restoreTimeOff({ batch: w.batches.coworkerDeletedTimeOff })` | OTHERS | time_off |
| PERM-21g | `createTimeOff({ userId: 'no-such-user' })` | 404 ×4 | — |
| TO-400 | `createTimeOff({ …, half:'AM', startDate:'2026-12-07', endDate:'2026-12-08' })` | 400 ×4 | — |

Every row also runs the generic "nobody → 401" and "mustChangePassword → 403" loops.

**S4.3 `tests/authz/rows/calendar.ts` + masking (PERM-22 calendar part, MASK-5/7, X43).**
- Rows: `PERM-22a GET /api/calendar?from=2026-11-02&to=2026-11-30` → allow ×4 (`mutates: false`); `CAL-400 from=2026-11-03` → 400 ×4.
- `tests/authz/masking.int.test.ts › describe('calendar (M5)')` — world with timeOff, `GET` over `[2026-11-02, 2026-11-30)`:
  - **member**: `w.timeOff.coworker` present exactly as `{ kind:'masked', userId: coworker.id, startDate:'2026-11-09', endDate:'2026-11-10', half:null, label: th.masking.leave }`; pOnly's entry masked with `half:'PM'`; `assertNoLeak(body, ['โน้ตลับ-โลก-01','โน้ตลับ-โลก-02','ลาพักร้อน-โลก','ลาป่วย-โลก','#0369A1','#B91C1C', w.timeOff.coworker.id, w.timeOff.pOnly.id, w.leaveTypes.vacation.id, w.leaveTypes.sick.id])`; the member's own entry is `kind 'full'` with `'อบรม-โลก'` and `'โน้ตของ member'` (its type is used by nobody else, so the forbidden list stays valid).
  - **outsider**: coworker masked; pOnly absent entirely (`JSON.stringify(body)` contains neither `pOnly.id` nor pOnly's name); member's entry absent (outsider shares no project with member) and `'อบรม-โลก'`/`'โน้ตของ member'` absent.
  - **lead** (LEAD → all): every entry masked (lead has none of their own); no type name, colour, note or entry id in the body.
  - **manager**: all `kind 'full'` including notes.
  - **coworker**: own full, others masked.
  - holidays `[{ date:'2026-11-20', name:'วันหยุดโลก' }]` for everyone.
- Golden block (`seedGolden` + `applyFixture('F4')`, then F3 in a separate test): Ivy's body has a masked Cindy entry and no `'ลาพักร้อน'`; with F3, Ivy's body has no Peter entry and not the string `'Peter'`; Mint (sees Cindy, Ivy, Jack) with F3 → no Peter; Jack with F3 → Peter masked.

**S4.4 Golden capacity (`tests/golden/capacity.int.test.ts`, r8 §4.4, X11).** For each of F1, F2, F3, F4 (fresh `truncateAll` + `seedGolden` + `applyFixture`): `loadCapacity(db, allSixUserIds, { from:'2026-08-31', to:'2027-01-04' })`:
- F1: every user × week = `{ capacityCd: 500, standardCd: 500 }`.
- F2: all 6 users week `2026-10-19` = 400, days `[100,100,100,100,0,0,0]`; every other week 500.
- F3: Peter week `2026-10-05` = 300, days `[0,0,100,100,100,0,0]`; everyone else 500; **no holiday** (not cumulative).
- F4: Cindy week `2026-10-12` = 200, days `[0,0,0,100,100,0,0]`; standard stays 500 everywhere.

**S4.5 World/fixture smoke.** Extend `tests/helpers/world.int.test.ts` only if S0's case needs adjustments; no new helpers beyond S0's.

**S4.6 Older integration tests touched by M5.**
- `tests/integration/bootstrap.int.test.ts`: `T-BOOT-LT-01` empty DB → 4 leave types (names/colours = `th.leaveTypes.defaults`, positions strictly increasing), `seededLeaveTypes: 4`; `T-BOOT-LT-02` second run → still 4, `seededLeaveTypes: 0`; `T-BOOT-LT-03` a DB with one custom type → nothing added; `T-BOOT-HOL-01` holidays count stays 0 after bootstrap (DEP-11).
- `tests/integration/seed-golden.int.test.ts` (M1): M5's assertions are **relative** (C3/C23, M12-D28): `leave_types` = 4 and `audit_log` rows with `entity = 'leave_type'` = 4; the total audit count is asserted as "previous stage's count + 4" (computed in the test from `entity` groups), never as a hard-coded total — M4 already adds 5 charter pages + 5 audit rows and M6 adds 10 more, so an absolute number breaks. Count-only edits go through the orchestrator (X91); never change the intent.
- Done-check: `pnpm vitest run --project integration tests` (rows red until S2 lands is expected; report which).

### 5.S5 — E2E (test-engineer · owns `e2e/**`)

**S5.1 Fixture + page objects.**
- `e2e/fixtures.ts`: M1's `resetDb(fixture?: FixtureId, opts: ResetDbOptions = {})` keeps its signature; M5 fills in the fixture branch → one transaction `truncateAll` + `seedGolden` + (`fixture && applyFixture(tx, fixture)`) + `opts.extras?.(tx)`, then the `UPLOAD_DIR` wipe (unchanged, X91).
- `e2e/support/windows874.ts`: `encodeWindows874(s: string): Buffer` (same mapping as S1.2).
- `e2e/pages/calendar.ts`: `class CalendarPage { goto(month?: string); title(): Locator; next(); prev(); day(iso): Locator /* getByTestId('day-'+iso) */; chip(iso, text): Locator; dragSelect(fromIso, toIso) /* mouse down/move/up on cell padding (top-left +4px) */; reportLeave() }`.
- `e2e/pages/leave-dialog.ts`: `class LeaveDialog { root; setEmployee(name); setDate(label, iso) /* focus the picker field, type DD MM YYYY+543 digits; fallback: open the picker and click the day */; duration(kind); type(name); note(text); save(); error(): Locator; impactLines(): Locator; close(); delete() }`.
- `e2e/pages/holidays.ts` (`goto()`, `importFile({ name, buffer })`, `previewRows()`, `confirm()`, `row(name)`), `e2e/pages/leave-types.ts` (`goto()`, `add(name)`, `moveUp(name)`, `delete(name)`, `row(name)`).
- Sidebar page object (M0/M1): add `calendar()` nav accessor.

**S5.2 `e2e/m5-calendar.spec.ts`** — scenarios E1–E8 exactly as §7.3; strings from `th`, numbers via `formatThaiDate`/`formatThaiDateRange`/`cdToNumeric` imported from `src/lib/format.ts` / `src/domain/units.ts`.

**S5.3 Update older specs.** Run `m0`–`m4` specs against the M5 build. Expected adjustments: sidebar nav assertions that list items (new "ปฏิทินทีม"); user-menu item counts (new "แจ้งลา"); settings tab lists (new "วันหยุด", "ประเภทการลา"); any `resetDb()` call that now needs no change (signature stays compatible). Change only page objects/assertions, never product behaviour.

**S5.4 Done-check (integrator runs it, G2).** `pnpm test:e2e` (full suite). Streams never run e2e (PLAN §2.3).

---

## 6. Integration (orchestrator)

**Expected requests (apply after Build, step 4):**

| From | Path · change |
|---|---|
| S3 | `src/lib/contracts/calendar.ts` · only if the grid needs an extra field (should not) |
| S2 | `src/lib/contracts/time-off.ts` · none expected; the internal span-with-id type stays in `services/` |
| S2 / S3 | `src/i18n/th.ts` · keys outside their namespaces (e.g. `th.errors.*`) — orchestrator applies |
| S5 | `scripts/lib/fixtures.ts` · none (S2 delivers `applyFixture`); `package.json` · none |

**Wiring order:** S0 (G0) → S1 (G1) → S2 ∥ S3 ∥ S4 (G1 each) → apply requests → S5 → G2.

**Commands (G2):**
```bash
pnpm db:up
pnpm db:migrate
pnpm db:generate            # → "No schema changes, nothing to migrate"
pnpm exec drizzle-kit check # journal OK; custom time_off_no_overlap listed after the generated M5 migration
pnpm check                  # typecheck + lint + unit + ui + integration (authz, masking, golden capacity) + domain coverage ≥ 95 %
pnpm test:e2e               # full suite m0…m5 against the production build (integrator only)
pnpm seed:golden --fixture=F3 && printf 'date,name\n2026-10-23,x\n' > /tmp/h.csv && pnpm import:holidays /tmp/h.csv --dry-run   # manual smoke
pnpm bootstrap              # on the seeded DB: seededLeaveTypes 0 (idempotent)
```

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Tests |
|---|---|
| **AC-M5-a** บันทึกลา (§12) | e2e E1 (record via drag, impact 5.00 → 3.00, chip on both days, reload) · int `time-off.int.test.ts › create` · ui `LeaveDialog.test.tsx` |
| **AC-M5-b** ลาทับถูกปฏิเสธ (§12) | e2e E2 (overlap message names "ลาพักร้อน 5 ต.ค. 2569 – 6 ต.ค. 2569"; AM+PM hint) · int `time-off.int.test.ts › overlap*, backstop` · int `schema.int.test.ts › exclusion` |
| **AC-M5-c** import CSV วันหยุด (§12) | e2e E4 (UTF-8 + windows-874 + bad file) · unit `holidays.test.ts` · int `holidays.int.test.ts › import`, `import-holidays.int.test.ts` |
| **AC-M5-d** unit test ครบ §5.2 | unit `capacity.test.ts` (7 rows + BR-12/13 + extras + properties), coverage gate |
| FR-901 CRUD + undo | int `holidays.int.test.ts` · ui `HolidaysTable.test.tsx` · authz PERM-02f…j |
| FR-902 | int `leave-types.int.test.ts` · ui `LeaveTypesList.test.tsx` · e2e E6 · bootstrap T-BOOT-LT-* |
| FR-903 / FR-904 | e2e E1, E5, E7 · int `› create`, `› effective immediately` · unit `time-off.test.ts` |
| FR-905 | see AC-M5-b |
| FR-906 (capacity part) | unit `› impact` · int `› impact` · e2e E1, E4 ("ไม่กระทบ capacity"), E5 |
| FR-907 (leave + holidays) | e2e E1, E4, E5, E7 · int `calendar.int.test.ts` · mask · ui `MonthGrid.test.tsx`, `TeamCalendar.test.tsx` |
| FR-908 | e2e E1 (drag), E8 (keyboard) · ui `MonthGrid.test.tsx › selection` |
| FR-909 | e2e E3 (toast undo + Cmd+Z) · int `› restore*` · authz PERM-20c/d, 21e/f |
| BR-10…13 | unit `capacity.test.ts` · int `capacity.int.test.ts` · golden F1–F4 |
| BR-42 (M5 part) | int `time-off.int.test.ts › BR-42 never edits plans` |
| MASK-5 / MASK-7 / X43 | mask (world + golden) · int `calendar.int.test.ts` · e2e E5 |
| PERM-02 (holidays, leave types) | authz PERM-02f…p · e2e E4 (worker `/settings/holidays` → 404) |
| PERM-20 / PERM-21 | authz rows §7.2 · e2e E5 (manager records for Peter) |
| PERM-22 (calendar part) | authz PERM-22a · mask |
| DEP-09 / DEP-11 | `tests/integration/bootstrap.int.test.ts` M5 cases |
| X11 F2–F4 | `scripts/lib/fixtures.int.test.ts` · golden `capacity.int.test.ts` |
| FR-1201 / X44 | matrix audit assertions · int (one audit row per op, import = 1) |
| NFR-07b | e2e E7 |
| A11Y-1 | ui `MonthGrid.test.tsx › never colour alone` · e2e E5 (text "ลา") |

### 7.2 Authz matrix rows added (`M` manager · `L` lead · `Me` member · `W` outsider)

| ID | PERM | Action / route | M | L | Me | W | Mutates (audit) |
|---|---|---|---|---|---|---|---|
| PERM-02f | 02 | `createHoliday` | allow | 403 | 403 | 403 | yes (`holiday`) |
| PERM-02g | 02 | `updateHoliday` | allow | 403 | 403 | 403 | yes (`holiday`) |
| PERM-02h | 02 | `deleteHoliday` | allow | 403 | 403 | 403 | yes (`holiday`) |
| PERM-02i | 02 | `restoreHoliday` | allow | 403 | 403 | 403 | yes (`holiday`) |
| PERM-02j | 02 | `importHolidays` | allow | 403 | 403 | 403 | yes (`holiday`, one row) |
| PERM-02k | 02 | `createLeaveType` | allow | 403 | 403 | 403 | yes (`leave_type`) |
| PERM-02l | 02 | `updateLeaveType` | allow | 403 | 403 | 403 | yes (`leave_type`) |
| PERM-02m | 02 | `moveLeaveType` | allow | 403 | 403 | 403 | yes (`leave_type`) |
| PERM-02n | 02 | `deleteLeaveType` (unused) | allow | 403 | 403 | 403 | yes (`leave_type`) |
| PERM-02o | 02 | `restoreLeaveType` | allow | 403 | 403 | 403 | yes (`leave_type`) |
| PERM-02p | 02 | `setLeaveTypeArchived` | allow | 403 | 403 | 403 | yes (`leave_type`) |
| LT-READ | — | `GET /api/leave-types` | allow | allow | allow | allow | no |
| PERM-20a…e | 20 | own `createTimeOff` / `updateTimeOff` / `deleteTimeOff` / `restoreTimeOff` / explicit self | allow | allow | allow | allow | yes (`time_off`) |
| PERM-21a | 21 | `createTimeOff` for coworker (visible to all) | allow | 403 | 403 | 403 | yes (`time_off`) |
| PERM-21b | 21 | `createTimeOff` for pOnly (invisible to W) | allow | 403 | 403 | 404 | yes |
| PERM-21c | 21 | `updateTimeOff` coworker's entry | allow | 403 | 403 | 403 | yes |
| PERM-21d | 21 | `updateTimeOff` pOnly's entry | allow | 403 | 403 | 404 | yes |
| PERM-21e | 21 | `deleteTimeOff` coworker's entry | allow | 403 | 403 | 403 | yes |
| PERM-21f | 21 | `restoreTimeOff` coworker's batch | allow | 403 | 403 | 403 | yes |
| PERM-21g | 21 | `createTimeOff` for a nonexistent user | 404 | 404 | 404 | 404 | no |
| TO-400 | 20 | half day on a multi-day range | 400 | 400 | 400 | 400 | no |
| PERM-22a | 22 | `GET /api/calendar` 4 weeks | allow | allow | allow | allow | no (content → mask) |
| CAL-400 | 22 | `GET /api/calendar` non-Monday `from` | 400 | 400 | 400 | 400 | no |
| (loop) | — | every row as nobody | 401 | 401 | 401 | 401 | — |
| (loop) | — | every row as a mustChange user | 403 | | | | — |
| SET-02 (e2e) | 02 | `/settings/holidays`, `/settings/leave-types` pages | 200 | 404 | 404 | 404 | — (E4, E6) |

### 7.3 E2E scenario outline (`e2e/m5-calendar.spec.ts`)

Deterministic per PLAN §4.5: `test.describe.configure({ mode: 'serial' })`; each `describe` block has `test.beforeAll(async () => { await resetDb(<fixture>) })` (M1 rule: never pass `resetDb` or its promise to `beforeAll`); `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`; server `APP_NOW` from the webServer env; `loginAs(page, …)` via the API; strings from `th`; page objects from S5.1; no sleeps (wait on dialog/toast/chip visibility).

| # | Setup / actor | Steps | Assertions |
|---|---|---|---|
| E1 (AC-M5-a, FR-903/906/907/908) | `resetDb()` (F1) · peter | `/calendar` → title `กันยายน 2569`; `next()` → `ตุลาคม 2569`; `dragSelect('2026-10-05','2026-10-06')` | dialog `titleCreate`; start/end show `05/10/2569`, `06/10/2569`; type `ลาพักร้อน`; `เต็มวัน` pressed → save → `saved` + line `th.capacity.impactLine(formatThaiDate('2026-10-05'), '5.00', '3.00')` → close → `day-2026-10-05` and `day-2026-10-06` contain `th.calendar.leaveOf('Peter','ลาพักร้อน')`; reload keeps them |
| E2 (AC-M5-b, FR-905) | continue as peter | `dragSelect('2026-10-06','2026-10-07')` → save; then `day-2026-10-08` click → duration `ครึ่งวันเช้า` → save → close; `day-2026-10-08` click on the cell padding → `ครึ่งวันบ่าย` → save | first save: alert `th.timeOff.errors.overlap(formatLeaveRange('2026-10-05','2026-10-06',null), 'ลาพักร้อน')`, dialog stays, no chip on 10-07; AM saves (chip "… (เช้า)"); PM shows `overlapHalfDay(formatLeaveRange('2026-10-08','2026-10-08','AM'), 'ลาพักร้อน')` |
| E3 (FR-909) | continue as peter | open own chip on 10-05 → `ลบวันลา` | dialog closes; toast `th.timeOff.deleted(formatLeaveRange('2026-10-05','2026-10-06',null))` with `th.undo.undo`; chips gone → click undo → chips back; delete again → `page.keyboard.press('ControlOrMeta+KeyZ')` with focus on `body` → chips back |
| E4 (AC-M5-c, FR-901, BR-12, SET-02) | `resetDb()` · manager, then mint, then peter | `/settings/holidays` → import UTF-8 BOM file `date,name\r\n2026-10-23,วันหยุดสมมติสำหรับทดสอบ\r\n2026-12-31,วันสิ้นปี\r\n` → confirm; import windows-874 bytes `2026-12-31,วันสิ้นปีเก่า\n2026-12-30,วันหยุดพิเศษ\n` → confirm; import `23/10/2569,x\n`; as mix `/calendar?month=2026-10` → click `day-2026-10-23` → save; as peter `page.goto('/settings/holidays')` | preview 2 × `ใหม่` → toast `done(2, 0)` → rows visible; second preview `อัปเดตชื่อ` + `เดิม: วันสิ้นปี` and `ใหม่` → `done(1, 1)`; bad file → `บรรทัด 1: …` and confirm disabled; mint's cell shows `🎌 วันหยุดสมมติสำหรับทดสอบ`, impact shows `th.capacity.noImpact`; peter's response status 404 |
| E5 (MASK-5, PERM-21, FR-906) | `resetDb('F4')` · manager, ivy, jack, cindy | manager `/calendar?month=2026-10` → `dragSelect('2026-10-15','2026-10-16')` → employee `Peter` → save; then logins in turn (new contexts) | manager: impact `impactLine(formatThaiDate('2026-10-12'), '5.00', '3.00')` with `impactFor('Peter')`; `day-2026-10-12` shows `leaveOf('Cindy','ลาพักร้อน')`. ivy: `day-2026-10-12` shows `leaveOf('Cindy','ลา')`, no text `ลาพักร้อน` in the grid, `day-2026-10-15` has no "Peter"; the `/api/calendar` response body (via `page.waitForResponse`) contains neither `'ลาพักร้อน'` nor Peter's user id. jack: `day-2026-10-15` shows `leaveOf('Peter','ลา')`. cindy: own `leaveOf('Cindy','ลาพักร้อน')` |
| E6 (FR-902) | `resetDb('F4')` · manager, cindy, worker 404 | `/settings/leave-types` → add `ลาบวช` → move it up → delete it → undo; delete `ลาพักร้อน`; as cindy open the dialog from the user menu; as ivy `goto('/settings/leave-types')` | list order after move; delete toast `deleted('ลาบวช')` + undo restores the row at the same place; `ลาพักร้อน` → toast `archivedInstead('ลาพักร้อน')`, chip `ซ่อนแล้ว`; cindy's type select lacks `ลาพักร้อน` while her 10-12 chip still reads `ลาพักร้อน`; ivy → 404 |
| E7 (NFR-07b) | `resetDb()` · ivy, viewport 390 × 844 | `/calendar?month=2026-10` → `แจ้งลา` → set 2026-10-20 single day → save | no `role="grid"`; agenda list visible; dialog is full-screen (dialog box width = viewport); impact line `impactLine(formatThaiDate('2026-10-19'), '5.00', '4.00')`; agenda shows `leaveOf('Ivy','ลาพักร้อน')` |
| E8 (FR-908 keyboard) | inside E1's describe, after E3 (peter) | focus `day-2026-10-26`, `Shift+ArrowRight`, `Enter` | dialog start/end `26/10/2569`–`27/10/2569`; `Escape` closes without saving |

### 7.4 Golden / perf / manual checks

- Golden: `tests/golden/capacity.int.test.ts` (S4.4) — F1 500 everywhere; F2 400 for all 6 users in week 10-19; F3 Peter 300; F4 Cindy 200 (r8 §4.4). Overload numbers are M9's.
- Perf: calendar for 100 users × 6 weeks is one indexed query + one holiday query (r5 M5-08); no measurement needed in M5 (M12 runs the perf pass).
- Manual: Thai Kedmanee keyboard — arrows/Shift+arrows/Enter work (e.code); dark mode — stripes and holiday background readable; open a windows-874 CSV exported from Thai Excel; `pnpm import:holidays <file> --dry-run` prints the classification.

---

## 8. Definition of done

- [ ] SPEC §12 M5 delivered: `capacity.ts` + unit tests for every §5.2 row (dates.ts from M1 verified present); §4.9 entirely except FR-906's overload part (M9) and FR-907's milestones (M8).
- [ ] e2e `m5-calendar` E1–E8 pass, plus every older spec (m0–m4) — full suite green.
- [ ] `pnpm check` green (typecheck, lint, unit, ui, integration incl. authz matrix, masking, golden capacity; domain coverage ≥ 95 %).
- [ ] `pnpm db:generate` → "No schema changes"; `time_off_no_overlap` exists and is journaled after the generated M5 migration; `pnpm exec drizzle-kit check` OK.
- [ ] Authz rows exist for **every** new action and route (§7.2), each mutating `allow` asserting one audit row; settings pages 404 for workers.
- [ ] Masking leak tests cover `/api/calendar` (world + golden): no other user's note, type name, type colour, entry id or type id; invisible users absent.
- [ ] No confirm dialog added; holiday delete, leave-type delete/archive and leave delete each have an 8 s undo toast; leave delete also works with Cmd+Z.
- [ ] No float math on loads; no JS `Date` on plan dates (only `formatThaiDate`/`todayBangkok`; `dayjs` only in `DateField`); no Thai outside `src/i18n` (lint); no `localStorage`; no new dependency.
- [ ] Bootstrap seeds the 4 leave types only when empty and never seeds holidays; `seed:golden --fixture=F2|F3|F4` works and fixtures are not cumulative.
- [ ] No `any`, `@ts-ignore` or `eslint-disable` without a reason comment.
- [ ] `PROGRESS.md` updated (§10); commit + tag done.

---

## 9. Risks and gotchas

| # | Risk / pitfall | Mitigation (step) |
|---|---|---|
| R1 | Drizzle has no EXCLUDE API; a hand-named SQL file is ignored by the migrator; the auto constraint name differs from SPEC tests | custom migration via `drizzle-kit generate --custom --name=time_off_no_overlap` with the pinned name (S0.3); schema test checks `pg_constraint` |
| R2 | Custom migration generated before the table migration → EXCLUDE on a missing table | generate the table migration first, then the custom one; `drizzle-kit check`; only S0 generates (S0.3, PLAN §2.3) |
| R3 | `23P01` aborts the transaction, so re-querying for the message fails | advisory lock + pre-check names the entry; constraint only maps to generic `OVERLAP` (M5-D4, S2.4) |
| R4 | AM + PM on the same day rejected by the DDL surprises users | dedicated message with the "แก้รายการเดิมเป็นเต็มวัน" hint (X64, S2.4, E2) |
| R5 | Restore of a deleted leave hits `23P01` after newer leave | pre-check + `23P01` catch → `restoreOverlap` toast (M5-D16, S2.4, E3 variant in int) |
| R6 | Leave-type colour leaks the type to other viewers; entry ids allow probing | masked DTO has no colour/id/type/note (M5-D7, S0.8); leak tests grep the hex and ids (S4.3) |
| R7 | Zod 4 `.extend()` on refined objects throws; `z.string().uuid()` deprecated | shapes + `superRefine` separately; `z.uuid()`, `z.iso.date()` (S0.6) |
| R8 | Windows-874 vs UTF-8 detection: ASCII-only files are valid UTF-8 (fine); a BOM-less UTF-8 file with Thai is valid UTF-8 (fine); TIS-620 bytes are invalid UTF-8 → fallback | fatal UTF-8 first, then `windows-874` (r6a §5.5, r4 §28); tests with both encodings (S1.2, S2.8, E4) |
| R9 | B.E. years in CSV (`2569-10-23`) are valid ISO and would import as year 3112 | parser rejects years ≥ 2400 as `BAD_DATE` with the "ใช้ ค.ศ." message (M5-D11, S1.2 test); never converted (X64) |
| R10 | `formatThaiDate`/month names differ between Node and browser ICU → hydration mismatch | month title from the fixed `th.calendar.months` table + `y + 543`; `formatThaiDate` already UTC-anchored (M0) (M5-D13) |
| R11 | MUI X DatePicker field typing in Playwright is fiddly (sections) | page object `setDate` types digits per section with a click-the-day fallback; most scenarios pre-fill dates by selecting on the calendar (S5.1) |
| R12 | Pointer selection conflicts with chip clicks / text selection | pointerdown ignored inside chips/buttons; `user-select: none` on cells; keyboard alternative (S3.2) |
| R13 | `refresh()` in time-off actions would re-render the whole route for nothing; server actions are serialised | only settings actions call `refresh()`; calendar uses TanStack invalidation (S2 rules) |
| R14 | `seedGolden` now writes 4 more audit rows → older seed/bootstrap count assertions fail | S4.6 makes the counts relative (per-entity deltas, C3/C23); M5-D12 recorded |
| R15 | Fixtures accidentally cumulative (F3 including F2's holiday) | `applyFixture` reads only `expected[id].setup`; test asserts F3 has 0 holidays (S2.10, S4.4) |
| R16 | Capacity impact for huge ranges (years) | 366-day cap (M5-D6); weeks list bounded to 53 |
| R17 | A worker probing `updateTimeOff` with ids of invisible people learns they exist (403 vs 404) | lookup → `requireTimeOffEdit` → 404 for invisible owners (M5-D3); rows PERM-21b/d |
| R18 | Last active leave type archived → nobody can record leave | `lastActive` guard (M5-D10) |
| R19 | `dayjs(iso,'YYYY-MM-DD')` needs `customParseFormat`; conversions scattered | all conversions only inside M3's `DateField` |
| R20 | ESLint Thai ban breaks the sample CSV or defaults if placed in components | sample and defaults live in `th.ts` (S0.10) |

---

## 10. Close-out

**PROGRESS.md updates:**
- Milestone table: M5 ✅ with date, commit hash and tag `m5`.
- Decisions: copy §3.1 (X01, X04, X10, X11, X23, X24, X30, X40–X50, X53, X64 as they apply) and §3.2 (M5-D1…M5-D18).
- Deviations: none new.
- Known issues (if any survived review), plus the forward notes: M6 consumes `services/capacity.ts` (`loadCapacity`) and `maskTimeOff` for grid leave labels and extends `time-off.int.test.ts › BR-42` with an `allocations` checksum; M8 adds `milestones` to `CalendarResponse`; M9 adds `newOverloads` to `TimeOffSaveResult` and the person-page "วันลา" tab via `useLeaveDialog`; M10 adds the palette command "แจ้งลา" via `useLeaveDialog` and the home leave card.

**Commit** (orchestrator, after G4):
```
feat(m5): calendar, holidays (CSV import), leave types, time off with capacity impact

- FR-901..905, FR-906 (capacity before/after), FR-907 (leave + holidays), FR-908, FR-909
- BR-10..13 in src/domain/capacity.ts (+ services/capacity.ts loader), BR-42 (M5 part)
- holidays / leave_types / time_off + custom migration time_off_no_overlap
- calendar masking ("ลา"), authz rows PERM-02 (holidays, leave types), PERM-20, PERM-21, PERM-22 (calendar)
- bootstrap leave types; seed:golden --fixture F2|F3|F4; pnpm import:holidays
- e2e m5-calendar (AC-M5-a/b/c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
**Tag:** `git tag m5`.
