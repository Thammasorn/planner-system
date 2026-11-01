# M11 — ฐานข้อมูลในหน้าเอกสาร + สมการ

> Depends on: M10 ✅ (and M4, M6.1 through it; M7–M9 only for regression — BR-98) · SPEC v3.2: §4.14 (FR-1401…1475, AC-1401…1414), §4.15
> (FR-1501…1506, AC-1501…1504), §5.11 (BR-90…98), §3.2 PERM-24…26 (+ PERM-16/18 for row bodies), §3.3 (database bullet), §6.2 (`page_kind` + `'DB_ROW'`,
> `db_column_type`, `db_view_type`, `databases`, `database_columns`, `database_views`, `database_rows`, `pages.database_row_id`, `pages_kind_row`),
> §6.4, §7.5, §7.7 (database / equation / row-body paragraphs), **§7.9**, §8.6, §8.9, **§8.11**, §8.12, §9 (NFR-11, NFR-12), §11.1–11.2, §12 M11, §13, §14 D14–D20 ·
> Owner-visible result: typing `/table view`, `/คัมบัง` or `/ปฏิทิน` in any document (or task body) inserts a live database (Notion/AFFiNE style) with typed
> columns (ชื่อ, ข้อความ, ตัวเลข, ตัวเลือก, หลายตัวเลือก, วันที่, ช่องติ๊ก, คน (หลายคน), ลิงก์), shared Table · Kanban · Calendar views, a row side panel, rows that open as
> pages `/r/<rowId>`, undo for everything without dialogs, deep copy on duplicate/paste, a "ฐานข้อมูล" group in Cmd+K — and LaTeX equations (block and
> inline) rendered by a bundled, lazily loaded KaTeX, with no effect at all on planning, workload or capacity.

---

## 1. Goal and scope

### 1.1 In scope

Legend — "Where": stream.step in §5. "Test": `unit` = Vitest node, `ui` = Vitest jsdom, `int` = Vitest + Postgres, `authz` = row in
`tests/authz/rows/databases.ts` / `row-pages.ts` (§7.2), `mask` = `tests/authz/masking.int.test.ts › databases (M11)`, `mig` =
`src/server/db/migrations-m11.int.test.ts`, `perf` = perf smoke (§7.4), `e2e` = scenario id in `e2e/m11-database.spec.ts` (§7.3).

| ID | What M11 delivers | Where | Test |
|---|---|---|---|
| FR-1401 | One data source (title, typed columns, rows) shown by several views; an edit in one view is visible in every other at once (one query cache per database) | S0.4, S3.1, S3.2 | ui `useDatabase.test.tsx` · e2e D4 |
| FR-1402 | `databases.page_id` = exactly one owner page; the API serves a database only through its owner page id; no linked views | S0.2, S2.3 | authz DB-GET-WRONGPAGE · e2e D10 |
| FR-1403 | Slash group "ฐานข้อมูล": ตาราง (`/ตารางข้อมูล`, `/ฐานข้อมูล`, `table view`, `database`, `db`), คัมบัง (`/คัมบัง`, `kanban`, `kanban view`), ปฏิทิน (`/ปฏิทิน`, `calendar`, `calendar view`); `/ตาราง` still ranks the plain table first; `/board` stays M10's task view | S5.3 | ui `slash-menu.test.tsx › database group + ranking` · e2e D1 |
| FR-1404 | Insert → `createDatabase` (ชื่อ + สถานะ + วันที่, 0 rows, first view by item); caret in the database title | S2.4, S5.3, S3.2 | int `databases.int.test.ts › create` · ui `DatabaseHeader.test.tsx` · e2e D1 |
| FR-1405 | Header: inline title + AFFiNE-like view tabs (switch, `+`, rename, duplicate, delete ≥ 1 left, drag reorder); selected tab = local UI state | S3.3 | ui `ViewTabs.test.tsx` · e2e D3, D7 |
| FR-1406 | Views shared by everyone; read-only viewers cannot change view settings (403 server, no controls client) | S2.7, S3.3 | authz VIEW-UPDATE-WIKIPROT · e2e D3 |
| FR-1407 | Block = non-text island (`content: 'none'`), handle + Delete removes it, editor Cmd+Z brings it back; Cmd+Z inside the island = database undo stack | S5.2, S5.4 | ui `DatabaseBlock.test.tsx › isolation` · e2e D11 |
| FR-1408 | < 600 px: table/kanban scroll inside the block, calendar = day list, tap-only with "ย้ายไป…" instead of drag | S3.5, S4.1, S4.2 | ui · e2e V1 |
| FR-1410 | Nine column types with type icons; TITLE fixed; NUMBER exact strings + display config; SELECT/MULTI_SELECT options (10 colours, create-by-typing, reorder); DATE; CHECKBOX; PERSON 1–20 active people (deactivated keep "ปิดใช้งาน"); URL http/https/mailto, opened with `rel="noopener noreferrer"` | S1.2–S1.5, S3.4 | unit `database.cells.test.ts` · ui `cells/*.test.tsx` · int · e2e D2 |
| FR-1411 | `+` column → type → default name ("ข้อความ", "ตัวเลข 2"), name field focused | S1.6, S3.6 | unit `defaultColumnName` · ui `ColumnMenu.test.tsx` |
| FR-1412 | Column header menu (rename, type, type config, sort ↑/↓, filter, hide, insert left/right, duplicate with values, delete) | S3.6 | ui `ColumnMenu.test.tsx` · e2e D2, D6, D7 |
| FR-1413 | Column order per database (drag header); hidden / width / card properties per view | S2.6, S3.2 | int · ui `TableView.test.tsx` · e2e D3 |
| FR-1414 | Change type converts every row (BR-93) in one tx, no dialog, toast "เปลี่ยนชนิดคอลัมน์แล้ว · เลิกทำ" restores type, config and values | S1.7, S2.6, S3.6 | unit `database.convert.test.ts` · int `› changeType/revert` · e2e D6 |
| FR-1415 | Delete column (values kept) + undo; dependent sort/filter/group suspended and back on restore; kanban/calendar "เลือกคอลัมน์…" pickers | S2.6, S3.6, S4.1, S4.2 | int · ui · e2e D7 |
| FR-1416 | Delete option → values read as empty + undo restores option and values | S1.3, S3.6 | unit `readCell` · e2e D2 |
| FR-1420…1429 | Table view: pinned title, virtualised > 50 rows, in-cell editing, full keyboard, + แถวใหม่ (inherits "is" filters), select/delete rows, widths 80–600, ≤ 3 sorts, ≤ 10 AND filters, hide columns, "N แถว" / "N จาก M แถว" | S3.2–S3.8 | ui `TableView.test.tsx`, `useTableKeyboard.test.tsx`, `FilterMenu.test.tsx` · e2e D1, D3, D7 |
| FR-1430…1435 | Kanban: group by SELECT/PERSON/CHECKBOX (auto "สถานะ"), groups + counts + "ไม่มีค่า", hide empty, card properties, drag between/within groups (multi-person replace), quick add per group, + เพิ่มกลุ่ม, click → panel | S1.9, S4.1 | unit `database.group.test.ts` · ui `KanbanView.test.tsx` · e2e D4 |
| FR-1440…1445 | Calendar: Monday-first month, "พฤศจิกายน 2569", ‹ วันนี้ ›, today frame + "วันนี้", weekend shading, ≤ 3 cards + "+N เพิ่มเติม", drag to day, `+` on a day, "ไม่มีวันที่ (N)" list with drag in/out, database data only | S1.10, S4.2 | unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` · e2e D5 |
| FR-1450…1452 | Row side panel (all columns, `+ เพิ่มคอลัมน์`, compact body, "เปิดเป็นหน้า", delete, created/updated by), ˄/˅ by the open view's order, Esc; deep link `?db=&row=` | S3.7 | ui `RowPanel.test.tsx` · e2e D14 |
| FR-1453 | Rows open as pages: kind `DB_ROW`, `pages.database_row_id`, lazy `ensureRowBody`, `GET /api/database-rows/:id/body`, `/r/[rowId]` (header bar, breadcrumb `หน้าเจ้าของ › ฐานข้อมูล`, title, all properties, body), no sub-page / database blocks in row bodies, permission = owner page, lease covers the body only, 📄 on rows with a body, absent from trees/sidebar/recent/page search | S0.2, S2.2, S2.9, S4.3, S5.6 | int `row-pages.int.test.ts` · authz RB-*, RP-* · e2e D14 |
| FR-1460…1466 | Permissions = owner page (view/edit/wiki lock/archived, 404 when invisible); read-only viewers see data, no controls; independent of the page lease; per-object `version` + conflict toast; foreign/missing id → "ไม่พบฐานข้อมูล" + 404 without data; undo for everything; 1 audit row per action without cell values | S0.6, S2.1–S2.8, S3.1 | authz (whole file) · mask · int · e2e D8, D9 |
| FR-1470 | `duplicatePage` deep-copies every attached database of the subtree (+ row bodies) in the same tx; content ids remapped | S2.10 | int `database-copy.int.test.ts › duplicatePage` · e2e D10 |
| FR-1471 | Paste/copy of a block → `copyDatabase` deep copy (view source, edit target; files copied across project/space); cut-paste in the same page keeps the id; failures → "ไม่พบฐานข้อมูล" | S2.10, S5.5 | int `› copyDatabase` · authz DB-COPY-* · ui `paste-database.test.tsx` · e2e D10 |
| FR-1472 | Removing a block detaches the database on the next save (keepalive too); restoring the block re-attaches | S2.11 | int `pages.int.test.ts › detach reconcile` · e2e D11 |
| FR-1473 | Page delete → 404 + not searchable; restore → back; project permanent delete cascades (files unlinked) | S2.12 | int · e2e D11 |
| FR-1474 | Cmd+K group "ฐานข้อมูล": database titles, row titles, row bodies (≥ 3 chars), visibility in SQL, ≤ 8; cells never searched; nothing in `pages.content_text` | S2.13, S4.4 | int `search.databases.int.test.ts` · authz SR-DB-* · mask · e2e D8 |
| FR-1475 | Server-side limits with Thai messages | S1.1, S2.* | unit · int `› limits` · authz *-LIMIT · e2e D12 |
| FR-1501…1506 | Equation block + inline equation, toolbar "สมการ", popover editor (Enter / Cmd+Enter / Esc), error state ⚠ "สมการไม่ถูกต้อง", bundled KaTeX (no CDN, safe options, MathML), stored in `pages.content`, LaTeX source in `content_text` | S0.9, S0.11, S5.7–S5.9 | unit `content-text.test.ts › latex` · ui `Equation*.test.tsx` · e2e E1–E4 |
| BR-90…97 | `src/domain/database.ts` (pure, test-first, ≥ 95 % coverage, fast-check) | S1 | unit `src/domain/database*.test.ts` |
| BR-98 | No FK/reads from planning; writes trigger nothing else | S0.2, S2.14, S6.4 | int `tests/golden/database-isolation.int.test.ts` · unit `tests/integration/br98-imports.test.ts` · e2e D13 |
| NFR-11 | 1,000 rows × 20 columns: GET < 500 ms p95, table render < 300 ms, view switch/filter/sort < 100 ms, cell edit < 50 ms — **smoke** (M12 gates) | S1.12, S2.15, S7.3 | perf (§7.4) · e2e P1 |
| NFR-12 | Page with 3 database blocks (1,000 rows) + 50 equations opens < 1.5 s; KaTeX lazy — **smoke** | S5.8, S7.3 | e2e P2 |
| AC-1401…1414, AC-1501…1504 | see §7.1 | | |

**§3.2 permission rows in scope** (PERM numbering = §3.2 order; PERM-24…26 appended by v3.2):

| PERM | §3.2 row | M | L | Me | W | Rows (§7.2) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-24 | ดูฐานข้อมูลในหน้า (แถว คอลัมน์ มุมมอง เนื้อหาแถว `/r`) = ดูหน้าเจ้าของ | allow | allow | allow | project page 404 · wiki allow | DB-GET*, RB-GET*, RP-LOADER*, RB-PAGE-GET, RB-LOCK-GET, RB-FILE-GET, SR-DB-* |
| PERM-25 | แก้ฐานข้อมูลในหน้า = แก้หน้าเจ้าของ (lease ไม่ต้อง; wiki ล็อก → worker 403; archive → 403) | allow | allow | allow | project 404 · wiki allow · locked wiki 403 | DB-CREATE*, DB-RENAME*, ROW-*, COL-*, VIEW-*, RB-ENSURE*, RB-SAVE*, RB-KEEPALIVE, RB-LOCK-POST*, RB-UPLOAD*, FW-ROW* |
| PERM-26 | คัดลอกฐานข้อมูลไปหน้าอื่น = ดูต้นทาง + แก้ปลายทาง | allow | allow | allow | per the two conditions | DB-COPY-* , PG-DUP-DB |
| PERM-16 (FR-682 part) | page-tree APIs addressed at a `DB_ROW` page | 404 | 404 | 404 | 404 | RB-DOCAPI-* |

### 1.2 Out of scope (do NOT build; target)

| Item | Lands in |
|---|---|
| Linked views across pages, relation / rollup / formula columns, column aggregates, gallery / list / timeline views, multi-cell paste from Excel into a database, CSV import/export, trash + purge of detached databases > 30 days, real-time push | SPEC §13 (Phase 2) |
| Databases inside row bodies (nesting) | never (FR-1453) |
| Perf **gates** for NFR-11/12, `seed:perf` volume (2,000 databases / 200,000 rows), audit sweep incl. the `database` entity, offline check of KaTeX assets in the image | M12 (appended to `plan/m12-hardening-deploy.md` at close-out, §10) |
| `seed:demo` databases / equations | M12 |
| Server-side KaTeX rendering, `\href`/`\url`/`\includegraphics`, macros persisted per page, mhchem | not in MVP (FR-1505 `trust: false`) |
| Cross-tab paste of a database block when the browser strips the custom clipboard type | Known issue (M11-D13 fallback → "ไม่พบฐานข้อมูล") |

### 1.3 Carried-in items

| From | Item | Ruling |
|---|---|---|
| M4 | `savePageContent` + keepalive `PUT /api/pages/[id]/content`, `duplicatePage`, `makePasteHandler`, `BLOCK_TYPES`/`checkBlockProps`, `extractContentText`, `remapSubpageIds`, uploads, lease | extended, not forked (S0.9–S0.10, S2.10–S2.11, S5.5) |
| M6.1 §10 forward notes | `'DB_ROW'` enum value, `pages.database_row_id` + `pages_kind_row`, `requirePage` DB_ROW branch (owner page incl. wiki protection), `ensureRowBody` mirroring `ensureTaskBody`, `rowId` in `setPageFullWidthSchema`, `/r/[rowId]` from `PageHeaderBar` + `DocColumn` + `PropertyList` + a `TaskBody`-style body; `pages_kind_shape` already covers non-DOC kinds | followed exactly — except the enum value is added by the **generated** migration with a `::text` check (M11-D4), because drizzle-kit 0.31 emits `ALTER TYPE … ADD VALUE` itself and a custom file would be duplicated |
| M6.1 | `requireDocPage` already rejects every non-`DOC` kind; `kind = 'DOC'` filters in trees, page search, titles, batches; `getPageView` / `pageCan` branches for `TASK` | DB_ROW gets the TASK treatment everywhere for free; S2 adds only the DB_ROW branches (authz, `pageCan`, `getPageView`, save rules, `/p` redirect) |
| M6.1 / D20 | FR-680: database blocks and equations are allowed in **task bodies** from M11 | owner page of a database may be `DOC` or `TASK`, never `DB_ROW` (M11-D6, M11-D38) |
| M10 (assumed, §2.1) | `searchAll` + `SearchResponse` (5 groups), `PALETTE_GROUPS` with optional fields, `LiveBlockFrame` event isolation (M10-D8), page context hook `usePageId()`, `taskView`/`projectWorkload` in `BLOCK_TYPES`, slash group `ข้อมูลสด`, `recentPages` filtered `kind = 'DOC'` | extended additively; kickoff verifies each (§2.1) |
| PLAN §1.8 | pin KaTeX + research note + Decision; extend M4/M10; authz + leak rows; traceability rows; append M12 perf/audit/seed items | §3, §5, §10 |
| workflow `663d14f` | six-lens review incl. **visual** (390–2560 px, light/dark screenshots) | every UI stream leaves screens screenshot-ready (M11-D2) |

---

## 2. Read first

- **SPEC:** §0–§3 (§3.2 PERM-16…19, PERM-24…28; §3.3 database bullet), **§4.14 whole**, **§4.15 whole**, §4.5 (FR-508, FR-509, FR-510, FR-520…529, FR-540…543),
  §4.6.4 (FR-680…693), §4.11 (FR-1102, FR-1104), §4.13 (live-block pattern), §4.16 (FR-1602, FR-1606), **§5.11 whole**, §5.1 (BR-04/05 dates), §6.1 (fractional
  index), **§6.2** (database tables, `page_kind`, `pages_kind_row`), §6.4, §7.3, §7.5, §7.6, **§7.7** (database / row body / equation paragraphs), **§7.9 whole**,
  §8.6, §8.8, §8.9, **§8.11**, §8.12, §9 (NFR-11/12, Browser row), §12 M11, §13, §14 D14–D20.
- **PLAN.md:** §1.3 (Drizzle: migrator = one transaction, `orderKey`, circular FKs, `.op('gin_trgm_ops')`, error mapping; Next 16 actions serialised, no
  `refresh()` from editor actions; BlockNote client-only, ranking, `e.defaultPrevented`; dnd-kit; fractional keys server-only; no `crypto.randomUUID` in client
  code; Playwright clock), §1.4 X41, X42, X44, X45, X48, X49, X56, X57, X59, X63, X86, X88, X89, X90, X91, X93, X96; §1.8 (v3.2); §2 (whole — ownership,
  gates, six lenses incl. `visual`); §3.4, §3.5, §3.7, §3.8, §3.9, §3.11; §4.3–§4.5; §6 R25.
- **Previous plans (names reused verbatim):** `plan/m04-pages-editor.md` S0 (contracts), S1 (pages services, save, duplicate, files, search), S2 (editor:
  schema, slash menu, paste, upload, autosave, lease); `plan/m06.1-task-page-ui.md` (whole — the TASK mechanism this milestone mirrors: M6.1-D4…D15, D19,
  D20, D24, D26; §7.2 TB-*/FW-* rows; §10 forward notes); `plan/m10-home-search.md` M10-D5, D8, D20–D22, D26 and S3.4 (`LiveBlockFrame`), S1.8 (`searchAll`).
- **Code to read before changing it:** `src/server/authz.ts` (`requirePage`, `accessForPage`, `requireDocPage`), `src/server/services/{pages,page-tree,task-pages,search}.ts`,
  `src/server/repo/pages.ts`, `src/server/storage.ts`, `src/server/services/files.ts`, `src/lib/schemas/page-content.ts`, `src/lib/editor/{content-text,paste,dictionary,task-body}.ts`,
  `src/components/editor/{schema.ts,slash-menu.tsx,PageEditor.tsx,TaskBody.tsx,useLazyPageId.ts}`, `src/components/tasks/{task-param.ts,TaskPanel.tsx}`,
  `src/components/tasks/page/TaskPageScreen.tsx`, `src/components/layout/*`, `src/components/palette/groups.tsx`, `src/app/(app)/{p,t}/**`, `tests/authz/rows/{_m4,_m6_1,task-pages}.ts`,
  `tests/helpers/{world,factories,migrate-partial}.ts`, `e2e/{fixtures.ts,support/seed-pages.ts,pages/*.ts}`.
- **Research:** `plan/research/r3-blocknote.md` (custom blocks, inline content, paste, toolbar), `r4-client-testing.md` (dnd-kit, TanStack Virtual, Playwright),
  `r2-auth-db.md` (migrations), new `r9-katex.md` (written by S0.1).
- **Visual reference (concept only — AFFiNE EE licence, PLAN §1.7):** AFFiNE Table View / Kanban View / Calendar View / Equation (local `http://localhost:3010`).

### 2.1 Assumptions about M7–M10 outputs (kickoff verifies; mismatch → adapt inside M11's own files and record a Decision)

| # | Assumption (M10 unless stated) | Kickoff check | If false |
|---|---|---|---|
| A1 | `services/search.ts#searchAll(tx, user, q, { titleOnly })` returns `SearchResponse = { projects, tasks, pages, people, clients }` and `/api/search` returns it | `grep -n "searchAll\|interface SearchResponse" src/server/services/search.ts src/lib/contracts/search.ts` | S2 adds `databases` to whatever aggregator the route uses |
| A2 | `PALETTE_GROUPS` (`src/components/palette/groups.tsx`) entries `{ key, heading, map({ server, local? }), source? }`; e2e `Palette.group(heading)` | `grep -n "PaletteGroupDef" -A8 src/components/palette/groups.tsx` | S4.4 maps to the actual def |
| A3 | `LiveBlockFrame` (contentEditable=false, native stopPropagation set, Mod+Z → `useUndo()`, Mod+K passes) exists under `src/components/editor/blocks/` | `grep -rn "LiveBlockFrame" src/components/editor` | S5.2 builds `IslandFrame` with M10-D8's rules |
| A4 | A page context hook (`usePageId()` or equivalent) gives custom block renders the current page id, kind and `getPageId` | `grep -rn "usePageId\|PageContext" src/components/editor` | S5.1 adds `EditorPageContext` in `PageEditor` |
| A5 | `BLOCK_TYPES` contains `taskView`, `projectWorkload`; `checkBlockProps` has their branches; slash group `ข้อมูลสด` | `grep -n "taskView" src/lib/schemas/page-content.ts` | append after whatever is there |
| A6 | `recentPages` and every M10 page list filter `kind = 'DOC'` | `grep -rn "docOnly\|kind = 'DOC'" src/server/services/home.ts` | S2 adds the filter (DB_ROW must never appear) |
| A7 | M7/M8 migrations are journaled; M11's generated migration is the next index (expected ≥ `0012`) | `cat drizzle/meta/_journal.json \| tail` | numbers in this plan are symbolic (`<n>_m11_databases`) |
| A8 | `WorldPart` has `dayAllocations` (M7), `milestones` (M8); `AuditEntity` has `milestone` (M8) | `grep -n "WorldPart =\|AuditEntity =" -A3 tests/helpers/world.ts src/server/audit.ts` | append `databases` / `database` at the end anyway |
| A9 | e2e `resetDb(fixture?, { extras, milestones, dayExample })` options from M7/M8; charter template carries M10's live-block section | `grep -n "ResetDbOptions" -A10 e2e/fixtures.ts` | S7 uses `extras` only |
| A10 | M9 `services.workload.buildTable` exists (used only by the BR-98 isolation test to prove "unchanged") | `grep -n "export async function buildTable" src/server/services/workload.ts` | the test compares golden F1 grid only |

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings

| ID | What it means in M11 |
|---|---|
| X41 | Invisible owner page / foreign or missing database / deleted row → 404 with an identical body; visible but not allowed (archived write, locked wiki for workers, read-only view settings) → 403. |
| X42 | Archived project: databases, rows, `/r` readable; every write (incl. `ensureRowBody`, row-body save/lease/upload, full width) → 403 for M/L/Me, 404 for W. |
| X44 / X96 | Every mutating database action writes **one** audit row in the same tx, after the change, without cell values; lease calls and `ensureRowBody` without insert are not audited; row-body saves are audited like page saves. |
| X45 / X90 | e2e pinned to `APP_NOW=2026-09-30T10:00:00+07:00`; services that need "today" (date input parsing on the server, `today` filter references) take `today` as a parameter. |
| X48 | Rows, columns, views use `orderKey` positions (`text COLLATE "C"`), generated only on the server between real neighbours; row bodies use `'a0'` and never join a page sibling scope. |
| X49 | Database keyboard (arrows, Enter, Esc, Tab, Delete, Space) and equation keys match `e.code` first. |
| X56 / X57 | `/r/[rowId]` runs `requirePageUser()` + `orNotFound(getRowPageView(...))` before any Suspense; no `loading.tsx`. |
| X63 | Row-body saves do not require the lease; row bodies take the lease on first focus (`leaseAcquire 'focus'`). Database data never needs the lease (FR-1462). |
| X86 | Malformed page / database / row ids are 404 in routes and loaders (handlers parse params with zod). |
| X88 | Palette: M11 appends the `databases` group **after** M10's groups (FR-1102 order). |
| X89 | Live-block isolation rules reused for the database island (M11-D21). |
| X91 | New rows files `tests/authz/rows/databases.ts`, `row-pages.ts` registered in `tests/authz/rows/index.ts`; new world part `'databases'` (implies `pages`, `taskBodies`, `files`). |
| X93 | Audit entities += `database` (M11-D5). |

### 3.2 New milestone decisions (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M11-D1 | §12 M11, PLAN §5 | Streams refined from the PLAN §5 skeleton: **S0** contracts alone → {**S1** domain `database.ts`, **S5** editor (equations, database block glue, paste/copy, row body), **S6** authz/integration tests} → {**S2** backend, **S3** database UI core (data layer, table, cells, menus, filters, row panel)} after S1 → **S4** kanban + calendar + `/r` page + palette after S1/S3/S5 → **S7** e2e. S0 ships typed stubs plus a **working fake** of the client database API (`fakeDbApi`) so S3/S4 ui tests do not wait for S2. | Ownership by path (PLAN §2.3); domain first because server validation and client views both call it. |
| M11-D2 | PLAN §2.6, M6.1-D2 | The review panel's **visual** lens screenshots 390×844, 768×1024, 1280×800, 1920×1080, 2560×1440, light/dark: the POS charter with a database in each view, the row panel, `/r/<id>`, a page with equations (valid + invalid), the "ไม่พบฐานข้อมูล" placeholder. UI streams keep these screenshot-ready: no placeholder text, tokens only (dark mode), skeletons of the final size, stable `data-testid`s (`db-block`, `db-table`, `db-kanban`, `db-calendar`, `db-row-panel`, `equation`, `inline-equation`). | Owner feedback 2026-11-01. |
| M11-D3 | FR-1505, §7.1, CLAUDE.md deps | **New dependency `katex` pinned exactly `0.19.1`** (MIT; published 2026-10-23, older than pnpm's 24 h `minimumReleaseAge`; no install script → no `allowBuilds` entry; ships its own types `types/katex.d.ts` → no `@types/katex`; runtime dependency `commander` is CLI-only, never imported by the app). Verified 2026-11-01 from the registry: `KatexOptions` has `output: 'html' \| 'mathml' \| 'htmlAndMathml'`, `throwOnError`, `maxSize`, `maxExpand`, `strict`, `trust`; `renderToString`, `ParseError` exported. S0.1 writes `plan/research/r9-katex.md` (version, options, CSS + font handling in Next 16, lazy-chunk proof, CSP check) after a spike; if the spike finds a blocker, fall back to `0.16.47` (same option names) and record why. `PROGRESS.md › Decisions` row: "KaTeX for FR-1505 — small, offline, MathML output; no alternative in the stack". | Only new library allowed by §7.1 (PLAN §1.8). |
| M11-D4 | §6.2, CLAUDE.md DB | **One generated migration `<n>_m11_databases`** (schema.ts → `pnpm db:generate --name=m11_databases`): enums `db_column_type`, `db_view_type`; `ALTER TYPE page_kind ADD VALUE 'DB_ROW'` (drizzle-kit emits it from the enum change); tables per SPEC DDL; `pages.database_row_id uuid unique references database_rows(id) on delete cascade`; check **`pages_kind_row`: `(kind::text = 'DB_ROW') = (database_row_id is not null)`** — the `::text` cast is mandatory: PostgreSQL forbids using an enum value added by `ADD VALUE` in the same transaction (55P04 "unsafe use of new value"), and the Drizzle migrator applies every pending migration in **one** transaction; no M11 SQL may use `'DB_ROW'` as an enum literal. Extra indexes beyond SPEC (named explicitly): `database_rows_batch_idx`, `database_columns_batch_idx`, `database_views_batch_idx` (`(deleted_batch) where deleted_batch is not null`) for `restore*Batch`. If drizzle-kit emits a drop/recreate of the enum instead of `ADD VALUE`, move `ALTER TYPE` into a custom migration generated **before** the schema one (still the `::text` rule). `mig` test applies the **whole journal in one transaction** on a scratch DB. | Generated SQL only; the one-transaction migrator would otherwise break fresh installs. |
| M11-D5 | FR-1466, X93 | Audit entity **`database`** for every database action: `entity_id = databaseId`, `project_id` = owner page's project (null for wiki), `action` create/update/delete/restore, `summary` from `th.audit.db*` (database title + counts — **never** cell values or row titles), `after = { target: 'database' \| 'row' \| 'column' \| 'view', ids: string[] (≤ 50, then `count`), versions?, batch?, type?/fromType? (column type change), copyOf? }`. Row-body saves: entity `page` (as M6.1-D10) with `summary = th.audit.rowBodySaved(databaseTitle)`, `after { version, rowId }`; `ensureRowBody` audits `page · create` only when it inserts. | One row per action, no data copied into audit (FR-1466). |
| M11-D6 | FR-1460, FR-1453, §7.7 | Authz entry points in `authz.ts`: `requireDatabase(tx, user, databaseId, need: 'view' \| 'edit', opts?: { pageId?: string; lock?: boolean })` → loads the database (`FOR UPDATE` when `lock`), `pageId` given and ≠ `database.page_id` → 404; owner via `getLivePageOrNotFound` → `accessForPage(owner, need)` (DOC: project/wiki rules; TASK: `requireTask`); owner kind `DB_ROW` cannot occur (DB-level guarantee by service). `requireDbRow(tx, user, rowId, need)`, `requireDbColumn`, `requireDbView` load the object (live unless `opts.includeDeleted` for restore) then `requireDatabase`. `requirePage` gains the **DB_ROW branch**: page → live row (`deleted_at is null`, else 404) → database → owner access with `need` (`protect` → 404); `PageAccess` gains `dbRow: { row: DbRowRow; database: DatabaseRow; owner: PageAccess } \| null`; `archived`/`effectiveProtected`/`role` copied from the owner. `canEditDatabase(a: PageAccess) = !a.archived && (!a.effectiveProtected \|\| a.isManager)`. | One authz entry (CLAUDE.md); permissions literally = owner page. |
| M11-D7 | FR-1464, X86, M10-D1 | Route `src/app/api/pages/[id]/databases/[databaseId]/route.ts` (param `id`, sibling rule). The handler parses `{ id, databaseId }` with zod (malformed → 404), then `services.databases.getDatabase(tx, user, { pageId: id, databaseId })`. **Every** failure (page invisible, deleted, mismatch, database missing) throws the same `NotFoundError()` → identical JSON body; nothing is selected from the database tables before the owner check passes **except** `databases.page_id` by id. Actions take object ids only and derive the owner. | No existence oracle (FR-1464, AC-1410). |
| M11-D8 | FR-1453, §7.7 | Row bodies mirror M6.1: `ensureRowBody({ rowId })` → `{ pageId, version, created }` (`requireDbRow(edit)`, row locked `FOR SHARE`, `insert … on conflict (database_row_id) do nothing`, page `kind 'DB_ROW'`, `space`/`project_id` = owner page's, `title ''`, `position 'a0'`, `content []`); `GET /api/database-rows/[id]/body` → `RowBodyView` (page null when none); `/r/[rowId]` loader `getRowPageView`; `savePageContent` on DB_ROW rejects `subpage` **and** `database` blocks (`VALIDATION`, `th.editor.errors.subpageNotAllowed` / `databaseNotAllowed`); `pageCan` for DB_ROW = edit only; `getPageView` DB_ROW title = row title, breadcrumb `[]`, `rowId`; `/p/<rowBodyPageId>` → `redirect('/r/<rowId>' + search)`. `setPageFullWidth` gains `rowId` (exactly one of pageId/taskId/rowId). | D18; reuse M4/M6.1 without a second path. |
| M11-D9 | FR-1472 | Detach reconcile inside `savePageContent` (action + keepalive, one service) for owner kinds DOC/TASK, after sanitising: `ids = collectDatabaseIds(content)` (any depth, uuid only); `update databases set detached_at = now() where page_id = $p and detached_at is null and not (id = any($ids))`; `update databases set detached_at = null where page_id = $p and id = any($ids) and detached_at is not null`. Ids not owned by the page are ignored. Not audited separately (part of the page save). `createDatabase` creates **attached** rows; a block that was never saved is detached by the next save. | Self-healing (R25); no orphan scan job. |
| M11-D10 | FR-1404, FR-1430, FR-1440, FR-1475 | `createDatabase({ pageId, view })`: owner must be DOC or TASK (`DB_ROW` → `VALIDATION databaseNotAllowed`); lock the owner page row `FOR UPDATE`; count attached databases of the page (≤ 20); insert database + TITLE "ชื่อ" + SELECT "สถานะ" (ยังไม่เริ่ม gray · กำลังทำ blue · เสร็จ green) + DATE "วันที่" + first view (TABLE "ตาราง" all columns · KANBAN "คัมบัง" `groupByColumnId = สถานะ` · CALENDAR "ปฏิทิน" `dateColumnId = วันที่`). `createDatabaseView` of KANBAN/CALENDAR in a database without a SELECT/PERSON/CHECKBOX resp. DATE column creates "สถานะ" resp. "วันที่" in the same tx (P5) and returns it. View names default from `th.database.views.defaultName(type, n)`. | P5 "usable at once". |
| M11-D11 | FR-1470, FR-1471 | One deep-copy service `copyDatabaseInto(tx, user, source: DatabaseRow, target: PageAccess, opts: { files: 'reuse' \| 'copy' })` (`services/database-copy.ts`): live columns, views and rows only (soft-deleted ones and batches are not copied), **new ids everywhere** incl. option ids; remap map covers column ids (cell keys, `hiddenColumnIds`, `columnWidths` keys, sorts, filters, `groupByColumnId`, `dateColumnId`, `cardColumnIds`) and option ids (cell values, filter values); title unchanged; positions copied; versions 1; `created_by`/`updated_by` = copier, timestamps now; row bodies copied as new DB_ROW pages; `files: 'copy'` when `target.page.projectId !== source owner's projectId` (incl. wiki ↔ project): every `/api/files/<id>` in row bodies is streamed + `put` to a new storage key, new `files` row (`page_id` = new body, `project_id` = target), urls rewritten; bytes are written before the rows, removed best-effort on failure. `duplicatePage` copies every **attached** database of each copied DOC page with `files: 'reuse'` (same space) and rewrites `databaseId` props through a generalised `remapContentIds(doc, { pages, databases })` (replaces `remapSubpageIds`, which becomes a wrapper). Copy respects the target's limit (≤ 20 attached → `VALIDATION`). | Copy must never share data or file permissions (§7.6). |
| M11-D12 | FR-1471, §3.2 PERM-26 | `copyDatabase({ sourcePageId, sourceDatabaseId, targetPageId })` order: `requireDatabase(source, 'view', { pageId: sourcePageId })` → 404 (mismatch included) · `requirePage(target, 'view')` → 404 · `accessForPage(target, 'edit')` → 403 · target kind `DB_ROW` → 400 · limit → 400. Cross-space allowed. Result `{ databaseId }`; audit on the **target** (`after.copyOf = sourceDatabaseId`). | SPEC §7.9 order. |
| M11-D13 | FR-1471, §7.7 | Client copy/paste (S5.5, spike first): on `copy`/`cut` inside the editor surface (capture phase) the editor adds `application/x-teamos-databases+json` = `{ v: 1, sourcePageId, cut, ids: string[] }` to `clipboardData` and records the same in a same-tab registry (module Map, 60 s). The paste handler runs `defaultPasteHandler()`, then diffs database blocks before/after: an inserted block is **copied** when (a) its id appears more than once in the document, or (b) its `sourcePageId` (MIME or registry) ≠ current page id; otherwise kept (cut + paste in the same page). Copy flow: block shows "กำลังคัดลอกฐานข้อมูล…" → `copyDatabase` → `updateBlock(props.databaseId = new)`; failure or unknown source → id kept → the block renders "ไม่พบฐานข้อมูล" (FR-1464). External clipboard gets only the database title (block `toExternalHTML` = `<p>title</p>`). In a TASK body without a row yet, `getPageId()` first. | Server never trusts a foreign id, so a bypass only shows the placeholder (R25). |
| M11-D14 | FR-1463, §7.9 | Optimistic concurrency per object: `renameDatabase`, `updateDatabaseRow`, `updateDatabaseColumn`, `changeDatabaseColumnType`, `updateDatabaseView` take `baseVersion`; `UPDATE … WHERE id = $1 AND version = $base` else re-read → `VERSION_CONFLICT { current: <DTO> }` (row/column/view/database) or 404; every write bumps `version`, `updated_by/at`. Client: replace the object in the cache with `current`, drop that object's queued undo entries, toast `th.database.toasts.conflict`. A value that does not match the column's current type/options → `VALIDATION` + client refetch + toast `th.database.toasts.typeChanged`. | No silent overwrite (AC-1409). |
| M11-D15 | BR-90, FR-1410 | Server cell validation = domain `normalizeCellInput(column, input, ctx)`: TEXT/URL trimmed non-empty ≤ 2,000 (URL `isDbUrl`); NUMBER must already be **canonical** (client parses with `parseNumberInput`; server rejects anything else); SELECT id ∈ current options; MULTI_SELECT unique ids ∈ options, 1–20, order kept; DATE `isISODate` and real; CHECKBOX `true`; PERSON unique user ids 1–20 where every id **not already in the stored cell** must be an active user (deactivated ids may stay); `null`/empty → delete key; unknown or soft-deleted column key → `VALIDATION`. Title: trimmed ≤ 500 (empty allowed). `cells` merge: only sent keys change. | BR-90 literal; inactive people kept (FR-1410). |
| M11-D16 | BR-93, FR-1414 | `changeDatabaseColumnType({ columnId, baseVersion, type })`: lock database row; convert **all** rows of the database (live and soft-deleted, so a later restore is consistent) with domain `convertColumn` (server ctx: users for PERSON text matching, `newId = randomUUID`, option palette); bump versions of rows whose value changed; result `{ column, previous: { type, config, columnVersion, values: Record<rowId, CellValue> } }` (only rows that had a value). `revertDatabaseColumnType({ columnId, previous })`: requires `column.version === previous.columnVersion` (else `VERSION_CONFLICT` → toast "เลิกทำไม่ได้ เพราะคอลัมน์ถูกแก้แล้ว"), validates every previous value against `previous.type`/`previous.config` (PERSON ids must exist; options must be in `previous.config`), ≤ 1,000 + deleted rows, then writes type, config and values back in one tx. TITLE ↔ anything → `VALIDATION`. | Undo restores everything (FR-1414) without trusting client input. |
| M11-D17 | FR-1415, FR-1416, FR-1424, FR-1465 | Deletes: rows → soft delete + `deleted_batch`, their body pages in the same batch, leases cleared → `{ batch }`; `restoreDatabaseRowBatch` restores rows and bodies (positions kept; ≤ 30 days; limit 1,000 re-checked). Columns → soft delete with batch (TITLE → `VALIDATION`), cell values untouched. Views → soft delete with batch; the last live view → `VALIDATION th.database.errors.lastView`. Options → `updateDatabaseColumn` with the shorter `config.options` (cells untouched; reads treat unknown ids as empty, BR-95); undo = the previous config (same ids) → values reappear. Every restore re-runs authz (`edit`). | P2 without dialogs; batches like §7.5. |
| M11-D18 | §6.1, X48 | Positions: `afterRowId` / `afterColumnId` / `afterViewId` — `null` = first, omitted = last; the service locks `databases` row `FOR UPDATE` for every structural write (create/move/delete/restore rows, columns, views; type change) — this also serialises the FR-1475 counts; plain cell updates lock only their row (`UPDATE … WHERE version`). `generateKeyBetween` from `fractional-indexing` (no `digits`). Kanban drop "after card X" = global key between X and X's global successor (keeps in-group order for every grouping). | One lock per database; no contention on cell edits. |
| M11-D19 | §7.9 | `DatabaseResponse` = SPEC §7.9 + **additive** `rows[].hasBody: boolean` (📄, FR-1453; `exists` over `pages.database_row_id` with the M6.1-D11 non-blank rule), `views[]` and `columns[]` contain live objects only (sorted by position), `rows[]` live rows sorted `position, id`, `people` = name / nickname / color / deactivated of every user referenced in PERSON cells + creators/updaters (no email, position, load, leave, projects — §3.3), `canEdit` per M11-D6. One SQL per table, no N+1. | Display needs; masking §3.3. |
| M11-D20 | FR-1463, FR-1465, §7.5, NFR-11 | Client data layer (`src/components/database/data/**`): one query `qk.database(pageId, databaseId)` with `staleTime: 0`, `refetchOnWindowFocus: 'always'`, `refetchOnMount: 'always'`; every mutation optimistic via `setQueryData` (< 50 ms), one action per committed cell (no batching across cells; widths on pointer-up), `useMutation({ scope: { id: 'db:' + databaseId } })` so `baseVersion` is read at send time in order; failure → rollback + toast `th.database.toasts.saveFailed` ("บันทึกไม่สำเร็จ · ลองใหม่"); new rows/options use `tempId()` (`src/lib/temp-id.ts`, never `crypto.randomUUID`) until the server id arrives. Undo entries (`useUndo().push`): value/title/rename/view-config/move/add-row (undo = delete row) **without toast**; delete rows/column/view/option and type change **with** the 8 s toast. | §7.5 literal. |
| M11-D21 | FR-1407, M10-D8 | The block render = `LiveBlockFrame`-style island (`contentEditable={false}`, native `stopPropagation` for keydown/keypress/beforeinput/paste/copy/cut/mousedown/pointerdown/dragstart/drop; Mod+K passes). Inside the island: Mod+Z / Mod+Shift+Z **outside** a text input → app `useUndo()` (the database stack) and stopped; inside a cell input → native input undo. Outside the island → BlockNote undo. The block handle (BlockNote side menu) still selects/deletes the whole block. | Two undo stacks never mix (R25). |
| M11-D22 | FR-1420…1422, §8.9, NFR-11 | Table rendering: plain elements + CSS Modules + `data-*` state (no MUI component, `sx` or `styled` per cell — PLAN §3.9), `role="grid"` with `aria-rowcount/colcount/rowindex/colindex`, roving focus; TanStack Virtual row virtualiser when rows > 50 (`useFlushSync: false`, overscan 10, row 34 px); columns not virtualised (≤ 30); title column `position: sticky; left: 0`; the block's own horizontal scroll container (the page never scrolls horizontally). Row drag (handle, dnd-kit vertical) only without sorts; header drag (dnd-kit horizontal) reorders columns for the database. | Grid precedent (PLAN §3.10). |
| M11-D23 | BR-95, FR-1423, FR-1427 | Filter ops (stored in `ViewConfig.filters[].op`): text `contains · notContains · equals · isEmpty · isNotEmpty`; number `eq · neq · gt · gte · lt · lte · isEmpty · isNotEmpty`; select `isAnyOf · isNoneOf · isEmpty · isNotEmpty`; multi `hasAnyOf · hasAllOf · hasNoneOf · isEmpty · isNotEmpty`; date `is · before · after · onOrAfter · onOrBefore · isEmpty · isNotEmpty` with value `{ kind: 'date', date } \| { kind: 'today' }`; checkbox `checked · unchecked`; person `hasAny · hasNone · isEmpty · isNotEmpty` with ids and the token `'@me'` (= viewer). Incomplete filters are skipped (and shown dimmed). New rows inherit (domain `valuesFromFilters`): text/title `equals`, number `eq`, select `isAnyOf` with exactly one id, multi `hasAnyOf`/`hasAllOf` (those ids), date `is` (`today` → `todayBangkok()`), checkbox `checked`, person `hasAny` (`'@me'` → viewer). | BR-95 + FR-1423 "เท่ากับ/เป็น". |
| M11-D24 | FR-1430…1435, BR-96 | Kanban with dnd-kit (pinned, no new dep): `DndContext` + one `SortableContext` per group; drop → domain `dropOnGroup(row, groupColumn, fromKey, toKey)` → `updateDatabaseRow({ cells: { [groupBy]: value }, move? })` in **one** action (position only when the view has no sorts); keyboard sensor + card ⋯ "ย้ายไป…" (menu of groups) always; "+ เพิ่ม" quick add creates a row with the group value (PERSON group → `[person]`, "ไม่มีค่า" → none); "+ เพิ่มกลุ่ม" (SELECT) → new option; group header count = cards in that group. | §8.9 alternatives to drag. |
| M11-D25 | FR-1440…1445, BR-97 | Calendar: displayed month = viewer UI state (default = month of `useToday()`), header `formatThaiMonthYear` ("พฤศจิกายน 2569", new helper in `src/lib/format.ts`, same style as `/calendar` FR-907); grid Mon–Sun from domain `calendarMonth`; today = `--today` frame + "วันนี้" text; Sat/Sun background `--nonworking`; day shows ≤ 3 cards then "+N เพิ่มเติม" (popover list); hover `+` → inline name input → create with that date; "ไม่มีวันที่ (N)" collapsible side list (bottom list < 900 px); dnd-kit droppables per day + the list; "ย้ายไป…" opens a date picker. < 600 px: a day list of the month (days with rows + today), no grid. | FR-1408. |
| M11-D26 | FR-1450…1452, FR-685 | Row panel: URL `?db=<databaseId>&row=<rowId>` via `history.pushState/replaceState` (`src/lib/database/row-param.ts`, the `task-param.ts` pattern — no RSC round trip); the block whose id = `db` renders the panel (MUI Drawer right, `--panel-width`, full-screen sheet < md); a `db` param alone scrolls the block into view and focuses its title. ˄/˅ follow the open view's filtered + sorted order (FR-1451); Esc closes. In a **compact** editor (task panel body) a row click navigates to `/r/<rowId>` instead (no panel on a panel). Deep links for databases owned by a TASK page use `/t/<taskId>?db=&row=`; `/p/<taskPage>` redirects keep the query. | FR-1452; no nested drawers. |
| M11-D27 | FR-1453, FR-1603, FR-1604 | `/r/[rowId]`: `PageHeaderBar` back = `useInAppBack(ownerHref)`, crumbs `[owner title → ownerHref, database title (or "ฐานข้อมูลไม่มีชื่อ") → ownerHref?db=<id>, row title]`, actions `[status slot, lease slot, 🔗, ⋯ = คัดลอกลิงก์ · เปิดในแผง (ownerHref?db&row) · เต็มความกว้าง (when canEdit) · ลบแถว]`; `DocColumn` → `<h1>` `InlineEditText` row title (`--font-3xl`, Enter → body) → `PropertyList` of every live column (S3's `CellEditor` per type, "+ เพิ่มคอลัมน์") → `RowBody variant="page"`. Delete row → `deleteDatabaseRows` + undo toast → back. Live data from `qk.database(ownerPageId, databaseId)` (same cache as the block). | M6.1 forward note. |
| M11-D28 | FR-1474, X88 | `searchDatabases(tx, user, q)` → `DatabaseSearchHit[]` (≤ 8): (1) database titles, (2) row titles, (3) row bodies (`pages.kind = 'DB_ROW'`, q ≥ 3 chars, inside a savepoint with the M4 500 ms statement timeout); all joined to the **owner page** (`deleted_at is null`, visible: `space = 'WORKSPACE'` or `project_id` ∈ `visibleProjectIds`; TASK owner pages are live only while their task is) and `databases.detached_at is null`, rows `deleted_at is null`; `ILIKE '%q%'` (escaped) ordered by `word_similarity`, length, id. Hit `{ kind: 'database', rowId \| null, databaseId, pageId, rowTitle, databaseTitle, pageTitle, matchedIn: 'database' \| 'row' \| 'content', href }`, `pageTitle` = owner title (TASK: task name), href per M11-D26. `titleOnly` → `[]`. Palette group "ฐานข้อมูล" **after** M10's groups. | FR-1102/1104 + §6.4. |
| M11-D29 | FR-1501…1506 | Equations: block `equation` (`propSchema { latex: { default: '' } }`, `content: 'none'`, centred display math) and inline content `inlineEquation` (`propSchema { latex }`, `content: 'none'`); slash items `สมการ` (`equation`, `math`, `latex`, group "ขั้นสูง") and `สมการในบรรทัด` (`inline equation`, `inline math`); a custom `FormattingToolbar` (BlockNote `formattingToolbar={false}` + `FormattingToolbarController`) = default items + "สมการ" button → replaces the selected text by `inlineEquation { latex: selectedText }`. Click (editable) → MUI Popover: monospace `TextField` (maxLength 2,000) + live preview; inline `Enter` = confirm, block `Cmd/Ctrl+Enter` = confirm (`Enter` = newline), `Esc` = cancel; empty → placeholder "พิมพ์สมการ (LaTeX)". KaTeX options exactly: `{ displayMode, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 10, output: 'htmlAndMathml', strict: 'ignore' }` (`throwOnError: true` so a `ParseError` drives the error state; `strict: 'ignore'` keeps the console clean for the e2e page-error guard). Error state: ⚠ + "สมการไม่ถูกต้อง" + source (monospace) + border `--load-over-fg`, in edit and read modes. `checkBlockProps`: latex string ≤ 2,000 for both; `extractContentText` appends the latex source. | SPEC literal; never colour alone. |
| M11-D30 | FR-1505, NFR-12, §9 offline | Lazy KaTeX: `src/lib/math/load-katex.ts` `loadKatex(): Promise<typeof import('katex')>` (memoised) dynamically imports `./katex-runtime` which imports `katex` **and** `katex/dist/katex.min.css`; Next 16 emits the CSS and woff2/woff/ttf fonts as `/_next/static/**` assets of that chunk only (self-hosted, `font-src 'self'`). Equation renders show a sized skeleton until loaded. Pages without equations never request the chunk (e2e P2 asserts no request whose URL contains `katex` or `KaTeX_`). | NFR-12 + no CDN. |
| M11-D31 | FR-1408, FR-1606 | Phone (< 600 px): block toolbar collapses into ⋯; table and kanban scroll horizontally **inside** the block (`overflow-x: auto`, `overscroll-behavior-x: contain`); calendar = day list; every drag has "ย้ายไป…"; cells open their editor on tap; row panel = full-screen sheet; touch targets ≥ 36 px. Phone usage is "read + basic edits" (FR-1606 "อ่านเอกสาร"); full editing is tablet/desktop. | FR-1408 literal. |
| M11-D32 | §9 NFR-11/12, §12 M11 | Perf **smoke** in M11, gates in M12: server `databases.perf.int.test.ts` (1,000 × 20, 20 GETs, logs p95, fails > 1,000 ms = 2× budget); domain `database.perf.test.ts` (sort 3 keys + 10 filters + group over 1,000 rows, logs, fails > 200 ms); e2e P1 (render/view-switch/filter/cell-edit timings via `performance.now()`, logged, fail at 2× budget) and P2 (page open, fail > 3 s). Builder `addSyntheticDatabase(db, { pageId, rows, columns })` in `scripts/lib/perf-data.ts` (M12's `seed:perf` reuses it). | Deterministic CI; real numbers in M12. |
| M11-D33 | §3.3, FR-1410 | PERSON picker = `/api/people/options` filtered `active` (M2 X09/X12), ordered by `compareThai(displayName)`, chips show display name + avatar + "ปิดใช้งาน" badge for deactivated ids; the `people` map is the only person data a database response carries. | No workload/leave/project leak. |
| M11-D34 | BR-98 | Isolation enforced three ways: (1) DDL has no FK to tasks/allocations/milestones/project_members (schema test asserts the FK list of the four tables); (2) a unit test greps `src/server/services/{grid,allocations,capacity,workload,home,my-tasks,teamTasks,timeline,milestones,people}.ts` and `src/domain/{capacity,allocation,overload,milestone}.ts` for `databases`/`database_` imports → none; (3) golden test: add PERSON/NUMBER/DATE cells (Mint, "5", this week) to a database on the POS charter → golden F1 grid, workload (M9) and POS members unchanged; the only new audit rows are `database`. | AC-1413. |
| M11-D35 | FR-1410, §8.9 | Option colours = 10 named tokens added to `tokens.css` (light + `.dark`): `--option-{gray,brown,orange,yellow,green,blue,purple,pink,red,teal}-bg/-fg`, each pair ≥ 4.5:1 (contrast test); stored `color` = the name; conversion BR-93 cycles in that order. SPEC "10 สีจาก token §8.7" is read as "token-defined colours"; §8.7 lists no 10-colour palette (Decision, not a deviation). | Chips always show the name (§8.9). |
| M11-D36 | FR-1410 BR-91 | Number display `formatNumberCell(value, { decimals: null \| 0..6, thousands })` from `roundDecimalString` (half-up on the string) + thousands with `,`; edit mode shows the stored canonical value; input accepts Thai digits, `,`, spaces, leading `+`. Date display `formatThaiDate(d, 'medium')`; input via the M3 `DateField` (Buddhist calendar) or typed (BR-92). URL cells render `<a target="_blank" rel="noopener noreferrer">` only when `isDbUrl`. | BR-91/92; FR-1410. |
| M11-D37 | FR-1475 | `DB_LIMITS` in `src/domain/database.ts` is the single source (rows 1,000 · columns 30 incl. TITLE · views 10 · databases/page 20 · options/column 100 · multi 20 · people 20 · db title 200 · column/view/option name 100 · row title 500 · text/url 2,000 · sorts 3 · filters 10 · rows/action 50 · width 80–600); zod schemas reference it; services re-check counts under the database lock; messages `th.database.errors.limit.*(max)`. | One number per limit. |
| M11-D38 | FR-680, FR-1453 | Databases may be owned by DOC **and** TASK pages (task bodies, D20); never by DB_ROW pages: the DB_ROW slash menu omits the three database items, paste converts a database block into a paragraph with its title (`toast th.editor.errors.databaseNotAllowed`), the server rejects it. | No nesting (§12 M11 "ห้ามทำ"). |
| M11-D39 | FR-1453, FR-691 | 📄 (`role="img"`, `aria-label th.database.rows.hasBody`) after the row title in table title cells, kanban/calendar cards and the panel title when `hasBody`; the open row body patches `hasBody` in `qk.database` (debounced 500 ms, M6.1-D11 pattern). | Same marker as tasks. |

DEVIATION summary: none expected. If S0.1's spike forces the KaTeX fallback version, or drizzle-kit cannot emit `ADD VALUE` (M11-D4 fallback), record a
Decision (not a Deviation — behaviour unchanged).

---

## 4. Streams (machine-readable)

DAG: `S0 → {S1, S5, S6}`; `S1 → {S2, S3}`; `{S1, S3, S5} → S4`; `{S1…S6} → S7`. S0 runs alone and may touch the M4/M6.1/M10 files its steps name (type
fallout of `PageKind = 'DOC' | 'TASK' | 'DB_ROW'`, the content schema, the editor schema stubs); after G0 those files belong to the stream whose globs cover them.
`src/i18n/th.ts` belongs to S0; afterwards (Edit tool only, own namespaces): S2 → `database.errors`, `audit` (keys starting `db`/`rowBody`), `search`;
S3 → `database` except `errors`, `kanban`, `calendar`, `rowPage`; S4 → `database.kanban`, `database.calendar`, `database.rowPage`, `palette`; S5 → `editor`.
`tests/helpers/**` belongs to S0 (requests afterwards).

```json
{ "milestone": 11,
  "streams": [
    { "id": "S0", "title": "Contracts: katex 0.19.1 install + r9-katex research spike; schema (enums, four database tables, pages.database_row_id, pages_kind_row ::text, batch indexes) + generated migration test-first with whole-journal-in-one-transaction test; PageKind DB_ROW fallout; DTOs (DatabaseResponse, RowBodyView, RowPageView, DatabaseSearchHit, action inputs/results) + zod (cell, view config, filters, all §7.9 actions, setPageFullWidth rowId); domain types; page-content BLOCK_TYPES database/equation + inlineEquation + checkBlockProps; content-text latex; option colour tokens + contrast pairs; authz signatures; audit entity; service/action/route stubs; query keys + invalidation; i18n namespaces; shortcuts; editor schema stubs + DatabaseBlockView stub + client DbApi contract + fakeDbApi; useFullWidth rowId; KaTeX loader; world part databases + factories", "agent": "backend-engineer",
      "owns": ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "plan/research/r9-katex.md",
               "src/server/db/schema.ts", "src/server/db/schema.int.test.ts", "src/server/db/migrations-m11.int.test.ts", "drizzle/**",
               "src/domain/types.ts", "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts",
               "src/lib/shortcuts.ts", "src/lib/shortcuts.test.ts", "src/lib/format.ts", "src/lib/format.test.ts", "src/i18n/th.ts",
               "src/app/tokens.css", "src/lib/theme/contrast.ts", "src/lib/theme/contrast.test.ts", "src/lib/theme/tokens.ts", "src/lib/theme/tokens.test.ts",
               "src/lib/editor/content-text.ts", "src/lib/editor/content-text.test.ts", "src/lib/editor/dictionary.ts", "src/lib/math/**",
               "src/server/authz.ts", "src/server/audit.ts", "src/server/page-helpers.ts",
               "src/server/services/databases.ts", "src/server/services/database-copy.ts", "src/server/services/row-pages.ts", "src/server/services/index.ts",
               "src/server/repo/databases.ts", "src/server/repo/index.ts", "src/server/actions/databases.ts", "src/server/actions/row-pages.ts", "src/server/actions/pages.ts",
               "src/app/api/pages/[id]/databases/**", "src/app/api/database-rows/**",
               "src/components/editor/schema.ts", "src/components/editor/schema.test.tsx", "src/components/editor/blocks/database/**",
               "src/components/editor/blocks/equation/**", "src/components/editor/inline/inline-equation.tsx", "src/components/editor/RowBody.tsx",
               "src/components/database/DatabaseBlockView.tsx", "src/components/database/data/contract.ts", "src/components/database/data/fakeDbApi.test-helper.ts",
               "src/components/layout/useFullWidth.ts", "src/components/layout/useFullWidth.test.tsx", "tests/helpers/**"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain src/domain/database.ts test-first (BR-90…97, limits, numbers BigInt, dates, URL, readCell/normalize, convertCell/convertColumn, compareRows, matchesFilters + ops, valuesFromFilters, groupRows + dropOnGroup multi-person, calendarMonth, defaultColumnName, applyView) with fast-check and the domain perf smoke", "agent": "domain-engineer",
      "owns": ["src/domain/database.ts", "src/domain/database/**", "src/domain/database*.test.ts"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Backend: requirePage DB_ROW branch + requireDatabase/Row/Column/View, repo/databases, getDatabase route, every §7.9 action with limits/versions/positions/audit, type change + revert, deletes/restores with bodies, row bodies (ensureRowBody, body route, getRowPageView, save rules, full width rowId, getPageView DB_ROW), detach reconcile in savePageContent + keepalive, deep copy (copyDatabase, duplicatePage, file copy), page delete/project delete behaviour, searchDatabases + /api/search, BR-98 isolation, perf smoke + addSyntheticDatabase", "agent": "backend-engineer",
      "owns": ["src/server/**", "src/app/api/**", "scripts/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S2" },
    { "id": "S3", "title": "Database UI core: DatabaseBlockView (header, title, view tabs, toolbar, not-found placeholder), data layer (useDatabase, useDbMutations: optimistic, undo, conflicts, temp ids), table view (virtualised grid, keyboard, selection, row drag, column drag/resize, footer), cell displays + editors for nine types, column menu + type config + options editor, sort/filter/columns menus, row panel + row-param, phone layout, tokens", "agent": "frontend-engineer",
      "owns": ["src/components/database/*.tsx", "src/components/database/*.ts", "src/components/database/data/**", "src/components/database/table/**",
               "src/components/database/cells/**", "src/components/database/menus/**", "src/components/database/panel/**", "src/components/database/toolbar/**",
               "src/lib/database/**"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Kanban view (groups, person groups, dnd-kit, Move to…, quick add, add group), calendar view (month grid, today, +N, add on day, no-date list, drag, phone day list), /r/[rowId] row page + /p redirect for DB_ROW, palette database group", "agent": "frontend-engineer",
      "owns": ["src/components/database/kanban/**", "src/components/database/calendar/**", "src/components/database/row-page/**",
               "src/app/(app)/r/**", "src/app/(app)/p/[pageId]/page.tsx", "src/components/palette/**"],
      "dependsOn": ["S1", "S3", "S5"], "planSection": "5.S4" },
    { "id": "S5", "title": "Editor: page context + island frame spike, database block spec (insert/create flow, placeholder states, isolation, undo routing), slash database group + equation items + ranking, DB_ROW kind rules (slash, paste, placeholder), copy/paste/cut deep-copy flow, RowBody, equation block + inline equation + toolbar button + popover + error state + lazy KaTeX, editor-theme tokens", "agent": "editor-engineer",
      "owns": ["src/components/editor/**", "src/lib/editor/**", "src/lib/math/**"],
      "dependsOn": ["S0"], "planSection": "5.S5" },
    { "id": "S6", "title": "Authz matrix rows PERM-24…26 + row bodies + page APIs on DB_ROW + search; masking/leak block; BR-98 golden isolation; coverage registry; race tests (ensureRowBody, concurrent cell edits, limits under concurrency, detach vs save)", "agent": "test-engineer",
      "owns": ["tests/authz/**", "tests/integration/**", "tests/golden/**"],
      "dependsOn": ["S0"], "planSection": "5.S6" },
    { "id": "S7", "title": "E2E m11-database (all views, all column types, type change, undo, copy/duplicate, detach, permissions + leaks, concurrency, limits, BR-98, row page, equations, phone, perf smoke, screenshots) + page objects + seed helpers; update older specs", "agent": "test-engineer",
      "owns": ["e2e/**"],
      "dependsOn": ["S1", "S2", "S3", "S4", "S5", "S6"], "planSection": "5.S7" }
  ],
  "e2e": ["e2e/m11-database.spec.ts"] }
```

Overlap check. Concurrent level 1 {S1, S5, S6}: `src/domain/database*` · `src/components/editor/**`, `src/lib/editor/**`, `src/lib/math/**` · `tests/{authz,integration,golden}/**`
— disjoint. Level 2 {S2, S3} (+ S5/S6 still running): `src/server/**`, `src/app/api/**`, `scripts/**` · `src/components/database/{top-level files, data, table, cells,
menus, panel, toolbar}/**`, `src/lib/database/**` — disjoint from each other and from S5/S6. S4 (`kanban/`, `calendar/`, `row-page/`, `app/(app)/r/**`,
`app/(app)/p/[pageId]/page.tsx`, `palette/**`) never overlaps S3's subfolders. S0's stubs inside `src/components/database/`, `src/components/editor/` and
`src/server/` are owned afterwards by S3, S5 and S2 respectively; `src/lib/math/**` passes from S0 to S5. Run with
`Workflow({ name: "implement-milestone", args: { milestone: 11 } })` or manually per PLAN §2.7 B.

---

## 5. Step-by-step

Conventions for every stream: test-first where a step lists tests; integration tests use `createWorld({ with: ['databases'] })`, `asUser`, factories, mocked
`next/cache`/`next/headers`; strings from `th`; pnpm only; streams never run `next dev`/`next build`/Playwright. No `Date` for plan or cell dates (ISO strings +
`src/domain/dates.ts`); numbers in cells are strings (BR-91) — never `Number()`/`parseFloat` on a cell value (lint rule below).

### 5.S0 — Contracts (backend-engineer · owns: see §4 S0)

Runs alone, ends at **G0** (`pnpm check` green). Behaviour implemented here: dependency, schema + migration (test-first), DTO/zod, content schema +
content-text (test-first), tokens, KaTeX loader, i18n, registries, factories/world, the client `DbApi` fake. Everything else is a typed stub
(`throw notImplemented('<name> (M11 S<n>)')`).

**S0.1 Preflight + KaTeX spike.** Tree clean on tag `m10`; `pnpm db:up`; `pnpm check` green; `pnpm db:generate` → "No schema changes". Run the §2.1 checks and
paste results into the report. Then `pnpm add katex@0.19.1 --save-exact` (the only install of the milestone); `pnpm ls katex`; confirm no install script
(`pnpm-workspace.yaml` unchanged unless pnpm asks). Spike (throwaway, not committed — or a worktree, PLAN §2.3 rule 9): a client component that calls
`loadKatex()` and renders `\int_0^1 x^2\,dx = \frac{1}{3}`; `pnpm build && pnpm start` on a free port; check (a) the CSS and fonts are under `/_next/static/`,
(b) a page without the component requests none of them, (c) no CSP violation (`font-src 'self'`, inline styles allowed), (d) `ParseError` for `\frac{1}{`,
(e) `trust: false` renders `\href{javascript:alert(1)}{x}` as an error/plain text. Write `plan/research/r9-katex.md` (version, licence, exports, the
options, CSS/font asset paths, lazy proof, CSP, fallback `0.16.47`). Inventory:
`grep -n "^export" src/server/authz.ts src/server/services/{pages,page-tree,task-pages,search}.ts src/lib/contracts/{pages,search,task-pages}.ts src/lib/schemas/{page-content,pages}.ts src/components/editor/{schema.ts,slash-menu.tsx,PageEditor.tsx}`
and `grep -rn "PageKind\|kind === 'TASK'\|'DOC' | 'TASK'" src | grep -v test`.

**S0.2 Schema + generated migration (test-first).** `schema.int.test.ts › M11` and `migrations-m11.int.test.ts` first (red):
- whole journal applied **in one transaction** on a scratch DB (`tests/helpers/migrate-partial.ts#applyJournal(sql)` without `upTo`) succeeds;
- `page_kind` = `DOC, TASK, DB_ROW`; `db_column_type` / `db_view_type` values exactly SPEC;
- inserting a DB_ROW page without `database_row_id`, a DOC page with one, and two pages for one row fail (`23514`, `23514`, `23505`); deleting a
  `database_rows` row cascades its page; deleting a page cascades its databases → columns/views/rows → row-body pages;
- `database_columns_one_title` rejects a second TITLE (`23505`); a deleted TITLE fails the check; `cells` must be an object; title lengths enforced;
- FK list of the four tables = only `pages`, `databases`, `"user"` (BR-98, M11-D34); every index of SPEC §6.2/§6.4 + the three batch indexes exist by name;
  `EXPLAIN` of `title ilike '%ลูกค้า%'` on `database_rows` with `enable_seqscan = off` uses `database_rows_title_trgm`.
```ts
// src/server/db/schema.ts (sketch — names explicit, positions orderKey, timestamps withTimezone)
export const pageKind = pgEnum('page_kind', ['DOC', 'TASK', 'DB_ROW'])   // M11 adds DB_ROW (drizzle emits ALTER TYPE … ADD VALUE)
export const dbColumnType = pgEnum('db_column_type', ['TITLE','TEXT','NUMBER','SELECT','MULTI_SELECT','DATE','CHECKBOX','PERSON','URL'])
export const dbViewType = pgEnum('db_view_type', ['TABLE','KANBAN','CALENDAR'])
export const databases = pgTable('databases', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references((): AnyPgColumn => pages.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''), version: integer('version').notNull().default(1),
  detachedAt: timestamp('detached_at', { withTimezone: true }),
  createdBy: text('created_by').notNull().references(() => user.id), updatedBy: text('updated_by').notNull().references(() => user.id),
  createdAt: …defaultNow(), updatedAt: …defaultNow(),
}, (t) => [index('databases_page_id_idx').on(t.pageId), index('databases_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
           check('databases_title_len', sql`length(${t.title}) <= 200`)])
// database_columns: type, name (check length(trim(name)) between 1 and 100), config jsonb default '{}', position orderKey, version, deleted_at, deleted_batch,
//   check (type <> 'TITLE' or deleted_at is null); uniqueIndex('database_columns_one_title').on(t.databaseId).where(sql`${t.type} = 'TITLE'`);
//   index('database_columns_db_pos_idx').on(t.databaseId, t.position).where(sql`${t.deletedAt} is null`); index('database_columns_batch_idx')…
// database_views: same shape with type db_view_type, config jsonb, 'database_views_db_pos_idx', 'database_views_batch_idx'
// database_rows: title (≤ 500), cells jsonb default '{}' check jsonb_typeof = 'object', position, version, created/updated by/at, deleted_at/batch;
//   'database_rows_db_pos_idx' (live), 'database_rows_title_trgm' (gin), 'database_rows_batch_idx'
// pages += databaseRowId: uuid('database_row_id').references((): AnyPgColumn => databaseRows.id, { onDelete: 'cascade' })
//   uniqueIndex('pages_database_row_id_unique').on(t.databaseRowId)
//   check('pages_kind_row', sql`(${t.kind}::text = 'DB_ROW') = (${t.databaseRowId} is not null)`)   // M11-D4: never an enum literal
```
`pnpm db:generate --name=m11_databases`; read the SQL (ADD VALUE present, no enum drop, checks as written, circular FK added after both tables). `pnpm db:migrate`
on the test template only (the dev DB is the integrator's; additive migration, no backup step needed). Export row types `DatabaseRow`, `DbColumnRow`,
`DbViewRow`, `DbRowRow`, `New*`.

**S0.3 Domain types (`src/domain/types.ts`, type-only, X91).**
```ts
export type DbColumnType = 'TITLE' | 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTI_SELECT' | 'DATE' | 'CHECKBOX' | 'PERSON' | 'URL'
export type DbViewType = 'TABLE' | 'KANBAN' | 'CALENDAR'
export type CellValue = string | string[] | true                       // BR-90 (NUMBER = canonical decimal string)
export type OptionColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red' | 'teal'
export interface SelectOption { id: string; name: string; color: OptionColor }
export interface SelectConfig { options: SelectOption[] }
export interface NumberConfig { decimals: number | null; thousands: boolean }
export type ColumnConfig = SelectConfig | NumberConfig | Record<string, never>
export interface DbColumnModel { id: string; type: DbColumnType; name: string; config: ColumnConfig; position: string }
export interface DbRowModel { id: string; title: string; cells: Record<string, unknown>; position: string }   // unknown: stored shapes are read tolerantly
export type FilterOp = 'contains' | 'notContains' | 'equals' | 'isEmpty' | 'isNotEmpty' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'isAnyOf' | 'isNoneOf' | 'hasAnyOf' | 'hasAllOf' | 'hasNoneOf' | 'is' | 'before' | 'after' | 'onOrAfter' | 'onOrBefore'
  | 'checked' | 'unchecked' | 'hasAny' | 'hasNone'
export type DateRef = { kind: 'date'; date: ISODate } | { kind: 'today' }
export interface ViewFilter { columnId: string; op: FilterOp; value?: string | string[] | DateRef }
export interface ViewSort { columnId: string; dir: 'ASC' | 'DESC' }
export interface ViewConfig { hiddenColumnIds?: string[]; columnWidths?: Record<string, number>; sorts?: ViewSort[]; filters?: ViewFilter[]
  groupByColumnId?: string; hideEmptyGroups?: boolean; dateColumnId?: string; cardColumnIds?: string[] }
export interface DbPersonRef { name: string; nickname: string | null; color: string | null; deactivated: boolean }
export interface DbCtx { people: ReadonlyMap<string, DbPersonRef>; viewerId: string; today: ISODate; collator?: Intl.Collator }
export const ME_TOKEN = '@me'   // ← a value, so it lives in database.ts; types.ts gets `type MeToken = '@me'`
```

**S0.4 DTO contracts (`src/lib/contracts/databases.ts`, `pages.ts`, `search.ts`, `row-pages.ts`).**
```ts
export interface DbColumnDTO { id: string; type: DbColumnType; name: string; config: ColumnConfig; position: string; version: number }
export interface DbViewDTO { id: string; type: DbViewType; name: string; config: ViewConfig; position: string; version: number }
export interface DbRowDTO { id: string; title: string; cells: Record<string, CellValue>; position: string; version: number; hasBody: boolean
  createdBy: string; createdAt: string; updatedBy: string; updatedAt: string }
export interface DatabaseResponse { id: string; pageId: string; title: string; version: number; canEdit: boolean
  columns: DbColumnDTO[]; views: DbViewDTO[]; rows: DbRowDTO[]; people: Record<string, DbPersonRef> }
export interface ChangeColumnTypeResult { column: DbColumnDTO; rows: DbRowDTO[] /* changed rows */
  previous: { type: DbColumnType; config: ColumnConfig; columnVersion: number; values: Record<string, CellValue> } }
export interface CreateDatabaseResult { databaseId: string; database: DatabaseResponse }
export interface DeleteBatchResult { batch: string }
// row-pages.ts
export interface RowBodyPage { id: string; version: number; content: unknown[]; fullWidth: boolean; isBlank: boolean }
export interface RowBodyView { rowId: string; databaseId: string; ownerPageId: string; page: RowBodyPage | null; can: { edit: boolean }; uploadLimits: UploadLimits }
export interface RowPageView { row: { id: string; title: string; databaseId: string }
  database: { id: string; title: string; ownerPageId: string }
  owner: { kind: 'DOC' | 'TASK'; pageId: string; title: string; href: string; projectId: string | null; projectName: string | null; archived: boolean }
  body: RowBodyView }
export interface EnsureRowBodyResult { pageId: string; version: number; created: boolean }
// pages.ts: PageKind = 'DOC' | 'TASK' | 'DB_ROW'; PageDTO += rowId: string | null; SetPageFullWidth target incl. rowId
// search.ts: DatabaseSearchHit (M11-D28); SearchResponse += databases: DatabaseSearchHit[]
```
Fix compile fallout of the wider `PageKind` (`dictionaryFor`, `PageEditor` slash ctx, `pageCan`, `getPageView` — DB_ROW branches stubbed to TASK-like
behaviour; S2/S5 finish them).

**S0.5 zod (`src/lib/schemas/databases.ts`, `row-pages.ts`, `pages.ts`).** `cellValueSchema = z.union([z.string().max(2000), z.array(z.string().max(64)).max(20), z.literal(true)])`;
`cellsPatchSchema = z.record(z.uuid(), cellValueSchema.nullable()).refine(n ≤ 30)`; `viewConfigSchema` (`.strict()`, widths 80–600 ints, sorts ≤ 3, filters ≤ 10,
`value` shape by op family: string ≤ 2000 · string[] ≤ 100 · `{ kind: 'date', date: z.iso.date() } | { kind: 'today' }`); `columnConfigSchema` (options ≤ 100,
`id` optional on input — server assigns, name 1–100 trimmed, colour enum; number `decimals` 0–6 or null); one schema per action of §7.9 with
`databaseId`/`rowId`/`columnId`/`viewId`/`pageId` as `z.uuid()`, `baseVersion: z.number().int().positive()`, `rows.max(50)`, `rowIds.max(1000)`,
`afterXId: z.uuid().nullable().optional()`; `ensureRowBodySchema`, `rowBodyParamsSchema`, `databaseParamsSchema = z.object({ id: z.uuid(), databaseId: z.uuid() })`;
`setPageFullWidthSchema` → exactly one of `pageId | taskId | rowId`. Tests: `databases.test.ts` (each limit ±1, strict config, filter value shapes, both/none ids).

**S0.6 Authz signatures (`src/server/authz.ts`).** `requireDatabase`, `requireDbRow`, `requireDbColumn`, `requireDbView`, `canEditDatabase` per M11-D6 (bodies
by S2; S0 bodies throw `notImplemented`); `PageAccess.dbRow` field added (null everywhere for now); the DB_ROW branch in `accessForPage` stubbed to
`NotFoundError` (safe default). `DatabaseAccess { database: DatabaseRow; owner: PageAccess; canEdit: boolean }`.

**S0.7 Stubs.** `services/databases.ts` (`getDatabase`, `createDatabase`, `renameDatabase`, `createRows`, `updateRow`, `deleteRows`, `restoreRowBatch`,
`createColumn`, `updateColumn`, `duplicateColumn`, `changeColumnType`, `revertColumnType`, `deleteColumn`, `restoreColumnBatch`, `createView`, `updateView`,
`deleteView`, `restoreViewBatch`, `reconcileDetached`, `collectDatabaseIds` re-export), `services/database-copy.ts` (`copyDatabaseInto`, `copyDatabase`,
`copyPageDatabases`), `services/row-pages.ts` (`ensureRowBody`, `getRowBodyView`, `getRowPageView`), `repo/databases.ts`; `actions/databases.ts` (every §7.9
action name verbatim: `createDatabase`, `copyDatabase`, `renameDatabase`, `createDatabaseRows`, `updateDatabaseRow`, `deleteDatabaseRows`,
`restoreDatabaseRowBatch`, `createDatabaseColumn`, `updateDatabaseColumn`, `duplicateDatabaseColumn`, `changeDatabaseColumnType`,
`revertDatabaseColumnType`, `deleteDatabaseColumn`, `restoreDatabaseColumnBatch`, `createDatabaseView`, `updateDatabaseView`, `deleteDatabaseView`,
`restoreDatabaseViewBatch`), `actions/row-pages.ts` (`ensureRowBody`); routes `GET /api/pages/[id]/databases/[databaseId]` and
`GET /api/database-rows/[id]/body` (params parsed → 404 first); `services/search.ts` gets `searchDatabases` stub returning `[]` and the route adds
`databases: []` (M10 tests stay green); `page-helpers.ts#rowIdOfRowPage(view)`. `audit.ts`: `AuditEntity` += `'database'`.

**S0.8 Query keys + invalidation.** `qk.database(pageId, databaseId) = ['databases', pageId, databaseId]`, `qk.rowBody(rowId) = ['databases', 'rowBody', rowId]`,
`qkPrefix.databases = ['databases']`; `invalidate.ts`: `invalidateDatabase(qc, pageId, databaseId)`, `patchDatabase(qc, pageId, databaseId, fn)`,
`patchRowHasBody(qc, pageId, databaseId, rowId, hasBody)`; `invalidatePages` unchanged. Tests in `invalidate.test.ts`.

**S0.9 Content schema + content text (test-first).** `page-content.ts`: `BLOCK_TYPES` += `'database'`, `'equation'`; `Inline` union += `InlineEquation =
z.object({ type: z.literal('inlineEquation'), props: z.object({ latex: z.string().max(2000) }) })`; `checkBlockProps` branches: `database` → props only
`databaseId` (uuid or `''`), no content, no children; `equation` → `latex` string ≤ 2,000, no content/children. `content-text.ts`: `equation` block pushes
`props.latex`; inline `inlineEquation` appends `props.latex` (no separator, like other runs); `database` contributes nothing (FR-1474); export
`collectDatabaseIds(doc): Set<string>` and `remapContentIds(doc, { pages?: Map, databases?: Map })` (`remapSubpageIds` delegates). Tests first:
`content-text.test.ts › latex` (block + inline + nested in a list + table cell), `› database adds nothing`, `collectDatabaseIds` (depth, invalid ids ignored),
`remapContentIds` (no mutation, both maps); `page-content.test.ts › database/equation/inlineEquation` (valid, 2,001 chars, extra props, children rejected).

**S0.10 Editor schema stubs (`src/components/editor/**`, S5 finishes).** `blocks/database/spec.tsx` (`createReactBlockSpec({ type: 'database', propSchema: {
databaseId: { default: '' } }, content: 'none' }, { render: () => <DatabaseBlockView … /> stub })`), `blocks/equation/spec.tsx`, `inline/inline-equation.tsx`
(render the raw source in `<code>`), registered in `schema.ts`; `schema.test.tsx` parity (`Object.keys(schema.blockSpecs)` = `BLOCK_TYPES`, inline specs
include `inlineEquation`). `RowBody.tsx` stub (renders `EditorClient` when `view.page`, else the placeholder). `src/components/database/DatabaseBlockView.tsx`
stub: `export function DatabaseBlockView(p: { pageId: string | null; databaseId: string; blockId: string; variant: 'page' | 'compact'; editable: boolean }): JSX.Element`
→ a sized skeleton + `data-testid="db-block"`.

**S0.11 KaTeX loader (`src/lib/math/**`, S5 owns afterwards).** `load-katex.ts` (memoised dynamic import of `./katex-runtime`), `katex-runtime.ts`
(`import katex from 'katex'; import 'katex/dist/katex.min.css'; export const KATEX_OPTIONS = {…M11-D29…}; export function renderLatex(src, displayMode):
{ ok: true; html: string } | { ok: false; message: string }`), `katex.test.ts` (valid, `\frac{1}{` → ok:false, `\href{javascript:…}` not a link, output contains
`<math`, source > 2,000 rejected before render).

**S0.12 Client `DbApi` contract (`src/components/database/data/contract.ts`) + fake.**
```ts
export interface DbApi {
  db: DatabaseResponse; canEdit: boolean; viewerId: string; today: ISODate
  renameDatabase(title: string): void
  createRows(rows: { title?: string; cells?: Record<string, CellValue>; afterRowId?: string | null }[], opts?: { focusTitle?: boolean }): Promise<string[]>
  updateRow(rowId: string, patch: { title?: string; cells?: Record<string, CellValue | null>; move?: { afterRowId: string | null } }, label?: string): void
  deleteRows(rowIds: string[]): void
  createColumn(type: DbColumnType, opts?: { name?: string; afterColumnId?: string | null }): Promise<string>
  updateColumn(columnId: string, patch: { name?: string; config?: ColumnConfig; afterColumnId?: string | null }): void
  duplicateColumn(columnId: string): void; changeColumnType(columnId: string, type: DbColumnType): void; deleteColumn(columnId: string): void
  addOption(columnId: string, name: string): Promise<string>   // returns the server id (temp id meanwhile)
  createView(type: DbViewType, opts?: { copyFromViewId?: string }): Promise<string>
  updateView(viewId: string, patch: { name?: string; config?: ViewConfig; afterViewId?: string | null }, label?: string): void
  deleteView(viewId: string): void
}
export const DbApiContext: Context<DbApi | null>; export function useDbApi(): DbApi
```
`fakeDbApi.test-helper.ts`: an in-memory implementation (same semantics, synchronous, records calls) used by S3/S4 ui tests.

**S0.13 i18n (`src/i18n/th.ts`).** New namespace `database` with sub-keys (owners per §4): `untitled: 'ฐานข้อมูลไม่มีชื่อ'`, `notFound: 'ไม่พบฐานข้อมูล'`,
`loading`, `creating: 'กำลังสร้างฐานข้อมูล…'`, `copying: 'กำลังคัดลอกฐานข้อมูล…'`, `types.{TITLE: 'ชื่อ', TEXT: 'ข้อความ', NUMBER: 'ตัวเลข', SELECT: 'ตัวเลือก',
MULTI_SELECT: 'หลายตัวเลือก', DATE: 'วันที่', CHECKBOX: 'ช่องติ๊ก', PERSON: 'คน', URL: 'ลิงก์'}`, `defaults.{status: 'สถานะ', date: 'วันที่', title: 'ชื่อ',
statusOptions: ['ยังไม่เริ่ม','กำลังทำ','เสร็จ']}`, `views.{TABLE: 'ตาราง', KANBAN: 'คัมบัง', CALENDAR: 'ปฏิทิน', add, rename, duplicate, delete, defaultName(type, n)}`,
`toolbar.{sort: (n) => …, filter: (n) => …, columns: 'คอลัมน์', more, clearFilters: 'ล้างตัวกรอง'}`, `table.{newRow: '+ แถวใหม่', count: (n) => \`${n} แถว\`,
countOf: (n, m) => \`${n} จาก ${m} แถว\`, selectRow, deleteSelected: 'ลบ', untitledRow: 'ไม่มีชื่อ', openRow: 'เปิด'}`, `columnMenu.{rename, changeType, config,
sortAsc: 'เรียงน้อย→มาก', sortDesc: 'เรียงมาก→น้อย', filter: 'กรอง', hide: 'ซ่อนในมุมมองนี้', insertLeft: 'แทรกคอลัมน์ซ้าย', insertRight: 'แทรกคอลัมน์ขวา',
duplicate: 'ทำสำเนาคอลัมน์', delete: 'ลบ', decimals, decimalsAuto: 'ตามค่าจริง', thousands: 'คั่นหลักพัน', options, addOption, optionColor}`,
`filters.ops.*`, `filters.{me: 'ฉัน', today: 'วันนี้', add, remove}`, `cells.{deactivated: 'ปิดใช้งาน', pickPerson, emptyDate, invalidNumber, invalidDate,
invalidUrl, createOption: (name) => …}`, `kanban.{groupBy: 'จัดกลุ่ม', noValue: 'ไม่มีค่า', checked: 'ติ๊กแล้ว', unchecked: 'ยังไม่ติ๊ก', hideEmpty: 'ซ่อนกลุ่มที่ว่าง',
cardProps: 'คุณสมบัติบนการ์ด', add: '+ เพิ่ม', addGroup: '+ เพิ่มกลุ่ม', moveTo: 'ย้ายไป…', pickGroupColumn: 'เลือกคอลัมน์สำหรับจัดกลุ่ม'}`, `calendar.{prev, next,
today: 'วันนี้', more: (n) => \`+${n} เพิ่มเติม\`, noDate: (n) => \`ไม่มีวันที่ (${n})\`, pickDateColumn: 'เลือกคอลัมน์วันที่', addOnDay}`,
`panel.{prev, next, close, openAsPage: 'เปิดเป็นหน้า', deleteRow, addColumn: '+ เพิ่มคอลัมน์', createdBy: (n, at) => …, updatedBy, copyLink: 'คัดลอกลิงก์แถว'}`,
`rowPage.{metaTitle, notFound: 'ไม่พบแถว'}`, `rows.hasBody: 'มีเนื้อหา'`, `toasts.{conflict: 'มีคนแก้ข้อมูลนี้พร้อมกัน — โหลดค่าล่าสุดแล้ว',
typeChanged, saveFailed: 'บันทึกไม่สำเร็จ · ลองใหม่', typeConverted: 'เปลี่ยนชนิดคอลัมน์แล้ว', rowsDeleted: (n) => \`ลบ ${n} แถว\`, columnDeleted, viewDeleted,
optionDeleted, revertBlocked}`, `errors.{lastView, titleColumn, limit: { rows(max), columns(max), views(max), databases(max), options(max), multi(max), people(max),
rowsPerAction(max), sorts(max), filters(max) }, badValue, unknownColumn, inactivePerson, badUrl, nesting}`, `undo.*` labels. `editor`: `slash.databaseTable`,
`slash.databaseKanban`, `slash.databaseCalendar` (title, subtext, aliases, group `'ฐานข้อมูล'`), `slash.equation`, `slash.inlineEquation`, `equation.{placeholder:
'พิมพ์สมการ (LaTeX)', invalid: 'สมการไม่ถูกต้อง', toolbar: 'สมการ', confirmHintInline, confirmHintBlock, label}`, `errors.databaseNotAllowed`, `rowPlaceholder:
'เพิ่มเนื้อหา… พิมพ์ / เพื่อแทรก'`. `palette.groups.databases: 'ฐานข้อมูล'`, `palette.matchedInRow`. `audit`: `dbCreated(t)`, `dbCopied(t)`, `dbRenamed(t)`,
`dbRowsCreated(t, n)`, `dbRowUpdated(t)`, `dbRowsDeleted(t, n)`, `dbRowsRestored(t, n)`, `dbColumnCreated/Updated/Duplicated/TypeChanged/TypeReverted/Deleted/
Restored(t)`, `dbViewCreated/Updated/Deleted/Restored(t)`, `rowBodyCreated(t)`, `rowBodySaved(t)`. `shortcuts.scopes.database`, items per §8.6 database row.

**S0.14 Shortcuts (`src/lib/shortcuts.ts`).** Scope `'database'` with the §8.6 rows (arrows, Enter, Esc, Tab/Shift+Tab, Delete, Space) and scope `'equation'`
(`Enter` inline, `Mod+Enter` block, `Esc`); ids unique; labels from `th`.

**S0.15 Tokens.** `tokens.css` option pairs (M11-D35) light + `.dark`; `tokens.ts` `OPTION_COLORS` mirror; `contrast.ts` `TEXT_PAIRS` += 20 pairs; contrast test green
(this settles the hex values). `format.ts#formatThaiMonthYear(isoMonthStart)` ("พฤศจิกายน 2569") + test (UTC build like `formatThaiDate`).

**S0.16 `useFullWidth` target `{ rowId }`** (union + action call + test).

**S0.17 Test helpers (`tests/helpers/**`).** World part `'databases'` (append to `WorldPart`, `WORLD_PART_ORDER` last, `WORLD_PART_IMPLIES.databases =
['pages', 'taskBodies', 'files']`):
`w.databases = { dbP (on pPage, title 'ฐานข้อมูล P-ลับ20', columns: title, สถานะ SELECT, วันที่ DATE, ข้อความ TEXT, ตัวเลข NUMBER, หลาย MULTI_SELECT,
ติ๊ก CHECKBOX, คน PERSON, ลิงก์ URL; views table/kanban(สถานะ)/calendar(วันที่); rows pRow1 'แถว P-ลับ21' (all cells; คน = [member]), pRow2, pRow3),
pRowBody (DB_ROW page of pRow1, 'เนื้อหาแถว P-ลับ22' + image pRowImage), pRowNoBody = pRow2, dbPDetached (on pPage, detached), dbTask (on
taskBodies.pLeafBody, 1 row), dbA (on aPage, 'ฐานข้อมูล A-ลับ26', row + body aRowBody), dbQ (on qPage, 'ฐานข้อมูล Q-ลับ23', row 'แถว Q-ลับ24'), dbWiki (on
wiki, row 'แถว W-25' + body wikiRowBody), dbWikiProt (on wikiProtected, 1 row), dbDeletedPage (on deletedPages.pDeleted) }`, batches `w.batches.dbRows`
(deleted pRowDeleted + its body), `dbColumn` (deleted column `ลบแล้ว` of dbP), `dbView` (deleted view of dbP). Factories `makeDatabase({ page, title?, detached?,
columns?, views? })` (defaults per M11-D10), `makeDbColumn`, `makeDbView`, `makeDbRow({ database, title, cells, deleted? })`, `makeRowBody({ row, content?,
deleted? })`. `world.int.test.ts` shape test.

**S0.18 G0.** `pnpm check` (incl. `migrations-m11`, `schema.int.test.ts`, content-text, schemas, contrast, katex); `pnpm db:generate` → "No schema changes";
`pnpm exec drizzle-kit check`. Report: §2.1 results, migration SQL, KaTeX spike results, token hex values.

### 5.S1 — Domain `src/domain/database.ts` (domain-engineer · test-first)

`src/domain/database.ts` re-exports `src/domain/database/{limits,number,date,url,cells,convert,sort,filter,group,calendar,view}.ts`; pure (no DB/Next/React);
`src/domain/**` coverage ≥ 95 %. Every step: write `src/domain/database.<area>.test.ts` (tables of SPEC cases + fast-check properties) first.

- **S1.1 `limits.ts`:** `DB_LIMITS` (M11-D37), `ME_TOKEN = '@me'`, `OPTION_COLORS`.
- **S1.2 `number.ts` (BR-91):** `CANONICAL_DECIMAL_RE` (SPEC regex), `isCanonicalDecimal`, `parseNumberInput(raw): { ok: true; value: string | null } | { ok: false }`
  (trim, strip `,` and spaces, Thai digits, leading `+`, `-0` → `0`, strip trailing zeros, `"1."` ok, `.5` → `0.5`, > 15 integer digits / > 6 decimals → fail,
  empty → `null`); `toScaled(v): bigint` (×10⁶), `compareDecimal`, `roundDecimalString(v, decimals)` (half-up on digits, carries `9.995 → 10.00`, negative
  half-up away from zero: `-0.5 → -1` at 0 decimals — state and test the rule), `formatNumberCell(v, cfg)`. Properties: parse ∘ format(decimals=null) = identity
  on canonical strings; `compareDecimal` agrees with BigInt; AC-1402 `1234567.891234` exact; `0.1` + 2 decimals = `0.10`.
- **S1.3 `cells.ts` (BR-90):** `isDbUrl` (http/https/mailto, no control chars, `javascript:` false); `normalizeCellInput(col, input, ctx & { stored?: unknown;
  activeUserIds: ReadonlySet<string> }): { ok: true; value: CellValue | null } | { ok: false; reason }` per M11-D15; `readCell(col, stored): CellValue | null`
  (tolerant: wrong shapes → null, unknown option ids filtered out, empty array → null — FR-1416); `cellText(col, value, ctx)` (BR-93 step 4 texts:
  options joined `, `, `✓`, person full names `, `, canonical numbers, ISO dates); `isEmptyCell`.
- **S1.4 `date.ts` (BR-92):** `parseDateInput(raw, today)` → `ISODate | null | 'invalid'` (`YYYY-MM-DD`, `D/M/YYYY` with year ≥ 2400 → −543, `D/M` → year of `today`,
  Thai digits; 31/2 → invalid) using `src/domain/dates.ts` only.
- **S1.5 `url.ts`** (if not in cells) — shared with S3.
- **S1.6 `view.ts`:** `defaultColumnName(type, existingNames)` ("ข้อความ", "ตัวเลข 2"… names passed in by caller to stay i18n-free: `baseName` param),
  `visibleColumns(cols, view)` (TITLE always first? — no: TITLE pinned first in TABLE, database order otherwise), `liveConfig(view, cols)` (drops references
  to missing columns → suspended sorts/filters/group), `applyView(rows, view, cols, ctx)` = filter ∘ sort.
- **S1.7 `convert.ts` (BR-93):** `convertCell(from, to, value, ctx)` and `convertColumn(col, toType, rows, ctx & { newId(): string; users: { id; name; nickname;
  email; active }[] }): { config: ColumnConfig; values: Map<rowId, CellValue | null> }` — every rule of BR-93 incl. SELECT/MULTI creation from unique texts
  in order of appearance, palette cycling, > 100 options / > 20 values → empty, PERSON resolution (exactly one active match by full name/nickname/email,
  case-insensitive; ambiguous dropped), TITLE in either direction → throws `DbDomainError('TITLE')`. AC-1406 vectors (`"12"`, `"abc"`, `"1,500"` → `12`, empty, `1500`).
  Property: converting to the same type is identity; TEXT → NUMBER → TEXT keeps canonical numbers.
- **S1.8 `sort.ts` (BR-94):** `makeCollator()` = `Intl.Collator('th', { numeric: true, sensitivity: 'base' })`; `compareRows(a, b, sorts, cols, ctx)`; `sortRows`;
  empties last in both directions; CHECKBOX unticked < ticked; multi/person lexicographic over values; ties `position` (`<`, not `localeCompare`) then `id`.
  Property: total order, stable, empties last for random rows.
- **S1.9 `filter.ts` (BR-95) + `group.ts` (BR-96):** `filterOpsFor(type)`, `isFilterComplete(f, col)`, `matchesFilters(row, filters, cols, ctx)` (AND, skipped
  incomplete/missing-column filters, negative ops pass empties, `'@me'`, `today`, deleted options = empty); `valuesFromFilters(filters, cols, ctx)` (M11-D23);
  `groupRows(rows, view, cols, ctx)` → `{ ok: true; groups: { key: GroupKey; label…; rows }[] } | { ok: false; reason: 'NO_GROUP_COLUMN' }` with `GroupKey =
  { kind: 'option'; id } | { kind: 'person'; id } | { kind: 'checked' } | { kind: 'unchecked' } | { kind: 'none' }`, order per BR-96, multi-person rows in every
  person group, `hideEmptyGroups`; `dropOnGroup(row, col, from, to): CellValue | null` (A→B replace in place, B already present → remove A, A→none remove,
  none→B `[B]`, SELECT/CHECKBOX set/clear). AC-1404 vectors (Cindy+Ivy → Mint+Ivy → Mint).
- **S1.10 `calendar.ts` (BR-97):** `calendarMonth({ year, month }, rows, dateColumnId, sorts, cols, ctx)` → `{ weeks: { date: ISODate; inMonth: boolean;
  rows: DbRowModel[] }[][]; noDate: DbRowModel[] }` — `weekStart(first)` … Sunday of the last week (4–6 weeks); out-of-month days carry their rows; in-day
  order BR-94. Vectors: Nov 2026 (starts Sunday → 6 rows? compute: 2026-11-01 is a Sunday → weeks from Mon 2026-10-26), Feb 2027, a 4-week February.
- **S1.11 `index`:** barrel `src/domain/database.ts`; `DbDomainError`.
- **S1.12 Perf smoke `database.perf.test.ts`:** 1,000 rows × 20 columns (fast-check generator) → `applyView` with 3 sorts + 10 filters and `groupRows` by person:
  log ms; fail > 200 ms (M11-D32).
Done-check: `pnpm vitest run --project unit src/domain/database*` (+ coverage ≥ 95 % for these files) · lint · typecheck (owned).

### 5.S2 — Backend (backend-engineer · owns `src/server/**`, `src/app/api/**`, `scripts/**`)

Every step: integration tests first (`src/server/services/*.int.test.ts`), then code. Shape: `zod → authz → service → audit`, one transaction; no `refresh()`
(the client owns the cache); services take `today` where they parse dates.

- **S2.1 Authz.** `authz.databases.int.test.ts` (first): requireDatabase view/edit for M/L/Me/W on dbP, dbA (edit 403), dbWiki (all), dbWikiProt (workers edit
  403), dbQ (W allowed), dbTask (task rules), dbDeletedPage (404), page mismatch 404; requireDbRow on a deleted row 404 (restore path uses `includeDeleted`);
  `requirePage(pRowBody, view|edit|protect)` per M11-D6; `requireDocPage(pRowBody)` 404. Implement.
- **S2.2 Repo (`repo/databases.ts`).** `getDatabase`, `lockDatabase(tx, id)` (`FOR UPDATE`), `listLiveColumns/Views/Rows(databaseId)` (one query each, ordered),
  `countLiveRows`, `countAttached(pageId)`, `insertRows`, `updateRowVersioned`, `softDeleteRows(ids, batch)` (+ bodies), `listBatch(kind, batch)`, `restoreBatch`,
  `neighbourKeys(table, databaseId, afterId)`, `rowBodyRow(rowId)`, `insertRowBodyIfMissing`, `peopleRefs(ids)`, `hasBodyByRow(databaseId)` (M6.1-D11 rule).
- **S2.3 `getDatabase` + route.** M11-D7, M11-D19. Tests: shape, ordering, `people` keys exactly name/nickname/color/deactivated, canEdit per role, detached still
  served, 1,000-row JSON contains no `email`.
- **S2.4 `createDatabase` / `renameDatabase` / `copyDatabase` actions.** M11-D10/D12/D14. Tests: defaults (3 columns, 3 options, view config), each view type, limit 20
  (21st → 400), DB_ROW owner → 400, concurrent creates on one page never exceed 20 (lock), rename version conflict returns `current`, audit rows.
- **S2.5 Rows.** `createDatabaseRows` (≤ 50, `afterRowId`, cells validated, limit 1,000 under lock, returns rows), `updateDatabaseRow` (M11-D15 merge,
  `move`, version), `deleteDatabaseRows` (batch + bodies + leases), `restoreDatabaseRowBatch` (authz, 30 days, limit). Tests: every BR-90 type valid/invalid
  (incl. AC-1402 vectors, `javascript:` → 400, inactive person new → 400, inactive person kept → ok), unknown/deleted column key → 400, stale version → 409 +
  current, move without sorts, 1,001st row → 400, bodies deleted/restored with rows (AC-1414 last clause).
- **S2.6 Columns.** create (type, default name via `th.database.types`/numbering, `afterColumnId`, ≤ 30), update (name/config/order; options get server ids;
  option removal leaves cells), duplicate (with values, name "… (สำเนา)"), changeType + revert (M11-D16; AC-1406 vectors end-to-end through SQL; revert
  blocked when column changed), delete (TITLE → 400) + restore. Tests incl. `cells` of deleted columns retained and restored.
- **S2.7 Views.** create (copyFromViewId, auto columns M11-D10, ≤ 10), update (config validated against live + soft-deleted column ids of the database; unknown
  ids → 400; read-only → 403), delete (last → 400) + restore. Tests.
- **S2.8 Audit.** One row per action (M11-D5) — test helper asserts `after` never contains a cell value or row title (scan for the world's secret strings).
- **S2.9 Row bodies.** `ensureRowBody` + action, `getRowBodyView` + route, `getRowPageView` (owner kind DOC/TASK: title, href `/p/<id>` or `/t/<taskId>`,
  project name/archived), `savePageContent` DB_ROW rules + audit summary (`saveAuditInput` DB_ROW branch, keepalive route too), `pageCan`/`getPageView` DB_ROW,
  `setFullWidth` `{ rowId }` (silent ensure, 1 audit), files on row bodies (`POST /api/files` stores owner's project_id; download 404 for W). Tests mirror
  `task-pages.int.test.ts`.
- **S2.10 Deep copy.** `copyDatabaseInto` (M11-D11) + `copyDatabase` + `duplicatePage` extension (+ `remapContentIds`). Tests (`database-copy.int.test.ts`):
  ids all new, cells/config/filter values remapped (option ids too), deleted objects not copied, bodies copied and independent (edit copy → source unchanged),
  P → Q page copies files (new `files` rows with `project_id = Q`, bytes exist, source file untouched, W of P cannot read the new file? (W is Q member → can)),
  same-project duplicate reuses files, target limit, rollback leaves no stray files (best-effort removal asserted).
- **S2.11 Detach reconcile.** M11-D9 in `savePageContent` (DOC/TASK). Tests (`pages.int.test.ts › detach reconcile`): remove block → detached; restore → attached;
  foreign id in content → foreign database untouched; keepalive path; TASK owner.
- **S2.12 Page/project lifecycle.** Tests: page soft delete → GET 404, search none; restore → back; task delete (TASK owner) → 404 / restore back; project
  permanent delete → all four tables empty for that project's pages, row-body files unlinked (`listProjectFileKeys` covers them).
- **S2.13 Search.** `searchDatabases` (M11-D28) + `/api/search` merge. Tests (`search.databases.int.test.ts`): Ivy finds 'P-ลับ21' (row) / 'P-ลับ20' (db) /
  'P-ลับ22' (body, ≥ 3 chars); W finds none of them and the JSON lacks 'P-ลับ'; detached excluded; deleted page excluded; deleted row excluded; cells
  ('ข้อความ' values) never match; wiki rows visible to all; `titleOnly` empty; ≤ 8; statement timeout keeps title hits.
- **S2.14 BR-98.** `tests` live in S6; here: ensure no planning service imports the repo (`br98-imports.test.ts` belongs to S6 — S2 just complies).
- **S2.15 Perf + builder.** `scripts/lib/perf-data.ts#addSyntheticDatabase(db, { pageId, rows = 1000, columns = 20 })` (all types, realistic values, no audit);
  `databases.perf.int.test.ts` (M11-D32). Done-check: `pnpm vitest run --project integration src/server` · `pnpm eslint src/server src/app/api scripts` · typecheck (owned).

### 5.S3 — Database UI core (frontend-engineer · owns: see §4 S3)

Test with `fakeDbApi` (S0.12) and `renderWithProviders`; CSS Modules + tokens only (token-scale scan of `src/components/database/**` via the repo test — keep it
clean); dark mode via tokens; strings from `th.database`.

- **S3.1 Data layer (`data/useDatabase.ts`, `data/useDbMutations.ts`, `data/DbApiProvider.tsx`) — test-first `useDbMutations.test.tsx`.** Query per M11-D20;
  real `DbApi` implementation: optimistic patch → action via `unwrap` → reconcile server DTO; temp ids → server ids; undo entries per M11-D20 (labels from
  `th.database.undo`); `VERSION_CONFLICT` → replace with `current` + toast; `VALIDATION` → rollback + toast + refetch; scope `db:<id>`. Tests: cell edit visible
  synchronously, rollback on failure, conflict path, undo of a value writes the previous value with the latest version, delete rows → toast with "เลิกทำ" calls
  `restoreDatabaseRowBatch`, type change undo calls `revertDatabaseColumnType(previous)`.
- **S3.2 `DatabaseBlockView` (replaces the S0 stub).** Loading skeleton (final height), not-found box (FR-1464: grey box, icon + `th.database.notFound` only),
  header (`DatabaseHeader`: inline title with placeholder `untitled`, autofocus when just created), `ViewTabs`, toolbar (`⇅ เรียง n`, `⏷ กรอง n`, `☰ คอลัมน์`,
  ⋯), the active view (TABLE here; KANBAN/CALENDAR via lazy imports of S4's `KanbanView`/`CalendarView` — S0 stub files exist? No: S3 renders a
  `ViewSlot` registry `registerDatabaseView(type, Component)` that S4 fills; until then a "—" placeholder), the row panel host, the `?db` scroll/highlight.
  Read-only: no `+`, checkboxes, handles, menus (FR-1461).
- **S3.3 View tabs + toolbar menus.** `ViewTabs` (tablist, keyboard, `+` menu types, tab ⋯ rename/duplicate/delete (disabled at 1), dnd-kit horizontal reorder),
  `SortMenu` (≤ 3), `FilterMenu` (≤ 10, per-type ops from `filterOpsFor`, value editors, "ล้างตัวกรอง", incomplete shown dimmed), `ColumnsMenu` (toggle hidden,
  TITLE fixed). Tests per menu.
- **S3.4 Cells (`cells/**`).** `CellDisplay` per type (chips with names, 📄, ↗ link to row page on hover, URL anchor, person chips + "ปิดใช้งาน", number via
  `formatNumberCell`, date via `formatThaiDate`) and `CellEditor` per type (text input / textarea with Shift+Enter, number input with `parseNumberInput` error
  text, select/multi Autocomplete with "สร้าง '…'" option → `addOption`, person Autocomplete over active people (M11-D33), `DateField` + typed input via
  `parseDateInput`, checkbox toggle, URL input with `isDbUrl` error). Used by the table, the panel and S4's row page. Tests per type (AC-1402 vectors).
- **S3.5 Table view (`table/**`) — M11-D22.** `TableView` (grid container, header row with type icons + menus + resize handles + `+` column, virtualised body,
  "+ แถวใหม่", footer count), `useTableKeyboard` (arrows, Tab/Shift+Tab, Enter edit/confirm/new row on last, Esc, Delete clear / delete selected, Space
  open panel on title / toggle checkbox, type-to-replace), `useRowSelection` (checkbox, Shift range), toolbar "ลบ", row drag handle (no sorts), column drag
  (database order), widths 80–600 saved on pointer-up, phone layout (M11-D31). Tests: `TableView.test.tsx` (render 60 rows → virtualised DOM < 60 rows,
  stub sizes), `useTableKeyboard.test.tsx` (AC-1401 keyboard flow), selection + delete, new row inherits filters (AC-1403), footer "2 จาก 5 แถว".
- **S3.6 Column menu (`menus/ColumnMenu.tsx`, `OptionsEditor.tsx`, `NumberConfigEditor.tsx`).** Every FR-1412 item; type submenu (TITLE: disabled with
  `th.database.errors.titleColumn`); options rename/colour/reorder (dnd-kit)/delete (+ toast undo); sort ↑/↓ sets the view's sorts to that single key;
  "กรอง" opens FilterMenu prefilled; insert left/right; duplicate; delete (TITLE hidden). Tests.
- **S3.7 Row panel (`panel/**`, `src/lib/database/row-param.ts`).** M11-D26/D39: title (InlineEditText), every live column in a `PropertyList` (incl. hidden),
  "+ เพิ่มคอลัมน์", compact `RowBody` (S5; S0 stub until then), "เปิดเป็นหน้า" link (`/r/<id>`, Cmd-click new tab), ˄/˅, delete row (undo toast, closes),
  created/updated by (people map), 🔗 copy row link (`copyText`). Tests: `RowPanel.test.tsx`, `row-param.test.ts`.
- **S3.8 Phone + tokens.** `DatabaseBlock.module.css` etc. with tokens; < 600 px rules (M11-D31); `prefers-reduced-motion` respected for drag overlays.
  Done-check: `pnpm vitest run --project ui src/components/database src/lib/database` · lint · typecheck (owned).

### 5.S4 — Kanban, calendar, row page, palette (frontend-engineer · owns: see §4 S4)

- **S4.1 `kanban/KanbanView.tsx` (M11-D24) — test-first `KanbanView.test.tsx`.** Register with S3's `registerDatabaseView('KANBAN', …)`; group-by picker in the
  view ⋯ (SELECT/PERSON/CHECKBOX columns only; missing → `pickGroupColumn` prompt); columns from `groupRows`; card = title + 📄 + `cardColumnIds` values
  (`CellDisplay`, empty lines omitted); dnd-kit sortable per group + `DragOverlay`; keyboard sensor; card ⋯ "ย้ายไป…"; quick add per group (Enter keeps the
  input for the next card); "+ เพิ่มกลุ่ม"; hide empty groups; click → panel. Tests: AC-1404 vectors with `fakeDbApi` (drag simulated through the "ย้ายไป…"
  path + a dnd-kit keyboard drag), counts per group with multi-person rows.
- **S4.2 `calendar/CalendarView.tsx` (M11-D25) — test-first.** Month state, header + nav + วันนี้, grid (`role="grid"`, aria labels with full Thai dates), cards,
  "+N เพิ่มเติม" popover, hover `+` add, no-date list (collapsible, count), dnd-kit droppables, "ย้ายไป…" date picker, date-column picker, phone day list.
  Tests: AC-1405 vectors (Nov 2569 header, Monday first, today label, move 5 → 12 Nov, add on 20 Nov, no-date list).
- **S4.3 Row page `/r/[rowId]` (M11-D27).** `src/app/(app)/r/[rowId]/page.tsx` (+ `not-found.tsx`): `requirePageUser()` → `orNotFound(services.rowPages.getRowPageView(db, user, rowId))`
  → `<RowPageScreen key={view.row.id} view={view} />`. `row-page/RowPageScreen.tsx` per M11-D27 (DbApiProvider for the owner database, `useFullWidth({ rowId })`,
  Esc = back unless typing/menu, `RowBody variant="page"` with header slots). `/p/[pageId]/page.tsx`: DB_ROW → `redirect('/r/<rowId>' + search)` (after authz).
  Tests: `RowPageScreen.test.tsx` (crumbs, ⋯ per `can`, Enter → body, delete → back).
- **S4.4 Palette group.** `PALETTE_GROUPS` append `{ key: 'databases', heading: th.palette.groups.databases, map: hit → { value: 'db:<rowId ?? databaseId>', href,
  title: rowTitle ?? databaseTitle (or untitled), subtitle: \`${databaseTitle} · ${pageTitle}\`, icon: rowId ? '▤' : '▦', chips: matchedIn === 'content' ?
  [matchedInContent] : [] } }`. Test `CommandPalette.test.tsx › databases group`.
  Done-check: `pnpm vitest run --project ui src/components/database/{kanban,calendar,row-page} src/components/palette` · lint · typecheck (owned).

### 5.S5 — Editor (editor-engineer · owns `src/components/editor/**`, `src/lib/editor/**`, `src/lib/math/**`)

- **S5.1 Spike + page context (first, report findings).** In BlockNote 0.55 verify: (a) a `content: 'none'` React block with `contentEditable=false` root +
  native stopPropagation keeps keyboard/mouse/drag/paste from ProseMirror while inner inputs/MUI popovers work (reuse M10's `LiveBlockFrame` if present —
  A3); (b) `copy`/`cut` capture listener on the surface can add a custom MIME next to BlockNote's (`blocknote/html`) and it survives into `paste`;
  (c) custom inline content render props include `updateInlineContent`; (d) `FormattingToolbarController` + custom toolbar keeps default items. Add
  `EditorPageContext` (`{ pageId, kind, getPageId, variant }`) in `PageEditor` if M10 did not (A4). Record results in the report and `r3-blocknote.md` addendum.
- **S5.2 Database block (`blocks/database/**`, replaces S0's render).** States: `databaseId === ''` → "กำลังสร้าง…" skeleton; copying → "กำลังคัดลอก…"; else
  `<IslandFrame><DatabaseBlockView pageId databaseId blockId variant editable /></IslandFrame>`; undo routing M11-D21 (ui test: Mod+Z in the island calls
  `useUndo().undo`, Backspace inside a cell input does not delete the block, block handle Delete removes it, editor Mod+Z restores it).
- **S5.3 Slash items.** `getSlashMenuItems` adds group "ฐานข้อมูล" (three items, M11-D10 view types) for DOC and TASK only, and the two equation items for all
  kinds; database item click → `insertOrUpdateBlockForSlashMenu(editor, { type: 'database', props: { databaseId: '' } })` → `getPageId()` → `unwrap(createDatabase({
  pageId, view }))` → seed `qk.database` with the returned response → `updateBlock(props.databaseId)` → mark "just created" (title focus); failure → remove
  block + toast. Ranking tests (`slash-menu.test.tsx`): `/ตาราง` → plain table first, `/ตารางข้อมูล` → database table, `/board` → task view, `/db`, `/kanban`,
  `/calendar view`, `/สมการ` vs `/สมการในบรรทัด`, DB_ROW has no database items and no `/หน้า`.
- **S5.4 DB_ROW kind rules.** `dictionaryFor('DB_ROW')` placeholder `th.editor.rowPlaceholder`; paste handler + `replaceSubpagesWithMentions` for DB_ROW; database
  blocks pasted/dropped into a DB_ROW body → paragraph with the database title + toast (M11-D38). Tests in `paste.test.tsx`, `task-body.test.ts`.
- **S5.5 Copy/paste deep copy (M11-D13).** `src/lib/editor/database-clipboard.ts` (MIME write/read, registry) + `makePasteHandler` hook `onDatabaseBlocksPasted`;
  `PageEditor` wires the copy flow. Tests: `database-clipboard.test.ts`, `paste-database.test.tsx` (duplicate id → copy; foreign source → copy; cut same page →
  keep; copy failure → id kept; TASK body without row → ensure first).
- **S5.6 `RowBody` (replaces S0 stub).** Mirror of `TaskBody` with `qk.rowBody(rowId)`, `ensureRowBody`, `kind 'DB_ROW'`, `leaseAcquire 'focus'`, variants,
  `onHasBodyChange` → `patchRowHasBody`, header slots on the page variant. Tests `RowBody.test.tsx`.
- **S5.7 Equation block + inline (`blocks/equation/**`, `inline/inline-equation.tsx`, `math/EquationView.tsx`, `math/EquationPopover.tsx`).** M11-D29; render via
  `useKatex()` (S0 loader) → skeleton → html or error state; popover live preview (debounced 150 ms), keys per FR-1503 (`e.code`), maxLength 2,000; read-only:
  no popover. Tests: `EquationView.test.tsx` (valid, invalid → ⚠ + "สมการไม่ถูกต้อง" + source, MathML present), `EquationPopover.test.tsx` (Enter vs Mod+Enter,
  Esc restores), `inline-equation.test.tsx`.
- **S5.8 Toolbar button + slash inline item.** Custom `FormattingToolbar` with the "สมการ" button (`aria-label`); selection → inline equation with that source;
  `/สมการในบรรทัด` inserts an empty inline equation and opens the popover. Lazy-load check: a ui test asserts `loadKatex` is not called for a document without
  equations. Tests `formatting-toolbar.test.tsx`.
- **S5.9 Styles.** `editor-theme.css` + database island width rules (full content width, scroll inside), equation centring, tokens only; co-located
  `token-scale.test.ts` stays green. Done-check: `pnpm vitest run --project ui src/components/editor src/lib/editor src/lib/math` · lint · typecheck (owned).

### 5.S6 — Authz rows, masking, isolation, races (test-engineer · owns `tests/authz/**`, `tests/integration/**`, `tests/golden/**`)

- **S6.1 Rows (test-first, §7.2)** in `tests/authz/rows/databases.ts` and `row-pages.ts` + helpers `tests/authz/rows/_m11.ts` (`DBS = ['databases']`, `dbGet`,
  `bodyGet`, action wrappers, `auditDbP`, `auditDbWiki`, `auditPageP`, reuse `_m4.ts` `PROJ`, `ARCH_WRITE`, `ALL`, `MGR`, `each` and `_m6_1.ts` helpers);
  register under `// M11` in `rows/index.ts`. Mutating `allow` rows assert exactly one audit row (`database` or `page`) with the owner's `project_id`.
- **S6.2 Loader rows** for `/r`: `services.rowPages.getRowPageView` via `loaderOutcome()`.
- **S6.3 Masking / leak (`masking.int.test.ts › databases (M11)`):** as W: `GET /api/pages/{pPage}/databases/{dbP}` 404 and `JSON.stringify(body)` has no 'P-ลับ2';
  `GET /api/pages/{qPage}/databases/{dbP}` (W can see qPage) 404, same check; every action on dbP ids → 404 bodies without secrets; `/api/search?q=ลับ2` no P
  hits; `GET /api/database-rows/{pRow1}/body` 404; as Me: `people` map entries have exactly 4 keys; a 404 for "mismatch" and for "random uuid" have
  byte-identical bodies.
- **S6.4 BR-98 isolation (`tests/golden/database-isolation.int.test.ts`, `tests/integration/br98-imports.test.ts`):** M11-D34 (2) and (3).
- **S6.5 Coverage:** `coverage.int.test.ts` lists every new action and both routes.
- **S6.6 Races (`tests/integration/database-race.int.test.ts`):** 10 parallel `ensureRowBody` → one page; 2 users `updateDatabaseRow` same base → one 409;
  25 parallel `createDatabaseRows` of 50 near the 1,000 limit → total ≤ 1,000; 25 parallel `createDatabase` on one page → ≤ 20 attached; save without the
  block racing `createDatabase` → next save re-attaches (FR-1472 self-heal).
  Done-check: `pnpm vitest run --project integration tests/authz tests/integration tests/golden`.

### 5.S7 — E2E (test-engineer · owns `e2e/**`)

- **S7.1 Support + page objects.** `e2e/support/seed-databases.ts` (`insertDatabase(tx, { pageId, title, columns, views, rows })`, `insertSyntheticDatabase`
  wrapping `addSyntheticDatabase`, `insertEquations(n)`); `e2e/pages/database.ts` (`block(title)`, `tab(name)`, `addView(type)`, `cell(row, column)`, `editCell`,
  `columnMenu(name)`, `filterMenu()`, `sortMenu()`, `columnsMenu()`, `kanbanGroup(name)`, `card(title)`, `moveTo(card, group)` (menu path) and `dragCard` (mouse
  path), `calendarDay(iso)`, `noDateList()`, `rowPanel()`, `footerCount()`); `e2e/pages/row-page.ts`; `editor.ts` (`slash(text)`, `equation()`, `inlineEquation()`,
  `equationPopover()`); `palette.ts` (`group('ฐานข้อมูล')`).
- **S7.2 `e2e/m11-database.spec.ts`** — scenarios §7.3 (D1–D14, E1–E4, V1–V3, P1–P2).
- **S7.3 Perf smoke + screenshots:** P1/P2 log `performance.now()` deltas as test annotations; V2/V3 attach PNGs (390/768/1280/1920/2560 × light/dark) for the
  visual lens.
- **S7.4 Older specs to update (expected):** `m4-pages` (slash menu option counts/order if asserted; content JSON assertions tolerate new block types),
  `m10-home-search` (palette group list gains "ฐานข้อมูล"), `m6.1-task-page` (`/p/<body>` redirect helper unchanged; DB_ROW absent from trees checks still pass).

---

## 6. Integration (orchestrator)

**Expected cross-stream requests (apply after Build, step 4):**

| From | Request |
|---|---|
| S1 | `src/domain/types.ts` tweaks (S0's — orchestrator applies) |
| S2 | `th.database.errors.*`, `th.audit.db*` additions (own namespaces); `tests/helpers/world.ts` adjustments; `src/lib/contracts/databases.ts` additive fields |
| S3 | `registerDatabaseView` consumers (S4); `RowBody` props for the compact panel variant (S5); `th.database.*` additions |
| S4 | `DbApiProvider` export for the row page (S3); `formatThaiMonthYear` variants (S0's `format.ts`) |
| S5 | `DatabaseBlockView` props (`variant`, `editable`, `onJustCreated`) (S3); `createDatabase` result shape (S0/S2) |
| S6 | factories / world (S0's) |
| S7 | missing `data-testid`s / accessible names (owning streams) |

**Wiring order:** S0 (G0) → {S1, S5, S6} → {S2, S3} → S4 → requests → S7 → G2.

**Commands (G2):**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                      # → "No schema changes"
pnpm exec drizzle-kit check
pnpm check                            # incl. migrations-m11, domain coverage, authz matrix, masking, BR-98, perf smokes
pnpm test:e2e                         # m0 … m10, m6-responsive, m6.1-task-page, m11-database
git diff --exit-code CLAUDE.md SPEC.md docs/
grep -rn "parseFloat\|Number(" src/components/database src/domain/database* | grep -iv "test\|width\|index\|count" && exit 1 || true   # BR-91: no float on cell values
grep -rn "katex" src --include='*.ts' --include='*.tsx' | grep -v "src/lib/math" && exit 1 || true                                 # one loader (M11-D30)
grep -rn "https\?://" src/lib/math src/components/editor/blocks/equation && exit 1 || true                                          # no CDN
```
**Pre-review visual sweep (M11-D2):** integrator runs the visual lens procedure (own port 3500–3599, existing dev DB, manager + ivy, 5 widths × light/dark) on the
POS charter with a database (each view, row panel open), `/r/<id>` (default + full width), a page with valid + invalid equations, a page with the
"ไม่พบฐานข้อมูล" placeholder, phone table scroll; fixes obvious breaks before the six reviewers; kills only its own PID. Hand checks: `pnpm ls katex` = 0.19.1
exact; no other new dependency; `ls` repo root for stray files.

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Tests |
|---|---|
| AC-1401 | e2e D1 · ui `useTableKeyboard.test.tsx`, `DatabaseHeader.test.tsx` · int `databases.int.test.ts › create` · e2e DB assertion (page JSON has only `databaseId`) |
| AC-1402 | e2e D2 · unit `database.number/cells/date.test.ts` · ui `cells/*.test.tsx` · int `› rows validation` · authz ROW-UPDATE-BAD*, ROW-UPDATE-URL-JS |
| AC-1403 | e2e D3 · unit `database.sort/filter.test.ts` (`valuesFromFilters`) · ui `TableView.test.tsx › footer + inherit` |
| AC-1404 | e2e D4 · unit `database.group.test.ts` · ui `KanbanView.test.tsx` |
| AC-1405 | e2e D5 · unit `database.calendar.test.ts` · ui `CalendarView.test.tsx` |
| AC-1406 | e2e D6 · unit `database.convert.test.ts` · int `› changeType/revert` · authz COL-TYPE-TITLE |
| AC-1407 | e2e D7 · int `› deletes/restores` · ui `useDbMutations.test.tsx › toasts` · authz VIEW-DELETE-LAST |
| AC-1408 | e2e D8 · authz (whole files) · mask · int `search.databases.int.test.ts` |
| AC-1409 | e2e D9 · int `database-race.int.test.ts` · authz ROW-UPDATE-LEASED |
| AC-1410 | e2e D10 · int `database-copy.int.test.ts` · authz DB-COPY-*, DB-GET-WRONGPAGE · ui `paste-database.test.tsx` |
| AC-1411 | e2e D11 · int `pages.int.test.ts › detach reconcile`, `› page delete/restore` |
| AC-1412 | e2e D12, P1 · int `› limits` · perf `databases.perf.int.test.ts`, `database.perf.test.ts` |
| AC-1413 | e2e D13 · golden `database-isolation.int.test.ts` · unit `br98-imports.test.ts` |
| AC-1414 | e2e D14 · int `row-pages.int.test.ts` · authz RB-*, RP-* · ui `RowPageScreen.test.tsx`, `RowBody.test.tsx`, `slash-menu.test.tsx › DB_ROW` |
| AC-1501 | e2e E1 · ui `EquationView.test.tsx`, `EquationPopover.test.tsx` · unit `katex.test.ts` |
| AC-1502 | e2e E2 · ui `formatting-toolbar.test.tsx`, `inline-equation.test.tsx` |
| AC-1503 | e2e E3 · ui `EquationView.test.tsx › invalid` |
| AC-1504 | e2e E4 · unit `content-text.test.ts › latex` · int `search.int.test.ts › latex in content_text` |
| NFR-11 / NFR-12 | e2e P1, P2 (smoke) · perf ints (§7.4) — gates M12 |

### 7.2 Authorization matrix rows added (`tests/authz/rows/databases.ts`, `row-pages.ts`)

`M` manager · `L` LEAD of P and A · `Me` MEMBER of P and A · `W` outsider (MEMBER of Q only). World `createWorld({ with: ['databases'] })`.
"P-audit" = exactly one new `audit_log` row `entity 'database'` (or `'page'` where noted), `project_id = P`; "Wk-audit" = project null.

| Key | PERM | Action / route (world ids) | M | L | Me | W | mutates / audit |
|---|---|---|:-:|:-:|:-:|:-:|---|
| DB-GET | PERM-24 | `GET /api/pages/{pPage}/databases/{dbP}` | allow | allow | allow | 404 | no |
| DB-GET-ARCH | PERM-24, X42 | `… {aPage}/databases/{dbA}` | allow | allow | allow | 404 | no (canEdit false asserted) |
| DB-GET-WIKI | PERM-24 | `… {wiki}/databases/{dbWiki}` | allow | allow | allow | allow | no |
| DB-GET-WIKIPROT | PERM-24, FR-510 | `… {wikiProtected}/databases/{dbWikiProt}` | allow | allow | allow | allow | no (canEdit: M true, workers false) |
| DB-GET-TASK | PERM-24, FR-680 | `… {pLeafBody}/databases/{dbTask}` | allow | allow | allow | 404 | no |
| DB-GET-DETACHED | FR-1472 | `… {pPage}/databases/{dbPDetached}` | allow | allow | allow | 404 | no |
| DB-GET-WRONGPAGE | FR-1464 | `… {qPage}/databases/{dbP}` (W sees qPage) | 404 | 404 | 404 | 404 | no (body has no secret) |
| DB-GET-DELETEDPAGE | FR-1473 | `… {pDeleted}/databases/{dbDeletedPage}` | 404 | 404 | 404 | 404 | no |
| DB-GET-MISSING / DB-GET-BAD | X86 | random uuid / `not-a-uuid` | 404 | 404 | 404 | 404 | no |
| DB-CREATE | PERM-25 | `createDatabase({ pageId: pPage, view: 'TABLE' })` | allow | allow | allow | 404 | yes · P-audit |
| DB-CREATE-ARCH | X42 | `{ pageId: aPage }` | 403 | 403 | 403 | 404 | no |
| DB-CREATE-WIKI | PERM-25 | `{ pageId: wiki }` | allow | allow | allow | allow | yes · Wk-audit |
| DB-CREATE-WIKIPROT | FR-510 | `{ pageId: wikiProtected }` | allow | 403 | 403 | 403 | M: yes · Wk-audit |
| DB-CREATE-TASK | FR-680 | `{ pageId: pLeafBody }` | allow | allow | allow | 404 | yes · P-audit |
| DB-CREATE-ROWBODY | M11-D38 | `{ pageId: pRowBody }` | 400 | 400 | 400 | 404 | no |
| DB-CREATE-LIMIT | FR-1475 | page with 20 attached (setup) | 400 | 400 | 400 | 404 | no |
| DB-CREATE-BAD | — | `{ pageId: 'x' }` / bad view | 400 | 400 | 400 | 400 | no |
| DB-COPY | PERM-26 | `copyDatabase({ sourcePageId: pPage, sourceDatabaseId: dbP, targetPageId: pChild })` | allow | allow | allow | 404 | yes · P-audit (target) |
| DB-COPY-TO-ARCH | PERM-26, X42 | target `aPage` | 403 | 403 | 403 | 404 | no |
| DB-COPY-FROM-ARCH | PERM-26 | source `dbA` → target `pPage` | allow | allow | allow | 404 | yes · P-audit |
| DB-COPY-TO-Q | PERM-26 | source dbP → target qPage (M only member-agnostic; L/Me not members of Q) | allow | 404 | 404 | 404 | M: yes · audit Q |
| DB-COPY-FROM-Q | PERM-26 | source dbQ → target qPage? as W: source visible, target visible → allow; L/Me 404 | allow | 404 | 404 | allow | yes · audit Q |
| DB-COPY-MISMATCH | M11-D12 | `sourcePageId: pChild` with dbP | 404 | 404 | 404 | 404 | no |
| DB-COPY-TO-WIKIPROT | PERM-26, FR-510 | source dbP → wikiProtected | allow | 403 | 403 | 404 | M: yes · Wk-audit |
| DB-COPY-TO-ROWBODY | M11-D38 | target `pRowBody` | 400 | 400 | 400 | 404 | no |
| DB-RENAME | PERM-25 | `renameDatabase({ databaseId: dbP, baseVersion: 1, title })` | allow | allow | allow | 404 | yes · P-audit |
| DB-RENAME-STALE | FR-1463 | baseVersion 99 | 409 | 409 | 409 | 404 | no |
| DB-RENAME-ARCH / -WIKIPROT | X42, FR-510 | dbA / dbWikiProt | 403 / allow | 403 / 403 | 403 / 403 | 404 / 403 | M wiki: yes |
| ROW-CREATE | PERM-25 | `createDatabaseRows({ databaseId: dbP, rows: [{ title: 'n' }] })` | allow | allow | allow | 404 | yes · P-audit |
| ROW-CREATE-51 / ROW-CREATE-FULL | FR-1475 | 51 rows / db at 1,000 (setup) | 400 | 400 | 400 | 404 | no |
| ROW-CREATE-WIKI | PERM-25 | dbWiki | allow | allow | allow | allow | yes · Wk-audit |
| ROW-UPDATE | PERM-25 | `updateDatabaseRow({ rowId: pRow2, baseVersion, title: 'x' })` | allow | allow | allow | 404 | yes · P-audit |
| ROW-UPDATE-LEASED | FR-1462 | as above while `lead` holds the pPage lease (setup) | allow | allow | allow | 404 | yes |
| ROW-UPDATE-STALE | FR-1463 | baseVersion 99 | 409 | 409 | 409 | 404 | no |
| ROW-UPDATE-BADTYPE | BR-90 | NUMBER `'1.0'` / SELECT unknown id / DATE `2026-02-30` | 400 | 400 | 400 | 404 | no |
| ROW-UPDATE-URL-JS | FR-1410 | URL `javascript:alert(1)` | 400 | 400 | 400 | 404 | no |
| ROW-UPDATE-INACTIVE | BR-90 | PERSON adds `former` (deactivated) | 400 | 400 | 400 | 404 | no |
| ROW-UPDATE-DELCOL | BR-90 | key of the deleted column | 400 | 400 | 400 | 404 | no |
| ROW-UPDATE-ARCH / -WIKIPROT | X42, FR-510 | row of dbA / dbWikiProt | 403 / allow | 403 / 403 | 403 / 403 | 404 / 403 | M wiki: yes |
| ROW-DELETE | PERM-25, FR-1424 | `deleteDatabaseRows({ rowIds: [pRow2] })` | allow | allow | allow | 404 | yes · P-audit |
| ROW-DELETE-MIXED | X41 | `[pRow2, row of dbQ]` | 404 | 404 | 404 | 404 | no (all-or-nothing) |
| ROW-RESTORE | PERM-25 | `restoreDatabaseRowBatch({ batch: w.batches.dbRows })` | allow | allow | allow | 404 | yes · P-audit |
| COL-CREATE / COL-UPDATE / COL-DUP | PERM-25 | on dbP | allow | allow | allow | 404 | yes · P-audit |
| COL-LIMIT | FR-1475 | db at 30 columns | 400 | 400 | 400 | 404 | no |
| COL-TYPE | FR-1414 | `changeDatabaseColumnType(ข้อความ → NUMBER)` | allow | allow | allow | 404 | yes · P-audit |
| COL-TYPE-TITLE | BR-93 | TITLE → TEXT | 400 | 400 | 400 | 404 | no |
| COL-REVERT | FR-1414 | `revertDatabaseColumnType(previous from setup)` | allow | allow | allow | 404 | yes · P-audit |
| COL-REVERT-FORGED | M11-D16 | previous with a value not in previous config | 400 | 400 | 400 | 404 | no |
| COL-DELETE / COL-RESTORE | FR-1415 | ข้อความ / `w.batches.dbColumn` | allow | allow | allow | 404 | yes · P-audit |
| COL-DELETE-TITLE | FR-1410 | TITLE column | 400 | 400 | 400 | 404 | no |
| COL-ARCH | X42 | any column action on dbA | 403 | 403 | 403 | 404 | no |
| VIEW-CREATE / VIEW-UPDATE / VIEW-DELETE / VIEW-RESTORE | PERM-25 | on dbP / `w.batches.dbView` | allow | allow | allow | 404 | yes · P-audit |
| VIEW-UPDATE-WIKIPROT | FR-1406 | config change on dbWikiProt | allow | 403 | 403 | 403 | M: yes |
| VIEW-UPDATE-BADCOL | §7.9 | sort on an unknown column id | 400 | 400 | 400 | 404 | no |
| VIEW-DELETE-LAST | FR-1405 | dbQ-like db with one view (setup on P) | 400 | 400 | 400 | 404 | no |
| VIEW-LIMIT | FR-1475 | db at 10 views | 400 | 400 | 400 | 404 | no |
| RP-LOADER | PERM-24 | `services.rowPages.getRowPageView(pRow1)` | allow | allow | allow | 404 | no |
| RP-LOADER-WIKI / -ARCH / -MISSING | PERM-24, X86 | wiki row / dbA row / random | allow×4 / allow×3 + W 404 / 404×4 | | | | no |
| RB-GET / RB-GET-NONE / RB-GET-DELETED / RB-GET-BAD | PERM-24 | `GET /api/database-rows/{pRow1|pRow2|pRowDeleted|x}/body` | allow / allow / 404 / 404 | ← | ← | 404 | no |
| RB-ENSURE | PERM-25 | `ensureRowBody({ rowId: pRow2 })` | allow | allow | allow | 404 | yes · P-audit (`page`, create) |
| RB-ENSURE-EXISTING | PERM-25 | `{ rowId: pRow1 }` | allow | allow | allow | 404 | yes · `audit: false` |
| RB-ENSURE-ARCH / -WIKIPROT | X42, FR-510 | dbA row / dbWikiProt row | 403 / allow | 403 / 403 | 403 / 403 | 404 / 403 | M wiki: yes |
| RB-PAGE-GET | PERM-24 | `GET /api/pages/{pRowBody}` | allow | allow | allow | 404 | no |
| RB-SAVE | PERM-25 | `savePageContent({ pageId: pRowBody, baseVersion: 1, content })` | allow | allow | allow | 404 | yes · P-audit (`page`) |
| RB-SAVE-DB / RB-SAVE-SUBPAGE | M11-D8 | content with a `database` / `subpage` block | 400 | 400 | 400 | 404 | no |
| RB-SAVE-ARCH | X42 | `aRowBody` | 403 | 403 | 403 | 404 | no |
| RB-KEEPALIVE | PERM-25 | `PUT /api/pages/{pRowBody}/content` | allow | allow | allow | 404 | yes · P-audit (`page`) |
| RB-LOCK-GET / -POST / -DELETE | PERM-24/25 | `/api/pages/{pRowBody}/lock` | allow | allow | allow | 404 | POST/DELETE `audit: false` |
| RB-UPLOAD / RB-FILE-GET | PERM-25/24 | `POST /api/files` (pageId pRowBody) / `GET /api/files/{pRowImage}` | allow | allow | allow | 404 | upload: `file` audit P |
| RB-DOCAPI-* | FR-682 | rename / icon / cover / protect / template / move / duplicate / delete / create-child / tree parent on `pRowBody` | 404 | 404 | 404 | 404 | no |
| FW-ROW | FR-1602 | `setPageFullWidth({ rowId: pRow2, fullWidth: true })` | allow | allow | allow | 404 | yes · exactly one P-audit (`page`) |
| FW-ROW-WIKIPROT / FW-ROW-ARCH | FR-510, X42 | dbWikiProt row / dbA row | allow / 403 | 403 / 403 | 403 / 403 | 403 / 404 | M: yes |
| PG-SAVE-DETACH | FR-1472 | `savePageContent(pPage, content without dbP)` | allow | allow | allow | 404 | yes · P-audit (`page`) + dbP detached |
| PG-DUP-DB | FR-1470, PERM-26 | `duplicatePage({ pageId: pPage })` | allow | allow | allow | 404 | yes · P-audit (`page`, 1 row) + copies exist |
| SR-DB-ROW / SR-DB-TITLE / SR-DB-BODY | FR-1474 | `GET /api/search?q=P-ลับ21` / `P-ลับ20` / `P-ลับ22` | allow (hits) | allow | allow | allow (no hits, no secret) | no (body asserts) |
| SR-DB-WIKI | FR-1474 | `q=แถว W-25` | hit ×4 | | | | no |
| SR-DB-TITLEONLY | X68 | `…&titleOnly=1` → `databases: []` | allow | allow | allow | allow | no |
| (loop) | — | every row as nobody / mustChange user | 401 / 403 | | | | — |

(Rows with two values in a cell list the two variants of that key in order.)

### 7.3 E2E scenarios (`e2e/m11-database.spec.ts`)

Deterministic per PLAN §4.5: production build, `APP_NOW=2026-09-30T10:00:00+07:00`, `ALLOW_TEST_HOOKS=1`, `page.clock.setFixedTime` before the first `goto`,
`loginAs` via the API, strings from `th`, waits on state (toasts, `data-save-state`, URLs), CSP + external-request + page-error guards on every test. ⟲ = `resetDb()`
in `beforeAll` of the describe. Calendar scenarios press › once to reach "พฤศจิกายน 2569" (today is 30 ก.ย. 2569). Golden: POS = `POS Upgrade`, its charter
"Project Charter"; members Cindy, Ivy; Mint and Peter as stated by AC; Data Warehouse project page for cross-project copy.

| # | AC · actor | Steps | Assertions |
|---|---|---|---|
| D1 ⟲ | AC-1401 · cindy | POS charter; type `/table view` Enter; type "ทะเบียนความเสี่ยง"; keyboard only: ↓ to "+ แถวใหม่" Enter, type name, Tab, pick "กำลังทำ", Tab, type `5/11/2569` Enter ×3 rows; reload | block with columns ชื่อ · สถานะ · วันที่, 3 rows exact; DB: `pages.content` of the charter contains the `databaseId` and none of the row titles; one `databases` row attached |
| D2 ⟲ | AC-1402 · cindy | add one column of each type via `+`; fill values incl. number `1234567.891234`, number `0.1` with decimals 2, date 5 พ.ย. 2569, multi 2 values, person Cindy + Ivy, URL `javascript:alert(1)`; open the person picker; reload | every value round-trips; "0.10" shown; DB cells `"1234567.891234"`, `"2026-11-05"`, order kept; picker has no deactivated employee; the JS URL shows `th.database.cells.invalidUrl` and is not saved |
| D3 ⟲ | AC-1403 · cindy + ivy | 5 seeded rows; sort ตัวเลข มาก→น้อย; filters สถานะ เป็น กำลังทำ + ติ๊ก ไม่ติ๊ก; add a row; hide ลิงก์; resize ชื่อ; reload; ivy opens the same page | only matching rows, empties last, footer "2 จาก 5 แถว" (then 3 after add), new row สถานะ = กำลังทำ, hidden + width persist, ivy sees the same view |
| D4 ⟲ | AC-1404 · cindy | add kanban view; drag กำลังทำ → เสร็จ; table tab; Cmd+Z; drag to ไม่มีค่า; group by คน; drag Cindy-group card to Mint; drag Ivy-group card to ไม่มีค่า; filter คน มี ฉัน (login mix in a second context); `+ เพิ่ม` in เสร็จ | group headers ยังไม่เริ่ม · กำลังทำ · เสร็จ · ไม่มีค่า with counts; values follow each step exactly as AC-1404 (Mint + Ivy → Mint); "ย้ายไป…" path repeated for one move; new row สถานะ เสร็จ |
| D5 ⟲ | AC-1405 · cindy | add calendar view; › to พฤศจิกายน 2569; drag card 5 → 12 Nov; table tab; "เลิกทำ"; `+` on 20 Nov "ตรวจรับ"; drag a no-date row to 3 Nov and one back | header text, first column จ, "วันนี้" label visible after pressing วันนี้ (Sept), 12 พ.ย. 2569 then back to 5; new row `2026-11-20`; no-date count changes |
| D6 ⟲ | AC-1406 · cindy | text column "12", "abc", "1,500" → type ตัวเลข; "เลิกทำ"; type ตัวเลือก; open TITLE menu | 12 · empty · 1,500 without dialog; undo → text and "abc" back; options from unique values; TITLE "เปลี่ยนชนิด" disabled |
| D7 ⟲ | AC-1407 · cindy | select 2 rows Delete; "เลิกทำ"; delete สถานะ column; kanban tab; "เลิกทำ"; delete calendar view; "เลิกทำ"; try delete the last view | rows back in place; kanban shows "เลือกคอลัมน์สำหรับจัดกลุ่ม" then regroups; view back; last-view delete disabled; no dialog anywhere |
| D8 ⟲ (locked wiki + archived project via extras) | AC-1408 · peter, ivy, cindy(worker), manager | peter: `request.get` the database route + call two actions via the UI-less API helpers (server action fetch with ids); Cmd+K row title; ivy: Cmd+K → Enter; worker on locked wiki db; manager same; archived project db | peter 404 + body lacks names; palette no hit; ivy hit → `/p/…?db&row` opens the panel; worker sees data, no controls, forced action → 403; manager edits; archived: read-only, write → 403 |
| D9 ⟲ | AC-1409 · cindy + ivy | cindy focuses the charter text (holds the lease); ivy edits a cell and adds a row; cindy refocuses the window; both edit the same row title from the same version | ivy sees "Cindy กำลังแก้หน้านี้" yet edits succeed; cindy sees new values after focus; the later writer gets the conflict toast and the latest value |
| D10 ⟲ | AC-1410 · cindy | ⋯ ทำสำเนา the charter; edit a copy row; copy the block (Cmd+C on block selection) → paste into a Data Warehouse page; forge content via the save API with dbP's id on another page | copy page has a new database id with data + views; source unchanged; DW page block = new database of DW; forged block shows "ไม่พบฐานข้อมูล" and the route 404s |
| D11 ⟲ | AC-1411 · cindy | select the block handle → Delete; Cmd+Z; delete again and wait saved; Cmd+K row title; delete the page; "เลิกทำ" | block back with data; after save the row is not found in search; page restore brings the database back (and search hits) |
| D12 ⟲ (extras: 1,000-row database) | AC-1412 · cindy | add row 1,001 | toast `th.database.errors.limit.rows(1000)`; count unchanged |
| D13 ⟲ | AC-1413 · manager | note POS grid totals + members; add คน/ตัวเลข/วันที่ cells (Mint, 5, this week) in the charter database; reload grid, workload, members | identical numbers (golden F1), members unchanged; audit page shows only database rows |
| D14 ⟲ | AC-1414 · cindy, peter | open row "ลูกค้าส่ง spec ช้า" panel → "เปิดเป็นหน้า"; type text + paste a PNG; reload; slash menu; peter `goto('/r/<id>')`; duplicate the charter; edit the copy row body; delete the row → "เลิกทำ" | URL `/r/<id>`, crumbs `Project Charter › ทะเบียนความเสี่ยง`, properties + body; 📄 on the row; slash lacks `/หน้า` and database items; peter 404; copy body independent; body back after undo |
| E1 ⟲ | AC-1501 · cindy | `/สมการ` → `\int_0^1 x^2\,dx = \frac{1}{3}` → Cmd+Enter; reload | rendered (`.katex` + `math` element); external-request guard clean; font requests are same-origin `/_next/static/` |
| E2 ⟲ | AC-1502 · cindy | select `E=mc^2` in a paragraph → toolbar "สมการ"; `/inline equation` | inline equation, surrounding text unchanged; second inline inserted |
| E3 ⟲ | AC-1503 · cindy | type `\frac{1}{`; continue typing elsewhere; reload; fix it | ⚠ "สมการไม่ถูกต้อง" + source; editor usable; after reload still error; then renders |
| E4 ⟲ | AC-1504 · cindy, ivy (locked wiki read-only) | Cmd+K "frac"; ivy opens a locked wiki page with an equation | page hit; ivy sees the equation, clicking opens no popover |
| V1 ⟲ | FR-1408 · ivy (390×844, touch) | charter database: scroll table horizontally, tap a cell edit, kanban "ย้ายไป…", calendar day list, open row panel | `documentElement.scrollWidth ≤ innerWidth`; block `scrollWidth > clientWidth`; every step by `tap()` |
| V2 ⟲ | FR-1602 · manager | 1920 + 2560: charter with database (default + full width), `/r/<id>`; screenshots | doc column ≤ 760 by default, block scrolls inside; full width expands; PNGs attached |
| V3 ⟲ | visual evidence · manager | 390/768/1280/1920/2560 × light/dark: each view, row panel, equations (valid/invalid), not-found placeholder | files attached; no overflow |
| P1 ⟲ (extras: 1,000 × 20) | NFR-11 smoke · manager | open page; switch views; apply a filter; sort; edit a cell | annotations with ms; fail at 2× budget (render 600, switch 200, edit 100); API timing from `response.timing()` logged |
| P2 ⟲ (extras: 3 databases totalling 1,000 rows + 50 equations; a second page without equations) | NFR-12 smoke · manager | open both pages | page with equations ready (all `.katex` rendered) < 3 s (logged); page without equations makes no request matching `/katex|KaTeX_/` |

### 7.4 Golden, perf and manual checks

- Golden F1/F2–F4 unchanged (`tests/golden` green) + `database-isolation.int.test.ts` (BR-98).
- Perf smoke (M11-D32): `src/server/services/databases.perf.int.test.ts` (p95 of 20 GETs on 1,000 × 20, logged, fail > 1,000 ms), `src/domain/database.perf.test.ts`
  (fail > 200 ms), e2e P1/P2; full gates in M12 (`scripts/perf-check.ts` + `e2e/perf/m12-perf.spec.ts`, appended at close-out).
- Visual lens (review): the six-lens panel's `visual` reviewer on the M11-D2 screens.
- Manual: Thai Kedmanee layout — table keys, Space on title, Cmd+Z in the island vs in the editor, equation Enter/Cmd+Enter; Safari: dnd-kit drag on kanban/
  calendar, KaTeX fonts, `history.replaceState` row param; VoiceOver: grid announced with row/column indices, chips read their names, equation MathML read;
  dark mode on every database surface; paste a database block between two tabs (MIME path) and note the result in Known issues.

---

## 8. Definition of done

- [ ] SPEC §12 M11 delivered: `'DB_ROW'` + `pages.database_row_id`, `ensureRowBody`, `GET /api/database-rows/:id/body`, `/r/[rowId]`, copy/duplicate/delete with
  bodies; the four tables + trigram indexes; `src/domain/database.ts` with BR-90…98 unit tests; `GET /api/pages/:id/databases/:databaseId` and every §7.9 action;
  database block + slash items, table/kanban/calendar views, view tabs, column menu with type change, row panel, undo for everything; detach reconcile,
  deep copy in `duplicatePage`, paste → `copyDatabase`; Cmd+K "ฐานข้อมูล"; equation block + inline + toolbar + bundled lazy KaTeX + error state + source in
  `content_text`; perf smoke. None of the §1.2 items.
- [ ] AC-1401…1414 and AC-1501…1504 pass (§7.1); `e2e/m11-database.spec.ts` green; e2e of M0…M10 green.
- [ ] `pnpm check` green (incl. migration test, domain coverage ≥ 95 %, authz matrix, masking, BR-98, perf smokes); `pnpm db:generate` → "No schema changes";
  `drizzle-kit check` OK.
- [ ] Authz rows for **every** new action/route and for M4 routes receiving DB_ROW pages (§7.2); leak tests green; coverage registry updated.
- [ ] `katex` pinned `0.19.1` exact with `plan/research/r9-katex.md` and a Decision row; no other new dependency; no CDN/external request (guards).
- [ ] No Thai outside `src/i18n`; no `localStorage`; no confirm dialog added; never colour alone (chips with names, ⚠ + text, ✓ + text, 📄 with label); no float
  on cell numbers; no `Date` on cell dates.
- [ ] No `any`, `@ts-ignore` or `eslint-disable` without a reason; `token-scale-ok` escapes carry reasons.
- [ ] Six-lens review (incl. `visual`) closed with zero confirmed findings.
- [ ] `PROGRESS.md`, `plan/traceability.md`, `PLAN.md`, `plan/m12-hardening-deploy.md` updated (§10); commit + tag `m11`.

---

## 9. Risks and gotchas

| # | Risk / pitfall | Mitigation (step) |
|---|---|---|
| R1 | `ALTER TYPE … ADD VALUE` + a check using `'DB_ROW'` in the same migrator transaction → 55P04 on fresh installs (tests, Docker) | `::text` comparison; whole-journal-one-transaction test (S0.2, M11-D4) |
| R2 | Focus/keyboard/undo leak between BlockNote and the island (Backspace deletes the block, Cmd+Z undoes text) | M10 frame rules + S5.1 spike + ui tests (S5.2, M11-D21) |
| R3 | Paste bypasses the copy handler (cross-tab, stripped MIME) and two pages reference one database | server ignores foreign ids → "ไม่พบฐานข้อมูล" + 404 (M11-D7, D13); Known issue for the cross-tab case |
| R4 | Detach race: a save composed before the block was inserted detaches the new database | attached-by-default + reconcile on every save heals it (M11-D9); race test (S6.6) |
| R5 | Float creeps into number cells (`Number(cell)` in sort/filter/format) | string/BigInt domain (S1.2), G2 grep, property tests |
| R6 | 1,000-row table janky (MUI per cell, no virtualisation, re-render on every edit) | CSS Modules cells, TanStack Virtual, memoised rows keyed by version, one query cache (M11-D22, P1) |
| R7 | Client-supplied `previous` in `revertDatabaseColumnType` used to inject values | validated against previous type/config + column version guard (M11-D16, COL-REVERT-FORGED) |
| R8 | Deep copy forgets an id inside a view config or a filter value → copy points at the source's columns | single remap map + exhaustive config walker test (S2.10) |
| R9 | Cross-project copy keeps file ids → files readable only with the source project's permission (or leaked) | `files: 'copy'` with new rows/keys + test (M11-D11) |
| R10 | KaTeX CSS/fonts bundled into the main chunk (breaks NFR-12) or blocked by CSP | dynamic-import-only loader, spike, P2 network assertion, G2 grep (M11-D30) |
| R11 | `throwOnError: true` exceptions escape into React render → page crash | `renderLatex` returns a result object; error boundary around equation renders (S0.11, S5.7) |
| R12 | Concurrency limits exceeded under parallel creates | database/page row `FOR UPDATE` before counting (M11-D10, D18; race tests) |
| R13 | Multi-person kanban: dropping changes other people in the row or duplicates ids | `dropOnGroup` vectors + property "others unchanged" (S1.9) |
| R14 | Row panel + task panel on a task body stack two drawers | compact variant navigates to `/r` (M11-D26) |
| R15 | DB_ROW page leaks into trees/recent/page search/mentions | M6.1 `kind = 'DOC'` filters (generic) + A6 check + authz RB-DOCAPI-* + mask |
| R16 | Option colours fail contrast in dark mode | contrast test settles values (S0.15) |
| R17 | `history.replaceState` row param desyncs with Next navigation | same store pattern as `task-param.ts` (tested in M3/M6.1) (S3.7) |
| R18 | M10 lands with different names than assumed (A1–A6) | kickoff checks §2.1; adapt inside M11 files + Decision |
| R19 | dnd-kit drag in Safari/touch flaky in e2e | "ย้ายไป…" menu path asserted everywhere; mouse drag once per view (S7) |
| R20 | M12 offline/URL scanner flags KaTeX's MathML namespace or docs URLs inside the bundle | note for M12 (`http://www.w3.org/1998/Math/MathML` is not a request); allowlist there (§10) |

---

## 10. Close-out

**PROGRESS.md updates (orchestrator, after G4):**
- Milestone table: M11 ✅ with date, commit hash and tag `m11`; "Milestone ปัจจุบัน" → M12 — ยังไม่เริ่ม.
- Decisions: §3.1 rulings as applied and M11-D1 … M11-D39 (§3.2), incl. the KaTeX version actually installed (and the spike result), whether the M11-D4
  fallback (custom `ALTER TYPE`) was needed, the final option-colour hex values, and the §2.1 assumption results.
- Deviations: none expected (record any the build forced).
- Known issues: cross-tab paste without the custom clipboard type shows "ไม่พบฐานข้อมูล" (M11-D13); detached databases are kept forever until the Phase-2 trash;
  phone is read + basic edit only (M11-D31).
- Forward notes for **M12:** perf gates for NFR-11/12 (`scripts/perf-check.ts` P-DB1 GET p95 < 500 ms on `planner_perf`; `e2e/perf/m12-perf.spec.ts` PF-DB1
  render < 300 ms, PF-DB2 switch/filter < 100 ms, PF-DB3 edit < 50 ms, PF-DB4 page with 3 databases + 50 equations < 1.5 s); `seed:perf` uses
  `addSyntheticDatabase` for 2,000 databases / 200,000 rows (NFR-01 v3.2 row); audit sweep includes entity `database` and row-body `page` saves; offline check
  allowlists KaTeX's MathML namespace string and verifies KaTeX fonts are inside the image; README notes the `katex` licence (MIT) in third-party notices.
- `plan/traceability.md`: replace every "plan pending (m11)" cell for FR-1401…1506, BR-90…98, AC-1401…1414, AC-1501…1504, PERM-24…26, NFR-11/12 with §7.1/§7.2 tests.
- `PLAN.md`: §1.8 "`plan/m11-database-views.md` is not written yet" → written + delivered; §1.2 table += `katex 0.19.1`; §1.4 X93 += `database`; §5 row M11 →
  actual streams; §3.11 += database island, equation blocks, lazy KaTeX, `DB_ROW` bodies; §6 R25 → mitigations as built.
- `plan/m12-hardening-deploy.md`: append the M12 forward notes above (perf budgets, audit entity, seed builder, offline allowlist).

**Commit** (orchestrator, after G4):
```text
feat(m11): page databases (table, kanban, calendar), rows as pages, and LaTeX equations

- databases/database_columns/database_views/database_rows + page_kind DB_ROW (pages.database_row_id); trigram search on titles (SPEC §6.2, §6.4)
- src/domain/database.ts: BR-90…97 cells, exact decimals, dates, type conversion, sort, AND filters, multi-person kanban groups, calendar month; BR-98 isolation
- GET /api/pages/:id/databases/:databaseId + every §7.9 action with per-object versions, limits, batches and one audit row per action (FR-1460…1466, FR-1475)
- database block with view tabs, table (virtualised, keyboard), kanban (drag + ย้ายไป…), calendar (no-date list), column menu with undoable type change, row panel (FR-1401…1452)
- rows open as pages /r/[rowId] via ensureRowBody (FR-1453); detach on block removal, deep copy on duplicate and paste incl. files (FR-1470…1473); Cmd+K ฐานข้อมูล (FR-1474)
- equation block + inline equation + toolbar button, bundled lazy KaTeX 0.19.1 (no CDN), error state, LaTeX in content_text (FR-1501…1506)
- AC-1401…1414, AC-1501…1504; authz rows DB-*, ROW-*, COL-*, VIEW-*, RB-*, RP-*, FW-ROW*, SR-DB-*; e2e m11-database; NFR-11/12 perf smoke

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
**Tag:** `git tag m11`.
