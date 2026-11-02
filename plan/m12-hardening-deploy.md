# M12 — Hardening and deploy

> Depends on: M11 ✅ · SPEC: §4.12, §9, §10 (all), §11 (all), Appendix A.2, §12 M12 (+ §3.2 for the audit sweep, §7.8 for v3.1 action names, §7.9 for v3.2 database actions)
>
> **Renumbered 2026-11-01 (SPEC v3.2):** this milestone was M11; ids `M11-Dnn` became `M12-Dnn`. M11 is now "ฐานข้อมูลในหน้าเอกสาร + สมการ"
> (SPEC §4.14–§4.15). Where this file says "M1–M10" / "after M10", read "M1–M11" / "after M11": the audit sweep, `seed:perf`, the perf
> budgets (SPEC §9 database rows) and the regression suite must also cover M11's tables, actions and routes. Those additions are
> written into this file when `plan/m11-database-views.md` exists (PLAN §1.8). `r6b M11-nn` ids cite `plan/research/r6b-gaps-m6-m11.md` and keep their numbers.
> Owner-visible result: `docker compose up` on a clean machine boots the whole stack, the initial manager can log in, a backup file
> appears, `pnpm seed:demo` produces the full Appendix A.2 demo (filled POS charter with live blocks, statuses, a blocker, milestones,
> leave), and every §9 performance budget is measured on `seed:perf` data and recorded in `PROGRESS.md`.

M12 adds **no table, no user-facing feature and no new server action**. It (1) proves FR-1201 audit coverage over every mutating
action and route of M1–M10 with a meta-test, (2) composes the existing fixture builders into `seed:demo` and `seed:perf`,
(3) ships the production Docker stack (Dockerfile, compose, backup, Caddy, README), and (4) verifies the non-functional requirements
(performance, security headers, offline operation, contrast, browsers/viewports) against a production build and the compose stack.

---

## 1. Goal and scope

### 1.1 In scope

IDs follow SPEC (FR/BR/AC) and `plan/research/r7-traceability.md` (NFR-*, DEP-*, SEED-*, A11Y-*).

| ID | Requirement (short) | Implemented in | Tested by |
|---|---|---|---|
| FR-1201 | Audit every change of project, member, task (incl. status changes), status set, blocker, assignment, plan (per batch), milestone, page (per save, no content), leave, employee | S0.4 registry + sweep · S1.1 gap fixes (expected: none) | `tests/authz/audit-coverage.int.test.ts` (AUD-00…AUD-10) + the M1 matrix audit assertion per row |
| FR-1202 | Record only, no audit UI | scope guard (§1.2) | AUD-09 (`grep` no `audit_log` read outside `src/server/audit.ts` + tests) |
| NFR-01 | Data size ≤ 100 people · 300 projects · 20 000 tasks · 5 000 pages · 3 years | S1.6–S1.8 `seed:perf` | `scripts/lib/perf-data.int.test.ts` (scaled) · §7.4 P0 counts on `planner_perf` |
| NFR-02a | Project grid 16 w × 200 rows: response < 500 ms p95 | S3.2 `perf-check.ts` | §7.4 P1 (gate) |
| NFR-02b | Grid render < 300 ms | S3.4 `e2e/perf/m12-perf.spec.ts` | §7.4 PF1 (gate) |
| NFR-03 | Workload 100 people × 12 weeks < 800 ms p95 | S3.2 | §7.4 P2 (gate; manager **and** LEAD viewer) |
| NFR-04 | Cell edit → visible < 50 ms | S3.4 | §7.4 PF2 (gate) |
| NFR-05 | 300-block page opens < 1 s | S1.8 page · S3.4 | §7.4 PF3 (gate) |
| NFR-06 | Command palette first result < 200 ms | S3.4 (reuses M10 `palette.measureFirstResult`) · S3.2 server search | §7.4 PF4 (gate) + P3b server p95 |
| NFR-07a | Chrome, Edge, Safari (2 latest) | Chromium automated; manual Safari/Edge pass (M12-D25) | §7.4 M3 manual |
| NFR-07b | ≥ 1280 px full UI; tablet usable; mobile = home, my tasks, leave, read pages | S4.2 viewport suite | `e2e/m12-hardening.spec.ts` V1–V4 |
| NFR-08a | Better Auth default hashing | (M1) | unchanged — M1 `auth.int.test.ts`; AUD-08 no hash in audit rows |
| NFR-08b | Cookies httpOnly + sameSite=lax; secure with HTTPS | (M1) + prod check | `e2e/m12-hardening.spec.ts` H3 · `e2e/m12-deploy.spec.ts` D1 |
| NFR-08c | Security headers (CSP, frame-ancestors none, nosniff …) | (M0) + verification | `e2e/m12-hardening.spec.ts` H1–H2, H4 · deploy D1 |
| NFR-09 | No CDN/external service at runtime | (M0 guard) + S3.5 source scan + S2.9 offline compose check | `tests/hardening/no-external-urls.test.ts` · `scripts/offline-check.sh` · every e2e (external-request guard) |
| NFR-10 | Backup: daily pg_dump, 14 days + UPLOAD_DIR | S2.4 `backup.sh` | `tests/deploy/files.test.ts` · deploy D3–D4 · §7.4 M1 restore drill |
| DEP-01…06 | Services db, migrate, app, backup, caddy (profile `tls`); named volumes | S2.2–S2.5 | `tests/deploy/files.test.ts` · `scripts/deploy-smoke.sh` + `e2e/m12-deploy.spec.ts` |
| DEP-07 (final) | `.env.example` documents every variable | S0.6 | M0 `env.test.ts` (`.env.example ⊇ ENV_KEYS`) + `tests/deploy/files.test.ts › env.example` |
| DEP-12 | `backup.sh`: `db-YYYYMMDD.dump` + `uploads-YYYYMMDD.tgz`, delete > 14 days | S2.4 | deploy D3–D4 · `tests/deploy/backup.test.ts` (sh in `postgres:17`) |
| DEP-13 | README: install, bootstrap, backup/restore, upgrade (+ offline, TLS, troubleshooting) | S2.6 | §7.4 M2 README walk-through · restore drill D4 |
| DEP-14 | Dockerfile deps → builder → runner (`node:22-alpine`, standalone, non-root) | S2.1 | S2.1 done-check · deploy smoke |
| DEP-15 / §12 "Done when" | Clean machine: `docker compose up` → initial-manager login, all e2e green, backup file exists | S2.7 + S4.3 | `scripts/deploy-smoke.sh` running `e2e/m12-deploy.spec.ts` · G2 full suite |
| FR-102 (M12 part) | Compose `migrate` runs bootstrap; first manager logs in and must change password | S2.3 | deploy D1 |
| SEED-A2 | `seed:demo` = golden + A.2 (milestones, Kickoff DAY task, nested task, Peter leave, pages) + v3.1 statuses/blocker | S1.2–S1.5 | `scripts/lib/demo.int.test.ts` (DM-01…DM-12) |
| BR-31 (seed) | A.2 nested task respects BR-31 (X69) | S1.3 | DM-04 |
| SEED-PERF | `seed:perf` at NFR-01 scale | S1.6–S1.8 | `scripts/lib/perf-data.int.test.ts` · §7.4 P0 |
| A11Y-3 (audit) | Contrast ≥ 4.5:1 both schemes; every token pair covered | S3.6 | `tests/hardening/token-coverage.test.ts` + the existing contrast unit test |
| ARC-04 / OWN-3 / §1.7 | No forbidden package (AFFiNE/BlockSuite, `@blocknote/xl-*`, MinIO, …) | S3.7 | `tests/hardening/forbidden-deps.test.ts` |

**SPEC §3.2 permission rows in scope:** none new. M12 adds no action or route, so no new PERM row (PERM-01…23 unchanged). The audit
sweep (S0.4) re-reads **every** existing row of `tests/authz/rows/**` and requires that each mutating action/route has at least one
`allow` row with an audit assertion (X44).

### 1.2 Out of scope (do not build)

| Item | Where it lands |
|---|---|
| Audit log UI / any reader of `audit_log` | SPEC §13 Phase 2 #12 |
| Trash UI, automatic 30-day purge | SPEC §13 #9 |
| Real-time editing, live milestone block, push updates | SPEC §13 #1, #2 |
| Cost / rate card | SPEC §13 #14 (owner must confirm) |
| Seeding holidays (also not in demo) | never (SPEC §10.4 step 4, D9) |
| Strict `style-src` with nonces for Emotion/BlockNote/Mantine | Known issue (optional future hardening, M12-D24) |
| Automated Safari/WebKit runs, Firefox | manual (M12-D25); post-MVP |
| Off-host backup shipping, monitoring/alerting, HA/replicas | owner's infrastructure (README guidance only) |
| Node 24 / ESLint 10 upgrades | future Decision (PLAN R22) |
| New indexes or schema for performance | only if a §9 budget fails — then a fix round in which the orchestrator generates the migration (PLAN §2.3 rule 8) |
| Any AFFiNE/BlockSuite code, package, image or data (`affine/` folder) | never (PLAN §1.7, HANDOFF §6) |

### 1.3 Carried-in items (deferred to M12 by earlier milestones)

| From | Item | Where in M12 |
|---|---|---|
| M0 | Production `docker-compose.yml`, `Dockerfile`, `.dockerignore`, Caddy, `backup.sh`, README; external-URL check; strict style CSP (optional) | S2.1–S2.6 · S3.5 · M12-D24 |
| M1 | `serverActions.allowedOrigins` decision, reverse-proxy docs, XFF/`TRUSTED_PROXIES` notes (R-M1-8), compose `migrate` running bootstrap, `seed:demo` | M12-D19 · S2.6 README §8/§10 · S2.3 · S1.2 |
| M2 | Sidebar with 300 projects (perf) | §7.4 P4 (`GET /api/sidebar`) |
| M3 | `GET /api/tasks` over 20 000 tasks; revisit list virtualisation if slow (M3-D16) | §7.4 P3 · M12-D12 |
| M4 | Demo pages (`addDemoPages`), full perf on 5 000 pages, mobile/tablet suite, strict style-src (optional) | S1.4 · S1.7 · S4.2 · M12-D24 |
| M5 | `seed:demo` leave (A.2) | S1.2 (`applyFixture('F3')`, M12-D5) |
| M6 | `seed:perf` full scale reusing `addSyntheticGridProject`; perf pass vs §9 (C22) | S1.6 · S3.2/S3.4 |
| M7 | Full perf incl. day zoom | §7.4 P1d (informational) |
| M8 | `seed:demo` calls `addMilestones` after `addDayExample`; audit sweep covers milestone actions + task binding (C30) | S1.2 · S0.4 |
| M9 | NFR-03 full measurement reusing `addSyntheticWorkload`; no new M9 action (C43) | S1.6 · S3.2 |
| M10 | Audit sweep (M10 adds no mutating action); perf of search/palette/embeds on `seed:perf`; mobile/tablet suite; demo charter keeps the live blocks (C4) | S0.4 · S3.2/S3.4 · S4.2 · S1.4 |
| M3–M6 seeds | Count tests are relative to `seedGolden` (C3, C23) | M12-D28 (demo tests measure deltas) |

---

## 2. Read first

- **SPEC:** §0–§3 (always), §4.12, §7.8 (v3.1 action list), §9, §10.1–10.6, §11.1–11.4, §12 M12, Appendix A.2 (+ A.1 for totals), App. B.1–B.3 (templates being filled).
- **PLAN.md:** §1.2 (versions, forbidden packages), §1.3 (Next standalone, CSP, build-time env, migrator), §1.4 X11, X25, X40, X44–X46,
  X51–X56, X59, X65, X69–X73, X75, X78; §2 (operating model; streams never run `next build`/`next dev`/Playwright); §3.2 scripts;
  §3.4.6 audit; §3.12 security/env/files; §3.13 seeds; §4.4 (matrix + audit assertion); §4.5 e2e; §6 R9, R10, R13.
- **Neighbouring plans (names reused, verify in S0.1):** `m01` S0.9 (`audit.log`, `AuditEntity`), S4.1 (`AuthzRow`, matrix, T-META-01),
  S2.12–S2.13 (`runBootstrap`, `seedGolden`, `createScriptDb`, `truncateAll`, `assertNotProduction`); `m00` S0.11–S0.12 (dev compose,
  `scripts/lib/migrate.ts#runMigrations`), S1.1 (`env.ts`), S1.6 (`/api/health`), S3.4 (e2e guards); `m03` M3-D39, S2.3/S2.6/S2.14/S2.15
  (`createTask` FR-610, `services/taskStatus.ts#setStatus`, `ensureProjectStatuses`, `taskBlockers.addTaskBlocker`, `DEFAULT_STATUSES`; audit written by actions); `m04` S0.12/S1.1/S1.9
  (`storage.ts`, `services/files.ts#storeUpload`, `services/pages.ts#savePageContent`/`renamePage`, `services/page-tree.ts#createPage`
  (no title in `createPageSchema`), `ensureProjectCharters`, `one_charter_per_project`, §7.2 route-row `action` format); `m05` S2.10 (`applyFixture`); `m06` S0 (`addSyntheticGridProject`, `ALLOCATION_AUDIT_ENTITY`, perf marks
  `grid:first-data`/`grid:painted`); `m07` S0.7 (`addDayExample`); `m08` S0 (`addMilestones`, `MILESTONE_AUDIT_ENTITY`, M8-D3, M8-D21);
  `m09` S0/S2.12 (`addSyntheticWorkload`, `services.workload.buildTable`, `badgeCount`); `m10` S0.4/S0.8/S1.7–S1.10/S4 (`LIVE_BLOCK_TYPES`,
  `TASK_VIEW_DEFAULTS`, `charterTemplate()` with "งานและภาระของทีม", `getHome`, `searchAll`, `searchIndex`, `getEmbedTasks`,
  `getEmbedWorkload`, routes `src/app/api/pages/[id]/embed/{tasks,workload}`, `e2e/pages/{home,live-blocks,palette}.ts`).
- **Research:** `plan/research/r6b-gaps-m6-m11.md` §3.6 (M11-01…M11-19), §4.11 (compose/runner/Caddy/backup/restore fragments — start
  from them), §5 M12 tests; `plan/research/r1-next-mui-tooling.md` §3 (standalone/Docker), §7 (CSP), §10.3 (devEngines runtime in
  `node_modules`), §12.10 (Dockerfile); `plan/research/snippets/r1/{Dockerfile,.dockerignore,next.config.ts,csp-check.mjs}`;
  `plan/research/r2-auth-db.md` §2.6 (build-time env), §9.3 (migrator), §13 (env vars); `plan/research/r8-golden.md` §4.8, §4.11,
  §6.10, §6.11, §6b (demo totals 19 600 / 11 725, Peter OVER +200, badges).
- **docs/:** `docs/reference/golden-fixtures.json` (read by `seedGolden`; never re-typed).
- **Never** read, copy or reference the contents of `affine/` (the owner's AFFiNE trial); M12 only excludes it.

---

## 3. Decisions for this milestone

### 3.1 Applicable cross-milestone rulings (PLAN §1.4)

| X | What it means in M12 |
|---|---|
| X10 | No new table. G2 `pnpm db:generate` → "No schema changes". |
| X81 / X91 / X92 / X93 | M12 files and scripts per X81; the default Playwright config ignores `e2e/perf/**` + `m12-deploy.spec.ts`, perf DB `planner_perf`, route rows named `'POST /api/files'`, every milestone's rows file registered in `tests/authz/rows/index.ts` (AUD-00 checks it) (X91); seed builders per X92 (§3.13, no `addLeave`); `AuditEntity` = the X93 list (S0.4 type check). |
| X11 | `seed:demo` only **composes** existing builders (`seedGolden`, `applyFixture`, `addDayExample`, `addMilestones`) plus the new `addDemoPages`/`addDemoStatuses`; data comes from the golden JSON or SPEC A.2 constants (M7-D16, M8-D20 precedent). |
| X25 | Every project already has its charter (`ensureProjectCharters` in `seedGolden`); `addDemoPages` fills the POS charter **in place**. |
| X40 | `pnpm check` (incl. the new sweep, demo/perf integration tests, hardening and deploy unit tests) needs `pnpm db:up`. |
| X44 | The sweep enforces "every mutating action audited, in the same tx, except `user_preferences` and lease heartbeats". |
| X45 | Compose never sets `ALLOW_TEST_HOOKS`/`APP_NOW`; the perf server and the image-parity run set them explicitly (test-only). |
| X46 | Full e2e on the production build (`next build && next start -p 3100`); `e2e/m12-deploy.spec.ts` against the compose stack. |
| X51 | Contrast tokens audited (S3.6). |
| X52 | Postgres in UTC: `-c timezone=UTC -c log_timezone=Asia/Bangkok`, and the db service overrides `TZ=UTC` (M12-D14). |
| X53 | No `localStorage` (grep in S3.5). |
| X55 | Perf data lives in its own DB `planner_perf`; e2e DB untouched. |
| X56 / X90 | Scripts import services/repo/storage directly (no `server-only` in their graph); services receive `today` as a required parameter — m03 already declares it on `createTask`, `setStatus`, `revertStatuses`, `deleteTaskStatus`, `restoreTaskStatusBatch` (M3-D43), m06 on `save`/`planRange`, m08 on the milestone services; S0.1 only **verifies** it (M12-D35). `SessionUser` is imported with `import type` only (it lives in `session.ts`, which imports `server-only`). |
| X59 / X96 | Fixture builders that audit do so with actor `null` (`seedGolden`, `applyFixture`, `addDayExample`, `addMilestones`); the synthetic builders `addSyntheticGridProject`/`addSyntheticWorkload` write **no** audit rows (X92). Where a user operation's audit row is written by the **action/route** instead of the service (X96: m03 task create/status M3-D43, m04 `createPage`/`renamePage`/`savePageContent`/`POST /api/files` M4-D38, m08 milestone actions M8-D25), the demo builder writes the identical row itself (M12-D34), so the audit trail of `seed:demo` equals the one the UI would produce. |
| X65 | "แผน (ต่อ batch)" is satisfied as a superset: one `allocation` audit row per assignment per batch (M12-D3). |
| X94 | Deploy facts verified here: db `environment: TZ: UTC` despite `env_file` (M12-D14), builder `pnpm_config_verify_deps_before_run=false` under `NODE_ENV=production` (M12-D15), the `devEngines` Node runtime present in `node_modules` (checked offline with `--network none`, S2.1/S2.9); each stays `[uncertain]` until its check passes. |
| X69 | Followed exactly: `name: planner`, `env_file: ../.env` on every service, TCP healthcheck, migrate retries ≈ 60 s, `/data/uploads` chowned in runner, `backup.sh` loop + `once` + tmp-then-move + 14 days, `pg_restore --clean --if-exists --no-owner`, README offline/TLS/upgrade, A.2 nested task fix. |
| X70 | Every task inserted by `seed:demo`/`seed:perf` has its project's status (default unless the demo moves it). |
| X71 | Demo status changes go through `services/taskStatus.ts#setStatus` (BR-80 completion dates). |
| X73 | The demo blocker goes through the M3 blocker service (cycle check). |
| X75 | `GET /api/tasks` (200 per page) is a perf target (M12-D12). |
| X78 | The POS charter keeps the template's `taskView` (BOARD) + `projectWorkload` blocks; embed endpoints are perf targets. |

### 3.2 Milestone-specific decisions

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M12-D1 | PLAN §5 M12 | Streams refined: S0 contracts + the audit **sweep** (meta-test); S1 seeds + any audit gap fix (owns the sweep files after S0); S2 Docker/compose/backup/Caddy/README/deploy scripts; S3 perf script, Playwright perf spec, hardening unit tests; S4 hardening + deploy e2e and full regression. S1, S2, S3 run in parallel after G0. | Disjoint paths; perf/deploy code can be written against S0 contracts and is only executed by the integrator. |
| M12-D2 | FR-1201, X44 | Audit sweep = `tests/authz/audit-coverage.int.test.ts` + `tests/authz/audit-registry.ts`. It (a) imports every module in `src/server/actions/**` and lists every exported function, (b) text-scans `src/app/api/**/route.ts` for exported `POST/PUT/PATCH/DELETE`, (c) requires for each one either ≥ 1 row in `tests/authz/rows/**` with `mutates: true`, an `audit: { entity }` and at least one `allow` expectation, or an entry in `AUDIT_EXEMPT` with a reason. `KNOWN_GAPS` (filled by S0, emptied by S1) keeps G0 green; G2 requires `KNOWN_GAPS = []`. | One mechanical check catches any future action without audit; the M1 matrix already asserts the row content. |
| M12-D3 | FR-1201 "แผน (ต่อ batch)" | Accept PLAN §3.4.6/X65: `saveAllocations`/`planAssignmentRange` write one `allocation` row **per assignment** in the batch (≥ 1 per batch). The sweep asserts ≥ 1 row per batch and exactly one per assignment. | Superset of SPEC; already built in M6/M7. |
| M12-D4 | App. A.2, X59 | `seed:demo` uses actor-`null` builders where they exist; operations that only exist as user services (`createTask` FR-610, `setStatus`, blocker add, `createPage` + `renamePage`, `storeUpload`, `savePageContent`) run as the golden **Manager** via `scriptSessionUser(tx, 'manager@example.com')` so authz and business rules run unchanged; their audit rows carry the Manager as actor. | Real service paths (BR-31, BR-80, BR-85, sanitising, `content_text`) instead of hand-inserted rows. |
| M12-D5 | App. A.2 วันลา, PLAN §3.13 | Demo leave = `applyFixture(tx, 'F3')` (Peter ลาพักร้อน 2026-10-05…06) — it is exactly the A.2 entry. PLAN §3.13's `addLeave` was never built; no new builder. | No duplicate data path. |
| M12-D6 | App. A.2 vs BR-31, X69 | Nested task: `createTask({ projectId: POS, parentId: 'Rollout สาขา', name: 'ติดตั้งระบบที่สาขา' })` (FR-610 moves Mint + plan to it; inherits TENTATIVE), then `createTask(… name: 'เตรียมคู่มือสาขา', afterId: <first child>)` unassigned → "รอมอบหมาย". F1 totals unchanged. | r8 D3, r6b M11-13. |
| M12-D7 | §4.6.1, BR-80/87, addendum | Demo statuses (each project keeps its 5 defaults via `ensureProjectStatuses`): POS "ปรับปรุงระบบ POS หน้าร้าน" → **เสร็จ**; DW "ย้าย pipeline ขึ้น BigQuery" → **รอข้อมูล**; CRM "ตั้งค่า automation" → **ติดปัญหา**; Mobile "ออกแบบ flow ใหม่" → **กำลังทำ**. All via `setStatus`. The completed task's last planned week is 2026-09-28, so BR-50 releases nothing for any `today ≥ 2026-09-28`; demo totals stay 19 600 / 11 725 (asserted). | Shows every category on the board without changing load numbers (BR-87). |
| M12-D8 | §4.6.2, D12 | One blocker: CRM "ตั้งค่า automation" ถูกขวางโดย "ย้ายข้อมูลลูกค้า" (same project, open) → badge ⛔ "รอ 1 งาน". | Matches the ติดปัญหา status; same project per D12. |
| M12-D9 | App. A.2 หน้าเอกสาร, C4, X78, M10-D12 | `addDemoPages`: **fill the existing POS charter in place** (never a second charter — `one_charter_per_project`) by inserting demo blocks after each section heading and replacing the template's empty tables; the "งานและภาระของทีม" section and its `taskView` (BOARD) + `projectWorkload` blocks are kept untouched; a `subpage` block in "การสื่อสาร" points to the new child page "บันทึก kickoff" (meeting template B.2, filled); the stakeholder table has 3 rows; one sample image (`scripts/assets/demo-pos-storefront.png`, committed, < 50 KB) is stored through `storeUpload` and referenced by an `image` block. Wiki: root "คู่มือทีม" (with a `subpage` block) › child "วิธีใช้ระบบนี้" (SOP template B.3, filled). Other charters stay as created from the template. | SPEC A.2 + M4/M10 contracts; content passes `pageContentSchema`. |
| M12-D10 | X45, X56 | Scripts never import `clock.ts`. `today` for `seed:demo` = `todayBangkok(new Date(APP_NOW))` when `ALLOW_TEST_HOOKS=1` and `APP_NOW` is set, else `todayBangkok()`; passed into every builder/service. | Deterministic tests, real date for the owner. |
| M12-D11 | §9 NFR-01, C22, C43 | `seed:perf` = truncate + `seedGolden` + `addSyntheticGridProject(tx, { tasks: 200, weeks: 16, from: '2026-09-28' })` + `addSyntheticWorkload(tx, { people: 95, projects: 20, weeks: 12, from: '2026-09-28' })` + one new SQL bulk builder `addPerfBulk` (`generate_series`) that tops up to the NFR-01 scale (300 projects, 20 000 tasks, ≈ 15 000 assignments, ≈ 300 000 allocations over 3 years with ≈ 5 % DAY weeks, 5 000 pages ≈ 20 k chars, one 300-block page). 95 synthetic + 5 golden workers = **100 people** on `/workload` (+ the golden Manager, excluded per X67). Bulk and synthetic rows are not audited (not user operations, X92); `ensureProjectCharters` writes its usual actor-`null` row per new charter (M4-D5). Runs only against `PERF_DATABASE_URL` (default `…/planner_perf`), refuses `NODE_ENV=production`. | Reuses the M6/M9 builders for the measured fixtures; row-by-row builders cannot reach 300 k rows quickly (r6b M11-14: `generate_series` ≈ 2 s for 305 k). |
| M12-D12 | §9, X75, X78 | Server budgets (p95 of 100 sequential requests after 10 warm-ups; 20 concurrent logged): grid 16 w **500 ms**; workload 12 w **800 ms**; `GET /api/tasks` first page **500 ms** (X75 smoke bound); `/embed/tasks` **500 ms**, `/embed/workload` **800 ms** (same data as workload); `GET /api/search` **500 ms** (statement timeout, X68); `/api/search/index`, `/api/home`, `/api/sidebar`, day zoom: logged only. Client budgets in Playwright (median of 5, every sample logged): grid render 300 ms, edit 50 ms (p95 of 20), 300-block page 1 000 ms, palette 200 ms. | SPEC §9 numbers; the non-SPEC ones reuse the nearest SPEC bound so v3.1 views cannot regress unnoticed. |
| M12-D13 | §9, r6b M11-15 | Perf runs against the **production build** (`pnpm start -p 3200`) with `DATABASE_URL=$PERF_DATABASE_URL`, `ALLOW_TEST_HOOKS=1`, `APP_NOW=2026-09-30T10:00:00+07:00` (deterministic windows). Results go to `PROGRESS.md` (§10). A failed budget → fix round; if it cannot be met, a Deviation proposal and stop (PLAN §2.9 #1). | Reproducible, matches what users run. |
| M12-D14 | §10.2, X52, X69 | Compose deviations from the SPEC sketch (**DEVIATION**, r6b M11-01/02/03/19): top-level `name: planner`; every service `env_file: ../.env` and no `${…}` interpolation; db healthcheck `pg_isready -h 127.0.0.1 -U planner -d planner` (interval 5 s, retries 30); db `command: postgres -c timezone=UTC -c log_timezone=Asia/Bangkok` and `environment: { POSTGRES_DB, POSTGRES_USER, TZ: UTC }` (overrides `.env`'s `TZ` so initdb never writes Bangkok into `postgresql.conf`); backup keeps `TZ=Asia/Bangkok` from `.env` for its 02:00 schedule. | The SPEC block is invalid YAML and its interpolation reads the wrong `.env`; healthcheck lies during initdb. |
| M12-D15 | §10.1 migrate | `migrate`: target `builder`, `command: sh -c "pnpm db:migrate && pnpm bootstrap"`, `environment: { NODE_ENV: production, pnpm_config_verify_deps_before_run: 'false' }`, volume `uploads:/data/uploads` (so `seed:demo` can store its image when run in the container), `restart: 'no'`. `scripts/migrate.ts` waits for the DB (≤ 60 s, 2 s steps) via `scripts/lib/wait-for-db.ts`. | Production bootstrap rules (fatal without `INITIAL_MANAGER_*`), no install attempt by pnpm at run time, X69 retry. |
| M12-D16 | §10.6, r1 §3/§12.10, r2 §2.6 | Dockerfile from `snippets/r1/Dockerfile` with: cache mount `/pnpm/store`; `pnpm build` with **inline** placeholder env (`DATABASE_URL=postgres://build:build@127.0.0.1:1/build BETTER_AUTH_SECRET=<40 x> BETTER_AUTH_URL=http://localhost:3000`) so no placeholder persists in the image; runner creates `/data/uploads` owned by `nextjs` (uid 1001) before `USER`; `ENV HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production UPLOAD_DIR=/data/uploads`; `HEALTHCHECK` on `/api/health` (busybox `wget`). Images tagged `planner-app` (runner) and `planner-builder` (builder) via `image:` next to `build:`. | Verified shape; tags make offline `docker save/load` possible. |
| M12-D17 | §10.5, r6b M11-07 | `backup.sh` = r6b §4.11 prototype: modes `once` / loop; loop runs a backup at start when today's dump is missing, then sleeps until `BACKUP_AT` (default 02:00, TZ from `.env`); `.tmp` then `mv`; retention `-mtime +$((KEEP-1))` with `BACKUP_KEEP_DAYS` (default 14); `tar czf … -C /data uploads`; `pg_dump -Fc --no-owner`. | Postgres image has no cron; a fresh deploy proves "backup ไฟล์เกิดจริง". |
| M12-D18 | §10.1 caddy | `Caddyfile`: `{$SITE_ADDRESS} { encode zstd gzip; tls {$CADDY_TLS:internal}; reverse_proxy app:3000 }`. `CADDY_TLS` = `internal` (default: internal CA, for `.local`/LAN), an e-mail (public ACME), or `/certs/cert.pem /certs/key.pem` (company certs, mounted read-only). Caddy depends on `app` healthy. | One file, no edits for the common cases; verify with `caddy adapt` (S2.5). |
| M12-D19 | M1 carried-in, r6b M11-06 | `serverActions.allowedOrigins` is **not** set: Caddy forwards `Host`/`X-Forwarded-Host`, so Next's origin check passes; README requires any company proxy to do the same and to set `BETTER_AUTH_URL` = the public URL, `SECURE_COOKIES=true` behind HTTPS, and `TRUSTED_PROXIES` = the proxy's address/CIDR (FR-106 IP accuracy, R-M1-8). | `next.config` is frozen at build time; env-driven origins are impossible in standalone without rebuilding. |
| M12-D20 | §12 Done when, r6b M11-11 | `scripts/deploy-smoke.sh` copies the repo (excluding `node_modules .next .git affine uploads backups .e2e-uploads test-results playwright-report coverage .env`) into a temp dir, writes a fresh `.env` there (random secrets, `INITIAL_MANAGER_*`, `SECURE_COOKIES=false`, `BETTER_AUTH_URL=http://localhost:3000`), runs `docker compose -p planner-smoke … up -d --build --wait` on fresh volumes, then `playwright test -c playwright.deploy.config.ts`, then tears down with `down -v`. Requires port 3000 free. | A clean checkout without `node_modules` = "เครื่องเปล่า"; `-p` isolates volumes from a real `planner` stack; the developer's `.env` is never touched. |
| M12-D21 | X46 | `playwright.config.ts` gains `testIgnore: ['perf/**', 'm12-deploy.spec.ts']`; `playwright.perf.config.ts` (testDir `e2e/perf`, baseURL `PERF_BASE_URL` ‖ `http://localhost:3200`, no webServer, no reset) and `playwright.deploy.config.ts` (testMatch `m12-deploy.spec.ts`, baseURL `DEPLOY_BASE_URL` ‖ `http://localhost:3000`, no webServer, no DB reset) are separate. `pnpm test:e2e` = all M0–M12 specs except those two. | Each target needs a different server and data. |
| M12-D22 | R10, r6b M11-18 | Image-parity run: `scripts/e2e-image.sh` runs the **full** default e2e suite against the `planner-app` image (`docker run -p 3100:3000` with the e2e env, `--user $(id -u):$(id -g)`, `.e2e-uploads` bind-mounted) using Playwright `reuseExistingServer`. | Node 22 alpine/ICU in the image is the production truth. |
| M12-D23 | NFR-09, R13 | Offline proof: (1) `tests/hardening/no-external-urls.test.ts` scans `src/**`, `public/**`, `src/app/**/*.css` for `http(s)://` outside an allowlist; (2) every e2e test keeps M0's external-request guard; (3) `scripts/offline-check.sh` starts db + migrate + app with `docker/docker-compose.offline.yml` (all services on an `internal: true` network) and a `probe` container (`planner-app` image, `wget`) that fetches `/api/health`, `/login` and every `/_next/static` asset the login HTML references. | Three independent checks; no new tool. |
| M12-D24 | §9 security, r1 §7.2 | Keep `style-src 'self' 'unsafe-inline'` (M0); strict style nonces are not adopted (BlockNote/TipTap inject nonce-less `<style>`; untested editor flows). Recorded as a Known issue. | Verified-clean policy beats an unverified stricter one. |
| M12-D25 | §9 Browser | Automated runs use Chromium only (Playwright is pinned to Chromium, offline-friendly); Safari (macOS) and Edge get the manual checklist §7.4 M3. | No WebKit download; Edge = Chromium. |
| M12-D26 | §10.5 | Restore (**DEVIATION** from the SPEC command text, r6b M11-08): `stop app` → `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /backups/db-YYYYMMDD.dump` (run inside the `backup` service with `--entrypoint sh`) → `tar xzf /backups/uploads-YYYYMMDD.tgz -C /data` into the uploads volume using the already-present `postgres:17` image → `start app`. Rehearsed by `scripts/restore-rehearsal.sh` (called from the deploy smoke). | SPEC's `pg_restore --clean -d` exits 1 on an empty DB; no extra image needed offline. |
| M12-D27 | CLAUDE.md deps | No new dependency. Shell scripts are checked with `sh -n`/`bash -n` and executed in `postgres:17`; `shellcheck` is run only if installed (optional). YAML is checked with `docker compose config -q`. | ARC-04. |
| M12-D28 | C3, C23 | Seed tests in M12 never hard-code golden totals of rows; they snapshot counts after `seedGolden` in the same test and assert the **demo deltas**. Golden numbers that are SPEC facts (19 600/11 725 cd, overload list, badges) are asserted exactly. | Count tests from M1–M6 already drifted once. |
| M12-D29 | §1.7, PLAN §1.2 "Do not use", HANDOFF §6 | `tests/hardening/forbidden-deps.test.ts` reads `package.json` + `pnpm-lock.yaml` and fails on AFFiNE/BlockSuite (`@blocksuite/*`, `@affine/*`, `@toeverything/*`) and on PLAN §1.2's list: `typescript@7`, `eslint@10`, `drizzle-orm@1`, `@dnd-kit/react`, `@blocknote/xl-*`, `@blocknote/shadcn`, `react-hook-form` (removable only together with a Decision), `minio`, `zustand`, `@tanstack/react-table`, `date-fns-tz`, `recharts`, `next-intl`, `next-auth`/`@auth/*`, `xlsx` (SheetJS), job runners (`bullmq`, `pg-boss`, `agenda`). | Owner rejected AFFiNE; PLAN §1.2 forbidden list made executable. |
| M12-D30 | X69, HANDOFF §6 | `.dockerignore` excludes `affine/` (plus `.git`, `.env`, `.env.*` with `!.env.example`, `node_modules`, `.next`, `uploads`, `backups`, `.e2e-uploads`, `coverage`, `playwright-report`, `test-results`, `blob-report`, `plan/`, `.claude/`, `docs/**/*.xlsx`); S2.1 proves it with a context-listing build. `.gitignore` already has `affine/` (M0 S0.8) — the integrator confirms `git check-ignore affine/`. | `affine/` holds a live Postgres cluster and a private key; it must never enter an image or a commit. |
| M12-D31 | §10.3 | `.env.example` final list = SPEC §10.3 + `TRUSTED_ORIGINS`, `TRUSTED_PROXIES`, `DB_POOL_MAX` (commented, M0/M1) + `SITE_ADDRESS`, `CADDY_TLS` (caddy) + `BACKUP_AT`, `BACKUP_KEEP_DAYS` (backup) + commented test/dev-only `ALLOW_TEST_HOOKS`, `APP_NOW`, `ALLOW_DEMO_SEED`, `PERF_DATABASE_URL`. | DEP-07; one file to configure the whole stack. |
| M12-D32 | §7.6, r6b M11-16 | `/api/files` stays outside the `proxy.ts` matcher (M0), so Next's 10 MB proxy body limit never applies; e2e H5 uploads a 24 MiB attachment (201) and a 26 MiB one (413). | 25 MB attachments per SPEC. |
| M12-D33 | App. A.2, r6b M11-12 | `seed:demo` guards: `NODE_ENV=production` → refuse unless `ALLOW_DEMO_SEED=1`; DB must be **pristine** (0 rows in `projects`, `tasks`, `pages`, `time_off`; ≤ 1 row in `user`) or `--reset` is given; the whole seed (truncate + golden + demo) is one transaction; the uploaded image is written before commit (an orphan file on rollback is acceptable and logged). In Docker: `docker compose run --rm -e ALLOW_DEMO_SEED=1 migrate sh -c "pnpm seed:demo --reset && chown -R 1001:1001 /data/uploads"`. | Never wipes real data by accident; after `--reset` the golden users (`demo1234`) replace the bootstrap manager — documented. |
| M12-D34 | X59, M12-D4, FR-1201 | **Seed path = the action's chain without the `action()` wrapper.** For each user operation the demo/perf builders call, in this order: the same `authz.require*` the action calls (always — it is an idempotent read, harmless if the service repeats it) → the service with an explicit `today` → `audit.log(tx, manager, …)` with the action's exact `{ entity, action, entityId, projectId, summary: th.audit.<builder>(…) }` **only when** `AUDIT_IN_SERVICE[op] === false`. `AUDIT_IN_SERVICE` is a constant in `scripts/lib/demo.ts`; S0.1's "audit location" test pins every flag by running the service once in a test world and counting `audit_log` rows, so a later move of the audit into the service (X59) fails the test instead of double-auditing. Expected from the plans: `createTask`, `setStatus`, `createPage`, `renamePage`, `savePageContent`, `storeUpload` → `false` (action/route audits); `addTaskBlocker` (m03 S2.15) → `true`. | `'use server'` actions need a request session and `next/cache`, so scripts cannot call them; mirroring the chain keeps authz, business rules and the audit trail identical to the UI. |
| M12-D35 | X56, X45, X90, X96, G51 | **Clock-free services — verify only.** The planned signatures already take a required trailing `today: ISODate` and their modules never import `clock.ts`: m03 `services.tasks.createTask(tx, user, a, today)`, `taskStatus.setStatus(tx, user, a, today)`, `revertStatuses(tx, user, a, today)`, `taskStatuses.deleteTaskStatus`/`restoreTaskStatusBatch(…, today)` (M3-D43); m06 `services.allocations.save`/`planRange(…, today)` (they write their own `allocation` audit rows); m08 milestone services `create`/`update`/`restoreBatch(…, today)` (their actions write the audit, M8-D25). M12 does **not** change any M3/M6/M8 signature: S0.1 proves it with the tsx import test and `grep -rn "server/clock\|serverToday" src/server/services` (no hits). Only if the implemented code drifted from its plan does S0 (runs alone; its `src/server/{services,actions}/**` globs exist for this case) restore the **planned** signature, update the callers, and record it in PROGRESS Decisions; no optional parameter with a clock fallback. | X56/X90: "services never read the clock; callers pass `today` in" — M12 is the first milestone that imports these services from a script, so it is the place to check, not to redesign. |

---

## 4. Streams (machine-readable)

```json
{ "milestone": 11,
  "streams": [
    { "id": "S0", "title": "Contracts: name inventory (+ today/audit-location probes, clock-free service check M12-D35), audit coverage registry + sweep meta-test, seed/perf/deploy contracts and stubs, package scripts, Playwright configs, final .env.example",
      "agent": "backend-engineer",
      "owns": ["package.json", "pnpm-lock.yaml", ".env.example", ".gitignore", "playwright.config.ts", "playwright.perf.config.ts", "playwright.deploy.config.ts",
               "src/i18n/th.ts", "src/server/services/**", "src/server/actions/**", "tests/authz/audit-registry.ts", "tests/authz/audit-coverage.int.test.ts", "tests/authz/rows/index.ts",
               "scripts/seed-demo.ts", "scripts/seed-perf.ts", "scripts/perf-check.ts", "scripts/lib/script-user.ts", "scripts/lib/demo.ts",
               "scripts/lib/demo-content.ts", "scripts/lib/perf-data.ts", "scripts/lib/perf-stats.ts", "scripts/lib/wait-for-db.ts", "scripts/lib/inventory.int.test.ts"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Seeds: seed:demo (A.2 + v3.1 statuses/blocker + demo pages), seed:perf (reuse M6/M9 builders + SQL bulk), audit gap fixes",
      "agent": "backend-engineer",
      "owns": ["scripts/seed-demo.ts", "scripts/seed-perf.ts", "scripts/lib/script-user.ts", "scripts/lib/script-user.int.test.ts", "scripts/lib/demo.ts", "scripts/lib/demo.int.test.ts",
               "scripts/lib/demo-content.ts", "scripts/lib/demo-content.test.ts", "scripts/lib/perf-data.ts", "scripts/lib/perf-data.int.test.ts", "scripts/assets/**",
               "tests/authz/audit-registry.ts", "tests/authz/audit-coverage.int.test.ts", "tests/authz/rows/**",
               "src/server/services/**", "src/server/actions/**"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Deploy: Dockerfile, compose (+offline override), backup.sh, Caddyfile, .dockerignore, migrate wait, README, deploy-smoke/restore/offline/image scripts, static deploy tests",
      "agent": "platform-engineer",
      "owns": ["docker/Dockerfile", "docker/docker-compose.yml", "docker/docker-compose.offline.yml", "docker/backup.sh", "docker/Caddyfile", ".dockerignore", "README.md",
               "scripts/migrate.ts", "scripts/lib/wait-for-db.ts", "scripts/lib/wait-for-db.int.test.ts",
               "scripts/deploy-smoke.sh", "scripts/restore-rehearsal.sh", "scripts/offline-check.sh", "scripts/e2e-image.sh", "tests/deploy/**"],
      "dependsOn": ["S0"], "planSection": "5.S2" },
    { "id": "S3", "title": "Hardening checks: perf-check script + stats, Playwright perf spec, external-URL scan, token-contrast coverage, forbidden-deps test",
      "agent": "platform-engineer",
      "owns": ["scripts/perf-check.ts", "scripts/lib/perf-stats.ts", "scripts/lib/perf-stats.test.ts", "e2e/perf/**", "tests/hardening/**"],
      "dependsOn": ["S0"], "planSection": "5.S3" },
    { "id": "S4", "title": "Tests: e2e m12-hardening (headers, cookies, 24 MB upload, viewports, CSP tour), e2e m12-deploy (compose smoke + restore), full regression, traceability check",
      "agent": "test-engineer",
      "owns": ["e2e/m12-hardening.spec.ts", "e2e/m12-deploy.spec.ts", "e2e/pages/**", "e2e/support/**", "e2e/fixtures.ts", "tests/integration/**", "tests/golden/**"],
      "dependsOn": ["S1", "S2", "S3"], "planSection": "5.S4" }
  ],
  "e2e": ["e2e/m12-hardening.spec.ts", "e2e/m12-deploy.spec.ts", "e2e/perf/m12-perf.spec.ts"] }
```

Ownership notes: S0 runs alone and creates stubs for files that S1/S2/S3 then own (no concurrency); its `src/server/{services,actions}/**`
globs exist only for an M12-D35 drift fix (expected: none) and pass to S1 afterwards. S1, S2 and S3 run in parallel and
their globs are disjoint (S1: seeds, the sweep, `src/server/**` for audit gap fixes only; S2: `docker/**`, deploy scripts, migrate;
S3: perf + hardening tests). S4 starts after all three. `src/i18n/th.ts` stays with S0; M12 expects **no** new UI string — if an
audit gap fix needs a summary builder, S1 adds it inside the `audit` namespace with Edit (PLAN §2.3). Only the integrator runs
`next build`, `next start`, Docker builds, Playwright and `seed:perf` against a server (PLAN §2.3 rule 6).

---

## 5. Step-by-step

Rules for every step: authz before data in anything that is code (CLAUDE.md); audit inside the transaction; integer cd; ISO date strings
(the only `Date` use in scripts is `todayBangkok()` / `new Date(APP_NOW)` per M12-D10); `pnpm` only (`pnpm exec`, never `npx`); scripts
are CommonJS under tsx (no top-level await, no `import.meta`, X56); never read the contents of `affine/`.

### 5.S0 — Contracts: inventory, audit sweep, seed/perf/deploy contracts (backend-engineer · package.json, configs, sweep files, script stubs)

**S0.1 — Name inventory (verify, do not invent).** Write `scripts/lib/inventory.int.test.ts` (integration project; it stays in the suite as a
guard against later renames) that imports and asserts `typeof … === 'function'` for every name M12 consumes:

| Module | Names |
|---|---|
| `scripts/lib/db.ts` (M1) | `createScriptDb`, `truncateAll`, `assertNotProduction` |
| `scripts/lib/fixtures.ts` | `seedGolden` (M1–M6), `applyFixture` (M5), `addDayExample` (M7), `addMilestones` (M8), `addSyntheticGridProject` (M6), `addSyntheticWorkload` (M9) |
| `scripts/lib/bootstrap.ts` (M1) | `runBootstrap` |
| `scripts/lib/migrate.ts` (M0) | `runMigrations`, `MIGRATIONS_FOLDER` |
| `src/server/services/tasks.ts` (M3 S2.3, barrel `services.tasks`, M3-D39/D43) | `createTask(tx, user, a, today)` (FR-610 transfer) |
| `src/server/services/taskStatus.ts` (M3 S2.6) | `setStatus(tx, user, a, today)`, `revertStatuses(tx, user, a, today)` |
| `src/server/services/taskStatuses.ts` (M3 S2.14) | `ensureProjectStatuses`, `ensureAllProjectStatuses`, `listStatuses` |
| `src/server/services/taskBlockers.ts` (M3 S2.15) | `addTaskBlocker` (service of the same name as the action) |
| `src/server/services/tasks.ts` (M3) | `listProjectTasks` |
| `src/server/services/page-tree.ts` (M4 S0.14) | `createPage(tx, user, input)` (input = `createPageSchema` output: `{ space, projectId, parentId, afterId? }` — **no title**) |
| `src/server/services/pages.ts` (M4 S0.14) | `renamePage(tx, user, a, title)`, `savePageContent(tx, user, a, { baseVersion, content })`, `applyTemplate`, `getPageView` |
| `src/server/services/files.ts` (M4 S0.14) | `storeUpload(tx, user, a, { name, bytes, purpose, limits, today })` |
| `src/server/services/charters.ts` (M4) | `ensureProjectCharters` |
| `src/server/authz.ts` (M1–M4) | `requireProject`, `requireTask`, `requireTasks`, `requirePage`, `requirePageCreate` |
| `src/server/env.ts` (M0/M4) | `env`, `uploadLimits` |
| `src/server/storage.ts` (M4) | `getStorage`, `newStorageKey` |
| `src/server/services/allocations.ts` (M6) | `ALLOCATION_AUDIT_ENTITY` (= `'allocation'`) |
| `src/server/services/milestones.ts` or its contracts module (M8) | `MILESTONE_AUDIT_ENTITY` (= `'milestone'`) |
| `src/server/services/workload.ts` (M9) | `buildTable`, `badgeCount` |
| `src/server/services/{home,search,embed}.ts` (M10) | `getHome`, `searchAll`, `searchIndex`, `getEmbedTasks`, `getEmbedWorkload` |
| `src/lib/schemas/page-content.ts` (M4/M10) | `pageContentSchema`, `extractContentText` (or wherever M4 put it), `LIVE_BLOCK_TYPES`, `TASK_VIEW_DEFAULTS`; type `BlockInput` |
| `src/i18n/templates.th.ts` (M4/M10) | `charterTemplate` (returns `TemplateResult { title, icon, content }`), `meetingTemplate`, `sopTemplate`, `tableBlock` (m04 S0.12, C68) |
| `src/server/audit.ts` (M1) | `log`; type `AuditEntity` = exactly the G55 list (type-level check, S0.4) |
| `src/domain/dates.ts` (M1) | `todayBangkok`, `weekStart`, `addWeeks`, `addDays` |
| `src/domain/status.ts` (M3) | `DEFAULT_STATUSES` (keys `todo`, `doing`, `waitData`, `blocked`, `done`) |

**`today` and audit location per call (G51 — every service an M12 script calls).** Pinned from the milestone files; S0 verifies each
row and corrects the table in the test comment if the code differs:

| Call (milestone step) | Takes `today`? | Who writes the audit row | M12 caller passes / does |
|---|---|---|---|
| `services.tasks.createTask(tx, user, a, today)` (m03 S2.3, M3-D43) | **yes** (required trailing; the module never imports `clock.ts`) | action (`th.audit.taskCreated`, X96) | `o.today`; builder audits (M12-D34) |
| `taskStatus.setStatus(tx, user, { projectId, taskIds, statusId, withChildren }, today)` (m03 S2.6, M3-D43) | **yes** (required trailing) | action, one row per changed task (`th.audit.taskStatusChanged(name, statusName)`, X96) | `o.today`; builder audits per `r.changed` |
| `taskBlockers.addTaskBlocker(tx, user, a)` (m03 S2.15) | n/a | service (`blockerAdded`, entity `task_blocker`) | nothing extra |
| `taskStatuses.ensureAllProjectStatuses(tx)` / `listStatuses(tx, projectId)` (m03 S2.14) | n/a | none | — |
| `services.tasks.listProjectTasks(tx, user, projectId)` (m03) | n/a | read | DM-07 |
| `createPage` (m04 S1.5) · `renamePage` · `savePageContent` (m04 S1.3) | n/a | action / keepalive route (`pageCreated`, `pageRenamed`, `pageSaved`; M4-D38, X96) | builder audits (M12-D34) |
| `storeUpload(…, { today })` (m04 S1.7) | **yes** (`i.today`, storage key month) | route `POST /api/files` (`fileUploaded`, entity `file`; M4-D38) | `o.today`; builder audits |
| `ensureProjectCharters(db)` (m04) | n/a | as m04 wrote it (backfill) | — |
| `workload.buildTable(tx, viewer, o, today)` · `badgeCount(tx, viewer, today)` (m09 S0) | **yes** | read | DM-02/03 pass `'2026-09-30'` |
| `getHome(tx, user, { today, now })` · `getEmbedWorkload(tx, user, pageId, today)` (m10) | **yes** | read | inventory only (perf hits the routes) |
| builders `seedGolden`, `applyFixture(db, 'F3')`, `addDayExample(db)`, then `addMilestones(db)` (after `addDayExample`, M8 S0.11) | no (fixed data dates; self-auditing, no `today`) | the builder, actor `null` | — |
| `addSyntheticGridProject(db, { tasks, weeks, from })` (m06 S0) · `addSyntheticWorkload(db, { people, projects, weeks, from })` (m09 S0, C85) | no (`from`) | **none** — no audit rows (X92) · projects `client_id = null`, no charter page (plain Drizzle; `addPerfBulk` runs `ensureProjectCharters`, C100) | — |

Tests in `inventory.int.test.ts`:
- `it('names exist')` — the `typeof` assertions above.
- `it('services used by scripts import under tsx')` — the integration project aliases `server-only`, so importing there proves
  nothing; spawn `pnpm exec tsx -e "require('./src/server/services/taskStatus'); require('./src/server/services/tasks'); require('./src/server/services/taskBlockers'); require('./src/server/services/page-tree'); require('./src/server/services/pages'); require('./src/server/services/files'); require('./src/server/services/charters'); require('./src/server/services/workload'); require('./src/server/authz'); require('./src/server/audit')"`
  (+ the `createTask` module if different) → exit 0 (S1.9 repeats it for `scripts/lib/demo.ts` and `perf-data.ts`).
- `it('audit location')` — fresh `createWorld({ with: ['tasks', 'pages'] })` per op; call each service of M12-D34 once as `lead` (after
  its authz call) and count new `audit_log` rows → `expect(rows > 0).toBe(AUDIT_IN_SERVICE[op])` (the constant is exported by the
  `scripts/lib/demo.ts` stub, S0.5).
- `it('audit entity constants')` — `ALLOCATION_AUDIT_ENTITY === 'allocation'`, `MILESTONE_AUDIT_ENTITY === 'milestone'`.

**Clock check (M12-D35, verify only).** Expected: no service module imports `clock.ts` (m03 M3-D43, m06, m08 already take `today`);
`grep -rn "server/clock\|serverToday" src/server/services` prints nothing and the tsx import test passes. Only on drift from the plans
does S0 restore the planned signature (required trailing `today`, callers updated via `grep -rn "setStatus(\|revertStatuses(\|createTask(" src tests`)
and record a PROGRESS Decision. Any other mismatch → adapt M12 to the real name and record it (no third name). Done-check: `pnpm exec vitest run --project integration scripts/lib/inventory.int.test.ts` and
`pnpm exec vitest run --project integration src/server/services` (M3/M6/M8 suites green).

**S0.2 — package.json scripts (no new dependency).** Add (PLAN §3.2 style; `tsx --env-file-if-exists=.env`):
```json
"seed:demo": "tsx --env-file-if-exists=.env scripts/seed-demo.ts",
"seed:perf": "tsx --env-file-if-exists=.env scripts/seed-perf.ts",
"perf": "tsx --env-file-if-exists=.env scripts/perf-check.ts",
"perf:e2e": "playwright test -c playwright.perf.config.ts",
"deploy:smoke": "bash scripts/deploy-smoke.sh",
"offline:check": "bash scripts/offline-check.sh",
"e2e:image": "bash scripts/e2e-image.sh"
```
Done-check: `python3 -c "import json;d=json.load(open('package.json'));print(sorted(k for k in d['scripts'] if k.startswith(('seed','perf','deploy','offline','e2e'))))"`.

**S0.3 — Playwright configs (M12-D21).** `playwright.config.ts`: add `testIgnore: ['perf/**', 'm12-deploy.spec.ts']` (keep everything else).
```ts
// playwright.perf.config.ts — runs against an already started production server on planner_perf (no reset, no webServer)
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: 'e2e/perf', workers: 1, fullyParallel: false, retries: 0, timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/perf.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: process.env.PERF_BASE_URL ?? 'http://localhost:3200', locale: 'th-TH',
         timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 }, trace: 'off' },
})
// playwright.deploy.config.ts — runs against the compose smoke stack started by scripts/deploy-smoke.sh
export default defineConfig({
  testDir: 'e2e', testMatch: 'm12-deploy.spec.ts', workers: 1, retries: 0, timeout: 180_000,
  use: { ...devices['Desktop Chrome'], baseURL: process.env.DEPLOY_BASE_URL ?? 'http://localhost:3000', locale: 'th-TH',
         timezoneId: 'Asia/Bangkok', trace: 'retain-on-failure' },
})
```
No `globalSetup` and no clock pin in either (the deploy stack runs on the real clock; perf uses the server's `APP_NOW`, and the browser
clock is pinned per test with `page.clock.setFixedTime` where windows matter). Done-check: `pnpm exec playwright test --list -c playwright.perf.config.ts` lists 0 tests before S3 (no error); `pnpm exec playwright test --list` does not list `m12-deploy`.

**S0.4 — Audit registry + sweep (M12-D2, M12-D3, FR-1201, X44). Test-first; this is the M12 meta-test.**
`tests/authz/audit-registry.ts`:
```ts
import type { AuditEntity } from '@/server/audit'

/** G55: the complete AuditEntity union after M10 — must equal the type exactly (both directions). */
export const ALL_AUDIT_ENTITIES = ['user', 'position', 'client', 'project', 'project_member', 'task', 'task_assignment', 'task_status',
  'task_blocker', 'page', 'file', 'holiday', 'leave_type', 'time_off', 'allocation', 'milestone'] as const satisfies readonly AuditEntity[]
type Missing = Exclude<AuditEntity, (typeof ALL_AUDIT_ENTITIES)[number]>
export const AUDIT_ENTITY_UNION_IS_COMPLETE: [Missing] extends [never] ? true : Missing = true   // tsc error names any entity not listed

/** FR-1201 nouns → audit entity (SPEC §4.12). Every one must be asserted by ≥ 1 allow row. */
export const FR1201_ENTITIES = {
  project: 'project', member: 'project_member', task: 'task', statusSet: 'task_status', blocker: 'task_blocker',
  assignment: 'task_assignment', plan: 'allocation', milestone: 'milestone', page: 'page', leave: 'time_off', employee: 'user',
} as const satisfies Record<string, AuditEntity>

/** Exported actions/routes that intentionally write no audit row (X44, M1-D9, X63). Reason is mandatory. */
export const AUDIT_EXEMPT: Readonly<Record<string, string>> = {
  setPreference: 'X44/X05 — user_preferences are not audited',
  login: 'M1-D9 — session lifecycle is Better Auth bookkeeping',
  logout: 'M1-D9 — session lifecycle',
  'POST /api/pages/[id]/lock': 'X44 — edit-lease acquire/heartbeat',
  'DELETE /api/pages/[id]/lock': 'X44 — edit-lease release',
  'POST /api/auth/[...all]': 'Better Auth handler; sign-up/admin paths disabled (BA-* rows); sessions per M1-D9',
}

/** Actions whose audit must name a specific entity (v3.1 + M8 binding; addendum list). */
export const REQUIRED_ENTITY: Readonly<Record<string, AuditEntity>> = {
  setTaskStatus: 'task', revertTaskStatus: 'task', completeTask: 'task', uncompleteTask: 'task',
  createTaskStatus: 'task_status', updateTaskStatus: 'task_status', reorderTaskStatus: 'task_status',
  deleteTaskStatus: 'task_status', restoreTaskStatusBatch: 'task_status',
  addTaskBlocker: 'task_blocker', removeTaskBlocker: 'task_blocker',
  createMilestone: 'milestone', updateMilestone: 'milestone', deleteMilestone: 'milestone', restoreMilestoneBatch: 'milestone',
  // updateMilestone also carries complete/reopen and the exact-undo `patch.completedOn` (M8-D19); binding audits per task (M8-D21)
  linkTasksToMilestone: 'task', revertTaskMilestones: 'task',
  saveAllocations: 'allocation', planAssignmentRange: 'allocation',
  savePageContent: 'page', 'PUT /api/pages/[id]/content': 'page', 'POST /api/files': 'file',
}

/** Gaps found by S0 when the sweep first ran; S1 fixes each and empties this list (G2 requires []). */
export const KNOWN_GAPS: readonly string[] = []
```
`tests/authz/audit-coverage.int.test.ts` (integration; uses M1's `rows` from `tests/authz/rows/index.ts` and `AuthzRow`):
```ts
const ACTION_FILES = globSync('src/server/actions/**/*.ts', { ignore: ['**/*.test.ts'] })        // node:fs globSync (Node 22)
const ROUTE_FILES = globSync('src/app/api/**/route.ts')
async function exportedActions(): Promise<string[]>   // dynamic import each file; Object.entries → typeof fn === 'function'
function mutatingRoutes(): string[]
  // read text; methods from BOTH forms: /export\s+(?:const|async\s+function|function)\s+(POST|PUT|PATCH|DELETE)\b/g and the destructured
  // /export\s+const\s*\{([^}]*)\}\s*=/g (M1's `export const { GET, POST } = toNextJsHandler(auth)`), split on ',' and trimmed.
  // Key format (G56) = `${METHOD} /api/${folder segments after src/app/api, joined by '/'}` with bracket segments kept verbatim:
  // 'POST /api/files', 'PUT /api/pages/[id]/content', 'POST /api/auth/[...all]' — the format m04 §7.2 and m06 §7.2 rows use.
const routeKey = (action: string): string => action.split('?')[0]!.trim()   // m04 rows carry a query: 'POST /api/pages/[id]/lock?takeover=1'
function auditedRowsFor(name: string): AuthzRow[]     // rows where routeKey(row.action) === name
  // → filter(r => r.mutates && r.audit && Object.values(r.expect).includes('allow'))
```
Tests (ids are used in §7.1):
- **AUD-00** `every rows file is registered` (C72) — for each `tests/authz/rows/*.ts` except `index.ts`: dynamic-import its `rows` and
  assert every row `id`+`spec` pair appears in `index.ts`'s `rows`; failure lists the unregistered files (expected files after M10:
  M1 `employees, positions, account, preferences, auth-endpoints`; M2 `clients, projects, members`; M3 `tasks, assignments,
  task-statuses, task-blockers`; M4 `pages, wiki, files, search`; M5 `holidays, leave-types, time-off, calendar`; M6 `allocations`;
  M7 `grid-day, allocations-day`; M8 `milestones`; M9 `workload, people`; M10 `home` — use the real list, this is only the expectation).
  A missing registration is fixed by S0 in `tests/authz/rows/index.ts` (it then runs the matrix for those rows — any red row is a gap for S1).
  Also: every `row.audit.entity` ∈ `ALL_AUDIT_ENTITIES`.
- **AUD-01** `every exported server action is audited or exempt` — for each name: `auditedRowsFor(name).length ≥ 1` or
  `name in AUDIT_EXEMPT` or `KNOWN_GAPS.includes(name)`; failure message lists the names.
- **AUD-02** `every mutating route handler is audited or exempt` — same over `mutatingRoutes()` (expected today: `POST /api/files`,
  `PUT /api/pages/[id]/content` audited; lock `POST`/`DELETE` and `/api/auth/[...all]` exempt).
- **AUD-03** `REQUIRED_ENTITY rows use the required entity` — every row for those actions with `audit` declares exactly that entity.
- **AUD-04** `every FR-1201 entity is asserted by an allow row` — `Object.values(FR1201_ENTITIES)` ⊆ entities of audited rows.
- **AUD-05** `exemptions are real and justified` — every `AUDIT_EXEMPT` key is an existing export/route; reasons non-empty;
  every row whose `routeKey(action)` is exempt declares `audit: false`; running `setPreference` as member writes 0 `audit_log` rows.
- **AUD-06** `allocation batch audits once per assignment` (M12-D3) — `createWorld({ with: ['allocations'] })` (implies `'tasks'`), as lead
  `saveAllocations` with 2 items (`w.assignments.pLeafLead` and `w.assignments.pChildAMember`, each `baseVersion` = its current version,
  one WEEK change on 2026-10-19 — not the DAY week 2026-10-12 — in m06's `SaveAllocationsInput` shape) → exactly 2 new rows, both
  `entity = ALLOCATION_AUDIT_ENTITY`, distinct `entity_id` = the two assignment ids, `project_id = P`.
- **AUD-07** `page saves log without content` — as member, `savePageContent` on `pPage` with a paragraph `'เนื้อหาลับ-AUD-07'` →
  1 row `entity 'page'`, and `JSON.stringify(row)` does not contain `'เนื้อหาลับ-AUD-07'`; same via `PUT /api/pages/{pPage}/content`.
- **AUD-08** `no audit row stores secrets` — after running every audited `allow` row once as M (loop over rows, fresh world each),
  `select before, after, summary from audit_log` → none contains `password`, `hash`, `token`, `secret` keys or a value matching
  `/^[0-9a-f]{32,}:[0-9a-f]{64,}$/` (scrypt `salt:key`). (Expensive: tagged `describe.sequential`, ~1 world per row; acceptable.)
- **AUD-09** `audit_log is never read by the app` (FR-1202) — text scan `src/**` (excluding `src/server/audit.ts`, `src/server/db/schema.ts`,
  tests) for `auditLog` / `audit_log` → no hits.
- **AUD-10** `KNOWN_GAPS is empty` — `it.skipIf(process.env.M12_ALLOW_GAPS === '1')`: `expect(KNOWN_GAPS).toEqual([])`.
  S0 runs the suite once; if AUD-01/02 find gaps, S0 lists them in `KNOWN_GAPS` **and** reports them, and sets
  `M12_ALLOW_GAPS=1` only in its own G0 run note; S1 removes every entry (G2 runs without the variable).
Done-check: `pnpm exec vitest run --project integration tests/authz/audit-coverage.int.test.ts` (with `M12_ALLOW_GAPS=1` if gaps).

**S0.5 — Script and builder contracts (stubs throw `new Error('NOT_IMPLEMENTED: <name> (M12 S1)')`).**
```ts
// scripts/lib/script-user.ts — builds the SessionUser services expect (M1 type), from a DB row; never a password
import type { SessionUser } from '@/server/session'   // TYPE-ONLY: session.ts imports 'server-only' (X56); a value import breaks tsx
export async function scriptSessionUser(tx: DbOrTx, email: string): Promise<SessionUser>
  // throws if missing/banned/deactivated; fills every SessionUser field from `user` (id, email, name, nickname, role, positionId,
  // color, mustChangePassword) plus sessionId: 'script', sessionToken: '' (no session row exists; nothing reads them in services)

// scripts/lib/demo.ts
export interface DemoOptions { today: ISODate; reset: boolean }   // UPLOAD_DIR comes from env() (tests: vi.stubEnv before the first getStorage())
/** M12-D34: does the service itself write the audit row? Pinned by inventory.int.test.ts › audit location. */
export const AUDIT_IN_SERVICE = { createTask: false, setStatus: false, addTaskBlocker: true, createPage: false, renamePage: false,
  savePageContent: false, storeUpload: false } as const satisfies Record<string, boolean>
export interface DemoResult { counts: Record<'tasks' | 'assignments' | 'allocations' | 'milestones' | 'timeOff' | 'pages' | 'files' | 'blockers', number>
  posCharterId: string; kickoffPageId: string; wikiRootId: string; imageFileId: string }
export const DEMO = {                     // SPEC A.2 constants not in the golden JSON (M7-D16 / M8-D20 precedent)
  nested: { project: 'POS Upgrade', parent: 'Rollout สาขา', first: 'ติดตั้งระบบที่สาขา', second: 'เตรียมคู่มือสาขา' },
  statuses: [ { project: 'POS Upgrade', task: 'ปรับปรุงระบบ POS หน้าร้าน', status: 'done' },
              { project: 'Data Warehouse', task: 'ย้าย pipeline ขึ้น BigQuery', status: 'waitData' },
              { project: 'CRM Migration', task: 'ตั้งค่า automation', status: 'blocked' },
              { project: 'Mobile App Revamp', task: 'ออกแบบ flow ใหม่', status: 'doing' } ],   // keys of DEFAULT_STATUSES (M3)
  blocker: { project: 'CRM Migration', task: 'ตั้งค่า automation', blockedBy: 'ย้ายข้อมูลลูกค้า' },
  pages: { kickoff: 'บันทึก kickoff', wikiRoot: 'คู่มือทีม', wikiChild: 'วิธีใช้ระบบนี้' },
  image: { file: 'scripts/assets/demo-pos-storefront.png', name: 'pos-storefront.png' },
} as const
export async function isPristine(tx: DbOrTx): Promise<boolean>                     // M12-D33
export async function addDemoTasks(tx: Tx, actor: SessionUser, today: ISODate): Promise<{ firstChildId: string; secondChildId: string }>
export async function addDemoStatuses(tx: Tx, actor: SessionUser, today: ISODate): Promise<{ changed: number; blockerId: string }>
export async function addDemoPages(tx: Tx, actor: SessionUser, today: ISODate): Promise<Pick<DemoResult, 'posCharterId' | 'kickoffPageId' | 'wikiRootId' | 'imageFileId'>>
/** M12-D34 helper shared with perf-data.ts: requirePageCreate → createPage → requirePage(edit) → renamePage → savePageContent (+ mirrored audit rows). */
export async function createFilledPage(tx: Tx, actor: SessionUser, t: { space: 'PROJECT' | 'WORKSPACE'; projectId: string | null; parentId: string | null; title: string; content: Blocks; audit?: boolean /* default true */ }): Promise<{ pageId: string; version: number }>
export async function seedDemo(db: Db, o: DemoOptions): Promise<DemoResult>           // the whole composition in ONE transaction

// scripts/lib/demo-content.ts — pure (no DB); Thai text allowed (scripts/**). No BlockNote import (browser package).
export type Blocks = BlockInput[]                    // import type { BlockInput } from '@/lib/schemas/page-content' (= M4 TemplateBlock)
/** C68: m04 S0.12 EXPORTS the one table builder every template uses — re-export it, never re-implement the shape. */
export { tableBlock } from '@/i18n/templates.th'   // tableBlock(rows: readonly (readonly string[])[]): TemplateBlock (= BlockInput)
export function fillSections(base: Blocks, fills: Readonly<Record<string, Blocks>>, tables: Readonly<Record<string, string[][]>>): Blocks
export function posCharterFills(a: { imageFileId: string; kickoffPageId: string; cindyId: string }): { fills: Record<string, Blocks>; tables: Record<string, string[][]> }
export function kickoffNotes(a: { cindyId: string; ivyId: string; mintId: string }): Blocks
export function wikiRoot(childId: string): Blocks
export function howToUseThisSystem(): Blocks

// scripts/lib/perf-data.ts
export const PERF = { users: 100, projects: 300, tasks: 20_000, assignments: 15_000, allocationsApprox: 300_000, pages: 5_000,
  pageChars: 20_000, from: '2026-09-28', gridProject: 'Perf grid', bigPage: 'หน้าทดสอบ 300 บล็อก' } as const
export interface PerfScale { projects: number; tasks: number; pages: number; pageChars: number; weeksBack: number; weeksAhead: number }
export async function addPerfBulk(tx: Tx, s: PerfScale, today: ISODate, o: { workerIds: readonly string[] }): Promise<{ projects: number; tasks: number; assignments: number; allocations: number; pages: number }>
  // workerIds = addSyntheticWorkload(...).userIds (the 95 perf-NN workers; they have no credential account and never log in)
export async function addBigPage(tx: Tx, actor: SessionUser, blocks: number): Promise<{ pageId: string }>
export async function seedPerf(db: Db, o: { scale?: Partial<PerfScale>; today: ISODate }): Promise<{ counts: Record<string, number>; ids: { gridProjectId: string; bigPageId: string; posCharterId: string } }>

// scripts/lib/perf-stats.ts — pure, unit-tested in S3
export interface Sample { endpoint: string; ms: number; status: number }
export function percentile(ms: readonly number[], p: number): number                 // nearest-rank: sorted[ceil(p/100·n) − 1]
export function summarize(samples: readonly Sample[]): { n: number; p50: number; p95: number; max: number; errors: number }
export interface Budget { id: string; endpoint: string; budgetMs: number | null; gate: boolean }
export function verdict(b: Budget, s: ReturnType<typeof summarize>): 'PASS' | 'FAIL' | 'INFO'
export function toMarkdownRow(b: Budget, s: ReturnType<typeof summarize>, v: ReturnType<typeof verdict>): string   // for PROGRESS.md

// scripts/lib/wait-for-db.ts (owned by S2 afterwards)
export async function waitForDb(url: string, o?: { timeoutMs?: number; stepMs?: number; log?: (m: string) => void }): Promise<void>  // select 1 until ok; default 60 000 / 2 000
```
`scripts/seed-demo.ts`, `scripts/seed-perf.ts`, `scripts/perf-check.ts`: `main()` stubs that print usage and exit 1. Done-check: `pnpm typecheck` clean; `pnpm lint` clean.

**S0.6 — `.env.example` final (M12-D31).** Keep every M0–M10 line; append (comments on their own lines, M0-D20):
```bash
# Reverse proxy (docker compose --profile tls). Hostname users open; must match BETTER_AUTH_URL's host.
SITE_ADDRESS=planner.company.local
# internal (LAN / .local, default) · an e-mail for public ACME · "/certs/cert.pem /certs/key.pem" for company certificates
CADDY_TLS=internal
# Backups (service "backup"): daily time in TZ above, and days to keep
BACKUP_AT=02:00
BACKUP_KEEP_DAYS=14
# Dev/test only — never in production:
# ALLOW_DEMO_SEED=1                       (lets seed:demo run with NODE_ENV=production)
# PERF_DATABASE_URL=postgres://planner:planner@localhost:54329/planner_perf
```
M0's `env.test.ts` (`.env.example ⊇ ENV_KEYS`) stays green (new keys are not app env). Done-check: `pnpm exec vitest run --project unit src/server/env.test.ts`.

**S0.7 — i18n.** No namespace is added (M12 has no UI). `th.ts` unchanged; if S1 needs an `audit` builder for a gap fix it adds it there.
Done-check: `git diff --stat src/i18n/th.ts` empty at G0.

**S0.8 — `.gitignore`.** Append `.perf-uploads/` (UPLOAD_DIR of the perf server, §6 step 6); keep every M0 line, including
`affine/` (do not list or open that folder). `test-results/` is already ignored. Done-check: `git check-ignore .perf-uploads/ affine/`
(integrator, git is not run by streams).

**S0.9 — G0.** `pnpm db:up && pnpm check` green (with `M12_ALLOW_GAPS=1` only if KNOWN_GAPS is non-empty — report it).

### 5.S1 — Seeds and audit gaps (backend-engineer · `scripts/seed-{demo,perf}.ts`, `scripts/lib/{script-user,demo,demo-content,perf-data}*`, `scripts/assets/**`, sweep files, `tests/authz/rows/**`, `src/server/{services,actions}/**` for gap fixes only)

**S1.1 — Close audit gaps (FR-1201).** Run `audit-coverage.int.test.ts`. For each `KNOWN_GAPS` entry, test-first:
(a) action exists but has no audited row → add the row(s) to the matching `tests/authz/rows/<area>.ts` (same `Key`/`PERM` style as the
area's milestone §7.2, `audit: { entity }`), (b) the row fails because the service writes no audit row → add `audit.log(tx, actor, …)` as
the service's last statement inside the caller's transaction (M1-D5) with a `th.audit.*` builder (Edit inside `audit`), (c) an entity
mismatch with `REQUIRED_ENTITY` → fix the service. Remove the entry from `KNOWN_GAPS`. Expected result from the M1–M10 plans: **no
gap** (every §7.2 table lists audited rows for every action, M10 adds none). Done-check: `pnpm exec vitest run --project integration tests/authz` green **without** `M12_ALLOW_GAPS`.

**S1.2 — `seedDemo` composition (SEED-A2, M12-D4…D10, D33). Tests first: `scripts/lib/demo.int.test.ts`.**
```ts
export async function seedDemo(db: Db, o: DemoOptions): Promise<DemoResult> {
  return db.transaction(async (tx) => {
    if (!o.reset && !(await isPristine(tx))) throw new Error('seed:demo needs an empty database (or --reset)')
    await truncateAll(tx)
    await seedGolden(tx)                       // users/positions/schedules, clients, projects+members, statuses (X70), tasks, charters (M4/M10 template), leave types, WEEK allocations
    await applyFixture(tx, 'F3')               // M12-D5: Peter ลาพักร้อน 2026-10-05..06 (A.2 วันลา)
    await addDayExample(tx)                    // M7: Mobile "Kickoff workshop", Jack + Mint 0.50 DAY 2026-09-07
    await addMilestones(tx)                    // M8: 7 A.2 milestones, UAT sign-off bound to "ทำ UAT + คู่มือหน้าร้าน" — AFTER addDayExample (C30)
    const manager = await scriptSessionUser(tx, 'manager@example.com')
    await addDemoTasks(tx, manager, o.today)   // M12-D6 nested task
    const st = await addDemoStatuses(tx, manager, o.today)   // M12-D7/D8
    const pages = await addDemoPages(tx, manager, o.today)   // M12-D9 (UPLOAD_DIR from env)
    return { counts: await countDemo(tx), ...pages }
  })
}
```
`isPristine(tx)` = `projects`, `tasks`, `pages`, `time_off` empty and `count(user) ≤ 1`. `scripts/seed-demo.ts`:
```ts
async function main(): Promise<void> {
  const reset = process.argv.includes('--reset')
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== '1') throw new Error('seed:demo refuses NODE_ENV=production (set ALLOW_DEMO_SEED=1)')
  const today = process.env.ALLOW_TEST_HOOKS === '1' && process.env.APP_NOW ? todayBangkok(new Date(process.env.APP_NOW)) : todayBangkok()
  const { db, close } = createScriptDb()
  try { const r = await seedDemo(db, { today, reset }); console.log(`seed:demo ok (today ${today})`, r.counts) } finally { await close() }
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
```
Tests (all with `today = '2026-09-30'`, actor checks via `audit_log.actor_id`; counts per M12-D28 are deltas against a `seedGolden`-only
snapshot taken in the same test file):
- **DM-01 guards** — non-pristine DB (a project exists) without `reset` → throws `/empty database/`, nothing changed (row counts equal);
  pristine DB with one bootstrap manager → runs; `NODE_ENV=production` without `ALLOW_DEMO_SEED` → `main` exits 1 (spawned via
  `pnpm exec tsx scripts/seed-demo.ts` with `DATABASE_URL` of the worker DB) and DB untouched.
- **DM-02 totals (r8 §4.11/§6.10)** — `services.workload.buildTable(tx, manager, { window: { from: '2026-08-31', to: '2027-01-04' } }, '2026-09-30')`
  summed over people: total **19 600**, committed **11 725**; Mobile total 5 975; Jack week 2026-09-07 = 300, Mint = 50; overloads =
  exactly `[{ user: Peter, week: '2026-10-05', level: 'OVER', excessCd: 200, cause: 'CAPACITY' }]`.
- **DM-03 badges (r8 §6b demo)** — `badgeCount` per viewer: Manager 1 · Cindy 1 · Ivy 0 · Peter 1 · Jack 1 · Mint 0.
- **DM-04 nested task (BR-31, X69)** — "Rollout สาขา" has 2 live children in order [ติดตั้งระบบที่สาขา, เตรียมคู่มือสาขา], both depth 1,
  status = POS default "ยังไม่เริ่ม"; Mint's assignment (same id as in golden, `version` +1) now on "ติดตั้งระบบที่สาขา" with its 5 WEEK
  rows (11-30 250 … 12-28 250); "เตรียมคู่มือสาขา" has 0 assignments; `effectiveCertainty` of both = TENTATIVE; "Rollout สาขา" has no
  assignment; POS totals unchanged 4 625 / 2 750.
- **DM-05 milestones (r8 §6.11)** — 7 milestones; UAT sign-off bound to "ทำ UAT + คู่มือหน้าร้าน", status DUE_SOON and late on 2026-09-30.
- **DM-06 statuses (M12-D7, BR-80)** — each project still has its 5 default statuses; the 4 tasks carry the target statuses; POS task
  `completed_on = '2026-09-30'`, `completed_by = Manager`; every other task `completed_on is null`; `assertCompletionInvariant(tx)`
  (M3 helper) passes; re-run DM-02 numbers unchanged (BR-87); with `today = '2027-03-01'` (second fresh seed) totals still 19 600 / 11 725.
- **DM-07 blocker (M12-D8, BR-86)** — one live edge CRM "ตั้งค่า automation" ← "ย้ายข้อมูลลูกค้า"; `GET`-equivalent
  `services.tasks.listProjectTasks(tx, manager, CRM)` shows `blockers { open: 1, total: 1 }` on "ตั้งค่า automation"; the edge row's
  `created_by` = Manager; exactly 1 `task_blocker` audit row (written by the service, `AUDIT_IN_SERVICE.addTaskBlocker`).
- **DM-08 statuses everywhere (X70)** — `select count(*) from tasks where status_id is null` = 0; every task's status belongs to its project.
- **DM-09 pages (M12-D9, C4)** — exactly one live charter per project (5); the POS charter id equals the one `seedGolden` created
  (in place); its `content` passes `pageContentSchema`; it contains (in order) the h2 headings of `charterTemplate()`, exactly one
  `taskView` (`props.view === 'BOARD'`, no `projectId` prop) and one `projectWorkload` block, still under "งานและภาระของทีม"; the
  "ผู้มีส่วนได้ส่วนเสีย" table has header + 3 rows; one `image` block with `props.url === '/api/files/' + imageFileId`; one `subpage`
  block → kickoff page; `content_text` contains `'Coral'` and the stakeholder names but no text produced by the live blocks (FR-1307);
  `version` incremented once. Other 4 charters equal their template content (`seedGolden` output, deep-equal).
- **DM-10 child pages** — "บันทึก kickoff" is a live POS page, `parent_id = posCharterId`, depth 1, contains a `mention` of Cindy and the
  B.2 headings (วาระ, สรุปการหารือ, สิ่งที่ตัดสินใจ, Action items); wiki "คู่มือทีม" (WORKSPACE, depth 0, `project_id null`) has a
  `subpage` block → "วิธีใช้ระบบนี้" (depth 1) with the B.3 headings (ก่อนเริ่ม, ขั้นตอน, ข้อควรระวัง, คำถามที่พบบ่อย).
- **DM-11 file** — 1 `files` row (`project_id = POS`, `page_id = posCharterId`, `kind = 'IMAGE'`, `mime = 'image/png'`, original name `pos-storefront.png`, size = asset byte length); the stored bytes
  under `UPLOAD_DIR` (a per-test temp dir) equal the asset; `GET /api/files/<id>` route handler as Ivy → 200 `image/png`; as Jack → 404.
- **DM-12 audit deltas** (M12-D34: exactly one row per user operation — a double row means `AUDIT_IN_SERVICE` is wrong) — new `audit_log`
  rows vs the `seedGolden` snapshot: actor-`null` builder rows exactly as those builders' own tests pin them (`addMilestones` 7 `milestone`,
  M8-D20; `applyFixture('F3')` ≥ 1 `time_off`, M5-D2; `addDayExample`'s actor-`null` rows per m07 S0.7) — snapshot each builder's delta in
  the same test rather than re-typing it; **Manager-actor** rows: `task_blocker` **1**, `file` **1**, `task` **6** (2 creates + 4 status
  changes, `th.audit.taskCreated`/`taskStatusChanged`), `page` **10** (3 creates + 3 renames + 4 saves: kickoff, charter, wiki child, wiki root); every Manager-actor row has a non-empty `summary`; none contains page content
  (`'Coral ฝ่ายไอที'` absent from `JSON.stringify(rows)`); actors are `null` (builders) or Manager.
Done-check: `pnpm exec vitest run --project integration scripts/lib/demo.int.test.ts`.

**S1.3 — `addDemoTasks` (M12-D6, M12-D34).** Resolve POS and "Rollout สาขา" by name (throw if missing); `requireProject(tx, manager, POS, 'edit')`;
call the M3 `createTask` service as `manager` with `{ projectId, parentId: rollout.id, name: DEMO.nested.first }` and `today`
(it locks the parent, performs the FR-610 transfer `UPDATE task_assignments SET task_id = child, version = version + 1`, sets the
default status); then `audit.log(tx, manager, { entity: 'task', action: 'create', entityId, projectId, summary: th.audit.taskCreated(name), after: { parentId, transfer } })`
exactly as the action does (skip when `AUDIT_IN_SERVICE.createTask`); repeat for `{ …, name: DEMO.nested.second, afterId: first.id }`.
Never insert tasks with plain SQL here (BR-31 must run).

**S1.3b — `addDemoStatuses` (M12-D7, M12-D8, M12-D34).** For each `DEMO.statuses` item: resolve the task by project + name; `statusId` =
the live status of that project whose name is `th.tasks.status.defaults[key]` (`listStatuses`); `acc = requireTasks(tx, manager, [taskId], 'edit')`;
`r = setStatus(tx, manager, { projectId: acc.projectId, taskIds: [taskId], statusId, withChildren: false }, today)` (m03 signature, M3-D43);
for each `r.changed` → `audit.log(… { entity: 'task', action: 'update', entityId, projectId, summary: th.audit.taskStatusChanged(taskName, statusName) })`
(skip when `AUDIT_IN_SERVICE.setStatus`). Blocker: `requireTask(tx, manager, blocked.id, 'edit')` →
`services.taskBlockers.addTaskBlocker(tx, manager, { taskId: blocked.id, blockerTaskId: blocker.id })` (cycle check; the service audits) →
`created: true` expected, else throw. Returns `{ changed: 4, blockerId }`.

**S1.4 — `addDemoPages` (M12-D9, M12-D34).** m04's `createPageSchema` has **no title** (a new page is blank; the title is set by
`renamePage`), so `createFilledPage` = `requirePageCreate(tx, actor, { space, projectId, parentId })` → `row = createPage(tx, actor, { space, projectId, parentId })`
→ audit `th.audit.pageCreated('')` → `a = requirePage(tx, actor, row.id, 'edit')` → `renamePage(tx, actor, a, title)` → audit `pageRenamed('', title)`
→ if `content.length > 0`: `pageContentSchema.parse(content)` (the action's zod step) → `savePageContent(tx, actor, requirePage(…, 'edit'), { baseVersion: <current version>, content })`
→ audit `pageSaved(title)` with `after: { version }` (never content). Audit calls follow `AUDIT_IN_SERVICE`; `t.audit = false` (perf big page) skips them.
1. `posCharter = select … from pages where project_id = POS and is_charter and deleted_at is null` (exactly one; throw otherwise);
   `chAccess = requirePage(tx, manager, posCharter.id, 'edit')`.
2. Kickoff page: `createFilledPage(tx, manager, { space: 'PROJECT', projectId: POS, parentId: posCharter.id, title: DEMO.pages.kickoff, content: kickoffNotes(ids) })`.
3. Image: `bytes = readFileSync(DEMO.image.file)`; `storeUpload(tx, manager, chAccess, { name: DEMO.image.name, bytes, purpose: 'content', limits: uploadLimits(), today })`
   → `imageFileId` (classification, size check, storage key from `newStorageKey(today, ext)`, `files` row with the page's project); then the
   route's audit `{ entity: 'file', action: 'create', entityId: file.id, projectId: POS, summary: th.audit.fileUploaded(name) }`.
4. Charter: `base = posCharter.content` (already the M10 template incl. "งานและภาระของทีม"); `{ fills, tables } = posCharterFills(…)`;
   `content = pageContentSchema.parse(fillSections(base, fills, tables))`; `savePageContent(tx, manager, chAccess, { baseVersion: posCharter.version, content })` + audit `pageSaved`.
5. Wiki: `root = createFilledPage(… { space: 'WORKSPACE', projectId: null, parentId: null, title: 'คู่มือทีม', content: [] })` (no save yet), then
   `child = createFilledPage(… { parentId: root.pageId, title: 'วิธีใช้ระบบนี้', content: howToUseThisSystem() })`, then save `wikiRoot(child.pageId)`
   into the root (+ `pageSaved`). Page audit rows: 3 creates + 3 renames + 4 saves (kickoff, charter, wiki child, wiki root) = 10 (DM-12).
Services run their own sanitising (`^/api/files/<uuid>$` urls, hrefs) — a rejected block fails the test, never silently.

**S1.5 — `demo-content.ts` (pure, Thai allowed). Tests first: `scripts/lib/demo-content.test.ts` (unit).**
- `fillSections(base, fills, tables)`: walks top-level blocks; after each `heading` (level 2/3) whose plain text is a key of `fills`,
  inserts those blocks right after the heading, replacing a directly following template placeholder (an empty paragraph or a checklist
  item whose text is `…`); other template blocks stay; for each key of `tables`, replaces the first `table` block after that heading
  with `tableBlock(rows)` (C68: imported from m04's `src/i18n/templates.th.ts`, which exports it — no local copy, never an edit of
  `templates.th.ts`). Blocks of `LIVE_BLOCK_TYPES` are copied unchanged and never moved.
  Unknown heading keys throw (catches template drift).
  Tests: base = `charterTemplate({ clientName: 'Coral', leadName: 'Cindy', certaintyLabel: th.projects.certainty.CONFIRMED }).content`;
  **shape guard** — the re-exported `tableBlock([['ชื่อ / หน่วยงาน','บทบาท','ความคาดหวัง','ช่องทางติดต่อ'],['','','','']])` deep-equals the template's
  "ผู้มีส่วนได้ส่วนเสีย" table block ignoring `id` (proves `fillSections` finds the table M4 builds); fills for "ที่มาและปัญหา" →
  that paragraph follows the heading; tables for "ผู้มีส่วนได้ส่วนเสีย" → 4 rows incl. header; live blocks: same ids/props and same index
  relative to "งานและภาระของทีม"; `pageContentSchema.parse(result)` ok; unknown key `'ไม่มีหัวข้อนี้'` → throws.
- `posCharterFills`: one-paragraph summary under the 📋 quote ("ยกระดับระบบ POS หน้าร้านของ Coral ให้ขายได้เร็วขึ้น … ก่อน Go-live สาขาแรก 21 ธ.ค. 2569");
  ข้อมูลโปรเจค table untouched (template already holds client/lead/certainty); ที่มาและปัญหา; วัตถุประสงค์ (3 checklist items);
  ขอบเขตงาน › อยู่ใน/ไม่อยู่ในขอบเขต (bullets); ผลลัพธ์ที่ส่งมอบ table (3 rows: ระบบ POS เวอร์ชันใหม่ · คู่มือหน้าร้าน · Rollout สาขาแรก
  with dates 2569); "Milestones สำคัญ" untouched; ทีมงานและบทบาท table (Cindy LEAD / Ivy QA / Mint Developer); ผู้มีส่วนได้ส่วนเสีย table
  (Coral ฝ่ายปฏิบัติการสาขา · ผู้ใช้หลัก · ขายลื่นไม่สะดุด · LINE กลุ่ม POS; Coral ฝ่ายไอที · เจ้าของระบบ · ย้ายข้อมูลครบ · อีเมล;
  ผู้จัดการสาขานำร่อง · ผู้ทดสอบ UAT · อบรมก่อนใช้งาน · โทรศัพท์); ความเสี่ยงฯ table (2 rows); เกณฑ์ความสำเร็จ (2 checklist);
  การสื่อสาร (ประชุมประจำ: ทุกวันจันทร์ 10:00 · ช่องทางหลัก: LINE กลุ่ม POS · บันทึกการประชุม: `subpage` → kickoff) and the image
  (`{ type: 'image', props: { url: '/api/files/<id>', name, caption: 'ตัวอย่างหน้าจอขายหน้าร้าน' } }`) under ที่มาและปัญหา.
- `kickoffNotes`: B.2 structure with วาระ / สรุปการหารือ / สิ่งที่ตัดสินใจ / Action items (checklist with a user `mention` of Cindy, Ivy, Mint).
- `howToUseThisSystem`: B.3 structure; ขั้นตอน = numbered list (เปิดหน้าหลัก, วางแผนในแท็บแผนงาน, แจ้งลา, Cmd+K ค้นหา, แบ่งงานบนบอร์ด).
Done-check: `pnpm exec vitest run --project unit scripts/lib/demo-content.test.ts`.

**S1.6 — `seedPerf` composition (SEED-PERF, NFR-01, M12-D11). Tests first: `scripts/lib/perf-data.int.test.ts` at a reduced scale.**
```ts
export async function seedPerf(db: Db, o: { scale?: Partial<PerfScale>; today: ISODate }) {
  const s: PerfScale = { projects: 300, tasks: 20_000, pages: 5_000, pageChars: 20_000, weeksBack: 78, weeksAhead: 78, ...o.scale }
  return db.transaction(async (tx) => {
    await truncateAll(tx); await seedGolden(tx)                                              // 6 users, 5 projects, golden tasks, 57 WEEK allocations
    const grid = await addSyntheticGridProject(tx, { tasks: 200, weeks: 16, from: PERF.from })   // M6: "Perf grid", 220 tasks, 200 assignments, 3 200 rows, NO audit rows (X92), client_id null
    const wl = await addSyntheticWorkload(tx, { people: 95, projects: 20, weeks: 12, from: PERF.from }) // M9: 95 users, 20 projects (client_id null), 190 tasks, 2 280 rows, NO audit (X92, C85); no charters (C100)
    const bulk = await addPerfBulk(tx, s, o.today, { workerIds: wl.userIds })                 // tops up to s.projects / s.tasks / s.pages; ensureProjectCharters gives the 21 synthetic + bulk projects their charters
    const big = await addBigPage(tx, await scriptSessionUser(tx, 'manager@example.com'), 300)
    await tx.execute(sql`analyze`)                                                             // planner statistics for the measurement
    return { counts: await countAll(tx), ids: { gridProjectId: grid.projectId, bigPageId: big.pageId, posCharterId: await posCharterId(tx) } }
  })
}
```
`scripts/seed-perf.ts`: `assertNotProduction()`; `url = process.env.PERF_DATABASE_URL ?? 'postgres://planner:planner@localhost:54329/planner_perf'`;
refuse when `url` equals `DATABASE_URL` of `.env` (never wipe the dev DB) unless `--allow-dev-db`; create the database if missing (admin
connection to `/postgres`, `CREATE DATABASE planner_perf TEMPLATE template0 LC_CTYPE 'en_US.utf8'`), `runMigrations(url)`, then
`seedPerf`; print counts and elapsed time. `today` is **fixed** to `'2026-09-30'` (not M12-D10's real date), because the perf
server runs with that `APP_NOW` and the measured windows must contain the generated data (M12-D13).
Tests (`perf-data.int.test.ts`, scale `{ projects: 40, tasks: 1 000, pages: 50, pageChars: 2 000, weeksBack: 8, weeksAhead: 8 }`):
- counts: projects = 40 = 5 golden + 1 "Perf grid" + 20 "Perf workload NN" + 14 bulk (archived ≈ 10 %, tentative ≈ 25 % among bulk);
  users = 6 + 95 = 101; tasks ≥ 1 000, every task has `status_id` of its project (X70), depth ≤ 2 and `parent.depth = depth − 1`,
  assignments only on leaves (BR-31), no assignment of a deactivated user; DONE tasks ⇔ `completed_on` not null (`assertCompletionInvariant`);
- C85 / X92 consistency: the 20 "Perf workload NN" projects and "Perf grid" have `client_id is null`; `clients` = golden + 30; `audit_log` count
  after `seedPerf` = the count after `seedGolden` alone (snapshot in the same test) **+ one actor-`null` `page` row per charter that
  `ensureProjectCharters` creates inside `addPerfBulk`** (M4-D5; = `projects − 5`, i.e. 35 at this scale) — `addSyntheticGridProject`,
  `addSyntheticWorkload` (X92), the bulk SQL and `addBigPage` (no mirrored rows) add **0**; before `addPerfBulk` the 21 synthetic projects have no charter (C100);
- allocations: every row's `week_start` is a Monday inside `[today − 8 w, today + 8 w)`; no (assignment, week) has both WEEK and DAY rows
  (the M6 trigger + exclusion constraint would reject it anyway); DAY rows ≤ 1.00, on Mon–Fri; bulk assignments have 1 DAY week in 16 (6.25 %);
- pages: 50 bulk + charters for every project (`ensureProjectCharters`), `content_text` length ≈ `pageChars` (± 10 %), all pass
  `pageContentSchema` (sample of 5);
- the big page has exactly 300 top-level blocks and passes `pageContentSchema`;
- `seedPerf` twice → identical counts (idempotent via truncate).
Done-check: `pnpm exec vitest run --project integration scripts/lib/perf-data.int.test.ts` (< 60 s).

**S1.7 — `addPerfBulk` (SQL, M12-D11).** Inside the caller's tx, in this order (each one statement with `generate_series`; ids via
`gen_random_uuid()` from pgcrypto, M0 extension):
1. clients: 30 `Perf client NN`; projects: `s.projects − <existing>` rows `Perf project NNN` (client round-robin, 25 % TENTATIVE,
   10 % archived), then `ensureAllProjectStatuses(tx)` (M3) and `ensureProjectCharters(tx)` (M4) — both idempotent loops;
2. members: each bulk project gets 1 LEAD + 4–8 MEMBERs from `o.workerIds` (deterministic `workerIds[(project_no * k) % workerIds.length]`);
3. tasks: until `count(tasks) = s.tasks` — per project a 3-level tree (≈ 25 % depth 0 parents, 50 % leaves at depth 1, 25 % at depth 2),
   positions from `generateNKeysBetween(null, null, n)` computed in TypeScript per sibling group and passed as an array parameter
   (orderKey `COLLATE "C"`, X48), `status_id` = the project's default status (`DEFAULT_STATUSES` TODO key) and 10 % moved to the
   project's DONE status with `completed_on` in the past and `completed_by` = the project's LEAD (BR-80 consistent: `completed_on` ⇔ DONE);
4. assignments: leaves get one assignment each (user = a member of the project) until `count(task_assignments)` = `PERF.assignments`
   (15 000 incl. the ≈ 400 golden + builder assignments; at reduced scale: every bulk leaf);
5. allocations: per bulk assignment a run of 16 consecutive weeks starting at a deterministic Monday in `[today − weeksBack w, today + weeksAhead w − 16 w]`
   (clamped to the first Monday when the range is empty at reduced scale): 15 WEEK rows (`person_days` ∈ {0.25 … 2.50} step 0.25) and
   1 DAY week written as 5 DAY rows (Mon–Fri) of 0.25–1.00. WEEK and DAY go in two separate statements; no (assignment, week) gets both,
   so the M6 trigger and exclusion constraint (left enabled) never fire. Expected ≈ 14 600 × 20 ≈ 292 000 + 5 537 builder rows ≈ 300 000.
   Every query that reads `allocations` carries `week_start` bounds;
6. pages: `s.pages − count(pages)` bulk pages: 70 % in projects (1–3 levels deep), 30 % wiki; content = 10–40 paragraphs of a Thai/English
   sample sentence + `md5(i)` (unique tokens for trigram realism) up to `pageChars`; `content_text` computed in SQL as the concatenation
   (same text the walker would produce for plain paragraphs — the test checks a sample with `extractContentText`);
7. time off: 285 entries (3 per synthetic worker) of 1–3 days, all `leave_type_id` = ลาพักร้อน, never overlapping (one per month per person);
   no holidays except the F2 date 2026-10-23 (one row) so capacity code paths run.
Bulk rows are **not audited** (M12-D11); the only audit rows `addPerfBulk` causes are `ensureProjectCharters`' actor-`null` charter rows (M4-D5). No trigger is disabled.

**S1.8 — `addBigPage` (NFR-05).** `createFilledPage(tx, manager, { space: 'PROJECT', projectId: POS, parentId: null, title: PERF.bigPage, content, audit: false })`
(S1.4 chain: authz + `createPage` + `renamePage` + `savePageContent`, no mirrored audit rows — perf data) with 300 top-level blocks:
30 groups × 10 blocks = [h2, 4 paragraphs (~200 chars), 3 bulletListItem, 1 checkListItem, 1 more paragraph — replaced by a 4 × 3
`tableBlock` in every third group] — total exactly 300, < 2 MB (zod cap).

**S1.9 — tsx import check + done-check.** `scripts/lib/script-user.int.test.ts`: `scriptSessionUser(tx, 'manager@example.com')` returns
`Object.keys(u).sort()` = `['color','email','id','mustChangePassword','name','nickname','positionId','role','sessionId','sessionToken']`
(M1 `SessionUser`; no password/hash field), `role 'manager'`, `mustChangePassword false`, `sessionId 'script'`; unknown e-mail → throws;
a banned user → throws.
Spawn `pnpm exec tsx -e "require('./scripts/lib/demo'); require('./scripts/lib/perf-data')"` → exit 0 (no `server-only` in the graph).
Manual (stream, dev DB): `pnpm seed:demo --reset` prints counts; `pnpm seed:perf` (full scale) completes and prints elapsed time (target
< 10 min; record it). Done-check: `pnpm exec vitest run --project integration scripts tests/authz` · `pnpm exec eslint scripts tests/authz src/server --max-warnings 0` · `pnpm typecheck` (own paths clean).

### 5.S2 — Docker, compose, backup, Caddy, README, deploy scripts (platform-engineer · `docker/**` except the dev compose, `.dockerignore`, `README.md`, `scripts/migrate.ts`, `scripts/lib/wait-for-db*`, `scripts/*.sh`, `tests/deploy/**`)

Streams do not run `docker compose up` of the full stack in parallel with the integrator's builds; S2 may build images (`docker build`
does not touch `.next` of the checkout because the context excludes it) and run single containers for its checks. The dev compose
(`docker/docker-compose.dev.yml`, M0) is not changed.

**S2.0 — Static deploy tests first: `tests/deploy/files.test.ts` (unit; reads files as text, no YAML library).**
- `docker-compose.yml`: first non-comment line `name: planner`; contains no `${`; services `db, migrate, app, backup, caddy` each have
  `env_file: ../.env`; db healthcheck contains `pg_isready -h 127.0.0.1 -U planner -d planner`; db command has `timezone=UTC` and
  `log_timezone=Asia/Bangkok` and db environment sets `TZ: UTC`; migrate `target: builder`, command `pnpm db:migrate && pnpm bootstrap`,
  `NODE_ENV: production`; app `target: runner`, `3000:3000`, `uploads:/data/uploads`, depends on migrate `service_completed_successfully`;
  backup `postgres:17`, `uploads:/data/uploads:ro`, `backups:/backups`; caddy `profiles: [tls]`; volumes `pgdata uploads backups caddy_data`;
  never `ALLOW_TEST_HOOKS` / `APP_NOW` (X45).
- `Dockerfile`: stages `deps`, `builder`, `runner` in order; runner `FROM node:22-alpine`; `USER nextjs`; `chown nextjs:nodejs /data/uploads`
  before `USER`; `HOSTNAME=0.0.0.0`; copies `.next/standalone`, `.next/static`, `public`; `CMD ["node", "server.js"]`; `pnpm@12.8.1`;
  `--frozen-lockfile`; no `ENV BETTER_AUTH_SECRET` / `ENV DATABASE_URL` lines (placeholders only inline in the build `RUN`).
- `.dockerignore`: contains `affine/`, `.env`, `!.env.example`, `node_modules`, `.next`, `.git`, `uploads`, `backups`, `.e2e-uploads`.
- `backup.sh`: starts with `#!/bin/sh` and `set -eu`; has `once`; uses `.tmp` + `mv`; `-mtime`; `pg_dump -Fc`; `tar czf` with `-C /data uploads`.
- `Caddyfile`: `{$SITE_ADDRESS}`, `reverse_proxy app:3000`, `tls {$CADDY_TLS:internal}`.
- `.env.example` (M12-D31 keys present) and README section headings (S2.6 list) present.
Done-check: `pnpm exec vitest run --project unit tests/deploy`.

**S2.1 — `docker/Dockerfile` (DEP-14, M12-D16).** Start from `plan/research/snippets/r1/Dockerfile` + r1 §12.10:
```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.8.1 && pnpm --version
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store CI=1 pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 pnpm_config_verify_deps_before_run=false
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build \
    BETTER_AUTH_SECRET=build-placeholder-secret-0123456789abcdef \
    BETTER_AUTH_URL=http://localhost:3000 \
    CI=1 pnpm build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 UPLOAD_DIR=/data/uploads
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
```
Notes: the Dockerfile has no inline comments after instructions (r1); `devEngines.runtime` makes `pnpm install` record `node@runtime`
(linux musl variant) in `node_modules`, so `pnpm` scripts in the builder image never download Node at run time (r1 §10.3) — verified
by the done-check with `--network none`. `outputFileTracingRoot` (M0) keeps `server.js` at the standalone root.
Done-check (S2 runs these):
```bash
docker build -f docker/Dockerfile --target runner -t planner-app:dev .
docker build -f docker/Dockerfile --target builder -t planner-builder:dev .
docker run --rm --network none planner-builder:dev sh -c 'pnpm exec node -v && pnpm exec tsx --version'   # v22.23.x, no download attempt
docker run --rm planner-app:dev id -u                                                                      # 1001
docker run --rm planner-app:dev sh -c 'stat -c %U /data/uploads && ls server.js .next/static public >/dev/null'   # nextjs
docker image inspect planner-app:dev --format '{{json .Config.Env}}' | grep -v -E 'BETTER_AUTH_SECRET|DATABASE_URL'  # no placeholders baked in
printf 'FROM busybox:1.36\nCOPY . /ctx\nRUN test ! -e /ctx/affine && test ! -e /ctx/.env && test ! -e /ctx/node_modules && test ! -e /ctx/.git && test -e /ctx/.env.example\n' \
  | docker build -f - .                                                                                     # build-context check (M12-D30)
```

**S2.2 — `.dockerignore` (M12-D30).**
```
.git
.next
node_modules
.env
.env.*
!.env.example
affine/
uploads/
backups/
.e2e-uploads/
coverage/
playwright-report/
test-results/
blob-report/
plan/
.claude/
docs/**/*.xlsx
*.log
```
`docs/reference/golden-fixtures.json` stays in the context (the builder image runs `seed:demo`, which reads it). Done-check: S2.1 context check.

**S2.3 — `docker/docker-compose.yml` (DEP-01…06, X69, M12-D14/D15).** Start from r6b §4.11:
```yaml
name: planner
services:
  db:
    image: postgres:17
    env_file: ../.env
    environment:
      POSTGRES_DB: planner
      POSTGRES_USER: planner
      TZ: UTC
    command: ['postgres', '-c', 'timezone=UTC', '-c', 'log_timezone=Asia/Bangkok']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U planner -d planner']
      interval: 5s
      timeout: 3s
      retries: 30
    restart: unless-stopped

  migrate:
    image: planner-builder
    build: { context: .., dockerfile: docker/Dockerfile, target: builder }
    command: ['sh', '-c', 'pnpm db:migrate && pnpm bootstrap']
    env_file: ../.env
    environment:
      NODE_ENV: production
      pnpm_config_verify_deps_before_run: 'false'
    volumes: ['uploads:/data/uploads']
    depends_on: { db: { condition: service_healthy } }
    restart: 'no'

  app:
    image: planner-app
    build: { context: .., dockerfile: docker/Dockerfile, target: runner }
    env_file: ../.env
    ports: ['3000:3000']
    volumes: ['uploads:/data/uploads']
    depends_on: { migrate: { condition: service_completed_successfully } }
    restart: unless-stopped

  backup:
    image: postgres:17
    entrypoint: ['/bin/sh', '/backup.sh']
    env_file: ../.env
    volumes: ['./backup.sh:/backup.sh:ro', 'backups:/backups', 'uploads:/data/uploads:ro']
    depends_on: { db: { condition: service_healthy } }
    restart: unless-stopped

  caddy:
    image: caddy:2
    profiles: [tls]
    env_file: ../.env
    ports: ['80:80', '443:443']
    volumes: ['./Caddyfile:/etc/caddy/Caddyfile:ro', 'caddy_data:/data']
    depends_on: { app: { condition: service_healthy } }
    restart: unless-stopped

volumes: { pgdata: {}, uploads: {}, backups: {}, caddy_data: {} }
```
`POSTGRES_PASSWORD` comes from `.env` (only used at first init); `DATABASE_URL` in `.env` must use host `db` and the same password
(README). `PORT`/`HOSTNAME` come from the image. Done-check: `cp .env.example /tmp/m12.env` is **not** enough for `config` because the
path is fixed — run `docker compose -f docker/docker-compose.yml config -q` with a repo-root `.env` present (the dev `.env` is fine for a
syntax check) → exit 0; `docker compose -f docker/docker-compose.yml config --volumes` → `pgdata uploads backups caddy_data`;
`… config | grep -c 'name: planner'` → 1.

**S2.4 — `docker/backup.sh` (DEP-12, NFR-10, M12-D17).** Copy r6b §4.11 verbatim (it was executed in `postgres:17`), with
`KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"`, `AT="${BACKUP_AT:-02:00}"`, a log line per run (`$(date -Iseconds) backup ok: db-$stamp.dump (<size> bytes)`),
and `umask 077` (dumps contain password hashes). Tests: `tests/deploy/backup.int.test.ts` (integration project — needs the dev DB and Docker; `describe.skipIf(!dockerAvailable())`):
run `docker run --rm -v <tmp>/backups:/backups -v <tmp>/uploads:/data/uploads:ro -e DATABASE_URL=<dev DB via host.docker.internal or --network host>
-v $PWD/docker/backup.sh:/backup.sh:ro postgres:17 sh /backup.sh once` → files `db-YYYYMMDD.dump` + `uploads-YYYYMMDD.tgz` exist,
no `*.tmp`; `pg_restore --list` of the dump exits 0; with a pre-created `db-20000101.dump` touched to 30 days ago (`touch -d`), a second
`once` run deletes it and keeps today's; `sh -n docker/backup.sh` exits 0. Done-check: `pnpm exec vitest run --project integration tests/deploy/backup.int.test.ts`.

**S2.5 — `docker/Caddyfile` (DEP-05, M12-D18).**
```caddyfile
{$SITE_ADDRESS} {
	encode zstd gzip
	tls {$CADDY_TLS:internal}
	reverse_proxy app:3000
}
```
Done-check: `docker run --rm -e SITE_ADDRESS=planner.company.local -e CADDY_TLS=internal -v $PWD/docker/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2 caddy adapt --config /etc/caddy/Caddyfile`
→ JSON with an `internal` issuer; again with `CADDY_TLS='/certs/cert.pem /certs/key.pem'` → `load_files` with both paths (proves the
two-token expansion; if Caddy rejects it, switch to two variables `CADDY_TLS_CERT`/`CADDY_TLS_KEY` and record the change).

**S2.6 — `README.md` (DEP-13, r6b M11-09).** English with Thai UI words where users see them; sections (exact headings, checked by S2.0):
1. `## Requirements` — Docker Engine ≥ 24 + Compose v2, 2 vCPU / 4 GB RAM / 20 GB disk, ports 3000 (or 80/443 with Caddy).
2. `## Configure (.env)` — `cp .env.example .env`; `openssl rand -base64 32` for `BETTER_AUTH_SECRET` and the DB password; set
   `POSTGRES_PASSWORD` and the same password in `DATABASE_URL` (host `db`); `BETTER_AUTH_URL` = the URL users open; `SECURE_COOKIES=false`
   only for plain HTTP on a LAN (with `true` over http nobody can log in); `TZ=Asia/Bangkok`; `INITIAL_MANAGER_*`.
3. `## First start` — `docker compose -f docker/docker-compose.yml up -d --build`; `migrate` runs migrations + bootstrap (initial manager,
   6 positions, 4 leave types, charters/statuses backfill) and exits; open the URL, log in, forced password change (FR-104); then
   **remove `INITIAL_MANAGER_PASSWORD` from `.env`**; `docker compose … ps` shows `app` healthy.
4. `## HTTPS` — option A company reverse proxy (must forward `Host`/`X-Forwarded-Host` + `X-Forwarded-For`; set `TRUSTED_PROXIES`;
   `SECURE_COOKIES=true`); option B bundled Caddy: `docker compose --profile tls …`, `SITE_ADDRESS`, `CADDY_TLS` (`internal` → install
   the root CA from `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .` on client machines; e-mail → public ACME;
   cert paths → mount `./certs:/certs:ro`); the app's port 3000 can then be closed on the host firewall.
5. `## Holidays` — Settings › วันหยุด CSV import (format from FR-901) or `docker compose run --rm migrate pnpm import:holidays /path`
   (file copied in with `docker compose cp`); holidays are never pre-seeded (D9).
6. `## Backups` — what/when (`backup` service, 02:00 `BACKUP_AT`, 14 days `BACKUP_KEEP_DAYS`, volume `planner_backups`); list them
   (`docker compose … exec backup ls -l /backups`); manual run (`docker compose … exec backup sh /backup.sh once`); copy off the host
   (`docker run --rm -v planner_backups:/b -v $PWD:/out postgres:17 sh -c 'cp /b/* /out/'`) and keep an off-site copy; dumps contain
   password hashes → store them like secrets.
7. `## Restore` — M12-D26 steps verbatim (stop app → `run --rm --entrypoint sh backup -c 'pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /backups/db-YYYYMMDD.dump'`
   → `docker run --rm -v planner_uploads:/data/uploads -v planner_backups:/backups postgres:17 sh -c 'tar xzf /backups/uploads-YYYYMMDD.tgz -C /data'`
   → `start app`); "a plain `run backup` would start the backup loop"; rehearse every quarter (`scripts/restore-rehearsal.sh`).
8. `## Upgrade` — `backup.sh once` → `git pull` (or `docker load` new images) → `up -d --build` (migrate applies new migrations, app
   restarts) → check `/api/health` and log in; rollback = previous image + restore of the pre-upgrade dump.
9. `## Offline install` — on a connected machine: `docker buildx build --platform linux/amd64 -f docker/Dockerfile --target runner -t planner-app --load .`
   and `--target builder -t planner-builder`; `docker pull --platform linux/amd64 postgres:17 caddy:2`; `docker save planner-app planner-builder postgres:17 caddy:2 | gzip > planner-images.tgz`;
   copy the tarball + the repo (or just `docker/` + `.env.example`) to the server; `docker load < planner-images.tgz`;
   `docker compose -f docker/docker-compose.yml up -d --no-build`. The app needs no internet at run time (NFR-09).
10. `## Demo data` — local `pnpm seed:demo [--reset]`; Docker: `docker compose … run --rm -e ALLOW_DEMO_SEED=1 migrate sh -c "pnpm seed:demo --reset && chown -R 1001:1001 /data/uploads"`
    (replaces all data with the A.2 demo; logins `<nickname>@example.com` / `demo1234`, the bootstrap manager is gone) — never on a real install.
11. `## Troubleshooting` — login loops / no cookie (`SECURE_COOKIES` vs http), "Invalid Server Actions request" / origin mismatch
    (`BETTER_AUTH_URL`, proxy `Host`), `EACCES` on uploads (bind mounts must be owned by uid 1001), db unhealthy during first init (wait;
    TCP healthcheck), `migrate` exit 1 (wrong password in `DATABASE_URL`, `INITIAL_MANAGER_*` missing/invalid under production rules),
    port 3000 in use, lockout via spoofed `X-Forwarded-For` without a proxy (R-M1-8: deploy behind a proxy and set `TRUSTED_PROXIES`).
12. `## Development` — `npm install -g pnpm@12.8.1 --allow-scripts=pnpm` (Node 26 has no corepack; pnpm downloads Node 22 itself),
    `pnpm install`, `pnpm db:up`, `pnpm db:migrate`, `pnpm seed:golden`, `pnpm dev`, `pnpm check`, `pnpm test:e2e`; never `npm`/`npx` in the repo;
    the `affine/` folder (if present) is an unrelated local experiment, ignored by git and Docker.
Done-check: S2.0 headings test; `grep -n "pg_restore --clean --if-exists --no-owner" README.md`.

**S2.7 — `scripts/migrate.ts` + `scripts/lib/wait-for-db.ts` (X69 migrate retry).** `migrate.ts`: `await waitForDb(url)` before
`runMigrations(url)`. `waitForDb`: loop `postgres(url, { max: 1, connect_timeout: 3 })` + `select 1`; on error code `ECONNREFUSED`,
`57P03` (cannot_connect_now), `ENOTFOUND` retry every 2 s up to 60 s, logging `waiting for database (n)…` without the URL; auth errors
(`28P01`) fail immediately with "check POSTGRES_PASSWORD vs DATABASE_URL". Tests first `scripts/lib/wait-for-db.int.test.ts`: dev DB →
resolves on first try; `postgres://planner:planner@127.0.0.1:1/x` with `timeoutMs: 3000, stepMs: 500` → rejects after ≈ 3 s with
`/database not reachable/`; wrong password → rejects at once with `/POSTGRES_PASSWORD/`; never logs the password (spy on `log`).
Done-check: `pnpm exec vitest run --project integration scripts/lib/wait-for-db.int.test.ts` and `pnpm db:migrate` still prints "migrations applied".

**S2.8 — `scripts/deploy-smoke.sh` + `scripts/restore-rehearsal.sh` (DEP-15, M12-D20, M12-D26).**
```bash
#!/usr/bin/env bash
# deploy-smoke.sh — clean-machine smoke: fresh copy, fresh volumes, compose project "planner-smoke"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WORK="$(mktemp -d)"; P=planner-smoke
lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && { echo "port 3000 is busy"; exit 1; }
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude affine --exclude uploads --exclude backups \
  --exclude .e2e-uploads --exclude test-results --exclude playwright-report --exclude coverage --exclude '.env' "$ROOT/" "$WORK/"
PW="$(openssl rand -hex 16)"; MGR_PW="Smoke-$(openssl rand -hex 6)"
cat > "$WORK/.env" <<ENV
DATABASE_URL=postgres://planner:${PW}@db:5432/planner
POSTGRES_PASSWORD=${PW}
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=http://localhost:3000
SECURE_COOKIES=false
UPLOAD_DIR=/data/uploads
TZ=Asia/Bangkok
INITIAL_MANAGER_EMAIL=boss@smoke.local
INITIAL_MANAGER_NAME=Smoke Manager
INITIAL_MANAGER_PASSWORD=${MGR_PW}
ENV
DC=(docker compose -p "$P" -f "$WORK/docker/docker-compose.yml")
cleanup() { "${DC[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"${DC[@]}" up -d --build --wait db app backup          # migrate runs as app's dependency
export DEPLOY_BASE_URL=http://localhost:3000 DEPLOY_COMPOSE_PROJECT="$P" DEPLOY_COMPOSE_FILE="$WORK/docker/docker-compose.yml" \
       DEPLOY_MANAGER_EMAIL=boss@smoke.local DEPLOY_MANAGER_PASSWORD="$MGR_PW"
(cd "$ROOT" && pnpm exec playwright test -c playwright.deploy.config.ts)
```
`restore-rehearsal.sh <project> <compose-file>`: `exec backup sh /backup.sh once` → note the stamp → caller mutates data → `stop app` →
`run --rm --entrypoint sh backup -c 'pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /backups/db-<stamp>.dump'` →
`docker run --rm -v <project>_uploads:/data/uploads -v <project>_backups:/backups postgres:17 sh -c 'tar xzf /backups/uploads-<stamp>.tgz -C /data'` →
`start app` → wait for `/api/health`. The deploy spec (S4.3) calls it through `execFileSync`. Both scripts: `bash -n` in `tests/deploy/files.test.ts`.
Done-check: `bash -n scripts/deploy-smoke.sh scripts/restore-rehearsal.sh`; the full run is the integrator's (G2).

**S2.9 — Offline check (NFR-09, M12-D23).** `docker/docker-compose.offline.yml` (override, used only by the script):
```yaml
networks: { offline: { internal: true } }
services:
  db: { networks: [offline] }
  migrate: { networks: [offline] }
  app: { networks: [offline], ports: !reset [] }
  probe:
    image: planner-app
    networks: [offline]
    depends_on: { app: { condition: service_healthy } }
    entrypoint: ['sh', '-c']
    command: ['wget -qO /tmp/h http://app:3000/api/health && wget -qO /tmp/l http://app:3000/login && for a in $(grep -o "/_next/static/[^\"]*" /tmp/l | sort -u); do wget -qO /dev/null "http://app:3000$a" || exit 1; done && echo OFFLINE-OK']
```
`scripts/offline-check.sh`: same temp-copy + `.env` approach as S2.8 with project `planner-offline`; images must already exist
(`--no-build` after a prior build, so pulling is not needed on the internal network); `up --abort-on-container-exit --exit-code-from probe probe`
→ output contains `OFFLINE-OK`; also `docker compose logs app` contains no `ENOTFOUND`/`getaddrinfo` (no outbound attempts). `!reset`
needs Compose ≥ 2.24 (README requirement). Done-check: `docker compose -f docker/docker-compose.yml -f docker/docker-compose.offline.yml config -q`.

**S2.10 — `scripts/e2e-image.sh` (M12-D22).** Builds nothing; requires `planner-app` (S2.1) and the dev DB:
```bash
docker run -d --rm --name planner-e2e-image -p 3100:3000 --user "$(id -u):$(id -g)" \
  -e DATABASE_URL=postgres://planner:planner@host.docker.internal:54329/planner_e2e -e ALLOW_TEST_HOOKS=1 \
  -e APP_NOW=2026-09-30T10:00:00+07:00 -e BETTER_AUTH_URL=http://localhost:3100 -e BETTER_AUTH_SECRET=<e2e secret from e2e/env.ts> \
  -e SECURE_COOKIES=false -e UPLOAD_DIR=/data/uploads -v "$PWD/.e2e-uploads:/data/uploads" --add-host host.docker.internal:host-gateway planner-app
trap 'docker stop planner-e2e-image' EXIT
pnpm exec tsx e2e/prepare-db.ts && pnpm exec playwright test      # webServer is reused (reuseExistingServer: true)
```
Done-check: `bash -n scripts/e2e-image.sh`. Integrator runs it at G2.

**S2.11 — Done-check (stream).** `pnpm exec vitest run --project unit tests/deploy` · `pnpm exec vitest run --project integration scripts/lib/wait-for-db.int.test.ts` ·
S2.1 docker commands · `pnpm exec eslint scripts --max-warnings 0` · `pnpm typecheck` (own paths clean).

### 5.S3 — Performance and hardening checks (platform-engineer · `scripts/perf-check.ts`, `scripts/lib/perf-stats*`, `e2e/perf/**`, `tests/hardening/**`)

**S3.1 — `perf-stats.ts` (pure). Tests first: `scripts/lib/perf-stats.test.ts` (unit).**
- `percentile([], 95)` → throws `RangeError`; `percentile([5], 95)` → 5; `percentile([1..100], 95)` → 95; `percentile([1..20], 95)` → 19
  (nearest rank `ceil(0.95·20) = 19`); input order irrelevant; does not mutate the input.
- `summarize` counts `status ≥ 400` as `errors` and excludes them from the timings; `verdict({ gate: true, budgetMs: 500 }, { p95: 499 })` →
  `PASS`, `500` → `FAIL` (budget is strict "<"), any `errors > 0` with `gate` → `FAIL`; `gate: false` → `INFO`.
- `toMarkdownRow` → `| P1 | GET /api/grid/project/… 16w | 500 | 182 | 241 | 260 | 0 | PASS |`.
Done-check: `pnpm exec vitest run --project unit scripts/lib/perf-stats.test.ts`.

**S3.2 — `scripts/perf-check.ts` (NFR-02a/03/06 server side, M12-D12/D13).** Node `fetch` (undici keep-alive), no Playwright.
```ts
const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:3200'
async function login(email: string): Promise<string>            // POST /api/auth/sign-in/email { email, password: 'demo1234' } with Origin: BASE → Cookie header
async function ids(cookie: string): Promise<PerfIds>            // GET /api/sidebar + /api/search?q=Perf grid / หน้าทดสอบ 300 บล็อก → project + page ids (no DB access)
async function run(b: Budget, cookie: string, url: string): Promise<ReturnType<typeof summarize>>
  // 10 warm-ups (ignored) → 100 sequential (timed with performance.now around fetch + await res.arrayBuffer()) → 20 concurrent (logged)
const BUDGETS: Budget[] = [
  { id: 'P1',  endpoint: 'GET /api/grid/project/:grid?from=2026-09-28&to=2027-01-18 (16 w, 220 rows) as cindy', budgetMs: 500, gate: true },
  { id: 'P1b', endpoint: 'same as manager', budgetMs: 500, gate: true },
  { id: 'P1c', endpoint: '2 × 8-week chunks in parallel (client pattern), wall time', budgetMs: 500, gate: true },
  { id: 'P1d', endpoint: 'GET /api/grid/project/:grid … &zoom=day (8 w)', budgetMs: null, gate: false },
  { id: 'P2',  endpoint: 'GET /api/workload?from=2026-09-28&to=2026-12-21 (12 w) as manager', budgetMs: 800, gate: true },
  { id: 'P2b', endpoint: 'same as cindy (LEAD: all totals, masked details)', budgetMs: 800, gate: true },
  { id: 'P2c', endpoint: 'GET /api/workload/badge', budgetMs: null, gate: false },
  { id: 'P3',  endpoint: 'GET /api/tasks (first page, 200) as manager', budgetMs: 500, gate: true },
  { id: 'P3b', endpoint: 'GET /api/search?q=ลูกค้า as cindy', budgetMs: 500, gate: true },
  { id: 'P3c', endpoint: 'GET /api/search/index as cindy', budgetMs: null, gate: false },
  { id: 'P3d', endpoint: 'GET /api/pages/:posCharter/embed/tasks as cindy', budgetMs: 500, gate: true },
  { id: 'P3e', endpoint: 'GET /api/pages/:posCharter/embed/workload as cindy', budgetMs: 800, gate: true },
  { id: 'P4',  endpoint: 'GET /api/sidebar as manager (300 projects)', budgetMs: null, gate: false },
  { id: 'P4b', endpoint: 'GET /api/home as manager', budgetMs: null, gate: false },
  { id: 'P4c', endpoint: 'GET /api/pages/:bigPage (300 blocks)', budgetMs: null, gate: false },
]
// Output: a markdown table (toMarkdownRow) to stdout + test-results/perf-server.json; exit 1 if any gated verdict is FAIL.
```
Pre-flight: refuse to run when `GET /api/health` fails or when the sidebar shows < 300 projects ("run pnpm seed:perf first"). The
grid project must have ≥ 200 task rows in the window (assert from the response's row count; M6 `GridResponse`). Done-check:
`pnpm exec tsx scripts/perf-check.ts --help` prints usage; full run is the integrator's (§6 step 6).

**S3.3 — `e2e/perf/fixtures.ts`.** `loginAs(page, nickname)` (Better Auth API sign-in through `page.request`, as M1's helper but with
`PERF_BASE_URL`), `measureInPage(page, fn)`, and the CSP/external-request guards from `e2e/fixtures.ts` (import them; do not copy).
No `resetDb` (the data is `seed:perf`).

**S3.4 — `e2e/perf/m12-perf.spec.ts` (NFR-02b, NFR-04, NFR-05, NFR-06).** `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))`
before each `goto`. Each test repeats 5 times (fresh navigation) unless noted, logs every sample with `test.info().annotations`, and asserts
the median:
| # | NFR | Steps | Assert |
|---|---|---|---|
| PF1 | NFR-02b | as cindy open `/projects/<Perf grid>/plan`; read `performance.measure('grid', 'grid:first-data', 'grid:painted')` (M6 S3.15 marks) | median < **300 ms**; rendered row elements < 60 (virtualised) |
| PF2 | NFR-04 | focus a cell; 20 × (install `MutationObserver` on the cell, `t0 = performance.now()`, `page.keyboard.type('1')` + `Enter`, resolve on text change) | p95 of 20 < **50 ms** |
| PF3 | NFR-05 | open `/p/<หน้าทดสอบ 300 บล็อก>` with an init script that records `performance.now()` when `.bn-editor` contains the text of block 300 (MutationObserver) | median < **1 000 ms** (navigation start → last block visible) |
| PF4 | NFR-06 | on `/home` as cindy: `palette.measureFirstResult('PO')` (M10 page object, local category) ×5; then `measureFirstResult('ลูกค้า')` (server category, logged) | median of the first < **200 ms** |
| PF5 | — (X75) | `/tasks` as manager: navigation → first row visible | logged (INFO) |
| PF6 | — (NFR-03 client) | `/workload` as manager: navigation → table painted | logged (INFO) |
Output collected into `test-results/perf.json` (reporter) for PROGRESS. Done-check: `pnpm exec playwright test -c playwright.perf.config.ts --list` lists PF1–PF6; the run is the integrator's.

**S3.5 — `tests/hardening/no-external-urls.test.ts` (NFR-09, M12-D23; unit).** Walk `src/**/*.{ts,tsx,css}`, `public/**`, `next.config.ts`,
`docker/Caddyfile`; collect `https?://[^\s'"`)]+`; allowlist: `http://localhost`, `http://127.0.0.1`, `http://www.w3.org/` (SVG/XML
namespaces), `https://planner.company.local` (example text only in `.env.example`, not scanned), URLs inside comments that start with
`// see` (docs links) — every other hit fails with `file:line`. Also: no `@import url(` of a remote font in CSS; no `<script src="http`;
no `localStorage.setItem` outside the theme `system` resolver (X53; expected 0 hits). Done-check: `pnpm exec vitest run --project unit tests/hardening`.

**S3.6 — `tests/hardening/token-coverage.test.ts` (A11Y-3, X51; unit).** Parse `src/app/tokens.css` for `--*-fg` / `--*-bg` pairs in `:root`
and `.dark`; every pair must appear in the existing contrast test's table (import its exported pair list — M0/M6 `src/lib/theme/contrast.test.ts`
or the module it tests; if the list is not exported, assert by recomputing the WCAG ratio here with the same formula) and have ratio ≥ 4.5:1;
"faded" text `#5B6878` on `#FFFFFF`, `--nonworking`, `--holiday` ≥ 4.5:1; no token uses `opacity`. Done-check: same command.

**S3.7 — `tests/hardening/forbidden-deps.test.ts` (M12-D29; unit).** Read `package.json` (all dependency sections) and `pnpm-lock.yaml`
(text): fail on any key/package path matching `^@blocksuite/`, `^@affine/`, `^@toeverything/` (AFFiNE/BlockSuite, v3.1), `^@blocknote/xl-`,
`^@blocknote/shadcn$`, `^minio$`, `^@dnd-kit/react$`, `^zustand$`, `^@tanstack/react-table$`, `^date-fns-tz$`, `^recharts$`, `^next-intl$`,
`^next-auth$`, `^@auth/`, `^xlsx$`, `^bullmq$`, `^pg-boss$`, `^agenda$`, `^react-hook-form$` (a constant `ALLOWED_BY_DECISION: string[] = []`
lets a PROGRESS Decision lift exactly one name); `typescript` not `^7`; `eslint` not `^10`; `drizzle-orm` not `^1.`; `@blocknote/*`
exactly `0.55.0`; `next` `16.3.7` (PLAN §1.2). The lockfile scan matches package keys (`/^\s{2}'?(@?[^@\s']+)@/m` under `packages:`), not
free text, so a README mention never trips it. Also assert `.gitignore` and `.dockerignore` both contain a line `affine/` (text only —
never list, stat or open the folder). Done-check: same command.

**S3.8 — Done-check (stream).** `pnpm exec vitest run --project unit scripts/lib/perf-stats.test.ts tests/hardening` · `pnpm exec eslint scripts e2e/perf tests/hardening --max-warnings 0` · `pnpm typecheck` (own paths clean).

### 5.S4 — Hardening and deploy e2e, full regression (test-engineer · `e2e/m12-*.spec.ts`, `e2e/pages/**`, `e2e/support/**`, `e2e/fixtures.ts`, `tests/integration/**`, `tests/golden/**`)

**S4.1 — Page objects and helpers.** Reuse `e2e/pages/{login,sidebar,home,palette,editor,settings,live-blocks}.ts` (M10 names; H6 waits for the charter's live blocks via `LiveBlocks.taskViews()`). Add `e2e/support/headers.ts`:
`parseCsp(header): Record<string, string[]>` and `expectSecurityHeaders(res: APIResponse, o: { https: boolean })`; `e2e/support/bytes.ts`:
`pdfOfSize(n): Buffer` (`%PDF-1.4\n` + zero padding + `%%EOF`, classified as PDF by M4's classifier). `e2e/support/compose.ts` (deploy spec only):
`dc(args: string[]): string` = `execFileSync('docker', ['compose', '-p', env.DEPLOY_COMPOSE_PROJECT, '-f', env.DEPLOY_COMPOSE_FILE, ...args])`.

**S4.2 — `e2e/m12-hardening.spec.ts` (default suite, production build, golden data).** `test.beforeAll(async () => { await resetDb() })` (golden; M1's `resetDb(fixture?, opts = {})`, never `beforeAll(resetDb())`); M0 guards active.
| # | Requirement | Steps | Assertions |
|---|---|---|---|
| H1 | NFR-08c | `request.get('/login')`, `/home` (logged in as cindy), `/p/<POS charter>` | CSP: `default-src 'self'`; `script-src` has `'self'` + `'nonce-…'`, **no** `'strict-dynamic'`, **no** `'unsafe-eval'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; no `upgrade-insecure-requests` (SECURE_COOKIES=false); nonce differs between two requests |
| H2 | NFR-08c | same responses + `/api/health`, `/api/sidebar` | `x-content-type-options: nosniff`; `referrer-policy: strict-origin-when-cross-origin`; `permissions-policy` has `camera=()`; `x-frame-options: DENY` (M0-D10); no `x-powered-by`; no `strict-transport-security` (http); API: `cache-control` contains `no-store` |
| H3 | NFR-08b | sign in via `page.request.post('/api/auth/sign-in/email')` | session `Set-Cookie` has `HttpOnly`, `SameSite=Lax`, `Path=/`, **no** `Secure` (http) |
| H4 | NFR-08c, FILE-7 | upload a PDF to the POS charter (`POST /api/files`), then `GET /api/files/<id>` | `content-disposition: attachment; filename*=UTF-8''…`; `content-security-policy: default-src 'none'; sandbox`; nosniff |
| H5 | M12-D32, §7.6 | as cindy `POST /api/files` on the POS charter with `pdfOfSize(24 * 1024 * 1024)` then `pdfOfSize(26 * 1024 * 1024)` | 201 then 413 `TOO_LARGE`; response time logged |
| H6 | NFR-09, NFR-08c | tour as manager: `/home` → `/my` → `/tasks` → POS tabs (ภาพรวม, งาน list + board, แผนงาน, เอกสาร) → charter → `/workload` → `/people/<Peter>` → `/calendar` → `/settings/employees`; open Cmd+K | guards: 0 CSP violations, 0 external requests, 0 page errors |
| V1 | NFR-07b mobile | viewport 390 × 844, as ivy: `/home`, `/my`, leave form from `/calendar` (or the home leave action), read the POS charter | each page: `document.documentElement.scrollWidth <= innerWidth`; primary content visible; the leave form submits (toast) |
| V2 | NFR-07b tablet | 820 × 1180, as cindy: `/tasks` board, POS `แผนงาน` grid | no horizontal page overflow outside the grid's own scroller; sidebar is a temporary drawer (< 900 px) opened by the menu button |
| V3 | NFR-07b desktop | 1280 × 800, as manager: `/workload`, POS grid | full layout; sidebar persistent; grid header sticky |
| V4 | §8.9 | keyboard only on `/login` → `/home`: Tab order reaches the palette button and the first card; `Esc` closes the palette | focus visible (`:focus-visible` outline width > 0) |

**S4.3 — `e2e/m12-deploy.spec.ts` (deploy config only, M12-D20). `test.describe.serial`.**
| # | Requirement | Steps | Assertions |
|---|---|---|---|
| D1 | FR-102, FR-104, DEP-15, NFR-08b/c | `/` → `/login`; log in with `DEPLOY_MANAGER_EMAIL`/`_PASSWORD` | redirected to `/account/password`; change to a new strong password → lands on `/home` (X32); security headers as H1–H2 (http); cookies HttpOnly/Lax |
| D2 | DEP-03, FR-201, FR-401 | `/settings/employees` → create "Smoke Worker" (`smoke.worker@smoke.local`); `/projects` → create "Smoke Project" | toasts; project page opens with its charter (FR-402) and 5 default statuses on the board (FR-621) |
| D3 | DEP-04, DEP-12, NFR-10 | `dc(['exec', '-T', 'backup', 'ls', '/backups'])` | contains `db-<today Bangkok>.dump` (initial backup at start) |
| D4 | DEP-12, DEP-13, M12-D26 | upload a PNG to the Smoke Project charter; `restore-rehearsal.sh` stage 1 (`backup.sh once`); rename "Smoke Project" → "Smoke Project X" via UI; stage 2 (restore + start app); reload | after restore the sidebar shows "Smoke Project" (not "…X"); the uploaded image URL still returns 200 `image/png`; login still works with the changed password; `pg_restore --list` of the dump lists `TABLE DATA public projects` |
| D5 | DEP-01, X52 | `dc(['exec', '-T', 'db', 'psql', '-U', 'planner', '-d', 'planner', '-Atc', 'show timezone'])` | `UTC` |
| D6 | NFR-09 | run the D1–D2 navigation with the external-request guard | 0 external requests |

**S4.4 — Update older specs.** M12 changes no UI, so no older spec should change. The only expected edit: `playwright.config.ts`
`testIgnore` (S0.3). Any red older spec at G2 is a regression → fix at the root, never by loosening the spec. Keep every older spec's
narrow `allowedConsoleErrors` (C7).

**S4.5 — Traceability check (final, M12).** `tests/integration/traceability.int.test.ts` (integration project, which includes
`tests/**`; it touches no DB): parse `plan/traceability.md` once it has the "Test file" column (T9): every referenced `*.test.ts(x)` /
`*.spec.ts` path exists in the repo; ids listed under "no test" = `[]`. If `plan/traceability.md` lacks the column at implementation time,
the test asserts only that every `e2e/m<N>-*.spec.ts` for N = 0…11 exists and records a Known issue.
Done-check: `pnpm exec vitest run --project integration tests/integration/traceability.int.test.ts`; e2e specs are run by the integrator.

---

## 6. Integration (orchestrator)

**Expected cross-stream requests.**
- S0 (before G0, runs alone): none expected for M12-D35 (verify only; a fix only if the code drifted from M3-D43); missing registrations in `tests/authz/rows/index.ts` (AUD-00). Both recorded in the S0 report and PROGRESS Decisions.
- S1 → orchestrator: `th.audit.*` builders for gap fixes (inside `audit`); nothing for the charter table (M12 imports m04's exported `tableBlock`,
  C68). If `AUDIT_IN_SERVICE` turns out different from M12-D34's expectation, S1 only flips the constant (the test pins it).
- S2 → orchestrator: none expected (`playwright.config.ts` belongs to S0). If `caddy adapt` rejects the two-token `CADDY_TLS`, S2
  switches variables and asks S0's `.env.example` lines to be updated (apply with Edit).
- S3 → orchestrator: an exported pair list from the M0/M6 contrast module (`src/lib/theme/**`) if S3.6 needs it.
- S4 → orchestrator: none; any older-spec failure → owner of the failing path fixes it (fix round).

**Wiring order and commands (integrator, one checkout, sequential).**
1. Apply requests; `pnpm install --frozen-lockfile` (no dependency change expected: `git diff --exit-code pnpm-lock.yaml`).
2. `pnpm db:up && pnpm db:migrate && pnpm db:generate` → "No schema changes" (X10); `pnpm check` green **without** `M12_ALLOW_GAPS`
   (AUD-10 passes = no audit gap left).
3. `pnpm seed:demo --reset` on the dev DB → counts printed; spot-check in the browser after step 5 (§7.4 M4).
4. `pnpm build`; `pnpm test:e2e` (full M0–M12 default suite incl. `m12-hardening`, production build on :3100) → green.
5. `docker build` both targets (S2.1 commands) → `pnpm e2e:image` → full default suite green against the `planner-app` image (M12-D22).
6. Perf: `PERF_DATABASE_URL=postgres://planner:planner@localhost:54329/planner_perf pnpm seed:perf` → then
   `DATABASE_URL=$PERF_DATABASE_URL ALLOW_TEST_HOOKS=1 APP_NOW=2026-09-30T10:00:00+07:00 BETTER_AUTH_URL=http://localhost:3200 BETTER_AUTH_SECRET=<e2e secret> SECURE_COOKIES=false UPLOAD_DIR=.perf-uploads pnpm start -p 3200` (background)
   → `pnpm perf` (server table) → `pnpm perf:e2e` (client table) → stop the server. Paste both tables into PROGRESS (§10).
7. `pnpm deploy:smoke` (fresh copy, fresh volumes, `m12-deploy` D1–D6 + restore rehearsal) → green; `docker volume ls | grep planner-smoke` empty afterwards.
8. `pnpm offline:check` → `OFFLINE-OK`.
9. `git check-ignore affine/ .perf-uploads/` prints both; `git status --porcelain` shows no `affine/` and no stray files in the repo root
   (HANDOFF §6: delete leftovers such as `race_mgr_*.out`).
10. Review panel (PLAN §2.6), fix rounds, then G4 = steps 2, 4, 7 again.

G2 = steps 2 + 4 + 5 + 7 (+ 6 and 8 recorded).

---

## 7. Verification

### 7.1 AC → test map

M12 owns no SPEC `AC-` id; its acceptance is SPEC §12 M12 "Done when" plus FR-1201/1202 and the NFR rows.

| Requirement | Test(s) |
|---|---|
| §12 M12 Done when — `docker compose up` on a clean machine → initial-manager login | `scripts/deploy-smoke.sh` → `e2e/m12-deploy.spec.ts` D1 |
| §12 M12 Done when — e2e ทั้งหมดเขียว | G2 `pnpm test:e2e` (M0–M12 default suite) + `pnpm e2e:image` (same suite on the image) |
| §12 M12 Done when — backup ไฟล์เกิดจริง | D3 (initial backup) · D4 (`once` + restore) · `tests/deploy/backup.int.test.ts` |
| FR-1201 | AUD-00…AUD-08, AUD-10 + every mutating matrix row's audit assertion (M1 harness) + DM-12 (seed audit trail) |
| FR-1202 | AUD-09 |
| SEED-A2 (App. A.2) | DM-01…DM-12 |
| SEED-PERF / NFR-01 | `perf-data.int.test.ts` + §7.4 P0 |
| NFR-02a · NFR-03 · NFR-06 (server) | `perf-check.ts` P1/P1b/P1c · P2/P2b · P3b (gates) |
| NFR-02b · NFR-04 · NFR-05 · NFR-06 (client) | `m12-perf.spec.ts` PF1 · PF2 · PF3 · PF4 |
| NFR-07a | §7.4 M3 (manual Safari + Edge) |
| NFR-07b | H6 (desktop tour) · V1–V3 |
| NFR-08b | H3 · D1 |
| NFR-08c | H1 · H2 · H4 · H6 · D1 |
| NFR-09 | `no-external-urls.test.ts` · external-request guard in every e2e · `offline:check` · D6 |
| NFR-10 / DEP-04 / DEP-12 | `backup.int.test.ts` · D3 · D4 |
| DEP-01…06, DEP-14 | `tests/deploy/files.test.ts` · S2.1 checks · deploy smoke D1–D5 |
| DEP-07 | M0 `env.test.ts` · `files.test.ts › env.example` |
| DEP-13 | `files.test.ts › README headings` · §7.4 M2 walk-through · D4 restore |
| A11Y-3 | `token-coverage.test.ts` + existing contrast test |
| §1.7 / ARC-04 (no AFFiNE, forbidden deps) | `forbidden-deps.test.ts` · S2.1 context check |
| BR-31 / X69 nested task | DM-04 |
| BR-80/86/87 demo statuses + blocker | DM-06 · DM-07 |

### 7.2 Authz matrix rows added

None — M12 adds no action, route or page (PERM-01…23 unchanged). Meta-tests added next to the matrix:

| ID | Covers | Expectation |
|---|---|---|
| AUD-00 | `tests/authz/rows/*.ts` (C72) | every rows file registered in `index.ts`; every entity ∈ `ALL_AUDIT_ENTITIES` (G55) |
| AUD-01 | every export of `src/server/actions/**` | has ≥ 1 audited `allow` row or an `AUDIT_EXEMPT` reason |
| AUD-02 | `POST/PUT/PATCH/DELETE` in `src/app/api/**/route.ts` | same (files, keepalive audited; lock + auth exempt) |
| AUD-03 | v3.1 + M8 binding + plan + page/file actions | entity = `REQUIRED_ENTITY[name]` |
| AUD-04 | FR-1201 nouns | each entity asserted by ≥ 1 allow row |
| AUD-05 | exemptions | exist, have reasons, really write no row |
| AUD-06 | plan batch (M12-D3) | one `allocation` row per assignment |
| AUD-07 | page save | no content in the audit row (action + keepalive route) |
| AUD-08 | secrets | no password/hash/token in any audit row |
| AUD-09 | FR-1202 | no app code reads `audit_log` |
| AUD-10 | gaps | `KNOWN_GAPS = []` at G2 |

The M1 loops (nobody → 401, must-change → 403) are unchanged; the sweep only reads the existing rows.

### 7.3 E2E scenario outline

- **`e2e/m12-hardening.spec.ts`** (default suite; `resetDb()` = golden in `beforeAll`; `loginAs`; clock pinned by the M0 fixture to
  2026-09-30 10:00 Bangkok; strings from `th`): H1–H6, V1–V4 as in S4.2. Deterministic: no sleeps — wait on responses, roles and
  `data-save-state="idle"`.
- **`e2e/m12-deploy.spec.ts`** (deploy config; real clock; the stack is fresh, so no reset): D1–D6 as in S4.3, serial; "today" for D3
  = `todayBangkok()` computed in the test (the backup container's `TZ=Asia/Bangkok`).
- **`e2e/perf/m12-perf.spec.ts`** (perf config; `seed:perf` data; clock pinned per test): PF1–PF6 as in S3.4.
- **Update older specs:** none expected (S4.4); `playwright.config.ts` `testIgnore` keeps perf/deploy out of the default run.

### 7.4 Golden, perf and manual checks

- **P0 data volume** (after `seed:perf`): users 101 (100 workers + golden Manager), projects 300 (+ "Perf grid" counted), tasks ≥ 20 000,
  assignments ≈ 15 000, allocations ≈ 300 000 (record exact), pages ≥ 5 000, the 300-block page present; `seed:perf` elapsed time.
- **P1–P4 / PF1–PF6** per M12-D12: record every row (n, p50, p95, max, errors, verdict) in PROGRESS. Gates: P1, P1b, P1c, P2, P2b, P3,
  P3b, P3d, P3e, PF1, PF2, PF3, PF4. A FAIL starts a fix round (e.g. an index — schema change by the orchestrator only — or query
  tuning); if a budget cannot be met, write a Deviation proposal and stop for the owner (PLAN §2.9 #1).
- **Golden on demo** (DM-02/03 numbers, r8): 19 600 / 11 725; Peter 2026-10-05 OVER +2.00 CAPACITY; badges M1 C1 I0 P1 J1 X0.
- **M1 restore drill (manual, once):** on a scratch stack follow README §Restore literally (not the script) and confirm data + files return.
- **M2 README walk-through (manual):** a person who did not write it installs from README on a clean VM/laptop (or the temp copy) up to
  login; note every unclear step and fix README.
- **M3 browsers (NFR-07a, manual):** Safari (latest macOS) and Edge: login, home, grid edit + undo, page edit with image paste, Cmd+K,
  board drag — note issues as Known issues.
- **M4 demo (manual):** after `pnpm seed:demo --reset`, as cindy: POS charter shows filled sections, the image, the stakeholder table, the
  live board (with "เสร็จ" card struck through) and the workload block; CRM board shows "ติดปัญหา" with ⛔ "รอ 1 งาน"; `/workload` shows
  Peter OVER in week 5/10; UAT sign-off ◆ late warning; wiki "คู่มือทีม" › "วิธีใช้ระบบนี้".
- **M5 Thai keyboard (R21):** with the Kedmanee layout: Cmd+K, Cmd+Z, `f`/`h` in the grid, `?` (regression of X49).
- **M6 TLS (optional):** `docker compose --profile tls` with `SITE_ADDRESS=planner.local`, `CADDY_TLS=internal` on a test host; browser
  trusts the installed root CA; login works with `SECURE_COOKIES=true` + `BETTER_AUTH_URL=https://planner.local`.

---

## 8. Definition of done

- [ ] SPEC §12 M12: `docker compose up` on a clean machine → initial-manager login works (D1); all e2e green on the production build
      **and** the image (G2 steps 4–5); a backup file is really created (D3) and restorable (D4).
- [ ] §4.12: AUD-00…AUD-10 green (every rows file registered, G55 entity list exact); `KNOWN_GAPS = []`; no audit UI (AUD-09);
      `seed:demo` audit trail = one row per user operation (DM-12, M12-D34).
- [ ] Every service an M12 script imports loads under plain tsx (S0.1, S1.9) and takes `today` from its caller (M12-D35, X56).
- [ ] `pnpm seed:demo` produces A.2 exactly (DM-01…DM-12); the POS charter was filled in place and keeps its live blocks (C4, X78).
- [ ] `pnpm seed:perf` at NFR-01 scale; every gated budget of M12-D12 PASS; results table in PROGRESS.
- [ ] Dockerfile, compose (+ offline override), `backup.sh`, Caddyfile, `.dockerignore` (with `affine/`), README (12 sections) delivered;
      `tests/deploy/**` green; `offline:check` → `OFFLINE-OK`.
- [ ] Security headers/cookies (H1–H4, D1), 24 MiB upload (H5), viewports (V1–V4), CSP tour (H6) green.
- [ ] `tests/hardening/**` green (no external URLs, token coverage, forbidden deps incl. AFFiNE/BlockSuite).
- [ ] `pnpm check` green; `pnpm db:generate` → "No schema changes"; no new dependency (`git diff pnpm-lock.yaml` empty).
- [ ] CLAUDE.md DoD: no `any`, `@ts-ignore` or reason-less `eslint-disable`; authz tests cover every action (unchanged set, AUD-01);
      no `localStorage` data; no runtime CDN; scripts use pnpm only.
- [ ] Manual checks §7.4 M1–M5 done (M6 optional) or recorded as Known issues.
- [ ] Every task inserted by `seed:demo`/`seed:perf` has `status_id` (DM-08, perf-data test) (X70).
- [ ] `affine/` never read, copied, built or committed (`git check-ignore`, context check, forbidden-deps test).
- [ ] `PROGRESS.md` updated (§10); commit `feat(m12): …`; tag `m12`.

---

## 9. Risks and gotchas

| # | Risk / pitfall | Mitigation (step) |
|---|---|---|
| R1 | SPEC §10.2 compose block is invalid YAML and its `${POSTGRES_PASSWORD}` interpolation reads `docker/.env`, leaving the password blank (r6b M11-01/02) | `env_file: ../.env` everywhere, no `${}` (S2.3, `files.test.ts`) |
| R2 | `pg_isready` over the socket reports healthy during initdb (M11-03) | TCP `-h 127.0.0.1` healthcheck + `waitForDb` 60 s (S2.3, S2.7) |
| R3 | Named volume mounted over `/data/uploads` keeps root ownership → `EACCES` (M11-04) | runner creates + chowns the dir before `USER` (S2.1); README note for bind mounts |
| R4 | `next build` in Docker fails without `DATABASE_URL`/secret (r2 §2.6) | lazy env/db (M0) + inline placeholders only in the build `RUN` (S2.1) |
| R5 | `pnpm` in the builder image re-installs or downloads Node at run time (offline server!) — `verifyDepsBeforeRun`, `devEngines` | `pnpm_config_verify_deps_before_run=false`; `node@runtime` lives in `node_modules`; `--network none` check (S2.1) |
| R6 | `NODE_ENV=production` changes bootstrap rules (missing `INITIAL_MANAGER_*` → fatal) | intended; README §First start + Troubleshooting; deploy smoke sets the vars (S2.8) |
| R7 | `TZ=Asia/Bangkok` from `.env` reaches the db container and initdb writes it into `postgresql.conf` (X52) | db `environment: TZ: UTC` + `-c timezone=UTC` (S2.3, D5) |
| R8 | Docker sets `HOSTNAME=<container id>` → standalone binds to the wrong interface | `ENV HOSTNAME=0.0.0.0` (S2.1) |
| R9 | `pg_restore --clean` errors on an empty DB; plain `run backup` starts the loop (M11-08) | `--clean --if-exists --no-owner` + `--entrypoint sh` (S2.6, S2.8) |
| R10 | Compose project name defaults to `docker` → volumes collide (M11-19) | `name: planner`; smoke uses `-p planner-smoke` (S2.3, S2.8) |
| R11 | `seed:demo` wipes a real install | pristine-or-`--reset` + production needs `ALLOW_DEMO_SEED=1` (M12-D33, DM-01) |
| R12 | Filling the charter drops or duplicates the live blocks / creates a second charter (C4) | in-place save of the existing row; `fillSections` copies live blocks; DM-09 asserts exactly one of each and one charter |
| R13 | A.2 nested task contradicts BR-31 (r8 D3) | two children via the real `createTask` (M12-D6, DM-04) |
| R14 | Demo completion releases load (BR-50) and breaks 19 600 / 11 725 | completed task has no plan after its completion week (M12-D7); DM-06 with two `today`s |
| R15 | A service drifted from its plan and reads `serverToday()` → `server-only` throws under tsx | S0.1 tsx import check + clock grep; M12-D35 restores the planned required `today` (M3-D43, X56/X90) |
| R15b | Seed audit trail differs from the UI's (actions write some audit rows, m03/m04) | M12-D34 mirroring + `AUDIT_IN_SERVICE` pinned by S0.1 + DM-12 exact counts |
| R16 | `seed:perf` slow (row-by-row builders, trigger per row, trigram index on 100 M chars) | SQL `generate_series` bulk, single tx, `analyze`; record elapsed; reduce `pageChars` only by Decision |
| R17 | Perf numbers taken on the dev server or a cold server | production build, 10 warm-ups, p95 over 100 (M12-D13); route modules are lazy-loaded on first request in 16.3 (r1 #7) |
| R18 | Perf data window misses "today" | fixed `APP_NOW` + fixed seed `today` (S1.6, M12-D13) |
| R19 | Next proxy 10 MB body limit truncates 25 MB uploads (M11-16) | `/api/files` outside the matcher (M0); H5 checks 24 MiB / 26 MiB |
| R20 | `upgrade-insecure-requests` / `Secure` cookies break plain-HTTP LAN installs | only when `SECURE_COOKIES=true` (M0); H1/H3 assert absence on http; README warning |
| R21 | Server Actions origin check fails behind a proxy that rewrites `Host` | M12-D19; README §HTTPS + Troubleshooting |
| R22 | XFF spoofing weakens FR-106 per-IP lockout without a proxy (R-M1-8) | README: deploy behind a proxy + `TRUSTED_PROXIES` |
| R23 | Deploy smoke clobbers the developer's `.env`, volumes or port | temp copy + own `.env` + `-p planner-smoke` + port check + `down -v` trap (S2.8) |
| R24 | `!reset` in the offline override needs Compose ≥ 2.24 | README requirement; `config -q` done-check (S2.9) |
| R25 | `affine/` (live Postgres data + private key) ends up in the image or a commit | `.dockerignore` + `.gitignore` + context check + forbidden-deps test (M12-D29/D30); never list or read it |
| R26 | Backup dumps contain password hashes | `umask 077`; README: treat dumps as secrets (S2.4, S2.6) |
| R27 | Running the full sweep (AUD-08 builds one world per row) slows `pnpm check` | `describe.sequential`, worlds are small; if > 60 s, sample one row per action (record Decision) |
| R28 | The `backup.int.test.ts` Docker test is flaky on machines without Docker | `skipIf(!dockerAvailable())`; the deploy smoke is the real gate |

---

## 10. Close-out

**PROGRESS.md updates.**
- Status table: M12 ✅ (date); "Milestone ปัจจุบัน: — (MVP ครบ)".
- Decisions: copy M12-D1…M12-D35 (incl. the M12-D35 verification result and any S0.1 adaptations / AUD-00 registrations) with date and SPEC refs.
- Deviations: M12-D14 (compose: `name`, `env_file`, TCP healthcheck, `TZ: UTC` on db) and M12-D26 (restore flags) — "spec บอกว่า / ทำจริง / เหตุผล".
- Perf results: two tables (server P1–P4c from `pnpm perf`, client PF1–PF6 from `pnpm perf:e2e`) with the machine (CPU/RAM, Docker or
  bare), date, data volume (P0) and `seed:perf` elapsed time.
- Known issues: strict `style-src` nonces not adopted (M12-D24); Safari/Edge checked manually only (M12-D25); any manual-check finding
  (§7.4); Node 22 EOL 2027-04-30, ESLint 9 EOL, dnd-kit classic unmaintained (PLAN R22); keep the `affine/` note (owner's local trial,
  ignored by git and Docker).
- Remove the planning-related Known issues that are done.

**Commit** (integrator, after G4): 
```
feat(m12): hardening and deploy — audit sweep, seed:demo/seed:perf, Docker stack, backups, perf verified

FR-1201, FR-1202; NFR-01…NFR-10; DEP-01…DEP-07, DEP-12…DEP-15; SEED-A2, SEED-PERF; A11Y-3 audit.
Audit coverage meta-test over all actions/routes; seed:demo = golden + A.2 + statuses/blocker + filled POS charter;
seed:perf at §9 scale; Dockerfile/compose/backup/Caddy/README; deploy smoke + restore rehearsal; perf results in PROGRESS.

Co-Authored-By: <attribution trailer required by the session>
```
**Tag:** `git tag m12`.

---

## 11. Forward notes from M11 (added at the M11 close-out, 2026-11-03)

Inputs for the M12 kickoff (plan/m11-database-views.md §10). Each one goes into the matching M12 stream; none is built yet.

- **Perf gates for NFR-11/12.** Add to `scripts/perf-check.ts` P-DB1: `GET /api/pages/:id/databases/:databaseId`, 1,000 rows × 20
  columns, p95 < 500 ms on `planner_perf`. Add to `e2e/perf/m12-perf.spec.ts`: PF-DB1 table render < 300 ms, PF-DB2 view switch /
  filter / sort < 100 ms, PF-DB3 cell edit < 50 ms, PF-DB4 page with 3 database blocks (1,000 rows) + 50 equations opens < 1.5 s.
  M11 shipped smoke versions only (e2e P1/P2, `databases.perf.int.test.ts`, `database.perf.test.ts`). Also check how heavy the clipboard /
  internal copy of a large database block is: it renders the whole `DatabaseBlockView` through BlockNote's `elementRenderer` (M11 S5 note).
- **`seed:perf`.** Use `addSyntheticDatabase` for 2,000 databases / 200,000 rows (NFR-01 v3.2 row).
- **Audit sweep (AUD-*).** Register the audit entity `database` (X93 now lists it) and the row-body `page` saves (`DB_ROW` bodies) in the
  coverage meta-test.
- **Offline / image checks.** The offline check must allowlist KaTeX's MathML namespace string (`http://www.w3.org/1998/Math/MathML`),
  and the image check must confirm the KaTeX fonts are inside the image (bundled, lazy chunk). README third-party notices: `katex` (MIT).
- **Remove the unused `@mui/x-charts` dependency.** M7.1-D30 replaced the MUI X load chart with the grid-geometry chart, and
  `src/components/load-chart/no-chart-lib.test.ts` asserts that nothing imports it, but `package.json` still pins `@mui/x-charts 9.14.0`.
  Drop it (and its PLAN §1.2 row) and re-measure the bundle.
- **`lateFacts` query plan.** Without planner statistics `repo.milestones.lateFacts` picks a nested-loop plan that takes more than 18 s
  (M8 fix-r1, PROGRESS "R2 / M6-D22" row); the M8 perf smoke runs `ANALYZE` first. For M12: add an index that serves the bound-task /
  milestone join without statistics (check with `EXPLAIN` on `planner_perf` straight after `seed:perf`, before autovacuum) or run
  `ANALYZE` at the end of `seed:perf` and in the post-restore steps, and make P-series measurements include a "fresh restore" case.
- **E2E new-tab assertions.** Use `e2e/support/new-tab.ts` (`newTabOpenedBy`) instead of `context.waitForEvent('page')` for
  Cmd/Ctrl+click checks. The Playwright page event depends on `Page.frameNavigated`, which Chromium sometimes skips when the opener's
  renderer is busy (M11 close-out T3 fix).
