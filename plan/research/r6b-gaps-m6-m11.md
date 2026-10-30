# R6b: Gaps in the late milestones (M6–M11)

This report covers cross-milestone dependencies, ambiguities, missing details, inconsistencies in SPEC, and technical risks.

- **Author:** research subagent R6b · **Date:** 2026-09-30 (Wed) · **Status:** pre-planning research. Nothing in the project folder was changed.
- **Read completely:**
  - `SPEC.md` (all 1632 lines)
  - `CLAUDE.md`
  - `PROGRESS.md`
  - `tech-stack.md`
  - `docs/README.md`
  - `docs/history/decisions-log.md`
  - `docs/reference/excel-workload-planner.md`
  - `docs/reference/golden-fixtures.json`
- **Read in part:**
  - `docs/history/design-spec-v2.1.md`: the sections that bear on the ambiguities (§5.2, §5.5–5.8, §7.1–7.5, §8.3–8.6).
  - The sibling report `scratchpad/research/r5-v21-mining.md`: TL;DR, M6–M11 and §3. R5 already verified several points. I cite them as **[verified R5 …]** and do not repeat them, and I flag every place where my proposal differs from R5's.
- **Owner decisions taken as given:**
  - The stack is SPEC §7.1 **except** the UI kit: MUI instead of Tailwind + shadcn, and `@blocknote/mantine` for the editor chrome.
  - File storage is a local disk volume.
  - Python/FastAPI and MinIO are rejected.
- **Evidence tags:**
  - **[verified]**: executed here (Postgres 17.11 in Docker, Node 26.5 / Node 22.23, Docker Compose v5.1.4), or read in a package's `.d.ts` or source, or in official docs, or in the project docs (with line numbers).
  - **[likely]**: strong reasoning, not executed.
  - **[uncertain]**: a judgement call; it must become a `PROGRESS.md › Decisions` row.
- **Scratch artifacts (reproducible):** `scratchpad/r6b2/`
  - `trgm_thai.sql`, `search_perf.sql`, `search_perf2.sql`
  - `perf_schema.sql`, `perf_data.sql`, `perf_q.sql`, `perf_q2.sql`
  - `dist_cmp.mjs`, `intl.mjs`
  - `bk/backup.sh`
  - `composetest/`, `voltest/`, `initdb/`
- **Containers:**
  - I created and removed `r6b2-gaps-pg17-a64f`, `r6b2-hc-race-a64f` and `r6b2-tz-a64f`, the network `r6b2-net`, and the volumes `r6b2_*`.
  - I did **not** touch `r6b-pg17-verify` (up about 3 h, not created in this session; probably an interrupted earlier R6b run). The orchestrator may remove it.

Item IDs: `X-nn` = cross-cutting; `M6-nn` … `M11-nn` = by milestone. Every item gives Kind · SPEC refs · Problem · **Proposed decision** · Rationale · Evidence.

---

## 1. TL;DR: the 25 items plan writers must not miss

1. **DAY-resolution weeks exist from M6, but the day UI is M7** (M6-01).
   - FR-612/BR-25 already writes DAY rows for boundary weeks in M6.
   - M6 must show those weeks as **read-only week totals marked "⋯"**. Range operations skip them.
   - The server logic for NEEDS_CHOICE is complete in M6. The BR-24 dialog comes in M7.
2. **Every allocation writer must lock the assignment first** (M6-10, M6-11).
   - Use one batch action over many assignments, with rows locked `ORDER BY id FOR UPDATE`. Opposite lock orders deadlocked **[verified 40P01]**, and `LockRows` sits above `Sort` **[verified]**.
   - Without the lock, the SPEC trigger lets a WEEK row and a DAY row coexist **[verified; also R5 T5]**.
   - An extra `EXCLUDE USING gist (task_assignment_id WITH =, week_start WITH =, granularity WITH <>)` constraint closes the race at the database level **[verified: the concurrent insert waited, then got 23P01; DELETE-then-INSERT works]**.
3. **DAY values can exceed 100 cd when a week is split into days** (M6-02; R5 §3.1). This affects BR-22, BR-24 SCALE and BR-25 boundary weeks. Clamp and spill are required.
4. **SPEC's reference `distribute` breaks ties wrongly because it uses floats** (M6-03).
   - It fails in 2,262 of 1,000,000 random cases **[verified]**. Example: t=320, w=[40,25,67,60] gives SPEC [67,41,112,100], but the exact result is [67,42,111,100].
   - Use integer remainders.
5. **`periodKey` collides between a week and its Monday** (M6-15). The week key and the day key are both `2026-10-19`. Prefix them `W:` and `D:`.
6. **Aggregate `totals` must carry `{total, committed}`** (M6-16). Otherwise the certainty view (FR-809/FR-1003) cannot be applied to parent rows, masked rows or the "other projects" footer.
7. **The fraction unit is based on the cell's actual capacity** (M6-04). The ×500 rule in `golden-fixtures.json` applies only to import. Typed values are rounded once, straight to 25 cd, with integer arithmetic (M6-05).
8. **Undo stores week snapshots and uses one serialized save pipeline** (M6-13).
   - Pipeline: TanStack `mutation.scope`, **[verified]** serial in v5.104.
   - The version is read when the save runs, not when it is queued.
   - A VERSION_CONFLICT drops the stale undo entries.
9. **Features scheduled earlier depend on M6** (M6-23):
   - FR-303 load (M2)
   - FR-406 "ปลดภาระ X" (M2)
   - BR-52 toast (M3)
   - AC-603 "พร้อมแผนเดิม" (M3)
   - AC-203 "ปิดใช้งาน" label in the grid (M1)
10. **The Thai keyboard layout breaks key-based shortcuts** (X-01). Letters, `Cmd+Z` / `Cmd+K`, and "type a digit to start editing" all fail. Match on `event.code`.
11. **e2e needs a controllable "today"** (X-02).
    - Server: `APP_FAKE_TODAY`, honoured only when `ALLOW_TEST_HOOKS=1`.
    - Client: Playwright `page.clock.install({time})` **[verified API]**.
    - Pin today to 2026-09-30 for all e2e runs.
12. **The database runs in UTC** (X-03) **[verified: `Etc/UTC`]**. Never use `current_date` for plan dates. Also set `TZ` on the db container **[verified: this makes the DB timezone Asia/Bangkok]**.
13. **Next 16 `revalidateTag` needs 2 arguments** (X-04) **[verified d.ts]**. SPEC §7.3 uses 1 argument.
14. **SPEC still says Tailwind/shadcn everywhere** (X-05). `PLAN.md` claims otherwise. This must become a Deviation.
15. **The M7 BR-24 dialog must handle several weeks at once** (M7-03). NEEDS_CHOICE should return `weeks[]`.
16. **Day-level overload in M7 needs `overload.ts`, which is scheduled for M9** (M7-06). Move BR-40 and the BR-45 classification into M7.
17. **RISK has no colour of its own in BR-45** (M9-01).
    - In the "ทั้งหมด" view RISK turns red by ratio.
    - Use glyphs: 🔴 for OVER, ⚠ for RISK.
18. **Excess ("เกินกี่วัน")**: OVER = committed − cap, RISK = total − cap (M9-02). **[verified in the Excel `แจ้งเตือน Overload` formulas]**, and it matches golden F2–F4.
19. **The workload badge goes stale if it is rendered in the layout** (M9-07). It needs a client-side refresh.
20. **`ORDER BY similarity()` on page content takes 5.2 s** (M10-01) **[verified at the target size]**. With content-only matches unordered and `LIMIT 8`, the query takes 2.6 ms.
    - Queries shorter than 3 characters fall back to a sequential scan (780 ms).
    - `_` and `%` must be escaped.
21. **pg_trgm with Thai text needs the Debian `postgres:17` image with an `en_US.utf8` ctype** (M10-02). A C-locale database produces zero Thai trigrams **[verified]**.
22. **Cmd+K collides with BlockNote's link shortcut** (M10-06) **[verified in `@blocknote/react` 0.55 source]**. The palette must respect `defaultPrevented`.
23. **The SPEC §10.2 compose file is invalid YAML** (M11-01), and the root `.env` is not read for `${…}` (M11-02) **[both verified]**.
    - The healthcheck reports "ready" while the database is still initialising (M11-03) **[verified]**.
    - The uploads volume must be pre-created and chowned (M11-04) **[verified]**.
24. **The SPEC restore command exits 1 on an empty database** (M11-08). `--clean --if-exists --no-owner` is clean **[verified]**. `backup.sh` needs its own sleep loop because the image has no cron (M11-07) **[verified]**.
25. **Appendix A.2 contradicts BR-31** (M11-13). The child task "เตรียมคู่มือสาขา" cannot stay unassigned when it is the first child of an assigned task.

---

## 2. Experiments (all reproducible from `scratchpad/r6b2/`)

| # | What | Result |
|---|---|---|
| E1 | `postgres:17` settings | PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2); `timezone = Etc/UTC`; db ctype/collate `en_US.utf8`, provider `c`. **No cron binary.** GNU `date -d "tomorrow 02:00"` works; `/usr/share/zoneinfo/Asia/Bangkok` exists; `TZ=Asia/Bangkok date` gives +07. `docker-entrypoint.sh` L297: `-c listen_addresses=''` for the temp init server. |
| E2 | Healthcheck race (`initdb/10-sleep.sh` sleeps 12 s during init) | `pg_isready -U planner` (socket) = OK from t=2 s, while `pg_isready -h 127.0.0.1` = NO until t=13 s. SPEC's healthcheck therefore reports healthy while TCP clients are still refused. |
| E3 | `TZ=Asia/Bangkok` env on first init | `show timezone` = `Asia/Bangkok`; `now()` prints +07. |
| E4 | `show_trgm` with Thai on en_US.utf8 | `ลูกค้า` gives 7 trigrams, `ย้ายข้อมูลลูกค้า` gives 16. `ก้า` gives 4 trigrams, so tone marks count as word characters. `similarity('ย้ายข้อมูลลูกค้า','ลูกค้า')` = 0.278 (below the default `%` threshold of 0.3); `word_similarity` = 0.714; ILIKE = true. |
| E5 | Same on a database created with `LC_CTYPE 'C'` | `show_trgm('ลูกค้า')` = `{}`, so the GIN index is unusable (Seq Scan). |
| E6 | Search at target size (20k task names; 5,000 pages × ~20,500 chars; content GIN 1.4 MB) | tasks `ILIKE '%ลูกค้า%' ORDER BY similarity LIMIT 8`: 0.1 ms via the index. 2-char `'%ค้%'`: Seq Scan 8 ms on tasks, **780 ms on pages content**. Content with a common term `'%ประชุม%' ORDER BY similarity(content_text,…) LIMIT 8`: **5,225 ms**. Same with `ORDER BY updated_at`: **524 ms**. Same **unordered `LIMIT 8`: 2.6 ms**. 3-char `'%ค้า%'` uses the index (0.5 ms). `similarity()` on long docs is 0.05 for every hit, so it is useless for ranking. |
| E7 | LIKE escaping | `'abxc' ILIKE '%b_%'` = true (`_` is a wildcard). The escaped pattern works. |
| E8 | §6.5 load query at scale (100 users, 300 projects, 20k tasks in 3 levels, 14,916 assignments, **305,825 allocations** over 3 years incl. DAY rows) | 12 weeks, all users: **14–27 ms**; grouped also by project: 15 ms; 2 years: 48–51 ms. Project grid raw rows for 16 weeks: 2.5 ms. All-time totals per assignment for one project (the "รวม" column): 4.3 ms via `(task_assignment_id, week_start)`. |
| E9 | Exclusion constraint `EXCLUDE USING gist (task_assignment_id WITH =, week_start WITH =, granularity WITH <>)` | Created on 305k rows. Concurrent test: tx A inserts WEEK and sleeps 3 s; tx B inserts DAY for the same week, **waits 2.1 s, then fails** with `23P01 conflicting key value violates exclusion constraint`. DELETE WEEK + INSERT DAY in one tx: OK. |
| E10 | SPEC trigger only, no lock (re-check of R5 T5) | Both WEEK 2.50 and DAY 1.00 committed for week 2026-10-05. With `UPDATE task_assignments SET version=version+1 WHERE id=… AND version=1` first, B waits and then gets `UPDATE 0`. |
| E11 | Deadlock | T1 locks A then B, T2 locks B then A, giving `ERROR: deadlock detected`. `EXPLAIN … ORDER BY id FOR UPDATE` puts **LockRows above Sort**, so rows are locked in id order. |
| E12 | `distribute` float (SPEC) vs integer remainder | 2,262 of 1,000,000 random cases differ in tie-breaking. Example t=320, w=[40,25,67,60]: SPEC [67,41,112,100], exact [67,42,111,100]. The equal remainders are 2/3 each; SPEC gives the extra unit to the later day, which breaks "เศษเท่ากันให้วันที่มาก่อน". BR-25 over 13 weeks with uniform weights: 0 mismatches. |
| E13 | Integer rounding vs `toFixed` | cd 35: `(0.35).toFixed(1)` = "0.3", `floor((35+5)/10)/10` = "0.4". 625 → 6.3; 1875 → 18.8 (matches the §8.3 mock). |
| E14 | Thai Intl (Node 26.5 **and** Node 22.23.3, both ICU 78.3) | dateStyle medium "30 ก.ย. 2569"; weekday short "พุธ", long "วันพุธ", narrow "พ"; `{day,month numeric}` "30/9"; `RelativeTimeFormat('th',{style:'short'})` −2 h = "2 ชม. ที่แล้ว", −1 day = "เมื่อวาน"; long "2 ชั่วโมงที่ผ่านมา". `en-CA`+Bangkok at 2026-09-30T23:30Z = "2026-10-01". |
| E15 | Excel `แจ้งเตือน Overload`!B9 | `IF(Workload!B21>1,"OVER "&TEXT(B21-1,"0.00"),IF(Workload!B6>1,"เสี่ยง "&TEXT(B6-1,"0.00"),""))`. Row 6 = "ฉาก A · ถ้าทำทุกอย่าง" (total), row 21 = "ฉาก B · เฉพาะงานที่ยืนยันแล้ว" (committed). |
| E16 | Compose | The SPEC §10.2 `db` snippet gives `yaml: … did not find expected ',' or '}'`. Quoted variant run from the repo root with `-f docker/docker-compose.yml`: `WARN "POSTGRES_PASSWORD" variable is not set` and the value is `""`. With `--env-file .env` or `--project-directory .` it resolves. Compose v5.1.4. |
| E17 | `node:22-alpine` | Node v22.23.3, **corepack 0.36.0 present**, user `node` uid 1000. A named volume mounted at a path the image lacks is root-owned, so `touch` fails for the non-root user. After `mkdir -p /data/uploads && chown node:node` in the image, the write works. |
| E18 | Prototype `backup.sh` in `postgres:17` with TZ=Asia/Bangkok | Produced `db-20260930.dump` (17 MB, perf DB) and `uploads-20260930.tgz` (entries `uploads/…`). |
| E19 | Restore | SPEC `pg_restore --clean -d … dump` into an **empty** DB: `ERROR: extension "btree_gist" does not exist … errors ignored on restore: 25`, **exit 1**. `--clean --if-exists --no-owner`: exit 0 into an empty DB **and** over a populated DB; data and the custom constraint are present. |
| E20 | Collation | Default collation orders fractional-index keys as `a0 a0G a0V a1 ab aZ Zz`; `COLLATE "C"` gives `Zz a0 a0G a0V a1 aZ ab`, the byte order `fractional-indexing` expects. Thai names under en_US.utf8 sort as `กา เก่ง แกง ไก่ ขาว`, which is Thai-aware and fine. |
| E21 | Contrast of SPEC §8.7 tokens | `#9C6500` on `#FFEB9C` (load-light and tentative) = **4.12:1**, which fails §8.9's 4.5:1. `#8F5C00` gives 4.76. The over, full and certain pairs pass (5.9–6.5). `--today #EF4444` on white = 3.76 (acceptable only as a non-text line, needing ≥ 3:1). |
| E22 | Compose project name | `docker compose -f docker/x.yml config` prints `name: docker` (the name comes from the compose file's folder). With `name: planner`, volumes become `planner_pgdata`. |

Library and API facts, read from `.d.ts` files and source in the sibling scratch installs:

| Fact | Evidence |
|---|---|
| TanStack Query 5.104 `scope: { id }`: "Mutations sharing the same `scope.id` run serially, in the order they were started." | `@tanstack/query-core/build/modern/hydration-*.d.ts` L2645–2651; `mutationCache.js canRun()` |
| Playwright 1.63: `page.clock.install({time})` lets "Date.now … progress as the timers fire"; `setFixedTime` freezes `Date.now`; `pauseAt`, `resume`, `runFor`; context option `timezoneId` | `playwright-core/types/types.d.ts` L20486–20600, L11700 |
| TanStack Virtual core 3.17.11: `horizontal`, `rangeExtractor`, `initialOffset`, `scrollMargin`, `getItemKey`, `scrollToIndex`, `scrollBy`, `shouldAdjustScrollPositionOnItemSizeChange`. **No prepend-anchoring API.** | `@tanstack/virtual-core/dist/esm/index.d.ts` L65–177 |
| Next 16.3.7: `revalidateTag(tag, profile)` (2 arguments), `updateTag(tag)` ("read-your-own-writes", Server Actions only), `refresh()`; `experimental.proxyClientMaxBodySize` "Defaults to 10MB" when a proxy is configured | `dist/server/web/spec-extension/revalidate.d.ts` L13/L20/L26; `dist/server/config-shared.d.ts` L1126–1137; `config-shared.js` L279 (10485760) |
| drizzle-kit 0.31.11 `generate --custom` ("Prepare empty migration file for custom SQL") and `--name`. drizzle-orm 0.45.3 pg-core has **no exclusion-constraint builder**. | `drizzle-kit generate --help`; `drizzle-orm/pg-core` file list |
| postgres.js 3.4.9 `writable()`/`readable()` for COPY | `postgres/types/index.d.ts` L502–606 |
| `@blocknote/react` 0.55.0 link button: `(e.ctrlKey \|\| e.metaKey) && e.key === "k" && (open(), e.preventDefault())` on the editor DOM. `@blocknote/core` locale advertises "Mod+K". Core binds Mod-z / Mod-y. | `blocknote-react.js`; `core/dist/en-*.js` |
| `@mui/material-nextjs` 9.4 `AppRouterCacheProvider options` = `Partial<emotion createCache Options>` (includes `nonce`) + `enableCssLayer` | `v13-appRouter/appRouterV13.d.ts` |
| Caddy: `localhost`, `127.0.0.1`, `.localhost`, `.local`, `.internal`, `.home.arpa` and IPs automatically get self-signed certificates from the internal CA. When ACME fails, Caddy retries with exponential backoff (up to 1 day between attempts, for up to 30 days) and keeps running. `tls [<cert_file> <key_file>]`, `tls internal`; in Docker the root CA must be installed on clients manually. | https://caddyserver.com/docs/automatic-https, https://caddyserver.com/docs/caddyfile/directives/tls |
| Chromium on Mac runs "delayed" browser shortcuts such as Cmd+←/→ (Back/Forward) "after any view has the opportunity to override the shortcut" | https://chromium.googlesource.com/chromium/+/trunk/chrome/browser/global_keyboard_shortcuts_mac.h **[likely: comment-level evidence]** |

---

## 3. Items

### 3.0 Cross-cutting (affects M6–M11)

**X-01 · risk · The Thai keyboard layout breaks key-based shortcuts and number entry**
- Refs: §4.8 (digits, `f`, `h`, `Cmd+C/V/Z`, `Cmd+←/→`), FR-803 `Cmd+↓`, §8.6 (`Cmd+K`, `Cmd+\`, `N`, `?`), P1 · Milestones: M6, M10 (also M3).
- Problem: with the Kedmanee layout, `KeyboardEvent.key` returns a Thai character:
  - F → "ด", H → "้", Z → "ผ", K → "า", C → "แ", V → "อ".
  - The number row gives "ๅ / - ภ ถ ุ ึ ค ต จ" instead of 1…0.
  - `e.key === 'f'` and "a typed digit starts editing" therefore silently fail. BlockNote's own Cmd+K uses `e.key === "k"` [verified].
- **Decision:**
  - A single helper `matchKey(e, 'KeyF')` that matches on `e.code` (KeyF/KeyH/KeyZ/KeyK/KeyC/KeyV, Digit0–9, Numpad0–9, Period, Comma, NumpadDecimal), with `e.key` as a fallback.
  - In navigation mode, a `Digit*` or `Numpad*` code starts the editor with the ASCII digit.
  - The cell editor intercepts Digit/Period/Comma codes whose `key` is not ASCII and inserts the ASCII character.
  - `units.parse` accepts Thai digits ๐–๙.
  - Copy and paste use the `copy`/`paste` events, not keydown.
  - Manual QA with the Thai layout on macOS and Windows; Playwright cannot switch the OS layout.
- Rationale: P1 "กรอกง่าย"; Thai users keep the Thai layout on all day. Evidence: likely (UI Events: `code` is the physical key and ignores the layout).

**X-02 · missing-detail · e2e needs a controllable "today"**
- Refs: BR-06, BR-70, FR-1001/1007/1009/1101, §11.4, AC-701.
- Problem: the golden data is fixed to Aug–Dec 2026. Anything relative to today will drift as real time passes:
  - "this week" and the next 4, 8 or 12 weeks;
  - "14 days";
  - the grid's initial window, and therefore AC-701's week column.
- **Decision:**
  - `src/server/clock.ts` exports `today()`. It returns `APP_FAKE_TODAY` only when `ALLOW_TEST_HOOKS=1`, otherwise `todayBangkok()`. The production compose never sets that flag; bootstrap refuses to start if it is set.
  - Domain functions take `today` as a parameter.
  - Every e2e test calls `page.clock.install({ time: new Date('2026-09-30T09:00:00+07:00') })` **before** `goto`, so that timers and debounce still run. Do not use `setFixedTime` when the code measures elapsed time.
  - Add one e2e run with `timezoneId: 'UTC'` to catch client time-zone bugs.
- Evidence: Playwright API verified.

**X-03 · risk · The database session time zone is UTC**
- Refs: BR-04, BR-06, §6.2 note on `completed_on`, §10.2.
- Problem: `current_date` and `now()::date` give the UTC date. Between 00:00 and 07:00 Bangkok time that is the previous day, which breaks BR-50 and BR-70.
- **Decision:**
  - Never use DB-side dates for plan dates; pass `clock.today()` in.
  - Add a unit test that greps `src/server` for `current_date|now()::date|CURRENT_DATE`.
  - Also add `TZ: Asia/Bangkok` to the db services in both the dev and prod compose. This takes effect only when a volume is first initialised.
- Evidence: verified (E1, E3).

**X-04 · spec-inconsistency · Next 16 cache revalidation API**
- Refs: §7.3 (`revalidateTag(\`project:${id}\`)`), CLAUDE.md "zod parse → authz → service → audit → revalidate".
- Problem: in Next 16.3.7, `revalidateTag` requires a second `profile` argument, so the SPEC sample does not type-check.
- **Decision:**
  - Server actions call `updateTag(tag)`, which gives read-your-own-writes.
  - Grid and workload data are read through route handlers and TanStack Query, so actions also return enough data for the client to invalidate or patch its queries.
  - Record this as a Deviation.
- Evidence: verified (d.ts).

**X-05 · spec-inconsistency · The UI kit in SPEC vs the owner's decision**
- Refs: §7.1 L928 (Tailwind v4 + shadcn/ui), L930 (`@blocknote/shadcn`), L934 (cmdk "มากับ shadcn"), §7.2 L976 `components/ui/ (shadcn)`, M0 L1380.
- Problem:
  - The owner chose MUI and `@blocknote/mantine`.
  - SPEC §7.1 says "ห้ามเปลี่ยนโดยไม่บันทึกใน Deviations".
  - `PLAN.md` currently says the MUI decision is "already reflected in SPEC §7.1". It is not.
- **Decision:**
  - Add a Deviation row at M0 covering MUI, `@blocknote/mantine` with a matching theme, headless cmdk inside an MUI Dialog, and `src/components/ui/` holding MUI wrappers.
  - Correct `PLAN.md`.
  - Grid cells are plain elements, not MUI components (R5 M6-11).
- Evidence: verified (SPEC lines).

**X-06 · risk · Masked data can leak outside the JSON body**
- Refs: §3.3, §3.4, §11.2, CLAUDE.md masking rules.
- Problem: §11.2 only checks for **names** in JSON. Other leak paths:
  1. RSC payload props, where a server component passes unmasked data down to a client component.
  2. TanStack `dehydrate` state.
  3. `generateMetadata` titles rendered before authz (a 404 page still showing a project or person name).
  4. VERSION_CONFLICT `current` payloads.
  5. Warning texts that contain leave types.
  6. **IDs** of hidden projects, tasks or assignments inside masked rows or breakdowns.
  7. Milestones in the person grid.
  8. Badge counts over people the viewer may not see.
  9. HTTP caching.
  10. Query caches that survive logout.
- **Decision:**
  - Mask only in services.
  - Masked aggregates carry **no ids and no counts**.
  - `generateMetadata` calls authz.
  - API JSON is sent with `Cache-Control: private, no-store`.
  - Logout runs `queryClient.clear()`.
  - The §11.2 suite also asserts that hidden **ids** and leave-type names are absent.
- Evidence: likely.

**X-07 · cross-milestone-dependency · One visibility helper, reused everywhere**
- Refs: §3.3 (totals visibility), §3.2 (clients), M2 "masking helper".
- Problem: the rule "whose totals may I see" is needed in M5 (FR-907 calendar), M6 (leave labels and footer), M9 (person grid, workload, badge) and M10 (leave card, people search). Several milestones would otherwise re-implement it.
- **Decision:** in M2, `authz.ts` exports `visibleProjectIds(viewer)`, `visiblePeopleIds(viewer)` (M: all; LEAD of ≥1 project: all; else self + co-members) and `canSeeDetails(viewer, projectId)`, with a test matrix. Later milestones must only call these.
- Evidence: likely.

**X-08 · risk · Fractional-index ordering needs `COLLATE "C"`**
- Refs: §6.1 fractional index; M3 task order; M6 grid row order; M9 workload grouping by `positions.position`.
- Problem: under the default en_US.utf8 collation, `ORDER BY position` puts keys in the wrong order (E20).
- **Decision:**
  - The repo always orders with `ORDER BY position COLLATE "C"`, or the column is declared with `COLLATE "C"` in a custom migration.
  - The grid's depth-first order must equal the M3 list order. Add a test.
  - Sorting Thai names by the DB collation is fine.
- Evidence: verified.

**X-09 · missing-detail · Isolating e2e data**
- Refs: §11.4 ("ทุก e2e รันบน DB ที่ seed ด้วย seed:golden + fixture เฉพาะ").
- Problem: grid tests mutate plans, and later specs see the changed data.
- **Decision:**
  - Reset from the **Playwright process** by importing the same `seedGolden(db)` code and running truncate + seed in one transaction. The app's connection pool stays valid, and no test route is needed.
  - Add `applyFixture(db, 'F2'|'F3'|'F4'|…)`.
  - Run with `workers: 1` for DB-mutating specs, or one DB per worker later.
- Evidence: likely.

**X-10 · cross-milestone-dependency · `seed:demo` is M11, but e2e needs richer data earlier**
- Refs: A.1, A.2, §11.3, §11.4, M11.
- **Decision:**
  - `scripts/lib/fixtures.ts` holds composable builders:
    - `seedGolden`, `applySetup(fixture.setup)`
    - `addDayExample` (Kickoff workshop), used by M7
    - `addMilestones(A.2)`, used by M8
    - `addLeave`, used by M5 and M9
    - `addDemoPages`, used by M4 and M11
  - Each milestone adds its builder with its tests. M11 only composes them into `seed:demo`.
  - `seed:golden` grows per milestone: users and positions (M1), clients, projects and members (M2), tasks and assignments (M3), allocations (M6).
- Evidence: likely.

**X-11 · risk · Enforce audit coverage from M1, not only in M11**
- Refs: FR-1201, M11 "(ถ้ายังไม่ครบ)", CLAUDE.md pattern.
- **Decision:**
  - Keep an action registry, and a table-driven test (next to the authz suite) that runs each mutating action and asserts at least one `audit_log` row with the correct entity and `project_id`.
  - `saveAllocations` writes one row per assignment per batch, with `before`/`after` week snapshots.
  - Page autosave (800 ms) produces one row per save, as SPEC says. Note the table growth; indexes exist. No UI (Phase 2).
- Evidence: likely.

**X-12 · risk · Older e2e specs break as later milestones change the UI**
- Refs: DoD "e2e ของ milestone ก่อนหน้า ผ่าน", M11 "e2e ทั้งหมดเขียว".
- **Decision:**
  - From M1 on, use page objects (`e2e/pages/*.ts`) and a `data-testid` convention.
  - Each milestone's plan has a step "update older specs": the landing page (X-13), the sidebar and the grid.
- Evidence: likely.

**X-13 · missing-detail · Landing route before M10**
- Refs: FR-1101 (`/home` after login, M10), AC-101, AC-103.
- **Decision:** `/` and the post-login and post-password-change redirects go to `/my` (from M3) until M10 switches them to `/home`. The M10 plan updates the M1 and M3 specs.
- Evidence: uncertain.

**X-14 · risk · Restoring a child whose ancestor is deleted creates hidden load**
- Refs: BR-32, §6.5, P4.
- Problem:
  - Suppose child C is deleted (batch A), then its parent P (batch B). Undoing A restores C under a deleted parent.
  - The tree UI cannot show C, but the §6.5 query only checks `t.deleted_at`, so C's plan still counts as load. The overload is visible, but its cause cannot be found.
- **Decision:** `restoreTaskBatch` fails with a toast "กู้คืนไม่ได้ เพราะงานแม่ถูกลบ", or restores the ancestor chain. Pick the first; it is simpler.
- Also: restoring an unassignment when the same person has since been re-assigned hits the unique index (23505). Catch it and show a toast (R5 §3.6).
- Evidence: likely.

---

### 3.1 M6: Weekly planning grid

**M6-01 · cross-milestone-dependency · DAY-resolution weeks already exist in M6**
- Refs: FR-612/BR-25 (boundary weeks become DAY rows) in M6; §12 M6 "ห้ามทำ: รายวัน (M7)"; BR-24 dialog is M7.
- Problem: DAY data appears in M6 (FR-612, and seed extras), but day editing and the BR-24 dialog are M7.
- **Decision:**
  - M6 renders a week whose resolution is DAY as a **read-only week total** with the "⋯" marker. The tooltip lists day values (2 decimals).
  - Typing, fill, paste, `Cmd+←/→`, `f`/`h` and Delete skip these cells, with the toast "สัปดาห์นี้มีแผนรายวัน".
  - The server's `saveAllocations` already implements NEEDS_CHOICE and SCALE/COLLAPSE in the domain, so M7 only adds UI.
  - FR-612 still writes DAY rows for boundary weeks, as BR-25 requires.
- Rationale: follows BR-25 literally without building M7 UI early; no silent data loss. Evidence: likely.

**M6-02 · spec-inconsistency · DAY values above 100 cd when weeks are split into days**
- Refs: BR-22, BR-24 SCALE, BR-25, BR-26, the §6.2 CHECK.
- Problem: splitting a WEEK value can produce day values above 100 cd; the DB rejects 1.25 [verified R5 T3b]. In M6, BR-25 boundary weeks hit this whenever N exceeds the range's capacity.
- **Decision:**
  - Adopt R5 §3.1 **clamp-and-spill**. Fill tiers in order: working days with room, then scheduled days lost to holiday or leave, then weekend days.
  - Use it for every DAY materialisation (BR-22 in M7, BR-24 SCALE in M7, BR-25 in M6).
  - Emit the warning `WORK_ON_NON_WORKING_DAY`.
  - BR-25 validation blocks only when the result cannot be stored at all.
  - Property tests: the sum is preserved and every day is ≤ 100.
- Evidence: verified (R5).

**M6-03 · spec-inconsistency · SPEC's reference `distribute` breaks ties wrongly**
- Refs: §5.3 code, BR-21 ("เศษเท่ากันให้วันที่มาก่อน"), BR-01, CLAUDE.md "ห้ามคิดเลขภาระด้วย float".
- Problem: the floating-point fractional parts misorder equal remainders (E12).
- **Decision:** compute remainders exactly with `(t*w) % sumW`, and share one implementation between client and server. Add a unit test with t=320, w=[40,25,67,60] expecting [67,42,111,100].
- Evidence: verified.

**M6-04 · ambiguity · The base of the fraction unit (FR-804)**
- Refs: FR-804; `excel-workload-planner.md` L14 ("f ↔ f × weekCapacity"); `golden-fixtures.json › unit` (×500); v2.1 L419–426, L627.
- **Decision:**
  - A fraction is `cd / capacity` of that cell's period: `weekCapacity` for a week cell, `dayCapacity` for a day cell (M7).
  - A typed f becomes `cd = f × cap`, rounded to 25 cd (M6-05).
  - If cap = 0, show days instead and parse typed input as days, with a hint.
  - Rows that sum several people (multi-assignee task rows, parents, footer) always show days (R5 M6-14).
  - Show 2 decimals in fraction mode (R5 M6-13).
  - The ×500 rule applies only when importing Excel (Phase 2).
  - Tooltip: "1.00 × 4 วันทำการ = 4.0 วัน".
- Evidence: verified (docs).

**M6-05 · ambiguity · Parsing, and BR-27 rounding before or after unit conversion**
- Refs: BR-26, BR-27, §11.1 units (`"1.5"`, `"f"`, `"h"`, `",5"`).
- **Decision:**
  - Parse the typed string as an exact decimal `n/10^k`. Accept `1.5`, `,5`, `1,5` and Thai digits; accept a trailing `%` in fraction mode. Allow at most 4 decimals and 3 integer digits.
  - Convert and round **once**, straight to a multiple of 25 cd with half-up:
    - days: `k = floor((200n + 25d)/(50d))`
    - fraction: `k = floor((2·n·cap + 25d)/(50d))`
    - result: `cd = 25k`
    - Examples: 0.125 → 25, 0.375 → 50, 0.1 → 0.
  - `0` deletes the row.
  - Above the maximum (700 WEEK / 100 DAY): reject the cell, keep the old value, and show "ใส่ได้ไม่เกิน 7 วันต่อสัปดาห์" or "ไม่เกิน 1 วันต่อวัน".
  - Negative or invalid: reject.
  - Values produced by `distribute` (BR-21/25) are not rounded to 25.
- Rationale: avoids double rounding and floats. Evidence: likely; numeric exactness verified by R5 T3e.

**M6-06 · ambiguity · `f` and `h` on ranges and on special cells**
- Refs: §4.8 `f`/`h`, AC-802.
- **Decision:**
  - Each cell uses its own capacity.
  - `f` = exact `capCd` (never rounded, so it can never create an overload).
  - `h` = `25·floor((2·cap+50)/100)` (half of cap, rounded to 25 half-up).
  - Skip cells with cap = 0 (hint "ไม่มี capacity ช่วงนี้"), read-only cells and DAY-week cells in M6.
  - One undo entry.
  - Trigger: in navigation mode apply at once (`code` KeyF/KeyH); in edit mode, typing "f"/"h" + Enter works through `units.parse`.
  - In fraction mode f ≡ 1.00 and h ≡ 0.50.
- Evidence: likely.

**M6-07 · ambiguity · Paste (TSV from Excel or Google Sheets)**
- Refs: §4.8 `Cmd+V`, AC-803.
- **Decision:**
  - Parse `text/plain`: drop the trailing newline, accept `\r\n`, handle quoted cells. Values are in the current unit.
  - Anchor at the selection's top-left.
    - One cell selected: paste the whole block.
    - Selection dimensions are exact multiples of the block: tile.
    - Otherwise: paste the block once.
  - Rows beyond the last editable row are dropped.
  - Read-only targets are **skipped, not shifted**: task, parent, masked and unassigned rows, and DAY weeks in M6.
  - Columns extend freely into future weeks.
  - An empty clipboard cell clears its target (Excel behaviour).
  - Show a toast summarising what was skipped.
  - One undo entry, one multi-assignment transaction (M6-10).
- Evidence: likely.

**M6-08 · ambiguity · `Cmd+←` / `Cmd+→` at the edges and across column kinds**
- Refs: §4.8.
- **Decision** (aligned with R5 M6-26):
  - Move the selected block ±1 column.
  - Clear the vacated edge column; overwrite the destination column; the selection moves with the block.
  - Only allowed when every involved column is the same kind (all weeks, or the days of one expanded week in M7). Otherwise do nothing and show a toast.
  - Read-only or DAY-week (M6) cells in the path cancel the operation.
  - Call `preventDefault` so the browser does not go Back (Chromium lets the page handle it first; likely).
  - Windows: `Ctrl+←/→`.
  - One undo entry.
- Evidence: likely, with manual QA in Chrome and Safari.

**M6-09 · ambiguity · Fill handle**
- Refs: §4.8.
- **Decision:**
  - Copy (tile) the source values horizontally or vertically. Never increment like a series.
  - Skip read-only cells.
  - In M7, fill only within contiguous columns of the same kind.
  - One undo entry.
- Evidence: likely.

**M6-10 · spec-inconsistency · `saveAllocations` takes one assignment, but operations span many**
- Refs: §7.4 input, AC-803 (2×4 paste = 2 assignments), the person grid (multiple projects).
- **Decision** (R5 M6-9b, plus lock order):
  - `saveAllocations({ items[], onDayWeekConflict?, clientOpId })` runs in **one transaction** (§4.2).
  - Lock with `SELECT … FROM task_assignments ta JOIN tasks t … WHERE ta.id = ANY($ids) ORDER BY ta.id FOR UPDATE OF ta`, so the lock order is deterministic (E11).
  - Check **authz per item's project**. Any item the viewer cannot see makes the whole batch a 404.
  - Any version mismatch returns `VERSION_CONFLICT` with the current state of each conflicting item.
  - Write one audit row per assignment.
  - Retry once on `40P01`.
  - Record as a Decision; the input is a superset of §7.4.
- Evidence: verified (deadlock and lock order).

**M6-11 · risk · The BR-20b trigger race**
- Refs: §6.3, BR-20b.
- Problem: under READ COMMITTED, a concurrent WEEK insert and DAY insert both pass the trigger (E10 / R5 T5).
- **Decision:**
  - Every writer takes the assignment lock or version bump first: `saveAllocations`, FR-612, unassign and its restore, BR-31 moves, `restoreTaskBatch`, and seeds.
  - Also add the exclusion constraint (E9) **in the same custom migration** as the SPEC trigger. The trigger is mandated by SPEC, so keep it.
  - Map P0001 `WEEK_DAY_CONFLICT` and 23P01 to an internal-error code. They should never fire.
- Evidence: verified.

**M6-12 · missing-detail · Migration mechanics for the trigger, extensions and constraints**
- Refs: §6.1, §7.2 `drizzle/9999_triggers.sql`, CLAUDE.md DB rules.
- Problem:
  - drizzle-kit applies only migrations listed in its journal. A hand-named `9999_triggers.sql` would be ignored [likely].
  - Extensions must exist before their first use: `pg_trgm` GIN indexes in M3/M4, the `btree_gist` exclusion in M5.
  - Drizzle has no builder for EXCLUDE constraints.
- **Decision:**
  - M1: `pnpm drizzle-kit generate --custom --name=extensions` (pgcrypto, pg_trgm, btree_gist) **before** the first table migration.
  - M5: a custom migration for the `time_off` exclusion constraint.
  - M6: `--custom --name=allocations_week_day_guard`, holding the trigger and the exclusion constraint.
  - Never edit generated SQL.
- Evidence: verified (the `--custom` flag exists; no EXCLUDE API).

**M6-13 · ambiguity · Undo entries, debounced batches, version chaining and VERSION_CONFLICT**
- Refs: §7.4 (debounce 400 ms, flush on blur, optimistic, VERSION_CONFLICT toast), §7.5, AC-805.
- **Decision:**
  1. One undo entry per **user action** (a commit, range fill, paste, fill, shift, `f`/`h`, Delete of a range, FR-612 apply, BR-23 collapse), independent of network batching.
  2. An entry holds **week snapshots** before and after: `{assignmentId, week, resolution, weekCd, days(7)}` (R5 M6-27).
     - Undo and redo apply a snapshot locally and enqueue its changes into the same coalescing queue.
     - A WEEK snapshot becomes a WEEK change plus `COLLAPSE`.
     - A DAY snapshot becomes 7 DAY changes, with `null` for empty days.
  3. There is one serialized save pipeline per grid: TanStack `useMutation({ scope: { id: 'grid-save' } })` (verified serial). `mutationFn` reads the **latest known version** when it runs, not when it was queued, so the client never conflicts with its own earlier save.
  4. On VERSION_CONFLICT: patch the cache from `conflicts[]`, drop pending changes and all undo/redo entries that touch those assignments, and show the SPEC toast.
  5. On a network or server error: roll the cells back to server state, keep the pending batch for "ลองใหม่", and drop the redo branch.
  6. Flush on grid blur, `visibilitychange`, `pagehide` and route change.
  7. Expose `data-save-state="idle|pending|saving|error"` on the grid root. The AC-805 e2e test waits for `idle` before reloading.
- Evidence: TanStack scope verified; the rest likely.

**M6-14 · spec-inconsistency · `GridResponse` vs the merged single-assignee rows and the "รวม" column in §8.3**
- Refs: §7.4 `GridRow`, §8.3 (merged rows; "รวม" 18.8 is all-time), FR-805.
- **Decision:**
  - The server returns canonical, flat rows in depth-first order (`position COLLATE "C"`).
  - The **client** merges the rows of a leaf task that has exactly one active assignee.
    - Edits go to the assignee.
    - Delete on a fully selected row deletes the task.
    - × on the chip unassigns.
  - Each assignee row carries `rowTotal: {total, committed}`, the all-time effective total that feeds "รวม" (R5 M6-4). Its query is an explicit, logged exception to the `week_start` rule; it took 4 ms (E8).
  - Task totals are summed on the client.
- Evidence: verified (mock arithmetic, timing).

**M6-15 · spec-inconsistency · `periodKey` collision**
- Refs: §7.4 `periods[].key`, and `capacity`, `standard`, `cells`, `totals` keyed by `periodKey`.
- Problem: the WEEK key (a Monday) equals the DAY key for that Monday. Any response or merged cache holding both a week and its days is ambiguous, for example the expanded week's total column in M7.
- **Decision:**
  - Keys are `W:YYYY-MM-DD` and `D:YYYY-MM-DD`.
  - `saveAllocations` keeps `{granularity, period}`.
  - A DAY-resolution week cell also carries `days` for the tooltip.
- Evidence: verified (SPEC text).

**M6-16 · spec-inconsistency · Aggregate totals are one number, but the view toggle needs two**
- Refs: FR-809, FR-1003, BR-37, `GridRow.task.totals` / `masked.totals: Record<string, number>`.
- Problem: a parent whose children have different overrides, the masked row and the footer's other-projects figure cannot be split into committed and tentative.
- **Decision:** every aggregate is `{ total, committed }` per period, with `atRisk = total − committed`. Assignee cells take their certainty from the task row.
- Evidence: verified (types).

**M6-17 · ambiguity · FR-809 inside the grid**
- **Decision:**
  - Rows stay in place and remain editable.
  - In the "แน่นอน" view, TENTATIVE rows are dimmed and left out of task, parent and footer sums. In "ยังไม่แน่นอน", CONFIRMED rows are.
  - The view is stored as `user_preferences.loadView` and shared with the workload page.
- Evidence: uncertain.

**M6-18 · cross-milestone-dependency · The footer switch "รวมงานโปรเจคอื่นของคนเหล่านี้" (§8.3)**
- Refs: §8.3, §3.3, M9 (masking and workload APIs).
- **Decision:**
  - Implement it in M6 with the single effective-load repo function (R5 M6-3) and `excludeProjectId`.
  - It returns `people[u].otherProjects: Record<PeriodKey, {total, committed}>` only when `includeOthers=1`, with no names or ids.
  - This is allowed because the people in a project grid are the viewer's co-members.
  - M9 reuses the function.
- Evidence: query timing verified (E8).

**M6-19 · ambiguity · Who the footer counts**
- Refs: FR-806, §8.3.
- **Decision:**
  - People = the distinct users with an active assignment on a non-deleted task of this project, regardless of collapse or filters. This includes deactivated users (capacity 0 from the deactivation date).
  - Capacity = each person's full capacity.
  - % = load ÷ capacity, or "—" when capacity is 0.
  - The view toggle applies.
  - Load after a task's completion week does not count (BR-50).
- Evidence: likely.

**M6-20 · cross-milestone-dependency · FR-807/808 appear in M6, but BR-45 colours arrive with overload in M9**
- **Decision:**
  - M6 cells get **no load colours**.
  - M6 does show:
    - leave as a partial-week icon plus tooltip, e.g. "ลา 2 วัน (5–6 ต.ค.)" with the label masked;
    - holidays in grey with the name;
    - cap = 0 as full diagonal stripes;
    - TENTATIVE rows with an amber left bar, dimmed numbers and ◐.
  - Colours come with `overload.ts` (day level in M7, week level in M9).
- Evidence: likely.

**M6-21 · spec-inconsistency · Some §8.7 tokens fail the §8.9 contrast rule**
- Problem: `#9C6500`/`#FFEB9C` = 4.12:1 (E21). "ตัวเลขจางลง" done with opacity can also fall below 4.5:1.
- **Decision:**
  - Change the amber foreground to `#8F5C00` or darker (4.76:1).
  - Implement "faded" as a colour token that passes, not as opacity; slate `#64748B` on white = 4.76:1.
  - Define dark-mode tokens.
  - A unit test checks the contrast of every token pair.
  - Record as a Deviation (token values).
- Evidence: verified.

**M6-22 · ambiguity · FR-612 / BR-25 "วางแผน N วัน": preview and replacement scope**
- **Decision:**
  - Action `planAssignmentRange({taskAssignmentId, baseVersion, totalCd, start, end, dryRun})` (§4.4).
  - Pre-fill the range from the task's start and due dates (R5).
  - A week is **whole** when the range covers every day of that week on which the user's schedule is above 0. Holidays and leave are ignored for this test. Whole weeks are written as WEEK rows.
  - Other weeks are boundary weeks:
    - An existing WEEK row is first split with BR-22 and spill; then only the days **inside the range** are replaced.
    - Existing DAY rows: only the days inside the range are replaced.
    - Days outside the range are never touched.
  - N = 0 clears the range.
  - Weights fall back in this order: capacity, then schedule (BR-21a), then Mon–Fri.
  - The preview lists, per week, before → after (with days for boundary weeks), the capacity in range, "เกิน capacity X วัน", and non-working-day warnings.
  - Apply creates one undo entry.
  - The preview dialog is required by the spec; it is not a delete confirmation.
- Evidence: uncertain.

**M6-23 · cross-milestone-dependency · Earlier milestones depend on allocations (M6)**
- Refs:
  - FR-303 load (M2)
  - FR-406 "จะปลดภาระ X วัน-คน" (M2)
  - BR-52 toast (M3)
  - AC-603 "…กลับมาครบ พร้อมแผนเดิม" (M3)
  - AC-203 grid label (M1)
  - FR-610 moving the plan to the child (M3)
- **Decision:**
  - M2/M3 ship without the load parts: X = 0 or the text is hidden.
  - M6 wires BR-52 and FR-406 X; both use bounded future-plan queries.
  - M6 re-runs AC-603 with plans and AC-203 in the grid, as M6 e2e tests.
  - FR-303 moves to M9 together with FR-409.
  - FR-610 needs no allocation code if it re-points `task_assignments.task_id`, but it must bump the version.
- Evidence: verified (SPEC scope lines).

**M6-24 · missing-detail · Unassigned, archived and completed rows**
- **Decision:**
  - A leaf task with no assignees shows "รอมอบหมาย" and read-only cells. Typing there shows the hint "มอบหมายคนก่อนวางแผน"; `+ คน` appears on hover.
  - An archived project's grid is read-only with a banner (its load is not counted, BR-44).
  - Completed tasks are hidden when `showCompleted` is false. Otherwise they are struck through, and cells after the completion week are grey with the tooltip "ไม่นับภาระ (งานเสร็จแล้ว)".
- Evidence: uncertain.

**M6-25 · missing-detail · Keyboard details**
- **Decision:**
  - Typing a value over a selected range and pressing Enter fills the range and keeps it selected.
  - Enter on a single cell moves down.
  - Tab / Shift+Tab move right / left while the grid has a selection.
  - Esc cancels an edit. When not editing, Esc clears the selection; a following Tab then leaves the grid (no keyboard trap, §8.9).
  - Cmd+Z inside an input or contenteditable is the native undo.
  - Copy copies exact values (2 decimals) in the current unit, not the display rounding.
- Evidence: likely.

**M6-26 · risk · 2-D virtualization, "infinite" horizontal scroll, sticky header/footer and render performance**
- Refs: FR-801, §7.1 (TanStack Virtual, 2 axes), §9 (render < 300 ms, edit → visible < 50 ms).
- **Decision:**
  - One scroll container, with two virtualizers (rows, and columns with `horizontal: true`) and fixed column widths.
  - Sticky header, left column and footer via `position: sticky`.
  - **No prepending.** Use a fixed virtual time domain of today ±3 years (about 313 weeks ≈ 27.5k px; day zoom ≈ 96k px).
    - A sliding data window is refetched with `keepPreviousData`.
    - "วันนี้" = `scrollToIndex`.
  - Selection state lives in an external store.
  - Plain elements in cells (no MUI per cell); one shared tooltip.
  - Spike this first and add a render-time test.
  - The database is not the bottleneck: the §6.5 query takes 14–27 ms at the target scale (E8).
- Evidence: TanStack API verified (no prepend anchoring); DB timing verified.

**M6-27 · missing-detail · The golden F1 date range**
- Refs: §11.3 "31 ส.ค. – 28 ธ.ค." and `weekRange(from, to)` (half-open).
- Problem: F1's POS total of 4625 includes Rollout's week 2026-12-28 (250).
- **Decision:** tests call `to = '2027-01-04'`. Assert on cd values from the API, not on display strings.
- Evidence: verified (arithmetic).

**M6-28 · missing-detail · Authz and audit rows for M6**
- **Decision:**
  - `GET /api/grid/project/:id`: M/L/Me → 200; W → 404; nonexistent id → 404.
  - `saveAllocations` (checked per item) and `planAssignmentRange`: M/L/Me allowed; W → 404.
  - Masking: a non-manager viewer sees leave labelled "ลา".
  - Audit: one row per assignment per batch.
- Evidence: likely.

**M6-29 · cross-milestone-dependency · Keeping numbers fresh without reload (FR-405)**
- **Decision:**
  - Actions that change certainty, leave, completion, assignment or plan invalidate the `['grid']`, `['workload']` and `['badge']` queries in the current tab.
  - `refetchOnWindowFocus` covers other tabs.
  - There is no realtime push; VERSION_CONFLICT is the safety net.
- Evidence: likely.

**M6-30 · cross-milestone-dependency · `GridResponse.milestones` and `lateForMilestone` before M8**
- **Decision:** return real milestones (an empty list until M8 exists) and `lateForMilestone: false` until M8. The contract is stable from M6. See M8-01 for when the table is created.
- Evidence: likely.

**M6-31 · missing-detail · Grid API parameters**
- **Decision:** validate with zod:
  - `from` and `to` are Mondays, `to` is exclusive, and the span is at most 53 weeks;
  - `expand` weeks lie within the range;
  - `zoom=week|day`;
  - `includeOthers=0|1`.
  - The default window is 4 weeks back and 12 ahead (R5).
- Evidence: likely.

---

### 3.2 M7: Day resolution

**M7-01 · ambiguity · Expanding and collapsing the view vs BR-23 data collapse**
- Refs: FR-803, BR-23, v2.1 `Cmd+↑`.
- **Decision:**
  - Expanding the view (header click or `Cmd+↓`) and collapsing it (`Cmd+↑`) **never write data**.
  - BR-23 "รวมเป็นรายสัปดาห์" is a separate, explicit per-row, per-week action: a button under the expanded week, or a context-menu item.
  - It runs immediately, with an undo toast and no confirmation.
- Evidence: likely.

**M7-02 · ambiguity · Layout of an expanded week and of day zoom**
- **Decision:**
  - Show day columns only for days where some row has schedule > 0 or a DAY value; weekends appear when needed.
  - Add a narrow, editable "รวม" column. Editing it on a DAY week triggers BR-24.
  - Day zoom = every week expanded. Use `zoom=day` rather than listing every week in `expand=`.
- Evidence: uncertain.

**M7-03 · spec-inconsistency · NEEDS_CHOICE returns a single `week`**
- Refs: §7.4, BR-24.
- **Decision:**
  - Return `{code:'NEEDS_CHOICE', week, weeks: ISODate[]}`.
  - Show one dialog, "N สัปดาห์มีแผนรายวัน", with SCALE and COLLAPSE applied to all of them. The server validates everything before writing anything.
  - Cancel reverts only those weeks and re-sends the rest.
  - Undo never needs the dialog.
- Evidence: likely (R5 M7-8).

**M7-04 · ambiguity · Editing a spread-out day when clamping changes the other days**
- **Decision:**
  - The new week total = W − derived[d] + x (R5 M7-3).
  - Displayed spread-out values are the pure BR-21 values. When clamp-and-spill changes the stored days, show the toast "แยกเป็นรายวันแล้ว — ปรับค่าที่เกิน 1 วัน/วัน".
  - In the normal case (AC-804) the stored values equal the displayed ones.
- Evidence: likely.

**M7-05 · ambiguity · `f`, `h`, fill, shift and paste on DAY cells**
- **Decision:**
  - `f` = `dayCapacity`; `h` = half of it, rounded to 25; skip when cap = 0.
  - DAY maximum 100: typed values above 1.00 are rejected.
  - Fill, shift and paste only over contiguous columns of the same kind.
  - Values on non-working days are allowed, with a warning.
- Evidence: likely.

**M7-06 · cross-milestone-dependency · Day-level overload in M7 needs `overload.ts`, which is M9**
- Refs: M7 "overload ระดับวัน", BR-40 "(หรือต่อวันเมื่อ zoom รายวัน)", M9 `overload.ts`.
- Problem: in the project grid, the footer aggregates several people and would hide one person's overload.
- **Decision:**
  - Create `overload.ts` in M7 with BR-40 and the BR-45 classification, fully tested. BR-41 causes, the workload page and lists stay in M9.
  - M7 shows day-level status in the footer's day columns.
  - It also shows 🔴 on an assignee's day cell when that person's day load exceeds `dayCapacity`. The load counts this project, plus other projects when the footer switch is on.
  - The full per-person view is the M9 person grid in day zoom.
- Evidence: uncertain.

**M7-07 · missing-detail · BR-50 in day zoom**
- **Decision:** completion still cuts off by week. DAY rows later in the completion week, and spread-out days in that week, still count. Explain this in a tooltip and cover it with a test.
- Evidence: verified (SPEC §6.5 `week_start <= completed_week`).

**M7-08 · missing-detail · Leave recorded later on days that already have DAY allocations**
- **Decision:**
  - Never change the plan (BR-42).
  - Warn "มีงาน X วันวางไว้ในวันที่ลา" in the grid and in the FR-906 impact panel.
- Evidence: R5 M7-11.

**M7-09 · risk · Client and server spread values must agree**
- **Decision:**
  - The spread-out day values of WEEK rows are computed by the server (`derived: true` cells) and by the client (for optimistic updates). Both use the **same domain function and the same capacity data**.
  - A contract test compares the server's output with the client's computation on golden weeks.
- Evidence: likely.

---

### 3.3 M8: Milestones

**M8-01 · cross-milestone-dependency · The milestones table and task binding are needed before M8**
- Refs: the `tasks.milestone_id` FK in the §6.2 DDL (M3), FR-601/613/614 (M3), FR-702 (M8).
- **Decision:**
  - The M3 migration creates the `milestones` table (schema only). The M3 binding picker is empty until M8. Alternatively defer the binding UI to M8 and record that.
  - M8 adds create/edit/delete, the ◆ row, BR-70/71, and the calendar and home integrations.
  - Validate in the service, with a test, that `task.project_id = milestone.project_id`. There is no DB constraint for this.
- Evidence: verified (DDL).

**M8-02 · ambiguity · FR-708 unbinding vs undo**
- **Decision:**
  - Deleting a milestone is a soft delete (with a batch).
  - Every read treats a task bound to a soft-deleted milestone as unbound: `join milestones m … and m.deleted_at is null`.
  - Restore re-links automatically. Do **not** set `milestone_id` to null; purging is Phase 2.
- Evidence: likely.

**M8-03 · ambiguity · FR-707 dragging: granularity, keyboard and stacking**
- **Decision:**
  - In week zoom a drag moves the date ±7 days per column and keeps the weekday. In the expanded or day view it moves ±1 day.
  - Keyboard alternative (§8.9): focus ◆, press Enter, and a popover with a date field opens.
  - Only M and L can move milestones; Me sees them read-only.
  - One undo entry.
  - Several ◆ in one week column stack with a "+N" count and a tooltip.
- Evidence: uncertain.

**M8-04 · ambiguity · FR-702: which date does a click on the milestone row use?**
- **Decision:** a click opens an inline form pre-filled with the column's date (Monday in week zoom, the day in day zoom). The user can edit the date.
- Evidence: uncertain.

**M8-05 · missing-detail · BR-71 query and semantics**
- **Decision:**
  - One query per project returns, for each milestone, whether any bound, incomplete task has:
    - a WEEK row with `week_start > m.date`, or
    - a DAY row with `period_start > m.date` (joins with `deleted_at is null`), or
    - `due_date > m.date`.
  - Upper bound `m.date + 3 years`, as a logged exception to the `week_start` rule.
  - A WEEK row **in the milestone's own week** never triggers the warning, even if its spread-out days fall after the date. Documented.
  - AC-701/702 run with fake today and golden data.
- Evidence: likely.

**M8-06 · cross-milestone-dependency · Where else FR-705/706 must show**
- **Decision:**
  - M8 adds ◆ to the M5 calendar and the "เลย milestone" warning to the M3 task list and panel.
  - Home (M10) and the person grid (M9) show only milestones of projects where the person has active assignments **and** the viewer can see the project.
- Evidence: likely.

**M8-07 · missing-detail · Milestone authz and the Cmd+K command**
- **Decision:**
  - Create, update, move, delete and restore:
    - M and L: allowed;
    - Me: **403** (they can see the project);
    - W: 404.
    - Add these to the table-driven suite.
  - Add a "สร้าง milestone" palette command, shown only to M and L. The palette exists since M4.
- Evidence: verified (§3.2, §11.2 "allow / 404 / forbidden").

**M8-08 · missing-detail · BR-70 and FR-703 details**
- **Decision:**
  - Status is computed on the server with `clock.today()`. DUE_SOON when `0 ≤ date − today ≤ 7`.
  - The progress "เสร็จ 4/7 งาน" counts non-deleted bound tasks at any depth.
- Evidence: likely.

---

### 3.4 M9: Workload and the per-person view

**M9-01 · spec-inconsistency · BR-45 colours vs RISK**
- Problem: in the "ทั้งหมด" view a RISK cell has total > cap, so BR-45 turns it red, the same as OVER. There is no RISK token.
- **Decision:**
  - The colour is the ratio of the **selected view's** load:
    - ทั้งหมด → total;
    - แน่นอน → committed;
    - ยังไม่แน่นอน → no BR-45 colours, use the tentative palette.
  - The glyph comes from BR-40 regardless of view: OVER = 🔴 + number, RISK = ⚠ + number.
  - Colour bands use integer maths (`5*load >= 4*cap`).
- Evidence: verified (SPEC text).

**M9-02 · ambiguity · Excess ("เกินกี่วัน", FR-1006)**
- **Decision:** OVER → committed − cap; RISK → total − cap; OK → 0.
- Evidence: verified (E15 Excel formulas; v2.1 L682; golden F2 = 100, F3 = 200, F4 = 50).

**M9-03 · missing-detail · The `/api/workload` shape (not in SPEC)**
- **Decision:** see §4.5.
  - Each cell has total, committed, capacity, standard, level, excess, cause, and a per-project breakdown for hover. Hidden projects are folded into one `projectId: null` entry labelled "งานในโปรเจคอื่น".
  - A `projects` dictionary contains **visible projects only**.
  - The FR-1005 task list loads lazily from `GET /api/workload/cell?userId&week` (masked).
  - The overload list, its tab count and the badge all come from the same service (R5).
- Evidence: likely.

**M9-04 · ambiguity · FR-1004 filters**
- **Decision:**
  - The position and project filters select **people**. Cells still show each person's full load across all projects.
  - "แสดงเฉพาะคนที่ล้น" = people with at least one cell where the load of the displayed view exceeds capacity.
  - The project filter offers visible projects only.
- Evidence: uncertain.

**M9-05 · ambiguity · Who appears in workload and in team %**
- Refs: R5 M9-11.
- **Decision:**
  - Active users who are members of at least one non-archived project.
  - Plus any user, including deactivated ones, with load > 0 in the range, labelled "ปิดใช้งาน".
  - A deactivated user's remaining load shows as OVER (P4) and counts toward the badge.
- Evidence: uncertain.

**M9-06 · ambiguity · Do the week windows include the current week?**
- Refs: FR-1007 (4 weeks), FR-1101 (8 weeks), FR-303/409/1001 (12 weeks).
- **Decision:**
  - Yes. The §8.2 mock, drawn on Wed 30/9, starts at 28/9.
  - Badge = the number of (person, week) cells at level OVER, over the people the viewer may see and the weeks `[weekStart(today), +4w)`.
  - Expected e2e values with fake today 2026-09-30:
    - F2: manager and LEADs → 2; Ivy → 1 (Mint only).
    - F3: manager → 1.
- Evidence: verified (golden memberships).

**M9-07 · risk · A badge rendered in the layout goes stale**
- Problem: App Router layouts do not re-render on client navigation.
- **Decision:**
  - The server renders the initial value.
  - A small client component with the query `['workload','badge']` refreshes it. Grid saves, leave, certainty and completion invalidate it, and it refetches on window focus.
  - This differs from R5 M9-8.
- Evidence: likely (documented Next.js behaviour).

**M9-08 · spec-inconsistency · The person grid on PlanGrid (`/people/[id]`)**
- Problem: `GridRow` has no `project` kind, although the person grid rows are "โปรเจค → task".
- **Decision:**
  - Add `{kind:'project', …, totals}`, visible projects only.
  - Rows are the person's leaf-task assignments, merged, with the parent path as a muted breadcrumb. They are editable when the viewer may edit that project.
  - One `masked` row "งานในโปรเจคอื่น" carries `{total, committed}` per period, with no ids or counts.
  - Footer = the person's load vs capacity, with BR-45 colours and the level glyph.
  - Milestones = the person's projects ∩ the viewer's visible projects.
  - Return 404 when the viewer may not see the person's totals.
  - Golden masking tests:
    - Ivy → Mint: "Mobile App Revamp" and "พัฒนา front-end" are absent, and so are their ids.
    - Ivy → Jack: 404.
    - Cindy (a LEAD) → Jack: only the masked row.
- Evidence: verified (memberships).

**M9-09 · missing-detail · `/people` list ("👥 ทีมงาน" in the sidebar)**
- Problem: no FR or milestone covers it.
- **Decision:** M9 adds `/people` showing the people the viewer may see, grouped by position, with this week's load and capacity. FR-209 (the manager's list) stays in M1.
- Evidence: uncertain.

**M9-10 · ambiguity · FR-1009 `/my` grouping, and the sidebar count "งานของฉัน 5"**
- **Decision:**
  - A task goes into the earliest group (this week, next week, later) that holds my effective allocation from this week on. Otherwise it goes into "ยังไม่วางแผน". Show my days for that week.
  - The sidebar count (§8.1, which has no FR) = my incomplete tasks in "สัปดาห์นี้".
- Evidence: uncertain.

**M9-11 · missing-detail · FR-906, the overload part**
- **Decision:**
  - On leave create, update, delete or undo, list capacity X → Y for each affected week.
  - List only the weeks whose level **got worse**, with links to `/people/[id]?week=`.
  - Mask project names.
- Evidence: R5 M9-9.

**M9-12 · missing-detail · The load parts of FR-409 and FR-303**
- **Decision:**
  - FR-409 overview: each member's load in this project over 12 weeks, including the current one, and 12 small bars of the project total. The tentative part is hatched.
  - FR-303 client page: the sum over the client's projects **that the viewer can see**.
- Evidence: uncertain.

**M9-13 · ambiguity · Where the unit preference applies**
- **Decision:** FR-804 applies only to grids (project and person). Workload, home, the overview and the client page always show days, plus % where relevant.
- Evidence: uncertain.

**M9-14 · missing-detail · Scrolling the workload horizontally**
- **Decision:**
  - Reuse the grid's time domain and sliding window.
  - Weeks only: no day zoom on the workload page. Per-day overload lives in the person grid.
- Evidence: likely.

---

### 3.5 M10: Home and search

**M10-01 · risk · SPEC §6.4 search does not scale for page content**
- Evidence: E6, verified.
- **Decision:**
  - For each category: escaped ILIKE and `LIMIT 8`.
  - Names and titles: ORDER BY `similarity()` (cheap on short text).
  - Page content: title hits first. Then fetch content-only hits **unordered with `LIMIT 8`**, and sort those 8 by `updated_at` in the app.
  - Search page content only when q has ≥ 3 characters.
  - Run the search transaction with `SET LOCAL statement_timeout='500ms'`.
  - Client: debounce about 120 ms, with an AbortController.
  - Preload the small lists (visible projects, visible people, visible clients) when the palette opens, for instant local results.
- Rationale: the "ผลแรก < 200 ms" target in §9.

**M10-02 · risk · Thai trigrams depend on the database locale**
- Evidence: E4, E5, verified.
- **Decision:**
  - Pin the Debian `postgres:17` image in dev and prod. No alpine image, no C/POSIX initdb.
  - Add a startup or CI assertion: `array_length(show_trgm('ลูกค้า'),1) > 0`.

**M10-03 · risk · LIKE wildcards in user input**
- Evidence: E7, verified.
- **Decision:** escape `\`, `%` and `_`, and bind the pattern as a parameter.

**M10-04 · ambiguity · Permissions and ranking per category (FR-1104)**
- **Decision:**
  - Projects: those the viewer can see, including archived ones (with an "archive" chip).
  - Tasks: in visible projects, not deleted.
  - Pages: every WORKSPACE page, plus PROJECT pages of visible projects, not deleted.
  - People: those whose totals the viewer may see, so their person page never returns 404.
  - Clients: manager sees all; others see the clients of their projects (§3.2).
  - Ranking: prefix match, then similarity, then `updated_at`.
- Evidence: uncertain.

**M10-05 · ambiguity · Quick commands (FR-1103)**
- **Decision:**
  - "สร้าง task": in the current project; otherwise pick a project, remembering the last choice in `user_preferences`.
  - "สร้างหน้า": in the current project's space, otherwise the wiki. Start blank and open it.
  - "แจ้งลา": open the M5 dialog for yourself.
  - "ไปหน้าวันนี้": go to `/home`.
  - "สร้าง milestone" (M8): M and L only.
- Evidence: uncertain.

**M10-06 · risk · Cmd+K and undo vs BlockNote**
- Evidence: verified (`@blocknote/react` 0.55 source).
- **Decision:**
  - The palette handler listens on `window` in the bubble phase and ignores events that are `defaultPrevented`. Inside the editor with text selected, Cmd+K therefore means "link"; elsewhere it opens the palette.
  - The global undo never intercepts events inside inputs or contenteditable elements.

**M10-07 · ambiguity · Home page details**
- **Decision:**
  - Greeting by the hour in Bangkok, strings in `th.ts`:
    - 05:00–11:59 "สวัสดีตอนเช้า";
    - 12:00–17:59 "…ตอนบ่าย";
    - otherwise "…ตอนเย็น".
  - The date line is weekday short + dateStyle medium, e.g. "พุธ 30 ก.ย. 2569" (verified). Render it **on the server** to avoid a hydration mismatch.
  - Recent pages: the 8 most recently updated visible pages by anyone, e.g. "Ivy แก้ 2 ชม. ที่แล้ว". This is ICU's short format; the mock shows no space before "ที่แล้ว".
  - Milestones: date in [today, today+14], plus overdue milestones that are not done, flagged.
  - Manager cards: OVER and RISK for this week and next; team % per week over 4 weeks.
- Evidence: Intl output verified; the rest uncertain.

**M10-08 · spec-inconsistency · FR-1101 "ใครลาวันนี้ / สัปดาห์นี้" vs the §8.2 mock "สัปดาห์หน้า"**
- **Decision:**
  - Show three lines: วันนี้, สัปดาห์นี้, สัปดาห์หน้า.
  - Only people the viewer may see. The label is "ลา"; the leave type is shown only to managers and the person themselves.
- Evidence: verified (SPEC L423 vs L1124).

**M10-09 · ambiguity · The mock's "+ เพิ่มงาน…" in the "งานของฉันสัปดาห์นี้" card**
- Problem: the mock has it; FR-1101 does not. A new task has no plan, so it would not stay in "this week".
- **Decision:** leave it out and point to Cmd+K "สร้าง task". The FR text wins over the mock.
- Evidence: uncertain.

**M10-10 · risk · The palette's < 200 ms target**
- **Decision:**
  - Small categories are matched locally, so the first result is instant.
  - Server search p95 must be ≤ 100 ms (trigram ILIKE: 0.1–0.6 ms at the target size).
  - A Playwright test measures the time from keystroke to first result.
- Evidence: DB timings verified.

**M10-11 · (optional) risk · Thai sara am, composed vs decomposed**
- Problem: U+0E33 vs U+0E4D U+0E32 do not match each other.
- **Decision:** optional. Apply NFKC to both the query and the stored searchable text. Do not add this to the MVP unless users report it.
- Evidence: likely.

---

### 3.6 M11: Hardening and deployment

**M11-01 · spec-inconsistency · The SPEC §10.2 compose file is invalid YAML**
- Evidence: E16, verified.
- **Decision:** use block style, or quote `"${…}"`. Better: have db and backup read `env_file: ../.env`, so there is no interpolation (see M11-02).

**M11-02 · risk · The `.env` file used for interpolation**
- Evidence: E16, verified.
- Problem: the CLAUDE.md command `docker compose -f docker/docker-compose.yml up -d --build`, run from the repo root, leaves `POSTGRES_PASSWORD` blank.
- **Decision:** every service gets `env_file: ../.env` and there is no `${}` interpolation. Otherwise, document `--env-file .env` in both CLAUDE.md and the README.

**M11-03 · risk · The healthcheck reports ready during initdb**
- Evidence: E2, verified.
- **Decision:**
  - Healthcheck: `pg_isready -h 127.0.0.1 -U planner -d planner`.
  - The migrate script retries its connection for about 60 s.

**M11-04 · risk · Permissions on the uploads volume**
- Evidence: E17, verified.
- **Decision:** in the runner stage, `RUN mkdir -p /data/uploads && chown <appuser> /data/uploads` before `USER`. A host bind mount needs its ownership documented.

**M11-05 · risk · Installing on a server without internet, and TLS**
- Refs: §9 "server อาจไม่มีอินเทอร์เน็ต", §10.1 Caddy "HTTPS อัตโนมัติ".
- **Decision:**
  - README "offline install":
    - Build on a connected machine with `docker buildx build --platform linux/amd64`, because the dev machine is arm64.
    - `docker save` the images (app, postgres:17, caddy:2), copy them over, `docker load`, then `docker compose up -d --no-build`.
  - Caddy:
    - Names ending in `.local`, `.internal` or `.home.arpa`, and IPs, get the internal CA automatically.
    - For other internal names use `tls internal` or the company's certificates (`tls cert key`).
    - In Docker the root CA must be installed on client machines by hand.
- Evidence: verified (Caddy docs).

**M11-06 · missing-detail · The Caddyfile and proxy setup**
- **Decision:** see §4.11.
  - `{$SITE_ADDRESS}` with `encode zstd gzip` and `reverse_proxy app:3000`, plus optional `tls` from an env var.
  - The caddy service gets `env_file` and `depends_on: app`. Caddy keeps the Host header, so the Server Actions origin check passes.
  - `BETTER_AUTH_URL` must equal the public URL.
  - Warn that `:3000` over plain http with `SECURE_COOKIES=true` cannot log in.
- Evidence: likely.

**M11-07 · missing-detail · How `backup.sh` schedules itself inside `postgres:17`**
- Evidence: E1, E18, verified.
- **Decision:** use the tested prototype (§4.11).
  - A shell loop sleeps until the next 02:00 (TZ comes from `.env`).
  - On start it runs a backup if today's file is missing, so a fresh deploy can prove "backup ไฟล์เกิดจริง".
  - A `once` mode runs one backup by hand.
  - Files are written as `.tmp` and then moved.
  - Retention uses `-mtime +13`.
  - Archive with `tar -C /data uploads`.

**M11-08 · spec-inconsistency · The restore command**
- Evidence: E19, verified.
- **Decision:** the README restore steps are:
  1. `docker compose stop app`
  2. `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" db-YYYYMMDD.dump`
  3. `tar xzf uploads-YYYYMMDD.tgz -C /data` into the uploads volume
  4. `start app`
  - Rehearse a restore every quarter.

**M11-09 · missing-detail · What the README contains**
- **Decision:**
  1. Prerequisites.
  2. `.env`: generate secrets with `openssl rand`; set `BETTER_AUTH_URL` and `SECURE_COOKIES`.
  3. First boot and bootstrap. Remove `INITIAL_MANAGER_PASSWORD` afterwards.
  4. TLS options.
  5. Importing holidays from CSV.
  6. Backups: location, verification, copying off the host.
  7. Restore.
  8. Upgrade: back up → pull or load → `up -d` (migrate runs) → verify.
  9. Offline install.
  10. Troubleshooting: http cookies, URL/origin mismatch, EACCES on uploads, healthcheck.
  11. Developer setup: `npm i -g pnpm` because Node 26 has no corepack; Docker uses Node 22.
- Evidence: likely.

**M11-10 · risk · Environment variables at `next build` time in Docker**
- **Decision:**
  - Parse env lazily, at first use or at server start, never at module import.
  - Every page that touches the DB is dynamic.
  - Build with harmless dummy values if needed; no secrets in `NEXT_PUBLIC_*`.
- Evidence: likely.

**M11-11 · spec-inconsistency · "e2e ทั้งหมดเขียว" vs `seed:golden` refusing `NODE_ENV=production`**
- **Decision:**
  - (a) Run the full e2e suite against `next build && next start`. Seeding happens in the Playwright process (NODE_ENV=test) against the test DB.
  - (b) Add `e2e/m11-deploy.spec.ts`, a smoke test against the compose stack on fresh volumes: initial manager login → forced password change → create an employee and a project → a backup file exists.
- Evidence: verified (SPEC A.1, M11).

**M11-12 · missing-detail · What `seed:demo` must do**
- **Decision:**
  - Compose the X-10 builders and go **through the services**, so that FR-402 charters, BR-60 membership and audit rows (actor null) are created.
  - Commit a sample image under `scripts/assets` and store it with `storage.ts`.
  - Refuse `NODE_ENV=production` unless `ALLOW_DEMO_SEED=1`.
  - Require an empty DB, or `--reset`.
- Evidence: likely.

**M11-13 · spec-inconsistency · Appendix A.2 vs BR-31**
- Problem: A.2 wants "Rollout สาขา" to have an unassigned child "เตรียมคู่มือสาขา". But the first child added to an assigned task receives the assignment and the plan (FR-610).
- **Decision:**
  - Add the first child "ติดตั้งระบบที่สาขา". It receives Mint and the plan, and inherits TENTATIVE.
  - Then add "เตรียมคู่มือสาขา", unassigned.
  - The F1 numbers stay the same; assert them on the demo DB.
- Evidence: verified (SPEC L1538 vs BR-31, FR-610).

**M11-14 · missing-detail · The data behind `seed:perf`**
- **Decision:**
  - 100 users: Better Auth `user` and `account` rows sharing one precomputed hash.
  - 300 projects: 25% TENTATIVE, 10% archived.
  - 20k tasks in 3 levels; about 15k assignments.
  - About 300k allocations over 3 years, with 5% DAY weeks.
  - **One project with ≥ 200 grid rows inside a 16-week window.**
  - 5,000 pages averaging about 20k characters, and one page with 300 blocks.
  - Leave and holidays.
  - Generate with SQL `generate_series` (305k rows in about 2 s, E8) or postgres.js COPY.
  - Guard against production.
- Evidence: verified (generation speed; COPY API).

**M11-15 · missing-detail · How to measure the §9 performance targets**
- **Decision:**
  - Always against a production build.
  - `scripts/perf.ts`: log in, warm up, then 100 sequential + 20 concurrent requests per endpoint, and report p95.
  - Client timings in Playwright:
    - `performance.mark` around data received → first rows painted (via rAF), for the < 300 ms render target;
    - keydown → MutationObserver, for < 50 ms;
    - opening a 300-block page, for < 1 s;
    - palette keystroke → first result, for < 200 ms.
  - Optional heap check (R5).
  - Record the results in PROGRESS.
- Evidence: likely.

**M11-16 · risk · Request body limit when a proxy is configured**
- Problem: Next 16 `proxyClientMaxBodySize` defaults to 10 MB (verified), but §7.6 allows 25 MB attachments.
- **Decision:** leave `/api/files` out of the `proxy.ts` matcher, or set the limit ≥ 26 MB. The M11 test uploads a 24 MB file. The limit originates in M4.
- Evidence: verified (d.ts).

**M11-17 · missing-detail · Security headers**
- Refs: §9.
- **Decision:**
  - CSP: a nonce for scripts with `'strict-dynamic'`; `style-src 'self' 'unsafe-inline'` (Emotion and BlockNote; stricter would be possible with an Emotion `nonce`); `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'`.
  - Also `nosniff`, `Referrer-Policy` and `Permissions-Policy`.
  - The sibling R1 served this CSP from a Next 16 app (`scratchpad/h1.txt`).
- Evidence: likely.

**M11-18 · risk · Node versions**
- Facts: local Node 26.5 (no corepack) vs `node:22-alpine` (22.23.3, with corepack) [verified]. The Thai Intl output is identical on both (ICU 78.3) [verified].
- **Decision:** `.nvmrc` = 22. Docker is the source of truth. In M11, run e2e against the Docker build.

**M11-19 · missing-detail · The Compose project name**
- Problem: with the compose file in `docker/`, the default project name is `docker` **[verified: `docker compose -f docker/… config` prints `name: docker`]**. Volumes become `docker_pgdata`, `docker_uploads` and so on, which could collide with any other stack whose folder is also called `docker`.
- **Decision:** put `name: planner` at the top of both compose files, so volumes become `planner_pgdata`, `planner_uploads`, `planner_backups` and `planner_caddy_data` [verified]. The README's backup and restore commands use these names.

---

## 4. Proposed contracts and code

### 4.1 `GridResponse` (revision of §7.4; record as a Decision)
```ts
type ISODate = string
type PeriodKey = `W:${ISODate}` | `D:${ISODate}`          // M6-15
type LoadPair = { total: number; committed: number }      // cd, atRisk = total − committed (M6-16)

interface GridResponse {
  window: { from: ISODate; to: ISODate; expand: ISODate[]; zoom: 'week' | 'day' }
  today: ISODate                                          // server clock (fake-able, X-02)
  periods: { key: PeriodKey; kind: 'WEEK' | 'DAY'; date: ISODate; weekStart: ISODate }[]
  rows: GridRow[]                                         // flat, depth-first by position COLLATE "C"
  milestones: { id: string; name: string; date: ISODate; status: MilestoneStatus; projectId: string; late: boolean }[] // [] until M8
  people: Record<string, {
    name: string; deactivatedOn: ISODate | null
    capacity: Record<PeriodKey, number>; standard: Record<PeriodKey, number>
    timeOff: { start: ISODate; end: ISODate; half: 'AM' | 'PM' | null; label: string }[] // label masked (§3.3)
    otherProjects?: Record<PeriodKey, LoadPair>            // only with includeOthers=1 (§8.3 toggle, M6-18)
  }>
  holidays: { date: ISODate; name: string }[]
}
type GridRow =
  | { kind: 'project'; id: string; name: string; color: string; certainty: Certainty; totals: Record<PeriodKey, LoadPair> } // person grid (M9-08)
  | { kind: 'task'; id: string; depth: 0 | 1 | 2; name: string; parentId: string | null
      certainty: Certainty; certaintySource: 'task' | 'ancestor' | 'project'; completed: boolean; completedWeek: ISODate | null
      milestoneId: string | null; lateForMilestone: boolean; assigneeCount: number }
  | { kind: 'assignee'; taskAssignmentId: string; taskId: string; userId: string; version: number; editable: boolean
      rowTotal: LoadPair                                   // all-time "รวม" (M6-14)
      cells: Record<PeriodKey, { cd: number; resolution: 'WEEK' | 'DAY'; derived: boolean; days?: Record<ISODate, number> }> }
  | { kind: 'masked'; userId: string; totals: Record<PeriodKey, LoadPair> }  // no ids/counts; client renders th.ts "งานในโปรเจคอื่น"
```

### 4.2 `saveAllocations` (a batch; a superset of §7.4)
```ts
type Change = { granularity: 'WEEK' | 'DAY'; period: ISODate; cd: number | null }   // null = delete
type WeekState = { cd: number; resolution: 'WEEK' | 'DAY' | null; days?: Record<ISODate, number> }
type Warning = { code: 'WORK_ON_NON_WORKING_DAY' | 'WEEK_NO_CAPACITY' | 'SPILLED_OVER_DAY_LIMIT' | 'ALLOCATED_ON_TIME_OFF'
                 taskAssignmentId: string; week: ISODate; date?: ISODate }             // Thai text built client-side from th.ts
input:  { items: { taskAssignmentId: string; baseVersion: number; changes: Change[] }[]
          onDayWeekConflict?: 'SCALE' | 'COLLAPSE'; clientOpId: string }
output: | { ok: true; results: { taskAssignmentId: string; version: number; weeks: Record<ISODate, WeekState> }[]; warnings: Warning[] }
        | { ok: false; code: 'VERSION_CONFLICT'; conflicts: { taskAssignmentId: string; version: number; weeks: Record<ISODate, WeekState> }[] }
        | { ok: false; code: 'NEEDS_CHOICE'; week: ISODate; weeks: ISODate[] }            // M7-03
        | { ok: false; code: 'VALIDATION'; issues: { taskAssignmentId: string; period: ISODate; reason: 'MAX' | 'NEGATIVE' | 'MIXED_WEEK_AND_DAY' }[] }
```
Rules per (item, week). Everything is validated before anything is written, all-or-nothing:

| Current resolution | Change types | Action |
|---|---|---|
| none / WEEK | WEEK only | upsert, or delete when null |
| WEEK | DAY only | BR-22: split with clamp-and-spill; **DELETE WEEK first**, INSERT DAY rows, then apply the changes (M7; M6 never sends this except through FR-612) |
| DAY | WEEK | needs `onDayWeekConflict`, otherwise NEEDS_CHOICE. SCALE = distribute the new total over the existing day values with spill; COLLAPSE = DELETE DAY rows, then write WEEK (or nothing when null) |
| DAY | DAY only | set or delete single DAY rows |
| any | WEEK **and** DAY in one item | VALIDATION `MIXED_WEEK_AND_DAY` |

### 4.3 Undo entry (M6-13)
```ts
type WeekSnapshot = { taskAssignmentId: string; week: ISODate; resolution: 'WEEK' | 'DAY' | null; weekCd: number; days: Record<ISODate, number> }
type GridUndoEntry = { label: string; before: WeekSnapshot[]; after: WeekSnapshot[] }
// restore(s): WEEK → [{WEEK, s.week, s.weekCd}] with onDayWeekConflict:'COLLAPSE'
//             DAY  → daysOfWeek(s.week).map(d => ({DAY, d, s.days[d] ?? null}))   (exact after BR-22 materialize)
//             null → delete whatever exists (WEEK null + COLLAPSE, or 7× DAY null)
```

### 4.4 `planAssignmentRange` (FR-612 / BR-25)
```ts
input:  { taskAssignmentId: string; baseVersion: number; totalCd: number; start: ISODate; end: ISODate; dryRun: boolean }
output: | { ok: true; version?: number                      // version only when !dryRun
            preview: { weeks: { week: ISODate; kind: 'WHOLE' | 'BOUNDARY'; before: WeekState; after: WeekState }[]
                       capacityCd: number; overCapacityCd: number; warnings: Warning[] } }
        | { ok: false; code: 'VERSION_CONFLICT' | 'UNREPRESENTABLE' | 'VALIDATION'; … }
```

### 4.5 Workload (M9-03)
```ts
GET /api/workload?from&to&view&positionId&projectId&onlyOver
{ weeks: ISODate[]
  groups: { positionId: string | null; name: string
            people: { userId: string; name: string; deactivated: boolean
                      cells: Record<ISODate, { totalCd: number; committedCd: number; capacityCd: number; standardCd: number
                                               level: 'OK' | 'RISK' | 'OVER'; excessCd: number; cause: 'WORKLOAD' | 'CAPACITY' | 'BOTH' | null
                                               byProject: { projectId: string | null; totalCd: number; committedCd: number }[] }> }[] }[]
  projects: Record<string, { name: string; color: string }> }   // visible projects only
GET /api/workload/cell?userId&week → { items: { taskId|null, taskName|null, projectId|null, cd, certainty }[] }  // masked items have nulls
GET /api/workload/badge → { overCount: number }                                                              // same service
```

### 4.6 Search (M10-01/03/04)
```sql
-- :pat = '%' || escape_like(:q) || '%'      (escape \ % _)
-- titles/names: cheap similarity ordering
select id, title, updated_at from pages
 where deleted_at is null and (<visibility>) and title ilike :pat
 order by similarity(title, :q) desc, updated_at desc limit 8;
-- content-only hits, only when char_length(:q) >= 3; unordered LIMIT then sort in app
select id, title, updated_at from pages
 where deleted_at is null and (<visibility>) and content_text ilike :pat and not (title ilike :pat)
 limit 8;
-- wrap in: begin; set local statement_timeout = '500ms'; … commit;
```

### 4.7 Domain snippets (pure TS, integers only)
```ts
// Exact largest remainder (M6-03). Ties → earlier index. sum(result) === totalCd when sum(weights) > 0.
export function distribute(totalCd: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW === 0) return weights.map(() => 0)            // caller applies fallback chain (R5 §3.2)
  const q = weights.map(w => Math.floor((totalCd * w) / sumW))
  const r = weights.map(w => (totalCd * w) % sumW)
  let rem = totalCd - q.reduce((a, b) => a + b, 0)
  const order = r.map((x, i) => ({ i, x })).sort((a, b) => b.x - a.x || a.i - b.i)
  for (const { i } of order) { if (rem-- <= 0) break; q[i]! += 1 }
  return q
}
// Typed amount → cd rounded to 25 (M6-05). n/d is the exact decimal; half-up.
export const roundDaysTo25 = (n: number, d: number) => 25 * Math.floor((200 * n + 25 * d) / (50 * d))
export const roundFractionTo25 = (n: number, d: number, capCd: number) => 25 * Math.floor((2 * n * capCd + 25 * d) / (50 * d))
export const halfCapacity = (capCd: number) => 25 * Math.floor((2 * capCd + 50) / 100)   // 'h'; 'f' = capCd exactly
// Display
export const oneDecimal = (cd: number) => { const t = Math.floor((cd + 5) / 10); return `${Math.floor(t / 10)}.${t % 10}` } // 35→"0.4"
export const fraction2 = (cd: number, cap: number) => { const h = Math.floor((200 * cd + cap) / (2 * cap)); return (h / 100).toFixed(2) } // cap>0
// BR-45 band (integer), BR-40 level, excess
export const band = (load: number, cap: number) => cap === 0 ? (load > 0 ? 'over' : 'off') : load > cap ? 'over' : 5 * load >= 4 * cap ? 'full' : load > 0 ? 'light' : 'empty'
export const level = (committed: number, total: number, cap: number) => committed > cap ? 'OVER' : total > cap ? 'RISK' : 'OK'
export const excess = (lv: string, committed: number, total: number, cap: number) => lv === 'OVER' ? committed - cap : lv === 'RISK' ? total - cap : 0
```

### 4.8 Server: lock and save (M6-10/11)
```ts
await db.transaction(async (tx) => {
  const ids = [...new Set(input.items.map(i => i.taskAssignmentId))].sort()
  const locked = await tx.execute(sql`
    select ta.id, ta.version, t.project_id from task_assignments ta join tasks t on t.id = ta.task_id
     where ta.id = any(${ids}) and ta.deleted_at is null and t.deleted_at is null
     order by ta.id for update of ta`)                                   // deterministic lock order (E11)
  // 1) any id missing or project not editable by user → NotFound (404) for the whole batch
  // 2) any version !== baseVersion → return VERSION_CONFLICT with current weeks for those ids
  // 3) read existing allocations: task_assignment_id = any(ids) and week_start = any(touchedWeeks)
  // 4) domain.planChanges(existing, changes, capacity, choice) → { deletes, inserts, upserts, warnings } | NEEDS_CHOICE
  // 5) DELETE first, then INSERT/UPSERT (satisfies trigger + exclusion constraint)
  // 6) update task_assignments set version = version + 1 where id = any(ids) returning id, version
  // 7) audit one row per assignment
})  // retry once on 40P01
```
Custom migration (`pnpm drizzle-kit generate --custom --name=allocations_week_day_guard`):
```sql
-- SPEC §6.3 trigger (unchanged) + race-free guard (E9)
create or replace function enforce_week_day_exclusivity() returns trigger as $$ … $$ language plpgsql;   -- as SPEC
create trigger trg_week_day_exclusivity before insert or update on allocations for each row execute function enforce_week_day_exclusivity();
alter table allocations add constraint allocations_one_resolution_per_week
  exclude using gist (task_assignment_id with =, week_start with =, granularity with <>);
```

### 4.9 Clock and Playwright (X-02)
```ts
// src/server/clock.ts
export function today(): ISODate {
  if (process.env.ALLOW_TEST_HOOKS === '1' && process.env.APP_FAKE_TODAY) return process.env.APP_FAKE_TODAY
  return todayBangkok()
}
// e2e/fixtures.ts
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T09:00:00+07:00') })  // time flows; timers fire
})
```

### 4.10 Keys (X-01)
```ts
const CODE_DIGIT = /^(Digit|Numpad)([0-9])$/
export const isKey = (e: KeyboardEvent, code: string, key?: string) => e.code === code || (key != null && e.key.toLowerCase() === key)
export const typedDigit = (e: KeyboardEvent) => CODE_DIGIT.exec(e.code)?.[2] ?? (/^[0-9๐-๙]$/.test(e.key) ? e.key : null)
// usage: if (isKey(e, 'KeyF', 'f') && !editing) applyFull(); if ((e.metaKey || e.ctrlKey) && isKey(e, 'KeyZ', 'z')) …
```

### 4.11 Deployment fragments
```yaml
# docker/docker-compose.yml (fragments; M11-01/02/03/19)
name: planner                               # otherwise the project is called "docker" (M11-19)
services:
  db:
    image: postgres:17
    env_file: ../.env                      # POSTGRES_PASSWORD etc. — no ${} interpolation needed
    environment:
      POSTGRES_DB: planner
      POSTGRES_USER: planner
      TZ: Asia/Bangkok                      # X-03 (effective at first init)
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U planner -d planner"]
      interval: 5s
      retries: 30
    restart: unless-stopped
  caddy:
    image: caddy:2
    profiles: [tls]
    env_file: ../.env                      # SITE_ADDRESS, CADDY_TLS
    depends_on: [app]
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile:ro, caddy_data:/data]
```
```dockerfile
# runner stage fragment (M11-04)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs && mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
CMD ["node", "server.js"]
```
```caddyfile
# docker/Caddyfile (M11-06)
{$SITE_ADDRESS} {
  encode zstd gzip
  reverse_proxy app:3000
  # For an offline, non-.local hostname: use either `tls internal` or `tls /certs/cert.pem /certs/key.pem`
}
```
```sh
#!/bin/sh
# docker/backup.sh — prototype executed in postgres:17 (E18). Modes: `once` | default loop at BACKUP_AT (02:00, TZ from .env)
set -eu
: "${DATABASE_URL:?DATABASE_URL required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"; KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"; AT="${BACKUP_AT:-02:00}"
run_backup() {
  stamp=$(date +%Y%m%d)
  pg_dump -Fc --no-owner "$DATABASE_URL" -f "$BACKUP_DIR/db-$stamp.dump.tmp" && mv "$BACKUP_DIR/db-$stamp.dump.tmp" "$BACKUP_DIR/db-$stamp.dump"
  if [ -d /data/uploads ]; then tar czf "$BACKUP_DIR/uploads-$stamp.tgz.tmp" -C /data uploads && mv "$BACKUP_DIR/uploads-$stamp.tgz.tmp" "$BACKUP_DIR/uploads-$stamp.tgz"; fi
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tgz' \) -mtime +"$((KEEP_DAYS-1))" -delete
  echo "$(date -Iseconds) backup ok: db-$stamp.dump"
}
if [ "${1:-loop}" = "once" ]; then run_backup; exit 0; fi
[ -f "$BACKUP_DIR/db-$(date +%Y%m%d).dump" ] || run_backup || echo "initial backup failed; will retry at $AT"
while true; do
  now=$(date +%s); next=$(date -d "today $AT" +%s); [ "$next" -gt "$now" ] || next=$(date -d "tomorrow $AT" +%s)
  sleep $((next - now)); run_backup || echo "backup failed; will retry tomorrow"
done
```
Restore (README; E19):
```sh
docker compose --env-file .env -f docker/docker-compose.yml stop app
docker compose --env-file .env -f docker/docker-compose.yml run --rm --entrypoint sh backup -c \
  'pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /backups/db-YYYYMMDD.dump'
docker run --rm -v planner_uploads:/data/uploads -v planner_backups:/backups alpine \
  sh -c 'tar xzf /backups/uploads-YYYYMMDD.tgz -C /data'
docker compose --env-file .env -f docker/docker-compose.yml start app
```
Note: a plain `run backup` would start the backup loop. Override the entrypoint, or use `backup.sh once` for backups.

---

## 5. Tests to add, by milestone (on top of SPEC §11)

- **M6**
  - `distribute` exact ties (t=320, w=[40,25,67,60] → [67,42,111,100]).
  - Property: sum preserved.
  - Parse and round cases: "0.125"→25, "0.375"→50, "0.1"→0, ",5"→50, "๑.๕"→150, fraction 0.33 at cap 500 → 175.
  - `f`/`h` at cap 450 / 75 / 0.
  - Paste mapping: tiling, skipping read-only cells, truncation.
  - Shift at edges and across kinds.
  - Undo snapshot round-trip (AC-805 plus a reload).
  - VERSION_CONFLICT across two browser contexts.
  - Multi-assignment batch: all-or-nothing, and a 404 when any item is invisible.
  - Concurrency integration test: two parallel saves on the same assignment → one VERSION_CONFLICT; a WEEK and a DAY insert racing → constraint error.
  - Golden F1 on the grid API: POS 4625/2750 etc., `to=2027-01-04`.
  - AC-802 with a leave fixture; AC-803 via a synthetic paste `DataTransfer`.
  - BR-52 toast values, FR-406 X, AC-603 with plans, AC-203 label.
  - Masked leave label.
  - Contrast test over the token table.
- **M7**
  - AC-804: Ivy 250 → [50×5] → Wednesday = 100 → week 300.
  - SCALE [100,100,50] → 400 gives [100,100,100,100].
  - Spill for F2/F3/F4 (R5 §3.1 outputs).
  - NEEDS_CHOICE with several weeks and cancel behaviour.
  - BR-23 collapse and undo restoring the exact days.
  - Day-level overload (half-day leave + DAY 1.00 → OVER 50).
  - Client/server spread parity.
- **M8**
  - BR-70 at today ± 0, 7, 8.
  - BR-71's three conditions, including a WEEK row in the milestone's own week (no warning).
  - Same-project binding rejected across projects.
  - Soft delete → unbound → restore → bound again.
  - Me gets 403, W gets 404.
  - AC-701/702 with fake today.
- **M9**
  - F2/F3/F4 as service-level integration tests: exact overload lists, including excess and cause, and no other non-OK cells.
  - Masking: names **and** ids absent (Ivy→Mint, Ivy→Jack 404, Cindy→Jack all masked).
  - Badge counts per viewer (F2: manager 2, Ivy 1).
  - Filters.
  - FR-906 lists only weeks that got worse.
- **M10**
  - "ลูกค้า" finds "ย้ายข้อมูลลูกค้า" for Cindy and Ivy but not for Jack (not a CRM member).
  - `_`/`%` escaping.
  - Queries of 2 characters or fewer skip content search.
  - The palette's first result in < 200 ms.
  - Cmd+K inside the editor with a selection opens the link popover, not the palette.
- **M11**
  - `m11-deploy.spec.ts` against compose.
  - A backup file exists after start.
  - Restore rehearsal script.
  - The perf script meets its thresholds on `seed:perf`.
  - A 24 MB upload succeeds.

---

## 6. Decisions and Deviations to pre-register in `PROGRESS.md`

| Ref | Kind | Text (short) |
|---|---|---|
| X-05 | Deviation | UI kit MUI + `@blocknote/mantine`; cmdk headless in MUI Dialog (SPEC §7.1 says Tailwind/shadcn) |
| X-04 | Deviation | Next 16 `updateTag(tag)` / `revalidateTag(tag,'max')` instead of 1-arg `revalidateTag` |
| M11-01/02/03/08/19 | Deviation | Compose: `name: planner`; env_file instead of interpolation; TCP healthcheck; restore flags `--clean --if-exists --no-owner` |
| M6-21 | Deviation | Token colours adjusted for 4.5:1 (`#8F5C00`), faded = colour token not opacity |
| M6-12 | Decision | Custom drizzle migrations (`--custom`) for extensions (M1), time_off exclusion (M5), allocations trigger + exclusion (M6) |
| M6-10/11 | Decision | Batch `saveAllocations({items})`, sorted `FOR UPDATE` lock + version bump for every allocation writer; exclusion constraint added |
| M6-15/16 | Decision | PeriodKey `W:`/`D:`; aggregates `{total, committed}`; `project` row kind for person grid |
| M6-02/03/04/05/06 | Decision | clamp-and-spill; integer distribute; fraction base = cell capacity; exact parse + single 25-cd rounding; f exact / h rounded |
| M6-01 | Decision | DAY weeks read-only in M6 |
| M6-13 | Decision | Undo = week snapshots; serialized save scope; latest version at execution |
| M6-14 | Decision | Client-side merge of single-assignee rows; all-time `rowTotal` query as a `week_start`-rule exception |
| M6-22 | Decision | BR-25 "whole week" = all scheduled days covered; boundary replacement only inside range; N=0 clears |
| M7-03 | Decision | NEEDS_CHOICE `weeks[]`, one dialog for all |
| M7-06 | Decision | `overload.ts` (BR-40/45) moved to M7 |
| M8-02/05 | Decision | Soft-delete milestones keep binding; BR-71 bounded query exception |
| M9-01/02/05/06/07 | Decision | Colour by view + glyph for level; excess definition; population; windows include current week; client-refreshed badge |
| M10-01/04/05/07/08/09 | Decision | Search strategy; category visibility; quick commands; home details; leave lines; no quick-add card |
| X-02/X-03/X-09/X-13 | Decision | Fake clock hooks; no DB dates; reset from Playwright; landing `/my` until M10 |
| M11-13 | Decision | seed:demo adds a first child to receive Rollout's assignment |

---

## 7. Housekeeping

- The container `r6b-pg17-verify` has been running for about 3 h. It was not created in this session and looks like an earlier, interrupted R6b attempt. Remove it if no agent needs it. All `r6b2-*` resources from this session were removed.
- `PLAN.md` §0.2 says the MUI decision is "already reflected in SPEC §7.1". It is not (X-05).
