# M3 — Tasks

> Depends on: M2 ✅ · SPEC v3.1: §4.6 incl. §4.6.1–4.6.3 (−FR-612; FR-667 person tab → M9), §5.4, §5.5 (BR-35/36), §5.8 (BR-60, BR-61 count), §5.10 (BR-80–87), §6.2 (tasks without `milestone_id`, `task_statuses`, `task_blockers`, task_assignments), §7.5, §7.8, §8.6, §8.10, §11.1 (`status`, `blockers`), §11.2, §12 M3 ·
> Owner-visible result: every project gets a **งาน** tab with a keyboard-first outliner (quick add, Tab/Shift+Tab, drag, multi-select, assignees, completion, grouping) **and a board view (kanban by status)**, per-project **task statuses** (5 defaults, LEAD/Manager settings on ภาพรวม), **"ถูกขวางโดย"** links with ⛔/✓ badges, a slide-in task panel, server-side undo of deletions by batch, a basic **งานของฉัน** page with a sidebar count, a cross-project **งานของทีม** page (`/tasks`), and a `?` shortcut-help dialog.

---

## 1. Goal and scope

### 1.1 In scope

Legend for "Where": stream.step in §5. "Test": `unit` = Vitest node, `ui` = Vitest jsdom, `int` = Vitest + Postgres, `authz` = `tests/authz/matrix.int.test.ts` row, `e2e` = `e2e/m3-tasks.spec.ts` scenario id (§7.3).

| ID | What M3 delivers | Where | Test |
|---|---|---|---|
| FR-601 | Task fields: name (only required), notes, start, due, certainty override, multiple assignees, done. **Milestone field excluded (X21 → M8).** | S0.2 schema · S2.4 `updateTask` · S3.6 panel | int `tasks.int.test.ts › updateTask` · ui `TaskPanel.test.tsx` · e2e E7 |
| FR-602 | Quick add "+ เพิ่มงาน…": Enter creates, cursor stays for the next one; empty = no-op | S2.3 `createTask` · S3.3 `QuickAdd` | ui `QuickAdd.test.tsx` · e2e E1 |
| FR-603 | Tab = indent under the row above (previous sibling becomes parent, appended as last child), Shift+Tab = outdent; max 3 levels, over-limit Tab is a silent no-op | S1.3 `ops.ts` · S2.5 `indentTask`/`outdentTask` · S3.4 keyboard | unit `ops.test.ts` · int `tasks.int.test.ts › indent/outdent` · e2e E2 |
| FR-604 | Drag to reorder and to nest (dnd-kit, corrected projection; server re-validates) | S1.2 `projection.ts` · S2.5 `moveTask` · S3.2 `SortableTree` | unit `projection.test.ts` · int `› moveTask` · e2e E10 |
| FR-605 | Assignee picker (name/nickname/position search, multi-select), × on chip removes with undo | S2.7 `assign`/`unassign` · S3.7 PersonPicker | int `assignments.int.test.ts` · authz PERM-13/14 · e2e E4 |
| FR-606 | Unassigned task shows "รอมอบหมาย" (text, never hidden) | S3.4 `TaskRow` | ui `TaskList.test.tsx` · e2e E4 |
| FR-607 | Tick done = move to the first `DONE` status (BR-82), untick = back to the default status (BR-81), both through `setStatus` (X71) → strikethrough + checked box; hidden when "แสดงงานที่เสร็จแล้ว" is off (preference). **Load effect (BR-50) is M6.** | S2.6 `completeTask`/`uncompleteTask` → `setStatus` · S1.4 `visibleRows` · S3.4 | int `task-status.int.test.ts › checkbox` · unit `tree.test.ts` · e2e E6 |
| FR-608 | Ticking a parent — or moving it to any `DONE` status (chip, menu, board, bulk) — with open children → toast "ติ๊กงานย่อยทั้งหมดด้วยไหม" [ติ๊กทั้งหมด] | S2.6 `openDescendantIds`/`withChildren` · S3.8 | int `task-status.int.test.ts › withChildren` · e2e E6, E17 |
| FR-609 | Delete (Delete/Backspace on selected rows or menu) removes the subtree → toast "ลบ 'X' และงานย่อย 3 งานแล้ว · เลิกทำ" | S2.8 `deleteTaskTree` · S3.8 | int `› delete/restore` · e2e E3 |
| FR-610 | Adding a subtask to an assigned task moves its assignees (and, from M6, plans) to the new child + toast with undo (X20) | S2.3/S2.5 transfer · S3.8 | int `› FR-610 transfer` · e2e E5 |
| FR-611 | Task detail panel from the right, ~440 px, does not cover the list, Esc closes, URL `?task=<id>` | S3.6 `TaskPanel` | ui `TaskPanel.test.tsx` · e2e E7 |
| FR-613 | Group by none / status / assignee / certainty; sort manual / due date. **Group by milestone excluded (X21 → M8).** | S1.4 `group.ts`/`sort.ts` · S3.5 toolbar | unit `group.test.ts` · e2e E8 |
| FR-614 | Multi-select (Shift+click / Cmd+click) → bulk delete, complete, set status, assign. **Bulk "ผูก milestone" excluded (X21 → M8).** | S1.4 `selection.ts` · S2 array inputs · S3.9 bulk bar | unit `selection.test.ts` · int bulk cases · e2e E9, E18 |
| FR-620 | Every task has exactly one status, of its own project (BR-83: composite FK) | S0.2 schema · S2.14 | int `schema.int.test.ts › task_statuses` |
| FR-621 | New project → 5 default statuses in the same tx; `ensureAllProjectStatuses(tx)` backfills older projects, `ensureProjectStatuses(tx, projectId)` is the per-project call (X70) | S2.14 · S2.12 seed | int `task-statuses.int.test.ts › defaults` · e2e E15 |
| FR-622 | LEAD/Manager manage the status set on ภาพรวม › "สถานะงาน": add, rename, colour, category, drag order; names unique per project (case-insensitive); ≤ 12 | S2.14 · S3.18 `StatusSettings` | int `› create/update/reorder` · ui `StatusSettings.test.tsx` · authz PERM-23 · e2e E16 |
| FR-623 | ≥ 1 `TODO` and ≥ 1 `DONE` status always (BR-84) → `VALIDATION` with the reason; a status used by live tasks cannot change category into or out of `DONE` (SPEC literal, X71, M3-D27) | S1.5 `validateStatusSet` · S2.14 | unit `status.test.ts` · int `task-statuses.int.test.ts › doneCategoryInUse` |
| FR-624 | Delete a status: unused → delete + undo toast; used → pick a destination → move + delete in one tx → toast "ย้าย N งานไป 'X' แล้ว · เลิกทำ" (X72) | S2.14 · S3.18 | int `› delete/restore` · e2e E18 |
| FR-625 | New task gets the default status (BR-81); column quick add uses the column's status (FR-664) | S2.3 · S3.16 | int `› createTask status` · e2e E15 |
| FR-626 | Change status from the row chip, panel, board drag, bulk bar; `S` opens the status menu on the focused row/card | S3.15 · S3.4 · S3.16 · S3.9 | ui `StatusMenu.test.tsx`, `TaskList.test.tsx` · e2e E17 |
| FR-627 | Chip = category icon + name + colour dot (never colour alone, §8.9) | S3.15 `StatusChip` | ui · manual a11y |
| FR-628 | Only the `DONE` category affects completion/load (BR-80); `WAITING` tasks stay open | S1.5 · S2.6 | unit · int |
| FR-640 | Panel "ถูกขวางโดย": add a same-project task from a picker; × removes with undo | S2.15 · S3.17 | int `task-blockers.int.test.ts` · e2e E19 |
| FR-641 | Several blockers per task; reverse list "กำลังขวาง" links to those tasks | S3.17 | ui `BlockersSection.test.tsx` |
| FR-642 | Self, ancestor/descendant and cycles (incl. indirect) rejected with the path (BR-85, X73) | S1.6 `blockers.ts` · S2.15 | unit + property · int · e2e E19 |
| FR-643 (M3 part) | ⛔ "รอ N งาน" badge on list rows and board cards; hover lists the blockers (grid rows → M6, X76) | S2.10 SQL counts · S3.17 `BlockerBadge` | int · ui · e2e E19 |
| FR-644 | All blockers done → ✓ "ตัวขวางเสร็จแล้ว"; nothing changes automatically | S1.6 `blockerBadge` · S3.17 | unit · int · e2e E19 |
| FR-645 | Deleting a task soft-deletes its edges in the same batch; undo restores them (X73) | S2.8 | int `› delete/restore › blockers` |
| FR-660 | Tasks tab toggle ลิสต์ · บอร์ด remembered in `tasks.view` (X74) | S0.13 · S3.16 | ui · e2e E17 |
| FR-661 | Board columns = project statuses in order with counts; card: name, parent breadcrumb, assignees, due, ⛔/✓, ◐, "รอมอบหมาย" (milestone on the card → M8, X21) | S1.4 `board.ts` · S3.16 | unit `board.test.ts` · ui `TaskBoard.test.tsx` |
| FR-662 | Drag a card across columns = status change (optimistic, undo toast, Cmd+Z); no reordering inside a column | S3.16 | e2e E17 |
| FR-663 (M3 part) | Board shows every depth; filters assignee, "เฉพาะงานย่อยสุด", "ซ่อนคอลัมน์หมวดเสร็จ" (milestone filter → M8, X21); click → panel | S1.4 · S3.16 | unit · ui |
| FR-664 | "+ เพิ่มงาน" at the foot of each column (name only, that column's status) | S2.3 · S3.16 | int · ui |
| FR-665 | `/tasks`: tasks of every project the viewer can see (X75), list/board, board columns = the 4 categories, filters person/project/position/category/blocked | S2.16 · S1.4 `board.ts` · S3.19 | int `team-tasks.int.test.ts` · masking S4.3 · e2e E20 |
| FR-666 | `/tasks` board drop → first status of that category in the task's project; none → no move + toast | S1.4 `resolveCategoryDrop` · S3.19 | unit · ui · e2e E20 |
| FR-667 (M3 part) | `/my` shows the status chip and keeps the X22 grouping; the person-page tab is M9 (X77) | S3.12 | e2e E13 |
| AC-601 | Three task names typed with Enter, no mouse → 3 tasks | S3.3 | e2e E1 |
| AC-602 | Select row 2 + Tab → child of row 1; Tab beyond level 3 does nothing | S1.3, S2.5, S3.4 | unit + int + e2e E2 |
| AC-603 (M3 part, X13) | Delete a parent with 3 children → 4 gone → "เลิกทำ" → all back **with their assignments** (plans clause → M6) | S2.8, S3.8 | int `› AC-603` · e2e E3 |
| AC-203 (M3 part, X12) | Deactivated users are absent from the assignee picker and rejected by `assign` | S2.7 · S3.7 | int `› deactivated` · e2e E4b |
| AC-611 | New project → 5 default statuses; quick add → "ยังไม่เริ่ม" | S2.14 · S2.3 | e2e E15 · int `task-statuses.int.test.ts › defaults` |
| AC-612 | LEAD adds "รอลูกค้ายืนยัน" (`WAITING`) before "เสร็จ" → new board column in that place; MEMBER's status actions are rejected by the server | S2.14 · S3.18 | e2e E16 · authz S-* rows (Me → 403) |
| AC-613 | Card dragged to "เสร็จ" → struck through, `completed_on` = today (Bangkok) → "เลิกทำ" → previous status, `completed_on` empty | S2.6 · S3.16 | e2e E17 · int `task-status.int.test.ts › BR-80` |
| AC-614 | Delete "รอข้อมูล" with 3 tasks → move to "กำลังทำ" → undo restores the status and the 3 tasks | S2.14 · S3.18 | e2e E18 · int `› delete/restore` |
| AC-615 | B blocked by A → ⛔ "รอ 1 งาน"; A blocked by B → rejected with the cycle; A done → ✓, B's status unchanged | S1.6 · S2.15 · S3.17 | e2e E19 · int · unit |
| AC-616 | A worker sees on `/tasks` only tasks of their projects; the response holds no other names | S2.16 · S3.19 | e2e E20 (Peter, M3-D34) · masking S4.3 (world `outsider`) |
| BR-30 | depth 0..2; server enforces `newDepth + subtreeHeight ≤ 2` and rewrites descendants' depth | S0.2 check · S2.2 `placement` | int · unit |
| BR-31 | Assignments only on leaves; parent tasks cannot be assigned; adding a child / nesting under an assigned leaf moves the assignments (`task_id` re-point + `version + 1`) | S2.2 `autoTransfer`, S2.7 | int `› BR-31` |
| BR-32 | Soft delete of the subtree with one `deleted_batch`; undo restores that batch only | S2.8 | int `› BR-32` |
| BR-33 | Cross-project moves rejected (`VALIDATION`, or `NOT_FOUND` when the other project is invisible) | S2.2 | int + authz row T-MOVE-X |
| BR-04 (M3 part) | Task `start_date`/`due_date`/`completed_on` are `date({ mode: 'string' })` ↔ `ISODate`; no JS `Date` for them (only `DateField` converts ISO ↔ Dayjs at the component edge, X50) | S0.2 · S3.6 | int `schema.int.test.ts` · ui `DateField.test.tsx` |
| BR-35 | `effectiveCertainty` = task ?? parent ?? grandparent ?? project (X03) | S1.1 `certainty.ts` | unit `certainty.test.ts` (table + property) |
| BR-36 | Panel source label "ตั้งที่งานนี้" / "สืบทอดจาก '<ชื่องานแม่>'" / "ตามโปรเจค" | S1.1 `certaintySource` · S3.6 | unit · ui `TaskPanel.test.tsx` · e2e E7 |
| BR-80 | Into `DONE` → `completed_on = today` (the action passes `serverToday()`, M3-D43), `completed_by`; out of `DONE` → both null; `DONE`→`DONE` keeps the date | S1.5 `completionTransition` · S2.6 · S2.14 (status delete) | unit `status.test.ts` · int (+ invariant query, R22) |
| BR-81 / BR-82 | Default status = `TODO` with the smallest position; checkbox → `DONE` with the smallest position | S1.5 | unit |
| BR-83 | Composite FK `tasks (project_id, status_id) → task_statuses (project_id, id)` | S0.2 | int `schema.int.test.ts` (23503) |
| BR-84 | `TODO` ≥ 1 and `DONE` ≥ 1 checked in the same tx as every status-set change | S1.5 · S2.14 | unit · int |
| BR-85 | Same project, not self, not ancestor/descendant, no cycle (`wouldCreateCycle` returns the path) | S1.6 · S2.15 | unit + property · int |
| BR-86 | Badge from `{ open, total }` counted in SQL (X73) | S1.6 `blockerBadge` · S2.10 · S2.16 | unit · int |
| BR-87 | Statuses (except via BR-80) and blockers never touch assignments or plans | S2.6 · S2.15 | int |
| BR-60 | Assigning a non-member (by L/M) adds MEMBER in the same transaction; Me → 403 | S2.7 | int · authz PERM-14 |
| BR-61 (count) / FR-404 (carried in, X16) | Removing a member with assignments → toast "มีงานที่มอบหมายอยู่ N งาน" with "ยกเลิกการมอบหมายทั้งหมด" / "ยกเลิกการนำออก"; combined op in one tx, one undo entry | S2.9 · S3.10 | int `members.int.test.ts › FR-404` · authz PERM-08 rows · e2e E11 |
| §7.5 UNDO-3/4/5 | Deletions return `deleted_batch`; undo = `restore*({ batch })`; toast 8 s; restore re-checks authz, 30-day window, live parent, conflicts (X04 server part) | S2.8, S2.7 · S3.8 | int · authz restore rows · e2e E3, E3b |
| §8.6 list keys | Enter next task · Tab/Shift+Tab · Cmd+Enter done · Delete · Space panel · Esc · `N` (focus quick add on the tasks tab) · `?` help (X07) · Cmd+Z / Cmd+Shift+Z (M1 framework) | S3.4, S3.11 | ui · e2e E1–E3, E12 |
| §7.8 | `GET /api/tasks`, `GET /api/projects/[id]/statuses`, the new server actions (statuses, blockers, `setTaskStatus`, `revertTaskStatus` M3-D28) | S0.8/S0.9 · S2.6, S2.14–S2.16 | int · authz |
| §8.10 | Board layout, `/tasks` with category columns, status settings on ภาพรวม | S3.16, S3.18, S3.19 | ui · e2e E16–E20 |
| §11.1 `status` / `blockers` | Unit suites incl. fast-check properties; domain coverage ≥ 95 % | S1.5, S1.6 | unit |
| §11.2 | Authorization matrix rows for every new action and route (§7.2) | S4.1–S4.3 | authz |
| FR-1201 / X44 | One audit row per mutating action (task, task_assignment, project_member) in the same tx | S2 every action | authz (audit assertion) + int |
| FR-1009 basic (X22) | `/my`: my open assigned leaf tasks in non-archived projects, grouped by project, tickable; sidebar "งานของฉัน N" | S2.10 · S3.12 | int `my-tasks.int.test.ts` · e2e E13 |
| FR-408 tab (carried in, X15) | "งาน" tab appears now (no placeholders for later tabs) | S3.13 | e2e E1 |
| FR-409 progress (carried in, r6a M2-08/M3-18) | Overview shows "เสร็จ X/Y งาน" (all non-deleted tasks, every depth) | S2.11 · S3.13 | int · e2e E6 |
| A11Y-1 (M3 part) | "รอมอบหมาย" text, ◐ + text for tentative, checkbox state for done, invalid drop shows icon + text | S3.4 | ui |
| NFR-07b (M3 part) | `/my` usable at phone width | S3.12 | e2e E13 (390 px viewport) |
| Seed (X11, M3 part) | `seed:golden` adds the 5 default statuses per project (X70), 10 tasks in JSON order (all "ยังไม่เริ่ม") + 10 assignments + the "Rollout สาขา" override | S2.12 | int `fixtures.int.test.ts` |

**§3.2 permission rows in scope** (PERM numbering = §3.2 table order, see §9 R-PERM):

| PERM | §3.2 row | M | L | Me | W | Rows (§7.2) |
|---|---|:-:|:-:|:-:|:-:|---|
| PERM-06 | เห็นโปรเจค / เปิดโปรเจค (task reads) | allow | allow | allow | 404 | `GET /api/projects/[id]/tasks` (P and archived A), `GET /api/projects/[id]/statuses`, `GET /api/tasks?projectId=` |
| PERM-08 | เพิ่ม/ลบสมาชิก (FR-404 combined op) | allow | allow | 403 | 404 | `removeMemberWithAssignments`, `restoreRemovedMember` |
| PERM-11 | สร้าง/แก้/ลบ/ติ๊กเสร็จ task, เปลี่ยนสถานะ, เพิ่ม/ลบตัวขวาง (widened in v3.1, X79) | allow | allow | allow | 404 | create, update, indent, outdent, move, complete, uncomplete, setTaskStatus, revertTaskStatus, addTaskBlocker, removeTaskBlocker, delete, restore |
| PERM-13 | มอบหมายงานให้สมาชิกเดิม | allow | allow | allow | 404 | `assign` (existing member), `unassign`, `restoreAssignmentBatch` |
| PERM-14 | มอบหมายงานให้คนที่ยังไม่เป็นสมาชิก | allow | allow | 403 | 404 | `assign` (non-member, BR-60) |
| PERM-23 | จัดการชุดสถานะงานของโปรเจค (v3.1; appended at the end of §3.2 so PERM-01…22 keep their numbers, X79) | allow | allow | 403 | 404 | createTaskStatus, updateTaskStatus, reorderTaskStatus, deleteTaskStatus, restoreTaskStatusBatch |
| — (visibility filter, X75) | `/tasks` reads | allow | allow | allow | allow (own projects only) | `GET /api/tasks` |

Archived project A (X42): every write above → M/L/Me `403`, W `404`; reads allowed for M/L/Me.
Implemented by S2.1 (authz helpers) and the S2.3–S2.10 actions/routes; tested by the S4 rows listed in §7.2 (one row per action/route, plus archived and cross-project variants).

### 1.2 Out of scope (do NOT build; target milestone)

| Item | Lands in |
|---|---|
| FR-612 "วางแผน" per assignee in the panel, BR-25 | M6 |
| AC-604 (Jack + Mint plans) | M6 (plan) · M9 (person page) — X14 |
| `allocations` table, BR-50/51/52 load effects, "ปลดภาระ X วัน" toast (`SetTaskStatusResult.released`, M6-D16), plan totals in rows (FR-805), AC-603 plan clause | M6 (X13, X19) — M3's only BR-51 part is that completion never touches assignments (BR-87) |
| `milestones` table, `tasks.milestone_id`, milestone field, group-by-milestone, bulk "ผูก milestone" — **no stubs, no disabled options** | M8 (X21) |
| FR-1009 buckets (สัปดาห์นี้ / สัปดาห์หน้า / หลังจากนั้น / ยังไม่วางแผน) and the final sidebar count definition | M9 (X22) |
| Command palette, Cmd+K, "สร้าง task" quick command, task search | M4 (shell) · M10 (tasks category, quick commands) |
| `N` on the home page / grid | M10 / M6 |
| Grid "Delete on a whole task row", × on grid chips | M6 (reuses `deleteTaskTree`, `unassign`) |
| Project overview loads (FR-409 load part) | M9 |
| Trash / automatic purge of old batches (only refusal after 30 days here) | SPEC §13 #9 (Phase 2) |
| ⛔ badge on grid task rows (`GridRow` blockers, FR-643 grid part) | M6 (X76) |
| Person-page **งาน** tab reusing `TaskList`/`TaskBoard` (FR-667 person part) | M9 (X77) |
| Embedded "มุมมองงาน" / "ภาระทีมโปรเจค" blocks and `/api/pages/:id/embed/*` (§4.13) | M10 (X78) |
| Milestone filter and milestone on board cards (FR-661/663 parts), `TaskCard.milestoneId` | M8 (X21, M3-D37) |
| Reordering cards inside a board column; notifications when blockers finish | SPEC §13 #8, #6 (Phase 2) |
| Blockers across projects; automatic status or plan changes when blockers finish | never (SPEC §14 D12, P4/P7) |
| Comments, notifications, dependencies that move plans, sections, cross-project moves | SPEC §13 / §1.4 / D8 / D10 |

### 1.3 Carried-in items (deferred to M3 by earlier milestones)

| From | Item | Ruling |
|---|---|---|
| M1 | Undo framework (`UndoProvider`, `useUndo`, 8 s toast, Cmd+Z/Shift+Z) exists; M3 adds server batch restore | X04 |
| M1 | `listAssignableUsers()` excludes deactivated users; M3 uses it in the assignee picker + `assign` | X12 |
| M2 | `removeMember` returned `blockedByAssignments: 0`; M3 implements the count, the two-option toast and the combined op | X16 |
| M2 | Project tabs config: M3 adds "งาน" | X15, FR-408 |
| M2 | Overview progress "เสร็จ X/Y งาน" | r6a M2-08 / M3-18 |
| M2 | `PersonPicker` (members) is extended for assignees with the "จะถูกเพิ่มเป็นสมาชิก" hint | PLAN §3.9 |
| M0/M2 | Data-driven sidebar nav: M3 adds "งานของฉัน" with a count and "งานของทีม" (`/tasks`) | X33, X75 |
| M2 | `createProject` also inserts the 5 default statuses in the same tx; `ensureAllProjectStatuses()` backfills projects created before M3 (bootstrap + seed) | X70 |
| M2 | Overview tab gets the "สถานะงาน" section | FR-622 |

---

## 2. Read first

- **SPEC (v3.1):** §0–§3 (esp. §1.3 P7 exception, §1.4, §3.2 rows PERM-06/08/11/13/14 and the appended status-management row = PERM-23, §3.4), §4.6 incl. §4.6.1–4.6.3, §5.4, §5.5 (BR-35, BR-36), §5.8, §5.10 (BR-80–87), §6.1, §6.2 (`task_status_category`, `task_statuses`, `tasks`, `task_blockers`, `task_assignments`), §7.3, §7.5, §7.8, §8.1 (sidebar "งานของทีม"), §8.6, §8.9, §8.10, §11.1 (`status`, `blockers`), §11.2, §12 M3, §14 D11–D12, Appendix A.1 (task table).
- **PLAN.md:** §1.2 (versions), §1.3 (Drizzle orderKey/COLLATE "C", `serverToday()`, MUI 9 slots, Zod 4, dnd-kit, fractional-indexing, sonner, Playwright clock), §1.4 X03, X04, X07, X11–X13, X15, X16, X18–X22, X33, X40–X49, X50, X53, X62, X70–X79 (SPEC v3.1); §2.3 ownership; §3.1 layout; §3.4 (errors, `action()`, `route()`, authz API, transactions, audit, clock); §3.5 query keys + invalidation; §3.6 dates/format; §3.7 i18n; §3.8 undo/keyboard; §3.9 UI system; §4 testing (world, matrix, e2e).
- **Research:** `plan/research/r4-client-testing.md` §6 (mutation callbacks/scope), §17–§20 (dnd-kit + projection + server tree moves), §23 (sonner), §24–§26 (fractional-indexing, COLLATE "C", `orderKey`), §29 (Zod 4), §34 (mocking next/cache), §38 (Playwright clock); snippets `plan/research/snippets/r4/client/components/tree/{tree-projection.ts,tree-projection.test.ts,SortableTree.tsx}`, `snippets/r4/db/order-key.schema.ts`, `snippets/r4/client/lib/{action-result.ts,query-client.ts}`, `snippets/r4/vitest/tests/integration/rename-task.test.ts`; `r1-next-mui-tooling.md` §8.6 (MUI 9 renames), §9 (pickers, `AdapterDayjsBuddhist`), §12.8 (providers); `r2-auth-db.md` §9.2 (generated column, partial/GIN indexes) and the `tasks`/`task_assignments` Drizzle tables in §12; `r6a-gaps-m0-m5.md` §3.4 (M3-01…M3-19), M2-03, M2-04, X-09, X-12, X-22; `r5-v21-mining.md` §2 M3 and §8 conflicts C1, C20–C22, C27, C30; `r8-golden.md` §4.2 (row counts, memberships), §4.10 (who has which tasks).
- **Not covered by research (treat as unverified):** Drizzle composite `foreignKey({ columns, foreignColumns })`, table-level `unique().on(...)` and an expression index on `lower(name)` — r2 §12 / r6a E-12 only verified single-column FKs, composite PKs and partial unique indexes → **[uncertain]**, M3-D36. dnd-kit `useDraggable`/`useDroppable` for the board are core-package APIs not exercised in r4 §17–§20 → **[likely]**. MUI icons named in S3.15/S3.16 → **[likely]** (check the import at typecheck).
- **docs:** `docs/reference/golden-fixtures.json` (`tasks[]`: project, name, assignee, certaintyOverride).

---

## 3. Decisions for this milestone

### 3.1 Applicable PLAN §1.4 rulings

| ID | What it means in M3 |
|---|---|
| X03 | `src/domain/certainty.ts` (`effectiveCertainty`, `certaintySource`, plus `resolveCertainty`) built test-first now; M6 adds the SQL-parity test. |
| X04 | Client undo exists (M1). M3 adds `deleted_batch` server restore: `restoreTaskBatch`, `restoreAssignmentBatch`, `restoreRemovedMember`. |
| X07 | `?` opens a data-driven shortcut dialog fed by `src/lib/shortcuts.ts`; later milestones append entries. |
| X11 | `seedGolden` M3 part: tasks in JSON order (positions per project), assignments, the one override. No allocations. |
| X12 | AC-203 M3 clause: assignee picker and `assign` exclude deactivated users. |
| X13 | AC-603 M3 clause: tree + assignments restored; M6 extends the same tests to allocations. |
| X15 | "งาน" tab appears in M3; no placeholders for "แผนงาน"/"เอกสาร". |
| X16 | FR-404 count + two-option toast + combined op (one tx, one undo entry). |
| X18 | Task mutations that will affect load (certainty override, complete/uncomplete, delete/restore, assign/unassign, transfers) call `invalidateLoad(qc)` as well as `invalidateTasks(qc, projectId)`, so M6/M9 views refresh without new wiring. No `refresh()` needed in M3 task actions. |
| X19 | Completion toast is "ติ๊กเสร็จแล้ว · เลิกทำ" without numbers; completion never touches plans. |
| X20 | FR-610/BR-31: `UPDATE task_assignments SET task_id = <child>, version = version + 1`; undo moves them back and soft-deletes the child. |
| X21 | No milestone anything in M3. |
| X22 | `/my` = my open assigned leaf tasks in non-archived projects, grouped by project, tickable; sidebar count = that number. |
| X33 | Nav item "งานของฉัน" appears in M3 (with count). |
| X40 | `pnpm check` includes integration tests; `pnpm db:up` first. |
| X41 | Invisible → 404 `NOT_FOUND`; visible but not allowed → 403 `FORBIDDEN`. |
| X42 | Archived project: task reads allowed, every task/assignment write `FORBIDDEN` (via `requireProject`). |
| X44 | Audit every mutating action inside the transaction; matrix asserts one row per `allow` mutating row (see M3-D4). |
| X45 | `completed_on` = the `today` the action got from `serverToday()` (M3-D43); integration/e2e pin `APP_NOW=2026-09-30T10:00:00+07:00`. |
| X46 | E2E on the production build, `resetDb()` per spec file (golden incl. M3 tasks), API login, page objects. |
| X47 | `z.uuid()`, Thai only via `th.*`, no `revalidateTag`. |
| X48 | `tasks.position` is `orderKey` (`text COLLATE "C"`); keys generated on the server between real neighbours under `pg_advisory_xact_lock(hashtext('tasks:' || scope))`; `ORDER BY position, id`; re-key with `generateNKeysBetween` when neighbours are equal. |
| X49 | Letter shortcuts match `e.code` (`KeyN`, `KeyZ`, `Slash`) first; global shortcuts ignore editable targets and `e.defaultPrevented`. |
| X50 | `DateField` = MUI X `DatePicker` + `AdapterDayjsBuddhist` + `thTH`, ISO string ↔ Dayjs only at the component edge. |
| X53 | No `localStorage`; temporary ids via `getRandomValues` (`src/lib/temp-id.ts`), never `crypto.randomUUID` in client code. |
| X62 | Enter = sibling at the same level; empty name no-op; names 1–500 chars; `newDepth + subtreeHeight ≤ 2`; over-limit Tab silent no-op; BR-33 reject; soft-delete only task rows under one batch; restore checks 30 days, authz, not archived, live parent; removal soft-deletes the assignment under a batch, re-add creates a new one, conflicting undo skipped with toast; Me picker = members, L/M = all active + hint (BR-60 same tx); parents not assignable; parent completion has no cascade unless "ติ๊กทั้งหมด"; multi-assignee task under each assignee group; tree ops only in ungrouped + manual order; flat task list API. |
| X70 | M3 migration adds `task_status_category`, `task_statuses`, `task_blockers`, `tasks.status_id`; M2's `createProject` inserts the 5 FR-621 defaults in the same tx; idempotent `ensureAllProjectStatuses()` runs from bootstrap and seed for older projects (mirrors X25); seeded tasks get the default status. |
| X71 | One service `services/taskStatus.ts#setStatus(taskIds, statusId)` implements BR-80; checkbox (BR-82), board drag, status menu, bulk bar and column quick add all go through it; FR-608 fires when the target category is `DONE`; completion toast stays as X19. |
| X72 | `deleteTaskStatus` soft-deletes the status with a batch and moves its tasks in one tx, returning `{ batch, moved }`; `restoreTaskStatusBatch` re-checks authz, restores the status and resets only tasks still on the destination (never clobbers later edits); BR-84 in the same tx. M3-D29 extends `moved` items with `completedOn` and the input with `moveToStatusId`. |
| X73 | `src/domain/blockers.ts#wouldCreateCycle` returns the cycle path or null (+ ancestor/descendant check); the service loads the project's live edges; `deleteTaskTree` soft-deletes edges touching the subtree in the same batch and restore brings them back; `{ open, total }` counted in SQL. |
| X74 | Board = dnd-kit cross-column drag only; `TaskBoard`/`TaskCard` are shared with `/tasks`, M9's person tab and M10's embed block; preference key `tasks.view` (`'LIST' \| 'BOARD'`). |
| X75 | `/tasks` page + sidebar item "งานของทีม" (X33); `GET /api/tasks` filters visibility in SQL via `visibleProjectIds`, keyset pagination 200/page; no names from invisible projects (masking test). |
| X76 | (M6) grid task rows get `blockers: { open, total }` — not in M3. |
| X77 | (M9) person-page tasks tab reuses `TaskList`/`TaskBoard` — not in M3. |
| X78 | (M10) embed blocks — not in M3. |
| X79 | PERM-23 = status-set management (M, L; Me → `FORBIDDEN`; non-member → 404); status changes and blocker add/remove use PERM-11's `edit` need. |
| X80 | Service/repo files are kebab-case (`task-tree.ts`, `my-tasks.ts`, `repo/task-assignments.ts` …); M3's v3.1 services `taskStatus.ts`, `taskStatuses.ts`, `taskBlockers.ts`, `teamTasks.ts` are the documented camelCase exception (cited by M6–M12). Do not rename either group. |
| X82 / X83 | Query keys `projectStatuses`, `teamTasksAll`, `teamTasks` (S0.10); `invalidateTasks` is the one extension point (M8 adds milestones, M10 home + embed tasks). JSON fetches use `getJson` from `src/lib/api.ts`. |
| X84 | Tab `{ id: 'tasks', order: 2 }` on M2-D10's 0/1/2/3 scale; nav ids `'my'`/`'tasks'`, `NavBadge = 'myTaskCount'` (M9 widens it); final `PRIMARY_NAV` order home, my, tasks, workload, calendar (M9 S0.9). |
| X86 | `GET /api/projects/[id]/tasks` and `…/statuses` with a malformed id → 404 `NOT_FOUND` (M2 `projectAccess`), like an invisible project; query-string errors on `GET /api/tasks` (e.g. `projectId=x`) stay 400. |
| X87 | Repo barrels `tasks`, `assignments` (= `./task-assignments`), `statuses`, `blockers`; services `tasks`, `taskTree`, `taskStatus`, `taskStatuses`, `taskBlockers`, `teamTasks`, `myTasks`, `assignments` (M3-D39); `repo.assignments.listActiveForProject` gains `version` in M6. |
| X90 / X96 | Services never read the clock: `createTask`, `setStatus`, `revertStatuses`, `deleteTaskStatus`, `restoreTaskStatusBatch` take a **required trailing `today: ISODate`**; actions pass `serverToday()`; service modules never import `clock.ts` (M3-D43). M3's task create/status actions write their audit rows in the action, in the same tx after the change (accepted by X96); the blocker services write theirs (X59 default). |
| X91 | Authz rows follow M1's `AuthzRow` (`with?: WorldPart[]`, route rows named `'GET /api/…'`); factories insert with plain Drizzle; S4 appends every new rows file to `tests/authz/rows/index.ts`. |

### 3.2 New milestone decisions (copy into `PROGRESS.md › Decisions` at kickoff)

| ID | SPEC ref | Decision | Rationale (SPEC §1.3) |
|---|---|---|---|
| M3-D1 | §12 M3, PLAN §5 | Streams refined from the skeleton: service-level integration tests are written test-first by the backend stream inside `src/server/**` (PLAN §4.1 convention); the test stream is split into **S4** (authz matrix + masking + test-first, depends only on S0) and **S5** (e2e + page objects + older-spec updates, after S2/S3/S4). | Ownership by path (PLAN §2.3) without duplicate suites; authz rows written before the actions exist (PLAN §4.1). |
| M3-D2 | BR-31, FR-603/604 | Nesting task X under an **assigned leaf** P (indent, drag, restore): if X has children → `CONFLICT` "ย้ายไม่ได้: งานแม่มีผู้รับผิดชอบอยู่ ย้ายมาได้เฉพาะงานที่ไม่มีงานย่อย"; if X and P share a user → `CONFLICT` "ย้ายไม่ได้: <ชื่อ> ถูกมอบหมายทั้งงานแม่และงานนี้ — ยกเลิกการมอบหมายที่งานแม่ก่อน"; otherwise P's assignments move to X (X keeps its own). No plan merging. | r6a M3-03 / r5 D-R5-15; keeps BR-31 without merges or dialogs. |
| M3-D3 | X20, §7.5 | Every tree action accepts an optional `transfer: { assignmentIds, fromTaskId, toTaskId }` applied **in the same transaction**; results return the transfer they applied. Undo passes the reversed transfer, redo the original. Used by `createTask` undo (`deleteTaskTree` + reversed), `restoreTaskBatch` redo, and `moveTask` undo of indent/outdent/move. | One mechanism, BR-31 never broken between two calls (CLAUDE: multi-table writes in one tx). |
| M3-D4 | FR-1201, X44, PLAN §3.4.6 | Audit granularity: one row per action call for single-entity calls; bulk calls write one row per affected root task / assignment. The BR-60 auto-added membership is recorded **inside** the assignment's audit row (`after.addedMember: userId`) rather than as a second row; the FR-404 combined op writes one `project_member` row whose `after` lists the batch and count. | "One row per user operation" (PLAN §3.4.6) and the matrix's exactly-one-row assertion. |
| M3-D5 | FR-607/608, BR-50, BR-80–82, X71 | `completeTask({ taskIds, withChildren? })` = `setStatus` to the project's first `DONE` status (BR-82) for the **open** ids; `uncompleteTask({ taskIds })` = `setStatus` to the default status (BR-81) for the **completed** ids; `withChildren` also completes open descendants; no automatic parent completion; uncomplete never cascades. Undo of any status change (incl. complete/uncomplete) restores the exact previous status **and** `completed_on` through `revertTaskStatus` (M3-D28; each date ≤ `today`). | No automation (P7); exact undo. |
| M3-D6 | FR-607 | `tasks.showCompleted` defaults to **true** (completed rows visible, struck through). When off, hide a completed task only if its whole subtree is completed (an open child keeps its completed parent visible). | FR-607 reads "ขีดฆ่า … ซ่อนเมื่อปิด"; nothing becomes unreachable. |
| M3-D7 | FR-613, X62 | Group by assignee lists **leaf** tasks under each assignee (sorted by display name, `Intl.Collator('th')`) + a "รอมอบหมาย" group of unassigned leaves, each row with its parent path. Group by certainty uses `effectiveCertainty` (แน่นอน, then อาจไม่ทำ) for all tasks. Group by status lists all tasks under their status in status `position` order (empty statuses shown with 0). Sort by due date = flat list, due asc, nulls last, then tree order. In grouped/sorted views drag handles are hidden; Tab/Shift+Tab/move menu items show the info toast "ย่อ/ดึงออก/ลากย้าย ใช้ได้เฉพาะมุมมอง "ไม่จัดกลุ่ม" และ "ลำดับเอง"" and do nothing. | Tree ops are ambiguous in groups (r6a M3-13). |
| M3-D8 | FR-1009 (basic), §8.1 | `/my` groups by project (project name, `Intl.Collator('th')`); tasks by due date asc nulls last, then `created_at`, `id`. Clicking a task navigates to `/projects/<pid>/tasks?task=<id>`. Sidebar count = number of tasks on `/my`. | X22; simplest deterministic order. |
| M3-D9 | §8.6 `N` | In M3, `N` focuses quick add on a project's tasks tab only; elsewhere it is a no-op (M6 grid, M10 home/palette later). | Only context with a "new task" target. |
| M3-D10 | FR-604, §8.9 | dnd-kit: `PointerSensor` only (no `KeyboardSensor`, whose Space/Enter pick-up collides with §8.6 Space/Enter); drag starts from a handle (⠿, `aria-label`); keyboard alternatives are Tab/Shift+Tab and the row menu "ย้ายขึ้น / ย้ายลง". `restrictToVerticalAxis` only on `<DragOverlay modifiers>` (never on `DndContext`, r4 §19). | Keyboard parity without conflicting bindings. |
| M3-D11 | X48 | The client sends **intent** (`parentId`, `afterId`), never order keys. The client may compute a provisional key with `generateKeyBetween` for its optimistic cache only; the server's key replaces it on settle. A stale `afterId` (not a live child of the target parent) → `CONFLICT` "รายการงานเปลี่ยนไปแล้ว" and the client refetches. | Server is the only key authority (r4 §20, §24). |
| M3-D12 | §7.5, BR-32 | Restore rules: 30-day window measured on DB timestamps (`deleted_at > now() - interval '30 days'`); the batch's root(s) need a live parent; the parent must not be an assigned leaf unless a `transfer` re-points its assignments in the same tx; depths are recomputed from the parent and must still fit; failures → `CONFLICT` with a reason shown as "กู้คืนไม่ได้ เพราะ<reason>". Assignment restore skips rows whose `(task_id, user_id)` already has an active assignment (count returned → toast "มีการมอบหมายใหม่แล้ว — กู้คืนแผนเดิมไม่ได้"); a restore for a user who is no longer a member needs `manage` and re-adds MEMBER (BR-60). | X62; no surprise 500s on 23505. |
| M3-D13 | FR-605, BR-31, BR-60 | `assign({ taskIds, userId })`: target must be active (not banned/deactivated); tasks with live children are skipped (single-task call → `CONFLICT` "งานที่มีงานย่อยมอบหมายไม่ได้ — มอบหมายที่งานย่อยแทน"); already-assigned tasks are skipped (idempotent, `ON CONFLICT DO NOTHING` on the partial unique index). | Predictable bulk behaviour. |
| M3-D14 | FR-404, BR-61 | `removeMember` (M2) now counts N = distinct **live** tasks of the project with an active assignment of that user (completed included) and, when N > 0, does **not** remove; it returns `{ removed: false, blockedByAssignments: N }`. `removeMemberWithAssignments` soft-deletes **all** that user's active assignments in the project (also those on soft-deleted tasks) under one batch and deletes the member row; `restoreRemovedMember` re-inserts the row (same role, `added_by`, `added_at`) and restores the batch. | Invariant "active assignment ⇒ membership" holds even across later task restores (r6a M2-04). |
| M3-D15 | FR-601/602 | Names: zod `.trim().min(1).max(500)` (JS `trim` removes NBSP, which the DB check accepts — r5 M3-01). Empty quick add = no-op on the client (no request). Multi-line paste is not split. | P1; DB check is a backstop. |
| M3-D16 | §9 (20k tasks) | No virtualization of the task list in M3 (per-project lists are small; rows are light elements). Revisit only if the M12 perf check fails. | Simplest; dnd-kit + virtualization is fragile. |
| M3-D17 | FR-611 | The panel reads the task from the project-tasks query (no extra endpoint); an id not in the list (deleted, other project, invisible) shows "ไม่พบงาน" without any name. `?task=` is written with `window.history.pushState/replaceState` (Next 16 syncs `useSearchParams`) to avoid a server round trip. | No leak; no RSC refetch per click. |
| M3-D18 | §8.6 Enter | Enter on a focused row (not editing) opens the quick-add row directly below it at the same level; Enter while renaming commits and does the same; Esc in quick add returns focus to the last created row. Tab/Shift+Tab act on the focused row (single selection; multi-selection = no-op). Rename = F2, double-click, or click on the name of an already-selected row. | Keyboard-first outliner, AC-601/602 literal. |
| M3-D19 | §8.3 mock | Collapse/expand of subtrees is in-memory per tab (ArrowLeft/ArrowRight or the ▸/▾ button), not persisted. | Not a SPEC preference; no new pref key. |
| M3-D20 | App. A.1 | Seeded tasks: `created_by` = the golden Manager; positions per project via `generateNKeysBetween(null, null, n)` in JSON order; all depth 0. | Deterministic, no BR-31 bypass (r8 D3 is M12's). |
| M3-D21 | FR-409 | Progress = completed / all non-deleted tasks of the project at every depth. | r6a M3-18. |
| M3-D22 | §8.9 | The list is a `role="treegrid"` with rows `role="row"` (`aria-level`, `aria-selected`, `aria-expanded` when it has children) and roving focus; the panel is a `<aside aria-label>`. | Accessible outliner; stable e2e selectors. |
| M3-D23 | FR-614 | Every bulk action requires all ids in **one** project (`VALIDATION` "เลือกงานจากโปรเจคเดียวกันเท่านั้น"); deleting a selection deduplicates descendants of selected rows and uses one batch / one undo entry. | Simple authz and undo. |
| M3-D24 | PLAN §1.2 | Dependencies added (Decision required by CLAUDE.md): `@dnd-kit/core 6.3.1`, `@dnd-kit/sortable 10.0.0`, `@dnd-kit/utilities 3.2.2`, `@dnd-kit/modifiers 9.0.0`, `fractional-indexing 4.0.0` (if M1 did not already add it), `@mui/x-date-pickers 9.14.0` + `dayjs 1.11.23` (if M0/M1 did not). | SPEC §7.1 stack (dnd-kit, fractional-indexing) + X50 pickers. |
| M3-D25 | FR-622, FR-627, §8.9 | Status colours come from a fixed palette of 8 (`STATUS_COLORS` in `src/domain/status.ts`: `#94A3B8` slate (SPEC DDL default), `#2F5597` blue, `#0F766E` teal, `#15803D` green, `#B45309` amber, `#C2410C` orange, `#B91C1C` red, `#7C3AED` purple), validated by zod. The chip shows the colour only as a decorative dot; its text stays in the default foreground, so contrast never depends on the chosen colour. Defaults: ยังไม่เริ่ม slate, กำลังทำ blue, รอข้อมูล amber, ติดปัญหา red, เสร็จ green. | §8.9 contrast; no free-form colours to audit. |
| M3-D26 | FR-622, BR-84 | Status names: zod `.trim()`, 1–40 chars; unique among **live** statuses of a project by `lower(name)` (partial unique index `task_statuses_name`); ≤ 12 live statuses (`MAX_STATUSES`). `validateStatusSet` reports one problem in this order: `TOO_MANY`, `DUPLICATE_NAME`, `NO_TODO`, `NO_DONE`. | Deterministic messages; DB is the backstop. |
| M3-D27 | BR-80, FR-622/623, X71 | Changing a status's category **into or out of `DONE`** while live tasks use it → `VALIDATION` (`doneCategoryInUse`, "ย้ายงานออกก่อน…") — SPEC FR-623 literal; "used" = at least one **live** task on it (soft-deleted tasks are moved along silently by the status-delete path, M3-D29). Changes between the three non-`DONE` categories are free. | P2 (exact undo), P7. |
| M3-D28 | §7.8, FR-607, P2 | `revertTaskStatus({ items: [{ taskId, statusId, completedOn }] })` (SPEC §7.8 action, PERM-11) writes exactly those values (no BR-80 recomputation) and is the undo of `setTaskStatus`, `completeTask` and `uncompleteTask`; `completedOnById` (old M3-D5) is gone. | Exact undo of dates; one undo path. |
| M3-D29 | FR-624, X72 | Status-set undo: create → `deleteTaskStatus` (unused) / redo `restoreTaskStatusBatch`; reorder → `reorderTaskStatus` back to `previousAfterId`; rename/colour/category → no global undo entry (like text edits, r6a M3-11); delete → `restoreTaskStatusBatch({ batch, moveToStatusId, moved })` where each `moved` item also carries the task's previous `completedOn` so a `DONE` status restores exact dates. Soft-deleted tasks still pointing at the deleted status are moved too (not listed in `moved`) so a later task restore never references a deleted status. | X72 made exact for BR-80. |
| M3-D30 | FR-624, CLAUDE.md UX | Deleting a used status opens an MUI `Popover` (destination `Select` + "ย้ายแล้วลบ") anchored to the delete button — a choice, not a confirmation; the `Select` is preselected with the default status (BR-81) computed over the remaining live statuses, i.e. `defaultStatus(live minus the deleted one)` (FR-624 "default = สถานะเริ่มต้น"); unused statuses delete immediately with undo. "+ เพิ่มสถานะ" inserts right before the first `DONE` status with category `WAITING` and colour amber. | Only one confirm dialog in the product (FR-407). |
| M3-D31 | FR-640, P2, §7.8 | Blocker undo: undo of add = `removeTaskBlocker`; undo of remove = `addTaskBlocker` on the same pair (re-validated; a failure shows `restoreFailed`). `removeTaskBlocker` soft-deletes the edge with `deleted_batch = null` (SPEC §7.8: "batch ใช้เฉพาะตอนลบ task ทั้งกิ่ง"), so a later `restoreTaskBatch` never resurrects a hand-removed edge; there is no restore-by-batch action for single edges (X73). The picker pre-excludes self, ancestors/descendants and current blockers; the server re-checks. | Smallest action set. |
| M3-D32 | BR-85, D12 | Adding an existing edge is idempotent (returns it, `created: false`, no audit). Blocker in another project → `VALIDATION crossProject` when visible, else `NOT_FOUND` (BR-33 pattern). Cycle messages use same-project task names only. `pg_advisory_xact_lock(hashtext('task_blockers:' || projectId))` serialises cycle checks. | No leak; no race (R23). |
| M3-D33 | FR-665/666, X75 | `/tasks`: filters live in the URL (`history.replaceState`), not in preferences; defaults `includeDone=0`; archived projects excluded (as `/my`); order `coalesce(due_date, 'infinity')`, `project_id`, `position`, `id` with keyset pagination (200, "โหลดเพิ่ม" button); `projectId` of an invisible project → 404; no bulk actions on `/tasks` (M3-D23 single-project rule); the view toggle shares `tasks.view`. | Simple, shareable, bounded payloads. |
| M3-D34 | AC-616 | Golden memberships have no worker who is a member of POS only (r8 N5: POS = Cindy, Ivy, Mint; DW = Peter; Mobile = Jack, Mint; CRM = Cindy, Ivy; Store = Peter, Jack). E2E E20 uses Peter (DW + Store) with the same assertion; the int masking test uses world `outsider` (Q only). | Literal intent of AC-616 with real data. |
| M3-D35 | FR-662, §8.9 | Board keyboard: cards are focusable (roving `tabIndex`, arrows move between cards/columns), Enter/Space opens the panel, `S` opens `StatusMenu`, Mod+Enter toggles done; dragging is pointer-only (handle, `PointerSensor distance 4`, as M3-D10) — the `S` menu is the keyboard path for moving a card. | Keyboard parity without dnd-kit KeyboardSensor. |
| M3-D36 | §6.2 DDL | Composite FKs (`tasks (project_id, status_id)`, `task_blockers (project_id, task_id)` and `(project_id, blocker_task_id)`), `unique (project_id, id)` on `task_statuses`/`tasks` and the `lower(name)` expression index are declared in `schema.ts` with `foreignKey({ name, columns, foreignColumns })`, `unique(name).on(...)` and ``uniqueIndex(name).on(t.projectId, sql`lower(${t.name})`)`` **[uncertain]**. If S0.3 shows drizzle-kit does not emit one of them (or re-diffs it on every generate), that object moves to **one** custom migration `pnpm exec drizzle-kit generate --custom --name=task_status_constraints` (CLAUDE.md DB rule) and the schema keeps a comment; record the Decision. | Follow the DB rule; never hand-edit generated SQL. |
| M3-D37 | §7.8, X21 | `ProjectTasksResponse` carries `statuses`, `blockerEdges` and per-task `blockers` counts (same project — no leak) so the list, board and panel need no extra request. `TaskCard` omits SPEC §7.8's `milestoneId` until M8 adds the column (X21 "no stubs"; G2 grep for "milestone"). | One request per view; X21. |
| M3-D38 | §4.6.1, FR-620 | A task's status is independent of its children (a parent has its own status; no roll-up — FR-620 literal). Only the FR-608 prompt links them, and only for `DONE` targets. | P7 no automation. |
| M3-D39 | PLAN §3.4.5, G24, C32 | Server namespaces (barrels, `export * as`): `src/server/repo/index.ts` gains `tasks` (`./tasks`), **`assignments`** (`./task-assignments`), `statuses` (`./task-statuses`), `blockers` (`./task-blockers`); `src/server/services/index.ts` gains `tasks`, `taskTree` (`./task-tree`), `taskStatus`, `taskStatuses`, `taskBlockers`, `teamTasks`, `myTasks` (`./my-tasks`), `assignments`. The project task list loader is **`repo.tasks.listLiveWithBlockerCounts(tx, projectId)`** (S0.7/S2.10: live task rows incl. `completedWeek`, `statusCategory`, `blockersOpen`, `blockersTotal`, no assignees) + `repo.assignments.listActiveForProject(tx, projectId)`; M6 reuses the first and adds `repo.assignments.listActiveForTasks`/`bumpVersions` beside the second. | One name per concept for M6/M7/M9 (r6b, m06 S2.2). |
| M3-D40 | X15, X33, M2-D10, M0 nav | Nav entries in M0's `src/components/shell/nav.ts`: `NavIcon` gains `'my' \| 'teamTasks'`; `NavItem` gains **`badge?: NavBadge`** with `export type NavBadge = 'myTaskCount'` (M9 widens it to `'myTaskCount' \| 'workloadOver'`, m09 S0.9); items `{ id: 'my', href: '/my', label: th.nav.my, icon: 'my', badge: 'myTaskCount' }` then `{ id: 'tasks', href: '/tasks', label: th.nav.teamTasks, icon: 'teamTasks' }`. Project tab = `{ id: 'tasks', order: 2, label: th.projects.tabs.tasks }` in M2's `PROJECT_TABS` (M2-D10 scale ภาพรวม 0 · แผนงาน 1 · งาน 2 · เอกสาร 3). | Data-driven nav/tab config, names later plans already use (m09 "after `tasks`"). |
| M3-D41 | FR-665, C33 | `TeamTasks` keeps all filters in one state object `TeamTaskFilters` (= `z.input<typeof teamTasksQuerySchema>` minus `cursor`) owned by `useTeamTaskFilters({ syncUrl })`; the component prop **`syncUrl?: boolean`** (default `true`) turns the `history.replaceState` mirroring off. M8 adds a `milestoneId` key, M9 adds `fixedUserId`/`forcedView`/`hint` props and passes `syncUrl={false}` — neither needs to restructure M3's code. | Additive extension points without stubs. |
| M3-D42 | C21, C26, C29 | Forward compatibility: every action result is an **object** so later milestones add fields (`SetTaskStatusResult.released` in M6, `TaskDTO.milestoneId`/`lateForMilestone` and `TaskCard.milestoneId` in M8); `invalidateTasks` is a list that M8 extends with `qk.projectMilestones`. Exact-key assertions on `TaskDTO`/`TaskCard`/responses and the G2 `grep milestone` check are **M3-only** checks — M8 updates them (m08 S2/S5.4) and they are not regressions. Component props are open the same way: the `TaskCard` component gains optional `milestone?` (M8 S4.7), `TaskList` gains optional `embed?: TaskListEmbedOptions` (M10-D9), `TeamTasks` gains `fixedUserId`/`forcedView`/`hint` (M9); `invalidateTasks` also gains M10's home + embed-tasks keys (X82); `repo.assignments.listActiveForProject` rows gain `version` (M6, X87) — so M3 writes no exact-key assertion on that repo row. | No rework when M6/M8 extend the contracts. |
| M3-D43 | X45, X56, X90, X96, M12-D34/D35 | **Clock-free services, audit placement.** Every M3 service that needs "today" takes it as a **required trailing parameter** `today: ISODate` — `services.tasks.createTask(tx, user, a, today)`, `services.taskStatus.setStatus(tx, user, a, today)`, `revertStatuses(tx, user, a, today)`, `services.taskStatuses.deleteTaskStatus(tx, user, a, today)`, `restoreTaskStatusBatch(tx, user, a, today)` — and no file under `src/server/services/**` imports `@/server/clock` (which imports `server-only`, X56); the actions call `serverToday()` and pass it; integration tests pass `'2026-09-30'` (or the date they test). No optional parameter with a clock fallback. Audit: the task, assignment, member and status actions write their audit row **in the action**, inside the same transaction, after the service and before returning (X96 accepts this placement; scripts mirror it through M12's `AUDIT_IN_SERVICE`, M12-D34); `addTaskBlocker`/`removeTaskBlocker` write theirs **in the service** (X59 default) because only the service knows whether an edge was created (`created: false` → no row). | Scripts (M12 `seed:demo`) import these services under tsx; one placement rule per action, pinned for M12's audit sweep. |

No SPEC **DEVIATION** in M3. (SPEC §12 M3 lists "undo stack"; it already exists from M1 per X04 — M3 uses it, which is a re-sequencing, not a deviation.)

---

## 4. Streams (machine-readable)

DAG: `S0 → {S1, S2, S4}`; `S1 → S3`; `{S2, S3, S4} → S5`. S0 runs alone, so it may also touch the few M1/M2 files its steps name outside the globs below (preference-key schema, sidebar/members contract types, `AppProviders`, the constants block of `src/domain/status.ts`); after G0 those files belong to the stream whose globs cover them (`src/domain/status.ts` → S1, `src/server/repo/index.ts` and `services/sidebar.ts` → S2, `src/lib/shortcuts.ts` → S3). If M0's nav config or M1's preference schema lives outside S3's globs, S3 files a `request`. Concurrent sets: {S1, S2, S4}, then S3 alongside the remainder of S2/S4 — their `owns` never overlap. `src/i18n/th.ts` belongs to S0; afterwards S2 may add keys only in `audit`/`errors`, S3 only in `tasks` (incl. `tasks.status`, `tasks.blockers`, `tasks.board`, `tasks.view`), `teamTasks`, `my`, `shortcuts`, `members.assignmentsBlock`, `nav` (PLAN §2.3, Edit tool only).

```json
{ "milestone": 3,
  "streams": [
    { "id": "S0", "title": "Contracts: deps, task_statuses/tasks/task_blockers/task_assignments schema + migration, zod schemas, DTOs, authz/action/route stubs, repo inserts, query keys, invalidation, temp ids, shortcut registry, i18n, factories + world 'tasks'", "agent": "backend-engineer",
      "owns": ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "src/server/db/schema.ts", "src/server/db/schema.int.test.ts", "drizzle/**", "src/domain/types.ts", "src/domain/status.ts", "src/lib/schemas/**", "src/lib/contracts/**", "src/lib/query-keys.ts", "src/lib/invalidate.ts", "src/lib/temp-id.ts", "src/lib/temp-id.test.ts", "src/lib/shortcuts.ts", "src/lib/shortcuts.test.ts", "src/i18n/th.ts", "src/server/authz.ts", "src/server/actions/tasks.ts", "src/server/actions/assignments.ts", "src/server/actions/members.ts", "src/server/actions/task-statuses.ts", "src/server/actions/task-blockers.ts", "src/server/repo/index.ts", "src/server/repo/tasks.ts", "src/server/repo/task-assignments.ts", "src/server/repo/task-statuses.ts", "src/server/repo/task-blockers.ts", "src/server/services/sidebar.ts", "src/app/api/projects/[id]/tasks/route.ts", "src/app/api/projects/[id]/statuses/route.ts", "src/app/api/tasks/route.ts", "src/app/api/tasks/my/route.ts", "src/components/providers/**", "tests/helpers/**"],
      "dependsOn": [], "planSection": "5.S0" },
    { "id": "S1", "title": "Domain certainty.ts, status.ts, blockers.ts + pure tree projection/ops, task-list and board helpers (TDD)", "agent": "domain-engineer",
      "owns": ["src/domain/certainty.ts", "src/domain/certainty.test.ts", "src/domain/status.ts", "src/domain/status.test.ts", "src/domain/blockers.ts", "src/domain/blockers.test.ts", "src/lib/tree/**", "src/lib/tasks/**"],
      "dependsOn": ["S0"], "planSection": "5.S1" },
    { "id": "S2", "title": "Task, status, blocker, assignment, my-tasks, team-tasks and FR-404 backend: authz bodies, repo, services, actions, routes, seed, service integration tests", "agent": "backend-engineer",
      "owns": ["src/server/authz.ts", "src/server/repo/**", "src/server/services/**", "src/server/actions/**", "src/app/api/**", "scripts/**"],
      "dependsOn": ["S0"], "planSection": "5.S2" },
    { "id": "S3", "title": "Tasks tab outliner, SortableTree, task panel, DateField, assignee picker, bulk bar, /my, ? help, FR-404 toast, nav + tab + progress, status chip/menu, board, blockers UI, status settings, /tasks", "agent": "frontend-engineer",
      "owns": ["src/app/(app)/**", "src/components/**", "src/hooks/**", "src/lib/shortcuts.ts"],
      "dependsOn": ["S0", "S1"], "planSection": "5.S3" },
    { "id": "S4", "title": "Authorization matrix rows (test-first), masking leak cases, world extensions", "agent": "test-engineer",
      "owns": ["tests/**"],
      "dependsOn": ["S0"], "planSection": "5.S4" },
    { "id": "S5", "title": "E2E m3-tasks spec, page objects, update older specs", "agent": "test-engineer",
      "owns": ["e2e/**"],
      "dependsOn": ["S2", "S3", "S4"], "planSection": "5.S5" }
  ],
  "e2e": ["e2e/m3-tasks.spec.ts"] }
```

---

## 5. Step-by-step

### 5.S0 — Contracts (backend-engineer · owns: see §4 S0)

Runs alone. Ends at **G0** (`pnpm check` green with stubs). Nothing here implements behaviour except the schema, the migration, the repo insert helpers, factories, i18n and the registry.

**S0.1 Preflight + dependencies (one batch).**
- `git status` clean, `pnpm db:up`, `pnpm check` green on the M2 tag.
- Read `package.json`; install **only the missing ones**, in one command (versions from PLAN §1.2, M3-D24):
  ```bash
  pnpm add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2 @dnd-kit/modifiers@9.0.0 \
           fractional-indexing@4.0.0 @mui/x-date-pickers@9.14.0 dayjs@1.11.23
  ```
  None has an install script, so `pnpm-workspace.yaml › allowBuilds` is unchanged; commit any `minimumReleaseAgeExclude` lines pnpm adds.
- Done-check: `pnpm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers fractional-indexing @mui/x-date-pickers dayjs` shows exactly those versions.

**S0.2 Schema (`src/server/db/schema.ts`)** — SPEC §6.2 minus `milestone_id` (X10, X21), with PLAN §1.3 corrections (`orderKey`, `timestamptz`, named indexes). Reuse the existing `orderKey` customType (M1, `snippets/r4/db/order-key.schema.ts`), the `certainty` pgEnum (M2), `user`, `projects`. If `Certainty`/`ISODate` are not yet exported from `src/domain/types.ts`, add `export type Certainty = 'CONFIRMED' | 'TENTATIVE'` there.
```ts
import { type AnyPgColumn, check, date, foreignKey, index, integer, pgEnum, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const taskStatusCategory = pgEnum('task_status_category', ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE'])

export const taskStatuses = pgTable('task_statuses', {          // SPEC v3.1 §6.2 (X70)
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#94A3B8'),
  category: taskStatusCategory('category').notNull(),
  position: orderKey('position').notNull(),                      // board column order (X48)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('task_statuses_name_check', sql`length(trim(${t.name})) > 0`),
  unique('task_statuses_project_id_id_key').on(t.projectId, t.id),                       // target of the composite FK (BR-83) [uncertain, M3-D36]
  uniqueIndex('task_statuses_name').on(t.projectId, sql`lower(${t.name})`).where(sql`${t.deletedAt} is null`),   // [uncertain, M3-D36]
  index('task_statuses_project_id_position_idx').on(t.projectId, t.position).where(sql`${t.deletedAt} is null`),
])

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
  depth: smallint('depth').notNull().default(0),
  name: text('name').notNull(),
  notes: text('notes'),
  startDate: date('start_date', { mode: 'string' }),
  dueDate: date('due_date', { mode: 'string' }),
  certaintyOverride: certainty('certainty_override'),            // the M2 pgEnum('certainty', …)
  // milestone_id: added by M8 (X10/X21) — do not add here
  statusId: uuid('status_id').notNull(),                         // composite FK below (BR-83, X70)
  completedOn: date('completed_on', { mode: 'string' }),         // set/cleared with the status category (BR-80)
  completedWeek: date('completed_week', { mode: 'string' })
    .generatedAlwaysAs(sql`(date_trunc('week', completed_on::timestamp)::date)`),   // r2 §9.2 verified
  completedBy: text('completed_by').references(() => user.id),
  position: orderKey('position').notNull(),                      // text COLLATE "C" (X48)
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('tasks_depth_check', sql`${t.depth} between 0 and 2`),
  check('tasks_name_check', sql`length(trim(${t.name})) > 0`),
  check('tasks_dates_check', sql`${t.dueDate} is null or ${t.startDate} is null or ${t.dueDate} >= ${t.startDate}`),
  index('tasks_project_id_parent_id_position_idx').on(t.projectId, t.parentId, t.position).where(sql`${t.deletedAt} is null`),
  index('tasks_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
  index('tasks_status_id_idx').on(t.statusId).where(sql`${t.deletedAt} is null`),
  unique('tasks_project_id_id_key').on(t.projectId, t.id),                                // target for task_blockers [uncertain, M3-D36]
  foreignKey({ name: 'tasks_status_fk', columns: [t.projectId, t.statusId],
               foreignColumns: [taskStatuses.projectId, taskStatuses.id] }),               // BR-83 [uncertain, M3-D36]
])

export const taskAssignments = pgTable('task_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBatch: uuid('deleted_batch'),
}, (t) => [
  uniqueIndex('task_assignments_active').on(t.taskId, t.userId).where(sql`${t.deletedAt} is null`),
  index('task_assignments_user_id_idx').on(t.userId).where(sql`${t.deletedAt} is null`),
])

export const taskBlockers = pgTable('task_blockers', {          // SPEC v3.1 §6.2 (X73)
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  taskId: uuid('task_id').notNull(),                             // the blocked task
  blockerTaskId: uuid('blocker_task_id').notNull(),              // the task that blocks it
  createdBy: text('created_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBatch: uuid('deleted_batch'),
}, (t) => [
  check('task_blockers_not_self', sql`${t.taskId} <> ${t.blockerTaskId}`),
  foreignKey({ name: 'task_blockers_task_fk', columns: [t.projectId, t.taskId], foreignColumns: [tasks.projectId, tasks.id] }).onDelete('cascade'),
  foreignKey({ name: 'task_blockers_blocker_fk', columns: [t.projectId, t.blockerTaskId], foreignColumns: [tasks.projectId, tasks.id] }).onDelete('cascade'),
  uniqueIndex('task_blockers_active').on(t.taskId, t.blockerTaskId).where(sql`${t.deletedAt} is null`),
  index('task_blockers_blocker_task_id_idx').on(t.blockerTaskId).where(sql`${t.deletedAt} is null`),
])
```
No custom migration is needed for `pg_trgm` (M0 `0000_extensions`). The composite FKs, `unique().on(...)` and the `lower(name)` expression index are **[uncertain]** in drizzle-kit (not in r2 §12 / r6a E-12): S0.3 inspects the SQL and moves anything drizzle-kit cannot emit into one custom migration (M3-D36). `tasks.status_id` has no `ON DELETE` action: statuses are only soft-deleted, and a project delete removes both tables in the same statement (NO ACTION is checked at statement end).

**S0.3 Migration + schema test.**
- `pnpm db:generate --name=tasks` → one new journaled file `drizzle/<NNNN>_tasks.sql`. Inspect it: `"position" text COLLATE "C" NOT NULL`, `"completed_week" date GENERATED ALWAYS AS ((date_trunc('week', completed_on::timestamp))::date) STORED`, the 3 checks, the self-FK `ON DELETE cascade`, `USING gin ("name" gin_trgm_ops)`, the partial unique index. Never hand-edit it. `pnpm db:migrate`; run `pnpm db:generate` again → "No schema changes, nothing to migrate".
- Extend `src/server/db/schema.int.test.ts` (tests first, then migrate until green):
  - `describe('tasks')`: `attcollation` of `tasks.position` is `C` (`select c.collname from pg_attribute a join pg_collation c on c.oid = a.attcollation where a.attrelid = 'tasks'::regclass and a.attname = 'position'` → `'C'`); `completed_on '2026-10-04'` → `completed_week '2026-09-28'`; `'2027-01-01'` → `'2026-12-28'`; `null` → `null`; writing `completed_week` → `428C9`; `depth = 3` → `23514`; `name = '   '` → `23514`; `due_date < start_date` → `23514`; `tasks_name_trgm` present in `pg_indexes`.
  - `describe('task_assignments')`: a second active `(task_id, user_id)` → `23505` (`task_assignments_active`); after `deleted_at = now()` on the first, inserting again succeeds; deleting the task cascades its assignments.
  - `describe('task_statuses')` (v3.1): the migration SQL contains `CREATE TYPE "public"."task_status_category"`, `UNIQUE("project_id","id")` on `task_statuses` and `tasks`, `tasks_status_fk` on `(project_id, status_id)` and an index on `lower("name")` — anything missing → custom migration (M3-D36) before continuing; `'Done'` then `'done'` live in one project → `23505` (`task_statuses_name`), allowed again after soft-deleting the first and in another project; `name = '  '` → `23514`; a task whose `status_id` belongs to another project → `23503` (BR-83); `DELETE FROM projects` cascades statuses, tasks and edges in one statement.
  - `describe('task_blockers')`: `task_id = blocker_task_id` → `23514`; an edge whose tasks are in different projects → `23503`; a second live identical edge → `23505` (`task_blockers_active`), allowed after soft-deleting the first; deleting either task cascades the edge.
- Done-check: `pnpm vitest run --project integration src/server/db/schema.int.test.ts`.

**S0.4 Zod schemas (`src/lib/schemas/tasks.ts`)** — shared by forms and actions (r4 §29–§30).
```ts
import { z } from '@/lib/z'
import { th } from '@/i18n/th'
import { compareISO } from '@/domain/dates'

export const zUserId = z.string().min(1).max(64)                 // Better Auth text ids
export const zCertainty = z.enum(['CONFIRMED', 'TENTATIVE'])
export const zTaskName = z.string().trim().min(1, { error: th.tasks.errors.nameRequired }).max(500, { error: th.tasks.errors.nameTooLong })
const zTaskIds = z.array(z.uuid()).min(1).max(500)
export const zTransfer = z.object({ assignmentIds: z.array(z.uuid()).min(1).max(100), fromTaskId: z.uuid(), toTaskId: z.uuid() })

export const createTaskSchema = z.object({
  projectId: z.uuid(),
  parentId: z.uuid().nullable().default(null),
  afterId: z.uuid().nullable().optional(),                        // undefined = append at end, null = first
  name: zTaskName,
  statusId: z.uuid().optional(),                                  // column quick add (FR-664); default = BR-81
})
export const taskPatchSchema = z.object({
  name: zTaskName.optional(),
  notes: z.string().max(10_000).transform((s) => (s.trim() === '' ? null : s)).nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  certaintyOverride: zCertainty.nullable().optional(),
}).refine((p) => Object.values(p).some((v) => v !== undefined))
  .refine((p) => !p.startDate || !p.dueDate || compareISO(p.dueDate, p.startDate) >= 0,
    { error: th.tasks.errors.dueBeforeStart, path: ['dueDate'] })
export const updateTaskSchema = z.object({ taskId: z.uuid(), patch: taskPatchSchema })
export type TaskPatch = z.input<typeof taskPatchSchema>
export const taskRefSchema = z.object({ taskId: z.uuid() })                                   // indent / outdent
export const moveTaskSchema = z.object({ taskId: z.uuid(), parentId: z.uuid().nullable(), afterId: z.uuid().nullable(), transfer: zTransfer.optional() })
export const completeTaskSchema = z.object({ taskIds: zTaskIds, withChildren: z.boolean().default(false) })
export const uncompleteTaskSchema = z.object({ taskIds: zTaskIds })
export const deleteTaskTreeSchema = z.object({ taskIds: zTaskIds, transfer: zTransfer.optional() })
export const restoreTaskBatchSchema = z.object({ batch: z.uuid(), transfer: zTransfer.optional() })
export const assignSchema = z.object({ taskIds: zTaskIds, userId: zUserId })
export const unassignSchema = z.object({ assignmentIds: z.array(z.uuid()).min(1).max(500) })
export const restoreAssignmentBatchSchema = z.object({ batch: z.uuid() })
export const removeMemberWithAssignmentsSchema = z.object({ projectId: z.uuid(), userId: zUserId })
export const restoreRemovedMemberSchema = z.object({
  projectId: z.uuid(), userId: zUserId, batch: z.uuid().nullable(),
  member: z.object({ role: z.enum(['LEAD', 'MEMBER']), addedBy: zUserId.nullable(), addedAt: z.iso.datetime({ offset: true }) }),
})

// ── SPEC v3.1: statuses, blockers, team tasks (§7.8) ──
export const zStatusCategory = z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'DONE'])
export const zStatusColor = z.enum(STATUS_COLORS)                // import { STATUS_COLORS } from '@/domain/status' — constants block written by S0.5a (M3-D25)
export const zStatusName = z.string().trim().min(1, { error: th.tasks.status.errors.nameRequired }).max(40, { error: th.tasks.status.errors.nameTooLong })
export const setTaskStatusSchema = z.object({ taskIds: zTaskIds, statusId: z.uuid(), withChildren: z.boolean().default(false) })
export const revertTaskStatusSchema = z.object({ items: z.array(z.object({ taskId: z.uuid(), statusId: z.uuid(), completedOn: z.iso.date().nullable() })).min(1).max(500) })   // M3-D28
export const createTaskStatusSchema = z.object({ projectId: z.uuid(), name: zStatusName, category: zStatusCategory, color: zStatusColor, afterId: z.uuid().nullable().optional() })
export const updateTaskStatusSchema = z.object({ statusId: z.uuid(), patch: z.object({ name: zStatusName.optional(), category: zStatusCategory.optional(), color: zStatusColor.optional() })
  .refine((p) => Object.values(p).some((v) => v !== undefined)) })
export const reorderTaskStatusSchema = z.object({ statusId: z.uuid(), afterId: z.uuid().nullable() })
export const deleteTaskStatusSchema = z.object({ statusId: z.uuid(), moveToStatusId: z.uuid().optional() })
export const restoreTaskStatusBatchSchema = z.object({ batch: z.uuid(), moveToStatusId: z.uuid().nullable(),
  moved: z.array(z.object({ taskId: z.uuid(), fromStatusId: z.uuid(), completedOn: z.iso.date().nullable() })).max(20_000) })   // X72 + M3-D29
export const addTaskBlockerSchema = z.object({ taskId: z.uuid(), blockerTaskId: z.uuid() })
  .refine((v) => v.taskId !== v.blockerTaskId, { error: th.tasks.blockers.errors.self, path: ['blockerTaskId'] })
export const removeTaskBlockerSchema = z.object({ blockerId: z.uuid() })                       // task_blockers.id
export const teamTasksQuerySchema = z.object({                                                  // GET /api/tasks (X75, M3-D33)
  projectId: z.uuid().optional(), userId: zUserId.optional(), positionId: z.uuid().optional(),
  category: z.array(zStatusCategory).optional(), blocked: z.stringbool().default(false),
  includeDone: z.stringbool().default(false), cursor: z.string().max(400).optional(),
})
```
Unit test `src/lib/schemas/tasks.test.ts` (S0 writes it): `'  งาน ก  '` → `'งาน ก'`; `' '` → error `th.tasks.errors.nameRequired`; 501 chars → `nameTooLong`; `startDate '2026-10-05', dueDate '2026-10-01'` → error at `patch.dueDate`; `'2026-02-30'` rejected; `'11111111-1111-1111-1111-111111111111'` rejected as uuid; v3.1: `zStatusName` trims and rejects 41 chars; `zStatusColor` rejects `'#123456'`; `addTaskBlockerSchema` with equal ids → error `th.tasks.blockers.errors.self`; `teamTasksQuerySchema` parses `blocked: '1'`/`'true'` → `true`, missing → `false` (`z.stringbool` [uncertain] in Zod 4 — fall back to `z.enum(['0','1']).transform(...)` if absent, r4 §29).

**S0.5 Shared DTOs (`src/lib/contracts/tasks.ts`)** — the API speaks these; no DB row types cross the wire.
```ts
import type { Certainty, ISODate, TaskStatusCategory } from '@/domain/types'
export type TaskDepth = 0 | 1 | 2
export interface TaskAssigneeDTO { assignmentId: string; userId: string }
export interface TaskDTO {
  id: string; projectId: string; parentId: string | null; depth: TaskDepth; position: string
  name: string; notes: string | null; startDate: ISODate | null; dueDate: ISODate | null
  certaintyOverride: Certainty | null; completedOn: ISODate | null; assignees: TaskAssigneeDTO[]
  statusId: string; blockers: { open: number; total: number }        // BR-86 counts from SQL (X73)
}
export interface TaskStatusDTO { id: string; projectId: string; name: string; color: string; category: TaskStatusCategory; position: string }
export type StatusRef = Pick<TaskStatusDTO, 'id' | 'name' | 'color' | 'category'>
export interface BlockerEdgeDTO { id: string; taskId: string; blockerTaskId: string }   // taskId is blocked by blockerTaskId
export interface ProjectTasksResponse {
  project: { id: string; name: string; certainty: Certainty; archived: boolean }
  viewer: { role: 'MANAGER' | 'LEAD' | 'MEMBER'; canEdit: boolean; canManage: boolean }   // canEdit = !archived; canManage = M/L && !archived
  members: { userId: string; role: 'LEAD' | 'MEMBER' }[]
  tasks: TaskDTO[]                                   // flat, live tasks only (X62); client builds the tree
  statuses: TaskStatusDTO[]                          // live statuses of the project, ORDER BY position, id (M3-D37)
  blockerEdges: BlockerEdgeDTO[]                     // live edges between live tasks of this project (same project only, D12)
}
export interface AssignmentTransfer { assignmentIds: string[]; fromTaskId: string; toTaskId: string }
export interface TreePlacement { parentId: string | null; afterId: string | null }
export interface CreateTaskResult { task: TaskDTO; transfer: AssignmentTransfer | null }
export interface UpdateTaskResult { task: TaskDTO }
export type TreeMoveResult =
  | { changed: false }
  | { changed: true; task: TaskDTO; previous: TreePlacement; transfer: AssignmentTransfer | null }
export interface SetTaskStatusResult {               // setTaskStatus, completeTask, uncompleteTask, revertTaskStatus (X71, M3-D28)
  projectId: string; statusId: string | null         // null for revertTaskStatus (per-item targets)
  changed: { taskId: string; previous: { statusId: string; completedOn: ISODate | null } }[]
  openDescendantIds: string[]                        // FR-608 prompt (single task, DONE target, !withChildren)
  // M6 appends `released: ReleasedLoad | null` (M6-D16, C21) — do not add it here
}
export interface DeleteTaskTreeResult { projectId: string; batch: string; rootIds: string[]; deletedIds: string[]; transfer: AssignmentTransfer | null }
export interface RestoreTaskBatchResult { projectId: string; restoredIds: string[]; transfer: AssignmentTransfer | null }
export interface AssignResult { projectId: string; created: { assignmentId: string; taskId: string }[]; addedMember: boolean; skippedParentIds: string[]; alreadyAssignedIds: string[] }
export interface UnassignResult { projectId: string; batch: string; taskIds: string[] }
export interface RestoreAssignmentBatchResult { projectId: string; restored: { assignmentId: string; taskId: string }[]; skipped: number }
export interface RemovedMemberSnapshot { role: 'LEAD' | 'MEMBER'; addedBy: string | null; addedAt: string }
export interface RemoveMemberWithAssignmentsResult { batch: string | null; member: RemovedMemberSnapshot; unassignedTaskCount: number }
export interface RestoreRemovedMemberResult { restoredAssignments: number; skipped: number }
export interface MyTaskDTO { id: string; projectId: string; name: string; parentName: string | null; startDate: ISODate | null; dueDate: ISODate | null; status: StatusRef }
export interface MyTasksResponse { groups: { project: { id: string; name: string; color: string; certainty: Certainty }; tasks: MyTaskDTO[] }[]; count: number }
// ── SPEC v3.1 ──
export interface ProjectStatusesResponse { statuses: TaskStatusDTO[]; usage: Record<string, number>; canManage: boolean }
export interface ReorderTaskStatusResult { status: TaskStatusDTO; previousAfterId: string | null }
export interface DeleteTaskStatusResult { projectId: string; batch: string; moveToStatusId: string | null; moved: { taskId: string; fromStatusId: string; completedOn: ISODate | null }[] }
export interface RestoreTaskStatusBatchResult { projectId: string; status: TaskStatusDTO; restored: number; skipped: number }
export interface AddTaskBlockerResult { projectId: string; edge: BlockerEdgeDTO; created: boolean }
export interface RemoveTaskBlockerResult { projectId: string; edgeId: string; taskId: string; blockerTaskId: string }   // no batch (M3-D31, §7.8)
export interface TaskCard {                          // SPEC §7.8 minus milestoneId (M8, M3-D37)
  id: string; projectId: string; name: string; parentPath: string[]; status: StatusRef
  assigneeIds: string[]; dueDate: ISODate | null; certainty: Certainty; completed: boolean
  blockers: { open: number; total: number }          // counts only — names only in the project's own panel
}
export interface TeamTasksResponse {
  cards: TaskCard[]
  projects: { id: string; name: string; color: string }[]          // only visible projects present in `cards`
  statusesByProject: Record<string, TaskStatusDTO[]>                 // same projects only (status menus, FR-666)
  nextCursor: string | null
}
```
`Certainty`, `ISODate` and (v3.1) `TaskStatusCategory` are exported from `src/domain/types.ts` (S0 adds `export type TaskStatusCategory = 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE'`; `src/domain/status.ts` re-uses it). Also add `myTaskCount: number` to M2's `SidebarResponse` in `src/lib/contracts/sidebar.ts` (and `removed: boolean` to M2's `removeMember` result type if it lives in contracts).

Forward compatibility (M3-D42): later milestones extend these types **additively** — M6 adds `released: ReleasedLoad | null` to `SetTaskStatusResult` (m06 S0, M6-D16; `services/taskStatus.ts#setStatus` fills it); M8 adds `milestoneId`/`lateForMilestone` to `TaskDTO`, `milestones` to `ProjectTasksResponse`, `milestoneId` to `TaskCard` and `milestonesByProject` to `TeamTasksResponse` (m08 S0). Keep every result an object and never spread a result into a strictly-typed literal elsewhere.

**S0.5a Status constants (`src/domain/status.ts`, constants only).** S0 writes only the constants block of S1.5 verbatim — `MAX_STATUSES`, `STATUS_COLORS`, `DEFAULT_STATUSES` (with `import type { TaskStatusCategory } from './types'`) — because S0.4 (`zStatusColor`), S0.15 (`makeStatuses`) and S2.14 (`ensureProjectStatuses`) import them. No functions; S1 adds them test-first in the same file and owns it after G0.

**S0.6 Authz signatures (`src/server/authz.ts`, bodies by S2).** Keep PLAN §3.4.4 names; add two helpers for multi-id inputs (blueprint addition, §9 R-AUTHZ). Stub bodies call a local `notImplemented(name: string, ...args: unknown[]): never` with their parameters so `no-unused-vars` stays green at G0 (shown abbreviated below as `throw`):
```ts
export type ProjectAccessInfo = { role: 'MANAGER' | 'LEAD' | 'MEMBER'; archived: boolean }
/** live task → its project → requireProject(need). Missing/deleted task or invisible project → NotFoundError. */
export async function requireTask(tx: DbOrTx, user: SessionUser, taskId: string, need: Need): Promise<{ task: TaskRow } & ProjectAccessInfo> { notImplemented('requireTask (M3 S2)') }
/** all live; any missing or invisible → 404; more than one project → ValidationError(th.tasks.errors.sameProjectOnly); then requireProject(need). */
export async function requireTasks(tx: DbOrTx, user: SessionUser, taskIds: readonly string[], need: Need): Promise<{ projectId: string; tasks: TaskRow[] } & ProjectAccessInfo> { notImplemented('requireTasks (M3 S2)') }
/** active or batch-deleted assignment rows → their live tasks → one project → requireProject(need). */
export async function requireAssignments(tx: DbOrTx, user: SessionUser, assignmentIds: readonly string[], need: Need): Promise<{ projectId: string; rows: AssignmentRow[] } & ProjectAccessInfo> { notImplemented('requireAssignments (M3 S2)') }
/** v3.1: live status (or a batch-deleted one when includeDeleted) → its project → requireProject(need). Missing or invisible → NotFoundError. PERM-23 callers pass 'manage' (X79). */
export async function requireStatus(tx: DbOrTx, user: SessionUser, statusId: string, need: Need, o?: { includeDeleted?: boolean }): Promise<{ status: TaskStatusRow } & ProjectAccessInfo> { notImplemented('requireStatus (M3 S2)') }
```

**S0.7 Repo insert helpers (needed by the seed; factories use plain Drizzle, X59/X91).**
```ts
// src/server/repo/tasks.ts
export type TaskRow = typeof tasks.$inferSelect
export async function insertTask(tx: DbOrTx, row: {
  projectId: string; parentId?: string | null; depth?: 0 | 1 | 2; name: string; position: string; createdBy: string; statusId: string
  notes?: string | null; startDate?: ISODate | null; dueDate?: ISODate | null; certaintyOverride?: Certainty | null
  completedOn?: ISODate | null; completedBy?: string | null; deletedBatch?: string | null; deletedAt?: Date | null
}): Promise<TaskRow>
export async function lastChildPosition(tx: DbOrTx, projectId: string, parentId: string | null): Promise<string | null>   // ORDER BY position DESC, id DESC LIMIT 1, live only
/** Project task list loader (M3-D39; reused by M6's grid chunk). Live tasks of the project, no assignees. Body by S2.10. */
export interface TaskListRow {
  id: string; projectId: string; parentId: string | null; depth: number; position: string; name: string; notes: string | null
  startDate: ISODate | null; dueDate: ISODate | null; certaintyOverride: Certainty | null
  statusId: string; statusCategory: TaskStatusCategory; completedOn: ISODate | null; completedWeek: ISODate | null
  blockersOpen: number; blockersTotal: number
}
export async function listLiveWithBlockerCounts(tx: DbOrTx, projectId: string): Promise<TaskListRow[]>
// src/server/repo/task-assignments.ts
export type AssignmentRow = typeof taskAssignments.$inferSelect
export async function insertAssignment(tx: DbOrTx, row: { taskId: string; userId: string; deletedBatch?: string | null; deletedAt?: Date | null }): Promise<AssignmentRow>
/** Active assignments on live tasks of the project, ORDER BY created_at, id. Body by S2.10. (M6 adds `version` to the row and listActiveForTasks/bumpVersions beside it, X87 — no M3 test asserts this row's exact key set.) */
export async function listActiveForProject(tx: DbOrTx, projectId: string): Promise<{ id: string; taskId: string; userId: string }[]>
// src/server/repo/task-statuses.ts (v3.1)
export type TaskStatusRow = typeof taskStatuses.$inferSelect
export async function insertTaskStatus(tx: DbOrTx, row: { projectId: string; name: string; category: TaskStatusCategory; color: string; position: string; deletedBatch?: string | null; deletedAt?: Date | null }): Promise<TaskStatusRow>
export async function listLiveStatuses(tx: DbOrTx, projectId: string): Promise<TaskStatusRow[]>   // ORDER BY position, id
// src/server/repo/task-blockers.ts (v3.1)
export type TaskBlockerRow = typeof taskBlockers.$inferSelect
export async function insertBlocker(tx: DbOrTx, row: { projectId: string; taskId: string; blockerTaskId: string; createdBy: string; deletedBatch?: string | null; deletedAt?: Date | null }): Promise<TaskBlockerRow>
// src/server/repo/index.ts (M1/M2 barrel; create it if missing) — M3-D39, pinned names used by M6/M7/M9
export * as tasks from './tasks'
export * as assignments from './task-assignments'
export * as statuses from './task-statuses'
export * as blockers from './task-blockers'
```
The two list functions (`listLiveWithBlockerCounts`, `listActiveForProject`) are stubs at G0 (`notImplemented('… (M3 S2)')`); the insert helpers and `lastChildPosition`/`listLiveStatuses` are real (the seed and S2 need them). S2 adds the services barrel entries of M3-D39 to `src/server/services/index.ts` as it creates each service file. Test: covered by S0.3 + factories (S0.15).

**S0.8 Action stubs (`'use server'`, thin, bodies by S2).** One file per area; each export uses PLAN §3.4.2 `action()` and the S0.4 schema; stub body `notImplemented('<name> (M3 S2)')` (turns into `INTERNAL`).

| File | Export | Schema | Returns (`{ ok: true } &`) | Need |
|---|---|---|---|---|
| `src/server/actions/tasks.ts` | `createTask` | `createTaskSchema` | `CreateTaskResult` | edit |
| | `updateTask` | `updateTaskSchema` | `UpdateTaskResult` | edit |
| | `indentTask` / `outdentTask` | `taskRefSchema` | `TreeMoveResult` | edit |
| | `moveTask` | `moveTaskSchema` | `TreeMoveResult` | edit |
| | `completeTask` | `completeTaskSchema` | `SetTaskStatusResult` | edit |
| | `uncompleteTask` | `uncompleteTaskSchema` | `SetTaskStatusResult` | edit |
| | `setTaskStatus` (v3.1) | `setTaskStatusSchema` | `SetTaskStatusResult` | edit (PERM-11) |
| | `revertTaskStatus` (M3-D28) | `revertTaskStatusSchema` | `SetTaskStatusResult` | edit (PERM-11) |
| | `deleteTaskTree` | `deleteTaskTreeSchema` | `DeleteTaskTreeResult` | edit |
| | `restoreTaskBatch` | `restoreTaskBatchSchema` | `RestoreTaskBatchResult` | edit |
| `src/server/actions/assignments.ts` | `assign` | `assignSchema` | `AssignResult` | edit (+ manage for non-members) |
| | `unassign` | `unassignSchema` | `UnassignResult` | edit |
| | `restoreAssignmentBatch` | `restoreAssignmentBatchSchema` | `RestoreAssignmentBatchResult` | edit (+ manage if re-adding a member) |
| `src/server/actions/members.ts` (M2 file) | `removeMemberWithAssignments` | `removeMemberWithAssignmentsSchema` | `RemoveMemberWithAssignmentsResult` | manage |
| | `restoreRemovedMember` | `restoreRemovedMemberSchema` | `RestoreRemovedMemberResult` | manage |
| `src/server/actions/task-statuses.ts` (v3.1) | `createTaskStatus` | `createTaskStatusSchema` | `{ status: TaskStatusDTO }` | manage (PERM-23) |
| | `updateTaskStatus` | `updateTaskStatusSchema` | `{ status: TaskStatusDTO }` | manage |
| | `reorderTaskStatus` | `reorderTaskStatusSchema` | `ReorderTaskStatusResult` | manage |
| | `deleteTaskStatus` | `deleteTaskStatusSchema` | `DeleteTaskStatusResult` | manage |
| | `restoreTaskStatusBatch` | `restoreTaskStatusBatchSchema` | `RestoreTaskStatusBatchResult` | manage |
| `src/server/actions/task-blockers.ts` (v3.1) | `addTaskBlocker` | `addTaskBlockerSchema` | `AddTaskBlockerResult` | edit (PERM-11) |
| | `removeTaskBlocker` | `removeTaskBlockerSchema` | `RemoveTaskBlockerResult` | edit (PERM-11) |

```ts
'use server'
import { action } from '@/server/action'
import { createTaskSchema /* … */ } from '@/lib/schemas/tasks'
import type { CreateTaskResult /* … */ } from '@/lib/contracts/tasks'

const notImplemented = (name: string): never => { throw new Error(`NOT_IMPLEMENTED: ${name} (M3 S2)`) }
export const createTask = action<typeof createTaskSchema, CreateTaskResult>(createTaskSchema, async () => notImplemented('createTask'))
// … same pattern for every row of the table
```

**S0.9 Route stubs.**
- `src/app/api/projects/[id]/tasks/route.ts`: `export const GET = route<{ id: string }>(async () => notImplemented('GET project tasks'))` → body type `ProjectTasksResponse`.
- `src/app/api/tasks/my/route.ts`: `export const GET = route(async () => notImplemented('GET my tasks'))` → `MyTasksResponse`.
- `src/app/api/projects/[id]/statuses/route.ts` (v3.1): `GET` → `ProjectStatusesResponse`.
- `src/app/api/tasks/route.ts` (v3.1): `GET` → `TeamTasksResponse`; query parsed with `teamTasksQuerySchema` (`category` may repeat). It coexists with `src/app/api/tasks/my/route.ts`.
- `src/server/services/sidebar.ts#getSidebar` (M2; the route `GET /api/sidebar` stays as M2 wrote it): add `myTaskCount: 0` to the returned `SidebarResponse` so the contract typechecks (S2.10 computes it with `countMyOpenTasks`).

**S0.10 Query keys, invalidation, temp ids.**
- `src/lib/query-keys.ts`: ensure `projectTasks(projectId)` and `myTasks()` exist exactly as PLAN §3.5; add (v3.1) `projectStatuses(projectId)` = `['projects', projectId, 'statuses']`, `teamTasksAll()` = `['tasks', 'team']` and `teamTasks(filters)` = `['tasks', 'team', filters]` — exactly as already listed in PLAN §3.5.
- `src/lib/invalidate.ts`: add
  ```ts
  export async function invalidateTasks(qc: QueryClient, projectId: string): Promise<void> {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId) }),
      qc.invalidateQueries({ queryKey: qk.myTasks() }),
      qc.invalidateQueries({ queryKey: qk.sidebar() }),
      qc.invalidateQueries({ queryKey: qk.teamTasksAll() }),           // v3.1: /tasks pages
    ])
  }
  export async function invalidateStatuses(qc: QueryClient, projectId: string): Promise<void> {   // v3.1: status-set changes
    await Promise.all([qc.invalidateQueries({ queryKey: qk.projectStatuses(projectId) }), invalidateTasks(qc, projectId)])
  }
  ```
  and make sure `invalidateLoad(qc)` (M2) includes `qk.myTasks()` and `qk.teamTasksAll()` (PLAN §3.5). `invalidateTasks` is the single place later milestones extend (M8 appends `qk.projectMilestones(projectId)`, C29; M10 appends home + `pageEmbedTasksAll`, X82); callers never list task keys themselves.
- `src/lib/temp-id.ts` (X53): `export function tempId(): string` (`'tmp_' + counter + 12 hex chars from crypto.getRandomValues`), `export const isTempId = (id: string) => id.startsWith('tmp_')`. Unit test `src/lib/temp-id.test.ts`: 1 000 calls → 1 000 distinct values, all `isTempId`.

**S0.11 Shortcut registry contract (`src/lib/shortcuts.ts`, X07).** Static, data-driven; later milestones append entries (M4 Cmd+K, M6 grid keys).
```ts
import { th } from '@/i18n/th'
export type ShortcutScope = 'global' | 'taskList'                 // M4 adds 'palette'/'editor', M6 'grid'
export type KeyToken = 'Mod' | 'Shift' | 'Enter' | 'Tab' | 'Esc' | 'Space' | 'Delete' | 'Click' | 'Backslash' | 'Z' | 'N' | 'S' | '?'
export interface ShortcutDef { id: string; scope: ShortcutScope; combos: readonly (readonly KeyToken[])[]; label: string }
export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ['global', 'taskList']
export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: 'sidebar.toggle', scope: 'global', combos: [['Mod', 'Backslash']], label: th.shortcuts.items.toggleSidebar },
  { id: 'close', scope: 'global', combos: [['Esc']], label: th.shortcuts.items.close },
  { id: 'undo', scope: 'global', combos: [['Mod', 'Z']], label: th.shortcuts.items.undo },
  { id: 'redo', scope: 'global', combos: [['Mod', 'Shift', 'Z']], label: th.shortcuts.items.redo },
  { id: 'task.new', scope: 'global', combos: [['N']], label: th.shortcuts.items.newTask },
  { id: 'help', scope: 'global', combos: [['?']], label: th.shortcuts.items.help },
  { id: 'list.next', scope: 'taskList', combos: [['Enter']], label: th.shortcuts.items.listNext },
  { id: 'list.indent', scope: 'taskList', combos: [['Tab']], label: th.shortcuts.items.listIndent },
  { id: 'list.outdent', scope: 'taskList', combos: [['Shift', 'Tab']], label: th.shortcuts.items.listOutdent },
  { id: 'list.complete', scope: 'taskList', combos: [['Mod', 'Enter']], label: th.shortcuts.items.listComplete },
  { id: 'list.delete', scope: 'taskList', combos: [['Delete']], label: th.shortcuts.items.listDelete },
  { id: 'list.open', scope: 'taskList', combos: [['Space']], label: th.shortcuts.items.listOpen },
  { id: 'list.multi', scope: 'taskList', combos: [['Shift', 'Click'], ['Mod', 'Click']], label: th.shortcuts.items.listMultiSelect },
  { id: 'list.status', scope: 'taskList', combos: [['S']], label: th.shortcuts.items.listStatus },          // v3.1 FR-626 (rows and board cards)
]
```
Unit test `src/lib/shortcuts.test.ts`: ids unique; every `scope` is in `SHORTCUT_SCOPES`; every label non-empty.

**S0.12 i18n (`src/i18n/th.ts`).** Create namespaces `tasks`, `my`, `shortcuts` (or extend `shortcuts` if M1 created it) and add keys to `nav`, `projects.tabs`, `members`, `audit`, `errors`. All strings below are final; parameterised strings are functions (PLAN §3.7).
```ts
nav: { /* … */ my: 'งานของฉัน' },
projects: { /* M2 keys … */ tabs: { /* overview … */ tasks: 'งาน' } },      // M2-D10 tab labels live in th.projects.tabs (M4 adds pages, M6 plan)
tasks: {
  listLabel: 'รายการงาน',
  quickAdd: { placeholder: '+ เพิ่มงาน…', label: 'เพิ่มงานใหม่' },
  unassigned: 'รอมอบหมาย',
  completedOn: (date: string) => `เสร็จ ${date}`,
  dateRange: (from: string, to: string) => `${from}–${to}`,
  showCompleted: 'แสดงงานที่เสร็จแล้ว',
  groupBy: { label: 'จัดกลุ่ม', none: 'ไม่จัดกลุ่ม', assignee: 'ผู้รับผิดชอบ', certainty: 'ความแน่นอน' },
  sort: { label: 'เรียงตาม', manual: 'ลำดับเอง', due: 'วันครบกำหนด' },
  groups: { unassigned: 'รอมอบหมาย', confirmed: 'แน่นอน', tentative: 'อาจไม่ทำ', parentPath: (path: string) => `ใน ${path}` },
  treeOpsDisabled: 'ย่อ/ดึงออก/ลากย้าย ใช้ได้เฉพาะมุมมอง "ไม่จัดกลุ่ม" และ "ลำดับเอง"',
  dragHandle: 'ลากเพื่อย้ายงาน',
  dropInvalid: 'วางที่นี่ไม่ได้ — งานซ้อนได้สูงสุด 3 ชั้น',
  expand: 'ขยายงานย่อย', collapse: 'ยุบงานย่อย',
  openPanel: 'เปิดรายละเอียด',
  completeCheckbox: (name: string) => `ติ๊กเสร็จ: ${name}`,
  rowMenu: { label: 'เมนูงาน', open: 'เปิดรายละเอียด', addSubtask: 'เพิ่มงานย่อย', moveUp: 'ย้ายขึ้น', moveDown: 'ย้ายลง', indent: 'ย่อเป็นงานย่อย', outdent: 'ดึงออก', delete: 'ลบ' },
  empty: 'ยังไม่มีงาน — พิมพ์ชื่องานแล้วกด Enter',
  readOnlyArchived: 'โปรเจคถูก archive แล้ว — ดูได้อย่างเดียว',
  tentativeMarker: 'อาจไม่ทำ',
  progress: (done: number, total: number) => `เสร็จ ${done}/${total} งาน`,
  toast: {
    completed: 'ติ๊กเสร็จแล้ว',
    completedMany: (n: number) => `ติ๊กเสร็จ ${n} งานแล้ว`,
    uncompleted: 'ยกเลิกติ๊กเสร็จแล้ว',
    askChildren: 'ติ๊กงานย่อยทั้งหมดด้วยไหม',
    completeAll: 'ติ๊กทั้งหมด',
    deleted: (name: string) => `ลบ '${name}' แล้ว`,
    deletedWithChildren: (name: string, n: number) => `ลบ '${name}' และงานย่อย ${n} งานแล้ว`,
    deletedMany: (n: number) => `ลบ ${n} งานแล้ว`,
    movedAssignees: (n: number, child: string) => `ย้ายผู้รับผิดชอบ ${n} คน (และแผน) ไปที่ '${child}' แล้ว`,
    assigned: (name: string) => `มอบหมายให้ ${name} แล้ว`,
    assignedAddedMember: (name: string) => `มอบหมายให้ ${name} และเพิ่มเป็นสมาชิกโปรเจคแล้ว`,
    assignedMany: (name: string, n: number) => `มอบหมาย ${n} งานให้ ${name} แล้ว`,
    unassigned: (name: string) => `ยกเลิกการมอบหมาย ${name} แล้ว`,
    restoreFailed: (reason: string) => `กู้คืนไม่ได้ เพราะ${reason}`,
    restoreSkipped: 'มีการมอบหมายใหม่แล้ว — กู้คืนแผนเดิมไม่ได้',
    treeChanged: 'รายการงานเปลี่ยนไปแล้ว — โหลดค่าล่าสุดแล้ว',
    saveFailed: 'บันทึกไม่สำเร็จ · ลองใหม่',
  },
  undoLabel: { create: 'สร้างงาน', delete: 'ลบงาน', complete: 'ติ๊กเสร็จ', uncomplete: 'ยกเลิกติ๊กเสร็จ', move: 'ย้ายงาน', assign: 'มอบหมายงาน', unassign: 'ยกเลิกการมอบหมาย' },
  errors: {
    nameRequired: 'กรุณาใส่ชื่องาน',
    nameTooLong: 'ชื่องานยาวได้ไม่เกิน 500 ตัวอักษร',
    dueBeforeStart: 'วันครบกำหนดต้องไม่ก่อนวันเริ่ม',
    maxDepth: 'งานซ้อนได้สูงสุด 3 ชั้น',
    crossProject: 'ย้ายงานข้ามโปรเจคไม่ได้',
    cycle: 'ย้ายงานไปไว้ใต้งานย่อยของตัวเองไม่ได้',
    sameProjectOnly: 'เลือกงานจากโปรเจคเดียวกันเท่านั้น',
    parentNotAssignable: 'งานที่มีงานย่อยมอบหมายไม่ได้ — มอบหมายที่งานย่อยแทน',
    nestUnderAssignedNeedsLeaf: 'ย้ายไม่ได้: งานแม่มีผู้รับผิดชอบอยู่ ย้ายมาได้เฉพาะงานที่ไม่มีงานย่อย',
    sameAssignee: (name: string) => `ย้ายไม่ได้: ${name} ถูกมอบหมายทั้งงานแม่และงานนี้ — ยกเลิกการมอบหมายที่งานแม่ก่อน`,
    treeChanged: 'รายการงานเปลี่ยนไปแล้ว',
    userInactive: 'พนักงานคนนี้ถูกปิดใช้งาน',
    completedInFuture: 'วันที่เสร็จต้องไม่เกินวันนี้',
    restore: { expired: 'เกิน 30 วันแล้ว', parentDeleted: 'งานแม่ถูกลบอยู่', parentAssigned: 'งานแม่มีผู้รับผิดชอบแล้ว', tooDeep: 'งานแม่ถูกย้ายจนลึกเกิน 3 ชั้น' },
  },
  panel: {
    label: 'รายละเอียดงาน', close: 'ปิด', notFound: 'ไม่พบงาน',
    name: 'ชื่องาน', notes: 'หมายเหตุ', startDate: 'วันเริ่ม', dueDate: 'วันครบกำหนด',
    certainty: 'ความแน่นอน', assignees: 'ผู้รับผิดชอบ', addAssignee: '+ คน',
    parentAssigneesHint: 'งานนี้มีงานย่อย — ผู้รับผิดชอบอยู่ที่งานย่อย',
    subtasks: 'งานย่อย', addSubtask: '+ เพิ่มงานย่อย', completed: 'ทำเสร็จแล้ว', delete: 'ลบงาน',
  },
  certainty: {
    inherit: 'ตามต้นทาง', confirmed: 'แน่นอน', tentative: 'อาจไม่ทำ',
    source: { task: 'ตั้งที่งานนี้', ancestor: (name: string) => `สืบทอดจาก '${name}'`, project: 'ตามโปรเจค' },
  },
  bulk: { selected: (n: number) => `เลือก ${n} งาน`, complete: 'ติ๊กเสร็จ', assign: 'มอบหมาย', delete: 'ลบ', clear: 'ยกเลิกการเลือก' },
  picker: { label: 'เลือกผู้รับผิดชอบ', willBecomeMember: 'จะถูกเพิ่มเป็นสมาชิก', noOptions: 'ไม่พบพนักงาน', removeChip: (name: string) => `ยกเลิกการมอบหมาย ${name}` },
},
my: { title: 'งานของฉัน', empty: 'ไม่มีงานค้าง', due: (date: string) => `ครบกำหนด ${date}`, inParent: (name: string) => `ใน '${name}'`, countLabel: (n: number) => `${n} งาน` },
shortcuts: {
  title: 'คีย์ลัด', close: 'ปิด',
  scopes: { global: 'ทั่วไป', taskList: 'ลิสต์งาน' },
  keys: { Mod: 'Ctrl', ModMac: '⌘', Shift: 'Shift', Enter: 'Enter', Tab: 'Tab', Esc: 'Esc', Space: 'Space', Delete: 'Delete', Click: 'คลิก', Backslash: '\\', Z: 'Z', N: 'N', '?': '?' },
  items: {
    toggleSidebar: 'ย่อ/ขยาย sidebar', close: 'ปิด panel/dialog', undo: 'เลิกทำ', redo: 'ทำซ้ำ',
    newTask: 'งานใหม่ในบริบทปัจจุบัน', help: 'แสดงรายการคีย์ลัด',
    listNext: 'งานถัดไป', listIndent: 'ย่อเป็นงานย่อย', listOutdent: 'ดึงออก', listComplete: 'ติ๊กเสร็จ',
    listDelete: 'ลบ', listOpen: 'เปิด panel', listMultiSelect: 'เลือกหลายงาน',
  },
},
members: { /* M2 keys … */ assignmentsBlock: {
  message: (n: number) => `มีงานที่มอบหมายอยู่ ${n} งาน`,
  unassignAll: 'ยกเลิกการมอบหมายทั้งหมด',
  cancelRemove: 'ยกเลิกการนำออก',
  removedWithAssignments: (name: string, n: number) => `นำ ${name} ออกและยกเลิกการมอบหมาย ${n} งานแล้ว`,
} },
audit: { /* M1/M2 builders … */
  taskCreated: (name: string) => `สร้างงาน ${name}`,
  taskUpdated: (name: string) => `แก้งาน ${name}`,
  taskMoved: (name: string) => `ย้ายงาน ${name}`,
  taskCompleted: (name: string) => `ติ๊กเสร็จ ${name}`,
  taskUncompleted: (name: string) => `ยกเลิกติ๊กเสร็จ ${name}`,
  taskDeleted: (name: string, n: number) => `ลบงาน ${name} (รวมงานย่อย ${n} งาน)`,
  taskRestored: (name: string, n: number) => `กู้คืนงาน ${name} (รวมงานย่อย ${n} งาน)`,
  assignmentCreated: (task: string, user: string) => `มอบหมาย ${task} ให้ ${user}`,
  assignmentRemoved: (task: string, user: string) => `ยกเลิกการมอบหมาย ${task} ของ ${user}`,
  assignmentRestored: (task: string, user: string) => `กู้คืนการมอบหมาย ${task} ของ ${user}`,
  memberRemovedWithAssignments: (user: string, n: number) => `นำ ${user} ออกพร้อมยกเลิกการมอบหมาย ${n} งาน`,
  memberRestored: (user: string) => `กู้คืนสมาชิก ${user}`,
},
```

Additions for SPEC v3.1 (same file, merged into the namespaces above; after G0, S3 may add keys under `tasks.status`, `tasks.blockers`, `tasks.board`, `tasks.view`, `teamTasks`, and S2 under `audit`/`errors`):
```ts
nav: { /* … */ teamTasks: 'งานของทีม' },
tasks: {
  /* … M3 keys above … */
  groupBy: { /* … */ status: 'สถานะ' },
  view: { label: 'มุมมอง', list: 'ลิสต์', board: 'บอร์ด' },
  bulk: { /* … */ setStatus: 'เปลี่ยนสถานะ' },
  undoLabel: { /* … */ status: 'เปลี่ยนสถานะ', blockerAdd: 'เพิ่มตัวขวาง', blockerRemove: 'ลบตัวขวาง', statusCreate: 'เพิ่มสถานะ', statusDelete: 'ลบสถานะ', statusReorder: 'เรียงสถานะ' },
  status: {
    label: 'สถานะ',
    menuLabel: (name: string) => `เปลี่ยนสถานะ: ${name}`,
    filter: 'ค้นหาสถานะ',
    categories: { TODO: 'ยังไม่เริ่ม', IN_PROGRESS: 'กำลังทำ', WAITING: 'รอ/ติดขัด', DONE: 'เสร็จ' },
    defaults: { todo: 'ยังไม่เริ่ม', doing: 'กำลังทำ', waitData: 'รอข้อมูล', blocked: 'ติดปัญหา', done: 'เสร็จ' },
    settings: {
      title: 'สถานะงาน', add: '+ เพิ่มสถานะ', newName: 'สถานะใหม่', name: 'ชื่อสถานะ', category: 'หมวด', color: 'สี',
      dragHandle: 'ลากเพื่อเรียงสถานะ', delete: 'ลบสถานะ', usage: (n: number) => `${n} งาน`,
      readOnly: 'เฉพาะ LEAD และ Manager แก้ชุดสถานะได้', moveTo: 'ย้ายงานไปที่', moveAndDelete: 'ย้ายแล้วลบ',
      colorName: { slate: 'เทา', blue: 'น้ำเงิน', teal: 'เขียวน้ำทะเล', green: 'เขียว', amber: 'เหลืองอำพัน', orange: 'ส้ม', red: 'แดง', purple: 'ม่วง' },
    },
    toast: {
      changed: (name: string) => `เปลี่ยนสถานะเป็น '${name}' แล้ว`,
      changedMany: (n: number, name: string) => `เปลี่ยน ${n} งานเป็น '${name}' แล้ว`,
      created: (name: string) => `เพิ่มสถานะ '${name}' แล้ว`,
      deleted: (name: string) => `ลบสถานะ '${name}' แล้ว`,
      deletedMoved: (n: number, to: string) => `ย้าย ${n} งานไป '${to}' แล้ว`,
      restoreSkipped: (n: number) => `${n} งานถูกเปลี่ยนสถานะไปแล้ว — คงสถานะปัจจุบันไว้`,
      noStatusInCategory: (project: string, category: string) => `โปรเจค ${project} ไม่มีสถานะในหมวด "${category}"`,
    },
    errors: {
      nameRequired: 'กรุณาใส่ชื่อสถานะ', nameTooLong: 'ชื่อสถานะยาวได้ไม่เกิน 40 ตัวอักษร',
      duplicateName: 'มีสถานะชื่อนี้ในโปรเจคแล้ว', tooMany: 'โปรเจคหนึ่งมีสถานะได้สูงสุด 12 สถานะ',
      needTodo: 'ต้องมีสถานะในหมวด "ยังไม่เริ่ม" อย่างน้อย 1 สถานะ', needDone: 'ต้องมีสถานะในหมวด "เสร็จ" อย่างน้อย 1 สถานะ',
      needDestination: 'สถานะนี้มีงานอยู่ — เลือกสถานะที่จะย้ายงานไปก่อน',
      doneCategoryInUse: 'สถานะนี้มีงานอยู่ — ย้ายงานออกก่อนเปลี่ยนเข้าหรือออกจากหมวด "เสร็จ"',
    },
  },
  blockers: {
    blockedBy: 'ถูกขวางโดย', blocking: 'กำลังขวาง', add: '+ เพิ่มงานที่ขวาง', pickerLabel: 'เลือกงานที่ขวาง', none: 'ไม่มี',
    remove: (name: string) => `ลบตัวขวาง ${name}`,
    badgeWaiting: (n: number) => `รอ ${n} งาน`, badgeCleared: 'ตัวขวางเสร็จแล้ว',
    badgeTooltip: (names: string) => `ถูกขวางโดย: ${names}`,
    toast: { added: (name: string) => `เพิ่มตัวขวาง '${name}' แล้ว`, removed: (name: string) => `ลบตัวขวาง '${name}' แล้ว` },
    errors: { self: 'งานขวางตัวเองไม่ได้', ancestry: 'งานแม่กับงานย่อยขวางกันเองไม่ได้', crossProject: 'ตัวขวางต้องอยู่ในโปรเจคเดียวกัน', cycle: (path: string) => `จะเกิดวงวน: ${path}` },
  },
  board: {
    label: 'บอร์ดงาน', column: (name: string, n: number) => `${name} (${n} งาน)`,
    leafOnly: 'เฉพาะงานย่อยสุด', hideDone: 'ซ่อนคอลัมน์หมวดเสร็จ', assignee: 'ผู้รับผิดชอบ', allAssignees: 'ทุกคน',
    quickAdd: (status: string) => `เพิ่มงานในสถานะ ${status}`, empty: 'ไม่มีงาน',
    cardDragHandle: (name: string) => `ลากการ์ด ${name}`,
  },
},
teamTasks: {
  title: 'งานของทีม',
  filters: { person: 'คน', project: 'โปรเจค', position: 'ตำแหน่ง', category: 'หมวดสถานะ', blocked: 'เฉพาะที่ถูกขวาง', includeDone: 'แสดงงานที่เสร็จแล้ว', clear: 'ล้างตัวกรอง' },
  loadMore: 'โหลดเพิ่ม', empty: 'ไม่พบงานตามตัวกรอง',
},
shortcuts: { /* … */ keys: { /* … */ S: 'S' }, items: { /* … */ listStatus: 'เปลี่ยนสถานะ' } },
audit: { /* … */
  taskStatusChanged: (task: string, status: string) => `เปลี่ยนสถานะ ${task} เป็น ${status}`,
  statusCreated: (name: string) => `เพิ่มสถานะงาน ${name}`,
  statusUpdated: (name: string) => `แก้สถานะงาน ${name}`,
  statusReordered: (name: string) => `เรียงสถานะงาน ${name}`,
  statusDeleted: (name: string, n: number) => `ลบสถานะงาน ${name} (ย้าย ${n} งาน)`,
  statusRestored: (name: string) => `กู้คืนสถานะงาน ${name}`,
  blockerAdded: (task: string, blocker: string) => `${task} ถูกขวางโดย ${blocker}`,
  blockerRemoved: (task: string, blocker: string) => `ลบตัวขวาง ${blocker} ของ ${task}`,
},
```

**S0.13 Preferences keys.** In M1's known-keys preference schema (`src/lib/schemas/preferences.ts` or wherever `setPreference` validates keys) ensure: `'tasks.groupBy': z.enum(['none','status','assignee','certainty'])` default `'none'`, `'tasks.view': z.enum(['LIST','BOARD'])` default `'LIST'` (X74), `'tasks.board.leafOnly': z.boolean()` default `false`, `'tasks.board.hideDone': z.boolean()` default `false`, `'tasks.sort': z.enum(['manual','due'])` default `'manual'`, `'tasks.showCompleted': z.boolean()` default `true` (M3-D6). Extend that schema's unit test with one valid and one invalid value per key.

**S0.14 Date-picker provider.** If `AppProviders` (`src/components/providers/`) lacks it, wrap children (inside `ThemeProvider`, outside `UndoProvider`) with `<LocalizationProvider dateAdapter={AdapterDayjsBuddhist} adapterLocale="th">` and `import 'dayjs/locale/th'`; add `pickersThTH` (`@mui/x-date-pickers/locales`) to the theme if missing. Verified code: `plan/research/snippets/r1/src/{theme.ts,app/providers.tsx}`.

**S0.15 Test helpers (`tests/helpers/factories.ts`, `world.ts`).** Factories insert with **plain Drizzle** on the S0.2 tables (X59/X91 — never through `src/server/repo/**`) and return rows typed with the S0.7 row types; every task gets a status of its own project (X70, `tasks.status_id` NOT NULL); ids are real v4 UUIDs; positions appended after the last live sibling with `generateKeyBetween(last, null)`.
```ts
export async function makeTask(o: { project: { id: string }; parent?: { id: string; depth: number } | null; name?: string
  createdBy: { id: string }; certaintyOverride?: Certainty | null; completedOn?: ISODate | null; startDate?: ISODate | null
  dueDate?: ISODate | null; deleted?: { batch: string; daysAgo: number } }): Promise<TaskRow>
export async function makeAssignment(o: { task: { id: string }; user: { id: string }; deleted?: { batch: string; daysAgo: number } }): Promise<AssignmentRow>
// v3.1 — `makeTask` also takes `status?: { id: string }` (default: the project's `todo`, created on demand by `makeStatuses`; a DONE status requires `completedOn`)
type DefaultKey = 'todo' | 'doing' | 'waitData' | 'blocked' | 'done'
export async function makeStatuses(o: { project: { id: string }; rename?: Partial<Record<DefaultKey, string>> }): Promise<Record<DefaultKey, TaskStatusRow>>   // DEFAULT_STATUSES + th names
export async function makeStatus(o: { project: { id: string }; name: string; category: TaskStatusCategory; afterId?: string; deleted?: { batch: string; daysAgo: number } }): Promise<TaskStatusRow>
export async function makeBlocker(o: { task: { id: string; projectId: string }; blocker: { id: string }; createdBy: { id: string } }): Promise<TaskBlockerRow>
```
`createWorld({ with: ['tasks'] })` adds (every name is distinctive so leak tests can grep it):

| Key | Project | Shape |
|---|---|---|
| `w.tasks.pParent` | P | root "งานแม่ P-ลับ01", children ↓ |
| `w.tasks.pChildA` | P | depth 1 under pParent, assigned `member` (`w.assignments.pChildAMember`) |
| `w.tasks.pChildB` | P | depth 1 under pParent, unassigned |
| `w.tasks.pLeaf` | P | root after pParent, assigned `lead` (`w.assignments.pLeafLead`) |
| `w.tasks.pDone` | P | root after pLeaf, `completedOn '2026-09-28'`, unassigned |
| `w.tasks.qTask` | Q | root "งาน Q-ลับ02", assigned `outsider` (`w.assignments.qTaskOutsider`) |
| `w.tasks.aTask` | A (archived) | root, assigned `member` (`w.assignments.aTaskMember`) |
| `w.batches.pDeletedTask` | P | batch of a soft-deleted root "งานที่ลบแล้ว P" (1 day ago) |
| `w.batches.aDeletedTask` | A | batch of a soft-deleted root in A (1 day ago) |
| `w.batches.pRemovedAssignment` | P | batch of a soft-deleted assignment of `lead` on `pChildB` (1 day ago) |
| `w.users.former` + `w.removedMembers.pFormer` | P | active worker **not** a member of P any more; one soft-deleted assignment on `pChildB` under `batch`; snapshot `{ role: 'MEMBER', addedBy: lead.id, addedAt: '2026-09-01T09:00:00+07:00' }` — input for `restoreRemovedMember` rows |
| `w.statuses.P` | P | the 5 defaults `{ todo, doing, waitData, blocked, done }` + `pSecret` "สถานะลับ P-03" (`WAITING`, unused, placed before `done`); every P task is on `todo` except `pChildB` (`doing`) and `pDone` (`done`) |
| `w.statuses.Q` / `w.statuses.A` | Q / A | the 5 defaults; Q's `waitData` is renamed "สถานะลับ Q-04" (leak tests) |
| `w.tasks.aTask2` | A | second root in A (blocker rows on an archived project) |
| `w.blockers.pLeafByChildA` | P | live edge: `pLeaf` blocked by `pChildA` |
| `w.batches.pDeletedStatus` | P | status "สถานะที่ลบแล้ว P" (`TODO`) soft-deleted 1 day ago; `moveToStatusId = statuses.P.doing`; `moved = [{ taskId: pChildB, fromStatusId: <it>, completedOn: null }]` — input for `restoreTaskStatusBatch` rows |
| `w.batches.aDeletedStatus` | A | same shape in A (`aTask2` moved to A's `doing`) |

v3.1 also adds `tests/helpers/invariants.ts#assertCompletionInvariant(tx)` (query in S2.6; used by S2's and S4's integration tests, R22).

Done-check: `pnpm vitest run --project integration tests/helpers` (a smoke test `tests/helpers/world.int.test.ts › with tasks` asserts the shapes above, incl. depths, that `pChildA` precedes `pChildB`, 6 live statuses in P in the stated order, and the completion invariant of R22 on the whole world).

**S0.16 G0.** `pnpm check` green (stubs compile; nothing calls them yet); `pnpm db:generate` → "No schema changes". Report the migration file name.

### 5.S1 — Domain certainty, status, blockers + pure tree/task helpers (domain-engineer · owns `src/domain/certainty*.ts`, `src/domain/status*.ts`, `src/domain/blockers*.ts`, `src/lib/tree/**`, `src/lib/tasks/**`)

Test-first for every file (PLAN §4.1). No React, DB or Next imports; `src/lib/**` may import `src/domain/**`. Order keys are compared with `<` / `>` only (never `localeCompare`, r4 §24).

**S1.1 `src/domain/certainty.ts` (X03, BR-35/36).**
```ts
import type { Certainty } from './types'
export type CertaintySource = 'task' | 'ancestor' | 'project'
export interface CertaintyNode { id: string; name: string; certaintyOverride: Certainty | null }
export interface CertaintyResolution { value: Certainty; source: CertaintySource; sourceTaskId: string | null; sourceTaskName: string | null }
/** chain = [task, parent?, grandparent?] nearest first; length 1..3 (BR-30) else RangeError */
export function resolveCertainty(chain: readonly CertaintyNode[], projectCertainty: Certainty): CertaintyResolution
export function effectiveCertainty(chain: readonly CertaintyNode[], projectCertainty: Certainty): Certainty
export function certaintySource(chain: readonly CertaintyNode[], projectCertainty: Certainty): CertaintySource
```
Tests first (`src/domain/certainty.test.ts`, `describe('BR-35/36')`, `it.each`; overrides listed task → parent → grandparent, `·` = null):

| chain overrides | project | value | source | sourceTaskId |
|---|---|---|---|---|
| `·` | CONFIRMED | CONFIRMED | project | null |
| `·` | TENTATIVE | TENTATIVE | project | null |
| `TENTATIVE` | CONFIRMED | TENTATIVE | task | t |
| `CONFIRMED` | TENTATIVE | CONFIRMED | task | t |
| `· TENTATIVE` | CONFIRMED | TENTATIVE | ancestor | p |
| `· · TENTATIVE` | CONFIRMED | TENTATIVE | ancestor | g |
| `· CONFIRMED TENTATIVE` | TENTATIVE | CONFIRMED | ancestor | p (nearest wins) |
| `CONFIRMED TENTATIVE ·` | TENTATIVE | CONFIRMED | task | t |
| `· · ·` | TENTATIVE | TENTATIVE | project | null |

Plus: golden "Rollout สาขา" (override TENTATIVE, POS CONFIRMED) → TENTATIVE/task; "ย้ายข้อมูลลูกค้า" (no override, CRM TENTATIVE) → TENTATIVE/project; `[]` and a 4-node chain → `RangeError`; `sourceTaskName` equals the node's name for task/ancestor and is `null` for project. fast-check property (`fc.array(fc.constantFrom('CONFIRMED','TENTATIVE',null), {minLength:1,maxLength:3})`): `value === firstNonNull ?? project` and `source === 'task'` iff `chain[0].certaintyOverride !== null`. Done-check: `pnpm vitest run --project unit --coverage src/domain/certainty.test.ts` (100 % lines/branches for this file).

**S1.2 `src/lib/tree/projection.ts` (FR-604; shared with M4's page tree).** Copy `plan/research/snippets/r4/client/components/tree/tree-projection.ts` verbatim (exports `FlatItem`, `Projection`, `subtreeHeight`, `removeChildrenOf`, `getProjection`). Port `tree-projection.test.ts` from `node:test` to Vitest (`src/lib/tree/projection.test.ts`) — the 7 cases unchanged (subtree height D=2/A=1/F=0; C right under B → depth 2 parent B; C left → root after A before D; D (height 2) between B and C with `maxDepthIndex 2` → `{ valid: false }`; same with 9 → depth 1 under A; F to top → depth 0 before A; B over F → depth 1 under D after E) plus one new case: projection result never has `depth + subtreeHeight > maxDepthIndex` (fast-check over random 3-level trees).

**S1.3 `src/lib/tree/ops.ts` — pure outliner operations (FR-603, AC-602, X62).** Input = full DFS-ordered `FlatItem[]` (collapsed rows included).
```ts
export const TASK_MAX_DEPTH_INDEX = 2
export function compareKeys(a: string, b: string): -1 | 0 | 1                       // a<b ? -1 : a>b ? 1 : 0
export function flattenTree<T extends { id: string; parentId: string | null; position: string }>(nodes: readonly T[]): (T & { depth: number })[]
  // DFS; siblings ordered by (position, id) with compareKeys; orphans (parent missing) are dropped
export function childrenOf(items: readonly FlatItem[], parentId: string | null): FlatItem[]
export function descendantIds(items: readonly FlatItem[], id: string): string[]
export function fitsDepth(newDepth: number, height: number, maxDepthIndex: number): boolean  // newDepth + height <= max
export type Placement = { parentId: string | null; afterId: string | null }           // afterId null = first child
export function indentTarget(items: readonly FlatItem[], id: string, maxDepthIndex: number): Placement | null
  // previous sibling becomes parent; append after its last child; null when no previous sibling or depth would exceed
export function outdentTarget(items: readonly FlatItem[], id: string): Placement | null  // grandparent, right after old parent; null at root
export function moveUpTarget(items: readonly FlatItem[], id: string): Placement | null   // swap with previous sibling
export function moveDownTarget(items: readonly FlatItem[], id: string): Placement | null // after next sibling
export function currentPlacement(items: readonly FlatItem[], id: string): Placement
export function applyPlacement(items: readonly FlatItem[], id: string, to: Placement, provisionalPosition: string): FlatItem[]
  // optimistic: re-parent the subtree, recompute depths, return new DFS list
```
Tests first (`src/lib/tree/ops.test.ts`) on the fixture `A(B, C), D(E(F))` and on a flat `R1, R2, R3`:
- AC-602: `indentTarget([R1,R2,R3], 'R2', 2)` → `{ parentId: 'R1', afterId: null }`; then for a chain `A > B > C` (depths 0,1,2) `indentTarget(…, 'C', 2)` → `null` (no previous sibling) and for `A > B, C(depth 1)`: `indentTarget('C')` → `{ parentId: 'B', afterId: null }`; a fourth level → `null`.
- `indentTarget(fixture, 'D', 2)` → `null` (D height 2 under A would be depth 1 + 2 = 3).
- `indentTarget(fixture, 'C', 2)` → `{ parentId: 'B', afterId: null }`; `indentTarget(fixture, 'B', 2)` → `null` (first child).
- `outdentTarget(fixture, 'C')` → `{ parentId: null, afterId: 'A' }`; `outdentTarget(fixture, 'F')` → `{ parentId: 'D', afterId: 'E' }`; root → `null`.
- `moveUpTarget(fixture, 'C')` → `{ parentId: 'A', afterId: null }`; `moveDownTarget(fixture, 'B')` → `{ parentId: 'A', afterId: 'C' }`; first/last → `null`.
- `applyPlacement(fixture, 'E', { parentId: null, afterId: 'A' }, 'a0V')` → order `A B C E F D`, E depth 0, F depth 1.
- `flattenTree` sorts `['a1','a0V','Zz']` as `Zz, a0V, a1` (byte order; would fail with `localeCompare`), ties broken by id.

**S1.4 `src/lib/tasks/` — task-list helpers used by the UI.**
```ts
// tree.ts
export interface TaskRowModel extends TaskDTO { depth: TaskDepth; hasChildren: boolean; isLeaf: boolean; parentPath: string[] }
export function buildTaskRows(tasks: readonly TaskDTO[]): TaskRowModel[]                                   // DFS via flattenTree
export function visibleRows(rows: readonly TaskRowModel[], o: { collapsed: ReadonlySet<string>; showCompleted: boolean }): TaskRowModel[]
  // collapsed → hide descendants; showCompleted=false → hide a completed row only if its whole subtree is completed (M3-D6)
export function isSubtreeComplete(rows: readonly TaskRowModel[], id: string): boolean
export function openDescendants(rows: readonly TaskRowModel[], id: string): string[]
export function unionAssigneeIds(rows: readonly TaskRowModel[], id: string): string[]                    // parent chip area (read-only)
// certainty.ts
export function taskCertainty(byId: ReadonlyMap<string, TaskDTO>, id: string, project: Certainty): CertaintyResolution  // builds the chain, calls resolveCertainty
// group.ts
export type GroupBy = 'none' | 'status' | 'assignee' | 'certainty'
export interface TaskGroup { key: string; kind: 'all' | 'status' | 'assignee' | 'unassigned' | 'certainty'; statusId?: string; userId?: string; certainty?: Certainty; rows: TaskRowModel[] }
export function groupTasks(rows: readonly TaskRowModel[], by: GroupBy, ctx: { projectCertainty: Certainty; displayName: (userId: string) => string; statuses: readonly TaskStatusDTO[] }): TaskGroup[]
  // 'status': one group per live status in position order (empty groups kept), every depth, DFS order inside
// sort.ts
export type SortBy = 'manual' | 'due'
export function sortRows(rows: readonly TaskRowModel[], by: SortBy): TaskRowModel[]                       // due: compareISO asc, nulls last, then DFS index
export const treeOpsEnabled = (by: GroupBy, sort: SortBy, canEdit: boolean): boolean => by === 'none' && sort === 'manual' && canEdit
// selection.ts
export function toggleSelect(sel: ReadonlySet<string>, id: string): Set<string>
export function rangeSelect(order: readonly string[], anchorId: string, targetId: string): Set<string>
export function topLevelSelected(rows: readonly TaskRowModel[], sel: ReadonlySet<string>): string[]        // drops descendants of selected rows (M3-D23)
// optimistic.ts — pure cache patches over ProjectTasksResponse['tasks']
export function patchCreate(tasks: readonly TaskDTO[], t: TaskDTO): TaskDTO[]
export function patchUpdate(tasks: readonly TaskDTO[], id: string, patch: Partial<TaskDTO>): TaskDTO[]
export function patchMove(tasks: readonly TaskDTO[], id: string, to: Placement, provisionalPosition: string): TaskDTO[]   // fixes descendant depths
export function patchRemoveTree(tasks: readonly TaskDTO[], rootIds: readonly string[]): TaskDTO[]
export function patchStatus(tasks: readonly TaskDTO[], ids: readonly string[], to: TaskStatusDTO, categoryOf: (statusId: string) => TaskStatusCategory, today: ISODate): TaskDTO[]
  // optimistic setStatus: statusId + completedOn via completionTransition (BR-80)
export function patchRevertStatus(tasks: readonly TaskDTO[], items: readonly { taskId: string; statusId: string; completedOn: ISODate | null }[]): TaskDTO[]
export function patchBlockers(tasks: readonly TaskDTO[], edges: readonly BlockerEdgeDTO[], categoryOf: (statusId: string) => TaskStatusCategory): TaskDTO[]
  // recompute { open, total } for every task from the edges (optimistic add/remove; server counts replace it on settle)
export function patchTransfer(tasks: readonly TaskDTO[], t: AssignmentTransfer): TaskDTO[]
export function patchAssign(tasks: readonly TaskDTO[], taskIds: readonly string[], a: { userId: string; assignmentIdFor: (taskId: string) => string }): TaskDTO[]
export function patchUnassign(tasks: readonly TaskDTO[], assignmentIds: readonly string[]): TaskDTO[]
// transfer.ts
export const reverseTransfer = (t: AssignmentTransfer): AssignmentTransfer => ({ assignmentIds: t.assignmentIds, fromTaskId: t.toTaskId, toTaskId: t.fromTaskId })
// board.ts — v3.1 (FR-661–666, X74); generic so /tasks, M9 and M10 reuse it
export interface BoardColumn<C> { key: string; statusId: string | null; category: TaskStatusCategory; status: StatusRef | null; cards: C[] }
export function buildStatusColumns(rows: readonly TaskRowModel[], statuses: readonly TaskStatusDTO[],
  o: { leafOnly: boolean; hideDone: boolean; assigneeId: string | null }): BoardColumn<TaskRowModel>[]
  // one column per live status in position order (empty columns kept); cards in DFS order; hideDone drops DONE columns;
  // assigneeId keeps leaves assigned to that user (parents dropped)
export function buildCategoryColumns<C extends { status: StatusRef }>(cards: readonly C[], o: { hideDone: boolean }): BoardColumn<C>[]
  // 4 fixed columns TODO, IN_PROGRESS, WAITING, DONE (statusId null); card order preserved
export function resolveCategoryDrop(statusesByProject: Readonly<Record<string, readonly TaskStatusDTO[]>>, projectId: string,
  category: TaskStatusCategory): string | null      // firstOfCategory (S1.5) → status id, or null → FR-666 toast
export function toCardModel(row: TaskRowModel, statuses: readonly TaskStatusDTO[], certainty: Certainty): TaskCard
  // project board → the shared TaskCard component (S3.16): status = StatusRef of row.statusId, assigneeIds from row.assignees,
  // completed = row.completedOn !== null, certainty = the caller's effective value (taskCertainty, BR-35), parentPath, blockers as is
```
Tests first (one `*.test.ts` per file), concrete cases:
- `visibleRows`: parent ✔ with children (✔, ✔) and `showCompleted:false` → all hidden; parent ✔ with one open child → parent and the open child visible, the done child hidden; collapsed parent → children hidden but parent visible.
- `groupTasks(…, 'assignee')` for POS-like rows (leaf L1 assigned Cindy+Ivy, L2 Ivy, L3 none, parent P with children) → groups `Cindy [L1]`, `Ivy [L1, L2]`, `รอมอบหมาย [L3]`; P appears in none; display-name order via `Intl.Collator('th')`.
- `groupTasks(…, 'certainty')` with "Rollout สาขา" TENTATIVE override in a CONFIRMED project → `CONFIRMED [others]`, `TENTATIVE [Rollout สาขา]`; a child of a TENTATIVE parent lands in TENTATIVE.
- `sortRows(…, 'due')`: `['2026-10-05', null, '2026-09-30']` → `2026-09-30, 2026-10-05, null`.
- `rangeSelect(['a','b','c','d'], 'b', 'd')` → `{b,c,d}`; reverse anchor → same set; `topLevelSelected` with `{A, B}` where B is A's child → `['A']`.
- `patchMove` moving a 2-level subtree under a depth-0 task → child depth 2; `patchRemoveTree(['A'])` removes A and descendants only; `patchTransfer` moves assignee objects between tasks; `reverseTransfer(reverseTransfer(t))` deep-equals `t`.
- v3.1 `groupTasks(…, 'status')` with P-like statuses (ยังไม่เริ่ม, กำลังทำ, รอข้อมูล, ติดปัญหา, เสร็จ) and tasks on two of them → 5 groups in that order, three empty; a parent and its child land in their own statuses.
- `patchStatus` to a DONE status sets `completedOn = today` only for non-DONE rows; DONE→DONE keeps the date; to TODO clears it; `patchRevertStatus` restores both fields exactly; `patchBlockers` with edges A←B (B blocks A) and B done → A `{ open: 0, total: 1 }`.
- `buildStatusColumns`: 6 statuses incl. one unused → 6 columns in position order with the unused one empty; `leafOnly` drops parents; `hideDone` drops the DONE column(s); `assigneeId: Ivy` keeps only Ivy's leaves.
- `buildCategoryColumns` always returns 4 columns in TODO, IN_PROGRESS, WAITING, DONE order; `hideDone` → 3.
- `resolveCategoryDrop`: WAITING in P → "รอข้อมูล" (smaller position than "ติดปัญหา"); a project whose statuses have no WAITING → `null`.
- `toCardModel`: a completed leaf with two assignees → `{ completed: true, assigneeIds: [a, b], status: { id, name: 'เสร็จ', color, category: 'DONE' } }`, `parentPath` kept; the result has exactly the `TaskCard` keys (M3-only key check, M3-D42).

**S1.5 `src/domain/status.ts` (v3.1: BR-80–82, BR-84, FR-621/622/623, M3-D25/26).** Pure; no i18n (names are mapped at the service edge from `th.tasks.status.defaults[key]`). Positions are compared with `<`/`>` (byte order, X48) — `src/domain` cannot import `src/lib/tree`.
```ts
import type { ISODate, TaskStatusCategory } from './types'
export interface StatusLike { id: string; name: string; category: TaskStatusCategory; position: string }
export const MAX_STATUSES = 12
export const STATUS_COLORS = ['#94A3B8', '#2F5597', '#0F766E', '#15803D', '#B45309', '#C2410C', '#B91C1C', '#7C3AED'] as const
export const DEFAULT_STATUSES = [
  { key: 'todo', category: 'TODO', color: '#94A3B8' },
  { key: 'doing', category: 'IN_PROGRESS', color: '#2F5597' },
  { key: 'waitData', category: 'WAITING', color: '#B45309' },
  { key: 'blocked', category: 'WAITING', color: '#B91C1C' },
  { key: 'done', category: 'DONE', color: '#15803D' },
] as const satisfies readonly { key: string; category: TaskStatusCategory; color: (typeof STATUS_COLORS)[number] }[]
export function sortStatuses<T extends StatusLike>(s: readonly T[]): T[]                 // position byte order, then id
export function defaultStatus<T extends StatusLike>(s: readonly T[]): T                  // BR-81; RangeError when no TODO
export function firstDoneStatus<T extends StatusLike>(s: readonly T[]): T                // BR-82; RangeError when no DONE
export function firstOfCategory<T extends StatusLike>(s: readonly T[], c: TaskStatusCategory): T | null
export function completionTransition(a: { from: TaskStatusCategory; to: TaskStatusCategory; completedOn: ISODate | null; today: ISODate }): { completedOn: ISODate | null; changed: boolean }
  // BR-80: non-DONE → DONE: today (changed); DONE → non-DONE: null (changed); DONE → DONE and non-DONE → non-DONE: unchanged
export type StatusSetProblem = 'TOO_MANY' | 'DUPLICATE_NAME' | 'NO_TODO' | 'NO_DONE'
export function validateStatusSet(s: readonly Pick<StatusLike, 'name' | 'category'>[]): StatusSetProblem | null
  // M3-D26 order; names compared with trim().toLowerCase()
```
Tests first (`src/domain/status.test.ts`):
- `completionTransition` table (`today = '2026-09-30'`): TODO→DONE null → `'2026-09-30'` changed; IN_PROGRESS→DONE and WAITING→DONE likewise; DONE→DONE `'2026-09-28'` → `'2026-09-28'` unchanged; DONE→TODO and DONE→WAITING → `null` changed; TODO→WAITING null → null unchanged.
- `defaultStatus` picks the TODO with the smallest position (`'Zz'` before `'a0'` — byte order), ties by id; no TODO → `RangeError`; `firstDoneStatus` likewise for DONE.
- `firstOfCategory(defaults, 'WAITING')` → รอข้อมูล (`waitData` precedes `blocked`); `'IN_PROGRESS'` absent → `null`.
- `validateStatusSet`: the 5 defaults → `null`; without the TODO → `NO_TODO`; without the DONE → `NO_DONE`; 13 entries → `TOO_MANY`; `'Done'` + `' done '` → `DUPLICATE_NAME`; 13 entries that also lack a TODO → `TOO_MANY` (order).
- `DEFAULT_STATUSES` keys unique; every colour in `STATUS_COLORS`; exactly one TODO and one DONE.
- fast-check: for any `from`, `to` and a consistent start (`completedOn !== null ⇔ from === 'DONE'`), the result satisfies `completedOn !== null ⇔ to === 'DONE'` (the R22 invariant).

**S1.6 `src/domain/blockers.ts` (v3.1: BR-85/86, FR-642/644, X73).**
```ts
export interface BlockerEdge { blockerId: string; blockedId: string }       // blockerId blocks blockedId
/** The cycle the new edge blockerId → blockedId would close, in "blocks" order, e.g. ['B','A','B']; null when none.
 *  Self edge → [id, id]. BFS from blockedId along existing edges, neighbours visited in id order (deterministic shortest path). */
export function wouldCreateCycle(edges: readonly BlockerEdge[], blockerId: string, blockedId: string): string[] | null
export type BlockerProblem = { reason: 'SELF' } | { reason: 'ANCESTRY' } | { reason: 'DUPLICATE' } | { reason: 'CYCLE'; path: string[] }
export function checkBlocker(a: { edges: readonly BlockerEdge[]; parentOf: (id: string) => string | null; blockerId: string; blockedId: string }): BlockerProblem | null
  // order: SELF, ANCESTRY (either is an ancestor of the other, ≤ 2 hops via parentOf), DUPLICATE, CYCLE
export type BlockerBadge = { kind: 'WAITING'; open: number } | { kind: 'CLEARED' } | null
export function blockerBadge(c: { open: number; total: number }): BlockerBadge                       // BR-86
```
Tests first (`src/domain/blockers.test.ts`):
- edges `A→B` (A blocks B); add `B→A` → `['B','A','B']`; edges `A→B, B→C`, add `C→A` → `['C','A','B','C']`; unrelated `D→A` → `null`; self `A→A` → `['A','A']`.
- `checkBlocker`: child blocks parent → `ANCESTRY`; grandchild blocks grandparent → `ANCESTRY`; siblings → `null`; existing edge → `DUPLICATE` (before the cycle check); cycle → `{ reason: 'CYCLE', path }`.
- `blockerBadge`: `(0,0)` → `null`; `(2,3)` → `WAITING 2`; `(0,2)` → `CLEARED`.
- fast-check: over 8 node ids, apply a random sequence of candidate edges, accepting each only when `wouldCreateCycle` is `null`; the accepted graph is acyclic (Kahn's algorithm removes every node); every non-null path starts and ends with the candidate's `blockerId`, its first hop is the candidate edge and every other consecutive pair is an existing edge.

Done-check: `pnpm vitest run --project unit src/domain/certainty.test.ts src/domain/status.test.ts src/domain/blockers.test.ts src/lib/tree src/lib/tasks` · `pnpm vitest run --project unit --coverage src/domain` (≥ 95 %, 100 % for `status.ts`/`blockers.ts` branches) · `pnpm eslint src/domain src/lib/tree src/lib/tasks` · `pnpm typecheck` (own paths clean).

### 5.S2 — Task backend (backend-engineer · owns `src/server/authz.ts`, `src/server/repo/**`, `src/server/services/**`, `src/server/actions/**`, `src/app/api/**`, `scripts/**`)

Rules for every action in this stream (CLAUDE.md, PLAN §3.4.2): `action(schema, handler)` → `db.transaction(async (tx) => { lookup owning resource → authz (requireTask/requireTasks/requireAssignments/requireStatus/requireProject) → service → audit.log(tx, …) → return DTO })`. Authz always precedes any read of task contents beyond the owning-resource lookup. No `refresh()` in task/assignment actions (TanStack views; X18) — only the two member actions call `refresh()`, exactly as M2's member actions do. Errors: `NotFoundError` / `ForbiddenError` / `ValidationError` / `ConflictError` from `src/server/errors.ts` (PLAN §3.4.1); every `ConflictError` here uses code `CONFLICT` with the `th` message named in the step (use M1's constructor signatures). No plan dates from SQL (`current_date`). "Today" (M3-D43, X90): the **action** calls `serverToday()` (`@/server/clock`) and passes it as the required trailing `today: ISODate` of the service; no module under `src/server/services/**` imports `@/server/clock` (G2 grep); each action `foo` delegates to a service of the same name in its namespace (`services.tasks.createTask`, `services.taskStatus.setStatus`, `services.taskStatuses.createTaskStatus`, `services.taskBlockers.addTaskBlocker`, …) that runs after the action's authz call, so M12's scripts can call `authz → service → audit` without the `action()` wrapper (M12-D34). Audit rows: in the action, after the service, same tx (X96) — except the blocker services, which write their own (M3-D43). Never select or return columns the client does not need. Integration tests run with `vi.mock('next/cache')`, `vi.mock('next/headers')` and the mocked session (`asUser`) from `tests/setup/db-worker.ts`, plus `ALLOW_TEST_HOOKS=1`, `APP_NOW=2026-09-30T10:00:00+07:00` (`vi.stubEnv`). Write each `*.int.test.ts` case **before** the code it exercises.

**S2.1 Authz bodies (`src/server/authz.ts`).**
- `requireTask`: `select … from tasks where id = $1 and deleted_at is null` → none → `NotFoundError`; then `requireProject(tx, user, task.projectId, need)` (404 invisible, 403 archived/insufficient, X41/X42).
- `requireTasks`: load all ids (live); `rows.length !== new Set(ids).size` → `NotFoundError`; for each distinct `projectId` run `projectAccess` — any `null` → `NotFoundError` (checked **before** the multi-project check so no existence leak); more than one project → `ValidationError(th.tasks.errors.sameProjectOnly)`; then `requireProject(need)`.
- `requireAssignments`: rows by id (active or soft-deleted) joined to their **live** task; missing → `NotFoundError`; then as `requireTasks` on the task ids.
- `requireStatus` (v3.1): `select … from task_statuses where id = $1 and (deleted_at is null or $includeDeleted)` → none → `NotFoundError`; then `requireProject(tx, user, status.projectId, need)`.
- Tested by the S4 matrix and by `src/server/services/tasks.int.test.ts › authz helpers` (W on P task → `NOT_FOUND`; M on tasks of P + Q → `VALIDATION`; W on tasks of P + Q → `NOT_FOUND`).

**S2.2 Tree placement core (`src/server/services/task-tree.ts`)** — used by create, indent, outdent, move and restore. All functions take `tx` and run inside the caller's transaction.
```ts
export async function lockSiblingScope(tx: Tx, projectId: string, parentId: string | null): Promise<void>
  // select pg_advisory_xact_lock(hashtext('tasks:' || coalesce($parent::text, 'root:' || $project::text)))   (X48)
export async function keyAt(tx: Tx, a: { projectId: string; parentId: string | null; afterId: string | null | undefined; excludeId?: string }): Promise<string>
  // siblings = live children of parentId (ORDER BY position, id), excluding excludeId
  // afterId undefined → generateKeyBetween(last?.position ?? null, null)
  // afterId null      → generateKeyBetween(null, first?.position ?? null)
  // afterId given     → must be in siblings, else ConflictError('CONFLICT', th.tasks.errors.treeChanged) (M3-D11)
  //                     prev = it, next = following sibling; prev.position === next.position →
  //                     re-key all siblings with generateNKeysBetween(null, null, n) (UPDATE in order) and recompute
export async function subtree(tx: Tx, rootId: string): Promise<{ id: string; depth: number }[]>
  // WITH RECURSIVE over live rows (max 3 levels); height = max(depth) - root.depth
export async function autoTransfer(tx: Tx, newParent: TaskRow, moving: { id: string; isLeaf: boolean }): Promise<AssignmentTransfer | null>
  // BR-31 / M3-D2: newParent's active assignments (FOR UPDATE); none → null
  // moving has live children → ConflictError(th.tasks.errors.nestUnderAssignedNeedsLeaf)
  // a user on both → ConflictError(th.tasks.errors.sameAssignee(displayName))
  // else { assignmentIds: parent's, fromTaskId: newParent.id, toTaskId: moving.id }
export async function applyTransfer(tx: Tx, projectId: string, t: AssignmentTransfer): Promise<void>
  // rows = active assignments id = any(t.assignmentIds) and task_id = t.fromTaskId FOR UPDATE; count mismatch → Conflict(treeChanged)
  // toTask live, same project, no live children, else Conflict(treeChanged); same-user collision → Conflict(sameAssignee)
  // UPDATE task_assignments SET task_id = t.toTaskId, version = version + 1 WHERE id = any(t.assignmentIds)   (X20)
export async function placeTask(tx: Tx, task: TaskRow, to: { parentId: string | null; afterId: string | null | undefined },
  o: { transfer?: AssignmentTransfer; user: SessionUser }): Promise<{ task: TaskRow; previous: TreePlacement; transfer: AssignmentTransfer | null }>
```
`placeTask` algorithm:
1. `SELECT … FROM tasks WHERE id = $task FOR UPDATE`.
2. Parent: `null` → depth 0. Otherwise load it live; missing → `NotFoundError`; `parent.projectId !== task.projectId` → `projectAccess(user, parent.projectId)` is `null` → `NotFoundError`, else `ValidationError(th.tasks.errors.crossProject)` (BR-33); parent is the task or one of its descendants → `ValidationError(th.tasks.errors.cycle)`.
3. `newDepth = parent ? parent.depth + 1 : 0`; `height` from `subtree()`; `!fitsDepth(newDepth, height, 2)` → `ValidationError(th.tasks.errors.maxDepth)` (callers that must be silent pre-check, S2.5).
4. `previous = { parentId: task.parentId, afterId: <previous live sibling id or null> }`. If `to` equals `previous` → return unchanged (caller returns `{ changed: false }`).
5. `lockSiblingScope(new scope)`; `position = keyAt({ …, excludeId: task.id })`.
6. `UPDATE tasks SET parent_id, depth = newDepth, position, updated_at = now() WHERE id = $task`; `UPDATE tasks SET depth = depth + $delta WHERE id = any($descendantIds)`.
7. Transfer: `o.transfer` given → `applyTransfer(o.transfer)`; else if parent → `autoTransfer(parent, { id: task.id, isLeaf: height === 0 })` then `applyTransfer` when non-null.
8. Return the updated row, `previous`, the applied transfer.

Tests first — `src/server/services/task-tree.int.test.ts`: two concurrent `createTask` calls appending under the same parent (two transactions via `Promise.all`) get distinct keys and both rows sort deterministically; `keyAt` with equal neighbour keys re-keys siblings (seed two siblings with position `'a0'` via `insertTask`) and the new key sorts between them; `applyTransfer` collision → `CONFLICT`, count mismatch → `CONFLICT`, success bumps `version` by 1.

**S2.3 `createTask` (FR-602, FR-610).** Service `src/server/services/tasks.ts#createTask(tx: Tx, user: SessionUser, a: z.output<typeof createTaskSchema>, today: ISODate): Promise<CreateTaskResult>` (barrel `services.tasks`, M3-D39/D43); the action = `requireProject(tx, user, a.projectId, 'edit')` → `services.tasks.createTask(tx, user, a, serverToday())` → audit. The service: if `parentId`: parent live in the same project (else `NOT_FOUND` / `VALIDATION crossProject`), `parent.depth + 1 ≤ 2` (else `VALIDATION maxDepth`), lock the parent `FOR UPDATE`; `lockSiblingScope`; `position = keyAt(afterId)`; `insertTask({ name (trimmed by zod), createdBy: user.id, depth, statusId })` where `statusId` = the input `statusId` (must be a live status of this project, else `NOT_FOUND`; FR-664) or `defaultStatus(listLiveStatuses)` (BR-81; `ensureProjectStatuses` first if the project has none, X70); a `DONE`-category status also sets `completed_on = today` and `completed_by` (BR-80); if the parent had no live children and has active assignments → transfer all of them to the new child (`applyTransfer`), toast data in `transfer`; return `{ task: toTaskDTO(row, assignees), transfer }`. The **action** then writes the audit row `{ entity: 'task', action: 'create', entityId, projectId, summary: th.audit.taskCreated(name), after: { parentId, transfer } }` (M3-D43; M12 S1.3 mirrors it).
Tests first (`tasks.int.test.ts › createTask`; service calls pass `today = '2026-09-30'`): trimmed name stored; the new task is on the project's default status "ยังไม่เริ่ม" (AC-611); `statusId` = P's "กำลังทำ" → stored; P's "เสร็จ" → `completed_on '2026-09-30'`; a status of Q → `NOT_FOUND`; `' '` → `VALIDATION`; append order `R1 < R2 < R3` by position; `afterId: null` inserts first; parent at depth 2 → `VALIDATION`; parent in Q as manager → `VALIDATION`, as lead → `NOT_FOUND`; **FR-610**: parent leaf with assignment (version 1) → child created, assignment now `task_id = child`, `version = 2`, result `transfer = { assignmentIds:[a], fromTaskId: parent, toTaskId: child }`; then `deleteTaskTree({ taskIds:[child], transfer: reverseTransfer(transfer) })` → assignment back on parent (`version 3`), child soft-deleted; archived A → `FORBIDDEN`; exactly 1 audit row.

**S2.4 `updateTask` (FR-601).** `requireTask(edit)`; merge `patch` over the row and re-check `due ≥ start` with `compareISO` (zod checked only the patch) → `ValidationError(th.tasks.errors.dueBeforeStart)`; DB `23514` maps to `VALIDATION` as backstop; `UPDATE … SET <changed cols>, updated_at = now()`; audit with `before`/`after` of the changed fields only. Tests: rename, clear notes (`''` → `null`), set start only, set due before existing start → `VALIDATION`, certainty override `TENTATIVE` → `null`; W → `NOT_FOUND`.

**S2.5 `indentTask`, `outdentTask`, `moveTask` (FR-603/604, AC-602, BR-30/31/33).**
- `indentTask({ taskId })`: `requireTask(edit)`; lock row; previous live sibling `prev` (same parent, greatest `(position, id)` below the task's) — none → `{ changed: false }`; `!fitsDepth(prev.depth + 1, height, 2)` → `{ changed: false }` (**silent no-op**, AC-602); else `placeTask(task, { parentId: prev.id, afterId: undefined /* append as last child */ })`.
- `outdentTask({ taskId })`: `parentId === null` → `{ changed: false }`; else `placeTask(task, { parentId: parent.parentId, afterId: parent.id })`.
- `moveTask({ taskId, parentId, afterId, transfer? })`: `requireTask(edit)`; `placeTask` (depth violation → `VALIDATION maxDepth`; BR-33; stale `afterId` → `CONFLICT treeChanged`).
- All three: audit `taskMoved` with `before: previous`, `after: { parentId, afterId, transfer }`; result `{ changed: true, task, previous, transfer }`.
Tests first (`tasks.int.test.ts › tree`):
- AC-602: roots R1, R2 → `indentTask(R2)` → R2.parent = R1, depth 1; `indentTask(R1)` (first) → `{ changed: false }`, `updated_at` unchanged; chain A > B > C then `indentTask` on a depth-2 leaf whose previous sibling is at depth 2 → `{ changed: false }`; a task with one child (height 1) whose previous sibling is at depth 1 → `{ changed: false }`; descendants' depths updated when indenting a task with a child.
- BR-31 (M3-D2): A assigned Cindy, B assigned Ivy, `indentTask(B)` → B has Cindy + Ivy, A none, both assignment `version` bumped only for the moved one, result `transfer` lists Cindy's assignment; A assigned Ivy and B assigned Ivy → `CONFLICT` (message `th.tasks.errors.sameAssignee('Ivy')`), nothing changed; X with a child moved under assigned leaf → `CONFLICT nestUnderAssignedNeedsLeaf`.
- outdent: C (depth 2 under B under A) → parent A, placed right after B, depth 1; old parent B becomes a leaf without assignees.
- move: reorder `afterId` between siblings → order by `position, id` matches; move under own descendant → `VALIDATION cycle`; stale `afterId` → `CONFLICT`; cross-project (manager) → `VALIDATION crossProject`; undo of the BR-31 indent: `moveTask({ taskId: B, ...previous, transfer: reverseTransfer(t) })` → A has Cindy again, B only Ivy.

**S2.6 `setStatus`, `completeTask`, `uncompleteTask`, `revertTaskStatus` (FR-607/608, FR-620/626/628, BR-80–83, BR-87, M3-D5, M3-D28, M3-D38, X19, X71).** One service `src/server/services/taskStatus.ts`; every status write in the app goes through it (X71).
```ts
// Called only AFTER the action's authz (requireTasks(tx, user, taskIds, 'edit') → projectId). Returns an object (M6 adds `released`, C21).
// `today` is required and trailing (M3-D43, X90/X96): the module never imports '@/server/clock'; actions pass serverToday(), M12 scripts their own date.
export async function setStatus(tx: Tx, user: SessionUser, a: { projectId: string; taskIds: readonly string[]; statusId: string; withChildren: boolean; only?: 'open' | 'completed' }, today: ISODate): Promise<SetTaskStatusResult>
export async function revertStatuses(tx: Tx, user: SessionUser, a: { projectId: string; items: readonly { taskId: string; statusId: string; completedOn: ISODate | null }[] }, today: ISODate): Promise<SetTaskStatusResult>
```
Action shape for `setTaskStatus` / `completeTask` / `uncompleteTask` / `revertTaskStatus` (CLAUDE.md thin action): `db.transaction(async (tx) => { const acc = await authz.requireTasks(tx, user, ids, 'edit'); const r = await services.taskStatus.setStatus(tx, user, { projectId: acc.projectId, … }, serverToday()); for (const c of r.changed) await audit.log(tx, user, { entity: 'task', action: 'update', entityId: c.taskId, projectId: acc.projectId, summary: th.audit.taskStatusChanged(name, statusName) }); return r })` — `name` for each summary comes from `acc.tasks` (or one `select id, name … where id = any($changedIds)` for `withChildren` descendants), the status name from the target row; never from the client.
- `setTaskStatus({ taskIds, statusId, withChildren })` → `setStatus`: the target must be a **live status of that project** (`… where id = $s and project_id = $p and deleted_at is null`, else `NotFoundError` — no hint about other projects); `today` = the parameter; ids = `taskIds` ∪ (`withChildren` && target is `DONE` ? open live descendants : ∅); `SELECT t.id, t.status_id, t.completed_on, s.category … FOR UPDATE OF t` ordered by id; for each row whose status changes: `completionTransition({ from, to, completedOn, today })` (S1.5) → `UPDATE tasks SET status_id, completed_on, completed_by = (case when <new completed_on> is null then null when <changed> then $user else completed_by end), updated_at = now()`; `openDescendantIds` = (single task, target `DONE`, `!withChildren`) its open live descendants, else `[]` (FR-608); a parent's status never changes its children otherwise (M3-D38). Never touches `task_assignments` or (from M6) allocations (BR-87). The action (not the service) writes one audit row per changed task `th.audit.taskStatusChanged(name, statusName)` (bulk → per task, M3-D4).
- `completeTask({ taskIds, withChildren })` = `setStatus` with `firstDoneStatus(statuses)` and `only: 'open'` (BR-82); `uncompleteTask({ taskIds })` = `setStatus` with `defaultStatus(statuses)` and `only: 'completed'` (BR-81). Both return `SetTaskStatusResult`; toasts stay as X19 (no numbers).
- `revertTaskStatus({ items })` → `requireTasks(edit)` on the item task ids in the action → `revertStatuses`: every `statusId` must be a live status of that project (else `NOT_FOUND` → the client shows `restoreFailed`); `completedOn` must be non-null **iff** that status is `DONE` and `≤ today` (the parameter; else `ValidationError(th.tasks.errors.completedInFuture)`); writes exactly those values (no BR-80 recomputation → exact undo, M3-D28); returns the inverse in `changed`.
- Invariant helper `tests/helpers/invariants.ts#assertCompletionInvariant(tx)` (S0/S4 own `tests/**`; S2 calls it) = `select count(*)::int from tasks t join task_statuses s on s.id = t.status_id where (s.category = 'DONE') <> (t.completed_on is not null)` → `0`; called in `afterEach` of `task-status.int.test.ts`, `task-statuses.int.test.ts` and `tasks.int.test.ts` (R22).
Tests first (`src/server/services/task-status.int.test.ts`, `APP_NOW` pinned; direct service calls pass `today = '2026-09-30'`, the later-date case passes `'2026-10-02'`): TODO → "กำลังทำ" leaves `completed_on` null; → "เสร็จ" sets `'2026-09-30'`, `completed_week '2026-09-28'`, `completed_by = user`; with a second DONE status "ส่งมอบแล้ว", moving "เสร็จ" → "ส่งมอบแล้ว" on a later `APP_NOW` keeps `'2026-09-30'`; DONE → "รอข้อมูล" clears both columns; a status of Q → `NOT_FOUND`; a soft-deleted P status → `NOT_FOUND`; parent with two open children → target DONE → `openDescendantIds` = both, children unchanged; `withChildren: true` → children DONE too; a non-DONE target with `withChildren` leaves children untouched; `completeTask` on an already-completed id → not in `changed`; `uncompleteTask` → default status "ยังไม่เริ่ม"; `revertTaskStatus` with the `changed` previous values restores status and the exact `'2026-09-28'`; `completedOn '2026-10-01'` → `VALIDATION`; `completedOn` on a non-DONE status → `VALIDATION`; assignments untouched (BR-87); archived A → `FORBIDDEN`; exactly 1 audit row per changed task.

**S2.7 `assign`, `unassign`, `restoreAssignmentBatch` (FR-605, BR-31, BR-60, PERM-13/14, AC-203, M3-D12/13).**
- `assign({ taskIds, userId })`: `{ projectId } = requireTasks(edit)`; target user via M1's assignable-user repo (`listAssignableUsers` semantics: not banned, `deactivated_on` null) → missing → `ValidationError(th.tasks.errors.userInactive)`; `isMember(projectId, userId)` false → `requireProject(manage)` (Me → `FORBIDDEN`, rollback) then `INSERT INTO project_members (project_id, user_id, role, added_by) VALUES (…, 'MEMBER', $actor)` (BR-60, same tx); for each task ordered by id: lock `FOR UPDATE`; has live children → push `skippedParentIds` (single-task call → `ConflictError(th.tasks.errors.parentNotAssignable)`); `INSERT … ON CONFLICT (task_id, user_id) WHERE deleted_at IS NULL DO NOTHING RETURNING id` (Drizzle `onConflictDoNothing({ target: [taskAssignments.taskId, taskAssignments.userId], where: sql`deleted_at is null` })`; if the generated SQL lacks the index predicate, use a `sql` template — check with `.toSQL()` in the test) → none → `alreadyAssignedIds`; audit per created assignment `{ entity: 'task_assignment', action: 'create', summary: th.audit.assignmentCreated(task, user), after: { taskId, userId, addedMember } }` (M3-D4).
- `unassign({ assignmentIds })`: `requireAssignments(edit)` (active only, else `NOT_FOUND`); `batch = crypto.randomUUID()` (server); `UPDATE task_assignments SET deleted_at = now(), deleted_batch = $batch WHERE id = any($ids) AND deleted_at IS NULL`; audit per assignment; return `{ projectId, batch, taskIds }`. (From M6 the plans stay attached and drop out of loads through `ta.deleted_at is null`.)
- `restoreAssignmentBatch({ batch })`: rows by `deleted_batch` → none → `NOT_FOUND`; `requireAssignments(edit)`; window `deleted_at > now() - interval '30 days'` else `ConflictError(th.tasks.errors.restore.expired)`; for each row: task live and leaf (else skip); user not a member → `requireProject(manage)` + insert MEMBER; `UPDATE … SET deleted_at = null, deleted_batch = null WHERE id = $id AND NOT EXISTS (active same task+user)` → 0 rows = `skipped++` (never let `23505` escape); one audit row per restored assignment.
Tests first (`src/server/services/assignments.int.test.ts`): lead assigns member → 1 row, `version 1`, 1 audit row; lead assigns outsider → `project_members` row `MEMBER`, `added_by = lead`, audit `after.addedMember = outsider.id`, still exactly 1 audit row; member assigns outsider → `FORBIDDEN`, no member row, no assignment (rollback); deactivated user → `VALIDATION`; parent task → `CONFLICT`; bulk `[parent, leaf1, leaf2-already]` → created 1, `skippedParentIds [parent]`, `alreadyAssignedIds [leaf2]`; unassign → `deleted_batch` set, listing hides it; restore → back; **re-add then restore old batch** → `skipped: 1`, no error (r5 #10); 31-day-old batch → `CONFLICT expired`; archived A → `FORBIDDEN`.

**S2.8 `deleteTaskTree`, `restoreTaskBatch` (FR-609, BR-32, AC-603, §7.5, M3-D12/23).**
- `deleteTaskTree({ taskIds, transfer? })`: `{ projectId, tasks } = requireTasks(edit)`; roots = ids not descending from another selected id; `batch = crypto.randomUUID()`; per root `WITH RECURSIVE sub AS (…) UPDATE tasks SET deleted_at = now(), deleted_batch = $batch, updated_at = now() WHERE id IN (SELECT id FROM sub) AND deleted_at IS NULL RETURNING id`; **assignments are not touched** (M3-01 / X13); then `transfer` if given (undo of FR-610: from the deleted child back to its parent — `applyTransfer` must accept a soft-deleted `fromTask` in this one case, the `toTask` must be live); audit one row per root `th.audit.taskDeleted(name, descendants)`; return `{ projectId, batch, rootIds, deletedIds, transfer }`.
- `restoreTaskBatch({ batch, transfer? })`: rows `WHERE deleted_batch = $batch` → none → `NOT_FOUND`; `requireProject(rows[0].projectId, edit)` (archived → `FORBIDDEN`); any row `deleted_at <= now() - interval '30 days'` → `ConflictError(restore.expired)`; roots = rows whose parent is not in the batch; per root: parent (if any) must be live → else `Conflict(restore.parentDeleted)`; recompute `newDepth = parent ? parent.depth + 1 : 0`, `delta = newDepth - root.depth`, `max(depth in subtree) + delta ≤ 2` → else `Conflict(restore.tooDeep)`; parent has active assignments and no `transfer` given → `Conflict(restore.parentAssigned)`; `UPDATE tasks SET deleted_at = null, deleted_batch = null, depth = depth + $delta WHERE deleted_batch = $batch` (per root subtree for the delta); then `transfer` if given (redo of FR-610); audit one row per root `taskRestored`. Old positions are kept (ties resolve by id).
- Blockers (v3.1, FR-645, X73): `deleteTaskTree` also runs `UPDATE task_blockers SET deleted_at = now(), deleted_batch = $batch WHERE deleted_at IS NULL AND (task_id = any($deletedIds) OR blocker_task_id = any($deletedIds))`; `restoreTaskBatch` restores the edges of that batch whose other task is live (an edge whose other task was deleted in another batch stays deleted).
Tests first (`tasks.int.test.ts › delete/restore`):
- AC-603 (M3 part): parent + 3 children, child 2 assigned Ivy → delete parent → 4 rows share one `deleted_batch`, assignment row still `deleted_at IS NULL`, `listProjectTasks` shows neither the 4 tasks nor that assignment; `restoreTaskBatch` → 4 tasks back in original order, Ivy's assignment visible again on child 2 (M6 extends this test with allocations).
- BR-32 "ไม่กู้ของที่ถูกลบมาก่อนหน้า": delete child 1 (batch b1), then the parent (b2); restore b2 → parent + children 2,3 back, child 1 still deleted.
- Multi-select: `deleteTaskTree({ taskIds: [parent, child2, otherRoot] })` → roots `[parent, otherRoot]`, one batch.
- Refusals: batch 31 days old (`UPDATE tasks SET deleted_at = now() - interval '31 days' WHERE deleted_batch = $b`) → `CONFLICT` reason `expired`; delete child (b1) then parent (b2), restore b1 → `CONFLICT parentDeleted`; delete only child of P then assign P then restore → `CONFLICT parentAssigned`; P moved to depth 2 after deleting its grandchild-depth subtree → `CONFLICT tooDeep`; unknown uuid → `NOT_FOUND`; archived project → `FORBIDDEN`; W → `NOT_FOUND`.
- Exactly one audit row per root for delete and for restore.
- Blockers: `pLeaf` blocked by `pChildA` → delete `pParent` → `listProjectTasks` shows `pLeaf.blockers = { open: 0, total: 0 }` and no edge; restore → edge back, `{ open: 1, total: 1 }`; an edge to a task deleted in an earlier batch stays deleted after restoring the later batch.

**S2.9 FR-404 / BR-61 (`src/server/services/members.ts` + `src/server/actions/members.ts`, M2 files; M3-D14).** First read M2's `removeMember` service/action and keep its name, LEAD rules (X61) and undo shape.
- `removeMember` change: `n = countOpenAssignmentTasks(tx, projectId, userId)` = `count(distinct t.id)::int FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id AND t.deleted_at IS NULL WHERE t.project_id = $p AND ta.user_id = $u AND ta.deleted_at IS NULL` (completed tasks count). `n > 0` → return `{ removed: false, blockedByAssignments: n }` **without removing** (no audit row — nothing mutated). `n = 0` → M2 behaviour, plus `removed: true`.
- `removeMemberWithAssignments({ projectId, userId })`: `requireProject(manage)`; M2's LEAD rules; snapshot the member row; `batch = crypto.randomUUID()` (or `null` if the user has no active assignments in the project); `UPDATE task_assignments ta SET deleted_at = now(), deleted_batch = $batch FROM tasks t WHERE t.id = ta.task_id AND t.project_id = $p AND ta.user_id = $u AND ta.deleted_at IS NULL` (also assignments on soft-deleted tasks); `DELETE FROM project_members WHERE project_id = $p AND user_id = $u`; one audit row `{ entity: 'project_member', action: 'delete', summary: th.audit.memberRemovedWithAssignments(name, n), after: { batch, unassignedTaskCount: n } }`; `refresh()` as M2 does. Return `{ batch, member, unassignedTaskCount: n }`.
- `restoreRemovedMember({ projectId, userId, member, batch })`: `requireProject(manage)`; `INSERT INTO project_members … VALUES (…, member.role, member.addedBy, member.addedAt) ON CONFLICT DO NOTHING`; if `batch` → restore the assignment batch with the S2.7 rules (skips counted); one audit row `memberRestored`; `refresh()`.
Tests first (extend M2's `src/server/services/members.int.test.ts › FR-404`): Ivy in POS-like world with assignments on 2 live tasks (one completed) + 1 on a deleted task → `removeMember` → `{ removed: false, blockedByAssignments: 2 }`, member row still there; `removeMemberWithAssignments` → member row gone, all 3 assignments share one batch; `restoreRemovedMember` → row back with the same `role`/`added_by`/`added_at`, 3 assignments active; Me → `FORBIDDEN`; exactly one audit row per call.

**S2.10 Reads (route handlers, PERM-06, X62).**
- `src/server/services/tasks.ts#listProjectTasks(tx, user, projectId): Promise<ProjectTasksResponse>` — authz first (`requireProject(view)`, archived allowed); then two repo queries (M3-D39). `repo.tasks.listLiveWithBlockerCounts(tx, projectId)` (body in `src/server/repo/tasks.ts`; M6's grid chunk reuses it unchanged):
  ```sql
  select t.id, t.project_id, t.parent_id, t.depth, t.position, t.name, t.notes, t.start_date, t.due_date,
         t.certainty_override, t.status_id, s.category as status_category, t.completed_on, t.completed_week,
         (select count(*)::int from task_blockers b join tasks bt on bt.id = b.blocker_task_id and bt.deleted_at is null
            where b.task_id = t.id and b.deleted_at is null) as blockers_total,                       -- BR-86 (X73)
         (select count(*)::int from task_blockers b join tasks bt on bt.id = b.blocker_task_id and bt.deleted_at is null
            join task_statuses bs on bs.id = bt.status_id
            where b.task_id = t.id and b.deleted_at is null and bs.category <> 'DONE') as blockers_open
  from tasks t
  join task_statuses s on s.id = t.status_id
  where t.project_id = $1 and t.deleted_at is null
  order by t.depth, t.parent_id nulls first, t.position, t.id
  ```
  and `repo.assignments.listActiveForProject(tx, projectId)` = `select ta.id, ta.task_id, ta.user_id from task_assignments ta join tasks t on t.id = ta.task_id and t.deleted_at is null where t.project_id = $1 and ta.deleted_at is null order by ta.created_at, ta.id`; the service groups assignments by `taskId` into `assignees` (`{ assignmentId, userId }[]`, order kept) and maps rows to `TaskDTO` (drops `statusCategory`/`completedWeek`, folds the counts into `blockers`). Plus `members` (`project_members` user ids + roles), `statuses` (live, `ORDER BY position, id`), `blockerEdges` (live edges whose two tasks are live, `{ id, taskId, blockerTaskId }`) and `viewer` (`role` from `projectAccess`, `canEdit = !archived`, `canManage = role ∈ {MANAGER, LEAD} && !archived`). Map `depth` to `0|1|2`.
- `GET /api/projects/[id]/tasks` → `route(async (_req, { user, params }) => db.transaction((tx) => listProjectTasks(tx, user, params.id)))`; a malformed `id` is a 404 like an invisible project (X86: M2's `projectAccess` returns `null` for a non-uuid; same for `GET /api/projects/[id]/statuses`).
- `src/server/services/my-tasks.ts#listMyTasks(tx, user): Promise<MyTasksResponse>` (X22, M3-D8):
  ```sql
  select t.id, t.project_id, t.name, t.start_date, t.due_date, par.name as parent_name,
         p.name as project_name, p.color, p.certainty, t.created_at,
         s.id as status_id, s.name as status_name, s.color as status_color, s.category as status_category
  from task_assignments ta
  join tasks t on t.id = ta.task_id and t.deleted_at is null and t.completed_on is null
  join projects p on p.id = t.project_id and p.archived_at is null and p.deleted_at is null
  left join tasks par on par.id = t.parent_id
  join task_statuses s on s.id = t.status_id
  where ta.user_id = $1 and ta.deleted_at is null
    and not exists (select 1 from tasks c where c.parent_id = t.id and c.deleted_at is null)
  order by t.due_date nulls last, t.created_at, t.id
  ```
  Group by project in JS; sort groups with `Intl.Collator('th').compare` on the project name; `count = rows.length`. Only the caller's own rows, so no masking is involved.
- `countMyOpenTasks(tx, userId, today)` = same filters with `count(*)::int` (`today` per X90; M3 doesn't use it yet, M9 does); M2's `services/sidebar.ts#getSidebar(tx, user, today)` sets `myTaskCount: await countMyOpenTasks(tx, user.id, today)`, so `GET /api/sidebar` returns it (M9 changes its meaning, M9-D17, and adds a trailing `today` → `countMyOpenTasks(tx, userId, today)`, X90; M3's count needs no date, so M3 does not declare an unused parameter).
Tests first (`src/server/services/my-tasks.int.test.ts`): golden seed → Ivy: 2 groups (`CRM Migration`, `POS Upgrade` in collator order) with 1 task each, `count 2`; Manager: `count 0`; completing Ivy's POS task → `count 1`; archiving CRM → that group disappears; a soft-deleted assignment is excluded; a parent task is never listed. `tasks.int.test.ts › listProjectTasks`: shape (exact `TaskDTO` key set — an M3-only check that M8 updates when it adds `milestoneId`/`lateForMilestone`, M3-D42), `listLiveWithBlockerCounts` returns `statusCategory`/`completedWeek` (`pDone` → `'2026-09-28'`), `assignees` ordering, deleted rows absent, archived A readable with `canEdit: false`; `statuses` = P's 5 defaults + `pSecret` in position order; `pLeaf.blockers = { open: 1, total: 1 }` and one `blockerEdges` entry; after completing `pChildA` → `{ open: 0, total: 1 }`; `my-tasks` rows carry their status.

**S2.11 Overview progress (FR-409 part, M3-D21).** `services/projects.ts#projectProgress(tx, projectId): Promise<{ done: number; total: number }>` = `count(*) filter (where completed_on is not null)::int, count(*)::int FROM tasks WHERE project_id = $1 AND deleted_at IS NULL`. The M2 overview server component calls it after its existing authz (that page is wired by S3.13). Test: golden POS → `{ done: 0, total: 3 }`; after completing one → `{ done: 1, total: 3 }`.

**S2.12 Seed (`scripts/lib/fixtures.ts`, X11 M3 part, M3-D20).** In `seedGolden(db, { upTo })` after the M2 step: `ensureAllProjectStatuses` (5 defaults per project, X70); then for each project, the JSON `tasks[]` of that project in file order; positions `generateNKeysBetween(null, null, n)`; `insertTask({ projectId, name, depth: 0, position, certaintyOverride, createdBy: managerId, statusId: <the project's default status> })`; `insertAssignment({ taskId, userId: byNickname(assignee) })`. Never re-type data; no allocations (M6). Test (extend the existing seed test, else create `scripts/lib/fixtures.int.test.ts`): after `seedGolden` → task_statuses 25 (5 per project, in FR-621 order), tasks 10 (all depth 0, all on "ยังไม่เริ่ม", `completed_on` null), task_assignments 10, exactly one `certainty_override = 'TENTATIVE'` on "Rollout สาขา", project_members still 10; POS tasks in order "ปรับปรุงระบบ POS หน้าร้าน", "ทำ UAT + คู่มือหน้าร้าน", "Rollout สาขา" when sorted by `position, id`.

**S2.13 Error mapping.** Make sure the central DB-error mapper (M1 `errors.ts`) maps `23505` on `task_assignments_active` → `CONFLICT` and `23514` on `tasks_*_check` → `VALIDATION`; v3.1: `23505` on `task_statuses_name` → `VALIDATION` (`th.tasks.status.errors.duplicateName`), `23503` on `tasks_status_fk` / `task_blockers_*_fk` → `NOT_FOUND`, `23514` on `task_blockers_not_self` → `VALIDATION`; services above pre-empt all of them, the mapper is the backstop.

**S2.14 Task statuses (v3.1: FR-620–624, BR-81/83/84, PERM-23, X70, X72, X79, M3-D25–D27, M3-D29/30).** `src/server/services/taskStatuses.ts`:
```ts
export async function ensureProjectStatuses(tx: Tx, projectId: string): Promise<boolean>       // no live status → insert DEFAULT_STATUSES (names th.tasks.status.defaults[key], generateNKeysBetween(null, null, 5)); true if inserted
export async function ensureAllProjectStatuses(tx: Tx): Promise<number>                         // bootstrap + seed backfill (X70); projects fixed
export async function listStatuses(tx: Tx, projectId: string): Promise<TaskStatusRow[]>          // live, ORDER BY position, id
export async function statusUsage(tx: Tx, projectId: string): Promise<Record<string, number>>    // live tasks per live status
// One service per action below (same name, runs after the action's authz); the two that apply BR-80 take a required trailing `today` (M3-D43):
export async function deleteTaskStatus(tx: Tx, user: SessionUser, a: z.output<typeof deleteTaskStatusSchema>, today: ISODate): Promise<DeleteTaskStatusResult>
export async function restoreTaskStatusBatch(tx: Tx, user: SessionUser, a: z.output<typeof restoreTaskStatusBatchSchema>, today: ISODate): Promise<RestoreTaskStatusBatchResult>
```
- M2's `createProject` (`services/projects.ts`) calls `ensureProjectStatuses(tx, project.id)` in the same transaction (X70); still one audit row (M3-D4). `scripts/bootstrap.ts` runs `ensureAllProjectStatuses` after migrations (idempotent, next to M4's `ensureProjectCharters`).
- `createTaskStatus({ projectId, name, category, color, afterId? })`: `requireProject(manage)` (Me → `FORBIDDEN`, X79); `pg_advisory_xact_lock(hashtext('task_statuses:' || projectId))`; `validateStatusSet([...live, new])` → `TOO_MANY`/`DUPLICATE_NAME` → `ValidationError(th.tasks.status.errors.*)`; key between `afterId` and its next sibling (`undefined` → append; stale `afterId` → `CONFLICT` `th.tasks.errors.treeChanged`); insert; audit `statusCreated`; return `{ status }`.
- `updateTaskStatus({ statusId, patch })`: `requireStatus(manage)`; lock; duplicate check on rename; category change → `validateStatusSet` (`NO_TODO`/`NO_DONE` → `VALIDATION needTodo/needDone`); a change into or out of `DONE` while `statusUsage > 0` → `VALIDATION doneCategoryInUse` (M3-D27); audit with `before`/`after` of the changed fields.
- `reorderTaskStatus({ statusId, afterId })`: `requireStatus(manage)`; lock; same keying as tasks (X48 re-key on equal neighbours); returns `{ status, previousAfterId }`; audit `statusReordered`.
- `deleteTaskStatus({ statusId, moveToStatusId? })` (X72, M3-D29): `requireStatus(manage)`; lock; `validateStatusSet(live minus it)` → `NO_TODO`/`NO_DONE` → `VALIDATION`; `n = usage`; `n > 0` and no destination → `VALIDATION needDestination`; destination must be live, same project, ≠ the status (else `NOT_FOUND`); `batch = crypto.randomUUID()`; select the live tasks on it `FOR UPDATE` (→ `moved` with their `completedOn`), then move **all** tasks on it (also soft-deleted ones) to the destination applying `completionTransition({ …, today })` per task; `UPDATE task_statuses SET deleted_at = now(), deleted_batch = $batch`; audit one row `statusDeleted(name, n)`; return `{ projectId, batch, moveToStatusId, moved }`.
- `restoreTaskStatusBatch({ batch, moveToStatusId, moved })`: status by `deleted_batch` → none → `NOT_FOUND`; `requireProject(manage)`; `deleted_at <= now() - interval '30 days'` → `CONFLICT` `th.tasks.errors.restore.expired`; `validateStatusSet([...live, it])` → `TOO_MANY`/`DUPLICATE_NAME` (a same-named status was created meanwhile) → `CONFLICT` with that reason; un-delete (old position kept); then for each `moved` item: only a live task of this project whose `status_id` is still `moveToStatusId` gets `status_id = fromStatusId`, `completed_on = item.completedOn` (must be consistent with the restored category and ≤ `today`, else skipped); return `{ status, restored, skipped }` (never clobbers later edits, X72); audit `statusRestored`.
Tests first (`src/server/services/task-statuses.int.test.ts`): `createProject` → 5 statuses ยังไม่เริ่ม, กำลังทำ, รอข้อมูล, ติดปัญหา, เสร็จ with categories TODO, IN_PROGRESS, WAITING, WAITING, DONE (AC-611); `ensureAllProjectStatuses` twice → second run returns 0; AC-612 as lead: create "รอลูกค้ายืนยัน" (`WAITING`) with `afterId` = "ติดปัญหา" → order …, ติดปัญหา, รอลูกค้ายืนยัน, เสร็จ; as member → `FORBIDDEN`, nothing inserted; 13th live status → `VALIDATION tooMany`; " เสร็จ" / "เสร็จ" duplicate → `VALIDATION duplicateName`; deleting the only TODO → `VALIDATION needTodo`; changing the only DONE to WAITING → `VALIDATION needDone`; changing "เสร็จ" (used by a task) to WAITING while a second DONE exists → `VALIDATION doneCategoryInUse`; AC-614: three tasks on "รอข้อมูล" → delete with destination "กำลังทำ" → 3 in `moved`, status soft-deleted with the batch; restore → status back at its old position and the 3 tasks back; a task changed to "ติดปัญหา" between delete and restore stays there (`skipped: 1`); delete a used DONE status (another DONE exists) with destination "ยังไม่เริ่ม" → `completed_on` cleared; restore → exact dates back; delete without destination while used → `VALIDATION needDestination`; reorder returns `previousAfterId` and reordering back restores the order; archived A → `FORBIDDEN`; one audit row per call; invariant (S2.6) after each case.

**S2.15 Blockers (v3.1: FR-640–645, BR-85/86, D12, X73, M3-D31/32, M3-D43).** `src/server/services/taskBlockers.ts` — `addTaskBlocker(tx: Tx, user: SessionUser, a: z.output<typeof addTaskBlockerSchema>): Promise<AddTaskBlockerResult>` and `removeTaskBlocker(tx, user, a): Promise<RemoveTaskBlockerResult>` (no `today`); the action does the `requireTask` call, the **service** writes the audit row (M12 `AUDIT_IN_SERVICE.addTaskBlocker = true`):
- `addTaskBlocker({ taskId, blockerTaskId })`: `{ projectId } = requireTask(taskId, edit)`; blocker task live → missing → `NOT_FOUND`; in another project → `projectAccess(user, other)` is `null` → `NOT_FOUND`, else `ValidationError(th.tasks.blockers.errors.crossProject)` (D12, BR-33 pattern); `pg_advisory_xact_lock(hashtext('task_blockers:' || projectId))`; load the project's live edges between live tasks and a `parentOf` map; `checkBlocker` (S1.6): `SELF`/`ANCESTRY` → `VALIDATION`; `DUPLICATE` → return the existing edge with `created: false` (no audit); `CYCLE` → `ValidationError(th.tasks.blockers.errors.cycle(path names joined ' → '))` (same-project names only); insert; the service writes audit `blockerAdded` (entity `task_blocker`); return `{ projectId, edge, created: true }`.
- `removeTaskBlocker({ blockerId })`: live edge → else `NOT_FOUND`; `requireTask(edge.taskId, edit)`; `UPDATE task_blockers SET deleted_at = now() WHERE id = $id` (`deleted_batch` stays null — batches are only for tree deletion, SPEC §7.8, M3-D31); the service writes audit `blockerRemoved`; return `{ projectId, edgeId, taskId, blockerTaskId }` (undo = `addTaskBlocker` on the same pair).
Tests first (`src/server/services/task-blockers.int.test.ts`): AC-615: B blocked by A → B `{ open: 1, total: 1 }`; A blocked by B → `VALIDATION` with message `th.tasks.blockers.errors.cycle('B → A → B')`; indirect three-task cycle rejected with the 4-element path; child blocks parent → `VALIDATION ancestry`; duplicate → same edge id, `created: false`, still one audit row in total; Q task as manager → `VALIDATION crossProject`, as lead → `NOT_FOUND`; complete A → B `{ open: 0, total: 1 }`, B's `status_id` unchanged (FR-644); remove → `{ open: 0, total: 0 }` and the removed row has `deleted_batch IS NULL` (a later `restoreTaskBatch` of an unrelated batch leaves it deleted); re-add after remove → a new edge; archived A (`aTask`, `aTask2`) → `FORBIDDEN`; concurrent `A→B` and `B→A` via `Promise.all` → exactly one succeeds (advisory lock, R23).

**S2.16 Status and cross-project reads (v3.1: FR-665, §7.8, X75, M3-D33/37).**
- `GET /api/projects/[id]/statuses` → `requireProject(view)` (archived readable) → `{ statuses, usage: statusUsage(...), canManage }`.
- `GET /api/tasks` → `teamTasksQuerySchema.parse(...)` → `services/teamTasks.ts#listTeamTasks(tx, user, q)`; `vis = await visibleProjectIds(tx, user)` (X30/X43); `q.projectId` not in `vis` → `NotFoundError`. One query, visibility in SQL (never filtered on the client):
  ```sql
  select t.id, t.project_id, t.name, t.due_date, t.completed_on, t.position,
         coalesce(t.certainty_override, p1.certainty_override, p2.certainty_override, p.certainty) as certainty,   -- BR-35 as §6.5
         p1.name as parent_name, p2.name as grandparent_name,
         s.id as status_id, s.name as status_name, s.color as status_color, s.category as status_category,
         coalesce((select json_agg(ta.user_id order by ta.created_at, ta.id) from task_assignments ta
                   where ta.task_id = t.id and ta.deleted_at is null), '[]') as assignee_ids,
         <blockers_total>, <blockers_open>                                                                    -- as S2.10
  from tasks t
  join projects p on p.id = t.project_id and p.archived_at is null and p.deleted_at is null
  join task_statuses s on s.id = t.status_id
  left join tasks p1 on p1.id = t.parent_id
  left join tasks p2 on p2.id = p1.parent_id
  where t.deleted_at is null and t.project_id = any($vis::uuid[])
    and ($projectId::uuid is null or t.project_id = $projectId)
    and ($userId::text is null or exists (select 1 from task_assignments ta where ta.task_id = t.id and ta.user_id = $userId and ta.deleted_at is null))
    and ($positionId::uuid is null or exists (select 1 from task_assignments ta join "user" u on u.id = ta.user_id
                                              where ta.task_id = t.id and ta.deleted_at is null and u.position_id = $positionId))
    and ($categories::task_status_category[] is null or s.category = any($categories))
    and ($includeDone or s.category <> 'DONE')
    and (not $blocked or <blockers_open> > 0)
    and ($cursor::text is null or (coalesce(t.due_date, 'infinity'::date), t.project_id, t.position, t.id) > ($cDue, $cProject, $cPosition, $cId))
  order by coalesce(t.due_date, 'infinity'::date), t.project_id, t.position, t.id
  limit 201
  ```
  200 rows → `cards` (+ `nextCursor` = base64url JSON of the 200th sort tuple when a 201st exists); `projects` and `statusesByProject` only for project ids present in the page (all visible by construction); `parentPath` = `[grandparent, parent]` without nulls.
Tests first (`src/server/services/team-tasks.int.test.ts`): golden as Peter → exactly 'ย้าย pipeline ขึ้น BigQuery', 'ทำ dashboard ผู้บริหาร', 'เก็บ requirement + สรุป'; `JSON.stringify(body)` contains no name of POS/Mobile/CRM tasks or projects (AC-616); as Manager → 10 cards; `userId = Ivy` → Ivy's 2; `category=DONE&includeDone=1` → none until one is completed; `blocked=1` → only tasks with open blockers; 205 synthetic tasks in one project → page 1 = 200 + `nextCursor`, page 2 = 5, no duplicates, order by due date nulls last; `projectId` of an invisible project → `NOT_FOUND`; an archived project's tasks are absent; `GET /api/projects/{P}/statuses` usage counts match `listProjectTasks`.

**S2.17 Done-check.** `pnpm db:up` · `pnpm vitest run --project integration src/server scripts` · `pnpm vitest run --project integration tests/authz/matrix.int.test.ts` (once S4's rows exist: all PERM-06/08/11/13/14/23 rows and the T-TEAM rows green) · `pnpm eslint src/server src/app/api scripts` · `pnpm typecheck` (own paths clean). Report any contract change as a `request`.

### 5.S3 — Tasks UI (frontend-engineer · owns `src/app/(app)/**`, `src/components/**`, `src/hooks/**`, `src/lib/shortcuts.ts`)

MUI 9 only (`slots`/`slotProps`, `sx`, no system props, `Grid size`; r1 §8.6). Dense rows are plain elements styled with a CSS Module (`TaskRow.module.css`) reading MUI/SPEC CSS variables; MUI components only for controls (Checkbox, Chip, IconButton, Menu, Autocomplete, Select, Switch, Drawer-less `aside`). Every string from `th` (lint bans Thai literals). Client code never imports `src/server/**` except the `'use server'` action modules, never calls `crypto.randomUUID` (use `tempId()`), never uses `localStorage`. No confirm dialogs anywhere in this stream.

**S3.1 Data layer (`src/components/tasks/useProjectTasks.ts`, `useTaskMutations.ts`).**
```ts
export function useProjectTasks(projectId: string) {
  return useQuery({ queryKey: qk.projectTasks(projectId),
    queryFn: ({ signal }) => getJson<ProjectTasksResponse>(`/api/projects/${projectId}/tasks`, { signal })   // M2 src/lib/api.ts })
}
export function useTaskMutations(projectId: string): {
  create(v: { parentId: string | null; afterId?: string | null; name: string; statusId?: string }): void   // statusId: board column quick add (FR-664); M10's embed board uses it too
  update(taskId: string, patch: TaskPatch): void
  indent(taskId: string): void; outdent(taskId: string): void
  move(v: { taskId: string; parentId: string | null; afterId: string | null }): void
  complete(taskIds: string[], o?: { withChildren?: boolean }): void; uncomplete(taskIds: string[]): void
  setStatus(taskIds: string[], statusId: string, o?: { withChildren?: boolean }): void          // v3.1 (X71)
  addBlocker(taskId: string, blockerTaskId: string): void; removeBlocker(edgeId: string, label: string): void
  remove(taskIds: string[]): void
  assign(taskIds: string[], userId: string): void; unassign(assignmentIds: string[], label: string): void
}
```
- Every mutation: `useMutation({ mutationKey: ['tasks', projectId], scope: { id: 'tasks:' + projectId }, … })` so they run in order (r4 §6) — the server dispatches actions one at a time anyway.
- `mutationFn` resolves temporary ids **at send time** through `idMap.current` (temp → real, filled by `create`'s `onSuccess`), then `unwrap(await action(input))` (`src/lib/action-result.ts`).
- `onMutate`: `await qc.cancelQueries({ queryKey: qk.projectTasks(projectId) })`, snapshot, apply the S1.4 `patch*` helper; `create` inserts a temp row (`tempId()`, provisional key via `generateKeyBetween` — display only, M3-D11).
- `onError`: if `qc.isMutating({ mutationKey: ['tasks', projectId] }) === 1` restore the snapshot, else `invalidateTasks`; toast `error.message` (Thai from the server) — `CONFLICT treeChanged` additionally refetches and shows `th.tasks.toast.treeChanged`.
- `onSettled`: `invalidateTasks(qc, projectId)`; for certainty override, complete/uncomplete/setStatus/revert, delete/restore, assign/unassign and any result with a `transfer`: also `invalidateLoad(qc)` (X18).
- `indent`/`outdent` with `{ changed: false }` → no undo entry, no toast (AC-602 silent).

Undo/toast matrix (all through M1's `useUndo().push(entry, { toast? })`; toast = sonner `duration: 8000` with `th.undo.undo` action; labels from `th.tasks.undoLabel`):

| Operation | Toast | `undo()` | `redo()` |
|---|---|---|---|
| create (no transfer) | — | `deleteTaskTree({ taskIds:[id] })` | `restoreTaskBatch({ batch })` |
| create with `transfer` (FR-610) | `movedAssignees(n, childName)` | `deleteTaskTree({ taskIds:[child], transfer: reverseTransfer(t) })` | `restoreTaskBatch({ batch, transfer: t })` |
| indent / outdent / move / moveUp / moveDown / drag | `movedAssignees` only when `transfer` | `moveTask({ taskId, ...previous, transfer: t && reverseTransfer(t) })` | `moveTask({ taskId, ...newPlacement, transfer: t })` |
| complete (leaf or bulk) | `completed` / `completedMany(n)` (X19, no numbers) | `revertTaskStatus({ items: changed → previous })` (M3-D28) | `completeTask({ taskIds: changed ids })` |
| complete — or set a `DONE` status on — a parent with open children (FR-608) | `askChildren` with action `completeAll` (→ `setTaskStatus({ taskIds:[id], statusId, withChildren:true })`, pushes its own entry) and cancel `th.undo.undo` | `revertTaskStatus` | `setTaskStatus` |
| uncomplete | `uncompleted` | `revertTaskStatus({ items })` (exact date back) | `uncompleteTask` |
| set status (chip, `S` menu, board drag, bulk) | `th.tasks.status.toast.changed(name)` / `changedMany(n, name)` | `revertTaskStatus({ items })` | `setTaskStatus({ taskIds, statusId })` |
| add blocker | `th.tasks.blockers.toast.added(name)` | `removeTaskBlocker({ blockerId })` | `addTaskBlocker` (same pair) |
| remove blocker (×) | `th.tasks.blockers.toast.removed(name)` | `addTaskBlocker` (same pair; failure → `restoreFailed`) | `removeTaskBlocker` (new edge id) |
| delete (single / multi) | `deleted(name)` / `deletedWithChildren(name, n)` / `deletedMany(n)` | `restoreTaskBatch({ batch })` | `deleteTaskTree({ taskIds: rootIds })` (keeps the new batch for the next undo) |
| assign | `assigned(name)` / `assignedAddedMember(name)` / `assignedMany(name, n)` | `unassign({ assignmentIds: created })` | `restoreAssignmentBatch({ batch })` |
| unassign (× on chip) | `unassigned(name)` | `restoreAssignmentBatch({ batch })` → `skipped > 0` → toast `restoreSkipped` | `unassign({ assignmentIds })` |
| restore failure (`CONFLICT`) | `restoreFailed(error.message)` | — | — |

Text edits (name, notes, dates, certainty) get **no** global undo entry (r6a M3-11).

**S3.2 `src/components/tree/SortableTree.tsx` (shared; M4 reuses with `maxDepthIndex 9`).** Start from `plan/research/snippets/r4/client/components/tree/SortableTree.tsx`, with these changes:
```ts
export type MoveIntent = { id: string; parentId: string | null; afterId: string | null }
export function SortableTree(props: {
  items: readonly FlatItem[]          // visible rows (collapsed subtrees removed)
  fullItems: readonly FlatItem[]      // for subtreeHeight of collapsed rows
  maxDepthIndex: number               // tasks 2 (TASK_MAX_DEPTH_INDEX)
  disabled: boolean                   // grouped/sorted/archived → no DnD at all
  onMove: (m: MoveIntent) => void     // intent only — the server generates the key (M3-D11)
  renderRow: (item: FlatItem, s: { depth: number; invalid: boolean; handle: { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> } }) => ReactNode
}): JSX.Element
```
- Sensors: `PointerSensor` with `activationConstraint: { distance: 4 }` only (M3-D10). Listeners go on the handle via `setActivatorNodeRef`, not the row.
- `onDragEnd`: valid projection → `onMove({ id, parentId: p.parentId, afterId: p.prevSiblingId })`; invalid → nothing (like over-limit Tab).
- Invalid drop while dragging: render `th.tasks.dropInvalid` with a `BlockOutlined` icon in the active row (not colour only) + dashed outline.
- `<DragOverlay modifiers={[restrictToVerticalAxis]}>` — **never** modifiers on `DndContext` (r4 §19).

**S3.3 `src/components/tasks/QuickAdd.tsx` (FR-602, AC-601).** Props `{ depth: number; disabled: boolean; inputRef: Ref<HTMLInputElement>; onCreate(name: string): void; onEscape(): void }`. A small `TextField` (`placeholder={th.tasks.quickAdd.placeholder}`, `slotProps={{ htmlInput: { 'aria-label': th.tasks.quickAdd.label } }}`) indented by `depth`. Enter (ignore `e.nativeEvent.isComposing`): `name.trim()` empty → no-op; else `onCreate(name)`, clear, keep focus. Escape → `onEscape()`. The list keeps one quick-add anchor `{ parentId, afterId, depth }` (default: end of root list); after each create the anchor moves to "after the new task" (so the next Enter creates the next sibling below, M3-D18).

**S3.4 `src/components/tasks/TaskList.tsx` + `TaskRow.tsx` (FR-603/606/607/613/614, §8.6, M3-D18/19/22).**
```ts
export interface TaskListProps { projectId: string }   // data via useProjectTasks(projectId), prefs via usePreferences(), panel via ?task= (M3-D17)
export function TaskList(p: TaskListProps): JSX.Element
// M10-D9 adds exactly one optional prop `embed?: TaskListEmbedOptions` ({ filter, limit, onOpenTask, onCount? }) to TaskListProps;
// keep every behaviour below inside TaskList (not in TasksView) so that prop can switch it off, and register `N` with an `enabled` flag.
```
- Data: `rows = visibleRows(buildTaskRows(data.tasks), { collapsed, showCompleted })`, then `groupTasks`/`sortRows` per preferences; `ops = treeOpsEnabled(groupBy, sort, data.viewer.canEdit)`.
- Container `role="treegrid"` `aria-label={th.tasks.listLabel}`; each row `role="row"`, `aria-level={depth + 1}`, `aria-selected`, `aria-expanded` (only when it has children), accessible name = task name; roving `tabIndex` (focused row 0, others −1).
- Row content: drag handle (`aria-label={th.tasks.dragHandle}`, only when `ops`); ▸/▾ toggle (`th.tasks.expand`/`collapse`); `Checkbox` (`aria-label={th.tasks.completeCheckbox(name)}`); name via M2's `InlineEditText`; `StatusChip` (S3.15, click → `StatusMenu`); `BlockerBadge` (S3.17) when `blockers.total > 0`; `CertaintyBadge` ◐ + visually-hidden `th.tasks.tentativeMarker` when `taskCertainty(...).value === 'TENTATIVE'`; assignee chips (`UserName`/`UserAvatar`, × with `aria-label={th.tasks.picker.removeChip(name)}`) on leaves, read-only union chips on parents (`unionAssigneeIds`), or an outlined "รอมอบหมาย" chip (text, FR-606); date range (`formatThaiDate` from `src/lib/format.ts`); `th.tasks.completedOn(date)` when done; open-panel `IconButton`; row menu (`th.tasks.rowMenu.*`; move/indent items disabled when `!ops`; "เพิ่มงานย่อย" hidden at depth 2).
- Completed rows: `text-decoration: line-through` + checked box (state not by colour alone).
- Keyboard (on the treegrid, only when the event target is a row, not an input):

| Key | Action |
|---|---|
| ↑ / ↓ | move focus; with Shift extend selection (`rangeSelect`) |
| ← / → | collapse / expand (in-memory, M3-D19) |
| Enter | open quick add right below the focused row at its level (M3-D18) |
| F2 | rename |
| Tab / Shift+Tab | `indent` / `outdent` focused row (single selection only); when `!ops` → info toast `th.tasks.treeOpsDisabled`, no call; `preventDefault` always |
| Mod+Enter | toggle done for the selection (all done → `uncomplete`, else `complete` the open ones) |
| Delete / Backspace | `remove(topLevelSelected(rows, selection))` |
| Space | open the panel for the focused row (`preventDefault` to avoid scroll) |
| S | open `StatusMenu` for the selection (FR-626, `e.code === 'KeyS'`; type to filter, Enter applies, Esc closes); works in every grouping/sort |
| Esc | clear selection (the panel handles its own Esc) |
- Mouse: click selects one; Mod+click `toggleSelect`; Shift+click `rangeSelect` from the anchor (FR-614).
- `N` (`e.code === 'KeyN'`, no modifiers, outside editable targets — via M0's `useHotkeys(bindings, { enabled: canEdit })`, registered while this view is mounted) focuses the quick-add input (M3-D9; M10 sets `enabled: !embed && canEdit`).
- Archived: `canEdit = false` → banner `th.tasks.readOnlyArchived`, no quick add, no handles, checkboxes/menus disabled.
- Empty project: `EmptyState` with `th.tasks.empty` + the quick-add row.

**S3.5 Toolbar (`src/components/tasks/TaskToolbar.tsx`, FR-613, FR-660).** A `ToggleButtonGroup` ลิสต์ · บอร์ด bound to `tasks.view` (FR-660, X74), `Select` for `tasks.groupBy` (`th.tasks.groupBy.*`, four options: none / status / assignee / certainty — no milestone option, X21), `Select` for `tasks.sort` (`th.tasks.sort.*`), `Switch` "แสดงงานที่เสร็จแล้ว" for `tasks.showCompleted` — all via M1's `usePreferences()` (`setPreference` is debounced and server-persisted; X05). Grouped view renders a section header per `TaskGroup` (`th.tasks.groups.*`, assignee groups show `UserName`, status groups show `StatusChip` + count) and each row's `parentPath` via `th.tasks.groups.parentPath`.

**S3.6 Task panel + `DateField` (FR-601, FR-611, BR-36, X50, M3-D17).**
- `src/components/tasks/TaskPanel.tsx`: `<aside aria-label={th.tasks.panel.label}>` 440 px wide, laid out **beside** the list (flex row; the list shrinks — no overlay, no Drawer). Opens from Space, the open icon or a deep link; id from `useSearchParams().get('task')`; open = `window.history.pushState(null, '', '?task=' + id)`, close (Esc or ✕ `th.tasks.panel.close`) = `replaceState` without the param. Esc closes only when no MUI popup is open and the target is not an input being edited (`InlineEditText` stops propagation of its own Esc).
- Task not in `data.tasks` → "ไม่พบงาน" (`th.tasks.panel.notFound`), no other content.
- Fields: name (`InlineEditText`); notes (multiline `TextField`, saved on blur); start/due (`DateField`, `maxDate`/`minDate` cross-limits, inline error `th.tasks.errors.dueBeforeStart`); certainty `ToggleButtonGroup` exclusive: ตามต้นทาง (`null`) · แน่นอน · อาจไม่ทำ, and beneath it the BR-36 source of the **effective** value: `source === 'task'` → `th.tasks.certainty.source.task`; `'ancestor'` → `source.ancestor(sourceTaskName)`; `'project'` → `source.project`; assignees (leaf: chips + "+ คน" picker; parent: union chips read-only + `parentAssigneesHint`); status (`StatusChip` + `StatusMenu`, FR-626); `BlockersSection` (S3.17: "ถูกขวางโดย" + "กำลังขวาง"); completion checkbox (`th.tasks.panel.completed`); subtasks list + "+ เพิ่มงานย่อย" (hidden at depth 2) using `create({ parentId: id })`; delete button (no confirm, undo toast). No "วางแผน" button (M6) and no milestone field (M8).
- `src/components/common/DateField.tsx`:
  ```ts
  export function isoToDayjs(iso: ISODate | null): Dayjs | null      // iso ? dayjs(iso, 'YYYY-MM-DD') : null
  export function dayjsToIso(d: Dayjs | null): ISODate | null        // d && d.isValid() ? d.format('YYYY-MM-DD') : null
  export function DateField(p: { label: string; value: ISODate | null; onChange(v: ISODate | null): void
    minDate?: ISODate; maxDate?: ISODate; disabled?: boolean; error?: string }): JSX.Element
    // <DatePicker value={isoToDayjs(value)} onChange={(d) => onChange(dayjsToIso(d))}
    //   slotProps={{ textField: { size: 'small', label, error: !!error, helperText: error }, field: { clearable: true } }} />
  ```
  Only this file converts ISO ↔ Dayjs (r1 §9).

**S3.7 Assignee picker (FR-605, BR-60, AC-203, X62).** Extend M2's `PersonPicker` **additively** — its props `{ options: PersonOption[]; excludeIds?; onSelect(p: PersonOption): void; label; disabled?; value? }` stay unchanged for the members panel; add two optional props `memberIds?: ReadonlySet<string>` (when given, options not in it render the secondary text `th.tasks.picker.willBecomeMember`) and `keepOpen?: boolean` (`disableCloseOnSelect` + clear the input after a pick so several people can be added) and an optional `noOptionsText?: string`. New wrapper `src/components/tasks/AssigneePicker.tsx` `({ taskId, projectMemberIds, assignedUserIds, canManage })`: `options` = M2's `usePeopleOptions()` (`qk.peopleOptions()`, X09) — `PersonPicker` already drops `active === false` (deactivated users never appear, AC-203) — narrowed to `projectMemberIds` when `!canManage` (Me picker = members, X62); `excludeIds = assignedUserIds`; `memberIds = projectMemberIds` only when `canManage`; `label = th.tasks.picker.label`, `noOptionsText = th.tasks.picker.noOptions`; search by name, nickname and position is M2's `filterPeople`. Each pick → `assign([taskId], p.id)`. Test `AssigneePicker.test.tsx`: as MEMBER only members are offered and no hint renders; as LEAD a non-member shows "จะถูกเพิ่มเป็นสมาชิก"; an inactive person is absent; two picks without reopening call `assign` twice.

**S3.8 Undo/toast wiring** per the S3.1 matrix, using M1's `UndoProvider` (`useUndo().push`). The FR-608 toast uses sonner `action` = "ติ๊กทั้งหมด" and `cancel` = "เลิกทำ".

**S3.9 Bulk bar (`src/components/tasks/BulkBar.tsx`, FR-614).** Visible when ≥ 2 rows are selected: `th.tasks.bulk.selected(n)` · ติ๊กเสร็จ (`complete`) · เปลี่ยนสถานะ (`StatusMenu` → `setStatus(ids, statusId)`) · มอบหมาย (PersonPicker single pick → `assign(leafIds, userId)`; parents skipped server-side) · ลบ (`remove(topLevelSelected)`) · ยกเลิกการเลือก. No milestone action (X21). `role="toolbar"` with an `aria-label`.

**S3.10 FR-404 toast (M2 members panel, e.g. `src/components/projects/MembersPanel.tsx`).** When `removeMember` returns `{ removed: false, blockedByAssignments: n }`: sonner toast `th.members.assignmentsBlock.message(n)` with `action` = `unassignAll` → `removeMemberWithAssignments({ projectId, userId })` → push one undo entry (`undo` = `restoreRemovedMember({ projectId, userId, member, batch })`, `redo` = `removeMemberWithAssignments` again) + toast `removedWithAssignments(name, n)`; `cancel` = `cancelRemove` → dismiss (member kept). Afterwards `invalidateTasks(qc, projectId)` and `invalidateLoad(qc)`; the member list updates through the action's `refresh()` (M2 pattern).

**S3.11 `?` help + `N` (X07, §8.6).** `src/components/shell/ShortcutHelp.tsx`: MUI `Dialog` (`slotProps.paper`), title `th.shortcuts.title`, one section per `SHORTCUT_SCOPES` (`th.shortcuts.scopes.*`), each `ShortcutDef` as a row of `<kbd>` keys (`th.shortcuts.keys[token]`, `Mod` → `keys.ModMac` on Apple platforms else `keys.Mod`) and its label; Esc closes. Mount it in M0's `AppShell` and register `?` globally through `useHotkeys` (`e.code === 'Slash' && e.shiftKey`, fallback `e.key === '?'`; ignored in editable targets and when `e.defaultPrevented`, X49).

**S3.12 `/my` + nav (X22, X33, M3-D8, NFR-07b).**
- `src/app/(app)/my/page.tsx` (server shell, `requirePageUser()` from the layout) → `src/components/tasks/MyTasks.tsx` (client): `useQuery(qk.myTasks(), GET /api/tasks/my)`; one section per project (name + `ProjectChip`), rows: `StatusChip` (read-only, FR-667 M3 part), checkbox (`complete([id])` with the S3.1 undo entry and toast; optimistic strike-through, removed on settle), name, `th.my.inParent(parentName)`, `th.my.due(formatThaiDate(dueDate))`; clicking the name → `router.push('/projects/' + projectId + '/tasks?task=' + id)`. Empty → `th.my.empty`. Single-column layout that works at 390 px (no fixed widths).
- Sidebar (M3-D40, X33/X75): in M0's `src/components/shell/nav.ts` extend `NavIcon` with `'my' | 'teamTasks'`, add `export type NavBadge = 'myTaskCount'` and `badge?: NavBadge` to `NavItem` (M9 widens the union to `'myTaskCount' | 'workloadOver'`), and append to `PRIMARY_NAV` after `home`: `{ id: 'my', href: '/my', label: th.nav.my, icon: 'my', badge: 'myTaskCount' }`, then `{ id: 'tasks', href: '/tasks', label: th.nav.teamTasks, icon: 'teamTasks' }` (§8.1 order). `Sidebar.tsx`: icon map `my: CheckBoxOutlined`, `teamTasks: ViewKanbanOutlined` (`@mui/icons-material/*` path imports); for an item with `badge === 'myTaskCount'` render `useQuery(qk.sidebar()).data?.myTaskCount` as visible text after the label (and in the collapsed tooltip) — not a coloured dot; nothing while loading. It updates through `qk.sidebar()` invalidation. Test `Sidebar.test.tsx` (extend M0's): with a mocked sidebar response `{ myTaskCount: 2 }` the "งานของฉัน" link's accessible text contains `2`; "งานของทีม" follows it.

**S3.13 Project tab, overview progress.** In M2's `src/components/projects/project-tabs.ts` (M2-D10): `ProjectTabId` gains `'tasks'` and `PROJECT_TABS` gains `{ id: 'tasks', order: 2, label: th.projects.tabs.tasks }` (M3-D40; M2's scale ภาพรวม 0 · แผนงาน 1 · งาน 2 · เอกสาร 3 — M6 inserts `plan` between 0 and 2, M4 appends `pages` after 2); `projectTabHref(id, 'tasks')` → `/projects/<id>/tasks`. The sidebar project sub-links reuse `PROJECT_TABS` automatically (M2). Update M2's `ProjectTabs.test.tsx` expectation (two tabs: ภาพรวม then งาน). `src/app/(app)/projects/[id]/tasks/page.tsx`: `const { id } = await params` (Next 16 async params, `PageProps<'/projects/[id]/tasks'>`), authz is in the layout (before any Suspense, X41), render `<TasksView projectId={id} />` (client: toolbar + list + bulk bar + panel). Overview (`…/overview/page.tsx`): render `th.tasks.progress(done, total)` from `projectProgress` (S2.11) and the `StatusSettings` section (S3.18).

*(S3.14 is intentionally unused — the numbers S3.15–S3.19 are referenced verbatim by m06, m08, m09 and m10.)*

**S3.15 `StatusChip` + `StatusMenu` (`src/components/tasks/status/`, v3.1: FR-626/627, M3-D25).** `StatusChip({ status, onClick?, size? })`: MUI `Chip` (outlined) with the category icon — `RadioButtonUncheckedOutlined` TODO · `TimelapseOutlined` IN_PROGRESS · `PauseCircleOutlined` WAITING · `CheckCircleOutlined` DONE **[likely]** — the status name as label, an 8 px colour dot (`aria-hidden`), text in the default foreground; a visually-hidden `th.tasks.status.categories[category]`; when clickable, `aria-haspopup="menu"` and name `th.tasks.status.menuLabel(name)`. `StatusMenu({ statuses, currentId, anchorEl, onPick, onClose })`: MUI `Menu` with an `autoFocus` filter field (`th.tasks.status.filter`), items in position order (icon + name + category caption, current one `aria-checked`), ↑/↓ + Enter apply, Esc closes. Used by rows, panel, bulk bar, board cards, `/tasks`.

**S3.16 Board (`src/components/tasks/board/`, v3.1: FR-660–664, X74, M3-D35).**
- `TasksView` renders `TaskList` or `TaskBoard` per `tasks.view`; the toolbar shows group/sort in list view and the board filters (assignee `Select` over members, `Switch` `tasks.board.leafOnly`, `Switch` `tasks.board.hideDone`) in board view; columns from `buildStatusColumns` (S1.4).
- `TaskBoard<C>(p: TaskBoardProps<C>)` — generic so `/tasks`, M9 and M10 reuse it (X74). Props are pinned (M10 `EmbeddedTasks` and M9's person tab call it verbatim; later milestones only add optional props):
  ```ts
  // src/components/tasks/board/TaskBoard.tsx — BoardColumn<C> from S1.4 (src/lib/tasks/board.ts)
  export interface TaskBoardProps<C extends { id: string }> {
    columns: readonly BoardColumn<C>[]
    renderCard(card: C): ReactNode                          // content only; TaskBoard wraps it in the draggable, focusable slot + handle
    onMove(cardId: string, toColumnKey: string): void       // only when toColumnKey ≠ the card's column (FR-662); the caller maps key → status
    canEdit: boolean                                        // false → no handles, no drag, no footer
    footer?(column: BoardColumn<C>): ReactNode              // e.g. the column quick add (FR-664); rendered only when canEdit
  }
  // src/components/tasks/board/TaskCard.tsx — the card component; `import type { TaskCard as TaskCardDTO } from '@/lib/contracts/tasks'`
  export interface TaskCardProps {
    card: TaskCardDTO                                       // project board maps TaskRowModel → this shape with toCardModel(row, statuses) (S1.4)
    statuses: readonly TaskStatusDTO[]                      // StatusMenu options (project's statuses; /tasks: statusesByProject[card.projectId])
    canEdit: boolean
    blockerNames?: readonly string[]                        // tooltip names — project views only (/tasks: counts only, §7.8)
    onOpen(taskId: string): void                            // Enter/Space/click → panel (?task=) or navigation
    onPickStatus(taskId: string, statusId: string): void    // `S` menu and chip
    onToggleDone(taskId: string): void                      // Mod+Enter
    // M8 adds `milestone?: { name: string; late: boolean } | null` (S4.7) — absent renders exactly as M3
  }
  export function TaskCard(p: TaskCardProps): JSX.Element
  ```
  Layout: a horizontally scrolling row of `BoardColumn`s (`role="group"`, `aria-label={th.tasks.board.column(name, n)}`, header = `StatusChip` or category label + count); each column is a `useDroppable({ id: column.key })` **[likely]**; cards use `useDraggable` with handle-only listeners (`th.tasks.board.cardDragHandle(name)`), `PointerSensor` `activationConstraint: { distance: 4 }` (M3-D10) and a `DragOverlay`; `onDragEnd` with `over` ≠ origin column → `onMove(cardId, columnKey)`; same column → nothing (FR-662).
- `TaskCard`: name (struck through when DONE), parent breadcrumb (`th.tasks.groups.parentPath`), assignee avatars or "รอมอบหมาย", due date, `BlockerBadge`, ◐ + hidden text when tentative; focusable with roving `tabIndex` (arrows move within/between columns, handled by `TaskBoard`), Enter/Space → `onOpen`, `S` → `StatusMenu` → `onPickStatus`, Mod+Enter → `onToggleDone` (M3-D35). No milestone in M3 (X21) — an M3-only statement: M8 adds the optional `milestone?` prop (C78).
- Project board: `onMove` → `setStatus([id], column.statusId)` (+ the FR-608 toast when the target is DONE and the card has open children); each column footer `+ เพิ่มงาน` opens an inline `QuickAdd` → `create({ parentId: null, name, statusId: column.statusId })` (FR-664). Archived → no handles, no quick add.

**S3.17 Blockers UI (`src/components/tasks/blockers/`, v3.1: FR-640–644, M3-D31).** `BlockerBadge({ open, total, names? })` renders `blockerBadge` (S1.6): ⛔ `BlockOutlined` + `th.tasks.blockers.badgeWaiting(n)`, or ✓ `CheckOutlined` + `badgeCleared`; `Tooltip` `badgeTooltip(names)` when names are known (project views resolve them from `blockerEdges` + `tasks`; `/tasks` shows counts only, §7.8). `BlockersSection` (panel): "ถูกขวางโดย" list (name, `StatusChip`, × `th.tasks.blockers.remove(name)` → `removeBlocker`), "+ เพิ่มงานที่ขวาง" `Autocomplete` (`th.tasks.blockers.pickerLabel`) over live project tasks minus self, ancestors/descendants and current blockers → `addBlocker`; "กำลังขวาง" list (reverse edges) whose items open that task's panel. Server `VALIDATION` (cycle path, ancestry) → error toast.

**S3.18 Status settings (`src/components/projects/StatusSettings.tsx`, v3.1: FR-622–624, PERM-23, M3-D29/30).** Overview section `th.tasks.status.settings.title` fed by `qk.projectStatuses(id)` (`GET /api/projects/[id]/statuses`): rows = drag handle, `StatusChip`, usage `settings.usage(n)`. When `canManage`: vertical dnd-kit sortable list (PointerSensor as M3-D10) → `reorderTaskStatus({ statusId, afterId })` with undo = reorder to `previousAfterId`; inline rename (`InlineEditText`); category `Select` (`th.tasks.status.categories.*`); colour menu of the 8 swatches with names (`settings.colorName.*`); "+ เพิ่มสถานะ" → `createTaskStatus` named `settings.newName` right before the first DONE status, category WAITING, colour amber (M3-D30), then focus its name for renaming; delete: unused → `deleteTaskStatus({ statusId })` + undo toast (`restoreTaskStatusBatch({ batch, moveToStatusId: null, moved: [] })`); used → `Popover` with destination `Select` (`settings.moveTo`; preselected `defaultStatus(live minus this one)`, FR-624/M3-D30) + "ย้ายแล้วลบ" → `deleteTaskStatus({ statusId, moveToStatusId })` + toast `deletedMoved(n, to)` whose undo is `restoreTaskStatusBatch(result)` (`skipped > 0` → toast `restoreSkipped(n)`). Otherwise read-only + `settings.readOnly`. Server `VALIDATION` reasons appear inline under the row; every success calls `invalidateStatuses(qc, projectId)`. No confirm dialog.

**S3.19 `/tasks` — งานของทีม (v3.1: FR-665/666, X75, M3-D33).** `src/app/(app)/tasks/page.tsx` (server shell, `requirePageUser()`) → `src/components/tasks/team/TeamTasks.tsx` (client, `export function TeamTasks({ syncUrl = true }: { syncUrl?: boolean })`, M3-D41; filter state from `useTeamTaskFilters({ syncUrl })` in `src/components/tasks/team/useTeamTaskFilters.ts`, one `TeamTaskFilters` object read from `useSearchParams()` on mount and written with `history.replaceState` only when `syncUrl`; M8 adds `milestoneId`, M9 adds `fixedUserId`/`forcedView`/`hint` props on top): filter bar — person (`PersonPicker`, single, active people), project (`Select` over `response.projects` seen so far), position (from `qk.peopleOptions()`), category (multi `Select`), `Switch` "เฉพาะที่ถูกขวาง", `Switch` "แสดงงานที่เสร็จแล้ว", clear — mirrored in the URL with `history.replaceState` when `syncUrl`; `useInfiniteQuery(qk.teamTasks(filters), GET /api/tasks, getNextPageParam: nextCursor)` + "โหลดเพิ่ม"; the view toggle shares `tasks.view`. List view: flat rows grouped by project (`Intl.Collator('th')`), each with `StatusChip` (menu = `statusesByProject[projectId]`), checkbox, assignees, due, `BlockerBadge` (counts only); clicking the name → `/projects/<pid>/tasks?task=<id>`. Board view: `TaskBoard` over `buildCategoryColumns`; drop → `resolveCategoryDrop` → `setTaskStatus` (a `useSetTaskStatus()` mutation in `src/components/tasks/team/useSetTaskStatus.ts` whose `onSettled` calls `invalidateTasks(qc, projectId)` — covering `teamTasksAll`, `projectTasks`, `myTasks`, sidebar — and `invalidateLoad(qc)`, X18) with the usual undo entry, or toast `noStatusInCategory(project, category)` when `null` (FR-666). Single column below 600 px; the board scrolls horizontally inside its own container (no page-level horizontal scroll).

**S3.20 Component tests (write first, `--project ui`) and done-check.**
- `src/components/tasks/QuickAdd.test.tsx`: typing `A{Enter}B{Enter}C{Enter}` → `onCreate` called with `'A'`, `'B'`, `'C'`, input empty and still focused; `'   {Enter}'` → not called; `{Escape}` → `onEscape`.
- `src/components/tasks/TaskList.test.tsx` (actions mocked with `vi.mock('@/server/actions/tasks')`, QueryClient seeded with a `ProjectTasksResponse`): rows expose `aria-level`; an unassigned leaf shows "รอมอบหมาย"; a TENTATIVE task shows the ◐ marker text; Tab on row 2 calls `indentTask({ taskId: row2 })`; Tab with `groupBy: 'assignee'` makes no call and shows `th.tasks.treeOpsDisabled`; Mod+Enter calls `completeTask` with the selection; Delete with A and its child selected calls `deleteTaskTree({ taskIds: [A] })`; Space sets `?task=`; Shift+click selects the range.
- `src/components/tasks/TaskPanel.test.tsx`: override on the task → "ตั้งที่งานนี้"; override on the parent "ออกแบบ" → "สืบทอดจาก 'ออกแบบ'"; none → "ตามโปรเจค"; due before start → error text and no `updateTask` call; unknown id → "ไม่พบงาน"; Esc calls close.
- `src/components/common/DateField.test.tsx`: `isoToDayjs('2026-09-30')` → `dayjsToIso` round-trip `'2026-09-30'`; rendering with `'2026-09-30'` shows `30/09/2569`; `null` round-trips.
- `src/components/shell/ShortcutHelp.test.tsx`: every `SHORTCUTS` label is rendered under its scope heading.
- `src/components/tasks/MyTasks.test.tsx`: groups in response order, ticking calls `completeTask({ taskIds: [id] })`.
- v3.1 `src/components/tasks/status/StatusMenu.test.tsx`: typing "รอ" leaves รอข้อมูล and ติดปัญหา; Enter applies the first → `onPick(id)`; the chip exposes the category as text (not colour only).
- `TaskList.test.tsx` (additions): `S` on a row opens the menu; picking "กำลังทำ" calls `setTaskStatus({ taskIds: [row], statusId })`; a row with `blockers { open: 1, total: 1 }` shows "รอ 1 งาน".
- `src/components/tasks/board/TaskBoard.test.tsx`: columns in status order with counts incl. an empty column; `hideDone` hides "เสร็จ"; `leafOnly` hides parents; Enter on a card sets `?task=`; `S` on a card opens the menu; a column's `+ เพิ่มงาน` calls `createTask` with that column's `statusId` (drag is covered by e2e).
- `src/components/tasks/blockers/BlockersSection.test.tsx`: the picker excludes self, the parent and existing blockers; × calls `removeTaskBlocker`; the badge shows "รอ 1 งาน" with tooltip names, and "ตัวขวางเสร็จแล้ว" when cleared.
- `src/components/projects/StatusSettings.test.tsx`: as MEMBER → `settings.readOnly`, no handles/inputs/delete; as LEAD: deleting an unused status calls `deleteTaskStatus({ statusId })` with no dialog; deleting a used one opens the popover with "ยังไม่เริ่ม" preselected and "ย้ายแล้วลบ" calls `deleteTaskStatus({ statusId, moveToStatusId })`; a `VALIDATION` reason is rendered under the row.
- `src/components/tasks/team/TeamTasks.test.tsx`: changing filters writes URL params; with `syncUrl={false}` the URL is untouched and the request still carries the filter; a board drop into WAITING for a project without a WAITING status shows `noStatusInCategory` and calls no action.
- Done-check: `pnpm vitest run --project ui src/components` · `pnpm eslint src/app/(app) src/components src/hooks src/lib/shortcuts.ts` · `pnpm typecheck` (own paths clean). No `next build`/`next dev`.

### 5.S4 — Authorization matrix + masking (test-engineer · owns `tests/**`)

Written **from SPEC §3.2 before S2 finishes** (PLAN §4.1); rows are red until S2 lands, green at G2. Uses the S0.15 world (`createWorld({ with: ['tasks'] })`), `asUser`, `outcomeOf`; the matrix asserts exactly one new `audit_log` row (right `entity`, `project_id`) for every `mutates: true` + `allow` pair (X44, M3-D4).

**S4.1 `tests/authz/rows/tasks.ts`** — see §7.2 for the full table (ids `T-*`). Each row `run`s one call with ids from the world, e.g.
```ts
{ id: 'PERM-11', key: 'T-CREATE', spec: '§3.2 สร้าง/แก้/ลบ/ติ๊กเสร็จ task', action: 'createTask', mutates: true,
  expect: { M: 'allow', L: 'allow', Me: 'allow', W: '404' },
  run: (w) => createTask({ projectId: w.P.id, name: 'งานใหม่' }) },
{ id: 'PERM-11', key: 'T-CREATE-ARCH', spec: '§3.2 + X42 archived', action: 'createTask', mutates: true,
  expect: { M: '403', L: '403', Me: '403', W: '404' },
  run: (w) => createTask({ projectId: w.A.id, name: 'งานใหม่' }) },
{ id: 'PERM-06', key: 'T-LIST', spec: '§3.2 เปิดโปรเจค (tasks API)', action: 'GET /api/projects/[id]/tasks', mutates: false,
  expect: { M: 'allow', L: 'allow', Me: 'allow', W: '404' },
  run: (w) => getProjectTasks(new Request(`http://t/api/projects/${w.P.id}/tasks`), { params: Promise.resolve({ id: w.P.id }) }) },
```
If M1's `AuthzRow` type has no `key` field, put the key into `spec` instead — do not change the harness shape.

**S4.2 `tests/authz/rows/assignments.ts`** (PERM-13, PERM-14) and additions to M2's **`tests/authz/rows/members.ts`** (PERM-08 combined op) — full table in §7.2. v3.1 adds **`tests/authz/rows/task-statuses.ts`** (PERM-23 rows, `GET /api/projects/[id]/statuses`, `GET /api/tasks`) and **`tests/authz/rows/task-blockers.ts`** (PERM-11 blocker rows); status-change rows go in `rows/tasks.ts`. **Register** the four new files — `rows/tasks.ts`, `rows/assignments.ts`, `rows/task-statuses.ts`, `rows/task-blockers.ts` — in `tests/authz/rows/index.ts` (M1's barrel that the matrix and M12's AUD-00 sweep read; X91, C98); `rows/members.ts` is already registered by M2. An unregistered file silently runs no rows.

**S4.3 Masking (`tests/authz/masking.int.test.ts`, extend).** As `outsider`: `GET /api/projects/{P}/tasks` → 404 and `JSON.stringify(body)` contains none of `w.tasks.pParent.name`, `pChildA.name`, P's name or any P task id; `GET /api/tasks/my` → only Q content (`'งาน Q-ลับ02'` present, no P/A task names); `GET /api/sidebar` body contains no P task names. As `member`: `GET /api/projects/{Q}/tasks` → 404 without `'งาน Q-ลับ02'`. v3.1: as `outsider`, `GET /api/tasks` (no filter) → only Q cards; the body contains none of P's/A's task names, `'สถานะลับ P-03'` or P's name; `GET /api/tasks?projectId={P}` → 404 without names; `GET /api/projects/{P}/statuses` → 404 without `'สถานะลับ P-03'`; as `member`, `GET /api/tasks` → no `'งาน Q-ลับ02'` and no `'สถานะลับ Q-04'`; as `lead`, `addTaskBlocker({ taskId: pLeaf, blockerTaskId: qTask })` → 404 and the error body has no Q names; `GET /api/projects/{P}/tasks` as `member` → `blockerEdges` only between P tasks.

**S4.4 Done-check.** `grep -c "tasks\|assignments\|task-statuses\|task-blockers" tests/authz/rows/index.ts` shows the four registrations · `pnpm vitest run --project integration tests/authz tests/helpers` (rows compile; failures allowed only while S2's stubs throw `NOT_IMPLEMENTED`) · `pnpm eslint tests` · `pnpm typecheck` (own paths clean). Re-run after S2 reports: every M3 row green.

### 5.S5 — E2E (test-engineer · owns `e2e/**`)

**S5.1 Page objects.**
- `e2e/pages/tasks.ts` — `class TaskListPage`: `gotoProject(name)` (sidebar → project → tab `th.projects.tabs.tasks`), `list()` (`getByRole('treegrid', { name: th.tasks.listLabel })`), `row(name)` (`getByRole('row', { name })`), `level(name)` (`aria-level`), `quickAdd()` (`getByRole('textbox', { name: th.tasks.quickAdd.label })`), `select(name, mods?)`, `press(name, key)`, `panel()` (`getByRole('complementary', { name: th.tasks.panel.label })`), `toast(text)`, `dragRow(name, { overName, dx })` (handle `getByRole('button', { name: th.tasks.dragHandle })` → `page.mouse.down/move(steps: 5)/up`, as in `snippets/r4/playwright/e2e/controls.spec.ts`); v3.1: `setView('list' | 'board')`, `column(name)` (`getByRole('group', { name: new RegExp('^' + name) })`), `card(name)`, `dragCard(name, toColumn)` (handle `th.tasks.board.cardDragHandle(name)`), `statusChip(rowName)`, `pickStatus(name)` (menu filter + Enter), `blockers()` (panel section helpers).
- `e2e/pages/status-settings.ts` (overview "สถานะงาน": `add(name, category)`, `dragBefore(name, otherName)`, `remove(name, { moveTo? })`) and `e2e/pages/team-tasks.ts` (`/tasks` filters, list rows, category columns).
- Extend `e2e/pages/sidebar.ts` (`myTasks()` link + count text) and the M2 project page object (`openTab('tasks')`, members panel `removeMember(name)`).

**S5.2 `e2e/m3-tasks.spec.ts`** — scenarios E1–E20 in §7.3. `test.beforeAll(async () => { await resetDb(…) })` per describe that needs pristine golden data (never `beforeAll(resetDb)` / `beforeAll(resetDb(...))`; options go in the 2nd argument — M1, X91); `loginAs(page, …)` per test; `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto` (E3b uses `install` + `runFor`); all strings from `th`; no fixed sleeps.

**S5.3 Update older specs (shared UI changed).**
- `e2e/m2-projects.spec.ts`: tab assertions now include "งาน"; any member-removal step that targets a member who now has assignments (golden M3 seed: Ivy and Mint in POS, Ivy in CRM, Mint in Mobile, Jack in Store) must either target a member without assignments (e.g. add Peter to POS, then remove him) or follow the FR-404 flow; the sidebar now shows "งานของฉัน" and "งานของทีม"; M2's project-creation scenario now also sees the "สถานะงาน" section on the new overview.
- `e2e/m0-smoke.spec.ts` / `e2e/m1-auth.spec.ts`: update any assertion that enumerates sidebar items.
- Move shared selectors into the page objects instead of duplicating them.

**S5.4 Done-check (stream).** `pnpm exec playwright test --list` discovers every spec · `pnpm eslint e2e` · `pnpm typecheck`. Running the suite is the integrator's job (G2).

---

## 6. Integration (orchestrator)

**Wiring order.**
1. Kickoff: copy §3 into `PROGRESS.md › Decisions`, the §5 step list into `แผนของ milestone ปัจจุบัน`, set M3 🟨.
2. S0 alone → **G0** (`pnpm check`).
3. One message, three background agents: S1, S2, S4 (PLAN §2.4 brief; owns from §4).
4. When S1 reports green → launch S3 (S2/S4 may still run; no path overlap).
5. Apply `requests` (expected below) after S2/S3/S4 finish; then launch S5.
6. Integrator: G2; then the review panel (PLAN §2.6), fix rounds, G3/G4.

**Requests expected (apply in step 5).**

| From | Likely request | Owner action |
|---|---|---|
| S3 | extra `th` keys outside its namespaces (e.g. `common.*`, `undo.*`) | orchestrator edits `th.ts` |
| S3 | `getJson` (M2) signal option / `invalidateTasks` tweak in `src/lib/api.ts` / `src/lib/invalidate.ts` | orchestrator applies (S0-owned shared files) |
| S2 | M2 helper renames discovered while editing `members.ts` (result shape `{ removed, blockedByAssignments }`) | confirm contract with S3.10; update `src/lib/contracts` if the type lives there |
| S4 | world extensions beyond S0.15 | S4 owns `tests/**` and may add them itself; only cross-check with S2 test data |
| S2/S3 | a new `ErrorCode` | add to `src/server/errors.ts` + `th.errors` (orchestrator) |
| S0/S2 | drizzle-kit cannot emit a composite FK / `unique().on` / the `lower(name)` index (M3-D36) | orchestrator approves **one** custom migration (only one generator at a time) and records the Decision |
| S2 | M2 `createProject` / `scripts/bootstrap.ts` edits for X70 | inside S2's globs; orchestrator checks the M2 tests still pass |
| S3 | `qk.projectStatuses` / `teamTasks` signature tweaks | orchestrator edits `src/lib/query-keys.ts` / `src/lib/invalidate.ts` |

**G2 commands (integrator only).**
```bash
pnpm db:up && pnpm db:migrate
pnpm db:generate                 # must print "No schema changes, nothing to migrate"
pnpm exec drizzle-kit check      # journal/snapshot consistent
pnpm check                       # typecheck + lint + unit/ui/integration (+ domain coverage ≥ 95 %)
pnpm test:e2e                    # full suite: m0-smoke, m1-auth, m2-projects, m3-tasks
git diff --exit-code CLAUDE.md SPEC.md docs/
grep -rn "localStorage\|randomUUID" src/components src/hooks src/lib --include=*.ts --include=*.tsx   # expect no hits (temp-id.ts uses getRandomValues)
grep -rn "milestone" src/components/tasks src/server/services/tasks.ts src/server/services/teamTasks.ts src/lib/contracts/tasks.ts       # expect no hits (X21, M3-D37) — M3-only check; from M8 on it is dropped (M3-D42, C26)
grep -rn "Dialog" src/components/tasks src/components/projects/StatusSettings.tsx                 # expect no hits (no confirm dialogs; status delete uses a Popover, M3-D30)
grep -rn "server/clock\|serverToday" src/server/services                                          # expect no hits (M3-D43, X56/X90: services take `today`)
```

---

## 7. Verification

### 7.1 AC → test map

| AC | Clause in M3 | Tests |
|---|---|---|
| AC-601 | full | e2e E1 · ui `QuickAdd.test.tsx` · int `tasks.int.test.ts › createTask append order` |
| AC-602 | full | e2e E2 (+ E5 literal on golden rows) · unit `src/lib/tree/ops.test.ts › AC-602` · int `tasks.int.test.ts › tree › AC-602` |
| AC-603 | tasks + assignments (X13); plans clause → M6 extends the same int + e2e tests | e2e E3 (toast "เลิกทำ", Cmd+Z, Cmd+Shift+Z, reload) · int `tasks.int.test.ts › delete/restore › AC-603` |
| AC-203 | assignee picker + `assign` reject deactivated (X12); grid label → M6 | e2e E4b · int `assignments.int.test.ts › deactivated` |
| AC-604 | none (X14: M6 plan, M9 person page) | — |
| AC-611 | full | e2e E15 · int `task-statuses.int.test.ts › defaults` · int `tasks.int.test.ts › createTask` |
| AC-612 | full (UI + server rejection) | e2e E16 · int `task-statuses.int.test.ts › AC-612` · authz S-* rows (Me → 403) |
| AC-613 | full | e2e E17 · int `task-status.int.test.ts` (BR-80 + revert) |
| AC-614 | full | e2e E18 · int `task-statuses.int.test.ts › AC-614` |
| AC-615 | full | e2e E19 · int `task-blockers.int.test.ts › AC-615` · unit `blockers.test.ts` |
| AC-616 | full; actor Peter in e2e (M3-D34) | e2e E20 · int `team-tasks.int.test.ts` · masking S4.3 |

Requirement-level coverage (non-AC) is in the §1.1 table; every FR/BR row there names its test.

### 7.2 Authorization matrix rows added

`M` manager · `L` lead (LEAD of P and A) · `Me` member (MEMBER of P and A) · `W` outsider (MEMBER of Q only). `mutates` rows with `allow` assert exactly one new `audit_log` row (entity in brackets).

| Key | PERM | Action / route (world ids) | M | L | Me | W | mutates |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| T-LIST | PERM-06 | `GET /api/projects/{P}/tasks` | allow | allow | allow | 404 | no |
| T-LIST-ARCH | PERM-06, X42 | `GET /api/projects/{A}/tasks` | allow | allow | allow | 404 | no |
| T-LIST-BAD | PERM-06, X86 | `GET /api/projects/not-a-uuid/tasks` (malformed id) | 404 | 404 | 404 | 404 | no |
| T-MY | — (own data) | `GET /api/tasks/my` | allow | allow | allow | allow | no |
| T-SIDEBAR | — | `GET /api/sidebar` (count field) | allow | allow | allow | allow | no |
| T-CREATE | PERM-11 | `createTask({ projectId: P, name })` [task] | allow | allow | allow | 404 | yes |
| T-CREATE-SUB | PERM-11 | `createTask({ projectId: P, parentId: pChildB, name })` [task] | allow | allow | allow | 404 | yes |
| T-CREATE-ARCH | PERM-11, X42 | `createTask({ projectId: A, name })` | 403 | 403 | 403 | 404 | yes |
| T-UPDATE | PERM-11 | `updateTask({ taskId: pLeaf, patch: { name } })` [task] | allow | allow | allow | 404 | yes |
| T-UPDATE-ARCH | PERM-11, X42 | `updateTask({ taskId: aTask, … })` | 403 | 403 | 403 | 404 | yes |
| T-INDENT | PERM-11 | `indentTask({ taskId: pLeaf })` (→ last child of pParent, no transfer) [task] | allow | allow | allow | 404 | yes |
| T-OUTDENT | PERM-11 | `outdentTask({ taskId: pChildA })` [task] | allow | allow | allow | 404 | yes |
| T-MOVE | PERM-11 | `moveTask({ taskId: pDone, parentId: null, afterId: null })` [task] | allow | allow | allow | 404 | yes |
| T-MOVE-X | PERM-11, BR-33 | `moveTask({ taskId: pLeaf, parentId: qTask, afterId: null })` | 400 | 404 | 404 | 404 | no |
| T-COMPLETE | PERM-11 | `completeTask({ taskIds: [pLeaf] })` [task] | allow | allow | allow | 404 | yes |
| T-COMPLETE-ARCH | PERM-11, X42 | `completeTask({ taskIds: [aTask] })` | 403 | 403 | 403 | 404 | yes |
| T-UNCOMPLETE | PERM-11 | `uncompleteTask({ taskIds: [pDone] })` [task] | allow | allow | allow | 404 | yes |
| T-BULK-X | PERM-11, M3-D23 | `completeTask({ taskIds: [pLeaf, qTask] })` | 400 | 404 | 404 | 404 | no |
| T-DELETE | PERM-11 | `deleteTaskTree({ taskIds: [pParent] })` (1 root → 1 row) [task] | allow | allow | allow | 404 | yes |
| T-DELETE-ARCH | PERM-11, X42 | `deleteTaskTree({ taskIds: [aTask] })` | 403 | 403 | 403 | 404 | yes |
| T-RESTORE | PERM-11, UNDO-5 | `restoreTaskBatch({ batch: batches.pDeletedTask })` [task] | allow | allow | allow | 404 | yes |
| T-RESTORE-ARCH | PERM-11, X42 | `restoreTaskBatch({ batch: batches.aDeletedTask })` | 403 | 403 | 403 | 404 | yes |
| A-ASSIGN-MEMBER | PERM-13 | `assign({ taskIds: [pChildB], userId: member })` [task_assignment] | allow | allow | allow | 404 | yes |
| A-ASSIGN-NONMEMBER | PERM-14, BR-60 | `assign({ taskIds: [pChildB], userId: outsider })` [task_assignment, `after.addedMember`] | allow | allow | 403 | 404 | yes |
| A-ASSIGN-ARCH | PERM-13, X42 | `assign({ taskIds: [aTask], userId: lead })` | 403 | 403 | 403 | 404 | yes |
| A-UNASSIGN | PERM-13 | `unassign({ assignmentIds: [pChildAMember] })` [task_assignment] | allow | allow | allow | 404 | yes |
| A-UNASSIGN-ARCH | PERM-13, X42 | `unassign({ assignmentIds: [aTaskMember] })` | 403 | 403 | 403 | 404 | yes |
| A-RESTORE | PERM-13, UNDO-5 | `restoreAssignmentBatch({ batch: batches.pRemovedAssignment })` [task_assignment] | allow | allow | allow | 404 | yes |
| M-REMOVE-BLOCKED | PERM-08, FR-404 | M2 `removeMember({ projectId: P, userId: member })` → `{ removed: false, blockedByAssignments: 1 }` (no write, no audit) | allow | allow | 403 | 404 | no |
| M-REMOVE-WITH-ASSIGN | PERM-08, FR-404 | `removeMemberWithAssignments({ projectId: P, userId: member })` [project_member] | allow | allow | 403 | 404 | yes |
| M-RESTORE-REMOVED | PERM-08, FR-404 | `restoreRemovedMember({ projectId: P, userId: former, batch, member })` [project_member] | allow | allow | 403 | 404 | yes |
| T-STATUS | PERM-11 (v3.1) | `setTaskStatus({ taskIds: [pLeaf], statusId: statuses.P.doing })` [task] | allow | allow | allow | 404 | yes |
| T-STATUS-ARCH | PERM-11, X42 | `setTaskStatus({ taskIds: [aTask], statusId: statuses.A.doing })` | 403 | 403 | 403 | 404 | yes |
| T-STATUS-X | PERM-11, BR-83 | `setTaskStatus({ taskIds: [pLeaf], statusId: statuses.Q.doing })` | 404 | 404 | 404 | 404 | no |
| T-REVERT | PERM-11, M3-D28 | `revertTaskStatus({ items: [{ taskId: pDone, statusId: statuses.P.todo, completedOn: null }] })` [task] | allow | allow | allow | 404 | yes |
| B-ADD | PERM-11 | `addTaskBlocker({ taskId: pChildB, blockerTaskId: pLeaf })` [task_blocker] | allow | allow | allow | 404 | yes |
| B-ADD-X | PERM-11, D12 | `addTaskBlocker({ taskId: pLeaf, blockerTaskId: qTask })` | 400 | 404 | 404 | 404 | no |
| B-ADD-ARCH | PERM-11, X42 | `addTaskBlocker({ taskId: aTask, blockerTaskId: aTask2 })` | 403 | 403 | 403 | 404 | yes |
| B-REMOVE | PERM-11 | `removeTaskBlocker({ blockerId: blockers.pLeafByChildA })` [task_blocker] | allow | allow | allow | 404 | yes |
| S-LIST | PERM-06 | `GET /api/projects/{P}/statuses` | allow | allow | allow | 404 | no |
| S-CREATE | PERM-23 | `createTaskStatus({ projectId: P, name: 'ใหม่', category: 'WAITING', color: '#B45309' })` [task_status] | allow | allow | 403 | 404 | yes |
| S-CREATE-ARCH | PERM-23, X42 | `createTaskStatus({ projectId: A, … })` | 403 | 403 | 403 | 404 | yes |
| S-UPDATE | PERM-23 | `updateTaskStatus({ statusId: statuses.P.pSecret, patch: { color: '#7C3AED' } })` [task_status] | allow | allow | 403 | 404 | yes |
| S-REORDER | PERM-23 | `reorderTaskStatus({ statusId: statuses.P.blocked, afterId: null })` [task_status] | allow | allow | 403 | 404 | yes |
| S-DELETE | PERM-23, FR-624 | `deleteTaskStatus({ statusId: statuses.P.pSecret })` (unused) [task_status] | allow | allow | 403 | 404 | yes |
| S-RESTORE | PERM-23, X72 | `restoreTaskStatusBatch({ batch: batches.pDeletedStatus, moveToStatusId, moved })` [task_status] | allow | allow | 403 | 404 | yes |
| S-RESTORE-ARCH | PERM-23, X42 | `restoreTaskStatusBatch({ batch: batches.aDeletedStatus, … })` | 403 | 403 | 403 | 404 | yes |
| T-TEAM | — (X75, filtered) | `GET /api/tasks` | allow | allow | allow | allow | no |
| T-TEAM-P | PERM-06, X75 | `GET /api/tasks?projectId={P}` | allow | allow | allow | 404 | no |
| T-TEAM-BADQ | — (X86 query string) | `GET /api/tasks?projectId=x` | 400 | 400 | 400 | 400 | no |

### 7.3 E2E scenarios (`e2e/m3-tasks.spec.ts`)

Determinism (PLAN §4.5): `test.describe.configure({ mode: 'serial' })` inside each describe; `resetDb()` in `beforeAll` of each describe marked ⟲; `loginAs` per test; `page.clock.setFixedTime(new Date('2026-09-30T10:00:00+07:00'))` before the first `goto` (server pinned by `APP_NOW`); selectors via roles + `th` strings + page objects; waits on UI state only; CSP-violation listener from `e2e/fixtures.ts` stays active.

| # | Scenario (role) | Steps | Assertions |
|---|---|---|---|
| E1 ⟲ | AC-601, FR-602, FR-408, `N` (cindy) | sidebar → POS Upgrade → tab "งาน"; wait for the treegrid; press `N`; type `งาน A` Enter `งาน B` Enter `งาน C` Enter (keyboard only) | quick-add input focused after `N`; rows A, B, C appear after "Rollout สาขา" in that order at `aria-level=1`; after reload the three rows still exist (count 1 each) |
| E2 | AC-602, FR-603 (cindy) | focus row "งาน B" → Tab; focus "งาน C" → Tab, Tab, Tab; then Shift+Tab | B `aria-level=2` directly under A; C: 2 → 3 → **still 3, no toast** → 2; after reload A=1, B=2, C=2 |
| E3 | AC-603 (M3 part), FR-609, Cmd+Z (cindy) | quick add "งานแม่ทดสอบ", "ลูก 1", "ลูก 2", "ลูก 3" at root level, then focus each "ลูก" row and press Tab once; assign Ivy to "ลูก 2"; select parent → Delete; click toast "เลิกทำ"; Delete again; `ControlOrMeta+z`; `ControlOrMeta+Shift+z`; `ControlOrMeta+z`; reload | after Delete the 4 rows are gone and the toast reads `th.tasks.toast.deletedWithChildren('งานแม่ทดสอบ', 3)`; after undo all 4 back with levels 1/2/2/2 and the Ivy chip on "ลูก 2"; Cmd+Z restores, Cmd+Shift+Z deletes, Cmd+Z restores; after reload 4 rows + Ivy chip |
| E3b ⟲ | UNDO-4 toast 8 s (cindy) | `page.clock.install({ time: new Date('2026-09-30T10:00:00+07:00') })` before `goto`; delete "งาน A"-like fresh task; `clock.runFor(7000)`; `clock.runFor(1500)` | toast visible after 7 s, hidden after 8.5 s; the task stays deleted |
| E4 ⟲ | FR-605, FR-606, BR-60, PERM-13/14 (cindy, then ivy) | cindy: quick add "งาน D" and "งาน E"; open "+ คน" on "งาน D"; pick Ivy, then Peter (picker stays open); × on Peter chip; toast "เลิกทำ"; ivy: open "+ คน" on the unassigned "งาน E" | "งาน D" first shows "รอมอบหมาย"; Peter's option shows "จะถูกเพิ่มเป็นสมาชิก", Ivy's does not; chips Ivy + Peter, label gone; Peter now listed in the POS overview members; after × the toast reads `unassigned('Peter')`, after undo the chip returns; for ivy the options are exactly POS members (Cindy, Ivy, Mint, Peter) — no Jack, no hint |
| E4b ⟲ | AC-203 (M3 part) (manager) | deactivate Cindy through the M1 employees page object; open POS tasks; open "+ คน" on any leaf | Cindy absent from the options; Cindy's existing chip on "ปรับปรุงระบบ POS หน้าร้าน" still visible with "(ปิดใช้งาน)" |
| E5 ⟲ | FR-610, BR-31, AC-602 on golden rows (cindy) | focus row 2 "ทำ UAT + คู่มือหน้าร้าน" → Tab; click toast "เลิกทำ"; open panel of "Rollout สาขา" → "+ เพิ่มงานย่อย" "ติดตั้งระบบที่สาขา" | row 2 becomes child of row 1; toast `movedAssignees(1, 'ทำ UAT + คู่มือหน้าร้าน')`; row 2 chips Cindy + Ivy, row 1 shows read-only union chips (no ×); after undo both at level 1, row 1 = Cindy, row 2 = Ivy; the new subtask carries Mint, "Rollout สาขา" shows read-only Mint |
| E6 ⟲ | FR-607, FR-608, prefs, FR-409 progress (cindy) | quick add "แม่ E6", children "ลูก E6-1", "ลูก E6-2"; tick parent checkbox; click "ติ๊กทั้งหมด"; switch "แสดงงานที่เสร็จแล้ว" off; reload; switch on; open tab ภาพรวม | toast `askChildren`; after "ติ๊กทั้งหมด" all three struck through; switch off hides the whole subtree, still hidden after reload; overview shows `th.tasks.progress(3, 6)` |
| E7 ⟲ | FR-611, BR-36, Esc, deep link (cindy) | select "Rollout สาขา" → Space; add subtask "ย่อย R" and open it; open "ปรับปรุงระบบ POS หน้าร้าน"; Esc; reload with `?task=<Rollout id>`; goto `?task=<random v4 uuid>` | URL has `?task=`; panel (`complementary`) width 420–460 px and list's right edge ≤ panel's left edge; "อาจไม่ทำ" pressed + "ตั้งที่งานนี้"; subtask shows "สืบทอดจาก 'Rollout สาขา'"; POS task shows "ตามโปรเจค"; Esc closes and removes `task`; deep link reopens; unknown id shows "ไม่พบงาน" only |
| E8 ⟲ | FR-613 (cindy) | group by ผู้รับผิดชอบ; group by ความแน่นอน; press Tab on a row; group none + sort วันครบกำหนด after setting a due date on "Rollout สาขา" in the panel | assignee groups Cindy / Ivy / Mint headers with their tasks; certainty: "Rollout สาขา" under อาจไม่ทำ, others under แน่นอน; no drag handles; Tab shows `treeOpsDisabled` and levels unchanged; due sort puts "Rollout สาขา" first |
| E9 ⟲ | FR-614, Cmd+Enter (cindy) | focus "Rollout สาขา" → `ControlOrMeta+Enter` twice; Cmd+click "ปรับปรุงระบบ POS หน้าร้าน" and "ทำ UAT + คู่มือหน้าร้าน"; bulk ติ๊กเสร็จ; select both again; bulk ลบ; toast "เลิกทำ" | first Cmd+Enter strikes "Rollout สาขา" through (toast `completed`), the second clears it; bulk bar `selected(2)`; both struck through + toast `completedMany(2)`; after delete toast `deletedMany(2)` and rows gone; after undo both back |
| E10 ⟲ | FR-604 drag (cindy) | quick add X1, X2, X3; drag X3's handle onto X1 (dx 0); then drag X2's handle right by 24 px (its previous row X1 becomes the parent); reload | order X3, X1, X2 after the first drag; X2 then `aria-level=2` under X1; persisted after reload |
| E11 ⟲ | FR-404, BR-61 (cindy) | overview members → remove Ivy; click "ยกเลิกการนำออก"; remove Ivy again → "ยกเลิกการมอบหมายทั้งหมด"; tasks tab; `ControlOrMeta+z` | toast `assignmentsBlock.message(1)`; Ivy still a member after cancel; after unassign-all Ivy is gone and "ทำ UAT + คู่มือหน้าร้าน" shows "รอมอบหมาย"; after Cmd+Z Ivy is a member again with the chip back |
| E12 | `?` help, X07 (cindy) | press `Shift+Slash` on the tasks tab; Esc | dialog `th.shortcuts.title` lists `th.shortcuts.items.listIndent` and `items.newTask`; Esc closes |
| E13 ⟲ | FR-1009 basic, sidebar count, NFR-07b (ivy) | open `/my`; tick "ตั้งค่า automation"; click toast "เลิกทำ"; set viewport 390×844; click "ทำ UAT + คู่มือหน้าร้าน" | sidebar "งานของฉัน" shows 2; groups "CRM Migration" and "POS Upgrade" with one task each; after tick count 1, after undo 2; no horizontal scroll (`scrollWidth <= innerWidth`); navigation lands on POS tasks with the panel open |
| E14 ⟲ | authz in the UI (cindy, then peter) | as cindy open POS tasks and keep `page.url()`; in a fresh context `loginAs(peter)` and goto that URL | 404 page; no POS task names in the page |
| E15 ⟲ | AC-611, FR-621/625 (manager) | create project "โปรเจคทดสอบสถานะ" (LEAD Cindy) through M2's dialog; open tab งาน; quick add "งานแรก"; open ภาพรวม | "งานแรก" shows the chip "ยังไม่เริ่ม"; "สถานะงาน" lists ยังไม่เริ่ม, กำลังทำ, รอข้อมูล, ติดปัญหา, เสร็จ in that order with their category captions |
| E16 ⟲ | AC-612, FR-622, PERM-23 UI (cindy = LEAD of POS, then ivy = MEMBER) | cindy: POS ภาพรวม → "+ เพิ่มสถานะ" → rename to "รอลูกค้ายืนยัน", category รอ/ติดขัด; drag it right before "เสร็จ"; tab งาน → บอร์ด; reload; ivy: POS ภาพรวม | board columns ยังไม่เริ่ม, กำลังทำ, รอข้อมูล, ติดปัญหา, รอลูกค้ายืนยัน, เสร็จ (same after reload); ivy sees the list read-only with `th.tasks.status.settings.readOnly` and no add/drag/delete controls (server rejection = matrix S-CREATE) |
| E17 ⟲ | AC-613, FR-660/662, FR-626 `S`, FR-608 (cindy) | POS งาน → บอร์ด; drag "ปรับปรุงระบบ POS หน้าร้าน" to "เสร็จ"; open its panel; click toast "เลิกทำ"; switch to ลิสต์; focus "Rollout สาขา" → `S` → type "กำลัง" → Enter; `ControlOrMeta+z`; reload | the card sits in "เสร็จ" struck through and the panel shows `th.tasks.completedOn('30 ก.ย. 2569')`; after undo it is back in "ยังไม่เริ่ม" without the completed text; `S` sets "Rollout สาขา" to กำลังทำ (toast `changed('กำลังทำ')`) and Cmd+Z returns it to ยังไม่เริ่ม; the last chosen view (ลิสต์) survives reload |
| E18 ⟲ | AC-614, FR-624, FR-614 bulk status (cindy) | select the 3 POS tasks → bulk เปลี่ยนสถานะ → "รอข้อมูล"; ภาพรวม → delete "รอข้อมูล" → choose "กำลังทำ" → "ย้ายแล้วลบ"; click toast "เลิกทำ"; tab งาน → บอร์ด | no dialog opens (popover only); toast `deletedMoved(3, 'กำลังทำ')`; before undo the board has no "รอข้อมูล" column and 3 cards under กำลังทำ; after undo "รอข้อมูล" is back between กำลังทำ and ติดปัญหา holding the 3 cards |
| E19 ⟲ | AC-615, FR-640–644 (cindy) | quick add "งาน A19", "งาน B19"; B19 panel → "+ เพิ่มงานที่ขวาง" → A19; A19 panel → add B19 as its blocker; tick A19 | B19 row shows ⛔ "รอ 1 งาน" (tooltip "ถูกขวางโดย: งาน A19"); A19's panel lists B19 under "กำลังขวาง"; the second add shows `จะเกิดวงวน: งาน B19 → งาน A19 → งาน B19` and adds nothing; after ticking A19, B19 shows ✓ "ตัวขวางเสร็จแล้ว" and its chip is still "ยังไม่เริ่ม" |
| E20 ⟲ | AC-616, FR-665/666, X75 (peter, then cindy) | peter: sidebar "งานของทีม" → list, then บอร์ด; cindy: `/tasks`, filter project CRM Migration, บอร์ด, drag "ย้ายข้อมูลลูกค้า" to the รอ/ติดขัด column; open its panel from the list link | peter sees exactly 'ย้าย pipeline ขึ้น BigQuery', 'ทำ dashboard ผู้บริหาร', 'เก็บ requirement + สรุป'; `page.content()` contains none of "POS Upgrade", "ปรับปรุงระบบ POS หน้าร้าน", "Mobile App Revamp", "ย้ายข้อมูลลูกค้า"; the board has 4 category columns; for cindy the card moves to รอ/ติดขัด showing "รอข้อมูล" (first WAITING status); the URL keeps `project=`; the link opens CRM's tasks tab with the panel |

**Assertions that later milestones change on purpose (not regressions; the owning milestone's "update older specs" step edits them):**
E9's completion toasts gain the BR-52 numbers in M6 (`released('18.8', 5)` / `released('1.3', 1)` — m06 S6.3; E13 asserts the count, not the toast text, so
it stays as written there); E13's sidebar count and `/my` layout change in M9 (FR-1009 buckets replace the groups-by-project, count 2 → 1 on golden data — m09 S6.3, X95);
E1/E15 tab lists gain "แผนงาน" in M6 and "เอกสาร" in M4 (assert tabs with `toContain`, or let M4/M6 update them); board-card and `/tasks`
assertions gain the milestone line in M8 (only where a card is bound). Write E9/E13 so the toast and count checks are single, easy-to-edit lines.

### 7.4 Golden, perf and manual checks

- **Seed** (`scripts/lib/fixtures.int.test.ts`, S2.12): task_statuses 25 (5 per project) / tasks 10, all on "ยังไม่เริ่ม" / task_assignments 10 / one TENTATIVE override / members 10 (r8 §4.2). M6's golden F1 test builds on this data unchanged.
- **Manual (before G4):** drag a task that has a grandchild onto a depth-1 row → the invalid-drop indicator shows the icon + `th.tasks.dropInvalid` text and the drop does nothing; Thai Kedmanee layout — `N`, `?`, Cmd+Z still work (`e.code`); keyboard-only session through E1–E3 without a mouse; dark mode contrast of the "รอมอบหมาย" chip, ◐ and struck-through text; screen reader announces row level and selection.
- **Manual v3.1:** board keyboard-only (Tab into the board, arrows, `S` to move a card, Enter for the panel); status chips and ⛔/✓ badges readable in dark mode and announced with their category/text; `/tasks` at 390 px has no page-level horizontal scroll.
- **Perf smoke (manual):** `GET /api/tasks` as manager over 5 000 synthetic tasks returns the first page in < 500 ms locally (X75; record a Known issue for M12 otherwise).
- **Perf smoke (manual):** a project with 500 tasks (temporary script, not committed) renders the tasks tab and indents a row without visible lag; if not, record a Known issue for M12 (M3-D16).

---

## 8. Definition of done

- [ ] SPEC §12 M3 (v3.1): §4.6 incl. §4.6.1–4.6.3 complete except FR-612, the milestone parts (X21), the grid badge (X76) and the person tab (X77); list + board views, `/tasks`, status settings, blockers, task panel, undo + restore by batch, `/my` basic — every row of §1.1 implemented and tested.
- [ ] AC-601, AC-602, AC-603 (M3 clause), AC-611–AC-616 pass in `e2e/m3-tasks.spec.ts`; AC-203 M3 clause passes (E4b).
- [ ] `pnpm check` green (typecheck, lint, unit, ui, integration, domain coverage ≥ 95 % incl. `certainty.ts`, `status.ts`, `blockers.ts`).
- [ ] Services take `today` as a required trailing parameter and never import `clock.ts` (M3-D43; G2 grep); actions pass `serverToday()`.
- [ ] `tests/authz/rows/index.ts` registers `tasks`, `assignments`, `task-statuses`, `task-blockers` (X91).
- [ ] Completion invariant (R22) holds after every status/task integration test; every status write goes through `setStatus`/`revertStatuses` or the status-delete path (X71).
- [ ] Full e2e suite green: m0, m1, m2 (updated per S5.3), m3.
- [ ] Every new action/route has authz rows (§7.2), including archived and cross-project rows; mutating `allow` rows assert one audit row.
- [ ] Masking cases for the new GET routes (`/api/projects/[id]/tasks`, `/api/tasks/my`, `/api/tasks`, `/api/projects/[id]/statuses`) and the sidebar count pass (S4.3); `/api/tasks` filters visibility in SQL.
- [ ] `pnpm db:generate` → "No schema changes"; `tasks.position` is `COLLATE "C"`; no `milestone_id` column; composite FKs `tasks_status_fk` and `task_blockers_*_fk` exist (generated or custom migration, M3-D36); M3 adds no query on `allocations` (the table arrives in M6).
- [ ] No confirm dialog added (status delete-with-move is a popover, M3-D30); every deletion/unassignment has an 8 s undo toast and Cmd+Z; restore re-checks authz, 30 days, live parent, conflicts.
- [ ] No Thai literals outside `src/i18n/**` (lint); no `any`, `@ts-ignore` or undocumented `eslint-disable`; no `localStorage`; no `crypto.randomUUID` in client code; no runtime CDN.
- [ ] Shortcut dialog lists every M3 shortcut; `N`, `?`, `S`, Tab/Shift+Tab, Cmd+Enter, Delete, Space, Esc work; state is never conveyed by colour alone.
- [ ] `PROGRESS.md` updated (§10); commit + tag.

---

## 9. Risks and gotchas

| # | Risk | Mitigation (step) |
|---|---|---|
| R1 | Default `en_US.utf8` collation mis-orders fractional keys (r4 §25) | `orderKey` column + collation assertion (S0.2/S0.3); `ORDER BY position, id`; client `compareKeys` (S1.3) |
| R2 | `restrictToVerticalAxis` on `DndContext` zeroes `delta.x`, depth never changes (r4 §19) | modifiers only on `DragOverlay` (S3.2) |
| R3 | dnd-kit `KeyboardSensor` binds Space/Enter, colliding with §8.6 | PointerSensor only, handle-only listeners (M3-D10, S3.2) |
| R4 | Equal / concurrent fractional keys; `generateKeyBetween(a, a)` throws (r4 §24) | advisory lock per sibling scope + re-key with `generateNKeysBetween` (S2.2); concurrency test |
| R5 | Restoring an assignment after re-assigning the same user hits `23505` (r5 #10) | `NOT EXISTS` guard + skip count + toast (S2.7); mapper backstop (S2.13) |
| R6 | Writing the generated `completed_week` → `428C9` | never set it; Drizzle omits generated columns from inserts (S0.2 test) |
| R7 | NBSP-only names pass the DB check (r5 M3-01) | zod `.trim().min(1)` (S0.4 test) |
| R8 | Server actions are serialized per client (r4 §10) | reads via route handlers; small actions; client mutation `scope` keeps order (S3.1) |
| R9 | Temp ids reaching the server | resolve through `idMap` inside `mutationFn`; scoped mutations guarantee the create resolved first (S3.1) |
| R10 | Browser Tab moves focus out of the list | `preventDefault` on Tab/Shift+Tab whenever a row has focus, even for no-ops (S3.4) |
| R11 | Thai keyboard layout breaks `N`/`?`/Cmd+Z by `e.key` (X49) | `e.code` first (`KeyN`, `Slash`+Shift, `KeyZ`); manual QA (§7.4) |
| R12 | MUI 9 renames (`renderTags`→`renderValue`, `slotProps.htmlInput`, no system props) | follow r1 §8.6; typecheck catches v5-era props |
| R13 | `router.refresh()` no-op bug (#99028) and full RSC refetch on `?task=` changes | `window.history.pushState/replaceState` for the panel (M3-D17); `refresh()` only server-side in member actions |
| R14 | `page.clock.install` also fakes app timers (debounces) | use it only in E3b; everything else uses `setFixedTime` |
| R15 | Drag e2e flakiness | handle-based drag with `steps: 5` and the 4 px activation distance (S5.1); assert after reload |
| R16 | M2 names unknown to this plan (`removeMember` result, members panel path, nav config, tab config) | S2.9/S3.10/S3.12/S3.13 start by reading the M2 code; contract change → `request` |
| R17 | Golden seed now has assignments, so M2 member-removal e2e may hit the FR-404 toast | S5.3 update-older-specs step |
| R18 | BR-31 invariant broken between two client calls during undo | every reversal is one action with `transfer` (M3-D3) |
| R19 | `dayjs(iso, 'YYYY-MM-DD')` needs `customParseFormat`; the pickers adapter extends dayjs itself | conversions only in `DateField` (S3.6) and tested in jsdom |
| R20 | drizzle-kit may not emit (or may re-diff) composite FKs, `unique().on()` or the `lower(name)` expression index — unverified in r2/r6a | S0.3 inspects the SQL and re-runs `db:generate`; fallback = one custom migration (M3-D36); schema int tests assert `23503`/`23505` |
| R21 | M3 is ~40 % larger with v3.1 (statuses, blockers, board, `/tasks`) | step order keeps the original outliner first inside S2/S3; the orchestrator may brief S3.15–S3.19 as a second S3 run after S3.1–S3.13 are green (same owns, sequential, no overlap); progress checklist per step in `PROGRESS.md` |
| R22 | `completed_on` drifting from the status category (BR-80) | single `setStatus` service (X71); status delete applies `completionTransition` per task; DONE category flips blocked while used (M3-D27); invariant query after every int test |
| R23 | Two concurrent blocker adds closing a cycle | per-project advisory lock in `addTaskBlocker` + concurrency test (S2.15) |
| R24 | `/api/tasks` slow with 20 k tasks (§9) | visibility in SQL, `tasks_status_id_idx`, keyset pagination 200 (X75); perf smoke (§7.4) |
| R25 | Board drag (`useDraggable`/`useDroppable`) not exercised in r4 | [likely]; small drag surface, handle-only listeners; `S` menu as the keyboard path; e2e E17/E20 cover drag |
| R26 | Golden data has no POS-only worker for AC-616 | e2e actor Peter + world `outsider` masking (M3-D34) |
| R27 | `z.stringbool` may be missing in the pinned Zod 4 | S0.4 test; fallback `z.enum(['0','1','true','false']).transform(...)` |
| R-PERM | PLAN §4.4's example row labels task creation `PERM-13`; in §3.2 order it is **PERM-11** (r7 F-15) | rows here use PERM-11/13/14; fix the PLAN example (blueprint gap) |
| R-AUTHZ | PLAN §3.4.4 has no multi-id helpers | `requireTasks` / `requireAssignments` added in S0.6 (blueprint gap, recorded) |

---

## 10. Close-out

**`PROGRESS.md` updates.**
- Status table: M3 ✅ (date), "Milestone ปัจจุบัน" → M4.
- Decisions: rows for X03, X04, X07, X11–X13, X15, X16, X18–X22, X33, X48–X50, X53, X62, X70–X75, X79, X80, X82–X84, X86, X87, X90, X91, X96 (one line each, as in §3.1) and M3-D1 … M3-D43 (§3.2).
- Deviations: none.
- Known issues / TODO: ⛔ badge on grid task rows → M6 (X76); person-page tasks tab → M9 (X77); embed blocks → M10 (X78); board milestone filter/card field + `TaskCard.milestoneId` → M8 (X21, M3-D37); AC-203 grid label → M6; AC-603 plans clause → M6 (extend `tasks.int.test.ts › AC-603` and e2e E3); BR-52 toast numbers → M6; FR-1009 buckets + final sidebar count → M9; milestone field/grouping/bulk link → M8; task-list virtualization deferred (M3-D16, check in M12 perf); `seed:demo` nested-task shape (r8 D3, X69) → M12; forward hooks for later plans (M3-D39–D42): `repo.tasks.listLiveWithBlockerCounts` + `repo.assignments` namespace (M6), `SetTaskStatusResult.released` (M6), `invalidateTasks` + `qk.projectMilestones` and the `TaskDTO`/`TaskCard` exact-key tests (M8), `TeamTasks` `syncUrl` / `fixedUserId` and `NavBadge` `'workloadOver'` (M9).

**Commit** (orchestrator, after G4):
```text
feat(m3): task outliner, statuses, blockers, board, team tasks, batch restore

Delivers FR-601–611, FR-613, FR-614, FR-620–628, FR-640–645, FR-660–666
(milestone parts → M8, grid badge → M6, person tab → M9), AC-601–603,
AC-611–616, AC-203 (picker), BR-30–33, BR-35/36, BR-60, BR-80–87,
FR-404/BR-61 count, §7.5 restore by batch, §7.8 task APIs, §8.6 list
shortcuts, N, S and ?, /my basic, /tasks, FR-409 progress, seed-golden
statuses + tasks + assignments.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
(use the attribution trailer the session requires). Then `git tag m3`.


