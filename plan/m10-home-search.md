# M10 — Home, search and live data blocks (หน้าหลัก, การค้นหา และบล็อกข้อมูลสด)

> Depends on: M9 ✅ · SPEC: §4.11 (FR-1101…1105), §4.13 (FR-1301…1307, AC-1301…1303), §3.2 (read rows), §3.3 (masking on
> home, search and embeds), §6.4, §7.8 (`GET /api/pages/:pageId/embed/{tasks,workload}`), §8.1 (🔍 ⌘K), §8.2, §8.6 (`Cmd+K`,
> `N`, `?`), §8.9, §9 (palette first result < 200 ms, mobile = home), §11.2 (masking of embed workload), Appendix B.1,
> §12 M10 · Owner-visible result: after login every user lands on a real `/home` dashboard (my tasks this week with a tick,
> my load for 8 weeks, milestones in the next 14 days, who is on leave, recently edited pages, and for managers who is
> overloaded and the team's utilisation); `Cmd/Ctrl+K` finds projects, tasks, pages (title and content), people and clients
> the user may see and runs the quick commands "สร้าง task", "สร้างหน้า", "แจ้งลา", "ไปหน้าวันนี้"; project pages (and every
> new Project Charter) can hold live "มุมมองงาน" and "ภาระทีมโปรเจค" blocks that read current data through authz.

---

## 1. Goal and scope

Ids `PERM-nn`, `KEY-nn`, `UI-nn`, `NFR-nn`, `MASK-n`, `DM-nn`, `GAPI-nn`, `TPL-Bn` follow `plan/research/r7-traceability.md`
(§3.2 rows in table order; PERM-23 = status sets, X79) and `plan/traceability.md` §2 (v3.1 rows). "S1.4" = stream S1, step 4 (§5).

### 1.1 In scope

| ID | Requirement (short) | Implemented in | Tested by |
|---|---|---|---|
| FR-1101 | `/home` is the first page after login (X32) and shows the cards below | S2.1 RSC page (replaces M0's placeholder) · S1.7 `getHome` · `GET /api/home` | `home.int.test.ts` · `HomeDashboard.test.tsx` · e2e H1–H4 |
| FR-1101a | Card "งานของฉันสัปดาห์นี้" — M9's FR-1009 bucket `THIS_WEEK` (same rule as `/my`); tick to complete (BR-80/82 via M3 `setStatus`, BR-52 toast via M6) | S1.1 · S2.2 `MyTasksCard` | `home.int.test.ts › myTasks` · `MyTasksCard.test.tsx` · e2e H1, H2 |
| FR-1101b | Card "ภาระของฉัน 8 สัปดาห์" — bars coloured per BR-45 + BR-40 glyph + numbers (never colour alone) | S1.2 · S2.2 `MyLoadCard` | `home.int.test.ts › myLoad` (golden r8 §4.10) · `MyLoadCard.test.tsx` · e2e H1 |
| FR-1101c / FR-705 (home part) | Card "Milestone 14 วันข้างหน้า" — visible, non-archived projects; overdue-not-done flagged; BR-70 status + BR-71 ⚠ | S1.3 · S2.2 `MilestonesCard` | `home.int.test.ts › milestones` · masking K4/K5 · e2e H1, H3 |
| FR-1101d | Card "ใครลา" — three lines วันนี้ / สัปดาห์นี้ / สัปดาห์หน้า (X68), visible people only, masked label "ลา" (MASK-5) | S1.4 · S2.2 `LeaveCard` | `leave-lines.test.ts` · `home.int.test.ts › leave` · masking K4/K5 · e2e H1, H3 |
| FR-1101e | Card "เอกสารที่แก้ล่าสุด" — 8 most recently updated pages the viewer can see | S1.5 · S2.2 `RecentPagesCard` | `home.int.test.ts › recentPages` · masking K4 · e2e H1 |
| FR-1101f | Manager-only cards: OVER/RISK this week and next; team utilisation % over 4 weeks (population X67) | S1.6 · S2.2 `ManagerCards` | `home.int.test.ts › manager` (golden F1/F3: 72.5 % / 74.0 %, Peter 10-05 OVER +2.00) · row `HM-HOME` + masking K4 (`manager: null`) · e2e H3 |
| FR-1102 | Cmd/Ctrl+K from every page: projects · tasks · pages (title + content) · people · clients | S0.6 DTOs · S1.8 `searchAll` · S2.3 palette groups + local index | `search.int.test.ts` · `CommandPalette.test.tsx` · e2e P1, P2 |
| FR-1103 | Quick commands: สร้าง task, สร้างหน้า, แจ้งลา, ไปหน้าวันนี้ (X68) | S2.4 `PALETTE_COMMANDS` + flows | `commands.test.ts` · `CommandPalette.test.tsx` · e2e P4 |
| FR-1104 | Results respect §3 per category; filtered in SQL before `LIMIT 8` | S1.8 (visibility sets from `authz.ts`) | rows `SR-*` · masking K1–K3 · `search.int.test.ts › visibility` |
| FR-1105 | Thai substring match via `pg_trgm` (escaped `ILIKE`), e.g. "ลูกค้า" finds "ย้ายข้อมูลลูกค้า" for Cindy/Ivy, not Jack | S1.8 · S0.3 `normalizeQuery`/`escapeLike` | `search.int.test.ts › thai substring` · e2e P1 |
| FR-1301 | Block "มุมมองงาน" (`taskView`): list or board of the page's project with M3's `TaskList`/`TaskBoard`; status change, tick and quick add in place | S3.2–S3.4 · S1.9 embed tasks route | `TaskViewBlock.test.tsx` · `EmbeddedTasks.test.tsx` · `embed.int.test.ts` · e2e B1 |
| FR-1302 | Block props = view config only (view, assignee, milestone, statuses, show done, limit 20 + "ดูทั้งหมด"); no task data in `content` | S0.4 `checkBlockProps` · S3.3 toolbar | `page-content.test.ts › live blocks` · `EmbeddedTasks.test.tsx › limit` |
| FR-1303 | Block "ภาระทีมโปรเจค" (`projectWorkload`): project members × 8 weeks from this week, `load/cap` + BR-45 colour + icon, data and masking = `/api/workload` | S1.10 · S3.5 | `embed.int.test.ts › workload` · masking K6–K8 · `ProjectWorkloadBlock.test.tsx` · e2e B3 |
| FR-1304 | Both blocks are bound to the page's project (no project id in props); copied to another project → that project's data; in a wiki page → "ใช้ได้เฉพาะหน้าในโปรเจค" | S1.9/S1.10 resolve project from `requirePage` · S3.4 placeholder | `embed.int.test.ts › binding` · rows `EMB-*-WIKI` · e2e B2 |
| FR-1305 | Charter template gains "งานและภาระของทีม" with both blocks after "Milestones สำคัญ" (App. B.1; M4-D30) | S0.8 `charterTemplate()` | `templates.test.ts` · `templates.headless.test.ts` · `charters.int.test.ts` (M4, still green) |
| FR-1306 | Freshness: refetch on focus + invalidate after mutation (no push) | S0.5 `invalidateTasks`/`invalidateLoad` extension · S3.3 `refetchOnWindowFocus: 'always'` | `invalidate.test.ts` · `EmbeddedTasks.test.tsx › refetch` · e2e B4 |
| FR-1307 | Blocks add nothing to `content_text` | M4 walker (M4-D30) — test only | `content-text.test.ts › live blocks` · e2e B5 |
| AC-1301 | POS charter: `/มุมมองงาน` → POS board → drag a card to "กำลังทำ" → POS tasks tab shows the same status | S3.4, S3.6 + M3 `setTaskStatus` | e2e B1 |
| AC-1302 | Copy the block from a POS page to a Data Warehouse page → DW tasks; paste into wiki → placeholder | S3.4 + S1.9 | e2e B2 · `embed.int.test.ts › binding` |
| AC-1303 | Worker opens the workload block → loads of projects they are not in show as "งานในโปรเจคอื่น"; the response has no such project name | S1.10 (M9 masking) | masking K6–K8 · e2e B3 |
| PERM-04 (search part) | §3.2 ดูลูกค้า — clients category: M all · L/Me clients of their projects · others nothing | S1.8 | rows `SR-ALL` + masking K1/K3 |
| PERM-06 (search/embed part) | §3.2 เห็นโปรเจค — projects/tasks categories; embed of a project page → W 404 | S1.8, S1.9 | rows `SR-*`, `EMB-T-*` |
| PERM-16 / PERM-17 (embed part) | §3.2 ดูหน้าเอกสาร / wiki — embeds follow `requirePage(view)` | S1.9, S1.10 | rows `EMB-T-*`, `EMB-W-*` |
| PERM-22 (home/search/embed part) | §3.2 ดู workload per §3.3 — home load, manager cards, people category, embed workload | S1.2, S1.6, S1.8, S1.10 | rows `HM-HOME`, `EMB-W-*` · masking K3–K8 |
| PERM-11 (reuse) | Status change / tick / quick add from the embed and the home card go through M3 actions | S2.2, S3.3 (no new action) | existing M3 rows `T-*` (unchanged) · e2e B1, H2 |
| KEY-01 | Cmd/Ctrl+K palette — all categories + commands; respects `e.defaultPrevented` (BlockNote link) | S2.3 | `CommandPalette.test.tsx` · e2e P6 |
| KEY-05 | `N` outside inputs = new task in the current context (fallback: palette "สร้าง task") | S2.6 `useFallbackHotkey` | `useFallbackHotkey.test.tsx` · e2e P5 |
| KEY-06 | `?` dialog lists the palette and home shortcuts | S0.11 registry entries | `shortcuts.test.ts` · e2e P7 |
| NFR-06 | Palette first result < 200 ms | S2.3 local index + 120 ms debounce · S1.8 statement timeout | e2e P3 (timing) · §7.4 perf note |
| NFR-07b (home part) | Home usable on mobile (single column, no horizontal scroll) | S2.2 layout | e2e H4 (390 × 844) |
| UI-04 | Home layout per §8.2 (greeting + Thai date, card grid; **no** quick add in the card — X68) | S2.1, S2.2 | e2e H1 |
| BR-40 / BR-45 (home + embed) | Level glyph + integer bands (`loadTone`, `overloadLevel` from M7) | S1.2, S3.5 | `home.int.test.ts` · `ProjectWorkloadBlock.test.tsx` |
| BR-03 | APIs send integer cd | S0.6 DTOs | `home.int.test.ts › integers` · `embed.int.test.ts › integers` |
| MASK-1/2/3/5/6/7, TST-2 | Masking on the server for home, search, index and embeds | S1.* | `tests/authz/masking.int.test.ts › M10` (K1–K10) |
| DM-16 (queries) | All §6.4 categories use the existing trigram indexes; no new index | S1.8 (no schema change, M10-D29) | `search.int.test.ts › uses index` (EXPLAIN smoke) |
| TPL-B1 (v3.1) | Charter section "งานและภาระของทีม" | S0.8 | `templates.test.ts` |
| GAPI-08 | `GET /api/pages/:pageId/embed/{tasks,workload}` | S1.9, S1.10 | rows `EMB-*` · `embed.int.test.ts` |
| PRIN-P6 | One page answers the main questions; manager sees who is overloaded within one click | S2.2 | e2e H3 |
| FR-1201 (X44) | No new mutating action in M10 (quick commands and blocks reuse M3/M4/M5 actions; preferences are not audited) | — | matrix: no new `mutates` rows; M3/M4/M5 rows unchanged |

### 1.2 Out of scope (do not build)

| Item | Lands in |
|---|---|
| Real-time push of task/workload changes into blocks (Yjs, websockets) | SPEC §13 #1 / FR-1306 note (Phase 2) |
| Live **milestone** block; charter "Milestones สำคัญ" stays static text | SPEC §13 #2 |
| Notion-style database tables, typed columns, sorting/grouping config beyond FR-1302 | SPEC §13 #3 |
| Reordering cards inside a board column (also in the block) | SPEC §13 #8 |
| Migrating existing charters to the new section (users insert the blocks with the slash menu) | never (M4-D30) |
| Audit sweep (M10 adds no mutating action) | M11 §4.12 |
| `seed:demo` pages with filled charters / live blocks (`addDemoPages`) | M11 (X11, C4: fill the existing POS charter) |
| Full perf run of search/palette on `seed:perf` (5 000 pages, 20 000 tasks), mobile/tablet viewport suite | M11 |
| NFKC folding of Thai sara am (U+0E33 vs U+0E4D U+0E32), search highlighting, a full search results page | not in MVP (r6b M10-11, M10-D32) |
| Notifications (mentions, blockers finished) | SPEC §13 #6 |
| Workload page, badge, person page, overload list | M9 (done) |
| ◆ row, milestone CRUD, "สร้าง milestone" command itself | M8 (done; M10 only keeps the command in the new registry) |
| Cost / rate card anywhere on home | SPEC §13 (owner decision pending) |

### 1.3 Carried-in items (deferred to M10 by earlier milestones)

| From | Item | Ruling / where |
|---|---|---|
| M0 | `/home` placeholder (greeting + date + EmptyState) → real dashboard; `/` and post-login stay on `/home` | X32 · S2.1 |
| M3 | `N` on home / outside the tasks tab and grid (M3-D9); palette "สร้าง task"; tasks search category | X08 · S2.4, S2.6, S1.8 |
| M3 | `TaskList` / `TaskBoard` / `TaskCard` reuse in the embed block | X74 · S3.2–S3.3 |
| M4 | Palette categories beyond pages + quick commands; extend `SearchResponse`, `PALETTE_GROUPS`, `tests/authz/rows/search.ts` (C2) | X08, X68 · S0.6, S2.3, S4.1 |
| M4 | `taskView` / `projectWorkload` in `BLOCK_TYPES` + `checkBlockProps` (C1), the charter section, slash items | X78, M4-D30 · S0.4, S0.8, S3.6 |
| M4 | `content-text.ts` already skips content-less blocks — M10 adds a test | M4-D30 · S0.9 |
| M5 | Home leave card; palette "แจ้งลา" via `useLeaveDialog()` | M5 §1.2, M5-D14 · S1.4, S2.4 |
| M6 | BR-52 toast through `statusToastMessage` on the home tick (every DONE path) | X19, X71, M6-D16 · S2.2 |
| M6/M7 | `repo.allocations.loadByUserWeek`, `overloadLevel`, `loadTone`, `formatCd` for the home load card | M6-D24, X06 · S1.2 |
| M8 | Home milestones card from `services.milestones.listVisibleMilestones` + `MilestoneStatusChip` (FR-705 home part); quick commands appended to M8's `PALETTE_COMMANDS` registry (M8-D18) | X08, X66 · S1.3, S2.2, S2.4 |
| M9 | m09 §1.2: `/home` dashboard (my week, 8-week load, manager overload card, team utilisation), Cmd+K people/category search, the `projectWorkload` block + `GET /api/pages/:pageId/embed/workload` — reusing `services.workload.buildTable` (embed workload with `userIds` = project members, `[]` = nobody; manager cards), `personCells` (my load), `listMyTaskBuckets` bucket `THIS_WEEK` (my tasks), `WorkloadCell` UI + `viewTone`/`workloadCellText` | X67, M9-D2/D3 · S1.1, S1.2, S1.6, S1.10, S2.2, S3.5 |
| r7 | KEY-06 `?` registry entries for palette scope | X07 · S0.11 |

### 1.4 Assumptions about M8 and M9 (written in parallel; verified in S0.1)

M8 and M9 were finished while this file was written; their names are used verbatim (rows A1–A6, A7–A10). M10 relies on PLAN.md names first; the names below are the
expected exports. **S0.1 greps the real code and the step that uses a name adapts to the real one without changing behaviour**
(report every difference; never invent a third name). Every item is also listed in the final report as a cross-milestone concern.

| # | Expected (from PLAN / r6b) | Used by | If different |
|---|---|---|---|
| A1–A6 | **Resolved — `plan/m08-milestones.md` is written** (coordinator, 2026-10-30): table `milestones` (M8 S0); `milestoneStatus(m, today)` (BR-70); home card data from `services.milestones.listVisibleMilestones(tx, user, { from, to }, today): Promise<CalendarMilestone[]>` (status + `late` computed by M8, archived/deleted projects excluded, `date ∈ [from, to)`); UI `MilestoneStatusChip` + `MilestoneLateBadge` (`src/components/milestones/`); `TaskDTO.milestoneId`/`lateForMilestone`, `ProjectTasksResponse.milestones: MilestoneRef[]`, `TaskCard` optional `milestone?` prop (M8-D13/D15); query keys `qk.milestoneTargets()`, `qk.projectMilestones(projectId)`, `invalidateMilestones(qc, projectId)` (M8-D22); palette registry `src/components/palette/commands.ts` (`PALETTE_COMMANDS`, `PaletteCommand { id; label; keywords; useVisible(); run(ctx) }`, `PaletteCommandCtx`, `matchCommand`, rendered by `CommandsGroup` above `PALETTE_GROUPS`, M8-D18); factories `makeMilestone({ project, name?, date, createdBy, … })`, world `'milestones'` (`w.milestones.{p, pLate, pDone, q, a}`), builder `addMilestones(db)`, e2e `resetDb(fixture?, { milestones: true })`; `getCalendar(tx, viewer, range, today)` gained `today` (M8-D16). | S1.3, S1.4, S2.2, S2.4, S3.3, S0.12, S4 | names used verbatim below |
| A1b | **m08 reviewed 2026-10-30 (source of truth):** `PaletteCommandCtx` is built only in `useCommandCtx()` (`src/components/palette/PaletteProvider.tsx`) and is open for additive fields (C48/C75); `fakeCommandCtx(over)` in `src/components/palette/commands.test-utils.ts`; `projectIdFromPath(pathname)` (`commands.ts`); `useVisibleCommands(q)`; `CommandsGroup` renders **nothing** when no command is visible; `buildStatusColumns` options gain `milestone: 'ALL' \| 'NONE' \| string` (M8 S4.7); `TaskCard` gains `milestone?: { name: string; late: boolean } \| null` (C78); e2e `Palette.commands()` / `runCommand(label)`. | S2.4, S2.5, S3.3, S4.3 | names used verbatim below |
| A11 | **m02/m03/m04 (reviewed):** M2 `repo.members.listMembers(tx, projectId)` (`src/server/repo/members.ts`) and `repo.projects.getProject(tx, id)`; M3 `TaskBoard<C>(p: TaskBoardProps<C>)` with the props **pinned in m03 S3.16**: `columns`, `renderCard(card: C): ReactNode`, `onMove(cardId: string, toColumnKey: string): void`, `canEdit`, `footer?(column: BoardColumn<C>): ReactNode`; `TaskCardProps` = `card`, `statuses`, `canEdit`, `blockerNames?`, `onOpen(taskId)`, `onPickStatus(taskId, statusId)`, `onToggleDone(taskId)` (+ M8's `milestone?`); rows map to cards with M3's `toCardModel(row, statuses, certainty)` (S1.4); `TaskListProps { projectId }` (m03 S3.4) with room for M10's additive `embed?` (M10-D9); M4 `PALETTE_GROUPS` in `src/components/palette/groups.tsx` with `map({ server })`, `checkBlockProps` exported, `normalizeQuery`/`escapeLike` exported from `services/search.ts`, e2e `Palette.group(heading)` (with its `[cmdk-group]` fallback), `option(name)`, `pageResults()`. | S1.10, S2.3, S3.2, S3.3, S4.3 | adapt only inside M10's own files (`EmbeddedTasks`, `services/embed.ts`) and report |
| A7–A10 | **Resolved — `plan/m09-workload-people.md` is written** (coordinator, 2026-10-30; under review in parallel — the names listed in HANDOFF §7 "From T5b" stay): `services.workload.buildTable(tx, viewer, { window: { from, to }, positionId?, projectId?, onlyOver?, userIds? }, today): Promise<WorkloadResponse>` (`userIds` = "restrict to these people, still ∩ visible", added for the M10 embed); `services.workload.personCells(tx, viewer, userId, window): Promise<Record<ISODate, WorkloadCell>>` (home "ภาระของฉัน"); DTOs `WorkloadResponse`, `WorkloadPerson`, `WorkloadCell { total, committed, capacity, standard, level, excess, cause, byProject: WorkloadProjectPart[] }`, `WorkloadProjectPart { projectId: string \| null; total; committed }`, `OverloadItem`; the load view is **not** a server parameter (M9-D2: the client colours with `viewTone`); population M9-D3 (5 golden workers); UI `src/components/workload/WorkloadCell.tsx` + helpers `workloadCellText`, `compactDays`, `tooltipLines`, `viewTone` (domain); masking helpers `maskProjectParts`, `maskCellItems`; `authz.requireVisibleUser`; `/people/[id]` → `/people/[id]/plan` (404 outside visibility); `/my` returns `MyTaskBucketsResponse` (`listMyTaskBuckets`, `bucketOf`, `MY_BUCKETS`, bucket `THIS_WEEK`); M9 query keys `qk.peopleDirectory`, `qk.projectLoad`, `qk.clientLoad`, `qk.personTimeOff`; `invalidateLoad` also invalidates `['sidebar']`; nav badge kinds `'myTaskCount' \| 'workloadOver'`. | S1.1, S1.2, S1.6, S1.10, S2.2, S3.5 | names used verbatim below |

---

## 2. Read first

- **SPEC:** §0–§3 (all), §4.11 (all), §4.13 (all), §4.6.3 (FR-660–664, the components the block reuses), §4.7 FR-704/705/706,
  §4.10 FR-1001–1003, §5.6 (BR-40, BR-41, BR-45), §5.7 BR-50/52, §5.9 BR-70/71, §6.4, §6.5, §7.3, §7.8, §8.1, §8.2, §8.5, §8.6,
  §8.8, §8.9, §8.10, §9, §11.2, §12 M10, §13, Appendix B.1.
- **PLAN.md:** §1.2 (cmdk 1.1.1, BlockNote 0.55 pins), §1.3 (Next `refresh()`, BlockNote Cmd+K `defaultPrevented`, cmdk, TanStack,
  Playwright clock), §1.4 **X05, X08, X09, X18, X19, X30, X32, X40–X47, X49, X53, X56, X57, X59, X60b, X63, X66, X67, X68, X71,
  X74, X78**; §2.3 (ownership; th.ts namespaces); §3.4 (errors, `action()`, `route()`, authz API, masking, transactions); §3.5
  (query keys `search`, `home`, `workload`, `invalidateLoad`); §3.6 (units, `formatCd`, `formatThaiDate`); §3.7 (i18n, templates);
  §3.8 (undo, hotkeys); §3.9 (MUI, `StatusGlyph`); §3.11 (editor); §4 (testing, world, matrix, masking, e2e).
- **Plan files (names reused, read the listed parts):** `plan/m03-tasks.md` S0.4–S0.10 (schemas, `ProjectTasksResponse`, actions,
  `invalidateTasks`), S1.4 `board.ts`, S3.1 (`useProjectTasks`, `useTaskMutations`, undo matrix), S3.4 (`TaskList` + `N`), S3.16
  (`TaskBoard`), S2.10 (`listProjectTasks`, `listMyTasks`); `plan/m04-pages-editor.md` S0.6, S0.8 (`BLOCK_TYPES`,
  `checkBlockProps`), S0.9 (`palette`, `editor` namespaces), S0.10 (`SearchResponse`), S0.12 (`charterTemplate`), S1.8
  (`searchPages`, `escapeLike`, `normalizeQuery`), S2.3 (schema parity), S2.5 (slash menu), S3.5 (`PaletteProvider`,
  `CommandPalette`, `PALETTE_GROUPS`), S4.5–S4.8 (search rows, masking K-cases, palette page object); `plan/m05-calendar-capacity.md`
  S0.8 (`maskTimeOff`), M5-D8 (`getCalendar`), M5-D14 (`useLeaveDialog`), S0.9 (`formatThaiDateRange`, `formatLeaveRange`);
  `plan/m06-weekly-grid.md` S2.1 (`loadByUserWeek`, `WeekRange`), S1 (`formatCd`), S4.2 (`statusToastMessage`), S0.11 (world
  `'allocations'`); `plan/m07-daily-resolution.md` S1.10 (`overloadLevel`, `loadTone`, `worstLevel`).
- **Research:** `plan/research/r6b-gaps-m6-m11.md` §3.5 (M10-01…M10-11), §4.5 (workload DTO), §4.6 (search SQL), §5 M10 tests, E4/E6/E7;
  `plan/research/r8-golden.md` §4.1 (time anchors), §4.3 (visibility), §4.6 (manager card, utilisation), §4.9 (A.2 milestones),
  §4.10 (home facts), §3.2 D2 (Cindy must not see Mobile's milestone); `plan/research/r4-client-testing.md` §21 (cmdk in MUI Dialog),
  §22 (Dialog slots), §38 (Playwright clock); `plan/research/r3-blocknote.md` §4 (custom blocks: `createReactBlockSpec`,
  `content: "none"`, headless editor), §5 (suggestion menus, `rankSuggestionItems`), §15 G16 (Cmd+K vs link popover);
  snippets `plan/research/snippets/r4/client/components/palette/CommandPalette.tsx`, `snippets/r3/harness/src/slashMenu.tsx`
  (`insertOrUpdateBlockForSlashMenu`), `snippets/r3/harness/src/blocks/subpage.tsx` (block skeleton),
  `snippets/r4/client/app/projects/p/page.tsx` (server prefetch + `HydrationBoundary`); `r7-traceability.md` §F M10 rows, §H M10 row.
- **Where research disagrees with PLAN/SPEC (resolved here):** r6b M8-06 ("home shows milestones of projects where the person has
  assignments") → FR-1101 text "ของโปรเจคที่ฉันเห็นได้" wins (M10-D15); r6b X-13 ("landing `/my` until M10") → X32 (landing is
  `/home` since M1); r6b §4.6 `ORDER BY similarity()` → X68 `word_similarity`; the §8.2 mock's "+ เพิ่มงาน…" and "สัปดาห์หน้า" line
  → X68 (no quick add; three leave lines); §8.2 mock "◆ 9 ต.ค. Design freeze" on Cindy's home → hidden (r8 D2).
- **docs/:** none needed (`docs/reference/golden-fixtures.json` is read only through `seedGolden`/`applyFixture`).

---

## 3. Decisions for this milestone

### 3.1 Applicable cross-milestone rulings (PLAN §1.4)

| ID | What it means in M10 |
|---|---|
| X05 / X59 | One new preference key `palette.lastProjectId` (uuid or null), added by M10 (first consumer), saved through M1's debounced `setPreference`, never `localStorage`, not audited. |
| X08 | M10 completes the palette: projects, tasks, people, clients categories and the four quick commands on M4's shell; M8's "สร้าง milestone" stays. |
| X09 | `GET /api/people/options` stays readable by everyone, but the palette's **people category** uses the visibility-filtered index (M10-D21), so a person result never leads to a 404. |
| X18 | `invalidateTasks` additionally invalidates `qk.home()` and the `['embed','tasks']` prefix; `invalidateLoad` additionally `['embed','workload']` (already `home`). |
| X19 / X71 | The home tick calls M3's `completeTask`/`uncompleteTask` (→ `services/taskStatus.ts#setStatus`); the toast text comes from M6's `statusToastMessage` (BR-52). |
| X30 / X43 | Visibility sets come from `authz.visibleProjectIds` / `visibleUserIds` / `canSeeLeaveDetails`; SQL filters with them; masking stays in `services/masking.ts` (M5 leave) and M9's workload service. |
| X32 | `/home` (RSC) replaces the placeholder; login and forced password change keep landing there. |
| X40 | `pnpm check` runs the integration project (home/search/embed tests need `pnpm db:up`). |
| X41 | Invisible page → embed 404 (`NOT_FOUND`); malformed id → 404 (X86, same as M2/M4/M9); unauthenticated → 401; no route of M10 returns 403 (all are reads). |
| X42 | Embeds of archived projects are readable; the embedded list/board is read-only (`viewer.canEdit = false`); archived projects are excluded from the create-task picker and from home tasks/milestones (still searchable with a chip). |
| X44 | M10 adds no mutating server action, so no new audit rows; quick commands and blocks reuse audited M3/M4/M5 actions; block config changes are ordinary page saves (`savePageContent`, audited without content). |
| X45 | "Today", the greeting hour, week windows and relative times use `serverNow()`/`serverToday()` (honours `APP_NOW` under `ALLOW_TEST_HOOKS=1`); the client gets `today`/`now` from the response or `useToday()`. |
| X46 | `e2e/m10-home-search.spec.ts` on the production build with `resetDb`, `loginAs`, pinned clock (`2026-09-30T10:00:00+07:00`) and page objects. |
| X47 | `z.uuid()`; every Thai string from `th`; no `refresh()` in M10 (no action is added; TanStack invalidation only). |
| X49 | `Cmd/Ctrl+K` matches `e.code === 'KeyK'` and returns early on `e.defaultPrevented` (BlockNote link popover); `N` = `KeyN`, ignored in editable targets. |
| X53 | No `localStorage`; ids come from the server (palette create flows never mint ids on the client). |
| X56 | `services/{home,search,embed}.ts` take `today` as a parameter and import no request context. |
| X57 | `/home` has no `loading.tsx` and no Suspense above it (it never 404s, but the layout's authz must run first). |
| X60b | Leave lines reuse M5's masked shape `{ userId, start, end, half, label }` (no type, colour, note or id for masked viewers). |
| X63 | Embeds resolve the page through `requirePage(view)`; mention/title rules unchanged. |
| X66 | Home milestone status uses M8's BR-70 function (`DUE_SOON` when `0 ≤ date − today ≤ 7`); soft-deleted milestones are ignored. |
| X67 | The workload block and the manager cards reuse M9's service: colour follows the block's view (total / committed / tentative palette), the glyph always shows the BR-40 level, integer bands, excess per X67, population per X67 (5 golden workers, the manager excluded). |
| X68 | Followed exactly: greeting by Bangkok hour; three leave lines; no quick add on home; escaped `ILIKE` + `word_similarity` ranking; page title hits first, content only for ≥ 3 characters (unordered, `LIMIT 8`); `SET LOCAL statement_timeout = '500ms'`; ≤ 8 per category; visibility in SQL; the four quick commands. |
| X74 | `TaskBoard`/`TaskCard` are reused as-is; `TaskList` gains an additive `embed` option (M10-D9). Preference `tasks.view` is **not** used by the block (its view is a block prop). |
| X81–X93, X95 (2026-10-30 contracts) | X81 routes `api/home`, `api/search`, `api/search/index`, `api/pages/[id]/embed/{tasks,workload}` (param keeps its sibling's name `[id]`); X82 keys `searchIndex`, `pageEmbedTasks(All)`, `pageEmbedWorkload(All)`, `search(q, 'all')`, invalidations (S0.5); X83 `getJson`; X86 malformed page id → 404 (M10-D1); X87 services `home`, `search`, `embed`; X88 palette (`PALETTE_GROUPS` in `groups.tsx`, `PALETTE_COMMANDS`, `CommandsGroup` first, `useCommandCtx`/`fakeCommandCtx`/`projectIdFromPath`, `[cmdk-group]` fallback); X89 `useFallbackHotkey`, `LiveBlockFrame` isolation, `BLOCK_TYPES` + exported `checkBlockProps`; X90 services take `today`; X91 rows files registered in `tests/authz/rows/index.ts`, `resetDb(fixture?, opts)`; X93 no new audit entity; X95 home "this week" = M9's `THIS_WEEK` bucket. |
| X78 | Followed exactly: `taskView`/`projectWorkload` with view-config props only; `GET /api/pages/:pageId/embed/{tasks,workload}` → `requirePage(view)` → the page's project; wiki → placeholder; Thai slash items with aliases; the walker skips both; the charter section; masking tests for embed workload. |

### 3.2 Milestone-specific decisions

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M10-D1 | §7.8 | Route files are `src/app/api/pages/[id]/embed/tasks/route.ts` and `…/embed/workload/route.ts` (param `id`): Next does not allow a `[pageId]` segment next to M4's existing `[id]` siblings (PLAN §3.1 / X81: a route param keeps the name of its sibling folder). The public path is identical to SPEC (`/api/pages/<pageId>/embed/…`). M1's `route()` does not validate params (X86), so each M10 handler parses them itself: `embedParamsSchema.safeParse(params)` → failure → `throw new NotFoundError()` (**404**, like an unknown or invisible id — X86, same as M2/M4/M9) before any query; rows `EMB-T-BAD`/`EMB-W-BAD`. | Technical constraint, zero behaviour change. |
| M10-D2 | §7.8, FR-1301 | Per SPEC §7.8 (comment reworded 2026-10-30: "คืนข้อมูลรูปแบบเดียวกับแท็บงานของโปรเจคนั้น … สิทธิ์การมองเห็นเท่ากับ /api/tasks"), the embed tasks route returns `{ kind: 'project', projectId, projectName, tasksHref, data: ProjectTasksResponse }` built by M3's `listProjectTasks` — the same payload as the project's tasks tab, so the block reuses `TaskList`/`TaskBoard` (FR-660–664) unchanged. SPEC's `?view=BOARD&…` query is optional: M10's client sends none and the route ignores query parameters (view and filters are applied on the client, M10-D6). The client seeds `qk.projectTasks(projectId)` with `data`, so M3's mutations, optimistic patches and undo work unchanged. Not a deviation. | One component set (X74); identical authz (`requireProject(view)`); no second task DTO. |
| M10-D3 | FR-1304 | A WORKSPACE page returns **200** `{ kind: 'wiki' }` from both embed routes (no project data); the block shows `th.editor.liveBlocks.wikiOnly`. Invisible or deleted page → 404; a malformed page id → 404 too (X86; the handler parses `params`, see M10-D11/S1.9). Archived project → tasks with `viewer.canEdit = false`; workload with `archived: true` (M10-D11). | FR-1304 placeholder; X41/X42. |
| M10-D4 | FR-1302, FR-1304 | Block props. `taskView`: `{ view: 'LIST' \| 'BOARD' = 'BOARD', assigneeId: string = '', milestoneId: string = '', statusIds: string = '' (comma-separated uuids, ≤ 12), showDone: boolean = false, limit: 10 \| 20 \| 50 \| 100 = 20 }`. `projectWorkload`: `{ view: 'ALL' \| 'COMMITTED' \| 'AT_RISK' = 'ALL' }`. No project id. After a copy to another project, unknown status/milestone ids are ignored (if none remain, that filter is off). Server `checkBlockProps` rejects any other prop key, a non-empty `content` and non-empty `children` on these two types (`VALIDATION contentInvalid`). | P1/P7: view config only; data never stored in `content` (FR-1302). |
| M10-D5 | FR-1301, FR-1303, FR-520 | Slash items: `มุมมองงาน` (aliases `tasks`, `board`, `list`, `task view`, `งาน`, `บอร์ด`, `มุมมอง`) inserts `{ type: 'taskView', props: { view: 'BOARD' } }`; `ภาระทีม` (aliases `workload`, `team`, `load`, `ภาระ`, `ภาระทีมโปรเจค`) inserts `{ type: 'projectWorkload' }`; group `ข้อมูลสด`; inserted with `insertOrUpdateBlockForSlashMenu`. Offered only on PROJECT pages (a wiki page would only show the placeholder); pasted blocks in wiki pages still render the placeholder. | AC-1301 "ได้บอร์ด"; less clutter in the wiki. |
| M10-D6 | FR-1302 | Filters are applied on the client to `ProjectTasksResponse` (the whole project is loaded anyway, as on the tasks tab). `limit` = maximum **rows** in list view (DFS order; a shown child keeps its visible ancestors as context rows that do not count) and maximum **cards per column** in board view. When anything is cut off, a link `th.editor.liveBlocks.seeAll(n)` goes to `/projects/<id>/tasks`. | Simple, no new query; a board needs every column visible. |
| M10-D7 | FR-1302, FR-1301 | The block header shows a title (`th.editor.liveBlocks.taskViewTitle` / `workloadTitle`) and, **only when the editor is editable**, a config toolbar (view toggle, filters, limit) that writes props with `editor.updateBlock` (autosaved as page content). Task interactions (drag, status, tick, quick add) depend on `data.viewer.canEdit` only, so they still work while another user holds the page lease or the wiki-style protection applies to the page text. | Tasks are not page content; PERM-11 ≠ PERM-16 lease. |
| M10-D8 | FR-1301 | Event isolation: the block root is `contentEditable={false}` with **native** listeners (attached in `useEffect`) that `stopPropagation()` for `keydown`, `keypress`, `beforeinput`, `paste`, `copy`, `cut`, `mousedown`, `pointerdown`, `dragstart`, `drop` so ProseMirror never acts on events from inside the live view; exceptions: `Mod+K` (palette) passes through; `Mod+Z` / `Mod+Shift+Z` outside inputs call the app `useUndo()` and are stopped (M1's global undo listener ignores targets inside `.bn-editor` via `isEditableTarget`, so the frame must call it itself). The S3.1 spike confirms the behaviour in BlockNote 0.55 before S3.4. One shared frame (`LiveBlockFrame`) holds the rule, proposed for PLAN §3.11 (G47). | ProseMirror listens natively on `.ProseMirror`; React `stopPropagation` cannot stop it (r3 §4 render notes). |
| M10-D9 | FR-1301, X74 | `TaskList` gets one optional prop `embed?: TaskListEmbedOptions` = `{ filter(t: TaskDTO): boolean; limit: number; onOpenTask(taskId: string): void; onCount?(shown: number, total: number): void }` (the block's `showDone` is folded into `filter`; completed rows are otherwise kept). When set: the `tasks.groupBy`/`tasks.sort`/`tasks.showCompleted` preferences are ignored (grouping `none`, sort `manual`), no window-level `N` hotkey, no `TaskPanel`, no bulk bar, no archived banner (the block shows its own), tree drag disabled (`ops = false`), Space/open-button → `onOpenTask` (navigates to `/projects/<pid>/tasks?task=<id>`). Without it M3 behaviour is unchanged (C44). | Reuse without forking M3's component; no global key capture from inside a document. |
| M10-D10 | FR-1306 | Embed queries use `staleTime: 0`, `refetchOnWindowFocus: 'always'`, `refetchOnMount: 'always'`; their success seeds `qk.projectTasks(projectId)`. M3's `invalidateTasks` invalidates the `['embed','tasks']` prefix and `qk.home()`; `invalidateLoad` invalidates `['embed','workload']`. | FR-1306 "กลับมาหน้านี้ → ค่าล่าสุด" even within 60 s. |
| M10-D11 | FR-1303, X67, M9-D2/D3, X42 | `GET /api/pages/:id/embed/workload` (no query parameters) → `members = (await repo.members.listMembers(tx, page.projectId)).map((m) => m.userId)` (M2's members repo — no M10 repo helper, C50) → M9 `services.workload.buildTable(tx, viewer, { window: { from: weekStart(today), to: addWeeks(weekStart(today), 8) }, userIds: members }, today)` (∩ `visibleUserIds` and the M9-D3 population inside M9), flattened to `people[]` sorted with `compareThai` by display name; cells are M9's `WorkloadCell` (masked parts `projectId: null`); `projects` = only the visible names M9 returns. The view (`ALL` / `COMMITTED` / `AT_RISK`) is a block prop applied on the client with `viewTone` (M9-D2), so switching views never refetches. **Archived project (C49):** same call, no special case — M9-D3 keeps only members who are active members of another non-archived project or have load in the window, and BR-44 means the archived project's own allocations are not counted (no part with its id, no key in `projects`); the response carries `archived: true` and the block shows `th.editor.liveBlocks.workloadArchived` above the table. | "ข้อมูลและการปกปิดเหมือน /api/workload" by construction — same function, no copy of masking or population rules. |
| M10-D12 | FR-1305, App. B.1, M4-D30 | `charterTemplate()` inserts, right after the "Milestones สำคัญ" paragraph: h2 `งานและภาระของทีม`, `{ type: 'taskView', props: { view: 'BOARD' } }`, `{ type: 'projectWorkload', props: {} }`. Charters created before M10 (including the 5 golden ones in an existing DB) are not migrated; `seedGolden` creates charters **after** M10 with the section (new DBs, tests, e2e). | Appendix B.1; M4-D30. |
| M10-D13 | FR-1101a, FR-1009, M9 | "This week" = the `THIS_WEEK` bucket of M9's `listMyTaskBuckets(tx, user, today)` (`bucketOf`: first counted plan week = this week), so home and `/my` never disagree; items keep M9's order; at most 20 + `th.home.myTasks.more(n)` + link to `/my`. Each item shows project, parent name and `plannedCd` (my cd this week, `formatCd` 1 decimal). After a tick the row is struck through optimistically and leaves the card on the next refetch (completed tasks are not in the buckets); the undo toast (8 s, Cmd+Z) brings it back. Due-date-only tasks stay in `/my`'s buckets (no second rule on home). | One FR-1009 rule (r7's "or due this week" proposal dropped for consistency with M9). |
| M10-D14 | FR-1101b, BR-45, X67 | Load bars = 8 Mondays from ws from M9's `personCells(tx, user, user.id, { from: ws, to: ws + 8 weeks })`; the client colours each bar with `viewTone({ total, committed }, capacity, 'ALL')` (home has no view switch → "ทั้งหมด") and shows the BR-40 `level` glyph; text = M9's `workloadCellText(total, capacity)`; bar height = `min(total, 2·cap)` scaled; `aria-label` = `th.home.myLoad.barLabel(...)`. | Never colour alone (§8.9); same cell semantics as `/workload`. |
| M10-D15 | FR-1101c, FR-705 | Milestones = `services.milestones.listVisibleMilestones(tx, user, { from: addDays(today, -28), to: addDays(today, 15) }, today)` (M8: live milestones of visible, non-archived projects, server-computed `status` and `late`), keeping items with `status !== 'DONE'` and (`date ≥ today` **or** `status === 'OVERDUE'`); overdue first, then by date, name; at most 10. Overdue look-back is bounded to 4 weeks (P4 without an unbounded query). UI: ◆, date, name, project chip, M8's `MilestoneStatusChip` and `MilestoneLateBadge` when `late`. FR text beats r6b M8-06 (no "has assignments" filter). | FR-1101 "ของโปรเจคที่ฉันเห็นได้"; reuse M8 (no second milestone query). |
| M10-D16 | FR-1101d, §3.3 | Leave lines from M5's `getCalendar(tx, viewer, { from: ws, to: ws + 14 }, today)` (M8 added `today`) (visible people, masked entries): วันนี้ = entries covering today; สัปดาห์นี้ = entries overlapping `[ws, ws + 6]` **not already listed under วันนี้**; สัปดาห์หน้า = entries overlapping `[ws + 7, ws + 13]`. Item = display name + `formatLeaveRange` + (only `kind 'full'`) the leave type name. Empty line → `th.home.leave.none` ("—"). Holidays are not listed. | X68 three lines; no duplicate rows. |
| M10-D17 | FR-1101e | Recent pages = 8 live pages ordered by `updated_at desc, id` among WORKSPACE pages and PROJECT pages of visible projects (archived included, X43); item = icon, title (or `th.pages.untitled`), project name or `th.palette.wiki`, `th.home.recentPages.editedBy(name, formatRelative(updatedAt, now))` where `now` comes from the response. | §8.2 mock; one clock. |
| M10-D18 | FR-1101f, X67, M9-D3 | Manager cards: overloaded = `buildTable(tx, user, { window: { from: ws, to: ws + 2 weeks }, onlyOver: true }, today).overloads` (M9 `OverloadItem[]`: OVER and RISK, sorted week ↑, OVER first, name; `href` = M9's `/people/<id>/plan?week=<w>`); utilisation = a second `buildTable(... { window: { from: ws, to: ws + 4 weeks } })` summed per week over M9's population (`Σ cell.total / Σ cell.capacity`) as integer tenths of a percent half-up (`percentTenths`), cap 0 → "—", committed % next to it. Workers get `manager: null`. | X67/M9-D3 population; golden F1 72.5 %, F3 74.0 % (r8 §4.6). |
| M10-D19 | FR-1101, X68 | Greeting key from the **Bangkok hour of `serverNow()`**: 05:00–11:59 morning, 12:00–17:59 afternoon, else evening; date line `formatHomeDate(serverToday())` = "พุธ 30 ก.ย. 2569"; both rendered by the RSC (no hydration mismatch). Name = `displayName(user)`. | r6b M10-07. |
| M10-D20 | FR-1102, FR-1104, X68 | Categories (≤ 8 each, visibility in SQL): **projects** = `visibleProjectIds` incl. archived (chip); **tasks** = live tasks of visible projects (archived chip), open before completed; **pages** = M4 `searchPages`; **people** = `visibleUserIds` (deactivated labelled), matched on `name` and `nickname`; **clients** = all for managers, otherwise clients of visible projects (archived chip). Order: `word_similarity(q, col) desc, length(col), id` (tasks: `completed_on is null` first). | r6b M10-04; FR-1104. |
| M10-D21 | NFR-06, FR-1102 | `GET /api/search/index` returns the viewer's visible projects (+ `role`, `archived`, `color`), people and clients (≤ a few hundred rows). The palette prefetches it when the shell mounts and refetches on open; projects, people and clients are matched **locally** (instant, `matchLocal`), tasks and pages come from `GET /api/search` (120 ms debounce, aborted on change). The server endpoint still returns all five categories (contract, tests, fallback when the index failed). | r6b M10-01/10: first result < 200 ms. |
| M10-D22 | FR-1102/1103, M8-D18 | Palette layout: M8's `CommandsGroup` (heading `th.milestones.palette.group` "คำสั่ง", unchanged) first — all visible commands on an empty query, `matchCommand` filtering otherwise (M8's `useVisibleCommands(q)`); it renders **nothing** when no command is visible/matching — then the result groups from M4's `PALETTE_GROUPS` (`src/components/palette/groups.tsx`) in FR-1102 order: projects, tasks, pages, people, clients. Result items `value = '<kind>:<id>'`; command items keep M8's `cmd:<id>`. Neither structure is restructured: M10 appends four `PaletteCommand` entries and four `PALETTE_GROUPS` entries; `PaletteGroupDef` gains only **optional** fields (`source?`, `map` input `local?`), so M4's `map({ server })` call and its pages entry compile unchanged. | Discoverability; one registry (M8). |
| M10-D23 | FR-1103, X68, M8-D18 | Command entries appended to `PALETTE_COMMANDS` (ids `task.create`, `page.create`, `leave.report`, `nav.today`; `keywords` strings from `th.palette.commands.*`; `useVisible` = always true except `task.create` = the index has ≥ 1 non-archived project). Flows: **สร้าง task** → current project (M10-D24) or a project picker (non-archived projects where the viewer is M/L/Me; last used first from `palette.lastProjectId`) → name input (name only, P1) → `createTask({ projectId, name })` → toast `th.palette.createTask.created(name, project)` with action "เปิด" (→ `/projects/<pid>/tasks?task=<id>`) + M3 undo entry (`deleteTaskTree`); **สร้างหน้า** → `createPage({ space: 'PROJECT', projectId, parentId: null })` in the current project, else `{ space: 'WORKSPACE', projectId: null, parentId: null }` → navigate to `/p/<id>` (blank page → M4 template chooser); **แจ้งลา** → `useLeaveDialog().open({ mode: 'create' })`; **ไปหน้าวันนี้** → `router.push('/home')`. | r6b M10-05; reuse audited actions. |
| M10-D24 | FR-1103 | "Current project" = the project of `/projects/[id]/**` routes or of a PROJECT page `/p/[pageId]`, registered with `usePaletteProjectScope(project)` (a small context); M10 changes M8's `useCommandCtx()` so that `currentProjectId = scope?.id ?? projectIdFromPath(pathname)` (M8's helper as the fallback; a project page `/p/<id>` also counts through the scope, C48/C75). Archived scope → no current project for M10's create commands (M8's milestone dialog already pre-selects only targets). | Explicit, testable; one ctx for M8 and M10 commands. |
| M10-D25 | §8.6 `N`, KEY-05 | `N` fallback: `useFallbackHotkey(HOTKEYS.newTask, handler)` listens on `window` (bubble), ignores editable targets, and runs the handler in a `setTimeout(0)` only if no other listener called `preventDefault()` during that dispatch. M3's tasks-tab `N` (focus quick add) and M6's grid `N` keep precedence without code changes, because M0's `useHotkeys` calls `e.preventDefault()` whenever it handles a binding (m00 S2.8); everywhere else `N` opens the palette in "สร้าง task" mode. M1's `isEditableTarget` also matches `closest('.bn-editor')`, so `N` typed in a page (incl. inside a live block) never reaches the fallback. Rule proposed for PLAN §3.8 (G46): a page-local binding = `useHotkeys` (wins); a global default = `useFallbackHotkey`. | No edits to M3/M6 handlers; deterministic. |
| M10-D26 | FR-1105, X68, M4-D37b | `normalizeQuery` and `escapeLike` move to the isomorphic `src/lib/search/normalize.ts` (M4's `services/search.ts` re-exports them, so M4's `src/server/services/search.test.ts` keeps importing from `@/server/services/search` and stays green unchanged); `matchLocal` (client) uses the same normalisation (NFC, zero-width removal, whitespace collapse, Latin lower-case). Server queries are debounced 120 ms on the client. | One normalisation for local and server matches. |
| M10-D27 | X05 | Preference key `palette.lastProjectId: z.uuid().nullable()` default `null`. | Remember the picker choice (r6b M10-05). |
| M10-D28 | §3.7 | i18n: extend `home`, `palette`, `shortcuts`, `editor` (`slash.taskView`, `slash.projectWorkload`, `liveBlocks`), `prefs` if M1 lists key labels there; new namespace `search`. M0's `home.placeholderTitle/Body` are removed (no consumer). | PLAN §3.7 namespaces. |
| M10-D29 | §6.4, X10 | No schema change in M10: every §6.4 trigram index exists (`user_*_trgm` M1, `projects/clients_name_trgm` M2, `tasks_name_trgm` M3, `pages_*_trgm` M4) and the Thai-trigram check exists (M0). G2 expects `pnpm db:generate` → "No schema changes". | Nothing to migrate. |
| M10-D30 | NFR-06 | E2E P3 measures keystroke → first option visible with `performance.now()` inside the page (local category, golden data) and asserts < 200 ms; `search.int.test.ts › timing` logs the server search duration and fails only above 500 ms (statement timeout); the full-scale check is M11's. | Deterministic on CI; real target in M11. |
| M10-D31 | FR-1301, FR-1303 | Live blocks render (read-only data) in every page view mode: read-only lease, protected wiki text, archived project, and the read-only editor. Only the config toolbar depends on `editor.isEditable`. | Viewing data needs only `view`. |
| M10-D32 | FR-1105 | No NFKC folding of Thai sara am (r6b M10-11 optional); recorded under Known issues for owner feedback. | Not required by FR-1105's example. |
| M10-D33 | FR-1101a, X71 | The home tick uses `useMutation` with an optimistic patch of `qk.home()` (toggle `completed`), calls `completeTask({ taskIds: [id] })` / `uncompleteTask(...)`, shows `statusToastMessage(result, th.tasks.toast.completed)` with the M3 undo entry (`revertTaskStatus(changed → previous)`), then `invalidateTasks(qc, projectId)` + `invalidateLoad(qc)` (the refetched bucket no longer contains the completed task; undo restores it). Assigned tasks are leaves, so FR-608 never applies here. | Same path as every other tick. |
| M10-D34 | FR-1101 | `GET /api/home` runs all card queries in **one** `REPEATABLE READ` read-only transaction; the RSC page prefetches it with a server `QueryClient` and passes `dehydrate(qc)` through `HydrationBoundary` (snippet `r4/client/app/projects/p/page.tsx`), so the first paint has data and later refreshes go through TanStack. | Consistent snapshot; fast first paint. |
| M10-D35 | FR-1102 | Hit hrefs: project `/projects/<id>` (M2 redirects to overview), task `/projects/<pid>/tasks?task=<id>` (opens M3's panel), page `/p/<id>`, person `/people/<id>` (M9), client `/clients/<id>` (M2). | Existing routes only. |

---

## 4. Streams (machine-readable)

```json
{
  "milestone": 10,
  "streams": [
    {
      "id": "S0",
      "title": "Contracts: inventory of M3-M9 names, isomorphic search normalisation + local matcher, home pure helpers, format helpers, zod (live-block props, embed/home queries, preference key), DTOs (home, search, embed), query keys + invalidation, i18n, charter template section, content-text test, editor schema stubs for the two blocks, service/route stubs, shortcut entries, world 'home' + authz row files",
      "agent": "backend-engineer",
      "owns": [
        "src/lib/contracts/**", "src/lib/schemas/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/invalidate.test.ts",
        "src/lib/search/**", "src/lib/home/**", "src/lib/format.ts", "src/lib/format.test.ts",
        "src/lib/shortcuts.ts", "src/lib/shortcuts.test.ts", "src/lib/keys.ts", "src/lib/keys.test.ts",
        "src/lib/editor/content-text.test.ts",
        "src/i18n/th.ts", "src/i18n/th.test.ts", "src/i18n/templates.th.ts", "src/i18n/templates.test.ts",
        "src/components/editor/schema.ts", "src/components/editor/blocks/task-view/**", "src/components/editor/blocks/project-workload/**",
        "src/server/services/home.ts", "src/server/services/embed.ts", "src/server/services/search.ts",
        "src/app/api/home/**", "src/app/api/search/**", "src/app/api/pages/[id]/embed/**",
        "tests/helpers/**", "tests/authz/rows/index.ts", "tests/authz/rows/home.ts"
      ],
      "dependsOn": [],
      "planSection": "5.S0"
    },
    {
      "id": "S1",
      "title": "Backend: home service (my tasks this week, my load, milestones, leave lines, recent pages, manager cards) + GET /api/home; search over all categories + GET /api/search + GET /api/search/index; embed tasks/workload services + routes; integration tests",
      "agent": "backend-engineer",
      "owns": [
        "src/server/services/home*.ts", "src/server/services/search*.ts", "src/server/services/embed*.ts",
        "src/server/repo/home.ts", "src/server/repo/search.ts",
        "src/app/api/home/**", "src/app/api/search/**", "src/app/api/pages/[id]/embed/**"
      ],
      "dependsOn": ["S0"],
      "planSection": "5.S1"
    },
    {
      "id": "S2",
      "title": "Frontend: /home dashboard (RSC greeting + prefetch, cards, tick, mobile), palette categories + local index + debounce, PALETTE_COMMANDS and the four quick-command flows (+ M8 command), palette project scope, N fallback hotkey",
      "agent": "frontend-engineer",
      "owns": [
        "src/app/(app)/home/**", "src/app/(app)/projects/[id]/layout.tsx",
        "src/components/home/**", "src/components/palette/**", "src/components/shell/**",
        "src/components/pages/PageScreen.tsx", "src/components/pages/PageScreen.test.tsx",
        "src/hooks/useFallbackHotkey.ts", "src/hooks/useFallbackHotkey.test.tsx",
        "src/hooks/useDebouncedValue.ts", "src/hooks/useDebouncedValue.test.tsx"
      ],
      "dependsOn": ["S0"],
      "planSection": "5.S2"
    },
    {
      "id": "S3",
      "title": "Editor: event-isolation spike, TaskList embed option, EmbeddedTasks (list/board + config toolbar), taskView and projectWorkload blocks, Thai slash items + ranking, schema parity + headless templates",
      "agent": "editor-engineer",
      "owns": [
        "src/components/editor/**", "src/lib/editor/**",
        "src/components/tasks/TaskList.tsx", "src/components/tasks/TaskList.test.tsx", "src/components/tasks/embed/**"
      ],
      "dependsOn": ["S0"],
      "planSection": "5.S3"
    },
    {
      "id": "S4",
      "title": "Tests: authz rows (home, search, embeds), masking leak cases K1-K10, e2e m10-home-search (home, palette, live blocks) + page objects + fixtures, update older specs",
      "agent": "test-engineer",
      "owns": ["tests/authz/**", "e2e/**"],
      "dependsOn": ["S0"],
      "planSection": "5.S4"
    }
  ],
  "e2e": ["e2e/m10-home-search.spec.ts"]
}
```

Notes on the DAG (changes vs. the brief's skeleton, with reasons):
- **S3 editor-engineer added** (X78 blocks are editor work). S1, S2, S3 and S4 all depend only on S0 and run concurrently; their
  `owns` do not overlap: S1 = server services/routes of M10; S2 = home, palette, shell, the two context hooks and two scoped files
  (`projects/[id]/layout.tsx`, `pages/PageScreen.tsx`); S3 = editor + exactly three paths under `src/components/tasks/`; S4 = tests.
  The four-agent level may be split into two messages if the session limit is three (S1 + S3 + S4 first, then S2).
- Files S0 creates as stubs (`services/{home,search,embed}.ts`, the three route folders, `blocks/task-view/**`, `blocks/project-workload/**`,
  `components/editor/schema.ts`) are owned afterwards by exactly one Build stream (S1 or S3). S0's pure helpers (`src/lib/search/**`,
  `src/lib/home/**`, `format.ts`) are complete and tested in S0 and read-only afterwards (changes = `requests`).
- `src/i18n/th.ts` belongs to S0. During Build (Edit tool only, PLAN §2.3): S1 may add keys only in `search` (server-built labels
  are none — normally no edits); S2 only in `home`, `palette`, `shortcuts.items`; S3 only in `editor.liveBlocks` and `editor.slash`;
  S4 none.
- S0 runs alone, so it may also edit the M1 preference schema file (`src/lib/schemas/preferences.ts` is inside its glob) and M4's
  `src/server/services/search.ts` re-exports.

---

## 5. Step-by-step

Conventions for every stream: test-first where a step lists tests; integration tests use `createWorld({ with: [...] })`, `asUser`,
factories and the mocked `next/cache` / `next/headers` / `@/server/session` from `tests/setup/db-worker.ts`, plus
`ALLOW_TEST_HOOKS=1` + `APP_NOW=2026-09-30T10:00:00+07:00` when "today" matters; golden tests use `seedGolden(db)` (+
`applyFixture(db, 'F3')`); strings in tests come from `th`; numbers via `formatCd`, dates via `formatThaiDate`/`formatWeekHeader`.
Commands are pnpm-only; streams never run `next dev`, `next build` or Playwright (PLAN §2.3). Every query on `allocations` has a
`week_start` range (CLAUDE.md); plan dates are ISO strings computed in TypeScript (`src/domain/dates.ts`), never in SQL.

### 5.S0 — Contracts (backend-engineer · contracts, schemas, query keys, search/home helpers, format, i18n, templates, editor schema stubs, service/route stubs, test helpers)

**S0.1 Preflight + name inventory (no new dependency).**
- Confirm M9 is ✅ and the tree is clean; `pnpm db:up`. M10 installs **nothing** (cmdk, dnd-kit, BlockNote, TanStack are pinned
  since M3/M4; PLAN §1.2). `pnpm-lock.yaml` must not change.
- Run and paste into the S0 report (and `PROGRESS.md › แผนของ milestone ปัจจุบัน`):
  ```bash
  grep -n "^export" src/lib/contracts/{tasks,search,pages,calendar,workload,milestones}.ts src/lib/schemas/{page-content,pages,tasks,preferences}.ts \
    src/lib/{query-keys,invalidate,format,keys,shortcuts}.ts src/server/services/{search,taskStatus,tasks,calendar,capacity,masking,workload,milestones,charters}.ts src/components/milestones/*.tsx src/components/palette/commands{,.test-utils}.ts \
    src/server/repo/{allocations,members,projects}.ts src/domain/{overload,milestone,dates}.ts src/components/tasks/{TaskList,useProjectTasks,useTaskMutations,statusToast}.ts* \
    src/components/tasks/board/*.tsx src/components/palette/*.tsx src/components/calendar/LeaveDialogProvider.tsx src/components/workload/*.tsx \
    src/i18n/templates.th.ts tests/helpers/*.ts 2>/dev/null
  ```
  Expected (★ = assumption table §1.4): `ProjectTasksResponse`, `TaskDTO`, `StatusRef`, `SetTaskStatusResult` (with `released`, M6),
  `listProjectTasks`, `completeTask`, `uncompleteTask`, `revertTaskStatus`, `createTask`, `useProjectTasks`, `useTaskMutations`,
  `TaskList`, `TaskBoard`, `TaskCard`, `buildTaskRows`, `buildStatusColumns`, `statusToastMessage`, `SearchResponse`, `PageSearchHit`,
  `searchPages`, `escapeLike`, `normalizeQuery`, `searchQuerySchema`, `BLOCK_TYPES`, `blockSchema`, `pageContentSchema`, `charterTemplate`,
  `qk.search`, `qk.home`, `invalidateTasks`, `invalidateLoad`, `invalidatePages`, `getCalendar`, `CalendarTimeOff`, `canSeeLeaveDetails`,
  `formatThaiDate`, `formatThaiDateRange`, `formatLeaveRange`, `formatWeekHeader`, `formatCd`, `loadByUserWeek`, `WeekRange`,
  `loadCapacity`, `overloadLevel`, `loadTone`, `useLeaveDialog`, `PaletteProvider`, `CommandPalette`, `PALETTE_GROUPS`, `HOTKEYS`,
  `SHORTCUTS`, `createWorld`, `asUser`, `makePage`, `makeTimeOff`, `makeAllocation`; M8: `listVisibleMilestones`, `CalendarMilestone`,
  `MilestoneRef`, `MilestoneStatusChip`, `MilestoneLateBadge`, `PALETTE_COMMANDS`, `PaletteCommand`, `PaletteCommandCtx`, `matchCommand`, `useVisibleCommands`,
  `projectIdFromPath`, `useCommandCtx`, `fakeCommandCtx`, `CommandsGroup`, `invalidateMilestones`, `qk.projectMilestones`, `qk.milestoneTargets`, `makeMilestone`,
  `addMilestones`; M2: `repo.members.listMembers`, `repo.projects.getProject`, `compareThai`, `getJson` (`src/lib/api.ts`; never `getJSON`); M3: `BoardColumn`,
  `TaskBoard`/`TaskBoardProps` and `TaskCardProps` (pinned in m03 S3.16), `toCardModel`, `TaskListProps`, `QuickAdd`; M9: `buildTable`, `BuildTableOpts`, `personCells`, `listMyTaskBuckets`,
  `MyTaskBucketsResponse`, `MyBucketTask`, `WorkloadCell` (DTO + component), `WorkloadPerson`, `OverloadItem`, `viewTone`, `workloadCellText`, `compactDays`,
  `tooltipLines`, `WorkloadResponse`. A missing or renamed one:
  use the real name in every M10 step and record it in the report (never add a parallel export).
- Done-check: the inventory table is in the report; `git status` shows no change yet.

**S0.2 Schema: none (M10-D29).** `pnpm db:generate` → "No schema changes". Re-run M0's `schema.int.test.ts › produces Thai trigrams`
(must stay green). No migration file is created in M10.

**S0.3 Pure shared helpers (complete, test-first; isomorphic, no IO).**
- `src/lib/search/normalize.ts` (M10-D26): move M4's bodies here and make `src/server/services/search.ts` re-export them
  (`export { normalizeQuery, escapeLike } from '@/lib/search/normalize'`) so M4 imports keep working.
  ```ts
  /** NFC, strip U+200B–U+200D, U+2060, U+FEFF, collapse whitespace, trim. */
  export function normalizeQuery(q: string): string
  /** Escape \ % _ with a backslash for ILIKE … ESCAPE '\'. */
  export function escapeLike(q: string): string
  /** normalizeQuery + Latin lower-case (Thai has no case); used for local matching and server patterns alike. */
  export function foldForMatch(s: string): string
  export const SEARCH_MIN_CONTENT_CHARS = 3
  export const SEARCH_LIMIT_PER_CATEGORY = 8
  ```
- `src/lib/search/match.ts` (M10-D21):
  ```ts
  export interface LocalMatchable { id: string; keys: readonly string[] }      // e.g. [name, nickname, positionName]
  /** Substring match on folded keys. Rank: any key starting with q (0) < word start inside a key (1) < other substring (2);
   *  then the earliest match index, then Intl.Collator('th') on keys[0], then id. Returns at most `limit`. */
  export function matchLocal<T extends LocalMatchable>(items: readonly T[], q: string, limit = SEARCH_LIMIT_PER_CATEGORY): T[]
  ```
- `src/lib/home/greeting.ts` (M10-D19): `export type GreetingKey = 'morning' | 'afternoon' | 'evening'`;
  `export function greetingKey(hour: number): GreetingKey` (5–11 morning, 12–17 afternoon, else evening).
- `src/lib/home/percent.ts` (M10-D18): `export function percentTenths(loadCd: number, capCd: number): number | null` → `null` when
  `capCd ≤ 0`, else `floor((2000 · load + cap) / (2 · cap))` (= half-up of `1000·load/cap`, integers only);
  `export function formatPercentTenths(t: number | null): string` → `'72.5%'`, `null` → `'—'` (string from `th.home.manager.noCapacity`).
- `src/lib/format.ts` (S0 owns it in M10; add only what is missing after S0.1):
  ```ts
  /** Bangkok wall-clock hour 0–23 of an instant (Intl, timeZone 'Asia/Bangkok', hourCycle 'h23'). */
  export function bangkokHour(instant: Date): number
  /** 'พุธ 30 ก.ย. 2569' — weekday short (Intl 'th-TH' weekday:'short', timeZone 'UTC' on the ISO parts) + formatThaiDate(d,'medium'). */
  export function formatHomeDate(d: ISODate): string
  /** '2 ชม.ที่แล้ว' — Intl.RelativeTimeFormat('th', { numeric: 'auto', style: 'short' }) between two ISO instants (minutes < 60,
   *  hours < 24, days < 30, else formatThaiInstantDate(…,'medium')). Add only if M4 did not. */
  export function formatRelative(instantIso: string, nowIso: string): string
  ```
- Tests first:
  - `src/lib/search/normalize.test.ts` (unit): `normalizeQuery(' ภาษา​ไทย  ')` → `'ภาษาไทย'`; `escapeLike('50%_a\\b')` → `'50\\%\\_a\\\\b'`;
    `foldForMatch('POS Upgrade')` → `'pos upgrade'`; the M4 test file still imports from `services/search.ts` and passes.
  - `src/lib/search/match.test.ts` (unit): items `POS Upgrade`, `Data Warehouse`, `Store Analytics Dashboard`, `Mobile App Revamp`
    (keys = `[name]`): `'po'` → `[POS Upgrade]` (rank 0); `'dash'` → `[Store Analytics Dashboard]`;
    `'re'` → `[Mobile App Revamp, Store Analytics Dashboard, Data Warehouse]` (word start "Revamp" = rank 1; then rank 2 by match index 3 < 7;
    POS absent); `'a'` → `[Store Analytics Dashboard, Mobile App Revamp, Data Warehouse, POS Upgrade]` (rank 1 at index 6 < 7, then rank 2 at
    index 1 < 8); people keys `['Peter', 'Peter', 'Data']` with `'pat'` → Peter; `'DATA'` (folded) matches the position key; Thai `'ลูก'`
    matches `'ลูกค้า Coral'`; 9 matches → 8; empty or whitespace `q` → `[]`.
  - `src/lib/home/greeting.test.ts`: `4 → evening`, `5 → morning`, `11 → morning`, `12 → afternoon`, `17 → afternoon`, `18 → evening`, `23 → evening`.
  - `src/lib/home/percent.test.ts`: `(7250, 10000) → 725`, `(1625, 2500) → 650`, `(1875, 2500) → 750`, `(5875, 10000) → 588` (58.75 → 58.8),
    `(7400, 10000) → 740`, `(1, 3) → 333`, `(2, 3) → 667`, `(0, 500) → 0`, `(100, 0) → null`; `formatPercentTenths(725) === '72.5%'`, `(null) === '—'`.
  - `src/lib/format.test.ts`: `bangkokHour(new Date('2026-09-30T03:00:00Z')) === 10`; `bangkokHour(new Date('2026-09-30T16:59:00Z')) === 23`;
    `formatHomeDate('2026-09-30') === 'พุธ 30 ก.ย. 2569'` (verified ICU output, r6b M10-07); for `'2027-01-01'` assert
    `formatHomeDate(d) === \`${weekdayShort} ${formatThaiDate(d, 'medium')}\`` with `weekdayShort` computed in the test by the same `Intl` options;
    `formatRelative('2026-09-30T08:00:00+07:00', '2026-09-30T10:00:00+07:00')` contains `'2'` and `'ชม.'`.
- Done-check: `pnpm vitest run --project unit src/lib/search src/lib/home src/lib/format.test.ts src/server/services/search`.

**S0.4 Zod schemas.**
- `src/lib/schemas/page-content.ts` (M4 file; C1, M10-D4): append the two types to `BLOCK_TYPES` **and** extend `checkBlockProps`:
  ```ts
  export const BLOCK_TYPES = [/* M4 … */ 'subpage', 'taskView', 'projectWorkload'] as const
  export const LIVE_BLOCK_TYPES = ['taskView', 'projectWorkload'] as const
  export const TASK_VIEW_LIMITS = [10, 20, 50, 100] as const
  export const TASK_VIEW_DEFAULTS = { view: 'BOARD', assigneeId: '', milestoneId: '', statusIds: '', showDone: false, limit: 20 } as const
  export const WORKLOAD_VIEW_DEFAULTS = { view: 'ALL' } as const
  const taskViewProps = z.object({
    view: z.enum(['LIST', 'BOARD']).optional(),
    assigneeId: z.string().max(64).optional(),                                    // '' = anyone (Better Auth text ids)
    milestoneId: z.union([z.literal(''), z.uuid()]).optional(),
    statusIds: z.string().max(12 * 37).refine((s) => s === '' || s.split(',').every((x) => z.uuid().safeParse(x).success)
      && s.split(',').length <= 12).optional(),
    showDone: z.boolean().optional(),
    limit: z.union(TASK_VIEW_LIMITS.map((n) => z.literal(n))).optional(),
  }).strict()                                                                     // any other key (e.g. projectId, tasks) → issue
  const projectWorkloadProps = z.object({ view: z.enum(['ALL', 'COMMITTED', 'AT_RISK']).optional() }).strict()
  // inside checkBlockProps(block, ctx):
  //   if (block.type === 'taskView' || block.type === 'projectWorkload') {
  //     const r = (block.type === 'taskView' ? taskViewProps : projectWorkloadProps).safeParse(block.props ?? {})
  //     if (!r.success) ctx.addIssue({ code: 'custom', message: th.pages.errors.contentInvalid, path: ['props'] })
  //     if (block.content !== undefined && !(Array.isArray(block.content) && block.content.length === 0)) → issue (no data in content, FR-1302)
  //     if (block.children && block.children.length > 0) → issue
  //   }
  export type TaskViewProps = { view: 'LIST' | 'BOARD'; assigneeId: string; milestoneId: string; statusIds: string; showDone: boolean; limit: (typeof TASK_VIEW_LIMITS)[number] }
  export type ProjectWorkloadProps = { view: 'ALL' | 'COMMITTED' | 'AT_RISK' }
  /** Fill defaults and drop junk for rendering (client) — never throws. */
  export function resolveTaskViewProps(p: Record<string, unknown> | undefined): TaskViewProps
  export function resolveWorkloadProps(p: Record<string, unknown> | undefined): ProjectWorkloadProps
  ```
- `src/lib/schemas/embed.ts`: `export const embedParamsSchema = z.object({ id: z.uuid() })` (route param → 404 `NOT_FOUND` on a bad id, X86);
  (No workload query schema: the view is client-side, M9-D2.)
- `src/lib/schemas/pages.ts` (M4): keep `searchQuerySchema` (`q` 1–100 chars, `titleOnly`); `GET /api/search/index` takes no query.
- `src/lib/schemas/preferences.ts` (M1 known keys, X05/X59, M10-D27): `'palette.lastProjectId': z.uuid().nullable()` default `null`
  (+ one valid / one invalid case in its unit test).
- Tests first — extend `src/lib/schemas/page-content.test.ts` (unit, FR-1302):
  `[{ type: 'taskView', props: { view: 'BOARD' } }]` parses (partial, template form);
  full `{ type:'taskView', props: { view:'LIST', assigneeId:'u1', milestoneId:'', statusIds:'<v4>,<v4>', showDone:true, limit:50 }, children: [] }` parses;
  `props: { projectId: '<v4>' }` → fails; `props: { tasks: '[…]' }` → fails; `limit: 7` → fails; `view: 'TABLE'` → fails;
  `statusIds: 'x'` → fails; 13 ids → fails; `content: [{ type:'text', text:'ลับ' }]` on a taskView → fails; `children: [paragraph]` → fails;
  `{ type: 'projectWorkload' }` parses; `props: { view: 'AT_RISK' }` parses; `props: { weeks: 12 }` → fails;
  `resolveTaskViewProps({ view: 'NOPE', limit: 7 })` → `TASK_VIEW_DEFAULTS`.
- Done-check: `pnpm vitest run --project unit src/lib/schemas`.

**S0.5 Query keys + invalidation (`src/lib/query-keys.ts`, `src/lib/invalidate.ts`; X18, M10-D10).**
```ts
// query-keys.ts (add; PLAN §3.5 gets them at close-out)
searchIndex: () => ['search', 'index'] as const,                          // under ['search'] → invalidatePages also refreshes it
pageEmbedTasks: (pageId: string) => ['embed', 'tasks', pageId] as const,
pageEmbedTasksAll: () => ['embed', 'tasks'] as const,                     // prefix
pageEmbedWorkload: (pageId: string) => ['embed', 'workload', pageId] as const,
pageEmbedWorkloadAll: () => ['embed', 'workload'] as const,               // prefix
// qk.home() and M4's qk.search(q, scope: 'all' | 'title' = 'all') already exist (PLAN §3.5, M4; G49) — M10 calls qk.search(q, 'all')

// invalidate.ts — additive lines only (each helper keeps every key it already invalidates)
invalidateTasks(qc, projectId)  // M3 (+ M8 projectMilestones): + qc.invalidateQueries({ queryKey: qk.home() }) + ({ queryKey: qk.pageEmbedTasksAll() })
invalidateLoad(qc)              // PLAN + M9 (grid, workload, home, tasks.my, teamTasks, sidebar) + ({ queryKey: qk.pageEmbedWorkloadAll() })
invalidateMilestones(qc, projectId) // M8-D22: + ({ queryKey: qk.home() }) (home milestones card)
invalidatePages(qc, …)          // M4 (X82): already covers the whole ['search'] prefix, so qk.searchIndex() refreshes too — no M10 change
```
No separate `invalidateSearchIndex` helper: the index is refetched whenever the palette opens (M10-D21) and is under the `['search']` prefix.
These keys and invalidations are the M10 input for PLAN §3.5 (G42).
Tests first (`src/lib/invalidate.test.ts`): after `invalidateTasks(qc, 'p1')` the keys `['home']`, `['embed','tasks','pg1']`,
`qk.projectTasks('p1')` are invalidated and `['embed','workload','pg1']` is not; after `invalidateLoad(qc)` `['embed','workload','pg1']`
and `['home']` are invalidated and `['embed','tasks','pg1']` is not; `invalidateMilestones(qc, 'p1')` invalidates `['home']`; `invalidatePages(qc, …)` invalidates `['search','index']`.
Done-check: `pnpm vitest run --project unit src/lib/invalidate.test.ts`.

**S0.6 DTOs (`src/lib/contracts/home.ts`, `search.ts` (extend M4), `embed.ts`).** All load numbers are integer cd (BR-03); dates are ISO strings.
```ts
// home.ts
import type { Cd, ISODate } from '@/domain/types'
import type { CalendarTimeOff } from '@/lib/contracts/calendar'            // M5 (masked | full)
import type { MyBucketTask } from '@/lib/contracts/tasks'                   // M9 (FR-1009 bucket item: project, status, plannedCd, …)
import type { WorkloadCell, OverloadItem } from '@/lib/contracts/workload'  // M9
export type HomeTaskItem = MyBucketTask                                     // href built on the client: /projects/<pid>/tasks?task=<id>
import type { CalendarMilestone } from '@/lib/contracts/milestones'       // M8: { id, projectId, projectName, projectColor, name, date, status, late }
export interface HomeLoadWeek { week: ISODate; cell: WorkloadCell }        // M9 personCells; tone via viewTone on the client
export type HomeMilestone = CalendarMilestone                              // never status 'DONE' on home (M10-D15); link → /projects/<pid>/overview
export interface HomeLeaveEntry { userId: string; name: string; entry: CalendarTimeOff }              // entry masked unless manager/self
export interface HomeLeave { today: HomeLeaveEntry[]; thisWeek: HomeLeaveEntry[]; nextWeek: HomeLeaveEntry[] }
export interface HomeRecentPage { id: string; title: string; icon: string | null; projectName: string | null; updatedAt: string
  updatedBy: { id: string; name: string }; href: string }
export interface HomeUtilisationWeek { week: ISODate; totalCd: Cd; committedCd: Cd; capacityCd: Cd; percentTenths: number | null
  committedPercentTenths: number | null }
export interface HomeManagerCards { overloaded: OverloadItem[]; utilisation: { weeks: HomeUtilisationWeek[]; total: HomeUtilisationWeek } }
export interface HomeResponse {
  today: ISODate; now: string; weekStart: ISODate
  myTasks: { items: HomeTaskItem[]; more: number }
  myLoad: HomeLoadWeek[]                      // exactly 8 weeks
  milestones: HomeMilestone[]
  leave: HomeLeave
  recentPages: HomeRecentPage[]               // ≤ 8
  manager: HomeManagerCards | null            // null for every non-manager (FR-1101f)
}

// search.ts (M4 file — extend, keep PageSearchHit unchanged)
export interface ProjectSearchHit { kind: 'project'; id: string; name: string; color: string; archived: boolean; tentative: boolean; href: string }
export interface TaskSearchHit { kind: 'task'; id: string; name: string; projectId: string; projectName: string; projectArchived: boolean
  status: StatusRef; completed: boolean; href: string }
export interface PersonSearchHit { kind: 'person'; id: string; name: string; nickname: string | null; positionName: string | null; active: boolean; href: string }
export interface ClientSearchHit { kind: 'client'; id: string; name: string; archived: boolean; href: string }
export interface SearchResponse { projects: ProjectSearchHit[]; tasks: TaskSearchHit[]; pages: PageSearchHit[]; people: PersonSearchHit[]; clients: ClientSearchHit[] }
export type SearchCategory = keyof SearchResponse
export const SEARCH_CATEGORIES: readonly SearchCategory[] = ['projects', 'tasks', 'pages', 'people', 'clients']   // FR-1102 order
export interface SearchIndexProject { id: string; name: string; color: string; archived: boolean; tentative: boolean
  role: 'MANAGER' | 'LEAD' | 'MEMBER' }                                                           // role → create-task picker (X42: !archived)
export interface SearchIndexPerson { id: string; name: string; nickname: string | null; positionName: string | null; active: boolean }
export interface SearchIndexClient { id: string; name: string; archived: boolean }
export interface SearchIndexResponse { projects: SearchIndexProject[]; people: SearchIndexPerson[]; clients: SearchIndexClient[] }

// embed.ts
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import type { WorkloadCell } from '@/lib/contracts/workload'             // M9
export type WorkloadView = 'ALL' | 'COMMITTED' | 'AT_RISK'                 // = M9 LoadView values; block prop only
export type EmbedTasksResponse =
  | { kind: 'wiki' }
  | { kind: 'project'; projectId: string; projectName: string; tasksHref: string; data: ProjectTasksResponse }
export interface EmbedWorkloadPerson { userId: string; name: string; deactivated: boolean; cells: Record<ISODate, WorkloadCell> }
export type EmbedWorkloadResponse =
  | { kind: 'wiki' }
  | { kind: 'project'; projectId: string; projectName: string; archived: boolean; workloadHref: string; weeks: ISODate[]
      people: EmbedWorkloadPerson[]; projects: Record<string, { name: string; color: string }> }   // visible projects only (M9); archived → M10-D11
```
No test file (types only); `pnpm typecheck` is the check. `M4`'s `CommandPalette` keeps compiling because `pages` keeps its type.

**S0.7 i18n (`src/i18n/th.ts`, Edit tool only; M10-D28).** Exact strings (extend existing namespaces; create `search`):
```ts
home: {
  title: 'หน้าหลัก',                                   // M0 (document title)
  greeting: 'สวัสดี',                                   // M0 (kept for the login page / fallbacks)
  today: (date: string) => `วันนี้ ${date}`,             // M0
  // placeholderTitle / placeholderBody: removed (M0 placeholder replaced)
  greetingFor: {
    morning: (name: string) => `สวัสดีตอนเช้า ${name}`,
    afternoon: (name: string) => `สวัสดีตอนบ่าย ${name}`,
    evening: (name: string) => `สวัสดีตอนเย็น ${name}`,
  },
  loadError: 'โหลดข้อมูลหน้าหลักไม่สำเร็จ',
  retry: 'ลองใหม่',
  myTasks: {
    title: 'งานของฉันสัปดาห์นี้',
    empty: 'สัปดาห์นี้ยังไม่มีงานที่วางแผนหรือครบกำหนด',
    hint: 'สร้างงานใหม่ได้จาก ⌘K › สร้าง task',
    planned: (days: string) => `${days} วัน`,
    due: (date: string) => `ครบกำหนด ${date}`,
    more: (n: number) => `และอีก ${n} งาน`,
    seeAll: 'ดูงานทั้งหมดของฉัน',
    complete: (name: string) => `ติ๊กเสร็จ ${name}`,
  },
  myLoad: {
    title: 'ภาระของฉัน 8 สัปดาห์',
    barLabel: (week: string, load: string, cap: string) => `สัปดาห์ ${week}: ภาระ ${load} จาก ${cap} วัน`,
    over: 'ล้น',
    risk: 'เสี่ยงล้น',
    noCapacity: 'ไม่มีวันทำงาน',
    legend: 'สีตามสัดส่วนภาระต่อวันทำงานที่มี',
  },
  milestones: {                                        // status/late texts come from M8's MilestoneStatusChip / MilestoneLateBadge
    title: 'Milestone 14 วันข้างหน้า',
    empty: 'ไม่มี milestone ใน 14 วันข้างหน้า',
  },
  leave: {
    title: 'ใครลา',
    today: 'วันนี้',
    thisWeek: 'สัปดาห์นี้',
    nextWeek: 'สัปดาห์หน้า',
    none: '—',
    entry: (name: string, range: string) => `${name} (${range})`,
  },
  recentPages: {
    title: 'เอกสารที่แก้ล่าสุด',
    empty: 'ยังไม่มีเอกสาร',
    editedBy: (name: string, when: string) => `${name} แก้ ${when}`,
  },
  manager: {
    overloadedTitle: 'คนที่ล้นสัปดาห์นี้และสัปดาห์หน้า',
    overloadedEmpty: 'ไม่มีใครล้น',
    week: (w: string) => `สัปดาห์ ${w}`,
    // level / excess / cause texts reuse M7/M9's th.overload.level, th.overload.excess, th.overload.cause (one wording app-wide)
    utilisationTitle: '% ใช้กำลังคนทีม 4 สัปดาห์',
    utilisationTotal: 'รวม 4 สัปดาห์',
    committed: (pct: string) => `แน่นอน ${pct}`,
    noCapacity: '—',
    openWorkload: 'เปิด Workload ทีม',
  },
},
search: {
  archived: 'archive แล้ว',
  completed: 'เสร็จแล้ว',
  deactivated: '(ปิดใช้งาน)',
  tentative: 'อาจไม่ทำ',
  inProject: (project: string) => `ใน ${project}`,
},
palette: {
  /* M4: dialogLabel, open, shortcut, loading, empty, wiki, matchedInContent — unchanged */
  placeholder: 'ค้นหาโปรเจค งาน เอกสาร คน ลูกค้า หรือพิมพ์คำสั่ง…',       // replaces M4's 'ค้นหาหน้าเอกสาร…'
  hint: 'พิมพ์เพื่อค้นหา หรือเลือกคำสั่งด่วน',                             // replaces M4's pages-only hint
  groups: { projects: 'โปรเจค', tasks: 'งาน', pages: 'หน้าเอกสาร', people: 'พนักงาน', clients: 'ลูกค้า' },   // commands heading stays M8's th.milestones.palette.group
  commands: {
    createTask: { label: 'สร้าง task', keywords: 'new task สร้างงาน งานใหม่' },                 // M8 PaletteCommand.keywords is a string
    createPage: { label: 'สร้างหน้า', keywords: 'new page หน้าใหม่ เอกสารใหม่' },
    reportLeave: { label: 'แจ้งลา', keywords: 'leave time off วันลา' },
    goToday: { label: 'ไปหน้าวันนี้', keywords: 'today home หน้าหลัก' },
  },
  createTask: {
    pickProject: 'เลือกโปรเจคที่จะสร้างงาน',
    projectPlaceholder: 'ค้นหาโปรเจค…',
    namePlaceholder: (project: string) => `ชื่องานใหม่ใน ${project}…`,
    lastUsed: 'ใช้ล่าสุด',
    noProjects: 'ไม่มีโปรเจคที่คุณสร้างงานได้',
    created: (name: string, project: string) => `สร้างงาน "${name}" ใน ${project} แล้ว`,
    open: 'เปิด',
    failed: 'สร้างงานไม่สำเร็จ',
    back: 'ย้อนกลับ',
  },
  createPage: { failed: 'สร้างหน้าไม่สำเร็จ' },
},
editor: {
  /* M4 … */
  slash: {
    /* M4 subpage … */
    taskView: { title: 'มุมมองงาน', subtext: 'ลิสต์หรือบอร์ดงานของโปรเจคนี้ แบบข้อมูลสด',
      aliases: ['tasks', 'board', 'list', 'task view', 'งาน', 'บอร์ด', 'มุมมอง'], group: 'ข้อมูลสด' },
    projectWorkload: { title: 'ภาระทีม', subtext: 'ภาระของสมาชิกโปรเจค 8 สัปดาห์ แบบข้อมูลสด',
      aliases: ['workload', 'team', 'load', 'ภาระ', 'ภาระทีมโปรเจค'], group: 'ข้อมูลสด' },
  },
  liveBlocks: {
    taskViewTitle: 'มุมมองงาน',
    workloadTitle: 'ภาระทีมโปรเจค',
    regionLabel: (title: string, project: string) => `${title} ของ ${project} (ข้อมูลสด)`,
    wikiOnly: 'ใช้ได้เฉพาะหน้าในโปรเจค',
    loading: 'กำลังโหลดข้อมูลสด…',
    error: 'โหลดข้อมูลสดไม่สำเร็จ',
    retry: 'ลองใหม่',
    empty: 'ไม่มีงานตรงตัวกรอง',
    readOnlyArchived: 'โปรเจคนี้ถูก archive แล้ว — ดูได้อย่างเดียว',
    workloadArchived: 'โปรเจคนี้ถูก archive แล้ว — ไม่นับภาระของโปรเจคนี้ แสดงเฉพาะภาระจากโปรเจคอื่นของสมาชิก',
    seeAll: (n: number) => `ดูทั้งหมด (${n})`,
    openTasksTab: 'เปิดแท็บงาน',
    openWorkload: 'เปิด Workload ทีม',
    view: { label: 'มุมมอง', LIST: 'ลิสต์', BOARD: 'บอร์ด' },
    filters: {
      button: 'ตัวกรอง', assignee: 'ผู้รับผิดชอบ', anyone: 'ทุกคน', milestone: 'Milestone', anyMilestone: 'ทุก milestone',
      status: 'สถานะ', anyStatus: 'ทุกสถานะ', showDone: 'แสดงงานที่เสร็จแล้ว', limit: 'จำนวนสูงสุด', limitOption: (n: number) => `${n} งาน`,
    },
    workload: {
      range: '8 สัปดาห์จากสัปดาห์นี้',
      view: { ALL: 'ทั้งหมด', COMMITTED: 'แน่นอน', AT_RISK: 'ยังไม่แน่นอน' },
      cell: (load: string, cap: string) => `${load}/${cap}`,
      cellLabel: (name: string, week: string, load: string, cap: string) => `${name} สัปดาห์ ${week}: ภาระ ${load} จาก ${cap} วัน`,
      noMembers: 'ยังไม่มีสมาชิกในโปรเจคนี้',
      person: 'สมาชิก',
    },
  },
},
shortcuts: {
  /* M3/M4 … */
  scopes: { /* … */ palette: 'ช่องค้นหา' },                  // add only if M4 did not
  items: { /* … */ paletteMove: 'เลื่อนในผลค้นหา', paletteOpen: 'เปิดรายการหรือคำสั่งที่เลือก', paletteBack: 'ย้อนกลับจากขั้นตอนคำสั่ง' },
  keys: { /* … */ Up: '↑', Down: '↓', Backspace: 'Backspace' },
},
```
`templates.th.ts` heading text `'งานและภาระของทีม'` is a template literal there (S0.8). Update M0's `src/i18n/th.test.ts` if it asserts the
removed placeholder keys (replace with `th.home.greetingFor.morning('Cindy') === 'สวัสดีตอนเช้า Cindy'`).
Done-check: `pnpm typecheck` · `pnpm vitest run --project unit src/i18n` · `pnpm lint src/i18n`.

**S0.8 Charter template section (`src/i18n/templates.th.ts`, FR-1305, M10-D12).** In `charterTemplate()`, immediately after the
paragraph "(ดูและแก้ที่แท็บภาพรวม — Phase 2 จะฝังรายการสดไว้ตรงนี้)" of "Milestones สำคัญ" and before h2 "ทีมงานและบทบาท", insert:
```ts
{ type: 'heading', props: { level: 2 }, content: 'งานและภาระของทีม' },
{ type: 'taskView', props: { view: 'BOARD' } },
{ type: 'projectWorkload', props: {} },
```
Tests first — extend `src/i18n/templates.test.ts` (unit). **Replace** M4's single M4-only case that asserts the charter has no live section / no
"งานและภาระของทีม" (m04 S0.12, M4-D37c) with the cases below (and drop M4's G2 grep for it from any script it lives in); M4's other template cases use
containment and stay unchanged. New cases: the charter's h2 texts in order end with `[…, 'Milestones สำคัญ', 'งานและภาระของทีม',
'ทีมงานและบทบาท', 'ผู้มีส่วนได้ส่วนเสีย', 'ความเสี่ยงและข้อสมมติฐาน', 'เกณฑ์ความสำเร็จ', 'การสื่อสาร']`; the blocks right after "งานและภาระของทีม"
are `taskView` then `projectWorkload`; neither has `content` or a `projectId` prop; the charter still has 5 tables; `pageContentSchema` still parses it;
`extractContentText(charterTemplate().content)` contains `'งานและภาระของทีม'` but nothing produced by the blocks (string equality with the same
template minus the two blocks plus nothing else); meeting and SOP templates contain no live block. Done-check: `pnpm vitest run --project unit src/i18n`.

**S0.9 `content_text` test only (FR-1307, M4-D30).** Extend `src/lib/editor/content-text.test.ts`: `[paragraph 'ก่อน', { type: 'taskView',
props: { view: 'BOARD', assigneeId: 'u1' } }, { type: 'projectWorkload', props: { view: 'ALL' } }, paragraph 'หลัง']` → `'ก่อน หลัง'` (exactly
the M4 joiner); no prop value (`'BOARD'`, `'u1'`, `'ALL'`) appears. If this fails, **do not** change the walker in S0: report it; S3 owns
`src/lib/editor/**` and fixes it test-first. Done-check: `pnpm vitest run --project unit src/lib/editor/content-text.test.ts`.

**S0.10 Editor schema stubs (keeps M4's parity test green at G0; M4-D37a).** M4's parity test derives both sides (`schema.blockSpecs` keys vs `BLOCK_TYPES`),
so appending to both in S0.4/S0.10 keeps it green without editing it. `src/components/editor/schema.ts` registers the two new specs:
```ts
import { createTaskViewBlock } from './blocks/task-view/spec'
import { createProjectWorkloadBlock } from './blocks/project-workload/spec'
// blockSpecs: { …M4…, taskView: createTaskViewBlock(), projectWorkload: createProjectWorkloadBlock() }
```
`src/components/editor/blocks/task-view/spec.tsx` (S0 stub; S3 replaces the render):
```tsx
import { createReactBlockSpec } from '@blocknote/react'
import { TASK_VIEW_DEFAULTS, TASK_VIEW_LIMITS } from '@/lib/schemas/page-content'
export const createTaskViewBlock = createReactBlockSpec(
  { type: 'taskView', content: 'none', propSchema: {
      view: { default: TASK_VIEW_DEFAULTS.view, values: ['LIST', 'BOARD'] as const },
      assigneeId: { default: '' }, milestoneId: { default: '' }, statusIds: { default: '' },
      showDone: { default: false }, limit: { default: 20, values: TASK_VIEW_LIMITS } } },
  { render: () => <div data-testid="live-block-stub" contentEditable={false} />, toExternalHTML: () => <div /> },
)
```
`blocks/project-workload/spec.tsx`: same with `{ type: 'projectWorkload', content: 'none', propSchema: { view: { default: 'ALL', values:
['ALL', 'COMMITTED', 'AT_RISK'] as const } } }`. (`values` with numbers: if BlockNote's `PropSpec` typing rejects numeric `values`, drop
`values` for `limit` and rely on `resolveTaskViewProps` + server validation; record it.) Done-check: `pnpm vitest run --project ui
src/components/editor/schema.test.ts src/components/editor/templates.headless.test.ts` (M4 tests; parity now includes both types).

**S0.11 Server stubs, route stubs, shortcut entries.**
```ts
// src/server/services/home.ts (bodies: S1) — every function takes `today` (X56)
export async function getHome(tx: DbOrTx, user: SessionUser, clock: { today: ISODate; now: Date }): Promise<HomeResponse>
export async function myTasksThisWeek(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<HomeResponse['myTasks']>
export async function myLoad(tx: DbOrTx, user: SessionUser, ws: ISODate): Promise<HomeLoadWeek[]>
export async function homeMilestones(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<HomeMilestone[]>
export async function homeLeave(tx: DbOrTx, user: SessionUser, today: ISODate): Promise<HomeLeave>
export async function recentPages(tx: DbOrTx, user: SessionUser): Promise<HomeRecentPage[]>
export async function managerCards(tx: DbOrTx, user: SessionUser, ws: ISODate, today: ISODate): Promise<HomeManagerCards | null>
// src/server/services/home-leave.ts — created by S1 (pure, test-first); signature fixed here — split of getCalendar entries into the three lines (M10-D16)
export function splitLeaveLines(entries: readonly HomeLeaveEntry[], today: ISODate, ws: ISODate): HomeLeave
// src/server/services/search.ts (M4 file; add)
export async function searchProjects(tx: Tx, user: SessionUser, q: string): Promise<ProjectSearchHit[]>
export async function searchTasks(tx: Tx, user: SessionUser, q: string): Promise<TaskSearchHit[]>
export async function searchPeople(tx: Tx, user: SessionUser, q: string): Promise<PersonSearchHit[]>
export async function searchClients(tx: Tx, user: SessionUser, q: string): Promise<ClientSearchHit[]>
export async function searchAll(tx: Tx, user: SessionUser, q: string, opts: { titleOnly: boolean }): Promise<SearchResponse>
export async function searchIndex(tx: DbOrTx, user: SessionUser): Promise<SearchIndexResponse>
// src/server/services/embed.ts
export async function getEmbedTasks(tx: DbOrTx, user: SessionUser, pageId: string): Promise<EmbedTasksResponse>
export async function getEmbedWorkload(tx: DbOrTx, user: SessionUser, pageId: string, today: ISODate): Promise<EmbedWorkloadResponse>
```
Service bodies are `throw notImplemented('<name> (M10 S1)')` (M1 helper, as in m03/m08 stubs). Routes (M1 `route()`; stub bodies `notImplemented(...)`):
`src/app/api/home/route.ts` → `export const GET = route(...)` → `HomeResponse` · `src/app/api/search/route.ts` (M4, now returns the full `SearchResponse`;
the stub keeps M4's pages behaviour and adds the four empty arrays so M4's tests stay green at G0) · `src/app/api/search/index/route.ts` → `SearchIndexResponse` ·
`src/app/api/pages/[id]/embed/tasks/route.ts` → `export const GET = route<{ id: string }>(...)` → `EmbedTasksResponse` ·
`src/app/api/pages/[id]/embed/workload/route.ts` → `route<{ id: string }>` → `EmbedWorkloadResponse`. The two embed stubs already parse params
(`embedParamsSchema.safeParse(params)` → `throw new NotFoundError()`, M10-D1, X86) so `EMB-*-BAD` is green from G0.
Shortcuts (`src/lib/shortcuts.ts` + `src/lib/keys.ts`, X07): add `'palette'` to `ShortcutScope`/`SHORTCUT_SCOPES` if M4 did not; add
`KeyToken`s `'Up' | 'Down' | 'Backspace'`; `HOTKEYS.newTask = { code: 'KeyN', key: 'n' }` if M3 did not name it; append
`{ id: 'palette.move', scope: 'palette', combos: [['Up'], ['Down']], label: th.shortcuts.items.paletteMove }`,
`{ id: 'palette.open', scope: 'palette', combos: [['Enter']], label: th.shortcuts.items.paletteOpen }` (keep M4's `palette.open` id for Cmd+K —
if it already uses that id, name this one `palette.select`), `{ id: 'palette.back', scope: 'palette', combos: [['Backspace']], label: th.shortcuts.items.paletteBack }`.
Test (`shortcuts.test.ts`): ids unique, scopes valid, labels non-empty (existing), `keys.test.ts`: `{ code: 'KeyN', key: 'ื' }` (Kedmanee) matches `HOTKEYS.newTask`.
Done-check: `pnpm typecheck` · `pnpm vitest run --project unit src/lib/shortcuts.test.ts src/lib/keys.test.ts`.

**S0.12 Test helpers (`tests/helpers/**`; X59 plain Drizzle).**
- `world.ts`: new part `'home'` — S0 adds `WORLD_PART_IMPLIES.home = ['tasks', 'pages', 'timeOff', 'allocations', 'milestones']` (M1's map, each owner adds its entry) — so `createWorld({ with: [...,'home'] })` implies `'tasks'`, `'pages'`, `'timeOff'`, `'allocations'` and M8's `'milestones'` (which binds
  `pLate` "ส่งมอบรอบแรก P" 2026-10-02 to `pLeaf` → late) and adds, with `makeMilestone` / `makeTimeOff` / `makePage` / `makeTask` (default status, X70):

  | Key | Data |
  |---|---|
  | `w.milestones.pOverdue` | P "Milestone P-ลับ13", date 2026-09-25, not done (OVERDUE) — added on top of M8's `w.milestones.{p, pLate, pDone, q, a}` |
  | `w.milestones.qSoon` | Q "Milestone Q-ลับ15", date 2026-10-05 (DUE_SOON) |
  | `w.milestones.pAncient` | P "Milestone P-ลับ16", date 2026-08-31, not done (beyond the 4-week look-back, M10-D15) |
  | `w.timeOff.coworkerToday` | coworker, vacation, 2026-09-30, note `'โน้ตลับ-โลก-03'` (today line) |
  | `w.timeOff.pOnlyNextWeek` | pOnly, sick, 2026-10-06..2026-10-07, note `'โน้ตลับ-โลก-04'` |
  | `w.tasks.pDueThisWeek` | P leaf "งานกำหนดส่ง P-ลับ17", assigned `member`, `dueDate 2026-10-02`, no allocation (M9 bucket UNPLANNED → **not** on home) |
  | `w.pages.qRecent` | Q page "หน้าล่าสุด Q-ลับ18", `updated_at` = 2026-09-30T09:00+07:00 (newest) |
  | `w.pages.pEmbed` | P page "หน้าฝังบล็อก P-ลับ19" whose content = `[taskView {view:'BOARD'}, projectWorkload {}]` |
  | `w.pages.qEmbed` / `w.pages.aEmbed` / `w.pages.wikiEmbed` | same content in Q, A (archived) and the wiki |

  Smoke `tests/helpers/world.int.test.ts › with home`: keys exist; `pEmbed.contentText === ''`; every task inserted has a `status_id` of its project (X70).
- `tests/authz/rows/home.ts` (`export const rows: AuthzRow[] = []`) appended to `tests/authz/rows/index.ts` (X91: each milestone registers its own rows files; M11's AUD-00 fails on a missing one); `search.ts` and `pages.ts` (M4, already registered) get
  their M10 rows from S4.
- Done-check: `pnpm vitest run --project integration tests/helpers tests/authz`.

**S0.13 G0.** `pnpm db:generate` → "No schema changes"; `pnpm check` green (stubs typecheck; M4 parity/template tests green; rows empty);
`pnpm exec next typegen` OK and its generated route list contains `/api/search/index`, `/api/pages/[id]/embed/tasks` and `/api/pages/[id]/embed/workload`
(if Next treats the `index` segment specially, rename the folder to `api/search/local-index` everywhere in M10 and report it). Report: the S0.1 inventory with every renamed/missing name, the shortcut ids used, whether BlockNote accepted
numeric `values`.

### 5.S1 — Home, search and embed backend (backend-engineer · `src/server/services/{home,search,embed}*.ts`, `src/server/repo/{home,search}.ts`, `src/app/api/{home,search,pages/[id]/embed}/**`)

Rules for every step: authz/visibility first (`authz.ts` helpers, CLAUDE.md), one read-only transaction per route, every
`allocations` query bounded by `week_start` (`[ws, ws + n weeks)`), no plan dates derived in SQL (pass `ws`, `today`, `addDays(...)`
computed with `src/domain/dates.ts`), integer cd out (`(coalesce(sum(a.person_days), 0) * 100)::int`), no Thai literals (labels are
built on the client from `th`), sorting by names with `compareThai` (M2 `src/lib/collate.ts`) in TypeScript. Tests are integration tests next to the
code, written first, with `APP_NOW=2026-09-30T10:00:00+07:00`, `ALLOW_TEST_HOOKS=1`. Every task a test inserts goes through `makeTask` (which sets the
project's default `status_id`, X70) — never a raw `insert(tasks)` without `statusId`.

**S1.1 `myTasksThisWeek` (FR-1101a, M10-D13; M9 reuse).**
```ts
export async function myTasksThisWeek(tx, user, today) {
  const b = await listMyTaskBuckets(tx, user, today)                         // M9: 4 buckets, own rows only (no masking needed)
  const tasks = b.buckets.find((x) => x.key === 'THIS_WEEK')?.tasks ?? []
  return { items: tasks.slice(0, 20), more: Math.max(0, tasks.length - 20) }
}
```
No own SQL (one FR-1009 rule). Tests first (`src/server/services/home.int.test.ts › myTasks`): golden F1 — Cindy → exactly one item
`ปรับปรุงระบบ POS หน้าร้าน` (project `POS Upgrade`, `plannedCd 250`) (CRM "ย้ายข้อมูลลูกค้า" is NEXT_WEEK → absent); Ivy → `ทำ UAT + คู่มือหน้าร้าน` 250;
Peter → `ย้าย pipeline ขึ้น BigQuery` 500; Jack → `ออกแบบ flow ใหม่` 375; Mint → `พัฒนา front-end` 250; Manager → `[]` (r8 §4.10). World `home`: member →
`pChildA` (plan this week) present, `pDueThisWeek` (unplanned) and `aTask` (archived) absent; after `completeTask([pChildA])` it is absent; 21 THIS_WEEK
tasks → 20 items + `more: 1`; the items deep-equal M9's `THIS_WEEK` bucket for the same user (parity with `/my`).

**S1.2 `myLoad` (FR-1101b, BR-40/45, M10-D14; M9 reuse).** `cells = await services.workload.personCells(tx, user, user.id, { from: ws, to:
addWeeks(ws, 8) })` (M9: BR-44, BR-50, certainty, capacity, BR-40/41 inside) → `weekRange(ws, addWeeks(ws, 8)).map((week) => ({ week, cell: cells[week]! }))`.
Tests first (`› myLoad`): golden F1 totals per r8 §4.10 — Cindy `[250, 250, 250, 375, 375, 250, 0, 0]`, Peter `[500, 500, 375, 250, 0, 250, 375, 500]`,
Mint `[250, 500, 500, 500, 500, 375, 250, 0]`; capacities all 500; every level `OK`; and on the client side (`MyLoadCard.test.tsx`) `viewTone(…, 'ALL').tone`
gives Cindy `[light×6, empty, empty]`, Peter `[full, full, light, light, empty, light, light, full]`; F3 Peter `2026-10-05` → `{ total: 500, committed: 500,
capacity: 300, level: 'OVER', excess: 200, cause: 'CAPACITY' }`; F4 Cindy `2026-10-12` → `{ 250, 0, 200, 'RISK' }` (r8 G7: red by ratio, glyph RISK); Manager →
8 cells `{ total: 0, capacity: 500, level: 'OK' }` (personCells of oneself works even outside M9's population); exactly 8 weeks; every number `Number.isInteger`.

**S1.3 `homeMilestones` (FR-1101c, FR-705, M10-D15; M8 reuse).**
```ts
export async function homeMilestones(tx, user, today) {
  const rows = await services.milestones.listVisibleMilestones(tx, user, { from: addDays(today, -28), to: addDays(today, 15) }, today)  // M8
  return rows
    .filter((m) => m.status !== 'DONE' && (compareISO(m.date, today) >= 0 || m.status === 'OVERDUE'))
    .sort((a, b) => Number(b.status === 'OVERDUE') - Number(a.status === 'OVERDUE') || compareISO(a.date, b.date) || collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1))
    .slice(0, 10)
}
```
No own milestone SQL (M8 owns visibility, BR-70 status and BR-71 `late`). Tests first (`› milestones`, world `home` ⊇ M8 `'milestones'`):
member → `[pOverdue (OVERDUE), pLate "ส่งมอบรอบแรก P" (DUE_SOON, late: true)]`; never `w.milestones.p` (10-23, outside), `pDone`, `q`, `qSoon`, `a`;
outsider → `[qSoon (DUE_SOON: 2026-10-05 − 2026-09-30 = 5 ≤ 7, X66)]` (M8's `q` 10-20 is outside the window); manager → `[pOverdue, pLate, qSoon]`
(A archived excluded by M8); a milestone dated 2026-08-31 (overdue, beyond the 4-week look-back) is absent; golden + `addMilestones` (A.2, r8 §4.9) —
Cindy → only `UAT sign-off` (POS, DUE_SOON, late) and the body has none of `'Pipeline พร้อมใช้งาน'`, `'Design freeze'`, `'Beta release'`,
`'Dashboard v1 review'` (r8 D2, M8-D23); Manager → `[UAT sign-off, Design freeze (UPCOMING, +9 days)]`; Jack → `[Design freeze]`.

**S1.4 `homeLeave` (FR-1101d, MASK-5, X60b, M10-D16).** `cal = await getCalendar(tx, user, { from: ws, to: addWeeks(ws, 2) }, today)` (M5: visible
people only, masked entries); map each `cal.timeOff` entry to `{ userId, name: displayName(cal.people[userId]), entry }`; `splitLeaveLines(entries,
today, ws)` (`src/server/services/home-leave.ts`, pure): วันนี้ = `start ≤ today ≤ end`; สัปดาห์นี้ = overlaps `[ws, addDays(ws, 6)]` and not in วันนี้;
สัปดาห์หน้า = overlaps `[addDays(ws, 7), addDays(ws, 13)]`; each line sorted by `startDate`, then name (collator).
Tests first: `src/server/services/home-leave.test.ts` (unit; today 09-30, ws 09-28) — entry 09-30 → today only; 09-28..09-29 → thisWeek; 10-02 →
thisWeek; 10-05..10-06 → nextWeek; 09-25..10-06 → today **and** nextWeek; 10-12 → none; empty → three `[]`.
`› leave` (world `home`): member → today `[coworker, kind 'masked', label th.masking.leave]`, nextWeek `[pOnly masked 10-06..10-07 half null]`;
`JSON.stringify` has no `'โน้ตลับ-โลก-03'`, `'โน้ตลับ-โลก-04'`, `'ลาพักร้อน-โลก'`, `'ลาป่วย-โลก'`, leave ids; outsider → today `[coworker masked]`, no pOnly
anywhere; manager → `kind 'full'` with `leaveTypeName`; coworker (self) → own entry full. Golden F3 — Cindy (LEAD) → nextWeek `[Peter masked
2026-10-05..2026-10-06]`; Ivy → all three lines empty (Ivy cannot see Peter, r8 §4.3); Manager → Peter full `'ลาพักร้อน'`; Peter → own full.

**S1.5 `recentPages` (FR-1101e, M10-D17).** SQL in `src/server/repo/home.ts#listRecentPages(tx, { all: boolean; visibleProjectIds: readonly string[] })`
(the only function in that file; `all` = `visibleProjectIds(tx, user) === 'ALL'`); the service maps rows to `HomeRecentPage`.
```sql
select g.id, g.title, g.icon, g.updated_at, g.updated_by, u.name as updated_by_name, u.nickname as updated_by_nickname,
       pr.name as project_name
from pages g
join "user" u on u.id = g.updated_by
left join projects pr on pr.id = g.project_id
where g.deleted_at is null and (g.space = 'WORKSPACE' or $all or g.project_id = any($vis::uuid[]))
order by g.updated_at desc, g.id
limit 8
```
The editor's name is mapped with `displayName({ name, nickname })` in TypeScript (PLAN §3.7). `updatedAt` as ISO string; `href /p/<id>`. Tests first (`› recentPages`): outsider → first `qRecent`, only Q + wiki titles, none of P/A page titles (`'หน้า P-ลับ05'`,
`'Charter P-ลับ04'`, `'หน้า A-ลับ10'`); member → P (+ A) + wiki, no `'หน้าล่าสุด Q-ลับ18'`; 10 visible pages → 8; a deleted page is absent; golden →
Cindy sees the POS and CRM charters (`projectName` set) and no DW/Mobile/Store charter.

**S1.6 `managerCards` (FR-1101f, X67, M9-D3, M10-D18).** `if (!isManager(user)) return null`;
`over = await services.workload.buildTable(tx, user, { window: { from: ws, to: addWeeks(ws, 2) }, onlyOver: true }, today)` → `overloaded = over.overloads`
(M9 order and `href`); `wl = await services.workload.buildTable(tx, user, { window: { from: ws, to: addWeeks(ws, 4) } }, today)`; per week sum
`cell.total`, `cell.committed`, `cell.capacity` over `wl.groups.flatMap((g) => g.people)` + `percentTenths`; `total` = sums over the 4 weeks.
Tests first (`› manager`): golden F1 as manager → `overloaded []`; weeks `[09-28: 1625/2500 → 650, 10-05: 1875/2500 → 750, 10-12: 750, 10-19: 750]`,
committed `[650, 650, 550, 500]`, total `7250/10000 → 725` ("72.5%"), committed total `5875 → 588` (r8 §4.6; 5 workers — M9-D3 excludes the manager);
F3 → `overloaded [{ name: 'Peter', week: '2026-10-05', level: 'OVER', excess: 200, cause: 'CAPACITY' }]`, total `7250 / 9800 → 740` ("74.0%"); F2 →
`overloaded []` (10-19 is outside this week and next); every worker (Cindy as LEAD included) → `null`.

**S1.7 `getHome` + `GET /api/home` (FR-1101, M10-D34).**
```ts
export async function getHome(tx, user, { today, now }) {
  const ws = weekStart(today)
  const [myTasks, load, milestones, leave, pages, manager] = [await myTasksThisWeek(tx, user, today), await myLoad(tx, user, ws),
    await homeMilestones(tx, user, today), await homeLeave(tx, user, today), await recentPages(tx, user), await managerCards(tx, user, ws, today)]
  return { today, now: now.toISOString(), weekStart: ws, myTasks, myLoad: load, milestones, leave, recentPages: pages, manager }
}
// src/app/api/home/route.ts
export const GET = route(async (_req, { user }) => db.transaction(
  (tx) => getHome(tx, user, { today: serverToday(), now: serverNow() }),
  { isolationLevel: 'repeatable read', accessMode: 'read only' }))
```
(Sequential awaits inside one transaction: postgres.js runs one query at a time per transaction connection.)
Tests first (`› getHome`): shape keys exactly `['today','now','weekStart','myTasks','myLoad','milestones','leave','recentPages','manager']`; `today
'2026-09-30'`, `weekStart '2026-09-28'`; `myLoad.length === 8`; a recursive walk asserts every number is an integer (BR-03); route as `asNobody()`
→ 401; route `Cache-Control` = `private, no-store` (M1 `route()`).

**S1.8 Search over all categories + index (FR-1102/1104/1105, X68, M10-D20/D21).** `src/server/services/search.ts` (M4 file) +
`src/server/repo/search.ts`. Common: `q = normalizeQuery(raw)`; `pat = '%' + escapeLike(q) + '%'` bound as a parameter, `ILIKE $pat ESCAPE '\'`;
`limit 8`; visibility sets from `authz.ts`.
```sql
-- projects (visibleProjectIds; archived included with a chip)
select p.id, p.name, p.color, p.archived_at is not null as archived, p.certainty = 'TENTATIVE' as tentative
from projects p where p.deleted_at is null and ($all or p.id = any($vis::uuid[])) and p.name ilike $pat escape '\'
order by word_similarity($q, p.name) desc, length(p.name), p.id limit 8;
-- tasks (live tasks of visible projects; open first)
select t.id, t.name, t.project_id, p.name as project_name, p.archived_at is not null as project_archived,
       s.id as status_id, s.name as status_name, s.color as status_color, s.category as status_category, t.completed_on is not null as completed
from tasks t join projects p on p.id = t.project_id and p.deleted_at is null join task_statuses s on s.id = t.status_id
where t.deleted_at is null and ($all or t.project_id = any($vis::uuid[])) and t.name ilike $pat escape '\'
order by (t.completed_on is not null), word_similarity($q, t.name) desc, length(t.name), t.id limit 8;
-- people (visibleUserIds; deactivated labelled)
select u.id, u.name, u.nickname, pos.name as position_name, <M1 active predicate> as active
from "user" u left join positions pos on pos.id = u.position_id
where ($allUsers or u.id = any($users::text[])) and (u.name ilike $pat escape '\' or u.nickname ilike $pat escape '\')
order by greatest(word_similarity($q, u.name), word_similarity($q, coalesce(u.nickname, ''))) desc, length(u.name), u.id limit 8;
-- clients (manager: all; others: clients of visible projects)
select c.id, c.name, c.archived_at is not null as archived from clients c
where c.name ilike $pat escape '\'
  and ($isManager or exists (select 1 from projects p where p.client_id = c.id and p.deleted_at is null and p.id = any($vis::uuid[])))
order by word_similarity($q, c.name) desc, length(c.name), c.id limit 8;
```
`searchAll` runs projects → tasks → `searchPages` (M4, unchanged: title hits, then content for ≥ 3 chars inside a savepoint) → people → clients
and returns `SearchResponse`. `GET /api/search` (M4 route) now returns `await searchAll(tx, user, q, { titleOnly })` inside the same read-only
transaction with `SET LOCAL statement_timeout = '500ms'`; when `titleOnly=1` (M4 mention menu) only `pages` is filled and the other arrays are `[]`.
`searchIndex(tx, user)`: visible non-deleted projects (archived included; `role` = `MANAGER` for managers else the membership role) + visible people +
visible clients, sorted with `Intl.Collator('th')`; `GET /api/search/index` (read-only tx). People `active` uses M1's predicate (`banned IS NOT TRUE`
and not deactivated — reuse the M1 helper).
Tests first (`src/server/services/search.int.test.ts`, extend M4's): golden — `'ลูกค้า'` as Cindy and as Ivy → `tasks` contains `ย้ายข้อมูลลูกค้า`
(CRM); as Jack → `tasks: []` (r6b §5 M10); `'POS'` as Cindy → `projects [POS Upgrade]`, as Peter → `[]`; `'Pat'` as Ivy → `people []`, as Cindy (LEAD →
everyone) → `[Peter]`; `'Com'` as Peter → `clients [Coral]`, as Jack → `[]`; `'Studio'` as Ivy → `[Sunrise]`. World — `escaping`: P tasks `'a_b'` and
`'axb'` → `q='a_b'` returns only `'a_b'`; `q='%'` returns nothing without a literal `%`; `q='\'` no SQL error; `ranking`: tasks `'ลูกค้า'`, `'ข้อมูลลูกค้าเก่า'`,
`'ย้ายข้อมูลลูกค้า'` → `'ลูกค้า'` first; a completed match after an open one; 9 matching tasks → 8; deleted task and deleted project excluded; archived A
project and its task visible to member with `archived`/`projectArchived` true; `titleOnly` → only pages filled; `index`: outsider → projects `[Q]` (role
MEMBER), people ids exactly `{ outsider, coworker }` (X43), clients `[C2]`; manager → every project with role `MANAGER`; `uses index`: with
`SET LOCAL enable_seqscan = off`, `EXPLAIN` of the tasks query with `'%ลูกค้า%'` mentions `tasks_name_trgm`; `timing`: `searchAll` for `'ลูกค้า'` on the
golden DB completes, duration logged, `< 500` ms asserted.

**S1.9 Embed tasks (FR-1301/1302/1304, X78, M10-D2/D3).** `src/server/services/embed.ts`:
```ts
export async function getEmbedTasks(tx, user, pageId) {
  const { page } = await requirePage(tx, user, pageId, 'view')                 // invisible / deleted → NotFoundError (404)
  if (page.space === 'WORKSPACE' || page.projectId === null) return { kind: 'wiki' } as const
  const data = await listProjectTasks(tx, user, page.projectId)                 // M3: requireProject(view), archived readable
  return { kind: 'project', projectId: page.projectId, projectName: data.project.name, tasksHref: `/projects/${page.projectId}/tasks`, data }
}
// src/app/api/pages/[id]/embed/tasks/route.ts
export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const p = embedParamsSchema.safeParse(params)                                // route() does not validate params (G44)
  if (!p.success) throw new NotFoundError()                                     // 404 on a non-uuid, before any query (M10-D1, X86)
  return db.transaction((tx) => getEmbedTasks(tx, user, p.data.id), { isolationLevel: 'repeatable read', accessMode: 'read only' })
})
```
`requirePage` comes from `src/server/authz.ts` (M4) and runs before any task query; `listProjectTasks` performs M3's own `requireProject(view)`.
Tests first (`src/server/services/embed.int.test.ts › tasks`): member + `pEmbed` → `kind 'project'`, `data.project.id === P`, `data.statuses.length === 6`,
`data.tasks` contains `pParent`, `viewer.canEdit === true`; outsider + `qEmbed` (identical content JSON) → Q's tasks (binding, AC-1302); member +
`wikiEmbed` → deep-equals `{ kind: 'wiki' }`; member + `aEmbed` → `viewer.canEdit === false`; outsider + `pEmbed` → `NotFoundError`; a soft-deleted
page → 404; golden — Peter on the DW charter (created by `seedGolden` after M10, so it contains the template blocks) → DW tasks
`['ย้าย pipeline ขึ้น BigQuery']`; Ivy on the POS charter → POS tasks; the response never contains a task of another project.

**S1.10 Embed workload (FR-1303, AC-1303, M10-D11; M9 `buildTable`).**
```ts
export async function getEmbedWorkload(tx, user, pageId, today) {
  const { page, archived } = await requirePage(tx, user, pageId, 'view')         // authz.ts (M4): 404 first
  if (page.space === 'WORKSPACE' || page.projectId === null) return { kind: 'wiki' } as const
  const ws = weekStart(today)
  const members = (await repo.members.listMembers(tx, page.projectId)).map((m) => m.userId)   // M2 members repo (C50)
  const wl = await services.workload.buildTable(tx, user, { window: { from: ws, to: addWeeks(ws, 8) }, userIds: members }, today)   // M9: ∩ visible, M9-D3, masking inside
  const people = wl.groups.flatMap((g) => g.people)
    .map((p) => ({ userId: p.userId, name: p.name, deactivated: p.deactivatedOn !== null, cells: p.cells }))
    .sort((a, b) => compareThai(a.name, b.name))
  const project = await repo.projects.getProject(tx, page.projectId)          // M2; exists after requirePage
  if (!project) throw new NotFoundError()
  return { kind: 'project', projectId: page.projectId, projectName: project.name, archived, workloadHref: `/workload?projectId=${page.projectId}`,
    weeks: wl.weeks, people, projects: wl.projects }
}
```
(`members = []` is passed as an empty array, never `undefined`, so M9 returns no people instead of the whole team: m09 S2.2 pins that `listCandidates`
treats `userIds: null` as "no restriction" and `userIds: []` as "nobody" (C92) — the `people: []` test below guards it.)
Route `src/app/api/pages/[id]/embed/workload/route.ts`: params parsed as S1.9, read-only transaction, `today = serverToday()`. Tests first (`› workload`, world
`home` with allocations): member + `pEmbed` → `weeks` = 8 Mondays from `2026-09-28` to `2026-11-16`; people = P's members in M9's population visible to member
(`lead`, `member`, `coworker`, `pOnly`; sorted); coworker cell `2026-10-05`: `total 400`, `byProject` contains P `{ total: 100 }` and one masked part
`{ projectId: null, total: 300, committed: 300 }`; `JSON.stringify(body)` contains none of `w.Q.name`, `w.Q.id`, `w.tasks.qTask.name`, `w.tasks.qTask.id`,
`w.assignments.qTaskCoworker.id`; `archived === false`; outsider + `qEmbed` → coworker's P 100 masked, no `w.P.name`/`'งานร่วม P-ลับ03'`; **archived (C49)**: member +
`aEmbed` → `archived: true`, people exactly `[lead, member]` (A's members, both still active members of P → in the M9-D3 population), no `byProject` part with
`projectId === w.A.id`, `projects` has no key `w.A.id`, and the members' cells equal the same people's cells from `buildTable(... { userIds: [lead, member] })`
(the archived `aTaskMember` allocation is not counted, BR-44); an archived project made in the test (`makeProject({ archived: true, members: [fresh] })` + a `makePage` on it) whose only member `fresh` has no other
project and no load → `people: []`, and the manager sees the same `[]`;
wiki → `{ kind: 'wiki' }`; every number
integer; parity: for every person/week the cell deep-equals `buildTable(... { userIds: [that person] })`'s cell (same function → identical masking, FR-1303);
golden — Ivy on the POS charter → people `[Cindy, Ivy, Mint]` (POS members), Mint's `2026-09-28` cell `250` entirely in the masked part, body without
`'Mobile App Revamp'` and `'พัฒนา front-end'` (AC-1303, r8 §4.3 Ivy → Mint); Peter is not a row (not a POS member).

**S1.11 G1.** `pnpm vitest run --project integration src/server/services/{home,search,embed}* tests/helpers` · `pnpm vitest run --project unit
src/server/services/home-leave.test.ts` · `pnpm eslint src/server src/app/api` · `pnpm typecheck` (own paths clean). Report any M8/M9 name that
differed (§1.4).

### 5.S2 — Home dashboard, palette categories and quick commands (frontend-engineer · `src/app/(app)/home/**`, `src/components/{home,palette,shell}/**`, two scoped files, two hooks)

MUI 9 only (`slots`/`slotProps`, `sx`, Grid `size`), strings from `th`, `unwrap()` + `useMutation`, no `router.refresh()`, no
`localStorage`, state never by colour alone, no confirm dialog (undo toasts, 8 s, Cmd+Z via M1's `useUndo`). Component tests (`ui`
project) are written first; actions are mocked with `vi.mock('@/server/actions/…')`, fetch with a stub returning the S0 DTOs.

**S2.1 `/home` RSC page (FR-1101, X32, X57, M10-D19/D34).** `src/app/(app)/home/page.tsx` replaces M0's placeholder:
```tsx
export const metadata = { title: th.home.title }
export default async function HomePage() {
  const user = await requirePageUser()                                     // layout already gated; no Suspense above (X57)
  const now = serverNow(); const today = serverToday()
  const qc = new QueryClient()
  await qc.prefetchQuery({ queryKey: qk.home(), queryFn: () => db.transaction(
    (tx) => getHome(tx, user, { today, now }), { isolationLevel: 'repeatable read', accessMode: 'read only' }) })
  const greeting = th.home.greetingFor[greetingKey(bangkokHour(now))](displayName(user))
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <HomeHeader greeting={greeting} dateLine={formatHomeDate(today)} />   {/* <h1> = greeting, <p> = date line */}
      <HomeDashboard />
    </HydrationBoundary>)
}
```
(Pattern from `plan/research/snippets/r4/client/app/projects/p/page.tsx`.) The `<h1>` is the greeting (the document title stays
`th.home.title`). Test `src/app/(app)/home/page.test.tsx` is not needed (RSC); the greeting is covered by `greeting.test.ts` and e2e H1.

**S2.2 `HomeDashboard` and cards (`src/components/home/`, FR-1101a–f, M10-D13–D18, D33).**
- `HomeDashboard.tsx` (`'use client'`): `const { data, isError, refetch } = useQuery({ queryKey: qk.home(), queryFn: ({ signal }) =>
  getJson<HomeResponse>('/api/home', { signal }) })`; error → `Alert` `th.home.loadError` + button `th.home.retry`. Layout: `Box sx={{ maxWidth: 1200,
  mx: 'auto', px: { xs: 2, md: 3 } }}` → `Grid container spacing={2}`; for managers (`data.manager !== null`) the first row is `ManagerOverloadCard`
  + `ManagerUtilisationCard` (P6: one click to `/workload`); then `MyTasksCard`, `MyLoadCard`, `MilestonesCard`, `LeaveCard` each `size={{ xs: 12, md: 6 }}`
  and `RecentPagesCard` `size={12}`. Each card = MUI `Card` with `CardHeader` `title` (`component="h2"`) — headings are what e2e and screen readers use.
  No horizontal overflow at 390 px (lists wrap, long names `overflowWrap: 'anywhere'`).
- `MyTasksCard.tsx`: list (`role="list"`) over `MyBucketTask` items (M9); row = `Checkbox` (`slotProps.input['aria-label'] = th.home.myTasks.complete(name)`),
  name as `Link` to `/projects/<project.id>/tasks?task=<id>`, `parentName` (secondary), M2 `ProjectChip` (`project`), M3 `StatusChip` (read-only, small) and
  `th.home.myTasks.planned(formatCd(plannedCd, { unit: 'DAYS', decimals: 1 }))` (+ `th.home.myTasks.due(formatThaiDate(dueDate, 'medium'))` when a due date exists);
  a row ticked in this session (local `ticked` set + optimistic cache flag) shows `textDecoration: 'line-through'` **and** a checked box until the refetch removes it. `more > 0` → `th.home.myTasks.more(more)`; footer link `th.home.myTasks.seeAll` →
  `/my`; empty → M0 `EmptyState` `th.home.myTasks.empty` + caption `th.home.myTasks.hint` (no quick add, X68).
  Tick (M10-D33):
  ```ts
  const tick = useMutation({
    mutationFn: async (it: HomeTaskItem) => unwrap(await (it.completed ? uncompleteTask({ taskIds: [it.id] }) : completeTask({ taskIds: [it.id] }))),
    onMutate: async (it) => { await qc.cancelQueries({ queryKey: qk.home() }); const prev = qc.getQueryData<HomeResponse>(qk.home())
      qc.setQueryData<HomeResponse>(qk.home(), (d) => d && patchHomeTask(d, it.id, { completed: !it.completed })); return { prev } },
    onError: (e, _it, ctx) => { if (ctx?.prev) qc.setQueryData(qk.home(), ctx.prev); toast.error((e as Error).message) },
    onSuccess: (r, it) => undo.push({ label: th.tasks.undoLabel.complete,                      // M3 key; use the existing label key
        undo: async () => { unwrap(await revertTaskStatus({ items: r.changed.map((c) => ({ taskId: c.taskId, ...c.previous })) })) },
        redo: async () => { unwrap(await (it.completed ? uncompleteTask : completeTask)({ taskIds: [it.id] })) } },
      { toast: it.completed ? th.tasks.toast.uncompleted : statusToastMessage(r, th.tasks.toast.completed) }),   // M6 BR-52
    onSettled: async (_r, _e, it) => { await invalidateTasks(qc, it.projectId); await invalidateLoad(qc) },
  })
  ```
  (`it.completed` = the local ticked flag; `patchHomeTask` = pure helper in `src/components/home/patch.ts` (unit-tested) that sets that flag in the cached
  `HomeResponse`; the undo/redo entries invalidate the same keys, so an undone task reappears in the card.)
- `MyLoadCard.tsx` + `MyLoadCard.module.css`: 8 columns over `HomeLoadWeek { week, cell }`; `const v = viewTone({ total: cell.total, committed: cell.committed },
  cell.capacity, 'ALL')` (M9 domain); bar `div` with `data-tone={v.tone}` and `data-level={cell.level}`, height `min(total, 2·capacity) / (2·capacity)` of the track
  (capacity 0 → full-height striped `noCapacity` track); `role="img"` + `aria-label = th.home.myLoad.barLabel(formatWeekHeader(week), compactDays(cell.total),
  compactDays(cell.capacity))`; text above = M9 `workloadCellText(cell.total, cell.capacity)` (e.g. "2.5/5", "–" for 0);
  week label under (`formatWeekHeader`); OVER/RISK → M6/M7 `StatusGlyph kind="over" | "risk"` (visible glyph + hidden text). Colours are the BR-45
  tokens (`--load-*`, X51 contrast) read in the CSS Module. Caption `th.home.myLoad.legend`.
- `MilestonesCard.tsx`: list; row = ◆ (`aria-hidden`), `formatThaiDate(date, 'short')`, name (`Link` → `/projects/<projectId>/overview`), project chip,
  M8 `MilestoneStatusChip status={status}`, M8 `MilestoneLateBadge` when `late`; empty → `th.home.milestones.empty`.
- `LeaveCard.tsx`: `<dl>` with three `<dt>` (`th.home.leave.today`, `thisWeek`, `nextWeek`) and `<dd>`; each entry
  `th.home.leave.entry(name, formatLeaveRange(entry.startDate, entry.endDate, entry.half))` + (only `entry.kind === 'full'`) ` · ${entry.leaveTypeName}`;
  masked entries show `entry.label` (`'ลา'`); empty line → `th.home.leave.none`.
- `RecentPagesCard.tsx`: list of `Link`s to `href`: icon (default 📄), title or `th.pages.untitled`, `projectName ?? th.palette.wiki`,
  `th.home.recentPages.editedBy(updatedBy.name, formatRelative(updatedAt, data.now))`.
- `ManagerOverloadCard.tsx`: rows over M9 `OverloadItem` = name (`Link` → `href`, M9's `/people/<id>/plan?week=<w>`), `th.home.manager.week(formatWeekHeader(week))`,
  `StatusGlyph` + `th.overload.level[level]`, `th.overload.excess(compactDays(excess))`, cause text `th.overload.cause[cause]` (or `th.overload.cause.DEACTIVATED` when `deactivatedOn ≤ week`, M9-D7); header action link
  `th.home.manager.openWorkload` → `/workload`; empty → `overloadedEmpty`. `ManagerUtilisationCard.tsx`: a small table week × `formatPercentTenths`
  (+ `committed(...)`), total row `utilisationTotal`.
- Tests first (`ui`): `HomeDashboard.test.tsx` — with a seeded `HomeResponse` (Cindy, F3: next-week Peter masked) all five worker card headings render
  and **no** manager heading when `manager: null`; with a manager payload the two manager cards render first; error → retry button refetches.
  `MyTasksCard.test.tsx` — tick calls `completeTask({ taskIds: [id] })`, the row is struck through immediately (optimistic) and disappears after the mocked refetch, the toast text equals
  `statusToastMessage({ released: { cd: 1875, weeks: 5 } }, …)` = `'ปลดภาระ 18.8 วัน ในอีก 5 สัปดาห์'` when the action returns it; the undo entry calls
  `revertTaskStatus` with the previous status; unticking a still-visible ticked row calls `uncompleteTask`. `MyLoadCard.test.tsx` — Peter F1 values →
  8 `img`s with labels `th.home.myLoad.barLabel('28/9', '5', '5')` …, texts `'5/5', '5/5', '3.8/5', '2.5/5', '–', '2.5/5', '3.8/5', '5/5'` and `data-tone` `full, full, light, light, empty, light, light, full`; an OVER week
  shows the glyph's hidden text. `LeaveCard.test.tsx` — masked entry shows `th.masking.leave` and no type; full entry shows the type; empty lines show
  `'—'`. `RecentPagesCard.test.tsx` — editedBy text with `now` 2 h later contains `'ชม.'`. `ManagerCards.test.tsx` — `725` → `'72.5%'`, cap 0 → `'—'`.
- Done-check: `pnpm vitest run --project ui src/components/home` · `pnpm vitest run --project unit src/components/home/patch.test.ts`.

**S2.3 Palette result groups + local index (FR-1102/1104, NFR-06, M10-D20–D22, D26).** Files: `src/components/palette/{CommandPalette.tsx,
groups.tsx, useSearchIndex.ts, PaletteItemRow.tsx}` (M4/M8 files extended, not restructured).
- `groups.tsx` — M4's `PALETTE_GROUPS` gains four entries **in FR-1102 order** (`projects`, `tasks`, `pages` (M4 entry, byte-for-byte unchanged), `people`,
  `clients`). `PaletteItem` is M4's, unchanged; `PaletteGroupDef` is a **superset** of M4's (only optional additions, C60):
  ```ts
  export interface PaletteItem { value: string; href: string; title: string; subtitle?: string; icon?: ReactNode; chips?: string[] }   // M4
  export interface LocalMatches { projects: SearchIndexProject[]; people: SearchIndexPerson[]; clients: SearchIndexClient[] }        // M10
  export interface PaletteGroupDef { key: keyof SearchResponse; heading: string
    source?: 'local' | 'server'                                               // M10; absent = 'server' (M4's pages entry)
    map(input: { server: SearchResponse | undefined; local?: LocalMatches }): PaletteItem[] }   // M4's input object + optional `local`
  // projects/people/clients: source 'local' → map uses `local` and falls back to `server` arrays when the index query errored or `local` is undefined;
  // tasks: 'server'. CommandPalette calls g.map({ server: data, local }) — M4's g.map({ server }) call shape still type-checks.
  ```
  Item rendering (`PaletteItemRow`): project = colour dot + name + chips (`th.search.archived`, ◐ + hidden `th.search.tentative`); task = mini `StatusChip`,
  name, `th.search.inProject(projectName)`, chips `th.search.completed` / `th.search.archived`; page = M4 row; person = M1 `UserAvatar` + display name +
  nickname/position + `th.search.deactivated` when inactive; client = name + archived chip. Values `project:<id>`, `task:<id>`, `page:<id>`, `person:<id>`, `client:<id>`.
- `useSearchIndex.ts`: `useQuery({ queryKey: qk.searchIndex(), queryFn: ({ signal }) => getJson<SearchIndexResponse>('/api/search/index', { signal }),
  staleTime: 60_000 })`; `PaletteProvider` calls `qc.prefetchQuery` for it once after mount (idle) and `refetch()` whenever the palette opens.
  `useLocalMatches(index, q)` = `matchLocal` over projects (`keys [name]`), people (`[name, nickname, positionName]`), clients (`[name]`) — synchronous.
- `CommandPalette.tsx`: `q` state; `const debounced = useDebouncedValue(normalizeQuery(q), 120)` (`src/hooks/useDebouncedValue.ts`, unit-tested with fake
  timers); server query `useQuery({ queryKey: qk.search(debounced, 'all'), queryFn: ({ signal }) => getJson<SearchResponse>(\`/api/search?q=${encodeURIComponent(debounced)}\`, { signal }),
  enabled: isOpen && debounced.length > 0, staleTime: 30_000, placeholderData: keepPreviousData })` (TanStack aborts superseded requests); render
  `<CommandsGroup …/>` (M8; renders nothing when `useVisibleCommands(q)` is empty) then `PALETTE_GROUPS.map(g => items.length > 0 && <Command.Group heading={g.heading}>…)`
  (M4's loop, unchanged apart from the `local` input); `Command.Empty` only when every group and the commands are empty and the server query settled; `Command.Loading` while the server query is in flight and no group has items. Selecting a result →
  `close()` + `router.push(item.href)`. Placeholder `th.palette.placeholder`; empty input → `th.palette.hint` + commands. `<Command shouldFilter={false} loop
  vimBindings={false}>` unchanged (r4 §21).
- Tests first (`CommandPalette.test.tsx`, extend M4/M8): index stub `{ projects: [POS Upgrade], people: [Cindy, Ivy, Mint], clients: [Coral] }` and a server stub
  that never resolves → typing `po` shows the `POS Upgrade` option **synchronously** (no timers advanced); typing `ลูกค้า` and advancing 120 ms → fetch called
  once with `q=ลูกค้า` and, after it resolves with a task `ย้ายข้อมูลลูกค้า`, the tasks group shows it with `th.search.inProject('CRM Migration')`; typing `pat`
  (Peter not in the index) → no people option even if the server stub returns Peter (local wins); index fetch failing → people group uses server results;
  group order in the DOM = commands (M8 heading), projects, tasks, pages, people, clients; Enter on the task → `router.push('/projects/<crm>/tasks?task=<id>')`
  and the dialog closes; M4's cases (defaultPrevented keydown does not open, Ctrl+K in an input opens, Esc closes) still pass.
- Done-check: `pnpm vitest run --project ui src/components/palette src/hooks/useDebouncedValue.test.tsx`.

**S2.4 Quick commands in M8's registry (FR-1103, X68, M8-D18, M10-D23).** Append to `src/components/palette/commands.ts#PALETTE_COMMANDS`
(keep M8's `milestone.create` first, then M10's four):
Ctx wiring (C48/C75) — three places only, M8's lines untouched:
1. `src/components/palette/commands.ts`: add four fields to M8's `PaletteCommandCtx` interface (M8: `close`, `pathname`, `currentProjectId`, `openMilestoneDialog`).
2. `src/components/palette/PaletteProvider.tsx`: fill them inside M8's single builder `useCommandCtx()` and change `currentProjectId` to
   `usePaletteScope()?.id ?? projectIdFromPath(pathname)` (M8's helper is the fallback). No second ctx builder anywhere.
3. `src/components/palette/commands.test-utils.ts`: add `navigate: vi.fn(), openLeaveDialog: vi.fn(), beginCreateTask: vi.fn(), createPageHere: vi.fn(async () => {})`
   to `fakeCommandCtx()`'s defaults (before `...over`), so M8's `commands.test.ts` keeps passing and M10's tests override what they assert.
```ts
// commands.ts — PaletteCommandCtx (M8) gains, additively:
  navigate(href: string): void                                  // M10: router.push(href)
  openLeaveDialog(): void                                       // M10: useLeaveDialog().open({ mode: 'create' }) (M5-D14)
  beginCreateTask(): void                                       // M10: setMode(...) — palette state lives in PaletteProvider (see flows below)
  createPageHere(): Promise<void>                               // M10: S2.4 flow below
// useCommandCtx() (PaletteProvider.tsx) — M8's fields as before, plus:
//   const scope = usePaletteScope(); const router = useRouter(); const leave = useLeaveDialog()
//   currentProjectId: scope?.id ?? projectIdFromPath(pathname),
//   navigate: (href) => router.push(href), openLeaveDialog: () => leave.open({ mode: 'create' }),
//   beginCreateTask: () => setMode(scope && !scope.archived ? { kind: 'taskName', project: { id: scope.id, name: scope.name } } : { kind: 'pickProject' }),
//   createPageHere: () => createPageFlow(scope)
// PALETTE_COMMANDS — appended after M8's 'milestone.create':
{ id: 'task.create', label: th.palette.commands.createTask.label, keywords: th.palette.commands.createTask.keywords,
  useVisible: () => (useSearchIndex().data?.projects.some((p) => !p.archived) ?? true), run: (c) => c.beginCreateTask() },
{ id: 'page.create', label: th.palette.commands.createPage.label, keywords: th.palette.commands.createPage.keywords, useVisible: () => true, run: (c) => void c.createPageHere() },
{ id: 'leave.report', label: th.palette.commands.reportLeave.label, keywords: th.palette.commands.reportLeave.keywords, useVisible: () => true, run: (c) => { c.close(); c.openLeaveDialog() } },
{ id: 'nav.today', label: th.palette.commands.goToday.label, keywords: th.palette.commands.goToday.keywords, useVisible: () => true, run: (c) => { c.close(); c.navigate('/home') } },
```
Flows (state machine `mode: { kind: 'search' } | { kind: 'pickProject' } | { kind: 'taskName'; project: { id: string; name: string } }`, held in
`PaletteProvider` next to M8's `milestoneDialog` state so `useCommandCtx()` can set it; reset to `search` on close; rendered by `CommandPalette.tsx`):
- `beginCreateTask()`: `scope = usePaletteScope()` (S2.5); if `scope && !scope.archived` → `taskName` with it, else `pickProject` listing index projects
  `!archived` (all viewer roles may create, PERM-11), the one with `id === prefs['palette.lastProjectId']` first with caption `th.palette.createTask.lastUsed`,
  the rest by `matchLocal` on the input; none → `th.palette.createTask.noProjects`. Header line shows the step (`pickProject` / `namePlaceholder(project.name)`);
  `Backspace` on an empty input → previous step (`th.palette.createTask.back` as `aria-label` of the back button); `Esc` closes.
- `taskName` Enter (ignore `isComposing`; empty name → no-op, P1): `const r = unwrap(await createTask({ projectId, name }))` → `setPreference('palette.lastProjectId',
  projectId)` → `invalidateTasks(qc, projectId)` → `undo.push({ label: th.tasks.undoLabel.create, undo: () => deleteTaskTree({ taskIds: [r.task.id] }) (keep its batch),
  redo: () => restoreTaskBatch({ batch }) }, { toast: th.palette.createTask.created(name, project.name) })` with a sonner action `th.palette.createTask.open` →
  `/projects/<pid>/tasks?task=<id>`; close. Failure → `toast.error(th.palette.createTask.failed)`, stay in the step.
- `createPageHere()`: `scope` (not archived) → `createPage({ space: 'PROJECT', projectId: scope.id, parentId: null })` else
  `createPage({ space: 'WORKSPACE', projectId: null, parentId: null })`; `invalidatePages(qc, { space, projectId })`; `close()`; `router.push(result.href)`
  (the blank page shows M4's template chooser); error → `toast.error(th.palette.createPage.failed)`.
- Tests first: `commands.test.ts` (unit, extend M8's; commands taken **by id**, never by index or array length) — `matchCommand(taskCmd, 'สร้าง')` true,
  `'new'` true, `'ลา'` false for createTask and true for `leave.report`, `'today'` true for `nav.today`, `''` true for all; ids unique;
  `leave.report.run(fakeCommandCtx())` calls `close` then `openLeaveDialog`; `nav.today.run(c)` → `c.navigate('/home')`; `task.create.run(c)` → `c.beginCreateTask()`;
  M8's `milestone.create` cases still pass with the extended `fakeCommandCtx()`. `PaletteProvider.test.tsx` (ui) — `useCommandCtx().currentProjectId` is
  the registered scope id on `/p/<pageId>` and `projectIdFromPath` on `/projects/<id>/plan` without a scope. `CommandPalette.test.tsx` — empty query lists the
  four M10 commands (+ M8's when targets exist); a query matching no command (e.g. `'Coral'`) → no element with the heading `th.milestones.palette.group`
  (`CommandsGroup` renders nothing); `task.create` with scope POS → name step directly, Enter `'งาน X'` → `createTask({ projectId: POS, name: 'งาน X' })`, `setPreference`
  called, toast text `th.palette.createTask.created('งาน X', 'POS Upgrade')`; without scope → picker shows only non-archived projects with the last used first;
  Backspace on empty goes back; `page.create` without scope → `createPage({ space: 'WORKSPACE', projectId: null, parentId: null })` + `router.push('/p/new-id')`;
  `leave.report` → `openLeaveDialog` called and the palette closed; `nav.today` → `router.push('/home')`.
- Done-check: `pnpm vitest run --project unit src/components/palette/commands.test.ts` · `pnpm vitest run --project ui src/components/palette`.

**S2.5 Palette project scope (M10-D24).** `src/components/palette/project-scope.tsx`: `PaletteProjectScopeProvider` (mounted in `AppShell` **around** `PaletteProvider`,
so `useCommandCtx()` can read it wherever it is called) holding a stack; `usePaletteProjectScope(project: { id: string; name: string; archived: boolean } | null)` pushes on mount / pops on unmount; `usePaletteScope()` reads the
top. `useCommandCtx()` sets `currentProjectId = usePaletteScope()?.id ?? projectIdFromPath(pathname)` (S2.4). Register it in `src/app/(app)/projects/[id]/layout.tsx` (render
`<PaletteProjectScope project={{ id, name: header.name, archived: header.archived }} />`, a tiny client component in `project-scope.tsx`) and in
`src/components/pages/PageScreen.tsx` (`usePaletteProjectScope(view.page.projectId ? { id: view.page.projectId, name: view.page.projectName!, archived:
view.page.projectArchived } : null)`). Tests: `project-scope.test.tsx` — nested scopes, unmount restores the outer one; `PageScreen.test.tsx` (extend M4's) —
a PROJECT page registers its project, a wiki page registers `null`. Done-check: `pnpm vitest run --project ui src/components/palette src/components/pages/PageScreen.test.tsx`.

**S2.6 `N` fallback + `?` entries (KEY-05/06, M10-D25).**
```ts
// src/hooks/useFallbackHotkey.ts
export function useFallbackHotkey(hotkey: Hotkey, handler: () => void, opts: { enabled?: boolean } = {}): void
// window 'keydown' (bubble, registered in useEffect): return if e.defaultPrevented || e.repeat || isEditableTarget(e.target) || !matchesHotkey(e, hotkey);
// then setTimeout(() => { if (!e.defaultPrevented) handler() }, 0) — runs after every listener of this dispatch (M3 tasks tab, M6 grid keymap call preventDefault).
```
`src/components/shell/AppShell.tsx`: `useFallbackHotkey(HOTKEYS.newTask, () => palette.open({ start: 'task.create' }))` (`PaletteProvider.open` gains an optional
`start` command id that runs `beginCreateTask()` once the dialog is open). `ShortcutHelp` (M3) needs no change (data-driven); extend its test to expect the
`palette` scope rows from S0.11.
Tests first (`src/hooks/useFallbackHotkey.test.tsx`, fake timers): a harness that also mounts a later `useHotkeys([{ hotkey: HOTKEYS.newTask, handler: local }])` →
`keyDown(body, { code: 'KeyN', key: 'n' })` → `local` called, fallback **not** called after `vi.runAllTimers()`; without the local binding → fallback called once after
timers; target `<input>` → none; `{ code: 'KeyN', ctrlKey: true }` → none; Thai layout `{ code: 'KeyN', key: 'ื' }` → fallback called.
Done-check: `pnpm vitest run --project ui src/hooks/useFallbackHotkey.test.tsx src/components/shell`.

**S2.7 G1.** `pnpm vitest run --project ui src/components/{home,palette,shell} src/components/pages/PageScreen.test.tsx src/hooks` · `pnpm vitest run --project unit
src/components/palette src/components/home` · `pnpm eslint src/app/(app)/home src/components/{home,palette,shell} src/hooks` · `pnpm typecheck` (own paths clean).
Report `requests` (expected: `th` keys added inside `home`/`palette` only; `HOTKEYS.newTask` if S0 did not add it).

### 5.S3 — Live blocks in the editor (editor-engineer · `src/components/editor/**`, `src/lib/editor/**`, `src/components/tasks/{TaskList.tsx,TaskList.test.tsx,embed/**}`)

BlockNote 0.55 facts (r3 §4): `createReactBlockSpec(config, impl)` returns a factory; `content: 'none'` blocks have no inline content; the render runs
inside the editor's React tree (TanStack Query, `UndoProvider`, `useLeaveDialog` contexts are available); a headless editor works in jsdom. Strings from
`th.editor.liveBlocks`; no `localStorage`; MUI inside the block is fine (it is a normal React subtree, not a per-cell grid).

**S3.1 Spike: event isolation in a `content: 'none'` React block (worktree, throwaway — PLAN §2.3 rule 9; M10-D8).** In an isolated worktree, extend
`plan/research/snippets/r3/harness` with a block that renders an `<input>`, a `tabIndex=0` div handling ArrowDown/Space/Backspace, a dnd-kit draggable card
between two droppables, and a `Checkbox`. Check in Chromium (Playwright, the harness's own config): (a) typing and Backspace in the input never change the
document; (b) Backspace/Delete/Enter on the focused div never delete or split the block; (c) the dnd-kit drag completes and BlockNote's side-menu drag does not
start; (d) a click inside does not move the editor selection into a NodeSelection that steals focus; (e) Cmd+K inside the block reaches the window listener;
(f) Cmd+Z inside the block does not undo editor text. Run once with no isolation and once with the native listener set of M10-D8. Record the result table and
the final listener list in the S3 report (and as an M10 Decision note if the list changes). Nothing from the worktree is merged.

**S3.2 `TaskList` embed option (M10-D9; M3 component, additive).** `src/components/tasks/TaskList.tsx`:
```ts
export interface TaskListEmbedOptions {                 // exported from TaskList.tsx (M10-D9)
  filter(t: TaskDTO): boolean          // assignee / milestone / status / showDone from the block props
  limit: number                        // max matching rows (ancestors shown as context rows do not count)
  onOpenTask(taskId: string): void     // replaces ?task= + TaskPanel
  onCount?(shown: number, total: number): void   // lets EmbeddedTasks render "ดูทั้งหมด (n)"
}
// M3's `TaskListProps { projectId }` (m03 S3.4, which leaves room for it) gains exactly one optional prop: `embed?: TaskListEmbedOptions`
```
With `embed`: rows = `visibleRows(buildTaskRows(data.tasks), { collapsed, showCompleted: true })` (the block's `showDone` lives in `filter`) then keep matching
rows plus their ancestors (rendered with `aria-disabled` context style), cut after `limit` matches, call `onCount(shown, total)`; the
`tasks.groupBy`/`tasks.sort`/`tasks.showCompleted` preferences are ignored (grouping `none`, sort `manual`), tree ops off (`ops = false` → no Tab/Shift+Tab/drag;
the M3 info toast still explains it), no `N` registration (the `useHotkeys` call gets `enabled: !embed && canEdit`), no archived banner (EmbeddedTasks shows
`readOnlyArchived`), Space and the open button → `embed.onOpenTask(id)`; the checkbox, `StatusChip` + `S` menu, inline rename, Enter-quick-add below the row
(M3-D18) and Delete keep M3 behaviour through `useTaskMutations(projectId)` (same undo entries, BR-52 toast via M6). Without `embed` the component is
byte-for-byte M3 behaviour (existing tests unchanged; M8's `TaskList.milestone.test.tsx` too).
Tests first — extend `src/components/tasks/TaskList.test.tsx` (QueryClient seeded with a `ProjectTasksResponse` as in M3): `embed.filter = assignee Ivy` on the
POS-like data → only Ivy's leaves + their parents as context rows; `limit 1` with two matches → one row and `onCount(1, 2)`; `N` keydown on `document.body`
→ quick add **not** focused when `embed` is set (and still focused without it); Space on a row → `onOpenTask(id)`, URL unchanged; Tab on a row → no
`indentTask` call; the checkbox still calls `completeTask`. Done-check: `pnpm vitest run --project ui src/components/tasks/TaskList.test.tsx`.

**S3.3 `EmbeddedTasks` (FR-1301/1302/1306, M10-D2/D6/D7/D10; `src/components/tasks/embed/`).**
```ts
// useEmbedTasks.ts
export function useEmbedTasks(pageId: string) {
  const qc = useQueryClient()
  return useQuery({ queryKey: qk.pageEmbedTasks(pageId), staleTime: 0, refetchOnWindowFocus: 'always', refetchOnMount: 'always',
    queryFn: async ({ signal }) => {
      const r = await getJson<EmbedTasksResponse>(`/api/pages/${pageId}/embed/tasks`, { signal })
      if (r.kind === 'project') qc.setQueryData(qk.projectTasks(r.projectId), r.data)      // M3 cache → mutations/optimism unchanged
      return r.kind === 'project' ? { kind: r.kind, projectId: r.projectId, projectName: r.projectName, tasksHref: r.tasksHref } : r
    } })
}
// EmbeddedTasks.tsx
export function EmbeddedTasks(p: { projectId: string; projectName: string; tasksHref: string; props: TaskViewProps
  editable: boolean; onPropsChange(next: Partial<TaskViewProps>): void }): JSX.Element
```
- Data: `const { data } = useProjectTasks(p.projectId)` (M3; already seeded). `filter` = `assigneeId` (when set: `t.assignees.some(a => a.userId === id)`) ∧
  `milestoneId` (when it is in `data.milestones`, M8: `t.milestoneId === id`) ∧ `statusIds` (the ids that exist in `data.statuses`; none left → no status filter) ∧
  (`showDone` or not DONE category).
- `view === 'LIST'` → `<TaskList projectId embed={{ filter, limit, onOpenTask }} />` with `onOpenTask = (id) => router.push(\`${tasksHref}?task=${id}\`)`.
- `view === 'BOARD'` → M3 `buildStatusColumns(buildTaskRows(data.tasks), data.statuses, { leafOnly: false, hideDone: !showDone, assigneeId: assigneeId || null,
  milestone: validMilestoneId || 'ALL' })` (M8 S4.7 option; `validMilestoneId` = `milestoneId` only when it is in `data.milestones`), then drop status columns
  not in `statusIds` (when that filter is on); each column keeps its first `limit` cards. Render M3's `TaskBoard` exactly as the project board in `TasksView`
  does (m03 S3.16 + m08 S4.7) — copy that call, do not invent props (C45):
  `<TaskBoard columns={cols} canEdit={data.viewer.canEdit} renderCard={(row) => <TaskCard card={toCardModel(row, data.statuses, projectCertainty)} statuses={data.statuses}
  canEdit={data.viewer.canEdit} onOpen={openTask} onPickStatus={(id, s) => mutations.setStatus([id], s)} onToggleDone={toggleDone} milestone={milestoneOf(row)} />}
  onMove={(id, key) => { const s = cols.find((c) => c.key === key)?.statusId; if (s) mutations.setStatus([id], s) }}
  footer={(col) => data.viewer.canEdit && col.statusId ? <QuickAdd … onCreate={(name) => mutations.create({ parentId: null, name, statusId: col.statusId })} /> : null} />` — `useTaskMutations(projectId)` from M3 (setTaskStatus/revertTaskStatus
  undo, FR-608 prompt, BR-52 toast; `create` with `statusId` per m03 S3.16/FR-664); `milestoneOf(row)` = `{ name, late: row.lateForMilestone }` from
  `data.milestones` or `null` (M8's `TaskCard` prop `milestone?: { name; late } | null`, C78). `cols` are M3's `BoardColumn<TaskRowModel>`; each card is mapped with M3's `toCardModel(row, statuses, certainty)` (m03 S1.4) and
  every prop name/type above is the one pinned in m03 S3.16 (`TaskBoardProps<C>`, `TaskCardProps`) — never change `TaskBoard`/`TaskCard`. Card open: the card's
  `onOpen(taskId)` (Enter/Space/click) is `openTask = (id) => router.push(tasksHref + '?task=' + id)` (a different route, so M3's `?task=` handling on the tasks
  tab opens the panel there).
- Footer: when anything was cut off → `Link` `th.editor.liveBlocks.seeAll(total)` → `tasksHref`; always a small `th.editor.liveBlocks.openTasksTab` link.
- Header toolbar (only when `editable`): `ToggleButtonGroup` ลิสต์/บอร์ด (`th.editor.liveBlocks.view.*`), a `Menu` "ตัวกรอง" with assignee `Select` (project members
  via `qk.peopleOptions()` names; option `anyone`), milestone `Select` (`data.milestones`; option `anyMilestone`; hidden when the list is empty), status multi-select
  (`data.statuses`, `StatusChip` labels), `Switch` `showDone`, limit `Select` (`TASK_VIEW_LIMITS`, `limitOption(n)`); every change → `onPropsChange`.
- Archived (`!data.viewer.canEdit`) → `Alert` `th.editor.liveBlocks.readOnlyArchived` above the view; no drag handles, no quick add (M3 components honour
  `canEdit`). Empty after filters → `th.editor.liveBlocks.empty`.
- Tests first (`src/components/tasks/embed/EmbeddedTasks.test.tsx`, fetch + actions mocked): the embed response seeds `qk.projectTasks(P)` (assert via
  `qc.getQueryData`); BOARD renders columns in status order; `statusIds` with an unknown id + one real id → one column; all-unknown → all columns (filter off);
  `limit 1` on the board → one card per column and the "ดูทั้งหมด (n)" link with the total; a simulated `onMove` calls `setTaskStatus({ taskIds: [id], statusId })`
  (through M3's mutation); a valid `milestoneId` passes `milestone: <id>` to `buildStatusColumns` (spy) and an unknown one passes `'ALL'`; LIST view renders
  `TaskList` with an `embed` prop (spy) and no `TaskPanel`; `editable: false` → no toolbar; archived viewer → the read-only alert and no quick add; window `focus`/`visibilitychange` →
  the embed URL fetched again (`refetchOnWindowFocus: 'always'`, M10-D10); after `invalidateTasks(qc, P)` both `qk.projectTasks(P)` and
  `qk.pageEmbedTasks(pageId)` refetch.
- Done-check: `pnpm vitest run --project ui src/components/tasks/embed`.

**S3.4 `taskView` block (FR-1301/1304, M10-D3/D5/D7/D8/D31; `src/components/editor/blocks/task-view/`).** Replace the S0 stub render:
```tsx
// spec.tsx (config unchanged from S0.10)
render: ({ block, editor }) => <LiveBlockFrame title={th.editor.liveBlocks.taskViewTitle}><TaskViewBlock pageId={usePageId()}
  props={resolveTaskViewProps(block.props)} editable={editor.isEditable}
  onPropsChange={(next) => editor.updateBlock(block.id, { props: { ...block.props, ...next } })} /></LiveBlockFrame>,
toExternalHTML: () => <p>{th.editor.liveBlocks.taskViewTitle}</p>,            // copy to other apps: title only, never task data
```
- `usePageId()` = the `pageId` from a `PageEditorContext` provided by M4's `PageEditor` (add the provider in `PageEditor.tsx`, S3 owns it); the block never stores it.
- `LiveBlockFrame.tsx` (shared by both blocks): `<section contentEditable={false} data-live-block aria-label={th.editor.liveBlocks.regionLabel(title, projectName)}>`
  + header + body; a `useEffect` attaches the native listener set from S3.1/M10-D8 (`stopPropagation` except `Mod+K`; `Mod+Z`/`Mod+Shift+Z` outside inputs →
  `undo()`/`redo()` from `useUndo()` + `preventDefault`).
- `TaskViewBlock.tsx`: `useEmbedTasks(pageId)` → loading `Skeleton` + `th.editor.liveBlocks.loading`; error → text `error` + button `retry`; `kind 'wiki'` →
  `EmptyState` `th.editor.liveBlocks.wikiOnly`; else `<EmbeddedTasks …/>`.
- Tests first (`TaskViewBlock.test.tsx`, ui; headless editor with the schema + mocked fetch): a document `[taskView {view:'LIST'}]` on a PROJECT page renders the
  list from the stubbed response; on a wiki page (`{ kind: 'wiki' }`) renders `th.editor.liveBlocks.wikiOnly` and no list; changing the view toggle updates
  `editor.document[0].props.view` to `'BOARD'` and nothing else in the document (no task data in content — `JSON.stringify(editor.document)` contains no task
  name); `editor.isEditable = false` → no toolbar but the data still renders (M10-D31); a `keydown` Backspace dispatched on a focused row inside the block leaves
  `editor.document.length` unchanged.
- Done-check: `pnpm vitest run --project ui src/components/editor/blocks/task-view`.

**S3.5 `projectWorkload` block (FR-1303, AC-1303, M10-D11; `src/components/editor/blocks/project-workload/`).**
- `useEmbedWorkload(pageId)` = `useQuery({ queryKey: qk.pageEmbedWorkload(pageId), queryFn: … GET /api/pages/${pageId}/embed/workload, staleTime: 0,
  refetchOnWindowFocus: 'always', refetchOnMount: 'always' })` — no view in the request (M9-D2).
- `ProjectWorkloadBlock.tsx`: wiki → `wikiOnly`; else a compact table (`<table>` with `<th scope="col">` = `formatWeekHeader(week)` for the 8 weeks, row header =
  `UserName` (+ `th.editor.liveBlocks.workload.person` column label, deactivated text from M1)) whose cells are M9's `WorkloadCell` component with
  `{ name, week, cell, view: props.view, projects: data.projects, deactivated }` (text `workloadCellText`, colour `viewTone` of the block's view, BR-40 glyph,
  `tooltipLines` breakdown where the masked part reads `th.masking.otherProjects`). Header: view toggle (`th.editor.liveBlocks.workload.view.*`, editable only →
  `editor.updateBlock(block.id, { props: { view } })`; read-only viewers can still switch the **local** view state without saving), caption `range`, link
  `openWorkload` → `workloadHref`. `data.archived` → `Alert severity="info"` `th.editor.liveBlocks.workloadArchived` above the table (M10-D11). No people →
  `noMembers`. The table scrolls horizontally inside the block on narrow screens.
- Tests first (`ProjectWorkloadBlock.test.tsx`): a stubbed response with Mint's cell `{ total: 250, committed: 250, capacity: 500, standard: 500, level: 'OK',
  excess: 0, cause: null, byProject: [{ projectId: null, total: 250, committed: 250 }] }` renders `'2.5/5'` and its tooltip shows `th.masking.otherProjects`; the
  rendered text contains no project name except those in `projects`; switching the view toggle to `COMMITTED` recolours **without** a new fetch and writes
  `props.view`; F4-like Cindy cell (`250/0/200`, RISK) in view ALL → `data-tone="over"` + ⚠; `archived: true` → the `workloadArchived` alert and the table still
renders; wiki → `wikiOnly`; every cell has M9's accessible label.
- Done-check: `pnpm vitest run --project ui src/components/editor/blocks/project-workload`.

**S3.6 Slash items (FR-520, FR-1301/1303, M10-D5).** `src/components/editor/slash-menu.tsx` (M4): `getSlashMenuItems(editor, ctx)` gains
`ctx.space: 'WORKSPACE' | 'PROJECT'`; when `PROJECT` and `ctx.canEdit`, append after the `หน้า` item:
```ts
{ title: s.taskView.title, subtext: s.taskView.subtext, aliases: [...s.taskView.aliases], group: s.taskView.group, icon: <ViewKanbanOutlined fontSize="small" />,
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'taskView', props: { view: 'BOARD' } }) },
{ title: s.projectWorkload.title, subtext: s.projectWorkload.subtext, aliases: [...s.projectWorkload.aliases], group: s.projectWorkload.group,
  icon: <GroupsOutlined fontSize="small" />, onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'projectWorkload' }) },
```
(`s = th.editor.slash`; `insertOrUpdateBlockForSlashMenu` from `@blocknote/core`, as M4's table item; ranking unchanged — `rankSuggestionItems`.)
Tests first — extend `src/components/editor/slash-menu.test.ts`: on a PROJECT page `rank(items, 'มุมมองงาน')[0].title === 'มุมมองงาน'`, `rank(items, 'board')[0]` and
`rank(items, 'tasks')[0]` → `มุมมองงาน`; `rank(items, 'ภาระ')[0]` and `rank(items, 'workload')[0]` → `ภาระทีม`; `rank(items, 'หน้า')[0].title === 'หน้า'` still (M4);
on a WORKSPACE page neither item exists; clicking `มุมมองงาน` inserts a block with `type 'taskView'` and `props.view 'BOARD'`; clicking `ภาระทีม` inserts
`projectWorkload` with `props.view 'ALL'` (default).

**S3.7 Schema parity, headless templates, content text.** `schema.test.ts` (M4) passes with the two specs (parity with `BLOCK_TYPES`); extend
`templates.headless.test.ts`: the new charter loads in a headless editor, the two live blocks get ids, `pageContentSchema.safeParse(JSON round-trip)` succeeds
(the serialised blocks carry every default prop — they must satisfy `taskViewProps.strict()`), `extractContentText(editor.document) ===
extractContentText(charterTemplate().content)`. If S0.9's content-text test failed, fix `src/lib/editor/content-text.ts` here test-first (blocks without
inline content contribute nothing).

**S3.8 G1.** `pnpm vitest run --project ui src/components/editor src/components/tasks/TaskList.test.tsx src/components/tasks/embed` · `pnpm vitest run --project unit
src/lib/editor` · `pnpm eslint src/components/editor src/lib/editor src/components/tasks` · `pnpm typecheck` (own paths clean) · `grep -rn "@blocknote/xl-" src` → nothing.
Report the S3.1 result table and any `requests` (expected: none; `th.editor.liveBlocks` keys added only inside that namespace).

### 5.S4 — Authz rows, masking, e2e (test-engineer · `tests/authz/**`, `e2e/**`)

**S4.1 Authz rows (test-first, from SPEC §3.2/§3.3 + X41; full table §7.2).** Route rows call the handlers as M4 does
(`GET(new Request('http://t/api/…'), { params: Promise.resolve({ id }) })`) under `asUser(role)` with `createWorld({ with: ['home'] })`.
- `tests/authz/rows/home.ts`: `HM-HOME` (allow ×4) with an extra assertion per role: `body.manager !== null` only for `M`.
- `tests/authz/rows/search.ts` (M4 file; M10 rows appended, C2): `SR-ALL` `GET /api/search?q=ลับ` (allow ×4), `SR-INDEX` `GET /api/search/index` (allow ×4),
  `SR-LONG` `q` of 101 characters (`400` ×4); M4's `SR-PAGES`, `SR-TITLE-ONLY`, `SR-EMPTY` unchanged (now asserting the five keys exist).
- `tests/authz/rows/pages.ts` (M4 file; GAPI-08 per `plan/traceability.md`): `EMB-T-P`, `EMB-T-Q`, `EMB-T-A`, `EMB-T-WIKI`, `EMB-T-PROT`, `EMB-T-DEL`, `EMB-T-BAD`,
  and the same seven `EMB-W-*` for the workload route.
- A generic block in `matrix.int.test.ts` (M2 pattern) already runs every row with `asNobody()` → `'401'`; M10 rows join it. None of the rows `mutates`.
- Done-check: `pnpm vitest run --project integration tests/authz/matrix.int.test.ts` (red only where S1 stubs still throw — list them).

**S4.2 Masking leak cases (`tests/authz/masking.int.test.ts › describe('home, search, embeds (M10)')`, PLAN §4.4, MASK-1…7, TST-2).** World
`with: ['home']`. `forbiddenP` = `w.P.name`, `w.P.id`, `w.C1.name` (when C1 is only P's client), `'งานแม่ P-ลับ01'`, `'งานร่วม P-ลับ03'`, `'สถานะลับ P-03'`,
`'Charter P-ลับ04'`, `'หน้า P-ลับ05'`, `'Milestone P-ลับ06'`, `'ส่งมอบรอบแรก P'`, `'Milestone P-ลับ13'`, `'งานกำหนดส่ง P-ลับ17'`, `'หน้าฝังบล็อก P-ลับ19'`, the ids of
`pParent`, `pLeaf`, `pCoworker`, `pEmbed`; `forbiddenQ` = `w.Q.name`, `w.Q.id`, `'งาน Q-ลับ02'`, `'สถานะลับ Q-04'`, `'Milestone Q-ลับ05'`, `'Milestone Q-ลับ15'`,
`'หน้าล่าสุด Q-ลับ18'`, ids of `qTask`, `qEmbed`, `w.assignments.qTaskCoworker`; `forbiddenLeave` = `'โน้ตลับ-โลก-03'`, `'โน้ตลับ-โลก-04'`, `'ลาพักร้อน-โลก'`,
`'ลาป่วย-โลก'`, the two leave ids, the leave-type ids. `assertNoLeak(body, list)` from M2.

| # | Viewer | Request | Must be absent | Must be present |
|---|---|---|---|---|
| K1 | outsider | `GET /api/search?q=ลับ` (all categories, content path) | `forbiddenP` | Q task `'งาน Q-ลับ02'` in `tasks`; Q page hit |
| K2 | member | `GET /api/search?q=ลับ` · `?q=Q-` | `forbiddenQ` | P hits incl. archived A task (`projectArchived: true`) |
| K3 | outsider | `GET /api/search/index` | `forbiddenP`, ids of `lead`, `member`, `pOnly` | exactly projects `[Q]`, people `{ outsider, coworker }`, clients `[C2]` |
| K4 | outsider | `GET /api/home` | `forbiddenP`, `forbiddenLeave`, the key path `manager` holds `null` | coworker's leave today as `{ kind: 'masked', label: th.masking.leave }`; `qSoon`; `'หน้าล่าสุด Q-ลับ18'` |
| K5 | member | `GET /api/home` | `forbiddenQ`, `forbiddenLeave` | `pLate` with `late: true`; pOnly next week masked |
| K6 | member | `GET /api/pages/{pEmbed}/embed/workload` | `forbiddenQ` | coworker `2026-10-05` total 400 with a masked entry `projectId: null` (300) |
| K7 | outsider | `GET /api/pages/{pEmbed}/embed/tasks` · `/embed/workload` | `forbiddenP` (body = error only) | status 404 |
| K8 | outsider | `GET /api/pages/{qEmbed}/embed/workload` | `forbiddenP` | coworker's P load (100) masked |
| K9 | member | `GET /api/pages/{wikiEmbed}/embed/tasks` · `/embed/workload` | every project/task name and id | body deep-equals `{ kind: 'wiki' }` |
| K10 | manager | `GET /api/home` | — | `manager.overloaded` and `manager.utilisation` present; leave entries `kind 'full'` with type names |

Golden variant (`seedGolden` + `applyFixture('F3')` + `addMilestones`): Ivy → `GET /api/search?q=a` people never contain Peter/Jack/Manager ids; Ivy → POS
charter `embed/workload` without `'Mobile App Revamp'` / `'พัฒนา front-end'` (AC-1303); Cindy → `GET /api/home` without `'Pipeline พร้อมใช้งาน'`, `'Design freeze'`,
`'Beta release'`, `'Dashboard v1 review'` (M8-D23) and with Peter's leave masked; Jack → `GET /api/search?q=ลูกค้า` without `'ย้ายข้อมูลลูกค้า'`.
Done-check: `pnpm vitest run --project integration tests/authz/masking.int.test.ts`.

**S4.3 E2E fixtures and page objects.**
- `e2e/fixtures.ts`: reuse M1's `resetDb(fixture?: FixtureId, opts: ResetDbOptions = {})` with `{ milestones: true }` (M8) — M10 adds `ResetDbOptions.livePages?: boolean` that inserts, with M4's `e2e/support/seed-pages.ts`
  `insertPage`, a Data Warehouse page "หน้า DW ทดสอบ" (byNickname Peter) and a wiki page "หน้า wiki ทดสอบ" (byNickname Manager), both with empty content.
  Golden charters already contain the template blocks (M10-D12) because `seedGolden` runs after M10.
- `e2e/pages/home.ts` — `class HomePage`: `goto()`; `greeting()` = `getByRole('heading', { level: 1 })`; `card(title)` = `getByRole('region'|'article')` resolved via
  the `CardHeader` heading `getByRole('heading', { name: title })` and its closest card; `taskRow(name)`, `tick(name)` (checkbox
  `th.home.myTasks.complete(name)`), `loadBars()` = `getByRole('img', { name: /สัปดาห์/ })` inside the load card; `leaveLine(label)` (`dt` text → sibling `dd`);
  `managerCards()`.
- `e2e/pages/palette.ts` (M4 file, extended by M8; C60/C62): **reuse, do not redefine** M4's `openByKeyboard()`, `openByButton()`, `dialog()`, `input()`,
  `group(heading)` (incl. its `[cmdk-group]` + `[cmdk-group-heading]` fallback — the cmdk group accessible name is still unverified, so every M10 group
  lookup goes through `group()`), `option(name)`, `pageResults()` and M8's `commands()` / `runCommand(label)`. M10 adds only: `typeQuery(q)` (`input().fill(q)`);
  `results(category)` = `group(th.palette.groups[category]).getByRole('option')`; `back()` (`Backspace` on the empty input); `measureFirstResult(q): Promise<number>`
  — `page.evaluate` that installs a `MutationObserver` on the dialog's listbox, records `performance.now()` before dispatching the input, resolves on the first
  `[role=option]` whose `data-value` does not start with `cmd:`. Selection always by option name (M4-D37d); no option counts across the whole dialog.
- `e2e/pages/live-blocks.ts` — `class LiveBlocks`: `taskViews()` = `locator('[data-live-block]').filter({ has: getByText(th.editor.liveBlocks.taskViewTitle) })`;
  `workloads()`; `column(block, statusName)` (`getByRole('group', { name: th.tasks.board.column(name, n) })` with a regex on the name); `card(block, name)`;
  `dragCard(block, name, toStatus)` (handle `th.tasks.board.cardDragHandle(name)`, `mouse.down/move(steps: 8)/up`, M3 pattern); `wikiPlaceholder(block)`;
  `cell(block, person, weekHeader)`.
- Done-check: `pnpm exec playwright test --list` discovers the spec.

**S4.4 `e2e/m10-home-search.spec.ts`** — scenarios exactly as §7.3; one `describe` per group with `test.describe.configure({ mode: 'serial' })` and
`test.beforeAll(async () => { await resetDb('F3', { milestones: true }) })` (M1's `resetDb(fixture?, opts: ResetDbOptions = {})`; options always in the 2nd slot) where §7.3 marks ⟲; `loginAs(page, …)` per test; the M0 fixture pins the clock (`setFixedTime(2026-09-30T10:00:00+07:00)`);
B4 uses a second page in the same context. Strings from `th`, numbers via `formatCd`, dates via `formatThaiDate`/`formatWeekHeader`/`formatHomeDate`. Allowed
console errors: none (no deliberate 4xx in M10 scenarios). The CSP and external-request guards stay on.

**S4.5 Update older specs (shared UI changed in M10).**
- `e2e/m0-smoke.spec.ts` / `e2e/m1-auth.spec.ts`: `/home` no longer shows `th.home.placeholderTitle`; assertions on the home page go through `HomePage`:
  `<h1>` matches `th.home.greetingFor.morning(<display name>)` at the pinned 10:00, and the date line `formatHomeDate('2026-09-30')`.
- `e2e/m4-pages.spec.ts` E16 (palette) — **check only, no edit expected** (C60): M4's E16 types "ลาพัก", "Charter" and "ประชุมประจำ", already selects
  by option name inside `pageResults()`, scopes its counts to the pages group and asserts nothing about other groups (M4-D37d). With M10 none of those three
  queries matches a quick-command label/keyword or a golden project/person/client/task name visible to Ivy, and the empty-palette `th.palette.hint` assertion uses
  the key (M10 only changes its text). Run it against the M10 build; if it fails, fix the M10 side (or report), never weaken E16. E1's charter checks already use
  containment (M4-D37c) and E5 counts `subpage-card`s only — verify both pass with the new "งานและภาระของทีม" section and its two live blocks.
- `e2e/m8-milestones.spec.ts`: the "สร้าง milestone" command still opens the dialog (M8 selects it by name via `runCommand`, asserts no group absence or
  option count — C59) — check only.
- `e2e/m3-tasks.spec.ts`: E1 `N` on the tasks tab still focuses quick add (M10-D25 regression); the `?` dialog assertion uses `toContain`.
- Done-check: `pnpm exec playwright test --list` lists every older spec; `pnpm eslint e2e tests/authz`.

---

## 6. Integration (orchestrator)

**Wiring order.**
1. Kickoff: M9 ✅, tree clean, `pnpm db:up`. Copy §3 (X-rows + M10-D1…D35) into `PROGRESS.md › Decisions` (M10 has no SPEC deviation: M10-D2
   follows SPEC §7.8 as reworded 2026-10-30), the §5 step list into "แผนของ milestone ปัจจุบัน", set M10 🟨.
2. S0 alone → **G0** (`pnpm check`; `pnpm db:generate` → "No schema changes"; M4 parity/template tests green with the stub specs).
3. One message, background agents **S1 (backend), S3 (editor), S4 (test)**, and **S2 (frontend)** in the same message if four agents are allowed, otherwise as
   soon as the first reports (S2 only needs S0's contracts and the route stubs).
4. Apply `requests` (table below) once all four report G1.
5. Integrator: `pnpm db:up && pnpm db:migrate && pnpm check` → `pnpm build` → `pnpm test:e2e` (**full** suite, M0–M10) → **G2**.

**Expected cross-stream requests.**

| From | To | Request |
|---|---|---|
| S2 | S0/th.ts | extra `home`/`palette` keys found while building cards (inside S2's namespaces — S2 may add them itself with Edit) |
| S3 | S2 | none expected; if `PaletteCommandCtx` needs `currentProjectId` from inside a page editor, S2's `usePaletteProjectScope` already covers `/p/[pageId]` |
| S1 | orchestrator | none expected (embed members come from M2's `repo.members.listMembers` — read-only reuse, no edit to M2's file; `repo/home.ts` holds only `listRecentPages`; any M9 signature drift is adapted inside `services/embed.ts`/`home.ts`) |
| S3 | M3 owner (orchestrator) | none expected: `TaskBoardProps<C>`/`TaskCardProps`/`TaskListProps` are pinned in m03 S3.16/S3.4; only the additive `TaskList` `embed?` prop (M10-D9) touches an M3 file (S3 owns `TaskList.tsx`) |
| S4 | S2/S3 | missing `aria-label`s / headings used by page objects (`CardHeader component="h2"`, `data-live-block`) |

**Commands (G2).**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                          # → "No schema changes" (M10-D29)
pnpm check                                # typecheck + lint + unit + ui + integration (incl. tests/authz, masking, golden)
pnpm build && pnpm test:e2e               # full suite m0 … m10 (integrator only; one next build per checkout)
git diff --exit-code CLAUDE.md SPEC.md PROGRESS.md docs/   # agentRules guard (M0)
grep -rn "@blocknote/xl-\|localStorage" src | grep -v "\.test\." # → nothing new
```

---

## 7. Verification

### 7.1 AC → test map

| AC / requirement | Test(s) |
|---|---|
| AC-1301 (`/มุมมองงาน` in the POS charter → board → drag to "กำลังทำ" → tasks tab shows it) | e2e **B1** · `slash-menu.test.ts › มุมมองงาน` · `EmbeddedTasks.test.tsx › onMove` |
| AC-1302 (copy POS block → DW page shows DW tasks; paste into wiki → placeholder) | e2e **B2** · `embed.int.test.ts › tasks binding` · rows `EMB-T-WIKI` |
| AC-1303 (worker sees "งานในโปรเจคอื่น"; response has no such project name) | masking **K6/K8** + golden Ivy variant · `embed.int.test.ts › workload` · e2e **B3** |
| FR-1101a–f (§12 M10 "§4.11 ทั้งหมด") | `home.int.test.ts` (golden numbers r8 §4.10/§4.6) · `HomeDashboard.test.tsx` and card tests · e2e **H1–H4** |
| FR-1102/1104/1105 (Cmd+K all categories, §3, Thai substring) | `search.int.test.ts` · rows `SR-*` · masking K1–K3 · e2e **P1, P2** |
| FR-1103 quick commands | `commands.test.ts` · `CommandPalette.test.tsx` · e2e **P4** |
| FR-1302 props only | `page-content.test.ts › live blocks` · `TaskViewBlock.test.tsx › no task data in content` |
| FR-1304 binding / wiki | `embed.int.test.ts` · e2e **B2** |
| FR-1305 charter section | `templates.test.ts` · `templates.headless.test.ts` |
| FR-1306 freshness | `EmbeddedTasks.test.tsx › refetch` · `invalidate.test.ts` · e2e **B4** |
| FR-1307 `content_text` | `content-text.test.ts › live blocks` · e2e **B5** |
| NFR-06 palette < 200 ms | e2e **P3** (`measureFirstResult`) · `search.int.test.ts › timing` |
| KEY-01 / KEY-05 / KEY-06 | e2e **P5, P6, P7** · `useFallbackHotkey.test.tsx` · `shortcuts.test.ts` |
| NFR-07b home on mobile | e2e **H4** |
| §12 M10 "Tests: masking ของ embed workload" | masking K6–K9 + golden AC-1303 variant |

### 7.2 Authorization matrix rows added

Outcomes per X41 (no M10 route returns 403; invisible → 404). `M` manager · `L` lead (LEAD of P) · `Me` member (MEMBER of P) · `W` outsider (MEMBER of Q only).
"mutates" is "no" for every row (M10 adds no action; X44).

| Row | PERM | Route | M | L | Me | W | Extra assertion |
|---|---|---|---|---|---|---|---|
| HM-HOME | 22 (home part) | `GET /api/home` | allow | allow | allow | allow | `manager !== null` only for M (FR-1101f) |
| SR-ALL | 04/06/16/17/22 | `GET /api/search?q=ลับ` | allow | allow | allow | allow | five keys present; content per K1/K2 |
| SR-INDEX | 04/06/22 | `GET /api/search/index` | allow | allow | allow | allow | sets per K3 |
| SR-LONG | — | `GET /api/search?q=<101 chars>` | 400 | 400 | 400 | 400 | — |
| SR-PAGES / SR-TITLE-ONLY / SR-EMPTY (M4) | 06/17 | unchanged | allow / allow / 400 | … | … | … | `titleOnly` → only `pages` filled |
| EMB-T-P | 16/06 | `GET /api/pages/{pEmbed}/embed/tasks` | allow | allow | allow | 404 | `kind 'project'`, `data.project.id = P` |
| EMB-T-Q | 16/06 | `…/{qEmbed}/embed/tasks` | allow | 404 | 404 | allow | — |
| EMB-T-A | 16, X42 | `…/{aEmbed}/embed/tasks` (archived) | allow | allow | allow | 404 | `data.viewer.canEdit === false` |
| EMB-T-WIKI | 17 | `…/{wikiEmbed}/embed/tasks` | allow | allow | allow | allow | body `{ kind: 'wiki' }` |
| EMB-T-PROT | 17/19 | `…/{wikiProtected}/embed/tasks` | allow | allow | allow | allow | `{ kind: 'wiki' }` (protection limits editing only) |
| EMB-T-DEL | 16 | `…/<deleted P page id>/embed/tasks` | 404 | 404 | 404 | 404 | — |
| EMB-T-BAD | — | `…/x/embed/tasks` | 404 | 404 | 404 | 404 | — |
| EMB-W-P | 16/22 | `GET /api/pages/{pEmbed}/embed/workload` | allow | allow | allow | 404 | 8 weeks; masked entries per K6 |
| EMB-W-Q | 16/22 | `…/{qEmbed}/embed/workload` | allow | 404 | 404 | allow | K8 |
| EMB-W-A | 16/22, X42 | `…/{aEmbed}/embed/workload` | allow | allow | allow | 404 | `archived: true`; no part/key with `w.A.id` (BR-44, C49) |
| EMB-W-WIKI | 17 | `…/{wikiEmbed}/embed/workload` | allow | allow | allow | allow | `{ kind: 'wiki' }` |
| EMB-W-PROT | 17 | `…/{wikiProtected}/embed/workload` | allow | allow | allow | allow | `{ kind: 'wiki' }` |
| EMB-W-DEL | 16 | deleted page | 404 | 404 | 404 | 404 | — |
| EMB-W-BAD | — | `…/x/embed/workload` | 404 | 404 | 404 | 404 | — |
| (all M10 rows) | — | `asNobody()` | 401 | 401 | 401 | 401 | generic block |

Writes reached from M10 UI (home tick, block drag/tick/quick add, palette create task/page, leave) are covered by the existing M3 (`T-*`, PERM-11), M4
(`PG-CREATE`, `WK-CREATE`, PERM-16/18) and M5 (PERM-20) rows — no new action, so no new mutating row.

### 7.3 E2E scenario outline (`e2e/m10-home-search.spec.ts`)

Clock pinned to 2026-09-30 10:00 (Bangkok, Wed); ⟲ = `resetDb` in `beforeAll` of that describe. Data: golden F3 + `{ milestones: true }` unless noted.

| # | Requirement | Steps | Assertions |
|---|---|---|---|
| H1 ⟲ | FR-1101a–e, UI-04, X68 (cindy) | `loginAs('cindy')`; lands on `/home` | `<h1>` = `th.home.greetingFor.morning('Cindy')`; date line `formatHomeDate('2026-09-30')` = "พุธ 30 ก.ย. 2569"; card `th.home.myTasks.title` has exactly one row "ปรับปรุงระบบ POS หน้าร้าน" with "POS Upgrade" and `th.home.myTasks.planned('2.5')`, and **no** quick-add input; 8 load bars labelled `barLabel('28/9','2.5','5')` … with texts (Cindy) `['2.5/5','2.5/5','2.5/5','3.8/5','3.8/5','2.5/5','–','–']`; milestones card lists only "UAT sign-off" with the M8 status text "ใกล้ถึง"-equivalent `th.milestones.status.DUE_SOON` and `th.milestones.late`; no "Design freeze" anywhere in `page.content()`; leave lines วันนี้ "—", สัปดาห์นี้ "—", สัปดาห์หน้า "Peter (5 ต.ค. 2569 – 6 ต.ค. 2569)" + `th.masking.leave`, no "ลาพักร้อน"; recent pages include "Project Charter" with "POS Upgrade"; no heading `th.home.manager.overloadedTitle` |
| H2 | FR-1101a tick + undo (cindy) | tick "ปรับปรุงระบบ POS หน้าร้าน" → wait for the toast → `ControlOrMeta+Z` | row struck through and checked at once, toast `th.tasks.toast.completed` (no released load: Cindy's plan ends 09-28); the row leaves the card after the refetch (M10-D13); after Cmd+Z it is back unchecked; POS tasks tab shows "ยังไม่เริ่ม" |
| H3 | FR-1101f, PRIN-P6 (manager) | `loginAs('manager')`; `/home` | first cards are the manager cards; overloaded row "Peter" · `week('5/10')` · `level.OVER` · `excess('2')` (M9 `compactDays`) · `cause.CAPACITY`, linking to `/people/<peter>/plan?week=2026-10-05`; utilisation total "74.0%"; milestones "UAT sign-off" and "Design freeze"; leave line สัปดาห์หน้า shows "ลาพักร้อน"; `openWorkload` link → `/workload` in one click |
| H4 | NFR-07b (ivy, viewport 390 × 844) | `page.setViewportSize`; `/home` | cards stacked (bounding boxes share `x`); `document.documentElement.scrollWidth <= innerWidth`; leave lines all "—" (Ivy cannot see Peter) |
| P1 ⟲ (golden F1) | FR-1102/1105 | as cindy: Cmd+K, type "ลูกค้า"; as jack: same | cindy: option "ย้ายข้อมูลลูกค้า" in group `th.palette.groups.tasks` with `inProject('CRM Migration')`; Enter → URL `/projects/<crm>/tasks?task=<id>` and the panel shows the task; jack: no "ย้ายข้อมูลลูกค้า" option |
| P2 | FR-1104 local categories (ivy) | type "Pat"; then "Mi"; then "POS"; then "Com" | "Pat" → no people option; "Mi" → person "Mint"; "POS" → project "POS Upgrade"; "Com" → client "Coral" |
| P3 | NFR-06 (cindy) | `palette.measureFirstResult('PO')` | `< 200` ms |
| P4 | FR-1103 (cindy) | from `/home`: command "สร้าง task" → pick "POS Upgrade" → type "งานจาก palette" Enter; command "สร้างหน้า"; command "แจ้งลา"; from `/calendar` command "ไปหน้าวันนี้" | toast `created('งานจาก palette','POS Upgrade')`; POS tasks tab lists it with "ยังไม่เริ่ม"; "สร้างหน้า" opens `/p/<id>` with the template chooser and the new page under Wiki ทีม; "แจ้งลา" opens the M5 dialog; "ไปหน้าวันนี้" → `/home`; reopening "สร้าง task" shows POS first with `lastUsed` |
| P5 | KEY-05 (cindy) | on `/home` press `n`; on POS tasks tab press `n`; in a page editor type `n` | home → palette open in the project picker step; tasks tab → quick-add focused, no palette; editor → the letter is typed, no palette |
| P6 | KEY-01 vs BlockNote (cindy) | in a page, select text, `ControlOrMeta+K`; collapse the selection, `ControlOrMeta+K` | first → BlockNote link popover, no palette dialog; second → palette dialog |
| P7 | KEY-06 | press `?` | dialog lists `th.shortcuts.items.paletteMove`, `paletteOpen`, `paletteBack` under `th.shortcuts.scopes.palette` |
| B1 ⟲ (golden F1, `livePages`) | AC-1301 (cindy) | open the POS charter; click the end; type `/มุมมองงาน` Enter | a new `taskView` block (the second one; the template already has one) shows the POS board; drag "ปรับปรุงระบบ POS หน้าร้าน" to "กำลังทำ" → card in that column, undo toast; open POS tab งาน → the row's chip "กำลังทำ" |
| B2 | AC-1302 (manager) | on the POS charter select the inserted block (side-menu handle click) + `ControlOrMeta+C`; open "หน้า DW ทดสอบ", click end, `ControlOrMeta+V`; open "หน้า wiki ทดสอบ", paste again | DW page block shows "ย้าย pipeline ขึ้น BigQuery" and no POS task; wiki page block shows `th.editor.liveBlocks.wikiOnly`; reload → both persist (props only) |
| B3 | AC-1303 (ivy) | open the POS charter; wait for `/embed/workload` | rows Cindy, Ivy, Mint only; Mint week 28/9 cell "2.5/5.0", tooltip `th.masking.otherProjects`; `response.text()` lacks "Mobile App Revamp" and "พัฒนา front-end"; `page.content()` lacks them too |
| B4 | FR-1306 (cindy) | page A = POS charter (board block); page B (same context) = POS tasks tab → change "ทำ UAT + คู่มือหน้าร้าน" to "รอข้อมูล"; back to A, dispatch `visibilitychange` | A's block shows the card in "รอข้อมูล" without reload |
| B5 | FR-1307 (cindy) | Cmd+K "ทำ UAT" | the task appears in the tasks group; no page hit with `th.palette.matchedInContent` for the charter |
| B6 | M10-D5 (cindy) | in "หน้า wiki ทดสอบ" type `/มุม` | no "มุมมองงาน" item; in the POS charter the item exists and ranks first for `/board` |

### 7.4 Golden, perf and manual checks

- **Golden (integration, S1):** home load per user (r8 §4.10), manager utilisation F1 72.5 % / F3 74.0 %, F3 overload Peter 10-05 +200 CAPACITY, F2 none in
  this/next week, A.2 milestones per viewer (Cindy only UAT sign-off), leave visibility (Ivy sees no Peter), search visibility (Jack no CRM task).
- **Perf:** P3 < 200 ms on golden data; `search.int.test.ts › timing` < 500 ms; full-scale palette/search on `seed:perf` (20 000 tasks, 5 000 pages) is
  M11 (target: server p95 ≤ 100 ms, r6b M10-10).
- **Manual (before G4):** Thai Kedmanee layout — `N`, `?`, Cmd+K, Cmd+Z inside a live block still work (`e.code`); keyboard-only: open the palette, run
  "สร้าง task" end to end; tab through a board block (cards focusable, `S` opens the status menu inside the block without affecting the document); dark mode
  contrast of load bars (X51 tokens) and of the block frame; screen reader reads the bar labels, the leave lines (`dl`) and the live-block region labels;
  a 300-block page with two live blocks still opens < 1 s (NFR-05 smoke); an archived project's charter shows the read-only notice and no drag handles.

---

## 8. Definition of done

- [ ] SPEC §12 M10: §4.11 complete (`/home` first page after login; Cmd+K all categories + quick commands); §4.13 blocks + `GET /api/pages/:id/embed/*`;
      charter section "งานและภาระของทีม"; **AC-1301…1303** green in e2e; masking of embed workload tested; `e2e/m10-home-search.spec.ts` green incl. live blocks.
- [ ] `pnpm check` green (typecheck, lint, unit, ui, integration incl. `tests/authz` and masking); `pnpm db:generate` → "No schema changes".
- [ ] Full e2e suite M0–M10 green on the production build (older specs updated per S4.5, never weakened).
- [ ] Authz rows HM-*, SR-*, EMB-* present and green; no new action, so no new mutating row (X44) — confirmed in the review.
- [ ] Masking K1–K10 + golden variants green; no hidden project/task/milestone/leave detail in any M10 response.
- [ ] Every M10 string in `src/i18n/th.ts` (ESLint Thai ban clean); no `localStorage`; no confirm dialog; state never by colour alone (load bars, cells, chips carry text/glyphs).
- [ ] Loads are integer cd end to end; plan dates computed in TypeScript; every `allocations` query has a `week_start` range (M6 repo only).
- [ ] No `any`, `@ts-ignore` or undocumented `eslint-disable`.
- [ ] `PROGRESS.md` updated (§10); commit + tag done.

---

## 9. Risks and gotchas

| # | Risk | Mitigation (step) |
|---|---|---|
| R1 | ProseMirror acts on keys/clicks from inside the live block (Backspace deletes the block, drag starts a block drag, Cmd+Z undoes editor text) | S3.1 spike, native `stopPropagation` listener set (M10-D8) in `LiveBlockFrame`, ui test "Backspace keeps the block" |
| R2 | Cmd+K inside the editor: BlockNote's link popover calls `preventDefault` but not `stopPropagation` (r3 G16) | palette hotkey returns on `defaultPrevented` (M4); e2e P6 |
| R3 | `ORDER BY similarity()` on page content takes seconds (r6b E6) | M4 path unchanged: title hits ordered, content unordered `LIMIT 8`, ≥ 3 chars, savepoint + 500 ms timeout |
| R4 | Thai trigrams vanish on a C-locale database (r6b E4/E5) | Debian `postgres:17`; M0's `produces Thai trigrams` test; `uses index` EXPLAIN smoke (S1.8) |
| R5 | LIKE wildcards in user input (`_`, `%`, `\`) | `escapeLike` + `ESCAPE '\'`, parameters only (S0.3, S1.8 tests) |
| R6 | People category leaks names of people the viewer cannot see / links to 404 pages | index and server use `visibleUserIds` (M10-D20/D21); K3; P2 |
| R7 | Masking drift between `/api/workload` and the embed | embed calls M9's `buildTable({ userIds })` (no copy; parity test S1.10); K6–K8 + golden AC-1303 |
| R8 | Embed shows stale data after edits elsewhere (60 s `staleTime`) | `staleTime: 0`, `refetchOnWindowFocus: 'always'`, prefixes in `invalidateTasks`/`invalidateLoad` (M10-D10); B4 |
| R9 | The embedded `TaskList` steals global `N` or opens a panel inside a document | `embed` option disables `N`, panel and tree ops (M10-D9); TaskList test |
| R10 | `N` fallback fires together with M3/M6 local handlers | deferred `setTimeout(0)` check of `defaultPrevented` (M10-D25); hook test; e2e P5 |
| R11 | Older palette tests break when M10's groups/commands appear | M4-D37d / M8 already select by name and assert no group absence or option counts; S4.5 only re-runs E16 and the M8 command scenario; M10's page object reuses `group()` with its `[cmdk-group]` fallback (C62) |
| R11b | The embed drifts from M3's board call (props pinned in m03 S3.16: `renderCard(card)`, `onMove(cardId, toColumnKey)`, `canEdit`, `footer?(column)`; `TaskCardProps`) | S0.1 records the real exports; `EmbeddedTasks` uses exactly those props + `toCardModel` and never changes `TaskBoard`/`TaskCard` (C45) |
| R12 | Copy/paste of a custom block via the real clipboard is flaky | B2 uses real `ControlOrMeta+C/V` (Chromium permissions from PLAN §4.5); the binding itself is also proven in `embed.int.test.ts` with identical JSON in two projects |
| R13 | Hydration mismatch of the greeting/date | both rendered on the server from `serverNow()`/`serverToday()` (M10-D19); `formatRelative` uses `now` from the response |
| R14 | M8/M9 names drift during their own implementation | S0.1 inventory; adapt at the call site in `services/embed.ts` / `home.ts`; report as a cross-milestone concern |
| R15 | BlockNote `PropSpec` rejects numeric `values` for `limit` | fall back to an untyped number prop + `resolveTaskViewProps` + server validation (S0.10) |
| R16 | Serialised blocks carry default props that fail `.strict()` | the strict schema lists exactly the propSchema keys; headless round-trip test (S3.7) |
| R17 | Golden charters now contain live blocks, so AC-1301's inserted block is the second one | page object targets the last `taskView` block (B1) |

---

## 10. Close-out

- `PROGRESS.md`: M10 row ✅ with date; Decisions = X-rows of §3.1 + M10-D1…D35 (no Deviations entry — M10-D2 follows SPEC §7.8); Known issues: Thai
  sara am NFKC folding not applied (M10-D32); existing charters (created before M10) do not have the live section (M4-D30/M10-D12); full-scale palette perf
  pending M11; any M8/M9 name that needed adaptation at implementation time.
- `PLAN.md` (already folded in by T7 as X81/X82/X86/X88/X89 — only verify): §3.5 `qk.searchIndex`, `pageEmbedTasks(All)`, `pageEmbedWorkload(All)` and the
  `invalidateTasks`/`invalidateLoad`/`invalidateMilestones`/`invalidatePages` additions (G42); §3.1 `api/search/index` and the "route param keeps its sibling
  folder's name" rule (G43); §3.4.3 handlers parse params themselves, malformed id → 404 (M10-D1, G44, X86); §3.8 `useFallbackHotkey` rule (M10-D25, G46); §3.11 live-block event
  isolation via `LiveBlockFrame` (M10-D8, G47).
- `plan/traceability.md`: fill the M10 rows' test files (FR-1101a–f, FR-1102…1105, FR-1301…1307, AC-1301…1303, GAPI-08 → `tests/authz/rows/pages.ts` EMB-*, home → `tests/authz/rows/home.ts` HM-*, search → `tests/authz/rows/search.ts` SR-*; C51).
- Commit: `feat(m10): home dashboard, Cmd+K across all categories with quick commands, live task/workload blocks in project pages` — body lists FR-1101…1105,
  FR-1301…1307, AC-1301…1303, KEY-01/05/06, NFR-06 + the attribution trailer the session requires. Tag `m10`.
