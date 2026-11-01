# M4 — Notion-style pages (BlockNote)

> Depends on: M3 ✅ · SPEC: §4.5 (FR-501…510, FR-520…532, FR-540…543, AC-501…505), FR-402, §3.2 (page rows), §3.4,
> §6.2 (`pages`, `page_locks`, `files`), §6.4 (pages part), §7.6, §7.7, §8.1 (page trees, Wiki ทีม, 🔍 ⌘K), Appendix B, §12 M4 ·
> Owner-visible result: every project has a Project Charter; the team wiki and project documents are Notion-like pages
> (Thai slash menu, tables pasted from Excel, pasted screenshots, attachments, sub-pages, mentions, autosave) with a
> one-editor-at-a-time lease, manager-protected wiki pages, page trees in the sidebar and page search in Cmd/Ctrl+K.

---

## 1. Goal and scope

### 1.1 In scope

Ids `PERM-nn` follow `plan/research/r7-traceability.md` (§3.2 rows in table order); `FILE-n`, `EDI-n`, `TPL-Bn`, `DM-nn`,
`KEY-nn`, `UI-nn`, `NFR-nn` are r7's ids for un-numbered SPEC items. "S1.4" = stream S1, step 4 (§5).

| ID | Requirement (short) | Implemented in | Tested by |
|---|---|---|---|
| FR-402 | Creating a project creates its Project Charter from template B.1 (same tx) + idempotent backfill (X25) | S0.12 `charterTemplate` · S1.9 `createCharter`, `createProject` change, `ensureProjectCharters` in bootstrap + `seedGolden` | `charters.int.test.ts` · `projects.int.test.ts › charter` · `fixtures.int.test.ts › M4` · e2e E1 |
| FR-501 | Two spaces `WORKSPACE` / `PROJECT`, same page system | S0.3 schema · S1.2 `requirePage` · S1.3 services | `schema.int.test.ts › pages` · rows `PG-*` / `WK-*` |
| FR-502 | Sub-pages up to 10 levels (depth 0…9) | S0.3 check · S1.3 create/move depth rules · S2.5 `/หน้า` hidden at depth 9 | `page-tree.int.test.ts › depth` · `slash-menu.test.ts` |
| FR-503 | Sidebar tree: expand/collapse (remembered), drag to reorder / re-parent within one space | S1.4 `listTree`, `movePage` · S3.3 `PageTree` (`src/components/pages/PageTree.tsx`) + M3 `SortableTree` (maxDepthIndex 9) | `page-tree.int.test.ts › move` · `tree.test.ts` · `PageTree.test.tsx` · e2e E10 |
| FR-504 | Icon (curated emoji), optional cover image, title, content; breadcrumb | S1.3 rename/icon/cover · S3.2 `PageHeader`, `IconPicker`, `CoverImage`, `Breadcrumbs` | `pages.int.test.ts › header` · `IconPicker.test.tsx` · e2e E18 |
| FR-505 | URL `/p/[pageId]` for both spaces | S3.1 RSC page (authz before Suspense) | rows `PG-VIEW`, `WK-VIEW` · e2e E1, E4 (404 for outsider) |
| FR-506 | Create via sidebar `+`, `+` beside a parent, `/หน้า` | S1.3 `createPage` · S3.3 buttons · S2.5 `/หน้า` | `pages.int.test.ts › create` · e2e E2, E5 |
| FR-507 | Template on create: ว่าง · Project Charter · บันทึกการประชุม · คู่มือ/SOP | S0.12 templates · S1.3 `applyTemplate` · S3.4 `TemplateChooser` on blank pages | `templates.test.ts` · `templates.headless.test.ts` · e2e E11 |
| FR-508 | Duplicate with sub-pages | S1.5 `duplicatePage` (deep copy, remap `subpage` ids) | `pages.int.test.ts › duplicate` · e2e E9 |
| FR-509 | Delete page + sub-pages → undo toast | S1.5 `deletePage` / `restorePageBatch` · S3.3 undo entry | `pages.int.test.ts › delete/restore` · e2e E8 |
| FR-510 | Manager protects ("ล็อก") a wiki page → workers read-only; 🔒 | S1.2 effective protection (inherits) · S1.6 `setPageProtected` · S3.2/S3.3 toggle + 🔒 | rows `WK-PROT-*` · `pages.int.test.ts › protect` · e2e E7 |
| FR-520 | Slash menu Thai titles + English search (`/ตาราง`, `/table`) | S0.9 `th.editor.blocknote` · S2.2 `dictionary.ts`, S2.5 ranked slash menu | `dictionary.test.ts` · `suggest.test.ts` · `slash-menu.test.ts` · e2e E2, E12 |
| FR-521 | Paragraph, H1–H3, bullet, numbered, checklist, toggle, quote, code, divider | S2.3 schema | `schema.test.ts` · e2e E12 |
| FR-522 | Bold, italic, underline, strike, inline code, link, text colour, background colour | S2.3 `defaultStyleSpecs` | e2e E12 (formatting toolbar bold + colour) |
| FR-523 | Tables: add/remove rows & cols, header row, column resize, cell background | S2.4 `tables: { headers: true, cellBackgroundColor: true }` | e2e E2 (add column), E12 (header row) |
| FR-524 | Paste Excel / Google Sheets range → table block | S2.2 `paste.ts`, `tsv.ts` | `tsv.test.ts` · `paste.test.ts` · e2e E3 |
| FR-525 | Images: paste, drag & drop, `/รูป` | S2.2 `upload.ts` · S2.4 upload-only file panel · S1.7 `POST /api/files` | `upload.test.ts` · `files.int.test.ts` · e2e E4 |
| FR-526 | Image resize, align, caption | built into BlockNote image block (r3 §8.1) | e2e E4 (caption + align via toolbar) · manual M-3 |
| FR-527 | Attachments PDF/Word/Excel/PowerPoint/ZIP as a card with name + size; download | S2.3 custom `file` block (`size` prop) · S1.7 classifier + download headers | `attachment.test.tsx` · `files.int.test.ts` · e2e E13 |
| FR-528 | Sub-page card block created from `/หน้า` | S2.3 `subpage` block · S2.5 `/หน้า` | `subpage.test.tsx` · e2e E5 |
| FR-529 | `@` mention of a person or a page → clickable chip | S2.3 `mention` inline · S2.5 mention menu · S1.4 titles endpoint · S1.8 `titleOnly` search | `mention.test.tsx` · `pages.int.test.ts › titles` · e2e E14 |
| FR-530 | Drag blocks by the left handle | built-in side menu | e2e E12 (side-menu drag handle visible, `draggable="true"`) · manual M-3 (reorder by drag) |
| FR-531 | Autosave 800 ms after typing + when leaving; "กำลังบันทึก… / บันทึกแล้ว" | S2.6 `useAutosave` · S1.3 `savePageContent` · S1.6 keepalive `PUT /api/pages/[id]/content` | `useAutosave.test.tsx` · `pages.int.test.ts › save` · e2e E15 |
| FR-532 | Markdown shortcuts `#`, `-`, `1.`, `[]`, `>`, ```` ``` ```` | built-in input rules (r3 §11) | e2e E12 |
| FR-540 | "Cindy กำลังแก้หน้านี้" banner, others read-only | S1.6 lease service + `/api/pages/[id]/lock` · S2.7 `useEditLease` + banner | `page-lease.int.test.ts` · `useEditLease.test.tsx` · e2e E6 |
| FR-541 | Lease expires after 2 min without heartbeat (heartbeat 30 s + on visibility regain) | S1.6 `now() + interval '2 minutes'` · S2.7 timers | `page-lease.int.test.ts › expiry` · `useEditLease.test.tsx` |
| FR-542 | "แก้ต่อจากนี้" takeover; displaced editor flushes, then read-only | S1.6 unconditional upsert · S2.7 displaced flow | `page-lease.int.test.ts › takeover` · e2e E6 |
| FR-543 | Save sends `version`; mismatch → never overwrite, banner "มีการแก้ไขใหม่กว่า" + reload | S1.3 `WHERE version = $base` · S2.6 conflict banner + editor re-create | `pages.int.test.ts › version` · e2e E17 |
| AC-501 | `/ตาราง` → 3×3 → add column → survives reload | S2.5 custom table item · S2.4 | e2e E2 |
| AC-502 | Paste 4×3 Excel cells → 4×3 table with matching data | S2.2 paste handler | `paste.test.ts` · e2e E3 |
| AC-503 | Paste screenshot → image, survives reload; non-member opens image URL → 404 | S2.2 · S1.7 upload/download | e2e E4 · `files.int.test.ts › download` · row `FL-DOWNLOAD-P` |
| AC-504 | `/หน้า` in the charter → child in sidebar under charter + card in content | S2.5 · S1.3 `createPage` · S3.3 tree invalidation | e2e E5 |
| AC-505 | Cindy edits, Ivy opens → banner "Cindy กำลังแก้" and cannot edit | S1.6 · S2.7 | e2e E6 |
| PERM-16 | §3.2 ดู/สร้าง/แก้/ลบ หน้าเอกสารในโปรเจค — M/L/Me allow, W 404 (archived: writes 403, X42) | S1.2 `requirePage` via `requireProject` | rows `PG-*`, `FL-*` (§7.2) |
| PERM-17 | §3.2 ดูหน้า wiki ทีม — all allow | S1.2 | rows `WK-VIEW`, `WK-TREE`, `FL-DOWNLOAD-WIKI` |
| PERM-18 | §3.2 สร้าง/แก้หน้า wiki ทีม — all allow; protected page: M allow, workers 403 | S1.2 effective protection | rows `WK-CREATE`, `WK-SAVE`, `WK-PROT-*` |
| PERM-19 | §3.2 ล็อก/ปลดล็อกหน้า wiki ทีม — M allow, workers 403 | S1.6 `setPageProtected` | rows `WK-PROTECT`, `WK-UNPROTECT`, `PG-PROTECT` |
| PERM-06 (part) | Project visibility for page/file/tree/search reads | S1.2/S1.4/S1.8 | rows `PG-VIEW`, `PG-TREE`, `FL-DOWNLOAD-Q` · `masking.int.test.ts › pages` |
| FILE-1…8 | §7.6 upload route, allow-list, limits, SVG attachment-only, magic bytes, download authz, headers, no external images | S1.7 · S0.7 `upload-rules.ts` · S2.2 `externalImagesToLinks` | `classify-upload.test.ts` · `files.int.test.ts` · `paste.test.ts` · e2e E4, E13, E19 |
| EDI-1…6 | §7.7 JSON storage, `subpage`, `mention`, paste handler, Thai slash, lease API | S1.3 · S2.2–S2.7 · S1.6 | as rows above |
| TPL-B1…B3 | Appendix B templates | S0.12 `src/i18n/templates.th.ts` | `templates.test.ts` · `templates.headless.test.ts` |
| DM-09 | `pages`, `page_locks`, `files` (+ cover FK, trigram indexes) | S0.3 | `schema.int.test.ts` |
| DM-16 (pages) | pg_trgm search on `pages.title` / `content_text`; `content_text` built server-side incl. table cells | S0.6 `content-text.ts` · S1.3 · S1.8 | `content-text.test.ts` · `search.int.test.ts` |
| FR-1102 / KEY-01 (part, X08) | Cmd/Ctrl+K palette shell from every page + sidebar "🔍 ค้นหา… ⌘K" | S3.5 `CommandPalette` | `CommandPalette.test.tsx` · e2e E16 |
| FR-1104 / FR-1105 (pages part) | Results respect §3; Thai substring match | S1.8 `searchPages` | `search.int.test.ts` · `masking.int.test.ts › search` · e2e E16 |
| FR-407 (part, X26) | Permanent project delete also unlinks the project's files after commit | S1.10 `collectProjectFileKeys` / `unlinkFilesBestEffort` | `projects.int.test.ts › delete removes files` |
| FR-408 (part, X15) | Project tab "เอกสาร" | S3.6 | `ProjectTabs.test.tsx` · e2e E1 |
| FR-1201 (part, X44) | Audit page create/update/save/move/duplicate/delete/restore/protect and file upload (no content) | S1.3–S1.7 | matrix audit assertion · `pages.int.test.ts` |
| UNDO-3/5 (pages) | Delete returns `deleted_batch`; restore re-checks authz + 30 days | S1.5 · S3.3 | `pages.int.test.ts › restore` · row `PG-RESTORE` |
| UI-01 / UI-02 (pages) | Sidebar Wiki ทีม section, project page trees, 🔒, remembered page expansion (`page:<id>`) | S3.3 | `PageTree.test.tsx` · `Sidebar.test.tsx` · e2e E1, E7 |
| NFR-05 (smoke) | 300-block page opens < 1 s | S2.4 | §7.4 P-1 |
| NFR-07b (part) | Pages readable on mobile | S3.1 layout | §7.4 M-4 |
| NFR-08c / NFR-09 (editor part) | No CSP violations, no remote assets from the editor | S2.4 CSS imports | e2e CSP + external-request guards (M0 fixtures) on every M4 test |
| DEP-07 (part) | `UPLOAD_DIR`, `MAX_IMAGE_MB`, `MAX_ATTACHMENT_MB` validated | S0.5 env | `env.test.ts` |

### 1.2 Out of scope (do not build)

| Item | Lands in |
|---|---|
| Real-time co-editing (Yjs/Hocuspocus), cursors | SPEC §13 #1 |
| Live task/workload blocks (`taskView`, `projectWorkload`, slash `/มุมมองงาน` `/ภาระทีม`) and the charter section "งานและภาระของทีม" (SPEC v3.1 §4.13, App. B.1) | M10 (X78) |
| Live milestone block (charter "Milestones สำคัญ" stays static text) | SPEC §13 #2 |
| Notion database tables (typed columns, filters) | SPEC §13 #3 |
| Page version history / restore old versions | SPEC §13 #4 |
| Comments on pages | SPEC §13 #5 (BlockNote `comments={false}` stays off) |
| Notifications on mention | SPEC §13 #6 |
| Private pages | SPEC §13 #7 |
| Trash view / purge after 30 days (only the 30-day refusal exists) | SPEC §13 #9 |
| User-made templates, export PDF/Markdown | SPEC §13 #13 |
| Audit log UI | SPEC §13 #12 |
| Separate file drive (files exist only inside pages) | SPEC §1.4 |
| Palette categories projects / tasks / people / clients and quick commands (สร้าง task, สร้างหน้า, แจ้งลา, ไปหน้าวันนี้) | M10 (X08, X68) |
| Palette command "สร้าง milestone" | M8 (X08) |
| Home card "หน้าเอกสารที่แก้ล่าสุด 8 หน้า" | M10 (FR-1101) |
| Demo pages (POS charter filled, "บันทึก kickoff", "คู่มือทีม › วิธีใช้ระบบนี้") | M12 `addDemoPages` (X11, §3.13) |
| Full perf run on `seed:perf` (5 000 pages), mobile/tablet viewport suite | M12 |
| Strict `style-src` with nonces for BlockNote/Mantine (optional hardening) | M12 (r1 §7.2) |
| Fetching external images server-side | never in MVP (§7.6: insert a link instead) |
| Table merge/split cells, cell text colour, multi-row headers, code syntax highlighting, audio/video blocks | not required by FR-521/523 (M4-D11/D12) |
| `@blocknote/xl-*` (GPL/commercial), `@blocknote/server-util`, `@blocknote/code-block` | never (PLAN §1.2) |
| Sidebar workload badge, "งานของฉัน" count changes | M9 (X22, X31) |

### 1.3 Carried in (from earlier milestones, per PLAN §1.4)

| From | Item | Where M4 uses it |
|---|---|---|
| X25 (M2 → M4) | FR-402 charter in `createProject`'s transaction + `ensureProjectCharters()` for older projects | S1.9 |
| X70 (M3) | `createProject` already calls `ensureProjectStatuses(tx, project.id)` (5 FR-621 defaults) in the same transaction with one audit row (M3-D4); `scripts/bootstrap.ts` and `seedGolden` already run `ensureAllProjectStatuses` | S1.9 adds the charter **after** the statuses, same tx, still one audit row; `ensureProjectCharters` runs next to `ensureAllProjectStatuses` |
| X26 (M2 → M4) | M2's `services/projects.ts#collectProjectFileKeys` returns `[]` and `unlinkFilesBestEffort` is a no-op | S1.10 fills both |
| X08 (M4 part) | Palette shell + page search | S3.5, S1.8 |
| X33 (M4 part) | Page trees in the sidebar, remembered expansion via `user_preferences` key `sidebar.expanded` (M2 allows `page:<uuid>` values) | S3.3 |
| X15 (M4 part) | Project tab "เอกสาร" appended to M2's `PROJECT_TABS` (after M3's "งาน") | S3.6 |
| X04 / M3 | Client `UndoProvider` (8 s toast, Cmd+Z) and the server `deleted_batch` restore pattern | S1.5, S3.3 |
| M3 (S1.2, S3.2) | `src/lib/tree/projection.ts` and `src/components/tree/SortableTree.tsx` (`maxDepthIndex` parameter, `MoveIntent`) | S3.3 with `maxDepthIndex: 9` |
| M3 (S0.11) | `src/lib/shortcuts.ts` registry + `?` help dialog | S0.11 adds Cmd+K |
| M0/M1 | `isEditableTarget` already treats `.bn-editor` as editable; `useHotkeys` skips `e.defaultPrevented` | S3.5, S2.4 |
| M0 | `viewport.interactiveWidget = 'resizes-content'`, CSP with `style-src 'unsafe-inline'`, `serverActions.bodySizeLimit: '4mb'`, proxy matcher excludes `/api` | S0.1 verifies; S2.4 relies on it |
| M2 | `requireProject(tx, user, projectId, need, opts?)`, `visibleProjectIds`, `orNotFound()`, `GET /api/people/options`, `qk.peopleOptions()` | S1.2, S1.8, S3.1, S2.3 |

---

## 2. Read first

- **SPEC:** §0–§3 (all), §4.5 (all), FR-402, §4.11 FR-1102…1105 (only the pages part applies), §6.1, §6.2 (`pages`, `page_locks`,
  `files`), §6.4, §7.3, §7.5, §7.6, §7.7, §8.1, §8.6 (`Cmd/Ctrl+K`), §8.8, §8.9, §9 (5 000 pages, 300-block page < 1 s, palette
  < 200 ms), Appendix B, §12 M4, §13.
- **PLAN.md:** §1.2 (BlockNote/Mantine/file-type/cmdk pins, forbidden packages), §1.3 (BlockNote 0.55, Next 16.3 `refresh()`,
  body limits, CSP, Drizzle `orderKey`, file-type, cmdk, Playwright clipboard), §1.4 X04, X08, X10, X11, X15, X25, X26, X30,
  X33, X40–X49, X53, **X63**, X68 (search rules reused for pages); §2.3 ownership; §3.4 (errors, `action()`, `route()`, authz,
  transactions, audit); §3.5 (query keys, invalidation); §3.7 (i18n incl. `editor.blocknote`, templates); §3.8 (undo, keys);
  §3.9 (MUI); **§3.11 editor architecture**; §3.12 (files, headers); §3.13 (seeds); §4 (testing, world, matrix, e2e).
- **Research:** `plan/research/r3-blocknote.md` (all; §0 TL;DR, §4 schema/blocks, §5 suggestion menus, §6 dictionary, §7 paste,
  §8 uploads, §9 content_text, §10 theme, §12 autosave/lease, §13 validation, §14 tests, §15 gotchas); snippets
  `plan/research/snippets/r3/harness/src/**`, `snippets/r3/nodecheck/**`, `snippets/r3/next-app-pnpm/**`,
  `snippets/r3/fixtures/complex-doc.json`; `r4-client-testing.md` §17–§21 (dnd-kit tree, cmdk), §24–§28 (fractional keys,
  file-type, classifier), §41 (clipboard); snippets `snippets/r4/server/classify-upload.ts`,
  `snippets/r4/client/components/palette/CommandPalette.tsx`, `snippets/r4/client/components/tree/*`; `r1-next-mui-tooling.md`
  §2.1 (proxy body buffering), §2.3 (`refresh()`), §2.5 (server action body limit), §7.2 (CSP with BlockNote); `r2-auth-db.md`
  §12 (Drizzle `pages`/`page_locks`/`files` translation, circular FK), `snippets/r2/sql/95_trgm.sql`; `r6a-gaps-m0-m5.md` §3.5
  (M4-01…M4-28), X-16, X-22, X-23, §5.4 (lease SQL), §5.6 (upload matrix), §6 rows 21–29; `r7-traceability.md` §F M4 rows.
- **Previous plans (names reused verbatim):** `plan/m02-clients-projects-authz.md` S0.11 (`requireProject(tx, user, projectId, need: 'view'|'edit'|'manage'|'owner', opts?)`,
  `visibleProjectIds` → `'ALL' | Set<string>`), S1.5 (`createProject`), M2-D21 (`orNotFound`); `plan/m03-tasks.md` S2.12 (`seedGolden(db, { upTo })`) and S2.14 (`taskStatuses.ts#ensureProjectStatuses`,
  `ensureAllProjectStatuses`), S1.2/S3.2 (`projection.ts`, `SortableTree`). **Later plans that extend M4 files:** `plan/m08-milestones.md`
  S4.10 (`PALETTE_COMMANDS`, `CommandsGroup` before `PALETTE_GROUPS`), `plan/m10-home-search.md` S0.3/S0.4/S0.10/S2.3/S4.5 (live block types, `normalize.ts`,
  palette groups, E16/E1 updates) — read their M4 rows only to keep the extension points of M4-D37 intact.
- **Where research disagrees with PLAN, PLAN §1.4 wins** (recorded in §3): r7 "lock not inherited" → X63 inherits; r6a M4-15
  `cellTextColor: true` → PLAN §1.3 "no cell text colour"; r6a X-22 "Cmd+K always opens, even in the editor" → PLAN §1.3
  "return early when `e.defaultPrevented`"; r3 `next-app-pnpm/components/editor/PageEditor.tsx` imports `inter.css` → never.
- **docs/:** none needed (v2.1 has no documents feature; `r5-v21-mining.md` §2 M4).

---

## 3. Decisions for this milestone

### 3.1 Applicable cross-milestone rulings (PLAN §1.4)

| ID | What it means in M4 |
|---|---|
| X04 | Page delete returns `deleted_batch`; the undo entry calls `restorePageBatch`; 8 s toast + Cmd+Z; no confirm dialog anywhere in M4. |
| X05 | Sidebar page expansion is stored in `user_preferences` (`sidebar.expanded`, values `page:<uuid>`), never `localStorage`. |
| X08 | M4 builds the palette shell (cmdk in MUI `Dialog`, global Cmd/Ctrl+K, sidebar search button) with **only** the pages category. |
| X10 | M4 tables: `pages`, `page_locks`, `files` (+ the circular `pages.cover_file_id` FK). No custom migration is needed (extensions exist since M0). |
| X11 | `seedGolden` M4 part = charters via `ensureProjectCharters()` (5 charters for the golden projects). |
| X15 | "เอกสาร" tab appears now, after "งาน"; never as a disabled placeholder. |
| X25 | `createProject` creates the charter in the same transaction; `ensureProjectCharters()` runs from bootstrap and seed. |
| X26 | M4 fills M2's file-key collection and best-effort unlink after commit. |
| X30 / X43 | Search and titles filter PROJECT pages with `visibleProjectIds` (archived member projects included, read-only). |
| X33 | Page trees + remembered expansion in the sidebar. |
| X40 | `pnpm check` includes the integration project (pages/lease/files/search tests need `pnpm db:up`). |
| X41 | Invisible page/file/project → 404; visible but not allowed (protected, archived) → 403; authz at the top of `/p/[pageId]` before any Suspense. |
| X42 | Pages of archived projects are viewable; every write (create, save, rename, move, delete, upload, lease) → `FORBIDDEN` via `requireProject`. |
| X44 | Every mutating page/file action writes exactly one audit row in its transaction (page saves without content); lease calls are not audited. |
| X45 | Meeting-notes title date and storage-key `yyyy/mm` use `serverToday()`; lease expiry uses the DB `now()` (a timestamp, not a plan date). |
| X46 | `e2e/m4-pages.spec.ts` on the production build, `resetDb()` per describe block, `loginAs`, pinned clock, page objects. |
| X47 | `z.uuid()`; all Thai text from `th`; `refresh()` only where RSC output changes — no M4 action needs it (M4-D29). |
| X48 | `pages.position` is `orderKey`; keys generated on the server between real neighbours under `pg_advisory_xact_lock(hashtext('pages:' …))`; `ORDER BY position, id`. |
| X49 | Cmd/Ctrl+K matches `e.code === 'KeyK'` first; ignored when `e.defaultPrevented` (BlockNote link shortcut). |
| X53 | No `localStorage`; no client `crypto.randomUUID` (BlockNote assigns block ids itself; page ids come from the server). |
| X54 | Prettier/ESLint/tsconfig ignore `plan/**` — nothing under `plan/research/snippets` is imported; snippets are **copied** into `src/` by the steps. |
| X55 | Integration tests use per-run DB names; M4's per-worker `UPLOAD_DIR` uses the same run id; the e2e DB is migrated + seeded inside `webServer.command`. |
| X56 | `import 'server-only'` only in `session.ts`/`clock.ts`: `storage.ts`, services and repo stay importable from scripts and Playwright; services take `today` as input. |
| X57 | No `loading.tsx` / Suspense above `/p/[pageId]`, `/projects/[id]/pages` (may 404); `getPageView` wrapped in `orNotFound()`. |
| X58 | Page tree moves send intent `{ pageId, parentId, afterId }`; the r4 `SortableTree` snippet's client key generation is not copied (M3's `SortableTree` already follows this). |
| X59 / X96 | Default: services write the audit rows inside the caller's transaction (also `ensureProjectCharters` with actor `null`). X96 exception, as written in S1.3/S1.6/S1.7: `createPage`, `renamePage`, `savePageContent` (action **and** keepalive `PUT`) and `POST /api/files` write their row in the action/route, after the service, same tx (M4-D38; M12's `AUDIT_IN_SERVICE` mirrors it). Factories `makePage`/`makeFile` insert with plain Drizzle. |
| X70 | `createProject` keeps M3's default-status insert; M4 appends the charter insert to the same transaction (S1.9). |
| X78 | No live blocks, slash items or charter section "งานและภาระของทีม" in M4 (M4-D30); M10 appends to `BLOCK_TYPES`/`checkBlockProps`, the editor schema and `charterTemplate()` (M4-D37). |
| X80 | Service/repo files kebab-case: `services/page-lease.ts`, `page-tree.ts`, `repo/page-locks.ts` (M4-D36 is now the PLAN rule); namespaces camelCase. |
| X81 | `src/components/pages/PageTree.tsx` (sidebar + project tab) replaces PLAN's `shell/SidebarPageTree`; `src/components/palette/groups.tsx` holds `PALETTE_GROUPS`. |
| X82 / X83 | `qk.search(q, scope = 'all')`, `qk.pagesTreeScope`; `invalidatePages` covers the whole `['search']` prefix (so M10's `qk.searchIndex()` = `['search','index']` refreshes too). Fetches use `getJson`. |
| X84 | Tab `{ id: 'pages', order: 3 }` on M2-D10's scale (ภาพรวม 0 · แผนงาน 1 · งาน 2 · เอกสาร 3). |
| X86 | Route params are parsed inside the handler; a malformed `[id]` on `/api/pages/[id]/**` or `/api/files/[id]` is a 404 like a missing one (`getLivePageOrNotFound`, `requireFile`); query-string errors (`/api/search?q=`, `/api/pages/titles?ids=x`) stay 400. |
| X88 | Palette: M4 owns `PALETTE_GROUPS` and `SearchResponse` (pages only); M8's `PALETTE_COMMANDS`/`CommandsGroup` renders **before** them (and renders nothing when no command is visible); M10 appends groups and `SearchResponse` keys additively; page objects keep the `[cmdk-group]` fallback. |
| X89 | New block types extend `BLOCK_TYPES` + the exported `checkBlockProps` (M4-D37); M10's interactive blocks isolate their own events. |
| X91 | Rows files `pages`, `wiki`, `files`, `search` are registered in `tests/authz/rows/index.ts` (S0.15 stubs, S4 fills); route rows are named `'POST /api/files'`-style; outcomes include `'413'`/`'415'`; `resetDb` empties `UPLOAD_DIR`; AC-503 paste tested both ways (M4-D34). |
| X63 | Protected (`pages.locked`, 🔒, inherits to sub-pages) ≠ edit lease (`page_locks`, `services/page-lease.ts` — X63 writes `pageLease.ts`; same module, file name per M4-D36). Depth 0…9; moves within one space/project; duplicate deep-copies with remapped `subpage` ids, shares files, copy never a charter; charter not deletable; `+` creates a blank page that offers the template chooser; downloads authorised by `files.project_id`; lease upsert `WHERE user_id = me OR expires_at < now()`, 2 min, heartbeat 30 s + on visibility regain, takeover unconditional; save accepted iff `version = baseVersion` and the user can edit (lease not required); displaced editor flushes then read-only; taker edits after a fresh fetch; leave-page save via keepalive `PUT` ≤ 60 KB (Deviation) else `beforeunload`; mentions resolve through `GET /api/pages/titles?ids=` without leaking titles; curated ~60-emoji icon grid. |

### 3.2 Milestone-specific decisions

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M4-D1 | §7.1 | **DEVIATION (already recorded at M0 as OWN-2):** editor UI package is `@blocknote/mantine` 0.55.0 + `@mantine/core`/`@mantine/hooks` 9.6.3, themed to MUI through `--bn-*` CSS variables; no `@blocknote/shadcn`. | Owner chose MUI; BlockNote has no MUI package; Mantine CSS is scoped to `.bn-mantine` (r3 §1.3). |
| M4-D2 | FR-531, §7.3 | **DEVIATION (X63):** the leave-page save is a route-handler write `PUT /api/pages/[id]/content` (keepalive, ≤ 60 KB) reusing `savePageContent`; everything else saves through the `savePageContent` server action. | A server action cannot run from `pagehide`; keepalive bodies are capped at 64 KiB (r6a M4-20). |
| M4-D3 | FR-540, §7.7 | `GET /api/pages/[id]/lock` (read lease state, view permission) is added next to SPEC's `POST`/`DELETE`, so viewers who cannot edit (protected page, archived project) still see "Cindy กำลังแก้หน้านี้". Viewers poll it every 30 s; when the polled `version` increases and the viewer is read-only, the content reloads silently. | FR-540 says "คนอื่นเห็นแถบ" for everyone; reads must be GET route handlers (CLAUDE.md). |
| M4-D4 | FR-543 | Only content saves bump `pages.version`. Title, icon and cover are separate last-write-wins actions (audited) and never conflict with autosave. | Avoids false `VERSION_CONFLICT` while typing a title; FR-543 is about content. |
| M4-D5 | FR-402, X44 | Charter creation inside `createProject` is part of that operation: still **one** audit row (`entity 'project'`, `after.charterPageId`), so the M2 matrix row stays valid. `ensureProjectCharters()` writes one audit row per created charter with actor `null`, `created_by = updated_by = projects.created_by`. | Keeps X44's "one row per user operation"; scripts have no actor. |
| M4-D6 | FR-402, App. B, P5 | The auto-created charter (title "Project Charter", 📋, `is_charter = true`) pre-fills the info table cells ลูกค้า (client name or "—"), Project Lead (display name of the first LEAD or "—") and ความแน่นอน (`th.projects.certainty[...]`); ช่วงเวลา stays blank. Choosing the Charter template on any other page creates a normal page with blank cells. The charter cannot be deleted (menu item hidden, server `FORBIDDEN`) and stays at the root (move only among roots). | r6a M4-09; guarantees "มี charter ทันที". |
| M4-D7 | FR-507 | Templates replace a **blank** page's title, icon and content through `applyTemplate({ pageId, baseVersion, template })`. Meeting notes: title `th.pages.meetingTitle(formatThaiDate(serverToday(),'medium'))`, 📝. SOP: title `''` (the title field gets focus), 📘. Blank = title `''` and content `[]` or only empty paragraphs (`isBlankPage`). "ว่าง" just dismisses the chooser (no server call). | P1 (no dialog), r6a M4-10. |
| M4-D8 | §7.7 | Templates are stored as BlockNote **partial** blocks (string content, string table cells, no ids); BlockNote assigns ids on first load and the next save stores full blocks. `pageContentSchema` therefore accepts both full and partial blocks. | One validator for templates, saves and seeds (r3 §13). |
| M4-D9 | §7.7, FR-529 | Server validation: unknown block types, wrong prop types, `heading.level ∉ {1,2,3}`, unsafe link hrefs (anything but `http:`, `https:`, `mailto:`, `tel:` or a same-origin path starting with `/` but not `//`), size > 2 MB, nesting > 20, > 5 000 blocks → `VALIDATION` (`th.pages.errors.contentInvalid` / `contentTooLarge`). Image/file blocks whose `url` is not `''` or `^/api/files/<uuid>$` are **converted** to a paragraph containing a link (http/https) or the file name (anything else). | X63 / PLAN §3.11; data hygiene for drag-dropped external images (r3 §8.3). |
| M4-D10 | §6.4 | `content_text` = `extractContentText(content)` without a user-name resolver: user mentions, page mentions and sub-page cards are **not** indexed. | Names go stale and page titles may be invisible to the searcher (r3 §9). |
| M4-D11 | FR-523 | `tables: { headers: true, cellBackgroundColor: true, cellTextColor: false, splitCells: false }`; header toggles only for the first row/column; no merge/split. | PLAN §1.3 (overrides r6a M4-15); FR-523 asks only for background colour. |
| M4-D12 | FR-521 | Schema keeps: paragraph, heading (levels 1–3, no toggle headings), bullet, numbered, check, toggle list, quote, codeBlock (no highlighting), divider, table, image (png/jpeg/gif/webp accept list), custom `file` attachment, `subpage`. No audio/video. The `:` emoji picker stays, guarded by `atWordStart`. | FR-521 list; §7.6 has no audio/video types (r3 §4.1). |
| M4-D13 | FR-524 | Plain-text (non-TSV) pastes keep BlockNote's markdown interpretation (`prioritizeMarkdownOverHTML: false, plainTextAsMarkdown: true`); the tiptap `* … *` italic paste rule is accepted. | r3 §7.4 product note, G19. |
| M4-D14 | FR-506, AC-504 | `/หน้า` inserts a placeholder `subpage` card (`pageId: ''`, "กำลังสร้างหน้า…") at the cursor, calls `createPage({ parentId: current })`, then sets `pageId`; on failure the placeholder is removed and a toast shows. The user stays on the page. Undoing the card (Cmd+Z in the editor) leaves the child page; deleting a card never deletes a page; moving a page leaves existing cards. | Verified flow (r3 §5.2); keeps the cursor position stable during the async call. |
| M4-D15 | §7.6 | Upload limits come from env `MAX_IMAGE_MB` (default 10) and `MAX_ATTACHMENT_MB` (default 25) and are passed to the editor as props for the client pre-check. `POST /api/files` returns 413 `TOO_LARGE`, 415 `UNSUPPORTED_TYPE`, 400 when received bytes ≠ `Content-Length`. Classification = `snippets/r4/server/classify-upload.ts` (detected type + client extension; SVG only as attachment; csv/txt any encoding without NUL). | SPEC §10.3 env + r6a M4-12/X-16. |
| M4-D16 | §7.6 | The bytes are written to `UPLOAD_DIR` (temp file + rename) **before** the `files` insert; if the insert or audit throws, the file is removed best-effort. A crash between commit and response can at worst leave an orphan file (logged). | Simplest correct ordering; DB never references a missing file. |
| M4-D17 | §7.6 | Downloads are authorised by `files.project_id` only (null → any logged-in user; else `requireProject(view)`, archived included); the state of the originating page is ignored. `pages.cover_file_id` must reference an `IMAGE` file of the same `project_id`. | X63; duplicates share files. |
| M4-D18 | §9 security | Mutating route handlers (`POST /api/files`, `POST|DELETE /api/pages/[id]/lock`, `PUT /api/pages/[id]/content`) reject requests whose `Origin` header is present and differs from the request origin (`assertSameOrigin`, 403). Server actions keep Next's built-in origin check. | Defence in depth on top of `SameSite=Lax`. |
| M4-D19 | FR-1102/1105, X68 | `GET /api/search?q=&titleOnly=` returns `{ pages: PageSearchHit[] }` (extensible by M10). Title hits first (escaped `ILIKE`, `word_similarity` desc, `length(title)`, `id`), then content hits only when `q` has ≥ 3 characters (unordered, filling up to 8 total), inside a read-only transaction with `SET LOCAL statement_timeout = '500ms'`; a timeout of the content query returns the title hits only. Pages of visible archived projects are included (subtitle = project name). | X68 applied to the only M4 category; FR-1104 by SQL filter. |
| M4-D20 | FR-529, X09 | Mention menu: people come from `GET /api/people/options` (active users only, filtered client-side by name/nickname/position, ranked with `rankSuggestionItems`), pages from `GET /api/search?titleOnly=1` (visible pages only). Chips resolve live: users via the cached people options (deactivated → "(ปิดใช้งาน)"), pages via `GET /api/pages/titles` (`visible:false` → "หน้าที่คุณไม่มีสิทธิ์เข้าถึง", `deleted:true` → "หน้านี้ถูกลบแล้ว"). | Masking at the server (r6a M4-22). |
| M4-D21 | FR-509, §7.5 | Page restore: batch rows → `requirePage` on the root(s) for `edit` (archived 403, protected parent → workers 403), 30-day window on `deleted_at`, parent alive, depth recomputed from the parent and ≤ 9; failures → `CONFLICT` "กู้คืนไม่ได้ เพราะ…". Deleting a page soft-deletes the subtree with one batch and deletes the lease rows of those pages; files stay. Saving a deleted page → 404 → banner "หน้านี้ถูกลบแล้ว". | Same pattern as M3-D12 (r6a M4-26). |
| M4-D22 | FR-508 | Duplicate needs `view` on the source and create permission at the destination (the source's parent, or the space root); the copy root is titled `th.pages.copyTitle(title)` and placed right after the original; `is_charter=false`, `locked=false`, `version=1`, same `icon`/`cover_file_id`; content copied with `subpage.pageId` remapped (old→new) and mentions unchanged; files not copied; one audit row. | r6a M4-08 + X63. |
| M4-D23 | FR-503 | Sidebar trees load children lazily per expanded node (`GET /api/pages/tree?parentId=`). Because a collapsed, never-loaded subtree's height is unknown on the client, the server is the authority: an over-deep move returns `VALIDATION maxDepth`, the client shows the toast and refetches. | r6a M4-23; 5 000-page target. |
| M4-D24 | FR-510 | Effective protection = the page or any ancestor has `locked = true` (recursive CTE, ≤ 10 levels; WORKSPACE only). For workers it blocks: content save, rename, icon, cover, upload, lease, create child, move (from or into), duplicate into it, delete, and deleting an unprotected page whose subtree contains a protected page. `setPageProtected` on a PROJECT page → `VALIDATION protectWikiOnly` (managers) / 403 (workers) / 404 (non-members). | r6a M4-05/06; X63. |
| M4-D25 | §6.2 | Drizzle names the cover FK `pages_cover_file_id_files_id_fk` (r2-verified `.references((): AnyPgColumn => files.id)`), not SPEC's `pages_cover_fk`; one extra index `files_project_id_idx` serves FR-407 key collection and FK cascades. | Behaviour identical; no hand-edited migration. |
| M4-D26 | FR-531 | Save status values: `idle` (nothing shown), `saving` "กำลังบันทึก…", `saved` "บันทึกแล้ว", `error` "บันทึกไม่สำเร็จ · ลองใหม่" (retries on the next change or after 5 s), exposed as `data-save-state` for e2e. | FR-531 wording; deterministic e2e waits (PLAN §4.5). |
| M4-D27 | §8.1 | Sidebar order: 🔍 ค้นหา… ⌘K (top) · primary nav · โปรเจค (each expanded project: sub-links ภาพรวม · งาน · เอกสาร, then its page tree) · **Wiki ทีม** (`+` for every user, tree) · bottom group. | SPEC §8.1 mock (แผนงาน appears in M6). |
| M4-D28 | §4.5 | Page title ≤ 200 characters (trimmed; empty = "ไม่มีชื่อ" in UI); file names stored sanitised (no path separators/control characters, ≤ 200 chars). | Bounded inputs. |
| M4-D29 | §7.3, X47 | No M4 action calls `refresh()`: the page header (title, icon, cover, protected state) is client state seeded from the RSC `PageView` and updated from action results; trees, titles, search and the sidebar are TanStack queries (`invalidatePages`); other pages' breadcrumbs are fresh on navigation (dynamic routes). Re-rendering `/p/[id]` mid-typing would otherwise remount nothing useful. | Keeps actions fast (dispatched one at a time) and avoids RSC churn during autosave. |
| M4-D30 | §4.13, App. B.1, X78 | `charterTemplate()` in M4 stops after "การสื่อสาร" **without** the v3.1 section "งานและภาระของทีม"; M10 inserts that section (h2 + the two live blocks) after "Milestones สำคัญ". Charters created before M10 are not migrated (users can insert the blocks with the slash menu). The `content-text.ts` walker must already ignore blocks that have no inline content or unknown types, so M10's blocks need no walker change. | M4 must not build M10 blocks; the walker rule keeps search stable when they arrive. |
| M4-D31 | §3.2, X41 | Order of checks whenever a request names a **second** page (target parent of `movePage`/`createPage`, destination of `duplicatePage`): (1) `requirePage(other, 'view')` → invisible/deleted → `404`; (2) same `space`/`project_id` → else `VALIDATION crossSpace` (400); (3) `requirePage(other, 'edit')` → protected/archived → 403. A worker therefore gets 404 (never 400) for a parent in a project they cannot see, exactly like M3's `T-MOVE-X`. S1.3/S1.5 implement this order; matrix rows `PG-MOVE-X`, `PG-CREATE-X` pin it. | A 400 for an invisible id would confirm the page exists (X41). |
| M4-D32 | §3.3, FR-528/529 | Page ids stored **inside** content (mention `props.id`, `subpage.props.pageId`) are returned verbatim to everyone who may view that page; they are opaque UUIDs and resolve only through `GET /api/pages/titles` (`visible:false`). Masking tests therefore forbid titles/content/file names of invisible pages, and forbid invisible ids only in bodies that are not page content (search, tree, titles items other than the requested ids, errors). | Stripping ids would corrupt shared documents; titles are the secret, ids are not capabilities. |
| M4-D33 | AC-502 | "copy 4×3 เซลล์" = Excel's selection notation 4 columns × 3 rows → the expected block is a table with **3 rows × 4 cells** (r3 §7.3 measured the same). | r3 §7.3; matches how Excel reports a selection. |
| M4-D34 | AC-503, §12 M4, PLAN §4.5 | AC-503 is tested twice in E4: the **real** clipboard route (`navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` + `ControlOrMeta+V`, a trusted paste) and the route §12 names (`page.evaluate` + `DataTransfer` with a `File` + synthetic `ClipboardEvent`). The direct-URL 404 is asserted with Peter's own `APIRequestContext` (`request.get(src)`) **and** `page.goto(src)` status. | SPEC §12 and PLAN §4.5 name different techniques; both are cheap and catch different bugs (trusted event vs. handler routing). |
| M4-D35 | PLAN §4.5, FR-541/542/543 | E2E never waits for the 30 s heartbeat: the lease is re-polled by dispatching `visibilitychange` (the hook's "tab visible again" POST, FR-541). The FR-543 conflict (E17) uses `page.clock.install()` + `runFor()` so the 800 ms debounce fires only after a same-user `PUT /api/pages/:id/content` has bumped the version. Test data the scenario is not about is inserted by `resetDb(undefined, { extras })` with plain Drizzle (`e2e/support/seed-pages.ts`); `resetDb` also empties `.e2e-uploads/`. | Deterministic e2e without sleeps (PLAN §4.5); no server-action calls from Playwright. |
| M4-D36 | PLAN §3.1/§3.5/§3.11, X63 | File and key names (names only, no behaviour change; reported for PLAN): services/repo files are **kebab-case** like M1–M3's `my-tasks.ts`/`task-tree.ts` and M5's `time-off.ts` (`services/page-lease.ts`, `page-tree.ts`, `repo/page-locks.ts`) — now the PLAN rule (X80; X63 updated; M3's camelCase v3.1 services are X80's documented exception); the shared tree component is `src/components/pages/PageTree.tsx` (sidebar **and** project tab) rather than PLAN §3.1's `shell/SidebarPageTree`; PLAN §3.11's `services/pages.ts#save` is `savePageContent`; `qk.search(q, scope = 'all')` adds a `scope` argument to PLAN §3.5's `search(q)` (M10 calls `qk.search(q, 'all')`) and `qk.pagesTreeScope` is a new prefix helper. Do not rename to match PLAN while implementing M4. | One style per milestone file; renaming is a PLAN-level decision (HANDOFF G1/G2). |
| M4-D37 | X78, X08 | Forward compatibility with M8/M10 (they extend M4 files additively, never restructure): (a) `BLOCK_TYPES` in `page-content.ts` is the **only** block-type list; `checkBlockProps` is an exported function; the editor schema-parity test compares `schema.blockSpecs` keys with `BLOCK_TYPES`, so M10 appending `taskView`/`projectWorkload` to both keeps it green; no other M4 test enumerates the full type list. (b) `normalizeQuery`/`escapeLike` are exported from `services/search.ts`; M10 moves their bodies to `src/lib/search/normalize.ts` and re-exports them from there, so M4 code and tests import them only from `@/server/services/search`. (c) Charter content assertions (unit, int, e2e) use containment (`toContain`, `arrayContaining`), never exact heading/block lists or exact `content_text`, because M10 adds the live section and `seedGolden` charters then include it; the single "no live section" check is the M4-only unit case in S0.12 (M10 S0.8 replaces it) plus the G2 grep. (d) Palette tests select options **by name inside the pages group** (`palette.group(th.palette.groups.pages)`), never by index or by total option count, and assert nothing about the absence of other groups (M8 adds "คำสั่ง", M10 adds categories and commands on an empty query). (e) `PALETTE_GROUPS` lives in `src/components/palette/groups.tsx` with the item/group shape M10 extends (S3.5). | HANDOFF C1/C46/C47/C31: later milestones must not have to weaken or rewrite M4 tests. |
| M4-D38 | FR-1201, X59, X96, M12-D34 | **Audit placement.** `createPage`, `renamePage` and `savePageContent` (the server action and the keepalive `PUT /api/pages/[id]/content`) and `POST /api/files` (`storeUpload`) write their audit row in the **action/route**, right after the service, in the same transaction (X96 accepts it: the summary needs action-level data such as the final title); every other M4 service (`setPageIcon`, `setPageCover`, `applyTemplate`, `movePage`, `duplicatePage`, `deletePage`, `restorePageBatch`, `setPageProtected`, `createCharter`/`ensureProjectCharters`) writes its own row (X59). The four in-action services therefore never call `audit.log`, which M12's `AUDIT_IN_SERVICE` (`createPage`/`renamePage`/`savePageContent`/`storeUpload` = `false`) pins; the matrix's one-row assertion (X44) covers both placements. | One explicit rule per operation, so seeds (M12) neither double-audit nor miss a row. |

---

## 4. Streams (machine-readable)

```json
{
  "milestone": 4,
  "streams": [
    {
      "id": "S0",
      "title": "Contracts: deps, pages/page_locks/files schema + migration, env upload vars, zod content schema, DTOs, content-text walker, templates, authz/service/action/route stubs, storage interface, i18n, query keys, shortcuts, factories + world pages/files, authz row files",
      "agent": "backend-engineer",
      "owns": [
        "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
        "src/server/db/schema.ts", "src/server/db/schema.int.test.ts", "drizzle/**",
        "src/server/env.ts", "src/server/env.test.ts", ".env.example", ".gitignore",
        "src/server/audit.ts", "src/server/errors.ts", "src/server/route.ts",
        "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts",
        "src/lib/keys.ts", "src/lib/keys.test.ts", "src/lib/shortcuts.ts", "src/lib/files/**",
        "src/lib/pages/icons.ts", "src/lib/pages/icons.test.ts", "src/lib/pages/blank.ts", "src/lib/pages/blank.test.ts",
        "src/lib/editor/content-text.ts", "src/lib/editor/content-text.test.ts", "src/lib/editor/__fixtures__/**", "src/lib/editor/deps.test.ts",
        "src/i18n/th.ts", "src/i18n/templates.th.ts", "src/i18n/templates.test.ts",
        "src/server/authz.ts", "src/server/storage.ts",
        "src/server/repo/{pages,page-locks,files}.ts",
        "src/server/services/{pages,page-tree,page-lease,files,search,charters}.ts",
        "src/server/actions/pages.ts",
        "src/app/api/pages/**", "src/app/api/files/**", "src/app/api/search/**",
        "src/components/editor/EditorClient.tsx", "src/app/layout.tsx",
        "tests/helpers/**", "tests/setup/db-worker.ts",
        "tests/authz/rows/index.ts", "tests/authz/rows/{pages,wiki,files,search}.ts"
      ],
      "dependsOn": [],
      "planSection": "5.S0"
    },
    {
      "id": "S1",
      "title": "Pages backend: authz bodies, tree/create/move/duplicate/delete/restore/protect/save services and actions, lease service + routes, files upload/download + storage, search, charter in createProject + ensureProjectCharters, file cleanup on permanent delete",
      "agent": "backend-engineer",
      "owns": [
        "src/server/authz.ts", "src/server/authz.pages.int.test.ts",
        "src/server/storage.ts", "src/server/storage.int.test.ts",
        "src/server/http/**", "src/server/files/**",
        "src/server/repo/{pages,page-locks,files}.ts",
        "src/server/services/{pages,page-tree,page-lease,files,search,charters,projects}*.ts",
        "src/server/actions/pages.ts", "src/server/actions/projects.ts",
        "src/app/api/pages/**", "src/app/api/files/**", "src/app/api/search/**",
        "scripts/bootstrap.ts", "scripts/lib/fixtures.ts", "scripts/lib/fixtures.int.test.ts"
      ],
      "dependsOn": ["S0"],
      "planSection": "5.S1"
    },
    {
      "id": "S2",
      "title": "BlockNote editor: schema + custom blocks, Thai dictionary, ranked slash/mention menus with word-start guards, paste/TSV, uploads, autosave, edit lease + banners, theme bridge, error boundary, pure editor libs",
      "agent": "editor-engineer",
      "owns": ["src/components/editor/**", "src/lib/editor/**"],
      "dependsOn": ["S0"],
      "planSection": "5.S2"
    },
    {
      "id": "S3",
      "title": "Page shell /p/[pageId] (header, breadcrumb, icon, cover, protect toggle, template chooser), sidebar search + Wiki ทีม + project page trees, project เอกสาร tab, command palette shell",
      "agent": "frontend-engineer",
      "owns": [
        "src/app/(app)/p/**", "src/app/(app)/projects/[id]/pages/**",
        "src/components/pages/**", "src/components/palette/**", "src/components/shell/**",
        "src/components/projects/project-tabs.ts", "src/components/projects/ProjectTabs.test.tsx",
        "src/lib/pages/tree.ts", "src/lib/pages/tree.test.ts"
      ],
      "dependsOn": ["S0"],
      "planSection": "5.S3"
    },
    {
      "id": "S4",
      "title": "Authorization matrix rows (pages, wiki, files, search), masking leak cases, e2e m4-pages + page objects + fixtures, update older specs",
      "agent": "test-engineer",
      "owns": ["tests/authz/**", "e2e/**"],
      "dependsOn": ["S0"],
      "planSection": "5.S4"
    }
  ],
  "e2e": ["e2e/m4-pages.spec.ts"]
}
```

Notes on the DAG (changes vs. the brief's skeleton, with reasons):
- S1…S4 all depend only on S0 and run concurrently; their `owns` do not overlap. Files S0 creates as stubs
  (`authz.ts`, `storage.ts`, repo/service/action/route files, `EditorClient.tsx`, `src/lib/editor/content-text.ts`) are
  owned afterwards by exactly one Build stream.
- S0 additionally writes the pure `content-text.ts` walker, the zod content schema/sanitiser and the full Appendix B
  templates, because the backend (S1: save, charter, seed) and the editor (S2) both need them from the first minute; S2
  owns `src/lib/editor/**` afterwards and may extend the walker (tests stay green).
- `th.ts` namespace ownership during Build (Edit tool only, PLAN §2.3): S1 → `files`, `pages.errors`, M4 builders inside
  `audit`; S2 → `editor`; S3 → `pages` (except `pages.errors`), `palette`, `sidebar`, `shortcuts.items`; S4 → none.

---

## 5. Step-by-step

Conventions for every stream: test-first where a step lists tests; integration tests use `createWorld({ with: ['pages', 'files'] })`,
`asUser`, factories and the mocked `next/cache` / `next/headers` / `@/server/session` from `tests/setup/db-worker.ts`; strings in
tests come from `th` (never retyped Thai). Commands are pnpm-only (`pnpm exec …`, never `npx`); streams never run `next dev`,
`next build` or Playwright (PLAN §2.3).

### 5.S0 — Contracts (backend-engineer · package.json, schema, drizzle, env, contracts, schemas, i18n, templates, stubs, tests/helpers)

**S0.1 Preflight + dependencies (one batch).**
- Confirm M3 is ✅ and the tree is clean; `pnpm db:up`; read `src/server/{action,route,errors,audit}.ts`, `src/server/db/schema.ts`,
  `tests/helpers/{world,factories,outcome}.ts`, `tests/authz/{types,matrix.int.test}.ts`, `src/lib/{keys,shortcuts,query-keys,invalidate}.ts`
  and M2's `src/components/projects/project-tabs.ts` so every stub below matches the real M1–M3 signatures (adapt generics, keep names).
- Install exactly (PLAN §1.2; `cmdk` is first used here, X08):
  ```bash
  pnpm add --save-exact @blocknote/core@0.55.0 @blocknote/react@0.55.0 @blocknote/mantine@0.55.0 \
    @mantine/core@9.6.3 @mantine/hooks@9.6.3 file-type@22.1.1 cmdk@1.1.1
  ```
  If pnpm reports ignored build scripts for any of them, add an explicit `allowBuilds` entry (`false` unless the package is
  broken without it) to `pnpm-workspace.yaml` and report it as a Decision; commit any `minimumReleaseAgeExclude` lines pnpm adds.
  Never add `@blocknote/xl-*`, `@blocknote/server-util`, `@blocknote/code-block`, `@blocknote/shadcn`, `emoji-mart` (direct) or
  `react-hook-form`.
- `src/lib/editor/deps.test.ts` (unit) — reads `package.json`: no dependency key starts with `@blocknote/xl-`; the three
  `@blocknote/*` entries equal `"0.55.0"` exactly; `@mantine/core`/`@mantine/hooks` equal `"9.6.3"`; `file-type` = `"22.1.1"`.
- `src/app/layout.tsx`: verify `export const viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' }`
  exists (M0); add it if missing (otherwise BlockNote logs a console warning, r3 §2.3).
- Done-check: `pnpm install --frozen-lockfile` OK · `pnpm vitest run --project unit src/lib/editor/deps.test.ts`.

**S0.2 Env, uploads dir, test isolation.**
- `src/server/env.ts` (lazy zod schema from M0/M1): add
  ```ts
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  MAX_IMAGE_MB: z.coerce.number().int().min(1).max(100).default(10),
  MAX_ATTACHMENT_MB: z.coerce.number().int().min(1).max(200).default(25),
  ```
  and export `uploadLimits(): { imageBytes: number; attachmentBytes: number }` (`MB * 1024 * 1024`).
- `.env.example` already lists these (M0-D20); fix values/comments only if they differ (`UPLOAD_DIR=./uploads` for dev).
  `.gitignore` must contain `uploads/` and `.e2e-uploads/` (add the latter if missing).
- `src/server/env.test.ts`: `MAX_IMAGE_MB='12'` → `uploadLimits().imageBytes === 12582912`; `MAX_ATTACHMENT_MB='0'` → throws;
  unset → defaults 10/25 MB; the `.env.example ⊇ schema keys` test stays green.
- `tests/setup/db-worker.ts`: before any app import set
  `process.env.UPLOAD_DIR = path.join(os.tmpdir(), \`planner-uploads-<run>-w${process.env.VITEST_POOL_ID ?? '0'}\`)` (same per-run id as the test DBs, X55) and
  `rmSync(dir, { recursive: true, force: true })` once per worker, so file tests never touch `./uploads`.
- Done-check: `pnpm vitest run --project unit src/server/env.test.ts`.

**S0.3 Schema + migration (DM-09, X10).** In `src/server/db/schema.ts` (reuse the file's existing `orderKey`, `tstz`/`createdAt`/
`updatedAt` helpers, `user`, `projects`; keep its naming style):
```ts
export const pageSpace = pgEnum('page_space', ['WORKSPACE', 'PROJECT'])

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  space: pageSpace('space').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => pages.id, { onDelete: 'cascade' }),
  depth: smallint('depth').notNull().default(0),
  title: text('title').notNull().default(''),
  icon: text('icon'),
  coverFileId: uuid('cover_file_id').references((): AnyPgColumn => files.id, { onDelete: 'set null' }),
  content: jsonb('content').$type<unknown[]>().notNull().default([]),
  contentText: text('content_text').notNull().default(''),
  isCharter: boolean('is_charter').notNull().default(false),
  locked: boolean('locked').notNull().default(false),                 // FR-510 "protected" (WORKSPACE only, service-enforced)
  version: integer('version').notNull().default(1),                   // FR-543
  position: orderKey('position').notNull(),                           // text COLLATE "C" (X48)
  createdBy: text('created_by').notNull().references(() => user.id),
  updatedBy: text('updated_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('pages_depth_check', sql`${t.depth} between 0 and 9`),
  check('pages_space_project_check', sql`(${t.space} = 'PROJECT') = (${t.projectId} is not null)`),
  index('pages_tree_idx').on(t.space, t.projectId, t.parentId, t.position).where(sql`${t.deletedAt} is null`),
  uniqueIndex('one_charter_per_project').on(t.projectId).where(sql`${t.isCharter} and ${t.deletedAt} is null`),
  index('pages_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
  index('pages_content_trgm').using('gin', t.contentText.op('gin_trgm_ops')),
])

export const pageLocks = pgTable('page_locks', {                      // FR-540 "edit lease"
  pageId: uuid('page_id').primaryKey().references(() => pages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageKey: text('storage_key').notNull().unique(),
  originalName: text('original_name').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  kind: text('kind', { enum: ['IMAGE', 'ATTACHMENT'] }).notNull(),
  pageId: uuid('page_id').references((): AnyPgColumn => pages.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),   // null = wiki
  uploadedBy: text('uploaded_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('files_kind_check', sql`${t.kind} in ('IMAGE','ATTACHMENT')`),
  index('files_project_id_idx').on(t.projectId),                      // M4-D25
])
export type PageRow = typeof pages.$inferSelect
export type FileRow = typeof files.$inferSelect
export type PageLockRow = typeof pageLocks.$inferSelect
```
- `pnpm db:generate` → exactly one new journaled migration (`drizzle/00NN_<name>.sql`) with `CREATE TYPE "page_space"`, the three
  tables, the FKs (emitted after all tables — circular `pages`↔`files` is fine, r2 §12) and the five named indexes; inspect it, never
  edit it. No custom migration is needed (pg_trgm exists since M0's `0000_extensions`). `pnpm db:migrate`.
- Tests first — extend `src/server/db/schema.int.test.ts › describe('pages / files / page_locks')`:
  - `attcollation` of `pages.position` is `C` (same query as M3's tasks test);
  - WORKSPACE page with `project_id` → `23514`; PROJECT page without `project_id` → `23514`; `depth = 10` → `23514`; `depth = 9` ok;
  - a second live charter for the same project → `23505`; soft-delete the first (`deleted_at = now()`) → inserting a new charter ok;
  - `pg_indexes` contains `pages_tree_idx`, `one_charter_per_project`, `pages_title_trgm`, `pages_content_trgm`, `files_project_id_idx`;
  - defaults: `content = '[]'::jsonb`, `content_text = ''`, `version = 1`, `locked = false`;
  - `files.kind = 'OTHER'` → `23514`; deleting a file used as a cover sets `pages.cover_file_id` to null;
  - `delete from projects where id = P` removes its pages, files rows and page_locks rows (cascade);
  - two `page_locks` rows for one page → `23505`.
- Done-check: `pnpm db:generate` prints "No schema changes" on a second run · `pnpm vitest run --project integration src/server/db/schema.int.test.ts`.

**S0.4 Repo primitives (`src/server/repo/{pages,page-locks,files}.ts`; `tx: DbOrTx` first; S0 writes signatures with stub bodies, S1 implements them —
factories never use the repo, X59).**
```ts
// repo/pages.ts
export async function insertPage(tx: DbOrTx, v: typeof pages.$inferInsert): Promise<PageRow>
export async function getPage(tx: DbOrTx, id: string): Promise<PageRow | null>                 // includes soft-deleted rows
export async function getLivePageOrNotFound(tx: DbOrTx, id: string): Promise<PageRow>          // deleted / missing → NotFoundError
export async function lastLiveSibling(tx: DbOrTx, s: { space: PageSpace; projectId: string | null; parentId: string | null }): Promise<PageRow | null>
// repo/files.ts
export async function insertFile(tx: DbOrTx, v: typeof files.$inferInsert): Promise<FileRow>
export async function getFile(tx: DbOrTx, id: string): Promise<FileRow | null>
export async function listProjectFileKeys(tx: DbOrTx, projectId: string): Promise<string[]>
// repo/page-locks.ts
export async function getLock(tx: DbOrTx, pageId: string): Promise<(PageLockRow & { holderName: string }) | null>   // display name = coalesce(nullif(nickname,''), name)
```
Malformed ids never reach SQL: callers parse with `z.uuid()` first; `getLivePageOrNotFound` also returns `NotFoundError` for a
non-UUID string (guard with `z.uuid().safeParse`). Sibling filters use `isNull(...)` for null `projectId`/`parentId`, `eq` otherwise.
S1 adds the remaining repo functions in these files.

**S0.5 Errors + audit entities.**
- `src/server/errors.ts`: add `PayloadTooLargeError` (HTTP 413, code `TOO_LARGE`) and `UnsupportedMediaTypeError` (415,
  `UNSUPPORTED_TYPE`) as subclasses of M1's `AppError`, messages from `th.files.errors.*`. If M1's `route()` maps errors to
  statuses through a class list instead of `err.status`, add the two classes there (`src/server/route.ts`, S0 may edit it) and to
  `ErrorCode`. `tests/helpers/outcome.ts` maps 413 → `'413'`, 415 → `'415'` (extend `Outcome`).
- `src/server/audit.ts`: extend `AuditEntity` with `'page' | 'file'`.

**S0.6 `content_text` walker (DM-16, M4-D10).** Copy `plan/research/snippets/r3/harness/src/lib/contentText.ts` verbatim to
`src/lib/editor/content-text.ts` (exports `ContentTextOptions`, `extractContentText`, `collectMentionIds`; pure — no BlockNote,
no DOM). Add `remapSubpageIds(doc: unknown, map: ReadonlyMap<string, string>): unknown[]` (deep clone; replaces `props.pageId` of
`subpage` blocks found in the map; everything else untouched). Copy `snippets/r3/fixtures/complex-doc.json` to
`src/lib/editor/__fixtures__/complex-doc.json`.
- Tests first — `src/lib/editor/content-text.test.ts` (unit): port the 9 cases of `snippets/r3/nodecheck/contentText.test.ts` to
  Vitest unchanged (expected strings verbatim, e.g. case 1 → `"ตัวหนาและปกติ ดูที่ สเปก แล้วคุยกับ @Cindy และหน้า … คำพูด"` with the
  resolver, `"ตัว"+"หนา"` → `"ตัวหนา"`, 300 000 × `ก` → length 200 000, 100 000-deep children → no throw); plus
  an unknown, content-less block `{ type: 'futureLiveBlock', props: { view: 'board' } }` between two paragraphs → exactly the two paragraphs'
  text joined as the walker joins blocks, no `'board'`, no throw (M4-D30: M10's live blocks need no walker change; the name is deliberately not
  `taskView` so the G2 grep stays meaningful — M10 S0.9 adds its own `taskView`/`projectWorkload` case); plus
  `remapSubpageIds([{type:'subpage',props:{pageId:'a'}},{type:'paragraph',children:[{type:'subpage',props:{pageId:'b'}}]}], new Map([['a','x']]))`
  → first `pageId 'x'`, nested `'b'` unchanged, input not mutated.
- Done-check: `pnpm vitest run --project unit src/lib/editor/content-text.test.ts`.

**S0.7 Shared upload rules (`src/lib/files/upload-rules.ts`, isomorphic) + `src/lib/files/format-bytes.ts`.**
```ts
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export const ATTACHMENT_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'zip', 'svg'] as const
export interface UploadLimits { imageBytes: number; attachmentBytes: number }
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = { imageBytes: 10 * 1024 * 1024, attachmentBytes: 25 * 1024 * 1024 }
export const FILE_URL_RE = /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const fileUrl = (id: string): string => `/api/files/${id}`
export type ClientFileClass = { kind: 'IMAGE' | 'ATTACHMENT' } | { error: 'tooLargeImage' | 'tooLargeFile' | 'typeNotAllowed' }
export function precheckFile(f: { name: string; type: string; size: number }, limits: UploadLimits): ClientFileClass  // r3 classifyFile, error keys instead of strings
export function formatBytes(n: number): string     // 0 → '0 B', 1023 → '1023 B', 123_456 → '120.6 KB', 5_242_880 → '5.0 MB' (1 decimal, ASCII units)
```
Tests `src/lib/files/upload-rules.test.ts` (unit): png 9 MB → IMAGE; png 11 MB → `tooLargeImage`; `.svg` with `image/svg+xml` →
ATTACHMENT (never IMAGE); `.exe` → `typeNotAllowed`; `"สัญญา.PDF"` → ATTACHMENT (case-insensitive ext); `formatBytes` table above;
`FILE_URL_RE` accepts `/api/files/<v4>` and rejects `https://x/api/files/<v4>`, `/api/files/<v4>?x=1`, `/api/files/abc`.

**S0.8 Zod schemas (`src/lib/schemas/pages.ts`, `src/lib/schemas/page-content.ts`).**
```ts
// pages.ts — shared by actions, routes and client forms (Zod 4)
export const PAGE_TITLE_MAX = 200
export const pageSpaceSchema = z.enum(['WORKSPACE', 'PROJECT'])
export const pageTitleSchema = z.string().trim().max(PAGE_TITLE_MAX, { error: th.pages.errors.titleTooLong })
export const pageIdSchema = z.object({ pageId: z.uuid() })
export const createPageSchema = z.object({
  space: pageSpaceSchema, projectId: z.uuid().nullable(), parentId: z.uuid().nullable(),
  afterId: z.uuid().nullable().optional(),            // undefined = append last; null = first
}).refine((v) => (v.space === 'PROJECT') === (v.projectId !== null), { error: th.pages.errors.crossSpace, path: ['projectId'] })
export const renamePageSchema = z.object({ pageId: z.uuid(), title: pageTitleSchema })
export const setPageIconSchema = z.object({ pageId: z.uuid(), icon: z.enum(PAGE_ICONS).nullable() })
export const setPageCoverSchema = z.object({ pageId: z.uuid(), fileId: z.uuid().nullable() })
export const movePageSchema = z.object({ pageId: z.uuid(), parentId: z.uuid().nullable(), afterId: z.uuid().nullable() })
export const restorePageBatchSchema = z.object({ batch: z.uuid() })
export const setPageProtectedSchema = z.object({ pageId: z.uuid(), protected: z.boolean() })
export const templateIdSchema = z.enum(['charter', 'meeting', 'sop'])
export const applyTemplateSchema = z.object({ pageId: z.uuid(), baseVersion: z.number().int().min(1), template: templateIdSchema })
export const savePageContentSchema = z.object({ pageId: z.uuid(), baseVersion: z.number().int().min(1), content: pageContentSchema })
export const keepaliveSaveBodySchema = savePageContentSchema.omit({ pageId: true })
export const treeQuerySchema = z.object({ space: pageSpaceSchema, projectId: z.uuid().optional(), parentId: z.uuid().optional() })
  .refine((v) => (v.space === 'PROJECT') === (v.projectId !== undefined), { path: ['projectId'] })
export const titlesQuerySchema = z.object({ ids: z.string().max(3800).transform((s) => s.split(',').filter(Boolean))
  .pipe(z.array(z.uuid()).min(1).max(100)) })
export const leaseQuerySchema = z.object({ takeover: z.literal('1').optional() })
export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100), titleOnly: z.literal('1').optional() })
export const uploadFieldsSchema = z.object({ pageId: z.uuid(), purpose: z.enum(['content', 'cover']).default('content') })
```
`page-content.ts` (isomorphic; M4-D8/D9; r3 §13 outline made lenient for partial blocks):
```ts
export const PAGE_CONTENT_MAX_BYTES = 2 * 1024 * 1024
export const PAGE_MAX_BLOCKS = 5000
export const PAGE_MAX_NESTING = 20
export const BLOCK_TYPES = ['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem',
  'quote', 'codeBlock', 'divider', 'table', 'image', 'file', 'subpage'] as const
export function isSafeHref(href: string): boolean   // /^(https?:|mailto:|tel:)/i or (startsWith('/') && !startsWith('//')); trims; rejects control chars
export type PrecheckResult = { ok: true; blocks: number } | { ok: false; reason: 'notArray' | 'tooLarge' | 'tooDeep' | 'tooManyBlocks' }
export function precheckContent(raw: unknown): PrecheckResult   // ITERATIVE walk (explicit stack), byte size via new TextEncoder().encode(JSON.stringify(raw)).length
const Styles = z.record(z.string().max(40), z.union([z.boolean(), z.string().max(40)]))
const Text = z.object({ type: z.literal('text'), text: z.string().max(100_000), styles: Styles.optional() })
const Link = z.object({ type: z.literal('link'), href: z.string().max(2048).refine(isSafeHref), content: z.union([z.string().max(100_000), z.array(Text).max(500)]) })
const Mention = z.object({ type: z.literal('mention'), props: z.object({ kind: z.enum(['user', 'page']), id: z.string().min(1).max(64) }) })
const Inline = z.union([z.string().max(100_000), z.discriminatedUnion('type', [Text, Link, Mention])])
const InlineContent = z.union([z.string().max(100_000), z.array(Inline).max(2000)])
const Prop = z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()])
const Props = z.record(z.string().max(40), Prop)
const Cell = z.union([InlineContent, z.looseObject({ type: z.literal('tableCell'), props: Props.optional(), content: InlineContent.optional() })])
const TableContent = z.looseObject({ type: z.literal('tableContent'), columnWidths: z.array(z.number().finite().nullable()).max(100).optional(),
  headerRows: z.number().int().min(0).max(1).optional(), headerCols: z.number().int().min(0).max(1).optional(),
  rows: z.array(z.object({ cells: z.array(Cell).max(100) })).max(1000) })
export interface BlockInput { id?: string; type: (typeof BLOCK_TYPES)[number]; props?: Record<string, string | number | boolean | null>
  content?: unknown; children?: BlockInput[] }
export const blockSchema: z.ZodType<BlockInput> = z.lazy(() => z.object({
  id: z.string().max(64).optional(), type: z.enum(BLOCK_TYPES), props: Props.optional(),
  content: z.union([InlineContent, TableContent]).optional(), children: z.array(blockSchema).max(1000).optional(),
}).superRefine(checkBlockProps))
export function checkBlockProps(block: BlockInput, ctx: z.RefinementCtx): void   // exported: M10 appends its live-block rules here (M4-D37)
// checkBlockProps: heading.level ∈ {1,2,3}; subpage.pageId ∈ '' | uuid; file.size integer ≥ 0; image/file url is a string;
// table content only on 'table' and tableContent only there; codeBlock content is a string or Text[] (BlockNote "plain").
// One `if (block.type === …)` branch per rule so M10 can add a branch without touching M4's.
// Object shapes: block / inline objects use z.object (unknown keys stripped); TableContent and the tableCell object use z.looseObject
// so BlockNote table internals survive a save. Parsed output (not the raw input) is what the service stores.
export const pageContentSchema = z.unknown().superRefine((v, ctx) => {          // pre-check first (no deep recursion in zod)
  const p = precheckContent(v)
  if (!p.ok) ctx.addIssue({ code: 'custom', continue: false,             // abort: the pipe never walks oversized input
    message: p.reason === 'tooLarge' ? th.pages.errors.contentTooLarge : th.pages.errors.contentInvalid })
}).pipe(z.array(blockSchema).max(PAGE_MAX_BLOCKS))
export type PageContent = BlockInput[]
export function sanitizeContent(doc: PageContent): PageContent
// returns a deep copy where every image/file block whose props.url is neither '' nor FILE_URL_RE becomes
// { type: 'paragraph', content: isHttp(url) ? [{ type: 'link', href: url, content: name || th.editor.pasteImageLinkFallback }] : (name || '') }
// (children preserved); nothing else changes.
```
Tests first — `src/lib/schemas/page-content.test.ts` (unit):
- `complex-doc.json` parses and `sanitizeContent` returns it deep-equal (all its urls are local or empty);
- partial blocks (the charter template from S0.12) parse;
- `{ type: 'nope' }` → fails; `heading level 7` → fails; `subpage pageId 5` → fails; mention `kind 'team'` → fails;
- link `javascript:alert(1)` → fails; ` JaVaScRiPt:x` → fails; `//evil.com` → fails; `/p/<uuid>` ok; `https://example.com` ok; `mailto:a@b.co` ok;
- image `url: 'https://example.com/cat.png', name: 'cat'` → sanitized to a paragraph with a link `https://example.com/cat.png` text `cat`;
  image `url: 'data:image/png;base64,AAAA'` → paragraph text `''`; image `/api/files/<v4>` untouched;
- 2 MB + 1 byte of text → issue message `th.pages.errors.contentTooLarge`; nesting 21 → `contentInvalid`; 5 001 blocks → fails;
  a 100 000-deep `children` chain → fails fast without a stack overflow (pre-check is iterative).
`src/lib/schemas/pages.test.ts`: `createPageSchema` rejects `{ space:'PROJECT', projectId:null }` and `{ space:'WORKSPACE', projectId:<uuid> }`;
`titlesQuerySchema` parses `'a,b'` of two v4 ids, rejects 101 ids and non-UUIDs; `pageTitleSchema` trims `'  x '` → `'x'`, rejects 201 chars.
Done-check: `pnpm vitest run --project unit src/lib/schemas`.

**S0.9 i18n (`src/i18n/th.ts`, Edit tool only).**
- BlockNote dictionary: copy the `blocknote` object of `plan/research/snippets/r3/harness/src/lib/th-editor.ts` verbatim into
  `th.ts` as a **separate top-level** `const blocknote = { … } satisfies Dictionary` (type-only `import type { Dictionary } from '@blocknote/core'`),
  then reference it as `th.editor.blocknote`. It must not sit inside the outer `as const` literal (an `as const` would make the
  `aliases` arrays readonly and break `satisfies Dictionary`). User-visible highlights (already in the snippet): slash titles
  `หัวข้อ 1/2/3, ข้อความอ้างอิง, รายการพับได้, ลำดับเลข, รายการจุด, เช็กลิสต์, ย่อหน้า, โค้ด, เส้นคั่น, ตาราง, รูปภาพ, ไฟล์แนบ, อีโมจิ`;
  groups `หัวข้อ, บล็อกพื้นฐาน, ขั้นสูง, สื่อ, อื่น ๆ`; `placeholders.default` "พิมพ์ข้อความ หรือพิมพ์ '/' เพื่อเลือกคำสั่ง";
  `side_menu.add_block_label` "เพิ่มบล็อก"; `table_handle.add_right_menuitem` "เพิ่มคอลัมน์ทางขวา"; `file_panel.upload.title` "อัปโหลด".
- New namespaces and keys (exact strings):
```ts
pages: {
  untitled: 'ไม่มีชื่อ',
  titleLabel: 'ชื่อหน้า',
  newPage: 'หน้าใหม่',
  addRoot: 'เพิ่มหน้า',
  addChild: (title: string) => `เพิ่มหน้าย่อยใน ${title}`,
  menu: (title: string) => `ตัวเลือกของ ${title}`,
  duplicate: 'ทำสำเนา',
  delete: 'ลบหน้า',
  protect: 'ล็อกหน้า',
  unprotect: 'ปลดล็อกหน้า',
  protectedIcon: 'หน้านี้ถูกล็อก',
  protectedBanner: 'หน้านี้ถูกล็อกโดยผู้จัดการ — อ่านได้อย่างเดียว',
  archivedBanner: 'โปรเจคนี้ถูก archive แล้ว — อ่านอย่างเดียว',
  breadcrumbLabel: 'ตำแหน่งของหน้า',
  wikiRoot: 'Wiki ทีม',
  charterTitle: 'Project Charter',
  copyTitle: (title: string) => `${title || 'ไม่มีชื่อ'} (สำเนา)`,
  meetingTitle: (date: string) => `บันทึกการประชุม — ${date}`,
  icon: { button: 'เลือกไอคอน', dialogTitle: 'ไอคอนของหน้า', remove: 'ลบไอคอน' },
  cover: { add: 'เพิ่มรูปปก', change: 'เปลี่ยนรูปปก', remove: 'ลบรูปปก', alt: 'รูปปกของหน้า', uploading: 'กำลังอัปโหลดรูปปก…' },
  templates: { heading: 'เริ่มจาก template', blank: 'ว่าง', charter: 'Project Charter', meeting: 'บันทึกการประชุม', sop: 'คู่มือ/SOP' },
  tree: {
    wikiLabel: 'หน้าใน Wiki ทีม',
    projectLabel: (project: string) => `หน้าเอกสารของ ${project}`,
    expand: (title: string) => `ขยาย ${title}`,
    collapse: (title: string) => `ยุบ ${title}`,
    dragHandle: 'ลากเพื่อย้ายหน้า',
    dropInvalid: 'วางตรงนี้ไม่ได้ (ซ้อนได้สูงสุด 10 ชั้น)',
    empty: 'ยังไม่มีหน้า',
    loadError: 'โหลดรายการหน้าไม่สำเร็จ',
    retry: 'ลองใหม่',
  },
  projectTab: { heading: 'เอกสารของโปรเจค', newPage: 'สร้างหน้าใหม่', empty: 'ยังไม่มีหน้าเอกสาร' },
  toasts: {
    deleted: (title: string, children: number) =>
      children > 0 ? `ลบ "${title || 'ไม่มีชื่อ'}" และหน้าย่อย ${children} หน้าแล้ว` : `ลบ "${title || 'ไม่มีชื่อ'}" แล้ว`,
    duplicated: (title: string) => `ทำสำเนา "${title || 'ไม่มีชื่อ'}" แล้ว`,
    restored: 'กู้คืนหน้าแล้ว',
    protected: 'ล็อกหน้าแล้ว',
    unprotected: 'ปลดล็อกหน้าแล้ว',
    moveFailed: 'ย้ายหน้าไม่สำเร็จ',
    createFailed: 'สร้างหน้าไม่สำเร็จ',
  },
  errors: {
    maxDepth: 'ซ้อนได้สูงสุด 10 ชั้น',
    crossSpace: 'ย้ายหน้าข้าม Wiki ทีมหรือข้ามโปรเจคไม่ได้',
    cycle: 'ย้ายหน้าไปไว้ใต้หน้าย่อยของตัวเองไม่ได้',
    charterNotDeletable: 'ลบ Project Charter ไม่ได้',
    charterRootOnly: 'Project Charter ต้องอยู่ระดับบนสุดของโปรเจค',
    protectedReadOnly: 'หน้านี้ถูกล็อก แก้ไขไม่ได้',
    subtreeProtected: 'มีหน้าย่อยที่ถูกล็อก จึงลบหรือย้ายไม่ได้',
    protectWikiOnly: 'ล็อกได้เฉพาะหน้าใน Wiki ทีม',
    treeChanged: 'รายการหน้าเปลี่ยนไปแล้ว — โหลดใหม่แล้ว',
    titleTooLong: 'ชื่อหน้ายาวเกิน 200 ตัวอักษร',
    contentTooLarge: 'เนื้อหายาวเกินไป (สูงสุด 2 MB)',
    contentInvalid: 'เนื้อหาของหน้าไม่ถูกต้อง',
    coverNotImage: 'รูปปกต้องเป็นรูปภาพ',
    restore: {
      failed: (reason: string) => `กู้คืนไม่ได้ เพราะ${reason}`,
      expired: 'เกิน 30 วันแล้ว',
      parentDeleted: 'หน้าแม่ถูกลบแล้ว',
      tooDeep: 'จะซ้อนลึกเกิน 10 ชั้น',
    },
  },
  notFound: { title: 'ไม่พบหน้า', body: 'หน้านี้ไม่มีอยู่ ถูกลบแล้ว หรือคุณไม่มีสิทธิ์เข้าถึง', back: 'กลับหน้าหลัก' },
},

editor: {
  blocknote,                                                   // the satisfies-Dictionary const above
  label: 'เนื้อหาของหน้า',
  slash: {
    subpage: { title: 'หน้า', subtext: 'สร้างหน้าย่อยและแทรกลิงก์ไว้ตรงนี้', aliases: ['page', 'subpage', 'หน้าย่อย'], group: 'ขั้นสูง' },
  },
  subpage: { untitled: 'ไม่มีชื่อ', deleted: 'หน้านี้ถูกลบแล้ว', noAccess: 'หน้าที่คุณไม่มีสิทธิ์เข้าถึง', creating: 'กำลังสร้างหน้า…', loading: 'กำลังโหลด…' },
  mention: { unknownUser: 'ไม่พบผู้ใช้', deactivated: '(ปิดใช้งาน)', unknownPage: 'ไม่พบหน้า', noAccess: 'หน้าที่คุณไม่มีสิทธิ์เข้าถึง',
    deletedPage: 'หน้านี้ถูกลบแล้ว', groupPeople: 'คน', groupPages: 'หน้า' },
  attachment: { uploading: 'กำลังอัปโหลด…', download: (name: string) => `ดาวน์โหลด ${name}` },
  upload: {
    tooLargeImage: (mb: number) => `รูปต้องไม่เกิน ${mb} MB`,
    tooLargeFile: (mb: number) => `ไฟล์ต้องไม่เกิน ${mb} MB`,
    typeNotAllowed: 'ไม่รองรับไฟล์ชนิดนี้',
    failed: 'อัปโหลดไม่สำเร็จ',
  },
  pasteImageLinkFallback: 'รูปภาพ (ลิงก์ภายนอก)',
  saveStatus: { saving: 'กำลังบันทึก…', saved: 'บันทึกแล้ว', error: 'บันทึกไม่สำเร็จ · ลองใหม่' },
  lease: {
    heldBy: (name: string) => `${name} กำลังแก้หน้านี้`,
    readOnlyHint: 'คุณเปิดหน้านี้แบบอ่านอย่างเดียว',
    takeover: 'แก้ต่อจากนี้',
    takenOverBy: (name: string) => `${name} แก้ต่อจากคุณแล้ว — บันทึกของคุณเรียบร้อย หน้านี้เป็นแบบอ่านอย่างเดียว`,
    lost: 'การเชื่อมต่อหลุดนานเกินไป',
    reacquire: 'แก้ต่อ',
  },
  conflict: { banner: 'มีการแก้ไขใหม่กว่า', reload: 'โหลดใหม่' },
  deletedBanner: 'หน้านี้ถูกลบแล้ว',
  forbiddenBanner: 'คุณไม่มีสิทธิ์แก้หน้านี้แล้ว',
  crashed: { title: 'แสดงเนื้อหาหน้านี้ไม่ได้', body: 'เนื้อหาบางส่วนอาจเสียหาย ลองโหลดใหม่อีกครั้ง', reload: 'โหลดใหม่' },
},

files: {
  errors: {
    tooLarge: 'ไฟล์ใหญ่เกินกำหนด',
    unsupported: 'ไม่รองรับไฟล์ชนิดนี้',
    lengthMismatch: 'ได้รับไฟล์ไม่ครบ ลองใหม่อีกครั้ง',
    missingFile: 'ไม่พบไฟล์ที่อัปโหลด',
  },
},

palette: {
  dialogLabel: 'ค้นหา',
  open: 'ค้นหา…',
  shortcut: '⌘K',
  placeholder: 'ค้นหาหน้าเอกสาร…',
  hint: 'พิมพ์เพื่อค้นหาชื่อหรือเนื้อหาของหน้าเอกสาร',
  loading: 'กำลังค้นหา…',
  empty: 'ไม่พบผลลัพธ์',
  groups: { pages: 'หน้าเอกสาร' },
  wiki: 'Wiki ทีม',
  matchedInContent: 'พบในเนื้อหา',
},
```
- Additions to existing namespaces: `projects.tabs.pages: 'เอกสาร'`; `sidebar.wikiHeading: 'Wiki ทีม'`,
  `sidebar.newWikiPage: 'สร้างหน้าใน Wiki ทีม'`, `sidebar.newProjectPage: (project: string) => \`สร้างหน้าใน ${project}\``;
  `shortcuts.items.palette: 'เปิดช่องค้นหา'`, `shortcuts.keys.K: 'K'`;
  `audit`: `pageCreated: (title) => \`สร้างหน้า "${title || 'ไม่มีชื่อ'}"\``, `pageRenamed: (from, to) => \`เปลี่ยนชื่อหน้า "${from}" เป็น "${to}"\``,
  `pageIconChanged: (title) => …'เปลี่ยนไอคอนหน้า …'`, `pageCoverChanged: (title) => 'เปลี่ยนรูปปกหน้า …'`, `pageMoved: (title) => 'ย้ายหน้า …'`,
  `pageDuplicated: (title, n) => \`ทำสำเนาหน้า "${title}" (${n} หน้า)\``, `pageDeleted: (title, n) => \`ลบหน้า "${title}" (${n} หน้า)\``,
  `pageRestored: (title, n) => \`กู้คืนหน้า "${title}" (${n} หน้า)\``, `pageProtected: (title) => 'ล็อกหน้า …'`,
  `pageUnprotected: (title) => 'ปลดล็อกหน้า …'`, `pageSaved: (title) => \`บันทึกหน้า "${title || 'ไม่มีชื่อ'}"\``,
  `pageTemplateApplied: (title) => 'ใช้ template กับหน้า …'`, `charterCreated: (project) => \`สร้าง Project Charter ของ "${project}"\``,
  `fileUploaded: (name) => \`อัปโหลดไฟล์ "${name}"\`` (each title quoted the same way as `pageCreated`).
- Done-check: `pnpm typecheck` (the `satisfies Dictionary` must pass) · `pnpm lint src/i18n`.

**S0.10 DTOs (`src/lib/contracts/pages.ts`, `files.ts`, `search.ts`).**
```ts
export type PageSpace = 'WORKSPACE' | 'PROJECT'
export interface PageTreeNode { id: string; parentId: string | null; title: string; icon: string | null; depth: number
  position: string; hasChildren: boolean; locked: boolean; effectiveProtected: boolean; isCharter: boolean }
export interface PageTreeResponse { nodes: PageTreeNode[]; canCreate: boolean }      // canCreate = may add children here / at root
export interface PageCrumb { id: string; title: string; icon: string | null }
export interface PageCan { edit: boolean; protect: boolean; delete: boolean; createChild: boolean; move: boolean; duplicate: boolean }
export interface PageDTO { id: string; space: PageSpace; projectId: string | null; projectName: string | null; projectArchived: boolean
  parentId: string | null; depth: number; title: string; icon: string | null; cover: { fileId: string; url: string } | null
  isCharter: boolean; locked: boolean; effectiveProtected: boolean; version: number; content: unknown[]; isBlank: boolean
  updatedAt: string; updatedBy: { id: string; name: string } }
export interface PageView { page: PageDTO; breadcrumb: PageCrumb[]; can: PageCan; uploadLimits: UploadLimits }
export type PageTitleItem =
  | { id: string; visible: true; deleted: false; title: string; icon: string | null }
  | { id: string; visible: true; deleted: true }
  | { id: string; visible: false }
export interface PageTitlesResponse { items: PageTitleItem[] }
export interface LeaseHolder { userId: string; name: string }
export interface LeaseState { mine: boolean; holder: LeaseHolder | null; expiresAt: string | null; version: number }
export interface SavePageResult { version: number; lease: LeaseState }
export interface CreatePageResult { page: PageTreeNode; space: PageSpace; projectId: string | null; href: string }
export interface MovePageResult { page: PageTreeNode; space: PageSpace; projectId: string | null; fromParentId: string | null }
export interface DuplicatePageResult { root: PageTreeNode; count: number; space: PageSpace; projectId: string | null }
export interface DeletePageResult { batch: string; count: number; title: string; space: PageSpace; projectId: string | null; parentId: string | null }
export interface RestorePageResult { restoredIds: string[]; space: PageSpace; projectId: string | null }
export interface ApplyTemplateResult { version: number; title: string; icon: string | null }
export interface PageEditorProps { pageId: string; space: PageSpace; projectId: string | null; depth: number
  initialContent: unknown[]; version: number; canEdit: boolean; uploadLimits: UploadLimits
  reloadToken: number }                       // the page shell increments it after applyTemplate → the editor re-fetches and re-creates
// files.ts
export interface UploadedFileDTO { id: string; url: string; name: string; size: number; kind: 'IMAGE' | 'ATTACHMENT'; mime: string }
// search.ts — M10 adds projects/tasks/people/clients keys
export interface PageSearchHit { kind: 'page'; id: string; title: string; icon: string | null; href: string; subtitle: string; matchedIn: 'title' | 'content' }
export interface SearchResponse { pages: PageSearchHit[] }
export type TemplateBlock = BlockInput                                    // re-export from schemas/page-content
```

**S0.11 Query keys, invalidation, hotkeys, shortcut registry.**
- `src/lib/query-keys.ts` (PLAN §3.5's page keys; `pagesTreeScope` is new and `search` gains a `scope` argument — M4-D36; if M0 already
  declared `search(q)`, change it in place, there are no callers yet):
  ```ts
  pagesTree: (space: PageSpace, projectId: string | null, parentId: string | null) => ['pages', 'tree', space, projectId, parentId] as const,
  pagesTreeScope: (space: PageSpace, projectId: string | null) => ['pages', 'tree', space, projectId] as const,   // prefix
  page: (pageId: string) => ['pages', 'one', pageId] as const,
  pageLease: (pageId: string) => ['pages', 'lease', pageId] as const,
  pageTitles: (ids: readonly string[]) => ['pages', 'titles', [...ids].sort()] as const,
  search: (q: string, scope: 'all' | 'title' = 'all') => ['search', q, scope] as const,
  ```
- `src/lib/invalidate.ts`: `invalidatePages(qc, scope?: { space: PageSpace; projectId: string | null })` → tree scope (or all
  `['pages','tree']`), `['pages','titles']` and the whole **`['search']` prefix** (not just `qk.search(…)`, so M10's `qk.searchIndex()` = `['search','index']` is covered; M10 has no `invalidateSearchIndex`, X82); `invalidatePage(qc, pageId)` → `qk.page(pageId)` + titles. Test
  (`invalidate.test.ts`): after `invalidatePages(qc, { space: 'WORKSPACE', projectId: null })` the keys
  `['pages','tree','WORKSPACE',null,null]`, `['pages','titles',['x']]`, `['search','a','all']` and `['search','index']` are invalidated and
  `['pages','tree','PROJECT','p',null]` and `['sidebar']` are not.
- `src/lib/keys.ts`: `HOTKEYS.palette = { code: 'KeyK', key: 'k', mod: true }`. Tests (`keys.test.ts`): `{code:'KeyK',key:'k',ctrlKey}` → true;
  `{code:'KeyK',key:'า',metaKey}` (Thai Kedmanee) → true; no modifier → false; `+shiftKey` → false.
- `src/lib/shortcuts.ts`: add `'K'` to `KeyToken`; append `{ id: 'palette.open', scope: 'global', combos: [['Mod', 'K']], label: th.shortcuts.items.palette }`.

**S0.12 Templates (`src/i18n/templates.th.ts`, TPL-B1…B3, M4-D6/D7/D8).**
```ts
import type { TemplateBlock } from '@/lib/contracts/pages'
export type TemplateId = 'charter' | 'meeting' | 'sop'
export interface TemplateResult { title: string; icon: string; content: TemplateBlock[] }
export interface CharterFill { clientName?: string | null; leadName?: string | null; certaintyLabel?: string | null }
export function charterTemplate(fill?: CharterFill): TemplateResult     // title 'Project Charter', icon '📋'
export function meetingTemplate(dateLabel: string): TemplateResult      // title th.pages.meetingTitle(dateLabel), icon '📝'
export function sopTemplate(): TemplateResult                            // title '', icon '📘'
export function buildTemplate(id: TemplateId, ctx: { dateLabel: string }): TemplateResult   // charter without fill
/** The one table-block builder every template uses (C68). Exported so M12's demo content (`scripts/lib/demo-content.ts`) can
 *  import it instead of re-implementing the shape (M12's demo content imports it). */
export function tableBlock(rows: readonly (readonly string[])[]): TemplateBlock
  // { type: 'table', content: { type: 'tableContent', headerRows: 1, rows: rows.map((cells) => ({ cells: [...cells] })) } } — cells are plain strings
```
Content = Appendix B as partial blocks (`h2 = { type: 'heading', props: { level: 2 }, content: '…' }`; header-only tables get one empty row;
tables use `headerRows: 1` and are all built with `tableBlock(rows)`):
- **Charter:** quote "สรุปโปรเจคในหนึ่งย่อหน้า: ทำอะไร ให้ใคร เพื่ออะไร" · h2 "ข้อมูลโปรเจค" · table `[["หัวข้อ","รายละเอียด"],["ลูกค้า",client ?? ""],
  ["Project Lead",lead ?? ""],["ช่วงเวลา",""],["ความแน่นอน",certainty ?? ""]]` · h2 "ที่มาและปัญหา" · paragraph · h2 "วัตถุประสงค์" ·
  checkListItem "…" · h2 "ขอบเขตงาน" · h3 "อยู่ในขอบเขต" · paragraph · h3 "ไม่อยู่ในขอบเขต" · paragraph · h2 "ผลลัพธ์ที่ส่งมอบ" ·
  table `[["ส่งมอบ","รายละเอียด","กำหนดส่ง"],["","",""]]` · h2 "Milestones สำคัญ" · paragraph "(ดูและแก้ที่แท็บภาพรวม — Phase 2 จะฝังรายการสดไว้ตรงนี้)" ·
  h2 "ทีมงานและบทบาท" · table `[["ชื่อ","บทบาทในโปรเจค","ความรับผิดชอบ"],["","",""]]` · h2 "ผู้มีส่วนได้ส่วนเสีย" ·
  table `[["ชื่อ / หน่วยงาน","บทบาท","ความคาดหวัง","ช่องทางติดต่อ"],["","","",""]]` · h2 "ความเสี่ยงและข้อสมมติฐาน" ·
  table `[["ความเสี่ยง","โอกาส","ผลกระทบ","แนวทางรับมือ"],["","","",""]]` · h2 "เกณฑ์ความสำเร็จ" · checkListItem "…" · h2 "การสื่อสาร" ·
  bulletListItem "ประชุมประจำ:" · bulletListItem "ช่องทางหลัก:".
- **Meeting:** table `[["วันที่","ผู้เข้าร่วม","ผู้จด"],[dateLabel,"",""]]` · h2 "วาระ" · numberedListItem (empty) · h2 "สรุปการหารือ" · paragraph ·
  h2 "สิ่งที่ตัดสินใจ" · bulletListItem (empty) · h2 "Action items" · checkListItem "… — @ผู้รับผิดชอบ — กำหนด".
- **SOP:** quote "ใช้เมื่อไหร่ · ใครเป็นเจ้าของขั้นตอนนี้ · แก้ไขล่าสุดเมื่อ" · h2 "ก่อนเริ่ม" · checkListItem "สิ่งที่ต้องเตรียม" · h2 "ขั้นตอน" ·
  numberedListItem (empty) · h2 "ข้อควรระวัง" · paragraph · h2 "คำถามที่พบบ่อย" · paragraph.

Tests first — `src/i18n/templates.test.ts` (unit): every template's `content` passes `pageContentSchema`; `extractContentText(charterTemplate({
clientName: 'Coral', leadName: 'Cindy', certaintyLabel: th.projects.certainty.CONFIRMED }).content)` contains `'ลูกค้า Coral'`, `'Project Lead Cindy'`,
`'ความแน่นอน แน่นอน'`; charter has 5 tables and its first table has 5 rows; `meetingTemplate('30 ก.ย. 2569').title === th.pages.meetingTitle('30 ก.ย. 2569')`;
`sopTemplate().title === ''`; `tableBlock([['ก','ข'],['','']])` deep-equals `{ type: 'table', content: { type: 'tableContent', headerRows: 1, rows: [{ cells: ['ก','ข'] }, { cells: ['',''] }] } }` and passes `pageContentSchema`; the charter's "ผู้มีส่วนได้ส่วนเสีย" table equals `tableBlock([['ชื่อ / หน่วยงาน','บทบาท','ความคาดหวัง','ช่องทางติดต่อ'],['','','','']])` (the same pair M12's parity test uses); no template contains a `subpage` or `mention`; the charter's h2 texts **contain** (`expect.arrayContaining`,
not an exact list) `ข้อมูลโปรเจค … การสื่อสาร` in B.1 order. M4-only case, labelled `// M4-only (X78): M10 S0.8 replaces this case`:
no charter heading equals `'งานและภาระของทีม'` (literal allowed: the file is under `src/i18n/`) and every block type is in `BLOCK_TYPES`. (S2.3 adds the headless-BlockNote check.)

**S0.13 Page helpers (`src/lib/pages/icons.ts`, `blank.ts`).**
- `PAGE_ICONS`: a readonly tuple of exactly 60 emoji (must include `📋 📝 📘 📄 📁 📌 ✅ 🔒 💡 📊 📅 🗂️`; no duplicates; each one grapheme
  per `Intl.Segmenter`). Test `icons.test.ts`: length 60, unique, includes the template icons, every entry is one grapheme.
- `isBlankPage(p: { title: string; content: unknown }): boolean` — title `''` and content is `[]`, or every block is a `paragraph` with no
  text content and no children. Test: `[]` → true; `[{type:'paragraph',content:[]}]` → true; `[{type:'paragraph',content:'x'}]` → false;
  title `'a'` → false; `[{type:'table',…}]` → false.

**S0.14 Server stubs (exact signatures; bodies `throw new Error('not implemented: M4 S1')`).**
```ts
// src/server/authz.ts (signatures + doc comments; S1 writes bodies)
export type PageNeed = 'view' | 'edit' | 'protect'
export interface PageAccess { page: PageRow; role: 'MANAGER' | 'LEAD' | 'MEMBER' | 'WIKI'; archived: boolean; effectiveProtected: boolean; isManager: boolean }
export async function requirePage(tx: DbOrTx, user: SessionUser, pageId: string, need: PageNeed): Promise<PageAccess>
export async function requirePageCreate(tx: DbOrTx, user: SessionUser, target: { space: PageSpace; projectId: string | null; parentId: string | null }): Promise<{ parent: PageAccess | null }>
export async function assertSecondPage(tx: DbOrTx, user: SessionUser, otherId: string, scope: { space: PageSpace; projectId: string | null }): Promise<PageAccess>  // M4-D31: view (404) → same scope (400) → edit (403)
export async function requireSubtreeUnprotected(tx: DbOrTx, user: SessionUser, pageId: string): Promise<void>
export async function requireFile(tx: DbOrTx, user: SessionUser, fileId: string): Promise<{ file: FileRow }>
export async function effectiveProtection(tx: DbOrTx, pageId: string): Promise<boolean>

// src/server/storage.ts — no `import 'server-only'` (X56: importable from tsx scripts and Playwright resetDb)
export interface Storage { put(key: string, bytes: Uint8Array): Promise<void>
  stream(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>; remove(key: string): Promise<void> }
export function localDiskStorage(root: string): Storage
export function getStorage(): Storage                               // localDiskStorage(env().UPLOAD_DIR), memoised per root value
export function newStorageKey(today: ISODate, ext: string): string  // `${yyyy}/${mm}/${crypto.randomUUID()}.${ext}` (server-side randomUUID is fine)
export const STORAGE_KEY_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/

// src/server/services/page-tree.ts
export async function listTree(tx: DbOrTx, user: SessionUser, q: z.output<typeof treeQuerySchema>): Promise<PageTreeResponse>
export async function getBreadcrumb(tx: DbOrTx, pageId: string): Promise<PageCrumb[]>
export async function lockPageScope(tx: Tx, s: { space: PageSpace; projectId: string | null; parentId: string | null }): Promise<void>
export async function keyAt(tx: Tx, a: { space: PageSpace; projectId: string | null; parentId: string | null; afterId: string | null | undefined; excludeId?: string }): Promise<string>
export async function subtreeRows(tx: DbOrTx, rootId: string): Promise<Pick<PageRow, 'id' | 'parentId' | 'depth' | 'position' | 'locked' | 'isCharter' | 'title'>[]>
export async function createPage(tx: Tx, user: SessionUser, input: z.output<typeof createPageSchema>): Promise<PageRow>
export async function movePage(tx: Tx, user: SessionUser, input: z.output<typeof movePageSchema>): Promise<{ page: PageRow; fromParentId: string | null }>
export async function duplicatePage(tx: Tx, user: SessionUser, pageId: string): Promise<{ root: PageRow; count: number }>
export async function softDeleteSubtree(tx: Tx, user: SessionUser, pageId: string): Promise<{ batch: string; root: PageRow; ids: string[] }>
export async function restorePageBatch(tx: Tx, user: SessionUser, batch: string): Promise<{ roots: PageRow[]; ids: string[] }>
// src/server/services/pages.ts
export async function getPageView(tx: DbOrTx, user: SessionUser, pageId: string): Promise<PageView>
export async function renamePage(tx: Tx, user: SessionUser, a: PageAccess, title: string): Promise<{ before: string; after: string }>
export async function setPageIcon(tx: Tx, user: SessionUser, a: PageAccess, icon: string | null): Promise<void>
export async function setPageCover(tx: Tx, user: SessionUser, a: PageAccess, fileId: string | null): Promise<void>
export async function setPageProtected(tx: Tx, user: SessionUser, a: PageAccess, value: boolean): Promise<{ changed: boolean }>
export async function applyTemplate(tx: Tx, user: SessionUser, a: PageAccess, i: { baseVersion: number; template: TemplateId; today: ISODate }): Promise<ApplyTemplateResult>
export async function savePageContent(tx: Tx, user: SessionUser, a: PageAccess, i: { baseVersion: number; content: PageContent }): Promise<SavePageResult>
export async function getPageTitles(tx: DbOrTx, user: SessionUser, ids: readonly string[]): Promise<PageTitlesResponse>
// src/server/services/page-lease.ts
export const LEASE_TTL_SECONDS = 120                               // SQL: now() + make_interval(secs => ${LEASE_TTL_SECONDS})
export async function acquireLease(tx: Tx, user: SessionUser, pageId: string, opts: { takeover: boolean }): Promise<LeaseState>
export async function getLease(tx: DbOrTx, user: SessionUser, pageId: string): Promise<LeaseState>
export async function releaseLease(tx: DbOrTx, user: SessionUser, pageId: string): Promise<void>
export async function clearLeases(tx: Tx, pageIds: readonly string[]): Promise<void>
// src/server/services/files.ts
export async function storeUpload(tx: Tx, user: SessionUser, a: PageAccess, i: { name: string; bytes: Uint8Array; purpose: 'content' | 'cover'; limits: UploadLimits; today: ISODate }): Promise<UploadedFileDTO>
export async function openDownload(tx: DbOrTx, user: SessionUser, fileId: string): Promise<Response>
export function contentDisposition(kind: 'inline' | 'attachment', name: string): string
export function sanitizeFileName(name: string): string
// src/server/services/search.ts
export function escapeLike(q: string): string
export function normalizeQuery(q: string): string
export async function searchPages(tx: Tx, user: SessionUser, q: string, opts: { titleOnly: boolean }): Promise<PageSearchHit[]>
// src/server/services/charters.ts
export async function createCharter(tx: Tx, a: { projectId: string; projectName: string; actorId: string; clientName: string | null; leadName: string | null; certainty: Certainty }): Promise<PageRow>
export async function ensureProjectCharters(db: DbOrTx): Promise<{ created: number }>
```
Actions (`src/server/actions/pages.ts`, `'use server'`, M1's `action()`):
```ts
export const createPage = action(createPageSchema, async (i, ctx): Promise<CreatePageResult> => stub())
export const renamePage = action(renamePageSchema, async (i, ctx): Promise<{ title: string }> => stub())
export const setPageIcon = action(setPageIconSchema, async (i, ctx): Promise<{ icon: string | null }> => stub())
export const setPageCover = action(setPageCoverSchema, async (i, ctx): Promise<{ cover: PageDTO['cover'] }> => stub())
export const movePage = action(movePageSchema, async (i, ctx): Promise<MovePageResult> => stub())
export const duplicatePage = action(pageIdSchema, async (i, ctx): Promise<DuplicatePageResult> => stub())
export const deletePage = action(pageIdSchema, async (i, ctx): Promise<DeletePageResult> => stub())
export const restorePageBatch = action(restorePageBatchSchema, async (i, ctx): Promise<RestorePageResult> => stub())
export const setPageProtected = action(setPageProtectedSchema, async (i, ctx): Promise<{ changed: boolean }> => stub())
export const applyTemplate = action(applyTemplateSchema, async (i, ctx): Promise<ApplyTemplateResult> => stub())
export const savePageContent = action(savePageContentSchema, async (i, ctx): Promise<SavePageResult> => stub())
```
Route handlers (M1's `route()`; params are a Promise in Next 16, `route()` awaits them):
`src/app/api/pages/tree/route.ts` `GET` (query `treeQuerySchema`) · `src/app/api/pages/titles/route.ts` `GET` (`titlesQuerySchema`) ·
`src/app/api/pages/[id]/route.ts` `GET` → `PageView` · `src/app/api/pages/[id]/lock/route.ts` `GET` / `POST` (`leaseQuerySchema`) / `DELETE` → `LeaseState` ·
`src/app/api/pages/[id]/content/route.ts` `PUT` (body `keepaliveSaveBodySchema`) → `SavePageResult` · `src/app/api/files/route.ts` `POST` (multipart) →
`UploadedFileDTO` (201) · `src/app/api/files/[id]/route.ts` `GET` → file stream · `src/app/api/search/route.ts` `GET` (`searchQuerySchema`) → `SearchResponse`.
Each stub returns `stub()`; add `export const dynamic = 'force-dynamic'` only if M1's routes do.
- `src/components/editor/EditorClient.tsx` stub (`'use client'`): `export function EditorClient(props: PageEditorProps): JSX.Element` rendering
  `<Skeleton variant="rectangular" height={240} />` (S2 replaces the body with the dynamic import; S3 can wire it immediately).

**S0.15 Test helpers (`tests/helpers/**`).**
- `tests/helpers/files.ts`: byte fixtures + request builders:
  `PNG_1X1` (base64 `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=`), `jpegBytes()`, `gifBytes()`
  (`GIF89a…`), `webpBytes()` (`RIFF….WEBPVP8 `), `pdfBytes()` (`%PDF-1.4 … %%EOF`), `zipOneFile(name, text)` (stored zip with CRC32, ~40 lines),
  `cfbBytes()` (OLE2 header `D0 CF 11 E0 A1 B1 1A E1` padded to 1 536 bytes), `exeBytes()` (`MZ` + zeros), `SVG_TEXT` (`<svg xmlns="http://www.w3.org/2000/svg"/>`),
  `XML_SVG_TEXT` (`<?xml version="1.0"?><svg …/>`), `thaiCsvWin874()` (`new Uint8Array([0xC7,0xD1,0xB9,0x2C,0x31,0x0A])` = "วัน,1"), `paddedPng(totalBytes)`;
  `uploadRequest({ pageId, name, bytes, type?, purpose?, origin? })` → `Request` (`POST http://localhost/api/files`, `FormData`, `Content-Length` set);
  `callRoute(handler, { method, url, params, body?, headers? })` if M1 has no equivalent. A smoke test `tests/helpers/files.test.ts` asserts with
  `fileTypeFromBuffer`: png/jpg/gif/webp/pdf detected as such, `zipOneFile` → `zip`, `cfbBytes` → `cfb`, `exeBytes` → `exe`, SVG → `undefined`,
  XML SVG → `xml`. If `cfbBytes()` is not detected as `cfb`, commit a real empty `.doc` under `tests/fixtures/files/` instead and load it here.
- `factories.ts` (plain Drizzle inserts, never the repo — X59):
  ```ts
  export async function makePage(o: { space?: PageSpace; project?: { id: string } | null; parent?: PageRow | null; title?: string
    createdBy: { id: string }; locked?: boolean; isCharter?: boolean; icon?: string | null; content?: unknown[]; contentText?: string
    deleted?: { batch: string; daysAgo: number } }): Promise<PageRow>
  // space defaults from project (PROJECT) / parent / 'WORKSPACE'; depth = parent ? parent.depth + 1 : 0; position appended after
  // the last live sibling (generateKeyBetween(last, null)); contentText defaults to extractContentText(content).
  export async function makeFile(o: { page: PageRow; uploadedBy: { id: string }; kind?: 'IMAGE' | 'ATTACHMENT'; name?: string
    bytes?: Uint8Array; mime?: string }): Promise<FileRow>
  // writes bytes with plain node:fs to path.join(process.env.UPLOAD_DIR, '2026/09/<uuid>.<ext>') (mkdir -p) and inserts the row
  // with plain Drizzle; no dependency on S1's storage.ts.
  ```
- `world.ts` — `createWorld({ with: [...,'pages','files'] })` adds (distinctive names for leak tests):

| Key | Space / project | Shape |
|---|---|---|
| `w.pages.pCharter` | PROJECT P | root, `isCharter`, title "Charter P-ลับ04" |
| `w.pages.pPage` | PROJECT P | root after charter, title "หน้า P-ลับ05", content paragraph "เนื้อหา P-ลับ06" |
| `w.pages.pChild` | PROJECT P | child of `pPage` (depth 1), title "ลูก P-ลับ07" |
| `w.pages.qPage` | PROJECT Q | root, title "หน้า Q-ลับ08", content "เนื้อหา Q-ลับ09" |
| `w.pages.aPage` | PROJECT A (archived) | root, title "หน้า A-ลับ10" |
| `w.pages.wiki` | WORKSPACE | root "คู่มือ W-01", child `w.pages.wikiChild` "ย่อย W-02" |
| `w.pages.wikiProtected` | WORKSPACE | root, `locked`, "นโยบาย W-ล็อก03"; child `w.pages.wikiProtectedChild` "ย่อยล็อก W-04" |
| `w.pages.wikiFolder` | WORKSPACE | root unlocked "แฟ้ม W-05" whose child `w.pages.wikiFolderLocked` is `locked` |
| `w.batches.pDeletedPage` | PROJECT P | batch of a soft-deleted root "ลบแล้ว P" (1 day ago) |
| `w.batches.aDeletedPage` | PROJECT A | batch of a soft-deleted root (1 day ago) |
| `w.batches.wikiDeletedPage` | WORKSPACE | batch of a soft-deleted root (1 day ago) |
| `w.batches.pOldDeletedPage` | PROJECT P | batch deleted 31 days ago |
| `w.files.pImage` / `w.files.pPdf` | P (on `pPage`) | IMAGE (`PNG_1X1`) / ATTACHMENT (`pdfBytes`, name "สัญญา.pdf") |
| `w.files.qFile` | Q (on `qPage`) | IMAGE |
| `w.files.aFile` | A (on `aPage`) | IMAGE |
| `w.files.wikiFile` | wiki (on `wiki`, `project_id` null) | IMAGE |

  Smoke test `tests/helpers/world.int.test.ts › with pages/files`: depths, `pChild.parentId = pPage.id`, the files exist on disk under `UPLOAD_DIR`.
- `tests/authz/rows/{pages,wiki,files,search}.ts`: `export const rows: AuthzRow[] = []`, registered in `tests/authz/rows/index.ts` (S4 fills them).
- Done-check: `pnpm vitest run --project integration tests/helpers tests/authz` · `pnpm vitest run --project unit tests/helpers/files.test.ts`.

**S0.16 G0.** `pnpm db:generate` → "No schema changes"; `pnpm check` green (stubs typecheck; rows empty); `pnpm exec next typegen` OK.
Report: migration file name, the M1–M3 signatures adapted, `allowBuilds` entries added (if any), helper names that already existed.

### 5.S1 — Pages backend (backend-engineer · src/server/** for pages/files/search/charters/projects, src/app/api/{pages,files,search}/**, scripts)

Every action follows **zod parse → authz → service → audit → (refresh only if RSC output changes)** inside one
`db.transaction`; per **X59 the service writes the audit row** (`audit.log(tx, user | null, …)`) as its last statement inside the caller's transaction,
so scripts audit too — "audit …" in the steps below names the row the service writes, **except** the four X96 placements (M4-D38): `createPage`, `renamePage`, `savePageContent` (action and keepalive `PUT`) and `POST /api/files` write their row in the action/route right after the service call, in the same transaction. Services never read the clock (X56): actions/routes pass
`today = serverToday()` where a plan date is needed (meeting title, storage key). Every route handler uses `route()` (session + must-change checks) and calls `requirePage` /
`requireFile` / `requireProject` before touching data. Archived projects are enforced only through `requireProject` (X42).

**S1.1 Storage (`src/server/storage.ts`).** `localDiskStorage(root)`: `put` = `mkdir -p dirname` → write `<key>.tmp-<random>` →
`rename` (atomic); `stream` = `stat` → `Readable.toWeb(fs.createReadStream(path))` + size, missing → `null`; `remove` = `unlink`, ENOENT
ignored. Every method calls `assertSafeKey(key)` (`STORAGE_KEY_RE`; rejects `..`, absolute paths) and resolves under `root`.
Tests first — `src/server/storage.int.test.ts`: put → stream returns the same bytes and size; remove twice → no throw; `stream('2026/09/x.png')`
→ `null`; `put('../../etc/x.png')` → throws; `newStorageKey('2026-09-30','png')` matches `^2026/09/<uuid>\.png$`.

**S1.2 Authz bodies (`src/server/authz.ts`, PERM-16…19, M4-D24).**
```ts
requirePage(tx, user, pageId, need):
  page = await repo.pages.getLivePageOrNotFound(tx, pageId)                     // missing / deleted / malformed → 404
  if (page.space === 'PROJECT') {
    const acc = await requireProject(tx, user, page.projectId!, need === 'view' ? 'view' : 'edit')   // W → 404, archived write → 403
    if (need === 'protect') throw isManager(user) ? new ValidationError(th.pages.errors.protectWikiOnly) : new ForbiddenError()
    return { page, role: acc.role, archived: acc.archived, effectiveProtected: false, isManager: isManager(user) }
  }
  const prot = await effectiveProtection(tx, page.id)
  if (need === 'protect' && !isManager(user)) throw new ForbiddenError()
  if (need === 'edit' && prot && !isManager(user)) throw new ForbiddenError(th.pages.errors.protectedReadOnly)
  return { page, role: isManager(user) ? 'MANAGER' : 'WIKI', archived: false, effectiveProtected: prot, isManager: isManager(user) }
requirePageCreate(tx, user, { space, projectId, parentId }):        // M4-D31 order
  parentId ? (await requirePage(tx, user, parentId, 'view')          // invisible / deleted parent → 404
              ; parent.space/projectId must equal target → else ValidationError(crossSpace)   // 400 only for a visible parent
              ; parent = await requirePage(tx, user, parentId, 'edit'))                        // protected / archived → 403
           : space === 'PROJECT' ? await requireProject(tx, user, projectId!, 'edit') : (any logged-in user)
assertSecondPage(tx, user, otherId, scope: { space; projectId }): PageAccess   // the same three steps, exported for movePage (S1.5)
requireSubtreeUnprotected(tx, user, pageId): if (!isManager(user) && (await subtreeHasLocked(tx, pageId))) throw new ForbiddenError(th.pages.errors.subtreeProtected)
requireFile(tx, user, fileId): file = repo.files.getFile → null → 404; file.projectId ? await requireProject(tx, user, file.projectId, 'view') : ok
effectiveProtection(tx, pageId):  -- ancestors incl. self, depth ≤ 10
  with recursive anc as (select id, parent_id, locked from pages where id = $1
    union all select p.id, p.parent_id, p.locked from pages p join anc on p.id = anc.parent_id)
  select coalesce(bool_or(locked), false) from anc
subtreeHasLocked:  with recursive sub as (select id, locked from pages where id = $1 and deleted_at is null
    union all select p.id, p.locked from pages p join sub on p.parent_id = sub.id where p.deleted_at is null)
  select coalesce(bool_or(locked), false) from sub
```
Tests first — `src/server/authz.pages.int.test.ts` (world `pages`): `requirePage(outsider, pPage, 'view')` → `NotFoundError`; `(member, pPage, 'edit')` ok;
`(member, aPage, 'view')` ok, `'edit'` → `ForbiddenError`; `(outsider, wiki, 'edit')` ok; `(member, wikiProtectedChild, 'edit')` → `ForbiddenError`
(inherited); `(manager, wikiProtectedChild, 'edit')` ok, `effectiveProtected true`; `(lead, wiki, 'protect')` → 403; `(manager, pPage, 'protect')` →
`ValidationError`; `(member, w.batches.pDeletedPage root id, 'view')` → 404; `requireSubtreeUnprotected(member, wikiFolder)` → 403, manager ok;
`requireFile(outsider, pImage)` → 404, `(outsider, qFile)` ok, `(member, wikiFile)` ok, `(member, aFile)` ok; malformed id `'x'` → 404.

**S1.3 Page view, create, header fields, templates, save (FR-504/506/507/531/543).** `src/server/services/{pages,page-tree}.ts` + actions.
- `getPageView(tx, user, pageId)`: `a = requirePage(view)`; project name/archived (join); cover → `{ fileId, url: fileUrl(id) }`; `updatedBy` display name;
  `isBlank = isBlankPage(page)`; `breadcrumb = getBreadcrumb` (ancestors CTE ordered by depth, excluding self); `can` =
  `edit`: `requirePage(edit)` would pass (compute without throwing: not archived and (not effectiveProtected or manager));
  `protect`: manager and WORKSPACE; `delete`: `edit` and not charter and subtree unprotected for workers; `createChild`: `edit` and `depth < 9`;
  `move`: `edit`; `duplicate`: create permission at the parent/root; `uploadLimits` from `env`.
- `createPage` service: `requirePageCreate`; `depth = parent ? parent.depth + 1 : 0`, `depth > 9` → `ValidationError(maxDepth)`; `lockPageScope`
  (`pg_advisory_xact_lock(hashtext('pages:' || space || ':' || coalesce(projectId,'') || ':' || coalesce(parentId,'root')))`); `position = keyAt(afterId)`
  (`undefined` → after last live sibling; `null` → before first; a non-sibling `afterId` → `ConflictError(th.pages.errors.treeChanged)`; equal neighbour keys →
  re-key siblings with `generateNKeysBetween`, as M3's `keyAt`); insert `{ title: '', content: [], createdBy: user.id, updatedBy: user.id }`.
  Action: audit `{ entity: 'page', action: 'create', entityId, projectId, summary: th.audit.pageCreated('') }`; returns `CreatePageResult` (`href: '/p/<id>'`); no `refresh()`.
- `renamePage` / `setPageIcon` / `setPageCover`: `requirePage(edit)`; update the column + `updated_by/updated_at` (no version bump, M4-D4); cover: file must
  exist, `kind = 'IMAGE'`, `project_id IS NOT DISTINCT FROM page.project_id` → else `ValidationError(coverNotImage)`; audit `pageRenamed` (before/after title; written by the **action**, M4-D38),
  `pageIconChanged`, `pageCoverChanged` (written by the services); no `refresh()` (M4-D29).
- `applyTemplate`: `requirePage(edit)`; the action passes `today = serverToday()`; the service builds `buildTemplate(id, { dateLabel: formatThaiDate(i.today, 'medium') })`;
  `UPDATE pages SET title, icon, content, content_text = extractContentText(content), version = version + 1 … WHERE id AND version = $base`
  → 0 rows → `ConflictError('VERSION_CONFLICT', { current: { version } })`; audit `pageTemplateApplied`; no `refresh()` (the client re-creates the editor).
- `savePageContent`: `requirePage(edit)` (archived/protected → 403, deleted → 404); `content = sanitizeContent(input.content)`;
  `text = extractContentText(content)`; `UPDATE pages SET content = $c, content_text = $t, version = version + 1, updated_by = $u, updated_at = now()
  WHERE id = $id AND version = $base AND deleted_at IS NULL RETURNING version`; 0 rows → re-read: deleted → `NotFoundError`, else
  `ConflictError` code `VERSION_CONFLICT` with `current: { version }`; then `lease = getLease(...)`; the **action** (and the keepalive route, M4-D38) writes audit `{ entity:'page', action:'update',
  summary: th.audit.pageSaved(title), after: { version } }` (never content). No `refresh()` (the editor is client state).
- Tests first — `src/server/services/pages.int.test.ts`:
  - `create`: member creates a P root → depth 0, after `pChild`'s parent in order; child of `pChild` → depth 2; a page at depth 9 + child → `VALIDATION maxDepth`;
    `afterId` = id from another parent → `CONFLICT`; two concurrent appends under one parent (`Promise.all` of two transactions) → distinct keys,
    deterministic order; outsider creates in P → 404; member in A → 403; anyone creates a wiki root; worker child under `wikiProtected` → 403.
  - `save`: `baseVersion 1` → `version 2`, `content_text` = `'เนื้อหาใหม่'` for a one-paragraph doc, audit row has no `content` key in `before/after`;
    second save with stale `baseVersion 1` → `VERSION_CONFLICT` with `current.version === 2`; a doc with an external image url is stored as a link paragraph;
    a `javascript:` link → `VALIDATION` (via `action()`); 2 MB + 1 byte → `VALIDATION contentTooLarge`; saving a soft-deleted page → 404;
    a save by a user who does **not** hold the lease but can edit and has the current version → accepted (X63), response `lease.mine === false`.
  - `header`: rename trims and caps at 200; icon not in `PAGE_ICONS` → `VALIDATION`; cover with an ATTACHMENT file → `VALIDATION coverNotImage`;
    cover with an IMAGE of project Q on a P page → `VALIDATION`; rename does not change `version`; the `refresh` mock is never called by M4 actions.
  - `template`: blank page + `meeting` with `APP_NOW=2026-09-30T10:00:00+07:00` → title `th.pages.meetingTitle('30 ก.ย. 2569')`, icon 📝,
    `content_text` contains 'วาระ', version 2; `sop` → title `''`, icon 📘.

**S1.4 Tree, breadcrumb, titles, page GET (FR-503/504/529, M4-D20/D23).**
- `listTree(tx, user, { space, projectId, parentId })`: PROJECT → `requireProject(view)`; `parentId` → `requirePage(parent, view)` and its space/project must match
  (else 404); SQL:
  ```sql
  select p.id, p.parent_id, p.title, p.icon, p.depth, p.position, p.locked, p.is_charter,
         exists (select 1 from pages c where c.parent_id = p.id and c.deleted_at is null) as has_children
  from pages p
  where p.deleted_at is null and p.space = $space
    and <projectId is null ? p.project_id is null : p.project_id = $projectId>
    and <parentId is null ? p.parent_id is null : p.parent_id = $parentId>
  order by p.position, p.id
  ```
  `effectiveProtected = parentProtected || node.locked` (`parentProtected` = `effectiveProtection(parentId)` once); `canCreate` = create permission at this level.
- Routes: `GET /api/pages/tree` → `listTree`; `GET /api/pages/[id]` → `getPageView` (used for "fresh fetch" after takeover and reload);
  `GET /api/pages/titles?ids=` → `getPageTitles`: one query for all ids; for each id: missing or invisible (PROJECT page whose project is not in
  `visibleProjectIds`) → `{ id, visible: false }`; visible and `deleted_at` set → `{ id, visible: true, deleted: true }`; else title + icon. Never a title
  for an invisible page.
- Tests first — `src/server/services/page-tree.int.test.ts › list`: P roots for member = `[pCharter, pPage]` in position order, `pPage.hasChildren true`;
  children of `pPage` = `[pChild]`; outsider → 404 for P; wiki roots for outsider include `wikiProtected` with `locked true, effectiveProtected true`;
  children of `wikiProtected` → `wikiProtectedChild.effectiveProtected true, locked false`; deleted roots never listed; `parentId` from P with `space=WORKSPACE` → 404.
  `pages.int.test.ts › titles`: outsider asks `[pPage, qPage, wiki, <deleted P root>, <random uuid>]` → `pPage` `{visible:false}`, `qPage` titled,
  `wiki` titled, deleted P root `{visible:false}` (P invisible), random `{visible:false}`; member asks the deleted P root → `{visible:true, deleted:true}`;
  `JSON.stringify(response)` for the outsider contains neither "หน้า P-ลับ05" nor "ลบแล้ว P".

**S1.5 Move, duplicate, delete, restore (FR-503/508/509, M4-D21/D22/D24).** `src/server/services/page-tree.ts` + actions.
- `movePage({ pageId, parentId, afterId })`: `a = requirePage(page, edit)`; `requireSubtreeUnprotected(page)`; target parent (if any):
  `assertSecondPage(tx, user, parentId, { space: a.page.space, projectId: a.page.projectId })` — invisible/deleted → 404, other space/project →
  `VALIDATION crossSpace`, protected (workers) / archived → 403, in that order (M4-D31; `PG-MOVE-X` expects 404 for L/Me); not the page itself nor a descendant
  (`VALIDATION cycle`); charter → `parentId` must be null (`VALIDATION charterRootOnly`); `newDepth + subtreeHeight ≤ 9` (`VALIDATION maxDepth`);
  `lockPageScope(new scope)`; `position = keyAt({ afterId, excludeId: pageId })`; update `parent_id`, `position`; shift depths of the whole subtree by
  `delta` in one statement (`with recursive sub as (…) update pages set depth = depth + $delta where id in (select id from sub)`); audit `pageMoved`.
- `duplicatePage(pageId)`: `requirePage(source, view)`; `requirePageCreate` at the source's parent/root; `rows = subtreeRows(source)` (DFS, live only);
  `map = old → gen_random_uuid()` (ids from the DB: `select gen_random_uuid() from generate_series(1, n)`); insert copies in DFS order with
  `parent_id = map(old.parent)` (root: same parent), same `depth`, `position` = root: `keyAt({ afterId: source.id })`, children keep their keys,
  `title` root `th.pages.copyTitle(title)`, children unchanged, `content = remapSubpageIds(old.content, map)`, `content_text` recomputed,
  `is_charter = false`, `locked = false`, `version = 1`, same `icon`/`cover_file_id`, `created_by = updated_by = user`; files are not copied;
  one audit row `pageDuplicated(title, n)`. Returns the root as `PageTreeNode` + `count`.
- `softDeleteSubtree(pageId)`: `requirePage(edit)`; charter → `ForbiddenError(th.pages.errors.charterNotDeletable)` (also for managers);
  `requireSubtreeUnprotected`; `batch = crypto.randomUUID()`; `update pages set deleted_at = now(), deleted_batch = $batch where id in (subtree)`;
  `clearLeases(ids)`; audit `pageDeleted(title, n)`; returns `DeletePageResult` (`count` = number of descendants for the toast).
- `restorePageBatch(batch)`: rows `where deleted_batch = $batch` → none → 404; roots = rows whose parent is not in the batch; for each root:
  `requirePage`-equivalent on the **root row** without the deleted check (PROJECT → `requireProject(edit)`; WORKSPACE → parent's effective protection blocks workers);
  any row `deleted_at <= now() - interval '30 days'` → `ConflictError(restore.failed(restore.expired))`; parent live (else `restore.parentDeleted`);
  `newDepth = parent ? parent.depth + 1 : 0`, `max(depth) + delta ≤ 9` (else `restore.tooDeep`); clear `deleted_at`/`deleted_batch`, shift depth by delta;
  audit `pageRestored(title, n)` per root. Positions are kept (ties resolve by id).
- Tests first — `page-tree.int.test.ts › move/duplicate/delete/restore`:
  - move `pChild` to root after `pPage` → depth 0, order `[pCharter, pPage, pChild]`; move `pPage` under `pChild` → `VALIDATION cycle`; move `pPage` under a
    wiki page → `VALIDATION crossSpace`; move `pCharter` under `pPage` → `VALIDATION charterRootOnly`; a 2-level subtree under a depth-8 page → `VALIDATION maxDepth`;
    member moves `wikiProtectedChild` → 403; member moves `wiki` under `wikiProtected` → 403; manager may; stale `afterId` → `CONFLICT`; descendants' depths shift.
  - duplicate `pPage` (content has a `subpage` card pointing at `pChild`) → 2 new rows, root title "หน้า P-ลับ05 (สำเนา)" right after `pPage`, the copied root's
    card points at the **copied** child, `is_charter false`, `version 1`, files rows unchanged (same count); duplicate `pCharter` → copy `is_charter false` and the
    unique index holds; outsider duplicates `pPage` → 404; member duplicates `wikiProtectedChild` (parent protected) → 403.
  - delete `pPage` → `pPage` + `pChild` share one batch, lease rows of both gone, `count 1`; delete `pCharter` (manager) → 403; member deletes `wikiFolder` → 403
    (`subtreeProtected`); outsider deletes `wiki` → allowed (r6a M4-06).
  - restore that batch → both back, same order; restore `w.batches.pOldDeletedPage` → `CONFLICT` (expired); restore a child whose parent was deleted in another
    batch → `CONFLICT parentDeleted`; member restores `w.batches.aDeletedPage` → 403; outsider restores `pDeletedPage` → 404.

**S1.6 Lease service + routes + keepalive save + protect (FR-510, FR-540…543, X63, M4-D2/D3/D18).**
- `src/server/http/same-origin.ts`: `assertSameOrigin(req: Request): void` — `Origin` header present and `new URL(origin).host !== new URL(req.url).host`
  (respect `x-forwarded-host` the way M1's `trustedOrigins` does) → `ForbiddenError`. Unit test `same-origin.test.ts`: no Origin → ok; same → ok; other → throws.
- `acquireLease(tx, user, pageId, { takeover })` (r6a §5.4 SQL; caller already ran `requirePage(edit)`):
  ```sql
  insert into page_locks (page_id, user_id, expires_at) values ($1, $2, now() + make_interval(secs => 120))
  on conflict (page_id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at
  where page_locks.user_id = excluded.user_id or page_locks.expires_at < now()     -- omitted when takeover
  returning user_id, expires_at
  ```
  0 rows → `getLease` (holder = other user). Result `LeaseState { mine, holder: { userId, name: displayName }, expiresAt (ISO), version: pages.version }`.
  `getLease`: expired rows count as "no holder" (`holder: null`). `releaseLease`: `delete from page_locks where page_id = $1 and user_id = $2`.
  `clearLeases(ids)`: `delete … where page_id = any($1)`. Leases are **not** audited (X44).
- Routes `src/app/api/pages/[id]/lock/route.ts`: `GET` → `requirePage(view)` → `getLease`; `POST` → `assertSameOrigin` → `requirePage(edit)` → `acquireLease`
  (`takeover` from `?takeover=1`); `DELETE` → `assertSameOrigin` → `requirePage(view)` → `releaseLease` → `204` (a `DELETE` by a non-holder is a no-op).
  Each runs in `db.transaction`.
- `src/app/api/pages/[id]/content/route.ts` `PUT`: `assertSameOrigin`; body ≤ 2 MB parsed with `keepaliveSaveBodySchema`; same transaction as the action
  (`requirePage(edit)` → `savePageContent` → audit). Returns `SavePageResult` JSON (the browser ignores it after `pagehide`).
- `setPageProtected`: `requirePage(protect)` (workers 403, PROJECT → `VALIDATION`); update `locked`; audit `pageProtected`/`pageUnprotected` when changed; no `refresh()`.
- Tests first — `src/server/services/page-lease.int.test.ts`: Cindy-like `lead` acquires `pPage` → `mine true`; `member` acquires → `mine false`, `holder.userId = lead`,
  `holder.name` = lead's display name; `lead` heartbeats → `expiresAt` moves forward; set `expires_at = now() - interval '1 second'` → `member` acquires → `mine true`
  (FR-541, no sleeps); `lead` heartbeats again → `mine false` (displaced); `member` takeover while `lead` holds a fresh lease → `mine true`; `lead` saves with the current
  version after being displaced → accepted (flush); `member` saves with the old version afterwards → `VERSION_CONFLICT`; `getLease` on an expired row → `holder null`;
  release by a non-holder leaves the row; deleting the page clears its lease; route-level: `POST` with `Origin: https://evil.example` → 403; outsider `GET` lock of `pPage` → 404;
  member `POST` lock on `wikiProtected` → 403, manager → allow; `POST` on `aPage` → 403; `GET` on `aPage` → allow; keepalive `PUT` with a stale version → 409, current → 200
  and one audit row. Protect: manager protects `wiki` → `locked true`, audit row; worker → 403; manager on `pPage` → 400.

**S1.7 Files (§7.6, FILE-1…8, M4-D15…D17).**
- `src/server/files/classify-upload.ts`: copy `plan/research/snippets/r4/server/classify-upload.ts`; change `LIMIT` into a `limits: UploadLimits` parameter
  (`classifyUpload(bytes, clientName, limits)`), map `kind` to `'IMAGE' | 'ATTACHMENT'`. Unit tests `src/server/files/classify-upload.test.ts` using
  `tests/helpers/files.ts`: png/jpg/gif/webp → IMAGE with detected MIME; pdf → `application/pdf`; `zipOneFile` named `a.docx` → docx MIME; named `a.zip` → `application/zip`;
  `cfbBytes` named `a.doc` → `application/msword`, named `a.msi` → `UNSUPPORTED_TYPE`; `exeBytes` named `a.png` → `UNSUPPORTED_TYPE`; `SVG_TEXT` named `a.svg` →
  ATTACHMENT `image/svg+xml`; `XML_SVG_TEXT` → same; PNG bytes named `a.svg` → IMAGE (content wins); `thaiCsvWin874` named `a.csv` → ATTACHMENT `text/csv`;
  HTML text named `a.txt` → ATTACHMENT `text/plain`; `paddedPng(11 MB)` → `TOO_LARGE`; 26 MB pdf → `TOO_LARGE`; empty bytes → `UNSUPPORTED_TYPE`.
- `POST /api/files` (`src/app/api/files/route.ts`): `assertSameOrigin`; `Content-Length` > `attachmentBytes + 1 MiB` → 413 before reading; `buf = await req.arrayBuffer()`;
  header present and `buf.byteLength !== Number(header)` → 400 `lengthMismatch`; `form = await new Response(buf, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData()`;
  `file = form.get('file')` must be a `File` (else 400 `missingFile`); `uploadFieldsSchema.parse({ pageId, purpose })`; then in one `db.transaction`: `a = requirePage(pageId, edit)`
  → `storeUpload` → audit `{ entity: 'file', action: 'create', entityId: file.id, projectId: a.page.projectId, summary: th.audit.fileUploaded(name) }` → `201` JSON `UploadedFileDTO`.
- `storeUpload`: `cls = classifyUpload(bytes, name, limits)` → `TOO_LARGE` → `PayloadTooLargeError`, `UNSUPPORTED_TYPE` → `UnsupportedMediaTypeError`; `purpose === 'cover'` and
  kind ≠ IMAGE → `UnsupportedMediaTypeError`; `key = newStorageKey(i.today, cls.ext)` (the route passes `serverToday()`); `await getStorage().put(key, bytes)`; insert `files` row
  `{ storageKey: key, originalName: sanitizeFileName(name), mime: cls.mime, sizeBytes: bytes.length, kind, pageId: a.page.id, projectId: a.page.projectId, uploadedBy }`;
  on any error after `put` → `remove(key)` best-effort and rethrow (M4-D16). `sanitizeFileName`: strip `/ \ : * ? " < > |` and C0/C1 controls, collapse spaces, NFC,
  ≤ 200 chars (keep the extension), empty → `'file'`.
- `GET /api/files/[id]`: `requireFile` (404) → `getStorage().stream(key)` (missing → 404) → `new Response(body, { headers })` with `Content-Type: mime`,
  `Content-Length`, `X-Content-Type-Options: nosniff`, and for IMAGE `Content-Disposition: inline; filename*=UTF-8''…` + `Cache-Control: private, max-age=3600`,
  for ATTACHMENT `Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<encodeURIComponent(name)>` +
  `Content-Security-Policy: default-src 'none'; sandbox` + `Cache-Control: private, no-store`.
- Tests first — `src/server/services/files.int.test.ts` (calls the route handlers with `uploadRequest`): member uploads `PNG_1X1` to `pPage` → 201, `url` matches
  `FILE_URL_RE`, row `kind IMAGE`, `project_id = P`, file on disk under `UPLOAD_DIR/2026/09/`, one audit row (`entity 'file'`); outsider → 404; member to `aPage` → 403;
  worker to `wikiProtected` → 403; anyone to `wiki` → 201 with `project_id null`; `"สัญญา.pdf"` keeps its Thai name; `Content-Length` lie → 400; `.exe` → 415 and no file
  left on disk; cover purpose with a pdf → 415. Download: member GET `pImage` → 200, `content-type image/png`, `nosniff`, `inline`, `private, max-age=3600`;
  `pPdf` → `attachment` with `filename*=UTF-8''%E0%B8%AA…`, CSP `sandbox`; **outsider GET `pImage` → 404 (AC-503)**; outsider GET `qFile` → 200; any user GET `wikiFile` → 200;
  member GET `aFile` → 200; file row whose disk file was removed → 404.

**S1.8 Search (§6.4, FR-1102/1104/1105 pages part, X68, M4-D19).** `src/server/services/search.ts` + `GET /api/search`.
- `normalizeQuery`: NFC, strip `[​-‍⁠﻿]`, collapse whitespace, trim. `escapeLike`: escape `\`, `%`, `_` with `\`. Both are pure (no DB/`server-only`
  imports) and exported from `services/search.ts`; every M4 caller and test imports them from `@/server/services/search` (M10 moves the bodies to
  `src/lib/search/normalize.ts` and re-exports, M4-D37b). Unit test `src/server/services/search.test.ts`: `normalizeQuery(' ภาษา​ไทย  ')` → `'ภาษาไทย'`;
  `escapeLike('50%_a\\b')` → `'50\\%\\_a\\\\b'`.
- Route: `db.transaction(async (tx) => { await tx.execute(sql\`set local statement_timeout = '500ms'\`); return { pages: await searchPages(tx, user, q, { titleOnly }) } }, { accessMode: 'read only' })`.
- `searchPages`: `vis = visibleProjectIds(tx, user)`; filter `p.deleted_at is null and (p.space = 'WORKSPACE' or p.project_id = any($vis))` (`'ALL'` → no project filter);
  title query: `p.title ilike '%' || $esc || '%' escape '\'` ordered by `word_similarity($q, p.title) desc, length(p.title), p.id` limit 8; if `!titleOnly && q.length ≥ 3`
  and fewer than 8 hits: content query `p.content_text ilike … and p.id <> all($titleIds)` limit `8 - n` (no ordering); a `57014` (statement timeout) from the content
  query → keep the title hits (the transaction is then aborted, so run the content query inside a `SAVEPOINT` via a nested `tx.transaction`). Hit: `href '/p/<id>'`,
  `subtitle` = project name or `th.palette.wiki`, `matchedIn`.
- Tests first — `src/server/services/search.int.test.ts`: seed wiki page "ย้ายข้อมูลลูกค้า" and a P page with content "…ลูกค้าเดิม…": member `q='ลูกค้า'` → title hit first
  (`matchedIn 'title'`) then the content hit; `q='ลู'` (2 chars) → title hits only; `titleOnly=1` → no content hits; outsider `q='P-ลับ'` → no P pages, and
  `JSON.stringify(res)` has no P ids/titles; `q='%'` and `q='_'` match nothing special (escaped); deleted pages excluded; archived project A page visible to member;
  9 matching titles → 8 results; Thai combining marks (`'ภาษา'` stored with a ZWSP) found after normalisation.

**S1.9 Charters (FR-402, X25, M4-D5/D6).** `src/server/services/charters.ts` + M2's `services/projects.ts` + `actions/projects.ts` + scripts.
- `createCharter(tx, a)`: `t = charterTemplate({ clientName, leadName, certaintyLabel: th.projects.certainty[certainty] })`; `lockPageScope(PROJECT, projectId, null)`;
  `position = keyAt({ afterId: null })` (first root); insert `{ space: 'PROJECT', projectId, isCharter: true, title: t.title, icon: t.icon, content: t.content,
  contentText: extractContentText(t.content), createdBy = updatedBy = actorId }`.
- `services/projects.ts#createProject` (M2, already extended by M3 with `ensureProjectStatuses(tx, project.id)`, X70): after the project insert, the optional
  LEAD row and M3's status insert (leave that call and its position untouched), call `createCharter` with `clientName: client?.name ?? '—'`,
  `leadName: lead ? displayName(lead) : '—'` and the certainty; the action's single audit row gets `after: { charterPageId }` (M4-D5). `ensureProjectCharters`
  passes the same values (first LEAD by `added_at`).
- `ensureProjectCharters(db)`: `select … from projects p where p.deleted_at is null and not exists (select 1 from pages g where g.project_id = p.id and g.is_charter and g.deleted_at is null)`;
  for each, in its own transaction: `createCharter({ actorId: p.created_by, … })` + audit (actor `null`, `entity 'page'`, `summary th.audit.charterCreated(p.name)`);
  `23505` (raced) → skip. Returns `{ created }`.
- `scripts/bootstrap.ts` (CommonJS under tsx: no top-level await, no `import.meta`, X56): call `ensureProjectCharters(db)` inside its existing `main()` right after
  M3's `ensureAllProjectStatuses` and log `charters: <n> created`. `scripts/lib/fixtures.ts#seedGolden(db, { upTo })`: after M3's statuses + tasks step,
  when `upTo` ≥ `'M4'` (follow the existing convention), call `ensureProjectCharters(db)`.
- Tests first — `src/server/services/charters.int.test.ts`: `createProject` (manager, client Coral-like, LEAD lead, CONFIRMED) → exactly one charter, `is_charter`, title
  `th.pages.charterTitle`, icon 📋, `content_text` contains (`toContain`, M4-D37c) the client name, the lead's display name and `th.projects.certainty.CONFIRMED`;
  the project still gets M3's 5 default statuses (X70) in the same transaction; still exactly **one** audit row for `createProject`; in a separate file
  `charters-rollback.int.test.ts` with `vi.mock('@/server/services/charters', async (orig) => ({ ...(await orig()), createCharter: vi.fn().mockRejectedValue(new Error('boom')) }))`,
  `createProject` throws and leaves no project, status, LEAD or audit row (one transaction); `ensureProjectCharters` on a world whose P/Q/A have no charter → `created 3`, second run → `created 0`; a project whose charter was soft-deleted gets a new one;
  `scripts/lib/fixtures.int.test.ts › M4`: after `seedGolden(db)` → 5 charters, one per golden project, each first in its project's root order.

**S1.10 File cleanup on permanent delete (FR-407, X26).** In M2's `services/projects.ts`: `collectProjectFileKeys(tx, projectId)` → `repo.files.listProjectFileKeys`;
`unlinkFilesBestEffort(keys)` → `getStorage().remove(k)` for each, catching and logging (`console.warn` with the key only). The M2 action already calls them in the right
order (collect inside the tx, unlink after commit). Test — extend `src/server/services/projects.int.test.ts › delete`: a project with two files on disk → after
`deleteProjectPermanently` the rows are gone (cascade) and both files are gone from `UPLOAD_DIR`; a missing file does not fail the delete.

**S1.11 G1.** `pnpm vitest run --project integration src/server scripts` · `pnpm vitest run --project unit src/server` · `pnpm eslint src/server src/app/api scripts` ·
`pnpm typecheck` (own paths clean). Report `requests` (e.g. world keys S4 needs, i18n keys outside `files`/`pages.errors`/`audit`).

### 5.S2 — BlockNote editor (editor-engineer · src/components/editor/**, src/lib/editor/**)

Start every file from the verified harness in `plan/research/snippets/r3/harness/src/` (paths below), replacing `thEditor` with `th.editor` and
the harness stores with TanStack Query. Rules: `@blocknote/*` runtime imports only inside `src/components/editor/**` and `src/lib/editor/{paste,upload,dictionary}.ts`
(everything else may `import type` only); `import '@blocknote/mantine/style.css'` only in `PageEditor.tsx` (the dynamic chunk), **never**
`@blocknote/core/fonts/inter.css`; no `window.__bn` global; no `any` (type BlockNote items via `DefaultReactSuggestionItem`, `SuggestionMenuOptions`).

**S2.1 Pure suggestion + TSV helpers (test-first, `unit` project).**
- `src/lib/editor/suggest.ts` ← `harness/src/lib/suggest.ts` (`rankSuggestionItems`, `atWordStart`, `slashShouldOpen`; replace `best.get(...)!` with
  `?? { rank: 9, i: 0 }`). Tests `suggest.test.ts` (port `snippets/r3/nodecheck/suggest.test.ts`): items `[{title:'ย่อหน้า'},{title:'หน้า',aliases:['page']}]` +
  `'หน้า'` → `['หน้า','ย่อหน้า']`; `'page'` → `['หน้า']`; `''` → input order; groups stay contiguous (two groups interleaved by rank stay grouped); `atWordStart` with a
  fake `tr` (`selection.$from.nodeBefore`): `null` → true, text `'10'` → false, `'ประชุม '` → true, non-text atom → true; `slashShouldOpen` when
  `$from.parent.type.isInGroup('tableContent')` → false.
- `src/lib/editor/tsv.ts` ← `harness/src/lib/tsv.ts` (`parseTsvGrid`, `gridToHtmlTable`). Tests `tsv.test.ts`: `'a\tb\nc\td'` → `[['a','b'],['c','d']]`; CRLF + trailing
  newline → same; `'"a\nb"\tc\nd\te'` → `[['a\nb','c'],['d','e']]`; `'"say ""hi"""\tx\ny\tz'` → first cell `say "hi"`; ragged rows → `null`; `'a\tb'` (1 row) → `null`;
  `'a\nb'` (no tab) → `null`; the markdown-looking grid `'ชื่อ\tงาน\nCindy\ttask_name_1\nIvy\t1. วางแผน'` → 3×2 grid; `gridToHtmlTable([['<a>&','x\ny']])` →
  `<table><tbody><tr><td>&lt;a&gt;&amp;</td><td>x<br>y</td></tr></tbody></table>` (exact tags as the snippet emits).
- Done-check: `pnpm vitest run --project unit src/lib/editor/suggest.test.ts src/lib/editor/tsv.test.ts`.

**S2.2 Paste, upload, dictionary, initial-content sanitiser (test-first, `ui` project = jsdom).**
- `src/lib/editor/paste.ts` ← `harness/src/lib/paste.ts`: `makePasteHandler({ notify, limits })` (6-step routing exactly as PLAN §3.11: `blocknote/html` → default;
  HTML `<table>` → `pasteHTML` even when files exist; files with no meaningful HTML → `insertFilesAtCursor`; TSV-only grid → `pasteHTML(gridToHtmlTable)`; HTML with
  external `<img>` → `externalImagesToLinks`; otherwise `defaultPasteHandler({ prioritizeMarkdownOverHTML: false, plainTextAsMarkdown: true })`), `externalImagesToLinks`,
  `htmlHasText`. Remove the harness `__pasteMode` hook. Tests `paste.test.ts` with a fake editor `{ pasteHTML: vi.fn() }`, a spied `insertFilesAtCursor` and fake
  `ClipboardEvent`s built from a `DataTransfer` polyfill object `{ types, getData, files }`: one case per route (6), plus `externalImagesToLinks('<p><img src="https://x/c.png" alt="แมว"></p>')`
  → contains `<a href="https://x/c.png">แมว</a>` and no `<img`; `src="data:…"` → text `th.editor.pasteImageLinkFallback` without `href`; `src="/api/files/<v4>"` kept;
  `htmlHasText('<style>p{}</style><meta>')` → false, `'<b>hi</b>'` → true.
- `src/lib/editor/upload.ts` ← `harness/src/lib/upload.ts`: `uploadStore` (external store for `useSyncExternalStore`), `makeUploadFile({ pageId, notify, limits, getEditor })`
  (client pre-check with `precheckFile` → messages `th.editor.upload.tooLargeImage(imageBytes/1MiB)` / `tooLargeFile(...)` / `typeNotAllowed`; `POST /api/files` with
  `FormData { file, pageId }`; 413 → `tooLarge*`, 415 → `typeNotAllowed`, other non-2xx or a thrown fetch → `th.editor.upload.failed`; success → the **PartialBlock**
  `{ type: 'image', props: { url, name } }` or `{ type: 'file', props: { url, name, size } }` chosen by the server's `kind`; failure → `notify` + resolve `{}` + remove the
  empty placeholder next tick only if its `url === ''`; **never rejects**), `insertFilesAtCursor(editor, files, notify, limits)`. Tests `upload.test.ts` (fetch mocked):
  IMAGE response → image partial; ATTACHMENT → file partial with `size`; 415 → resolves `{}` and `notify(th.editor.upload.typeNotAllowed)`; fetch throws → resolves `{}`,
  `notify(failed)`; 11 MB png → no fetch, `notify(tooLargeImage(10))`; `await expect(upload(file)).resolves` in every case; `uploadStore.has(blockId)` is true while the fetch
  is pending and false after.
- `src/lib/editor/dictionary.ts` ← `harness/src/lib/dictionary.ts` (`buildThaiDictionary`, `thaiDictionary` from `th.editor.blocknote` + `en` from `@blocknote/core/locales`).
  Tests `dictionary.test.ts`: every key of `en.slash_menu` has the Thai title from `th.editor.blocknote.slash_menu`; `table.aliases` contains `'table'`; `heading.aliases`
  contains `'h1'`; Thai aliases kept (`image.aliases` contains `'รูป'`).
- `src/lib/editor/sanitize.ts`: `prepareInitialContent(raw: unknown): AppPartialBlock[] | undefined` — `pageContentSchema.safeParse` ok → `sanitizeContent` → `[]` →
  `undefined` (BlockNote throws on `[]`); not ok → keep blocks that pass `blockSchema` individually, replace the others with
  `{ type: 'paragraph', content: extractContentText([b]) }`; `findForeignMedia(doc): string[]` (ids of image/file blocks whose url is neither `''` nor `FILE_URL_RE`).
  Tests: `[]` → `undefined`; `[{ type: 'nope', content: 'x' }]` → `[{ type: 'paragraph', content: 'x' }]`; external image → link paragraph; `complex-doc.json` unchanged;
  `findForeignMedia` finds a nested external image id.
- Done-check: `pnpm vitest run --project ui src/lib/editor` + `pnpm vitest run --project unit src/lib/editor`.

**S2.3 Schema, custom blocks, inline mention (FR-521/527/528/529, M4-D12).**
- `src/components/editor/schema.ts` ← `harness/src/schema.ts`: explicit default blocks `paragraph, bulletListItem, numberedListItem, checkListItem, toggleListItem, quote,
  codeBlock, divider, table`; `heading: createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false })`; `image` with `meta.fileBlockAccept = [...IMAGE_MIME]`;
  `file: createAttachmentBlock()` (type name **`file`**); `subpage: createSubpageBlock()`; `inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention }`;
  `styleSpecs: defaultStyleSpecs`. Export `AppSchema`, `AppEditor`, `AppBlock`, `AppPartialBlock`.
- `src/components/editor/blocks/subpage.tsx` ← `harness/src/blocks/subpage.tsx`; `src/components/editor/hooks/usePageRef.ts`:
  `useQuery({ queryKey: qk.pageTitles([pageId]), queryFn: () => getJson<PageTitlesResponse>(\`/api/pages/titles?ids=${pageId}\`), enabled: pageId !== '', staleTime: 30_000 })`
  → `{ status: 'creating' | 'loading' | 'ok' | 'deleted' | 'noAccess'; title?; icon? }`. Card: `<a data-testid="subpage-card" contentEditable={false}>` with icon (default 📄),
  title or `th.editor.subpage.untitled`; `deleted` → `th.editor.subpage.deleted`, `noAccess` → `noAccess`, `creating` → `creating` (no `href` unless `ok`); click → `router.push`.
- `src/components/editor/blocks/attachment.tsx` ← `harness/src/blocks/attachment.tsx` (props `backgroundColor, name, url, caption, size`; `meta.fileBlockAccept: ['*/*']`,
  `parse: fileParse()`; uploading state from `useSyncExternalStore(uploadStore.subscribe, () => uploadStore.has(block.id))`; card = 📎 + `<a href={url} download={name}
  aria-label={th.editor.attachment.download(name)}>name</a>` + `formatBytes(size)` + caption).
- `src/components/editor/inline/mention.tsx` ← `harness/src/inline/mention.tsx`; `src/components/editor/hooks/usePersonName.ts` reads M2's people options
  (`useQuery(qk.peopleOptions())`): user chip `@<displayName>` (+ ` ${th.editor.mention.deactivated}` when inactive, `@${th.editor.mention.unknownUser}` when unknown);
  page chip via `usePageRef` (`ok` → link, `noAccess` → `th.editor.mention.noAccess`, `deleted` → `deletedPage`, no `href`). Store ids only.
- Tests first (`ui`): `src/components/editor/schema.test.ts` — `Object.keys(schema.blockSpecs).sort()` equals `[...BLOCK_TYPES].sort()` from `page-content.ts`
  (client/server parity; both sides are derived, never a hard-coded list, so M10's additive `taskView`/`projectWorkload` keep it green — M4-D37a); heading `levels` `[1,2,3]`; `templates.headless.test.ts` — for `charterTemplate()`, `meetingTemplate('30 ก.ย. 2569')`, `sopTemplate()` and
  `complex-doc.json`: `BlockNoteEditor.create({ schema, initialContent })` does not throw, every block gets a string id, `extractContentText(editor.document) ===
  extractContentText(template.content)`, and `pageContentSchema.safeParse(JSON.parse(JSON.stringify(editor.document))).success` (the JSON round-trip turns
  `columnWidths` `undefined` into `null` exactly as the autosave payload does); `subpage.test.tsx`, `attachment.test.tsx`, `mention.test.tsx`
  (QueryClient seeded with `setQueryData`): the label/href states listed above (e.g. size 123 456 → `"120.6 KB"`; `{ visible:false }` → `th.editor.subpage.noAccess`, no link).
- Done-check: `pnpm vitest run --project ui src/components/editor`.

**S2.4 `EditorClient`, `PageEditor`, theme, error boundary (PLAN §3.11, FR-523/525/526/530, NFR-05/08c/09).**
- `src/components/editor/EditorClient.tsx` (`'use client'`; replaces the S0 stub, same export) ← `snippets/r3/next-app-pnpm/app/p/[id]/EditorClient.tsx`:
  `const PageEditor = dynamic(() => import('./PageEditor'), { ssr: false, loading: () => <Skeleton variant="rectangular" height={240} /> })`;
  wraps it in `<EditorErrorBoundary>` (class component; fallback = `th.editor.crashed.*` + a "โหลดใหม่" button that remounts via a `key` bump).
- `src/components/editor/PageEditor.tsx` (default export) ← `harness/src/Editor.tsx`:
  ```tsx
  'use client'
  import './editor-theme.css'                 // before BlockNote CSS (doubled selectors win regardless of order, r3 §10)
  import '@blocknote/mantine/style.css'
  export default function PageEditor(props: PageEditorProps) {
    const [doc, setDoc] = useState({ content: props.initialContent, version: props.version, load: 0 })
    const editor = useCreateBlockNote({
      schema, dictionary: thaiDictionary, initialContent: prepareInitialContent(doc.content),
      uploadFile: makeUploadFile({ pageId: props.pageId, notify: toast, limits: props.uploadLimits, getEditor: () => editorRef.current }),
      pasteHandler: makePasteHandler({ notify: toast, limits: props.uploadLimits }),
      tables: { headers: true, cellBackgroundColor: true, cellTextColor: false, splitCells: false },
      links: { onClick: (event) => onLinkClick(event, router) },   // same-origin '/…' → router.push; else window.open(href, '_blank', 'noopener')
    }, [props.pageId, doc.load])
    const reload = async () => { const v = await qc.fetchQuery({ queryKey: qk.page(props.pageId), queryFn: …GET /api/pages/:id, staleTime: 0 })
      setDoc({ content: v.page.content, version: v.page.version, load: doc.load + 1 }) }    // re-create, never replaceBlocks (r3 §3.4)
    useEffect(() => { if (props.reloadToken > 0) void reload() }, [props.reloadToken])        // after applyTemplate (S3.4)
    const save = useAutosave({ editor, pageId: props.pageId, version: doc.version, … })       // S2.6
    const lease = useEditLease({ pageId: props.pageId, canEdit: props.canEdit, … })           // S2.7
    const editable = props.canEdit && lease.mode === 'editing' && !save.blocked
    return (<Box data-testid="page-editor" data-editable={editable}>
      <EditorBanners lease={lease} save={save} onReload={reload} />
      <SaveStatus state={save.status} />                         // data-save-state + th.editor.saveStatus.*
      <BlockNoteView editor={editor} editable={editable} theme={scheme} aria-label={th.editor.label}
        slashMenu={false} emojiPicker={false} filePanel={false} comments={false}
        onChange={() => { fixForeignMedia(editor); save.schedule() }}>
        <SlashMenu editor={editor} ctx={slashCtx} />            // S2.5
        <GridSuggestionMenuController triggerCharacter=":" columns={10} minQueryLength={2} shouldOpen={atWordStart} />
        <MentionMenu editor={editor} />                         // S2.5
        <FilePanelController filePanel={UploadOnlyFilePanel} />
      </BlockNoteView></Box>)
  }
  ```
  `scheme` = MUI `useColorScheme()` resolved (`mode === 'system' ? systemMode : mode`) as the **string** `'light' | 'dark'` (never the object form, r3 G14).
  `fixForeignMedia`: `findForeignMedia(editor.document)` → `editor.replaceBlocks(ids, links)` (r3 §8.3 client post-fix). `toast` = sonner `toast.error`.
- `src/components/editor/UploadOnlyFilePanel.tsx` ← the harness component (only the `อัปโหลด` tab).
- `src/components/editor/editor-theme.css` ← `harness/src/editor-theme.css` with `--bn-ui-base-z-index: 1150`, `--bn-font-family: var(--font-plex-latin), var(--font-plex-thai),
  system-ui, sans-serif` (the variable names from M0's `fonts.ts`), `--bn-colors-*` → `var(--mui-palette-*)`, and `.bn-root .bn-default-styles.bn-default-styles { font-family: var(--bn-font-family) }`;
  plus classes for `.subpage-card`, `.mention`, `.att` using tokens (state never by colour alone: deleted/no-access cards show text, not just grey).
- Done-check: `pnpm vitest run --project ui src/components/editor` · `pnpm eslint src/components/editor src/lib/editor` · `pnpm typecheck` (own paths) ·
  `grep -rn "@blocknote/core/fonts" src` → nothing.

**S2.5 Slash and mention menus (FR-506/520/528/529, AC-501/504, M4-D14/D20).**
- `src/components/editor/slash-menu.tsx` ← `harness/src/slashMenu.tsx`: `getSlashMenuItems(editor, ctx: { createSubpage(): Promise<string | null>; canCreateSubpage: boolean })` —
  find the table item with `'key' in item && item.key === 'table'` (r3 §5.2), replace its `onItemClick` with a 3×3 `tableContent`, then push the custom `หน้า` item
  (`th.editor.slash.subpage`, 📄 icon) only when `ctx.canCreateSubpage` (= `canEdit && depth < 9`). `<SlashMenu>` renders
  `<SuggestionMenuController triggerCharacter="/" shouldOpen={slashShouldOpen} getItems={useCallback(async (q) => rankSuggestionItems(getSlashMenuItems(editor, ctx), q), [editor, ctx])} />`
  (stable `getItems`, r3 G23). `createSubpage` = `unwrap(await createPage({ space, projectId, parentId: pageId }))` → `invalidatePages(qc, { space, projectId })` → id;
  on error `toast.error(th.pages.toasts.createFailed)` and `null` (placeholder removed, M4-D14).
- `src/components/editor/mention-menu.tsx`: `<SuggestionMenuController triggerCharacter="@" shouldOpen={atWordStart} getItems={…} />` where `getItems(q)` (never rejects;
  `catch → []`) merges active people from `qc.fetchQuery({ queryKey: qk.peopleOptions(), … })` (title `displayName`, subtext position, aliases `[name, nickname]`, group
  `th.editor.mention.groupPeople`) with `GET /api/search?q=&titleOnly=1` page hits when `q.trim() !== ''` (group `groupPages`), ranked by `rankSuggestionItems`, max 20; item click →
  `editor.insertInlineContent([{ type: 'mention', props: { kind, id } }, ' '])`.
- Tests first — `src/components/editor/slash-menu.test.ts` (ui, headless editor with the schema): titles include `ตาราง`, `หน้า`, `รูปภาพ`, `ไฟล์แนบ`; `rank(…,'หน้า')[0].title === 'หน้า'`;
  `rank(…,'table')[0].title === 'ตาราง'`; `canCreateSubpage: false` → no `หน้า`; no item titled `หัวข้อ 4`, `วิดีโอ`, `เสียง` (schema excludes them); calling the table item's
  `onItemClick` inserts a table with 3 rows of 3 cells; the `หน้า` item inserts a `subpage` with `pageId ''`, then `'new-id'` after `createSubpage` resolves; resolving `null` removes it.
  `mention-menu.test.tsx`: fetch mocked → `'Ic'` returns Ivy first; inactive people excluded; fetch failure → `[]`.

**S2.6 Autosave, save status, conflict / deleted banners (FR-531, FR-543, M4-D2/D26).** `src/components/editor/useAutosave.ts`, `SaveStatus.tsx`, `EditorBanners.tsx`.
```ts
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export function useAutosave(o: { editor: AppEditor; pageId: string; version: number; enabled: boolean
  onLease(l: LeaseState): void }): { status: SaveState; schedule(): void; flush(): Promise<void>; isDirty(): boolean
  getVersion(): number; blocked: false | 'conflict' | 'deleted' | 'forbidden' }
```
- Baseline = `JSON.stringify(editor.document)` taken right after the editor is (re)created — never the DB JSON (jsonb reorders keys, r3 §12).
- `schedule()` → debounce 800 ms → `flush()`. `flush()`: `json === baseline` → return (editable toggles fire `onChange`, r3 G11); one save in flight at a time (a change during
  the save re-schedules); `unwrap(await savePageContent({ pageId, baseVersion: versionRef.current, content: JSON.parse(json) }))` → baseline = json, version = result, `onLease(result.lease)`,
  status `saved`; `VERSION_CONFLICT` → `blocked 'conflict'` (banner `th.editor.conflict.banner` + button `reload`, editor read-only, never retried); `NOT_FOUND` → `blocked 'deleted'`
  (`th.editor.deletedBanner`); `FORBIDDEN` → `blocked 'forbidden'` (`th.editor.forbiddenBanner`); other errors → status `error`, retry after 5 s or on the next change.
- Flush triggers: `editor.onFocusChange((_e, { focused }) => { if (!focused) void flush() }, { includeEditorUI: true })`; `visibilitychange` → hidden; component unmount
  (in-app navigation; fire-and-forget). `pagehide` while dirty: `body = JSON.stringify({ baseVersion, content })`; `new TextEncoder().encode(body).length ≤ 60_000` →
  `fetch(\`/api/pages/${pageId}/content\`, { method: 'PUT', keepalive: true, headers: { 'content-type': 'application/json' }, body })`; larger → the `beforeunload` handler calls
  `e.preventDefault()` while dirty (browser prompt).
- `SaveStatus`: `<Typography role="status" aria-live="polite" data-save-state={state}>` with `th.editor.saveStatus.saving|saved|error` (nothing for `idle`).
- Tests first — `useAutosave.test.tsx` (fake timers; fake editor `{ document, onFocusChange: () => () => {} }`; `savePageContent` mocked): change at t=0 → nothing at 799 ms, one
  call at 800 ms with `baseVersion 1`; no document change → no call; success `{ version: 2 }` → next call `baseVersion 2`; `VERSION_CONFLICT` → `blocked 'conflict'`, no retry after 10 s;
  `NOT_FOUND` → `blocked 'deleted'`; generic error → `status 'error'`, retried at +5 s; `visibilitychange` (hidden) → immediate call; `pagehide` with a 1 KB doc → `fetch` with
  `{ method: 'PUT', keepalive: true }`; with a 70 KB doc → no `fetch`, `beforeunload` event `defaultPrevented === true`; unmount while dirty → one call.

**S2.7 Edit lease hook + banners (FR-540…542, X63, M4-D3).** `src/components/editor/lease/useEditLease.ts`, `LeaseBanner.tsx`.
```ts
export type LeaseMode = 'loading' | 'editing' | 'held' | 'displaced' | 'viewOnly'
export function useEditLease(o: { pageId: string; canEdit: boolean; getVersion(): number; isDirty(): boolean
  flush(): Promise<void>; onRemoteVersion(v: number): Promise<void> }): { mode: LeaseMode; lease: LeaseState | null; takeover(): Promise<void> }
```
- `canEdit`: `POST /api/pages/:id/lock` on mount, every 30 s (`setInterval`) and immediately on `visibilitychange` → visible. Responses:
  `mine` → if `lease.version > getVersion()` and `!isDirty()` → `await onRemoteVersion(v)` (fresh content) before `editing` (the taker edits only after a fresh fetch);
  not mine while we were `editing` → **displaced**: `await flush()` (accepted while our version is current, X63), mode `displaced`, banner `th.editor.lease.takenOverBy(holder.name)`;
  not mine otherwise → `held`, banner `heldBy(holder.name)` + button `th.editor.lease.takeover`. In `displaced`/`held` keep polling with `POST` (acquires automatically
  once the holder leaves or expires; then the version rule above applies).
- `takeover()` → `POST …/lock?takeover=1` → `await onRemoteVersion(lease.version)` (always re-create from a fresh `GET /api/pages/:id`) → `editing`.
- `!canEdit` (protected for workers, archived): `GET …/lock` every 30 s, mode `viewOnly`; banner `heldBy` when a holder exists; increasing `version` → `onRemoteVersion` (M4-D3).
- Release: `pagehide` and unmount → `fetch(…/lock, { method: 'DELETE', keepalive: true })` when mode was `editing`. Effects are idempotent (React StrictMode double-mount, r3 §12).
- `LeaseBanner`: MUI `Alert` (`severity="info"`/`"warning"`, icon + text — not colour only) with the holder text and the takeover `Button`; `data-testid="lease-banner"`.
- Tests first — `useEditLease.test.tsx` (fake timers, fetch mocked): first POST `mine` → `editing`; +30 000 ms → second POST; `visibilitychange` visible → extra POST; first POST
  not mine (holder Cindy) → `held`, banner text `th.editor.lease.heldBy('Cindy')`; later POST mine with `version 3` (local 2) → `onRemoteVersion(3)` called before `editing`; editing then
  not mine → `flush` called, then `displaced`; `takeover()` → URL ends with `?takeover=1`, then `onRemoteVersion`; `canEdit: false` → only `GET` calls; unmount while editing →
  `DELETE` with `keepalive: true`.

**S2.8 G1.** `pnpm vitest run --project unit src/lib/editor` · `pnpm vitest run --project ui src/components/editor src/lib/editor` · `pnpm eslint src/components/editor src/lib/editor` ·
`pnpm typecheck` (own paths clean). Report requests (e.g. `th.editor` keys added, `data-testid`s S4 relies on: `page-editor`, `subpage-card`, `lease-banner`, `data-save-state`).

### 5.S3 — Page shell, sidebar trees, project tab, palette (frontend-engineer · src/app/(app)/p/**, src/app/(app)/projects/[id]/pages/**, src/components/{pages,palette,shell}/**, project-tabs, src/lib/pages/tree.ts)

MUI 9 only (`slots`/`slotProps`, `sx`, no system props, path icon imports, `next/link` via `@/components/Link`); dense rows use CSS Modules; every
state has text or an icon with an accessible name (never colour alone); strings from `th`; mutations through `useMutation` + `unwrap()`.

**S3.1 Route `/p/[pageId]` (FR-505, X41).**
```tsx
// src/app/(app)/p/[pageId]/page.tsx — Server Component; no loading.tsx in this segment
export default async function PageRoute(props: PageProps<'/p/[pageId]'>) {
  const user = await requirePageUser()
  const { pageId } = await props.params
  const view = await orNotFound(getPageView(db, user, pageId))   // authz first, before any Suspense → real 404 status
  return <PageScreen view={view} />
}
```
`src/app/(app)/p/[pageId]/not-found.tsx` → `EmptyState` with `th.pages.notFound.{title,body}` and a link `back` → `/home`. A malformed id or a deleted page is a 404.
The page body has a max content width (≈ 900 px), full width on phones (readable on mobile, NFR-07b).

**S3.2 `PageScreen` and header (FR-504, FR-509, FR-510).** `src/components/pages/`:
- `PageScreen.tsx` (`'use client'`): local state `{ title, icon, cover, locked, effectiveProtected, reloadToken }` seeded from `view`; renders `CoverImage`, a header row
  (`IconPicker`, `PageTitle`), `Breadcrumbs`, `PageActionsMenu`, banners (`th.pages.protectedBanner` when `effectiveProtected && !can.edit`, `th.pages.archivedBanner` when
  `projectArchived`; MUI `Alert` with icon + text), `TemplateChooser` (S3.4) and `<EditorClient … canEdit={view.can.edit} reloadToken={reloadToken} />`.
- `Breadcrumbs.tsx`: MUI `Breadcrumbs` `aria-label={th.pages.breadcrumbLabel}`: root = `th.pages.wikiRoot` (WORKSPACE, not a link) or the project name → `/projects/<id>/pages`;
  then `view.breadcrumb` (icon + title or `th.pages.untitled`, links to `/p/<id>`); current page last with `aria-current="page"`.
- `PageTitle.tsx`: borderless `InputBase` (`slotProps.input` with `aria-label={th.pages.titleLabel}`, placeholder `th.pages.untitled`, `maxLength 200`), read-only unless `can.edit`;
  commit on blur and 600 ms after typing stops → `renamePage` → `invalidatePages(qc, scope)` + `invalidatePage(qc, id)`; Enter commits and moves focus to the editor; IME-safe
  (`e.nativeEvent.isComposing`). Focused automatically when the title is `''` after applying the SOP template.
- `IconPicker.tsx`: `IconButton` (`aria-label={th.pages.icon.button}`) showing the icon or 📄; MUI `Popover` with a grid of `PAGE_ICONS` buttons (each `aria-label` = the emoji)
  and `th.pages.icon.remove`; select → `setPageIcon` (optimistic local state, rollback + toast on error).
- `CoverImage.tsx`: when `cover` → `<img src={cover.url} alt={th.pages.cover.alt}>` (full width, 200 px high, `object-fit: cover`) + buttons `change`/`remove` for editors;
  no cover + `can.edit` → text button `th.pages.cover.add`. Upload: hidden `<input type="file" accept={IMAGE_MIME.join(',')}>` → `fetch('/api/files', { method: 'POST',
  body: FormData{ file, pageId, purpose: 'cover' } })` → `setPageCover({ pageId, fileId })`; errors → toast (`th.editor.upload.*`).
- `PageActionsMenu.tsx` (`IconButton` `aria-label={th.pages.menu(title)}` + MUI `Menu`): `th.pages.duplicate` (`can.duplicate`) → `duplicatePage` → toast
  `th.pages.toasts.duplicated(title)` with an action "เปิด" → `/p/<copy>`; `th.pages.delete` (`can.delete`; hidden for the charter) → `deletePage` → undo entry (below) →
  `router.push(parent ? '/p/<parentId>' : space === 'PROJECT' ? '/projects/<id>/pages' : '/home')`; `th.pages.protect` / `unprotect` (only `can.protect`) → `setPageProtected` →
  toast `th.pages.toasts.protected|unprotected`.
- Undo entry for every page delete (sidebar or menu): `undo.push({ label: th.pages.toasts.deleted(title, count), undo: () => unwrap(restorePageBatch({ batch })).then(() => invalidatePages(qc, scope)),
  redo: async () => { batch = unwrap(await deletePage({ pageId })).batch } }, { toast: th.pages.toasts.deleted(title, count) })` — no confirm dialog (P2, X04).
- Tests first (`ui`): `Breadcrumbs.test.tsx` (wiki root text, two ancestors in order, current `aria-current="page"`, PROJECT root links to `/projects/<id>/pages`);
  `IconPicker.test.tsx` (60 emoji buttons; clicking 📌 calls the mocked `setPageIcon({ pageId, icon: '📌' })`; remove → `icon: null`); `PageActionsMenu.test.tsx` (charter: no
  delete item; worker on a protected page: only duplicate; manager on a wiki page: protect item; delete calls `deletePage` and `undo.push` with the toast
  `th.pages.toasts.deleted('ก', 2)` for a page with 2 descendants).

**S3.3 Sidebar: search button, Wiki ทีม, project page trees (FR-503, FR-506, UI-01/02, M4-D23/D27).**
- `src/lib/pages/tree.ts` (pure): `export interface TreeRow extends FlatItem { node: PageTreeNode }`;
  `flattenPageTree(roots: readonly PageTreeNode[], children: ReadonlyMap<string, readonly PageTreeNode[]>, expanded: ReadonlySet<string>): TreeRow[]` (DFS; a node's children appear
  only if it is expanded **and** loaded); `toggleExpanded(prefValues: readonly string[], pageId: string, open: boolean): string[]` (keeps `project:` values, adds/removes `page:<id>`,
  max 500). Tests `tree.test.ts` (unit): roots `[A(hasChildren), B]`, children `A → [A1(hasChildren)]`, `A1 → [A11]`: expanded `{A}` → ids `[A, A1, B]` with depths `[0,1,0]`;
  `{A, A1}` → `[A, A1, A11, B]`; `{A1}` → `[A, B]`; `toggleExpanded(['project:p'], 'x', true)` → `['project:p', 'page:x']`, then `false` → `['project:p']`.
- `src/components/pages/PageTree.tsx` (used by the sidebar and the project tab; props `{ space, projectId, label, variant: 'sidebar' | 'full' }`):
  roots `useQuery(qk.pagesTree(space, projectId, null))`; for each expanded + visible node `useQueries` on `qk.pagesTree(space, projectId, id)` (`GET /api/pages/tree?space&projectId&parentId`);
  expanded ids from `usePreferences()` `sidebar.expanded`; rows rendered through M3's `SortableTree` with `items = fullItems = flattenPageTree(...)`, `maxDepthIndex = 9`,
  `disabled = !roots.canCreate`, `onMove = (m) => movePage({ pageId: m.id, parentId: m.parentId, afterId: m.afterId })` → success `invalidatePages(qc, scope)`; error →
  `toast.error(error.message)` + invalidate (server is the authority, M4-D23).
  Row (`renderRow`, `PageTree.module.css`, `role="treeitem"` inside `role="tree"` `aria-label={label}`, `aria-level`, `aria-expanded` when `hasChildren`): drag handle
  (`aria-label={th.pages.tree.dragHandle}`; omitted for rows the viewer cannot move: worker + `effectiveProtected`, or the charter in non-root targets is left to the server);
  expand toggle (`th.pages.tree.expand/collapse(title)`) → `setPreference('sidebar.expanded', toggleExpanded(...))`; icon (or 📄); title `Link` to `/p/<id>` (`aria-current="page"`
  when the pathname matches); 🔒 `LockOutlined` with `role="img"` + `aria-label={th.pages.protectedIcon}` when `effectiveProtected`; hover/focus actions: `+`
  (`aria-label={th.pages.addChild(title)}`, only if the row is editable and `depth < 9`) → `createPage({ space, projectId, parentId: id })` → expand the parent → navigate to
  `href`; `⋯` → the same menu items as S3.2 (duplicate, delete with undo, protect for managers). Invalid drop shows `th.pages.tree.dropInvalid` (text + icon, from M3's
  `SortableTree` invalid state). Loading → skeleton rows; error → `th.pages.tree.loadError` + `retry`; empty → `th.pages.tree.empty`.
- `src/components/shell/SidebarSearchButton.tsx`: full-width button with `SearchOutlined`, `th.palette.open` and a `<kbd>` `th.palette.shortcut` → `usePalette().open()`
  (collapsed rail: icon only + `Tooltip`).
- Edit M0/M2 `src/components/shell/Sidebar.tsx`: search button at the top; after the projects section a **Wiki ทีม** section: header `th.sidebar.wikiHeading` + `+`
  (`aria-label={th.sidebar.newWikiPage}`, every user) → `createPage({ space: 'WORKSPACE', projectId: null, parentId: null })` → navigate; body `<PageTree space="WORKSPACE"
  projectId={null} label={th.pages.tree.wikiLabel} variant="sidebar" />`.
- Edit M2 `src/components/shell/SidebarProjects.tsx`: an expanded project shows its tab sub-links (now incl. เอกสาร) and then `<PageTree space="PROJECT" projectId={p.id}
  label={th.pages.tree.projectLabel(p.name)} variant="sidebar" />` (+ a small `+` `aria-label={th.sidebar.newProjectPage(p.name)}` when `canCreate`).
- Tests first (`ui`) — `src/components/pages/PageTree.test.tsx` (QueryClient seeded with `qk.pagesTree(...)` data, actions mocked): link order follows `position`; the protected
  row has `img` named `th.pages.protectedIcon`; as a worker that row has no `+` button and no drag handle; expand click calls `setPreference('sidebar.expanded', ['page:<id>'])`;
  `+` calls `createPage` with `parentId` and then `router.push('/p/<new>')`; the charter row's menu has no `th.pages.delete`. `src/components/shell/Sidebar.test.tsx` (extend):
  search button present with text `th.palette.open`; Wiki ทีม heading present for a worker; `+` for wiki present for a worker.

**S3.4 Template chooser (FR-507, M4-D7).** `src/components/pages/TemplateChooser.tsx`: shown when `view.page.isBlank && can.edit` (and hidden once the page has content or
a title, tracked locally); heading `th.pages.templates.heading`; four `Button`s `blank`, `charter`, `meeting`, `sop` (`blank` only hides the row). Others →
`applyTemplate({ pageId, baseVersion: currentVersion, template })` → update local `title`/`icon`, `reloadToken + 1` (editor re-fetches), `invalidatePages`; for `sop` focus the title.
`currentVersion` comes from the editor's latest saved version (an `onVersion` callback prop on `EditorClient` is **not** needed: use `qc.fetchQuery(qk.page(id))` right before the call
when the editor has saved since load). On `VERSION_CONFLICT` → toast `th.editor.conflict.banner` and hide the chooser. Test `TemplateChooser.test.tsx`: 4 buttons; click
`th.pages.templates.meeting` → `applyTemplate({ pageId, baseVersion: 1, template: 'meeting' })` and `onApplied` called; `blank` → no call, row hidden.

**S3.5 Command palette shell (FR-1102/1105 pages part, KEY-01, X08, X49).**
- `src/components/palette/PaletteProvider.tsx`: context `{ isOpen, open(), close(), toggle() }`; registers `useHotkeys([{ hotkey: HOTKEYS.palette, handler: toggle, allowInEditable: true }])`
  — `useHotkeys` already returns early on `e.defaultPrevented` (BlockNote's link shortcut wins while text is selected, r3 G16).
- `src/components/palette/CommandPalette.tsx` ← `plan/research/snippets/r4/client/components/palette/CommandPalette.tsx` with: open state from the provider (no own
  window listener); `useQuery({ queryKey: qk.search(deferred), queryFn: ({ signal }) => getJson<SearchResponse>(\`/api/search?q=${encodeURIComponent(deferred)}\`, { signal }),
  enabled: isOpen && deferred.length > 0, staleTime: 30_000, placeholderData: keepPreviousData })`; `<Dialog … slotProps={{ paper: {…}, transition: { onEntered } }} aria-label={th.palette.dialogLabel}>`;
  `<Command label={th.palette.dialogLabel} shouldFilter={false} loop vimBindings={false}>`; `<Command.Group heading={th.palette.groups.pages}>` with items
  `value={\`page:${id}\`}` showing icon, title (or `th.pages.untitled`), subtitle and, for content hits, `th.palette.matchedInContent`; empty query → `th.palette.hint`;
  `Command.Empty` → `th.palette.empty`; `Command.Loading` → `th.palette.loading`; select → close + `router.push(href)`. Extensible (M4-D37e): groups are
  rendered from `PALETTE_GROUPS` in `src/components/palette/groups.tsx`, items by `PaletteItemRow.tsx`:
  ```tsx
  export interface PaletteItem { value: string; href: string; title: string; subtitle?: string; icon?: ReactNode; chips?: string[] }
  export interface PaletteGroupDef { key: keyof SearchResponse; heading: string; map(input: { server: SearchResponse | undefined }): PaletteItem[] }
  export const PALETTE_GROUPS: readonly PaletteGroupDef[] = [
    { key: 'pages', heading: th.palette.groups.pages, map: ({ server }) => (server?.pages ?? []).map((h) => ({ value: `page:${h.id}`, href: h.href,
        title: h.title || th.pages.untitled, subtitle: h.subtitle, icon: h.icon ?? '📄', chips: h.matchedIn === 'content' ? [th.palette.matchedInContent] : [] })) },
  ]
  // CommandPalette: PALETTE_GROUPS.map((g) => { const items = g.map({ server: data }); return items.length > 0 && <Command.Group key={g.key} heading={g.heading}>… })
  ```
  M8 renders its `CommandsGroup` (from `PALETTE_COMMANDS`, `src/components/palette/commands.ts`) **before** these groups and it renders nothing when no command
  is visible (X88); M10 appends four entries (adding optional `source`/`local` fields, its `map` input a superset of `{ server }`) and extends `SearchResponse`
  with new keys additively; neither restructures this file, so keep the names, `key: keyof SearchResponse` and the `map` input object exactly.
- Mount `<PaletteProvider>` + `<CommandPalette />` in M0's `src/components/shell/AppShell.tsx` (inside the providers, once).
- Tests first — `src/components/palette/CommandPalette.test.tsx` (ui; fetch mocked; router mocked): `keyDown(document.body, { code: 'KeyK', key: 'k', ctrlKey: true })` → dialog
  `th.palette.dialogLabel` open, input focused; typing `ลูกค้า` → inside the group `th.palette.groups.pages` two options (by name) in server order, the
  content hit carrying the chip `th.palette.matchedInContent`; `ArrowDown` + `Enter` → `router.push` with the second `href`, dialog closed; `Escape` closes;
  a keydown whose `defaultPrevented` is already true does not open; Ctrl+K while focus is in an `<input>` opens; empty input shows `th.palette.hint`.

**S3.6 Project tab "เอกสาร" (FR-408 part, X15).** `src/components/projects/project-tabs.ts`: extend `ProjectTabId` with `'pages'` and append
`{ id: 'pages', order: 3, label: th.projects.tabs.pages }` (M2-D10 scale 0/1/2/3: ภาพรวม 0, แผนงาน 1 from M6, งาน 2 from M3, เอกสาร 3). `src/app/(app)/projects/[id]/pages/page.tsx` (RSC; authz is in the M2
layout before any Suspense): `const { id } = await props.params` → `<ProjectPagesView projectId={id} />` (client, `src/components/pages/ProjectPagesView.tsx`: heading
`th.pages.projectTab.heading`, button `th.pages.projectTab.newPage` when `canCreate` → `createPage` root → navigate, and `<PageTree variant="full" …>`; empty →
`th.pages.projectTab.empty`). Update `ProjectTabs.test.tsx`: tabs `['ภาพรวม', 'งาน', 'เอกสาร']` in order (via `th`; M6 adds แผนงาน at order 1, X84), `เอกสาร` selected on segment `pages`.

**S3.7 G1.** `pnpm vitest run --project ui src/components/pages src/components/palette src/components/shell src/components/projects` ·
`pnpm vitest run --project unit src/lib/pages/tree.test.ts` · `pnpm eslint "src/app/(app)/p" "src/app/(app)/projects/[id]/pages" src/components/pages src/components/palette src/components/shell` ·
`pnpm typecheck` (own paths clean). Report requests (e.g. preference-key changes, i18n keys).

### 5.S4 — Authz rows, masking, e2e (test-engineer · `tests/authz/**`, `e2e/**`)

Written **from SPEC §3.2/§3.3 and this file before S1 finishes** (PLAN §4.1): rows and leak cases are red while S1's stubs
throw `not implemented: M4 S1`, green at G2. Uses the S0.15 world (`createWorld({ with: ['pages', 'files'] })`), `asUser`,
`outcomeOf` / `outcomeOfCall`, `uploadRequest`, `callRoute` and the byte fixtures of `tests/helpers/files.ts`. `M` manager ·
`L` lead (LEAD of P and A) · `Me` member (MEMBER of P and A) · `W` outsider (MEMBER of Q only). For every `mutates: true` +
`allow` pair the matrix asserts exactly one new `audit_log` row with the row's `audit.entity` (`'page'` / `'file'`) and
`project_id` (P, A or `null` for wiki) — X44, M4-D5. Lease rows are `mutates: true, audit: false` (X44: leases are not
audited). Never retype Thai UI text: import `th`; world titles come from `w.pages.*.title`.

**S4.1 Harness additions (`tests/authz/types.ts`, `tests/authz/matrix.int.test.ts`, `tests/authz/rows/_m4.ts`).**
- Read M1–M3's `types.ts` / `matrix.int.test.ts` first and keep their shape. If `AuthzRow` has no way to request world parts,
  add `with?: WorldPart[]` (default `[]`) and let the matrix call `createWorld({ with: row.with ?? [] })`; if M3 already added an
  equivalent (e.g. a file-level default), reuse it and do not add a second mechanism. If S0.5 did not extend `Outcome`, add
  `'413' | '415'` here (S0's `outcome.ts` already maps the statuses).
- `tests/authz/rows/_m4.ts` (shared helpers for the four row files, no rows):
  ```ts
  export const PROJ = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<Role, Outcome>   // PERM-16
  export const ARCH_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const                                  // X42
  export const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const                                  // PERM-17/18
  export const MGR = { M: 'allow', L: '403', Me: '403', W: '403' } as const                                       // PERM-18 protected, PERM-19
  export const each = (o: Outcome) => ({ M: o, L: o, Me: o, W: o })
  export const PAGES = ['pages', 'files'] as const satisfies readonly WorldPart[]
  export const para = (text: string) => [{ type: 'paragraph', content: text }]
  export const pageGet = (id: string) => callRoute(GET_PAGE, { method: 'GET', url: `http://localhost/api/pages/${id}`, params: { id } })
  export const lockCall = (method: 'GET' | 'POST' | 'DELETE', id: string, q = '', headers?: HeadersInit) =>
    callRoute(LOCK[method], { method, url: `http://localhost/api/pages/${id}/lock${q}`, params: { id }, headers })
  export const keepalive = (id: string, body: unknown, headers?: HeadersInit) =>
    callRoute(PUT_CONTENT, { method: 'PUT', url: `http://localhost/api/pages/${id}/content`, params: { id }, body, headers })
  export const fileGet = (id: string) => callRoute(GET_FILE, { method: 'GET', url: `http://localhost/api/files/${id}`, params: { id } })
  export const upload = (o: Parameters<typeof uploadRequest>[0]) => POST_FILE(uploadRequest(o))
  export const currentVersion = async (pageId: string) => (await db.select({ v: pages.version }).from(pages).where(eq(pages.id, pageId)))[0]!.v
  ```
  (`GET_PAGE`, `LOCK`, `PUT_CONTENT`, `GET_FILE`, `POST_FILE` are the route exports from `src/app/api/{pages,files}/**/route.ts`.)
- `matrix.int.test.ts › meta`: every M4 row id is unique, every `mutates` row declares `audit` (`{ entity }` or `false`), and every
  PERM-16…19 id appears at least once (keeps "every §3.2 line has a row", PLAN §4.4).
- Generic loops already in M1's harness run every new row as `asNobody()` → `'401'` and as a must-change user → `'403'`.

**S4.2 `tests/authz/rows/pages.ts` (PERM-16, PERM-06 part, PERM-19 on project pages, UNDO-5)** — the full table is §7.2
(keys `PG-*`). Examples (every row has `with: PAGES`):
```ts
{ id: 'PERM-16', key: 'PG-SAVE', spec: '§3.2 แก้หน้าเอกสารในโปรเจค (save)', action: 'savePageContent', mutates: true,
  audit: { entity: 'page' }, expect: PROJ, with: PAGES,
  run: (w) => savePageContent({ pageId: w.pages.pPage.id, baseVersion: 1, content: para('แก้ใหม่') }) },
{ id: 'PERM-16', key: 'PG-MOVE-X', spec: '§3.2 + M4-D31 parent in another project', action: 'movePage', mutates: true,
  audit: false, expect: { M: '400', L: '404', Me: '404', W: '404' }, with: PAGES,
  run: (w) => movePage({ pageId: w.pages.pChild.id, parentId: w.pages.qPage.id, afterId: null }) },
{ id: 'PERM-16', key: 'PG-LOCK-TAKEOVER', spec: '§3.2 + FR-542 (lease held by someone else)', action: 'POST /api/pages/[id]/lock?takeover=1',
  mutates: true, audit: false, expect: PROJ, with: PAGES,
  setup: async (w, actor) => { const holder = actor.id === w.lead.id ? w.member : w.lead
    await db.insert(pageLocks).values({ pageId: w.pages.pPage.id, userId: holder.id, expiresAt: sql`now() + interval '2 minutes'` }) },
  run: (w) => lockCall('POST', w.pages.pPage.id, '?takeover=1') },
```
If `AuthzRow` has no `key`, put the key at the start of `spec` (`'PG-SAVE · §3.2 …'`) — do not change the harness shape (as M3 S4.1).
Rows whose call is denied before any write still say `mutates: true` with `audit: { entity }` (the harness checks audit only on
`allow`); rows that are reads say `mutates: false`.

**S4.3 `tests/authz/rows/wiki.ts` (PERM-17, PERM-18, PERM-19).** Keys `WK-*` (§7.2): the unprotected wiki page is open to all four
roles for view/create/edit/move/duplicate/delete/restore/lease/keepalive (M4-D24, r6a M4-06: workers may delete unprotected wiki
pages); every write on `wikiProtected`, on `wikiProtectedChild` (inherited protection, X63) and on `wikiFolder` (unprotected root
whose subtree holds a protected page) is `MGR`; `setPageProtected` on wiki pages is `MGR`. Setup for `WK-PROT-SAVE` reads the
current version with `currentVersion(w.pages.wikiProtected.id)` (it is 1 in a fresh world; do not hard-code if S0's world saved it).

**S4.4 `tests/authz/rows/files.ts` (PERM-16 files part, PERM-17/18 wiki files, FILE-1/6, AC-503).** Keys `FL-*` (§7.2). Uploads go through
`upload({ pageId, name, bytes, purpose?, origin? })`; downloads through `fileGet(id)`; the order inside `POST /api/files` is
`assertSameOrigin` → size/length checks → form parse → `requirePage(edit)` → classify, so a forbidden type is `415` for members but
still `404` for the outsider (authz first). `FL-DOWNLOAD-Q` pins "authorised by `files.project_id`": manager allow, lead/member 404,
outsider allow. `FL-DOWNLOAD-DELETED-PAGE` pins M4-D17 (the originating page's soft delete is ignored).

**S4.5 `tests/authz/rows/search.ts` (PERM-06 / FR-1104 pages part).** `SR-PAGES` `GET /api/search?q=หน้า`, `SR-TITLE-ONLY`
`?q=หน้า&titleOnly=1`, `PG-TITLES` `GET /api/pages/titles?ids=<pPage>,<wiki>` → `ALL` (results are filtered, verified by S4.6);
`SR-EMPTY` `?q=` and `PG-TITLES-400` `?ids=x` → `each('400')`. `M10` extends this file with the other categories (X68).

**S4.6 Masking leak cases (`tests/authz/masking.int.test.ts › describe('pages (M4)')`, r7 §H M4 row, X30/X43, M4-D32).** World `with:
['pages','files']` plus, in `beforeEach`, a wiki page "อ้างอิง W-06" whose content mentions `pPage` and holds a `subpage` card to
`pChild` (plain Drizzle via `makePage`). `forbiddenP` = the titles of `pCharter`, `pPage`, `pChild`, `aPage`, the deleted P root
("ลบแล้ว P"), `'เนื้อหา P-ลับ06'`, `'สัญญา.pdf'`, P's and A's project names, and the ids of `pCharter`, `pPage`, `pChild`, `aPage`,
`w.files.pImage`, `w.files.pPdf`, `w.files.aFile`. `assertNoLeak(body, forbidden)` from M2.

| # | Viewer | Request | Must be absent | Must be present |
|---|---|---|---|---|
| K1 | outsider | `GET /api/search?q=ลับ` | `forbiddenP` | `w.pages.qPage.title`; `matchedIn: 'title'` |
| K2 | outsider | `GET /api/search?q=เนื้อหา` (content path, ≥ 3 chars) | `forbiddenP` | Q's page id with `matchedIn: 'content'` |
| K3 | outsider | `GET /api/search?q=หน้า&titleOnly=1` (mention suggestions) | `forbiddenP` | Q page hit; no `matchedIn: 'content'` |
| K4 | outsider | `GET /api/search?q=W-0` | `forbiddenP` | `w.pages.wiki.title`, `w.pages.wikiProtected.title` (subtitle `th.palette.wiki`) |
| K5 | outsider | `GET /api/pages/titles?ids=<pPage>,<pChild>,<aPage>,<deleted P root>,<qPage>,<wiki>` | every title/icon of the P/A ids; the P/A items are exactly `{ id, visible: false }` | `qPage` + `wiki` titles |
| K6 | outsider | `GET /api/pages/tree?space=PROJECT&projectId=<P>` · `?parentId=<pPage>` with `space=PROJECT&projectId=<Q>` | `forbiddenP` (status 404, error body only) | — |
| K7 | outsider | `GET /api/pages/<pPage>` · `GET /api/pages/<pPage>/lock` | `forbiddenP`, lead's lease row | status 404 |
| K8 | outsider | `GET /api/files/<pImage>` · `<pPdf>` · `<aFile>` | file bytes, `'สัญญา.pdf'`, `content-disposition` header | status 404 |
| K9 | outsider | `GET /api/pages/tree?space=WORKSPACE` · `GET /api/pages/<"อ้างอิง W-06">` | titles of P pages (the page content may carry the P **ids**, M4-D32) | wiki titles; the mention/subpage ids unchanged in `content` |
| K10 | outsider | `GET /api/pages/titles?ids=` the two ids found in K9's content | P titles | `{ visible: false }` × 2 |
| K11 | member | `GET /api/search?q=ลับ` · `q=เนื้อหา` | `'หน้า Q-ลับ08'`, `'เนื้อหา Q-ลับ09'`, Q's name, `qPage.id`, `qFile.id` | P titles incl. `aPage` (archived member project, X43) |
| K12 | member | `GET /api/files/<qFile>` · `GET /api/pages/<qPage>` · titles `?ids=<qPage>` | Q titles, bytes | 404 · 404 · `{ visible: false }` |
| K13 | lead | `createPage({ space:'PROJECT', projectId: P, parentId: qPage })`, `movePage(pChild → qPage)` | Q title/ids other than the one sent | `NOT_FOUND` (M4-D31) |
| K14 | outsider | `GET /api/search?q=%` · `q=_` (escaping) | `forbiddenP`; no row whose title lacks `%`/`_` | — |

Also extend the M2 `GET /api/sidebar` leak case only if S3 adds page data to it (it should not: trees are separate queries, M4-D29).

**S4.7 E2E fixtures and support (`e2e/fixtures.ts`, `e2e/support/**`, `e2e/fixtures/**`).**
- `e2e/fixtures.ts` (M1/M2's): **verify** that M1's `resetDb()` already empties `UPLOAD_DIR` (`.e2e-uploads`, X91) — no M4 change
  before seeding (the server recreates sub-folders on demand); `idOf('page', title)` → newest live page id with that title
  (alongside M2's `'project' | 'client' | 'user'`); `pageIdFromUrl(page)` → the uuid of `/p/<uuid>`. Golden seed already contains
  the 5 charters (`seedGolden` M4 part, S1.9) — nothing to add for them.
- `e2e/support/seed-pages.ts` (plain Drizzle, X56 — services/repo are importable but not needed):
  ```ts
  export async function insertPage(db: Db, o: { space: 'WORKSPACE' | 'PROJECT'; projectName?: string; parentTitle?: string
    title: string; byNickname: string; locked?: boolean; icon?: string | null; content?: unknown[] }): Promise<string>
  // resolves project/parent/user ids by name, depth = parent.depth + 1, position = generateKeyBetween(lastSibling, null),
  // content_text = extractContentText(content ?? []), created_by = updated_by = user; returns the id
  ```
- `e2e/support/clipboard.ts`:
  ```ts
  export async function syntheticPaste(page: Page, items: Record<string, string>, files: { name: string; type: string; b64: string }[] = []): Promise<void>
  // r3 §14.2 verbatim: new DataTransfer → setData / items.add(new File(...)) → .bn-editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles, cancelable }))
  export async function realClipboardImage(page: Page, b64Png: string): Promise<void>
  // page.evaluate: const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' });
  //   await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])   (permissions from playwright.config, r4 §41)
  export async function dropFile(page: Page, file: { name: string; type: string; b64: string }): Promise<void>
  // r3 §14.2 DragEvent('drop') on .bn-editor at the centre of the last block
  export const PNG_1X1_B64: string        // same bytes as tests/helpers/files.ts PNG_1X1
  export const PDF_B64: string            // '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' base64
  ```
- `e2e/fixtures/excel-4x3.html` + `excel-4x3.tsv` — Windows Excel 15 clipboard shape (r3 §14.2): `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel">`, `<meta name=ProgId content=Excel.Sheet><meta name=Generator content="Microsoft Excel 15">`,
  a `<style>` block with `.xl65{font-weight:700}`, `<table border=0 cellpadding=0 cellspacing=0 width=384>` and between
  `<!--StartFragment-->`/`<!--EndFragment-->` 3 rows × 4 `<td>` cells (first row `class=xl65`): `ชื่อ | ตำแหน่ง | โปรเจค | วัน` ·
  `Cindy | Project Manager | POS Upgrade | 2.5` · `Ivy | QA | CRM Migration | 1,000`. The `.tsv` is the same grid, tab-separated, CRLF, trailing CRLF.
- `e2e/fixtures/excel-markdownish.html` + `.tsv` — 3 × 2 grid `ชื่อ | งาน` · `Cindy | task_name_1` · `Ivy | 1. วางแผน` (stock BlockNote turns it into one
  paragraph, r3 §7.3); `e2e/fixtures/tsv-only-markdownish.txt` — the same grid as TSV with no HTML; `e2e/fixtures/gsheets-3x2.html` —
  `<google-sheets-html-origin><style>…</style><table xmlns="http://www.w3.org/1999/xhtml" dir="ltr" …><tbody>` 3 × 2 with `<span style="font-weight:bold">`.
  Expected cells are **parsed from the `.tsv`/`.txt` files in the spec** (`readFileSync(...).trimEnd().split(/\r?\n/).map((l) => l.split('\t'))`),
  never retyped. (Thai text is allowed in fixtures; ESLint's Thai ban covers `src/**` only — M0 S0.7.)

**S4.8 Page objects (`e2e/pages/*.ts`).**
- `e2e/pages/editor.ts` — `class EditorPage`:
  `root()` = `getByTestId('page-editor')`; `content()` = `page.locator('.bn-editor')`; `isEditable()` = `root()` `data-editable` === `'true'`;
  `expectReadOnly()` = `content()` has `contenteditable="false"`; `focusEnd()` (click the last block, `End`);
  `slash(q)` (type `/` + q, wait `.bn-suggestion-menu`); `slashTitles()` = `.bn-mt-suggestion-menu-item-title` texts; `pickSlash(title)`;
  `tables()` = `content().locator('table')`; `tableShape(i)` → `{ rows, cols }` from `tr` / first-row `td,th` counts; `cellTexts(i)` → `string[][]`;
  `addColumnRight(i)` (hover a cell → `.bn-table-handle` of the column → menu item `th.editor.blocknote.table_handle.add_right_menuitem`);
  `toggleHeaderRow(i)` (row handle → `th.editor.blocknote.table_handle.header_row_menuitem` — exact key from the S0.9 dictionary copy);
  `images()` = `content().locator('img')`; `attachments()` = `content().locator('[data-content-type="file"]')`;
  `subpageCards()` = `getByTestId('subpage-card')`; `mentionChips()` = `content().locator('.mention')`;
  `saveState()` = `getByRole('status')` inside `root()` (`data-save-state`); `waitSaved()` = expect `data-save-state` = `saved`;
  `leaseBanner()` = `getByTestId('lease-banner')`; `takeover()` = button `th.editor.lease.takeover`;
  `pokeLease()` = `page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))` (document stays visible → the hook POSTs, M4-D35);
  `conflictBanner()` = `getByText(th.editor.conflict.banner)`; `reloadAfterConflict()` = button `th.editor.conflict.reload`.
- `e2e/pages/page-screen.ts` — `class PageScreen`: `goto(id)` (returns the `Response` for 404 checks); `titleInput()` =
  `getByRole('textbox', { name: th.pages.titleLabel })`; `rename(text)` (fill + Enter, waits for the tree to show it);
  `breadcrumb()` = `getByRole('navigation', { name: th.pages.breadcrumbLabel })`; `iconButton()` = button `th.pages.icon.button`;
  `pickIcon(emoji)`; `addCover(b64Png)` (`setInputFiles` on the hidden input next to `th.pages.cover.add`); `cover()` = `getByRole('img', { name: th.pages.cover.alt })`;
  `menu()` = button `th.pages.menu(title)`; `menuItem(label)`; `templateButtons()` = buttons inside the region headed `th.pages.templates.heading`;
  `protectedBanner()` = `getByText(th.pages.protectedBanner)`; `notFound()` = `getByText(th.pages.notFound.title)`; `editor` = `new EditorPage(page)`.
- `e2e/pages/page-tree.ts` — `class PageTreePanel(page, label)`: `tree()` = `getByRole('tree', { name: label })`; `item(title)` =
  `getByRole('treeitem', { name: new RegExp(escape(title)) })`; `level(title)` (`aria-level`); `toggle(title)` (button `th.pages.tree.expand/collapse(title)`);
  `addChild(title)` (hover → button `th.pages.addChild(title)`); `openMenu(title)` (button `th.pages.menu(title)`); `lockIcon(title)` =
  `getByRole('img', { name: th.pages.protectedIcon })` inside the item; `dragOnto(title, targetTitle, dx = 0)` (handle `th.pages.tree.dragHandle`, `mouse.down/move(steps: 5)/up`
  as M3's `dragRow`); `titles()` (visible order).
- `e2e/pages/palette.ts` — `class Palette`: `openByKeyboard()` = `keyboard.press('ControlOrMeta+KeyK')`; `openByButton()` = sidebar button `th.palette.open`;
  `dialog()` = `getByRole('dialog', { name: th.palette.dialogLabel })`; `input()` = `getByRole('combobox')` in the dialog;
  `group(heading)` = `dialog().getByRole('group', { name: heading })` (cmdk 1.1 renders `[cmdk-group-items] role="group"` with `aria-labelledby` = the
  heading — not verified in r4; if the name does not resolve, use `dialog().locator('[cmdk-group]').filter({ has: page.locator('[cmdk-group-heading]', { hasText: heading }) })`
  and record it in the report);
  `pageResults()` = `group(th.palette.groups.pages).getByRole('option')`; `option(name)` = `dialog().getByRole('option', { name })`
  (string or RegExp). No index-based `choose(i)` and no whole-dialog option count (M4-D37d) — M8/M10 add groups to the same dialog; M10 extends this
  file instead of redefining these methods.
- Extend `e2e/pages/sidebar.ts` (M0–M3): `searchButton()`, `wiki()` → `new PageTreePanel(page, th.pages.tree.wikiLabel)`, `newWikiPage()` = button
  `th.sidebar.newWikiPage`, `projectTree(name)` → `PageTreePanel(page, th.pages.tree.projectLabel(name))`, `newProjectPage(name)`.
  Extend M2's `e2e/pages/project.ts`: `openTab('pages')` (tab `th.projects.tabs.pages`), `newPageButton()` = `th.pages.projectTab.newPage`.

**S4.9 `e2e/m4-pages.spec.ts`** — scenarios E1–E19 exactly as §7.3. One `describe` per scenario group with
`test.describe.configure({ mode: 'serial' })` and `test.beforeAll(() => resetDb(...))` where §7.3 marks ⟲; `loginAs(page, …)` per
test (two-user scenarios create a second context with `browser.newContext()` and their own `loginAs`); the M0 fixture pins the clock
(`setFixedTime(2026-09-30T10:00:00+07:00)`), so only E17 calls `page.clock.install` (M4-D35). Describes that expect 404 navigations or
deliberate 4xx fetches set `test.use({ allowedConsoleErrors: [/status of 404/] })` (E4, E14, E16) or `[/status of 415/]` (E13) — nothing broader.
The external-request guard stays on for every test: E19 relies on it to prove no external image was ever requested. Strings from `th`,
dates via `formatThaiDate` (`src/lib/format.ts`), numbers via `formatBytes` (`src/lib/files/format-bytes.ts`). Persistence is asserted after
`page.reload()` through the DOM and, where the DOM is ambiguous, through `page.request.get('/api/pages/<id>')` (`PageView.page.content`) —
never through a `window.__bn` global (S2 forbids it).

**S4.10 Update older specs (shared UI changed in M4).**
- `e2e/pages/sidebar.ts` is the only place older specs read the sidebar: any assertion that enumerates sidebar items/sections must now
  expect the search button `th.palette.open` at the top and the **Wiki ทีม** section after the projects (M4-D27). Change the page object +
  assertions, never weaken them.
- `e2e/m2-projects.spec.ts`: project tab lists become `[ภาพรวม, งาน, เอกสาร]` (via `th.projects.tabs.*`); the create-project scenario now also
  sees "Project Charter" in the project's sidebar tree and tab (add the assertion there instead of duplicating E1 if cheaper); the permanent-delete
  scenario keeps its typed-name confirm and must still pass with the charter (+ files) present.
- `e2e/m3-tasks.spec.ts`: tab-order assertions (`E1` navigation, `E15`) include "เอกสาร"; `E12`'s shortcut dialog may now also list
  `th.shortcuts.items.palette` (assert with `toContain`, not an exact list); `E14`/`E20` "no POS names in the page" checks stay valid (charters are
  titled "Project Charter" — keep the project-name assertions, do not add "Project Charter" to a forbidden list).
- `e2e/m0-smoke.spec.ts` / `e2e/m1-auth.spec.ts`: shell/sidebar snapshots or item counts → through the page object.
- Every older spec still passes with the CSP/external-request guards now that the BlockNote chunk exists (it only loads on `/p/*`).

**S4.11 Done-check (stream).** `pnpm vitest run --project integration tests/authz` (rows compile; red only where S1 stubs still throw —
list them in the report) · `pnpm exec playwright test --list` discovers `m4-pages.spec.ts` with E1–E19 · `pnpm eslint tests/authz e2e` ·
`pnpm typecheck` (own paths clean). Running Playwright is the integrator's job (G2). Report `requests` (expected: none outside
`tests/authz/**`/`e2e/**`; `data-testid`s or `th` keys missing in S2/S3 output).

---

## 6. Integration (orchestrator)

**Wiring order.**
1. Kickoff: M3 ✅, tree clean, `pnpm db:up`. Copy §3 (X-rows + M4-D1…D38) into `PROGRESS.md › Decisions` (M4-D1, M4-D2 are
   DEVIATION rows → also `PROGRESS.md › Deviations`), the §5 step list into "แผนของ milestone ปัจจุบัน", set M4 🟨.
2. S0 alone → **G0** (`pnpm check`; the authz rows files are empty, stubs typecheck, the migration is journaled).
3. One message, background agents **S1 (backend), S2 (editor), S4 (test)**; launch **S3 (frontend)** in the same message if the
   session allows four agents, otherwise as soon as the first of them reports (S3 only needs S0's contracts; it codes against the
   `EditorClient` stub and the action stubs). No two streams share a path (§4 notes).
4. Apply `requests` (table below) once S1–S4 have reported G1.
5. Integrator: G2 (below), then the review panel (PLAN §2.6), fix rounds, G3, G4.

**Requests expected (apply in step 4).**

| From | Likely request | Owner action |
|---|---|---|
| S1 | `tests/integration/seed-golden.int.test.ts` / `bootstrap.int.test.ts` (M1, not owned by any M4 stream): counts change — +5 `pages` rows and +5 `audit_log` rows (actor `null`, `entity 'page'`) after `seedGolden`; `bootstrap` on an empty DB reports `charters: 0 created` | orchestrator edits the assertions (counts only, never intent) |
| S1 | `scripts/lib/fixtures.int.test.ts` exact audit/row counts of M1–M3 cases | S1 owns the file — check the change is counts only |
| S1 | M2 `createProject` result type gains `charterPageId` (used by S3/E1?) | update `src/lib/contracts/projects.ts` (S0-owned) if S3 needs it; otherwise keep it in the audit row only (M4-D5) |
| S2 | extra `th.editor.blocknote` keys (dictionary drift vs. `@blocknote/core@0.55.0` `en`) | S2 owns `editor` — verify `satisfies Dictionary` still passes |
| S2/S3 | `data-testid`s or roles that S4's page objects assume (`page-editor`, `subpage-card`, `lease-banner`, `data-save-state`, `data-editable`, tree `aria-label`s) | align the page object (S4) or the component — whichever deviates from §5 |
| S3 | `th.common.*` / `th.undo.*` keys outside its namespaces; a `qk.page` invalidation helper tweak in `src/lib/invalidate.ts` | orchestrator edits `th.ts` / `invalidate.ts` (S0-owned) |
| S3 | M2 `SidebarProjects.tsx` structure differs from S3.3's assumption (sub-links list) | S3 owns `src/components/shell/**`; orchestrator re-runs M2's `Sidebar.test.tsx` |
| S1/S3 | a new `ErrorCode` (e.g. `TOO_LARGE`, `UNSUPPORTED_TYPE` if S0.5 missed a mapping) | `src/server/errors.ts` + `th.errors` (orchestrator) |
| S4 | world extensions beyond S0.15 (e.g. a second deleted wiki batch) | S0 owns `tests/helpers/**`: orchestrator applies, or S4 builds the data in a row `setup` |
| S4 | `with?: WorldPart[]` on `AuthzRow` if M2/M3 had no mechanism | S4 owns `tests/authz/**` — note it in the report for PLAN §4.4 |

**G2 commands (integrator only).**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                 # must print "No schema changes, nothing to migrate"
pnpm exec drizzle-kit check      # journal/snapshot consistent; the M4 migration is the last entry
pnpm check                       # typecheck + lint + unit/ui/integration (authz matrix incl. PG/WK/FL/SR rows, masking, files, lease, search)
pnpm test:e2e                    # builds once (webServer) — also proves no SSR import of BlockNote (r3 G1); full suite m0…m4
git diff --exit-code CLAUDE.md SPEC.md docs/
grep -rn "@blocknote/xl-\|@blocknote/server-util\|@blocknote/code-block\|@blocknote/shadcn" package.json src   # expect no hits
grep -rn "@blocknote/core/fonts\|inter.css" src                                   # expect no hits (NFR-09)
grep -rln "@blocknote/mantine/style.css" src                                      # expect exactly src/components/editor/PageEditor.tsx
grep -rn "from '@blocknote" src --include=*.ts --include=*.tsx | grep -v "src/components/editor/\|src/lib/editor/\(paste\|upload\|dictionary\)\.ts\|import type"   # expect no hits (S2 rule)
grep -rn "localStorage\|randomUUID\|window.__bn" src/components src/lib src/hooks   # expect no hits (X53)
grep -rn "taskView\|projectWorkload\|งานและภาระของทีม" src --exclude='*.test.ts' --exclude='*.test.tsx'   # expect no hits (X78, M4-D30; M4 gate only — M10 adds them)
grep -rn "Dialog" src/components/pages src/components/editor | grep -v "palette"    # expect no confirm dialog (P2); only the IconPicker Popover and the palette Dialog
grep -rn "refresh()" src/server/actions/pages.ts                                   # expect no hits (M4-D29)
ls .e2e-uploads >/dev/null 2>&1 && git check-ignore .e2e-uploads uploads           # both ignored
```
- Stray files: `ls` the repo root after G2 and delete leftovers (`race_*.out`, `test-results/` stays ignored).
- `pnpm bootstrap` on the seeded dev DB → `charters: 0 created` (idempotent); on a DB restored from an M3 tree → `charters: 5 created`.

---

## 7. Verification

### 7.1 AC → test map

| AC | Clause in M4 | Tests |
|---|---|---|
| AC-501 | full | e2e E2 (`/ตาราง` → 3×3 → `เพิ่มคอลัมน์ทางขวา` → 3×4 → reload) · ui `slash-menu.test.ts › table item 3×3` · ui `templates.headless.test.ts` (table round-trip) |
| AC-502 | full; "4×3" = 4 columns × 3 rows (M4-D33) | e2e E3 (Excel HTML+TSV fixture, markdown-looking fixture, TSV-only, Google Sheets) · ui `paste.test.ts` (6 routes) · unit `tsv.test.ts` |
| AC-503 | full | e2e E4 (real `ClipboardItem` + `ControlOrMeta+V`, and `page.evaluate` + `DataTransfer`, M4-D34; reload; Peter → 404) · int `files.int.test.ts › download` · authz `FL-DOWNLOAD-P` · masking K8 |
| AC-504 | full | e2e E5 · ui `slash-menu.test.ts › หน้า item` · int `pages.int.test.ts › create` · ui `PageTree.test.tsx` |
| AC-505 | full (+ FR-542 takeover in the same scenario) | e2e E6 (two contexts) · int `page-lease.int.test.ts` · ui `useEditLease.test.tsx` |

No partial ACs: M4 owns all five. Requirement-level coverage (FR-402, FR-501…543, PERM-16…19, FILE-1…8, EDI-1…6, TPL-B1…B3, DM-09/16,
FR-1102/1104/1105 pages part, FR-407/408 parts, UNDO-3/5) is in the §1.1 table; every row there names its test. The v3.1 live blocks
(AC-1301…1303) are M10's (X78, M4-D30) — M4 proves their absence only with the M4-only unit case in `templates.test.ts` (S0.12) and the G2 grep;
every charter content assertion elsewhere uses containment so it survives M10 (M4-D37c).

### 7.2 Authorization matrix rows added

`M` manager · `L` lead (LEAD of P and A) · `Me` member (MEMBER of P and A) · `W` outsider (MEMBER of Q only). Mutating `allow` rows assert
exactly one new `audit_log` row (entity in brackets; `project_id` = the page's project or `null`). "lease" = `mutates: true, audit: false` (X44).
World ids from S0.15. All rows also run as nobody → 401 and as a must-change user → 403 (M1 loops).

**`tests/authz/rows/pages.ts` — project pages (PERM-16; PERM-06 visibility; PERM-19 on project pages; X42 archived)**

| Key | PERM | Action / route (world ids) | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| PG-VIEW | 16, 06 | `GET /api/pages/{pPage}` | allow | allow | allow | 404 | no |
| PG-VIEW-CHARTER | 16, FR-402 | `GET /api/pages/{pCharter}` | allow | allow | allow | 404 | no |
| PG-VIEW-ARCH | 16, X42 | `GET /api/pages/{aPage}` | allow | allow | allow | 404 | no |
| PG-VIEW-DELETED | 16, M4-D21 | `GET /api/pages/{root of batches.pDeletedPage}` | 404 | 404 | 404 | 404 | no |
| PG-TREE | 16, 06 | `GET /api/pages/tree?space=PROJECT&projectId={P}` | allow | allow | allow | 404 | no |
| PG-TREE-CHILD | 16 | `GET /api/pages/tree?space=PROJECT&projectId={P}&parentId={pPage}` | allow | allow | allow | 404 | no |
| PG-TREE-ARCH | 16, X42 | `GET /api/pages/tree?space=PROJECT&projectId={A}` | allow | allow | allow | 404 | no |
| PG-CREATE | 16 | `createPage({ space:'PROJECT', projectId:P, parentId:null })` [page] | allow | allow | allow | 404 | yes |
| PG-CREATE-CHILD | 16 | `createPage({ …P, parentId:pPage })` [page] | allow | allow | allow | 404 | yes |
| PG-CREATE-ARCH | 16, X42 | `createPage({ space:'PROJECT', projectId:A, parentId:null })` | 403 | 403 | 403 | 404 | yes |
| PG-CREATE-X | 16, M4-D31 | `createPage({ space:'PROJECT', projectId:P, parentId:qPage })` | 400 | 404 | 404 | 404 | yes |
| PG-RENAME | 16 | `renamePage({ pageId:pPage, title:'ชื่อใหม่' })` [page] | allow | allow | allow | 404 | yes |
| PG-RENAME-ARCH | 16, X42 | `renamePage({ pageId:aPage, … })` | 403 | 403 | 403 | 404 | yes |
| PG-ICON | 16 | `setPageIcon({ pageId:pPage, icon:'📌' })` [page] | allow | allow | allow | 404 | yes |
| PG-COVER | 16, FR-504 | `setPageCover({ pageId:pPage, fileId:files.pImage })` [page] | allow | allow | allow | 404 | yes |
| PG-COVER-X | 16, M4-D17 | `setPageCover({ pageId:pPage, fileId:files.qFile })` (other project → `coverNotImage`) | 400 | 400 | 400 | 404 | yes |
| PG-SAVE | 16, FR-531 | `savePageContent({ pageId:pPage, baseVersion:1, content })` [page] | allow | allow | allow | 404 | yes |
| PG-SAVE-ARCH | 16, X42 | `savePageContent({ pageId:aPage, baseVersion:1, … })` | 403 | 403 | 403 | 404 | yes |
| PG-SAVE-STALE | 16, FR-543 | `savePageContent({ pageId:pPage, baseVersion:99, … })` → `VERSION_CONFLICT` | 409 | 409 | 409 | 404 | yes |
| PG-SAVE-BAD | 16, M4-D9 | `savePageContent` with a `javascript:` link (zod runs before authz) | 400 | 400 | 400 | 400 | yes |
| PG-TEMPLATE | 16, FR-507 | `applyTemplate({ pageId:<blank P page from setup>, baseVersion:1, template:'meeting' })` [page] | allow | allow | allow | 404 | yes |
| PG-TEMPLATE-ARCH | 16, X42 | `applyTemplate` on a blank A page (setup `makePage({ project:A })`) | 403 | 403 | 403 | 404 | yes |
| PG-MOVE | 16, FR-503 | `movePage({ pageId:pChild, parentId:null, afterId:pPage })` [page] | allow | allow | allow | 404 | yes |
| PG-MOVE-X | 16, M4-D31 | `movePage({ pageId:pChild, parentId:qPage, afterId:null })` | 400 | 404 | 404 | 404 | yes |
| PG-MOVE-ARCH | 16, X42 | `movePage({ pageId:aPage, parentId:null, afterId:null })` | 403 | 403 | 403 | 404 | yes |
| PG-DUPLICATE | 16, FR-508 | `duplicatePage({ pageId:pPage })` [page] | allow | allow | allow | 404 | yes |
| PG-DUPLICATE-ARCH | 16, X42 | `duplicatePage({ pageId:aPage })` (view ok, create 403) | 403 | 403 | 403 | 404 | yes |
| PG-DELETE | 16, FR-509 | `deletePage({ pageId:pPage })` [page] | allow | allow | allow | 404 | yes |
| PG-DELETE-CHARTER | 16, M4-D6 | `deletePage({ pageId:pCharter })` | 403 | 403 | 403 | 404 | yes |
| PG-DELETE-ARCH | 16, X42 | `deletePage({ pageId:aPage })` | 403 | 403 | 403 | 404 | yes |
| PG-RESTORE | 16, UNDO-5 | `restorePageBatch({ batch:batches.pDeletedPage })` [page] | allow | allow | allow | 404 | yes |
| PG-RESTORE-ARCH | 16, X42 | `restorePageBatch({ batch:batches.aDeletedPage })` | 403 | 403 | 403 | 404 | yes |
| PG-RESTORE-EXPIRED | 16, UNDO-5 | `restorePageBatch({ batch:batches.pOldDeletedPage })` (31 days) | 409 | 409 | 409 | 404 | yes |
| PG-PROTECT | 19, M4-D24 | `setPageProtected({ pageId:pPage, protected:true })` (`protectWikiOnly`) | 400 | 403 | 403 | 404 | yes |
| PG-LOCK-GET | 16, M4-D3 | `GET /api/pages/{pPage}/lock` | allow | allow | allow | 404 | no |
| PG-LOCK-GET-ARCH | 16, M4-D3 | `GET /api/pages/{aPage}/lock` | allow | allow | allow | 404 | no |
| PG-LOCK | 16, FR-540 | `POST /api/pages/{pPage}/lock` | allow | allow | allow | 404 | lease |
| PG-LOCK-TAKEOVER | 16, FR-542 | `POST …/{pPage}/lock?takeover=1` (setup: lease held by another user) | allow | allow | allow | 404 | lease |
| PG-LOCK-ARCH | 16, X42 | `POST /api/pages/{aPage}/lock` | 403 | 403 | 403 | 404 | lease |
| PG-LOCK-ORIGIN | 16, M4-D18 | `POST …/{pPage}/lock` with `Origin: https://evil.example` | 403 | 403 | 403 | 403 | lease |
| PG-UNLOCK | 16, EDI-6 | `DELETE /api/pages/{pPage}/lock` → 204 | allow | allow | allow | 404 | lease |
| PG-KEEPALIVE | 16, M4-D2 | `PUT /api/pages/{pPage}/content` `{ baseVersion:1, content }` [page] | allow | allow | allow | 404 | yes |
| PG-KEEPALIVE-STALE | 16, FR-543 | `PUT …/{pPage}/content` `{ baseVersion:99, … }` | 409 | 409 | 409 | 404 | yes |
| PG-KEEPALIVE-ORIGIN | 16, M4-D18 | `PUT …/{pPage}/content` with a foreign `Origin` | 403 | 403 | 403 | 403 | yes |

**`tests/authz/rows/wiki.ts` — team wiki (PERM-17, PERM-18, PERM-19; protection inherits, X63/M4-D24)**

| Key | PERM | Action / route | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| WK-VIEW | 17 | `GET /api/pages/{wiki}` | allow | allow | allow | allow | no |
| WK-VIEW-PROT | 17 | `GET /api/pages/{wikiProtectedChild}` | allow | allow | allow | allow | no |
| WK-TREE | 17 | `GET /api/pages/tree?space=WORKSPACE` | allow | allow | allow | allow | no |
| WK-TREE-CHILD | 17 | `GET /api/pages/tree?space=WORKSPACE&parentId={wikiProtected}` | allow | allow | allow | allow | no |
| WK-CREATE | 18 | `createPage({ space:'WORKSPACE', projectId:null, parentId:null })` [page, null] | allow | allow | allow | allow | yes |
| WK-CREATE-CHILD | 18 | `createPage({ …WORKSPACE, parentId:wiki })` [page] | allow | allow | allow | allow | yes |
| WK-SAVE | 18 | `savePageContent({ pageId:wiki, baseVersion:1, content })` [page] | allow | allow | allow | allow | yes |
| WK-RENAME | 18 | `renamePage({ pageId:wikiChild, title })` [page] | allow | allow | allow | allow | yes |
| WK-MOVE | 18 | `movePage({ pageId:wikiChild, parentId:null, afterId:wiki })` [page] | allow | allow | allow | allow | yes |
| WK-DUPLICATE | 18 | `duplicatePage({ pageId:wiki })` [page] | allow | allow | allow | allow | yes |
| WK-DELETE | 18 (r6a M4-06) | `deletePage({ pageId:wikiChild })` [page] | allow | allow | allow | allow | yes |
| WK-RESTORE | 18 | `restorePageBatch({ batch:batches.wikiDeletedPage })` [page] | allow | allow | allow | allow | yes |
| WK-LOCK | 18 | `POST /api/pages/{wiki}/lock` | allow | allow | allow | allow | lease |
| WK-KEEPALIVE | 18 | `PUT /api/pages/{wiki}/content` [page] | allow | allow | allow | allow | yes |
| WK-PROT-SAVE | 18 | `savePageContent({ pageId:wikiProtected, … })` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-SAVE-CHILD | 18, X63 | `savePageContent({ pageId:wikiProtectedChild, … })` (inherited) [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-RENAME | 18 | `renamePage({ pageId:wikiProtected, … })` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-ICON | 18 | `setPageIcon({ pageId:wikiProtectedChild, icon:'📌' })` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-CREATE-CHILD | 18 | `createPage({ …WORKSPACE, parentId:wikiProtected })` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-MOVE | 18 | `movePage({ pageId:wikiProtectedChild, parentId:null, afterId:null })` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-MOVE-INTO | 18 | `movePage({ pageId:wikiChild, parentId:wikiProtected, afterId:null })` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-DUPLICATE | 18 | `duplicatePage({ pageId:wikiProtectedChild })` (copy lands under the protected parent) [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-DELETE | 18 | `deletePage({ pageId:wikiProtectedChild })` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-DELETE-SUBTREE | 18, M4-D24 | `deletePage({ pageId:wikiFolder })` (unprotected root, protected child) [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-RESTORE | 18, M4-D21 | `restorePageBatch` of `wikiProtectedChild` soft-deleted in setup (parent protected) [page] | allow | 403 | 403 | 403 | yes |
| WK-PROT-LOCK | 18 | `POST /api/pages/{wikiProtected}/lock` | allow | 403 | 403 | 403 | lease |
| WK-PROT-LOCK-GET | 17, M4-D3 | `GET /api/pages/{wikiProtected}/lock` | allow | allow | allow | allow | no |
| WK-PROT-KEEPALIVE | 18 | `PUT /api/pages/{wikiProtected}/content` [page] | allow | 403 | 403 | 403 | yes |
| WK-PROTECT | 19 | `setPageProtected({ pageId:wiki, protected:true })` [page] | allow | 403 | 403 | 403 | yes |
| WK-UNPROTECT | 19 | `setPageProtected({ pageId:wikiProtected, protected:false })` [page] | allow | 403 | 403 | 403 | yes |

**`tests/authz/rows/files.ts` — uploads and downloads (PERM-16/17/18, FILE-1…7, AC-503)**

| Key | PERM | Action / route | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| FL-UPLOAD-P | 16, FILE-1 | `POST /api/files` `{ pageId:pPage, PNG_1X1 'a.png' }` → 201 [file, P] | allow | allow | allow | 404 | yes |
| FL-UPLOAD-ARCH | 16, X42 | `POST /api/files` on `aPage` | 403 | 403 | 403 | 404 | yes |
| FL-UPLOAD-WIKI | 18 | `POST /api/files` on `wiki` [file, null] | allow | allow | allow | allow | yes |
| FL-UPLOAD-PROT | 18 | `POST /api/files` on `wikiProtected` [file, null] | allow | 403 | 403 | 403 | yes |
| FL-UPLOAD-ORIGIN | 16, M4-D18 | `POST /api/files` on `pPage` with a foreign `Origin` | 403 | 403 | 403 | 403 | yes |
| FL-UPLOAD-EXE | 16, FILE-5 | `exeBytes()` named `a.png` on `pPage` (authz before classify) | 415 | 415 | 415 | 404 | yes |
| FL-UPLOAD-BIG | 16, FILE-2 | `paddedPng(11 MB)` on `pPage` | 413 | 413 | 413 | 404 | yes |
| FL-UPLOAD-COVER-PDF | 16, M4-D15 | `pdfBytes()` with `purpose:'cover'` on `pPage` | 415 | 415 | 415 | 404 | yes |
| FL-DOWNLOAD-P | 16, FILE-6, AC-503 | `GET /api/files/{files.pImage}` | allow | allow | allow | 404 | no |
| FL-DOWNLOAD-PDF | 16, FILE-7 | `GET /api/files/{files.pPdf}` | allow | allow | allow | 404 | no |
| FL-DOWNLOAD-Q | 06, M4-D17 | `GET /api/files/{files.qFile}` | allow | 404 | 404 | allow | no |
| FL-DOWNLOAD-ARCH | 16, X42 | `GET /api/files/{files.aFile}` | allow | allow | allow | 404 | no |
| FL-DOWNLOAD-WIKI | 17 | `GET /api/files/{files.wikiFile}` | allow | allow | allow | allow | no |
| FL-DOWNLOAD-DELETED-PAGE | 16, M4-D17 | file on a soft-deleted P page (setup `makePage({ project:P, deleted })` + `makeFile`) | allow | allow | allow | 404 | no |
| FL-DOWNLOAD-MISSING | FILE-6 | `GET /api/files/<random v4>` · `GET /api/files/x` | 404 | 404 | 404 | 404 | no |

**`tests/authz/rows/search.ts` — search and titles (FR-1104 pages part; content checked by masking K1–K14)**

| Key | PERM | Action / route | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| SR-PAGES | 06/17 | `GET /api/search?q=หน้า` | allow | allow | allow | allow | no |
| SR-TITLE-ONLY | 06/17 | `GET /api/search?q=หน้า&titleOnly=1` | allow | allow | allow | allow | no |
| SR-EMPTY | — | `GET /api/search?q=` | 400 | 400 | 400 | 400 | no |
| PG-TITLES | 06/17, X63 | `GET /api/pages/titles?ids={pPage},{wiki}` (items masked for W) | allow | allow | allow | allow | no |
| PG-TITLES-400 | — | `GET /api/pages/titles?ids=x` | 400 | 400 | 400 | 400 | no |
| (loop) | — | every row above as nobody | 401 | 401 | 401 | 401 | — |
| (loop) | — | every row above as a must-change user | 403 | | | | — |

### 7.3 E2E scenario outline (`e2e/m4-pages.spec.ts`)

Determinism (PLAN §4.5, X46, M4-D35): production build on :3100 with `APP_NOW=2026-09-30T10:00:00+07:00`, `ALLOW_TEST_HOOKS=1`,
`UPLOAD_DIR=.e2e-uploads`; `test.describe.configure({ mode: 'serial' })`; ⟲ = `test.beforeAll(async () => { await resetDb(undefined, { extras }) })` for that describe
(golden seed incl. the 5 charters; extras from `e2e/support/seed-pages.ts` as listed); `loginAs` per test/context; the M0 fixture pins the
clock and keeps the CSP / external-request / page-error guards on; selectors = roles + `th` strings + the S4.8 page objects; waits on UI state
(`data-save-state`, banners, `toHaveCount`), never sleeps. Users: cindy (LEAD of POS, CRM), ivy (MEMBER of POS, CRM), peter (POS non-member),
manager.

| # | Scenario (actor) | Steps | Assertions |
|---|---|---|---|
| E1 ⟲ | FR-402, FR-505, FR-408, UI-01, X78 (manager, then cindy) | manager: create project "โปรเจคเอกสารทดสอบ" (client Coral, LEAD Cindy) with M2's dialog; sidebar → expand it; open its tab `th.projects.tabs.pages`; open "Project Charter"; cindy: open POS Upgrade → tab เอกสาร | the project tree `th.pages.tree.projectLabel(name)` and the tab both list `th.pages.charterTitle` with 📋 at level 1; tabs read ภาพรวม · งาน · เอกสาร (M4-only list: M6 inserts แผนงาน and updates this line, m06 S6.3); URL `/p/<uuid>`; first table rows contain `['ลูกค้า','Coral']`, `['Project Lead','Cindy']`, `['ความแน่นอน', th.projects.certainty.CONFIRMED]` and an empty ช่วงเวลา cell; the h2 texts contain (`expect.arrayContaining`) ข้อมูลโปรเจค, Milestones สำคัญ and การสื่อสาร — containment only, never the exact list (M4-D37c: M10 adds "งานและภาระของทีม"; its absence in M4 is proven by the S0.12 unit case and the G2 grep); page menu has no `th.pages.delete`; breadcrumb root is the project name linking to `/projects/<id>/pages`; cindy sees POS's backfilled charter (seedGolden) and not the Data Warehouse tree |
| E2 ⟲ | AC-501, FR-506, FR-520, FR-523 (cindy) | sidebar `th.sidebar.newWikiPage`; type title "ตารางทดสอบ" + Enter; `slash('ตาราง')`; Enter; `addColumnRight(0)`; `waitSaved()`; reload | new page at `/p/<uuid>` and in the Wiki tree; first slash option is `ตาราง`; table 3 rows × 3 cells, then 3 × 4; after reload 3 × 4 and the tree item reads "ตารางทดสอบ" |
| E3 | AC-502, FR-524, EDI-4, M4-D33 (cindy) | new wiki page "วางจาก Excel"; `syntheticPaste` excel-4x3 (HTML + TSV); `focusEnd`+Enter; excel-markdownish (HTML + TSV); Enter; tsv-only-markdownish (text/plain only); Enter; gsheets-3x2 (HTML); `waitSaved()`; reload | 4 tables in order with shapes 3×4, 3×2, 3×2, 3×2 and `cellTexts` equal to the grids parsed from the fixture files; no paragraph contains `task_name_1`; after reload `GET /api/pages/<id>` has exactly 4 `table` blocks |
| E4 ⟲ | AC-503, FR-525, FR-526, FR-505, M4-D34 (cindy, ivy, peter) | cindy: POS → tab เอกสาร → `th.pages.projectTab.newPage`; title "รูปหน้าจอ"; `realClipboardImage(PNG)` + `ControlOrMeta+V`; then `syntheticPaste({}, [PNG 'screenshot.png'])`; select the first image → caption "ภาพหน้าจอ" + align centre via the image toolbar (`th.editor.blocknote.formatting_toolbar.*` labels); `waitSaved()`; reload. ivy (new context): `request.get(src)`. peter (new context): `request.get(src)`, `page.goto(src)`, `page.goto('/p/<id>')` | 2 images whose `src` matches `^/api/files/<uuid>$` and `naturalWidth > 0`; after reload both still there with the caption; ivy → 200, `content-type: image/png`, `x-content-type-options: nosniff`; peter → 404, 404, 404 with `th.pages.notFound.title` and no "รูปหน้าจอ" in `page.content()` |
| E5 | AC-504, FR-506, FR-528, M4-D14 (cindy) | sidebar POS tree → "Project Charter"; `focusEnd`; `slash('หน้า')`; Enter; expand the charter row; click the card; rename the child "หน้าย่อยทดสอบ"; `page.goBack()`; reload | first slash option is `th.editor.slash.subpage.title` and `ย่อหน้า` comes later; one `subpage-card` (first `th.editor.subpage.creating`, then `th.editor.subpage.untitled` with an `href`); the charter row gains an expand toggle and the child `th.pages.untitled` appears at level 2 under it; after the rename the card shows "หน้าย่อยทดสอบ" (live title); after reload still exactly one card and one child |
| E14 | FR-529, EDI-3, M4-D20 (cindy, then peter) | cindy: POS → new page "แผนลับ POS"; wiki → new page "บันทึกอ้างอิง"; type `@Ic` → Enter; type ` @แผนลับ` → Enter; `waitSaved()`; click the page chip. peter: open "บันทึกอ้างอิง" | mention menu: Ivy first under `th.editor.mention.groupPeople`; "แผนลับ POS" under `groupPages`; chips "@Ivy" and "แผนลับ POS"; clicking navigates to `/p/<แผนลับ id>` in the same tab; peter sees "@Ivy" and `th.editor.mention.noAccess` without an `href`; neither `page.content()` nor the `/api/pages/titles` response contains "แผนลับ POS" |
| E6 ⟲ | AC-505, FR-540, FR-542, FR-541 release (cindy + ivy, two contexts) | cindy: open POS "Project Charter", type "แก้โดย Cindy", `waitSaved()`; ivy: open it, type "x"; ivy: `takeover()`; cindy: `pokeLease()`; ivy: type "ต่อโดย Ivy", `waitSaved()`, `page.close()`; cindy: `pokeLease()` | cindy editable; ivy: `leaseBanner()` = `th.editor.lease.heldBy('Cindy')`, `contenteditable="false"`, content unchanged by "x"; after takeover ivy is editable and shows "แก้โดย Cindy" (fresh fetch); cindy's banner = `takenOverBy('Ivy')` and read-only; after ivy leaves, cindy re-acquires: banner gone, editable, content contains "ต่อโดย Ivy" (re-created from the newer version) |
| E7 ⟲ | FR-510, PERM-18/19, X63 (manager, ivy) — extras: wiki "นโยบายทีม" + child "ย่อยนโยบาย" (by Cindy) | manager: open "นโยบายทีม" → menu `th.pages.protect`; ivy: open "นโยบายทีม", then "ย่อยนโยบาย" (record `request` events); manager: menu `th.pages.unprotect`; ivy: reload | toast `th.pages.toasts.protected`; 🔒 `th.pages.protectedIcon` on both tree rows (child inherits); ivy: `th.pages.protectedBanner`, `data-editable="false"`, title input read-only, no `th.pages.addChild(...)` button and no drag handle on those rows, child page read-only too, zero `POST …/lock` requests (only `GET`); after unprotect + reload ivy is editable and the banner is gone |
| E8 ⟲ | FR-509, UNDO-3, P2 (cindy) | new wiki page "แม่ลบ"; `/หน้า` → open child → rename "ลูกลบ"; menu `th.pages.delete`; click `th.undo.undo`; tree `openMenu('แม่ลบ')` → delete; `ControlOrMeta+z` with focus on `body`; reload | after the child delete: navigated to "แม่ลบ", toast `th.pages.toasts.deleted('ลูกลบ', 0)`, card shows `th.editor.subpage.deleted`; undo → card "ลูกลบ" + tree child back; parent delete → toast `deleted('แม่ลบ', 1)`, both rows gone; Cmd+Z → both back; `getByRole('dialog')` never visible; reload keeps both |
| E9 | FR-508, M4-D22 (cindy) | tree `openMenu('แม่ลบ')` → `th.pages.duplicate`; expand the copy; open the copy | toast `th.pages.toasts.duplicated('แม่ลบ')`; row `th.pages.copyTitle('แม่ลบ')` directly after "แม่ลบ" at level 1 with child "ลูกลบ"; the copy's card `href` ≠ the original child's and equals the copy's child; the original page unchanged |
| E10 | FR-503, UI-02, M4-D23 (cindy) | create wiki roots "ก1", "ก2", "ก3"; `dragOnto('ก3','ก1')`; `dragOnto('ก2','ก1', 24)`; expand "ก1"; reload | relative order ก3, ก1 after the first drag; "ก2" at `aria-level=2` under "ก1"; after reload order, levels and the expanded "ก1" persist (`user_preferences`, not `localStorage`) |
| E18 | FR-504 (cindy) | open "ก2"; `pickIcon('📌')`; `addCover(PNG)`; reload; `th.pages.cover.remove`; reload | breadcrumb: `th.pages.wikiRoot` (not a link) › "ก1" (link) › "ก2" (`aria-current="page"`); 📌 on the page and its tree row; cover `img` (`th.pages.cover.alt`) with `/api/files/<uuid>` after reload; gone after remove + reload |
| E11 ⟲ | FR-507, TPL-B1…B3, M4-D6/D7 (ivy) | new wiki page → `th.pages.templates.meeting`; new page → `sop`; new page → `charter`; new page → `blank`, then reload | 4 template buttons in order ว่าง · Project Charter · บันทึกการประชุม · คู่มือ/SOP; meeting: title = `th.pages.meetingTitle(formatThaiDate('2026-09-30','medium'))`, icon 📝, the editor's h2 texts equal those of `meetingTemplate(label)`; chooser gone; SOP: title empty and focused, 📘; charter: 5 tables, info-table cells beside ลูกค้า/Project Lead are empty; blank: chooser hidden, shows again after reload (page still blank) |
| E12 ⟲ | FR-520, FR-521, FR-522, FR-523, FR-530, FR-532 (cindy) | new wiki page; `slash('table')` → Escape; type markdown shortcuts `# `, `## `, `- `, `1. `, `[] `, `> `, ```` ``` ```` + space, `---` (each on a new block); `/รายการพับได้`; select a word → `ControlOrMeta+b`; formatting toolbar colour → text red, background yellow; `/ตาราง` → `toggleHeaderRow(0)`; hover a block; `waitSaved()`; reload | first `table` result is `ตาราง` (English alias); after reload `GET /api/pages/<id>` block types in order include heading(1), heading(2), bulletListItem, numberedListItem, checkListItem, quote, codeBlock, divider, toggleListItem, table (`headerRows: 1`); the word has `styles.bold`, `textColor: 'red'`, `backgroundColor: 'yellow'`; the side-menu drag handle (`th.editor.blocknote.side_menu.drag_handle_label`) is visible with `draggable="true"` (reordering by drag = manual M-3) |
| E13 ⟲ | FR-527, FILE-2…5 (cindy) | POS → new page "เอกสารแนบ"; `dropFile(PDF 'สัญญา.pdf')`; click the card link; `slash('ไฟล์แนบ')` → panel → `setInputFiles('logo.svg')`; `slash('ไฟล์แนบ')` → `setInputFiles` exe bytes named `x.pdf`; reload | card "📎 สัญญา.pdf" + `formatBytes(size)`; download event `suggestedFilename() === 'สัญญา.pdf'`; the file panel has exactly one tab `th.editor.blocknote.file_panel.upload.title` (no embed tab); SVG becomes an attachment card, never an `<img>` (FILE-4); the fake PDF → toast `th.editor.upload.typeNotAllowed`, no card left (server 415, FILE-5); after reload 2 cards |
| E15 ⟲ | FR-531, M4-D2, M4-D26 (cindy) | new wiki page; type "ร่างแรก"; type " ต่อ" and immediately click the sidebar link of "Project Charter" (POS); `page.goBack()`; type " ปิดแท็บ" and immediately `page.goto('about:blank')` | status `th.editor.saveStatus.saving` then `saved` (`data-save-state`); after in-app navigation + back the text "ร่างแรก ต่อ" is present (unmount flush); `expect.poll` on `page.request.get('/api/pages/<id>')` → content contains "ปิดแท็บ" (keepalive `PUT`) |
| E16 ⟲ | FR-1102/1104/1105 pages part, X08, X49, KEY-01 (ivy, then peter) — extras: wiki "คู่มือการลาพักร้อน" (by Manager) | ivy on `/home`: `ControlOrMeta+KeyK`; type "ลาพัก"; replace with "Charter"; replace with "ประชุมประจำ"; hover `palette.option(/POS Upgrade/)` inside `pageResults()`, press Enter; in the opened page select text in the editor and press `ControlOrMeta+KeyK`; Escape; sidebar `th.palette.open`; peter: open palette, type "Charter" | dialog `th.palette.dialogLabel` with `th.palette.hint`; "ลาพัก" → "คู่มือการลาพักร้อน" with subtitle `th.palette.wiki` (Thai substring); "Charter" → `pageResults()` has exactly 2 options (count scoped to the pages group, M4-D37d), named with subtitles POS Upgrade and CRM Migration; "ประชุมประจำ" → `pageResults()` options carry `th.palette.matchedInContent`; all selection by option name, nothing asserted about other groups (M8 "คำสั่ง", M10 categories/commands; Ivy stays a non-LEAD user); Enter navigates and closes; Cmd+K with a text selection does **not** open the palette (BlockNote link shortcut, r3 G16); the sidebar button opens it; peter's `pageResults()` are exactly the charters of Data Warehouse and Store Analytics Dashboard, and no `/api/search` response or `page.content()` contains "POS Upgrade" |
| E17 ⟲ | FR-543, M4-D35 (cindy) — extras: wiki "หน้าชนกัน" content "ต้นฉบับ" | `page.clock.install({ time: new Date('2026-09-30T10:00:00+07:00') })` before `goto`; open it; type " แก้จากแท็บนี้"; `page.request.put('/api/pages/<id>/content', { data: { baseVersion: <GET version>, content: [paragraph 'จากอีกแท็บ'] } })`; `clock.runFor(1000)`; `clock.runFor(10_000)`; click `th.editor.conflict.reload` | PUT → 200; after 1 s the banner `th.editor.conflict.banner` shows and the editor is read-only; after 10 s no further save request (never retried); after reload the banner is gone, the editor shows "จากอีกแท็บ" and is editable; the server content is still "จากอีกแท็บ" (nothing overwritten) |
| E19 | FILE-8, NFR-09, M4-D9 (cindy) — in E2's describe | new wiki page; `syntheticPaste({ 'text/html': '<p>ดูรูป <img src="https://example.com/cat.png" alt="แมว"></p>' })`; Enter; `syntheticPaste({ 'text/html': '<img src="https://example.com/dog.png">' }, [PNG 'image.png'])`; Enter; `syntheticPaste({ 'text/html': '<img src="data:image/png;base64,AAAA">' })`; `waitSaved()`; reload | a link "แมว" → `https://example.com/cat.png` and no `<img>` from example.com; the "Copy image" paste uploads the File (one image with `/api/files/<uuid>`); the data-URI paste becomes the text `th.editor.pasteImageLinkFallback`; after reload the same; the external-request guard recorded nothing (an `<img>` to example.com would have failed the test) |

E4/E14/E16 describes allow `/status of 404/` console errors; E13 allows `/status of 415/` (S4.9).

### 7.4 Golden, perf and manual checks

- **Golden seed** (`scripts/lib/fixtures.int.test.ts › M4`, S1.9): `seedGolden(db)` → exactly 5 charters, one per golden project, each first
  in its project's root order, `content_text` containing the client name (Coral, Coral, Bluebird, Sunrise, Internal) and the LEAD's display name;
  5 audit rows with actor `null`. M5's counts build on these (+5 pages, +5 audit rows).
- **P-1 (NFR-05 smoke, manual before G4):** a temporary script (not committed) inserts a wiki page with 300 blocks (`complex-doc.json`
  repeated); with the production build, open it in Chrome DevTools Performance: navigation → editor editable < 1 s on the dev machine. Otherwise
  record a Known issue for M12's perf pass (`seed:perf`).
- **P-2 (palette):** first palette result for "Charter" < 200 ms locally (`/api/search` server timing in the network panel); full NFR-06 run is M12.
- **M-1 real spreadsheets (manual acceptance, brief):** copy a 4×3 range from **Windows Excel** and from **Google Sheets** (Chrome on Windows
  and macOS) into a page → one table with the same cells; repeat inside an existing table (fills cells, r3 §7.1).
- **M-2 Thai input:** type with a Thai IME / Kedmanee layout in the title and the editor (composition does not commit early; Cmd+K, Cmd+Z by
  `e.code` still work); `/ตาราง`, `@` mentions with Thai queries.
- **M-3 mouse-only behaviours:** drag a block by its handle to reorder (FR-530); resize an image by its edge and align it (FR-526); resize a
  table column (FR-523) — each persists after reload.
- **M-4 mobile (NFR-07b part):** at 390 × 844 a page is readable (no page-level horizontal scroll, tables scroll inside their block), the
  sidebar trees work in the drawer.
- **M-5 theme + a11y:** dark mode — editor text, menus, slash menu and toolbars readable and above the MUI app bar (`--bn-ui-base-z-index`);
  screen reader announces the tree (`tree`/`treeitem`, level, expanded), the lease banner and the save status (`role="status"`); 🔒 and
  deleted/no-access cards are text/icons, never colour only.
- **M-6 offline:** with the network unplugged, the editor loads (no remote font/script; NFR-09) and an upload still works.

---

## 8. Definition of done

- [ ] SPEC §12 M4 delivered: §4.5 entirely (FR-501…510, FR-520…532, FR-540…543); BlockNote with custom `subpage`, `mention` and the `file`
      attachment block; Excel/Sheets table paste and screenshot paste; `/api/files` upload/download; edit lease; Appendix B templates (charter
      **without** "งานและภาระของทีม", M4-D30); FR-402 charter in `createProject` + `ensureProjectCharters()`; Wiki ทีม + project page trees in the
      sidebar; page search in Cmd/Ctrl+K (§6.4) — every row of §1.1 implemented and tested.
- [ ] AC-501…AC-505 pass in `e2e/m4-pages.spec.ts` (E2–E6), including the screenshot paste via `page.evaluate` + `DataTransfer` **and** the real
      `ClipboardItem` route (M4-D34); E1, E7–E19 pass.
- [ ] Full e2e suite green: m0-smoke, m1-auth, m2-projects, m3-tasks (updated per S4.10), m4-pages — with no CSP violation, no external request,
      no page error.
- [ ] `pnpm check` green (typecheck, lint, unit, ui, integration incl. the authz matrix with every §7.2 row, masking K1–K14, lease, files,
      search, charters; domain coverage gate unchanged).
- [ ] Every new action and route has authz rows (§7.2) — project, archived, wiki, protected-wiki, cross-project, origin and stale-version
      variants; mutating `allow` rows assert one audit row; leases are not audited; page saves never store content in `audit_log`.
- [ ] Masking: no title, content, file name or bytes of an invisible project's page reaches the outsider through search, mention suggestions,
      titles, tree, page view, lease or file routes (K1–K14); 404 (not 403) for anything invisible.
- [ ] `pnpm db:generate` → "No schema changes"; exactly one M4 migration (`pages`, `page_locks`, `files`, `page_space`, the five named indexes,
      the circular cover FK); `pages.position` is `COLLATE "C"`; no hand-edited migration; no custom migration needed.
- [ ] Dependencies exactly as S0.1 (`@blocknote/*` 0.55.0, `@mantine/*` 9.6.3, `file-type` 22.1.1, `cmdk` 1.1.1); no `@blocknote/xl-*`,
      `server-util`, `code-block`, `shadcn`; BlockNote CSS only in the editor chunk; no `inter.css` (G2 greps).
- [ ] Uploads: magic-byte classification, SVG only as attachment, limits from env, `nosniff` + correct `Content-Disposition`/`Cache-Control`/CSP
      headers; `uploadFile` never rejects; external images never hot-linked (client + server sanitiser).
- [ ] No confirm dialog added; page delete has the 8 s undo toast + Cmd+Z and restore re-checks authz, 30 days, live parent and depth.
- [ ] No Thai literal outside `src/i18n/**` (lint; templates live in `src/i18n/templates.th.ts`); no `any`, `@ts-ignore` or undocumented
      `eslint-disable`; no `localStorage`, no client `crypto.randomUUID`, no `window.__bn`; no runtime CDN; state never by colour alone; creating a
      page needs nothing (blank page + optional template).
- [ ] No M10 work: no `taskView`/`projectWorkload` blocks, no `/มุมมองงาน` `/ภาระทีม` slash items, no palette categories beyond pages (X08, X78).
- [ ] Manual checks M-1…M-6 and P-1/P-2 done or recorded as Known issues; `PROGRESS.md` updated (§10); commit + tag `m4`.

---

## 9. Risks and gotchas

| # | Risk / pitfall | Mitigation (step) |
|---|---|---|
| R1 | BlockNote crashes SSR (`window is not defined`) when imported from a Server Component (r3 G1) | `EditorClient` = Client Component with `dynamic(() => import('./PageEditor'), { ssr: false })` (S2.4); G2 builds once |
| R2 | Stock paste turns Excel/TSV that "looks like markdown" into one paragraph; TSV-only pastes become text (r3 G2, §7.3) | custom `pasteHandler` 6-step routing (S2.2); e2e E3 with the markdown-looking fixtures; manual M-1 |
| R3 | External images hot-linked by paste/drop (privacy, offline server, CSP) (r3 G3) | paste handler `externalImagesToLinks`, `fixForeignMedia` on change, server `sanitizeContent` (S0.8, S2.2, S2.4); E19 + the external-request guard |
| R4 | `uploadFile` rejecting → unhandled rejection on drop; `useUploadLoading` race (r3 G9/G10) | never reject, resolve `{}` + notify; external `uploadStore` (S2.2); `upload.test.ts` "resolves in every case" |
| R5 | `initialContent: []` or an unknown block type throws and unmounts the tree (r3 G12) | `prepareInitialContent` → `undefined` for empty, repair per block; `EditorErrorBoundary` (S2.2, S2.4) |
| R6 | `onChange` fires when `editable` toggles → phantom saves / false conflicts (r3 G11) | dirty check against `JSON.stringify(editor.document)` baseline (S2.6) |
| R7 | jsonb reorders keys, so comparing with the DB JSON is always "dirty" (r3 §12) | baseline from the editor after (re)creation, never from the server (S2.6) |
| R8 | `/หน้า` matches `ย่อหน้า` first; `10:30`/`1/2` open the emoji/slash menus (r3 G4/G5) | `rankSuggestionItems`, `atWordStart`, `slashShouldOpen` (S2.1, S2.5); E5 asserts the order |
| R9 | Cmd/Ctrl+K while text is selected is BlockNote's link shortcut (`preventDefault`, no `stopPropagation`) (r3 G16) | palette hotkey returns on `e.defaultPrevented`, matches `e.code === 'KeyK'` (X49, S3.5); E16 |
| R10 | Links open a new window by default, also `/p/...` (r3 G17) | `links.onClick` → `router.push` for same-origin (S2.4); E14 clicks a chip |
| R11 | Object `theme` follows the OS, not the MUI scheme; content font ignores `--bn-font-family` (r3 G13/G14) | string theme from `useColorScheme`; `.bn-default-styles` override (S2.4); manual M-5 |
| R12 | Mantine portals under the MUI app bar / drawers | `--bn-ui-base-z-index: 1150` (S2.4); manual M-5 |
| R13 | Server-action body limit 1 MB < 2 MB page cap (r3 G24, r1 §2.5) | M0's `serverActions.bodySizeLimit: '4mb'` verified in S0.1; zod cap 2 MB (S0.8); int test 2 MB + 1 B → `VALIDATION` |
| R14 | `pagehide` cannot run a server action; keepalive bodies are capped at 64 KiB | keepalive `PUT` ≤ 60 KB, else `beforeunload` prompt (M4-D2, S2.6); E15 |
| R15 | Proxy/`route()` buffering: reading `req.formData()` after `arrayBuffer()` fails; a lying `Content-Length` | buffer once, rebuild a `Response` for `formData()`, length check (S1.7); `files.int.test.ts` length-mismatch case |
| R16 | `file-type`: legacy Office = `cfb`, OOXML sometimes `zip`, csv/txt/svg undetectable (r4 §27) | classifier = detected type + allow-listed extension (S1.7, snippet `classify-upload.ts`); exhaustive unit matrix |
| R17 | Lease and version get conflated (lost edits after takeover) | version is the integrity guard; lease only coordinates UI; displaced editor flushes with its base version; taker edits after a fresh fetch (X63, S1.6, S2.7); E6, `page-lease.int.test.ts` |
| R18 | Lease-expiry tests that sleep 2 minutes; e2e waiting for the 30 s heartbeat | int tests move `expires_at` into the past; e2e pokes `visibilitychange` (M4-D35) |
| R19 | `page.clock.install` fakes app timers; React's scheduler uses `MessageChannel` (not faked), BlockNote/Mantine use `setTimeout` | only E17 installs the clock and advances with `runFor`; if the editor does not mount under the fake clock, fall back to `setFixedTime` and trigger the save with `editor` blur (`th.editor.label` region → Tab) right after the `PUT` (record the change in PROGRESS) |
| R20 | Real `ClipboardItem` needs a secure context + permissions; headless Chromium may refuse `navigator.clipboard.write` | `localhost` is secure; permissions in `playwright.config` (PLAN §4.5, r4 §41 verified); the synthetic route in the same scenario still proves AC-503 if the real one is flaky (record a Known issue, never delete the synthetic case) |
| R21 | Drag & drop of external images bypasses the paste handler and renders `<img src=https://…>` once → the e2e external-request guard would fail | not exercised in e2e; covered by `findForeignMedia`/`sanitize` unit tests and the server sanitiser int test (S2.2, S1.3) |
| R22 | Depth checks with lazily loaded trees (client does not know a collapsed subtree's height) | server is the authority (`VALIDATION maxDepth` → toast + refetch, M4-D23); int tests for subtree height |
| R23 | Concurrent creates/moves produce equal fractional keys | advisory lock per sibling scope + re-key (`keyAt`, X48, S1.3); concurrency int test |
| R24 | Recursive CTEs on soft-deleted rows (restoring under a deleted parent, protection through deleted ancestors) | `effectiveProtection` walks ancestors incl. self; restore checks parent alive; tests in S1.2/S1.5 |
| R25 | `content_text` grows with huge pages; trigram content search slow on 5 000 pages | walker caps at 200 000 chars (S0.6); content search only ≥ 3 chars, `statement_timeout 500ms` in a SAVEPOINT (S1.8) |
| R26 | Search leaks titles of invisible projects through mention suggestions or titles | visibility in SQL (`visibleProjectIds`), titles endpoint returns `{ visible:false }` (S1.4, S1.8); masking K1–K14 |
| R27 | Golden seed now writes charters → older seed/bootstrap count assertions fail | §6 request: orchestrator updates M1's `seed-golden`/`bootstrap` int-test counts; S1 updates `fixtures.int.test.ts` |
| R28 | M2/M3 names unknown to this plan (`createProject` internals, `SidebarProjects`, `PROJECT_TABS`, matrix world mechanism) | S0.1, S1.9, S3.3/S3.6 and S4.1 start by reading the real code; contract changes go to `requests` |
| R29 | `next dev` cross-origin dev resources (`127.0.0.1` vs `localhost`) block the editor chunk (r3 §14.2) | e2e uses the production build on `localhost:3100` (X46); local dev uses `localhost` |
| R30 | M10 later adds `taskView`/`projectWorkload`; a walker that throws on unknown/content-less blocks would break search | walker ignores blocks without inline content or unknown types (M4-D30); `content-text.test.ts` case with an unknown block type |
| R31 | M4 tests that hard-code charter headings, block-type lists, palette option indexes or option counts break when M8/M10 extend the same files | containment assertions, derived parity test, group-scoped palette selectors by name (M4-D37; S0.12, S2.3, S3.5, S4.8, E1, E16) |

---

## 10. Close-out

**`PROGRESS.md` updates (orchestrator, after G4).**
- Milestone table: M4 ✅ with date, commit hash and tag `m4`; "Milestone ปัจจุบัน" → M5.
- Decisions: one line each for X04, X05, X08, X10, X11, X15, X25, X26, X30/X43, X33, X40–X42, X44–X49, X53–X59, X63, X70, X78, X80–X84, X86, X88, X89, X91, X96 (as in §3.1) and
  M4-D1 … M4-D38 (§3.2).
- Deviations: **M4-D1** (`@blocknote/mantine` + Mantine instead of an MUI editor UI — already OWN-2 at M0, reference it) and **M4-D2** (leave-page
  save through the route handler `PUT /api/pages/[id]/content`, keepalive ≤ 60 KB).
- Forward notes for M8/M10 (M4-D37): `BLOCK_TYPES` + exported `checkBlockProps` are the extension points for live blocks; `PALETTE_GROUPS`
  (`src/components/palette/groups.tsx`) and the `Palette` page object (`group`, `pageResults`, `option`) are the extension points for palette groups;
  `normalizeQuery`/`escapeLike` move to `src/lib/search/normalize.ts` in M10 with a re-export. File names per M4-D36 (`page-lease.ts`, `PageTree.tsx`)
  are reported for PLAN §3.1/X63.
- Known issues / forward notes: live blocks `taskView`/`projectWorkload`, their slash items and the charter section "งานและภาระของทีม" → M10
  (X78, M4-D30; charters created before M10 are not migrated); palette categories projects/tasks/people/clients + quick commands → M10 (X08,
  X68), "สร้าง milestone" → M8; home card "หน้าเอกสารที่แก้ล่าสุด" → M10; demo pages → M12 `addDemoPages`; full perf (`seed:perf` 5 000 pages,
  NFR-05/06) and mobile/tablet suites → M12; strict `style-src` nonces → M12 (optional); anything from P-1/P-2 or M-1…M-6 that failed.

**Commit** (orchestrator, after G4):
```text
feat(m4): Notion-style pages with BlockNote, files, edit lease, wiki, charters, page search

Delivers SPEC §4.5 (FR-501–510, FR-520–532, FR-540–543), AC-501–505,
FR-402 (charter on createProject + ensureProjectCharters backfill),
§6.2 pages/page_locks/files, §6.4 page search (Cmd/Ctrl+K palette shell,
pages only), §7.6 uploads (magic bytes, SVG as attachment, headers),
§7.7 subpage/mention/attachment blocks, Thai slash menu, Excel/TSV paste,
lease API, Appendix B templates (charter without the M10 live section),
sidebar Wiki ทีม + project page trees, project tab เอกสาร, authz rows
PERM-16–19 + files/search, masking for search/titles/files.
Deviations: @blocknote/mantine UI (M4-D1), keepalive PUT save (M4-D2).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
(use the attribution trailer the session requires). Then `git tag m4`.
