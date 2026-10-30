# R6a — Gaps before implementation, M0–M5

Cross-milestone dependencies, ambiguities, missing details, spec inconsistencies and risks

| | |
|---|---|
| Written | 2026-09-30 (research agent r6a; read-only on the project folder) |
| Inputs read | `SPEC.md` (all of it, v3.0), `CLAUDE.md`, `PROGRESS.md`, `tech-stack.md`, `docs/README.md`, `docs/history/decisions-log.md`, `docs/reference/golden-fixtures.json` (parsed in full), plus a skim of the draft `PLAN.md` to keep names consistent (`src/server/clock.ts`, `APP_FAKE_TODAY`, `authz.requireProject(tx,user,id,need)`, error classes) |
| Owner decisions assumed | Next.js full-stack stack as in SPEC §7.1. UI kit is **MUI**, not Tailwind + shadcn. The editor uses **BlockNote with `@blocknote/mantine`**. Files live on a **local disk volume** (`UPLOAD_DIR`). |
| Scratch evidence | `scratchpad/r6a/` holds an npm install of the real packages (next 16.3.7, better-auth 1.7.6, drizzle-orm 0.45.3, drizzle-kit 0.31.11, @blocknote/* 0.55.0, @mantine/core 9.6.3, @mui/material 9.4.0, @mui/material-nextjs 9.4.0, @mui/x-date-pickers 9.14.0, zod 4.6.5, file-type 22.1.1, fractional-indexing 4.0.0, postgres 3.4.9, cmdk 1.1.1, sonner 2.0.8, dayjs 1.11.23) and a create-next-app 16.3.7 scaffold. Also used: `scratchpad/r6a/dz/` (drizzle-kit generate experiment), `scratchpad/r6a/ft/` (file-type, zod, encoding and fractional-indexing scripts), `scratchpad/research/r6a-t1.sql` and `r6a-t2.sql` (PostgreSQL 17.11 experiments; the container was removed afterwards). |

**Status labels.** **[verified]** means I saw it in installed package source or `.d.ts`, in official docs, or I ran it. **[likely]** means a strong inference that I did not run. **[uncertain]** means it needs a check during implementation.

**How to read the items.** Every item has an ID (`X-nn` for cross-cutting items, `M<k>-nn` for one milestone, `F-nn` for forward notes), a *kind*, SPEC refs, the problem, a proposed decision, the rationale, and evidence where there is any. Each decision is the **simplest choice consistent with SPEC §1.3 (P1–P7) and CLAUDE.md**. Record the non-obvious ones in `PROGRESS.md › Decisions`; §4 has rows ready to paste.

---

## 0. TL;DR: the 25 things plan writers must not miss

1. **`next dev` rewrites `CLAUDE.md`.** When Next 16.3.7 detects an AI agent and no `AGENTS.md` exists, it appends a managed block to an existing `CLAUDE.md`. Set `agentRules: false` in `next.config.ts` **before the first `pnpm dev`**, scaffold with `--no-agents-md`, and never copy the scaffold's `CLAUDE.md` or `AGENTS.md`. (M0-01, [verified])
2. **Fractional keys sort wrongly under the default collation.** PostgreSQL 17 in the Docker image uses `en_US.utf8`, which puts `'Zz'` (the key before `'a0'`) *after* `'a0'`. Declare every `position` column as `text collate "C"`; a Drizzle `customType` does this and is verified. On the client, sort with `<`, never `localeCompare`. (X-08, [verified])
3. **`fractional-indexing` throws on equal keys.** Two concurrent inserts can create duplicate keys, and after that "insert between" throws. Serialize sibling writes per parent scope with an advisory lock and add `id` as an ORDER BY tiebreaker. (X-09, [verified])
4. **Custom SQL must be a journaled migration.** A hand-placed `drizzle/9999_triggers.sql` is **ignored** by the Drizzle migrator. Use `drizzle-kit generate --custom --name=…`. The **first** migration must create the extensions (`pg_trgm`, `btree_gist`), because M3's trigram index and M5's exclusion constraint need them. Never run `drizzle-kit push`. (X-10, [verified])
5. **Better Auth's built-in rate limiter cannot implement FR-106.** It counts every request per IP+path (not failures, not per email), allows only 3 sign-in requests per 10 s by default, is on only when `NODE_ENV=production`, and falls back to **one shared bucket** when it can't resolve an IP. Build a custom lockout table plus hooks, tune the built-in limiter, and log in once per role in e2e. (M1-06, X-13, [verified])
6. **`/api/auth/update-user` lets any user change their own `name` and every additional field that isn't `input:false`.** Set `input:false` everywhere and add `disabledPaths` for every endpoint the UI doesn't use (including `/change-password` and `/admin/*`). (M1-04, [verified])
7. **Cookie `Secure` defaults to on in production** unless `BETTER_AUTH_URL` is http or `useSecureCookies` is set explicitly. Pass `advanced.useSecureCookies = SECURE_COOKIES` explicitly, or LAN HTTP deployments cannot log in. (X-13, [verified])
8. **Sessions never refresh from RSC renders.** With `nextCookies()`, a `getSession` call during an RSC render skips refresh. Add a client `SessionKeepAlive`, or FR-103 ("renews automatically while in use") fails for users who only navigate pages. (M1-20, [verified])
9. **Deactivate, reset password and create employee are multi-table writes.** Do them as one Drizzle transaction using `better-auth/crypto` `hashPassword`, and delete sessions directly. Admin `setUserPassword` does **not** revoke sessions. `createUser` doesn't enforce the minimum length and can't join our transaction. (M1-05, [verified])
10. **`dates.ts`, the `units.ts` conversions and the client undo provider are needed before the milestones SPEC lists them in.** Pull them into M1. Pull `certainty.ts` into M3. (X-02…X-05)
11. **Test "today" must be pinned.** The golden data covers Aug–Dec 2026. Use `serverToday()` with `APP_FAKE_TODAY`, have the client get "today" from the server, and pin the clock in Playwright. (X-01)
12. **Proxy buffering truncates large uploads.** With a `proxy.ts`, request bodies over 10 MB are **silently truncated**, and attachments can be 25 MB. Exclude `/api/files` from the proxy matcher and raise `experimental.proxyClientMaxBodySize`. Check that the received size equals `Content-Length`. (X-16, [verified])
13. **Plain-HTTP LAN has no secure context.** `navigator.clipboard.writeText` and `crypto.randomUUID()` don't exist there, which breaks the FR-202 copy button. Use fallbacks. None of our libraries call `randomUUID`. (X-12, [verified])
14. **Seed memberships in M2, not M3.** Every task assignee in `golden-fixtures.json` becomes a MEMBER, so M2 must seed those memberships even though tasks arrive in M3; otherwise the M2 visibility e2e is meaningless. The derived table is in §7. (X-06)
15. **FR-303 client load, FR-406's "X person-days", BR-52's "X days", AC-603's "with original plans" and FR-610's "and plans" all depend on allocations (M6).** The earlier milestone ships without the number, and the later one adds it. FR-610 needs **no** allocation code: re-point `task_assignments.task_id` and the allocations follow. (§2 matrix)
16. **FR-404 needs `task_assignments` (M3).** Member removal ships in M2 without the check; M3 adds the two-option toast.
17. **FR-402 charter creation arrives in M4, but projects already exist in dev databases from M2–M3.** Add an idempotent `ensureProjectCharters()` backfill. (M4-01)
18. **The Cmd+K palette first appears in M4** (pages only), with an extensible search response. M10 completes it. (M4-02)
19. **Page edit lease: the version is the integrity guard; the lease only coordinates the UI.** The displaced editor's flush is accepted if its version matches, and then FR-543 handles the rare conflict. `pages.locked` (FR-510) and `page_locks` (FR-540) need different names in code. (M4-03/04)
20. **BlockNote 0.55 gaps:** no Thai locale, table headers and cell colours **off** by default, an "Embed URL" tab that must be removed, and `prioritizeMarkdownOverHTML` defaults to `true`. Excel can put an image *and* an HTML table on the clipboard, so prefer the table. (M4-14…17)
21. **`file-type` reality:** legacy Office files detect as `cfb`, OOXML sometimes as `zip`, csv/txt/svg as `undefined` or `xml`. The allow-list must combine the detected type with the client extension. (M4-12, [verified])
22. **The DDL rejects half-day AM plus half-day PM on the same day** (exclusion constraint). Keep that and show a clear message. Undoing a leave deletion can hit SQLSTATE `23P01` and must map to a friendly error. (M5-05, M5-15, [verified])
23. **Holiday CSV files from Thai Excel are often Windows-874.** Decode UTF-8 in fatal mode, then fall back to `windows-874` (works on Node 26 and on `node:22-alpine`). Accept ISO dates only. (M5-10, [verified])
24. **BR-10's sample code omits BR-13** (capacity is 0 from the deactivation date), and the calendar in M5 is the **first consumer of masking** (`"ลา"` labels). Masking leak tests start in M5, not M9. (M5-04, M5-09)
25. **Archived projects should be read-only** (only unarchive and delete allowed), and §3.3 "LEAD of ≥1 project" / "shares a project" should count **non-archived** projects only. Otherwise edits to archived projects silently don't count (BR-44 vs P4). (X-19, X-18)

---

## 1. Evidence log

| ID | What | Source / command | Status |
|---|---|---|---|
| E-01 | create-next-app 16.3.7 scaffolds `CLAUDE.md` (content `@AGENTS.md`) and `AGENTS.md` (managed block) | `scratchpad/r6a/scaffold-test/{CLAUDE.md,AGENTS.md}` | verified |
| E-02 | `next dev` auto-writes the agent-rules block: `start-server.js` (≈L416-430) → `ensureAgentRulesForDev` (`app-info-log.js` L125-129; gated by `@vercel/detect-agent`) → `writeAgentFiles` (`generate-agent-files.js`). If `AGENTS.md` is absent and `CLAUDE.md` exists, it **upserts into `CLAUDE.md`**. Opt-out: `agentRules?: boolean` in `NextConfig` (`config-shared.d.ts` L1574, schema `config-schema.js` L496). Log text: "Set `agentRules: false` in next.config to disable." | `node_modules/next/dist/server/lib/*` | verified |
| E-03 | create-next-app flags `--no-agents-md`, `--no-tailwind`, `--no-react-compiler`, `--no-src-dir`, `--no-eslint`, `--no-linter`, `--disable-git`, `--skip-install`, `--use-pnpm`, `--yes`. The scaffold `.gitignore` contains `.env*` (so it would ignore `.env.example`) and `next-env.d.ts`. The scaffold pins `react 19.2.8`, `eslint ^9`, `eslint-config-next 16.3.7`, `@types/node ^20`. | `npx create-next-app@16.3.7 --help`; grep of `~/.npm/_npx/*/node_modules/create-next-app/dist/index.js`; scaffold files | verified |
| E-04 | pnpm `latest` = 12.8.1 and the newest 10.x = 10.34.6. `node:22-alpine` = v22.23.3 with corepack 0.36.0. Local Node is v26.5.0 without corepack. | `npm view pnpm dist-tags`; `docker run node:22-alpine corepack --version` | verified |
| E-05 | Better Auth cookie `secure`/`__Secure-` = `useSecureCookies ?? (baseURL starts with https) ?? isProduction`. `sameSite: 'lax'`, `httpOnly: true`. `getSessionCookie()` reads either the `__Secure-` or the plain name. | `better-auth/dist/cookies/index.mjs` L20-45, L261-270 | verified |
| E-06 | BA rate limiter: `enabled: options.rateLimit?.enabled ?? isProduction`; defaults window 10 s / max 100; memory storage. Special rule for `/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*`: **3 per 10 s**. Key is `${ip ?? 'no-trusted-ip'}\|${path}`. Every request is consumed in the request phase. `getIP` reads `x-forwarded-for`, trusts only a single value unless `trustedProxies` is set, falls back to 127.0.0.1 in dev/test, and returns **null** in production. Next's base server sets `req.headers['x-forwarded-for'] ??= socket.remoteAddress`. | `better-auth/dist/context/create-context.mjs` L170-175; `api/rate-limiter/index.mjs` L233-316; `@better-auth/core/dist/utils/ip.mjs` L174-230; `next/dist/server/base-server.js` L612 | verified |
| E-07 | BA session defaults: `expiresIn` 7 d, `updateAge` 1 d, `freshAge` 1 d; `minPasswordLength` 8; cookie cache off unless enabled. Under `nextCookies()`, a get-session call in an RSC request (`RSC: 1` without `next-action`) sets skip-refresh. The plugin warns if it isn't last. | `create-context.mjs` L146-149, L186; `integrations/next-js.mjs` L40-68 | verified |
| E-08 | `/update-user` accepts `name`, `image` and additional fields unless `input: false`. `parseInputData` throws only for `input:false` fields. Core endpoints include `/sign-up/email`, `/update-user`, `/change-password`, `/change-email`, `/delete-user`, `/revoke-sessions`, `/revoke-other-sessions`, `/list-sessions`, `/request-password-reset`, `/reset-password`, `/update-session`, `/verify-password`, … Option `disabledPaths?: string[]`. Hooks `hooks.before/after: AuthMiddleware`; `ctx.context.returned?: unknown`. | `api/routes/update-user.mjs` L50-60; `db/schema.mjs` L59-77; `@better-auth/core/dist/types/init-options.d.mts` L1513-1528; `@better-auth/core/dist/api/index.d.mts` L161 | verified |
| E-09 | Admin plugin: `defaultRole` default `'user'`, `adminRoles` default `['admin']`. `adminRoles` must be keys of `roles`, otherwise init throws `Invalid admin roles`. `session.create.before` throws FORBIDDEN code `BANNED_USER` with `bannedUserMessage`. Fields `role`, `banned`, `banReason`, `banExpires` on user and `impersonatedBy` on session, all `input:false`. `banUser` updates the user **and deletes all its sessions**, and refuses self-ban. `setUserPassword` does **not** revoke sessions. `createUser` works without a session when called server-side without headers, lowercases the email, checks only the **maximum** password length, and runs outside our transaction. | `better-auth/dist/plugins/admin/{admin,routes,schema}.mjs` | verified |
| E-10 | `better-auth/crypto` exports `hashPassword`, `verifyPassword` (node:crypto scrypt) and `generateRandomString`. Default ids are 32 characters `[a-zA-Z0-9]`. Sign-in lowercases the email. The Drizzle adapter resolves columns as `schemaModel[field]` using **Better Auth field names** (camelCase keys). | `better-auth/dist/crypto/*`; `@better-auth/core/dist/utils/id.mjs`; `api/routes/sign-in.mjs` L317; `@better-auth/drizzle-adapter/dist/index.mjs` L122-126 | verified |
| E-11 | Next 16.3.7 has `revalidateTag(tag, profile)` (two args), `updateTag(tag)`, `refresh()` and `revalidatePath(path, type?)`. Middleware is renamed **Proxy** (`proxy.ts`) and uses the Node runtime by default. `experimental.proxyClientMaxBodySize` defaults to 10 MB: bodies are **truncated silently**, the request is not failed. `experimental.serverActions.{bodySizeLimit, allowedOrigins}`. | `next/dist/server/web/spec-extension/revalidate.d.ts`; `next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` L255, L806; `…/05-config/01-next-config-js/proxyClientMaxBodySize.md`; `config-shared.d.ts` L925-936, L1126-1137 | verified |
| E-12 | The drizzle `postgres-js` driver installs transparent parsers for type OIDs 1082/1083/1114/1184/… so dates and timestamps arrive as strings. The migrator applies only tags listed in `meta/_journal.json`. `drizzle-kit generate --custom --name=x` creates a journaled empty SQL file. A customType `text collate "C"` is emitted verbatim and doesn't cause spurious diffs on regenerate. `generatedAlwaysAs`, `index().using('gin', col.op('gin_trgm_ops'))` and partial `uniqueIndex().where()` all work. The generated SQL does **not** create extensions. | `drizzle-orm/postgres-js/driver.js` L17-22; `drizzle-orm/migrator.js` L3-22; `scratchpad/r6a/dz/out/*` | verified |
| E-13 | PostgreSQL 17.11 (`postgres:17`, `datcollate` en_US.utf8, provider libc). **Default ORDER BY** gives `a0 A0 a0G a0V a1 b00 Zy Zz`; **COLLATE "C"** gives `A0 Zy Zz a0 a0G a0V a1 b00`. `ILIKE '%ลูกค้า%'` uses the GIN trigram index (Bitmap Index Scan) and returns correct rows; a 2-character pattern falls back to a Seq Scan with correct rows. `similarity('ย้ายข้อมูลลูกค้า','ลูกค้า')=0.278`, `word_similarity=0.714`. The exclusion constraint rejects AM plus PM on the same day. Un-deleting an overlapping soft-deleted row raises an exclusion violation (SQLSTATE 23P01). `completed_week` for Sunday 2026-10-04 is 2026-09-28 (Monday) and for 2027-01-01 is 2026-12-28. | `scratchpad/research/r6a-t1.sql` | verified |
| E-14 | fractional-indexing 4.0.0: `generateKeyBetween(null,'a0')` = `'Zz'`; JS default sort is correct, `localeCompare` is wrong; **equal keys throw** (`" >= "`); reversed arguments are swapped silently. | `scratchpad/r6a/ft/fi.mjs`; `fractional-indexing/src/index.js` L435-512 | verified |
| E-15 | file-type 22.1.1 results: png → png; pdf → pdf; legacy `.doc` → **`cfb`**; OOXML with proper `[Content_Types].xml` → docx/xlsx/pptx, otherwise **`zip`**; zip → zip; csv/txt/html → **undefined**; SVG with an XML declaration → **`xml`**, without one → undefined. | `scratchpad/r6a/ft/test.mjs` | verified |
| E-16 | Zod 4.6.5 has `z.locales.th()`, which gives Thai messages that still embed English type names (e.g. "…: string ควรมีอย่างน้อย 1 ตัวอักษร"). `z.uuid()` rejects a Better-Auth-style 32-character id. `z.string().uuid()` still exists. | `scratchpad/r6a/ft/zod.mjs` | verified |
| E-17 | `TextDecoder('windows-874' \| 'tis-620' \| 'iso-8859-11')` works on Node 26.5 **and** `node:22-alpine` 22.23.3 (ICU 78.3). A UTF-8 BOM is stripped. `Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'UTC'})` gives **"30 ก.ย. 2569"**. `todayBangkok` at 2026-09-29T23:30Z gives 2026-09-30. | `scratchpad/r6a/ft/enc.mjs` + docker run | verified |
| E-18 | `@mui/material-nextjs` exports `./v16-appRouter`. `@mui/x-date-pickers` 9.14.0 is **MIT** and has `AdapterDayjsBuddhist` (B.E. years). The community package has **no** range picker (that is Pro). | `node_modules/@mui/*` | verified |
| E-19 | BlockNote 0.55.0 (MPL-2.0). `@blocknote/mantine` peers are `@mantine/core ^8.3.11 \|\| ^9.0.2` and React 18/19; the yjs peers are optional. Locales are `ar,de,en,es,fa,fr,he,hr,is,it,ja,ko,nl,no,pl,pt,ru,sk,uk,uz,vi,zh,zhTW`, **no `th`**. Emoji data is `import('@emoji-mart/data')` (bundled, no CDN). Editor options: `tables.{headers,cellBackgroundColor,cellTextColor,splitCells}` all **default false**; `pasteHandler` exposes `defaultPasteHandler({ prioritizeMarkdownOverHTML=true, plainTextAsMarkdown=true })`; `uploadFile(file) => Promise<string \| props>`; `dictionary`; `tabBehavior`. Keymaps are `Mod-z`, `Mod-y` and `Shift-Mod-z`, with **no `Mod-k`** in BlockNote or tiptap dist. React exports include `FilePanel`, `FilePanelController`, `UploadTab`, `EmbedTab`, `getDefaultReactSlashMenuItems`, plus default-UI flags (`filePanel`, `slashMenu`, …). | `node_modules/@blocknote/*` | verified |
| E-20 | `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0 (Dec 2024, peer `react >=16.8`) versus `@dnd-kit/react` 0.5.0 (Sep 2026, pre-1.0) | `npm view` | verified |
| E-21 | `Crypto.randomUUID()` and `Clipboard.writeText()` are **secure-context only** (MDN). No `randomUUID` in the dist of BlockNote, tiptap, sonner, cmdk or MUI. | MDN pages; grep | verified |
| E-22 | Page-lease upsert: `ON CONFLICT (page_id) DO UPDATE … WHERE page_locks.user_id = excluded.user_id OR page_locks.expires_at < now()` returns 0 rows when the page is held by someone else, and 1 row for acquire, heartbeat or expired-steal. The unconditional upsert implements takeover. | `scratchpad/research/r6a-t2.sql` | verified |
| E-23 | `node --env-file-if-exists=.env` works on Node 26.5 and 22.23.3. **Vitest 5.0.2 exits with code 1 when no test files exist.** | `scratchpad/r6a/ft` | verified |
| E-24 | `@fontsource/ibm-plex-sans-thai`, `@fontsource/noto-sans-thai` and `@fontsource-variable/noto-sans-thai` are all 5.3.0 under OFL-1.1 | `npm view` | verified |
| E-25 | Golden JSON facts. Memberships are implied by the assignees (§7). The week `2026-12-28` is included in F1 totals (for example, POS total 4625 cd includes Mint 12-28 = 250). F2, F3 and F4 are each **F1 plus their own setup**, not cumulative. The manager has a schedule but no tasks. User `name` equals `nickname` except for the manager ("Demo Manager"/"Manager"). | parsed `golden-fixtures.json` | verified |

---

## 2. Cross-milestone dependency matrix

| Requirement | SPEC places it in | What it needs, and from where | Where each part lands (proposed) | Interim behaviour in the earlier milestone | Test that closes it |
|---|---|---|---|---|---|
| FR-303 client 12-week load | M2 (§4.3) | allocations (M6) + load query/masking (M9) | **M9** (with the FR-409 and FR-906 load parts) | Client page shows its visible projects and no load figure (not "0") | M9 integration + e2e client page |
| FR-406 "จะปลดภาระ X วัน-คน" | M2 (§4.4) | allocations (M6) | **M6** adds X to the archive toast | M2: archive immediately + toast "archive แล้ว · เลิกทำ" | M6 integration (archive a project with future allocations → X) |
| FR-404 open-assignment check | M2 | `task_assignments` (M3) | **M3** | M2: direct removal + undo | `m3-tasks` e2e |
| FR-405 instant numbers update | M2 | grid (M6), workload (M9) | M2 defines `invalidateLoad()` and query keys; M6 and M9 register | Nothing to update yet | M6 e2e: toggle certainty → committed view changes without reload |
| FR-408 tabs | M2 | tasks (M3), pages (M4), plan (M6) | Tab config; each milestone adds its tab | Only built tabs are shown (no disabled stubs) | Each milestone's e2e |
| FR-409 overview parts | M2 (load → M9 per §12) | progress (M3), milestones (M8), loads (M9) | M2 info+members · M3 progress · M8 upcoming ◆ · M9 member load + 12-week bars | Partial overview | M9 |
| FR-402 charter on create | M4 (explicit) | pages | M4 + idempotent **backfill** for projects created in M2–M3 | None | `m4-pages` |
| AC-203 deactivated in picker + grid label | M1 | assignee picker (M3), member picker (M2), grid (M6) | M1 login/sessions/service filter · M2 member picker · M3 assignee picker · **M6** grid label | M1 integration test of `listAssignableUsers()` | M6 e2e |
| AC-603 "พร้อมแผนเดิม" | M3 | allocations (M6) | M3 tasks+assignments · **M6** allocations | Restore brings tasks+assignments back | M6 integration/e2e |
| FR-610 "ย้ายผู้รับผิดชอบและแผน" | M3 | allocations (M6) | M3 re-points `task_assignments.task_id`, so allocations follow automatically | No allocations yet | M6 test: add a subtask to a planned task → plan now under the child |
| BR-52 toast "ปลดภาระ X วัน ในอีก N สัปดาห์" | M3 (via FR-607) | allocations | **M6** | "ติ๊กเสร็จแล้ว · เลิกทำ" | M6 |
| FR-601 milestone field, FR-613 group-by-milestone, FR-614 bulk "ผูก milestone" | M3 | milestones (M8), `tasks.milestone_id` | **M8** (migration adds the table and column) | Field and group option omitted | `m8` e2e |
| FR-613 group by certainty, FR-601 override, BR-36 label | M3 | `certainty.ts` (listed in M6) | **Pull `certainty.ts` into M3** | — | M3 unit |
| FR-612 "วางแผน N วัน" | §4.6 | — | M6 (explicit in §12) | — | M6 |
| `/my` (FR-1009) | §4.10 → M9; "เบื้องต้น" in M3 | allocations | M3 basic (grouped by project) → **M9** buckets | — | M9 |
| `dates.ts` | M5 | M1 (`deactivated_on`), M3 (`completed_on`, "this week") | **Pull into M1** | — | M1 unit (§11.1 dates cases) |
| `units.ts` numeric↔cd | M6 | M1 (`work_schedules.fraction`), M5 (capacity) | **Subset in M1**; display/parse in M6 | — | M1 unit |
| Undo stack + toast + Cmd+Z | M3 (§7.5) | M1 (position delete), M2 (archive, member removal) | **Client provider in M1**; `deleted_batch` restore pattern in M3 | — | M3 e2e (AC-603 + Cmd+Z) |
| Audit log | FR-1201; M11 "(ถ้ายังไม่ครบ)" | from M1 (employees) | M1 infra; each milestone logs its entities | — | Per-milestone integration assertions |
| Bootstrap leave types | §10.4 (bootstrap in M1) | `leave_types` table (M5) | **M5** extends bootstrap | M1 bootstrap: manager + positions | M5 |
| `seed:golden` | §11.3 (M6/M9) | per table | Grows M1→M6 (§7); M4 adds charters | — | Each milestone |
| Cmd+K palette | M4 (pages), M10 (all) | — | M4 shell + `/api/search` (pages) | — | M10 |
| §3.3 visible people | M9 masking | M5 calendar | M2 `visibleUserIds`; **M5 first consumer** | — | M5 masking leak test |
| FR-906 overload part | M5 (split explicitly) | overload.ts (M9) | M9 | Capacity before/after per week | M9 |
| FR-907/FR-705 milestones on calendar | M5 / M8 | milestones | M8 | Calendar shows leave + holidays | M8 |
| Permanent project delete removes files | M2 (FR-407) | `files` (M4) | M4 extends the delete service to unlink files after commit | DB cascade only | M4 integration |
| Sidebar entries | M0 placeholder | per milestone | Data-driven nav config | No dead links | — |
| `m0` smoke vs auth | M0 | login (M1) | M1 updates `e2e/m0-smoke.spec.ts` to use `storageState` | — | All later milestones |
| `pg_trgm` indexes on projects/clients/users | §6.4 (M10) | — | M10 | Small tables use plain ILIKE | M10 |
| `user_preferences` | M6 (unit), M3 (showCompleted), M4 (sidebar) | table | **Table + action in M1** | — | — |
| `?` shortcut dialog, `N` new task | §8.6 (not assigned) | — | M3 creates the data-driven dialog; later milestones append | — | M3 |

---

## 3. Items by milestone

### 3.0 Cross-cutting (decide once, before M1 starts)

**X-01 · risk · BR-06, §11.4, FR-1009, FR-906, FR-406, BR-52, BR-70 · introduced M1 → all**
- *Problem:* The golden data covers Aug–Dec 2026, and many features are relative to "today": this/next week, 12 weeks ahead, future load, `deactivated_on`, `completed_on`, the default calendar month. Tests run on other dates will drift. Hydration also breaks if the client computes "today" differently from the server.
- *Decision:* `src/server/clock.ts` `serverToday()` returns `todayBangkok()` unless `APP_FAKE_TODAY` is set and (`NODE_ENV!=='production'` or `E2E==='1'`). Domain functions take `today` as a parameter and never read the clock. `(app)/layout.tsx` passes `today` into a React `TodayProvider`, and client code never calls `new Date()` for plan dates. Playwright runs with `APP_FAKE_TODAY=2026-09-30` and `page.clock.setFixedTime('2026-09-30T03:00:00Z')` for timers and relative-time labels.
- *Rationale:* Deterministic tests, and BR-06 has a single source.

**X-02 · cross-milestone-dependency · §12 M5 (dates.ts), FR-205/BR-13, `tasks.completed_on` (BR-50), FR-1009 · M1**
- *Problem:* M1 sets `deactivated_on` to today, and M3 sets `completed_on` to today (Bangkok) and computes "this week". `dates.ts` is scheduled for M5, and CLAUDE.md forbids ad-hoc `Date`.
- *Decision:* Implement all of `src/domain/dates.ts` (SPEC §5.1 API plus `isISODate`, `compareISO`, `diffDays`, `addWeeks`, `eachDay`) **test-first in M1**. Use integer epoch-day arithmetic (days-from-civil); only `todayBangkok(now)` touches `Date`, through `Intl` with `timeZone:'Asia/Bangkok'` (E-17). M5 adds only `capacity.ts`. Record in Decisions.
- *Rationale:* A small pure module that removes a whole class of timezone bugs early.

**X-03 · cross-milestone-dependency · BR-02, FR-207, §5.2, §12 M6 (units.ts) · M1**
- *Problem:* `work_schedules.fraction numeric(3,2)` in M1 and capacity in M5 need numeric↔cd conversion, but `units.ts` is scheduled for M6.
- *Decision:* M1 creates `src/domain/units.ts` with `numericToCd('1.25') → 125` using **string parsing** (no float) and `cdToNumeric(125) → '1.25'`, with tests. M6 adds `formatCd`, `parseCellInput`, `roundToQuarterCd` and fraction mode.
- *Rationale:* BR-01/02 apply from the first numeric column.

**X-04 · cross-milestone-dependency · FR-601, BR-35/36, FR-613, §12 M6 (certainty.ts) · M3**
- *Problem:* The M3 task panel shows the override plus its source label (BR-36), and the list can group by certainty (FR-613). Both need effective certainty, which is scheduled for M6.
- *Decision:* Build `src/domain/certainty.ts` (`effectiveCertainty`, `certaintySource`) test-first in M3. M6 adds a parity test between the SQL `coalesce(t, p1, p2, project)` in §6.5 and the domain function.
- *Rationale:* Pure and tiny; avoids duplicating logic in UI code.

**X-05 · cross-milestone-dependency · §7.5, P2, CLAUDE UX rule, FR-406, FR-404/BR-61, FR-208 · M1 (client), M3 (server batch restore)**
- *Problem:* Reversible deletions and changes exist before M3: position delete in M1, archive and member removal in M2. CLAUDE forbids confirm dialogs for recoverable operations and requires a toast with "เลิกทำ" for 8 s plus Cmd+Z.
- *Decision:* M1 builds `UndoProvider`: a per-tab stack of 50 `{label, undo(), redo()}`, a sonner toast with action and `duration: 8000`, and a global Cmd/Ctrl+Z / Shift+Z handler (see X-22). M2 uses it for archive and member removal. M3 adds the server-side `deleted_batch` restore pattern (`restore*({batch})` re-checks authz and the 30-day window). The `m3` e2e covers Cmd+Z.
- *Rationale:* One mechanism from the first reversible action; no confirm dialogs.

**X-06 · cross-milestone-dependency · §11.3, §11.4, App. A.1, CLAUDE (seed-golden reads JSON) · M1→M6**
- *Problem:* SPEC says e2e runs on a DB seeded with `seed:golden`, but that data spans tables introduced in M1…M6. The M2 visibility e2e needs memberships that come from task assignees (M3 data).
- *Decision:* `scripts/seed-golden.ts` (refuses `NODE_ENV=production`, truncates app tables first, reads the JSON and never re-types it) grows as follows:
  - M1: positions, users (password hashed **once**, `must_change_password=false`), schedules.
  - M2: clients, projects, LEAD rows, **and MEMBER rows derived from the task assignees in the JSON** (§7).
  - M3: tasks in JSON order (fractional positions), assignments, the `certaintyOverride`.
  - M4: charters for every project (through the project service path or `ensureProjectCharters()`).
  - M5: nothing by default; `--fixture=F2|F3|F4` adds that fixture's holidays or leave (F-02).
  - M6: WEEK allocations.
- *Rationale:* Each milestone's e2e has realistic data, and the membership rule (BR-60 invariant) holds from M2.

**X-07 · ambiguity · §3.4, §11.2 (allow / 404 / forbidden), CLAUDE (404 not 403) · M1**
- *Problem:* When should the app answer 403 and when 404?
- *Decision:*
  - Resource **not visible** → 404 `NOT_FOUND`.
  - Visible but action not permitted (e.g. MEMBER renaming a project) → 403 `FORBIDDEN`.
  - Global manager-only **actions** (employees, positions, holidays, leave types, client CRUD, project create) → `FORBIDDEN` for workers. Manager-only **pages** (`/settings/*`) call `notFound()` for workers.
  - Unauthenticated → 401 for route handlers, `UNAUTHENTICATED` for actions, redirect to `/login` for pages.
  - `must_change_password` → 403 `MUST_CHANGE_PASSWORD` for routes and actions, redirect for pages.
- *Rationale:* Matches the three outcomes of §11.2 and the draft PLAN error table.

**X-08 · risk · §6.1 fractional index; `positions/leave_types/pages/tasks.position` · M1 (first use)**
- *Problem:* Under `en_US.utf8`, fractional keys sort case-insensitively, so inserting "before first" produces `'Zz'`, which sorts **after** `'a0'` (E-13, E-14).
- *Decision:* In `schema.ts`: `const fracKey = customType<{data:string}>({ dataType: () => 'text collate "C"' })` for every `position` column (verified output `"position" text collate "C"`, stable, E-12). On the client, compare keys with `a < b`, never `localeCompare`. Tests: unit (before-first ordering) and integration (`ORDER BY position` after before-first inserts).
- *Rationale:* A one-line schema fix instead of remembering `COLLATE` in every query.

**X-09 · risk · §6.1, FR-208, FR-503, FR-604 · M1/M3/M4**
- *Problem:* `generateKeyBetween(a,b)` **throws when a === b** (E-14). Two users inserting at the same spot concurrently get identical keys; later "insert between" throws and ordering becomes nondeterministic.
- *Decision:* Services that compute positions take `pg_advisory_xact_lock(hashtext('<table>:' || scope))`, where scope is the parent id, `project:<id>` for task roots, or `space:<space>:<project>` for page roots. The lock is held inside the write transaction, so sibling key generation is serialized. Every ORDER BY adds `, id` as a tiebreaker. If equal neighbours are ever found, re-key the siblings with `generateNKeysBetween` in the same transaction.
- *Rationale:* Cheap, deterministic, and keeps the library's invariant.

**X-10 · risk / spec-inconsistency · §6.1, §6.3, CLAUDE DB rule ("drizzle/9999_triggers.sql หรือ custom migration") · M1, M5, M6**
- *Problem:* The Drizzle migrator applies only journaled files (E-12). A hand-created `9999_triggers.sql` is silently skipped. Generated SQL doesn't create extensions, but M3's `gin_trgm_ops` index and M5's `btree_gist` exclusion constraint need them.
- *Decision:*
  - M1's **first** migration is `pnpm db:generate --custom --name=extensions` containing `create extension if not exists pg_trgm; create extension if not exists btree_gist; create extension if not exists pgcrypto;`, and it must be generated **before** the first schema migration.
  - M5 adds a custom `time_off_no_overlap` migration (the exclusion constraint cannot be expressed in Drizzle).
  - M6 adds a custom `week_day_exclusivity_trigger`.
  - Custom files are hand-written by design; the "don't hand-edit" rule applies to generated ones.
  - Never use `drizzle-kit push`: it is introspection-based and can drop objects it doesn't model ([likely]).
- *Rationale:* Tool behaviour is verified. Record as a Decision and correct the CLAUDE.md wording through the owner.

**X-11 · ambiguity · §6.2, §12, CLAUDE ("ห้ามทำของ milestone ถัดไปล่วงหน้า") · all**
- *Problem:* Should the whole DDL be created at once, or per milestone?
- *Decision:* Introduce tables per milestone:
  - M1: Better Auth tables, `positions`, `work_schedules`, `user_preferences`, `audit_log`, `auth_login_failures` (M1-06), extensions.
  - M2: `clients`, `projects`, `project_members`, enums `certainty` and `project_role`.
  - M3: `tasks` **without** `milestone_id`, `task_assignments`.
  - M4: `pages`, `page_locks`, `files`, enum `page_space`.
  - M5: `holidays`, `leave_types`, `time_off`, enum `half_day`, exclusion constraint.
  - M6: `allocations`, enum `granularity`, trigger.
  - M8: `milestones` + `tasks.milestone_id` FK (set null).

  Only the milestone's contracts stream runs `db:generate`, to avoid journal conflicts between parallel agents.
- *Rationale:* Self-contained milestones; drizzle-kit handles additive changes.

**X-12 · risk · §10.3 (`SECURE_COOKIES=false` = http in LAN), FR-202 copy, §4.8 Cmd+C/V · M1, M6**
- *Problem:* Over plain HTTP (not localhost), `navigator.clipboard` and `crypto.randomUUID()` are unavailable (E-21).
- *Decision:*
  - Client code must not call `crypto.randomUUID()`. Use server-generated ids, or a `getRandomValues`-based helper for temporary ids.
  - `copyText()` helper: try `navigator.clipboard?.writeText`, else fall back to a hidden textarea with `document.execCommand('copy')`, and always keep the text visible and selectable.
  - Grid copy/paste (M6) uses DOM `copy`/`paste` events, which work without a secure context.
  - Add an "HTTP LAN" note to the README (M11).
- *Rationale:* A supported deployment mode per §10.3.

**X-13 · risk · §9 cookies, §10.3 `BETTER_AUTH_URL`/`SECURE_COOKIES`, reverse proxies · M1 (M11 docs)**
- *Problem:* Better Auth sets `Secure` in production by default (E-05). Its origin checks and Next's Server Action origin check reject requests when users open the app via a different host or IP than `BETTER_AUTH_URL` ([likely]). The IP-based limiter misbehaves behind proxies (E-06).
- *Decision:*
  - `advanced.useSecureCookies = env.SECURE_COOKIES === 'true'` (explicit).
  - `trustedOrigins = [BETTER_AUTH_URL, ...TRUSTED_ORIGINS.split(',')]`.
  - `experimental.serverActions.allowedOrigins` from the same list.
  - `advanced.ipAddress.trustedProxies` from `TRUSTED_PROXIES` (Caddy's or the company proxy's address).
  - Document all of this in `.env.example`. Switching `SECURE_COOKIES` logs everyone out, because the cookie name changes (`__Secure-`); `getSessionCookie` reads both names (E-05).
- *Rationale:* Self-hosted LAN reality.

**X-14 · risk · §7.3 sample code, §7.2 middleware · M1+**
- *Problem:* The SPEC sample uses `revalidateTag(tag)` (one argument) and `z.string().uuid()`. In Next 16, `revalidateTag` requires a profile, `updateTag` and `refresh` exist, and middleware is renamed proxy (E-11). `params` and `cookies()`/`headers()` are async.
- *Decision:* All `(app)` routes are dynamic, and live data goes through TanStack Query. So actions call `revalidatePath(path,'layout'|'page')` or `refresh()` when an RSC shell must change, and client mutations invalidate query keys. No tag caching and no `cacheComponents`. Use `src/proxy.ts` (not `middleware.ts`) for the optimistic cookie redirect and security headers. Use `z.uuid()` for our own uuid ids (see X-15 for user ids).
- *Rationale:* Follow current APIs, keep SPEC behaviour (§7.1: "ยึดเอกสารล่าสุด").

**X-15 · ambiguity · §6.1 (Better Auth text ids), E-10, E-16 · M1**
- *Problem:* Better Auth's default user ids are 32-character strings and fail `z.uuid()` (E-16). Mixed id formats invite validation bugs (a `userId` validated as uuid rejects valid ids).
- *Decision:* Every user row is created by **our** employees service (bootstrap, seeds, UI) with `crypto.randomUUID()` (server-side, fine) in the `text` column. `/admin/create-user` is disabled (M1-04). Optionally set `advanced.database.generateId: () => crypto.randomUUID()` so sessions and accounts match. Then `z.uuid()` is valid for every id in the app.
- *Rationale:* One id format; the column type stays `text`, so the SPEC is respected.

**X-16 · risk · §7.6 (attachments ≤ 25 MB), `MAX_ATTACHMENT_MB`, FR-531 · M0 (proxy), M4 (uploads, saves)**
- *Problem:* With `proxy.ts`, request bodies are buffered up to 10 MB and **silently truncated** (E-11). A 25 MB upload could be stored truncated. Server Actions default to a 1 MB body limit, and page saves (BlockNote JSON with tables) can approach it.
- *Decision:*
  - The proxy `matcher` excludes `/api/files` (and `/_next`, static files). Also set `experimental.proxyClientMaxBodySize: '<MAX_ATTACHMENT_MB+1>mb'` as a safety net.
  - The upload route rejects when the received byte length doesn't equal `Content-Length`.
  - `experimental.serverActions.bodySizeLimit: '4mb'`, and the page JSON is capped at 2 MB (zod).
- *Rationale:* Silent corruption is the worst failure mode.

**X-17 · ambiguity · §3.2, FR-403, FR-605, FR-529, FR-210 · M1/M2**
- *Problem:* Who may read the directory of people (names, nicknames, positions, colours)? Pickers, mentions and display names need it everywhere.
- *Decision:* Any logged-in user can read the **directory** of users (id, name, nickname, position name, colour, active flag) through `GET /api/people/options` (≤100 users, filtered client-side). Workload numbers stay governed by §3.3. Deactivated users stay in the directory, flagged, for historical labels, but are excluded from pickers.
- *Rationale:* Names aren't sensitive inside one company, and mentions and assignment require them.

**X-18 · ambiguity · §3.3 · helper M2, first consumer M5, full M9**
- *Problem:* §3.3 says "Worker ที่เป็น LEAD อย่างน้อย 1 โปรเจค" and "คนที่อยู่โปรเจคเดียวกัน", but not whether archived projects count or whether deactivated users are "people".
- *Decision:* `visibleUserIds(viewer)` returns all users for managers. For a worker who is LEAD of at least one **non-archived** project it also returns all users. Otherwise it returns self plus users sharing at least one **non-archived** project membership. Deactivated users are included (for history). `visibleProjectIds(viewer)` returns all for managers, else member projects **including archived** (they are viewable read-only). Tests land in M2 (authz) and M5 (calendar masking).
- *Rationale:* Archived projects are hidden and inactive, so they shouldn't widen visibility.

**X-19 · ambiguity · FR-406, BR-44, §8.1, §3.2 · M2 (affects M3–M9)**
- *Problem:* Can an archived project be edited? Its load no longer counts (BR-44), so edits would silently not count (P4).
- *Decision:* Archived means **read-only**: `view` is allowed for members and managers, every other need is FORBIDDEN "โปรเจคถูก archive แล้ว", except **unarchive** (M/L) and **permanent delete** (M). This covers tasks, plans, pages, members and milestones. Archived projects are hidden from the sidebar and pickers and listed under "ดูโปรเจคที่ archive". It is implemented in one place: `authz.requireProject(…, need)`.
- *Rationale:* One rule in authz; no invisible work.

**X-20 · spec-inconsistency · FR-1201, §7.3 pattern, §12 M11 "(ถ้ายังไม่ครบ)" · M1→all**
- *Problem:* FR-1201 lists projects, members, tasks, assignments, plans, milestones, pages, leave and employees. It omits clients, positions, holidays and leave types, yet the §7.3 pattern audits every action.
- *Decision:* Audit **every mutating action and route**, a superset of FR-1201. Exceptions: `user_preferences` writes and page-lease acquire/heartbeat/release. Page saves are logged **per save without content** (FR-1201), with volume accepted: about 4k rows/day is fine for PostgreSQL. Never store secrets: password changes log `{ passwordChanged: true }` only. `audit.log(tx, …)` runs inside the same transaction.
- *Rationale:* A uniform rule is simpler than a list, and M11 has nothing left to "complete".

**X-21 · missing-detail · BR-04, §8.8, D7, FR-601 dates, FR-903 · M1 (helper), M3/M5 (inputs)**
- *Problem:* Display formatting needs `Date`, and the SPEC doesn't say how dates are *entered*. Native `<input type=date>` doesn't show Buddhist-era years.
- *Decision:*
  - `src/lib/format.ts` `formatThaiDate(iso, style)` builds `Date.UTC(y,m-1,d)` and formats with `timeZone:'UTC'` (E-17). This is the only place besides `todayBangkok` that constructs a `Date`.
  - Date inputs use `@mui/x-date-pickers` `DatePicker` with **`AdapterDayjsBuddhist`** (E-18, MIT) and the dayjs `th` locale, with ISO string in and out at the component boundary. Leave ranges use **two** pickers, because the range picker is Pro.
  - Add dependencies `@mui/x-date-pickers` and `dayjs` and record them in Decisions.
- *Rationale:* The SPEC wants B.E. display (D7), and this avoids hand-rolled date widgets.

**X-22 · risk · §8.6, §7.5, FR-1102, FR-530 · M1 (undo), M3 (N, ?, Space), M4 (Cmd+K)**
- *Problem:* Global shortcuts collide with inputs and BlockNote. BlockNote binds `Mod-z`, `Mod-y` and `Shift-Mod-z` and has **no** `Mod-k` (E-19).
- *Decision:* The global Cmd+Z / Shift+Z handler skips when `event.defaultPrevented` or the target is an input, textarea, select or contenteditable. Cmd/Ctrl+K is captured on `window` and always opens the palette (preventDefault), including inside the editor. `N`, `?` and `Space` fire only outside editable elements. Everything is centralized in `useHotkeys`.
- *Rationale:* Predictable keyboard behaviour; the editor keeps its own undo.

**X-23 · risk · FR-1105, §6.4 · M4 (pages), M10**
- *Problem:* Does Thai substring search work with `pg_trgm`, how should results be ranked, and what about wildcard injection?
- *Decision:* Filter with `col ILIKE '%' || $q || '%'` after escaping `\`, `%` and `_` (`ESCAPE '\'`). Rank by `word_similarity($q, col) DESC, length(col)`. `similarity()` under-ranks substrings: 0.278 against 0.714 for `word_similarity` (E-13). Accept Seq Scans for 1–2 character queries at the target scale. Apply the permission filter in SQL. Limit to 8 per category.
- *Rationale:* Verified that index use and correctness hold on PostgreSQL 17.11 with Thai combining marks.

**X-24 · risk · §11.2, §11.4, DoD, CLAUDE (`pnpm check`) · M0/M1**
- *Problem:* Authz tests need a real database (§11.2). `pnpm check` is "typecheck + lint + unit". Parallel test workers on one database are flaky.
- *Decision:*
  - `pnpm check` = `tsc --noEmit && eslint . && vitest run --project unit`, with no database.
  - `pnpm test:int` runs Vitest integration against `planner_test`: `fileParallelism:false`, or one database per worker cloned from a template.
  - `pnpm test:e2e` runs Playwright against `planner_e2e`, reseeded in `globalSetup`, with `workers:1`.
  - The milestone gate is `check` + `test:int` + `test:e2e`, all green. Never test against the dev database. Record in Decisions.
- *Rationale:* Keeps `check` fast and runnable anywhere while the DoD still enforces authz tests.

**X-25 · missing-detail · CLAUDE UX/i18n/date/localStorage/architecture rules · M0**
- *Problem:* Several CLAUDE rules are easy to break silently.
- *Decision:* Add ESLint guardrails in M0:
  1. `no-restricted-syntax`: Thai characters `/[฀-๿]/` in `Literal`/`JSXText`/`TemplateElement` are errors outside `src/i18n/**`, tests and scripts.
  2. In `src/domain/**`: `no-restricted-imports` for `next*`, `react*`, `@/server*`, `drizzle-orm*`, `postgres`.
  3. In `src/domain/**` except `dates.ts`: ban `new Date` and `Date.now`.
  4. Ban `localStorage` and `sessionStorage` outside `src/lib/prefs/**`.
  5. `reportUnusedDisableDirectives`, and require a description on `eslint-disable` comments (`@eslint-community/eslint-plugin-eslint-comments` `require-description`, a new devDependency).
- *Rationale:* The DoD requires "no eslint-disable without reason", so machine checks beat reviews.

**X-26 · missing-detail · §8.8, CLAUDE i18n · M1**
- *Problem:* Error texts come from three sources: Zod, Better Auth and our own code.
- *Decision:* Call `z.config(z.locales.th())` once as a fallback (E-16). User-facing forms use explicit messages from `th.ts` because the built-in Thai messages embed English type names. Better Auth errors are mapped **by code** (`INVALID_EMAIL_OR_PASSWORD`, `BANNED_USER`, 429 / `LOGIN_LOCKED`, `PASSWORD_TOO_SHORT`) to `th.auth.*` in the login and account UI. Actions return `{ ok:false, code, message: th.errors[code] }`.
- *Rationale:* Consistent Thai UI without hardcoding strings in components.

**X-27 · risk · multi-agent execution · all**
- *Problem:* `schema.ts`, `th.ts`, the nav config, `authz.ts` and the authz matrix rows are edited by several streams at once.
- *Decision:* An S0 "contracts" step per milestone owns the schema and migrations (single `db:generate`), the new `authz` signatures, the new `th` namespaces and the nav entries. Feature streams only add inside their namespace, and the integration gate re-runs `db:generate` to check "No schema changes".
- *Rationale:* Prevents journal and merge conflicts (E-12 shows the journal is order-sensitive).

**X-28 · missing-detail · §9 browser/mobile, §8.9 · M3/M4/M5 (M10)**
- *Problem:* The mobile scope (home, my tasks, leave, reading documents) and "not by colour alone" rules aren't assigned to milestones.
- *Decision:*
  - M3 `/my` is responsive.
  - M4 page view is read-only friendly on small screens.
  - M5 uses a full-screen leave dialog and an agenda list instead of the month grid below 600 px.
  - M0 layout has a temporary Drawer on small screens.
  - Status cues per milestone: M1 "ปิดใช้งาน" chip; M2 ◐ tentative icon with text; M4 🔒 icon plus aria-label; M5 leave stripes plus icon and the "เช้า/บ่าย" label.
- *Rationale:* Spreads the NFR over the milestones that own the screens.

### 3.1 M0 — Scaffold

**M0-01 · risk · CLAUDE M0 notes ("ห้ามเขียนทับ CLAUDE.md") · M0 (every later `pnpm dev`)**
- *Problem:* create-next-app writes `CLAUDE.md` and `AGENTS.md` (E-01). `next dev` re-inserts the managed block into `CLAUDE.md` whenever it detects an AI agent and no `AGENTS.md` exists (E-02). Claude Code sessions would therefore modify `CLAUDE.md` on every dev-server start.
- *Decision:* Scaffold with `--no-agents-md`. Exclude `CLAUDE.md`, `AGENTS.md` and `README.md` from the copy. `next.config.ts` contains `agentRules: false` **before the first `pnpm dev`**. M0 gate: after running dev and e2e, `git diff --exit-code CLAUDE.md SPEC.md PROGRESS.md docs/` must pass.
- *Rationale:* Verified mechanism with an official opt-out.

**M0-02 · risk · CLAUDE M0 notes, §7.1 · M0**
- *Problem:* The folder isn't empty. create-next-app defaults to Tailwind (unwanted with MUI) and prompts for the React Compiler. The scaffold `.gitignore` ignores `.env*`, which would swallow `.env.example`.
- *Decision:* `pnpm dlx create-next-app@16.3.7 <scratch>/scaffold --ts --app --src-dir --eslint --no-tailwind --no-react-compiler --import-alias "@/*" --use-pnpm --no-agents-md --disable-git --skip-install --yes`. Then `rsync -a --ignore-existing --exclude CLAUDE.md --exclude AGENTS.md --exclude README.md <scratch>/scaffold/ ./`. Merge `.gitignore`: keep the scaffold entries and add `uploads/`, `backups/`, `/playwright-report`, `/test-results`, `/coverage`, **`!.env.example`**. Remove the scaffold demo assets (`public/*.svg`, `page.module.css`).
- *Rationale:* Verified flags (E-03).

**M0-03 · risk · §7.1 (Node 22, pnpm), §10.6 · M0**
- *Problem:* pnpm isn't installed, and the local Node 26 has no corepack. Production uses Node 22. Recent pnpm majors block dependency build scripts and have supply-chain settings (see r1 research: `allowBuilds`, `minimumReleaseAge`).
- *Decision:*
  - `npm i -g pnpm@<pinned>` locally, and pin `"packageManager": "pnpm@<same>"`.
  - The Dockerfile uses `corepack enable` (available in `node:22-alpine`, E-04) or `npm i -g pnpm@<same>`.
  - Approve only the needed build scripts (esbuild, unrs-resolver, sharp if present) in `pnpm-workspace.yaml`.
  - `engines.node: ">=22.12"` without an upper bound, and `.nvmrc` = `22`. Local Node 26 is tolerated.
  - M11 runs the full suite inside `node:22` once.
- *Rationale:* Avoids "works on 26 only" drift without blocking local development.

**M0-04 · cross-milestone-dependency · §12 M0 ("e2e smoke เปิดหน้าแรกได้"), AC-101, FR-1101 · M0→M1, M10**
- *Problem:* The M0 smoke opens `/` without auth, but from M1 `/` must redirect to `/login`. The DoD requires previous milestones' e2e to stay green.
- *Decision:* `/` does `redirect('/home')` from M0, and `/home` is a placeholder until M10. The M0 smoke asserts the shell renders Thai text from `th.ts` and the self-hosted font variable. In M1 the smoke spec is updated to use the manager `storageState` (still named `m0-smoke`).
- *Rationale:* Avoids a failing or deleted smoke test.

**M0-05 · missing-detail · §8.8 (IBM Plex Sans Thai or Noto Sans Thai, `next/font/local`), §9 offline · M0**
- *Problem:* Where do the font files come from?
- *Decision:* Copy the woff2 files (thai + latin subsets; weights 400/500/600/700) from `@fontsource/ibm-plex-sans-thai` 5.3.0 (OFL-1.1, E-24) into `src/app/fonts/` with the OFL licence text. Load them with `next/font/local` as a CSS variable, used by the MUI `typography.fontFamily`. Don't keep the npm package as a runtime dependency.
- *Rationale:* Offline, deterministic, licence-compliant.

**M0-06 · ambiguity · §8.7 ("dark mode … under .dark"), §8.9 contrast · M0**
- *Problem:* The SPEC gives only light token values.
- *Decision:* Define dark counterparts for every §8.7 token in `tokens.css` under `.dark`, meeting 4.5:1. MUI uses `cssVariables: { colorSchemeSelector: 'class' }` with `colorSchemes: { light, dark }` and `InitColorSchemeScript`. The default follows `prefers-color-scheme`, with an optional user override in `user_preferences.theme` (M1). No toggle is required in M0.
- *Rationale:* Satisfies "has dark mode" with the least UI.

**M0-07 · missing-detail · §8.1, §12 M0 ("sidebar placeholder") · M0→M10**
- *Problem:* Sidebar items appear in different milestones.
- *Decision:* `src/components/nav/nav-items.ts` is data-driven:
  - M0: หน้าหลัก + user area + `Cmd+\` collapse.
  - M1: ตั้งค่า (manager only) and a user menu entry "บัญชี/เปลี่ยนรหัสผ่าน · ออกจากระบบ".
  - M2: โปรเจค list with "+" (manager) and ลูกค้า.
  - M3: งานของฉัน (with count).
  - M4: page trees, Wiki ทีม and 🔍 ค้นหา ⌘K.
  - M5: ปฏิทินทีม.
  - M9: Workload ทีม (badge) and ทีมงาน.

  Items are rendered only once implemented; no dead links.
- *Rationale:* Complies with "don't build ahead", and each e2e sees a stable shell.

**M0-08 · risk · §12 M0 (`pnpm check` green) · M0**
- *Problem:* Vitest exits 1 when no test files exist (E-23), so `pnpm check` is red in a fresh scaffold.
- *Decision:* M0 ships a real unit test, e.g. `src/i18n/th.test.ts` asserting required namespaces and no empty strings, and a trivial `src/domain/sanity.test.ts` if needed. Do **not** use `--passWithNoTests`, which would hide a misconfigured include glob later.
- *Rationale:* Verified behaviour.

**M0-09 · missing-detail · §10.3 env, scripts, drizzle-kit · M0**
- *Problem:* drizzle-kit and `tsx` scripts need `.env`, and Next loads env only for itself.
- *Decision:* Scripts use `node --env-file-if-exists=.env --import tsx scripts/<x>.ts` (verified on Node 26 and 22, E-23), so no dotenv dependency is needed. `drizzle.config.ts` calls `process.loadEnvFile?.('.env')` inside a try, or `package.json` runs `node --env-file-if-exists=.env ./node_modules/.bin/drizzle-kit …` ([likely]). `src/server/env.ts` validates env with zod at startup; `APP_FAKE_TODAY` and `E2E` are test-only.
- *Rationale:* Fewer dependencies, identical behaviour in Docker.

**M0-10 · risk · §9 (CSP), §7.1 MUI, BlockNote Mantine · M0 (M11 verifies)**
- *Problem:* Emotion (MUI) and Mantine inject styles, and the App Router injects inline scripts. A strict CSP decided late causes rework.
- *Decision:* Decide in M0: `proxy.ts` sets the CSP with a per-request nonce for scripts, and `style-src 'self' 'unsafe-inline'`. Wrap the root with `AppRouterCacheProvider` from `@mui/material-nextjs/v16-appRouter` (E-18). The M0 e2e fails on any CSP console violation. The detailed header set is finalized in M11 (r1 has specifics).
- *Rationale:* Avoids retrofitting nonce plumbing.

### 3.2 M1 — Auth, employees, positions

**M1-01 · missing-detail · FR-101…107, §7.1 · M1**
- *Problem:* The Better Auth configuration needs many non-default settings to meet the SPEC.
- *Decision:* Use the skeleton in §5.1 below: `disableSignUp`, `minPasswordLength: 8`, session 7 d / updateAge 1 d, cookie cache **off**, `useSecureCookies` explicit, `trustedOrigins`, `trustedProxies`, `rateLimit.customRules`, `disabledPaths`, `hooks` (lockout), `admin({ defaultRole:'worker', adminRoles:['manager'], roles:{ manager, worker }, bannedUserMessage: th.auth.deactivated })` and **`nextCookies()` last**.
  - Verified: `adminRoles` must be keys of `roles` or init throws (E-09).
  - Note that `bannedUserMessage` is Thai text living in `th.ts`.
- *Rationale:* Every item maps to a FR (§5.1 annotates it).

**M1-02 · spec-inconsistency · §6.2 Better Auth block, §6.1 · M1**
- *Problem:* The SPEC lists `user` columns in snake_case (`ban_reason`, `must_change_password`, …) and omits the admin plugin's `ban_expires` (user) and `impersonated_by` (session). The Drizzle adapter looks up columns by **Better Auth field names** (E-10).
- *Decision:* In `schema.ts`, the `user`, `session`, `account` and `verification` tables use **camelCase keys matching BA field names** (`emailVerified`, `banReason`, `banExpires`, `mustChangePassword`, …) with **snake_case column names**. Include `banExpires` and `session.impersonatedBy` because the plugin reads and writes them (E-09). Use the output of `npx @better-auth/cli generate` only as a reference: never run BA `migrate`; drizzle-kit is the only migration tool. The `id` column stays `text`.
- *Rationale:* Required by the adapter's field resolution and consistent with the SPEC's snake_case.

**M1-03 · missing-detail · §6.2 user columns, BR-04, FR-104 · M1**
- *Problem:* Which app columns should Better Auth know about?
- *Decision:* Declare only `mustChangePassword` as a BA `additionalField` (`type:'boolean', defaultValue:true, input:false`) so it rides on `session.user` for the gate. `nickname`, `positionId`, `color` and `deactivatedOn` are plain app columns in the same table, read through `repo.users`. **Never** declare `deactivatedOn` as a BA `date` field: BA dates are timestamps/JS `Date`, and `deactivated_on` must stay an ISO `date` string.
- *Rationale:* Less surface in BA and no `Date` for plan dates.

**M1-04 · risk · FR-101, FR-201 (manager edits employees), FR-105, FR-104 · M1**
- *Problem:* `/update-user` lets any logged-in user change their own `name`, `image` and non-`input:false` fields (E-08). `/change-password` bypasses our "≠ email" policy and leaves `must_change_password` set. The admin endpoints duplicate our transactional services.
- *Decision:*
  - All additional fields `input:false`.
  - `disabledPaths`: `/sign-up/email`, `/update-user`, `/change-email`, `/delete-user`, `/delete-user/callback`, `/change-password`, `/request-password-reset`, `/reset-password`, `/reset-password/:token`, `/send-verification-email`, `/verify-email`, `/sign-in/social`, `/link-social`, `/unlink-account`, `/list-accounts`, `/account-info`, `/get-access-token`, `/refresh-token`, `/update-session`, and all `/admin/*`.
  - Keep: `/sign-in/email`, `/sign-out`, `/get-session`, `/revoke-sessions`, `/list-sessions`, `/revoke-session`, `/ok`, `/error`.
  - Add an authz test: a worker POST to `/api/auth/update-user` returns 404, and to `/api/auth/sign-up/email` it is rejected (AC-102).
- *Rationale:* Least privilege; all manager operations go through our authz, audit and transactions.

**M1-05 · ambiguity · FR-201, FR-204, FR-205, CLAUDE (multi-table writes in one transaction) · M1**
- *Problem:* Creating an employee writes `user` + `account` + `work_schedules` (up to 7 rows) + `audit_log`. BA `createUser` runs outside our transaction and doesn't check the minimum length. `setUserPassword` doesn't revoke sessions (E-09).
- *Decision:* Services use one Drizzle transaction each:
  - **create:** insert `user` (id = `crypto.randomUUID()`, email trimmed and lowercased, `role`, `mustChangePassword`), insert `account` (`providerId:'credential'`, `accountId:user.id`, `password: await hashPassword(pw)`), insert schedules and audit.
  - **reset password:** update `account.password`, set `mustChangePassword=true`, delete all of the user's `session` rows, audit.
  - **deactivate:** `banned=true`, `banReason='DEACTIVATED'`, `banExpires=null`, `deactivatedOn=serverToday()`, delete sessions, audit.
  - **reactivate:** clear those fields.
  - **role change:** update `role` with the last-manager guard (M1-12).

  Hashing uses `better-auth/crypto` `hashPassword`/`verifyPassword` (node:crypto scrypt, E-10). An integration test proves a service-created user can sign in through `/api/auth/sign-in/email` (AC-201).
- *Rationale:* Atomicity and audit in one place; the BA plugin still enforces `banned` at session creation.

**M1-06 · spec-inconsistency / risk · FR-106 · M1**
- *Problem:* FR-106 wants 5 **failed** logins in 15 minutes **per IP + email**. The BA limiter counts every request per IP+path, allows only 3 per 10 s by default, is enabled only in production, and uses one shared bucket when no IP can be resolved (E-06). It can't express FR-106 and can break the Monday-morning login rush and e2e.
- *Decision:*
  - Table `auth_login_failures(id bigserial pk, email text not null, ip text not null, created_at timestamptz default now())` with an index on `(email, ip, created_at)`.
  - `hooks.before` for `/sign-in/email`: normalize the email, use `ip = getIP` semantics (or `'unknown'`), count failures in the last 15 min. At ≥ 5, throw `APIError` 429 with code `LOGIN_LOCKED` and a Thai message with the minutes remaining. The lock lasts until the 5th-newest failure ages out, and it applies even if the password is correct.
  - `hooks.after`: when `ctx.context.returned` is an `APIError` with status 401 or `INVALID_EMAIL_OR_PASSWORD`, insert a failure. On success, delete the failures for `(email, ip)`.
  - Tune the BA limiter: `customRules['/sign-in/email'] = { window: 60, max: 30 }` as a per-IP backstop, and `enabled` defaulting to production but switchable off via `AUTH_RATE_LIMIT=off` only when non-production or `E2E=1`.
  - Integration test: 5 failures then a 6th attempt with the correct password → `LOGIN_LOCKED`; a different IP is not locked.
- *Rationale:* Persists across restarts and is deterministic in tests. The new table is outside the SPEC DDL (record a Decision). [likely: `ctx.body` is available in before-hooks and `returned` in after-hooks; verify in the first test.]

**M1-07 · ambiguity · FR-105, FR-104, FR-202, FR-204 · M1**
- *Problem:* What does "ไม่ซ้ำอีเมล" mean? And should the forced change accept the same password?
- *Decision:* A shared zod refinement `passwordPolicy(email)`:
  - length ≥ 8 and ≤ 128;
  - reject if the trimmed, lowercased password equals the **full email** or its **local part**;
  - for self-change only, also reject new == current, so FR-104 can't be satisfied by re-typing the initial password.

  The same policy applies to manager-set initial and reset passwords. Messages live in `th.account.*`.
- *Rationale:* The literal reading plus the obvious intent of FR-104.

**M1-08 · missing-detail · FR-104, AC-103, §7.3 `action()` · M1**
- *Problem:* Where exactly is `must_change_password` enforced?
- *Decision:*
  1. Pages: `requirePageUser()` (React `cache()`d `auth.api.getSession({ headers: await headers() })` plus our user row) runs in `(app)/layout.tsx` **and at the top of every page and data loader**, because layouts don't re-render on client navigation. It redirects to `/account/password`.
  2. Actions: the `action()` wrapper returns `MUST_CHANGE_PASSWORD`, except `changeOwnPassword` and `signOutEverywhere`.
  3. Route handlers: the `route()` wrapper returns 403 `MUST_CHANGE_PASSWORD` (JSON), except `/api/auth/*`.
  4. `proxy.ts` only does the cookie-presence redirect to `/login` (`getSessionCookie`, E-05).

  `/account/password` lives in the `(auth)` group (no shell). On success it sets `mustChangePassword=false`, deletes other sessions and redirects to `/home`.
- *Rationale:* Covers every entry point (AC-103: "ไปหน้าอื่นไม่ได้").

**M1-09 · ambiguity · FR-107 ("หน้าบัญชีของตัวเอง"), §7.2 routes · M1**
- *Problem:* No `/account` page appears in the route list.
- *Decision:* `/account/password` is the account page. It holds the change-password form and an "ออกจากระบบทุกอุปกรณ์" button, which calls BA `/revoke-sessions` (including the current session) and then redirects to `/login`. `/account` redirects there. The sidebar user menu links to it.
- *Rationale:* Uses the only account route the SPEC defines.

**M1-10 · missing-detail · FR-202, AC-201, AC-202 · M1**
- *Problem:* The random password alphabet, how "show once" is enforced, and how copy works.
- *Decision:* Generate in the **browser** with `crypto.getRandomValues` (available without a secure context) and rejection sampling: 12 characters from `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789` (no 0/O/1/l/I), guaranteeing at least one upper, one lower and one digit. Show it in a visible field with a copy button (X-12 fallback). Never put it in the URL, query cache or localStorage. Reset the form state on success and on unmount; the server never echoes passwords. The reset flow is the same. AC-202 e2e: create, navigate away, reopen the form, and the field is empty.
- *Rationale:* Meets the letter and intent of the SPEC; works over HTTP.

**M1-11 · ambiguity · FR-205, FR-206, BR-13, AC-104, AC-203 · M1**
- *Problem:* What happens to memberships, assignments and plans when a user is deactivated or reactivated?
- *Decision:*
  - Deactivation keeps project memberships, LEAD roles, assignments and allocations (history, FR-205). From M9 their future load shows OVER because capacity is 0 (P4).
  - Excluded from every picker (member, assignee, LEAD, "leave for employee").
  - Labelled "ปิดใช้งาน" wherever shown.
  - A login attempt returns BA `BANNED_USER`, mapped to `th.auth.deactivated`.
  - Blocks: self-deactivation, and deactivating the last active manager.
  - Reactivation clears `deactivated_on`; capacity is restored for all dates (no history table).
- *Rationale:* P4 and FR-205 ("ประวัติแผนยังอยู่ครบ"); verified that BA deletes sessions on ban and blocks new sessions (E-09).

**M1-12 · risk · FR-206 · M1**
- *Problem:* Two managers demoting or deactivating each other concurrently can leave zero managers.
- *Decision:* In the transaction, run `select pg_advisory_xact_lock(hashtext('last-manager'))`, then count active managers excluding the target; if zero, return `CONFLICT` "ต้องมีผู้จัดการที่ใช้งานอยู่อย่างน้อย 1 คน". Self-**demotion** is allowed when another active manager exists (the SPEC forbids only self-deactivation). The access change takes effect on the next request.
- *Rationale:* Simple serialization.

**M1-13 · ambiguity · FR-206, §3.1 · M1**
- *Problem:* Should sessions be revoked when a role changes?
- *Decision:* No. The role is read from the DB on every request (cookie cache disabled), so a demotion applies to the next request. Integration test: demote, then the old session calls a manager-only action → `FORBIDDEN`.
- *Rationale:* Simplest correct behaviour.

**M1-14 · missing-detail · FR-207, BR-10, BR-27 · M1**
- *Problem:* Schedule details are underspecified.
- *Decision:* Weekday toggles 1–7 (weekends allowed), each with a fraction chosen from {0.25, 0.50, 0.75, 1.00}. At least one working day is required (use deactivation for "no work"). The default for new employees is Mon–Fri 1.00 (P5). Saving replaces the rows in one transaction. Changes apply to **all dates** (no effective dating), so past capacity changes too: record a Decision.
- *Rationale:* P1/P5 simplicity; the DDL has no effective date.

**M1-15 · ambiguity · FR-208, FR-201, FR-1001 grouping · M1**
- *Problem:* Is a position required, how is it ordered, and when can it be deleted?
- *Decision:*
  - A position is optional for users (the DDL is nullable). M9 groups users without one under "ไม่ระบุตำแหน่ง", last.
  - Ordering UI: "เลื่อนขึ้น/เลื่อนลง" buttons that compute a key between the neighbours (no drag and drop for a 6–15 item list).
  - Deleting a position referenced by any user (active or not) is blocked: FK violation 23503 → "มีพนักงานใช้ตำแหน่งนี้อยู่ N คน".
  - Deleting an unused position happens immediately, with a toast undo that re-inserts the same id, name and position.
  - Names are unique (23505 → Thai message). Bootstrap seeds six positions.
- *Rationale:* P1; keyboard-accessible.

**M1-16 · missing-detail · §6.2 `user.color`, FR-210 · M1**
- *Problem:* How are user colours assigned, and what are the avatar initials for Thai names?
- *Decision:* On creation, auto-assign the least-used colour from a fixed 12-colour accessible palette (theme tokens), editable in the form. Avatar initials are the first **grapheme** of `nickname || name`, using `Intl.Segmenter('th',{granularity:'grapheme'})` so combining marks stay attached. The text colour is chosen for ≥ 4.5:1 contrast. `UserName` shows the display name, with the full name and position on hover (FR-210).
- *Rationale:* P5, and Thai correctness.

**M1-17 · missing-detail · FR-201, FR-209 · M1**
- *Problem:* Email normalization, editing, and employee search.
- *Decision:* Emails are trimmed and lowercased on create, edit and login (BA lowercases at sign-in, E-10), and are unique (23505 → "อีเมลนี้ถูกใช้แล้ว"). A manager may change an email; the credential account is keyed by user id, so login continues with the new email and sessions are kept. The FR-209 list (≤100 users) is filtered client-side by name or nickname (substring, case-insensitive), position and status (ใช้งาน/ปิดใช้งาน/ทั้งหมด). Employees are never hard-deleted.
- *Rationale:* Scale makes client-side filtering the simplest option.

**M1-18 · missing-detail · FR-102, §10.4 · M1**
- *Problem:* Bootstrap edge cases.
- *Decision:* `scripts/bootstrap.ts` is idempotent:
  - If `select count(*) from "user"` = 0: if all of `INITIAL_MANAGER_EMAIL`, `_NAME` and `_PASSWORD` are present and pass the policy, create the manager through the employees service (`role manager`, `mustChangePassword true`, Mon–Fri schedule, no position). Otherwise print a clear warning and exit 0 in dev, or 1 in `migrate` if missing in production.
  - If users exist, skip: never touch passwords.
  - Seed positions only when the table is empty.
  - M5 adds leave types.
  - Never print the password. Warn if `APP_FAKE_TODAY` or `E2E` is set in production.
- *Rationale:* Safe re-runs from the `migrate` service.

**M1-19 · cross-milestone-dependency · AC-203 · M1→M2→M3→M6**
- *Problem:* AC-203 mentions the assignment picker (M3) and the grid label (M6).
- *Decision:*
  - M1 verifies that login is blocked, sessions are revoked and `listAssignableUsers()` excludes deactivated users (integration).
  - M2: the member picker excludes them (e2e).
  - M3: the assignee picker excludes them (e2e).
  - **M6**: the grid shows the "ปิดใช้งาน" label on the old assignee row (e2e).

  The traceability table marks AC-203 as closed in M6.
- *Rationale:* Every half is tested where it becomes possible.

**M1-20 · risk · FR-103 · M1**
- *Problem:* Session refresh is skipped in RSC requests (E-07). A user who only navigates pages isn't renewed, and the cookie expires 7 days after login.
- *Decision:* A `SessionKeepAlive` client component in `(app)/layout.tsx` calls `authClient.getSession()` on mount and on `visibilitychange`→visible at most every 6 hours. The route and action wrappers call `auth.api.getSession({ headers })` (refresh allowed there). Keep `nextCookies()` last and the cookie cache disabled. Integration test: a session older than `updateAge` is extended by a GET to `/api/auth/get-session`.
- *Rationale:* Verified code path.

**M1-21 · missing-detail · FR-101, AC-101, §8.1 · M1**
- *Problem:* Login flow details.
- *Decision:*
  - `/login` uses BA client `signIn.email`, so hooks apply.
  - `?next=` must be a same-origin relative path; the default target is `/home`.
  - Error mapping by code (X-26).
  - Logout lives in the sidebar user area.
  - An already-logged-in user visiting `/login` is redirected to `/home`.
  - The "ออกจากระบบ" item calls `/sign-out`.
- *Rationale:* P6 deep links; standard behaviour.

**M1-22 · missing-detail · §6.2 `user_preferences`, CLAUDE (no localStorage for real data) · M1**
- *Problem:* Preferences are needed from M1 (theme) through M6 (unit, zoom).
- *Decision:* Create the table in M1, with `getPreferences()` and a `setPreference(key, value)` action validated by a zod union of known keys (`theme`, `sidebar.collapsed`, `sidebar.expanded`, `tasks.groupBy`, `tasks.sort`, `tasks.showCompleted`, `grid.unit`, `grid.zoom`, `load.view`). Writes are debounced and not audited.
- *Rationale:* One mechanism that later milestones extend.

**M1-23 · risk · §11.4 seeds, M11 `seed:perf` · M1**
- *Problem:* scrypt hashing per user is slow in bulk.
- *Decision:* Seeds hash `demo1234` **once** and reuse the hash for every golden user. `seed:perf` reuses one hash for 100 users.
- *Rationale:* Verified hasher (E-10); faster tests.

### 3.3 M2 — Clients, projects, members, authorization

**M2-01 · spec-inconsistency · §3.2 ("แก้ข้อมูลโปรเจค … ลูกค้า" = M/L; "ดูลูกค้า" L/Me = only clients of their projects) · M2**
- *Problem:* A LEAD may change a project's client but may only "see" clients of their own projects, so they couldn't pick a new one.
- *Decision:* For users allowed to edit that project (M/L), the client **picker** in the project form lists all non-archived clients (id, name, code, colour). Client pages and lists still follow the "ดูลูกค้า" row. Record a Decision.
- *Rationale:* Choosing from names isn't "viewing the client page"; otherwise §3.2 is unimplementable for L.

**M2-02 · cross-milestone-dependency · FR-303 · M2→M9**
- *Problem:* Client load needs allocations and load aggregation.
- *Decision:* M2 builds `/clients` and `/clients/[id]` with the project list; for workers only visible projects are listed, and no load figure is shown. M9 adds "ภาระรวม 12 สัปดาห์ข้างหน้า": total (and committed) in cd for weeks `[weekStart(today), +12w)` over the client's **non-archived, viewer-visible** projects, sharing the load-summary service with FR-409 and FR-906.
- *Rationale:* Placed with the other "load parts" (§12 M9); masking-consistent.

**M2-03 · cross-milestone-dependency · FR-404, BR-61 · M2→M3**
- *Problem:* Removing a member requires checking their assignments, and the table arrives in M3.
- *Decision:* The M2 `removeMember` service returns `{ blockedByAssignments: number }`, which is always 0 in M2, and removes the row with an undo that re-inserts it with the same role, `added_by` and `added_at`. M3 implements the count, the two-option toast and a **combined** operation, "ยกเลิกการมอบหมายทั้งหมด + นำออก", in one transaction with one undo entry.
- *Rationale:* Keeps the M2 authz tests valid; no dead code.

**M2-04 · ambiguity · FR-404 ("งานค้าง"), BR-61 · M3**
- *Problem:* Which assignments count, and what does undo restore?
- *Decision:* Following BR-61, count **all active assignments on non-deleted tasks** of that project, completed tasks included. N is the number of distinct tasks. The action soft-deletes those assignments with a shared `deleted_batch` and hard-deletes the member row. Undo restores the assignment batch and re-inserts the member row. This keeps the invariant "active assignment ⇒ membership".
- *Rationale:* The BR wording is stronger than the FR's "งานค้าง".

**M2-05 · cross-milestone-dependency / ambiguity · FR-406, P2 · M2→M6**
- *Problem:* The archive message needs X person-days, and "แจ้ง… แล้ว archive" could be read as a confirm step.
- *Decision:* Archive happens immediately (P2: reversible, so no confirm). Toast: "archive '<ชื่อ>' แล้ว · เลิกทำ". M6 appends "· ปลดภาระ X วัน-คน ในอนาคต", where X is Σ allocations with `week_start ≥ weekStart(serverToday())` on non-deleted tasks and assignments, respecting BR-50. It is shown only when X > 0.
- *Rationale:* Correct UX pattern; the number arrives with allocations.

**M2-06 · spec-inconsistency · BR-62 vs FR-401 · M2**
- *Problem:* FR-401 has a LEAD field in the create form, while BR-62 says a project must always have a LEAD (with an exception when the manager runs it).
- *Decision:*
  - LEAD is **optional** at creation (P1).
  - A project without a LEAD shows a non-blocking warning to managers on the overview.
  - A LEAD (worker) cannot demote or remove the **last** LEAD: `CONFLICT` "โปรเจคต้องมี LEAD อย่างน้อย 1 คน".
  - A manager can, with a warning toast.
  - Deactivating the only LEAD is allowed, with a warning on the project.
  - Any active user, managers included, may be LEAD or MEMBER; manager membership doesn't change permissions.
- *Rationale:* Reconciles the two rules using BR-62's own exception.

**M2-07 · spec-inconsistency · §6.2 `projects.deleted_at` ("hard delete; soft only while waiting"), FR-407, BR-44, §6.5 · M2 (+M4)**
- *Problem:* The "waiting" period for `deleted_at` is undefined, while FR-407 says permanent delete.
- *Decision:*
  - Permanent delete runs in **one transaction**: collect `files.storage_key` for the project (from M4), `delete from projects where id=$1` (FK cascades handle members, pages → page_locks, files, tasks → assignments → allocations, milestones), write an audit row (`audit_log.project_id` has no FK, so it survives), commit, then **unlink the files best-effort** and log failures.
  - `deleted_at` is kept in the schema and always filtered (`is null`) but never set in the MVP.
  - The confirm dialog requires an exact (trimmed) name match. Manager only.
- *Rationale:* Simplest correct meaning; M4 extends the file cleanup (M4-28).

**M2-08 · cross-milestone-dependency · FR-408, FR-409 · M2→M3/M4/M6/M8/M9**
- *Problem:* Tabs and overview parts depend on later milestones.
- *Decision:* Tabs come from a config:
  - M2: ภาพรวม (project info with inline edit for M/L, members list with role chips, and "ยังไม่มี LEAD" warning).
  - M3: งาน tab and a progress figure (M3-18).
  - M4: เอกสาร tab and a charter link.
  - M6: แผนงาน tab.
  - M8: upcoming milestones card.
  - M9: per-member load and 12-week bars.

  No disabled placeholder tabs.
- *Rationale:* "Don't build ahead", and each e2e sees the real UI.

**M2-09 · cross-milestone-dependency · FR-405 · M2→M6/M9**
- *Problem:* A certainty change must update every number without reload, but no numbers exist yet.
- *Decision:* M2 creates `src/lib/query-keys.ts` and `invalidateLoad(qc)`, and the certainty-change mutation calls it plus `router.refresh()`. M6 and M9 queries use those keys. M6 e2e proves it. Other users and tabs are not live-updated (not required).
- *Rationale:* A contract first, consumers later.

**M2-10 · ambiguity · §3.2 "ดูลูกค้า", §8.1 sidebar "🏢 ลูกค้า" · M2**
- *Problem:* Who sees `/clients`, and which clients?
- *Decision:* Every user sees the nav item. Managers see all clients (active plus an archived filter). Workers see clients of projects they are a member of (archived projects included, since those are viewable). A worker with no projects gets an empty state. A client detail page the viewer can't see returns 404. Client CRUD and archive are manager-only (FORBIDDEN otherwise).
- *Rationale:* Literal §3.2 plus X-07.

**M2-11 · missing-detail · FR-301, FR-302 · M2**
- *Problem:* Archived-client behaviour and name uniqueness.
- *Decision:* Archived clients are hidden from the create and edit pickers; the projects that use them are unaffected and still show the client name with an "archived" chip. Unarchive is allowed. Names are unique including archived ones (23505 → "มีลูกค้าชื่อนี้แล้ว (อาจถูก archive อยู่)"). Code and colour are optional.
- *Rationale:* Matches the DDL.

**M2-12 · missing-detail · §8.1, §12 M2 (sidebar real projects) · M2**
- *Problem:* Where does the sidebar get its data, and how is it ordered?
- *Decision:* `GET /api/nav` (route handler plus TanStack Query) returns visible **non-archived** projects (id, name, colour, certainty). They are sorted by name with `Intl.Collator('th')` on the client; there is no manual project ordering (not in the SPEC). Mutations to projects and members invalidate it. M4 adds page roots (lazy) and M9 adds the badge. The ◐ icon for TENTATIVE projects has an aria-label.
- *Rationale:* Client-side invalidation, which later becomes drag-and-drop in M4.

**M2-13 · missing-detail · FR-403 · M2**
- *Problem:* Member management UX.
- *Decision:* An "เพิ่มสมาชิก" picker (MUI Autocomplete over the active-user directory minus current members, searchable by name, nickname or position) adds MEMBER by default. Roles change inline. Removal uses × (the FR-404 flow from M3). L/M only (Me → FORBIDDEN, W → 404).
- *Rationale:* P1.

**M2-14 · missing-detail · FR-401, §6.2 projects · M2**
- *Problem:* Project fields that the SPEC leaves open.
- *Decision:* Name is required and not unique. Code is optional and not unique. Colour is chosen from the palette (default `#2F5597`). Certainty defaults to `CONFIRMED`. `certainty_note` is an optional field, shown when TENTATIVE (it exists in the DDL). LEAD is optional (M2-06). The create dialog is opened from the sidebar "+" (manager).
- *Rationale:* The DDL already has these columns.

**M2-15 · missing-detail · §3.2, §11.2 · M2**
- *Problem:* The authz matrix rows for M2 need expected outcomes.
- *Decision:* Use the table in §6 of this report, including the archived and deactivated variants. Tests are written before the actions and fail with "not implemented" until the backend lands.
- *Rationale:* The DoD requires it.

**M2-16 · risk · §3.4 (404), AC in §12 M2 ("URL ตรง = 404") · M2**
- *Problem:* If `notFound()` is thrown after streaming has started (inside a Suspense boundary), the HTTP status can remain 200 ([likely]), which would fail an e2e that asserts 404.
- *Decision:* Authz lookups run at the **top of the page component or layout, before any Suspense boundary**, and route handlers return real 404s. The e2e asserts both the status and the Thai not-found UI.
- *Rationale:* Avoids a subtle flaky failure.

**M2-17 · risk · §3.3 masking, §11.2 · M2**
- *Problem:* Leaks can happen through list endpoints (`/api/nav`, `/api/people/options`, client list), not only through detail pages.
- *Decision:* Starting in M2, add JSON leak tests: a worker (Peter) calls every list endpoint, and `JSON.stringify(res).includes('POS Upgrade') === false`.
- *Rationale:* Cheap tests with a high payoff.

### 3.4 M3 — Tasks

**M3-01 · cross-milestone-dependency · AC-603 · M3→M6**
- *Problem:* "กลับมาครบ พร้อมแผนเดิม" needs allocations.
- *Decision:* M3 verifies that the tree and assignments are restored. Soft delete touches only `tasks` rows, so assignments are never deleted. M6 extends the same integration and e2e test so the allocations reappear, without a data change, because loads join through `t.deleted_at is null`.
- *Rationale:* The mechanism is correct by construction; the test is completed when allocations exist.

**M3-02 · cross-milestone-dependency · FR-610, BR-31 · M3 (M6 verifies)**
- *Problem:* Moving assignees and plans to a new subtask.
- *Decision:* "เพิ่มงานย่อย" on a task with assignments creates the child and runs `UPDATE task_assignments SET task_id=:child WHERE task_id=:parent AND deleted_at IS NULL` in **one transaction**; allocations follow through `task_assignment_id`, so there is no allocation code. Toast: "ย้ายผู้รับผิดชอบ N คน (และแผน) ไปที่ '<child>' · เลิกทำ". **Undo reverses both parts**: it moves the assignments back and soft-deletes the new child. Undoing only one part would leave the parent with children *and* assignments, breaking BR-31.
- *Rationale:* Minimal and invariant-preserving.

**M3-03 · ambiguity · BR-31, FR-603, FR-604 · M3**
- *Problem:* What happens when an **existing** task is indented or dragged under a parent that has assignments, possibly with the same user on both?
- *Decision:* If the moving task has no assignments, move the parent's assignments to it (as in M3-02). If it has assignments, move the parent's users that it doesn't have. If **the same user is on both**, reject with "ย้ายไม่ได้: <ชื่อ> ถูกมอบหมายทั้งงานแม่และงานนี้ — ยกเลิกการมอบหมายที่งานแม่ก่อน". There is no plan merging in the MVP. Outdenting (Shift+Tab) may leave the old parent as a leaf without assignees, which shows "รอมอบหมาย".
- *Rationale:* Avoids merging plans (and later the WEEK/DAY conflicts of M7).

**M3-04 · missing-detail · BR-30, FR-603, AC-602, BR-33 · M3**
- *Problem:* Depth limits on indent and move.
- *Decision:* The server enforces `newDepth + subtreeHeight ≤ 2` and updates descendants' `depth` in the same transaction. Tab that would exceed the limit is a **silent no-op** (AC-602 "ไม่เกิดอะไร"). Tab on the first sibling (no row above at the same level) is also a no-op. Moves across projects are rejected (BR-33).
- *Rationale:* Literal AC.

**M3-05 · missing-detail · BR-32, FR-609, FR-614, §7.5 · M3**
- *Problem:* What soft delete and restore cover.
- *Decision:* Soft-delete only the `tasks` rows of the subtree with one `deleted_batch`; assignments and allocations stay untouched and are hidden by joins. Multi-select deletion uses **one** batch and one undo entry. Toast: "ลบ 'X' และงานย่อย 3 งานแล้ว · เลิกทำ", or "ลบ N งาน…". Restore checks the 30-day window, authz (`edit`), that the project is neither archived nor deleted, and that the parent is alive; otherwise it returns `CONFLICT` "งานแม่ถูกลบอยู่".
- *Rationale:* The simplest scheme that meets "ไม่กู้ของที่ถูกลบมาก่อนหน้า".

**M3-06 · ambiguity · FR-605 × chip, §4.8 "การลบ", §7.5 · M3**
- *Problem:* Removing an assignee, re-adding them, then undoing the old removal.
- *Decision:* Removal soft-deletes the assignment with a batch. Re-adding the same user later creates a **new** assignment (empty plan); it doesn't resurrect the old one. Undoing the old removal afterwards conflicts with the unique active `(task_id, user_id)` index, so skip that row and show "มีการมอบหมายใหม่แล้ว — กู้คืนแผนเดิมไม่ได้". 23505 maps to CONFLICT.
- *Rationale:* Predictable, with no surprise plan resurrection.

**M3-07 · ambiguity · §3.2, BR-60, FR-605, BR-31 · M3**
- *Problem:* Who can assign whom, and on which tasks.
- *Decision:* For MEMBER, the picker lists **project members** only. For L/M it lists all active users, with the hint "จะถูกเพิ่มเป็นสมาชิกโปรเจค". The server re-checks: Me assigning a non-member → FORBIDDEN; L/M assignment adds MEMBER in the same transaction and logs audit for both. Parent (non-leaf) tasks can't be assigned; their chip area shows the union of the children's assignees, read-only. Deactivated users are excluded (AC-203, M3 part).
- *Rationale:* Literal §3.2 and BR.

**M3-08 · cross-milestone-dependency · FR-601 milestone, FR-613 group-by-milestone, FR-614 bulk milestone, FR-703 · M3→M8**
- *Decision:* Omit these entirely in M3: no field, no option, no stub. M8's migration adds the `milestones` table and `tasks.milestone_id`.
- *Rationale:* The `milestones` table doesn't exist yet.

**M3-09 · cross-milestone-dependency · BR-50/52, FR-607 · M3→M6**
- *Decision:* Completing a task sets `completed_on = serverToday()`, a Bangkok ISO date (requires X-01 and X-02), and `completed_by`. M3 toast: "ติ๊กเสร็จแล้ว · เลิกทำ". M6 adds "ปลดภาระ X วัน ในอีก N สัปดาห์", computed from the task's allocations with `week_start > completed_week`.
- *Rationale:* The number needs allocations.

**M3-10 · ambiguity · FR-607, FR-608, P7 · M3**
- *Problem:* Parent-completion semantics and the "show completed" filter.
- *Decision:* Completing a parent completes only the parent unless the user clicks "ติ๊กทั้งหมด" in the FR-608 toast, which completes all children with one undo entry. Completing every child does **not** auto-complete the parent (P7). Un-completing doesn't cascade. With "แสดงงานที่เสร็จแล้ว" off, hide completed tasks whose **whole subtree** is complete; a completed parent with an open child stays visible, struck through, so the child remains reachable. The preference is stored in `user_preferences`.
- *Rationale:* No automation, and nothing becomes unreachable.

**M3-11 · missing-detail · §7.5, CLAUDE (Cmd+Z) · M3**
- *Problem:* Which M3 operations get undo entries.
- *Decision:* Undo covers delete, complete/uncomplete, indent/outdent/move, assign/unassign, add-subtask with move, and bulk operations. It does not cover text edits of name, notes or dates: the fields keep their native undo while focused, and once committed there is no global undo.
- *Rationale:* Matches the P2 intent without an undo for every keystroke.

**M3-12 · cross-milestone-dependency · §12 M3 ("/my เบื้องต้น (ยังไม่มีภาระ)"), FR-1009 (M9), §8.1 count · M3→M9**
- *Problem:* What `/my` shows before allocations exist.
- *Decision:* M3 `/my` lists **my open assigned leaf tasks in non-archived projects, grouped by project**, sorted by due date then position. Tasks can be ticked done and opening one opens the task panel. The sidebar count "งานของฉัน N" is the number of those tasks. M9 replaces the grouping with the FR-1009 plan buckets (F-03).
- *Rationale:* Without allocations every task would be "ยังไม่วางแผน", which is useless.

**M3-13 · ambiguity · FR-613, FR-603/604 · M3**
- *Problem:* Grouping with multiple assignees, and which operations are allowed in grouped or sorted views.
- *Decision:* A task with several assignees appears under **each** assignee's group; tasks without assignees go to "รอมอบหมาย". Drag, Tab and Shift+Tab are enabled **only** in "ไม่จัดกลุ่ม + ลำดับเอง", and disabled with a tooltip in grouped or due-date-sorted views. The group-by and sort choice persist in `user_preferences`.
- *Rationale:* Tree operations are ambiguous inside groups.

**M3-14 · missing-detail · FR-602, P1 · M3**
- *Problem:* Quick-add details.
- *Decision:* Enter in "+ เพิ่มงาน…" creates a sibling at the same level (optimistic, with a temporary id from X-12, not `randomUUID`) and keeps the cursor in a new empty quick-add row. An empty name is a no-op. The name is trimmed, 1–500 characters (DDL check `length(trim(name))>0`). Multi-line paste does **not** split into tasks (not in the SPEC). Position is the end of the siblings, under the scope lock (X-09).
- *Rationale:* Meets AC-601 exactly.

**M3-15 · missing-detail · FR-611, FR-601, BR-36 · M3**
- *Problem:* Task panel contents and behaviour.
- *Decision:* Panel width about 440 px, closed with Esc, URL `?task=<id>`. A task that isn't visible shows "ไม่พบงาน" and its API returns 404. Fields:
  - name;
  - notes (plain multiline text);
  - start and due dates (DatePicker, X-21; due ≥ start as in the DDL check);
  - certainty override as a three-state control: ตามต้นทาง (null) · แน่นอน · อาจไม่ทำ, with the BR-36 source label;
  - assignees;
  - M6 adds the per-assignee "วางแผน" button, M8 adds the milestone.
- *Rationale:* Complete for M3.

**M3-16 · missing-detail · §8.6 · M3**
- *Problem:* The keyboard map for the task list.
- *Decision:* Enter moves to the next row or creates one; Tab and Shift+Tab indent and outdent; Cmd+Enter toggles done; Delete deletes the selected rows; Space opens the panel; Esc closes it; `N` focuses quick-add in a project context (a no-op on `/my` until the M10 palette command); Shift-click and Cmd-click select (FR-614). The `?` dialog is data-driven from `th.shortcuts`, and later milestones append to it.
- *Rationale:* §8.6 compliance.

**M3-17 · risk · FR-604 (M3), FR-503 (M4) · M3**
- *Problem:* Which drag-and-drop library, and how to share tree logic between the task list and the sidebar.
- *Decision:* Use `@dnd-kit/core` 6.3.1 with `@dnd-kit/sortable` 10.0.0 (stable), not `@dnd-kit/react` 0.5.0 (pre-1.0) (E-20). Put the flattened-tree "projection" logic in **pure helpers** in `src/lib/tree/` (flatten, project the drop depth within `maxDepth`, compute the parent and neighbours, fractional key), unit-tested in M3 and reused by the M4 sidebar (`maxDepth` 2 there instead of 9 here → parameter). Keyboard alternatives come from Tab/Shift+Tab and a "ย้ายไป…" menu.
- *Rationale:* Written once, tested once.

**M3-18 · missing-detail · FR-409 progress · M3**
- *Problem:* What "task เสร็จ/ทั้งหมด" counts.
- *Decision:* Count **all non-deleted tasks at every depth**. Completed means `completed_on is not null`.
- *Rationale:* The simplest reading; matches Asana.

**M3-19 · missing-detail · §9 (20k tasks), NFR · M3**
- *Problem:* Loading and rendering large task lists.
- *Decision:* `GET /api/projects/:id/tasks` returns a flat list of `{id, parentId, depth, name, position, startDate, dueDate, certaintyOverride, completedOn, assigneeIds, hasChildren}` plus the project certainty; the client builds the tree. Use TanStack Virtual when there are more than 200 rows. Mutations update optimistically and invalidate on settle.
- *Rationale:* Per-project volume is small; a single read is simplest.

### 3.5 M4 — Notion-style pages

**M4-01 · cross-milestone-dependency · FR-402, §12 M4 · M4**
- *Problem:* Projects created during M2–M3 have no charter.
- *Decision:* From M4, `createProject` creates the charter in the same transaction. M4 also ships an idempotent `ensureProjectCharters()`, called by bootstrap and seed-golden, that creates a charter for every project without one. Production has no data from before M4, but the step is harmless there.
- *Rationale:* Dev and staging databases stay consistent.

**M4-02 · cross-milestone-dependency · FR-1102…1105, §12 M4 ("ค้นหาหน้าใน Cmd+K"), M10 · M4→M10**
- *Problem:* The palette first appears in M4 but is only completed in M10.
- *Decision:* M4 builds the palette shell: `cmdk` inside an MUI `Dialog`, global Cmd/Ctrl+K (X-22), and the sidebar button "🔍 ค้นหา… ⌘K". `GET /api/search?q=` returns `{ pages: [...] }` in a response type that is extensible by category. Page results match title and `content_text` with `ILIKE` and are ranked by X-23. Filters: **PROJECT pages only for members or managers; deleted pages excluded**. M10 adds projects, tasks, people, clients and the quick commands.
- *Rationale:* Built once and extended later.

**M4-03 · ambiguity · FR-540…543, §7.7 · M4**
- *Problem:* The lock protocol, takeover, and the displaced editor's pending save.
- *Decision:*
  - **Lease:** a `page_locks` row, acquired and renewed with `INSERT … ON CONFLICT (page_id) DO UPDATE … WHERE page_locks.user_id = excluded.user_id OR page_locks.expires_at < now() RETURNING …` (0 rows means someone else holds it; E-22). Expiry is `now()+2 min`. Heartbeat every 30 s and immediately on visibility regain. Release with `DELETE` using `fetch(…, {keepalive:true})` on `pagehide` or route change. **Takeover** is an unconditional upsert (`?takeover=1`), allowed for anyone with edit permission.
  - **Save:** `savePage({ pageId, baseVersion, content?, title?, icon? })` is accepted **iff `pages.version = baseVersion`** and the caller has edit permission. The lease is **not** required: it coordinates the UI, while the version guards integrity.
  - The response includes `leaseHolder`; if it isn't the caller, the client flushes, switches to read-only and shows "<ชื่อ> ยึดการแก้ไขแล้ว".
  - The taker's editor becomes editable only after the lease is acquired **and** a fresh content fetch. Heartbeat responses carry the current version; if it changed and there are no local unsaved edits, the editor reloads the content silently.
  - The rare remaining collision is FR-543: banner "มีการแก้ไขใหม่กว่า" plus a reload button, and the save never overwrites.
  - Two tabs of the same user share the lease; the version protects them.
- *Rationale:* Meets FR-542 ("บันทึกของค้างให้แล้ว") without extra columns; the SQL is verified.

**M4-04 · ambiguity · FR-510 vs FR-540 · M4**
- *Problem:* `pages.locked` (manager's read-only protection) and `page_locks` (edit lease) are easily confused.
- *Decision:* In code and i18n, FR-510 is **"protected"** (`pages.locked` → `isProtected` in services, UI "ล็อกหน้า 🔒") and FR-540 is the **"edit lease"** (`services/pageLease.ts`, UI "กำลังแก้"). The route `/api/pages/[id]/lock` keeps its SPEC name for the lease.
- *Rationale:* Prevents cross-wiring bugs.

**M4-05 · ambiguity · FR-510, §3.2 · M4**
- *Problem:* Does a wiki lock inherit to sub-pages, and what exactly does it block?
- *Decision:* A page is **effectively locked** if it or any ancestor is locked (recursive CTE, depth ≤ 10). A worker on an effectively locked page is read-only and cannot rename, set the icon or cover, move it (into or out of a locked subtree), delete it, add sub-pages, or upload files. A worker cannot delete an unlocked page whose subtree contains a locked page. Managers are unaffected. Only WORKSPACE pages are lockable. Locking and unlocking are audited.
- *Rationale:* Policy pages ("นโยบายบริษัท") usually have children, so a lock without inheritance is pointless.

**M4-06 · ambiguity · §3.2 wiki row ("สร้าง/แก้" but not "ลบ") · M4**
- *Problem:* Can workers delete wiki pages?
- *Decision:* "แก้" includes **delete, with undo**, for any user, except effectively locked pages and subtrees. Managers can delete anything.
- *Rationale:* P2; undo covers mistakes.

**M4-07 · missing-detail · FR-502, FR-503, DDL `depth between 0 and 9` · M4**
- *Problem:* Depth rules for creating and moving page trees.
- *Decision:* Root pages have depth 0 and the maximum is 9, which is 10 levels and consistent with the DDL. Creating under a depth-9 page is rejected ("ซ้อนได้สูงสุด 10 ชั้น"), and `/หน้า` is disabled there. A move must stay within the same `(space, project_id)`, must not target the page's own subtree, and must satisfy `newParentDepth + 1 + subtreeHeight ≤ 9`. Descendant depths are updated with a recursive CTE in the same transaction.
- *Rationale:* The "10 levels" ambiguity resolves consistently.

**M4-08 · missing-detail · FR-508 · M4**
- *Problem:* Duplicating a page with its sub-pages and files.
- *Decision:* Deep copy in one transaction:
  - new ids for the whole subtree;
  - the root copy is titled "<ชื่อ> (สำเนา)" and placed right after the original;
  - content is copied with `subpage.props.pageId` **remapped** from old to new ids, while mentions stay unchanged;
  - **files are not copied**: the content keeps referencing the same file ids, which works because file authz is by `project_id` (M4-11) and the copy stays in the same space and project;
  - **`is_charter=false`** on copies, since the `one_charter_per_project` unique index would otherwise fail;
  - `locked=false`, `version=1`, same `cover_file_id`;
  - depth check as in M4-07;
  - one audit row.
- *Rationale:* Correct and cheap.

**M4-09 · ambiguity · FR-402, FR-507, FR-509, P5 · M4**
- *Problem:* What makes a page the charter, and can it be deleted?
- *Decision:* `is_charter=true` only for the page created by FR-402; choosing the Charter template elsewhere creates a normal page. The charter **cannot be deleted**: the menu item is hidden and the server returns FORBIDDEN. It can be renamed, edited and reordered among the roots. At creation, the charter table cells for ลูกค้า, Project Lead and ความแน่นอน are pre-filled as static text; ช่วงเวลา is left blank.
- *Rationale:* Guarantees P5's "มี charter ทันที" and avoids a re-create flow.

**M4-10 · missing-detail · FR-507, Appendix B · M4**
- *Problem:* When templates are applied, and in what data shape.
- *Decision:* "+" creates a **blank** page immediately (P1). A blank page (empty title and content) shows a template row: "ว่าง · Project Charter · บันทึกการประชุม · คู่มือ/SOP". Choosing one replaces the content, title and icon; meeting notes get the title "บันทึกการประชุม — <formatThaiDate(today)>" with 📝, and SOP gets 📘. Templates are BlockNote `PartialBlock[]` builders in `src/i18n/templates.th.ts`. The server stores them as-is (BlockNote fills ids on the first load and save), and `content_text` extraction accepts partial blocks. Tables use a header row, which needs `tables.headers:true` (M4-15).
- *Rationale:* P1, with no extra dialog.

**M4-11 · ambiguity · §7.6 (upload checks page edit; download checks page/project), `files.page_id on delete set null` · M4**
- *Problem:* Which object download authorization follows.
- *Decision:* Authorize downloads by **`files.project_id`**: null (wiki) → any active logged-in user; otherwise a manager or a member of that project. The state of the originating page is ignored, because duplicates can share files. Uploads require **edit** permission on the target page (including the wiki lock) and set `project_id` from the page. `page_id` is kept for bookkeeping only. AC-503: a non-member gets 404.
- *Rationale:* Pages can't move across projects (FR-503), so `project_id` is stable.

**M4-12 · risk · §7.6 allow-list, E-15 · M4**
- *Problem:* Magic-byte detection doesn't map cleanly to the SPEC allow-list.
- *Decision:* A decision matrix (§5.6) on the detected type plus the client extension:
  - `png`, `jpg`, `gif`, `webp` → IMAGE, ≤ `MAX_IMAGE_MB`;
  - `pdf`, `docx`, `xlsx`, `pptx` → ATTACHMENT;
  - `zip` → ATTACHMENT (keeping the client extension if it is `docx`, `xlsx` or `pptx`);
  - `cfb` → ATTACHMENT only when the extension is `doc`, `xls` or `ppt`, with the MIME mapped from the extension;
  - `undefined` or `xml` → ATTACHMENT only when the extension is `csv`, `txt` or `svg`, and the text must decode as UTF-8 or windows-874 with no NUL in the first 8 KB;
  - everything else → 415 "ไม่รองรับไฟล์ชนิดนี้".

  SVG is **only** an attachment (§7.6). It is served with `Content-Disposition: attachment` and `Content-Security-Policy: sandbox`. The kind comes from the detected type, not the client's intent.
- *Rationale:* Verified library behaviour; the SPEC notes SVG as "attachment only" even though its attachment list omits it.

**M4-13 · missing-detail · §7.6 headers, storage · M4**
- *Problem:* Download headers for Thai filenames, name handling and storage writes.
- *Decision:*
  - `Content-Disposition: attachment; filename="<ascii-fallback>"; filename*=UTF-8''<pct-encoded>` (RFC 6266/5987).
  - `original_name` is sanitized: path separators and control characters stripped, at most 200 characters.
  - The storage key is `yyyy/mm/<uuid>.<ext>`, where the year and month come from `serverToday()` and the extension from detection.
  - Write to a temporary file, then `rename` (atomic), with `mkdir -p`.
  - Development uses `UPLOAD_DIR=./uploads`, which is gitignored.
  - Downloads use `fs.createReadStream` → `Readable.toWeb` with `Content-Length` and `nosniff`. Images get `inline` and `Cache-Control: private, max-age=3600`.
- *Rationale:* Thai filenames otherwise arrive garbled.

**M4-14 · risk · FR-524, AC-502 · M4**
- *Problem:* When copying from Excel, the clipboard can carry a **bitmap and an HTML table** ([likely]). BlockNote's default handler prefers Markdown in `text/plain` (`prioritizeMarkdownOverHTML` is true by default; E-19).
- *Decision:* A custom `pasteHandler`:
  1. If `text/html` contains `<table` → handle it as a table (our HTML→table builder, or `defaultPasteHandler({prioritizeMarkdownOverHTML:false})`), **even if files are present**.
  2. Else, if `text/plain` is TSV (at least 2 lines, at least 2 columns, consistent tab counts) → build a table block.
  3. Else, if there are files → upload through `uploadFile`.
  4. Else → default.

  The e2e synthesizes a `DataTransfer` with both HTML and PNG and expects a 4×3 table.
- *Rationale:* AC-502 must not produce an image.

**M4-15 · risk · FR-523 · M4**
- *Problem:* BlockNote table features default to off (E-19).
- *Decision:* Create the editor with `tables: { headers: true, cellBackgroundColor: true, cellTextColor: true, splitCells: false }`. Column resizing is built in.
- *Rationale:* Required for FR-523 (header row, cell background).

**M4-16 · risk · FR-520, §8.8, CLAUDE i18n · M4**
- *Problem:* BlockNote has no Thai locale (E-19).
- *Decision:* Keep a Thai `dictionary` object, typed against BlockNote's `Dictionary`, in `src/i18n/th.ts` (namespace `blocknote`), starting from a copy of the `en` keys. Slash items map `getDefaultReactSlashMenuItems(editor)` to Thai titles, with the original English titles and extra words (e.g. "table") as `aliases`. The `/หน้า` and `/รูป` custom items are added. The typecheck guarantees completeness.
- *Rationale:* All UI text stays in `th.ts`.

**M4-17 · risk · §7.6 (no external images), §9 offline/CSP · M4**
- *Problem:* External image URLs can enter through the file panel or pasted HTML.
- *Decision:* Replace the default file panel with an **Upload-only** panel (`filePanel={false}` + `FilePanelController` + `UploadTab`; E-19), removing the Embed-URL tab. Pasted HTML `<img src="http(s)://…">` is turned into a link paragraph. The server never fetches URLs (SSRF, offline). CSP `img-src 'self' blob: data:`.
- *Rationale:* Follows the SPEC fallback ("ถ้าทำไม่ได้ให้แทรกเป็นลิงก์").

**M4-18 · missing-detail · FR-527 ("การ์ดมีชื่อไฟล์และขนาด") · M4**
- *Problem:* The default BlockNote file block shows the name but not the size ([likely]).
- *Decision:* `uploadFile` returns **props** (`{ url: '/api/files/<id>', name }`, supported, E-19). A custom file-block render, or a custom `attachment` block with a `sizeBytes` prop, shows the icon, name, human-readable size and download action. r3 decides which.
- *Rationale:* Required by FR-527.

**M4-19 · missing-detail · §6.4 (`content_text` built server-side), FR-531 · M4**
- *Problem:* Text extraction for search and size limits.
- *Decision:* A pure walker in `src/lib/editor/content-text.ts` collects inline text, link text, **table cell text** and children, joined with spaces. Mentions and sub-page cards contribute nothing (they are resolved live). Page JSON is capped at 2 MB (zod), and `content_text` at 200k characters. Unit tests use fixtures for all block types, including partial blocks.
- *Rationale:* Required by FR-1104 and FR-1105.

**M4-20 · risk / deviation candidate · FR-531 ("…และเมื่อออกจากหน้า"), §7.3 (writes via actions) · M4**
- *Problem:* Saving when the user leaves the page. A Server Action can't run from `pagehide`, and `fetch keepalive` bodies are limited to about 64 KB ([likely], Fetch spec).
- *Decision:*
  - In-app navigation flushes the pending save and awaits it before navigating.
  - On `pagehide`, if the pending payload is ≤ 60 KB, send `fetch('/api/pages/:id/content', { method:'PUT', keepalive:true })`, a route handler that reuses the same service (record a **Deviation**: a write through a route).
  - Otherwise, a `beforeunload` prompt appears whenever unsaved changes exist.
  - Autosave still runs 800 ms after typing stops.
- *Rationale:* Best effort within browser limits.

**M4-21 · risk · FR-541 · M4**
- *Problem:* Background tabs throttle timers (Chrome runs chained timers at most about once a minute in hidden tabs; Safari may freeze tabs) ([likely]).
- *Decision:* On visibility regain, send a heartbeat immediately. If the lease was lost and **taken** by someone else → read-only and a banner. If it expired but is free and the server version equals the local base → re-acquire silently. Otherwise → reload prompt. Expiry stays at 2 minutes.
- *Rationale:* Graceful recovery.

**M4-22 · missing-detail · FR-529, §7.7 (live names), §3 masking · M4**
- *Problem:* Mentions can point at pages the reader can't see.
- *Decision:* `@` lists users from the directory (X-17) and pages the viewer can see. Chips resolve live through `GET /api/pages/titles?ids=`, which returns `{id, visible:false}` for invisible pages (chip "หน้าที่คุณไม่มีสิทธิ์เข้าถึง"; for example, a PROJECT page mentioned in a wiki page) and `{id, deleted:true}` for deleted ones ("หน้านี้ถูกลบแล้ว"). User chips show the current display name, or "(ปิดใช้งาน)". Stored content keeps **ids only**.
- *Rationale:* Masking at the server.

**M4-23 · missing-detail · FR-503, FR-504, §9 (5,000 pages) · M4**
- *Problem:* Loading the sidebar tree and breadcrumbs efficiently.
- *Decision:* Load lazily with `GET /api/pages/tree?space=&projectId=&parentId=` → `[{id,title,icon,locked,hasChildren,position}]`, ordered by `position` (COLLATE "C" via the column) and `id`. Expanded node ids are stored in `user_preferences.sidebar.expanded`. Breadcrumbs come from a recursive CTE over ancestors (≤ 10).
- *Rationale:* Keeps sidebar payloads small at 5k pages.

**M4-24 · missing-detail · FR-504 · M4**
- *Problem:* The page icon picker and the cover image.
- *Decision:* The icon picker is a curated grid of about 60 emoji plus "ลบไอคอน". No new dependency: reusing `emoji-mart` directly would make a transitive dependency direct; E-19 shows its data is bundled if the owner prefers it. The cover is an image upload (kind IMAGE) → `cover_file_id`, with "ลบรูปปก".
- *Rationale:* Minimal.

**M4-25 · risk · owner decision (MUI + @blocknote/mantine) · M4**
- *Problem:* Two UI systems in one app: Mantine's global CSS could leak into MUI screens.
- *Decision:* Pin `@blocknote/*` 0.55.x and `@mantine/core`/`@mantine/hooks` 9.x (peer range verified, E-19). Import the BlockNote/Mantine CSS **only inside the editor chunk** (`next/dynamic`, `ssr:false`). Map MUI palette variables to BlockNote's CSS variables and sync dark mode through the `theme` prop. Visually regression-check an MUI page after the editor has loaded in the same session ([likely] risk). r3 has details.
- *Rationale:* Contains style leakage.

**M4-26 · missing-detail · FR-509, §7.7 · M4**
- *Problem:* Side effects of deleting and restoring pages.
- *Decision:* Soft-delete the subtree with one batch; files remain. Delete the lease rows of the deleted pages. Cards in the parent show "หน้านี้ถูกลบแล้ว". An editor saving a deleted page gets 404 and a banner "หน้านี้ถูกลบแล้ว". Restore is possible within 30 days if the parent is alive. The charter can't be deleted (M4-09).
- *Rationale:* Consistent with tasks (M3-05).

**M4-27 · missing-detail · FR-506, AC-504 · M4**
- *Problem:* The `/หน้า` slash command flow.
- *Decision:* `/หน้า` (aliases: page, subpage) calls the `createPage(parentId=current)` action, then inserts a `subpage` block at the cursor and invalidates the tree query. The user **stays** on the current page, and the new card is clickable. If creation fails, a toast appears and nothing is inserted.
- *Rationale:* Literal AC-504.

**M4-28 · cross-milestone-dependency · FR-407 (M2), §7.6 · M4**
- *Problem:* Permanent project delete must also remove the project's files from disk.
- *Decision:* M4 extends the M2 `deleteProjectPermanently` service to collect storage keys before the cascade and unlink them after commit (best-effort, logged). Integration test: the files are gone from disk after deletion.
- *Rationale:* `UPLOAD_DIR` would otherwise leak disk space.

### 3.6 M5 — Calendar, holidays, leave, capacity

**M5-01 · cross-milestone-dependency · FR-906 (overload → M9 per §12) · M5→M9**
- *Decision:* After saving leave (own, or someone else's as manager), show an impact panel with one line per affected week, e.g. "สัปดาห์ 5 ต.ค.: 5.0 → 3.0 วัน". Before and after are computed with `capacity.ts` over holidays and the other leave. "ไม่กระทบ capacity" is shown when there is no change. M9 adds "overload ใหม่" lines with links (BR-42).
- *Rationale:* Split explicitly in §12.

**M5-02 · cross-milestone-dependency · FR-907, FR-705 · M5→M8**
- *Decision:* The M5 calendar shows leave and holidays. M8 adds ◆ for visible projects (the calendar API gains a `milestones` field).

**M5-03 · cross-milestone-dependency · FR-902, §10.4 step 2 · M5**
- *Decision:* The `leave_types` table arrives in M5, and bootstrap is extended to seed ลาพักร้อน, ลาป่วย, ลากิจ and อบรม/สัมมนา with distinct accessible colours and ascending positions, only when the table is empty.

**M5-04 · spec-inconsistency · BR-10 code vs BR-13 · M5**
- *Problem:* The `dayCapacityCd` snippet ignores deactivation.
- *Decision:* Signature `dayCapacityCd(schedule, holidays, timeOff, d, deactivatedOn?: ISODate|null)`, returning 0 when `deactivatedOn && d >= deactivatedOn`. `standardDayCapacityCd(schedule, d)` (BR-41) ignores holidays, leave and deactivation. Tests: the whole §5.2 table plus BR-12, BR-13, part-time half-days and the fraction rule. Record a Decision.
- *Rationale:* Implements BR-13 without contradicting BR-10.

**M5-05 · spec-inconsistency · FR-903 (half days), DDL exclusion constraint · M5**
- *Problem:* Half-day AM and half-day PM on the same day are **rejected** by the constraint (E-13).
- *Decision:* Keep the DDL. Before inserting, run an overlap query so FR-905 can name the conflicting entry: "ทับกับ '<ประเภท> <ช่วงวันที่>' — ถ้าลาทั้งวันให้แก้รายการเดิมเป็นเต็มวัน". Map 23P01 to `OVERLAP` as a backstop.
- *Rationale:* The simplest option consistent with FR-905 and the DDL.

**M5-06 · ambiguity · FR-903, BR-10, BR-12 · M5**
- *Problem:* Leave on non-working days or holidays, and half days on part-time days.
- *Decision:* Allow **any** range: no validation beyond the DDL. Weekends and holidays inside a range simply don't reduce capacity (BR-10, BR-12). A half day subtracts 50 cd even on a 0.5 part-time day (BR-10 as written, giving 0). The impact panel shows "ไม่กระทบ capacity" where applicable.
- *Rationale:* The calculation already handles these cases; P1.

**M5-07 · ambiguity · FR-903, FR-904, FR-909 · M5**
- *Problem:* Editing or deleting past leave.
- *Decision:* Allowed without date limits, for oneself and by a manager for anyone; changes are audited. There is no approval workflow (FR-904). Retroactive sick leave is normal.
- *Rationale:* No approval exists.

**M5-08 · missing-detail · FR-903, FR-908, §3.2 · M5**
- *Problem:* Entry points and defaults for recording leave.
- *Decision:* A "แจ้งลา" dialog is reachable from the calendar, the user menu and (from M9) the person page; M10 adds a palette command. Range selection on the calendar pre-fills the dates. Managers get a "พนักงาน" selector (default: self). The type defaults to the first active type by position. Fields: dates (two pickers), half day ("เต็มวัน/เช้า/บ่าย", enabled only when start equals end), note. The mobile layout is full-screen.
- *Rationale:* P1, and mobile scope.

**M5-09 · missing-detail · §3.3 masking, FR-907 · M5 (first masking consumer)**
- *Problem:* Which leave entries the calendar may show, and in how much detail.
- *Decision:* Return leave for `visibleUserIds(viewer)` (X-18). For non-manager viewers, **other** people's entries are serialized as `{userId, start, end, half, label:'ลา'}`, **without** `leaveTypeId`, colour or note, and rendered in a neutral colour. The viewer's own entries and a manager's view are complete. Masking leak test: `JSON.stringify(body)` must not contain another user's note text or leave-type name.
- *Rationale:* Masking starts here, not in M9.

**M5-10 · missing-detail · FR-901, §10.4 step 4, D9 · M5**
- *Problem:* CSV format, encoding and duplicate handling.
- *Decision:*
  - Encoding: strict UTF-8 (BOM allowed), falling back to **windows-874** (E-17).
  - Optional header row `date,name` (case-insensitive), RFC 4180 quoting (names may contain commas), blank lines ignored.
  - Dates must be **`YYYY-MM-DD` Gregorian**; other formats are reported with line numbers.
  - Duplicate dates within the file are an error. Existing dates are **updated** (upsert on `date`).
  - The whole import is one transaction (all or nothing), with a **preview step** (rows + errors) before import. Result: "เพิ่ม N · อัปเดต M". Maximum 500 rows.
  - A sample CSV is downloadable from the page.
  - The parser in `src/lib/csv/holidays.ts` is pure and tested, and is shared with `scripts/import-holidays.ts`.
- *Rationale:* Thai Excel defaults to Windows-874, and the ISO-only rule prevents B.E./C.E. ambiguity.

**M5-11 · missing-detail · FR-901, FR-902, P2 · M5**
- *Problem:* CRUD and undo for holidays and leave types.
- *Decision:* Holidays: create, edit (date is unique → "มีวันหยุดวันนี้แล้ว") and **hard delete with an undo toast** that re-inserts the same id, date and name. Leave types: edit name, colour and order (up/down buttons); delete when unused, otherwise **archive** (hidden from pickers, existing entries keep their label); unarchive is allowed. All of this is manager-only.
- *Rationale:* The DDL has no soft delete for these tables.

**M5-12 · missing-detail · FR-907, FR-908, BR-05, §9 mobile · M5**
- *Problem:* How to build the month calendar.
- *Decision:* A custom CSS-grid month view, with **no calendar library** (none is in the stack): Monday-first (BR-05), 6 rows, a per-person bar per day cell, with "+N" when there are more than 4. Holidays are grey with a name tooltip, and half days are marked "เช้า/บ่าย". It is keyboard-accessible, with month navigation, and defaults to the month of `serverToday()`. Below 600 px it becomes an agenda list.
- *Rationale:* Avoids a new dependency (FullCalendar).

**M5-13 · missing-detail · FR-907 · M5**
- *Problem:* The calendar API shape.
- *Decision:* `GET /api/calendar?from=&to=` (at most 6 weeks) → `{ holidays:[{date,name}], timeOff:[{id?, userId, start, end, half, label, leaveTypeId?, color?, note?}] }`, masked as in M5-09. M8 adds `milestones`. All dates are ISO strings.

**M5-14 · missing-detail · §5.2, §11.1 · M5**
- *Problem:* How capacity code is split between domain and server.
- *Decision:* `src/domain/capacity.ts` is pure: `dayCapacityCd`, `weekCapacityCd`, `standardDayCapacityCd`, `capacityByPeriod`. `src/server/services/capacity.ts` loads schedules, holidays and leave for `[from,to)` for a set of users and calls the domain. It is used by M5's impact panel, M6's footer and `f`/`h` keys, and M9's workload. Coverage is ≥ 95%.

**M5-15 · risk · FR-909, §7.5, E-13 · M5**
- *Problem:* Undoing a leave deletion can conflict with leave recorded afterwards.
- *Decision:* Restore re-checks overlap. On conflict (or a 23P01 backstop): toast "กู้คืนไม่ได้ เพราะทับกับวันลาที่บันทึกภายหลัง".

**M5-16 · missing-detail · §12 M5 e2e · M5**
- *Decision:* `e2e/m5-calendar.spec.ts` with the clock pinned at 2026-09-30:
  - record own leave → it appears on the calendar and the impact panel shows 5.0 → 3.0 for Peter's week of 5 Oct (F3 data);
  - an overlapping entry is rejected, naming the conflicting entry;
  - a CSV import (UTF-8 and windows-874 fixture files) creates holidays;
  - a worker sees another person's leave only as "ลา".

### 3.7 Forward notes for M6+ caused by early decisions

**F-01 · ambiguity · §11.3 range "31 ส.ค. – 28 ธ.ค. 2026" · M6/M9** — The week `2026-12-28` is **included**: the F1 totals count Mint's 12-28 = 250 cd (E-25). Tests query `[2026-08-31, 2027-01-04)`.

**F-02 · ambiguity · §11.3 table layout · M9** — F2, F3 and F4 are **independent**, each F1 plus its own setup, not cumulative (E-25). `seed-golden --fixture=F3` must not add F2's holiday.

**F-03 · ambiguity · FR-1009 · M9** — Bucket rule: "สัปดาห์นี้" if I have an allocation on the task in this week; "สัปดาห์หน้า" if next week (and not this week); "หลังจากนั้น" if only later; "ยังไม่วางแผน" if no allocation from this week onward. Completed tasks are hidden unless shown.

**F-04 · missing-detail · FR-406, BR-52 · M6** — Future load for archiving counts `week_start ≥ weekStart(today)`. The completion toast counts `week_start > completed_week`, which follows BR-50 exactly. Both are in cd.

**F-05 · missing-detail · §4.8 `f`/`h`, FR-806 · M6** — Use `services/capacity.ts` from M5 (M5-14). Never recompute capacity in the grid client beyond what the API sends.

**F-06 · risk · §6.3 · M6** — The WEEK/DAY trigger ships as a **custom** migration (X-10), named `…_week_day_exclusivity`, not `9999_triggers.sql`.

---

## 4. Ready-to-paste `PROGRESS.md` rows

### 4.1 Decisions (date: 2026-09-30)

| อ้างอิง | ตัดสินใจ | เหตุผล |
|---|---|---|
| §12 M5, FR-205, BR-50 | `src/domain/dates.ts` built in M1, and `todayBangkok` is available from M1 | M1/M3 need today's date (`deactivated_on`, `completed_on`) |
| §12 M6, FR-207 | `units.ts` (numeric↔cd) built in M1; display and parse functions in M6 | `work_schedules.fraction` must follow BR-01/02 |
| §12 M6, FR-601/613 | `certainty.ts` built in M3 | The task panel and grouping need BR-35/36 |
| §7.5, P2 | Client `UndoProvider` (50 steps, 8-second toast, Cmd+Z) built in M1; restore by `deleted_batch` in M3 | Recoverable deletions exist from M1/M2 onward |
| §6.1 | Every `position` column is `text collate "C"` (Drizzle customType) | Fractional keys sort wrongly under `en_US.utf8` |
| §6.1 | Sibling key generation is serialized with `pg_advisory_xact_lock` per scope, plus `id` as ORDER BY tiebreaker | `generateKeyBetween` throws on equal keys |
| §6.3, CLAUDE DB | Triggers, extensions and the exclusion constraint are created with `drizzle-kit generate --custom`; the first migration is `extensions` | The migrator runs only journaled files |
| FR-106 | Custom lockout table `auth_login_failures` + Better Auth hooks; Better Auth's built-in rate limit tuned as a backstop | The built-in limiter can't count failures per IP+email |
| FR-101/201 | Additional fields `input:false`; `disabledPaths` covers `/update-user`, `/change-password`, `/admin/*`, … | Users must not change their own name/role/flags |
| FR-201/204/205, CLAUDE tx | Create employee, reset password and deactivate run as one Drizzle transaction + `better-auth/crypto` + direct session deletion | Atomicity and audit; `setUserPassword` doesn't revoke sessions |
| §6.1 ids | User ids are `crypto.randomUUID()` stored in the `text` column | Validate every id with `z.uuid()` |
| FR-105 | New password ≥ 8 characters, not equal to the full email or its local part, and not equal to the old password | "ไม่ซ้ำอีเมล" + FR-104 |
| FR-107 | `/account/password` is the account page (change password + log out of all devices) | §7.2 has only this route |
| FR-202 | 12-character password from `getRandomValues` with an unambiguous alphabet; shown once; copy with a fallback | Works over HTTP LAN |
| FR-205 | Deactivation keeps membership, assignments and plans; excluded from pickers; reactivation clears `deactivated_on` | FR-205 + P4 |
| FR-206 | Advisory lock when checking the last manager; demoting yourself is allowed if another manager exists | Race-free; the SPEC forbids only deactivating yourself |
| FR-207 | Fractions 0.25/0.5/0.75/1.0; at least 1 day; schedule changes apply to every date (no history) | The DDL has no effective date |
| FR-208 | Position is optional; ordered with up/down buttons; can't be deleted while in use; deleting an unused one has undo | P1 |
| §3.2 clients vs FR-401 | The project form's client picker shows every active client to M/L | L must be able to change the client per §3.2 |
| BR-62 | LEAD is optional at creation; a worker can't remove or demote the last LEAD; a manager can, with a warning | Uses BR-62's own exception |
| FR-406, BR-44 | An archived project is read-only (except unarchive and delete); archive has no confirm, only a toast with undo | P2, P4 |
| FR-407, §6.2 | Permanent delete = one-transaction hard delete + unlink files after commit; `projects.deleted_at` is never set in the MVP | "waiting" is undefined |
| §3.3 | LEAD status and "same project" count only non-archived projects; deactivated users are still visible people | Archived projects are no longer active |
| FR-404/BR-61 | Count and cancel every active assignment in the project (including completed tasks), in one batch | The BR-61 invariant |
| BR-31 | Moving a task under a parent that has assignments: move them to the child; if the same person is on both, refuse | No plan merging in the MVP |
| FR-608 | Completing a parent doesn't cascade unless "ติ๊กทั้งหมด" is pressed; completing every child doesn't complete the parent | P7 |
| FR-613 | A task with several people appears in every person's group; drag and Tab only in ungrouped, manual-order view | Unambiguous tree operations |
| §12 M3 `/my` | M3 groups by project; M9 switches to FR-1009 buckets | No allocations before M6 |
| FR-540–543 | Save accepted when `version` matches (the lease only coordinates the UI); takeover = unconditional upsert | FR-542 wants the displaced editor's pending changes saved |
| FR-510 | The wiki lock inherits to sub-pages; workers can't delete a subtree containing a locked page | Policy pages have children |
| §3.2 wiki | "แก้" for wiki includes delete (with undo), except locked pages | P2 |
| FR-508 | Duplicating remaps `subpage` ids, shares files, and sets `is_charter=false` / `locked=false` on the copy | `one_charter_per_project` unique index |
| FR-402/509 | The charter can't be deleted; choosing the Charter template elsewhere doesn't set `is_charter` | P5 |
| §7.6 | File authorization uses `files.project_id` (null = wiki) | Duplicated pages share files |
| §7.6 | Upload allow-list matrix = detected type + extension; SVG is attachment-only with `CSP: sandbox` | Real `file-type` results |
| FR-903/905 | AM+PM half days on the same day are rejected (DDL); leave on non-working days is allowed | Keep the DDL as written |
| FR-901 | CSV: UTF-8 → windows-874; ISO dates only; upsert on date; all-or-nothing with preview | Thai Excel files |
| BR-13 | `dayCapacityCd` takes `deactivatedOn`, capacity is 0 from that date | The BR-10 snippet omits it |
| §11 | `pnpm check` has no DB; `test:int` and `test:e2e` are part of the milestone gate | CLAUDE + §11.2 |
| §8.8, D7 | Date inputs use MUI X DatePicker + `AdapterDayjsBuddhist` (new dependencies: `@mui/x-date-pickers`, `dayjs`) | B.E. display |
| §8.7 | Dark mode follows the system; the §8.7 tokens get a dark set with 4.5:1 contrast | The SPEC has only light values |
| FR-1201 | Audit every mutating action (except preferences and the lease); never store passwords | Uniform rule |

### 4.2 Deviations

| อ้างอิง | spec บอกว่า | ทำจริง | เหตุผล |
|---|---|---|---|
| §7.1 UI | Tailwind v4 + shadcn/ui | MUI (+ CSS Modules for dense grid cells) | Owner decision, 2026-09-30 |
| §7.1 Editor | `@blocknote/shadcn` | `@blocknote/mantine`, themed to match MUI | No shadcn UI after the MUI switch; BlockNote has no official MUI package |
| §7.1 Palette | cmdk "มากับ shadcn" | standalone `cmdk` inside an MUI Dialog | Same as above |
| FR-106 | Better Auth handles it | Custom lockout table + hooks | The Better Auth limiter keys by IP+path over every request |
| FR-531 / §7.3 | Writes go through server actions | `PUT /api/pages/:id/content` exists only for `pagehide` keepalive (≤ 60 KB) | A Server Action can't be called from `pagehide` |
| CLAUDE DB | `drizzle/9999_triggers.sql` | Journaled custom migrations (`drizzle-kit generate --custom`) | The migrator ignores unjournaled files |

---

## 5. Snippets (APIs verified against the installed versions; adapt names)

### 5.1 Better Auth config skeleton (`src/server/auth.ts`)

```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
// verified exports: 'better-auth/plugins/admin/access' → adminAc, defaultAc, defaultRoles, defaultStatements, userAc
//                   'better-auth/plugins/access'       → createAccessControl, role
import { defaultAc, adminAc, userAc } from 'better-auth/plugins/admin/access'
import { nextCookies } from 'better-auth/next-js'
import { db } from './db/client'
import * as schema from './db/schema'
import { env } from './env'
import { th } from '@/i18n/th'
import { lockoutBefore, lockoutAfter } from './auth-lockout'

// Reuse the plugin's own role objects under our role names (adminRoles must be keys of `roles`, E-09).
// Manager-only operations are enforced by src/server/authz.ts anyway; BA roles only matter for BA's own checks.
const ac = defaultAc
const manager = adminAc
const worker = userAc

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.TRUSTED_ORIGINS,                       // X-13
  database: drizzleAdapter(db, { provider: 'pg', schema }),  // keys = BA field names (E-10)
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8, maxPasswordLength: 128 }, // FR-101, AC-102
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },   // FR-103 (defaults, stated explicitly); cookieCache left disabled (AC-104)
  user: { additionalFields: { mustChangePassword: { type: 'boolean', defaultValue: true, input: false } } }, // FR-104 (M1-03)
  advanced: {
    useSecureCookies: env.SECURE_COOKIES,                    // E-05
    ipAddress: { trustedProxies: env.TRUSTED_PROXIES },      // E-06
    database: { generateId: () => crypto.randomUUID() },     // X-15 (optional)
  },
  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT !== 'off',                  // 'off' only accepted when !production || E2E
    customRules: { '/sign-in/email': { window: 60, max: 30 } },
  },
  disabledPaths: [ '/sign-up/email', '/update-user', '/change-email', '/delete-user', '/delete-user/callback',
    '/change-password', '/request-password-reset', '/reset-password', '/reset-password/:token',
    '/send-verification-email', '/verify-email', '/sign-in/social', '/link-social', '/unlink-account',
    '/list-accounts', '/account-info', '/get-access-token', '/refresh-token', '/update-session',
    '/admin/create-user', '/admin/set-role', '/admin/set-user-password', '/admin/ban-user', '/admin/unban-user',
    '/admin/impersonate-user', '/admin/stop-impersonating', '/admin/remove-user', '/admin/update-user',
    '/admin/list-users', '/admin/list-user-sessions', '/admin/revoke-user-session', '/admin/revoke-user-sessions',
    '/admin/get-user', '/admin/has-permission' ],            // M1-04 — confirm exact paths from routes.mjs in M1
  hooks: { before: lockoutBefore, after: lockoutAfter },     // FR-106 (M1-06)
  plugins: [
    admin({ defaultRole: 'worker', adminRoles: ['manager'], ac, roles: { manager, worker },
            bannedUserMessage: th.auth.deactivated }),        // E-09
    nextCookies(),                                           // must be last (E-07)
  ],
})
```

### 5.2 Lockout hooks sketch (`src/server/auth-lockout.ts`)

```ts
import { createAuthMiddleware, APIError, getIP } from 'better-auth/api'   // all three verified exported from better-auth/api (1.7.6)
// before: if ctx.path === '/sign-in/email': email = String(ctx.body?.email ?? '').trim().toLowerCase()
//   ip = (ctx.request ? getIP(ctx.request, ctx.context.options) : null) ?? 'unknown'   // same IP semantics as BA's limiter (E-06)
//   const n = count(*) from auth_login_failures where email=$1 and ip=$2 and created_at > now() - interval '15 minutes'
//   if (n >= 5) throw new APIError('TOO_MANY_REQUESTS', { code: 'LOGIN_LOCKED', message: th.auth.locked(minutesLeft) })
// after: if ctx.path === '/sign-in/email':
//   const r = ctx.context.returned
//   if (r instanceof APIError && (r.status === 'UNAUTHORIZED' || r.body?.code === 'INVALID_EMAIL_OR_PASSWORD')) insert failure
//   else if (!(r instanceof APIError)) delete from auth_login_failures where email=$1 and ip=$2
```

### 5.3 Drizzle building blocks

```ts
// src/server/db/types.ts
import { customType } from 'drizzle-orm/pg-core'
export const fracKey = customType<{ data: string }>({ dataType: () => 'text collate "C"' })   // verified emit (E-12)
// usage: position: fracKey('position').notNull()
// generated column: completedWeek: date('completed_week', { mode: 'string' })
//   .generatedAlwaysAs(sql`(date_trunc('week', completed_on::timestamp)::date)`)
// trigram: index('tasks_name_trgm').using('gin', t.name.op('gin_trgm_ops'))
// partial unique: uniqueIndex('one_charter_per_project').on(t.projectId).where(sql`${t.isCharter} and ${t.deletedAt} is null`)
```

```bash
pnpm db:generate --custom --name=extensions   # M1, FIRST — body below
# create extension if not exists pg_trgm; create extension if not exists btree_gist; create extension if not exists pgcrypto;
pnpm db:generate --name=m1_auth_employees       # then the schema migration
pnpm db:generate --custom --name=time_off_no_overlap   # M5 — exclude using gist (...) where (deleted_at is null)
pnpm db:generate --custom --name=week_day_exclusivity  # M6 — §6.3 trigger
```

### 5.4 Page lease SQL (E-22)

```sql
-- acquire / heartbeat (0 rows => held by someone else; then SELECT holder for the banner)
insert into page_locks(page_id, user_id, expires_at) values ($1, $2, now() + interval '2 minutes')
on conflict (page_id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at
where page_locks.user_id = excluded.user_id or page_locks.expires_at < now()
returning user_id, expires_at;
-- takeover (?takeover=1): same statement without the WHERE clause
-- release: delete from page_locks where page_id = $1 and user_id = $2;
```

### 5.5 Holiday CSV decoding (E-17)

```ts
export function decodeCsv(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }   // BOM stripped by default
  catch { return new TextDecoder('windows-874').decode(bytes) }             // Thai Excel "CSV (Comma delimited)"
}
```

### 5.6 Upload decision matrix (E-15)

| Detected (`file-type`) | Client extension | Accept as | Stored MIME | Disposition |
|---|---|---|---|---|
| png / jpg / gif / webp | any | IMAGE (≤ `MAX_IMAGE_MB`) | detected | inline |
| pdf | any | ATTACHMENT | application/pdf | attachment |
| docx / xlsx / pptx | any | ATTACHMENT | detected | attachment |
| zip | docx/xlsx/pptx → keep that extension; otherwise zip | ATTACHMENT | from extension, or application/zip | attachment |
| cfb | doc / xls / ppt only | ATTACHMENT | application/msword · application/vnd.ms-excel · application/vnd.ms-powerpoint | attachment |
| undefined or xml | csv / txt (valid UTF-8 or windows-874 text, no NUL in the first 8 KB) | ATTACHMENT | text/csv · text/plain; charset=utf-8 | attachment |
| undefined or xml | svg | ATTACHMENT | image/svg+xml | attachment + `CSP: sandbox` |
| anything else | — | reject 415 | — | — |

All sizes are checked against `MAX_*_MB`, and the received length must equal `Content-Length` (X-16).

### 5.7 Scaffold (M0)

```bash
npm i -g pnpm@<pinned>
pnpm dlx create-next-app@16.3.7 "$SCRATCH/scaffold" --ts --app --src-dir --eslint --no-tailwind \
  --no-react-compiler --import-alias "@/*" --use-pnpm --no-agents-md --disable-git --skip-install --yes
rsync -a --ignore-existing --exclude CLAUDE.md --exclude AGENTS.md --exclude README.md "$SCRATCH/scaffold/" ./
# next.config.ts must contain: agentRules: false, output: 'standalone', experimental.proxyClientMaxBodySize, experimental.serverActions.{bodySizeLimit, allowedOrigins}
# .gitignore additions: uploads/ backups/ /playwright-report /test-results /coverage !.env.example
```

### 5.8 Random password (browser)

```ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' // no 0/O/1/l/I
export function randomPassword(len = 12): string {
  for (;;) {
    const out: string[] = []
    const buf = new Uint32Array(len * 2)
    crypto.getRandomValues(buf)                     // available without a secure context
    for (const v of buf) {
      const limit = Math.floor(2 ** 32 / ALPHABET.length) * ALPHABET.length
      if (v < limit) out.push(ALPHABET[v % ALPHABET.length]!)
      if (out.length === len) break
    }
    const s = out.join('')
    if (s.length === len && /[A-Z]/.test(s) && /[a-z]/.test(s) && /[2-9]/.test(s)) return s
  }
}
```

---

## 6. Authorization matrix rows for M1–M5 (§3.2), with expected outcomes

`allow`, `403` (visible but not permitted), `404` (not visible). Columns: M = manager, L = LEAD of that project, Me = MEMBER of that project, W = worker who isn't a member. For global rows, L/Me/W are all just "worker".

| # | Action (route or action) | M | L | Me | W | Milestone |
|---|---|:-:|:-:|:-:|:-:|---|
| 1 | Create, edit or deactivate an employee; reset or set a password | allow | 403 | 403 | 403 | M1 |
| 2 | `/settings/*` pages | allow | 404 | 404 | 404 | M1 |
| 3 | Manage positions | allow | 403 | 403 | 403 | M1 |
| 4 | Change own password / log out everywhere | allow | allow | allow | allow | M1 |
| 5 | BA `/update-user`, `/sign-up/email`, `/admin/*` | 404 or rejected | same | same | same | M1 |
| 6 | Create, edit or archive a client | allow | 403 | 403 | 403 | M2 |
| 7 | List clients | all | only clients of member projects | ← | empty | M2 |
| 8 | Open a client page | allow | allow if it's a client of a member project, else 404 | ← | 404 | M2 |
| 9 | Create a project | allow | 403 | 403 | 403 | M2 |
| 10 | Project list / nav | all | member projects | member projects | none | M2 |
| 11 | Open a project (overview, API) | allow | allow | allow | 404 | M2 |
| 12 | Edit project info (name, client, colour, certainty) | allow | allow | 403 | 404 | M2 |
| 13 | Add or remove a member, change role | allow | allow (can't remove the last LEAD) | 403 | 404 | M2 |
| 14 | Archive / unarchive | allow | allow | 403 | 404 | M2 |
| 15 | Permanent delete | allow | 403 | 403 | 404 | M2 |
| 16 | Any edit on an **archived** project (not unarchive or delete) | 403 | 403 | 403 | 404 | M2 |
| 17 | Create, edit, delete or complete a task | allow | allow | allow | 404 | M3 |
| 18 | Assign an existing member | allow | allow | allow | 404 | M3 |
| 19 | Assign a non-member (auto-invite) | allow | allow | 403 | 404 | M3 |
| 20 | Restore a task batch | allow | allow | allow | 404 | M3 |
| 21 | View, create, edit or delete a project page | allow | allow | allow | 404 | M4 |
| 22 | View a wiki page | allow | allow | allow | allow | M4 |
| 23 | Create or edit a wiki page (not locked) | allow | allow | allow | allow | M4 |
| 24 | Edit, delete or move under a **locked** wiki page | allow | 403 | 403 | 403 | M4 |
| 25 | Lock or unlock a wiki page | allow | 403 | 403 | 403 | M4 |
| 26 | Upload to a page | edit permission on that page (rows 21/23/24) | | | | M4 |
| 27 | Download a file of a project page | allow | allow | allow | 404 | M4 |
| 28 | Acquire, heartbeat or take over an edit lease | edit permission on that page | | | | M4 |
| 29 | Search results | only pages the user may view | | | | M4 |
| 30 | Manage holidays and leave types | allow | 403 | 403 | 403 | M5 |
| 31 | Create, edit or delete own leave | allow | allow | allow | allow | M5 |
| 32 | Create, edit or delete someone else's leave | allow | 403 | 403 | 403 | M5 |
| 33 | See someone else's leave details (type, note) | allow | masked "ลา" | masked | masked, if visible at all | M5 |
| 34 | Whose leave appears in the calendar | everyone | everyone (LEAD) | self + people sharing a non-archived project | same as Me | M5 |

Plus the JSON leak assertions (M2-17, M5-09).

---

## 7. Golden seed growth and derived memberships

The fixture has only LEAD per project. Assignees become MEMBER (BR-60 semantics), so M2 must seed them explicitly:

| Project | Client | Certainty | LEAD | MEMBER (derived from assignees) |
|---|---|---|---|---|
| POS Upgrade | Coral | CONFIRMED | Cindy | Ivy (ทำ UAT + คู่มือหน้าร้าน), Mint (Rollout สาขา, TENTATIVE override) |
| Data Warehouse | Coral | CONFIRMED | Peter | — |
| Mobile App Revamp | Bluebird | CONFIRMED | Jack | Mint (พัฒนา front-end) |
| CRM Migration | Sunrise | TENTATIVE | Cindy | Ivy (ตั้งค่า automation) |
| Store Analytics Dashboard | Internal | TENTATIVE | Peter | Jack (เก็บ requirement + สรุป) |

Resulting visibility for the M2 e2e:

| User | Projects visible |
|---|---|
| Cindy | POS, CRM |
| Ivy | POS, CRM |
| Peter | DW, Store |
| Jack | Mobile, Store |
| Mint | POS, Mobile |
| Manager | all five |

Example W case: Peter opens POS → **404**. Every worker is LEAD somewhere except Ivy and Mint, so under §3.3 only **Ivy and Mint** see the restricted people sets:
- Ivy sees Cindy, Mint and self.
- Mint sees Cindy, Ivy, Jack and self.

These are good M5 calendar masking cases.

Growth schedule:
- **M1** positions (6), users (6), schedules (Mon–Fri 100 cd).
- **M2** clients (4), projects (5), members (as above).
- **M3** tasks (10, in JSON order per project) + assignments + the override.
- **M4** charters.
- **M5** `--fixture` options only.
- **M6** WEEK allocations (cd → `numeric` via `units.ts`).

Every golden user has `must_change_password=false` and the password `demo1234` (one hash). The script refuses to run when `NODE_ENV=production`.

---

## 8. Items worth an owner glance (non-blocking; defaults above apply until changed)

1. LEADs can pick from **all** active clients in the project form (M2-01).
2. Archived projects are **read-only** (X-19).
3. The wiki lock **inherits** to sub-pages (M4-05), and workers may delete unlocked wiki pages (M4-06).
4. Same-day **AM + PM** half days are rejected; record a full day instead (M5-05).
5. The charter **can't be deleted** (M4-09).
6. A new password must differ from the old one (M1-07).
7. The holiday CSV accepts **ISO dates only** (M5-10).
8. Before M9, `/my` groups by project (M3-12).
9. Schedule changes apply retroactively (M1-14).
