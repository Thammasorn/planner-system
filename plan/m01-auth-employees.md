# M1 — Auth, employees, positions

> Depends on: M0 ✅ · SPEC: §3.1, §3.2 (employee/password row; positions part of the positions/holidays/leave-types row), §4.1, §4.2, §5.1, §6.1, §6.2 (Better Auth user columns, positions, user_preferences, work_schedules, audit_log), §7.3, §7.5 (client part), §8.1 (user menu), §8.6 (Cmd+Z), §9 (security, cookies), §10.3, §10.4, §11.1 (dates), §11.2, §12 M1
> Owner-visible result: people log in with email + password (no sign-up), are forced to change a first password, stay logged in for 7 sliding days, get locked out after 5 wrong passwords, can log out of every device; the manager creates, edits, deactivates/reactivates employees (random password shown once), resets passwords and manages positions with undo instead of confirm dialogs.

---

## 1. Goal and scope

### 1.1 Goal

Deliver the whole of SPEC §4.1 and §4.2 on top of the M0 shell: Better Auth (email + password, admin plugin for its
schema and ban enforcement), a DB-validating `src/proxy.ts` session gate (FR-103 renewal, AC-101, AC-103), the server
layering every later milestone uses (`errors.ts`, `action.ts`, `route.ts`, `session.ts`, `authz.ts` first functions,
`audit.ts`, `clock.ts`), the full `src/domain/dates.ts` and the `units.ts` conversion subset (X01, X02), the client undo
framework (X04), `user_preferences` (X05), the table-driven authz matrix harness, bootstrap, and the M1 part of `seed:golden`.

### 1.2 In scope — every id, where it is built, how it is tested

Test ids (`T-…`, `E2E-…`, `U-…`) appear verbatim in `it()` titles so the maps in §7 are greppable.

| ID | Requirement (short) | Implemented in | Tested by |
|---|---|---|---|
| FR-101 | Email + password login; sign-up endpoint disabled | S0.8 base `auth.ts` (`disableSignUp`), S2.3 (`disabledPaths`), S2.6 `login`, S3.2 `/login` | T-AUTH-01..03, T-AUTH-06; E2E-01, E2E-02 |
| FR-102 | First manager from `INITIAL_MANAGER_*` | S2.12 `runBootstrap` + `scripts/bootstrap.ts` | T-BOOT-01..06 |
| FR-103 | 7-day session, renewed while used | S0.8 session config, S2.4 proxy forwards `Set-Cookie` | T-SESS-04, T-SESS-05, T-AUTH-05 |
| FR-104 | `must_change_password` forces `/account/password` first | S2.4 proxy, S0.7 `action()`/`route()` gate, S0.8 `requirePageUser`, S3.3 | T-SESS-03, T-GATE-02, T-GATE-04, matrix MCP loop; E2E-03 |
| FR-105 | Change own password: current required, new ≥ 8, ≠ email (+ ≠ current, X60) | S0.10 `passwordPolicy`, S2.7 `changeOwnPassword`, S3.3 | U-SCH-01..08; T-ACC-01..05; E2E-03, E2E-09 |
| FR-106 | 5 failures / 15 min per IP + email → temporary rejection with message | S0.4 `auth_login_failures`, S2.3 hooks | T-LOCK-01..08; E2E-10 |
| FR-107 | Log out of all devices from the account page | S2.7 `signOutEverywhere`, S3.3 | T-ACC-06; E2E-08 |
| FR-201 | Manager creates employee (name, nickname, email, position, role, initial password, schedule) | S2.8 `createEmployee`, S3.8 | T-EMP-01; matrix PERM-01a; E2E-05 |
| FR-202 | Typed or "สุ่มรหัส" 12-char password, shown once + copy | S1.5 `randomPassword`, S3.8 `PasswordField`, S3.12 `copyText` | U-PW-01..05; U-COPY-01..02; E2E-05, E2E-06 |
| FR-203 | "บังคับเปลี่ยนรหัสเมื่อเข้าครั้งแรก" checkbox, default on | S0.10 schema default, S3.8 | T-EMP-01b; E2E-03 (default on), E2E-05 |
| FR-204 | Reset password → all sessions revoked + must change | S2.8 `resetEmployeePassword`, S3.9 | T-EMP-03; matrix PERM-01e |
| FR-205 | Deactivate instead of delete; no login; out of pickers; history kept; reactivate | S2.8 `deactivateEmployee`/`reactivateEmployee`, S2.11 `listAssignableUsers`, S3.10 | T-EMP-04, T-EMP-05, T-EMP-06; E2E-04 |
| FR-206 | Never deactivate/demote the last manager; never deactivate self | S2.8 guard (`FOR UPDATE` of active managers) | T-EMP-07..10 |
| FR-207 | Schedule: weekdays + fraction per day (default Mon–Fri 1.00) | S0.10 `scheduleInput`, S1.4 units, S2.8, S3.8 `ScheduleEditor` | U-UNIT-*, T-EMP-11; E2E-07 |
| FR-208 | Position CRUD (name, order); delete blocked while in use | S2.9, S3.11 | T-POS-01..08; matrix PERM-02a..e; E2E-11 |
| FR-209 | Employee list: search name/nickname, filter position, status shown | S3.7 `filterEmployees` | U-FILT-01..05; E2E-12 |
| FR-210 | Display name = nickname ‖ name; hover full name + position | S1.6 `displayName`, S3.5 `UserName`/`UserAvatar` | `src/lib/display-name.test.ts` › U-NAME-01..04; `src/components/common/UserName.test.tsx` › U-UN-01..03 |
| AC-101 | `/` without login → `/login` | S2.4 | T-SESS-01; E2E-01 |
| AC-102 | POST sign-up endpoint rejected | S0.8 + S2.3 | T-AUTH-01; E2E-02 |
| AC-103 | New worker → `/account/password`, nothing else until changed | S2.4, S0.7, S3.3 | T-SESS-03, T-GATE-02, T-GATE-04; E2E-03 |
| AC-104 | Deactivated: no login, existing sessions drop immediately | S2.8 (delete sessions in tx; cookie cache off) | T-EMP-04; E2E-04 |
| AC-201 | Create worker with random password → copy → worker logs in | S2.8, S3.8 | T-EMP-01; E2E-05 |
| AC-202 | Reopen the create form → random password not shown again | S3.8 (state reset), S2.8 (never echoes) | T-EMP-02; E2E-06 |
| AC-203 (M1 part, X12) | Deactivated Cindy: login blocked, sessions revoked, excluded from the assignable-user query, labelled "ปิดใช้งาน" | S2.11, S3.7 | T-EMP-06; E2E-04 |
| BR-01 / BR-02 (subset, X02) | Integer cd; numeric ↔ cd at the repo boundary (string-based) | S1.4 `numericToCd`/`cdToNumeric`, S2.2 repo | U-UNIT-01..06 |
| BR-04 / BR-05 / BR-06 (X01) | ISO date strings, Monday weeks, Bangkok "today" | S1.2–S1.3 `dates.ts`, S2.1 `clock.ts` | U-DATE-01..15; T-CLOCK-01..02 |
| BR-13 (M1 part) | `deactivated_on` = `serverToday()` (inclusive); rule consumed by M5 capacity | S2.8 | T-EMP-04 asserts `'2026-09-30'` under `APP_NOW` |
| §3.2 PERM-01 | สร้าง/แก้/ปิดใช้งานพนักงาน, ตั้ง/รีเซ็ตรหัสผ่าน — M only | S0.8 `requireManager`, S2.8 | matrix rows PERM-01a..e |
| §3.2 PERM-02 (positions part) | จัดการตำแหน่ง — M only (reads open) | S2.9 | matrix rows PERM-02a..e |
| §3.4 AZ-1 / AZ-2 (M1 part) | All decisions in `authz.ts`; every action calls authz first | S0.8, every action in S2 | matrix 401/MCP loops; review lens |
| FR-1201 (M1 part, X44) | Audit employees + positions + own-password/sign-out-everywhere | S0.9 `audit.ts`, services | matrix audit assertion; T-AUD-01..02 |
| §7.5 (client part, X04) | Undo stack 50, 8 s toast "เลิกทำ", Cmd/Ctrl+Z, Shift+Z | S3.1 `UndoProvider` | U-UNDO-01..09; E2E-11 |
| §8.1 (user menu, X33) | Avatar + name menu: บัญชีของฉัน, ธีม, ออกจากระบบ; ⚙️ ตั้งค่า (manager); collapsed sidebar persisted | S3.4 | U-MENU-01..02; E2E-13, E2E-14 |
| §8.6 | Cmd/Ctrl+Z undo, +Shift redo (e.code `KeyZ`, X49) | S1.9 `keys.ts`, S3.1 | U-KEY-01..05, U-UNDO-05..07 |
| §9 NFR-08a / NFR-08b | Better Auth default scrypt; cookies httpOnly + sameSite=lax, secure = `SECURE_COOKIES` | S0.8, S2.3 | T-AUTH-04, T-AUTH-04b |
| §10.3 | Env vars for auth + initial manager (+ `TRUSTED_*`, `ALLOW_TEST_HOOKS`, `APP_NOW`) | S0.3 | T-ENV-01 |
| §10.4 steps 1, 3 (+ idempotency) | Bootstrap manager + 6 positions | S2.12 | T-BOOT-01..06 |
| §11.1 (dates; units subset) | weekStart all weekdays, year boundary, todayBangkok 23:30 UTC | S1.2 | U-DATE-*, U-UNIT-* |
| §11.2 (harness + M1 rows) | Table-driven matrix, rows × M/L/Me/W | S0.14 harness, S4.1 rows | `tests/authz/matrix.int.test.ts` |
| §6.2 tables (X10 M1) | Better Auth tables, positions, work_schedules, user_preferences, audit_log, auth_login_failures | S0.4 | T-SCHEMA-01..05 |
| X05 | `user_preferences` + `getPreferences`/`setPreference` | S2.10, S3.1 | T-PREF-01..04; matrix PREF-01 |
| ACT-1 / ACT-3 (§7.3) | `action()` wrapper gate + errors; multi-table writes in one transaction | S0.6–S0.7, S2 | T-GATE-01..05, T-ERR-01..03; T-EMP-13 |
| X11 (M1 part) / SEED-A1 | `seed:golden` = positions, 6 users (one `demo1234` hash, `must_change_password=false`), schedules | S2.13 | T-SEED-01..03 |

### 1.3 Out of scope (do NOT build; target milestone)

| Item | Lands in |
|---|---|
| Every other §3.2 row (clients, projects, members, tasks, plans, milestones, pages, wiki, own/others' leave, workload) | M2–M9 (own leave + others' leave: M5) |
| Holidays, leave types, their settings pages, bootstrap step 2 (leave types), bootstrap step 4 check | M5 |
| Capacity rule BR-10..13 (`capacity.ts`, `deactivatedOn` → 0) | M5 (M1 only stores `deactivated_on`) |
| `units.ts` formatting/parsing (`formatCd`, `parseCellInput`, fraction mode) | M6 |
| `certainty.ts` | M3 |
| People directory `GET /api/people/options` (X09), member picker (AC-203 picker clause) | M2 |
| Assignee picker (AC-203 picker clause) | M3 |
| Grid "ปิดใช้งาน" label on old plans (AC-203 grid clause, closes AC-203) | M6 |
| `src/lib/query-keys.ts`, `src/lib/invalidate.ts`, TanStack queries | M2 (M1 has no TanStack-driven view) |
| `?` shortcut help registry (X07), `N` new task | M3 |
| Server-side `deleted_batch` restore pattern | M3 |
| Command palette Cmd/Ctrl+K | M4 |
| Sidebar project list, "ลูกค้า" nav entry · "ทีมงาน" (`/people`) nav entry | M2 · M9 |
| `src/lib/api.ts` `getJson` (X83), route handlers with id params (X86 malformed id → 404) | M2 |
| `InlineEditText`, `PersonPicker`, `ProjectChip`, `DateField`, `DeleteProjectDialog` | M2 / M3 |
| Preference keys other than `theme` and `sidebar.collapsed` | the milestone that first uses each key (M2 `sidebar.expanded`, M3, M4, M6, M9) |
| Masking, `visibleUserIds`, `requireProject` | M2 |
| `serverActions.allowedOrigins`, reverse-proxy docs, XFF hardening notes, `seed:demo`, compose `migrate` running bootstrap | M11 |
| Audit log UI | SPEC §13 Phase 2 #12 |
| Self-service password reset by email, verification email, SSO | not in SPEC (§13 Phase 3 for SSO) — never |

### 1.4 Carried-in items

From PLAN §1.4 into M1: X01 (all of `dates.ts`), X02 (`units.ts` conversions), X04 (client undo framework), X05
(`user_preferences`), X12 M1 part, X32 (post-login landing), X33 M1 part (collapsed state persisted), X60.

Expected from M0 (S0.1 verifies each; if a file is missing or named differently, S0 creates/adapts it and reports the
real path in its report so the orchestrator can forward it):

| Artifact | Expected path (PLAN §3) | Used by |
|---|---|---|
| Lazy DB client, `Db`/`Tx`/`DbOrTx` | `src/server/db/client.ts` | S0, S2 |
| Schema module + `orderKey` customType (may be empty) | `src/server/db/schema.ts` | S0.4 |
| Extensions custom migration (pg_trgm, btree_gist, pgcrypto) | `drizzle/0000_extensions.sql` + journal | S0.4 (trigram indexes) |
| Programmatic migrator | `scripts/migrate.ts` (`pnpm db:migrate`) | G0/G2 |
| Lazy env validation | `src/server/env.ts` | S0.3 |
| Vitest projects `unit`/`ui`/`integration`, template-DB harness, `next/cache` + `next/headers` mocks | `vitest.config.ts`, `tests/setup/{db-global,db-worker,ui}.ts`, `tests/stubs/empty.ts`, `tests/helpers/db.ts` | S0.14 |
| Proxy with CSP nonce + security headers | `src/proxy.ts` | S2.4 |
| i18n (`common`, `nav`) | `src/i18n/th.ts` | S0.13 |
| Theme, `AppProviders` (MUI cache + theme + QueryClient), shell (`AppShell`, `Sidebar`, data-driven nav, Cmd+\ collapse) | `src/lib/theme/theme.ts`, `src/components/providers/AppProviders.tsx`, `src/components/shell/*` | S3 |
| `/home` placeholder, `/` → `/home` | `src/app/(app)/home/page.tsx`, `src/app/page.tsx` | S3, E2E |
| `src/components/Link.tsx`, `EmptyState` | `src/components/Link.tsx`, `src/components/common/EmptyState.tsx` | S3 |
| Playwright config (prod build on :3100), `e2e/global-setup.ts`, `e2e/fixtures.ts` (CSP guard, clock), `e2e/m0-smoke.spec.ts` | | S4 |
| `src/lib/action-result.ts` (`unwrap`) — may not exist | | S0.7 creates/extends |

---

## 2. Read first

- **SPEC:** §0–§3 (all), §4.1, §4.2, §5.1, §6.1, §6.2 (Better Auth block, `positions`, `user_preferences`,
  `work_schedules`, `audit_log`), §6.4 (trigram on `"user".name/nickname`), §7.3, §7.5, §8.1, §8.6, §8.8, §8.9, §9,
  §10.3, §10.4, §11.1, §11.2, §12 M1, Appendix A.1 (users table).
- **PLAN.md:** §1.2 (versions), §1.3 (Better Auth, Next 16.3 proxy/refresh, Drizzle, Zod 4, testing facts),
  §1.4 X01, X02, X04, X05, X10–X12, X32, X33, X40–X49, X51, X53, X60; §2.3 ownership; §3.1, §3.4 (errors, action,
  route, authz, data access, audit, clock), §3.5, §3.6, §3.7, §3.8, §3.9, §3.12, §3.13; §4.1–§4.5.
- **Research:** `plan/research/r2-auth-db.md` §0, §2 (all), §3, §4, §5, §6, §7, §8, §10.3, §11.3, §12 (auth tables);
  `plan/research/r1-next-mui-tooling.md` §2.1–§2.3, §12.6, §12.8; `plan/research/r4-client-testing.md` §23, §25–§26,
  §29–§30, §32, §34, §36, §38, §45; `plan/research/r6a-gaps-m0-m5.md` §3.0 (X-01…X-28) and §3.2 (M1-01…M1-23),
  §5.1, §5.2, §5.8, §6 rows 1–5 — **PLAN §1.4 overrides r6a where they differ** (proxy session validation instead of
  `SessionKeepAlive`; login as a server action instead of `authClient`; `FOR UPDATE` instead of an advisory lock for
  the last manager; `pnpm check` includes integration; `APP_NOW` not `APP_FAKE_TODAY`).
- **Snippets:** `plan/research/snippets/r2/v2/gen/auth.ts` (admin roles), `plan/research/snippets/r2/app/scripts/lockout-api.ts`
  (lockout probe), `plan/research/snippets/r1/src/proxy.ts` (CSP base), `plan/research/snippets/r4/vitest/src/domain/dates.ts`
  + `dates.test.ts` (shape only — M1 replaces the `Date`-based arithmetic with epoch days),
  `plan/research/snippets/r4/client/components/ToasterHost.tsx`, `plan/research/snippets/r4/client/lib/action-result.ts`,
  `plan/research/snippets/r4/db/order-key.schema.ts`, `plan/research/snippets/r4/vitest/tests/{setup/db-worker.ts,integration/rename-task.test.ts}`.
- **docs:** `docs/reference/golden-fixtures.json` (`positions`, `users`), `docs/history/decisions-log.md` (intent only).

---

## 3. Decisions for this milestone

### 3.1 PLAN §1.4 rulings that apply (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | What it means in M1 |
|---|---|
| X01 | All of `src/domain/dates.ts` (SPEC §5.1 API + `isISODate`, `compareISO`, `diffDays`, `addWeeks`, `eachDay`, `minISO`, `maxISO`, `toEpochDay`, `fromEpochDay`) built test-first here, integer epoch-day math; only `todayBangkok` touches `Date`. M5 adds only `capacity.ts`. |
| X02 | `units.ts` gets only `numericToCd`/`cdToNumeric` (string parsing, no float). Used for `work_schedules.fraction`. |
| X04 | `UndoProvider` + `useUndo` + `toastUndo` + global Cmd/Ctrl+Z / Shift+Z built here; first users: position delete, deactivate/reactivate. |
| X05 | `user_preferences` table, `getPreferences` (server) + `setPreference` action (zod-validated keys, debounced on the client, **not audited**). M1 keys: `theme`, `sidebar.collapsed`. |
| X10 | M1 tables: `user`, `session`, `account`, `verification`, `positions`, `work_schedules`, `user_preferences`, `audit_log`, `auth_login_failures`. One generated migration `0001_m1_auth_employees`. |
| X11 | `seedGolden` M1 stage: 6 positions (JSON order), 6 users (one shared `demo1234` hash, `must_change_password=false`), 30 schedule rows. |
| X12 | AC-203 M1 part only: login blocked, sessions revoked, `listAssignableUsers()` excludes deactivated users, "ปิดใช้งาน" chip in the employee list. Picker clauses M2/M3, grid clause M6. |
| X32 | After login and after a forced password change the user lands on `?next=` (same-origin relative path) or `/home`. |
| X33 | M1 persists the sidebar collapsed state in `user_preferences` (`sidebar.collapsed`); nav items appear only when their page exists (⚙️ ตั้งค่า for managers). |
| X40 | `pnpm check` runs typecheck + lint + unit + ui + integration (needs `pnpm db:up`). |
| X41 | Workers calling manager-only actions → `FORBIDDEN` (403); `/settings/*` pages → `notFound()` for workers, decided at the top of layout/page before any Suspense; unauthenticated → 401 (routes) / redirect (pages) / `UNAUTHENTICATED` (actions); `mustChangePassword` → 403 `MUST_CHANGE_PASSWORD` or redirect. |
| X42 / X43 | Not applicable yet (no projects). The matrix harness already uses the M/L/Me/W columns; in M1 L/Me/W are three plain workers. |
| X44 | Every mutating action writes exactly one audit row inside its transaction, except `setPreference`; summaries from `th.audit.*`; password changes store `{ passwordChanged: true }` only. Matrix asserts the row. |
| X45 | `src/server/clock.ts` `serverNow()`/`serverToday()` honour `APP_NOW` only when `ALLOW_TEST_HOOKS=1`; a startup warning when set with `NODE_ENV=production`. Never used by auth/sessions/lockout. |
| X46 | E2E against the production build on :3100, reset (truncate + `seedGolden`) per spec file from the Playwright process, API login per role, page objects. |
| X47 | `z.uuid()`, Thai only via `th.*`, `refresh()` instead of `revalidateTag`. |
| X48 | `positions.position` is `orderKey` (`text COLLATE "C"`), keys generated on the server under `pg_advisory_xact_lock(hashtext('positions'))`, `ORDER BY position, id`; equal neighbours → re-key with `generateNKeysBetween`. |
| X49 | Shortcut matching by `e.code` first (`KeyZ`), `e.key` fallback; global shortcuts ignore editable targets, `.bn-editor` and `e.defaultPrevented`. |
| X51 | Avatar colours: 12-colour palette, each ≥ 4.5:1 against white text (unit-tested). |
| X53 | No `localStorage`; random password via `crypto.getRandomValues`; `copyText()` falls back to `execCommand('copy')`; ids from the server. |
| X80 / X87 | Repo/service files are kebab-case (M1's are single words); imports go through namespace barrels `src/server/repo/index.ts` and `src/server/services/index.ts` (`repo.<area>.<fn>`, `services.<area>.<fn>`), which every later milestone appends to. |
| X86 | `ActionFailure.extra` carries an action error's extra fields to client code; route handlers parse id params inside the handler and treat a malformed id as 404 `NOT_FOUND` (first used in M2; M1's routes take no id). |
| X91 | Test harness contract built here: `AuthzRow.with?: WorldPart[]`, route rows name their `action` as `'<METHOD> /api/<path>'`, `Outcome` includes `'413'`/`'415'`, factories insert with plain Drizzle, `resetDb(fixture?, opts?)` also empties `UPLOAD_DIR`; `tests/authz/rows/index.ts` is created here and each later milestone's test stream appends its rows files. |
| X93 / X96 | `AuditEntity` grows to exactly the X93 list (M1: `user`, `position`); the audit row is written in the service, same transaction, after the change (M1-D5 = X96 default). |
| X60 | Password policy 8–128, ≠ email and ≠ its local part (trim + lowercase), on self-change ≠ current; random 12 chars, unambiguous alphabet, ≥ 1 upper/lower/digit, shown once; deactivation keeps memberships/assignments/plans; self-deactivation blocked; last active manager protected with `FOR UPDATE`; role change does not revoke sessions; schedules weekday toggles 1–7 × {0.25, 0.5, 0.75, 1.0}, ≥ 1 day, default Mon–Fri 1.00, no effective dating; positions optional, up/down ordering, delete blocked with count; colour = least-used of 12; `/account/password` is the account page. |

### 3.2 Milestone-specific decisions

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M1-D1 | §6.2 BA comment "generate ด้วย CLI" | **DEVIATION (small):** Better Auth tables are hand-written in `schema.ts` (timestamptz, `role` default, uuid FK, app-owned `deactivated_on` DATE) and validated with `pnpm auth:check` (`auth check schema`). The CLI output is a reference only; drizzle-kit is the only migration tool. | CLI emits `timestamp` without tz (7 h shift, r2 §8.2) and text `position_id`. |
| M1-D2 | §6.2 BA comment | Add `user.ban_expires timestamptz` and `session.impersonated_by text` (PLAN §1.3 correction). `banned` keeps SPEC nullability with `DEFAULT false`; "active" is always `banned IS NOT TRUE`. Trigram indexes `user_name_trgm`, `user_nickname_trgm` created now (§6.4, PLAN §1.3). | Admin plugin schema check fails without them (r2 §3.2). |
| M1-D3 | §7.1 Auth note ("admin plugin ให้ createUser / setUserPassword / setRole / ban / revokeSessions") | Keep the admin plugin for its columns, role typing and sign-in ban enforcement (`BANNED_USER`), but **all account mutations go through our transactional services** (direct inserts with `hashPassword` from `better-auth/crypto`, `providerId='credential'`, `accountId=userId`, ids `crypto.randomUUID()`). Every `/admin/*` HTTP path is disabled. | Plugin endpoints are not transactional with schedules/audit, `setUserPassword` does not revoke sessions (FR-204), cannot enforce FR-206 (r2 §7.2). |
| M1-D4 | §3.4, PLAN §3.1 | **server-only boundary:** `import 'server-only'` stays in `session.ts`, `clock.ts` (and later `storage.ts`). `auth.ts`, `db/client.ts`, `db/types.ts`, `db/schema.ts`, `env.ts`, `repo/**`, `services/**`, `audit.ts`, `errors.ts` must **not** import `server-only` or any module that does, and services never read the clock (callers pass `today`). | `auth check schema` (CLI), `tsx` scripts (bootstrap/seed) and the Playwright reset all import these modules outside the `react-server` condition, where `server-only` throws (r4 §34). Client bundles still cannot import them (they pull in `postgres`). |
| M1-D5 | §7.3 | Audit rows are written **by the service** as its last statement inside the caller's transaction (so `bootstrap`/`seedGolden`, which call the same services with `actor = null`, audit too). Actions never write a second row. | One code path for UI and scripts; X44 "one row per user operation". |
| M1-D6 | §7.3 | `login` uses `publicAction()` (same wrapper minus the session gate). `logout`, `changeOwnPassword`, `signOutEverywhere` use `action(..., { allowWhenMustChangePassword: true })`. | AC-103 must still allow leaving and changing the password. |
| M1-D7 | §7.3 | Auth actions return `{ redirectTo }` and the client performs a **full navigation** (`window.location.assign`) instead of `redirect()`/`router.push`. | The root layout (theme class from preferences) is not re-rendered by client navigation; a full load also drops every client cache (PLAN §3.5 "logout calls queryClient.clear()"). |
| M1-D8 | FR-201…FR-207 | One `updateEmployee` action covers profile + role + schedule in **one transaction with one audit row** (`before`/`after` of the changed fields). Deactivate, reactivate and reset password are separate actions. | One user operation = one tx = one audit row (X44); the edit dialog saves once. |
| M1-D9 | FR-1201 / X44 | Session lifecycle is not audited (`login`, `logout`); failures live in `auth_login_failures`. `changeOwnPassword` and `signOutEverywhere` are audited (`entity:'user'`, `after:{ passwordChanged:true }` / `{ signedOutEverywhere:true }`). | Audit records changes to data; sessions are Better Auth's bookkeeping. |
| M1-D10 | FR-107 | `signOutEverywhere` = one Drizzle tx: `DELETE FROM session WHERE user_id = me` + audit; the response redirects to `/login`; the next page request finds no session and the proxy forwards Better Auth's cookie-clearing headers. | Transactional with the audit row; verified proxy behaviour for deleted sessions (r2 §2.6). |
| M1-D11 | FR-106 | Lockout per PLAN §1.3: table `auth_login_failures(id, email, ip, created_at)` + `hooks.before`/`hooks.after` on `/sign-in/email`; static Thai message ("…รอ 15 นาที…"); attempts while locked are not recorded (lock ends 15 min after the 5th failure); unknown emails count the same (no enumeration). Built-in `rateLimit` enabled in production as a backstop (`/sign-in/email` 30 per 60 s), disabled when `ALLOW_TEST_HOOKS=1`. | PLAN §1.3 overrides r2 §6.4's "leave it off". |
| M1-D12 | FR-106, §9 | Better Auth error codes map to our codes in one function `mapAuthApiError`: `INVALID_EMAIL_OR_PASSWORD`/`INVALID_EMAIL` → `INVALID_CREDENTIALS` (401), `BANNED_USER` → `ACCOUNT_DEACTIVATED` (403), `LOGIN_LOCKED`/HTTP 429 → `LOGIN_LOCKED` (429). Messages from `th.auth.errors`. | X-26; one Thai message per situation. |
| M1-D13 | FR-205 | Deactivate sets `banned=true, ban_reason='DEACTIVATED', ban_expires=null, deactivated_on=serverToday()` and deletes the user's sessions; reactivate clears all four. Both are immediate with an undo toast whose undo is the inverse action (no confirm, P2). | AC-104 "หลุดทันที"; reversible → no dialog (CLAUDE UX). |
| M1-D14 | FR-208 | Positions have no soft delete: deleting an unused position hard-deletes it and returns `{ id, name, position }`; undo calls `restorePosition` which re-inserts the same id, name and key (23505 → `CONFLICT` "กู้คืนไม่ได้…"). Rename/move have no undo. | P2 only requires undo for deletions; DDL has no `deleted_at` on positions. |
| M1-D15 | FR-209 | The employee list (≤ 100 rows) is server-rendered; search/filter run client-side: NFC + `toLocaleLowerCase('th')` substring on name and nickname, position (incl. "ไม่ระบุตำแหน่ง"), status `all` (default) / `active` / `deactivated`; sort active first, then `Intl.Collator('th')` on display name. | Scale makes client filtering simplest (r6a M1-17). |
| M1-D16 | FR-201 | A manager may change an employee's email (unique, trimmed, lowercased; 23505 → field error); sessions are kept. Resetting one's own password is hidden in the UI (use `/account/password`); the server allows it. | Account is keyed by user id (r2 §7.2). |
| M1-D17 | X05 | Preference keys in M1 are only `theme` (`light|dark|system`, default `system`) and `sidebar.collapsed` (default `false`); later milestones add their keys to the same discriminated union. Invalid stored values fall back to defaults (`.catch`). | "Features add keys later"; no stubs for M3+ features. |
| M1-D18 | §5.1 `weekRange` | `weekRange(from, to)` returns every **Monday m with from ≤ m < to** (callers pass Mondays; `weekRange('2026-09-30','2026-10-19')` = `['2026-10-05','2026-10-12']`). `daysOfWeek(ws)` returns the 7 days starting at `weekStart(ws)`. | Literal reading of "วันจันทร์ทุกสัปดาห์ใน [from, to)". |
| M1-D19 | §11.2 | Integration tests are split: S2 writes colocated mechanics tests (`src/server/**/*.int.test.ts`, `scripts/**/*.int.test.ts`: keys, conversions, colour pick); S4 writes acceptance/security suites in `tests/integration/*.int.test.ts` and `tests/authz/**`. M1 factories insert through the schema directly (repo functions are being written in parallel). | Non-overlapping ownership (PLAN §2.3). |
| M1-D20 | FR-210, §8.9 | Avatar colour palette (12, white text ≥ 4.5:1): `#2F5597 #7C3AED #B91C1C #C2410C #A16207 #15803D #0F766E #0369A1 #4338CA #BE185D #475569 #854D0E`; new users get the least-used colour (tie → palette order); initials = first grapheme of `displayName` via `Intl.Segmenter('th', { granularity: 'grapheme' })`. | P5, Thai correctness, contrast (X51). |
| M1-D21 | §8.1 | `/account/password` lives in the `(auth)` group (no sidebar); `/account` redirects to it; the user menu links to it. `/settings` redirects to `/settings/employees`. | SPEC §7.2 defines only this account route (r6a M1-09). |
| M1-D22 | BR-02 | `numericToCd` parses the decimal string (`/^\d+(\.\d{1,2})?$/`) instead of SPEC's `Math.round(parseFloat(v) * 100)`; identical results for every `numeric(≤4,2)` value, no float. | BR-01 (PLAN §3.6 / X02). |
| M1-D23 | §7.3, PLAN §3.4.1 | `ErrorCode` adds `LAST_MANAGER`, `SELF_DEACTIVATE`, `IN_USE` (409), `INVALID_CREDENTIALS` (401), `ACCOUNT_DEACTIVATED` (403), `INVALID_PASSWORD` (400). `NEEDS_CHOICE` is added by M7. | PLAN table ends with "…"; the matrix `outcomeOf` needs the status per code. |
| M1-D24 | §12 M5 lists `dates.ts` | `dates.ts` moves to M1 (X01); `src/domain/types.ts` is created by S0 as a **type-only** contract file (`ISODate`, `Cd`, `Weekday`, `Schedule`, `FractionCd`) so DTOs compile before S1; S1 owns it afterwards. | Streams code against S0 contracts; a type-only file has no statements, so the domain coverage gate is unaffected. |
| M1-D25 | §7.1, CLAUDE (new libraries need a reason) | Dependencies added in M1, all pinned in PLAN §1.2: `better-auth` 1.7.6 (§7.1 Auth), `zod` 4.6.5 (§7.1 Validation; Better Auth peer), `fractional-indexing` 4.0.0 (§6.1 positions order), `sonner` 2.0.8 (§7.1 toasts, undo), dev `auth` 1.7.6 (schema check only), `tsx` (scripts), `fast-check` 4.10.2 (§11.1 properties). No other library. | Each is required by a SPEC row of this milestone. |

---

## 4. Streams (machine-readable)

```json
{ "milestone": 1,
  "streams": [
    { "id": "S0", "title": "Contracts: deps, schema + migration, server core, schemas, DTOs, action stubs, i18n, test harness", "agent": "backend-engineer",
      "owns": ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".env.example", "vitest.config.ts", "playwright.config.ts",
               "drizzle/**", "src/server/db/**", "src/server/env.ts", "src/server/errors.ts", "src/server/action.ts", "src/server/route.ts",
               "src/server/session.ts", "src/server/authz.ts", "src/server/audit.ts", "src/server/auth.ts", "src/server/actions/**",
               "src/server/services/**", "src/lib/z.ts", "src/lib/action-result.ts", "src/lib/schemas/**", "src/lib/contracts/**",
               "src/lib/user-colors.ts", "src/domain/types.ts", "src/i18n/th.ts", "tests/setup/**", "tests/helpers/**", "tests/authz/**",
               "scripts/lib/db.ts", "scripts/lib/fixtures.ts", "scripts/lib/bootstrap.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain: dates.ts, units.ts subset, pure helpers (password, display name, safe next, colours, keys)", "agent": "domain-engineer",
      "owns": ["src/domain/**", "src/lib/random-password.ts", "src/lib/random-password.test.ts", "src/lib/display-name.ts",
               "src/lib/display-name.test.ts", "src/lib/safe-next.ts", "src/lib/safe-next.test.ts", "src/lib/user-colors.ts",
               "src/lib/user-colors.test.ts", "src/lib/keys.ts", "src/lib/keys.test.ts"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Backend: Better Auth + lockout, proxy session gate, clock, repo/services/actions, bootstrap, seed-golden", "agent": "backend-engineer",
      "owns": ["src/server/**", "src/proxy.ts", "src/instrumentation.ts", "src/app/api/auth/**", "scripts/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S2" },
    { "id": "S3", "title": "Frontend: login, account, user menu, settings/employees, settings/positions, undo, preferences, UserName/UserAvatar", "agent": "frontend-engineer",
      "owns": ["src/app/layout.tsx", "src/app/(auth)/**", "src/app/(app)/layout.tsx", "src/app/(app)/settings/**",
               "src/components/**", "src/hooks/**", "src/lib/copy-text.ts", "src/lib/copy-text.test.ts"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Tests: authz rows, auth/lockout/session/employee/position/bootstrap/seed suites, e2e m1-auth + m0-smoke update", "agent": "test-engineer",
      "owns": ["tests/**", "e2e/**"],
      "dependsOn": ["S0"], "planSection": "5.S4" }
  ],
  "e2e": ["e2e/m1-auth.spec.ts"] }
```

Concurrency: S1 ∥ S4 after G0; S2 ∥ S3 ∥ S4 after S1. Owned paths of concurrent streams do not overlap
(S0's files are handed over: S2 takes `src/server/**` (incl. the action and service stubs)/`scripts/**`, S1 takes `src/domain/types.ts` and
`src/lib/user-colors.ts`, S4 takes `tests/**`). `src/i18n/th.ts` belongs to S0; later streams may only add keys inside
their own namespaces with Edit (S2: `audit`, `errors`; S3: `auth`, `account`, `employees`, `positions`, `users`, `prefs`,
`undo`, `nav`). Changes vs the PLAN §5 skeleton: `clock.ts` moves from S0 to S2 (it imports `todayBangkok`, which S1
builds); nav entries are added by S3 (it owns `src/components/shell/**`), S0 only adds their strings; S4 starts right
after G0 because factories insert through the schema (M1-D19).

## 5. Step-by-step

### 5.S0 — Contracts  (backend-engineer · package.json, lockfile, env, vitest/playwright config, drizzle/**, src/server/db/**, server core, action + service stubs, src/lib/{z,action-result,user-colors}.ts, src/lib/{schemas,contracts}/**, src/domain/types.ts, src/i18n/th.ts, tests/{setup,helpers,authz}/**, scripts/lib/{db,fixtures,bootstrap}.ts)

S0 runs alone. Everything later streams import is created here with real types; bodies that belong to S2 are stubs
that throw `new Error('NOT_IMPLEMENTED: S2.x')` (the wrapper turns that into `INTERNAL`). **Do not create any file
with runtime code under `src/domain/**`** (coverage gate) — only the type-only `src/domain/types.ts`.

**S0.1 Preflight + carried-in check.** `git status` clean, `pnpm db:up`, `pnpm check` green on M0. Confirm every row of
§1.4 "Expected from M0" exists; read `src/proxy.ts`, `src/server/db/client.ts`, `src/server/env.ts`,
`tests/setup/db-worker.ts`, `src/components/providers/AppProviders.tsx`, the nav config under `src/components/shell/`,
`e2e/fixtures.ts`. Record the actual paths/export names in the S0 report (`m0Artifacts`). If `db/client.ts` or `env.ts`
import `server-only`, remove that import (M1-D4). Done-check: report lists every artifact with its path.

**S0.2 Dependencies (one batch, PLAN §1.2; skip any already present at the pinned version).**
```bash
pnpm add better-auth@1.7.6 zod@4.6.5 fractional-indexing@4.0.0 sonner@2.0.8
pnpm add -D auth@1.7.6 tsx@^4.23 fast-check@4.10.2
```
Never `@better-auth/cli` (deprecated), never `@fast-check/vitest` (not pinned; use `fc.assert`). If pnpm reports an
ignored build script for a new package, add an explicit `allowBuilds` entry in `pnpm-workspace.yaml` and a Decision
row in the S0 report; commit any `minimumReleaseAgeExclude` entries pnpm adds. Add scripts to `package.json`:
```jsonc
"bootstrap":   "tsx --env-file-if-exists=.env scripts/bootstrap.ts",
"seed:golden": "tsx --env-file-if-exists=.env scripts/seed-golden.ts",
"db:reset":    "tsx --env-file-if-exists=.env scripts/db-reset.ts",
"auth:check":  "auth check schema --config src/server/auth.ts"
```
(`pnpm auth:check` = `pnpm exec auth check schema --config src/server/auth.ts`, exit 1 on mismatch — r2 §8.1.)
Done-check: `pnpm ls better-auth zod fractional-indexing sonner auth fast-check` shows the pins.

**S0.3 Environment.** Append to `.env.example` (comments English, no secrets):
```bash
BETTER_AUTH_SECRET=            # openssl rand -base64 32 (>= 32 chars)
BETTER_AUTH_URL=http://localhost:3000   # the URL users actually open
SECURE_COOKIES=false           # true behind HTTPS; switching it logs everyone out
TRUSTED_ORIGINS=               # optional, comma-separated extra origins (e.g. http://10.0.0.5:3000)
TRUSTED_PROXIES=               # optional, comma-separated proxy IPs/CIDRs that append X-Forwarded-For
INITIAL_MANAGER_EMAIL=
INITIAL_MANAGER_NAME=
INITIAL_MANAGER_PASSWORD=      # first deploy only; forced change at first login; never printed
# Test-only, NEVER in production: ALLOW_TEST_HOOKS=1 enables APP_NOW (e.g. 2026-09-30T10:00:00+07:00) and disables the auth rate limit
```
Extend `src/server/env.ts` (lazy, cached, no `server-only`):
```ts
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  SECURE_COOKIES: z.enum(['true', 'false']).default('false'),
  TRUSTED_ORIGINS: z.string().default(''),
  TRUSTED_PROXIES: z.string().default(''),
  ALLOW_TEST_HOOKS: z.enum(['0', '1']).optional(),
  APP_NOW: z.iso.datetime({ offset: true }).optional(),
  INITIAL_MANAGER_EMAIL: z.string().optional(),
  INITIAL_MANAGER_NAME: z.string().optional(),
  INITIAL_MANAGER_PASSWORD: z.string().optional(),
})
export function env(): z.infer<typeof schema>            // parses process.env once, throws a readable error
export function csv(value: string | undefined): string[] // split(',').map(trim).filter(Boolean)
```
`auth.ts` reads `process.env.*` directly (never throws at import, so `next build` and `auth check schema` work without
secrets). Check `playwright.config.ts` `webServer.env` contains every PLAN §4.5 key (`DATABASE_URL` of `planner_e2e`,
`ALLOW_TEST_HOOKS: '1'`, `APP_NOW: '2026-09-30T10:00:00+07:00'`, `BETTER_AUTH_URL: 'http://localhost:3100'`,
`BETTER_AUTH_SECRET` ≥ 32 chars, `SECURE_COOKIES: 'false'`); add the missing ones. Tests first:
`src/server/env.test.ts` › `T-ENV-01 rejects a 31-char secret, accepts 32; SECURE_COOKIES defaults to 'false'; csv(' a, ,b ')=['a','b']`.

**S0.4 Schema + migration.** In `src/server/db/schema.ts` (keep M0's `orderKey`; add it from
`plan/research/snippets/r4/db/order-key.schema.ts` if absent). Property keys are Better Auth field names (camelCase),
column names snake_case (r2 §8.1). Define `positions` before `user`.
```ts
import { sql } from 'drizzle-orm'
import { bigserial, boolean, check, customType, date, index, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const orderKey = customType<{ data: string }>({ dataType() { return 'text COLLATE "C"' } })
const tstz = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () => tstz('created_at').notNull().defaultNow()
const updatedAt = () => tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date())

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),                    // positions_name_unique
  position: orderKey('position').notNull(),                 // fractional index, COLLATE "C"
  createdAt: createdAt(),
})

export const user = pgTable('user', {
  id: text('id').primaryKey(),                              // crypto.randomUUID() from our services
  name: text('name').notNull(),
  email: text('email').notNull().unique(),                  // user_email_unique; always lower(trim(email))
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  role: text('role').notNull().default('worker'),           // 'manager' | 'worker' — narrowed in authz.ts
  banned: boolean('banned').default(false),                 // SPEC nullability; active = banned IS NOT TRUE
  banReason: text('ban_reason'),
  banExpires: tstz('ban_expires'),                          // admin plugin (PLAN §1.3)
  nickname: text('nickname'),
  positionId: uuid('position_id').references(() => positions.id),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  color: text('color'),
  deactivatedOn: date('deactivated_on', { mode: 'string' }), // app-owned; NOT declared to Better Auth
}, (t) => [
  index('user_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
  index('user_nickname_trgm').using('gin', t.nickname.op('gin_trgm_ops')),
])

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: tstz('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),                  // admin plugin (PLAN §1.3)
}, (t) => [index('session_user_id_idx').on(t.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: tstz('access_token_expires_at'), refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
  scope: text('scope'), password: text('password'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('account_user_id_idx').on(t.userId)])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: tstz('expires_at').notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('verification_identifier_idx').on(t.identifier)])

export const authLoginFailures = pgTable('auth_login_failures', {   // FR-106 (PLAN §1.3)
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull(),                           // lower(trim(email))
  ip: text('ip').notNull(),                                 // getIP() or 'unknown'
  createdAt: createdAt(),
}, (t) => [index('auth_login_failures_email_ip_created_at_idx').on(t.email, t.ip, t.createdAt)])

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
})

export const workSchedules = pgTable('work_schedules', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  weekday: smallint('weekday').notNull(),                   // 1 = Monday
  fraction: numeric('fraction', { precision: 3, scale: 2 }).notNull(),   // string '1.00' ↔ cd via units.ts
}, (t) => [
  primaryKey({ columns: [t.userId, t.weekday] }),
  check('work_schedules_weekday_check', sql`${t.weekday} between 1 and 7`),
  check('work_schedules_fraction_check', sql`${t.fraction} > 0 and ${t.fraction} <= 1`),
])

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorId: text('actor_id').references(() => user.id),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),                         // 'create' | 'update' | 'delete' | 'restore'
  projectId: uuid('project_id'),                            // no FK (SPEC)
  summary: text('summary'),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: createdAt(),
}, (t) => [
  index('audit_log_project_id_created_at_idx').on(t.projectId, t.createdAt.desc()),
  index('audit_log_entity_idx').on(t.entity, t.entityId),
])
```
Then `pnpm db:generate --name=m1_auth_employees` (→ `drizzle/0001_m1_auth_employees.sql`, journaled after
`0000_extensions`), `pnpm db:migrate`, `pnpm db:generate` again → "No schema changes", `pnpm exec drizzle-kit check`.
Inspect the SQL: `"position" text COLLATE "C" NOT NULL`, `USING gin ("name" gin_trgm_ops)`, every timestamp
`timestamp with time zone`, `"deactivated_on" date`, `"fraction" numeric(3, 2)`. **Never hand-edit it.** No custom
migration is needed in M1. Done-check: migration applies on a fresh DB; second generate is a no-op.

**S0.5 DB types (M1-D4).** `src/server/db/types.ts` (no `server-only`):
```ts
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from './schema'
export type Db = PostgresJsDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx
```
`client.ts` keeps the lazy `db` and re-exports these types. Repo/services import types with `import type` only.

**S0.6 Errors (`src/server/errors.ts`, no `server-only`).** `ErrorCode` lives in `src/lib/action-result.ts`
(isomorphic, imported by client code):
```ts
export type ErrorCode = 'UNAUTHENTICATED' | 'MUST_CHANGE_PASSWORD' | 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION' | 'CONFLICT'
  | 'VERSION_CONFLICT' | 'OVERLAP' | 'LAST_MANAGER' | 'SELF_DEACTIVATE' | 'IN_USE' | 'LOGIN_LOCKED'
  | 'INVALID_CREDENTIALS' | 'ACCOUNT_DEACTIVATED' | 'INVALID_PASSWORD' | 'INTERNAL'
export const ERROR_STATUS: Record<ErrorCode, number> = { UNAUTHENTICATED: 401, MUST_CHANGE_PASSWORD: 403, NOT_FOUND: 404,
  FORBIDDEN: 403, VALIDATION: 400, CONFLICT: 409, VERSION_CONFLICT: 409, OVERLAP: 409, LAST_MANAGER: 409,
  SELF_DEACTIVATE: 409, IN_USE: 409, LOGIN_LOCKED: 429, INVALID_CREDENTIALS: 401, ACCOUNT_DEACTIVATED: 403,
  INVALID_PASSWORD: 400, INTERNAL: 500 }
```
```ts
export class AppError extends Error {
  constructor(readonly code: ErrorCode, message?: string,
              readonly extra: { fieldErrors?: Record<string, string[]> } & Record<string, unknown> = {}) {
    super(message ?? th.errors[code]); this.name = 'AppError'
  }
  get status(): number { return ERROR_STATUS[this.code] }
}
export class UnauthenticatedError extends AppError { constructor() { super('UNAUTHENTICATED') } }
export class MustChangePasswordError extends AppError { constructor() { super('MUST_CHANGE_PASSWORD') } }
export class NotFoundError extends AppError { constructor() { super('NOT_FOUND') } }
export class ForbiddenError extends AppError { constructor(message?: string) { super('FORBIDDEN', message) } }
export class ValidationError extends AppError {
  static fromZod(err: z.ZodError): ValidationError   // fieldErrors = z.flattenError(err).fieldErrors (string[] per key)
  constructor(fieldErrors: Record<string, string[]>, message?: string) { super('VALIDATION', message, { fieldErrors }) }
}
export class ConflictError extends AppError {
  constructor(code: 'CONFLICT' | 'VERSION_CONFLICT' | 'OVERLAP' | 'LAST_MANAGER' | 'SELF_DEACTIVATE' | 'IN_USE',
              message?: string, extra?: AppError['extra']) { super(code, message, extra) }
}
export class RateLimitedError extends AppError { constructor() { super('LOGIN_LOCKED', th.auth.errors.LOGIN_LOCKED) } }
/** Postgres errors: read e.cause?.code ?? e.code (DrizzleQueryError wraps PostgresError). Never log .message (params may hold hashes). */
export function mapDbError(e: unknown): AppError | null
// 23505 → ConflictError('CONFLICT'), 23503 → ConflictError('IN_USE'), 23P01 → ConflictError('OVERLAP'),
// 23514 → ValidationError({}), P0001 (WEEK_DAY_CONFLICT) → AppError('INTERNAL'); otherwise null
// (M6 adds a constraint-specific branch before OVERLAP: 23P01 on allocations_one_resolution_per_week → INTERNAL, X86)
export function pgErrorInfo(e: unknown): { code?: string; constraint?: string } // for services that branch on constraint names
export function toActionError(e: unknown): ActionError   // AppError → {ok:false, code, message, ...extra}; DB → mapDbError; else log {name, code} + INTERNAL
```
Tests first: `src/server/errors.test.ts` (unit, plain objects — `mapDbError` reads `e.cause?.code ?? e.code`):
`T-ERR-02 { cause: { code: '23503' } }` → `IN_USE`, `{ code: '23P01' }` → `OVERLAP`, `{ cause: { code: '23514' } }` → `VALIDATION`,
`new Error('x')` → `null`; `T-ERR-03 toActionError(new Error('secret-param'))` → `{ ok:false, code:'INTERNAL', message: th.errors.INTERNAL }`
and the `console.error` spy never receives `'secret-param'`. `src/server/errors.int.test.ts`: `T-ERR-01` a real duplicate
insert into `positions` (name) caught as `DrizzleQueryError` → `mapDbError` → `CONFLICT`, and `pgErrorInfo` →
`{ code: '23505', constraint: 'positions_name_unique' }`.

**S0.7 `action()`, `publicAction()`, `route()`, client `unwrap`.** `src/lib/action-result.ts` (start from
`plan/research/snippets/r4/client/lib/action-result.ts`; keep its `unwrap` + `ActionFailure` class):
```ts
export type ActionError = { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } & Record<string, unknown>
export type ActionResult<T extends object> = ({ ok: true } & T) | ActionError
export class ActionFailure extends Error { readonly code: ErrorCode; readonly fieldErrors?: Record<string, string[]>
  /** every other field of the ActionError (e.g. VERSION_CONFLICT `current`, NEEDS_CHOICE `{ week, weeks, pairs }`, VALIDATION `issues`) — X86 */
  readonly extra: Readonly<Record<string, unknown>>; constructor(fail: ActionError) }
export function unwrap<T extends object>(res: ActionResult<T>): { ok: true } & T   // throws ActionFailure
```
`src/server/action.ts`:
```ts
export interface ActionCtx { user: SessionUser }
export function action<S extends z.ZodType, T extends object>(
  schema: S, handler: (input: z.output<S>, ctx: ActionCtx) => Promise<T>,
  opts?: { allowWhenMustChangePassword?: boolean },
): (input: z.input<S>) => Promise<ActionResult<T>>
// try { user = await getSessionUser() → UnauthenticatedError; user.mustChangePassword && !opts.allow… → MustChangePasswordError;
//       parsed = schema.safeParse(input) → ValidationError.fromZod; return { ok: true, ...(await handler(parsed.data, { user })) } }
// catch (e) { unstable_rethrow(e)  /* next/navigation: keeps redirect()/notFound() working */; return toActionError(e) }
export function publicAction<S extends z.ZodType, T extends object>(
  schema: S, handler: (input: z.output<S>, ctx: { user: SessionUser | null }) => Promise<T>,
): (input: z.input<S>) => Promise<ActionResult<T>>
```
If `unstable_rethrow` is missing from `next/navigation` in 16.3.7 (check `node_modules/next/dist/docs`), rethrow when
`typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')` and record it. `src/server/route.ts` exactly as
PLAN §3.4.3 (`route(handler, { query?, public?, allowWhenMustChangePassword? })`; objects → JSON with
`Cache-Control: private, no-store` + `X-Content-Type-Options: nosniff`; AppError → `{ code, message }` + status;
401 for no session; 403 `MUST_CHANGE_PASSWORD`). Tests first (integration, `src/server/action.int.test.ts`,
`src/server/route.int.test.ts`, using an inline `action(z.object({ n: z.int() }), async ({ n }) => ({ n }))`):
`T-GATE-01` no session → `{ok:false, code:'UNAUTHENTICATED'}`; `T-GATE-02` mustChange user → `MUST_CHANGE_PASSWORD`,
with `allowWhenMustChangePassword` → ok; `T-GATE-03` `{ n: 'x' }` → `VALIDATION` with `fieldErrors.n`;
`T-GATE-04` route: no session → 401 JSON, mustChange → 403, `?q` failing the query schema → 400, ok → 200 with
`cache-control: private, no-store`; `T-GATE-05` handler throwing `redirect('/x')` propagates (not converted).

**S0.8 `session.ts`, base `auth.ts`, `authz.ts`.**
`src/server/auth.ts` (base config; S2.3 adds hooks, rate limit, origins/proxies; start from r2 §2.1):
```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access'
import { th } from '@/i18n/th'
import { db } from './db/client'
import { account, session, user, verification } from './db/schema'

const ac = createAccessControl(defaultStatements)
export const roles = { manager: ac.newRole({ ...adminAc.statements }), worker: ac.newRole({ ...userAc.statements }) }

export const auth = betterAuth({
  appName: 'Team Working OS',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: false },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } }, // FR-103, AC-104
  user: { additionalFields: {
    nickname:           { type: 'string',  required: false, input: false },
    positionId:         { type: 'string',  required: false, input: false },
    mustChangePassword: { type: 'boolean', required: true, defaultValue: true, input: false },
    color:              { type: 'string',  required: false, input: false },
    // deactivatedOn deliberately NOT declared (calendar DATE, BR-04) — r2 §4
  } },
  advanced: { useSecureCookies: process.env.SECURE_COOKIES === 'true' },
  disabledPaths: DISABLED_AUTH_PATHS,               // S0 declares the full static list shown in S2.3; S2.3 verifies it against routes.mjs
  plugins: [
    admin({ ac, roles, defaultRole: 'worker', adminRoles: ['manager'], bannedUserMessage: th.auth.errors.ACCOUNT_DEACTIVATED }),
    nextCookies(),                                  // MUST stay last
  ],
  telemetry: { enabled: false },
})
export type AuthSession = typeof auth.$Infer.Session
```
`src/server/session.ts`:
```ts
import 'server-only'
export interface SessionUser {
  id: string; email: string; name: string; nickname: string | null
  role: 'manager' | 'worker'; positionId: string | null; color: string | null
  mustChangePassword: boolean; sessionId: string; sessionToken: string     // never sent to the client
}
export const getSessionUser: () => Promise<SessionUser | null>   // React cache(); auth.api.getSession({ headers: await headers() }); null when no session or banned
export function requirePageUser(opts?: { allowMustChange?: boolean }): Promise<SessionUser> // redirect('/login') | redirect('/account/password')
export function requireManagerPage(): Promise<SessionUser>       // requirePageUser + (!authz.isManager → notFound())
export function toCurrentUserDTO(u: SessionUser): CurrentUserDTO  // drops session fields; displayName = nickname?.trim() || name
```
(S0 computes `displayName` inline because `src/lib/display-name.ts` is S1's; S2 switches it to `displayName()` from S1.)
`src/server/authz.ts` (bodies are trivial — S0 writes them):
```ts
export type SystemRole = 'manager' | 'worker'
export function narrowRole(role: string | null | undefined): SystemRole        // 'manager' only for exactly 'manager'
export function requireUser(user: SessionUser | null | undefined): asserts user is SessionUser   // UnauthenticatedError
export function isManager(user: Pick<SessionUser, 'role'>): boolean
export function requireManager(user: SessionUser): void                       // ForbiddenError
```
Tests first, `src/server/authz.test.ts` (unit): `T-AZ-01 narrowRole('manager')='manager'; 'MANAGER','admin',null,undefined,'' → 'worker'`;
`T-AZ-02 requireManager(worker)` throws `ForbiddenError` (code `FORBIDDEN`), manager passes; `requireUser(null)` throws `UnauthenticatedError`.
Done-check: `pnpm auth:check` prints "Schema check passed" and exits 0.

**S0.9 Audit (`src/server/audit.ts`, no `server-only`).**
```ts
export type AuditEntity = 'user' | 'position'          // later S0s extend it to exactly X93: M2 client, project, project_member ·
//   M3 task, task_assignment, task_status, task_blocker · M4 page, file · M5 holiday, leave_type, time_off · M6 allocation · M8 milestone
export type AuditAction = 'create' | 'update' | 'delete' | 'restore'
export interface AuditInput { entity: AuditEntity; entityId: string; action: AuditAction; projectId?: string | null;
  summary: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null }
export async function log(tx: DbOrTx, actor: { id: string } | null, input: AuditInput): Promise<void>
const FORBIDDEN_KEYS = ['password', 'passwordHash', 'hash', 'token', 'sessionToken']   // log() throws if before/after contain any (defence in depth)
```
Usage everywhere: `import * as audit from '@/server/audit'` → `await audit.log(tx, actor, { … })`. Tests first
(`src/server/audit.int.test.ts`): `T-AUD-01` writes one row with `actor_id`, `entity`, `summary`; `actor=null` →
`actor_id` NULL; `T-AUD-02` `after: { password: 'x' }` throws before inserting.

**S0.10 Zod schemas (shared by forms and actions; full implementations + unit tests here).**
`src/lib/z.ts`: `import { z } from 'zod'; z.config(z.locales.th()); export { z }`. All schema files import `z`
from `@/lib/z` and messages from `th`.
`src/lib/schemas/account.ts`:
```ts
export const PASSWORD_MIN = 8, PASSWORD_MAX = 128
export type PasswordIssue = 'TOO_SHORT' | 'TOO_LONG' | 'EQUALS_EMAIL' | 'SAME_AS_CURRENT'
/** X60: length 8–128 (code points); trimmed+lowercased password ≠ email and ≠ its local part (skipped when email is '');
 *  ≠ currentPassword when given (self-change only). Returns issues in this order, deduplicated. */
export function passwordPolicy(password: string, ctx: { email: string; currentPassword?: string }): PasswordIssue[]
/** Adds one `.refine(fn, { error, path })` per PasswordIssue — the verified Zod 4 API (r4 §29); never superRefine/check. */
export function refinePassword<T extends z.ZodType>(schema: T, pick: (v: z.output<T>) => { password: string; email: string; currentPassword?: string },
  path: string): T
export const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email({ error: th.employees.emailInvalid }))
export const loginInput = z.object({
  email: emailField, password: z.string().min(1, { error: th.auth.passwordRequired }).max(PASSWORD_MAX),
  next: z.string().max(2000).optional(),
})
export const changePasswordInput = refinePassword(z.object({
    currentPassword: z.string().min(1, { error: th.account.policy.REQUIRED }).max(PASSWORD_MAX),
    newPassword: z.string().max(PASSWORD_MAX), confirmPassword: z.string().max(PASSWORD_MAX), next: z.string().max(2000).optional(),
  }).refine((v) => v.newPassword === v.confirmPassword, { error: th.account.policy.MISMATCH, path: ['confirmPassword'] }),
  (v) => ({ password: v.newPassword, email: '', currentPassword: v.currentPassword }), 'newPassword')
// EQUALS_EMAIL for self-change is checked in the action with user.email (the form also calls passwordPolicy with the email)
```
`src/lib/schemas/employees.ts`:
```ts
export const FRACTION_CD = [25, 50, 75, 100] as const
export const scheduleInput = z.array(z.object({ weekday: z.int().min(1).max(7),
    fractionCd: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]) }))
  .min(1, { error: th.employees.schedule.atLeastOneDay }).max(7)
  .refine((d) => new Set(d.map((x) => x.weekday)).size === d.length, { error: th.errors.VALIDATION })
export const DEFAULT_SCHEDULE = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, fractionCd: 100 as const }))
const profile = {
  name: z.string().trim().min(1, { error: th.employees.nameRequired }).max(200),
  nickname: z.string().trim().max(50).optional(),         // '' → null in the service
  email: emailField,
  positionId: z.uuid().nullable(),
  role: z.enum(['manager', 'worker']),
  color: z.enum(USER_COLORS).nullable().optional(),       // null/undefined → least-used colour (create) / unchanged (update)
}
export const createEmployeeInput = refinePassword(z.object({ ...profile,
  password: z.string().max(128), mustChangePassword: z.boolean().default(true), schedule: scheduleInput.default(DEFAULT_SCHEDULE),
}), (v) => ({ password: v.password, email: v.email }), 'password')
export const updateEmployeeInput = z.object({ userId: z.uuid(), ...profile, schedule: scheduleInput })
export type CreateEmployeeData = z.output<typeof createEmployeeInput>
export type UpdateEmployeeData = z.output<typeof updateEmployeeInput>
export const userIdInput = z.object({ userId: z.uuid() })
export const resetPasswordInput = z.object({ userId: z.uuid(), password: z.string().max(128) })   // policy vs target email in the action
```
`src/lib/schemas/positions.ts`:
```ts
export const positionName = z.string().trim().min(1, { error: th.positions.nameRequired }).max(100)
export const POSITION_KEY = /^[A-Za-z][0-9A-Za-z]{1,200}$/
export const createPositionInput = z.object({ name: positionName })
export const renamePositionInput = z.object({ id: z.uuid(), name: positionName })
export const movePositionInput = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) })
export const deletePositionInput = z.object({ id: z.uuid() })
export const restorePositionInput = z.object({ id: z.uuid(), name: positionName, position: z.string().regex(POSITION_KEY) })
```
`src/lib/schemas/preferences.ts`:
```ts
export const THEMES = ['light', 'dark', 'system'] as const
export const preferenceInput = z.discriminatedUnion('key', [
  z.object({ key: z.literal('theme'), value: z.enum(THEMES) }),
  z.object({ key: z.literal('sidebar.collapsed'), value: z.boolean() }),
])
export type PreferenceInput = z.infer<typeof preferenceInput>
export const preferencesSchema = z.object({ theme: z.enum(THEMES).catch('system'), 'sidebar.collapsed': z.boolean().catch(false) })
export type Preferences = z.infer<typeof preferencesSchema>
export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', 'sidebar.collapsed': false }
```
`src/lib/user-colors.ts` (S0 creates the constant; S1 adds functions): `export const USER_COLORS = ['#2F5597', '#7C3AED',
'#B91C1C', '#C2410C', '#A16207', '#15803D', '#0F766E', '#0369A1', '#4338CA', '#BE185D', '#475569', '#854D0E'] as const;
export type UserColor = (typeof USER_COLORS)[number]`.
Tests first (`unit`): `src/lib/schemas/account.test.ts` —
`U-SCH-01 passwordPolicy('short', {email:'a@x.co'})=['TOO_SHORT']`; `U-SCH-02 'x'.repeat(129)` → `['TOO_LONG']`;
`U-SCH-03 ' Cindy@Example.com '` with email `'cindy@example.com'` → `['EQUALS_EMAIL']`;
`U-SCH-04 'Cindy12345'` with email `'cindy12345@example.com'` (local part) → `['EQUALS_EMAIL']`; email `''` → no email check;
`U-SCH-05 'demo1234'` vs `cindy@example.com` → `[]`;
`U-SCH-06 same as current` → `['SAME_AS_CURRENT']`; `U-SCH-07 changePasswordInput confirm mismatch` → issue on `confirmPassword`;
`U-SCH-08 loginInput.parse({ email: '  Cindy@Example.COM ', password: 'x' }).email === 'cindy@example.com'`;
`src/lib/schemas/employees.test.ts` — `U-SCH-09` schedule `[]` → error `atLeastOneDay`; duplicate weekday → error;
`fractionCd: 30` → error; omitted schedule → `DEFAULT_SCHEDULE`; `mustChangePassword` omitted → `true` (FR-203);
`positionId: '11111111-1111-1111-1111-111111111111'` → error (strict UUID); `src/lib/schemas/preferences.test.ts` —
`U-SCH-10 preferencesSchema.parse({ theme: 'neon', x: 1 })` → `{ theme: 'system', 'sidebar.collapsed': false }`;
`preferenceInput` rejects `{ key: 'grid.unit', value: 'DAYS' }` (not an M1 key).

**S0.11 DTOs (`src/lib/contracts/users.ts`, isomorphic, type-only).**
```ts
import type { Cd, ISODate, Weekday } from '@/domain/types'
export interface CurrentUserDTO { id: string; email: string; name: string; nickname: string | null; displayName: string; role: 'manager' | 'worker'; color: string | null }
export interface ScheduleDayDTO { weekday: Weekday; fractionCd: Cd }
export interface EmployeeRow { id: string; name: string; nickname: string | null; displayName: string; email: string
  role: 'manager' | 'worker'; positionId: string | null; positionName: string | null; color: string | null
  active: boolean; deactivatedOn: ISODate | null; mustChangePassword: boolean; schedule: ScheduleDayDTO[] }
export interface PositionRow { id: string; name: string; position: string; userCount: number }
export interface AssignableUser { id: string; name: string; nickname: string | null; color: string | null; positionName: string | null }
export interface DeletedPosition { id: string; name: string; position: string }
```
`src/domain/types.ts` (type-only, M1-D24): `export type ISODate = string; export type Cd = number; export type Weekday = 1|2|3|4|5|6|7;
export type Schedule = Partial<Record<Weekday, Cd>>; export type FractionCd = 25 | 50 | 75 | 100`.

**S0.12 Action stubs (`'use server'` files; S2 replaces the bodies, signatures are frozen).** Every body begins with
the authz call so the matrix 403 rows pass from G0 on.
```ts
// src/server/actions/auth.ts
export const login = publicAction(loginInput, async (_i): Promise<{ redirectTo: string }> => { throw notImplemented('S2.6') })
export const logout = action(z.object({}), async (_i, { user }): Promise<{ redirectTo: string }> => { authz.requireUser(user); throw notImplemented('S2.6') }, { allowWhenMustChangePassword: true })
export const changeOwnPassword = action(changePasswordInput, async (_i, { user }): Promise<{ redirectTo: string }> => { authz.requireUser(user); throw notImplemented('S2.7') }, { allowWhenMustChangePassword: true })
export const signOutEverywhere = action(z.object({}), async (_i, { user }): Promise<{ redirectTo: string }> => { authz.requireUser(user); throw notImplemented('S2.7') }, { allowWhenMustChangePassword: true })
// src/server/actions/employees.ts  — each: authz.requireManager(user) first
export const createEmployee: (i: z.input<typeof createEmployeeInput>) => Promise<ActionResult<{ userId: string }>>
export const updateEmployee: (i: z.input<typeof updateEmployeeInput>) => Promise<ActionResult<Ok>>
export const deactivateEmployee: (i: z.input<typeof userIdInput>) => Promise<ActionResult<Ok>>
export const reactivateEmployee: (i: z.input<typeof userIdInput>) => Promise<ActionResult<Ok>>
export const resetEmployeePassword: (i: z.input<typeof resetPasswordInput>) => Promise<ActionResult<Ok>>
// src/server/actions/positions.ts — each: authz.requireManager(user) first
export const createPosition: (i: z.input<typeof createPositionInput>) => Promise<ActionResult<{ id: string }>>
export const renamePosition: (i: z.input<typeof renamePositionInput>) => Promise<ActionResult<Ok>>
export const movePosition: (i: z.input<typeof movePositionInput>) => Promise<ActionResult<Ok>>
export const deletePosition: (i: z.input<typeof deletePositionInput>) => Promise<ActionResult<{ deleted: DeletedPosition }>>
export const restorePosition: (i: z.input<typeof restorePositionInput>) => Promise<ActionResult<Ok>>
// src/server/actions/preferences.ts — authz.requireUser(user) first; not audited
export const setPreference: (i: PreferenceInput) => Promise<ActionResult<Ok>>
```
(`notImplemented(step)` = `new Error('NOT_IMPLEMENTED: ' + step)`, exported from `errors.ts`. `type Ok = Record<string, never>` is
exported from `src/lib/action-result.ts` for actions that return nothing — `{}` as a type is banned by `@typescript-eslint/no-empty-object-type`.)

Service and script stubs that S3 pages and S4 tests import while S2 is still running (exact signatures from S2.7–S2.12;
bodies `throw notImplemented(...)`): `src/server/services/employees.ts` (`listEmployees`, `createEmployee`,
`updateEmployee`, `deactivateEmployee`, `reactivateEmployee`, `resetEmployeePassword`), `services/positions.ts`
(`listPositions`, `createPosition`, `renamePosition`, `movePosition`, `deletePosition`, `restorePosition`),
`services/preferences.ts` (`getPreferences`, `setPreference`), `services/users.ts` (`listAssignableUsers`),
`services/account.ts` (`verifyOwnPassword`, `changeOwnPassword`, `signOutEverywhere`), `scripts/lib/bootstrap.ts`
(`DEFAULT_POSITIONS`, `BootstrapResult`, `runBootstrap`). Data types for service inputs:
`CreateEmployeeData = z.output<typeof createEmployeeInput>`, `UpdateEmployeeData = z.output<typeof updateEmployeeInput>`
(exported from `src/lib/schemas/employees.ts`). Barrel `src/server/services/index.ts`:
`export * as account from './account'; export * as employees from './employees'; export * as positions from './positions';
export * as preferences from './preferences'; export * as users from './users'` — actions use `services.<area>.<fn>`. **Query keys:** none in M1 (no TanStack-driven view; `src/lib/query-keys.ts` arrives in M2).

**S0.13 i18n (`src/i18n/th.ts`; keep M0's `common`/`nav`; add the namespaces and keys below verbatim).** Shared
constants at the top avoid duplicated strings. Later streams add keys only inside their own namespace (§4).
```ts
const MSG_LOCKED = 'เข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'
const MSG_DEACTIVATED = 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้จัดการ'
const MSG_BAD_LOGIN = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
export const th = {
  common: { /* M0 keys + add if missing: */ save: 'บันทึก', cancel: 'ยกเลิก', close: 'ปิด', edit: 'แก้ไข', delete: 'ลบ', add: 'เพิ่ม',
    search: 'ค้นหา', all: 'ทั้งหมด', copy: 'คัดลอก', copied: 'คัดลอกแล้ว', saving: 'กำลังบันทึก…', moveUp: 'เลื่อนขึ้น',
    moveDown: 'เลื่อนลง', actions: 'การดำเนินการ', back: 'กลับ', backHome: 'กลับหน้าหลัก' },
  nav: { /* M0 keys + */ settings: 'ตั้งค่า', employees: 'พนักงาน', positions: 'ตำแหน่ง', account: 'บัญชีของฉัน',
    logout: 'ออกจากระบบ', userMenu: 'เมนูผู้ใช้' },
  errors: { UNAUTHENTICATED: 'กรุณาเข้าสู่ระบบ', MUST_CHANGE_PASSWORD: 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน', NOT_FOUND: 'ไม่พบข้อมูล',
    FORBIDDEN: 'คุณไม่มีสิทธิ์ทำรายการนี้', VALIDATION: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
    CONFLICT: 'ข้อมูลซ้ำหรือขัดแย้งกับข้อมูลที่มีอยู่', VERSION_CONFLICT: 'มีการแก้ไขใหม่กว่า กรุณาโหลดใหม่',
    OVERLAP: 'ช่วงวันที่ทับกับรายการที่มีอยู่', LAST_MANAGER: 'ต้องมีผู้จัดการที่ใช้งานอยู่อย่างน้อย 1 คน',
    SELF_DEACTIVATE: 'ปิดใช้งานบัญชีของตัวเองไม่ได้', IN_USE: 'ยังมีข้อมูลที่ใช้รายการนี้อยู่', LOGIN_LOCKED: MSG_LOCKED,
    INVALID_CREDENTIALS: MSG_BAD_LOGIN, ACCOUNT_DEACTIVATED: MSG_DEACTIVATED, INVALID_PASSWORD: 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
    INTERNAL: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' },
  auth: { loginTitle: 'เข้าสู่ระบบ', email: 'อีเมล', password: 'รหัสผ่าน', submit: 'เข้าสู่ระบบ', submitting: 'กำลังเข้าสู่ระบบ…',
    passwordRequired: 'กรุณากรอกรหัสผ่าน', noSignUp: 'ยังไม่มีบัญชี? ติดต่อผู้จัดการเพื่อสร้างบัญชีให้',
    errors: { INVALID_CREDENTIALS: MSG_BAD_LOGIN, ACCOUNT_DEACTIVATED: MSG_DEACTIVATED, LOGIN_LOCKED: MSG_LOCKED } },
  account: { title: 'บัญชีของฉัน', changePasswordTitle: 'เปลี่ยนรหัสผ่าน', mustChangeBanner: 'กรุณาตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน',
    currentPassword: 'รหัสผ่านปัจจุบัน', newPassword: 'รหัสผ่านใหม่', confirmPassword: 'ยืนยันรหัสผ่านใหม่',
    policyHint: 'อย่างน้อย 8 ตัวอักษร และไม่ซ้ำกับอีเมล', submit: 'เปลี่ยนรหัสผ่าน', changed: 'เปลี่ยนรหัสผ่านแล้ว',
    signOutEverywhere: 'ออกจากระบบทุกอุปกรณ์', signOutEverywhereHint: 'ออกจากระบบในทุกเบราว์เซอร์และอุปกรณ์ รวมถึงเครื่องนี้',
    policy: { REQUIRED: 'กรุณากรอกรหัสผ่าน', TOO_SHORT: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', TOO_LONG: 'รหัสผ่านยาวได้ไม่เกิน 128 ตัวอักษร',
      EQUALS_EMAIL: 'รหัสผ่านต้องไม่ซ้ำกับอีเมล', SAME_AS_CURRENT: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม',
      MISMATCH: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' } },
  employees: { title: 'พนักงาน', add: 'เพิ่มพนักงาน', createTitle: 'เพิ่มพนักงาน', editTitle: 'แก้ไขข้อมูลพนักงาน',
    fields: { name: 'ชื่อ-นามสกุล', nickname: 'ชื่อเล่น', email: 'อีเมล', position: 'ตำแหน่ง', role: 'บทบาทระบบ',
      initialPassword: 'รหัสผ่านเริ่มต้น', mustChange: 'บังคับเปลี่ยนรหัสเมื่อเข้าครั้งแรก', color: 'สี', schedule: 'ตารางวันทำงาน',
      status: 'สถานะ' },
    roles: { manager: 'ผู้จัดการ', worker: 'พนักงาน' },
    status: { active: 'ใช้งาน', deactivated: 'ปิดใช้งาน' },
    generatePassword: 'สุ่มรหัส', copyPassword: 'คัดลอกรหัส', passwordShownOnce: 'รหัสผ่านนี้จะแสดงครั้งเดียว คัดลอกเก็บไว้ก่อนปิด',
    createdTitle: 'สร้างบัญชีแล้ว', createdHint: (email: string) => `ส่งอีเมลและรหัสผ่านนี้ให้เจ้าของบัญชี (${email})`,
    filters: { search: 'ค้นหาชื่อหรือชื่อเล่น', position: 'ตำแหน่ง', allPositions: 'ทุกตำแหน่ง', noPosition: 'ไม่ระบุตำแหน่ง',
      status: 'สถานะ', allStatuses: 'ทุกสถานะ' },
    actions: { edit: 'แก้ไข', resetPassword: 'รีเซ็ตรหัสผ่าน', deactivate: 'ปิดใช้งาน', reactivate: 'เปิดใช้งาน' },
    resetTitle: (name: string) => `รีเซ็ตรหัสผ่าน — ${name}`,
    resetHint: 'ทุก session ของพนักงานคนนี้จะหลุดทันที และต้องเปลี่ยนรหัสเมื่อเข้าระบบครั้งถัดไป',
    created: (name: string) => `เพิ่ม ${name} แล้ว`, updated: 'บันทึกข้อมูลพนักงานแล้ว',
    deactivated: (name: string) => `ปิดใช้งาน ${name} แล้ว`, reactivated: (name: string) => `เปิดใช้งาน ${name} แล้ว`,
    passwordReset: (name: string) => `รีเซ็ตรหัสผ่านของ ${name} แล้ว`,
    emailTaken: 'อีเมลนี้ถูกใช้แล้ว', emailInvalid: 'รูปแบบอีเมลไม่ถูกต้อง', nameRequired: 'กรุณากรอกชื่อ-นามสกุล',
    you: 'คุณ', mustChangeBadge: 'รอเปลี่ยนรหัส', empty: 'ยังไม่มีพนักงาน', noMatch: 'ไม่พบพนักงานที่ตรงกับเงื่อนไข',
    colorAuto: 'อัตโนมัติ', colorOption: (n: number) => `สีที่ ${n}`,
    schedule: { weekdayShort: { 1: 'จ', 2: 'อ', 3: 'พ', 4: 'พฤ', 5: 'ศ', 6: 'ส', 7: 'อา' },
      weekdayLong: { 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์', 7: 'อาทิตย์' },
      works: 'ทำงาน', fraction: 'สัดส่วนต่อวัน', atLeastOneDay: 'ต้องมีวันทำงานอย่างน้อย 1 วัน',
      fractions: { 25: '0.25 วัน', 50: '0.50 วัน', 75: '0.75 วัน', 100: 'เต็มวัน (1.00)' } } },
  positions: { title: 'ตำแหน่ง', add: 'เพิ่มตำแหน่ง', namePlaceholder: 'ชื่อตำแหน่งใหม่', rename: 'เปลี่ยนชื่อ',
    nameRequired: 'กรุณากรอกชื่อตำแหน่ง', nameTaken: 'มีตำแหน่งชื่อนี้แล้ว', userCount: (n: number) => `${n} คน`,
    deleted: (name: string) => `ลบตำแหน่ง "${name}" แล้ว`,
    inUse: (n: number) => `ลบไม่ได้ — มีพนักงานใช้ตำแหน่งนี้อยู่ ${n} คน ต้องย้ายพนักงานไปตำแหน่งอื่นก่อน`,
    restoreConflict: 'กู้คืนไม่ได้ เพราะมีตำแหน่งชื่อนี้แล้ว', empty: 'ยังไม่มีตำแหน่ง' },
  users: { deactivatedSuffix: '(ปิดใช้งาน)', deactivated: 'ปิดใช้งาน', noPosition: 'ไม่ระบุตำแหน่ง',
    tooltip: (fullName: string, position: string | null) => (position ? `${fullName} · ${position}` : fullName) },
  prefs: { theme: 'ธีม', themes: { light: 'สว่าง', dark: 'มืด', system: 'ตามระบบ' }, saveFailed: 'บันทึกการตั้งค่าไม่สำเร็จ' },
  undo: { undo: 'เลิกทำ', redo: 'ทำซ้ำ', failed: 'เลิกทำไม่สำเร็จ', redoFailed: 'ทำซ้ำไม่สำเร็จ' },
  audit: { employeeCreated: (n: string) => `สร้างพนักงาน ${n}`, employeeUpdated: (n: string) => `แก้ไขข้อมูลพนักงาน ${n}`,
    employeeDeactivated: (n: string) => `ปิดใช้งานพนักงาน ${n}`, employeeReactivated: (n: string) => `เปิดใช้งานพนักงาน ${n}`,
    employeePasswordReset: (n: string) => `รีเซ็ตรหัสผ่านของ ${n}`, passwordChanged: (n: string) => `${n} เปลี่ยนรหัสผ่าน`,
    signedOutEverywhere: (n: string) => `${n} ออกจากระบบทุกอุปกรณ์`, positionCreated: (n: string) => `สร้างตำแหน่ง ${n}`,
    positionRenamed: (from: string, to: string) => `เปลี่ยนชื่อตำแหน่ง ${from} เป็น ${to}`,
    positionMoved: (n: string) => `เลื่อนลำดับตำแหน่ง ${n}`, positionDeleted: (n: string) => `ลบตำแหน่ง ${n}`,
    positionRestored: (n: string) => `กู้คืนตำแหน่ง ${n}` },
} as const
```
Keep `as const` + `export type Th = typeof th`. Unit test `src/i18n/th.test.ts` › `U-I18N-01 every ErrorCode has a
non-empty th.errors entry` (iterate `Object.keys(ERROR_STATUS)`).

**S0.14 Test harness.**
- `vitest.config.ts`: ensure project `integration` includes `src/**/*.int.test.ts`, `scripts/**/*.int.test.ts`,
  `tests/**/*.int.test.ts`; `unit` includes `src/**/*.test.ts` excluding `*.int.test.ts`; `ui` includes `src/**/*.test.tsx`.
- `tests/setup/db-worker.ts` (extend M0's; top-level, before any app import): set `process.env.BETTER_AUTH_SECRET ??=
  'test-secret-0123456789abcdef0123456789'`, `BETTER_AUTH_URL ??= 'http://localhost:3100'`, `SECURE_COOKIES ??= 'false'`;
  mocks (plain async functions — never `vi.fn` implementations that `restoreMocks` could reset):
  ```ts
  vi.mock('next/cache', () => testCache)                       // { refresh: vi.fn(), updateTag: vi.fn(), revalidatePath: vi.fn(), revalidateTag: vi.fn() }
  vi.mock('next/headers', () => ({ headers: async () => currentTestHeaders(), cookies: async () => testCookieJar() }))
  vi.mock('@/server/session', async (orig) => ({ ...(await orig<typeof import('@/server/session')>()),
    getSessionUser: async () => currentTestUser(),
    requirePageUser: async () => { const u = currentTestUser(); if (!u) throw new Error('TEST_REDIRECT:/login'); return u } }))
  ```
  `beforeEach`: truncate all app tables (M0's `tests/helpers/db.ts`; it must list tables dynamically from
  `pg_tables where schemaname='public'`), `asNobody()`, `resetTestRequest()`, `testCache.refresh.mockClear()`.
- `tests/helpers/request.ts`: `currentTestHeaders()`, `setTestHeaders(init: HeadersInit)` (default
  `{ 'x-forwarded-for': '127.0.0.1', 'user-agent': 'vitest' }`), `testCookieJar()` (Map-backed `get/getAll/has/set/delete`),
  `getSetCookies(): Map<string,string>`, `resetTestRequest()`, `export const testCache`.
- `tests/helpers/factories.ts` (direct schema inserts, real v4 UUIDs, M1-D19):
  ```ts
  export const TEST_PASSWORD = 'Test-pass-1234'                 // hashed once per worker (lazy cached hashPassword)
  export interface TestUser { id: string; email: string; name: string; nickname: string | null; role: 'manager' | 'worker'
    positionId: string | null; color: string | null; mustChangePassword: boolean; password: string; sessionToken: string }
  export async function makeUser(o?: { role?: 'manager' | 'worker'; nickname?: string; name?: string; email?: string
    positionName?: string; schedule?: Array<{ weekday: number; fraction: string }>; mustChangePassword?: boolean
    deactivated?: { on: string } }): Promise<TestUser>       // user + credential account + schedule (default Mon–Fri '1.00') + a session row (token)
  export async function makePosition(name: string, position?: string): Promise<{ id: string; name: string; position: string }>
  export async function makeSession(userId: string, o?: { token?: string; expiresAt?: Date }): Promise<{ id: string; token: string }>
  ```
- `tests/helpers/world.ts`: `export interface World { manager: TestUser; lead: TestUser; member: TestUser; outsider: TestUser }`;
  `createWorld(opts?: { with?: readonly WorldPart[] })` → manager (role manager, nickname 'Manager'), lead/member/outsider (workers).
  M2 adds projects P/Q/A (the `lead`/`member` names already match PLAN §4.3). The four role users stay **top-level**
  (`w.manager`, `w.lead`, `w.member`, `w.outsider`); extra users added by later parts live under `w.users.<name>`
  (M3 `former`, M5 `coworker`/`pOnly`). The part list is pinned now (PLAN §4.3, X91) — type-only, each part's builder
  is added by its milestone:
  ```ts
  export type WorldPart = 'tasks' | 'pages' | 'files' | 'timeOff' | 'allocations' | 'dayAllocations' | 'milestones'
  //  M3 tasks · M4 pages, files · M5 timeOff · M6 allocations · M7 dayAllocations · M8 milestones
  /** Implications; the owning milestone adds its entry (M6 allocations → tasks + timeOff, M7 dayAllocations → allocations,
   *  M8 milestones → tasks + allocations). */
  export const WORLD_PART_IMPLIES: Partial<Record<WorldPart, readonly WorldPart[]>> = {}
  export function expandParts(parts: readonly WorldPart[]): Set<WorldPart>   // transitive closure over WORLD_PART_IMPLIES
  ```
  `createWorld` builds the requested parts in a fixed order (tasks, pages, files, timeOff, allocations, dayAllocations,
  milestones) and throws `Error('world part <p> has no builder yet')` for a part whose milestone has not landed.
  Test (`tests/helpers/world.int.test.ts`, S0): `expandParts([])` is empty; `createWorld()` gives 4 users with the roles above.
- `tests/helpers/as-user.ts`: `asUser(u: TestUser, o?: { mustChangePassword?: boolean })`, `asNobody()`,
  `currentTestUser(): SessionUser | null` (stored on `globalThis.__testSessionUser`).
- `tests/helpers/outcome.ts`: `outcomeOf(r: ActionResult<object> | Response): Outcome` — ok/2xx → `'allow'`; an
  `ActionError` maps through `ERROR_STATUS[code]` and a `Response` through its status: 404 → `'404'`
  (`NOT_FOUND`); 403 → `'403'` (`FORBIDDEN`, `MUST_CHANGE_PASSWORD`, `ACCOUNT_DEACTIVATED`); 400 → `'400'` (`VALIDATION`,
  `INVALID_PASSWORD`); 401 → `'401'` (`UNAUTHENTICATED`, `INVALID_CREDENTIALS`); 409 → `'409'` (`CONFLICT`, `LAST_MANAGER`,
  `SELF_DEACTIVATE`, `IN_USE`, `VERSION_CONFLICT`, `OVERLAP`); 413 → `'413'`; 415 → `'415'`; 429 → `'429'` (`LOGIN_LOCKED`).
  Because the mapping goes through `ERROR_STATUS`, codes added later map without editing this file (M4 `TOO_LARGE` 413,
  `UNSUPPORTED_TYPE` 415; M7 `NEEDS_CHOICE` 409). Any other status (500 / `INTERNAL`, 3xx) throws — an
  `INTERNAL` result is a test failure, never an expectation.
- `tests/authz/types.ts`:
  ```ts
  export type Role = 'M' | 'L' | 'Me' | 'W'
  export type Outcome = 'allow' | '404' | '403' | '400' | '401' | '409' | '413' | '415' | '429'   // X91
  export interface AuthzRow<C = unknown> { id: string; spec: string
    /** action rows: the exported action name ('createEmployee'); route rows: '<METHOD> /api/<path>' ('POST /api/files',
     *  'GET /api/sidebar'); loader rows: 'services.<area>.<fn>'. M1's T-META-01 checks action names only; M2's AZ-2 adds routes. */
    action: string
    mutates: boolean
    /** required for mutating rows unless explicitly false (X44 exceptions). projectId: omitted → the audit row's
     *  project_id must be null; a function → must equal its result; 'any' → not checked (rows that create a project). */
    audit?: { entity: AuditEntity; projectId?: ((w: World, ctx: C) => string | null) | 'any' } | false
    allowMustChange?: boolean                           // action allowed while mustChangePassword
    with?: readonly WorldPart[]                         // world parts the row needs (X91); default []
    expect: Record<Role, Outcome>
    setup?: (w: World, actor: TestUser) => Promise<C>
    run: (w: World, ctx: C, actor: TestUser) => Promise<ActionResult<object> | Response> }
  ```
- `tests/authz/rows/index.ts`: `export const rows: AuthzRow[] = [...employees, ...positions, ...account, ...preferences, ...authEndpoints]`
  (S0 creates empty arrays in `rows/{employees,positions,account,preferences,auth-endpoints}.ts`; S4 fills them). This
  file is the single registry: every later milestone's test stream adds an `import` + spread for each rows file it
  creates (X91, C72/C98); the matrix and M11's audit sweep read only this index.
- `tests/authz/matrix.int.test.ts`:
  ```ts
  const USER_OF: Record<Role, keyof World> = { M: 'manager', L: 'lead', Me: 'member', W: 'outsider' }
  it('rows have unique ids and every mutating row declares audit', () => { … })     // keeps the file non-empty at G0
  describe.each(rows)('$id · $action', (row) => {
    it.each(['M', 'L', 'Me', 'W'] as const)('%s', async (role) => {
      const w = await createWorld({ with: row.with ?? [] }); const actor = w[USER_OF[role]]
      const ctx = row.setup ? await row.setup(w, actor) : undefined
      if (!row.id.startsWith('BA-')) asUser(actor)                              // BA-* rows authenticate with real cookies
      const before = await auditCount()
      const outcome = outcomeOf(await row.run(w, ctx as never, actor))
      expect(outcome).toBe(row.expect[role])
      if (row.mutates && outcome === 'allow' && row.audit !== false) {
        const added = await auditRowsAfter(before)
        expect(added).toHaveLength(1)
        const p = row.audit!.projectId
        expect(added[0]).toMatchObject({ entity: row.audit!.entity, actorId: actor.id,
          ...(p === 'any' ? {} : { projectId: p ? p(w, ctx as never) : null }) })
      }
    })
    it.skipIf(row.id.startsWith('BA-'))('nobody → 401', async () => { /* createWorld, setup, asNobody, run → '401' */ })
    it.skipIf(row.id.startsWith('BA-'))('mustChangePassword → 403 unless allowed', async () => {
      /* createWorld, setup(w, w.manager), asUser(w.manager, { mustChangePassword: true }), run(w, ctx, w.manager);
         expected = row.allowMustChange ? row.expect.M : '403' */ })
  })
  ```
  Done-check: `pnpm vitest run --project integration tests/authz` green with zero rows.

**S0.15 Script helpers.** `scripts/lib/db.ts` (full; used by scripts and the Playwright reset; no `server-only`):
```ts
export function createScriptDb(url = process.env.DATABASE_URL): { db: Db; close: () => Promise<void> }  // postgres(url, { max: 1, onnotice: () => {} })
export async function truncateAll(tx: DbOrTx): Promise<void>   // every table in schema public → TRUNCATE … RESTART IDENTITY CASCADE (drizzle schema untouched)
export function assertNotProduction(): void                     // throws when NODE_ENV === 'production'
```
`scripts/lib/fixtures.ts` (stub; S2.13 implements): `export type GoldenStage = 'users'`;
`export async function seedGolden(db: DbOrTx, opts?: { upTo?: GoldenStage }): Promise<void>`;
`export type FixtureId = never` (placeholder for `resetDb`'s first parameter; M5 widens it to `'F2' | 'F3' | 'F4'` and adds `applyFixture`).

**S0.16 G0.** `pnpm install` (lockfile), `pnpm db:migrate`, `pnpm db:generate` → "No schema changes",
`pnpm exec drizzle-kit check`, `pnpm auth:check`, `pnpm check` green. S0 report: m0Artifacts, deps added, migration
file name, any Decision rows.

### 5.S1 — Domain: dates, units subset, pure helpers  (domain-engineer · src/domain/**, src/lib/{random-password,display-name,safe-next,user-colors,keys}.ts + tests)

Test-first for every file: write the test file, run it red, implement, run green. No IO, no React, no Next.
`src/domain/**` may not use `Date` except `dates.ts#todayBangkok` (ESLint). Coverage of `src/domain/**` ≥ 95 %.

**S1.1 Types.** Keep S0's `src/domain/types.ts`; add only what M1 needs (nothing else — `Certainty`, `PeriodKey`, …
arrive with their milestones).

**S1.2 `src/domain/dates.test.ts` first** (plain `fc.assert`; Date allowed in test files):
| Test | Input → expected |
|---|---|
| U-DATE-01 weekStart every weekday | `'2026-09-28'..'2026-10-04'` → all `'2026-09-28'`; `'2026-10-05'` → `'2026-10-05'` |
| U-DATE-02 year boundary (§11.1) | `weekStart('2027-01-01')` = `weekStart('2027-01-03')` = `'2026-12-28'`; `addDays('2026-12-28', 7)` = `'2027-01-04'`; `weekStart('2027-01-04')` = `'2027-01-04'` |
| U-DATE-03 todayBangkok 23:30 UTC (§11.1) | `vi.useFakeTimers(); vi.setSystemTime('2026-09-29T23:30:00Z')` → `todayBangkok()` = `'2026-09-30'` |
| U-DATE-04 todayBangkok edges | `todayBangkok(new Date('2026-09-30T16:59:59Z'))` = `'2026-09-30'`; `'2026-09-30T17:00:00Z'` → `'2026-10-01'`; `'2026-12-31T17:00:00Z'` → `'2027-01-01'` |
| U-DATE-05 isoWeekday | `'2026-09-28'`→1, `'2026-09-30'`→3, `'2026-10-04'`→7, `'2027-01-01'`→5 |
| U-DATE-06 isISODate | `'2026-09-30'`, `'2028-02-29'`, `'2000-02-29'` true; `'2026-02-30'`, `'2026-9-30'`, `'2100-02-29'`, `'2026-13-01'`, `''`, `'2026-09-30T00:00'` false |
| U-DATE-07 addDays / leap | `addDays('2028-02-28', 1)`=`'2028-02-29'`; `addDays('2026-02-28', 1)`=`'2026-03-01'`; `addDays('2026-03-01', -1)`=`'2026-02-28'`; `addDays('2026-09-30', 0)` unchanged |
| U-DATE-08 addWeeks / diffDays | `addWeeks('2026-09-28', 2)`=`'2026-10-12'`; `diffDays('2026-09-28','2026-10-05')`=7; `diffDays('2026-10-05','2026-09-28')`=-7 |
| U-DATE-09 daysOfWeek | `daysOfWeek('2026-12-28')` = `['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']`; `daysOfWeek('2026-09-30')` starts `'2026-09-28'` (M1-D18) |
| U-DATE-10 weekRange (M1-D18) | `('2026-09-28','2026-10-19')` → `['2026-09-28','2026-10-05','2026-10-12']`; `('2026-09-30','2026-10-19')` → `['2026-10-05','2026-10-12']`; `('2026-10-19','2026-10-19')` → `[]`; `('2026-12-21','2027-01-11')` → `['2026-12-21','2026-12-28','2027-01-04']` |
| U-DATE-11 eachDay | `eachDay('2026-12-30','2027-01-02')` → 4 dates; `eachDay(a, a)` → `[a]`; `eachDay('2026-10-02','2026-10-01')` → `[]` |
| U-DATE-12 compare/min/max | `compareISO('2026-09-30','2026-10-01')` = -1, equal → 0; `minISO`, `maxISO` pick correctly |
| U-DATE-13 epoch days | `toEpochDay('1970-01-01')`=0; `toEpochDay('2026-09-30')`=20726; property: `toEpochDay(fromEpochDay(n)) === n` for n ∈ [-200000, 200000] |
| U-DATE-14 properties | ∀ n ∈ [0, 36500]: `d = addDays('2000-01-01', n)` → `isoWeekday(weekStart(d)) === 1`, `diffDays(weekStart(d), d) ∈ [0,6]`, `addDays(addDays(d, a), b) === addDays(d, a + b)`; agrees with a `Date.UTC` oracle written inside the test |
| U-DATE-15 invalid input | `addDays('2026-02-30', 1)` and `weekStart('x')` throw `RangeError` |

**S1.3 `src/domain/dates.ts`** — integer epoch-day arithmetic (Howard Hinnant days-from-civil / civil-from-days); the
r4 snippet's `Date`-based `addDays` is **not** used.
```ts
import type { ISODate, Weekday } from './types'
export type { ISODate, Weekday }
export function isISODate(s: string): s is ISODate          // /^\d{4}-\d{2}-\d{2}$/ + month 1–12 + day ≤ days-in-month (Gregorian leap rule)
export function toEpochDay(d: ISODate): number              // throws RangeError on invalid input
export function fromEpochDay(n: number): ISODate            // zero-padded YYYY-MM-DD (years 0000–9999)
export function addDays(d: ISODate, n: number): ISODate
export function addWeeks(d: ISODate, n: number): ISODate
export function diffDays(from: ISODate, to: ISODate): number   // to − from
export function compareISO(a: ISODate, b: ISODate): -1 | 0 | 1
export function minISO(a: ISODate, b: ISODate): ISODate
export function maxISO(a: ISODate, b: ISODate): ISODate
export function isoWeekday(d: ISODate): Weekday             // ((epochDay + 3) mod 7) + 1; 1970-01-01 was a Thursday
export function weekStart(d: ISODate): ISODate              // BR-05
export function daysOfWeek(ws: ISODate): ISODate[]          // 7 days from weekStart(ws)
export function weekRange(from: ISODate, to: ISODate): ISODate[]   // Mondays m, from ≤ m < to
export function eachDay(from: ISODate, toInclusive: ISODate): ISODate[]
const bangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
export function todayBangkok(now: Date = new Date()): ISODate { return bangkok.format(now) }   // BR-06 — the only Date use
```
Done-check: `pnpm vitest run --project unit --coverage src/domain` ≥ 95 %; `pnpm eslint src/domain` clean.

**S1.4 `src/domain/units.test.ts` → `units.ts`** (X02, M1-D22).
```ts
import type { Cd } from './types'
export function numericToCd(v: string): Cd     // /^(\d{1,3})(?:\.(\d{1,2}))?$/ → int*100 + frac padded right ('0.5' → 50); else RangeError
export function cdToNumeric(cd: Cd): string    // non-negative integer → `${Math.trunc(cd / 100)}.${String(cd % 100).padStart(2,'0')}`; else RangeError
```
U-UNIT-01 `'1.00'`→100, `'1'`→100, `'0.25'`→25, `'0.5'`→50, `'2.50'`→250; U-UNIT-02 float traps `'4.35'`→435,
`'1.15'`→115, `'0.07'`→7, `'0.29'`→29, `'99.99'`→9999; U-UNIT-03 `cdToNumeric(125)`=`'1.25'`, `100`→`'1.00'`, `5`→`'0.05'`,
`0`→`'0.00'`, `700`→`'7.00'`; U-UNIT-04 invalid `''`, `'abc'`, `'-1'`, `'1.234'`, `'1e2'`, `' 1'` and `cdToNumeric(-1)`,
`cdToNumeric(1.5)` throw `RangeError`; U-UNIT-05 property ∀ cd ∈ [0, 9999]: `numericToCd(cdToNumeric(cd)) === cd`;
U-UNIT-06 no `parseFloat`/`Number(` with decimals in the implementation (code review).

**S1.5 `src/lib/random-password.ts`** (FR-202, X60; start from `r6a §5.8`).
```ts
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'   // no 0/O/1/l/I
export function randomPassword(length = 12, rng: (buf: Uint32Array) => void = (b) => crypto.getRandomValues(b)): string
// rejection sampling (limit = floor(2^32 / 56) * 56); retry until ≥1 upper, ≥1 lower, ≥1 digit
```
U-PW-01 length 12; U-PW-02 1 000 samples: every char ∈ alphabet, each has upper/lower/digit; U-PW-03 never contains
`0 O 1 l I`; U-PW-04 a deterministic `rng` that first yields only lowercase indices forces a retry and the result still
satisfies the classes; U-PW-05 values ≥ the rejection limit are skipped (fake rng yields `0xFFFFFFFF` then valid values).
Never calls `crypto.randomUUID` (X53).

**S1.6 `src/lib/display-name.ts`** (FR-210).
```ts
export function displayName(u: { name: string; nickname?: string | null }): string   // trimmed nickname || name
export function initialOf(u: { name: string; nickname?: string | null }): string      // first grapheme via Intl.Segmenter('th', { granularity: 'grapheme' }), upper-cased for Latin
```
U-NAME-01 `{name:'Cindy', nickname:null}`→`'Cindy'`; U-NAME-02 `{name:'Demo Manager', nickname:'Manager'}`→`'Manager'`;
`nickname:'  '` → name; U-NAME-03 `initialOf({ name: 'นิ่ม', nickname: null })` = `'นิ่'` (base + combining vowel + tone
stay together); `initialOf({ name: 'cindy' })` = `'C'`; U-NAME-04 empty name → `'?'`.

**S1.7 `src/lib/safe-next.ts`** (X32, M1-21 of r6a).
```ts
export function safeNext(next: string | null | undefined, fallback = '/home'): string
// accept only '/'-prefixed paths that do not start with '//' or '/\\', contain no control chars, and are not '/login*' or '/account/password*'
export function firstParam(v: string | string[] | undefined): string | undefined   // Next searchParams value → first string
```
U-NEXT-01 `undefined`→`'/home'`; `'/projects/1?tab=a'` kept; U-NEXT-02 `'//evil.com'`, `'https://evil.com'`,
`'/\\evil.com'`, `'javascript:alert(1)'`, `'/login'`, `'/account/password'` → `'/home'`; U-NEXT-03 `'/home'` kept;
U-NEXT-04 `firstParam(['/a','/b'])` = `'/a'`, `firstParam(undefined)` = `undefined`.

**S1.8 `src/lib/user-colors.ts`** (functions next to S0's `USER_COLORS`).
```ts
export function contrastRatio(hexA: string, hexB: string): number             // WCAG relative luminance
export function pickLeastUsedColor(counts: ReadonlyMap<string, number>): UserColor   // min count, ties → palette order
```
U-COL-01 every `USER_COLORS` entry has `contrastRatio(c, '#FFFFFF') >= 4.5` (X51); U-COL-02 empty map → `'#2F5597'`;
U-COL-03 counts `{'#2F5597':2, '#7C3AED':1}` (others 0) → `'#B91C1C'`; all 12 used once → `'#2F5597'`; unknown colours in
the map are ignored.

**S1.9 `src/lib/keys.ts`** (X49; extend M0's file if it exists — keep its exports).
```ts
export function isEditableTarget(t: EventTarget | null): boolean   // input/textarea/select, [contenteditable], closest('.bn-editor')
export function isUndoKey(e: Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean  // Mod+Z, no shift/alt; code 'KeyZ' or key 'z'/'Z'
export function isRedoKey(e: …): boolean                           // Mod+Shift+Z
```
U-KEY-01 `{code:'KeyZ', key:'ผ', ctrlKey:true}` → undo (Thai Kedmanee layout); U-KEY-02 `{code:'KeyZ', metaKey:true, shiftKey:true}`
→ redo, not undo; U-KEY-03 `altKey` → neither; U-KEY-04 plain `z` → neither; U-KEY-05 `isEditableTarget` for an
`<input>`, a `contenteditable` div, a child of `.bn-editor` → true; `<button>`/`document.body` → false (jsdom, `ui`
project file `keys.test.ts` uses `// @vitest-environment jsdom`).

**S1.10 Done-check.** `pnpm vitest run --project unit src/domain src/lib` · `pnpm vitest run --project unit --coverage src/domain`
(≥ 95 %) · `pnpm eslint src/domain src/lib` · `pnpm typecheck` (own paths clean).

### 5.S2 — Backend  (backend-engineer · src/server/**, src/proxy.ts, src/instrumentation.ts, src/app/api/auth/**, scripts/**)

Every action follows **zod parse (wrapper) → `authz.*` first statement → service inside `db.transaction` → audit
inside the service (M1-D5) → `refresh()` only when RSC output changes**. Services take `(tx: DbOrTx, actor, input)`,
never open transactions, never import `server-only` modules, never read the clock (M1-D4). Hash passwords **before**
opening the transaction. Never log passwords, hashes, tokens or `DrizzleQueryError.message`.

**S2.1 `src/server/clock.ts` + `src/instrumentation.ts`** (X45).
```ts
import 'server-only'
export function serverNow(): Date   // ALLOW_TEST_HOOKS === '1' && APP_NOW ? new Date(APP_NOW) : new Date()
export function serverToday(): ISODate { return todayBangkok(serverNow()) }
```
`src/instrumentation.ts`: `export function register() { if (process.env.NODE_ENV === 'production' && (process.env.ALLOW_TEST_HOOKS === '1' || process.env.APP_NOW)) console.warn('[clock] ALLOW_TEST_HOOKS/APP_NOW set in production — test-only settings') }`.
Tests (`src/server/clock.int.test.ts`, `vi.stubEnv`): T-CLOCK-01 with `ALLOW_TEST_HOOKS=1, APP_NOW=2026-09-30T10:00:00+07:00`
→ `serverToday()` = `'2026-09-30'`; T-CLOCK-02 `APP_NOW` set but `ALLOW_TEST_HOOKS` unset → real date (`todayBangkok()`).

**S2.2 Repo layer** (`src/server/repo/*.ts`, `(tx: DbOrTx, …)`; numeric ↔ cd only here).
- `users.ts`: `activeUser` = ``sql`${user.banned} is not true` ``; `getUserOrNotFound(tx, id)`; `findUserIdByEmail(tx, email)`;
  `listEmployeeRows(tx): EmployeeRow[]` (left join positions; schedules aggregated in a second query; `numericToCd`);
  `lockActiveManagers(tx): Promise<string[]>` = `select id from "user" where role='manager' and banned is not true for update`;
  `getSchedule(tx, userId): Schedule`; `replaceSchedule(tx, userId, days: ScheduleDayDTO[])` (DELETE then INSERT with
  `cdToNumeric`); `colorCounts(tx): Map<string, number>`.
- `sessions.ts`: `deleteAllSessions(tx, userId)`, `deleteOtherSessions(tx, userId, keepToken)`.
- `accounts.ts`: `getCredentialHash(tx, userId)`, `setCredentialHash(tx, userId, hash)` (`provider_id='credential'`).
- `positions.ts`: `listPositions(tx)` (with `userCount` = count of users referencing it, active or not;
  `ORDER BY position, id`), `getPositionOrNotFound`, `insertPosition`, `updatePosition`, `deletePosition`.
- `order.ts` (X48, first use): `lockOrderScope(tx, scope: string)` = ``select pg_advisory_xact_lock(hashtext(${scope}))``;
  `keyAfter(last: string | null)`, `keyBetween(a, b)` (fractional-indexing `generateKeyBetween`, never the `digits` arg),
  `rekey(n)` (`generateNKeysBetween(null, null, n)`).
- `preferences.ts`: `getPreferenceData(tx, userId)`, `mergePreference(tx, userId, key, value)` =
  `insert … on conflict (user_id) do update set data = user_preferences.data || jsonb_build_object($key, $value::jsonb)`.
- `index.ts` (namespace barrel, X87): `export * as users from './users'; export * as sessions from './sessions';
  export * as accounts from './accounts'; export * as positions from './positions'; export * as order from './order';
  export * as preferences from './preferences'` — services import `* as repo from '@/server/repo'` and call
  `repo.<area>.<fn>`; every later milestone appends its files here (M2 `clients`, `projects`, `members`, `people`; M3-D39 …).
Colocated tests (`src/server/repo/order.int.test.ts`): T-ORD-01 three appends then "before first" → `ORDER BY position, id`
returns the JS order (`<` comparison), including a key starting with `Z` before `a0` (COLLATE "C" check).

**S2.3 Complete `src/server/auth.ts`** (FR-101, FR-103, FR-106, §9; r2 §2.1, PLAN §1.3).
```ts
export const LOCKOUT = { max: 5, windowMinutes: 15 } as const
export const DISABLED_AUTH_PATHS = ['/sign-up/email', '/update-user', '/change-email', '/delete-user', '/delete-user/callback',
  '/change-password', '/request-password-reset', '/reset-password', '/reset-password/:token', '/send-verification-email',
  '/verify-email', '/sign-in/social', '/link-social', '/unlink-account', '/list-accounts', '/account-info',
  '/get-access-token', '/refresh-token', '/update-session', '/revoke-other-sessions', '/revoke-session', '/revoke-sessions',
  '/admin/create-user', '/admin/update-user', '/admin/set-role', '/admin/set-user-password', '/admin/ban-user',
  '/admin/unban-user', '/admin/remove-user', '/admin/impersonate-user', '/admin/stop-impersonating', '/admin/list-users',
  '/admin/get-user', '/admin/list-user-sessions', '/admin/revoke-user-session', '/admin/revoke-user-sessions',
  '/admin/has-permission']
// verify the exact admin path list against node_modules/better-auth/dist/plugins/admin/routes.mjs and add any missing /admin/* path
```
Add to the config: `trustedOrigins: [process.env.BETTER_AUTH_URL, ...csv(process.env.TRUSTED_ORIGINS)].filter(Boolean)`;
`advanced.ipAddress = { ipAddressHeaders: ['x-forwarded-for'], trustedProxies: csv(process.env.TRUSTED_PROXIES) }`;
`rateLimit = { enabled: process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_HOOKS !== '1', window: 60, max: 100,
customRules: { '/sign-in/email': { window: 60, max: 30 } } }` (M1-D11); hooks (r2 §6.3, table renamed per PLAN):
```ts
function lockKey(ctx: HookCtx): { email: string; ip: string } | null   // email = String(body.email).trim().toLowerCase(); ip = getIP(ctx.request ?? ctx.headers, ctx.context.options) ?? 'unknown'
hooks: {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/sign-in/email') return
    const k = lockKey(ctx); if (!k) return
    const [row] = await db.select({ n: count() }).from(authLoginFailures).where(and(eq(authLoginFailures.email, k.email),
      eq(authLoginFailures.ip, k.ip), gt(authLoginFailures.createdAt, sql`now() - interval '15 minutes'`)))
    if ((row?.n ?? 0) >= LOCKOUT.max) throw new APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED', message: th.auth.errors.LOGIN_LOCKED })
  }),
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/sign-in/email') return
    const k = lockKey(ctx); if (!k) return
    const r = ctx.context.returned
    if (isAPIError(r)) {
      if ((r.body as { code?: string } | undefined)?.code === 'INVALID_EMAIL_OR_PASSWORD') {
        await db.insert(authLoginFailures).values(k)
        await db.delete(authLoginFailures).where(lt(authLoginFailures.createdAt, sql`now() - interval '1 day'`))
      }
      return
    }
    await db.delete(authLoginFailures).where(and(eq(authLoginFailures.email, k.email), eq(authLoginFailures.ip, k.ip)))
  }),
},
```
Imports: `APIError, createAuthMiddleware, getIP, isAPIError` from `better-auth/api`. `nextCookies()` stays the last
plugin. Done-check: `pnpm auth:check` exits 0; T-AUTH/T-LOCK suites (S4) green at G2.

**S2.4 `src/proxy.ts` session gate** (FR-103, AC-101, AC-103; r2 §2.6 verified pattern; keep M0's CSP/nonce/header code
and matcher — `/api`, `/_next/static`, `/_next/image`, fonts, favicon stay excluded).
```ts
const PUBLIC_PATHS = ['/login']
const MUST_CHANGE_ALLOWED = ['/account/password']
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  let authHeaders: Headers | null = null
  if (!isPublic) {
    const { headers, response: session } = await auth.api.getSession({ headers: req.headers, returnHeaders: true })
    authHeaders = headers
    if (!session) return withAuthCookies(redirectWithNext(req, '/login', pathname + search), authHeaders)          // AC-101
    if (session.user.mustChangePassword === true && !MUST_CHANGE_ALLOWED.includes(pathname))
      return withAuthCookies(redirectWithNext(req, '/account/password', pathname + search), authHeaders)            // AC-103
  }
  return withAuthCookies(nextWithSecurityHeaders(req), authHeaders)   // M0's nonce + CSP + headers, unchanged
}
function withAuthCookies(res: NextResponse, h: Headers | null): NextResponse {   // FR-103 sliding renewal
  for (const c of h?.getSetCookie() ?? []) res.headers.append('set-cookie', c); return res
}
function redirectWithNext(req: NextRequest, to: string, next: string): NextResponse
// 307 to `to`; appends `?next=${encodeURIComponent(next)}` only when next !== '/' and safeNext(next) === next and next !== '/home'
// (so '/' and '/home' → plain '/login'; '/settings/employees' → '/login?next=%2Fsettings%2Femployees')
```
The proxy is an optimisation + cookie renewal; pages, actions and routes still check the session themselves.

**S2.5 `src/app/api/auth/[...all]/route.ts`:** `import { toNextJsHandler } from 'better-auth/next-js'; export const { GET, POST } = toNextJsHandler(auth)`.

**S2.6 `src/server/auth-errors.ts` + login/logout** (FR-101, M1-D7, M1-D12).
```ts
export function mapAuthApiError(e: unknown): AppError   // isAPIError(e): body.code INVALID_EMAIL_OR_PASSWORD|INVALID_EMAIL → AppError('INVALID_CREDENTIALS', th.auth.errors.INVALID_CREDENTIALS);
                                                        // BANNED_USER → AppError('ACCOUNT_DEACTIVATED', …); LOGIN_LOCKED or statusCode 429 → RateLimitedError; else rethrow
export const login = publicAction(loginInput, async ({ email, password, next }) => {
  let mustChange = false
  try {
    const res = await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
    mustChange = (res.user as { mustChangePassword?: unknown }).mustChangePassword === true
  } catch (e) { throw mapAuthApiError(e) }
  const target = safeNext(next)
  return { redirectTo: mustChange ? `/account/password${target === '/home' ? '' : `?next=${encodeURIComponent(target)}`}` : target }
})
export const logout = action(z.object({}), async (_i, { user }) => {
  authz.requireUser(user)
  await auth.api.signOut({ headers: await headers() })   // nextCookies clears the cookies in the action response
  return { redirectTo: '/login' }
}, { allowWhenMustChangePassword: true })
```
Colocated test `src/server/actions/auth.int.test.ts`: T-LOGIN-01 `login` with golden-style user sets
`better-auth.session_token` in the mocked cookie jar and returns `{ redirectTo: '/home' }`; with `next:'//evil'` →
`'/home'`; mustChange user → `'/account/password'`.

**S2.7 Account service + actions** (FR-105, FR-107, M1-D9, M1-D10).
```ts
// src/server/services/account.ts
export async function verifyOwnPassword(tx: DbOrTx, userId: string, password: string): Promise<boolean>   // verifyPassword({ hash, password })
export async function changeOwnPassword(tx: DbOrTx, actor: SessionUser, input: { passwordHash: string }): Promise<void>
// setCredentialHash; update user set must_change_password=false; deleteOtherSessions(actor.id, actor.sessionToken);
// audit.log(tx, actor, { entity:'user', entityId: actor.id, action:'update', summary: th.audit.passwordChanged(displayName(actor)), after: { passwordChanged: true } })
export async function signOutEverywhere(tx: DbOrTx, actor: SessionUser): Promise<void>
// deleteAllSessions(actor.id); audit { entity:'user', action:'update', summary: th.audit.signedOutEverywhere(…), after: { signedOutEverywhere: true } }
```
```ts
// src/server/actions/auth.ts
export const changeOwnPassword = action(changePasswordInput, async (input, { user }) => {
  authz.requireUser(user)
  const issues = passwordPolicy(input.newPassword, { email: user.email, currentPassword: input.currentPassword })
  if (issues.length) throw new ValidationError({ newPassword: issues.map((i) => th.account.policy[i]) })
  if (!(await services.account.verifyOwnPassword(db, user.id, input.currentPassword)))
    throw new AppError('INVALID_PASSWORD', undefined, { fieldErrors: { currentPassword: [th.errors.INVALID_PASSWORD] } })
  const passwordHash = await hashPassword(input.newPassword)
  await db.transaction((tx) => services.account.changeOwnPassword(tx, user, { passwordHash }))
  return { redirectTo: safeNext(input.next) }
}, { allowWhenMustChangePassword: true })
export const signOutEverywhere = action(z.object({}), async (_i, { user }) => {
  authz.requireUser(user)
  await db.transaction((tx) => services.account.signOutEverywhere(tx, user))
  return { redirectTo: '/login' }
}, { allowWhenMustChangePassword: true })
```

**S2.8 Employees service + actions** (FR-201…FR-207, FR-209, AC-104, AC-201, AC-202, M1-D8, M1-D13, M1-D16).
```ts
// src/server/services/employees.ts
type Actor = { id: string } | null
export async function listEmployees(tx: DbOrTx): Promise<EmployeeRow[]>
export async function createEmployee(tx: DbOrTx, actor: Actor, input: Omit<CreateEmployeeData, 'password'> & { passwordHash: string }): Promise<{ userId: string }>
// id = crypto.randomUUID() (node:crypto); email already trimmed+lowercased by zod; pre-check findUserIdByEmail → ConflictError('CONFLICT', th.employees.emailTaken, { fieldErrors: { email: [th.employees.emailTaken] } });
// color = input.color ?? pickLeastUsedColor(await colorCounts(tx)); nickname '' → null; insert user (role, mustChangePassword, emailVerified true);
// insert account { id: randomUUID(), userId, accountId: userId, providerId: 'credential', password: passwordHash }; replaceSchedule; 23505 user_email_unique → same ConflictError;
// audit { entity:'user', entityId, action:'create', summary: th.audit.employeeCreated(displayName), after: { email, role, positionId, mustChangePassword, schedule } }  — never the hash
export async function updateEmployee(tx: DbOrTx, actor: Actor, input: UpdateEmployeeData): Promise<void>
// getUserOrNotFound; if role changes manager→worker: ids = lockActiveManagers(tx); if ids.includes(target) && ids.length <= 1 → ConflictError('LAST_MANAGER');
// update profile columns (color only when provided); replaceSchedule when it differs; one audit row with before/after of changed fields only
export async function deactivateEmployee(tx: DbOrTx, actor: { id: string }, input: { userId: string; today: ISODate }): Promise<{ name: string }>
// actor.id === userId → ConflictError('SELF_DEACTIVATE'); ids = lockActiveManagers(tx); if ids.includes(userId) && ids.length <= 1 → LAST_MANAGER;
// update banned=true, ban_reason='DEACTIVATED', ban_expires=null, deactivated_on=today; deleteAllSessions(userId); audit 'update' after { deactivatedOn }
export async function reactivateEmployee(tx: DbOrTx, actor: Actor, input: { userId: string }): Promise<{ name: string }>
export async function resetEmployeePassword(tx: DbOrTx, actor: Actor, input: { userId: string; passwordHash: string }): Promise<{ name: string }>
// setCredentialHash; must_change_password=true; deleteAllSessions(userId); audit after { passwordChanged: true }  (FR-204)
```
```ts
// src/server/actions/employees.ts (all: authz.requireManager(user) first; refresh() after commit)
export const createEmployee = action(createEmployeeInput, async (input, { user }) => {
  authz.requireManager(user)
  const { password, ...data } = input
  const passwordHash = await hashPassword(password)   // before the tx; plaintext never reaches the service
  const res = await db.transaction((tx) => services.employees.createEmployee(tx, user, { ...data, passwordHash }))
  refresh()
  return res                                   // { userId } only — the password is never echoed (AC-202)
})
export const deactivateEmployee = action(userIdInput, async ({ userId }, { user }) => {
  authz.requireManager(user)
  await db.transaction((tx) => services.employees.deactivateEmployee(tx, user, { userId, today: serverToday() }))
  refresh(); return {}
})
// updateEmployee, reactivateEmployee: same shape. resetEmployeePassword: requireManager; load target email (404 if missing);
// passwordPolicy(password, { email: target.email }) → ValidationError; hash; tx; refresh.
```
Colocated tests (`src/server/services/employees.int.test.ts`): T-EMPS-01 colour of the 13th user wraps to the least-used;
T-EMPS-02 `replaceSchedule` stores `'0.50'` for 50 and reads back 50; T-EMPS-03 audit `after` never contains
`password`/hash (JSON.stringify check).

**S2.9 Positions service + actions** (FR-208, X48, M1-D14). Scope key `'positions'`.
```ts
export async function listPositions(tx: DbOrTx): Promise<PositionRow[]>
export async function createPosition(tx, actor, { name }): Promise<{ id: string }>   // lockOrderScope; key = keyAfter(last); 23505 positions_name_unique → ConflictError('CONFLICT', th.positions.nameTaken, { fieldErrors: { name: [...] } })
export async function renamePosition(tx, actor, { id, name }): Promise<void>         // audit positionRenamed(from, to)
export async function movePosition(tx, actor, { id, direction }): Promise<void>
// lock; rows = list; i = index; up: between rows[i-2]?.position ?? null and rows[i-1].position; down: rows[i+1] and rows[i+2] ?? null;
// at the ends → no-op (no audit); if the two neighbours are equal → rekey all siblings in order, then move; audit positionMoved
export async function deletePosition(tx, actor, { id }): Promise<{ deleted: DeletedPosition }>
// count users with position_id = id (active or not) > 0 → ConflictError('IN_USE', th.positions.inUse(n)); delete; 23503 backstop → same; audit 'delete'
export async function restorePosition(tx, actor, input: DeletedPosition): Promise<void>
// insert same id/name/key; 23505 (id or name) → ConflictError('CONFLICT', th.positions.restoreConflict); audit 'restore'
```
Actions: `authz.requireManager(user)` → tx → `refresh()`. Colocated tests (`src/server/services/positions.int.test.ts`):
T-POSS-01 create A, B, C then move C up twice → order C, A, B; move first up → no-op, no audit row;
T-POSS-02 two neighbours with equal keys (inserted directly) → move re-keys and succeeds.

**S2.10 Preferences** (X05, M1-D17). `services/preferences.ts`: `getPreferences(tx, userId): Promise<Preferences>`
(= `preferencesSchema.parse(data ?? {})`), `setPreference(tx, userId, input: PreferenceInput)` (`mergePreference`).
Action `setPreference = action(preferenceInput, async (input, { user }) => { authz.requireUser(user); await services.preferences.setPreference(db, user.id, input); return {} })`
— no audit, no `refresh()`.

**S2.11 `services/users.ts`** (AC-203 M1 part, X12): `listAssignableUsers(tx): Promise<AssignableUser[]>` — active users
only (`banned is not true`), any role, ordered by display name (`Intl.Collator('th')` in JS). Consumed by M2/M3 pickers.

**S2.12 Bootstrap** (FR-102, §10.4 steps 1 + 3, M1-18 of r6a).
```ts
// scripts/lib/bootstrap.ts
export const DEFAULT_POSITIONS = ['Project Manager', 'Developer', 'Designer', 'QA', 'Data', 'Business Analyst'] as const
export interface BootstrapResult { createdManager: boolean; seededPositions: number; warnings: string[]; fatal?: string }
export async function runBootstrap(db: Db, env: NodeJS.ProcessEnv, log: Pick<Console, 'info' | 'warn' | 'error'> = console): Promise<BootstrapResult>
// 1) warn if NODE_ENV=production and (ALLOW_TEST_HOOKS==='1' || APP_NOW)
// 2) in one tx: if count(user) = 0: if INITIAL_MANAGER_EMAIL/NAME/PASSWORD all set → createEmployeeInput.safeParse({ name, email, password, role:'manager',
//    positionId:null, mustChangePassword:true }) (policy!) → hashPassword → services.employees.createEmployee(tx, null, …); invalid → fatal 'INITIAL_MANAGER_* invalid: <field names>'
//    missing → warning (dev) / fatal (NODE_ENV=production); users exist → skip (never touches passwords)
// 3) if count(positions) = 0 → services.positions.createPosition(tx, null, { name }) for each DEFAULT_POSITIONS in order
// Never prints the password or the hash.
```
`scripts/bootstrap.ts`: `createScriptDb()` → `runBootstrap(db, process.env)` → print a one-line summary → `process.exitCode = result.fatal ? 1 : 0` → `close()`.

**S2.13 `seedGolden` + `seed-golden.ts` + `db-reset.ts`** (X11, SEED-A1; PLAN §3.13).
```ts
// scripts/lib/fixtures.ts
const GoldenUsers = z.object({ positions: z.array(z.string()), users: z.array(z.object({ nickname: z.string(), name: z.string(),
  email: z.string(), position: z.string(), role: z.enum(['manager', 'worker']), devPassword: z.string(),
  scheduleCd: z.record(z.string(), z.number().int()) })) })
export function loadGolden(): z.infer<typeof GoldenUsers>   // readFileSync(path.join(process.cwd(), 'docs/reference/golden-fixtures.json')); never re-typed
export async function seedGolden(db: DbOrTx, opts: { upTo?: GoldenStage } = {}): Promise<void>
// positions via services.positions.createPosition (JSON order); one hashPassword(devPassword) for all users;
// users via services.employees.createEmployee(tx, null, { name, nickname, email, role, positionId, mustChangePassword: false,
//   schedule: from scheduleCd (fractionCd = value), passwordHash }) in JSON order (colours = palette order by least-used)
```
`scripts/seed-golden.ts`: `assertNotProduction()`; one transaction: `truncateAll(tx)` + `seedGolden(tx)`; print counts.
`scripts/db-reset.ts`: `assertNotProduction()`; `truncateAll(db)`.

**S2.14 Done-check.** `pnpm db:up` · `pnpm vitest run --project integration src/server scripts` · `pnpm vitest run
--project unit src/server` · `pnpm eslint src/server src/proxy.ts src/instrumentation.ts src/app/api scripts` ·
`pnpm typecheck` (own paths) · `pnpm auth:check` · `pnpm seed:golden` then `pnpm bootstrap` on the seeded DB
(prints "users exist — skipped", exit 0). Report the S4 suites you expect to turn green.

### 5.S3 — Frontend  (frontend-engineer · src/app/layout.tsx, src/app/(auth)/**, src/app/(app)/layout.tsx, src/app/(app)/settings/**, src/components/**, src/hooks/**, src/lib/copy-text.ts)

MUI 9 API only (`slots`/`slotProps`, `sx`, no system props, Grid `size`, icons by path import, `next/link` via
`@/components/Link`). Every string from `th` (ESLint bans Thai literals). Forms are controlled MUI inputs +
`schema.safeParse` on submit (map `z.flattenError(e).fieldErrors` to `helperText`), then the server action; server
`fieldErrors` are shown the same way. No confirm dialogs (deactivate/delete are immediate + undo toast). Status is never
colour-only (chips carry text; icons have `aria-label`). No `localStorage`, no `crypto.randomUUID`. Server pages do
authz first, before any Suspense boundary (X41). Client mutation flow: `startTransition(async () => { const r = await
action(v); if (!r.ok) { show r.message / r.fieldErrors; return } … })`.

**S3.1 Providers.**
- `src/components/undo/UndoProvider.tsx` (`'use client'`, X04, PLAN §3.8):
  ```ts
  export interface UndoEntry { label: string; undo(): Promise<void>; redo(): Promise<void> }
  export interface UndoApi { push(entry: UndoEntry, opts?: { toast?: string }): void; undo(): Promise<void>; redo(): Promise<void>
    undoEntry(entry: UndoEntry): Promise<void>; canUndo: boolean; canRedo: boolean }
  // stack max 50 (drop oldest); push clears redo; one operation at a time (busy ref; Cmd+Z while busy is ignored);
  // undo(): pop → await entry.undo() → push to redo stack; on throw: toast.error(err instanceof ActionFailure ? err.message : th.undo.failed), entry dropped
  // opts.toast → toastUndo(opts.toast, () => api.undoEntry(entry)); undoEntry removes that entry wherever it sits, then runs it
  // window keydown: if (e.defaultPrevented || isEditableTarget(e.target)) return; isUndoKey → preventDefault + undo(); isRedoKey → redo()
  ```
  `useUndo()` in `src/components/undo/useUndo.ts`; `toastUndo(message, onUndo)` in `src/components/undo/toastUndo.ts`
  = `toast(message, { duration: 8000, action: { label: th.undo.undo, onClick: () => void onUndo() } })`.
- `src/components/providers/ToasterHost.tsx`: create from `plan/research/snippets/r4/client/components/ToasterHost.tsx`
  if M0 has none (replace `th.common.undo` with `th.undo.undo`; bottom-center, `closeButton`, themed from MUI).
- `src/components/providers/PreferencesProvider.tsx` + `src/hooks/usePreferences.ts`:
  `usePreferences(): { prefs: Preferences; setPreference<K extends PreferenceInput['key']>(key: K, value: Extract<PreferenceInput, { key: K }>['value']): void }`
  — optimistic local state, debounced 300 ms per key (`src/hooks/useDebouncedCallback.ts`), flush on `pagehide`;
  `{ ok:false }` → `toast.error(th.prefs.saveFailed)`. Anonymous pages get `DEFAULT_PREFERENCES` and never call the action.
- `src/components/providers/CurrentUserProvider.tsx` + `src/hooks/useCurrentUser.ts` (`CurrentUserDTO | null`).
- `src/components/providers/AppProviders.tsx`: add `prefs` prop; order `AppRouterCacheProvider → ThemeProvider
  (defaultMode = prefs.theme, storageManager={null}) → CssBaseline → QueryClientProvider → PreferencesProvider →
  UndoProvider → children + ToasterHost`.
- `src/app/layout.tsx` (root): `const user = await getSessionUser(); const prefs = user ? await getPreferences(db, user.id) : DEFAULT_PREFERENCES`;
  `<html lang="th" className={… fonts … ${prefs.theme === 'dark' ? 'dark' : 'light'}}>`; `system` resolves on the client
  (MUI `useColorScheme`), no localStorage.
Tests first (`ui`): `src/components/undo/UndoProvider.test.tsx` — U-UNDO-01 push+undo calls `undo` once, `canRedo`
true; U-UNDO-02 redo calls `redo`; U-UNDO-03 51 pushes keep 50 (oldest dropped); U-UNDO-04 push after undo clears redo;
U-UNDO-05 `Ctrl+Z` (`code:'KeyZ'`) on `document.body` undoes; U-UNDO-06 inside `<input>` / `contenteditable` / `.bn-editor`
does nothing; U-UNDO-07 `defaultPrevented` event ignored; `Ctrl+Shift+Z` redoes; U-UNDO-08 toast action button labelled
`th.undo.undo` undoes that specific entry even when it is not on top; toast gone after 8 000 ms (`vi.useFakeTimers`,
`advanceTimersByTime(8000)`); U-UNDO-09 a rejecting `undo()` shows `th.undo.failed` and leaves the stack consistent.
`src/hooks/usePreferences.test.tsx` — U-PREF-01 two calls within 300 ms send one action call with the last value;
U-PREF-02 failure shows `th.prefs.saveFailed`.

**S3.2 Login** (FR-101, AC-101, X32, M1-D7).
- `src/app/(auth)/layout.tsx`: centered `Paper` card, app name from `th.common` (M0), no sidebar.
- `src/app/(auth)/login/page.tsx` (server): `const { next } = await props.searchParams` (`PageProps<'/login'>`);
  `const u = await getSessionUser(); if (u) redirect(u.mustChangePassword ? '/account/password' : safeNext(firstParam(next)))`;
  render `<LoginForm next={safeNext(firstParam(next))} />`; `metadata.title = th.auth.loginTitle`.
- `src/components/account/LoginForm.tsx` (`'use client'`): `TextField` email (`type="email"`, `autoComplete="username"`,
  label `th.auth.email`), password (`type="password"`, `autoComplete="current-password"`), submit `th.auth.submit`
  (`th.auth.submitting` while pending); `loginInput.safeParse` → `login({ email, password, next })` → ok →
  `window.location.assign(r.redirectTo)`; error → `<Alert severity="error" role="alert">{r.message}</Alert>` (covers
  `INVALID_CREDENTIALS`, `ACCOUNT_DEACTIVATED`, `LOGIN_LOCKED`); hint `th.auth.noSignUp`. No sign-up link anywhere.

**S3.3 Account page** (FR-104, FR-105, FR-107, M1-D21).
- `src/app/(auth)/account/page.tsx` → `redirect('/account/password')`.
- `src/app/(auth)/account/password/page.tsx` (server, `PageProps<'/account/password'>`): `const { next } = await props.searchParams;
  const user = await getSessionUser(); if (!user) redirect('/login')` (`safeNext` rejects `/account/password` as a target);
  render title `th.account.title`, `user.mustChangePassword` → `<Alert severity="warning">{th.account.mustChangeBanner}</Alert>`;
  `<ChangePasswordForm email={user.email} next={safeNext(firstParam(next))} />`; `<SignOutEverywhereButton />`; a
  logout button (`th.nav.logout`) always; a `Link` `th.common.backHome` only when `!mustChangePassword`.
- `src/components/account/ChangePasswordForm.tsx`: three password fields (`autoComplete` current-password /
  new-password / new-password), helper `th.account.policyHint`; client check = `changePasswordInput.safeParse` +
  `passwordPolicy(newPassword, { email, currentPassword })`; server `INVALID_PASSWORD` → error under current
  password; ok → `toast.success(th.account.changed)` then `window.location.assign(r.redirectTo)`.
- `src/components/account/SignOutEverywhereButton.tsx`: outlined button `th.account.signOutEverywhere` + hint text; click →
  `signOutEverywhere({})` → `queryClient.clear()` → `window.location.assign('/login')` (no confirm: logging in again is the undo).

**S3.4 App layout + shell** (§8.1, X33).
- `src/app/(app)/layout.tsx`: `const user = await requirePageUser()` first; wrap children in
  `<CurrentUserProvider user={toCurrentUserDTO(user)}>` and `<TodayProvider today={serverToday()}>` and pass the user to
  `AppShell`. `src/components/providers/TodayProvider.tsx` (`'use client'`) + `src/hooks/useToday.ts`
  (`useToday(): ISODate`, throws outside the provider) are built here (PLAN §3.6; M0 deferred them to M1; first
  consumers M3/M5). Test `useToday.test.tsx`: inside `<TodayProvider today="2026-09-30">` returns `'2026-09-30'`.
- Nav config (M0's `src/components/shell/nav.ts`, X84): extend `NavIcon` with `'settings'` and append
  `{ id: 'settings', href: '/settings/employees', label: th.nav.settings, icon: 'settings', managerOnly: true }` to
  `BOTTOM_NAV` (it stays last: M2 inserts clients and M9 people before it); add `settings: SettingsOutlined`
  (`@mui/icons-material/SettingsOutlined`) to `Sidebar`'s `NAV_ICONS`; `Sidebar` filters `managerOnly` items by
  `useCurrentUser()?.role === 'manager'` (server-side check stays authoritative).
- `src/components/shell/UserMenu.tsx`: button = `UserAvatar` + display name (`aria-label={th.nav.userMenu}`) opening an MUI
  `Menu`: `th.nav.account` (Link `/account/password`); theme `RadioGroup` (`th.prefs.themes.*`) → `setMode(v)` from
  `useColorScheme()` + `setPreference('theme', v)`; `th.nav.logout` → `logout({})` → `queryClient.clear()` →
  `window.location.assign('/login')`. Placed at the sidebar bottom ("○ Cindy · ออกจากระบบ", §8.1).
- Sidebar collapse: initial value `prefs['sidebar.collapsed']`; the Cmd/Ctrl+\ handler and the collapse button call
  `setPreference('sidebar.collapsed', next)` (replaces any M0 in-memory-only state).
Tests (`ui`): `src/components/shell/UserMenu.test.tsx` — U-MENU-01 opening the menu lists the three entries; choosing
`th.prefs.themes.dark` calls `setPreference('theme','dark')`; U-MENU-02 the settings nav item renders for a manager and
not for a worker.

**S3.5 `UserName` / `UserAvatar`** (FR-210, PLAN §3.7, M1-D20). `src/components/common/UserName.tsx`:
props `{ user: { name; nickname; positionName?; active? } }` → text `displayName(user)` + (inactive)
` ${th.users.deactivatedSuffix}`; MUI `Tooltip` title `th.users.tooltip(user.name, user.positionName ?? null)`.
`UserAvatar.tsx`: MUI `Avatar` (`sx` size 28) with `initialOf(user)`, background `user.color ?? USER_COLORS[0]`, white
text, `aria-hidden` (the name is always next to it); inactive → grey + `opacity` never alone (the suffix carries the state).
Tests: U-UN-01 `{name:'Demo Manager', nickname:'Manager'}` renders "Manager"; hover shows "Demo Manager · Project Manager";
U-UN-02 inactive renders "(ปิดใช้งาน)" via `th.users.deactivatedSuffix`; U-UN-03 avatar shows `initialOf`.

**S3.6 Settings shell** (X41, M1-D21). `src/app/(app)/settings/layout.tsx`: `await requireManagerPage()` first, then MUI
`Tabs` (links) `th.nav.employees` → `/settings/employees`, `th.nav.positions` → `/settings/positions`.
`src/app/(app)/settings/page.tsx`: `redirect('/settings/employees')`. Each page also calls `requireManagerPage()` first
(layouts do not re-run on client navigation).

**S3.7 Employees page** (FR-209, AC-203 M1 part, M1-D15).
- `src/app/(app)/settings/employees/page.tsx` (server): `const me = await requireManagerPage()`;
  `const [rows, positions] = await Promise.all([listEmployees(db), listPositions(db)])`;
  `<EmployeesTable rows={rows} positions={positions} currentUserId={me.id} />`.
- `src/components/settings/employees/filter.ts`: `filterEmployees(rows, { q, positionId: string | 'none' | 'all', status: 'all' | 'active' | 'deactivated' })`
  and `sortEmployees(rows)` (active first, then `Intl.Collator('th').compare(displayName)`).
  Tests first (`filter.test.ts`, unit): U-FILT-01 `q:'pat'` → Peter; `q:'MAN'` → Manager (nickname, case-insensitive);
  U-FILT-02 Thai: name `'นิ่ม'` matches `q:'นิ'` (NFC both sides); U-FILT-03 `positionId:'none'` → users without position;
  U-FILT-04 `status:'deactivated'` → only inactive; default `'all'`; U-FILT-05 sort puts inactive last.
- `EmployeesTable.tsx`: toolbar = search `TextField` (`th.employees.filters.search`), position `Select`
  (`allPositions` / each / `noPosition`), status `Select` (`allStatuses` / `status.active` / `status.deactivated`),
  button `th.employees.add`. MUI `Table` columns: name (`UserAvatar` + `UserName` + `th.employees.you` chip on own row +
  `th.employees.mustChangeBadge` chip when pending), email, position (`th.users.noPosition` when null), role
  (`th.employees.roles.*`), schedule summary (weekday shorts + non-1.00 fractions), status `Chip` with text
  `th.employees.status.*` and an icon (`CheckCircleOutline` / `Block`) — never colour alone; row action menu
  (`aria-label={th.common.actions}`): `edit`, `resetPassword` (hidden on own row), `deactivate`/`reactivate` (deactivate
  hidden on own row). Empty states: `th.employees.empty` / `th.employees.noMatch` (M0 `EmptyState`).

**S3.8 Employee form dialog** (FR-201…FR-203, FR-207, AC-201, AC-202).
- `EmployeeFormDialog.tsx` (`mode: 'create' | 'edit'`): MUI `Dialog` with `slotProps`; fields name, nickname, email,
  position `Select`, role `Select`, colour radio swatches (`th.employees.colorAuto` + 12 options labelled
  `th.employees.colorOption(n)`), `ScheduleEditor`; create mode adds `PasswordField` + `Checkbox`
  `th.employees.fields.mustChange` (default checked). Esc / `th.common.cancel` closes. **All form state lives in the
  dialog component and is reset on close/unmount and after success** (the dialog unmounts its content when closed:
  `slotProps.transition.onExited` → reset, or `keepMounted={false}` + key change).
- Create success → second step inside the same dialog: `th.employees.createdTitle`, email,
  password in a read-only monospace field, button `th.employees.copyPassword` (→ `copyText`, then `th.common.copied`),
  warning `th.employees.passwordShownOnce`, `th.common.close`. The password exists only in this component's state
  (never in a URL, query cache, toast or storage) and is cleared when the dialog closes (AC-202).
- `PasswordField.tsx`: `TextField` (visible text type so the manager can read a generated value) + button
  `th.employees.generatePassword` (→ `randomPassword()`); helper `th.account.policyHint`.
- `ScheduleEditor.tsx`: 7 rows (`th.employees.schedule.weekdayLong[1..7]`), each a `Checkbox` `th.employees.schedule.works`
  + `Select` of `FRACTION_CD` labelled `th.employees.schedule.fractions[cd]`; default `DEFAULT_SCHEDULE`; error
  `th.employees.schedule.atLeastOneDay` when none checked.
- Submit: create → `createEmployee(values)`; edit → `updateEmployee({ userId, …values })`; `fieldErrors.email` (taken) shown
  under the email field; `LAST_MANAGER` shown as an `Alert` in the dialog; success → `toast(th.employees.created(name))` /
  `toast(th.employees.updated)`; the server action's `refresh()` re-renders the table.
Tests (`ui`): `EmployeeFormDialog.test.tsx` — U-FORM-01 submit with empty name shows `th.employees.nameRequired`,
no action call; U-FORM-02 "สุ่มรหัส" fills a 12-char value; U-FORM-03 after a mocked successful create the
success step shows the password; closing and reopening shows an empty password field (AC-202);
U-FORM-04 password equal to the email local part shows `th.account.policy.EQUALS_EMAIL`; U-FORM-05 unticking all
schedule days blocks submit with `atLeastOneDay`; U-FORM-06 `mustChange` checkbox defaults to checked (FR-203).

**S3.9 Reset password dialog** (FR-204). `ResetPasswordDialog.tsx`: title `th.employees.resetTitle(displayName)`, hint
`th.employees.resetHint`, `PasswordField`, submit → `resetEmployeePassword({ userId, password })` → success step shows the
password once + copy (same component as S3.8's success step) → toast `th.employees.passwordReset(name)`.

**S3.10 Deactivate / reactivate with undo** (FR-205, FR-206, AC-104, M1-D13). Row menu → `deactivateEmployee({ userId })`
→ ok → `undo.push({ label: th.employees.deactivated(name), undo: () => unwrap(reactivateEmployee({ userId })).then(() => {}),
redo: () => unwrap(deactivateEmployee({ userId })).then(() => {}) }, { toast: th.employees.deactivated(name) })`;
`LAST_MANAGER` / `SELF_DEACTIVATE` → `toast.error(r.message)`. Reactivate mirrors it. No dialog.

**S3.11 Positions page** (FR-208, M1-D14).
- `src/app/(app)/settings/positions/page.tsx` (server): `await requireManagerPage()`; `listPositions(db)` → `<PositionsList rows />`.
- `src/components/settings/positions/PositionsList.tsx`: MUI `List`; each row: name (click `th.positions.rename` → inline
  `TextField`, Enter saves via `renamePosition`, Esc cancels), `Chip` `th.positions.userCount(n)`, `IconButton`s
  `th.common.moveUp` / `th.common.moveDown` (disabled at the ends) → `movePosition`, delete `IconButton`
  (`aria-label={th.common.delete}`) → `deletePosition({ id })` → ok → `undo.push({ label, undo: () => unwrap(restorePosition(deleted)),
  redo: () => unwrap(deletePosition({ id: deleted.id })) }, { toast: th.positions.deleted(name) })`; `IN_USE` →
  `toast.error(r.message)` (message carries the count). Add row at the bottom: `TextField` `th.positions.namePlaceholder`
  + button `th.positions.add` (Enter submits; `fieldErrors.name` → helper text). Empty state `th.positions.empty`.
Tests (`ui`): `PositionsList.test.tsx` — U-POSL-01 delete calls the action and shows a toast with a `th.undo.undo`
button; clicking it calls `restorePosition` with the returned row; U-POSL-02 `IN_USE` shows the error toast and pushes
nothing; U-POSL-03 the first row's "เลื่อนขึ้น" is disabled.

**S3.12 `src/lib/copy-text.ts`** (X53): `export async function copyText(text: string): Promise<boolean>` — try
`navigator.clipboard?.writeText` (only when `window.isSecureContext`), else hidden `textarea` + `select()` +
`document.execCommand('copy')`; returns success. Tests (`copy-text.test.ts`, jsdom): U-COPY-01 uses the clipboard API
when available; U-COPY-02 falls back to `execCommand` when `navigator.clipboard` is undefined.

**S3.13 Done-check.** `pnpm vitest run --project ui src/components src/hooks src/lib/copy-text.test.ts` ·
`pnpm vitest run --project unit src/components/settings/employees/filter.test.ts` · `pnpm eslint src/app src/components src/hooks src/lib/copy-text.ts` ·
`pnpm typecheck` (own paths). Never run `next dev`/`next build` (integrator only).

### 5.S4 — Tests  (test-engineer · tests/**, e2e/**)

Write from SPEC + this plan, not from the implementation; run each suite before S2/S3 land and confirm it fails for the
right reason (`NOT_IMPLEMENTED` → `INTERNAL`), then again at G2. Never run `next build`/`next dev`/Playwright (G2 runs
them); verify specs with `pnpm exec playwright test --list`. Integration tests that need "today" set
`vi.stubEnv('ALLOW_TEST_HOOKS','1'); vi.stubEnv('APP_NOW','2026-09-30T10:00:00+07:00')`. Helpers used below
(add to `tests/helpers/auth-http.ts`): `signInHttp(email, password, ip = '10.0.0.1'): Promise<Response>` =
`auth.handler(new Request('http://localhost:3100/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type':
'application/json', origin: 'http://localhost:3100', 'x-forwarded-for': ip }, body: JSON.stringify({ email, password }) }))`;
`cookieHeaderFrom(res)` (Set-Cookie → `Cookie` header value); `signInApi(email, password, ip)` = `auth.api.signInEmail`
with explicit headers, resolving to `'200' | '<status>:<code>'`.

**S4.1 Authz rows (`tests/authz/rows/*.ts`; PLAN §4.4 format; §7.2 lists every row).** Workers get `403` for
global manager-only actions (X41). Each mutating `allow` row is audited unless marked `audit: false`.
```ts
// rows/employees.ts (PERM-01, SPEC §3.2 "สร้าง/แก้/ปิดใช้งานพนักงาน, ตั้ง/รีเซ็ตรหัสผ่าน")
const MGR = { M: 'allow', L: '403', Me: '403', W: '403' } as const
export const rows: AuthzRow[] = [
  { id: 'PERM-01a', spec: '§3.2 สร้างพนักงาน', action: 'createEmployee', mutates: true, audit: { entity: 'user' }, expect: MGR,
    run: () => createEmployee({ name: 'Nok Test', email: `nok-${crypto.randomUUID()}@example.com`, positionId: null,
      role: 'worker', password: 'Start-pass-99' }) },
  { id: 'PERM-01b', spec: '§3.2 แก้พนักงาน (profile + role + schedule)', action: 'updateEmployee', mutates: true, audit: { entity: 'user' }, expect: MGR,
    setup: () => makeUser({ nickname: 'Target' }),
    run: (_w, t) => updateEmployee({ userId: t.id, name: 'Target Renamed', nickname: 'Tg', email: t.email, positionId: null,
      role: 'manager', schedule: [{ weekday: 1, fractionCd: 50 }] }) },
  { id: 'PERM-01c', spec: '§3.2 ปิดใช้งานพนักงาน', action: 'deactivateEmployee', mutates: true, audit: { entity: 'user' }, expect: MGR,
    setup: () => makeUser(), run: (_w, t) => deactivateEmployee({ userId: t.id }) },
  { id: 'PERM-01d', spec: '§3.2 เปิดใช้งานพนักงาน (FR-205)', action: 'reactivateEmployee', mutates: true, audit: { entity: 'user' }, expect: MGR,
    setup: () => makeUser({ deactivated: { on: '2026-09-01' } }), run: (_w, t) => reactivateEmployee({ userId: t.id }) },
  { id: 'PERM-01e', spec: '§3.2 รีเซ็ตรหัสผ่าน (FR-204)', action: 'resetEmployeePassword', mutates: true, audit: { entity: 'user' }, expect: MGR,
    setup: () => makeUser(), run: (_w, t) => resetEmployeePassword({ userId: t.id, password: 'Reset-pass-77' }) },
]
// rows/positions.ts (PERM-02 positions part): 02a createPosition · 02b renamePosition · 02c movePosition (setup: 2 positions, move the 2nd up)
//   · 02d deletePosition (unused) · 02e restorePosition (setup: create + delete directly, then restore) — all MGR, audit { entity: 'position' }
// rows/account.ts: ACC-01 changeOwnPassword({ currentPassword: actor.password, newPassword: 'Changed-pass-42', confirmPassword: same })
//   expect all 'allow', audit { entity: 'user' }, allowMustChange: true · ACC-02 signOutEverywhere({}) all 'allow', audit user, allowMustChange
// rows/preferences.ts: PREF-01 setPreference({ key: 'theme', value: 'dark' }) all 'allow', mutates true, audit: false (X44/X05)
//   · PREF-02 setPreference({ key: 'grid.unit', value: 'DAYS' } as never) all '400', mutates false
// rows/auth-endpoints.ts (BA-*, real cookies via signInHttp(actor.email, TEST_PASSWORD); run returns the Response):
//   BA-01 POST /api/auth/sign-up/email (no cookie) all '404' · BA-02 POST /update-user {name:'x'} all '404'
//   · BA-03 POST /change-password all '404' · BA-04 POST /admin/set-role {userId: w.outsider.id, role:'manager'} all '404'
//   · BA-05 POST /admin/create-user all '404' · BA-06 POST /admin/ban-user all '404' · BA-07 POST /admin/remove-user all '404'
//   · BA-08 POST /revoke-sessions all '404' (our action replaces it) — mutates false
```

Also in `tests/authz/matrix.int.test.ts` (AZ-2 meta-test): `T-META-01` import every module in `src/server/actions/*.ts`;
every exported function name appears as some row's `action` or in the documented allowlist `['login', 'logout']`
(covered by `tests/integration/auth.int.test.ts` / `src/server/actions/auth.int.test.ts`). Rows whose `action` is a
route (`'<METHOD> /api/…'`) or a loader (`'services.…'`) are ignored here; M2's AZ-2 (`tests/authz/coverage.int.test.ts`)
adds the route-handler side.

**S4.2 `tests/integration/auth.int.test.ts`** (FR-101, FR-103, AC-102, NFR-08a/b). T-AUTH-01 `POST /api/auth/sign-up/email`
→ 404, `count(user)` unchanged, and `auth.api.signUpEmail(...)` rejects (`EMAIL_PASSWORD_SIGN_UP_DISABLED` or 404) — AC-102;
T-AUTH-02 `makeUser({ email:'cindy@example.com' })` then `signInHttp('  CINDY@example.com ', …)` via the `login` action
(trim + lowercase) succeeds; T-AUTH-03 wrong password → login action `{ ok:false, code:'INVALID_CREDENTIALS', message:
th.auth.errors.INVALID_CREDENTIALS }`; unknown email → the same code (no enumeration); T-AUTH-04 Set-Cookie of a sign-in has
`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` and no `Secure` with `SECURE_COOKIES=false`; T-AUTH-04b with
`vi.resetModules(); vi.stubEnv('SECURE_COOKIES','true')` re-imported `auth` → cookie `__Secure-better-auth.session_token` with
`Secure`; T-AUTH-05 after sign-in the session row `expires_at` ≈ now + 7 d (±60 s); T-AUTH-06 `account.password` matches
`/^[0-9a-f]{32}:[0-9a-f]{128}$/` (Better Auth scrypt, NFR-08a) and `verifyPassword` accepts it.

**S4.3 `tests/integration/lockout.int.test.ts`** (FR-106, M1-D11; `plan/research/snippets/r2/app/scripts/lockout-api.ts`).
T-LOCK-01 5 × wrong password from `10.0.0.9` → each `401:INVALID_EMAIL_OR_PASSWORD`; 5 rows in `auth_login_failures`;
T-LOCK-02 6th attempt with the **correct** password from `10.0.0.9` → `429:LOGIN_LOCKED` with message
`th.auth.errors.LOGIN_LOCKED`; T-LOCK-03 same email from `10.0.0.10` → `200`; T-LOCK-04 another email from `10.0.0.9` →
not locked; T-LOCK-05 `update auth_login_failures set created_at = created_at - interval '16 minutes'` → correct password
→ `200` and that key's rows are deleted; T-LOCK-06 the server-action path (`login` action with `setTestHeaders({
'x-forwarded-for': '10.0.0.9' })`) is locked too → `{ code:'LOGIN_LOCKED' }`; T-LOCK-07 an unknown email accumulates
failures and locks the same way; T-LOCK-08 a banned user's correct password → `ACCOUNT_DEACTIVATED` and records no failure.

**S4.4 `tests/integration/proxy.int.test.ts`** (FR-103, AC-101, AC-103, R18). Call `proxy(new NextRequest(url, { headers }))`
directly. T-SESS-01 no cookie: `/` → 307 `location` ends with `/login`; `/home` → `/login`; `/settings/employees` →
`/login?next=%2Fsettings%2Femployees`; T-SESS-02 valid cookie → not a redirect, response has `content-security-policy`;
`/login` without cookie → no redirect (public, no session lookup); T-SESS-03 `mustChangePassword` user:
`/settings/employees` → 307 `/account/password?next=%2Fsettings%2Femployees`, `/home` → 307 `/account/password`,
`/account/password` → passes; T-SESS-04 session aged 2 days (`update session set expires_at = now() +
interval '5 days'`) → response carries `set-cookie: better-auth.session_token=…` and DB `expires_at` ≈ now + 7 d;
T-SESS-05 session aged 12 h (`expires_at = now() + interval '6 days 12 hours'`) → no `set-cookie`, `expires_at` unchanged;
T-SESS-06 session row deleted → 307 `/login` and `set-cookie` clears the token (`Max-Age=0`).

**S4.5 `tests/integration/gate.int.test.ts`** (FR-104, AC-103, ACT-1). T-GATE-10 for every M1 action except `login`,
`logout`, `changeOwnPassword`, `signOutEverywhere`, as a `mustChangePassword` worker → `MUST_CHANGE_PASSWORD`;
T-GATE-11 `changeOwnPassword` as that user succeeds, sets `must_change_password=false`, keeps the current session token and
deletes another session (`makeSession`), and the next `getSession` with the current cookie reports `mustChangePassword: false`.

**S4.6 `tests/integration/account.int.test.ts`** (FR-105, FR-107). T-ACC-01 wrong current → `INVALID_PASSWORD`, fieldErrors
on `currentPassword`; T-ACC-02 new = `'Short1'` → `VALIDATION` (TOO_SHORT); T-ACC-03 new = email local part → `VALIDATION`
(EQUALS_EMAIL); T-ACC-04 new = current → `VALIDATION` (SAME_AS_CURRENT); T-ACC-05 success → old password rejected by
`signInApi`, new accepted; audit row `after = { passwordChanged: true }` and `JSON.stringify(audit row)` contains neither
password; T-ACC-06 `signOutEverywhere` with 3 sessions → 0 sessions; old cookies → `getSession` null; one audit row.
`tests/integration/preferences.int.test.ts` (X05): T-PREF-01 `setPreference({ key:'theme', value:'dark' })` →
`getPreferences(db, me)` = `{ theme:'dark', 'sidebar.collapsed': false }`; T-PREF-02 then `sidebar.collapsed: true` keeps
`theme:'dark'` (jsonb merge); T-PREF-03 no `audit_log` row is written; a row with `data = '{"theme":"neon","x":1}'` reads
back as `DEFAULT_PREFERENCES`; T-PREF-04 `refresh()` is not called.

**S4.7 `tests/integration/employees.int.test.ts`** (FR-201…FR-207, AC-104, AC-201, AC-202, AC-203 M1 part).
T-EMP-01 `createEmployee` (as manager) → user (id is a v4 UUID, email lowercased, role worker, `must_change_password` true,
colour ∈ `USER_COLORS`), credential account (`accountId = userId`), schedule rows Mon–Fri `'1.00'`; `signInHttp` with the
initial password → 200 and session `mustChangePassword: true` (AC-201, AC-103); T-EMP-01b `mustChangePassword:false` stored
false (FR-203); T-EMP-02 the action result keys are exactly `['ok','userId']` and no audit/`after` field contains the password
(AC-202); duplicate email in different case → `CONFLICT` with `fieldErrors.email`; T-EMP-03 reset password → all 2 sessions
gone, `must_change_password` true, old password rejected, new accepted (FR-204); T-EMP-04 deactivate (APP_NOW
2026-09-30) → `banned` true, `ban_reason` `'DEACTIVATED'`, `deactivated_on` `'2026-09-30'`, sessions 0; `signInApi`
correct password → `403:BANNED_USER`; `login` action → `ACCOUNT_DEACTIVATED`; `proxy` with the old cookie → 307 `/login`
(AC-104); the user's `work_schedules` rows and `position_id` are unchanged (history kept, FR-205); T-EMP-05 reactivate →
`banned` false, `ban_reason`/`ban_expires`/`deactivated_on` null, sign-in 200; T-EMP-06 `listAssignableUsers()` excludes a
deactivated user and includes them again after reactivation (AC-203 M1 part, X12); T-EMP-07 manager deactivating self →
`SELF_DEACTIVATE` (even with another active manager); T-EMP-08 single active manager demotes self via
`updateEmployee(role:'worker')` → `LAST_MANAGER`; with a second active manager the same call succeeds (self-demotion
allowed); T-EMP-09 race (FR-206) — call the **services** directly (no global session mock involved): two active managers
A, B; `Promise.allSettled([db.transaction((tx) => updateEmployee(tx, A, demote B)), db.transaction((tx) => updateEmployee(tx, B, demote A))])`
→ exactly one fulfilled, the other rejected with `LAST_MANAGER`; repeat with `deactivateEmployee` A↔B; ≥ 1 active manager
remains in both cases; T-EMP-10 role change takes effect on the next request without revoking sessions: B signs in via
`signInHttp` (cookie), A demotes B, `auth.api.getSession({ headers: cookie })` still returns B's session with
`user.role === 'worker'`; `asUser` with that mapped user → `createEmployee` → `FORBIDDEN`; T-EMP-11 `updateEmployee` schedule
`[{1,100},{3,50},{5,100}]` → rows `1:'1.00', 3:'0.50', 5:'1.00'` only; `[]` → `VALIDATION`; T-EMP-12 every action above calls
`refresh()` once on success (mocked `next/cache`) and never on failure; T-EMP-13 (ACT-3, one transaction) calling the
service `createEmployee` inside `db.transaction` with schedule `[{ weekday: 8, fractionCd: 100 }]` (bypassing zod) fails
with 23514 and leaves **no** `user`, `account`, `work_schedules` or `audit_log` row.

**S4.8 `tests/integration/positions.int.test.ts`** (FR-208). T-POS-01 create appends at the end; T-POS-02 duplicate name
→ `CONFLICT` with `fieldErrors.name`; T-POS-03 rename; T-POS-04 move up/down changes `ORDER BY position, id`; T-POS-05
delete unused → row gone, result `deleted` = `{ id, name, position }`; T-POS-06 delete used by 1 active + 1 deactivated user →
`IN_USE` with message `th.positions.inUse(2)`; T-POS-07 restore → same id/name/key back in the same order; restore after a new
position took the name → `CONFLICT` (`th.positions.restoreConflict`); T-POS-08 `positions.position` has collation `C`
(`select collation_name from information_schema.columns where table_name='positions' and column_name='position'` → `'C'`).

**S4.9 `tests/integration/bootstrap.int.test.ts` + `seed-golden.int.test.ts`** (FR-102, §10.4, X11).
T-BOOT-01 empty DB + `INITIAL_MANAGER_*` (`boss@example.com`, `Boss`, `Initial-pass-1`) → 1 user, role `manager`,
`must_change_password` true, Mon–Fri schedule, `signInApi` succeeds; T-BOOT-02 6 positions in `DEFAULT_POSITIONS` order;
T-BOOT-03 second run → no new rows, `account.password` byte-identical (never touches passwords); T-BOOT-04 users exist +
different env → manager not created; T-BOOT-05 env missing: `NODE_ENV=development` → warning, `fatal` undefined;
`NODE_ENV=production` → `fatal` set; T-BOOT-06 `INITIAL_MANAGER_PASSWORD='boss@example.com'`-like policy violation → `fatal`,
no user; the spy on `console.*` never receives the password string (all cases).
T-SEED-01 `seedGolden(db)` → 6 positions (JSON order), 6 users, 6 credential accounts, 30 `work_schedules` rows (all
`'1.00'`, weekdays 1–5), every `must_change_password` false, manager `role='manager'`, others `worker`, `name`/`nickname`
from JSON ("Demo Manager"/"Manager"); T-SEED-02 every golden user signs in with `demo1234`; one distinct hash value shared
(`count(distinct password) = 1`); T-SEED-03 `truncateAll` + `seedGolden` twice → identical counts; 6 `audit_log` rows with
`entity='user', action='create', actor_id is null`.

**S4.10 `src/server/db/schema.int.test.ts`** (the single schema suite that M0 creates and M2–M8 extend) (§6.2 + PLAN §1.3). T-SCHEMA-01 `"user"` has `ban_expires timestamptz`,
`deactivated_on date`, `banned` default false; `session.impersonated_by` exists; T-SCHEMA-02 indexes `user_name_trgm`,
`user_nickname_trgm` exist and use `gin_trgm_ops`; T-SCHEMA-03 every timestamp column in the M1 tables is
`timestamp with time zone`; T-SCHEMA-04 `work_schedules` rejects weekday 8 and fraction `0` (23514); T-SCHEMA-05
`pnpm auth:check` equivalent is covered at G2 (documented here, not executed in Vitest).

**S4.11 E2E support.**
- `e2e/fixtures.ts` (extend M0's; X91 signature, later milestones only add option fields):
  ```ts
  export type ResetDbOptions = { extras?: (tx: Tx) => Promise<unknown> }   // M6 syntheticGrid, M7 dayExample, M8 milestones, M9 alsoFixtures
  export async function resetDb(fixture?: FixtureId, opts: ResetDbOptions = {}): Promise<void>
  ```
  = `createScriptDb(E2E.databaseUrl)` → one transaction `truncateAll(tx)` + `seedGolden(tx)` (+ `applyFixture(tx, fixture)`
  from M5) + `opts.extras?.(tx)` → `close()`, then `rmSync(path.resolve(E2E.uploadDir), { recursive: true, force: true })`
  (X91: `UPLOAD_DIR` is emptied on every reset from M1 on, so M4 adds nothing here). `FixtureId` comes from
  `scripts/lib/fixtures.ts`, where M1 declares `export type FixtureId = never` (only `resetDb()` / `resetDb(undefined, { extras })`
  type-check) and M5 widens it to `'F2' | 'F3' | 'F4'`. Call it as `test.beforeAll(async () => { await resetDb(…) })` —
  never `beforeAll(resetDb)` (Playwright would pass its fixtures object as `fixture`) and never `beforeAll(resetDb(…))`.
  `loginAs(page, who: 'manager' | 'cindy' | 'ivy' | 'peter' | 'jack' | 'mint')` =
  `page.request.post('/api/auth/sign-in/email', { data: { email: `${who}@example.com`, password: 'demo1234' }, headers: { origin: baseURL } })`
  + `expect(res.ok()).toBe(true)`; keep M0's named guards and the auto fixture unchanged, and the clock pin
  (`page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto`).
- Page objects: `e2e/pages/login.ts` (`goto(next?)`, `login(email, password)`, `error()` = `getByRole('alert')`),
  `e2e/pages/account.ts` (`changePassword(current, next)`, `signOutEverywhere()`), `e2e/pages/settings.ts`
  (`EmployeesPage`: `goto()`, `row(nameOrNickname)`, `openCreate()`, `fillCreate({...})`, `generatePassword()`,
  `submit()`, `copyCreatedPassword()`, `closeDialog()`, `rowAction(name, th.employees.actions.deactivate)`, `search(q)`,
  `filterPosition(label)`, `filterStatus(label)`; `PositionsPage`: `goto()`, `add(name)`, `rename(old, new)`,
  `moveUp(name)`, `delete(name)`, `names()`), `e2e/pages/shell.ts` (`openUserMenu()`, `chooseTheme(label)`,
  `logout()`, `toggleSidebar()`). Selectors: `getByRole`/`getByLabel`/`getByText` with strings from `th`.

**S4.12 `e2e/m1-auth.spec.ts`** — outline in §7.3; `test.beforeAll(async () => { await resetDb() })`; `test.describe.configure({ mode: 'serial' })`.

**S4.13 Update older specs.** `e2e/m0-smoke.spec.ts`: call `loginAs(page, 'manager')` before visiting `/home` (the shell
is now behind the session gate); keep its CSP/no-external-request/font assertions; add `resetDb()` in `beforeAll`.

**S4.14 Done-check.** `pnpm db:up` · `pnpm vitest run --project integration tests` (failures before S2 lands must all be
`NOT_IMPLEMENTED`/`INTERNAL`, listed in the report) · `pnpm exec playwright test --list` (both specs discovered) ·
`pnpm eslint tests e2e` · `pnpm typecheck` (own paths).

---

## 6. Integration (orchestrator)

**Expected requests.** S2 → S0-owned files: extra `ErrorCode`s or `th.errors`/`th.audit` keys (apply with Edit); S2 →
`package.json` if any extra dev dependency is needed (should be none). S3 → `src/lib/schemas/*` message tweaks; S3 → S2 if
a page needs a read service not listed (none expected: `listEmployees`, `listPositions`, `getPreferences`,
`toCurrentUserDTO`). S4 → S2/S3: test ids (`data-testid`) only if a role/label selector is impossible (prefer fixing the
label). S4 → S0: helper additions in `tests/helpers/**` it owns anyway after G0.

**Wiring order.** (1) apply requests; (2) `pnpm install` if the lockfile changed; (3) confirm S2 replaced every
`NOT_IMPLEMENTED` (`grep -rn NOT_IMPLEMENTED src scripts` → only the helper definition); (4) G2.

**G2 commands.**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                    # must print "No schema changes, nothing to migrate"
pnpm exec drizzle-kit check         # "Everything's fine"
pnpm auth:check                     # "Schema check passed against the configured Drizzle schema."
pnpm check                          # typecheck + lint + unit + ui + integration (+ domain coverage ≥ 95 %)
pnpm test:e2e                       # m0-smoke + m1-auth against the production build on :3100
git diff --exit-code CLAUDE.md SPEC.md docs/
grep -rn "localStorage\|randomUUID" src/components src/hooks src/app --include=*.tsx --include=*.ts   # must be empty
```
If `next build` fails with a `server-only` error originating in the proxy bundle, check M1-D4: `auth.ts`/`db/client.ts`
must not import `server-only` (risk R-M1-3).

---

## 7. Verification

### 7.1 AC → test map

| AC | Automated tests (file › id) |
|---|---|
| AC-101 | `tests/integration/proxy.int.test.ts` › T-SESS-01 · `e2e/m1-auth.spec.ts` › E2E-01 |
| AC-102 | `tests/integration/auth.int.test.ts` › T-AUTH-01 · matrix BA-01 · E2E-02 |
| AC-103 | proxy › T-SESS-03 · `tests/integration/gate.int.test.ts` › T-GATE-10, T-GATE-11 · `src/server/action.int.test.ts` › T-GATE-02 · route › T-GATE-04 · matrix "mustChangePassword → 403" loop · E2E-03 |
| AC-104 | `tests/integration/employees.int.test.ts` › T-EMP-04 · E2E-04 |
| AC-201 | employees › T-EMP-01 · E2E-05 |
| AC-202 | employees › T-EMP-02 · `EmployeeFormDialog.test.tsx` › U-FORM-03 · E2E-06 |
| AC-203 (M1 part; closes in M6, X12) | employees › T-EMP-06 (assignable query) · T-EMP-04 (login blocked, sessions revoked) · E2E-04 ("ปิดใช้งาน" chip) — picker clauses: `e2e/m2-projects.spec.ts`, `e2e/m3-tasks.spec.ts`; grid clause: `e2e/m6-grid.spec.ts` (PROGRESS › Known issues until M6) |

FR coverage beyond the ACs is listed per row in §1.2.

### 7.2 Authz matrix rows added (`tests/authz/rows/*.ts`)

| ID | Action / route | M | L | Me | W | Mutates (audit) |
|---|---|---|---|---|---|---|
| PERM-01a | `createEmployee` | allow | 403 | 403 | 403 | yes (`user`) |
| PERM-01b | `updateEmployee` (profile + role + schedule) | allow | 403 | 403 | 403 | yes (`user`) |
| PERM-01c | `deactivateEmployee` | allow | 403 | 403 | 403 | yes (`user`) |
| PERM-01d | `reactivateEmployee` | allow | 403 | 403 | 403 | yes (`user`) |
| PERM-01e | `resetEmployeePassword` | allow | 403 | 403 | 403 | yes (`user`) |
| PERM-02a | `createPosition` | allow | 403 | 403 | 403 | yes (`position`) |
| PERM-02b | `renamePosition` | allow | 403 | 403 | 403 | yes (`position`) |
| PERM-02c | `movePosition` | allow | 403 | 403 | 403 | yes (`position`) |
| PERM-02d | `deletePosition` (unused) | allow | 403 | 403 | 403 | yes (`position`) |
| PERM-02e | `restorePosition` | allow | 403 | 403 | 403 | yes (`position`) |
| ACC-01 | `changeOwnPassword` (own) | allow | allow | allow | allow | yes (`user`), allowed while mustChange |
| ACC-02 | `signOutEverywhere` (own) | allow | allow | allow | allow | yes (`user`), allowed while mustChange |
| PREF-01 | `setPreference` theme | allow | allow | allow | allow | yes, **not audited** (X44) |
| PREF-02 | `setPreference` unknown key | 400 | 400 | 400 | 400 | no |
| BA-01…08 | Better Auth `/sign-up/email`, `/update-user`, `/change-password`, `/admin/set-role`, `/admin/create-user`, `/admin/ban-user`, `/admin/remove-user`, `/revoke-sessions` | 404 | 404 | 404 | 404 | no |
| (loop) | every non-BA row as nobody | 401 | 401 | 401 | 401 | — |
| (loop) | every non-BA row as a mustChange user | 403 unless `allowMustChange` | | | | — |
| SET-01 (e2e) | `/settings/employees`, `/settings/positions` pages | 200 | 404 | 404 | 404 | — (E2E-12/E2E-15) |

`logout` and `login` are covered in `tests/integration/auth.int.test.ts`/`src/server/actions/auth.int.test.ts` (they need
real cookies). Reads of positions for pickers arrive with their consumers (M2+); they are open to every logged-in user.

### 7.3 E2E scenario outline (`e2e/m1-auth.spec.ts`)

Deterministic per PLAN §4.5: `test.beforeAll(async () => { await resetDb() })`; serial mode; `page.clock.setFixedTime('2026-09-30T10:00:00+07:00')`
before each first `goto`; server `APP_NOW` from the webServer env; strings from `th`; page objects from §S4.11; no sleeps.

| ID | Steps | Assertions |
|---|---|---|
| E2E-01 (AC-101) | new context → `goto('/')`; then `goto('/settings/employees')`; log in as manager from that page | first URL is `/login`; second is `/login?next=%2Fsettings%2Femployees`; heading `th.auth.loginTitle`; hint `th.auth.noSignUp` visible and no sign-up link/route; after login the browser lands on `/settings/employees` (X32) |
| E2E-02 (AC-102) | `request.post('/api/auth/sign-up/email', { data: { email:'x@example.com', password:'Abcdef-123', name:'X' } })`; then UI login with it | `expect([400, 404]).toContain(status)` (404 from `disabledPaths`); login shows `th.auth.errors.INVALID_CREDENTIALS` |
| E2E-03 (AC-103, FR-104/105) | manager creates worker "Nok Test" `nok@example.com` with typed password `Start-pass-99` (mustChange default checked); new context: login as nok | lands on `/account/password` with `th.account.mustChangeBanner`; `goto('/home')` → back on `/account/password`; submit new = `nok` → `EQUALS_EMAIL` message; new = `Start-pass-99` → `SAME_AS_CURRENT`; mismatch → `MISMATCH`; valid `Nok-pass-2026` → `/home` |
| E2E-04 (AC-104, AC-203 M1) | context A: `loginAs('cindy')`, open `/home`; context B (manager): employees page → Cindy row → `th.employees.actions.deactivate` | toast `th.employees.deactivated('Cindy')` with `th.undo.undo`; Cindy row chip `th.employees.status.deactivated`; A reload → `/login`; A UI login as cindy → `th.auth.errors.ACCOUNT_DEACTIVATED`; B reactivates Cindy (row menu) → chip `ใช้งาน`, A can log in again |
| E2E-05 (AC-201, FR-202) | manager → `th.employees.add` → fill "Ploy Test" `ploy@example.com` → `th.employees.generatePassword` → submit → success step → `th.employees.copyPassword` | `page.evaluate(() => navigator.clipboard.readText())` = the shown 12-char password; new context logs in with it → `/account/password` |
| E2E-06 (AC-202) | after E2E-05 close the dialog; reopen `th.employees.add`; reload the page | password field empty; `page.content()` does not contain the copied password |
| E2E-07 (FR-207, FR-201 edit) | edit Ploy: untick Fri, set Wed 0.50, position Designer | row schedule summary shows จ อ พ(0.50) พฤ; position "Designer" |
| E2E-08 (FR-107) | jack in contexts A and B; A: `/account/password` → `th.account.signOutEverywhere` | A on `/login`; B reload → `/login` |
| E2E-09 (FR-105) | peter changes own password (wrong current → `th.errors.INVALID_PASSWORD`; then valid) | logout, old password rejected, new accepted |
| E2E-10 (FR-106) | 5 wrong UI logins as ivy@example.com, then the correct `demo1234` | 5 × `th.auth.errors.INVALID_CREDENTIALS`; 6th shows `th.auth.errors.LOGIN_LOCKED` (ivy is not used afterwards) |
| E2E-11 (FR-208, X04) | manager `/settings/positions`: add "DevOps", rename to "Platform", move up, delete → click `th.undo.undo`; delete again → `ControlOrMeta+z` with focus on the page body; delete "QA" | order changes; toast `th.positions.deleted('Platform')`; row back after undo and after Cmd+Z; "QA" delete shows `th.positions.inUse(1)` and stays |
| E2E-12 (FR-209, X41) | manager employees page: search "pat"; clear; filter position Designer; reset; filter status `th.employees.status.deactivated`, then `th.employees.status.active`; worker (mint) `goto('/settings/employees')` and `goto('/settings/positions')` | only Peter; Jack and Ploy (E2E-07 moved Ploy); `th.employees.noMatch` (Cindy was reactivated in E2E-04); 8 rows (6 golden + Nok + Ploy); both worker responses have status 404 |
| E2E-13 (§8.1, X05) | user menu → `th.prefs.themes.dark`; `page.waitForResponse(r => r.request().method() === 'POST' && !!r.request().headers()['next-action'])`; reload; user menu → `th.nav.logout` | `<html>` has class `dark` after reload; logout lands on `/login` and `goto('/home')` redirects back to `/login` |
| E2E-14 (X33) | `ControlOrMeta+Backslash` collapses the sidebar; wait for the action response; reload | still collapsed |
| E2E-15 (settings nav) | worker (`loginAs('mint')`) and manager (`loginAs('manager')`) open `/home` | worker sees no `th.nav.settings` link; manager sees it and it opens `/settings/employees` |

**Update older specs (S4.13):** `e2e/m0-smoke.spec.ts` now logs in (`loginAs(page, 'manager')`) before opening `/home`,
because every shell page is behind the proxy session gate; its CSP / no-external-request / self-hosted-font assertions
are unchanged. Page objects added in M1 (`e2e/pages/{login,account,settings,shell}.ts`) are the only place later specs
touch these screens.

### 7.4 Golden / perf / manual checks

- Golden: T-SEED-01..03 (M1 stage of `seedGolden`: 6 positions, 6 users, 30 schedule rows, one hash). No load figures yet.
- Perf: none in M1 (proxy adds ~2 small queries per navigation — acceptable at ≤ 100 users, r2 §2.6).
- Manual (orchestrator, once): `pnpm db:reset && INITIAL_MANAGER_EMAIL=… pnpm bootstrap` → log in → forced change →
  create an employee with "สุ่มรหัส" over plain HTTP via the LAN IP (copy fallback works without a secure context); switch
  the OS keyboard to Thai Kedmanee and press Ctrl/Cmd+Z after a position delete (undo still fires, X49).

---

## 8. Definition of done

- [ ] SPEC §12 M1: §4.1 + §4.2 complete; Better Auth + admin plugin; bootstrap; `/login`, `/account/password`,
  `/settings/employees`, `/settings/positions`; `authz.ts` first functions (`narrowRole`, `requireUser`, `isManager`, `requireManager`).
- [ ] AC-101…AC-104, AC-201, AC-202 and the M1 part of AC-203 pass (§7.1); AC-203 remainder recorded in `PROGRESS.md › Known issues`.
- [ ] `pnpm check` green (typecheck, lint, unit, ui, integration; domain coverage ≥ 95 %).
- [ ] `pnpm test:e2e` green: `m0-smoke` (updated) + `m1-auth`.
- [ ] `pnpm db:generate` → "No schema changes"; `pnpm exec drizzle-kit check` clean; `pnpm auth:check` exits 0.
- [ ] Matrix rows of §7.2 present and green, including the nobody and mustChange loops; every mutating allow row (except PREF-01) asserts one audit row.
- [ ] Every action begins with an `authz.*` call; multi-table writes in one `db.transaction` with the audit row inside; no audit row contains a password, hash or token.
- [ ] No Thai literal outside `src/i18n/**` (ESLint); no `any`, `@ts-ignore`, or undescribed `eslint-disable`.
- [ ] No confirm dialog added; deletions/deactivations show the 8 s undo toast and react to Cmd/Ctrl+Z.
- [ ] No `localStorage`/`sessionStorage`, no `crypto.randomUUID` in client code, no runtime CDN.
- [ ] `src/domain/**` has no `Date` outside `todayBangkok`; `numericToCd` has no float parsing.
- [ ] Passwords never printed (bootstrap/seed/action logs), never echoed by actions, never stored outside `account.password`.
- [ ] `PROGRESS.md` updated (§10); commit `feat(m1): …`; tag `m1`.

---

## 9. Risks and gotchas

| # | Risk | Mitigation (step) |
|---|---|---|
| R-M1-1 | FR-103 renewal silently fails if only RSC renders read the session (cookies cannot be set there) | DB-validating proxy forwards `Set-Cookie` (S2.4); T-SESS-04/05 (R18) |
| R-M1-2 | Cookie cache would keep banned/revoked sessions valid for up to 5 min | `cookieCache: { enabled: false }` (S0.8); T-EMP-04 asserts immediate logout |
| R-M1-3 | `server-only` imported (directly or transitively) by `auth.ts`/`db/client.ts` breaks `auth check schema`, `tsx` scripts, the Playwright reset and possibly the proxy bundle | M1-D4 boundary (S0.1, S0.5, S2); G2 `pnpm auth:check` + `pnpm seed:golden` + e2e reset prove it |
| R-M1-4 | `adminRoles: ['manager']` without `roles` throws at init | S0.8 passes `ac` + `roles` (r2 §3.1) |
| R-M1-5 | Better Auth does not trim emails; direct inserts with upper case break login | zod `emailField` trims/lowercases (S0.10); T-AUTH-02 |
| R-M1-6 | `/update-user`, `/change-password`, `/admin/*` let users bypass policy/authz | `disabledPaths` list (S2.3) verified against `routes.mjs`; BA-01…08 rows |
| R-M1-7 | `nextCookies()` not last → login cookie not set from the server action | keep it last (S0.8); T-LOGIN-01 asserts the cookie jar |
| R-M1-8 | Lockout counts IP from a spoofable `X-Forwarded-For` when deployed without a proxy | `trustedProxies` from env (S2.3); README note in M11; known limit recorded |
| R-M1-9 | Built-in rate limiter (3 per 10 s on `/sign-in*`) breaks e2e `loginAs` | disabled under `ALLOW_TEST_HOOKS=1`; custom rule 30/60 s in production (S2.3, M1-D11) |
| R-M1-10 | Last-manager race between two managers | `SELECT … FOR UPDATE` of active managers inside the tx (S2.8); T-EMP-09 |
| R-M1-11 | Fractional keys mis-ordered under `en_US.utf8`; equal keys make `generateKeyBetween` throw | `orderKey` COLLATE "C" (S0.4), advisory lock + re-key (S2.9); T-ORD-01, T-POSS-02, T-POS-08 |
| R-M1-12 | `vi.fn` implementations reset by `restoreMocks: true` silently break the session mock | mocks are plain async functions (S0.14) |
| R-M1-13 | Root layout keeps the anonymous theme after login (client navigation keeps layouts) | full navigation after login/logout/password change (M1-D7) |
| R-M1-14 | `unstable_rethrow` missing in Next 16.3.7 | digest-prefix fallback documented in S0.7; T-GATE-05 |
| R-M1-15 | Clipboard/`randomUUID` unavailable over plain HTTP | `copyText` fallback + `getRandomValues` (S1.5, S3.12); manual LAN check (§7.4) |
| R-M1-16 | Thai keyboard layout makes `e.key` Thai for Cmd+Z | `e.code === 'KeyZ'` first (S1.9); U-KEY-01 |
| R-M1-17 | Drizzle migrator silently skips out-of-order journal entries | only S0 generates; G2 re-generate must be a no-op (§6) |
| R-M1-18 | Hook DB writes for lockout run outside the sign-in transaction; parallel bursts can overshoot by a few attempts | accepted (r2 §6.3 "known limits"); documented in PROGRESS › Known issues |

---

## 10. Close-out

**PROGRESS.md updates.**
- Status table: M1 → ✅ with the date; "Milestone ปัจจุบัน" → M2.
- Decisions: the §3.1 X-rows (X01, X02, X04, X05, X10, X11, X12, X32, X33, X40, X41, X44–X49, X51, X53, X60, X80, X86, X87, X91, X93, X96) and every
  M1-D row of §3.2 (date, SPEC ref, decision, rationale).
- Deviations: M1-D1 (Better Auth tables hand-written instead of CLI-generated; CLI used for `auth check schema`).
- Known issues: AC-203 picker clauses (M2/M3) and grid label (M6) still open; FR-106 IP part spoofable without a reverse
  proxy (document in M11 README); lockout may overshoot by a few attempts under parallel bursts; schedules have no
  effective dating (changes apply to past capacity, X60).
- Clear "แผนของ milestone ปัจจุบัน" checklist (all ticked).

**Commit** (orchestrator, after G4 output seen):
```
feat(m1): auth, employees, positions, undo framework

Better Auth email+password (sign-up disabled, admin plugin), DB-validating proxy with 7-day sliding sessions,
forced password change, lockout 5/15 min per IP+email, sign out everywhere; employees (create with one-time random
password, edit, schedule, deactivate/reactivate, reset password, last-manager guard), positions with undo;
dates.ts + units conversions, UndoProvider + Cmd+Z, user_preferences, authz matrix harness, bootstrap, seed:golden users.

FR-101..107, FR-201..210, AC-101..104, AC-201, AC-202, AC-203 (M1 part)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
**Tag:** `git tag m1`.
